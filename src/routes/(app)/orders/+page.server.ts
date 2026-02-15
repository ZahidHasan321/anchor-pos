import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { orders, customers, users } from '$lib/server/db/schema';
import { eq, and, gte, lte, desc, sql, like, or } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const pageParam = parseInt(url.searchParams.get('page') ?? '1');
	const perPage = 20;
	const currentPage = Math.max(1, pageParam);
	const offset = (currentPage - 1) * perPage;

	const dateFrom = url.searchParams.get('from') ?? '';
	const dateTo = url.searchParams.get('to') ?? '';
	const statusFilter = url.searchParams.get('status') ?? '';
	const search = url.searchParams.get('search') ?? '';

	// Build conditions
	const conditions: any[] = [];

	if (dateFrom) {
		const from = new Date(dateFrom + 'T00:00:00');
		conditions.push(gte(orders.createdAt, from));
	}

	if (dateTo) {
		const to = new Date(dateTo + 'T23:59:59.999');
		conditions.push(lte(orders.createdAt, to));
	}

	if (statusFilter && ['completed', 'refunded', 'void'].includes(statusFilter)) {
		conditions.push(eq(orders.status, statusFilter as 'completed' | 'refunded' | 'void'));
	}

	if (search) {
		conditions.push(
			or(
				eq(orders.id, search),
				like(orders.id, `%${search}%`),
				like(sql`CAST(${orders.orderNumber} AS TEXT)`, `%${search}%`),
				like(customers.name, `%${search}%`),
				like(customers.phone, `%${search}%`)
			)
		);
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	// Get total count
	const countResult = db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.leftJoin(customers, eq(orders.customerId, customers.id))
		.where(whereClause)
		.get();
	const totalOrders = countResult?.count ?? 0;
	const totalPages = Math.ceil(totalOrders / perPage);

	// Get paginated orders
	const allOrders = db
		.select({
			id: orders.id,
			orderNumber: orders.orderNumber,
			totalAmount: orders.totalAmount,
			status: orders.status,
			paymentMethod: orders.paymentMethod,
			createdAt: orders.createdAt,
			customerId: orders.customerId,
			customerName: customers.name,
			customerPhone: customers.phone,
			userName: users.name
		})
		.from(orders)
		.leftJoin(customers, eq(orders.customerId, customers.id))
		.leftJoin(users, eq(orders.userId, users.id))
		.where(whereClause)
		.orderBy(desc(orders.createdAt))
		.limit(perPage)
		.offset(offset)
		.all();

	return {
		orders: allOrders,
		pagination: {
			currentPage,
			totalPages,
			totalOrders,
			perPage
		},
		filters: {
			from: dateFrom,
			to: dateTo,
			status: statusFilter,
			search
		}
	};
};
