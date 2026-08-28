# Der Weg `radio` — Ausfuehrungsplan

> **Die eine Seite, die den Fortschritt fuehrt.** Sie zaehlt alle Aufgaben in der Reihenfolge auf, in
> der sie abzuarbeiten sind, und markiert die Zaesuren, an denen die Arbeit auf etwas wartet, das
> kein Plan herstellen kann.
>
> **64 Aufgaben, aus zwei Wegen:** **58** aus den fuenf Plaenen zu **Spec 2** (B1–B17 Bau,
> C1–C41 Cutover) und **6** aus Planteil 1 zum Bau von **Spec 1** (**M1–M6**), geschrieben seit dem
> 2026-08-21 und **gebaut** — sie heben Zaesur 1 fuer B5–B17. Die M-Aufgaben stehen unten **an ihrem
> Platz in der Reihenfolge** — zwischen B4 und B5, denn genau dort liegt die Naht.
> **64 von 64 Aufgaben sind erledigt** (B1–B17, M1–M6, C1–C41) — **beide Straenge stehen: der
> Bauweg und der Cutover-Weg.** Was bleibt, ist keine Aufgabe mehr, sondern die **Zaesur** darunter
> (Betreiberfragen, Server-Ablesungen) und der **Abend selbst**.

**Stand 2026-08-21.** Grundlage: `docs/superpowers/specs/2026-08-18-radio-cutover-design.md`
(Spec 2 — Import · Paritaet · Generalprobe · Cutover · Abbau) und
`docs/superpowers/specs/2026-08-17-radio-modul-design.md` (Spec 1 — das Modul selbst).

## Wenn du hier neu bist — der Stand in sechs Zeilen

1. **Das Ziel:** die zwei Alt-Anwendungen `radio-admin` (Verwaltung) und `radio-inventar` (Kiosk)
   werden zu **einem** Suite-Modul `radio`. Beide Domains ziehen im **selben** Fenster um.
2. **Zwei Specs sind fertig und kritisiert:** Spec 1 entwirft das Modul, Spec 2 den Weg der Daten und
   des Routers. Beide sind entschieden — was in ihren Kapiteln **A** und **B** steht, gilt.
3. **Fuenf Umsetzungsplaene sind fertig und dreifach gegengeprueft.** Sie stehen unten als
   Checkliste. Keine Zeile darin enthaelt einen erfundenen Wert — das ist gemessen, dreimal.
4. **Der Bauweg ist fertig — B1–B17 und M1–M6 sind gebaut** (2026-08-20 und 2026-08-21).
   B1–B4 die Quellseite des Importers, M1–M6 die Zielseite (Planteil 1 von Spec 1), B5–B7 die
   Mapper-Schicht, B8–B13 der Paritaetsblock, **B14–B17 das Schreiben, die Idempotenz, die CLI und
   die Abnahme von Hand**. Zuletzt eine **Schlusspruefung ueber die fertige Datei**: merge-reif,
   **0 kritische Funde**, **118 Tests gruen** (`rtk pnpm vitest run scripts/import/
   src/app/m/radio/`, Exit 0). ⬜ **L6 ist geschlossen**, byteweise abgelesen und in einem
   **verfolgten** Artefakt festgehalten (`../berichte/2026-08-21-radio-import-abnahme.md`).
   **Der Cutover-Weg ist seit dem 2026-08-28 ebenfalls fertig.** C1–C40 haben
   `docs/runbooks/radio-cutover.md` geschrieben (6676 Zeilen, 26 Abschnitte, Commit `58ee49ef`);
   die zwei Aufgaben mit einem Ergebnis **ausserhalb** des Runbooks sind **C2** (die sechs
   Redirect-Labels in `compose.yaml` samt Regressionstest, `0fc85370`) und **C41** (der datierte
   Nachtrag in Spec 2, `d8fe3bd`). **Es gibt keine naechste ausfuehrbare Aufgabe mehr** — der
   naechste Schritt ist die Zaesur unten und dann die Generalprobe.
   ⛔ **Vier Nachtraege (NT8–NT11) binden diesen Weg** — drei davon treffen Runbook-Schritte, die
   sonst am Cutover-Abend scheitern wuerden.
5. **Die eiserne Regel dieses Wegs:** wo ein Wert erst der Bau oder der Server hergibt, steht eine
   benannte Leerstelle (⬜ L…, E…, U…, C…, N…) — **niemals** eine plausibel aussehende Erfindung.
   Der Praezedenzfall ist vernarbt: die `lagerbuch`-Spec verlangte ein `cookies().delete()` in einer
   Server Component, wo es **wirft** — ein Test haette dort eine Zusage geprueft, welche die Bauform
   nicht halten kann.
6. **Was offen ist, steht in `SPERREN-radio-spec2.md`** — vier Tabellen, sortiert nach *wer
   antwortet*: der Bau, der Server, der Betreiber (16 Fragen), und was gar nicht beantwortbar ist.

⚠️ **Nicht verwechseln:** `docs/radio-portierungsanalyse` ist der **Branch**, auf dem diese Arbeit
liegt. Die **Analyse-Datei** heisst `docs/radio-portierung-analyse.md` — sie ist die Vorarbeit zu
beiden Specs, und verbindlich sind aus ihr nur **Kapitel 4** (die 1:1-Pflichten) und **Kapitel 5**
(die Fallen, die kein Gate findet).

## Die fuenf Plaene

| # | Datei | Erzeugt | Aufgaben |
|---|---|---|---|
| **1** | `2026-08-18-plan1-radio-import.md` | Code — `scripts/import/radio.ts` | 12 |
| **2** | `2026-08-18-plan2-radio-paritaet.md` | Code **und** Runbook | 11 |
| **3** | `2026-08-18-plan3-radio-generalprobe.md` | Runbook | 15 |
| **4** | `2026-08-18-plan4-radio-cutover.md` | Runbook | 10 |
| **5** | `2026-08-18-plan5-radio-abbau.md` | Runbook | 10 |

⚠️ **Die Reihenfolge ist NICHT Plan 1 → Plan 5.** Der Bauweg verschraenkt Plan 1 und Plan 2: der
Vollstaendigkeitstest der Paritaetssichten (Plan 2, Aufgabe 1) kommt **vor** den Sichten selbst, weil
er rot sein **soll**, bis sie stehen. Deshalb fuehrt diese Seite zwei durchgehende Zaehlungen —
**B1–B17** fuer den Bau, **C1–C41** fuer den Cutover — und nicht die planinternen Nummern.
Beide stammen aus den Reihenfolge-Tabellen der zwei Leitplaene, die sie entschieden haben.
`SPERREN-radio-spec2.md` fuehrt dieselben Zahlen als **„Bau 5"** und **„Cut 27"** — gleichbedeutend
mit **B5** und **C27**.

## Wie diese Seite zu lesen ist

* Jede Zeile ist eine Aufgabe mit eigenem Testzyklus. Die **Schritte** stehen im jeweiligen Plan,
  nicht hier; die Zeile nennt Datei und Ankerzeile.
* Aeltere Querverweise nennen die Plaene **„Teil 1"** bis **„Teil 5"** — dieselben Dokumente,
  Sprechweise aus der Zeit vor der Nummerierung. `T1` = Plan 1, `T2` = Plan 2 und so fort.
* Die Plaene erzeugen **zweierlei**: Code (Plan 1 und der vordere Teil von Plan 2) und **ein
  Dokument**, `docs/runbooks/radio-cutover.md` (der hintere Teil von Plan 2 sowie Plan 3, 4, 5).
* **Das Runbook schreiben und das Runbook fahren sind zwei verschiedene Dinge.** Die Plaene enden,
  wenn das Runbook steht. Was danach kommt, steht unter „Der Abend selbst".
* ⏸ ist eine **Zaesur** — die Arbeit steht, bis etwas von aussen kommt. ⛔ blockiert den Cutover.
* ✅ **Die Ankerzeilen dieser Seite sind am 2026-08-19 frisch gemessen** und treffen alle 58
  Aufgabenueberschriften der fuenf Spec-2-Plaene. ⚠️ **Die sechs M-Zeilen tragen keine
  Ankerzeile** — ihre Datei ist vom 2026-08-21 und nicht nachgemessen; dort gilt der Wortlaut
  (`## Aufgabe M1:` bis `## Aufgabe M6:`). Die Zeilenverweise **in den Leitplaenen und Berichten** stammen dagegen aus
  aelteren Bearbeitungsstaenden und driften — dort gilt die Hausregel: **ueber den Wortlaut suchen,
  nicht ueber die Nummer.**

## Die drei Zaesuren, vorweg

