import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	orders,
	orderItems,
	productVariants,
	stockLogs,
	cashbook,
	customers
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { jwtVerify, importJWK } from 'jose';
import { timingSafeEqual } from 'crypto';
import env from '$lib/server/env';
import type { RequestHandler } from './$types';

// Cache for public key used to validate forwarded Electron JWTs
let _publicKey: any = null;
async function getPublicKey() {
	if (_publicKey) return _publicKey;
	const jwkRaw = env.POWERSYNC_PUBLIC_KEY;
	if (!jwkRaw) return null;
	try {
		const jwk = JSON.parse(jwkRaw);
		_publicKey = await importJWK(jwk, 'RS256');
		return _publicKey;
	} catch {
		return null;
	}
}

// Allowed fields per table — prevents mass assignment of arbitrary columns
const ALLOWED_FIELDS: Record<string, Set<string>> = {
	orders: new Set([
		'customer_id', 'total_amount', 'status', 'payment_method', 'discount_amount',
		'cash_received', 'change_given', 'cash_amount', 'card_amount', 'mobile_amount',
		'mobile_method', 'mobile_trx_id', 'card_type', 'card_ref', 'order_number', 'created_at'
	]),
	order_items: new Set([
		'order_id', 'variant_id', 'quantity', 'price_at_sale', 'cost_at_sale',
		'discount', 'product_name', 'variant_label', 'status'
	]),
	product_variants: new Set([
		'product_id', 'size', 'color', 'barcode', 'price', 'cost_price',
		'discount', 'stock_quantity'
	]),
	stock_logs: new Set([
		'variant_id', 'change_amount', 'reason', 'created_at'
	]),
	customers: new Set(['name', 'phone', 'email', 'address']),
	cashbook: new Set(['amount', 'type', 'category', 'description', 'created_at'])
};

/**
 * PowerSync CRUD mutations use actual DB column names (snake_case),
 * but Drizzle's .values() expects the JS property names (camelCase).
 * This helper ensures keys like 'cash_amount' become 'cashAmount',
 * and filters out any fields not in the allowlist.
 */
