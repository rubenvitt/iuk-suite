-- Standort je Monitor statt eines Standorts für alle (IDA-333): Spalten von drizzle-kit, Rest von Hand.
-- Der bisherige Standort der Anzeige geht an jeden vorhandenen Zugang, danach fallen die Spalten weg. Die
-- Update-Trigger beider Tabellen kommen neu: der der Anzeige ohne die Standortspalten (SQLite löscht keine
-- Spalte, die ein Trigger nennt), der des Zugangs mit den Ortspalten (wie 0005_kartenzoom.sql).
ALTER TABLE `lagemonitor_zugang` ADD `ort_name` text;--> statement-breakpoint
ALTER TABLE `lagemonitor_zugang` ADD `ort_breite` real;--> statement-breakpoint
ALTER TABLE `lagemonitor_zugang` ADD `ort_laenge` real;--> statement-breakpoint
ALTER TABLE `lagemonitor_zugang` ADD `ort_zeichen` text;--> statement-breakpoint
UPDATE `lagemonitor_zugang` SET
  `ort_name` = (SELECT `standort_name` FROM `lagemonitor_anzeige` WHERE `id` = 'anzeige'),
  `ort_breite` = (SELECT `standort_breite` FROM `lagemonitor_anzeige` WHERE `id` = 'anzeige'),
  `ort_laenge` = (SELECT `standort_laenge` FROM `lagemonitor_anzeige` WHERE `id` = 'anzeige');
--> statement-breakpoint
DROP TRIGGER audit_lagemonitor_anzeige_update;
--> statement-breakpoint
ALTER TABLE `lagemonitor_anzeige` DROP COLUMN `standort_name`;--> statement-breakpoint
ALTER TABLE `lagemonitor_anzeige` DROP COLUMN `standort_breite`;--> statement-breakpoint
ALTER TABLE `lagemonitor_anzeige` DROP COLUMN `standort_laenge`;--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_anzeige_update AFTER UPDATE ON "lagemonitor_anzeige"
WHEN OLD."id" IS NOT NEW."id" OR OLD."region_ars" IS NOT NEW."region_ars" OR OLD."region_name" IS NOT NEW."region_name" OR OLD."warnschwelle" IS NOT NEW."warnschwelle" OR OLD."wetter" IS NOT NEW."wetter" OR OLD."radar" IS NOT NEW."radar" OR OLD."warngebiete" IS NOT NEW."warngebiete" OR OLD."warnliste" IS NOT NEW."warnliste" OR OLD."suchlage" IS NOT NEW."suchlage" OR OLD."suchlage_adresse" IS NOT NEW."suchlage_adresse" OR OLD."suchlage_token" IS NOT NEW."suchlage_token" OR OLD."suchlage_flugspuren" IS NOT NEW."suchlage_flugspuren" OR OLD."suchlage_gebiete" IS NOT NEW."suchlage_gebiete" OR OLD."suchlage_drohnenbild" IS NOT NEW."suchlage_drohnenbild" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am" OR OLD."aktualisiert_von" IS NOT NEW."aktualisiert_von" OR OLD."mitmachen" IS NOT NEW."mitmachen" OR OLD."mitmachen_adresse" IS NOT NEW."mitmachen_adresse" OR OLD."mitmachen_text" IS NOT NEW."mitmachen_text" OR OLD."tomtom_schluessel" IS NOT NEW."tomtom_schluessel" OR OLD."verkehr_fluss" IS NOT NEW."verkehr_fluss" OR OLD."verkehr_baustellen" IS NOT NEW."verkehr_baustellen" OR OLD."verkehr_blitzer" IS NOT NEW."verkehr_blitzer" OR OLD."karten_zoom" IS NOT NEW."karten_zoom"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_anzeige', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
DROP TRIGGER audit_lagemonitor_zugang_update;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_zugang_update AFTER UPDATE ON "lagemonitor_zugang"
WHEN OLD."id" IS NOT NEW."id" OR OLD."bezeichnung" IS NOT NEW."bezeichnung" OR OLD."schluessel_hash" IS NOT NEW."schluessel_hash" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von" OR OLD."ort_name" IS NOT NEW."ort_name" OR OLD."ort_breite" IS NOT NEW."ort_breite" OR OLD."ort_laenge" IS NOT NEW."ort_laenge" OR OLD."ort_zeichen" IS NOT NEW."ort_zeichen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_zugang', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