| ⏸ | Worauf gewartet wird | Wer liefert | Was solange steht |
|---|---|---|---|
| **1** | **Spec 1 ist teilweise gebaut.** Planteil 1 (Kapitel 2, Aufgaben M1–M6) ist fertig — Zielschema, Typaliase und Migrationsverzeichnis existieren. Weiterhin fehlt: Host-Riegel, Flaeche, Retention-Takt, `/api/health/radio` (Planteile 2–5) | ein eigener Bauweg aus Spec 1 — **seit 2026-08-21 geschrieben**: `2026-08-21-radio-modul-leitplan.md` (fuenf Planteile) und `2026-08-21-radio-modul-plan1-datenhaltung.md` (Aufgaben **M1–M6**). **Planteil 1 allein hebt diese Zaesur fuer B5–B17** | **fuer den Bauweg nichts mehr — B5–B17 sind ausfuehrbar.** Fuer den Cutover-Weg weiterhin **C19, C20, C28, C29, C30**, bis die Planteile 2–5 stehen. **B1–B4 und M1–M6 sind gebaut** |
| **2** | **16 Fragen an den Betreiber**, gefuehrt in `SPERREN-radio-spec2.md` Tabelle (c) | Ruben | die endgueltige `.env` (**C26**) und der Ausstellungsplan (**C31**) |
| **3** | **Server-Ablesungen** — echte Volume-Namen, Containername, Loopback-Port, Router-Konfiguration | eine Sitzung am Server, **vor** dem Fenster | die **Ausfuehrung** des Runbooks, nicht sein Entstehen |

⛔ **Der teuerste offene Punkt ist U4/C.5** — wie das `radio-inventar`-Frontend produktiv ausgeliefert
wird. Kein Befehl beantwortet ihn, und nach dem Abbau ist er nur noch durch Ausprobieren zu klaeren.
Er blockiert **Freeze, Umschwenk, Rueckweg** und die Vollstaendigkeit der Abbauliste.

---

# Der Bauweg — B1 bis B17

Erzeugt Code: das Import-Skript, die fuenf Paritaetssichten, die Fixtures, die Tests.
Fuehrt `2026-08-18-radio-bau-leitplan.md` — dort stehen die Nahtstellen NS1–NS11.

⚠️ **B8 bis B13 sind EIN Block mit EINEM Tor** (Naht NS3) und einem gemeinsamen Commit ueber beide
Dateien. B8 ist per Bauart rot, bis B13 steht — das ist sein Zweck, nicht sein Fehler. Dazwischen
kann kein Tor gruen sein, weil `tsconfig.json` `scripts/**` in den Typecheck zieht.

- [x] **B1** Die Quell-DDL als Fixture, mit dem Riegel auf ihre Spaltenreihenfolge  
      `2026-08-18-plan1-radio-import.md:167` — Aufgabe 1 · **fertig 2026-08-20**, Commit `a309f12`.
      Die Fixture ist gegengeprueft: alle **95** SQL-Zeilen der fuenf Migrationen von
      `radio-admin@265abd5` stehen wortwoertlich darin, und **keine** Zeile darueber hinaus
- [x] **B2** Die Rohzeilen der Fixture und der Riegel gegen wiederverwendete Zeitwerte  
      `2026-08-18-plan1-radio-import.md:398` — Aufgabe 2 · **fertig 2026-08-20**, Commit `5fbcd72`
- [x] **B3** Die Zeitachse und die zwei Faltungsriegel — reine Funktionen  
      `2026-08-18-plan1-radio-import.md:767` — Aufgabe 3 · **fertig 2026-08-20**, Commit `6e710bf`,
      nachgeschaerft in `07b5f41`: `tagInBerlin` hatte fuer seinen eigenen Faktor-1000-Riegel
      **keinen** Test — mutationsbewiesen (die Delegation entfernt, und vitest, tsc UND eslint
      blieben gruen)
- [x] **B4** `lieseQuelle` — fünf namentliche `SELECT`s, fünf Quelltypen, ein Quelltext-Scan  
      `2026-08-18-plan1-radio-import.md:993` — Aufgabe 4 · **fertig 2026-08-20**, Commit `38c5d77`.
      ⚠️ Dabei ein **Selbstwiderspruch des Plans** gefunden, siehe „Nachtraege" unten

- [x] ⏸ **ZAESUR — fuer B5–B17 gehoben.** Hier lag der Bau von Spec 1. Die einzige Naht des
      Gesamtwegs.  
      **Planteil 1 ist gebaut** (Aufgaben M1–M6, Commits `1ebb334` · `d3fc13c` · `36088e7` ·
      `25c8c34` · `b96db98`): `src/app/m/radio/_db/` und `_lib/` existieren jetzt — Zielschema,
      Migrationen, Registrierungsdreieck, Retention-Rechnung. ⬜ **L1**, **L3** und **L4** sind
      abgelesen und protokolliert in `../berichte/2026-08-21-radio-datenhaltung-ablesungen.md` —
      **B5 ist ausfuehrbar**.  
      ⛔ **Was weiterhin fehlt: kein Host-Riegel, keine Flaeche, kein Retention-Takt, kein
      `/api/health/radio`** — unveraendert im ⛔-Absatz unter M6. Die Planteile 2 bis 5 stehen aus
      und blockieren weiterhin **C19, C20, C28, C29, C30**.  
      ⚠️ Dokument des Wegs: `2026-08-21-radio-modul-leitplan.md` teilt ihn in **fuenf Planteile**
      (Datenhaltung · Zuschnitt · Zugang und Ausleihe · Grenze und Verwaltung · Betrieb) und
      begruendet die eine Abweichung von der Stufenfolge der Spec: **Kapitel 2 wird vor Kapitel 1
      gebaut**, weil Kapitel 2 keine Flaeche baut und allein ⬜ **L1**, ⬜ **L3** und ⬜ **L4**
      ablesbar macht.  
      ⬜ **L5** (der `revision`-Sollwert) und ⬜ **L6** (die Abschlusszeile) kommen nicht aus
      Planteil 1: L5 ist eine Protokollzeile des **ersten Deploys**, L6 entsteht mit **B16**.

### Die Zaesur, aufgeloest in Aufgaben — M1 bis M6

Aus `2026-08-21-radio-modul-plan1-datenhaltung.md`. **Ankerzeilen stehen hier absichtlich nicht**:
die Datei ist neu, ihre Zeilennummern sind noch nicht nachgemessen, und die Hausregel gilt — **ueber
den Wortlaut suchen, nicht ueber die Nummer.** Die Aufgabenueberschriften lauten dort
`## Aufgabe M1:` bis `## Aufgabe M6:`.

⚠️ **M1 bis M3 sind EIN Block mit EINEM Tor** und **einem** gemeinsamen Commit ueber neun Pfade — **zwoelf** Dateien, denn `migrations` ist ein Verzeichnis.
Vier Tests des Bestands koppeln Schemaverzeichnis, `MODULE_MIGRATIONS`, die `COPY`-Zeile im
`Dockerfile` und `SEED_MODULE` aneinander (`src/core/bootstrap.test.ts:90-113`,
`scripts/seed-lokal.test.ts:38-45`) — zwischen „Schemadatei angelegt" und „Seed verdrahtet" **kann
kein Tor gruen sein**. M1 ist per Bauart rot, bis M3 steht; das ist ihr Zweck, nicht ihr Fehler.

- [x] **M1** Das Zielschema, der Verbindungsoeffner, die drizzle-Konfiguration  
      Aufgabe M1 — **fertig 2026-08-21**, Commit `1ebb334` (Block M1–M3, ein gemeinsamer Commit).
      ⚠️ **Beginn des Blocks M1–M3.** Liefert die zehn Typaliase (⬜ **L1**)
- [x] **M2** Die zwei Migrationen — `0000` generiert, `0001_loans_aktiv_uidx.sql` von Hand  
      Aufgabe M2 — **fertig 2026-08-21**, Commit `1ebb334`. Vier Tests. ⚠️ Der Journaleintrag der
      `0001` wird **von Hand** nachgetragen, sonst wendet `migrate()` sie nie an
- [x] **M3** Das Registrierungsdreieck und der lokale Seed — **das eine Tor des Blocks**  
      Aufgabe M3 — **fertig 2026-08-21**, Commit `1ebb334`.
      `MODULE_MIGRATIONS` · `Dockerfile` · `scripts/seed-lokal.ts` · `_lib/seedLokal.ts`
- [x] **M4** Der Quelltext-Scan: kein Loeschweg auf `zugangscodes`, und keine Flaeche vor Planteil 2  
      Aufgabe M4 — **fertig 2026-08-21**, Commit `d3fc13c`. Der zweite Fall ist **zum Loeschen
      bestimmt**, mit Planteil 2
- [x] **M5** Die Retention-Rechnung — `retentionGrenze` und `raeumeLeihhistorie`  
      Aufgabe M5 — **fertig 2026-08-21**, Commit `36088e7`. Fuenf Faelle. ⚠️ **Nur die Rechnung,
      nicht der Takt** (Naht NS-M1)
- [x] **M6** Abnahme von Hand — und die drei ⬜, die den Import-Weg entsperren  
      Aufgabe M6 — **fertig 2026-08-21**, Commit `25c8c34`. Liest ⬜ **L1**, ⬜ **L3**, ⬜ **L4** ab
      und protokolliert sie. **Danach ist B5 ausfuehrbar**

