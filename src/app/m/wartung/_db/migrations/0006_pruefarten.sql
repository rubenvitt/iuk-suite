-- IDA-368: Prüfarten als Katalog. Bisher hatte jede Geräteart eigene Fristen (`frist.art_id`); jetzt steht jede
-- Prüfart einmal in `pruefart`, die Art schaltet ihre zu (`art_pruefart`), und ein Gerät weicht ab
-- (`geraet_pruefart`).
--
-- Übernahme: Fristen mit gleichem Namen und gleichem `wer` werden EINE Prüfart. Sie behält die ID und das
-- Intervall der ersten (nach Position der Art, dann der Frist) — so zeigen die meisten Verlaufseinträge weiter
-- auf dieselbe ID. Hatte eine andere Art dieselbe Prüfart mit anderem Intervall, bekommt jedes ihrer Geräte
-- dieses Intervall als eigenes (`geraet_pruefart` mit `an = 1`): fällig wird danach nichts anders als vorher.
--
-- Reihenfolge mit Absicht: `eintrag` wird zuerst neu gebaut (Verweis auf `pruefart` statt `frist`), erst danach
-- fällt `frist`. Der Migrator läuft in einer Transaktion, in der `PRAGMA foreign_keys=OFF` nichts bewirkt; fiele
-- `frist` zuerst, setzte ON DELETE SET NULL jeden Verweis im Verlauf auf NULL. Die Audit-Trigger der neuen
-- Tabellen entstehen nach der Übernahme, damit die Umstellung nicht als hunderte Änderungen im Protokoll steht.
CREATE TABLE `art_pruefart` (
	`art_id` text NOT NULL,
	`pruefart_id` text NOT NULL,
	PRIMARY KEY(`art_id`, `pruefart_id`),
	FOREIGN KEY (`art_id`) REFERENCES `art`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pruefart_id`) REFERENCES `pruefart`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `art_pruefart_pruefart_idx` ON `art_pruefart` (`pruefart_id`);--> statement-breakpoint
CREATE TABLE `geraet_pruefart` (
	`geraet_id` text NOT NULL,
	`pruefart_id` text NOT NULL,
	`an` integer NOT NULL,
	`monate` integer,
	`stunden` integer,
	PRIMARY KEY(`geraet_id`, `pruefart_id`),
	FOREIGN KEY (`geraet_id`) REFERENCES `geraet`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pruefart_id`) REFERENCES `pruefart`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "geraet_pruefart_monate" CHECK(monate IS NULL OR monate > 0),
	CONSTRAINT "geraet_pruefart_stunden" CHECK(stunden IS NULL OR stunden > 0)
);
--> statement-breakpoint
CREATE INDEX `geraet_pruefart_pruefart_idx` ON `geraet_pruefart` (`pruefart_id`);--> statement-breakpoint
CREATE TABLE `pruefart` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`wer` text NOT NULL,
	`monate` integer,
	`stunden` integer,
	`position` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pruefart_wer" CHECK(wer IN ('intern','fachfirma','elektrofachkraft')),
	CONSTRAINT "pruefart_intervall" CHECK((monate IS NOT NULL AND monate > 0) OR (stunden IS NOT NULL AND stunden > 0))
);
--> statement-breakpoint
CREATE TABLE `__frist_zu_pruefart` (
	`frist_id` text PRIMARY KEY NOT NULL,
	`pruefart_id` text NOT NULL,
	`art_id` text NOT NULL,
	`monate` integer,
	`stunden` integer
);
--> statement-breakpoint
INSERT INTO `__frist_zu_pruefart` (frist_id, pruefart_id, art_id, monate, stunden)
SELECT f.id,
  (SELECT f2.id FROM frist f2 JOIN art a2 ON a2.id = f2.art_id WHERE f2.name = f.name AND f2.wer = f.wer
    ORDER BY a2.position, f2.position, f2.id LIMIT 1),
  f.art_id, f.monate, f.stunden
