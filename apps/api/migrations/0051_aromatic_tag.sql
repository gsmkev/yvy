CREATE TABLE `api_rate` (
	`token_id` text NOT NULL,
	`window` integer NOT NULL,
	`n` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`token_id`, `window`)
);
--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_hash_uq` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_tokens_org_idx` ON `api_tokens` (`organization_id`);