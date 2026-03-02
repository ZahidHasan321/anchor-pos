import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { storeSettings } from '$lib/server/db/schema';

export const load: LayoutServerLoad = async ({ locals }) => {
	const isElectron = process.env.BUILD_TARGET === 'electron';

	// In Electron mode, settings are loaded client-side from PowerSync
	if (isElectron) {
		return { user: locals.user, storeSettings: {} };
	}

	const settings: Record<string, string> = {};
	if (db) {
		try {
			const rows = await db.select().from(storeSettings);
			for (const row of rows) {
				settings[row.key] = row.value;
			}
		} catch (e) {
			console.warn('[layout] DB query failed:', e);
		}
	}

	return {
		user: locals.user,
		storeSettings: settings
	};
};
