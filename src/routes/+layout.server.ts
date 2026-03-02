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
		console.log('[layout] Attempting to load settings from PowerSync...');
		try {
			const { getPowerSyncDb } = await import('$lib/powersync/db');
			const psDb = getPowerSyncDb();
			
			// Race the PowerSync query with a timeout
			const psQuery = psDb.getAll('SELECT * FROM store_settings');
			const psTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('PowerSync layout query timeout')), 3000));
			
			const rows = await Promise.race([psQuery, psTimeout]) as any[];
			
			for (const row of rows) {
				settings[row.key] = row.value;
			}
			console.log('[layout] Settings loaded from PowerSync successfully');
		} catch (e) {
			console.warn('[layout] Failed to load settings from PowerSync or timed out:', e instanceof Error ? e.message : e);
		}
	}

	return {
		user: locals.user,
		storeSettings: settings
	};
};
