import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { auditLogs } from '$lib/server/db/schema';
import { desc, sql } from 'drizzle-orm';
import { verifyAuditChain } from '$lib/server/audit';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		redirect(302, '/dashboard');
	}

	const pageParam = parseInt(url.searchParams.get('page') ?? '1');
	const perPage = 50;
	const currentPage = Math.max(1, pageParam);
	const offset = (currentPage - 1) * perPage;

	return {
		streamed: (async () => {
			if (!db)
				return {
					logs: [],
					pagination: { currentPage: 1, totalPages: 1, totalLogs: 0, perPage }
				};
			const [countResult, logs] = await Promise.all([
				db.select({ count: sql<number>`count(*)` }).from(auditLogs),
				db
					.select()
					.from(auditLogs)
					.orderBy(desc(auditLogs.createdAt))
					.limit(perPage)
					.offset(offset)
			]);

			const totalLogs = countResult[0]?.count ?? 0;
			return {
				logs,
				pagination: { currentPage, totalPages: Math.ceil(totalLogs / perPage), totalLogs, perPage }
			};
		})()
	};
};

export const actions: Actions = {
	verify: async ({ locals }) => {
		if (!locals.user || locals.user.role !== 'admin') {
			return { error: 'Unauthorized' };
		}
		const integrity = await verifyAuditChain();
		return { integrity };
	}
};
