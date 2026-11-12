CREATE TABLE `animals` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`tag` text NOT NULL,
	`category` text NOT NULL,
	`sex` text NOT NULL,
	`birth_date` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `animals_org_tag_uq` ON `animals` (`organization_id`,`tag`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `animals_sync_idx` ON `animals` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `animals_farm_idx` ON `animals` (`farm_id`);