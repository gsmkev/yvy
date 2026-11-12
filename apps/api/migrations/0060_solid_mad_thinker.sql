CREATE TABLE `grain_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`party_id` text,
	`number` text,
	`crop` text NOT NULL,
	`season_id` text,
	`tons` real NOT NULL,
	`price_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`delivery_from` text,
	`delivery_to` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `grain_contracts_org_idx` ON `grain_contracts` (`organization_id`,`crop`);--> statement-breakpoint
CREATE TABLE `grain_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`number` text,
	`date` text NOT NULL,
	`tons` real NOT NULL,
	`price_minor` integer NOT NULL,
	`deductions_minor` integer DEFAULT 0 NOT NULL,
	`net_amount` integer NOT NULL,
	`net_pyg` integer NOT NULL,
	`currency` text NOT NULL,
	`farm_id` text,
	`plot_id` text,
	`season_id` text,
	`due_date` text,
	`paid_amount` integer DEFAULT 0 NOT NULL,
	`photo_path` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `grain_settlements_contract_idx` ON `grain_settlements` (`organization_id`,`contract_id`);--> statement-breakpoint
CREATE INDEX `grain_settlements_due_idx` ON `grain_settlements` (`organization_id`,`due_date`);--> statement-breakpoint
ALTER TABLE `grain_deliveries` ADD `contract_id` text;--> statement-breakpoint
CREATE INDEX `grain_deliveries_contract_idx` ON `grain_deliveries` (`organization_id`,`contract_id`);