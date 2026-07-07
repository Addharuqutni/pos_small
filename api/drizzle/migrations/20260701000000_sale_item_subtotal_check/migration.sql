ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_subtotal_check" CHECK (subtotal >= 0);--> statement-breakpoint
