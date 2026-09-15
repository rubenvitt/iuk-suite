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
-- ⚠️ `lower(trim(...))` IST DIE FALTUNG, UND SIE STEHT WORTGLEICH IN
-- `_lib/schrankName.ts`. BEIDE HAELFTEN DES AUSDRUCKS SIND ENGER, ALS MAN SIE
-- IN JAVASCRIPT SCHREIBEN WUERDE, und beide Male ist das Absicht: SQLites
-- `lower()` ist ASCII-only, sein `trim()` nimmt nur U+0020. Die Action faltet
-- deshalb genauso, statt `toLocaleLowerCase()` und `String.trim()` zu nehmen.
--
-- Waere die Action strenger, blieben Altdaten stehen, die sie danach fuer gleich
-- haelt — eine Mehrdeutigkeit, die niemand mehr aufloesen kann, weil jeder
-- Rettungsname als „bereits vergeben" abgewiesen wuerde. `_lib/schrankName.test.ts`
-- vergleicht beide Fassungen Zeichenkette fuer Zeichenkette gegen echtes SQLite,
-- statt die Gleichheit zu behaupten.
--
-- ⚠️ ZWEI SCHRITTE, UND DIE REIHENFOLGE IST DER GANZE PUNKT: erst die Altdaten
-- entdoppeln, dann den Index anlegen. Andersherum bricht `migrate()` auf jeder
-- Datenbank ab, die heute zweimal „Schrank 1" fuehrt — und ein abgebrochener
-- Migrationslauf ist kein Fehlerdialog, sondern ein Modul, das nicht startet
-- (`core/bootstrap.ts`, `migrateAllModules()` laeuft vor dem ersten Request).

