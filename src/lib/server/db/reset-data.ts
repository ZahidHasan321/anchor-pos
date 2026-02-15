/**
 * Development data reset script.
 * Deletes all transactional data while keeping reference data
 * (users, sessions, products, product_variants, customers, store_settings).
 *
 * Usage: npm run db:reset-data
 */

import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_URL;
if (!dbPath) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const client = new Database(dbPath);

const tables = ['order_item', 'stock_log', 'cashbook', 'audit_log', '"order"'];

client.exec('PRAGMA foreign_keys = OFF;');

for (const table of tables) {
	const result = client.prepare(`DELETE FROM ${table}`).run();
	console.log(`Deleted ${result.changes} rows from ${table}`);
}

client.exec('PRAGMA foreign_keys = ON;');

console.log('\nData reset complete. Reference data preserved.');
client.close();
