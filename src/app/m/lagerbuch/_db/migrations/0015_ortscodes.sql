-- DRK-406: DER ZUGANGS-CODE GEHOERT AB HIER EINEM ORT.
--
-- Bis hierher war ein Kaertchen ein freistehendes Ding: jemand legte es an,
-- gab ihm eine Bezeichnung und waehlte ein Ziel. Ab jetzt hat der Handlager,
-- jedes Fahrzeug und jede Tasche GENAU EINEN aktiven Code, und er entsteht
-- ohne Handgriff. Diese Spalte ist die Zugehoerigkeit.
--
-- ⚠️ `ort_id` IST NICHT `ziel_id`, UND SIE ZU VERSCHMELZEN WAERE DER ERSTE
-- FEHLGRIFF. `ziel_id` sagt, WO JEMAND LANDET, der den Code einloest —
-- polymorph, je nach `ziel_typ` eine `lagerorte.id` oder eine `artikel.id`,
-- und fuer die Zielart „Artikel-Liste" ueberhaupt leer. `ort_id` sagt, WEM DER
-- CODE GEHOERT, also an welcher Karte er klebt. Fuer eine Einheit fallen beide
-- heute zusammen; fuer den Handlager gerade NICHT: sein Code traegt `ort_id =
-- 'handlager'` und `ziel_typ = NULL`, weil die Landung die Artikelliste ist und
-- nicht „der Ort Handlager". Ein gemeinsames Feld haette den Handlager-Code
-- entweder um seine Zugehoerigkeit oder um seine Landung gebracht.
--
-- ⚠️ NULLBAR, UND DAS IST DER ALTBESTAND (Betreiberentscheidung 17.09.2026).
-- Jedes heute von Hand angelegte Kaertchen behaelt `ort_id = NULL` und
-- funktioniert unveraendert weiter. Ein NOT NULL haette einen Rollout-Stichtag
-- erzwungen, an dem jedes laminierte Kaertchen im Umlauf aufhoert zu wirken —
-- und zwar mitten in einer Schicht.
--
-- ⚠️ KEIN BACKFILL IN DIESER MIGRATION, und das ist keine Bequemlichkeit: ein
-- Code muss aus `TOKEN_ALPHABET` gezogen und gegen ALLE vorhandenen Zeilen auf
-- Kollision geprueft werden (Entscheidung 8-F, `_actions/tokens.ts`). In SQL
-- waere das eine zweite, nachgebaute Ziehung neben der in TypeScript — mit
-- eigenem Zufall, eigener Kollisionsbehandlung und eigener Schreibweise des
-- Bindestrichs. Zwei Ziehungen fuer denselben Namensraum laufen auseinander,
-- und das faellt erst auf, wenn zwei Karten denselben Code tragen. Die Codes
-- entstehen deshalb im Schreibpfad (`_lib/schreibpfade/ortCodes.ts`), der beim
-- Anlegen einer Einheit und beim Oeffnen der Ortsetiketten laeuft.
ALTER TABLE `tokens` ADD `ort_id` text REFERENCES lagerorte(id);--> statement-breakpoint
-- DIE ZUSAGE „GENAU EINER" STEHT IN DER DATENBANK, NICHT NUR IM SCHREIBPFAD.
--
-- ⚠️ DER INDEX IST TEILWEISE, UND BEIDE BEDINGUNGEN TRAGEN. `ort_id IS NOT
-- NULL` laesst den Altbestand in Ruhe (SQLite behandelt NULLs in einem
-- gewoehnlichen Unique-Index zwar ohnehin als verschieden — die Bedingung
-- schreibt die Absicht hin, statt sie einer Feinheit zu ueberlassen).
-- `aktiv = 1` ist die eigentliche Arbeit: ein zurueckgesetzter Code BEHAELT
-- seine `ort_id` und wird nur gesperrt. Ohne die zweite Bedingung liesse sich
-- ein Code kein zweites Mal zuruecksetzen — der Index schluege gegen die
-- gesperrte Vorgaengerzeile an, und zwar mit einer Meldung, die nach einem
-- Fehler im Zuruecksetzen klingt und keiner waere.
--
-- ⚠️ DIE `ort_id` BLEIBT AN DER GESPERRTEN ZEILE STEHEN, statt beim
-- Zuruecksetzen geleert zu werden. Sie ist die einzige Auskunft darueber, an
-- WELCHER Karte ein gesperrter Code einmal hing — und genau die braucht man,
-- wenn jemand mit einem alten Foto auftaucht.
CREATE UNIQUE INDEX `idx_tokens_ort_aktiv` ON `tokens` (`ort_id`) WHERE `ort_id` is not null and `aktiv` = 1;
--> statement-breakpoint
-- DER AUDIT-TRIGGER MUSS DIE NEUE SPALTE MITFUEHREN.
--
-- ⚠️ `audit_tokens_update` (0004) haengt an einer AUFGEZAEHLTEN `WHEN`-Klausel
-- mit je einem `OLD."x" IS NOT NEW."x"` pro Spalte. Eine neue Spalte steht dort
-- nicht von selbst — und die Luecke waere still: eine Aenderung an `ort_id`
-- allein loeste dann KEINEN Auditeintrag aus. Genau das ist der Fall, der
-- passiert, wenn jemand einen Code von Hand einem anderen Ort zuordnet.
--
-- ⚠️ SQLite KANN EINEN TRIGGER NICHT AENDERN. `DROP` und `CREATE` sind der
-- einzige Weg; das Paar muss in DERSELBEN Migration stehen, sonst laeuft die
-- Datenbank zwischen zwei Schritten ohne Trigger.
--
-- `src/core/audit/catalog.test.ts` prueft die Vollstaendigkeit Spalte fuer
-- Spalte und hat genau diese Luecke gefunden.
DROP TRIGGER audit_tokens_update;--> statement-breakpoint
CREATE TRIGGER audit_tokens_update AFTER UPDATE ON "tokens"
WHEN OLD."id" IS NOT NEW."id" OR OLD."code" IS NOT NEW."code" OR OLD."label" IS NOT NEW."label" OR OLD."scope_lagerort_id" IS NOT NEW."scope_lagerort_id" OR OLD."ziel_typ" IS NOT NEW."ziel_typ" OR OLD."ziel_id" IS NOT NEW."ziel_id" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."created_at" IS NOT NEW."created_at" OR OLD."created_by" IS NOT NEW."created_by" OR OLD."last_used_at" IS NOT NEW."last_used_at" OR OLD."ort_id" IS NOT NEW."ort_id"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'tokens', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
