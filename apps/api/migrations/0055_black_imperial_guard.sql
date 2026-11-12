CREATE TABLE `machine_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`service` text NOT NULL,
	`purchase_price_pyg` integer DEFAULT 0 NOT NULL,
	`residual_pyg` integer DEFAULT 0 NOT NULL,
	`life_hours` real DEFAULT 0 NOT NULL,
	`operator_per_hour_pyg` integer DEFAULT 0 NOT NULL,
	`ha_per_hour` real,
	`fuel_liters_per_hour` real,
	`fuel_price_pyg` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `machine_costs_machine_uq` ON `machine_costs` (`organization_id`,`machine_id`);