import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

// Offline-safe role permissions (mirrors server-side permissions.ts defaults)
const ROLE_PERMISSIONS: Record<string, string[]> = {
	admin: ['dashboard', 'inventory', 'pos', 'orders', 'customers', 'cashbook', 'reports', 'settings'],
	manager: ['dashboard', 'inventory', 'pos', 'orders', 'customers', 'cashbook', 'reports'],
	sales: ['pos', 'orders']
};

export const load: LayoutLoad = async () => {
	// Only runs in Capacitor SPA mode — web/Electron use +layout.server.ts instead.
	if (import.meta.env.VITE_BUILD_TARGET !== 'capacitor') return {};
	if (!browser) return {};

	const raw = localStorage.getItem('cap_user');
	if (!raw) redirect(302, '/login');

	let user: any;
	try {
		user = JSON.parse(raw);
	} catch {
		localStorage.removeItem('cap_user');
		redirect(302, '/login');
	}

	// Check session expiry
	if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
		localStorage.removeItem('cap_user');
		redirect(302, '/login');
	}

	const permissions = ROLE_PERMISSIONS[user.role] ?? ROLE_PERMISSIONS.sales;
	const sidebarCollapsed = localStorage.getItem('sidebar_collapsed') !== 'false';

	return { user, permissions, sidebarCollapsed };
};
