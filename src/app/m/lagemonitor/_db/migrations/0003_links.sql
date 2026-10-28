-- Links für den Online-Monitor: Tabelle von drizzle-kit, Audit-Trigger von Hand (wie 0001_meldungen.sql).
CREATE TABLE `lagemonitor_link` (
	`id` text PRIMARY KEY NOT NULL,
	`bezeichnung` text NOT NULL,
	`schluessel_hash` text NOT NULL,
	`angelegt_am` integer NOT NULL,
	`angelegt_von` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lagemonitor_link_schluessel_idx` ON `lagemonitor_link` (`schluessel_hash`);
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_link_create AFTER INSERT ON "lagemonitor_link"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'create', 'lagemonitor_link', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_link_update AFTER UPDATE ON "lagemonitor_link"
WHEN OLD."id" IS NOT NEW."id" OR OLD."bezeichnung" IS NOT NEW."bezeichnung" OR OLD."schluessel_hash" IS NOT NEW."schluessel_hash" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_link', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_link_delete AFTER DELETE ON "lagemonitor_link"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'delete', 'lagemonitor_link', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
