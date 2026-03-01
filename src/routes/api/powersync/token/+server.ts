import { json } from '@sveltejs/kit';
import { createPowerSyncToken } from '$lib/server/powersync-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In Electron, we don't have the private key, so we MUST ask the VPS for a signed token
    if (process.env.BUILD_TARGET === 'electron') {
        const vpsUrl = process.env.POWERSYNC_API_URL || 'https://anchorshop.cloud';
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            const res = await fetch(`${vpsUrl}/api/auth/remote-powersync-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-app-secret': process.env.APP_SECRET_HEADER || 'auto-pos-secret-handshake-2026',
                },
                body: JSON.stringify({ userId: locals.user.id }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                console.error('[PowerSync Token] Failed to fetch from VPS:', await res.text());
                return json({ error: 'Failed to fetch remote token' }, { status: 502 });
            }

            const { token } = await res.json();
            return json({ token });
        } catch (e) {
            console.error('[PowerSync Token] Fetch error (offline?):', e);
            return json({ error: 'Cannot reach VPS' }, { status: 503 });
        }
    }

    const token = await createPowerSyncToken(locals.user.id);
    return json({ token });
};
