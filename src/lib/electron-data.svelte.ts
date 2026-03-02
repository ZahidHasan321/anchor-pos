/**
 * Client-side data layer for Electron mode.
 * Wraps PowerSync queries for use in Svelte components.
 * Each query returns reactive state that auto-refreshes via PowerSync's watch().
 */
import { powersync } from './powersync.svelte';
import { browser } from '$app/environment';
import { generateId } from './utils';

export const isElectron = browser && !!(window as any).electron;

// --- Reactive query helper ---
type WatchResult<T> = { data: T[]; loading: boolean };

function createWatchQuery<T = any>(sql: string, params: any[] = []): WatchResult<T> {
	let result = $state<WatchResult<T>>({ data: [], loading: true });

	if (browser && powersync.db) {
		const run = async () => {
			try {
				// Initial fetch
				const initial = await powersync.db.getAll(sql, params);
				result.data = initial as T[];
				result.loading = false;

				// Then watch for changes
				const watch = powersync.db.watch(sql, params);
				for await (const res of watch) {
					result.data = (res.rows as any)?._array || [];
				}
			} catch (e) {
				console.error('watchQuery error:', e);
				result.loading = false;
			}
		};
		run();
	}

	return result;
}

// --- Products ---
export function queryProducts(search = '', category = 'All') {
	let whereClause = 'WHERE pv.stock_quantity > 0';
	const params: any[] = [];

	if (category !== 'All') {
		whereClause += ' AND p.category = ?';
		params.push(category);
	}
	if (search) {
		whereClause += ' AND (p.name LIKE ? OR pv.barcode LIKE ?)';
		params.push(`%${search}%`, `%${search}%`);
	}

	return createWatchQuery(`
		SELECT pv.id, p.id as productId, p.name as productName,
			pv.size, pv.color, pv.barcode, p.category, pv.price, pv.discount,
			pv.stock_quantity as stockQuantity, p.base_price as basePrice
		FROM product_variants pv
		JOIN products p ON pv.product_id = p.id
		${whereClause}
		ORDER BY p.name
	`, params);
}

export function queryCategories() {
	return createWatchQuery<{ category: string }>(
		'SELECT DISTINCT category FROM products p INNER JOIN product_variants pv ON p.id = pv.product_id WHERE pv.stock_quantity > 0'
	);
}

// --- Customers ---
export function queryCustomers(search = '') {
	if (!search || search.length < 2) {
		return createWatchQuery('SELECT * FROM customers LIMIT 50');
	}
	return createWatchQuery(
		'SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? LIMIT 50',
		[`%${search}%`, `%${search}%`]
	);
}

export function queryCustomerDetail(id: string) {
	return {
		customer: createWatchQuery('SELECT * FROM customers WHERE id = ?', [id]),
		orders: createWatchQuery(`
			SELECT o.*, u.name as userName
			FROM orders o
			LEFT JOIN users u ON o.user_id = u.id
			WHERE o.customer_id = ?
			ORDER BY o.created_at DESC
		`, [id])
	};
}

// --- Orders ---
export function queryOrders(opts: {
	page?: number;
	perPage?: number;
	search?: string;
	status?: string;
	dateFrom?: string;
	dateTo?: string;
} = {}) {
	const { page = 1, perPage = 20, search = '', status = '', dateFrom = '', dateTo = '' } = opts;
	const offset = (page - 1) * perPage;
	let where = 'WHERE 1=1';
	const params: any[] = [];

	if (dateFrom) { where += ' AND o.created_at >= ?'; params.push(dateFrom + 'T00:00:00'); }
	if (dateTo) { where += ' AND o.created_at <= ?'; params.push(dateTo + 'T23:59:59.999'); }
	if (status) { where += ' AND o.status = ?'; params.push(status); }
	if (search) {
		where += ' AND (o.id LIKE ? OR CAST(o.order_number AS TEXT) LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)';
		const p = `%${search}%`;
		params.push(p, p, p, p);
	}

	return createWatchQuery(`
		SELECT
			o.id, o.order_number as orderNumber, o.total_amount as totalAmount,
			o.status, o.payment_method as paymentMethod, o.created_at as createdAt,
			c.name as customerName, u.name as userName
		FROM orders o
		LEFT JOIN customers c ON o.customer_id = c.id
		LEFT JOIN users u ON o.user_id = u.id
		${where}
		ORDER BY o.created_at DESC
		LIMIT ? OFFSET ?
	`, [...params, perPage, offset]);
}

