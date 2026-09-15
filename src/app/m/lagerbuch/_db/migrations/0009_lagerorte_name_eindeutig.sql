-- DRK-367: zwei Schraenke duerfen nicht gleich heissen.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die
-- Audit-Trigger aus 0004 nicht und liesse sie beim naechsten Lauf still stehen
-- (0005_artikel_kategorie.sql, Kopfkommentar).
--
-- WARUM UEBERHAUPT EIN INDEX, wo die Action schon prueft: die Action ist die
-- Meldung, der Index ist die Zusage. Ein zweiter Schreibweg (Import, Seed, ein
-- spaeteres Formular) kaeme an der Action vorbei, und die Mehrdeutigkeit faellt
-- erst auf, wenn jemand vor dem Schrank steht. Dasselbe Paar tragen
-- `geraete_barcode_unique` und `pruefeBarcodeFrei` schon seit 0000.
--
-- ⚠️ DER INDEX DECKT NUR KINDER — `WHERE parent_id IS NOT NULL`. Schraenke
-- haengen am Handlager, die Wurzel und jedes Fahrzeug tragen `parent_id IS
-- NULL`. Fahrzeugnamen bleiben damit unberuehrt; sie tragen mit `kennung` ein
-- eigenes Unterscheidungsmerkmal und sind nicht Gegenstand dieses Tickets.
--
-- ⚠️ ZWEI SCHRITTE, UND DIE REIHENFOLGE IST DER GANZE PUNKT: erst die Altdaten
-- entdoppeln, dann den Index anlegen. Andersherum bricht `migrate()` auf jeder
-- Datenbank ab, die heute zweimal „Schrank 1" fuehrt — und ein abgebrochener
-- Migrationslauf ist kein Fehlerdialog, sondern ein Modul, das nicht startet
-- (`core/bootstrap.ts`, `migrateAllModules()` laeuft vor dem ersten Request).

-- Die Umbenennung geht ueber eine TEMPORAERE TABELLE und nicht ueber eine
-- korrelierte Unterabfrage im SET: eine Unterabfrage auf `lagerorte` waehrend
-- eines UPDATE auf `lagerorte` liest einen Zwischenstand, dessen Reihenfolge
-- SQLite nirgends zusagt. Der Rang wird deshalb EINMAL VORHER festgeschrieben.
--
-- `sortierung, rowid` als Reihenfolge: der zuerst gegriffene Schrank behaelt
-- seinen Namen, der weiter hinten stehende bekommt den Zusatz. Bei gleicher
-- Sortierung entscheidet die Einfuegereihenfolge — deterministisch, damit ein
-- zweiter Lauf auf einer Kopie dasselbe Ergebnis liefert.
CREATE TEMP TABLE drk367_dubletten AS
SELECT id, name || ' (Dublette ' || rang || ')' AS neuer_name
FROM (
  SELECT id, name,
         row_number() OVER (
           PARTITION BY parent_id, lower(trim(name)) ORDER BY sortierung, rowid
         ) AS rang
  FROM lagerorte
  WHERE parent_id IS NOT NULL
)
WHERE rang > 1;
--> statement-breakpoint
-- „(Dublette 2)" ist bewusst sprechend und bewusst haesslich: der Name soll in
-- „Verwaltung → Lagerorte" auffallen und zum Umbenennen einladen. Ein stiller
-- Zusatz („Schrank 1 2") saehe aus wie ein Tippfehler des Teams.
--
-- ⚠️ DIESES UPDATE LOEST `audit_lagerorte_update` AUS, und damit ist diese
-- Migration die erste, die die Audit-Funktionen SCHON WAEHREND des Laufs
-- braucht (`suite_audit_id` und die vier anderen). Das ist gewollt: ausserhalb
-- eines Audit-Kontexts liefert `suite_audit_actor()` `{"kind":"system"}`, die
-- Umbenennung steht also als Systemaenderung im Protokoll und nicht als
-- unerklaerter Namenswechsel. Der einzige Anwendungspfad — `migrateAllModules()`
-- ueber `openModuleDatabase()` — registriert sie; `drizzle-kit` wird hier nur
-- fuer `generate` benutzt, nie fuer `migrate`. Wer kuenftig auf einer NACKTEN
-- Verbindung migriert, bekommt „no such function: suite_audit_id" — laut, nicht
-- still. `core/audit/catalog.test.ts` haelt die Reihenfolge fest.
UPDATE lagerorte
SET name = (SELECT neuer_name FROM drk367_dubletten d WHERE d.id = lagerorte.id)
WHERE id IN (SELECT id FROM drk367_dubletten);
--> statement-breakpoint
DROP TABLE drk367_dubletten;
--> statement-breakpoint
-- `lower(trim(...))` statt `name`: „Schrank 1" und „schrank 1 " nebeneinander
-- sind in einer Auswahlliste genauso wenig zu unterscheiden wie zwei gleiche.
--
-- ⚠️ SQLites `lower()` IST ASCII-ONLY — „Ä" bleibt „Ä". Die Action prueft
-- deshalb mit `toLocaleLowerCase("de")` und ist damit STRENGER als der Index.
-- Die Richtung ist die richtige: was die Action ablehnt, erreicht den Index nie;
-- der Index faengt nur, was an der Action vorbeikaeme.
CREATE UNIQUE INDEX `idx_lagerorte_name_je_parent`
  ON `lagerorte` (`parent_id`, lower(trim(`name`)))
  WHERE `parent_id` IS NOT NULL;
