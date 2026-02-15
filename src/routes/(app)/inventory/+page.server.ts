import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { products, productVariants } from '$lib/server/db/schema';
import { eq, sql, desc, and } from 'drizzle-orm';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user || !hasPermission(locals.user.role, 'inventory')) {
		redirect(302, locals.user ? getDefaultRedirect(locals.user.role) : '/login');
	}

	const pageParam = parseInt(url.searchParams.get('page') ?? '1');
	const perPage = 20;
	const currentPage = Math.max(1, pageParam);
	const offset = (currentPage - 1) * perPage;
	const categoryFilter = url.searchParams.get('category') ?? '';
	const search = url.searchParams.get('q') ?? '';
	const stockStatus = url.searchParams.get('stock') ?? '';

	// --- Summary stats (unfiltered, always show global health) ---
	const stats = db
		.select({
			totalProducts: sql<number>`COUNT(DISTINCT ${products.id})`,
			totalVariants: sql<number>`COUNT(${productVariants.id})`,
			lowStockVariants: sql<number>`SUM(CASE WHEN ${productVariants.stockQuantity} > 0 AND ${productVariants.stockQuantity} <= 5 THEN 1 ELSE 0 END)`,
			outOfStockVariants: sql<number>`SUM(CASE WHEN ${productVariants.stockQuantity} = 0 THEN 1 ELSE 0 END)`,
			totalInventoryValue: sql<number>`COALESCE(SUM(${productVariants.price} * ${productVariants.stockQuantity}), 0)`
		})
		.from(productVariants)
		.innerJoin(products, eq(productVariants.productId, products.id))
		.get() ?? {
		totalProducts: 0,
		totalVariants: 0,
		lowStockVariants: 0,
		outOfStockVariants: 0,
		totalInventoryValue: 0
	};

	// --- Build conditions for the product list ---
	const conditions: any[] = [];
	if (categoryFilter) {
		conditions.push(eq(products.category, categoryFilter));
	}
	if (search) {
		conditions.push(
			sql`(${products.name} LIKE ${'%' + search + '%'} OR ${products.category} LIKE ${'%' + search + '%'} OR EXISTS (SELECT 1 FROM product_variant WHERE product_id = ${products.id} AND barcode LIKE ${'%' + search + '%'}))`
		);
	}
	if (stockStatus === 'out') {
		// Products that have at least one variant with 0 stock
		conditions.push(
			sql`EXISTS (SELECT 1 FROM product_variant WHERE product_id = ${products.id} AND stock_quantity = 0)`
		);
	} else if (stockStatus === 'low') {
		// Products that have at least one variant with stock between 1-5
		conditions.push(
			sql`EXISTS (SELECT 1 FROM product_variant WHERE product_id = ${products.id} AND stock_quantity > 0 AND stock_quantity <= 5)`
		);
	} else if (stockStatus === 'healthy') {
		// Products where ALL variants have stock > 5
		conditions.push(
			sql`NOT EXISTS (SELECT 1 FROM product_variant WHERE product_id = ${products.id} AND stock_quantity <= 5)`
		);
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const countResult = db
		.select({ count: sql<number>`count(*)` })
		.from(products)
		.where(whereClause)
		.get();
	const total = countResult?.count ?? 0;

	const productList = db
		.select({
			id: products.id,
			name: products.name,
			category: products.category,
			templatePrice: products.templatePrice,
			defaultDiscount: products.defaultDiscount,
			totalStock: sql<number>`COALESCE((SELECT SUM(stock_quantity) FROM product_variant WHERE product_id = ${products.id}), 0)`
		})
		.from(products)
		.where(whereClause)
		.orderBy(desc(products.id))
		.limit(perPage)
		.offset(offset)
		.all();

	// Fetch variants for all products on this page (for the size grid)
	const productIds = productList.map((p) => p.id);
	let variants: {
		id: string;
		productId: string;
		size: string;
		color: string | null;
		stockQuantity: number;
		barcode: string;
		price: number;
	}[] = [];
	if (productIds.length > 0) {
		variants = db
			.select({
				id: productVariants.id,
				productId: productVariants.productId,
				size: productVariants.size,
				color: productVariants.color,
				stockQuantity: productVariants.stockQuantity,
				barcode: productVariants.barcode,
				price: productVariants.price
			})
			.from(productVariants)
			.where(
				sql`${productVariants.productId} IN (${sql.join(
					productIds.map((id) => sql`${id}`),
					sql`, `
				)})`
			)
			.all();
	}

	// Group variants by product
	const variantsByProduct = new Map<string, typeof variants>();
	for (const v of variants) {
		const list = variantsByProduct.get(v.productId) ?? [];
		list.push(v);
		variantsByProduct.set(v.productId, list);
	}

	const productsWithVariants = productList.map((p) => ({
		...p,
		variants: variantsByProduct.get(p.id) ?? []
	}));

	const categories = db
		.selectDistinct({ category: products.category })
		.from(products)
		.all()
		.map((c) => c.category);

	return {
		products: productsWithVariants,
		categories,
		stats,
		pagination: {
			currentPage,
			totalPages: Math.ceil(total / perPage),
			total,
			perPage
		},
		filters: {
			category: categoryFilter,
			search,
			stockStatus
		}
	};
};
