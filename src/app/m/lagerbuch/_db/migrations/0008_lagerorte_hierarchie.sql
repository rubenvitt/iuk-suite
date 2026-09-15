-- DRK-297: Schraenke im Handlager als eigene Lagerorte.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die Audit-Trigger
-- aus 0004 nicht und liesse sie beim naechsten Lauf still stehen
-- (0005_artikel_kategorie.sql, Kopfkommentar).
--
-- KEIN BACKFILL. Jede bestehende Zeile bekommt `parent_id = NULL` und
-- `sortierung = 0`; die Bedeutung jeder bestehenden Buchung bleibt gleich. Eine
-- Buchung auf 'handlager' heisst ab jetzt „im Handlager, Schrank noch nicht
-- zugeordnet" — das ist der ehrliche Auffangort, kein Mangel.
ALTER TABLE `lagerorte` ADD `parent_id` text REFERENCES lagerorte(id);
--> statement-breakpoint
ALTER TABLE `lagerorte` ADD `zugangshinweis` text;
--> statement-breakpoint
ALTER TABLE `lagerorte` ADD `sortierung` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_lagerorte_parent` ON `lagerorte` (`parent_id`);
--> statement-breakpoint
-- DER UPDATE-TRIGGER WIRD NEU GESETZT, nicht nur die Spalten angehaengt: sein
-- WHEN zaehlt jede Spalte einzeln auf. Eine Spalte, die dort fehlt, ist eine
-- Aenderung, die NIE protokolliert wird — still. `core/audit/catalog.test.ts`
-- haelt das fest und wird ohne diese drei Zeilen rot.
DROP TRIGGER audit_lagerorte_update;
--> statement-breakpoint
CREATE TRIGGER audit_lagerorte_update AFTER UPDATE ON "lagerorte"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."typ" IS NOT NEW."typ" OR OLD."kennung" IS NOT NEW."kennung" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."template_id" IS NOT NEW."template_id" OR OLD."parent_id" IS NOT NEW."parent_id" OR OLD."zugangshinweis" IS NOT NEW."zugangshinweis" OR OLD."sortierung" IS NOT NEW."sortierung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'lagerorte', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