export function queryOrderCount(opts: {
	search?: string; status?: string; dateFrom?: string; dateTo?: string;
} = {}) {
	const { search = '', status = '', dateFrom = '', dateTo = '' } = opts;
	let where = 'WHERE 1=1';
	const params: any[] = [];

	if (dateFrom) { where += ' AND o.created_at >= ?'; params.push(dateFrom + 'T00:00:00'); }
	if (dateTo) { where += ' AND o.created_at <= ?'; params.push(dateTo + 'T23:59:59.999'); }
	if (status) { where += ' AND o.status = ?'; params.push(status); }
	if (search) {
		where += ' AND (o.id LIKE ? OR CAST(o.order_number AS TEXT) LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)';
		const p = `%${search}%`;
		params.push(p, p, p, p);
	}

	return createWatchQuery<{ count: number }>(`
		SELECT count(*) as count
		FROM orders o
		LEFT JOIN customers c ON o.customer_id = c.id
		${where}
	`, params);
}

export function queryOrderDetail(id: string) {
	return {
		order: createWatchQuery(`
			SELECT o.*, c.name as customerName, c.phone as customerPhone, u.name as userName
			FROM orders o
			LEFT JOIN customers c ON o.customer_id = c.id
			LEFT JOIN users u ON o.user_id = u.id
			WHERE o.id = ?
		`, [id]),
		items: createWatchQuery(`
			SELECT oi.*, pv.stock_quantity as currentStock
			FROM order_items oi
			LEFT JOIN product_variants pv ON oi.variant_id = pv.id
			WHERE oi.order_id = ?
		`, [id])
	};
}

// --- Cashbook ---
export function queryCashbook(dateStart: string, dateEnd: string) {
	return {
		entries: createWatchQuery(`
			SELECT c.id, c.amount, c.type, c.description, c.created_at as createdAt,
				u.name as userName
			FROM cashbook c
			LEFT JOIN users u ON c.user_id = u.id
			WHERE c.created_at >= ? AND c.created_at < ?
			ORDER BY c.created_at DESC
		`, [dateStart, dateEnd]),
		totals: createWatchQuery(`
			SELECT type, sum(amount) as total
			FROM cashbook
			WHERE created_at >= ? AND created_at < ?
			GROUP BY type
		`, [dateStart, dateEnd])
	};
}

