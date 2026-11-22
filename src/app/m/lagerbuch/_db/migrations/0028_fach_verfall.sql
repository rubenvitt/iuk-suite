-- IDA-412: der gemeldete Verfall je FACH (Soll-Position), nicht nur je Artikel und Einheit.
--
-- Liegt derselbe Artikel in zwei Fächern (Kompressen in der Schublade und im Rucksack), stand bis
-- hier EIN Datum für beide da, das früheste. Jetzt trägt jedes Fach sein eigenes.
--
-- ⚠️ `lagerort_verfall` BLEIBT, WIE SIE IST — Zeile für Zeile. Sie ist weiter das früheste Datum
-- je Artikel und Einheit, und jede Ampel, die Verfallsübersicht, die Entnahmebox und der
-- Rücklauf lesen sie unverändert. Diese Tabelle ist das Detail DARUNTER; der Check schreibt beide
-- (die Einheitszeile als Minimum der Fächer).
--
-- ⚠️ NICHTS GEHT VERLOREN: jede bestehende Angabe wird auf JEDES aktive Fach desselben Artikels an
-- derselben Einheit kopiert, mit ihrem Zeitpunkt und ihrer Quelle (die Meldung bleibt dieselbe
-- Aussage eines Menschen, vgl. `uebernimmVerfall`). Das ist die sichere Richtung: jedes Fach warnt
-- so früh wie bisher die ganze Einheit, und der nächste Check verfeinert es. Eine Angabe ohne
-- aktives Fach (Entnahmebox, Grabstein) bekommt keine Fachzeile und bleibt an der Einheit stehen.
--
-- `ON DELETE CASCADE`: fällt eine Soll-Position hart weg (Vorlagen-Sync, Entfernen), fällt ihr
-- Fachdatum mit. Die Einheitszeile behandeln die bestehenden Wege wie bisher.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT (vgl. Kopf von 0005).
CREATE TABLE `fach_verfall` (
	`id` text PRIMARY KEY NOT NULL,
	`soll_position_id` text NOT NULL,
	`verfall` text NOT NULL,
	`erfasst_at` integer NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	FOREIGN KEY (`soll_position_id`) REFERENCES `soll_positionen`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fach_verfall_position` ON `fach_verfall` (`soll_position_id`);
--> statement-breakpoint
CREATE TRIGGER audit_fach_verfall_create AFTER INSERT ON "fach_verfall"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'create', 'fach_verfall', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_fach_verfall_update AFTER UPDATE ON "fach_verfall"
WHEN OLD."id" IS NOT NEW."id" OR OLD."soll_position_id" IS NOT NEW."soll_position_id" OR OLD."verfall" IS NOT NEW."verfall" OR OLD."erfasst_at" IS NOT NEW."erfasst_at" OR OLD."quelle_typ" IS NOT NEW."quelle_typ" OR OLD."quelle_id" IS NOT NEW."quelle_id"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'fach_verfall', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_fach_verfall_delete AFTER DELETE ON "fach_verfall"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'delete', 'fach_verfall', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
-- DIE ÜBERNAHME. Nur aktive Positionen (kein Grabstein), nur an der Einheit, an der die Angabe steht.
INSERT INTO fach_verfall (id, soll_position_id, verfall, erfasst_at, quelle_typ, quelle_id)
SELECT
  '0028-' || lower(hex(randomblob(8))),
  sp.id, lv.verfall, lv.erfasst_at, lv.quelle_typ, lv.quelle_id
FROM lagerort_verfall lv
JOIN soll_positionen sp
  ON sp.fahrzeug_id = lv.lagerort_id
 AND sp.artikel_id  = lv.artikel_id
 AND sp.entfernt    = 0;
