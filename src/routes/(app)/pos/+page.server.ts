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
import { eq, sql, gt } from 'drizzle-orm';
import { generateId } from '$lib/utils';
import { logAuditEvent } from '$lib/server/audit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const allVariants = db
		.select({
			id: productVariants.id,
			productId: products.id,
			productName: products.name,
			size: productVariants.size,
			color: productVariants.color,
			barcode: productVariants.barcode,
			category: products.category,
			price: productVariants.price,
			discount: productVariants.discount,
			stockQuantity: productVariants.stockQuantity
		})
		.from(productVariants)
		.innerJoin(products, eq(productVariants.productId, products.id))
		.where(gt(productVariants.stockQuantity, 0))
		.all();

	const allCustomers = db.select().from(customers).all();

	const settingsRows = db.select().from(storeSettings).all();
	const settings = settingsRows.reduce(
		(acc, row) => {
			acc[row.key] = row.value;
			return acc;
		},
		{} as Record<string, string>
	);

	return {
		products: allVariants,
		customers: allCustomers,
		storeSettings: settings
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
		const globalDiscount = parseFloat(data.get('globalDiscount') as string) || 0;

		let cartItems: any[] = [];
		try {
			cartItems = JSON.parse(cartItemsRaw);
		} catch (e) {
			return fail(400, { error: 'Invalid cart data' });
		}

		if (cartItems.length === 0) {
			return fail(400, { error: 'Cart is empty' });
		}

		const orderId = generateId();
		let totalAmount = 0;
		let nextOrderNumber = 0;

		// Calculate total
		cartItems.forEach((item) => {
			const linePrice = item.price * item.quantity;
			const lineDiscount = linePrice * (item.discount / 100);
			totalAmount += linePrice - lineDiscount;
		});
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
			db.transaction((tx) => {
				// 0. Get next order number
				const lastOrder = tx
					.select({ maxNum: sql<number>`max(${orders.orderNumber})` })
					.from(orders)
					.get();
				nextOrderNumber = (lastOrder?.maxNum ?? 1000) + 1;

				// 1. Create order
				tx.insert(orders)
					.values({
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
					})
					.run();

				// 2. Create order items and update stock
				for (const item of cartItems) {
					tx.insert(orderItems)
						.values({
							id: generateId(),
							orderId,
							variantId: item.variantId,
							quantity: item.quantity,
							priceAtSale: item.price,
							discount: item.discount,
							productName: item.productName,
							variantLabel: `${item.size}${item.color ? ' / ' + item.color : ''}`
						})
						.run();

					// Deduct stock
					tx.update(productVariants)
						.set({ stockQuantity: sql`stock_quantity - ${item.quantity}` })
						.where(eq(productVariants.id, item.variantId))
						.run();

					// Log stock change
					tx.insert(stockLogs)
						.values({
							id: generateId(),
							variantId: item.variantId,
							changeAmount: -item.quantity,
							reason: 'sale',
							userId: locals.user!.id
						})
						.run();
				}

				// 3. Update cashbook
				tx.insert(cashbook)
					.values({
						id: generateId(),
						amount: totalAmount,
						type: 'in',
						description: `Sale #${nextOrderNumber}`,
						userId: locals.user!.id
					})
					.run();
			});

			logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'CREATE_ORDER',
				entity: 'order',
				entityId: orderId,
				details: `Completed sale: ৳${totalAmount.toFixed(2)} (${paymentMethod})`
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
			db.insert(customers).values({ id, name, phone }).run();
		} catch (e) {
			return fail(500, { error: 'Failed to add customer' });
		}

		return { success: true, customer: { id, name, phone } };
	}
};
