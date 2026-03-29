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
import { eq, sql, inArray, and, gt, desc } from 'drizzle-orm';
import { generateId, round2 } from '$lib/utils';
import { logAuditEvent } from '$lib/server/audit';
import { queryVariants } from '$lib/server/pos-query';
import env from '$lib/server/env';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const search = url.searchParams.get('search') || '';
	const category = url.searchParams.get('category') || 'All';
	const isNative = env.IS_NATIVE;

	// Immediate return, deferred streaming for everything else
	return {
		search,
		category,
		user: locals.user,

		isNative,

		// Streamed data
		streamed: (async () => {
			if (isNative) {
				return {
					products: [],
					hasMore: false,
					categories: ['All'],
					storeSettings: {}
				};
			}

			if (!db)
				return {
					products: [],
					hasMore: false,
					categories: ['All'],
					storeSettings: {}
				};

			const [variantsData, categoryRows, settingsRows] = await Promise.all([
				queryVariants(search, category),
				db
					.selectDistinct({ category: products.category })
					.from(products)
					.innerJoin(productVariants, eq(products.id, productVariants.productId))
					.where(and(gt(productVariants.stockQuantity, 0), eq(products.isActive, true), eq(productVariants.isActive, true))),
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
	costPrice: number;
	productName: string;
	size: string;
	color: string | null;
	stockQuantity: number;
}

export const actions: Actions = {
	checkout: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const isNative = env.IS_NATIVE;

		const data = await request.formData();
		const cartItemsRaw = data.get('cartItems') as string;
		const customerId = (data.get('customerId') as string) || null;
		const paymentMethod =
			(data.get('paymentMethod') as 'cash' | 'card' | 'split' | 'mobile') || 'cash';
		const cashReceived = parseFloat(data.get('cashReceived') as string) || 0;
		const globalDiscount = Math.min(
			100,
			Math.max(0, parseFloat(data.get('globalDiscount') as string) || 0)
		);

		const cashAmount = parseFloat(data.get('cashAmount') as string) || 0;
		const cardAmount = parseFloat(data.get('cardAmount') as string) || 0;
		const mobileAmount = parseFloat(data.get('mobileAmount') as string) || 0;
		const mobileMethod = (data.get('mobileMethod') as string) || null;
		const mobileTrxId = (data.get('mobileTrxId') as string) || null;
		const cardType = (data.get('cardType') as string) || null;
		const cardRef = (data.get('cardRef') as string) || null;

		let cartItems: CartItem[] = [];
		try {
			cartItems = JSON.parse(cartItemsRaw);
		} catch (e) {
			return fail(400, { error: 'Invalid cart data' });
		}

		if (cartItems.length === 0) {
			return fail(400, { error: 'Cart is empty' });
		}

		// Validate all quantities are positive integers
		for (const item of cartItems) {
			if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
				return fail(400, { error: 'Invalid item quantity' });
			}
		}

		// Validate split payment amounts sum to total
		if (paymentMethod === 'split') {
			const splitSum = cashAmount + cardAmount + mobileAmount;
			// We'll validate against the calculated total later, but ensure amounts are non-negative
			if (cashAmount < 0 || cardAmount < 0 || mobileAmount < 0) {
				return fail(400, { error: 'Split payment amounts cannot be negative' });
			}
		}

		const variantIds = cartItems.map((item: CartItem) => item.variantId);

		// In Electron mode, checkout is handled client-side via PowerSync Web
		if (isNative) {
			return fail(400, { error: 'Electron checkout should use client-side PowerSync' });
		}

		if (!db) return fail(503, { error: 'Direct database connection unavailable.' });

		try {
			const result = await db.transaction(async (tx: any) => {
				// 0. Generate sequential order number (within the lock scope of the transaction)
				const lastOrder = await tx
					.select({ orderNumber: orders.orderNumber })
					.from(orders)
					.where(sql`${orders.orderNumber} IS NOT NULL`)
					.orderBy(desc(orders.orderNumber))
					.limit(1);
				const nextOrderNumber = (lastOrder[0]?.orderNumber ?? 1000) + 1;

				// 1. Fetch & Lock variants for stock integrity
				const dbVariants = await tx
					.select({
						id: productVariants.id,
						price: productVariants.price,
						costPrice: sql<number>`COALESCE(NULLIF(${productVariants.costPrice}, 0), ${products.costPrice}, 0)`,
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

				// Validate split payment amounts match total
				if (paymentMethod === 'split') {
					const splitSum = round2(cashAmount + cardAmount + mobileAmount);
					if (Math.abs(splitSum - totalAmount) > 0.01) {
						throw new Error(
							`Split payment amounts (${splitSum}) don't match order total (${totalAmount})`
						);
					}
				}

				// 3. Create order
				await tx.insert(orders).values({
					id: orderId,
					orderNumber: nextOrderNumber,
					customerId,
					userId: locals.user!.id,
					totalAmount,
					paymentMethod,
					discountAmount: totalDiscount,
					cashReceived,
					changeGiven,
					cashAmount:
						paymentMethod === 'split' ? cashAmount : paymentMethod === 'cash' ? totalAmount : 0,
					cardAmount:
						paymentMethod === 'split' ? cardAmount : paymentMethod === 'card' ? totalAmount : 0,
					mobileAmount:
						paymentMethod === 'split' ? mobileAmount : paymentMethod === 'mobile' ? totalAmount : 0,
					mobileMethod: mobileMethod,
					mobileTrxId: mobileTrxId,
					cardType: cardType,
					cardRef: cardRef,
					status: 'completed'
				});

				// 4. Record items & Adjust stock
				for (const item of cartItems) {
					const dbVariant = dbVariantsMap.get(item.variantId) as DBVariant;
					await tx.insert(orderItems).values({
						id: generateId(),
						orderId,
						variantId: item.variantId,
						quantity: item.quantity,
						priceAtSale: item.price,
						costAtSale: dbVariant?.costPrice || 0,
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
					category: 'sale',
					description: `Sale ${orderId.slice(0, 8).toUpperCase()}`,
					userId: locals.user!.id
				});

				return { orderId, orderNumber: nextOrderNumber, changeGiven };
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

	addCustomer: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		if (!db) return fail(503, { error: 'Direct database connection unavailable.' });
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const phone = (data.get('phone') as string)?.trim() || null;

		if (!name) return fail(400, { error: 'Name is required' });

		// Unique check for phone
		if (phone) {
			const existing = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
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
