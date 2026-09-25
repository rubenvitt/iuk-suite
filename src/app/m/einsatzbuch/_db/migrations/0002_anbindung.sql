CREATE TABLE `rechner` (
	`id` text PRIMARY KEY NOT NULL,
	`art` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`eingerichtet_am` integer NOT NULL,
	`eingerichtet_von` text NOT NULL,
	`eingerichtet_von_sub` text NOT NULL,
	`letzter_kontakt` integer,
	`letzte_sicherung` text,
	`widerrufen_am` integer,
	CONSTRAINT "rechner_art" CHECK(art IN ('echt','test'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rechner_token_hash_unique` ON `rechner` (`token_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `rechner_echt_aktiv` ON `rechner` (`art`) WHERE art = 'echt' AND widerrufen_am IS NULL;
--> statement-breakpoint
CREATE TABLE `anker` (
	`rechner_id` text NOT NULL,
	`block` integer NOT NULL,
	`hash` text NOT NULL,
	`gemeldet_am` integer NOT NULL,
	PRIMARY KEY(`rechner_id`, `block`),
	FOREIGN KEY (`rechner_id`) REFERENCES `rechner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `anker_abweichung` (
	`id` text PRIMARY KEY NOT NULL,
	`rechner_id` text NOT NULL,
	`block` integer NOT NULL,
	`erwartet` text NOT NULL,
	`gemeldet` text NOT NULL,
	`zeitpunkt` integer NOT NULL,
	FOREIGN KEY (`rechner_id`) REFERENCES `rechner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `einmalcode` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`sub` text NOT NULL,
	`name` text NOT NULL,
	`ablauf` integer NOT NULL,
	`eingeloest_am` integer,
	`einrichtung_art` text,
	`rechner_name` text,
	`ersetzen` integer DEFAULT false NOT NULL,
	CONSTRAINT "einmalcode_einrichtung_art" CHECK(einrichtung_art IS NULL OR einrichtung_art IN ('echt','test'))
);
--> statement-breakpoint
CREATE TABLE `sitzung` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`sub` text NOT NULL,
	`name` text NOT NULL,
	`ablauf` integer NOT NULL,
	`rechner_id` text,
	`einrichtung_art` text,
	`rechner_name` text,
	`ersetzen` integer DEFAULT false NOT NULL,
	`eingerichtet` integer DEFAULT false NOT NULL,
	CONSTRAINT "sitzung_einrichtung_art" CHECK(einrichtung_art IS NULL OR einrichtung_art IN ('echt','test')),
	FOREIGN KEY (`rechner_id`) REFERENCES `rechner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `freigabe` (
	`id` text PRIMARY KEY NOT NULL,
	`zeitpunkt` integer NOT NULL,
	`sub` text NOT NULL,
	`name` text NOT NULL,
	`art` text NOT NULL,
	`rechner_id` text NOT NULL,
	`rechner_name` text NOT NULL,
	`bloecke` text NOT NULL,
	`anzahl` integer NOT NULL,
	CONSTRAINT "freigabe_art" CHECK(art IN ('echt','test'))
);
--> statement-breakpoint
-- Verwaiste Test-Paare aus Stufe 2: Vor Stufe 5 gab es keine Test-Rechner, jedes Test-Paar
-- (art = 'test') verweist also auf keinen existierenden Rechner. Vor den Konsistenztriggern
-- entfernen, sonst würde jeder künftige INSERT/UPDATE an ihnen sofort an der neuen Regel scheitern.
DELETE FROM schluesselpaar WHERE art = 'test';
--> statement-breakpoint
CREATE TRIGGER schluesselpaar_rechner_insert BEFORE INSERT ON schluesselpaar
WHEN NEW.rechner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rechner WHERE id = NEW.rechner_id AND art = 'test')
BEGIN SELECT RAISE(ABORT, 'schluesselpaar.rechner_id: kein Test-Rechner'); END;
--> statement-breakpoint
CREATE TRIGGER schluesselpaar_rechner_update BEFORE UPDATE OF rechner_id ON schluesselpaar
WHEN NEW.rechner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rechner WHERE id = NEW.rechner_id AND art = 'test')
BEGIN SELECT RAISE(ABORT, 'schluesselpaar.rechner_id: kein Test-Rechner'); END;
--> statement-breakpoint
CREATE TRIGGER rechner_paar_loeschen AFTER DELETE ON rechner
BEGIN DELETE FROM schluesselpaar WHERE rechner_id = OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER audit_rechner_create AFTER INSERT ON "rechner"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'create', 'rechner', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_rechner_update AFTER UPDATE ON "rechner"
WHEN OLD."id" IS NOT NEW."id" OR OLD."art" IS NOT NEW."art" OR OLD."name" IS NOT NEW."name" OR OLD."token_hash" IS NOT NEW."token_hash" OR OLD."eingerichtet_am" IS NOT NEW."eingerichtet_am" OR OLD."eingerichtet_von" IS NOT NEW."eingerichtet_von" OR OLD."eingerichtet_von_sub" IS NOT NEW."eingerichtet_von_sub" OR OLD."widerrufen_am" IS NOT NEW."widerrufen_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'update', 'rechner', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_rechner_delete AFTER DELETE ON "rechner"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'delete', 'rechner', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_anker_abweichung_create AFTER INSERT ON "anker_abweichung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'create', 'anker_abweichung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_anker_abweichung_update AFTER UPDATE ON "anker_abweichung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."rechner_id" IS NOT NEW."rechner_id" OR OLD."block" IS NOT NEW."block" OR OLD."erwartet" IS NOT NEW."erwartet" OR OLD."gemeldet" IS NOT NEW."gemeldet" OR OLD."zeitpunkt" IS NOT NEW."zeitpunkt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'update', 'anker_abweichung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_anker_abweichung_delete AFTER DELETE ON "anker_abweichung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'delete', 'anker_abweichung', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_freigabe_create AFTER INSERT ON "freigabe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'create', 'freigabe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_freigabe_update AFTER UPDATE ON "freigabe"
WHEN OLD."id" IS NOT NEW."id" OR OLD."zeitpunkt" IS NOT NEW."zeitpunkt" OR OLD."sub" IS NOT NEW."sub" OR OLD."name" IS NOT NEW."name" OR OLD."art" IS NOT NEW."art" OR OLD."rechner_id" IS NOT NEW."rechner_id" OR OLD."rechner_name" IS NOT NEW."rechner_name" OR OLD."bloecke" IS NOT NEW."bloecke" OR OLD."anzahl" IS NOT NEW."anzahl"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'update', 'freigabe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_freigabe_delete AFTER DELETE ON "freigabe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'delete', 'freigabe', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
