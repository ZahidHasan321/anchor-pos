import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { cashbook, users } from '$lib/server/db/schema';
import { eq, sql, gte, lt, and, desc } from 'drizzle-orm';
import { generateId } from '$lib/utils';
import { logAuditEvent } from '$lib/server/audit';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	if (!locals.user || !(await hasPermission(locals.user.role, 'cashbook'))) {
		redirect(302, locals.user ? await getDefaultRedirect(locals.user.role) : '/login');
	}

	const storeTimezone = 'Asia/Dhaka';
	const view = url.searchParams.get('view') || 'daily';
	const dateStr = url.searchParams.get('date');

	let date: Date;
	if (dateStr) {
		date = new Date(`${dateStr}T00:00:00Z`);
	} else {
		const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: storeTimezone }).format(
			new Date()
		);
		date = new Date(`${todayStr}T00:00:00Z`);
	}

	const nextDay = new Date(date);
	nextDay.setUTCDate(date.getUTCDate() + 1);

	// Basic page data (needed immediately)
	return {
		view,
		date: date.toISOString().split('T')[0],

		// Deferred data for streaming
		dailyData: (async () => {
			const [entries, totals] = await Promise.all([
				db
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
					.orderBy(desc(cashbook.createdAt)),
				db
					.select({ type: cashbook.type, total: sql<number>`sum(${cashbook.amount})` })
					.from(cashbook)
					.where(and(gte(cashbook.createdAt, date), lt(cashbook.createdAt, nextDay)))
					.groupBy(cashbook.type)
			]);

			const totalIn = totals.find((t: { type: string; total: number }) => t.type === 'in')?.total || 0;
			const totalOut = totals.find((t: { type: string; total: number }) => t.type === 'out')?.total || 0;

			return {
				entries,
				summary: { totalIn, totalOut, net: totalIn - totalOut }
			};
		})(),

		expenseDescriptions: (async () => {
			const rows = await db
				.selectDistinct({ description: cashbook.description })
				.from(cashbook)
				.where(eq(cashbook.type, 'out'));
			return rows.map((r: { description: string }) => r.description);
		})(),

		transactionsData: (async () => {
			if (view !== 'all') return null;

			const txPage = Math.max(1, parseInt(url.searchParams.get('txPage') || '1'));
			const txType = url.searchParams.get('txType') || 'all';
			const txSearch = url.searchParams.get('txSearch') || '';
			const txLimit = 50;
			const txOffset = (txPage - 1) * txLimit;

			const txConditions: any[] = [];
			if (txType === 'in' || txType === 'out') txConditions.push(eq(cashbook.type, txType));
			if (txSearch) txConditions.push(sql`${cashbook.description} ILIKE ${'%' + txSearch + '%'}`);
			const txWhere = txConditions.length > 0 ? and(...txConditions) : undefined;

			const [countRes, txRes] = await Promise.all([
				db
					.select({ count: sql<number>`count(*)` })
					.from(cashbook)
					.where(txWhere),
				db
					.select({
						id: cashbook.id,
						amount: cashbook.amount,
						type: cashbook.type,
						description: cashbook.description,
						createdAt: cashbook.createdAt,
						userName:
							sql<string>`coalesce((SELECT name FROM ${users} WHERE id = ${cashbook.userId}), 'System')`.as(
								'userName'
							)
					})
					.from(cashbook)
					.where(txWhere)
					.orderBy(desc(cashbook.createdAt))
					.limit(txLimit)
					.offset(txOffset)
			]);

			const totalEntries = countRes[0]?.count ?? 0;
			return {
				transactions: txRes,
				txPage,
				txTotalPages: Math.max(1, Math.ceil(totalEntries / txLimit)),
				txTotalEntries: totalEntries,
				txType,
				txSearch
			};
		})()
	};
};

export const actions: Actions = {
	addExpense: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const data = await request.formData();
		const description = (data.get('description') as string)?.trim();
		const amount = parseFloat(data.get('amount') as string);

		if (!description || isNaN(amount) || amount <= 0)
			return fail(400, { error: 'Valid description and amount required' });

		try {
			const existingRows = await db
				.selectDistinct({ description: cashbook.description })
				.from(cashbook)
				.where(eq(cashbook.type, 'out'));
			const normalizedDescription =
				existingRows
					.map((r: { description: string }) => r.description)
					.find((d: string) => d.toLowerCase() === description.toLowerCase()) || description;

			const expenseId = generateId();
			await db.insert(cashbook).values({
				id: expenseId,
				amount,
				type: 'out',
				description: normalizedDescription,
				userId: locals.user.id
			});
			await logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'ADD_EXPENSE',
				entity: 'cashbook',
				entityId: expenseId,
				details: `Added expense: ${amount.toFixed(2)} - ${normalizedDescription}`
			});
		} catch (e) {
			return fail(500, { error: 'Database error' });
		}
		return { success: true };
	}
};
