CREATE TABLE `farm_imagery` (
	`farm_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
