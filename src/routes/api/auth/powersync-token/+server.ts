import { json, error } from '@sveltejs/kit';
import { SignJWT, importPKCS8 } from 'jose';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const privateKeyPem = process.env.POWERSYNC_PRIVATE_KEY;
	if (!privateKeyPem) throw error(500, 'Private key not configured');

	const privateKey = await importPKCS8(privateKeyPem.replace(/\\n/g, '\n'), 'RS256');

	const token = await new SignJWT({ sub: user.id })
		.setProtectedHeader({ alg: 'RS256', kid: 'powersync-key-1' })
		.setIssuedAt()
		.setExpirationTime('1h')
		.setAudience(['powersync-dev', 'powersync'])
		.sign(privateKey);

	return json({ token });
};
