import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { products, productVariants, storeSettings } from '$lib/server/db/schema';
import { eq, sql, desc } from 'drizzle-orm';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';
import { logAuditEvent } from '$lib/server/audit';
import env from '$lib/server/env';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !(await hasPermission(locals.user.role, 'inventory'))) {
		redirect(302, locals.user ? await getDefaultRedirect(locals.user.role) : '/login');
	}

	const isNative = env.IS_NATIVE;

	const emptyResult = {
		stats: {
			totalProducts: 0,
			totalVariants: 0,
			lowStockVariants: 0,
			outOfStockVariants: 0,
			totalCostValue: 0,
			totalRetailValue: 0
		},
		categories: [] as string[],
		products: [] as any[],
		lowStockThreshold: 5
	};

	return {
		isNative,
		user: locals.user,

		// Load everything once — ~100 products is small enough for a single fetch
		streamed: (async () => {
			if (isNative || !db) return emptyResult;

			const [settingsRows, statsResult, categoryRows, productList] = await Promise.all([
				db.select().from(storeSettings),
				db
					.select({
						totalProducts: sql<number>`COUNT(DISTINCT ${products.id})`,
						totalVariants: sql<number>`COUNT(${productVariants.id})`,
						lowStockVariants: sql<number>`SUM(CASE WHEN ${productVariants.stockQuantity} > 0 AND ${productVariants.stockQuantity} <= (SELECT COALESCE(NULLIF(value, '')::int, 5) FROM ${storeSettings} WHERE key = 'low_stock_threshold') THEN 1 ELSE 0 END)`,
						outOfStockVariants: sql<number>`SUM(CASE WHEN ${productVariants.stockQuantity} = 0 THEN 1 ELSE 0 END)`,
						totalCostValue: sql<number>`COALESCE(SUM(COALESCE(NULLIF(${productVariants.costPrice}, 0), ${products.costPrice}, 0) * ${productVariants.stockQuantity}), 0)`,
						totalRetailValue: sql<number>`COALESCE(SUM(${productVariants.price} * ${productVariants.stockQuantity}), 0)`
					})
					.from(productVariants)
					.innerJoin(products, eq(productVariants.productId, products.id)),
				db.selectDistinct({ category: products.category }).from(products),
				db
					.select({
						id: products.id,
						name: products.name,
						category: products.category,
						templatePrice: products.templatePrice,
						defaultDiscount: products.defaultDiscount,
						totalStock: sql<number>`COALESCE(SUM(${productVariants.stockQuantity}), 0)`
					})
					.from(products)
					.leftJoin(productVariants, eq(productVariants.productId, products.id))
					.groupBy(products.id)
					.orderBy(desc(products.id))
			]);

			const settings = settingsRows.reduce(
				(acc: Record<string, string>, row: { key: string; value: string }) => {
					acc[row.key] = row.value;
					return acc;
				},
				{} as Record<string, string>
			);
			const threshold = parseInt(settings.low_stock_threshold || '5');

			// Fetch all variants in one query
			const allVariants = await db.select().from(productVariants);

			const variantsByProduct = new Map<string, any[]>();
			for (const v of allVariants) {
				const list = variantsByProduct.get(v.productId) ?? [];
				list.push(v);
				variantsByProduct.set(v.productId, list);
			}

			return {
				stats: statsResult[0] ?? emptyResult.stats,
				categories: categoryRows.map((c: any) => c.category).sort(),
				products: productList.map((p: any) => ({
					...p,
					variants: variantsByProduct.get(p.id) ?? []
				})),
				lowStockThreshold: threshold
			};
		})()
	};
};

export const actions: Actions = {
	deleteProduct: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') {
			return fail(403, { error: 'Only admins can delete products' });
		}
		if (!db) return fail(503, { error: 'Database connection unavailable' });

		const data = await request.formData();
		const productId = data.get('productId') as string;

		if (!productId) {
			return fail(400, { error: 'Product ID required' });
		}

		try {
			await db.delete(products).where(eq(products.id, productId));

			await logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'DELETE_PRODUCT',
				entity: 'products',
				entityId: productId,
				details: `Deleted product from inventory list`
			});
		} catch (e) {
			console.error('Failed to delete product:', e);
			return fail(500, { error: 'Database error' });
		}

		return { deleteSuccess: true };
	}
};
