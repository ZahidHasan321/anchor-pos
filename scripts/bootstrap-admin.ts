import { db } from '../src/lib/server/db';
import { users } from '../src/lib/server/db/schema';
import { hashPassword } from '../src/lib/server/auth';
import { generateId } from '../src/lib/utils';
import { eq } from 'drizzle-orm';

async function bootstrap() {
	const username = process.env.ADMIN_USERNAME || 'admin';
	const password = process.env.ADMIN_PASSWORD;

	if (!password) {
		console.error('Error: ADMIN_PASSWORD environment variable is required');
		process.exit(1);
	}

	console.log(`Checking for existing user: ${username}...`);
	
	const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
	
	if (existing.length > 0) {
		console.log('User already exists. Updating password...');
		const newHash = await hashPassword(password);
		await db.update(users).set({ passwordHash: newHash }).where(eq(users.username, username));
		console.log('Admin password updated successfully.');
	} else {
		console.log('Creating new admin user...');
		const id = generateId();
		const passwordHash = await hashPassword(password);
		
		await db.insert(users).values({
			id,
			username,
			passwordHash,
			role: 'admin',
			name: 'System Admin',
			isActive: true
		});
		console.log(`Admin user created successfully! ID: ${id}`);
	}
	
	process.exit(0);
}

bootstrap().catch((err) => {
	console.error('Bootstrap failed:', err);
	process.exit(1);
});
