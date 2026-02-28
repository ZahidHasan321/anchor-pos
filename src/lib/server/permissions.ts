import { db } from './db';
import { rolePermissions } from './db/schema';
import { eq } from 'drizzle-orm';

export async function getUserPermissions(role: string): Promise<string[]> {
	if (role === 'admin') {
		return ['dashboard', 'inventory', 'pos', 'orders', 'customers', 'cashbook', 'reports'];
	}
	
	const isElectron = process.env.BUILD_TARGET === 'electron';

	if (db) {
		try {
			const results = await db
				.select({ resource: rolePermissions.resource })
				.from(rolePermissions)
				.where(eq(rolePermissions.role, role));

			return results.map((r: { resource: string }) => r.resource);
		} catch {
			return [];
		}
	} else if (isElectron) {
		try {
			const { getPowerSyncDb } = await import('$lib/powersync/db');
			const psDb = getPowerSyncDb();
			const results = await psDb.getAll('SELECT resource FROM role_permissions WHERE role = ?', [role]);
			return results.map((r: any) => r.resource);
		} catch (e) {
			console.warn('[permissions] Failed to fetch from PowerSync:', e);
			return [];
		}
	}
	
	return [];
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
