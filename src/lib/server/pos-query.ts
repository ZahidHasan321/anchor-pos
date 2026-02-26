import { db } from '$lib/server/db';
import { products, productVariants } from '$lib/server/db/schema';
import { eq, gt, and, like, or, sql } from 'drizzle-orm';

export async function queryVariants(search: string, category: string, limit = 50, offset = 0) {
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
