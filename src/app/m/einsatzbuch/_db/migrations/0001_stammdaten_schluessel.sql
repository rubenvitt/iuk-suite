CREATE TABLE `fahrzeug` (
	`id` text PRIMARY KEY NOT NULL,
	`typ` text NOT NULL,
	`kennung` text NOT NULL,
	`ruf` text NOT NULL,
	`standort` text NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fahrzeug_kennung_unique` ON `fahrzeug` (`kennung`);
--> statement-breakpoint
CREATE TABLE `person` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`quali` text NOT NULL,
	`ov` text NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stichwort` (
	`id` text PRIMARY KEY NOT NULL,
	`gruppe` text NOT NULL,
	`name` text NOT NULL,
	`reihenfolge` integer NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stichwort_name_unique` ON `stichwort` (`name`);
--> statement-breakpoint
CREATE TABLE `einstellung` (
	`schluessel` text PRIMARY KEY NOT NULL,
	`wert` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schluesselpaar` (
	`id` text PRIMARY KEY NOT NULL,
	`rechner_id` text,
	`art` text NOT NULL,
	`schluessel_id` text NOT NULL,
	`oeffentlich` text NOT NULL,
	`privat_verschluesselt` text NOT NULL,
	`erzeugt_am` integer NOT NULL,
	CONSTRAINT "schluesselpaar_art_rechner" CHECK((art = 'echt' AND rechner_id IS NULL) OR (art = 'test' AND rechner_id IS NOT NULL)),
	CONSTRAINT "schluesselpaar_id_hex" CHECK(length(schluessel_id) = 16 AND schluessel_id NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schluesselpaar_schluessel_id_unique` ON `schluesselpaar` (`schluessel_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `schluesselpaar_echt_einzig` ON `schluesselpaar` (`art`) WHERE art = 'echt';
--> statement-breakpoint
CREATE TABLE `stammdatenstand` (
	`id` integer PRIMARY KEY NOT NULL CHECK(id = 1),
	`version` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `stammdatenstand` (`id`, `version`) VALUES (1, 0);
--> statement-breakpoint
CREATE TRIGGER audit_fahrzeug_create AFTER INSERT ON "fahrzeug"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'create', 'fahrzeug', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_fahrzeug_update AFTER UPDATE ON "fahrzeug"
WHEN OLD."id" IS NOT NEW."id" OR OLD."typ" IS NOT NEW."typ" OR OLD."kennung" IS NOT NEW."kennung" OR OLD."ruf" IS NOT NEW."ruf" OR OLD."standort" IS NOT NEW."standort" OR OLD."aktiv" IS NOT NEW."aktiv"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'update', 'fahrzeug', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_fahrzeug_delete AFTER DELETE ON "fahrzeug"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'delete', 'fahrzeug', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER stand_fahrzeug_insert AFTER INSERT ON "fahrzeug"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER stand_fahrzeug_update AFTER UPDATE ON "fahrzeug"
WHEN OLD."id" IS NOT NEW."id" OR OLD."typ" IS NOT NEW."typ" OR OLD."kennung" IS NOT NEW."kennung" OR OLD."ruf" IS NOT NEW."ruf" OR OLD."standort" IS NOT NEW."standort" OR OLD."aktiv" IS NOT NEW."aktiv"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER stand_fahrzeug_delete AFTER DELETE ON "fahrzeug"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER audit_person_create AFTER INSERT ON "person"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'create', 'person', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_person_update AFTER UPDATE ON "person"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."quali" IS NOT NEW."quali" OR OLD."ov" IS NOT NEW."ov" OR OLD."aktiv" IS NOT NEW."aktiv"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'update', 'person', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_person_delete AFTER DELETE ON "person"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'delete', 'person', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER stand_person_insert AFTER INSERT ON "person"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER stand_person_update AFTER UPDATE ON "person"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."quali" IS NOT NEW."quali" OR OLD."ov" IS NOT NEW."ov" OR OLD."aktiv" IS NOT NEW."aktiv"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER stand_person_delete AFTER DELETE ON "person"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER audit_stichwort_create AFTER INSERT ON "stichwort"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'create', 'stichwort', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_stichwort_update AFTER UPDATE ON "stichwort"
WHEN OLD."id" IS NOT NEW."id" OR OLD."gruppe" IS NOT NEW."gruppe" OR OLD."name" IS NOT NEW."name" OR OLD."reihenfolge" IS NOT NEW."reihenfolge" OR OLD."aktiv" IS NOT NEW."aktiv"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'update', 'stichwort', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_stichwort_delete AFTER DELETE ON "stichwort"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'delete', 'stichwort', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER stand_stichwort_insert AFTER INSERT ON "stichwort"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER stand_stichwort_update AFTER UPDATE ON "stichwort"
WHEN OLD."id" IS NOT NEW."id" OR OLD."gruppe" IS NOT NEW."gruppe" OR OLD."name" IS NOT NEW."name" OR OLD."reihenfolge" IS NOT NEW."reihenfolge" OR OLD."aktiv" IS NOT NEW."aktiv"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER stand_stichwort_delete AFTER DELETE ON "stichwort"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER audit_einstellung_create AFTER INSERT ON "einstellung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'create', 'einstellung', suite_audit_reference(NEW.schluessel), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_einstellung_update AFTER UPDATE ON "einstellung"
WHEN OLD."schluessel" IS NOT NEW."schluessel" OR OLD."wert" IS NOT NEW."wert"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'update', 'einstellung', suite_audit_reference(NEW.schluessel), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_einstellung_delete AFTER DELETE ON "einstellung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'delete', 'einstellung', suite_audit_reference(OLD.schluessel), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER stand_einstellung_insert AFTER INSERT ON "einstellung"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER stand_einstellung_update AFTER UPDATE ON "einstellung"
WHEN OLD."schluessel" IS NOT NEW."schluessel" OR OLD."wert" IS NOT NEW."wert"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER stand_einstellung_delete AFTER DELETE ON "einstellung"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER audit_schluesselpaar_create AFTER INSERT ON "schluesselpaar"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'create', 'schluesselpaar', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_schluesselpaar_update AFTER UPDATE ON "schluesselpaar"
WHEN OLD."id" IS NOT NEW."id" OR OLD."rechner_id" IS NOT NEW."rechner_id" OR OLD."art" IS NOT NEW."art" OR OLD."schluessel_id" IS NOT NEW."schluessel_id" OR OLD."oeffentlich" IS NOT NEW."oeffentlich" OR OLD."privat_verschluesselt" IS NOT NEW."privat_verschluesselt" OR OLD."erzeugt_am" IS NOT NEW."erzeugt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'update', 'schluesselpaar', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_schluesselpaar_delete AFTER DELETE ON "schluesselpaar"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'delete', 'schluesselpaar', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
