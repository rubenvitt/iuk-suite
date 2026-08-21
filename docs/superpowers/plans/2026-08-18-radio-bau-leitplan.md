# Leitplan für den Bau — `radio`, alles was Code ist (Spec 2, Kapitel 1 und Kapitel 2 Teil A)

> **Fortschritt und Reihenfolge des Bauwegs (**B1–B17**) fuehrt**
> `docs/superpowers/plans/2026-08-18-radio-ausfuehrungsplan.md` — dieser Leitplan entscheidet
> die Nahtstellen, jener haelt die Checkliste.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans. **Dieses Dokument enthält keine Schritte.** Es
> ordnet, entscheidet und verweist; die Schritte stehen in den zwei zugehörigen Planteilen und
> werden dort abgehakt.

**Goal:** Am Ende dieses Wegs existiert `scripts/import/radio.ts` — ein Importer, der einen
Schnappschuss der Alt-Datenbank von `radio-admin` in `radio.db` der Suite schreibt: fünf Tabellen,
61 Spalten, fünf Paritätssichten, die **jede** Spalte ihrer Zieltabelle führen, und zwei Riegel
gegen den Faktor-1000-Fehler, der paritätsgrün ist und beim nächsten Boot die gesamte abgeschlossene
Leihhistorie löscht. Dazu die zwei Testdateien und die zwei Fixture-Dateien, die das mechanisch
belegen. **Nicht** Gegenstand dieses Wegs ist der Cutover-Abend.

**Architecture:** Der Weg zerfällt in **zwei Hälften, und die Grenze ist zeitlich, nicht fachlich.**
Die Aufgaben **1–4** hängen ausschließlich an der **Quell**seite (kopierte Alt-DDL, Rohzeilen, die
reinen Zeitfunktionen, die fünf namentlichen `SELECT`s) und sind **heute ausführbar** — Spec 1 wird
dafür nicht gebraucht. Die Aufgaben **5–17** hängen an der **Ziel**seite
(`src/app/m/radio/_db/schema.ts`, das Migrationsverzeichnis, das Registrierungsdreieck) und sind
gesperrt, bis Spec 1 gebaut ist. **Zwischen 4 und 5 liegt der Bau von Spec 1; das ist die einzige
Naht des Gesamtwegs.** Die Aufgaben **8–13** bilden innerhalb der zweiten Hälfte **einen Block mit
genau einem Tor** — die Begründung steht in Naht **NS3**, sie ist mechanisch und nicht stilistisch.
Innerhalb einer Aufgabe gilt die TDD-Folge: fehlschlagender Test → Fehlschlag sehen → minimale
Umsetzung → grün → Commit.

**Tech Stack:** Node + TypeScript · better-sqlite3 13.0.2 · drizzle-orm 0.45.2 · Vitest 4.1.5
(`environment: "node"`) · `tsx` 4.23.12 (kein Build-Schritt für Skripte) · SQLite. Kein
`src/app/**` wird von diesem Weg angefasst — `pnpm build` und Playwright laufen einmal vor dem
Merge, nicht je Aufgabe.

**Spec:** `docs/superpowers/specs/2026-08-18-radio-cutover-design.md` — **Kapitel 1** (Zeilen
562–1577) und der **Code**-Teil von **Kapitel 2** (1578–2271). Der **Rahmen** (1–561, insbesondere
die neun harten Randbedingungen, die ⬜-Tabelle und W1, W2, W4, W8, W9, W11) und **Anhang A/B**
(4880–4914) sind mitverbindlich.

**Spec 1:** `docs/superpowers/specs/2026-08-17-radio-modul-design.md` — **nicht gebaut.**
`src/app/m/radio/` existiert im Repo nicht, `scripts/import/radio.ts` existiert nicht (nachgesehen
2026-08-18; Spec 2:111). Ein `§`-Verweis ohne Präfix meint **immer Spec 2**; jeder Verweis in
Spec 1 trägt das Präfix `Spec 1`.

---

## Die zwei zugehörigen Planteile

| Teil | Datei | Was davon zu diesem Leitplan gehört |
|---|---|---|
| **T1** | `docs/superpowers/plans/2026-08-18-plan1-radio-import.md` (3059 Zeilen) | **ganz** — alle zwölf Aufgaben (T1s Nummern 1–11, mit `6a`/`6b` als zwei) |
| **T2** | `docs/superpowers/plans/2026-08-18-plan2-radio-paritaet.md` (2072 Zeilen) | **nur Teil A**, die Aufgaben 1–5 (`2026-08-18-plan2-radio-paritaet.md:96–678`) |

**Die Schritte stehen dort und werden dort abgehakt.** Dieses Dokument nennt je Aufgabe die
Ankerüberschrift, unter der sie zu finden ist. Wo dieser Leitplan von einem Planteil abweicht,
steht die Abweichung unter **Nahtstellen** mit Beleg — **still glattgezogen wird nichts**.

### Abgrenzung: was zu diesem Weg NICHT gehört

**T2 Teil B ist Runbook und gehört in `docs/superpowers/plans/2026-08-18-radio-cutover-leitplan.md`**
— es wird hier weder übernommen noch nacherzählt:

* **§L** — der Leseapparat auf beiden Armen (T2 Aufgabe 6, `2026-08-18-plan2-radio-paritaet.md:679–882`)
* **§V** — die **dreizehn** Vorabfragen **A1–A13** gegen die Alt-Datenbank vor dem Import
  (T2 Aufgabe 7, `2026-08-18-plan2-radio-paritaet.md:883–1279`). ⚠️ Es sind dreizehn, nicht neun: A10–A13 sind
  Ergänzungen des Planteils (`2026-08-18-plan2-radio-paritaet.md:1120`, `:1154`, `:1197`, `:1227`)
* **§S** — die Feldstichproben (T2 Aufgaben 8–10, `2026-08-18-plan2-radio-paritaet.md:1280–1806`)
* **§Z** — die Gegenzählungen nach dem Import (T2 Aufgabe 11, `2026-08-18-plan2-radio-paritaet.md:1807–1997`)

Mit ihnen wandern **⬜ L4**, **⬜ L5** und die Ablesung **„Hält der reguläre Stack `radio.db` nach
dem Boot dauerhaft offen?"** (T2 führt sie als ⬜ **N1**, `2026-08-18-plan2-radio-paritaet.md:87`) in den
Cutover-Leitplan; dieser Leitplan führt sie nicht. Ebenso wenig führt er E1–E8, U4/U4a/U4b, U6–U9
und C.1–C.7: **kein einziger Punkt daraus blockiert eine Aufgabe dieses Wegs** — dieser Weg baut
eine Datei, keinen Abend. Die einzige mittelbare Berührung: **U4/C.5** blockiert den Freeze, und
ohne Freeze schließt Glied (1)→(2) der Zählkette aus §1.8 nicht — das ist ein Runbook-Schritt, kein
Schritt hier.

---

## Was heute schon läuft

**Vier Aufgaben brauchen weder Spec 1 noch eine Betreiberantwort.** Sie stehen hier vorn, damit die
Sperrtafel niemanden anhält, der arbeiten könnte. Zusammen liefern sie die **gesamte Quellseite**
des Importers: die Fixture, die Rohzeilen, die Zeitachse und den Leseapparat.

