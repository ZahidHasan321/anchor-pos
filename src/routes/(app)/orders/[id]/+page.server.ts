import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	orders,
	orderItems,
	productVariants,
	stockLogs,
	customers,
	users,
	storeSettings
} from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { generateId } from '$lib/utils';
import { logAuditEvent } from '$lib/server/audit';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const orderRows = await db
		.select({
			id: orders.id,
			orderNumber: orders.orderNumber,
			totalAmount: orders.totalAmount,
			status: orders.status,
			paymentMethod: orders.paymentMethod,
			discountAmount: orders.discountAmount,
			cashReceived: orders.cashReceived,
			changeGiven: orders.changeGiven,
			createdAt: orders.createdAt,
			customerId: orders.customerId,
			customerName: customers.name,
			customerPhone: customers.phone,
			userName: users.name
		})
		.from(orders)
		.leftJoin(customers, eq(orders.customerId, customers.id))
		.leftJoin(users, eq(orders.userId, users.id))
		.where(eq(orders.id, params.id))
		.limit(1);

	const order = orderRows[0];

	if (!order) {
		redirect(302, '/orders');
	}

	const items = await db
		.select({
			id: orderItems.id,
			orderId: orderItems.orderId,
			variantId: orderItems.variantId,
			quantity: orderItems.quantity,
			priceAtSale: orderItems.priceAtSale,
			discount: orderItems.discount,
			productName: orderItems.productName,
			variantLabel: orderItems.variantLabel,
			status: orderItems.status,
			productId: productVariants.productId
		})
		.from(orderItems)
		.leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
		.where(eq(orderItems.orderId, params.id));

	const settingsRows = await db.select().from(storeSettings);
	const settings = settingsRows.reduce(
		(acc: Record<string, string>, row: { key: string; value: string }) => {
			acc[row.key] = row.value;
			return acc;
		},
		{} as Record<string, string>
	);

	return {
		order,
		items,
		storeSettings: settings,
		user: locals.user
	};
};

export const actions: Actions = {
	refundItem: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role === 'sales') {
			return fail(403, { error: 'Unauthorized' });
		}

		const data = await request.formData();
		const itemId = data.get('itemId') as string;

		try {
			const item = (await db.select().from(orderItems).where(eq(orderItems.id, itemId)).limit(1))[0];
			if (!item || item.status === 'refunded') {
				return fail(400, { error: 'Item not found or already refunded' });
			}

			const order = (await db.select().from(orders).where(eq(orders.id, params.id)).limit(1))[0];
			if (!order || order.status !== 'completed') {
				return fail(400, { error: 'Order cannot be partially refunded' });
			}

			const itemTotal = item.priceAtSale * item.quantity * (1 - (item.discount || 0) / 100);

			await db.transaction(async (tx: any) => {
				// 1. Update item status
				await tx.update(orderItems).set({ status: 'refunded' }).where(eq(orderItems.id, itemId));

				// 2. Update order total
				await tx
					.update(orders)
					.set({
						totalAmount: sql`${orders.totalAmount} - ${itemTotal}`
					})
					.where(eq(orders.id, params.id));

				// 3. Restore stock
				if (item.variantId) {
					await tx
						.update(productVariants)
						.set({ stockQuantity: sql`${productVariants.stockQuantity} + ${item.quantity}` })
						.where(eq(productVariants.id, item.variantId));

					await tx.insert(stockLogs).values({
						id: generateId(),
						variantId: item.variantId,
						changeAmount: item.quantity,
						reason: `Return - Item in Order ${params.id.substring(0, 8)} refunded`,
						userId: locals.user!.id,
						createdAt: new Date()
					});
				}

				await logAuditEvent({
					userId: locals.user!.id,
					userName: locals.user!.name,
					action: 'REFUND_ORDER_ITEM',
					entity: 'orders',
					entityId: params.id,
					details: `Refunded item: ${item.productName} (${item.variantLabel}) - Amount: ${itemTotal}`
				});
			});
		} catch (e) {
			console.error('Failed to refund item:', e);
			return fail(500, { error: 'Database error' });
		}

		return { success: true };
	},
	updateStatus: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role === 'sales') {
			return fail(403, { error: 'Unauthorized' });
		}

		const data = await request.formData();
		const status = data.get('status') as string;

		if (!['refunded', 'void'].includes(status)) {
			return fail(400, { error: 'Invalid status' });
		}

		try {
			await db
				.update(orders)
				.set({ status: status as 'completed' | 'refunded' | 'void' })
				.where(eq(orders.id, params.id));

			await logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'UPDATE_ORDER_STATUS',
				entity: 'orders',
				entityId: params.id,
				details: `Changed order status to ${status}`
			});

			// If refunded, restore stock
			if (status === 'refunded') {
				const items = await db.select().from(orderItems).where(eq(orderItems.orderId, params.id));

				for (const item of items) {
					if (item.variantId && item.status !== 'refunded') {
						await db
							.update(productVariants)
							.set({ stockQuantity: sql`${productVariants.stockQuantity} + ${item.quantity}` })
							.where(eq(productVariants.id, item.variantId));

						await db.insert(stockLogs).values({
							id: generateId(),
							variantId: item.variantId,
							changeAmount: item.quantity,
							reason: `Return - Order ${params.id.substring(0, 8)} refunded`,
							userId: locals.user.id,
							createdAt: new Date()
						});
					}
				}
				// Also mark all items as refunded in the DB for consistency
				await db.update(orderItems).set({ status: 'refunded' }).where(eq(orderItems.orderId, params.id));
			}
		} catch (e) {
			console.error('Failed to update order status:', e);
			return fail(500, { error: 'Database error' });
		}

		return { success: true };
	}
};
