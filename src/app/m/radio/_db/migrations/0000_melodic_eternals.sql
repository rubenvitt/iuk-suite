CREATE TABLE `device_events` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`changed_by` text,
	`changed_at` integer NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_events_device_id_idx` ON `device_events` (`device_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`rufname` text,
	`issi` text NOT NULL,
	`tei` text,
	`serial_number` text,
	`device_type` text,
	`status` text,
	`location` text,
	`assigned_to` text,
	`software_version` text,
	`last_updated_at` text,
	`notes` text,
	`hiorg_id` text,
	`opta` text,
	`funktion` text,
	`hersteller` text,
	`bedieneinheit` text,
	`device_modes` text,
	`alamos_integrated` integer,
	`loanable` integer,
	`update_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_issi_unique` ON `devices` (`issi`);--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`snapshot_call_sign` text NOT NULL,
	`snapshot_serial_number` text,
	`snapshot_device_type` text,
	`borrower_name` text NOT NULL,
	`borrowed_at` integer NOT NULL,
	`returned_at` integer,
	`return_note` text,
	`zugangscode_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`zugangscode_id`) REFERENCES `zugangscodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `loans_device_id_idx` ON `loans` (`device_id`);--> statement-breakpoint
CREATE INDEX `loans_borrowed_at_idx` ON `loans` (`borrowed_at`);--> statement-breakpoint
CREATE INDEX `loans_returned_at_idx` ON `loans` (`returned_at`);--> statement-breakpoint
CREATE TABLE `software_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_target` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `software_versions_value_unique` ON `software_versions` (`value`);--> statement-breakpoint
CREATE TABLE `users` (
	`sub` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `zugangscodes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`bezeichnung` text NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL,
	`gesperrt_am` integer,
	`gesperrt_von` text,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `zugangscodes_code_unique` ON `zugangscodes` (`code`);