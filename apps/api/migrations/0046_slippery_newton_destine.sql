CREATE TABLE `management_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`plot_id` text NOT NULL,
	`zone` integer NOT NULL,
	`area_ha` real NOT NULL,
	`pct` real NOT NULL,
	`mean_ndvi` real NOT NULL,
	`seasons` text NOT NULL,
	`geometry` text NOT NULL,
	`computed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `management_zones_plot_zone_uq` ON `management_zones` (`plot_id`,`zone`);--> statement-breakpoint
CREATE INDEX `management_zones_farm_idx` ON `management_zones` (`farm_id`);