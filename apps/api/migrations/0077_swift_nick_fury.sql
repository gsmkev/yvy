CREATE TABLE `events_daily` (
	`day` text NOT NULL,
	`name` text NOT NULL,
	`n` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `name`)
);
--> statement-breakpoint
INSERT INTO `events_daily` (`day`, `name`, `n`)
SELECT date(`ts` / 1000 - 10800, 'unixepoch'), `name`, count(*) * 2 FROM `events`
WHERE `name` LIKE 'view:%' GROUP BY 1, 2;--> statement-breakpoint
DELETE FROM `events` WHERE `name` LIKE 'view:%';--> statement-breakpoint
DROP INDEX `events_user_ts_idx`;--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `user_id`;