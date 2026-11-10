-- IDA-379: wie viele Artikel des Umfangs beim Abschluss erfasst waren, und wie viele es gab.
--
-- Bis hierher sagte der Verlauf „Umfang: vollständig", sobald kein Filter und kein Ort gewaehlt
-- war — auch bei 2 von 14 gezaehlten Artikeln. `umfang` beschreibt nur die AUSWAHL, nicht, wie
-- weit die Zaehlung darin kam; die Gesamtzahl laesst sich spaeter nicht mehr ableiten (die
-- Artikelliste eines Orts aendert sich, und der Verlauf ist append-only).
--
-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die Audit-Trigger aus 0004 nicht
-- (vgl. Kopf von 0005).
--
-- KEIN BACKFILL: Altlaeufe behalten NULL und heissen im Verlauf „ganzer Handlager" statt
-- „vollständig" — ob sie vollstaendig waren, ist nicht belegt (`_lib/lesepfade/inventurVerlauf.ts`).
ALTER TABLE `inventuren` ADD `erfasst` integer;
--> statement-breakpoint
ALTER TABLE `inventuren` ADD `gesamt` integer;
--> statement-breakpoint
-- DER UPDATE-TRIGGER WIRD NEU GESETZT: sein WHEN zaehlt jede Spalte einzeln auf
-- (`core/audit/catalog.test.ts`, vgl. 0019).
DROP TRIGGER audit_inventuren_update;
--> statement-breakpoint
CREATE TRIGGER audit_inventuren_update AFTER UPDATE ON "inventuren"
WHEN OLD."id" IS NOT NEW."id" OR OLD."ts" IS NOT NEW."ts" OR OLD."quelle_typ" IS NOT NEW."quelle_typ" OR OLD."quelle_id" IS NOT NEW."quelle_id" OR OLD."kommentar" IS NOT NEW."kommentar" OR OLD."umfang" IS NOT NEW."umfang" OR OLD."erfasst" IS NOT NEW."erfasst" OR OLD."gesamt" IS NOT NEW."gesamt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'inventuren', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