⛔ **Was M1–M6 NICHT liefern:** keinen Host-Riegel, keine Flaeche, keinen Retention-Takt, kein
`/api/health/radio`. Die stehen in den Planteilen 2 bis 5 und blockieren **C19, C20, C28, C29, C30** —
nicht aber B5–B17. Wer nach M6 glaubt, Spec 1 sei gebaut, plant eine Generalprobe, die nicht laufen
kann.

- [x] **B5** `toNeuesGeraet` — 25 Felder, der Faktor 1000, die zwei 0/1-Integer, der Berliner Tag  
      `2026-08-18-plan1-radio-import.md:1286` — Aufgabe 5 · **fertig 2026-08-21**, Commit `903ed0b`,
      **23 Tests gruen**. Planexakt, ohne Abweichung: ⬜ **L1** abgelesen (Insert-Alias
      `NeuesGeraet`, Select-Alias `Geraet`, `src/app/m/radio/_db/schema.ts:255-256`), kein `as` auf
      dem Rueckgabewert. Drei Mutationssonden gesetzt und zurueckgenommen: die zwei 0/1-Integer
      vertauscht (**2 rot**), UTC-Kuerzung statt `tagInBerlin` (**2 rot**, `"2025-03-01"`),
      `updateNote` gedroppt (**1 rot** — nur der 25-Feld-`toEqual` faengt es).
      ⚠️ **NT2 ist hier NICHT tragend und bleibt geparkt:** `AltGeraet.alamos_integrated` ist
      `0 | 1 | null`, nicht optional — der `undefined`-Zweig von `zuBoolOptional` ist von
      `toNeuesGeraet` aus typseitig unerreichbar. Die Haertung bleibt eine Planentscheidung
- [x] **B6** Die drei schmalen Mapper: `users`, `software_versions`, `device_events`  
      `2026-08-18-plan1-radio-import.md:1536` — Aufgabe 6a · **fertig 2026-08-21**, Commit
      `60cdfc3`, **30 Tests gruen**. 3 + 6 + 8 Zielfelder, deckungsgleich mit dem Zielschema in
      Name und Zahl. Vier Mutationssonden: `msZuDatum` bei `users` umgangen (**2 rot**), Enum-Riegel
      durch ein `as` ersetzt (**1 rot**), `old_value`/`new_value` vertauscht (**1 rot**), `isTarget`
      hart auf `true` (**1 rot**).
      ⚠️ **NT5 war bereits im Plan geloest, nicht offen:** Aufgabe 6a Schritt 3 schreibt
      `isTarget: zeile.is_target === 1` wortwoertlich vor — genau die eine Zeile, die NT5 als
      Auftrag fuehrt. Es blieb nichts zu entscheiden
- [x] **B7** `toNeueLeihe` — 12 Zielfelder, vier Zeitstempel, `zugangscodeId` immer `null`  
      `2026-08-18-plan1-radio-import.md:1692` — Aufgabe 6b · **fertig 2026-08-21**, Commit
      `1029ba3`, **35 Tests gruen**. Vier Mutationssonden: `?? new Date(0)` auf `returnedAt`
      (**1 rot**), `snapshot_call_sign ← borrower_name` (**2 rot**), `zugangscodeId` implizit
      ausgelassen (**2 rot**), `created_at`/`updated_at` vertauscht (**2 rot**). Die erste ist die
      teuerste des ganzen Wegs — sie macht jede aktive Leihe zu einer 1970 zurueckgegebenen, und
      der naechste Retention-Lauf loescht sie. **Damit steht die ganze Mapper-Schicht**
- [x] **B8** Der Vollständigkeitstest der Paritätssichten — er kommt zuerst  
      `2026-08-18-plan2-radio-paritaet.md:110` — Aufgabe 1 · **fertig 2026-08-21**, Commit `dfbe5b3` (Block).
      `scripts/import/radio-paritaet.test.ts`, **22 Faelle**. ⚠️ **NS3 Punkt 1 ist gemessen
      widerlegt** (siehe unten NT6); Punkt 2 traegt die Blockregel allein
- [x] **B9** Die Sichtgrundlage: `sekunden`, `RadioDb`, `paritaetsSichtGeraet`, das getaggte Multiset, `checkRadioParitaet`  
      `2026-08-18-plan1-radio-import.md:1822` — Aufgabe 7 · **fertig 2026-08-21**, Commit `dfbe5b3` (Block).
      Schritt 3 entfaellt (NS1), Schritt 6 ist zum Blocktor geworden (NS3). Keine `: Row`-Annotation
      auf den Sichten (NS5)
- [x] **B10** `paritaetsSichtBenutzer` — `users`, 3 Spalten  
      `2026-08-18-plan2-radio-paritaet.md:337` — Aufgabe 2 · **fertig 2026-08-21**, Commit `dfbe5b3` (Block)
- [x] **B11** `paritaetsSichtSoftwareVersion` — `software_versions`, 6 Spalten  
      `2026-08-18-plan2-radio-paritaet.md:408` — Aufgabe 3 · **fertig 2026-08-21**, Commit `dfbe5b3` (Block). Insert-Defaults normalisiert (`?? 0`,
      `?? false`), nicht weggelassen
- [x] **B12** `paritaetsSichtGeraeteEreignis` — `device_events`, 8 Spalten  
      `2026-08-18-plan2-radio-paritaet.md:490` — Aufgabe 4 · **fertig 2026-08-21**, Commit `dfbe5b3` (Block)
- [x] **B13** `paritaetsSichtLeihe` — `loans`, 12 Spalten (11 aus der Quelle, eine neu)  
      `2026-08-18-plan2-radio-paritaet.md:572` — Aufgabe 5 · **fertig 2026-08-21**, Commit `dfbe5b3` — **das Blocktor**. Fuenf Mutationssonden ueber den
      ganzen Block: Spalte aus einer Sicht entfernt (**1 rot**), `sekunden` liefert Millisekunden
      (**5 rot**), `null` wird `0` (**5 rot**), `timestamp_ms` im Schema (**1 rot**),
      `lastUpdatedAt` durch `sekunden` (**1 rot**)
- [x] **B14** `importiereRadio` — Einfügereihenfolge, Konfliktstrategien, Paritäts-Rundlauf  
      `2026-08-18-plan1-radio-import.md:2066` — Aufgabe 8 · **fertig 2026-08-21**, Commits
      `b70abab` · `6606246`, **108 Tests gruen**. Vier Mutationssonden trafen (Journal-Insert
      stillgelegt, Einfuegereihenfolge verletzt, falsches Konfliktziel, `loans`-Insert stillgelegt).
      ⚠️ Eine fuenfte fand **nichts** — und das war ein Fund ueber den Plan, nicht ueber den Code:
      die `RadioDb | RadioTx`-Union ist fuer diesen Rumpf **redundant, nicht tragend**
      (`SQLiteTransaction` ist an `BetterSQLite3Database` zuweisbar, beide erben dasselbe
      `private resultKind`; nur `db.query.*` waere schema-empfindlich). Der Kommentar, der das
      Gegenteil behauptete, ist berichtigt. Die Union bleibt planexakt gebaut
- [x] **B15** Die vier asymmetrischen Idempotenzfälle A · B · C · D  
      `2026-08-18-plan1-radio-import.md:2315` — Aufgabe 9 · **fertig 2026-08-21**, Commits
      `21fb800` · `14cbf11`, **112 Tests gruen**. **Alle vier Faelle loesen einen echten Konflikt
      aus** (zweiter Lauf gegen dieselbe Ziel-DB), und jeder haengt nachweislich an **seiner**
      tragenden Zeile — vier Sonden, je genau ein roter Test.
      ⚠️ **Fall B hat zunaechst den Rollback NICHT gemessen**, den er zu bewachen vorgab: er prueft
      eine Zeile, die keine Importschleife anfasst, und war gruen ob zurueckgerollt wurde oder nicht.
      Berichtigt auf `devices.g-1.updateNote` (Schleife 3 laeuft vor dem Wurf in Schleife 5), mit
      Sondenbeleg
- [x] **B16** `runRadioImport`, die Zählzeile, die Transaktion, der CLI-Block  
      `2026-08-18-plan1-radio-import.md:2570` — Aufgabe 10 · **fertig 2026-08-21**, Commits
      `7d64f30` · `e440f68`, **113 Tests gruen**. ⬜ **L6 ist damit geschlossen** — siehe unten.
      ⛔ **Der teuerste Fund des ganzen Laufs steckte hier:** die Abschlusszeile traegt
      `Parität grün` als **konstanten Text**, nicht aus `report.ok` abgeleitet — zwischen einem
      roten Befund und dieser Zeile stand **allein** der Wurf aus `assertParity`. Faellt die eine
      Zeile weg, meldet der Importer bei **roter** Paritaet Erfolg mit **Exit 0**, und der Betreiber
      friert die Alt-Anwendung ein und schwenkt den Router. Drei Sonden zeigten **0 rot**.
      Geschlossen durch die Naht `schreibeUndPruefe(quelle, db)`, die `db` als Parameter nimmt und
      damit ohne `getModuleDb()` testbar ist; danach machen beide Sonden **je 1 rot**
