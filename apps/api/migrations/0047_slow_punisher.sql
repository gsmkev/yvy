CREATE TABLE `farm_access` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`level` text DEFAULT 'edit' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`, `farm_id`)
);
--> statement-breakpoint
CREATE INDEX `farm_access_farm_idx` ON `farm_access` (`farm_id`);