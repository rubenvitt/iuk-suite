-- IDA-312: Grundbestand des Moduls wartung (Gerätewartung). Tabellen von drizzle-kit generiert, die Audit-Trigger
-- (je audited Tabelle create/update/delete, AUDIT_TABLES.wartung) von Hand angehängt: drizzle-kit kennt sie nicht.
-- Wer eine Spalte ergänzt, setzt den UPDATE-Trigger in derselben Migration neu.
CREATE TABLE `art` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`einzahl` text NOT NULL,
	`ikone` text DEFAULT 'wrench' NOT NULL,
	`stunden_pflicht` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`angelegt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`module` text NOT NULL,
	`action` text NOT NULL,
	`object_type` text NOT NULL,
	`object_ref` text,
	`actor` text NOT NULL,
	`result` text NOT NULL,
	`origin` text NOT NULL,
	`correlation_id` text,
	CONSTRAINT "audit_outbox_actor_json" CHECK(json_valid("audit_outbox"."actor"))
);
--> statement-breakpoint
CREATE INDEX `audit_outbox_occurred_idx` ON `audit_outbox` (`occurred_at`,`id`);--> statement-breakpoint
CREATE TABLE `checkpunkt` (
	`id` text PRIMARY KEY NOT NULL,
	`art_id` text NOT NULL,
	`text` text NOT NULL,
	`hinweis` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`art_id`) REFERENCES `art`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checkpunkt_art_idx` ON `checkpunkt` (`art_id`,`position`);--> statement-breakpoint
