-- Meldungsband: Tabelle von drizzle-kit, Audit-Trigger von Hand (wie 0000_grundbestand.sql).
CREATE TABLE `lagemonitor_meldung` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`zeitpunkt` integer,
	`ablauf_am` integer NOT NULL,
	`angelegt_am` integer NOT NULL,
	`angelegt_von` text NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_meldung_create AFTER INSERT ON "lagemonitor_meldung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'create', 'lagemonitor_meldung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_meldung_update AFTER UPDATE ON "lagemonitor_meldung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."text" IS NOT NEW."text" OR OLD."zeitpunkt" IS NOT NEW."zeitpunkt" OR OLD."ablauf_am" IS NOT NEW."ablauf_am" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_meldung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_meldung_delete AFTER DELETE ON "lagemonitor_meldung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'delete', 'lagemonitor_meldung', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
