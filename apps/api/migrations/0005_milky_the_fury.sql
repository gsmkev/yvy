CREATE TABLE `farm_alert_settings` (
	`farm_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`frost_tmin_c` real DEFAULT 2 NOT NULL,
	`excess_rain_mm_24h` real DEFAULT 50 NOT NULL,
	`drought_deficit_pct` real DEFAULT 50 NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
