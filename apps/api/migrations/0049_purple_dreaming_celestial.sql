CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`record_id` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`mentions` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_sync_idx` ON `comments` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `comments_record_idx` ON `comments` (`record_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `notifications` ADD `comment_id` text;