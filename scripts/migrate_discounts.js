import Database from 'better-sqlite3';

const db = new Database('local.db');

console.log('Starting migration for variant discounts...');

try {
	// 1. Add discount column to product_variant if it doesn't exist
	console.log('Adding discount column to product_variant...');
	try {
		db.prepare('ALTER TABLE product_variant ADD COLUMN discount REAL DEFAULT 0').run();
		console.log('Added discount column.');
	} catch (err) {
		if (err.message.includes('duplicate column name')) {
			console.log('Discount column already exists.');
		} else {
			throw err;
		}
	}

	// 2. Migrate data: Populate variant.discount from product.default_discount
	console.log('Migrating discount data...');
	const products = db.prepare('SELECT id, default_discount FROM product').all();

	const updateStmt = db.prepare('UPDATE product_variant SET discount = ? WHERE product_id = ?');

	db.transaction(() => {
		let updatedCount = 0;
		for (const product of products) {
			const discount = product.default_discount || 0;
			const result = updateStmt.run(discount, product.id);
			updatedCount += result.changes;
		}
		console.log(`Updated discounts for ${updatedCount} variants.`);
	})();

	console.log('Migration complete.');
} catch (error) {
	console.error('Migration failed:', error);
	process.exit(1);
} finally {
	db.close();
}
