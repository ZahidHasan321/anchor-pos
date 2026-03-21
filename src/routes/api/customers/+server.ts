import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { customers } from '$lib/server/db/schema';
import { sql } from 'drizzle-orm';
import { fuzzyMatch } from '$lib/server/search';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const search = url.searchParams.get('search') || '';
	if (search.length < 2 || !db) {
		return json({ items: [] });
	}

	const items = await db
		.select()
		.from(customers)
		.where(
			sql`(
				${customers.name} ILIKE ${'%' + search + '%'}
				OR similarity(${customers.name}, ${search}) > 0.15
				OR ${customers.phone} ILIKE ${'%' + search + '%'}
			)`
		)
		.orderBy(sql`similarity(${customers.name}, ${search}) DESC`)
		.limit(20);

	return json({ items });
};