| Nr | Aufgabe | Vorbedingung |
|---|---|---|
| **1** | Die Quell-DDL als Fixture, mit dem Riegel auf ihre Spaltenreihenfolge | **V-A** — Arbeitskopie von `radio-admin` am Freeze-SHA `265abd5`. ✅ Gemessen 2026-08-18 vorhanden unter `/Users/rubeen/dev/personal/drk/radio-admin` (`2026-08-18-plan1-radio-import.md:118`) |
| **2** | Die Rohzeilen der Fixture und der Riegel gegen wiederverwendete Zeitwerte | Aufgabe 1 |
| **3** | Die Zeitachse und die zwei Faltungsriegel — reine Funktionen | Aufgabe 2 |
| **4** | `lieseQuelle` — fünf namentliche `SELECT`s, fünf Quelltypen, ein Quelltext-Scan | Aufgabe 3 |

**1 → 2 → 3 → 4 sind strikt nacheinander zu fahren**, jede baut auf der vorigen. Sie schließen mit
einem grünen `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run` ab, ohne dass eine einzige
Datei unter `src/app/m/radio/` existieren muss.

⚠️ **Was das für die Terminplanung heißt:** die **drei Tests, ohne die Kapitel 1 keinen Schutz hat**
(§1.10) liegen alle drei **hinter** ⬜ L1 — in den Aufgaben 5 und 15. Alle drei müssen vor der
ersten Generalprobe grün sein (§3.6 Nr. 1). **Ohne gebautes Spec 1 gibt es also keine
Generalprobe.** Das ist die schärfste Folge dieses Wegs für den Kalender und gehört in den
Cutover-Leitplan (`2026-08-18-plan1-radio-import.md:2986–2989`).

---

## Globale Randbedingungen

Projektweite Vorgaben für den **gesamten** Weg. Wo zwei Planteile verschieden formuliert haben, gilt
die **Vereinigung** — kein Planteil darf eine Vorgabe des anderen unterlaufen.

### Die neun harten Randbedingungen der Spec — welche diesen Weg tragen

Werte wörtlich aus dem Rahmen (Spec 2:52–142). **Vier tragen diesen Weg, fünf gehören zum
Cutover-Abend** — sie stehen trotzdem alle hier, damit niemand rätselt, was ausgelassen wurde.

| # | Randbedingung, wörtlich | Für diesen Weg |
|---|---|---|
| **3** | „**Der Faktor-1000-Fehler ist paritätsgrün UND löscht die Leihhistorie.** Quelle ist epoch-**Millisekunden** (`radio-admin/server/src/db/schema.ts:37-38`, `:126-130`), Ziel ist Drizzle `mode: \"timestamp\"` = Unix-**Sekunden** (Entscheidung 11). … Sekunden statt Millisekunden legt jedes `returned_at` ins Jahr **1970** → der **nächste Boot** löscht die komplette abgeschlossene Leihhistorie. … **Der Import-Test bleibt grün.**" | ⛔ **trägt zentral.** Sie ist der Grund für die Faltungsriegel in Aufgabe 3, für die paarweise verschiedenen Fixture-Konstanten in Aufgabe 2, für die `toEqual`-Zusicherungen über **alle** Zielfelder in 5/6/7 und für Zusicherungsgruppe (d) in Aufgabe 8 |
| **5** | „**Kein externer API-Konsument** … Daraus folgt Entscheidung 13 und mit ihr B16: **`api_tokens` existiert im Ziel nicht.**" | **trägt.** Der Importer führt **fünf** Zieltabellen, nicht sechs. Das ist eine **Festlegung**, keine Ablesung (W4) — es steht nirgends ein ⬜ dafür |
| **8** | „**Die lokale `radio-admin/data/data.sqlite` ist als Beleg unbrauchbar:** leer und vorbaselinig … **Alles Bestandsbezogene ist ein Runbook-Schritt gegen den echten Dump, nie eine Zahl aus dieser Datei** — und sie ist auch keine Fixture (die Fixture ist die DDL aus `radio-admin/server/drizzle/`, Kapitel 1 §1.8)." | **trägt.** Sie ist der Auftrag von Aufgabe 1: die Fixture ist die **zeichengleiche Kopie der fünf Alt-Migrationen**, nicht ein nachgeschriebenes Schema |
| **9** | „**Das `lagerbuch`-Import-Skript ist NICHT im Repo.** … **Das ist kein Vorbild, dem zu folgen wäre.**" — mit der Fünferliste, aus der stattdessen abgeleitet wird | **trägt.** Betroffen sind: die Schnappschussform `.backup` (Aufgabe 17), die Zählzeile (Aufgabe 16), die Aufrufform mit **einem** positionalen Argument (16, 17) und die Abschlusszeile ⬜ **L6**. **Wer das `lagerbuch`-Skript findet, prüft diese fünf Zeilen gegen es** |
| 1 | Kein Parallelfenster; der Alt-Kiosk läuft schon heute unter `radio.iuk-ue.de`, der Origin bleibt zeichengleich | → Cutover-Leitplan |
| 2 | Beide Domains ziehen im **selben** Fenster um; der Kiosk spricht über sechs `/v1`-Routen | → Cutover-Leitplan |
| 4 | Die 2-Monats-Retention wird übernommen, aber **nicht** als Sofort-Purge beim Boot (B5: Erstlauf 1440 Minuten) | → Cutover-Leitplan (A8, Abfrage R) |
| 6 | `AdminUser` aus `radio-inventar` wandert nicht (Entscheidung 14) | → Cutover-Leitplan (§5, P3) |
| 7 | Der Service Worker des Alt-Kiosk überlebt den Umschwenk | → Cutover-Leitplan (§4.7) |

### Die Vorgaben, die bei jeder Aufgabe gelten

* **Kommandos, alle mit `rtk` präfixt, auch in Ketten mit `&&`:** `rtk pnpm typecheck` ·
  `rtk pnpm lint` · `rtk pnpm vitest run` · `rtk pnpm build` · `rtk pnpm exec playwright test`.
* **Nach jeder Aufgabe:** `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run` grün, dann
  committen. **Einzige Ausnahme: der Block 8–13** — er hat genau ein Tor, nach Aufgabe 13 (Naht NS3).
  Ein Torlauf, der nicht gelaufen ist, ist kein grüner Torlauf.
* **`pnpm build` und Playwright werden von diesem Weg nicht berührt** — er fasst kein `src/app/**`
  an. Sie laufen einmal vor dem Merge.
* **Zeit ist Unix-SEKUNDEN im Ziel und epoch-MILLISEKUNDEN in der Quelle.** Nie über die
  Einheitengrenze vergleichen, ohne den Faktor im Ausdruck sichtbar zu lassen. Die schärfste
  Formulierung im Haus: `src/app/m/lagerbuch/_db/schema.ts:11-16`; sie nennt Copy-Paste aus
  `m/qr/_db/schema.ts:19-20` als den wahrscheinlichsten Weg in den Fehler. **Keine Zeitspalte des
  Ziels trägt `mode: "timestamp_ms"`.**
* **Spalten werden namentlich gelesen, nie über eine Position** — kein `SELECT *`, kein
  Destructuring nach Reihenfolge (§1.2). ⚠️ Das nächste Vorbild im Repo bricht diese Regel:
  `scripts/import/feedback.ts:66-72` liest fünfmal `SELECT * FROM …`. **Diesem Vorbild wird nicht
  gefolgt** (Spec 1 §2.8.1, `docs/runbooks/lagerbuch-cutover.md:30-31`).
