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
import { eq, sql, gte, and, desc, lte, gt } from 'drizzle-orm';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !(await hasPermission(locals.user.role, 'dashboard'))) {
		redirect(302, locals.user ? await getDefaultRedirect(locals.user.role) : '/login');
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
	const isElectron = process.env.BUILD_TARGET === 'electron';

	const emptyStats = {
		todaySales: { count: 0, total: 0 },
		monthlySales: { count: 0, total: 0 },
		todayExpenses: { total: 0 },
		todayProfit: 0,
		inventoryValue: 0
	};

	// Return promises for streaming
	return {
		isElectron,

		// Summaries / Stats
		stats: (async () => {
			if (isElectron) return emptyStats;
			if (!db) return emptyStats;

			const [todaySales, monthlySales, todayExpenses, todayCogs, inventoryValue] = await Promise.all([
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
					.where(and(eq(cashbook.type, 'out'), gte(cashbook.createdAt, today))),
				db
					.select({
						total: sql<number>`coalesce(sum(${orderItems.costAtSale} * ${orderItems.quantity}), 0)`
					})
					.from(orderItems)
					.innerJoin(orders, eq(orderItems.orderId, orders.id))
					.where(and(eq(orders.status, 'completed'), gte(orders.createdAt, today))),
				db
					.select({
						total: sql<number>`coalesce(sum(coalesce(${products.costPrice}, 0) * ${productVariants.stockQuantity}), 0)`
					})
					.from(productVariants)
					.innerJoin(products, eq(productVariants.productId, products.id))
			]);

			return {
				todaySales: todaySales[0],
				monthlySales: monthlySales[0],
				todayExpenses: todayExpenses[0],
				todayProfit: (todaySales[0]?.total ?? 0) - (todayCogs[0]?.total ?? 0),
				inventoryValue: inventoryValue[0]?.total ?? 0
			};
		})(),

		// Stock alerts (needs settings first)
		stockAlerts: (async () => {
			if (isElectron) return { lowStockItems: [], lowStockCount: 0 };
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

		// Lists
		recentOrders: (async () => {
			if (isElectron) return [];
			if (!db) return [];
			return db.select().from(orders).orderBy(desc(orders.createdAt)).limit(10);
		})(),

		topProducts: (async () => {
			if (isElectron) return [];
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
				.where(and(eq(orders.status, 'completed'), gte(orders.createdAt, firstDayOfMonth)))
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
