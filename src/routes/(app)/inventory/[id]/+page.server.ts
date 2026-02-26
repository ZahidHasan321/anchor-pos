import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { products, productVariants, stockLogs } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { generateId } from '$lib/utils';
import { logAuditEvent } from '$lib/server/audit';
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

	const variants = await db
		.select()
		.from(productVariants)
		.where(eq(productVariants.productId, params.id));

	return { product, variants, user: locals.user };
};

export const actions: Actions = {
	adjustStock: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role === 'sales') {
			return fail(403, { stockError: 'Unauthorized' });
		}
		if (!db) return fail(503, { stockError: 'Database connection unavailable' });

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

		const variantRows = await db
			.select()
			.from(productVariants)
			.where(eq(productVariants.id, variantId))
			.limit(1);

		const variant = variantRows[0];

		if (!variant) {
			return fail(404, { stockError: 'Variant not found' });
		}

		const amount = newQuantity - variant.stockQuantity;
		if (amount === 0) return { stockSuccess: true };

		try {
			await db.transaction(async (tx: any) => {
				// Update stock to absolute value
				await tx
					.update(productVariants)
					.set({ stockQuantity: newQuantity })
					.where(eq(productVariants.id, variantId));

				// Log the change (the delta)
				await tx.insert(stockLogs).values({
					id: generateId(),
					variantId,
					changeAmount: amount,
					reason,
					userId: locals.user!.id,
					createdAt: new Date()
				});
			});

			await logAuditEvent({
				userId: locals.user!.id,
				userName: locals.user!.name,
				action: 'ADJUST_STOCK',
				entity: 'product_variants',
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
		if (!db) return fail(503, { variantError: 'Database connection unavailable' });

		const data = await request.formData();
		const sizes = data.getAll('sizes') as string[];
		const priceStr = (data.get('price') as string)?.trim();
		const discountStr = (data.get('discount') as string)?.trim();
		const initialStock = parseInt(data.get('initialStock') as string) || 0;

		if (sizes.length === 0) {
			return fail(400, { variantError: 'Select at least one size' });
		}

		const productRows = await db.select().from(products).where(eq(products.id, params.id)).limit(1);
		const product = productRows[0];
		if (!product) {
			return fail(404, { variantError: 'Product not found' });
		}

		const price = priceStr ? parseFloat(priceStr) : product.templatePrice;
		const discount = discountStr ? parseFloat(discountStr) : product.defaultDiscount || 0;

		const shortId = params.id.substring(0, 4).toUpperCase();
		const catPrefix = product.category.substring(0, 3).toUpperCase();

		try {
			await db.transaction(async (tx: any) => {
				for (const size of sizes) {
					const variantId = generateId();
					const barcode = `${catPrefix}-${shortId}-${size}`;

					// Check for duplicate barcode
					const existingRows = await tx
						.select()
						.from(productVariants)
						.where(eq(productVariants.barcode, barcode))
						.limit(1);

					if (existingRows.length > 0) continue; // Skip duplicates silently

					await tx.insert(productVariants).values({
						id: variantId,
						productId: params.id,
						size,
						barcode,
						stockQuantity: initialStock,
						price: price,
						discount: discount
					});

					if (initialStock > 0) {
						await tx.insert(stockLogs).values({
							id: generateId(),
							variantId,
							changeAmount: initialStock,
							reason: 'Initial stock',
							userId: locals.user!.id,
							createdAt: new Date()
						});
					}
				}
			});

			await logAuditEvent({
				userId: locals.user!.id,
				userName: locals.user!.name,
				action: 'ADD_VARIANT',
				entity: 'product_variants',
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
		if (!db) return fail(503, { error: 'Database connection unavailable' });

		const data = await request.formData();
		const variantId = data.get('variantId') as string;
		const priceStr = (data.get('price') as string)?.trim();
		const price = priceStr ? parseFloat(priceStr) : 0;
		const discountStr = (data.get('discount') as string)?.trim();
		const discount = discountStr ? parseFloat(discountStr) : 0;

		try {
			await db
				.update(productVariants)
				.set({ price, discount })
				.where(eq(productVariants.id, variantId));
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
		if (!db) return fail(503, { error: 'Database connection unavailable' });

		const data = await request.formData();
		const variantId = data.get('variantId') as string;

		if (!variantId) {
			return fail(400, { error: 'Variant ID required' });
		}

		// Check existence
		const variantRows = await db
			.select()
			.from(productVariants)
			.where(eq(productVariants.id, variantId))
			.limit(1);

		const variant = variantRows[0];
		if (!variant) {
			return fail(404, { error: 'Variant not found' });
		}

		try {
			await db.delete(productVariants).where(eq(productVariants.id, variantId));

			await logAuditEvent({
				userId: locals.user!.id,
				userName: locals.user!.name,
				action: 'DELETE_VARIANT',
				entity: 'product_variants',
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
		if (!db) return fail(503, { deleteError: 'Database connection unavailable' });

		try {
			await db.delete(products).where(eq(products.id, params.id));

			await logAuditEvent({
				userId: locals.user!.id,
				userName: locals.user!.name,
				action: 'DELETE_PRODUCT',
				entity: 'products',
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
