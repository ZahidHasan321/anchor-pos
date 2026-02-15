import Database from 'better-sqlite3';

const dbUrl = 'local.db';
console.log(`Connecting to ${dbUrl}...`);
const db = new Database(dbUrl);

try {
    console.log('Adding order_number column to order table...');
    db.prepare('ALTER TABLE `order` ADD COLUMN `order_number` INTEGER NOT NULL DEFAULT 0').run();
    console.log('Column added successfully.');

    console.log('Populating sequential order numbers...');
    const orders = db.prepare('SELECT id FROM `order` ORDER BY created_at ASC').all();
    
    const update = db.prepare('UPDATE `order` SET order_number = ? WHERE id = ?');
    
    let currentNumber = 1001;
    const transaction = db.transaction((orders) => {
        for (const order of (orders as any[])) {
            update.run(currentNumber++, order.id);
        }
    });
    
    transaction(orders);
    console.log(`Updated ${orders.length} orders starting from 1001.`);

    console.log('Adding unique index...');
    db.prepare('CREATE UNIQUE INDEX `order_order_number_unique` ON `order` (`order_number`)').run();
    console.log('Unique index created.');

} catch (e) {
    console.error('Operation failed:', e.message);
} finally {
    db.close();
}
