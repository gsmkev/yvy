CREATE TABLE `analysis_jobs` (
	`farm_id` text NOT NULL,
	`kind` text NOT NULL,
	`organization_id` text NOT NULL,
	`status` text NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`requested_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`farm_id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `plot_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`plot_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref_key` text NOT NULL,
	`from_at` integer,
	`to_at` integer,
	`plot_area_ha` real NOT NULL,
	`valid_pct` real NOT NULL,
	`metrics` text NOT NULL,
	`changes` text NOT NULL,
	`computed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plot_analyses_uq` ON `plot_analyses` (`plot_id`,`kind`,`ref_key`);--> statement-breakpoint
CREATE INDEX `plot_analyses_farm_idx` ON `plot_analyses` (`farm_id`,`kind`);