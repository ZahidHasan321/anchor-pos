import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { orders, orderItems, productVariants, stockLogs, cashbook, customers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * PowerSync CRUD mutations use actual DB column names (snake_case),
 * but Drizzle's .values() expects the JS property names (camelCase).
 * This helper ensures keys like 'cash_amount' become 'cashAmount'.
 */
function toCamel(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    if (!obj) return result;
    for (const [key, value] of Object.entries(obj)) {
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

export const POST: RequestHandler = async ({ request, locals }) => {
    // Allow Electron clients to authenticate via app secret header (for proxied uploads)
    let userId = locals.user?.id;
    if (!userId) {
        const appSecret = request.headers.get('x-app-secret');
        const expectedSecret = process.env.APP_SECRET_HEADER || 'auto-pos-secret-handshake-2026';
        const headerUserId = request.headers.get('x-user-id');
        if (appSecret === expectedSecret && headerUserId) {
            userId = headerUserId;
        } else {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const { mutations } = await request.json();

    if (!db) {
        // In Electron mode: proxy upload to the VPS which has Postgres
        const isElectron = process.env.BUILD_TARGET === 'electron';
        if (isElectron) {
            try {
                const vpsUrl = process.env.POWERSYNC_API_URL || 'https://anchorshop.cloud';
                const appSecret = process.env.APP_SECRET_HEADER || 'auto-pos-secret-handshake-2026';
                console.log(`[PowerSync] Proxying upload to VPS for user ${userId} (${mutations.length} mutations)`);
                const res = await fetch(`${vpsUrl}/api/powersync/upload`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-app-secret': appSecret,
                        'x-user-id': userId!,
                    },
                    body: JSON.stringify({ mutations })
                });
                if (res.ok) {
                    console.log(`[PowerSync] VPS upload succeeded (${mutations.length} mutations)`);
                    return json({ success: true });
                }
                const vpsBody = await res.text().catch(() => '');
                console.error(`[PowerSync] VPS upload returned ${res.status}: ${vpsBody}`);
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
            console.log(`[PowerSync] Processing ${mutations.length} mutations from user ${userId}`);
            for (const mutation of mutations) {
                // Support both Web SDK {type, data} and our proxy {table, opData}
                const table = mutation.table || mutation.type;
                const op = mutation.op;
                const id = mutation.id;
                const opData = mutation.opData || mutation.data;
                
                const data = toCamel(opData || {});
                console.log(`[PowerSync] -> ${op} on ${table} (${id})`);

                if (table === 'orders') {
                    if (op === 'PUT' || op === 'PATCH') {
                        const existing = op === 'PATCH' ? (await tx.select().from(orders).where(eq(orders.id, id)).limit(1))[0] : {};
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
                        const existing = op === 'PATCH' ? (await tx.select().from(orderItems).where(eq(orderItems.id, id)).limit(1))[0] : {};
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
                        const existing = op === 'PATCH' ? (await tx.select().from(productVariants).where(eq(productVariants.id, id)).limit(1))[0] : {};
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
                        const existing = op === 'PATCH' ? (await tx.select().from(stockLogs).where(eq(stockLogs.id, id)).limit(1))[0] : {};
                        const mergedData = { ...existing, ...data, id, userId };
                        await tx.insert(stockLogs).values(mergedData).onConflictDoUpdate({
                            target: stockLogs.id,
                            set: mergedData
                        });
                    }
                } else if (table === 'customers') {
                    if (op === 'PUT' || op === 'PATCH') {
                        if (data.phone) {
                            const existingPhone = await tx.select().from(customers).where(eq(customers.phone, data.phone)).limit(1);
                            if (existingPhone.length > 0 && existingPhone[0].id !== id) {
                                const merged = { ...existingPhone[0], ...data, id };
                                await tx.update(customers).set(merged).where(eq(customers.phone, data.phone));
                                continue;
                            }
                        }
                        const existing = op === 'PATCH' ? (await tx.select().from(customers).where(eq(customers.id, id)).limit(1))[0] : {};
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
                        const existing = op === 'PATCH' ? (await tx.select().from(cashbook).where(eq(cashbook.id, id)).limit(1))[0] : {};
                        const mergedData = { ...existing, ...data, id, userId };
                        await tx.insert(cashbook).values(mergedData).onConflictDoUpdate({
                            target: cashbook.id,
                            set: mergedData
                        });
                    }
                }
            }
        });

        console.log(`[PowerSync] Transaction committed successfully for ${mutations.length} mutations`);
        return json({ success: true });
    } catch (e: any) {
        console.error('[PowerSync] Transaction failed:', e);
        return json({ error: e.message }, { status: 500 });
    }
}