- [x] **B17** Abnahme von Hand — der Trockenlauf über die Kommandozeile  
      `2026-08-18-plan1-radio-import.md:2725` — Aufgabe 11 · **fertig 2026-08-21**, Commits
      `555a559` · `ada7b65`. Zaehlzeile, Abschlusszeile und beide Exit-Codes abgelesen, die fuenf
      Gegenzaehlungen decken sich — **Glied (3)→(4) der Zaehlkette ist geschlossen**, (1)→(2) nicht
      und kann es hier nicht.
      ⚠️ **Entgegen dem „Files: keine" des Plans wurde eine Datei angelegt:**
      `../berichte/2026-08-21-radio-import-abnahme.md`. Der SDD-Workspace ist git-ignoriert und wird
      geloescht — die Messwerte haetten den Lauf nicht ueberlebt, obwohl zwei Runbook-Planteile
      woertlich auf sie greppen.
      ⛔ **Und der Trockenlauf hat einen fremden Befund gefunden — siehe NT8**

- [x] **Schlusspruefung Plan 1** — **merge-reif**, 0 kritische Funde. Commit `0194010`,
      **118 Tests gruen**. Sie fand **zwei fehlende Sonden an heute korrektem Code**, beide von der
      Art, gegen die dieser ganze Plan gebaut ist — siehe **NT9** und **NT10**

---

## Nachtraege — was der Bau an den Dokumenten und am Werkzeug gefunden hat

**Vierzehn Funde**, drei davon vom 2026-08-28 aus dem Bau von C41 (**NT12**, **NT13** und
**NT14** — alle drei am Cutover-Weg und alle drei still). Die elf aelteren: drei vom 2026-08-20 (B1–B4), zwei aus dem Abschluss-Review des M1–M6-Laufs
(2026-08-21), **zwei aus dem Bau von B5–B13** (NT6 am Bau-Leitplan, NT7 am Werkzeug) und **vier aus
dem Bau von B14–B17 samt Schlusspruefung** (2026-08-21). ⛔ **NT8, NT9 und NT10 treffen
Runbook-Schritte, die sonst am Cutover-Abend scheitern wuerden** — sie sind die wichtigsten Zeilen
dieser Tafel fuer den Cutover-Weg. NT11 ist ein bewusst geparkter Waechter, faellig mit Kapitel 3. Sie betreffen **die Plaene, das Repo und die Messkette**, nicht den gebauten Code — der ist
gruen und gegengeprueft. Wer sie nicht eintraegt, laeuft beim naechsten Durchgang erneut hinein.

| # | Fund | Wo er hingehoert |
|---|---|---|
| **NT1** | ⛔ **`2026-08-18-plan1-radio-import.md`, Aufgabe 4 widerspricht sich selbst.** Schritt 1 gibt den Quelltext-Scan wortwoertlich vor (`expect(quelltext).not.toMatch(/select\s+\*/i)`), Schritt 3 gibt einen Kopfkommentar fuer `lieseQuelle` vor, der die Zeichenkette `` `SELECT *` `` als **Zitat des Anti-Vorbilds** (`scripts/import/feedback.ts:66-72`) selbst enthaelt — und Schritt 4 sagt „17 passed" voraus. Der Scan unterscheidet nicht zwischen einem Statement und einem Prosa-Zitat. **Beide Wortlaute stammen aus dem Plan**, der Widerspruch liegt dort | **Nachtrag am Plan**, Aufgabe 4 Schritt 3. Gebaut wurde der Test **streng** und der Kommentar umformuliert („liest fuenfmal ohne Spaltenliste") — die Entscheidung steht, sie gehoert nur ins Dokument |
| **NT2** | **`zuBoolOptional(undefined)` gibt `false` zurueck**, nicht `null` — genau die Faltung, die der Kommentar zwei Zeilen darueber namentlich verbietet, und asymmetrisch zu `msZuDatumOptional`, das `undefined` ausdruecklich behandelt. Signatur **und** Rumpf sind planvorgegeben, ebenso der blinde Cast `.all() as AltGeraet[]`, ueber den `undefined` ueberhaupt erst ankaeme. **Am 2026-08-21 mit dem Bau von B5 nachgemessen: NICHT tragend.** `AltGeraet.alamos_integrated` und `.loanable` sind `0 \| 1 \| null`, **nicht optional** (`scripts/import/radio.ts:126-127`) — der `undefined`-Zweig ist von `toNeuesGeraet` aus typseitig unerreichbar, und der `SELECT` nennt beide Spalten namentlich. Bleibt eine **Haertung gegen den blinden Cast**, kein Fehler im Datenweg | ✅ **ERLEDIGT 2026-08-21**, Commit `525cd70`. Entschieden im Automode nach Rubens Weisung: gehaertet auf `(v: 0 \| 1 \| null \| undefined) => (v === null \|\| v === undefined ? null : v === 1)`, mit **Test zuerst** (`expect(zuBoolOptional(undefined)).toBeNull()`) und Mutationssonde (Zweig entfernt → 1 rot). Der Kommentarblock nennt jetzt beide Gruende: der blinde Cast ist die eine Tuer, und zwei Nachbarfunktionen mit derselben Aufgabe duerfen sich in der Nullbehandlung nicht widersprechen. **NT4 bleibt unberuehrt gueltig** — die Zaehlprobe bei C28 faengt jede Faltung, gleich woher |
| **NT3** | **Der `SELECT *`-Scan ist loechrig:** `/select\s+\*/i` laesst `SELECT d.*` und `select*from` durch (beides gueltiges SQLite, der Tokenizer braucht kein Trennzeichen) und schlaegt bei Prosa-Zitaten falsch an. Testzeile und Regex sind planvorgegeben | **Nachtrag am Plan**, Aufgabe 4 Schritt 1 |
| **NT4** | **Die Zaehlprobe gegen den `zuBoolOptional`-Fund (NT2) gehoert ins Cutover-Runbook.** NT2 beschreibt, dass `zuBoolOptional(undefined)` `false` statt `null` liefert und ab B5 tragend wird. Das Abschluss-Review von M1–M6 hat ergaenzt, **warum das nach dem Import nicht mehr nachweisbar ist**: `devices.alamosIntegrated` und `devices.loanable` sind die zwei **nullable** `mode: "boolean"`-Spalten des neuen Schemas, und ein falsch gefaltetes `false` ist dort **nicht mehr von einem echten `false` zu unterscheiden** („Alamos nicht erfasst" wird „nicht integriert") und ist paritaetsgruen. Die **einzige** Probe, die es faengt: `select count(*) from devices where loanable is null` und dasselbe fuer `alamos_integrated`, **Quelle gegen Ziel** | **Nachtrag im Cutover-Runbook**, Plan 4 §C Schritt 4–5 (Import, Paritaet, Feldstichproben) — als Feldstichprobe Quelle gegen Ziel. Betrifft **C28** |
| **NT5** | **Ein Reibungspunkt an der Naht zu B5, der eine Zeile Mapper kostet und keine Schemaaenderung:** `AltVersion.is_target` ist in `scripts/import/radio.ts` als `number` typisiert, `zuBoolOptional` nimmt aber `0 \| 1 \| null`. B5 (bzw. B6, wo `software_versions` gemappt wird) braucht dort ein `row.is_target === 1` inline oder einen zweiten Helfer. Das Abschluss-Review von M1–M6 hat die Naht **Feld fuer Feld** geprueft und sonst **keinen** Bruch gefunden: `AltGeraet` (25 Felder) → `NeuesGeraet` (25 Spalten) ist deckungsgleich in Name, Nullability und Reihenfolge, `last_updated_at: number\|null` → `lastUpdatedAt: string\|null` ist genau der Bruch, den `tagInBerlin` bedient, und `AltLeihe` (11) → `NeueLeihe` (12) traegt die zwoelfte nullable ohne Default, also im `$inferInsert` optional | **Auftrag an B5/B6** (Naht NS-M2/NS-M3) — eine Zeile Mapper (`row.is_target === 1` oder ein zweiter Helfer), keine Schemaaenderung |

