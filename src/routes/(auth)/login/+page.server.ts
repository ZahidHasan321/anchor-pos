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
		redirect(302, getDefaultRedirect(locals.user.role));
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

		const user = db.select().from(users).where(eq(users.username, username)).get();

		if (!user) {
			return fail(400, { error: 'Invalid username or password', username });
		}

		if (!user.isActive) {
			return fail(400, { error: 'Your account has been deactivated. Contact admin.', username });
		}

		if (!verifyPassword(password, user.passwordHash)) {
			return fail(400, { error: 'Invalid username or password', username });
		}

		const token = generateSessionToken();
		const session = createSession(token, user.id);
		setSessionTokenCookie(event, token, session.expiresAt);

		// Set theme cookie from DB
		if (user.theme) {
			event.cookies.set('theme', user.theme, {
				path: '/',
				maxAge: 60 * 60 * 24 * 365,
				httpOnly: false,
				sameSite: 'lax'
			});
		}

		logAuditEvent({
			userId: user.id,
			userName: user.name,
			action: 'LOGIN',
			entity: 'session',
			entityId: session.id,
			details: `User logged in: ${user.username}`
		});

		redirect(302, getDefaultRedirect(user.role));
	}
};
