
import { db } from './db';
import { sessions, users } from './db/schema';
import { eq } from 'drizzle-orm';
import { dev } from '$app/environment';
import type { RequestEvent } from '@sveltejs/kit';
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export function generateSessionToken(): string {
	const bytes = randomBytes(20);
	return bytes.toString('base64url');
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString('hex');
	const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
	return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    // Handle Scrypt hashes (format: salt:hash)
    if (hash.includes(':')) {
        const [salt, key] = hash.split(':');
        if (!salt || !key) return false;
        
        try {
            const keyBuffer = Buffer.from(key, 'hex');
            const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
            return timingSafeEqual(keyBuffer, derivedKey);
        } catch {
            return false;
        }
    }

    // Legacy Argon2 check (Safe fallback: fail if library missing, since we removed it)
	if (hash.startsWith('$argon2')) {
        console.warn('Argon2 hash detected but library removed for portability. Please reset password.');
		return false;
	}

	// Fallback for legacy SHA-256 hashes (using node:crypto for robustness)
    const legacyHash = createHash('sha256').update(password).digest('hex');
	return legacyHash === hash;
}

export async function createSession(token: string, userId: string) {

	const sessionId = createHash('sha256').update(token).digest('hex');
	const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

	await db.insert(sessions).values({
		id: sessionId,
		userId,
		expiresAt: expiresAt
	});

	return { id: sessionId, userId, expiresAt };
}

export async function validateSessionToken(token: string) {
	const sessionId = createHash('sha256').update(token).digest('hex');

	const results = await db
		.select({
			sessionId: sessions.id,
			userId: sessions.userId,
			expiresAt: sessions.expiresAt,
			userName: users.name,
			userRole: users.role,
			username: users.username,
			isActive: users.isActive,
			theme: users.theme,
			email: users.email,
			phone: users.phone,
			imageUrl: users.imageUrl
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId));

	const result = results[0];
	if (!result) return { session: null, user: null };

	// Check if user is deactivated
	if (!result.isActive) {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
		return { session: null, user: null };
	}

	const now = Date.now();
	if (result.expiresAt.getTime() <= now) {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
		return { session: null, user: null };
	}

	// Extend session if within 15 days of expiry
	if (result.expiresAt.getTime() - now < 15 * 24 * 60 * 60 * 1000) {
		const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		await db.update(sessions).set({ expiresAt: newExpiry }).where(eq(sessions.id, sessionId));
	}

	return {
		session: { id: result.sessionId, userId: result.userId, expiresAt: result.expiresAt },
		user: {
			id: result.userId,
			name: result.userName,
			username: result.username,
			role: result.userRole as 'admin' | 'manager' | 'sales',
			theme: result.theme as 'light' | 'dark' | 'system',
			email: result.email,
			phone: result.phone,
			imageUrl: result.imageUrl
		}
	};
}

export async function invalidateSession(sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: Date): void {
	event.cookies.set('session', token, {
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		expires: expiresAt,
		path: '/'
	});
}

export function deleteSessionTokenCookie(event: RequestEvent): void {
	event.cookies.set('session', '', {
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: 0,
		path: '/'
	});
}
