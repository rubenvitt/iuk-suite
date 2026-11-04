-- IDA-359: Verbindungen zu Umsystemen, heute nur Suchlage. Die Suite fragt dort mit dem Token
-- die Einsätze ab und reicht sie an die Rechner weiter (`api/umsysteme`). Kein Trigger `stand_*`:
-- Die Verbindung gehört nicht ins Stammdatenpaket, ihr Token verlässt die Suite nie.
CREATE TABLE `umsystem` (
	`system` text PRIMARY KEY NOT NULL,
	`adresse` text NOT NULL,
	`token` text NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	`aktualisiert_von` text NOT NULL,
	`sperre_abgelehnt_am` integer
);
--> statement-breakpoint
CREATE TRIGGER audit_umsystem_create AFTER INSERT ON "umsystem"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'create', 'umsystem', suite_audit_reference(NEW.system), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_umsystem_update AFTER UPDATE ON "umsystem"
WHEN OLD."system" IS NOT NEW."system" OR OLD."adresse" IS NOT NEW."adresse" OR OLD."token" IS NOT NEW."token" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am" OR OLD."aktualisiert_von" IS NOT NEW."aktualisiert_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'update', 'umsystem', suite_audit_reference(NEW.system), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_umsystem_delete AFTER DELETE ON "umsystem"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'delete', 'umsystem', suite_audit_reference(OLD.system), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
-- IDA-359: Einsätze von Umsystemen, die ein versiegelter Block nennt (`POST /api/anker`, Feld
-- `umsysteme`). Nicht auditiert wie `anker`: Meldungen des Rechners, keine Eingaben der Verwaltung.
CREATE TABLE `umsystem_verknuepfung` (
	`system` text NOT NULL,
	`einsatz_id` text NOT NULL,
	`rechner_id` text NOT NULL,
	`block` integer NOT NULL,
	`gemeldet_am` integer NOT NULL,
	`weitergegeben_am` integer,
	PRIMARY KEY(`system`, `einsatz_id`)
);
