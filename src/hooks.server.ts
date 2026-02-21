import type { Handle } from '@sveltejs/kit';
import { validateSessionToken } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('session');

	if (!token) {
		event.locals.user = null;
		event.locals.session = null;
	} else {
		const { session, user } = await validateSessionToken(token);
		event.locals.user = user;
		event.locals.session = session;
	}

	// 1. Global Route Guard (Defense in Depth)
	const isAuthRoute = event.url.pathname.startsWith('/login');
	const isApiRoute = event.url.pathname.startsWith('/api');

	// If not logged in and trying to access anything but login
	if (!event.locals.user && !isAuthRoute) {
		if (isApiRoute) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		// Allow root to pass (it redirects in +page.server.ts)
		if (event.url.pathname !== '/') {
			return new Response(null, {
				status: 302,
				headers: { Location: '/login' }
			});
		}
	}

	// 2. Security Headers (Industry Standard)
	const response = await resolve(event);

	// Content Security Policy (Strict for Internal App)
	// We allow 'unsafe-inline' for styles because many Svelte components and Tailwind need it
	response.headers.set(
		'Content-Security-Policy',
		"default-src 'self'; " +
			"script-src 'self' 'unsafe-inline'; " +
			"style-src 'self' 'unsafe-inline'; " +
			"img-src 'self' data: blob:; " +
			"font-src 'self' data:; " +
			"connect-src 'self'; " +
			"frame-ancestors 'none'; " +
			'upgrade-insecure-requests;'
	);

	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

	// Privacy for Internal App
	response.headers.set('X-Robots-Tag', 'noindex, nofollow');

	return response;
};
