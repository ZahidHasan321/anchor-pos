import type { Handle, HandleServerError } from '@sveltejs/kit';
import { validateSessionToken } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth';
import { generateId } from '$lib/utils';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

// 0. Bootstrap Admin User (Runs once on first load)
let isBootstrapped = false;
async function bootstrapAdmin() {
	if (isBootstrapped) return;
	const username = env.ADMIN_USERNAME || 'admin';
	const password = env.ADMIN_PASSWORD;

	if (!password) return;

	try {
		const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
		if (existing.length === 0) {
			console.log(`[Bootstrap] Creating admin user: ${username}`);
			await db.insert(users).values({
				id: generateId(),
				username,
				passwordHash: await hashPassword(password),
				role: 'admin',
				name: 'System Admin',
				isActive: true
			});
		}
		isBootstrapped = true;
	} catch (e) {
		console.error('[Bootstrap] Failed to check/create admin user:', e);
	}
}

export const handleError: HandleServerError = ({ error, event }) => {
	// Log the full error for internal debugging
	console.error(`[${new Date().toISOString()}] Server error at ${event.url.pathname}:`, error);

	const message = error instanceof Error ? error.message : String(error);

	// Detect database connection errors (common when offline with remote DB)
	if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT') || message.includes('database connection failed')) {
		return {
			message: 'The service is temporarily unavailable. Please try again later.',
			code: 'SERVICE_UNAVAILABLE'
		};
	}

	return {
		message: 'An unexpected server error occurred.',
		code: 'INTERNAL_ERROR'
	};
};

export const handle: Handle = async ({ event, resolve }) => {
	await bootstrapAdmin();
	const token = event.cookies.get('session');

	if (!token) {
		event.locals.user = null;
		event.locals.session = null;
	} else {
		const { session, user } = await validateSessionToken(token);
		event.locals.session = session;
		// Prune user data for locals
		event.locals.user = user ? {
			id: user.id,
			name: user.name,
			username: user.username,
			role: user.role,
			theme: user.theme,
			imageUrl: user.imageUrl,
			email: user.email,
			phone: user.phone
		} : null;
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
