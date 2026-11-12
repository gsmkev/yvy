CREATE TABLE `product_dose_ranges` (
	`product_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`min_dose` real,
	`max_dose` real,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `record_reviews` (
	`record_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`reviewed_by` text NOT NULL,
	`reviewed_at` integer NOT NULL
);
