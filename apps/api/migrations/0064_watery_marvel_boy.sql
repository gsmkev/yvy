ALTER TABLE `warehouses` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `warehouses_sync_idx` ON `warehouses` (`organization_id`,`version`,`id`);