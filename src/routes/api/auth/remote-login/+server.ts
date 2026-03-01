import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { users } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { SignJWT, importJWK } from 'jose';
import { verifyPassword } from '$lib/server/auth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  // Validate the app secret header so only your Electron app can call this
  const secret = request.headers.get('x-app-secret');
  const expectedSecret = process.env.APP_SECRET_HEADER || 'auto-pos-secret-handshake-2026';
  
  if (secret !== expectedSecret) {
    throw error(403, 'Forbidden');
  }

  const { username, password } = await request.json();

  if (!db) {
    throw error(503, 'Database unavailable');
  }

  const user = await db.select().from(users)
    .where(eq(users.username, username))
    .then((r: any[]) => r[0]);

  if (!user || !await verifyPassword(password, user.passwordHash)) {
    throw error(401, 'Invalid credentials');
  }

  if (!user.isActive) {
    throw error(403, 'Account disabled');
  }

  // Sign a JWT — Electron validates this locally without needing Postgres
  const privateKeyRaw = process.env.POWERSYNC_PRIVATE_KEY;
  if (!privateKeyRaw) {
    throw error(500, 'Server configuration error: Private key missing');
  }

  const privateKey = await importJWK(JSON.parse(privateKeyRaw), 'RS256');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const token = await new SignJWT({
    sub: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    email: user.email ?? '',
    phone: user.phone ?? '',
    image_url: user.imageUrl ?? '',
    is_active: user.isActive,
    theme: user.theme ?? 'system',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'powersync-key-1' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setAudience(['pos-electron'])
    .sign(privateKey);

  return json({ 
    token, 
    expiresAt: expiresAt.toISOString() 
  });
};
