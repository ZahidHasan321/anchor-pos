import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { cashbook, users } from '$lib/server/db/schema';
import { eq, sql, gte, lt, and, desc } from 'drizzle-orm';
import { generateId } from '$lib/utils';
import { logAuditEvent } from '$lib/server/audit';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user || !hasPermission(locals.user.role, 'cashbook')) {
		redirect(302, locals.user ? getDefaultRedirect(locals.user.role) : '/login');
	}

	const view = url.searchParams.get('view') || 'daily';
	const dateStr = url.searchParams.get('date');
	const date = dateStr ? new Date(dateStr) : new Date();
	date.setHours(0, 0, 0, 0);

	const nextDay = new Date(date);
	nextDay.setDate(date.getDate() + 1);

	const entries = db
		.select({
			id: cashbook.id,
			amount: cashbook.amount,
			type: cashbook.type,
			description: cashbook.description,
			createdAt: cashbook.createdAt,
			userName: users.name
		})
		.from(cashbook)
		.leftJoin(users, eq(cashbook.userId, users.id))
		.where(and(gte(cashbook.createdAt, date), lt(cashbook.createdAt, nextDay)))
		.orderBy(desc(cashbook.createdAt))
		.all();

	const totals = db
		.select({
			type: cashbook.type,
			total: sql<number>`sum(${cashbook.amount})`
		})
		.from(cashbook)
		.where(and(gte(cashbook.createdAt, date), lt(cashbook.createdAt, nextDay)))
		.groupBy(cashbook.type)
		.all();

	const totalIn = totals.find((t) => t.type === 'in')?.total || 0;
	const totalOut = totals.find((t) => t.type === 'out')?.total || 0;

	const expenseDescriptions = db
		.selectDistinct({ description: cashbook.description })
		.from(cashbook)
		.where(eq(cashbook.type, 'out'))
		.all()
		.map((r) => r.description);

	// All transactions view (paginated with filters)
	let transactions: any[] = [];
	let txPage = 1;
	let txTotalPages = 1;
	let txTotalEntries = 0;
	let txType = 'all';
	let txSearch = '';

	if (view === 'all') {
		txPage = Math.max(1, parseInt(url.searchParams.get('txPage') || '1'));
		txType = url.searchParams.get('txType') || 'all';
		txSearch = url.searchParams.get('txSearch') || '';
		const txLimit = 50;
		const txOffset = (txPage - 1) * txLimit;

		const txConditions: any[] = [];
		if (txType === 'in' || txType === 'out') {
			txConditions.push(eq(cashbook.type, txType));
		}
		if (txSearch) {
			txConditions.push(sql`${cashbook.description} LIKE ${'%' + txSearch + '%'}`);
		}

		const txWhere = txConditions.length > 0 ? and(...txConditions) : undefined;

		const transactionCount = db
			.select({ count: sql<number>`count(*)` })
			.from(cashbook)
			.where(txWhere)
			.get();

		transactions = db
			.select({
				id: cashbook.id,
				amount: cashbook.amount,
				type: cashbook.type,
				description: cashbook.description,
				createdAt: cashbook.createdAt,
				userName:
					sql<string>`coalesce((SELECT name FROM user WHERE id = ${cashbook.userId}), 'System')`.as(
						'userName'
					)
			})
			.from(cashbook)
			.where(txWhere)
			.orderBy(desc(cashbook.createdAt))
			.limit(txLimit)
			.offset(txOffset)
			.all();

		txTotalPages = Math.max(1, Math.ceil((transactionCount?.count ?? 0) / txLimit));
		txTotalEntries = transactionCount?.count ?? 0;
	}

	return {
		view,
		entries,
		date: date.toISOString().split('T')[0],
		summary: {
			totalIn,
			totalOut,
			net: totalIn - totalOut
		},
		transactions,
		txPage,
		txTotalPages,
		txTotalEntries,
		txType,
		txSearch,
		expenseDescriptions
	};
};

export const actions: Actions = {
	addExpense: async ({ request, locals }) => {
		if (!locals.user) return fail(401);

		const data = await request.formData();
		const description = (data.get('description') as string)?.trim();
		const amount = parseFloat(data.get('amount') as string);

		if (!description || isNaN(amount) || amount <= 0) {
			return fail(400, { error: 'Valid description and amount required' });
		}

		try {
			// Normalize description by finding existing case-insensitive match
			const existingDescriptions = db
				.selectDistinct({ description: cashbook.description })
				.from(cashbook)
				.where(eq(cashbook.type, 'out'))
				.all()
				.map((r) => r.description);

			const normalizedDescription =
				existingDescriptions.find((d) => d.toLowerCase() === description.toLowerCase()) ||
				description;

			const expenseId = generateId();
			db.insert(cashbook)
				.values({
					id: expenseId,
					amount,
					type: 'out',
					description: normalizedDescription,
					userId: locals.user.id
				})
				.run();

			logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'ADD_EXPENSE',
				entity: 'cashbook',
				entityId: expenseId,
				details: `Added expense: ৳${amount.toFixed(2)} - ${normalizedDescription}`
			});
		} catch (e) {
			return fail(500, { error: 'Database error' });
		}

		return { success: true };
	}
};
