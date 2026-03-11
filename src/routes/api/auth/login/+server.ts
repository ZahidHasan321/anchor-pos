import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '$lib/server/auth';
import { rateLimit, getClientIp } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

const ALLOWED_ORIGINS = [
	'https://anchorshop.cloud',
	'app://-'
];

function getCorsHeaders(request: Request): Record<string, string> {
	const origin = request.headers.get('origin') || '';
	const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
		origin.startsWith('http://localhost') ||
		origin.startsWith('http://127.0.0.1');
	return {
		'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type'
	};
}

export const OPTIONS: RequestHandler = async ({ request }) => {
	return new Response(null, { headers: getCorsHeaders(request) });
};

export const POST: RequestHandler = async ({ request }) => {
	const headers = getCorsHeaders(request);

	// Rate limit: 5 login attempts per minute per IP
	const ip = getClientIp(request);
	const limit = rateLimit(`login:${ip}`, { maxRequests: 5, windowMs: 60_000 });
	if (!limit.allowed) {
		return json({ error: 'Too many login attempts. Please try again later.' }, {
			status: 429,
			headers: { ...headers, 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) }
		});
	}

	try {
		const { username, password } = await request.json();

		if (!username || !password) {
			return json({ error: 'Username and password are required' }, { status: 400, headers });
		}

		if (!db) {
			return json({ error: 'Database unavailable on server' }, { status: 503, headers });
		}

		// 1. Fetch User
		const userRows = await db.select().from(users).where(eq(users.username, username)).limit(1);
		const user = userRows[0];

		if (!user || !user.isActive) {
			return json({ error: 'Invalid credentials or inactive account' }, { status: 401, headers });
		}

		// 2. Verify Password
		const validPassword = await verifyPassword(password, user.passwordHash);
		if (!validPassword) {
			return json({ error: 'Invalid credentials' }, { status: 401, headers });
		}

		// 3. Return user data (excluding password hash)
		const { passwordHash, ...safeUser } = user;
		return json({ user: safeUser }, { headers });
	} catch (e: any) {
		console.error('[API Login Error]', e);
		return json({ error: 'Internal server error' }, { status: 500, headers });
	}
};
