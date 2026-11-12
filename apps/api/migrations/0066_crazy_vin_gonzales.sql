CREATE TABLE `zone_benchmarks` (
	`farm_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`computed_at` integer NOT NULL,
	`radius_km` integer NOT NULL,
	`window_days` integer NOT NULL,
	`n_farms` integer NOT NULL,
	`ndvi` real,
	`ndvi_median` real,
	`rain_mm` real,
	`rain_median_mm` real
);
