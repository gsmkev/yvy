CREATE TABLE `user_pins` (
	`user_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`phone_key` text NOT NULL,
	`salt` text NOT NULL,
	`pin_hash` text NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_pins_phone_uq` ON `user_pins` (`phone_key`);--> statement-breakpoint
CREATE INDEX `user_pins_org_idx` ON `user_pins` (`organization_id`);