export function queryCashbookTransactions(opts: {
	type?: string; search?: string; page?: number; limit?: number;
} = {}) {
	const { type = 'all', search = '', page = 1, limit = 50 } = opts;
	const offset = (page - 1) * limit;
	let where = 'WHERE 1=1';
	const params: any[] = [];

	if (type === 'in' || type === 'out') { where += ' AND type = ?'; params.push(type); }
	if (search) { where += ' AND description LIKE ?'; params.push(`%${search}%`); }

	return createWatchQuery(`
		SELECT id, amount, type, description, created_at as createdAt,
			COALESCE((SELECT name FROM users WHERE id = user_id), 'System') as userName
		FROM cashbook
		${where}
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, [...params, limit, offset]);
}

export function queryExpenseDescriptions() {
	return createWatchQuery<{ description: string }>(
		"SELECT DISTINCT description FROM cashbook WHERE type = 'out'"
	);
}

// --- Inventory ---
export function queryInventory(opts: {
	page?: number; perPage?: number; category?: string; search?: string; stockStatus?: string;
} = {}) {
	const { page = 1, perPage = 20, category = '', search = '', stockStatus = '' } = opts;
	const offset = (page - 1) * perPage;
	let where = 'WHERE 1=1';
	const params: any[] = [];

	if (category) { where += ' AND p.category = ?'; params.push(category); }
	if (search) {
		where += ' AND (p.name LIKE ? OR p.category LIKE ? OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.barcode LIKE ?))';
		const p = `%${search}%`;
		params.push(p, p, p);
	}
	if (stockStatus === 'out') {
		where += ' AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.stock_quantity = 0)';
	} else if (stockStatus === 'low') {
		where += ' AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.stock_quantity > 0 AND pv.stock_quantity <= 5)';
	} else if (stockStatus === 'healthy') {
		where += ' AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.stock_quantity <= 5)';
	}

	return createWatchQuery(`
		SELECT p.id, p.name, p.category, p.base_price as templatePrice, p.default_discount as defaultDiscount,
			COALESCE((SELECT SUM(pv.stock_quantity) FROM product_variants pv WHERE pv.product_id = p.id), 0) as totalStock
		FROM products p
		${where}
		ORDER BY p.id DESC
		LIMIT ? OFFSET ?
	`, [...params, perPage, offset]);
}

export function queryInventoryStats() {
	return createWatchQuery(`
		SELECT
			COUNT(DISTINCT p.id) as totalProducts,
			COUNT(pv.id) as totalVariants,
			SUM(CASE WHEN pv.stock_quantity > 0 AND pv.stock_quantity <= 5 THEN 1 ELSE 0 END) as lowStockVariants,
			SUM(CASE WHEN pv.stock_quantity = 0 THEN 1 ELSE 0 END) as outOfStockVariants,
			COALESCE(SUM(pv.price * pv.stock_quantity), 0) as totalInventoryValue
		FROM product_variants pv
		INNER JOIN products p ON pv.product_id = p.id
	`);
}

export function queryInventoryCategories() {
	return createWatchQuery<{ category: string }>('SELECT DISTINCT category FROM products');
}

export function queryProductVariants(productIds: string[]) {
	if (productIds.length === 0) return { data: [], loading: false } as WatchResult<any>;
	const placeholders = productIds.map(() => '?').join(',');
	return createWatchQuery(
		`SELECT * FROM product_variants WHERE product_id IN (${placeholders})`,
		productIds
	);
}

// --- Dashboard ---
export function queryDashboardStats() {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
	const todayIso = today.toISOString();
	const monthIso = firstDayOfMonth.toISOString();

	return {
		todaySales: createWatchQuery(
			`SELECT count(*) as count, coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ?`,
			[todayIso]
		),
		monthlySales: createWatchQuery(
			`SELECT count(*) as count, coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ?`,
			[monthIso]
		),
		todayExpenses: createWatchQuery(
			`SELECT coalesce(sum(amount), 0) as total FROM cashbook WHERE type = 'out' AND created_at >= ?`,
			[todayIso]
		),
		inventoryValue: createWatchQuery(
			`SELECT coalesce(sum(price * stock_quantity), 0) as total FROM product_variants`
		)
	};
}

export function queryStockAlerts(threshold = 5) {
	return {
		items: createWatchQuery(`
			SELECT p.id, p.name, pv.size, pv.stock_quantity as stock
			FROM product_variants pv
			INNER JOIN products p ON pv.product_id = p.id
			WHERE pv.stock_quantity > 0 AND pv.stock_quantity <= ?
			LIMIT 10
		`, [threshold]),
		count: createWatchQuery<{ count: number }>(
			`SELECT count(*) as count FROM product_variants WHERE stock_quantity > 0 AND stock_quantity <= ?`,
			[threshold]
		)
	};
}

export function queryRecentOrders(limit = 10) {
	return createWatchQuery(
		`SELECT * FROM orders ORDER BY created_at DESC LIMIT ?`,
		[limit]
	);
}

export function queryTopProducts() {
	const firstDayOfMonth = new Date();
	firstDayOfMonth.setDate(1);
	firstDayOfMonth.setHours(0, 0, 0, 0);

	return createWatchQuery(`
		SELECT product_name as name, variant_label as variantLabel,
			sum(quantity) as totalQty, sum(quantity * price_at_sale) as totalRevenue
		FROM order_items oi
		INNER JOIN orders o ON oi.order_id = o.id
		WHERE o.status = 'completed' AND o.created_at >= ?
		GROUP BY product_name, variant_label
		ORDER BY totalQty DESC
		LIMIT 10
	`, [firstDayOfMonth.toISOString()]);
}

// --- Store Settings ---
export function queryStoreSettings() {
	return createWatchQuery<{ key: string; value: string }>('SELECT * FROM store_settings');
}

// --- Write Operations ---
export async function checkoutTransaction(
	cart: { items: any[]; customer: any; paymentMethod: string; cashReceived: number; subtotal: number; globalDiscount: number | null },
	userId: string
) {
	const round2 = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;
	const orderId = generateId();
	const now = new Date().toISOString();
	const globalDiscount = Math.min(100, Math.max(0, cart.globalDiscount || 0));

	await powersync.db.writeTransaction(async (tx) => {
		// Validate stock and compute totals
		let subtotal = 0;
		let totalDiscount = 0;
		const variantIds = cart.items.map(i => i.variantId);
		const placeholders = variantIds.map(() => '?').join(',');
		const dbVariants = await tx.getAll(`
			SELECT pv.id, pv.price, p.name as productName, pv.size, pv.color, pv.stock_quantity as stockQuantity
			FROM product_variants pv
			INNER JOIN products p ON pv.product_id = p.id
			WHERE pv.id IN (${placeholders})
		`, variantIds);
		const variantMap = new Map(dbVariants.map((v: any) => [v.id, v]));

		for (const item of cart.items) {
			const dbv = variantMap.get(item.variantId) as any;
			if (!dbv) throw new Error(`Product not found: ${item.variantId}`);
			if (dbv.stockQuantity < item.quantity) throw new Error(`Insufficient stock for ${dbv.productName}`);

			const linePrice = dbv.price * item.quantity;
			const lineDiscount = round2(linePrice * ((item.discount || 0) / 100));
			subtotal += linePrice - lineDiscount;
			totalDiscount += lineDiscount;
		}

		const finalGlobalDiscount = round2(subtotal * (globalDiscount / 100));
		const totalAmount = round2(subtotal - finalGlobalDiscount);
		totalDiscount = round2(totalDiscount + finalGlobalDiscount);
		const changeGiven = round2(Math.max(0, cart.cashReceived - totalAmount));

		// Create order
		await tx.execute(`
			INSERT INTO orders (id, customer_id, user_id, total_amount, status, payment_method, discount_amount, cash_received, change_given, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, [orderId, cart.customer?.id || null, userId, totalAmount, 'completed', cart.paymentMethod, totalDiscount, cart.cashReceived, changeGiven, now]);

		// Create items and update stock
		for (const item of cart.items) {
			const dbv = variantMap.get(item.variantId) as any;
			await tx.execute(`
				INSERT INTO order_items (id, order_id, variant_id, quantity, price_at_sale, discount, product_name, variant_label, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`, [generateId(), orderId, item.variantId, item.quantity, dbv.price, item.discount || 0, dbv.productName, `${dbv.size}${dbv.color ? ' / ' + dbv.color : ''}`, 'completed']);

			await tx.execute('UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.quantity, item.variantId]);

			await tx.execute(`
				INSERT INTO stock_logs (id, variant_id, change_amount, reason, user_id, created_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`, [generateId(), item.variantId, -item.quantity, 'sale', userId, now]);
		}

		// Cashbook entry
		await tx.execute(`
			INSERT INTO cashbook (id, amount, type, description, user_id, created_at)
			VALUES (?, ?, ?, ?, ?, ?)
		`, [generateId(), totalAmount, 'in', `Sale ${orderId.slice(0, 8).toUpperCase()}`, userId, now]);
	});

	return {
		orderId,
		orderNumber: orderId.slice(0, 8).toUpperCase(),
		changeGiven: round2(Math.max(0, cart.cashReceived - cart.subtotal))
	};
}

export async function addCustomerLocal(name: string, phone?: string) {
	const id = generateId();
	await powersync.db.execute('INSERT INTO customers (id, name, phone) VALUES (?, ?, ?)', [id, name, phone || null]);
	return { id, name, phone };
}

export async function addExpenseLocal(description: string, amount: number, userId: string) {
	const id = generateId();
	await powersync.db.execute(`
		INSERT INTO cashbook (id, amount, type, description, user_id, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, [id, amount, 'out', description, userId, new Date().toISOString()]);
	return { id };
}
