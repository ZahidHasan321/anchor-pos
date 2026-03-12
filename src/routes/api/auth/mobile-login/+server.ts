/**
 * Capacitor mobile login endpoint.
 * Called directly from the Android app (https://localhost origin) via fetch with credentials: 'include'.
 * Creates a standard DB session and sets a SameSite=None cookie so it's sent cross-origin.
 * Returns user info JSON so the app can store it in localStorage for the client-side route guard.
 */
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, generateSessionToken, createSession, setSessionTokenCookie } from '$lib/server/auth';
import { rateLimit, getClientIp } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { request } = event;

	// Only allow from Capacitor's https://localhost origin
	const origin = request.headers.get('origin') ?? '';
	if (origin !== 'https://localhost') {
		throw error(403, 'Forbidden');
	}

	// Rate limit: 5 attempts per minute per IP
	const ip = getClientIp(request);
	const limit = rateLimit(`mobile-login:${ip}`, { maxRequests: 5, windowMs: 60_000 });
	if (!limit.allowed) {
		throw error(429, 'Too many login attempts. Please try again later.');
	}

	if (!db) {
		throw error(503, 'Database unavailable');
	}

	const { username, password } = await request.json();
	if (!username || !password) {
		throw error(400, 'Username and password required');
	}

	const userRows = await db.select().from(users).where(eq(users.username, username)).limit(1);
	const user = userRows[0];

	if (!user || !(await verifyPassword(password, user.passwordHash))) {
		throw error(401, 'Invalid username or password');
	}

	if (!user.isActive) {
		throw error(403, 'Account disabled');
	}

	const token = generateSessionToken();
	const session = await createSession(token, user.id);

	// setSessionTokenCookie detects the https://localhost origin and sets SameSite=None
	// so the cookie is sent back on cross-origin requests from Capacitor.
	setSessionTokenCookie(event, token, session.expiresAt);

	return json({
		user: {
			id: user.id,
			username: user.username,
			name: user.name,
			role: user.role,
			email: user.email ?? null,
			phone: user.phone ?? null,
			imageUrl: user.imageUrl ?? null,
			theme: user.theme ?? 'system',
			expiresAt: session.expiresAt.toISOString()
		}
	});
};
