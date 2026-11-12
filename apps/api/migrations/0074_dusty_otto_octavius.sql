CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`lon` real NOT NULL,
	`lat` real NOT NULL,
	`consent_at` integer NOT NULL,
	`consent_version` text NOT NULL,
	`ip_hash` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`report` text,
	`report_at` integer,
	`sent_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leads_ip_idx` ON `leads` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `leads_email_idx` ON `leads` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`,`created_at`);