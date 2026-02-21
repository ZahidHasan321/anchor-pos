import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { theme } = await request.json();

	if (!['light', 'dark', 'system'].includes(theme)) {
		return json({ error: 'Invalid theme' }, { status: 400 });
	}

	// Save to DB (mode-watcher handles localStorage on the client)
	await db.update(users).set({ theme }).where(eq(users.id, locals.user.id));

	return json({ success: true });
};
