import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { customers, orders } from '$lib/server/db/schema';
import { eq, sql, desc, and } from 'drizzle-orm';
import { generateId } from '$lib/utils';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const pageParam = parseInt(url.searchParams.get('page') ?? '1');
	const perPage = 20;
	const currentPage = Math.max(1, pageParam);
	const offset = (currentPage - 1) * perPage;
	const search = url.searchParams.get('q') ?? '';
	const isElectron = process.env.BUILD_TARGET === 'electron';

	const conditions: any[] = [];
	if (search) {
		conditions.push(
			sql`(${customers.name} ILIKE ${'%' + search + '%'} OR ${customers.phone} ILIKE ${'%' + search + '%'})`
		);
	}
	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	return {
		search,
		isElectron,
		// Stream the data
		streamed: (async () => {
			if (isElectron) {
				return {
					customers: [],
					pagination: { currentPage: 1, totalPages: 1, total: 0, perPage }
				};
			}

			if (!db)
				return {
					customers: [],
					pagination: { currentPage: 1, totalPages: 1, total: 0, perPage }
				};
			const [countResult, customerList] = await Promise.all([
				db
					.select({ count: sql<number>`count(*)` })
					.from(customers)
					.where(whereClause),
				db
					.select({
						id: customers.id,
						name: customers.name,
						phone: customers.phone,
						email: customers.email,
						order_count:
							sql<number>`(SELECT COUNT(*) FROM ${orders} WHERE ${orders.customerId} = ${customers.id} AND ${orders.status} = 'completed')`.as(
								'order_count'
							),
						total_spent:
							sql<number>`COALESCE((SELECT SUM(${orders.totalAmount}) FROM ${orders} WHERE ${orders.customerId} = ${customers.id} AND ${orders.status} = 'completed'), 0)`.as(
								'total_spent'
							),
						last_order_date:
							sql<Date | null>`(SELECT MAX(${orders.createdAt}) FROM ${orders} WHERE ${orders.customerId} = ${customers.id} AND ${orders.status} = 'completed')`.as(
								'last_order_date'
							)
					})
					.from(customers)
					.where(whereClause)
					.orderBy(desc(sql`total_spent`))
					.limit(perPage)
					.offset(offset)
			]);

			const total = countResult[0]?.count ?? 0;

			interface CustomerRow {
				id: string;
				name: string;
				phone: string | null;
				email: string | null;
				order_count: number;
				total_spent: number;
				last_order_date: Date | null;
			}

			const mappedCustomers = (customerList as unknown as CustomerRow[]).map((c) => ({
				...c,
				orderCount: c.order_count,
				totalSpent: c.total_spent,
				lastOrderDate: c.last_order_date
			}));

			return {
				customers: mappedCustomers,
				pagination: {
					currentPage,
					totalPages: Math.ceil(total / perPage),
					total,
					perPage
				}
			};
		})()
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const phone = (data.get('phone') as string)?.trim() || null;
		const email = (data.get('email') as string)?.trim() || null;
		if (!name) return fail(400, { error: 'Name is required' });
		try {
			await db.insert(customers).values({ id: generateId(), name, phone, email });
		} catch (e) {
			return fail(500, { error: 'Database error' });
		}
		return { success: true };
	},
	delete: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403);
		const data = await request.formData();
		const id = data.get('id') as string;
		try {
			await db.delete(customers).where(eq(customers.id, id));
		} catch (e) {
			return fail(500, { error: 'Database error' });
		}
		return { success: true };
	}
};
