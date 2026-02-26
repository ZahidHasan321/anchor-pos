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

	const conditions: any[] = [];
	if (dateFrom) conditions.push(gte(orders.createdAt, new Date(dateFrom + 'T00:00:00')));
	if (dateTo) conditions.push(lte(orders.createdAt, new Date(dateTo + 'T23:59:59.999')));
	if (statusFilter) conditions.push(eq(orders.status, statusFilter as any));
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

	return {
		filters: { from: dateFrom, to: dateTo, status: statusFilter, search },
		streamed: (async () => {
			if (!db) return {
				orders: [],
				pagination: {
					currentPage: 1,
					totalPages: 1,
					totalOrders: 0,
					perPage
				}
			};

			const [countResult, allOrders] = await Promise.all([
				db
					.select({ count: sql<number>`count(*)` })
					.from(orders)
					.leftJoin(customers, eq(orders.customerId, customers.id))
					.where(whereClause),
				db
					.select({
						id: orders.id,
						orderNumber: orders.orderNumber,
						totalAmount: orders.totalAmount,
						status: orders.status,
						paymentMethod: orders.paymentMethod,
						createdAt: orders.createdAt,
						customerName: customers.name,
						userName: users.name
					})
					.from(orders)
					.leftJoin(customers, eq(orders.customerId, customers.id))
					.leftJoin(users, eq(orders.userId, users.id))
					.where(whereClause)
					.orderBy(desc(orders.createdAt))
					.limit(perPage)
					.offset(offset)
			]);

			const totalOrders = countResult[0]?.count ?? 0;
			return {
				orders: allOrders,
				pagination: {
					currentPage,
					totalPages: Math.ceil(totalOrders / perPage),
					totalOrders,
					perPage
				}
			};
		})()
	};
};
