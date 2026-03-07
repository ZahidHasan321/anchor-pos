import { createHash } from 'node:crypto';
import { db } from './db';
import { auditLogs } from './db/schema';
import { desc, lt } from 'drizzle-orm';
import { generateId } from '$lib/utils';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function computeHash(data: {
	userId: string | null;
	userName: string;
	action: string;
	entity: string;
	entityId: string | null;
	details: string | null;
	previousHash: string;
	createdAt: number;
}): string {
	const payload = [
		data.userId ?? '',
		data.userName,
		data.action,
		data.entity,
		data.entityId ?? '',
		data.details ?? '',
		data.previousHash,
		String(data.createdAt)
	].join('|');
	return createHash('sha256').update(payload).digest('hex');
}

export async function logAuditEvent(params: {
	userId: string | null;
	userName: string;
	action: string;
	entity: string;
	entityId?: string | null;
	details?: string | null;
}): Promise<void> {
	if (!db) return;
	const lastEntryRows = await db
		.select({ hash: auditLogs.hash })
		.from(auditLogs)
		.orderBy(desc(auditLogs.createdAt))
		.limit(1);

	const lastEntry = lastEntryRows[0];
	const previousHash = lastEntry?.hash ?? GENESIS_HASH;
	const now = Date.now();

	const hash = computeHash({
		userId: params.userId,
		userName: params.userName,
		action: params.action,
		entity: params.entity,
		entityId: params.entityId ?? null,
		details: params.details ?? null,
		previousHash,
		createdAt: now
	});

	await db.insert(auditLogs).values({
		id: generateId(),
		userId: params.userId,
		userName: params.userName,
		action: params.action,
		entity: params.entity,
		entityId: params.entityId ?? null,
		details: params.details ?? null,
		previousHash,
		hash,
		createdAt: new Date(now)
	});
}

export async function verifyAuditChain(): Promise<{
	valid: boolean;
	brokenAt?: number;
	total: number;
}> {
	if (!db) return { valid: true, total: 0 };
	const allLogs = await db.select().from(auditLogs).orderBy(auditLogs.createdAt);
	if (allLogs.length === 0) return { valid: true, total: 0 };

	for (let i = 0; i < allLogs.length; i++) {
		const entry = allLogs[i];
		const expectedPrevHash = i === 0 ? GENESIS_HASH : allLogs[i - 1].hash;

		if (entry.previousHash !== expectedPrevHash) {
			return { valid: false, brokenAt: i, total: allLogs.length };
		}

		const expectedHash = computeHash({
			userId: entry.userId,
			userName: entry.userName,
			action: entry.action,
			entity: entry.entity,
			entityId: entry.entityId,
			details: entry.details,
			previousHash: entry.previousHash,
			createdAt:
				entry.createdAt instanceof Date ? entry.createdAt.getTime() : (entry.createdAt as number)
		});

		if (entry.hash !== expectedHash) {
			return { valid: false, brokenAt: i, total: allLogs.length };
		}
	}

	return { valid: true, total: allLogs.length };
}

/**
 * Removes audit logs older than the specified number of days.
 * Industry standards typically suggest:
 * - 90 days for basic security
 * - 1-2 years for business operations
 * - 5-7 years for strict financial compliance
 */
export async function cleanupAuditLogs(daysToKeep = 365): Promise<number> {
	if (!db) return 0;
	
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - daysToKeep);

	const result = await db.delete(auditLogs)
		.where(lt(auditLogs.createdAt, cutoff));
	
	// Note: result.rowCount depends on the driver, but for postgres.js it's often available
	return (result as any).count ?? 0;
}
