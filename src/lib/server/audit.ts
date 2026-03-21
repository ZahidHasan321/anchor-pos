import { createHash } from 'node:crypto';
import { db } from './db';
import { auditLogs } from './db/schema';
import { desc, lt, gt, sql } from 'drizzle-orm';
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

	// Use a transaction with advisory lock to prevent concurrent inserts
	// from reading the same previousHash and forking the chain
	await db.transaction(async (tx: any) => {
		// pg_advisory_xact_lock is released automatically when the transaction ends
		await tx.execute(sql`SELECT pg_advisory_xact_lock(42)`);

		const lastEntryRows = await tx
			.select({ hash: auditLogs.hash })
			.from(auditLogs)
			.orderBy(desc(auditLogs.createdAt))
			.limit(1);

		const previousHash = lastEntryRows[0]?.hash ?? GENESIS_HASH;
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

		await tx.insert(auditLogs).values({
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
	});
}

const VERIFY_BATCH_SIZE = 500;

export async function verifyAuditChain(): Promise<{
	valid: boolean;
	brokenAt?: number;
	total: number;
}> {
	if (!db) return { valid: true, total: 0 };

	const countResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(auditLogs);
	const total = countResult[0]?.count ?? 0;
	if (total === 0) return { valid: true, total: 0 };

	let lastHash = GENESIS_HASH;
	let offset = 0;

	while (offset < total) {
		const batch = await db
			.select()
			.from(auditLogs)
			.orderBy(auditLogs.createdAt)
			.limit(VERIFY_BATCH_SIZE)
			.offset(offset);

		if (batch.length === 0) break;

		for (let i = 0; i < batch.length; i++) {
			const entry = batch[i];
			const globalIdx = offset + i;

			if (entry.previousHash !== lastHash) {
				return { valid: false, brokenAt: globalIdx, total };
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
				return { valid: false, brokenAt: globalIdx, total };
			}

			lastHash = entry.hash;
		}

		offset += batch.length;
	}

	return { valid: true, total };
}

/**
 * Removes audit logs older than the specified number of days.
 */
export async function cleanupAuditLogs(daysToKeep = 365): Promise<number> {
	if (!db) return 0;

	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - daysToKeep);

	const result = await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff));
	return (result as any).count ?? 0;
}
