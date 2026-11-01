-- Planbare Meldungen: „Anzeigen ab“ an der Meldung, „verschwindet nach der Uhrzeit“ an der Kategorie.
-- Spalten von drizzle-kit, Vorgaben und Trigger von Hand (wie 0005_kartenzoom.sql). Die Vorgaben stehen
-- zwischen DROP und CREATE des Kategorie-Triggers, damit die Migration keine Audit-Zeilen ohne Akteur schreibt.
ALTER TABLE `lagemonitor_kategorie` ADD `verschwinden_minuten` integer;
--> statement-breakpoint
ALTER TABLE `lagemonitor_meldung` ADD `anzeigen_ab` integer;
--> statement-breakpoint
DROP TRIGGER audit_lagemonitor_kategorie_update;
--> statement-breakpoint
UPDATE `lagemonitor_kategorie` SET `verschwinden_minuten` = 15 WHERE `id` IN ('lagemeldung', 'meldung', 'besprechung', 'abloesung', 'verpflegung');
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_kategorie_update AFTER UPDATE ON "lagemonitor_kategorie"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."zeichen" IS NOT NEW."zeichen" OR OLD."farbe" IS NOT NEW."farbe" OR OLD."vorlauf_minuten" IS NOT NEW."vorlauf_minuten" OR OLD."reihenfolge" IS NOT NEW."reihenfolge" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."verschwinden_minuten" IS NOT NEW."verschwinden_minuten"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_kategorie', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
DROP TRIGGER audit_lagemonitor_meldung_update;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_meldung_update AFTER UPDATE ON "lagemonitor_meldung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."text" IS NOT NEW."text" OR OLD."zeitpunkt" IS NOT NEW."zeitpunkt" OR OLD."ablauf_am" IS NOT NEW."ablauf_am" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von" OR OLD."kategorie_id" IS NOT NEW."kategorie_id" OR OLD."anzeigen_ab" IS NOT NEW."anzeigen_ab"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_meldung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
