-- Jede Änderung an Schicht, Einteilung, Einheit oder Aushilfe stempelt `planung.aktualisiert_am`
-- (`_lib/daten.ts`, `beruehrt`). Der UPDATE-Trigger zählte die Spalte mit und schrieb so zu jeder Aktion
-- eine zweite Audit-Zeile „Planung geändert" (Ruben, 01.11.2026: zu viele Audit-Einträge). Die eigentliche
-- Änderung steht schon in der Zeile ihrer Tabelle; `AUDIT_TABLES.schichtplan.planung.unauditedColumns`.
DROP TRIGGER audit_planung_update;
--> statement-breakpoint
CREATE TRIGGER audit_planung_update AFTER UPDATE ON "planung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."art" IS NOT NEW."art" OR OLD."ort" IS NOT NEW."ort" OR OLD."von" IS NOT NEW."von" OR OLD."bis" IS NOT NEW."bis" OR OLD."max_dienst_min" IS NOT NEW."max_dienst_min" OR OLD."min_ruhe_min" IS NOT NEW."min_ruhe_min" OR OLD."angelegt_am" IS NOT NEW."angelegt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'schichtplan', 'update', 'planung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