FROM frist f;
--> statement-breakpoint
INSERT INTO `pruefart` (id, name, wer, monate, stunden, position)
SELECT f.id, f.name, f.wer, f.monate, f.stunden, ROW_NUMBER() OVER (ORDER BY a.position, f.position, f.id) - 1
FROM frist f JOIN art a ON a.id = f.art_id
WHERE f.id IN (SELECT DISTINCT pruefart_id FROM `__frist_zu_pruefart`);
--> statement-breakpoint
INSERT OR IGNORE INTO `art_pruefart` (art_id, pruefart_id) SELECT art_id, pruefart_id FROM `__frist_zu_pruefart`;
--> statement-breakpoint
INSERT OR IGNORE INTO `geraet_pruefart` (geraet_id, pruefart_id, an, monate, stunden)
SELECT g.id, m.pruefart_id, 1, m.monate, m.stunden
FROM `__frist_zu_pruefart` m
JOIN `pruefart` p ON p.id = m.pruefart_id
JOIN `geraet` g ON g.art_id = m.art_id
WHERE m.monate IS NOT p.monate OR m.stunden IS NOT p.stunden;
--> statement-breakpoint
CREATE TABLE `__new_eintrag` (
	`id` text PRIMARY KEY NOT NULL,
	`geraet_id` text NOT NULL,
	`typ` text NOT NULL,
	`pruefart_id` text,
	`titel` text NOT NULL,
	`am` text NOT NULL,
	`stunden` integer,
	`wer` text DEFAULT '' NOT NULL,
	`notiz` text DEFAULT '' NOT NULL,
	`ergebnis` text,
	`antworten` text,
	`maengel` integer DEFAULT 0 NOT NULL,
	`angelegt_am` integer NOT NULL,
	FOREIGN KEY (`geraet_id`) REFERENCES `geraet`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pruefart_id`) REFERENCES `pruefart`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "eintrag_typ" CHECK(typ IN ('pruefung','erledigt','stunden','mangel','behoben')),
	CONSTRAINT "eintrag_am" CHECK(am GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "eintrag_ergebnis" CHECK(ergebnis IS NULL OR ergebnis IN ('ok','mangel','defekt'))
);
--> statement-breakpoint
INSERT INTO `__new_eintrag`("id", "geraet_id", "typ", "pruefart_id", "titel", "am", "stunden", "wer", "notiz", "ergebnis", "antworten", "maengel", "angelegt_am")
SELECT e."id", e."geraet_id", e."typ", m.pruefart_id, e."titel", e."am", e."stunden", e."wer", e."notiz", e."ergebnis", e."antworten", e."maengel", e."angelegt_am"
FROM `eintrag` e LEFT JOIN `__frist_zu_pruefart` m ON m.frist_id = e.frist_id;
--> statement-breakpoint
DROP TABLE `eintrag`;--> statement-breakpoint
ALTER TABLE `__new_eintrag` RENAME TO `eintrag`;--> statement-breakpoint
CREATE INDEX `eintrag_geraet_idx` ON `eintrag` (`geraet_id`,`am`);--> statement-breakpoint
CREATE INDEX `eintrag_pruefart_idx` ON `eintrag` (`geraet_id`,`pruefart_id`,`am`);--> statement-breakpoint
DROP TABLE `__frist_zu_pruefart`;--> statement-breakpoint
DROP TABLE `frist`;--> statement-breakpoint
CREATE TRIGGER audit_eintrag_create AFTER INSERT ON "eintrag"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'eintrag', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_eintrag_update AFTER UPDATE ON "eintrag"
WHEN OLD."id" IS NOT NEW."id" OR OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."typ" IS NOT NEW."typ" OR OLD."pruefart_id" IS NOT NEW."pruefart_id" OR OLD."titel" IS NOT NEW."titel" OR OLD."am" IS NOT NEW."am" OR OLD."stunden" IS NOT NEW."stunden" OR OLD."wer" IS NOT NEW."wer" OR OLD."notiz" IS NOT NEW."notiz" OR OLD."ergebnis" IS NOT NEW."ergebnis" OR OLD."antworten" IS NOT NEW."antworten" OR OLD."maengel" IS NOT NEW."maengel" OR OLD."angelegt_am" IS NOT NEW."angelegt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'eintrag', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_eintrag_delete AFTER DELETE ON "eintrag"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'eintrag', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_pruefart_create AFTER INSERT ON "pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'pruefart', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_pruefart_update AFTER UPDATE ON "pruefart"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."wer" IS NOT NEW."wer" OR OLD."monate" IS NOT NEW."monate" OR OLD."stunden" IS NOT NEW."stunden" OR OLD."position" IS NOT NEW."position"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'pruefart', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_pruefart_delete AFTER DELETE ON "pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'pruefart', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_art_pruefart_create AFTER INSERT ON "art_pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'art_pruefart', suite_audit_reference(json_array(NEW.art_id,NEW.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_art_pruefart_update AFTER UPDATE ON "art_pruefart"
WHEN OLD."art_id" IS NOT NEW."art_id" OR OLD."pruefart_id" IS NOT NEW."pruefart_id"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'art_pruefart', suite_audit_reference(json_array(NEW.art_id,NEW.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_art_pruefart_delete AFTER DELETE ON "art_pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'art_pruefart', suite_audit_reference(json_array(OLD.art_id,OLD.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_geraet_pruefart_create AFTER INSERT ON "geraet_pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'create', 'geraet_pruefart', suite_audit_reference(json_array(NEW.geraet_id,NEW.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_geraet_pruefart_update AFTER UPDATE ON "geraet_pruefart"
WHEN OLD."geraet_id" IS NOT NEW."geraet_id" OR OLD."pruefart_id" IS NOT NEW."pruefart_id" OR OLD."an" IS NOT NEW."an" OR OLD."monate" IS NOT NEW."monate" OR OLD."stunden" IS NOT NEW."stunden"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'update', 'geraet_pruefart', suite_audit_reference(json_array(NEW.geraet_id,NEW.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_geraet_pruefart_delete AFTER DELETE ON "geraet_pruefart"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'wartung', 'delete', 'geraet_pruefart', suite_audit_reference(json_array(OLD.geraet_id,OLD.pruefart_id)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
