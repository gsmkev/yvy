CREATE TABLE `cash_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `cash_accounts_org_idx` ON `cash_accounts` (`organization_id`);--> statement-breakpoint
CREATE TABLE `cash_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text,
	`party_id` text,
	`doc_kind` text,
	`doc_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `cash_moves_account_idx` ON `cash_moves` (`organization_id`,`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `cash_moves_doc_idx` ON `cash_moves` (`doc_id`);