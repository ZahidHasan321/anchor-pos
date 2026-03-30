import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { orders, customers, users } from '$lib/server/db/schema';
import { eq, and, gte, lt, desc, sql, or } from 'drizzle-orm';
import env from '$lib/server/env';

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
	const isNative = env.IS_NATIVE;

	const conditions: any[] = [];
	if (dateFrom) conditions.push(gte(orders.createdAt, new Date(dateFrom + 'T00:00:00+06:00')));
	if (dateTo) conditions.push(lt(orders.createdAt, new Date(new Date(dateTo + 'T00:00:00+06:00').getTime() + 86400000)));
	if (statusFilter) conditions.push(eq(orders.status, statusFilter as any));
	if (search) {
		conditions.push(
			or(
				eq(orders.id, search),
				sql`CAST(${orders.orderNumber} AS TEXT) LIKE ${'%' + search + '%'}`,
				sql`${customers.name} ILIKE ${'%' + search + '%'}`,
				sql`similarity(${customers.name}, ${search}) > 0.15`,
				sql`${customers.phone} ILIKE ${'%' + search + '%'}`
			)
		);
	}
	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	return {
		filters: { from: dateFrom, to: dateTo, status: statusFilter, search },
		isNative,
		streamed: (async () => {
			if (isNative) {
				return {
					orders: [],
					pagination: { currentPage: 1, totalPages: 1, totalOrders: 0, perPage }
				};
			}

			if (!db)
				return {
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
