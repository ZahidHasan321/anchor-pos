import { Schema, Table, Column, ColumnType } from '@powersync/common';

export const AppSchema = new Schema([
  new Table({
    name: 'products',
    columns: [
      new Column({ name: 'name', type: ColumnType.TEXT }),
      new Column({ name: 'description', type: ColumnType.TEXT }),
      new Column({ name: 'category', type: ColumnType.TEXT }),
      new Column({ name: 'base_price', type: ColumnType.REAL }),
      new Column({ name: 'cost_price', type: ColumnType.REAL }),
      new Column({ name: 'default_discount', type: ColumnType.REAL }),
      new Column({ name: 'image_url', type: ColumnType.TEXT })
    ]
  }),
  new Table({
    name: 'product_variants',
    columns: [
      new Column({ name: 'product_id', type: ColumnType.TEXT }),
      new Column({ name: 'size', type: ColumnType.TEXT }),
      new Column({ name: 'color', type: ColumnType.TEXT }),
      new Column({ name: 'barcode', type: ColumnType.TEXT }),
      new Column({ name: 'stock_quantity', type: ColumnType.INTEGER }),
      new Column({ name: 'price', type: ColumnType.REAL }),
      new Column({ name: 'cost_price', type: ColumnType.REAL }),
      new Column({ name: 'discount', type: ColumnType.REAL })
    ]
  }),
  new Table({
    name: 'customers',
    columns: [
      new Column({ name: 'name', type: ColumnType.TEXT }),
      new Column({ name: 'phone', type: ColumnType.TEXT }),
      new Column({ name: 'email', type: ColumnType.TEXT }),
      new Column({ name: 'notes', type: ColumnType.TEXT })
    ]
  }),
  new Table({
    name: 'orders',
    columns: [
      new Column({ name: 'order_number', type: ColumnType.INTEGER }),
      new Column({ name: 'customer_id', type: ColumnType.TEXT }),
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'total_amount', type: ColumnType.REAL }),
      new Column({ name: 'status', type: ColumnType.TEXT }),
      new Column({ name: 'payment_method', type: ColumnType.TEXT }),
      new Column({ name: 'discount_amount', type: ColumnType.REAL }),
      new Column({ name: 'cash_received', type: ColumnType.REAL }),
      new Column({ name: 'change_given', type: ColumnType.REAL }),
      new Column({ name: 'created_at', type: ColumnType.TEXT })
    ]
  }),
  new Table({
    name: 'order_items',
    columns: [
      new Column({ name: 'order_id', type: ColumnType.TEXT }),
      new Column({ name: 'variant_id', type: ColumnType.TEXT }),
      new Column({ name: 'quantity', type: ColumnType.INTEGER }),
      new Column({ name: 'price_at_sale', type: ColumnType.REAL }),
      new Column({ name: 'cost_at_sale', type: ColumnType.REAL }),
      new Column({ name: 'discount', type: ColumnType.REAL }),
      new Column({ name: 'product_name', type: ColumnType.TEXT }),
      new Column({ name: 'variant_label', type: ColumnType.TEXT }),
      new Column({ name: 'status', type: ColumnType.TEXT })
    ]
  }),
  new Table({
    name: 'cashbook',
    columns: [
      new Column({ name: 'amount', type: ColumnType.REAL }),
      new Column({ name: 'type', type: ColumnType.TEXT }),
      new Column({ name: 'category', type: ColumnType.TEXT }),
      new Column({ name: 'description', type: ColumnType.TEXT }),      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'created_at', type: ColumnType.TEXT })
    ]
  }),
  new Table({
    name: 'users',
    columns: [
      new Column({ name: 'username', type: ColumnType.TEXT }),
      new Column({ name: 'role', type: ColumnType.TEXT }),
      new Column({ name: 'name', type: ColumnType.TEXT }),
      new Column({ name: 'phone', type: ColumnType.TEXT }),
      new Column({ name: 'email', type: ColumnType.TEXT }),
      new Column({ name: 'image_url', type: ColumnType.TEXT }),
      new Column({ name: 'is_active', type: ColumnType.INTEGER }),
      new Column({ name: 'theme', type: ColumnType.TEXT })
    ]
  }),
  new Table({
    name: 'stock_logs',
    columns: [
      new Column({ name: 'variant_id', type: ColumnType.TEXT }),
      new Column({ name: 'change_amount', type: ColumnType.INTEGER }),
      new Column({ name: 'reason', type: ColumnType.TEXT }),
      new Column({ name: 'user_id', type: ColumnType.TEXT }),
      new Column({ name: 'created_at', type: ColumnType.TEXT })
    ]
  }),
  new Table({
    name: 'role_permissions',
    columns: [
      new Column({ name: 'role', type: ColumnType.TEXT }),
      new Column({ name: 'resource', type: ColumnType.TEXT })
    ]
  }),
  new Table({
    name: 'store_settings',
    columns: [
      new Column({ name: 'key', type: ColumnType.TEXT }),
      new Column({ name: 'value', type: ColumnType.TEXT })
    ]
  })
]);
