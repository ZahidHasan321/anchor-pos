CREATE TYPE "public"."cashbook_category" AS ENUM('sale', 'refund', 'expense');--> statement-breakpoint
CREATE TYPE "public"."cashbook_type" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."order_item_status" AS ENUM('completed', 'refunded', 'voided');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('completed', 'refunded', 'void');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'split', 'mobile');--> statement-breakpoint
CREATE TYPE "public"."stock_log_reason" AS ENUM('sale', 'restock', 'return', 'damage');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'manager', 'sales');--> statement-breakpoint
DROP INDEX "cashbook_description_idx";--> statement-breakpoint
ALTER TABLE "cashbook" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "cashbook" ALTER COLUMN "type" SET DATA TYPE "public"."cashbook_type" USING "type"::"public"."cashbook_type";--> statement-breakpoint
ALTER TABLE "cashbook" ALTER COLUMN "category" SET DEFAULT 'expense'::"public"."cashbook_category";--> statement-breakpoint
ALTER TABLE "cashbook" ALTER COLUMN "category" SET DATA TYPE "public"."cashbook_category" USING "category"::"public"."cashbook_category";--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "price_at_sale" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "cost_at_sale" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "discount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "status" SET DEFAULT 'completed'::"public"."order_item_status";--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "status" SET DATA TYPE "public"."order_item_status" USING "status"::"public"."order_item_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total_amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'completed'::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_method" SET DATA TYPE "public"."payment_method" USING "payment_method"::"public"."payment_method";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "discount_amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "cash_received" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "change_given" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "cash_amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "card_amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "mobile_amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "cost_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "discount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "base_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "cost_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "default_discount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'sales'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "card_type" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "card_ref" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();