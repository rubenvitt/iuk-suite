-- IDA-258: der Verweis einer Einheit auf ihr Stammfahrzeug in der Fahrzeugverwaltung (Modul
-- fahrzeuge). Gesetzt nur bei Fahrzeugen, nie bei Taschen; kein Fremdschluessel, weil die
-- Stammdaten in einer anderen Datenbank leben. Eindeutig, solange gesetzt: zwei Einheiten fuer
-- ein Fahrzeug waeren zwei Sollbestaende fuer ein Auto.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT (vgl. Kopf von 0005).
ALTER TABLE `lagerorte` ADD `stamm_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_lagerorte_stamm` ON `lagerorte` (`stamm_id`) WHERE "lagerorte"."stamm_id" is not null;
--> statement-breakpoint
-- DER UPDATE-TRIGGER WIRD NEU GESETZT (wie in 0010): sein WHEN zaehlt jede Spalte einzeln auf, und
-- eine fehlende Spalte ist eine Aenderung, die nie protokolliert wird.
DROP TRIGGER audit_lagerorte_update;
--> statement-breakpoint
CREATE TRIGGER audit_lagerorte_update AFTER UPDATE ON "lagerorte"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."typ" IS NOT NEW."typ" OR OLD."kennung" IS NOT NEW."kennung" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."template_id" IS NOT NEW."template_id" OR OLD."parent_id" IS NOT NEW."parent_id" OR OLD."zugangshinweis" IS NOT NEW."zugangshinweis" OR OLD."sortierung" IS NOT NEW."sortierung" OR OLD."einheitenart" IS NOT NEW."einheitenart" OR OLD."stamm_id" IS NOT NEW."stamm_id"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'lagerorte', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
