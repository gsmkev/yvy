CREATE TABLE `report_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`frequency` text NOT NULL,
	`last_sent_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `report_schedules_org_idx` ON `report_schedules` (`organization_id`,`farm_id`);