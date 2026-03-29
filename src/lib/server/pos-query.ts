import { db } from '$lib/server/db';
import { products, productVariants } from '$lib/server/db/schema';
import { eq, gt, and, or, sql } from 'drizzle-orm';
import { fuzzyMatch } from './search';

const variantSelect = {
	id: productVariants.id,
	productId: products.id,
	productName: products.name,
	size: productVariants.size,
	color: productVariants.color,
	barcode: productVariants.barcode,
	category: products.category,
	price: productVariants.price,
	costPrice: sql<number>`COALESCE(NULLIF(${productVariants.costPrice}, 0), ${products.costPrice}, 0)`,
	discount: productVariants.discount,
	stockQuantity: productVariants.stockQuantity
};

export async function queryVariants(search: string, category: string, limit = 50, offset = 0) {
	if (!db) return { items: [], hasMore: false };

	const baseConditions = [
		gt(productVariants.stockQuantity, 0),
		eq(products.isActive, true),
		eq(productVariants.isActive, true)
	];
	if (category && category !== 'All') {
		baseConditions.push(eq(products.category, category));
	}

	// For barcode scans: try exact match first (uses unique index, instant)
	if (search) {
		const exactBarcode = await db
			.select(variantSelect)
			.from(productVariants)
			.innerJoin(products, eq(productVariants.productId, products.id))
			.where(and(...baseConditions, eq(productVariants.barcode, search)))
			.limit(1);

		if (exactBarcode.length > 0) {
			return { items: exactBarcode, hasMore: false };
		}
	}

	// Fallback: fuzzy search on name + substring on barcode/size (uses GIN trigram index)
	if (search) {
		baseConditions.push(
			or(
				sql`${productVariants.barcode} ILIKE ${'%' + search + '%'}`,
				sql`${productVariants.size} ILIKE ${'%' + search + '%'}`,
				fuzzyMatch(products.name, search)
			)!
		);
	}

	const items = await db
		.select(variantSelect)
		.from(productVariants)
		.innerJoin(products, eq(productVariants.productId, products.id))
		.where(and(...baseConditions))
		.orderBy(
			search
				? sql`similarity(${products.name}, ${search}) DESC`
				: sql`${products.name} ASC`
		)
		.limit(limit)
		.offset(offset);

	return { items, hasMore: items.length === limit };
}
