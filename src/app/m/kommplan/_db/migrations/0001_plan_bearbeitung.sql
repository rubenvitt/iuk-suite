-- DRK-500, Umsetzungsplan Phase 2, Entscheidung 1: gebündeltes Audit der Inhaltsänderungen.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT (Vorbild lagerbuch/_db/migrations/0005_artikel_kategorie.sql):
-- `drizzle-kit generate` kennt die Audit-Trigger nicht. Es erzeugte nur die Tabelle.
--
-- 1. `audit_plan_update` wird neu gesetzt: sein WHEN zählt die Spalten einzeln auf und lässt jetzt
--    `inhalt`, `version`, `aktualisiert_am`, `aktualisiert_von` aus (im Katalog `core/audit/catalog.ts`
--    als `unauditedColumns` begründet). Titel, Art, Anlass, Datum, Vorlage und Archiv bleiben je
--    Änderung eine Audit-Zeile.
-- 2. `plan_bearbeitung` bekommt die drei üblichen Trigger. Ihr Verweis ist das Paar (Plan, Person)
--    wie bei `feedback.user_groups`.
CREATE TABLE `plan_bearbeitung` (
	`plan_id` text NOT NULL,
	`nutzer` text NOT NULL,
	`seit` integer NOT NULL,
	PRIMARY KEY(`plan_id`, `nutzer`),
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TRIGGER audit_plan_update;
--> statement-breakpoint
CREATE TRIGGER audit_plan_update AFTER UPDATE ON "plan"
WHEN OLD."id" IS NOT NEW."id" OR OLD."titel" IS NOT NEW."titel" OR OLD."typ" IS NOT NEW."typ" OR OLD."anlass" IS NOT NEW."anlass" OR OLD."datum" IS NOT NEW."datum" OR OLD."ist_vorlage" IS NOT NEW."ist_vorlage" OR OLD."archiviert_am" IS NOT NEW."archiviert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'plan', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_bearbeitung_create AFTER INSERT ON "plan_bearbeitung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'plan_bearbeitung', suite_audit_reference(json_array(NEW.plan_id,NEW.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_bearbeitung_update AFTER UPDATE ON "plan_bearbeitung"
WHEN OLD."plan_id" IS NOT NEW."plan_id" OR OLD."nutzer" IS NOT NEW."nutzer" OR OLD."seit" IS NOT NEW."seit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'plan_bearbeitung', suite_audit_reference(json_array(NEW.plan_id,NEW.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_bearbeitung_delete AFTER DELETE ON "plan_bearbeitung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'plan_bearbeitung', suite_audit_reference(json_array(OLD.plan_id,OLD.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
