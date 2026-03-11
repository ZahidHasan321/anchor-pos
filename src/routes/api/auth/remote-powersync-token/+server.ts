import { json, error } from '@sveltejs/kit';
import { createPowerSyncToken } from '$lib/server/powersync-auth';
import env from '$lib/server/env';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    // Validate the app secret header so only the Electron app can call this
    const secret = request.headers.get('x-app-secret');
    const expectedSecret = env.APP_SECRET_HEADER;

    if (!expectedSecret || secret !== expectedSecret) {
        throw error(403, 'Forbidden');
    }

    const { userId } = await request.json();

    if (!userId) {
        throw error(400, 'User ID is required');
    }

    try {
        const token = await createPowerSyncToken(userId);
        return json({ token });
    } catch (e: any) {
        throw error(500, e.message);
    }
};
