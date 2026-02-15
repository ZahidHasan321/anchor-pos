import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getUserPermissions, getDefaultRedirect, pathToResource } from '$lib/server/permissions';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const permissions = getUserPermissions(locals.user.role);

	// Settings is always admin-only
	if (url.pathname.startsWith('/settings') && locals.user.role !== 'admin') {
		redirect(302, getDefaultRedirect(locals.user.role));
	}

	// Check resource-level permissions
	const matchedPath = Object.keys(pathToResource).find((p) => url.pathname.startsWith(p));
	if (matchedPath) {
		const resource = pathToResource[matchedPath];
		if (!permissions.includes(resource)) {
			redirect(302, getDefaultRedirect(locals.user.role));
		}
	}

	return { user: locals.user, permissions };
};
