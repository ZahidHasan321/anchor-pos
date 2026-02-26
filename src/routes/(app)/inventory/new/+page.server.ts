import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { products, productVariants, stockLogs } from '$lib/server/db/schema';
import { generateId } from '$lib/utils';
import { logAuditEvent } from '$lib/server/audit';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !(await hasPermission(locals.user.role, 'inventory'))) {
		redirect(302, locals.user ? await getDefaultRedirect(locals.user.role) : '/login');
	}

	if (!db) return { categories: [] };

	const rows = await db.selectDistinct({ category: products.category }).from(products);
		const categories = rows.map((r: { category: string }) => r.category);

	return { categories: categories.sort() };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user || locals.user.role === 'sales') {
			return fail(403, { error: 'Unauthorized' });
		}
		if (!db) return fail(503, { error: 'Database connection unavailable' });

		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const category = (data.get('category') as string)?.trim();
		const templatePrice = parseFloat(data.get('templatePrice') as string);
		const defaultDiscount = parseFloat(data.get('defaultDiscount') as string) || 0;
		const description = (data.get('description') as string)?.trim() || null;
		const sizes = data.getAll('sizes') as string[];
		const quantities = data.getAll('quantities').map((q) => parseInt(q as string) || 0);
		const stockReason = (data.get('stockReason') as string)?.trim() || 'Initial Stock';

		// Validation
		const errors: Record<string, string> = {};
		if (!name) errors.name = 'Product name is required';
		if (!category) errors.category = 'Category is required';
		if (isNaN(templatePrice) || templatePrice <= 0) errors.templatePrice = 'Valid price required';
		if (sizes.length === 0) errors.sizes = 'Select at least one size';

		if (Object.keys(errors).length > 0) {
			return fail(400, { errors, data: Object.fromEntries(data) });
		}

		const productId = generateId();
		const shortId = productId.substring(0, 4).toUpperCase();

		// Normalize category by finding existing case-insensitive match
		const catRows = await db.selectDistinct({ category: products.category }).from(products);

		const existingCategories = catRows.map((r: { category: string }) => r.category);

		const normalizedCategory =
			existingCategories.find((c: string) => c.toLowerCase() === category.toLowerCase()) || category;

		const catPrefix = normalizedCategory.substring(0, 3).toUpperCase();

		try {
			await db.transaction(async (tx: any) => {
				await tx.insert(products).values({
					id: productId,
					name,
					description,
					category: normalizedCategory,
					templatePrice,
					defaultDiscount
				});

				for (let i = 0; i < sizes.length; i++) {
					const size = sizes[i];
					const quantity = quantities[i] ?? 0;
					const variantId = generateId();
					// Format: {CATEGORY_PREFIX}-{PRODUCT_ID_SHORT}-{SIZE}
					const barcode = `${catPrefix}-${shortId}-${size}`;

					await tx.insert(productVariants).values({
						id: variantId,
						productId,
						size,
						barcode,
						stockQuantity: quantity,
						price: templatePrice,
						discount: defaultDiscount
					});

					if (quantity > 0) {
						await tx.insert(stockLogs).values({
							id: generateId(),
							variantId,
							changeAmount: quantity,
							reason: stockReason,
							userId: locals.user!.id
						});
					}
				}
			});

			await logAuditEvent({
				userId: locals.user!.id,
				userName: locals.user!.name,
				action: 'CREATE_PRODUCT',
				entity: 'products',
				entityId: productId,
				details: `Created product: ${name} with ${sizes.length} variants`
			});
		} catch (e) {
			console.error('Failed to create product:', e);
			return fail(500, { error: 'Failed to create product in database' });
		}

		redirect(302, `/inventory/${productId}`);
	}
};
