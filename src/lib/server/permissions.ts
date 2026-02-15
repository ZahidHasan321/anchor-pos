import { db } from './db';
import { rolePermissions } from './db/schema';
import { eq } from 'drizzle-orm';

export function getUserPermissions(role: string): string[] {
	if (role === 'admin') {
		return ['dashboard', 'inventory', 'pos', 'orders', 'customers', 'cashbook', 'reports'];
	}
	try {
		return db
			.select({ resource: rolePermissions.resource })
			.from(rolePermissions)
			.where(eq(rolePermissions.role, role))
			.all()
			.map((r) => r.resource);
	} catch {
		// Table may not exist yet — fall back to empty permissions
		return [];
	}
}

export function getDefaultRedirect(role: string): string {
	const permissions = getUserPermissions(role);
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

export function hasPermission(role: string, resource: string): boolean {
	if (role === 'admin') return true;
	return getUserPermissions(role).includes(resource);
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
