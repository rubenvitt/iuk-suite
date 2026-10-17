-- IDA-222: Plomben einer Einheit (Medizinkoffer, Notfallrucksack …).
--
-- Der Kurzcheck liest eine Plombe ab, statt den Inhalt des Behaelters zu
-- zaehlen; der Vollcheck setzt sie neu. `nummer`/`gesetzt_at` sind der
-- IST-ZUSTAND und werden ueberschrieben — was bei welchem Check abgelesen oder
-- gesetzt wurde, steht im `checks.ergebnis` dieses Checks.
--
-- Stammdaten, also kein append-only, aber mit Audit wie jede Tabelle.
CREATE TABLE `plomben` (
	`id` text PRIMARY KEY NOT NULL,
	`lagerort_id` text NOT NULL,
	`bezeichnung` text NOT NULL,
	`fach_label` text,
	`nummer` text,
	`gesetzt_at` integer,
	`aktiv` integer DEFAULT true NOT NULL,
	`sortierung` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lagerort_id`) REFERENCES `lagerorte`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_plomben_lagerort` ON `plomben` (`lagerort_id`);
--> statement-breakpoint
CREATE TRIGGER audit_plomben_create AFTER INSERT ON "plomben"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'create', 'plomben', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plomben_update AFTER UPDATE ON "plomben"
WHEN OLD."id" IS NOT NEW."id" OR OLD."lagerort_id" IS NOT NEW."lagerort_id" OR OLD."bezeichnung" IS NOT NEW."bezeichnung" OR OLD."fach_label" IS NOT NEW."fach_label" OR OLD."nummer" IS NOT NEW."nummer" OR OLD."gesetzt_at" IS NOT NEW."gesetzt_at" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."sortierung" IS NOT NEW."sortierung" OR OLD."created_at" IS NOT NEW."created_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'plomben', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plomben_delete AFTER DELETE ON "plomben"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'delete', 'plomben', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
