CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_name_ts_idx` ON `events` (`name`,`ts`);--> statement-breakpoint
CREATE INDEX `events_user_ts_idx` ON `events` (`user_id`,`ts`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_funnel_uq` ON `events` (`organization_id`,`name`) WHERE name IN ('signup', 'farm_created', 'plots_created', 'member_added', 'first_record');--> statement-breakpoint
INSERT OR IGNORE INTO `events` (`id`, `name`, `user_id`, `organization_id`, `ts`)
SELECT lower(hex(randomblob(16))), 'signup', coalesce((SELECT m.user_id FROM memberships m WHERE m.organization_id = o.id AND m.role = 'owner' LIMIT 1), ''), o.id, o.created_at
FROM organizations o WHERE o.plan <> 'demo';
--> statement-breakpoint
INSERT OR IGNORE INTO `events` (`id`, `name`, `user_id`, `organization_id`, `ts`)
SELECT lower(hex(randomblob(16))), 'farm_created', '', f.organization_id, min(f.created_at)
FROM farms f WHERE f.deleted_at IS NULL GROUP BY f.organization_id;
--> statement-breakpoint
INSERT OR IGNORE INTO `events` (`id`, `name`, `user_id`, `organization_id`, `ts`)
SELECT lower(hex(randomblob(16))), 'plots_created', '', p.organization_id, min(p.created_at)
FROM plots p WHERE p.deleted_at IS NULL GROUP BY p.organization_id;
--> statement-breakpoint
INSERT OR IGNORE INTO `events` (`id`, `name`, `user_id`, `organization_id`, `ts`)
SELECT lower(hex(randomblob(16))), 'member_added', m.user_id, m.organization_id, min(m.created_at)
FROM memberships m WHERE m.deleted_at IS NULL AND m.role <> 'owner' GROUP BY m.organization_id;
--> statement-breakpoint
INSERT OR IGNORE INTO `events` (`id`, `name`, `user_id`, `organization_id`, `ts`)
SELECT lower(hex(randomblob(16))), 'first_record', '', r.organization_id, min(r.created_at)
FROM records r WHERE r.deleted_at IS NULL GROUP BY r.organization_id;
