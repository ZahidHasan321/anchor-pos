import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { products, productVariants, stockLogs } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { generateId } from '$lib/utils';
import { logAuditEvent } from '$lib/server/audit';
import { hasPermission, getDefaultRedirect } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user || !hasPermission(locals.user.role, 'inventory')) {
		redirect(302, locals.user ? getDefaultRedirect(locals.user.role) : '/login');
	}

	const product = db.select().from(products).where(eq(products.id, params.id)).get();

	if (!product) {
		redirect(302, '/inventory');
	}

	const variants = db
		.select()
		.from(productVariants)
		.where(eq(productVariants.productId, params.id))
		.all();

	return { product, variants, user: locals.user };
};

export const actions: Actions = {
	adjustStock: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role === 'sales') {
			return fail(403, { stockError: 'Unauthorized' });
		}

		const data = await request.formData();
		const variantId = data.get('variantId') as string;
		const newQuantity = parseInt(data.get('newQuantity') as string);
		const reason = (data.get('reason') as string)?.trim();

		if (!variantId || isNaN(newQuantity) || newQuantity < 0) {
			return fail(400, { stockError: 'Valid variant and quantity required' });
		}
		if (!reason) {
			return fail(400, { stockError: 'Reason is required' });
		}

		const variant = db
			.select()
			.from(productVariants)
			.where(eq(productVariants.id, variantId))
			.get();

		if (!variant) {
			return fail(404, { stockError: 'Variant not found' });
		}

		const amount = newQuantity - variant.stockQuantity;
		if (amount === 0) return { stockSuccess: true };

		try {
			db.transaction((tx) => {
				// Update stock to absolute value
				tx.update(productVariants)
					.set({ stockQuantity: newQuantity })
					.where(eq(productVariants.id, variantId))
					.run();

				// Log the change (the delta)
				tx.insert(stockLogs)
					.values({
						id: generateId(),
						variantId,
						changeAmount: amount,
						reason,
						userId: locals.user!.id,
						createdAt: new Date()
					})
					.run();
			});

			logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'ADJUST_STOCK',
				entity: 'product_variant',
				entityId: variantId,
				details: `Updated stock from ${variant.stockQuantity} to ${newQuantity} (Delta: ${amount}, Reason: ${reason})`
			});
		} catch (e) {
			console.error('Failed to adjust stock:', e);
			return fail(500, { stockError: 'Database error' });
		}

		return { stockSuccess: true };
	},

	addVariant: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role === 'sales') {
			return fail(403, { variantError: 'Unauthorized' });
		}

		const data = await request.formData();
		const sizes = data.getAll('sizes') as string[];
		const priceStr = (data.get('price') as string)?.trim();
		const discountStr = (data.get('discount') as string)?.trim();
		const initialStock = parseInt(data.get('initialStock') as string) || 0;

		if (sizes.length === 0) {
			return fail(400, { variantError: 'Select at least one size' });
		}

		const product = db.select().from(products).where(eq(products.id, params.id)).get();
		if (!product) {
			return fail(404, { variantError: 'Product not found' });
		}

		const price = priceStr ? parseFloat(priceStr) : product.templatePrice;
		const discount = discountStr ? parseFloat(discountStr) : product.defaultDiscount || 0;

		const shortId = params.id.substring(0, 4).toUpperCase();
		const catPrefix = product.category.substring(0, 3).toUpperCase();

		try {
			db.transaction((tx) => {
				for (const size of sizes) {
					const variantId = generateId();
					const barcode = `${catPrefix}-${shortId}-${size}`;

					// Check for duplicate barcode
					const existing = tx
						.select()
						.from(productVariants)
						.where(eq(productVariants.barcode, barcode))
						.get();
					if (existing) continue; // Skip duplicates silently

					tx.insert(productVariants)
						.values({
							id: variantId,
							productId: params.id,
							size,
							barcode,
							stockQuantity: initialStock,
							price: price,
							discount: discount
						})
						.run();

					if (initialStock > 0) {
						tx.insert(stockLogs)
							.values({
								id: generateId(),
								variantId,
								changeAmount: initialStock,
								reason: 'Initial stock',
								userId: locals.user!.id,
								createdAt: new Date()
							})
							.run();
					}
				}
			});

			logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'ADD_VARIANT',
				entity: 'product_variant',
				entityId: params.id,
				details: `Added ${sizes.length} variant(s): ${sizes.join(', ')} to product ${product.name}`
			});
		} catch (e) {
			console.error('Failed to add variants:', e);
			return fail(500, { variantError: 'Database error' });
		}

		return { variantSuccess: true };
	},

	editVariant: async ({ request, locals }) => {
		if (!locals.user || locals.user.role === 'sales') {
			return fail(403, { error: 'Unauthorized' });
		}

		const data = await request.formData();
		const variantId = data.get('variantId') as string;
		const priceStr = (data.get('price') as string)?.trim();
		const price = priceStr ? parseFloat(priceStr) : 0;
		const discountStr = (data.get('discount') as string)?.trim();
		const discount = discountStr ? parseFloat(discountStr) : 0;

		try {
			db.update(productVariants)
				.set({ price, discount })
				.where(eq(productVariants.id, variantId))
				.run();
		} catch (e) {
			console.error('Failed to edit variant:', e);
			return fail(500, { error: 'Database error' });
		}

		return { editVariantSuccess: true };
	},

	deleteVariant: async ({ request, locals }) => {
		if (!locals.user || locals.user.role === 'sales') {
			return fail(403, { error: 'Unauthorized' });
		}

		const data = await request.formData();
		const variantId = data.get('variantId') as string;

		if (!variantId) {
			return fail(400, { error: 'Variant ID required' });
		}

		// Check it's not the last variant
		const variant = db
			.select()
			.from(productVariants)
			.where(eq(productVariants.id, variantId))
			.get();
		if (!variant) {
			return fail(404, { error: 'Variant not found' });
		}

		try {
			db.delete(productVariants).where(eq(productVariants.id, variantId)).run();

			logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'DELETE_VARIANT',
				entity: 'product_variant',
				entityId: variantId,
				details: `Deleted variant ${variant.size}`
			});
		} catch (e) {
			console.error('Failed to delete variant:', e);
			return fail(500, { error: 'Database error' });
		}

		return { deleteVariantSuccess: true };
	},

	deleteProduct: async ({ params, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') {
			return fail(403, { deleteError: 'Only admins can delete products' });
		}

		try {
			db.delete(products).where(eq(products.id, params.id)).run();

			logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'DELETE_PRODUCT',
				entity: 'product',
				entityId: params.id,
				details: `Deleted product ID: ${params.id}`
			});
		} catch (e) {
			console.error('Failed to delete product:', e);
			return fail(500, { deleteError: 'Database error' });
		}

		redirect(302, '/inventory');
	}
};
