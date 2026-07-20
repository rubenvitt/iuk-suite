CREATE TABLE `presets` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`icon` text,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	CONSTRAINT "presets_kind_check" CHECK("presets"."kind" IN ('url','wifi','tel','vcard','text'))
);
--> statement-breakpoint
CREATE INDEX `idx_presets_sort` ON `presets` (`sort_order`,`label`);