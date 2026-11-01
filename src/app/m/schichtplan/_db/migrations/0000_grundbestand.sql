-- IDA-313: Grundbestand des Moduls schichtplan. Tabellen von drizzle-kit generiert, die Audit-Trigger
-- (je audited Tabelle create/update/delete, AUDIT_TABLES.schichtplan) von Hand angehängt: drizzle-kit
-- kennt sie nicht. Wer eine Spalte ergänzt, setzt den UPDATE-Trigger in derselben Migration neu.
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
CREATE TABLE `einheit` (
	`id` text PRIMARY KEY NOT NULL,
	`planung_id` text NOT NULL,
	`art` text NOT NULL,
	`name` text NOT NULL,
	`fahrzeug_id` text,
	`kenner` text,
	`schicht_min` integer NOT NULL,
	`soll` integer NOT NULL,
	`anforderungen` text DEFAULT '[]' NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`planung_id`) REFERENCES `planung`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "einheit_art" CHECK(art IN ('abschnitt','fahrzeug')),
	CONSTRAINT "einheit_anforderungen_json" CHECK(json_valid(anforderungen))
);
--> statement-breakpoint
CREATE INDEX `einheit_planung_idx` ON `einheit` (`planung_id`,`position`);--> statement-breakpoint
CREATE TABLE `planung` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`art` text NOT NULL,
	`ort` text DEFAULT '' NOT NULL,
	`von` integer NOT NULL,
	`bis` integer NOT NULL,
	`max_dienst_min` integer DEFAULT 720 NOT NULL,
	`min_ruhe_min` integer DEFAULT 480 NOT NULL,
	`angelegt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	CONSTRAINT "planung_art" CHECK(art IN ('veranstaltung','lage')),
	CONSTRAINT "planung_zeitraum" CHECK(bis > von)
);
--> statement-breakpoint
CREATE TABLE `schicht` (
	`id` text PRIMARY KEY NOT NULL,
	`einheit_id` text NOT NULL,
	`von` integer NOT NULL,
	`bis` integer NOT NULL,
	FOREIGN KEY (`einheit_id`) REFERENCES `einheit`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "schicht_dauer" CHECK(bis > von)
);
--> statement-breakpoint
CREATE INDEX `schicht_einheit_idx` ON `schicht` (`einheit_id`,`von`);--> statement-breakpoint
CREATE TABLE `temp_helfer` (
	`id` text PRIMARY KEY NOT NULL,
	`planung_id` text NOT NULL,
	`vorname` text NOT NULL,
	`nachname` text NOT NULL,
	`telefon` text DEFAULT '' NOT NULL,
	`organisation` text DEFAULT '' NOT NULL,
	`qualifikationen` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`planung_id`) REFERENCES `planung`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "temp_helfer_qualifikationen_json" CHECK(json_valid(qualifikationen))
);
--> statement-breakpoint
CREATE INDEX `temp_helfer_planung_idx` ON `temp_helfer` (`planung_id`);--> statement-breakpoint
CREATE TABLE `zuordnung` (
	`schicht_id` text NOT NULL,
	`quelle` text NOT NULL,
	`helfer_id` text NOT NULL,
	PRIMARY KEY(`schicht_id`, `quelle`, `helfer_id`),
	FOREIGN KEY (`schicht_id`) REFERENCES `schicht`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "zuordnung_quelle" CHECK(quelle IN ('stamm','temp'))
);
--> statement-breakpoint
CREATE INDEX `zuordnung_helfer_idx` ON `zuordnung` (`quelle`,`helfer_id`);--> statement-breakpoint
CREATE TRIGGER audit_planung_create AFTER INSERT ON "planung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'create', 'planung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_planung_update AFTER UPDATE ON "planung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."art" IS NOT NEW."art" OR OLD."ort" IS NOT NEW."ort" OR OLD."von" IS NOT NEW."von" OR OLD."bis" IS NOT NEW."bis" OR OLD."max_dienst_min" IS NOT NEW."max_dienst_min" OR OLD."min_ruhe_min" IS NOT NEW."min_ruhe_min" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'update', 'planung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_planung_delete AFTER DELETE ON "planung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'delete', 'planung', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_einheit_create AFTER INSERT ON "einheit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'create', 'einheit', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_einheit_update AFTER UPDATE ON "einheit"
WHEN OLD."id" IS NOT NEW."id" OR OLD."planung_id" IS NOT NEW."planung_id" OR OLD."art" IS NOT NEW."art" OR OLD."name" IS NOT NEW."name" OR OLD."fahrzeug_id" IS NOT NEW."fahrzeug_id" OR OLD."kenner" IS NOT NEW."kenner" OR OLD."schicht_min" IS NOT NEW."schicht_min" OR OLD."soll" IS NOT NEW."soll" OR OLD."anforderungen" IS NOT NEW."anforderungen" OR OLD."position" IS NOT NEW."position"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'update', 'einheit', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_einheit_delete AFTER DELETE ON "einheit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'delete', 'einheit', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_schicht_create AFTER INSERT ON "schicht"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'create', 'schicht', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_schicht_update AFTER UPDATE ON "schicht"
WHEN OLD."id" IS NOT NEW."id" OR OLD."einheit_id" IS NOT NEW."einheit_id" OR OLD."von" IS NOT NEW."von" OR OLD."bis" IS NOT NEW."bis"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'update', 'schicht', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_schicht_delete AFTER DELETE ON "schicht"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'delete', 'schicht', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_temp_helfer_create AFTER INSERT ON "temp_helfer"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'create', 'temp_helfer', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_temp_helfer_update AFTER UPDATE ON "temp_helfer"
WHEN OLD."id" IS NOT NEW."id" OR OLD."planung_id" IS NOT NEW."planung_id" OR OLD."vorname" IS NOT NEW."vorname" OR OLD."nachname" IS NOT NEW."nachname" OR OLD."telefon" IS NOT NEW."telefon" OR OLD."organisation" IS NOT NEW."organisation" OR OLD."qualifikationen" IS NOT NEW."qualifikationen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'update', 'temp_helfer', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_temp_helfer_delete AFTER DELETE ON "temp_helfer"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'delete', 'temp_helfer', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zuordnung_create AFTER INSERT ON "zuordnung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'create', 'zuordnung', suite_audit_reference(json_array(NEW.schicht_id,NEW.quelle,NEW.helfer_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zuordnung_update AFTER UPDATE ON "zuordnung"
WHEN OLD."schicht_id" IS NOT NEW."schicht_id" OR OLD."quelle" IS NOT NEW."quelle" OR OLD."helfer_id" IS NOT NEW."helfer_id"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'update', 'zuordnung', suite_audit_reference(json_array(NEW.schicht_id,NEW.quelle,NEW.helfer_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zuordnung_delete AFTER DELETE ON "zuordnung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'delete', 'zuordnung', suite_audit_reference(json_array(OLD.schicht_id,OLD.quelle,OLD.helfer_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
