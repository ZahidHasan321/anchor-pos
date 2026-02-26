import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { customers, orders } from '$lib/server/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	if (!db) {
		redirect(302, '/customers');
	}

	const customerRows = await db
		.select()
		.from(customers)
		.where(eq(customers.id, params.id))
		.limit(1);
	const customer = customerRows[0];

	if (!customer) {
		redirect(302, '/customers');
	}

	const pageParam = parseInt(url.searchParams.get('page') ?? '1');
	const perPage = 10;
	const currentPage = Math.max(1, pageParam);
	const offset = (currentPage - 1) * perPage;

	// Total completed orders count (for stats)
	const countResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.where(and(eq(orders.customerId, params.id), eq(orders.status, 'completed')));

	const totalOrders = countResult[0]?.count ?? 0;

	// Total order count for pagination (all statuses)
	const allCountResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.where(eq(orders.customerId, params.id));

	const allCount = allCountResult[0]?.count ?? 0;
	const totalPages = Math.ceil(allCount / perPage);

	// Total spent (completed orders only)
	const spentResult = await db
		.select({ total: sql<number>`COALESCE(SUM(total_amount), 0)` })
		.from(orders)
		.where(and(eq(orders.customerId, params.id), eq(orders.status, 'completed')));

	const totalSpent = spentResult[0]?.total ?? 0;

	// Paginated orders (all statuses for history visibility)
	const customerOrders = await db
		.select()
		.from(orders)
		.where(eq(orders.customerId, params.id))
		.orderBy(desc(orders.createdAt))
		.limit(perPage)
		.offset(offset);

	return {
		customer,
		orders: customerOrders,
		totalSpent,
		totalOrders,
		pagination: {
			currentPage,
			totalPages,
			totalOrders: allCount,
			perPage
		}
	};
};

export const actions: Actions = {
	edit: async ({ request, params, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}
		if (!db) return fail(503, { error: 'Database connection unavailable' });

		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const phone = (data.get('phone') as string)?.trim() || null;
		const email = (data.get('email') as string)?.trim() || null;

		if (!name) {
			return fail(400, { error: 'Name is required' });
		}

		try {
			await db.update(customers).set({ name, phone, email }).where(eq(customers.id, params.id));
		} catch (e) {
			console.error('Failed to update customer:', e);
			return fail(500, { error: 'Database error' });
		}

		return { success: true };
	}
};
