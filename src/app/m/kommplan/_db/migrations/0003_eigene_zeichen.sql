-- Eigene Zeichen aus dem Baukasten (Bibliothek, Reiter „Zeichen"): nur die Zusammenstellung, gezeichnet wird
-- beim Abruf. TRIGGER HANDGESCHRIEBEN wie in 0002: `drizzle-kit generate` kennt die Audit-Trigger nicht; das WHEN
-- der Änderung zählt jede Spalte auf (`catalog.test.ts`).
CREATE TABLE `eigenes_zeichen` (
	`id` text PRIMARY KEY NOT NULL,
	`titel` text NOT NULL,
	`spec` text NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	`aktualisiert_von` text NOT NULL,
	CONSTRAINT "eigenes_zeichen_spec_json" CHECK(json_valid("eigenes_zeichen"."spec") AND length("eigenes_zeichen"."spec") <= 4000)
);
--> statement-breakpoint
CREATE TRIGGER audit_eigenes_zeichen_create AFTER INSERT ON "eigenes_zeichen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'eigenes_zeichen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_eigenes_zeichen_update AFTER UPDATE ON "eigenes_zeichen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."titel" IS NOT NEW."titel" OR OLD."spec" IS NOT NEW."spec" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am" OR OLD."aktualisiert_von" IS NOT NEW."aktualisiert_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'eigenes_zeichen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_eigenes_zeichen_delete AFTER DELETE ON "eigenes_zeichen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'eigenes_zeichen', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