* **Die SQL-Spaltennamen bleiben zeichengleich zur Quelle** (`issi`, `loanable`,
  `snapshot_call_sign`), obwohl die jüngeren Suite-Module deutsch benennen: 61 zuzuordnende
  Spalten, jede Umbenennung eine Verwechslungsgelegenheit (Spec 1 §2.5,
  `docs/radio-portierung-analyse.md:743-747`).
* **`getModuleDb()` wird in Tests NICHT benutzt.** Sein Cache ist per Modulschlüssel gekeyt, nicht
  per `DATA_DIR` (`src/core/db/index.ts:31-35`), und gäbe zwischen Tests ein stale Handle auf die
  alte Datei zurück — der Grund steht ausgeschrieben in `scripts/import/portal.test.ts:23-25`.
  Tests bauen ihre Ziel-DB selbst und migrieren sie (`portal.test.ts:26-32`,
  `feedback.test.ts:160-166`).
* **`pnpm test` sammelt `scripts/**` MIT.** Gemessen; der Kommentar `vitest.config.ts:4-5` („only
  collects the unit tests under src/") ist **falsch** und darf nicht als Grund für eine
  Konfigurationsänderung genommen werden. ⚠️ **Dieser Weg ändert `vitest.config.ts` nicht.**
* **`tsc` sammelt `scripts/**` ebenfalls MIT.** `tsconfig.json:25` öffnet
  `"include": [`, `:27` führt darin `"**/*.ts",`, und `:33` schließt mit
  `"exclude": ["node_modules"]` nur `node_modules` aus. Das ist der
  Beleg unter Naht **NS3** — ein Typfehler in `scripts/import/` ist ein rotes `pnpm typecheck`.
* **Kein Worktree unter `.claude/worktrees/`** — das Verzeichnis liegt im Repo und vergiftet die
  Prüfungstore (`vitest.config.ts:8-34`: 251 Fremdfehlschläge, gemessen). Und **kein `pnpm build`
  vor einem Testlauf, den man ernst nimmt**: `.next/standalone/src/` ist eine vollständige Kopie des
  Quellbaums **inklusive Testdateien** und migriert parallel dieselben `.data/`-Pfade (52
  Fehlschläge, ebenda). Und **kein `pnpm dev` parallel zur Testsuite**.
* **Belegpflicht.** Jede Behauptung in einem Kommentar oder einer Runbook-Zeile nennt
  `datei:zeile`. Wo eine Zahl, ein Name oder eine Ausgabe erst der Bau oder der Server hergibt,
  steht eine **benannte Leerstelle**, nie eine plausibel aussehende Erfindung. Der Präzedenzfall ist
  vernarbt: die `lagerbuch`-Spec verlangte ein `cookies().delete()` in einer Server Component, wo es
  **wirft**.
* **Deutsch, mit korrekten Umlauten**, in Prosa und in Kommentaren. **In TypeScript-Bezeichnern und
  in Testnamen keine Umlaute** (Hausform: `paritaetsSichtGeraet`, `msZuDatum`, `tagInBerlin`).
  ⚠️ **Und niemals in einem zitierten Wert.** Die vorläufige Abschlusszeile heißt
  `Radio-Import OK — <n> Zeilen, Paritaet gruen.` — **ohne Umlaut**. Genau dieser Unterschied zu
  `feedback.ts:280` (`Parität grün`) **ist** der Gegenstand von ⬜ L6: ein Runbook, das auf
  `Parität grün` greppt, findet `Paritaet gruen` nicht. Wer die Zeile „verschönert", zerstört den
  Grep-Anker.
* **Commits müssen signiert sein** (main-Ruleset), sonst blockiert der Merge trotz grüner CI.

---

## Die Reihenfolge

Alle Aufgaben beider Teile, durchgehend numeriert. **Die Schritte selbst bleiben im Teil** — hier
steht nur, was wann dran ist, worauf es wartet und was es liefert.

| Nr | Aufgabe | Teil und Ankerüberschrift | wartet auf | liefert |
|---|---|---|---|---|
| **1** | Die Quell-DDL als Fixture, mit dem Riegel auf ihre Spaltenreihenfolge | T1 `## Aufgabe 1: Die Quell-DDL als Fixture, mit dem Riegel auf ihre Spaltenreihenfolge` | **V-A** (`radio-admin@265abd5`, gemessen vorhanden) | `scripts/import/fixtures/radio-quelle-ddl.sql` · `baueQuellDb`, `spieleQuellFixtureEin` · die Zusicherung `devices.tei` steht an Position 25 |
| **2** | Die Rohzeilen der Fixture und der Riegel gegen wiederverwendete Zeitwerte | T1 `## Aufgabe 2: Die Rohzeilen der Fixture und der Riegel gegen wiederverwendete Zeitwerte` | 1 | `scripts/import/fixtures/radio-quelle.ts` · `ALLE_QUELLZEILEN`, `ALT_VERSION_ZWEIT`, `baueBespielteQuellDb` · die Zusicherung „kein Millisekunden-Wert steht unter zwei verschiedenen Feldern" |
| **3** | Die Zeitachse und die zwei Faltungsriegel — reine Funktionen | T1 `## Aufgabe 3: Die Zeitachse und die zwei Faltungsriegel — reine Funktionen` | 2 | `msZuDatum`, `msZuDatumOptional`, `tagInBerlin`, `zuBoolOptional`, `EREIGNIS_QUELLEN`, `pruefeQuelle` |
| **4** | `lieseQuelle` — fünf namentliche `SELECT`s, fünf Quelltypen, ein Quelltext-Scan | T1 ``## Aufgabe 4: `lieseQuelle` — fünf namentliche `SELECT`s, fünf Quelltypen, ein Quelltext-Scan`` | 3 | `AltNutzer`, `AltVersion`, `AltGeraet`, `AltEreignis`, `AltLeihe` · `RadioQuelle` · `lieseQuelle(quellDb)` |
| — | **⟵ Hier liegt der Bau von Spec 1. Die einzige Naht des Gesamtwegs.** | — | ⬜ L1 · Spec 1 §2.5 / §2.6 / §2.9 | `src/app/m/radio/_db/schema.ts`, `_db/migrations/`, das Registrierungsdreieck |
| **5** | `toNeuesGeraet` — 25 Felder, der Faktor 1000, die zwei 0/1-Integer, der Berliner Tag | T1 ``## Aufgabe 5: `toNeuesGeraet` — 25 Felder, der Faktor 1000, die zwei 0/1-Integer, der Berliner Tag`` | 4 · ⬜ **L1** · Spec 1 §2.5.1 | `toNeuesGeraet` · **zwei der drei tragenden Tests** (§1.10 Nr. 1 und Nr. 3) |
| **6** | Die drei schmalen Mapper: `users`, `software_versions`, `device_events` | T1 ``## Aufgabe 6a: Die drei schmalen Mapper — `users`, `software_versions`, `device_events` `` | 5 · ⬜ **L1** · Spec 1 §2.5.2–§2.5.4 | `toNeuenBenutzer`, `toNeueSoftwareVersion`, `toNeuesGeraeteEreignis` |
| **7** | `toNeueLeihe` — 12 Zielfelder, vier Zeitstempel, `zugangscodeId` immer `null` | T1 ``## Aufgabe 6b: `toNeueLeihe` — 12 Zielfelder, vier Zeitstempel, `zugangscodeId` immer `null` `` | 6 · ⬜ **L1** · Spec 1 §2.5.5 | `toNeueLeihe` |
| **8** | Der Vollständigkeitstest der Paritätssichten — er kommt zuerst | T2 `### Aufgabe 1: Der Vollstaendigkeitstest der Paritaetssichten — er kommt zuerst` | 7 · Spec 1 §2.5. **⚠️ Beginn des Blocks 8–13. Rot bis 13 — das ist ihr Zweck** (Naht NS3) | `scripts/import/radio-paritaet.test.ts` mit **sechs** Zusicherungsgruppen (a)–(f) |
| **9** | Die Sichtgrundlage: `sekunden`, `RadioDb`, `paritaetsSichtGeraet`, das getaggte Multiset, `checkRadioParitaet` | T1 ``## Aufgabe 7: Die fünf Paritätssichten, das getaggte Multiset, `checkRadioParitaet` `` — **Schritt 3 entfällt** (Naht NS1), **Schritt 6 wandert hinter Aufgabe 13** (Naht NS3) | 8 · ⬜ **L1** · ⬜ **L3** | `RadioDb` · der lokale Helfer `sekunden` · `paritaetsSichtGeraet` · `getaggteQuellzeilen`, `getaggteZielzeilen` · `checkRadioParitaet` |
| **10** | `paritaetsSichtBenutzer` — `users`, 3 Spalten | T2 ``### Aufgabe 2: `paritaetsSichtBenutzer` — `users`, 3 Spalten`` | 9 (wegen `sekunden`, Naht NS4) · ⬜ **L1** · Spec 1 §2.5.3 | `paritaetsSichtBenutzer` |
| **11** | `paritaetsSichtSoftwareVersion` — `software_versions`, 6 Spalten | T2 ``### Aufgabe 3: `paritaetsSichtSoftwareVersion` — `software_versions`, 6 Spalten`` | 10 · Spec 1 §2.5.2 | `paritaetsSichtSoftwareVersion` (mit `sortOrder ?? 0`, `isTarget ?? false`) |
| **12** | `paritaetsSichtGeraeteEreignis` — `device_events`, 8 Spalten | T2 ``### Aufgabe 4: `paritaetsSichtGeraeteEreignis` — `device_events`, 8 Spalten`` | 11 · Spec 1 §2.5.4 | `paritaetsSichtGeraeteEreignis` |
| **13** | `paritaetsSichtLeihe` — `loans`, 12 Spalten (11 aus der Quelle, eine neu) | T2 ``### Aufgabe 5: `paritaetsSichtLeihe` — `loans`, 12 Spalten (11 aus der Quelle, eine neu)`` | 12 · Spec 1 §2.5.5 | `paritaetsSichtLeihe` · **⛔ das gemeinsame Tor des Blocks 8–13 und der gemeinsame Commit** |
| **14** | `importiereRadio` — Einfügereihenfolge, Konfliktstrategien, Paritäts-Rundlauf | T1 ``## Aufgabe 8: `importiereRadio` — Einfügereihenfolge, Konfliktstrategien, Paritäts-Rundlauf`` | 13 · Spec 1 §2.6 / §2.9.1 | `importiereRadio(quelle, db)` · `RadioTx` · `frischeZielDb` |
| **15** | Die vier asymmetrischen Idempotenzfälle A · B · C · D | T1 `## Aufgabe 9: Die vier asymmetrischen Idempotenzfälle A · B · C · D` | 14 · ⬜ **L2** (verengt, gemessen) | **der dritte tragende Test** (§1.10 Nr. 2) · die Strukturprobe auf `loans_device_active_uidx` |
| **16** | `runRadioImport`, die Zählzeile, die Transaktion, der CLI-Block | T1 ``## Aufgabe 10: `runRadioImport`, die Zählzeile, die Transaktion, der CLI-Block`` | 15 · ⬜ **L6** · Spec 1 §2.9 (Registrierungsdreieck) | `runRadioImport(quellPfad)` · die Zählzeile · die Abschlusszeile (⬜ L6, vorläufig) |
| **17** | Abnahme von Hand — der Trockenlauf über die Kommandozeile | T1 `## Aufgabe 11: Abnahme von Hand — der Trockenlauf über die Kommandozeile` | 16 | Die abgelesene Abschlusszeile **und** der Exit-Code, protokolliert · die Meldung von ⬜ L6 an die Runbook-Planteile |

**Prüfung der Reihenfolge-Invariante:** keine Aufgabe wartet auf das Ergebnis einer später
numerierten — **mit einer benannten Ausnahme auf Blockebene**: Aufgabe 8 ist per Bauart rot, bis 13
fertig ist. Das ist die TDD-Folge, nicht eine Verletzung; deshalb ist 8–13 als **ein Block mit einem
Tor** geführt und nicht als sechs Aufgaben mit sechs Toren (Naht **NS3**).

**Lückenprüfung, Aufgabe für Aufgabe.** T1 zählt **elf Nummern** (1–11), aber Nummer 6 ist in `6a`
und `6b` geteilt — also **zwölf** Aufgaben. Hier sind es die Nummern **1, 2, 3, 4, 5, 6, 7, 9, 14,
15, 16, 17** = zwölf. T2 Teil A zählt **fünf** Aufgaben (1–5); hier sind es **8, 10, 11, 12, 13** =
fünf. **12 + 5 = 17.** Keine Aufgabe eines zugehörigen Teils fehlt, keine ist doppelt geführt, und
keine Nummer dieses Leitplans ist unbesetzt.

---

## Nahtstellen

Was zwischen den zwei Teilen doppelt, verschieden benannt oder widersprüchlich ist. **Je Fall: was
T1 sagt, was T2 sagt, was gilt, und warum.** Das ist der Teil dieses Dokuments, in dem entschieden
und nicht referiert wird.

### NS1 — Der Vollständigkeitstest steht zweimal ⛔ tragend

**T1** schreibt ihn in `scripts/import/radio.test.ts`, als Aufgabe 7 Schritt 3
(`2026-08-18-plan1-radio-import.md:1905–1958`): `it("jede Paritaetssicht traegt JEDE Spalte ihrer Zieltabelle — keine
Auswahl")`, mit drei zusätzlichen `import`-Zeilen am Kopf der Datei und einer Schlüsselmengen-Probe
über `getTableColumns`. **T2** schreibt ihn in der neuen Datei
`scripts/import/radio-paritaet.test.ts`, als Aufgabe 1 (`2026-08-18-plan2-radio-paritaet.md:110–332`), mit **sechs**
Zusicherungsgruppen: (a) Spaltenvollständigkeit, (b) jede `timestamp`-Spalte verlässt die Sicht als
Sekundenzahl, (c) `null` bleibt `null`, (d) **keine** Zeitspalte ist `mode: "timestamp_ms"`,
(e) `devices.last_updated_at` ist TEXT und läuft unumgerechnet durch, (f) die Spaltenzahlen
25 / 6 / 3 / 8 / 12.

**Entschieden: T2s Fassung gilt. T1 Aufgabe 7 Schritt 3 entfällt vollständig, samt seiner drei
`import`-Zeilen am Kopf von `radio.test.ts`.**

**Warum, und es ist nicht Geschmack:** T1s Fassung prüft **nur** (a). Gruppe (d) misst die Einheit
über `col.mapToDriverValue(new Date(1_000_000_000_000))` — `1000000000` bei `timestamp`,
`1000000000000` bei `timestamp_ms` — **weil `columnType` beide Modi als `"SQLiteTimestamp"`
zurückgibt** und sie damit nicht unterscheidet (gemessen gegen drizzle-orm 0.45.2,
`2026-08-18-plan2-radio-paritaet.md:141–146`). Ein `timestamp_ms` im Zielschema ist der Faktor-1000-Fehler in seiner
leisesten Form: paritätsgrün, weil beide Arme durch dieselbe Sicht laufen (Randbedingung 3). **T1s
Fassung sähe genau den Fehler nicht, gegen den sie gebaut ist.**

⚠️ **Eine Folgezeile in T1 verliert damit ihren Gegenstand:** T1 Aufgabe 7 Schritt 3 warnt, die
Zeile `import * as radioSchema from "@/app/m/radio/_db/schema";` stehe danach am Kopf von
`radio.test.ts` und werde „in Aufgabe 8 nicht noch einmal" geschrieben (`2026-08-18-plan1-radio-import.md:1912–1915`).
Mit dem Entfall von Schritt 3 steht sie dort **nicht** — und T1 Aufgabe 8 baut darauf:
`2026-08-18-plan1-radio-import.md:2094` schreibt die Zeile als Kommentar „`// steht seit Aufgabe 7 am Kopf`" hin und
benutzt `radioSchema` danach in beiden Folgeaufgaben durchgehend (`2026-08-18-plan1-radio-import.md:2109`, `:2114`,
`:2133–2137`, `:2159–2161`, `:2179`, `:2209`; in T1 Aufgabe 9 weiter `:2352`–`:2531`).

**Verbindlich: Aufgabe 14 dieses Leitplans (T1 Aufgabe 8) schreibt
`import * as radioSchema from "@/app/m/radio/_db/schema";` selbst an den Kopf von
`scripts/import/radio.test.ts`.** Die Warnung vor `Cannot redeclare block-scoped variable
'radioSchema'` (`2026-08-18-plan1-radio-import.md:1915`) ist mit dem Entfall von Schritt 3 gegenstandslos. ⚠️ **Nicht
verwechseln mit dem gleichnamigen Fund in `2026-08-18-plan1-radio-import.md:1461`** — der betrifft den Alias `schema` in
`scripts/import/radio.ts`, eine andere Datei und einen anderen Namen; er bleibt in Kraft.

### NS2 — Die vier übrigen Sichten: Delegation, nicht Doppelung

**T1** Aufgabe 7 Schritt 5 schreibt `paritaetsSichtGeraet` mit allen 25 Feldern aus und lässt die
vier übrigen als Kommentar offen: „`paritaetsSichtBenutzer` (3), `paritaetsSichtSoftwareVersion`
(6 …), `paritaetsSichtGeraeteEreignis` (8), `paritaetsSichtLeihe` (12 …) folgen demselben Muster"
und darüber „⬜ L3: die vier uebrigen Sichten sind hier NACH DEM ABGELESENEN SCHEMA zu
vervollstaendigen" (`2026-08-18-plan1-radio-import.md:1986`, `:2018–2022`). **T2** schreibt sie in den Aufgaben 2–5 als
echten Code aus, je Sicht mit Spaltenliste, Herkunftsbeleg und eigenem Testlauf.

**Entschieden: T2 gilt. Es ist kein Widerspruch, sondern eine Delegation** — T1 lässt eine Lücke
und benennt sie, T2 füllt sie. **Was T1 Aufgabe 7 behält:** `RadioDb`, `sekunden`,
`paritaetsSichtGeraet`, `getaggteQuellzeilen`, `getaggteZielzeilen`, `checkRadioParitaet`. Nichts
davon steht in T2. **Beide Teile schreiben in dieselbe Datei `scripts/import/radio.ts`; sie
schreiben aber nirgends dieselbe Funktion.** T2 sagt es selbst: „Alles Uebrige in dieser Datei
gehoert dem Kapitel-1-Planteil" (`2026-08-18-plan2-radio-paritaet.md:2004`).

### NS3 — Ein Block, ein Tor: die Aufgaben 8–13 ⛔ tragend

**T2** gibt jeder seiner Aufgaben 2–5 ein eigenes Tor und einen eigenen Commit (je Schritt 4:
`rtk pnpm typecheck && rtk pnpm lint`, dann `git commit`), und erwartet je Aufgabe einen
teilgrünen Testlauf — Aufgabe 2 Schritt 3: „Erwartung: **vier gruene Faelle** für `users` … Die
uebrigen vier Tabellen bleiben rot" (`2026-08-18-plan2-radio-paritaet.md:392–397`). **T1** gibt Aufgabe 7 ebenfalls ein
eigenes Tor (Schritt 6).

**Entschieden: die Aufgaben 8–13 sind EIN Block mit EINEM Tor, nach Aufgabe 13.** Die Zwischentore
in T2 Aufgaben 2–4 (je Schritt 4) und das Tor in T1 Aufgabe 7 (Schritt 6) entfallen als eigene
Tore; T2 Aufgabe 5 Schritt 4 wird das Blocktor, und sein `git add` trägt **beide** Dateien
(`scripts/import/radio.ts` **und** `scripts/import/radio-paritaet.test.ts`).

**Warum — und das ist eine mechanische Aussage, keine Vorliebe:**

1. **T2 widerspricht sich an dieser Stelle selbst.** Aufgabe 2 Schritt 1 sagt die Fehlerform des
   roten Laufs voraus: `No "paritaetsSichtBenutzer" export is defined` (`2026-08-18-plan2-radio-paritaet.md:360`) — das
   ist ein **Link**fehler des ganzen Moduls, kein fehlgeschlagener Fall. Die Testdatei importiert
   **alle fünf** Sichten namentlich aus `./radio` (`2026-08-18-plan2-radio-paritaet.md:174–181`). Solange auch nur eine
   davon fehlt, lädt die Datei **gar nicht** — dann kann Schritt 3 derselben Aufgabe nicht „vier
   gruene Faelle für `users`" liefern. **Beides kann nicht zugleich wahr sein.**
2. **Auch das `typecheck`-Tor kann dazwischen nicht grün sein.** `tsconfig.json:25,:27` setzt
   `"include": [ … "**/*.ts", … ]`, `tsconfig.json:33` schließt nur `node_modules` aus —
   `scripts/import/**` läuft also durch `tsc`. Ein namentlicher Import auf einen noch nicht
   existierenden Export ist dort ein Fehler. Dasselbe gilt in die andere Richtung: T1 Aufgabe 7s
   `getaggteQuellzeilen` (`2026-08-18-plan1-radio-import.md:2024`) und `getaggteZielzeilen` (`:2034`) rufen **alle fünf**
   Sichten auf und kompilieren erst, wenn die vier aus T2 geschrieben sind.

**Die verbindliche innere Ordnung des Blocks:** 8 (Testdatei anlegen, rot) → 9 (T1 Aufgabe 7,
Schritte 1, 2, 4, 5) → 10 → 11 → 12 → 13 → **Tor und Commit**. Die `-t`-Läufe in T2 Aufgaben 2–4
Schritt 3 bleiben nützlich, aber ihre Erwartung ist zu berichtigen: **bis Aufgabe 13 lesen sie den
Importfehler, nicht eine verletzte Zusicherung.** Die erste sinnvolle grüne Lesung des Tests ist
nach Aufgabe 13.

### NS4 — `sekunden`: eine Funktion, ein Ort, und daher eine Reihenfolge

**T1** definiert sie in Aufgabe 7 Schritt 5, als **lokale, nicht exportierte** Konstante in
`scripts/import/radio.ts`: `const sekunden = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);`
(`2026-08-18-plan1-radio-import.md:1984`). **T2** benutzt sie in allen vier Sichten und schreibt sie ausdrücklich nicht:
„der lokale Helfer `sekunden` steht dort bereits aus Spec 1 §2.2.4" (`2026-08-18-plan2-radio-paritaet.md:340`,
`:345–346`).

