CREATE TABLE `cost_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`farm_id` text,
	`plot_id` text,
	`season_id` text,
	`activity` text NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'PYG' NOT NULL,
	`amount_pyg` integer NOT NULL,
	`tons` real,
	`product_id` text,
	`party_id` text,
	`origin` text DEFAULT 'manual' NOT NULL,
	`origin_id` text,
	`photo_path` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `cost_entries_org_date_idx` ON `cost_entries` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `cost_entries_plot_idx` ON `cost_entries` (`plot_id`);--> statement-breakpoint
CREATE INDEX `cost_entries_origin_idx` ON `cost_entries` (`origin_id`);