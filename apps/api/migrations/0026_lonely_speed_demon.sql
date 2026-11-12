CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`ruc` text,
	`kind` text DEFAULT 'supplier' NOT NULL,
	`phone` text,
	`email` text,
	`address` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `parties_org_idx` ON `parties` (`organization_id`,`name`);