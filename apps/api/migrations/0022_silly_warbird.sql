CREATE TABLE `eudr_results` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`plot_id` text NOT NULL,
	`status` text NOT NULL,
	`plot_area_ha` real NOT NULL,
	`forest_ref_ha` real NOT NULL,
	`loss_ha` real NOT NULL,
	`valid_pct` real NOT NULL,
	`ref_year` integer NOT NULL,
	`cur_year` integer NOT NULL,
	`ref_from_at` integer,
	`ref_to_at` integer,
	`cur_from_at` integer,
	`cur_to_at` integer,
	`ref_scenes` integer NOT NULL,
	`cur_scenes` integer NOT NULL,
	`changes` text NOT NULL,
	`computed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eudr_results_plot_uq` ON `eudr_results` (`plot_id`);--> statement-breakpoint
CREATE INDEX `eudr_results_farm_idx` ON `eudr_results` (`farm_id`);