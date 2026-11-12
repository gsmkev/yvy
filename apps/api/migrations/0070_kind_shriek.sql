CREATE TABLE `webhook_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`url` text NOT NULL,
	`secret_enc` text NOT NULL,
	`events` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_status` text,
	`last_http_status` integer,
	`last_error` text,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `webhook_endpoints_org_idx` ON `webhook_endpoints` (`organization_id`);--> statement-breakpoint
CREATE TABLE `webhook_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `webhook_outbox_created_idx` ON `webhook_outbox` (`created_at`);