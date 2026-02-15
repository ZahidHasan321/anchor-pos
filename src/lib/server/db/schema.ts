import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, real, index, primaryKey } from 'drizzle-orm/sqlite-core';

// --- Users & Auth ---

export const users = sqliteTable('user', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['admin', 'manager', 'sales'] })
		.notNull()
		.default('sales'),
	name: text('name').notNull(),
	phone: text('phone'),
	email: text('email'),
	imageUrl: text('image_url'),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	theme: text('theme').default('system') // 'light', 'dark', 'system'
});

export const sessions = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
	},
	(table) => ({
		userIdIdx: index('session_user_id_idx').on(table.userId)
	})
);

// --- Products & Inventory ---

export const products = sqliteTable(
	'product',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		description: text('description'),
		category: text('category').notNull(),
		templatePrice: real('base_price').notNull(),
		defaultDiscount: real('default_discount').default(0),
		imageUrl: text('image_url')
	},
	(table) => ({
		categoryIdx: index('product_category_idx').on(table.category),
		nameIdx: index('product_name_idx').on(table.name)
	})
);

export const productVariants = sqliteTable(
	'product_variant',
	{
		id: text('id').primaryKey(),
		productId: text('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'cascade' }),
		size: text('size').notNull(), // S, M, L or 38, 40, 42
		color: text('color'),
		barcode: text('barcode').notNull().unique(),
		stockQuantity: integer('stock_quantity').notNull().default(0),
		price: real('price').notNull().default(0),
		discount: real('discount').default(0)
		// priceOverride: real('price_override') // Deprecated: use price column
	},
	(table) => ({
		productIdIdx: index('product_variant_product_id_idx').on(table.productId),
		stockIdx: index('product_variant_stock_idx').on(table.stockQuantity),
		productIdStockIdx: index('product_variant_id_stock_idx').on(
			table.productId,
			table.stockQuantity
		)
	})
);

// --- Customers ---

export const customers = sqliteTable(
	'customer',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		phone: text('phone').unique(),
		email: text('email'),
		notes: text('notes')
	},
	(table) => ({
		nameIdx: index('customer_name_idx').on(table.name)
	})
);

// --- Sales & Orders ---

export const orders = sqliteTable(
	'order',
	{
		id: text('id').primaryKey(),
		orderNumber: integer('order_number').notNull().unique().default(0), // Human readable ID (e.g. 1001)
		customerId: text('customer_id').references(() => customers.id),
		userId: text('user_id').references(() => users.id), // Cashier
		totalAmount: real('total_amount').notNull(),
		status: text('status', { enum: ['completed', 'refunded', 'void'] })
			.notNull()
			.default('completed'),
		paymentMethod: text('payment_method', { enum: ['cash', 'card', 'split'] }).notNull(),
		discountAmount: real('discount_amount').default(0),
		cashReceived: real('cash_received'),
		changeGiven: real('change_given'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(table) => ({
		customerIdIdx: index('order_customer_id_idx').on(table.customerId),
		userIdIdx: index('order_user_id_idx').on(table.userId),
		createdAtIdx: index('order_created_at_idx').on(table.createdAt),
		statusIdx: index('order_status_idx').on(table.status),
		statusCreatedIdx: index('order_status_created_idx').on(table.status, table.createdAt)
	})
);

export const orderItems = sqliteTable(
	'order_item',
	{
		id: text('id').primaryKey(),
		orderId: text('order_id')
			.notNull()
			.references(() => orders.id, { onDelete: 'cascade' }),
		variantId: text('variant_id').references(() => productVariants.id),
		quantity: integer('quantity').notNull(),
		priceAtSale: real('price_at_sale').notNull(), // Price at the moment of sale
		discount: real('discount').default(0),
		productName: text('product_name').notNull(),
		variantLabel: text('variant_label').notNull() // e.g., "M / Black"
	},
	(table) => ({
		orderIdIdx: index('order_item_order_id_idx').on(table.orderId),
		variantIdIdx: index('order_item_variant_id_idx').on(table.variantId)
	})
);

// --- Logs & Accounting ---

export const stockLogs = sqliteTable(
	'stock_log',
	{
		id: text('id').primaryKey(),
		variantId: text('variant_id').references(() => productVariants.id),
		changeAmount: integer('change_amount').notNull(), // +10 or -5
		reason: text('reason').notNull(), // 'sale', 'restock', 'return', 'damage'
		userId: text('user_id').references(() => users.id),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(table) => ({
		variantIdIdx: index('stock_log_variant_id_idx').on(table.variantId),
		userIdIdx: index('stock_log_user_id_idx').on(table.userId),
		createdAtIdx: index('stock_log_created_at_idx').on(table.createdAt)
	})
);

export const cashbook = sqliteTable(
	'cashbook',
	{
		id: text('id').primaryKey(),
		amount: real('amount').notNull(),
		type: text('type', { enum: ['in', 'out'] }).notNull(),
		description: text('description').notNull(),
		userId: text('user_id').references(() => users.id),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.default(sql`(unixepoch() * 1000)`)
	},
	(table) => ({
		userIdIdx: index('cashbook_user_id_idx').on(table.userId),
		createdAtIdx: index('cashbook_created_at_idx').on(table.createdAt),
		typeIdx: index('cashbook_type_idx').on(table.type),
		typeCreatedIdx: index('cashbook_type_created_idx').on(table.type, table.createdAt),
		descriptionIdx: index('cashbook_description_idx').on(table.description)
	})
);

export const rolePermissions = sqliteTable(
	'role_permission',
	{
		role: text('role').notNull(),
		resource: text('resource').notNull()
	},
	(table) => ({
		pk: primaryKey({ columns: [table.role, table.resource] })
	})
);

export const storeSettings = sqliteTable('store_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const auditLogs = sqliteTable(
	'audit_log',
	{
		id: text('id').primaryKey(),
		userId: text('user_id'),
		userName: text('user_name').notNull(),
		action: text('action').notNull(), // e.g., 'CREATE_USER', 'LOGIN', 'ADJUST_STOCK'
		entity: text('entity').notNull(), // e.g., 'user', 'product', 'order'
		entityId: text('entity_id'),
		details: text('details'),
		previousHash: text('previous_hash').notNull(),
		hash: text('hash').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
	},
	(table) => ({
		userIdIdx: index('audit_log_user_id_idx').on(table.userId),
		entityIdx: index('audit_log_entity_idx').on(table.entity),
		entityIdIdx: index('audit_log_entity_id_idx').on(table.entityId),
		createdAtIdx: index('audit_log_created_at_idx').on(table.createdAt)
	})
);
