import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { auditLogs } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';
import { verifyAuditChain } from '$lib/server/audit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		redirect(302, '/dashboard');
	}

	const logs = db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200).all();

	const integrity = verifyAuditChain();

	return {
		logs,
		integrity
	};
};
