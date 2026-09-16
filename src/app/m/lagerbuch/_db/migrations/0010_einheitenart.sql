-- DRK-309: Fahrzeug oder Tasche — die Art der verwalteten Einheit.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die Audit-Trigger
-- aus 0004 nicht und liesse sie beim naechsten Lauf still stehen
-- (0005_artikel_kategorie.sql, Kopfkommentar).
--
-- KEIN BACKFILL, UND DAS IST DIE ENTSCHEIDUNG DIESER MIGRATION. Jede bestehende
-- Zeile bekommt `einheitenart = NULL` und heisst damit „noch nicht zugeordnet".
-- Ein geratener Wert waere die schlechtere Wahl: er saehe aus wie eine Angabe,
-- waere aber keine, und niemand koennte ihn hinterher von einer echten
-- unterscheiden. Der Zwischenstand ist ausdruecklich erlaubt — die Liste zeigt
-- ihn, und wer es weiss, traegt ihn am Einheitenblatt nach.
--
-- NEUE ZEILEN TRAGEN DIE ANGABE IMMER. Die Pflicht steht im Eingangsvalidator
-- (`_actions/fahrzeuge.ts`), NICHT als `NOT NULL` in dieser Spalte: eine
-- NOT-NULL-Spalte ohne Default laesst sich an eine gefuellte Tabelle gar nicht
-- anhaengen, und ein Default machte aus jeder Altzeile eine Behauptung.
ALTER TABLE `lagerorte` ADD `einheitenart` text;
--> statement-breakpoint
-- DER UPDATE-TRIGGER WIRD NEU GESETZT, nicht nur die Spalte angehaengt: sein
-- WHEN zaehlt jede Spalte einzeln auf. Eine Spalte, die dort fehlt, ist eine
-- Aenderung, die NIE protokolliert wird — still. `core/audit/catalog.test.ts`
-- haelt das fest und wird ohne diese drei Zeilen rot. Und genau diese Spalte
-- wird nachtraeglich gesetzt: der Zwischenstand oben macht das Nachtragen zum
-- Normalfall, nicht zur Ausnahme.
DROP TRIGGER audit_lagerorte_update;
--> statement-breakpoint
CREATE TRIGGER audit_lagerorte_update AFTER UPDATE ON "lagerorte"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."typ" IS NOT NEW."typ" OR OLD."kennung" IS NOT NEW."kennung" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."template_id" IS NOT NEW."template_id" OR OLD."parent_id" IS NOT NEW."parent_id" OR OLD."zugangshinweis" IS NOT NEW."zugangshinweis" OR OLD."sortierung" IS NOT NEW."sortierung" OR OLD."einheitenart" IS NOT NEW."einheitenart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'lagerorte', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