**Kein Widerspruch — beide Fassungen sind zeichengleich, und T2s Herkunftsangabe stimmt:** Spec 1
schreibt die Zeile wörtlich aus, `docs/superpowers/specs/2026-08-17-radio-modul-design.md:1006`,
benutzt in `:1002-1003`. Sie ist zugleich zeichengleich `tsSeconds` aus `scripts/import/portal.ts:69-71`
mit deutschem Namen.

**Was daraus folgt und in keinem der zwei Teile steht: die Reihenfolge.** T2s Satz „steht dort
bereits" wird erst wahr, **nachdem** T1 Aufgabe 7 gelaufen ist. **Deshalb steht Aufgabe 9 vor den
Aufgaben 10–13** und nicht dahinter. Wer den Block anders herum fährt, muss `sekunden` ein zweites
Mal schreiben — und zwei Definitionen derselben Zeitfunktion in derselben Datei sind genau der
Fehlertyp, gegen den dieser ganze Weg gebaut ist.

⚠️ **Nachtrag zu T1s Zusagentabelle:** sie führt `msZuDatum`, `msZuDatumOptional`, `tagInBerlin`,
`zuBoolOptional`, `EREIGNIS_QUELLEN`, `pruefeQuelle` — **`sekunden` fehlt dort**
(`2026-08-18-plan1-radio-import.md:2903–2918`). Sie ist trotzdem eine Zusage von T1 an T2. **Wer sie umbenennt oder
verschiebt, bricht die Aufgaben 10–13.**

