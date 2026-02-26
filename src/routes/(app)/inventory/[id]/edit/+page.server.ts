import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { products } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user || !(await hasPermission(locals.user.role, 'inventory'))) {
		redirect(302, locals.user ? await getDefaultRedirect(locals.user.role) : '/login');
	}

	if (!db) {
		redirect(302, '/inventory');
	}

	const productRows = await db.select().from(products).where(eq(products.id, params.id)).limit(1);
	const product = productRows[0];

	if (!product) {
		redirect(302, '/inventory');
	}

		const categoryRows = await db.selectDistinct({ category: products.category }).from(products);
		const categories = categoryRows.map((r: { category: string }) => r.category);

	return { product, categories: categories.sort() };
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role === 'sales') {
			return fail(403, { error: 'Unauthorized' });
		}
		if (!db) return fail(503, { error: 'Database connection unavailable' });

		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const category = (data.get('category') as string)?.trim();
		const templatePrice = parseFloat(data.get('templatePrice') as string);

		// Normalize category by finding existing case-insensitive match
				const catRows = await db.selectDistinct({ category: products.category }).from(products);
				const existingCategories = catRows.map((r: { category: string }) => r.category);
				const normalizedCategory =
					existingCategories.find((c: string) => c.toLowerCase() === category?.toLowerCase()) || category;

		const defaultDiscount = parseFloat(data.get('defaultDiscount') as string) || 0;
		const description = (data.get('description') as string)?.trim() || null;

		// Validation
		const errors: Record<string, string> = {};
		if (!name) errors.name = 'Product name is required';
		if (!normalizedCategory) errors.category = 'Category is required';
		if (isNaN(templatePrice) || templatePrice <= 0) errors.templatePrice = 'Valid price required';

		if (Object.keys(errors).length > 0) {
			return fail(400, { errors, data: Object.fromEntries(data) });
		}

		try {
			await db
				.update(products)
				.set({
					name,
					description,
					category: normalizedCategory,
					templatePrice,
					defaultDiscount
				})
				.where(eq(products.id, params.id));
		} catch (e) {
			console.error('Failed to update product:', e);
			return fail(500, { error: 'Database error' });
		}

		redirect(302, `/inventory/${params.id}`);
	}
};
