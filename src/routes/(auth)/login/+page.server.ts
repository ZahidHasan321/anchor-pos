import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
	verifyPassword,
	generateSessionToken,
	createSession,
	setSessionTokenCookie
} from '$lib/server/auth';
import { logAuditEvent } from '$lib/server/audit';
import { getDefaultRedirect } from '$lib/server/permissions';

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

		if (!db) {
			return fail(500, { error: 'Database is offline or not configured. Cannot login.', username });
		}

		// 1. Fetch User
		const userRows = await db.select().from(users).where(eq(users.username, username)).limit(1);
		const user = userRows[0];

		// 2. Verify
		const genericError = 'Invalid username or password';

		if (!user) {
			return fail(400, { error: genericError, username });
		}

		if (!user.isActive) {
			return fail(400, { error: 'Your account has been deactivated. Contact admin.', username });
		}

		const validPassword = await verifyPassword(password, user.passwordHash);
		if (!validPassword) {
			return fail(400, { error: genericError, username });
		}

		// 3. Success - Create session
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

		const redirectUrl = await getDefaultRedirect(user.role);

		// If it's a cross-origin request (Electron), return JSON instead of 302
		const origin = event.request.headers.get('origin');
		if (origin && (origin.startsWith('http://localhost') || origin.startsWith('app://'))) {
			return { success: true, redirect: redirectUrl };
		}

		redirect(302, redirectUrl);
	}
};
