CREATE TABLE `aufgaben` (
	`id` text PRIMARY KEY NOT NULL,
	`titel` text NOT NULL,
	`beschreibung` text NOT NULL,
	`prioritaet` text NOT NULL,
	`ersteller_id` text NOT NULL,
	`zugewiesen_an` text,
	`status` text NOT NULL,
	`faellig_am` text NOT NULL,
	`faellig_uhrzeit` text,
	`dauer_minuten` integer NOT NULL,
	`nachweis_pflicht` integer DEFAULT false NOT NULL,
	`nachweis_art` text DEFAULT 'text' NOT NULL,
	`pruefer_id` text,
	`ist_selbst` integer DEFAULT false NOT NULL,
	`plan_datum` text,
	`plan_uhrzeit` text,
	`plan_rang` integer DEFAULT 0 NOT NULL,
	`vorschlag_datum` text,
	`vorschlag_uhrzeit` text,
	`erstellt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	FOREIGN KEY (`ersteller_id`) REFERENCES `personen`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`zugewiesen_an`) REFERENCES `personen`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pruefer_id`) REFERENCES `personen`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `aufgaben_plan_idx` ON `aufgaben` (`zugewiesen_an`,`plan_datum`);--> statement-breakpoint
CREATE INDEX `aufgaben_status_idx` ON `aufgaben` (`status`);--> statement-breakpoint
CREATE INDEX `aufgaben_faellig_idx` ON `aufgaben` (`faellig_am`);--> statement-breakpoint
CREATE TABLE `dateien` (
	`id` text PRIMARY KEY NOT NULL,
	`aufgabe_id` text NOT NULL,
	`dateiname` text NOT NULL,
	`mime` text NOT NULL,
	`groesse` integer NOT NULL,
	`scan_status` text DEFAULT 'offen' NOT NULL,
	`scan_geprueft_am` integer,
	`erstellt_am` integer NOT NULL,
	FOREIGN KEY (`aufgabe_id`) REFERENCES `aufgaben`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `nachweise` (
	`id` text PRIMARY KEY NOT NULL,
	`aufgabe_id` text NOT NULL,
	`art` text NOT NULL,
	`text` text,
	`datei_id` text,
	`erstellt_von` text NOT NULL,
	`erstellt_am` integer NOT NULL,
	FOREIGN KEY (`aufgabe_id`) REFERENCES `aufgaben`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`datei_id`) REFERENCES `dateien`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`erstellt_von`) REFERENCES `personen`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `nachweise_aufgabe_idx` ON `nachweise` (`aufgabe_id`);--> statement-breakpoint
CREATE TABLE `personen` (
	`id` text PRIMARY KEY NOT NULL,
	`sub` text NOT NULL,
	`name` text NOT NULL,
	`initialen` text NOT NULL,
	`rolle` text NOT NULL,
	`soll_minuten_tag` integer DEFAULT 468 NOT NULL,
	`aktiv_von` text NOT NULL,
	`aktiv_bis` text,
	`erstellt_am` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personen_sub_idx` ON `personen` (`sub`);--> statement-breakpoint
CREATE TABLE `routinen` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`titel` text NOT NULL,
	`wochentage` integer NOT NULL,
	`uhrzeit` text,
	`dauer_minuten` integer NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL,
	`erstellt_am` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `personen`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `routinen_person_idx` ON `routinen` (`person_id`);--> statement-breakpoint
CREATE TABLE `verlauf` (
	`id` text PRIMARY KEY NOT NULL,
	`aufgabe_id` text NOT NULL,
	`ereignis` text NOT NULL,
	`akteur_id` text NOT NULL,
	`notiz` text,
	`ts` integer NOT NULL,
	FOREIGN KEY (`aufgabe_id`) REFERENCES `aufgaben`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`akteur_id`) REFERENCES `personen`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `verlauf_aufgabe_idx` ON `verlauf` (`aufgabe_id`,`ts`);