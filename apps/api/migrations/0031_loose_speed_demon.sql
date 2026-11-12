CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'shed' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `warehouses_farm_idx` ON `warehouses` (`organization_id`,`farm_id`);