import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { orders, orderItems, cashbook, productVariants, products } from '$lib/server/db/schema';
import { eq, sql, gte, and, desc, lte, gt } from 'drizzle-orm';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !hasPermission(locals.user.role, 'dashboard')) {
		redirect(302, locals.user ? getDefaultRedirect(locals.user.role) : '/login');
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

	// Today's Sales
	const todaySales = db
		.select({
			count: sql<number>`count(*)`,
			total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`
		})
		.from(orders)
		.where(and(eq(orders.status, 'completed'), gte(orders.createdAt, today)))
		.get();

	// Monthly Sales
	const monthlySales = db
		.select({
			count: sql<number>`count(*)`,
			total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`
		})
		.from(orders)
		.where(and(eq(orders.status, 'completed'), gte(orders.createdAt, firstDayOfMonth)))
		.get();

	// Today's Expenses
	const todayExpenses = db
		.select({
			total: sql<number>`coalesce(sum(${cashbook.amount}), 0)`
		})
		.from(cashbook)
		.where(and(eq(cashbook.type, 'out'), gte(cashbook.createdAt, today)))
		.get();

	// Total Inventory Value
	const inventoryValueResult = db
		.select({
			total: sql<number>`coalesce(sum(${productVariants.price} * ${productVariants.stockQuantity}), 0)`
		})
		.from(productVariants)
		.get();

	// Low Stock Items (List)
	const lowStockItems = db
		.select({
			id: products.id,
			name: products.name,
			size: productVariants.size,
			stock: productVariants.stockQuantity
		})
		.from(productVariants)
		.innerJoin(products, eq(productVariants.productId, products.id))
		.where(and(gt(productVariants.stockQuantity, 0), lte(productVariants.stockQuantity, 5)))
		.limit(10)
		.all();

	// Low Stock Count (Total)
	const lowStockCountResult = db
		.select({ count: sql<number>`count(*)` })
		.from(productVariants)
		.where(and(gt(productVariants.stockQuantity, 0), lte(productVariants.stockQuantity, 5)))
		.get();

	// Recent 10 Orders
	const recentOrders = db.select().from(orders).orderBy(desc(orders.createdAt)).limit(10).all();

	// Top Selling Products (This Month)
	const topProducts = db
		.select({
			name: orderItems.productName,
			variantLabel: orderItems.variantLabel,
			totalQty: sql<number>`sum(${orderItems.quantity})`.as('total_qty'),
			totalRevenue: sql<number>`sum(${orderItems.quantity} * ${orderItems.priceAtSale})`.as(
				'total_revenue'
			)
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(and(eq(orders.status, 'completed'), gte(orders.createdAt, firstDayOfMonth)))
		.groupBy(orderItems.productName, orderItems.variantLabel)
		.orderBy(sql`total_qty DESC`)
		.limit(10)
		.all();

	return {
		stats: {
			todaySales,
			monthlySales,
			todayExpenses,
			inventoryValue: inventoryValueResult?.total ?? 0,
			lowStockCount: lowStockCountResult?.count ?? 0
		},
		lowStockItems,
		recentOrders,
		topProducts
	};
};
