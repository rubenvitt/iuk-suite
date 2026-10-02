-- Löschen ohne Archiv: ein Plan, der jünger als eine Stunde ist, darf gleich gelöscht werden
-- (`_lib/planverwaltung.ts`, `loescheOhneArchiv`). Dafür braucht es den Anlagezeitpunkt.
--
-- 1. `erstellt_am` (generiert): OHNE Rückfüllung. Vorhandene Pläne behalten NULL = „Anlage unbekannt", und
--    unbekannt ist nie frisch. `aktualisiert_am` taugt nicht als Ersatz: es ist nur eine obere Schranke — jeder
--    Plan, der in der Stunde vor dem Einspielen bearbeitet wurde, wäre sonst ohne Archiv löschbar geworden.
-- 2. `audit_plan_update` (HANDGESCHRIEBEN, Vorbild 0001): `drizzle-kit generate` kennt die Audit-Trigger nicht.
--    Das WHEN zählt die Spalten einzeln auf (`core/audit/catalog.test.ts`); `erstellt_am` kommt dazu. Kein Weg
--    ändert die Spalte nach dem Anlegen — täte es einer, entschiede er über das Löschen und gehört ins Audit.
ALTER TABLE `plan` ADD `erstellt_am` integer;
--> statement-breakpoint
DROP TRIGGER audit_plan_update;
--> statement-breakpoint
CREATE TRIGGER audit_plan_update AFTER UPDATE ON "plan"
WHEN OLD."id" IS NOT NEW."id" OR OLD."titel" IS NOT NEW."titel" OR OLD."typ" IS NOT NEW."typ" OR OLD."anlass" IS NOT NEW."anlass" OR OLD."datum" IS NOT NEW."datum" OR OLD."ist_vorlage" IS NOT NEW."ist_vorlage" OR OLD."archiviert_am" IS NOT NEW."archiviert_am" OR OLD."erstellt_am" IS NOT NEW."erstellt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'plan', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
