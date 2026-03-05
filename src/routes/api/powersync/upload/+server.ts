import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { orders, orderItems, productVariants, stockLogs, cashbook, customers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

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
                // Return 503 so PowerSync retries — do NOT return 200
                return json({ error: 'VPS upload failed', detail: vpsBody }, { status: 503 });
            } catch (e) {
                console.error('[PowerSync] VPS unreachable:', e);
                return json({ error: 'VPS unreachable' }, { status: 503 });
            }
        }
        // No DB and not Electron — nothing we can do
        return json({ error: 'No database connection' }, { status: 503 });
    }

    try {
        await db.transaction(async (tx: any) => {
            for (const mutation of mutations) {
                // PowerSync CrudEntry uses { op, table, id, opData }
                const { table, op, id, opData } = mutation;
                const data = opData || {};

                if (table === 'orders') {
                    if (op === 'PUT') {
                        await tx.insert(orders).values({ ...data, id, userId }).onConflictDoUpdate({
                            target: orders.id,
                            set: data
                        });
                    } else if (op === 'DELETE') {
                        await tx.delete(orders).where(eq(orders.id, id));
                    }
                } else if (table === 'order_items') {
                    if (op === 'PUT') {
                        await tx.insert(orderItems).values({ ...data, id }).onConflictDoUpdate({
                            target: orderItems.id,
                            set: data
                        });
                    } else if (op === 'DELETE') {
                        await tx.delete(orderItems).where(eq(orderItems.id, id));
                    }
                } else if (table === 'product_variants') {
                    if (op === 'PUT') {
                        await tx.insert(productVariants).values({ ...data, id }).onConflictDoUpdate({
                            target: productVariants.id,
                            set: data
                        });
                    } else if (op === 'DELETE') {
                        await tx.delete(productVariants).where(eq(productVariants.id, id));
                    }
                } else if (table === 'stock_logs') {
                    if (op === 'PUT') {
                        await tx.insert(stockLogs).values({ ...data, id, userId }).onConflictDoUpdate({
                            target: stockLogs.id,
                            set: data
                        });
                    }
                } else if (table === 'customers') {
                    if (op === 'PUT') {
                        // Handle customer conflicts on phone as well as id
                        if (data.phone) {
                            const existing = await tx.select().from(customers).where(eq(customers.phone, data.phone)).limit(1);
                            if (existing.length > 0 && existing[0].id !== id) {
                                await tx.update(customers)
                                    .set({ ...data, id })
                                    .where(eq(customers.phone, data.phone));
                                continue;
                            }
                        }
                        await tx.insert(customers).values({ ...data, id }).onConflictDoUpdate({
                            target: customers.id,
                            set: data
                        });
                    } else if (op === 'DELETE') {
                        await tx.delete(customers).where(eq(customers.id, id));
                    }
                } else if (table === 'cashbook') {
                    if (op === 'PUT') {
                        await tx.insert(cashbook).values({ ...data, id, userId }).onConflictDoUpdate({
                            target: cashbook.id,
                            set: data
                        });
                    }
                }
            }
        });

        return json({ success: true });
    } catch (e: any) {
        console.error('PowerSync upload failed:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
