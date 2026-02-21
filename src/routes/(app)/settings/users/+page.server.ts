import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '$lib/server/auth';
import { generateId } from '$lib/utils';
import { logAuditEvent } from '$lib/server/audit';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'admin') {
		redirect(302, '/dashboard');
	}

	const allUsers = await db
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
		.from(users);

	return { users: allUsers };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403);

		const data = await request.formData();
		const username = (data.get('username') as string)?.trim();
		const name = (data.get('name') as string)?.trim();
		const password = data.get('password') as string;
		const role = data.get('role') as 'admin' | 'manager' | 'sales';
		const phone = (data.get('phone') as string)?.trim() || null;
		const email = (data.get('email') as string)?.trim() || null;
		const imageFile = data.get('image') as File;

		let imageUrl = null;
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

		if (!username || !name || !password || !role) {
			return fail(400, { message: 'Required fields are missing' });
		}

		// Check if username exists
		const existingRows = await db.select().from(users).where(eq(users.username, username)).limit(1);
		if (existingRows.length > 0) {
			return fail(400, { message: 'Username already taken' });
		}

		const userId = generateId();
		await db.insert(users).values({
			id: userId,
			username,
			name,
			passwordHash: await hashPassword(password),
			role,
			phone,
			email,
			imageUrl,
			isActive: true
		});

		await logAuditEvent({
			userId: locals.user!.id,
			userName: locals.user!.name,
			action: 'CREATE_USER',
			entity: 'users',
			entityId: userId,
			details: `Created user: ${username} (${role})`
		});

		return { success: true, message: 'User created successfully' };
	},

	toggleActive: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403);

		const data = await request.formData();
		const id = data.get('id') as string;
		const isActive = data.get('isActive') === 'true';
		const newStatus = !isActive;

		await db.update(users).set({ isActive: newStatus }).where(eq(users.id, id));

		await logAuditEvent({
			userId: locals.user!.id,
			userName: locals.user!.name,
			action: newStatus ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
			entity: 'users',
			entityId: id,
			details: `${newStatus ? 'Activated' : 'Deactivated'} user ID: ${id}`
		});

		return { success: true };
	},

	resetPassword: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403);

		const data = await request.formData();
		const id = data.get('id') as string;
		const password = data.get('password') as string;

		if (!password) return fail(400, { message: 'Password is required' });

		await db
			.update(users)
			.set({ passwordHash: await hashPassword(password) })
			.where(eq(users.id, id));

		await logAuditEvent({
			userId: locals.user!.id,
			userName: locals.user!.name,
			action: 'RESET_PASSWORD',
			entity: 'users',
			entityId: id,
			details: `Reset password for user ID: ${id}`
		});

		return { success: true, message: 'Password reset successfully' };
	}
};
