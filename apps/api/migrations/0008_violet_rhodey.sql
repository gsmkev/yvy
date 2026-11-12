CREATE TABLE `farm_livestock_settings` (
	`farm_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`max_ua_per_ha` real DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
