CREATE TABLE audit_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at INTEGER NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_ref TEXT,
  actor TEXT NOT NULL,
  result TEXT NOT NULL,
  origin TEXT NOT NULL,
  correlation_id TEXT,
  CONSTRAINT audit_outbox_actor_json CHECK (json_valid(actor))
);
--> statement-breakpoint
CREATE INDEX audit_outbox_occurred_idx ON audit_outbox (occurred_at, id);
--> statement-breakpoint
CREATE TRIGGER audit_aufgaben_create AFTER INSERT ON "aufgaben"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'create', 'aufgaben', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_aufgaben_update AFTER UPDATE ON "aufgaben"
WHEN OLD."id" IS NOT NEW."id" OR OLD."titel" IS NOT NEW."titel" OR OLD."beschreibung" IS NOT NEW."beschreibung" OR OLD."prioritaet" IS NOT NEW."prioritaet" OR OLD."ersteller_id" IS NOT NEW."ersteller_id" OR OLD."zugewiesen_an" IS NOT NEW."zugewiesen_an" OR OLD."status" IS NOT NEW."status" OR OLD."faellig_am" IS NOT NEW."faellig_am" OR OLD."faellig_uhrzeit" IS NOT NEW."faellig_uhrzeit" OR OLD."dauer_minuten" IS NOT NEW."dauer_minuten" OR OLD."nachweis_pflicht" IS NOT NEW."nachweis_pflicht" OR OLD."nachweis_art" IS NOT NEW."nachweis_art" OR OLD."pruefer_id" IS NOT NEW."pruefer_id" OR OLD."ist_selbst" IS NOT NEW."ist_selbst" OR OLD."plan_datum" IS NOT NEW."plan_datum" OR OLD."plan_uhrzeit" IS NOT NEW."plan_uhrzeit" OR OLD."plan_rang" IS NOT NEW."plan_rang" OR OLD."vorschlag_datum" IS NOT NEW."vorschlag_datum" OR OLD."vorschlag_uhrzeit" IS NOT NEW."vorschlag_uhrzeit" OR OLD."erstellt_am" IS NOT NEW."erstellt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'update', 'aufgaben', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_aufgaben_delete AFTER DELETE ON "aufgaben"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'delete', 'aufgaben', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_dateien_create AFTER INSERT ON "dateien"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'create', 'dateien', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_dateien_update AFTER UPDATE ON "dateien"
WHEN OLD."id" IS NOT NEW."id" OR OLD."aufgabe_id" IS NOT NEW."aufgabe_id" OR OLD."dateiname" IS NOT NEW."dateiname" OR OLD."mime" IS NOT NEW."mime" OR OLD."groesse" IS NOT NEW."groesse" OR OLD."scan_status" IS NOT NEW."scan_status" OR OLD."scan_geprueft_am" IS NOT NEW."scan_geprueft_am" OR OLD."erstellt_am" IS NOT NEW."erstellt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'update', 'dateien', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_dateien_delete AFTER DELETE ON "dateien"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'delete', 'dateien', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_nachweise_create AFTER INSERT ON "nachweise"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'create', 'nachweise', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_nachweise_update AFTER UPDATE ON "nachweise"
WHEN OLD."id" IS NOT NEW."id" OR OLD."aufgabe_id" IS NOT NEW."aufgabe_id" OR OLD."art" IS NOT NEW."art" OR OLD."text" IS NOT NEW."text" OR OLD."datei_id" IS NOT NEW."datei_id" OR OLD."erstellt_von" IS NOT NEW."erstellt_von" OR OLD."erstellt_am" IS NOT NEW."erstellt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'update', 'nachweise', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_nachweise_delete AFTER DELETE ON "nachweise"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'delete', 'nachweise', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_personen_create AFTER INSERT ON "personen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'create', 'personen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_personen_update AFTER UPDATE ON "personen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."sub" IS NOT NEW."sub" OR OLD."name" IS NOT NEW."name" OR OLD."initialen" IS NOT NEW."initialen" OR OLD."rolle" IS NOT NEW."rolle" OR OLD."soll_minuten_tag" IS NOT NEW."soll_minuten_tag" OR OLD."aktiv_von" IS NOT NEW."aktiv_von" OR OLD."aktiv_bis" IS NOT NEW."aktiv_bis" OR OLD."erstellt_am" IS NOT NEW."erstellt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'update', 'personen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_personen_delete AFTER DELETE ON "personen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'delete', 'personen', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_routinen_create AFTER INSERT ON "routinen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'create', 'routinen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_routinen_update AFTER UPDATE ON "routinen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."person_id" IS NOT NEW."person_id" OR OLD."titel" IS NOT NEW."titel" OR OLD."wochentage" IS NOT NEW."wochentage" OR OLD."uhrzeit" IS NOT NEW."uhrzeit" OR OLD."dauer_minuten" IS NOT NEW."dauer_minuten" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."erstellt_am" IS NOT NEW."erstellt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'update', 'routinen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_routinen_delete AFTER DELETE ON "routinen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'delete', 'routinen', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_verlauf_create AFTER INSERT ON "verlauf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'create', 'verlauf', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_verlauf_update AFTER UPDATE ON "verlauf"
WHEN OLD."id" IS NOT NEW."id" OR OLD."aufgabe_id" IS NOT NEW."aufgabe_id" OR OLD."ereignis" IS NOT NEW."ereignis" OR OLD."akteur_id" IS NOT NEW."akteur_id" OR OLD."notiz" IS NOT NEW."notiz" OR OLD."ts" IS NOT NEW."ts"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'update', 'verlauf', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_verlauf_delete AFTER DELETE ON "verlauf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'aufgaben', 'delete', 'verlauf', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
