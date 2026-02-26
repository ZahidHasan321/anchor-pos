import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { products, productVariants, storeSettings } from '$lib/server/db/schema';
import { eq, sql, desc, and } from 'drizzle-orm';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user || !(await hasPermission(locals.user.role, 'inventory'))) {
		redirect(302, locals.user ? await getDefaultRedirect(locals.user.role) : '/login');
	}

	const pageParam = parseInt(url.searchParams.get('page') ?? '1');
	const perPage = 20;
	const currentPage = Math.max(1, pageParam);
	const offset = (currentPage - 1) * perPage;
	const categoryFilter = url.searchParams.get('category') ?? '';
	const search = url.searchParams.get('q') ?? '';
	const stockStatus = url.searchParams.get('stock') ?? '';

	// Immediate data
	return {
		filters: { category: categoryFilter, search, stockStatus },

		// Streaming everything else
		streamed: (async () => {
			if (!db) return {
				stats: { totalProducts: 0, totalVariants: 0, lowStockVariants: 0, outOfStockVariants: 0, totalInventoryValue: 0 },
				categories: [],
				products: [],
				total: 0,
				totalPages: 1,
				currentPage: 1
			};
			const settingsRows = await db.select().from(storeSettings);
			const settings = settingsRows.reduce(
				(acc: Record<string, string>, row: { key: string; value: string }) => {
					acc[row.key] = row.value;
					return acc;
				},
				{} as Record<string, string>
			);
			const threshold = parseInt(settings.low_stock_threshold || '5');

			const [statsResult, categoryRows] = await Promise.all([
				db
					.select({
						totalProducts: sql<number>`COUNT(DISTINCT ${products.id})`,
						totalVariants: sql<number>`COUNT(${productVariants.id})`,
						lowStockVariants: sql<number>`SUM(CASE WHEN ${productVariants.stockQuantity} > 0 AND ${productVariants.stockQuantity} <= ${threshold} THEN 1 ELSE 0 END)`,
						outOfStockVariants: sql<number>`SUM(CASE WHEN ${productVariants.stockQuantity} = 0 THEN 1 ELSE 0 END)`,
						totalInventoryValue: sql<number>`COALESCE(SUM(${productVariants.price} * ${productVariants.stockQuantity}), 0)`
					})
					.from(productVariants)
					.innerJoin(products, eq(productVariants.productId, products.id)),
				db.selectDistinct({ category: products.category }).from(products)
			]);

			// List Queries
			const conditions: any[] = [];
			if (categoryFilter) conditions.push(eq(products.category, categoryFilter));
			if (search) {
				const norm = '%' + search.replace(/[-\s_.]/g, '').toLowerCase() + '%';
				conditions.push(
					sql`(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${products.name}), '-', ''), ' ', ''), '_', ''), '.', '') LIKE ${norm} OR REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${products.category}), '-', ''), ' ', ''), '_', ''), '.', '') LIKE ${norm} OR EXISTS (SELECT 1 FROM ${productVariants} WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.barcode} LIKE ${'%' + search + '%'}))`
				);
			}
			if (stockStatus === 'out')
				conditions.push(
					sql`EXISTS (SELECT 1 FROM ${productVariants} WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.stockQuantity} = 0)`
				);
			else if (stockStatus === 'low')
				conditions.push(
					sql`EXISTS (SELECT 1 FROM ${productVariants} WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.stockQuantity} > 0 AND ${productVariants.stockQuantity} <= ${threshold})`
				);
			else if (stockStatus === 'healthy')
				conditions.push(
					sql`NOT EXISTS (SELECT 1 FROM ${productVariants} WHERE ${productVariants.productId} = ${products.id} AND ${productVariants.stockQuantity} <= ${threshold})`
				);

			const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

			const [countResult, productList] = await Promise.all([
				db
					.select({ count: sql<number>`count(*)` })
					.from(products)
					.where(whereClause),
				db
					.select({
						id: products.id,
						name: products.name,
						category: products.category,
						templatePrice: products.templatePrice,
						defaultDiscount: products.defaultDiscount,
						totalStock: sql<number>`COALESCE((SELECT SUM(${productVariants.stockQuantity}) FROM ${productVariants} WHERE ${productVariants.productId} = ${products.id}), 0)`
					})
					.from(products)
					.where(whereClause)
					.orderBy(desc(products.id))
					.limit(perPage)
					.offset(offset)
			]);

			const productIds = productList.map((p: any) => p.id);
			let variants: any[] = [];
			if (productIds.length > 0) {
				variants = await db
					.select()
					.from(productVariants)
					.where(
						sql`${productVariants.productId} IN (${sql.join(
							productIds.map((id: string) => sql`${id}`),
							sql`, `
						)})`
					);
			}

			const variantsByProduct = new Map();
			for (const v of variants) {
				const list = variantsByProduct.get(v.productId) ?? [];
				list.push(v);
				variantsByProduct.set(v.productId, list);
			}

			return {
				stats: statsResult[0] ?? {
					totalProducts: 0,
					totalVariants: 0,
					lowStockVariants: 0,
					outOfStockVariants: 0,
					totalInventoryValue: 0
				},
				categories: categoryRows.map((c: any) => c.category).sort(),
				products: productList.map((p: any) => ({ ...p, variants: variantsByProduct.get(p.id) ?? [] })),
				total: countResult[0]?.count ?? 0,
				totalPages: Math.ceil((countResult[0]?.count ?? 0) / perPage),
				currentPage
			};
		})()
	};
};
