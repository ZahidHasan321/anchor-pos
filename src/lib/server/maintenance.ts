import { db } from './db';
import { sessions, stockLogs, auditLogs } from './db/schema';
import { lt, sql, and, eq } from 'drizzle-orm';
import { cleanupAuditLogs } from './audit';

const ONE_HOUR = 60 * 60 * 1000;
let lastRun = 0;

/**
 * Lightweight periodic maintenance — safe to call on every request.
 * Actually runs at most once per hour (throttled).
 * All deletes are bounded with LIMIT to avoid long-running queries.
 */
export async function runMaintenance(opts?: { auditRetentionDays?: number }) {
	const now = Date.now();
	if (now - lastRun < ONE_HOUR) return;
	lastRun = now;

	if (!db) return;

	const auditRetentionDays = opts?.auditRetentionDays ?? 365;

	try {
		const results = await Promise.allSettled([
			purgeExpiredSessions(),
			purgeSaleStockLogs(90),
			cleanupAuditLogs(auditRetentionDays)
		]);

		for (const r of results) {
			if (r.status === 'rejected') {
				console.error('[Maintenance] Task failed:', r.reason);
			}
		}
	} catch (e) {
		console.error('[Maintenance] Unexpected error:', e);
	}
}

/**
 * Delete sessions that have expired.
 * These are only cleaned up when the user's cookie hits validateSessionToken(),
 * but abandoned sessions (user never returns) pile up forever.
 */
async function purgeExpiredSessions() {
	if (!db) return;
	const result = await db
		.delete(sessions)
		.where(lt(sessions.expiresAt, new Date()));
	const count = (result as any).count ?? 0;
	if (count > 0) console.log(`[Maintenance] Purged ${count} expired sessions`);
}

/**
 * Delete stock_logs with reason='sale' older than `daysToKeep`.
 *
 * Sale stock logs are redundant — the same data lives in order_items
 * (which links to the variant via variantId and records the quantity).
 * Non-sale logs (restock, return, damage) are kept indefinitely
 * because they're the only record of manual inventory changes.
 */
async function purgeSaleStockLogs(daysToKeep: number) {
	if (!db) return;
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - daysToKeep);

	const result = await db
		.delete(stockLogs)
		.where(and(eq(stockLogs.reason, 'sale'), lt(stockLogs.createdAt, cutoff)));
	const count = (result as any).count ?? 0;
	if (count > 0) console.log(`[Maintenance] Purged ${count} old sale stock logs`);
}
