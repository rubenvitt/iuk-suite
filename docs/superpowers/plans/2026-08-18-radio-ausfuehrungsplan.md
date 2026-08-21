# Der Weg `radio` — Ausfuehrungsplan

> **Die eine Seite, die den Fortschritt fuehrt.** Sie zaehlt alle Aufgaben in der Reihenfolge auf, in
> der sie abzuarbeiten sind, und markiert die Zaesuren, an denen die Arbeit auf etwas wartet, das
> kein Plan herstellen kann.
>
> **64 Aufgaben, aus zwei Wegen:** **58** aus den fuenf Plaenen zu **Spec 2** (B1–B17 Bau,
> C1–C41 Cutover) und **6** aus Planteil 1 zum Bau von **Spec 1** (**M1–M6**), geschrieben seit dem
> 2026-08-21 und **gebaut** — sie heben Zaesur 1 fuer B5–B17. Die M-Aufgaben stehen unten **an ihrem
> Platz in der Reihenfolge** — zwischen B4 und B5, denn genau dort liegt die Naht.
> **13 von 64 Aufgaben sind erledigt** (B1–B7, M1–M6).

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
4. **B1–B5 und M1–M6 sind gebaut** (2026-08-20 und 2026-08-21): B1–B4 die ganze **Quellseite** des
   Importers — die Fixture aus `radio-admin@265abd5`, die Rohzeilen, die Zeitachse, `lieseQuelle`
   (fuenf signierte Commits `a309f12` → `07b5f41`, **17 Tests gruen**); M1–M6 die **Zielseite**
   (Planteil 1 von Spec 1, Kapitel 2) — `src/app/m/radio/_db/` und `_lib/` existieren jetzt
   (Commits `1ebb334` · `d3fc13c` · `36088e7` · `25c8c34` · `b96db98`); **B5** der erste Mapper und
   die erste Stelle, an der Quellseite und Zielschema sich beruehren (Commit `903ed0b`,
   **23 Tests gruen**); **B6** und **B7** die vier uebrigen Mapper, womit die ganze
   **Mapper-Schicht** steht (Commits `60cdfc3` · `1029ba3`, **35 Tests gruen**).
   **B8 ist die naechste ausfuehrbare Aufgabe — und sie ist der Anfang des Blocks B8–B13.**
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
- [ ] **B8** Der Vollständigkeitstest der Paritätssichten — er kommt zuerst  
      `2026-08-18-plan2-radio-paritaet.md:110` — Aufgabe 1
- [ ] **B9** Die Sichtgrundlage: `sekunden`, `RadioDb`, `paritaetsSichtGeraet`, das getaggte Multiset, `checkRadioParitaet`  
      `2026-08-18-plan1-radio-import.md:1822` — Aufgabe 7
- [ ] **B10** `paritaetsSichtBenutzer` — `users`, 3 Spalten  
      `2026-08-18-plan2-radio-paritaet.md:337` — Aufgabe 2
- [ ] **B11** `paritaetsSichtSoftwareVersion` — `software_versions`, 6 Spalten  
      `2026-08-18-plan2-radio-paritaet.md:408` — Aufgabe 3
- [ ] **B12** `paritaetsSichtGeraeteEreignis` — `device_events`, 8 Spalten  
      `2026-08-18-plan2-radio-paritaet.md:490` — Aufgabe 4
- [ ] **B13** `paritaetsSichtLeihe` — `loans`, 12 Spalten (11 aus der Quelle, eine neu)  
      `2026-08-18-plan2-radio-paritaet.md:572` — Aufgabe 5
- [ ] **B14** `importiereRadio` — Einfügereihenfolge, Konfliktstrategien, Paritäts-Rundlauf  
      `2026-08-18-plan1-radio-import.md:2066` — Aufgabe 8
- [ ] **B15** Die vier asymmetrischen Idempotenzfälle A · B · C · D  
      `2026-08-18-plan1-radio-import.md:2315` — Aufgabe 9
