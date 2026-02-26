import { db } from './db';
import { rolePermissions } from './db/schema';
import { eq } from 'drizzle-orm';

export async function getUserPermissions(role: string): Promise<string[]> {
	if (role === 'admin') {
		return ['dashboard', 'inventory', 'pos', 'orders', 'customers', 'cashbook', 'reports'];
	}
	try {
		const results = await db
			.select({ resource: rolePermissions.resource })
			.from(rolePermissions)
			.where(eq(rolePermissions.role, role));

		return results.map((r: { resource: string }) => r.resource);
	} catch {
		// Table may not exist yet — fall back to empty permissions
		return [];
	}
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
