import { SignJWT, importJWK, exportJWK, generateKeyPair } from 'jose';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

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
    } else if (dev) {
        // Generate for dev
        console.warn('POWERSYNC_PRIVATE_KEY not set. Generating temporary key pair for development.');
        const keys = await generateKeyPair('RS256');
        privateKey = keys.privateKey;
        publicKey = keys.publicKey;
    } else {
        throw new Error('POWERSYNC_PRIVATE_KEY must be set in production');
    }

    return { privateKey, publicKey };
}

export async function createPowerSyncToken(userId: string) {
    const { privateKey } = await getKeys();
    
    // PowerSync expected claims
    // sub: user ID
    // aud: powersync url (optional but recommended)
    return await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setSubject(userId)
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
