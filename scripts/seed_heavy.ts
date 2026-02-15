import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/lib/server/db/schema';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

const dbPath = process.env.DATABASE_URL || 'local.db';
const client = new Database(dbPath);
const db = drizzle(client, { schema });

function generateId() {
	return randomUUID();
}

async function hashPassword(password: string): Promise<string> {
	return await argon2.hash(password);
}

const CATEGORIES = ['T-Shirts', 'Jeans', 'Dresses', 'Shoes', 'Accessories', 'Suits', 'Jackets'];
const COLORS = ['Red', 'Blue', 'Black', 'White', 'Green', 'Yellow', 'Grey', 'Navy'];
const SIZES = ['S', 'M', 'L', 'XL', 'XXL', '38', '40', '42', '44'];

const FIRST_NAMES = [
	'John',
	'Jane',
	'Michael',
	'Emily',
	'Chris',
	'Sarah',
	'David',
	'Anna',
	'Robert',
	'Linda',
	'William',
	'Elizabeth',
	'James',
	'Barbara',
	'Richard',
	'Susan',
	'Joseph',
	'Jessica',
	'Thomas',
	'Sarah'
];
const LAST_NAMES = [
	'Smith',
	'Johnson',
	'Williams',
	'Brown',
	'Jones',
	'Garcia',
	'Miller',
	'Davis',
	'Rodriguez',
	'Martinez',
	'Hernandez',
	'Lopez',
	'Gonzalez',
	'Wilson',
	'Anderson',
	'Thomas',
	'Taylor',
	'Moore',
	'Jackson',
	'Martin'
];

function getRandomItem<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomPrice(min: number, max: number): number {
	return Math.round((Math.random() * (max - min) + min) / 10) * 10;
}

