import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { customers } from '$lib/server/db/schema';
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

	const conditions: any[] = [];
	if (search) {
		conditions.push(
			sql`(${customers.name} LIKE ${'%' + search + '%'} OR ${customers.phone} LIKE ${'%' + search + '%'})`
		);
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	// Get total count
	const countResult = db
		.select({ count: sql<number>`count(*)` })
		.from(customers)
		.where(whereClause)
		.get();
	const total = countResult?.count ?? 0;

	const customerList = db
		.select({
			id: customers.id,
			name: customers.name,
			phone: customers.phone,
			email: customers.email,
			orderCount:
				sql<number>`(SELECT COUNT(*) FROM \`order\` WHERE customer_id = "customer"."id" AND status = 'completed')`.as(
					'orderCount'
				),
			totalSpent:
				sql<number>`COALESCE((SELECT SUM(total_amount) FROM \`order\` WHERE customer_id = "customer"."id" AND status = 'completed'), 0)`.as(
					'totalSpent'
				),
			lastOrderDate: sql<
				number | null
			>`(SELECT MAX(created_at) FROM \`order\` WHERE customer_id = "customer"."id" AND status = 'completed')`.as(
				'lastOrderDate'
			)
		})
		.from(customers)
		.where(whereClause)
		.orderBy(desc(sql`totalSpent`))
		.limit(perPage)
		.offset(offset)
		.all();

	return {
		customers: customerList,
		pagination: {
			currentPage,
			totalPages: Math.ceil(total / perPage),
			total,
			perPage
		},
		filters: {
			search
		}
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
			db.insert(customers)
				.values({
					id: generateId(),
					name,
					phone,
					email
				})
				.run();
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
			db.delete(customers).where(eq(customers.id, id)).run();
		} catch (e) {
			return fail(500, { error: 'Database error' });
		}

		return { success: true };
	}
};
