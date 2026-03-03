import { sql } from 'drizzle-orm';
import {
	pgTable,
	text,
	integer,
	doublePrecision,
	boolean,
	timestamp,
	index,
	primaryKey
} from 'drizzle-orm/pg-core';

// --- Users & Auth ---

export const users = pgTable('users', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	role: text('role').notNull().default('sales'), // enum: ['admin', 'manager', 'sales']
	name: text('name').notNull(),
	phone: text('phone'),
	email: text('email'),
	imageUrl: text('image_url'),
	isActive: boolean('is_active').notNull().default(true),
	theme: text('theme').default('system') // 'light', 'dark', 'system'
});

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull()
	},
	(table) => ({
		userIdIdx: index('session_user_id_idx').on(table.userId)
	})
);

// --- Products & Inventory ---

export const products = pgTable(
	'products',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		description: text('description'),
		category: text('category').notNull(),
		templatePrice: doublePrecision('base_price').notNull(),
		costPrice: doublePrecision('cost_price').default(0),
		defaultDiscount: doublePrecision('default_discount').default(0),
		imageUrl: text('image_url')
	},
	(table) => ({
		categoryIdx: index('product_category_idx').on(table.category),
		nameIdx: index('product_name_idx').on(table.name)
	})
);

export const productVariants = pgTable(
	'product_variants',
	{
		id: text('id').primaryKey(),
		productId: text('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'cascade' }),
		size: text('size').notNull(), // S, M, L or 38, 40, 42
		color: text('color'),
		barcode: text('barcode').notNull().unique(),
		stockQuantity: integer('stock_quantity').notNull().default(0),
		price: doublePrecision('price').notNull().default(0),
		discount: doublePrecision('discount').default(0)
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

export const customers = pgTable(
	'customers',
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

export const orders = pgTable(
	'orders',
	{
		id: text('id').primaryKey(),
		orderNumber: integer('order_number'), // Human readable ID (e.g. 1001), optional and not unique to avoid sync conflicts
		customerId: text('customer_id').references(() => customers.id),
		userId: text('user_id').references(() => users.id), // Cashier
		totalAmount: doublePrecision('total_amount').notNull(),
		status: text('status').notNull().default('completed'), // enum: ['completed', 'refunded', 'void']
		paymentMethod: text('payment_method').notNull(), // enum: ['cash', 'card', 'split']
		discountAmount: doublePrecision('discount_amount').default(0),
		cashReceived: doublePrecision('cash_received'),
		changeGiven: doublePrecision('change_given'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => ({
		customerIdIdx: index('order_customer_id_idx').on(table.customerId),
		userIdIdx: index('order_user_id_idx').on(table.userId),
		createdAtIdx: index('order_created_at_idx').on(table.createdAt),
		statusIdx: index('order_status_idx').on(table.status),
		statusCreatedIdx: index('order_status_created_idx').on(table.status, table.createdAt)
	})
);

export const orderItems = pgTable(
	'order_items',
	{
		id: text('id').primaryKey(),
		orderId: text('order_id')
			.notNull()
			.references(() => orders.id, { onDelete: 'cascade' }),
		variantId: text('variant_id').references(() => productVariants.id),
		quantity: integer('quantity').notNull(),
		priceAtSale: doublePrecision('price_at_sale').notNull(), // Price at the moment of sale
		discount: doublePrecision('discount').default(0),
		productName: text('product_name').notNull(),
		variantLabel: text('variant_label').notNull(), // e.g., "M / Black"
		status: text('status').notNull().default('completed') // enum: ['completed', 'refunded']
	},
	(table) => ({
		orderIdIdx: index('order_item_order_id_idx').on(table.orderId),
		variantIdIdx: index('order_item_variant_id_idx').on(table.variantId)
	})
);

// --- Logs & Accounting ---

export const stockLogs = pgTable(
	'stock_logs',
	{
		id: text('id').primaryKey(),
		variantId: text('variant_id').references(() => productVariants.id),
		changeAmount: integer('change_amount').notNull(), // +10 or -5
		reason: text('reason').notNull(), // 'sale', 'restock', 'return', 'damage'
		userId: text('user_id').references(() => users.id),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => ({
		variantIdIdx: index('stock_log_variant_id_idx').on(table.variantId),
		userIdIdx: index('stock_log_user_id_idx').on(table.userId),
		createdAtIdx: index('stock_log_created_at_idx').on(table.createdAt)
	})
);

export const cashbook = pgTable(
	'cashbook',
	{
		id: text('id').primaryKey(),
		amount: doublePrecision('amount').notNull(),
		type: text('type').notNull(), // enum: ['in', 'out']
		description: text('description').notNull(),
		userId: text('user_id').references(() => users.id),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => ({
		userIdIdx: index('cashbook_user_id_idx').on(table.userId),
		createdAtIdx: index('cashbook_created_at_idx').on(table.createdAt),
		typeIdx: index('cashbook_type_idx').on(table.type),
		typeCreatedIdx: index('cashbook_type_created_idx').on(table.type, table.createdAt),
		descriptionIdx: index('cashbook_description_idx').on(table.description)
	})
);

export const rolePermissions = pgTable(
	'role_permissions',
	{
		role: text('role').notNull(),
		resource: text('resource').notNull()
	},
	(table) => ({
		pk: primaryKey({ columns: [table.role, table.resource] })
	})
);

export const storeSettings = pgTable('store_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const auditLogs = pgTable(
	'audit_logs',
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
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull()
	},
	(table) => ({
		userIdIdx: index('audit_log_user_id_idx').on(table.userId),
		entityIdx: index('audit_log_entity_idx').on(table.entity),
		entityIdIdx: index('audit_log_entity_id_idx').on(table.entityId),
		createdAtIdx: index('audit_log_created_at_idx').on(table.createdAt)
	})
);

export const loginAttempts = pgTable(
	'login_attempts',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(), // IP address or username
		attempts: integer('attempts').notNull().default(1),
		lastAttempt: timestamp('last_attempt', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => ({
		identifierIdx: index('login_attempts_identifier_idx').on(table.identifier)
	})
);
