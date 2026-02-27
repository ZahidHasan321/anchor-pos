import { db } from '$lib/server/db';
import { products, productVariants } from '$lib/server/db/schema';
import { eq, gt, and, like, or, sql } from 'drizzle-orm';

export async function queryVariants(search: string, category: string, limit = 50, offset = 0) {
	if (!db) return { items: [], hasMore: false };
	const conditions = [gt(productVariants.stockQuantity, 0)];

	if (search) {
		const exactPattern = `%${search}%`;
		// Try barcode or size first (indexed)
		conditions.push(
			or(
				sql`${productVariants.barcode} ILIKE ${exactPattern}`,
				sql`${productVariants.size} ILIKE ${exactPattern}`,
				sql`${products.name} ILIKE ${exactPattern}`,
				// Fuzzy-ish fallback
				sql`REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${products.name}), '-', ''), ' ', ''), '_', ''), '.', '') LIKE ${'%' + search.replace(/[-\s_.]/g, '').toLowerCase() + '%'}`
			)!
		);
	}

	if (category && category !== 'All') {
		conditions.push(eq(products.category, category));
	}

	const items = await db
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
		.where(and(...conditions))
		.limit(limit)
		.offset(offset);

	return { items, hasMore: items.length === limit };
}

export async function queryVariantsPS(search: string, category: string, limit = 50, offset = 0) {
	const { getPowerSyncDb } = await import('$lib/powersync/db');
	const psDb = getPowerSyncDb();
	let query = `
    SELECT 
      pv.id,
      pv.product_id as productId,
      p.name as productName,
      pv.size,
      pv.color,
      pv.barcode,
      p.category,
      pv.price,
      pv.discount,
      pv.stock_quantity as stockQuantity
    FROM product_variants pv
    INNER JOIN products p ON pv.product_id = p.id
    WHERE pv.stock_quantity > 0
  `;
	const params: any[] = [];

	if (search) {
		const pattern = `%${search}%`;
		query += ` AND (pv.barcode LIKE ? OR pv.size LIKE ? OR p.name LIKE ?)`;
		params.push(pattern, pattern, pattern);
	}

	if (category && category !== 'All') {
		query += ` AND p.category = ?`;
		params.push(category);
	}

	query += ` ORDER BY p.name ASC LIMIT ? OFFSET ?`;
	params.push(limit, offset);

	const items = await psDb.getAll(query, params);
	return { items, hasMore: items.length === limit };
}
