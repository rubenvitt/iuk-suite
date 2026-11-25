-- LLH-1194: Zugänge, mit denen Lifeline Hub Personal und Qualifikationen abholt. Nur der SHA-256 des Schlüssels.
CREATE TABLE `helfer_zugang` (
	`id` text PRIMARY KEY NOT NULL,
	`bezeichnung` text NOT NULL,
	`schluessel_hash` text NOT NULL,
	`angelegt_am` integer NOT NULL,
	`angelegt_von` text NOT NULL,
	`zuletzt_abgeholt_am` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `helfer_zugang_schluessel_idx` ON `helfer_zugang` (`schluessel_hash`);--> statement-breakpoint
CREATE TRIGGER audit_helfer_zugang_create AFTER INSERT ON "helfer_zugang"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'create', 'helfer_zugang', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_helfer_zugang_update AFTER UPDATE ON "helfer_zugang"
WHEN OLD."id" IS NOT NEW."id" OR OLD."bezeichnung" IS NOT NEW."bezeichnung" OR OLD."schluessel_hash" IS NOT NEW."schluessel_hash" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'update', 'helfer_zugang', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_helfer_zugang_delete AFTER DELETE ON "helfer_zugang"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'helfer', 'delete', 'helfer_zugang', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
