CREATE TABLE `farm_history` (
	`farm_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
