import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { storeSettings } from '$lib/server/db/schema';
import { logAuditEvent } from '$lib/server/audit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		redirect(302, '/dashboard');
	}

	const rows = await db.select().from(storeSettings);
	const settings = rows.reduce(
		(acc, row) => {
			acc[row.key] = row.value;
			return acc;
		},
		{} as Record<string, string>
	);

	return { settings };
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403);

		const data = await request.formData();
		const keys = [
			'store_name',
			'store_address',
			'store_phone',
			'store_email',
			'store_website',
			'store_tax_id',
			'receipt_footer',
			'return_policy',
			'exchange_policy',
			'terms_conditions',
			'tax_enabled',
			'tax_rate',
			'sd_enabled',
			'sd_rate',
			'store_facebook',
			'store_instagram',
			'store_bin',
			'low_stock_threshold'
		];

		try {
			await db.transaction(async (tx) => {
				for (const key of keys) {
					const value = (data.get(key) as string)?.trim() || '';
					await tx
						.insert(storeSettings)
						.values({ key, value })
						.onConflictDoUpdate({ target: storeSettings.key, set: { value } });
				}
			});

			await logAuditEvent({
				userId: locals.user!.id,
				userName: locals.user!.name,
				action: 'UPDATE_SETTINGS',
				entity: 'store_settings',
				details: 'Updated store contact info and receipt settings'
			});
		} catch (e) {
			console.error('Failed to update settings:', e);
			return fail(500, { error: 'Database error' });
		}

		return { success: true };
	}
};
