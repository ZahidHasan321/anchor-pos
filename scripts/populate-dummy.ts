import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/lib/server/db/schema';
import { randomUUID } from 'node:crypto';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const client = postgres(dbUrl);
const db = drizzle(client, { schema });

function generateId() {
	return randomUUID();
}

const CATEGORIES = ['T-Shirts', 'Jeans', 'Dresses', 'Shoes', 'Jackets'];
const COLORS = ['Red', 'Blue', 'Black', 'White', 'Navy'];
const SIZES = ['S', 'M', 'L', 'XL'];

async function populate() {
	console.log('Starting dummy data population...');

	// 1. Find the admin user to associate data
	const admin = await db.select().from(schema.users).limit(1);
	const adminId = admin[0]?.id || generateId();

	// 2. Add some customers
	console.log('Adding customers...');
	const customers = [
		{ name: 'John Doe', phone: '01711122233', email: 'john@example.com' },
		{ name: 'Jane Smith', phone: '01811122233', email: 'jane@example.com' },
		{ name: 'Bob Wilson', phone: '01911122233', email: 'bob@example.com' }
	];

	const customerIds: string[] = [];
	for (const c of customers) {
		const id = generateId();
		customerIds.push(id);
		await db.insert(schema.customers).values({
			id,
			...c
		}).onConflictDoNothing();
	}

	// 3. Add products and variants
	console.log('Adding products and variants...');
	const products = [
		{ name: 'Classic T-Shirt', category: 'T-Shirts', price: 500 },
		{ name: 'Slim Fit Jeans', category: 'Jeans', price: 1200 },
		{ name: 'Summer Dress', category: 'Dresses', price: 1500 },
		{ name: 'Leather Jacket', category: 'Jackets', price: 4500 },
		{ name: 'Running Shoes', category: 'Shoes', price: 2500 }
	];

	for (const p of products) {
		const productId = generateId();
		await db.insert(schema.products).values({
			id: productId,
			name: p.name,
			category: p.category,
			templatePrice: p.price,
			costPrice: p.price * 0.6
		});

		// Add 3 variants for each product
		for (let i = 0; i < 3; i++) {
			const variantId = generateId();
			const size = SIZES[i % SIZES.length];
			const color = COLORS[i % COLORS.length];
			await db.insert(schema.productVariants).values({
				id: variantId,
				productId,
				size,
				color,
				barcode: `BAR-${productId.slice(0,4)}-${i}`,
				stockQuantity: 50,
				price: p.price,
				costPrice: p.price * 0.6
			});

			// Initial stock log
			await db.insert(schema.stockLogs).values({
				id: generateId(),
				variantId,
				changeAmount: 50,
				reason: 'restock',
				userId: adminId
			});
		}
	}

	// 4. Add role permissions
	console.log('Adding role permissions...');
	const defaults: { role: string; resource: string }[] = [
		{ role: 'manager', resource: 'inventory' },
		{ role: 'sales', resource: 'pos' },
		{ role: 'sales', resource: 'orders' },
		{ role: 'sales', resource: 'customers' }
	];

	for (const row of defaults) {
		await db.insert(schema.rolePermissions).values(row).onConflictDoNothing();
	}

	console.log('Dummy data population finished successfully.');
	await client.end();
	process.exit(0);
}

populate().catch((err) => {
	console.error('Population failed:', err);
	process.exit(1);
});