- [ ] **B16** `runRadioImport`, die Zählzeile, die Transaktion, der CLI-Block  
      `2026-08-18-plan1-radio-import.md:2570` — Aufgabe 10
- [ ] **B17** Abnahme von Hand — der Trockenlauf über die Kommandozeile  
      `2026-08-18-plan1-radio-import.md:2725` — Aufgabe 11

---

## Nachtraege — was der Bau von B1–B4 an den Dokumenten gefunden hat

Fuenf Funde: drei vom 2026-08-20 (B1–B4) und zwei aus dem Abschluss-Review des M1–M6-Laufs
(2026-08-21). Sie betreffen **die Plaene und das Repo**, nicht den gebauten Code — der ist gruen und
gegengeprueft. Wer sie nicht eintraegt, laeuft beim naechsten Durchgang erneut hinein.

| # | Fund | Wo er hingehoert |
|---|---|---|
| **NT1** | ⛔ **`2026-08-18-plan1-radio-import.md`, Aufgabe 4 widerspricht sich selbst.** Schritt 1 gibt den Quelltext-Scan wortwoertlich vor (`expect(quelltext).not.toMatch(/select\s+\*/i)`), Schritt 3 gibt einen Kopfkommentar fuer `lieseQuelle` vor, der die Zeichenkette `` `SELECT *` `` als **Zitat des Anti-Vorbilds** (`scripts/import/feedback.ts:66-72`) selbst enthaelt — und Schritt 4 sagt „17 passed" voraus. Der Scan unterscheidet nicht zwischen einem Statement und einem Prosa-Zitat. **Beide Wortlaute stammen aus dem Plan**, der Widerspruch liegt dort | **Nachtrag am Plan**, Aufgabe 4 Schritt 3. Gebaut wurde der Test **streng** und der Kommentar umformuliert („liest fuenfmal ohne Spaltenliste") — die Entscheidung steht, sie gehoert nur ins Dokument |
| **NT2** | **`zuBoolOptional(undefined)` gibt `false` zurueck**, nicht `null` — genau die Faltung, die der Kommentar zwei Zeilen darueber namentlich verbietet, und asymmetrisch zu `msZuDatumOptional`, das `undefined` ausdruecklich behandelt. Signatur **und** Rumpf sind planvorgegeben, ebenso der blinde Cast `.all() as AltGeraet[]`, ueber den `undefined` ueberhaupt erst ankaeme. **Am 2026-08-21 mit dem Bau von B5 nachgemessen: NICHT tragend.** `AltGeraet.alamos_integrated` und `.loanable` sind `0 \| 1 \| null`, **nicht optional** (`scripts/import/radio.ts:126-127`) — der `undefined`-Zweig ist von `toNeuesGeraet` aus typseitig unerreichbar, und der `SELECT` nennt beide Spalten namentlich. Bleibt eine **Haertung gegen den blinden Cast**, kein Fehler im Datenweg | **Entscheidung an Ruben**, dann Nachtrag am Plan. Kleinste Behebung: `(v: 0 \| 1 \| null \| undefined) => (v === null \|\| v === undefined ? null : v === 1)`. ⚠️ **Nicht mehr blockierend fuer B5** (gebaut). Naechster moeglicher Verbraucher: **B6**, `software_versions.is_target` — dort aber ueber NT5 |
| **NT3** | **Der `SELECT *`-Scan ist loechrig:** `/select\s+\*/i` laesst `SELECT d.*` und `select*from` durch (beides gueltiges SQLite, der Tokenizer braucht kein Trennzeichen) und schlaegt bei Prosa-Zitaten falsch an. Testzeile und Regex sind planvorgegeben | **Nachtrag am Plan**, Aufgabe 4 Schritt 1 |
| **NT4** | **Die Zaehlprobe gegen den `zuBoolOptional`-Fund (NT2) gehoert ins Cutover-Runbook.** NT2 beschreibt, dass `zuBoolOptional(undefined)` `false` statt `null` liefert und ab B5 tragend wird. Das Abschluss-Review von M1–M6 hat ergaenzt, **warum das nach dem Import nicht mehr nachweisbar ist**: `devices.alamosIntegrated` und `devices.loanable` sind die zwei **nullable** `mode: "boolean"`-Spalten des neuen Schemas, und ein falsch gefaltetes `false` ist dort **nicht mehr von einem echten `false` zu unterscheiden** („Alamos nicht erfasst" wird „nicht integriert") und ist paritaetsgruen. Die **einzige** Probe, die es faengt: `select count(*) from devices where loanable is null` und dasselbe fuer `alamos_integrated`, **Quelle gegen Ziel** | **Nachtrag im Cutover-Runbook**, Plan 4 §C Schritt 4–5 (Import, Paritaet, Feldstichproben) — als Feldstichprobe Quelle gegen Ziel. Betrifft **C28** |
| **NT5** | **Ein Reibungspunkt an der Naht zu B5, der eine Zeile Mapper kostet und keine Schemaaenderung:** `AltVersion.is_target` ist in `scripts/import/radio.ts` als `number` typisiert, `zuBoolOptional` nimmt aber `0 \| 1 \| null`. B5 (bzw. B6, wo `software_versions` gemappt wird) braucht dort ein `row.is_target === 1` inline oder einen zweiten Helfer. Das Abschluss-Review von M1–M6 hat die Naht **Feld fuer Feld** geprueft und sonst **keinen** Bruch gefunden: `AltGeraet` (25 Felder) → `NeuesGeraet` (25 Spalten) ist deckungsgleich in Name, Nullability und Reihenfolge, `last_updated_at: number\|null` → `lastUpdatedAt: string\|null` ist genau der Bruch, den `tagInBerlin` bedient, und `AltLeihe` (11) → `NeueLeihe` (12) traegt die zwoelfte nullable ohne Default, also im `$inferInsert` optional | **Auftrag an B5/B6** (Naht NS-M2/NS-M3) — eine Zeile Mapper (`row.is_target === 1` oder ein zweiter Helfer), keine Schemaaenderung |

