import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { db } from './db';
import { sessions, users } from './db/schema';
import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import argon2 from 'argon2';

export function generateSessionToken(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

export async function hashPassword(password: string): Promise<string> {
	return await argon2.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	if (hash.startsWith('$argon2')) {
		try {
			return await argon2.verify(hash, password);
		} catch {
			return false;
		}
	}
	// Fallback for legacy SHA-256 hashes
	const legacyHash = encodeHexLowerCase(sha256(new TextEncoder().encode(password)));
	return legacyHash === hash;
}

export function createSession(token: string, userId: string) {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
	const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

	db.insert(sessions)
		.values({
			id: sessionId,
			userId,
			expiresAt: expiresAt
		})
		.run();

	return { id: sessionId, userId, expiresAt };
}

export function validateSessionToken(token: string) {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

	const result = db
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
		.where(eq(sessions.id, sessionId))
		.get();

	if (!result) return { session: null, user: null };

	// Check if user is deactivated
	if (!result.isActive) {
		db.delete(sessions).where(eq(sessions.id, sessionId)).run();
		return { session: null, user: null };
	}

	const now = Date.now();
	if (result.expiresAt.getTime() <= now) {
		db.delete(sessions).where(eq(sessions.id, sessionId)).run();
		return { session: null, user: null };
	}

	// Extend session if within 15 days of expiry
	if (result.expiresAt.getTime() - now < 15 * 24 * 60 * 60 * 1000) {
		const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		db.update(sessions).set({ expiresAt: newExpiry }).where(eq(sessions.id, sessionId)).run();
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

export function invalidateSession(sessionId: string): void {
	db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: Date): void {
	event.cookies.set('session', token, {
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt,
		path: '/'
	});
}

export function deleteSessionTokenCookie(event: RequestEvent): void {
	event.cookies.set('session', '', {
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 0,
		path: '/'
	});
}
