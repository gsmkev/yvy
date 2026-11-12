CREATE TABLE `exchange_rates` (
	`organization_id` text NOT NULL,
	`date` text NOT NULL,
	`usd_to_pyg` integer NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `date`)
);
