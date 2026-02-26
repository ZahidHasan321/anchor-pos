import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { orders, orderItems, productVariants, stockLogs, cashbook, customers } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { mutations } = await request.json();

    try {
        await db.transaction(async (tx: any) => {
            for (const mutation of mutations) {
                const { table, op, data } = mutation;

                if (table === 'orders' && op === 'PUT') {
                    await tx.insert(orders).values(data).onConflictDoUpdate({
                        target: orders.id,
                        set: data
                    });
                } else if (table === 'order_items' && op === 'PUT') {
                    await tx.insert(orderItems).values(data).onConflictDoUpdate({
                        target: orderItems.id,
                        set: data
                    });
                    
                    // We don't manually subtract stock here anymore, 
                    // because the client also sends a 'product_variants' mutation 
                    // which handles the stock update via PowerSync sync.
                } else if (table === 'product_variants' && op === 'PUT') {
                    await tx.insert(productVariants).values(data).onConflictDoUpdate({
                        target: productVariants.id,
                        set: data
                    });
                } else if (table === 'stock_logs' && op === 'PUT') {
                    await tx.insert(stockLogs).values(data).onConflictDoUpdate({
                        target: stockLogs.id,
                        set: data
                    });
                } else if (table === 'customers' && op === 'PUT') {
                    // Handle customer conflicts on phone as well as id
                    await tx.insert(customers).values(data).onConflictDoUpdate({
                        target: [customers.id],
                        set: data
                    }).catch(async (err: any) => {
                        // If ID doesn't conflict but phone does (Postgres error 23505), 
                        // we try to update by phone instead
                        if (err.code === '23505' && data.phone) {
                            await tx.update(customers)
                                .set(data)
                                .where(eq(customers.phone, data.phone));
                        } else {
                            throw err;
                        }
                    });
                } else if (table === 'cashbook' && op === 'PUT') {
                    await tx.insert(cashbook).values(data).onConflictDoUpdate({
                        target: cashbook.id,
                        set: data
                    });
                }
                // Add other tables as needed
            }
        });

        return json({ success: true });
    } catch (e: any) {
        console.error('PowerSync upload failed:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
