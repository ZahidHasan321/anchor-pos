import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { products } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user || !hasPermission(locals.user.role, 'inventory')) {
		redirect(302, locals.user ? getDefaultRedirect(locals.user.role) : '/login');
	}

	const product = db.select().from(products).where(eq(products.id, params.id)).get();

	if (!product) {
		redirect(302, '/inventory');
	}

	const categories = db
		.selectDistinct({ category: products.category })
		.from(products)
		.all()
		.map((r) => r.category);

	return { product, categories };
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role === 'sales') {
			return fail(403, { error: 'Unauthorized' });
		}

		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const category = (data.get('category') as string)?.trim();
		const templatePrice = parseFloat(data.get('templatePrice') as string);

		// Normalize category by finding existing case-insensitive match
		const existingCategories = db
			.selectDistinct({ category: products.category })
			.from(products)
			.all()
			.map((r) => r.category);

		const normalizedCategory =
			existingCategories.find((c) => c.toLowerCase() === category?.toLowerCase()) || category;

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
			db.update(products)
				.set({
					name,
					description,
					category: normalizedCategory,
					templatePrice,
					defaultDiscount
				})
				.where(eq(products.id, params.id))
				.run();
		} catch (e) {
			console.error('Failed to update product:', e);
			return fail(500, { error: 'Database error' });
		}

		redirect(302, `/inventory/${params.id}`);
	}
};
