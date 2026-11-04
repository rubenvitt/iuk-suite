-- Lagekarte (IDA-348): feste Punkte und Flächen auf allen Monitoren. Tabelle von drizzle-kit, Audit-Trigger von Hand
-- (wie 0008_fahrzeuge.sql); anders als dort stehen alle Spalten im Audit, auch die Lage: sie ist hier fachlicher Inhalt.
CREATE TABLE `lagemonitor_kartenobjekt` (
	`id` text PRIMARY KEY NOT NULL,
	`art` text NOT NULL,
	`name` text NOT NULL,
	`zeichen` text,
	`farbe` text,
	`breite` real,
	`laenge` real,
	`ring` text,
	`auf_karte` integer DEFAULT true NOT NULL,
	`angelegt_am` integer NOT NULL,
	`angelegt_von` text NOT NULL,
	`geaendert_am` integer NOT NULL,
	`geaendert_von` text NOT NULL,
	CONSTRAINT "lagemonitor_kartenobjekt_art" CHECK(art IN ('punkt','flaeche'))
);
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_kartenobjekt_create AFTER INSERT ON "lagemonitor_kartenobjekt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'create', 'lagemonitor_kartenobjekt', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_kartenobjekt_update AFTER UPDATE ON "lagemonitor_kartenobjekt"
WHEN OLD."id" IS NOT NEW."id" OR OLD."art" IS NOT NEW."art" OR OLD."name" IS NOT NEW."name" OR OLD."zeichen" IS NOT NEW."zeichen" OR OLD."farbe" IS NOT NEW."farbe" OR OLD."breite" IS NOT NEW."breite" OR OLD."laenge" IS NOT NEW."laenge" OR OLD."ring" IS NOT NEW."ring" OR OLD."auf_karte" IS NOT NEW."auf_karte" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."angelegt_von" IS NOT NEW."angelegt_von" OR OLD."geaendert_am" IS NOT NEW."geaendert_am" OR OLD."geaendert_von" IS NOT NEW."geaendert_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'update', 'lagemonitor_kartenobjekt', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lagemonitor_kartenobjekt_delete AFTER DELETE ON "lagemonitor_kartenobjekt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagemonitor', 'delete', 'lagemonitor_kartenobjekt', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
