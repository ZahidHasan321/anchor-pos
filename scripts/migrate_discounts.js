import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const sql = postgres(dbUrl);

console.log('Starting migration for variant discounts...');

async function migrate() {
	try {
		// 1. Add discount column to product_variants if it doesn't exist
		console.log('Adding discount column to product_variants...');
		try {
			await sql`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS discount DOUBLE PRECISION DEFAULT 0`;
			console.log('Processed discount column.');
		} catch (err) {
			console.error('Error adding column:', err);
		}

		// 2. Migrate data: Populate variant.discount from product.default_discount
		console.log('Migrating discount data...');
		const products = await sql`SELECT id, default_discount FROM products`;

		let updatedCount = 0;
		for (const product of products) {
			const discount = product.default_discount || 0;
			const result =
				await sql`UPDATE product_variants SET discount = ${discount} WHERE product_id = ${product.id}`;
			updatedCount += result.count;
		}

		console.log(`Updated discounts for ${updatedCount} variants.`);
		console.log('Migration complete.');
	} catch (error) {
		console.error('Migration failed:', error);
		process.exit(1);
	} finally {
		await sql.end();
	}
}

migrate();
