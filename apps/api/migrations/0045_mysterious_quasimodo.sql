CREATE TABLE `yield_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`plot_id` text NOT NULL,
	`season_id` text,
	`file_name` text NOT NULL,
	`n_points` integer NOT NULL,
	`n_dropped` integer NOT NULL,
	`mean_t_ha` real NOT NULL,
	`p10_t_ha` real NOT NULL,
	`p90_t_ha` real NOT NULL,
	`min_t_ha` real NOT NULL,
	`max_t_ha` real NOT NULL,
	`cv_pct` real NOT NULL,
	`cell_m` integer NOT NULL,
	`cells` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `yield_maps_sync_idx` ON `yield_maps` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `yield_maps_plot_idx` ON `yield_maps` (`plot_id`,`season_id`);