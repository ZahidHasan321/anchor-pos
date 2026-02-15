import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	if (locals.user.role === 'sales') redirect(302, '/pos');
	redirect(302, '/dashboard');
};
