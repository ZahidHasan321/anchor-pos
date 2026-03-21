import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	orders,
	orderItems,
	cashbook,
	productVariants,
	products,
	storeSettings
} from '$lib/server/db/schema';
import { eq, sql, gte, and, desc, lte, gt, lt } from 'drizzle-orm';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';
import env from '$lib/server/env';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !(await hasPermission(locals.user.role, 'dashboard'))) {
		redirect(302, locals.user ? await getDefaultRedirect(locals.user.role) : '/login');
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

	// Last month same period: day 1 to min(today's day-of-month, last day of prev month)
	const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
	const lastDayOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
	const compareDayOfMonth = Math.min(today.getDate(), lastDayOfPrevMonth);
	const lastMonthEnd = new Date(today.getFullYear(), today.getMonth() - 1, compareDayOfMonth + 1);

	// Last 7 days range
	const sevenDaysAgo = new Date(today);
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // includes today = 7 days

	const isNative = env.IS_NATIVE;

	const emptyStats = {
		todaySales: { count: 0, total: 0 },
		monthlySales: { count: 0, total: 0 },
		todayExpenses: { total: 0 },
		todayProfit: 0,
		yesterdaySales: { total: 0 },
		lastMonthSamePeriod: { total: 0 }
	};

	return {
		isNative,

		stats: (async () => {
			if (isNative) return emptyStats;
			if (!db) return emptyStats;

			const [
				todaySales,
				monthlySales,
				todayExpenses,
				todayCogs,
				yesterdaySales,
				lastMonthSamePeriod
			] = await Promise.all([
				db
					.select({
						count: sql<number>`count(*)`,
						total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`
					})
					.from(orders)
					.where(and(eq(orders.status, 'completed'), gte(orders.createdAt, today))),
				db
					.select({
						count: sql<number>`count(*)`,
						total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`
					})
					.from(orders)
					.where(and(eq(orders.status, 'completed'), gte(orders.createdAt, firstDayOfMonth))),
				db
					.select({ total: sql<number>`coalesce(sum(${cashbook.amount}), 0)` })
					.from(cashbook)
					.where(
						and(
							eq(cashbook.type, 'out'),
							eq(cashbook.category, 'expense'),
							gte(cashbook.createdAt, today)
						)
					),
				db
					.select({
						total: sql<number>`coalesce(sum(${orderItems.costAtSale} * ${orderItems.quantity}), 0)`
					})
					.from(orderItems)
					.innerJoin(orders, eq(orderItems.orderId, orders.id))
					.where(
						and(
							eq(orders.status, 'completed'),
							eq(orderItems.status, 'completed'),
							gte(orders.createdAt, today)
						)
					),
				db
					.select({
						total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`
					})
					.from(orders)
					.where(
						and(
							eq(orders.status, 'completed'),
							gte(orders.createdAt, yesterday),
							lt(orders.createdAt, today)
						)
					),
				db
					.select({
						total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`
					})
					.from(orders)
					.where(
						and(
							eq(orders.status, 'completed'),
							gte(orders.createdAt, lastMonthStart),
							lt(orders.createdAt, lastMonthEnd)
						)
					)
			]);

			const grossProfit = (todaySales[0]?.total ?? 0) - (todayCogs[0]?.total ?? 0);

			return {
				todaySales: todaySales[0],
				monthlySales: monthlySales[0],
				todayExpenses: todayExpenses[0],
				todayProfit: grossProfit - (todayExpenses[0]?.total ?? 0),
				yesterdaySales: yesterdaySales[0],
				lastMonthSamePeriod: lastMonthSamePeriod[0]
			};
		})(),

		last7Days: (async () => {
			if (isNative) return [];
			if (!db) return [];

			const rows = await db
				.select({
					day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
					total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`
				})
				.from(orders)
				.where(and(eq(orders.status, 'completed'), gte(orders.createdAt, sevenDaysAgo)))
				.groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`)
				.orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);

			return rows;
		})(),

		todayPayments: (async () => {
			if (isNative) return [];
			if (!db) return [];

			const result = await db
				.select({
					cash: sql<number>`coalesce(sum(coalesce(${orders.cashAmount}, CASE WHEN ${orders.paymentMethod} = 'cash' THEN ${orders.totalAmount} ELSE 0 END)), 0)`,
					card: sql<number>`coalesce(sum(coalesce(${orders.cardAmount}, CASE WHEN ${orders.paymentMethod} = 'card' THEN ${orders.totalAmount} ELSE 0 END)), 0)`,
					mobile: sql<number>`coalesce(sum(coalesce(${orders.mobileAmount}, CASE WHEN ${orders.paymentMethod} = 'mobile' THEN ${orders.totalAmount} ELSE 0 END)), 0)`
				})
				.from(orders)
				.where(
					and(
						eq(orders.status, 'completed'),
						gte(orders.createdAt, today)
					)
				);

			const r = result[0];
			return [
				{ method: 'cash', total: Number(r?.cash ?? 0) },
				{ method: 'card', total: Number(r?.card ?? 0) },
				{ method: 'mobile', total: Number(r?.mobile ?? 0) }
			];
		})(),

		stockAlerts: (async () => {
			if (isNative) return { lowStockItems: [], lowStockCount: 0 };
			if (!db) return { lowStockItems: [], lowStockCount: 0 };

			const settingsRows = await db.select().from(storeSettings);
			const settings = settingsRows.reduce(
				(acc: Record<string, string>, row: { key: string; value: string }) => {
					acc[row.key] = row.value;
					return acc;
				},
				{} as Record<string, string>
			);
			const threshold = parseInt(settings.low_stock_threshold || '5');

			const [items, count] = await Promise.all([
				db
					.select({
						id: products.id,
						name: products.name,
						size: productVariants.size,
						stock: productVariants.stockQuantity
					})
					.from(productVariants)
					.innerJoin(products, eq(productVariants.productId, products.id))
					.where(
						and(gt(productVariants.stockQuantity, 0), lte(productVariants.stockQuantity, threshold))
					)
					.limit(10),
				db
					.select({ count: sql<number>`count(*)` })
					.from(productVariants)
					.where(
						and(gt(productVariants.stockQuantity, 0), lte(productVariants.stockQuantity, threshold))
					)
			]);

			return { lowStockItems: items, lowStockCount: count[0]?.count ?? 0 };
		})(),

		topProducts: (async () => {
			if (isNative) return [];
			if (!db) return [];

			const topProductsRaw = await db
				.select({
					name: orderItems.productName,
					variantLabel: orderItems.variantLabel,
					total_qty: sql<number>`sum(${orderItems.quantity})`.as('total_qty'),
					total_revenue: sql<number>`sum(${orderItems.quantity} * ${orderItems.priceAtSale})`.as(
						'total_revenue'
					)
				})
				.from(orderItems)
				.innerJoin(orders, eq(orderItems.orderId, orders.id))
				.where(
					and(
						eq(orders.status, 'completed'),
						eq(orderItems.status, 'completed'),
						gte(orders.createdAt, firstDayOfMonth)
					)
				)
				.groupBy(orderItems.productName, orderItems.variantLabel)
				.orderBy(sql`total_qty DESC`)
				.limit(10);

			return topProductsRaw.map((p: any) => ({
				...p,
				totalQty: p.total_qty,
				totalRevenue: p.total_revenue
			}));
		})()
	};
};
