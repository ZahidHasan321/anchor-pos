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
	const isElectron = process.env.BUILD_TARGET === 'electron';

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
			if (isElectron) {
				const { getPowerSyncDb } = await import('$lib/powersync/db');
				const psDb = getPowerSyncDb();
				let baseQuery = `
					FROM orders o
					LEFT JOIN customers c ON o.customer_id = c.id
					LEFT JOIN users u ON o.user_id = u.id
					WHERE 1=1
				`;
				const params: any[] = [];

				if (dateFrom) {
					baseQuery += ` AND o.created_at >= ?`;
					params.push(dateFrom + 'T00:00:00');
				}
				if (dateTo) {
					baseQuery += ` AND o.created_at <= ?`;
					params.push(dateTo + 'T23:59:59.999');
				}
				if (statusFilter) {
					baseQuery += ` AND o.status = ?`;
					params.push(statusFilter);
				}
				if (search) {
					baseQuery += ` AND (o.id LIKE ? OR CAST(o.order_number AS TEXT) LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`;
					const p = `%${search}%`;
					params.push(p, p, p, p);
				}

				const [countResult, allOrders] = await Promise.all([
					psDb.get(`SELECT count(*) as count ${baseQuery}`, params),
					psDb.getAll(
						`SELECT 
							o.id,
							o.order_number as orderNumber,
							o.total_amount as totalAmount,
							o.status,
							o.payment_method as paymentMethod,
							o.created_at as createdAt,
							c.name as customerName,
							u.name as userName
						 ${baseQuery} 
						 ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
						[...params, perPage, offset]
					)
				]);

				const totalOrders = (countResult as any).count ?? 0;
				return {
					orders: allOrders,
					pagination: {
						currentPage,
						totalPages: Math.ceil(totalOrders / perPage),
						totalOrders,
						perPage
					}
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
