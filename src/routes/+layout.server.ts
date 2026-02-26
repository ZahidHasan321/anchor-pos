import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { storeSettings } from '$lib/server/db/schema';

export const load: LayoutServerLoad = async ({ locals }) => {
	const settings: Record<string, string> = {};
	
	if (db) {
		const rows = await db.select().from(storeSettings);
		for (const row of rows) {
			settings[row.key] = row.value;
		}
	}

	return {
		user: locals.user,
		storeSettings: settings
	};
};
