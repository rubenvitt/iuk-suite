-- IDA-300: Unterlagen (Kurzanleitung, Handbuch) und Hinweise am Gerät, für den Steckbrief am QR-Code.
-- Der UPDATE-Trigger von `geraet` zählt seine Spalten auf und kommt deshalb mit `hinweise` neu.
CREATE TABLE `unterlage` (
	`id` text PRIMARY KEY NOT NULL,
	`geraet_id` text NOT NULL,
	`titel` text NOT NULL,
	`typ` text NOT NULL,
	`bytes` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`angelegt_am` integer NOT NULL,
	`angelegt_von` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`geraet_id`) REFERENCES `geraet`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "unterlage_typ" CHECK(typ IN ('pdf','bild'))
);
--> statement-breakpoint
CREATE INDEX `unterlage_geraet_idx` ON `unterlage` (`geraet_id`,`position`);--> statement-breakpoint
ALTER TABLE `geraet` ADD `hinweise` text DEFAULT '' NOT NULL;--> statement-breakpoint
DROP TRIGGER `audit_geraet_update`;--> statement-breakpoint
CREATE TRIGGER audit_geraet_update AFTER UPDATE ON "geraet"
WHEN OLD."id" IS NOT NEW."id" OR OLD."gruppe_id" IS NOT NEW."gruppe_id" OR OLD."art_id" IS NOT NEW."art_id" OR OLD."name" IS NOT NEW."name" OR OLD."hersteller" IS NOT NEW."hersteller" OR OLD."typ" IS NOT NEW."typ" OR OLD."seriennr" IS NOT NEW."seriennr" OR OLD."ort_art" IS NOT NEW."ort_art" OR OLD."ort" IS NOT NEW."ort" OR OLD."stunden" IS NOT NEW."stunden" OR OLD."hinweise" IS NOT NEW."hinweise" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'geraet', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_unterlage_create AFTER INSERT ON "unterlage"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'unterlage', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_unterlage_update AFTER UPDATE ON "unterlage"
WHEN OLD."id" IS NOT NEW."id" OR OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."titel" IS NOT NEW."titel" OR OLD."typ" IS NOT NEW."typ" OR OLD."bytes" IS NOT NEW."bytes" OR OLD."position" IS NOT NEW."position" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'unterlage', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_unterlage_delete AFTER DELETE ON "unterlage"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'unterlage', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
