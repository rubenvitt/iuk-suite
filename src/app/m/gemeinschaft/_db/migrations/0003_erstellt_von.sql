ALTER TABLE `vertragsdokument` ADD `erstellt_von` text;--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_vertragsdokument_update;--> statement-breakpoint
CREATE TRIGGER audit_vertragsdokument_update AFTER UPDATE ON "vertragsdokument"
WHEN OLD."anfrage_id" IS NOT NEW."anfrage_id" OR OLD."art" IS NOT NEW."art" OR OLD."name" IS NOT NEW."name" OR OLD."inhalt" IS NOT NEW."inhalt" OR OLD."felder" IS NOT NEW."felder" OR OLD."werte" IS NOT NEW."werte" OR OLD."version" IS NOT NEW."version" OR OLD."erstellt_am" IS NOT NEW."erstellt_am" OR OLD."erstellt_von" IS NOT NEW."erstellt_von" OR OLD."freigegeben_am" IS NOT NEW."freigegeben_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'vertragsdokument', suite_audit_reference(json_array(NEW.anfrage_id,NEW.art)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
