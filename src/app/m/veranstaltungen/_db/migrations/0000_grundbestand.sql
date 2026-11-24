-- IDA-415: Grundbestand des Moduls veranstaltungen. Tabellen von drizzle-kit generiert, die Audit-Trigger
-- (create/update/delete, AUDIT_TABLES.veranstaltungen) von Hand angehängt: drizzle-kit kennt sie nicht.
-- Wer eine Spalte ergänzt, setzt den UPDATE-Trigger in derselben Migration neu.
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
CREATE TABLE `veranstaltung` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`art` text NOT NULL,
	`status` text NOT NULL,
	`ort` text DEFAULT '' NOT NULL,
	`veranstalter` text DEFAULT '' NOT NULL,
	`von` integer NOT NULL,
	`bis` integer NOT NULL,
	`bemerkung` text DEFAULT '' NOT NULL,
	`angelegt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	CONSTRAINT "veranstaltung_art" CHECK(art IN ('sanitaetsdienst','betreuung','uebung','sonstiges')),
	CONSTRAINT "veranstaltung_status" CHECK(status IN ('angefragt','zugesagt','abgesagt')),
	CONSTRAINT "veranstaltung_zeitraum" CHECK(bis > von)
);
--> statement-breakpoint
CREATE INDEX `veranstaltung_von_idx` ON `veranstaltung` (`von`);--> statement-breakpoint
CREATE TRIGGER audit_veranstaltung_create AFTER INSERT ON "veranstaltung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'veranstaltungen', 'create', 'veranstaltung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_veranstaltung_update AFTER UPDATE ON "veranstaltung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."art" IS NOT NEW."art" OR OLD."status" IS NOT NEW."status" OR OLD."ort" IS NOT NEW."ort" OR OLD."veranstalter" IS NOT NEW."veranstalter" OR OLD."von" IS NOT NEW."von" OR OLD."bis" IS NOT NEW."bis" OR OLD."bemerkung" IS NOT NEW."bemerkung" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'veranstaltungen', 'update', 'veranstaltung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_veranstaltung_delete AFTER DELETE ON "veranstaltung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'veranstaltungen', 'delete', 'veranstaltung', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
