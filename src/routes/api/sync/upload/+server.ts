import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { orders, orderItems, customers, cashbook, stockLogs } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

type Op = 'PUT' | 'PATCH' | 'DELETE';
interface CrudEntry {
	op: Op;
	table: string;
	id: string;
	opData?: Record<string, unknown>;
}

const MAX_BATCH_SIZE = 200;

// Allowed fields per table — prevents mass assignment
const ALLOWED_FIELDS: Record<string, Set<string>> = {
	orders: new Set([
		'customerId', 'totalAmount', 'status', 'paymentMethod', 'discountAmount',
		'cashReceived', 'changeGiven', 'cashAmount', 'cardAmount', 'mobileAmount',
		'mobileMethod', 'mobileTrxId', 'cardType', 'cardRef', 'orderNumber'
	]),
	order_items: new Set([
		'orderId', 'variantId', 'quantity', 'priceAtSale', 'costAtSale',
		'discount', 'productName', 'variantLabel', 'status'
	]),
	customers: new Set(['name', 'phone', 'email', 'address']),
	cashbook: new Set(['amount', 'type', 'category', 'description']),
	stock_logs: new Set(['variantId', 'changeAmount', 'reason'])
};

function pickAllowed(opData: Record<string, unknown> | undefined, table: string): Record<string, unknown> {
	if (!opData) return {};
	const allowed = ALLOWED_FIELDS[table];
	if (!allowed) return {};
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(opData)) {
		if (allowed.has(key)) result[key] = value;
	}
	return result;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { batch }: { batch: CrudEntry[] } = await request.json();

	if (!Array.isArray(batch) || batch.length === 0) {
		return json({ ok: true });
	}

	if (batch.length > MAX_BATCH_SIZE) {
		throw error(400, `Batch size exceeds maximum of ${MAX_BATCH_SIZE}`);
	}

	await db.transaction(async (tx: any) => {
		for (const entry of batch) {
			await applyEntry(tx, entry, user.id);
		}
	});

	return json({ ok: true });
};

async function applyEntry(tx: any, entry: CrudEntry, userId: string) {
	const { op, table, id, opData } = entry;
	const data = pickAllowed(opData, table);

	switch (table) {
		case 'orders': {
			if (op === 'PUT') {
				await tx
					.insert(orders)
					.values({ ...data, id, userId } as any)
					.onConflictDoUpdate({ target: orders.id, set: data as any });
			} else if (op === 'DELETE') {
				await tx.delete(orders).where(eq(orders.id, id));
			}
			break;
		}
		case 'order_items': {
			if (op === 'PUT') {
				await tx
					.insert(orderItems)
					.values({ ...data, id } as any)
					.onConflictDoUpdate({ target: orderItems.id, set: data as any });
			} else if (op === 'DELETE') {
				await tx.delete(orderItems).where(eq(orderItems.id, id));
			}
			break;
		}
		case 'customers': {
			if (op === 'PUT') {
				await tx
					.insert(customers)
					.values({ ...data, id } as any)
					.onConflictDoUpdate({ target: customers.id, set: data as any });
			} else if (op === 'DELETE') {
				await tx.delete(customers).where(eq(customers.id, id));
			}
			break;
		}
		case 'cashbook': {
			if (op === 'PUT') {
				await tx
					.insert(cashbook)
					.values({ ...data, id, userId } as any)
					.onConflictDoUpdate({ target: cashbook.id, set: data as any });
			}
			break;
		}
		case 'stock_logs': {
			if (op === 'PUT') {
				await tx
					.insert(stockLogs)
					.values({ ...data, id, userId } as any)
					.onConflictDoUpdate({ target: stockLogs.id, set: data as any });
			}
			break;
		}
		default:
			console.warn(`[sync/upload] No handler for table: ${table}`);
	}
}
