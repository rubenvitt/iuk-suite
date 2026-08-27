# Planteil 4 — Grenze und Verwaltung (`radio`)

> ## For agentic workers
>
> **Ausfuehrungsart:** `superpowers:subagent-driven-development`. **Ein Subagent je Aufgabe**,
> **ein Review zwischen je zwei Aufgaben**. ⛔ **Kein Implementer unter Sonnet** — Haiku hat in
> diesem Haus gemessen Testzusagen aufgeweicht, statt Code zu reparieren
> (`.claude/projects/.../memory/kein-haiku-fuer-entwicklung.md`).
>
> **Lesereihenfolge, bevor die erste Zeile entsteht:**
> 1. `.superpowers/sdd/planteil4/KONTEXT.md` — **vollstaendig**, inklusive des Nachtrags vom
>    2026-08-24.
> 2. `src/app/m/radio/riegel.test.ts` — der Quelltext-Scan, der **jede** neue Flaeche bewacht.
>    Zuerst der Kopfkommentar (`:6-98`, der Anhebe-Fahrplan steht auf `:81-95`), dann die
>    Klauseln (a), (c), (d), (e), (f).
> 3. `src/app/m/radio/_actions/guards.test.ts:1-100` — der EINE `_actions/`-Scan, seine
>    Ausnahmeliste und seine Zaehlkonstanten. ⛔ **Er sieht `admin/actions.ts` NICHT** (sein
>    `ORDNER` ist `src/app/m/radio/_actions`, `guards.test.ts:33`) — deshalb baut dieser Plan
>    einen vierten Scan, siehe Kapitel „Der vierte Quelltext-Scan".
> 4. `src/app/m/radio/_db/leihen.ts:1-70` — der Kopfkommentar, inklusive der **Prosa-Sperre**:
>    der Scan in `_db/leihen.test.ts` liest den **rohen** Dateitext; wer den Namen der
>    Alt-Umgebungsvariablen oder einen Alt-Routenpfad auch nur im Kommentar erwaehnt, faerbt ihn
>    rot (gemessen, `_db/leihen.ts:57-64`).
> 5. `docs/superpowers/plans/2026-08-24-suite-admin-kurzschluss.md`, Aufgabe **K2** — sie belegt,
>    dass Planteil 4 **technisch nicht blockiert** ist.
>
> **Rangfolge der Dokumente:** Die Kontextdatei bindet ueber diesen Plan, wo beide dasselbe
> sagen; wo dieser Plan mehr sagt, gilt dieser Plan. **Kapitel A (Spec:51-78) und Kapitel B
> (Spec:79-122) der Spec binden ueber jeden Kapiteltext, der ihnen widerspricht — auch ueber
> jede Zeile dieses Plans.**

---

## Stand

| | |
|---|---|
| Repo | `/Users/rubeen/dev/personal/drk/iuk-suite` |
| Branch | `feat/radio-modul-planteil2` |
| Vorgaenger | Planteil 1 (Datenhaltung, M1–M6) · Planteil 2 (Zuschnitt, Z1–Z8) · Planteil 3 (Zugang und Ausleiheflaeche, A1–A20) — alle gebaut und schlussgeprueft |
| Nachfolger | Planteil 5 (Betrieb, Boot, Retention-Takt, `sw.js`, Abbau) |
| Leitplan | `docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md` |
| Fortschrittsseite | `docs/superpowers/plans/2026-08-18-radio-ausfuehrungsplan.md` |

⛔ **Die Grundlinien-Falle, und sie ist in diesem Weg schon einmal zugeschlagen.** Der Nachtrag in
`KONTEXT.md` nennt fuer den Stand nach Planteil 3 **479/479 Testdateien, 8509/8509 Tests**.
`.superpowers/sdd/BASISLINIE-vitest.md` fuehrt eine aeltere Zahl. ⛔ **Miss die Zahl selbst, vor
der ersten Aufgabe**, mit `rtk pnpm vitest run`, und trag sie in den Aufgabenbericht ein. Rate sie
nicht aus einem der beiden Dokumente.

**Folge der gruenen Grundlinie:** jeder Fehlschlag, den du siehst, ist ein **neuer** — du hast ihn
verursacht, bis die Beiseitelege-Gegenprobe das Gegenteil zeigt.

---

## Goal

Am Ende dieses Planteils kann eine Person mit der `radio`-Admin-Gruppe unter
`https://radio.iuk-ue.de/admin` **die ganze Verwaltung bedienen, die heute unter
`radio-admin.iuk-ue.de` laeuft**: Uebersicht mit vier Kennzahlen, Geraeteliste mit Suche, zehn
Filtern, Spaltenwahl und Sortierung, Geraetedetail mit Formular, Notiz und Loeschen, die
Aenderungshistorie eines Geraets, die Ausleihenliste, den Update-Modus, den zweiphasigen
CSV-Import, die Softwareversionen mit Ziel-Marke und Reihenfolge, die Zugangscode-Verwaltung samt
druckbarem Blatt und den CSV-Export als Dateidownload. Eine Person mit der **Updater**-Gruppe
sieht dieselbe Verwaltung, kann aber nur `softwareVersion`, `lastUpdatedAt` und `status` aendern
und Notizen anhaengen — alles andere ist gesperrt, und die drei Menuepunkte Import,
Softwareversionen und Zugaenge sieht sie gar nicht. Und **die sechste und letzte Ersatzfunktion
der HTTP-Grenze steht**: `leihhistorie` in `_db/leihen.ts`.

**Nicht enthalten:** der Router-Schwenk (6.7 Abschnitt D), der Abbau der Alt-Container
(Abschnitt E), der Retention-**Takt** und die Boot-Pruefungen (Planteil 5), der Importer selbst
(Spec 2), das Runbook, `TZ=Europe/Berlin`, das suiteweite Gating von `/m/*`, und das Entfernen des
Suite-Admin-Kurzschlusses (eigener Plan, siehe unten).

---

## Architecture — sieben Bloecke, und die Reihenfolge ist NICHT frei

⛔ **Spec-Kapitel 6.7 (`Spec:5441-5486`) fuehrt eine eigene Reihenfolge-Auflage als
Bauabschnitte A–E.** Sie ist die Ausformulierung von Entscheidung 15 (`Spec:69`) und der Grund,
warum die Blockeinteilung dieses Plans nicht nach Bequemlichkeit geschnitten ist. Woertlich:

> „Entscheidung 15 klingt wie eine Empfehlung zur Bauplanung. Sie ist schaerfer, und der Grund ist
> Entscheidung 3: **der Alt-Kiosk laeuft heute schon unter `radio.iuk-ue.de`.** Es gibt kein
> Parallelfenster. Damit **ist der Router-Schwenk der Fall der HTTP-Grenze** — kein Schritt danach.
> Alles, was Entscheidung 15 verlangt, muss **vor** dem Schwenk fertig sein, und beide Domains
> ziehen im selben Fenster um. **Keine Halb-Migration ist deploybar.**"

Die fuenf Abschnitte und wo Planteil 4 in ihnen steht:

| 6.7-Abschnitt | Was fertig sein muss | Zustaendig |
|---|---|---|
| **A — Datenmodell und Import** | `loans`/`devices` im Suite-Schema, Unique-Index, Import mit normalisierten Zeitstempeln | ✅ Planteil 1 und Spec 2 (gebaut) |
| **B — die sechs Ersatzfunktionen** | `_db/leihen.ts` **vollstaendig**, alle sechs als Drizzle-Aufrufe im selben Prozess | ⏳ **5 von 6** (Planteil 3). ⛔ **Block V-A dieses Plans schliesst B** |
| **C — beide Oberflaechen auf B** | Ausleihe an `/` und Verwaltung an `/admin` rufen **ausschliesslich** die internen Lesepfade; kein `fetch` gegen einen fremden Host im Modul | ⏳ Ausleihe ✅ (Planteil 3), **Verwaltung = Bloecke V-B bis V-F dieses Plans** |
| **D — Router-Schwenk** | A–C gruen, Traefik-Router und `redirectRegex` | ⛔ **NICHT dieser Planteil** — Spec 2 (Runbook), wartet auf den Betreiber |
| **E — Abbau** | Alt-Container abgestellt, `RADIO_ADMIN_*` aus der Compose-Datei entfernt | ⛔ **NICHT dieser Planteil** — Spec 2, mindestens zwei Wochen nach D |

### Die Blockeinteilung, jede mit ihrer 6.7-Begruendung

| Block | Aufgaben | Was er liefert | Warum er dort steht (6.7) |
|---|---|---|---|
| **V-A — Abschnitt B schliessen** | V1 | `leihhistorie(db, f)` in `_db/leihen.ts` | ⛔ **B verlangt ALLE SECHS**, nicht fuenf. Solange die sechste fehlt, ist B offen — und C kann nicht fertig sein, weil `/admin/ausleihen` (eine C-Flaeche) ihr einziger Verbraucher ist. **Deshalb zuerst.** |
| **V-B — die zweite Stufe und die Naht** | V2, V3, V4 | `_lib/rollen.ts`, `requireRadioVerwaltung`, `istRadioUpdater`, `merkeNutzer`, der Layout-Wechsel, `radioNav(stufe)` | Kein 6.7-Abschnitt, sondern die **Vorbedingung von C**: jede der zehn Seiten traegt eine Rechtestufe als **erste Anweisung** (`Spec:4362-4380`). Solange `admin/(arbeit)/layout.tsx` auf `requireRadioAdmin()` steht, sperrt es **jede Updater-Person mit 404, bevor irgendeine Seite laeuft** — und typecheck, lint und build bleiben gruen (`admin/(arbeit)/layout.tsx:39-52`). |
| **V-C — Lesepfade und Fachlogik** | V5–V9 | `_lib/lesepfade/*`, `_lib/updateStand.ts`, `_lib/geraeteDiff.ts`, `_lib/notiz.ts`, `_lib/csv/*` | 6.7-C verlangt „rufen **ausschliesslich** die internen Pfade". Die Pfade muessen also **vor** den Flaechen stehen, sonst greift eine Flaeche zum naechstbesten — und der Abnahmebefehl fuer C (`rg -n "RADIO_ADMIN_\|api/v1/" src/app/m/radio` → nichts) faengt genau **das** nicht, weil ein Direktzugriff auf `db` keinen Alt-Namen nennt. |
| **V-D — die Actions und ihr Waechter** | V10, V11 | `admin/actions.ts` (**neun** Actions, E-V16) und **`admin/actions.test.ts`** | Der Scan ist laut `Spec:4853-4857` „**der einzige Waechter der Aufruftabelle aus §5.4** — kein anderes Gate sieht eine vergessene Zeile". Er muss **mit der ersten Action** entstehen, nie danach. |
| **V-E — die zehn Seiten und die acht Inseln** | V12–V21 | die zehn `page.tsx` und die acht `"use client"`-Inseln | **Das ist Abschnitt C.** |
| **V-F — der Export-Handler** | V22 | `admin/(arbeit)/geraete/export/route.ts`, `HANDLER_ANZAHL` 3 → 4 | Ebenfalls C. Steht **nach** den Seiten, weil sein Lesepfad (`geraeteFuerExport`) aus V9 kommt und seine Riegelform (nicht-werfend, 404) die **Ausnahme** von allem darueber ist — eine Ausnahme baut man zuletzt, wenn die Regel steht. ⚠️ **Der ZWEITE neue Handler steht nicht hier, sondern in V18** (`import/hochladen/route.ts`, `HANDLER_ANZAHL` 2 → 3): er gehoert zu seiner Flaeche, weil der Assistent ihn ruft (E-V16). |
| **V-G — vor dem Merge, EINMAL** | V23 | `rtk pnpm build`, `e2e/radio-verwaltung.spec.ts`, das Ablesen von ⬜ V-L3 | 6.7-D sagt es woertlich: „ein echter Abruf … **nicht `pnpm build`**; die Falle-61-Klasse und Falle 7 zeigen sich **nur** im echten Abruf". Der erste echte Abruf einer Verwaltungsseite ist zugleich die einzige Gelegenheit, ⬜ Z-L1/A-L9 abzulesen. |

### Bloecke mit EINEM gemeinsamen Tor

⛔ **Dieser Planteil hat KEINEN.** Der Normalfall „eine Aufgabe = ein Tor = ein Commit" gilt fuer
alle 23 Aufgaben, und das ist **nicht selbstverstaendlich**, sondern eine Folge davon, wie die zwei
Zaehlwaechter gebaut sind:

* `ADMIN_SEITEN_ANZAHL` in `riegel.test.ts:119` zaehlt mit **`toBe`** (`riegel.test.ts:638-644`).
  Jede Seitenaufgabe hebt die Zahl um **genau das, was sie gebaut hat** — 0→1→2→…→10. Damit ist
  jede fuer sich gruen.
* `HANDLER_ANZAHL` in `riegel.test.ts:111` ebenso, **2 → 3 → 4**, in **zwei** Aufgaben (V18 legt
  `import/hochladen/route.ts` an, V22 den Export-Handler — Entscheidung **E-V16**). ⛔ **Jede
  Anhebung im selben Commit wie ihr Handler.**

⛔ **Zwei Schnitte wuerden ein gemeinsames Tor erzwingen, und beide sind verboten:**

1. **Eine Seite von ihrer Insel trennen.** Eine `page.tsx`, die eine noch nicht existierende
   `"use client"`-Datei importiert, uebersetzt nicht; eine Insel ohne Seite ist eine Datei, die
   `ADMIN_SEITEN_ANZAHL` nicht bewegt und deren Verhaltenstest kein Pruefobjekt hat. **Seite und
   Insel(n) einer Flaeche liegen immer in derselben Aufgabe.**
2. **Den Route Handler von seiner Konstanten trennen.** Landet der Handler ohne die angehobene
   `HANDLER_ANZAHL`, ist Klausel (c) rot; landet die Zahl ohne den Handler, ebenfalls. **Deshalb
   liegen `import/hochladen/route.ts` + `2 → 3` beide in V18 und `geraete/export/route.ts` + `3 → 4`
   beide in V22.**

---

## Tech Stack (belegt)

| Was | Version / Wert | Beleg |
|---|---|---|
| Next.js | 16, App Router, RSC | `CLAUDE.md:3`, `src/proxy.ts` ist die Middleware (`CLAUDE.md`, „Zugriffsschutz") |
| Ant Design | `^6.5.3` | `package.json:25` (⚠️ `CLAUDE.md:3` nennt nur die Hauptversion „Ant Design 6"); Alt-Bestand sitzt auf `^5.22.0` (`Spec:4798-4801`) |
| Drizzle + better-sqlite3 | eine DB **pro Modul** | `CLAUDE.md:3`, `src/core/db/index.ts:18-21` |
| Vitest | 4.1.10, Node 26 | `KONTEXT.md`, Werkzeugfallen |
| DOM-Harness | `src/app/m/qr/_lib/test-dom.tsx` (`mount`/`fill`/`click`/`query`/`submitForm`) | `CLAUDE.md:259` — ⛔ **kein zweites erfinden** |
| Zeichenpaket | `react-icons/pi` (Hausform seit 12.08.2026) | `src/core/shell/navIkonen.tsx:15-20`, `src/app/m/lagerbuch/_ui/ikonen.tsx:1-30` |
| Playwright `baseURL` | `http://portal.localtest.me:3100` — **genau einer** | `playwright.config.ts:65` |
| Modulregistrierung `radio` | `key: "radio"`, `shell: "full"`, `requiresAuth: false`, `adminGroups: ["iuk-radio-admin"]` | `src/core/registry.ts:197-198` |
| Suite-Riegel des Moduls | `istRadioAdmin` ueber `adminGroupsFor(getModule("radio"))`, **bewusst nicht** `isModuleAdmin` | `src/app/m/radio/_lib/zugang.ts:188-192`, Begruendung `:93-97` |
| CSV-Neutralisierung im Haus | `neutralizeFormula` in `src/app/m/feedback/_lib/csv.ts:10-21`, `buildCsv` joint **hart mit `,`** (`:6-8`) | gemessen — siehe Entscheidung **E-V12** |

---

## Spec — Kapitelgrenzen und Vorrang

| Kapitel | Zeilen | Was daraus gilt |
|---|---|---|
| **A — Die gesetzten Entscheidungen** | `Spec:51-78` | ⛔ **bindet ueber jeden Kapiteltext.** Tragend hier: 4, 9, 10, 13, 14, 15 |
| **B — Widersprueche zwischen den Kapiteln** | `Spec:79-122` | ⛔ **bindet ueber jeden Kapiteltext.** Tragend hier: B4, B9, B10, B11, B13, B17 |
| **Kapitel 5 — Die Verwaltung unter `/admin`** | `Spec:4137-4935` | die zehn Routen, die zwei Stufen, die acht Inseln, die zehn Actions, CSV, die Tests |
| **Kapitel 6 — Der Wegfall der HTTP-Grenze** | `Spec:4936-5489` | die sechs Ersatzfunktionen, 6.3 (was still mitverschwaende), 6.5 `api_tokens`, 6.6 `STALE_GRACE_MS`, **6.7 die Reihenfolge-Auflage** |

### Die sechs B-Eintraege, die INNERHALB der zitierten Kapitel etwas ueberschreiben

| # | Was er umstoesst | Was gilt | Wo der Kapiteltext noch abweicht |
|---|---|---|---|
| **B4** (`Spec:93`) | „Zwei Rollen oder eine" — im Spec-Dokument **geparkt** | ⛔ **ZWEI Stufen, Betreiberentscheidung C.6/B4 vom 2026-08-21** (`KONTEXT.md`). Der Widerspruch ist **operativ** aufgeloest, nicht im Dokument | der Spec-Text sagt bis heute „nicht entschieden" — **ueberholt** |
| **B9** (`Spec:98`) | drei auseinanderlaufende Routenkarten | **Kapitel 1 §1.2.2 gewinnt bei Pfadnamen und Groups**: `/admin/software`, `/admin/zugaenge`, zwei Route-Groups, `admin/(druck)/zugaenge/blatt`. **Kapitel 5 gewinnt bei `/admin/einstellungen` → `/admin/versionen`**. Gezaehlt: **zehn** Seiten plus **ein** Route Handler | ⛔ **§5.6.1s Insel-Tabelle (`Spec:4509`, `:4510`) traegt noch `update/` und `codes/`**, §5.13 (`Spec:4860`) noch „Codes". **Verbindlich: `software/` und `zugaenge/`** |
| **B10** (`Spec:99`) | der CSV-Export-Handler antwortete 403 | ⛔ **404, nie 403** | — (§5.4 `Spec:4379` traegt die Korrektur bereits) |
| **B11** (`Spec:100`) | `requireRadioAdmin()` auch im Route Handler | ⛔ **aufgeteilt**: Seiten und Actions werfend, **Route Handler `radioHostOderNull` + `istRadioAdmin(await viewerOderNull())`** | — |
| **B13** (`Spec:102`) | „genau zwei Route Handler" | **vier Formen, zwei Dateien, vier Handler.** Kapitel 5s Handler nimmt `radioHostOderNull`, nicht `hostAbweisung` (`Spec:4379`) | — |
| **B17** (`Spec:117`) | §5.9 traegt noch die Fassung vor B10 | ⛔ **B10 gilt auch in §5.9** | ⛔ **`Spec:4728` sagt woertlich noch „baut seine `403` selbst" — das ist die von B17 als veraltet benannte Stelle. Lies sie als 404.** |

---

## Zwoelf Dinge, die diesen Plan von einem gewoehnlichen Umsetzungsplan unterscheiden

Sie gelten fuer **jede** Aufgabe und werden dort nicht wiederholt.

1. ⛔ **Die HTTP-Grenze faellt HIER — und sie faellt NICHT durch Loeschen im Alt-Repo.**
   `radio-admin` behaelt seine sechs `/v1`-Routen **unveraendert** bis 6.7-Abschnitt D. Was dieser
   Planteil tut, ist: die **Suite** so vollstaendig zu machen, dass D moeglich wird. ⛔ **Keine
   Aufgabe dieses Plans fasst `/Users/rubeen/dev/personal/drk/radio-admin` oder
   `/Users/rubeen/dev/personal/drk/radio-inventar` an** — nicht lesend-veraendernd, in keinem
   Schritt.
2. ⛔ **`riegel.test.ts` ist scharf, und er zaehlt EXAKT.** `ADMIN_SEITEN_ANZAHL = 0` heute
   (`:119`), `HANDLER_ANZAHL = 2` (`:111`), beide mit `toBe`. Der Kopfkommentar begruendet das
   ausdruecklich (`:64-76`): „`laenge >= 0` ist fuer JEDE Liste wahr; es gaebe **keine** Mutation,
   die den Fall rot macht." **Wer den ersten roten Zaehler sieht und zu `>=` greift, baut die
   NT11-Fehlerklasse neu.** Jede Seitenaufgabe hebt die Zahl um genau eins — siehe Entscheidung
   **E-V2**.
3. ⛔ **ZWEI Rechtestufen, und `riegel.test.ts` faengt eine faelschlich ABGESENKTE Seite
   strukturell nicht.** Klausel (a) und (e) lassen im `(arbeit)`-Zweig `requireRadioAdmin(`
   **oder** `requireRadioVerwaltung(` zu, und zwar **absichtlich** (`riegel.test.ts:380-417`):
   ohne das ODER waere der Scan gegen `Spec:4367` rot-by-construction. **Betroffen sind genau
   zwei Seiten** — `admin/(arbeit)/versionen` und `admin/(arbeit)/zugaenge` (`Spec:4376-4377`).
   Sie bekommen eine **eigene, namentliche Zusicherung**; kein Scan ersetzt sie. Siehe das Kapitel
   „Die Rechtestufe je Seite" und Aufgabe **V19** / **V20**.
4. ⛔ **1:1-Pflicht bei Filtern, Sortierung und Feldgrenzen — und der Praezedenzfall ist frisch.**
   Die Schlusspruefung von Planteil 3 fand einen Lesepfad, der sich „ersetzt
   `GET /v1/loan-devices`" nannte und den `loanable`-Filter **nicht** abbildete (Fund F1) — ein
   nicht verleihbares Geraet waere ausleihbar gewesen. **Jede** ersetzte Route und **jede**
   ersetzte Maske dieses Plans traegt ihre gemessene Vorlage mit `datei:zeile`. Siehe das Kapitel
   „Die 1:1-Tafel".
   ⛔ **Und die 1:1-Antwort ist manchmal „keine".** `radio-admin/shared/src/schemas.ts:50-99`:
   **einziges Pflichtfeld ist `issi`**, **keine** serverseitige Maximallaenge auf irgendeinem
   Geraete-Textfeld. Ein plausibel aussehendes `maxLength: 200` in einer Verwaltungsmaske ist
   genau die F1-Fehlerklasse, gegen die diese Auflage steht.
5. ⛔ **Falle 9 ist der teuerste Posten dieses Planteils.** `<Table columns={[{ render: fn }]}>`
   geht **nicht** direkt aus einer Server Component (`CLAUDE.md`, Falle 9). Die Inselgrenze ist
   **die Flaeche, nicht die Spaltenliste** (`Spec:4490-4497`). Eine falsch gesetzte Grenze ist
   fuer typecheck, lint und build **unsichtbar** und fuer jsdom **strukturell** unsichtbar (dort
   gibt es keine RSC-Grenze). Siehe das Kapitel „Die acht Client-Inseln".
6. ⛔ **Falle 6 und Falle 7 sind gegenlaeufig und duerfen nicht zusammengelegt werden.**
   `_lib/` traegt **kein** `"use client"` (`Spec:4305-4307`) — dort liegen Werte, die Server
   Components lesen. Umgekehrt darf **kein** Zeichenpaket in einer Datei ohne `"use client"`
   importiert werden (`Spec:4572-4573`: „**Regel fuer dieses Kapitel:** kein Symbol wird in einer
   Datei ohne `"use client"` importiert, auch nicht in `_lib/`"). „Setzt man `"use client"` auf `icons.ts`, verwandelt sich
   7 in 6 — HTTP 200 mit **leerer** Map, und der Rueckfall traegt still das falsche Icon."
7. ⛔ **Falle 3: Rot gehoert allein den zerstoerenden Knoepfen.**
   `colorError === colorPrimary === FARBEN.rot` (`src/core/theme/theme.ts:32-33`). `updateStand`
   wandert **als Wort**, nicht als Farbe: „veraltet" `color="warning"`, „aktuell" `color="success"`,
   „unbekannt" `default` (`Spec:4555-4561`). ⛔ **Der Alt-Rotton `#cf1322`
   (`radio-admin/client/src/features/dashboard/Dashboard.tsx:41`) entfaellt.**
8. ⛔ **Falle 4: `size` wird auf Bedienelementen gar nicht gesetzt.** `SoftwareVersionsPage.tsx`
   setzt `size="small"` an fuenf Stellen (`:119`, `:126`, `:145`, `:155`, `:167`) und
   `ImportWizard.tsx:305` `size="small"` am `Table`. **Nichts davon wandert mit.** Die Verwaltung
   laeuft in `FullShell` mit `controlHeight: 44` (`ARBEITSDICHTE`), auch auf dem Telefon. Platz
   schafft `scroll={{ x: "max-content" }}`, nicht `size`.
9. ⛔ **`requiresAuth: false` heisst NULL Middleware-Gating fuer `/m/radio/admin/*`.**
   `core/routing.ts:58-66` gatet nach dem Modul aus dem Segment und unterscheidet `/m/radio/` und
   `/m/radio/admin/...` **nicht**; `canAccess` steigt fuer ein Modul ohne Auth-Pflicht sofort mit
   `true` aus (`core/registry.ts:265`). **Jede Seite, jede Action und der eine Handler tragen
   ihren Riegel selbst** (Entscheidung 10, `Spec:66`). Eine vergessene Zeile ist typkorrekt und
   lint-sauber.
10. ⛔ **Die eiserne Leerstellen-Regel.** Wo ein Wert erst der Bau oder der Server hergibt, steht
    eine **benannte Leerstelle** (⬜ V-L…) mit „wer liest sie wann ab" — **nie** eine plausibel
    aussehende Erfindung. Und jede Leerstelle bekommt **zusaetzlich zur Plantabelle eine
    Belegzeile im Quelltext selbst**: die Schlusspruefung liest die Quelltextstellen nach, nicht
    den Plantext.
11. ⛔ **Zeit ist Unix-SEKUNDEN im Ziel, epoch-MILLISEKUNDEN in der Quelle** — mit **einer**
    gemessenen Ausnahme, und sie ist die gefaehrlichste dieses Planteils:
    **`devices.last_updated_at` ist in der Suite eine TEXT-Spalte mit `YYYY-MM-DD`**
    (`src/app/m/radio/_db/schema.ts:39`), nicht ein Zeitstempel. Der Alt-Bestand fuehrt dort
    epoch-ms mit **drei** widerspruechlichen Zonensemantiken. Siehe Entscheidung **E-V11**.
12. ⛔ **NT7, und er gilt fuer jedes Tor.** `rtk` meldet falsches Gruen fuer `tsc`, sobald Farbe
    durchkommt. `NO_COLOR=1` ist gesetzt, `package.json` traegt `tsc --noEmit --pretty false`.
    ⛔ **Niemals `grep -cE "error TS"` auf farbigem Output** — die ANSI-Sequenz steht zwischen
    `error` und `TS`, und `grep` zaehlt **0**. Pruefe den **Exit-Code**.

---

## Global Constraints

* **Alle Kommandos mit `rtk` praefixt, auch in Ketten mit `&&`.**
* **Deutsch, mit korrekten Umlauten, in Prosa und Kommentaren.** In TypeScript-Bezeichnern und in
  Testnamen **keine** Umlaute. Und ⛔ **niemals ein Umlaut in einem zitierten Wert oder einem
  Grep-Anker.**
  ⚠️ **Die Ausnahme, und sie ist echt:** ein **Bildschirmtext**, der woertlich aus dem Bestand
  wandert, traegt seine Umlaute (`„Zurückgegeben"`, `„Geändert"`, `„Gerätefunktionen"`). Er steht
  dann in einer Zeichenkette, nicht in einem Bezeichner.
* **Belegpflicht.** Jede Behauptung in Kommentar oder Plan nennt `datei:zeile`.
* ⛔ **Kein `git add .` und kein `-A`.** Namentlich stagen, mit `rtk git show --stat HEAD`
  nachsehen.
* ⛔ **Commits muessen signiert sein** (main-Ruleset).
* ⛔ **Migrationen sind append-only.** Dieser Planteil legt **keine** neue Migration an — siehe
  „Was dieser Plan anlegt und aendert".
* ⛔ **`getModuleDb()` wird in Tests NICHT benutzt** — sein Cache ist per Modulschluessel gekeyt,
  nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`). Tests bauen ihre DB selbst und migrieren
  sie (Vorbild `src/app/m/lagerbuch/_db/migrations.test.ts:29-37`).
* ⛔ **Kein Worktree unter `.claude/worktrees/`** (251 Fremdfehlschlaege, `vitest.config.ts:8-34`).
* ⛔ **Kein `pnpm build` vor einem Testlauf, den man ernst nimmt** — `.next/standalone/src/` ist
  eine vollstaendige Kopie des Quellbaums inklusive Testdateien (52 Fehlschlaege).
* ⛔ **Kein `pnpm dev` parallel zur Testsuite.**
* **antd 6 ist das Design-System.** Nicht Radix, nicht Tailwind-Primitives, nicht lucide.

### Verbotene Namen und Muster

| Verboten | Warum | Beleg |
|---|---|---|
| `RADIO_ADMIN_` und `api/v1/` als Zeichenkette **irgendwo unter `src/app/m/radio/`** — auch im Kommentar, auch in Prosa | Der Abnahmebefehl fuer 6.7-C ist `rg -n "RADIO_ADMIN_\|api/v1/" src/app/m/radio` → **nichts**. `_db/leihen.test.ts` scannt den **rohen** Dateitext | `Spec:5453`, gemessen `_db/leihen.ts:57-64` („`1 failed \| 25 passed`, allein an diesem Kommentar") |
| `requireRadioAdmin(` / `requireRadioVerwaltung(` in einem **Route Handler** | B11 — ein werfender Riegel endet in `redirect('/login?…')`; ein anonymer `GET` auf `/admin/geraete/export` landete im Login-Umweg | `riegel.test.ts:602-607`, `Spec:100/4379/117` |
| `403` als Statuscode irgendwo unter `admin/` | B10 — ein 403 macht den Bestand an Verwaltungspfaden aufzaehlbar, waehrend die Seiten daneben schweigen | `Spec:99`, `Spec:4379` |
| `\|\|` in `istRadioAdmin`, um die Updater-Stufe hineinzufalten | Die zweite Stufe kommt als **zweite Funktion**. `admin` bleibt strikt strenger als `updater` | `_lib/zugang.ts:153-155`, `:161-175`; Alt-Vorbild `radio-admin/shared/src/role.ts:7-8` |
| `isModuleAdmin` / `canAdminModule` unter `src/app/m/radio/` | Entscheidung 9 — `radio` ignoriert den Suite-Admin-Kurzschluss **modulintern** | `Spec:65`, `_lib/zugang.ts:102-106`, `riegel.test.ts:1016-1035` |
| `size="small"` / `size="large"` auf einem antd-Bedienelement | Falle 4 — `FullShell` traegt `controlHeight: 44` | `CLAUDE.md`, Falle 4 |
| `@ant-design/icons` in **irgendeiner** Datei dieses Moduls | Falle 7 — HTTP 500 **beim Import**, `"use client"` behebt es nicht | `CLAUDE.md`, Falle 7; `src/core/shell/icons.test.ts` |
| ein **zweiter** Hexsatz fuer die Statustoene unter `admin/` | NS-A8b, Zusage §4.12 Nr. 11 woertlich: „Die Verwaltung darf sie mitbenutzen; **sie darf ihre Statusfarben nicht ein zweites Mal definieren.**" | `_lib/status.ts:125` (`STATUS_HEX`) |
| ein **zweites** Ikonenmodul neben `_ui/ikonen.tsx` | NS-A8b | `_ui/ikonen.tsx:55-68` |
| ein **zweites** DOM-Test-Harness | `CLAUDE.md:259` | `src/app/m/qr/_lib/test-dom.tsx` |
| `ohneKommentareUndZeichenketten(...)` **direkt** in einem neuen Scan | Der Kommentarschnitt-Fehler. **Nur `bereinigt` schneidet** | `riegel.test.ts:229`, `:291`, `:334` — ⛔ **ab V11 stehen die drei in `_lib/quelltextScan.ts`** (E-V13), und der Waechter darueber ist `riegel.test.ts:1208-1221` (`toBe(2)`), der im selben Commit mitzieht |

### Das Tor je Aufgabe — es ist NICHT „volle Suite gruen"

* `rtk pnpm typecheck` — **0 Fehler** (Exit-Code pruefen, nicht die Meldung)
* `rtk pnpm lint` — **0 Fehler**
* **die eigenen Testdateien der Aufgabe gruen**
* **kein neuer Fehlschlag** in einer Datei, die der Diff nicht anfasst (gegen die selbst gemessene
  Grundlinie)
* ⛔ **zusaetzlich ab V12:** `rtk pnpm vitest run src/app/m/radio/riegel.test.ts` gruen — jede
  Seitenaufgabe beruehrt seinen Zaehler.

Streitfaelle entscheidet die **Beiseitelege-Gegenprobe** (eigene Dateien temporaer verschieben,
voll laufen lassen, zuruecklegen) — nicht der Zaehlwert allein.

`rtk pnpm build` und Playwright laufen **einmal vor dem Merge** (Aufgabe V23), **nie davor**.

---

## Die Bauform-Zulaessigkeitstafel

| # | Was, wo | Zulaessig? | Beleg / Begruendung |
|---|---|---|---|
| 1 | `columns={[{ render: fn }]}` an antds `Table` **aus einer Server Component** | ⛔ **NEIN** | Falle 9. `Error: Functions cannot be passed directly to Client Components`. ⛔ **Das ist DIE zentrale Zeile dieses Planteils** — fuenf der zehn Seiten sind tabellenlastig, und `deviceColumns.tsx` haelt allein **18 Spaltendefinitionen mit 15 `render`** (`radio-admin/client/src/features/devices/deviceColumns.tsx:16-35`) |
| 2 | `deviceColumns`-Aequivalent in `_lib/` | ⛔ **NEIN** | Falle 6 **und** Falle 9 zugleich. `COLUMN_DEFS` wird Teil der Insel bzw. eines `"use client"`-Nachbarmoduls, **nicht** von `_lib/` (`Spec:4512-4521`) |
| 3 | Compound-Zugriff (`Form.Item`, `Typography.Title`, `Descriptions.Item`, `List.Item`, `Input.TextArea`, `Input.Search`, `Space.Compact`, `Upload.Dragger`, `Tabs`) in einer Server Component | ⛔ **NEIN** — HTTP 500 | Falle 1, `CLAUDE.md:11`. Gemessen betroffen: `DeviceFields.tsx` (**21** gerenderte `Form.Item` — 13 literale im Rumpf plus 8 ueber den Helfer `SuggestCol`, `DeviceFields.tsx:44`), `DeviceList.tsx:135-136` (`Space.Compact`, `Input.Search`), `DeviceDetailDrawer.tsx:77-102` (`Descriptions.Item`), `ImportWizard.tsx:150` (`Upload.Dragger`), `SoftwareVersionsPage.tsx:117`, `:188` (`Space.Compact`) |
| 4 | `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag` **als Bauteil** in einer Server Component | ✅ **JA** | `CLAUDE.md:13`. ⛔ **Der Bauteil, nicht das `render`** — deshalb braucht die Uebersicht (§5.11) **keine** Insel, die Geraeteliste sehr wohl |
| 5 | `Grid.useBreakpoint()` / `usePersistentState` in einer Server Component | ⛔ **NEIN** — Client-Hooks | `DeviceList.tsx:36`, `:49-54`. Sie leben **in** der Insel (`Spec:4490-4497`) |
| 6 | Eine Server Action als **Prop** an eine Client-Insel reichen | ⛔ **NEIN** | `Spec:4495-4497`: Server Actions duerfen als einzige ueber die Grenze — **direkt importiert**, nicht durchgereicht. Vorbild `src/app/m/aufgaben/_ui/RoutinenTabelle.tsx:4` |
| 7 | Ein `Date`-Objekt als Prop an eine Client-Insel | ⛔ **NEIN** | `Spec:4536-4539`: vorformatierte Zeilen, keine Rohdaten. Vorbild `src/app/m/lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx:7-14` |
| 8 | `requireRadioAdmin()` / `requireRadioVerwaltung()` als **erste Anweisung** einer Server Action | ✅ **JA — Pflicht** | Es gibt **kein Layout ueber einer Action** (`Spec:4382-4386`). „Wer sie fuer doppelt haelt und entfernt, oeffnet die Luecke, gegen die der Riegel gebaut ist" |
| 9 | `requireRadioAdmin()` in einem **Route Handler** | ⛔ **NEIN** | B11/B17. Er nimmt `radioHostOderNull(request.headers)` + `istRadioAdmin(await viewerOderNull())` und baut seine **404** selbst |
| 10 | `notFound()` / `redirect()` im Antwortweg eines Route Handlers | ⛔ **NEIN** | `Spec:4723-4729`: keine brauchbare Antwort auf einen Dateiabruf |
| 11 | `403` statt `404` im Export-Handler | ⛔ **NEIN** | B10 (`Spec:99`), bestaetigt B17 (`Spec:117`) |
| 12 | `requireRadioHost` **vor** dem Personen-Riegel in einem Layout | ✅ **JA — Reihenfolge ist Pflicht** | `riegel.test.ts:701-706`, `Spec:429-437` |
| 13 | `requireRadioHost` in einer Seite **innerhalb** einer Route-Group | ⛔ **NEIN** | `Spec:4369-4378` gibt jeder Seite **genau eine** erste Anweisung. Eine Klausel, die den Host auch dort verlangte, waere rot-by-construction (`riegel.test.ts:646-653`) |
| 14 | `requireRadioHost` in einer Seite **ausserhalb** jeder Route-Group | ✅ **JA — Pflicht, und vor der Person** | `riegel.test.ts:675-706`. ⛔ Dieser Planteil legt **keine** solche Seite an — alle zehn liegen in `(arbeit)` oder `(druck)` |
| 15 | `merkeNutzer(...)` **vor** `istRadioAdmin` im Riegelkoerper | ⛔ **NEIN** | NS-Z7: die Zeile steht **nach** dem Riegel. Klausel (d) liest denselben Funktionskoerper mit |
| 16 | Den gemeinsamen Teil von `requireRadioAdmin`/`requireRadioVerwaltung` in einen Helfer ziehen | ✅ **JA — aber nur mit umgezogenen Zusicherungen** | `riegel.test.ts:784-799` schreibt es aus: „die vier Zusicherungen **WANDERN** in den Koerper dieses Helfers … Sie werden NICHT geloescht und NICHT zu einem dateiweiten Scan aufgeweicht" |
| 17 | Eine `page.tsx` oder `layout.tsx` **ausserhalb** von `admin/` anlegen | ⛔ **NEIN** | NS-A4: `AUSLEIH_FLAECHEN_ANZAHL = 5` bleibt bei 5. „Legt er doch eine an, ist Klausel (f) rot — und das ist gewollt" |
| 18 | Eine **vierte** Ausnahme in `_actions/guards.test.ts`s `AUSNAHMEN` | ⛔ **NEIN** | NS-A5: „Eine VIERTE Ausnahme ist ein roter Test, keine Zeile im Diff" (`guards.test.ts:513`) |
| 19 | `admin/actions.ts` unter `_actions/` legen, damit `guards.test.ts` sie mitsieht | ⛔ **NEIN** | `Spec:4243` legt sie nach `admin/actions.ts`. Der Preis ist der **vierte** Scan — siehe eigenes Kapitel. ⬜ **V-L9** |
| 20 | Eine neue Drizzle-Migration | ⛔ **NEIN** | Alle Tabellen und Spalten, die dieser Planteil liest oder schreibt, stehen bereits (`_db/schema.ts`, zwei Migrationen). Migrationen sind append-only, und eine ueberfluessige ist eine Absturzschleife im Container |
| 21 | `export const dynamic = "force-dynamic"` auf `geraete/page.tsx` | ✅ **JA — Pflicht** | `Spec:4644-4645`, Vorbild `lagerbuch/verwaltung/(arbeit)/journal/page.tsx:24` |
| 22 | Ein modul-eigener Cache oder Retry als Ersatz fuer `STALE_GRACE_MS` | ⛔ **NEIN** | §6.6 / B15: der ganze Ersatz sind WAL und `busy_timeout = 5000` (`src/core/db/index.ts:18`, `:20`) |
| 23 | `api_tokens` im Schema, im Import oder im Paritaetscheck | ⛔ **NEIN** | §6.5, Entscheidung 13. Bestandspruefung: erscheint an keiner Stelle in `_db/schema.ts` |

---

## Die Sperrtafel

### 1. Vorbedingungen

| # | Vorbedingung | Status | Beleg |
|---|---|---|---|
| **V1** | Planteil 3 gebaut und schlussgeprueft | ✅ **erfuellt** | `KONTEXT.md`, Nachtrag 2026-08-24: 479/479 Dateien, 8509/8509 Tests, typecheck 0, lint 0, build 0, playwright 333 passed |
| **V2** | `_db/leihen.ts` mit fuenf von sechs Funktionen | ✅ **erfuellt** | `_db/leihen.ts:285`, `:333`, `:373`, `:501`, `:648` |
| **V3** | `_lib/zugang.ts` mit der **Naht** fuer die zweite Stufe | ✅ **erfuellt** (die Naht, nicht die Stufe) | ausgeschriebener Kommentarblock `_lib/zugang.ts:132-187` |
| **V4** | Die zwei Verwaltungs-Huellen stehen, beide mit Host- und Personenriegel | ✅ **erfuellt** | `admin/(arbeit)/layout.tsx`, `admin/(druck)/layout.tsx` |
| **V5** | Der Suite-Admin-Kurzschluss (`src/core/groups.ts:125`) | ⏳ **offen — blockiert NICHT** | Eigener Plan `docs/superpowers/plans/2026-08-24-suite-admin-kurzschluss.md`, Aufgabe **K2** belegt es namentlich: „Folge: **Planteil 4 ist technisch nicht blockiert.**" Siehe eigenes Kapitel |
| **V6** | Die CWE-348-Umstellung in `core/ratelimit.ts` | ✅ **gebaut** (`7d71b6c`) — und fuer diesen Planteil **gegenstandslos** | `Spec:4922-4925`: „Voraussetzung fuer den Code-Endpunkt in Kapitel 3, **nicht** fuer `/admin`" |
| **V7** | `SUITE_UPDATER_GROUP_RADIO` in `.env.example` | ⛔ **NICHT vorhanden** — **gemessen** | `rtk grep RADIO .env.example` liefert `SUITE_ADMIN_GROUP_RADIO` (`:83`, `:96`), `SUITE_HOST_RADIO` (`:136`, `:392`), die **fuenf** `RADIO_*`-Variablen (`:407-435`: `RADIO_AUSLEIH_SITZUNG_SECRET`, `RADIO_AUSLEIH_SITZUNG_STUNDEN`, `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN`, `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN`, `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE`) — **`SUITE_UPDATER_GROUP_RADIO` steht nirgends.** ⚠️ `E4-formatvorbild.md` behauptet, die Zeile sei „gesetzt (existiert)" — **das ist falsch, und Aufgabe V2 legt sie an** |
| **V8** | `radioBootFehler()` mit der **sechsten** Boot-Pruefung (C.6/B4) | ⛔ **existiert nicht** — und gehoert **Planteil 5** | `_lib/boot.ts` fuehrt heute nur `retentionGrenze` (`:40`) und `raeumeLeihhistorie` (`:62`); `radioBootFehler` gehoert Kapitel 7 §7.3 (B8, `Spec:97`). Siehe „Nahtstellen zu Planteil 5" |
| **V9** | Ein zweiter `baseURL` fuer den Fremd-Host-e2e-Fall | ✅ **wird NICHT gebraucht** — **gemessen** | `playwright.config.ts:65` fuehrt genau einen (`http://portal.localtest.me:3100`) — und `e2e/lagerbuch-hosts.spec.ts:151-152` faehrt die Fremd-Host-404-Zusicherung damit heute schon, ueber eine **absolute** URL (`e2e/helpers/lagerbuch.ts:28`, `:89`, `:94`). ⛔ **⬜ V-L4 ist gestrichen**; V12 legt `e2e/helpers/radio.ts` nach demselben Vorbild an |

⚠️ **Nicht verwechseln:** **V5** (Suite-Admin-Kurzschluss, `core/groups.ts`) und **V6**
(CWE-348, `core/ratelimit.ts`) sind zwei verschiedene Suite-Fremdposten. Nur V5 wird in diesem
Fenster ueberhaupt noch entschieden, und auch der blockiert nicht.

### 2. Leerstellen, die dieser Planteil ENTSPERRT (nicht abliest)

| ⬜ | Was offen ist | Wer liest sie wann ab | Welchen Cutover-Schritt sie befeuert |
|---|---|---|---|
| **E1** (`SPERREN-radio-spec2.md:112`) | Wie heisst `SUITE_ADMIN_GROUP_RADIO` in Produktion? | **Betreiber**, vor **Cut 26** — ⛔ **nicht** vor der Generalprobe | 6.7-D. Ohne sie sperrt der Cutover „alle oder niemanden" (`Spec:4427-4430`) |
| **E1b** (`SPERREN-radio-spec2.md:110`) | Wie heisst `SUITE_UPDATER_GROUP_RADIO` in Produktion? | **Betreiber**, vor **Cut 26** | dito. **Dieser Planteil macht sie ueberhaupt erst fragbar**, indem er die Stufe baut |
| **Z-L1 / A-L9** (`riegel.test.ts:49-53`) | Greift der Riegel einer Verwaltungs-Huelle bei einem **echten** Abruf? Fuehrt Next das Layout einer Route-Group aus? | ⛔ **Planteil 4 selbst, Aufgabe V23** — der erste echte Abruf gegen `/admin`. Bis dahin steht nur der Quelltext-Scan | 6.7-D. „Kein Fall des Planteil-4-Wegs darf ‚der Riegel steht da' mit ‚der Riegel greift' verwechseln" |
| ~~**A-L16**~~ | ⛔ **GESTRICHEN — sie ist bereits GESCHLOSSEN, gemessen.** `_lib/meldungen.ts:19` sagt woertlich „✅ **A-L16 IST GESCHLOSSEN (A18).**", und `:22-23` nennt den Grund: „Jetzt scannt `riegel.test.ts` beide Direktiven ueber JEDE Datei unter `_lib/` und `_db/`" — bestaetigt am Scan selbst (`riegel.test.ts:1084`, `it('findet auch keine Direktive "use server"')`). ⛔ **Dieser Planteil hat dort nichts abzulesen**; `admin/actions.test.ts` ist eine **zusaetzliche** Zusicherung fuer `admin/`, kein Ersatz und keine Verkleinerung | — | — |

### 3. Leerstellen, die dieser Planteil NEU benennt

| ⬜ | Die Frage | Wer liest sie wann ab | Vorbelegung, mit der der Bau weiterlaeuft |
|---|---|---|---|
| **V-L1** | Der echte Wert von `SUITE_UPDATER_GROUP_RADIO` | **Betreiber**, vor Cut 26 (= E1b) | ⛔ **Ein frei gewaehlter Wert, und das ist richtig.** `.env.example` bekommt `# SUITE_UPDATER_GROUP_RADIO=iuk-radio-updater` **auskommentiert**, mit dem ⬜ daneben. `_lib/rollen.test.ts` haelt fest, dass ein **leerer oder fehlender** Wert die Stufe **schliesst**, nicht oeffnet |
| **V-L2** | Der echte Wert von `SUITE_ADMIN_GROUP_RADIO` | **Betreiber**, vor Cut 26 (= E1) | Registry-Vorgabe `iuk-radio-admin` (`src/core/registry.ts:198`) traegt weiter |
| **V-L3** | Greift der Verwaltungs-Riegel bei einem echten Abruf? (Erbe von Z-L1/A-L9) | ⛔ **V23**, im ersten Playwright-Lauf gegen `/admin`. **Das Ergebnis wird in den Kopfkommentar von `riegel.test.ts` eingetragen** — nicht nur in den Plan | keine. Bis V23 behauptet **kein** Kommentar und **kein** Test, dass ein Riegel greift |
| ~~**V-L4**~~ | ⛔ **GESTRICHEN — durch Messung widerlegt (2026-08-24).** Die Annahme war, „`/admin` auf einem fremden Suite-Host ⇒ 404" brauche einen **zweiten** `baseURL`. **Das Repo faehrt genau diesen Fall heute, mit demselben EINEN `baseURL`**, ueber eine absolute URL statt eines relativen Aufrufs: `e2e/lagerbuch-hosts.spec.ts:151-152` (`const fremd = await page.request.get(fremdUrl(pfad)); expect(fremd.status(), …).toBe(404);`), mit `e2e/helpers/lagerbuch.ts:28` (`FREMDER_HOST = "feedback.localtest.me"`), `:89` (`lagerbuchUrl`) und `:94` (`fremdUrl`) — waehrend `playwright.config.ts:65` unveraendert **einen** `baseURL` fuehrt. ⚠️ **`Spec:4889-4891` („Erfordert einen zweiten `baseURL` … nicht pruefbar, Falle 57") ist damit an dieser Stelle ueberholt** — dieselbe Klasse wie B9/B17: der Kapiteltext beschreibt einen Stand, den das Haus inzwischen besser kann. ⛔ **Fall 8 wird ein GRUENER Fall, kein `test.skip`** — siehe V12 Schritt 1 und V23 | ⛔ **entfallen** |
| **V-L5** | Traegt `/admin/import` die Verwaltungs- oder die Admin-Stufe? | ⛔ **Betreiber** — der Widerspruch steht **in der Spec selbst**. Dieser Plan **waehlt** (siehe **E-V4**) und macht die Wahl pruefbar; eine Umkehr ist eine Zeile plus ein Testfall | §5.4 (`Spec:4375`), die als „verbindlich" bezeichnete Aufruftabelle: `await requireRadioVerwaltung()`. **Die neun Actions und der Hochladen-Handler bleiben davon unberuehrt** — sie tragen alle die Admin-Stufe |
| **V-L6** | Wird das Loeschen eines Geraets bei **aktiver** Leihe abgelehnt? | ⛔ **Kapitel 4 / Betreiber.** `Spec:4686-4691` gibt die Frage ausdruecklich weiter: `device_events` haengt am Geraet (Cascade-FK, `_db/schema.ts:127-129`), **Leihen tragen keinen Fremdschluessel** (`_db/schema.ts:207`) — ein geloeschtes Geraet kann eine Leihzeile verwaisen lassen | ⛔ **Der Bau LEHNT AB, wenn eine offene Leihe existiert**, und die Ablehnung ist eine Meldung im `Popconfirm`-Zweig, nicht ein verstecktes Knopf. Begruendung: das ist die **wiederherstellbare** Richtung — eine faelschlich verweigerte Loeschung kostet einen Klick nach der Rueckgabe, eine verwaiste Leihzeile ist Datenschaden ohne Fehlermeldung. ⚠️ **Der Alt-Bestand lehnt NICHT ab** (`radio-admin/server/src/repos/deviceRepo.ts:67-70`: `deleteDevice` prueft nichts) — das ist damit eine **benannte Abweichung**, keine 1:1-Uebernahme, und sie steht im Quelltext an der Ablehnung |
| **V-L7** | Traegt die Ereignisgrenze **200 ohne Blaetterung**? | **Generalprobe** (Spec 2), am echten Bestand | ⛔ **200, neueste zuerst, ohne Blaetterung** (`Spec:4767-4770`). ⚠️ **Der Alt-Leser hat gar keine Grenze** (`deviceRepo.ts:248-254`: `getDeviceEvents` ohne `limit`) — die 200 sind eine **Neuerung** dieses Ports, und sie steht namentlich als Konstante mit dieser Belegzeile |
| **V-L8** | Wie viele Geraete und wie viele Ereigniszeilen fuehrt die Produktion? | **Generalprobe** (Spec 2) | Die Spec argumentiert aus „wenigen hundert Geraeten" (`Spec:4768-4770`), **ohne die Zahl zu messen**. Seitengroesse 20 (1:1, `DeviceList.tsx:28`) und Ereignisgrenze 200 bleiben; wenn die Ablesung sie widerlegt, ist das **eine Zeile**, nicht ein Umbau |
| **V-L9** | Sollen `_actions/guards.test.ts` und `admin/actions.test.ts` spaeter **ein** Scan werden — und sollen `_lib/bauform.test.ts` und `_actions/guards.test.ts` ihre **eigenen Kopien** der dreiteiligen Reparatur gegen `_lib/quelltextScan.ts` tauschen? | ⛔ **kein Bauwert in diesem Fenster.** ClickUp-Board-Posten | Zwei Scans, weil zwei Ordner. `Spec:4243` legt die Verwaltungs-Actions nach `admin/actions.ts`, `guards.test.ts:33` scannt `_actions/`. **Kein Scan wird aufgeweicht, um den anderen zu vermeiden.** ⚠️ **Die gemeinsame Hilfsdatei entsteht in V11 (E-V13) und wird von `riegel.test.ts` und `admin/actions.test.ts` benutzt** — die zwei uebrigen Kopien bleiben stehen und sind der Rest dieser Leerstelle |
| **V-L11** | Soll die Verwaltungs-Ausleihenliste je nach **Geraet** oder **Zeitraum** filtern koennen? | ⛔ **Betreiber**, vor dem Rollout | ⛔ **Der Umschlag `ausleihenListe` reicht `deviceId`/`from`/`to` durch, die Flaeche zeigt dafuer KEIN Bedienelement.** Das kostet nichts und ist umkehrbar. ⚠️ **Und es ist ausdruecklich KEINE belegte Spec-Zusage:** der bisher dafuer angefuehrte Anker `Spec:4084` traegt sie nicht (er fuehrt die Signaturen von `geraeteMitLeihstand`/`offeneAusleihen`/`sucheEntleiher`, gemessen), die **sieben Spalten** der Alt-Liste sind an anderer Stelle korrekt belegt (`LoanList.tsx:15-47`). Der Alt-Bestand schickt **nur** `page`/`pageSize` (`useLoans.ts:18-23`) |
| **V-L12** | Traegt `importSchreibenAction` als **Server Action** die Rohzeilen einer Produktions-CSV unter der suiteweiten 1-MB-Grenze? | ⛔ **Generalprobe** (Spec 2) — sie gehoert zu ⬜ V-L8, wo die Geraetezahl ohnehin gemessen wird | ⛔ **Sie bleibt eine Server Action.** ⚠️ **Gemessen ist nur die andere Haelfte:** `importVorschauAction(datei: FormData)` traegt eine **hochgeladene Datei** und wird deshalb ein Route Handler (Entscheidung **E-V16**). Fuer die Rohzeilen hat **niemand** gemessen; ⛔ **eine Zahl zu raten waere genau die Erfindung, gegen die dieser Plan steht.** Reisst die Grenze, bekommt sie **dieselbe** Handler-Bauform wie `hochladen` — **eine Datei, kein Umbau** |
| **V-L10** | Wann rollt die Verwaltung wirklich aus — der `datum`-Wert der Release-Notizen? | **Betreiber / Runbook**, 6.7-D | `CLAUDE.md`, Release Notes: „`datum` ist der Tag des **Rollouts**, nicht des Commits." ⛔ **Dieser Planteil schreibt deshalb KEINE Notiz** — siehe „Was Planteil 4 NICHT liefert" |

---

## Die Entscheidungen, die dieser Plan faellt

### Entscheidung E-V1 — Die zweite Stufe kommt als zweite Funktion, mit einem gemeinsamen Helfer, und die vier Zusicherungen ziehen mit

**Befund.** `Spec:4287-4288` legt `requireRadioVerwaltung` und `istRadioUpdater` in **dieselbe
Datei** wie `requireRadioAdmin`. `_lib/zugang.ts:153-155` verbietet ausdruecklich, die zweite Stufe
als `||` in `istRadioAdmin` hineinzufalten. `Spec:4351-4353` beschreibt `requireRadioVerwaltung`
als „identisch, aber `istRadioAdmin(viewer)` **ODER** `istRadioUpdater(viewer)`; liefert die Stufe
mit". Zwei werfende Riegel mit fast gleichem Koerper.

⛔ **Und hier steht eine Falle, die der Waechter selbst benennt.** `riegel.test.ts:784-799`:

> „Zwei werfende Riegel mit fast gleichem Koerper sind der Lehrbuchfall, in dem jemand den
> gemeinsamen Teil in einen Helfer zieht — und in dem Augenblick verlassen die vier Aufrufe den
> Koerper von `requireRadioAdmin`, und diese Klausel faellt **ueber KORREKTEM Code**."

**Entscheidung: ein gemeinsamer privater Helfer `riegelAufStufe(...)` in `_lib/zugang.ts`, und die
vier Koerper-Zusicherungen aus Klausel (d) Fall 2 WANDERN mit ihm** — sie werden nicht geloescht
und nicht zu einem dateiweiten `toMatch` aufgeweicht.

Gruende:

1. Der Waechter schreibt den Weg selbst aus (`riegel.test.ts:789-790`): „die vier Zusicherungen
   WANDERN in den Koerper dieses Helfers (`funktionsKoerper(quelle, "<helfer>")`)".
2. Zwei Abschriften desselben Riegels sind der Ort, an dem eine Korrektur nur an einer von beiden
   ankommt — und die schwaechere ist die, auf die sich der naechste Leser beruft. Derselbe
   Gedanke steht in `admin/(druck)/layout.tsx:16-20` („dieselben Funktionen, nicht zwei
   Abschriften").
3. ⛔ **NS-A7 verlangt es ohnehin:** „Wer `requireRadioVerwaltung` baut, **schuldet ihm dieselben
   Koerper-Zusicherungen**" (`riegel.test.ts:664-667` — ⚠️ der Anker `:524-527` aus dem
   Uebergabezettel ist tot, Fund F5 der Schlusspruefung). Ohne den Helfer waeren es zwei
   Zusicherungsbloecke; mit ihm ist es einer, und er deckt beide Riegel.

Die endgueltige Form:

```ts
type RadioRolle = "admin" | "updater";

/** ⛔ NICHT EXPORTIERT. Traegt die vier Zusicherungen aus riegel.test.ts Klausel (d) Fall 2. */
async function riegelAufStufe(
  erlaubt: (v: RadioViewer) => boolean,
): Promise<RadioViewer> {
  const kopf = await headers();
  requireRadioHost(kopf);                                   // ERST der Host
  const viewer = viewerAusSession(await auth());            // DANN die Person
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel(kopf))}`);
  if (!erlaubt(viewer)) { meldeFehlendeGruppe(viewer.sub, viewer.groups); notFound(); }
  merkeNutzer(getDb(), viewer);                             // ⛔ NACH dem Riegel (NS-Z7)
  return viewer;
}

export async function requireRadioAdmin(): Promise<RadioViewer> {
  return riegelAufStufe(istRadioAdmin);
}

export async function requireRadioVerwaltung(): Promise<{ viewer: RadioViewer; rolle: RadioRolle }> {
  const viewer = await riegelAufStufe((v) => istRadioAdmin(v) || istRadioUpdater(v));
  //  ⛔ `admin` GEWINNT bei Ueberschneidung — 1:1 aus radio-admin/shared/src/role.ts:7-8
  //     (erste Pruefung zuerst; `updater` ist strikt schwaecher).
  return { viewer, rolle: istRadioAdmin(viewer) ? "admin" : "updater" };
}
```

⛔ **Das `||` steht im ARGUMENT von `requireRadioVerwaltung`, nicht in `istRadioAdmin`.** Der
Unterschied ist der ganze Punkt: `istRadioAdmin` bleibt das Praedikat der **strengeren** Stufe und
wird an sieben Stellen so gebraucht (`_actions/codes.ts`, der Export-Handler, die drei
Admin-Seiten, `_ui/AusleihRahmen.tsx`s `/admin`-Link, NS-A9).

⚠️ **Die Aufgabe muss `funktionsKoerper(quelle, "riegelAufStufe")` in Klausel (d) Fall 2
eintragen, im SELBEN Commit wie den Helfer** — sonst ist der Fall ueber `requireRadioAdmin` rot,
und der naheliegende Gruen-Fix waere, ihn zu loeschen.

---

### Entscheidung E-V2 — `ADMIN_SEITEN_ANZAHL` wird ZEHNMAL um eins angehoben, nicht einmal um zehn

**Befund.** `riegel.test.ts:81-95` nennt als Fahrplan „Planteil 4 baut die zehn Seiten aus
Spec:4369-4378 → `ADMIN_SEITEN_ANZAHL = 10`". Der Zaehler ist `toBe` (`riegel.test.ts:638-644`).
Woertlich gelesen hiesse das: eine Aufgabe setzt die Zahl auf 10 — und dann sind neun Aufgaben
lang alle Tore rot.

**Entscheidung: `= 10` ist der ENDZUSTAND von Planteil 4, kein einzelner Schritt. Jede der zehn
Seitenaufgaben hebt die Konstante um genau das, was sie gebaut hat**: V12 → 1, V13 → 2, V14 → 3,
V15 → 4, V16 → 5, V17 → 6, V18 → 7, V19 → 8, V20 → 9, V21 → 10.

Gruende:

1. Der Kopfkommentar sagt den Zweck selbst (`riegel.test.ts:78-80`): „Mit `toBe` hat er jetzt
   einen TRAEGER: **wer die Flaeche baut, bekommt den Fall rot und muss die Zahl bewusst
   anheben.**" Zehnmal bewusst ist genau das; einmal vorab ist das Gegenteil.
2. Nur so ist jede Aufgabe fuer sich gruen — und damit gibt es in diesem Planteil **keinen Block
   mit gemeinsamem Tor**.
3. ⛔ **Der Fehlgriff, gegen den das steht, ist konkret:** wer den ersten roten Zaehler sieht und
   `toBe` auf `toBeGreaterThanOrEqual` aendert, hat die NT11-Fehlerklasse gebaut („ein Waechter,
   der `>= 5` statt `= 6` prueft, bleibt gruen und bewacht nichts"). Der Kopf verurteilt sie drei
   Absaetze weiter oben (`riegel.test.ts:64-76`).

⛔ **Und die Konstante steht oben in der Datei, damit die Aenderung EINE Zeile ist und im Diff
auffaellt** (`riegel.test.ts:114-118`). Sie wandert nicht in den Testkoerper.

Dieselbe Form, **zweimal**: `HANDLER_ANZAHL` 2 → 3 **in V18** (mit `import/hochladen/route.ts`) und
3 → 4 **in V22** (mit dem Export-Handler) — je zusammen mit ihrem Handler (E-V16).
`AUSLEIH_FLAECHEN_ANZAHL` bleibt bei **5** (NS-A4). `ADMIN_LAYOUTS_MINDESTENS` bleibt bei **2** mit
`toBeGreaterThanOrEqual` — dort ist die Untergrenze richtig (`riegel.test.ts:96-99`).

---

### Entscheidung E-V3 — Die 6.7-Reihenfolge betrifft die SUITE, nicht den Alt-Bestand: die zwei Auth-Kopfzeilen wandern NICHT mit

⚠️ **Hier widersprechen sich zwei Eingabedokumente, und dieser Plan entscheidet ausdruecklich.**

`E4-formatvorbild.md`, Abschnitt 2, zu **Falle 14** der Portierungsanalyse:

> „**Unmittelbar bindend fuer Planteil 4:** solange der Alt-Kiosk (`radio-inventar`) laut
> Entscheidung 15 bis zum Cutover weiter gegen dieselben sechs `/v1`-Routen spricht, muss ihr
> Drizzle-Ersatz **beide** Kopfzeilen und **beide** Auth-Wege weitertragen — sonst bricht der noch
> produktive Alt-Kiosk am Tag, an dem Planteil 4 auf `main` geht."

`E2-spec-kapitel6.md`, Abschnitt 3.3 Nr. 4, aus `Spec:5286`:

> „⚠️ **Betrifft dieses Repo nicht** — die Grenze wird **geloescht**, nicht nachgebaut, also gibt
> es keinen Header mehr, der geprueft werden muesste. Der Posten steht in der Spec nur, damit ihn
> niemand als ‚noch zu portieren' wiederentdeckt."

**Die Spec gewinnt, und E4s Schlussfolgerung ist falsch.** Gruende, in dieser Reihenfolge:

1. **Die Praemisse stimmt nicht.** Ein Merge von Planteil 4 auf `main` aendert am Alt-Kiosk
   **nichts**: `radio-inventar` zeigt ueber seine Umgebungsvariable auf `radio-admin`, und
   `radio-admin` behaelt seine sechs `/v1`-Routen unveraendert. Der Alt-Kiosk bricht **erst** beim
   Router-Schwenk — 6.7-Abschnitt **D**, und der ist ausdruecklich **nicht** dieser Planteil.
2. **Die Abhilfe waere der Schaden.** Ein Suite-Route-Handler, der `Authorization: Bearer` und
   `X-API-Key` liest, waere eine **ueberlebende HTTP-Flaeche unter `/m/radio/`**, die mit
   `requiresAuth: false` (Entscheidung 4) ihren Cordon fuer immer selbst tragen muesste
   (`Spec:5100-5104`). Genau das schafft §6.2 mit Absicht ab.
3. ⛔ **Und sie bricht den Abnahmebefehl.** Ein Pfad `.../api/v1/...` oder eine Erwaehnung des
   Alt-Namens macht `rg -n "RADIO_ADMIN_\|api/v1/" src/app/m/radio` **nicht leer** — und damit ist
   6.7-C per Definition offen.
4. §6.4 sagt es selbst (`Spec:5324-5325`): „**Zusage an das Zugangs-Kapitel:** dieses Kapitel
   erzeugt keinen Route Handler und beansprucht keinen Pfad unter `src/app/m/radio/api/`".

⛔ **Folge fuer den Bau:** dieser Planteil legt **zwei** Route Handler an —
`admin/(arbeit)/geraete/export/route.ts` (V22) und `admin/(arbeit)/import/hochladen/route.ts`
(V18, Entscheidung **E-V16**) —, und **beide** sind Handler des **Verwaltungs**-Kapitels, keine
Ausnahme von 6.4: sie liegen unter `admin/`, **nicht** unter `.../api/`, und der Abnahmebefehl
`rtk proxy find src/app/m/radio -type d -name api` bleibt leer. **Kein Handler dieses Plans liest
jemals einen Auth-Kopf.**

---

### Entscheidung E-V4 — `/admin/import` traegt die VERWALTUNGS-Stufe; die zwei Import-Actions tragen die ADMIN-Stufe

⚠️ **Hier widerspricht sich die Spec in sich selbst, und keine A/B-Regel loest es auf** (geprueft
gegen `Spec:51-122`, kein Eintrag nennt `import`).

| Stelle | Wortlaut |
|---|---|
| §5.2 (`Spec:4207-4208`) | „die Seiten dahinter rufen `requireRadioAdmin()`" — gesagt von **allen drei** admin-only Menuepunkten: Import, Softwareversionen, Zugaenge |
| §5.4 (`Spec:4375`), die Tabelle, die sich selbst „verbindlich" nennt (`Spec:4362`) | `admin/(arbeit)/import/page.tsx` → `await requireRadioVerwaltung()` |
| §5.5 (`Spec:4451`) | CSV-Import: Admin **ja**, Updater **nein** |

**Entscheidung: §5.4 gilt fuer die SEITE (`requireRadioVerwaltung`), §5.8 gilt fuer die ACTIONS
(`requireRadioAdmin`), und die Navigation blendet den Eintrag fuer Updater aus.**

Gruende:

1. §5.4 bezeichnet sich selbst als verbindlich (`Spec:4362`) und markiert **namentlich nur**
   `versionen`, `zugaenge` und `zugaenge/blatt` als `requireRadioAdmin()` (`Spec:4376-4378`).
   §5.2 ist eine zusammenfassende Prosazeile ueber Menuepunkte, keine Aufruftabelle.
2. §5.5 spricht vom **Vorgang**, nicht von der Seite — und der Vorgang ist gesperrt, weil **beide
   Schritte** die Admin-Stufe verlangen (`Spec:4657-4658`): `importSchreibenAction` traegt
   `await requireRadioAdmin()` als erste Anweisung, und der Hochladen-Handler traegt das Praedikat
   `istRadioAdmin(await viewerOderNull())` (Entscheidung **E-V16**).
3. ⛔ **Die Folge ist unangenehm und muss ausgesprochen werden:** eine Updater-Person, die die
   Adresse `/admin/import` von Hand eintippt, **sieht den Assistenten** — und **jede** Aktion
   darauf schlaegt fehl. Das ist der Preis dieser Wahl. **Der Bau macht ihn sichtbar statt
   still:** `import/page.tsx` liest die Stufe aus `requireRadioVerwaltung()` und rendert fuer
   `rolle === "updater"` **statt** des Assistenten einen `Result`-Block mit dem Satz „Der Import
   ist den radio-admins vorbehalten." ⛔ **Das ist kein zweiter Riegel** — es ist die ehrliche
   Anzeige einer Sperre, die ohnehin serverseitig in den Actions sitzt.
4. ⬜ **V-L5** haelt fest, dass eine Umkehr moeglich bleibt: eine Zeile in `page.tsx` und der
   Testfall dazu.

⚠️ **Was der Bestand hier wirklich tut, gemessen — und es ist nochmal etwas anderes:**
`radio-admin/server/src/routes/import.ts:17` und `:40` tragen **kein** `requireRole('admin')`;
beide Endpunkte stehen jeder angemeldeten Rolle offen. Die Rolle wirkt **im Klassifikator**:
`classifyImportRow` gibt fuer einen Updater bei unbekannter ISSI `skipped-no-permission` zurueck
und diffet bei bekannter ISSI nur die drei erlaubten Felder
(`radio-admin/shared/src/import/classify-import-row.ts:43-53`). ⛔ **Die Spec ist an dieser Stelle
also SCHAERFER als der Bestand**, und das ist eine bewusste Verschaerfung (§5.5,
Rechtetabelle) — **keine 1:1-Uebernahme**. Der Quelltext von `importSchreibenAction` traegt diese
zwei Saetze mit ihren Belegzeilen.

---

### Entscheidung E-V5 — Fuenf Tabellen-Inseln, acht Inseln insgesamt. Beide Zahlen sind richtig, und der Plan nennt beide

**Befund.** Der Leitplan und der Auftrag dieses Planteils sprechen von **„die fuenf ‚use client'-
Tabelleninseln"**. `Spec:4499-4510` fuehrt **acht** Inseln.

**Entscheidung: es sind acht Inseln, davon fuenf Tabellen-Inseln.** Keine Zahl wird gewaehlt, beide
werden benannt.

* **Fuenf Tabellen-Inseln** (die, auf die Falle 9 unmittelbar zielt): Insel **1**
  `GeraeteTabelle`, **2** `AusleihenTabelle`, **3** `VersionenTabelle`, **5** `EreignisTabelle`,
  **8** `CodeTabelle`.
* **Drei weitere Inseln ohne `Table`**: **4** `ImportAssistent` (Falle 9 **und** Falle 1),
  **6** `GeraetFormular` (**Falle 1**, nicht 9), **7** `UpdateSuche` (Falle 1).

⛔ **Und die Pfadnamen aus §5.6.1 sind vor-B9 und falsch:** `Spec:4509` nennt `update/UpdateSuche.tsx`,
`Spec:4510` nennt `codes/CodeTabelle.tsx`. **Verbindlich sind `software/` und `zugaenge/`** — B9
(`Spec:98`) hat die Pfadnamen fuer das ganze Kapitel entschieden. Dieselbe nicht nachgezogene
Stelle in §5.13 (`Spec:4860`, „Codes" statt „Zugaenge").

---

### Entscheidung E-V6 — Die Inselgrenze ist die FLAECHE. Vier weitere Dateien sind Kinder von Insel 1, keine eigenen Inseln

**Befund.** `Spec:4242-4258` fuehrt unter `geraete/` fuenf `"use client"`-Dateien:
`GeraeteTabelle.tsx`, `GeraeteWerkzeugleiste.tsx`, `SpaltenWahl.tsx`, `FilterSchublade.tsx`,
`NeuGeraetModal.tsx`. §5.6.1 fasst sie als **eine** Insel (`Spec:4503`: „+ … im selben
Client-Teilbaum").

**Entscheidung: die Props-Grenze liegt GENAU EINMAL, an `GeraeteTabelle.tsx`. Die vier Nachbarn
bekommen ihre Daten von IHR, nicht vom Server.**

Gruende:

1. `Spec:4490-4497` woertlich: „**die Inselgrenze ist die Flaeche, nicht die Spaltenliste.** Alles
   von der Werkzeugleiste bis einschliesslich des Tabellen-/Listenzweigs liegt in **einer**
   `"use client"`-Insel je Flaeche."
2. ⛔ **Eine Grenze je Datei ist der Fehler, den kein Gate sieht.** Bekaeme `FilterSchublade.tsx`
   ihre `vorschlaege` direkt aus der Server Component, waere das zwar erlaubt (Daten sind
   serialisierbar) — aber `SpaltenWahl` und `GeraeteWerkzeugleiste` teilen mit `GeraeteTabelle`
   **Zustand** (`visibleColumns`, `searchFields`, `filters`, gemessen
   `DeviceList.tsx:49-63`, `:79-94`). Zustand ueber eine RSC-Grenze zu heben ist nicht moeglich;
   der Versuch endet in einer zweiten Zustandsquelle, die still auseinanderlaeuft.
3. Nur so koennen `Grid.useBreakpoint()` (`DeviceList.tsx:36`) und `usePersistentState`
   (`:49-54`) ueberhaupt leben — beide sind Client-Hooks und beide gehoeren zur **Flaeche**.

Dieselbe Regel fuer `geraete/[id]/`: `GeraetFormular.tsx` (Insel 6), `NotizFeld.tsx` und
`GeraetLoeschen.tsx` sind **drei nebeneinanderliegende Inseln derselben Seite**, weil sie
**keinen** Zustand teilen — jede haengt an einer anderen Action. ⚠️ Das ist der Unterschied zu
`geraete/`: dort teilt die Werkzeugleiste Zustand mit der Tabelle, hier teilt niemand etwas.

---

### Entscheidung E-V7 — Die Verwaltung erweitert `_ui/ikonen.tsx`; sie legt KEIN zweites Ikonenmodul an und importiert KEIN Zeichenpaket in einer Server-Datei

⚠️ **Hier stehen zwei bindende Saetze nebeneinander, die sich nicht von selbst vertragen.**

* `Spec:4568-4569`: „Jedes **davon** wird ein Eintrag in `src/core/shell/icons.ts` **oder** ein
  Inline-SVG in der Insel" — gesagt ueber die 18 gemessenen `react-icons/fi`-Verwendungen
  (`Spec:4566-4568`), nicht ueber „jedes Symbol" schlechthin.
* NS-A8b (Planteil 3): „⛔ **kein zweites Ikonenmodul**" — `_ui/ikonen.tsx` ist die eine
  Zeichenquelle des Moduls (`_ui/ikonen.tsx:4-6`, Entscheidung E5 von Planteil 3).

**NS-A8b gewinnt, und `src/core/shell/icons.ts` ist ueberhaupt nicht gemeint.** Gruende:

1. `src/core/shell/icons.ts` bildet `ModuleDef.icon` ab — **ein Zeichen je MODUL**, fuer den
   App-Umschalter (`Spec:4230-4232` sagt das selbst und warnt vor der Verwechslung). Dort
   Spaltensymbole einzutragen waere ein Kategorienfehler.
2. `_ui/ikonen.tsx` fuehrt heute **zwoelf** Namen (`:55-68`) und traegt bereits die ganze
   Begruendung, warum sie **kein** `"use client"` hat und **kein** fremdes Zeichenpaket importiert
   (`:7-20`).

**Entscheidung: die Verwaltung traegt ihre zusaetzlichen Zeichen als neue Eintraege in
`IKON_NAMEN`/`ZEICHEN` in `_ui/ikonen.tsx` ein**, in derselben Bauform (deutscher Name, Alt-Name in
Klammern, 24er-Raster, Strichzeichnung). `_ui/ikonen.test.tsx` waechst mit.

⚠️ **Die Zaehlung aus §5.6.3 stimmt in keiner Richtung, und der Bau misst statt zu zaehlen.**
`Spec:4563` sagt „17 Einzelvorgaenge", die Aufzaehlung darunter nennt **18** Namen, und **gemessen
kommt ein neunzehnter dazu**: `FiSliders` in
`radio-admin/client/src/features/devices/SearchFieldPicker.tsx:2`, den die Spec-Liste nicht fuehrt.
⛔ **Die Aufgabe, die eine Flaeche baut, traegt genau die Zeichen ein, die IHRE Flaeche braucht** —
keine Vorratsliste, und keine Zahl im Plan, die der Bau widerlegen wuerde.

Die **drei** neuen `NavIkonName` sind davon getrennt und stehen fest (`Spec:4218-4232`):
`ausleihen`, `update`, `versionen` — Eintrag in `src/core/shell/types.ts:18-21` (die Union) **und**
`src/core/shell/navIkonen.tsx:22-38` (`NAV_IKONEN`, `Record<NavIkonName, IconType>` erzwingt
Vollstaendigkeit typseitig). Vier bestehende passen woertlich: `uebersicht`, `geraete`, `import`,
`tokens` (fuer Zugaenge). ⛔ **`navIkonen.tsx` ist `"use client"` (`:1`) — `types.ts` ist es
nicht, und darf es nie werden** (`types.ts:8-13`).

---

### Entscheidung E-V8 — Der Update-Stand ist ein BERECHNETER Wert und wird in EINER Funktion gerechnet, nicht in zweien

**Befund.** Der Alt-Bestand rechnet ihn **zweimal**: als SQL-Ausdruck in `listDevices`
(`radio-admin/server/src/repos/deviceRepo.ts:153-156`) und als TypeScript-Funktion
`computeUpdateStatus` (`radio-admin/server/src/routes/devices.ts:86`, `:141`, `:156`, `:185`). Der
SQL-Kommentar sagt selbst, dass er den anderen spiegeln muss (`:149-152`: „SQL expression
mirroring computeUpdateStatus(device, target)").

**Entscheidung: `_lib/updateStand.ts` fuehrt `berechneUpdateStand(softwareVersion, zielVersion)`
als die EINE Wahrheit. Der Lesepfad `geraeteListe` rechnet sie in SQL — und `_lib/updateStand.test.ts`
haelt beide Ergebnisse gegeneinander.**

Die Regel, 1:1 aus `deviceRepo.ts:153-156`:

```
softwareVersion IS NULL            -> "unbekannt"
zielVersion != null && gleich      -> "aktuell"
sonst                              -> "veraltet"
```

⛔ **Der dritte Zweig ist der, den ein Nachbau falsch macht:** ist **keine** Zielversion gesetzt,
faellt jede nicht-leere Version auf **„veraltet"**, nicht auf „unbekannt". Der Alt-Kommentar
schreibt es aus (`:151-152`): „When target is null the 'aktuell' branch can never match, so
non-null versions fall through to 'veraltet' — matching the shared fn exactly."

⛔ **Und `aktuell` haengt AUSSCHLIESSLICH an der Ziel-Marke, nie am Anlegedatum**
(`Spec:4838-4840`, `softwareVersionRepo.ts:28-31`: „Auto-registered versions land on top of the
display order but are **never** the target").

Warum die Rechnung trotzdem **in SQL** gehoert und nicht nachtraeglich in JS: `updateStand` ist ein
**Filter** (`deviceRepo.ts:189`) und ein **Sortierschluessel** (`:199`) der paginierten Liste. Wer
ihn erst nach `LIMIT`/`OFFSET` rechnet, filtert und sortiert die falsche Seite.

---

### Entscheidung E-V9 — Die Sortier-Allowlist des Servers ist der Vertrag, und sie ist GROESSER als der Kommentar behauptet

**Befund, gemessen.** `radio-admin/client/src/features/devices/deviceColumns.tsx:12-15` sagt:
„`key`/`dataIndex` must match the server sort whitelist for sortable columns
(rufname/issi/status/location/softwareVersion/updateStatus)" — **sechs**. Der Server
(`radio-admin/server/src/repos/deviceRepo.ts:113-121`) fuehrt `SORTABLE` mit **sieben** Spalten —
`rufname`, `issi`, `status`, `location`, `softwareVersion`, **`lastUpdatedAt`**, **`createdAt`** —
und akzeptiert zusaetzlich `updateStatus` ueber den `statusExpr`-Sonderfall (`:198-199`). Das sind
**acht** annehmbare Schluessel.

**Entscheidung: die Suite uebernimmt die SERVER-Liste, alle acht, samt dem `updateStatus`-Sonderfall
— und die sechs sortierbaren SPALTEN der Oberflaeche bleiben sechs.**

Gruende:

1. Die Spec nennt die Kommentarzeile den Vertrag (`Spec:4807-4809`), aber der Vertrag ist der
   **Code**, den sie beschreibt. Eine Suite, die nur sechs Schluessel annimmt, wirft eine
   gespeicherte Sortierung `lastUpdatedAt:desc` still weg — und faellt auf die Vorgabe zurueck,
   ohne dass jemand es sieht.
2. ⛔ **Unbekannter Schluessel = Vorgabesortierung, nie ein Fehler und nie ein
   SQL-Interpolat.** `deviceRepo.ts:196-201`: `if (col) orderBy = ...` — ein unbekanntes `f` laesst
   `desc(devices.createdAt)` stehen. Dieselbe Haltung bei den Suchfeldern, und dort schaerfer
   (`:168-172`): sind **alle** angeforderten Felder unbekannt, liefert die Abfrage **keine Zeilen**
   (`conds.push(sql\`0\`)`), „never interpolate unknown names into SQL".
3. **Vorgabesortierung ist `desc(createdAt)`** (`deviceRepo.ts:195`), nicht `rufname`.

---

### Entscheidung E-V10 — `leihhistorie` traegt den VOLLEN Vertrag von `listLoans`, obwohl die Verwaltungsflaeche heute nur zwei Parameter schickt

**Befund, gemessen.** `/admin/ausleihen` im Bestand liest **nicht** `GET /v1/loans/history`,
sondern `GET /api/loans` (`radio-admin/client/src/hooks/useLoans.ts:28`) — und beide Endpunkte
rufen **dieselbe** Repo-Funktion `listLoans` mit **demselben** Schema `loanHistoryParamsSchema`
(`radio-admin/server/src/routes/loans.ts:19-21` gegen `loanApi.ts:140-144`).

Die Flaeche schickt heute **nur** `page` und `pageSize` (`useLoans.ts:18-23`), `pageSize` fest 20
(`LoanList.tsx:8`, `showSizeChanger: false` `:66`).

**Entscheidung: `leihhistorie(db, f: LeihhistorieFilter): LeihhistorieSeite` bildet den vollen
Vertrag ab — `deviceId?`, `from?`, `to?`, `page`, `pageSize` —, weil sie BEIDE Alt-Wege ersetzt.**

Der gemessene Vertrag, 1:1:

| Was | Wert | Beleg |
|---|---|---|
| `deviceId` | optional, `eq(loans.deviceId, …)` | `loanRepo.ts:139`; Schema `shared/src/loan.ts:94` (`min(1)`) |
| `from` / `to` | optional, **epoch-ms**-Grenzen auf `borrowedAt`, `gte`/`lte` | `loanRepo.ts:140-141`; `loan.ts:95-96` |
| `page` | Vorgabe **1** | `loan.ts:97` |
| `pageSize` | Vorgabe **25**, **max 1000** | `loan.ts:98`, mit ausgeschriebener Begruendung `loan.ts:89-91`: „The page-size ceiling matches radio-inventar's existing history page size (1000) so the thin-client consumer is never rejected" |
| Sortierung | **`desc(loans.borrowedAt)`**, immer, kein Parameter | `loanRepo.ts:153` |
| Rueckgabe | `{ rows, total, page, pageSize }` | `loanRepo.ts:159` |
| Fenster | aktiv **und** zurueckgegeben; ⛔ **Lesen purgt nicht** | `loanRepo.ts:136` („active + returned"); die Retention ist ein **Job**, `_lib/boot.ts:62` |

⛔ **`from`/`to` sind epoch-MILLISEKUNDEN in der Quelle und Unix-SEKUNDEN im Ziel.**
`loans.borrowedAt` ist `integer(..., { mode: "timestamp" })` (`_db/schema.ts:214`) — Drizzle
liefert und nimmt dort ein `Date`. ⛔ **Die Signatur nimmt deshalb `Date`, nicht `number`** — genau
wie B16 es fuer den Importer entschieden hat (`Spec:105`: „`sekundenAusMs` liefert eine **Zahl**,
und eine Zahl ist in eine `mode: "timestamp"`-Spalte nicht einfuegbar"). Der Faktor bleibt damit
gar nicht erst im Ausdruck stehen, weil er nirgends gebraucht wird.

⚠️ **Und die Zeitgrenze ist die Falle 9 der Portierungsanalyse in ihrer letzten Auspraegung:**
`borrowedAt` existiert im Alt-Bestand **dreimal**, je anders typisiert, und „die Konvertierung
passiert **stumm** in den Repositories". Beim Port in eine RSC-Welt ohne diese drei Ebenen
**verschwindet die Konvertierungsstelle**, und der Fehler ist **kein Typfehler**, sondern ein
falsches Datum in der Anzeige. ⛔ **Eine Einheit, eine Stelle.**

---

### Entscheidung E-V11 — `lastUpdatedAt` ist in der Suite ein KALENDERTAG. Die Alt-Rechnungen wandern NICHT mit, und `formatiereZelle` wird dadurch einfacher, nicht komplizierter

**Befund, gemessen.** Der Alt-Bestand fuehrt `devices.last_updated_at` als epoch-ms und schreibt
dort **drei verschiedene Semantiken** hinein:

| Weg | Was er schreibt | Beleg |
|---|---|---|
| CSV-Import | UTC-Mitternacht (`YYYY-MM-DD` und `DD.MM.YYYY` beide → `Date.UTC`) | `radio-admin/server/src/import/commit-service.ts:40-67` |
| Formular | **lokale** Mitternacht (`values.lastUpdatedAt.valueOf()` eines dayjs-Tagesanfangs) | `DeviceEditForm.tsx:61`, `DeviceFormModal.tsx:63` |
| Update-Karte | **echte Uhrzeit** (`Date.now()`) | `UpdateDeviceCard.tsx:24` |
| CSV-Export | liest es zurueck als **UTC**-`YYYY-MM-DD` | `export.ts:49-52` |

Die Suite-Spalte ist **`text("last_updated_at")`** mit `YYYY-MM-DD`
(`src/app/m/radio/_db/schema.ts:39`), und der Kommentar dort haelt die Entscheidung samt Grund
fest: „der Import kuerzt in Europe/Berlin, weil das fuer alle drei richtig ist und eine
UTC-Kuerzung nur fuer einen. **Wer einen DatePicker an einen `number` bindet, hat den
Zeitzonenkonflikt zurueckgeholt.**"

**Entscheidung, drei Teile:**

1. **Das Formularfeld sendet den Tag als Zeichenkette `YYYY-MM-DD`** — ⛔ **nicht** als
   Millisekundenwert eines dayjs-Tagesanfangs. Das ist woertlich eine der zwei Zusagen aus
   `Spec:4739-4746`.
2. **Der Update-Modus setzt den Berliner Tag, nicht die Uhrzeit.** Das ist eine **benannte
   Abweichung** vom Bestand (`UpdateDeviceCard.tsx:24` schreibt `Date.now()`), erzwungen durch die
   Spalte. Sie steht im Quelltext mit dieser Belegzeile.
3. ⛔ **`formatiereZelle` fuer `lastUpdatedAt` rechnet NICHT.** Der Alt-Code tut
   `new Date(value as number).toISOString().slice(0, 10)` (`export.ts:51`); die Suite-Spalte
   **ist bereits** die Zeichenkette. Ein Nachbau der Rechnung waere `new Date("2026-08-24")` —
   gueltiges JS, und die Zelle enthielte still dasselbe oder den Vortag, je nach Zone.
   ⛔ **Genau das ist der Posten, den ein „1:1"-Reflex hier kaputt macht.**
4. ⛔ **Und die zweite Zusage aus `Spec:4739-4746` bleibt:** Formular und `formatiereZelle` lesen
   ihre Umrechnung aus **einer** Funktion in `_lib/csv/spalten.ts`, nicht aus zweien.

Der Rundlauftest (`_lib/csv/rundlauf.test.ts`) traegt dafuer einen eigenen Fall mit einem
**Datumswert**, nicht nur mit Texten.

---

### Entscheidung E-V12 — Der CSV-Export bekommt KEINE Formel-Neutralisierung, und die Begruendung steht im Quelltext

⚠️ **Zwei Hausregeln ziehen hier gegeneinander, und die Wahl ist nicht offensichtlich.**

* Der Hausbestand neutralisiert Formel-Injektion zentral: `neutralizeFormula` in
  `src/app/m/feedback/_lib/csv.ts:10-21` setzt ein `'` vor jedes Feld, das mit `=`, `+`, `-`, `@`,
  Tab oder CR beginnt.
* Der **Rundlauf-Vertrag** ist tragend und woertlich zugesagt (`Spec:4731-4737`, Alt-Kommentar
  `export.ts:11-15`): „each German header MUST normalize … back to its device field, **so that the
  exported file re-imports cleanly through the wizard**. Verified by exportRoundTrip test."

**Entscheidung: keine Neutralisierung. Der Export bleibt 1:1** — `;`-getrennt, fuehrendes UTF-8-BOM,
`formatiereZelle` mit den drei Regeln.

Gruende, in dieser Reihenfolge:

1. ⛔ **Die Neutralisierung bricht den Rundlauf.** Ein `'` vor einem Wert, der mit `-` beginnt,
   kommt beim Re-Import als **Teil des Werts** zurueck — der Importer liest die Zelle woertlich
   (`commit-service.ts:106`: `out[field] = value === '' ? null : value`). Der Export-Import-Rundlauf
   ist die Zusage, die dieser Weg schriftlich gegeben hat; die Neutralisierung ist es nicht.
2. **Das Risikoprofil ist ein anderes als bei `feedback`.** Dort speist **anonymer, oeffentlicher
   Teilnehmer-Freitext** den Export (`csv.ts:11-13` sagt das als Begruendung). Hier speisen ihn
   Geraetestammdaten, die **nur** Admins und Updater schreiben — der einzige anonyme Schreibpfad
   des Moduls ist `bucheAusleihe`, und `borrower_name` steht in **keiner** der 19
   Exportspalten (`export.ts:16-36`, gezaehlt).
3. `buildCsv` waere ohnehin nicht wiederverwendbar: es joint **hart mit `,`**
   (`feedback/_lib/csv.ts:7`), der Vertrag verlangt `;`. Ein zweiter Parameter dort waere eine
   `core`-Aenderung fuer einen einzigen Aufrufer — und die Hausregel fuer `src/core` lautet: „nur
   was ein **zweites, heute belegbares** Modul braucht".

⛔ **Diese Entscheidung steht als Kommentarblock in `_lib/csv/spalten.ts`, mit beiden Belegzeilen**
— sonst entdeckt sie der naechste Leser als „vergessen" und baut die Neutralisierung nach.
⬜ **Wenn eine kuenftige Exportspalte `borrower_name` traegt, faellt diese Entscheidung** — der
Satz steht dort mit.

---

### Entscheidung E-V13 — Der vierte Quelltext-Scan uebernimmt die dreiteilige Reparatur, und sie zieht dafuer in EINE gemeinsame Hilfsdatei `_lib/quelltextScan.ts`

**Befund.** `admin/actions.ts` liegt **ausserhalb** von `_actions/`; `guards.test.ts:33` scannt
`src/app/m/radio/_actions`. Die zehn Verwaltungs-Actions haetten damit **keinen** Waechter — und
`Spec:4853-4857` nennt `admin/actions.test.ts` „**der einzige Waechter der Aufruftabelle aus §5.4**
— kein anderes Gate sieht eine vergessene Zeile."

Also entsteht ein **vierter** Quelltext-Scan. ⛔ **Und damit greift die Auflage aus dem
KONTEXT-Nachtrag:** drei Waechter trugen bis zum 2026-08-24 dieselbe stille Blindstelle — ihr
Kommentarschnitt kannte **keine Regexliterale**, und ein `/\//` traegt zwei Schraegstriche, die der
Schnitt fuer einen Kommentarbeginn hielt. „An **negativen** Zusicherungen hiess das: **weniger
gefundene Verstoesse, still.**" Behoben in `6331e77`, `4ed3410`. „**Wer eine vierte Kopie dieser
Bauart anlegt, baut den Fehler neu.**"

⛔ **Und hier stand bis zur Kritikrunde die falsche Entscheidung. Sie ist umgedreht, und der Grund
steht in der Datei selbst, die den Import liefern sollte.**

`riegel.test.ts:272-274` hat die Frage **bereits entschieden — gegen den Import**, woertlich:

> „**KEIN IMPORT: vitest laedt Testdateien nicht als Module fuereinander, und eine geteilte
> Helferdatei unter `src/app/m/radio/` zaehlte der `"use client"`-Scan mit. Die Verdoppelung ist der
> Preis.**"

**Beide dort genannten Gruende sind heute nachgemessen — und beide fuehren, jeder auf seine Weise,
vom Import weg:**

1. ⛔ **Der erste Grund ist in seiner Formulierung falsch, in seiner Folge aber schlimmer als
   beschrieben.** Ein Import aus einer `.test.ts` **laeuft** — er **registriert aber die Suiten der
   importierten Datei ein zweites Mal.** Gemessen (Sonde, zwei Dateien `a.test.ts`/`b.test.ts`, eine
   davon importiert einen Export der anderen): `Test Files 2 passed (2)` · **`Tests 3 passed (3)`
   statt 2**. `riegel.test.ts` fuehrt 21 Faelle (gemessen: `Tests 21 passed (21)`) — die liefen ab
   V11 **zusaetzlich** unter `admin/actions.test.ts`, ein rotes Riegel-Urteil waere der **falschen**
   Datei zugeschrieben worden, und die in „Stand" selbst gemessene Grundlinie verschoebe sich um 21
   **ohne Erklaerung**. ⚠️ Gegenprobe: `rtk grep -n "from \"…\.test\"" src/ e2e/` findet **keine**
   Testdatei dieses Repos, die aus einer anderen importiert — und `riegel.test.ts` exportiert heute
   **nichts** (`grep -c "^export"` → 0).
2. ✅ **Der zweite Grund traegt nicht mehr.** `riegel.test.ts:1076-1081` scannt `_lib/`/`_db/` nur auf
   **Direktiven** (`"use client"`, `"use server"`); eine direktivenfreie Helferdatei besteht ihn, und
   die Untergrenze `:990` ist `toBeGreaterThanOrEqual(4)` — eine **zusaetzliche** Datei macht sie
   nicht rot. Der Satz stammt aus der Zeit vor diesem Scan.

**Entscheidung: die drei Funktionen wandern nach `src/app/m/radio/_lib/quelltextScan.ts` (ohne
`"use client"`, ohne `"use server"`), und `riegel.test.ts` SOWIE `admin/actions.test.ts` beziehen
sie von dort — im SELBEN Commit (V11). ⛔ Kein Import aus einer `.test.ts`, und ⛔ keine dritte
Kopie.**

⛔ **UND EINE ZWEITE ZUSICHERUNG ZIEHT ZWINGEND MIT — sie ist der Teil, den man vergisst.**
`riegel.test.ts:1208-1221` fuehrt den Fall „**kein Scan dieser Datei liest die ungeschuetzte Fassung
direkt**": er zaehlt die Nadel `"ohneKommentareUnd" + "Zeichenketten("` im **eigenen** Dateitext
(`SELBST`) und verlangt `toBe(2)` — „in seiner eigenen Deklaration und in `bereinigt`". ⛔ **Wandern
die Funktionen aus der Datei, faellt dieser Zaehler auf 0 bzw. 1 und der Fall ist ROT.** Er wird im
**selben** Commit auf die neue Datei gerichtet: der Fall liest ab V11 `_lib/quelltextScan.ts` statt
`SELBST` und bleibt bei `toBe(2)`. ⛔ **Er wird NICHT geloescht und die Zahl NICHT angepasst, bis
gemessen ist, dass sie stimmt** — er ist der Waechter, der M1 verhindert.

⚠️ **`_lib/bauform.test.ts` und `_actions/guards.test.ts` fuehren je eine eigene, bereits reparierte
Kopie** (`6331e77`, `4ed3410`). Sie werden von dieser Aufgabe **nicht** angefasst — ihr Umzug auf
`_lib/quelltextScan.ts` ist der Rest von ⬜ **V-L9**, ein Aufraeumposten mit eigenem Eigentuemer.

Gruende fuer die Uebernahme der Reparatur ueberhaupt:

1. Die Reparatur besteht aus **drei** Teilen, und nur alle drei zusammen tragen:
   * **`ohneKommentareUndZeichenketten` schneidet seit der Reparatur keine NACHGESTELLTEN
     Kommentare mehr selbst** (`riegel.test.ts:229`). ⚠️ **Praezise:** sie ruft weiterhin
     `ohneKommentare(quelle)` als **erste** Anweisung (`riegel.test.ts:230`) und leert danach
     String-/Template-Literale, zeilenweise, unter Erhalt der Zeilenzahl. Weggefallen ist **nur**
     der nachgestellte `//`-Schnitt — der steht jetzt in `bereinigt`. Die als Grossbuchstabenzeile
     zitierte Auflage steht auf `riegel.test.ts:209`.
   * **`ohneRegexLiterale` behandelt `//` als IMMER einen Kommentarbeginn, nie ein Literal**
     (`riegel.test.ts:291`, Bedingung `z === "/" && q[i + 1] !== "/"`). „JS kennt kein leeres `//`.
     Ohne diese Bedingung frisst der Scanner den Kommentarbeginn."
   * **`bereinigt` schneidet ZULETZT** (`riegel.test.ts:334`):
     `ohneRegexLiterale(ohneKommentareUndZeichenketten(quelle)).replace(/\/\/.*$/gm, "")`.
2. Der Kopfkommentar von `riegel.test.ts` sagt die Konsequenz selbst: „**KEIN SCAN RUFT
   `ohneKommentareUndZeichenketten` DIREKT** — sonst kehrt der Fehler an genau dieser Stelle
   zurueck."
3. Eine Kopie waere eine vierte Stelle, an der die naechste Korrektur ankommen muss.
   `_lib/quelltextScan.ts` ist eine.

⛔ **Und `admin/actions.test.ts` traegt seinen eigenen Selbsttest** — den Waechter ueber dem
Waechter, Vorbild `riegel.test.ts:1157` (`describe("die Bereinigung selbst")`): ein Fall, der
belegt, dass ein `/\//` in einer Actionsdatei den Schnitt **nicht** ueberlebt und die Zeile
dahinter **noch** gelesen wird. Ohne ihn ist die Uebernahme eine Behauptung.

---

### Entscheidung E-V14 — Die Ausleihenliste rechnet „aktiv" aus `returnedAt === null`, und der Status wandert als WORT

**Befund.** `LoanList.tsx:10-13` woertlich: „Active vs. returned status, derived purely from
`returnedAt`" — `returnedAt === null ? <Tag color="processing">Aktiv</Tag> : <Tag>Zurückgegeben</Tag>`.

**Entscheidung: die Ableitung wandert 1:1, die Farbe nicht.** `color="processing"` ist antds
blauer Ton und in `FullShell` unauffaellig — er bleibt. ⛔ **Aber der Ton ist nie der einzige
Traeger:** beide Zustaende tragen ihr Wort (`„Aktiv"` / `„Zurückgegeben"`), zeichengleich aus dem
Bestand.

⚠️ **Und hier lauert eine Verwechslung, die kein Typ faengt.** Das Modul fuehrt bereits
`GeraeteStatus = "AVAILABLE" | "ON_LOAN" | "DEFECT" | "MAINTENANCE"` (`_lib/status.ts:48`) mit
`STATUS_HEX` (`:125`) und `statusEtikett` (`:107`). ⛔ **Das ist NICHT die Spalte `devices.status`.**
Die Spalte ist **Freitext ohne `enum`** (`_db/schema.ts:30`) und traegt in der Verwaltung Werte wie
`Einsatzbereit`, `Defekt`, `Ausgeliehen`, `Wartung`, `Sonstiges`
(`radio-admin/shared/src/constants.ts:10-16`, mit dem ausgeschriebenen Vorbehalt `:7-9`: „the
`status` field is **NOT** constrained to these values at the schema level"). `geraeteZustandAus`
(`_lib/status.ts:177-188`) bildet die eine Menge auf die andere ab.

⛔ **Die Verwaltung zeigt die ROHE Spalte** — sie ist die Maske, in der der Betreiber sie pflegt.
⛔ **Sie definiert dafuer KEINE zweiten Statusfarben** (NS-A8b, Zusage §4.12 Nr. 11 woertlich: „sie
darf ihre Statusfarben nicht ein zweites Mal definieren"). Ein Rohstatus, der auf keinen der vier
Toene faellt, bekommt **keinen** Ton — nur sein Wort.

---

### Entscheidung E-V15 — Die Uebersicht bleibt ohne Insel, und die Karten werden LINKS

**Befund.** `Dashboard.tsx:60-62` benutzt `onClick` + `navigate` auf `<Card hoverable>`, und
`:79-81` ein `Typography.Link` mit `onClick`. Beides sind Client-Handler.

**Entscheidung: `admin/(arbeit)/page.tsx` bekommt KEINE Insel.** `Card`, `Statistic` und `Tag` sind
in einer Server Component sicher (`CLAUDE.md:13`), und damit das so bleibt:

* die vier Kennzahlkarten werden **`next/link` um die `Card`**, Ziel
  `/m/radio/admin/geraete?updateStand=veraltet` (bzw. `aktuell`/`unbekannt`); die erste Karte
  („Geraete gesamt") ist **nicht** klickbar, 1:1 (`Dashboard.tsx:61`: `hoverable={card.filter !== undefined}`);
* „Alle veralteten anzeigen" wird ein **Link**, kein `Typography.Link` mit `onClick`;
* die Liste der fuenf Geraete wird eine schlichte **`<ul>`**-Struktur mit Links — ⛔ **kein
  `List.Item.Meta`** (Falle 1, `Dashboard.tsx:93`) und **kein `renderItem`** (Falle 9,
  `Dashboard.tsx:88`).

⛔ **Und die vier Zahlen entstehen in EINER Abfrage mit `GROUP BY`**, nicht in vier mit
`pageSize: 1`. Der Alt-Bestand fuehrt vier Rundlaeufe (`useDashboardStats.ts:17-20`), und die Spec
sagt, warum das kein Vorbild ist (`Spec:4601`, in der TanStack-Tabelle von §5.7): „Die vier
Rundlaeufe waren eine Folge der HTTP-Grenze, nicht der Fachlichkeit." Der **Befund** dazu steht in
§5.11 auf `Spec:4780-4784` („vier Abfragen mit `pageSize: 1`, von denen nur `total` gelesen wird") —
⛔ **der Satz selbst steht dort nicht.**

⛔ **`#cf1322` und `#3f8600` und `#8c8c8c` wandern NICHT mit** (`Dashboard.tsx:33`, `:41`, `:49`).
Falle 3: „Veraltet" traegt `color="warning"`, „Aktuell" `color="success"`, „Unbekannt" `default`
(`Spec:4555-4561`). ⛔ **Der Playwright-Fall dazu ist benannt und verbindlich** (`Spec:4877`,
Fall 1): „vier Kennzahlen sichtbar, ‚Veraltet' ist **nicht** rot."

---

### Entscheidung E-V16 — Der DATEISCHRITT des Imports ist ein Route Handler, keine Server Action. `admin/actions.ts` fuehrt damit NEUN Actions, nicht zehn

⛔ **Das ist die einzige Stelle, an der dieser Plan von der als „verbindlich" bezeichneten
Aufruftabelle `Spec:4653-4664` abweicht — und die Abweichung ist bauformbedingt, nicht fachlich.**

**Befund, gemessen.** `Spec:4657` legt `importVorschauAction(datei: FormData)` als **Server Action**
an. Eine Server Action, die eine hochgeladene Datei entgegennimmt, laeuft gegen
`experimental.serverActions.bodySizeLimit` — Vorgabe **1 MB**. ⛔ **`next.config.ts` hebt sie nicht
an** (Datei vollstaendig gelesen, 12 Zeilen, **kein** `experimental`-Block; sie fuehrt nur
`reactCompiler`, `output`, `allowedDevOrigins`).

⛔ **Das Haus hat genau diesen Fall ZWEIMAL entschieden, und die Begruendung steht ausgeschrieben.**
`src/app/m/aufgaben/a/[id]/nachweis/hochladen/route.ts:2-9`, woertlich:

> „**WAR EINE SERVER ACTION** …, **IST JETZT EIN ROUTE HANDLER** — der Grund steht in
> `next.config.ts`s zurueckgebautem Kommentar: `serverActions.bodySizeLimit` ist eine **EINZIGE,
> suiteweite** Next-Einstellung. Eine Anhebung fuer diese eine Route haette sie fuer **JEDE** Server
> Action **JEDES** Moduls angehoben … `files` hat denselben Fall schon einmal entschieden
> (`api/u/[token]/upload/route.ts`)."

Dieselbe Aussage aus der Gegenrichtung: `src/app/m/aufgaben/actions.ts:689-694`.

**Entscheidung, drei Teile:**

1. ⛔ **`importVorschauAction` entfaellt und wird `admin/(arbeit)/import/hochladen/route.ts`** —
   `POST`, nimmt die CSV als `FormData`, gibt Spaltennamen und Rohzeilen als **JSON** zurueck,
   ⛔ **schreibt NICHTS**. Er traegt die **nicht-werfende** Riegelform aus B11/B17 —
   `radioHostOderNull(request.headers) === null → 404`, danach
   `!istRadioAdmin(await viewerOderNull()) → 404` —, ⛔ **404, nie 403** (B10), genau wie der
   Export-Handler. `riegel.test.ts` Klausel (c) prueft alle drei Haelften.
2. ⛔ **`importSchreibenAction` BLEIBT eine Server Action** mit `(zuordnung, zeilen)`. ⛔ **Fuer sie
   ist nichts gemessen** — die Rohzeilen sind ein abgeleiteter Wert, keine hochgeladene Datei, und
   eine Zahl zu raten waere die Erfindung, gegen die Punkt 10 der „Zwoelf Dinge" steht.
   ⬜ **V-L12** haelt die Frage mit Adressat **Generalprobe** (sie gehoert zu ⬜ V-L8, wo die
   Geraetezahl ohnehin gemessen wird). Reisst die Grenze, bekommt sie **dieselbe** Handler-Bauform
   wie `hochladen` — **eine Datei, kein Umbau.**
3. ⛔ **Zwei Zahlen ziehen mit, beide mit `toBe`:** `ACTION_ANZAHL` in `admin/actions.test.ts` ist
   **9**, nicht 10 · `HANDLER_ANZAHL` in `riegel.test.ts` laeuft **2 → 3 → 4**, in **zwei**
   Aufgaben: `hochladen` in **V18**, `export` in **V22**. ⛔ **Jede Anhebung im selben Commit wie
   ihr Handler**, aus demselben Grund wie bei `ADMIN_SEITEN_ANZAHL` (E-V2).

⚠️ **Was NICHT mitzieht:** die Zweiphasigkeit bleibt unveraendert (`Spec:4695-4702`), die Rolle wird
weiterhin an den Klassifikator mitgegeben (`import.ts:54`), und `quelle` bleibt `csv-import`.
⛔ **Und §6.4 bleibt eingehalten:** beide Handler liegen unter `admin/`, **nicht** unter
`src/app/m/radio/api/` — der Abnahmebefehl `rtk proxy find src/app/m/radio -type d -name api`
bleibt leer.

⚠️ **Die Falle-10-Regel gilt fuer den neuen Handler ab der ersten Zeile:** ein Warmlauf-GET vor dem
ersten echten POST, und `page.waitForResponse` statt einer Zustandsprobe (`Spec:4893-4898`).

---

## Die antd-Zuordnung

Die Spalte **Server/Client** traegt die Spec nicht — sie ist die eigentliche Bauentscheidung und
wird hier ergaenzt.

| Heute (`radio-admin`, antd 5) | Kuenftig (Suite, antd 6) | Server/Client | Anmerkung |
|---|---|---|---|
| `<Table columns=[…render]>` (`DeviceList.tsx:175`, `LoanList.tsx:76`, `SoftwareVersionsPage.tsx:201`, `ImportWizard.tsx:303`) | `<Table>` **in einer Insel** | ⛔ **Client, zwingend** | **Falle 9.** Die Insel definiert ihre `render` selbst und bekommt nur serialisierbare Zeilen |
| `<Table scroll={{ x: true }}>` | `scroll={{ x: "max-content" }}` | Client | Ohne `scroll` bricht eine antd-Tabelle auf 390 px (`aufgaben/_ui/RoutinenTabelle.tsx:33-34`). `x: true` ist die schwaechere Alt-Form |
| `pagination` mit `showSizeChanger: false` (`DeviceList.tsx:164-169`) | ⛔ **`pagination={false}`** — die Blaetterung laeuft ueber die **URL** | Client rendert, **Server blaettert** | Hausmuster „Regime B", Vorbild `lagerbuch/verwaltung/(arbeit)/journal/JournalTable.tsx:65-68` und `page.tsx:24-42`. Ein antd-internes `onChange`-Sortieren/Filtern gibt es im Haus **nirgends** |
| `Grid.useBreakpoint()` + `<List renderItem>` als mobiler Zweig (`DeviceList.tsx:188-231`, `LoanList.tsx:86-…`) | derselbe Zweig, **in derselben Insel** | Client | ⛔ `List.Item` und `List.Item.Meta` sind **Falle 1** — in einer Server Component HTTP 500 |
| `Form` / `Form.Item` (**21** gerenderte in `DeviceFields.tsx`, davon **20 benannte**) | dieselben `Form.Item` | ⛔ **Client, zwingend** | **Falle 1**, Compound-Zugriff |
| `Input.Search` (`DeviceList.tsx:136`, `UpdateMode.tsx:59`) | `Input.Search` **in der Insel** | Client | Falle 1 |
| `Space.Compact` (`DeviceList.tsx:135`, `SoftwareVersionsPage.tsx:117`, `:188`) | dito | Client | Falle 1 |
| `Descriptions` / `Descriptions.Item` (`DeviceDetailDrawer.tsx:77-102`) | ⛔ **entfaellt** — die Kopfdaten werden schlichtes Markup in der Server Component | **Server** | Falle 1. Eine Insel nur fuer fuenf Lesefelder waere Ballast |
| `Drawer` als Detailansicht (`DeviceDetailDrawer.tsx:129`) | ⛔ **entfaellt** — eigene **Seite** `/admin/geraete/[id]` | Server (Huelle) | `Spec:4183-4186`: `/devices/:id` war laut `router.tsx:26` schon im Bestand eine eigene Route, kein echtes Overlay |
| `Drawer` als Filterschublade (`DeviceFilterDrawer.tsx:69`) | `Drawer` **bleibt**, in Insel 1 | Client | Er haelt Formularzustand |
| `Upload.Dragger` (`ImportWizard.tsx:150`) | `Upload.Dragger` mit `beforeUpload → return false` | Client | Falle 1. `return false` verhindert wie heute den Auto-POST (`ImportWizard.tsx:156`); die Datei geht als `FormData` ⛔ **an den Route Handler `import/hochladen/route.ts`, NICHT an eine Server Action** (Entscheidung **E-V16**) |
| `Steps` (`ImportWizard.tsx:139`) | `Steps` in Insel 4 | Client | Der Assistent haelt seinen Schrittzustand selbst |
| `Tabs` (`SettingsPage.tsx:11`) | ⛔ **entfaellt ganz** | — | Entscheidung 13: „API-Zugriff" faellt weg, „Softwareversionen" wird eine eigene Route (B9) |
| `Card` / `Statistic` / `Progress` / `Result` | unveraendert | ✅ **Server moeglich** | `CLAUDE.md:13`. Deshalb braucht die Uebersicht **keine** Insel (E-V15) |
| `Tag` (`LoanList.tsx:12`, `SoftwareVersionsPage.tsx:93`, `ImportWizard.tsx:273`) | `Tag` | Server **oder** Client — je nachdem, wo er steht | `Tag` selbst ist sicher; ein `Tag` **in einer `render`-Funktion** ist trotzdem Falle 9 |
| `Popconfirm` (`DeviceDetailDrawer.tsx:112`, `SoftwareVersionsPage.tsx:160`) | `Popconfirm` | Client | Haelt Zustand und ruft eine Action |
| `message.success/error` (13 Aufrufstellen gemessen) | dieselbe Textmenge, aber ⛔ **die Texte kommen aus einer benannten Konstantenliste**, nicht inline | Client | `Spec:4815-4832` gibt sie woertlich vor; siehe die 1:1-Tafel |
| `Combobox` (eigenbau, `components/Combobox.tsx`) | antd `AutoComplete` | Client | Planteil 3 hat die Form bereits gebaut (`_ui/EntleiherFeld.tsx`) — **dieselbe** Bauform, nicht eine zweite |
| `react-icons/fi` (19 Namen gemessen) | `_ui/ikonen.tsx` (Entscheidung **E-V7**) | Insel | ⛔ **Falle 7**: kein Zeichenpaket in einer Datei ohne `"use client"` |
| `@ant-design/v5-patch-for-react-19` | ⛔ **wird NICHT mitkopiert** | — | Mit antd 6 gegenstandslos (`Spec:4805-4807`) |
| `size="small"` (fuenf Stellen in `SoftwareVersionsPage.tsx`, eine in `ImportWizard.tsx:305`) | ⛔ **entfaellt ersatzlos** | — | **Falle 4**. Platz schafft `scroll={{ x: "max-content" }}` |

### Vier „geht nicht 1:1"-Posten, mit ihrer Ersatzbauform

1. **Kein `onClick` auf einer Kennzahlkarte** → `next/link` (Falle 9 waere die Alternative, und die
   kostet eine Insel, die die Uebersicht sonst nicht braucht). E-V15.
2. **Kein `#cf1322` fuer „Veraltet"** → `color="warning"`. Falle 3.
3. **Kein `deviceColumns.tsx` als Server-Modul** → `COLUMN_DEFS` wird Teil des Client-Teilbaums von
   Insel 1, ⛔ **nicht** von `_lib/` (Falle 6 **und** 9, `Spec:4512-4521`).
4. **Keine optimistische Anzeige** → Server Action + `revalidatePath`. Bewusster Verlust,
   `Spec:4617-4626`: „Preis: das Formular quittiert erst nach dem Rundlauf; bei SQLite im selben
   Prozess ist das der bessere Tausch." ⚠️ Der Alt-Code nahm `softwareVersion`/`lastUpdatedAt`
   ausdruecklich aus der optimistischen Aktualisierung heraus (`useUpdateDevice.ts:20-23`), sonst
   blieb das abgeleitete Update-Zeichen veraltet stehen — **dieser Ausschlussgrund entfaellt mit
   dem Verlust**, weil derselbe Prozess den Stand waehrend der Antwort neu rechnet.

---

## ⛔ Die Rechtestufe je Seite — je einzeln, mit Spec-Beleg

**Das ist die wichtigste Tabelle dieses Plans.** `Spec:4362-4380` bezeichnet sie als „verbindlich".

| # | Aeusserer Pfad | Datei unter `src/app/m/radio/admin/` | **Erste Anweisung** | Spec-Beleg | Aufgabe |
|---|---|---|---|---|---|
| — | (Huelle) | `(arbeit)/layout.tsx` | `requireRadioHost(await headers())`, **danach** `await requireRadioVerwaltung()` | `Spec:4367` | **V3** (Wechsel von `requireRadioAdmin`) |
| — | (Huelle) | `(druck)/layout.tsx` | `requireRadioHost(await headers())`, **danach** `await requireRadioAdmin()` — ⛔ **kein** `VerwaltungsRahmen` | `Spec:4368`, §1.2.2 | steht bereits, **unveraendert** |
| 1 | `/admin` | `(arbeit)/page.tsx` | `await requireRadioVerwaltung()` | `Spec:4369` | V12 |
| 2 | `/admin/geraete` | `(arbeit)/geraete/page.tsx` | `await requireRadioVerwaltung()` | `Spec:4370` | V13 |
| 3 | `/admin/geraete/[id]` | `(arbeit)/geraete/[id]/page.tsx` | `await requireRadioVerwaltung()` | `Spec:4371` | V14 |
| 4 | `/admin/geraete/[id]/ereignisse` | `(arbeit)/geraete/[id]/ereignisse/page.tsx` | `await requireRadioVerwaltung()` | `Spec:4372` | V15 |
| 5 | `/admin/ausleihen` | `(arbeit)/ausleihen/page.tsx` | `await requireRadioVerwaltung()` | `Spec:4373` | V16 |
| 6 | `/admin/software` | `(arbeit)/software/page.tsx` | `await requireRadioVerwaltung()` | `Spec:4374` | V17 |
| 7 | `/admin/import` | `(arbeit)/import/page.tsx` | `await requireRadioVerwaltung()` | `Spec:4375` — ⚠️ **widerspruechlich, siehe E-V4 und ⬜ V-L5** | V18 |
| 8 | `/admin/versionen` | `(arbeit)/versionen/page.tsx` | ⛔ **`await requireRadioAdmin()`** | `Spec:4376` | **V19 — mit namentlicher Zusicherung** |
| 9 | `/admin/zugaenge` | `(arbeit)/zugaenge/page.tsx` | ⛔ **`await requireRadioAdmin()`** | `Spec:4377` | **V20 — mit namentlicher Zusicherung** |
| 10 | `/admin/zugaenge/blatt` | `(druck)/zugaenge/blatt/page.tsx` | ⛔ **`await requireRadioAdmin()`** | `Spec:4378` | V21 |
| — (Handler) | `/m/radio/admin/geraete/export` | `(arbeit)/geraete/export/route.ts` | `radioHostOderNull(request.headers) === null → 404`, danach `!istRadioAdmin(await viewerOderNull()) → 404` | `Spec:4379`, B10/B11/B17 | V22 |
| — (Handler) | `/m/radio/admin/import/hochladen` | `(arbeit)/import/hochladen/route.ts` | ⛔ **dieselbe nicht-werfende Form**, `radioHostOderNull(...) === null → 404`, danach `!istRadioAdmin(await viewerOderNull()) → 404` | ⚠️ **benannte Abweichung von `Spec:4657`** (dort eine Server Action) — Entscheidung **E-V16**, Riegelform nach B10/B11/B17 | **V18** |

### ⛔ Die namentliche Zusicherung — warum kein Scan sie ersetzt

`riegel.test.ts` prueft im `(arbeit)`-Zweig ueber `personenRiegelFuer(kurz)`
(`riegel.test.ts:408-417`) das Muster

```
/\brequireRadioAdmin\s*\(|\brequireRadioVerwaltung\s*\(/
```

— **ODER**, absichtlich. Die Begruendung steht ausgeschrieben (`riegel.test.ts:380-406`): ohne das
ODER waere der Scan gegen `Spec:4367` **rot-by-construction**, sobald V3 das Layout auf
`requireRadioVerwaltung` stellt, und der naheliegende Gruen-Fix (Layout zurueck auf
`requireRadioAdmin`) sperrte jede Updater-Person mit 404, still gruen in typecheck/lint/build.

⛔ **Ein pfadsensitiver Scan kann innerhalb DERSELBEN Route-Group „richtig auf der
Verwaltungsstufe" nicht von „faelschlich von der Admin-Stufe abgesenkt" unterscheiden.**

**Betroffen sind genau zwei Seiten:** `admin/(arbeit)/versionen/page.tsx` und
`admin/(arbeit)/zugaenge/page.tsx`. Die dritte Admin-Seite, `(druck)/zugaenge/blatt/page.tsx`,
faellt in den **strengen** Zweig (`personenRiegelFuer` liefert dort nur `requireRadioAdmin`) und
waere gedeckt — ⛔ **aber nur, solange sie in `(druck)` liegt.** Wird sie je nach `(arbeit)`
verschoben, faellt sie in dieselbe Luecke.

**Die Vorgabe fuer V19 und V20 — ein Testfall je Seite, mit LITERALEM Pfad:**

| Testname | Aussage |
|---|---|
| „admin/(arbeit)/versionen/page.tsx nennt requireRadioAdmin und NICHT requireRadioVerwaltung" | ⛔ Zwei Zusicherungen, **positiv und negativ**. Der literale Pfad steht als Zeichenkette im Test; eine pfadgenerische Form kann diese Aussage nicht erzeugen — siehe der Absatz darueber. Beleg am Fall: `Spec:4376` |
| „admin/(arbeit)/zugaenge/page.tsx nennt requireRadioAdmin und NICHT requireRadioVerwaltung" | dito, Beleg `Spec:4377`. ⛔ **Und der fachliche Grund steht daneben:** „die Updater-Stufe erreicht die Code-Verwaltung **nicht** … weil Ausstellen/Sperren laut Betreiberantwort 6 allein den radio-admins gehoeren" (`Spec:4456-4459`) |
| „admin/(druck)/zugaenge/blatt/page.tsx liegt in (druck), nennt requireRadioAdmin und NICHT requireRadioVerwaltung" | Die **Lagepruefung** ist der Teil, der nicht selbstverstaendlich ist: sie faengt eine Verschiebung nach `(arbeit)`, die den Schutz der Klausel still verloere. ⛔ **Die negative Haelfte traegt zusaetzlich**, weil der strenge Zweig von `personenRiegelFuer` nur die **Anwesenheit** prueft (`riegel.test.ts:408-417`) — damit sind alle drei Admin-Seiten symmetrisch gesichert |
| „genau DREI Verwaltungsseiten nennen requireRadioAdmin" | ⛔ **Exakte Zahl, `toBe(3)`.** Ohne sie waere die Menge nach oben offen: eine **vierte** faelschlich angehobene Seite (etwa `/admin/ausleihen` auf Admin-Stufe) sperrte jede Updater-Person aus einer Flaeche, die ihr gehoert — und **keiner** der drei Faelle darueber saehe das |

⛔ **Diese vier Faelle stehen in `admin/actions.test.ts` mit — nicht in `riegel.test.ts`.** Grund:
`riegel.test.ts` ist der **bauform**-orientierte Scan („jede Flaeche traegt die Riegelform ihrer
Art"), und seine Klauseln sind bewusst pfadgenerisch. Eine namentliche Ausnahmeliste dort
verwaesserte seine Aussage. Der Waechter der **Aufruftabelle** ist laut `Spec:4853-4857`
`admin/actions.test.ts` — dort gehoert sie hin.

### Die Rechtetafel „Was die Stufen duerfen" (`Spec:4444-4454`, vollstaendig)

| Flaeche / Aktion | Admin | Updater | Wo durchgesetzt |
|---|---|---|---|
| Uebersicht, Geraeteliste, Geraetedetail, Ereignisse, Ausleihen | ja | ja | `requireRadioVerwaltung()` in der Seite |
| Update-Modus (`softwareVersion`, `lastUpdatedAt`, `status`) | ja | ja | `filterSchreibbareFelder` in `geraetAendernAction` |
| Notiz anfuegen | ja | ja | `notizAnfuegenAction` ruft `requireRadioVerwaltung()` |
| Geraet anlegen / loeschen | ja | **nein** | `geraetAnlegenAction` / `geraetLoeschenAction` rufen `requireRadioAdmin()` |
| Alle uebrigen Geraetefelder aendern | ja | **nein** | ⛔ **Feldriegel, still verwerfend** — nicht ablehnend |
| CSV-Import | ja | **nein** | `importSchreibenAction` ruft `requireRadioAdmin()`; der Hochladen-Handler prueft `istRadioAdmin(await viewerOderNull())` (E-V16) — ⚠️ **schaerfer als der Bestand**, siehe E-V4 |
| CSV-Export | ja | **nein** | `istRadioAdmin(await viewerOderNull())` im Handler |
| Softwareversionen anlegen / Ziel setzen / loeschen / sortieren | ja | **nein** | vier Actions mit `requireRadioAdmin()` **und** die Seite mit `requireRadioAdmin()` |
| Code-Verwaltung | ja | **nein** | Seite, Blatt und `_actions/codes.ts` — alle auf `requireRadioAdmin()` |

⛔ **Der Feldriegel wandert 1:1, samt stillem Verwerfen** (`Spec:4432-4440`). Woertlich aus dem
Bestand (`radio-admin/shared/src/editable-fields.ts:3`):

```ts
export const UPDATER_EDITABLE_FIELDS = ['softwareVersion', 'lastUpdatedAt', 'status'] as const;
```

Durchgesetzt serverseitig ueber `filterEditableFields` (`editable-fields.ts:5-18`), und
`PATCH /devices/:id` traegt **kein** `requireRole` — der Quellkommentar sagt warum, woertlich
(`radio-admin/server/src/routes/devices.ts:124-125`):

> „the field allowlist (not a route guard) is the authorization boundary — disallowed fields are
> silently dropped, not rejected"

⛔ **Verworfen, nicht abgelehnt.** Begruendung (`Spec:4436-4440`): das Formular zeigt gesperrte
Felder ohnehin als `disabled` (`DeviceFields.tsx:67`, `:73`, `:80`, `:111`, `:132`, … ueber alle **20 benannten**
`Form.Item`); ein Fehler statt Verwerfen waere nur bei manipulierten Anfragen erreichbar und
verriete einen Riegel, den Verwerfen still haelt.

⛔ **Der Test dazu braucht je Feld UNTERSCHIEDLICHE Werte** (`Spec:4843-4844` — §5.13, das Testkapitel; zweitgenannt `Spec:4439-4440` in §5.5. ⚠️ `Spec:4367-4368` sind die zwei **Layout**-Zeilen der Aufruftabelle und tragen die Aussage NICHT) —
sonst besteht eine Vertauschung den Test.

---

## ⛔ Die 1:1-Tafel — gemessen, mit `datei:zeile`

Alle Zeilen gemessen am 2026-08-24 in `/Users/rubeen/dev/personal/drk/radio-admin`.

### A. Die sechs `/v1`-Routen und ihr Ersatz

| Alt-Route | Filter / Sortierung / Grenze, **gemessen** | Ersatz | Wann faellt sie | Was bis dahin von ihr abhaengt |
|---|---|---|---|---|
| `GET /v1/loan-devices` (`loanApi.ts:126`) | `where(eq(devices.loanable, true))`, `orderBy(desc(devices.createdAt))`, keine Paginierung (`deviceRepo.ts:53-59`); Projektion `toLoanDevice`, **elf Felder ohne Audit/Software** (`loanApi.ts:34-44`) | ✅ `geraeteMitLeihstand` (`_db/leihen.ts:285`) | ⛔ **6.7-D**, nicht hier | Der **Alt-Kiosk** `radio-inventar` — bis D unveraendert |
| `GET /v1/active-loans` (`:133`) | `where(isNull(loans.returnedAt))`, `orderBy(desc(loans.borrowedAt))` (`loanRepo.ts:126-134`); ⛔ **kein `loanable`-Filter, bewusst** (`loanApi.ts:130-132`) | ✅ `offeneAusleihen` (`_db/leihen.ts:333`) | 6.7-D | Alt-Kiosk |
| `GET /v1/loans/history` (`:140`) | s. **Entscheidung E-V10** | ⛔ **`leihhistorie` — fehlt, Aufgabe V1** | 6.7-D | Alt-Kiosk **und** die Alt-Verwaltung (`GET /api/loans` ruft **dieselbe** `listLoans`, `loans.ts:19-21`) |
| `GET /v1/borrowers/suggestions` (`:148`) | `q` min 1 getrimmt, `limit` Vorgabe **10**, max **50** (`shared/src/loan.ts:110-119`); case-insensitiv per `lower_u()`, LIKE-Wildcards escaped, sortiert nach zuletzt benutzt (`loanRepo.ts:168-175`) | ✅ `sucheEntleiher` (`_db/leihen.ts:373`) + Action `entleiherVorschlaege` (`_actions/ausleihe.ts:317`) | 6.7-D | Alt-Kiosk |
| `POST /v1/loans` (`:158`) | `borrowerName` getrimmt, min 1, **max 100**; drei Master-Pruefungen in Reihenfolge; 409 ueber Unique-Index | ✅ `bucheAusleihe` (`_db/leihen.ts:501`) | 6.7-D | Alt-Kiosk |
| `PATCH /v1/loans/:loanId` (`:187`) | `returnNote` optional getrimmt, **max 500**, leer → `null`; atomar ueber `returned_at IS NULL` | ✅ `bucheRueckgabe` (`_db/leihen.ts:648`) | 6.7-D | Alt-Kiosk |

⛔ **Keine dieser sechs Routen wird von Planteil 4 angefasst.** Sie fallen **alle gemeinsam** in
6.7-Abschnitt D, mit dem Router-Schwenk — das ist die ganze Aussage von Entscheidung 15: „Beide
Domains ziehen im selben Fenster um."

⚠️ **Warum jeder andere Zeitpunkt Datenverlust ist** (`Spec:5462-5486`, gekuerzt zitiert):

* **Verwaltung zuerst geschwenkt:** der Alt-Kiosk zeigt auf einen Host, der jetzt die Suite
  bedient; `loan-devices` antwortet 404. „Der Ausfall ist zunaechst **unsichtbar**: der
  Geraete-Cache traegt noch … Schlimmer als der Ausfall ist das Fenster davor: Ausleihen und
  Rueckgaben … landen **nirgends** — nicht in der alten Datenbank … und nicht in der neuen."
* **Kiosk zuerst geschwenkt:** stille **Divergenz** — „die Suite verleiht auf einem Bestand, den
  niemand mehr pflegt, und der Import beim echten Cutover ueberschreibt entweder die neuen Leihen
  oder die alten Bestandsaenderungen. Beides ist Datenverlust ohne Fehlermeldung."
* **Dieselbe Ursache:** „radio-admin ist Master fuer Geraete **und** Leihen, und radio-inventar
  schreibt ausschliesslich dorthin. Wer nur eine der beiden Domains schwenkt, trennt Master und
  Schreiber."

### B. Die Verwaltungsmasken

| Maske | Filter | Sortierung | Feldgrenzen / Pflichtfelder | Beleg |
|---|---|---|---|---|
| **Geraeteliste** | zehn Filter, **jeder einzeln abgebildet, ausdruecklich nicht per Spread** („so that clearing a filter actually removes it"): `updateStatus`, `status`, `location`, `deviceType`, `funktion`, `hersteller`, `deviceModes`, `loanable`, `alamosIntegrated`, `hasUpdateNote` | acht annehmbare Schluessel, sechs sortierbare Spalten, Vorgabe `desc(createdAt)` — siehe **E-V9** | Seitengroesse **20**, kein Groessenwechsler | `DeviceList.tsx:79-94`, `:28`, `:164-169`; Server `deviceRepo.ts:174-201` |
| ↳ **Filter-Semantik im Detail** | `status`/`location`/`deviceType`/`funktion`/`hersteller`: CSV-Liste → **`IN`** · `deviceModes`: CSV-Token → **`AND` von `LIKE '%token%'`** · `loanable`/`alamosIntegrated`: ⛔ **nur wenn wahr** (`if (params.loanable)`) — „nicht ausleihbar" ist **nicht** ausdrueckbar · `hasUpdateNote`: `isNotNull AND ne('')` · `updateStatus`: `eq` auf den **SQL-Ausdruck** | | | `deviceRepo.ts:174-189` |
| ↳ **Freitextsuche** | `LIKE '%q%'` als **`OR`** ueber die gewaehlten Felder; **zwoelf** waehlbare Felder, **sieben** vorgewaehlt; ⛔ **alle angeforderten Felder unbekannt ⇒ KEINE Zeilen (`sql\`0\`)**, nie eine Interpolation | | 300 ms entprellt **in der Insel** | `deviceRepo.ts:125-140`, `:159-173`; Auswahl `SearchFieldPicker.tsx:5-21`; Entprellung `DeviceList.tsx:66-75` |
| **Geraeteformular** (anlegen und aendern) | — | Felder in **fuenf** Abschnitten: Identitaet · Geraet · Einsatz · Update · Bemerkung | ⛔ **Einziges Pflichtfeld: `issi`** („ISSI ist erforderlich"). ⛔ **KEINE serverseitige Maximallaenge auf irgendeinem Textfeld** — alle **19** uebrigen sind `nullable().optional()` (`schemas.ts:52-71`, gezaehlt), die DB-Spalten sind `text(...)` ohne Laengenbegrenzung. `status` ist **nicht** schemaseitig auf die fuenf Optionen begrenzt | `DeviceFields.tsx:56-191`, `:64`; `radio-admin/shared/src/schemas.ts:50-99`; `constants.ts:7-16` |
| ↳ **Vorschlagsfelder** | acht `Combobox`-Felder mit Vorschlaegen (`opta`, `rufname`, `hersteller`, `deviceType`, `bedieneinheit`, `funktion`, `location`, `assignedTo`) | `selectDistinct` mit `isNotNull`, `orderBy(col)` | ⚠️ **Der Endpunkt bietet NEUN Felder** (zusaetzlich `status`) — das Formular nutzt acht, weil `status` eine feste Optionsliste hat | `DeviceFields.tsx:76-121`; Server `suggestions.ts:8-32` |
| ↳ **Feste Wertelisten** | `STATUS_OPTIONS = ['Einsatzbereit','Defekt','Ausgeliehen','Wartung','Sonstiges']` · `DEVICE_MODES = ['TMO','DMO','REP','GAT']`, ⛔ **reihenfolgeerhaltend, nicht sortieren** | | | `constants.ts:1-17` |
| **Ausleihenliste** | ⛔ **keine** — die Flaeche schickt nur `page`/`pageSize` | `desc(borrowedAt)`, fest | Seitengroesse **20**, kein Groessenwechsler | `useLoans.ts:18-23`, `LoanList.tsx:8`, `:66` |
| ↳ **Sieben Spalten** | Geraet (`snapshotCallSign`) · Typ (`snapshotDeviceType`) · Ausleihende:r (`borrowerName`) · Ausgeliehen · Zurueckgegeben · Status · Notiz (`returnNote`); leere Werte als `—` | | ⛔ **Status abgeleitet aus `returnedAt === null`** | `LoanList.tsx:11-47` |
| **Softwareversionen** | keine | `desc(sortOrder)`, dann `desc(createdAt)` | `value` getrimmt, min 1; ⛔ **Duplikat ⇒ 409**; ⛔ **Loeschen gesperrt, solange `deviceCount > 0`** | `softwareVersionRepo.ts:139-151`, `softwareVersions.ts:13`, `:34`, `:60`; `deleteSoftwareVersion` `softwareVersionRepo.ts:102-120` |
| ↳ **Reihenfolge und Ziel** | „erste Id bekommt den **hoechsten** `sortOrder`", `ids.length - index` | ⛔ **Ziel wird NIE aus dem Anlegedatum abgeleitet**; `setTargetVersion` setzt **zuerst**, prueft `changes === 0` und raeumt erst dann die anderen ab | | `softwareVersionRepo.ts:127-136`, `:77-90` |
| ↳ **Fuenf Spalten** | Version (mit `Ziel`-Marke) · Geraete (rechtsbuendig) · Angelegt · Reihenfolge (auf/ab) · Aktionen | | | `SoftwareVersionsPage.tsx:84-175` |
| **Update-Modus** | Suche auf **drei** Feldern: `issi`, `rufname`, `opta`; `pageSize: 25`; 300 ms entprellt; ⛔ **ohne Suchtext wird NICHTS gezeigt** (`Empty`) | Vorgabe | Zielversion vorbelegt mit der `isTarget`-Version | `UpdateMode.tsx:8`, `:24-31`, `:67-68`, `:17-22` |
| ↳ **Fortschritt** | `done von total auf Zielversion` + `Progress`; `total` aus einer Abfrage ohne Filter, `done` aus `updateStatus: 'aktuell'` | | ⛔ **bleibt im Update-Modus** — „Weitere Auswertungen entstehen nicht" (`Spec:4793-4794`) | `UpdateMode.tsx:30-33`, `:53-58` |
| ↳ **Was ein Tap setzt** | `{ softwareVersion: zielversion, lastUpdatedAt: <Tag> }` — ⚠️ **Abweichung E-V11**: der Bestand setzt `Date.now()`, die Suite den Berliner Tag | | | `UpdateDeviceCard.tsx:24` |
| **CSV-Import** | vier Schritte `upload \| mapping \| preview \| done`; `commit` wird **zweimal** gerufen (`dryRun: true`, dann `false`) | — | ⛔ **ISSI-Spalte muss zugeordnet sein**, sonst kein Uebergang | `ImportWizard.tsx:33-35`, `:107`, `:123`, `:109`, `:211` |
| ↳ **Zuordnung** | **19** importierbare Felder, Kopfzeilen ueber eine Synonymtabelle normalisiert (NFD, klein, nur `[a-z0-9]`); `Gerätefunktionen…` per **Praefix** erkannt; ⛔ **kein Dedup** — zwei Synonyme desselben Feldes bilden beide ab | | | `shared/src/import/auto-map-headers.ts:2-22`, `:26-33`, `:36-88`, `:97-110` |
| ↳ **Klassifikation** | ⛔ **FUENF Klassen, nicht drei**: `created` „Neu" · `updated` „**Aktualisiert**" · `unchanged` „Unveraendert" · `error` „Fehler" · `skipped-no-permission` „Uebersprungen". ⚠️ `Spec:4711-4714` sagt „neu / geaendert / unveraendert" — **die gemessenen Woerter sind andere und es sind fuenf** | | Doppelte ISSI in derselben Datei ⇒ `error` „Duplikat in Datei"; leere ISSI ⇒ `error` „Leere ISSI" | `ImportWizard.tsx:60-66`; `commit-service.ts:123-145`; `classify-import-row.ts:33-53` |
| ↳ **Zellnormalisierung** | Wahrheitswerte: `x/ja/yes/y/1/true/wahr/✓` (klein, getrimmt) → `true`, leer → `null`, alles andere → `false` · `lastUpdatedAt`: ms-Zahl, ISO `YYYY-MM-DD`, deutsch `DD.MM.YYYY`, sonst `null`, ⛔ **nie NaN** · `deviceModes`: Split an `/,;`+Leerraum, gross, nur bekannte Modi, ⛔ **in `DEVICE_MODES`-Reihenfolge** · sonst: getrimmt, leer → `null` | | | `commit-service.ts:19`, `:25-29`, `:40-67`, `:74-83`, `:86-110` |
| **CSV-Export** | keine — **alle** Geraete, `desc(createdAt)` | | **19** Spalten in fester Reihenfolge, deutsche Kopfzeilen, Trennzeichen `;`, fuehrendes UTF-8-BOM | `deviceRepo.ts:63-65`; `export.ts:9`, `:16-36`, `:57-62` |
| ↳ **`formatiereZelle`, drei Regeln** | `alamosIntegrated`/`loanable`: `true → 'x'`, sonst `''` — ⛔ **nur `true` und `null` laufen rund** · `lastUpdatedAt`: siehe **E-V11** · alles andere: woertlich, `null → ''` | | | `export.ts:38-54` |
| **Geraeteereignisse** | `where(eq(deviceEvents.deviceId, id))` | `desc(changedAt)` | ⛔ **Der Alt-Leser hat KEINE Grenze**; die Suite setzt **200** (⬜ V-L7) | `deviceRepo.ts:248-254`; `Spec:4767-4770` |
| ↳ **Namensaufloesung** | `changedBy` (ein `sub`) wird **additiv** ueber `users` aufgeloest, ⛔ **Rueckfall auf den rohen `sub`, damit das Feld nie leer ist** | | | `devices.ts:70-78`; Suite-Naht: `merkeNutzer` (NS-Z7) |
| **Uebersicht** | vier Kennzahlen; Liste der **fuenf** juengsten veralteten Geraete (`pageSize: 5`, `updateStatus: 'veraltet'`) | Vorgabe `desc(createdAt)` | ⛔ **eine Abfrage mit `GROUP BY` statt vier mit `pageSize: 1`** (E-V15) | `Dashboard.tsx:21`, `:27-53`; `useDashboardStats.ts:17-20` |

### C. Die Schreibwege — Reihenfolge und Ereignisse

⛔ **`geraetAendernAction` folgt der Alt-Reihenfolge EXAKT** (`Spec:4586-4592`, gemessen
`radio-admin/server/src/routes/devices.ts:126-157`):

1. Geraet lesen; fehlt es → `verschwunden`.
2. **Rolle-Filter** (`filterSchreibbareFelder`).
3. `diffGeraet(bestehend, erlaubt)`.
4. ⛔ **Bei leerem Diff: FRUEHER Ausstieg mit dem unveraenderten Geraet** — `if (diffs.length === 0)`
   (`devices.ts:139-142`, und derselbe Satz in `deviceRepo.ts:229`: `if (diffs.length === 0) return;`).
   **Kein Ereignis, kein `updatedAt`, kein `revalidatePath`.**
5. Sonst **EINE** Transaktion: neue Softwareversion registrieren (`insertSoftwareVersionIfNew`,
   nur wenn gesetzt) → Geraet schreiben → Ereignisse schreiben.
   ⛔ **Grund fuer die Transaktion, woertlich (`devices.ts:144-145`):** „roll back together (e.g.
   changing issi to an existing one rolls back)". ⚠️ **Dieselbe Zusage steht auf dem ANLEGEweg als**
   „a duplicate-ISSI throw rolls back the whole write" (`devices.ts:110-111`) — ⛔ **der Satz steht
   NICHT auf `:144-145`**, und wer ihn dort sucht, findet die andere Formulierung.

⛔ **`diffGeraet` iteriert NUR die Schluessel des Patches**, ueberspringt `undefined`, vergleicht
roh mit `!==` und stringifiziert alt/neu unter Erhalt von `null`
(`radio-admin/shared/src/diff-device.ts:14-27`).

⛔ **`writeEvents` schreibt EINE Zeile je Feld und benutzt EINEN `changedAt` fuer alle**
(`deviceRepo.ts:222-245`).

⛔ **Die vier `quelle`-Werte sind abschliessend** (`deviceRepo.ts:219`,
`_db/schema.ts:139-141` fuehrt sie bereits als Drizzle-Enum **ohne DB-Check**):

| Action | `quelle` | Beleg |
|---|---|---|
| `geraetAnlegenAction` | `create` — **eine Zeile je nicht-null uebergebenem Feld**, `oldValue: null` | `devices.ts:106-108`, `:117` |
| `geraetAendernAction` | `manual` | `devices.ts:151` |
| `notizAnfuegenAction` | `update-note` | `devices.ts:180` |
| `importSchreibenAction` | `csv-import` | §5.8, `Spec:4658` |

⛔ **`notizAnfuegenAction` ist KEIN Sonderfall von „aendern"** (`Spec:4679-4684`): eigener
Endpunkt, eigener `quelle`-Wert, eigene Regel. Sie haengt an, ueberschreibt nie, und benutzt
**einen** Zeitstempel fuer die angehaengte Zeile **und** ihr Ereignis, „damit beide nicht ueber eine
Mitternachtsgrenze auseinanderlaufen" (`devices.ts:172-176`). Das Ereignis traegt
`oldValue = bisherige Notiz`, `newValue = **nur die neue Zeile**` (`devices.ts:180`).

⛔ **`haengeNotizAn` wandert woertlich, samt Faelschungsschutz**
(`radio-admin/shared/src/update-note.ts:25-35`):

* Zeilenumbrueche in `text` **und** `author` werden zu Leerzeichen kollabiert (`singleLine`, `:11-13`);
* aus `author` wird jedes `]` **entfernt** (`:31`);
* die Zeile lautet `[YYYY-MM-DD · Autor] Text`, das Datum in **UTC** (`isoDate`, `:2-4`);
* bestehender Inhalt bleibt **woertlich** erhalten, die neue Zeile kommt mit `\n` dahinter.

⛔ **Der Grund steht im Quellkommentar und wandert mit** (`update-note.ts:20-23`): „neither
argument can forge a second `[date · author]` audit entry (audit-trail injection)."

### D. Die `revalidatePath`-Listen — abgeleitet aus dem `invalidateQueries`-Faecher

`Spec:4612-4615`: der Alt-Faecher ist die **Vorlage** — „dass `useCreateDevice.ts:11-13` **drei**
Schluessel invalidiert, ist die gemessene Aussage ‚ein neues Geraet veraendert Liste, Vorschlaege
und Versionsliste'".

⛔ **`revalidatePath` bekommt IMMER die INNERE Form `/m/radio/...`** (`Spec:4212-4216`), niemals die
aeussere `/admin/...` — es adressiert den Router-Cache, nicht die Adresszeile. ⚠️ **Fund F3 der
Planteil-3-Schlusspruefung war genau dieser Fehler**, dort folgenlos wegen `force-dynamic`; hier
nicht.

| Action | `revalidatePath` |
|---|---|
| `geraetAnlegenAction` | `/m/radio/admin/geraete`, `/m/radio/admin`, `/m/radio/admin/versionen` |
| `geraetAendernAction` | `/m/radio/admin/geraete/[id]`, `/m/radio/admin/geraete`, `/m/radio/admin` |
| `geraetLoeschenAction` | `/m/radio/admin/geraete`, `/m/radio/admin`; danach `redirect("/m/radio/admin/geraete")` |
| `notizAnfuegenAction` | `/m/radio/admin/geraete/[id]`, `/m/radio/admin/geraete` |
| die vier Versions-Actions | `/m/radio/admin/versionen`, `/m/radio/admin/geraete`, `/m/radio/admin` |
| `importSchreibenAction` | `/m/radio/admin/geraete`, `/m/radio/admin`, `/m/radio/admin/versionen` |

### E. Die Texte, die woertlich wandern (`Spec:4815-4832`)

⛔ **Diese Saetze sind selbst der Beleg — nicht paraphrasieren.**

| Text | Wo er heute steht |
|---|---|
| „Diese Version existiert bereits" (409) | `SoftwareVersionsPage.tsx:37` |
| „Version wird noch von N Gerät(en) genutzt" | `SoftwareVersionsPage.tsx:60` |
| „Wird von N Gerät(en) genutzt — erst umstellen" | `SoftwareVersionsPage.tsx:154` |
| „Zielversion gesetzt" · „Version angelegt" · „Version gelöscht" | `:46` · `:33` · `:55` |
| „ISSI-Spalte muss zugeordnet sein" | `ImportWizard.tsx:109` |
| „Datei konnte nicht gelesen werden" · „Vorschau fehlgeschlagen" · „Import fehlgeschlagen" | `:101` · `:117` · `:131` |
| „Gerät gelöscht" · „Löschen fehlgeschlagen" | `DeviceDetailDrawer.tsx:54` · `:57` |
| „ISSI bereits vergeben" · „Speichern fehlgeschlagen" · „Gerät gespeichert" | `DeviceEditForm.tsx:98` · `:100` · `:94` |
| „Die als „Ziel“ markierte Version bestimmt, welche Geräte als „aktuell“ gelten. Neu angelegte Versionen werden nicht automatisch zum Ziel — die Reihenfolge dient nur der Anzeige." | `SoftwareVersionsPage.tsx:185` |
| „Gerät suchen, mit einem Tap auf die Zielversion setzen. Nur die Geräte, die du wirklich aktualisiert hast." | `UpdateMode.tsx:40` |
| „Keine veralteten Geräte" · „Gerät suchen, um es zu aktualisieren" · „Kein Gerät gefunden" | `Dashboard.tsx:87` · `UpdateMode.tsx:68` · `:76` |
| „updater darf keine neuen Geräte anlegen" (Erklaerung an „Uebersprungen") | `ImportWizard.tsx:275` |
| „Import abgeschlossen" · „Zu den Geräten" | `ImportWizard.tsx:234` · `:238` |

⛔ **Sie liegen in EINER benannten Konstantenliste je Flaeche**, nicht inline verstreut — sonst ist
die naechste Formulierungsaenderung eine Suche ueber neun Dateien. ⚠️ **Und sie tragen ihre
Umlaute**: es sind Bildschirmtexte, keine Bezeichner.

**Nicht uebernommen** (`Spec:4834-4836`): die Datei-fuer-Datei-Struktur. „aus 14 Dateien unter
`features/devices/` werden sieben unter `admin/geraete/`, weil ColumnPicker, CheckboxDropdown,
SearchFieldPicker und FilterDrawer in einer Insel keine eigene Schichtung mehr brauchen."

---

## ⛔ Die acht Client-Inseln — warum Client, wo die Grenze liegt, welche Falle

**Falle 9 ist fuer typecheck, lint und build unsichtbar, und jsdom kann sie strukturell nicht
sehen** (dort gibt es keine RSC-Grenze). ⛔ **Nur ein echter Abruf zeigt sie** — deshalb ist je
Insel ein Playwright-Fall Pflichtbestandteil, nicht Nachbesserung.

| # | Datei | **Warum Client** | **Props-Grenze — nur Serialisierbares** | Beruehrte Fallen |
|---|---|---|---|---|
| **1** | `admin/(arbeit)/geraete/GeraeteTabelle.tsx` (+ `GeraeteWerkzeugleiste`, `SpaltenWahl`, `FilterSchublade`, `NeuGeraetModal` **im selben Client-Teilbaum**, E-V6) | 18 Spalten mit **15 `render`** (`deviceColumns.tsx:16-35`); `Grid.useBreakpoint()` (`DeviceList.tsx:36`); `usePersistentState` (`:49-54`); `Input.Search`, `Space.Compact`, `Badge`, `Drawer`, `Modal`; der mobile `<List renderItem>`-Zweig (`:198`); `onRow` (`:182-185`) | `{ zeilen: GeraetZeile[]; gesamt: number; seite: number; seitenGroesse: number; sortierung: string \| null; filter: GeraetFilter; vorschlaege: Record<Vorschlagsfeld, string[]>; darfAnlegen: boolean; darfExportieren: boolean }` (`Spec:4503`) | **9** (die 15 `render`) · **1** (`Input.Search`, `Space.Compact`, `List.Item`) · **7** (Zeichen) · **6** (`COLUMN_DEFS` darf **nicht** in `_lib/`) |
| **2** | `admin/(arbeit)/ausleihen/AusleihenTabelle.tsx` | fuenf `render` (`LoanList.tsx:21`, `:28`, `:34`, `:39`, `:45`), `StatusTag` (`:11-13`), mobiler `renderItem`-Zweig (`:95`) | `{ zeilen: AusleihZeile[]; gesamt: number; seite: number }` (`Spec:4504`) | **9** · **1** (`Typography.Text`, `List.Item`) |
| **3** | `admin/(arbeit)/versionen/VersionenTabelle.tsx` (+ `NeuVersion.tsx`) | vier `render` (`SoftwareVersionsPage.tsx:89`, `:110`, `:116`, `:139`); die Aktionsspalte **faengt Zustand ein** (`handleMove`, `handleDelete`, `handleSetTarget`, `rows.length`, `reorder.isPending`); `Popconfirm`, `Tooltip`, `Space.Compact` | `{ zeilen: VersionZeile[] }` (`Spec:4505`) | **9** · **1** · **4** (⛔ die fuenf `size="small"` entfallen) |
| **4** | `admin/(arbeit)/import/ImportAssistent.tsx` | vier Schritte als **eigener Zustand** (`ImportWizard.tsx:33-35`, `:88-92`); `Upload.Dragger`, `Steps`, `Select`, `Result`; zwei `render` (`:271`, `:284`) | ⛔ **`{}`** — der Assistent haelt Schritt, Zuordnung und Vorschau **selbst** (`Spec:4506`); die Action wird **direkt importiert**, der Dateischritt geht per `fetch` an den Hochladen-Handler (E-V16) | **9 + 1** (`Spec:4506` nennt beide) |
| **5** | `admin/(arbeit)/geraete/[id]/ereignisse/EreignisTabelle.tsx` | vier Spalten mit `render` (Zeit, Feld, Aenderung, Wer) und ein `Tag` je `quelle` — **neu**, ohne Vorbild (§5.10) | `{ zeilen: EreignisZeile[] }` (`Spec:4507`) | **9** |
| **6** | `admin/(arbeit)/geraete/[id]/GeraetFormular.tsx` | ⛔ **Falle 1, NICHT Falle 9.** `DeviceFields.tsx` ist 194 Zeilen fast ausschliesslich `Form.Item` (**21 gerenderte, 20 benannte**) — Compound-Zugriff, in einer Server Component HTTP 500. Dazu `Input.TextArea` (`:178`, `:187`), `DatePicker` (`:164`), `Select mode="multiple"` (`:108`) | `{ geraet: GeraetFormWerte; rolle: RadioRolle; vorschlaege: Record<Vorschlagsfeld, string[]> }` (`Spec:4508`) — ⛔ **`rolle` als Wert, nicht als Funktion**; `lockedFor` entsteht **in** der Insel (`DeviceEditForm.tsx:36-37`) | **1** · **6** (`UPDATER_FELDER` kommt aus `_lib/rollen.ts`, **ohne** `"use client"`) |
| **7** | `admin/(arbeit)/software/UpdateSuche.tsx` | `Input.Search`, `Typography.Title`, `Combobox`/`AutoComplete`, `Progress` in einem zustandsbehafteten Zweig; die Karten rufen je zwei Actions (`UpdateDeviceCard.tsx:17-18`) | `{ versionen: string[]; zielVersion: string \| null; gesamt: number; aufZiel: number }` (`Spec:4509`) — ⛔ **Pfad ist `software/`, nicht `update/`** (B9) | **1** |
| **8** | `admin/(arbeit)/zugaenge/CodeTabelle.tsx` | Tabelle mit `render` je Zeile (Bezeichnung, Zustand, zuletzt benutzt, Sperren/Entsperren); `Popconfirm`; ruft `erstelleCode` und `setzeCodeAktiv` direkt (NS-A6) | `{ zeilen: CodeZeile[] }` (`Spec:4510`) — ⛔ **Pfad ist `zugaenge/`, nicht `codes/`** (B9) | **9** |

### Die vier Regeln, die fuer alle acht gelten

1. ⛔ **Nur serialisierbare Daten ueber die Grenze — vorformatierte Zeilen, keine Rohdaten, keine
   `Date`-Objekte** (`Spec:4536-4539`; Vorbild `lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx:7-14`).
   Der Insel-1-Typ steht in der Spec woertlich ausgeschrieben (`Spec:4542-4553`) und traegt
   `letztesUpdateText: string` — **vorformatiert**.
2. ⛔ **Server Actions duerfen als einzige ueber die Grenze — DIREKT importiert, nicht als Prop
   durchgereicht** (`Spec:4495-4497`; Vorbild `aufgaben/_ui/RoutinenTabelle.tsx:4`).
3. ⛔ **`_lib/` traegt KEIN `"use client"`** (`Spec:4305-4307`, Falle 6) — dort liegen Werte, die
   Server Components lesen. `riegel.test.ts:1064-1117` setzt das modulweit durch.
4. ⛔ **`updateStand` wandert als WORT, nicht als Farbe** (`Spec:4555-4561`, Falle 3):
   „veraltet" `color="warning"`, „aktuell" `color="success"`, „unbekannt" `default`. Rot bleibt
   allein den zerstoerenden Knoepfen (`danger` auf Loeschen).

### Und die zwei, die KEINE Insel bekommen

* **`admin/(arbeit)/page.tsx`** — `Card`, `Statistic`, `Tag` sind in einer Server Component sicher.
  Entscheidung **E-V15** haelt fest, was dafuer getan werden muss, damit es so bleibt.
* **`admin/(druck)/zugaenge/blatt/page.tsx`** — ein Bogen mit QR-Codes und Klartext, ohne
  Bedienelement. ⛔ **Wenn er eine Insel braeuchte, waere das ein Zeichen, dass etwas Interaktives
  auf dem Papier gelandet ist.**

---

## ⛔ 6.3 — was beim naiven Port still mitverschwinden wuerde. Kein Posten ohne Eigentuemer.

`Spec:5136-5286`. Dies ist der gefaehrlichste Abschnitt von Kapitel 6, weil jeder Posten **richtig
aussieht**, wenn er fehlt.

### Teil 1 — was ersatzlos verschwindet, und das ist gewollt

| Posten | Zahl / Umfang | Gewollt? | Wer faengt ihn auf |
|---|---|---|---|
| NestJS-Querschnittsdateien in `common/` | **14** Dateien / **505** Zeilen | ✅ ja | ⛔ **niemand — es gibt keine Grenze mehr.** Zwei davon sind **kein** Grenzposten: `common/middleware/request-id.middleware.ts` (Betriebs-Telemetrie) und `common/utils/string-transform.util.ts` — ⚠️ **letztere vor dem Loeschen darauf pruefen, ob Fachlogik darin steckt** |
| DTO-Dateien | **14** | ✅ ja | Ohne Grenze bleibt **ein** Schema statt drei Beschreibungen derselben Sache (Zod, DTO, Projektions-Interface) |
| Zod-Schemadateien im Kiosk-`shared` | **8** | ✅ ja | dito |
| API-Client des Kiosks (12 `api/*.ts`, 1.859 Zeilen) + `lib/queryClient.ts` | | ✅ ja | ⛔ **Nicht zu verwechseln mit `radio-admin/client/src/app/queryClient.ts`** — jener ist der der Verwaltung, und §5.7 hat ihn getrennt geprueft |
| **CORS** (`app.enableCors`, `ALLOWED_ORIGINS`) | | ✅ ja | Im Monolithen kein Cross-Origin-Aufruf mehr; die Variable verschwindet aus **jeder** Umgebung |
| Der zweite HTTP-Sprung samt Auth-Apparat (`getAuthHeader`, `client_credentials`, Token-/Discovery-Caches, `verifyApiToken`, `verifyLoanJwt`) | | ✅ ja | ⛔ **Entscheidung E-V3**: er wird **geloescht, nicht nachgebaut** |
| Der eigene HTTP-Server von `radio-admin` (`server/src/index.ts`, 56 Zeilen) | | ✅ ja | 6.7-Abschnitt **E** (Spec 2) |
| Der `RADIO_ADMIN_*`-Env-Block des Kiosks (sechs Variablen) | | ✅ ja | ⛔ **Zusage an Spec 2:** er wird beim Abstellen des Alt-Kiosks aus der Compose-Datei **entfernt, nicht auskommentiert** — „ein stehengelassener Wert auf `radio.iuk-ue.de` laesst einen versehentlich neugestarteten Alt-Container gegen die Suite laufen" |
| **`api_tokens`** (acht Spalten) | | ✅ ja, Entscheidung 13 | ⛔ **Nichts, und das ist belegt, nicht geschaetzt** (`Spec:5327-5345`): `loans` fuehrt keine Token-/Herkunftsspalte · `device_events.changed_by` speichert einen `sub`, keinen Token, und der Leih-API-Pfad schreibt ohnehin keine Geraete-Ereignisse · `api_tokens.created_by` ist eine **tote Spalte**. ⚠️ **Und: sie darf NICHT in den Paritaetscheck** — die Abfrage scheitert dort nicht mit „ungleich", sondern mit `no such table`, also mit einem Abbruch **mitten im Cutover**. Aus sechs Paritaets-Sollwerten werden **fuenf**. Eigentuemer: **Spec 2 (Runbook)**. ✅ Bestandspruefung: `api_tokens`/`apiTokens` erscheint an keiner Stelle in `src/app/m/radio/_db/schema.ts` |
| `AdminUser` aus `radio-inventar` | | ✅ ja, Entscheidung 14 | Traeger eines zweiten Identitaetssystems neben Pocket ID; die Suite fuehrt den rohen `sub` |
| **`STALE_GRACE_MS = 5 * 60_000`** | | ⚠️ **weder portieren noch stillschweigend streichen** | ⛔ **WAL + `busy_timeout = 5000`** (`src/core/db/index.ts:18`, `:20`) — bereits Teil des Suite-DB-Helfers, **kein** modul-eigener Cache, **kein** Retry. B15 (`Spec:104`) traegt. ✅ **Bereits gebaut**, samt Kommentarkopf (`_db/leihen.ts:45-56`) und den zwei WAL-Faellen (`_db/leihen.test.ts:916`, `:961`) |
| **Die optimistische Anzeige** (`useUpdateDevice.ts:15-30`) | | ✅ ja, bewusst | Server Action + `revalidatePath`. ⚠️ Der Alt-Ausschlussgrund (`softwareVersion`/`lastUpdatedAt` bewusst ausgenommen, `:20-23`) **entfaellt mit dem Verlust** — derselbe Prozess rechnet den Update-Stand waehrend der Antwort neu |
| **TanStack Query** (13 Quellen, 14 Tabellenzeilen) | | ✅ ja | ⛔ **`revalidatePath` ist fuer die Verwaltung ein VOLLSTAENDIGER Ersatz** (`Spec:4583-4593`), weil `radio-admin/client/src/app/queryClient.ts:8-9` `staleTime: 30_000` und **`refetchOnWindowFocus: false`** setzt und `refetchInterval`/`useInfiniteQuery`/`networkMode`/`gcTime` im Client **nirgends** vorkommen. Die aufwendige Frischhaltung gehoert dem **Kiosk**, nicht der Verwaltung |
| `usePersistentState` fuer sichtbare Spalten (`ra-device-columns`) | | ✅ **bleibt**, aber nur fuer Darstellung | ⛔ **Die Suchfelder NICHT** (`ra-device-search-fields`): sie gehen als `params.searchFields` an den Server (`DeviceList.tsx:70-71`) und wandern in die **Suchparameter** |
| `/login`, `/403`, `*` | | ✅ ja | Zentraler Login der Suite; ⛔ **`notFound()` statt einer eigenen 403-Seite**, damit die Existenz einer Verwaltungsroute auf falschem Host / ohne Gruppe nicht verraten wird |
| Der Reiter „Einstellungen" samt „API-Zugriff" | | ✅ ja | „Softwareversionen" wird eine eigene Route (B9); `Tabs` waere ausserdem Falle 1 |

### Teil 2 — die VIER, die still mitverschwinden WUERDEN (`Spec:5191-5285`)

| # | Posten | Gewollt? | ⛔ **Was ihn auffangen MUSS** | Status |
|---|---|---|---|---|
| **1** | **Das Fehlercode-Vokabular** — acht maschinenlesbare Codes gehen heute ueber die Grenze (`invalid_body`, `invalid_query`, `device_not_found`, `device_not_loanable`, `device_not_available`, `device_already_on_loan`, `loan_already_returned`, `loan_not_found`) | ✅ Der **Code** verschwindet, die **Unterscheidung** nicht | Die **diskriminierte Union** als Rueckgabewert der Server Action (`AusleihErgebnis`/`RueckgabeErgebnis`, Diskriminator `grund`), getragen von `_lib/meldungen.ts`. ⚠️ **Der Diskriminator ist GROEBER als das Alt-Vokabular** — drei Alt-Codes fallen auf **einen** `grund: "nicht-verfuegbar"`; was sie auseinanderhaelt, ist `betroffen[].status` und der Satz, **nicht der Typ**. ⛔ **Deshalb bleiben die drei Pruefungen im Server getrennt**, mit vier eigenen Testfaellen | ✅ **gebaut** (Planteil 3), `_lib/meldungen.ts:197-264`, vier Faelle in `_db/leihen.test.ts` |
| **2** | **Die Projektionen `toLoanDevice`/`toActiveLoan`** — „a deliberate subset, no audit/software fields" | ✅ Der Sicherheitsgrund entfaellt im selben Prozess — ⛔ **und genau deshalb wuerde der Posten still verschwinden** | Die fachliche Entscheidung „die Ausleihe zeigt **Geraet**, nicht **Geraeteakte**" muss als **Lesemodell** weiterleben. Wer `geraeteMitLeihstand` als „alle Spalten aus `devices`" baut, bekommt eine Ausleiheflaeche mit Software-Version, Audit-Spalten und `tei` — **die Quelltabelle hat 25 Spalten**. Die elf Felder aus `loanApi.ts:34-44` sind die **Obergrenze**, nicht das Ziel | ✅ **gebaut**: `GeraetMitLeihstand` fuehrt **acht** Felder (`_db/leihen.ts:93-102`); Test „reicht keine Audit- und keine Software-Spalte an die Ausleihe durch" — ⛔ **exakter Feldsatzabgleich, keine Teilmengenpruefung** |
| **3** | **Die Master-Pruefungen** — „Device existence + loanable + condition are gated HERE at the master: the kiosk is open, so the caller is not trusted" | ⛔ **NEIN — sie bleiben, sie wandern nur** | Es ist verfuehrerisch, den Wegfall der Grenze als „jetzt ist der Aufrufer ja wir selbst" zu lesen. ⛔ **Falsch:** der **anonyme Ausleiher** und sein Formular sind unveraendert unvertraut, und mit Entscheidung 4/10 ist die Flaeche **breiter** erreichbar als vorher. Geraet lesen → `loanable` → `mapDeviceCondition` bleiben die ersten Anweisungen, **in dieser Reihenfolge und je gewaehltem Geraet innerhalb der Transaktion** | ✅ **gebaut**: `bucheAusleihe` (`_db/leihen.ts:501-626`), `geraeteZustandAus` (`_lib/status.ts:177-188`), vier benannte Testfaelle |
| **4** | **`X-API-Key` neben `Authorization: Bearer`** — `extractToken` akzeptiert **beide** Koepfe; „die dokumentierte Bruchstelle jedes naiven Ports" (Analyse `:2388`, `RA-LOAN-1`) | ✅ | ⛔ **NICHTS — und das ist richtig, weil nichts es auffangen muss.** Die Grenze wird **geloescht**, nicht nachgebaut; es gibt keinen Header mehr, der geprueft werden koennte. ⚠️ **Der Posten steht in der Spec nur, damit ihn niemand als ‚noch zu portieren' wiederentdeckt** — und `E4-formatvorbild.md` hat genau das getan. Siehe **E-V3** | ✅ nichts zu tun |

### Teil 3 — der Posten, den 6.3 NICHT fuehrt und der trotzdem hierher gehoert

⛔ **Die 200er-Grenze auf den Geraeteereignissen.** `getDeviceEvents` hat im Bestand **keine**
Grenze (`radio-admin/server/src/repos/deviceRepo.ts:248-254`), und die Alt-Anwendung zeigt die
Ereignisse **nirgends** (`Spec:4754-4757`: `rg -n 'events' radio-admin/client/src` liefert **keinen**
Konsumenten). Die Spec setzt 200, neueste zuerst, ohne Blaetterung (`Spec:4767-4770`).
**Eigentuemer der Zahl: ⬜ V-L7**, abgelesen bei der Generalprobe. **Eigentuemer der Fassung:
Aufgabe V7**, die sie als benannte Konstante mit dieser Belegzeile fuehrt — ⛔ nicht als `200`
inline.

---

## ⛔ Der Suite-Admin-Kurzschluss — er hat einen eigenen Plan, und dieser Plan baut ihn NICHT

`src/core/groups.ts:125`: `if (groups.includes(suiteAdminGroup(env))) return true;`

⚠️ **Diese eine Zeile beruehrt JEDES Modul der Suite**, nicht nur `radio` — sie ist der Grund,
warum ein Suite-Admin heute ueberall Modul-Admin ist. Sie zu entfernen ist eine
**Betriebsaenderung**, keine Aufraeumarbeit, und sie hat deshalb ihre **eigene** Planung und
Abnahme:

> `docs/superpowers/plans/2026-08-24-suite-admin-kurzschluss.md`

**Was dieser Planteil davon uebernimmt: nichts. Was er daraus wissen muss: drei Dinge.**

1. ⛔ **Planteil 4 ist technisch NICHT blockiert, und das steht namentlich in jenem Plan.**
   Aufgabe **K2** („Der enge Nachweis. Laeuft auf BEIDEN Wegen, und zuerst.") hat als erklaerten
   Zweck: „belegen, dass die Spec-Auflage aus Entscheidung 9 **erfuellt** ist und **Planteil 4
   nicht blockiert**." Ihr Schritt 4 traegt den Satz als Nachtragspflicht in den Leitplan:
   „**Folge: Planteil 4 ist technisch nicht blockiert.**"
   Der Beleg dafuer liegt in **diesem** Repo: `_lib/zugang.ts:188-192` baut `istRadioAdmin` ueber
   `adminGroupsFor(getModule("radio"))` und **bewusst nicht** ueber `isModuleAdmin`/`canAdminModule`
   (`:93-97`); `riegel.test.ts:1016-1035` („findet keinen der vier core-Riegel") haelt das fest.
   `radio` erreicht dasselbe Ziel **modulintern** — wie `feedback` und `lagerbuch`.
2. ⛔ **Und die Spec schliesst den weiten Weg aus sich selbst aus.** `Spec:73-75` fuehrt unter
   „**Ausdrücklich nicht Teil dieser Spec** (eigene Suite-Posten)" auch „das Entfernen des
   Suite-Admin-Kurzschlusses in `core/groups.ts`".
   ⚠️ **Und die Schaerfe dieses Arguments ist begrenzt, das gehoert dazu:** die CWE-348-Umstellung
   steht in **derselben** Liste; unterschieden werden die beiden **nur** durch den Klammerzusatz
   „(**Voraussetzung** für das Gate, siehe Kapitel 3)" beim einen und dessen Fehlen beim anderen.
   ⛔ **Der eigentliche Beleg ist deshalb nicht der Kontrast, sondern Punkt 1** — `radio` umgeht den
   Kurzschluss modulintern, nachgewiesen an `_lib/zugang.ts:188-192` und `riegel.test.ts:1016-1035`.
3. ⛔ **Jener Plan fasst `src/app/m/radio/**` in keinem Weg und in keinem Schritt an** (er sagt es
   selbst unter „Was dieser Plan NICHT tut"). Umgekehrt gilt dasselbe: **keine Aufgabe dieses Plans
   aendert `src/core/groups.ts`.**

**Welche Aufgaben dieses Plans davon abhaengen — die ehrliche Antwort:**

| Abhaengigkeit | Aufgaben | Art |
|---|---|---|
| **Technisch (Bau, Tests, Tore)** | ⛔ **keine** | siehe Punkt 1 |
| **Betrieblich (wer nach dem Rollout tatsaechlich hineinkommt)** | **V23** und alles danach | ⛔ **Wer `radio` verwalten soll, gehoert in `SUITE_ADMIN_GROUP_RADIO` — auch der Betreiber selbst** (Analyse Pflicht 17, `Spec:682-689`). Das gilt **heute schon**, unabhaengig vom Kurzschluss-Plan, weil `radio` den Kurzschluss modulintern ohnehin ignoriert. ⬜ **V-L2** |
| **Abnahme-Beruehrung** | — | Aufgabe **K8**, Schritt **B8** jenes Plans prueft „(sobald vorhanden) `radio`" als eines von vier unberuehrten Modulen gegen. ⚠️ **Das ist eine Pruefung AN diesem Planteil, keine Voraussetzung FUER ihn** |

---

## ⛔ Der vierte Quelltext-Scan — `admin/actions.test.ts`

**Warum er ueberhaupt entsteht.** `Spec:4243` legt alle Verwaltungs-Actions nach
`src/app/m/radio/admin/actions.ts`. Der bestehende `_actions/`-Scan hat als `ORDNER`
`src/app/m/radio/_actions` (`guards.test.ts:33`) und **sieht diese Datei nicht**. `Spec:4853-4857`
benennt den Ersatz und seine Bedeutung woertlich:

> „`admin/actions.test.ts` — Quelltext-Scan, und der einzige Waechter der Aufruftabelle aus §5.4:
> ‚jede exportierte Action in `admin/actions.ts` enthaelt `requireRadioAdmin` oder
> `requireRadioVerwaltung` als erste Anweisung.' … **Dieser Test ist der einzige Waechter der
> Aufruftabelle aus §5.4 — kein anderes Gate sieht eine vergessene Zeile.**"

Und `Spec:4388-4390`, direkt darunter: „`src/core/routing.test.ts` schreibt das
Middleware-Verhalten ausdruecklich fest, Playwright faehrt gegen **einen** `baseURL`. **Eine
vergessene Stelle ist typkorrekt und lint-sauber.**"

### ⛔ Die dreiteilige Reparatur ist hier LASTTRAGEND, nicht zeremoniell

Die Kernzusicherung dieses Scans ist **negativ** (`expect(verstoesse).toEqual([])`) — genau die
Form, die der Kommentarschnitt-Fehler still schwaechte: „**weniger gefundene Verstoesse, still**".

Die drei Teile, gelesen in `src/app/m/radio/riegel.test.ts:229-336`:

| Teil | Zeile | Was sie tut — und was sie ausdruecklich NICHT mehr tut |
|---|---|---|
| `ohneKommentareUndZeichenketten` | `:229` | Leert nur noch String-/Template-Literale (`"`, `'`, `` ` ``), zeilenweise, unter Erhalt der Zeilenzahl. ⛔ **„NACHGESTELLTE KOMMENTARE SCHNEIDET SIE SEIT DEM 2026-08-23 NICHT MEHR SELBST — der Schnitt steht in `bereinigt`, HINTER dem Leeren der Regexliterale."** |
| `ohneRegexLiterale` | `:291` | Leert echte Regexliterale ueber die Vorzeichen-Heuristik `REGEX_ERLAUBT`. ⛔ **`//` ist IMMER ein Kommentarbeginn, NIE ein Literal** — die Bedingung steht explizit im Code (`z === "/" && q[i + 1] !== "/"`). „JS kennt kein leeres `//`. Ohne diese Bedingung frisst der Scanner den Kommentarbeginn … und der Schnitt in `bereinigt` findet danach nichts mehr." |
| `bereinigt` | `:334` | ⛔ **Schneidet ZULETZT:** `ohneRegexLiterale(ohneKommentareUndZeichenketten(quelle)).replace(/\/\/.*$/gm, "")`. „Zeichenketten muessen VOR den Regexliteralen geleert werden (ein `/` in `"a:/b"` saehe sonst wie ein Literalanfang aus), und Regexliterale muessen VOR dem Kommentarschnitt geleert werden (sonst haelt der Schnitt ihre zwei Schraegstriche fuer einen Kommentarbeginn)." |

⛔ **Die Reihenfolge IST der Fund.** Und der Datei-Kopfkommentar haelt zusaetzlich fest: „**KEIN
SCAN RUFT `ohneKommentareUndZeichenketten` DIREKT** — sonst kehrt der Fehler an genau dieser Stelle
zurueck."

**Entscheidung E-V13** legt fest: ⛔ **die drei Funktionen wandern in die gemeinsame Hilfsdatei
`_lib/quelltextScan.ts`, und beide Scans importieren sie von dort** — ⛔ **nicht** aus
`riegel.test.ts` (dessen Kopfkommentar `:272-274` den Import ausgeschlossen hat, und eine Sonde hat
den Schaden gemessen: die 21 Faelle wuerden ein zweites Mal registriert). ⛔ **Und
`riegel.test.ts:1208-1221` zieht im selben Commit mit** — die Begruendung steht dort.

⛔ **Und der Scan braucht seinen eigenen Selbsttest** — den Waechter ueber dem Waechter, Vorbild
`riegel.test.ts:1157` (`describe("die Bereinigung selbst — der Waechter ueber dem Waechter")`).

### Was `admin/actions.test.ts` zusichert — die vollstaendige Liste

| # | Testname | Aussage |
|---|---|---|
| 1 | „genau NEUN exportierte Actions in admin/actions.ts" | ⛔ **`toBe(9)`, nicht `>=`.** ⚠️ **Neun, nicht zehn** — `importVorschauAction` ist nach **E-V16** ein Route Handler; die benannte Abweichung von `Spec:4657` steht dort. Ueber einer leeren oder geschrumpften Menge waere alles darunter leer-gruen — dieselbe NT11-Fehlerklasse. Die Zahl steht als Konstante **oben in der Datei**, mit einem Anhebe-Fahrplan wie in `riegel.test.ts:81-95` |
| 2 | „admin/actions.ts traegt use server am Dateikopf" | Ohne die Direktive ist keine der zehn eine Action — und der Aufruf aus der Insel schluege erst zur Laufzeit fehl |
| 3 | „jede exportierte Action nennt requireRadioAdmin oder requireRadioVerwaltung als ERSTE Anweisung" | Die Kernzusicherung. ⛔ **Erste Anweisung, nicht „kommt vor"** — Vorbild `guards.test.ts` W3: „Der Kommentar versprach ‚der Riegel ist die ERSTE Anweisung', geprueft wurde nur die Reihenfolge gegen `formData.get`" |
| 4 | „der Koerper endet an der Rumpfklammer, nicht am naechsten export" | Vorbild `guards.test.ts` W1 — sonst wird eine private Hilfsfunktion dahinter, die einen Riegel ruft, der Action zugeschlagen |
| 5 | „keine andere Laufzeit-Exportform als export async function" | Vorbild `guards.test.ts` W2 — `export const x = async () => {}` ist in einer `"use server"`-Datei eine gueltige Action und waere unsichtbar. ⛔ **Verbieten, nicht pruefen.** Erlaubt bleiben nur `export type`/`export interface`, weil der Uebersetzer sie loescht |
| 6 | „die sieben Admin-Actions nennen requireRadioAdmin, die zwei uebrigen requireRadioVerwaltung" | ⛔ **Namentlich, je Action.** Die Zuordnung steht in `Spec:4655-4664`. Ein pfad- oder namensgenerischer Scan kann sie nicht erzeugen. ⛔ **Die Zahlen sind nachgezaehlt, nicht uebernommen:** `Spec:4655-4664` fuehrt **acht** `requireRadioAdmin` und **zwei** `requireRadioVerwaltung` (`geraetAendernAction`, `notizAnfuegenAction`) — ⚠️ **nicht „sechs und vier"**; mit E-V16 faellt `importVorschauAction` heraus, bleiben **sieben und zwei**. ⛔ **Zwei `toBe`, nicht eines** |
| 7 | „admin/(arbeit)/versionen/page.tsx nennt requireRadioAdmin und NICHT requireRadioVerwaltung" | ⛔ **Die namentliche Zusicherung, Auflage 2.** Siehe „Die Rechtestufe je Seite" |
| 8 | „admin/(arbeit)/zugaenge/page.tsx nennt requireRadioAdmin und NICHT requireRadioVerwaltung" | dito |
| 9 | „admin/(druck)/zugaenge/blatt/page.tsx liegt in (druck), nennt requireRadioAdmin und NICHT requireRadioVerwaltung" | Faengt eine Verschiebung nach `(arbeit)`, die den Schutz der strengen Klausel still verloere. ⛔ **Und die negative Haelfte ist hier NICHT ueberfluessig:** `personenRiegelFuer`s strenger Zweig prueft nur die **Anwesenheit** von `requireRadioAdmin(` (`riegel.test.ts:408-417`) — eine Seite mit `requireRadioVerwaltung()` als **erster** Anweisung und einem `requireRadioAdmin()` irgendwo darunter bestuende ihn |
| 10 | „genau DREI Verwaltungsseiten nennen requireRadioAdmin" | ⛔ **`toBe(3)`.** Faengt die Gegenrichtung: eine **vierte**, faelschlich angehobene Seite sperrte Updater aus einer Flaeche, die ihnen gehoert |
| 11 | „der Kommentarschnitt ueberlebt ein Regexliteral" | Der Selbsttest. Ohne ihn ist die Uebernahme der dreiteiligen Reparatur eine Behauptung |

⛔ **Aufgabe V11 legt diese Datei an, im SELBEN Commit wie die ersten Actions** — nie danach.
⚠️ **Die Faelle 7 bis 10 werden dabei angelegt, sind aber bis V19/V20/V21 ueber einer leeren
Menge.** ⛔ **Deshalb tragen sie eine Existenzpflicht mit**: „die Datei existiert" ist Teil der
Zusicherung, und **bis sie existiert, sind die Faelle als `it.todo` markiert mit dem Aufgabennamen
im Text** — nicht als gruene Faelle ueber `null`. Eine `it.todo` meldet sich in der Ausgabe; ein
leer-gruener Fall nicht.

---

## Was dieser Plan anlegt und aendert

### Neu (gruppiert, nicht einzeln aufgezaehlt)

| Gruppe | Dateien |
|---|---|
| **Rechtestufe** | `_lib/rollen.ts`, `_lib/rollen.test.ts` |
| **Lesepfade** | ⛔ **FUENF, nicht vier:** `_lib/lesepfade/geraete.ts` + Test · `_lib/lesepfade/versionen.ts` + Test · `_lib/lesepfade/ereignisse.ts` + Test · `_lib/lesepfade/ausleihen.ts` + Test · **`_lib/lesepfade/codes.ts` + Test** (V20) |
| **Fachlogik** | `_lib/updateStand.ts` + Test · `_lib/geraeteDiff.ts` + Test · `_lib/notiz.ts` + Test · **`_lib/suchparameter.ts` + Test** (V13 — ⛔ **unter `_lib/`, nicht unter `geraete/`**) |
| **Werte- und Scanmodule** | **`_lib/routen.ts`** (die Routenkarte, V4 — B3) · **`_lib/quelltextScan.ts`** (die dreiteilige Reparatur, V11 — E-V13). ⛔ **Beide ohne `"use client"` und ohne `"use server"`** |
| **CSV** | `_lib/csv/spalten.ts` · `_lib/csv/kopfzeilen.ts` · `_lib/csv/einlesen.ts` · `_lib/csv/klassifizieren.ts` · `_lib/csv/rundlauf.test.ts` · `_lib/csv/klassifizieren.test.ts` · `_lib/csv/kopfzeilen.test.ts` |
| **Actions und ihr Waechter** | `admin/actions.ts` · **`admin/actions.test.ts`** |
| **Zehn Seiten** | `admin/(arbeit)/page.tsx` · `.../geraete/page.tsx` · `.../geraete/[id]/page.tsx` · `.../geraete/[id]/ereignisse/page.tsx` · `.../ausleihen/page.tsx` · `.../software/page.tsx` · `.../import/page.tsx` · `.../versionen/page.tsx` · `.../zugaenge/page.tsx` · `admin/(druck)/zugaenge/blatt/page.tsx` |
| **Acht Inseln, mit ihren Nachbarn** | `geraete/{GeraeteTabelle,GeraeteWerkzeugleiste,SpaltenWahl,FilterSchublade,NeuGeraetModal}.tsx` · `geraete/[id]/{GeraetFormular,NotizFeld,GeraetLoeschen}.tsx` · `geraete/[id]/ereignisse/EreignisTabelle.tsx` · `ausleihen/AusleihenTabelle.tsx` · `software/UpdateSuche.tsx` · `import/ImportAssistent.tsx` · `versionen/{VersionenTabelle,NeuVersion}.tsx` · `zugaenge/CodeTabelle.tsx` |
| **Insel-Tests** (DOM, ueber `qr/_lib/test-dom.tsx`) | je Insel eine `.test.tsx` — sechs namentlich in `Spec:4864-4869`, dazu `UpdateSuche` und `CodeTabelle` |
| **Zwei Route Handler** | `admin/(arbeit)/geraete/export/route.ts` + Test (V22) · **`admin/(arbeit)/import/hochladen/route.ts` + Test** (V18 — E-V16) |
| **Ein Stylesheet** | `_ui/verwaltung.module.css` — ⛔ **eigene Klassen statt `--ant-*`-Variablen** (Falle 2, `Spec:4257`); dazu das Druckbild fuer `(druck)` |
| **e2e** | `e2e/radio-verwaltung.spec.ts` · ⛔ **`e2e/helpers/radio.ts`** (`RADIO_HOST`, `RADIO_PORT`, `radioUrl`, `FREMDER_HOST`, `fremdUrl` — Vorbild `e2e/helpers/lagerbuch.ts:28`, `:89`, `:94`). ⚠️ **Ohne sie steht nirgends, wie die e2e-Datei `radio.localtest.me` ueberhaupt erreicht** — `playwright.config.ts:65` fuehrt genau einen `baseURL`, und der zeigt auf den **Portal**-Host |

### Geaendert

| Datei | Was |
|---|---|
| `src/app/m/radio/_lib/zugang.ts` | `requireRadioVerwaltung`, `istRadioUpdater`, der gemeinsame Helfer `riegelAufStufe`, `merkeNutzer` (NS-Z7) |
| `src/app/m/radio/_lib/zugang.test.ts` | die neuen Faelle **plus** die **Verhaltensfaelle**, die `riegel.test.ts:770-772` ausdruecklich an Planteil 4 adressiert (Vorbild `lagerbuch/_lib/zugang.test.ts:41`, `:72`, Begruendung `:60-71`) |
| `src/app/m/radio/riegel.test.ts` | ⛔ **nur DREI Sorten Aenderung:** die Zaehlkonstanten (`ADMIN_SEITEN_ANZAHL` zehnmal um eins, `HANDLER_ANZAHL` einmal) und die Klausel-(d)-Zusicherungen, die auf `riegelAufStufe` umziehen (NS-A7). ⛔ **Keine Klausel wird aufgeweicht.** Und **drittens** (V11, E-V13): die drei Bereinigungsfunktionen **wandern nach `_lib/quelltextScan.ts`** und werden von dort importiert — ⛔ **dabei zieht der Fall `riegel.test.ts:1208-1221** („kein Scan dieser Datei liest die ungeschuetzte Fassung direkt", `toBe(2)`) **im selben Commit auf die neue Datei um**, sonst ist er rot |
| `src/app/m/radio/_lib/nav.ts` | `RADIO_NAV` → `radioNav(stufe: RadioRolle)`, sieben Eintraege, drei nur fuer die Admin-Stufe |
| `src/app/m/radio/_lib/routen.test.ts` | ⛔ **bezieht die zwei Pfadlisten aus dem neuen `_lib/routen.ts`** (B3) — ⛔ **die zwei Vollzaehligkeits-Faelle bleiben, mit `toBe`**; in **V18** waechst `VERWALTUNGS_PFADE` um `/admin/import/hochladen` (E-V16) |
| `src/app/m/radio/admin/(arbeit)/layout.tsx` | `requireRadioAdmin()` → **`requireRadioVerwaltung()`** und `nav={RADIO_NAV}` → `nav={radioNav(rolle)}` — ⛔ **beide Haelften, NS-Z9** |
| `src/app/m/radio/_db/leihen.ts` | ⛔ **die sechste Funktion `leihhistorie`, in DERSELBEN Datei** (NS-A1) |
| `src/app/m/radio/_db/leihen.test.ts` | ihre Faelle |
| `src/app/m/radio/_ui/ikonen.tsx` (+ Test) | die zusaetzlichen Zeichen der Verwaltung (E-V7) |
| `src/core/shell/types.ts` | `NavIkonName` um `ausleihen`, `update`, `versionen` (`Spec:4218-4232`) |
| `src/core/shell/navIkonen.tsx` | die drei Eintraege in `NAV_IKONEN` — typerzwungen ueber `Record<NavIkonName, IconType>` |
| `src/core/shell/navIkonen.test.tsx` | waechst **nur** um `radioNav` in seiner bestehenden Pruefung (`Spec:4218-4232`: „**kein** eigener Test dafuer noetig") |
| `.env.example` | ⛔ **`SUITE_UPDATER_GROUP_RADIO` — sie fehlt heute, gemessen.** Auskommentiert, mit ⬜ V-L1 daneben |

### Nicht angefasst — mit Begruendung je Nicht-Beruehrung

| Was | Warum nicht |
|---|---|
| `/Users/rubeen/dev/personal/drk/radio-admin/**` und `radio-inventar/**` | ⛔ **Entscheidung E-V3.** Die sechs `/v1`-Routen fallen mit 6.7-Abschnitt **D**, nicht hier. Ein Eingriff jetzt trennte Master und Schreiber |
| `src/core/groups.ts` | ⛔ Eigener Plan, eigene Abnahme. `radio` ignoriert den Kurzschluss ohnehin modulintern |
| `src/core/ratelimit.ts` | Bereits umgestellt (`7d71b6c`) und fuer `/admin` gegenstandslos (`Spec:4922-4925`) |
| `src/app/m/radio/_db/migrations/` | ⛔ **Migrationen sind append-only.** Alle Tabellen und Spalten stehen; eine ueberfluessige Migration ist eine **Absturzschleife im Container** — das hat in `radio-admin` einmal die Produktion lahmgelegt |
| `src/app/m/radio/_actions/guards.test.ts` — `ACTION_DATEIEN_ANZAHL = 4`, `ACTION_DEKLARATIONEN_ANZAHL = 9`, `AUSNAHMEN` (drei) | ⛔ **Keine der drei Zahlen aendert sich.** Sein `ORDNER` ist `_actions/` (`:32`), `admin/actions.ts` liegt woanders. ⛔ **Und eine VIERTE Ausnahme ist ein roter Test, keine Zeile im Diff** (`:513`) |
| `src/app/m/radio/_lib/bauform.test.ts` | Er prueft die **drei Gate-Flaechen** (`:412`) und die Zusagen der Ausleihe (`:520`). Die Verwaltung faellt nicht in seinen Zuschnitt |
| `riegel.test.ts`s `AUSLEIH_FLAECHEN_ANZAHL = 5` und `ADMIN_LAYOUTS_MINDESTENS = 2` | NS-A4 und `riegel.test.ts:96-99`. Dieser Planteil legt **keine** Flaeche ausserhalb `admin/` an und **kein** drittes Verwaltungs-Layout |
| `src/app/m/radio/_lib/status.ts`, `_lib/filter.ts` | NS-A8b: die Verwaltung **benutzt** sie mit, ⛔ **definiert aber keine zweiten Statusfarben und kein zweites Ikonenmodul** |
| `src/app/m/radio/_lib/boot.ts` | `radioBootFehler()` samt der **sechsten** Boot-Pruefung fuer `SUITE_UPDATER_GROUP_RADIO` gehoert **Planteil 5** (B8, `Spec:97`, Kapitel 7 §7.3) |
| `src/app/m/radio/_ui/AusleihRahmen.tsx` | Der `/admin`-Link haengt am **Praedikat** `istRadioAdmin`, nicht am Riegel (NS-A9, NS-Z6). ⛔ **Er bleibt an `istRadioAdmin`, nicht an der neuen Verwaltungsstufe** — eine Updater-Person sieht den Verwaltungsweg auf der Ausleiheflaeche nicht. ⬜ Ob sie ihn sehen soll, ist eine Betreiberfrage, kein Bauposten |
| `src/app/m/portal/_lib/neuigkeiten/**` | ⛔ **Keine Release-Notiz in diesem Planteil.** `datum` ist der Tag des **Rollouts**, und der ist 6.7-D. ⬜ V-L10 |
| `playwright.config.ts` | ⛔ **Er braucht keine Aenderung — gemessen.** Der Fremd-Host-Fall laeuft ueber eine **absolute** URL (`page.request.get(fremdUrl(...))`), wie `e2e/lagerbuch-hosts.spec.ts:151-152` ihn heute mit demselben **einen** `baseURL` faehrt. ⬜ V-L4 ist damit **gestrichen** |
| `docs/runbooks/radio-cutover.md` | 6.7-D und -E, Spec 2 |

---

## Reihenfolge der Aufgaben

| Block | Aufgabe | Titel | Zaehler |
|---|---|---|---|
| **V-A** | **V1** | `leihhistorie` — die sechste Ersatzfunktion schliesst 6.7-Abschnitt B | — |
| **V-B** | **V2** | `_lib/rollen.ts` — die zweite Gruppe, der Feldriegel, die geschlossene Vorgabe | — |
| | **V3** | `requireRadioVerwaltung`, `istRadioUpdater`, `merkeNutzer` — und der Layout-Wechsel | Klausel (d) zieht um |
| | **V4** | `radioNav(stufe)` — sieben Eintraege, drei nur fuer Admin, drei neue Zeichen | — |
| **V-C** | **V5** | `_lib/updateStand.ts` und `_lib/lesepfade/versionen.ts` | — |
| | **V6** | `_lib/lesepfade/geraete.ts` — Liste, Detail, Kennzahlen, Vorschlaege, **und der Kopplungsfall** | — |
| | **V7** | `_lib/lesepfade/ereignisse.ts` und `_lib/lesepfade/ausleihen.ts` | — |
| | **V8** | `_lib/geraeteDiff.ts` und `_lib/notiz.ts` | — |
| | **V9** | `_lib/csv/` — vier Dateien, der Rundlauf-Vertrag, die fuenf Klassen | — |
| **V-D** | **V10** | `admin/actions.ts` — die **neun** Server Actions (E-V16) | — |
| | **V11** | `admin/actions.test.ts` — der vierte Scan, mit der dreiteiligen Reparatur | — |
| **V-E** | **V12** | `/admin` — die Uebersicht, ohne Insel | `ADMIN_SEITEN_ANZAHL` 0 → **1** |
| | **V13** | `/admin/geraete` — Insel 1, der teuerste Posten | 1 → **2** |
| | **V14** | `/admin/geraete/[id]` — Insel 6, plus Notiz und Loeschen | 2 → **3** |
| | **V15** | `/admin/geraete/[id]/ereignisse` — Insel 5, neu ohne Vorbild | 3 → **4** |
| | **V16** | `/admin/ausleihen` — Insel 2, der erste Verbraucher von `leihhistorie` | 4 → **5** |
| | **V17** | `/admin/software` — Insel 7, der Update-Modus | 5 → **6** |
| | **V18** | `/admin/import` — Insel 4, der zweiphasige Assistent, **und der Hochladen-Handler** | 6 → **7** · `HANDLER_ANZAHL` 2 → **3** |
| | **V19** | `/admin/versionen` — Insel 3, ⛔ **erste Seite auf der Admin-Stufe** | 7 → **8** |
| | **V20** | `/admin/zugaenge` — Insel 8, ⛔ **zweite Seite auf der Admin-Stufe** | 8 → **9** |
| | **V21** | `/admin/zugaenge/blatt` — das Druckblatt, ohne Insel | 9 → **10** |
| **V-F** | **V22** | `admin/(arbeit)/geraete/export/route.ts` — der Export-Handler, nicht-werfend, 404 | `HANDLER_ANZAHL` 3 → **4** |
| **V-G** | **V23** | Der Abschluss — Build, Playwright, und das Ablesen von ⬜ V-L3 | — |

**Warum diese Reihenfolge, in fuenf Saetzen:**

1. **V1 zuerst**, weil 6.7 Abschnitt B **alle sechs** verlangt und C ohne B nicht abgeschlossen
   werden kann — und weil `/admin/ausleihen` (V16) der einzige Verbraucher ist.
2. **V2–V4 vor jeder Seite**, weil jede der zehn Seiten eine **Rechtestufe als erste Anweisung**
   traegt und das `(arbeit)`-Layout bis dahin jede Updater-Person aussperrt, still gruen.
3. **V5–V9 vor den Flaechen**, weil 6.7-C „rufen **ausschliesslich** die internen Pfade" verlangt —
   eine Flaeche ohne Lesepfad greift zur naechstbesten Loesung, und der C-Abnahmebefehl faengt das
   **nicht**.
4. **V10/V11 vor den Flaechen**, weil die Inseln ihre Actions **direkt importieren** und weil
   `admin/actions.test.ts` „der einzige Waechter der Aufruftabelle" ist — er muss mit der ersten
   Action da sein, nie danach.
5. **V22 nach den Seiten**, weil der Handler die **Ausnahme** von der Riegelregel ist (B11: nicht
   werfend, eigene 404) — eine Ausnahme baut man, wenn die Regel steht, sonst wird sie zur Vorlage.
   **V23 zuletzt und einmal**, weil `pnpm build` einen Testlauf verdirbt und weil nur ein echter
   Abruf ⬜ V-L3 beantwortet.

---

## Aufgabe V1: `leihhistorie` — die sechste Ersatzfunktion schliesst 6.7-Abschnitt B

**Files:** Modify `src/app/m/radio/_db/leihen.ts`, `src/app/m/radio/_db/leihen.test.ts`

**Interfaces:**
- Produces: `leihhistorie(db, f: LeihhistorieFilter): LeihhistorieSeite`, `LeihhistorieFilter`,
  `LeihhistorieSeite`, `LeihZeile` — gelesen von **V7** (`_lib/lesepfade/ausleihen.ts`) und ueber
  ihn von **V16**.

⛔ **In DERSELBEN Datei, keine zweite** (NS-A1). Der Bestandskommentar benennt sie und diesen
Planteil namentlich: „**DIE SECHSTE FUNKTION `leihhistorie` STEHT HIER NICHT.** Sie speist
ausschliesslich die Verwaltungsansicht `/admin/ausleihen` (Spec:5024) und gehoert Planteil 4"
(`_db/leihen.ts:41-43`). ⛔ **Dieser Kommentar wird beim Einbau ERSETZT, nicht stehen gelassen** —
sonst behauptet die Datei weiterhin, die Funktion fehle.

⛔ **DIE PROSA-SPERRE.** `_db/leihen.test.ts` scannt den **rohen** Dateitext dieser Datei. ⛔ **Der
Name der Alt-Umgebungsvariablen und jeder Alt-Routenpfad duerfen hier NIRGENDS stehen — auch nicht
im Kommentar, auch nicht in Prosa.** Gemessen beim ersten Lauf der Vorgaengeraufgabe: `1 failed |
25 passed`, allein an einem Kommentar (`_db/leihen.ts:57-64`). **Schreib „der Alt-Master" oder „der
sechste Alt-Lesepfad", nicht den Pfad.**

### `leihhistorie` — der volle Vertrag (Entscheidung **E-V10**, §6.1, `Spec:5024`)

```ts
/** Grenzen auf `borrowedAt`. ⛔ `Date`, nicht `number` — die Spalte ist mode:"timestamp". */
export type LeihhistorieFilter = {
  geraeteId?: string;
  von?: Date;
  bis?: Date;
  seite: number;          // 1-basiert, Vorgabe 1
  seitenGroesse: number;  // Vorgabe 25, Deckel 1000
};

export type LeihZeile = {
  id: string;
  rufname: string;              // snapshotCallSign — der Schnappschuss, nicht `devices`
  geraetetyp: string | null;    // snapshotDeviceType
  entleiher: string;
  ausgeliehenText: string;      // ⛔ vorformatiert
  zurueckText: string;          // ⛔ vorformatiert; leer -> "—"
  aktiv: boolean;               // ⛔ returnedAt === null
  notiz: string | null;
};

export type LeihhistorieSeite = {
  zeilen: LeihZeile[];
  gesamt: number;
  seite: number;
  seitenGroesse: number;
};

export function leihhistorie(db: DB, f: LeihhistorieFilter): LeihhistorieSeite;
```

**Die gemessene 1:1-Vorlage** (`radio-admin/server/src/repos/loanRepo.ts:137-160`,
Schema `radio-admin/shared/src/loan.ts:93-99`):

| Was | Wert | Beleg |
|---|---|---|
| `geraeteId` | optional, `eq(loans.deviceId, …)` | `loanRepo.ts:139` |
| `von`/`bis` | optional, `gte`/`lte` auf **`borrowedAt`** — ⛔ nicht auf `returnedAt` | `loanRepo.ts:140-141` |
| Sortierung | ⛔ **`desc(loans.borrowedAt)`, IMMER, kein Parameter** | `loanRepo.ts:153` |
| Fenster | **aktiv UND zurueckgegeben** | `loanRepo.ts:136` |
| `seite` | Vorgabe **1**, min 1 | `loan.ts:97` |
| `seitenGroesse` | Vorgabe **25**, min 1, **max 1000** | `loan.ts:98`; Begruendung woertlich `loan.ts:89-91` |
| Rueckgabe | `{ rows, total, page, pageSize }` | `loanRepo.ts:159` |
| ⛔ **Lesen purgt nicht** | die Retention ist ein **Job** | `_lib/boot.ts:62` (`raeumeLeihhistorie`) |

⛔ **`rufname` und `geraetetyp` kommen aus dem SCHNAPPSCHUSS, nicht aus `devices`.** Der
Schema-Kommentar sagt warum (`_db/schema.ts:196-202`): „Die historische Richtigkeit traegt der
unveraenderliche Anzeige-Schnappschuss, der beim Ausleihen kopiert wird, **nicht ein lebender
Join**. Ein zusaetzlicher FK waere gueltiges Drizzle, gueltiges SQL und **PARITAETSGRUEN**; der
Schaden entstuende Monate spaeter, bei der ersten Geraeteausmusterung." Dieselbe Haltung wie bei
`offeneAusleihen` (`_db/leihen.ts:333`).

⛔ **`ausgeliehenText`/`zurueckText` sind FERTIGE Zeichenketten**, gebaut mit `datumMitUhrzeit`
(`_lib/anzeige.ts:75`). Was an einer Uhr haengt, entsteht auf dem **Server** — sonst entscheiden
Server und Client an der Tagesgrenze verschieden, und zwar systematisch gegen die Zone des
Endgeraets.

| Testname | Aussage |
|---|---|
| „liefert aktive und zurueckgegebene Leihen in einer Seite" | Das Fenster, 1:1 (`loanRepo.ts:136`). ⛔ Der Fall braucht **beide** Sorten in der Fixture, sonst ist er ueber einer einseitigen Menge gruen |
| „sortiert neueste Ausleihe zuerst" | `desc(borrowedAt)`. Fixture mit **drei** Zeilen in **verwuerfelter** Einfuegereihenfolge |
| „filtert auf eine Geraete-Id" | `eq(loans.deviceId, …)`; die Fixture fuehrt zwei Geraete |
| „filtert auf ein Zeitfenster ueber borrowedAt, nicht ueber returnedAt" | ⛔ **Der Fall, der die haeufigste Verwechslung faengt:** eine Leihe, deren `borrowedAt` **ausserhalb** und deren `returnedAt` **innerhalb** des Fensters liegt, faellt **heraus** |
| „gesamt zaehlt ueber die gefilterte Menge, nicht ueber die Seite" | `count()` mit demselben `where` (`loanRepo.ts:146`); Fixture mit mehr Zeilen als `seitenGroesse` |
| „seitenGroesse ueber 1000 wird auf 1000 gedeckelt" | `loan.ts:98`. ⛔ **Der Deckel steht SERVERSEITIG**, nicht im Aufrufer |
| „seitenGroesse unter 1 und seite unter 1 werden auf 1 gehoben" | `loan.ts:97-98` (`min(1)`) |
| „aktiv ist genau returnedAt === null" | 1:1 aus `LoanList.tsx:11-13`. ⛔ **Je Zustand eine Zeile** |
| „rufname kommt aus dem Schnappschuss, nicht aus devices" | ⛔ **Der Fall braucht ein `devices`-Objekt mit ABWEICHENDEM Rufnamen** — sonst beweist er nichts |
| „zurueckText ist ein Gedankenstrich, solange nicht zurueckgegeben" | Leerwert-Darstellung, 1:1 aus `LoanList.tsx:34` (`formatTimestamp(null)`) |
| „liefert keine Zeile ausserhalb der acht Felder von LeihZeile" | ⛔ **Exakter Feldsatzabgleich, keine Teilmengenpruefung** — dieselbe Form wie der Lesemodell-Fall bei `geraeteMitLeihstand` (6.3 Posten 2) |

- [ ] **Schritt 1** — Testfaelle schreiben, alle rot.
- [ ] **Schritt 2** — Sonden: **S-V1a**: die Sortierung auf `asc` drehen → „sortiert neueste
      Ausleihe zuerst" rot. **S-V1b**: `gte`/`lte` von `borrowedAt` auf `returnedAt` umhaengen →
      „filtert auf ein Zeitfenster ueber borrowedAt" rot. **S-V1c**: den Deckel 1000 entfernen →
      „seitenGroesse ueber 1000" rot. **S-V1d**: `rufname` aus `devices` statt aus dem
      Schnappschuss lesen → der Schnappschuss-Fall rot.
- [ ] **Schritt 3** — `leihhistorie` bauen, **unter** den fuenf bestehenden Funktionen, in
      derselben Datei. Den Bestandskommentar `:41-43` **ersetzen** durch einen, der sagt, dass sie
      jetzt hier steht, mit `Spec:5024` und dieser Aufgabennummer.
- [ ] **Schritt 4** — Tor. ⛔ **Zusaetzlich:** `rtk pnpm vitest run src/app/m/radio/_db/leihen.test.ts`
      — der **Prosa-Scan** dieser Datei muss gruen bleiben.

```bash
rtk git add src/app/m/radio/_db/leihen.ts src/app/m/radio/_db/leihen.test.ts
rtk git commit -m "feat(radio): leihhistorie — die sechste Ersatzfunktion, Abschnitt B ist zu"
```

---

## Aufgabe V2: `_lib/rollen.ts` — die zweite Gruppe, der Feldriegel, die geschlossene Vorgabe

**Files:** Create `src/app/m/radio/_lib/rollen.ts`, `src/app/m/radio/_lib/rollen.test.ts` ·
Modify `.env.example`

**Interfaces:**
- Produces: `RadioRolle`, `UPDATER_FELDER`, `filterSchreibbareFelder` — gelesen von **V3**
  (`_lib/zugang.ts`), **V4** (`_lib/nav.ts`), **V9** (der Import-Klassifikator), **V10**
  (`admin/actions.ts`) und **V14** (Insel 6, als Prop-Typ **und** als Wert).

⚠️ **Namensdivergenz, benannt statt still:** `Spec:4290` (der Verzeichnisbaum) schreibt den Traeger
als `RADIO_ROLLE`. ⛔ **Verbindlich ist die Typform `RadioRolle`** — so fuehren ihn `Spec:4203`
(`radioNav(stufe: RadioRolle)`), `Spec:4353` (`Promise<{ viewer: Viewer; rolle: RadioRolle }>`) und
`Spec:4508`. `Spec:4290` ist die **einzige** abweichende Stelle.

⛔ **KEIN `"use client"`** (Falle 6). Diese Datei exportiert **Werte**, die Server Components lesen
— `riegel.test.ts:1064-1117` setzt das modulweit durch.

### ⛔ Die Datei ist REIN — die Gruppenquelle liegt NICHT hier, sondern in `_lib/zugang.ts` (V3)

⚠️ **Hier stand bis zur Kritikrunde ein Fehler, den kein Tor faengt.** `_lib/rollen.ts` sollte
gleichzeitig `process.env.SUITE_UPDATER_GROUP_RADIO` lesen **und** `UPDATER_FELDER` an die
`"use client"`-Insel 6 liefern (V14, `lockedFor`). ⛔ **Beides zusammen geht nicht:** ein Wertimport
aus dieser Datei zieht sie in das Client-Bundle, und dort ist eine Variable **ohne**
`NEXT_PUBLIC_`-Praefix schlicht nicht gesetzt — `istInUpdaterGruppe` gaebe **still `false`** zurueck.
Der Fehler ist typkorrekt, lint-sauber und fuer `build` unsichtbar. Dieselbe Bruchstelle, aus der
Gegenrichtung beschrieben, steht im Bestand: `src/core/shell/types.ts:10-15`.

⛔ **Entscheidung: der Schnitt folgt dem Spec-Verzeichnisbaum, der ihn ohnehin so zieht.**

| Was | Wohin | Beleg |
|---|---|---|
| `RadioRolle`, `UPDATER_FELDER`, `filterSchreibbareFelder` | ⛔ **`_lib/rollen.ts`** — rein, **beidseitig** lesbar, kein `process.env` | `Spec:4290` fuehrt genau diese drei dort |
| `updaterGruppe()`, `istInUpdaterGruppe(groups)` | ⛔ **`_lib/zugang.ts` (V3)** — ausschliesslich serverseitig gelesen, neben `istRadioAdmin` | `Spec:4287-4288` legt `istRadioUpdater` dorthin; die Gruppenquelle gehoert zum selben Riegel |

⛔ **Und die Trennung bekommt einen Quelltext-Scan, sonst kehrt sie beim naechsten Aufraeumen
zurueck:** `_lib/rollen.test.ts` prueft, dass `_lib/rollen.ts` die Zeichenkette `process.env`
**nicht** enthaelt.

⛔ **Der Scan liest den ROHEN Dateitext — und das ist Absicht, keine Nachlaessigkeit.** Er koennte
ueber `bereinigt` laufen, aber `_lib/quelltextScan.ts` entsteht erst in **V11** (E-V13); ein Import
hier waere genau der Vorwaerts-Zirkel, den dieser Planteil bei V5/V6 gerade aufgeloest hat —
`typecheck` faellt auf dem Import, neun Aufgaben lang. Und eine **vierte Kopie** der dreiteiligen
Reparatur ist verboten (Verbotsliste, E-V13).

⛔ **Der Preis ist eine PROSA-SPERRE auf dieser einen Datei, und sie steht in ihrem Kopfkommentar:
der Name `process.env` darf in `_lib/rollen.ts` NIRGENDS stehen — auch nicht im Kommentar.** Wer
erklaeren will, wo die Gruppenquelle liegt, schreibt „die Gruppenquelle liegt in `_lib/zugang.ts`"
und nennt den Bezeichner nicht. ⚠️ **Dieselbe Bauform fuehrt der Bestand bereits** und hat sie
gemessen: `_db/leihen.test.ts` scannt den rohen Text von `_db/leihen.ts`, und ein einziger Kommentar
faerbte ihn rot (`1 failed | 25 passed`, `_db/leihen.ts:57-64`). ⛔ **Die strengere Richtung ist hier
die sichere** — der Scan meldet lieber einmal zu viel als eine stille Wiedervereinigung.

`Spec:4415-4425` bleibt der Grund fuer den eigenstaendigen Mechanismus: die Registry kennt je Modul
**nur zwei** Ueberschreibungen (`SUITE_HOST_<KEY>`, `SUITE_ADMIN_GROUP_<KEY>`, `CLAUDE.md:139-140`)
— **eine zweite Gruppe ist dort nicht vorgesehen.**

```ts
// _lib/rollen.ts — REIN, kein process.env, kein "use client", kein "use server"
export type RadioRolle = "admin" | "updater";

/** ⛔ 1:1 aus radio-admin/shared/src/editable-fields.ts:3 — Reihenfolge und Woerter unveraendert. */
export const UPDATER_FELDER = ["softwareVersion", "lastUpdatedAt", "status"] as const;

/** ⛔ Verwirft still, lehnt nicht ab. 1:1 aus editable-fields.ts:5-18. */
export function filterSchreibbareFelder<T extends Record<string, unknown>>(
  rolle: RadioRolle,
  patch: T,
): Partial<T>;
```

```ts
// _lib/zugang.ts (V3) — serverseitig, neben istRadioAdmin
/** ⬜ V-L1 — der echte Wert steht beim Betreiber, faellig vor Cut 26. */
export function updaterGruppe(): string | null;
export function istInUpdaterGruppe(groups: string[]): boolean;
```

⛔ **Ein leerer oder fehlender Wert SCHLIESST die Stufe, er oeffnet sie nicht** (`Spec:4420-4422`).
Das ist dieselbe Richtung wie Pflicht 17 der Analyse: „`.some()` und **NICHT** `canAccess`, weil
`canAccess` bei leerer Liste mit `true` aussteigt … eine leere Admin-Liste muss **nichts**
gewaehren, sonst ist die Verwaltung fuer jeden Eingeloggten offen, und **der Fehler ist still**."

⚠️ **Und die Gegenrichtung ist die dokumentierte Falle 23:** eine **leer gesetzte**
`SUITE_ADMIN_GROUP_RADIO` ist eine **gueltige Aussage** und wird **nicht gemeldet** — in
Verbindung mit der `.some()`-Regel sperrt das die Verwaltung fuer **alle** aus, „inklusive
Betreiber". ⛔ **Fuer die Updater-Stufe ist genau das die richtige Vorgabe** (niemand ist Updater),
fuer die Admin-Stufe waere es eine stille Aussperrung. **Die zwei Faelle stehen namentlich
nebeneinander im Kommentar.**

### `filterSchreibbareFelder`, 1:1 (`radio-admin/shared/src/editable-fields.ts:5-18`)

* `rolle === "admin"` → **flache Kopie des ganzen Patches** (`{ ...patch }`), keine Filterung.
* sonst → nur Schluessel aus `UPDATER_FELDER`, ⛔ **verworfen, nicht abgelehnt**.
* ⛔ **Iteriert `Object.keys(patch)`, nicht `UPDATER_FELDER`** — ein Feld, das im Patch fehlt,
  darf nicht als `undefined` erscheinen, sonst schreibt `diffGeraet` es faelschlich (dessen
  `undefined`-Ausstieg faengt es zwar, `diff-device.ts:18` — aber sich darauf zu verlassen waere
  eine Kopplung ueber zwei Dateien).

| Testname | Aussage |
|---|---|
| „admin behaelt jedes Feld des Patches" | Der `{ ...patch }`-Zweig. Fixture mit **fuenf** Feldern, davon zwei ausserhalb der Allowlist |
| „updater: fremde Felder werden verworfen, erlaubte bleiben" | ⛔ **MIT JE FELD UNTERSCHIEDLICHEN WERTEN** (`Spec:4843-4844` — §5.13, das Testkapitel; zweitgenannt `Spec:4439-4440` in §5.5. ⚠️ `Spec:4367-4368` sind die zwei **Layout**-Zeilen der Aufruftabelle und tragen die Aussage NICHT) — sonst besteht eine **Vertauschung** den Test |
| „updater: ein fehlendes erlaubtes Feld erscheint NICHT als undefined" | Der `Object.keys`-Zweig, s. o. |
| „updater: das Ergebnis enthaelt genau die erlaubten Schluessel des Patches" | ⛔ **Exakter Schluesselsatz**, nicht `toMatchObject` |
| „`_lib/rollen.ts` nennt `process.env` nicht" | ⛔ **Der Scan, der die Trennung haelt.** ⛔ **Ueber den ROHEN Dateitext** — `_lib/quelltextScan.ts` gibt es in V2 noch nicht (es entsteht in V11), und eine vierte Kopie der Bereinigung ist verboten. ⛔ **Folge: eine Prosa-Sperre auf `_lib/rollen.ts`**, Vorbild `_db/leihen.ts:57-64` — siehe oben |

⚠️ **Die vier Faelle zur Gruppenquelle** („fehlendes / leeres / nur-Leerraum `SUITE_UPDATER_GROUP_RADIO`
schliesst die Stufe" und „der Vergleich ist zeichengleich, nicht case-insensitiv") ⛔ **liegen jetzt
in `_lib/zugang.test.ts`, Aufgabe V3** — dort, wo `updaterGruppe()` und `istInUpdaterGruppe()`
stehen. ⚠️ **Benannte Abweichung von `Spec:4843-4845`**, das sie unter `_lib/rollen.test.ts` fuehrt:
die Datei folgt der Funktion, und die Funktion folgt der Client/Server-Grenze.
| „UPDATER_FELDER traegt genau die drei Namen des Bestands, in dieser Reihenfolge" | ⛔ **`toEqual`, nicht `toContain`.** Beleg am Fall: `radio-admin/shared/src/editable-fields.ts:3` |

- [ ] **Schritt 1** — Testfaelle, alle rot.
- [ ] **Schritt 2** — Sonden: **S-V2a**: `filterSchreibbareFelder` fuer `"updater"` auf
      `{ ...patch }` stellen → „fremde Felder werden verworfen" rot. **S-V2b**: ⛔ **`process.env.SUITE_UPDATER_GROUP_RADIO` testweise wieder in `_lib/rollen.ts`
      lesen** → der Trennungs-Scan rot. **S-V2c**: zwei Werte in der
      Feldliste-Fixture gleich setzen → der Vertauschungsfall wird **gruen**, obwohl er es nicht
      sein duerfte ⛔ **das ist eine Sonde auf den TEST, nicht auf den Code** — sie belegt, warum
      „je Feld unterschiedliche Werte" eine Auflage ist. **S-V2d**: ⛔ **entfaellt hier** — er gehoert mit dem `trim()` nach **V3** (S-V3e).
- [ ] **Schritt 3** — `_lib/rollen.ts` bauen. ⛔ **Kein `"use client"`, kein `"use server"`, und
      ⛔ KEIN `process.env`** — die Gruppenquelle baut **V3**.
- [ ] **Schritt 4** — `.env.example`: `# SUITE_UPDATER_GROUP_RADIO=` **auskommentiert**, direkt
      unter `SUITE_ADMIN_GROUP_RADIO` (`.env.example:96`), mit drei Zeilen Kommentar: was sie tut,
      dass **leer die Stufe schliesst**, und ⬜ **V-L1** mit Adressat und Frist (Betreiber, vor
      Cut 26). ⛔ **Kein erratener echter Gruppenname.**
- [ ] **Schritt 5** — Tor.

```bash
rtk git add src/app/m/radio/_lib/rollen.ts src/app/m/radio/_lib/rollen.test.ts .env.example
rtk git commit -m "feat(radio): die zweite Rechtestufe — Gruppenquelle und Feldriegel"
```

---

## Aufgabe V3: `requireRadioVerwaltung`, `istRadioUpdater`, `merkeNutzer` — und der Layout-Wechsel

**Files:** Modify `src/app/m/radio/_lib/zugang.ts`, `src/app/m/radio/_lib/zugang.test.ts`,
`src/app/m/radio/riegel.test.ts`, `src/app/m/radio/admin/(arbeit)/layout.tsx`

**Files:** ⛔ **zusaetzlich** `src/app/m/radio/_db/client.ts` (nur gelesen, nicht geaendert — `getDb`
fuer `merkeNutzer`).

**Interfaces:**
- Produces: `requireRadioVerwaltung(): Promise<{ viewer; rolle }>`, `istRadioUpdater(viewer)`,
  ⛔ **`merkeNutzer(db, viewer)`**, ⛔ **`updaterGruppe()`** und ⛔ **`istInUpdaterGruppe(groups)`**
  (aus V2 hierher gezogen, siehe dort), der private Helfer `riegelAufStufe` — gelesen von **allen
  zehn Seiten**, von **V10** und von **V4** (`radioNav`).
- Consumes: `RadioRolle` aus **V2**.

⛔ **DAS IST DIE AUFGABE MIT DEM GROESSTEN STILLEN SCHADENSPOTENTIAL DIESES PLANTEILS.** Drei
Dinge muessen zusammen richtig sein, und **zwei davon sieht kein Tor**.

### 1. Die zwei Funktionen (Entscheidung **E-V1**, `Spec:4287-4288`, `Spec:4339-4356`)

Die Form steht in **E-V1** ausgeschrieben. Drei Auflagen darueber hinaus:

* ⛔ **Die zweite Stufe kommt als ZWEITE FUNKTION, nie als `||` in `istRadioAdmin`**
  (`_lib/zugang.ts:153-155`, `:161-175`). `admin` bleibt strikt strenger als `updater` — 1:1 aus
  `radio-admin/shared/src/role.ts:7-8`, wo `admin` bei Ueberschneidung gewinnt, **weil die
  Pruefung zuerst steht**.
* ⛔ **`requireRadioVerwaltung` liefert die Stufe MIT** (`Spec:4351-4353`), sonst muesste jede
  Seite sie ein zweites Mal ableiten — und die zweite Ableitung ist die, die auseinanderlaeuft.
* ⛔ **`istRadioUpdater` ist ein Praedikat und ruft `requireRadioHost` NICHT** — dieselbe
  Gegenregel wie bei `viewerOderNull` (`_lib/zugang.ts:86-90`, §1.4.4).

### 2. `merkeNutzer` — NS-Z7, und ohne sie rendert jede Ereigniszeile eine nackte UUID

`Spec:4358-4360`: „`merkeNutzer` steht **nach** dem Riegel, keine Kuer — sechs Audit-Spalten
speichern den `sub`, aufgeloest ueber `users`; ohne diese Zeile rendert jede Ereigniszeile eine
nackte UUID."

⛔ **Der Termin ist genau hier**, weil **V15** (`/admin/geraete/[id]/ereignisse`) die erste Flaeche
ist, die `geraete_ereignisse` liest, und weil V15 die Zeile nicht mehr nachtragen kann, ohne den
Riegel anzufassen.

⛔ **Die Zeile steht NACH `istRadioAdmin`, nicht davor** (NS-Z7): „`riegel.test.ts` Klausel (d)
liest denselben Funktionskoerper mit." Ein `merkeNutzer` vor dem Riegel schriebe fuer **jede**
angemeldete Person der Suite eine Zeile in `users` — auch fuer die, die abgewiesen wird.

Der Alt-Weg, gemessen: `resolveUserNames(db, subs)` loest `changedBy` **additiv** auf und faellt
auf den rohen `sub` zurueck, „so the field is never blank"
(`radio-admin/server/src/routes/devices.ts:70-78`).

#### ⛔ Die Bauform von `merkeNutzer` — sie wurde bisher nur GERUFEN, nie gebaut

⚠️ **Hier fehlte bis zur Kritikrunde die ganze Funktion.** Der Riegelkoerper in **E-V1** ruft
`merkeNutzer(getDb(), viewer)`, aber weder Signatur noch Datei noch Testfaelle standen irgendwo —
und die Kollision, die der Bestand **namentlich an Planteil 4 adressiert**, war offen.

```ts
import type { DB } from "../_db/client";

/**
 * ⛔ NACH dem Riegel (NS-Z7). Additiv, nie loeschend.
 * ⛔ RUECKFALL fuer `name === null`: der rohe `sub`. Begruendung unten.
 */
export function merkeNutzer(db: DB, viewer: RadioViewer): void;
```

⛔ **DIE KOLLISION, UND DIE WAHL GEHOERT DIESEM PLANTEIL — sie wird hier getroffen.**
`radio`s Spalte ist `name: text("name").notNull()` (`src/app/m/radio/_db/schema.ts:115`), der
Sitzungstraeger ist `RadioViewer = { sub: string; name: string | null; groups: string[] }`
(`_lib/zugang.ts:61`). ⛔ **Der Insert uebersetzt nicht.** Der Bestandskommentar sagt es woertlich
und gibt genau zwei Wege (`_lib/zugang.ts:47-59`):

> „Wer in Planteil 4 `merkeNutzer(getDb(), viewer)` nachtraegt …, braucht deshalb einen **BENANNTEN
> Rueckfall** fuer `name === null` **ODER** eine Migration, die die Spalte nullable macht. **Die
> Wahl gehoert Planteil 4.**"

⛔ **Entscheidung: der BENANNTE RUECKFALL, und der Rueckfallwert ist der rohe `sub`.** Gruende, in
dieser Reihenfolge:

1. ⛔ **Die Migration ist verboten.** Bauform-Tafel Zeile 20: dieser Planteil legt **keine** neue
   Migration an — Migrationen sind append-only, und eine ueberfluessige ist eine Absturzschleife im
   Container (das hat in `radio-admin` einmal die Produktion lahmgelegt).
2. ⛔ **Der `sub` ist genau der Wert, den der Bestand an dieser Stelle einsetzt.**
   `radio-admin/server/src/routes/devices.ts:70-78` faellt beim Aufloesen von `changedBy` auf den
   rohen `sub` zurueck, **„so the field is never blank"**. Der Rueckfall macht damit **dieselbe**
   Zusage auf der Schreib- wie auf der Leseseite — ein `""` oder ein `"Unbekannt"` waere ein
   dritter, erfundener Wert.
3. ⛔ **Er steht als Kommentar an der Zeile, mit `_db/schema.ts:115`, `_lib/zugang.ts:47-59` und
   `devices.ts:70-78`** — nicht als stiller `?? viewer.sub`.

**Die Schreibform:** `onConflictDoUpdate` auf `sub` — `name` und `lastSeenAt` werden aufgefrischt.
⛔ **Kein `onConflictDoNothing`**: dann traegt die Tabelle den Namen vom allerersten Login und eine
spaetere Umbenennung im Verzeichnisdienst kaeme nie an. ⛔ **Und `lastSeenAt` ist
`integer(..., { mode: "timestamp" })` (`_db/schema.ts:116`) — Drizzle nimmt dort ein `Date`, keine
Zahl** (dieselbe Einheitengrenze wie bei B16/`leihhistorie`).

### 3. Der Layout-Wechsel — beide Haelften, NS-Z9

`admin/(arbeit)/layout.tsx:59-60` traegt heute `await requireRadioAdmin();` mit einem
⬜-Kommentar. ⛔ **Zwei Aenderungen, in derselben Aufgabe:**

**V3 schreibt GENAU DIESE Form:**

```ts
await requireRadioVerwaltung();                            // Spec:4367
return <RadioVerwaltungsRahmen nav={RADIO_NAV}>{children}</RadioVerwaltungsRahmen>;
```

⛔ **OHNE Destrukturierung.** Ein `const { rolle } = await requireRadioVerwaltung();`, dessen
`rolle` niemand liest, ist eine unbenutzte Bindung — und `rtk pnpm lint` mit **0 Fehlern** ist Teil
von V3s Tor. ⚠️ **Und der billigste Gruen-Fix waere der falsche:** V4s `nav={radioNav(rolle)}`
vorzuziehen. Damit fielen V3 und V4 still in **einen** Commit, und V4s eigenes Tor — die
href-Kopplung gegen die Routenkarte und die drei `NavIkonName`-Eintraege — liefe **nie** allein.

**V4 stellt beide Haelften um** (`radioNav` existiert erst dann):

```ts
const { rolle } = await requireRadioVerwaltung();          // Spec:4367
return <RadioVerwaltungsRahmen nav={radioNav(rolle)}>{children}</RadioVerwaltungsRahmen>;
```

⛔ **Deshalb: V3 wechselt den RIEGEL, V4 wechselt die NAVIGATION** — und V3 laesst den
⬜-Kommentar an der `nav`-Zeile stehen, mit V4 als benanntem Nachfolger. **Nicht beides in V3
vorwegnehmen.**

⛔ **Und `admin/(druck)/layout.tsx` bleibt bei `requireRadioAdmin()`** (`Spec:4368`). Der
Kommentar dort sagt es bereits (`(druck)/layout.tsx:19-22`).

### 4. Klausel (d) Fall 2 zieht auf den Helfer um — im SELBEN Commit

`riegel.test.ts:784-799` schreibt es aus, und NS-A7 verlangt es:

* `funktionsKoerper(quelle, "requireRadioAdmin")` → `funktionsKoerper(quelle, "riegelAufStufe")`
* Die **vier** Zusicherungen wandern mit: `istRadioAdmin(` — ⛔ **wird zu `erlaubt(`** (der
  Parameter), plus einer neuen Zusicherung, dass `requireRadioAdmin` und `requireRadioVerwaltung`
  **beide** `riegelAufStufe(` nennen — `meldeFehlendeGruppe(`, `notFound(`, `redirect(`
* Die Reihenfolgepruefung `requireRadioHost` **vor** `viewerAusSession` bleibt
* ⛔ **Neu:** `merkeNutzer(` steht **nach** `erlaubt(` im selben Koerper (NS-Z7)

⛔ **Nichts wird geloescht und nichts zu einem dateiweiten `toMatch` aufgeweicht** — „ein
dateiweites `toMatch` waere ueber jeder Datei wahr, die die Namen irgendwo nennt, und das ist genau
die NT11-Form."

### 5. Die VERHALTENSfaelle — sie sind hier faellig, namentlich

`riegel.test.ts:770-772` woertlich: „Die **VERHALTENSfaelle** nach `lagerbuch`-Vorbild
(`src/app/m/lagerbuch/_lib/zugang.test.ts:41` Import, `:72` Aufruf, Begruendung `:60-71`) gehoeren
an **PLANTEIL 4**, wo die erste Verwaltungsseite steht und der Next-Anfragekontext echt ist."

| Testname | Aussage |
|---|---|
| „requireRadioVerwaltung laesst die Admin-Gruppe durch und meldet rolle admin" | Der positive Fall der strengeren Stufe |
| „requireRadioVerwaltung laesst die Updater-Gruppe durch und meldet rolle updater" | Der positive Fall der schwaecheren |
| „wer in BEIDEN Gruppen steht, bekommt rolle admin" | ⛔ **1:1 aus `role.ts:7-8`** — `admin` gewinnt, weil die Pruefung zuerst steht. Der Fall, den ein `updater ?? admin` still umkehrte |
| „ohne beide Gruppen endet requireRadioVerwaltung im notFound, nicht im 403" | `Spec:691-694`; und `meldeFehlendeGruppe` wird gerufen |
| „ohne Sitzung leitet requireRadioVerwaltung zur Anmeldung, nicht in den 404" | `viewerAusSession` gibt `null`; ohne den `redirect`-Zweig landet eine **anonyme** Person im 404 |
| „requireRadioVerwaltung prueft den Host VOR der Person" | Auf einem fremden Host wirft sie `notFound()`, **ohne** die Session zu lesen — sonst verraet der Login-Umweg die Route |
| „istRadioUpdater ruft requireRadioHost nicht" | Die Gegenregel §1.4.4, als Koerper-Scan |
| „istRadioAdmin bleibt false fuer eine reine Updater-Gruppe" | ⛔ **Die Richtung, die NS-Z8 als einzige festhaelt:** kein `||`. Ohne diesen Fall waere eine Verschmelzung gruen |
| „merkeNutzer wird NICHT gerufen, wenn der Riegel abweist" | Verhaltensfall zu NS-Z7. ⛔ Ein Spion auf `merkeNutzer`; ohne ihn schriebe der Riegel fuer jede abgewiesene Person eine `users`-Zeile |
| „merkeNutzer wird gerufen, wenn der Riegel durchlaesst" | Die Gegenprobe — sonst waere „nicht gerufen" auch bei geloeschter Zeile gruen |
| ⛔ „eine Sitzung ohne name schreibt den sub als Namen, nicht null" | ⛔ **Der Fall zur aufgeloesten Kollision.** `_db/schema.ts:115` ist `.notNull()`, `RadioViewer.name` ist `string \| null`. Fixture: `{ sub: "s-1", name: null }` ⇒ die Zeile in `users` traegt `"s-1"`. ⛔ **Nicht `toBeTruthy` — der Wert wird zeichengleich gegen den `sub` geprueft** |
| „ein zweiter Aufruf mit geaendertem Namen frischt die Zeile auf, statt sie zu ueberspringen" | ⛔ **Der `onConflictDoUpdate`-Zweig.** Fixture: derselbe `sub`, zweimal, mit **verschiedenen** Namen ⇒ der zweite steht da |
| „merkeNutzer legt genau EINE Zeile je sub an" | ⛔ **`toBe(1)` nach zwei Aufrufen** — der Fall gegen ein `insert` ohne `onConflict` |
| „fehlendes SUITE_UPDATER_GROUP_RADIO schliesst die Stufe" | ⛔ `istInUpdaterGruppe([...])` ist `false` fuer **jede** Gruppenliste, auch fuer die leere (aus V2 hierher gezogen) |
| „leeres SUITE_UPDATER_GROUP_RADIO schliesst die Stufe ebenfalls" | Der Fall, den Falle 23 in der **anderen** Richtung beschreibt |
| „nur Leerraum als Gruppenname schliesst die Stufe" | `"   "` ist kein Gruppenname. ⛔ **Getrimmt geprueft**, sonst traegt ein Tippfehler in der `.env` eine Gruppe, in der niemand ist |
| „der Vergleich ist zeichengleich, nicht case-insensitiv" | ⛔ `groups` kommt aus dem OIDC-`groups`-Claim; ein normalisierender Vergleich waere eine Rechteerweiterung, die kein Gate sieht |

- [ ] **Schritt 1** — Testfaelle schreiben (Verhalten **und** die umgezogene Klausel (d)), alle rot.
- [ ] **Schritt 2** — Sonden: **S-V3a**: `istRadioAdmin` um `|| istRadioUpdater(viewer)` erweitern
      → „istRadioAdmin bleibt false fuer eine reine Updater-Gruppe" rot. **S-V3b**: in
      `requireRadioVerwaltung` die Rollenableitung auf `istRadioUpdater(viewer) ? "updater" : "admin"`
      drehen → „wer in BEIDEN Gruppen steht" rot. **S-V3c**: `merkeNutzer` **vor** `erlaubt(`
      schieben → sowohl Klausel (d) als auch „merkeNutzer wird NICHT gerufen, wenn der Riegel
      abweist" rot. **S-V3d**: `riegelAufStufe` umbenennen, ohne Klausel (d) nachzuziehen → Klausel
      (d) rot ⛔ **und das ist der Beweis, dass die Zusicherung wirklich umgezogen ist und nicht
      leer-gruen laeuft**. **S-V3e**: den `trim()` in `updaterGruppe()` entfernen → „nur Leerraum"
      rot. **S-V3f**: den `?? viewer.sub`-Rueckfall in `merkeNutzer` entfernen → ⛔ **der
      Null-Namen-Fall rot, und `typecheck` faellt zusaetzlich** — beide Ergebnisse in die
      Rueckmeldung. **S-V3g**: `onConflictDoUpdate` durch `onConflictDoNothing` ersetzen → der
      Auffrisch-Fall rot.
- [ ] **Schritt 3** — `_lib/zugang.ts` umbauen: `riegelAufStufe` privat, `requireRadioAdmin` und
      `requireRadioVerwaltung` darauf, `istRadioUpdater` als Praedikat neben `istRadioAdmin`,
      ⛔ **`updaterGruppe()`/`istInUpdaterGruppe()` hierher** (aus V2, siehe dort),
      ⛔ **`merkeNutzer` bauen** — mit `onConflictDoUpdate` und dem benannten `sub`-Rueckfall —
      und im Riegelkoerper **nach** dem Riegel rufen.
      ⛔ **`import type { DB }`**, nicht `import { DB }`.
- [ ] **Schritt 4** — `riegel.test.ts` Klausel (d) Fall 2 auf `riegelAufStufe` umstellen.
      ⛔ **Nur diese Klausel, und keine Aufweichung.**
- [ ] **Schritt 5** — `admin/(arbeit)/layout.tsx` auf `await requireRadioVerwaltung();`
      ⛔ **ohne Destrukturierung** (siehe oben). ⛔ **Die `nav`-Zeile bleibt vorerst `RADIO_NAV`**,
      mit einem ⬜-Kommentar, der **V4** als Nachfolger nennt.
- [ ] **Schritt 6** — Tor. ⛔ **Zusaetzlich:** `rtk pnpm vitest run src/app/m/radio/riegel.test.ts
      src/app/m/radio/_lib/zugang.test.ts`.

```bash
rtk git add src/app/m/radio/_lib/zugang.ts src/app/m/radio/_lib/zugang.test.ts \
            src/app/m/radio/riegel.test.ts "src/app/m/radio/admin/(arbeit)/layout.tsx"
rtk git commit -m "feat(radio): requireRadioVerwaltung, istRadioUpdater und der Layout-Wechsel"
```

---

## Aufgabe V4: `radioNav(stufe)` — sieben Eintraege, drei nur fuer Admin, drei neue Zeichen

**Files:** Modify `src/app/m/radio/_lib/nav.ts`, `src/app/m/radio/admin/(arbeit)/layout.tsx`,
`src/core/shell/types.ts`, `src/core/shell/navIkonen.tsx`, `src/core/shell/navIkonen.test.tsx`,
⛔ **`src/app/m/radio/_lib/routen.test.ts`** ·
Create `src/app/m/radio/_lib/nav.test.ts`, ⛔ **`src/app/m/radio/_lib/routen.ts`**

**Interfaces:**
- Produces: `radioNav(stufe: RadioRolle): SuiteNavItem[]` — gelesen von
  `admin/(arbeit)/layout.tsx`.

⛔ **KEIN `"use client"` in `_lib/nav.ts` und KEINS in `src/core/shell/types.ts`.** `types.ts:8-13`
schreibt den Grund aus: die Datei wird von Server Components gelesen, „und ein Wert-Import aus
einem `"use client"`-Modul kaeme dort als **Client-Referenz** an: Falle 6, HTTP 500 fuer jede Seite
mit Navigation". ⛔ **`navIkonen.tsx` ist `"use client"` (`:1`) — die Trennung ist der Punkt.**

### Die sieben Eintraege (`Spec:4199-4210`)

| # | Titel | `href` (⛔ **aeussere** Form) | `ikon` | Stufe |
|---|---|---|---|---|
| 1 | Übersicht | `/admin` | `uebersicht` | beide |
| 2 | Geräte | `/admin/geraete` | `geraete` | beide |
| 3 | Ausleihen | `/admin/ausleihen` | **`ausleihen`** (neu) | beide |
| 4 | Update-Modus | `/admin/software` | **`update`** (neu) | beide |
| 5 | Import | `/admin/import` | `import` | ⛔ **nur Admin** |
| 6 | Softwareversionen | `/admin/versionen` | **`versionen`** (neu) | ⛔ **nur Admin** |
| 7 | Zugänge | `/admin/zugaenge` | `tokens` | ⛔ **nur Admin** |

⛔ **`href` traegt die AEUSSERE Form, `revalidatePath` die INNERE** (`Spec:4212-4216`) — „zwei
Formen desselben Pfades, nie vermischt". Die Begruendung steht im Bestand (`_lib/nav.ts:6-9`):
`aktiverEintrag` loest sie per **Suffix** gegen aeussere **und** umgeschriebene Pfade auf.

⛔ **Drei der zehn Seitenpfade gehoeren NICHT ins Menue** und der Grund steht bereits im Quelltext
(`_lib/nav.ts:22-28`): `/admin/geraete/<id>` und `.../ereignisse` haben keine feste Id, und
`/admin/zugaenge/blatt` ist das **Druckblatt** — „ein Menuepunkt darauf schoebe ein Blatt mit
Zugangscodes im Klartext in die Navigationsleiste".

⚠️ **Und Eintrag 5 traegt den Spec-Widerspruch aus E-V4:** die Navigation blendet „Import" fuer
Updater aus (`Spec:4202-4203`), **die Seite selbst ist aber fuer beide Stufen offen**
(`Spec:4375`). ⛔ **Das ist kein Fehler, den man wegbaut** — es ist die Wahl aus E-V4, und der
Kommentar an Eintrag 5 nennt beide Spec-Zeilen und ⬜ **V-L5**.

### Die drei neuen Zeichen

`src/core/shell/types.ts:18-21` fuehrt heute **15** Namen; drei kommen dazu: `ausleihen`, `update`,
`versionen`. ⛔ **Beide Stellen, sonst uebersetzt es nicht:** die Union in `types.ts` **und**
`NAV_IKONEN` in `navIkonen.tsx:22-38` — `Record<NavIkonName, IconType>` erzwingt Vollstaendigkeit
**typseitig**, deshalb braucht es **keinen eigenen Test** (`Spec:4218-4232`).
`navIkonen.test.tsx` waechst **nur** um `radioNav` in seiner bestehenden Pruefung.

Die Zeichen kommen aus `react-icons/pi`, wie die anderen 15 (`navIkonen.tsx:15-20`).
⛔ **Keine zweite Zeichenquelle.**

### ⛔ Die Routenkarte zieht in ein Wertmodul `_lib/routen.ts` — sonst ist der Kopplungsfall nicht baubar

⚠️ **Hier stand bis zur Kritikrunde eine Zusage ohne Mechanismus.** Der Kopplungsfall („jeder `href`
zeigt auf eine Route der Routenkarte") sollte gegen die Karte in `_lib/routen.test.ts` pruefen.
⛔ **Die ist dort modul-privat:** `const VERWALTUNG = [` steht auf `_lib/routen.test.ts:41` **ohne**
`export`, und `grep -c "^export" src/app/m/radio/_lib/routen.test.ts` liefert **0** (gemessen).
Ein Import aus einer `.test.ts` ist ausserdem ausgeschlossen — er registrierte deren Suiten ein
zweites Mal (gemessen, siehe **E-V13**). ⛔ **Ohne Mechanismus kann V4s Tor nicht gruen werden, und
der naheliegende Gruen-Fix waere eine ZWEITE ABSCHRIFT der Karte** — also genau der Zustand, gegen
den der Fall antritt.

⛔ **Entscheidung: die zwei Listen wandern nach `src/app/m/radio/_lib/routen.ts`** — ein reines
Wertmodul **ohne** `"use client"` und **ohne** `"use server"` —, und **beide** Dateien beziehen sie
von dort: `_lib/routen.test.ts` (unveraendert in seiner Aussage) und `_lib/nav.test.ts` (neu).

```ts
// _lib/routen.ts — reines Wertmodul, keine Direktive, kein Import aus _db/
/** Der Ausleih-Zweig, Spec §1.2.1. */
export const AUSLEIH_PFADE = ["/", "/t/ABC123", "/abmelden", "/geraete", "/ausleihen", "/rueckgabe"];
/** Die ZEHN Verwaltungsseiten plus die Route Handler unter `admin/`. */
export const VERWALTUNGS_PFADE = [ /* … 1:1 aus routen.test.ts:41-53 … */ ];
```

⛔ **DREI Auflagen an den Umzug, und die zweite ist die, die man vergisst:**

1. ⛔ **Die zwei Vollzaehligkeits-Faelle bleiben in `_lib/routen.test.ts` und behalten ihr `toBe`.**
   Der Kommentar dort begruendet sie gemessen: `const VERWALTUNG: string[] = []` liess die Datei
   **gruen** mit `Tests 14 passed (14)`, „weil `it.each([])` in vitest 4.1.10 still NULL Faelle
   erzeugt". ⛔ **Der Umzug darf sie weder zusammenlegen noch in einen `it.each`-Koerper ziehen.**
2. ⛔ **`VERWALTUNGS_PFADE` waechst mit E-V16 um `/admin/import/hochladen`** — der zweite neue Route
   Handler. Die Zahl im Vollzaehligkeitsfall wird **bewusst** angehoben, in **V18**, im selben
   Commit wie der Handler. ⛔ **Nicht in V4 vorwegnehmen und nicht auf `>=` aufweichen.**
3. ⛔ **`_lib/routen.ts` traegt keine Direktive** — `riegel.test.ts:1076-1081` scannt jede Datei unter
   `_lib/`/`_db/` darauf; die Untergrenze `:990` ist `toBeGreaterThanOrEqual(4)` und wird durch eine
   zusaetzliche Datei nicht rot.

⚠️ **Nicht mit `src/core/shell/icons.ts` verwechseln** (`Spec:4227-4232`): jene Map bildet
`ModuleDef.icon` fuer den **App-Umschalter** ab, ist client-only und braucht die Registry-Zeile fuer
`radio` — die steht bereits (`src/core/registry.ts:197`, `icon: "WifiOutlined"`). Fehlte sie, truege
die Kachel still das Portal-Icon (Praezedenzfall `files`, 30.07.2026).

| Testname | Aussage |
|---|---|
| „radioNav(admin) liefert genau sieben Eintraege" | ⛔ **`toBe(7)`.** Ueber einer leeren Liste waere alles darunter leer-gruen — der bestehende Kommentar sagt es (`_lib/nav.ts:45-47`) |
| „radioNav(updater) liefert genau vier Eintraege" | ⛔ **`toBe(4)`**, und die Zahl steht **ausserhalb** der Schleife |
| „die drei nur fuer Admin sichtbaren sind Import, Softwareversionen und Zugaenge" | ⛔ **Namentlich, nicht als Zahl.** Beleg `Spec:4202-4203` |
| „jeder href der Admin-Navigation zeigt auf eine Route der Routenkarte" | ⛔ **Der Test, den NS-Z9 verlangt und der ueber einer leeren Liste leer-gruen waere.** ⛔ **Er koppelt gegen `_lib/routen.ts` — siehe den Abschnitt darunter; ein Import aus `_lib/routen.test.ts` ist nicht moeglich und eine zweite Abschrift der Karte waere genau der Zustand, gegen den der Fall gebaut ist** |
| „jeder fuer eine Stufe sichtbare Eintrag ist von dieser Stufe erreichbar" | ⛔ **Die Zusage aus `Spec:4208-4210`.** Fuer `updater` heisst das: keiner der vier zeigt auf eine `requireRadioAdmin()`-Seite. ⚠️ **`/admin/import` ist der Grenzfall** — es ist **nicht** in der Updater-Navigation, also faellt es nicht darunter |
| „kein href traegt die innere Form /m/radio" | ⛔ Die Verwechslung aus `Spec:4212-4216`, als Scan ueber die Liste |
| „jeder Eintrag traegt ein ikon aus NavIkonName" | Typseitig ohnehin erzwungen — der Fall faengt einen `ikon`-losen Eintrag, der **keine** Typwarnung erzeugt (`ikon` ist optional, `types.ts:52`) |

- [ ] **Schritt 1** — Testfaelle, alle rot.
- [ ] **Schritt 2** — Sonden: **S-V4a**: „Import" aus der Admin-Ausblendliste nehmen →
      „radioNav(updater) liefert genau vier" rot. **S-V4b**: einen `href` auf die innere Form
      stellen → „kein href traegt die innere Form" rot. **S-V4c**: einen `href` auf einen Pfad
      stellen, den die Routenkarte nicht kennt → der Kopplungsfall rot.
- [ ] **Schritt 3** — `types.ts` und `navIkonen.tsx` um die drei Namen erweitern.
- [ ] **Schritt 4a** — ⛔ **`_lib/routen.ts` anlegen und `_lib/routen.test.ts` darauf umstellen**,
      im selben Commit. ⛔ **Beide Vollzaehligkeits-Faelle bleiben, mit `toBe`.**
- [ ] **Schritt 4** — `_lib/nav.ts` von `RADIO_NAV` auf `radioNav(stufe)` umstellen. ⛔ **Die
      ⬜-Kommentare in der Datei, die Planteil 4 als Eigentuemer nennen (`:17-21`, `:35-40`,
      `:45-47`), werden ERSETZT — nicht stehen gelassen.**
- [ ] **Schritt 5** — `admin/(arbeit)/layout.tsx`: ⛔ **beide Haelften** —
      `const { rolle } = await requireRadioVerwaltung();` **und** `nav={radioNav(rolle)}` (NS-Z9),
      und den ⬜-Kommentar aus V3 entfernen.
- [ ] **Schritt 6** — `navIkonen.test.tsx` um `radioNav` erweitern.
- [ ] **Schritt 7** — Tor.

```bash
rtk git add src/app/m/radio/_lib/nav.ts src/app/m/radio/_lib/nav.test.ts \
            src/app/m/radio/_lib/routen.ts src/app/m/radio/_lib/routen.test.ts \
            "src/app/m/radio/admin/(arbeit)/layout.tsx" \
            src/core/shell/types.ts src/core/shell/navIkonen.tsx src/core/shell/navIkonen.test.tsx
rtk git commit -m "feat(radio): radioNav mit Rechtestufe und drei neue Navigationszeichen"
```

---

## Aufgabe V5: `_lib/updateStand.ts` und `_lib/lesepfade/versionen.ts`

**Files:** Create `src/app/m/radio/_lib/updateStand.ts` + Test,
`src/app/m/radio/_lib/lesepfade/versionen.ts` + Test

**Interfaces:**
- Produces: `berechneUpdateStand(softwareVersion, zielVersion)`, `UpdateStand`,
  `versionenMitGeraetezahl(db)`, `zielVersion(db)` — gelesen von **V6**, **V10**, **V12**, **V17**,
  **V19**.
- Consumes: ⛔ **nichts aus V6.** `versionenMitGeraetezahl` zaehlt ueber eine SQL-Unterabfrage auf
  `devices.softwareVersion` (`softwareVersionRepo.ts:147`) und nicht ueber `geraeteListe` — genau
  deshalb kann diese Aufgabe zuerst laufen.

### `_lib/updateStand.ts` — Entscheidung **E-V8**

```ts
export type UpdateStand = "aktuell" | "veraltet" | "unbekannt";
export function berechneUpdateStand(
  softwareVersion: string | null,
  zielVersion: string | null,
): UpdateStand;
```

Die drei Zweige, 1:1 aus `radio-admin/server/src/repos/deviceRepo.ts:153-156`:

```
softwareVersion == null                       -> "unbekannt"
zielVersion != null && gleich                 -> "aktuell"
sonst                                         -> "veraltet"
```

⛔ **Der dritte Zweig ist der, den ein Nachbau falsch macht.** Ist **keine** Zielversion gesetzt,
faellt jede nicht-leere Version auf **„veraltet"** — nicht auf „unbekannt". Der Alt-Kommentar sagt
es woertlich (`deviceRepo.ts:151-152`): „When target is null the 'aktuell' branch can never match,
so non-null versions fall through to 'veraltet' — matching the shared fn exactly."

⛔ **`aktuell` haengt AUSSCHLIESSLICH an der Ziel-Marke, nie am Anlegedatum** — und das ist keine
Formalie: `insertSoftwareVersionIfNew` legt neue Versionen **oben** in der Anzeigeordnung ab, macht
sie aber **nie** zum Ziel (`softwareVersionRepo.ts:28-31`, `:39`).

### `_lib/lesepfade/versionen.ts`

`versionenMitGeraetezahl(db): VersionZeile[]` — ersetzt `listSoftwareVersions`
(`softwareVersionRepo.ts:139-151`):

| Regel | Beleg |
|---|---|
| Sortierung `desc(sortOrder)`, dann `desc(createdAt)` | `:150` |
| `deviceCount` als Unterabfrage ueber `devices.softwareVersion = softwareVersions.value` | `:147` |
| `isTarget` mit | `:146` |
| `angelegtText` **vorformatiert** | `SoftwareVersionsPage.tsx:110`; `_lib/anzeige.ts:75` |

`zielVersion(db): string | null` — ersetzt `getTargetVersion` (`softwareVersionRepo.ts:63-70`):
`where(eq(isTarget, true)).limit(1)`.

⚠️ **Und hier liegt eine bekannte Schwaeche des Bestands, die der Schema-Kommentar bereits
festhaelt** (`_db/schema.ts:83-91`): es gibt **keinen DB-Constraint**, der genau eine Ziel-Marke
erzwingt, und `getTargetVersion` hat **kein `ORDER BY`** — bei zwei Marken entscheidet die
Reihenfolge, in der SQLite zufaellig liefert, ueber den angezeigten Stand **jedes** Geraets.
⛔ **Das wandert 1:1 mit, inklusive des fehlenden Constraints** (ein partieller Index verwandelte
das Setzen der Marke von einer Zweischritt-Transaktion in einen Konflikt und braeche den
bestehenden Schreibweg). ⛔ **Aber der Lesepfad bekommt ein deterministisches `orderBy(sortOrder)`
davor**, damit derselbe Datenbestand nicht zweimal verschieden antwortet — das ist eine **benannte
Abweichung**, keine 1:1-Uebernahme, und sie steht als Kommentar mit `_db/schema.ts:83-91` daneben.

| Testname | Aussage |
|---|---|
| „ohne Softwareversion ist der Stand unbekannt" | Erster Zweig |
| „gleich der Zielversion ist aktuell" | Zweiter Zweig |
| „ungleich der Zielversion ist veraltet" | Dritter Zweig |
| „ohne gesetzte Zielversion ist jede nicht leere Version veraltet, nicht unbekannt" | ⛔ **Der Fall, den `deviceRepo.ts:151-152` ausdruecklich begruendet** |
| „aktuell wird nie aus dem Anlegedatum abgeleitet" | Fixture: die **juengste** Version ist **nicht** Ziel; ein Geraet darauf ist **veraltet** |
| ⚠️ **Der Kopplungsfall ist NICHT hier** | ⛔ **Er braucht den SQL-Ausdruck von `geraeteListe` und liegt deshalb in `_lib/lesepfade/geraete.test.ts`, Aufgabe V6** — sonst haette er in dieser Aufgabe kein Pruefobjekt |
| „versionenMitGeraetezahl sortiert nach sortOrder absteigend, dann nach createdAt absteigend" | `:150`. Fixture: zwei Zeilen mit **gleichem** `sortOrder` |
| „deviceCount zaehlt Geraete mit genau diesem Versionswert" | `:147`. Fixture: drei Geraete, zwei Versionen |
| „zielVersion liefert null, wenn keine Marke gesetzt ist" | `:70` |
| „zielVersion antwortet bei zwei Marken deterministisch" | Die benannte Abweichung oben. ⛔ **Der Fall traegt den Kommentarverweis auf `_db/schema.ts:83-91` im Testtext** |

- [ ] **Schritt 1** — Testfaelle, alle rot.
- [ ] **Schritt 2** — Sonden: **S-V5a**: den dritten Zweig auf `"unbekannt"` stellen → „ohne
      gesetzte Zielversion … veraltet" rot. **S-V5b**: `aktuell` aus dem juengsten `createdAt`
      ableiten → „nie aus dem Anlegedatum" rot. **S-V5c**: das `orderBy` in `zielVersion` entfernen
      → der Determinismusfall rot (⚠️ **er kann flackern** — dann ist er als Fall untauglich und
      muss ueber die **Abfrageform** pruefen, nicht ueber das Ergebnis; das ist im Bau zu
      entscheiden und im Testkommentar zu begruenden).
- [ ] **Schritt 3** — bauen.
- [ ] **Schritt 4** — Tor.

```bash
rtk git add src/app/m/radio/_lib/updateStand.ts src/app/m/radio/_lib/updateStand.test.ts \
            src/app/m/radio/_lib/lesepfade/versionen.ts src/app/m/radio/_lib/lesepfade/versionen.test.ts
rtk git commit -m "feat(radio): der Update-Stand als eine Rechnung, und die Versionsliste"
```

---

## Aufgabe V6: `_lib/lesepfade/geraete.ts` — Liste, Detail, Kennzahlen, Vorschlaege

⚠️ **DIESE AUFGABE STAND URSPRUENGLICH VOR V5, UND DAS WAR EIN ZIRKEL.** `geraeteListe`
braucht `berechneUpdateStand` und `zielVersion` — beide entstehen in V5; V5s eigener Kopplungsfall
braucht umgekehrt den SQL-Ausdruck dieser Datei. Baut man nur die eine Haelfte, faellt `typecheck`
auf dem Import oder der Kopplungsfall hat kein Pruefobjekt. ⛔ **Aufgeloest durch Tausch, nicht durch
einen gemeinsamen Block:** V5 baut die reine Rechnung und die Versionsliste (sie braucht von hier
**nichts** — `deviceCount` ist eine SQL-Unterabfrage ueber `devices.softwareVersion`,
`softwareVersionRepo.ts:147`), V6 baut darauf auf **und traegt den Kopplungsfall in seiner eigenen
Testdatei**. Damit bleibt „eine Aufgabe = ein Tor" unangetastet (Architecture-Kapitel: dieser
Planteil hat **keinen** Block mit gemeinsamem Tor).

**Files:** Create `src/app/m/radio/_lib/lesepfade/geraete.ts`,
`src/app/m/radio/_lib/lesepfade/geraete.test.ts`

**Interfaces:**
- Produces: `geraeteListe(db, p)`, `geraet(db, id)`, `geraeteKennzahlen(db)`, `vorschlaege(db)`,
  `geraeteFuerExport(db)`, die Typen `GeraetZeile`, `GeraetFilter`, `Vorschlagsfeld` — gelesen von
  **V12** (Kennzahlen), **V13** (Liste, Vorschlaege), **V14** (Detail, Vorschlaege), **V17**
  (Suche), **V22** (Export).
- Consumes: `berechneUpdateStand`, `UpdateStand`, `zielVersion` aus **V5**.

⛔ **KEIN `"use client"`** (Falle 6) und ⛔ **KEIN `"use server"`** — reine Datenzugriffe.
⛔ **`db` ist der ERSTE Parameter, immer.** Die Funktion holt sich die Verbindung nicht selbst,
sonst ist sie im Test nicht gegen eine eigene Datei zu haengen — und `getModuleDb()` waere dort
falsch, weil sein Cache per **Modulschluessel** gekeyt ist, nicht per `DATA_DIR`
(`src/core/db/index.ts:31-35`). Vorbild: `_db/leihen.ts:30-35`.

### `geraeteListe(db, p): { zeilen: GeraetZeile[]; gesamt: number; seite: number; seitenGroesse: number }`

⛔ **Die 1:1-Vorlage ist `radio-admin/server/src/repos/deviceRepo.ts:147-217`**, und sie ist in der
1:1-Tafel Zeile fuer Zeile aufgeschluesselt. Die tragenden Punkte noch einmal, weil sie hier gebaut
werden:

| Regel | Beleg |
|---|---|
| Zehn Filter, **jeder einzeln abgebildet** | `deviceRepo.ts:178-189`; Vorlage der Abbildung `DeviceList.tsx:79-94` mit dem ausgeschriebenen Grund: „**not a spread** so that clearing a filter actually removes it" |
| `status`/`location`/`deviceType`/`funktion`/`hersteller`: CSV → **`IN`** | `deviceRepo.ts:174-182` |
| `deviceModes`: CSV-Token → **`AND` von `LIKE '%token%'`** | `deviceRepo.ts:183-185`. ⛔ **AND, nicht OR** — „TMO,DMO" heisst „beide", nicht „eines von beiden" |
| `loanable`/`alamosIntegrated`: ⛔ **nur wenn wahr** — „nicht ausleihbar" ist nicht ausdrueckbar | `deviceRepo.ts:186-187` |
| `hasUpdateNote`: `isNotNull AND ne('')` | `deviceRepo.ts:188`. ⛔ **Die leere Zeichenkette zaehlt NICHT als Abweichung** |
| `updateStand`: `eq` auf den **SQL-Ausdruck**, ⛔ vor `LIMIT`/`OFFSET` | `deviceRepo.ts:189`; Entscheidung **E-V8** |
| Freitext: `LIKE '%q%'` als **`OR`** ueber die gewaehlten Felder aus einer **Allowlist** | `deviceRepo.ts:159-173` |
| ⛔ **Alle angeforderten Suchfelder unbekannt ⇒ KEINE Zeilen** (`sql\`0\``), nie eine Interpolation | `deviceRepo.ts:168-172`, Kommentar `:169-170`: „never interpolate unknown names into SQL" |
| **Zwoelf** waehlbare Suchfelder, **sieben** vorgewaehlt | Server `deviceRepo.ts:125-140`, Client `SearchFieldPicker.tsx:5-21` |
| Sortierung: **acht** annehmbare Schluessel, Vorgabe `desc(createdAt)`, unbekannt ⇒ Vorgabe | `deviceRepo.ts:113-121`, `:195-201`; Entscheidung **E-V9** |
| Seitengroesse: die Flaeche schickt **20**, der Server deckelt bei **200** und faellt auf **25** | `DeviceList.tsx:28`, `deviceRepo.ts:193` |

⛔ **Die Ruecklieferung sind `GeraetZeile[]` — vorformatiert, serialisierbar, keine `Date`.** Der
Typ steht in der Spec **woertlich ausgeschrieben** (`Spec:4542-4553`):

```ts
export type GeraetZeile = {
  id: string; issi: string; tei: string | null; rufname: string | null; opta: string | null;
  funktion: string | null; geraeteTyp: string | null; status: string; lagerort: string | null;
  hersteller: string | null; bedieneinheit: string | null; geraeteFunktionen: string | null;
  zuordnung: string | null; seriennummer: string | null;
  ausleihbar: boolean; alamos: boolean;
  softwareVersion: string | null;
  updateStand: "aktuell" | "veraltet" | "unbekannt";
  hatAbweichung: boolean;
  letztesUpdateText: string;            // vorformatiert
};
```

⚠️ **`status: string`, nicht `GeraeteStatus`** — das ist die **rohe** Spalte (`_db/schema.ts:30`,
Freitext ohne `enum`), nicht die vier Zustaende aus `_lib/status.ts:48`. Entscheidung **E-V14** hat
den Unterschied ausgeschrieben. ⛔ **`geraeteZustandAus` wird hier NICHT gerufen.**

⚠️ **Die Alt-Spalte „Letztes Update" zeigt `softwareVersion`, nicht ein Datum**
(`deviceColumns.tsx:34`: `dataIndex: 'softwareVersion'`, `title: 'Letztes Update'`) — dieselbe
Beschriftung traegt auch das Formularfeld (`DeviceFields.tsx:152`). ⛔ **`letztesUpdateText` ist
deshalb der vorformatierte Wert von `lastUpdatedAt`, und die Spalte behaelt ihre Alt-Beschriftung.**
Die Verwechslung ist echt und steht als Kommentar am Typ.

### `geraet(db, id): GeraetDetail | null`

Ersetzt `GET /devices/:id` (`radio-admin/server/src/routes/devices.ts:82-97`). ⛔ **Drei Dinge,
die der Alt-Handler zusaetzlich tut und die mitwandern:**

1. `updateStatus` wird **berechnet** (`computeUpdateStatus(device, target)`, `:86`) — hier ueber
   `berechneUpdateStand` aus **V5**.
2. `createdBy`/`updatedBy` werden **additiv** ueber `users` in Namen aufgeloest, ⛔ **mit Rueckfall
   auf den rohen `sub`** (`:89-95`).
3. Fehlt das Geraet → `null`; die Seite ruft dann `notFound()`.

⛔ **Der Detailtyp ist WEITER als `GeraetZeile`** — er traegt zusaetzlich `notizen`,
`updateAnmerkung`, `hiorgId`, die zwei Audit-Paare und `zuletztAktualisiert`. Er ist der Typ der
**Geraeteakte**; `GeraetZeile` ist der der **Liste**. ⛔ **Nicht zusammenlegen** — sonst wandern
Audit-Spalten in die Listenzeile, und das ist die Fehlerklasse aus 6.3 Posten 2, eine Ebene hoeher.

### `geraeteKennzahlen(db): { gesamt: number; aktuell: number; veraltet: number; unbekannt: number }`

⛔ **EINE Abfrage mit `GROUP BY`**, nicht vier mit `pageSize: 1` (`Spec:4780-4784`): „Die vier
Rundlaeufe waren eine Folge der HTTP-Grenze, nicht der Fachlichkeit." Gruppiert wird ueber
**denselben** SQL-Ausdruck wie in `geraeteListe` — ⛔ **derselbe Ausdruck, nicht eine zweite
Abschrift** (E-V8).

### `vorschlaege(db): Record<Vorschlagsfeld, string[]>`

⛔ **EIN Aufruf liefert ALLE Feldlisten**, nicht acht Aufrufe (`Spec:4599-4601`).

⚠️ **Und die Zahl stimmt nicht, gemessen:** die Spec sagt „alle **acht**". Der Alt-Endpunkt fuehrt
**NEUN** Felder (`radio-admin/server/src/routes/suggestions.ts:8-18`): `rufname`, `deviceType`,
`status`, `location`, `assignedTo`, `opta`, `funktion`, `hersteller`, `bedieneinheit`. Das Formular
nutzt **acht** davon (`DeviceFields.tsx:76-121`) — `status` nicht, weil es eine feste Optionsliste
hat (`constants.ts:10-16`). Die Filterschublade nutzt **vier** (`DeviceFilterDrawer.tsx:79-88`).

⛔ **Gebaut werden die ACHT, die eine Flaeche wirklich braucht** — `status` bleibt draussen, mit
diesem Absatz als Kommentar. Ein neunter Eintrag, den niemand liest, ist eine Abfrage je Seitenaufruf
ohne Verbraucher.

Je Feld: `selectDistinct`, `isNotNull`, `orderBy(col)` (`suggestions.ts:26-31`).

### `geraeteFuerExport(db): Geraet[]`

Ersetzt `listAllDevices` (`deviceRepo.ts:63-65`): **alle** Geraete, `desc(createdAt)`, **kein**
Filter, **keine** Paginierung. Gelesen von **V22**.

| Testname | Aussage |
|---|---|
| „liefert die zehn Filter einzeln, und ein geleerter Filter verschwindet aus der Abfrage" | ⛔ **Der Fall, den `DeviceList.tsx:77-78` namentlich begruendet.** Fixture: erst mit Filter, dann ohne — die zweite Menge ist **echt groesser** |
| „geraeteFunktionen mit zwei Token verlangt BEIDE" | `AND`, nicht `OR` (`deviceRepo.ts:183-185`). Fixture: ein Geraet mit `TMO`, eins mit `TMO,DMO` |
| „ausleihbar filtert nur, wenn es wahr ist" | `deviceRepo.ts:186`. ⛔ **`ausleihbar: false` liefert ALLE Geraete** — die 1:1-Wahrheit, so unbequem sie ist |
| „hatAbweichung zaehlt eine leere Update-Anmerkung nicht mit" | `ne(updateNote, '')` (`deviceRepo.ts:188`) |
| „ein unbekanntes Suchfeld liefert KEINE Zeile" | ⛔ **Der Sicherheitsfall.** `deviceRepo.ts:168-172` |
| „ohne gewaehlte Suchfelder gelten die sieben Vorgabefelder" | `deviceRepo.ts:140`, `:162` |
| „ein unbekannter Sortierschluessel faellt auf createdAt absteigend zurueck" | `deviceRepo.ts:196-201`. ⛔ **Kein Fehler, keine Interpolation** |
| „lastUpdatedAt und createdAt sind sortierbar, obwohl die Oberflaeche sie nicht anbietet" | ⛔ **Entscheidung E-V9**, gegen den zu engen Alt-Kommentar `deviceColumns.tsx:12-15` |
| „updateStand filtert VOR der Blaetterung" | ⛔ **Der Fall, den ein Nachbau in JS falsch macht.** Fixture: 25 Geraete, davon 3 veraltet, `seitenGroesse` 20 — mit Filter kommen **3**, nicht 0 |
| „updateStand sortiert ueber denselben Ausdruck, mit dem er filtert" | E-V8 |
| „der SQL-Ausdruck der Liste und berechneUpdateStand stimmen ueber alle vier Eingabelagen ueberein" | ⛔ **Der Kopplungsfall aus E-V8 — er liegt HIER, nicht in V5**, weil nur hier beide Seiten existieren. Ohne ihn laufen zwei Rechnungen auseinander, und der Alt-Kommentar `deviceRepo.ts:149-152` sagt, dass genau das die Sorge war |
| „geraeteKennzahlen zaehlt in EINER Abfrage und die vier Zahlen summieren sich auf gesamt" | ⛔ **Die Summenzusicherung ist der Teil, der eine vergessene Kategorie faengt** |
| „vorschlaege liefert genau acht Feldlisten" | ⛔ **`toBe(8)`**, und die Liste der Namen steht als eigene Zusicherung daneben |
| „vorschlaege ueberspringt NULL und sortiert aufsteigend" | `suggestions.ts:29-30` |
| „geraet loest createdBy und updatedBy ueber users auf und faellt auf den rohen sub zurueck" | ⛔ **Beide Haelften.** `devices.ts:89-95`. Fixture: ein `sub` in `users`, einer nicht |
| „geraet liefert null fuer eine unbekannte Id" | `devices.ts:84` |
| „GeraetZeile traegt genau die zwanzig Felder aus Spec:4542-4553" | ⛔ **Exakter Feldsatzabgleich.** Der Waechter gegen eine hineinwandernde Audit-Spalte |
| „geraeteFuerExport liefert ALLE Geraete, auch nicht ausleihbare" | `deviceRepo.ts:63-65` — ⛔ **kein `loanable`-Filter.** Der Gegenfall zu F1: hier waere ein Filter der Fehler |

- [ ] **Schritt 1** — Testfaelle, alle rot. ⛔ **Die DB im Test selbst bauen und migrieren**
      (Vorbild `_db/migrations.test.ts:29-37`), nie `getModuleDb()`.
- [ ] **Schritt 2** — Sonden: **S-V6a**: den `deviceModes`-Filter auf `OR` stellen → „verlangt
      BEIDE" rot. **S-V6b**: `updateStand` nach `LIMIT` in JS filtern → „filtert VOR der
      Blaetterung" rot. **S-V6c**: bei unbekanntem Suchfeld die Bedingung weglassen (statt `sql\`0\``)
      → „liefert KEINE Zeile" rot. **S-V6d**: `lastUpdatedAt` aus der Sortier-Allowlist nehmen →
      der E-V9-Fall rot. **S-V6e**: `geraeteFuerExport` um einen `loanable`-Filter erweitern →
      „liefert ALLE Geraete" rot. **S-V6f**: den SQL-Ausdruck des Update-Stands um einen Zweig von
      `berechneUpdateStand` abweichen lassen → ⛔ **der Kopplungsfall rot.**
- [ ] **Schritt 3** — bauen.
- [ ] **Schritt 4** — Tor.

```bash
rtk git add src/app/m/radio/_lib/lesepfade/geraete.ts src/app/m/radio/_lib/lesepfade/geraete.test.ts
rtk git commit -m "feat(radio): die Geraete-Lesepfade — zehn Filter, acht Sortierschluessel, eine Kennzahlabfrage"
```

---

## Aufgabe V7: `_lib/lesepfade/ereignisse.ts` und `_lib/lesepfade/ausleihen.ts`

**Files:** Create `src/app/m/radio/_lib/lesepfade/ereignisse.ts` + Test,
`src/app/m/radio/_lib/lesepfade/ausleihen.ts` + Test

**Interfaces:**
- Produces: `ereignisseFuerGeraet(db, id, grenze)`, `EREIGNIS_GRENZE`, `EreignisZeile`,
  `FELD_ETIKETTEN`, `QUELLE_WOERTER` — gelesen von **V15**; `ausleihenListe(db, p)`,
  `AusleihZeile` — gelesen von **V16**.

⛔ **`FELD_ETIKETTEN` und `QUELLE_WOERTER` verlassen diese Datei NICHT — die Insel sieht sie nie.**
⚠️ **Hier stand bis zur Kritikrunde, die Etikettenliste werde „von der Server Component **und** von
Insel 5" gelesen. Das ist ein Bruch, den kein Tor faengt:** diese Datei fuehrt
`ereignisseFuerGeraet(db, …)`, ihr Props-Vertrag fuer Insel 5 ist aber `{ zeilen: EreignisZeile[] }`
(`Spec:4507`) — Etiketten kommen darin gar nicht vor. Und **keine** Insel aus Planteil 3 importiert
aus `_db/` oder aus einem Lesepfad (gemessen: `_ui/GeraeteListe.tsx` importiert nur `react`, `antd`,
`../_lib/filter`, `./ikonen`, `./GeraeteZeile`, CSS).

⛔ **Entscheidung: die Server Component formatiert, die Insel rendert.** `EreignisZeile` traegt
deshalb **vorformatiert**:

```ts
export type EreignisZeile = {
  zeitText: string;        // vorformatiert (_lib/anzeige.ts:75)
  feldEtikett: string;     // aus FELD_ETIKETTEN, Rueckfall = roher Feldname
  alt: string; neu: string;// leere Werte bereits als „—"
  werText: string;         // aufgeloester Name, Rueckfall = roher sub
  werSub: string;          // fuer das title-Attribut
  quelle: string;          // ⛔ der ROHE Wert — die Insel braucht ihn fuer die Tonzuordnung
  quelleWort: string;      // Klartext, Rueckfall = roher Wert
};
```

⚠️ **`quelle` UND `quelleWort`, und das ist kein Ballast.** Die Insel faerbt den `Tag` ueber einen
**erschoepfenden** Switch auf den vier bekannten Werten; das Schema fuehrt sie als Drizzle-Enum
**ohne DB-Check** (`_db/schema.ts:135-137`: „Die Datenbank akzeptiert JEDEN String"). Traege die
Zeile **nur** das Wort, koennte die Insel einen fuenften Wert nicht mehr von den vier bekannten
unterscheiden — der Rueckfall waere still in den Lesepfad gewandert, und der `toBe(4)`-Fall haette
sein Pruefobjekt verloren.

⛔ **UND EINE REGEL FUER JEDEN LESEPFAD DIESES PLANTEILS:** der `DB`-Typ wird mit
**`import type { DB } from "../../_db/client"`** geholt, nie mit einem Wert-Import.
`_db/client.ts:19` zieht `@/core/db`, und das zieht `better-sqlite3` und `node:fs`
(`src/core/db/index.ts:2-4`). Ein Wert-Import ist die Klasse, die `build` **mal** faengt und mal
nicht — ⛔ **und im Zweifel erst im echten Abruf.**

### `_lib/lesepfade/ereignisse.ts` — die Flaeche ist NEU, ohne Vorbild (§5.10)

**Befund** (`Spec:4754-4757`): `GET /devices/:id/events` existiert
(`radio-admin/server/src/routes/devices.ts:66`), und „`rg -n 'events' radio-admin/client/src`
liefert **keinen** Konsumenten". Die Alt-Anwendung schreibt seit Anfang an eine Ereigniszeile je
geaendertem Feld (`deviceRepo.ts:222-244`) und zeigt sie **nirgends**.

**Warum die Flaeche trotzdem entsteht** (`Spec:4759-4765`): Kapitel 4 importiert `device_events`
als Historie — „eine importierte Tabelle, die niemand lesen kann, ist ein Datenfriedhof mit
Wartungskosten". ⛔ **„Sie ist ausdruecklich neu, kein 1:1-Port"** — es gibt kein Vorbild zum
Pruefen, also prueft sie sich **gegen das Datenmodell**: sechs Spalten (`field`, `oldValue`,
`newValue`, `changedBy`, `changedAt`, `source`, `_db/schema.ts:130-141`).

```ts
/** ⬜ V-L7 — der Alt-Leser hat KEINE Grenze (deviceRepo.ts:248-254);
 *  die 200 sind eine Neuerung dieses Ports (Spec:4767-4770), abgelesen bei der Generalprobe. */
export const EREIGNIS_GRENZE = 200;

export function ereignisseFuerGeraet(db: DB, geraeteId: string, grenze?: number): EreignisZeile[];
```

⛔ **Neueste zuerst, ohne Blaetterung** (`Spec:4767-4770`) — `desc(changedAt)`, 1:1 aus
`deviceRepo.ts:253`.

**Vier Spalten** (`Spec:4767-4776`):

| Spalte | Was | Beleg |
|---|---|---|
| Zeit | ⛔ **vorformatiert** | `_lib/anzeige.ts:75` |
| Feld | ⛔ **deutsches Etikett aus derselben Etikettenliste, die das Formular benutzt** — `DeviceFields.tsx`s `label`-Attribute | `Spec:4770-4771`; die 20 Etiketten stehen gemessen in `DeviceFields.tsx:63`, `:71`, `:76`, `:77`, `:79`, `:84`, `:95`, `:99`, `:102`, `:107`, `:116`, `:121`, `:124`, `:129`, `:138`, `:143`, `:152`, `:163`, `:177`, `:186` |
| Aenderung | „alt → neu", ⛔ **leere Werte als `—`** | `Spec:4771-4772` |
| Wer | aufgeloester Name aus `users`, ⛔ **roher `sub` nur im `title`** | `Spec:4772`; Alt-Rueckfall `devices.ts:70-78` |

⛔ **`source` als `Tag`, mit den VIER WOERTERN IM KLARTEXT** (`Spec:4772-4773`): „von Hand",
„CSV-Import", „angelegt", „Abweichung". ⛔ **Die vier Werte sind abschliessend**
(`deviceRepo.ts:219`, `_db/schema.ts:139-141`) — und das Schema fuehrt sie als **Drizzle-Enum ohne
DB-Check**: „Die Datenbank akzeptiert JEDEN String; ein fuenfter Wert passiert Datenbank und
Typpruefung unbeanstandet und bricht erst in einem erschoepfenden Switch der Oberflaeche."
⛔ **Also ist der Switch erschoepfend, und der Rueckfall ist der rohe Wert, nicht ein Absturz.**

⛔ **Verlinkt von `geraete/[id]/page.tsx` als TEXTLINK „Änderungen anzeigen"** — ⛔ **nicht als
Reiter**, „weil `Tabs` eine Insel erzwingen wuerde, die die Detailseite sonst nicht braucht"
(`Spec:4767-4776`). Und `Tabs` ist ohnehin Falle 1.

### `_lib/lesepfade/ausleihen.ts`

`ausleihenListe(db, p)` ist ein **duenner Umschlag** um `leihhistorie` aus **V1** — er uebersetzt
Suchparameter in `LeihhistorieFilter` und reicht `LeihZeile` als `AusleihZeile` durch.

⛔ **Er baut KEINE zweite Abfrage.** NS-A1: „Planteil 4 **ergaenzt** `leihhistorie(db, f)` in
**derselben** Datei — ⛔ keine zweite." Ein Lesepfad, der `loans` selbst abfragt, waere genau das.

⛔ **Die Alt-Flaeche schickt nur `page` und `pageSize`** (`useLoans.ts:18-23`), Seitengroesse **20**
(`LoanList.tsx:8`). ⛔ **Der Umschlag reicht die drei uebrigen Filter trotzdem durch**, weil die
Datenfunktion sie ohnehin fuehrt (**E-V10**) und weil die **sieben Spalten** der Alt-Liste 1:1
wandern (`LoanList.tsx:15-47`, gemessen) — eine Verwaltung, die nach Geraet oder Zeitraum filtern
will, braucht dann keine zweite Funktion.

⚠️ **Und was hier NICHT steht, weil es nicht belegt ist:** die frueher an dieser Stelle angefuehrte
Begruendung „`Spec:4084` benennt die sieben Spalten der Ausleihenliste als 1:1-Posten" ist
**gemessen falsch** — `Spec:4082-4086` steht in Kapitel 1 und fuehrt die Signaturen von
`geraeteMitLeihstand`, `offeneAusleihen` und `sucheEntleiher`; von sieben Spalten einer
Ausleihenliste steht dort nichts. ⛔ **Ob die Verwaltung je nach Geraet oder Zeitraum filtern SOLL,
ist deshalb keine Spec-Zusage, sondern eine Vorwegnahme** — sie steht als ⬜ **V-L11** mit Adressat
(Betreiber, vor dem Rollout). ⛔ **Die Flaeche zeigt dafuer heute KEIN Bedienelement**; das
Durchreichen kostet nichts und ist umkehrbar.

| Testname | Aussage |
|---|---|
| „liefert die Ereignisse eines Geraets, neueste zuerst" | `deviceRepo.ts:253` |
| „liefert KEIN Ereignis eines anderen Geraets" | `eq(deviceId, …)` — der Fall, der einen fehlenden `where` faengt |
| „deckelt bei zweihundert" | ⛔ **Fixture mit 201 Zeilen.** Der Fall traegt ⬜ V-L7 im Text |
| „jedes der vier Quellwoerter hat ein Klartextwort" | ⛔ **`toBe(4)` ausserhalb der Schleife**, sonst schrumpft die Menge lautlos |
| „ein unbekannter Quellwert faellt auf den rohen Wert zurueck und stuerzt nicht ab" | Der Enum-ohne-DB-Check-Fall (`_db/schema.ts:135-137`) |
| „jedes Feld der Etikettenliste hat ein deutsches Etikett" | ⛔ **Die Zahl steht ausserhalb der Schleife.** Fixture: alle 20 Feldnamen |
| „ein Feld ohne Etikett faellt auf den rohen Feldnamen zurueck" | Damit ein neues Feld nicht eine leere Spalte erzeugt |
| „leere alte und neue Werte werden als Gedankenstrich dargestellt" | `Spec:4771-4772`. ⛔ **Beide Seiten, mit je unterschiedlichem Wert auf der anderen** |
| „der rohe sub steht im title, nicht in der Zelle" | `Spec:4772` — der Fall haelt fest, dass beide Werte da sind und an **verschiedenen** Stellen |
| „ausleihenListe ruft leihhistorie und baut keine eigene Abfrage" | ⛔ **Quelltext-Scan ueber `_lib/lesepfade/ausleihen.ts`:** die Datei nennt `leihhistorie` und **nicht** `loans` aus dem Schema. NS-A1 als Test, nicht als Vorsatz |
| „ausleihenListe reicht Geraete-Id und Zeitfenster durch" | Der Durchreichfall |

- [ ] **Schritt 1** — Testfaelle, alle rot.
- [ ] **Schritt 2** — Sonden: **S-V7a**: `EREIGNIS_GRENZE` entfernen → „deckelt bei zweihundert"
      rot. **S-V7b**: ein Quellwort aus der Liste nehmen → „jedes der vier Quellwoerter" rot.
      **S-V7c**: den `where`-Zweig in `ereignisseFuerGeraet` entfernen → „KEIN Ereignis eines
      anderen Geraets" rot. **S-V7d**: in `ausleihenListe` eine eigene Drizzle-Abfrage auf `loans`
      bauen → der NS-A1-Scan rot.
- [ ] **Schritt 3** — bauen. ⛔ **Die Etikettenliste liegt in `_lib/lesepfade/ereignisse.ts`, ohne
      `"use client"`, und sie wird AUSSCHLIESSLICH serverseitig gelesen** — die Insel bekommt
      `feldEtikett` und `quelleWort` **fertig** in der Zeile (siehe oben). ⛔ **`import type { DB }`.**
- [ ] **Schritt 4** — Tor.

```bash
rtk git add src/app/m/radio/_lib/lesepfade/ereignisse.ts src/app/m/radio/_lib/lesepfade/ereignisse.test.ts \
            src/app/m/radio/_lib/lesepfade/ausleihen.ts src/app/m/radio/_lib/lesepfade/ausleihen.test.ts
rtk git commit -m "feat(radio): Ereignis- und Ausleih-Lesepfade"
```

---

## Aufgabe V8: `_lib/geraeteDiff.ts` und `_lib/notiz.ts`

**Files:** Create `src/app/m/radio/_lib/geraeteDiff.ts` + Test, `src/app/m/radio/_lib/notiz.ts` + Test

**Interfaces:**
- Produces: `diffGeraet(bestehend, patch): FeldDiff[]`, `haengeNotizAn(bisher, text, autor, wann)`
  — gelesen von **V10** (alle Schreib-Actions).

### `_lib/geraeteDiff.ts` — 1:1 aus `radio-admin/shared/src/diff-device.ts:14-27`

```ts
export type FeldDiff = { feld: string; alt: string | null; neu: string | null };
export function diffGeraet(bestehend: Geraet, patch: Partial<Geraet>): FeldDiff[];
```

Vier Regeln, jede eine eigene Zeile im Alt-Code:

1. ⛔ **Iteriert NUR die Schluessel des Patches** (`diff-device.ts:16`), nicht die des Geraets.
2. ⛔ **`undefined` wird uebersprungen** (`:18`) — ein Feld, das nicht im Patch steht, ist keine
   Aenderung.
3. ⛔ **Roher `!==`-Vergleich** (`:19`), kein `==`, keine Normalisierung. Ein `"0"` gegen `0` ist
   damit eine Aenderung — und das ist gewollt, weil die Spalten Text sind.
4. ⛔ **Alt und Neu werden stringifiziert, `null` bleibt `null`** (`:4-6`, `:22-23`).

⛔ **Und die Folge, die Analyse-Pflicht 24 Nr. 1 als tragend benennt: eine Aenderung ohne echten
Wertunterschied erzeugt KEIN Ereignis** — `if (diffs.length === 0) return;`
(`deviceRepo.ts:229`) und der fruehe Ausstieg in `devices.ts:139-142`.

### `_lib/notiz.ts` — 1:1 aus `radio-admin/shared/src/update-note.ts:25-35`

```ts
export function haengeNotizAn(
  bisher: string | null | undefined,
  text: string,
  autor: string,
  wann: Date,
): string;
```

Die Zeile lautet `[YYYY-MM-DD · Autor] Text`. Vier Regeln, und **drei davon sind
Faelschungsschutz**:

1. Das Datum ist **UTC**-`YYYY-MM-DD` (`isoDate`, `:2-4`).
2. ⛔ **Zeilenumbrueche in `text` UND `autor` werden zu Leerzeichen kollabiert** (`singleLine`,
   `:11-13`).
3. ⛔ **Aus `autor` wird jedes `]` ENTFERNT** (`:31`).
4. `text` wird getrimmt, `autor` nach der Bereinigung ebenfalls (`:31-32`).

⛔ **Der Grund steht im Quellkommentar und wandert woertlich mit** (`:20-23`): „each call appends
**exactly one** line. `text` and `author` are sanitized … so neither argument can forge a second
`[date · author]` audit entry (**audit-trail injection**)."

5. ⛔ **Bestehender Inhalt bleibt WOERTLICH erhalten**, die neue Zeile kommt mit `\n` dahinter
   (`:34`). **Ueberschreiben gibt es nicht.**

⛔ **Und der Aufrufer benutzt EINEN Zeitstempel fuer die angehaengte Zeile UND ihr Ereignis**
(`devices.ts:172-176`), „damit beide nicht ueber eine Mitternachtsgrenze auseinanderlaufen". Der
Alt-Code baut dafuer `line` und `nextNote` mit **demselben** `now` (`:174-176`) — die Zeile allein
(`appendUpdateNote('', …)`) ist der `newValue` des Ereignisses.

| Testname | Aussage |
|---|---|
| „gleicher Wert ergibt eine leere Diff-Liste" | `Spec:4837`. ⛔ **Der Fall, an dem „kein Ereignis" haengt** |
| „ein Feld, das im Patch fehlt, erzeugt keinen Diff" | `diff-device.ts:18` |
| „null gegen einen Wert und ein Wert gegen null sind beides Aenderungen" | `:22-23`. **Beide Richtungen** |
| „alt und neu sind Zeichenketten, null bleibt null" | `toEventValue`, `:4-6` |
| „diffGeraet iteriert nur die Schluessel des Patches" | Fixture: das Geraet traegt zehn Felder, der Patch zwei — es kommen hoechstens zwei Diffs |
| „haengeNotizAn ueberschreibt nie" | Der bestehende Text steht **woertlich** im Ergebnis |
| „ein Zeilenumbruch im Text wird zu einem Leerzeichen" | `singleLine`, `:12`. ⛔ **Sonst faelscht ein `\n[2020-01-01 · Chef] genehmigt` eine zweite Auditzeile** |
| „ein Zeilenumbruch im Autor wird ebenfalls kollabiert" | ⛔ **Der zweite Weg** — der Fall, den ein Nachbau vergisst, weil `autor` „ja vom Server kommt" |
| „eine eckige Klammer im Autor wird entfernt" | `:31`. ⛔ **Der dritte Weg** |
| „ein Aufruf haengt GENAU EINE Zeile an" | ⛔ **Die Zusicherung, die alle drei Regeln zusammen tragen:** Zeilen zaehlen, vorher und nachher |
| „ohne bisherigen Inhalt entsteht die Zeile ohne fuehrenden Zeilenumbruch" | `:34` |
| „das Datum ist UTC" | `isoDate`, `:2-4`. Fixture: `23:30` Berliner Zeit am Monatsletzten |

- [ ] **Schritt 1** — Testfaelle, alle rot.
- [ ] **Schritt 2** — Sonden: **S-V8a**: den `undefined`-Ausstieg entfernen → „ein Feld, das im
      Patch fehlt" rot. **S-V8b**: `singleLine` nur auf `text` anwenden → der Autor-Fall rot.
      **S-V8c**: das `]`-Entfernen weglassen → der Klammer-Fall rot. **S-V8d**: `haengeNotizAn` auf
      Ueberschreiben stellen → „ueberschreibt nie" rot.
- [ ] **Schritt 3** — bauen. ⛔ **Kein `"use client"`.**
- [ ] **Schritt 4** — Tor.

```bash
rtk git add src/app/m/radio/_lib/geraeteDiff.ts src/app/m/radio/_lib/geraeteDiff.test.ts \
            src/app/m/radio/_lib/notiz.ts src/app/m/radio/_lib/notiz.test.ts
rtk git commit -m "feat(radio): Feld-Diff und die faelschungssichere Update-Anmerkung"
```

---

## Aufgabe V9: `_lib/csv/` — vier Dateien, der Rundlauf-Vertrag, die fuenf Klassen

**Files:** Create `src/app/m/radio/_lib/csv/spalten.ts`, `_lib/csv/kopfzeilen.ts`,
`_lib/csv/einlesen.ts`, `_lib/csv/klassifizieren.ts`, `_lib/csv/rundlauf.test.ts`,
`_lib/csv/kopfzeilen.test.ts`, `_lib/csv/klassifizieren.test.ts`

**Interfaces:**
- Produces: `EXPORT_SPALTEN`, `formatiereZelle`, `tagAusWert`/`wertAusTag`,
  `automatischeSpaltenzuordnung`, `IMPORTIERBARE_FELDER`, `lesEinCsv`, `klassifiziereZeile`,
  `klassifiziereZeilen`, `KLASSEN_WOERTER` — gelesen von **V10** (Import-Actions), **V18**
  (Insel 4), **V22** (Export-Handler).

⛔ **KEIN `"use client"` in irgendeiner der vier Dateien** (Falle 6) — `KLASSEN_WOERTER` und
`IMPORTIERBARE_FELDER` werden von Server Components **und** von Insel 4 gelesen.

### `_lib/csv/spalten.ts` — der Rundlauf-Vertrag

⛔ **`EXPORT_SPALTEN` in fester Reihenfolge, 19 Eintraege, deutsche Kopfzeilen**, 1:1 aus
`radio-admin/server/src/routes/export.ts:16-36`. Der Grund steht im Alt-Kommentar (`:11-15`) und
ist der ganze Vertrag: „each German header MUST normalize (via autoMapHeaders) back to its device
field, **so that the exported file re-imports cleanly through the wizard**."

Die 19, in dieser Reihenfolge: `ISSI` · `TEI` · `Rufname` · `Seriennummer` · `Typ` · `Status` ·
`Standort` · `Zuordnung` · `Softwareversion` · `Zuletzt aktualisiert` · `Notizen` · `Hiorg-ID` ·
`OPTA` · `Funktion` · `Hersteller` · `Bedieneinheit` · `Gerätefunktionen` · `Alamos` · `Ausleihbar`.

⛔ **Trennzeichen `;`** (`export.ts:60`) und ⛔ **fuehrendes UTF-8-BOM fuer Excel** (`export.ts:9`,
`:61`).

`formatiereZelle(feld, wert)` — die **drei** Regeln, 1:1 aus `export.ts:45-54`:

1. `alamosIntegrated`/`loanable`: `true → 'x'`, sonst `''`. ⛔ **Nur `true` und `null` laufen rund**
   — der Importer liest `''` als `null` (`export.ts:40-41`, `commit-service.ts:27`).
2. `lastUpdatedAt`: ⛔ **wird NICHT gerechnet** — Entscheidung **E-V11**. Die Suite-Spalte ist
   bereits `YYYY-MM-DD` (`_db/schema.ts:39`).
3. Alles andere: woertlich, `null → ''`.

⛔ **`formatiereZelle` und das Formularfeld lesen ihre Umrechnung aus EINER Funktion in dieser
Datei, nicht aus zweien** (`Spec:4739-4746`, zweite Zusage).

⛔ **Keine Formel-Neutralisierung** — Entscheidung **E-V12**, mit beiden Belegzeilen als
Kommentarblock in dieser Datei.

### `_lib/csv/kopfzeilen.ts` — die automatische Zuordnung

1:1 aus `radio-admin/shared/src/import/auto-map-headers.ts`:

| Regel | Beleg |
|---|---|
| `IMPORTIERBARE_FELDER` — **19** Felder, ⛔ **ohne System-/Identitaetsfelder** (`id`, `createdAt`, `updateNote` …) | `:2-22` |
| Normalisierung: NFD, Diakritika entfernen, klein, ⛔ **nur `[a-z0-9]` behalten** | `:26-33` |
| Synonymtabelle, ⛔ **„first wins"** | `:36-89` |
| ⛔ **`Gerätefunktionen…` per PRAEFIX**, nicht exakt — der Kopf normalisiert zu einem langen Token | `:104-107` (Kommentar `:104-106`, Bedingung `:107`) |
| ⛔ **„ä" zerlegt (NFD) zu „a", nicht zu „ae"** — beide Schreibungen sind registriert (`gerat` **und** `geraet`) | `:51-52`, `:106` |
| ⛔ **Kein Dedup**: zwei Synonyme desselben Feldes bilden **beide** ab; die Aufloesung ist Sache des Aufrufers | `:97-110` |
| ⛔ **`TEI` ist KEIN ISSI-Alias** — der Kommentar sagt, dass es einer war, „only while no tei field existed" | `:38-40` |
| Unbekannter Kopf → **kein Eintrag** (bleibt fuer die Handzuordnung) | `:93-95` (Begruendung: „Headers whose normalized name matches no known synonym are omitted (left for manual mapping in the UI)") und `:109-111` (`if (field) { result[raw] = field; }`) |

⛔ **Der Kundenkopf steht im Alt-Test woertlich** (`auto-map-headers.test.ts:63-92`) und wandert als
Testfall mit — zwoelf Kopfzeilen, alle abgebildet. Er ist der einzige Beleg dafuer, dass die
Tabelle mit **echten** Daten funktioniert.

### `_lib/csv/einlesen.ts` — Kodierungserkennung

`Spec:4704-4710`: die Kodierungserkennung ueber `chardet`/`iconv-lite` „wandert als echte
Fachlogik mit". Alt-Bauteile: `radio-admin/server/src/import/decode-csv.ts` und
`parse-csv.ts` (Trennzeichenerkennung).

⛔ **Leere oder unlesbare Datei → eine Meldung, kein Wurf.** Der Alt-Handler antwortet
„Leere oder ungültige Datei" (`import.ts:28`); die Action gibt `{ ok: false, fehler: … }` zurueck.

⬜ **Der Bau prueft, ob `chardet` und `iconv-lite` im Repo bereits vorhanden sind** — ⛔ **eine
neue Abhaengigkeit ist eine Entscheidung, keine Nebenwirkung.** Sind sie es nicht, steht die Frage
als Vermerk in der Aufgabenrueckmeldung, **nicht** als stiller `pnpm add`.

### `_lib/csv/klassifizieren.ts` — die FUENF Klassen

⚠️ ⛔ **Hier weicht die Spec von der Messung ab, und die Messung gilt.** `Spec:4711-4714` sagt, die
Woerter „neu / geaendert / unveraendert" seien „aus `classify-import-row.ts` zu uebernehmen, nicht
zu erfinden". **Gemessen sind es fuenf Klassen mit anderen Woertern**
(`radio-admin/client/src/features/import/ImportWizard.tsx:60-66`):

| Klasse | Wort | Ton |
|---|---|---|
| `created` | **„Neu"** | green |
| `updated` | **„Aktualisiert"** — ⛔ nicht „geändert" | blue |
| `unchanged` | „Unverändert" | default |
| `error` | „Fehler" | red |
| `skipped-no-permission` | **„Übersprungen"** | orange |

⛔ **Die Anweisung der Spec — „uebernehmen, nicht erfinden" — wird damit ERFUELLT, nicht gebrochen:
uebernommen wird, was im Bestand steht.** Die Diskrepanz steht als Kommentar an der Konstanten.

⚠️ **Und die Farbe „red" auf `error` beruehrt Falle 3.** `colorError === colorPrimary`. ⛔ **Der
Fehlerton bleibt, aber er ist nicht der einzige Traeger** — die Klasse traegt ihr Wort, und die
Fehlerzeile traegt zusaetzlich ihren Text (`ImportWizard.tsx:286`).

Die Klassifikationsregeln, 1:1 aus `shared/src/import/classify-import-row.ts:25-53`:

1. ⛔ **Leere oder nur-Leerraum-ISSI → `error` „Leere ISSI"** (`:33-35`). ISSI ist der
   Pflicht-Schluessel.
2. ⛔ **`issi` wird aus dem Patch ENTFERNT, bevor gefiltert und gediffet wird** (`:39`) — „it is
   the match key, never a diffed/persisted field".
3. **Rollen-Allowlist auf den eingehenden Patch** (`:40`) — dieselbe `filterSchreibbareFelder` aus
   **V2**.
4. ⛔ **Unbekannte ISSI: `created` fuer Admin, `skipped-no-permission` fuer Updater** (`:43-49`).
5. **Bekannte ISSI:** `updated`, wenn der Diff nicht leer ist, sonst `unchanged` (`:52-53`).
6. ⛔ **Bei `created` wird gegen ein synthetisches ALL-NULL-Geraet gediffet**, damit die
   `oldValue`s `null` sind (`:47`, `:56-84`).

Und in `klassifiziereZeilen` (1:1 aus `commit-service.ts:131-145`):

7. ⛔ **Doppelte ISSI IN DERSELBEN DATEI: die zweite und jede weitere → `error` „Duplikat in
   Datei"** (`:135-138`).
8. Die Zusammenfassung zaehlt **alle fuenf** Klassen (`:123-129`).

Die Zellnormalisierung (`rowToIncoming`, `commit-service.ts:86-110`) wandert mit:

| Feldart | Regel | Beleg |
|---|---|---|
| Wahrheitswerte | `x`, `ja`, `yes`, `y`, `1`, `true`, `wahr`, `✓` (klein, getrimmt) → `true`; leer → `null`; ⛔ **alles andere → `false`** | `:19`, `:25-29` |
| `lastUpdatedAt` | ms-Zahl · ISO `YYYY-MM-DD` · deutsch `DD.MM.YYYY` · sonst `null`, ⛔ **nie NaN**; ⛔ **Ueberlauf wird abgelehnt** (Monat 13, Tag 32) | `:40-67` |
| `deviceModes` | Split an `/,;`+Leerraum, gross, nur bekannte Modi, ⛔ **in `DEVICE_MODES`-Reihenfolge**, dedupliziert; keine bekannten → `null` | `:74-83` |
| alles andere | getrimmt, leer → `null` | `:106` |

⚠️ **`lastUpdatedAt` trifft hier Entscheidung E-V11**: die Alt-Normalisierung liefert **ms**, die
Suite-Spalte will `YYYY-MM-DD`. ⛔ **Die drei Eingabeformen bleiben, die Ausgabe ist der
Kalendertag** — die Umrechnung laeuft ueber **dieselbe** Funktion in `_lib/csv/spalten.ts`, nicht
ueber eine zweite hier.

| Testname | Aussage |
|---|---|
| „exportiere drei Geraete, lies das Ergebnis mit der Spaltenerkennung zurueck, erhalte dieselben Felder" | ⛔ **Der Rundlauf-Vertrag, `Spec:4748-4750`. MIT JE FELD UNTERSCHIEDLICHEN WERTEN.** Der Bestand hat diesen Test (`exportRoundTrip`), er wandert mit |
| „der Rundlauf traegt auch ein Datum" | E-V11. ⛔ **Der Fall, den der Alt-Test nicht hat und der die Zeitzonenfrage entscheidet** |
| „die Exportdatei beginnt mit dem BOM" | `export.ts:9`, `:61` |
| „das Trennzeichen ist ein Semikolon" | `export.ts:60` |
| „ein wahrer Wahrheitswert wird x, ein falscher und ein leerer werden leer" | `export.ts:46-48`. ⛔ **Alle drei Lagen** |
| „ein leerer Wahrheitswert laeuft rund, ein falscher NICHT" | ⛔ **Der Fall, den der Alt-Kommentar `export.ts:40-41` ausdruecklich benennt** — `false` exportiert als `''` und importiert als `null`. **Das ist ein bekannter, gewollter Verlust**, und der Test haelt ihn fest, statt ihn zu verschweigen |
| „die neunzehn Kopfzeilen bilden alle auf ihr Feld zurueck" | Der Rundlauf-Vertrag, feldweise |
| „der echte Kundenkopf wird vollstaendig abgebildet" | 1:1 aus `auto-map-headers.test.ts:63-92`, zwoelf Koepfe |
| „Geraetefunktionen wird per Praefix erkannt, in beiden Umlautzerlegungen" | `auto-map-headers.ts:104-107` |
| „TEI bildet auf tei ab, nicht auf issi" | `:38-40` |
| „zwei Synonyme desselben Feldes bilden beide ab" | `:97-99`. ⛔ **Kein Dedup — die Aufloesung ist Sache des Aufrufers** |
| „ein unbekannter Kopf bleibt ohne Eintrag" | `:93-95`, `:109-111` |
| „leere ISSI ergibt Fehler mit dem Wort Leere ISSI" | `classify-import-row.ts:33-35` |
| „eine doppelte ISSI in derselben Datei ergibt beim zweiten Vorkommen Duplikat in Datei" | `commit-service.ts:135-138`. ⛔ **Das ERSTE Vorkommen bleibt gueltig** |
| „unbekannte ISSI ergibt Neu fuer admin und Uebersprungen fuer updater" | `:43-49`. ⛔ **Beide Rollen im selben Fall** |
| „bekannte ISSI ohne Wertunterschied ergibt Unveraendert" | `:52-53` |
| „updater aendert bei bekannter ISSI nur die drei erlaubten Felder" | ⛔ **Der Fall, der die Rollenbegrenzung im Import belegt. MIT JE FELD UNTERSCHIEDLICHEN WERTEN** |
| „jede der fuenf Klassen hat ein Wort" | ⛔ **`toBe(5)` ausserhalb der Schleife** |
| „ein Datum in deutscher Schreibweise und in ISO ergeben denselben Tag" | `commit-service.ts:49-53` |
| „ein ungueltiges Datum wird null, nie NaN" | `:58-66`. Fixture: `32.13.2026` |
| „Geraetefunktionen kommen in der kanonischen Reihenfolge zurueck" | `:81`. Fixture: Eingabe `DMO/TMO`, Ausgabe `TMO,DMO` |
| „ein unbekannter Modus faellt heraus" | `:81` |

- [ ] **Schritt 1** — Testfaelle, alle rot.
- [ ] **Schritt 2** — Sonden: **S-V9a**: eine Exportspalte umbenennen → der Rundlauf rot.
      **S-V9b**: das BOM entfernen → der BOM-Fall rot. **S-V9c**: `formatiereZelle` fuer
      `lastUpdatedAt` auf `new Date(wert).toISOString().slice(0,10)` stellen → der Datums-Rundlauf
      rot ⛔ **das ist die Sonde auf E-V11**. **S-V9d**: den Duplikatspeicher entfernen → der
      Duplikatfall rot. **S-V9e**: `filterSchreibbareFelder` im Klassifikator weglassen → der
      Updater-Feldfall rot. **S-V9f**: die `DEVICE_MODES`-Reihenfolge durch ein `sort()` ersetzen →
      der Reihenfolgefall rot.
- [ ] **Schritt 3** — bauen, vier Dateien. ⛔ **Kein `"use client"` in einer davon.**
- [ ] **Schritt 4** — Tor.

```bash
rtk git add src/app/m/radio/_lib/csv/spalten.ts src/app/m/radio/_lib/csv/kopfzeilen.ts \
            src/app/m/radio/_lib/csv/einlesen.ts src/app/m/radio/_lib/csv/klassifizieren.ts \
            src/app/m/radio/_lib/csv/rundlauf.test.ts \
            src/app/m/radio/_lib/csv/klassifizieren.test.ts \
            src/app/m/radio/_lib/csv/kopfzeilen.test.ts
rtk git commit -m "feat(radio): CSV — Rundlauf-Vertrag, Spaltenerkennung und die fuenf Importklassen"
```

---

## Aufgabe V10: `admin/actions.ts` — die neun Server Actions

**Files:** Create `src/app/m/radio/admin/actions.ts`

**Interfaces:**
- Produces: `geraetAnlegenAction`, `geraetAendernAction`, `geraetLoeschenAction`,
  `notizAnfuegenAction`, `versionAnlegenAction`, `versionZielSetzenAction`,
  `versionLoeschenAction`, `versionenSortierenAction`, `importSchreibenAction` — ⛔ **direkt
  importiert** von den Inseln in V13, V14, V17, V18, V19. ⛔ **NEUN, nicht zehn:**
  `importVorschauAction` ist nach Entscheidung **E-V16** ein Route Handler und entsteht in **V18**.

⛔ **`"use server"` am Dateikopf** (`Spec:4649`). ⛔ **Jede Action ruft ihren Riegel SELBST** — es
gibt kein Layout ueber einer Action (`Spec:4382-4386`): „Die Zeile in jeder Action ist ebenfalls
keine Redundanz — **wer sie fuer doppelt haelt und entfernt, oeffnet die Luecke, gegen die der
Riegel gebaut ist.**"

⚠️ **Diese Aufgabe hat KEINEN eigenen Waechter — V11 baut ihn im naechsten Commit.** ⛔ **Das ist
eine bewusste Reihenfolge, kein Versehen:** der Scan braucht die Datei, um nicht leer-gruen zu sein.
⛔ **V10 und V11 duerfen nicht zusammengelegt werden** — dann waere der Scan im selben Diff
entstanden wie das, was er bewachen soll, und niemand haette ihn je rot gesehen.
⛔ **Die Rueckmeldung von V10 nennt V11 als unmittelbaren Nachfolger, namentlich.**

### Die Aufruftabelle (`Spec:4653-4658`)

| Action | Signatur | ⛔ **Erste Anweisung** | `quelle` |
|---|---|---|---|
| `geraetAnlegenAction` | `(werte: GeraetEingabe) => Promise<Ergebnis<{ id: string }>>` | `await requireRadioAdmin()` | `create` |
| `geraetAendernAction` | `(id: string, patch: GeraetPatch) => Promise<Ergebnis>` | `const { viewer, rolle } = await requireRadioVerwaltung()` | `manual` |
| `geraetLoeschenAction` | `(id: string) => Promise<Ergebnis>` | `await requireRadioAdmin()` | — |
| `notizAnfuegenAction` | `(id: string, text: string) => Promise<Ergebnis>` | `await requireRadioVerwaltung()` | `update-note` |
| `versionAnlegenAction` | `(wert: string) => Promise<Ergebnis>` | `await requireRadioAdmin()` | — |
| `versionZielSetzenAction` | `(id: string) => Promise<Ergebnis>` | `await requireRadioAdmin()` | — |
| `versionLoeschenAction` | `(id: string) => Promise<Ergebnis>` | `await requireRadioAdmin()` | — |
| `versionenSortierenAction` | `(ids: string[]) => Promise<Ergebnis>` | `await requireRadioAdmin()` | — |
| ~~`importVorschauAction`~~ | ⛔ **ENTFAELLT — Route Handler `admin/(arbeit)/import/hochladen/route.ts`, gebaut in V18** (Entscheidung **E-V16**; benannte Abweichung von `Spec:4657`) | `radioHostOderNull(...) === null → 404`, danach `!istRadioAdmin(await viewerOderNull()) → 404` | — |
| `importSchreibenAction` | `(zuordnung: Spaltenzuordnung, zeilen: string[][]) => Promise<Ergebnis<ImportBilanz>>` | `await requireRadioAdmin()` | `csv-import` |

⛔ **SIEBEN auf `requireRadioAdmin`, ZWEI auf `requireRadioVerwaltung`** — die Zahlen stehen in V11
als eigene Zusicherung, ⛔ **zwei `toBe`, nicht eines.**

⚠️ **Nachgezaehlt, nicht uebernommen — hier stand bis zur Kritikrunde „sechs und vier", und das war
falsch.** `Spec:4655-4664` fuehrt zehn Zeilen: **acht** mit `requireRadioAdmin` (`geraetAnlegen`,
`geraetLoeschen`, die vier Versions-Actions, `importVorschau`, `importSchreiben`) und **zwei** mit
`requireRadioVerwaltung` (`geraetAendern`, `notizAnfuegen`). Mit **E-V16** faellt `importVorschau`
heraus — bleiben **sieben und zwei**. ⛔ **Eine falsche Zahl in einem `toBe` ist rot-by-construction
oder wird auf den falschen Wert „repariert" — genau die NT11-Klasse.**

**Rueckgabe durchgehend `{ ok: true } | { ok: false; fehler: string }`** (`Spec:4650-4651`), mit
den Meldungstexten **woertlich** aus der 1:1-Tafel Abschnitt E.

### `geraetAendernAction` — die Reihenfolge ist der ganze Punkt

1:1 aus `radio-admin/server/src/routes/devices.ts:126-157`, und `Spec:4586-4592` schreibt sie aus:

1. Geraet lesen; fehlt es → `{ ok: false, fehler: … }`.
2. ⛔ **Rolle-Filter** `filterSchreibbareFelder(rolle, patch)` (**V2**).
3. `diffGeraet(bestehend, erlaubt)` (**V8**).
4. ⛔ **Leerer Diff ⇒ FRUEHER AUSSTIEG mit dem unveraenderten Geraet** (`devices.ts:139-142`).
   **Kein Ereignis, kein `updatedAt`, kein `revalidatePath`.**
5. Sonst ⛔ **EINE Transaktion**: neue Softwareversion registrieren (nur wenn gesetzt) → Geraet
   schreiben → Ereignisse schreiben (`devices.ts:146-153`).
   ⛔ **Grund, woertlich (`:144-145`): „roll back together (e.g. changing issi to an existing one
   rolls back)"** — die schaerfere Formulierung „a duplicate-ISSI throw rolls back the whole write"
   steht auf dem Anlegeweg, `devices.ts:110-111`.
6. `revalidatePath` mit der **inneren** Form, drei Pfade.

⛔ **Der Rolle-Filter steht VOR dem Diff, nicht danach.** Umgekehrt entstuenden Ereigniszeilen fuer
Felder, die gar nicht geschrieben werden — und die Historie behauptete eine Aenderung, die es nicht
gab.

### `geraetLoeschenAction` — ⬜ V-L6

`Spec:4686-4691` gibt die Frage ausdruecklich weiter, und die Vorbelegung dieses Plans steht in
⬜ **V-L6**: ⛔ **abgelehnt, wenn eine offene Leihe existiert** (`returned_at IS NULL` auf
`loans.device_id`), mit einer Meldung — ⛔ **nicht mit einem versteckten Knopf**
(`Spec:4690-4691`: „`GeraetLoeschen.tsx` zeigt die Ablehnung als Meldung im `Popconfirm`-Zweig").

⚠️ **Das ist eine BENANNTE ABWEICHUNG vom Bestand** (`deviceRepo.ts:67-70` prueft nichts) und steht
als Kommentar mit dieser Belegzeile an der Ablehnung.

⛔ **`device_events` braucht keine eigene Behandlung** — der FK ist `onDelete: "cascade"`
(`_db/schema.ts:127-129`), und `foreign_keys = ON` ist gesetzt (`src/core/db/index.ts:19`).

Danach: `revalidatePath` zweimal, dann `redirect("/m/radio/admin/geraete")` (`Spec:4605`).

### `versionLoeschenAction` und `versionZielSetzenAction`

* ⛔ **Loeschen gesperrt, solange `deviceCount > 0`** (`softwareVersionRepo.ts:102-120`), mit dem
  woertlichen Text „Version wird noch von N Gerät(en) genutzt".
* ⛔ **`setTargetVersion` setzt ZUERST und prueft `changes === 0`**, bevor es die anderen abraeumt
  (`softwareVersionRepo.ts:79-88`) — „so we bail without having cleared anything (no pre-flight
  existence SELECT needed)". ⛔ **Ein `SELECT`-dann-`UPDATE` waere hier ein Wettlauf und ein
  fachlicher Fehler: eine unbekannte Id loeschte die Marke ueberall.**
* `versionAnlegenAction`: Duplikat → **409-Aequivalent** mit „Diese Version existiert bereits"
  (`softwareVersions.ts:34`, `SoftwareVersionsPage.tsx:37`); der Weg ist `onConflictDoNothing` und
  die Pruefung `res.changes > 0` (`softwareVersionRepo.ts:54-59`).
* `versionenSortierenAction`: ⛔ **die erste Id bekommt den HOECHSTEN `sortOrder`**
  (`ids.length - index`, `softwareVersionRepo.ts:131`), unbekannte Ids werden ignoriert, die
  Ziel-Marke bleibt unberuehrt (`:124-125`).

### Der zweiphasige Import — `importSchreibenAction` hier, der Dateischritt als Handler in V18

⛔ **Zweiphasig, und das ist keine Formsache** (`Spec:4695-4702`): „Eine einphasige Suite-Fassung
(‚Datei hoch, fertig') ist **kein Port, sondern ein anderes Produkt** — der Import ist der Weg, ueber
den Geraete tatsaechlich in den Bestand kommen."

* ⛔ **Der Dateischritt ist KEINE Action mehr, sondern der Route Handler
  `admin/(arbeit)/import/hochladen/route.ts`** (Entscheidung **E-V16**, gebaut in **V18**): er liest
  die Datei (`FormData`), erkennt Kodierung und Trennzeichen, gibt **Spaltennamen und Rohzeilen** als
  **JSON** zurueck und ⛔ **schreibt NICHTS**. Er traegt die nicht-werfende Riegelform (404, nie 403).
* `importSchreibenAction` ⛔ **klassifiziert ERNEUT** und schreibt in ⛔ **EINER Transaktion**.
  Die erneute Klassifikation ist kein Doppelaufwand — der Bestand hat sich zwischen Vorschau und
  Schreiben veraendern koennen, und der Alt-Weg ruft `commit` ebenfalls zweimal
  (`ImportWizard.tsx:107`, `:123`).
* ⛔ **`quelle` ist `csv-import`** fuer jede geschriebene Ereigniszeile.
* ⛔ **Die Rolle wird MITGEGEBEN** (`classifyRows({ …, role })`, `import.ts:54`) — auch wenn die
  Action ohnehin `requireRadioAdmin()` ruft. Grund: der Klassifikator ist die 1:1-Fachlogik, und
  eine Abzweigung „hier ist es ja immer admin" waere ein zweiter Wahrheitsort. ⚠️ **Und E-V4s
  Verschaerfung steht als Kommentar daneben**, mit `import.ts:17`, `:40` und
  `classify-import-row.ts:43-49`.

⛔ **Diese Aufgabe schreibt KEINE Tests fuer `admin/actions.ts` selbst** — die Fachlogik darunter
ist in V5–V9 geprueft, und der Riegel-Scan kommt in V11. ⚠️ **Was sie schreibt, sind die
Verhaltenszusicherungen, die NUR hier sichtbar sind** — sie wandern in **V11**s Datei, weil dort
ohnehin die einzige Testdatei zu `admin/` entsteht:

| Testname (in `admin/actions.test.ts`, V11) | Aussage |
|---|---|
| „geraetAendernAction schreibt bei leerem Diff kein Ereignis" | `devices.ts:139-142`, `deviceRepo.ts:229` |
| „geraetAendernAction filtert die Rolle VOR dem Diff" | Fixture: Updater aendert `rufname` und `status` — es entsteht **ein** Ereignis, nicht zwei |
| „geraetAendernAction rollt bei einer ISSI-Kollision alles zurueck" | `devices.ts:144-145`. ⛔ **Nach dem Fehlschlag steht weder die neue Softwareversion noch eine Ereigniszeile** |
| „versionZielSetzenAction raeumt bei unbekannter Id keine Marke ab" | `softwareVersionRepo.ts:79-88`. ⛔ **Der Wettlauf-Fall** |
| „versionLoeschenAction lehnt ab, solange Geraete die Version tragen" | `:102-120`, mit dem woertlichen Text |
| „geraetLoeschenAction lehnt bei offener Leihe ab" | ⬜ **V-L6**, die benannte Abweichung |
| „notizAnfuegenAction benutzt EINEN Zeitstempel fuer Zeile und Ereignis" | `devices.ts:172-176` |
| „notizAnfuegenAction schreibt als newValue NUR die neue Zeile" | `devices.ts:180` |

- [ ] **Schritt 1** — `admin/actions.ts` bauen, **neun** Actions, jede mit ihrem Riegel als **erster**
      Anweisung.
- [ ] **Schritt 2** — die `revalidatePath`-Listen aus der 1:1-Tafel Abschnitt D eintragen.
      ⛔ **Innere Form, immer.**
- [ ] **Schritt 3** — die woertlichen Meldungstexte als **benannte Konstantenliste** am Dateikopf,
      nicht inline.
- [ ] **Schritt 4** — Tor. ⛔ **Ohne eigene Testdatei; die Rueckmeldung nennt V11 namentlich als
      unmittelbaren Nachfolger.**

```bash
rtk git add src/app/m/radio/admin/actions.ts
rtk git commit -m "feat(radio): die zehn Verwaltungs-Server-Actions"
```

---

## Aufgabe V11: `admin/actions.test.ts` — der vierte Scan, mit der dreiteiligen Reparatur

**Files:** Create `src/app/m/radio/admin/actions.test.ts` · ggf. Modify
`src/app/m/radio/riegel.test.ts` (nur `export` an drei Funktionen, Entscheidung **E-V13**)

**Interfaces:**
- Produces: nichts. ⛔ **Er ist laut `Spec:4853-4857` der EINZIGE Waechter der Aufruftabelle aus
  §5.4 — kein anderes Gate sieht eine vergessene Zeile.**

⛔ **Das ganze Kapitel „Der vierte Quelltext-Scan" gilt hier**, insbesondere:

* **Die dreiteilige Reparatur ist lasttragend, nicht zeremoniell** — die Kernzusicherung ist
  **negativ** (`toEqual([])`), und genau daran schwaechte der Kommentarschnitt-Fehler drei Waechter
  still ab.
* ⛔ **`bereinigt` wird aus `_lib/quelltextScan.ts` IMPORTIERT, nicht kopiert und NICHT aus
  `riegel.test.ts` bezogen** (E-V13 — der Import aus einer `.test.ts` ist ausgeschlossen, gemessen).
  ⛔ **Diese Aufgabe legt die Hilfsdatei an und stellt `riegel.test.ts` im SELBEN Commit darauf um** —
  ⛔ **niemals eine dritte Kopie.**
* ⛔ **UND `riegel.test.ts:1208-1221` zieht mit** („kein Scan dieser Datei liest die ungeschuetzte
  Fassung direkt", `toBe(2)`): der Fall zaehlt die Nadel im **eigenen** Dateitext und ist rot, sobald
  die Funktionen die Datei verlassen. Er wird auf `_lib/quelltextScan.ts` gerichtet und behaelt
  `toBe(2)`. ⛔ **Nicht loeschen, und die Zahl nicht anpassen, bevor gemessen ist, dass sie stimmt.**
* ⛔ **Der Selbsttest ist Pflicht**, Vorbild `riegel.test.ts:1157`.

Die **elf** Zusicherungen stehen vollstaendig in jenem Kapitel und werden hier nicht wiederholt.
Drei Punkte zur Ausfuehrung:

1. ⛔ **`ACTION_ANZAHL = 9` steht als Konstante OBEN in der Datei** (⛔ **neun, nicht zehn** — E-V16), mit `toBe`, und mit einem
   Anhebe-Fahrplan im Kommentar — Form und Begruendung zeichengleich zu
   `riegel.test.ts:100-118` und `guards.test.ts:56-88`.
2. ⛔ **Die vier Seiten-Zusicherungen (Faelle 7–10) sind heute ueber einer leeren Menge.** Sie
   werden als `it.todo` mit dem Aufgabennamen im Text angelegt (V19, V20, V21) — ⛔ **nicht als
   gruene Faelle ueber `null`.** Eine `it.todo` meldet sich in der Ausgabe; ein leer-gruener Fall
   nicht. **V19, V20 und V21 wandeln sie um.**
3. ⛔ **Er ersetzt `_actions/guards.test.ts` NICHT und aendert dort KEINE Zahl.** Zwei Scans, weil
   zwei Ordner (⬜ V-L9).

- [ ] **Schritt 1** — die elf Faelle schreiben. ⛔ **Erst gegen den unveraenderten `admin/actions.ts`
      aus V10 laufen lassen: sie muessen GRUEN sein.** Ist einer rot, hat V10 einen echten Fehler —
      und **das ist dann der Fund, nicht der Test.**
- [ ] **Schritt 2** — Sonden, und **hier sind sie der eigentliche Zweck der Aufgabe**:
      **S-V11a**: die erste Anweisung einer Action entfernen → Fall 3 rot.
      **S-V11b**: `requireRadioAdmin()` in `versionLoeschenAction` durch `requireRadioVerwaltung()`
      ersetzen → Fall 6 rot ⛔ **das ist die faelschliche Absenkung, die `riegel.test.ts`
      strukturell nicht faengt**.
      **S-V11c**: eine elfte Action anhaengen → Fall 1 rot.
      **S-V11d**: eine Action als `export const x = async () => {}` schreiben → Fall 5 rot.
      **S-V11e**: einen Riegelaufruf **hinter** einen `//`-Kommentar mit einem Regexliteral in
      derselben Zeile setzen (z. B. `const p = /\//; // await requireRadioAdmin()`) → ⛔ **der Fall
      MUSS rot bleiben.** Bleibt er gruen, ist die dreiteilige Reparatur nicht angekommen, und die
      Aufgabe ist nicht fertig.
      **S-V11f**: `"use server"` aus dem Dateikopf entfernen → Fall 2 rot.
- [ ] **Schritt 3** — den Selbsttest schreiben (Fall 11).
- [ ] **Schritt 4** — Tor. ⛔ **Zusaetzlich:** `rtk pnpm vitest run src/app/m/radio` — ⛔ **alle
      vier Scans** (`riegel.test.ts`, `_lib/bauform.test.ts`, `_actions/guards.test.ts`,
      `admin/actions.test.ts`) gruen, und die drei alten mit **unveraenderten** Zahlen.

```bash
rtk git add src/app/m/radio/admin/actions.test.ts src/app/m/radio/_lib/quelltextScan.ts \
            src/app/m/radio/riegel.test.ts
rtk git commit -m "feat(radio): der vierte Quelltext-Scan mit der dreiteiligen Reparatur"
```

---

## ⚠️ Was ab hier fuer JEDE Seitenaufgabe gilt (V12–V21)

Damit es nicht zehnmal dasteht:

1. ⛔ **Erste Anweisung ist der Personen-Riegel der Stufe aus der Rechtestufen-Tafel** — und **nur**
   er. ⛔ **Jede der zehn Aufgaben nennt ihn im eigenen Koerper NOCH EINMAL, mit ihrer Spec-Zeile.**
   ⚠️ **Das ist keine Redundanz, sondern eine Lehre aus der Kritikrunde:** V13–V17 taten es
   urspruenglich **nicht**, waehrend V12 und V18–V21 es taten — und die Asymmetrie liest sich fuer
   einen Subagenten wie „hier ist nichts verlangt". `riegel.test.ts` Klausel (a)/(e) faengt eine
   **fehlende** Zeile; sie faengt eine **faelschlich abgesenkte** strukturell nicht. ⛔ **KEIN `requireRadioHost` in einer Seite innerhalb einer Route-Group**
   (`riegel.test.ts:646-653`, `Spec:4369-4378`).
2. ⛔ **`ADMIN_SEITEN_ANZAHL` in `riegel.test.ts:119` wird um genau eins angehoben** —
   Entscheidung **E-V2**. ⛔ **Niemals `toBe` → `>=`.**
3. ⛔ **Seite und ihre Insel(n) landen in DERSELBEN Aufgabe** (Architecture-Kapitel, Schnitt 1).
4. ⛔ **Die Insel bekommt nur serialisierbare, vorformatierte Daten** — keine `Date`, keine
   DB-Objekte, keine Funktionen. Server Actions werden **direkt importiert**.
5. ⛔ **Kein Zeichenpaket-Import in einer Datei ohne `"use client"`** (Falle 7). Die Zeichen kommen
   aus `_ui/ikonen.tsx` (E-V7).
6. ⛔ **Kein `size` auf einem Bedienelement** (Falle 4). Platz schafft
   `scroll={{ x: "max-content" }}`.
7. ⛔ **Kein Rot auf einer Datenflaeche** (Falle 3). `danger` nur auf zerstoerenden Knoepfen.
8. ⛔ **Kein zweiter Hexsatz und kein zweites Ikonenmodul** (NS-A8b).
9. **Der Insel-Test laeuft ueber `src/app/m/qr/_lib/test-dom.tsx`** — ⛔ **kein zweites Harness**
   (`CLAUDE.md:259`). ⚠️ **Er kann Falle 9 strukturell NICHT finden** (`Spec:4871-4872`):
   „jsdom ist ein einziger JS-Prozess ohne RSC-Grenze. Sie pruefen **Verhalten**, nicht
   **Serialisierbarkeit**." ⛔ **Der Beweis ist der Playwright-Fall in V23.**
10. ⛔ **Jede Aufgabe traegt ihren Playwright-Fall in `e2e/radio-verwaltung.spec.ts` NACH** — die
    Datei entsteht mit **V12** und waechst; sie **laeuft** aber erst in **V23**
    (`CLAUDE.md`: Playwright einmal vor dem Merge, nie davor).

---

## Aufgabe V12: `/admin` — die Uebersicht, ohne Insel

**Files:** Create `src/app/m/radio/admin/(arbeit)/page.tsx`,
`src/app/m/radio/_ui/verwaltung.module.css`, `e2e/radio-verwaltung.spec.ts` ·
Modify `src/app/m/radio/riegel.test.ts` (**`ADMIN_SEITEN_ANZAHL` 0 → 1**)

**Interfaces:** Consumes `requireRadioVerwaltung` (V3), `geraeteKennzahlen`/`geraeteListe` (**V6**),
`zielVersion` (**V5**).

⛔ **DIE ERSTE VERWALTUNGSSEITE ueberhaupt. Zwei Dinge passieren hier zum ersten Mal:**

* `ADMIN_SEITEN_ANZAHL` bewegt sich (E-V2). ⛔ **Der Waechter wird beim ersten Lauf ROT sein — das
  ist sein Zweck, nicht ein Fehler.**
* ⛔ **`admin/(arbeit)/layout.tsx` wird zum ersten Mal ueberhaupt gerendert.** Bis heute liegt unter
  der Group **keine** Seite; „ob das Layout einer Route-Group ohne Seite darunter ueberhaupt
  ausgefuehrt wird, ist ⬜ Z-L1" (`riegel.test.ts:49-53`). ⛔ **V12 macht das Ablesen MOEGLICH; das
  Ablesen selbst gehoert V23** — ⛔ **kein Kommentar dieser Aufgabe darf behaupten, der Riegel
  greife.**

### Der Aufbau (§5.11, `Spec:4778-4794`) — Entscheidung **E-V15**

⛔ **KEINE Insel.** `Card`, `Statistic`, `Tag` sind in einer Server Component sicher
(`CLAUDE.md:13`). Damit das so bleibt:

* Vier Kennzahlkarten — „Geräte gesamt" · „Aktuell" · „Veraltet" · „Unbekannt", 1:1 aus
  `Dashboard.tsx:27-53`. ⛔ **Die drei mit Filter werden `next/link` um die `Card`**, Ziel
  `/m/radio/admin/geraete?updateStand=<wert>`; „Geräte gesamt" ist **nicht** klickbar
  (`Dashboard.tsx:61`).
* ⛔ **Die drei Alt-Hexwerte wandern NICHT mit** (`#3f8600`, `#cf1322`, `#8c8c8c`,
  `Dashboard.tsx:33`, `:41`, `:49`) — Falle 3. „Veraltet" traegt `color="warning"`, „Aktuell"
  `color="success"`, „Unbekannt" `default` (`Spec:4555-4561`).
* Liste der **fuenf** juengsten veralteten Geraete (`geraeteListe` mit `updateStand: "veraltet"`,
  `seitenGroesse: 5`, 1:1 aus `Dashboard.tsx:21`). ⛔ **Als schlichte `<ul>` mit Links — kein
  `List.Item.Meta` (Falle 1), kein `renderItem` (Falle 9).**
* „Alle veralteten anzeigen" als **Link**, nicht `Typography.Link` mit `onClick`.
* Leertext „Keine veralteten Geräte" (`Dashboard.tsx:87`).

⛔ **`_ui/verwaltung.module.css` entsteht hier** und traegt ⛔ **eigene Klassen statt `--ant-*`**
(Falle 2, `Spec:4257`): „antd deklariert sie auf seiner Scope-Klasse. Eigenes Markup sieht sie
nicht, und **der Fehler ist still** (die Linie verschwindet einfach)."

| Testname | Aussage |
|---|---|
| (riegel.test.ts) „die Seitenzahl steht EXAKT auf dem Stand dieses Planteils" | ⛔ **`ADMIN_SEITEN_ANZAHL = 1`** |
| (riegel.test.ts) „jede nennt den Riegel ihrer Group" | Die neue Seite traegt `requireRadioVerwaltung(` |

**Playwright-Fall, nachgetragen (laeuft in V23):** `/admin` → 200, **vier** Kennzahlen sichtbar,
⛔ **„Veraltet" ist NICHT rot** (`Spec:4877`, Fall 1 — ⚠️ `Spec:4876` ist eine Leerzeile).

- [ ] **Schritt 1** — ⛔ **`e2e/helpers/radio.ts` anlegen** und **danach** `e2e/radio-verwaltung.spec.ts`
      mit dem ersten Fall.
      ⛔ **Ohne den Helfer erreicht die Datei den `radio`-Host gar nicht:** `playwright.config.ts:65`
      fuehrt genau **einen** `baseURL`, und der zeigt auf `http://portal.localtest.me:3100` — jeder
      **relative** Aufruf landete dort. Der Helfer traegt, 1:1 nach dem Vorbild
      `e2e/helpers/lagerbuch.ts`: `RADIO_HOST`, `RADIO_PORT`, `radioUrl(pfad)` (`:89`),
      `FREMDER_HOST` (`:28`) und `fremdUrl(pfad)` (`:94`).
      ⛔ **`klickeWennRuhig` aus `e2e/fixtures.ts` fuer jeden Navigationsklick** (Falle 12).
- [ ] **Schritt 2** — `admin/(arbeit)/page.tsx` bauen, ohne Insel.
- [ ] **Schritt 3** — `ADMIN_SEITEN_ANZAHL` **0 → 1**. ⛔ **Eine Zeile.**
- [ ] **Schritt 4** — Sonden: **S-V12a**: `requireRadioVerwaltung()` aus der Seite entfernen →
      Klausel (e) rot ⛔ **das ist die Gegenprobe, dass der Waechter die neue Seite wirklich
      sieht**. **S-V12b**: `ADMIN_SEITEN_ANZAHL` auf 0 zuruecksetzen → der Zaehlfall rot.
      **S-V12c**: eine Kennzahlkarte auf `#cf1322` setzen → ⛔ **kein Vitest-Fall faengt das** —
      **deshalb steht die Farbe im Playwright-Fall, und die Sonde wird in V23 gefahren, mit einem
      Vermerk hier.**
- [ ] **Schritt 5** — Tor.

```bash
rtk git add "src/app/m/radio/admin/(arbeit)/page.tsx" src/app/m/radio/_ui/verwaltung.module.css \
            e2e/helpers/radio.ts \
            src/app/m/radio/riegel.test.ts e2e/radio-verwaltung.spec.ts
rtk git commit -m "feat(radio): die Verwaltungsuebersicht — vier Kennzahlen in einer Abfrage"
```

---

## Aufgabe V13: `/admin/geraete` — Insel 1, der teuerste Posten

**Files:** Create `admin/(arbeit)/geraete/page.tsx`, `.../GeraeteTabelle.tsx`,
`.../GeraeteWerkzeugleiste.tsx`, `.../SpaltenWahl.tsx`, `.../FilterSchublade.tsx`,
`.../NeuGeraetModal.tsx`, `.../GeraeteTabelle.test.tsx`, ⛔ **`src/app/m/radio/_lib/suchparameter.ts` +
Test** (⛔ **unter `_lib/`, NICHT unter `geraete/` — die Datei stand hier zweimal in zwei
Verzeichnissen; die Wahl ist nicht kosmetisch: unter `_lib/` gilt fuer sie `riegel.test.ts`s
Direktivenscan, `riegel.test.ts:1064`, unter `geraete/` nicht, und der Vorbildverweis auf
`lagerbuch/.../journalFilterLogik.ts` stuetzt dieselbe Seite**) ·
Modify `riegel.test.ts` (**1 → 2**), `e2e/radio-verwaltung.spec.ts`

**Interfaces:** Consumes `geraeteListe`, `vorschlaege` (**V6**), `geraetAnlegenAction` (V10),
`istRadioAdmin`-Ergebnis als `darfAnlegen`/`darfExportieren` (V3).

⛔ **ERSTE ANWEISUNG: `await requireRadioVerwaltung()`** (`Spec:4370`).

⛔ **DIE GROESSTE AUFGABE DIESES PLANTEILS.** `Spec:4512-4521` nennt sie „den teuersten Posten":
heute auf zwei Dateien verteilt — `deviceColumns.tsx` haelt **18 Spaltendefinitionen mit 15
`render`**, `DeviceList.tsx` haelt das `<Table>` und ruft `buildColumns(visibleColumns)`.
⛔ **Beide gehoeren in DIESELBE Insel.** Bliebe `deviceColumns.tsx` serverseitig, wanderten die 15
Funktionen als Prop ueber die Grenze:
`Error: Functions cannot be passed directly to Client Components`.

⛔ **`COLUMN_DEFS` wird Teil von `GeraeteTabelle.tsx` bzw. eines `"use client"`-Nachbarmoduls —
NICHT von `_lib/`** (Falle 6 **und** 9).

### `page.tsx` — Server Component

```ts
export const dynamic = "force-dynamic";   // Spec:4555, Vorbild lagerbuch journal/page.tsx:24
```

Sie liest `searchParams`, normalisiert **serverseitig** (`_lib/suchparameter.ts` — Vorbild
`lagerbuch/.../journalFilterLogik.ts`), ruft `geraeteListe(db, …)` und `vorschlaege(db)` und
uebergibt **fertige Zeilen**.

### Der Suchparameter-Vertrag (§5.7.1, `Spec:4631-4645`)

| Parameter | Bedeutung | Beleg |
|---|---|---|
| `q` | Freitext, ⛔ **300 ms entprellt IN DER INSEL** | `DeviceList.tsx:66-75` |
| `sf` | Suchfelder, **kommagetrennt** | `DeviceList.tsx:70-71` |
| `seite` | 1-basiert | `DeviceList.tsx:126` |
| `sortierung` | `schluessel:asc\|desc` | ⛔ **gebaut wie `DeviceList.tsx:120-123`** |
| die **zehn** Filter | `updateStand`, `status`, `lagerort`, `geraeteTyp`, `funktion`, `hersteller`, `geraeteFunktionen`, `ausleihbar`, `alamos`, `hatAbweichung` | `DeviceList.tsx:82-91` — ⛔ **jeder EINZELN abgebildet, ausdruecklich nicht per Spread, „so that clearing a filter actually removes it"** |
| Seitengroesse | ⛔ **fest 20, kein Groessenwechsler** | `DeviceList.tsx:28`, `:168` |

⛔ **Regime B, Hausmuster:** die Blaetterung, die Sortierung und die Filter laufen ueber die **URL**,
nicht ueber antds `Table`-internes `onChange`. Vorbild
`lagerbuch/verwaltung/(arbeit)/journal/{page,JournalFilter,JournalTable}.tsx`. ⛔ **`pagination={false}`
an der Tabelle**; die Blaetterung ist eine eigene, URL-schreibende Komponente.

### Insel 1 — die Props-Grenze liegt GENAU EINMAL (Entscheidung **E-V6**)

```ts
type GeraeteTabelleProps = {
  zeilen: GeraetZeile[];
  gesamt: number;
  seite: number;
  seitenGroesse: number;
  sortierung: string | null;
  filter: GeraetFilter;
  vorschlaege: Record<Vorschlagsfeld, string[]>;
  darfAnlegen: boolean;        // rolle === "admin"
  darfExportieren: boolean;    // rolle === "admin"
};
```

`GeraeteWerkzeugleiste`, `SpaltenWahl`, `FilterSchublade` und `NeuGeraetModal` bekommen ihre Daten
**von `GeraeteTabelle`**, nicht vom Server — sie teilen Zustand (`visibleColumns`, `searchFields`,
`filters`, `DeviceList.tsx:49-63`, `:79-94`).

⛔ **`darfAnlegen`/`darfExportieren` sind BOOLEANS, keine Funktionen und keine Viewer-Objekte.**
1:1 aus `DeviceList.tsx:150` (`{isAdmin && …}`). ⛔ **Und sie sind eine Anzeige-Entscheidung, keine
Sperre** — die Sperre ist `requireRadioAdmin()` in `geraetAnlegenAction`.

### Was 1:1 wandert

* **Die 18 Spaltendefinitionen samt Etiketten und Sortierbarkeit** (`deviceColumns.tsx:16-35`);
  sortierbar sind sechs: `rufname`, `issi`, `updateStatus`, `status`, `location`,
  `softwareVersion`.
* **Die acht Vorgabespalten** (`deviceColumns.tsx:37-39`): `rufname`, `issi`, `funktion`,
  `deviceType`, `updateStatus`, `status`, `location`, `hasUpdateNote`.
* **Die zwoelf waehlbaren Suchfelder und die sieben Vorgabe-Suchfelder**
  (`SearchFieldPicker.tsx:5-21`).
* **`buildColumns` behaelt die `COLUMN_DEFS`-Reihenfolge und ignoriert unbekannte gespeicherte
  Schluessel** (`deviceColumns.tsx:41-46`).
* **`usePersistentState` fuer `ra-device-columns` bleibt** — reine Darstellung.
  ⛔ **Fuer `ra-device-search-fields` NICHT**: sie gehen in die Suchparameter (`Spec:4627-4630`).
  ⚠️ **Der Speicherschluessel wird ein Suite-eigener** — ein `ra-`-Praefix im `localStorage` der
  Suite ist ein Fremdname, und die zwei Anwendungen teilen sich nach dem Schwenk denselben Origin.
* **Die Erstspalte faellt auf `opta || rufname || '—'` zurueck** (`deviceColumns.tsx:17`).
* **`onRow` mit Klick auf die Detailseite** (`DeviceList.tsx:182-185`) — ⛔ **in der Insel, wo es
  hingehoert.**
* **Der mobile `<List>`-Zweig** (`DeviceList.tsx:188-231`), inklusive der `Tag`-Zeile mit
  „Abweichung" — ⛔ **in derselben Insel**, weil `Grid.useBreakpoint()` ein Client-Hook ist.

⛔ **Der Filterzaehler am Knopf** (`countActiveFilters`, `DeviceFilterDrawer.tsx:14-24`) wandert 1:1
— er zaehlt `updateStatus` einzeln, die sechs Listen je als **eins**, und die drei Schalter je als
**eins**.

| Testname (`GeraeteTabelle.test.tsx`, ueber `qr/_lib/test-dom.tsx`) | Aussage |
|---|---|
| „die Spaltenauswahl schaltet eine Spalte an und aus" | `Spec:4864`. Der Fall, den §5.13 namentlich nennt |
| „der Filterzaehler stimmt" | `Spec:4864`; 1:1 gegen `countActiveFilters` |
| „acht Spalten sind vorgewaehlt" | `deviceColumns.tsx:37-39`. ⛔ **`toBe(8)` ausserhalb der Schleife** |
| „achtzehn Spalten stehen zur Wahl" | ⛔ **`toBe(18)`** |
| „ein unbekannter gespeicherter Spaltenschluessel wird ignoriert" | `deviceColumns.tsx:41-46` |
| „die Erstspalte faellt auf OPTA, dann Rufname, dann einen Gedankenstrich zurueck" | `deviceColumns.tsx:17`. ⛔ **Alle drei Lagen** |
| „ein gesetzter Filter landet in der URL" | Regime B. Der Fall, den auch Playwright fuehrt |
| „das Anlegen-Knopf fehlt, wenn darfAnlegen falsch ist" | `DeviceList.tsx:150` |
| (`suchparameter.test.ts`) „ein geleerter Filter verschwindet aus den Parametern" | ⛔ **Der Fall aus `DeviceList.tsx:77-78`** |
| (`suchparameter.test.ts`) „die Sortierung wird als schluessel:richtung gelesen und geschrieben" | `DeviceList.tsx:120-123` |
| (`suchparameter.test.ts`) „ein unbekannter Sortierschluessel wird verworfen, nicht durchgereicht" | E-V9, zweite Verteidigungslinie vor dem Lesepfad |
| (`suchparameter.test.ts`) „die Seitengroesse ist fest zwanzig" | `DeviceList.tsx:28` |
| (riegel.test.ts) Seitenzahl | ⛔ **1 → 2** |

**Playwright-Fall (V23):** `/admin/geraete` → 200, Tabelle **mit Kopfzeile** sichtbar, ⛔ **ein
Filter gesetzt ⇒ die URL traegt ihn** (`Spec:4878`, Fall 2).

- [ ] **Schritt 1** — `suchparameter.ts` + Test zuerst; sie sind die Fachlogik ohne Oberflaeche.
- [ ] **Schritt 2** — Insel-Test schreiben, rot.
- [ ] **Schritt 3** — Sonden: **S-V13a**: `COLUMN_DEFS` aus der Insel nach `_lib/` verschieben →
      ⛔ **kein Vitest-Fall wird rot** — **das ist der Beweis, warum der Playwright-Fall
      Pflichtbestandteil ist**; der Vermerk steht in der Rueckmeldung und die Sonde wird in **V23**
      gefahren. **S-V13b**: den Spread in der Filterabbildung wiederherstellen → „ein geleerter
      Filter verschwindet" rot. **S-V13c**: eine Vorgabespalte entfernen → „acht Spalten sind
      vorgewaehlt" rot. **S-V13d**: `pagination` an der Tabelle einschalten → ⛔ **Vitest sieht das
      nicht** — Vermerk und Playwright.
- [ ] **Schritt 4** — bauen: `page.tsx` (Server), fuenf Client-Dateien, **eine** Props-Grenze.
- [ ] **Schritt 5** — `ADMIN_SEITEN_ANZAHL` **1 → 2**; den Playwright-Fall nachtragen.
- [ ] **Schritt 6** — Tor.

```bash
rtk git add "src/app/m/radio/admin/(arbeit)/geraete/page.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/GeraeteTabelle.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/GeraeteWerkzeugleiste.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/SpaltenWahl.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/FilterSchublade.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/NeuGeraetModal.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/GeraeteTabelle.test.tsx" \
            src/app/m/radio/_lib/suchparameter.ts src/app/m/radio/_lib/suchparameter.test.ts \
            src/app/m/radio/riegel.test.ts e2e/radio-verwaltung.spec.ts
rtk git commit -m "feat(radio): die Geraeteliste — Insel 1, zehn Filter und der Suchparameter-Vertrag"
```

---

## Aufgabe V14: `/admin/geraete/[id]` — Insel 6, plus Notiz und Loeschen

**Files:** Create `admin/(arbeit)/geraete/[id]/page.tsx`, `.../GeraetFormular.tsx`,
`.../NotizFeld.tsx`, `.../GeraetLoeschen.tsx`, `.../GeraetFormular.test.tsx` ·
Modify `riegel.test.ts` (**2 → 3**), `e2e/radio-verwaltung.spec.ts`

**Interfaces:** Consumes `geraet`, `vorschlaege` (**V6**), `zielVersion` (**V5**),
`geraetAendernAction`/`notizAnfuegenAction`/`geraetLoeschenAction` (V10), `UPDATER_FELDER` (V2).

⛔ **ERSTE ANWEISUNG: `await requireRadioVerwaltung()`** (`Spec:4371`).

⛔ **Insel 6 ist FALLE 1, nicht Falle 9** (`Spec:4523-4532`). `DeviceFields.tsx` ist 194 Zeilen fast
ausschliesslich `Form.Item` — **21 gerenderte, davon 20 benannte**, gemessen. Compound-Zugriff in einer Server Component ist
HTTP 500.

⛔ **DREI nebeneinanderliegende Inseln, keine verschachtelte** (E-V6): `GeraetFormular`,
`NotizFeld`, `GeraetLoeschen` teilen **keinen** Zustand — jede haengt an einer anderen Action.

### `page.tsx` — Server Component

Kopfdaten als **schlichtes Markup**, ⛔ **kein `Descriptions.Item`** (Falle 1). Die fuenf Alt-Felder
(`DeviceDetailDrawer.tsx:77-102`): Hiorg-ID · Ausleihbar · Zuletzt aktualisiert · Geändert (mit
aufgeloestem Namen) · Abweichung (nur wenn gesetzt).

⛔ **`hiorgId` bleibt ein Link, wenn der Wert mit `http://` oder `https://` beginnt, sonst Text**
(`DeviceDetailDrawer.tsx:28-40`) — 1:1, inklusive `target="_blank" rel="noreferrer"`.

Der Titel ist `rufname || opta || issi` **plus** die ISSI in Klammern
(`DeviceDetailDrawer.tsx:61`).

⛔ **Der Textlink „Änderungen anzeigen" auf `/admin/geraete/<id>/ereignisse`** — ⛔ **kein Reiter**,
„weil `Tabs` eine Insel erzwingen wuerde, die die Detailseite sonst nicht braucht" (`Spec:4767-4776`).
⚠️ **Er zeigt auf eine Seite, die erst V15 anlegt.** ⛔ **Ein Link auf eine 404 ist schlimmer als
kein Link** (`qr/layout.tsx:16-18`) — deshalb: **der Link entsteht in V15, nicht hier.** V14 laesst
die Stelle mit einem ⬜-Kommentar frei, der V15 namentlich nennt.

Ein Geraet, das es nicht gibt → ⛔ **`notFound()`**, nicht eine Fehlerseite (`devices.ts:84`).

### Insel 6 — `GeraetFormular.tsx`

```ts
type GeraetFormularProps = {
  geraet: GeraetFormWerte;                              // ⛔ vorformatiert, lastUpdatedAt als YYYY-MM-DD
  rolle: RadioRolle;                                    // ⛔ ein Wert, keine Funktion
  vorschlaege: Record<Vorschlagsfeld, string[]>;
};
```

⛔ **`lockedFor` entsteht IN der Insel**, 1:1 aus `DeviceEditForm.tsx:36-37`:

```ts
const gesperrt = (feld: string) =>
  rolle === "updater" && !(UPDATER_FELDER as readonly string[]).includes(feld);
```

⛔ **`UPDATER_FELDER` kommt aus `_lib/rollen.ts` (V2), das KEIN `"use client"` traegt** — Falle 6
in der harmlosen Richtung: ein Wert **aus** einem Server-Modul **in** eine Client-Insel ist
erlaubt.

**Zwanzig BENANNTE Felder in fuenf Abschnitten, dazu EIN Anzeige-Slot ohne `name`**, 1:1 aus
`DeviceFields.tsx:56-191`. ⛔ **Gemessen, nicht gezaehlt aus der Prosa:** 13 literale `<Form.Item` im
Rumpf plus 8 `<SuggestCol` (der Helfer mit dem 14. literalen `<Form.Item`, `DeviceFields.tsx:44`) =
**21** gerenderte; davon traegt **eines kein `name`** — der reine Anzeige-Slot
`<Form.Item label="Update-Stand">` (`DeviceFields.tsx:169`). Die fuenf Abschnitte sind die `Divider`
auf `:56`, `:91`, `:119`, `:149`, `:174`:
Identität (ISSI · TEI · OPTA · Rufname · Seriennummer · Hiorg-ID) · Gerät (Hersteller · Gerät ·
Bedieneinheit · Gerätefunktionen · Funktion) · Einsatz (Lagerort · Zuordnung · Status · Ausleihbar ·
Alamos integriert) · Update (Letztes Update · Zuletzt aktualisiert · Update-Stand) ·
Bemerkung (Bemerkung · Update-Anmerkung).

⛔ **Pflichtfeld ist NUR `issi`**, Text woertlich „ISSI ist erforderlich" (`DeviceFields.tsx:64`).
⛔ **KEINE `maxLength` auf irgendeinem Feld** — gemessen: es gibt im Alt-Bestand keine, weder
client- noch serverseitig (`schemas.ts:50-99`; kein `maxLength` in `DeviceFields.tsx`). Ein
erfundener Deckel waere die F1-Fehlerklasse.

⛔ **Die Update-Anmerkung wird fuer Updater NICHT gerendert** (`DeviceFields.tsx:181-190`) — sie
haengen ueber `NotizFeld` an, „so wird die Anmerkung nicht doppelt angezeigt".

⛔ **Der Diff im Formular, 1:1** (`DeviceEditForm.tsx:76-90`): es wird ein voller Patch gebaut und
dann auf die **tatsaechlich geaenderten** Felder reduziert. ⛔ **Ein unangehakter Wahrheitswert
(`false`) ueber einem gespeicherten `null` ist KEINE Aenderung** (`:79-82`) — „the form coerces
null → false on init". ⛔ **Ohne diese Regel erzeugt jedes Oeffnen-und-Speichern zwei falsche
Ereigniszeilen.**
⛔ **Und `updateNote` behaelt bei fehlendem Feld den gespeicherten Wert** (`:73`), damit der Diff
ihn nicht beruehrt.

⛔ **`lastUpdatedAt` wird als `YYYY-MM-DD`-Zeichenkette gesendet** — Entscheidung **E-V11**,
⛔ **nicht** als `values.lastUpdatedAt.valueOf()` wie im Bestand (`DeviceEditForm.tsx:61`).

### `NotizFeld.tsx` und `GeraetLoeschen.tsx`

* `NotizFeld`: ⛔ **append-only**, 1:1 aus `UpdateNotePanel.tsx` — die bisherige Anmerkung
  read-only mit `whiteSpace: "pre-wrap"`, darunter ein Eingabefeld und „Hinzufügen". Leertext
  „Keine Anmerkung." ⛔ **Sichtbar fuer BEIDE Stufen** — der Bestand zeigt es nur Nicht-Admins
  (`DeviceDetailDrawer.tsx:109`), aber die Suite rendert die Anmerkung fuer Admins im Formular und
  fuer Updater hier; ⛔ **die Fallunterscheidung wandert 1:1 mit**, sonst steht sie doppelt.
* `GeraetLoeschen`: `Popconfirm` mit „Gerät wirklich löschen?", `okText: "Löschen"`,
  `okButtonProps: { danger: true }`, `cancelText: "Abbrechen"` (`DeviceDetailDrawer.tsx:112-122`).
  ⛔ **Nur fuer `rolle === "admin"` gerendert.** ⛔ **Und die Ablehnung bei offener Leihe wird als
  MELDUNG im `Popconfirm`-Zweig gezeigt, nicht durch Verstecken des Knopfs** (⬜ V-L6,
  `Spec:4690-4691`).

| Testname (`GeraetFormular.test.tsx`) | Aussage |
|---|---|
| „als Updater sind alle Felder ausser den dreien gesperrt" | ⛔ **Der Fall, den `Spec:4863` namentlich nennt.** ⛔ **Alle 20 BENANNTEN Felder durchzaehlen, die Zahl ausserhalb der Schleife** — ⚠️ **20, und es ist DERSELBE Wert wie V7s Etikettenliste** (dort stehen 20 `label`-Anker). ⛔ **Er darf nicht an zwei Stellen verschieden dastehen**; der Anzeige-Slot „Update-Stand" (`DeviceFields.tsx:169`) zaehlt in **keiner** von beiden mit, weil er kein `name` traegt |
| „als Admin ist kein Feld gesperrt" | Die Gegenprobe |
| „ISSI ist das einzige Pflichtfeld" | `DeviceFields.tsx:64`. ⛔ **Die Zahl 1 steht als eigene Zusicherung** |
| „kein Feld traegt eine Maximallaenge" | ⛔ **Der Fall gegen die Erfindung.** Beleg am Fall: `schemas.ts:50-99` |
| „ein unangehakter Wahrheitswert ueber einem gespeicherten null erzeugt keinen Patcheintrag" | `DeviceEditForm.tsx:79-82`. ⛔ **Der Fall gegen zwei falsche Ereigniszeilen je Speichern** |
| „ein unveraendertes Formular sendet keinen Patch" | `DeviceEditForm.tsx:87-90` |
| „die Update-Anmerkung fehlt im Formular, wenn die Rolle updater ist" | `DeviceFields.tsx:184` |
| „lastUpdatedAt geht als YYYY-MM-DD, nicht als Zahl" | ⛔ **Entscheidung E-V11** |
| „der Statuswahl liegen genau die fuenf Optionen zugrunde" | `constants.ts:10-16`. ⛔ **`toEqual`, Reihenfolge inklusive** |
| „die Geraetefunktionen tragen genau die vier Modi, in dieser Reihenfolge" | `constants.ts:4`. ⛔ **„The order here IS the canonical output order — do not sort."** |
| (riegel.test.ts) Seitenzahl | ⛔ **2 → 3** |

**Playwright-Fall (V23):** `/admin/geraete/<id>` → 200, ⛔ **Formular sichtbar (Falle 1)**
(`Spec:4879`, Fall 3).

- [ ] **Schritt 1** — Insel-Test schreiben, rot.
- [ ] **Schritt 2** — Sonden: **S-V14a**: `lockedFor` auf `() => false` stellen → „als Updater sind
      alle Felder … gesperrt" rot. **S-V14b**: den Wahrheitswert-Sonderfall entfernen → der
      Patcheintrag-Fall rot. **S-V14c**: `lastUpdatedAt` als `valueOf()` senden → der E-V11-Fall
      rot. **S-V14d**: `Form.Item` in `page.tsx` statt in der Insel verwenden → ⛔ **kein
      Vitest-Fall wird rot** — Vermerk und Playwright.
- [ ] **Schritt 3** — bauen. ⛔ **Die Stelle fuer „Änderungen anzeigen" bleibt mit ⬜-Kommentar
      frei, V15 als benannter Nachfolger.**
- [ ] **Schritt 4** — `ADMIN_SEITEN_ANZAHL` **2 → 3**; Playwright-Fall nachtragen.
- [ ] **Schritt 5** — Tor.

```bash
rtk git add "src/app/m/radio/admin/(arbeit)/geraete/[id]/page.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/[id]/GeraetFormular.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/[id]/NotizFeld.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/[id]/GeraetLoeschen.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/[id]/GeraetFormular.test.tsx" \
            src/app/m/radio/riegel.test.ts e2e/radio-verwaltung.spec.ts
rtk git commit -m "feat(radio): das Geraetedetail — Insel 6, Feldriegel, Notiz und Loeschen"
```

---

## Aufgabe V15: `/admin/geraete/[id]/ereignisse` — Insel 5, neu ohne Vorbild

**Files:** Create `admin/(arbeit)/geraete/[id]/ereignisse/page.tsx`, `.../EreignisTabelle.tsx`,
`.../EreignisTabelle.test.tsx` · Modify `admin/(arbeit)/geraete/[id]/page.tsx` (der Textlink),
`riegel.test.ts` (**3 → 4**), `e2e/radio-verwaltung.spec.ts`

**Interfaces:** Consumes `ereignisseFuerGeraet` (V7), `geraet` (**V6**). ⛔ **NICHT** `FELD_ETIKETTEN`
und **nicht** `QUELLE_WOERTER` — sie bleiben serverseitig, siehe unten.

⛔ **ERSTE ANWEISUNG: `await requireRadioVerwaltung()`** (`Spec:4372`).

⛔ **„Sie ist ausdruecklich neu, kein 1:1-Port"** (`Spec:4759-4765`) — es gibt kein Vorbild zum
Pruefen, also prueft sie sich **gegen das Datenmodell**: sechs Spalten in `device_events`
(`_db/schema.ts:130-141`).

⛔ **Und sie ist die erste Flaeche, die `geraete_ereignisse` liest — damit ist NS-Z7 (`merkeNutzer`,
gebaut in V3) hier faellig geworden.** Ohne sie rendert jede Zeile eine nackte UUID
(`Spec:4358-4360`).

**Vier Spalten**, Aufbau in V7 beschrieben. `source` als `Tag` mit den vier Woertern im Klartext.

⛔ **Der Textlink „Änderungen anzeigen" wird HIER in `geraete/[id]/page.tsx` eingetragen** und der
⬜-Kommentar aus V14 entfernt.

| Testname (`EreignisTabelle.test.tsx`) | Aussage |
|---|---|
| „leere Werte werden als Gedankenstrich dargestellt" | ⛔ **Der Fall, den `Spec:4864-4869` namentlich nennt.** Beide Seiten |
| „die Aenderung liest sich als alt Pfeil neu" | `Spec:4771-4772` |
| „das Feld traegt sein deutsches Etikett, nicht seinen Spaltennamen" | `Spec:4770-4771`. ⚠️ **Hier wird nur geprueft, dass die Insel `feldEtikett` RENDERT** — dass die Abbildung stimmt und vollzaehlig ist, prueft **V7** am Lesepfad |
| „der aufgeloeste Name steht in der Zelle, der rohe sub im title" | `Spec:4772`. ⛔ **Beide, an verschiedenen Stellen** |
| „jeder der vier Quellwerte bekommt seinen eigenen Ton, und der Tag zeigt das WORT, nicht den Rohwert" | `Spec:4772-4773`. ⛔ **`toBe(4)` ausserhalb der Schleife.** ⚠️ **Die Insel liest `quelle` (roh) fuer den Ton und `quelleWort` fuer den Text** — die **Vollzaehligkeit der Woerter** prueft V7 am Lesepfad, hier steht die **Tonzuordnung** |
| „ein fuenfter, unbekannter Quellwert bekommt KEINEN Ton und stuerzt nicht ab" | `_db/schema.ts:135-137` (Enum ohne DB-Check). ⛔ **Der Fall, der den erschoepfenden Switch beweist** — er braucht `quelle` als Rohwert in der Zeile |
| „ohne Ereignisse steht ein Leertext statt einer leeren Tabelle" | Sonst sieht die Seite kaputt aus |
| (riegel.test.ts) Seitenzahl | ⛔ **3 → 4** |

**Playwright-Fall (V23):** `/admin/geraete/<id>/ereignisse` → 200 (`Spec:4880`, Fall 4).

- [ ] **Schritt 1** — Insel-Test schreiben, rot.
- [ ] **Schritt 2** — Sonden: **S-V15a**: den Gedankenstrich-Rueckfall entfernen → „leere Werte"
      rot. **S-V15b**: den rohen `sub` in die Zelle schreiben → „der aufgeloeste Name steht in der
      Zelle" rot. **S-V15c**: einen Ton aus der Switch-Zuordnung entfernen → der Tonzuordnungsfall rot.
      **S-V15d**: `quelle` aus `EreignisZeile` streichen und den Ton aus `quelleWort` ableiten →
      ⛔ **der Fuenfter-Wert-Fall rot** — er belegt, warum die Zeile beide Felder traegt.
- [ ] **Schritt 3** — bauen; den Textlink in `geraete/[id]/page.tsx` eintragen und den
      ⬜-Kommentar aus V14 entfernen.
- [ ] **Schritt 4** — `ADMIN_SEITEN_ANZAHL` **3 → 4**; Playwright-Fall nachtragen.
- [ ] **Schritt 5** — Tor.

```bash
rtk git add "src/app/m/radio/admin/(arbeit)/geraete/[id]/ereignisse/page.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/[id]/ereignisse/EreignisTabelle.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/[id]/ereignisse/EreignisTabelle.test.tsx" \
            "src/app/m/radio/admin/(arbeit)/geraete/[id]/page.tsx" \
            src/app/m/radio/riegel.test.ts e2e/radio-verwaltung.spec.ts
rtk git commit -m "feat(radio): die Aenderungshistorie eines Geraets — Insel 5"
```

---

## Aufgabe V16: `/admin/ausleihen` — Insel 2, der erste Verbraucher von `leihhistorie`

**Files:** Create `admin/(arbeit)/ausleihen/page.tsx`, `.../AusleihenTabelle.tsx`,
`.../AusleihenTabelle.test.tsx` · Modify `riegel.test.ts` (**4 → 5**), `e2e/radio-verwaltung.spec.ts`

**Interfaces:** Consumes `ausleihenListe` (V7) → `leihhistorie` (V1).

⛔ **ERSTE ANWEISUNG: `await requireRadioVerwaltung()`** (`Spec:4373`).

⛔ **MIT DIESER AUFGABE IST 6.7-ABSCHNITT C AUF DER DATENSEITE GESCHLOSSEN**: die sechste
Ersatzfunktion hat ihren Verbraucher, und keine Oberflaeche des Moduls spricht mehr ueber eine
HTTP-Grenze. ⛔ **Die Aufgabe fuehrt den Abnahmebefehl als eigenen Schritt aus.**

**Sieben Spalten**, 1:1 aus `LoanList.tsx:15-47`: Gerät (`snapshotCallSign`) · Typ
(`snapshotDeviceType`, leer → `—`) · Ausleihende:r (`borrowerName`) · Ausgeliehen · Zurückgegeben ·
Status · Notiz (`returnNote`, leer → `—`).

⛔ **Status aus `returnedAt === null`** — Entscheidung **E-V14**. ⛔ **Beide Zustaende tragen ihr
Wort:** „Aktiv" / „Zurückgegeben".

⛔ **Seitengroesse 20, kein Groessenwechsler** (`LoanList.tsx:8`, `:66`). Blaetterung ueber die URL
(Regime B).

⛔ **Der mobile `<List>`-Zweig wandert mit** (`LoanList.tsx:86-…`), in derselben Insel.

⚠️ **Diese Flaeche ist fuer BEIDE Stufen offen** (`Spec:4373`, Rechtetafel) — sie ist eine
**Lese**ansicht, und der Bestand haelt sie ebenso offen (`loans.ts:18` ohne `requireRole`).

| Testname (`AusleihenTabelle.test.tsx`) | Aussage |
|---|---|
| „das Statuszeichen kommt aus rueckgabeAm gleich null" | ⛔ **Der Fall, den `Spec:4861` namentlich nennt.** Beide Zustaende |
| „sieben Spalten, in dieser Reihenfolge" | ⛔ **`toEqual`, nicht `toContain`** |
| „ein leerer Typ und eine leere Notiz werden zum Gedankenstrich" | `LoanList.tsx:21`, `:45` |
| „das Statuszeichen ist nicht der einzige Traeger" | ⛔ **Falle 3 in ihrer allgemeinen Form:** jede Zeile traegt ihr Wort |
| (riegel.test.ts) Seitenzahl | ⛔ **4 → 5** |

**Playwright-Fall (V23):** `/admin/ausleihen` → 200 mit sichtbarer Tabelle (`Spec:4881-4882`, Fall 5).

- [ ] **Schritt 1** — Insel-Test schreiben, rot.
- [ ] **Schritt 2** — Sonden: **S-V16a**: den Status aus `borrowedAt` ableiten → „das Statuszeichen
      kommt aus rueckgabeAm" rot. **S-V16b**: eine Spalte entfernen → der Reihenfolgefall rot.
- [ ] **Schritt 3** — bauen.
- [ ] **Schritt 4** — ⛔ **Den Abnahmebefehl fuer 6.7-C fahren und das Ergebnis in die
      Rueckmeldung schreiben.**
      ⛔ **In DIESER Form, und der Grund ist kein Stil:**
      ```
      rtk proxy rg -n "RADIO_ADMIN_|api/v1/" src/app/m/radio     # muss leer sein, Exit 1
      rtk proxy rg -n "requireRadioHost" src/app/m/radio          # POSITIVKONTROLLE: muss treffen
      ```
      ⚠️ **`rtk grep` ist hier NICHT zu benutzen.** Der Regex-Dialekt seines Filters ist nirgends
      festgeschrieben; landet das `|` als **woertliches Zeichen**, trifft das Muster **nie** — und
      der Abnahmebefehl fuer Abschnitt C ist **dauerhaft gruen**. Das waere genau die
      Leer-Gruen-Fehlerklasse, gegen die dieser ganze Plan steht, ausgerechnet an seiner
      tragendsten Pruefung. ⛔ **Wer die Alternation nicht will, faehrt zwei Einzelmuster** — nie
      eines mit ungeklaertem Dialekt.
      ⛔ **Und die Positivkontrolle ist Pflicht, nicht Kuer:** ein Befehl, der nichts findet, ist
      ohne sie eine **Behauptung**, keine Messung.
      ⚠️ **Das ist der NOTWENDIGE, nicht der hinreichende Beweis** — hinreichend wird C erst mit
      V23s echtem Abruf.
- [ ] **Schritt 5** — `ADMIN_SEITEN_ANZAHL` **4 → 5**; Playwright-Fall nachtragen.
- [ ] **Schritt 6** — Tor.

```bash
rtk git add "src/app/m/radio/admin/(arbeit)/ausleihen/page.tsx" \
            "src/app/m/radio/admin/(arbeit)/ausleihen/AusleihenTabelle.tsx" \
            "src/app/m/radio/admin/(arbeit)/ausleihen/AusleihenTabelle.test.tsx" \
            src/app/m/radio/riegel.test.ts e2e/radio-verwaltung.spec.ts
rtk git commit -m "feat(radio): die Ausleihenliste — Insel 2, und leihhistorie hat ihren Verbraucher"
```

---

## Aufgabe V17: `/admin/software` — Insel 7, der Update-Modus

**Files:** Create `admin/(arbeit)/software/page.tsx`, `.../UpdateSuche.tsx`,
`.../UpdateSuche.test.tsx` · Modify `riegel.test.ts` (**5 → 6**), `e2e/radio-verwaltung.spec.ts`

**Interfaces:** Consumes `versionenMitGeraetezahl`, `zielVersion` (**V5**), `geraeteListe`,
`geraeteKennzahlen` (**V6**), `geraetAendernAction`, `notizAnfuegenAction` (V10).

⛔ **ERSTE ANWEISUNG: `await requireRadioVerwaltung()`** (`Spec:4374`).

⛔ **Der Pfad ist `software/`, nicht `update/`** — B9 (`Spec:98`). §5.6.1 (`Spec:4509`) traegt den
alten Namen und ist ueberholt.

```ts
type UpdateSucheProps = {
  versionen: string[];
  zielVersion: string | null;
  gesamt: number;
  aufZiel: number;
};
```

1:1 aus `UpdateMode.tsx`:

* ⛔ **Die Zielversion ist mit der `isTarget`-Version VORBELEGT** (`:17-22`), aber **aenderbar**.
* Suche auf **drei** Feldern: `issi`, `rufname`, `opta` (`:8`), 300 ms entprellt (`:24-27`),
  `pageSize: 25` (`:29`).
* ⛔ **Ohne Suchtext wird NICHTS gezeigt** — `Empty` mit „Gerät suchen, um es zu aktualisieren"
  (`:67-68`). ⛔ **Kein Vorab-Laden der ganzen Liste.**
* Fortschritt `x von y auf Zielversion` mit `Progress` (`:53-58`), nur wenn `gesamt > 0`.
  ⛔ **Er bleibt HIER** — „Weitere Auswertungen entstehen nicht" (`Spec:4793-4794`).
* Der Hinweis woertlich: „Gerät suchen, mit einem Tap auf die Zielversion setzen. Nur die Geräte,
  die du wirklich aktualisiert hast." (`:40`).
* Je Geraet eine Karte mit **einem** Knopf „Auf `<version>` aktualisiert" und einem zweiten
  „ISSI weicht ab / Anmerkung" (`UpdateDeviceCard.tsx:56-61`).

⛔ **Was ein Tap setzt:** `{ softwareVersion: zielversion, lastUpdatedAt: <Berliner Tag> }` —
⚠️ **benannte Abweichung E-V11**: der Bestand setzt `Date.now()` (`UpdateDeviceCard.tsx:24`), die
Suite-Spalte ist ein Kalendertag.

⛔ **Die Flaeche ist fuer BEIDE Stufen offen** (`Spec:4374`, Rechtetafel: „Update-Modus … ja/ja") —
und die drei Felder, die sie schreibt, sind **genau** `UPDATER_FELDER`. ⛔ **Das ist kein Zufall,
sondern der Zweck der zweiten Stufe**, und der Kommentar sagt es mit `editable-fields.ts:3`.

| Testname (`UpdateSuche.test.tsx`) | Aussage |
|---|---|
| „ohne Suchtext wird kein Geraet gezeigt" | `UpdateMode.tsx:67-68`. ⛔ **Nicht „eine leere Liste", sondern der Leertext** |
| „die Zielversion ist mit der markierten Version vorbelegt" | `:17-22` |
| „die Zielversion ist aenderbar" | Die Gegenprobe — sonst waere die Vorbelegung eine Sperre |
| „der Fortschritt bleibt aus, solange es kein Geraet gibt" | `:53` |
| „der Aktualisieren-Knopf ist gesperrt, solange keine Zielversion gewaehlt ist" | `UpdateDeviceCard.tsx:56` (`disabled={!targetVersion}`) |
| „die Suche greift auf genau drei Felder" | `UpdateMode.tsx:8`. ⛔ **`toEqual`** |
| ⛔ „ein Tap sendet genau `YYYY-MM-DD`, keine Uhrzeit" | ⛔ **Die zweite Haelfte von E-V11, und der Typ faengt sie NICHT** (die Spalte ist `text(...)`, jede uhrzeittragende Zeichenkette uebersetzt sauber). ⛔ **Regexform `/^\d{4}-\d{2}-\d{2}$/` auf dem gesendeten Wert — NICHT `toBeTruthy`.** Ohne diesen Fall ist die Update-Modus-Haelfte von E-V11 durch gar nichts bewacht |
| (riegel.test.ts) Seitenzahl | ⛔ **5 → 6** |

**Playwright-Fall (V23):** `/admin/software` → 200 (`Spec:4881-4882`, Fall 5).

- [ ] **Schritt 1** — Insel-Test schreiben, rot.
- [ ] **Schritt 2** — Sonden: **S-V17a**: die Liste ohne Suchtext laden → „ohne Suchtext wird kein
      Geraet gezeigt" rot. **S-V17b**: die Vorbelegung entfernen → der Vorbelegungsfall rot.
      **S-V17c**: `lastUpdatedAt` mit `Date.now()` setzen → ⛔ **Typfehler** (`number`
      gegen `string | null` auf `_db/schema.ts:39`) ⛔ **und das Ergebnis ist ein roter `typecheck`,
      kein roter Test** — es gehoert so in die Rueckmeldung. ⚠️ **Hier stand „mit einer Uhrzeit
      setzen", und das faengt der Typ NICHT:** die Spalte ist `text(...)`, ihr Drizzle-Typ ist
      `string | null`, und **jede** uhrzeittragende Zeichenkette (`"2026-08-24 10:30"`,
      `new Date().toISOString()`) uebersetzt sauber. Nur die **Zahl**-Form erroret — und genau die
      ist der Alt-Fall (`UpdateDeviceCard.tsx:24` setzt `Date.now()`).
- [ ] **Schritt 3** — bauen.
- [ ] **Schritt 4** — `ADMIN_SEITEN_ANZAHL` **5 → 6**; Playwright-Fall nachtragen.
- [ ] **Schritt 5** — Tor.

```bash
rtk git add "src/app/m/radio/admin/(arbeit)/software/page.tsx" \
            "src/app/m/radio/admin/(arbeit)/software/UpdateSuche.tsx" \
            "src/app/m/radio/admin/(arbeit)/software/UpdateSuche.test.tsx" \
            src/app/m/radio/riegel.test.ts e2e/radio-verwaltung.spec.ts
rtk git commit -m "feat(radio): der Update-Modus — Insel 7"
```

---

## Aufgabe V18: `/admin/import` — Insel 4, der zweiphasige Assistent

**Files:** Create `admin/(arbeit)/import/page.tsx`, `.../ImportAssistent.tsx`,
`.../ImportAssistent.test.tsx`, ⛔ **`admin/(arbeit)/import/hochladen/route.ts` + `.../hochladen/route.test.ts`** ·
Modify `riegel.test.ts` (**`ADMIN_SEITEN_ANZAHL` 6 → 7 UND `HANDLER_ANZAHL` 2 → 3**),
`e2e/radio-verwaltung.spec.ts`

**Interfaces:** Consumes `importSchreibenAction` (V10), `IMPORTIERBARE_FELDER`,
`KLASSEN_WOERTER` (V9), `EINLESEN`/Kodierungserkennung (V9), `radioHostOderNull`
(`_lib/host.ts:64`), `istRadioAdmin`/`viewerOderNull` (`_lib/zugang.ts:188`, `:86`).

⛔ **DIESE AUFGABE IST DIE EINZIGE SEITENAUFGABE MIT ZWEI ZAEHLERN.** Beide werden in **derselben**
Aufgabe angehoben, aus demselben Grund wie in Schnitt 2 des Architecture-Kapitels: der Handler ohne
seine Zahl macht Klausel (c) rot, die Zahl ohne den Handler ebenso.

### ⛔ Der Hochladen-Handler — Entscheidung **E-V16**

```ts
export async function POST(request: Request) {
  if (radioHostOderNull(request.headers) === null) {
    return new Response(null, { status: 404 });
  }
  if (!istRadioAdmin(await viewerOderNull())) {
    return new Response(null, { status: 404 });
  }
  // … liest die CSV aus dem FormData, erkennt Kodierung und Trennzeichen (V9),
  //    antwortet mit JSON: { spalten: string[]; zeilen: string[][] } — und schreibt NICHTS.
}
```

⛔ **Dieselben drei Haelften wie beim Export-Handler**, und `riegel.test.ts` Klausel (c) prueft sie
einzeln (`riegel.test.ts:599-610`): `radioHostOderNull(` ja · `requireRadioHost(` nein · werfender
Personen-Riegel nein. ⛔ **404, nie 403** (B10). ⛔ **`istRadioAdmin`, nicht die Verwaltungsstufe**
(Rechtetafel: „CSV-Import — Admin ja, Updater **nein**", `Spec:4451`).

⛔ **Leere oder unlesbare Datei ⇒ eine Meldung im JSON, kein Wurf und kein 500** —
`{ ok: false, fehler: "Datei konnte nicht gelesen werden" }`, 1:1 aus `import.ts:28`
(„Leere oder ungültige Datei") und `ImportWizard.tsx:101`.

| Testname (`hochladen/route.test.ts`) | Aussage |
|---|---|
| „auf einem fremden Host antwortet der Handler 404" | ⛔ **Erste Zeile.** Und **404**, nicht 403 |
| „ohne Sitzung antwortet der Handler 404, nicht mit einer Weiterleitung" | ⛔ **B11 als Verhaltensfall** — er faengt ein versehentliches `requireRadioAdmin()` |
| „als Updater antwortet der Handler 404" | Rechtetafel `Spec:4451`. ⛔ **Der Fall, den ein `requireRadioVerwaltung()` still gruen liesse** |
| „als Admin liefert er Spalten und Rohzeilen als JSON" | Der positive Fall |
| „er schreibt KEINE Zeile in die Datenbank" | ⛔ **Die negative Zusicherung, und sie ist der Punkt** — die Vorschau ist der Schritt, der nichts tut |
| „eine leere Datei ergibt eine Meldung, keinen Wurf" | `import.ts:28`, `ImportWizard.tsx:101` |
| (riegel.test.ts) Klausel (c), drei Haelften | `radioHostOderNull` ja · `requireRadioHost` nein · werfender Personen-Riegel nein |
| (riegel.test.ts) „die Handlerzahl steht EXAKT auf dem Stand dieses Planteils" | ⛔ **`HANDLER_ANZAHL` 2 → 3** |

⛔ **Erste Anweisung: `await requireRadioVerwaltung()`** — Entscheidung **E-V4**, ⬜ **V-L5**.
⛔ **Und die Seite rendert fuer `rolle === "updater"` einen `Result`-Block statt des Assistenten**,
mit dem Satz „Der Import ist den radio-admins vorbehalten." ⛔ **Das ist kein zweiter Riegel** — die
Sperre sitzt in den zwei Actions; das hier ist die ehrliche Anzeige. Der Kommentar nennt alle drei
widerspruechlichen Spec-Stellen (`Spec:4207-4208`, `:4375`, `:4451`) und ⬜ V-L5.

⛔ **Zweiphasig, und das bleibt so** (`Spec:4695-4702`). Vier Schritte
(`ImportWizard.tsx:33-35`): `upload | mapping | preview | done`. ⛔ **`commit` wird zweimal
gerufen** — einmal `dryRun: true`, einmal `false`.

```ts
type ImportAssistentProps = {};   // ⛔ Spec:4507 — er haelt seinen Schrittzustand SELBST
```

Die vier Schritte, 1:1:

1. **Datei** — `Upload.Dragger` mit `accept=".csv,text/csv"`, `maxCount: 1`,
   `showUploadList: false`, ⛔ **`beforeUpload → return false`** (`ImportWizard.tsx:150-157`),
   damit antd nicht selbst hochlaedt. ⛔ **Die Datei geht als `FormData` per `fetch(..., { method: "POST" })`
   an `/m/radio/admin/import/hochladen`, NICHT in eine Server Action** (Entscheidung **E-V16** — die
   suiteweite 1-MB-Grenze; `next.config.ts` hebt sie nicht an, und das Haus hat den Fall zweimal so
   entschieden: `aufgaben/a/[id]/nachweis/hochladen/route.ts:2-9`, `files/api/u/[token]/upload/route.ts`).
   Fehler: „Datei konnte nicht gelesen werden" (`:101`).
2. **Zuordnung** — **19** Zeilen, je ein `Select` mit „— nicht zuordnen —" plus den erkannten
   Spalten (`:179-206`). ⛔ **„Weiter" ist gesperrt, solange ISSI nicht zugeordnet ist**
   (`:211`), und der Versuch meldet „ISSI-Spalte muss zugeordnet sein" (`:109`).
   Der Hinweis oben wechselt zwischen „ISSI ist zugeordnet." und „Die ISSI-Spalte muss zugeordnet
   werden, um fortzufahren." (`:174-177`).
3. **Vorschau (Probelauf)** — fuenf `Statistic`-Karten (eine je Klasse) und eine Tabelle mit vier
   Spalten: Zeile · ISSI · Klasse · Änderungen (`:264-291`). ⛔ **Bei `skipped-no-permission` steht
   die Erklaerung „updater darf keine neuen Geräte anlegen" als `Tooltip`** (`:275`).
   ⛔ **Die Aenderungsspalte listet die FELDNAMEN, oder einen Gedankenstrich** (`:288`); bei einem
   Fehler steht **stattdessen** der Fehlertext (`:286`).
   Fehler: „Vorschau fehlgeschlagen" (`:117`).
4. **Fertig** — `Result status="success"` mit „Import abgeschlossen" und der Zusammenfassung
   `Klasse: n · Klasse: n · …` (`:232-241`, `:247-251`), plus „Zu den Geräten".
   Fehler: „Import fehlgeschlagen" (`:131`).

⛔ **`size="small"` an der Vorschautabelle entfaellt** (`:305`) — Falle 4.

| Testname (`ImportAssistent.test.tsx`) | Aussage |
|---|---|
| „die vier Schritte laufen in dieser Reihenfolge" | ⛔ **Der Fall, den `Spec:4862` namentlich nennt** |
| „ISSI-Spalte muss zugeordnet sein blockiert den Uebergang" | `Spec:4862`; woertlich `ImportWizard.tsx:109`, `:211` |
| „fuenf Klassen erscheinen in der Zusammenfassung" | ⛔ **`toBe(5)`** — nicht drei (Entscheidung in **V9**) |
| „bei Uebersprungen steht die Erklaerung dabei" | `:274-276` |
| „eine Fehlerzeile zeigt ihren Text statt der Feldliste" | `:285-288` |
| „ein Zurueck aus der Vorschau fuehrt in die Zuordnung, nicht in den Dateischritt" | `:226` |
| „die Datei wird nicht automatisch hochgeladen" | `:156` (`return false`). ⛔ **Der Fall gegen einen stillen Doppel-POST** |
| (riegel.test.ts) Seitenzahl | ⛔ **6 → 7** |

**Playwright-Fall (V23):** `/admin/import` → 200 mit sichtbarem Assistenten (`Spec:4881-4882`,
Fall 5); ⛔ **plus ein echter Schreibvorgang „Import schreiben"** (`Spec:4887-4888`, Fall 7) —
⛔ **mit Warmlauf-GET und `page.waitForResponse`** (Falle 10, `Spec:4893-4898`). ⚠️ **Der Warmlauf
gilt jetzt auch fuer `/m/radio/admin/import/hochladen`**: er ist ein Route Handler, und Falle 10 ist
genau fuer diesen Fall gemessen worden.

- [ ] **Schritt 1** — Insel-Test schreiben, rot.
- [ ] **Schritt 2** — Sonden: **S-V18a**: die ISSI-Sperre entfernen → der Blockierfall rot.
      **S-V18b**: `beforeUpload` `true` zurueckgeben lassen → der Auto-Upload-Fall rot.
      **S-V18c**: eine Klasse aus der Zusammenfassung nehmen → der Fuenf-Klassen-Fall rot.
      **S-V18d**: im Hochladen-Handler `requireRadioAdmin()` statt des Praedikats → ⛔ **Klausel (c)
      rot UND „ohne Sitzung … 404" rot.**
      **S-V18e**: `istRadioAdmin` durch die Verwaltungsstufe ersetzen → „als Updater … 404" rot.
      **S-V18f**: `HANDLER_ANZAHL` auf 2 lassen → der Zaehlfall rot.
- [ ] **Schritt 3** — bauen: ⛔ **zuerst `hochladen/route.ts` mit seiner nicht-werfenden Riegelform**,
      dann `page.tsx` mit `requireRadioVerwaltung()` und dem Updater-`Result`-Zweig, dann die Insel.
- [ ] **Schritt 4** — `ADMIN_SEITEN_ANZAHL` **6 → 7** **und** `HANDLER_ANZAHL` **2 → 3**
      (⛔ **beide in dieser Aufgabe**, E-V16); Playwright-Faelle nachtragen.
- [ ] **Schritt 5** — Tor.

```bash
rtk git add "src/app/m/radio/admin/(arbeit)/import/page.tsx" \
            "src/app/m/radio/admin/(arbeit)/import/ImportAssistent.tsx" \
            "src/app/m/radio/admin/(arbeit)/import/ImportAssistent.test.tsx" \
            "src/app/m/radio/admin/(arbeit)/import/hochladen/route.ts" \
            "src/app/m/radio/admin/(arbeit)/import/hochladen/route.test.ts" \
            src/app/m/radio/_lib/routen.ts src/app/m/radio/_lib/routen.test.ts \
            src/app/m/radio/riegel.test.ts e2e/radio-verwaltung.spec.ts
rtk git commit -m "feat(radio): der zweiphasige CSV-Import — Insel 4"
```

---

## Aufgabe V19: `/admin/versionen` — Insel 3, ⛔ **erste Seite auf der ADMIN-Stufe**

**Files:** Create `admin/(arbeit)/versionen/page.tsx`, `.../VersionenTabelle.tsx`,
`.../NeuVersion.tsx`, `.../VersionenTabelle.test.tsx` · Modify `riegel.test.ts` (**7 → 8**),
`admin/actions.test.ts` (Fall 7 von `it.todo` auf scharf), `e2e/radio-verwaltung.spec.ts`

**Interfaces:** Consumes `versionenMitGeraetezahl` (**V5**), die vier Versions-Actions (V10).

⛔ **ERSTE ANWEISUNG: `await requireRadioAdmin()`** (`Spec:4376`) — ⛔ **NICHT
`requireRadioVerwaltung()`.**

⛔ **UND HIER GREIFT DIE NAMENTLICHE ZUSICHERUNG AUS AUFLAGE 2.** `riegel.test.ts` Klausel (a) und
(e) lassen im `(arbeit)`-Zweig **beide** Riegelformen zu (`riegel.test.ts:408-417`), **absichtlich**
— ohne das ODER waeren sie gegen `Spec:4367` rot-by-construction. ⛔ **Ein pfadsensitiver Scan kann
„richtig auf der Verwaltungsstufe" nicht von „faelschlich von der Admin-Stufe abgesenkt"
unterscheiden.** Fuer diese Seite ist der Plantext bis heute die einzige Sperre — ⛔ **ab dieser
Aufgabe ist es Fall 7 in `admin/actions.test.ts`.**

**Diese Aufgabe wandelt `it.todo` Fall 7 in einen scharfen Fall:**

| Testname | Aussage |
|---|---|
| „admin/(arbeit)/versionen/page.tsx nennt requireRadioAdmin und NICHT requireRadioVerwaltung" | ⛔ **Beide Haelften, positiv UND negativ, mit LITERALEM Pfad.** Beleg am Fall: `Spec:4376`. ⛔ **Die negative Haelfte ist die, die kein pfadgenerischer Scan erzeugen kann** |

### Der Aufbau, 1:1 aus `SoftwareVersionsPage.tsx`

* ⛔ **Der erklaerende Hinweis WOERTLICH** (`:185`): „Die als „Ziel“ markierte Version bestimmt,
  welche Geräte als „aktuell“ gelten. Neu angelegte Versionen werden nicht automatisch zum Ziel —
  die Reihenfolge dient nur der Anzeige."
* `NeuVersion.tsx`: Eingabefeld „Neue Version, z. B. FW 12.3" plus „Anlegen" (`:188-199`).
  Getrimmt, leer → nichts. Meldungen: „Version angelegt" / „Diese Version existiert bereits" /
  „Version konnte nicht angelegt werden" (`:33`, `:37`, `:38`).
* **Fuenf Spalten** (`:84-175`): Version (mit `Ziel`-Marke, fett wenn Ziel) · Geräte
  (rechtsbuendig) · Angelegt · Reihenfolge (auf/ab) · Aktionen.
* ⛔ **Loeschen ist gesperrt, solange `deviceCount > 0`** — dann ein **deaktivierter** Knopf mit
  `Tooltip` „Wird von N Gerät(en) genutzt — erst umstellen" (`:153-158`). Sonst `Popconfirm`
  „Version wirklich löschen?" (`:160-170`).
* ⛔ **Die Ziel-Spalte zeigt entweder `Tag` „aktuelles Ziel" ODER den Knopf „Als Ziel"** (`:141-152`)
  — nie beides.
* ⛔ **Die Reihenfolge-Knoepfe sind am Rand deaktiviert** (`index === 0` bzw. `rows.length - 1`,
  `:122`, `:129`).
* ⛔ **Verschieben tauscht mit dem Nachbarn und schreibt die GANZE Reihenfolge** (`:68-82`) — nicht
  ein einzelnes Feld.
* ⛔ **`size="small"` an fuenf Stellen entfaellt** (`:119`, `:126`, `:145`, `:155`, `:167`) —
  Falle 4. Platz schafft `scroll={{ x: "max-content" }}`.

| Testname (`VersionenTabelle.test.tsx`) | Aussage |
|---|---|
| „Loeschen ist gesperrt, solange Geraete haengen — inklusive des Hinweistextes" | ⛔ **Der Fall, den `Spec:4861-4862` namentlich nennt.** ⛔ **Beide Haelften: der Knopf ist deaktiviert UND der Text steht da** |
| „ohne haengende Geraete fragt Loeschen nach" | Die Gegenprobe |
| „die Ziel-Marke erscheint genau einmal" | ⛔ **`toBe(1)`** |
| „eine Zeile zeigt entweder aktuelles Ziel oder Als Ziel, nie beides" | `:141-152` |
| „die Reihenfolge-Knoepfe sind am Rand deaktiviert" | `:122`, `:129`. ⛔ **Beide Raender** |
| „Verschieben schreibt die vollstaendige Reihenfolge, nicht nur die verschobene Id" | `:71-78` |
| „kein Bedienelement traegt size" | ⛔ **Falle 4 als Quelltext-Zusicherung** — der einzige Weg, sie in Vitest zu fassen |
| (admin/actions.test.ts) Fall 7 | ⛔ **scharf** |
| (riegel.test.ts) Seitenzahl | ⛔ **7 → 8** |

**Playwright-Fall (V23):** `/admin/versionen` → 200 mit sichtbarer Tabelle (`Spec:4881-4882`,
Fall 5); ⛔ **plus ein echter Schreibvorgang „Version anlegen"** (`Spec:4887-4888`, Fall 7), mit
Warmlauf und `page.waitForResponse`.

- [ ] **Schritt 1** — Insel-Test schreiben, rot; Fall 7 in `admin/actions.test.ts` scharf stellen.
- [ ] **Schritt 2** — Sonden: **S-V19a**: ⛔ **`requireRadioAdmin()` in `versionen/page.tsx` durch
      `requireRadioVerwaltung()` ersetzen** → `riegel.test.ts` bleibt **gruen**, `admin/actions.test.ts`
      Fall 7 wird **rot**. ⛔ **Das ist die Messung, die Auflage 2 belegt, und sie gehoert in die
      Rueckmeldung dieser Aufgabe — mit beiden Ergebnissen.** **S-V19b**: die Loeschsperre entfernen
      → der Sperrfall rot. **S-V19c**: ein `size="small"` wieder eintragen → der Falle-4-Fall rot.
- [ ] **Schritt 3** — bauen.
- [ ] **Schritt 4** — `ADMIN_SEITEN_ANZAHL` **7 → 8**; Playwright-Faelle nachtragen.
- [ ] **Schritt 5** — Tor.

```bash
rtk git add "src/app/m/radio/admin/(arbeit)/versionen/page.tsx" \
            "src/app/m/radio/admin/(arbeit)/versionen/VersionenTabelle.tsx" \
            "src/app/m/radio/admin/(arbeit)/versionen/NeuVersion.tsx" \
            "src/app/m/radio/admin/(arbeit)/versionen/VersionenTabelle.test.tsx" \
            src/app/m/radio/riegel.test.ts src/app/m/radio/admin/actions.test.ts \
            e2e/radio-verwaltung.spec.ts
rtk git commit -m "feat(radio): die Softwareversionen — Insel 3, erste Seite auf der Admin-Stufe"
```

---

## Aufgabe V20: `/admin/zugaenge` — Insel 8, ⛔ **zweite Seite auf der ADMIN-Stufe**

**Files:** Create `admin/(arbeit)/zugaenge/page.tsx`, `.../CodeTabelle.tsx`,
`.../CodeTabelle.test.tsx`, `_lib/lesepfade/codes.ts` + Test · Modify `riegel.test.ts` (**8 → 9**),
`admin/actions.test.ts` (Fall 8 scharf), `e2e/radio-verwaltung.spec.ts`

**Interfaces:** Consumes `erstelleCode`, `setzeCodeAktiv` (`_actions/codes.ts:78`, `:121`,
Planteil 3, NS-A6).

⛔ **ERSTE ANWEISUNG: `await requireRadioAdmin()`** (`Spec:4377`) — und hier ist der fachliche Grund
ausgeschrieben (`Spec:4456-4459`): „die Updater-Stufe erreicht die Code-Verwaltung **nicht**. Jede
codebezogene Seite/Action ruft `requireRadioAdmin()`, **nicht** `requireRadioVerwaltung()`, weil
Ausstellen/Sperren laut Betreiberantwort 6 allein den radio-admins gehoeren."

⛔ **Dieselbe namentliche Zusicherung wie V19** — Fall 8 in `admin/actions.test.ts` wird scharf.

⛔ **Der Pfad ist `zugaenge/`, nicht `codes/`** — B9. §5.6.1 (`Spec:4510`) und §5.13 (`Spec:4860`)
tragen den alten Namen und sind ueberholt.

### Der Lesepfad `_lib/lesepfade/codes.ts`

`codesListe(db): CodeZeile[]` — die Verwaltungsliste ueber `zugangscodes` (`_db/schema.ts:147-192`).
⛔ **Die Anzeigespalte heisst `bezeichnung`, nicht `label`** (B6, `_db/schema.ts:170-174`).

⛔ **`lastUsedAt = NULL` heisst „nie eingeloest" und ist REINE ANZEIGE, ohne Einfluss auf
Gueltigkeit** (`_db/schema.ts:190-191`).

⛔ **Der Klartext-Code steht in der Liste — und das ist der Grund, warum diese Seite auf der
Admin-Stufe liegt.** ⚠️ **Er darf in keiner Protokollzeile und keiner Fehlermeldung landen.**

### Insel 8 — `CodeTabelle.tsx`

Spalten: Bezeichnung · Code · Zustand (aktiv/gesperrt) · zuletzt benutzt · Aktionen
(Sperren/Entsperren). Dazu ein Anlegen-Feld ueber `erstelleCode(bezeichnung)`.

⛔ **ES GIBT KEINE LOESCHFUNKTION UND ES WIRD KEINE GEBAUT** (NS-A6, drei ausgeschriebene Gruende in
`_actions/codes.ts`). ⛔ **Der Zustand `aktiv` ist der einzige Widerruf** (`_db/schema.ts:180-183`):
„Ein Import oder ein Seed, der alles als aktiv anlegt, reaktiviert still jeden gesperrten Code — und
zwar genau die, die gesperrt wurden, weil ein Kaertchen verschwunden ist."

⛔ **`gesperrtAm`/`gesperrtVon` werden ANGEZEIGT** (`_db/schema.ts:184-187`): „Sie existieren, WEIL
die Zeile dauerhaft in der Liste steht und erklaeren muss, warum sie tot ist; `aktiv = false` allein
verlangte vom Betreiber, sich das zu merken."

⛔ **Ein Link auf das Druckblatt** — ⚠️ **er entsteht in V21, nicht hier** (dieselbe Regel wie bei
V14/V15: ein Link auf eine 404 ist schlimmer als kein Link). V20 laesst die Stelle mit einem
⬜-Kommentar frei, V21 als benannter Nachfolger.

| Testname (`CodeTabelle.test.tsx`) | Aussage |
|---|---|
| „ein gesperrter Code bleibt in der Liste" | ⛔ **Die Zusicherung des Loeschverbots auf der Flaeche** |
| „ein gesperrter Code zeigt, wann und von wem" | `_db/schema.ts:184-187`. ⛔ **Beide Felder** |
| „nie eingeloest wird als Text gezeigt, nicht als leere Zelle" | `_db/schema.ts:190-191` |
| „es gibt keinen Loeschknopf" | ⛔ **Eine NEGATIVE Zusicherung, und sie ist der Punkt.** NS-A6 |
| „Sperren und Entsperren sind derselbe Knopf mit zwei Beschriftungen" | Sonst gibt es zwei Wege in denselben Zustand |
| (admin/actions.test.ts) Fall 8 | ⛔ **scharf** |
| (riegel.test.ts) Seitenzahl | ⛔ **8 → 9** |

**Playwright-Fall (V23):** `/admin/zugaenge` → 200 mit sichtbarer Tabelle (`Spec:4881-4882`, Fall 5).

- [ ] **Schritt 1** — Lesepfad-Test und Insel-Test schreiben, rot; Fall 8 scharf stellen.
- [ ] **Schritt 2** — Sonden: **S-V20a**: `requireRadioAdmin()` durch `requireRadioVerwaltung()`
      ersetzen → `riegel.test.ts` **gruen**, `admin/actions.test.ts` Fall 8 **rot**. ⛔ **Beide
      Ergebnisse in die Rueckmeldung.** **S-V20b**: einen Loeschknopf einbauen → „es gibt keinen
      Loeschknopf" rot. **S-V20c**: einen gesperrten Code aus der Liste filtern → „bleibt in der
      Liste" rot.
- [ ] **Schritt 3** — bauen. ⛔ **Die Stelle fuer den Blatt-Link bleibt mit ⬜-Kommentar frei.**
- [ ] **Schritt 4** — `ADMIN_SEITEN_ANZAHL` **8 → 9**; Playwright-Fall nachtragen.
- [ ] **Schritt 5** — Tor.

```bash
rtk git add "src/app/m/radio/admin/(arbeit)/zugaenge/page.tsx" \
            "src/app/m/radio/admin/(arbeit)/zugaenge/CodeTabelle.tsx" \
            "src/app/m/radio/admin/(arbeit)/zugaenge/CodeTabelle.test.tsx" \
            src/app/m/radio/_lib/lesepfade/codes.ts \
            src/app/m/radio/_lib/lesepfade/codes.test.ts src/app/m/radio/riegel.test.ts \
            src/app/m/radio/admin/actions.test.ts e2e/radio-verwaltung.spec.ts
rtk git commit -m "feat(radio): die Zugangsverwaltung — Insel 8, zweite Seite auf der Admin-Stufe"
```

---

## Aufgabe V21: `/admin/zugaenge/blatt` — das Druckblatt, ohne Insel

**Files:** Create `admin/(druck)/zugaenge/blatt/page.tsx`, `admin/(druck)/druck.css` ·
Modify `admin/(arbeit)/zugaenge/page.tsx` (der Link), `riegel.test.ts` (**9 → 10**),
`admin/actions.test.ts` (Fall 9 scharf), `e2e/radio-verwaltung.spec.ts`

**Interfaces:** Consumes `codesListe` (V20).

⛔ **ERSTE ANWEISUNG: `await requireRadioAdmin()`** (`Spec:4378`). ⛔ **Diese Seite liegt im
STRENGEN Zweig** (`riegel.test.ts:408-417` liefert fuer alles ausserhalb `(arbeit)` **nur**
`requireRadioAdmin`) — sie waere vom Scan gedeckt. ⛔ **Aber nur, solange sie in `(druck)` liegt**,
und **das** ist, was Fall 9 in `admin/actions.test.ts` prueft.

⛔ **KEINE Insel** — ein Bogen mit QR-Codes und Klartext, ohne Bedienelement. ⛔ **Braeuchte er
eine, waere das ein Zeichen, dass etwas Interaktives auf dem Papier gelandet ist.**

⛔ **Das `(druck)`-Layout traegt KEINEN `VerwaltungsRahmen`** (`Spec:4368`, §1.2.2) — es steht
bereits (`admin/(druck)/layout.tsx`). Die Begruendung dort woertlich: laege das Blatt unter
`(arbeit)`, druckte die Shell Kopfzeile und App-Umschalter mit, und ihr `minHeight: 100vh` erzeugte
**leere Folgeseiten hinter dem Bogen** (`lagerbuch/verwaltung/(druck)/layout.tsx:10-12`).

⛔ **`druck.css` entsteht hier** — der Kommentar im Layout sagt es: „KEIN Stylesheet-Import:
`lagerbuch` zieht hier `./druck.css`. Das Druckbild von `radio` gehoert zu **Planteil 4**, MIT dem
Blatt."

⛔ **Der Link von `/admin/zugaenge` auf das Blatt wird HIER eingetragen** und der ⬜-Kommentar aus
V20 entfernt.

⚠️ **Und die sicherheitsrelevante Zeile:** die Seite zeigt **Zugangscodes im Klartext**
(`admin/(druck)/layout.tsx:14-18`). Deshalb ⛔ **derselbe Riegel wie in `(arbeit)`, in derselben
Reihenfolge, dieselben Funktionen — nicht zwei Abschriften.**

| Testname | Aussage |
|---|---|
| (admin/actions.test.ts) Fall 9 „liegt in (druck), nennt requireRadioAdmin und NICHT requireRadioVerwaltung" | ⛔ **scharf, beide Haelften.** ⛔ **Die LAGEPRUEFUNG ist der Teil, der nicht selbstverstaendlich ist**, und die negative Haelfte schliesst die Luecke, die `personenRiegelFuer`s strenger Zweig offen laesst (er prueft nur die Anwesenheit, `riegel.test.ts:408-417`) |
| (admin/actions.test.ts) Fall 10 „genau DREI Verwaltungsseiten nennen requireRadioAdmin" | ⛔ **`toBe(3)`, ab jetzt scharf** — die Menge ist vollstaendig |
| (riegel.test.ts) Seitenzahl | ⛔ **9 → 10.** ⛔ **Der Anhebe-Fahrplan aus `riegel.test.ts:81-95` ist damit ABGEARBEITET; die naechste Anhebung braucht einen neuen** |
| (riegel.test.ts) Klausel (e), strenger Zweig | Die Seite traegt `requireRadioAdmin(` und **kein** `requireRadioVerwaltung(` |

**Playwright-Fall (V23), ⛔ der einzige, der die Groups unterscheidet:** `/admin/zugaenge/blatt`
→ 200, ⛔ **OHNE Kopfzeile und OHNE Navigationsleiste im Rumpf** (`Spec:4883-4885`, Fall 5a) — „das ist die
einzige Pruefung, die die Route-Group `(druck)` von `(arbeit)` unterscheidet; **ohne sie druckt das
Blatt still mit Suite-Kopfzeile und `controlHeight: 44`**."

- [ ] **Schritt 1** — Faelle 9 und 10 in `admin/actions.test.ts` scharf stellen.
- [ ] **Schritt 2** — Sonden: **S-V21a**: die Seite testweise nach `admin/(arbeit)/zugaenge/blatt/`
      verschieben → ⛔ **Fall 9 rot**, `riegel.test.ts` bleibt gruen. ⛔ **Beide Ergebnisse in die
      Rueckmeldung** — sie belegen, warum die Lagepruefung existiert. **S-V21b**: eine vierte Seite
      auf `requireRadioAdmin` heben → Fall 10 rot. **S-V21c**: dem Blatt zusaetzlich ein
      `requireRadioVerwaltung()` als **erste** Anweisung geben (der `requireRadioAdmin()`-Aufruf
      bleibt darunter stehen) → ⛔ **`riegel.test.ts` bleibt GRUEN, Fall 9 wird rot.** ⛔ **Beide
      Ergebnisse in die Rueckmeldung** — sie belegen, warum die negative Haelfte existiert.
- [ ] **Schritt 3** — `blatt/page.tsx` und `druck.css` bauen; den Link in
      `admin/(arbeit)/zugaenge/page.tsx` eintragen und den ⬜-Kommentar entfernen.
- [ ] **Schritt 4** — `ADMIN_SEITEN_ANZAHL` **9 → 10**. ⛔ **Und den Anhebe-Fahrplan im Kopf von
      `riegel.test.ts` als ABGEARBEITET markieren**, in derselben Form wie bei
      `AUSLEIH_FLAECHEN_ANZAHL` (`riegel.test.ts:126-130`).
- [ ] **Schritt 5** — Playwright-Fall 5a nachtragen. ⛔ **Er prueft die ABWESENHEIT zweier
      Elemente** — nicht die Anwesenheit des Blatts.
- [ ] **Schritt 6** — Tor.

```bash
# ⛔ NAMENTLICH, und hier ist es nicht kosmetisch: `admin/(druck)/` enthaelt seit Planteil 2
# `layout.tsx`, das diese Aufgabe NICHT anfasst — eine Verzeichnisform naehme es mit.
rtk git add "src/app/m/radio/admin/(druck)/zugaenge/blatt/page.tsx" \
            "src/app/m/radio/admin/(druck)/druck.css" \
            "src/app/m/radio/admin/(arbeit)/zugaenge/page.tsx" \
            src/app/m/radio/riegel.test.ts src/app/m/radio/admin/actions.test.ts \
            e2e/radio-verwaltung.spec.ts
rtk git commit -m "feat(radio): das druckbare Zugangsblatt — zehnte Seite, Fahrplan abgearbeitet"
```

---

## Aufgabe V22: `admin/(arbeit)/geraete/export/route.ts` — der eine Handler, nicht-werfend, 404

**Files:** Create `admin/(arbeit)/geraete/export/route.ts`, `.../route.test.ts` ·
Modify `riegel.test.ts` (**`HANDLER_ANZAHL` 3 → 4**), `admin/(arbeit)/geraete/GeraeteTabelle.tsx`
(der Ausloeser), `e2e/radio-verwaltung.spec.ts`

**Interfaces:** Consumes `geraeteFuerExport` (**V6**), `EXPORT_SPALTEN`, `formatiereZelle` (V9),
`radioHostOderNull` (`_lib/host.ts:64`), `istRadioAdmin`/`viewerOderNull` (`_lib/zugang.ts:188`,
`:86`).

⛔ **DIE AUSNAHME VON ALLEM DARUEBER, UND SIE HAT DREI HAELFTEN, DIE `riegel.test.ts` KLAUSEL (c)
EINZELN PRUEFT** (`riegel.test.ts:599-610`):

```ts
export async function GET(request: Request) {
  if (radioHostOderNull(request.headers) === null) {
    return new Response(null, { status: 404 });
  }
  if (!istRadioAdmin(await viewerOderNull())) {
    return new Response(null, { status: 404 });
  }
  // … der Handler baut seine Antwort selbst
}
```

| Auflage | Warum | Beleg |
|---|---|---|
| ⛔ **`radioHostOderNull`, NICHT `requireRadioHost`** | Die werfende Form ist im Antwortweg eines Handlers die falsche Gestalt | `riegel.test.ts:603-605`, `Spec:4379` |
| ⛔ **`istRadioAdmin(await viewerOderNull())`, NICHT `requireRadioAdmin()`** | ⛔ **B11 (`Spec:100`), bestaetigt B17 (`Spec:117`):** `requireRadioAdmin` endet in `redirect('/login?…')` bzw. `notFound()`; woertlich umgesetzt landete ein anonymer `GET` auf `/admin/geraete/export` in einem **Login-Umweg** — typkorrekt, lint-sauber. ⚠️ **Und der falsche Griff ist der naheliegende:** der Handler liegt unter `admin/(arbeit)/`, wo alles andere auf `requireRadioVerwaltung` steht. **Gemessen (Fix-Runde 1, Sonde S1): derselbe Handler mit `requireRadioVerwaltung()` lief `12 passed`** — die dritte Zeile der Klausel wurde deshalb nachgetragen | `riegel.test.ts:573-595` |
| ⛔ **404, NIE 403** | ⛔ **B10 (`Spec:99`):** „Der Preis der Abweichung waere, dass `GET /admin/geraete/export` den Bestand an Verwaltungspfaden **aufzaehlbar** macht, waehrend die Seiten daneben schweigen; **kein Tor sieht es, beide Zweige sind gueltiges HTTP**" | `Spec:4379` |
| ⛔ **`istRadioAdmin`, NICHT die Verwaltungsstufe** | Rechtetafel: „CSV-Export — Admin ja, Updater **nein**" (`Spec:4451`); Alt-Beleg `export.ts:71` (`requireRole('admin')`) | `Spec:4444-4454` |
| ⛔ **`hostAbweisung` waere hier FALSCH** | B13 laesst beide Formen zu, aber `Spec:4379` zeigt fuer **diesen** Handler `radioHostOderNull`. Die vierte Form gehoert `sw.js` (Planteil 5) | `Spec:102`, `riegel.test.ts:556-561` |

⚠️ **`Spec:4728` sagt woertlich noch „baut seine `403` selbst"** — ⛔ **das ist die von B17
ausdruecklich als veraltet benannte Formulierung. Lies sie als 404.**

### Die Antwort

* `Content-Type: text/csv; charset=utf-8` (`export.ts:73`)
* `Content-Disposition: attachment; filename="funkgeraete-export.csv"` (`export.ts:74`)
* Rumpf: BOM + `;`-getrennte Zeilen, **19** Spalten in fester Reihenfolge (V9)
* Daten: `geraeteFuerExport(db)` — ⛔ **ALLE Geraete, `desc(createdAt)`, kein `loanable`-Filter**
  (`deviceRepo.ts:63-65`)

### Der Ausloeser in Insel 1

1:1 aus `DeviceList.tsx:104-111`: ein **programmatischer gleichherkunfts-GET-Anker** mit
`download`-Attribut. ⛔ **Er wird nur gerendert, wenn `darfExportieren` wahr ist** (`:150`) — und
⛔ **das ist eine Anzeige-Entscheidung, keine Sperre**; die Sperre ist das Praedikat im Handler.

⚠️ **Der Alt-Pfad `/api/devices/export` wandert NICHT mit** — der Suite-Pfad ist
`/m/radio/admin/geraete/export`. ⛔ **Und der Alt-Pfad darf im Quelltext nirgends stehen** (die
Prosa-Sperre, Abnahmebefehl fuer 6.7-C).

| Testname (`route.test.ts`) | Aussage |
|---|---|
| „auf einem fremden Host antwortet der Handler 404" | ⛔ **Erste Zeile.** Und **404**, nicht 403 |
| „ohne Sitzung antwortet der Handler 404, nicht mit einer Weiterleitung" | ⛔ **B11 als Verhaltensfall.** Der Fall faengt ein versehentliches `requireRadioAdmin()` |
| „als Updater antwortet der Handler 404" | Rechtetafel. ⛔ **Der Fall, den ein `requireRadioVerwaltung()` still gruen liesse** |
| „als Admin antwortet der Handler mit text/csv" | Der positive Fall |
| „die Antwort beginnt mit dem BOM" | `export.ts:9`, `:61` |
| „die Antwort traegt einen Dateinamen im Content-Disposition" | `export.ts:74` |
| „der Export enthaelt auch nicht ausleihbare Geraete" | ⛔ **Der Gegenfall zu F1** — hier waere ein Filter der Fehler |
| (riegel.test.ts) „die Handlerzahl steht EXAKT auf dem Stand dieses Planteils" | ⛔ **`HANDLER_ANZAHL` 3 → 4** (V18 hat sie auf 3 gehoben) |
| (riegel.test.ts) Klausel (c), drei Haelften | `radioHostOderNull` ja · `requireRadioHost` nein · werfender Personen-Riegel nein |

**Playwright-Fall (V23):** `/admin/geraete/export` → 200, `text/csv`, ⛔ **Antwort beginnt mit dem
BOM** (`Spec:4886`, Fall 6).

- [ ] **Schritt 1** — Testfaelle schreiben, rot.
- [ ] **Schritt 2** — Sonden: **S-V22a**: `requireRadioAdmin()` statt des Praedikats → ⛔ **Klausel
      (c) rot UND „ohne Sitzung … 404" rot**. **S-V22b**: `403` statt `404` → der Fremdhost-Fall
      rot. **S-V22c**: `istRadioAdmin` durch die Verwaltungsstufe ersetzen → „als Updater … 404"
      rot ⛔ **und Klausel (c) rot** (der werfende Name kaeme gar nicht vor — deshalb ist der
      Verhaltensfall hier der tragende, nicht der Scan). **S-V22d**: `HANDLER_ANZAHL` auf 3 lassen
      → der Zaehlfall rot.
- [ ] **Schritt 3** — bauen; den Ausloeser in Insel 1 eintragen.
- [ ] **Schritt 4** — `HANDLER_ANZAHL` **3 → 4**, und den Anhebe-Fahrplan im Kopf von
      `riegel.test.ts` fuer diese Zeile als erledigt markieren (⛔ **Planteil 5 steht danach bei 5**,
      nicht bei 4 — E-V16 hat einen zweiten Handler eingezogen; der Fahrplan wird entsprechend
      **nachgezogen**, nicht stillschweigend um eins verschoben).
- [ ] **Schritt 5** — Playwright-Fall nachtragen. ⛔ **Warmlauf-GET vor dem echten Abruf** (Falle 10).
- [ ] **Schritt 6** — Tor.

```bash
rtk git add "src/app/m/radio/admin/(arbeit)/geraete/export/route.ts" \
            "src/app/m/radio/admin/(arbeit)/geraete/export/route.test.ts" \
            "src/app/m/radio/admin/(arbeit)/geraete/GeraeteTabelle.tsx" \
            src/app/m/radio/riegel.test.ts e2e/radio-verwaltung.spec.ts
rtk git commit -m "feat(radio): der CSV-Export-Handler — nicht-werfend, 404 statt 403"
```

---

## Aufgabe V23: Der Abschluss — Build, Playwright, und das Ablesen von ⬜ V-L3

⛔ **EINMAL, VOR DEM MERGE, NACH ALLEN TESTS — NIE DAVOR.** `pnpm build` erzeugt unter
`.next/standalone/src/` eine vollstaendige Kopie des Quellbaums **inklusive Testdateien** (52
gemessene Fehlschlaege), und `pnpm dev` parallel zur Testsuite ist ebenfalls verboten.

**Files:** Modify `e2e/radio-verwaltung.spec.ts` (Vollstaendigkeit), `src/app/m/radio/riegel.test.ts`
(⛔ **nur der Kopfkommentar**, das Ablesen von ⬜ V-L3)

### Die Torreihenfolge

- [ ] **1 —** `rtk pnpm typecheck` → **0 Fehler** (⛔ **Exit-Code pruefen**, NT7)
- [ ] **2 —** `rtk pnpm lint` → **0 Fehler**
- [ ] **3 —** `rtk pnpm vitest run` → ⛔ **gegen die in „Stand" selbst gemessene Grundlinie.**
      Jeder Fehlschlag in einer Datei, die dieser Planteil nicht anfasst, ist ein **neuer**
- [ ] **4 —** `rtk pnpm build` → 0
- [ ] **5 —** `rtk pnpm exec playwright test` → alle Faelle

### `e2e/radio-verwaltung.spec.ts` — die vollstaendige Liste (`Spec:4874-4891`)

| # | Fall | Auflage |
|---|---|---|
| 1 | `/admin` → 200, vier Kennzahlen sichtbar, ⛔ **„Veraltet" ist NICHT rot** | Falle 3 |
| 2 | `/admin/geraete` → 200, Tabelle **mit Kopfzeile**; ⛔ **ein Filter gesetzt ⇒ die URL traegt ihn** | Regime B |
| 3 | `/admin/geraete/<id>` → 200, ⛔ **Formular sichtbar** | Falle 1 |
| 4 | `/admin/geraete/<id>/ereignisse` → 200 | |
| 5 | `/admin/ausleihen`, `/admin/versionen`, `/admin/import`, `/admin/software`, `/admin/zugaenge` → je 200 mit sichtbarer Tabelle bzw. Assistent | |
| **5a** | `/admin/zugaenge/blatt` → 200, ⛔ **OHNE Kopfzeile und OHNE Navigationsleiste im Rumpf** | ⛔ **„die einzige Pruefung, die die Route-Group `(druck)` von `(arbeit)` unterscheidet"** — ohne sie druckt das Blatt still mit Suite-Kopfzeile und `controlHeight: 44` |
| 6 | `/admin/geraete/export` → 200, `text/csv`, ⛔ **Antwort beginnt mit dem BOM** | |
| 7 | ⛔ **Ein Schreibvorgang je Action-Familie:** Version anlegen · Gerät ändern · Notiz anfügen · Import schreiben | ⛔ **Vier, nicht einer** |
| 8 | `/admin` auf einem **fremden** Suite-Host ⇒ 404 | ⛔ **GRUENER Fall, kein `test.skip`** — ⬜ V-L4 ist durch Messung gestrichen. Form 1:1 aus `e2e/lagerbuch-hosts.spec.ts:151-152`: `const fremd = await page.request.get(fremdUrl("/m/radio/admin")); expect(fremd.status(), …).toBe(404);` — eine **absolute** URL, mit demselben **einen** `baseURL`. ⛔ **UND DIE VORAUSSETZUNG, DIE DEN FALL ERST TRAGFAEHIG MACHT** (`lagerbuch-hosts.spec.ts:145-149`, woertlich): **zuerst mit der `radio`-Gruppe anmelden.** „sonst waere der 404 der GRUPPENRIEGEL und nicht der HOSTRIEGEL, und der Test bewiese das Falsche" — `AUTH_COOKIE_DOMAIN=".localtest.me"` traegt die Sitzung vom `radio`-Host auf den fremden mit. ⚠️ **`Spec:4889-4891` („Erfordert einen zweiten `baseURL` … nicht pruefbar") ist damit ueberholt** — benannte Abweichung, gemessen |

⛔ **Zwei Testregeln aus Falle 10, verbindlich** (`Spec:4893-4898`):

1. ⛔ **Vor dem ersten echten POST auf einen Route Handler oder eine Action: ein Warmlauf-GET auf
   dieselbe Route.** `next dev` kompiliert beim ersten Treffer, der HMR-Reload bricht die laufende
   Anfrage mit `net::ERR_ABORTED` ab — **nie eine Antwort**.
2. ⛔ **Jeder Test, der eine Anfrage ausloest, prueft ihre Antwort** mit `page.waitForResponse`,
   statt auf eine spaetere Zustandsaenderung zu warten. Sonst laeuft jede abgelehnte Antwort still
   ins Zeitbudget und meldet sich als etwas anderes.
3. ⛔ **Fuer Klicks auf Navigationslinks: `klickeWennRuhig` aus `e2e/fixtures.ts`, nicht `.click()`**
   (Falle 12).

### ⛔ Die Sonden, die NUR hier gefahren werden koennen

Die Aufgaben V12–V14 haben je einen Vermerk hinterlassen: eine Sonde, die **kein Vitest-Fall**
faengt. ⛔ **Sie werden hier gefahren, einzeln, und jedes Ergebnis geht in die Rueckmeldung.**

| Sonde | Herkunft | Erwartung |
|---|---|---|
| **S-V23a** | V13 (S-V13a): `COLUMN_DEFS` nach `_lib/` verschieben | ⛔ **Fall 2 rot**, mit `Error: Functions cannot be passed directly to Client Components`. ⛔ **Bleibt er gruen, ist Falle 9 in diesem Modul unbewacht — und das ist ein Fund, kein Erfolg** |
| **S-V23b** | V12 (S-V12c): eine Kennzahlkarte auf `FARBEN.rot` setzen | Fall 1 rot |
| **S-V23c** | V14 (S-V14d): `Form.Item` in `geraete/[id]/page.tsx` statt in der Insel | ⛔ **Fall 3 rot, mit HTTP 500** — Falle 1 |
| **S-V23d** | V13 (S-V13d): `pagination` an der Tabelle einschalten | Fall 2 rot (die URL traegt den Filter nicht mehr) |
| **S-V23e** | neu: das Blatt testweise nach `(arbeit)` verschieben | ⛔ **Fall 5a rot** — Kopfzeile im Rumpf |

⛔ **Jede Sonde wird von Hand gesetzt und von Hand zurueckgenommen**, und **danach** wird
`rtk git diff` mit dem Stand davor verglichen — **byteweise gleich**. ⛔ **Kein
`git checkout --`**: im Arbeitsbaum liegt parallel anderes.

### ⛔ Das Ablesen von ⬜ V-L3 (Z-L1 / A-L9) — der eigentliche Zweck dieser Aufgabe

`riegel.test.ts:49-53` haelt fest: „⚠️ **WAS SIE AUSDRUECKLICH NICHT BELEGT:** dass ein Riegel bei
einem echten Abruf **GREIFT**. … Ob das Layout einer Route-Group ohne Seite darunter ueberhaupt
ausgefuehrt wird, ist ⬜ **Z-L1** und wird **in Planteil 4** beim ersten echten Abruf abgelesen.
⛔ **Kein Fall in dieser Datei darf etwas anderes behaupten.**"

- [ ] **A —** Ein Abruf von `/admin` **ohne Sitzung** auf dem `radio`-Host. **Erwartet:**
      Weiterleitung nach `/login?callbackUrl=…`. **Ergebnis:** ⬜ ______
- [ ] **B —** Ein Abruf von `/admin` **mit Sitzung, ohne beide Gruppen**. **Erwartet: 404**,
      ⛔ **nicht 403**. **Ergebnis:** ⬜ ______
- [ ] **C —** Ein Abruf von `/admin` **mit der Updater-Gruppe**. **Erwartet: 200**, und die
      Navigation zeigt **vier** Eintraege. **Ergebnis:** ⬜ ______
- [ ] **D —** Ein Abruf von `/admin/versionen` **mit der Updater-Gruppe**. ⛔ **Erwartet: 404** —
      ⛔ **das ist die Wirkprobe der namentlichen Zusicherung aus Auflage 2.** **Ergebnis:** ⬜ ______
- [ ] **E —** ⛔ **Das Layout selbst:** greift der Riegel in `admin/(arbeit)/layout.tsx`, oder haelt
      die Seite allein? Probe: den Riegel in **der Seite** (nicht im Layout) testweise entfernen und
      B wiederholen. **Erwartet: weiterhin 404** — dann traegt das Layout. **Ergebnis:** ⬜ ______
- [ ] **F —** ⛔ **Das Ergebnis von A–E wird in den Kopfkommentar von `riegel.test.ts` eingetragen**,
      an die Stelle von Z-L1 (`:49-53`) — ⛔ **mit Datum und Messwert, nicht als „geprueft".**
      ⛔ **Ist E negativ (das Layout traegt NICHT), ist das ein FUND**, kein Nebenergebnis: dann
      haengt der ganze Verwaltungsriegel an zehn einzelnen Seitenzeilen, und das gehoert in die
      Schlusspruefung, nicht in eine Fussnote.

### Die Abnahmebefehle fuer 6.7-Abschnitt C

- [ ] **0 — ⛔ Die POSITIVKONTROLLEN zuerst.** Ein Befehl, der nichts findet, ist ohne sie eine
      Behauptung, keine Messung:
      `rtk proxy rg -n "requireRadioHost" src/app/m/radio` → **muss treffen**;
      `rtk proxy find src/app/m/radio -type d -name _lib` → **muss treffen**.
      ⛔ **Trifft eine der beiden nicht, sind die Befehle 1 und 2 wertlos** — dann ist der Pfad, das
      Werkzeug oder das Arbeitsverzeichnis falsch, und das ist der Fund.
- [ ] **1 —** ⛔ **DIE GESCHAERFTE FASSUNG — DIESE, NICHT DIE AUS DER SPEC:**

      ```bash
      rtk proxy rg -n --pcre2 "RADIO_ADMIN_(?!GRUPPE\b)|api/v1/" src/app/m/radio
      ```

      → ⛔ **nichts** (Exit 1).
      ⛔ **`rtk proxy`, nicht `rtk grep`:** der Regex-Dialekt des Filters ist nicht festgeschrieben,
      und ein woertlich genommenes `|` machte diesen Befehl **dauerhaft gruen**. ⛔ **Alternativ
      zwei Einzelmuster.**
      ⚠️ **Notwendig, nicht hinreichend.**

      ⛔ **WARUM DIE SPEC-FASSUNG HIER NICHT MEHR STEHT.** `Spec:5453` (= `6-grenze.md:518`) fuehrt
      den Befehl als `rg -n "RADIO_ADMIN_|api/v1/" src/app/m/radio` → „liefert **nichts**". **Er
      liefert heute FUENF Treffer, und alle fuenf sind harmlos:** `RADIO_ADMIN_GRUPPE` in
      `_lib/e2eEnv.test.ts` (`:6, 112, 125, 227, 242`) ist ein **Suite-Gruppenname** fuer die
      e2e-Umgebung, kein Alt-System-Bezug. ⛔ **Wer die Spec-Fassung am Cutover-Abend 1:1 faehrt,
      nimmt einen gruenen Zustand ROT ab** — und bricht im schlimmsten Fall einen Cutover ab, der
      in Ordnung ist. Die Sachaussage von Abschnitt C steht unveraendert; nur der Befehl war zu
      weit. ⛔ **Die Spec bleibt, wie sie ist** — sie ist der Vertrag, dies hier ist der
      Handgriff. Gemessen am **2026-08-27** (Schlusspruefung `radio`-Gesamt, Fund 2).

      ⛔ **Das Ausschlussmuster ist ENG, nicht `RADIO_ADMIN_URL|RADIO_ADMIN_TOKEN`.** Es nimmt
      **genau einen** bekannten Namen heraus und laesst das weite Netz stehen: ein neu
      hinzugekommenes `RADIO_ADMIN_HOST` oder `RADIO_ADMIN_BASE` faengt es weiterhin. Eine
      Positivliste der zwei heute bekannten Namen taete das **nicht**.

      ⛔ **KEINE ROHRFORM UEBER GANZE ZEILEN.** `… | rg -v "RADIO_ADMIN_GRUPPE"` sieht gleichwertig
      aus und ist es nicht: eine Zeile, die den harmlosen Gruppennamen **und** einen echten
      Verstoss traegt, faellt dort **still** heraus. **Gemessen am 2026-08-27** an einer
      kuenstlichen Sondendatei mit drei Verstoessen (P1 `RADIO_ADMIN_URL`, P2 `api/v1/`,
      P3 beide Namen in **derselben** Zeile), danach zurueckgenommen:

      | Fassung | P1 | P2 | **P3** | Urteil |
      |---|---|---|---|---|
      | Spec 1:1 `rg -n "RADIO_ADMIN_\|api/v1/"` | ✅ | ✅ | ✅ | ⛔ **faengt zusaetzlich die 5 harmlosen** (8 Treffer statt 3) |
      | ⛔ **geschaerft, Lookahead** (oben) | ✅ | ✅ | ✅ | ✅ **3 Treffer, keine harmlosen** |
      | Ersatzform ohne PCRE2 (unten) | ✅ | ✅ | ✅ | ✅ gleichwertig |
      | ~~`… \| rg -v "RADIO_ADMIN_GRUPPE"`~~ | ✅ | ✅ | ❌ **verloren** | ⛔ **nicht benutzen** |

      **Gegenprobe am heutigen Stand nach Ruecknahme der Sonde: Exit 1, keine Treffer.**

      ⚠️ **Wenn `rg` ohne PCRE2 gebaut ist** (`rg --version` nennt `+pcre2` — hier 15.2.0 mit),
      ist dies die gleichwertige Ersatzform; `-o` stellt jeden Treffer auf eine **eigene** Zeile
      und rettet damit den P3-Fall:

      ```bash
      rtk proxy rg -o -n "RADIO_ADMIN_\w+|api/v1/" src/app/m/radio | rg -v "RADIO_ADMIN_GRUPPE"
      ```
- [ ] **2 —** `rtk proxy find src/app/m/radio -type d -name api` → ⛔ **nichts** (§6.4).
- [ ] **3 —** ⛔ **Alle sechs Ersatzfunktionen stehen in `_db/leihen.ts`** — `rtk grep -c "^export
      function" src/app/m/radio/_db/leihen.ts` und die Namen einzeln nachsehen.
- [ ] **4 —** ⛔ **Beide Oberflaechen rufen sie:** die Ausleihe (Planteil 3) und die Verwaltung
      (`/admin/ausleihen`, V16). **Damit ist C erfuellt — und D ist ab jetzt moeglich, nicht
      faellig.**

```bash
rtk git add src/app/m/radio/riegel.test.ts e2e/radio-verwaltung.spec.ts
rtk git commit -m "test(radio): der Abschluss von Planteil 4 — Z-L1 abgelesen, Abschnitt C ist zu"
```

---

## Was Planteil 4 NICHT liefert — mit Eigentuemern

| Posten | Warum nicht | ⛔ **Eigentuemer** |
|---|---|---|
| **6.7-Abschnitt D — der Router-Schwenk** | „Der Router-Schwenk **ist** der Fall der HTTP-Grenze — kein Schritt danach." Er verlangt A–C gruen, einen Traefik-Router auf den Suite-Container und den pfaderhaltenden `redirectRegex` von `radio-admin.iuk-ue.de` auf `radio.iuk-ue.de/admin` (Entscheidung 2). ⛔ **Die Zeile fuer den `redirectRegex` lebt auf dem SERVER, nicht im Repo** | **Spec 2 (Runbook)**, `docs/runbooks/radio-cutover.md`; ausloesen darf ihn nur der **Betreiber** |
| **6.7-Abschnitt E — der Abbau** | Alt-Kiosk und Alt-Verwaltung abstellen, `RADIO_ADMIN_*` aus der Compose-Datei **entfernen** (⛔ nicht auskommentieren), Alt-Volumes **2 Wochen** im Standby. ⛔ **D und E sind zwei getrennte Runbook-Schritte mit mindestens zwei Wochen dazwischen** — „Der Rueckweg ist ‚Router zurueck', und er ist nur bis E moeglich" | **Spec 2 (Runbook)** |
| **Das Loeschen der sechs `/v1`-Routen im Alt-Repo** | Entscheidung **E-V3**: sie fallen mit D, nicht hier. Bis dahin spricht der Alt-Kiosk unveraendert gegen sie | **Spec 2**, mit E |
| **`radioBootFehler()` und die SECHSTE Boot-Pruefung** (fuer `SUITE_UPDATER_GROUP_RADIO`) | C.6/B4 nennt sie als faelligen Preis der zweiten Stufe; B8 (`Spec:97`) legt `radioBootFehler` nach Kapitel 7 §7.3. `_lib/boot.ts` fuehrt heute nur `retentionGrenze` und `raeumeLeihhistorie` | ⛔ **Planteil 5** — siehe „Nahtstellen" |
| **Der Retention-TAKT** (`starteRadioHintergrund`) | Planteil 1 hat die **Rechnung** gebaut, nicht den Takt (B5, `Spec:94`) | **Planteil 5** |
| **`sw.js/route.ts`** und `HANDLER_ANZAHL` 4 → 5 | Der vierte Handler mit der vierten Riegelform (`hostAbweisung`), B13 | **Planteil 5**, Fahrplan `riegel.test.ts:81-95` |
| **Die Release-Notizen** (mindestens drei bemerkbare Aenderungen: „Die Verwaltung liegt jetzt unter derselben Adresse wie die Ausleihe" · das Wegfallen des Reiters „API-Zugriff" · die neue Flaeche „Änderungen anzeigen") | ⛔ **`datum` ist der Tag des ROLLOUTS, nicht des Commits** (`CLAUDE.md`, Release Notes). Der Rollout ist 6.7-D | ⬜ **V-L10** — **Planteil 5 oder das Runbook**, mit dem Betreiber-Datum. ⚠️ **Und `showInSwitcher` im `radio`-Registry-Eintrag entscheidet mit, WER sie ueberhaupt sieht** (Analyse Pflicht 25) |
| ~~**Der zweite `baseURL`**~~ | ⛔ **GESTRICHEN — der Fall braucht ihn nicht.** Gemessen: `e2e/lagerbuch-hosts.spec.ts:151-152` faehrt genau diese Zusicherung heute mit **einem** `baseURL` ueber eine absolute URL (`e2e/helpers/lagerbuch.ts:28`, `:89`, `:94`). ⛔ **Fall 8 wird ein gruener Fall in V23**, kein `test.skip` | ⛔ **entfaellt** — dieser Planteil loest ihn ein |
| **Das Entfernen des Suite-Admin-Kurzschlusses** | ⛔ Eigener Plan, eigene Abnahme. `radio` erreicht dasselbe Ziel modulintern und ist **technisch nicht blockiert** | `docs/superpowers/plans/2026-08-24-suite-admin-kurzschluss.md`, Wegwahl ueber ⬜ K-L6 (**Betreiber**) |
| **Die zwei echten Gruppennamen** | Nur der Betreiber kennt sie; `admin`/`personal` sind Vorgabewerte in `radio-admin/server/src/config.ts:28-29`, und die Produktion kann beide ueberschreiben | ⬜ **V-L1 / V-L2** (= E1b / E1) — **Betreiber, vor Cut 26**, ⛔ **nicht vor der Generalprobe** |
| **`TZ=Europe/Berlin`** und **das suiteweite Gating von `/m/*`** | `Spec:4922-4925`: ausdruecklich nicht Teil dieses Kapitels | eigene Suite-Posten |
| **Der Paritaetscheck und die Stichproben** | ⛔ **Und die Auflage daran ist scharf:** `api_tokens` darf **nicht** hinein — die Abfrage scheitert dort mit `no such table`, also mit einem **Abbruch mitten im Cutover**. Aus sechs Sollwerten werden **fuenf**: `devices`, `software_versions`, `users`, `device_events`, `loans` | **Spec 2 (Runbook)** |
| **Ein `_lib/quelltextScan.ts` fuer ALLE VIER Scans** | ⛔ **Zwei davon stellt V11 um** (`riegel.test.ts` und `admin/actions.test.ts`, E-V13 — die Datei entsteht dort). `_lib/bauform.test.ts` und `_actions/guards.test.ts` fuehren weiter je eine **eigene, bereits reparierte** Kopie (`6331e77`, `4ed3410`); sie umzustellen ist ein Aufraeumposten, kein Bauwert dieses Fensters | ⬜ **V-L9** — ClickUp-Board |

---

## Nahtstellen zu Planteil 5

| # | Nahtstelle | ⛔ Auflage |
|---|---|---|
| **NS-V1** | ⛔ **`HANDLER_ANZAHL` steht nach V22 auf `4`, mit `toBe`** (V18 `import/hochladen`, V22 `geraete/export` — E-V16). | Planteil 5 baut `sw.js/route.ts` → ⛔ **`HANDLER_ANZAHL = 5`**, in **derselben** Aufgabe wie den Handler. ⛔ **Und er nimmt die VIERTE Riegelform** — `hostAbweisung` aus `_lib/hostRiegel.ts` (B13, `Spec:102`), nicht `radioHostOderNull`. Klausel (c) laesst beide zu; **`routen.test.ts` fuehrt `/sw.js` bereits mit** |
| **NS-V2** | ⛔ **`ADMIN_SEITEN_ANZAHL` steht nach V21 auf `10`, und der Anhebe-Fahrplan im Kopf von `riegel.test.ts` ist ABGEARBEITET.** | ⛔ **Die naechste Anhebung braucht einen NEUEN Fahrplan-Eintrag, nicht eine stille Zahl.** Dieselbe Form, die `AUSLEIH_FLAECHEN_ANZAHL` nach Planteil 3 bekommen hat (`riegel.test.ts:126-130`) |
| **NS-V3** | ⛔ **`AUSLEIH_FLAECHEN_ANZAHL` steht unveraendert auf `5`, Klausel (f) steht.** | Planteil 4 hat **keine** Flaeche ausserhalb `admin/` angelegt. Legt Planteil 5 eine an, hebt er die Zahl — ⛔ **im selben Commit.** |
| **NS-V4** | ⛔ **`_lib/zugang.ts` fuehrt `SUITE_UPDATER_GROUP_RADIO` (`:226`), und `radioBootFehler()` gibt es nicht.** ⚠️ Berichtigt durch die Schlusspruefung Planteil 4 (F2, 2026-08-26): die Zusage stand vorher faelschlich auf `_lib/rollen.ts` — dort erscheint der Name nur als Verneinung (`rollen.ts:11`). | ⛔ **Planteil 5 baut die SECHSTE Boot-Pruefung** (C.6/B4): ein **gesetzter, aber leerer** Wert ist eine gueltige Aussage („niemand ist Updater") und **darf nicht abbrechen**; ein **Tippfehler** ist von aussen nicht unterscheidbar. ⛔ **Deshalb prueft der Boot-Helfer NICHT den Inhalt, sondern meldet den Zustand LAUT beim Start** — dieselbe Richtung wie Falle 23s zweite Haelfte („die zweite ist still und wird von keiner Pruefung gemeldet"). ⬜ **V-L1** bleibt davon unberuehrt |
| **NS-V5** | ⛔ **`admin/actions.test.ts` fuehrt `ACTION_ANZAHL = 9`, `toBe`, und die vier namentlichen Seiten-Zusicherungen.** | ⛔ **Eine elfte Verwaltungs-Action hebt die Zahl bewusst.** ⛔ **Und eine fuenfte `requireRadioAdmin`-Seite bricht Fall 10 (`toBe(4)`)** — das ist gewollt: sie waere eine Rechteverschiebung und keine Zeile im Diff. ⚠️ Berichtigt durch die Schlusspruefung Planteil 4 (F3, 2026-08-26): V-L5 hat `/admin/import` auf ADMIN gehoben, der gebaute und gemessene Stand fuehrt **vier** Verwaltungsseiten auf `requireRadioAdmin`, nicht drei (`admin/actions.test.ts:687`, `:745` `.toBe(4)`) |
| **NS-V6** | ⛔ **Die dreiteilige Reparatur des Kommentarschnitts wird ab jetzt aus EINER Quelle bezogen** (E-V13). | ⛔ **Wer einen FUENFTEN Scan anlegt, importiert sie — er kopiert sie nicht.** Und er bringt seinen eigenen Selbsttest mit (Vorbild `riegel.test.ts:1157`) |
| **NS-V7** | ⛔ **⬜ V-L3 ist in V23 abgelesen und steht im Kopfkommentar von `riegel.test.ts`.** | ⛔ **Ist Probe E negativ (das Layout traegt NICHT), haengt der Verwaltungsriegel an zehn einzelnen Seitenzeilen** — dann ist die Klausel (e) der einzige Waechter, und **Planteil 5 darf sie unter keinen Umstaenden aufweichen** |
| **NS-V8** | ⛔ **`_ui/ikonen.tsx` ist um die Verwaltungszeichen gewachsen, `NavIkonName` um drei.** | ⛔ **Kein zweites Ikonenmodul** (NS-A8b), ⛔ **kein Zeichenpaket-Import ohne `"use client"`** (Falle 7), ⛔ **`src/core/shell/types.ts` bleibt frei von jedem Zeichen-Wert** (`types.ts:8-13`) |
| **NS-V9** | ⛔ **6.7-Abschnitt C ist geschlossen; D ist MOEGLICH, nicht faellig.** | Planteil 5 und Spec 2 entscheiden **nicht**, wann D laeuft — ⛔ **das ist eine Betreiberentscheidung**, und sie verlangt beide Domains im selben Fenster |
| **NS-V10** | ⛔ **`e2e/radio-verwaltung.spec.ts` fuehrt Fall 8 als GRUENEN Fall**, ueber `page.request.get(fremdUrl("/m/radio/admin"))` gegen `FREMDER_HOST`, **nach** einer Anmeldung MIT der `radio`-Gruppe (sonst misst er den Gruppenriegel statt des Hostriegels). ⬜ V-L4 ist gestrichen. | ⛔ **Er wird nicht in ein `test.skip` zurueckgebaut, und er wird nicht auf einen relativen Aufruf umgestellt** — ein Fall gegen `portal.localtest.me` beweist nichts. ⛔ **Und `e2e/helpers/radio.ts` ist die EINE Quelle der Hostnamen** — kein zweiter Satz Konstanten in der Spec-Datei |

---

## Zusagen dieses Planteils an die anderen

**An Planteil 3 (rueckwirkend, als Einhaltung):**

* ⛔ **NS-A1 eingehalten:** `leihhistorie` steht in **derselben** Datei `_db/leihen.ts`, es gibt
  keine zweite.
* ⛔ **NS-A2 eingehalten:** `HANDLER_ANZAHL` auf **4**, `toBe` (⛔ **vier, nicht drei** — E-V16 macht
  den Dateischritt des Imports zum zweiten neuen Handler); **beide** riegeln nicht-werfend und bauen
  ihre **404** selbst — nie 403, nie `requireRadioAdmin`.
* ⛔ **NS-A3 eingehalten:** `ADMIN_SEITEN_ANZAHL` auf **10**, in zehn bewussten Schritten.
* ⛔ **NS-A4 eingehalten:** **keine** Flaeche ausserhalb `admin/`; `AUSLEIH_FLAECHEN_ANZAHL` bleibt
  **5**.
* ⛔ **NS-A5 eingehalten:** `_actions/guards.test.ts` unveraendert — `ACTION_DATEIEN_ANZAHL = 4`,
  `ACTION_DEKLARATIONEN_ANZAHL = 9`, **drei** Ausnahmen. ⛔ **Keine vierte.**
* ⛔ **NS-A6 eingehalten:** `/admin/zugaenge` ruft `erstelleCode` und `setzeCodeAktiv`; ⛔ **es gibt
  keine Loeschfunktion und es wurde keine gebaut.**
* ⛔ **NS-A7 eingehalten:** `requireRadioVerwaltung` schuldet Klausel (d) dieselben
  Koerper-Zusicherungen — sie sind auf den gemeinsamen Helfer `riegelAufStufe` umgezogen (E-V1),
  nicht geloescht und nicht aufgeweicht.
* ⛔ **NS-A8/NS-A8b eingehalten:** `_lib/nav.ts` ist `radioNav(stufe)`, **Datei UND Aufrufstelle**;
  die Verwaltung benutzt `_lib/status.ts`, `_lib/filter.ts` und `_ui/ikonen.tsx` mit und definiert
  ⛔ **keinen zweiten Hexsatz und kein zweites Ikonenmodul.**
* ⛔ **NS-A9 eingehalten:** der `/admin`-Link auf der Ausleiheflaeche haengt weiter am **Praedikat**
  `istRadioAdmin`, nicht am Riegel und nicht an der neuen Verwaltungsstufe.
* ⛔ **NS-A10 eingeloest:** ⬜ A-L9/Z-L1 ist in **V23** abgelesen.

**An Planteil 2 (rueckwirkend):** NS-Z7 (`merkeNutzer` **nach** dem Riegel), NS-Z8
(`requireRadioVerwaltung` + `istRadioUpdater` als **zweite Funktion**, vier Seiten bleiben auf
`requireRadioAdmin` — ⚠️ berichtigt durch die Schlusspruefung Planteil 4, F3, 2026-08-26: vormals
„drei", der gebaute Stand fuehrt vier), NS-Z9 (`radioNav(stufe)`, beide Haelften) und NS-Z10 (der
Export-Handler nicht-werfend) sind eingeloest.

**An Kapitel 4 / das Datenmodell:**

* ⛔ **Die vier `quelle`-Werte sind abschliessend**, und §5.8 listet vollstaendig, welche Action
  welchen setzt: `geraetAnlegenAction → create`, `geraetAendernAction → manual`,
  `notizAnfuegenAction → update-note`, `importSchreibenAction → csv-import`. ⛔ **Ein fuenfter Wert
  ist ein Datenmodellbruch** — und die DB faengt ihn nicht (`_db/schema.ts:135-137`).
* ⛔ **`GeraetZeile` fuehrt genau die zwanzig Felder aus `Spec:4542-4553`** — keine Audit-, keine
  weitere Spalte.
* ⬜ **V-L6 (Loeschen bei aktiver Leihe) ist mit einer Vorbelegung entschieden, nicht offen
  gelassen** — und die Vorbelegung ist eine **benannte Abweichung** vom Bestand, im Quelltext an
  der Ablehnung.

**An Spec 2 / das Runbook:**

* ⛔ **`RADIO_ADMIN_*` wird beim Abstellen des Alt-Kiosks aus der Compose-Datei ENTFERNT, nicht
  auskommentiert.**
* ⛔ **`api_tokens` kommt NICHT in den Paritaetscheck.** Fuenf Sollwerte, nicht sechs. Die
  Zeilenzahl der Quelltabelle wird **protokolliert**, nicht verglichen.
* ⛔ **Die zwei Gruppennamen sind vor dem Umschwenk zu erfragen** und als
  `SUITE_ADMIN_GROUP_RADIO`/`SUITE_UPDATER_GROUP_RADIO` zu setzen (⬜ V-L1, V-L2).
* ⛔ **D und E sind zwei getrennte Schritte mit mindestens zwei Wochen dazwischen.**
* Der pfaderhaltende Traefik-Redirect ist eine **Runbook-Zeile, kein Repo-Artefakt**.

**An die Release-Notizen:** drei bemerkbare Aenderungen (⬜ V-L10), plus je eine Registerzeile.
⛔ **Geschrieben werden sie zum ROLLOUT, nicht zum Commit.**

**An jeden, der einen fuenften Quelltext-Scan anlegt:** ⛔ **die dreiteilige Reparatur wird
importiert, nicht kopiert** — `ohneKommentareUndZeichenketten` schneidet nicht mehr,
`ohneRegexLiterale` behandelt `//` als immer-Kommentarbeginn, **nur `bereinigt` schneidet, und
zuletzt.** Und er bringt seinen eigenen Selbsttest mit.

---

## ⛔ Was der Cutover ab hier kann, das er vorher nicht konnte

| Vorher (Ende Planteil 3) | Ab Ende Planteil 4 |
|---|---|
| **6.7-Abschnitt B war offen** — fuenf von sechs Ersatzfunktionen | ⛔ **B ist geschlossen.** Alle sechs stehen als Drizzle-Aufrufe **im selben Prozess**, in **einer** Datei, mit Tests |
| **6.7-Abschnitt C war offen** — die Ausleihe rief die internen Pfade, die Verwaltung existierte nicht | ⛔ **C ist geschlossen.** **Beide** Oberflaechen rufen ausschliesslich die internen Pfade. Der Abnahmebefehl **in seiner geschaerften Fassung** (s. „Die Abnahmebefehle fuer 6.7-Abschnitt C", Schritt 1) liefert nichts — die Spec-Fassung faengt seit dem 2026-08-27 fuenf **harmlose** `RADIO_ADMIN_GRUPPE`-Treffer mit; es gibt keinen Pfad unter `.../api/`, und `/admin/ausleihen` hat `leihhistorie` ihren Verbraucher gegeben |
| ⛔ **Der Router-Schwenk war NICHT MOEGLICH.** Ein Schwenk haette den Alt-Kiosk ohne Bestand gelassen oder die Verwaltung von ihrer Datenquelle getrennt — „Beides ist Datenverlust ohne Fehlermeldung" | ⛔ **D ist MOEGLICH.** Beide Domains koennen im **selben Fenster** umziehen, weil beide Flaechen auf demselben Datenbestand im selben Prozess stehen. ⚠️ **Moeglich, nicht faellig** — das Ausloesen ist eine Betreiberentscheidung |
| Es gab **keine Verwaltungsflaeche** — zwei Layouts ohne Seite darunter | ⛔ **Zehn Seiten, acht Inseln, ein Route Handler.** Alles, was `radio-admin` heute kann, liegt unter `radio.iuk-ue.de/admin` |
| ⛔ **Der Verwaltungsriegel war UNBEWIESEN.** Nur der Quelltext-Scan lief; „ob das Layout einer Route-Group ohne Seite darunter ueberhaupt ausgefuehrt wird", war ⬜ Z-L1 | ⛔ **Abgelesen, in V23, an einem echten Abruf** — mit Datum und Messwert im Kopfkommentar von `riegel.test.ts`. ⚠️ **Und wenn die Antwort „das Layout traegt nicht" lautet, ist das ein FUND** und keine Fussnote |
| **Es gab nur EINE Rechtestufe.** Betreiberentscheidung C.6/B4 war gefallen, aber nicht gebaut — das `(arbeit)`-Layout sperrte jede Updater-Person mit 404, **still gruen** | ⛔ **Zwei Stufen, echt gebaut.** Updater pflegen Geraetestaende, Admins verwalten. Der Feldriegel verwirft still, wie im Bestand. ⛔ **Und die zwei Seiten, die kein Scan schuetzen kann, haben eine eigene namentliche Zusicherung** |
| ⛔ **Die zehn Verwaltungs-Actions hatten keinen Waechter** — `_actions/guards.test.ts` sieht `admin/` nicht | ⛔ **`admin/actions.test.ts` ist gebaut**, mit der dreiteiligen Reparatur des Kommentarschnitts und einem Selbsttest darueber |
| ⬜ **E1b war nicht einmal fragbar** — es gab keinen Traeger fuer eine zweite Gruppe | ⛔ **Fragbar.** `SUITE_UPDATER_GROUP_RADIO` existiert in `.env.example`, `_lib/rollen.ts` liest sie, und ein leerer Wert **schliesst** die Stufe |
| Der Alt-Kiosk und die Alt-Verwaltung waren **unantastbar**, weil ihr Ersatz fehlte | ⛔ **Sie sind weiterhin unantastbar — aber jetzt aus einem anderen Grund:** nicht, weil der Ersatz fehlt, sondern weil **D noch nicht gelaufen ist.** Der Unterschied ist der ganze Weg |

⛔ **Und was der Cutover ab hier NICHT kann und nie konnte:** eine der beiden Domains allein
schwenken. „radio-admin ist Master fuer Geraete **und** Leihen, und radio-inventar schreibt
ausschliesslich dorthin. Wer nur eine der beiden Domains schwenkt, **trennt Master und
Schreiber**." Deshalb ist die Auflage nicht „erst B, dann D", sondern **„D ist ein einziger Schnitt
fuer beide Domains"**.

---

## Leerstellenverzeichnis

| ⬜ | Frage | Adressat | Faellig |
|---|---|---|---|
| **V-L1** | Der echte Wert von `SUITE_UPDATER_GROUP_RADIO` (= E1b) | **Betreiber** | Cut 26, ⛔ nicht vor der Generalprobe |
| **V-L2** | Der echte Wert von `SUITE_ADMIN_GROUP_RADIO` (= E1) | **Betreiber** | Cut 26, ⛔ nicht vor der Generalprobe |
| **V-L3** | Greift der Verwaltungs-Riegel bei einem echten Abruf? Traegt das Group-Layout? (Erbe Z-L1/A-L9) | ⛔ **Planteil 4 selbst** | **V23** |
| ~~**V-L4**~~ | ~~Woher kommt der zweite `baseURL` fuer den Fremd-Host-Fall?~~ ⛔ **GESTRICHEN, durch Messung widerlegt** — der Fall braucht keinen zweiten `baseURL` (`e2e/lagerbuch-hosts.spec.ts:151-152`, `e2e/helpers/lagerbuch.ts:28`/`:89`/`:94`) und wird in **V23 gruen** | ⛔ **entfaellt** | ⛔ **eingeloest von diesem Planteil** |
| **V-L11** | Soll die Verwaltungs-Ausleihenliste nach **Geraet** oder **Zeitraum** filtern koennen? ⚠️ **Keine belegte Spec-Zusage** — der frueher angefuehrte Anker `Spec:4084` traegt sie nicht (gemessen) | **Betreiber** | vor dem Rollout; der Bau **reicht die Filter durch und zeigt kein Bedienelement** |
| **V-L12** | Traegt `importSchreibenAction` als Server Action die Rohzeilen einer Produktions-CSV unter **1 MB**? (Nur der Dateischritt ist gemessen — E-V16) | **Generalprobe** (mit V-L8) | vor dem Cutover; der Bau **laesst sie Server Action** |
| **V-L5** | Traegt `/admin/import` die Verwaltungs- oder die Admin-Stufe? | **Betreiber** (die Spec widerspricht sich) | vor dem Rollout; der Bau folgt §5.4 |
| **V-L6** | Wird das Loeschen bei aktiver Leihe abgelehnt? | **Betreiber / Kapitel 4** | vor dem Rollout; der Bau **lehnt ab** |
| **V-L7** | Traegt die Ereignisgrenze 200 ohne Blaetterung? | **Generalprobe** | vor dem Cutover |
| **V-L8** | Wie viele Geraete und Ereigniszeilen fuehrt die Produktion? | **Generalprobe** | vor dem Cutover |
| **V-L9** | Werden die zwei Actions-Scans spaeter einer? | ClickUp-Board | ⛔ kein Bauwert in diesem Fenster |
| **V-L10** | Das `datum` der drei Release-Notizen | **Betreiber / Runbook** | 6.7-D |

---

## Selbstpruefung gegen den Auftrag

| Auflage | Wo sie eingeloest ist |
|---|---|
| 1 — die HTTP-Grenze und die Reihenfolge | Kapitel „Architecture" (die 6.7-Tabelle), Entscheidung **E-V3**, 1:1-Tafel Abschnitt A (je Route: wann sie faellt, was bis dahin von ihr abhaengt), „Was der Cutover ab hier kann" |
| 2 — zwei Rechtestufen und die Waechter-Luecke | Kapitel „Die Rechtestufe je Seite" (Tabelle je Seite mit Spec-Beleg + die vier namentlichen Zusicherungen), Entscheidung **E-V1**, Aufgaben **V19**, **V20**, **V21** mit den Wirkproben S-V19a/S-V20a/S-V21a |
| 3 — 1:1 bei Filtern und Feldgrenzen | Kapitel „Die 1:1-Tafel" (A: die sechs Routen · B: acht Masken · C: die Schreibwege · D: `revalidatePath` · E: die woertlichen Texte), durchgehend mit `datei:zeile` gemessen — inklusive der Faelle, in denen die 1:1-Antwort **„keine"** ist |
| 4 — Falle 9 und die Client-Inseln | Kapitel „Die acht Client-Inseln" (je Insel: warum Client, Props-Grenze, beruehrte Fallen), Entscheidungen **E-V5**, **E-V6**, die antd-Zuordnung, Sonde **S-V23a** |
| 5 — 6.3, was still mitverschwaende | Kapitel „6.3 — kein Posten ohne Eigentuemer", drei Teile, **jede** Zeile mit Eigentuemer |
| 6 — der Suite-Admin-Kurzschluss | Eigenes Kapitel, mit dem K2-Beleg „Planteil 4 ist technisch nicht blockiert" und der Abhaengigkeitstabelle. ⛔ **Nicht gebaut.** |
| 7 — die dreiteilige Reparatur | Entscheidung **E-V13**, Kapitel „Der vierte Quelltext-Scan", Aufgabe **V11** mit Sonde **S-V11e** |
| Eiserne Regel | Zehn benannte Leerstellen mit Adressat und Frist; jede zusaetzlich als Belegzeile im Quelltext (Punkt 10 der „Zwoelf Dinge"). ⛔ **Behauptungen der Eingabedokumente, gemessen widerlegt**: `SUITE_UPDATER_GROUP_RADIO` in `.env.example` (V7 der Vorbedingungen) · die „acht Vorschlagsfelder" (neun, V6) · die „drei Importklassen" (fuenf, V9) · ⛔ **die „19 `Form.Item`" (21 gerenderte, 20 benannte, V14)** · ⛔ **die „sechs Admin-Actions / vier uebrigen" (`Spec:4655-4664` fuehrt acht und zwei; mit E-V16 sieben und zwei, V11)** · ⛔ **„ein zweiter `baseURL` ist noetig" (`Spec:4889-4891`, widerlegt an `e2e/lagerbuch-hosts.spec.ts:151-152`, ⬜ V-L4 gestrichen)** · ⛔ **„der Import aus `riegel.test.ts` ist der erste Weg" (`riegel.test.ts:272-274` hatte ihn ausgeschlossen; die Sonde zeigt eine doppelte Suitenregistrierung, E-V13)** |
