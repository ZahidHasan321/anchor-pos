import { powersync } from './powersync.svelte';
import { writable } from 'svelte/store';

export function watchQuery(query: string, params: any[] = []) {
    const { subscribe, set } = writable<any[]>([]);
    
    if (typeof window !== 'undefined' && (window as any).electron) {
        const start = async () => {
            const iterable = powersync.db.watch(query, params);
            for await (const result of iterable) {
                set(result.rows?._array || []);
            }
        };
        start();
    }

    return {
        subscribe
    };
}

// Basic stores for reactive UI
export const productsStore = watchQuery(`
    SELECT 
        pv.id,
        p.id as productId,
        p.name as productName,
        pv.size,
        pv.color,
        pv.barcode,
        p.category,
        pv.price,
        p.cost_price as costPrice,
        pv.discount,
        pv.stock_quantity as stockQuantity
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    WHERE pv.stock_quantity > 0
`);

export const categoriesStore = watchQuery('SELECT DISTINCT category FROM products');

