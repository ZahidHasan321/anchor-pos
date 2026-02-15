import { db } from './db';
import { users, rolePermissions } from './db/schema';
import { hashPassword } from './auth';
import { generateId } from '../utils';

export function seedAdmin() {
	const existing = db.select().from(users).get();
	if (existing) return; // Already seeded

	db.insert(users)
		.values({
			id: generateId(),
			username: 'admin',
			passwordHash: hashPassword('admin123'),
			role: 'admin',
			name: 'Administrator',
			isActive: true,
			theme: 'system'
		})
		.run();

	console.log('Admin user seeded: admin / admin123');
}

export function seedPermissions() {
	try {
		const existing = db.select().from(rolePermissions).get();
		if (existing) return; // Already seeded

		const defaults: { role: string; resource: string }[] = [
			// Manager defaults
			{ role: 'manager', resource: 'inventory' },
			// Sales defaults
			{ role: 'sales', resource: 'pos' },
			{ role: 'sales', resource: 'orders' },
			{ role: 'sales', resource: 'customers' }
		];

		for (const row of defaults) {
			db.insert(rolePermissions).values(row).run();
		}

		console.log('Default role permissions seeded');
	} catch {
		// Table may not exist yet — run db:push first
		console.log('Skipping permission seed (table not ready — run db:push)');
	}
}
