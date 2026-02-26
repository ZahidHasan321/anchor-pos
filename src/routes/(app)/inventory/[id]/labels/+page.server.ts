import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { products, productVariants } from '$lib/server/db/schema';
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

	const variants = await db
		.select()
		.from(productVariants)
		.where(eq(productVariants.productId, params.id));

	return { product, variants };
};
