CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`days` real NOT NULL,
	`farm_id` text,
	`plot_id` text,
	`season_id` text,
	`labor` text,
	`wage_pyg` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `attendance_date_idx` ON `attendance` (`organization_id`,`date`);--> statement-breakpoint
CREATE INDEX `attendance_employee_idx` ON `attendance` (`organization_id`,`employee_id`,`date`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`ci` text,
	`phone` text,
	`daily_wage_pyg` integer DEFAULT 0 NOT NULL,
	`user_id` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `employees_org_idx` ON `employees` (`organization_id`,`name`);