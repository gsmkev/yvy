CREATE TABLE `plot_forecasts` (
	`plot_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`valid_date` text NOT NULL,
	`run_at` integer NOT NULL,
	`tmin_c` real,
	`tmax_c` real,
	`precip_mm` real,
	`wind_kmh` real,
	PRIMARY KEY(`plot_id`, `valid_date`)
);
--> statement-breakpoint
CREATE INDEX `plot_forecasts_farm_idx` ON `plot_forecasts` (`farm_id`);