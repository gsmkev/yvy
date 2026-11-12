ALTER TABLE `audit_log` ADD `entity` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `entity_id` text;--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`organization_id`,`entity`,`entity_id`);