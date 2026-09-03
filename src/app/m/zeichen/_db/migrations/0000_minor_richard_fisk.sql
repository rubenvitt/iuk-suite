CREATE TABLE `eigene_zeichen` (
	`id` text PRIMARY KEY NOT NULL,
	`sub` text NOT NULL,
	`name` text NOT NULL,
	`spec_json` text NOT NULL,
	`spec_kanon` text NOT NULL,
	`svg_zwischenspeicher` text NOT NULL,
	`paket_version` text NOT NULL,
	`daten_version` text NOT NULL,
	`erstellt_am` integer NOT NULL,
	`geaendert_am` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eigene_zeichen_sub_name_idx` ON `eigene_zeichen` (`sub`,`name`);--> statement-breakpoint
CREATE INDEX `eigene_zeichen_sub_kanon_idx` ON `eigene_zeichen` (`sub`,`spec_kanon`);--> statement-breakpoint
CREATE TABLE `lernset_zeichen` (
	`lernset_id` text NOT NULL,
	`zeichen_id` text NOT NULL,
	`titel_schnappschuss` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`lernset_id`, `zeichen_id`),
	FOREIGN KEY (`lernset_id`) REFERENCES `lernsets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lernset_zeichen_pos_idx` ON `lernset_zeichen` (`lernset_id`,`position`);--> statement-breakpoint
CREATE TABLE `lernsets` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`titel` text NOT NULL,
	`beschreibung` text,
	`aktiv` integer DEFAULT false NOT NULL,
	`sortierung` integer DEFAULT 0 NOT NULL,
	`erstellt_von` text NOT NULL,
	`erstellt_am` integer NOT NULL,
	`geaendert_am` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lernsets_slug_idx` ON `lernsets` (`slug`);--> statement-breakpoint
CREATE TABLE `lernstand` (
	`sub` text NOT NULL,
	`zeichen_id` text NOT NULL,
	`stufe` integer DEFAULT 0 NOT NULL,
	`faellig_am` text NOT NULL,
	`richtig` integer DEFAULT 0 NOT NULL,
	`falsch` integer DEFAULT 0 NOT NULL,
	`letzte_antwort_am` integer,
	`erstellt_am` integer NOT NULL,
	PRIMARY KEY(`sub`, `zeichen_id`),
	CONSTRAINT "lernstand_stufe_check" CHECK("lernstand"."stufe" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE INDEX `lernstand_faellig_idx` ON `lernstand` (`sub`,`faellig_am`);--> statement-breakpoint
CREATE TABLE `merkliste` (
	`sub` text NOT NULL,
	`zeichen_id` text NOT NULL,
	`titel_schnappschuss` text NOT NULL,
	`erstellt_am` integer NOT NULL,
	PRIMARY KEY(`sub`, `zeichen_id`)
);
