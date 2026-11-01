-- IDA-320/IDA-315: Grundbestand des Moduls gemeinschaft. Tabellen von drizzle-kit generiert, die Audit-Trigger
-- (je audited Tabelle create/update/delete, AUDIT_TABLES.gemeinschaft) von Hand angehängt: drizzle-kit
-- kennt sie nicht. Wer eine Spalte ergänzt, setzt den UPDATE-Trigger in derselben Migration neu.
CREATE TABLE `anfrage` (
	`id` text PRIMARY KEY NOT NULL,
	`raum` text DEFAULT 'bar' NOT NULL,
	`status` text DEFAULT 'angefragt' NOT NULL,
	`code` text NOT NULL,
	`von` integer NOT NULL,
	`bis` integer NOT NULL,
	`anlass` text NOT NULL,
	`personen` integer NOT NULL,
	`person` text NOT NULL,
	`kontakt` text NOT NULL,
	`hinweis` text DEFAULT '' NOT NULL,
	`mitglied` integer DEFAULT false NOT NULL,
	`begruendung` text DEFAULT '' NOT NULL,
	`vertrag` text DEFAULT 'offen' NOT NULL,
	`eingegangen_am` integer NOT NULL,
	`entschieden_am` integer,
	CONSTRAINT "anfrage_status" CHECK(status IN ('angefragt','zugesagt','abgelehnt','zurueckgezogen')),
	CONSTRAINT "anfrage_vertrag" CHECK(vertrag IN ('offen','verschickt','unterschrieben')),
	CONSTRAINT "anfrage_zeitraum" CHECK(bis > von),
	CONSTRAINT "anfrage_personen" CHECK(personen > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anfrage_code_idx` ON `anfrage` (`code`);--> statement-breakpoint
CREATE INDEX `anfrage_raum_von_idx` ON `anfrage` (`raum`,`von`);--> statement-breakpoint
CREATE TABLE `audit_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`module` text NOT NULL,
	`action` text NOT NULL,
	`object_type` text NOT NULL,
	`object_ref` text,
	`actor` text NOT NULL,
	`result` text NOT NULL,
	`origin` text NOT NULL,
	`correlation_id` text,
	CONSTRAINT "audit_outbox_actor_json" CHECK(json_valid("audit_outbox"."actor"))
);
--> statement-breakpoint
CREATE INDEX `audit_outbox_occurred_idx` ON `audit_outbox` (`occurred_at`,`id`);--> statement-breakpoint
CREATE TABLE `aufgabe` (
	`id` text PRIMARY KEY NOT NULL,
	`vorhaben_id` text NOT NULL,
	`titel` text NOT NULL,
	`faellig` text,
	`erledigt_am` integer,
	`position` integer NOT NULL,
	`angelegt_am` integer NOT NULL,
	FOREIGN KEY (`vorhaben_id`) REFERENCES `vorhaben`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "aufgabe_faellig_tag" CHECK(faellig IS NULL OR faellig GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `aufgabe_vorhaben_idx` ON `aufgabe` (`vorhaben_id`,`position`);--> statement-breakpoint
CREATE TABLE `mitglied` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`telefon` text DEFAULT '' NOT NULL,
	`link` text NOT NULL,
	`angelegt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mitglied_link_idx` ON `mitglied` (`link`);--> statement-breakpoint
CREATE TABLE `sperrzeit` (
	`id` text PRIMARY KEY NOT NULL,
	`raum` text DEFAULT 'bar' NOT NULL,
	`von` integer NOT NULL,
	`bis` integer NOT NULL,
	`grund` text NOT NULL,
	`angelegt_am` integer NOT NULL,
	CONSTRAINT "sperrzeit_zeitraum" CHECK(bis > von)
);
--> statement-breakpoint
CREATE INDEX `sperrzeit_raum_von_idx` ON `sperrzeit` (`raum`,`von`);--> statement-breakpoint
CREATE TABLE `vertragsdatei` (
	`anfrage_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`groesse` integer NOT NULL,
	`inhalt` blob NOT NULL,
	`abgelegt_am` integer NOT NULL,
	FOREIGN KEY (`anfrage_id`) REFERENCES `anfrage`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vorhaben` (
	`id` text PRIMARY KEY NOT NULL,
	`art` text NOT NULL,
	`titel` text NOT NULL,
	`beschreibung` text DEFAULT '' NOT NULL,
	`verantwortlich_id` text,
	`projekt_id` text,
	`von` integer,
	`bis` integer,
	`ort` text DEFAULT '' NOT NULL,
	`bar_belegen` integer DEFAULT false NOT NULL,
	`ziel` text,
	`angelegt_am` integer NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	FOREIGN KEY (`verantwortlich_id`) REFERENCES `mitglied`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "vorhaben_art" CHECK(art IN ('event','projekt')),
	CONSTRAINT "vorhaben_event_zeit" CHECK(art <> 'event' OR (von IS NOT NULL AND bis IS NOT NULL AND bis > von)),
	CONSTRAINT "vorhaben_projekt_ohne_zeit" CHECK(art <> 'projekt' OR (von IS NULL AND bis IS NULL AND projekt_id IS NULL AND bar_belegen = 0)),
	CONSTRAINT "vorhaben_ziel_tag" CHECK(ziel IS NULL OR ziel GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `vorhaben_art_von_idx` ON `vorhaben` (`art`,`von`);--> statement-breakpoint
CREATE INDEX `vorhaben_projekt_idx` ON `vorhaben` (`projekt_id`);--> statement-breakpoint
CREATE TABLE `zustaendig` (
	`aufgabe_id` text NOT NULL,
	`mitglied_id` text NOT NULL,
	PRIMARY KEY(`aufgabe_id`, `mitglied_id`),
	FOREIGN KEY (`aufgabe_id`) REFERENCES `aufgabe`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mitglied_id`) REFERENCES `mitglied`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `zustaendig_mitglied_idx` ON `zustaendig` (`mitglied_id`);
--> statement-breakpoint
CREATE TRIGGER audit_mitglied_create AFTER INSERT ON "mitglied"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'mitglied', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_mitglied_update AFTER UPDATE ON "mitglied"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."telefon" IS NOT NEW."telefon" OR OLD."link" IS NOT NEW."link" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'mitglied', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_mitglied_delete AFTER DELETE ON "mitglied"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'mitglied', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vorhaben_create AFTER INSERT ON "vorhaben"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'vorhaben', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vorhaben_update AFTER UPDATE ON "vorhaben"
WHEN OLD."id" IS NOT NEW."id" OR OLD."art" IS NOT NEW."art" OR OLD."titel" IS NOT NEW."titel" OR OLD."beschreibung" IS NOT NEW."beschreibung" OR OLD."verantwortlich_id" IS NOT NEW."verantwortlich_id" OR OLD."projekt_id" IS NOT NEW."projekt_id" OR OLD."von" IS NOT NEW."von" OR OLD."bis" IS NOT NEW."bis" OR OLD."ort" IS NOT NEW."ort" OR OLD."bar_belegen" IS NOT NEW."bar_belegen" OR OLD."ziel" IS NOT NEW."ziel" OR OLD."angelegt_am" IS NOT NEW."angelegt_am" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'vorhaben', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vorhaben_delete AFTER DELETE ON "vorhaben"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'vorhaben', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_aufgabe_create AFTER INSERT ON "aufgabe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'aufgabe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_aufgabe_update AFTER UPDATE ON "aufgabe"
WHEN OLD."id" IS NOT NEW."id" OR OLD."vorhaben_id" IS NOT NEW."vorhaben_id" OR OLD."titel" IS NOT NEW."titel" OR OLD."faellig" IS NOT NEW."faellig" OR OLD."erledigt_am" IS NOT NEW."erledigt_am" OR OLD."position" IS NOT NEW."position" OR OLD."angelegt_am" IS NOT NEW."angelegt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'aufgabe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_aufgabe_delete AFTER DELETE ON "aufgabe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'aufgabe', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zustaendig_create AFTER INSERT ON "zustaendig"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'zustaendig', suite_audit_reference(json_array(NEW.aufgabe_id,NEW.mitglied_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zustaendig_update AFTER UPDATE ON "zustaendig"
WHEN OLD."aufgabe_id" IS NOT NEW."aufgabe_id" OR OLD."mitglied_id" IS NOT NEW."mitglied_id"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'zustaendig', suite_audit_reference(json_array(NEW.aufgabe_id,NEW.mitglied_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_zustaendig_delete AFTER DELETE ON "zustaendig"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'zustaendig', suite_audit_reference(json_array(OLD.aufgabe_id,OLD.mitglied_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_sperrzeit_create AFTER INSERT ON "sperrzeit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'sperrzeit', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_sperrzeit_update AFTER UPDATE ON "sperrzeit"
WHEN OLD."id" IS NOT NEW."id" OR OLD."raum" IS NOT NEW."raum" OR OLD."von" IS NOT NEW."von" OR OLD."bis" IS NOT NEW."bis" OR OLD."grund" IS NOT NEW."grund" OR OLD."angelegt_am" IS NOT NEW."angelegt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'sperrzeit', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_sperrzeit_delete AFTER DELETE ON "sperrzeit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'sperrzeit', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_anfrage_create AFTER INSERT ON "anfrage"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'anfrage', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_anfrage_update AFTER UPDATE ON "anfrage"
WHEN OLD."id" IS NOT NEW."id" OR OLD."raum" IS NOT NEW."raum" OR OLD."status" IS NOT NEW."status" OR OLD."code" IS NOT NEW."code" OR OLD."von" IS NOT NEW."von" OR OLD."bis" IS NOT NEW."bis" OR OLD."anlass" IS NOT NEW."anlass" OR OLD."personen" IS NOT NEW."personen" OR OLD."person" IS NOT NEW."person" OR OLD."kontakt" IS NOT NEW."kontakt" OR OLD."hinweis" IS NOT NEW."hinweis" OR OLD."mitglied" IS NOT NEW."mitglied" OR OLD."begruendung" IS NOT NEW."begruendung" OR OLD."vertrag" IS NOT NEW."vertrag" OR OLD."eingegangen_am" IS NOT NEW."eingegangen_am" OR OLD."entschieden_am" IS NOT NEW."entschieden_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'anfrage', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_anfrage_delete AFTER DELETE ON "anfrage"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'anfrage', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsdatei_create AFTER INSERT ON "vertragsdatei"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'create', 'vertragsdatei', suite_audit_reference(NEW.anfrage_id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsdatei_update AFTER UPDATE ON "vertragsdatei"
WHEN OLD."anfrage_id" IS NOT NEW."anfrage_id" OR OLD."name" IS NOT NEW."name" OR OLD."groesse" IS NOT NEW."groesse" OR OLD."inhalt" IS NOT NEW."inhalt" OR OLD."abgelegt_am" IS NOT NEW."abgelegt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'update', 'vertragsdatei', suite_audit_reference(NEW.anfrage_id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_vertragsdatei_delete AFTER DELETE ON "vertragsdatei"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'gemeinschaft', 'delete', 'vertragsdatei', suite_audit_reference(OLD.anfrage_id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
