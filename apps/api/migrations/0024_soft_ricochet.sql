CREATE TABLE `farm_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`geometry` text NOT NULL,
	`min_lon` real NOT NULL,
	`min_lat` real NOT NULL,
	`max_lon` real NOT NULL,
	`max_lat` real NOT NULL,
	`length_m` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `farm_lines_sync_idx` ON `farm_lines` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `farm_lines_farm_idx` ON `farm_lines` (`farm_id`);