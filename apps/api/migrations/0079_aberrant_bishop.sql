CREATE TABLE `trial_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`whatsapp` text NOT NULL,
	`company` text,
	`crops` text DEFAULT '[]' NOT NULL,
	`hectares` real,
	`employees` integer,
	`department` text,
	`consent_at` integer NOT NULL,
	`consent_version` text NOT NULL,
	`ip_hash` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	`contacted_at` integer
);
--> statement-breakpoint
CREATE INDEX `trial_requests_ip_idx` ON `trial_requests` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `trial_requests_status_idx` ON `trial_requests` (`status`,`created_at`);