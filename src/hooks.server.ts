import type { Handle } from '@sveltejs/kit';
import { validateSessionToken } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('session');

	if (!token) {
		event.locals.user = null;
		event.locals.session = null;
	} else {
		const { session, user } = validateSessionToken(token);
		event.locals.user = user;
		event.locals.session = session;

		// Sync cookie if missing but user has preference
		if (user?.theme && !event.cookies.get('theme')) {
			event.cookies.set('theme', user.theme, {
				path: '/',
				maxAge: 60 * 60 * 24 * 365,
				httpOnly: false,
				sameSite: 'lax'
			});
		}
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			// Inject theme logic
			// Priority: Cookie -> User Preference -> System
			const cookieTheme = event.cookies.get('theme');
			const userTheme = event.locals.user?.theme;
			const theme = cookieTheme || userTheme || 'system';

			// Prevent white flash — use the exact OKLCH values from layout.css
			const darkBg = 'oklch(0.16 0.02 260)';
			const lightBg = 'oklch(0.98 0.002 250)';

			// Render-blocking <style> sets background BEFORE first paint
			let bgStyle = '';
			if (theme === 'dark') {
				bgStyle = `<style id="theme-init">html,body{background-color:${darkBg}!important;color-scheme:dark}</style>`;
			} else if (theme === 'light') {
				bgStyle = `<style id="theme-init">html,body{background-color:${lightBg}!important;color-scheme:light}</style>`;
			} else {
				bgStyle = `<style id="theme-init">html,body{background-color:${lightBg}!important;color-scheme:light}@media(prefers-color-scheme:dark){html,body{background-color:${darkBg}!important;color-scheme:dark}}</style>`;
			}

			// Script to add .dark class for Tailwind
			const themeScript = `<script>(function(){var t=${JSON.stringify(theme)},d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(t==='system'&&d))document.documentElement.classList.add('dark')})()</script>`;

			// Inject into <head> — try multiple anchors since %sveltekit.head% may already be resolved
			let modifiedHtml = html;

			if (modifiedHtml.includes('%sveltekit.head%')) {
				modifiedHtml = modifiedHtml.replace(
					'%sveltekit.head%',
					`${bgStyle}${themeScript}%sveltekit.head%`
				);
			} else if (modifiedHtml.includes('</head>')) {
				modifiedHtml = modifiedHtml.replace('</head>', `${bgStyle}${themeScript}</head>`);
			}

			// Inject class on <html> for explicit dark mode
			if (theme === 'dark') {
				modifiedHtml = modifiedHtml.replace('<html lang="en">', '<html lang="en" class="dark">');
			}

			return modifiedHtml;
		}
	});

	return response;
};
