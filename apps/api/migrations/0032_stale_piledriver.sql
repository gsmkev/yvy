CREATE TABLE `stock_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`product_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`qty` real NOT NULL,
	`value_pyg` integer NOT NULL,
	`amount` integer,
	`currency` text,
	`occurred_at` integer NOT NULL,
	`origin` text NOT NULL,
	`origin_id` text,
	`party_id` text,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `stock_moves_product_idx` ON `stock_moves` (`organization_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `stock_moves_warehouse_idx` ON `stock_moves` (`warehouse_id`);--> statement-breakpoint
CREATE INDEX `stock_moves_origin_idx` ON `stock_moves` (`origin_id`);