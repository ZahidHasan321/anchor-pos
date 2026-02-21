import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	orders,
	orderItems,
	users,
	customers,
	stockLogs,
	products,
	productVariants,
	cashbook
} from '$lib/server/db/schema';
import { eq, sql, gte, lt, and, desc } from 'drizzle-orm';
import { hasPermission } from '$lib/server/permissions';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user || !(await hasPermission(locals.user.role, 'reports'))) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const type = url.searchParams.get('type');
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 20;
	const offset = (page - 1) * limit;

	if (!type || !from || !to) {
		return json({ error: 'Missing parameters' }, { status: 400 });
	}

	const startDate = new Date(from);
	const endDate = new Date(to);
	endDate.setHours(23, 59, 59, 999);

	if (type === 'products') {
		const data = await db
			.select({
				productId: products.id,
				productName: orderItems.productName,
				totalQty: sql<number>`sum(${orderItems.quantity})`.as('totalQty'),
				totalRevenue:
					sql<number>`sum(${orderItems.priceAtSale} * ${orderItems.quantity} * (1 - ${orderItems.discount} / 100))`.as(
						'totalRevenue'
					)
			})
			.from(orderItems)
			.innerJoin(orders, eq(orderItems.orderId, orders.id))
			.leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
			.leftJoin(products, eq(productVariants.productId, products.id))
			.where(
				and(
					eq(orders.status, 'completed'),
					gte(orders.createdAt, startDate),
					lt(orders.createdAt, endDate)
				)
			)
			.groupBy(orderItems.productName, products.id)
			.orderBy(desc(sql`totalQty`))
			.limit(limit)
			.offset(offset);
		return json(data);
	}

	if (type === 'staff') {
		const data = await db
			.select({
				userId: users.id,
				cashierName: users.name,
				orderCount: sql<number>`count(*)`.as('orderCount'),
				totalSales: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`.as('totalSales'),
				avgOrder: sql<number>`coalesce(avg(${orders.totalAmount}), 0)`.as('avgOrder')
			})
			.from(orders)
			.innerJoin(users, eq(orders.userId, users.id))
			.where(
				and(
					eq(orders.status, 'completed'),
					gte(orders.createdAt, startDate),
					lt(orders.createdAt, endDate)
				)
			)
			.groupBy(users.id)
			.orderBy(desc(sql`totalSales`))
			.limit(limit)
			.offset(offset);
		return json(data);
	}

	if (type === 'customers') {
		const data = await db
			.select({
				customerId: customers.id,
				customerName: customers.name,
				customerPhone: customers.phone,
				orderCount: sql<number>`count(*)`.as('orderCount'),
				totalSpent: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`.as('totalSpent')
			})
			.from(orders)
			.innerJoin(customers, eq(orders.customerId, customers.id))
			.where(
				and(
					eq(orders.status, 'completed'),
					gte(orders.createdAt, startDate),
					lt(orders.createdAt, endDate)
				)
			)
			.groupBy(customers.id)
			.orderBy(desc(sql`totalSpent`))
			.limit(limit)
			.offset(offset);
		return json(data);
	}

	if (type === 'inventory') {
		const data = await db
			.select({
				id: stockLogs.id,
				productId: products.id,
				productName: products.name,
				size: productVariants.size,
				changeAmount: stockLogs.changeAmount,
				reason: stockLogs.reason,
				userName: users.name,
				createdAt: stockLogs.createdAt
			})
			.from(stockLogs)
			.innerJoin(productVariants, eq(stockLogs.variantId, productVariants.id))
			.innerJoin(products, eq(productVariants.productId, products.id))
			.innerJoin(users, eq(stockLogs.userId, users.id))
			.where(
				and(
					sql`${stockLogs.reason} != 'sale'`,
					gte(stockLogs.createdAt, startDate),
					lt(stockLogs.createdAt, endDate)
				)
			)
			.orderBy(desc(stockLogs.createdAt))
			.limit(limit)
			.offset(offset);
		return json(data);
	}

	if (type === 'expenses') {
		const data = await db
			.select({
				id: cashbook.id,
				description: cashbook.description,
				total: sql<number>`sum(${cashbook.amount})`.as('total'),
				count: sql<number>`count(*)`.as('count')
			})
			.from(cashbook)
			.where(
				and(
					eq(cashbook.type, 'out'),
					gte(cashbook.createdAt, startDate),
					lt(cashbook.createdAt, endDate)
				)
			)
			.groupBy(cashbook.description)
			.orderBy(desc(sql`total`))
			.limit(limit)
			.offset(offset);
		return json(data);
	}

	return json({ error: 'Invalid type' }, { status: 400 });
};
