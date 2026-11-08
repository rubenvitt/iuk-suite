-- IDA-369: Prüfarten auf Anlass („vor Verwendung“, „nach Benutzung“) und Checklistenpunkte je Prüfart.
--
-- `pruefart` bekommt `anlass`, und ihr Intervall-CHECK ändert sich; das geht in SQLite nur mit einem Neubau. Der
-- Migrator läuft in einer Transaktion, in der `PRAGMA foreign_keys=OFF` nichts bewirkt: das Löschen der alten
-- Tabelle leert per ON DELETE CASCADE `art_pruefart` und `geraet_pruefart` und setzt im Verlauf `pruefart_id` auf
-- NULL, und ein Umbenennen schriebe die Fremdschlüssel der Kinder mit um (auch mit `legacy_alter_table`). Darum
-- werden die Kinder vorher gesichert und danach zurückgeschrieben. Die Audit-Trigger der betroffenen Tabellen fallen
-- vorher und entstehen danach neu, damit der Umbau nicht als Änderungen im Protokoll steht.
--
-- `eintrag` wird für die neuen Typen `einsatz` und `rueckkehr` neu gebaut wie in 0006; auf ihn zeigt nichts.
DROP TRIGGER `audit_pruefart_create`;--> statement-breakpoint
DROP TRIGGER `audit_pruefart_update`;--> statement-breakpoint
DROP TRIGGER `audit_pruefart_delete`;--> statement-breakpoint
DROP TRIGGER `audit_art_pruefart_create`;--> statement-breakpoint
DROP TRIGGER `audit_art_pruefart_update`;--> statement-breakpoint
DROP TRIGGER `audit_art_pruefart_delete`;--> statement-breakpoint
DROP TRIGGER `audit_geraet_pruefart_create`;--> statement-breakpoint
DROP TRIGGER `audit_geraet_pruefart_update`;--> statement-breakpoint
DROP TRIGGER `audit_geraet_pruefart_delete`;--> statement-breakpoint
DROP TRIGGER `audit_eintrag_create`;--> statement-breakpoint
DROP TRIGGER `audit_eintrag_update`;--> statement-breakpoint
DROP TRIGGER `audit_eintrag_delete`;--> statement-breakpoint
CREATE TABLE `__alt_art_pruefart` AS SELECT art_id, pruefart_id FROM `art_pruefart`;--> statement-breakpoint
CREATE TABLE `__alt_geraet_pruefart` AS SELECT geraet_id, pruefart_id, an, monate, stunden FROM `geraet_pruefart`;--> statement-breakpoint
CREATE TABLE `__alt_eintrag_pruefart` AS SELECT id, pruefart_id FROM `eintrag` WHERE pruefart_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_pruefart` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`wer` text NOT NULL,
	`monate` integer,
	`stunden` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`anlass` text,
	CONSTRAINT "pruefart_wer" CHECK(wer IN ('intern','fachfirma','elektrofachkraft')),
	CONSTRAINT "pruefart_anlass" CHECK(anlass IS NULL OR anlass IN ('einsatz','rueckkehr')),
	CONSTRAINT "pruefart_intervall" CHECK((anlass IS NULL AND ((monate IS NOT NULL AND monate > 0) OR (stunden IS NOT NULL AND stunden > 0))) OR (anlass IS NOT NULL AND monate IS NULL AND stunden IS NULL AND wer = 'intern'))
);
--> statement-breakpoint
INSERT INTO `__new_pruefart`("id", "name", "wer", "monate", "stunden", "position", "anlass") SELECT "id", "name", "wer", "monate", "stunden", "position", NULL FROM `pruefart`;--> statement-breakpoint
DROP TABLE `pruefart`;--> statement-breakpoint
ALTER TABLE `__new_pruefart` RENAME TO `pruefart`;--> statement-breakpoint
INSERT INTO `art_pruefart` (art_id, pruefart_id) SELECT art_id, pruefart_id FROM `__alt_art_pruefart`;--> statement-breakpoint
INSERT INTO `geraet_pruefart` (geraet_id, pruefart_id, an, monate, stunden) SELECT geraet_id, pruefart_id, an, monate, stunden FROM `__alt_geraet_pruefart`;--> statement-breakpoint
DROP TABLE `__alt_art_pruefart`;--> statement-breakpoint
DROP TABLE `__alt_geraet_pruefart`;--> statement-breakpoint
CREATE TABLE `checkpunkt_pruefart` (
	`checkpunkt_id` text NOT NULL,
	`pruefart_id` text NOT NULL,
	PRIMARY KEY(`checkpunkt_id`, `pruefart_id`),
	FOREIGN KEY (`checkpunkt_id`) REFERENCES `checkpunkt`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pruefart_id`) REFERENCES `pruefart`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checkpunkt_pruefart_pruefart_idx` ON `checkpunkt_pruefart` (`pruefart_id`);--> statement-breakpoint
CREATE TABLE `__new_eintrag` (
	`id` text PRIMARY KEY NOT NULL,
	`geraet_id` text NOT NULL,
	`typ` text NOT NULL,
	`pruefart_id` text,
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
	FOREIGN KEY (`pruefart_id`) REFERENCES `pruefart`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "eintrag_typ" CHECK(typ IN ('pruefung','erledigt','stunden','mangel','behoben','einsatz','rueckkehr')),
	CONSTRAINT "eintrag_am" CHECK(am GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "eintrag_ergebnis" CHECK(ergebnis IS NULL OR ergebnis IN ('ok','mangel','defekt'))
);
--> statement-breakpoint
INSERT INTO `__new_eintrag`("id", "geraet_id", "typ", "pruefart_id", "titel", "am", "stunden", "wer", "notiz", "ergebnis", "antworten", "maengel", "angelegt_am")
SELECT e."id", e."geraet_id", e."typ", a."pruefart_id", e."titel", e."am", e."stunden", e."wer", e."notiz", e."ergebnis", e."antworten", e."maengel", e."angelegt_am"
FROM `eintrag` e LEFT JOIN `__alt_eintrag_pruefart` a ON a.id = e.id;
--> statement-breakpoint
DROP TABLE `eintrag`;--> statement-breakpoint
ALTER TABLE `__new_eintrag` RENAME TO `eintrag`;--> statement-breakpoint
DROP TABLE `__alt_eintrag_pruefart`;--> statement-breakpoint
CREATE INDEX `eintrag_geraet_idx` ON `eintrag` (`geraet_id`,`am`);--> statement-breakpoint
CREATE INDEX `eintrag_pruefart_idx` ON `eintrag` (`geraet_id`,`pruefart_id`,`am`);--> statement-breakpoint
CREATE TRIGGER audit_eintrag_create AFTER INSERT ON "eintrag"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'eintrag', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_eintrag_update AFTER UPDATE ON "eintrag"
WHEN OLD."id" IS NOT NEW."id" OR OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."typ" IS NOT NEW."typ" OR OLD."pruefart_id" IS NOT NEW."pruefart_id" OR OLD."titel" IS NOT NEW."titel" OR OLD."am" IS NOT NEW."am" OR OLD."stunden" IS NOT NEW."stunden" OR OLD."wer" IS NOT NEW."wer" OR OLD."notiz" IS NOT NEW."notiz" OR OLD."ergebnis" IS NOT NEW."ergebnis" OR OLD."antworten" IS NOT NEW."antworten" OR OLD."maengel" IS NOT NEW."maengel" OR OLD."angelegt_am" IS NOT NEW."angelegt_am"
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
CREATE TRIGGER audit_pruefart_create AFTER INSERT ON "pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'pruefart', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_pruefart_update AFTER UPDATE ON "pruefart"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."wer" IS NOT NEW."wer" OR OLD."monate" IS NOT NEW."monate" OR OLD."stunden" IS NOT NEW."stunden" OR OLD."position" IS NOT NEW."position" OR OLD."anlass" IS NOT NEW."anlass"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'pruefart', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_pruefart_delete AFTER DELETE ON "pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'pruefart', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_art_pruefart_create AFTER INSERT ON "art_pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'art_pruefart', suite_audit_reference(json_array(NEW.art_id,NEW.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_art_pruefart_update AFTER UPDATE ON "art_pruefart"
WHEN OLD."art_id" IS NOT NEW."art_id" OR OLD."pruefart_id" IS NOT NEW."pruefart_id"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'art_pruefart', suite_audit_reference(json_array(NEW.art_id,NEW.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_art_pruefart_delete AFTER DELETE ON "art_pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'art_pruefart', suite_audit_reference(json_array(OLD.art_id,OLD.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_geraet_pruefart_create AFTER INSERT ON "geraet_pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'geraet_pruefart', suite_audit_reference(json_array(NEW.geraet_id,NEW.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_geraet_pruefart_update AFTER UPDATE ON "geraet_pruefart"
WHEN OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."pruefart_id" IS NOT NEW."pruefart_id" OR OLD."an" IS NOT NEW."an" OR OLD."monate" IS NOT NEW."monate" OR OLD."stunden" IS NOT NEW."stunden"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'geraet_pruefart', suite_audit_reference(json_array(NEW.geraet_id,NEW.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_geraet_pruefart_delete AFTER DELETE ON "geraet_pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'geraet_pruefart', suite_audit_reference(json_array(OLD.geraet_id,OLD.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_checkpunkt_pruefart_create AFTER INSERT ON "checkpunkt_pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'checkpunkt_pruefart', suite_audit_reference(json_array(NEW.checkpunkt_id,NEW.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_checkpunkt_pruefart_update AFTER UPDATE ON "checkpunkt_pruefart"
WHEN OLD."checkpunkt_id" IS NOT NEW."checkpunkt_id" OR OLD."pruefart_id" IS NOT NEW."pruefart_id"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'checkpunkt_pruefart', suite_audit_reference(json_array(NEW.checkpunkt_id,NEW.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_checkpunkt_pruefart_delete AFTER DELETE ON "checkpunkt_pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'checkpunkt_pruefart', suite_audit_reference(json_array(OLD.checkpunkt_id,OLD.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
