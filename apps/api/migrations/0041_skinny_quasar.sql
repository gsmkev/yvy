CREATE TABLE `soil_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`plot_id` text,
	`point_label` text,
	`lon` real,
	`lat` real,
	`sampled_on` text NOT NULL,
	`depth_cm` integer DEFAULT 20 NOT NULL,
	`lab` text,
	`ph` real,
	`p_mg_kg` real,
	`k_cmol_kg` real,
	`om_pct` real,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `soil_samples_sync_idx` ON `soil_samples` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `soil_samples_farm_idx` ON `soil_samples` (`farm_id`);--> statement-breakpoint
CREATE INDEX `soil_samples_plot_idx` ON `soil_samples` (`plot_id`);