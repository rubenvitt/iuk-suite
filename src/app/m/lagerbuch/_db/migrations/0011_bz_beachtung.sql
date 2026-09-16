-- DRK-311: der Aufmerksamkeitshinweis an einem BZ-Geraet.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die Audit-Trigger
-- aus 0004 nicht und liesse sie beim naechsten Lauf still stehen (vgl. Kopf von
-- 0005 und 0010).
--
-- DER TEXT IST DER ZUSTAND. `beachtung_hinweis IS NULL` heisst „keine Beachtung
-- noetig", ein Text heisst „gelber Status mit genau diesem Satz". Ein zweites
-- Boolean daneben koennte dem Text widersprechen — `beachtung = 1` ohne Hinweis
-- waere eine Farbe ohne Begruendung, und genau die schliesst das Ticket aus.
--
-- AM GERAET, NICHT AN DER KONTROLLE: `bz_kontrollen` ist append-only (0002), ein
-- Hinweis dort waere nicht mehr aufzuheben, ohne eine Kontrolle zu erfinden, die
-- niemand durchgefuehrt hat. Wer die Beachtung wann gesetzt oder aufgehoben hat,
-- steht damit im Zugriffsprotokoll ueber den UPDATE-Trigger unten.
--
-- KEIN BACKFILL: jede bestehende Zeile bekommt NULL und heisst damit „keine
-- Beachtung". Das ist keine Behauptung, sondern der einzige Stand, den es vor
-- dieser Migration gab.
ALTER TABLE `bz_geraete` ADD `beachtung_hinweis` text;
--> statement-breakpoint
ALTER TABLE `bz_geraete` ADD `beachtung_seit` integer;
--> statement-breakpoint
-- DER UPDATE-TRIGGER WIRD NEU GESETZT, nicht nur die Spalten angehaengt: sein
-- WHEN zaehlt jede Spalte einzeln auf. Eine Spalte, die dort fehlt, ist eine
-- Aenderung, die NIE protokolliert wird — still. `core/audit/catalog.test.ts`
-- haelt das fest und wird ohne diese Zeilen rot. Und genau diese beiden Spalten
-- werden ausschliesslich NACHTRAEGLICH gesetzt: setzen und aufheben sind der
-- einzige Weg, auf dem sie sich je aendern.
DROP TRIGGER audit_bz_geraete_update;
--> statement-breakpoint
CREATE TRIGGER audit_bz_geraete_update AFTER UPDATE ON "bz_geraete"
WHEN OLD."id" IS NOT NEW."id" OR OLD."barcode" IS NOT NEW."barcode" OR OLD."name" IS NOT NEW."name" OR OLD."lagerort_id" IS NOT NEW."lagerort_id" OR OLD."streifen_lot" IS NOT NEW."streifen_lot" OR OLD."level1_label" IS NOT NEW."level1_label" OR OLD."level1_min" IS NOT NEW."level1_min" OR OLD."level1_max" IS NOT NEW."level1_max" OR OLD."level2_label" IS NOT NEW."level2_label" OR OLD."level2_min" IS NOT NEW."level2_min" OR OLD."level2_max" IS NOT NEW."level2_max" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."beachtung_hinweis" IS NOT NEW."beachtung_hinweis" OR OLD."beachtung_seit" IS NOT NEW."beachtung_seit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'bz_geraete', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
