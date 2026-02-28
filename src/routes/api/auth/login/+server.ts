import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { username, password } = await request.json();

	if (!username || !password) {
		throw error(400, 'Username and password are required');
	}

	if (!db) {
		throw error(503, 'Database unavailable on server');
	}

	// 1. Fetch User
	const userRows = await db.select().from(users).where(eq(users.username, username)).limit(1);
	const user = userRows[0];

	if (!user || !user.isActive) {
		throw error(401, 'Invalid credentials or inactive account');
	}

	// 2. Verify Password
	const validPassword = await verifyPassword(password, user.passwordHash);
	if (!validPassword) {
		throw error(401, 'Invalid credentials');
	}

	// 3. Return user data (excluding password hash)
	const { passwordHash, ...safeUser } = user;
	return json({ user: safeUser });
};
