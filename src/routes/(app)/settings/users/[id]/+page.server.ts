import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { logAuditEvent } from '$lib/server/audit';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateId } from '$lib/utils';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin') {
		redirect(302, '/dashboard');
	}

	const userRows = await db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
			role: users.role,
			isActive: users.isActive,
			phone: users.phone,
			email: users.email,
			imageUrl: users.imageUrl
		})
		.from(users)
		.where(eq(users.id, params.id))
		.limit(1);

	const user = userRows[0];

	if (!user) {
		redirect(302, '/settings/users');
	}

	return { user };
};

export const actions: Actions = {
	update: async ({ params, request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403);

		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const username = (data.get('username') as string)?.trim();
		const email = (data.get('email') as string)?.trim() || null;
		const phone = (data.get('phone') as string)?.trim() || null;
		const imageFile = data.get('image') as File;
		const role = data.get('role') as 'admin' | 'manager' | 'sales';

		if (!name || !username || !role) {
			return fail(400, { message: 'Required fields are missing' });
		}

		let imageUrl = undefined;
		if (imageFile && imageFile.size > 0) {
			if (imageFile.size > 2 * 1024 * 1024) {
				return fail(400, { message: 'Image size exceeds 2MB limit' });
			}
			const ext = imageFile.name.split('.').pop();
			const fileName = `${generateId()}.${ext}`;
			const filePath = join(process.cwd(), 'static', 'uploads', fileName);
			const buffer = Buffer.from(await imageFile.arrayBuffer());
			writeFileSync(filePath, buffer);
			imageUrl = `/uploads/${fileName}`;
		}

		// Check if username is taken by another user
		const existingRows = await db
			.select()
			.from(users)
			.where(and(eq(users.username, username), ne(users.id, params.id)))
			.limit(1);

		if (existingRows.length > 0) {
			return fail(400, { message: 'Username already taken' });
		}

		await db
			.update(users)
			.set({
				name,
				username,
				email,
				phone,
				...(imageUrl ? { imageUrl } : {}),
				role
			})
			.where(eq(users.id, params.id));

		await logAuditEvent({
			userId: locals.user!.id,
			userName: locals.user!.name,
			action: 'UPDATE_USER',
			entity: 'users',
			entityId: params.id,
			details: `Updated profile for user: ${username}`
		});

		return { success: true, message: 'User updated successfully' };
	}
};
