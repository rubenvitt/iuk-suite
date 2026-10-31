CREATE TABLE `faelligkeiten_abos` (
	`person_id` text PRIMARY KEY NOT NULL,
	`thema` text NOT NULL,
	`push` integer DEFAULT true NOT NULL,
	`abgewaehlt` text NOT NULL,
	`gruppen` text NOT NULL,
	`gesendete_woche` text,
	`erstellt_am` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `faelligkeiten_abos_thema_unique` ON `faelligkeiten_abos` (`thema`);--> statement-breakpoint
CREATE TRIGGER audit_faelligkeiten_abos_create AFTER INSERT ON "faelligkeiten_abos"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'portal', 'create', 'faelligkeiten_abos', suite_audit_reference(NEW.person_id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_faelligkeiten_abos_update AFTER UPDATE ON "faelligkeiten_abos"
WHEN OLD."person_id" IS NOT NEW."person_id" OR OLD."thema" IS NOT NEW."thema" OR OLD."push" IS NOT NEW."push" OR OLD."abgewaehlt" IS NOT NEW."abgewaehlt" OR OLD."erstellt_am" IS NOT NEW."erstellt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'portal', 'update', 'faelligkeiten_abos', suite_audit_reference(NEW.person_id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_faelligkeiten_abos_delete AFTER DELETE ON "faelligkeiten_abos"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'portal', 'delete', 'faelligkeiten_abos', suite_audit_reference(OLD.person_id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
