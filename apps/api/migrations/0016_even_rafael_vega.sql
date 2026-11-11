CREATE TABLE `forecast_hours` (
	`farm_id` text NOT NULL,
	`valid_at` integer NOT NULL,
	`temp_c` real,
	`wind_kmh` real,
	`humidity_pct` real,
	`precip_mm` real,
	PRIMARY KEY(`farm_id`, `valid_at`)
);
