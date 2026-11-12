CREATE TABLE `form_configs` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
