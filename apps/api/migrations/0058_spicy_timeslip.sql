CREATE TABLE `budget_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`season_id` text NOT NULL,
	`plot_id` text,
	`crop` text,
	`activity` text,
	`category` text NOT NULL,
	`amount_pyg` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `budget_lines_season_idx` ON `budget_lines` (`organization_id`,`season_id`);