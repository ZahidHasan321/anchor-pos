import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { storeSettings } from '$lib/server/db/schema';

export const load: LayoutServerLoad = async ({ locals }) => {
	const rows = await db.select().from(storeSettings);
	const settings = rows.reduce(
		(acc: Record<string, string>, row: { key: string; value: string }) => {
			acc[row.key] = row.value;
			return acc;
		},
		{} as Record<string, string>
	);

	return {
		user: locals.user,
		storeSettings: settings
	};
};
