import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { customers, orders } from '$lib/server/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import env from '$lib/server/env';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const isNative = env.IS_NATIVE;
	if (isNative || !db) {
		return {
			customer: null,
			orders: [],
			totalSpent: 0,
			totalOrders: 0,
			pagination: { currentPage: 1, totalPages: 1, totalOrders: 0, perPage: 10 },
			isNative,
			customerId: params.id
		};
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

	// Single aggregation query for all stats (replaces 3 separate queries)
	const [statsResult, customerOrders] = await Promise.all([
		db
			.select({
				allCount: sql<number>`count(*)`,
				completedCount: sql<number>`COUNT(CASE WHEN ${orders.status} = 'completed' THEN 1 END)`,
				totalSpent: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} = 'completed' THEN ${orders.totalAmount} ELSE 0 END), 0)`
			})
			.from(orders)
			.where(eq(orders.customerId, params.id)),
		db
			.select()
			.from(orders)
			.where(eq(orders.customerId, params.id))
			.orderBy(desc(orders.createdAt))
			.limit(perPage)
			.offset(offset)
	]);

	const stats = statsResult[0];
	const totalOrders = stats?.completedCount ?? 0;
	const allCount = stats?.allCount ?? 0;
	const totalSpent = stats?.totalSpent ?? 0;
	const totalPages = Math.ceil(allCount / perPage);

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
		},
		isNative: false,
		customerId: params.id
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
