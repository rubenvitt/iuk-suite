-- DRK-406: EIN ERSETZTER CODE KOMMT NIE ZURUECK.
--
-- 0015 hat den Ortscode eingefuehrt und das Zuruecksetzen als „alte Zeile
-- sperren, neue daneben" gebaut. Was dort fehlte, ist die Zusage, die die
-- Anwender-Notiz gibt: „der bisherige ist dann dauerhaft gesperrt". Gesperrt
-- war er — dauerhaft nicht.
--
-- ⚠️ DER WEG ZURUECK GING UEBER ZWEI KLICKS, und beide sind erlaubte
-- Handgriffe (gefunden in der Durchsicht): erst den NACHFOLGER sperren, dann
-- am Vorgaenger „Reaktivieren". Der Riegel dagegen war „hat dieser Ort schon
-- einen aktiven Code?" — und nach dem ersten Klick hat er keinen. Der
-- Teilindex `idx_tokens_ort_aktiv` sieht das nicht und kann es nicht sehen: es
-- ist zu jedem Zeitpunkt genau ein aktiver Code je Ort, nur eben der
-- verbrannte. Ein weggeworfenes Kaertchen, das jemand fotografiert hat, gilt
-- danach wieder.
--
-- ⚠️ DER ZWEITE WEG BRAUCHT NICHT EINMAL DEN ERSTEN KLICK. Beim Loeschen einer
-- Einheit muss `ort_id` geleert werden (Fremdschluessel, `_actions/loeschen.ts`)
-- — danach sind ihre gesperrten Codes von Altbestand nicht mehr zu
-- unterscheiden, und Altbestand DARF reaktiviert werden
-- (Betreiberentscheidung 17.09.2026). Genau deshalb reicht „hat eine `ort_id`"
-- als Merkmal nicht aus: das Merkmal muss den Verlust der `ort_id` ueberleben.
--
-- ⚠️ EIN ZEITSTEMPEL, KEIN `boolean`. Die Frage am Tresen lautet nicht „ist
-- dieser Code verbrannt", sondern „seit wann" — jemand steht mit einem alten
-- Foto da, und die Antwort entscheidet, ob seine Geschichte aufgeht. Ein
-- `boolean` haette dieselbe Sperre und keine Auskunft.
--
-- NULLBAR OHNE VORGABE: alles Bestehende ist nicht ersetzt. Kein Backfill.
ALTER TABLE `tokens` ADD `ersetzt_am` integer;--> statement-breakpoint
-- DER AUDIT-TRIGGER MUSS DIE NEUE SPALTE MITFUEHREN — dieselbe Lage wie in
-- 0015: `audit_tokens_update` haengt an einer aufgezaehlten `WHEN`-Klausel,
-- eine neue Spalte steht dort nicht von selbst, und die Luecke waere still.
-- Gerade hier waere sie teuer: das Verbrennen eines Codes ist genau der
-- Vorgang, den man spaeter nachlesen will. SQLite kann einen Trigger nicht
-- aendern; `DROP` und `CREATE` muessen in DERSELBEN Migration stehen.
-- `src/core/audit/catalog.test.ts` prueft das Spalte fuer Spalte.
DROP TRIGGER audit_tokens_update;--> statement-breakpoint
CREATE TRIGGER audit_tokens_update AFTER UPDATE ON "tokens"
WHEN OLD."id" IS NOT NEW."id" OR OLD."code" IS NOT NEW."code" OR OLD."label" IS NOT NEW."label" OR OLD."scope_lagerort_id" IS NOT NEW."scope_lagerort_id" OR OLD."ziel_typ" IS NOT NEW."ziel_typ" OR OLD."ziel_id" IS NOT NEW."ziel_id" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."created_by" IS NOT NEW."created_by" OR OLD."last_used_at" IS NOT NEW."last_used_at" OR OLD."ort_id" IS NOT NEW."ort_id" OR OLD."ersetzt_am" IS NOT NEW."ersetzt_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'tokens', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
