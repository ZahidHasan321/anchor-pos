import { json } from '@sveltejs/kit';
import { invalidateSession, deleteSessionTokenCookie } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	if (event.locals.session) {
		await invalidateSession(event.locals.session.id).catch(() => {});
	}
	deleteSessionTokenCookie(event);
	return json({ ok: true });
};
