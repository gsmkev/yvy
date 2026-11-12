CREATE TABLE `custom_layers` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`mime` text NOT NULL,
	`original_path` text NOT NULL,
	`image_path` text,
	`image_mime` text,
	`bytes` integer NOT NULL,
	`corners` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `custom_layers_sync_idx` ON `custom_layers` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `custom_layers_farm_idx` ON `custom_layers` (`farm_id`,`status`);