-- IDA-223: „Immer zählen" an Soll- und Vorlagenposition.
--
-- Ein Schalter, keine Stufe: was gesetzt ist, kommt in JEDEN Kurzcheck,
-- ausserhalb des Stichprobenumfangs (`_lib/domain/stichprobe.ts`). Eine Stufe
-- dazwischen haette nur das Gewicht im Zufall verschoben — das kann niemand
-- am Fahrzeug nachpruefen, und fuer „lange nicht gezaehlt" sorgt die
-- Garantiefrist schon.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die
-- Audit-Trigger aus 0004 nicht (vgl. Kopf von 0005).
--
-- KEIN BACKFILL: jede bestehende Zeile bekommt `false`, also das Verhalten von
-- vor dieser Migration. Der Vorlagen-Sync gleicht materialisierte Zeilen erst
-- an, wenn die Vorlage den Schalter setzt.
ALTER TABLE `soll_positionen` ADD `immer_zaehlen` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `template_positionen` ADD `immer_zaehlen` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- DIE UPDATE-TRIGGER WERDEN NEU GESETZT: ihr WHEN zaehlt jede Spalte einzeln
-- auf. Eine Spalte, die dort fehlt, ist eine Aenderung, die nie protokolliert
-- wird — still (`core/audit/catalog.test.ts`).
DROP TRIGGER audit_soll_positionen_update;
--> statement-breakpoint
CREATE TRIGGER audit_soll_positionen_update AFTER UPDATE ON "soll_positionen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."fahrzeug_id" IS NOT NEW."fahrzeug_id" OR OLD."fach_label" IS NOT NEW."fach_label" OR OLD."sort" IS NOT NEW."sort" OR OLD."artikel_id" IS NOT NEW."artikel_id" OR OLD."soll" IS NOT NEW."soll" OR OLD."template_position_id" IS NOT NEW."template_position_id" OR OLD."ueberschrieben" IS NOT NEW."ueberschrieben" OR OLD."entfernt" IS NOT NEW."entfernt" OR OLD."immer_zaehlen" IS NOT NEW."immer_zaehlen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'soll_positionen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
DROP TRIGGER audit_template_positionen_update;
--> statement-breakpoint
CREATE TRIGGER audit_template_positionen_update AFTER UPDATE ON "template_positionen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."template_id" IS NOT NEW."template_id" OR OLD."fach_label" IS NOT NEW."fach_label" OR OLD."sort" IS NOT NEW."sort" OR OLD."artikel_id" IS NOT NEW."artikel_id" OR OLD."soll" IS NOT NEW."soll" OR OLD."immer_zaehlen" IS NOT NEW."immer_zaehlen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'template_positionen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
