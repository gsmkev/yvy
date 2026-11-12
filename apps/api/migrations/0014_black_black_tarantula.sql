CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`unit` text NOT NULL,
	`active_ingredient` text,
	`withdrawal_days` integer,
	`tox_class` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_sync_idx` ON `products` (`organization_id`,`version`,`id`);