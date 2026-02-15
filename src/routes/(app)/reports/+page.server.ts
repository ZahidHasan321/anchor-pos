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
	if (!locals.user || !hasPermission(locals.user.role, 'reports')) {
		redirect(302, locals.user ? getDefaultRedirect(locals.user.role) : '/login');
	}

	// Determine time period from query params
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
			startDate = customFrom
				? new Date(customFrom)
				: new Date(now.getFullYear(), now.getMonth(), 1);
			if (isNaN(startDate.getTime())) startDate = new Date(now.getFullYear(), now.getMonth(), 1);
			startDate.setHours(0, 0, 0, 0);

			endDate = customTo ? new Date(customTo) : endDate;
			if (isNaN(endDate.getTime())) endDate = new Date(now);
			endDate.setHours(23, 59, 59, 999);
			break;
		case 'all':
		default:
			const firstOrder = db
				.select({ date: orders.createdAt })
				.from(orders)
				.orderBy(orders.createdAt)
				.limit(1)
				.get();
			startDate = firstOrder ? new Date(firstOrder.date) : new Date(now.getFullYear(), now.getMonth(), 1);
			startDate.setHours(0, 0, 0, 0);
			break;
	}

	// Total sales in period
	const salesSummary = db
		.select({
			count: sql<number>`count(*)`,
			total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
			avgOrder: sql<number>`coalesce(avg(${orders.totalAmount}), 0)`,
			totalDiscount: sql<number>`coalesce(sum(${orders.discountAmount}), 0)`
		})
		.from(orders)
		.where(
			and(
				eq(orders.status, 'completed'),
				gte(orders.createdAt, startDate),
				lt(orders.createdAt, endDate)
			)
		)
		.get();

	// Cash vs Card breakdown
	const paymentBreakdown = db
		.select({
			method: orders.paymentMethod,
			count: sql<number>`count(*)`.as('count'),
			total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`.as('total')
		})
		.from(orders)
		.where(
			and(
				eq(orders.status, 'completed'),
				gte(orders.createdAt, startDate),
				lt(orders.createdAt, endDate)
			)
		)
		.groupBy(orders.paymentMethod)
		.all();

	// Expenses in period
	const expenseSummary = db
		.select({
			count: sql<number>`count(*)`,
			total: sql<number>`coalesce(sum(${cashbook.amount}), 0)`
		})
		.from(cashbook)
		.where(
			and(
				eq(cashbook.type, 'out'),
				gte(cashbook.createdAt, startDate),
				lt(cashbook.createdAt, endDate)
			)
		)
		.get();

	// Total items sold in period
	const itemsSoldSummary = db
		.select({
			totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(
			and(
				eq(orders.status, 'completed'),
				gte(orders.createdAt, startDate),
				lt(orders.createdAt, endDate)
			)
		)
		.get();

	// Top selling products
	const topProducts = db
		.select({
			productName: orderItems.productName,
			totalQty: sql<number>`sum(${orderItems.quantity})`.as('totalQty'),
			totalRevenue:
				sql<number>`sum(${orderItems.priceAtSale} * ${orderItems.quantity} * (1 - ${orderItems.discount} / 100))`.as(
					'totalRevenue'
				)
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(
			and(
				eq(orders.status, 'completed'),
				gte(orders.createdAt, startDate),
				lt(orders.createdAt, endDate)
			)
		)
		.groupBy(orderItems.productName)
		.orderBy(desc(sql`totalQty`))
		.limit(10)
		.all();

	// Chart data query — pick grouping based on date range
	let chartGrouping: 'hour' | 'day' | 'month' | 'year';
	let loopEndDate: Date = new Date(endDate);

	switch (period) {
		case 'today':
			chartGrouping = 'hour';
			// Ensure we show all 24 hours of today
			startDate.setHours(0, 0, 0, 0);
			loopEndDate = new Date(startDate);
			loopEndDate.setHours(23, 59, 59, 999);
			break;
		case 'week':
			chartGrouping = 'day';
			// Show the running week (starting from previous Sunday)
			startDate = new Date(now);
			startDate.setDate(now.getDate() - now.getDay());
			startDate.setHours(0, 0, 0, 0);
			loopEndDate = new Date(startDate);
			loopEndDate.setDate(startDate.getDate() + 6);
			loopEndDate.setHours(23, 59, 59, 999);
			break;
		case 'month':
			chartGrouping = 'day';
			// Show all days of the current month
			loopEndDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999);
			break;
		case 'year':
			chartGrouping = 'month';
			// Show all 12 months of the current year
			startDate = new Date(now.getFullYear(), 0, 1);
			loopEndDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
			break;
		case 'all':
			chartGrouping = 'year';
			const firstOrder = db
				.select({ date: orders.createdAt })
				.from(orders)
				.orderBy(orders.createdAt)
				.limit(1)
				.get();
			
			const startYear = firstOrder ? new Date(firstOrder.date).getFullYear() : now.getFullYear();
			// Ensure we show at least 10 years back from now
			const minStartYear = now.getFullYear() - 9;
			startDate = new Date(Math.min(startYear, minStartYear), 0, 1);
			startDate.setHours(0, 0, 0, 0);
			loopEndDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
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
		hour: sql<string>`strftime('%Y-%m-%d %H', ${orders.createdAt} / 1000, 'unixepoch', 'localtime')`,
		day: sql<string>`date(${orders.createdAt} / 1000, 'unixepoch', 'localtime')`,
		month: sql<string>`strftime('%Y-%m', ${orders.createdAt} / 1000, 'unixepoch', 'localtime')`,
		year: sql<string>`strftime('%Y', ${orders.createdAt} / 1000, 'unixepoch', 'localtime')`
	};

	const chartDataRaw = db
		.select({
			date: dateExpressionMap[chartGrouping].as('date'),
			total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`.as('total'),
			count: sql<number>`count(*)`.as('count')
		})
		.from(orders)
		.where(
			and(
				eq(orders.status, 'completed'),
				gte(orders.createdAt, startDate),
				lt(orders.createdAt, endDate)
			)
		)
		.groupBy(sql`date`)
		.orderBy(sql`date`)
		.all();

	const chartData: { date: string; fullDate: string; amount: number; count: number }[] = [];
	const salesByDate = new Map(chartDataRaw.map((d) => [d.date, { amount: d.total, count: d.count }]));

	const currentDate = new Date(startDate);
	currentDate.setMinutes(0, 0, 0);

	while (currentDate <= loopEndDate) {
		let key: string;
		let label: string;

		if (chartGrouping === 'hour') {
			const year = currentDate.getFullYear();
			const month = String(currentDate.getMonth() + 1).padStart(2, '0');
			const day = String(currentDate.getDate()).padStart(2, '0');
			const hour = String(currentDate.getHours()).padStart(2, '0');
			key = `${year}-${month}-${day} ${hour}`;
			const h = currentDate.getHours();
			const ampm = h >= 12 ? 'PM' : 'AM';
			const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
			label = `${h12}${ampm}`;
			currentDate.setHours(currentDate.getHours() + 1);
		} else if (chartGrouping === 'day') {
			const year = currentDate.getFullYear();
			const month = String(currentDate.getMonth() + 1).padStart(2, '0');
			const day = String(currentDate.getDate()).padStart(2, '0');
			key = `${year}-${month}-${day}`;
			label = currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
			currentDate.setDate(currentDate.getDate() + 1);
		} else if (chartGrouping === 'month') {
			const year = currentDate.getFullYear();
			const month = String(currentDate.getMonth() + 1).padStart(2, '0');
			key = `${year}-${month}`;
			label = currentDate.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
			currentDate.setMonth(currentDate.getMonth() + 1);
		} else {
			const year = currentDate.getFullYear();
			key = `${year}`;
			label = `${year}`;
			currentDate.setFullYear(currentDate.getFullYear() + 1);
		}

		const sale = salesByDate.get(key);
		chartData.push({
			date: label,
			fullDate: key,
			amount: sale?.amount ?? 0,
			count: sale?.count ?? 0
		});
	}

	// Sales by category
	const categoryBreakdown = db
		.select({
			category: sql<string>`COALESCE(
        (SELECT p.category FROM product p
         JOIN product_variant pv ON pv.product_id = p.id
         WHERE pv.id = ${orderItems.variantId}),
        'Unknown'
      )`.as('category'),
			totalQty: sql<number>`sum(${orderItems.quantity})`.as('totalQty'),
			totalRevenue:
				sql<number>`sum(${orderItems.priceAtSale} * ${orderItems.quantity} * (1 - ${orderItems.discount} / 100))`.as(
					'totalRevenue'
				)
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(
			and(
				eq(orders.status, 'completed'),
				gte(orders.createdAt, startDate),
				lt(orders.createdAt, endDate)
			)
		)
		.groupBy(sql`category`)
		.orderBy(desc(sql`totalRevenue`))
		.limit(10)
		.all();

	// Cashier performance
	const cashierPerformance = db
		.select({
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
		.limit(10)
		.all();

	// Top customers
	const topCustomers = db
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
		.limit(10)
		.all();

	// Refund/void summary
	const refundSummary = db
		.select({
			status: orders.status,
			count: sql<number>`count(*)`.as('count'),
			total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`.as('total')
		})
		.from(orders)
		.where(
			and(
				inArray(orders.status, ['refunded', 'void']),
				gte(orders.createdAt, startDate),
				lt(orders.createdAt, endDate)
			)
		)
		.groupBy(orders.status)
		.all();

	// Expense breakdown (top expenses grouped by description)
	const expenseBreakdown = db
		.select({
			description: cashbook.description,
			total: sql<number>`coalesce(sum(${cashbook.amount}), 0)`.as('total'),
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
		.limit(10)
		.all();

	// Inventory Stock Updates
	const stockSummary = db
		.select({
			totalStocked: sql<number>`coalesce(sum(${stockLogs.changeAmount}), 0)`
		})
		.from(stockLogs)
		.where(
			and(
				sql`${stockLogs.changeAmount} > 0`,
				gte(stockLogs.createdAt, startDate),
				lt(stockLogs.createdAt, endDate)
			)
		)
		.get();

	const stockUpdates = db
		.select({
			id: stockLogs.id,
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
		.limit(10)
		.all();

	const grossProfit = (salesSummary?.total ?? 0) - (expenseSummary?.total ?? 0);

	const storeNameRow = db
		.select({ value: storeSettings.value })
		.from(storeSettings)
		.where(eq(storeSettings.key, 'store_name'))
		.get();

	return {
		storeName: storeNameRow?.value ?? 'Store',
		period,
		startDate: startDate.toISOString().split('T')[0],
		endDate: endDate.toISOString().split('T')[0],
		salesSummary: salesSummary ?? { count: 0, total: 0, avgOrder: 0, totalDiscount: 0 },
		itemsSold: itemsSoldSummary?.totalQty ?? 0,
		grossProfit,
		paymentBreakdown,
		expenseSummary: expenseSummary ?? { count: 0, total: 0 },
		topProducts,
		chartData,
		chartGrouping,
		categoryBreakdown,
		cashierPerformance,
		topCustomers,
		refundSummary,
		expenseBreakdown,
		stockSummary: stockSummary ?? { totalStocked: 0 },
		stockUpdates
	};
};
