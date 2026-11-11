CREATE TABLE `sanitary_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text,
	`reason` text NOT NULL,
	`planned_date` text NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`product` text,
	`note` text,
	`tasks_created` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `sanitary_events_org_date_idx` ON `sanitary_events` (`organization_id`,`planned_date`);