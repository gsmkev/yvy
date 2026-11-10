ALTER TABLE `email_codes` ADD `ip` text;--> statement-breakpoint
CREATE INDEX `email_codes_ip_idx` ON `email_codes` (`ip`,`created_at`);