-- LLH-2097: Abruf-Zugänge, mit denen Lifeline Hub die Veranstaltungen abholt. Audit-Trigger von Hand;
-- `zuletzt_abgeholt_am` ist ausgenommen (AUDIT_TABLES.veranstaltungen.veranstaltung_zugang).
CREATE TABLE `veranstaltung_zugang` (
	`id` text PRIMARY KEY NOT NULL,
	`bezeichnung` text NOT NULL,
	`schluessel_hash` text NOT NULL,
	`angelegt_am` integer NOT NULL,
	`angelegt_von` text NOT NULL,
	`zuletzt_abgeholt_am` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `veranstaltung_zugang_schluessel_idx` ON `veranstaltung_zugang` (`schluessel_hash`);--> statement-breakpoint
CREATE TRIGGER audit_veranstaltung_zugang_create AFTER INSERT ON "veranstaltung_zugang"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'veranstaltungen', 'create', 'veranstaltung_zugang', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_veranstaltung_zugang_update AFTER UPDATE ON "veranstaltung_zugang"
WHEN OLD."id" IS NOT NEW."id" OR OLD."bezeichnung" IS NOT NEW."bezeichnung" OR OLD."schluessel_hash" IS NOT NEW."schluessel_hash" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'veranstaltungen', 'update', 'veranstaltung_zugang', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_veranstaltung_zugang_delete AFTER DELETE ON "veranstaltung_zugang"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'veranstaltungen', 'delete', 'veranstaltung_zugang', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
