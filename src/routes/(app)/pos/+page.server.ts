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
import { eq, sql } from 'drizzle-orm';
import { generateId } from '$lib/utils';
import { logAuditEvent } from '$lib/server/audit';
import { queryVariants } from '$lib/server/pos-query';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const search = url.searchParams.get('search') || '';
	const category = url.searchParams.get('category') || 'All';

	// Immediate return, deferred streaming for everything else
	return {
		search,
		category,
		user: locals.user,

		// Streamed data
		streamed: (async () => {
			const [variantsData, categoryRows, allCustomers, settingsRows] = await Promise.all([
				queryVariants(search, category),
				db.select({ category: products.category }).from(products).groupBy(products.category),
				db.select().from(customers),
				db.select().from(storeSettings)
			]);

			const settings = settingsRows.reduce(
				(acc, row) => {
					acc[row.key] = row.value;
					return acc;
				},
				{} as Record<string, string>
			);

			return {
				products: variantsData.items,
				hasMore: variantsData.hasMore,
				categories: ['All', ...categoryRows.map((r) => r.category).sort()],
				customers: allCustomers,
				storeSettings: settings
			};
		})()
	};
};

export const actions: Actions = {
	checkout: async ({ request, locals }) => {
		if (!locals.user) return fail(401);

		const data = await request.formData();
		const cartItemsRaw = data.get('cartItems') as string;
		const customerId = (data.get('customerId') as string) || null;
		const paymentMethod = (data.get('paymentMethod') as 'cash' | 'card') || 'cash';
		const cashReceived = parseFloat(data.get('cashReceived') as string) || 0;
		const globalDiscount = Math.min(
			100,
			Math.max(0, parseFloat(data.get('globalDiscount') as string) || 0)
		);

		let cartItems: any[] = [];
		try {
			cartItems = JSON.parse(cartItemsRaw);
		} catch (e) {
			return fail(400, { error: 'Invalid cart data' });
		}

		if (cartItems.length === 0) {
			return fail(400, { error: 'Cart is empty' });
		}

		// Fetch actual prices from DB to prevent client-side price manipulation
		const variantIds = cartItems.map((item) => item.variantId);
		const dbVariants = await db
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
			.where(
				sql`${productVariants.id} IN (${sql.join(
					variantIds.map((id) => sql`${id}`),
					sql`, `
				)})`
			);

		const dbVariantsMap = new Map(dbVariants.map((v) => [v.id, v]));

		const orderId = generateId();
		let totalAmount = 0;
		let nextOrderNumber = 0;

		// Validate and update prices from DB, and calculate total
		for (const item of cartItems) {
			const dbVariant = dbVariantsMap.get(item.variantId);
			if (!dbVariant) {
				return fail(400, { error: `Invalid product in cart: ${item.variantId}` });
			}
			if (dbVariant.stockQuantity < item.quantity) {
				return fail(400, {
					error: `Insufficient stock for ${dbVariant.productName}. Available: ${dbVariant.stockQuantity}`
				});
			}
			item.price = dbVariant.price;
			item.productName = dbVariant.productName;
			item.size = dbVariant.size;
			item.color = dbVariant.color;
			item.discount = Math.min(100, Math.max(0, item.discount || 0));

			const linePrice = item.price * item.quantity;
			const lineDiscount = linePrice * (item.discount / 100);
			totalAmount += linePrice - lineDiscount;
		}

		totalAmount = totalAmount * (1 - globalDiscount / 100);

		const discountAmount =
			cartItems.reduce((sum, item) => sum + item.price * item.quantity * (item.discount / 100), 0) +
			cartItems.reduce(
				(sum, item) => sum + item.price * item.quantity * (1 - item.discount / 100),
				0
			) *
				(globalDiscount / 100);

		const changeGiven = Math.max(0, cashReceived - totalAmount);

		if (isNaN(totalAmount)) {
			return fail(400, { error: 'Invalid calculation result (NaN)' });
		}

		try {
			await db.transaction(async (tx) => {
				// 0. Get next order number
				const lastOrder = await tx
					.select({ maxNum: sql<number>`max(${orders.orderNumber})` })
					.from(orders);

				const maxNum = lastOrder[0]?.maxNum;
				nextOrderNumber = (maxNum ?? 1000) + 1;

				// 1. Create order
				await tx.insert(orders).values({
					id: orderId,
					orderNumber: nextOrderNumber,
					customerId,
					userId: locals.user!.id,
					totalAmount,
					paymentMethod,
					discountAmount,
					cashReceived,
					changeGiven,
					status: 'completed'
				});

				// 2. Create order items and update stock
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

					// Deduct stock
					await tx
						.update(productVariants)
						.set({ stockQuantity: sql`stock_quantity - ${item.quantity}` })
						.where(eq(productVariants.id, item.variantId));

					// Log stock change
					await tx.insert(stockLogs).values({
						id: generateId(),
						variantId: item.variantId,
						changeAmount: -item.quantity,
						reason: 'sale',
						userId: locals.user!.id
					});
				}

				// 3. Update cashbook
				await tx.insert(cashbook).values({
					id: generateId(),
					amount: totalAmount,
					type: 'in',
					description: `Sale #${nextOrderNumber}`,
					userId: locals.user!.id
				});
			});

			await logAuditEvent({
				userId: locals.user!.id,
				userName: locals.user!.name,
				action: 'CREATE_ORDER',
				entity: 'orders',
				entityId: orderId,
				details: `Completed sale: ${totalAmount.toFixed(2)} (${paymentMethod})`
			});

			return { success: true, orderId, orderNumber: nextOrderNumber, changeGiven };
		} catch (e) {
			console.error('Checkout failed:', e);
			return fail(500, { error: e instanceof Error ? e.message : 'Transaction failed' });
		}
	},

	addCustomer: async ({ request }) => {
		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const phone = (data.get('phone') as string)?.trim() || null;

		if (!name) return fail(400, { error: 'Name is required' });

		const id = generateId();
		try {
			await db.insert(customers).values({ id, name, phone });
		} catch (e) {
			return fail(500, { error: 'Failed to add customer' });
		}

		return { success: true, customer: { id, name, phone } };
	}
};
