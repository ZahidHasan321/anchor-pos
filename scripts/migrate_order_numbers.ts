import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const sql = postgres(dbUrl);

async function migrate() {
	try {
		console.log('Adding order_number column to orders table...');
		await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "order_number" INTEGER NOT NULL DEFAULT 0`;
		console.log('Column added successfully.');

		console.log('Populating sequential order numbers...');
		const orders = await sql`SELECT id FROM "orders" ORDER BY created_at ASC`;

		let currentNumber = 1001;

		await sql.begin(async (tx) => {
			for (const order of orders) {
				await tx`UPDATE "orders" SET order_number = ${currentNumber++} WHERE id = ${order.id}`;
			}
		});

		console.log(`Updated ${orders.length} orders starting from 1001.`);

		console.log('Adding unique index...');
		try {
			await sql`CREATE UNIQUE INDEX IF NOT EXISTS "orders_order_number_unique" ON "orders" ("order_number")`;
			console.log('Unique index created.');
		} catch (e) {
			console.log('Index might already exist or could not be created:', e.message);
		}
	} catch (e) {
		console.error('Operation failed:', e.message);
	} finally {
		await sql.end();
	}
}

migrate();
