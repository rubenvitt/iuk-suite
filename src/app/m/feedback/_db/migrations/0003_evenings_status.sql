-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die Audit-Trigger
-- aus 0002 nicht. Es erzeugte zwar das `ALTER TABLE`, liesse `audit_evenings_update`
-- aber still auf seiner alten Spaltenkette stehen — eine Aenderung von `status`
-- allein loeste dann keine Protokollzeile aus, und der einzige Hinweis darauf waere
-- ein roter `src/core/audit/catalog.test.ts` ("audit UPDATE must cover every
-- persisted column"). Vorbild: lagerbuch/_db/migrations/0005_artikel_kategorie.sql.
--
-- Die CHECK-Klausel darf hier mit an die Spalte: SQLite nimmt sie bei ADD COLUMN an
-- und erzwingt sie ab sofort (gemessen gegen better-sqlite3, SQLite 3.53.4) — ein
-- Neuaufbau der Tabelle waere unnoetig und haette die drei Trigger und den
-- Fremdschluessel aus `surveys` mitgerissen.
--
-- `held` als Vorgabe fuellt jede BESTEHENDE Zeile: alle heute vorhandenen Abende
-- sind vergangene, ein `planned` waere dort schlicht falsch. Begruendung der drei
-- Werte im Kopf von `_db/schema.ts`.
ALTER TABLE `evenings` ADD `status` text DEFAULT 'held' NOT NULL CHECK (`status` IN ('planned','held','cancelled'));--> statement-breakpoint
DROP TRIGGER audit_evenings_update;--> statement-breakpoint
CREATE TRIGGER audit_evenings_update AFTER UPDATE ON "evenings"
WHEN OLD."id" IS NOT NEW."id" OR OLD."group_id" IS NOT NEW."group_id" OR OLD."date" IS NOT NEW."date" OR OLD."topic" IS NOT NEW."topic" OR OLD."notes" IS NOT NEW."notes" OR OLD."participant_count" IS NOT NEW."participant_count" OR OLD."status" IS NOT NEW."status" OR OLD."created_at" IS NOT NEW."created_at"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'feedback', 'update', 'evenings', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
