import { json } from '@sveltejs/kit';
import { createPowerSyncToken } from '$lib/server/powersync-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = await createPowerSyncToken(locals.user.id);
    return json({ token });
};
