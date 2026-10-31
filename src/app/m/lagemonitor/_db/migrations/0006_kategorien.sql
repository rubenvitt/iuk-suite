-- Meldekategorien: Tabelle und Spalte von drizzle-kit, Vorgaben und Audit-Trigger von Hand (wie 0001_meldungen.sql).
-- Die Vorgaben stehen vor den Triggern, damit die Migration keine Audit-Zeilen ohne Akteur schreibt.
CREATE TABLE `lagemonitor_kategorie` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`zeichen` text NOT NULL,
	`farbe` text NOT NULL,
	`vorlauf_minuten` integer,
	`reihenfolge` integer NOT NULL,
	`angelegt_am` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `lagemonitor_meldung` ADD `kategorie_id` text REFERENCES lagemonitor_kategorie(id) ON DELETE set null;
--> statement-breakpoint
INSERT INTO `lagemonitor_kategorie` (`id`, `name`, `zeichen`, `farbe`, `vorlauf_minuten`, `reihenfolge`, `angelegt_am`) VALUES
  ('lagemeldung', 'Lagemeldung', 'clipboard', 'blau', 5, 1, CAST(strftime('%s', 'now') AS integer)),
  ('meldung', 'Meldung', 'info', 'grau', 5, 2, CAST(strftime('%s', 'now') AS integer)),
  ('besprechung', 'Besprechung', 'meeting', 'violett', 10, 3, CAST(strftime('%s', 'now') AS integer)),
  ('abloesung', 'Ablösung', 'swap', 'gruen', 15, 4, CAST(strftime('%s', 'now') AS integer)),
  ('verpflegung', 'Verpflegung', 'cutlery', 'orange', 5, 5, CAST(strftime('%s', 'now') AS integer));
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_kategorie_create AFTER INSERT ON "lagemonitor_kategorie"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'create', 'lagemonitor_kategorie', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_kategorie_update AFTER UPDATE ON "lagemonitor_kategorie"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."zeichen" IS NOT NEW."zeichen" OR OLD."farbe" IS NOT NEW."farbe" OR OLD."vorlauf_minuten" IS NOT NEW."vorlauf_minuten" OR OLD."reihenfolge" IS NOT NEW."reihenfolge" OR OLD."angelegt_am" IS NOT NEW."angelegt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_kategorie', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_kategorie_delete AFTER DELETE ON "lagemonitor_kategorie"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'delete', 'lagemonitor_kategorie', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
DROP TRIGGER audit_lagemonitor_meldung_update;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_meldung_update AFTER UPDATE ON "lagemonitor_meldung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."text" IS NOT NEW."text" OR OLD."zeitpunkt" IS NOT NEW."zeitpunkt" OR OLD."ablauf_am" IS NOT NEW."ablauf_am" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von" OR OLD."kategorie_id" IS NOT NEW."kategorie_id"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_meldung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
