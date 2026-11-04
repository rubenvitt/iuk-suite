CREATE TABLE `vertragsvorlage` (
	`raum` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`groesse` integer NOT NULL,
	`inhalt` blob NOT NULL,
	`sha256` text NOT NULL,
	`feld` text,
	`zeichnen` integer DEFAULT true NOT NULL,
	`abgelegt_am` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `vertragsdatei` ADD `herkunft` text DEFAULT 'leitung' NOT NULL;--> statement-breakpoint
ALTER TABLE `vertragsdatei` ADD `unterschrieben_von` text;--> statement-breakpoint
DROP TRIGGER audit_vertragsdatei_update;--> statement-breakpoint
CREATE TRIGGER audit_vertragsdatei_update AFTER UPDATE ON "vertragsdatei"
WHEN OLD."anfrage_id" IS NOT NEW."anfrage_id" OR OLD."name" IS NOT NEW."name" OR OLD."groesse" IS NOT NEW."groesse" OR OLD."inhalt" IS NOT NEW."inhalt" OR OLD."abgelegt_am" IS NOT NEW."abgelegt_am" OR OLD."herkunft" IS NOT NEW."herkunft" OR OLD."unterschrieben_von" IS NOT NEW."unterschrieben_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'vertragsdatei', suite_audit_reference(NEW.anfrage_id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsvorlage_create AFTER INSERT ON "vertragsvorlage"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'vertragsvorlage', suite_audit_reference(NEW.raum), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsvorlage_update AFTER UPDATE ON "vertragsvorlage"
WHEN OLD."raum" IS NOT NEW."raum" OR OLD."name" IS NOT NEW."name" OR OLD."groesse" IS NOT NEW."groesse" OR OLD."inhalt" IS NOT NEW."inhalt" OR OLD."sha256" IS NOT NEW."sha256" OR OLD."feld" IS NOT NEW."feld" OR OLD."zeichnen" IS NOT NEW."zeichnen" OR OLD."abgelegt_am" IS NOT NEW."abgelegt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'vertragsvorlage', suite_audit_reference(NEW.raum), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsvorlage_delete AFTER DELETE ON "vertragsvorlage"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'vertragsvorlage', suite_audit_reference(OLD.raum), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
