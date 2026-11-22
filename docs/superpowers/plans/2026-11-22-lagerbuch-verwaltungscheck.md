# Lagerbuch-Verwaltungscheck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lagerbuch-Admins zählen und richten eine Einheit auf einer Verwaltungsseite ein; der Abschluss bucht Zählung und Ausgleich in einem Durchgang und gilt als Check der Art `verwaltung`.

**Architecture:** Neue Admin-Action `verwaltungscheckAbschluss` bucht in einer Transaktion über tx-Funktionen, die sie mit `checkAbschluss` (Check-Kern) und mit `bucheAufladen`/`bucheRuecklauf` (Einheit-Bewegungen) teilt. Neue Route `verwaltung/(arbeit)/fahrzeuge/[id]/zaehlen` mit einer Client-Insel (Reiter Bestand/Ausgleichen/Plomben/Geräte/Sauerstoff), deren reine Logik (Ableitungen, Sperrgründe, Nutzlast) in `_lib/` liegt. Einrichtungsaktionen (Plombe anlegen, Gerät/Flasche anlegen, verknüpfen, umsetzen) wirken sofort über bestehende bzw. zwei neue schmale Admin-Actions.

**Tech Stack:** Next.js 16 App Router (RSC + Server Actions), Ant Design 6, Drizzle + better-sqlite3, zod, Vitest (+ jsdom-Harness `src/app/m/qr/_lib/test-dom.tsx`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-lagerbuch-verwaltungscheck-design.md` (lesen! Abschnitte 6.1–6.12 sind verbindlich).

Alle Pfade unten relativ zu `src/app/m/lagerbuch/`, wenn nicht anders angegeben.

## Global Constraints

- `CLAUDE.md` (Repo-Wurzel) gilt vollständig, besonders die Fallen 1, 3, 4, 6, 9, 13–17, 20, 23, 24 und der Abschnitt „Kommentaranker" (Anker nennen Namen, keine Zeilen; `pnpm anker:neu` ist CI-Tor).
- Admin-Actions: erste Anweisung `const viewer = await requireLagerbuchAdmin();`, dann `withAuditContext({ actor: auditActor(viewer) }, …)`, Quelle `{ quelleTyp: "oidc" as const, quelleId: viewer.sub }`, Rückgabe `ActionErgebnis<T>` (`_lib/actionErgebnis.ts`). Eine `"use server"`-Datei exportiert nur `async function`s und Typen.
- In einer gemeinsamen Transaktion **wirft** jede fachliche Absage `BuchungAbgewiesen` (`_lib/buchungAbgewiesen.ts`) — nie `return "<text>"` aus `db.transaction` (das committet).
- Präfixe nur aus `_lib/vorgang.ts` (`AUSSONDERN_PRAEFIX`, `RUECKLAUF_PRAEFIX`, `ENTNAHMEBOX_PRAEFIX`, `AUFLADEN_PRAEFIX`); `vorgang.test.ts` verbietet Literale. Die Check-Referenz bleibt `check:<id>` wie in `_actions/check.ts`.
- Bestandsschreibende Action-Dateien rufen `revalidiereBestand()` und stehen in der exakten Liste von `_lib/revalidierung.test.ts`.
- `_actions/guards.test.ts` zählt Actions hart (Datei-Map + Literale) — jede neue Action-Datei/Export zieht die Zahlen nach.
- Werte für Server Components nie aus einer `"use client"`-Datei (Falle 6): reine Logik nach `_lib/`.
- Kein `size` an Bedienelementen (Falle 4); Rot nie als Primäraktion (Falle 3); `Modal` statt `Drawer` für die Dialoge.
- UI-Texte Deutsch, Du-Form, Wörter aus `docs/design/wortliste.md`. Commit-Body enthält `Zunder: https://zunder.rubeen.dev/#/aufgabe/jlwtf3ski7fqv1nx8a5v0w4l`; Kopfzeile `feat(lagerbuch): …` nur beim ersten nutzersichtbaren Commit, sonst `refactor`/`test`/`chore`.
- Zeiten über `core/zeit` (kein `timeZone`-Literal).
- Tore je Task mindestens: `pnpm typecheck`, `pnpm vitest run src/app/m/lagerbuch`, `pnpm lint` (Exit-Code prüfen).

## Review Focus

1. **Teilzählung mit Mehrfach-Fach-Artikel** (Fach-Filter, nur ein Fach eines Artikels gezählt) → Abschluss gesperrt mit Artikelname und fehlenden Fächern; Server weist ab, nichts gebucht. Tests: Task 4 (Server), Task 7 (`sperrGruende`).
2. **Bewegung ohne Deckung** (Zurücklegen/Aufladen-von-Ort mehr als vorhanden, Handlager leer) → ganzer Abschluss abgewiesen mit Artikel im Text, Bestand und `checks` unverändert. Test: Task 4.
3. **Doppelt gesendeter Abschluss** (gleiche `sendungId`, z. B. Netz-Wiederholung) → kein zweites Buchen, Ergebnis von damals. Test: Task 4.
4. **Einheit während des Zählens stillgelegt** → Abweisung mit Text, keine Buchung; Seite zeigt bei inaktiver Einheit Leerzustand statt Formular. Tests: Task 4, Task 6.
5. **Neu gesetzte Plombe auf nicht ganz gezähltem Fach** → Feld gesperrt; Server weist ab. Tests: Task 4, Task 7.

---

### Task 1: Neue Check-Art `verwaltung` lesen, anzeigen, „offen" nach Ausgleich

**Files:**
- Modify: `_lib/checkErgebnis.ts` (`CheckArtikelRoh`, `CheckErgebnisV2.art`, `parseCheckErgebnis`, `checkArtUndPlomben`), `_lib/domain/check.ts` (`offenJeArtikel`, ggf. `summiereCheckErgebnis`), `_lib/lesepfade/checks.ts` (`CheckHistorieZeile.art`, `CheckDetail.art`), `verwaltung/(arbeit)/checks/page.tsx` (Chips), `verwaltung/(arbeit)/checks/[id]/page.tsx` (Titel/Art, Bewegungen, Kommentar)
- Test: `_lib/checkErgebnis.test.ts`, `_lib/domain/check.test.ts` (anlegen falls nicht vorhanden), bestehende Seiten-Tests der Checks

**Interfaces:**
- Produces: `type CheckArt = "kurz" | "voll" | "verwaltung"` exportiert aus `_lib/checkErgebnis.ts`; `CheckArtikelRoh` + optional `ausgesondert?: number; zurueckgelegt?: number; aufgefuellt?: number`; `CheckErgebnisV2` + optional `kommentar?: string`; `offenJeArtikel(a: { sollSumme?, istSumme?, nachfuellGebucht?, boxGebucht?, ausgesondert?, zurueckgelegt?, aufgefuellt? }): number` = `max(0, soll − ist − nachfuell + box + ausgesondert + zurueckgelegt − aufgefuellt)` (alle `?? 0`).

- [ ] **Step 1: Failing tests** — `parseCheckErgebnis(JSON.stringify({version:2, …, art:"verwaltung"})).art === "verwaltung"`; `checkArtUndPlomben(... art:"verwaltung").art === "verwaltung"`; unbekannte Art `"xyz"` → weiterhin `"voll"`; `offenJeArtikel({sollSumme:10, istSumme:4, aufgefuellt:6}) === 0`, `({sollSumme:10, istSumme:10, ausgesondert:3}) === 3`, `({sollSumme:10, istSumme:10, zurueckgelegt:2}) === 2`, Altwerte ohne neue Felder unverändert (bestehende Erwartungen bleiben). Parse übernimmt `artikel[].ausgesondert/zurueckgelegt/aufgefuellt` und `kommentar`.
- [ ] **Step 2: Run** `pnpm vitest run src/app/m/lagerbuch/_lib/checkErgebnis.test.ts src/app/m/lagerbuch/_lib/domain` → FAIL.
- [ ] **Step 3: Implement** Typen/Whitelist erweitern (Kommentare an `art` nachziehen: „Leser fragen `art === "kurz"`" bleibt richtig, ergänzen um `verwaltung`). `summiereCheckErgebnis` zählt die drei Bewegungen in `korrigiert` **nicht** mit; falls `CheckSummen` Felder braucht, `ausgesondert`, `zurueckgelegt`, `aufgefuellt` additiv.
- [ ] **Step 4: UI** Liste: Chip `{schluessel:"verwaltung", text:"Verwaltung", ton:"grau"}` analog „Kurzcheck"; Chips „ausgesondert n", „zurückgelegt n", „aufgefüllt n" wenn > 0; Befund-Leertext bei `verwaltung` „vollständig" wie Vollcheck. Detail: Titel `kurz→"Kurzcheck"`, `voll→"Vollcheck"`, `verwaltung→"Verwaltungscheck"`; Artikeltabelle zeigt die drei Bewegungen als Spalten nur wenn irgendein Wert > 0; Kommentar als Absatz, wenn vorhanden.
- [ ] **Step 5: Run** Tests + `pnpm typecheck` → PASS. **Commit** `refactor(lagerbuch): Check-Art „verwaltung" lesen und anzeigen`.

### Task 2: Check-Kern als tx-Funktionen (Verhalten von `checkAbschluss` unverändert)

**Files:**
- Create: `_lib/schreibpfade/check.ts`, `_lib/schreibpfade/check.test.ts`
- Modify: `_actions/check.ts` (ruft die neuen Funktionen; Riegel, Ergebnisform, Box-Logik, Korrektur-/Nachfüll-Schleife bleiben dort; der `scope_lagerort_id`-Kommentar bleibt in `check.ts`)

**Interfaces:**
- Produces (alle transaktionsfrei, erster Parameter `tx: Tx` aus `./abbuchung`, `Quelle` ebenda):
  - `gruppiereZaehlung(sollRows: SollRow[], positionen: { sollPositionId: string; ist: number }[]): Map<string, ZaehlGruppe>` mit `ZaehlGruppe = { artikelId; positionen: string[]; sollSumme; istSumme; sollMax?: number }` — wirft `Error("Soll-Position gehört nicht zu diesem Fahrzeug")` bei fremder Position und `Error("Ein Artikel wurde nur in einem Teil seiner Fächer gezählt")` bei Teilartikel (gleiche Texte wie heute). `SollRow` = Zeile aus `sollPositionen` ohne Grabsteine. Helper-spezifische Felder (`nachfuellGewuenscht`, `boxGewuenscht`) rechnet `check.ts` weiter selbst daneben.
  - `bucheGeraeteAntworten(tx, { fahrzeug: { id: string; einheitenart: … } /* Zeile aus lagerorte */, antworten: GeraetAntwort[], quelle: Quelle, checkId: string }): { ergebnis: CheckGeraetRoh[]; auffaellig: number; gemeldet: number }` — Logik 1:1 aus `check.ts` (Wurf 2, Mangel via `legeMangelAn`/`offenerMangelZuGeraet`).
  - `bucheFlaschenMessungen(tx, { fahrzeugId: string; flaschen: { flascheId: string; druckBar: number }[]; quelle; referenz: string }): { ergebnis: CheckFlascheRoh[]; auffaellig: number; nichtBewertbar: number }` (Wurf 3, `o2Messungen`-Insert wie heute).
  - `setzePlombenNummern(tx, { lagerortId: string; eintraege: { plombeId: string; nummer: string | null }[] }): CheckPlombeRoh[]` — nur aktive Plomben der Einheit (sonst `Error("Plombe gehört nicht zu diesem Fahrzeug")`), nicht-leere Nummer → `nummer`, `gesetztAt = new Date()`; Rückgabe `{ plombeId, bezeichnung, gesetzt }` je gesetzter. (Kurz-Zweig bleibt in `check.ts`.)
  - `schreibeCheckZeile(tx, { id: string; fahrzeugId: string; quelle: Quelle; ergebnis: object }): void` — Insert in `checks` mit `startedAt = completedAt = new Date()`, `ergebnis: JSON.stringify(ergebnis)`.

- [ ] **Step 1:** Vor dem Umbau `pnpm vitest run src/app/m/lagerbuch/_actions/check.test.ts src/app/m/lagerbuch/_actions/checkPlomben.test.ts src/app/m/lagerbuch/_lib` laufen lassen und Ergebnis notieren (Basislinie grün).
- [ ] **Step 2: Failing tests** in `_lib/schreibpfade/check.test.ts` (Muster: bestehende `_lib/schreibpfade/*.test.ts` für DB-Aufbau): `gruppiereZaehlung` summiert zwei Fächer eines Artikels; wirft bei Teilartikel und fremder Position. `setzePlombenNummern` setzt Nummer/`gesetztAt`, ignoriert leere Nummer, wirft bei inaktiver/fremder Plombe. `bucheGeraeteAntworten` legt bei `vorhanden:false` genau einen Mangel an und beim zweiten Aufruf keinen weiteren. `bucheFlaschenMessungen` schreibt eine Messung mit Kommentar `"<CHECK_MESSUNG> check:x"`.
- [ ] **Step 3: Implement** die Funktionen, dann `check.ts` darauf umstellen. Reihenfolge der Schreibvorgänge in `checkAbschluss` bleibt exakt: Plomben → Korrektur/Nachfüllen je Artikel → Geräte → Flaschen → Verfall → Box → `checks`-Insert.
- [ ] **Step 4: Run** Basislinie-Tests aus Step 1 (unverändert grün, **keine Testanpassung erlaubt** außer Importpfaden) + neue Tests + `pnpm typecheck` + `pnpm vitest run src/app/m/lagerbuch/_lib/revalidierung.test.ts src/app/m/lagerbuch/_actions/guards.test.ts`. 
- [ ] **Step 5: Commit** `refactor(lagerbuch): Check-Kern in gemeinsame Schreibpfade`.

### Task 3: Einheit-Bewegungen als werfende tx-Funktionen

**Files:**
- Create: `_lib/schreibpfade/einheitBewegung.ts`, `_lib/schreibpfade/einheitBewegung.test.ts`
- Modify: `_actions/aufladen.ts` (Ort-Zweig ruft `aufladenVonOrtTx`; der „neu"-Zweig mit `zugangAnEinheitBuchen` bleibt in der Datei), `_actions/ruecklauf.ts` (ruft `ruecklaufTx`; `catch` übersetzt `BuchungAbgewiesen` in `{ok:false, fehler: e.message}`), `_lib/revalidierung.test.ts` (Schreiber-Erkennung erkennt zusätzlich Importe von `schreibpfade/(einheitBewegung|check)"`; die exakte Liste bleibt sonst gleich)

**Interfaces:**
- Produces (werfen `BuchungAbgewiesen` mit **denselben Texten** wie die Actions heute):
  - `aufladenVonOrtTx(tx, { artikelId; menge; fahrzeugId; vonLagerortId; chargeId; quelle }): number` (umgelagert; Quelle existiert, Charge gehört zum Artikel, Deckung, `umlagerungVonOrt` mit `AUFLADEN_KOMMENTAR`/`AUFLADEN_PRAEFIX`, `verfallFolgtDemMaterial`).
  - `ruecklaufTx(tx, { fahrzeugId; artikelId; chargeId; menge; zielLagerortId; quelle }): number` (Einheit `typ fahrzeug`, Ziel in `zugangsZiele(tx)`, Charge, Deckung, `umlagerungVonOrt` mit `RUECKLAUF_*`, `raeumeVerfallAmLeerenOrt`).
  - `inEntnahmeboxTx(tx, { fahrzeugId; artikelId; menge; chargeId?: string; quelle }): number` (Box existiert/`lager`/aktiv, sonst Absage; `umlagerungVonOrt` nach `ENTNAHMEBOX_ID` mit `ENTNAHMEBOX_KOMMENTAR`, Referenz `ENTNAHMEBOX_PRAEFIX + fahrzeugId`; `umgelagert < menge` → Absage „Von <Artikel> liegen an der Einheit nur n"; `verfallFolgtDemMaterial`).
  - `aussondernAnEinheitTx(tx, { lagerortId; artikelId; menge; quelle; kommentar: string }): void` (Bestand an der Einheit ≥ menge, sonst Absage; `fefoAbbuchungAnOrt(…, typ: "korrektur")` mit Referenz `AUSSONDERN_PRAEFIX + lagerortId`; **kein** `setzeVerfall`).
  - `auffuellenAusHandlagerTx(tx, { artikelId; menge; fahrzeugId; quelle; referenz: string }): number` (Summe Rest im Handlager-Bereich via `restJeChargeFuerArtikelImBereich(tx, artikelId, handlagerOrte(tx))` ≥ menge, sonst Absage „Im Handlager liegen von <Artikel> nur n"; dann `umlagerungAusBereich` mit `CHECK_NACHFUELLUNG`; `umgelagert < menge` → Absage).
- [ ] **Step 1:** Basislinie `pnpm vitest run src/app/m/lagerbuch/_actions/aufladen.test.ts src/app/m/lagerbuch/_actions/ruecklauf.test.ts` grün notieren.
- [ ] **Step 2: Failing tests** je Funktion: Erfolg (Bestände an Quelle/Ziel, Buchungs-`referenz`-Präfix), Absage wirft `BuchungAbgewiesen` und hat nichts geschrieben (Aufruf in `db.transaction` mit `expect(() => …).toThrow(BuchungAbgewiesen)`, danach Bestand unverändert). `aussondernAnEinheitTx`: Statistik-Sicht — Buchung hat `referenz` mit `AUSSONDERN_PRAEFIX`.
- [ ] **Step 3: Implement**, Actions umstellen. Texte wörtlich übernehmen.
- [ ] **Step 4: Run** Basislinie (unverändert grün), neue Tests, `revalidierung.test.ts`, `vorgang.test.ts`, `pnpm typecheck`.
- [ ] **Step 5: Commit** `refactor(lagerbuch): Einheit-Bewegungen als gemeinsame Schreibpfade`.

### Task 4: Action `verwaltungscheckAbschluss`

**Files:**
- Create: `_actions/verwaltungscheck.ts`, `_actions/verwaltungscheck.test.ts`
- Modify: `_actions/guards.test.ts` (neue Datei + Zahlen), `_lib/revalidierung.test.ts` (Liste um `verwaltungscheck`)

**Interfaces:**
- Consumes: Task 1 (`CheckArt`, Roh-Felder, `offenJeArtikel`), Task 2, Task 3.
- Produces:
  - `export type VerwaltungscheckWert = { checkId: string; korrigiert: number; ausgesondert: number; zurueckgelegt: number; aufgefuellt: number; offen: number; geraeteAuffaellig: number; flaschenAuffaellig: number; plombenGesetzt: number; geraeteGemeldet: number }`
  - `export async function verwaltungscheckAbschluss(eingabe: unknown, db: DB = getDb()): Promise<ActionErgebnis<VerwaltungscheckWert>>`
  - Nutzlast-Typ `VerwaltungscheckNutzlast` wird in `_lib/verwaltungscheck.ts` (Task 7) als TS-Typ gespiegelt; das zod-Schema lebt hier (nicht exportiert). Form exakt wie Spec 6.8 inkl. `zuruecklegen.chargeId?`, `auffuellen.mitgezaehlt?: boolean`, `herkunft` = `{art:"handlager"} | {art:"ort", vonLagerortId, chargeId} | {art:"neu", charge: {art:"vorhanden", chargeId} | {art:"neu", chargenNr?: string, verfall: "YYYY-MM"}}`. Mengen `int ≥ 1 ≤ BUCHUNG_MENGE_MAX`; `ist` `int ≥ 0 ≤ 99_999`; `kommentar` ≤ 500.

Ablauf: wie Spec 6.8, Reihenfolge in der Transaktion:
1. `gruppiereZaehlung` → je Artikel: `korrekturAufLagerort(istMenge = istSumme − (auffuellen?.mitgezaehlt ? auffuellen.menge : 0))`.
2. Plombenregel (Spec 6.12.3): für jede Plombe in `plomben` mit `fachLabel` müssen alle nicht-entfernten Soll-Positionen dieses Fachs in `positionen` sein, sonst `BuchungAbgewiesen("Plombe „<bezeichnung>": erst das ganze Fach <fach> zählen.")`; dann `setzePlombenNummern`.
3. Je Artikel mit Ausgleich: `aussondernAnEinheitTx` (kommentar = `grund` oder „Beim Zählen ausgesondert") → zurücklegen (`zielLagerortId === ENTNAHMEBOX_ID` ? `inEntnahmeboxTx` : `ruecklaufTx`, dort `chargeId` Pflicht → fehlt sie, Absage „Für den Schrank eine Charge wählen.") → auffüllen (`handlager`: `auffuellenAusHandlagerTx` mit `referenz` = `check:<id>` → zählt in `nachfuellGebucht`; `ort`: `aufladenVonOrtTx`; `neu`: `zugangAnEinheitBuchen`) — Ausgleich nur für **gezählte** Artikel, sonst Absage.
4. `bucheGeraeteAntworten`, `bucheFlaschenMessungen` (vorher `druckZuHoch` je Flasche an der Einheit, Absage wie im Check).
5. `setzeFachVerfaelle` mit den gesendeten Werten — nur für gezählte Positionen (sonst Absage).
6. `schreibeCheckZeile` mit `ergebnis = { version:2, art:"verwaltung", positionen (nur gezählte, `{sollPositionId, artikelId, soll, ist, sollMax?}`), artikel (je gezähltem Artikel `{artikelId, positionen, sollSumme, istSumme, recordedVorher, korrektur, nachfuellGewuenscht:0, nachfuellGebucht, ausgesondert?, zurueckgelegt?, aufgefuellt?}`), geraete, flaschen, verfall (wie Check: `verfallFuerLagerort` danach), plomben, kommentar?, abschluss: VerwaltungscheckWert ohne checkId }`.
- Leer-Nutzlast (keine Position, kein Gerät, keine Flasche, keine Plombe) → `{ok:false, fehler:"Es ist noch nichts erfasst."}`.
- Fehlerübersetzung: `BuchungAbgewiesen` → `{ok:false, fehler: e.message}`; andere Fehler → `{ok:false, fehler:"Der Abschluss wurde nicht gespeichert. Bitte die Seite neu laden und es erneut versuchen."}`.
- Nach Erfolg: `revalidiereBestand()`, `revalidatePath` für `/m/lagerbuch/verwaltung/checks`, `/m/lagerbuch/verwaltung/sauerstoff`, Fahrzeugblatt über `verwaltungDetailPfadIntern("fahrzeuge", id)`, bei Mängeln wie `check.ts`.

- [ ] **Step 1: Failing tests** (Muster `_actions/check.test.ts`/`aufladen.test.ts`; `requireLagerbuchAdmin` wie dort mocken):
  - Zählung zweier Fächer eines Artikels → Bestand = Summe, `checks`-Zeile mit `art:"verwaltung"`, `quelleTyp:"oidc"`.
  - Teilartikel → `ok:false`, keine `checks`-Zeile, keine Buchung.
  - Aussondern 2 nach Zählung 5 → Bestand 3, eine Buchung mit `AUSSONDERN_PRAEFIX`, `abschluss.ausgesondert === 2`, Statistik zählt sie nicht als Verbrauch (`lesepfade/statistik` liefert 0 Verbrauch aus dieser Buchung).
  - Zurücklegen in Schrank ohne Charge → Absage; mit Charge → Schrank +n; in Box ohne Charge → Box +n.
  - Auffüllen `handlager` über Handlager-Bestand → Absage, **nichts** gebucht (auch die Korrektur nicht).
  - Auffüllen `mitgezaehlt` 4 bei Ist 10, Buchstand 6 → Korrektur auf 6 (diff 0), Umlagerung 4, Endstand 10, Handlager −4.
  - Plombe mit Fach, Fach nicht ganz gezählt → Absage; ganz gezählt → Nummer gesetzt.
  - Gleiche `sendungId` zweimal → zweiter Aufruf liefert gleiches `checkId`, Bestand nur einmal verändert.
  - Inaktive Einheit → Absage. Leere Nutzlast → Absage.
  - Nach Abschluss sieht `kurzcheckVorlage` nur die gezählten Positionen als abgedeckt.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** Guards-/Revalidierungs-Wächter nachziehen und alles in `src/app/m/lagerbuch` grün, `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(lagerbuch): Verwaltungscheck bucht Zählung und Ausgleich in einem Durchgang`.

### Task 5: Geräte und Flaschen verknüpfen/umsetzen, anlegen mit Vorgabe-Ort

**Files:**
- Modify: `_actions/geraete.ts` (+ `geraetUmsetzen`), `_actions/sauerstoff.ts` (+ `flascheUmsetzen`), `_actions/guards.test.ts`, `_ui/BarcodeScanner.tsx` (+ Prop `onTreffer?: (id: string) => void`; gesetzt → statt `window.location.assign` aufrufen), `verwaltung/(arbeit)/geraete/NeuGeraet.tsx` und `verwaltung/(arbeit)/sauerstoff/NeuFlasche.tsx` (+ Props `vorgabeLagerortId?: string`, `ausloeser?: "primaer" | "neutral"` (Vorgabe `"primaer"`), Entwurfsschlüssel `lagerbuch:neu-geraet` bzw. `lagerbuch:neu-flasche` + `:${vorgabeLagerortId}` wenn gesetzt)
- Test: `_actions/geraete.test.ts`, `_actions/sauerstoff.test.ts`, DOM-Test für `BarcodeScanner`-`onTreffer` und die Vorgabe in `NeuGeraet`

**Interfaces:**
- Produces: `geraetUmsetzen(eingabe: unknown, db?: DB): Promise<ActionErgebnis<{ id: string }>>` mit `{ geraetId, lagerortId }` — nur `lagerortId` wird geändert; Ziel aktiv und nicht die Entnahmebox (gleiche Regel/Text wie `geraetSpeichern`); Gerät existiert und aktiv. Revalidiert Geräte-Layout und beide Fahrzeugblätter (alt/neu), wenn Fahrzeug. `flascheUmsetzen(eingabe, db?)` analog mit `{ flascheId, lagerortId }` und der Regel von `flascheSpeichern`.
- Produces (Lesepfad, `_lib/lesepfade/verwaltungscheck.ts` — in Task 6 angelegt, hier nicht).
- [ ] Steps: failing tests (Umsetzen ändert nur `lagerortId`, alle anderen Felder bleiben; Entnahmebox → Absage; inaktives Gerät → Absage; Nicht-Admin → Riegel wie bei `geraetSpeichern`) → implement → Guards-Zahlen → run → commit `feat(lagerbuch): Geräte und Flaschen umsetzen`.

### Task 6: Route, Lesepfad, Einstieg am Fahrzeugblatt

**Files:**
- Create: `_lib/lesepfade/verwaltungscheck.ts` (+ Test), `verwaltung/(arbeit)/fahrzeuge/[id]/zaehlen/page.tsx` (+ `page.test.tsx`)
- Modify: `_lib/verwaltungPfad.ts` (`Unterseite` + `"zaehlen"`), `verwaltung/(arbeit)/fahrzeuge/[id]/page.tsx` (Knopf „Zählen" neben „Check durchführen", nur aktiv, `Button href`, kein `size`, nicht primär), `verwaltung/(arbeit)/fahrzeuge/CheckDurchfuehrenKnopf.tsx` (Doc-Kommentar: DRK-305 umgedeutet durch IDA-413 — die eine Wahrheit liegt im Schreibweg; Zeilenzahl der Datei halten, Kommentaranker-Regel 4)

**Interfaces:**
- Produces: `verwaltungscheckDaten(db: Leser, fahrzeugId: string): VerwaltungscheckDaten | null` (null = unbekannt/kein Fahrzeug), alles serialisierbar:
  ```
  type VerwaltungscheckDaten = {
    fahrzeug: { id; name; kennung: string | null; einheitenart: Einheitenart | null; aktiv: boolean };
    positionen: { id; fachLabel: string | null; artikelId; artikelName; einheit; soll; sollMax: number | null }[];
    buchstand: Record<artikelId, number>;          // Bestand je Artikel an der Einheit
    verfallFach: Record<sollPositionId, string>;   // fachVerfallFuerLagerort
    verfallArtikel: Record<artikelId, string>;     // verfallFuerLagerort
    chargenAnEinheit: Record<artikelId, { chargeId; label; menge }[]>;  // für Zurücklegen
    plomben: { id; bezeichnung; fachLabel: string | null; nummer: string | null; gesetzt: string | null }[]; // nur aktive
    geraete: { id; name; typ; barcode: string | null; selbsttest: boolean }[];   // aktive an der Einheit
    flaschen: { id; name; nennfuelldruckBar; wechselAbProzent }[];
    geraeteWoanders: { id; name; ortLabel }[]; flaschenWoanders: { id; name; ortLabel }[];
    ruecklaufZiele: { id; name }[];               // zugangsZiele
    entnahmeboxAktiv: boolean;
    lagerorte: LagerortOption[];                  // für NeuGeraet/NeuFlasche/Umsetzen
    aufladenArtikel: AufladenArtikel[];           // wie Fahrzeugblatt
    warnTage / verfallSchwellen-Werte wie helfer/check
  }
  ```
  `gesetzt` als fertiger Text (Muster `PlombenEditor`), nie `Date`.
- Seite: `export const dynamic = "force-dynamic"`, `metadata.title = "Zählen"`, testbare `zaehlenInhalt(db, id)`; inaktiv → `Result`/Leerzustand „Diese Einheit ist stillgelegt." + Link zurück (kein `notFound`, Falle 23); sonst `SeitenKopf` („Zählen und einrichten", Einheit + `einheitMeta`, `zurueck` aufs Blatt) + `<VerwaltungsZaehlung daten={…} />` (Task 7–9; bis dahin Platzhalter-Export aus `zaehlen/VerwaltungsZaehlung.tsx` mit `"use client"`, der nur den Titel rendert).
- [ ] Steps: failing tests (Lesepfad liefert nur Positionen ohne Grabstein, nur aktive Plomben/Geräte/Flaschen der Einheit, Woanders-Listen ohne diese Einheit und ohne inaktive; Seite inaktiv → Leerzustand-Text; Fahrzeugblatt aktiv zeigt Link mit `href` auf `…/zaehlen`) → implement → run → commit `feat(lagerbuch): Zählseite für Einheiten in der Verwaltung`.

### Task 7: Reine Logik der Zählseite

**Files:**
- Create: `_lib/verwaltungscheck.ts`, `_lib/verwaltungscheck.test.ts` (kein `"use client"`, keine antd-/Icon-Importe)

**Interfaces:**
- Consumes: `VerwaltungscheckDaten` (Task 6), Nutzlast-Form (Task 4), `obergrenze`/`ueberschuss` (`_lib/domain/sollBereich`), `verfallStatus` (`_lib/domain/verfall`), `druckZuHoch`.
- Produces:
  ```
  type Herkunft = { art:"handlager" } | { art:"ort"; vonLagerortId: string; chargeId: string }
    | { art:"neu"; charge: { art:"vorhanden"; chargeId: string } | { art:"neu"; chargenNr?: string; verfall: string } };
  type Ausgleich = { aussondern?: { menge: number; grund?: string };
    zuruecklegen?: { menge: number; zielLagerortId: string; chargeId?: string };
    auffuellen?: { menge: number; herkunft: Herkunft; mitgezaehlt?: boolean } };
  type GeraetEingabe = { vorhanden: boolean; zustand?: Zustand; bemerkung?: string; selbsttest?: boolean };
  type ZaehlZustand = { ist: Record<sollPositionId, number>; verfall: Record<sollPositionId, string | null>;
    ausgleich: Record<artikelId, Ausgleich>; plomben: Record<plombeId, string>;
    geraete: Record<geraetId, GeraetEingabe>; druck: Record<flascheId, number>; kommentar: string };
  leererZustand(): ZaehlZustand
  type AusgleichZeile = { artikelId; artikelName; einheit; sollSumme; obergrenze; ist; buchstand;
    fehlmenge: number; ueberschuss: number; abgelaufen: boolean; plusOhneHerkunft: boolean; nachAusgleich: number };
  ausgleichZeilen(daten, z, jetzt: Date): AusgleichZeile[]   // nur ganz gezählte Artikel mit fehlmenge>0 || ueberschuss>0 || abgelaufen || Ausgleich gesetzt
  type Sperrgrund = { art: "teilartikel" | "plombe" | "abgelaufen" | "menge" | "druck" | "leer"; text: string };
  sperrGruende(daten, z, jetzt: Date): Sperrgrund[]
  fortschritt(daten, z): { positionenGezaehlt; positionenGesamt; abweichungen; geraeteBeantwortet; geraeteGesamt; flaschenAbgelesen; flaschenGesamt }
  baueNutzlast(daten, z, sendungId: string): VerwaltungscheckNutzlast   // nur gezählte Positionen, nur geänderte Verfälle gezählter Positionen, nur nicht-leere Plombennummern, nur beantwortete Geräte, nur abgelesene Flaschen
  ```
- Regeln (Spec 6.3, 6.4, 6.12): Teilartikel-Text „<Artikel>: auch in <Fach, Fach> zählen"; Plombe mit Nummer, Fach nicht ganz gezählt → `plombe`; Aussondern gesetzt und ein Fach des Artikels hat nach Eingabe noch abgelaufenen Verfall → `abgelaufen` („<Artikel>: neuen Verfall eintragen oder leeren"); Aussondern > Ist oder Zurücklegen > Ist − Aussondern → `menge`; `druckZuHoch` → `druck`; nichts erfasst → `leer`. `plusOhneHerkunft` = Ist > Buchstand und kein `auffuellen`.
- [ ] Steps: failing tests je Regel und je `baueNutzlast`-Filter (u. a. Verfall nur bei Änderung gegenüber `verfallFach ?? verfallArtikel`; `mitgezaehlt` durchgereicht) → implement → run → commit `feat(lagerbuch): Zählstand, Ausgleich und Sperrgründe der Zählseite`.

### Task 8: Client-Insel — Gerüst, Bestand, Abschluss

**Files:**
- Create in `verwaltung/(arbeit)/fahrzeuge/[id]/zaehlen/`: `VerwaltungsZaehlung.tsx` (`"use client"`, Reiter + Abschlussleiste + Entwurf), `BestandReiter.tsx`, `BestandZellen.tsx`, `BestandKarte.tsx`, `zaehlen.module.css`, `VerwaltungsZaehlung.test.tsx`

**Interfaces:**
- Consumes: Task 4 Action, Task 6 Daten, Task 7 Logik.
- Produces: `VerwaltungsZaehlung({ daten }: { daten: VerwaltungscheckDaten })`; interner Kontext/Props `{ zustand: ZaehlZustand; aendere: (f: (z) => ZaehlZustand) => void }` für die Reiter aus Task 9.
- Verhalten: `useEntwurf` mit Schlüssel `lagerbuch:verwaltungscheck:${daten.fahrzeug.id}` (API in `src/core/entwurf/useEntwurf.ts` lesen; Vorbild Inventur-`Abschlussleiste` und `CheckFlow`), `sendungId` aus dem Entwurf. antd `Tabs` mit Reitern „Bestand x/y", „Ausgleichen n", „Plomben", „Geräte a/b", „Sauerstoff c/d" (Reiter ohne Inhalt — keine Plomben/Geräte/Flaschen — trotzdem zeigen, damit man anlegen kann). Bestand: `core/tabelle` `Schmalkarten` + `TabellenVollhoehe` + `Datentabelle` (Spaltentitel als Zeichenketten, Falle 17; `render` nur hier im Client, Falle 9), Spalten Fach (Filter), Artikel, Soll, Ist (± + `InputNumber`, „Stimmt" = Soll), Verfall (`MonatsFeld`, gesperrt solange Position nicht gezählt), Buchstand-Hinweis. Telefon: `BestandKarte` + `Schmalfilter` (`kategorien=[]`), Suche, Alle/Offen. Abschlussleiste klebend (Vorbild `inventur/Abschlussleiste.tsx`, `onHoehe` → `TabellenVollhoehe rand`), Fortschrittstext, Kommentar, Sperrgründe als Liste, „Abschließen" (primär, `disabled` bei Sperrgründen). Erfolg: Entwurf leeren, `Result` „Check gespeichert" mit Kennzahlen und Links „Zum Check" (`/verwaltung/checks/<id>` über vorhandenen Pfadhelfer) und „Zurück zur Einheit". Fehler: `Alert` mit Servertext wörtlich.
- [ ] Steps: DOM-Tests (Harness `src/app/m/qr/_lib/test-dom.tsx`, `vi.mock("../../../../../_actions/verwaltungscheck", …)` vor dem Import, `localStorage.clear()` + `vergissFluechtig()` in `beforeEach`; Karten sind in jsdom die sichtbaren Zeilen — Falle 14): „Stimmt" setzt Ist = Soll; Teilartikel zeigt Sperrgrund und sperrt Abschließen; Abschließen sendet `baueNutzlast`-Form an die Action; Erfolg zeigt `Result` mit Link auf den Check → implement → run → commit.

### Task 9: Client-Insel — Ausgleichen, Plomben, Geräte, Sauerstoff

**Files:**
- Create in `zaehlen/`: `AusgleichReiter.tsx`, `AusgleichDialoge.tsx`, `PlombenReiter.tsx`, `GeraeteReiter.tsx`, `SauerstoffReiter.tsx`, `AusgleichReiter.test.tsx`, `EinrichtenReiter.test.tsx`
- Create: `verwaltung/(arbeit)/fahrzeuge/[id]/HerkunftFelder.tsx` (Herkunft-/Chargen-Felder aus `AufladenDialog` herausgezogen; `AufladenDialog` nutzt sie, Verhalten unverändert — sein bestehender Test bleibt grün) — plus Option „Aus dem Handlager (FEFO)" nur wenn Prop `mitHandlager` gesetzt.
- Modify: `verwaltung/(arbeit)/fahrzeuge/[id]/AufladenDialog.tsx`

**Interfaces:**
- Consumes: Task 5 (`geraetUmsetzen`, `flascheUmsetzen`, `BarcodeScanner onTreffer`, `NeuGeraet`/`NeuFlasche` Vorgabe), `plombeAnlegen` (`_actions/plomben.ts`), Task 7, Task 8 Zustand.
- Verhalten:
  - Ausgleichen: Liste `ausgleichZeilen`; je Zeile Knöpfe „Auffüllen", „Zurücklegen", „Aussondern" (alle neutral; Aussondern **nicht** rot/primär), Chips der erfassten Absichten mit Entfernen, Hinweis „Mehr als im Lagerbuch — woher?" bei `plusOhneHerkunft`, „Nach dem Ausgleich: n". Dialoge (`Modal`): Auffüllen (Menge vorbelegt mit Fehlmenge, `HerkunftFelder mitHandlager`, Schalter „Schon eingeräumt und mitgezählt"), Zurücklegen (Menge vorbelegt mit Überschuss, Ziel = `ruecklaufZiele` + „Entnahmebox" wenn aktiv, Charge aus `chargenAnEinheit` — Pflicht bei Schrank), Aussondern (Menge, Grund mit Vorgabe „Beim Zählen ausgesondert").
  - Plomben: Zeilen mit Bezeichnung, Fach, Stand, Eingabe „Neue Nummer" (gesperrt mit Hinweis, solange Fach nicht ganz gezählt); „Plombe anlegen" (Bezeichnung, Fach aus `positionen`) → `plombeAnlegen` sofort → `router.refresh()`.
  - Geräte: je Gerät Zustand-Chips (`ZUSTAENDE`), „Fehlt", Bemerkung, Selbsttest (nur wenn Flag), Menü „An anderen Ort" → `geraetUmsetzen`; oben „Gerät verknüpfen" (Modal mit `BarcodeScanner onTreffer` → `geraetUmsetzen(id, einheit)`; daneben Auswahl aus `geraeteWoanders`) und `NeuGeraet vorgabeLagerortId ausloeser="neutral"`; nach jeder Einrichtung `router.refresh()`.
  - Sauerstoff: Druck-Eingabe je Flasche mit Status (`o2Status`), „Flasche verknüpfen" (Auswahl `flaschenWoanders` → `flascheUmsetzen`), `NeuFlasche vorgabeLagerortId ausloeser="neutral"`.