async function seed() {
	console.log('Starting heavy seed...');

	// 1. Seed Users (7 users: 1 admin, 2 managers, 4 sales)
	console.log('Seeding users...');
	const userRoles = ['admin', 'manager', 'manager', 'sales', 'sales', 'sales', 'sales'];
	const userIds: string[] = [];

	for (let i = 0; i < userRoles.length; i++) {
		const role = userRoles[i];
		const username = i === 0 ? 'admin' : `${role}${i}`;
		// Use a raw query for simplicity to check existence since drizzle-orm with better-sqlite3 get() might behave differently in script context
		const existing = client.prepare('SELECT id FROM user WHERE username = ?').get(username) as
			| { id: string }
			| undefined;

		let userId;
		if (existing) {
			userId = existing.id;
			console.log(`User ${username} already exists.`);
		} else {
			userId = generateId();
			db.insert(schema.users)
				.values({
					id: userId,
					username: username,
					passwordHash: await hashPassword(i === 0 ? 'admin123' : 'password123'),
					role: role as any,
					name: `${role.charAt(0).toUpperCase() + role.slice(1)} User ${i}`,
					isActive: true
				})
				.run();
			console.log(`Seeded user: ${username} / ${i === 0 ? 'admin123' : 'password123'}`);
		}
		userIds.push(userId);
	}
	const adminId = userIds[0];

	// 2. Seed Customers (100)
	console.log('Seeding customers...');
	const customerIds: string[] = [];
	for (let i = 0; i < 100; i++) {
		const id = generateId();
		customerIds.push(id);
		db.insert(schema.customers)
			.values({
				id,
				name: `${getRandomItem(FIRST_NAMES)} ${getRandomItem(LAST_NAMES)}`,
				phone: `01${getRandomInt(100000000, 999999999)}`,
				email: `customer${i}@example.com`,
				notes: i % 5 === 0 ? 'Regular customer' : null
			})
			.run();
	}

	// 3. Seed Products and Variants (200 products)
	console.log('Seeding products and variants...');
	const variantIds: {
		id: string;
		productId: string;
		price: number;
		productName: string;
		variantLabel: string;
	}[] = [];
	for (let i = 0; i < 200; i++) {
		const productId = generateId();
		const category = getRandomItem(CATEGORIES);
		const productName = `${category} ${getRandomInt(100, 999)}`;
		const basePrice = getRandomPrice(500, 5000);

		db.insert(schema.products)
			.values({
				id: productId,
				name: productName,
				category,
				templatePrice: basePrice,
				description: `Quality ${productName} in various sizes.`
			})
			.run();

		// 3-6 variants per product
		const numVariants = getRandomInt(3, 6);
		for (let j = 0; j < numVariants; j++) {
			const variantId = generateId();
			const size = getRandomItem(SIZES);
			const color = getRandomItem(COLORS);
			const price = basePrice + getRandomInt(-200, 500);
			const stock = getRandomInt(10, 100);

			db.insert(schema.productVariants)
				.values({
					id: variantId,
					productId,
					size,
					color,
					barcode: `BARCODE-${productId.slice(0, 4)}-${variantId.slice(0, 4)}`,
					stockQuantity: stock,
					price: price
				})
				.run();

			variantIds.push({
				id: variantId,
				productId,
				price,
				productName,
				variantLabel: `${size} / ${color}`
			});

			// Initial stock log
			db.insert(schema.stockLogs)
				.values({
					id: generateId(),
					variantId,
					changeAmount: stock,
					reason: 'restock',
					userId: adminId,
					createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) // 6 months ago
				})
				.run();
		}
	}

	// 4. Seed Orders (2000)
	console.log('Seeding orders (this may take a while)...');
	const now = Date.now();
	const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;

	for (let i = 0; i < 2000; i++) {
		const orderId = generateId();
		const customerId = getRandomItem(customerIds);
		const createdAt = new Date(sixMonthsAgo + Math.random() * (now - sixMonthsAgo));
		const userId = getRandomItem(userIds); // Distributed among all users

		// 1-4 items per order
		const numItems = getRandomInt(1, 4);
		let totalAmount = 0;
		const itemsToInsert = [];

		for (let j = 0; j < numItems; j++) {
			const variant = getRandomItem(variantIds);
			const quantity = getRandomInt(1, 2);
			const priceAtSale = variant.price;
			totalAmount += priceAtSale * quantity;

			itemsToInsert.push({
				id: generateId(),
				orderId,
				variantId: variant.id,
				quantity,
				priceAtSale,
				productName: variant.productName,
				variantLabel: variant.variantLabel
			});

			// Update stock and log
			client
				.prepare('UPDATE product_variant SET stock_quantity = stock_quantity - ? WHERE id = ?')
				.run(quantity, variant.id);

			db.insert(schema.stockLogs)
				.values({
					id: generateId(),
					variantId: variant.id,
					changeAmount: -quantity,
					reason: 'sale',
					userId: userId,
					createdAt
				})
				.run();
		}

		db.insert(schema.orders)
			.values({
				id: orderId,
				customerId,
				userId: userId,
				totalAmount,
				status: 'completed',
				paymentMethod: getRandomItem(['cash', 'card'] as const),
				createdAt
			})
			.run();

		for (const item of itemsToInsert) {
			db.insert(schema.orderItems).values(item).run();
		}

		// Cashbook entry for sale
		db.insert(schema.cashbook)
			.values({
				id: generateId(),
				amount: totalAmount,
				type: 'in',
				description: `Sale - Order ${orderId.slice(0, 8)}`,
				userId: userId,
				createdAt
			})
			.run();

		if (i % 200 === 0) console.log(`Seeded ${i} orders...`);
	}

	// 5. Seed some expenses
	console.log('Seeding expenses...');
	const months = 6;
	for (let m = 0; m < months; m++) {
		const date = new Date(sixMonthsAgo + m * 30 * 24 * 60 * 60 * 1000);

		// Rent
		db.insert(schema.cashbook)
			.values({
				id: generateId(),
				amount: 50000,
				type: 'out',
				description: 'Monthly Rent',
				userId: adminId,
				createdAt: date
			})
			.run();

		// Electricity
		db.insert(schema.cashbook)
			.values({
				id: generateId(),
				amount: getRandomInt(2000, 5000),
				type: 'out',
				description: 'Electricity Bill',
				userId: adminId,
				createdAt: date
			})
			.run();

		// Salaries
		db.insert(schema.cashbook)
			.values({
				id: generateId(),
				amount: 100000,
				type: 'out',
				description: 'Staff Salaries',
				userId: adminId,
				createdAt: date
			})
			.run();
	}

	console.log('Heavy seed completed successfully!');
	client.close();
}

seed().catch((err) => {
	console.error('Seed failed:', err);
	process.exit(1);
});