CREATE TABLE `eintrag` (
	`id` text PRIMARY KEY NOT NULL,
	`geraet_id` text NOT NULL,
	`typ` text NOT NULL,
	`frist_id` text,
	`titel` text NOT NULL,
	`am` text NOT NULL,
	`stunden` integer,
	`wer` text DEFAULT '' NOT NULL,
	`notiz` text DEFAULT '' NOT NULL,
	`ergebnis` text,
	`antworten` text,
	`maengel` integer DEFAULT 0 NOT NULL,
	`angelegt_am` integer NOT NULL,
	FOREIGN KEY (`geraet_id`) REFERENCES `geraet`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`frist_id`) REFERENCES `frist`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "eintrag_typ" CHECK(typ IN ('pruefung','erledigt','stunden','mangel','behoben')),
	CONSTRAINT "eintrag_am" CHECK(am GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "eintrag_ergebnis" CHECK(ergebnis IS NULL OR ergebnis IN ('ok','mangel','defekt'))
);
--> statement-breakpoint
CREATE INDEX `eintrag_geraet_idx` ON `eintrag` (`geraet_id`,`am`);--> statement-breakpoint
CREATE INDEX `eintrag_frist_idx` ON `eintrag` (`geraet_id`,`frist_id`,`am`);--> statement-breakpoint
CREATE TABLE `frist` (
	`id` text PRIMARY KEY NOT NULL,
	`art_id` text NOT NULL,
	`name` text NOT NULL,
	`wer` text NOT NULL,
	`monate` integer,
	`stunden` integer,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`art_id`) REFERENCES `art`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "frist_wer" CHECK(wer IN ('intern','fachfirma','elektrofachkraft')),
	CONSTRAINT "frist_intervall" CHECK((monate IS NOT NULL AND monate > 0) OR (stunden IS NOT NULL AND stunden > 0))
);
--> statement-breakpoint
CREATE INDEX `frist_art_idx` ON `frist` (`art_id`,`position`);--> statement-breakpoint
CREATE TABLE `geraet` (
	`id` text PRIMARY KEY NOT NULL,
	`gruppe_id` text NOT NULL,
	`art_id` text NOT NULL,
	`name` text NOT NULL,
	`hersteller` text DEFAULT '' NOT NULL,
	`typ` text DEFAULT '' NOT NULL,
	`seriennr` text DEFAULT '' NOT NULL,
	`ort_art` text NOT NULL,
	`ort` text NOT NULL,
	`stunden` integer,
	`aktiv` integer DEFAULT true NOT NULL,
	`angelegt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	FOREIGN KEY (`gruppe_id`) REFERENCES `gruppe`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`art_id`) REFERENCES `art`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "geraet_ort_art" CHECK(ort_art IN ('lager','fahrzeug')),
	CONSTRAINT "geraet_stunden" CHECK(stunden IS NULL OR stunden >= 0)
);
--> statement-breakpoint
CREATE INDEX `geraet_gruppe_idx` ON `geraet` (`gruppe_id`);--> statement-breakpoint
CREATE INDEX `geraet_art_idx` ON `geraet` (`art_id`);--> statement-breakpoint
CREATE TABLE `gruppe` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pocket_gruppe` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`angelegt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gruppe_pocket_idx` ON `gruppe` (`pocket_gruppe`);--> statement-breakpoint
CREATE TABLE `mangel` (
	`id` text PRIMARY KEY NOT NULL,
	`geraet_id` text NOT NULL,
	`text` text NOT NULL,
	`foto` integer DEFAULT false NOT NULL,
	`einsatzbereit` integer NOT NULL,
	`gemeldet_am` integer NOT NULL,
	`gemeldet_von` text DEFAULT '' NOT NULL,
	`behoben_am` integer,
	`behoben_von` text,
	`gepusht_am` integer,
	FOREIGN KEY (`geraet_id`) REFERENCES `geraet`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mangel_geraet_idx` ON `mangel` (`geraet_id`,`behoben_am`);--> statement-breakpoint
CREATE INDEX `mangel_offen_idx` ON `mangel` (`behoben_am`,`gemeldet_am`);--> statement-breakpoint
CREATE TRIGGER audit_gruppe_create AFTER INSERT ON "gruppe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'gruppe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_gruppe_update AFTER UPDATE ON "gruppe"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."pocket_gruppe" IS NOT NEW."pocket_gruppe" OR OLD."position" IS NOT NEW."position" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'gruppe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_gruppe_delete AFTER DELETE ON "gruppe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'gruppe', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_art_create AFTER INSERT ON "art"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'art', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_art_update AFTER UPDATE ON "art"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."einzahl" IS NOT NEW."einzahl" OR OLD."ikone" IS NOT NEW."ikone" OR OLD."stunden_pflicht" IS NOT NEW."stunden_pflicht" OR OLD."position" IS NOT NEW."position" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'art', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_art_delete AFTER DELETE ON "art"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'art', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_frist_create AFTER INSERT ON "frist"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'frist', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_frist_update AFTER UPDATE ON "frist"
WHEN OLD."id" IS NOT NEW."id" OR OLD."art_id" IS NOT NEW."art_id" OR OLD."name" IS NOT NEW."name" OR OLD."wer" IS NOT NEW."wer" OR OLD."monate" IS NOT NEW."monate" OR OLD."stunden" IS NOT NEW."stunden" OR OLD."position" IS NOT NEW."position"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'frist', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_frist_delete AFTER DELETE ON "frist"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'frist', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_checkpunkt_create AFTER INSERT ON "checkpunkt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'checkpunkt', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_checkpunkt_update AFTER UPDATE ON "checkpunkt"
WHEN OLD."id" IS NOT NEW."id" OR OLD."art_id" IS NOT NEW."art_id" OR OLD."text" IS NOT NEW."text" OR OLD."hinweis" IS NOT NEW."hinweis" OR OLD."position" IS NOT NEW."position"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'checkpunkt', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_checkpunkt_delete AFTER DELETE ON "checkpunkt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'checkpunkt', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_geraet_create AFTER INSERT ON "geraet"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'geraet', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_geraet_update AFTER UPDATE ON "geraet"
WHEN OLD."id" IS NOT NEW."id" OR OLD."gruppe_id" IS NOT NEW."gruppe_id" OR OLD."art_id" IS NOT NEW."art_id" OR OLD."name" IS NOT NEW."name" OR OLD."hersteller" IS NOT NEW."hersteller" OR OLD."typ" IS NOT NEW."typ" OR OLD."seriennr" IS NOT NEW."seriennr" OR OLD."ort_art" IS NOT NEW."ort_art" OR OLD."ort" IS NOT NEW."ort" OR OLD."stunden" IS NOT NEW."stunden" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'geraet', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_geraet_delete AFTER DELETE ON "geraet"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'geraet', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_eintrag_create AFTER INSERT ON "eintrag"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'eintrag', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_eintrag_update AFTER UPDATE ON "eintrag"
WHEN OLD."id" IS NOT NEW."id" OR OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."typ" IS NOT NEW."typ" OR OLD."frist_id" IS NOT NEW."frist_id" OR OLD."titel" IS NOT NEW."titel" OR OLD."am" IS NOT NEW."am" OR OLD."stunden" IS NOT NEW."stunden" OR OLD."wer" IS NOT NEW."wer" OR OLD."notiz" IS NOT NEW."notiz" OR OLD."ergebnis" IS NOT NEW."ergebnis" OR OLD."antworten" IS NOT NEW."antworten" OR OLD."maengel" IS NOT NEW."maengel" OR OLD."angelegt_am" IS NOT NEW."angelegt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'eintrag', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_eintrag_delete AFTER DELETE ON "eintrag"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'eintrag', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_mangel_create AFTER INSERT ON "mangel"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'mangel', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_mangel_update AFTER UPDATE ON "mangel"
WHEN OLD."id" IS NOT NEW."id" OR OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."text" IS NOT NEW."text" OR OLD."foto" IS NOT NEW."foto" OR OLD."einsatzbereit" IS NOT NEW."einsatzbereit" OR OLD."gemeldet_am" IS NOT NEW."gemeldet_am" OR OLD."gemeldet_von" IS NOT NEW."gemeldet_von" OR OLD."behoben_am" IS NOT NEW."behoben_am" OR OLD."behoben_von" IS NOT NEW."behoben_von" OR OLD."gepusht_am" IS NOT NEW."gepusht_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'mangel', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_mangel_delete AFTER DELETE ON "mangel"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'mangel', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
