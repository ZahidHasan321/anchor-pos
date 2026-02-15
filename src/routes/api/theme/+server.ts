import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { theme } = await request.json();
	
	if (!['light', 'dark', 'system'].includes(theme)) {
		return json({ error: 'Invalid theme' }, { status: 400 });
	}

	// Save to DB
	db.update(users).set({ theme }).where(eq(users.id, locals.user.id)).run();
	
	// Save to cookie
	cookies.set('theme', theme, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365, // 1 year
		httpOnly: false, // Allow client-side JS to read it if needed
		sameSite: 'lax'
	});
	
	return json({ success: true });
};
