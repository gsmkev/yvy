CREATE TABLE `maintenance_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`plan_id` text,
	`kind` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`meter_value` real,
	`description` text,
	`party_id` text,
	`amount` integer,
	`currency` text,
	`amount_pyg` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `maintenance_logs_machine_idx` ON `maintenance_logs` (`organization_id`,`machine_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `maintenance_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`name` text NOT NULL,
	`every_units` real NOT NULL,
	`last_done_meter` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `maintenance_plans_machine_idx` ON `maintenance_plans` (`organization_id`,`machine_id`);