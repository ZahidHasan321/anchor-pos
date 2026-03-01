import { json } from '@sveltejs/kit';
import { createPowerSyncToken, fetchRemotePowerSyncToken } from '$lib/server/powersync-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In Electron, we don't have the private key, so we MUST ask the VPS for a signed token
    if (process.env.BUILD_TARGET === 'electron') {
        try {
            const token = await fetchRemotePowerSyncToken(locals.user.id);
            return json({ token });
        } catch (e) {
            console.error('[PowerSync Token] Fetch error:', e);
            return json({ error: 'Failed to fetch remote token' }, { status: 502 });
        }
    }

    const token = await createPowerSyncToken(locals.user.id);
    return json({ token });
};
