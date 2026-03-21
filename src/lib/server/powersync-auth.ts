import { SignJWT, importJWK, exportJWK, generateKeyPair } from 'jose';
import { dev } from '$app/environment';
import env from '$lib/server/env';

// In production, you should set POWERSYNC_PRIVATE_KEY in your environment.
// For dev, we can generate one if missing.
let privateKey: any = null;
let publicKey: any = null;

async function getKeys() {
	if (privateKey && publicKey) return { privateKey, publicKey };

	if (env.POWERSYNC_PRIVATE_KEY) {
		// Load from env
		const jwk = JSON.parse(env.POWERSYNC_PRIVATE_KEY);
		privateKey = await importJWK(jwk, 'RS256');
		// We also need the public key for the JWKS endpoint
		const publicJwk = JSON.parse(env.POWERSYNC_PUBLIC_KEY || '{}');
		publicKey = await importJWK(publicJwk, 'RS256');
	} else if (dev || env.IS_ELECTRON) {
		// Generate for dev or electron
		console.warn('POWERSYNC_PRIVATE_KEY not set. Generating temporary key pair.');
		const keys = await generateKeyPair('RS256');
		privateKey = keys.privateKey;
		publicKey = keys.publicKey;
	} else {
		throw new Error('POWERSYNC_PRIVATE_KEY must be set in production');
	}

	return { privateKey, publicKey };
}

export async function fetchRemotePowerSyncToken(userId: string) {
	if (!env.POWERSYNC_API_URL) throw new Error('POWERSYNC_API_URL is not configured');
	if (!env.APP_SECRET_HEADER) throw new Error('APP_SECRET_HEADER is not configured');

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 5000);

	try {
		const res = await fetch(`${env.POWERSYNC_API_URL}/api/auth/remote-powersync-token`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-app-secret': env.APP_SECRET_HEADER
			},
			body: JSON.stringify({ userId }),
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		if (!res.ok) {
			throw new Error(`Failed to fetch remote token: ${await res.text()}`);
		}

		const { token } = await res.json();
		return token;
	} catch (e: any) {
		clearTimeout(timeoutId);
		// Log the underlying cause for network errors (DNS, TLS, connection refused, etc.)
		const cause = e.cause ? ` [cause: ${e.cause.message || e.cause}]` : '';
		throw new Error(`Remote PowerSync token fetch failed: ${e.message}${cause}`);
	}
}

export async function createPowerSyncToken(userId: string) {
	const { privateKey } = await getKeys();

	// PowerSync expected claims
	// sub: user ID
	// aud: powersync url (optional but recommended)
	return await new SignJWT({})
		.setProtectedHeader({
			alg: 'RS256',
			typ: 'JWT',
			kid: 'powersync-key-1'
		})
		.setSubject(userId)
		.setAudience(['powersync-dev', 'powersync'])
		.setIssuedAt()
		.setExpirationTime('24h')
		.sign(privateKey);
}

export async function getJWKS() {
	const { publicKey } = await getKeys();
	const jwk = await exportJWK(publicKey);
	return {
		keys: [
			{
				...jwk,
				kid: 'powersync-key-1',
				alg: 'RS256',
				use: 'sig'
			}
		]
	};
}
