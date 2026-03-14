import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { storeSettings } from '$lib/server/db/schema';
import env from '$lib/server/env';
import pkg from '../../package.json';

export const load: LayoutServerLoad = async ({ locals }) => {

	// In Electron/Capacitor mode, settings are loaded client-side from PowerSync
	if (env.IS_ELECTRON || env.IS_CAPACITOR) {
		return { user: locals.user, storeSettings: {}, version: pkg.version };
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
		storeSettings: settings,
		version: pkg.version
	};
};
