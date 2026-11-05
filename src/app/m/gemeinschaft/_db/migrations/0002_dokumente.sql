CREATE TABLE `vertragsdokument` (
	`anfrage_id` text NOT NULL,
	`art` text NOT NULL,
	`name` text NOT NULL,
	`inhalt` blob NOT NULL,
	`felder` text DEFAULT '[]' NOT NULL,
	`werte` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`erstellt_am` integer NOT NULL,
	`freigegeben_am` integer,
	PRIMARY KEY(`anfrage_id`, `art`),
	FOREIGN KEY (`anfrage_id`) REFERENCES `anfrage`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "vertragsdokument_art" CHECK(art IN ('mietvertrag','uebergabe','rueckgabe'))
);
--> statement-breakpoint
CREATE TABLE `vertragsunterschrift` (
	`anfrage_id` text NOT NULL,
	`art` text NOT NULL,
	`feld_id` text NOT NULL,
	`rolle` text NOT NULL,
	`name` text NOT NULL,
	`am` integer NOT NULL,
	`bild` blob NOT NULL,
	PRIMARY KEY(`anfrage_id`, `art`, `feld_id`),
	FOREIGN KEY (`anfrage_id`,`art`) REFERENCES `vertragsdokument`(`anfrage_id`,`art`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "vertragsunterschrift_rolle" CHECK(rolle IN ('leitung','mieter'))
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vertragsdatei` (
	`anfrage_id` text NOT NULL,
	`art` text DEFAULT 'mietvertrag' NOT NULL,
	`name` text NOT NULL,
	`groesse` integer NOT NULL,
	`inhalt` blob NOT NULL,
	`abgelegt_am` integer NOT NULL,
	`herkunft` text DEFAULT 'leitung' NOT NULL,
	`unterschrieben_von` text,
	PRIMARY KEY(`anfrage_id`, `art`),
	FOREIGN KEY (`anfrage_id`) REFERENCES `anfrage`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "vertragsdatei_art" CHECK(art IN ('mietvertrag','uebergabe','rueckgabe'))
);
--> statement-breakpoint
INSERT INTO `__new_vertragsdatei`("anfrage_id", "art", "name", "groesse", "inhalt", "abgelegt_am", "herkunft", "unterschrieben_von") SELECT "anfrage_id", 'mietvertrag', "name", "groesse", "inhalt", "abgelegt_am", "herkunft", "unterschrieben_von" FROM `vertragsdatei`;--> statement-breakpoint
DROP TABLE `vertragsdatei`;--> statement-breakpoint
ALTER TABLE `__new_vertragsdatei` RENAME TO `vertragsdatei`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_vertragsvorlage` (
	`raum` text NOT NULL,
	`art` text DEFAULT 'mietvertrag' NOT NULL,
	`name` text NOT NULL,
	`groesse` integer NOT NULL,
	`inhalt` blob NOT NULL,
	`sha256` text NOT NULL,
	`felder` text DEFAULT '[]' NOT NULL,
	`zeichnen` integer DEFAULT true NOT NULL,
	`abgelegt_am` integer NOT NULL,
	PRIMARY KEY(`raum`, `art`),
	CONSTRAINT "vertragsvorlage_art" CHECK(art IN ('mietvertrag','uebergabe','rueckgabe'))
);
--> statement-breakpoint
INSERT INTO `__new_vertragsvorlage`("raum", "art", "name", "groesse", "inhalt", "sha256", "felder", "zeichnen", "abgelegt_am") SELECT "raum", 'mietvertrag', "name", "groesse", "inhalt", "sha256",
  CASE WHEN "feld" IS NULL OR json_valid("feld") = 0 THEN '[]' ELSE json_array(json_object(
    'id', 'g:unterschrift', 'art', 'unterschrift', 'name', 'Unterschrift', 'quelle', 'gezogen', 'rolle', 'mieter',
    'seite', json_extract("feld", '$.seite'), 'x', json_extract("feld", '$.x'), 'y', json_extract("feld", '$.y'),
    'b', json_extract("feld", '$.b'), 'h', json_extract("feld", '$.h'))) END,
  "zeichnen", "abgelegt_am" FROM `vertragsvorlage`;--> statement-breakpoint
DROP TABLE `vertragsvorlage`;--> statement-breakpoint
ALTER TABLE `__new_vertragsvorlage` RENAME TO `vertragsvorlage`;--> statement-breakpoint
-- IDA-354: Zusagen, deren Mietvertrag schon auf der Statusseite steht („verschickt“, noch nichts abgelegt), bekommen
-- ihn als freigegebenes Dokument, damit die Statusseite nur noch einen Weg kennt. Vor den Triggern: keine Audit-Zeile.
INSERT INTO `vertragsdokument`("anfrage_id", "art", "name", "inhalt", "felder", "werte", "version", "erstellt_am", "freigegeben_am")
SELECT a."id", 'mietvertrag', v."name", v."inhalt", v."felder", '{}', 1, v."abgelegt_am", v."abgelegt_am"
FROM `anfrage` a JOIN `vertragsvorlage` v ON v."raum" = a."raum" AND v."art" = 'mietvertrag'
WHERE a."status" = 'zugesagt' AND a."vertrag" = 'verschickt'
  AND NOT EXISTS (SELECT 1 FROM `vertragsdatei` d WHERE d."anfrage_id" = a."id");--> statement-breakpoint
CREATE TRIGGER audit_vertragsdatei_create AFTER INSERT ON "vertragsdatei"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'vertragsdatei', suite_audit_reference(json_array(NEW.anfrage_id,NEW.art)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsdatei_update AFTER UPDATE ON "vertragsdatei"
WHEN OLD."anfrage_id" IS NOT NEW."anfrage_id" OR OLD."art" IS NOT NEW."art" OR OLD."name" IS NOT NEW."name" OR OLD."groesse" IS NOT NEW."groesse" OR OLD."inhalt" IS NOT NEW."inhalt" OR OLD."abgelegt_am" IS NOT NEW."abgelegt_am" OR OLD."herkunft" IS NOT NEW."herkunft" OR OLD."unterschrieben_von" IS NOT NEW."unterschrieben_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'vertragsdatei', suite_audit_reference(json_array(NEW.anfrage_id,NEW.art)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsdatei_delete AFTER DELETE ON "vertragsdatei"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'vertragsdatei', suite_audit_reference(json_array(OLD.anfrage_id,OLD.art)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsvorlage_create AFTER INSERT ON "vertragsvorlage"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'vertragsvorlage', suite_audit_reference(json_array(NEW.raum,NEW.art)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsvorlage_update AFTER UPDATE ON "vertragsvorlage"
WHEN OLD."raum" IS NOT NEW."raum" OR OLD."art" IS NOT NEW."art" OR OLD."name" IS NOT NEW."name" OR OLD."groesse" IS NOT NEW."groesse" OR OLD."inhalt" IS NOT NEW."inhalt" OR OLD."sha256" IS NOT NEW."sha256" OR OLD."felder" IS NOT NEW."felder" OR OLD."zeichnen" IS NOT NEW."zeichnen" OR OLD."abgelegt_am" IS NOT NEW."abgelegt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'vertragsvorlage', suite_audit_reference(json_array(NEW.raum,NEW.art)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsvorlage_delete AFTER DELETE ON "vertragsvorlage"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'vertragsvorlage', suite_audit_reference(json_array(OLD.raum,OLD.art)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsdokument_create AFTER INSERT ON "vertragsdokument"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'vertragsdokument', suite_audit_reference(json_array(NEW.anfrage_id,NEW.art)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsdokument_update AFTER UPDATE ON "vertragsdokument"
WHEN OLD."anfrage_id" IS NOT NEW."anfrage_id" OR OLD."art" IS NOT NEW."art" OR OLD."name" IS NOT NEW."name" OR OLD."inhalt" IS NOT NEW."inhalt" OR OLD."felder" IS NOT NEW."felder" OR OLD."werte" IS NOT NEW."werte" OR OLD."version" IS NOT NEW."version" OR OLD."erstellt_am" IS NOT NEW."erstellt_am" OR OLD."freigegeben_am" IS NOT NEW."freigegeben_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'vertragsdokument', suite_audit_reference(json_array(NEW.anfrage_id,NEW.art)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsdokument_delete AFTER DELETE ON "vertragsdokument"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'vertragsdokument', suite_audit_reference(json_array(OLD.anfrage_id,OLD.art)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsunterschrift_create AFTER INSERT ON "vertragsunterschrift"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'vertragsunterschrift', suite_audit_reference(json_array(NEW.anfrage_id,NEW.art,NEW.feld_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsunterschrift_update AFTER UPDATE ON "vertragsunterschrift"
WHEN OLD."anfrage_id" IS NOT NEW."anfrage_id" OR OLD."art" IS NOT NEW."art" OR OLD."feld_id" IS NOT NEW."feld_id" OR OLD."rolle" IS NOT NEW."rolle" OR OLD."name" IS NOT NEW."name" OR OLD."am" IS NOT NEW."am" OR OLD."bild" IS NOT NEW."bild"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'vertragsunterschrift', suite_audit_reference(json_array(NEW.anfrage_id,NEW.art,NEW.feld_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsunterschrift_delete AFTER DELETE ON "vertragsunterschrift"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'vertragsunterschrift', suite_audit_reference(json_array(OLD.anfrage_id,OLD.art,OLD.feld_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