### ⚠️ Und ein Fund am Repo, der jedes Tor dieses Wegs betrifft

**Der volle `rtk pnpm vitest run` ist vorbestehend rot** — am 2026-08-20 gemessen **170 Fehlschlaege
in 9 Dateien** (`m/feedback`, `m/files`, `m/qr`, `components/providers`). Gegenprobe mit zwei vollen
Laeufen, einmal mit und einmal **ohne** die vier B1–B4-Dateien: **ohne** sie sind es **171 in 10
Dateien**, also einer **mehr**. Die Fehlschlaege sind von dieser Arbeit unabhaengig. Leitbild:
`TypeError: Cannot read properties of undefined (reading 'clear')` auf `localStorage.clear()` in
`m/feedback/f/[slugSecret]/Zettel.test.tsx` — diese Tests laufen in der `node`-Umgebung statt in
jsdom. Ein Verdacht, **nicht geprueft**: `pnpm-lock.yaml` fuehrt `vitest@4.1.10`, die Plaene haben
gegen `4.1.5` gemessen.

**Zwei Folgen:**

* **Das Tor „voller `vitest run` gruen" ist heute nicht erreichbar.** Bis das gerichtet ist, gilt als
  Tor: `typecheck` **0 Fehler** · `lint` **0 Fehler** · **die eigenen Testdateien gruen** · **kein
  neuer Fehlschlag** in einer unberuehrten Datei. Der Streitfall wird mit der
  **Beiseitelege-Gegenprobe** entschieden, nicht mit dem Zaehlwert.
* ⛔ **§3.6 Nr. 1 verlangt drei gruene Tests vor der ersten Generalprobe.** Solange die Suite so
  bleibt, kann **keine** radio-Aufgabe ihr Tor plankonform gruen melden. Die 170 zu richten ist ein
  **eigener Auftrag** an `m/feedback` und `m/files` plus die vitest-Frage — er ist **vor dem
  Cutover** faellig und steht in keinem der fuenf Plaene.

