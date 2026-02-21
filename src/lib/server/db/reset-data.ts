/**
 * Development data reset script.
 * Deletes all transactional data while keeping reference data
 * (users, sessions, products, product_variants, customers, store_settings).
 *
 * Usage: npm run db:reset-data
 */

import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const sql = postgres(dbUrl);

const tables = ['order_item', 'stock_log', 'cashbook', 'audit_log', 'order'];

async function reset() {
	try {
		for (const table of tables) {
			const result = await sql.unsafe(`DELETE FROM "${table}"`);
			console.log(`Deleted rows from ${table}`);
		}
		console.log('\nData reset complete. Reference data preserved.');
	} catch (error) {
		console.error('Error resetting data:', error);
	} finally {
		await sql.end();
	}
}

reset();