| **NT6** | **NS3 Punkt 1 ist gemessen widerlegt, seine Entscheidung nicht.** Der Bau-Leitplan begruendet „ein Block, ein Tor" doppelt. Punkt 1 sagt, `radio-paritaet.test.ts` lade „**gar nicht**", solange eine Sicht fehlt, und Teilgruen sei deshalb unmoeglich; T2s Erwartung „vier gruene Faelle fuer `users`" koenne nicht zutreffen. **Gemessen laedt sie doch:** nach B8 allein `16 failed | 6 passed (22)` — die fuenf Spaltenzahl- und die `timestamp_ms`-Zusicherung lesen nur das Schema. Nach B10 liefert `-t users` genau **4 passed | 18 skipped**, also **T2s Zahl**. Die Fehlerform ist auch nicht `No "…" export is defined`, sondern `TypeError: sicht is not a function` (Vite laesst den Named Import als `undefined` durch). ⛔ **Punkt 2 traegt die Blockregel allein und ist bestaetigt:** `tsc` sieht die Datei (`--listFilesOnly`) und meldet fuenf `TS2305` | **Nachtrag am Bau-Leitplan**, NS3 Punkt 1 und die Berichtigung der `-t`-Erwartung. Die **Entscheidung** bleibt unveraendert richtig |
| **NT7** | ⛔ **`rtk` meldet falsches Gruen fuer `tsc` — siehe den eigenen Abschnitt unten.** Betrifft **jedes** typecheck-Tor dieses Wegs und jedes andere Projekt, das `CLAUDE.md`s Regel „immer `rtk`" folgt | ✅ **BEHOBEN 2026-08-21 an beiden Stolpersteinen**, Commit `1d96200` plus `NO_COLOR=1` in Claude Codes `env`. Das Tor ist in Rot **und** in Gruen gegengeprueft. ⚠️ **RTK selbst ist nicht gerichtet** — der Filter bleibt anfaellig, sobald irgendwo Farbe durchkommt. Ein Upstream-Bericht an `github.com/rtk-ai/rtk` steht aus |
| **NT8** | ⛔ **`sqlite3 -readonly` scheitert gegen eine frisch importierte `radio.db`** — sie liegt im **WAL-Modus** und traegt noch **kein `-shm`**, und ein Readonly-Handle darf das Shared-Memory-File nicht anlegen. Meldung: `Parse error in 3rd command line argument: unable to open database file (14)` — sie sieht wie ein **Importfehler** aus und ist keiner. ⚠️ Die naheliegende Erstdiagnose („das mehrzeilige SQL scheitert, einzeilig laeuft es") ist **gemessen widerlegt**: es scheitert auch einzeilig, auch mit absolutem Pfad, auch ueber `file:?mode=ro`. Der scheinbar funktionierende Einzeiler lief, **nachdem** ein vorheriger Schreibzugriff die `-shm` angelegt hatte. ✅ **Der Importer selbst ist nicht betroffen** (`better-sqlite3` mit `readonly: true` oeffnet eine WAL-DB ohne `-shm`; die Quellseite liegt ohnehin im `delete`-Modus — beides gesondet) | **Cutover-Runbook**: betrifft **C15, C28, C33, C34** — jede Gegenzaehlung und Feldstichprobe gegen das frische Ziel. Der tragende Weg **und seine Begruendung** stehen als fertiges Snippet in `../berichte/2026-08-21-radio-import-abnahme.md`. ⛔ **Dort steht auch die Auflage, `pragma journal_mode` der QUELLE am Freeze-Abend neu zu messen** — die heutige Ablesung (`delete`) ist datiert, und ein Update von `radio-admin` genuegt, um sie umzustossen |
| **NT9** | ⛔ **Die Paritaet ist gegen einen VERALTETEN Schnappschuss strukturell blind.** Beide Arme von `checkRadioParitaet` stammen aus **demselben**, einmal gelesenen `quelle`-Objekt. Ein Schnappschuss, der zwei Stunden alt, aber in sich konsistent ist, ergibt plausible Zahlen, einen sauberen Import und **gruene** Paritaet. Die **Zaehlzeile** ist die einzige Verteidigung — und sie verteidigt nichts, solange das Runbook keine **Vorabzaehlung aus der laufenden Alt-Anwendung** mitfuehrt, gegen die der Betreiber sie stellt | **Cutover-Runbook**: **C13** (die dreizehn Abfragen vor dem Import) und **C28**. Der Codekommentar sagt es; das Runbook muss es **einloesen** |
| **NT10** | **`DATA_DIR` vergessen → Import nach `./.data/radio.db`, Paritaet gruen.** Ein stiller Ast, den der Plan woertlich benennt und dem er einen **eigenen Runbook-Schritt** zuweist (Gegenzaehlung gegen die Zieldatei). Ausdruecklich **kein** Fund gegen `radio.ts` | **Cutover-Runbook**: der Gegenzaehlungs-Schritt muss in den Planteilen zu **Kapitel 3 und 4** wirklich stehen |
| **NT14** | ⚠️ **Derselbe Drift wie NT12, aber am QUELLTEXT — und er ist groesser, aelter und NICHT von C2 verursacht.** `src/core/routing.ts:69` steht in **18** verbindlichen Dokumentstellen (Runbook, Specs, Plaene) und meint ueberall denselben Ausdruck, `const mod = moduleForHost(host) ?? getModule("portal")`. Der steht heute auf **`:79`**; auf `:69` liegt seit dem internen Host-Rewrite ein `if (internal) {`. Die Fassung `:69-73` (der Login-Zweig) ist heute `:81-83`. Ebenso `src/core/registry.ts:225` fuer `moduleForHost` in **11** verbindlichen Stellen — richtig ist **`:251-257`**. Stichprobe ueber acht Fundstellen: alle meinen denselben Ausdruck, der Versatz ist systematisch. Dazu je fuenf bzw. sechs Vorkommen in `berichte/` und `-teile/`, die als datierte Momentaufnahmen **bleiben sollen** | ⛔ **Gemeldet, NICHT behoben — und das ist eine Entscheidung, keine Unfertigkeit.** Ein pauschales Ersetzen ueber 29 Stellen waere genau der Fehler, gegen den dieser Weg gebaut ist: `2026-07-30-files-modul-design.md:478` zitiert `routing.ts:69` in einem anderen Zusammenhang (Routing **und** Login-Allowlist), und ob jede Stelle den Ausdruck oder den Block meint, entscheidet sich am Wortlaut, nicht am Muster. **Braucht einen eigenen Durchgang mit Einzelpruefung.** Bis dahin gilt die Hausregel des Kopfes verschaerft: **ueber den Wortlaut suchen, nicht ueber die Nummer** — und zwar jetzt auch in Specs und Runbook, nicht nur in Leitplaenen und Berichten |
| **NT12** | ⛔ **C2 hat jeden `compose.yaml`-Zeilenverweis dieses Wegs verschoben — und der bekannteste zeigt jetzt auf etwas Falsches, statt ins Leere.** Die sechs Redirect-Labels (`0fc85370`) fuegen **31 Zeilen nach `compose.yaml:155`** ein; jeder Verweis auf eine Zeile **ab `:156`** ist seitdem um **+31** daneben. Der am haeufigsten zitierte ist `:221-223`, die Deklaration des benannten Volumes `suite_data` — sie liegt heute auf **`:252-254`**, und unter `:221-223` steht ein `files_data:/data/files:ro`-Mount am clamd-Dienst. ⚠️ **Das ist die stille Sorte:** wer am Cutover-Abend nachschlaegt, findet dort eine gueltig aussehende Zeile ueber ein anderes Volume — kein Fehler, keine Meldung, nur eine falsche Auskunft an der Stelle, die begruendet, **warum** der Zielarm im Container gelesen wird. Unveraendert richtig bleiben `:79`, `:99` und `:155`; sie liegen vor dem Einfuegepunkt | **Spec 2** ist am 2026-08-28 fuer **Kapitel 5** nachgezogen (`d8fe3bd`, als dritter datierter Nachtrag an Abfrage A festgehalten). ⛔ **Offen: die uebrigen Verweise in Spec 2 (Kapitel 1–4), im Runbook und in den Plaenen** — ein reiner Zeilennachzug ohne fachliche Entscheidung, aber abend-anhaltend |
| **NT13** | **Spec 2 traegt NT8 an drei Stellen ausserhalb Kapitel 5 noch nicht nach — und an einer vierten das Gegenteil.** NT8 (2026-08-21) hat gemessen, dass `sqlite3 -readonly` gegen eine frisch importierte `radio.db` scheitert; das Runbook liest die Zieldatenbank deshalb an **dreizehn** Stellen ohne. In Spec 2 stehen weiterhin: **§1.8** (`:1516`) fuehrt `sqlite3 -readonly "$DATA_DIR/radio.db"` als **gueltigen** Weg der Generalprobe, und **Kapitel 4** liest dreimal `sqlite3 -readonly /data/radio.db` in der Containerform. ⚠️ **Umgekehrt beim Quellarm:** das Runbook liest die Snapshot-Kopie an fuenf Stellen **mit** `-readonly`, Spec 2 Kapitel 5 an sieben **ohne** — hier ist die Spec die laxere. **Bewusst nicht eigenmaechtig geheilt:** `-readonly` an der Quelle haengt am Zweig `pragma journal_mode` (§L.1 des Runbooks: `delete` → bleibt, `wal` → faellt weg), und diesen Verzweigungsapparat hat die Spec nicht | **Spec 2, Kapitel 1 und 4** — nicht der Planteil zu Kapitel 5, der sie am 2026-08-28 gefunden hat (C41 hat nur die zwei Stellen in **seinem** Bereich gezogen: Abfrage R und Z). ⚠️ **NT8 nennt als Wirkort bisher nur C15, C28, C33, C34** — also Runbook-Aufgaben; **dass auch die SPEC die widerlegte Form weitertraegt, ist bis heute nirgends verzeichnet** |
| **NT11** | **Ein geparkter Waechter, faellig mit Kapitel 3:** `scripts/import/radio-paritaet.test.ts:140` prueft `toBeGreaterThanOrEqual(SICHTEN.length)` — also **≥ 5**, nicht **= 6**. Zoege jemand `zugangscodes` in eine eigene Schemadatei, fiele die Zahl auf 5, **der Waechter bliebe gruen, und die Tabelle waere wieder unbewacht** — dieselbe Fehlerklasse, die der Schlussfix gerade geschlossen hat. Abhilfe ist ein Einzeiler (`toBe(6)`) | **Bauweg Spec 1, Planteil zu Kapitel 3** — dort wird `zugangscodes` gebaut, das ist der natuerliche Ort. Kein Merge-Blocker |

### ⚠️ Und ein Fund am Repo, der jedes Tor dieses Wegs betrifft

**Der volle `rtk pnpm vitest run` ist vorbestehend rot** — am 2026-08-20 gemessen **170 Fehlschlaege
in 9 Dateien** (`m/feedback`, `m/files`, `m/qr`, `components/providers`). Gegenprobe mit zwei vollen
Laeufen, einmal mit und einmal **ohne** die vier B1–B4-Dateien: **ohne** sie sind es **171 in 10
Dateien**, also einer **mehr**. Die Fehlschlaege sind von dieser Arbeit unabhaengig. Leitbild:
`TypeError: Cannot read properties of undefined (reading 'clear')` auf `localStorage.clear()` in
`m/feedback/f/[slugSecret]/Zettel.test.tsx` — diese Tests laufen in der `node`-Umgebung statt in
jsdom. Ein Verdacht, **nicht geprueft**: `pnpm-lock.yaml` fuehrt `vitest@4.1.10`, die Plaene haben
gegen `4.1.5` gemessen.

> ✅ **UEBERHOLT am 2026-08-21.** Die Suite ist vollstaendig gruen — `441 passed (441)`
> Testdateien, `7991 passed (7991)` Tests, Exit 0. Die Ursache der 170 war die, die der
> Absatz oben als Leitbild nennt: Node 26 bringt ein eigenes `localStorage` mit, das jsdoms
> verdeckt. Gerichtet auf `main` in `d085057` und `40981bc`. Messung und Randbedingungen:
> `docs/superpowers/berichte/2026-08-21-vitest-basislinie.md`.

**Zwei Folgen:**

* **Das Tor „voller `vitest run` gruen" ist heute nicht erreichbar.** Bis das gerichtet ist, gilt als
  Tor: `typecheck` **0 Fehler** · `lint` **0 Fehler** · **die eigenen Testdateien gruen** · **kein
  neuer Fehlschlag** in einer unberuehrten Datei. Der Streitfall wird mit der
  **Beiseitelege-Gegenprobe** entschieden, nicht mit dem Zaehlwert.

  > ✅ **UEBERHOLT am 2026-08-21.** Das Tor „voller `vitest run` gruen" ist wieder erreichbar
  > (441/441 Testdateien, 7991/7991 Tests, Exit 0). Die Ersatzformel (typecheck 0 · lint 0 ·
  > eigene Dateien gruen · kein neuer Fremdfehlschlag) bleibt gueltig und ist die schaerfere
  > Lesart — sie ist ab jetzt nur nicht mehr die einzig moegliche. Beleg:
  > `docs/superpowers/berichte/2026-08-21-vitest-basislinie.md`.

* ⛔ **§3.6 Nr. 1 verlangt drei gruene Tests vor der ersten Generalprobe.** Solange die Suite so
  bleibt, kann **keine** radio-Aufgabe ihr Tor plankonform gruen melden. Die 170 zu richten ist ein
  **eigener Auftrag** an `m/feedback` und `m/files` plus die vitest-Frage — er ist **vor dem
  Cutover** faellig und steht in keinem der fuenf Plaene.

  > ✅ **UEBERHOLT am 2026-08-21.** Die Suite ist vollstaendig gruen, §3.6 Nr. 1 ist damit nicht
  > mehr durch eine rote Suite blockiert, und der Auftrag „die 170 richten" ist erledigt. Beleg:
  > `docs/superpowers/berichte/2026-08-21-vitest-basislinie.md`.

### ⛔ Und ein zweiter Fund am Werkzeug, der jedes Tor UNSICHTBAR gruen macht (2026-08-21)

**`rtk pnpm typecheck` meldet „No errors found", wo `tsc` fuenf Fehler hat.** Gemessen im Block
B8–B13, an einem Stand, der rot sein **muss** (fuenf Importe auf noch nicht existierende Exporte):

| Befehl | Meldung |
|---|---|
| `rtk pnpm typecheck` | **`TypeScript: No errors found`** ← **FALSCHES GRUEN** |
| `pnpm typecheck` (roh) | `Found 5 errors in the same file`, Exit 1 |
| `NO_COLOR=1 FORCE_COLOR=0 rtk pnpm typecheck` | **`TypeScript: 5 errors in 1 files`** ← korrekt |

**Ursache — ZWEI Stolpersteine, beide gemessen.** Die erste Diagnose („es ist tscs Farbe") war
unvollstaendig; erst ein provozierter `TS2339` an drei Aufrufwegen hat es getrennt:

| Aufruf | Meldung |
|---|---|
| `rtk tsc --noEmit` | **falsches Gruen** ← Stolperstein 1: tscs **pretty**-Form (`datei.ts:22:3 - error TS…` mit ANSI-Sequenzen), die tsc in jeder TTY selbst waehlt |
| `rtk tsc --noEmit --pretty false` | **korrekt** |
| `rtk pnpm typecheck` **mit** `--pretty false` im Skript | **falsches Gruen** ← Stolperstein 2: pnpms eigene farbige Kopfzeile `\e[2m$ tsc --noEmit\e[22m`, obwohl tscs Ausgabe schon unfarbig ist |
| `NO_COLOR=1 rtk pnpm typecheck` | **korrekt** |

Der tee-Log enthaelt in allen Faellen den vollstaendigen roten Output — **die Fehler kommen bei RTK
an, der Parser sieht sie nicht.** ⚠️ `pnpm --color=false` und ein `.npmrc` mit `color=false` helfen
**nicht**: die dim-Sequenz der Kopfzeile bleibt. Nur `NO_COLOR=1` entfernt sie.

**Warum das hier stehen muss:** `CLAUDE.md` schreibt `rtk` fuer jeden Befehl vor, und
`rtk pnpm typecheck` ist das **erste** Tor jeder Aufgabe dieses Wegs. Ein Tor, das nicht rot werden
kann, ist kein Tor.

⚠️ **Nachgemessen und entlastet:** die vier Commits dieser Sitzung (`903ed0b`, `60cdfc3`, `1029ba3`,
`dfbe5b3`) sind in einem eigenen Worktree einzeln mit `NO_COLOR=1` geprueft — **alle vier wirklich
0 Fehler**. Die Tormeldungen waren inhaltlich richtig, nur unzuverlaessig belegt. Fuer aeltere
Aufgaben (B1–B4, M1–M6) ist das **nicht** nachgemessen.

### ✅ Behoben am 2026-08-21 — an beiden Stolpersteinen

1. **`package.json`: `"typecheck": "tsc --noEmit --pretty false"`** (Commit `1d96200`). Macht die
   Ausgabe formatstabil, unabhaengig davon, ob am anderen Ende ein Terminal haengt — eine Zeile je
   Fehler, alle Informationen erhalten, token-sparsamer als der fuenfzeilige pretty-Rahmen.
2. **`NO_COLOR=1` in Claude Codes `env`** (`~/.claude/settings.json`, **ausserhalb dieses Repos** —
   kein Commit dazu in dieser Historie). Nimmt pnpm die farbige Kopfzeile.

**Gegengeprueft in beide Richtungen**, mit einem provozierten `TS2339` und nach seiner Ruecknahme:

| Zustand | `NO_COLOR=1 rtk pnpm typecheck` | `rtk tsc --noEmit --pretty false` | roher Exit |
|---|---|---|---|
| **rot** (Tippfehler in `toNeuenBenutzer`) | `1 errors in 1 files` | `1 errors in 1 files` | 2 |
| **gruen** (zurueckgenommen) | `No errors found` | `No errors found` | 0 |

Der Nutzen war sofort ablesbar: der Test-zuerst-Schritt von **NT2** (`zuBoolOptional(undefined)`)
erzeugte ein `TS2345`, und der reparierte Filter hat es **gemeldet** statt verschluckt.

**Der Vollbeweis, ohne jede Praefixierung:** dass Claude Codes `env` bei Bash-Aufrufen ankommt, ist
nicht angenommen, sondern gemessen (`$NO_COLOR` ist in der laufenden Sitzung `1`, ebenso die zwei
schon vorher gesetzten Variablen) — die Aenderung wirkt **sofort**, nicht erst nach einem Neustart.
Danach nochmals mit einem provozierten `TS2339` geprueft, diesmal mit dem nackten Kommando, das die
Plaene vorschreiben:

| Zustand | `rtk pnpm typecheck` (ohne Praefix) |
|---|---|
| **rot** | `scripts/import/radio.ts(293,16): error TS2339: …` · `TypeScript: 1 errors in 1 files` |
| **gruen** | `TypeScript: No errors found` |

✅ **Die CI ist unberuehrt.** `.github/workflows/ci.yml:52` fuehrt `pnpm typecheck` nackt aus; es gibt
keinen Problem-Matcher, keine Annotation und kein Skript, das tscs Ausgabeformat parst — dort
entscheidet allein der Exit-Code, und der war nie das Problem.

⚠️ **RTK selbst ist damit nicht gerichtet.** Der Filter bleibt anfaellig, sobald irgendwo Farbe
durchkommt — bei einem anderen Skript, einem anderen Projekt, einer anderen Shell. RTK ist ein
Fremdwerkzeug (`github.com/rtk-ai/rtk`, Apache-2.0, ueber homebrew-core installiert, hier 0.45.0),
kein Bestandteil dieses Repos; **ein Upstream-Bericht steht aus** und ist Rubens Entscheidung.
⚠️ Wer den Filter selbst gegenpruefen will, darf **nicht** `grep -cE "error TS"` auf farbigem Output
benutzen — dort steht die ANSI-Sequenz zwischen `error` und `TS`, und `grep` zaehlt **0**. Genau
dieser Messfehler hat mich in dieser Sitzung einmal auf die falsche Spur gesetzt.

---

# Der Cutover-Weg — C1 bis C41

Erzeugt **ein Dokument**: `docs/runbooks/radio-cutover.md`.
Fuehrt `2026-08-18-radio-cutover-leitplan.md` — dort stehen die Nahtstellen NS1–NS14 und die
Aenderungstabelle. Die §-Marken sind die **nach NS2 verbindlichen**, nicht durchgehend die der
Teiltexte.

✅ **Alle 41 Haekchen sind am 2026-08-28 gesetzt worden, und sie stuetzen sich auf zwei Messungen,
nicht auf eine Erinnerung:** `.superpowers/sdd/runbook/K-vollstaendigkeit.md` hat das fertige
Runbook gegen die Aufgabenliste gehalten und **41/41 abgebildet** gezaehlt, bei **0** Abweichungen
in allen neun nachgefahrenen Gegenlesungsbloecken; ihre zwei Zeilen „C-Deliverables ausserhalb des
Runbooks nicht ausgefuehrt" nennen genau **C2** und **C41**, und beide sind seither gebaut
(`0fc85370`, `d8fe3bd`). ⚠️ **„Abgebildet" ist Abdeckung, nicht Fehlerfreiheit** — die vier
abend-anhaltenden Funde derselben Kritik (F1–F4) sind eingearbeitet, die zwei grep-baren davon vor
dem Setzen der Haekchen gegengeprueft: `IMG=` steht jetzt auch im Fenster
(`radio-cutover.md:4444`, per `docker inspect` statt als Abschrift), und die Zeile
`existierte vor diesem Start nicht` ist aus der WARN-Liste heraus und traegt einen eigenen,
ankergestuetzten Stopp (`:4404`, `# MUSS 0 sein`).

- [x] **C1** Runbook anlegen: Kopf, ⚠️-Kopfabschnitt, §0, Abschnittsanker  
      `2026-08-18-plan4-radio-cutover.md:166` — Aufgabe 1
- [x] **C2** `compose.yaml`: sechs Redirect-Labels des Alt-Hosts + Regressionstest  
      `2026-08-18-plan4-radio-cutover.md:347`
- [x] **C3** `.env.example`: `radio`-Block, Prod-Domain-Zeile, Rollback-Handgriff  
      `2026-08-18-plan4-radio-cutover.md:565`
- [x] **C4** §L — der Leseapparat auf beiden Armen, mit lauf-abhängiger Lesart  
      `2026-08-18-plan2-radio-paritaet.md:679`
- [x] **C5** §V — die dreizehn Vorabfragen A1–A13 mit Ergebnisspalte  
      `2026-08-18-plan2-radio-paritaet.md:883`
- [x] **C6** §S.1/§S.2 — Zeilenauswahl und die drei symmetrischen Abfragen  
      `2026-08-18-plan2-radio-paritaet.md:1280`
- [x] **C7** §S.3 — die Zeitstempel-Stichprobe, mit berichtigter Lesart  
      `2026-08-18-plan2-radio-paritaet.md:1475`
- [x] **C8** §S.4 — `devices.last_updated_at`, der Sonderfall  
      `2026-08-18-plan2-radio-paritaet.md:1661`
- [x] **C9** §Z — die Gegenzählungen nach dem Import  
      `2026-08-18-plan2-radio-paritaet.md:1807`
- [x] **C10** §P.0 — Eingaben und Ablesungen der Generalprobe  
      `2026-08-18-plan3-radio-generalprobe.md:129` — Aufgabe 1
- [x] **C11** §P.1 — Was vor der Generalprobe grün sein muss  
      `2026-08-18-plan3-radio-generalprobe.md:269` — Aufgabe 2
- [x] **C12** §P.2 — Der Schnappschuss der Alt-Datenbank  
      `2026-08-18-plan3-radio-generalprobe.md:405` — Aufgabe 3
- [x] **C13** §P.3 — Die dreizehn Abfragen gegen die Kopie, vor dem Import  
      `2026-08-18-plan3-radio-generalprobe.md:538` — Aufgabe 4
- [x] **C14** §P.4 — Wegwerf-Aufbau und Import  
      `2026-08-18-plan3-radio-generalprobe.md:652` — Aufgabe 5
- [x] **C15** §P.5 — Die Gegenzählungen im Ziel  
      `2026-08-18-plan3-radio-generalprobe.md:872` — Aufgabe 6
- [x] **C16** §P.6 — Die fünf Verwechslungspaare, feldweise  
      `2026-08-18-plan3-radio-generalprobe.md:1041` — Aufgabe 7
- [x] **C17** §P.7 — Die Gegenprobe gegen den Faktor 1000  
      `2026-08-18-plan3-radio-generalprobe.md:1245` — Aufgabe 8
- [x] **C18** §P.8 — Der ephemere Prüfcontainer  
      `2026-08-18-plan3-radio-generalprobe.md:1419`
- [x] **C19** §P.9 — Der kopfgestützte Prüfsatz (Stufe 1)  
      `2026-08-18-plan3-radio-generalprobe.md:1740`
- [x] **C20** §P.10 — Der browsergestützte Prüfsatz (Stufe 3)  
      `2026-08-18-plan3-radio-generalprobe.md:1970`
- [x] **C21** §P.11 — Das Log der Probe  
      `2026-08-18-plan3-radio-generalprobe.md:2146`
- [x] **C22** §P.12 — Aufräumen, und die zwei Messungen für das Fenster  
      `2026-08-18-plan3-radio-generalprobe.md:2238`
- [x] **C23** §P.13 — Der Abbruchpunkt: was rot macht und was rot bedeutet  
      `2026-08-18-plan3-radio-generalprobe.md:2348`
- [x] **C24** §P.14 — Was am ephemeren Container nicht prüfbar ist  
      `2026-08-18-plan3-radio-generalprobe.md:2486`
- [x] **C25** §A — Was vor dem Fenster fertig sein muss (**vierzehn** Punkte)  
      `2026-08-18-plan4-radio-cutover.md:755`
- [x] **C26** §B — Die `.env`, mit genau **drei** ⏸-Zeilen  
      `2026-08-18-plan4-radio-cutover.md:972`
- [x] **C27** §C Schritt 1–3 — Freeze, echter Snapshot, Volume sichern  
      `2026-08-18-plan4-radio-cutover.md:1200`
- [x] **C28** §C Schritt 4–5 — Import, Paritaet, Feldstichproben, Abfrage R und Abfrage Z  
      `2026-08-18-plan4-radio-cutover.md:1400`
- [x] **C29** §C Schritt 6–9 — `.env` scharf, `up -d`, Prüfcontainer, Router  
      `2026-08-18-plan4-radio-cutover.md:1718`
- [x] **C30** §D + §E — die Abnahme (**sechzehn** Punkte) und der Service Worker  
      `2026-08-18-plan4-radio-cutover.md:1965`
- [x] **C31** §F + §G — Ausstellungsplan und Rückweg  
      `2026-08-18-plan4-radio-cutover.md:2271`
- [x] **C32** §5.1 — Standby: drei Fristen und das Protokollformular  
      `2026-08-18-plan5-radio-abbau.md:151`
- [x] **C33** §5.2 — Die Zählungen gegen radio-admin: A, T, R, Z und Abfrage 8  
      `2026-08-18-plan5-radio-abbau.md:291`
- [x] **C34** §5.3 — Die Zählungen gegen radio-inventar: P1 bis P6  
      `2026-08-18-plan5-radio-abbau.md:615`
- [x] **C35** §5.4 — Die Archivprobe: beide Dateien werden geöffnet  
      `2026-08-18-plan5-radio-abbau.md:834`
- [x] **C36** §5.5 — Die Abbauliste und der Sperrenkasten  
      `2026-08-18-plan5-radio-abbau.md:933`
- [x] **C37** §5.6 — Die Geheimnisse: der Posten, der liegen bleibt  
      `2026-08-18-plan5-radio-abbau.md:1060`
- [x] **C38** §5.7 — Der alte Purge ist kein Cron  
      `2026-08-18-plan5-radio-abbau.md:1156`
- [x] **C39** §5.8 + §5.9 — Der Redirect und sein Ende · was der Abbau nicht anfasst  
      `2026-08-18-plan5-radio-abbau.md:1325`
- [x] **C40** §H — Die Erfüllungspunkte: die Klammer, die um 23 Uhr gelesen wird  
      `2026-08-18-plan5-radio-abbau.md:1470`
- [x] **C41** Der datierte Nachtrag in Spec 2 — sieben Stellen und zwei Anhangszeilen  
      `2026-08-18-plan5-radio-abbau.md:1695`

---

## ⏸ ZAESUR — vor dem Cutover-Abend

Drei Dinge, die aus keinem Plan kommen:

- [ ] **Die 16 Betreiberfragen beantwortet** — `SPERREN-radio-spec2.md`, Tabelle (c). ⛔ Blockierend
      sind **U4/C.5** (Auslieferungsweg des Alt-Frontends) und **C.6/B4** (Updater-Rechtestufe)
- [ ] **Die Server-Ablesungen eingeholt** — `SPERREN-radio-spec2.md`, Tabelle (b): echte
      Volume-Namen (E2, E3), Traefik-Containername (E7), Suite-Containername und Loopback-Port
      (L13), und ⛔ **die heutige Router-Regel beider Hosts woertlich protokolliert** (§A Nr. 13) —
      ohne sie hat der erste Handgriff des Umschwenks kein ausfuehrbares Ziel
- [ ] **Die vier blockierenden Re-Kritik-Funde in Spec 2 nachgezogen** —
      `docs/superpowers/berichte/2026-08-19-re-kritik-radio-spec2.md`. Sie betreffen die **Spec**,
      nicht die Plaene; **C41** traegt die Nachtraege ein. Der schaerfste ist **RK-A3**: der Rueckweg
      startet den Alt-Kiosk **ohne** `--profile full-app` und laeuft ohne Fehlermeldung ins Leere —
      in der einen Stunde, in der es keine zweite Gelegenheit gibt.
      ⚠️ **Haelfte erledigt am 2026-08-28 (`d8fe3bd`), Haelfte offen — und die offene ist die, die
      am Abend getippt wird.** C41 hat die **Bewertung** nachgezogen: Anhang **A-3** nennt den Fund
      nicht mehr „harmlos", sondern „teilweise bestaetigt", mit dem Repo-Beleg
      `radio-inventar@f883ec4:docker-compose.yml:27` (`profiles: ["full-app"]` am `backend`,
      `postgres` auf `:3` ohne). ⛔ **Der BEFEHL in §4.9 3b traegt das Profil weiterhin nicht** —
      das ist **Zusage 3** an den Planteil zu Kapitel 4 (Plan 5, „Was dieser Teil anderen
      Planteilen zusagt"), und dieselbe Zusagenliste fuehrt drei weitere offene: `$VOL_SUITE` im
      Rueckweg-Nachtrag (**RK-2** in `SPERREN-radio-spec2.md`), §4.5 Schritt 3 „fuenf (P1–P5)"
      statt sechs, und §4.2 Nr. 3 mit seinem zweiten, nicht ausfuehrbaren Zweig

---

# Der Abend selbst

Ab hier wird kein Plan mehr abgearbeitet, sondern das entstandene Runbook **gefahren**.
Die Marken sind die des Runbooks.

- [ ] **Generalprobe** (§G0–§G14). Der **einzige** Weg, vor dem Umschwenk ueberhaupt etwas zu
      pruefen: es gibt kein Parallelfenster, der Alt-Kiosk laeuft schon heute unter
      `radio.iuk-ue.de`. Liefert ausserdem die zwei Messungen, die das Fenster bemessen (U8)
- [ ] **Das Fenster** (§A–§E): Freeze · Snapshot mit `.backup` · Volume sichern · Import mit
      Paritaetscheck · Pruefcontainer ohne Traefik-Labels · **ein** Umschwenk fuer **beide**
      Domains · Abnahme · Service Worker
- [ ] **Standby und Abbau** (§5.1–§5.9): die drei Fristen, die acht Abbau-Sperren, die Abbauliste.
      ⛔ **Der Abbau ist die einzige unumkehrbare Handlung des ganzen Wegs** — jede Sperre ist eine
      Zaehlung, die dokumentiert, *was* verworfen wird

---

# Mitzulesen

Basisverzeichnis, wo nicht anders angegeben: `docs/superpowers/plans/`.

| Dokument | Wozu |
|---|---|
| `../specs/2026-08-17-radio-modul-design.md` | **Spec 1 — das Modul.** Kapitel **A** (15 gesetzte Entscheidungen), **B** (B1–B19, entschiedene Widersprueche), **C** (was offen ist). Was in A und B steht, gilt — auch wenn ein Kapiteltext abweicht |
| `../specs/2026-08-18-radio-cutover-design.md` | **Spec 2 — der Weg.** Der **Rahmen** (Zeilen 1–561) traegt die neun harten Randbedingungen, die ⬜-Tabelle L1–L14, die Betreibertabelle und die Widersprueche W1–W11. Wer nur eine Stelle liest, liest diese |
| `../../radio-portierung-analyse.md` | die Vorarbeit. Verbindlich sind **Kapitel 4** (1:1-Pflichten) und **Kapitel 5** (Fallen, die kein Gate findet) |
| `2026-08-18-radio-bau-leitplan.md` | die Nahtstellen NS1–NS11 zwischen Plan 1 und 2, die Reihenfolge-Invariante, die globalen Randbedingungen des Bauwegs |
| `2026-08-18-radio-cutover-leitplan.md` | die Nahtstellen NS1–NS14 zwischen Plan 2, 3, 4 und 5 — darunter die Aufloesung, wo Generalprobe und Fenster dieselben Handgriffe **verschieden** fahren (Bind-Pfad gegen benanntes Volume) |
| `2026-08-21-radio-modul-leitplan.md` | **der Bauweg von Spec 1** — die fuenf Planteile, die Nahtstellen NS-M1 bis NS-M8, und die drei Stellen, an denen die Spec-Prosa von ihrem eigenen Kapitel B ueberholt ist |
| `2026-08-21-radio-modul-plan1-datenhaltung.md` | Planteil 1 dieses Wegs: **M1–M6**. Hebt Zaesur 1 fuer **B5–B17** |
| `../berichte/2026-08-21-radio-datenhaltung-ablesungen.md` | die abgelesenen ⬜ L1, L3, L4 und M-L1, die Grundlage fuer **B5–B17** sowie **C9** und **C15** |
| `SPERREN-radio-spec2.md` | was offen ist, **wer** es beantwortet, und was solange stillsteht |
| `ENTSCHEIDUNGEN-radio.md` | die sieben Punkte, die dir zur Entscheidung vorliegen |
| `berichte/2026-08-19-re-kritik-radio-spec2.md` | 34 Funde an Spec 2, vier blockierend — sie betreffen die Spec, nicht die Plaene |
| `berichte/2026-08-19-gegenpruefung-radio-plaene.md` | 15 Funde an den Plaenen, alle eingearbeitet |
| `berichte/2026-08-19-einarbeitung-radio-plaene.md` · `-restarbeiten-radio-plaene.md` | wie sie eingearbeitet und nachgemessen wurden |
| `berichte/2026-08-21-vitest-basislinie.md` | die neu gemessene Grundlinie der vollen Testsuite (441/441 Testdateien, 7991/7991 Tests, Exit 0) — hebt die 170-Fehlschlaege-Randbedingung weiter unten in diesem Dokument auf |

## Ausfuehrungsart

Die Plaene tragen die Auflage `superpowers:subagent-driven-development` (empfohlen) oder
`superpowers:executing-plans`. Bei 58 Aufgaben und einer Reihenfolge, die in beiden Leitplaenen
geprueft ist, traegt der **subagentgetriebene** Weg besser: ein frischer Subagent je Aufgabe,
Review dazwischen.
