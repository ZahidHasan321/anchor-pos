import { json } from '@sveltejs/kit';
import { createPowerSyncToken, fetchRemotePowerSyncToken } from '$lib/server/powersync-auth';
import env from '$lib/server/env';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals }) => {
	const userId = locals.user?.id;

	if (!userId) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// In Electron, we don't have the private key, so we MUST ask the VPS for a signed token
	if (env.IS_ELECTRON) {
		try {
			const token = await fetchRemotePowerSyncToken(userId);
			return json({ token });
		} catch (e) {
			console.error('[PowerSync Token] Fetch error:', e);
			return json({ error: 'Failed to fetch remote token' }, { status: 502 });
		}
	}

	const token = await createPowerSyncToken(userId);
	return json({ token });
};
