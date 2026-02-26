import { json } from '@sveltejs/kit';
import { getJWKS } from '$lib/server/powersync-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    const jwks = await getJWKS();
    return json(jwks);
};
