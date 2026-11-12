CREATE TABLE `job_runs` (
	`job` text PRIMARY KEY NOT NULL,
	`last_ok_at` integer,
	`last_fail_at` integer,
	`last_fail_status` integer
);
