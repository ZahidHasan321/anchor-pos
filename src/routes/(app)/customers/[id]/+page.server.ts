import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { customers, orders } from '$lib/server/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const customer = db.select().from(customers).where(eq(customers.id, params.id)).get();

	if (!customer) {
		redirect(302, '/customers');
	}

	const pageParam = parseInt(url.searchParams.get('page') ?? '1');
	const perPage = 10;
	const currentPage = Math.max(1, pageParam);
	const offset = (currentPage - 1) * perPage;

	// Total completed orders count (for stats)
	const countResult = db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.where(sql`customer_id = ${params.id} AND status = 'completed'`)
		.get();
	const totalOrders = countResult?.count ?? 0;

	// Total order count for pagination (all statuses)
	const allCountResult = db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.where(eq(orders.customerId, params.id))
		.get();
	const totalPages = Math.ceil((allCountResult?.count ?? 0) / perPage);

	// Total spent (completed orders only)
	const spentResult = db
		.select({ total: sql<number>`COALESCE(SUM(total_amount), 0)` })
		.from(orders)
		.where(sql`customer_id = ${params.id} AND status = 'completed'`)
		.get();
	const totalSpent = spentResult?.total ?? 0;

	// Paginated orders (all statuses for history visibility)
	const customerOrders = db
		.select()
		.from(orders)
		.where(eq(orders.customerId, params.id))
		.orderBy(desc(orders.createdAt))
		.limit(perPage)
		.offset(offset)
		.all();

	return {
		customer,
		orders: customerOrders,
		totalSpent,
		totalOrders,
		pagination: {
			currentPage,
			totalPages,
			totalOrders: allCountResult?.count ?? 0,
			perPage
		}
	};
};

export const actions: Actions = {
	edit: async ({ request, params, locals }) => {
		if (!locals.user) {
			return fail(403, { error: 'Unauthorized' });
		}

		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const phone = (data.get('phone') as string)?.trim() || null;
		const email = (data.get('email') as string)?.trim() || null;

		if (!name) {
			return fail(400, { error: 'Name is required' });
		}

		try {
			db.update(customers).set({ name, phone, email }).where(eq(customers.id, params.id)).run();
		} catch (e) {
			console.error('Failed to update customer:', e);
			return fail(500, { error: 'Database error' });
		}

		return { success: true };
	}
};
