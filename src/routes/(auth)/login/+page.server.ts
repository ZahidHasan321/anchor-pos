import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users, loginAttempts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
	verifyPassword,
	generateSessionToken,
	createSession,
	setSessionTokenCookie
} from '$lib/server/auth';
import { logAuditEvent } from '$lib/server/audit';
import { getDefaultRedirect } from '$lib/server/permissions';
import { generateId } from '$lib/utils';

// Rate limit configuration
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(302, await getDefaultRedirect(locals.user.role));
	}
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const username = (data.get('username') as string)?.trim();
		const password = data.get('password') as string;

		if (!username || !password) {
			return fail(400, { error: 'Username and password are required', username });
		}

		// 1. Check Rate Limiting
		const clientIp = event.getClientAddress();
		// We track by both IP and Username for better security
		const identifier = `${clientIp}:${username}`;

		const attempts = await db
			.select()
			.from(loginAttempts)
			.where(eq(loginAttempts.identifier, identifier))
			.limit(1);

		if (attempts.length > 0) {
			const record = attempts[0];
			const now = Date.now();
			const timePassed = now - record.lastAttempt.getTime();

			if (record.attempts >= MAX_ATTEMPTS && timePassed < LOCKOUT_DURATION_MS) {
				const waitMinutes = Math.ceil((LOCKOUT_DURATION_MS - timePassed) / 60000);
				return fail(429, {
					error: `Too many failed attempts. Please try again in ${waitMinutes} minutes.`,
					username
				});
			}

			// Reset if enough time has passed
			if (timePassed >= LOCKOUT_DURATION_MS) {
				await db.delete(loginAttempts).where(eq(loginAttempts.id, record.id));
			}
		}

		// 2. Fetch User
		const userRows = await db.select().from(users).where(eq(users.username, username)).limit(1);
		const user = userRows[0];

		// 3. Verify
		// Note: We use a generic error message for both "user not found" and "wrong password"
		const genericError = 'Invalid username or password';

		if (!user) {
			await recordFailedAttempt(identifier);
			return fail(400, { error: genericError, username });
		}

		if (!user.isActive) {
			return fail(400, { error: 'Your account has been deactivated. Contact admin.', username });
		}

		const validPassword = await verifyPassword(password, user.passwordHash);
		if (!validPassword) {
			await recordFailedAttempt(identifier);
			return fail(400, { error: genericError, username });
		}

		// 4. Success - Clear attempts and create session
		await db.delete(loginAttempts).where(eq(loginAttempts.identifier, identifier));

		const token = generateSessionToken();
		const session = await createSession(token, user.id);
		setSessionTokenCookie(event, token, session.expiresAt);

		await logAuditEvent({
			userId: user.id,
			userName: user.name,
			action: 'LOGIN',
			entity: 'sessions',
			entityId: session.id,
			details: `User logged in: ${user.username}`
		});

		redirect(302, await getDefaultRedirect(user.role));
	}
};

async function recordFailedAttempt(identifier: string) {
	const existing = await db
		.select()
		.from(loginAttempts)
		.where(eq(loginAttempts.identifier, identifier))
		.limit(1);

	if (existing.length > 0) {
		await db
			.update(loginAttempts)
			.set({
				attempts: existing[0].attempts + 1,
				lastAttempt: new Date()
			})
			.where(eq(loginAttempts.id, existing[0].id));
	} else {
		await db.insert(loginAttempts).values({
			id: generateId(),
			identifier,
			attempts: 1,
			lastAttempt: new Date()
		});
	}
}
