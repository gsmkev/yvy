CREATE TABLE `machines` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`brand` text,
	`model` text,
	`year` integer,
	`meter_kind` text DEFAULT 'hours' NOT NULL,
	`meter_value` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `machines_sync_idx` ON `machines` (`organization_id`,`version`,`id`);