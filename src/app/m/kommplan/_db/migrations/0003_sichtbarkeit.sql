-- Persönliche Pläne, Sichtbarkeit und eingeladene Bearbeitende (`_lib/rechte.ts`).
--
-- HANDGESCHRIEBEN, NICHT GENERIERT (Vorbild feedback/_db/migrations/0003_evenings_status.sql):
-- `drizzle-kit generate` wollte `plan` neu aufbauen — das hätte die drei Audit-Trigger mitgerissen und
-- an den Fremdschlüsseln aus `plan_freigabe` und `plan_bearbeitung` gescheitert. Die CHECK-Klauseln
-- stehen deshalb an der Spalte: SQLite nimmt sie bei ADD COLUMN an und erzwingt sie ab sofort; eine
-- Spalten-CHECK darf eine andere Spalte nennen.
--
-- BESTAND WIRD GETEILT, NICHT PRIVAT: jeder heute vorhandene Plan ist für alle mit Zugang sichtbar, und
-- ein Eigentümer ist nicht bekannt (`aktualisiert_von` ist ein Anzeigename, keine Kennung). Privat wäre
-- ein Plan, den niemand mehr sieht. Neue Pläne legt der Code ausdrücklich als `privat` an.
ALTER TABLE `plan` ADD `eigentuemer` text;--> statement-breakpoint
ALTER TABLE `plan` ADD `sichtbarkeit` text DEFAULT 'organisation' NOT NULL CHECK (`sichtbarkeit` IN ('privat','organisation') AND (`sichtbarkeit` <> 'privat' OR `eigentuemer` IS NOT NULL));--> statement-breakpoint
-- Der Update-Trigger zählt seine Spalten auf (0001): ohne die zwei neuen liefe ein Teilen still am Audit vorbei.
DROP TRIGGER audit_plan_update;--> statement-breakpoint
CREATE TRIGGER audit_plan_update AFTER UPDATE ON "plan"
WHEN OLD."id" IS NOT NEW."id" OR OLD."titel" IS NOT NEW."titel" OR OLD."typ" IS NOT NEW."typ" OR OLD."anlass" IS NOT NEW."anlass" OR OLD."datum" IS NOT NEW."datum" OR OLD."ist_vorlage" IS NOT NEW."ist_vorlage" OR OLD."archiviert_am" IS NOT NEW."archiviert_am" OR OLD."eigentuemer" IS NOT NEW."eigentuemer" OR OLD."sichtbarkeit" IS NOT NEW."sichtbarkeit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'plan', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE INDEX `plan_eigentuemer_idx` ON `plan` (`eigentuemer`);--> statement-breakpoint
CREATE TABLE `plan_mitglied` (
	`plan_id` text NOT NULL,
	`nutzer` text NOT NULL,
	`name` text NOT NULL,
	`eingeladen_am` integer NOT NULL,
	`eingeladen_von` text NOT NULL,
	PRIMARY KEY(`plan_id`, `nutzer`),
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_mitglied_nutzer_idx` ON `plan_mitglied` (`nutzer`);--> statement-breakpoint
CREATE TRIGGER audit_plan_mitglied_create AFTER INSERT ON "plan_mitglied"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'plan_mitglied', suite_audit_reference(json_array(NEW.plan_id,NEW.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_mitglied_update AFTER UPDATE ON "plan_mitglied"
WHEN OLD."plan_id" IS NOT NEW."plan_id" OR OLD."nutzer" IS NOT NEW."nutzer" OR OLD."name" IS NOT NEW."name" OR OLD."eingeladen_am" IS NOT NEW."eingeladen_am" OR OLD."eingeladen_von" IS NOT NEW."eingeladen_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'plan_mitglied', suite_audit_reference(json_array(NEW.plan_id,NEW.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_mitglied_delete AFTER DELETE ON "plan_mitglied"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'plan_mitglied', suite_audit_reference(json_array(OLD.plan_id,OLD.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TABLE `kommplan_person` (
	`nutzer` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
