CREATE TABLE `alert_feedback` (
	`alert_id` text NOT NULL,
	`user_id` text NOT NULL,
	`useful` integer NOT NULL,
	`comment` text,
	PRIMARY KEY(`alert_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `alert_plots` (
	`alert_id` text NOT NULL,
	`plot_id` text NOT NULL,
	PRIMARY KEY(`alert_id`, `plot_id`)
);
--> statement-breakpoint
CREATE INDEX `alert_plots_plot_idx` ON `alert_plots` (`plot_id`);--> statement-breakpoint
CREATE TABLE `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`probability` text,
	`valid_from` integer NOT NULL,
	`valid_to` integer,
	`plot_ids` text DEFAULT '[]' NOT NULL,
	`summary` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`source` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alerts_dedupe_uq` ON `alerts` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `alerts_sync_idx` ON `alerts` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`record_id` text NOT NULL,
	`storage_path` text NOT NULL,
	`thumb_path` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer,
	`height` integer,
	`bytes` integer,
	`upload_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attachments_sync_idx` ON `attachments` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `attachments_record_idx` ON `attachments` (`record_id`);--> statement-breakpoint
CREATE TABLE `climate_daily` (
	`farm_id` text NOT NULL,
	`plot_id` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`source` text NOT NULL,
	`precip_mm` real,
	`tmin_c` real,
	`tmax_c` real,
	`soil_moisture_0_7` real,
	`soil_moisture_7_28` real,
	PRIMARY KEY(`farm_id`, `plot_id`, `date`, `source`)
);
--> statement-breakpoint
CREATE TABLE `climatology` (
	`farm_id` text NOT NULL,
	`plot_id` text DEFAULT '' NOT NULL,
	`day_of_year` integer NOT NULL,
	`var` text NOT NULL,
	`p20` real,
	`p50` real,
	`p80` real,
	`mean` real,
	PRIMARY KEY(`farm_id`, `plot_id`, `day_of_year`, `var`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`app_version` text,
	`push_token` text,
	`last_sync_at` integer
);
--> statement-breakpoint
CREATE INDEX `devices_user_idx` ON `devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `email_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_codes_email_idx` ON `email_codes` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `farm_layers` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`layer` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`pmtiles_path` text NOT NULL,
	`bytes` integer NOT NULL,
	`bounds` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `farm_layers_sync_idx` ON `farm_layers` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `farm_layers_farm_idx` ON `farm_layers` (`farm_id`,`layer`,`acquired_at`);--> statement-breakpoint
CREATE TABLE `farms` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`department` text,
	`district` text,
	`geometry` text NOT NULL,
	`min_lon` real NOT NULL,
	`min_lat` real NOT NULL,
	`max_lon` real NOT NULL,
	`max_lat` real NOT NULL,
	`centroid_lon` real NOT NULL,
	`centroid_lat` real NOT NULL,
	`area_ha` real NOT NULL,
	`timezone` text DEFAULT 'America/Asuncion' NOT NULL,
	`offline_pack_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `farms_sync_idx` ON `farms` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE TABLE `fire_hotspots` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`lon` real NOT NULL,
	`lat` real NOT NULL,
	`confidence` text,
	`frp` real
);
--> statement-breakpoint
CREATE INDEX `fire_hotspots_time_idx` ON `fire_hotspots` (`acquired_at`);--> statement-breakpoint
CREATE TABLE `forecasts` (
	`farm_id` text NOT NULL,
	`run_at` integer NOT NULL,
	`source` text NOT NULL,
	`valid_date` text NOT NULL,
	`tmin_c` real,
	`tmax_c` real,
	`precip_mm` real,
	`wind_kmh` real,
	`wind_dir_deg` real,
	PRIMARY KEY(`farm_id`, `run_at`, `valid_date`)
);
--> statement-breakpoint
CREATE TABLE `link_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `link_codes_hash_uq` ON `link_codes` (`code_hash`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`assignments_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_user_uq` ON `memberships` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`alert_id` text,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_pending_idx` ON `notifications` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text DEFAULT 'PY' NOT NULL,
	`plan` text DEFAULT 'trial' NOT NULL,
	`trial_ends_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plot_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`plot_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plot_assignments_uq` ON `plot_assignments` (`user_id`,`plot_id`);--> statement-breakpoint
CREATE INDEX `plot_assignments_sync_idx` ON `plot_assignments` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE TABLE `plot_index_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`plot_id` text NOT NULL,
	`scene_id` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`idx` text DEFAULT 'ndvi' NOT NULL,
	`mean` real NOT NULL,
	`p10` real NOT NULL,
	`p90` real NOT NULL,
	`valid_pct` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plot_index_stats_uq` ON `plot_index_stats` (`plot_id`,`scene_id`,`idx`);--> statement-breakpoint
CREATE INDEX `plot_index_stats_sync_idx` ON `plot_index_stats` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE TABLE `plots` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`geometry` text NOT NULL,
	`min_lon` real NOT NULL,
	`min_lat` real NOT NULL,
	`max_lon` real NOT NULL,
	`max_lat` real NOT NULL,
	`area_ha` real NOT NULL,
	`crop` text,
	`season` text,
	`sowing_date` text,
	`pasture_type` text,
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plots_sync_idx` ON `plots` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `plots_farm_idx` ON `plots` (`farm_id`);--> statement-breakpoint
CREATE INDEX `plots_bbox_idx` ON `plots` (`organization_id`,`min_lon`,`max_lon`,`min_lat`,`max_lat`);--> statement-breakpoint
CREATE TABLE `points_of_interest` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`lon` real NOT NULL,
	`lat` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `poi_sync_idx` ON `points_of_interest` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `poi_farm_idx` ON `points_of_interest` (`farm_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`plot_id` text,
	`poi_id` text,
	`author_id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`schema_version` integer NOT NULL,
	`lon` real,
	`lat` real,
	`gps_accuracy_m` real,
	`captured_at` integer NOT NULL,
	`device_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_sync_idx` ON `records` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `records_farm_captured_idx` ON `records` (`farm_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `records_plot_idx` ON `records` (`plot_id`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`device_id` text,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_hash_uq` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`kind` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`storage_path` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reports_farm_idx` ON `reports` (`farm_id`,`period_start`);--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`item_id` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`cloud_pct` real,
	`processed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenes_item_uq` ON `scenes` (`source`,`item_id`);--> statement-breakpoint
CREATE TABLE `sync_mutations` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`op` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_seq` (
	`id` integer PRIMARY KEY NOT NULL,
	`v` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`farm_id` text NOT NULL,
	`plot_id` text,
	`assignee_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text,
	`due_date` text NOT NULL,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_at` integer,
	`completed_by` text,
	`record_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_sync_idx` ON `tasks` (`organization_id`,`version`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_idx` ON `tasks` (`assignee_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `usage_daily` (
	`day` text NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`limit` real,
	PRIMARY KEY(`day`, `metric`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`full_name` text NOT NULL,
	`phone` text,
	`locale` text DEFAULT 'es-PY' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);