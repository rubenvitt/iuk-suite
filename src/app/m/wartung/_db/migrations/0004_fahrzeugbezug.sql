-- IDA-342: Verweis auf das Stammfahrzeug der Fahrzeugverwaltung. Der UPDATE-Trigger von `geraet` zählt seine
-- Spalten auf und kommt deshalb mit `fahrzeug_id` neu.
ALTER TABLE `geraet` ADD `fahrzeug_id` text;--> statement-breakpoint
DROP TRIGGER `audit_geraet_update`;--> statement-breakpoint
CREATE TRIGGER audit_geraet_update AFTER UPDATE ON "geraet"
WHEN OLD."id" IS NOT NEW."id" OR OLD."gruppe_id" IS NOT NEW."gruppe_id" OR OLD."art_id" IS NOT NEW."art_id" OR OLD."name" IS NOT NEW."name" OR OLD."hersteller" IS NOT NEW."hersteller" OR OLD."typ" IS NOT NEW."typ" OR OLD."seriennr" IS NOT NEW."seriennr" OR OLD."ort_art" IS NOT NEW."ort_art" OR OLD."ort" IS NOT NEW."ort" OR OLD."fahrzeug_id" IS NOT NEW."fahrzeug_id" OR OLD."stunden" IS NOT NEW."stunden" OR OLD."hinweise" IS NOT NEW."hinweise" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'geraet', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
