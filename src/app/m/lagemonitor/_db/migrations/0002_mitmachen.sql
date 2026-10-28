-- QR-Code fürs Ehrenamt: drei Spalten an der Anzeige, der UPDATE-Trigger neu mit ihnen (0000_grundbestand.sql).
ALTER TABLE `lagemonitor_anzeige` ADD `mitmachen` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `lagemonitor_anzeige` ADD `mitmachen_adresse` text;--> statement-breakpoint
ALTER TABLE `lagemonitor_anzeige` ADD `mitmachen_text` text;
--> statement-breakpoint
DROP TRIGGER audit_lagemonitor_anzeige_update;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_anzeige_update AFTER UPDATE ON "lagemonitor_anzeige"
WHEN OLD."id" IS NOT NEW."id" OR OLD."standort_name" IS NOT NEW."standort_name" OR OLD."standort_breite" IS NOT NEW."standort_breite" OR OLD."standort_laenge" IS NOT NEW."standort_laenge" OR OLD."region_ars" IS NOT NEW."region_ars" OR OLD."region_name" IS NOT NEW."region_name" OR OLD."warnschwelle" IS NOT NEW."warnschwelle" OR OLD."wetter" IS NOT NEW."wetter" OR OLD."radar" IS NOT NEW."radar" OR OLD."warngebiete" IS NOT NEW."warngebiete" OR OLD."warnliste" IS NOT NEW."warnliste" OR OLD."suchlage" IS NOT NEW."suchlage" OR OLD."suchlage_adresse" IS NOT NEW."suchlage_adresse" OR OLD."suchlage_token" IS NOT NEW."suchlage_token" OR OLD."suchlage_flugspuren" IS NOT NEW."suchlage_flugspuren" OR OLD."suchlage_gebiete" IS NOT NEW."suchlage_gebiete" OR OLD."suchlage_drohnenbild" IS NOT NEW."suchlage_drohnenbild" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am" OR OLD."aktualisiert_von" IS NOT NEW."aktualisiert_von" OR OLD."mitmachen" IS NOT NEW."mitmachen" OR OLD."mitmachen_adresse" IS NOT NEW."mitmachen_adresse" OR OLD."mitmachen_text" IS NOT NEW."mitmachen_text"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_anzeige', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
