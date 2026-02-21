import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { invalidateSession, deleteSessionTokenCookie } from '$lib/server/auth';

export const actions: Actions = {
	default: async (event) => {
		if (event.locals.session) {
			await invalidateSession(event.locals.session.id);
		}
		deleteSessionTokenCookie(event);
		redirect(302, '/login');
	}
};
