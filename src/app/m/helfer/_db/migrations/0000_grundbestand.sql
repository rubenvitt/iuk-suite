-- IDA-249: Grundbestand des Moduls helfer. Tabellen von drizzle-kit generiert, die Audit-Trigger
-- (je audited Tabelle create/update/delete, AUDIT_TABLES.helfer) von Hand angehängt: drizzle-kit
-- kennt sie nicht. Wer eine Spalte ergänzt, setzt den UPDATE-Trigger in derselben Migration neu.
CREATE TABLE `anmeldevorgang` (
	`state` text PRIMARY KEY NOT NULL,
	`verifier` text NOT NULL,
	`sub` text NOT NULL,
	`ablauf` integer NOT NULL
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
CREATE TABLE `einstellung` (
	`schluessel` text PRIMARY KEY NOT NULL,
	`wert` text NOT NULL,
	CONSTRAINT "einstellung_wert_json" CHECK(json_valid(wert))
);
--> statement-breakpoint
CREATE TABLE `helfer` (
	`id` text PRIMARY KEY NOT NULL,
	`herkunft` text NOT NULL,
	`quell_id` text NOT NULL,
	`vorname` text NOT NULL,
	`nachname` text NOT NULL,
	`status` text NOT NULL,
	`gruppen` text DEFAULT '[]' NOT NULL,
	`qualifikationen` text DEFAULT '[]' NOT NULL,
	`fuer_einsatzbuch` integer DEFAULT true NOT NULL,
	`importiert_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	CONSTRAINT "helfer_herkunft" CHECK(herkunft IN ('hiorg','demo')),
	CONSTRAINT "helfer_gruppen_json" CHECK(json_valid(gruppen)),
	CONSTRAINT "helfer_qualifikationen_json" CHECK(json_valid(qualifikationen))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `helfer_quelle_idx` ON `helfer` (`herkunft`,`quell_id`);--> statement-breakpoint
CREATE TABLE `hiorg_verbindung` (
	`id` integer PRIMARY KEY NOT NULL,
	`konto_name` text NOT NULL,
	`verbunden_von` text NOT NULL,
	`verbunden_von_sub` text NOT NULL,
	`verbunden_am` integer NOT NULL,
	`refresh_token` text NOT NULL,
	`erneuert_am` integer NOT NULL,
	CONSTRAINT "hiorg_verbindung_einzig" CHECK(id = 1)
);
--> statement-breakpoint
CREATE TABLE `importlauf` (
	`id` text PRIMARY KEY NOT NULL,
	`zeitpunkt` integer NOT NULL,
	`quelle` text NOT NULL,
	`von_name` text NOT NULL,
	`von_sub` text NOT NULL,
	`gelesen` integer NOT NULL,
	`neu` integer NOT NULL,
	`geaendert` integer NOT NULL,
	`entfernt` integer NOT NULL,
	`ausgefiltert` text DEFAULT '{}' NOT NULL,
	CONSTRAINT "importlauf_quelle" CHECK(quelle IN ('hiorg','demo')),
	CONSTRAINT "importlauf_ausgefiltert_json" CHECK(json_valid(ausgefiltert))
);
--> statement-breakpoint
CREATE TRIGGER audit_einstellung_create AFTER INSERT ON "einstellung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'create', 'einstellung', suite_audit_reference(NEW.schluessel), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_einstellung_update AFTER UPDATE ON "einstellung"
WHEN OLD."schluessel" IS NOT NEW."schluessel" OR OLD."wert" IS NOT NEW."wert"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'update', 'einstellung', suite_audit_reference(NEW.schluessel), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_einstellung_delete AFTER DELETE ON "einstellung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'delete', 'einstellung', suite_audit_reference(OLD.schluessel), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_helfer_create AFTER INSERT ON "helfer"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'create', 'helfer', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_helfer_update AFTER UPDATE ON "helfer"
WHEN OLD."id" IS NOT NEW."id" OR OLD."herkunft" IS NOT NEW."herkunft" OR OLD."quell_id" IS NOT NEW."quell_id" OR OLD."vorname" IS NOT NEW."vorname" OR OLD."nachname" IS NOT NEW."nachname" OR OLD."status" IS NOT NEW."status" OR OLD."gruppen" IS NOT NEW."gruppen" OR OLD."qualifikationen" IS NOT NEW."qualifikationen" OR OLD."fuer_einsatzbuch" IS NOT NEW."fuer_einsatzbuch" OR OLD."importiert_am" IS NOT NEW."importiert_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'update', 'helfer', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_helfer_delete AFTER DELETE ON "helfer"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'delete', 'helfer', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_hiorg_verbindung_create AFTER INSERT ON "hiorg_verbindung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'create', 'hiorg_verbindung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_hiorg_verbindung_update AFTER UPDATE ON "hiorg_verbindung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."konto_name" IS NOT NEW."konto_name" OR OLD."verbunden_von" IS NOT NEW."verbunden_von" OR OLD."verbunden_von_sub" IS NOT NEW."verbunden_von_sub" OR OLD."verbunden_am" IS NOT NEW."verbunden_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'update', 'hiorg_verbindung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_hiorg_verbindung_delete AFTER DELETE ON "hiorg_verbindung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'delete', 'hiorg_verbindung', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_importlauf_create AFTER INSERT ON "importlauf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'create', 'importlauf', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_importlauf_update AFTER UPDATE ON "importlauf"
WHEN OLD."id" IS NOT NEW."id" OR OLD."zeitpunkt" IS NOT NEW."zeitpunkt" OR OLD."quelle" IS NOT NEW."quelle" OR OLD."von_name" IS NOT NEW."von_name" OR OLD."von_sub" IS NOT NEW."von_sub" OR OLD."gelesen" IS NOT NEW."gelesen" OR OLD."neu" IS NOT NEW."neu" OR OLD."geaendert" IS NOT NEW."geaendert" OR OLD."entfernt" IS NOT NEW."entfernt" OR OLD."ausgefiltert" IS NOT NEW."ausgefiltert"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'update', 'importlauf', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_importlauf_delete AFTER DELETE ON "importlauf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'delete', 'importlauf', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
