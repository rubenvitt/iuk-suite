-- IDA-379: eine Fehleingabe im BZ-Logbuch laesst sich STORNIEREN, nicht loeschen.
--
-- `bz_kontrollen` bleibt ein Medizinprodukte-Nachweis (0002). Der Storno ist ein
-- VERMERK an der Zeile: wer, wann. Die Messwerte, das Urteil und der Snapshot der
-- damaligen Grenzen bleiben unveraendert lesbar — eine stornierte Kontrolle steht
-- weiter im Logbuch, sie zaehlt nur nirgends mehr (Faelligkeit, Akku, letzte
-- Kontrolle).
--
-- ⚠️ DER UPDATE-RIEGEL AUS 0002 WIRD ENGER GEFASST, NICHT GEOEFFNET. Er laesst genau
-- EIN UPDATE durch: beide Storno-Spalten gehen von NULL auf gesetzt, jede andere
-- Spalte bleibt, wie sie war (`IS` vergleicht NULL-sicher). Ein zweiter Storno, ein
-- Zuruecknehmen oder jede Aenderung an einem Messwert bricht weiter mit derselben
-- Meldung ab. DELETE bleibt vollstaendig gesperrt.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT (vgl. Kopf von 0005): der Audit-Trigger fuer
-- UPDATE wird mit den neuen Spalten neu gesetzt — sonst waere der Storno die eine
-- Aenderung an dieser Tabelle, die nie im Protokoll steht.
ALTER TABLE `bz_kontrollen` ADD `storniert_at` integer;
--> statement-breakpoint
ALTER TABLE `bz_kontrollen` ADD `storniert_von` text;
--> statement-breakpoint
DROP TRIGGER bz_kontrollen_no_update;
--> statement-breakpoint
CREATE TRIGGER bz_kontrollen_no_update
BEFORE UPDATE ON bz_kontrollen
WHEN NOT (
  OLD.storniert_at IS NULL AND OLD.storniert_von IS NULL
  AND NEW.storniert_at IS NOT NULL AND NEW.storniert_von IS NOT NULL
  AND NEW.id IS OLD.id AND NEW.geraet_id IS OLD.geraet_id AND NEW.ts IS OLD.ts
  AND NEW.quelle_typ IS OLD.quelle_typ AND NEW.quelle_id IS OLD.quelle_id
  AND NEW.level1_wert IS OLD.level1_wert AND NEW.level1_im_bereich IS OLD.level1_im_bereich
  AND NEW.level2_wert IS OLD.level2_wert AND NEW.level2_im_bereich IS OLD.level2_im_bereich
  AND NEW.kompresse_verfall IS OLD.kompresse_verfall AND NEW.sticks IS OLD.sticks
  AND NEW.lanzetten IS OLD.lanzetten AND NEW.batterie_gewechselt IS OLD.batterie_gewechselt
  AND NEW.kommentar IS OLD.kommentar AND NEW.bestanden IS OLD.bestanden
  AND NEW.ref_snapshot IS OLD.ref_snapshot
)
BEGIN
  SELECT RAISE(ABORT, 'bz-kontrollen sind append-only');
END;
--> statement-breakpoint
DROP TRIGGER audit_bz_kontrollen_update;
--> statement-breakpoint
CREATE TRIGGER audit_bz_kontrollen_update AFTER UPDATE ON "bz_kontrollen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."ts" IS NOT NEW."ts" OR OLD."quelle_typ" IS NOT NEW."quelle_typ" OR OLD."quelle_id" IS NOT NEW."quelle_id" OR OLD."level1_wert" IS NOT NEW."level1_wert" OR OLD."level1_im_bereich" IS NOT NEW."level1_im_bereich" OR OLD."level2_wert" IS NOT NEW."level2_wert" OR OLD."level2_im_bereich" IS NOT NEW."level2_im_bereich" OR OLD."kompresse_verfall" IS NOT NEW."kompresse_verfall" OR OLD."sticks" IS NOT NEW."sticks" OR OLD."lanzetten" IS NOT NEW."lanzetten" OR OLD."batterie_gewechselt" IS NOT NEW."batterie_gewechselt" OR OLD."kommentar" IS NOT NEW."kommentar" OR OLD."bestanden" IS NOT NEW."bestanden" OR OLD."ref_snapshot" IS NOT NEW."ref_snapshot" OR OLD."storniert_at" IS NOT NEW."storniert_at" OR OLD."storniert_von" IS NOT NEW."storniert_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'bz_kontrollen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
