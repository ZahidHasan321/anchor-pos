import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	orders,
	cashbook,
	orderItems,
	users,
	customers,
	storeSettings,
	products,
	productVariants,
	stockLogs
} from '$lib/server/db/schema';
import { eq, sql, gte, lt, and, desc, inArray } from 'drizzle-orm';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user || !await hasPermission(locals.user.role, 'reports')) {
		redirect(302, locals.user ? await getDefaultRedirect(locals.user.role) : '/login');
	}

	// 1. Critical data needed for initial render (Immediate)
	const settingsRows = db ? await db.select().from(storeSettings) : [];
	const settings = settingsRows.reduce(
		(acc: Record<string, string>, row: { key: string; value: string }) => {
			acc[row.key] = row.value;
			return acc;
		},
		{} as Record<string, string>
	);

	const storeLocale = 'en-GB';
	const storeTimezone = 'Asia/Dhaka';
	const period = url.searchParams.get('period') || 'month';
	const customFrom = url.searchParams.get('from');
	const customTo = url.searchParams.get('to');

	const now = new Date();
	let startDate: Date;
	let endDate: Date = new Date(now);
	endDate.setHours(23, 59, 59, 999);

	switch (period) {
		case 'today':
			startDate = new Date(now);
			startDate.setHours(0, 0, 0, 0);
			break;
		case 'week':
			startDate = new Date(now);
			startDate.setDate(now.getDate() - 7);
			startDate.setHours(0, 0, 0, 0);
			break;
		case 'month':
			startDate = new Date(now.getFullYear(), now.getMonth(), 1);
			break;
		case 'year':
			startDate = new Date(now.getFullYear(), 0, 1);
			break;
		case 'custom':
			startDate = customFrom ? new Date(customFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
			if (isNaN(startDate.getTime())) startDate = new Date(now.getFullYear(), now.getMonth(), 1);
			startDate.setHours(0, 0, 0, 0);
			endDate = customTo ? new Date(customTo) : endDate;
			if (isNaN(endDate.getTime())) endDate = new Date(now);
			endDate.setHours(23, 59, 59, 999);
			break;
		case 'all':
		default:
			const firstOrderResult = db ? await db.select({ date: orders.createdAt }).from(orders).orderBy(orders.createdAt).limit(1) : [];
			startDate = firstOrderResult[0] ? new Date(firstOrderResult[0].date) : new Date(now.getFullYear(), now.getMonth(), 1);
			startDate.setHours(0, 0, 0, 0);
			break;
	}

	let chartGrouping: 'hour' | 'day' | 'month' | 'year';
	const loopEndDate: Date = new Date(endDate);

	switch (period) {
		case 'today':
			chartGrouping = 'hour';
			break;
		case 'week':
		case 'month':
			chartGrouping = 'day';
			break;
		case 'year':
			chartGrouping = 'month';
			break;
		case 'all':
			chartGrouping = 'year';
			break;
		default:
			const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
			if (daysDiff <= 2) chartGrouping = 'hour';
			else if (daysDiff <= 180) chartGrouping = 'day';
			else if (daysDiff <= 1095) chartGrouping = 'month';
			else chartGrouping = 'year';
			break;
	}

	const dateExpressionMap = {
		hour: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD HH24')`,
		day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
		month: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM')`,
		year: sql<string>`to_char(${orders.createdAt}, 'YYYY')`
	};

	// 2. Streamed data (Deferred)
	return {
		storeName: settings.store_name ?? 'Store',
		period,
		startDate: startDate.toISOString().split('T')[0],
		endDate: endDate.toISOString().split('T')[0],
		chartGrouping,

		// Summaries (Instantly visible cards)
		summaries: (async () => {
			if (!db) return {
				salesSummary: { count: 0, total: 0, avgOrder: 0, totalDiscount: 0 },
				expenseSummary: { total: 0 },
				itemsSold: 0,
				grossProfit: 0,
				inventoryRetailValue: 0,
				inventoryCostValue: 0,
				totalStocked: 0
			};
			const [sales, expenses, items, inventory, stockSum] = await Promise.all([
				db.select({
					count: sql<number>`count(*)`,
					total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
					avgOrder: sql<number>`coalesce(avg(${orders.totalAmount}), 0)`,
					totalDiscount: sql<number>`coalesce(sum(${orders.discountAmount}), 0)`
				}).from(orders).where(and(eq(orders.status, 'completed'), gte(orders.createdAt, startDate), lt(orders.createdAt, endDate))),
				
				db.select({
					total: sql<number>`coalesce(sum(${cashbook.amount}), 0)`
				}).from(cashbook).where(and(
					eq(cashbook.type, 'out'), 
					eq(cashbook.category, 'expense'),
					gte(cashbook.createdAt, startDate), 
					lt(cashbook.createdAt, endDate)
				)),

				db.select({
					totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
					totalCost: sql<number>`coalesce(sum(${orderItems.costAtSale} * ${orderItems.quantity}), 0)`
				}).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id)).where(and(
					eq(orders.status, 'completed'), 
					eq(orderItems.status, 'completed'),
					gte(orders.createdAt, startDate), 
					lt(orders.createdAt, endDate)
				)),

				db.select({
					totalCost: sql<number>`COALESCE(SUM(COALESCE(NULLIF(${productVariants.costPrice}, 0), ${products.costPrice}, 0) * ${productVariants.stockQuantity}), 0)`,
					totalRetail: sql<number>`COALESCE(SUM(${productVariants.price} * ${productVariants.stockQuantity}), 0)`
				}).from(productVariants).innerJoin(products, eq(productVariants.productId, products.id)),

				db.select({ totalStocked: sql<number>`coalesce(sum(${stockLogs.changeAmount}), 0)` }).from(stockLogs).where(and(sql`${stockLogs.changeAmount} > 0`, gte(stockLogs.createdAt, startDate), lt(stockLogs.createdAt, endDate)))
			]);

			const s = sales[0];
			const e = expenses[0];
			const i = items[0];
			const inv = inventory[0];

			const grossProfit = (s?.total ?? 0) - (i?.totalCost ?? 0);

			return {
				salesSummary: s ?? { count: 0, total: 0, avgOrder: 0, totalDiscount: 0 },
				expenseSummary: e ?? { total: 0 },
				itemsSold: i?.totalQty ?? 0,
				grossProfit: grossProfit,
				netProfit: grossProfit - (e?.total ?? 0),
				inventoryRetailValue: inv?.totalRetail ?? 0,
				inventoryCostValue: inv?.totalCost ?? 0,
				totalStocked: stockSum[0]?.totalStocked ?? 0
			};
		})(),

		// Individual Report Promises (Decomposed for performance)
		topProducts: (async () => {
			if (!db) return [];
			const res = await db.select({ productId: products.id, productName: orderItems.productName, totalQty: sql<number>`sum(${orderItems.quantity})`.as('totalQty'), totalRevenue: sql<number>`sum(${orderItems.priceAtSale} * ${orderItems.quantity} * (1 - ${orderItems.discount} / 100))`.as('totalRevenue') }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id)).leftJoin(productVariants, eq(orderItems.variantId, productVariants.id)).leftJoin(products, eq(productVariants.productId, products.id)).where(and(
				eq(orderItems.status, 'completed'), 
				gte(orders.createdAt, startDate), 
				lt(orders.createdAt, endDate)
			)).groupBy(orderItems.productName, products.id).orderBy(desc(sql`"totalQty"`)).limit(10);
			return res;
		})(),

		categoryBreakdown: (async () => {
			if (!db) return [];
			const res = await db.select({ category: sql<string>`coalesce(${products.category}, 'Unknown')`.as('category'), totalQty: sql<number>`sum(${orderItems.quantity})`.as('totalQty'), totalRevenue: sql<number>`sum(${orderItems.priceAtSale} * ${orderItems.quantity} * (1 - ${orderItems.discount} / 100))`.as('totalRevenue') }).from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id)).leftJoin(productVariants, eq(orderItems.variantId, productVariants.id)).leftJoin(products, eq(productVariants.productId, products.id)).where(and(
				eq(orders.status, 'completed'), 
				eq(orderItems.status, 'completed'), 
				gte(orders.createdAt, startDate), 
				lt(orders.createdAt, endDate)
				)).groupBy(products.category).orderBy(desc(sql`"totalRevenue"`)).limit(10);
				return res;		})(),

		paymentBreakdown: (async () => {
			if (!db) return [];
			return db.select({ method: orders.paymentMethod, count: sql<number>`count(*)`.as('count'), total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`.as('total') }).from(orders).where(and(eq(orders.status, 'completed'), gte(orders.createdAt, startDate), lt(orders.createdAt, endDate))).groupBy(orders.paymentMethod);
		})(),

		refundSummary: (async () => {
			if (!db) return [];
			return db.select({ status: orders.status, count: sql<number>`count(*)`.as('count'), total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`.as('total') }).from(orders).where(and(inArray(orders.status, ['refunded', 'void']), gte(orders.createdAt, startDate), lt(orders.createdAt, endDate))).groupBy(orders.status);
		})(),

		expenseBreakdown: (async () => {
			if (!db) return [];
			return db.select({ description: cashbook.description, total: sql<number>`coalesce(sum(${cashbook.amount}), 0)`.as('total'), count: sql<number>`count(*)`.as('count') }).from(cashbook).where(and(eq(cashbook.type, 'out'), gte(cashbook.createdAt, startDate), lt(cashbook.createdAt, endDate))).groupBy(cashbook.description).orderBy(desc(sql`total`)).limit(10);
		})(),

		stockUpdates: (async () => {
			if (!db) return [];
			return db.select({ id: stockLogs.id, productId: products.id, productName: products.name, size: productVariants.size, changeAmount: stockLogs.changeAmount, reason: stockLogs.reason, userName: users.name, createdAt: stockLogs.createdAt }).from(stockLogs).innerJoin(productVariants, eq(stockLogs.variantId, productVariants.id)).innerJoin(products, eq(productVariants.productId, products.id)).innerJoin(users, eq(stockLogs.userId, users.id)).where(and(sql`${stockLogs.reason} != 'sale'`, gte(stockLogs.createdAt, startDate), lt(stockLogs.createdAt, endDate))).orderBy(desc(stockLogs.createdAt)).limit(10);
		})(),

		chartData: (async () => {
			if (!db) return [];
			const dateExpr = dateExpressionMap[chartGrouping];
			return db.select({
				date: dateExpr.as('date'),
				amount: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`.as('amount'),
				count: sql<number>`count(*)`.as('count')
			})
			.from(orders)
			.where(and(
				eq(orders.status, 'completed'),
				gte(orders.createdAt, startDate),
				lt(orders.createdAt, endDate)
			))
			.groupBy(dateExpr)
			.orderBy(dateExpr);
		})(),
	};
};
