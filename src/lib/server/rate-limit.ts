/**
 * Simple in-memory rate limiter for API endpoints.
 * Uses a sliding window approach per IP address.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries periodically
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of windows) {
		if (entry.resetAt <= now) {
			windows.delete(key);
		}
	}
}, 60_000);

export function rateLimit(
	key: string,
	{ maxRequests = 10, windowMs = 60_000 }: { maxRequests?: number; windowMs?: number } = {}
): { allowed: boolean; remaining: number; retryAfterMs: number } {
	const now = Date.now();
	const entry = windows.get(key);

	if (!entry || entry.resetAt <= now) {
		windows.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
	}

	entry.count++;
	if (entry.count > maxRequests) {
		return {
			allowed: false,
			remaining: 0,
			retryAfterMs: entry.resetAt - now
		};
	}

	return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
}

/**
 * Get a rate limit key from a request.
 * Uses X-Real-IP set by nginx (from $remote_addr, not client-spoofable),
 * falling back to the socket address.
 */
export function getClientIp(request: Request): string {
	// X-Real-IP is set by our nginx from $remote_addr — trustworthy
	// Do NOT trust X-Forwarded-For as it can be spoofed by the client
	return request.headers.get('x-real-ip') || 'unknown';
}
