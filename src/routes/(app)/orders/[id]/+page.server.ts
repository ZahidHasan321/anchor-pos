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

	const order = db
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
		.get();

	if (!order) {
		redirect(302, '/orders');
	}

	const items = db.select().from(orderItems).where(eq(orderItems.orderId, params.id)).all();

	const settingsRows = db.select().from(storeSettings).all();
	const settings = settingsRows.reduce(
		(acc, row) => {
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
			db.update(orders)
				.set({ status: status as 'completed' | 'refunded' | 'void' })
				.where(eq(orders.id, params.id))
				.run();

			logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'UPDATE_ORDER_STATUS',
				entity: 'order',
				entityId: params.id,
				details: `Changed order status to ${status}`
			});

			// If refunded, restore stock
			if (status === 'refunded') {
				const items = db.select().from(orderItems).where(eq(orderItems.orderId, params.id)).all();

				for (const item of items) {
					if (item.variantId) {
						db.update(productVariants)
							.set({ stockQuantity: sql`${productVariants.stockQuantity} + ${item.quantity}` })
							.where(eq(productVariants.id, item.variantId))
							.run();

						db.insert(stockLogs)
							.values({
								id: generateId(),
								variantId: item.variantId,
								changeAmount: item.quantity,
								reason: `Return - Order ${params.id.substring(0, 8)} refunded`,
								userId: locals.user.id,
								createdAt: new Date()
							})
							.run();
					}
				}
			}
		} catch (e) {
			console.error('Failed to update order status:', e);
			return fail(500, { error: 'Database error' });
		}

		return { success: true };
	}
};
