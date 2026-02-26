import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { rolePermissions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { logAuditEvent } from '$lib/server/audit';

const ALL_RESOURCES = [
	'dashboard',
	'inventory',
	'pos',
	'orders',
	'customers',
	'cashbook',
	'reports'
];
const CONFIGURABLE_ROLES = ['manager', 'sales'];

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		redirect(302, '/dashboard');
	}

	if (!db) return {
		permissionsByRole: {},
		allResources: ALL_RESOURCES,
		configurableRoles: CONFIGURABLE_ROLES
	};

	const allPerms = await db.select().from(rolePermissions);

	interface PermissionRow {
		role: string;
		resource: string;
	}

	const permissionsByRole: Record<string, string[]> = {};
	for (const role of CONFIGURABLE_ROLES) {
		permissionsByRole[role] = (allPerms as PermissionRow[])
			.filter((p) => p.role === role)
			.map((p) => p.resource);
	}

	return {
		permissionsByRole,
		allResources: ALL_RESOURCES,
		configurableRoles: CONFIGURABLE_ROLES
	};
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') {
			return fail(403, { error: 'Unauthorized' });
		}
		if (!db) return fail(503, { error: 'Database connection unavailable' });

		const data = await request.formData();
		const role = data.get('role') as string;

		if (!CONFIGURABLE_ROLES.includes(role)) {
			return fail(400, { error: 'Invalid role' });
		}

		const selectedResources = data.getAll('resources') as string[];
		const validResources = selectedResources.filter((r) => ALL_RESOURCES.includes(r));

		if (validResources.length === 0) {
			return fail(400, { error: 'At least one permission must be selected' });
		}

		try {
			await db.transaction(async (tx: any) => {
				// 1. Clear existing
				await tx.delete(rolePermissions).where(eq(rolePermissions.role, role));

				// 2. Bulk Insert (Industry Standard Performance)
				// Drizzle supports passing an array to .values() for bulk insert
				await tx.insert(rolePermissions).values(
					validResources.map((resource) => ({
						role,
						resource
					}))
				);
			});

			await logAuditEvent({
				userId: locals.user.id,
				userName: locals.user.name,
				action: 'UPDATE_PERMISSIONS',
				entity: 'role_permissions',
				entityId: role,
				details: `Updated permissions for ${role}: ${validResources.join(', ')}`
			});

			return { success: true, role };
		} catch (e) {
			console.error('Failed to update permissions:', e);
			return fail(500, { error: 'Database error' });
		}
	}
};