### NS5 — Der Rückgabetyp der Sichten

**T1** annotiert: `export function paritaetsSichtGeraet(r: schema.NeuesGeraet | schema.Geraet): Row`
(`2026-08-18-plan1-radio-import.md:1987`). **T2** annotiert im **Code** nicht:
`export function paritaetsSichtBenutzer(r: NeuerBenutzer | Benutzer) {` (`2026-08-18-plan2-radio-paritaet.md:376`,
ebenso `:535` und die beiden übrigen), und verspricht in seiner Zusagentabelle konkrete Feldtypen
(`lastUpdatedAt` ist `string | null`, alle Zeitfelder `number | null`, `2026-08-18-plan2-radio-paritaet.md:2006`).
⚠️ **T2s eigene „Liefert"-Zeilen schreiben den Typ dagegen wie eine Annotation hin** — etwa
`2026-08-18-plan2-radio-paritaet.md:348`: `… (r: NeuerBenutzer | Benutzer): { sub: string; name: string; lastSeenAt: number | null }`,
ebenso `:497`. **Sie beschreiben den abgeleiteten Typ, sie verlangen keine geschriebene
Annotation** — der Code zwei Bildschirme darunter hat keine.

**Entschieden: T2s Form gilt, für alle fünf Sichten. `paritaetsSichtGeraet` verliert seine
`: Row`-Annotation.**

