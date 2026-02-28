import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { storeSettings } from '$lib/server/db/schema';

export const load: LayoutServerLoad = async ({ locals }) => {
	const settings: Record<string, string> = {};
	const isElectron = process.env.BUILD_TARGET === 'electron';
	
	let primaryDbSuccess = false;
	if (db) {
		try {
			const rows = await db.select().from(storeSettings);
			for (const row of rows) {
				settings[row.key] = row.value;
			}
			primaryDbSuccess = true;
		} catch (e) {
			console.warn('[layout] Primary DB query failed, falling back...');
		}
	} 

	if (!primaryDbSuccess && isElectron) {
		try {
			const { getPowerSyncDb } = await import('$lib/powersync/db');
			const psDb = getPowerSyncDb();
			const rows = await psDb.getAll('SELECT * FROM store_settings');
			for (const row of rows) {
				settings[row.key] = row.value;
			}
		} catch (e) {
			console.warn('[layout] Failed to load settings from PowerSync:', e);
		}
	}

	return {
		user: locals.user,
		storeSettings: settings
	};
};
