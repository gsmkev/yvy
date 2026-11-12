CREATE TABLE `purchase_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`product_id` text,
	`description` text,
	`category` text,
	`activity` text,
	`qty` real NOT NULL,
	`received_qty` real,
	`unit_price` integer NOT NULL,
	`lot` text,
	`expires_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `purchase_lines_purchase_idx` ON `purchase_lines` (`organization_id`,`purchase_id`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`party_id` text,
	`farm_id` text,
	`order_date` text NOT NULL,
	`expected_date` text,
	`currency` text NOT NULL,
	`total_amount` integer DEFAULT 0 NOT NULL,
	`total_pyg` integer DEFAULT 0 NOT NULL,
	`invoice_number` text,
	`invoice_date` text,
	`due_date` text,
	`paid_amount` integer DEFAULT 0 NOT NULL,
	`warehouse_id` text,
	`received_at` text,
	`note` text,
	`photo_path` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `purchases_org_idx` ON `purchases` (`organization_id`,`order_date`);--> statement-breakpoint
CREATE INDEX `purchases_due_idx` ON `purchases` (`organization_id`,`due_date`);