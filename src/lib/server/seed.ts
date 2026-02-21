import { db } from './db';
import { users, rolePermissions } from './db/schema';
import { hashPassword } from './auth';
import { generateId } from '../utils';

export async function seedAdmin() {
	try {
		const existing = await db.select().from(users).limit(1);
		if (existing.length > 0) return; // Already seeded

		await db.insert(users).values({
			id: generateId(),
			username: 'admin',
			passwordHash: await hashPassword('admin123'),
			role: 'admin',
			name: 'Administrator',
			isActive: true,
			theme: 'system'
		});

		console.log('Admin user seeded: admin / admin123');
	} catch (e) {
		console.log('Skipping admin seed (table not ready or error)');
	}
}

export async function seedPermissions() {
	try {
		const existing = await db.select().from(rolePermissions).limit(1);
		if (existing.length > 0) return; // Already seeded

		const defaults: { role: string; resource: string }[] = [
			// Manager defaults
			{ role: 'manager', resource: 'inventory' },
			// Sales defaults
			{ role: 'sales', resource: 'pos' },
			{ role: 'sales', resource: 'orders' },
			{ role: 'sales', resource: 'customers' }
		];

		for (const row of defaults) {
			await db.insert(rolePermissions).values(row);
		}

		console.log('Default role permissions seeded');
	} catch {
		// Table may not exist yet — run db:push first
		console.log('Skipping permission seed (table not ready — run db:push)');
	}
}
