-- IDA-411: ein Gerät kann im Fahrzeug-Check nach seinem Selbsttest gefragt werden (corpuls C3, AED).
--
-- Der Schalter steht am GERÄT, nicht am Typ: nicht jedes Medizingerät hat einen Selbsttest, und wer
-- ihn hat, weiß die Verwaltung. Kein Backfill: jede bestehende Zeile bekommt `false`, also genau das
-- Verhalten von vor dieser Migration. Keine Zeile, kein Wert geht verloren.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT (vgl. Kopf von 0005).
ALTER TABLE `geraete` ADD `selbsttest` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- DER UPDATE-TRIGGER WIRD NEU GESETZT: sein WHEN zählt jede Spalte einzeln auf (vgl. 0019).
DROP TRIGGER audit_geraete_update;
--> statement-breakpoint
CREATE TRIGGER audit_geraete_update AFTER UPDATE ON "geraete"
WHEN OLD."id" IS NOT NEW."id" OR OLD."typ" IS NOT NEW."typ" OR OLD."barcode" IS NOT NEW."barcode" OR OLD."name" IS NOT NEW."name" OR OLD."lagerort_id" IS NOT NEW."lagerort_id" OR OLD."anmerkung" IS NOT NEW."anmerkung" OR OLD."mtk_faellig" IS NOT NEW."mtk_faellig" OR OLD."beschreibung" IS NOT NEW."beschreibung" OR OLD."ablaufdatum" IS NOT NEW."ablaufdatum" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."selbsttest" IS NOT NEW."selbsttest"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'geraete', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
