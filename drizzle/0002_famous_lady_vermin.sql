ALTER TABLE "orders" DROP CONSTRAINT "orders_order_number_unique";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "order_number" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "order_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cashbook" ADD COLUMN "category" text DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "cost_at_sale" double precision DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cash_amount" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "card_amount" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "mobile_amount" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "mobile_method" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "mobile_trx_id" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "cost_price" double precision DEFAULT 0;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost_price" double precision DEFAULT 0;