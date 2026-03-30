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
import { eq, sql, gte, lt, and, desc, inArray, gt } from 'drizzle-orm';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user || !(await hasPermission(locals.user.role, 'reports'))) {
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

	// Helper: get current date/time components in store timezone (Asia/Dhaka)
	const getStoreDateParts = (d: Date = new Date()) => {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: storeTimezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour12: false
		})
			.formatToParts(d)
			.reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
		return {
			year: parseInt(parts.year),
			month: parseInt(parts.month) - 1, // 0-indexed
			day: parseInt(parts.day)
		};
	};

	// Helper: create a proper UTC Date from Dhaka date components (Asia/Dhaka = UTC+6, no DST)
	// Uses Date constructor for month/day overflow handling, then adjusts for UTC+6
	const dhakaDate = (year: number, month: number, day: number, h = 0, m = 0, s = 0, ms = 0) => {
		// Use UTC constructor so month/day overflow is handled (e.g. day 32 → next month)
		// Then subtract 6 hours to convert from Dhaka wall-clock to actual UTC
		return new Date(Date.UTC(year, month, day, h - 6, m, s, ms));
	};

	const now = getStoreDateParts();
	let startDate: Date;
	// endDate uses start of NEXT day with lt (<) for correct boundary (no sub-millisecond gaps)
	let endDate: Date = dhakaDate(now.year, now.month, now.day + 1);

	switch (period) {
		case 'today':
			startDate = dhakaDate(now.year, now.month, now.day);
			break;
		case 'week':
			startDate = dhakaDate(now.year, now.month, now.day - 7);
			break;
		case 'month':
			startDate = dhakaDate(now.year, now.month, 1);
			break;
		case 'year':
			startDate = dhakaDate(now.year, 0, 1);
			break;
		case 'custom':
			if (customFrom) {
				const [y, m, d] = customFrom.split('-').map(Number);
				startDate = dhakaDate(y, m - 1, d);
			} else {
				startDate = dhakaDate(now.year, now.month, 1);
			}
			if (isNaN(startDate.getTime()))
				startDate = dhakaDate(now.year, now.month, 1);

			if (customTo) {
				const [y, m, d] = customTo.split('-').map(Number);
				endDate = dhakaDate(y, m - 1, d + 1); // start of next day
			} else {
				endDate = dhakaDate(now.year, now.month, now.day + 1);
			}
			if (isNaN(endDate.getTime())) endDate = dhakaDate(now.year, now.month, now.day + 1);
			break;
		case 'all':
		default:
			const firstOrderResult = db
				? await db
						.select({ date: orders.createdAt })
						.from(orders)
						.orderBy(orders.createdAt)
						.limit(1)
				: [];
			if (firstOrderResult[0]?.date) {
				const fd = getStoreDateParts(new Date(firstOrderResult[0].date));
				startDate = dhakaDate(fd.year, fd.month, fd.day);
			} else {
				startDate = dhakaDate(now.year, now.month, 1);
			}
			break;
	}

	let chartGrouping: 'hour' | 'day' | 'month' | 'year';
	const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

	if (period === 'today') {
		chartGrouping = 'hour';
	} else if (daysDiff <= 3) {
		chartGrouping = 'hour';
	} else if (daysDiff <= 95) {
		chartGrouping = 'day';
	} else if (daysDiff <= 730) {
		chartGrouping = 'month';
	} else {
		chartGrouping = 'year';
	}

	// Format a Date to YYYY-MM-DD in store timezone (dates are already Dhaka-aware UTC instants)
	const formatDateToStore = (d: Date) => {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: storeTimezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		})
			.formatToParts(d)
			.reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
		return `${parts.year}-${parts.month}-${parts.day}`;
	};

	const dateExpressionMap = {
		hour: sql<string>`to_char(${orders.createdAt} AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD HH24')`,
		day: sql<string>`to_char(${orders.createdAt} AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD')`,
		month: sql<string>`to_char(${orders.createdAt} AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM')`,
		year: sql<string>`to_char(${orders.createdAt} AT TIME ZONE 'Asia/Dhaka', 'YYYY')`
	};

	// 2. Streamed data (Deferred)
	return {
		storeName: settings.store_name ?? 'Store',
		period,
		startDate: formatDateToStore(startDate),
		endDate: formatDateToStore(new Date(endDate.getTime() - 1)), // endDate is start-of-next-day, display the actual last day
		chartGrouping,

		// Summaries (Instantly visible cards)
		summaries: (async () => {
			if (!db)
				return {
					salesSummary: { count: 0, total: 0, avgOrder: 0, totalDiscount: 0 },
					expenseSummary: { total: 0 },
					itemsSold: 0,
					grossProfit: 0,
					inventoryRetailValue: 0,
					inventoryCostValue: 0,
					totalStocked: 0
				};
			const [sales, expenses, items, inventory, stockSum] = await Promise.all([
				db
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
					),

				db
					.select({
						total: sql<number>`coalesce(sum(${cashbook.amount}), 0)`
					})
					.from(cashbook)
					.where(
						and(
							eq(cashbook.type, 'out'),
							eq(cashbook.category, 'expense'),
							gte(cashbook.createdAt, startDate),
							lt(cashbook.createdAt, endDate)
						)
					),

				db
					.select({
						totalQty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
						totalCost: sql<number>`coalesce(sum(${orderItems.costAtSale} * ${orderItems.quantity}), 0)`
					})
					.from(orderItems)
					.innerJoin(orders, eq(orderItems.orderId, orders.id))
					.where(
						and(
							eq(orders.status, 'completed'),
							eq(orderItems.status, 'completed'),
							gte(orders.createdAt, startDate),
							lt(orders.createdAt, endDate)
						)
					),

				db
					.select({
						totalCost: sql<number>`COALESCE(SUM(COALESCE(NULLIF(${productVariants.costPrice}, 0), ${products.costPrice}, 0) * ${productVariants.stockQuantity}), 0)`,
						totalRetail: sql<number>`COALESCE(SUM(${productVariants.price} * ${productVariants.stockQuantity}), 0)`
					})
					.from(productVariants)
					.innerJoin(products, eq(productVariants.productId, products.id)),

				db
					.select({ totalStocked: sql<number>`coalesce(sum(${stockLogs.changeAmount}), 0)` })
					.from(stockLogs)
					.where(
						and(
							sql`${stockLogs.changeAmount} > 0`,
							gte(stockLogs.createdAt, startDate),
							lt(stockLogs.createdAt, endDate)
						)
					)
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
			const res = await db
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
						eq(orderItems.status, 'completed'),
						gte(orders.createdAt, startDate),
						lt(orders.createdAt, endDate)
					)
				)
				.groupBy(orderItems.productName, products.id)
				.orderBy(desc(sql`"totalQty"`))
				.limit(5);
			return res;
		})(),

		categoryBreakdown: (async () => {
			if (!db) return [];
			const res = await db
				.select({
					category: sql<string>`coalesce(${products.category}, 'Unknown')`.as('category'),
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
						eq(orderItems.status, 'completed'),
						gte(orders.createdAt, startDate),
						lt(orders.createdAt, endDate)
					)
				)
				.groupBy(products.category)
				.orderBy(desc(sql`"totalRevenue"`))
				.limit(10);
			return res;
		})(),

		paymentBreakdown: (async () => {
			if (!db) return [];

			const result = await db
				.select({
					cashTotal: sql<number>`coalesce(sum(coalesce(${orders.cashAmount}, CASE WHEN ${orders.paymentMethod} = 'cash' THEN ${orders.totalAmount} ELSE 0 END)), 0)`,
					cashCount: sql<number>`count(*) FILTER (WHERE coalesce(${orders.cashAmount}, 0) > 0 OR ${orders.paymentMethod} = 'cash')`,
					cardTotal: sql<number>`coalesce(sum(coalesce(${orders.cardAmount}, CASE WHEN ${orders.paymentMethod} = 'card' THEN ${orders.totalAmount} ELSE 0 END)), 0)`,
					cardCount: sql<number>`count(*) FILTER (WHERE coalesce(${orders.cardAmount}, 0) > 0 OR ${orders.paymentMethod} = 'card')`,
					mobileTotal: sql<number>`coalesce(sum(coalesce(${orders.mobileAmount}, CASE WHEN ${orders.paymentMethod} = 'mobile' THEN ${orders.totalAmount} ELSE 0 END)), 0)`,
					mobileCount: sql<number>`count(*) FILTER (WHERE coalesce(${orders.mobileAmount}, 0) > 0 OR ${orders.paymentMethod} = 'mobile')`
				})
				.from(orders)
				.where(
					and(
						eq(orders.status, 'completed'),
						gte(orders.createdAt, startDate),
						lt(orders.createdAt, endDate)
					)
				);

			const r = result[0];
			return [
				{ method: 'cash', count: r?.cashCount ?? 0, total: r?.cashTotal ?? 0 },
				{ method: 'card', count: r?.cardCount ?? 0, total: r?.cardTotal ?? 0 },
				{ method: 'mobile', count: r?.mobileCount ?? 0, total: r?.mobileTotal ?? 0 }
			];
		})(),

		refundSummary: (async () => {
			if (!db) return [];
			return db
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
				.groupBy(orders.status);
		})(),

		expenseBreakdown: (async () => {
			if (!db) return [];
			return db
				.select({
					description: cashbook.description,
					total: sql<number>`coalesce(sum(${cashbook.amount}), 0)`.as('total'),
					count: sql<number>`count(*)`.as('count')
				})
				.from(cashbook)
				.where(
					and(
						eq(cashbook.type, 'out'),
						eq(cashbook.category, 'expense'),
						gte(cashbook.createdAt, startDate),
						lt(cashbook.createdAt, endDate)
					)
				)
				.groupBy(cashbook.description)
				.orderBy(desc(sql`total`))
				.limit(5);
		})(),

		stockUpdates: (async () => {
			if (!db) return [];
			return db
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
				.limit(10);
		})(),

		staffPerformance: (async () => {
			if (!db) return [];
			return db
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
				.orderBy(desc(sql`"totalSales"`))
				.limit(10);
		})(),

		topCustomers: (async () => {
			if (!db) return [];
			return db
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
				.orderBy(desc(sql`"totalSpent"`))
				.limit(5);
		})(),

		chartData: (async () => {
			if (!db) return [];
			const dateExpr = dateExpressionMap[chartGrouping];
			return db
				.select({
					date: dateExpr.as('date'),
					amount: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`.as('amount'),
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
				.groupBy(dateExpr)
				.orderBy(dateExpr);
		})()
	};
};
