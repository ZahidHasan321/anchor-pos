import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	products,
	productVariants,
	customers,
	orders,
	orderItems,
	stockLogs,
	cashbook,
	storeSettings
} from '$lib/server/db/schema';
import { eq, sql, inArray, and, gt } from 'drizzle-orm';
import { generateId } from '$lib/utils';
import { logAuditEvent } from '$lib/server/audit';
import { queryVariants, queryVariantsPS } from '$lib/server/pos-query';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const search = url.searchParams.get('search') || '';
	const category = url.searchParams.get('category') || 'All';
	const isElectron = process.env.BUILD_TARGET === 'electron';

	// Immediate return, deferred streaming for everything else
	return {
		search,
		category,
		user: locals.user,

		// Streamed data
		streamed: (async () => {
			if (isElectron) {
				const { getPowerSyncDb } = await import('$lib/powersync/db');
				const psDb = getPowerSyncDb();
				const [variantsData, categoryRows, recentCustomers, settingsRows] = await Promise.all([
					queryVariantsPS(search, category),
					psDb.getAll(
						'SELECT DISTINCT category FROM products p INNER JOIN product_variants pv ON p.id = pv.product_id WHERE pv.stock_quantity > 0'
					),
					psDb.getAll('SELECT * FROM customers LIMIT 50'),
					psDb.getAll('SELECT * FROM store_settings')
				]);

				const settings = settingsRows.reduce((acc: Record<string, string>, row: any) => {
					acc[row.key] = row.value;
					return acc;
				}, {} as Record<string, string>);

				return {
					products: variantsData.items,
					hasMore: variantsData.hasMore,
					categories: ['All', ...categoryRows.map((r: any) => r.category).sort()],
					customers: recentCustomers,
					storeSettings: settings
				};
			}

			if (!db)
				return {
					products: [],
					hasMore: false,
					categories: ['All'],
					customers: [],
					storeSettings: {}
				};

			const [variantsData, categoryRows, recentCustomers, settingsRows] = await Promise.all([
				queryVariants(search, category),
				// Filter categories to only those with in-stock products
				db
					.selectDistinct({ category: products.category })
					.from(products)
					.innerJoin(productVariants, eq(products.id, productVariants.productId))
					.where(gt(productVariants.stockQuantity, 0)),
				// Only load 50 recent customers to prevent large payload
				db.select().from(customers).limit(50),
				db.select().from(storeSettings)
			]);

			const settings = settingsRows.reduce(
				(acc: Record<string, string>, row: { key: string; value: string }) => {
					acc[row.key] = row.value;
					return acc;
				},
				{} as Record<string, string>
			);

			return {
				products: variantsData.items,
				hasMore: variantsData.hasMore,
				categories: ['All', ...categoryRows.map((r: { category: string }) => r.category).sort()],
				customers: recentCustomers,
				storeSettings: settings
			};
		})()
	};
};

interface CartItem {
	variantId: string;
	quantity: number;
	price: number;
	productName: string;
	size: string;
	color: string | null;
	discount: number;
}

interface DBVariant {
	id: string;
	price: number;
	productName: string;
	size: string;
	color: string | null;
	stockQuantity: number;
}

