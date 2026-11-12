ALTER TABLE `tasks` ADD `due_time` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `priority` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `comments` text DEFAULT '[]' NOT NULL;