---

# Der Cutover-Weg — C1 bis C41

Erzeugt **ein Dokument**: `docs/runbooks/radio-cutover.md`.
Fuehrt `2026-08-18-radio-cutover-leitplan.md` — dort stehen die Nahtstellen NS1–NS14 und die
Aenderungstabelle. Die §-Marken sind die **nach NS2 verbindlichen**, nicht durchgehend die der
Teiltexte.

- [ ] **C1** Runbook anlegen: Kopf, ⚠️-Kopfabschnitt, §0, Abschnittsanker  
      `2026-08-18-plan4-radio-cutover.md:166` — Aufgabe 1
- [ ] **C2** `compose.yaml`: sechs Redirect-Labels des Alt-Hosts + Regressionstest  
      `2026-08-18-plan4-radio-cutover.md:347`
- [ ] **C3** `.env.example`: `radio`-Block, Prod-Domain-Zeile, Rollback-Handgriff  
      `2026-08-18-plan4-radio-cutover.md:565`
- [ ] **C4** §L — der Leseapparat auf beiden Armen, mit lauf-abhängiger Lesart  
      `2026-08-18-plan2-radio-paritaet.md:679`
- [ ] **C5** §V — die dreizehn Vorabfragen A1–A13 mit Ergebnisspalte  
      `2026-08-18-plan2-radio-paritaet.md:883`
- [ ] **C6** §S.1/§S.2 — Zeilenauswahl und die drei symmetrischen Abfragen  
      `2026-08-18-plan2-radio-paritaet.md:1280`
- [ ] **C7** §S.3 — die Zeitstempel-Stichprobe, mit berichtigter Lesart  
      `2026-08-18-plan2-radio-paritaet.md:1475`
- [ ] **C8** §S.4 — `devices.last_updated_at`, der Sonderfall  
      `2026-08-18-plan2-radio-paritaet.md:1661`
- [ ] **C9** §Z — die Gegenzählungen nach dem Import  
      `2026-08-18-plan2-radio-paritaet.md:1807`
- [ ] **C10** §P.0 — Eingaben und Ablesungen der Generalprobe  
      `2026-08-18-plan3-radio-generalprobe.md:129` — Aufgabe 1
- [ ] **C11** §P.1 — Was vor der Generalprobe grün sein muss  
      `2026-08-18-plan3-radio-generalprobe.md:269` — Aufgabe 2
- [ ] **C12** §P.2 — Der Schnappschuss der Alt-Datenbank  
      `2026-08-18-plan3-radio-generalprobe.md:405` — Aufgabe 3
- [ ] **C13** §P.3 — Die dreizehn Abfragen gegen die Kopie, vor dem Import  
      `2026-08-18-plan3-radio-generalprobe.md:538` — Aufgabe 4
- [ ] **C14** §P.4 — Wegwerf-Aufbau und Import  
      `2026-08-18-plan3-radio-generalprobe.md:652` — Aufgabe 5
- [ ] **C15** §P.5 — Die Gegenzählungen im Ziel  
      `2026-08-18-plan3-radio-generalprobe.md:872` — Aufgabe 6
- [ ] **C16** §P.6 — Die fünf Verwechslungspaare, feldweise  
      `2026-08-18-plan3-radio-generalprobe.md:1041` — Aufgabe 7
- [ ] **C17** §P.7 — Die Gegenprobe gegen den Faktor 1000  
      `2026-08-18-plan3-radio-generalprobe.md:1245` — Aufgabe 8
- [ ] **C18** §P.8 — Der ephemere Prüfcontainer  
      `2026-08-18-plan3-radio-generalprobe.md:1419`
- [ ] **C19** §P.9 — Der kopfgestützte Prüfsatz (Stufe 1)  
      `2026-08-18-plan3-radio-generalprobe.md:1740`
- [ ] **C20** §P.10 — Der browsergestützte Prüfsatz (Stufe 3)  
      `2026-08-18-plan3-radio-generalprobe.md:1970`
