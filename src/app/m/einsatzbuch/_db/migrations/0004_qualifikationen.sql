-- IDA-282: Die Qualifikationen des Personals stehen in einer Tabelle statt fest im Code
-- (`vorlage.ts`, `QUALIFIKATIONEN`). Übernommen werden die fünf bisherigen in ihrer Rangfolge, mit
-- festen IDs: an ihnen hängt die eingebaute HiOrg-Zuordnung (`helferAbgleich.ts`, `ZUORDNUNG`), auch
-- nach einer geänderten Kurzform. Ein Kürzel am Personal, das keine der fünf ist (Altbestand vor
-- DRK-488), wird eine eigene Qualifikation hinter ihnen, damit niemand ohne gültige Qualifikation
-- dasteht. Kein Trigger `stand_*`: die App bekommt die Liste nicht, nur die Kürzel am Personal.
CREATE TABLE `qualifikation` (
	`id` text PRIMARY KEY NOT NULL,
	`kurz` text NOT NULL,
	`lang` text NOT NULL,
	`rang` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qualifikation_kurz_unique` ON `qualifikation` (`kurz`);
--> statement-breakpoint
CREATE TRIGGER audit_qualifikation_create AFTER INSERT ON "qualifikation"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'create', 'qualifikation', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_qualifikation_update AFTER UPDATE ON "qualifikation"
WHEN OLD."id" IS NOT NEW."id" OR OLD."kurz" IS NOT NEW."kurz" OR OLD."lang" IS NOT NEW."lang" OR OLD."rang" IS NOT NEW."rang"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'update', 'qualifikation', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_qualifikation_delete AFTER DELETE ON "qualifikation"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'delete', 'qualifikation', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
INSERT INTO `qualifikation` (`id`, `kurz`, `lang`, `rang`) VALUES
  ('notsan', 'NotSan', 'Notfallsanitäter', 1),
  ('rettass', 'RettAss', 'Rettungsassistent', 2),
  ('rs', 'RS', 'Rettungssanitäter', 3),
  ('sik', 'SiK', 'Sanitäter im Katastrophenschutz', 4),
  ('sanh', 'SanH', 'Sanitätshelfer', 5);
--> statement-breakpoint
INSERT INTO `qualifikation` (`id`, `kurz`, `lang`, `rang`)
SELECT lower(hex(randomblob(10))), quali, quali, 6 FROM (SELECT DISTINCT quali FROM person WHERE quali NOT IN (SELECT kurz FROM qualifikation));
