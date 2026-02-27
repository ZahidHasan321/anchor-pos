import { json } from '@sveltejs/kit';
import { createPublicKey } from 'crypto';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
  const publicKeyPem = process.env.POWERSYNC_PUBLIC_KEY;
  if (!publicKeyPem) {
    return json({ error: 'Public key not configured' }, { status: 500 });
  }

  const key = createPublicKey(publicKeyPem.replace(/\\n/g, '\n'));
  const jwk = key.export({ format: 'jwk' }) as Record<string, string>;

  return json({
    keys: [{ ...jwk, use: 'sig', alg: 'RS256', kid: 'powersync-key-1' }],
  });
};