function toCamel(obj: Record<string, any>, table: string): Record<string, any> {
	const result: Record<string, any> = {};
	if (!obj) return result;
	const allowed = ALLOWED_FIELDS[table];
	for (const [key, value] of Object.entries(obj)) {
		// Skip fields not in the allowlist
		if (allowed && !allowed.has(key)) continue;

		let finalKey: string;
		if (key === 'mobile_trx_id') {
			finalKey = 'mobileTrxId';
		} else {
			finalKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
		}

		// Convert ISO strings back to Date objects for Drizzle timestamps
		if (typeof value === 'string' && value.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(value)) {
			const d = new Date(value);
			if (!isNaN(d.getTime())) {
				result[finalKey] = d;
				continue;
			}
		}

		result[finalKey] = value;
	}
	return result;
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	// Authenticate: session first, then validate forwarded JWT for Electron→VPS proxy
	let userId = locals.user?.id;
	if (!userId) {
		const appSecret = request.headers.get('x-app-secret');
		const expectedSecret = env.APP_SECRET_HEADER;
		const userToken = request.headers.get('x-user-token');

		// Require both app secret AND a valid JWT — never trust a raw user ID header
		const secretValid =
			expectedSecret &&
			appSecret &&
			appSecret.length === expectedSecret.length &&
			timingSafeEqual(Buffer.from(appSecret), Buffer.from(expectedSecret));
		if (secretValid && userToken) {
			const publicKey = await getPublicKey();
			if (publicKey) {
				try {
					const { payload } = await jwtVerify(userToken, publicKey, { audience: 'pos-electron' });
					if (payload.sub) {
						userId = payload.sub;
					}
				} catch {
					return json({ error: 'Invalid token' }, { status: 401 });
				}
			}
		}

		if (!userId) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
	}

	const { mutations } = await request.json();

	if (!db) {
		// In Electron mode: proxy upload to the VPS which has Postgres
		if (env.IS_ELECTRON) {
			try {
				if (!env.POWERSYNC_API_URL || !env.APP_SECRET_HEADER) {
					return json({ error: 'Server not configured for proxy mode' }, { status: 500 });
				}
				// Forward the user's JWT so VPS can validate identity (not just a raw user ID)
				const sessionToken = cookies.get('session');
				if (!sessionToken) {
					return json({ error: 'No session token for proxy' }, { status: 401 });
				}
				const res = await fetch(`${env.POWERSYNC_API_URL}/api/powersync/upload`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-app-secret': env.APP_SECRET_HEADER,
						'x-user-token': sessionToken
					},
					body: JSON.stringify({ mutations })
				});
				if (res.ok) {
					return json({ success: true });
				}
				const vpsBody = await res.text().catch(() => '');
				return json({ error: 'VPS upload failed', detail: vpsBody }, { status: 503 });
			} catch (e) {
				console.error('[PowerSync] VPS unreachable:', e);
				return json({ error: 'VPS unreachable' }, { status: 503 });
			}
		}
		return json({ error: 'No database connection' }, { status: 503 });
	}

	try {
		await db.transaction(async (tx: any) => {
			for (const mutation of mutations) {
				// Support both Web SDK {type, data} and our proxy {table, opData}
				const table = mutation.table || mutation.type;
				const op = mutation.op;
				const id = mutation.id;
				const opData = mutation.opData || mutation.data;

				const data = toCamel(opData || {}, table);
				// Strip undefined/null values so Postgres defaults kick in for NOT NULL cols
				for (const k of Object.keys(data)) {
					if (data[k] === undefined) delete data[k];
				}
				// Process mutation

				if (table === 'orders') {
					if (op === 'PUT' || op === 'PATCH') {
						const existing =
							op === 'PATCH'
								? (await tx.select().from(orders).where(eq(orders.id, id)).limit(1))[0]
								: {};
						const mergedData = { ...existing, ...data, id, userId };
						await tx.insert(orders).values(mergedData).onConflictDoUpdate({
							target: orders.id,
							set: mergedData
						});
					} else if (op === 'DELETE') {
						await tx.delete(orders).where(eq(orders.id, id));
					}
				} else if (table === 'order_items') {
					if (op === 'PUT' || op === 'PATCH') {
						const existing =
							op === 'PATCH'
								? (await tx.select().from(orderItems).where(eq(orderItems.id, id)).limit(1))[0]
								: {};
						const mergedData = { ...existing, ...data, id };
						await tx.insert(orderItems).values(mergedData).onConflictDoUpdate({
							target: orderItems.id,
							set: mergedData
						});
					} else if (op === 'DELETE') {
						await tx.delete(orderItems).where(eq(orderItems.id, id));
					}
				} else if (table === 'product_variants') {
					if (op === 'PUT' || op === 'PATCH') {
						const existing =
							op === 'PATCH'
								? (
										await tx
											.select()
											.from(productVariants)
											.where(eq(productVariants.id, id))
											.limit(1)
									)[0]
								: {};
						const mergedData = { ...existing, ...data, id };
						await tx.insert(productVariants).values(mergedData).onConflictDoUpdate({
							target: productVariants.id,
							set: mergedData
						});
					} else if (op === 'DELETE') {
						await tx.delete(productVariants).where(eq(productVariants.id, id));
					}
				} else if (table === 'stock_logs') {
					if (op === 'PUT' || op === 'PATCH') {
						const existing =
							op === 'PATCH'
								? (await tx.select().from(stockLogs).where(eq(stockLogs.id, id)).limit(1))[0]
								: {};
						const mergedData = { ...existing, ...data, id, userId };
						await tx.insert(stockLogs).values(mergedData).onConflictDoUpdate({
							target: stockLogs.id,
							set: mergedData
						});
					}
				} else if (table === 'customers') {
					if (op === 'PUT' || op === 'PATCH') {
						if (data.phone) {
							const existingPhone = await tx
								.select()
								.from(customers)
								.where(eq(customers.phone, data.phone))
								.limit(1);
							if (existingPhone.length > 0 && existingPhone[0].id !== id) {
								const merged = { ...existingPhone[0], ...data, id };
								await tx.update(customers).set(merged).where(eq(customers.phone, data.phone));
								continue;
							}
						}
						const existing =
							op === 'PATCH'
								? (await tx.select().from(customers).where(eq(customers.id, id)).limit(1))[0]
								: {};
						const mergedData = { ...existing, ...data, id };
						await tx.insert(customers).values(mergedData).onConflictDoUpdate({
							target: customers.id,
							set: mergedData
						});
					} else if (op === 'DELETE') {
						await tx.delete(customers).where(eq(customers.id, id));
					}
				} else if (table === 'cashbook') {
					if (op === 'PUT' || op === 'PATCH') {
						const existing =
							op === 'PATCH'
								? (await tx.select().from(cashbook).where(eq(cashbook.id, id)).limit(1))[0]
								: {};
						// Ensure category is never null — old clients may omit it
						if (!data.category) data.category = data.type === 'in' ? 'sale' : 'expense';
						const mergedData = { ...existing, ...data, id, userId };
						await tx.insert(cashbook).values(mergedData).onConflictDoUpdate({
							target: cashbook.id,
							set: mergedData
						});
					}
				}
			}
		});

		return json({ success: true });
	} catch (e: any) {
		console.error('[PowerSync] Transaction failed:', e);
		return json({ error: 'Transaction failed' }, { status: 500 });
	}
};
