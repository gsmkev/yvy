CREATE TABLE `notification_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`prefs` text NOT NULL,
	`updated_at` integer NOT NULL
);
