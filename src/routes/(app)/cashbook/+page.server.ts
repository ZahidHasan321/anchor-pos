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
	const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: storeTimezone }).format(new Date());
	const targetDateStr = dateStr || todayStr;

	// Parse date in the store's timezone
	date = new Date(`${targetDateStr}T00:00:00`);
	
	// If the browser/server environment is not in Asia/Dhaka, we need to ensure 
	// the Date object represents midnight in Asia/Dhaka.
	// However, simple parsing like above might still be relative to local time.
	// A more robust way using Intl to get the offset or just calculating the UTC range:
	
	const getZonedDateRange = (dateStr: string, timeZone: string) => {
		// Create a UTC date at midnight of the target date
		const targetMidnight = new Date(`${dateStr}T00:00:00Z`);
		
		// Use Intl to find what time it is in the target timezone when UTC is at that midnight
		const formatter = new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric', month: '2-digit', day: '2-digit',
			hour: '2-digit', minute: '2-digit', second: '2-digit',
			hour12: false
		});
		
		// This string will be like "2026-02-26 06:00:00" if TZ is UTC+6
		const zonedStr = formatter.format(targetMidnight).replace(',', '');
		const [zDate, zTime] = zonedStr.split(' ');
		const [zh, zm, zs] = zTime.split(':').map(Number);
		
		// The offset in milliseconds is (zoned_hours * 3600 + zoned_minutes * 60 + zoned_seconds) * 1000
		// But wait, the date might have shifted too. 
		// Simpler: 
		const actualZonedTime = new Date(zonedStr.replace(' ', 'T') + 'Z').getTime();
		const offset = actualZonedTime - targetMidnight.getTime();
		
		// To get UTC start, we subtract the offset from the UTC target midnight
		const startUtc = new Date(targetMidnight.getTime() - offset);
		const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
		
		return { startUtc, endUtc };
	};

	const { startUtc: dateRangeStart, endUtc: dateRangeEnd } = getZonedDateRange(targetDateStr, storeTimezone);

	// Basic page data (needed immediately)
	return {
		view,
		date: targetDateStr,

		// Deferred data for streaming
		dailyData: (async () => {
			if (!db) return { entries: [], summary: { totalIn: 0, totalOut: 0, net: 0 } };
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
					.where(and(gte(cashbook.createdAt, dateRangeStart), lt(cashbook.createdAt, dateRangeEnd)))
					.orderBy(desc(cashbook.createdAt)),
				db
					.select({ type: cashbook.type, total: sql<number>`sum(${cashbook.amount})` })
					.from(cashbook)
					.where(and(gte(cashbook.createdAt, dateRangeStart), lt(cashbook.createdAt, dateRangeEnd)))
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
			if (!db) return [];
			const rows = await db
				.selectDistinct({ description: cashbook.description })
				.from(cashbook)
				.where(eq(cashbook.type, 'out'));
			return rows.map((r: { description: string }) => r.description);
		})(),

		transactionsData: (async () => {
			if (view !== 'all' || !db) return null;

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
