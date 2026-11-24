-- IDA-415/IDA-416: Verweis einer Planung auf ihre Veranstaltung (Modul veranstaltungen) und auf einen
-- Einsatz in Lifeline Hub. Der UPDATE-Trigger kommt mit den neuen Spalten neu (catalog.test.ts),
-- weiterhin ohne `aktualisiert_am` (0001).
ALTER TABLE `planung` ADD `veranstaltung_id` text;--> statement-breakpoint
ALTER TABLE `planung` ADD `einsatz_system` text;--> statement-breakpoint
ALTER TABLE `planung` ADD `einsatz_id` text;--> statement-breakpoint
ALTER TABLE `planung` ADD `einsatz_adresse` text;--> statement-breakpoint
DROP TRIGGER audit_planung_update;
--> statement-breakpoint
CREATE TRIGGER audit_planung_update AFTER UPDATE ON "planung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."art" IS NOT NEW."art" OR OLD."ort" IS NOT NEW."ort" OR OLD."von" IS NOT NEW."von" OR OLD."bis" IS NOT NEW."bis" OR OLD."max_dienst_min" IS NOT NEW."max_dienst_min" OR OLD."min_ruhe_min" IS NOT NEW."min_ruhe_min" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."veranstaltung_id" IS NOT NEW."veranstaltung_id" OR OLD."einsatz_system" IS NOT NEW."einsatz_system" OR OLD."einsatz_id" IS NOT NEW."einsatz_id" OR OLD."einsatz_adresse" IS NOT NEW."einsatz_adresse"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'update', 'planung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
