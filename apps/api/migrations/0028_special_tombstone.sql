CREATE TABLE `contractors` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`party_id` text,
	`service` text NOT NULL,
	`rate_unit` text NOT NULL,
	`rate_amount` integer NOT NULL,
	`currency` text DEFAULT 'PYG' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `contractors_org_idx` ON `contractors` (`organization_id`,`name`);