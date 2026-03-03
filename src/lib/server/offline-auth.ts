/**
 * Offline Authentication for Electron
 *
 * After a successful VPS login, caches the user's password hash and profile
 * locally. When the VPS is unreachable, validates against cached credentials
 * and signs a local JWT using a locally-generated RSA key pair.
 */
import { SignJWT, importJWK, exportJWK, generateKeyPair, jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const IS_ELECTRON = process.env.BUILD_TARGET === 'electron';

function getUserDataPath(): string | null {
	return process.env.ELECTRON_USER_DATA || null;
}

function getCachePath(): string | null {
	const base = getUserDataPath();
	if (!base) return null;
	return path.join(base, 'offline-auth.json');
}

function getKeyPath(): string | null {
	const base = getUserDataPath();
	if (!base) return null;
	return path.join(base, 'offline-keys.json');
}

// --- Credential Cache ---

interface CachedUser {
	passwordHash: string; // scrypt hash of their password
	payload: {
		sub: string;
		username: string;
		role: string;
		name: string;
		email: string;
		phone: string;
		image_url: string;
		is_active: boolean;
		theme: string;
	};
	cachedAt: string;
}

interface CredentialCache {
	users: Record<string, CachedUser>; // keyed by username
}

function readCache(): CredentialCache {
	const cachePath = getCachePath();
	if (!cachePath) return { users: {} };
	try {
		if (fs.existsSync(cachePath)) {
			return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
		}
	} catch (e) {
		console.warn('[offline-auth] Failed to read cache:', e);
	}
	return { users: {} };
}

function writeCache(cache: CredentialCache) {
	const cachePath = getCachePath();
	if (!cachePath) return;
	try {
		fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
	} catch (e) {
		console.warn('[offline-auth] Failed to write cache:', e);
	}
}

/**
 * Hash a password for local cache comparison using SHA-256.
 * This is NOT the same as the server-side scrypt hash — it's just for
 * quick local verification of "did they type the same password as last time?"
 */
function hashForCache(password: string): string {
	return createHash('sha256').update(password).digest('hex');
}

/**
 * Cache user credentials after a successful VPS login.
 */
export function cacheCredentials(username: string, password: string, userPayload: CachedUser['payload']) {
	if (!IS_ELECTRON) return;
	const cache = readCache();
	cache.users[username] = {
		passwordHash: hashForCache(password),
		payload: userPayload,
		cachedAt: new Date().toISOString()
	};
	writeCache(cache);
	console.log('[offline-auth] Cached credentials for:', username);
}

/**
 * Validate credentials against cache. Returns the user payload if valid, null otherwise.
 */
function validateCachedCredentials(username: string, password: string): CachedUser['payload'] | null {
	const cache = readCache();
	const cached = cache.users[username];
	if (!cached) return null;
	if (cached.passwordHash !== hashForCache(password)) return null;
	if (!cached.payload.is_active) return null;
	return cached.payload;
}

// --- Local Key Pair ---

let _localPrivateKey: any = null;
let _localPublicKey: any = null;

async function getOrCreateLocalKeys() {
	if (_localPrivateKey && _localPublicKey) {
		return { privateKey: _localPrivateKey, publicKey: _localPublicKey };
	}

	const keyPath = getKeyPath();
	if (!keyPath) throw new Error('No userData path available');

	// Try to load existing keys
	try {
		if (fs.existsSync(keyPath)) {
			const stored = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
			_localPrivateKey = await importJWK(stored.privateKey, 'RS256');
			_localPublicKey = await importJWK(stored.publicKey, 'RS256');
			return { privateKey: _localPrivateKey, publicKey: _localPublicKey };
		}
	} catch (e) {
		console.warn('[offline-auth] Failed to load stored keys, generating new ones:', e);
	}

	// Generate new key pair
	const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
	const privateJwk = await exportJWK(privateKey);
	const publicJwk = await exportJWK(publicKey);

	// Save to disk
	try {
		fs.writeFileSync(keyPath, JSON.stringify({
			privateKey: privateJwk,
			publicKey: publicJwk,
			createdAt: new Date().toISOString()
		}, null, 2), 'utf8');
	} catch (e) {
		console.warn('[offline-auth] Failed to save keys:', e);
	}

	_localPrivateKey = privateKey;
	_localPublicKey = publicKey;
	return { privateKey, publicKey };
}

/**
 * Attempt offline login. Returns { token, expiresAt } or null if failed.
 */
export async function attemptOfflineLogin(username: string, password: string): Promise<{ token: string; expiresAt: Date } | null> {
	if (!IS_ELECTRON) return null;

	const userPayload = validateCachedCredentials(username, password);
	if (!userPayload) return null;

	try {
		const { privateKey } = await getOrCreateLocalKeys();
		const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

		const token = await new SignJWT({
			...userPayload,
			offline: true, // Mark as offline-issued
		})
			.setProtectedHeader({ alg: 'RS256', kid: 'offline-local-key' })
			.setIssuedAt()
			.setExpirationTime(expiresAt)
			.setAudience(['pos-electron'])
			.sign(privateKey);

		console.log('[offline-auth] Offline login successful for:', username);
		return { token, expiresAt };
	} catch (e) {
		console.error('[offline-auth] Failed to sign offline JWT:', e);
		return null;
	}
}

/**
 * Get the local public key for JWT verification in hooks.server.ts
 */
export async function getLocalPublicKey(): Promise<any> {
	if (!IS_ELECTRON) return null;
	const keyPath = getKeyPath();
	if (!keyPath || !fs.existsSync(keyPath)) return null;

	try {
		if (!_localPublicKey) {
			const stored = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
			_localPublicKey = await importJWK(stored.publicKey, 'RS256');
		}
		return _localPublicKey;
	} catch {
		return null;
	}
}