**Warum:** `Row` ist `Record<string, unknown>` (`scripts/import/parity.ts:3`). Die Annotation
löschte genau die Feldtypen, die T2 nach außen zusagt — und sie ist **nicht** die Hausform: das
nächste Vorbild im Repo, `scripts/import/portal.ts:81`, schreibt
`export function parityView(r: schema.NewService | schema.Service) {` **ohne** Rückgabetyp. Die
Zuweisung an `Row[]` bleibt gültig, weil jedes Objektliteral auf `Record<string, unknown>` passt.
Spec 1 §2.2.4 gibt keinen Rückgabetyp vor; die ⬜-L1-Zeile des Rahmens zitiert die Signatur als
`paritaetsSichtGeraet(r: NeuesGeraet | Geraet)` — **ohne** `: Row` (Spec 2:96).

**Umgekehrt bleibt `: Row[]` stehen**, wo T1 es setzt: `getaggteQuellzeilen(q: RadioQuelle): Row[]`
und `getaggteZielzeilen(db: RadioDb): Row[]`. Auch das ist die Hausform —
`scripts/import/feedback.ts:238` (`taggedRows(...): Row[]`) und `:248`
(`taggedTargetRows(...): Row[]`).

### NS6 — Die neuen N-Nummern: ⬜ N2 entfällt, ⬜ N1 gehört nicht hierher

**T1** vergibt ausdrücklich **keine** N-Nummer und begründet es in drei Klassen; Klasse 2
(„Ableitbar, nicht ablesbar") nennt „die Tabellen- und Spaltennamen des Ziels (Spec 1 §2.5 schreibt
sie vollständig aus, inklusive `export const devices = sqliteTable(…)`)" (`2026-08-18-plan1-radio-import.md:2937–2940`).
**T2** vergibt **N2** für genau diese Namen: „Die **Export-Namen der fuenf Tabellenobjekte** in
`schema.ts` … die Quellnamen, aber als Export nirgends gesetzt" (`2026-08-18-plan2-radio-paritaet.md:83`).

**Entschieden: T1 gilt. ⬜ N2 entfällt.** Nachgeschlagen in Spec 1: die fünf Tabellenobjekte stehen
dort alle als `export const` ausgeschrieben —
`docs/superpowers/specs/2026-08-17-radio-modul-design.md:1206` (`export const devices = sqliteTable("devices", {`),
`:1254` (`softwareVersions`), `:1298` (`users`), `:1311` (`deviceEvents`), `:1349` (`loans`).
**T2s Befund „als Export nirgends gesetzt" ist am Text von Spec 1 widerlegt.** Die Abhängigkeit
bleibt bestehen — sie heißt aber **„Spec 1 §2.5"** (so führt T1s Sperrtafel sie,
`2026-08-18-plan1-radio-import.md:112`) und nicht „N2". Eine Nummer weniger in der Liste, die nach dem Bau abgearbeitet
wird, ist eine echte Ersparnis: jede Nummer darin kostet eine Ablesung.

Die Ablesung **„Hält der reguläre Stack `radio.db` nach dem Boot dauerhaft offen?"** (T2 führt sie
als ⬜ **N1**, `2026-08-18-plan2-radio-paritaet.md:87`) betrifft **§L** und **§4.5 Schritt 4** — Runbook. Sie **gehört in
den Cutover-Leitplan** und wird von diesem Leitplan nicht geführt. ⚠️ **Wer ihr dorthin folgt,
sucht sie am Klartext, nicht an der Nummer:** der Cutover-Leitplan führt seine Leerstellen unter
**eigener** N-Numerierung, und die ist nicht die von T2.

### NS7 — Zwei Testdateien, und die Zahl „elf"

**T2** begründet die neue Datei `radio-paritaet.test.ts` damit, Spec 1 §2.2.5 setze für
`radio.test.ts` **elf verbindliche Testnamen**, und „ein zwoelfter Block in derselben Datei wuerde
die Zahl ‚elf' unbrauchbar machen" (`2026-08-18-plan2-radio-paritaet.md:105–108`). ⚠️ **T1** legt in `radio.test.ts`
bereits ein `describe("Paritaet (Spec 2 §1.5.2)", …)` mit drei `it(...)` an (Aufgabe 7 Schritt 2,
`2026-08-18-plan1-radio-import.md:1868–1903`) — die Begründung ist damit an ihrer eigenen Prämisse vorbei.

