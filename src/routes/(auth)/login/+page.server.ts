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
		const { request, cookies, fetch } = event;
		const data = await request.formData();
		const username = (data.get('username') as string)?.trim();
		const password = data.get('password') as string;

		if (!username || !password) {
			return fail(400, { error: 'Username and password required', username });
		}

		const isElectron = process.env.BUILD_TARGET === 'electron';

		if (isElectron) {
			// In Electron: proxy auth to the VPS, get a JWT back
			try {
				const vpsUrl = process.env.POWERSYNC_API_URL || 'https://anchorshop.cloud';
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 5000);

				const res = await fetch(`${vpsUrl}/api/auth/remote-login`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-app-secret': process.env.APP_SECRET_HEADER || 'auto-pos-secret-handshake-2026',
						'User-Agent': 'AutoPOS-Electron/1.0',
					},
					body: JSON.stringify({ username, password }),
					signal: controller.signal
				});

				clearTimeout(timeoutId);

				if (!res.ok) {
					const { error } = await res.json().catch(() => ({ error: 'Login failed' }));
					return fail(401, { error, username });
				}

				const { token, expiresAt } = await res.json();

				setSessionTokenCookie(event, token, new Date(expiresAt));

				// We need to decode the token just to get the role for redirect
				// This doesn't need signature verification here as we just got it from VPS
				const parts = token.split('.');
				const payload = JSON.parse(atob(parts[1]));

				throw redirect(303, await getDefaultRedirect(payload.role));
			} catch (e: any) {
				if (e.status === 303) throw e;
				console.error('[Login] Remote auth failed:', e);
				return fail(500, { error: 'Connection to authentication server failed. Are you online?', username });
			}
		}

		if (!db) {
			return fail(500, { error: 'Database is offline or not configured. Cannot login.', username });
		}

		// Web: Standard Drizzle-based auth
		const userRows = await db.select().from(users).where(eq(users.username, username)).limit(1);
		const user = userRows[0];

		if (!user || !await verifyPassword(password, user.passwordHash)) {
			return fail(401, { error: 'Invalid username or password', username });
		}

		if (!user.isActive) {
			return fail(403, { error: 'Account disabled', username });
		}

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

		throw redirect(303, await getDefaultRedirect(user.role));
	},
};
