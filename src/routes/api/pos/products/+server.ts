import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { queryVariants } from '$lib/server/pos-query';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const search = url.searchParams.get('search') || '';
	const category = url.searchParams.get('category') || 'All';
	const offset = parseInt(url.searchParams.get('offset') || '0') || 0;

	const { items, hasMore } = await queryVariants(search, category, 50, offset);

	return json({ items, hasMore });
};
