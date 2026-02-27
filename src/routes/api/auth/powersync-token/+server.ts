import { json, error } from '@sveltejs/kit';
import { SignJWT, importJWK } from 'jose';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const privateKeyRaw = process.env.POWERSYNC_PRIVATE_KEY;
	if (!privateKeyRaw) throw error(500, 'Private key not configured');

	// Key is stored as JWK JSON string
	const jwkObject = JSON.parse(privateKeyRaw);
	const privateKey = await importJWK(jwkObject, 'RS256');

	const token = await new SignJWT({ sub: user.id })
		.setProtectedHeader({ alg: 'RS256', kid: 'powersync-key-1' })
		.setIssuedAt()
		.setExpirationTime('1h')
		.setAudience(['powersync-dev', 'powersync'])
		.sign(privateKey);

	return json({ token });
};