- [ ] Steps: DOM-Tests (Auffüllen-Dialog schreibt Absicht inkl. `mitgezaehlt`; Zurücklegen in Schrank ohne Charge nicht übernehmbar; Plombennummer gesperrt bei ungezähltem Fach; Gerät „Fehlt" landet in Nutzlast mit `vorhanden:false`; Verknüpfen ruft `geraetUmsetzen` und `router.refresh`) → implement → run (inkl. `AufladenDialog`-Tests) → commit.

### Task 10: Release Note, e2e, Gesamtprüfung

**Files:**
- Create: `src/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-11-22-zaehlen.ts` (+ Zeile in `register.ts`; Text sinngemäß: „Unter Verwaltung → Fahrzeuge kannst du eine Einheit jetzt mit „Zählen" am Telefon oder Tablet durchzählen, Fehlendes auffüllen, Überzähliges zurücklegen und Abgelaufenes aussondern. Plomben, Geräte und Sauerstoffflaschen legst du dabei gleich an oder verknüpfst sie. Der Abschluss zählt als Check."), `e2e/lagerbuch-verwaltungscheck.spec.ts`
- Modify: ggf. `e2e/seed-lagerbuch.ts` nur wenn nötig

- [ ] **e2e** (Vorbilder `e2e/lagerbuch-check-angemeldet.spec.ts`, `lagerbuch-inventur-mobil.spec.ts`; Helfer `devLogin`, `klickeWennRuhig`, `warteAufGestreamteInhalte`, `lagerbuchUrl`, `E2E_FAHRZEUG_ID`; Ports nur aus `./fixtures`): (1) Admin öffnet Fahrzeugblatt → „Zählen" → zählt alle Positionen mit „Stimmt", setzt eine Position eins niedriger, Ausgleichen → Auffüllen aus Handlager → Abschließen → `Result` → „Zum Check" zeigt „Verwaltungscheck"; Check-Liste zeigt Chip „Verwaltung". (2) 390 px: Karten sichtbar (`[data-rolle="schmalkarten"]`), Fach-Filter vorhanden. Jede ausgelöste Server-Action per `page.waitForResponse` prüfen (Falle 10).
- [ ] **Gesamt:** `pnpm typecheck`, `pnpm lint`, `pnpm anker:neu`, `pnpm vitest run`, `pnpm build`, `pnpm exec playwright test e2e/lagerbuch-verwaltungscheck.spec.ts e2e/lagerbuch-check-angemeldet.spec.ts e2e/lagerbuch-helfer.spec.ts e2e/lagerbuch-ruecklauf.spec.ts --trace off` → alle grün.
- [ ] **Commit** `feat(lagerbuch): Release Note und e2e für den Verwaltungscheck`.
