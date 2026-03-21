import { json } from '@sveltejs/kit';
import { createPublicKey } from 'crypto';
import env from '$lib/server/env';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const publicKeyRaw = env.POWERSYNC_PUBLIC_KEY;
	if (!publicKeyRaw) {
		return json({ error: 'Public key not configured' }, { status: 500 });
	}

	// Key is stored as JWK JSON string
	const jwk = JSON.parse(publicKeyRaw);

	return json({ keys: [jwk] });
};
