import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: corsHeaders });
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { username, password } = await request.json();

		if (!username || !password) {
			return json({ error: 'Username and password are required' }, { status: 400, headers: corsHeaders });
		}

		if (!db) {
			return json({ error: 'Database unavailable on server' }, { status: 503, headers: corsHeaders });
		}

		// 1. Fetch User
		const userRows = await db.select().from(users).where(eq(users.username, username)).limit(1);
		const user = userRows[0];

		if (!user || !user.isActive) {
			return json({ error: 'Invalid credentials or inactive account' }, { status: 401, headers: corsHeaders });
		}

		// 2. Verify Password
		const validPassword = await verifyPassword(password, user.passwordHash);
		if (!validPassword) {
			return json({ error: 'Invalid credentials' }, { status: 401, headers: corsHeaders });
		}

		// 3. Return user data (excluding password hash)
		const { passwordHash, ...safeUser } = user;
		return json({ user: safeUser }, { headers: corsHeaders });
	} catch (e: any) {
		console.error('[API Login Error]', e);
		return json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
	}
};