export const actions: Actions = {
	checkout: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const isElectron = process.env.BUILD_TARGET === 'electron';

		const data = await request.formData();
		const cartItemsRaw = data.get('cartItems') as string;
		const customerId = (data.get('customerId') as string) || null;
		const paymentMethod = (data.get('paymentMethod') as 'cash' | 'card') || 'cash';
		const cashReceived = parseFloat(data.get('cashReceived') as string) || 0;
		const globalDiscount = Math.min(
			100,
			Math.max(0, parseFloat(data.get('globalDiscount') as string) || 0)
		);

		let cartItems: CartItem[] = [];
		try {
			cartItems = JSON.parse(cartItemsRaw);
		} catch (e) {
			return fail(400, { error: 'Invalid cart data' });
		}

		if (cartItems.length === 0) {
			return fail(400, { error: 'Cart is empty' });
		}

		// Precision helper for financial rounding
		const round2 = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;
		const variantIds = cartItems.map((item: CartItem) => item.variantId);

		if (isElectron) {
			// OFFLINE CHECKOUT via PowerSync
			try {
				const { getPowerSyncDb } = await import('$lib/powersync/db');
				const psDb = getPowerSyncDb();
				
				const result = await psDb.writeTransaction(async (tx) => {
					// 1. Fetch variants from local DB
					const placeholders = variantIds.map(() => '?').join(',');
					const dbVariants = await tx.getAll(`
						SELECT pv.id, pv.price, p.name as productName, pv.size, pv.color, pv.stock_quantity as stockQuantity
						FROM product_variants pv
						INNER JOIN products p ON pv.product_id = p.id
						WHERE pv.id IN (${placeholders})
					`, variantIds);

					const dbVariantsMap = new Map(dbVariants.map((v: any) => [v.id, v]));
					const orderId = generateId();
					let subtotal = 0;
					let totalDiscount = 0;

					for (const item of cartItems) {
						const dbVariant = dbVariantsMap.get(item.variantId) as any;
						if (!dbVariant) throw new Error(`Product not found locally: ${item.variantId}`);
						if (dbVariant.stockQuantity < item.quantity) {
							throw new Error(`Insufficient stock for ${dbVariant.productName}.`);
						}

						item.price = dbVariant.price;
						item.productName = dbVariant.productName;
						item.size = dbVariant.size;
						item.color = dbVariant.color;
						item.discount = Math.min(100, Math.max(0, item.discount || 0));

						const linePrice = item.price * item.quantity;
						const lineDiscount = round2(linePrice * (item.discount / 100));
						subtotal += linePrice - lineDiscount;
						totalDiscount += lineDiscount;
					}

					const finalGlobalDiscount = round2(subtotal * (globalDiscount / 100));
					const totalAmount = round2(subtotal - finalGlobalDiscount);
					totalDiscount = round2(totalDiscount + finalGlobalDiscount);
					const changeGiven = round2(Math.max(0, cashReceived - totalAmount));

					const now = new Date().toISOString();

					// 3. Create order
					await tx.execute(`
						INSERT INTO orders (id, customer_id, user_id, total_amount, status, payment_method, discount_amount, cash_received, change_given, created_at)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					`, [orderId, customerId, locals.user!.id, totalAmount, 'completed', paymentMethod, totalDiscount, cashReceived, changeGiven, now]);

					// 4. Record items & Adjust stock
					for (const item of cartItems) {
						await tx.execute(`
							INSERT INTO order_items (id, order_id, variant_id, quantity, price_at_sale, discount, product_name, variant_label)
							VALUES (?, ?, ?, ?, ?, ?, ?, ?)
						`, [generateId(), orderId, item.variantId, item.quantity, item.price, item.discount, item.productName, `${item.size}${item.color ? ' / ' + item.color : ''}`]);

						await tx.execute('UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.quantity, item.variantId]);

						await tx.execute(`
							INSERT INTO stock_logs (id, variant_id, change_amount, reason, user_id, created_at)
							VALUES (?, ?, ?, ?, ?, ?)
						`, [generateId(), item.variantId, -item.quantity, 'sale', locals.user!.id, now]);
					}

					// 5. Update cashbook
					await tx.execute(`
						INSERT INTO cashbook (id, amount, type, description, user_id, created_at)
						VALUES (?, ?, ?, ?, ?, ?)
					`, [generateId(), totalAmount, 'in', `Sale ${orderId.slice(0, 8).toUpperCase()}`, locals.user!.id, now]);

					return { orderId, orderNumber: orderId.slice(0, 8).toUpperCase(), changeGiven };
				});

				return { success: true, ...result };
			} catch (e: any) {
				console.error('[POS] Local checkout failed:', e);
				return fail(500, { error: e.message || 'Local transaction failed' });
			}
		}

		if (!db) return fail(503, { error: 'Direct database connection unavailable.' });

		try {
			const result = await db.transaction(async (tx: any) => {
				// 1. Fetch & Lock variants for stock integrity
				const dbVariants = await tx
					.select({
						id: productVariants.id,
						price: productVariants.price,
						productName: products.name,
						size: productVariants.size,
						color: productVariants.color,
						stockQuantity: productVariants.stockQuantity
					})
					.from(productVariants)
					.innerJoin(products, eq(productVariants.productId, products.id))
					.where(inArray(productVariants.id, variantIds))
					.for('update', { of: productVariants }); // PostgreSQL row-level locking for variants only

				const dbVariantsMap = new Map(dbVariants.map((v: DBVariant) => [v.id, v]));

				const orderId = generateId();
				let subtotal = 0;
				let totalDiscount = 0;

				// Validate Cart Items
				for (const item of cartItems) {
					const dbVariant = dbVariantsMap.get(item.variantId) as DBVariant;
					if (!dbVariant) throw new Error(`Product variant not found: ${item.variantId}`);
					if (dbVariant.stockQuantity < item.quantity) {
						throw new Error(`Insufficient stock for ${dbVariant.productName}.`);
					}

					item.price = dbVariant.price;
					item.productName = dbVariant.productName;
					item.size = dbVariant.size;
					item.color = dbVariant.color;
					item.discount = Math.min(100, Math.max(0, item.discount || 0));

					const linePrice = item.price * item.quantity;
					const lineDiscount = round2(linePrice * (item.discount / 100));
					subtotal += linePrice - lineDiscount;
					totalDiscount += lineDiscount;
				}

				// Apply global discount
				const finalGlobalDiscount = round2(subtotal * (globalDiscount / 100));
				const totalAmount = round2(subtotal - finalGlobalDiscount);
				totalDiscount = round2(totalDiscount + finalGlobalDiscount);

				const changeGiven = round2(Math.max(0, cashReceived - totalAmount));

				// 3. Create order
				await tx.insert(orders).values({
					id: orderId,
					customerId,
					userId: locals.user!.id,
					totalAmount,
					paymentMethod,
					discountAmount: totalDiscount,
					cashReceived,
					changeGiven,
					status: 'completed'
				});

				// 4. Record items & Adjust stock
				for (const item of cartItems) {
					await tx.insert(orderItems).values({
						id: generateId(),
						orderId,
						variantId: item.variantId,
						quantity: item.quantity,
						priceAtSale: item.price,
						discount: item.discount,
						productName: item.productName,
						variantLabel: `${item.size}${item.color ? ' / ' + item.color : ''}`
					});

					await tx
						.update(productVariants)
						.set({ stockQuantity: sql`stock_quantity - ${item.quantity}` })
						.where(eq(productVariants.id, item.variantId));

					await tx.insert(stockLogs).values({
						id: generateId(),
						variantId: item.variantId,
						changeAmount: -item.quantity,
						reason: 'sale',
						userId: locals.user!.id
					});
				}

				// 5. Update cashbook
				await tx.insert(cashbook).values({
					id: generateId(),
					amount: totalAmount,
					type: 'in',
					description: `Sale ${orderId.slice(0, 8).toUpperCase()}`,
					userId: locals.user!.id
				});

				return { orderId, orderNumber: orderId.slice(0, 8).toUpperCase(), changeGiven };
			});

			await logAuditEvent({
				userId: locals.user!.id,
				userName: locals.user!.name,
				action: 'CREATE_ORDER',
				entity: 'orders',
				entityId: result.orderId,
				details: `POS Sale ${result.orderNumber} for ${result.orderId}`
			});

			return { success: true, ...result };
		} catch (e: any) {
			console.error('Checkout failed:', e);
			return fail(500, { error: e.message || 'Transaction failed' });
		}
	},

	addCustomer: async ({ request }) => {
		if (!db) return fail(503, { error: 'Direct database connection unavailable.' });
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const phone = (data.get('phone') as string)?.trim() || null;

		if (!name) return fail(400, { error: 'Name is required' });

		// Unique check for phone
		if (phone) {
			const existing = await db
				.select()
				.from(customers)
				.where(eq(customers.phone, phone))
				.limit(1);
			if (existing.length > 0) {
				return fail(400, { error: 'A customer with this phone number already exists.' });
			}
		}

		const id = generateId();
		try {
			await db.insert(customers).values({ id, name, phone });
		} catch (e) {
			return fail(500, { error: 'Failed to create customer record.' });
		}

		return { success: true, customer: { id, name, phone } };
	}
};
