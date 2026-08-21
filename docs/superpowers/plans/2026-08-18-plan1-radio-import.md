# Plan 1 von 5 · Das Import-Skript `scripts/import/radio.ts` — Umsetzungsplan (Spec 2, Kapitel 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/import/radio.ts` liest einen Schnappschuss der Alt-Datenbank von
`radio-admin` und schreibt ihn in `radio.db` der Suite — fünf Tabellen, 61 Spalten, mit einem
Riegel gegen den Faktor-1000-Fehler, der beim Cutover die gesamte abgeschlossene Leihhistorie
löschen würde und den kein Paritätscheck sieht.

**Architecture:** Der Plan zerfällt in **zwei Hälften, und die Grenze ist nicht fachlich, sondern
zeitlich.** Aufgaben 1–4 hängen ausschließlich an der **Quell**seite (die kopierte Alt-DDL, die
Rohzeilen, die drei reinen Zeitfunktionen, die fünf namentlichen `SELECT`s) und sind **heute
ausführbar** — Spec 1 wird dafür nicht gebraucht. Aufgaben 5–11 hängen an der **Ziel**seite
(`src/app/m/radio/_db/schema.ts`, das Migrationsverzeichnis, das Registrierungsdreieck) und sind
gesperrt, bis Spec 1 gebaut ist. Jede gesperrte Aufgabe nennt ihre Sperre namentlich und ist so
geschrieben, dass sie am Tag nach dem Bau ohne Nachdenken ausführbar wird. Innerhalb einer Aufgabe
gilt die TDD-Folge: fehlschlagender Test → Fehlschlag sehen → minimale Umsetzung → grün → Commit.

**Tech Stack:** Node + TypeScript · better-sqlite3 13.0.2 · drizzle-orm 0.45.2 · Vitest 4.1.5 ·
`tsx` 4.23.12 (kein Build-Schritt für Skripte) · SQLite

**Spec:** `docs/superpowers/specs/2026-08-18-radio-cutover-design.md` — **Kapitel 1** (Zeilen
562–1577) ist der Auftrag dieses Plans; der **Rahmen** (1–561, insbesondere W1, W2, W4, W8, W9,
W11 und die ⬜-Tabelle) und **Anhang A/B** (4880–4914) sind mitverbindlich.

**Spec 1:** `docs/superpowers/specs/2026-08-17-radio-modul-design.md` — **nicht gebaut.**
`src/app/m/radio/` existiert im Repo nicht (nachgesehen 2026-08-18). Ein `§`-Verweis ohne Präfix
meint in diesem Plan **immer Spec 2**; jeder Verweis in Spec 1 trägt das Präfix `Spec 1`.

---

## ⚠️ Vier Dinge, die diesen Plan von einem gewöhnlichen Umsetzungsplan unterscheiden

**1. Die Hälfte der Aufgaben ist heute nicht ausführbar, und das ist kein Mangel des Plans.**
Spec 1 entwirft das Zielschema, dieser Plan den Importer dagegen. Wo eine Aufgabe auf ein
Spec-1-Artefakt wartet, steht **keine erfundene Signatur**, sondern eine Zeile
`**Wartet auf:**` mit der Nummer aus der ⬜-Tabelle des Rahmens. Der Präzedenzfall ist vernarbt:
die `lagerbuch`-Spec verlangte ein `cookies().delete()` in einer Server Component, wo es **wirft** —
ein Test hätte dort eine Zusage geprüft, welche die Bauform nicht halten kann.

**2. Der Test ist hier nicht Absicherung, sondern das einzige Tor.** `scripts/import/parity.ts:43-56`
vergleicht Multimengen von Zeilen-Hashes, und **beide Arme laufen durch dieselbe Mapping-Funktion**
(`scripts/import/portal.ts:73-76` schreibt es selbst hin). Ein konsistenter Mapping-Fehler hasht
beidseitig identisch. Für den Faktor 1000, für jede Spaltenvertauschung und für das Falten von
`null` auf `false` gibt es **kein anderes Tor als die Unit-Tests dieses Plans**. Deshalb prüft jeder
Mapper-Test **alle** Zielfelder gegen konkrete Werte per `toEqual`, nicht nur Typ- oder Null-Checks
(Hausform: `scripts/import/feedback.test.ts:181-183`).

**3. Zweimal ist die Zusicherung eines Tests ein Fehlschlag, kein Erfolg.** §1.6.3 schreibt das
**beobachtete, unerwünschte** Verhalten fest: der Zweitimport walzt eine in der Suite angehängte
`update_note` platt (Fall A), und er lässt eine zurückgegebene Leihe auferstehen, bis der partielle
Unique-Index die Schreibung abweist (Fall B). Ein Test, der dort Erfolg zusicherte, wäre eine
Zusage, welche die Bauform nicht hält. Wer beim Umsetzen versucht, Fall A oder B „grün zu
bekommen", hat den Auftrag missverstanden.

**4. Die Fixture ist eine zeichengleiche Kopie fremder Produktions-DDL, kein nachgeschriebenes
Schema.** Das ist eine **benannte Abweichung** von der Hausform (Anhang B A3): das Repo kennt heute
nur die Inline-Fabrik (`portal.test.ts:12-21`) und die von Hand nachgeschriebene In-Memory-DDL
(`feedback.test.ts:30-70`). Nur die kopierte Fassung trägt die **physische** Spaltenreihenfolge der
Produktion (`update_note` auf 24, `tei` auf 25) und den partiellen Unique-Index — und nur mit ihr
ist der Reihenfolge-Test aus §1.8 nicht vakuös.

---

## Global Constraints

- **Kommandos:** `rtk pnpm typecheck` · `rtk pnpm lint` · `rtk pnpm vitest run` · `rtk pnpm build` ·
  `rtk pnpm exec playwright test`. Alle mit `rtk` präfixen, auch in Ketten mit `&&`.
- **Nach jeder Aufgabe:** `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run` grün, dann
  committen. `pnpm build` und Playwright werden von diesem Plan **nicht** berührt (er fasst kein
  `src/app/**` an) — sie laufen einmal vor dem Merge.
