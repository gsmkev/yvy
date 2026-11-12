CREATE TABLE `problem_areas` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`plot_id` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`geometry` text NOT NULL,
	`lon` real NOT NULL,
	`lat` real NOT NULL,
	`area_ha` real NOT NULL,
	`mean_ndvi` real NOT NULL,
	`plot_median_ndvi` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `problem_areas_plot_idx` ON `problem_areas` (`plot_id`);--> statement-breakpoint
CREATE INDEX `problem_areas_farm_idx` ON `problem_areas` (`farm_id`);