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
CREATE TRIGGER audit_eigene_zeichen_create AFTER INSERT ON "eigene_zeichen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'create', 'eigene_zeichen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_eigene_zeichen_update AFTER UPDATE ON "eigene_zeichen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."sub" IS NOT NEW."sub" OR OLD."name" IS NOT NEW."name" OR OLD."spec_json" IS NOT NEW."spec_json" OR OLD."spec_kanon" IS NOT NEW."spec_kanon" OR OLD."svg_zwischenspeicher" IS NOT NEW."svg_zwischenspeicher" OR OLD."paket_version" IS NOT NEW."paket_version" OR OLD."daten_version" IS NOT NEW."daten_version" OR OLD."erstellt_am" IS NOT NEW."erstellt_am" OR OLD."geaendert_am" IS NOT NEW."geaendert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'update', 'eigene_zeichen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_eigene_zeichen_delete AFTER DELETE ON "eigene_zeichen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'delete', 'eigene_zeichen', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lernset_zeichen_create AFTER INSERT ON "lernset_zeichen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'create', 'lernset_zeichen', suite_audit_reference(json_array(NEW.lernset_id,NEW.zeichen_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lernset_zeichen_update AFTER UPDATE ON "lernset_zeichen"
WHEN OLD."lernset_id" IS NOT NEW."lernset_id" OR OLD."zeichen_id" IS NOT NEW."zeichen_id" OR OLD."titel_schnappschuss" IS NOT NEW."titel_schnappschuss" OR OLD."position" IS NOT NEW."position"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'update', 'lernset_zeichen', suite_audit_reference(json_array(NEW.lernset_id,NEW.zeichen_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lernset_zeichen_delete AFTER DELETE ON "lernset_zeichen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'delete', 'lernset_zeichen', suite_audit_reference(json_array(OLD.lernset_id,OLD.zeichen_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lernsets_create AFTER INSERT ON "lernsets"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'create', 'lernsets', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lernsets_update AFTER UPDATE ON "lernsets"
WHEN OLD."id" IS NOT NEW."id" OR OLD."slug" IS NOT NEW."slug" OR OLD."titel" IS NOT NEW."titel" OR OLD."beschreibung" IS NOT NEW."beschreibung" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."sortierung" IS NOT NEW."sortierung" OR OLD."erstellt_von" IS NOT NEW."erstellt_von" OR OLD."erstellt_am" IS NOT NEW."erstellt_am" OR OLD."geaendert_am" IS NOT NEW."geaendert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'update', 'lernsets', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lernsets_delete AFTER DELETE ON "lernsets"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'delete', 'lernsets', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lernstand_create AFTER INSERT ON "lernstand"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'create', 'lernstand', suite_audit_reference(json_array(NEW.sub,NEW.zeichen_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lernstand_update AFTER UPDATE ON "lernstand"
WHEN OLD."sub" IS NOT NEW."sub" OR OLD."zeichen_id" IS NOT NEW."zeichen_id" OR OLD."stufe" IS NOT NEW."stufe" OR OLD."faellig_am" IS NOT NEW."faellig_am" OR OLD."richtig" IS NOT NEW."richtig" OR OLD."falsch" IS NOT NEW."falsch" OR OLD."letzte_antwort_am" IS NOT NEW."letzte_antwort_am" OR OLD."erstellt_am" IS NOT NEW."erstellt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'update', 'lernstand', suite_audit_reference(json_array(NEW.sub,NEW.zeichen_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_lernstand_delete AFTER DELETE ON "lernstand"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'delete', 'lernstand', suite_audit_reference(json_array(OLD.sub,OLD.zeichen_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_merkliste_create AFTER INSERT ON "merkliste"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'create', 'merkliste', suite_audit_reference(json_array(NEW.sub,NEW.zeichen_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_merkliste_update AFTER UPDATE ON "merkliste"
WHEN OLD."sub" IS NOT NEW."sub" OR OLD."zeichen_id" IS NOT NEW."zeichen_id" OR OLD."titel_schnappschuss" IS NOT NEW."titel_schnappschuss" OR OLD."erstellt_am" IS NOT NEW."erstellt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'update', 'merkliste', suite_audit_reference(json_array(NEW.sub,NEW.zeichen_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_merkliste_delete AFTER DELETE ON "merkliste"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'zeichen', 'delete', 'merkliste', suite_audit_reference(json_array(OLD.sub,OLD.zeichen_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
