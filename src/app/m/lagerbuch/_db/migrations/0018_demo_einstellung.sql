-- IDA-224: Schalter des Demo-Checks (an/aus + Vorlage), eine Zeile.
-- Voruebergehend fuer die Kommandositzung am 20.10.2026; Rueckbau IDA-225.
--
-- Kein Fremdschluessel auf `fahrzeug_templates`: das Loeschen einer Vorlage
-- soll nicht an diesem Schalter scheitern. Fehlt die Vorlage, ist die Demo aus.
CREATE TABLE `demo_einstellung` (
	`id` text PRIMARY KEY NOT NULL,
	`aktiv` integer DEFAULT false NOT NULL,
	`template_id` text,
	`geaendert_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER audit_demo_einstellung_create AFTER INSERT ON "demo_einstellung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'create', 'demo_einstellung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_demo_einstellung_update AFTER UPDATE ON "demo_einstellung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."template_id" IS NOT NEW."template_id" OR OLD."geaendert_at" IS NOT NEW."geaendert_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'demo_einstellung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_demo_einstellung_delete AFTER DELETE ON "demo_einstellung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'delete', 'demo_einstellung', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
