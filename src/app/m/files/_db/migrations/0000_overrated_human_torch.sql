CREATE TABLE `aufraeum_laeufe` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`gestartet_at` integer NOT NULL,
	`beendet_at` integer,
	`trockenlauf` integer NOT NULL,
	`shares_geloescht` integer DEFAULT 0 NOT NULL,
	`dateien_geloescht` integer DEFAULT 0 NOT NULL,
	`bytes_geloescht` integer DEFAULT 0 NOT NULL,
	`logzeilen_geloescht` integer DEFAULT 0 NOT NULL,
	`inbox_geloescht` integer DEFAULT 0 NOT NULL,
	`parts_geloescht` integer DEFAULT 0 NOT NULL,
	`verwaiste_blobs_gemeldet` integer DEFAULT 0 NOT NULL,
	`fehler` text
);
--> statement-breakpoint
CREATE TABLE `download_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`share_id` text NOT NULL,
	`file_id` text,
	`client_ip_unbestaetigt` text,
	`user_agent` text,
	`downloaded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_logs_share_time` ON `download_logs` (`share_id`,`downloaded_at`);--> statement-breakpoint
CREATE INDEX `idx_logs_time` ON `download_logs` (`downloaded_at`);--> statement-breakpoint
CREATE TABLE `inbox_files` (
	`id` text PRIMARY KEY NOT NULL,
	`token_id` text,
	`dateiname` text NOT NULL,
	`kategorie` text,
	`hinweis` text,
	`mime_type` text,
	`size` integer NOT NULL,
	`client_ip_unbestaetigt` text,
	`empfangen_at` integer NOT NULL,
	`bytes_vollstaendig_at` integer,
	`av_status` text NOT NULL,
	`av_geprueft_at` integer,
	FOREIGN KEY (`token_id`) REFERENCES `zugangslinks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inbox_files_av_status_check" CHECK("inbox_files"."av_status" IN ('scanning','clean','infected','error','unscanned'))
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_empfangen` ON `inbox_files` (`empfangen_at`);--> statement-breakpoint
CREATE INDEX `idx_inbox_av` ON `inbox_files` (`av_status`);--> statement-breakpoint
CREATE INDEX `idx_inbox_token` ON `inbox_files` (`token_id`);--> statement-breakpoint
CREATE TABLE `share_files` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	`bytes_vollstaendig_at` integer,
	`av_status` text NOT NULL,
	`av_geprueft_at` integer,
	FOREIGN KEY (`share_id`) REFERENCES `shares`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "share_files_av_status_check" CHECK("share_files"."av_status" IN ('scanning','clean','infected','error','unscanned'))
);
--> statement-breakpoint
CREATE INDEX `idx_share_files_share` ON `share_files` (`share_id`);--> statement-breakpoint
CREATE INDEX `idx_share_files_av` ON `share_files` (`av_status`);--> statement-breakpoint
CREATE TABLE `shares` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`expires_at` integer NOT NULL,
	`max_downloads` integer,
	`download_count` integer DEFAULT 0 NOT NULL,
	`password_hash` text,
	`total_size` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shares_expires` ON `shares` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_shares_created` ON `shares` (`created_at`);--> statement-breakpoint
CREATE TABLE `zugangslinks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_start` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`budget_dateien` integer NOT NULL,
	`budget_bytes` integer NOT NULL,
	`verbraucht_dateien` integer DEFAULT 0 NOT NULL,
	`verbraucht_bytes` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_zugangslinks_hash` ON `zugangslinks` (`token_hash`);