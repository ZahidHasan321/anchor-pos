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

	// Helper for PowerSync date strings
	const toIso = (date: Date) => date.toISOString();

	// Return promises for streaming
	return {
		// Summaries / Stats
		stats: (async () => {
			if (db) {
				const [todaySales, monthlySales, todayExpenses, inventoryValue] = await Promise.all([
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
							total: sql<number>`coalesce(sum(${productVariants.price} * ${productVariants.stockQuantity}), 0)`
						})
						.from(productVariants)
				]);

				return {
					todaySales: todaySales[0],
					monthlySales: monthlySales[0],
					todayExpenses: todayExpenses[0],
					inventoryValue: inventoryValue[0]?.total ?? 0
				};
			} else if (isElectron) {
				try {
					const { getPowerSyncDb } = await import('$lib/powersync/db');
					const psDb = getPowerSyncDb();
					const [todaySales, monthlySales, todayExpenses, inventoryValue] = await Promise.all([
						psDb.get(`SELECT count(*) as count, coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ?`, [toIso(today)]),
						psDb.get(`SELECT count(*) as count, coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ?`, [toIso(firstDayOfMonth)]),
						psDb.get(`SELECT coalesce(sum(amount), 0) as total FROM cashbook WHERE type = 'out' AND created_at >= ?`, [toIso(today)]),
						psDb.get(`SELECT coalesce(sum(price * stock_quantity), 0) as total FROM product_variants`)
					]) as any[];

					return {
						todaySales: todaySales || { count: 0, total: 0 },
						monthlySales: monthlySales || { count: 0, total: 0 },
						todayExpenses: todayExpenses || { total: 0 },
						inventoryValue: inventoryValue?.total ?? 0
					};
				} catch (e) {
					console.error('[dashboard] PowerSync stats failed:', e);
					return {
						todaySales: { count: 0, total: 0 },
						monthlySales: { count: 0, total: 0 },
						todayExpenses: { total: 0 },
						inventoryValue: 0
					};
				}
			}

			return {
				todaySales: { count: 0, total: 0 },
				monthlySales: { count: 0, total: 0 },
				todayExpenses: { total: 0 },
				inventoryValue: 0
			};
		})(),

		// Stock alerts (needs settings first)
		stockAlerts: (async () => {
			let settings: Record<string, string> = {};
			let lowStockItems: any[] = [];
			let lowStockCount = 0;

			if (db) {
				const settingsRows = await db.select().from(storeSettings);
				settings = settingsRows.reduce(
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
				lowStockItems = items;
				lowStockCount = count[0]?.count ?? 0;
			} else if (isElectron) {
				try {
					const { getPowerSyncDb } = await import('$lib/powersync/db');
					const psDb = getPowerSyncDb();
					const settingsRows = await psDb.getAll('SELECT * FROM store_settings') as any[];
					settings = settingsRows.reduce((acc: any, row: any) => {
						acc[row.key] = row.value;
						return acc;
					}, {});
					const threshold = parseInt(settings.low_stock_threshold || '5');

					const [items, count] = await Promise.all([
						psDb.getAll(`
							SELECT p.id, p.name, pv.size, pv.stock_quantity as stock 
							FROM product_variants pv 
							INNER JOIN products p ON pv.product_id = p.id
							WHERE pv.stock_quantity > 0 AND pv.stock_quantity <= ?
							LIMIT 10
						`, [threshold]),
						psDb.get(`SELECT count(*) as count FROM product_variants WHERE stock_quantity > 0 AND stock_quantity <= ?`, [threshold])
					]) as [any[], any];
					lowStockItems = items;
					lowStockCount = count?.count ?? 0;
				} catch (e) {
					console.error('[dashboard] PowerSync alerts failed:', e);
					return { lowStockItems: [], lowStockCount: 0 };
				}
			}

			return { lowStockItems, lowStockCount };
		})(),

		// Lists
		recentOrders: (async () => {
			if (db) return db.select().from(orders).orderBy(desc(orders.createdAt)).limit(10);
			if (isElectron) {
				try {
					const { getPowerSyncDb } = await import('$lib/powersync/db');
					const psDb = getPowerSyncDb();
					return psDb.getAll('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10');
				} catch (e) { return []; }
			}
			return [];
		})(),

		topProducts: (async () => {
			if (db) {
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
			} else if (isElectron) {
				try {
					const { getPowerSyncDb } = await import('$lib/powersync/db');
					const psDb = getPowerSyncDb();
					const topProductsRaw = await psDb.getAll(`
						SELECT product_name as name, variant_label as variantLabel, sum(quantity) as total_qty, sum(quantity * price_at_sale) as total_revenue
						FROM order_items oi
						INNER JOIN orders o ON oi.order_id = o.id
						WHERE o.status = 'completed' AND o.created_at >= ?
						GROUP BY product_name, variant_label
						ORDER BY total_qty DESC
						LIMIT 10
					`, [toIso(firstDayOfMonth)]);

					return topProductsRaw.map((p: any) => ({
						...p,
						totalQty: p.total_qty,
						totalRevenue: p.total_revenue
					}));
				} catch (e) { return []; }
			}
			return [];
		})()
	};
};
