-- IDA-377: ein Mangel kann an einem GERÄT hängen und aus einem CHECK stammen.
--
-- Meldet der Fahrzeug-Check ein Gerät als „fehlt" oder „Defekt", legt er den Mangel selbst an
-- (`_actions/check.ts`). `geraet_id` zeigt ihn an der Geräteseite und verhindert, dass jeder weitere
-- Check denselben Schaden ein zweites Mal meldet; `check_id` sagt, aus welchem Check er kommt.
-- Beide NULL für jede Meldung von Hand und für alles von vor dieser Migration.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT (vgl. Kopf von 0005).
ALTER TABLE `maengel` ADD `geraet_id` text REFERENCES `geraete`(`id`);
--> statement-breakpoint
ALTER TABLE `maengel` ADD `check_id` text;
--> statement-breakpoint
CREATE INDEX `idx_maengel_geraet` ON `maengel` (`geraet_id`);
--> statement-breakpoint
-- DER UPDATE-TRIGGER WIRD NEU GESETZT: sein WHEN zählt jede Spalte einzeln auf (vgl. 0020).
DROP TRIGGER audit_maengel_update;
--> statement-breakpoint
CREATE TRIGGER audit_maengel_update AFTER UPDATE ON "maengel"
WHEN OLD."id" IS NOT NEW."id" OR OLD."lagerort_id" IS NOT NEW."lagerort_id" OR OLD."punkte" IS NOT NEW."punkte" OR OLD."beschreibung" IS NOT NEW."beschreibung" OR OLD."melder_name" IS NOT NEW."melder_name" OR OLD."quelle_typ" IS NOT NEW."quelle_typ" OR OLD."quelle_id" IS NOT NEW."quelle_id" OR OLD."fotos" IS NOT NEW."fotos" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."erledigt_at" IS NOT NEW."erledigt_at" OR OLD."erledigt_von" IS NOT NEW."erledigt_von" OR OLD."erledigt_vermerk" IS NOT NEW."erledigt_vermerk" OR OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."check_id" IS NOT NEW."check_id"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'maengel', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
