import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
	// Only handle redirect in Capacitor SPA mode — web uses +page.server.ts
	if (import.meta.env.VITE_BUILD_TARGET !== 'capacitor') return;
	if (!browser) return;

	const raw = localStorage.getItem('cap_user');
	if (!raw) redirect(302, '/login');

	try {
		const user = JSON.parse(raw);
		if (user.role === 'sales') redirect(302, '/pos');
		redirect(302, '/dashboard');
	} catch {
		redirect(302, '/login');
	}
};
