-- IDA-299: Fahrzeugakte (Technik, Kilometer, Prüfungen, Reifen). Tabellen von drizzle-kit, die
-- Audit-Trigger (AUDIT_TABLES.fahrzeuge) von Hand angehängt.
CREATE TABLE `fahrzeugakte` (
	`stamm_id` text PRIMARY KEY NOT NULL,
	`modell` text,
	`baujahr` integer,
	`laenge_cm` integer,
	`breite_cm` integer,
	`hoehe_cm` integer,
	`zgg_kg` integer,
	`leer_kg` integer,
	`staerke_f` integer,
	`staerke_u` integer,
	`staerke_m` integer,
	`sitze` integer,
	`tragen` integer,
	`fuehrerschein` text,
	`besonderheiten` text DEFAULT '[]' NOT NULL,
	`km` integer,
	`km_am` text,
	`reifen_aufgezogen` text,
	FOREIGN KEY (`stamm_id`) REFERENCES `stammfahrzeug`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "fahrzeugakte_reifen_aufgezogen" CHECK(reifen_aufgezogen IS NULL OR reifen_aufgezogen IN ('Winter','Sommer','Ganzjahres'))
);
--> statement-breakpoint
CREATE TABLE `pruefung` (
	`id` text PRIMARY KEY NOT NULL,
	`stamm_id` text NOT NULL,
	`art` text NOT NULL,
	`name` text NOT NULL,
	`monate` integer NOT NULL,
	`km_abstand` integer,
	`zuletzt` text,
	`zuletzt_km` integer,
	`von_hand` text,
	`bemerkung` text DEFAULT '' NOT NULL,
	`angelegt_am` integer NOT NULL,
	FOREIGN KEY (`stamm_id`) REFERENCES `stammfahrzeug`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "pruefung_art" CHECK(art IN ('HU','UVV','Service','Weitere'))
);
--> statement-breakpoint
CREATE INDEX `pruefung_stamm_idx` ON `pruefung` (`stamm_id`);--> statement-breakpoint
CREATE TABLE `reifensatz` (
	`id` text PRIMARY KEY NOT NULL,
	`stamm_id` text NOT NULL,
	`art` text NOT NULL,
	`dot` text NOT NULL,
	`lager` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`stamm_id`) REFERENCES `stammfahrzeug`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reifensatz_art" CHECK(art IN ('Winter','Sommer','Ganzjahres')),
	CONSTRAINT "reifensatz_dot" CHECK(dot GLOB '[0-9][0-9][0-9][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reifensatz_stamm_art_idx` ON `reifensatz` (`stamm_id`,`art`);--> statement-breakpoint
CREATE TRIGGER audit_fahrzeugakte_create AFTER INSERT ON "fahrzeugakte"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'create', 'fahrzeugakte', suite_audit_reference(NEW.stamm_id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_fahrzeugakte_update AFTER UPDATE ON "fahrzeugakte"
WHEN OLD."stamm_id" IS NOT NEW."stamm_id" OR OLD."modell" IS NOT NEW."modell" OR OLD."baujahr" IS NOT NEW."baujahr" OR OLD."laenge_cm" IS NOT NEW."laenge_cm" OR OLD."breite_cm" IS NOT NEW."breite_cm" OR OLD."hoehe_cm" IS NOT NEW."hoehe_cm" OR OLD."zgg_kg" IS NOT NEW."zgg_kg" OR OLD."leer_kg" IS NOT NEW."leer_kg" OR OLD."staerke_f" IS NOT NEW."staerke_f" OR OLD."staerke_u" IS NOT NEW."staerke_u" OR OLD."staerke_m" IS NOT NEW."staerke_m" OR OLD."sitze" IS NOT NEW."sitze" OR OLD."tragen" IS NOT NEW."tragen" OR OLD."fuehrerschein" IS NOT NEW."fuehrerschein" OR OLD."besonderheiten" IS NOT NEW."besonderheiten" OR OLD."km" IS NOT NEW."km" OR OLD."km_am" IS NOT NEW."km_am" OR OLD."reifen_aufgezogen" IS NOT NEW."reifen_aufgezogen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'update', 'fahrzeugakte', suite_audit_reference(NEW.stamm_id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_fahrzeugakte_delete AFTER DELETE ON "fahrzeugakte"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'delete', 'fahrzeugakte', suite_audit_reference(OLD.stamm_id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_pruefung_create AFTER INSERT ON "pruefung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'create', 'pruefung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_pruefung_update AFTER UPDATE ON "pruefung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."stamm_id" IS NOT NEW."stamm_id" OR OLD."art" IS NOT NEW."art" OR OLD."name" IS NOT NEW."name" OR OLD."monate" IS NOT NEW."monate" OR OLD."km_abstand" IS NOT NEW."km_abstand" OR OLD."zuletzt" IS NOT NEW."zuletzt" OR OLD."zuletzt_km" IS NOT NEW."zuletzt_km" OR OLD."von_hand" IS NOT NEW."von_hand" OR OLD."bemerkung" IS NOT NEW."bemerkung" OR OLD."angelegt_am" IS NOT NEW."angelegt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'update', 'pruefung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_pruefung_delete AFTER DELETE ON "pruefung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'delete', 'pruefung', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_reifensatz_create AFTER INSERT ON "reifensatz"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'create', 'reifensatz', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_reifensatz_update AFTER UPDATE ON "reifensatz"
WHEN OLD."id" IS NOT NEW."id" OR OLD."stamm_id" IS NOT NEW."stamm_id" OR OLD."art" IS NOT NEW."art" OR OLD."dot" IS NOT NEW."dot" OR OLD."lager" IS NOT NEW."lager"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'update', 'reifensatz', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_reifensatz_delete AFTER DELETE ON "reifensatz"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'fahrzeuge', 'delete', 'reifensatz', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
