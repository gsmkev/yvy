CREATE TABLE `grain_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`plot_id` text,
	`season_id` text,
	`crop` text NOT NULL,
	`ticket` text NOT NULL,
	`silo` text NOT NULL,
	`delivered_on` text NOT NULL,
	`gross_kg` real NOT NULL,
	`moisture_pct` real,
	`base_moisture_pct` real NOT NULL,
	`impurities_pct` real DEFAULT 0 NOT NULL,
	`other_kg` real DEFAULT 0 NOT NULL,
	`net_kg` real NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `grain_deliveries_sync_idx` ON `grain_deliveries` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `grain_deliveries_farm_idx` ON `grain_deliveries` (`farm_id`,`delivered_on`);--> statement-breakpoint
CREATE INDEX `grain_deliveries_plot_idx` ON `grain_deliveries` (`plot_id`);