-- SCHRITT 0 — RANDLEERRAUM VEREINHEITLICHEN, bevor irgendetwas verglichen wird.
-- SQLites `trim(X)` nimmt AUSSCHLIESSLICH das Leerzeichen U+0020; JavaScripts
-- `String.prototype.trim()` nimmt zusaetzlich Tabulator, Zeilenumbrueche,
-- geschuetzte Leerzeichen und ein Dutzend weiterer Unicode-Zeichen. Ein
-- importierter „	Schrank 1" neben „Schrank 1" ueberlebte beide Ebenen und saehe
-- auf dem Schirm trotzdem gleich aus (HTML faltet fuehrenden Leerraum weg) —
-- also genau der Fall, den dieses Ticket abstellt (Befund von Codex zu PR #166).
--
-- Die Zeichenliste ist die vollstaendige Leerraummenge von JavaScripts `trim()`,
-- gemessen ueber die gesamte BMP, nicht aus einer Tabelle abgeschrieben. Sie
-- steht GENAU EINMAL: der Index unten kommt danach mit dem einfachen `trim()`
-- aus, weil nach diesem Schritt kein Name mehr Randleerraum traegt, den SQLite
-- anders sieht als die Anwendung. Ueber das Formular kann so etwas ohnehin nicht
-- entstehen — `SchrankSchema` zieht jede Eingabe vorher durch `.trim()`.
--
-- KEIN `WHERE name <> trim(...)`: das WHEN des Audit-Triggers vergleicht die
-- Spalten selbst, eine Zeile ohne Aenderung erzeugt also keine Protokollzeile.
-- Die Bedingung waere eine zweite Kopie der Zeichenliste, die auseinanderlaufen
-- kann, fuer nichts.
UPDATE lagerorte
SET name = trim(name, char(
  9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,
  8202,8232,8233,8239,8287,12288,65279
))
WHERE parent_id IS NOT NULL;
--> statement-breakpoint
-- Die Umbenennung geht ueber eine TEMPORAERE TABELLE und nicht ueber eine
-- korrelierte Unterabfrage im SET: eine Unterabfrage auf `lagerorte` waehrend
-- eines UPDATE auf `lagerorte` liest einen Zwischenstand, dessen Reihenfolge
-- SQLite nirgends zusagt. Der neue Name wird deshalb EINMAL VORHER
-- festgeschrieben.
--
-- ⚠️ DIE NUMMER WIRD GESUCHT, NICHT GERECHNET, und das ist kein Luxus: „Schrank
-- 1", noch einmal „Schrank 1" und ein eigenstaendiges „Schrank 1 (Dublette 2)"
-- nebeneinander sind erlaubte Altdaten. Eine Nummer aus dem Rang ergaebe fuer
-- die zweite Zeile genau den Namen, den die dritte schon traegt — und der
-- CREATE UNIQUE INDEX darunter braeche ab. Das Modul startete nicht mehr, also
-- genau der Ausfall, den dieser Schritt verhindern soll (Befund von Codex zu
-- PR #166).
--
-- `sortierung, rowid` als Reihenfolge: der zuerst gegriffene Schrank behaelt
-- seinen Namen, der weiter hinten stehende bekommt den Zusatz. Bei gleicher
-- Sortierung entscheidet die Einfuegereihenfolge — deterministisch, damit ein
-- zweiter Lauf auf einer Kopie dasselbe Ergebnis liefert.
CREATE TEMP TABLE drk367_dubletten AS
WITH gefaltet AS (
  SELECT id, name, parent_id, sortierung, rowid AS rid, lower(trim(name)) AS falt
  FROM lagerorte
  WHERE parent_id IS NOT NULL
),
rang AS (
  SELECT id, name, parent_id, falt,
         row_number() OVER (
           PARTITION BY parent_id, falt ORDER BY sortierung, rid
         ) AS r
  FROM gefaltet
),
-- Nur Gruppen mit Dubletten, und je Gruppe DER Name, der bleibt. Er ist die
-- Grundlage aller Ersatznamen: „GF-Schrank" und „gf-schrank" ergeben damit
-- „GF-Schrank" und „GF-Schrank (Dublette 2)" und nicht zwei Schreibweisen
-- nebeneinander.
gruppe AS (
  SELECT parent_id, falt, max(CASE WHEN r = 1 THEN name END) AS basis
  FROM rang
  GROUP BY parent_id, falt
  HAVING max(r) > 1
),
-- Kandidatennummern ab 2. Der Kreuzverbund erzeugt `n²` Stueck bei `n`
-- Geschwistern — reichlich, und die Schranke ist beweisbar: belegt sein koennen
-- hoechstens `n` Nummern (eine je Geschwisterzeile), zu vergeben sind hoechstens
-- `n-1` (eine Zeile je Gruppe behaelt ihren Namen), und `n² >= n + (n-1)` gilt
-- fuer jedes `n >= 2`. Eine rekursive CTE mit fester Obergrenze waere dieselbe
-- Rechnung mit einer Zahl, die irgendwann jemand raet. `lagerorte` ist winzig
-- (`_lib/lesepfade/orte.ts`), das Quadrat kostet hier nichts.
zahlen AS (
  SELECT row_number() OVER (ORDER BY a.rid, b.rid) + 1 AS n
  FROM gefaltet a, gefaltet b
),
-- Je Gruppe die Nummern, die kein Geschwister schon traegt, aufsteigend
-- durchnummeriert. `platz` 1 geht an die erste Dublette, 2 an die zweite.
kandidat AS (
  SELECT g.parent_id, g.falt, g.basis, z.n,
         row_number() OVER (PARTITION BY g.parent_id, g.falt ORDER BY z.n) AS platz
  FROM gruppe g, zahlen z
  WHERE NOT EXISTS (
    SELECT 1 FROM gefaltet s
    WHERE s.parent_id = g.parent_id
      AND s.falt = lower(trim(g.basis || ' (Dublette ' || z.n || ')'))
  )
)
-- „(Dublette 2)" ist bewusst sprechend und bewusst haesslich: der Name soll in
-- „Verwaltung → Lagerorte" auffallen und zum Umbenennen einladen. Ein stiller
-- Zusatz („Schrank 1 2") saehe aus wie ein Tippfehler des Teams.
SELECT r.id AS id, k.basis || ' (Dublette ' || k.n || ')' AS neuer_name
FROM rang r
JOIN kandidat k
  ON k.parent_id = r.parent_id AND k.falt = r.falt AND k.platz = r.r - 1
WHERE r.r > 1;
--> statement-breakpoint
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
CREATE UNIQUE INDEX `idx_lagerorte_name_je_parent`
  ON `lagerorte` (`parent_id`, lower(trim(`name`)))
  WHERE `parent_id` IS NOT NULL;
