CREATE TABLE `cattle_deals` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`party_id` text,
	`farm_id` text,
	`season_id` text,
	`category` text,
	`heads` integer NOT NULL,
	`total_kg` real NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`amount_pyg` integer NOT NULL,
	`guide_number` text,
	`due_date` text,
	`paid_amount` integer DEFAULT 0 NOT NULL,
	`photo_path` text,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `cattle_deals_org_idx` ON `cattle_deals` (`organization_id`,`date`);--> statement-breakpoint
CREATE INDEX `cattle_deals_due_idx` ON `cattle_deals` (`organization_id`,`due_date`);