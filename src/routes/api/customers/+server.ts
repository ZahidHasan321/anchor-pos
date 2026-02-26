import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { customers } from '$lib/server/db/schema';
import { or, like, ilike } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const search = url.searchParams.get('search') || '';
	if (search.length < 2) {
		return json({ items: [] });
	}

	const pattern = `%${search}%`;
	const items = await db
		.select()
		.from(customers)
		.where(
			or(
				ilike(customers.name, pattern),
				ilike(customers.phone, pattern)
			)
		)
		.limit(20);

	return json({ items });
};