- [ ] **C21** §P.11 — Das Log der Probe  
      `2026-08-18-plan3-radio-generalprobe.md:2146`
- [ ] **C22** §P.12 — Aufräumen, und die zwei Messungen für das Fenster  
      `2026-08-18-plan3-radio-generalprobe.md:2238`
- [ ] **C23** §P.13 — Der Abbruchpunkt: was rot macht und was rot bedeutet  
      `2026-08-18-plan3-radio-generalprobe.md:2348`
- [ ] **C24** §P.14 — Was am ephemeren Container nicht prüfbar ist  
      `2026-08-18-plan3-radio-generalprobe.md:2486`
- [ ] **C25** §A — Was vor dem Fenster fertig sein muss (**vierzehn** Punkte)  
      `2026-08-18-plan4-radio-cutover.md:755`
- [ ] **C26** §B — Die `.env`, mit genau **drei** ⏸-Zeilen  
      `2026-08-18-plan4-radio-cutover.md:972`
- [ ] **C27** §C Schritt 1–3 — Freeze, echter Snapshot, Volume sichern  
      `2026-08-18-plan4-radio-cutover.md:1200`
- [ ] **C28** §C Schritt 4–5 — Import, Paritaet, Feldstichproben, Abfrage R und Abfrage Z  
      `2026-08-18-plan4-radio-cutover.md:1400`
- [ ] **C29** §C Schritt 6–9 — `.env` scharf, `up -d`, Prüfcontainer, Router  
      `2026-08-18-plan4-radio-cutover.md:1718`
- [ ] **C30** §D + §E — die Abnahme (**sechzehn** Punkte) und der Service Worker  
      `2026-08-18-plan4-radio-cutover.md:1965`
- [ ] **C31** §F + §G — Ausstellungsplan und Rückweg  
      `2026-08-18-plan4-radio-cutover.md:2271`
- [ ] **C32** §5.1 — Standby: drei Fristen und das Protokollformular  
      `2026-08-18-plan5-radio-abbau.md:151`
- [ ] **C33** §5.2 — Die Zählungen gegen radio-admin: A, T, R, Z und Abfrage 8  
      `2026-08-18-plan5-radio-abbau.md:291`
- [ ] **C34** §5.3 — Die Zählungen gegen radio-inventar: P1 bis P6  
      `2026-08-18-plan5-radio-abbau.md:615`
- [ ] **C35** §5.4 — Die Archivprobe: beide Dateien werden geöffnet  
      `2026-08-18-plan5-radio-abbau.md:834`
- [ ] **C36** §5.5 — Die Abbauliste und der Sperrenkasten  
      `2026-08-18-plan5-radio-abbau.md:933`
- [ ] **C37** §5.6 — Die Geheimnisse: der Posten, der liegen bleibt  
      `2026-08-18-plan5-radio-abbau.md:1060`
- [ ] **C38** §5.7 — Der alte Purge ist kein Cron  
      `2026-08-18-plan5-radio-abbau.md:1156`
- [ ] **C39** §5.8 + §5.9 — Der Redirect und sein Ende · was der Abbau nicht anfasst  
      `2026-08-18-plan5-radio-abbau.md:1325`
- [ ] **C40** §H — Die Erfüllungspunkte: die Klammer, die um 23 Uhr gelesen wird  
      `2026-08-18-plan5-radio-abbau.md:1470`
- [ ] **C41** Der datierte Nachtrag in Spec 2 — sieben Stellen und zwei Anhangszeilen  
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
      in der einen Stunde, in der es keine zweite Gelegenheit gibt

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

## Ausfuehrungsart

Die Plaene tragen die Auflage `superpowers:subagent-driven-development` (empfohlen) oder
`superpowers:executing-plans`. Bei 58 Aufgaben und einer Reihenfolge, die in beiden Leitplaenen
geprueft ist, traegt der **subagentgetriebene** Weg besser: ein frischer Subagent je Aufgabe,
Review dazwischen.
