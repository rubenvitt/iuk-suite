-- scripts/import/fixtures/radio-quelle-ddl.sql
--
-- ZEICHENGLEICHE KOPIE der fuenf Migrationen von `radio-admin` am Freeze-SHA 265abd5:
--   server/drizzle/0000_confused_thena.sql   (api_tokens, device_events, devices,
--                                             software_versions, users + zwei Unique-Indizes
--                                             + device_events_device_id_idx)
--   server/drizzle/0001_cooing_overlord.sql  (devices.update_note  -> Position 24)
--   server/drizzle/0002_numerous_mandroid.sql(software_versions.sort_order, .is_target
--                                             + zwei Backfill-UPDATEs)
--   server/drizzle/0003_kind_spot.sql        (loans + loans_device_active_uidx, PARTIELL)
--   server/drizzle/0004_polite_redwing.sql   (devices.tei          -> Position 25)
-- in genau dieser Reihenfolge, ohne eine einzige Aenderung.
--
-- WOZU. Nur die Migrationsfolge erzeugt die PHYSISCHE Spaltenreihenfolge der Produktion.
-- Eine aus dem ZIELschema erzeugte Fixture haette die Zielreihenfolge, und der
-- Reihenfolge-Test aus Spec 2 §1.8 waere vakuoes — er wuerde gruen, ohne etwas zu pruefen.
-- Zweitens traegt nur diese Fassung `loans_device_active_uidx`, den partiellen Unique-Index,
-- den drizzle-kit nicht erzeugen kann und an dem Idempotenz-Fall B haengt.
--
-- ⚠️ DIESE DATEI IST KEINE MIGRATION. Sie wird ausschliesslich vom TEST gelesen
-- (scripts/import/fixtures/radio-quelle.ts), nie von einem Migrator. Vorbild fuer die
-- Trennung: src/app/m/lagerbuch/_db/herkunft/README.md:9-12 — dort liegt der Alt-Beleg
-- NEBEN migrations/ und nicht darin, aus genau diesem Grund.
--
-- ⚠️ REIHENFOLGE DER BENUTZUNG: erst die ganze Datei einspielen, DANN Zeilen einfuegen.
-- Nie verschachteln. Die zwei Backfill-UPDATEs aus 0002 schreiben `sort_order` und
-- `is_target` neu; laufen sie ueber bereits eingefuegte Zeilen, ist `is_target` still ein
-- anderer Wert als in der Fixture-Konstante — und A2 (genau eine Marke) prueft danach
-- etwas, das der Test selbst erzeugt hat.
--
-- ⚠️ NICHT VERAENDERN, auch nicht formatieren, auch nicht die Backticks entfernen. Wer hier
-- glattzieht, verliert entweder die Spaltenreihenfolge oder den partiellen Index — beides
-- still. `radio-admin` ist nach Spec 2 Kapitel 5 nur noch archiviert; danach ist diese Datei
-- die einzige Kopie der Quell-DDL in einem lebenden Repo.

-- ===== 0000_confused_thena.sql =====
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `device_events` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`changed_by` text,
	`changed_at` integer NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_events_device_id_idx` ON `device_events` (`device_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`rufname` text,
	`issi` text NOT NULL,
	`serial_number` text,
	`device_type` text,
	`status` text,
	`location` text,
	`assigned_to` text,
	`software_version` text,
	`last_updated_at` integer,
	`notes` text,
	`hiorg_id` text,
	`opta` text,
	`funktion` text,
	`hersteller` text,
	`bedieneinheit` text,
	`device_modes` text,
	`alamos_integrated` integer,
	`loanable` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_issi_unique` ON `devices` (`issi`);--> statement-breakpoint
CREATE TABLE `software_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `software_versions_value_unique` ON `software_versions` (`value`);--> statement-breakpoint
CREATE TABLE `users` (
	`sub` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`last_seen_at` integer NOT NULL
);


-- ===== 0001_cooing_overlord.sql =====
ALTER TABLE `devices` ADD `update_note` text;

-- ===== 0002_numerous_mandroid.sql =====
ALTER TABLE `software_versions` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `software_versions` ADD `is_target` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill display order from existing creation time (newest first → highest
-- sort_order), with rowid as a stable tiebreak for equal created_at.
UPDATE `software_versions`
SET `sort_order` = (
  SELECT COUNT(*) FROM `software_versions` AS s2
  WHERE s2.`created_at` < `software_versions`.`created_at`
     OR (s2.`created_at` = `software_versions`.`created_at` AND s2.`rowid` <= `software_versions`.`rowid`)
);--> statement-breakpoint
-- Backfill the explicit target flag to match the PREVIOUS computed reference
-- (newest createdAt among versions assigned to ≥1 device), so update status is
-- unchanged immediately after migrating. The admin can re-point it afterwards.
UPDATE `software_versions`
SET `is_target` = 1
WHERE `id` = (
  SELECT sv.`id` FROM `software_versions` AS sv
  WHERE EXISTS (SELECT 1 FROM `devices` AS d WHERE d.`software_version` = sv.`value`)
  ORDER BY sv.`created_at` DESC
  LIMIT 1
);


-- ===== 0003_kind_spot.sql =====
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`snapshot_call_sign` text NOT NULL,
	`snapshot_serial_number` text,
	`snapshot_device_type` text,
	`borrower_name` text NOT NULL,
	`borrowed_at` integer NOT NULL,
	`returned_at` integer,
	`return_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `loans_device_id_idx` ON `loans` (`device_id`);--> statement-breakpoint
CREATE INDEX `loans_borrowed_at_idx` ON `loans` (`borrowed_at`);--> statement-breakpoint
CREATE INDEX `loans_returned_at_idx` ON `loans` (`returned_at`);--> statement-breakpoint
-- Partial unique index: at most one ACTIVE loan (returned_at IS NULL) per device.
-- Hand-added because drizzle-kit cannot emit partial indexes; it is invisible to
-- the drizzle schema, so future `drizzle-kit generate` runs neither see nor drop
-- it. Do NOT regenerate this migration file — its hash is tracked and a changed
-- hash crash-loops already-migrated databases.
CREATE UNIQUE INDEX `loans_device_active_uidx` ON `loans` (`device_id`) WHERE `returned_at` IS NULL;

-- ===== 0004_polite_redwing.sql =====
ALTER TABLE `devices` ADD `tei` text;
