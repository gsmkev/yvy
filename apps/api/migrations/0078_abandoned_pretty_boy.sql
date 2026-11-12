CREATE TABLE `plan_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`plan` text NOT NULL,
	`max_ha` real,
	`max_users` integer,
	`note` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	`resolution_note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_requests_pending_uq` ON `plan_requests` (`organization_id`) WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX `plan_requests_status_idx` ON `plan_requests` (`status`,`created_at`);