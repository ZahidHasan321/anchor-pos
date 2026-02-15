import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { products, productVariants } from '$lib/server/db/schema';
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

	const variants = db
		.select()
		.from(productVariants)
		.where(eq(productVariants.productId, params.id))
		.all();

	return { product, variants };
};
