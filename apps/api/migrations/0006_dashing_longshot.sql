CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_hash_uq` ON `share_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `share_links_farm_idx` ON `share_links` (`farm_id`);