- **`pnpm test` sammelt `scripts/**` MIT.** Gemessen: `pnpm vitest list scripts/import/` listet alle
  Fälle der vier vorhandenen Testdateien. `vitest.config.ts:35` setzt nur `exclude`, kein
  `include`-Override; der Kommentar `vitest.config.ts:4-5` („only collects the unit tests under
  src/") ist **falsch** und darf nicht als Grund für eine Konfigurationsänderung genommen werden.
  ⚠️ **Dieser Plan ändert `vitest.config.ts` nicht.**
- **Kein Worktree unter `.claude/worktrees/`** — das Verzeichnis liegt im Repo und vergiftet die
  Prüfungstore (`vitest.config.ts:8-34` schreibt die Messung aus: 251 Fremdfehlschläge).
- **Kein `pnpm dev` parallel zur Testsuite.**
- **Zeit ist Unix-SEKUNDEN im Ziel und epoch-MILLISEKUNDEN in der Quelle.** Nie über die
  Einheitengrenze vergleichen, ohne den Faktor im Ausdruck sichtbar zu lassen. Die schärfste
  Formulierung im Haus steht in `src/app/m/lagerbuch/_db/schema.ts:11-16`; sie nennt Copy-Paste aus
  `m/qr/_db/schema.ts:19-20` als den wahrscheinlichsten Weg in den Fehler.
- **Spalten werden namentlich gelesen, nie über eine Position** — kein `SELECT *`, kein
  Destructuring nach Reihenfolge (§1.2). ⚠️ Das nächste Vorbild im Repo bricht diese Regel:
  `scripts/import/feedback.ts:66-72` liest fünfmal `SELECT * FROM …`. **Diesem Vorbild wird nicht
  gefolgt** (Spec 1 §2.8.1, `docs/runbooks/lagerbuch-cutover.md:30-31`).
- **`getModuleDb()` wird in Tests NICHT benutzt.** Sein Cache ist per Modulschlüssel gekeyt, nicht
  per `DATA_DIR` (`src/core/db/index.ts:31-35`), und gäbe zwischen Tests ein stale Handle auf die
  alte Datei zurück — der Grund steht ausgeschrieben in `scripts/import/portal.test.ts:23-25`. Tests
  bauen ihre Ziel-DB selbst und migrieren sie (`portal.test.ts:26-32`, `feedback.test.ts:160-166`).
- **Deutsch, mit korrekten Umlauten, in Prosa und Kommentaren.** In TypeScript-Bezeichnern und in
  Testnamen **keine** Umlaute (Hausform: `paritaetsSichtGeraet`, `msZuDatum`, `tagInBerlin`).
- **Die SQL-Spaltennamen bleiben zeichengleich zur Quelle** (`issi`, `loanable`, `snapshot_call_sign`),
  obwohl die jüngeren Suite-Module deutsch benennen: 61 zuzuordnende Spalten, jede Umbenennung eine
  Verwechslungsgelegenheit (Spec 1 §2.5, `docs/radio-portierung-analyse.md:743-747`).
- **Commits müssen signiert sein** (main-Ruleset), sonst blockiert der Merge trotz grüner CI.

---

## Die Sperrtafel — welche Leerstelle welche Aufgabe blockiert

**Solange hier eine Zeile offen ist, beginnt die zugehörige Aufgabe nicht.** Jede Zeile ist eine
**Ablesung**, keine Entscheidung (Hausform: `docs/runbooks/files-cutover.md:39-58`, „Betriebswerte
werden nicht erfunden. … Ein Platzhalter aus einer anderen Maschine ist kein Wert").

| ⬜ / Vorbedingung | Was genau abzulesen ist | Quelle | Blockiert | Ohne sie |
|---|---|---|---|---|
| **⬜ L1** | Die zehn Typaliase, die `src/app/m/radio/_db/schema.ts` exportiert. Spec 1 §2.2.4 belegt **zwei** (`NeuesGeraet`, `Geraet`); Spec 1 §8.2.1 **benutzt** vier weitere (`NeueSoftwareVersion`, `NeuerBenutzer`, `NeuesGeraeteEreignis`, `NeueLeihe`) in Signaturen; die **vier Select-seitigen** (`SoftwareVersion`, `Benutzer`, `GeraeteEreignis`, `Leihe`) stehen **nirgends** | Bau (Schemadatei) | **5 · 6a · 6b · 7 · 8 · 9 · 10** | Keine Mapper-Signatur kompiliert |
| **⬜ L3** | Namen und **vollständige** Spaltenlisten der vier übrigen Paritätssichten (`software_versions` 6, `users` 3, `device_events` 8, `loans` 12). Je Sicht: (a) trägt sie **jede** Spalte der Zieltabelle, (b) läuft jede `mode: "timestamp"`-Spalte durch `sekunden()`, (c) bleibt `devices.last_updated_at` **unumgerechnet** | Bau | **7** | Fehlt eine Spalte in einer Sicht, ist die Paritaet für sie blind — **und das sieht kein Test**, außer dem in Aufgabe 7 Schritt 3 |
| **⬜ L6** | Die genaue **Abschlusszeile** von `scripts/import/radio.ts`, **byteweise**. Bei `portal` ist es `parity green` (`docs/runbooks/portal-cutover.md:20`, `:33`); das Runbook prüft **Zeichenkette und Exit-Code** | Bau / Runbook | **10 · 11** | Das Runbook greppt auf eine Zeichenkette, die es nicht gibt |
| **Spec 1 §2.5** | `src/app/m/radio/_db/schema.ts` existiert und exportiert `devices`, `softwareVersions`, `users`, `deviceEvents`, `loans`, `zugangscodes` | Bau | **5 · 6a · 6b · 7 · 8 · 9 · 10** | `import * as schema from "@/app/m/radio/_db/schema"` löst nicht auf |
| **Spec 1 §2.6 / §2.9.1** | `src/app/m/radio/_db/migrations/` existiert, mit dem generierten `0000_<name>.sql` **und** der von Hand geschriebenen `0001_loans_aktiv_uidx.sql` | Bau | **8 · 9 · 10 · 11** | `migrate(db, { migrationsFolder })` findet nichts; Fall B hat keinen Index, an dem er bricht |
| **Spec 1 §2.9** | Das **Registrierungsdreieck**: `MODULE_MIGRATIONS`-Zeile in `src/core/bootstrap.ts` (hinter `aufgaben`, also hinter `:48`), die `COPY`-Zeile im `Dockerfile` (hinter `:56`), der `SEED_MODULE`-Eintrag in `scripts/seed-lokal.ts` | Bau | **10 · 11** | `migrateAllModules()` legt `radio.db` **nicht** an; `getModuleDb("radio", …)` öffnet eine unmigrierte Datei und der erste Insert stirbt mit `no such table: devices` |
| **Vorbedingung V-A** | Eine Arbeitskopie von `radio-admin` am Freeze-SHA **`265abd5`** — Aufgabe 1 kopiert daraus fünf Dateien zeichengleich | Arbeitsplatz | **1** | Aufgabe 1 hat keine Quelle. ✅ **Gemessen 2026-08-18: vorhanden** unter `/Users/rubeen/dev/personal/drk/radio-admin`, `git log --oneline -1` = `265abd5`. Fällt sie weg, wird das archivierte Repo am SHA geklont — Spec 2 Kapitel 5 Posten 12 **archiviert, löscht nicht** |

⚠️ **L1 hatte bis zu diesem Plan keinen Anker im Text.** Die ⬜-Tabelle des Rahmens nennt als
Verwendungsstellen §1.4 und §1.5.2; an beiden Stellen steht **kein** ⬜-L1-Zeichen, und der
Kapiteltext benutzt `toNeuesGeraet`, `NeuesGeraet`, `RadioQuelle`, `RadioDb`, `RadioTx` durchgehend
als gesetzt. Die sieben `**Wartet auf: ⬜ L1**`-Zeilen dieses Plans sind dieser Anker.

**Was dieser Plan NICHT blockiert und wo es hingehört:** E1–E8, U4/U4a/U4b, U6–U9 und C.1–C.7 sind
Betreiber- und Serverauskünfte für Generalprobe, Fenster und Abbau. **Kein einziger Punkt daraus
blockiert eine Aufgabe dieses Plans** — Kapitel 1 entwirft eine Datei, keinen Abend. Die Ausnahme
ist mittelbar: **U4/C.5** blockiert den Freeze, und ohne Freeze schließt Glied (1)→(2) der Zählkette
nicht (§1.8) — das ist ein Runbook-Schritt der Planteile zu Kapitel 3 und 4, kein Schritt hier.

---

## Was dieser Plan in dieser Runde GEMESSEN hat, statt es offenzulassen

Vier Ablesungen, die nach der Spec „Bau" wären, sind heute ohne Spec 1 messbar — und sie sind
gemessen. **Jede Zahl unten stammt aus einem Lauf, nicht aus einer Herleitung.**

| Was | Messung | Folge für diesen Plan |
|---|---|---|
| **⬜ L2** — verpackt better-sqlite3 die Meldung `UNIQUE constraint failed: loans.device_id`? | **Nein und ja zugleich.** better-sqlite3 13.0.2 wirft eine `SqliteError` mit `constructor.name === "SqliteError"`, `code === "SQLITE_CONSTRAINT_UNIQUE"`, `message === "UNIQUE constraint failed: <tabelle>.<spalte>"` **zeichengleich** und **ohne** `cause`. drizzle-orm 0.45.2 reicht sie durch `db.transaction()` und `onConflictDoUpdate()` **unverändert** durch (zweiter Lauf, eigene Sonde) | Fall B (Aufgabe 9) kann `toThrow(/UNIQUE constraint failed: loans\.device_id/)` zusichern. ⚠️ **L2 wird trotzdem nicht gestrichen**, sondern **verengt**: das Ergebnis ist versionsgebunden. Eine künftige verpackende Fassung lässt diesen Test **laut** scheitern, nicht still |
| **Die `RadioDb \| RadioTx`-Union aus §1.5.3** — kompiliert sie in der installierten drizzle-Fassung? | **Ja.** `rtk pnpm typecheck` = „No errors found" gegen eine Sonde, die `insert().values().onConflictDoUpdate().run()`, `insert().values().onConflictDoNothing().run()` **und** `select().from().all()` auf dem Union-Typ fährt, aufgerufen einmal aus `db.transaction((tx) => …)` und einmal auf dem blanken `db`. Importe: `SQLiteTransaction` aus `drizzle-orm/sqlite-core`, `ExtractTablesWithRelations` aus `drizzle-orm`, `Database.RunResult` als `import type Database from "better-sqlite3"` | Der Vorbehalt in §1.5.3 („passt sie in der gebauten Drizzle-Version nicht, liest man sie am Typfehler des Aufrufs ab") ist für **diese** Fassung ausgeräumt. Aufgabe 8 schreibt die Union unverändert |
| **Die physische Spaltenreihenfolge der Quell-`devices`** | Die fünf Migrationen in Reihenfolge eingespielt ergeben **25 Spalten**, `cid 23 = update_note`, `cid 24 = tei` — also Position 24 und 25, genau wie §1.2 rechnet | Aufgabe 1 kann die Zusicherung **exakt** schreiben, statt sie zu umschreiben |
| **Der ARRANGE-Riegel aus §1.6.3 Fall B ist in seiner niedergeschriebenen Form ROT gegen eine korrekte Migration** | Die Quell-DDL schreibt den Index mit **Backticks** (`radio-admin@265abd5:server/drizzle/0003_kind_spot.sql`, letzte Zeile), Spec 1 §2.6 übernimmt ihn zeichengleich mit Backticks. Gemessen: `sqlite_master.sql` gibt den Text mit Backticks zurück, `instr(sql,'WHERE returned_at IS NULL')` ergibt **`0`**. Die Strukturprobe dagegen: `select name, partial, "unique" from pragma_index_list('loans')` liefert `loans_device_active_uidx\|1\|1` | Aufgabe 9 fährt die **Struktur**probe. Ausgeschrieben in der Re-Kritik-Tafel am Ende dieses Plans (RK-A3) |

---

## Die zwei Hälften — Aufgabenübersicht

| # | Aufgabe | Läuft | Sperre |
|---|---|---|---|
| **1** | Die Quell-DDL als Fixture, mit dem Riegel auf ihre Spaltenreihenfolge | **heute** | — (V-A) |
| **2** | Die Rohzeilen der Fixture und der Riegel gegen wiederverwendete Zeitwerte | **heute** | — |
| **3** | Die Zeitachse und die zwei Faltungsriegel — reine Funktionen | **heute** | — |
| **4** | `lieseQuelle`: fünf namentliche `SELECT`s, fünf Quelltypen, ein Quelltext-Scan | **heute** | — |
| **5** | `toNeuesGeraet` — 25 Felder, der Faktor 1000, die zwei 0/1-Integer, der Berliner Tag | wartet | ⬜ L1 · Spec 1 §2.5 |
| **6a** | Die drei schmalen Mapper: `users`, `software_versions`, `device_events` | wartet | ⬜ L1 · Spec 1 §2.5 |
| **6b** | `toNeueLeihe` — 12 Zielfelder, vier Zeitstempel, `zugangscodeId` immer `null` | wartet | ⬜ L1 · Spec 1 §2.5 |
| **7** | Die fünf Paritätssichten, das getaggte Multiset, `checkRadioParitaet` | wartet | ⬜ L1 · ⬜ L3 |
| **8** | `importiereRadio` — Einfügereihenfolge, Konfliktstrategien, Paritäts-Rundlauf | wartet | ⬜ L1 · Spec 1 §2.6/§2.9.1 |
| **9** | Die vier asymmetrischen Idempotenzfälle A · B · C · **D** | wartet | ⬜ L1 · Spec 1 §2.6/§2.9.1 |
| **10** | `runRadioImport`, die Zählzeile, die Transaktion, der CLI-Block | wartet | ⬜ L6 · Spec 1 §2.9 (Dreieck) |
| **11** | Abnahme von Hand: der Trockenlauf über die Kommandozeile | wartet | Aufgabe 10 |

**Reihenfolge:** 1 → 2 → 3 → 4 sind heute strikt nacheinander zu fahren (jede baut auf der
vorigen). 5 → 6a → 6b → 7 → 8 → 9 → 10 → 11 ebenso, sobald die Sperre fällt. **Zwischen 4 und 5
liegt der Bau von Spec 1** — das ist die einzige Naht des Plans.

---

## Aufgabe 1: Die Quell-DDL als Fixture, mit dem Riegel auf ihre Spaltenreihenfolge

**Warum zuerst:** Alles Weitere liest aus dieser Datei. Und sie ist die einzige Aufgabe mit einer
**Frist von außen**: `radio-admin` wird nach Spec 2 Kapitel 5 archiviert; danach ist diese Kopie die
einzige Fassung der Quell-DDL in einem lebenden Repo (§1.8 Grund 3).

**Files:**
- Create: `scripts/import/fixtures/radio-quelle-ddl.sql`
- Create: `scripts/import/fixtures/radio-quelle.ts` (in dieser Aufgabe **nur** `baueQuellDb`)
- Create: `scripts/import/radio.test.ts` (in dieser Aufgabe **nur** der DDL-Riegel)

**Interfaces:**
- Verbraucht: nichts (erste Aufgabe).
- Liefert: `baueQuellDb(): Database.Database` — eine `:memory:`-SQLite mit `foreign_keys = ON` und
  der eingespielten Quell-DDL, **ohne eine einzige Zeile**. Der Aufrufer schließt sie
  (`db.close()`).
- Liefert: `scripts/import/fixtures/radio-quelle-ddl.sql` als **gelesene Datei**, cwd-relativ unter
  `"./scripts/import/fixtures/radio-quelle-ddl.sql"`.

⚠️ **Der Pfad ist cwd-relativ, nicht `import.meta.url`-relativ.** Das ist die Hausform und sie ist
begründet: `scripts/import/portal.test.ts:30` lädt `"./src/app/m/portal/_db/migrations"` genauso,
und `src/core/bootstrap.ts:18-19` schreibt den Grund aus („Migrations-Pfad ist cwd-relativ: Dev =
Repo-Root, Prod = /app"). Eine `import.meta.url`-Auflösung läuft lokal und verhält sich unter einem
anderen Arbeitsverzeichnis anders — der Fehler tritt dann in der CI auf, nicht hier.

- [ ] **Schritt 1: Die fünf Migrationen zeichengleich zusammentragen**

  ```bash
  R=/Users/rubeen/dev/personal/drk/radio-admin
  rtk git -C "$R" log --oneline -1        # MUSS mit 265abd5 beginnen — sonst STOPP
  ```

  Ergibt die Zeile einen anderen SHA, wird nicht weitergearbeitet: die Fixture ist ein **Beleg**,
  und ein Beleg von einem anderen Stand ist keiner. Dann `git -C "$R" checkout 265abd5` oder das
  archivierte Repo am SHA klonen.

  ```bash
  mkdir -p scripts/import/fixtures
  Z=scripts/import/fixtures/radio-quelle-ddl.sql
  : > "$Z"
  for f in 0000_confused_thena.sql 0001_cooing_overlord.sql 0002_numerous_mandroid.sql \
           0003_kind_spot.sql 0004_polite_redwing.sql; do
    printf '\n-- ===== %s =====\n' "$f" >> "$Z"
    cat "$R/server/drizzle/$f" >> "$Z"
    printf '\n' >> "$Z"
  done
  ```

  ⚠️ **Die Reihenfolge ist die Migrationsreihenfolge und nichts anderes.** Nur sie erzeugt
  `update_note` an Position 24 (aus `0001`) und `tei` an Position 25 (aus `0004`). Wer nach
  Dateinamen sortiert, bekommt zufällig dasselbe — wer nach Tabellen sortiert, bekommt die
  Zielreihenfolge und einen vakuösen Test.

  ⚠️ **`--> statement-breakpoint` bleibt drin.** Es beginnt mit `--`, ist also ein gültiger
  SQL-Zeilenkommentar; `db.exec()` läuft darüber hinweg. Gemessen: die zusammengesetzte Datei läuft
  in einem Zug durch `better-sqlite3`s `exec()` und legt sechs Tabellen an.

- [ ] **Schritt 2: Den Kommentarkopf voranstellen**

  Vor die erste Zeile von `scripts/import/fixtures/radio-quelle-ddl.sql`:

  ```sql
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
  ```

- [ ] **Schritt 3: Den fehlschlagenden Test schreiben**

  `scripts/import/radio.test.ts`, vollständig:

  ```ts
  import { describe, it, expect } from "vitest";
  import { baueQuellDb } from "./fixtures/radio-quelle";

  describe("radio-quelle-ddl.sql — die kopierte Quell-DDL", () => {
    it("legt die SECHS Quelltabellen an — fuenf aus 0000, `loans` aus 0003", () => {
      const db = baueQuellDb();
      try {
        const namen = db
          .prepare("select name from sqlite_master where type = 'table' order by name")
          .all()
          .map((r) => (r as { name: string }).name);
        expect(namen).toEqual([
          "api_tokens",
          "device_events",
          "devices",
          "loans",
          "software_versions",
          "users",
        ]);
      } finally {
        db.close();
      }
    });

    // Die Zusicherung (a) des Reihenfolge-Tests aus Spec 2 §1.8. Sie steht hier und nicht
    // erst in Aufgabe 5, weil sie ohne das Zielschema auskommt — und weil sie die Fixture
    // selbst prueft: dass hier wirklich die PRODUKTIVE Form liegt und nicht eine
    // nachgeschriebene. Zusicherung (b) (der Mapper liest namentlich) kommt in Aufgabe 5 dazu.
    it("radio-quelle-ddl.sql: devices traegt update_note an Position 24 und tei an Position 25", () => {
      const db = baueQuellDb();
      try {
        const spalten = db
          .prepare("select cid, name from pragma_table_info('devices') order by cid")
          .all() as Array<{ cid: number; name: string }>;
        expect(spalten).toHaveLength(25);
        expect(spalten[spalten.length - 2]).toEqual({ cid: 23, name: "update_note" });
        expect(spalten[spalten.length - 1]).toEqual({ cid: 24, name: "tei" });
      } finally {
        db.close();
      }
    });

    // ⚠️ STRUKTUR, nicht Text. `sqlite_master.sql` speichert die CREATE-Anweisung
    // zeichengleich so, wie sie ausgefuehrt wurde — und die Quell-Migration schreibt sie mit
    // BACKTICKS: CREATE UNIQUE INDEX `loans_device_active_uidx` ON `loans` (`device_id`)
    // WHERE `returned_at` IS NULL. Gemessen: instr(sql, 'WHERE returned_at IS NULL') = 0.
    // Ein Textvergleich waere hier rot gegen eine vollkommen korrekte DDL.
    it("loans traegt den PARTIELLEN Unique-Index loans_device_active_uidx", () => {
      const db = baueQuellDb();
      try {
        const treffer = db
          .prepare(
            `select name, partial, "unique" from pragma_index_list('loans')
              where name = 'loans_device_active_uidx'`,
          )
          .all();
        expect(treffer).toEqual([{ name: "loans_device_active_uidx", partial: 1, unique: 1 }]);
      } finally {
        db.close();
      }
    });
  });
  ```

- [ ] **Schritt 4: Lauf zur Bestätigung des Fehlschlags**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **FAIL** mit `Failed to resolve import "./fixtures/radio-quelle"`. Ein anderer
  Fehlschlag heißt, dass eine der drei Zusicherungen zufällig gegen etwas anderes läuft — dann
  zuerst das klären, nicht die Umsetzung schreiben.

- [ ] **Schritt 5: `baueQuellDb` schreiben**

  `scripts/import/fixtures/radio-quelle.ts`:

  ```ts
  import { readFileSync } from "node:fs";
  import Database from "better-sqlite3";

  /**
   * cwd-relativ, nicht relativ zu dieser Datei — Hausform: scripts/import/portal.test.ts:30
   * laedt "./src/app/m/portal/_db/migrations" genauso, und src/core/bootstrap.ts:18-19
   * begruendet es. Vitest laeuft aus dem Repo-Wurzelverzeichnis.
   */
  const DDL_PFAD = "./scripts/import/fixtures/radio-quelle-ddl.sql";

  /**
   * Eine LEERE Quell-Datenbank in der Form der Produktion von `radio-admin` (Freeze 265abd5).
   *
   * `foreign_keys = ON` steht hier, weil es in beiden echten Datenbanken scharf ist
   * (radio-admin/server/src/db/index.ts:28 und src/core/db/index.ts:19) und weil es eine
   * VERBINDUNGS-Eigenschaft ist, keine der Datei — dieselbe Begruendung wie in
   * src/app/m/lagerbuch/_db/migrations.test.ts:33-35. Ohne die Zeile liesse die Fixture ein
   * Waisen-Ereignis zu, und Aufgabe 8 haette keinen Fall, an dem sie den harten Abbruch zeigt.
   *
   * ⚠️ Der Aufrufer schliesst die Datenbank. `:memory:` haengt an der Verbindung: ein
   * vergessenes close() ist kein Datei-Leck, aber ein Speicher-Leck ueber die Testdatei hinweg.
   */
  export function baueQuellDb(): Database.Database {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(readFileSync(DDL_PFAD, "utf8"));
    return db;
  }
  ```

- [ ] **Schritt 6: Tests grün**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **3 passed**. Schlägt der Spaltentest fehl und meldet `cid 23 = tei`, wurde `0004` vor
  `0001` kopiert — Schritt 1 wiederholen, nicht die Zusicherung anpassen.

- [ ] **Schritt 7: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add scripts/import/fixtures/radio-quelle-ddl.sql scripts/import/fixtures/radio-quelle.ts scripts/import/radio.test.ts
  rtk git commit -m "test(radio-import): die Quell-DDL von radio-admin@265abd5 als Fixture, mit dem Riegel auf ihre physische Spaltenreihenfolge"
  ```

---

## Aufgabe 2: Die Rohzeilen der Fixture und der Riegel gegen wiederverwendete Zeitwerte

**Warum als eigene Aufgabe:** Die Fixture-Werte sind der **Wirkstoff** aller späteren Mapper-Tests.
`scripts/import/portal.ts:73-76` schreibt die Regel aus („keep its fixture values **distinct per
field**"), `feedback.test.ts:87-88` wendet sie an. Wer die Zeilen nebenbei in einer Mapper-Aufgabe
schreibt, wählt Werte nach Bequemlichkeit — und macht jede Vertauschungs-Zusicherung vakuös, ohne
dass ein Test rot wird.

**Files:**
- Modify: `scripts/import/fixtures/radio-quelle.ts` (die ALT_-Konstanten, `ALLE_QUELLZEILEN`,
  `spieleQuellFixtureEin`, `baueBespielteQuellDb`)
- Modify: `scripts/import/radio.test.ts` (zwei Zusicherungen dazu)

**Interfaces:**
- Verbraucht: `baueQuellDb` aus Aufgabe 1.
- Liefert (alle aus `scripts/import/fixtures/radio-quelle.ts`):
  - `ALT_GERAET`, `ALT_GERAET_OHNE_ANGABE` — zwei `devices`-Rohzeilen
  - `ALT_VERSION`, `ALT_VERSION_ZWEIT` — zwei `software_versions`-Rohzeilen
  - `ALT_BENUTZER` — eine `users`-Rohzeile
  - `ALT_EREIGNIS` — eine `device_events`-Rohzeile
  - `ALT_EREIGNIS_UNBEKANNT` — **Giftzeile, wird NICHT eingespielt** (siehe Schritt 3)
  - `ALT_LEIHE`, `ALT_LEIHE_AKTIV` — zwei `loans`-Rohzeilen
  - `ALLE_QUELLZEILEN: ReadonlyArray<{ tabelle: string; name: string; zeile: Record<string, unknown> }>`
  - `spieleQuellFixtureEin(db: Database.Database): void`
  - `baueBespielteQuellDb(): Database.Database`

- [ ] **Schritt 1: Die fehlschlagende Zusicherung schreiben — die Regel statt der Wortzahl**

  An `scripts/import/radio.test.ts` anhängen; oben `ALLE_QUELLZEILEN` und `baueBespielteQuellDb`
  mitimportieren.

  ```ts
  describe("radio-quelle.ts — die Fixture-Werte", () => {
    /**
     * Spec 2 §1.3.4 setzt die Regel „je Feld ein anderer Wert" und zaehlt darunter die
     * Konstanten von Hand auf. ⚠️ Eine Wortzahl neben einer Liste ist genau der Fehlertyp,
     * den W8 zweimal als tragend einstuft — und sie wandert mit jeder neuen Fixture-Zeile.
     * Deshalb steht hier die MECHANIK und nicht die Zahl.
     *
     * Was geprueft wird: kein Millisekunden-Wert steht unter ZWEI verschiedenen
     * `tabelle.feld`-Beschriftungen. Dass ALT_GERAET und ALT_GERAET_OHNE_ANGABE denselben
     * `created_at` tragen, ist erlaubt und gewollt — es ist DASSELBE Feld. Eine Vertauschung
     * faengt nur, wer verschiedene FELDER verschieden belegt.
     */
    it("kein Millisekunden-Wert der Fixture steht unter zwei verschiedenen Feldern", () => {
      const felderJeWert = new Map<number, Set<string>>();
      for (const { tabelle, zeile } of ALLE_QUELLZEILEN) {
        for (const [feld, wert] of Object.entries(zeile)) {
          if (typeof wert !== "number" || wert < 1_000_000_000_000) continue;
          const menge = felderJeWert.get(wert) ?? new Set<string>();
          menge.add(`${tabelle}.${feld}`);
          felderJeWert.set(wert, menge);
        }
      }
      expect(felderJeWert.size).toBeGreaterThan(0);
      const kollisionen = [...felderJeWert]
        .filter(([, felder]) => felder.size > 1)
        .map(([wert, felder]) => `${wert}: ${[...felder].sort().join(" / ")}`);
      expect(kollisionen).toEqual([]);
    });

    it("spieleQuellFixtureEin fuellt fuenf Tabellen und laesst api_tokens leer", () => {
      const db = baueBespielteQuellDb();
      try {
        const zaehle = (t: string) =>
          (db.prepare(`select count(*) as n from ${t}`).get() as { n: number }).n;
        expect(zaehle("users")).toBe(1);
        expect(zaehle("software_versions")).toBe(2);
        expect(zaehle("devices")).toBe(2);
        expect(zaehle("device_events")).toBe(1);
        expect(zaehle("loans")).toBe(2);
        // Die Tabelle steht in der Quelle und wandert NICHT (B16, W4). Sie bleibt leer,
        // damit kein Test sie versehentlich als Import-Sollwert liest.
        expect(zaehle("api_tokens")).toBe(0);
      } finally {
        db.close();
      }
    });

    /**
     * ⚠️ Diese Zeile ist kein Nebenschauplatz: sie belegt, dass die Fixture die
     * Nebenbedingung der Quell-DDL EINHAELT, statt sie zu umgehen. `loans_device_active_uidx`
     * laesst je `device_id` HOECHSTENS EINE Zeile mit `returned_at IS NULL` zu. ALT_LEIHE
     * (zurueckgegeben) und ALT_LEIHE_AKTIV duerfen deshalb beide auf `g-1` zeigen — eine
     * zweite AKTIVE nicht. Ohne diese Zusicherung merkt niemand, wenn eine spaeter
     * nachgetragene Zeile das Einspielen selbst abweist und Fall B aus dem falschen Grund
     * rot ist.
     */
    it("die Fixture haelt die Nebenbedingung des partiellen Index ein", () => {
      const db = baueBespielteQuellDb();
      try {
        const aktive = db
          .prepare(
            `select device_id, count(*) as n from loans
              where returned_at is null group by device_id having count(*) > 1`,
          )
          .all();
        expect(aktive).toEqual([]);
        expect(() =>
          db
            .prepare(
              `insert into loans (id, device_id, snapshot_call_sign, borrower_name,
                                  borrowed_at, returned_at, created_at, updated_at)
               values (?,?,?,?,?,?,?,?)`,
            )
            .run("l-drei", "g-1", "HRO 1/83-1", "Test", 1_742_500_000_000, null,
                 1_742_500_000_000, 1_742_500_000_000),
        ).toThrow(/UNIQUE constraint failed: loans\.device_id/);
      } finally {
        db.close();
      }
    });
  });
  ```

- [ ] **Schritt 2: Lauf zur Bestätigung des Fehlschlags**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **FAIL** — `ALLE_QUELLZEILEN` und `baueBespielteQuellDb` sind kein Export von
  `./fixtures/radio-quelle`. Die drei Tests aus Aufgabe 1 bleiben grün.

- [ ] **Schritt 3: Die Rohzeilen schreiben**

  An `scripts/import/fixtures/radio-quelle.ts` anhängen. **Übernommen aus Spec 2 §1.3.4,
  zeichengleich, mit zwei benannten Zusätzen** (`ALT_VERSION_ZWEIT` und `ALLE_QUELLZEILEN`, beide
  in Schritt 4 begründet):

  ```ts
  // ── Rohzeilen, wie better-sqlite3 sie aus der Quelle liefert (Spec 2 §1.3.4) ────────────
  //
  // ⚠️ DIE REGEL, an der jede spaetere Zusicherung haengt: jedes Zeitfeld traegt einen
  // ANDEREN Wert, ueber die ganze Fixture hinweg, nicht nur je Zeile. Sonst besteht der
  // Test jede Vertauschung, und eine durchgaengige Division durch 1000 hasht beidseitig
  // identisch (scripts/import/portal.ts:73-76). Die Zahl der Konstanten steht bewusst
  // NIRGENDS im Text — sie wandert mit jeder neuen Zeile; der Riegel ist die Zusicherung
  // "kein Millisekunden-Wert der Fixture steht unter zwei verschiedenen Feldern".

  export const ALT_GERAET = {
    id: "g-1",
    rufname: "HRO 1/83-1",
    issi: "1234567",                     // ≠ tei
    tei: "7654321",                      // ≠ issi
    serial_number: "SN-001",             // ≠ hiorg_id, ≠ opta
    device_type: "MTP6650",
    status: "einsatzbereit",
    location: "Funkraum",
    assigned_to: "GW-San",
    software_version: "10.5.1",
    last_updated_at: 1_740_871_800_000,  // 2025-03-01T23:30:00Z → in Berlin der 2025-03-02
                                         // ⚠️ ABSICHTLICH so gewaehlt: bei 00:00:00Z liefern
                                         // UTC-Kuerzung und Berliner Kalendertag DIESELBE
                                         // Zeichenkette, und die Zusicherung waere vakuoes.
    notes: "Stammnotiz",                 // ≠ update_note
    hiorg_id: "HO-002",
    opta: "OPTA-003",
    funktion: "Fuehrung",
    hersteller: "Motorola",
    bedieneinheit: "TMR880i",
    device_modes: "TMO,DMO",
    alamos_integrated: 1,                // ≠ loanable
    loanable: 0,                         // ≠ alamos_integrated
    update_note: "ISSI abweichend",      // ≠ notes
    created_at: 1_735_689_600_000,       // 2025-01-01T00:00:00Z
    updated_at: 1_738_368_000_000,       // 2025-02-01T00:00:00Z
    created_by: "sub-anna",              // ≠ updated_by
    updated_by: "sub-bert",              // ≠ created_by
  } as const;
  // ⚠️ `as const` ist Pflicht, nicht Stil: ohne es leitet TypeScript fuer
  // `alamos_integrated` und `loanable` den Typ `number` ab, und `toNeuesGeraet(ALT_GERAET)`
  // ist in Aufgabe 5 ein TS2345 gegen `AltGeraet` (`0 | 1 | null`). Die naheliegende
  // Reparatur waere ein `as` am Aufruf — und genau das schaltet die Pruefung ab, fuer die
  // Aufgabe 5 existiert.

  // Zweites Geraet: die NULL-Variante der zwei 0/1-Integer (§1.3.5).
  // ⚠️ `created_at`/`updated_at` sind hier bewusst dieselben wie in ALT_GERAET — es ist
  // DASSELBE Feld, und die Regel oben verbietet nur die Wiederverwendung ueber
  // verschiedene FELDER hinweg.
  export const ALT_GERAET_OHNE_ANGABE = {
    ...ALT_GERAET,
    id: "g-2",
    issi: "1234568",
    alamos_integrated: null,
    loanable: null,
    last_updated_at: null,
    update_note: null,
  } as const;

  export const ALT_BENUTZER = {
    sub: "sub-anna",                      // dieselbe Kennung wie devices.created_by
    name: "Anna Reiter",
    last_seen_at: 1_739_000_000_000,      // eigener Wert, sonst faengt kein Test die Vertauschung
  } as const;

  export const ALT_VERSION = {
    id: "v-1",
    value: "10.5.1",
    created_at: 1_736_000_000_000,        // eigener Wert
    created_by: "sub-anna",
    sort_order: 10,
    is_target: 1,                         // ⚠️ genau EINE Zeile — A2 (§2.4.2)
  } as const;

  /**
   * ⛛ ERGAENZUNG dieses Plans, nicht aus Spec 2 §1.3.4. Sie ist die Vorbedingung von
   * Idempotenz-Fall D (Aufgabe 9): „die Marke im ZIEL auf eine ANDERE Zeile umhaengen"
   * braucht eine andere Zeile. Mit nur ALT_VERSION gaebe es keine.
   * `value` MUSS abweichen (`software_versions_value_unique`), `created_at` ebenso
   * (die Regel oben), `is_target` ist 0 — genau eine Marke, sonst kippt A2.
   */
  export const ALT_VERSION_ZWEIT = {
    id: "v-2",
    value: "10.6.0",
    created_at: 1_736_500_000_000,        // eigener Wert
    created_by: "sub-bert",
    sort_order: 20,
    is_target: 0,
  } as const;

  export const ALT_EREIGNIS = {
    id: "e-1",
    device_id: "g-1",
    field: "status",
    old_value: "wartung",                 // ≠ new_value
    new_value: "einsatzbereit",           // ≠ old_value
    changed_by: "sub-bert",
    changed_at: 1_737_000_000_000,        // eigener Wert
    source: "manual",
  } as const;

  /**
   * Der fuenfte Enum-Wert, den Datenbank UND Typpruefung unbeanstandet passieren lassen
   * (§1.4.4) — die Zeile fuer `toNeuesGeraeteEreignis wirft bei source="importiert"`.
   *
   * ⚠️ SIE WIRD NICHT EINGESPIELT. `spieleQuellFixtureEin` laesst sie aus, und das ist
   * keine Nachlaessigkeit: die Quell-DDL fuehrt `source` als `text NOT NULL` ohne CHECK,
   * die Zeile ginge also glatt hinein — und danach wuerfe JEDER Integrationstest, weil
   * `pruefeQuelle` sie ablehnt. Sie ist eine Giftzeile fuer den direkten Mapper-Aufruf,
   * kein Bestandteil der gesunden Fixture.
   */
  export const ALT_EREIGNIS_UNBEKANNT = {
    ...ALT_EREIGNIS,
    id: "e-2",
    source: "importiert",
  } as const;

  export const ALT_LEIHE = {
    id: "l-1",
    device_id: "g-1",
    snapshot_call_sign: "HRO 1/83-1",    // ≠ borrower_name
    snapshot_serial_number: "SN-001",
    snapshot_device_type: "MTP6650",
    borrower_name: "Marek Sowa",         // ≠ snapshot_call_sign
    borrowed_at: 1_741_000_000_000,
    returned_at: 1_741_100_000_000,      // ≠ borrowed_at, ≠ created_at, ≠ updated_at
    return_note: "Akku leer",
    created_at: 1_740_999_999_000,
    updated_at: 1_741_100_001_000,
  } as const;

  // Die AKTIVE Leihe — §1.6.3 Fall B nennt sie namentlich und braucht sie.
  // ⚠️ Nebenbedingung aus der zeichengleich kopierten Quell-DDL: `loans_device_active_uidx`
  // laesst je `device_id` HOECHSTENS EINE Zeile mit `returned_at IS NULL` zu. ALT_LEIHE
  // (zurueckgegeben) und ALT_LEIHE_AKTIV duerfen deshalb beide auf `g-1` zeigen — sonst
  // weist schon das Einspielen der Fixture sie ab, und der Test ist aus dem falschen
  // Grund rot.
  export const ALT_LEIHE_AKTIV = {
    id: "l-aktiv",
    device_id: "g-1",
    snapshot_call_sign: "HRO 1/83-1",
    snapshot_serial_number: "SN-001",
    snapshot_device_type: "MTP6650",
    borrower_name: "Ines Falk",
    borrowed_at: 1_742_000_000_000,       // ≠ jede andere Zeitkonstante der Fixture
    returned_at: null,                    // DAS ist die Eigenschaft, an der Fall B haengt
    return_note: null,
    created_at: 1_742_000_001_000,
    updated_at: 1_742_000_002_000,
  } as const;
  ```

- [ ] **Schritt 4: Die Liste und die zwei Einspielfunktionen schreiben**

  Weiter in derselben Datei:

  ```ts
  /**
   * ⛛ ERGAENZUNG dieses Plans. Die Liste traegt die TABELLE je Zeile, weil die
   * Vertauschungsregel ueber `tabelle.feld` laeuft und nicht ueber den Feldnamen allein:
   * `created_at` gibt es in vier Tabellen, und dass sie dort verschiedene Werte tragen,
   * ist der eigentliche Schutz.
   *
   * ⚠️ ALT_EREIGNIS_UNBEKANNT steht MIT drin: seine Zeitwerte unterliegen derselben Regel.
   * Eingespielt wird es trotzdem nicht (siehe seinen Kommentar oben).
   */
  export const ALLE_QUELLZEILEN: ReadonlyArray<{
    tabelle: string;
    name: string;
    zeile: Record<string, unknown>;
  }> = [
    { tabelle: "users", name: "ALT_BENUTZER", zeile: ALT_BENUTZER },
    { tabelle: "software_versions", name: "ALT_VERSION", zeile: ALT_VERSION },
    { tabelle: "software_versions", name: "ALT_VERSION_ZWEIT", zeile: ALT_VERSION_ZWEIT },
    { tabelle: "devices", name: "ALT_GERAET", zeile: ALT_GERAET },
    { tabelle: "devices", name: "ALT_GERAET_OHNE_ANGABE", zeile: ALT_GERAET_OHNE_ANGABE },
    { tabelle: "device_events", name: "ALT_EREIGNIS", zeile: ALT_EREIGNIS },
    { tabelle: "device_events", name: "ALT_EREIGNIS_UNBEKANNT", zeile: ALT_EREIGNIS_UNBEKANNT },
    { tabelle: "loans", name: "ALT_LEIHE", zeile: ALT_LEIHE },
    { tabelle: "loans", name: "ALT_LEIHE_AKTIV", zeile: ALT_LEIHE_AKTIV },
  ];

  /**
   * Spielt die GESUNDE Fixture ein. Reihenfolge ist Pflicht, nicht Stil: `foreign_keys = ON`
   * ist gesetzt, und `device_events.device_id → devices.id` bricht hart ab, wenn ein
   * Ereignis vor seinem Geraet eingefuegt wird (§1.5.1).
   *
   * ⚠️ Die INSERTs nennen ihre Spalten. Das ist dieselbe Regel wie fuer `lieseQuelle`
   * (§1.2) und aus demselben Grund: `devices` hat 25 Spalten, ihre physische Reihenfolge
   * ist NICHT die des Schemas, und ein positionsweiser INSERT laeuft durch — SQLite nimmt
   * das alles an, die Tabellen sind nicht STRICT.
   */
  export function spieleQuellFixtureEin(db: Database.Database): void {
    const einfuegen = (tabelle: string, zeile: Record<string, unknown>) => {
      const spalten = Object.keys(zeile);
      const platzhalter = spalten.map(() => "?").join(", ");
      db.prepare(
        `insert into ${tabelle} (${spalten.join(", ")}) values (${platzhalter})`,
      ).run(...spalten.map((s) => zeile[s] as null | number | string));
    };

    einfuegen("users", ALT_BENUTZER);
    einfuegen("software_versions", ALT_VERSION);
    einfuegen("software_versions", ALT_VERSION_ZWEIT);
    einfuegen("devices", ALT_GERAET);
    einfuegen("devices", ALT_GERAET_OHNE_ANGABE);
    einfuegen("device_events", ALT_EREIGNIS);
    einfuegen("loans", ALT_LEIHE);
    einfuegen("loans", ALT_LEIHE_AKTIV);
  }

  /** Die uebliche Testquelle: DDL zuerst, Zeilen danach, nie verschachtelt. */
  export function baueBespielteQuellDb(): Database.Database {
    const db = baueQuellDb();
    spieleQuellFixtureEin(db);
    return db;
  }
  ```

- [ ] **Schritt 5: Tests grün**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **6 passed**. Meldet die Kollisionsprüfung etwas, ist ein Zeitwert doppelt vergeben —
  **den neuen Wert ändern, nie die Zusicherung lockern.**

- [ ] **Schritt 6: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add scripts/import/fixtures/radio-quelle.ts scripts/import/radio.test.ts
  rtk git commit -m "test(radio-import): die Fixture-Rohzeilen, je Feld ein eigener Wert, mit dem Riegel gegen Wiederverwendung"
  ```

---

## Aufgabe 3: Die Zeitachse und die zwei Faltungsriegel — reine Funktionen

**Das ist der teuerste Posten der ganzen Portierung** (§1.3). Der Fehler, den diese Aufgabe fängt,
hat drei Eigenschaften: er ist **paritätsgrün** (beide Arme, dieselbe Funktion), er **wirft nicht**
(`Math.floor(1_735_689_600/1000)` ist eine gültige Zahl, die Zeit liegt 1970), und **der nächste
Boot von `radio-admin` löscht die Historie** (`server/src/index.ts:35` → `retentionService.ts:47`,
sofort, Cutoff jetzt minus zwei Monate).

**Files:**
- Create: `scripts/import/radio.ts` (in dieser Aufgabe **nur** die reinen Funktionen)
- Modify: `scripts/import/radio.test.ts`

**Interfaces:**
- Verbraucht: nichts.
- Liefert (aus `scripts/import/radio.ts`):
  - `msZuDatum(feld: string, ms: number): Date`
  - `msZuDatumOptional(feld: string, ms: number | null | undefined): Date | null`
  - `tagInBerlin(feld: string, ms: number | null | undefined): string | null`
  - `zuBoolOptional(v: 0 | 1 | null): boolean | null`
  - `EREIGNIS_QUELLEN: readonly ["manual", "csv-import", "create", "update-note"]`
  - `pruefeQuelle(id: string, roh: string): (typeof EREIGNIS_QUELLEN)[number]`

⚠️ **`zuBoolOptional` und `pruefeQuelle` werden EXPORTIERT**, obwohl Spec 2 §1.3.5 und §1.4.4 sie
ohne `export` zeigen. Grund: blieben sie modulprivat, hätten sie ihre **einzigen** Tests über die
Mapper — und die sind bis ⬜ L1 gesperrt. Damit stünden die zwei Fallen `null → false` (§1.3.5) und
„fünfter Enum-Wert" (§1.4.4) in der heute ausführbaren Hälfte **ohne jeden Test**. Spec 2 §1.3.4
trennt für `tagInBerlin` genauso: drei Tests auf die **Funktion**, eine ⛛-Zeile auf die
**Verdrahtung**. Diese Aufgabe prüft die Funktion, Aufgabe 5 und 6a prüfen die Verdrahtung.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

  An `scripts/import/radio.test.ts` anhängen. **Fünf der elf Testnamen aus Spec 1 §2.2.5 stehen hier
  zeichengleich; drei weitere sind ⛛-Ergänzungen dieses Plans und als solche beschriftet.**

  ```ts
  import {
    msZuDatum,
    msZuDatumOptional,
    tagInBerlin,
    zuBoolOptional,
    pruefeQuelle,
  } from "./radio";

  describe("Die Zeitachse (Spec 2 §1.3.2)", () => {
    it("msZuDatum wirft bei einem Sekundenwert (1735689600)", () => {
      expect(() => msZuDatum("t.x", 1_735_689_600)).toThrow(/Millisekunden-Spanne/);
      // ⚠️ Die Meldung MUSS das Feld nennen. Ohne Ortsangabe ist sie um 23 Uhr im Fenster
      // wertlos — das ist der ganze Zweck des `feld`-Parameters (§1.3.2).
      expect(() => msZuDatum("t.x", 1_735_689_600)).toThrow(/t\.x/);
    });

    it("msZuDatum wirft bei 0 und bei null-artigen Werten in einer NOT-NULL-Spalte", () => {
      expect(() => msZuDatum("t.x", 0)).toThrow(/t\.x/);
      expect(() => msZuDatum("t.x", Number.NaN)).toThrow(/t\.x/);
      expect(() => msZuDatum("t.x", 1.5)).toThrow(/t\.x/);
      // Der Grenzfall nach oben gehoert dazu: 4e12 ist zulaessig, 4e12 + 1 nicht.
      expect(msZuDatum("t.x", 4_000_000_000_000).getTime()).toBe(4_000_000_000_000);
      expect(() => msZuDatum("t.x", 4_000_000_000_001)).toThrow(/Millisekunden-Spanne/);
    });

    it("tagInBerlin: 2026-08-16T22:00:00Z (Formular-Mitternacht) ergibt 2026-08-17", () => {
      expect(tagInBerlin("t.x", Date.UTC(2026, 7, 16, 22, 0, 0))).toBe("2026-08-17");
    });

    it("tagInBerlin: 2026-08-17T00:00:00Z (CSV-Weg) ergibt 2026-08-17", () => {
      expect(tagInBerlin("t.x", Date.UTC(2026, 7, 17, 0, 0, 0))).toBe("2026-08-17");
    });

    it("tagInBerlin: 2026-08-17T14:35:00Z (Date.now()-Weg) ergibt 2026-08-17", () => {
      expect(tagInBerlin("t.x", Date.UTC(2026, 7, 17, 14, 35, 0))).toBe("2026-08-17");
    });

    // ⛛ Ergaenzung dieses Plans: die Nullbehandlung der zwei optionalen Wege.
    it("msZuDatumOptional und tagInBerlin geben bei null und undefined null zurueck", () => {
      expect(msZuDatumOptional("t.x", null)).toBeNull();
      expect(msZuDatumOptional("t.x", undefined)).toBeNull();
      expect(tagInBerlin("t.x", null)).toBeNull();
      expect(tagInBerlin("t.x", undefined)).toBeNull();
      // ⚠️ Aber ein VORHANDENER, falscher Wert wirft auch auf dem optionalen Weg.
      expect(() => msZuDatumOptional("t.x", 1_735_689_600)).toThrow(/Millisekunden-Spanne/);
    });

    /**
     * ⛛ Ergaenzung dieses Plans. Ohne sie haette die dritte Falle derselben Bauart
     * (§1.3.5) bis ⬜ L1 keinen Test. `expect(zuBoolOptional(null)).toBeFalsy()` waere
     * KEIN Test: `false` besteht ihn. Deshalb `toBeNull()` und `toBe(false)` getrennt.
     */
    it("zuBoolOptional: null bleibt null, 0 wird false, 1 wird true", () => {
      expect(zuBoolOptional(null)).toBeNull();
      expect(zuBoolOptional(0)).toBe(false);
      expect(zuBoolOptional(1)).toBe(true);
    });

    /**
     * ⛛ Ergaenzung dieses Plans, auf FUNKTIONSebene. Die Verdrahtung prueft Aufgabe 6a
     * unter dem verbindlichen Namen `toNeuesGeraeteEreignis wirft bei source="importiert"`.
     */
    it("pruefeQuelle laesst die vier bekannten Werte durch und wirft bei jedem anderen", () => {
      for (const wert of ["manual", "csv-import", "create", "update-note"]) {
        expect(pruefeQuelle("e-1", wert)).toBe(wert);
      }
      expect(() => pruefeQuelle("e-2", "importiert")).toThrow(/source/);
      // Die Meldung MUSS die Zeile nennen — sonst sucht jemand die eine Zeile unter 20 000.
      expect(() => pruefeQuelle("e-2", "importiert")).toThrow(/e-2/);
    });
  });
  ```

- [ ] **Schritt 2: Lauf zur Bestätigung des Fehlschlags**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **FAIL** — `Failed to resolve import "./radio"`.

- [ ] **Schritt 3: `scripts/import/radio.ts` anlegen**

  Die Funktionen sind aus Spec 2 §1.3.2 (= Spec 1 §2.2.4) **unverändert** übernommen; `MS_MIN` und
  `MS_MAX` bleiben modulprivat, weil kein Test sie einzeln braucht. Das Argument in spitzen Klammern
  in der `Aufruf:`-Zeile des Kopfkommentars ist der **generische Platzhalter der Aufrufform**, kein
  zweiter Dateiname (Cutover-Leitplan NS9).

  ```ts
  /**
   * Import radio-admin (Alt-SQLite) -> Suite-Modul `radio`.
   *
   * ⚠️ WARUM DIESE DATEI EXISTIEREN MUSS: die Mapping-Funktion ist die EINZIGE Stelle, an der
   * der Faktor-1000-Fehler gefangen werden kann. Der Paritaetscheck kann es strukturell nicht —
   * scripts/import/parity.ts:43-56 vergleicht Multimengen von Zeilen-Hashes, und BEIDE Arme
   * laufen durch dieselbe Mapping-Funktion (scripts/import/portal.ts:73-76 schreibt es selbst
   * hin). Quelle ist epoch-MILLISEKUNDEN, Ziel ist Drizzle `mode: "timestamp"` =
   * Unix-SEKUNDEN. Sekunden statt Millisekunden legt jedes `returned_at` ins Jahr 1970, und
   * der naechste Boot von radio-admin loescht daraufhin die komplette abgeschlossene
   * Leihhistorie (server/src/index.ts:35 -> retentionService.ts:47, sofort).
   *
   * Aufruf: tsx scripts/import/radio.ts <radio-snapshot.db>   (DATA_DIR steuert das Ziel)
   */

  /**
   * Plausibilitaetsspanne fuer epoch-MILLISEKUNDEN. 1e12 = 2001-09-09, 4e12 = 2096-10-02.
   * Jeder echte radio-admin-Wert liegt in dieser Spanne; ein Sekundenwert (~1.7e9) liegt
   * darunter und WIRFT, statt als 1970 durchzulaufen.
   */
  const MS_MIN = 1_000_000_000_000;
  const MS_MAX = 4_000_000_000_000;

  export function msZuDatum(feld: string, ms: number): Date {
    if (!Number.isFinite(ms) || !Number.isInteger(ms)) {
      throw new Error(`${feld}: kein ganzzahliger Zeitstempel (${ms})`);
    }
    if (ms < MS_MIN || ms > MS_MAX) {
      throw new Error(
        `${feld}: ${ms} liegt ausserhalb der Millisekunden-Spanne — Sekunden statt Millisekunden?`,
      );
    }
    return new Date(ms);
  }

  export function msZuDatumOptional(feld: string, ms: number | null | undefined): Date | null {
    return ms === null || ms === undefined ? null : msZuDatum(feld, ms);
  }

  /** epoch-ms → Berliner Kalendertag `YYYY-MM-DD` (Spec 1 §2.2.3). Die Zone steht HIER, nicht in `TZ`. */
  const BERLIN = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  export function tagInBerlin(feld: string, ms: number | null | undefined): string | null {
    if (ms === null || ms === undefined) return null;
    const d = msZuDatum(feld, ms);
    const t = Object.fromEntries(BERLIN.formatToParts(d).map((p) => [p.type, p.value]));
    return `${t.year}-${t.month}-${t.day}`;
  }

  /**
   * ⚠️ scripts/import/portal.ts:48-49 und :51 benutzen `!!row.is_public`, und das darf hier
   * NICHT uebernommen werden. Dort ist es unbedenklich, weil die Spalten `notNull` sind. Hier
   * faltet `!!null` das `null` zu `false` — aus „Alamos nicht ERFASST" wird „nicht
   * integriert", aus „Ausleihbarkeit unbekannt" wird „nicht ausleihbar". Paritaetsgruen, aus
   * demselben strukturellen Grund wie der Faktor 1000.
   */
  export const zuBoolOptional = (v: 0 | 1 | null): boolean | null => (v === null ? null : v === 1);

  /**
   * `device_events.source` ist in Drizzle ein Enum, in SQL aber nur `` `source` text NOT NULL ``.
   * Die Datenbank nimmt JEDEN String; ein fuenfter Wert passiert Datenbank UND Typpruefung
   * unbeanstandet und bricht erst in einem erschoepfenden `switch` der Oberflaeche — Monate
   * spaeter, in einer Detailansicht. ⚠️ Der Riegel wirft, also muss er VOR dem Fenster feuern:
   * das ist A5 (Spec 2 §2.4.5), blockierend, mit `select distinct source from device_events;`.
   */
  export const EREIGNIS_QUELLEN = ["manual", "csv-import", "create", "update-note"] as const;

  export function pruefeQuelle(id: string, roh: string): (typeof EREIGNIS_QUELLEN)[number] {
    if (!(EREIGNIS_QUELLEN as readonly string[]).includes(roh)) {
      throw new Error(`device_events.source: unbekannter Wert "${roh}" (Zeile ${id})`);
    }
    return roh as (typeof EREIGNIS_QUELLEN)[number];
  }
  ```

- [ ] **Schritt 4: Tests grün**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **14 passed**. ⚠️ Schlägt einer der drei `tagInBerlin`-Tests fehl, ist **nicht** die
  Erwartung falsch, sondern die Zone: `Intl.DateTimeFormat` braucht volle ICU-Daten. Gemessen auf
  Node 26 in diesem Repo: `tagInBerlin("t.x", 1_740_871_800_000)` = `"2025-03-02"`, während
  `new Date(1_740_871_800_000).toISOString().slice(0,10)` = `"2025-03-01"` liefert — genau der
  Unterschied, den die ⛛-Zeile in Aufgabe 5 fängt.

- [ ] **Schritt 5: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add scripts/import/radio.ts scripts/import/radio.test.ts
  rtk git commit -m "feat(radio-import): die Zeitachse — msZuDatum, tagInBerlin und die zwei Faltungsriegel, mit ihren Tests"
  ```

---

## Aufgabe 4: `lieseQuelle` — fünf namentliche `SELECT`s, fünf Quelltypen, ein Quelltext-Scan

**Die Rechnung, die diese Aufgabe trägt** (§1.2): die physische Spaltenreihenfolge der produktiven
`devices` ist **nicht** die des Zielschemas, und **beide Tabellen haben 25 Spalten** — ein
positionsweiser Import scheitert also nicht an der Stelligkeit, er **läuft durch**. Der teuerste
Einzelposten ist Zielposition 20: `loanable` empfängt `created_at`, eine dreizehnstellige Zahl in
ein 0/1-Feld. **Danach ist jedes Gerät ausleihbar, auch das seit einem Jahr in Reparatur.** Kein
Test, keine Parität, kein Constraint sieht das.

**Files:**
- Modify: `scripts/import/radio.ts` (die fünf Quelltypen, `RadioQuelle`, `lieseQuelle`)
- Modify: `scripts/import/radio.test.ts`

**Interfaces:**
- Verbraucht: `baueBespielteQuellDb` aus Aufgabe 2.
- Liefert (aus `scripts/import/radio.ts`):
  - `interface AltGeraet` (25 Felder), `AltVersion` (6), `AltNutzer` (3), `AltEreignis` (8),
    `AltLeihe` (11)
  - `interface RadioQuelle { users: AltNutzer[]; softwareVersions: AltVersion[]; devices: AltGeraet[]; deviceEvents: AltEreignis[]; loans: AltLeihe[] }`
  - `lieseQuelle(quellDb: Database.Database): RadioQuelle`

⚠️ **Dieser Plan DEFINIERT die fünf Quelltypen; Spec 1 §8.2.1 benutzt sie nur.** Dort stehen sie als
Signaturbestandteil (`toNeuesGeraet(zeile: AltGeraet): NeuesGeraet` …), nirgends als Deklaration.
Die Feldnamen sind **nicht** frei: sie sind die Spaltennamen der Quell-DDL, zeichengleich. Die
Feldtypen folgen aus der DDL und aus dem, was better-sqlite3 zurückgibt (`integer` → `number`,
`text` → `string`, `NULL` → `null`). **Das ist keine Leerstelle, sondern eine Ableitung** — und die
Namen `AltGeraet`, `AltVersion`, `AltNutzer`, `AltEreignis`, `AltLeihe` sind eine **Zusage dieses
Plans an alle anderen Planteile.**

⚠️ **`RadioQuelle`s Feldnamen sind ebenfalls gesetzt**, nämlich durch Spec 2 §1.5.2: dort steht
`q.users`, `q.softwareVersions`, `q.devices`, `q.deviceEvents`, `q.loans`. Nicht neu erfinden.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

  An `scripts/import/radio.test.ts` anhängen; `lieseQuelle` und `baueBespielteQuellDb` importieren,
  dazu `readFileSync` aus `node:fs`.

  ```ts
  describe("lieseQuelle (Spec 2 §1.4)", () => {
    it("liest alle fuenf Tabellen im Import-Bereich", () => {
      const quellDb = baueBespielteQuellDb();
      try {
        const q = lieseQuelle(quellDb);
        expect(q.users).toHaveLength(1);
        expect(q.softwareVersions).toHaveLength(2);
        expect(q.devices).toHaveLength(2);
        expect(q.deviceEvents).toHaveLength(1);
        expect(q.loans).toHaveLength(2);
      } finally {
        quellDb.close();
      }
    });

    /**
     * Die Rohfassung der Zusicherung (b) des Reihenfolge-Tests aus Spec 2 §1.8. Sie steht
     * hier, weil sie ohne das Zielschema auskommt: ein positionsweiser Lesevorgang liefert
     * `tei === "SN-001"`, weil `tei` in der QUELLE an Position 25 steht und `serial_number`
     * an Position 4. Der vollstaendige Test unter dem verbindlichen Namen folgt in Aufgabe 5.
     */
    it("lieseQuelle liest namentlich: die Rohzeile traegt tei=7654321 und serial_number=SN-001", () => {
      const quellDb = baueBespielteQuellDb();
      try {
        const g = lieseQuelle(quellDb).devices.find((r) => r.id === "g-1");
        expect(g).toBeDefined();
        expect(g?.tei).toBe("7654321");
        expect(g?.serial_number).toBe("SN-001");
        // Die zwei 0/1-Integer kommen ROH an — die Faltung passiert erst im Mapper.
        expect(g?.alamos_integrated).toBe(1);
        expect(g?.loanable).toBe(0);
        // Und die zweite Zeile traegt sie als NULL, nicht als 0.
        const g2 = lieseQuelle(quellDb).devices.find((r) => r.id === "g-2");
        expect(g2?.alamos_integrated).toBeNull();
        expect(g2?.loanable).toBeNull();
      } finally {
        quellDb.close();
      }
    });

    /**
     * ⛛ Ergaenzung dieses Plans: ein QUELLTEXT-SCAN. Spec 1 §2.8.1 verbietet `SELECT *`
     * (docs/runbooks/lagerbuch-cutover.md:30-31), und das naechste Vorbild im Repo BRICHT
     * die Regel — scripts/import/feedback.ts:66-72 liest fuenfmal `SELECT * FROM …`. Ohne
     * diesen Scan haelt die Regel nichts: ein spaeteres „der Einheitlichkeit wegen" ist ein
     * Einzeiler, und alle anderen Tests bleiben gruen, weil die Fixture zufaellig dieselben
     * Spalten in derselben Reihenfolge hat wie das Ziel.
     * Hausform fuer Quelltext-Scans: scripts/seed-lokal.test.ts:47-59,
     * src/app/m/portal/_lib/neuigkeiten/register.test.ts.
     */
    it("scripts/import/radio.ts enthaelt kein SELECT * — die Spalten stehen namentlich", () => {
      const quelltext = readFileSync("./scripts/import/radio.ts", "utf8");
      expect(quelltext).not.toMatch(/select\s+\*/i);
    });
  });
  ```

- [ ] **Schritt 2: Lauf zur Bestätigung des Fehlschlags**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **FAIL** — `lieseQuelle` ist kein Export von `./radio`. Der Quelltext-Scan ist zu
  diesem Zeitpunkt bereits **grün** (die Datei enthält noch kein SQL); das ist in Ordnung, er wird
  in Schritt 3 auf die Probe gestellt.

- [ ] **Schritt 3: Die Quelltypen und `lieseQuelle` schreiben**

  An `scripts/import/radio.ts` anhängen. Oben ergänzen:
  `import type Database from "better-sqlite3";`

  ```ts
  // ── Die Quellzeilen, wie better-sqlite3 sie liefert ───────────────────────────────────────
  //
  // ⚠️ Die Feldnamen sind die SQL-Spaltennamen der Quelle, zeichengleich — nicht die
  // camelCase-Namen des Ziels. Das ist Absicht: 61 zuzuordnende Spalten, und jede Umbenennung
  // waere eine Verwechslungsgelegenheit (Spec 1 §2.5, docs/radio-portierung-analyse.md:743-747).
  // Belegt gegen radio-admin@265abd5:server/drizzle/0000..0004.

  export interface AltNutzer {
    sub: string;
    name: string;
    last_seen_at: number;
  }

  export interface AltVersion {
    id: string;
    value: string;
    created_at: number;
    created_by: string | null;
    sort_order: number;
    is_target: number; // in der Quelle NOT NULL (0002_numerous_mandroid.sql:2) — nie null
  }

  export interface AltGeraet {
    id: string;
    rufname: string | null;
    issi: string;
    tei: string | null;
    serial_number: string | null;
    device_type: string | null;
    status: string | null;
    location: string | null;
    assigned_to: string | null;
    software_version: string | null;
    last_updated_at: number | null; // epoch-ms; wird im Ziel zu TEXT `YYYY-MM-DD`
    notes: string | null;
    hiorg_id: string | null;
    opta: string | null;
    funktion: string | null;
    hersteller: string | null;
    bedieneinheit: string | null;
    device_modes: string | null;
    // ⚠️ `0 | 1 | null`, nicht `number | null`: nur so faellt eine Fixture-Zeile ohne
    // `as const` schon in der Typpruefung auf, statt spaeter am Mapper. Die Fixture-Zeilen
    // in scripts/import/fixtures/radio-quelle.ts tragen deshalb `as const` (Aufgabe 2).
    alamos_integrated: 0 | 1 | null;
    loanable: 0 | 1 | null;
    update_note: string | null;
    created_at: number;
    updated_at: number;
    created_by: string | null;
    updated_by: string | null;
  }

  export interface AltEreignis {
    id: string;
    device_id: string;
    field: string;
    old_value: string | null;
    new_value: string | null;
    changed_by: string | null;
    changed_at: number;
    source: string; // ⚠️ ABSICHTLICH `string`, nicht das Enum: die DB nimmt jeden Wert.
  }

  export interface AltLeihe {
    id: string;
    device_id: string;
    snapshot_call_sign: string;
    snapshot_serial_number: string | null;
    snapshot_device_type: string | null;
    borrower_name: string;
    borrowed_at: number;
    returned_at: number | null; // NULL heisst „aktive Leihe" und MUSS NULL bleiben
    return_note: string | null;
    created_at: number;
    updated_at: number;
  }

  /** Feldnamen gesetzt durch Spec 2 §1.5.2 (`q.users`, `q.softwareVersions`, …). */
  export interface RadioQuelle {
    users: AltNutzer[];
    softwareVersions: AltVersion[];
    devices: AltGeraet[];
    deviceEvents: AltEreignis[];
    loans: AltLeihe[];
  }

  /**
   * Die fuenf Quellabfragen. ⚠️ JEDE nennt ihre Spalten. Das ist keine Ordnungsfrage:
   *
   * `devices` hat in der Quelle 25 Spalten in der Reihenfolge, die die MIGRATIONEN erzeugt
   * haben — `update_note` an Position 24 (aus 0001), `tei` an Position 25 (aus 0004). Das
   * Ziel entsteht in einem Rutsch aus der Deklarationsreihenfolge von Spec 1 §2.5.1, dort
   * steht `tei` an Position 4 und `update_note` an 21. BEIDE Tabellen haben 25 Spalten, ein
   * positionsweiser Import scheitert also nicht an der Stelligkeit — er laeuft durch. SQLite
   * nimmt das an: die Tabellen sind nicht STRICT, Typaffinitaet konvertiert wo sie kann und
   * speichert sonst den Wert im Originaltyp. Der teuerste Einzelposten ist Zielposition 20:
   * `loanable` empfaengt `created_at`, eine 13-stellige Zahl in ein 0/1-Feld — danach ist
   * JEDES Geraet ausleihbar. Dieselbe Falle, dort gemessen als `aktiv ← created_by`, steht in
   * docs/runbooks/lagerbuch-cutover.md:33-34.
   *
   * Die Spaltenreihenfolge im `devices`-SELECT ist die des ZIELS (Spec 1 §2.5.1), nicht die
   * physische der Quelle — zulaessig und erwuenscht, weil namentlich gelesen wird und die
   * Liste so Feld fuer Feld gegen das Zielschema gegengelesen werden kann.
   *
   * ⚠️ Gegen das naechste Vorbild: scripts/import/feedback.ts:66-72 liest `SELECT *`.
   * Diesem Vorbild wird NICHT gefolgt.
   */
  export function lieseQuelle(quellDb: Database.Database): RadioQuelle {
    return {
      users: quellDb
        .prepare("SELECT sub, name, last_seen_at FROM users")
        .all() as AltNutzer[],

      softwareVersions: quellDb
        .prepare(
          "SELECT id, value, created_at, created_by, sort_order, is_target FROM software_versions",
        )
        .all() as AltVersion[],

      devices: quellDb
        .prepare(
          `SELECT id, rufname, issi, tei, serial_number, device_type, status, location, assigned_to,
                  software_version, last_updated_at, notes, hiorg_id, opta, funktion, hersteller,
                  bedieneinheit, device_modes, alamos_integrated, loanable, update_note,
                  created_at, updated_at, created_by, updated_by
             FROM devices`,
        )
        .all() as AltGeraet[],

      deviceEvents: quellDb
        .prepare(
          `SELECT id, device_id, field, old_value, new_value, changed_by, changed_at, source
             FROM device_events`,
        )
        .all() as AltEreignis[],

      loans: quellDb
        .prepare(
          `SELECT id, device_id, snapshot_call_sign, snapshot_serial_number, snapshot_device_type,
                  borrower_name, borrowed_at, returned_at, return_note, created_at, updated_at
             FROM loans`,
        )
        .all() as AltLeihe[],
    };
  }
  ```

  ⚠️ **`api_tokens` und `zugangscodes` stehen hier nicht, und beides ist gewollt.** `api_tokens`
  existiert **im Ziel nicht** (B16, Entscheidung 13, ausgeschrieben in W4) — ihre `COUNT(*)`-Zeile
  bleibt als **Protokollzeile** im Quellarm des Runbooks (Abfrage T, §5.2.2), nicht als
  Paritäts-Sollwert. `zugangscodes` hat **kein Quellgegenstück**: der heutige QR-Mechanismus trägt
  den einen geteilten API-Token base64-kodiert im URL-Parameter, ohne Ablauf und ohne Widerruf
  (§1.4.6).

- [ ] **Schritt 4: Tests grün**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **17 passed**. ⚠️ Der Quelltext-Scan trägt jetzt echte Last — schlägt er fehl, steht
  irgendwo ein `SELECT *`, und das ist kein Formfehler, sondern die Falle aus §1.2.

- [ ] **Schritt 5: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add scripts/import/radio.ts scripts/import/radio.test.ts
  rtk git commit -m "feat(radio-import): lieseQuelle liest die fuenf Quelltabellen namentlich, nie ueber SELECT *"
  ```

> ### ⛔ Hier endet die heute ausführbare Hälfte
>
> Alles ab Aufgabe 5 braucht `src/app/m/radio/_db/schema.ts` und damit den Bau von Spec 1.
> **Der Zwischenstand ist bewusst ein tragfähiger Endzustand:** vier Dateien, siebzehn grüne
> Tests, `typecheck`/`lint`/`vitest` grün, und die drei teuersten Riegel des Kapitels (die
> Spaltenreihenfolge, der Faktor 1000, die `null`-Faltung) sind gesetzt. Wer hier aufhört, hat
> nichts Halbes im Baum stehen — nur noch keinen Importer.

---

## Aufgabe 5: `toNeuesGeraet` — 25 Felder, der Faktor 1000, die zwei 0/1-Integer, der Berliner Tag

**Wartet auf:** ⬜ **L1** — die Typaliase `NeuesGeraet` und `Geraet` aus
`src/app/m/radio/_db/schema.ts` (Spec 1 §2.2.4 belegt genau diese zwei namentlich).
**Wartet auf:** Spec 1 §2.5.1 — die Tabelle `devices` mit ihren 25 Spalten.

**Warum `devices` allein eine Aufgabe ist:** 25 Felder, drei verschiedene Fallen (Faktor 1000,
0/1-Vertauschung, Typwechsel auf den Berliner Kalendertag) und der einzige Test des ganzen Kapitels,
den Spec 1 §2.11 unter den „drei, ohne die dieses Kapitel keinen Schutz hat" führt. Eine Prüfende
kann diese Aufgabe einzeln annehmen oder ablehnen; zusammen mit den anderen vier Mappern könnte sie
es nicht.

**Files:**
- Modify: `scripts/import/radio.ts` (`toNeuesGeraet`)
- Modify: `scripts/import/radio.test.ts`

**Interfaces:**
- Verbraucht: `msZuDatum`, `tagInBerlin`, `zuBoolOptional` aus Aufgabe 3 · `AltGeraet`,
  `lieseQuelle` aus Aufgabe 4 · `ALT_GERAET`, `ALT_GERAET_OHNE_ANGABE`, `baueBespielteQuellDb` aus
  Aufgabe 2.
- Liefert: `toNeuesGeraet(zeile: AltGeraet): NeuesGeraet` — Name und Signatur zeichengleich aus
  Spec 1 §8.2.1.

- [ ] **Schritt 1: Die Sperre gegenprüfen, bevor irgendetwas geschrieben wird**

  ```bash
  rtk grep -n "export type NeuesGeraet\|export type Geraet" src/app/m/radio/_db/schema.ts
  ```

  Erwartung: **zwei Treffer**. Kein Treffer oder keine Datei heißt: ⬜ **L1** ist offen, die Aufgabe
  beginnt nicht. **Die Aliasnamen werden hier ABGELESEN, nicht gewählt** — heißen sie in der
  gebauten Datei anders, gilt die gebaute Datei, und der Name wandert durch alle folgenden Aufgaben
  mit. Den abgelesenen Namen ins Protokoll dieses Plans schreiben:

  ```
  L1 abgelesen am ____________:  Insert-Alias = ______________  Select-Alias = ______________
  ```

- [ ] **Schritt 2: Die fehlschlagenden Tests schreiben**

  An `scripts/import/radio.test.ts` anhängen; oben ergänzen:
  `import { toNeuesGeraet } from "./radio";` und
  `import { ALT_GERAET, ALT_GERAET_OHNE_ANGABE } from "./fixtures/radio-quelle";`

  ```ts
  describe("toNeuesGeraet (Spec 2 §1.4.3)", () => {
    /**
     * Der erste der drei Tests, ohne die dieses Kapitel keinen Schutz hat (§1.10).
     * ⚠️ Die zwei Konstanten sind paarweise verschieden — deshalb faengt DERSELBE Test auch
     * die Vertauschung von `created_at` und `updated_at`.
     */
    it("toNeuesGeraet: jedes Zeitfeld behaelt SEINEN Wert in Millisekunden", () => {
      const g = toNeuesGeraet(ALT_GERAET);
      expect(g.createdAt.getTime()).toBe(1_735_689_600_000);
      expect(g.updatedAt.getTime()).toBe(1_738_368_000_000);
      expect(g.createdAt.getUTCFullYear()).toBe(2025);
      expect(g.updatedAt.getUTCFullYear()).toBe(2025);
    });

    it("toNeuesGeraet: alamos_integrated und loanable werden nicht vertauscht", () => {
      const g = toNeuesGeraet(ALT_GERAET);
      expect(g.alamosIntegrated).toBe(true);
      expect(g.loanable).toBe(false);
    });

    /**
     * Der zwoelfte Test aus Spec 2 §1.3.5, additiv zu Spec 1 §2.2.5.
     * ⚠️ `expect(g.loanable).toBeFalsy()` waere KEIN Test: `false` besteht ihn.
     */
    it("toNeuesGeraet: alamos_integrated=null und loanable=null bleiben null", () => {
      const g = toNeuesGeraet(ALT_GERAET_OHNE_ANGABE);
      expect(g.alamosIntegrated).toBeNull();
      expect(g.loanable).toBeNull();
    });

    /**
     * ⛛ Additive Zusicherung (Spec 2 §1.3.4): die EINZIGE Spalte mit Typwechsel und die
     * einzige, deren Richtigkeit an der ZONE haengt. Die drei tagInBerlin-Tests aus Aufgabe 3
     * pruefen die FUNKTION; diese Zeile prueft die VERDRAHTUNG. Ein Mapper mit
     * `new Date(ms).toISOString().slice(0,10)` liefert hier "2025-03-01".
     *
     * ⚠️ Der Sollwert ist der BERLINER Kalendertag, nicht „einer der beiden Kandidatentage".
     * Die Alt-Anwendung ist fuer diese eine Spalte KEINE zulaessige zweite Meinung: ihr
     * CSV-Export formatiert UTC (radio-admin@265abd5:server/src/routes/export.ts:49-51),
     * ihre Detailansicht den lokalen Tag (client/src/utils/format.ts:4,
     * client/src/features/devices/DeviceEditForm.tsx:41) — sie widersprechen sich bei genau
     * den Zeilen, um die es geht.
     */
    it("toNeuesGeraet: last_updated_at wird zum BERLINER Kalendertag", () => {
      expect(toNeuesGeraet(ALT_GERAET).lastUpdatedAt).toBe("2025-03-02");
      // NULL bleibt NULL — kein "" und kein heutiges Datum.
      expect(toNeuesGeraet(ALT_GERAET_OHNE_ANGABE).lastUpdatedAt).toBeNull();
    });

    /**
     * Der verbindliche Name aus Spec 2 §1.8, jetzt mit BEIDEN Zusicherungen: (a) die Fixture
     * traegt wirklich die produktive Spaltenreihenfolge (sie steht auch als eigener Test in
     * Aufgabe 1), (b) der Weg Quelle → lieseQuelle → toNeuesGeraet liest namentlich.
     * Ein positionsweiser Import liefert hier `tei === "SN-001"`.
     */
    it("lieseQuelle liest namentlich: devices.tei steht in der Quelle an Position 25", () => {
      const quellDb = baueBespielteQuellDb();
      try {
        const spalten = quellDb
          .prepare("select cid, name from pragma_table_info('devices') order by cid")
          .all() as Array<{ cid: number; name: string }>;
        expect(spalten[spalten.length - 2]?.name).toBe("update_note");
        expect(spalten[spalten.length - 1]?.name).toBe("tei");

        const roh = lieseQuelle(quellDb).devices.find((r) => r.id === "g-1");
        const g = toNeuesGeraet(roh!);
        expect(g.tei).toBe("7654321");
        expect(g.serialNumber).toBe("SN-001");
      } finally {
        quellDb.close();
      }
    });

    /**
     * Hausregel: jeder Mapper-Test prueft ALLE Zielfelder gegen konkrete Werte per `toEqual`,
     * nicht nur Typ- oder Null-Checks (scripts/import/feedback.test.ts:181-183). Ohne diese
     * eine Zeile faengt keiner der Tests oben ein GEDROPPTES Feld — es fehlt dann einfach,
     * und `toBe`-Zusicherungen auf andere Felder bleiben gruen.
     */
    it("toNeuesGeraet: alle 25 Zielfelder, Feld fuer Feld", () => {
      expect(toNeuesGeraet(ALT_GERAET)).toEqual({
        id: "g-1",
        rufname: "HRO 1/83-1",
        issi: "1234567",
        tei: "7654321",
        serialNumber: "SN-001",
        deviceType: "MTP6650",
        status: "einsatzbereit",
        location: "Funkraum",
        assignedTo: "GW-San",
        softwareVersion: "10.5.1",
        lastUpdatedAt: "2025-03-02",
        notes: "Stammnotiz",
        hiorgId: "HO-002",
        opta: "OPTA-003",
        funktion: "Fuehrung",
        hersteller: "Motorola",
        bedieneinheit: "TMR880i",
        deviceModes: "TMO,DMO",
        alamosIntegrated: true,
        loanable: false,
        updateNote: "ISSI abweichend",
        createdAt: new Date(1_735_689_600_000),
        updatedAt: new Date(1_738_368_000_000),
        createdBy: "sub-anna",
        updatedBy: "sub-bert",
      });
    });
  });
  ```

- [ ] **Schritt 3: Lauf zur Bestätigung des Fehlschlags**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **FAIL** — `toNeuesGeraet` ist kein Export von `./radio`.

- [ ] **Schritt 4: `toNeuesGeraet` schreiben**

  An `scripts/import/radio.ts` anhängen; oben **einmal** ergänzen:

  ```ts
  import * as schema from "@/app/m/radio/_db/schema";
  ```

  ⚠️ **Der WERT-Import, nicht `import type`.** Er trägt hier zwar nur Typpositionen
  (`schema.NeuesGeraet`), aber Aufgabe 7 und 8 brauchen dieselbe Bindung als Wert
  (`db.select().from(schema.users)`). Eine Zeile, die später von `import type` auf `import`
  umgestellt werden müsste, ist eine Zeile, die jemand **zusätzlich** schreibt statt sie zu
  ersetzen — und dann steht `schema` zweimal im Modul und TypeScript meldet
  `Cannot redeclare block-scoped variable 'schema'`. ⚠️ Den Aliasnamen aus Schritt 1 einsetzen;
  `NeuesGeraet` ist hier der abgelesene Insert-Alias.

  ```ts
  /**
   * 25 Spalten, Feld fuer Feld gegen Spec 1 §2.5.1 gegengelesen. Die Reihenfolge hier ist die
   * des ZIELSCHEMAS — nicht die physische der Quelle —, damit sie beim Gegenlesen Zeile fuer
   * Zeile mit der Schemadatei fluchtet.
   *
   * ⚠️ Jeder Zugriff geht ueber den NAMEN. Kein Destructuring nach Position, kein Spread aus
   * der Quellzeile: `{ ...zeile }` traegt `serial_number` statt `serialNumber` und `snake_case`
   * statt `camelCase` — Drizzle nimmt die unbekannten Schluessel klaglos entgegen und schreibt
   * die bekannten als `undefined`.
   */
  export function toNeuesGeraet(zeile: AltGeraet): schema.NeuesGeraet {
    return {
      id: zeile.id,
      rufname: zeile.rufname ?? null,
      issi: zeile.issi, // NICHT `tei`
      tei: zeile.tei ?? null, // NICHT `issi`
      serialNumber: zeile.serial_number ?? null,
      deviceType: zeile.device_type ?? null,
      status: zeile.status ?? null,
      location: zeile.location ?? null,
      assignedTo: zeile.assigned_to ?? null,
      softwareVersion: zeile.software_version ?? null,
      // TYPWECHSEL integer(ms) -> text `YYYY-MM-DD` in Europe/Berlin (Spec 1 §2.2.3).
      lastUpdatedAt: tagInBerlin("devices.last_updated_at", zeile.last_updated_at),
      notes: zeile.notes ?? null,
      hiorgId: zeile.hiorg_id ?? null,
      opta: zeile.opta ?? null,
      funktion: zeile.funktion ?? null,
      hersteller: zeile.hersteller ?? null,
      bedieneinheit: zeile.bedieneinheit ?? null,
      // Klartext, komma-verbunden. KEINE Normalisierung, kein Trim, kein Sortieren:
      // genau eine Stelle liest und splittet ihn.
      deviceModes: zeile.device_modes ?? null,
      alamosIntegrated: zuBoolOptional(zeile.alamos_integrated),
      loanable: zuBoolOptional(zeile.loanable),
      // APPEND-ONLY in der Quelle (radio-admin/server/src/db/schema.ts:33-36) — genau die
      // Spalte, die ein Zweitimport plattwalzt (§1.6.3 Fall A).
      updateNote: zeile.update_note ?? null,
      createdAt: msZuDatum("devices.created_at", zeile.created_at),
      updatedAt: msZuDatum("devices.updated_at", zeile.updated_at),
      // OIDC-`sub`, OHNE FK auf users.sub: ein FK hier braeche jeden Kaltimport, dessen
      // `sub`-Werte in der Suite noch nie eingeloggt waren — also jeden (Spec 1 §2.3).
      createdBy: zeile.created_by ?? null,
      updatedBy: zeile.updated_by ?? null,
    };
  }
  ```

- [ ] **Schritt 5: Tests grün**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts && rtk pnpm typecheck
  ```

  Erwartung: **23 passed**, `typecheck` grün. ⚠️ Meldet `typecheck` fehlende oder unbekannte
  Eigenschaften, ist die Schemadatei anders gebaut als Spec 1 §2.5.1 — **das ist ein Befund über
  Spec 1, kein Anlass, hier ein `as` zu setzen.** Ein `as schema.NeuesGeraet` auf dem Rückgabewert
  schaltet genau die Prüfung ab, für die diese Aufgabe existiert.

- [ ] **Schritt 6: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add scripts/import/radio.ts scripts/import/radio.test.ts
  rtk git commit -m "feat(radio-import): toNeuesGeraet — 25 Felder, Faktor-1000-Riegel, Berliner Kalendertag"
  ```

---

## Aufgabe 6a: Die drei schmalen Mapper — `users`, `software_versions`, `device_events`

**Wartet auf:** ⬜ **L1** — die Insert-Aliase für `users`, `software_versions` und `device_events`.
Spec 1 §8.2.1 **benutzt** `NeuerBenutzer`, `NeueSoftwareVersion` und `NeuesGeraeteEreignis` in
Signaturen; **exportiert** sind sie nirgends. **Wartet auf:** Spec 1 §2.5.2–§2.5.4.

**Files:**
- Modify: `scripts/import/radio.ts`
- Modify: `scripts/import/radio.test.ts`

**Interfaces:**
- Verbraucht: `msZuDatum`, `pruefeQuelle` aus Aufgabe 3 · `AltNutzer`, `AltVersion`, `AltEreignis`
  aus Aufgabe 4 · `ALT_BENUTZER`, `ALT_VERSION`, `ALT_VERSION_ZWEIT`, `ALT_EREIGNIS`,
  `ALT_EREIGNIS_UNBEKANNT` aus Aufgabe 2.
- Liefert: `toNeuenBenutzer(zeile: AltNutzer): NeuerBenutzer` ·
  `toNeueSoftwareVersion(zeile: AltVersion): NeueSoftwareVersion` ·
  `toNeuesGeraeteEreignis(zeile: AltEreignis): NeuesGeraeteEreignis`

⚠️ **Die Funktion heißt `toNeuenBenutzer`, der ⛛-Testname in Spec 2 §1.3.4 lautet
`toNeuerBenutzer: last_seen_at behaelt SEINEN Wert`.** Beides bleibt zeichengleich stehen: der
Funktionsname ist durch Spec 1 §8.2.1 und Spec 2 §1.5.2 gesetzt, der Testname durch Spec 2 §1.3.4.
Der Testname ist **kein Aufruf** — er darf abweichen, und ihn hier stillschweigend zu vereinheitlichen
hieße, eine verbindliche Zeile umzuschreiben. Notiert als kleiner Fund am Ende dieses Plans.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

  ```ts
  describe("Die drei schmalen Mapper (Spec 2 §1.4.1, §1.4.2, §1.4.4)", () => {
    // ⛛ Additive Zusicherung (§1.3.4). Ohne sie ist der Faktor-1000-Riegel fuer `users`
    // eine Zusage, die kein Test haelt: ein Mapper mit `new Date(ms/1000)` fragt msZuDatum
    // NIE, wirft NIE und landet still im Jahr 1970.
    it("toNeuerBenutzer: last_seen_at behaelt SEINEN Wert", () => {
      expect(toNeuenBenutzer(ALT_BENUTZER).lastSeenAt.getTime()).toBe(1_739_000_000_000);
    });

    it("toNeuenBenutzer: alle drei Zielfelder, Feld fuer Feld", () => {
      expect(toNeuenBenutzer(ALT_BENUTZER)).toEqual({
        // ROH, ohne `pocketid:`-Praefix — radio-admin schreibt den sub schon roh
        // (radio-admin/server/src/db/schema.ts:79); der Praefix ist ein Artefakt des KIOSK.
        sub: "sub-anna",
        name: "Anna Reiter",
        lastSeenAt: new Date(1_739_000_000_000),
      });
    });

    // ⛛ Additive Zusicherung (§1.3.4).
    it("toNeueSoftwareVersion: created_at behaelt SEINEN Wert", () => {
      expect(toNeueSoftwareVersion(ALT_VERSION).createdAt.getTime()).toBe(1_736_000_000_000);
    });

    it("toNeueSoftwareVersion: alle sechs Zielfelder, und is_target bleibt EINE Marke", () => {
      expect(toNeueSoftwareVersion(ALT_VERSION)).toEqual({
        id: "v-1",
        value: "10.5.1", // KEINE Normalisierung, kein Trim: `software_versions_value_unique`
        createdAt: new Date(1_736_000_000_000),
        createdBy: "sub-anna", // tote Spalte, wandert trotzdem (§1.7 Punkt 2)
        sortOrder: 10,
        isTarget: true,
      });
      expect(toNeueSoftwareVersion(ALT_VERSION_ZWEIT).isTarget).toBe(false);
    });

    // ⛛ Additive Zusicherung (§1.3.4) — DIE Zeile, die `new Date(ms/1000)` fuer
    // `device_events` faengt. Der Enum-Test unten sagt ueber `changed_at` nichts.
    it("toNeuesGeraeteEreignis: changed_at behaelt SEINEN Wert", () => {
      expect(toNeuesGeraeteEreignis(ALT_EREIGNIS).changedAt.getTime()).toBe(1_737_000_000_000);
    });

    // Verbindlicher Name aus Spec 1 §2.2.5.
    it('toNeuesGeraeteEreignis wirft bei source="importiert"', () => {
      expect(() => toNeuesGeraeteEreignis(ALT_EREIGNIS_UNBEKANNT)).toThrow(/source/);
      expect(() => toNeuesGeraeteEreignis(ALT_EREIGNIS_UNBEKANNT)).toThrow(/e-2/);
    });

    it("toNeuesGeraeteEreignis: alle acht Zielfelder, Feld fuer Feld", () => {
      expect(toNeuesGeraeteEreignis(ALT_EREIGNIS)).toEqual({
        id: "e-1",
        deviceId: "g-1",
        field: "status",
        oldValue: "wartung",
        newValue: "einsatzbereit",
        changedBy: "sub-bert",
        changedAt: new Date(1_737_000_000_000),
        source: "manual",
      });
    });
  });
  ```

- [ ] **Schritt 2: Lauf zur Bestätigung des Fehlschlags**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **FAIL** — die drei Mapper sind kein Export von `./radio`.

- [ ] **Schritt 3: Die drei Mapper schreiben**

  ```ts
  export function toNeuenBenutzer(zeile: AltNutzer): schema.NeuerBenutzer {
    return {
      // 1:1 und ROH. Keine Zuordnungstabelle alt_sub → neu_sub: die Pocket-ID-Instanz fuehrt
      // `subject_types_supported: ["public"]`, der `sub` ist ueber beide OIDC-Clients identisch
      // (Spec 1 §2.5.3).
      sub: zeile.sub,
      name: zeile.name,
      lastSeenAt: msZuDatum("users.last_seen_at", zeile.last_seen_at),
    };
  }

  export function toNeueSoftwareVersion(zeile: AltVersion): schema.NeueSoftwareVersion {
    return {
      id: zeile.id,
      // KEINE Normalisierung: `software_versions_value_unique` besteht in beiden Datenbanken,
      // ein Trimmen erzeugte einen Konflikt, den es in der Quelle nicht gab.
      value: zeile.value,
      createdAt: msZuDatum("software_versions.created_at", zeile.created_at),
      // TOTE SPALTE, WANDERT TROTZDEM. Geschrieben (softwareVersionRepo.ts:39, :53), in keiner
      // Projektion gelesen. Kriterium ist „wird sie GESCHRIEBEN?", nicht „wird sie gelesen?"
      // (§1.7 Punkt 2): ein Leser laesst sich nachbauen, ein verlorener Wert nicht.
      createdBy: zeile.created_by ?? null,
      sortOrder: zeile.sort_order ?? 0,
      // In der Quelle NOT NULL (0002_numerous_mandroid.sql:2) — also KEIN zuBoolOptional.
      // ⚠️ Genau eine Zeile darf `is_target = 1` tragen, und keine Datenbank erzwingt das:
      // getTargetVersion (softwareVersionRepo.ts:63-70) hat kein ORDER BY, bei zwei Marken
      // entscheidet der Zufall ueber den Update-Stand JEDES Geraets. Der Importer wandert 1:1
      // und kann das nicht retten — die Abwehr ist A2 (§2.4.2), blockierend, genau `1`.
      isTarget: zeile.is_target === 1,
    };
  }

  export function toNeuesGeraeteEreignis(zeile: AltEreignis): schema.NeuesGeraeteEreignis {
    return {
      id: zeile.id,
      deviceId: zeile.device_id,
      field: zeile.field,
      oldValue: zeile.old_value ?? null,
      newValue: zeile.new_value ?? null,
      changedBy: zeile.changed_by ?? null,
      changedAt: msZuDatum("device_events.changed_at", zeile.changed_at),
      source: pruefeQuelle(zeile.id, zeile.source),
    };
  }
  ```

- [ ] **Schritt 4: Tests grün, Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add scripts/import/radio.ts scripts/import/radio.test.ts
  rtk git commit -m "feat(radio-import): die Mapper fuer users, software_versions und device_events, mit dem Enum-Riegel"
  ```

---

## Aufgabe 6b: `toNeueLeihe` — 12 Zielfelder, vier Zeitstempel, `zugangscodeId` immer `null`

**Wartet auf:** ⬜ **L1** — der Insert-Alias `NeueLeihe`. **Wartet auf:** Spec 1 §2.5.5.

**Warum getrennt von 6a:** `loans` ist die Tabelle, an der **beide** teuren Idempotenzfälle hängen
(B und, mittelbar über die Retention, die ganze Historie), die einzige mit **elf Quell- und zwölf
Zielspalten**, und die einzige, in der `NULL` eine **fachliche Aussage** trägt: `returned_at IS NULL`
heißt „aktive Leihe". Ein `?? new Date(0)` an dieser einen Stelle machte jede aktive Leihe zu einer
1970 zurückgegebenen — und der Retention-Purge löschte sie beim nächsten Lauf.

**Files:**
- Modify: `scripts/import/radio.ts`
- Modify: `scripts/import/radio.test.ts`

**Interfaces:**
- Verbraucht: `msZuDatum`, `msZuDatumOptional` aus Aufgabe 3 · `AltLeihe` aus Aufgabe 4 ·
  `ALT_LEIHE`, `ALT_LEIHE_AKTIV` aus Aufgabe 2.
- Liefert: `toNeueLeihe(zeile: AltLeihe): NeueLeihe`

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

  ```ts
  describe("toNeueLeihe (Spec 2 §1.4.5)", () => {
    it("toNeueLeihe: snapshot_call_sign und borrower_name werden nicht vertauscht", () => {
      const l = toNeueLeihe(ALT_LEIHE);
      expect(l.snapshotCallSign).toBe("HRO 1/83-1");
      expect(l.borrowerName).toBe("Marek Sowa");
    });

    /**
     * ⛛ Additive Zusicherung (§1.3.4). Vier paarweise verschiedene Konstanten — dieselbe
     * Zeile faengt damit auch jede Vertauschung unter den vier Zeitfeldern.
     */
    it("toNeueLeihe: alle VIER Zeitfelder behalten SEINEN Wert in Millisekunden", () => {
      const l = toNeueLeihe(ALT_LEIHE);
      expect(l.borrowedAt.getTime()).toBe(1_741_000_000_000);
      expect(l.returnedAt?.getTime()).toBe(1_741_100_000_000);
      expect(l.createdAt.getTime()).toBe(1_740_999_999_000);
      expect(l.updatedAt.getTime()).toBe(1_741_100_001_000);
    });

    /**
     * ⛛ Ergaenzung dieses Plans. `returned_at IS NULL` ist keine fehlende Angabe, sondern
     * die Aussage „diese Leihe laeuft". Ein `?? new Date(0)` machte daraus eine 1970
     * zurueckgegebene — und der naechste Retention-Lauf loeschte sie.
     */
    it("toNeueLeihe: returned_at NULL bleibt NULL (die aktive Leihe)", () => {
      expect(toNeueLeihe(ALT_LEIHE_AKTIV).returnedAt).toBeNull();
      expect(toNeueLeihe(ALT_LEIHE_AKTIV).returnNote).toBeNull();
    });

    /**
     * ⛛ Ergaenzung dieses Plans. §1.4.5 verlangt die Spalte EXPLIZIT als `null` im Mapper,
     * nicht implizit durch Auslassen — nur so ist sie auf BEIDEN Paritaetsarmen vorhanden,
     * und nur dann faellt es auf, wenn irgendetwas dort einen Wert hineinschreibt.
     */
    it("toNeueLeihe: zugangscodeId steht explizit als null in der Zielzeile", () => {
      const l = toNeueLeihe(ALT_LEIHE);
      expect(l.zugangscodeId).toBeNull();
      expect(Object.keys(l)).toContain("zugangscodeId");
    });

    it("toNeueLeihe: alle 12 Zielfelder, Feld fuer Feld", () => {
      expect(toNeueLeihe(ALT_LEIHE)).toEqual({
        id: "l-1",
        deviceId: "g-1",
        snapshotCallSign: "HRO 1/83-1",
        snapshotSerialNumber: "SN-001",
        snapshotDeviceType: "MTP6650",
        borrowerName: "Marek Sowa",
        borrowedAt: new Date(1_741_000_000_000),
        returnedAt: new Date(1_741_100_000_000),
        returnNote: "Akku leer",
        zugangscodeId: null,
        createdAt: new Date(1_740_999_999_000),
        updatedAt: new Date(1_741_100_001_000),
      });
    });
  });
  ```

- [ ] **Schritt 2: Lauf zur Bestätigung des Fehlschlags**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **FAIL** — `toNeueLeihe` ist kein Export von `./radio`.

- [ ] **Schritt 3: `toNeueLeihe` schreiben**

  ```ts
  export function toNeueLeihe(zeile: AltLeihe): schema.NeueLeihe {
    return {
      id: zeile.id,
      // ABSICHTLICH kein FK auf devices.id, und er wird auch nicht „der Ordnung wegen"
      // nachgezogen: radio-admin/server/src/db/schema.ts:106-110 begruendet es im Quelltext —
      // Cascade loescht Historie, Restrict blockiert das Ausmustern. Die historische
      // Richtigkeit traegt der unveraenderliche snapshot_*-Dreisatz, nicht ein lebender Join.
      deviceId: zeile.device_id,
      snapshotCallSign: zeile.snapshot_call_sign, // NICHT `borrower_name`
      snapshotSerialNumber: zeile.snapshot_serial_number ?? null,
      snapshotDeviceType: zeile.snapshot_device_type ?? null,
      // Personenbezogen — der DSGVO-Grund der Zwei-Monats-Retention (Spec 1 §2.7).
      borrowerName: zeile.borrower_name,
      borrowedAt: msZuDatum("loans.borrowed_at", zeile.borrowed_at),
      // ⚠️ NULL heisst „aktive Leihe" und MUSS NULL bleiben.
      returnedAt: msZuDatumOptional("loans.returned_at", zeile.returned_at),
      returnNote: zeile.return_note ?? null,
      // Die Spalte hat KEINE Quelle: sie traegt die HERKUNFT des Zugangs („diese Leihe
      // entstand ueber den Aufsteller im Funkraum"), nicht die Identitaet der Person
      // (Spec 1 §2.11 Zusage 7, B6). Sie steht EXPLIZIT hier und nicht implizit durch
      // Auslassen — nur so ist sie in der Paritaetssicht auf beiden Armen vorhanden.
      zugangscodeId: null,
      createdAt: msZuDatum("loans.created_at", zeile.created_at),
      updatedAt: msZuDatum("loans.updated_at", zeile.updated_at),
    };
  }
  ```

- [ ] **Schritt 4: Tests grün, Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add scripts/import/radio.ts scripts/import/radio.test.ts
  rtk git commit -m "feat(radio-import): toNeueLeihe — vier Zeitstempel, aktive Leihe bleibt aktiv, zugangscodeId explizit null"
  ```

---

## Aufgabe 7: Die fünf Paritätssichten, das getaggte Multiset, `checkRadioParitaet`

**Wartet auf:** ⬜ **L1** (alle zehn Aliase, jetzt auch die vier Select-seitigen) · ⬜ **L3** —
Namen und **vollständige** Spaltenlisten der vier übrigen Sichten. Spec 1 §2.2.4 schreibt **eine**
von fünf aus (`paritaetsSichtGeraet`, 25 Spalten); die vier anderen sind offen.

⚠️ **L3 ist der teuerste ⬜ dieser Aufgabe, weil sein Fehlfall still ist:** fehlt eine Spalte in
einer Sicht, geht sie in keinen Hash ein — die Paritaet ist für sie **blind**, meldet grün, und
**kein Test sieht es**. Schritt 3 dieser Aufgabe baut genau dagegen einen Riegel, der ohne Ablesung
auskommt.

**Files:**
- Modify: `scripts/import/radio.ts`
- Modify: `scripts/import/radio.test.ts`

**Interfaces:**
- Verbraucht: die fünf Mapper aus 5/6a/6b · `RadioQuelle` aus Aufgabe 4 · `checkParity`, `Row`,
  `ParityReport` aus `scripts/import/parity.ts`.
- Liefert:
  - `paritaetsSichtGeraet(r: NeuesGeraet | Geraet): Row` (Name aus Spec 1 §2.2.4)
  - `paritaetsSichtSoftwareVersion`, `paritaetsSichtBenutzer`, `paritaetsSichtGeraeteEreignis`,
    `paritaetsSichtLeihe` (Namen aus Spec 2 §1.5.2)
  - `getaggteQuellzeilen(q: RadioQuelle): Row[]` (Name aus Spec 2 §1.5.2)
  - `getaggteZielzeilen(db: RadioDb): Row[]` — **Zusage dieses Plans**, Name analog
    `scripts/import/feedback.ts:248`
  - `checkRadioParitaet(q: RadioQuelle, db: RadioDb): ParityReport` (Name aus Spec 2 §1.5.3)
  - `type RadioDb = BetterSQLite3Database<typeof schema>`

**Die vier Regeln aus §1.5.2, verbindlich für jede der fünf Sichten:**

1. **Alle Spalten, namentlich, keine Auswahl.** 25 + 6 + 3 + 8 + **12** Felder. „Parität grün"
   zertifiziert dann die ganze Zeile, nicht eine handverlesene Teilmenge (`portal.ts:78-81`).
2. **Jedes `timestamp`-Feld auf beiden Armen durch `sekunden()`.** Drizzle schreibt Sekunden, die
   Sub-Sekunden gehen beim Schreiben verloren — ohne die Normalisierung scheitert ein zeichengleicher
   Import allein an Präzision (`portal.ts:66-71`).
3. **`devices.lastUpdatedAt` wird NICHT umgerechnet** — es ist `text` (`YYYY-MM-DD`), `?? null`.
4. **Insert-Defaults normalisieren, nicht weglassen:** `sortOrder: r.sortOrder ?? 0`,
   `isTarget: r.isTarget ?? false` (`portal.ts:79-80` macht es genauso).

- [ ] **Schritt 1: Die Sperre gegenprüfen**

  ```bash
  rtk grep -n "^export type" src/app/m/radio/_db/schema.ts
  ```

  Erwartung: **zehn Zeilen** — je Import-Tabelle ein Insert- und ein Select-Alias. Sind es weniger,
  ist ⬜ L1 nur zur Hälfte abgelesen; die Aufgabe beginnt nicht. Die zehn Namen ins Protokoll.

- [ ] **Schritt 2: Die fehlschlagenden Tests schreiben — der Verfälschungstest**

  ```ts
  describe("Paritaet (Spec 2 §1.5.2)", () => {
    it("paritaetsSichtGeraet liefert Sekunden fuer beide Arme", () => {
      const s = paritaetsSichtGeraet(toNeuesGeraet(ALT_GERAET));
      expect(s.createdAt).toBe(1_735_689_600);
      expect(s.updatedAt).toBe(1_738_368_000);
    });

    // Regel 3: die eine Spalte, die NICHT umgerechnet wird.
    it("paritaetsSichtGeraet laesst lastUpdatedAt unumgerechnet als Text stehen", () => {
      expect(paritaetsSichtGeraet(toNeuesGeraet(ALT_GERAET)).lastUpdatedAt).toBe("2025-03-02");
      expect(paritaetsSichtGeraet(toNeuesGeraet(ALT_GERAET_OHNE_ANGABE)).lastUpdatedAt).toBeNull();
    });

    it("getaggteQuellzeilen traegt je Zeile ein __table-Tag", () => {
      const quellDb = baueBespielteQuellDb();
      try {
        const zeilen = getaggteQuellzeilen(lieseQuelle(quellDb));
        expect(zeilen).toHaveLength(8); // 1 + 2 + 2 + 1 + 2
        const tags = [...new Set(zeilen.map((z) => z.__table))].sort();
        expect(tags).toEqual([
          "device_events", "devices", "loans", "software_versions", "users",
        ]);
      } finally {
        quellDb.close();
      }
    });
  });
  ```

  ⚠️ **Das `__table`-Tag ist Pflicht, nicht Kosmetik.** `scripts/import/feedback.ts:235-237`
  begründet es: strukturell identische Zeilen verschiedener Tabellen kollidieren sonst im Multiset.
  Hier ist der Fall real — eine `users`-Zeile und eine `software_versions`-Zeile laufen beide auf
  `{ id/sub, name/value, createdAt }` hinaus.

- [ ] **Schritt 3: Den Riegel gegen die stille L3-Lücke schreiben**

  ⛛ **Ergänzung dieses Plans, und die wichtigste dieser Aufgabe.** Sie prüft Regel 1 **mechanisch**
  gegen das Zielschema statt gegen eine abgeschriebene Liste — damit ist „trägt die Sicht **jede**
  Spalte ihrer Zieltabelle?" kein Gegenlesen mehr, sondern ein Test.

  **Wohin damit:** die drei `import`-Zeilen an den **Kopf** von `scripts/import/radio.test.ts`;
  das `it(...)` **innerhalb** des `describe("Paritaet (Spec 2 §1.5.2)", …)` aus Schritt 2, vor
  dessen schließendem `});`. ⚠️ `import * as radioSchema from "@/app/m/radio/_db/schema";`
  steht danach am Kopf der Datei und wird in **Aufgabe 8 nicht noch einmal** geschrieben —
  sonst meldet TypeScript `Cannot redeclare block-scoped variable 'radioSchema'`.

  ```ts
  // Am Dateikopf, EINMAL:
  import type { SQLiteTable } from "drizzle-orm/sqlite-core";
  import { getTableColumns } from "drizzle-orm";
  import * as radioSchema from "@/app/m/radio/_db/schema";

  // Im describe aus Schritt 2:
  /**
   * ⛛ Ergaenzung dieses Plans gegen die stille Haelfte von ⬜ L3.
   *
   * Fehlt eine Spalte in einer Paritaetssicht, geht sie in keinen Hash ein: die Paritaet ist
   * fuer sie BLIND, meldet gruen — und kein anderer Test sieht es (§2.1.2, Zeile „Spalte gar
   * nicht in der Sicht"). Diese Zusicherung vergleicht die Schluesselmenge der Sicht mit den
   * Spalten der Zieltabelle, wie Drizzle sie kennt. Sie kann nicht veralten: kommt spaeter eine
   * Spalte ins Schema, wird sie hier rot statt still blind.
   *
   * `getTableColumns` ist ein Export von `drizzle-orm` (node_modules/drizzle-orm/utils.d.ts:37),
   * gemessen gegen 0.45.2.
   */
  it("jede Paritaetssicht traegt JEDE Spalte ihrer Zieltabelle — keine Auswahl", () => {
    const paare: Array<[string, Record<string, unknown>, SQLiteTable]> = [
      ["users", paritaetsSichtBenutzer(toNeuenBenutzer(ALT_BENUTZER)), radioSchema.users],
      ["software_versions", paritaetsSichtSoftwareVersion(toNeueSoftwareVersion(ALT_VERSION)), radioSchema.softwareVersions],
      ["devices", paritaetsSichtGeraet(toNeuesGeraet(ALT_GERAET)), radioSchema.devices],
      ["device_events", paritaetsSichtGeraeteEreignis(toNeuesGeraeteEreignis(ALT_EREIGNIS)), radioSchema.deviceEvents],
      ["loans", paritaetsSichtLeihe(toNeueLeihe(ALT_LEIHE)), radioSchema.loans],
    ];
    for (const [name, sicht, tabelle] of paare) {
      expect(
        { [name]: Object.keys(sicht).sort() },
      ).toEqual(
        { [name]: Object.keys(getTableColumns(tabelle)).sort() },
      );
    }
  });
  ```

  ⚠️ **`zugangscodes` steht in keinem der beiden Multisets** — die Tabelle ist nicht Teil des
  Imports (§1.4.6). Das ist **eine Frage der Vollständigkeit, nicht eine Erlaubnis**: beim Echtimport
  wird `radio.db` vorher entfernt (§1.6.4), und damit kann es zu diesem Zeitpunkt gar keine
  `zugangscodes`-Zeile geben.

- [ ] **Schritt 4: Lauf zur Bestätigung des Fehlschlags**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **FAIL** — die fünf Sichten sind kein Export von `./radio`.

- [ ] **Schritt 5: Die fünf Sichten und das Multiset schreiben**

  ⚠️ **`import * as schema from "@/app/m/radio/_db/schema";` steht seit Aufgabe 5 am Kopf von
  `scripts/import/radio.ts` — sie wird hier NICHT ein zweites Mal geschrieben.** Neu sind nur
  die zwei Zeilen darunter.

  ```ts
  import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
  import { checkParity, type ParityReport, type Row } from "./parity";

  export type RadioDb = BetterSQLite3Database<typeof schema>;

  /**
   * Zeichengleich `tsSeconds` aus scripts/import/portal.ts:66-71 bzw. feedback.ts:174-176,
   * mit deutschem Namen (Spec 1 §2.2.4). Drizzle schreibt SEKUNDEN; ohne diese Normalisierung
   * auf BEIDEN Armen scheitert ein zeichengleicher Import allein an Praezision.
   */
  const sekunden = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);

  /** ⬜ L3: die vier uebrigen Sichten sind hier NACH DEM ABGELESENEN SCHEMA zu vervollstaendigen. */
  export function paritaetsSichtGeraet(r: schema.NeuesGeraet | schema.Geraet): Row {
    return {
      id: r.id,
      rufname: r.rufname ?? null,
      issi: r.issi,
      tei: r.tei ?? null,
      serialNumber: r.serialNumber ?? null,
      deviceType: r.deviceType ?? null,
      status: r.status ?? null,
      location: r.location ?? null,
      assignedTo: r.assignedTo ?? null,
      softwareVersion: r.softwareVersion ?? null,
      // Regel 3: TEXT `YYYY-MM-DD`, NICHT durch sekunden().
      lastUpdatedAt: r.lastUpdatedAt ?? null,
      notes: r.notes ?? null,
      hiorgId: r.hiorgId ?? null,
      opta: r.opta ?? null,
      funktion: r.funktion ?? null,
      hersteller: r.hersteller ?? null,
      bedieneinheit: r.bedieneinheit ?? null,
      deviceModes: r.deviceModes ?? null,
      alamosIntegrated: r.alamosIntegrated ?? null,
      loanable: r.loanable ?? null,
      updateNote: r.updateNote ?? null,
      createdAt: sekunden(r.createdAt),
      updatedAt: sekunden(r.updatedAt),
      createdBy: r.createdBy ?? null,
      updatedBy: r.updatedBy ?? null,
    };
  }

  // paritaetsSichtBenutzer (3), paritaetsSichtSoftwareVersion (6 — mit
  // `sortOrder: r.sortOrder ?? 0` und `isTarget: r.isTarget ?? false`, Regel 4),
  // paritaetsSichtGeraeteEreignis (8), paritaetsSichtLeihe (12 — inklusive
  // `zugangscodeId: r.zugangscodeId ?? null`) folgen demselben Muster.
  // ⚠️ Die Zusicherung aus Schritt 3 ist der Riegel: sie wird rot, solange eine Spalte fehlt.

  export function getaggteQuellzeilen(q: RadioQuelle): Row[] {
    return [
      ...q.users.map((r) => ({ __table: "users", ...paritaetsSichtBenutzer(toNeuenBenutzer(r)) })),
      ...q.softwareVersions.map((r) => ({ __table: "software_versions", ...paritaetsSichtSoftwareVersion(toNeueSoftwareVersion(r)) })),
      ...q.devices.map((r) => ({ __table: "devices", ...paritaetsSichtGeraet(toNeuesGeraet(r)) })),
      ...q.deviceEvents.map((r) => ({ __table: "device_events", ...paritaetsSichtGeraeteEreignis(toNeuesGeraeteEreignis(r)) })),
      ...q.loans.map((r) => ({ __table: "loans", ...paritaetsSichtLeihe(toNeueLeihe(r)) })),
    ];
  }

  export function getaggteZielzeilen(db: RadioDb): Row[] {
    return [
      ...db.select().from(schema.users).all().map((r) => ({ __table: "users", ...paritaetsSichtBenutzer(r) })),
      ...db.select().from(schema.softwareVersions).all().map((r) => ({ __table: "software_versions", ...paritaetsSichtSoftwareVersion(r) })),
      ...db.select().from(schema.devices).all().map((r) => ({ __table: "devices", ...paritaetsSichtGeraet(r) })),
      ...db.select().from(schema.deviceEvents).all().map((r) => ({ __table: "device_events", ...paritaetsSichtGeraeteEreignis(r) })),
      ...db.select().from(schema.loans).all().map((r) => ({ __table: "loans", ...paritaetsSichtLeihe(r) })),
    ];
  }

  /**
   * ⚠️ Der Zielarm liest OHNE `WHERE` (feedback.ts:248-256). Laeuft der Import gegen eine
   * Ziel-DB, in der schon Zeilen stehen, ist Paritaet ROT mit `missingInSource` — und das ist
   * erwuenscht: der Paritaetscheck ist zugleich der Nachweis, dass die Ziel-DB leer war.
   */
  export function checkRadioParitaet(q: RadioQuelle, db: RadioDb): ParityReport {
    return checkParity(getaggteQuellzeilen(q), getaggteZielzeilen(db));
  }
  ```

- [ ] **Schritt 6: Tests grün, Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add scripts/import/radio.ts scripts/import/radio.test.ts
  rtk git commit -m "feat(radio-import): fuenf Paritaetssichten, getaggtes Multiset, checkRadioParitaet — mit dem Riegel gegen die blinde Spalte"
  ```

---

## Aufgabe 8: `importiereRadio` — Einfügereihenfolge, Konfliktstrategien, Paritäts-Rundlauf

**Wartet auf:** ⬜ **L1** · Spec 1 **§2.5** (Tabellen) · Spec 1 **§2.6/§2.9.1** — das
Migrationsverzeichnis `src/app/m/radio/_db/migrations/` mit dem generierten `0000_<name>.sql`
**und** der von Hand geschriebenen `0001_loans_aktiv_uidx.sql`.

**Files:**
- Modify: `scripts/import/radio.ts`
- Modify: `scripts/import/radio.test.ts` (das Ziel-DB-Gerüst kommt hier dazu)

**Interfaces:**
- Verbraucht: alles aus 5/6a/6b/7.
- Liefert: `importiereRadio(quelle: RadioQuelle, db: RadioDb | RadioTx): void` ·
  `type RadioTx = SQLiteTransaction<"sync", Database.RunResult, typeof schema, ExtractTablesWithRelations<typeof schema>>`

✅ **Die Union ist gemessen und trägt.** `rtk pnpm typecheck` = „No errors found" gegen eine Sonde
mit `insert().values().onConflictDoUpdate().run()`, `insert().values().onConflictDoNothing().run()`
und `select().from().all()` auf `ProbeDb | ProbeTx`, aufgerufen aus `db.transaction((tx) => …)`
**und** auf dem blanken `db` (drizzle-orm 0.45.2, better-sqlite3 13.0.2). Der Vorbehalt aus §1.5.3
ist für diese Fassung ausgeräumt.

- [ ] **Schritt 1: Das Ziel-DB-Gerüst schreiben — Hausform, NICHT `getModuleDb`**

  Oben in `scripts/import/radio.test.ts`:

  ```ts
  import { mkdirSync, rmSync } from "node:fs";
  import Database from "better-sqlite3";
  import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
  import { migrate } from "drizzle-orm/better-sqlite3/migrator";
  import * as radioSchema from "@/app/m/radio/_db/schema";  // steht seit Aufgabe 7 am Kopf
  import { eq } from "drizzle-orm";                          // NEU in dieser Aufgabe

  const DIR = "./.data/radio-import-test";

  /**
   * Direkt gebaute, migrierte DB — NICHT getModuleDb(): dessen globaler Cache ist per
   * Modulschluessel gekeyt, nicht per DATA_DIR (src/core/db/index.ts:31-35), und gaebe
   * zwischen Tests ein stale Handle auf die alte Datei zurueck. Der Grund steht
   * ausgeschrieben in scripts/import/portal.test.ts:23-25.
   *
   * ⚠️ `foreign_keys = ON` steht hier eigens: es ist eine VERBINDUNGS-Eigenschaft, keine der
   * Datei (src/app/m/lagerbuch/_db/migrations.test.ts:33-35). Ohne die Zeile liefe der
   * Waisen-Test unten gruen durch, und die Einfuegereihenfolge waere unbewiesen.
   */
  function frischeZielDb(): BetterSQLite3Database<typeof radioSchema> {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
    const sqlite = new Database(`${DIR}/radio.db`);
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, { schema: radioSchema });
    migrate(db, { migrationsFolder: "./src/app/m/radio/_db/migrations" });
    return db;
  }
  afterEach(() => rmSync(DIR, { recursive: true, force: true }));
  ```

- [ ] **Schritt 2: Die fehlschlagenden Tests schreiben**

  ```ts
  describe("importiereRadio (Spec 2 §1.5.1)", () => {
    it("schreibt alle fuenf Tabellen und die Paritaet ist gruen", () => {
      const quellDb = baueBespielteQuellDb();
      const quelle = lieseQuelle(quellDb);
      quellDb.close();

      const db = frischeZielDb();
      db.transaction((tx) => importiereRadio(quelle, tx));

      expect(db.select().from(radioSchema.users).all()).toHaveLength(1);
      expect(db.select().from(radioSchema.softwareVersions).all()).toHaveLength(2);
      expect(db.select().from(radioSchema.devices).all()).toHaveLength(2);
      expect(db.select().from(radioSchema.deviceEvents).all()).toHaveLength(1);
      expect(db.select().from(radioSchema.loans).all()).toHaveLength(2);

      const report = checkRadioParitaet(quelle, db);
      expect(report.ok).toBe(true);
      expect(report.sourceCount).toBe(8);
      expect(report.targetCount).toBe(8);
    });

    /**
     * Verfaelschungstest — Hausform: scripts/import/portal.test.ts:90-92,
     * feedback.test.ts:398-401. Ohne ihn koennte `checkRadioParitaet` konstant `ok: true`
     * liefern und alle Tests oben blieben gruen.
     */
    it("Paritaet wird ROT, sobald eine Zielzeile verfaelscht wird", () => {
      const quellDb = baueBespielteQuellDb();
      const quelle = lieseQuelle(quellDb);
      quellDb.close();

      const db = frischeZielDb();
      db.transaction((tx) => importiereRadio(quelle, tx));
      expect(checkRadioParitaet(quelle, db).ok).toBe(true);

      db.update(radioSchema.devices)
        .set({ rufname: "VERFAELSCHT" })
        .where(eq(radioSchema.devices.id, "g-1"))
        .run();

      expect(checkRadioParitaet(quelle, db).ok).toBe(false);
    });

    /**
     * ⚠️ Der Paritaetscheck vergleicht gegen den GANZEN Zielbestand, ohne `WHERE`. Er ist
     * damit zugleich der Nachweis, dass die Ziel-DB leer war (§1.5.2). Diese Zeile haelt
     * genau das fest — sie ist die Testfassung des Runbook-Schritts
     * „`radio.db` loeschen, DANN importieren" (§1.6.4).
     */
    it("Paritaet wird ROT, wenn im Ziel schon eine fremde Zeile steht", () => {
      const quellDb = baueBespielteQuellDb();
      const quelle = lieseQuelle(quellDb);
      quellDb.close();

      const db = frischeZielDb();
      db.insert(radioSchema.users)
        .values({ sub: "fremd", name: "Vorher da", lastSeenAt: new Date(1_739_500_000_000) })
        .run();
      db.transaction((tx) => importiereRadio(quelle, tx));

      const report = checkRadioParitaet(quelle, db);
      expect(report.ok).toBe(false);
      expect(report.missingInSource.length).toBeGreaterThan(0);
    });

    /**
     * ⛛ Ergaenzung dieses Plans: der EINZIGE laute Fehlschlag dieses Kapitels (§1.5.1).
     * Ein Waisen-Ereignis in der Quelle bricht den Import hart ab — dagegen steht A3
     * (§2.4.3), blockierend, vor dem Import. Ohne diesen Test waere „die Reihenfolge ist
     * Pflicht, nicht Stil" eine Prosa-Zeile: die gesunde Fixture haette sie auch bei
     * vertauschter Reihenfolge bestanden, weil `devices` VOR `device_events` steht.
     */
    it("ein Waisen-Ereignis bricht den Import hart ab (SQLITE_CONSTRAINT_FOREIGNKEY)", () => {
      const quellDb = baueBespielteQuellDb();
      const quelle = lieseQuelle(quellDb);
      quellDb.close();
      quelle.deviceEvents.push({
        ...quelle.deviceEvents[0]!,
        id: "e-waise",
        device_id: "g-gibt-es-nicht",
      });

      const db = frischeZielDb();
      expect(() => db.transaction((tx) => importiereRadio(quelle, tx))).toThrow(/FOREIGN KEY/i);
      // Und die Transaktion hat zurueckgerollt: nichts steht drin.
      expect(db.select().from(radioSchema.devices).all()).toHaveLength(0);
    });
  });
  ```

- [ ] **Schritt 3: Lauf zur Bestätigung des Fehlschlags**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Erwartung: **FAIL** — `importiereRadio` ist kein Export von `./radio`.

- [ ] **Schritt 4: `importiereRadio` schreiben**

  ⚠️ Diese drei Zeilen gehören an den Kopf von **`scripts/import/radio.ts`** und sind dort neu
  (der `SQLiteTable`-Typimport aus Aufgabe 7 steht in der **Test**datei, nicht hier).

  ```ts
  import type Database from "better-sqlite3";
  import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";
  import type { ExtractTablesWithRelations } from "drizzle-orm";

  /**
   * ⚠️ Innerhalb von db.transaction() ist der Empfaenger NICHT die Datenbank, sondern der
   * Transaktionskontext. BEIDE muessen in die Signatur, sonst kompiliert der Aufruf nicht.
   * Verbindlich ist die UNION, nicht die Buchstabenzahl der Parameterliste (§1.5.3).
   * Gemessen gegen drizzle-orm 0.45.2: die Union traegt insert/onConflict*/select.
   */
  export type RadioTx = SQLiteTransaction<
    "sync",
    Database.RunResult,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >;

  /**
   * Einfuegereihenfolge — PFLICHT, nicht Stil. `foreign_keys = ON` ist in BEIDEN Datenbanken
   * scharf (radio-admin/server/src/db/index.ts:28, src/core/db/index.ts:19), und die eine
   * Kante `device_events.device_id → devices.id` bricht HART ab, wenn ein Ereignis vor seinem
   * Geraet eingefuegt wird.
   *
   * Kein `PRAGMA defer_foreign_keys`: die Kantenmenge ist azyklisch und mit dieser Reihenfolge
   * erfuellbar. `lagerbuch` brauchte es wegen `lagerorte.templateId`, hier gibt es kein
   * Gegenstueck.
   *
   * `zugangscodes` fehlt in der Liste (§1.4.6) und braucht trotz FK-Elternschaft keine
   * Position: `loans.zugangscode_id` ist fuer JEDE importierte Zeile NULL, und SQLite prueft
   * eine Fremdschluesselkante bei einem NULL-Kindwert nicht. `api_tokens` fehlt ebenfalls —
   * die Tabelle existiert im Ziel NICHT (B16, Entscheidung 13, ausgeschrieben in W4).
   */
  export function importiereRadio(quelle: RadioQuelle, db: RadioDb | RadioTx): void {
    // 1) users — frei
    for (const zeile of quelle.users) {
      const v = toNeuenBenutzer(zeile);
      db.insert(schema.users).values(v).onConflictDoUpdate({ target: schema.users.sub, set: v }).run();
    }

    // 2) software_versions — frei
    for (const zeile of quelle.softwareVersions) {
      const v = toNeueSoftwareVersion(zeile);
      db.insert(schema.softwareVersions).values(v)
        .onConflictDoUpdate({ target: schema.softwareVersions.id, set: v }).run();
    }

    // 3) devices
    for (const zeile of quelle.devices) {
      const v = toNeuesGeraet(zeile);
      db.insert(schema.devices).values(v)
        .onConflictDoUpdate({ target: schema.devices.id, set: v }).run();
    }

    // 4) device_events — NACH devices, erzwungen durch die FK-Kante.
    //    ⚠️ onConflictDoNothing, NICHT onConflictDoUpdate: die Tabelle ist ein JOURNAL, und
    //    ein Upsert ist dort fachlich falsch (docs/runbooks/lagerbuch-cutover.md:409
    //    unterscheidet genau das). Fall C in Aufgabe 9 verteidigt diese Zeile gegen ein
    //    spaeteres „der Einheitlichkeit wegen".
    for (const zeile of quelle.deviceEvents) {
      db.insert(schema.deviceEvents).values(toNeuesGeraeteEreignis(zeile)).onConflictDoNothing().run();
    }

    // 5) loans — formal frei (kein FK auf devices), fachlich nach devices.
    //    ⚠️ `onConflictDoUpdate({ target: loans.id })` — der PARTIELLE Index
    //    `loans_device_active_uidx` kann NICHT Konfliktziel sein: SQLite verlangt dafuer
    //    dieselbe WHERE-Klausel im Ziel (Spec 1 §2.6 (b)). Historie im Bulk ist gefahrlos,
    //    zwei AKTIVE Leihen auf einem Geraet schlagen hart fehl — dagegen steht A4 (§2.4.4).
    for (const zeile of quelle.loans) {
      const v = toNeueLeihe(zeile);
      db.insert(schema.loans).values(v)
        .onConflictDoUpdate({ target: schema.loans.id, set: v }).run();
    }
  }
  ```

- [ ] **Schritt 5: Tests grün, Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add scripts/import/radio.ts scripts/import/radio.test.ts
  rtk git commit -m "feat(radio-import): importiereRadio — Einfuegereihenfolge, Journal statt Upsert bei device_events, Paritaets-Rundlauf"
  ```

---

## Aufgabe 9: Die vier asymmetrischen Idempotenzfälle A · B · C · D

**Wartet auf:** dieselben Sperren wie Aufgabe 8.

⚠️ **Diese Aufgabe ist die Stelle, an der eine Spec sich selbst belügen kann** (§1.6.3). Die
naheliegende Zusicherung lautet „der zweite Import ändert nichts". Sie ist **falsch**. Ein Test, der
**zweimal dieselbe Quelle** importiert, ist bei Upsert-per-Primärschlüssel **immer** grün — und bei
`onConflictDoNothing` auch; er prüft nicht Idempotenz, sondern dass `INSERT … ON CONFLICT` existiert
(`docs/radio-portierung-analyse.md:1292-1301`). Der echte Fall ist **asymmetrisch**: zwischen
Generalprobe und Echtimport wurde weitergearbeitet. **Zwei der vier Zusicherungen sind ein
Fehlschlag, kein Erfolg. Wer versucht, sie „grün zu bekommen", hat den Auftrag missverstanden.**

**Files:**
- Modify: `scripts/import/radio.test.ts` (nur Tests — diese Aufgabe ändert keinen Produktionscode)

**Interfaces:**
- Verbraucht: `importiereRadio`, `frischeZielDb` aus Aufgabe 8 · `lieseQuelle`,
  `baueBespielteQuellDb`.
- Liefert: nichts. **Diese Aufgabe schreibt vier Tests und keine Zeile Umsetzung.** Ihr Ergebnis ist
  eine Zusage über beobachtetes Verhalten, kein neues Verhalten.

- [ ] **Schritt 1: Fall A — `devices.update_note` wird plattgewalzt (still)**

  ```ts
  describe("Import ist asymmetrisch idempotent (Spec 2 §1.6.3)", () => {
    /**
     * FALL A. `update_note` ist in der Quelle APPEND-ONLY („never overwritten by the update
     * flow", radio-admin/server/src/db/schema.ts:33-36), und `onConflictDoUpdate` kennt kein
     * Anhaengen. ⚠️ Die Zusicherung ist der VERLUST. Wie man es im Betrieb merkt: gar nicht.
     * Deshalb der Freeze.
     */
    it("Import ist asymmetrisch idempotent: Zielzeile geaendert, erneut importiert — Fall A", () => {
      const quellDb = baueBespielteQuellDb();
      const quelle = lieseQuelle(quellDb);
      quellDb.close();

      const db = frischeZielDb();
      db.transaction((tx) => importiereRadio(quelle, tx));
      expect(
        db.select().from(radioSchema.devices).where(eq(radioSchema.devices.id, "g-1")).get()?.updateNote,
      ).toBe("ISSI abweichend");

      // Der Weg, den die Suite baut: anhaengen, nie ueberschreiben.
      db.update(radioSchema.devices)
        .set({ updateNote: "ISSI abweichend\nAntenne getauscht" })
        .where(eq(radioSchema.devices.id, "g-1"))
        .run();

      db.transaction((tx) => importiereRadio(quelle, tx));

      expect(
        db.select().from(radioSchema.devices).where(eq(radioSchema.devices.id, "g-1")).get()?.updateNote,
      ).toBe("ISSI abweichend"); // ⚠️ Der angehaengte Satz ist WEG — ohne Fehler, ohne Warnung.
    });
  ```

- [ ] **Schritt 2: Fall B — mit dem korrigierten ARRANGE-Riegel**

  ```ts
    /**
     * FALL B. Der Mechanismus: `onConflictDoUpdate` setzt `l-aktiv.returned_at` zurueck auf
     * NULL, damit gibt es ZWEI aktive Leihen auf `g-1`, und der partielle Unique-Index
     * `loans_device_active_uidx ON loans(device_id) WHERE returned_at IS NULL` weist die
     * Schreibung ab. Der einzige der vier Faelle, den der Betrieb bemerkt — als Abbruch mitten
     * im Fenster, bei bereits beschriebenem Ziel.
     *
     * ⚠️ Die Meldung nennt die SPALTE, nicht den Index: `UNIQUE constraint failed:
     * loans.device_id`. Ein `toThrow(/loans_device_active_uidx/)` waere ein Test, der aus dem
     * falschen Grund rot ist.
     *
     * ⬜ L2, gemessen und verengt: better-sqlite3 13.0.2 wirft eine `SqliteError` mit
     * `code === "SQLITE_CONSTRAINT_UNIQUE"` und der Meldung ZEICHENGLEICH, ohne `cause`;
     * drizzle-orm 0.45.2 reicht sie durch `db.transaction()` unveraendert durch. Die
     * Zusicherung unten prueft die Meldung (haelt auch unter einer verpackenden Fassung, die
     * `message` durchreicht) und den `code` (schlaegt LAUT fehl, wenn eine kuenftige Fassung
     * doch verpackt) — nie still.
     */
    it("Import ist asymmetrisch idempotent: Zielzeile geaendert, erneut importiert — Fall B", () => {
      const quellDb = baueBespielteQuellDb();
      const quelle = lieseQuelle(quellDb);
      quellDb.close();

      const db = frischeZielDb();

      /**
       * SCHRITT 0 — ARRANGE-Riegel gegen das ZIEL, VOR allem anderen. Sonst tarnt sich eine
       * fehlende Ziel-Migration als „expected throw, got none", und der Test meldet einen
       * Importdefekt, wo ein Migrationsdefekt vorliegt.
       *
       * ⚠️ STRUKTUR statt Text. `sqlite_master.sql` speichert die CREATE-Anweisung
       * ZEICHENGLEICH so, wie sie ausgefuehrt wurde — und Spec 1 §2.6 schreibt sie mit
       * BACKTICKS: CREATE UNIQUE INDEX `loans_device_active_uidx` ON `loans` (`device_id`)
       * WHERE `returned_at` IS NULL. Gemessen gegen genau diese DDL:
       * instr(sql, 'WHERE returned_at IS NULL') = 0. Eine Textprobe waere hier ROT gegen eine
       * vollkommen korrekte Migration.
       *
       * `db.$client` ist das rohe better-sqlite3-Handle hinter der Drizzle-Instanz
       * (node_modules/drizzle-orm/better-sqlite3/driver.d.ts:23) — `pragma_index_list` ist
       * eine Tabellenwertfunktion und laesst sich ueber den Query Builder nicht ausdruecken.
       */
      const riegel = db.$client
        .prepare(
          `select name, partial, "unique" from pragma_index_list('loans')
            where name = 'loans_device_active_uidx'`,
        )
        .all();
      expect(riegel).toEqual([{ name: "loans_device_active_uidx", partial: 1, unique: 1 }]);

      db.transaction((tx) => importiereRadio(quelle, tx));

      // Im ZIEL zurueckgeben …
      db.update(radioSchema.loans)
        .set({ returnedAt: new Date(1_742_100_000_000) })
        .where(eq(radioSchema.loans.id, "l-aktiv"))
        .run();
      // … und eine NEUE Leihe auf dasselbe Geraet anlegen — voellig legitim, es ist frei.
      db.insert(radioSchema.loans)
        .values({
          id: "l-neu-in-suite",
          deviceId: "g-1",
          snapshotCallSign: "HRO 1/83-1",
          snapshotSerialNumber: "SN-001",
          snapshotDeviceType: "MTP6650",
          borrowerName: "Suite-Weg",
          borrowedAt: new Date(1_742_200_000_000),
          returnedAt: null,
          returnNote: null,
          zugangscodeId: null,
          createdAt: new Date(1_742_200_000_000),
          updatedAt: new Date(1_742_200_000_000),
        })
        .run();

      /**
       * ⚠️ Der Aufruf steht IN einer Transaktion, und das ist keine Formsache: §1.6.3 misst,
       * dass der Verstoss beim STATEMENT auffaellt und `db.transaction()` daraufhin
       * zurueckrollt. Ein blanker `importiereRadio(quelle, db)` wuerfe auch — aber OHNE
       * Ruecknahme, und der Test dokumentierte einen Mechanismus, der nicht gelaufen ist.
       */
      let gefangen: unknown;
      try {
        db.transaction((tx) => importiereRadio(quelle, tx));
      } catch (err) {
        gefangen = err;
      }
      expect((gefangen as Error | undefined)?.message).toMatch(
        /UNIQUE constraint failed: loans\.device_id/,
      );
      expect((gefangen as { code?: string } | undefined)?.code).toBe("SQLITE_CONSTRAINT_UNIQUE");

      // Und die Transaktion hat zurueckgerollt: die in der Suite entstandene Leihe steht noch.
      expect(
        db.select().from(radioSchema.loans).where(eq(radioSchema.loans.id, "l-neu-in-suite")).get(),
      ).toBeDefined();
    });
  ```

- [ ] **Schritt 3: Fall C — die Gegenprobe, die `onConflictDoNothing` verteidigt**

  ```ts
    /**
     * FALL C ist die Gegenprobe zu A: dieselbe Situation, andere Strategie, anderes Ergebnis.
     * Er verteidigt `onConflictDoNothing` gegen ein spaeteres „der Einheitlichkeit wegen".
     */
    it("Import ist asymmetrisch idempotent: das Journal bleibt, wie es ist — Fall C", () => {
      const quellDb = baueBespielteQuellDb();
      const quelle = lieseQuelle(quellDb);
      quellDb.close();

      const db = frischeZielDb();
      db.transaction((tx) => importiereRadio(quelle, tx));

      db.update(radioSchema.deviceEvents)
        .set({ newValue: "in der Suite geaendert" })
        .where(eq(radioSchema.deviceEvents.id, "e-1"))
        .run();

      db.transaction((tx) => importiereRadio(quelle, tx));

      expect(
        db.select().from(radioSchema.deviceEvents).where(eq(radioSchema.deviceEvents.id, "e-1")).get()
          ?.newValue,
      ).toBe("in der Suite geaendert"); // INSERT OR IGNORE ueberschreibt NICHT
      expect(db.select().from(radioSchema.deviceEvents).all()).toHaveLength(1); // und dupliziert nicht
    });
  ```

- [ ] **Schritt 4: Fall D — die Update-Marke, ⛛ Ergänzung dieses Plans**

  ```ts
    /**
     * ⛛ FALL D — von Spec 2 §1.6.3 nicht geführt, und die Lücke ist teuer.
     *
     * `software_versions.is_target` markiert GENAU EINE Zeile, und keine Datenbank erzwingt
     * das: `getTargetVersion` (radio-admin/server/src/repos/softwareVersionRepo.ts:63-70)
     * nimmt `.limit(1).get()` OHNE `ORDER BY`. §2.2.3 Regel 4 sagt ueber genau diese Zeile:
     * „Kippt diese eine Zeile, kippt der Status JEDES Geraets." Fall A in gross — und ohne
     * diesen Test haette die Tabelle mit der groessten Hebelwirkung weder einen
     * Idempotenzfall noch eine Zusicherung.
     *
     * ⚠️ Die Ziel-Aenderung wird hier als schlichtes UPDATE geschrieben, NICHT ueber
     * `setTargetVersion`: diese Funktion lebt in radio-admin, nicht in der Suite.
     */
    it("Import ist asymmetrisch idempotent: die Update-Marke faellt auf den Quellstand zurueck — Fall D", () => {
      const quellDb = baueBespielteQuellDb();
      const quelle = lieseQuelle(quellDb);
      quellDb.close();

      const db = frischeZielDb();
      db.transaction((tx) => importiereRadio(quelle, tx));
      const marke = () =>
        db.select().from(radioSchema.softwareVersions).all().filter((r) => r.isTarget).map((r) => r.id);
      expect(marke()).toEqual(["v-1"]);

      // Im ZIEL umhaengen — der Weg, den die Verwaltungsflaeche baut.
      db.update(radioSchema.softwareVersions).set({ isTarget: false }).run();
      db.update(radioSchema.softwareVersions)
        .set({ isTarget: true })
        .where(eq(radioSchema.softwareVersions.id, "v-2"))
        .run();
      expect(marke()).toEqual(["v-2"]);

      db.transaction((tx) => importiereRadio(quelle, tx));

      // ⚠️ ZUSICHERUNG: der Quellstand gewinnt. Das ist ein FEHLSCHLAG, kein No-Op — die im
      // Ziel getroffene Entscheidung ist still verloren, und danach zeigt jedes Geraet einen
      // anderen Update-Stand als eine Minute zuvor.
      expect(marke()).toEqual(["v-1"]);
      // Genau EINE Marke bleibt es trotzdem — sonst waere zusaetzlich A2 (§2.4.2) verletzt.
      expect(marke()).toHaveLength(1);
    });
  });
  ```

- [ ] **Schritt 5: Lauf — alle vier grün, und drei davon sind Verlustzusagen**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  ⚠️ **Schlägt Fall B mit „expected throw, got none" fehl, ist der ARRANGE-Riegel aus Schritt 2
  vorher rot geworden** — dann fehlt `0001_loans_aktiv_uidx.sql` im Zielverzeichnis oder ist
  verunglückt (Spec 1 §2.6). **Das ist ein Migrationsdefekt, kein Importdefekt**, und der Riegel
  meldet die Ursache selbst.

- [ ] **Schritt 6: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add scripts/import/radio.test.ts
  rtk git commit -m "test(radio-import): die vier asymmetrischen Idempotenzfaelle — drei Zusicherungen sind ein Verlust, kein Erfolg"
  ```

---

## Aufgabe 10: `runRadioImport`, die Zählzeile, die Transaktion, der CLI-Block

**Wartet auf:** ⬜ **L6** — der genaue, **byteweise** Wortlaut der Abschlusszeile.
**Wartet auf:** Spec 1 **§2.9**, das Registrierungsdreieck.

⚠️ **Die vier fremden Bearbeitungen des Dreiecks gehören NICHT zu diesem Plan.** Sobald
`src/app/m/radio/_db/` im Baum existiert, ist `src/core/bootstrap.test.ts:90-95` rot, bis die
`MODULE_MIGRATIONS`-Zeile steht (hinter `aufgaben`, also hinter `bootstrap.ts:48`), `:104-111` rot,
bis die `COPY`-Zeile im `Dockerfile` steht (hinter `:56`), und `scripts/seed-lokal.test.ts:41-42`
rot, bis `SEED_MODULE` einen `radio`-Eintrag hat. **Wer diese roten Tests „schnell repariert",
annektiert stillschweigend einen anderen Planteil.** Sie sind Aufgaben aus Spec 1 §2.9 und stehen
in der Sperrtafel dieses Plans, nicht in seinen Schritten.

**Warum sie diese Aufgabe trotzdem blockieren:** `runRadioImport` ruft `migrateAllModules()`, und
das iteriert über `MODULE_MIGRATIONS` (`src/core/bootstrap.ts:99-105`). Ohne radio-Zeile migriert
nichts, `getModuleDb("radio", schema)` öffnet eine **unmigrierte** Datei, und der erste Insert
stirbt mit `no such table: devices`.

**Files:**
- Modify: `scripts/import/radio.ts` (`runRadioImport` + CLI-Block, ganz ans Dateiende)
- Modify: `scripts/import/radio.test.ts` (**nichts** — siehe Schritt 1)

**Interfaces:**
- Verbraucht: `lieseQuelle`, `importiereRadio`, `checkRadioParitaet` · `migrateAllModules` aus
  `@/core/bootstrap` · `getModuleDb` aus `@/core/db` · `assertParity` aus `./parity`.
- Liefert: `runRadioImport(quellPfad: string): void`

- [ ] **Schritt 1: Anerkennen, dass diese Aufgabe KEINEN Vitest-Test bekommt — und warum**

  `runRadioImport` ruft `getModuleDb("radio", schema)`. Der Cache dahinter liegt in
  `globalThis.__suiteDb["radio"]` und ist **per Modulschlüssel gekeyt, nicht per `DATA_DIR`**
  (`src/core/db/index.ts:31-35`). Ein Test, der die Funktion zweimal mit verschiedenem `DATA_DIR`
  fährt, bekommt beim zweiten Mal ein **stale Handle auf die alte Datei** — der Grund steht
  ausgeschrieben in `scripts/import/portal.test.ts:23-25`, und beide vorhandenen Importer-Tests
  halten sich daran.

  ⚠️ **Das widerspricht Spec 2 §1.6.3, die schreibt „Der Test darf also den `runRadioImport`-Aufruf
  umschließen".** Kein W-Punkt löst das auf. **Dieser Plan entscheidet für die Hausform:** die
  Idempotenzfälle A–D (Aufgabe 9) fahren `importiereRadio` gegen eine selbst gebaute, migrierte
  Ziel-DB; `runRadioImport` wird **von Hand** abgenommen (Aufgabe 11). Begründung: die Alternative
  wäre ein Test, der den globalen Cache zwischen Fällen von Hand leert — also eine Prüfvorrichtung,
  die genau das Verhalten fälscht, das der Echtlauf hat. Notiert als Fund am Ende dieses Plans.

  ✅ **Was die Hausform dabei NICHT verliert:** `runRadioImport` ist eine Klammer über vier bereits
  getestete Teile. Ungetestet bleiben genau die Klammer, die Zählzeile und der CLI-Block — und für
  die drei ist der Trockenlauf aus Aufgabe 11 die schärfere Probe, weil er zusätzlich Exit-Code und
  Ausgabetext prüft.

- [ ] **Schritt 2: ⬜ L6 ablesen und ins Protokoll schreiben**

  Die Abschlusszeile ist ein **Abnahmekriterium des Runbooks**, nicht eine Höflichkeit:
  `docs/runbooks/portal-cutover.md:33` macht die Zeichenkette `parity green` zum Kriterium
  („Entscheidend: Ausgabe endet mit `parity green`"), `docs/runbooks/feedback-cutover.md:110` prüft
  entsprechend auf `Parität grün`.

  ⚠️ **Die zwei vorhandenen Importer sind hier unvereinbar, und Spec 2 §1.5.3 schlägt eine
  DRITTE Fassung vor:** `Radio-Import OK — ${report.sourceCount} Zeilen, Paritaet gruen.` — ohne
  Umlaut, während `feedback.ts:280` `Parität grün` mit Umlauten schreibt. **Ob der Umlaut steht,
  gehört in L6**, denn ein Runbook, das auf `Parität grün` greppt, findet `Paritaet gruen` nicht.

  ```
  L6 abgelesen am ____________ — die Abschlusszeile, byteweise:
  ________________________________________________________________
  Der Anker, auf den das Runbook greppt: __________________________
  ```

  **Bis L6 abgelesen ist, wird die Zeile aus §1.5.3 zeichengleich übernommen** (sie ist die einzige
  niedergeschriebene Fassung) — und der Planteil zu Kapitel 3 bekommt sie als Zusage gemeldet.

- [ ] **Schritt 3: `runRadioImport` und den CLI-Block schreiben**

  Ans Ende von `scripts/import/radio.ts`, zeichengleich aus Spec 2 §1.5.3:

  ```ts
  import { migrateAllModules } from "@/core/bootstrap";
  import { getModuleDb } from "@/core/db";
  import { assertParity } from "./parity";

  export function runRadioImport(quellPfad: string): void {
    migrateAllModules();                                   // wie portal.ts:102, feedback.ts:265

    const quellDb = new Database(quellPfad, { readonly: true });
    let quelle: RadioQuelle;
    try {
      quelle = lieseQuelle(quellDb);                       // die fuenf SELECTs aus §1.4
    } finally {
      quellDb.close();
    }

    // Erste Ausgabezeile: die fuenf gelesenen Zaehlungen — damit das Runbook sie gegen die
    // Vorabzaehlung stellen kann, OHNE eine zweite Abfrage zu fahren. Sie macht den
    // `cp`-statt-`.backup`-Fehler aus §1.1 an genau EINER Stelle sichtbar.
    console.log(
      `Quelle: users=${quelle.users.length} software_versions=${quelle.softwareVersions.length} ` +
        `devices=${quelle.devices.length} device_events=${quelle.deviceEvents.length} ` +
        `loans=${quelle.loans.length}`,
    );

    const db = getModuleDb("radio", schema);               // src/core/db/index.ts:27-36

    // EINE Transaktion ueber alle fuenf Tabellen: ein FK-Abbruch bei device_events laesst
    // sonst devices halb drin. Das macht einen ROTEN PARITAETSCHECK NICHT rueckgaengig — der
    // laeuft danach (siehe unten). ⚠️ portal.ts und feedback.ts haben KEINE Transaktion; das
    // ist die eine bewusste Abweichung vom Vorbild (§1.5.3).
    db.transaction((tx) => importiereRadio(quelle, tx));

    // NB (portal.ts:105-107, feedback.ts:274-276): Paritaet laeuft NACH diesem Schreiben.
    // Ein geworfener Paritaetsfehler heisst, das Ziel wurde bereits beschrieben — nicht
    // "nichts ist passiert". Der Rueckweg ist die GELOESCHTE, leere Ziel-DB und ein neuer
    // Lauf, nicht ein zweiter Versuch auf denselben Bestand (§1.6.4).
    const report = checkRadioParitaet(quelle, db);
    assertParity(report);                                  // parity.ts:58-65
    console.log(`Radio-Import OK — ${report.sourceCount} Zeilen, Paritaet gruen.`);
  }

  // CLI: tsx scripts/import/radio.ts <radio-snapshot.db>   (DATA_DIR steuert das Ziel)
  if (import.meta.url === `file://${process.argv[1]}`) {
    const src = process.argv[2];
    if (!src) {
      console.error("usage: tsx scripts/import/radio.ts <radio-snapshot.db>");
      process.exit(1);
    }
    try {
      runRadioImport(src);
    } catch (err: unknown) {
      console.error(err);
      process.exit(1);
    }
  }
  ```

  ⚠️ **`Database` ist hier ein WERT-Import, nicht nur ein Typ.** Bis Aufgabe 9 stand oben
  `import type Database from "better-sqlite3";` — für `new Database(...)` muss daraus
  `import Database from "better-sqlite3";` werden. `Database.RunResult` in `RadioTx` funktioniert
  über beide Formen.

  ⚠️ **Synchron, nicht `async`.** `feedback.ts:264` ist `async` ohne `await` im Rumpf. better-sqlite3
  ist durchgehend synchron, und synchron heißt: `db.transaction()` ist überhaupt benutzbar — die
  asynchrone Variante wäre es nicht. Folge: der CLI-Block fängt mit `try/catch`, nicht mit
  `.catch()`.

  ⚠️ **`readonly: true` ist nicht Kosmetik** (§1.1). Ohne das Flag legt better-sqlite3 beim Öffnen
  einer WAL-Datenbank ein `-shm` an und **darf recovern** — auf einem Volume, das im Standby
  unangetastet bleiben soll (Kapitel 5).

- [ ] **Schritt 4: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add scripts/import/radio.ts
  rtk git commit -m "feat(radio-import): runRadioImport mit Zaehlzeile, einer Transaktion und dem CLI-Einstieg"
  ```

---

## Aufgabe 11: Abnahme von Hand — der Trockenlauf über die Kommandozeile

**Wartet auf:** Aufgabe 10.
**Files: keine — diese Aufgabe ist eine Messung** (Hausform:
`docs/superpowers/plans/2026-08-14-konto-profil.md:530-576`, „**Files:** keine — dieser Task ist
eine Messung").

⚠️ **Die Quelle des Trockenlaufs ist die FIXTURE, nicht der echte Bestand.** Die lokale
`radio-admin/data/data.sqlite` ist als Beleg unbrauchbar: leer und **vorbaselinig** — `.tables` zeigt
nur `__drizzle_migrations`, `device_events`, `devices`, `software_versions`; `loans`, `api_tokens`
und `users` **fehlen ganz** (Randbedingung 8, `docs/radio-portierung-analyse.md:1865-1872`). Ein
Trockenlauf gegen sie bräche mit „no such table: loans" ab — aus dem falschen Grund. **Alles
Bestandsbezogene ist ein Runbook-Schritt gegen den echten Dump** und gehört in die Planteile zu
Kapitel 3 und 4, nicht hierher.

- [ ] **Schritt 1: Die Fixture als Datei ausschreiben**

  ⚠️ **Das Wegwerf-Skript liegt im REPO-Wurzelverzeichnis, nicht in `/tmp`.** Ein relativer
  Spezifizierer löst gegen die **importierende Datei** auf: aus `/tmp` heraus sucht Node
  `/tmp/scripts/import/fixtures/radio-quelle` und findet weder die Datei noch
  `better-sqlite3` — `ERR_MODULE_NOT_FOUND`, gemessen. Aus demselben Grund läuft `tsx` aus dem
  Repo: dort löst auch der `@/`-Alias aus `tsconfig.json:21-23` auf.

  ```bash
  cat > ./__radio-fixture-dump.mts <<'EOF'
  import { baueBespielteQuellDb } from "./scripts/import/fixtures/radio-quelle";
  const db = baueBespielteQuellDb();
  db.exec("vacuum into '/tmp/radio-quelle-probe.sqlite'");
  db.close();
  EOF
  rm -f /tmp/radio-quelle-probe.sqlite
  rtk pnpm exec tsx ./__radio-fixture-dump.mts
  ls -la /tmp/radio-quelle-probe.sqlite
  ```

  ⚠️ **`./__radio-fixture-dump.mts` wird in Schritt 5 gelöscht.** `pnpm vitest run` sammelt sie
  nicht ein (kein `.test.`-Name), `pnpm lint` sieht sie — sie gehört in keinen Commit.

  ⚠️ `vacuum into` (statt `.backup`) ist hier zulässig und aus demselben Grund richtig, aus dem W1
  `cp` verbietet: beides sind Befehle, die **die Datenbank kennen**, nicht die Datei. Für die
  **produktive** Quelle ist `.backup` verbindlich (W1) — dort läuft die Alt-Anwendung weiter.

- [ ] **Schritt 2: Den Import gegen ein eigenes `DATA_DIR` fahren**

  ```bash
  rm -rf ./.data/radio-trockenlauf
  DATA_DIR=./.data/radio-trockenlauf rtk pnpm exec tsx scripts/import/radio.ts /tmp/radio-quelle-probe.sqlite
  echo "exit=$?"
  ```

  **Erwartung, beide Zeilen:**

  ```
  Quelle: users=1 software_versions=2 devices=2 device_events=1 loans=2
  Radio-Import OK — 8 Zeilen, Paritaet gruen.
  exit=0
  ```

  ⚠️ **Der Exit-Code gehört zur Abnahme, nicht nur der Text.** `docs/runbooks/portal-cutover.md:33`
  prüft **Zeichenkette und Exit-Code**, nicht nur einen von beiden — ⬜ **L6**. Beide Werte ins
  Protokoll:

  ```
  Trockenlauf am ____________:  Zaehlzeile ____________________________________
                                Abschlusszeile ________________________________
                                exit ______
  ```

- [ ] **Schritt 3: Glied (3)→(4) der Zählkette schließen**

  Die Zählkette hat **vier** Glieder (§1.8); der Trockenlauf schließt das dritte und vierte:

  ```
  (1) live /data/data.sqlite  →  (2) radio-admin-snapshot.sqlite  →  (3) Zaehlzeile des Importers  →  (4) Ziel-radio.db
  ```

  ```bash
  sqlite3 -readonly ./.data/radio-trockenlauf/radio.db "
    select 'devices',           count(*) from devices union all
    select 'software_versions', count(*) from software_versions union all
    select 'users',             count(*) from users union all
    select 'device_events',     count(*) from device_events union all
    select 'loans',             count(*) from loans;"
  ```

  Erwartung: `devices|2`, `software_versions|2`, `users|1`, `device_events|1`, `loans|2` — dieselben
  fünf Zahlen wie in der Zählzeile aus Schritt 2.

  ⚠️ **`api_tokens` steht in dieser Abfrage NICHT.** Die Tabelle existiert **im Ziel nicht** (W4);
  wer sie mitschreibt, bekommt `Error: no such table: api_tokens` und hält es für einen Fehler. Im
  Quellarm bleibt ihre Zählung als **Protokollzeile** (§1.8, Anhang A A-2).

  ⚠️ **Glied (1)→(2) schließt hier NICHT** und kann es nicht: es braucht den Freeze und die echte
  laufende Alt-Datenbank. **Nur (1)→(2) findet einen abgeschnittenen Schnappschuss.** Wer die Kette
  bei (2) beginnt, vergleicht den Schnappschuss mit sich selbst.

- [ ] **Schritt 4: Den Zweitlauf-Riegel von Hand sehen**

  ```bash
  DATA_DIR=./.data/radio-trockenlauf rtk pnpm exec tsx scripts/import/radio.ts /tmp/radio-quelle-probe.sqlite
  echo "exit=$?"
  ```

  Erwartung: **`exit=0`**, Parität grün — ein Zweitlauf gegen **dieselbe** Quelle und **denselben**
  Bestand ist per Upsert grün. ⚠️ **Das beweist keine Idempotenz** (§1.6.2), es beweist nur, dass
  `INSERT … ON CONFLICT` existiert. Die belastbare Aussage steht in Aufgabe 9, und der Runbook-Satz
  lautet **„`radio.db` löschen, dann importieren"**, nicht „importieren" (§1.6.4).

- [ ] **Schritt 5: Aufräumen und den Befund melden**

  ```bash
  rm -rf ./.data/radio-trockenlauf /tmp/radio-quelle-probe.sqlite ./__radio-fixture-dump.mts
  rtk git status --short          # MUSS leer sein — kein Wegwerf-Skript im Baum
  ```

  **Gemeldet wird, nicht still genommen:** die abgelesene Abschlusszeile (⬜ L6) geht an den
  Planteil zu **Kapitel 3** (Generalprobe, §3.1.2) und an den zu **Kapitel 4** (§4.5 Schritt 5),
  weil beide auf ihre Zeichenkette prüfen.

---

## Was dieser Plan bewusst NICHT umsetzt

Hausform: `docs/runbooks/lagerbuch-cutover.md:436` (`| Gegenstand | Warum nicht | Wo es hingehört |`).

| Gegenstand | Warum nicht | Wo es hingehört |
|---|---|---|
| `src/app/m/radio/_db/schema.ts`, `client.ts`, `drizzle.config.ts`, `migrations/` | Das ist **das Modul**, nicht der Importer | Spec 1 §2.5, §2.6, §2.9.1 |
| Das **Registrierungsdreieck** (`MODULE_MIGRATIONS`, `Dockerfile`-`COPY`, `SEED_MODULE`) | Vier fremde Dateien; ihre roten Tests entstehen mit dem Modul, nicht mit dem Importer | Spec 1 §2.9 |
| `api_tokens` — Tabelle, Mapper, Paritätsarm, Zielzählung | Sie **existiert im Ziel nicht** (B16, Entscheidung 13, W4). Die `COUNT(*)`-Zeile bleibt als **Protokollzeile** im Quellarm | Zählkette §1.8 · Abfrage T §5.2.2 (Planteil Kapitel 5) |
| `zugangscodes` — Import, Seed, jede schreibende Zeile | Kein Quellgegenstück; ein Import „als aktiv" reaktivierte still jeden gesperrten Code — genau die, die gesperrt wurden, weil ein Kärtchen verschwunden ist | §1.4.6 · der erste Code entsteht **nach** dem Umschwenk (**W2**, §4.8.2, Planteil Kapitel 4) |
| `AdminUser` aus `radio-inventar` und der ganze Postgres | Randbedingung 6: im Pocket-ID-Betrieb schreibt der OIDC-Weg gar nicht in die Tabelle | Zählung P3, §5.2.3 (Planteil Kapitel 5) |
| Die **dreizehn Vorabfragen A1–A13** gegen die Alt-Datenbank | Sie laufen gegen den Server, nicht gegen den Baum. Kapitel 1 liefert nur den Grund für drei davon (A2, A3, A5) | §2.4 (Planteil Kapitel 2) |
| Die **Feldstichproben** und die Zeitstempel-Stichprobe | Sie schließen den blinden Fleck der Paritaet **am Bestand**, nicht am Test | §2.2, §2.3 (Planteil Kapitel 2) |
| Die **Zählkette Glied (1) und (2)** | Sie brauchen den Freeze und die laufende Alt-Datenbank. Aufgabe 11 schließt nur (3)→(4) | §1.8 · §4.5 Schritt 2 und 5 (Planteil Kapitel 4) |
| Ein zusätzlicher **Fremdschlüssel** „der Ordnung wegen" — auf `loans.device_id` oder von einer Auditspalte auf `users.sub` | Gültiges Drizzle, gültiges SQL und **paritätsgrün**; der Schaden entsteht Monate später bei der ersten Geräteausmusterung | Spec 1 §2.3, §2.10 Nr. 6 — **nirgends**, er wird nicht gebaut |
| Ein **Filter auf `users`** und jede Waisen-Reparatur | `lagerbuch` hat hier gefiltert (`lagerbuch-cutover.md:415`); dieses Kapitel nicht — die Tabelle hat drei Spalten, und ein Filter verschlechtert die Anzeige eines später wieder auftauchenden `sub`, ohne etwas zu schützen | §1.4.1 — **nirgends** |
| Eine Änderung an `vitest.config.ts` | `pnpm test` sammelt `scripts/**` bereits mit (gemessen). Der Kommentar `:4-5` ist falsch, aber die drei `exclude`-Einträge tragen je eine gemessene Begründung | **nirgends** |

---

## Zusagen dieses Planteils an die anderen

Namen, Signaturen und Dateipfade, auf die sich die Planteile zu Kapitel 2, 3, 4 und 5 stützen dürfen.

**Dateien:**

```
scripts/import/radio.ts
scripts/import/radio.test.ts
scripts/import/fixtures/radio-quelle-ddl.sql      (zeichengleiche Kopie der fuenf Alt-Migrationen)
scripts/import/fixtures/radio-quelle.ts           (Rohzeilen + baueQuellDb/baueBespielteQuellDb)
```

**Unverändert benutzt:** `scripts/import/parity.ts` (`checkParity`, `assertParity`, `rowChecksum`) ·
`src/core/db/index.ts` (`getModuleDb`, `moduleDbPath`) · `src/core/bootstrap.ts`
(`migrateAllModules`).

**Aufrufform** (dieselbe in Generalprobe und Fenster, **ein** positionales Argument, das Ziel
steuert `DATA_DIR`):

```bash
DATA_DIR=<ziel> pnpm exec tsx scripts/import/radio.ts <radio-snapshot.db>
```

⚠️ **Nicht „zeichengleich":** der Pfad des `DATA_DIR` unterscheidet Generalprobe und Echtlauf, und
das ist der einzige Unterschied. Wer „zeichengleich" wörtlich nimmt, sucht im Fenster nach einer
Zeile, die es nicht gibt. Der Name der Schnappschuss-Kopie ist **überall**
`radio-admin-snapshot.sqlite`, im **Arbeitsverzeichnis des Hosts**. Das **positionale** Argument in
spitzen Klammern oben ist der **generische Platzhalter der Aufrufform**, kein zweiter Dateiname —
jede Runbook-Zeile schreibt den konkreten Namen aus (Cutover-Leitplan NS9).

⚠️ **`migrateAllModules()` legt die Ziel-DB an, wenn sie fehlt** — deshalb ist „`radio.db` löschen"
ein zulässiger Schritt und kein Sabotageakt. Umgekehrt: wer `DATA_DIR` vergisst, importiert nach
`./.data/radio.db` (`src/core/db/index.ts:6`), meldet Parität grün und hat nichts migriert. **Wie
man es merkt:** die Zählung gegen die Zielndatei **nach** dem Lauf, gegen die Zählzeile der Ausgabe
— **ein eigener Runbook-Schritt**, nicht eine Fußnote am Importschritt.

**Exportierte Namen** (Zusage — wer sie ändert, bricht einen anderen Planteil):

| Name | Form | Herkunft |
|---|---|---|
| `msZuDatum`, `msZuDatumOptional`, `tagInBerlin` | `(feld: string, ms) => …` | Spec 1 §2.2.4, zeichengleich |
| `zuBoolOptional`, `EREIGNIS_QUELLEN`, `pruefeQuelle` | siehe Aufgabe 3 | Spec 2 §1.3.5, §1.4.4 — **export** ist eine Zusage dieses Plans |
| `AltNutzer`, `AltVersion`, `AltGeraet`, `AltEreignis`, `AltLeihe` | `interface`, Felder = SQL-Spaltennamen | Spec 1 §8.2.1 benutzt die Namen; **dieser Plan definiert sie** |
| `RadioQuelle` | `{ users, softwareVersions, devices, deviceEvents, loans }` | Spec 2 §1.5.2 |
| `lieseQuelle(quellDb)` | `(Database.Database) => RadioQuelle` | Spec 2 §1.5.3 |
| `toNeuenBenutzer`, `toNeueSoftwareVersion`, `toNeuesGeraet`, `toNeuesGeraeteEreignis`, `toNeueLeihe` | je `(zeile: Alt…) => Neue…` | Spec 1 §8.2.1 |
| `paritaetsSichtGeraet` | `(r: NeuesGeraet \| Geraet) => Row` | Spec 1 §2.2.4 |
| `paritaetsSichtBenutzer`, `paritaetsSichtSoftwareVersion`, `paritaetsSichtGeraeteEreignis`, `paritaetsSichtLeihe` | analog | Spec 2 §1.5.2 (⬜ L3 für die Spaltenlisten) |
| `getaggteQuellzeilen(q)` | `(RadioQuelle) => Row[]` | Spec 2 §1.5.2 |
| `getaggteZielzeilen(db)` | `(RadioDb) => Row[]` | **Zusage dieses Plans**, analog `feedback.ts:248` |
| `checkRadioParitaet(q, db)` | `(RadioQuelle, RadioDb) => ParityReport` | Spec 2 §1.5.3 |
| `importiereRadio(quelle, db)` | `(RadioQuelle, RadioDb \| RadioTx) => void` | Spec 2 §1.5.3 |
| `runRadioImport(quellPfad)` | `(string) => void`, **synchron** | Spec 2 §1.5.3 |
| `RadioDb`, `RadioTx` | siehe Aufgabe 7 und 8 — **die Union ist gemessen** | Spec 2 §1.5.3 |
| `baueQuellDb`, `spieleQuellFixtureEin`, `baueBespielteQuellDb`, `ALLE_QUELLZEILEN`, `ALT_VERSION_ZWEIT` | siehe Aufgaben 1 und 2 | **Zusagen dieses Plans** |

**Abschlusszeile (⬜ L6, vorläufig):**
`Radio-Import OK — <n> Zeilen, Paritaet gruen.` — ⚠️ **ohne Umlaut**, im Unterschied zu
`feedback.ts:280` (`Parität grün`). Ob das so bleibt, entscheidet L6; **ein Runbook, das auf
`Parität grün` greppt, findet `Paritaet gruen` nicht.**

**Zählzeile (gesetzt, kein ⬜):**
`Quelle: users=<n> software_versions=<n> devices=<n> device_events=<n> loans=<n>`

---

## Keine N-Nummern — und warum

Der Auftrag erlaubt, für eine offensichtliche Ablesung ohne Nummer eine neue mit dem Präfix `N` zu
vergeben. **Dieser Planteil vergibt keine**, und das ist geprüft, nicht übersehen. Alles Unbenannte
in Kapitel 1 fällt in genau drei Klassen:

1. **Bereits benannt** — die Typaliase (⬜ L1), die vier Paritätssichten (⬜ L3), die
   Fehlerverpackung (⬜ L2), die Abschlusszeile (⬜ L6), die Migrationszahl (⬜ L4).
2. **Ableitbar, nicht ablesbar** — die fünf Quelltypen und ihre Felder (aus der kopierten Quell-DDL),
   `RadioQuelle`s Feldnamen (Spec 2 §1.5.2), die Tabellen- und Spaltennamen des Ziels (Spec 1 §2.5
   schreibt sie vollständig aus, inklusive `export const devices = sqliteTable(…)`), der Ort der
   Mapping- und Sichtfunktionen (Spec 1 §2.2.4 ist wörtlich mit
   „— `scripts/import/radio.ts`" überschrieben).
3. **Heute messbar, und gemessen** — ⬜ L2, die `RadioDb | RadioTx`-Union, die physische
   Spaltenreihenfolge, die Textprobe des ARRANGE-Riegels. Alle vier stehen in der Tafel „Was dieser
   Plan in dieser Runde GEMESSEN hat".

**Der eine Grenzfall** ist die Verfügbarkeit von `radio-admin@265abd5` für Aufgabe 1. Er steht als
**Vorbedingung V-A** in der Sperrtafel und nicht als Leerstelle: er ist heute gemessen erfüllt, und
sein Rückfall (das archivierte Repo am SHA klonen) ist ausgeschrieben. Eine ⬜-Nummer für einen
Zustand, der zum Bauzeitpunkt trivial nachprüfbar ist, verwässerte die Liste, die nach dem Bau
abgearbeitet wird.

---

## Selbstprüfung gegen den Entwurf

| Abschnitt von Spec 2 Kapitel 1 | Aufgabe |
|---|---|
| §1.0 — warum die Datei existieren muss | 3 (Kopfkommentar), ⚠️-Kopf Punkt 2 |
| §1.1 — Schnappschuss statt `cp`, `readonly: true` | 10 (Schritt 3), 11 (Schritt 1) |
| §1.2 — Spalten namentlich, die Verschiebungsrechnung | 1 (Zusicherung a), 4 (SELECTs + Quelltext-Scan), 5 (Zusicherung b) |
| §1.3.1–§1.3.3 — die Zeitachse, zehn Quellspalten | 3 |
| §1.3.4 — Fixture-Werte, elf Testnamen, fünf ⛛ Zusicherungen | 2 (Werte), 3 (fünf Namen), 5 · 6a · 6b (sechs Namen + fünf ⛛) |
| §1.3.5 — `null` in `{ mode: "boolean" }`, zwölfter Test | 3 (Funktion), 5 (Verdrahtung) |
| §1.4.1–§1.4.5 — je Tabelle Quellabfrage, Ziel, Mapping | 4 (Abfragen), 5 · 6a · 6b (Mapping) |
| §1.4.6 — `zugangscodes` nicht Teil des Imports | 4, 8 (Einfügereihenfolge), „Was NICHT umgesetzt wird" |
| §1.5.1 — Einfügereihenfolge, kein `defer_foreign_keys` | 8 |
| §1.5.2 — Multiset mit `__table`-Tag, vier Regeln | 7 |
| §1.5.3 — Rahmenfunktion, Transaktion, CLI, `DATA_DIR` | 10, 11 |
| §1.6.1–§1.6.4 — Konfliktstrategien, die asymmetrischen Fälle | 8 (Strategien), 9 (Fälle A · B · C · **D**) |
| §1.7 — was NICHT importiert wird, je Posten ein Satz | „Was dieser Plan bewusst NICHT umsetzt" |
| §1.8 — Fixtures, Reihenfolge-Test, die vier Glieder der Zählkette | 1, 2, 5, 11 (Glied 3→4) |
| §1.9 — die drei Abweichungen und sieben Ergänzungen | Re-Kritik-Tafel unten |
| §1.10 — die vier Dateien, die drei tragenden Tests | „Zusagen dieses Planteils" |

**Die drei Tests, ohne die dieses Kapitel keinen Schutz hat** (§1.10) — und wo sie stehen:

1. `toNeuesGeraet: jedes Zeitfeld behaelt SEINEN Wert in Millisekunden` → **Aufgabe 5, Schritt 2**
2. `Import ist asymmetrisch idempotent…`, Fall A und B → **Aufgabe 9, Schritte 1 und 2**
3. `lieseQuelle liest namentlich: devices.tei steht in der Quelle an Position 25` → **Aufgabe 5,
   Schritt 2** (Zusicherung a zusätzlich schon in **Aufgabe 1, Schritt 3**)

**Alle drei müssen VOR der ersten Generalprobe grün sein** (§3.6 Nr. 1). Da alle drei hinter ⬜ L1
liegen, gilt: **ohne gebautes Spec 1 gibt es keine Generalprobe.** Das ist die schärfste Folge
dieses Planteils für die Terminplanung und gehört in den Planteil zu Kapitel 3.

**Namensgleichheit, über alle Aufgaben geprüft:** `msZuDatum` · `msZuDatumOptional` · `tagInBerlin` ·
`zuBoolOptional` · `pruefeQuelle` · `EREIGNIS_QUELLEN` · `lieseQuelle` · `RadioQuelle` ·
`toNeuenBenutzer` · `toNeueSoftwareVersion` · `toNeuesGeraet` · `toNeuesGeraeteEreignis` ·
`toNeueLeihe` · `paritaetsSichtGeraet` · `getaggteQuellzeilen` · `getaggteZielzeilen` ·
`checkRadioParitaet` · `importiereRadio` · `runRadioImport` · `RadioDb` · `RadioTx` ·
`baueQuellDb` · `spieleQuellFixtureEin` · `baueBespielteQuellDb` · `frischeZielDb` ·
`ALLE_QUELLZEILEN` — in allen Aufgaben zeichengleich geschrieben.

---

## Die Re-Kritik — was eingearbeitet ist, und was mit Gegenbeleg verworfen ist

**Dieser Bericht ist Pflicht, nicht Höflichkeit:** sein Fehlen war der benannte Mangel des
Vorgängerdurchgangs (Kopf der Spec, Zeilen 35–41 — „kein Protokoll abgelehnter Beanstandungen").
Geführt sind **alle** Funde, die Kapitel 1 berühren, jeweils mit Behandlung.

### Eingearbeitet

| Fund | Wo er in diesem Plan landet |
|---|---|
| **RK-A3** (erheblich) — §1.6.3 Fall B, ARRANGE-Riegel: `instr(sql,'WHERE returned_at IS NULL')` ist **0** gegen die Backtick-DDL | **Aufgabe 9, Schritt 2** fährt die **Strukturprobe** `select name, partial, "unique" from pragma_index_list('loans')` mit der Zusicherung `partial: 1, unique: 1`. **Eigenständig nachgemessen**: DDL aus `radio-admin@265abd5:server/drizzle/0003_kind_spot.sql` in eine SQLite eingespielt → `sqlite_master.sql` mit Backticks, `instr(…)` = `0`, `pragma_index_list('loans')` = `loans_device_active_uidx\|1\|1`. Spec 1 §2.6 schreibt die Ziel-Migration **ebenfalls mit Backticks** — der Riegel wäre also gegen eine vollkommen korrekte Migration rot gewesen. Dieselbe Form steht zusätzlich in **Aufgabe 1, Schritt 3** für die Quell-Fixture |
| **RK-A7** (klein) — §1.3.4: „Die **sieben** Millisekunden-Konstanten" über einer Liste mit dreizehn | **Aufgabe 2** schreibt **keine Zahl**, sondern die Mechanik: `ALLE_QUELLZEILEN` plus die Zusicherung „kein Millisekunden-Wert steht unter zwei verschiedenen Feldern". Siehe unten, **teilweise verworfen** |
| **RK-A8** (klein) — §1.3.5: `portal.ts:46-48` zeigt auf `?? []`, nicht auf `!!` | **Aufgabe 3**, Kommentarkopf von `zuBoolOptional`, zitiert **`portal.ts:48-49` und `:51`**. Nachgemessen mit `cat -n`: `:46` = `tags: row.tags ?? []`, `:47` = `requiredGroups: … ?? []`, `:48/:49/:51` = die drei `!!`-Zeilen |
| **RK-A9** (klein) — §1.8: `feedback.ts:63-65` belegt nur die halbe Bauform | **Aufgabe 1**: der Beleg ist zweigeteilt. In-Memory-SQLite statt Objekt-Array = Hausform (`feedback.test.ts:30-70`); **zeichengleiche Kopie der Produktions-DDL = Neuerung dieses Kapitels**, getragen von den drei Gründen aus §1.8. Nachgemessen: `feedback.ts:64-65` sagt „in-memory-Fixture im Test" und nichts über die Herkunft der DDL; `feedback.test.ts:32-70` schreibt fünf `CREATE TABLE` von Hand nach; `scripts/import/fixtures/` enthält **keine** `.sql`-Datei. Der Kommentarkopf der neuen Datei sagt ausdrücklich, dass sie **kopiert und nicht neu geschrieben** wird, und benennt `lagerbuch/_db/herkunft/README.md:9-12` als Präzedenz |
| **RK-A10** (klein) — §1.6.1/§1.6.3: kein asymmetrischer Fall für `software_versions.is_target` | **Aufgabe 9, Schritt 4** führt **Fall D** nach dem Muster von Fall A ein: importieren · im Ziel umhängen · erneut importieren · Zusicherung, dass die Marke auf dem **Quellstand** steht (ein Fehlschlag, kein No-Op), plus die Gegenprobe „genau **eine** Marke" (A2). ⚠️ **Knock-on, den der Fund nicht nennt:** Fall D braucht eine **zweite** `software_versions`-Zeile, sonst gibt es nichts, worauf man umhängen könnte — **Aufgabe 2** ergänzt `ALT_VERSION_ZWEIT`. Die Ziel-Änderung ist ein schlichtes `update`, **nicht** `setTargetVersion`: diese Funktion lebt in `radio-admin`, nicht in der Suite |
| **RK-A12** (klein, dritter Satz) — L1 hat keinen Anker im Text | **Sieben** `**Wartet auf: ⬜ L1**`-Zeilen (Aufgaben 5, 6a, 6b, 7, 8, 9, 10) plus die Sperrtafel plus zwei Ableseschritte mit Protokollzeile (Aufgabe 5 Schritt 1, Aufgabe 7 Schritt 1). Zusätzlich benennt die Sperrtafel den Befund präzise: **zwei** Aliase sind in Spec 1 §2.2.4 belegt, **vier weitere** in §8.2.1 nur **benutzt**, und die **vier Select-seitigen** stehen nirgends |
| **RK-A2** (erheblich, zweiter Satz) — §2.2.1: `devices.last_updated_at` hat keinen Sollwert; die Alt-App widerspricht sich | **Aufgabe 5, Schritt 2**: die ⛛-Zusicherung schreibt den Sollwert **aus** (`"2025-03-02"`, der **Berliner** Kalendertag) und trägt im Kommentar die zwei widersprechenden Fundstellen der Alt-Anwendung (`server/src/routes/export.ts:49-51` formatiert UTC · `client/src/utils/format.ts:4` und `DeviceEditForm.tsx:41` den lokalen Tag) mit dem Satz, dass sie für **diese** Spalte keine zulässige zweite Meinung ist. Die eigentliche Reparatur der Stichprobe gehört in den Planteil zu **Kapitel 2** |
| **RK-A5** (erheblich, zweiter Satz) — §2.2.2 Lauf-Tabelle gegen §1.8 Glied (4) | Der Fund stellt fest, dass **§1.8 Glied (4) recht hat** und §2.2.2 falsch liegt. Übernommen als Bestätigung: **Aufgabe 11, Schritt 3** liest in der Generalproben-Form (`sqlite3 -readonly` gegen einen **Host**-Pfad); der Fenster-Weg über `$VOL_SUITE` ist ausdrücklich als **nicht** hier ausgeschrieben |
| **RK-A11** (klein, erster Satz) — W1: die `VACUUM INTO`-Alternative bricht das Quoting in `sh -c '…'` | **Aufgabe 11, Schritt 1** benutzt `vacuum into` **ohne** `sh -c`-Verschachtelung (in einem `.mts`-Skript, wo die Frage nicht entsteht) und schreibt daneben, dass für die **produktive** Quelle `.backup` verbindlich ist (W1). Der Plan bietet an keiner Stelle eine `sh -c '… VACUUM INTO '…' …'`-Zeile an |

### Teilweise verworfen, mit Gegenbeleg

| Fund | Was übernommen wird, was nicht — und warum |
|---|---|
| **RK-A7** — Empfehlung: „**dreizehn** schreiben. Besser noch: die Zählung nicht dem Fließtext überlassen, sondern eine Zusicherungszeile ergänzen" | ✅ Der **zweite** Teil ist umgesetzt. ❌ Der **erste** ist verworfen: „dreizehn" wäre in diesem Plan **sofort falsch**. Aufgabe 2 ergänzt `ALT_VERSION_ZWEIT` mit einer eigenen Konstante (RK-A10), also **vierzehn** — und der nächste Nachtrag macht daraus fünfzehn. Eine korrigierte Wortzahl ist derselbe Defekt in Grün. **Der Plan schreibt an keiner Stelle eine Zahl von Fixture-Konstanten**; die Prosa lautet „alle Millisekunden-Konstanten der Fixture sind paarweise verschieden — die Zahl steht bewusst nicht im Text, weil sie mit jeder neuen Zeile wandert". ❌ Verworfen ist auch die naive Form der Zusicherung („alle ms-Werte einsammeln, `new Set(w).size === w.length`"): sie wäre **rot gegen die Fixture der Spec selbst**, weil `ALT_GERAET_OHNE_ANGABE` per Spread `created_at` und `updated_at` von `ALT_GERAET` erbt. Das ist erlaubt und gewollt — es ist **dasselbe Feld**. Die Zusicherung läuft deshalb über `tabelle.feld`-Beschriftungen und verbietet nur die Wiederverwendung über **verschiedene Felder** hinweg |
| **⬜ L2** — Empfehlung wäre, die Zeile zu streichen, nachdem sie gemessen ist | ✅ Gemessen und **verengt**, ❌ **nicht gestrichen**. Das Ergebnis ist versionsgebunden (better-sqlite3 13.0.2, drizzle-orm 0.45.2), und die ⬜-Tabelle gehört der Zusammenführung, nicht diesem Planteil. Die Zusicherung in Aufgabe 9 prüft **Meldung und `code`** — sie hält unter einer verpackenden Fassung, die `message` durchreicht, und schlägt **laut** fehl, wenn eine künftige Fassung anders verpackt |

### Nicht dieses Kapitel — weitergereicht

| Fund | Zielplanteil |
|---|---|
| **RK-A1** (blockierend, erster Satz) — `SUITE_HOST_RADIO=localhost` gegen `curl -H 'Host: radio.iuk-ue.de'` in §3.2.2/§3.2.6 und §4.5 Schritt 8 | Kapitel 3 und 4 |
| **RK-A2 · RK-A7** (blockierend/erheblich, erster/dritter Satz) — §4.9 Nachtrag: Host-Pfad `$DATA_DIR` und das nirgends erzeugte `<umschwenk_epoch_sekunden>` | Kapitel 4 |
| **RK-A3** (blockierend, erster Satz) — §4.9 Handgriff 3b ohne `--profile full-app` | Kapitel 4 |
| **RK-A4 · RK-A2** (erheblich, erster/dritter Satz) — §5.2.2 Abfrage A liest auf dem Host | Kapitel 5 |
| **RK-A5** (erheblich, erster Satz) — §4.9 ohne Rücklesung | Kapitel 4 |
| **RK-A6** (erheblich, erster Satz) — uid/gid aus dem **Image** statt aus dem `user:`-Schlüssel des Compose-Service | Kapitel 3 und 4 |
| **RK-A7** (erheblich, erster Satz) — §4.5 Schritt 4 Handgriff 3 tauscht `radio.db` unter einem laufenden Stack | Kapitel 4 |
| **RK-A8 · RK-A1** (erheblich/blockierend, erster/dritter Satz) — Erfüllungspunkt 9 sagt „§4.2 Nr. 1–12" über dreizehn Posten | Zusammenführung |
| **RK-A9 · RK-A6** (klein/erheblich) — Erfüllungspunkt 17 sagt „Z alle drei `0`" über zehn Glieder | Zusammenführung |
| **RK-A10** (klein, erster Satz) — §4.6 Nr. 2: `grep localtest.me` auf einer 3xx-Antwort ist strukturell leer | Kapitel 4 |
| **RK-A12** (klein, erster Satz) — §4.6 Nr. 13: `scripts/backup.sh` ohne die Cron-Env | Kapitel 4 |
| **RK-A1** (erheblich, zweiter Satz) — §2.3.1/§2.3.2: `gelesen_als_s` liefert **NULL**, nicht 1970 | Kapitel 2 |
| **RK-A6** (klein, zweiter Satz) — §2.2.3: dem Tripel `created_at ↔ updated_at ↔ last_updated_at` fehlt die Zielarm-Abfrage | Kapitel 2. ⚠️ Der Fund stellt richtig fest, dass **der Mapper-Unit-Test die Vertauschung fängt** — er steht in **Aufgabe 5** (paarweise verschiedene Konstanten plus die `toEqual`-Zeile über alle 25 Felder). Was fehlt, ist die **Produktionsbestätigung**, und die ist ein Handgriff, kein Test |
| **RK-A3** (erheblich, dritter Satz) — W5 Residuum 2, Vorschlag einer neuen ⬜ L15 („hält der reguläre Stack `radio.db` nach dem Boot dauerhaft offen?") | Kapitel 2 und 4. ⚠️ Kapitel 1 ist davon **unberührt**: der Importer öffnet die **Quelle** `readonly` und die **Ziel**-DB über `getModuleDb` im eigenen Prozess |
| **RK-A4** (erheblich, dritter Satz) — ⬜ L5 ist teilweise erfunden; `src/core/health/index.ts:4-15` beantwortet die Feldfrage schon heute | Kapitel 2, 3 und 4 |
| **RK-A5** (erheblich, dritter Satz) — elf blanke `§`-Verweise zeigen ohne Präfix in Spec 1 hinein | Zusammenführung. ✅ **In diesem Planteil eingehalten:** jeder Verweis in Spec 1 trägt das Präfix `Spec 1`, und der Kopf sagt die Regel |
| **RK-A8 · RK-A9 · RK-A11** (klein, dritter Satz) — „§3.6 Zusage 12", `files-cutover.md:107-109`, `P1–P5` gegen `P1–P6` | Zusammenführung bzw. Kapitel 4 und 5 |
| **RK-A10** (klein, dritter Satz) — §3.1.2: der `files/boot.ts:425`-Beleg sagt das Gegenteil | Kapitel 3 |

### Zwei neue Funde aus dieser Planungsrunde

| # | Fund | Behandlung in diesem Plan |
|---|---|---|
| **N-1** | **§1.6.3 gegen die Hausform der Tests, und kein W löst es auf.** §1.6.3 schreibt „Der Test darf also den `runRadioImport`-Aufruf umschließen". `runRadioImport` ruft `getModuleDb("radio", schema)`, und `scripts/import/portal.test.ts:23-25` verbietet genau das in Tests, mit ausgeschriebener Begründung: der Cache liegt in `globalThis.__suiteDb["radio"]`, **per Modulschlüssel gekeyt, nicht per `DATA_DIR`** (`src/core/db/index.ts:31-35`), und gäbe zwischen Fällen ein stale Handle zurück. Beide vorhandenen Importer-Tests halten sich an die Hausform. **Beides ist nicht gleichzeitig erfüllbar** | **Entschieden: die Hausform gilt.** Aufgabe 9 fährt `importiereRadio` gegen eine selbst gebaute, migrierte Ziel-DB **innerhalb** von `db.transaction()` — so läuft der Rücknahme-Mechanismus, den §1.6.3 misst, wirklich; ein blanker Aufruf würfe auch, aber ohne Rollback. `runRadioImport` wird in **Aufgabe 11** von Hand abgenommen, und dort ist die Probe **schärfer** als ein Vitest-Fall: sie prüft zusätzlich Ausgabetext und Exit-Code. Ausgeschrieben in Aufgabe 10, Schritt 1 |
| **N-2** | **⬜ L6 ist enger gefasst als das Risiko.** Die Zeile fragt nach der „Abschlusszeile"; die betriebliche Aussetzung ist der **Grep-Anker byteweise**. Und §1.5.3 schlägt eine **dritte** Fassung vor: `Paritaet gruen` — neben `parity green` (`portal-cutover.md:33`) und `Parität grün` (`feedback.ts:280`, `feedback-cutover.md:110`). **Ob der Umlaut steht, ist Teil der Frage:** ein Runbook, das auf `Parität grün` greppt, findet `Paritaet gruen` nicht | **Aufgabe 10, Schritt 2** führt L6 mit einer Protokollzeile für **Zeile und Anker**; **Aufgabe 11, Schritt 2** nimmt zusätzlich den **Exit-Code** ab, weil `portal-cutover.md:33` beides prüft. Die vorläufige Fassung ist die aus §1.5.3, zeichengleich, und geht als Zusage an die Planteile zu Kapitel 3 und 4 |

### Ein kleiner Fund am Rand

**Der ⛛-Testname in §1.3.4 lautet `toNeuerBenutzer: last_seen_at behaelt SEINEN Wert`, die Funktion
heißt `toNeuenBenutzer`** (Spec 1 §8.2.1, Spec 2 §1.5.2). Beides bleibt in **Aufgabe 6a**
zeichengleich stehen — der Testname ist kein Aufruf, und ihn stillschweigend zu vereinheitlichen
hieße, eine verbindliche Zeile umzuschreiben. Die Zusammenführung entscheidet, ob der Testname
nachgezogen wird.
