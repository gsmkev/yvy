CREATE TABLE `activity_daily` (
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`day` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`user_id`, `day`)
);
--> statement-breakpoint
CREATE INDEX `activity_daily_org_idx` ON `activity_daily` (`organization_id`,`day`);