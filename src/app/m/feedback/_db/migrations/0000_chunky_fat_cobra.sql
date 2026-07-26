CREATE TABLE `evenings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`date` integer NOT NULL,
	`topic` text,
	`notes` text,
	`participant_count` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_evenings_group_date` ON `evenings` (`group_id`,`date`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`secret` text NOT NULL,
	`close_after_hours` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_groups_slug` ON `groups` (`slug`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`survey_id` integer NOT NULL,
	`answers` text NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_responses_survey` ON `responses` (`survey_id`);--> statement-breakpoint
CREATE TABLE `surveys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evening_id` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`questions` text DEFAULT '[]' NOT NULL,
	`close_after_hours` integer,
	`activated_at` integer,
	`closes_at` integer,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evening_id`) REFERENCES `evenings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "surveys_status_check" CHECK("surveys"."status" IN ('draft','active','closed','archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_surveys_evening` ON `surveys` (`evening_id`);--> statement-breakpoint
CREATE INDEX `idx_surveys_status` ON `surveys` (`status`);--> statement-breakpoint
CREATE TABLE `user_groups` (
	`user_id` text NOT NULL,
	`group_id` integer NOT NULL,
	PRIMARY KEY(`user_id`, `group_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
