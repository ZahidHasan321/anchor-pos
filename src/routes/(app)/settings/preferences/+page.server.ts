import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { storeSettings } from '$lib/server/db/schema';
import { logAuditEvent } from '$lib/server/audit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		redirect(302, '/dashboard');
	}

	if (!db) return { settings: {} };

	const rows = await db.select().from(storeSettings);
	const settings = rows.reduce(
		(acc: Record<string, string>, row: { key: string; value: string }) => {
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
		if (!db) return fail(503, { error: 'Database connection unavailable' });

		const data = await request.formData();
		const keys = [
			'low_stock_threshold',
			'tax_enabled',
			'tax_rate',
			'sd_enabled',
			'sd_rate'
		];

		try {
			await db.transaction(async (tx: any) => {
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
				action: 'UPDATE_PREFERENCES',
				entity: 'store_settings',
				details: 'Updated application preferences (stock threshold, tax settings)'
			});
		} catch (e) {
			console.error('Failed to update preferences:', e);
			return fail(500, { error: 'Database error' });
		}

		return { success: true };
	}
};
