CREATE TABLE `executions` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL,
	`task_id` text NOT NULL,
	`datum` text NOT NULL,
	`drohnensteuerer` text DEFAULT '' NOT NULL,
	`luftraumbeobachter` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_executions_participant` ON `executions` (`participant_id`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`login_code` text NOT NULL,
	`aktiv` integer DEFAULT 1 NOT NULL,
	`beginn` text,
	`created_at` text NOT NULL,
	`last_seen` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_login_code_unique` ON `participants` (`login_code`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_status` (
	`participant_id` text NOT NULL,
	`task_id` text NOT NULL,
	`zielanzahl` integer,
	`nicht_anwendbar` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`participant_id`, `task_id`),
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`teil` integer NOT NULL,
	`nummer` text NOT NULL,
	`titel` text NOT NULL,
	`lernziel` text DEFAULT '' NOT NULL,
	`schritte` text DEFAULT '[]' NOT NULL,
	`durchfuehrungshinweise` text DEFAULT '[]' NOT NULL,
	`sicherheitshinweise` text DEFAULT '[]' NOT NULL,
	`zielanzahl_default` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`aktiv` integer DEFAULT 1 NOT NULL,
	`bild` text,
	`updated_at` text NOT NULL
);
