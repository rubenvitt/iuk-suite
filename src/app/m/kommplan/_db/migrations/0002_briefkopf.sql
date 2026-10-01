-- DRK-500, Umsetzungsplan Phase 4, Entscheidung 2: Briefkopf (Spec §4.4).
--
-- TRIGGER HANDGESCHRIEBEN: `drizzle-kit generate` kennt die Audit-Trigger nicht. Das WHEN der
-- Änderung zählt JEDE Spalte auf, auch den Blob — Hochladen, Ersetzen, Entfernen und jede
-- Namensänderung sind je eine Audit-Zeile; ein No-op-Update keine (`catalog.test.ts`).
CREATE TABLE `briefkopf` (
	`id` integer PRIMARY KEY NOT NULL,
	`organisation` text,
	`logo` blob,
	`logo_mime` text,
	`logo_sha256` text,
	`aktualisiert_am` integer NOT NULL,
	`aktualisiert_von` text NOT NULL,
	CONSTRAINT "briefkopf_eine_zeile" CHECK("briefkopf"."id" = 1),
	CONSTRAINT "briefkopf_logo_vollstaendig" CHECK(("briefkopf"."logo" IS NULL AND "briefkopf"."logo_mime" IS NULL AND "briefkopf"."logo_sha256" IS NULL) OR ("briefkopf"."logo" IS NOT NULL AND "briefkopf"."logo_mime" IN ('image/png','image/jpeg','image/webp','image/svg+xml') AND "briefkopf"."logo_sha256" IS NOT NULL)),
	CONSTRAINT "briefkopf_logo_groesse" CHECK("briefkopf"."logo" IS NULL OR length("briefkopf"."logo") <= 1048576)
);
--> statement-breakpoint
CREATE TRIGGER audit_briefkopf_create AFTER INSERT ON "briefkopf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'briefkopf', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_briefkopf_update AFTER UPDATE ON "briefkopf"
WHEN OLD."id" IS NOT NEW."id" OR OLD."organisation" IS NOT NEW."organisation" OR OLD."logo" IS NOT NEW."logo" OR OLD."logo_mime" IS NOT NEW."logo_mime" OR OLD."logo_sha256" IS NOT NEW."logo_sha256" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am" OR OLD."aktualisiert_von" IS NOT NEW."aktualisiert_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'briefkopf', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_briefkopf_delete AFTER DELETE ON "briefkopf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'briefkopf', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
