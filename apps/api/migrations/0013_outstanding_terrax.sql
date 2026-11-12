CREATE TABLE `plot_seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`plot_id` text NOT NULL,
	`season_id` text NOT NULL,
	`crop` text,
	`variety` text,
	`planned_sowing_date` text,
	`target_yield_t_ha` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plot_seasons_plot_season_uq` ON `plot_seasons` (`plot_id`,`season_id`);--> statement-breakpoint
CREATE INDEX `plot_seasons_sync_idx` ON `plot_seasons` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `plot_seasons_season_idx` ON `plot_seasons` (`season_id`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `seasons_sync_idx` ON `seasons` (`organization_id`,`version`,`id`);