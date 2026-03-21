import { json, error } from '@sveltejs/kit';
import { createPowerSyncToken } from '$lib/server/powersync-auth';
import { timingSafeEqual } from 'crypto';
import env from '$lib/server/env';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	// Validate the app secret header so only the Electron app can call this
	const secret = request.headers.get('x-app-secret');
	const expectedSecret = env.APP_SECRET_HEADER;

	if (
		!expectedSecret ||
		!secret ||
		secret.length !== expectedSecret.length ||
		!timingSafeEqual(Buffer.from(secret), Buffer.from(expectedSecret))
	) {
		throw error(403, 'Forbidden');
	}

	let userId: string;
	try {
		({ userId } = await request.json());
	} catch {
		throw error(400, 'Invalid request body');
	}

	if (!userId) {
		throw error(400, 'User ID is required');
	}

	try {
		const token = await createPowerSyncToken(userId);
		return json({ token });
	} catch {
		throw error(500, 'Failed to create token');
	}
};
