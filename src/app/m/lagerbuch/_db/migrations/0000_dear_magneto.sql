CREATE TABLE `artikel` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`einheit` text NOT NULL,
	`fach` text NOT NULL,
	`mindestbestand` integer DEFAULT 0 NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL,
	`bestellt_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `buchungen` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`typ` text NOT NULL,
	`artikel_id` text NOT NULL,
	`charge_id` text NOT NULL,
	`lagerort_id` text NOT NULL,
	`menge` integer NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	`referenz` text,
	`kommentar` text,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`charge_id`) REFERENCES `chargen`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_buchungen_artikel` ON `buchungen` (`artikel_id`);--> statement-breakpoint
CREATE INDEX `idx_buchungen_charge` ON `buchungen` (`charge_id`);--> statement-breakpoint
CREATE INDEX `idx_buchungen_ts` ON `buchungen` (`ts`);--> statement-breakpoint
CREATE INDEX `idx_buchungen_ts_id` ON `buchungen` (`ts`,`id`);--> statement-breakpoint
CREATE INDEX `idx_buchungen_lagerort_artikel` ON `buchungen` (`lagerort_id`,`artikel_id`);--> statement-breakpoint
CREATE INDEX `idx_buchungen_artikel_lagerort_charge` ON `buchungen` (`artikel_id`,`lagerort_id`,`charge_id`);--> statement-breakpoint
CREATE TABLE `bz_geraete` (
	`id` text PRIMARY KEY NOT NULL,
	`barcode` text,
	`name` text NOT NULL,
	`lagerort_id` text NOT NULL,
	`streifen_lot` text,
	`level1_label` text,
	`level1_min` integer,
	`level1_max` integer,
	`level2_label` text,
	`level2_min` integer,
	`level2_max` integer,
	`aktiv` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bz_geraete_barcode_unique` ON `bz_geraete` (`barcode`);--> statement-breakpoint
CREATE INDEX `idx_bz_geraete_lagerort` ON `bz_geraete` (`lagerort_id`);--> statement-breakpoint
CREATE TABLE `bz_kontrollen` (
	`id` text PRIMARY KEY NOT NULL,
	`geraet_id` text NOT NULL,
	`ts` integer NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	`level1_wert` integer,
	`level1_im_bereich` integer,
	`level2_wert` integer,
	`level2_im_bereich` integer,
	`kompresse_verfall` text,
	`sticks` integer DEFAULT 0 NOT NULL,
	`lanzetten` integer DEFAULT 0 NOT NULL,
	`batterie_gewechselt` integer DEFAULT false NOT NULL,
	`kommentar` text,
	`bestanden` integer NOT NULL,
	`ref_snapshot` text,
	FOREIGN KEY (`geraet_id`) REFERENCES `bz_geraete`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bz_kontrollen_geraet_ts` ON `bz_kontrollen` (`geraet_id`,`ts`);--> statement-breakpoint
CREATE TABLE `chargen` (
	`id` text PRIMARY KEY NOT NULL,
	`artikel_id` text NOT NULL,
	`chargen_nr` text NOT NULL,
	`verfall` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chargen_artikel_verfall` ON `chargen` (`artikel_id`,`verfall`);--> statement-breakpoint
CREATE TABLE `checks` (
	`id` text PRIMARY KEY NOT NULL,
	`fahrzeug_id` text NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`ergebnis` text,
	FOREIGN KEY (`fahrzeug_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_checks_fahrzeug_completed` ON `checks` (`fahrzeug_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `fahrzeug_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `geraete` (
	`id` text PRIMARY KEY NOT NULL,
	`typ` text NOT NULL,
	`barcode` text,
	`name` text NOT NULL,
	`lagerort_id` text NOT NULL,
	`anmerkung` text,
	`mtk_faellig` text,
	`beschreibung` text,
	`ablaufdatum` text,
	`aktiv` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `geraete_barcode_unique` ON `geraete` (`barcode`);--> statement-breakpoint
CREATE INDEX `idx_geraete_lagerort` ON `geraete` (`lagerort_id`);--> statement-breakpoint
CREATE TABLE `lagerort_verfall` (
	`id` text PRIMARY KEY NOT NULL,
	`lagerort_id` text NOT NULL,
	`artikel_id` text NOT NULL,
	`verfall` text NOT NULL,
	`erfasst_at` integer NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	FOREIGN KEY (`lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_lagerort_verfall_ort_artikel` ON `lagerort_verfall` (`lagerort_id`,`artikel_id`);--> statement-breakpoint
CREATE TABLE `lagerorte` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`typ` text NOT NULL,
	`kennung` text,
	`aktiv` integer DEFAULT true NOT NULL,
	`template_id` text,
	FOREIGN KEY (`template_id`) REFERENCES `fahrzeug_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `o2_flaschen` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`lagerort_id` text NOT NULL,
	`groesse_liter` integer,
	`nennfuelldruck_bar` integer DEFAULT 200 NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_o2_flaschen_lagerort` ON `o2_flaschen` (`lagerort_id`);--> statement-breakpoint
CREATE TABLE `o2_messungen` (
	`id` text PRIMARY KEY NOT NULL,
	`flasche_id` text NOT NULL,
	`ts` integer NOT NULL,
	`druck_bar` integer NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	`kommentar` text,
	FOREIGN KEY (`flasche_id`) REFERENCES `o2_flaschen`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_o2_messungen_flasche_ts` ON `o2_messungen` (`flasche_id`,`ts`);--> statement-breakpoint
CREATE TABLE `soll_positionen` (
	`id` text PRIMARY KEY NOT NULL,
	`fahrzeug_id` text NOT NULL,
	`fach_label` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`artikel_id` text NOT NULL,
	`soll` integer NOT NULL,
	`template_position_id` text,
	`ueberschrieben` integer DEFAULT false NOT NULL,
	`entfernt` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`fahrzeug_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_position_id`) REFERENCES `template_positionen`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_soll_fahrzeug` ON `soll_positionen` (`fahrzeug_id`);--> statement-breakpoint
CREATE TABLE `template_positionen` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`fach_label` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`artikel_id` text NOT NULL,
	`soll` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `fahrzeug_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_template_pos_template` ON `template_positionen` (`template_id`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`scope_lagerort_id` text,
	`ziel_typ` text,
	`ziel_id` text,
	`aktiv` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`scope_lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_code_unique` ON `tokens` (`code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`last_login_at` integer
);
