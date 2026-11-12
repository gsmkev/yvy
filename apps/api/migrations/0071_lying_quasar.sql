CREATE TABLE `calendar_feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_feeds_hash_uq` ON `calendar_feeds` (`token_hash`);--> statement-breakpoint
CREATE INDEX `calendar_feeds_user_idx` ON `calendar_feeds` (`user_id`,`organization_id`);