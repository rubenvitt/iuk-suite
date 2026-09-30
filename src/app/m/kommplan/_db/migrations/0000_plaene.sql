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
CREATE TABLE `bib_einheit` (
	`id` text PRIMARY KEY NOT NULL,
	`typ` text NOT NULL,
	`rufname` text NOT NULL,
	`zeichen` text,
	`notiz` text
);
--> statement-breakpoint
CREATE TABLE `bib_stelle` (
	`id` text PRIMARY KEY NOT NULL,
	`titel` text NOT NULL,
	`zeichen` text,
	`leiter` text,
	`kontakte` text DEFAULT '[]' NOT NULL,
	`notiz` text,
	CONSTRAINT "bib_stelle_kontakte_json" CHECK(json_valid("bib_stelle"."kontakte"))
);
--> statement-breakpoint
CREATE TABLE `bib_verbindung` (
	`id` text PRIMARY KEY NOT NULL,
	`art` text NOT NULL,
	`bezeichnung` text NOT NULL,
	`notiz` text,
	CONSTRAINT "bib_verbindung_art_check" CHECK("bib_verbindung"."art" IN ('tmo','dmo','analogfunk','draht','telefon','mobil','fax','daten'))
);
--> statement-breakpoint
CREATE TABLE `plan` (
	`id` text PRIMARY KEY NOT NULL,
	`titel` text NOT NULL,
	`typ` text NOT NULL,
	`anlass` text,
	`datum` integer,
	`ist_vorlage` integer DEFAULT false NOT NULL,
	`archiviert_am` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`aktualisiert_am` integer NOT NULL,
	`aktualisiert_von` text NOT NULL,
	`inhalt` text NOT NULL,
	CONSTRAINT "plan_typ_check" CHECK("plan"."typ" IN ('kommunikationsplan','fernmeldeskizze')),
	CONSTRAINT "plan_inhalt_json" CHECK(json_valid("plan"."inhalt")),
	CONSTRAINT "plan_version_positiv" CHECK("plan"."version" >= 1)
);
--> statement-breakpoint
CREATE INDEX `plan_liste_idx` ON `plan` (`archiviert_am`,`aktualisiert_am`);--> statement-breakpoint
CREATE TABLE `plan_freigabe` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`token` text NOT NULL,
	`notiz` text,
	`ablauf` integer,
	`widerrufen_am` integer,
	`erstellt_am` integer NOT NULL,
	`erstellt_von` text NOT NULL,
	`zuletzt_abgerufen` integer,
	`abrufe` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_freigabe_token_idx` ON `plan_freigabe` (`token`);--> statement-breakpoint
CREATE INDEX `plan_freigabe_plan_idx` ON `plan_freigabe` (`plan_id`);
--> statement-breakpoint
CREATE TRIGGER audit_plan_create AFTER INSERT ON "plan"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'plan', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_update AFTER UPDATE ON "plan"
WHEN OLD."id" IS NOT NEW."id" OR OLD."titel" IS NOT NEW."titel" OR OLD."typ" IS NOT NEW."typ" OR OLD."anlass" IS NOT NEW."anlass" OR OLD."datum" IS NOT NEW."datum" OR OLD."ist_vorlage" IS NOT NEW."ist_vorlage" OR OLD."archiviert_am" IS NOT NEW."archiviert_am" OR OLD."version" IS NOT NEW."version" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am" OR OLD."aktualisiert_von" IS NOT NEW."aktualisiert_von" OR OLD."inhalt" IS NOT NEW."inhalt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'plan', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_delete AFTER DELETE ON "plan"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'plan', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_stelle_create AFTER INSERT ON "bib_stelle"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'bib_stelle', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_stelle_update AFTER UPDATE ON "bib_stelle"
WHEN OLD."id" IS NOT NEW."id" OR OLD."titel" IS NOT NEW."titel" OR OLD."zeichen" IS NOT NEW."zeichen" OR OLD."leiter" IS NOT NEW."leiter" OR OLD."kontakte" IS NOT NEW."kontakte" OR OLD."notiz" IS NOT NEW."notiz"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'bib_stelle', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_stelle_delete AFTER DELETE ON "bib_stelle"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'bib_stelle', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_einheit_create AFTER INSERT ON "bib_einheit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'bib_einheit', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_einheit_update AFTER UPDATE ON "bib_einheit"
WHEN OLD."id" IS NOT NEW."id" OR OLD."typ" IS NOT NEW."typ" OR OLD."rufname" IS NOT NEW."rufname" OR OLD."zeichen" IS NOT NEW."zeichen" OR OLD."notiz" IS NOT NEW."notiz"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'bib_einheit', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_einheit_delete AFTER DELETE ON "bib_einheit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'bib_einheit', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_verbindung_create AFTER INSERT ON "bib_verbindung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'bib_verbindung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_verbindung_update AFTER UPDATE ON "bib_verbindung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."art" IS NOT NEW."art" OR OLD."bezeichnung" IS NOT NEW."bezeichnung" OR OLD."notiz" IS NOT NEW."notiz"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'bib_verbindung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_verbindung_delete AFTER DELETE ON "bib_verbindung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'bib_verbindung', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_freigabe_create AFTER INSERT ON "plan_freigabe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'plan_freigabe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_freigabe_update AFTER UPDATE ON "plan_freigabe"
WHEN OLD."id" IS NOT NEW."id" OR OLD."plan_id" IS NOT NEW."plan_id" OR OLD."token" IS NOT NEW."token" OR OLD."notiz" IS NOT NEW."notiz" OR OLD."ablauf" IS NOT NEW."ablauf" OR OLD."widerrufen_am" IS NOT NEW."widerrufen_am" OR OLD."erstellt_am" IS NOT NEW."erstellt_am" OR OLD."erstellt_von" IS NOT NEW."erstellt_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'plan_freigabe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_freigabe_delete AFTER DELETE ON "plan_freigabe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'plan_freigabe', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
