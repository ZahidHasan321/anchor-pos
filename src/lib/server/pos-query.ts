import { db } from '$lib/server/db';
import { products, productVariants } from '$lib/server/db/schema';
import { eq, gt, and, like, or, sql } from 'drizzle-orm';

export async function queryVariants(search: string, category: string, limit = 50, offset = 0) {
	const conditions = [gt(productVariants.stockQuantity, 0)];

	if (search) {
		// Normalize: strip hyphens, spaces, underscores, dots for fuzzy-ish matching
		// so "tshirt" matches "t-shirt", "t shirt", etc.
		const normalizedSearch = '%' + search.replace(/[-\s_.]/g, '').toLowerCase() + '%';
		const exactPattern = `%${search}%`;
		conditions.push(
			or(
				sql`REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${products.name}), '-', ''), ' ', ''), '_', ''), '.', '') LIKE ${normalizedSearch}`,
				sql`${productVariants.barcode} ILIKE ${exactPattern}`,
				sql`${productVariants.size} ILIKE ${exactPattern}`
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
