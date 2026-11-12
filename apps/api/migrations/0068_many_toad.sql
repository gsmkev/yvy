CREATE TABLE `document_taxes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`doc_kind` text NOT NULL,
	`doc_id` text NOT NULL,
	`timbrado` text,
	`gross_10` integer DEFAULT 0 NOT NULL,
	`gross_5` integer DEFAULT 0 NOT NULL,
	`exempt` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_taxes_doc_uq` ON `document_taxes` (`organization_id`,`doc_kind`,`doc_id`);--> statement-breakpoint
CREATE TABLE `export_formats` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`dataset` text NOT NULL,
	`config` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `export_formats_org_idx` ON `export_formats` (`organization_id`,`dataset`);