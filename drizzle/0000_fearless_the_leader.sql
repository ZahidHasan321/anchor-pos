CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"user_name" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" text,
	"previous_hash" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashbook" (
	"id" text PRIMARY KEY NOT NULL,
	"amount" double precision NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_attempt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"variant_id" text,
	"quantity" integer NOT NULL,
	"price_at_sale" double precision NOT NULL,
	"discount" double precision DEFAULT 0,
	"product_name" text NOT NULL,
	"variant_label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_number" integer DEFAULT 0 NOT NULL,
	"customer_id" text,
	"user_id" text,
	"total_amount" double precision NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"payment_method" text NOT NULL,
	"discount_amount" double precision DEFAULT 0,
	"cash_received" double precision,
	"change_given" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"size" text NOT NULL,
	"color" text,
	"barcode" text NOT NULL,
	"stock_quantity" integer DEFAULT 0 NOT NULL,
	"price" double precision DEFAULT 0 NOT NULL,
	"discount" double precision DEFAULT 0,
	CONSTRAINT "product_variants_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"base_price" double precision NOT NULL,
	"default_discount" double precision DEFAULT 0,
	"image_url" text
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role" text NOT NULL,
	"resource" text NOT NULL,
	CONSTRAINT "role_permissions_role_resource_pk" PRIMARY KEY("role","resource")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"variant_id" text,
	"change_amount" integer NOT NULL,
	"reason" text NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'sales' NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"theme" text DEFAULT 'system',
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "cashbook" ADD CONSTRAINT "cashbook_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_logs" ADD CONSTRAINT "stock_logs_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_logs" ADD CONSTRAINT "stock_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_logs" USING btree ("entity");--> statement-breakpoint
CREATE INDEX "audit_log_entity_id_idx" ON "audit_logs" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cashbook_user_id_idx" ON "cashbook" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cashbook_created_at_idx" ON "cashbook" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cashbook_type_idx" ON "cashbook" USING btree ("type");--> statement-breakpoint
CREATE INDEX "cashbook_type_created_idx" ON "cashbook" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "cashbook_description_idx" ON "cashbook" USING btree ("description");--> statement-breakpoint
CREATE INDEX "customer_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "login_attempts_identifier_idx" ON "login_attempts" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "order_item_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_item_variant_id_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "order_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "order_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "product_variant_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variant_stock_idx" ON "product_variants" USING btree ("stock_quantity");--> statement-breakpoint
CREATE INDEX "product_variant_id_stock_idx" ON "product_variants" USING btree ("product_id","stock_quantity");--> statement-breakpoint
CREATE INDEX "product_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "product_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_log_variant_id_idx" ON "stock_logs" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stock_log_user_id_idx" ON "stock_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_log_created_at_idx" ON "stock_logs" USING btree ("created_at");