**Entschieden: die Trennung in zwei Dateien bleibt, die Begründung wird berichtigt.** Die „elf" aus
Spec 1 §2.2.5 sind die **Mapper**-Testnamen (T1s Selbstprüfung ordnet sie den Aufgaben 3, 5, 6a und
6b zu, `2026-08-18-plan1-radio-import.md:2963`), nicht die Zahl aller `it(...)` in der Datei. Die Trennung trägt aus
einem anderen, härteren Grund: **zwei Planteile, zwei Dateien, kein gemeinsamer Schreibzugriff auf
dieselbe Testdatei** — und mit NS1 ist `radio-paritaet.test.ts` der einzige Ort des
Vollständigkeitstests. **Wer die Zahl „elf" prüfen will, zählt die Mapper-Testnamen, nicht die
Datei.**

### NS8 — `devices.last_updated_at`: doppelt geprüft, und das bleibt so

**T1** prüft es am Mapper-Ergebnis: Regel 3 („`devices.lastUpdatedAt` wird NICHT umgerechnet — es
ist `text` (`YYYY-MM-DD`), `?? null`", `2026-08-18-plan1-radio-import.md:1855`), der Test
`it("paritaetsSichtGeraet laesst lastUpdatedAt unumgerechnet als Text stehen")` mit den Sollwerten
`"2025-03-02"` und `null` (`2026-08-18-plan1-radio-import.md:1879–1881`), und der Mapper selbst über
`tagInBerlin("devices.last_updated_at", zeile.last_updated_at)` (`2026-08-18-plan1-radio-import.md:1488`). **T2** prüft
es am Schematyp: Zusicherungsgruppe (e), `expect(sp.lastUpdatedAt.columnType).toBe("SQLiteText")`
und der Durchlauf unumgerechnet (`2026-08-18-plan2-radio-paritaet.md:284–291`), plus die Zusage
`lastUpdatedAt` ist `string | null`.

**Kein Widerspruch — und die Doppelung ist erwünscht, sie bleibt.** Die zwei Prüfungen decken
verschiedene Fehlfälle: T1 fängt einen Mapper, der den falschen Tag rechnet; T2 fängt ein
**Schema**, in dem die Spalte kein `text` mehr ist. Ein Ausbau einer der beiden erzeugte eine
stille Hälfte. **In beiden Teilen bleibt `devices.last_updated_at` unumgerechnet** — das ist
Bedingung (c) von ⬜ L3 (Spec 2:98).

### NS9 — Die Sekundenumrechnung ist an beiden Stellen dieselbe Funktion

Geprüft, kein Widerspruch: **jede** `mode: "timestamp"`-Spalte läuft auf beiden Armen durch
`sekunden()` — T1 als Regel 2 der fünf Sichten (`2026-08-18-plan1-radio-import.md:1852-1854`) und im Code
(`2026-08-18-plan1-radio-import.md:2011-2012`), T2 in allen vier Sichten (`2026-08-18-plan2-radio-paritaet.md:380`, `:459`, `:543`,
`:629-634`). Die **Gegen**richtung (Quelle → `Date`) gehört ausschließlich T1: `msZuDatum`,
`msZuDatumOptional`, `tagInBerlin`, `MS_MIN`/`MS_MAX` — T2 sagt ausdrücklich zu, sie nicht zu
schreiben (`2026-08-18-plan2-radio-paritaet.md:2010`). **Zwei Richtungen, zwei Funktionsfamilien, ein Eigentümer je
Familie.**

### NS10 — ⬜ L6 steht nirgends als gesetzte Zeichenkette

Geprüft über beide Teile: die Abschlusszeile taucht in T1 an vier Stellen auf
(`2026-08-18-plan1-radio-import.md:2624`, `:2680`, `:2777`, `:2920`), **jedes Mal in Sichtweite einer ⬜-L6-Markierung**
(`:2616`, `:2634`, `:2782`, `:2919`), und die Zusagentabelle beschriftet sie ausdrücklich als
**„(⬜ L6, vorläufig)"**. T2 nennt sie überhaupt nicht. **Kein Fund.**

**Was gilt:** bis L6 abgelesen ist, wird die Zeile aus §1.5.3 zeichengleich übernommen —
`Radio-Import OK — <n> Zeilen, Paritaet gruen.`, **ohne Umlaut**. Aufgabe 16 führt die
Protokollzeile für **Zeile und Grep-Anker**, Aufgabe 17 nimmt zusätzlich den **Exit-Code** ab
(`docs/runbooks/portal-cutover.md:33` prüft beides). ⚠️ **Die abgelesene Zeile ist zu melden, nicht
still zu nehmen** — sie geht an die Runbook-Planteile, die auf sie greppen.

### NS11 — Auseinanderlaufende Global Constraints: die Vereinigung gilt

**T1** führt zwei Vorgaben, die T2 nicht hat: `rtk pnpm exec playwright test` in der Kommandoliste
und **„Commits müssen signiert sein"** (main-Ruleset). **T2** führt zwei, die T1 nicht hat: **„kein
`pnpm build` vor einem Testlauf, den man ernst nimmt"** (`.next/standalone/src/` ist eine
vollständige Kopie des Quellbaums inklusive Testdateien und migriert parallel dieselben
`.data/`-Pfade — 52 Fehlschläge, `vitest.config.ts:8-34`) und die ausdrückliche Zusicherung, **keine
Zeitspalte trage `mode: "timestamp_ms"`**.

**Entschieden: die Vereinigung gilt**, und sie steht oben unter „Globale Randbedingungen"
ausgeschrieben. Kein Planteil darf eine Vorgabe des anderen unterlaufen; die vier genannten sind
alle vier belegt und keine widerspricht einer anderen.

---

## Sperren

