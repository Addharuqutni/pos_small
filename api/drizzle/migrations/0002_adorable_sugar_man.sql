ALTER TABLE "sale_items" ADD COLUMN "cost_price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "cost_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_cost_price_check" CHECK (cost_price >= 0);
--> statement-breakpoint
UPDATE sale_items si SET cost_price = p.cost_price, cost_estimated = true FROM products p WHERE p.id = si.product_id;
