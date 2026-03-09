import { json } from '@sveltejs/kit';
import { createPowerSyncToken, fetchRemotePowerSyncToken } from '$lib/server/powersync-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals }) => {
    let userId = locals.user?.id;

    // Allow Electron clients to authenticate via app secret header
    if (!userId) {
        const appSecret = request.headers.get('x-app-secret');
        const expectedSecret = process.env.APP_SECRET_HEADER || 'auto-pos-secret-handshake-2026';
        const headerUserId = request.headers.get('x-user-id');
        if (appSecret === expectedSecret && headerUserId) {
            userId = headerUserId;
        } else {
            return json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    // In Electron, we don't have the private key, so we MUST ask the VPS for a signed token
    if (process.env.BUILD_TARGET === 'electron') {
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