**Solange hier eine Zeile offen ist, beginnt die zugehörige Aufgabe nicht.** Jede Zeile ist eine
**Ablesung**, keine Entscheidung — es ist ausdrücklich erlaubt und besser, hier eine benannte
Leerstelle zu führen als eine prüfbar aussehende Erfindung (Hausform:
`docs/runbooks/files-cutover.md:39-58`, „Betriebswerte werden nicht erfunden. … Ein Platzhalter aus
einer anderen Maschine ist kein Wert").

| Nummer | Was abzulesen ist | Quelle | Welche Aufgaben warten |
|---|---|---|---|
| **⬜ L1** | Die **zehn** Typaliase, die `src/app/m/radio/_db/schema.ts` exportiert. Spec 1 §2.2.4 belegt **zwei** (`NeuesGeraet`, `Geraet`); Spec 1 §8.2.1 **benutzt** vier weitere insert-seitig (`NeueSoftwareVersion`, `NeuerBenutzer`, `NeuesGeraeteEreignis`, `NeueLeihe`); die **vier select-seitigen** (`SoftwareVersion`, `Benutzer`, `GeraeteEreignis`, `Leihe`) stehen **nirgends** | Bau (Schemadatei) | **5 · 6 · 7 · 9 · 10 · 11 · 12 · 13 · 14 · 15 · 16** — ohne sie kompiliert keine Mapper- und keine Sichtsignatur |
| **⬜ L3** | Namen und **vollständige** Spaltenlisten der vier übrigen Paritätssichten (`software_versions` 6, `users` 3, `device_events` 8, `loans` 12). Je Sicht: (a) trägt sie **jede** Spalte der Zieltabelle, (b) läuft jede `mode: "timestamp"`-Spalte durch `sekunden()`, (c) bleibt `devices.last_updated_at` **unumgerechnet**. ⚠️ Die **Namen** stehen als Aufrufstellen in §1.5.2 (Spec 2:1150–1156); als **Export** sind sie ungeschrieben | Bau | **9 · 10 · 11 · 12 · 13**. Fehlt eine Spalte in einer Sicht, ist die Parität für sie **blind** und meldet grün — der einzige Riegel dagegen ist Aufgabe 8 |
| **⬜ L6** | Die genaue **Abschlusszeile** von `scripts/import/radio.ts`, **byteweise**. Bei `portal` ist es `parity green` (`docs/runbooks/portal-cutover.md:20`, `:33`); das Runbook prüft **Zeichenkette und Exit-Code**, nicht nur einen von beiden | Bau / Runbook | **16 · 17**. Ohne sie greppt das Runbook auf eine Zeichenkette, die es nicht gibt |
| **⬜ L2** ⚠️ **verengt, nicht gestrichen** | Ob better-sqlite3 die Meldung `UNIQUE constraint failed: loans.device_id` verpackt. **Gemessen** gegen better-sqlite3 13.0.2: `SqliteError`, `code === "SQLITE_CONSTRAINT_UNIQUE"`, `message` **zeichengleich**, **ohne** `cause`; drizzle-orm 0.45.2 reicht sie durch `db.transaction()` und `onConflictDoUpdate()` unverändert durch (`2026-08-18-plan1-radio-import.md:135`). **Offen bleibt allein die Versionsbindung** | Bau (erster Testlauf) | **15** — der Test darf `toThrow(/UNIQUE constraint failed: loans\.device_id/)` zusichern; eine künftige verpackende Fassung lässt ihn **laut** scheitern, nicht still |
| **Spec 1 §2.5** | `src/app/m/radio/_db/schema.ts` existiert und exportiert `devices`, `softwareVersions`, `users`, `deviceEvents`, `loans`, `zugangscodes` — **die Namen sind gesetzt**, siehe Naht NS6 | Bau | **5 · 6 · 7 · 8 · 9 · 10 · 11 · 12 · 13 · 14 · 15 · 16** |
| **Spec 1 §2.6 / §2.9.1** | `src/app/m/radio/_db/migrations/` existiert, mit dem generierten `0000_<name>.sql` **und** der von Hand geschriebenen `0001_loans_aktiv_uidx.sql` | Bau | **14 · 15 · 16 · 17**. Ohne sie findet `migrate(db, { migrationsFolder })` nichts, und Fall B hat keinen Index, an dem er bricht |
| **Spec 1 §2.9** | Das **Registrierungsdreieck**: die `MODULE_MIGRATIONS`-Zeile in `src/core/bootstrap.ts` (hinter `aufgaben`, also hinter `:48`), die `COPY`-Zeile im `Dockerfile` (hinter `:56`), der `SEED_MODULE`-Eintrag in `scripts/seed-lokal.ts` | Bau | **16 · 17**. Ohne es legt `migrateAllModules()` `radio.db` **nicht** an; der erste Insert stirbt mit `no such table: devices` |
| **V-A** (Vorbedingung, keine Leerstelle) | Eine Arbeitskopie von `radio-admin` am Freeze-SHA **`265abd5`** — Aufgabe 1 kopiert daraus fünf Dateien zeichengleich | Arbeitsplatz | **1**. ✅ Gemessen 2026-08-18 vorhanden. Fällt sie weg, wird das archivierte Repo am SHA geklont (Spec 2 Kapitel 5 Posten 12: **archiviert, nicht gelöscht**) |

**Aufgelöst und nicht mehr zu führen:** ⬜ **N2** — die Export-Namen der fünf Tabellenobjekte stehen
in Spec 1 §2.5 ausgeschrieben (Naht **NS6**, mit Zeilen).

**Nicht dieser Leitplan:** ⬜ **L4**, ⬜ **L5** und die Ablesung **„Hält der reguläre Stack
`radio.db` nach dem Boot dauerhaft offen?"** (§L und §Z, Runbook; T2 führt sie als ⬜ **N1**,
`2026-08-18-plan2-radio-paritaet.md:87` — im Cutover-Leitplan steht sie unter **dessen** N-Numerierung, also am Klartext
zu suchen, nicht an der Nummer) sowie E1–E8, U4/U4a/U4b, U6–U9 und C.1–C.7. **C.6 / B4**
(Updater-Rechtestufe) ist fachlich blockierend und bewusst geparkt — **keine Aufgabe dieses Wegs
liest eine Rolle**, der Bau läuft ohne die Antwort durch.

---

## Selbstprüfung dieses Leitplans

| Was der Auftrag verlangt | Wo es steht |
|---|---|
| Pflichtkopf für den **Gesamtweg**, nicht für ein Kapitel | Kopf: Goal · Architecture · Tech Stack · Spec · Spec 1 |
| Globale Randbedingungen, Werte **wörtlich** aus dem Rahmen | „Globale Randbedingungen", die Neunertafel plus die Vorgaben je Aufgabe |
| Die Reihenfolge: Nr · Aufgabe · Teil und Anker · wartet auf · liefert | „Die Reihenfolge", 17 Zeilen plus die Naht-Zeile für den Spec-1-Bau |
| Nahtstellen mit Entscheidung und Grund | NS1–NS11; **entschieden** in NS1, NS2, NS3, NS5, NS6, NS7, NS11 · **geprüft ohne Widerspruch** in NS4, NS8, NS9, NS10 |
| Sperren: Nummer · Ablesung · Quelle · wartende Aufgaben | „Sperren", 8 Zeilen |
| Was heute schon läuft — vorn, nicht in einer Fußnote | „Was heute schon läuft", direkt nach der Abgrenzung |
| Heißt die Mapping-Funktion in beiden Teilen gleich, dieselben Signaturen und Typaliase? | Geprüft: T1s Namensgleichheitsliste (`2026-08-18-plan1-radio-import.md:2991–2995`) gegen T2s Zusagen (`2026-08-18-plan2-radio-paritaet.md:2000–2011`). **Ein Fund:** der Rückgabetyp der Sichten → **NS5** |
| Ist die Sekundenumrechnung an beiden Stellen dieselbe Funktion, und bleibt `devices.last_updated_at` in **beiden** Teilen unumgerechnet? | **NS9** (dieselbe Funktion `sekunden`, ein Eigentümer) und **NS8** (unumgerechnet in beiden, doppelt geprüft, bleibt so) |
| Deckt die Aufgabenfolge beide Teile ohne Lücke, und wartet keine früh numerierte Aufgabe auf eine spätere? | „Lückenprüfung" (12 + 5 = 17) und „Prüfung der Reihenfolge-Invariante" — **eine benannte Ausnahme auf Blockebene**, ausgeschrieben in **NS3** |
| Steht die Abschlusszeile überall als ⬜ L6 und nirgends als erfundene Zeichenkette? | **NS10** — vier Fundstellen, alle vier markiert. Kein Fund |

**Was dieser Leitplan bewusst NICHT tut:** er gießt die zwei Planteile nicht in ein Riesendokument
um. Sie tragen zusammen 5131 Zeilen mit ausgearbeitetem Code; ein Umguss verlöre unterwegs Text und
brächte niemandem etwas. **Wo dieser Leitplan von einem Teil abweicht, steht die Abweichung unter
Nahtstellen mit Beleg — die Teile bleiben unverändert, und dieses Dokument ist die Instanz, die im
Streitfall gilt.**
