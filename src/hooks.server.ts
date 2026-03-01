import type { Handle, HandleServerError } from '@sveltejs/kit';
import { validateSessionToken } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth';
import { generateId } from '$lib/utils';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { jwtVerify, importJWK } from 'jose';

const IS_ELECTRON = process.env.BUILD_TARGET === 'electron';

// Cache for public key used in offline JWT validation
let _publicKey: any = null;
async function getPublicKey() {
	if (_publicKey) return _publicKey;
	const jwkRaw = process.env.POWERSYNC_PUBLIC_KEY;
	if (!jwkRaw) return null;
	try {
		const jwk = JSON.parse(jwkRaw);
		_publicKey = await importJWK(jwk, 'RS256');
		return _publicKey;
	} catch (e) {
		console.error('[hooks] Failed to parse POWERSYNC_PUBLIC_KEY:', e);
		return null;
	}
}

// 0. Bootstrap Admin User (Runs once on first load)
let isBootstrapped = false;
let tokenExpiresAt = 0;
async function bootstrapAdmin() {
	if (isBootstrapped || IS_ELECTRON) return;
	const username = env.ADMIN_USERNAME || 'admin';
	const password = env.ADMIN_PASSWORD;

	if (!password || !db) return;

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
	console.error(`[${new Date().toISOString()}] Server error at ${event.url.pathname}:`, error);
	const message = error instanceof Error ? error.message : String(error);

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
	} else if (IS_ELECTRON) {
		// OFFLINE-SAFE JWT VALIDATION FOR ELECTRON
		try {
			const publicKey = await getPublicKey();
			if (!publicKey) {
				console.error('[hooks] No public key available for JWT validation');
				event.locals.user = null;
				event.locals.session = null;
			} else {
				const { payload } = await jwtVerify(token, publicKey, {
					audience: 'pos-electron',
				});

				event.locals.user = {
					id: payload.sub!,
					username: payload.username as string,
					role: payload.role as any,
					name: payload.name as string,
					email: payload.email as string || null,
					phone: payload.phone as string || null,
					imageUrl: payload.image_url as string || null,
					theme: payload.theme as any || 'system'
				};
				event.locals.session = {
					id: 'jwt-session',
					userId: payload.sub!,
					expiresAt: new Date((payload.exp || 0) * 1000)
				};
			}
		} catch (e) {
			console.warn('[hooks] JWT validation failed:', e);
			event.locals.user = null;
			event.locals.session = null;
			// Clear invalid cookie
			event.cookies.delete('session', { path: '/' });
		}
	} else {
		// STANDARD DB SESSION VALIDATION FOR WEB
		const { session, user } = await validateSessionToken(token);
		event.locals.session = session;
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

	// Connect PowerSync if user is authenticated (Electron only)
	if (IS_ELECTRON && event.locals.user && Date.now() > tokenExpiresAt - 60_000) {
		try {
			const { connectPowerSync } = await import('$lib/powersync/init.js');
			const { fetchRemotePowerSyncToken } = await import('$lib/server/powersync-auth');
			
			const token = await fetchRemotePowerSyncToken(event.locals.user.id);
			if (token) {
				await connectPowerSync(token);
				tokenExpiresAt = Date.now() + 55 * 60 * 1000;
			}
		} catch (e) {
			console.warn('[hooks] PowerSync init failed:', e);
		}
	}

	// Global Route Guard
	const isAuthRoute = event.url.pathname.startsWith('/login');
	const isApiRoute = event.url.pathname.startsWith('/api');
	const isRemoteAuthRoute = event.url.pathname.startsWith('/api/auth/remote-login') || event.url.pathname.startsWith('/api/auth/remote-powersync-token');
	const isWellKnown = event.url.pathname.startsWith('/.well-known');

	if (!event.locals.user && !isAuthRoute && !isRemoteAuthRoute && !isWellKnown) {
		if (isApiRoute) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		if (event.url.pathname !== '/') {
			return new Response(null, {
				status: 302,
				headers: { Location: '/login' }
			});
		}
	}

	// CORS & Security Headers
	const origin = event.request.headers.get('origin');
	const isLocalOrigin = origin && (origin.startsWith('http://localhost') || origin.startsWith('app://'));

	if (event.request.method === 'OPTIONS' && isLocalOrigin) {
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': origin,
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, x-app-secret',
				'Access-Control-Allow-Credentials': 'true'
			}
		});
	}

	const response = await resolve(event);

	if (isLocalOrigin) {
		response.headers.set('Access-Control-Allow-Origin', origin);
		response.headers.set('Access-Control-Allow-Credentials', 'true');
	}

	response.headers.set(
		'Content-Security-Policy',
		"default-src 'self'; " +
			"script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; " +
			"style-src 'self' 'unsafe-inline'; " +
			"img-src 'self' data: blob: https:; " +
			"font-src 'self' data:; " +
			"connect-src 'self' https://* wss://* http://localhost:* http://127.0.0.1:* ws://*; " +
			"worker-src 'self' blob:; " +
			"frame-ancestors 'none'; " +
			'upgrade-insecure-requests;'
	);

	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Robots-Tag', 'noindex, nofollow');

	return response;
};
