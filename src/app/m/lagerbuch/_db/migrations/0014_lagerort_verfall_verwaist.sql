-- DRK-377: die Meldung merkt sich SELBST, dass sie Material ueberlebt hat.
--
-- Der Ruecklauf aus der Entnahmebox darf eine Meldung nur dann abraeumen, wenn
-- ALLES Material sie mitgenommen hat. Die erste Fassung dieser Probe las das
-- aus dem Journal: „ist je etwas mit einem anderen Datum aus der Kiste
-- gegangen?".
--
-- ⚠️ UND GENAU DAS IST FALSCH, WEIL SIE GEGEN DEN HEUTIGEN WERT VERGLEICHT.
-- Ein Abgang, der zu SEINER Zeit genau zur damaligen Meldung passte, wird
-- rueckwirkend zum Abweichler, sobald spaeter eine andere Meldung an der Kiste
-- steht (Codex zu PR #194, fuenfter Befund):
--
--     Kiste leert sich sauber mit 2026-10   → Meldung faellt, alles richtig
--     neue Lieferung meldet 2027-01
--     Kiste leert sich sauber mit 2027-01   → der ALTE 2026-10-Abgang steht
--                                             noch im Journal und passt nicht
--                                             zu 2027-01 → Meldung bleibt
--
-- Die Kiste sammelte so Meldungen an, die niemand mehr wegbekommt — sie hat
-- keinen Verfall-Editor. Aus einer Schutzmassnahme wurde ein Dauerzustand.
--
-- DER ZUSTAND GEHOERT AN DIE MELDUNG, NICHT INS JOURNAL. `verwaist` wird in dem
-- Moment gesetzt, in dem Material die Kiste OHNE das gemeldete Datum verlaesst
-- — und nur dann. Damit haelt er genau so lange, wie die Meldung selbst haelt:
--
--   * Eine spaetere, fruehere Meldung ERSETZT den Wert (Upsert), laesst die
--     Markierung aber stehen — das verwaiste Material liegt ja weiter im Regal.
--   * Wird die Meldung sauber abgeraeumt, faellt die Zeile und mit ihr die
--     Markierung. Die naechste Meldung beginnt unbelastet.
--
-- ⚠️ BESTANDSZEILEN BEKOMMEN 0 UND NICHT 1. Wer heute eine Meldung traegt, hat
-- sie ueber einen Weg bekommen, den es vor dieser Aenderung gab; ob dabei je
-- Material ohne sein Datum gegangen ist, weiss niemand. Eine 1 waere eine
-- Behauptung und sperrte jede Altzeile dauerhaft — der Schaden, den diese
-- Migration gerade abstellt. Die 0 laesst den normalen Weg wieder greifen.
ALTER TABLE lagerort_verfall ADD COLUMN verwaist INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
-- ⚠️ DER AUDIT-TRIGGER MUSS MIT, SONST LAEUFT DIE NEUE SPALTE STILL AM
-- PRUEFPFAD VORBEI. `audit_lagerort_verfall_update` feuert nur, wenn sich eine
-- der in seiner WHEN-Klausel AUFGEZAEHLTEN Spalten aendert — eine neue Spalte
-- steht dort nicht von allein. Eine Aenderung, die AUSSCHLIESSLICH `verwaist`
-- setzt (genau das tut der Ruecklauf aus der Entnahmebox), erzeugte damit
-- keinen einzigen Audit-Eintrag: die Spalte, die entscheidet, ob eine
-- Verfallsmeldung je wieder verschwindet, waere die einzige ohne Spur.
--
-- SQLite kann eine WHEN-Klausel nicht aendern — der Trigger wird geworfen und
-- neu gebaut. `src/core/audit/catalog.test.ts` haelt die Vollstaendigkeit
-- spaltenweise fest und ist ohne diesen Block rot; gemessen.
DROP TRIGGER IF EXISTS audit_lagerort_verfall_update;--> statement-breakpoint
CREATE TRIGGER audit_lagerort_verfall_update AFTER UPDATE ON "lagerort_verfall"
WHEN OLD."id" IS NOT NEW."id" OR OLD."lagerort_id" IS NOT NEW."lagerort_id" OR OLD."artikel_id" IS NOT NEW."artikel_id" OR OLD."verfall" IS NOT NEW."verfall" OR OLD."erfasst_at" IS NOT NEW."erfasst_at" OR OLD."quelle_typ" IS NOT NEW."quelle_typ" OR OLD."quelle_id" IS NOT NEW."quelle_id" OR OLD."verwaist" IS NOT NEW."verwaist"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'lagerort_verfall', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
