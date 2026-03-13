import { db } from './db';
import { rolePermissions } from './db/schema';
import { eq } from 'drizzle-orm';

// Default permissions per role when DB is unavailable (Electron offline mode)
const OFFLINE_ROLE_PERMISSIONS: Record<string, string[]> = {
	admin: ['dashboard', 'inventory', 'pos', 'orders', 'customers', 'cashbook', 'reports'],
	manager: ['dashboard', 'inventory', 'pos', 'orders', 'customers', 'cashbook', 'reports'],
	sales: ['pos', 'orders']
};

export async function getUserPermissions(role: string): Promise<string[]> {
	if (role === 'admin') {
		return OFFLINE_ROLE_PERMISSIONS.admin;
	}

	if (db) {
		try {
			const results = await db
				.select({ resource: rolePermissions.resource })
				.from(rolePermissions)
				.where(eq(rolePermissions.role, role));

			if (results.length > 0) {
				return results.map((r: { resource: string }) => r.resource);
			}
			// DB returned empty (e.g. table cleared) — fall through to defaults
		} catch {
			// DB query failed — fall through to offline defaults
		}
	}

	// Electron offline or DB failure: use role-based defaults (not full admin)
	return OFFLINE_ROLE_PERMISSIONS[role] || [];
}

export async function getDefaultRedirect(role: string): Promise<string> {
	const permissions = await getUserPermissions(role);
	const routeMap: Record<string, string> = {
		dashboard: '/dashboard',
		inventory: '/inventory',
		pos: '/pos',
		orders: '/orders',
		customers: '/customers',
		cashbook: '/cashbook',
		reports: '/reports'
	};
	for (const preferred of ['dashboard', 'pos', 'inventory']) {
		if (permissions.includes(preferred)) return routeMap[preferred];
	}
	return routeMap[permissions[0]] ?? '/pos';
}

export async function hasPermission(role: string, resource: string): Promise<boolean> {
	if (role === 'admin') return true;
	const permissions = await getUserPermissions(role);
	return permissions.includes(resource);
}

export const pathToResource: Record<string, string> = {
	'/dashboard': 'dashboard',
	'/inventory': 'inventory',
	'/pos': 'pos',
	'/orders': 'orders',
	'/customers': 'customers',
	'/cashbook': 'cashbook',
	'/reports': 'reports'
};
