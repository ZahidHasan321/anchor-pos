import { column, Schema, Table } from '@powersync/node';

const products = new Table({
  name: column.text,
  description: column.text,
  category: column.text,
  base_price: column.real,
  default_discount: column.real,
  image_url: column.text,
});

const product_variants = new Table({
  product_id: column.text,
  size: column.text,
  color: column.text,
  barcode: column.text,
  stock_quantity: column.integer,
  price: column.real,
  discount: column.real,
});

const customers = new Table({
  name: column.text,
  phone: column.text,
  email: column.text,
  notes: column.text,
});

const orders = new Table({
  order_number: column.integer,
  customer_id: column.text,
  user_id: column.text,
  total_amount: column.real,
  status: column.text,
  payment_method: column.text,
  discount_amount: column.real,
  cash_received: column.real,
  change_given: column.real,
  created_at: column.text,
});

const order_items = new Table({
  order_id: column.text,
  variant_id: column.text,
  quantity: column.integer,
  price_at_sale: column.real,
  discount: column.real,
  product_name: column.text,
  variant_label: column.text,
  status: column.text,
});

const stock_logs = new Table({
  variant_id: column.text,
  change_amount: column.integer,
  reason: column.text,
  user_id: column.text,
  created_at: column.text,
});

const cashbook = new Table({
  amount: column.real,
  type: column.text,
  description: column.text,
  user_id: column.text,
  created_at: column.text,
});

const users = new Table({
  username: column.text,
  role: column.text,
  name: column.text,
  phone: column.text,
  email: column.text,
  image_url: column.text,
  is_active: column.integer,
  theme: column.text,
});

const role_permissions = new Table({
  role: column.text,
  resource: column.text,
});

const store_settings = new Table({
  key: column.text,
  value: column.text,
});

const sessions = new Table({
  user_id: column.text,
  expires_at: column.text,
});

export const AppSchema = new Schema({
  products,
  product_variants,
  customers,
  orders,
  order_items,
  stock_logs,
  cashbook,
  users,
  role_permissions,
  store_settings,
  sessions,
});

export type Database = (typeof AppSchema)['types'];
