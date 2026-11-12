CREATE TABLE `employee_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`amount_pyg` integer NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `employee_payments_idx` ON `employee_payments` (`organization_id`,`employee_id`,`date`);