-- DRK-294: Kategorie am Artikel und die je Konto ausgeblendeten Kategorien.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die Audit-Trigger
-- aus 0004 nicht und liesse sie beim naechsten Lauf still stehen
-- (docs/lagerbuch-portierung-analyse.md, Falle 1).
--
-- DER UPDATE-TRIGGER WIRD NEU GESETZT, nicht nur die Spalte angehaengt: sein
-- WHEN zaehlt jede Spalte einzeln auf, damit ein UPDATE ohne Aenderung keine
-- Audit-Zeile schreibt. Eine Spalte, die dort fehlt, ist eine Aenderung, die
-- nie protokolliert wird — still (`core/audit/catalog.test.ts` haelt das fest).
ALTER TABLE `artikel` ADD `kategorie` text;
--> statement-breakpoint
DROP TRIGGER audit_artikel_update;
--> statement-breakpoint
CREATE TRIGGER audit_artikel_update AFTER UPDATE ON "artikel"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."einheit" IS NOT NEW."einheit" OR OLD."fach" IS NOT NEW."fach" OR OLD."mindestbestand" IS NOT NEW."mindestbestand" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."bestellt_at" IS NOT NEW."bestellt_at" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."kategorie" IS NOT NEW."kategorie"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'artikel', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
-- `kategorie` traegt den GEFALTETEN Wert (`falte()` aus `_lib/suche.ts`), nicht die
-- Schreibweise am Artikel: „Hygiene" und „hygiene" sind eine Kategorie. Kein
-- Audit-Trigger — eine persoenliche Ansichtseinstellung, keine Datenaenderung
-- (Begruendung im Katalog `core/audit/catalog.ts`).
CREATE TABLE `ausgeblendete_kategorien` (
	`user_id` text NOT NULL,
	`kategorie` text NOT NULL,
	PRIMARY KEY(`user_id`, `kategorie`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
