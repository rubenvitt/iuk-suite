-- DRK-308: der konfigurierbare Wechselhinweis je Sauerstoffflasche.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die Audit-Trigger
-- aus 0004 nicht und liesse sie beim naechsten Lauf still stehen
-- (docs/lagerbuch-portierung-analyse.md, Falle 1).
--
-- DIE EINHEIT IST PROZENT, NICHT BAR. „25 % / 50 bar" aus der Gespraechsnotiz ist
-- EIN Grenzwert in zwei Einheiten; die beiden Zahlen fallen nur bei Nennfuelldruck
-- 200 zusammen (bei 300 bar sind 25 % = 75 bar). Als Prozentwert skaliert die
-- Regel ueber `nennfuelldruck_bar` je Flasche mit.
--
-- DEFAULT 25 IST DAS BISHERIGE VERHALTEN. Die Ampel trug diese Schwelle bis
-- DRK-308 fest verdrahtet (`_lib/domain/o2.ts`); jede Altzeile wird damit weiter
-- genau so bewertet wie vorher, und niemand muss etwas nachtragen.
ALTER TABLE `o2_flaschen` ADD `wechsel_ab_prozent` integer DEFAULT 25 NOT NULL;
--> statement-breakpoint
-- DER UPDATE-TRIGGER WIRD NEU GESETZT, nicht nur die Spalte angehaengt: sein
-- WHEN zaehlt jede Spalte einzeln auf, damit ein UPDATE ohne Aenderung keine
-- Audit-Zeile schreibt. Eine Spalte, die dort fehlt, ist eine Aenderung, die nie
-- protokolliert wird — still. Und genau diese Spalte traegt eine fachliche
-- Entscheidung: wer den Wechselhinweis verschiebt, verschiebt, ab wann eine
-- Flasche als wechselbeduerftig gilt. Das gehoert ins Protokoll
-- (`core/audit/catalog.test.ts` haelt die Kopplung fest).
DROP TRIGGER audit_o2_flaschen_update;
--> statement-breakpoint
CREATE TRIGGER audit_o2_flaschen_update AFTER UPDATE ON "o2_flaschen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."lagerort_id" IS NOT NEW."lagerort_id" OR OLD."groesse_liter" IS NOT NEW."groesse_liter" OR OLD."nennfuelldruck_bar" IS NOT NEW."nennfuelldruck_bar" OR OLD."wechsel_ab_prozent" IS NOT NEW."wechsel_ab_prozent" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."created_at" IS NOT NEW."created_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'o2_flaschen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
