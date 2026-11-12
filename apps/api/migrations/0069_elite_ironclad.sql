CREATE TABLE `totp_recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `totp_recovery_user_idx` ON `totp_recovery_codes` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `totp_recovery_hash_uq` ON `totp_recovery_codes` (`code_hash`);--> statement-breakpoint
CREATE TABLE `user_totp` (
	`user_id` text PRIMARY KEY NOT NULL,
	`secret_enc` text NOT NULL,
	`enabled_at` integer,
	`last_step` integer DEFAULT 0 NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `organizations` ADD `require_admin_totp` integer DEFAULT false NOT NULL;