# Modul `lagerbuch` — Portierungsanalyse & offene Entscheidungen

**Stand 2026-08-03. Das ist noch keine Spec.** Es ist die Vorarbeit dafür: was `lagerbuch` heute tut,
was der Cutover erzwingt, welche Fallen kein Gate findet — und die **siebenunddreißig Entscheidungen**,
die vor der Spec fallen müssen. Zwanzig davon blockieren sie.

**Kennzahlen dieses Dokuments:** 37 Entscheidungen (20 blockierend) · 28 1:1-Pflichten · 66 Fallen,
die kein Gate findet · 47 Betreiberfragen (8 blockierend) · 35 widerlegte Rohbefunde.

Gegenstand ist Phase 5 der Konsolidierung (`KONSOLIDIERUNG-PROGRESS.md`, Abschnitt „Phase 5 — Modul
`lagerbuch`"). Es ist das erste Modul, dessen Portierung **kein Umzug** ist: die Suite hat Tailwind 4,
`lucide-react`, `@base-ui/react`, `sonner` und `next-themes` entfernt (Entscheidungs-Log 2026-07-23),
lagerbuch führt sie. Der Oberflächen-Neubau in Ant Design 6 ist damit gesetzt — dieses Dokument
beantwortet nur noch, **was genau er kostet und wo er fachlich weh tut**.

Quelle: **sechs** unabhängige Analysedimensionen (Fachlichkeit · Auth · Etiketten/Artefakte ·
Oberfläche · Stack · Betrieb — Stack und Betrieb liefen getrennt), jede mit einer adversarischen
Gegenprüfung, danach Vollständigkeitskritik, neun Nacharbeits-Bausteine und eine Re-Kritik. Widerlegte Rohbefunde stehen in
Abschnitt 8, damit sie beim nächsten Durchgang nicht erneut „gefunden" werden.

---

## Belegbasis — der Freeze gilt ab `ca04eb1`, nicht ab `2361f40`

`KONSOLIDIERUNG-PROGRESS.md` (Phase 5) und der Analyseauftrag nennen `main @ 2361f40` (28.07.2026) als
eingefrorenen Stand. Der Arbeitsbaum steht auf **`ca04eb1`**, sieben Commits weiter (vier davon ohne
Merges). **Der Betreiber hat den Freeze am 03.08.2026 zugesagt; der eingefrorene Stand ist damit
`ca04eb1`** — der HEAD an diesem Tag. **Jeder Beleg in diesem Dokument ist an `ca04eb1` verankert**,
und das ist jetzt nicht nur die Arbeitsgrundlage, sondern der Gegenstand der Portierung.

Vier Inhalts-Commits liegen dazwischen, und alle vier sind fachlich relevant:

| Commit | Wirkung |
|---|---|
| `06a04f6` (28.07.) | „Verfall beim Fahrzeug-Check in den Zähl-Schritt holen" — `src/app/helfer/check/CheckFlow.tsx` +66/−98 (529 → 495 Zeilen); führt `.verfallfeld .input{font-size:13px}` in `globals.css:110-113` ein |
| `dfdaa9e` (29.07.) | „Login der Verwaltung landet wieder in der Verwaltung" — `verwaltungCordonDecision` und `adminLandingPfad` in `src/lib/auth/cordon.ts` (+49), `src/middleware.ts` (+13), `authjs.callback-url`-Cookie mit eigener `maxAge` in `src/auth.config.ts` |
| `f2b515b` (29.07.) | „Journal zeigt wieder Klarnamen statt roher User-IDs" — neu: `src/lib/auth/konto.ts`; `src/auth.ts` schreibt `users.id` jetzt aus `profile.sub` statt aus `user.id` |
| `8f4b3ee` (29.07.) | App-Icons: neu `src/app/favicon.ico`, `src/app/icon.svg`, `src/app/apple-icon.png`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png` |

Alle vier gehören damit zum Umfang. Belege, die es an `2361f40` **noch nicht** gab und die deshalb
mit dem späteren Stand hereinkommen: sämtliche Zeilen aus `src/lib/auth/cordon.ts` zu
`verwaltungCordonDecision`/`adminLandingPfad` · `src/lib/auth/konto.ts` · die drei
Dateikonventions-Icons und die drei PNGs · alle Zeilennummern in `CheckFlow.tsx` · der dritte Test in
`e2e/verwaltung.spec.ts`.

**Die Kopplung, die daran hing, ist damit aufgelöst:** der Waisenzeilen-Befund in `users`
(Abschnitt 5, Falle 22) ist am Stand `2361f40` verifiziert — und `f2b515b` behebt ihn. Weil der
Freeze ab `ca04eb1` gilt, ist der **Code-Defekt erledigt**; als Portierungsposten bleibt allein die
**Altdatenbereinigung** der bis dahin entstandenen Waisenzeilen in der produktiven `users`-Tabelle
(Entscheidung 27, Teil ii). Der Kopf von Falle 22 — der fehlende `events`-Block in der Suite und
damit der neue Ort für den Upsert — ist davon **unberührt** und bleibt offen.

**Zwei Zahlen aus dem Auftrag, die nachgezählt abweichen:** `src/db/schema.ts` deklariert **16**
Tabellen, nicht 17 (`grep -n "sqliteTable(" src/db/schema.ts`: lagerorte, fahrzeug_templates,
template_positionen, artikel, chargen, lagerort_verfall, buchungen, soll_positionen, tokens, checks,
users, bz_geraete, bz_kontrollen, o2_flaschen, o2_messungen, geraete). Die Angaben „192 Dateien /
~13.850 Zeilen" stimmen exakt (`find src -name "*.ts" -o -name "*.tsx"` = 192, `wc -l` = 13.854).

---

## 1. Was das Modul `lagerbuch` ersetzt

`lagerbuch` ist die Materialverwaltung einer DRK-Bereitschaft. Es führt den Bestand des Handlagers und
den Bestand jedes Fahrzeugs, und zwar **nie als Spalte, sondern immer als Summe eines append-only
Buchungsjournals** (`implementierungsplan.md:87`, `src/db/queries.ts:40-41`). Daran hängen fünf
Fachbereiche:

| Bereich | Was es tut |
|---|---|
| **Bestand & Chargen** | Zugang/Entnahme/Korrektur/Umlagerung, Chargen mit monatsgenauem Verfall, FEFO-Entnahme, Verfall-Ampel, Aussondern |
| **Fahrzeug-Check** | Ist-Erfassung gegen `soll_positionen`, Nachfüllung aus dem Handlager, Korrekturbuchung auf den Fahrzeugbestand, Geräte- und Sauerstoff-Quittierung, Verfallsmeldung je Fahrzeug |
| **Geräte** | Gerätestamm mit MTK-/Ablauf-Fälligkeit, Barcode-Deep-Link `/g/<code>`, Kamera-Scan |
| **Blutzucker & Sauerstoff** | BZ-Geräte mit Kontrollmessungen und eingefrorenem Referenz-Snapshot, O₂-Flaschen mit Fülldruckmessungen |
| **Betrieb** | Bestellvorschlag, Inventur, CSV-Import, Excel-Export, Journal mit Klarnamen, Etikettendruck, Zugangs-Codes |

**Zwei Zugangswege, und das ist das einzig strukturell Neue an dieser Phase.** Helferinnen und Helfer
kommen ohne Konto herein: sie scannen einen laminierten QR-Code (`/t/<code>`) oder tippen den
sechsstelligen Code am Gate ein; daraus entsteht eine eigene, mit `jose` signierte Sitzung im Cookie
`helfer_session` (`src/lib/auth/helferSession.ts:10-16`, Vorgabe 12 h). Die Verwaltung meldet sich per
OIDC gegen Pocket ID an (`src/auth.config.ts:86-103`). Beide Wege werden heute von **einer eigenen
`src/middleware.ts`** in zwei Edge-Cordons durchgesetzt (`src/middleware.ts:34-36`, Matcher
`/verwaltung/:path*`, `/helfer/:path*`, `/a/:path*`) — und genau die gibt es in der Suite nicht.

**Was `lagerbuch` mit den bereits portierten Modulen teilt:** eine SQLite-Datei, Drizzle, Auth.js gegen
Pocket ID, gedruckte QR-Codes im Feld. **Was neu ist:** eine zweite, anonyme Sitzung mit eigenem
Geheimnis; ein Journal, dessen Unveränderlichkeit per SQLite-Trigger erzwungen wird; ein
Etikettenbogen, dessen Richtigkeit man in Millimetern auf gekauftem Papier misst; und eine
Oberfläche, die als einzige der bisherigen Alt-Apps eine eigene, durchgestaltete Anmutung trägt.

---

## 2. Der Bestand

### 2.1 Datenmodell

16 Tabellen in `src/db/schema.ts`, sieben eingecheckte Drizzle-Migrationen (`drizzle/0000` … `0006`).
Das tragende Prinzip ist rekonstruktiv: `chargen` trägt **keine** Menge, jeder Bestand ist
`SUM(buchungen.menge)`, lagerort-gescoped (`src/db/bestand.ts:13-20`, `implementierungsplan.md:87/:198`).

**Die zentrale Invariante steht nicht im Schema, sondern in handgeschriebenem SQL.**
`drizzle/0001_append_only.sql:1-11` legt zwei BEFORE-Trigger auf `buchungen` an
(`buchungen_no_update`, `buchungen_no_delete`), die `UPDATE` und `DELETE` mit
`RAISE(ABORT, 'journal ist append-only')` abbrechen. `src/db/schema.ts:89-109` deklariert davon nichts —
Drizzle kennt für SQLite kein Trigger-Primitiv. Ein `grep -l TRIGGER drizzle/` liefert genau diese eine
Datei. Der einzige Wächter ist `src/db/append-only.test.ts:25-37`, und der greift nur, weil
`createTestDb()` die SQL-Migrationen **abspielt** statt das Schema zu pushen
(`src/db/testing.ts:6-11`, `src/db/index.ts:42-46` mit `MIGRATIONS_FOLDER = "./drizzle"`).

`bz_kontrollen` und `o2_messungen` tragen **keinen** Trigger; ihre Append-only-Zusage steht nur als
Kommentar im Code (`src/actions/sauerstoff.ts:51`, `src/actions/bz.ts:91`).

**Zeit ist in fünf Darstellungen im Modell.** Empirisch gegen `drizzle-orm` 0.45.2 /
`better-sqlite3` 12.11.1 verifiziert: `integer(..., {mode:"timestamp"})` speichert UNIX-**Sekunden** —
`new Date(1770000000789)` kommt als `1770000000000` zurück (`src/db/schema.ts:93` u. a. 13 Spalten).
Daneben: Monats-Strings `"YYYY-MM"` (`chargen.verfall` :61, `lagerort_verfall.verfall` :80,
`bz_kontrollen.kompresse_verfall` :206), Tages-Strings `"YYYY-MM-DD"` (`geraete.mtk_faellig` :268,
`geraete.ablaufdatum` :271), rohe Millisekunden-Arithmetik (`src/lib/domain/bz.ts:22`) und lokale
Zivildaten (`src/lib/domain/verfall.ts:10`, `src/lib/domain/geraet.ts:37`, `src/lib/format.ts:14/:25`,
`src/db/backup.ts:9/:42`).

**Drei Modell-Unsauberkeiten, die beim Schema-Übertrag bewusst zu entscheiden sind:**

1. `checks.quelleTyp` ist nacktes `text(...).notNull()` (`schema.ts:152`), während dieselbe Semantik in
   `buchungen` (:99), `lagerort_verfall` (:82), `bz_kontrollen` (:198) und `o2_messungen` (:241) ein Enum
   trägt. Einziger Produktions-Writer ist `src/actions/check.ts:164-165` mit dem Literal `"token"`.
2. `chargen` hat weder in `schema.ts:55-65` noch in `drizzle/0000_brief_zodiak.sql:32-40` einen
   Uniqü-Index über `(artikel_id, chargen_nr, verfall)`; `bucheZugang` legt bei „neue Charge"
   bedingungslos eine neue Zeile an (`src/actions/buchung.ts:25-28`). Dieselbe Chargennummer zweimal
   erfasst spaltet den Bestand in zwei FEFO-Töpfe mit identischem Verfall.
3. `checks.ergebnis` trägt **zwei** inkompatible JSON-Formate: Array = alt (ohne Positionsdetails),
   Objekt = neu mit `positionen`/`artikel`/`geraete`/`flaschen`/`verfall`. Beide Leser können beide
   (`src/db/queries.ts:366-381` mit Array-Zweig :368-372, Detail `:431-434` setzt `altFormat = true`).

### 2.2 Fachliche Regeln, die nur in Client-Code stehen

Zwei **entgegengesetzte** Absendekonventionen tragen den gesamten Buchungseffekt des Moduls, und beide
existieren ausschließlich in `"use client"`-Dateien ohne serverseitigen Gegenpart:

- **Der Fahrzeug-Check belegt jede Soll-Position mit `ist[p.id] ?? p.soll` vor**
  (`src/app/helfer/check/CheckFlow.tsx:97`, Absicht dokumentiert in `:94-96`: „voll annehmen,
  Gezähltes runterkorrigieren") und sendet beim Abschluss **alle** Positionen
  (`CheckFlow.tsx:146`). Serverseitig ist „gezählt und stimmt" von „nicht gezählt" damit nicht
  unterscheidbar: `src/actions/check.ts:106-110` ruft je Artikel `korrekturAufLagerort(istSumme)`,
  `src/db/korrektur.ts:20` rechnet `diff = ist − recorded` und schreibt bei `diff ≠ 0` eine
  `korrektur`-Buchung in ein Journal, das per Trigger weder `UPDATE` noch `DELETE` kennt.
- **Die Inventur macht das Gegenteil und begründet es:** `src/app/verwaltung/(admin)/inventur/InventurForm.tsx:21-25`
  sendet ausdrücklich nur die vom Nutzer angefassten Positionen, mit Lost-Update-Begründung im
  Kommentar; `src/actions/inventur.ts:28-31` verarbeitet nur diese.

**Wichtig für die Bewertung:** die Check-Konvention ist **kein latenter Defekt**, sondern eine
dokumentierte und testverankerte Invariante. `src/actions/check.test.ts:63-71` sendet `ist: 4` gegen
`soll: 4` und behauptet ausdrücklich `expect(bestandProLagerort(r, fz)).toBe(4)` mit dem Kommentar
„+4 Eröffnungs-Korrektur"; `e2e/geraete.spec.ts:59-61` klickt den Zähl-Schritt unberührt durch
(„Ist = Soll voreingestellt"). Ein Abbruch schreibt gar nichts — `abschluss()` läuft ausschließlich
aus den Abschluss-Knöpfen des jeweils letzten Schritts (`CheckFlow.tsx:361`, `:413`, `:484`). Was
tatsächlich fehlt: keine dieser Stellen prüft die dabei **entstandenen Buchungen**.

Dieselbe Klasse, drittes Beispiel: `ZUSTAENDE = ["In Ordnung", "Gebrauchsspuren", "Defekt"]` steht in
`CheckFlow.tsx:22` — einer Client-Datei. Der Server nimmt den Wert als freien String an
(`check.ts:35`, `z.string().trim().optional()`), speichert ihn roh in `checks.ergebnis`
(`schema.ts:156`) und wertet ihn an drei Stellen per Stringgleichheit aus: `check.ts:129`
(`!e.vorhanden || e.zustand === "Defekt"` → `geraeteAuffaellig`), `queries.ts:379` und `queries.ts:499`.

### 2.3 Warum `lagerort_verfall` existiert

Bei `diff > 0` wählt `korrekturAufLagerort` die **jüngste Charge des Artikels ohne jeden
Lagerortbezug** (`src/db/korrektur.ts:27-30`) und legt notfalls eine Dummy-Charge
`"Korrektur"` / `"2099-12"` an (`:32-33`). Der Fahrzeug-Check kann Fahrzeugbestand also auf eine
Charge buchen, die nie im Fahrzeug lag. **Genau deshalb gibt es die separate Tabelle
`lagerort_verfall`:** `schema.ts:67-73` begründet sie ausdrücklich damit, dass der Check-Abgleich
„die Charge nur schätzt" und für die Frage „wann läuft das Zeug im Fahrzeug ab?" nur zählt, was auf
der Packung steht. Wer das Verfall-Feld im Zähl-Schritt beim Neubau als redundant streicht („die
Charge hat doch einen Verfall"), zerstört diese Kompensation lautlos.

### 2.4 Zugänge

**Der Helfer-Token trägt keine Zugriffsgrenze.** `requireHelfer` (`src/actions/session.ts:22-28`)
prüft Cookie-Signatur und `tokens.aktiv` und gibt `{tokenId, code}` zurück — keinen Lagerort.
`checkAbschluss` (`check.ts:73`) nimmt danach jede beliebige `fahrzeugId` entgegen; die
Zugehörigkeitsprüfungen im Body betreffen Soll-Positionen (`:94`), Geräte (`:128`), Flaschen (`:139`)
und Verfälle (`:155`) **gegen dieses Fahrzeug**, nie das Fahrzeug gegen den Token. `/helfer/check`
listet ohnehin alle aktiven Fahrzeuge (`src/app/helfer/check/page.tsx:14`). Der Code aus „RTW 1" kann
also den Check von „RTW 2" abschließen — mit dessen eigenen Objekten.

Das Schemafeld `tokens.scopeLagerortId` (`schema.ts:136`, mit Kommentar „null = Handlager" und echtem
FK auf `lagerorte.id`) suggeriert das Gegenteil, wird aber **von keinem Produktionspfad geschrieben**:
`createToken` kennt es nicht (`src/actions/tokens.ts:44-49` schreibt `id, code, label, aktiv, createdAt,
createdBy, zielTyp, zielId`), `redeemToken` liest es nicht (`src/actions/token-redeem.ts:14-19`),
einziger Leser im ganzen `src/` ist der Löschzähler `src/actions/loeschen.ts:76`. Der
Implementierungsplan legt den Sitzungsinhalt auf `{tokenId, scopeLagerortId, exp}` fest
(`implementierungsplan.md:51`) — gebaut wurde `{tokenId, code, label}`
(`src/lib/auth/helferSession.ts:6`). Es ist ein nicht zurückgebauter Planrest.

**Das Sperren eines Tokens wirkt nur schreibend — und das ist die Spec, nicht ihr Bruch.**
`requireHelfer` mit DB-Recheck wird von genau zwei Stellen gerufen (`src/actions/buchung.ts:83`,
`src/actions/check.ts:73`); jeder lesende Pfad geht über `getHelferPayload`
(`src/actions/session.ts:14-18`), das nur Signatur und Ablauf prüft
(`src/app/helfer/layout.tsx:8`, `src/app/a/[artikelId]/page.tsx:12`, `src/app/g/[code]/page.tsx:23`).
`implementierungsplan.md` §6 formuliert das ausdrücklich: „Session enthält `tokenId`, der bei **jeder
schreibenden Aktion** gegen die DB geprüft wird — bewusst der eine DB-Lookup pro Buchung". Der Code
implementiert die Spezifikation wörtlich. Die Folge bleibt trotzdem eine Entscheidung: ein gesperrter
Code liest bis zu 12 h weiter den gesamten Bestand.

**`isAdmin` ist heute gleichbedeutend mit „hat überhaupt eine Sitzung".** Der `signIn`-Callback gibt
für jeden OIDC-Login ohne `OIDC_ADMIN_GROUP` `false` zurück (`src/auth.config.ts:90`, `:100`) und
für jeden anderen Provider ebenfalls (`:102`). Eine Sitzung entsteht also nur für Admins;
`session.user.isAdmin` ist danach immer `true` (`:106`, `:115`). `requireAdmin`
(`src/actions/session.ts:10`), das `(admin)`-Layout (`src/app/verwaltung/(admin)/layout.tsx:8`) und der
Cordon (`src/middleware.ts:16`) sind damit faktisch redundant zur Existenz der Sitzung.

Nachgezählt für die Portierungs-Checkliste: **16 Module unter `src/actions/` tragen `"use server"`
und exportieren 44 Actions; alle 44 rufen `requireAdmin` oder `requireHelfer`.** Die einzigen
ungeschützten Server Actions liegen **außerhalb** dieses Verzeichnisses:
`einloesenAmGate` (`src/app/(gate)/actions.ts:12`, muss öffentlich sein) und `beenden`
(`src/app/helfer/actions.ts:6`, löscht nur das eigene Cookie). `src/actions/session.ts` und
`src/actions/token-redeem.ts` tragen kein `"use server"` — es sind gewöhnliche Servermodule, keine
Actions.

**`/g/<code>` ist der vierte Zugangspfad und kommt schon heute ohne Cordon aus.** Der Matcher nennt
`/g` nicht (`src/middleware.ts:35`); die Rollenweiche steht vollständig in der Server Component
(`src/app/g/[code]/page.tsx:19-26`: `auth()` zuerst, dann `getHelferPayload`, sonst Gate mit
`returnTo`), und die DB-Abfragen laufen erst danach (`:28-32`). Das ist genau die Bauform, in die
`/verwaltung`, `/helfer` und `/a` beim Port ohnehin müssen — sie ist im Repo also erprobt, nicht neu.

### 2.5 Oberfläche

Nachgezählt am Arbeitsbaum: **84 `.tsx`-Dateien** tragen Markup (30 `page.tsx`, 3 `layout.tsx`, 38
routen-lokale Komponenten mit 3.371 Zeilen, 13 geteilte unter `src/components/` mit 1.142 Zeilen). 48
Dateien tragen `"use client"`, 36 sind Server Components. Darin **915 `className`-Attribute**, die
gegen rund 140 selbst definierte Klassen-Tokens in **einer** 21.160 Byte großen
`src/app/globals.css` (283 Zeilen) auflösen.

**Die dreizehn geteilten Komponenten nach Portierungskosten:**

| Klasse | Komponenten | Kosten |
|---|---|---|
| Reine Hülle | `HelferDetail.tsx` (10 Z.), `HelferFrame.tsx` (31), `SideNav.tsx` (43) | die letzten beiden werden durch die Suite-Shell ersetzt, nicht portiert |
| Direktes antd-Gegenstück = netto Löschung | `Combobox.tsx` (242 → `Select showSearch`), `LoeschDialog.tsx` (155 → `Modal`), `HelferListe.tsx` (31 → `List`), `LoeschButton.tsx` (73 → `Button`) | **501 Zeilen** entfallen |
| Nur die Hülle hat ein antd-Gegenstück | `Filterleiste.tsx` (138) | die Hülle (`:83-138`) ersetzt antd; `useUrlFilter` (`:27-36`), `toggleInSet` (`:15-20`) und `ZeitraumFelder` (`:39-75`) haben **keins** — siehe Abschnitt 2.7 |
| Teilweise | `Stepper.tsx` (70), `HelferEntnahme.tsx` (73) | `InputNumber` deckt den Normalfall, aber nicht die `noText`-Variante (`Stepper.tsx:19-21`: der Wert ist dort **bewusst** nicht tippbar, damit am Handy im Fahrzeug niemand versehentlich ins Zahlenfeld fällt; genutzt nur in `CheckFlow.tsx:295` und `:461`) |
| Ohne Gegenstück, Neuentwurf | `Plakette.tsx` (39, handgerechnetes SVG-Zifferblatt), `BarcodeScanner.tsx` (166, Kamera-Insel) | |
| Eigene Klasse | `Gate.tsx` (71) | fällt nach `docs/design/README.md:17-19` unter „öffentliche, login-freie Ansicht" — ohne antd neu geschrieben |

**Warum die Filterleisten-Einordnung korrigiert wurde.** Die Datei hat vier Wert-Exporte (dazu den
Typ `FilterChip`, `:7-12`), und nur einer davon ist Oberfläche: `Filterleiste` (`:83-138`) — die Hülle
aus Suchfeld, Chips und Trefferanzeige, sieben Aufrufer, alle mit antd-Gegenstücken. `useUrlFilter`
(`:27-36`) ist dagegen ein `next/navigation`-Belang, kein Bedienelement: er baut aus einem
`Record<string,string>` eine `URLSearchParams`, **lässt leere Werte weg** (`:32`) und schreibt per
`router.replace(…, { scroll: false })` (`:34`). `toggleInSet` (`:15-20`) ist eine generische
Mengenoperation, genutzt von `GeraeteListe.tsx:27` und `TokenTable.tsx:38`. Und `ZeitraumFelder`
(`:39-75`) sind zwei `<input type="date">` mit gegenseitiger Begrenzung (`:58` `max`, `:69` `min`) —
der Ersatz durch `RangePicker` ist **kein Tausch, sondern eine Bedeutungsänderung**: aus zwei
unabhängigen URL-Parametern (`von`, `bis`, einzeln setzbar, einzeln leer) wird ein Wertepaar, und aus
`"YYYY-MM-DD"`-Strings werden Dayjs-Objekte, die vor dem Schreiben in die URL und nach dem Lesen aus
ihr wieder umgesetzt werden müssen. Die Werte gehen roh über die Server-Grenze
(`journal/page.tsx:18-19,34`, `checks/page.tsx:21-22,33`). Die 138 Zeilen fallen also **nicht**
ersatzlos weg; was wirklich verschwindet, sind die 56 Zeilen der Hülle — der Rest wandert, und mit ihm
ein Vertrag, der bis in die Datenbankabfrage und in einen E2E-Test reicht (Abschnitt 2.7).

Bei den 38 routen-lokalen Komponenten liegt die Maße in vier Dateien: `CheckFlow.tsx` (495),
`ArtikelDrawer.tsx` (393), `ArtikelTable.tsx` (254), `GeraetForm.tsx` (150) — zusammen 38 % der Zeilen.
Billig sind die vier `*AktivToggle.tsx` (je 16 Z.) und die zwei `GeraetScanner.tsx` (je 13 Z.).

**Der Farbsatz ist bereits identisch.** `globals.css:4-15` und `iuk-suite/src/core/theme/tokens.ts:14-25`
führen dieselben zwölf Hexwerte unter denselben deutschen Namen (rot `#c8000f`, rot-dk `#a2000c`,
rot-bg `#fbe9eb`, tinte `#1a1d20`, stahl `#5b6570`, linie `#d9dde1`, papier `#eef0f1`, karte `#ffffff`,
gelb `#b26a00`, gelb-bg `#fbf1dc`, ok `#1e7a3c`, ok-bg `#e4f2e9`); `tokens.ts:3-4` nennt als Herkunft
ausdrücklich „den `@theme`-Block der abgelösten `globals.css`", und beide stammen aus demselben
Mockup. **Nicht** deckungsgleich ist die Bindung: die Suite bindet nur vier davon an antd-Tokens
(`theme.ts:22-25`), die übrigen acht — insbesondere `linie`, `papier`, `karte`, `stahl`, die
praktisch jede Fläche und jede Haarlinie tragen — haben antd-Entsprechungen mit **anderen** Werten.

**Rund 16 Zeilen `globals.css` sind toter Mockup-Rest** und dürfen nicht mitwandern (kein Vorkommen in
irgendeiner `.tsx`): `.root` (:43), `.strike` (:104), `.demochip` (:105), `.toast` (:106),
`.scanwrap`/`.scanframe`/`.scancorner`/`.sc-tl`…`.sc-br` (:151-157), `.scanhint` (:161),
`.sheetdim` (:168), `.sheet` (:169), `.sitem .cnt` (:186), `.vehchips` (:248). **Nicht** tot sind
`.scanline` (:158, gerendert in `BarcodeScanner.tsx:120`, trägt den `prefers-reduced-motion`-Zweig
:160) und `.sheettitle` (:170-171, drei Verwendungen) — das Sheet-Muster ist halb abgeräumt, nicht
ganz.

**Grenzen gibt es nicht — weder `error.tsx` noch `not-found.tsx` noch `loading.tsx`.** Nachgeprüft am
Stand `ca04eb1`: unter `src/app/` liegt **keine einzige** dieser vier Dateien (`error.tsx`,
`global-error.tsx`, `not-found.tsx`, `loading.tsx`). Der Baum hat 83 Einträge, darunter 30 `page.tsx`
und 3 `layout.tsx` — und null Grenzdateien.

**Wo lagerbuch heute an eine Grenze stößt** — drei Sorten, 18 Sprungstellen in Seiten und Layouts
plus 22 Meldungstexte aus Server Actions:

| Sorte | Zahl | Belege |
|---|---|---|
| `notFound()` | 8 | `g/[code]/page.tsx:33` · `verwaltung/(admin)/checks/[id]/page.tsx:13` · `.../vorlagen/[id]/page.tsx:15` · `.../sauerstoff/[id]/page.tsx:17` · `.../geraete/[id]/page.tsx:18` · `.../bz/[id]/kontrolle/page.tsx:19` · `.../fahrzeuge/[id]/page.tsx:23` · `.../bz/[id]/page.tsx:25` |
| `redirect()` aus Seite, Layout oder Action | 10 | `(gate)/page.tsx:17` · `(gate)/actions.ts:24` · `g/[code]/page.tsx:24,25` · `a/[artikelId]/page.tsx:18,19,23` · `verwaltung/(admin)/layout.tsx:8` · `helfer/layout.tsx:9` · `helfer/actions.ts:8` |
| deutschsprachige **Meldungstexte** in Würfen | 22 | 19 in `src/actions/*` (u. a. `session.ts:10,24,26`, `check.ts:94,128,139,155`, `aussondern.ts:26,28,37`, `buchung.ts:35,66`), 3 in `src/db/*` auf dem Weg durch eine Action (`barcode.ts:19,23`, `lagerort-verfall.ts:55`) |

Jeder dieser `notFound()`-Würfe landet heute in der eingebauten 404 von Next, gerahmt von
`layout.tsx:42` — einem nackten `<body>{children}</body>` mit den drei lagerbuch-Schriften und sonst
nichts. Es gibt keine gestaltete 404 des Moduls und keinen Weg zurück außer der Browser-Taste.

**Wer landet dort? Bei `/g/[code]` ausschließlich ein angemeldeter Verwaltender.** `page.tsx:21-26`
schickt jede Nicht-Admin-Anfrage vorher weg — mit Helfer-Sitzung nach `/helfer` (`:24`), ohne Sitzung
aufs Gate (`:25`); die `notFound()` in `:33` ist erst danach erreichbar. Das Gegenstück für die
Helferin ist gerade **kein** 404, sondern der wortlose `redirect("/helfer")` in
`a/[artikelId]/page.tsx:23` (Falle 27).

**Wie ein Action-Wurf beim Benutzer ankommt, ist im Modul zweigeteilt.** 34 Action-Aufrufe stehen in
einem `useTransition`, verteilt auf 23 Client-Komponenten; **12 sind von einem `catch` umschlossen**
und rendern `e.message` an Ort und Stelle (`InventurForm.tsx:26-31`, `CheckFlow.tsx:142-159`;
dieselbe Form auch außerhalb von Transitions, `ArtikelDrawer.tsx:68-77`). **22 sind es nicht** — sie
sind Gegenstand von Falle 62, und was von den Meldungstexten in Produktion ankommt, steht in
Falle 66.

**Still scheitert das Modul an genau einer Stelle — und zwar auf Grün.** `fefoAbbuchung`
(`db/abbuchung.ts:24-54`) wirft nie: `fefoVerteilung` (`lib/domain/fefo.ts:3-15`) filtert leere
Chargen weg und verteilt, was da ist. Steht nichts mehr da, ist `gebucht = 0`, die Action gibt
`{ gebucht: 0 }` zurück (`actions/buchung.ts:82-93`), und `HelferEntnahme.tsx:26-27` setzt daraus die
Meldung „Entnahme gebucht: 0 × <Artikel>" — angezeigt in `:55` als `chip chip-ok`, grün, mit
Häkchen-Zeichen. Die Client-Klemme `Math.min(menge, bestand)` (`:23`) deckt den Normalfall, nicht das
Rennen gegen eine parallele Entnahme. Wer diese Rückgabe in der Suite an eine antd-`message` oder ein
`Result` hängt, muss `gebucht === 0` ausdrücklich als Fehlfall führen, sonst wandert die grüne Null
mit.

**`loading.tsx` fehlt und fehlt zu Recht.** Weder lagerbuch noch die Suite hat eine einzige. Die
Einstiegsseiten sind durchweg `force-dynamic` (`g/[code]/page.tsx:8`, `(gate)/page.tsx:8`,
`a/[artikelId]/page.tsx:8`, `helfer/page.tsx:5`), jede Navigation wartet also in beiden Welten auf
denselben Server-Rundlauf.

**Die Zielseite hat kaum mehr.** Die Suite führt genau **eine** Grenzdatei, `src/app/not-found.tsx`,
und **keine einzige** `error.tsx`, `global-error.tsx` oder `loading.tsx` — auch nicht in einem der
vier Bestandsmodule. Die 404 liegt an der Wurzel und ist bewusst dort: ihr Kopfkommentar
(`not-found.tsx:7-14`) schreibt aus, dass damit „alle Modul-Layouts ersetzt" werden und „die Seite
ohne Shell und ohne Modulnavigation erscheint"; `not-found.test.tsx:85-90` sichert genau die Folge
daraus ab („Ohne Shell trägt der `body` die Vorgabefarbe des Browsers"). Weiter gelten nur die
Provider aus `layout.tsx:79-88` — Geist-Schriften, `data-theme`, `AntdProvider`. Ein Admin, der auf
dem lagerbuch-Host einen unbekannten Geräte-Barcode scannt, sieht nach dem Port also: Geist statt
Barlow, das Suite-Theme, einen antd-`Button` (`not-found.tsx:57`) und einen Absatz, der von „dieser
Suite" spricht und an „die Administration" verweist (`:41-46`) — auf einem Host, der heute nur die
Wortmarke „LAGERBUCH" zeigt, und ohne Modulnavigation, weil das Modul-Layout ersetzt ist. Der eine
Rückweg funktioniert immerhin: `href="/"` ist relativ und führt unter dem Host-Rewrite auf den
Modulanfang (`:48-56`).

**Ein Vorbild für modul-eigene Grenzen gibt es — es hat aber eine andere Form als eine Grenzdatei.**
Wo in der Suite ein Mensch mit einem gedruckten Gegenstand vor einem Bildschirm steht, ersetzen die
Bestandsmodule die Grenze durch einen **gestalteten Zustand in der Seite selbst**:
`m/files/(oeffentlich-inbox)/u/[token]/page.tsx:13-17` hält HTTP 200 in jedem Fall fest — „Kein
`notFound()`, kein `redirect()`, keine 401-Seite: der Melder steht mit einem gedruckten Zettel vor
einem Handy und hat sich vertippt — was er braucht, ist eine Korrekturaufforderung am Ort" — und
nennt das eine 1:1-Pflicht. `m/feedback/f/[slugSecret]/page.tsx:257-262` macht es genauso („Zustand F
statt `notFound()`: eine gestaltete Seite"). Die Suite-404 ist der Weg für die **andere** Klasse: für
Riegel, die absichtlich 404 statt 403 antworten (`core/auth/guards.ts:15-16`,
`files/_lib/access.ts:154-163`). Was daraus für lagerbuch folgt, steht in Entscheidung 36.

### 2.6 Betrieb

Ein Container, ein Volume, eine SQLite-Datei (`compose.yaml:24-25`, `/data/lagerbuch.db`). Das
Basis-Image ist Debian-basiert, `TZ` wird über `compose.yaml:7` gesetzt (`${TZ:-Europe/Berlin}`, auch
in `stack.env.example:8`). `next.config.ts:14` setzt `deploymentId` aus `NEXT_DEPLOYMENT_ID`, und das
Dockerfile reicht den Commit-SHA in **beide** Stages durch (`:10-11`, `:18-19`) — mit ausgeschriebener
Begründung, warum beide Werte gleich sein müssen.

**Die Kette hat aber drei Beine, nicht zwei.** Beide `ARG`-Zeilen im Dockerfile haben einen **leeren**
Default (`ARG NEXT_DEPLOYMENT_ID=""`); gefüllt wird der Wert an genau einer Stelle im ganzen Repo:
`.github/workflows/ci.yaml:87-88`

```yaml
build-args: |
  NEXT_DEPLOYMENT_ID=${{ github.sha }}
```

Ohne diese zwei Zeilen ist `deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined` beweisbar
wirkungslos: der leere String ist falsy, `|| undefined` greift, Next baut ohne `?dpl=`. Genau dieses
Verhalten beschreibt `next.config.ts:13` selbst als gewollt („Ohne die Variable (lokal, PR-Builds)
bleibt das Verhalten wie bisher") — es ist der Normalfall in jedem Build, den die CI nicht macht.
**Wer nur `next.config.ts` und das `Dockerfile` portiert, portiert eine Nulloperation.**

Dieselbe Datei trägt zwei weitere Betriebszusagen, die sonst belegfrei blieben: den Auslöser
`tags: ["v*"]` (`ci.yaml:6`) und das Tagschema `type=edge,branch=main` / `type=sha,prefix=sha-` /
`type=semver,pattern=v{{version}}` / `type=raw,value=latest` nur auf `refs/tags/v` (`ci.yaml:76-79`).
Auf ihm stehen der `IMAGE_TAG`-Rollback aus `deployment.md:117-118` und die Kanaltabelle
`deployment.md:29` („`edge` (Staging) oder `vX.Y.Z` (Prod)", ebenso `stack.env.example:2`).

`deployment.md` (Abschnitt „CDN/Proxy") beschreibt
den Vorfall, der dazu geführt hat: ein 404 des Reverse-Proxy im Neustartfenster, vom CDN mit 4 h
Browser-TTL gecacht, weiße Seite für alle Clients. Der Commit `2361f40` — der ursprünglich als Freeze
genannte Stand, sieben Commits (vier ohne Merges) vor dem tatsächlichen `ca04eb1` — **ist** dieser Fix.

**Ein Nebenläufer, und der Code widerspricht dem Runbook.** `deployment.md:120-125` schreibt wörtlich,
ein nächtlicher SQLite-Snapshot sei „geplant, aber **noch nicht implementiert**" und der Container
schreibe „aktuell **keine** Backups von selbst". `src/instrumentation.ts:11-18` startet in Produktion
`starteBackupJob()`; `src/db/backup.ts:38-46` tickt stündlich, legt ab `getHours() >= 2` einen
`sqlite.backup()` nach `dirname(DATABASE_PATH)/backups/lagerbuch-YYYYMMDD.db` und hält 14 Tage
(`:28`).

Sonst läuft **nichts** nebenher: `grep -rn 'setInterval|node-cron|nodemailer|smtp|schedule' src/`
liefert genau einen Treffer, `backup.ts:44`. Es gibt keinen Verfall-Melder, keinen Aufräumlauf, keinen
Sitzungs-Aufräumer, keinen geplanten CI-Lauf und keinen zweiten Container. `WARN_TAGE_KRITISCH` (31)
und `WARN_TAGE_FAELLIG` (56) sind Schwellen für eine Ampel, die bei jedem Seitenaufruf frisch
gerechnet wird (`src/lib/domain/verfall.ts:12-16`) — kein Melder. Dass abgelaufenes Material auffällt,
hängt allein daran, dass jemand die Oberfläche öffnet.

**Startriegel:** `src/lib/config.ts:101-113` wirft in Produktion, wenn `AUTH_SECRET` oder
`HELFER_SESSION_SECRET` leer ist oder auf dem Dev-Default `dev-insecure-secret-change-me` steht
(`config.ts:41-42`); verdrahtet über `src/instrumentation.ts:6`, also vor Migrationen und vor der
ersten Anfrage. `deployment.md:65` verlässt sich ausdrücklich darauf.

**13 Playwright-Specs** (`e2e/` enthält 14 Dateien, `e2e/migrate-db.ts` ist ein Seed-Helfer). Zwölf
davon melden sich über den Demo-Login-Knopf des Gates an (`src/auth.config.ts:41-55`, Credentials-Provider
mit hartem `isAdmin: true`); `e2e/gate.spec.ts:3-18` meldet sich **gar nicht** an.
`e2e/helfer-flow.spec.ts:5-8` nimmt den Gate-Code-Weg mit dem Seed-Code `111-111`. Bemerkenswert:
`e2e/migrate-db.ts` ist ein **eigener tsx-Prozess**, den `playwright.config.ts` vor `next dev` startet —
mit zwanzig Zeilen Begründung (`:1-21`), dass unter `next dev` eine später geöffnete Verbindung das
Schema der Instrumentations-Verbindung nicht sieht.

**Die 13 Specs im Einzelnen.** Der Absatz oben zählt sie; die Tabelle sagt, was jede einzelne
zusichert, woran diese Zusicherung hängt und ob sie den Umbau auf antd übersteht. Die letzte Spalte
ist die eigentlich entscheidende: **wo unter der E2E-Zusicherung ein Unit-Test liegt, ist ein roter
Playwright-Lauf ärgerlich; wo keiner liegt, ist die Fachlichkeit nach dem Umschreiben der Spec
unbewacht.** Reihenfolge alphabetisch: Playwright fährt alle Spec-Dateien in **einem** Worker ab
(`playwright.config.ts:9`), und zwar alphabetisch (`e2e/migrate-db.ts:87`).

| Spec | Was sie zusichert | Woran gekoppelt | Überlebt der Port? | Netz darunter |
|---|---|---|---|---|
| `bestand-export.spec.ts` (1) | Der Excel-Export läuft im Browser (Bibliothek wird beim Klick nachgeladen) und liefert wirklich eine Datei: Dateiname in der **Form** `bestand-JJJJ-MM-TT.xlsx` (`:18`) und ZIP-Magic `PK` in den ersten zwei Bytes (`:23-24`) | Rolle+Name `button /Excel-Liste/` (`:16` → `ArtikelTable.tsx:166`), `heading "Artikel & Bestand"` (`:12`), URL `/verwaltung/artikel` (`:11`), Playwright-`download`-Event (`:14-15`) | **ja**, solange Knopf- und Überschriftentext stehen bleiben — Rolle+Name sind antd-neutral | `src/lib/bestand-export.test.ts:17-44`. **Mit Lücke:** `:44` prüft `bestandExportDateiname(new Date(2026,6,5))`, konstruiert also aus lokalen Komponenten und liest über lokale Getter zurück (`bestand-export.ts:55-57`) — grün unter jeder Zone. Die E2E prüft nur die **Form**, nie den **Wert**. Falle 2 bleibt auf beiden Ebenen ungegatet |
| `bz-scan.spec.ts` (1) | Kamerafreier Scanner-Pfad: BZ-Gerät mit Barcode anlegen → manuelle Eingabe findet es → Kontrolle erfassen → unbekannter Barcode liefert Meldung statt Navigation → Logbuch zeigt den **aufgelösten Klarnamen** statt der User-ID (`:59`) | Rollen+Namen (`:17,18,21,27,30,45,50,52`), URL-Muster `/verwaltung/bz/.+/kontrolle$` (`:33`), **vier Platzhaltertexte** (`:19,20,29,40`), Meldungstexte `/Kontrolle erfasst/` (`:46`), `/Kein Gerät mit Barcode/` (`:53`) | **teilweise.** Rollen und URL ja; die vier `getByPlaceholder`-Anker nicht, sobald Felder auf die Suite-Konvention `Form.Item label` umgestellt werden. Der Hydrations-Retry (`:41-47`) ist ein reines `next dev`-Artefakt und hat im Port keine Entsprechung | `src/db/bz.test.ts:42-198` (Anlegen, Kontrolle, `bzGeraetByBarcode` `:140`, geteilter Barcode-Namensraum `:198`); Klarnamens-Auflösung in `src/db/quelle.test.ts:18` |
| `check.spec.ts` (1) | Helfer-Check über eigenen Token `222-222` (`:3`): Fehlmenge zählen → **im Fahrzeug abgelesenen Verfall melden** → Abschluss meldet `1 laufen ab` (`:33`) → der Check taucht in der Admin-Historie auf (`:42`) | Rolle+Name (`link /Fahrzeug-Check/` `:13` → `HelferFrame.tsx:27`; `button "Menge verringern"` `:22` → `Stepper.tsx:47`; `button /abschließen/i` `:31`), **`getByLabel(/^Verfall /)`** (`:23` → `CheckFlow.tsx:281`), Textmuster `/^\d+ laufen ab/` (`:24` → `CheckFlow.tsx:306`) und `/1 laufen ab/` (`:33` → `CheckFlow.tsx:187`), URLs `/helfer$`, `/helfer/check$`, Fixture-Namen `E2E RTW` | **nein, nicht unverändert.** `/abschließen/i` trifft heute case-insensitiv genau einen Knopf, weil je Phase nur einer rendert (`CheckFlow.tsx:362`, `:414`, `:485`); `Stepper` ist eigenes Markup und geht als Ganzes. Rollen-/URL-Teile überleben | **Serverseitig ja, clientseitig nein.** `src/actions/check.test.ts:218-250` deckt Verfall-Übernahme und `verfallAuffaellig` ab (`:229`). Ungegatet bleibt, dass das **Eingabefeld** überhaupt in die Nutzlast verdrahtet ist und dass die **Live-Vorschau** `CheckFlow.tsx:306` zählt |
| `etiketten.spec.ts` (1) | Der Etikettenbogen rendert: mindestens ein `<img>` in `.etikett` mit `src` = `data:image/png…` (`:11-13`), Drucken-Knopf vorhanden (`:16`) | **CSS-Klasse `.etikett img`** (`:11` → `globals.css:268`), `heading "Etiketten"` (`:9`), `button /Drucken/` (`:16`), Attributmuster `src` | **nein.** `.etikett` ist Druck-Geometrie in Millimetern und die einzige Kopplung des Tests | `src/db/etiketten.test.ts:8` prüft Auswahl (gesperrte Token raus), absoluten Deep-Link **und** `data:image/png`-Präfix. Ungegatet bleibt nur, dass diese Daten im Bogen tatsächlich als `<img src>` landen |
| `gate.spec.ts` (1) | Die **login-freie** Startseite zeigt Marke, Zeile, Organisation und die zwei Einstiegskarten (`:7-17`) | Sichtbare Texte `"LAGERBUCH"` (exakt), `"Materialverwaltung"`, den Organisationsnamen aus `APP_ORG` (`playwright.config.ts:34`), `heading "Im Dienst"`, `heading "Verwaltung"` | **gegenstandslos** (nicht rot), sofern lagerbuch mit `requiresAuth` im Registry landet: dann gatet die Suite den Modulzugang selbst (Abschnitt 3.3), und für ein eigenes Startseiten-Gate bleibt nichts übrig. Die einzige Spec ohne Anmeldung | keins, und keines nötig: die Aussage ist reines Layout, das der Port ohnehin ersetzt |
| `geraete.spec.ts` (2) | (a) Gerät anlegen → Barcode-Scan springt aufs Detail → unbekannter Barcode meldet statt zu navigieren. (b) Fahrzeugcheck mit **Geräte-Schritt**: Defekt quittieren → `1 Gerät(e) auffällig` (`:69`) → Admin-Detail zeigt Gerät + Zustand (`:79-80`) | Rollen+Namen (u. a. `combobox "Standort"` + `option "Handlager"` `:23-24`, `button "Defekt"` `:66`, `button "Abschließen"` `:67`), Platzhalter `"z. B. Corpuls C3"` (`:18`), URL-Muster `/verwaltung/geraete/(?!scan$)[^/]+$` (`:34`), Textmuster `/1 Gerät\(e\) auffällig/`, Fixture-Namen `E2E Geräte RTW`, `E2E Spineboard` | **teilweise, und die Falle zu den Zustands-Literalen spaltet die Spec:** `:66` (`button "Defekt"`) ist die **Eingabe**seite und überlebt einen Umbau auf `Radio.Group`/`Select` nicht, `:80` (`getByText("Defekt")` auf der Check-Detailseite) prüft das **persistierte** Literal und überlebt. Dazu bricht der Standort-Wähler `:23-24` mit dem eigenen Bauteil `src/components/Combobox.tsx:182,223`, das `role="combobox"`/`role="option"` von Hand setzt | `src/db/geraete.test.ts:18-94` (Anlegen, globale Barcode-Eindeutigkeit `:57`, `geraetByBarcode` `:84`); `src/actions/check.test.ts:128-160` (Geräte quittieren, auffällige zählen, Fremdgerät-Rollback) |
| `helfer-flow.spec.ts` (2) | (a) Code `111-111` einlösen → `/helfer` → Entnahme → Journal zeigt die **Token-Provenienz** (Label `E2E` statt Personenname, roher Code im `title`, `:27-28`). (b) Token sperren → nächste Entnahme wird **sofort** abgewiesen (`:56-57`) | `getByLabel("Zugangs-Code")`, **CSS `a.row`** (`:12` → `globals.css:50`), **CSS `table.tbl tbody tr`** (`:26` → `:206`), **CSS `.row`** (`:44`), Attributselektor `[title="111-111"]` (`:28`), Deep-Link `/a/e2e-artikel` (`:52`), Fehlertext `/server-side exception/` (`:56`) | **nein.** Drei CSS-Kopplungen plus `:56`, das auf Next.js' generische Fehlerseite zielt — die Suite hat eigene Error-Boundaries, das Signal ist nicht portierbar. `:52` ist laut Abschnitt 5 die einzige Deep-Link-Navigation im ganzen Bestand | `src/db/quelle.test.ts:25` (`token → Label`, unbekannter Code bleibt roh); `src/actions/session-helfer.test.ts:29` (gesperrter Token wirft — die sofortige Sperrwirkung); `src/actions/token-redeem.test.ts:18-45`. **Nicht** gegatet ist, dass die Abweisung als Absturz beim Nutzer ankommt (Falle 62) |
| `inventur.spec.ts` (2) | (a) Inventur korrigiert einen Artikel auf den gezählten Ist-Wert; das Journal zeigt eine `Korrektur` (`:19`). (b) Bestell-Toggle: `markieren` klicken zeigt den Chip `bestellt` (`:29`) | `button "Menge verringern"` (`:13` → `Stepper.tsx:47`), `getByPlaceholder(/Kommentar/)` (`:14`), `button /Inventur abschließen/`, Text `/Inventur gebucht/`, `button /markieren/` (`:25` → `BestellListe.tsx:49`), **`getByText("bestellt", { exact: true })`** (`:29` → `BestellListe.tsx:55`) | **teilweise.** Rollen+Namen überleben; `Stepper` ist eigenes Markup. `exact: true` in `:29` trennt den Zeilen-Chip von der Fußnote und bricht still, sobald der Chip zu einem antd-`Tag` mit anderem Textknoten wird | `src/actions/inventur.test.ts:26-67` (FEFO-Korrektur, Pflichtkommentar, `bestelltAt` unberührt); `src/actions/bestellung.test.ts:36` (`markiereBestellt` setzt **und** löscht `bestelltAt`). Ungegatet bleibt allein die Chip-Darstellung |
| `loeschen.spec.ts` (1, 5 Schritte) | Sicheres Löschen: Artikel **ohne** Historie ist nur nach exakter Tippbestätigung löschbar (Knopf bleibt bei falschem Namen `disabled`, `:50-54`); Artikel **mit** Historie ist gesperrt und bietet Deaktivieren (`:67-74`) | **CSS `.drawer`** 4× (`:21,33,43,63`), **`.modalbox`** 2× (`:46,66`), **`tr.click`** 4× (`:32,42,62,73`), **`div.grid2 input.input`** (`:24`), **`.card.journal .row`** (`:37`), `input[type="month"]` (`:35`), vier Platzhaltertexte, Texte `"Endgültig löschen"`, `/Nachweis zerstören/`, `"inaktiv"` | **nein.** Die selektorlastigste Spec im Bestand; `.drawer` ist zugleich der Hauptarbeitsweg der Verwaltung (Falle 48) | `src/actions/loeschen.test.ts:38-190` deckt alle Verweigerungsregeln serverseitig ab (Artikel, Fahrzeug, Token, BZ-Gerät, Flasche, Gerät, Handlager nie löschbar). Ungegatet bleibt der **Client-Zustand** des Tippfeldes: dass `Endgültig löschen` bis zum exakten Treffer gesperrt bleibt (`:50-54`) |
| `suche-filter.spec.ts` (2) | (a) Die Artikel-Suche filtert **clientseitig** (Zeile verschwindet ohne Navigation, `:15-17`). (b) Die Journal-Suche ist **serverseitig über URL-State**: der entprellte Tastendruck landet als `?q=` in der URL, der Server rendert gefiltert neu (`:28-32`) | Rolle **`searchbox`** mit Namen `/Artikel oder Fach suchen/` bzw. `/Artikel oder Kommentar suchen/` (`:15`, `:28`) — beide aus **einem** Bauteil (`Filterleiste.tsx:106,111`: `type="search"` + `aria-label`), `getByRole("cell", …)`, URL-Muster `/[?&]q=Verband/` (`:30`), Fixture-Namen | **teilweise, und die Rolle ist der Haken.** `searchbox` entsteht allein aus `type="search"` (`Filterleiste.tsx:106`). Wer das Bauteil ersetzt und nur `placeholder`/`label` mitnimmt, bekommt `textbox` — **beide** Tests brechen an derselben Stelle, und zwar still im Sinne von „Selektor findet nichts", nicht „Fachlichkeit kaputt". Die URL-Zusicherung `:30` überlebt | Nur (b): `src/db/queries.test.ts:142-167` prüft den Journal-Freitextfilter über Artikelname und Kommentar, Kombination und ganze Historie. Für (a) **kein Netz** — der clientseitige Filter und die Entprellung→URL-Verdrahtung existieren nur hier |
| `verfall.spec.ts` (1) | Abgelaufene Charge aussondern: Warnliste zeigt sie, nach dem Aussondern ist sie weg (`:24`), und das Journal trägt die Korrektur mit **Grund** und **negativem Delta `-3`** (`:30-33`) | **CSS `.row`** 2× (`:15,24` → `globals.css:50`), `button /Aussondern/`, `getByPlaceholder(/Grund/)`, `button /× aussondern/` (`:21` — enthält ein typografisches `×`), Zeilenfilter über `tr` + Text `Korrektur`, Fixture-Name `E2E Verfall NaCl` | **nein.** `.row` ist die häufigste Layoutklasse des Moduls und geht als erste; `/× aussondern/` hängt zusätzlich an einem Sonderzeichen im Knopftext | `src/actions/aussondern.test.ts:24-54` (bucht `-rest` als Korrektur, Pflichtkommentar, lehnt nicht-abgelaufene und Pseudo-Charge `2099-12` ab, lässt `bestelltAt` unberührt) |
| `verwaltung-flow.spec.ts` (1, 5 Schritte) | Der M1-Happy-Path am Stück: Login → Artikel anlegen → Zugang mit neuer Charge → Entnahme → Journal zeigt genau **eine** Entnahme-Zeile mit Delta `-1`, **rot dargestellt** (`:65-67`) | **CSS `.drawer`** 4× (`:26,40,55,61`), **`div.grid2 input.input`** (`:32`), **`tr.click`** (`:39`), **`.card.journal .row`** 2× (`:51,57`), **`table.tbl tbody tr`** (`:65`), **`.jdelta.minus`** (`:67` → `globals.css:176`), `input[type="month"]` (`:45`), Platzhalter `"z. B. Beatmungsfilter HME"`, `"z. B. 2507-014"` | **nein.** Sechs CSS-Kopplungen. Der eigene Kommentar `:48-50` hält fest, warum `.first()` hier bewusst vermieden wurde (Sekunden-Auflösung der `ts`-Spalte) — dieselbe Ursache wie Falle 3 | `src/actions/buchung.test.ts` deckt Zugang/Entnahme und das Löschen von `bestelltAt` beim Zugang ab. **Ohne Netz:** `.jdelta.minus` — dass eine Entnahme im Journal überhaupt als negativ und rot erscheint, steht nirgends sonst |
| `verwaltung.spec.ts` (3) | (a) Demo-Login erreicht die Verwaltungs-Shell und zeigt `Angemeldet als` (`:8`). (b) Direktaufruf einer Verwaltungsseite hängt das Ziel als `returnTo` an und kehrt nach dem Login **genau dorthin** zurück (`:14-16`). (c) Wer angemeldet ist, landet vom Gate aus nicht wieder auf der Startseite (`:26-28`) — der PWA-Fall mit verlorenem Callback-Cookie | **Literale URL** `/\/\?returnTo=%2Fverwaltung%2Fartikel$/` (`:14`), `button /Demo-Login/`, `heading "Übersicht"`, Text `/Angemeldet als/` | **rot, nicht gegenstandslos** — auf die literale Gate-URL aus `:14` führt nach dem Port kein Weg mehr. (a) und (c) sind als **Aussage** übertragbar, (b) nicht | `src/lib/auth/cordon.test.ts:5-52` prüft die gesamte `returnTo`-Logik als reine Funktion, inklusive Endlosschleifen-Schutz und Open-Redirect (`:52`); `adminLandingPfad` (`:29-49`) ist genau (c) |

**Was der Umbau kostet — die teure Teilmenge.** Alle 13 Specs zusammen prüfen viel Fachlichkeit
doppelt: unter jeder **serverseitigen** Zusage der Tabelle liegt ein Unit-Test — einzige Ausnahme ist
`gate.spec.ts`, das gar keine macht. Und die 44 Testdateien unter `src/` sind ausnahmslos `.ts`: es
gibt **keine einzige `.tsx`-Testdatei und kein DOM-Harness** im ganzen Bestand
(`find src -name '*.test.tsx'` liefert nichts, `-name '*.test.ts*'` liefert 44). Daraus folgt die
Trennlinie: was an der Oberfläche passiert, prüft ausschließlich Playwright. Sieben Zusicherungen sind
deshalb die **einzige** Absicherung ihrer Fachlichkeit, und alle sieben sind vom Typ „ein serverseitig
gerechneter Wert wird richtig angezeigt bzw. eine Eingabe wird richtig verdrahtet":

1. **`check.spec.ts:23-24`** — dass das Verfallsfeld im Zählschritt (`CheckFlow.tsx:281`) überhaupt in
   die Check-Nutzlast wandert und die Live-Vorschau `{n} laufen ab` (`CheckFlow.tsx:306`) mitzählt.
   `check.test.ts:229` beweist nur, dass der Server richtig zählt, **wenn** der Wert ankommt.
2. **`suche-filter.spec.ts:15-17`** — der clientseitige Artikelfilter. Das Prädikat steht als
   `useMemo` **inline** im `"use client"`-Bauteil (`ArtikelTable.tsx:112-123`), nicht in einem
   `src/lib`-Modul — es gibt also nichts, was ein Unit-Test importieren könnte. Nebenbefund: es sucht
   über Name, Fach **und** Chargennummer (`:119`), die Spec probiert nur den Namen. Und weil der
   Excel-Export dieselbe gefilterte Liste exportiert (`:133`), hängt `bestand-export.spec.ts` an
   demselben Bauteil.
3. **`suche-filter.spec.ts:28-30`** — die Entprellung, die den Tastendruck in `?q=` schreibt. Der
   Serverfilter dahinter ist getestet, die Verdrahtung nicht.
4. **`verwaltung-flow.spec.ts:67`** — `.jdelta.minus`: dass eine Entnahme im Journal negativ **und**
   rot erscheint (`globals.css:176`).
5. **`inventur.spec.ts:29`** — der Chip `bestellt` als Zeilenzustand, bewusst mit `exact: true` von der
   Fußnote getrennt.
6. **`loeschen.spec.ts:50-54`** — dass `Endgültig löschen` gesperrt bleibt, bis der Name exakt getippt
   ist. `loeschen.test.ts` prüft die serverseitige Verweigerung, nicht den gesperrten Knopf.
7. **`etiketten.spec.ts:11-13`** — dass der von `etikettenDaten` erzeugte Data-URI im Bogen als
   `<img src>` landet. Die Daten selbst sind gegatet (`etiketten.test.ts:8`), die Darstellung nicht.

Punkt 4, 5 und 7 hängen an eigenem Markup und gehen beim antd-Umbau **sicher** kaputt; 1, 2, 3 und 6
hängen an Rollen und Beschriftungen und gehen kaputt, sobald die Bauteile ersetzt werden — was für
`Stepper`, `Filterleiste` und die Tippbestätigung der Zweck der Übung ist. Das ist die Liste, für die
ein **ersetzender** Test geschuldet ist, bevor die alte Spec gelöscht wird; für alles andere in der
Tabelle genügt es, die Spec neu zu schreiben oder fallenzulassen, weil die Fachlichkeit unter `src/`
weiterhin gegatet ist.

**Drei Randbedingungen, die jede Neufassung erbt.** Erstens läuft alles in **einem** Worker gegen
**eine** SQLite-Datei (`playwright.config.ts:9`, Begründung `:7-8`); `migrate-db.ts:84-88` schreibt
ausdrücklich, dass deshalb ein zweiter Token nötig war, damit der Check nicht ins Journal des
Helfer-Flows bucht. Jede `.first()`-Zusicherung — `inventur.spec.ts:13`, `check.spec.ts:22`,
`helfer-flow.spec.ts:12` — hängt damit nicht nur am Seed, sondern an der **angesammelten Reihenfolge**
aller vorher gelaufenen Specs. Zweitens ist `inventur.spec.ts:26` defensiv geschrieben
(`if (await firstToggle.count())`) und würde ohne Bestellvorschlag **grün ohne Zusicherung**
durchlaufen; heute rettet das allein `ensureE2eBestellungFixtures` (`migrate-db.ts:142-147`), das
einen Artikel mit `mindestbestand: 5` ohne Buchung anlegt. Wandert der Seed nicht mit, wird der Test
still wirkungslos statt rot — die schlechtere der beiden Varianten.

Drittens: **im Repo ist kein Lauf gegen ein Produktions-Artefakt verdrahtet.** Die CI startet
ausschließlich den Playwright-eigenen `webServer` (`.github/workflows/ci.yaml:48-49`, ohne
`PLAYWRIGHT_BASE_URL`), also `next dev` mit `NODE_ENV=development`, Test-Secrets und
`AUTH_DEV_LOGIN=true` (`playwright.config.ts:29-40`). `ci.yaml:42-47` begründet das ausgeschrieben:
ein produktionsechter Container „verlangt echte Secrets UND verbietet den e2e-Demo-Login, und gegen
einen externen Base-URL werden die Fixtures nicht geseedet". Der `PLAYWRIGHT_BASE_URL`-Zweig
(`playwright.config.ts:3,10-13`) existiert also, wird aber von keinem Lauf im Repo benutzt. Vom
Produktions-Image prüft die CI nur, dass es baut (`ci.yaml:52-53`, „Nur Build, kein Run/Health").
Alles, was die Specs oben zusichern, ist damit über einen Dev-Server bezeugt — nicht über den
Standalone-Build, unter dem die Anwendung tatsächlich läuft.

### 2.7 Suche, Filter und URL-State

Das Modul hat **zwei** Filterregime, und der Unterschied ist keine Stilfrage, sondern eine
Datenfrage.

**Regime A — clientseitig, über eine vollständig geladene Liste.** Sechs Listen bekommen ihre Zeilen
komplett vom Server und filtern in `useMemo` im Browser. Der Zustand lebt in `useState`, überlebt
kein Neuladen, ist nicht teilbar und steht in keiner URL:

| Liste | Freitext sucht über | Chips | Vorgaben |
|---|---|---|---|
| `ArtikelTable.tsx:112-122` | Name · Fach · Chargennummer der nächsten Charge | unter Mindestbestand · Charge kritisch · inaktive ausblenden (`:149-152`) | Sortierung `name-asc` (`:108`), sechs Sortierungen (`:30-36`), Zweitkriterium immer Name (`:41`) |
| `GeraeteListe.tsx:16-24` | Name · Barcode · Lagerort | Medizin · Objekt (Mehrfachauswahl über `toggleInSet`) · nur fällige · inaktive ausblenden (`:29-33`) | Reihenfolge aus `geraete.ts:47` |
| `BzListe.tsx:22-30` | Name · Barcode · Lagerort | fällig/überfällig · inaktive ausblenden (`:32-35`) | Reihenfolge aus `bz.ts:104` |
| `SauerstoffListe.tsx:15-23` | Name · Lagerort | niedriger Druck · inaktive ausblenden (`:25-28`) | Reihenfolge aus `sauerstoff.ts:54` |
| `FahrzeugeListe.tsx:16-25` | Name · Kennung | unter Soll · läuft ab · inaktive ausblenden (`:27-31`) | — |
| `TokenTable.tsx:28-35` | Code · Label · Zielname | gesperrt · Fahrzeug · Artikel · Artikel-Liste (Mehrfachauswahl) (`:40-45`) | — |

Dazu `HelferListe.tsx:10-12` (eigenes Eingabefeld, sucht **nur** über den Artikelnamen) und
`Combobox.tsx:71-74` (sucht über `label` **plus** ein optionales `keywords`-Feld).

**Die Suchfelder sind je Liste verschieden.** Das ist kein Zufall, sondern Bedienpraxis — nach einem
Barcode sucht man bei Geräten, nach einer Kennung bei Fahrzeugen, nach einer Chargennummer bei
Artikeln. Ein antd-`Table` mit einem globalen Suchfeld bringt diese sechs verschiedenen Feldmengen
nicht mit; sie sind sechs einzeln zu portierende Zusicherungen.

**Zwei Kopplungen an Regime A, die beim Neubau leicht reißen:**

1. **Die Trefferanzeige.** `Filterleiste.tsx:131` rendert „X von Y" **nur**, wenn
   `gezeigt !== gesamt`. Alle sechs Listen geben sie mit (`ArtikelTable.tsx:197`,
   `GeraeteListe.tsx:47`, `BzListe.tsx:48`, `SauerstoffListe.tsx:41`, `FahrzeugeListe.tsx:44`,
   `TokenTable.tsx:55`). Ein antd-`Table` zeigt stattdessen einen Pager-Text — nicht dieselbe
   Aussage.
2. **Der Excel-Export hängt am Filterzustand.** `ArtikelTable.tsx:133` ruft
   `bestandExportZeilen(gefiltert)` — die Datei enthält ausdrücklich „genau das, was gerade in der
   Tabelle steht (Suche, Filter, Sortierung)" (`:124-125`). Wandert Filtern und Sortieren in antds
   `Table`-eigenen Zustand, muss der Export dieselbe abgeleitete Liste lesen; sonst exportiert der
   Knopf still wieder alles.

**Regime B — serverseitig, Zustand in der URL.** Zwei Verwaltungsseiten filtern über
`searchParams`, damit die Suche über die **gesamte** Historie geht und nicht nur im geladenen
Ausschnitt (der Grund steht als Kommentar in `queries.ts:82-85` und in `JournalFilter.tsx:16-19`):

| Seite | Parameter | Prüfung | Abfrage |
|---|---|---|---|
| `/verwaltung/journal` | `q`, `typ`, `von`, `bis` (`journal/page.tsx:13`) | `typ` gegen eine Weißliste (`:8`, `:17`), sonst `undefined`; `q` nur `trim()` (`:16`); `von`/`bis` **ungeprüft** (`:18-19`) | `journalEintraege` (`queries.ts:86-123`) |
| `/verwaltung/checks` | `fz`, `von`, `bis` (`checks/page.tsx:13`) | `fz` gegen die tatsächliche Flotte aus der Datenbank (`:20`); `von`/`bis` **ungeprüft** (`:21-22`) | `checkHistorie` (`queries.ts:349-362`) |

Dritter URL-Zustand, aber kein Filter: `/helfer/check?fz=` (`helfer/check/page.tsx:11-12`) springt
direkt in den Check eines Fahrzeugs — die Sprungmarke der fahrzeuggebundenen Zugangs-Codes. Auch hier
wird gegen die aktive Flotte geprüft (`:28`).

**Die Prüf-Asymmetrie ist real und sichtbar.** `von`/`bis` gehen ungeprüft durch:
`parseDatumGrenze` (`format.ts:21-26`) liefert bei Unsinn `undefined`, die Abfrage ignoriert die
Grenze also — aber die **rohe** Zeichenkette wandert als Prop zurück in den Client
(`journal/page.tsx:34`, `checks/page.tsx:33`) und dort in `value={von}` eines `<input type="date">`
(`Filterleiste.tsx:57`, `:68`). **Das Fehlverhalten ist das gefährliche, nicht das laute:** ein
gespeicherter Link mit defektem `von` liefert die Seite ohne Fehlermeldung und **ungefiltert** — die
Adresszeile zeigt einen Zeitraum, das Datumsfeld steht leer, und die Liste zeigt die neuesten 100
Buchungen aus der ganzen Historie. Wer den Link für einen gespeicherten Zeitraumbericht hält, liest
die falsche Menge. *(Zur Zeitzonenwirkung derselben Funktion siehe Falle 2 — dort ist
`format.ts:21-26` bereits als Verschieber der Filtergrenzen benannt.)*

**Der `replace`-Vertrag.** `useUrlFilter` navigiert mit `router.replace`, nicht `push`
(`Filterleiste.tsx:34`). Damit erzeugt **keine** Filteränderung einen Verlaufseintrag: die
Zurück-Taste verlässt die Seite, statt durch Filterzustände zurückzulaufen. Das ist genau die
Begründung, die die Suite an derselben Stelle bereits aufgeschrieben hat
(`m/feedback/_ui/Segment.tsx:15-16`, dort für `?monate=`).

**Daraus wird beim Portieren leicht eine Falle:** wer den Zurück-Knopf „reparieren" will und auf
`push` umstellt, bekommt zusammen mit dem 300-ms-Debounce der Freitextsuche
(`JournalFilter.tsx:44-52`) einen Verlaufseintrag **pro Tipppause**. Nach „Verbandpäckchen" mit
Denkpausen liegen dann ein halbes Dutzend Einträge im Stapel und die Zurück-Taste ist unbenutzbar.

**Der `committedQ`-Tanz.** `JournalFilter.tsx:29-36` merkt sich in einem Ref, welchen Suchbegriff die
Komponente zuletzt selbst in die URL geschrieben hat, und unterscheidet damit eine **externe**
`q`-Änderung (geteilter Link, Vor/Zurück von einer anderen Seite) von einer selbst ausgelösten:
extern wird die Eingabe nachgezogen, selbst ausgelöst passiert nichts — sonst verlöre das Feld beim
Tippen den Fokus. Das ist gelöste Arbeit, die ein `Input` aus antd nicht mitbringt; sie muss beim
Neubau mitgehen. Der Kommentar `:21-24` nennt „Browser-Zurück/-Vor" als Anlass — wegen `replace` ist
der Fall innerhalb der Seite aber kaum erreichbar; tragend ist der geteilte Link.

**Die URL-Parameternamen sind heute im Repo genau einmal gebunden**: `e2e/suche-filter.spec.ts:30`
prüft literal `toHaveURL(/[?&]q=Verband/)`. Ob sie darüber hinaus verbindlich sind (Lesezeichen,
Runbook-Links), sagt kein Repo — Betreiberfrage 35. Der Test gehört in dieselbe Klasse wie die
achtundzwanzig Selektor-Verwendungen aus Falle 48.

**Die Journalsuche ist zweigeteilt und faltet Groß-/Kleinschreibung in beiden Hälften
unterschiedlich** — Artikelname in JavaScript, Kommentar per SQL `LIKE`. Das ist kein Detail dieses
Abschnitts, sondern ein eigener Befund mit Messtabelle: **siehe Falle 59**.

#### Zwei stille Obergrenzen

`journalEintraege` deckelt auf 100 (`queries.ts:87`), `checkHistorie` auf 50 (`queries.ts:350`) —
beides Vorgabewerte, die kein Aufrufer je überschreibt. Die Reihenfolge ist bewusst: die
`WHERE`-Bedingungen greifen **vor** dem `LIMIT` (`queries.ts:82-85`, `:105-111`), die Suche geht also
über die volle Historie und liefert davon die neuesten 100 bzw. 50 Treffer.

**Sichtbar ist davon fast nichts.** `journal/page.tsx:32` schreibt „Zeigt die neuesten 100 Treffer"
unbedingt in die Seitenbeschreibung — auch wenn drei Zeilen zurückkommen. Die Checks-Seite nennt ihre
50 an keiner Stelle. Und die Trefferanzeige aus `Filterleiste.tsx:131` erscheint auf **keiner** der
beiden Seiten: `JournalFilter.tsx:80-86` übergibt die `treffer`-Prop nicht, `ChecksFilter.tsx`
verwendet die `Filterleiste` gar nicht. Es gibt damit im gesamten Modul keinen Weg herauszufinden, ob
eine Grenze gerade zugeschlagen hat.

Zur Wechselwirkung mit dem Datenmodell: `buchungen` hat einen Index auf `ts` (`schema.ts:107`), aber
**keinen** zusammengesetzten auf `(ts, id)`; `buchungen.id` ist ein `nanoid()` (`schema.ts:4`, `:92`),
also nicht zeitlich geordnet, aber ein deterministischer Totalorder. Das ist für Entscheidung 35
tragend.

#### Was die Suite dazu mitbringt — und was nicht

- **Vorbild vorhanden für das Muster als solches.**
  `m/feedback/(admin)/groups/[groupId]/trend/page.tsx:42-56` liest `?monate=`, klemmt es serverseitig
  auf eine Weißliste (`fensterAus`) und lässt den Server neu rechnen; die Client-Insel
  `m/feedback/_ui/Segment.tsx:34` schreibt es per `router.replace`. Das ist dasselbe Muster wie `typ`
  im Journal (`journal/page.tsx:8,17`), einschließlich der Begründung für `replace`
  (`Segment.tsx:15-16`). Zweites Vorbild fürs Klemmen eines Zahlparameters:
  `m/files/(verwaltung)/shares/[id]/page.tsx:120-126,345` (`?logs=`).
- **Kein Vorbild für eine mehrteilige, debouncte Filterleiste.** Beide Suite-Fälle setzen **einen**
  skalaren Parameter über einen Klick. Freitext mit Debounce, vier gleichzeitig gesetzte Parameter,
  ein Zurücksetzen-Knopf und die Fokus-Erhaltung beim Tippen kommen im gesamten `src/app/m` nicht
  vor. `useUrlFilter` ist also keine Wegwerf-Zeile, sondern die einzige Stelle im Zielrepo, die das
  kann — es spricht einiges dafür, sie als Modulhilfe unter `_lib/` mitzunehmen statt sie in jeder
  Filterleiste nachzubauen.
- **`Table` ohne `pagination`-Angabe wäre ein Bruch mit dem Hausstil.** Alle zehn `Table`-Aufrufe der
  Suite setzen die Eigenschaft ausdrücklich: neun auf `pagination={false}`
  (`m/portal/admin/service-table.tsx:28`, `m/feedback/_ui/Zuordnung.tsx:176`,
  `m/feedback/_ui/VergleichTabelle.tsx:51`, `m/files/(verwaltung)/shares/[id]/page.tsx:478`,
  `m/files/_ui/ZugangslinksListe.tsx:206`, `…/PosteingangTabelle.tsx:403`, `…/SharesTabelle.tsx:212`,
  `…/AuditLog.tsx:142`), eine auf
  `pagination={{ pageSize: 12, hideOnSinglePage: true, size: "small" }}`
  (`m/feedback/_ui/Verlauf.tsx:311`). Kein Aufruf verlässt sich auf den Vorgabewert.
- **`Select showSearch` kennt das `keywords`-Feld nicht.** `Combobox.tsx:74` sucht über
  `label + keywords`; fünf Aufrufstellen nutzen das, um etwas suchbar zu machen, das nicht im
  Beschriftungstext steht: das Kennzeichen eines Fahrzeugs (`ChecksFilter.tsx:27`), das Fach eines
  Artikels (`SollEditor.tsx:93`, `TemplatePosEditor.tsx:74`), Fahrzeugname und Chargennummer
  (`ArtikelDrawer.tsx:261`, `:285`). Ohne ausdrückliches `filterOption`/`optionFilterProp` fällt das
  beim Tausch still weg — man tippt ein Kennzeichen und findet nichts. Gehört zu Falle 47.

---

## 3. Die Zielseite

### 3.1 Was die Suite mitbringt

- **Host → Modul ohne Eingriff.** `SUITE_HOST_LAGERBUCH` genügt; `moduleForHost` trifft jeden
  Listeneintrag (`core/registry.ts:141-148`), und in Dev löst `lagerbuch.localtest.me` **ohne** jede
  Env-Variable auf (`registry.ts:141-148` prüft `h === "<key>.localtest.me"` vor und unabhängig von
  `prodHostsFor`). Der Rewrite bildet `<host>/a/x` auf `/m/lagerbuch/a/x` ab (`core/routing.ts:78`) —
  die öffentliche Pfadform bleibt unverändert.
- **Kein Pragma-Bruch.** `openModuleDatabase` (`core/db/index.ts:17-21`) setzt dieselben vier Pragmas
  wie lagerbuchs `openDatabase` (`src/db/index.ts:17-20`): `journal_mode = WAL`, `foreign_keys = ON`,
  `busy_timeout = 5000`, `synchronous = NORMAL`; `migrateAllModules()` öffnet über genau diese
  Funktion (`core/bootstrap.ts:56`). Fremdschlüssel werden in der Suite genauso durchgesetzt wie
  heute — das ist ein **entlastender** Befund und macht zugleich die Sanierung des Löschpfads
  (Falle 5) zwingend.
- **Die Guards sind fertig.** `core/auth/guards.ts:20-25` (`requireModuleAdmin`, wirft, für Server
  Actions) und `:28-33` (`moduleAdminPageOrNotFound`, 404 statt 403, für Seiten). Die Registrierung
  ist testgekoppelt: `_db/`-Ordner + `MODULE_MIGRATIONS` (`core/bootstrap.ts:18-27`) + `COPY`-Zeile im
  `Dockerfile:40-43`, abgeriegelt von `core/bootstrap.test.ts:85`.
- **Ordnerbasierte Migration.** `core/bootstrap.ts:55-59` ruft
  `migrate(drizzle(sqlite), { migrationsFolder: m.migrationsFolder })` — es wird **kein** Schema
  gepusht. Das wörtliche Kopieren der sieben `.sql`-Dateien ist damit technisch möglich.
- **Health je Modul existiert schon.** `/api/health/lagerbuch` öffnet die Modul-DB und setzt
  `SELECT 1` ab (`core/health/index.ts:4-15`) — sobald `lagerbuch` in `core/registry.ts` steht,
  funktioniert es von selbst.
- **Import-/Paritäts-Harness.** `scripts/import/parity.ts` bildet Multisets über `rowChecksum`,
  `assertParity` bricht mit „Import ABORTED — no cutover." ab. Vorbilder: `scripts/import/portal.ts`,
  `scripts/import/feedback.ts` (beide zeilenweise in eine **frisch migrierte** Ziel-DB).
- **Der `feedback`-Backstop** als erprobtes Muster für „anonymer Teil + gegateter Teil in einem
  Modul": `requiresAuth: false` in der Registry, Durchsetzung als **aufrufbare Funktion**, die beide
  Layouts rufen (`m/feedback/_lib/requireFeedbackAccess.ts:17-23`).
- **Der `files`-Gegenentwurf für host-abhängige Ziele:** `hostFuerRolle`/`oeffentlicheUrl`/
  `rueckkehrZiel` (`m/files/_lib/access.ts:117-140`) leiten den Host aus der **Rolle** ab und fallen
  vor dem Cutover auf den relativen Pfad zurück.
- **`resolveHost(headers)`** mit Vorrang `x-forwarded-host` (`core/routing.ts:36-41`) — eingeführt,
  nachdem `feedback` nach einem `redirect()` anonyme Teilnehmer ins Login geschickt und eine
  unerreichbare Adresse ins Druckstück kodiert hatte (`KONSOLIDIERUNG-PROGRESS.md`, Phase 3,
  Redesign-Befunde 25.07.).
- **`moduleUrl(key)`** (`core/shell/moduleUrl.ts:15-27`) liest `prodHostsFor()` aus
  `SUITE_HOST_<KEY>` und fällt in Dev auf `<key>.localtest.me:<PORT>` — das richtige Werkzeug für
  gedruckte Artefakte, wo es keinen Reqüst-Kontext gibt.

### 3.2 Was die Suite nicht kann

- **Keine Modul-Middleware.** Es gibt genau eine `src/proxy.ts` (in Next 16 **ist** das die
  Middleware). lagerbuchs zwei Edge-Cordons müssen woandershin. Der Matcher von `proxy.ts:103`
  (`/((?!_next/static|_next/image|favicon.ico).*)`) umfasst zwar praktisch jede Anfrage — aber
  modulspezifische Zweige dort verstoßen gegen die `core`-Regel „nur was ein **zweites, heute
  belegbares** Modul braucht" (`docs/design/README.md:23-33`).
- **Kein `events`-Block in der Auth-Konfiguration.** `core/auth/config.ts` hat keinen; ein Modul kann
  kein `signIn`-Event registrieren. Das Hausmuster ist der Upsert **pro Anfrage hinter dem Riegel**
  (`m/feedback/_lib/requireFeedbackAccess.ts:50-55` ruft `upsertKnownUser`).
- **Kein `pages`-Eintrag je Modul, kein `/login` — und suiteweit kein `pages.error`.** `/login` steht
  in `PASSTHROUGH` (`core/routing.ts:12`) und gehört der Suite. `core/auth/config.ts:93-95` setzt
  `pages: { signIn: "/login" }` — **kein `error`-Schlüssel**. lagerbuch setzt beide Hälften
  (`src/auth.config.ts:72`: `pages: { signIn: "/", error: "/verwaltung/kein-zugriff" }`); die
  `error`-Hälfte hat in der Suite kein Gegenstück und auch keinen Ort, an dem ein Modul eines
  nachreichen könnte. Was daran hängt, steht in Entscheidung 10a — es ist nicht nur eine fehlende
  Konfigurationszeile, sondern der Wegfall des einzigen Weges, auf dem `kein-zugriff` heute
  tatsächlich erreicht wird.
- **`/api/auth` und `/api/health` stehen in `PASSTHROUGH`** und werden **vor** der Host-Auflösung
  geprüft (`routing.ts:12`, `:50-52`). Eine Datei unter `src/app/m/lagerbuch/api/health/route.ts`
  wäre tot — kein Fehler, kein Log. `/favicon.ico` ebenso.
- **Kein `TZ`.** Weder `iuk-suite/Dockerfile:23-29` noch `compose.yaml:20-39` setzen es; das
  Basis-Image ist `node:26-alpine`. Gemessen: `docker run --rm node:26-alpine` liefert `UTC`.
- **Kein Umgebungsriegel um `startBackgroundWork()`** (`core/bootstrap.ts:76-78`); es wird aus
  `instrumentation.ts:42` immer gerufen. Das Hausmuster legt den Riegel **ins Modul**
  (`m/files/_lib/boot.ts:113-130` trägt seine eigene Wache mit ausführlicher Begründung).
- **`seedAllModules()` läuft nur hinter `shouldSeed()`** (`SUITE_SEED === "1"` oder
  `NODE_ENV === "development"`, `core/bootstrap.ts:63-65`, aufgerufen `:80-84`). Der Kommentar dort
  (`:22-25`) begründet ausdrücklich, warum `files` **keinen** Seed bekommt: „ein Seed-Abgabelink
  wäre in einer Generalprobe ein gültiger anonymer Schreibzugang".
- **Kein `deploymentId`** in `iuk-suite/next.config.ts`, **kein `HEALTHCHECK`** im Dockerfile (nur in
  `compose.yaml:73-78`, und der fragt fest `/api/health/portal`).
- **Kein Startriegel für Modul-Geheimnisse.** `core/bootstrap.ts:40-50` prüft Hosts, Gruppen und die
  files-Blob-Ablage, sonst nichts; Geheimnisdisziplin lebt in Compose (`AUTH_SECRET=${AUTH_SECRET:?…}`).
- **`session.error` wird serverseitig von keinem Riegel gelesen.** Gesetzt wird es in
  `core/auth/refresh.ts:262` und `core/auth/config.ts:173-176`, ausgewertet ausschließlich in der
  **Client**-Komponente `components/providers.tsx:64`. Ein Nutzer mit endgültig gescheitertem Refresh
  behält seine alten `groups` bis zum Sitzungsende.
- **Vier Laufzeit-Abhängigkeiten fehlen** in `iuk-suite/package.json`: `jose`, `write-excel-file`,
  `@zxing/browser`, `@zxing/library`. Vorhanden sind `qrcode` und `nanoid`. Unter pnpm ist ein nur
  transitiv vorhandenes Paket nicht importierbar.
- **Eine geerbte Ausfallursache.** Die Suite-`compose.yaml` trägt
  `depends_on: clamav / condition: service_healthy`. Ein nicht healthy werdendes ClamAV hält die
  ganze Suite an — lagerbuch ist heute ein einzelner Container ohne jedes `depends_on`
  (`compose.yaml:1-27`).
- **Der Release-Kanal verschwindet, nicht nur die Rollback-Körnung.** Heute trennt lagerbuch zwei
  Kanäle: `IMAGE_TAG=edge` für Staging, `IMAGE_TAG=vX.Y.Z` für Prod (`deployment.md:29`,
  `stack.env.example:2` — „Prod: vX.Y.Z (tagged releases only)"), verbraucht in `compose.yaml:3`
  (`image: ghcr.io/rubenvitt/lagerbuch:${IMAGE_TAG:-edge}`), erzeugt vom Tag-Auslöser `ci.yaml:6`
  plus `type=semver` / `type=raw,value=latest` (`ci.yaml:78-79`). Im Ziel fehlt **beides**: die
  Suite-CI hat keinen Tag-Auslöser (`ci.yml:3-7`) und kein `type=semver` (`ci.yml:145-148`, `latest`
  hängt dort an `enable={{is_default_branch}}`), und `iuk-suite/compose.yaml:3` schreibt
  `image: ghcr.io/rubenvitt/iuk-suite:latest` **fest**. Drei Folgen: (1) wer nach dem Cutover
  `deployment.md` folgt, pinnt einen Tag ohne Erzeuger; (2) „Prod" und „jeder main-Push" werden
  dasselbe Image; (3) ein Rückzug ist kein `stack.env`-Eintrag mehr, sondern eine Änderung an einer
  versionierten Datei. Der Verbraucher ist billig zu heilen und hat Präzedenz **in derselben Datei**:
  `iuk-suite/compose.yaml:102` führt das ClamAV-Image bereits als
  `${SUITE_CLAMAV_IMAGE:-clamav/clamav:1.4}`, mitsamt Kommentar (`:94-101`), warum der Doppelpunkt in
  `:-` tragend ist. Der Erzeuger ist das eigentliche Loch. Unabhängig davon bleibt die Körnung grob:
  ein Rückzug nimmt portal, qr, feedback und files mit, oder man wählt den Teilrückzug
  (`SUITE_HOST_LAGERBUCH` leeren, Host aus `SUITE_TRAEFIK_RULE`, `up -d`) — der nimmt die Domain
  vollständig vom Netz, statt eine ältere lagerbuch-Version auszuliefern. Was bleibt, ist der
  Commit-Tag (`ci.yml:146`, `type=sha`) — er wird weiter erzeugt, ist aber ohne Variable in
  `compose.yaml` nur über eine Änderung an der versionierten Datei erreichbar.

### 3.3 Was `requiresAuth` betrifft

`lagerbuch` **muss** `requiresAuth: false` bekommen. Sonst schickt `decideRoute` (`routing.ts:71-73`)
jeden anonymen Aufruf in den Login — und das trifft genau die Pfade, an denen gedruckte Etiketten
hängen: `/t/<code>` ist der einzige Weg in die Helfer-Sitzung und wird ohne jede Sitzung aufgerufen
(`src/app/t/[code]/route.ts:11`), `/g/<code>` entscheidet seine Rolle selbst
(`src/app/g/[code]/page.tsx:21-26`), und die Gate-Wurzel `/` ist der Einstieg beider. `/a/:path*` steht
dagegen in lagerbuchs eigenem Matcher und ist modulintern geschützt.

**Die Folge, die man mitdenken muss:** `canAccess` steigt bei `!requiresAuth` früh mit `true` aus und
liest `requiredGroups` dann **nie** (`core/registry.ts:150-160`). Der Verwaltungsriegel muss also
modulintern nachgezogen werden — genau die Konstellation, für die `feedback` und `files` ihre
Backstops haben.

### 3.4 Die CI ist nicht dieselbe

Zwei Dateien, verwechselbar benannt: lagerbuch hat `.github/workflows/ci.yaml`, die Suite
`iuk-suite/.github/workflows/ci.yml`. Beide heißen `name: CI`, beide fahren
`lint → typecheck → test → e2e` (lagerbuch in zwei Jobs, `ci.yaml:17-53`; die Suite in einem,
`ci.yml:14-30`). Ab dem Bauen laufen sie auseinander.

| Bein | lagerbuch `ci.yaml` | Suite `iuk-suite/.github/workflows/ci.yml` | Folge für den Umzug |
|---|---|---|---|
| Auslöser | `push` auf `main` **und** `tags: ["v*"]` (`:5-6`) | nur `push` auf `main` + PR (`:3-7`) | Für Release-Tags gibt es im Ziel **keinen Erzeuger** |
| Tagschema | `type=edge,branch=main` · `type=sha,prefix=sha-` · `type=semver,pattern=v{{version}}` · `latest` nur auf `refs/tags/v` (`:76-79`) | `type=sha` · `type=ref,event=branch` · `latest` per `enable={{is_default_branch}}` (`:145-148`) | `edge` und `vX.Y.Z` haben keine Entsprechung; `latest` wechselt die Bedeutung von „letztes Release" zu „letzter main-Push" |
| Build-Arg | `NEXT_DEPLOYMENT_ID=${{ github.sha }}` (`:87-88`) | **keines** — weder im lokalen Build (`:70-80`) noch im Push-Schritt (`:95-103`) | Entscheidung 23, Falle 52, Falle 64 |
| Plattformen | ein Job, QEMU (`:64`), `platforms: linux/amd64,linux/arm64` (`:83`) | Matrix auf **nativen** Runnern je Architektur (`:37-47`), Push per Digest (`:92-116`), Manifest-Merge (`:120-161`) | Die Suite-Bauform gilt; die lagerbuch-Datei ist Merkliste, nicht Vorlage |
| Container-Probe | `docker build -t lagerbuch:ci .` (`:52-53`) — **nur Bau**, kein Start | `load: true` + `docker run` + Health mit `Host:`-Header, 20 Versuche, `docker logs` (`:81-91`), auf PRs **und** main | Gewinn |
| Manifest-Prüfung | keine | `imagetools inspect` + `grep -q '^linux/amd64$'` / `arm64` (`:155-161`) | Gewinn |
| Migrations-Gate | keines | `iuk-suite/src/core/bootstrap.test.ts:82-108` unter `pnpm test` (`ci.yml:28`): jedes Modul mit `_db/` steht in `MODULE_MIGRATIONS`, jeder Ordner hat ein `meta/_journal.json`, **und jeder hat eine `COPY`-Zeile im Dockerfile** | Gewinn, und der wichtigste: das dritte Bein des „Dreiecks" aus `iuk-suite/CLAUDE.md` ist im Ziel CI-bewacht. lagerbuch hat dafür nichts |
| Node / pnpm | Node 24 (`:24`, `:38`), pnpm ungepinnt (`:21`), `packageManager: pnpm@11.10.0` | Node 22 (`:23`), pnpm **11.0.9** gepinnt (`:18-20`), `packageManager: pnpm@11.0.9`, Laufzeit-Image `node:26-alpine` (`iuk-suite/Dockerfile:1-8`) | Der Lockfile wird beim Umzug von pnpm 11.0.9 neu geschrieben; die Suite hält Image- und CI-Node bewusst auseinander (Falle 65) |

**Was lagerbuchs CI leistet, das die Suite heute nicht leistet — genau zweierlei:** das SHA-Build-Arg
und den Release-Kanal (Tag-Auslöser plus `type=semver`). In jedem anderen Bein — Container wirklich
starten, beide Architekturen im Manifest nachweisen, das Modul-Dreieck koppeln — ist die Suite-CI
strenger. Der Umzug **gewinnt** an dieser Naht mehr, als er verliert; er verliert aber an zwei
benennbaren Stellen, und beide sind Betriebszusagen, keine Bequemlichkeiten.

**Was aus der QEMU-Umstellung folgt.** `ci.yaml:85-86` begründet das Build-Arg mit „Gleicher Wert für
beide Architekturen → identische Asset-URLs". Unter einem Job mit `platforms: a,b` ist das trivial
wahr. Die Suite hat genau diese Bauform im Juli abgeräumt, weil der emulierte arm64-Build
„>2,5 h ohne fertig zu werden" lief, während amd64 49 s brauchte (`ci.yml:32-36`). **Die dort
genannte Ursache — better-sqlite3 werde emuliert aus der Quelle kompiliert — ist an den Job-Logs
widerlegt** (siehe den entlastenden Befund zu musl in Abschnitt 5); die *Abhilfe* bleibt richtig.
Praktisch heißt das: die lagerbuch-CI-Datei liefert für den Umzug genau eine Zeile Inhalt (das
Build-Arg), und die muss in die Suite-Bauform übersetzt werden, nicht kopiert — siehe Falle 64.

---

## 4. 1:1-Pflichten — die Tabelle, an der der Cutover hängt

**Vorbemerkung, die für jede Zeile gilt:** diese Pflichten sind aus **Code** belegt, nicht an
Produktionsdaten gemessen. Jede Aussage über vorhandene Codes, Etiketten, Zeilen oder Werte ist damit
eine **Anforderung an den Port**, keine Messung.

### 4.1 Die gedruckten Etiketten — zuerst, weil sie physisch sind

**Das Token-Kärtchen trägt zwei Verträge mit unterschiedlicher Host-Abhängigkeit.**
`src/db/etiketten.ts:23` erzeugt den QR-Inhalt als `${base}/t/${t.code}` mit
`base = config.appBaseUrl.replace(/\/$/, "")` (`:15`) — host-gebunden, absolut, ohne relativen Zweig.
Derselbe Bogen druckt daneben den **Klartext-Code** als `etikett-sub`
(`EtikettenBogen.tsx:38` übergibt `t.code` als `sub`), und der Klartextweg über das Gate
(`src/components/Gate.tsx:40`, `src/app/(gate)/actions.ts:20`, `src/actions/token-redeem.ts:14`)
braucht **nirgends** einen Host.

**Das Artikel-Regaletikett trägt nur den QR.** `etiketten.ts:19-20` liefert
`{ id, name, fach, url, qr }`, gerendert als Titel = `name`, Sub = `fach`
(`EtikettenBogen.tsx:37`) — **kein abtippbarer Identifikator**. `EtikettenBogen` bekommt `url` nicht
einmal als Prop (`:5-6`); die URL existiert auf dem Papier ausschließlich als Pixelmuster.

**Damit ist die Antwort auf „was kostet eine Nicht-Übernahme der Domain" asymmetrisch:**
Zugangs-Codes bleiben per Tastatur benutzbar, **Artikel-Regaletiketten sind vollständig wertlos** —
und ihr Ausfall ist zusätzlich still (`src/app/a/[artikelId]/page.tsx:22-23` macht bei `null` einen
`redirect("/helfer")`, keine Meldung, kein 404).

### 4.2 Die Ausgabeformate — fünf Wege, drei unbeschriebene Verträge

**Gesucht wurde repoweit nach jedem Weg, auf dem Daten das Modul verlassen.** Abgesucht:
`window.print`, `@media print`, `new Blob`, `URL.createObjectURL`, `a.download`,
`navigator.clipboard`, `navigator.share`, `document.execCommand`, `toDataURL`,
`Content-Disposition`, `mailto:`, `nodemailer`/`sendMail`, `fetch` gegen einen fremden Host,
`writeFileSync`/`createWriteStream` sowie alle `route.ts` unter `src/`. **Ohne Treffer** blieben
`navigator.share`, `execCommand`, `mailto:`, jeder Mailversand und jeder ausgehende `fetch` — das
Modul verschickt nichts und ruft kein fremdes System. `route.ts` liefert repoweit **vier** Dateien
(`manifest.webmanifest`, `t/[code]`, `api/health`, `api/auth/[...nextauth]`), ein `scripts/`-
Verzeichnis gibt es nicht. Übrig bleiben fünf Wege, von denen drei bisher unbeschrieben waren.

**Der Etikettenbogen** ist bereits als 4.1 und 1:1-Pflicht 22 erfasst; der Datenbank-Snapshot
(`lagerbuch-YYYYMMDD.db`, `src/db/backup.ts:8-9,24-27`) als Falle 53 und Entscheidung 22. Beide
werden hier nicht wiederholt.

**Drei Wege sind Liefergegenstände, die das Dokument bisher nicht als solche geführt hat** — und
zwei davon sitzen als zwei Knöpfe nebeneinander auf **einem** Bildschirm
(`src/app/verwaltung/(admin)/bestellung/BestellListe.tsx:40-41`), liefern aber **nicht dieselben
Zeilen**.

**Erstens: `bestellvorschlag.csv`.** `downloadCsv()` (`BestellListe.tsx:28-35`) baut die Datei im
Browser und lädt sie über einen Blob-Link herunter (`:31-34`). Der Vertrag im Einzelnen:

- **Sechs Spalten, deutsche Köpfe, in dieser Reihenfolge:** `Artikel`, `Bestand`,
  `Mindestbestand`, `Vorschlag`, `Einheit`, `Status` (`:29`).
- **Trennzeichen ist das Semikolon**, nicht das Komma (`:29-30`, beide `join(";")`).
- **Jede Zelle ist gequotet**, enthaltene Anführungszeichen werden verdoppelt (`csvCell`, `:8`) —
  auch die Zahlenspalten.
- **`Status` ist ein Literalpaar:** `"bestellt"` bzw. `"offen"` (`:30`).
- **Zeilentrenner ist `\n`**, nicht CRLF, und die Datei trägt **kein UTF-8-BOM** — der MIME-Typ
  nennt zwar `charset=utf-8` (`:31`), aber der ist nur am Blob, nicht in den Bytes.
- **Dateiname ist konstant `bestellvorschlag.csv`** (`:33`), ohne Datum — anders als beim
  Excel-Export kollidieren wiederholte Downloads im Download-Ordner.
- **Exportiert werden alle Zeilen**, auch die bereits als bestellt markierten (`:30`, kein Filter).

**Zweitens: die Zwischenablage.** `copyList()` (`:24-27`) schreibt über `navigator.clipboard`
einen reinen Text: je Zeile `${vorschlag} × ${name}`, verbunden mit `\n` (`:25`). Drei Details sind
Vertrag: das Trennzeichen ist das **Multiplikationszeichen U+00D7**, nicht ein ASCII-`x`; es werden
**nur die noch nicht bestellten** Zeilen kopiert (`:25`, `filter((z) => !z.bestellt)`) — also ein
**anderer Zeilenumfang als in der CSV**; und die Rückmeldungen lauten `"Bestellliste kopiert"` bzw.
`"Kopieren fehlgeschlagen"` (`:26`). Dass zwei Knöpfe nebeneinander verschieden viele Zeilen
ausgeben, ist heute nirgends dokumentiert und beim Neubau die naheliegendste stille
Vereinheitlichung.

**Drittens: `bestand-YYYY-MM-DD.xlsx`.** Bisher steht `write-excel-file` nur als fehlende
Abhängigkeit in Abschnitt 3.2 und Falle 58. Der Export ist aber ein Liefergegenstand mit eigenem
Format:

- **Neun Spalten mit deutschen Überschriften**, in dieser Reihenfolge: `Artikel`, `Fach`,
  `Bestand`, `Einheit`, `Mindestbestand`, `Status`, `Nächste Charge`, `Verfall`, `Hinweis`
  (`ArtikelTable.tsx:89-99`) — nebst festen Spaltenbreiten (34/12/10/10/16/22/18/11/20) und
  fett gesetzter Kopfzeile (`:136`).
- **Blattname `"Bestand Handlager"`**, erste Zeile fixiert (`stickyRowsCount: 1`) (`:140-141`).
- **`Bestand` und `Mindestbestand` sind typisiert als `Number`, alle übrigen als `String`** (`:138`).
- **Drei Status-Literale:** `"inaktiv"` (inaktiv schlägt alles), sonst `"unter Mindestbestand"`,
  sonst `"ok"` (`src/lib/bestand-export.ts:34-38`).
- **Leere Werte sind Leerstrings, nicht `"–"`** — ausdrücklich, damit Excel-Filter nicht stolpern
  (`bestand-export.ts:48-51`).
- **Dateiname `bestand-YYYY-MM-DD.xlsx`** aus **lokaler** Zeit (`bestand-export.ts:55-57`; zur
  Zeitzonenwirkung siehe Falle 2).

**Der Dateiname ist zweifach festgenagelt**, was ihn zur härtesten Zusicherung des ganzen Exports
macht: `src/lib/bestand-export.test.ts:44` prüft den exakten String `bestand-2026-07-05.xlsx`,
`e2e/bestand-export.spec.ts:18` prüft `download.suggestedFilename()` gegen
`/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/`, und `:20-24` prüft zusätzlich, dass wirklich ein
ZIP-Container ankommt (Magic `PK`) — also eine echte xlsx, kein umbenanntes CSV. **Die E2E prüft
dabei nur die Form, nie den Wert**, und `bestand-export.test.ts:44` konstruiert das Datum aus
lokalen Komponenten und liest es über lokale Getter zurück — beide Ebenen laufen unter jeder
Zeitzone grün (Falle 2).

**Zwei Eigenschaften des Excel-Exports sind Neubau-relevant, nicht Format-relevant.**

*Die Bibliothek wird erst beim Klick nachgeladen.* `await import("write-excel-file/browser")` steht
in `ArtikelTable.tsx:132` — der Kommentar in `bestand-export.ts:3-7` erklärt die Absicht („der
Client lädt die Bibliothek erst beim Klick"), der Code dazu steht in der Komponente. Für den
RSC-Neubau ist das keine Zeile in `package.json`, sondern die Frage, **welche Client-Insel den Knopf
trägt**: der Export braucht einen Client-Handler, einen `useTransition`-Zustand und einen
Fehlerpfad (`:129-146`, Fehlertext `"Excel-Datei konnte nicht erzeugt werden – bitte erneut
versuchen."` bei `:144`). Ein rein serverseitiger Export wäre ein anderes Produkt — er könnte den
Dateinamen aus Serverzeit bilden und den Filterzustand nicht kennen.

*Der Export exportiert die gefilterte Ansicht, nicht die Tabelle.* `bestandExportZeilen(gefiltert)`
(`:133`) — also das Ergebnis von Suche, den drei Filter-Chips und der gewählten Sortierung
(`:112-123`). Der Knopftitel sagt es zu („mit der aktuell angezeigten Liste", `:164`). Das ist die
schärfste Folge für den Neubau: sobald die Artikelliste serverseitig paginiert oder gefiltert wird,
ändert sich stillschweigend, was „Excel-Liste" bedeutet — aus „alles, was ich gerade sehe" wird „die
erste Seite". Der Knopf ist zusätzlich deaktiviert, solange `rows.length === 0` (`:163`).

**Ein vierter Weg ist kein Ausgabe-, sondern ein Eingabevertrag — und wird leicht verwechselt.**
Der CSV-**Import** erwartet fünf kleingeschriebene Spalten
(`HEADER = "name,einheit,fach,mindestbestand,startbestand"`, `src/lib/csv.ts:3`), rät das
Trennzeichen je Zeile (`;` falls vorhanden, sonst `,` — `:15-18`) und zerlegt per
`line.split(delimiter)` **ohne jede Quote-Behandlung**. Die exportierte `bestellvorschlag.csv` ist
damit weder in den Spalten noch in der Quotierung wieder einlesbar; ein BOM aus Excel würde
zusätzlich die Kopfzeilenerkennung (`:25-28`) verfehlen und die Kopfzeile als Datenzeile ablehnen.
Export und Import sind zwei getrennte Formate — wer sie beim Port angleicht, ändert beide.

### 4.3 Die Tabelle

| # | Artefakt | Wert / Regel | Bricht sonst | Beleg |
|---|---|---|---|---|
| 1 | **Die öffentliche Domain** | heutiger Wert von `APP_BASE_URL` wird `SUITE_HOST_LAGERBUCH`, dazu die Traefik-Regel | jeder gedruckte QR zeigt auf einen Host, der nicht mehr antwortet — die Systemkamera öffnet ihn trotzdem, die Helferin sieht einen Browserfehler ohne Erklärung | `src/db/etiketten.ts:15,19,23`, `src/lib/config.ts:33`, `compose.yaml:11` |
| 2 | **Pfadpräfixe `/a`, `/g`, `/t`** | unverändert an der **Wurzel** des Modul-Hosts, ein Segment, kein Präfix | ein zusätzliches Präfix (`/lagerbuch/a/…`) macht jeden gedruckten QR sofort ungültig; der Host-Rewrite hält die öffentliche Form konstant, aber nur wenn niemand sie zusätzlich verschiebt | `src/app/a/[artikelId]/page.tsx`, `src/app/g/[code]/page.tsx`, `src/app/t/[code]/route.ts`, `core/routing.ts:78` |
| 3 | **`artikel.id`** | `nanoid()` — 21 Zeichen, Alphabet `A-Za-z0-9_-`, **enthält `-` und `_`**, case-sensitive | eine ID-Neuvergabe beim Import entwertet jedes Regaletikett; ein Validator `/^[a-z0-9]+$/` gibt für rund jeden 32. Zeichenplatz ein stilles 404 | `src/db/schema.ts:2,4`, `src/actions/artikel.ts:19`, `src/db/etiketten.ts:19` |
| 4 | **`tokens.code`** | sechs Ziffern als `NNN-NNN`, **einschließlich Bindestrich**; Alphabet `0123456789`, Länge 6 | der Code ist (a) QR-Nutzlast, (b) Gate-Eingabe, (c) Anzeigeschlüssel im Journal. Die Suche ist exakt (`eq(tokens.code, norm)`) — `/t/482137` ohne Bindestrich löst **nicht** auf | `src/actions/tokens.ts:10,15`, `src/actions/token-redeem.ts:13-14`, `src/db/schema.ts:134`, `src/components/Gate.tsx:40` |
| 5 | **`tokens`: der ganze Zeilenzustand** | `aktiv`, `last_used_at`, `label`, `ziel_typ`, `ziel_id`, `scope_lagerort_id`, `id` | `aktiv` ist der einzige Widerruf, den es gibt — ein Import, der alles als aktiv anlegt, reaktiviert stillschweigend jeden gesperrten Code, und zwar genau die, die gesperrt wurden, weil ein Etikett verschwunden ist. `ziel_typ`/`ziel_id` steuern, wohin ein Scan springt. `tokens.id` steckt im jose-Cookie — bei geänderten IDs laufen alle Feld-Sitzungen in „Token gesperrt" | `src/db/schema.ts:132-147`, `src/actions/session.ts:25-26`, `src/lib/auth/tokenZiel.ts:10`, `implementierungsplan.md:181` |
| 6 | **`quelle_typ`/`quelle_id`** | bei `token` der **Code-Klartext**, bei `oidc` der Pocket-ID-`sub` — in **drei** Tabellen, nicht einer: `buchungen`, `checks`, `lagerort_verfall` (dazu `tokens.created_by`) | die Anzeige löst über `tokens.code → label` bzw. `users.id → name` auf und fällt still auf die rohe ID zurück. Ein umkodierter Code macht das gesamte historische Journal namenlos — und die Trigger aus `0001` decken **nur** `buchungen` ab, `checks` und `lagerort_verfall` wären nachträglich änderbar | `src/actions/buchung.ts:87`, `src/actions/check.ts:85,142,165`, `src/db/quelle.ts:12-25`, `src/db/schema.ts:99-100,152-153,82-83` |
| 7 | **Zeitstempel-Einheit** | UNIX-**Sekunden** in allen `integer(…, {mode:"timestamp"})`-Spalten — Quelle und Ziel identisch (beide `drizzle-orm` ^0.45.2 / `better-sqlite3` ^12.11.1) | **Ausdrücklich als Nicht-Falle notiert:** eine „vorsichtige" Multiplikation mit 1000 beim Import wäre paritätsgrün (beide Arme laufen durch dieselbe Umrechnung) und datierte das ganze Journal um Jahrtausende um | `src/db/schema.ts:93` u. a. 13 Spalten, empirisch verifiziert; `package.json` beider Repos |
| 8 | **Append-only-Trigger** | `buchungen_no_update` und `buchungen_no_delete` als **handgeschriebene Migration**, plus `src/db/append-only.test.ts` als Wächter | ein aus `schema.ts` neu generiertes Migrationsverzeichnis enthält sie nicht. Die Datenbank verhält sich identisch, bis irgendein Code `UPDATE buchungen` fährt — dann ist der Audit-Trail still weg. Der Test muss so mitportiert werden, dass die Test-DB die **SQL-Migrationen abspielt** statt das Schema zu pushen | `drizzle/0001_append_only.sql:1-11`, `src/db/schema.ts:89-109`, `src/db/append-only.test.ts:25-37`, `src/db/testing.ts:6-11` |
| 9 | **`drizzle/meta/_journal.json`** | die sieben `when`-Werte (1783690310333 … 1785256324320) **plus** der unveränderte SQL-Inhalt — falls die Produktionsdatei kopiert statt zeilenweise importiert wird | der Migrator vergleicht ausschließlich `created_at` der letzten `__drizzle_migrations`-Zeile gegen `folderMillis` und liest den gespeicherten Hash **nie** zurück. Zwei Folgen: neu gestempelte Migrationen gegen eine gefüllte DB lösen ein Voll-Replay aus (Startabbruch, Daten unversehrt dank BEGIN/ROLLBACK) — und eine **inhaltlich geänderte** `.sql` bei gleichbleibendem `when` bleibt still: Produktion und frische Dev-/E2E-DB divergieren, beide grün | `drizzle-orm/sqlite-core/dialect.cjs:673,679,686`, `drizzle-orm/migrator.cjs:56` |
| 10 | **`HANDLAGER_ID = "handlager"`** | fester Primärschlüssel in `lagerorte`, **keine** nanoid | 75 Fundstellen unter `src/`. Jede Entnahme, Inventurkorrektur, Aussonderung, Nachfüllung und Bestandsabfrage bucht oder liest gegen genau diese ID; `foreign_keys = ON` macht daraus keinen Schönheitsfehler, sondern einen harten FK-Fehler bei der ersten Entnahme. Zusätzlich verliert `loeschen.ts:67` seinen Schutz vor dem Löschen des Handlagers | `src/db/seed-handlager.ts:4`, `src/instrumentation.ts:8`, `src/actions/buchung.ts:40,61,67`, `src/actions/inventur.ts:29,44`, `src/db/queries.ts:28,53,67` |
| 11 | **Sentinel `"2099-12"`** und die drei `chargenNr`-Literale | `"ohne Verfall"` (CSV-Import), `"Korrektur"`, `"Inventur"` | „2099-12" kodiert „kein Verfall" (`verfallStatus` liefert dafür grün). Wird der Sentinel geändert oder auf NULL umgestellt, kippen Verfall-Ampel, Verfall-Liste und die FEFO-Sortierung (`fefo.ts:10` sortiert per `localeCompare` über den String) für jede so angelegte Charge. Die drei Texte stehen in den Produktionsdaten und sind in der Verwaltung sichtbar | `src/actions/csv.ts:31`, `src/db/korrektur.ts:33`, `src/actions/inventur.ts:42`, `implementierungsplan.md:200` |
| 12 | **`referenz`-Präfixe** | `check:<id>`, `inventur:<id>`, `entnahme-ziel:<lagerortId>` | einzige Verbindung zwischen Journalzeile und auslösendem Vorgang — es gibt keinen Fremdschlüssel auf `checks`. Historische Zeilen tragen sie bereits | `src/actions/check.ts:86`, `src/actions/inventur.ts:23`, `src/actions/buchung.ts:67` |
| 13 | **`checks.ergebnis` — beide JSON-Formate** | Array = alt, Objekt = neu mit `positionen`/`artikel`/`geraete`/`flaschen`/`verfall`; beide Leser müssen beide können | fällt der Altformat-Zweig weg, zeigen alte Checks leere Detaillisten; ändern sich Feldnamen im neuen Format, wird jede historische Auswertung stumm 0. Beide Leser überbrücken gelöschte Artikel/Geräte/Flaschen tolerant („(gelöschter Artikel)") | `src/actions/check.ts:167`, `src/db/queries.ts:366-381,431-434`, `src/db/schema.ts:156` |
| 14 | **Die Zustands-Literale** | `"In Ordnung"`, `"Gebrauchsspuren"`, `"Defekt"` — deutsche Klartextwerte ohne Enum, ohne DB-Constraint | `"Defekt"` ist der Vertrag der serverseitigen Auswertung an drei Stellen. Historische `ergebnis`-Zeilen tragen das Literal bereits; es ist auch künftig nicht frei umbenennbar, ohne die Auswertung der Altdaten zu verlieren | `CheckFlow.tsx:22`, `src/actions/check.ts:35,129`, `src/db/queries.ts:379,499`, `src/db/schema.ts:156` |
| 15 | **Buchungstypen** | `zugang \| entnahme \| korrektur \| umlagerung` | `umlagerung` fehlt im Implementierungsplan (dort nur drei Typen) und ist trotzdem tragend: beide Legs einer Verschiebung tragen ihn, damit Bestellvorschlag und Reporting eine interne Verschiebung nicht als Wareneingang/Verbrauch missdeuten. Ein Enum-Entwurf „nach Plan" verliert ihn — und mit ihm die Netto-Null-Eigenschaft jeder Umlagerung | `src/db/schema.ts:94`, `src/db/umlagerung.ts:8-9`, `src/lib/format.ts:67-72`, `implementierungsplan.md:120` |
| 16 | **`bz_kontrollen.ref_snapshot`** | roher JSON-String, **nicht** re-serialisieren | friert Streifen-Lot und beide Referenzbereiche zum Messzeitpunkt ein und ist der einzige Grund, warum eine alte Kontrolle nachträglich noch bewertbar bleibt, nachdem das Gerät umkonfiguriert wurde. Ein Import, der ihn parst und neu serialisiert (Schlüsselreihenfolge, Zahlenformat), verändert einen Nachweis | `src/actions/bz.ts:115-123`, `src/db/schema.ts:212-213` |
| 17 | **`geraete.barcode` / `bz_geraete.barcode`** | byte-exakt, ohne Bereinigung; Kreuz-Eindeutigkeit über **beide** Tabellen | die Werte stehen am **Gerät**, oft vom Hersteller gedruckt (`POSSIBLE_FORMATS` enthält EAN_13, EAN_8, ITF). Der Abgleich ist binär (`eq(...)`, Spalten ohne `COLLATE`). Beide Tabellen haben je einen eigenen `UNIQUE`-Index, aber die tabellenübergreifende Eindeutigkeit lebt **nur** in `pruefeBarcodeFrei` — ein Import daran vorbei lässt `/g/<code>` still das falsche Gerät zeigen (Auflösung „erst `geraete`, dann `bz_geraete`") | `src/db/barcode.ts:5-27`, `src/db/schema.ts:174,263`, `drizzle/0005_geraete.sql:16`, `drizzle/0002_bz_sauerstoff.sql:18`, `src/app/g/[code]/page.tsx:29-33`, `src/components/BarcodeScanner.tsx:72-78` |
| 18 | **Textdatumsfelder** | `chargen.verfall`, `lagerort_verfall.verfall`, `bz_kontrollen.kompresse_verfall` als `"YYYY-MM"`; `geraete.mtk_faellig`, `geraete.ablaufdatum` als `"YYYY-MM-DD"` | das sind TEXT-Spalten. Ein Paritätscheck vergleicht sie zeichenweise und ist hier trivial grün — während genau hier die Prozess-Zeitzone hineinwirkt (die daraus abgeleitete Ampel ist **nicht** 1:1) | `src/db/schema.ts:61,80,206,268,271`, `src/lib/domain/verfall.ts:10`, `src/lib/domain/geraet.ts:21,37` |
| 19 | **`HELFER_SESSION_SECRET` und der Cookie-Name `helfer_session`** | falls im Feld befindliche Sitzungen den Cutover überleben sollen | das Cookie ist ein HS256-JWT über diesem Schlüssel; ein neuer Wert (oder ein Modulpräfix im Namen nach Hausstil `files_s_`/`feedback-`) lässt `jwtVerify` für jedes bestehende Cookie fehlschlagen. Wer am Cutover-Abend mitten in einem Fahrzeug-Check steht, verliert die eingegebenen Zählwerte — die stehen bis `checkAbschluss` ausschließlich im Client-State. Der Schaden ist durch die 12 h Cookie-Laufzeit begrenzt; die Codes selbst liegen in der DB und funktionieren weiter | `src/lib/auth/helferSession.ts:4,8,10-16,31-33`, `src/lib/config.ts:39,42`, `src/app/helfer/actions.ts:7` |
| 20 | **`users.id` = Pocket-ID-`sub`** | dieselbe Kennung wie `journal.quelle_id` bei `quelle_typ='oidc'` und `tokens.created_by` | das Journal löst darüber die Klarnamen auf und fällt bei fehlendem Eintrag still auf die rohe ID zurück (`quelle.ts:24`, `?? quelleId`). Beide Anwendungen setzen heute nachweislich `sub` — das muss beim Port nur so bleiben. **Vorbehalt:** ob Pocket ID unter der Suite-Client-Registrierung denselben `sub` liefert (public statt pairwise subject identifiers), sagt kein Repo | `src/lib/auth/konto.ts:19-26`, `src/auth.config.ts:85,94,107,116`, `src/db/quelle.ts:12-25`, `core/auth/config.ts:143-145,171-172` |
| 21 | **Die beiden Absendekonventionen** | Check sendet **alle** Positionen mit Default = Soll; Inventur sendet **nur** angefasste | beide Regeln existieren ausschließlich in Client-Code und haben keinen serverseitigen Gegenpart. Werden sie beim antd-Neubau vertauscht oder vereinheitlicht, schreibt entweder jeder Check unbeabsichtigte Korrekturen (Fahrzeugbestand auf Soll bzw. auf 0) oder jede Inventur macht parallele Entnahmen still rückgängig — in ein Journal, das keine Korrektur durch Löschen kennt | `CheckFlow.tsx:94-97,146`, `InventurForm.tsx:21-25`, `src/actions/check.test.ts:63-71` |
| 22 | **Etikettengeometrie** | `48.5mm × 25.4mm` je Etikett, QR-Bild `20mm × 20mm`, `@page{margin:8mm}`, im **Druck** `gap:0` (auf dem Bildschirm 2mm), abgewählte Etiketten `display:none` statt ausgeblasst | das Maß ist auf gekaufte Standard-Klebeetikettenbögen abgestimmt; jeder Fehlversuch verbraucht ein Blatt, und der Fehler zeigt sich erst am Drucker. Besonders heikel ist der `gap`-Unterschied zwischen Bildschirm und Druck: wer nur die Bildschirmansicht portiert, übernimmt das falsche Raster | `src/app/globals.css:265-283`, `EtikettenBogen.tsx:18-24,34`, `implementierungsplan.md:236` |
| 23 | **Die zwölf Farbwerte** | identisch mit `core/theme/tokens.ts:14-25` — nicht umrechnen, nur umleiten | technisch bricht nichts; aber die Übereinstimmung ist heute exakt, und jede stille Verschiebung (etwa `--linie` → antds `colorBorder`) macht aus einem kostenlosen Übertrag eine sichtbare Änderung. `#c8000f` ist das Rot der Organisation und steht außerhalb des Codes auch auf Fahrzeugen | `src/app/globals.css:4-15`, `core/theme/tokens.ts:14-25` |
| 24 | **PWA-Manifest** | `theme_color: "#C8000F"`, `background_color: "#EEF0F1"`, `display: "standalone"`, `start_url: "/"`, vier Icon-Pfade; die Route `/manifest.webmanifest` selbst | auf jedem Helfer-Handy, auf dem lagerbuch auf dem Startbildschirm liegt, bestimmen diese Werte Symbol, Splash-Farbe und Startziel. Sie werden beim Installieren eingebrannt; installierte PWAs fragen die Manifest-URL periodisch neu ab. **`start_url: "/"` bleibt richtig** — der Browser sieht den externen Modul-Host, der Rewrite ist serverintern unsichtbar (`docs/spikes/2026-07-19-qr-offline-pwa.md:20-24`, umgesetzt in `m/qr/manifest.webmanifest/route.ts:10-11`) | `src/app/manifest.webmanifest/route.ts:14-28`, `src/app/layout.tsx:28` |
| 25 | **Der Wortlaut der Ampel-Chips** | `abgelaufen` / `laeuft MM/JJ ab` / `faellig MM/JJ` / `bis MM/JJ`; `MTK ueberfaellig (n T)` / `MTK heute faellig` / `MTK in n T` / `kein MTK-Datum` | diese Texte sind die **textliche Absicherung der Farbe** — der Grund, warum die Chips die Suite-Regel „Bedeutung nie allein über Farbe" heute erfüllen. Wer beim Umbau auf `Tag` den Text kürzt oder durch ein Icon ersetzt, entfernt genau die Schicht, die die nicht-monotone Ampel-Luminanz kompensiert | `src/lib/format.ts:29-34,50-65`, `docs/design/README.md:135-141` |
| 26 | **Die OIDC-Rückleit-URL** | `${APP_BASE_URL}/api/auth/callback/oidc`, beim Pocket-ID-Client registriert | kein gedrucktes Artefakt, aber ein 1:1-Vertrag mit einem **fremden System**: stimmt sie nicht exakt, weist der Provider die Anmeldung ab. Beim Domainwechsel im Pocket-ID-Client nachzuziehen — und `/api/auth` ist zugleich einer der beiden `PASSTHROUGH`-Treffer | `deployment.md:56-58`, `compose.yaml:16`, `core/routing.ts:12` |
| 27 | **Die Wortmarke** | `LAGER` in Tinte + `BUCH` in Rot, Barlow Condensed, `letter-spacing: .07em` | keine technische Abhängigkeit — aber sie steht heute **dreimal als literales JSX** (Gate, Helfer-Rahmen, Verwaltungs-Layout). Wer die drei Stellen beim Neubau unterschiedlich behandelt, erzeugt drei Marken | `src/app/globals.css:118-119,132-133`, `Gate.tsx:27-29`, `HelferFrame.tsx:15`, `src/app/verwaltung/(admin)/layout.tsx:12-14` |
| 28 | **Die drei Ausgabeformate** | `bestellvorschlag.csv`: sechs Köpfe `Artikel;Bestand;Mindestbestand;Vorschlag;Einheit;Status`, **semikolonsepariert**, jede Zelle gequotet, Status `bestellt`/`offen`, `\n` statt CRLF, **kein BOM**, konstanter Dateiname. Zwischenablage: `${vorschlag} × ${name}` je Zeile, `×` = **U+00D7**, **nur unbestellte** Zeilen. `bestand-YYYY-MM-DD.xlsx`: neun Köpfe `Artikel/Fach/Bestand/Einheit/Mindestbestand/Status/Nächste Charge/Verfall/Hinweis`, Blatt `"Bestand Handlager"`, Status-Literale `inaktiv`/`unter Mindestbestand`/`ok`, Zahlspalten als `Number` | drei Formate, die außerhalb des Repos weiterverarbeitet werden — von Hand, in einer Tabellenkalkulation oder in einem Bestellformular. Spaltenreihenfolge, Trennzeichen und Statustexte sind der Vertrag, nicht die Zierde; ein umbenannter Status oder ein Komma statt Semikolon bricht jede Weiterverarbeitung still. Der xlsx-Dateiname ist **doppelt festgenagelt** (Unit-Test exakt, E2E per Regex). **CSV und Zwischenablage liefern unterschiedliche Zeilenmengen** — dieselben zwei Knöpfe, zwei Umfänge; eine Vereinheitlichung beim Neubau ist eine Fachentscheidung, kein Aufräumen. Der Excel-Export gibt die **gefilterte** Ansicht aus: serverseitige Pagination ändert stillschweigend seine Bedeutung | `src/app/verwaltung/(admin)/bestellung/BestellListe.tsx:8,24-27,28-35,40-41`, `src/app/verwaltung/(admin)/artikel/ArtikelTable.tsx:89-99,132-142,163-164`, `src/lib/bestand-export.ts:34-38,48-51,55-57`, `src/lib/bestand-export.test.ts:44`, `e2e/bestand-export.spec.ts:18,20-24` |

---

## 5. Fallen, die kein Gate findet

`pnpm typecheck`, `pnpm lint`, `pnpm build` und Vitest sind für diese Klasse blind — teils
strukturell, teils weil der eigene Client die auslösende Eingabe nie erzeugt.

**Zur Nummerierung:** die Fallen **59–66** sind später ergänzt und stehen am Ende bzw. an der fachlich
passenden Stelle des Unterabschnitts, in den sie gehören (60 und 64 stehen mitten im Abschnitt, weil
sie unmittelbar an eine bestehende Falle anschließen) — 59 bei „Datenmodell und Fachlichkeit", 60 und 61 bei
„Auth und Zugang", 62 und 63 bei „Oberfläche", 64 bis 66 bei „Stack und Betrieb". Die Nummerierung
ist damit Ergänzungs-, nicht Positionsreihenfolge; ein Einschieben in der Mitte hätte jeden
Rückverweis auf 1–58 still verschoben.

### Datenmodell und Fachlichkeit

**1. Der Append-only-Trigger überlebt einen frisch generierten Migrationssatz nicht.**
Er steht ausschließlich in `drizzle/0001_append_only.sql:1-11`, `schema.ts` deklariert ihn nirgends,
und `drizzle-kit generate` erzeugt ihn nicht. Der Hausstil der Suite ist bislang **regenerieren**: alle
vier portierten Module tragen frisch gestempelte, auf `0000` gequetschte Journale. Wer diesen Weg für
lagerbuch geht, bekommt Tabellen und Indizes und kein Wort Trigger — eine Datenbank, die sich exakt
gleich verhält, bis jemand `UPDATE buchungen` fährt. *Kein Gate:* die Suite hat heute **keinen**
Test, der SQLite-Trigger anfasst; TypeScript sieht die Trigger nie (sie stehen in `.sql`), und
`pnpm build` fasst Migrationen überhaupt nicht an. Der einzige Wächter ist
`src/db/append-only.test.ts` — und der greift nur, wenn er mitportiert wird **und** die Test-DB die
Migrationen abspielt.

**2. Die Prozess-Zeitzone: der Schaden liegt in der Anzeige, nicht in der Ampel.**
Gemessen: `docker run --rm node:26-alpine` liefert `UTC`; die Suite setzt `TZ` weder im Dockerfile
(`:23-29`) noch in `compose.yaml:20-39`. **Die naheliegende Sorge ist teilweise falsch und die
Abhilfe billiger als gedacht:** `docker run --rm -e TZ=Europe/Berlin node:26-alpine` liefert
`Europe/Berlin` mit korrektem Offset, obwohl `/usr/share/zoneinfo/Europe/Berlin` im selben Lauf
**nicht** existiert — Node bringt seine Zonendatenbank in der gebündelten ICU mit, `apk add tzdata`
ist überflüssig. Die Suite lädt außerdem eine `env_file` (`compose.yaml:16-19`); eine Zeile
`TZ=Europe/Berlin` genügt ohne Image-Änderung.

Auch die **Richtung** ist anders als vermutet: gemessen ergibt `new Date(2026, 8, 0, 23,59,59,999)`
unter Berlin `2026-08-31T21:59:59.999Z`, unter UTC `2026-08-31T23:59:59.999Z` —
`src/lib/domain/verfall.ts:10` schneidet das Monatsende unter UTC also **später**, nicht früher;
dasselbe für `src/lib/domain/geraet.ts:37` (`startHeute`). Beide Ampelgrenzen wandern in die harmlose
Richtung.

**Was wirklich kaputtgeht, ist `src/lib/format.ts:14`** (`fmtTs`, `getHours()/getMinutes()`): eine
Buchung um 01:30 Ortszeit zeigt das Journal unter UTC als **„02.08. 23:30"** — jede Buchung zwischen
00:00 und 02:00 landet auf dem Vortag. Gleiche Klasse: `src/db/backup.ts:41` (`getHours() >= 2`) feuert
dann um 04:00 Ortszeit, `src/lib/bestand-export.ts:56` kippt den Excel-Dateinamen um 02:00, und
`src/lib/format.ts:21-26` verschiebt die inklusiven Journal-Filtergrenzen.

`config.tz` ist tot: `src/lib/config.ts:35` parst `TZ`, `:73` legt es in `AppConfig` — gelesen wird es
im ganzen Repo nur von `config.test.ts:12`. Die wirksame Zeitzone kommt allein aus der
Prozessumgebung. *Kein Gate:* `lagerbuch/vitest.config.ts:19` nagelt `TZ: "Europe/Berlin"` für alle
Unit-Tests fest, `iuk-suite/vitest.config.ts` hat gar keinen `env`-Block; für `format.ts` existiert
**keine** Testdatei, `fmtTs` ist ungetestet. `src/db/backup.test.ts:6-7` konstruiert Daten aus lokalen
Komponenten und liest sie mit lokalen Gettern zurück — das rundläuft unter jeder Zeitzone grün.

**3. Sekunden-Granularität macht die Journalsortierung innerhalb eines Checks unbestimmt.**
`check.ts` schreibt Abgleich, Umlagerung und Messungen in einem Rutsch mit je eigenem `new Date()`;
weil die Spalte Sekunden speichert, teilen sich alle denselben Wert. `src/db/queries.ts:105-109`
sortiert `orderBy(desc(buchungen.ts))` **ohne Tiebreaker**. *Kein Gate:* ein Drizzle-Implementierungsdetail,
das typecheck als `Date` sieht; sichtbar erst bei zwei Zeilen in derselben Sekunde, was ein Test mit
einer Buchung nie erzeugt.

**4. `BESTELL_FAKTOR` ist eine tote Stellschraube — und der Plan spezifiziert eine andere Formel.**
`grep -rn 'bestellFaktor|BESTELL_FAKTOR' src/` findet ausschließlich `config.ts:12/:38/:76`,
`config.test.ts:15/:23-27` und einen Mock in `bestellung.test.ts:4` — **keinen fachlichen Leser**.
`vorschlagsmenge()` rechnet `Math.max(0, mindestbestand − bestand)`
(`src/lib/domain/vorschlag.ts:7-12`, einziger Aufrufer `queries.ts:520`), und `vorschlag.ts:5-6` trägt
einen ausdrücklichen Kommentar dazu: „Kein Faktor/Puffer — bestellt wird genau die Lücke bis zum
Soll." `implementierungsplan.md:75` und `:202` spezifizieren dagegen
`BESTELL_FAKTOR × Mindestbestand − Bestand`, bei Default 2 also die doppelte Menge. Die Abweichung ist
eine **dokumentierte Entscheidung**, kein Versehen — aber der Plan ist die Quelle, an der sich ein
Neubau natürlich orientiert. *Kein Gate:* ein toter Wert ist typkorrekt und wird sogar von einem
grünen Test berührt (`config.test.ts:23-27` prüft `"3"` → `3`, also dass der Knopf **gelesen** wird,
nicht dass er **wirkt**). Dasselbe Muster bei `config.tz`.

**5. Der Löschpfad: falsche Zählung, tote Spalte, keine Transaktion.**
`pruefeArtikel` (`src/actions/loeschen.ts:54-64`) zählt drei Bindungen — `buchungen`, `chargen`,
`soll_positionen` — und **nicht** `template_positionen.artikelId` (`schema.ts:38`, NOT NULL, FK auf
`artikel.id`, `drizzle/0004_vehicle_templates.sql:16`). Gegen die echten Migrationen reproduziert: ein
Artikel, der nur in einer Fahrzeug-Vorlage steht, meldet `loeschbar: true`, alle drei Zähler stehen auf
0, und `db.delete(artikel)` (`:166`) wirft `FOREIGN KEY constraint failed`.

**Die Folge ist kein 500:** `LoeschDialog.tsx:54-65` fängt die Rejection (`catch` :61-64) und rendert
sie in den Fehlerslot (:151); der Artikel bleibt stehen. In Produktion redigiert Next die
Server-Action-Fehlermeldung, der Nutzer sieht also eine generische Meldung statt der freundlichen
„Noch mit … verknüpft"-Sperrmeldung.

`pruefeFahrzeug` (`:70-77`) hat die schärfere Lücke: es zählt `tokens.scopeLagerortId` — eine Spalte,
die **kein Produktionspfad je schreibt** (Abschnitt 2.4). Der Zähler steht dauerhaft auf 0, während
die lebende Spalte `tokens.zielId` (`schema.ts:141-142`, bewusst ohne FK, polymorph) ungeprüft bleibt.
Ein Fahrzeug ist damit löschbar, obwohl ein laminiertes Kärtchen darin auf seine ID zeigt; der
Ausfall ist stumm (`tokenZiel.ts:10` baut ungeprüft `/helfer/check?fz=<tote-id>`,
`helfer/check/page.tsx:28` verwirft eine unbekannte ID kommentarlos).

Dazu: `loescheElement` (`:161-172`) klammert seine zwei Schritte **nicht** in `db.transaction` — im
Gegensatz zu allen anderen mehrschrittigen Schreibpfaden (`check.ts:81`, `inventur.ts:25`,
`templates.ts:50/86`, `buchung.ts:24`). Erst läuft `loescheVerfallFuer` (ein hartes DELETE,
`lagerort-verfall.ts:73-76`), dann `db.delete(artikel)`. Heute praktisch unerreichbar, weil eine
`lagerort_verfall`-Zeile immer eine Soll-Position voraussetzt und die dann bereits sperrt — beim
Portieren aber mitzunehmen oder in eine Transaktion zu ziehen.

*Kein Gate:* `loeschen.test.ts` deckt Charge, Zugangs-Code, Handlager, BZ-Gerät, O₂-Flasche und
Check-Historie ab (`:38-190`), aber **keinen** Vorlagen-Fall — das Wort `templatePositionen` kommt in
der Datei nicht vor. Schlimmer: `loeschen.test.ts:79` **fabriziert** einen `scopeLagerortId`-Wert, den
die Anwendung nie erzeugt, und bezeugt den Zähler damit als funktionierend.

**6. Deutsche Zustands-Literale über die Client/Server-Grenze.** Siehe 1:1-Pflicht 14. *Kein Gate:*
der Servertyp ist `string`; typecheck ist strukturell außerstande, die Kopplung zu sehen. Der
Eingabe-Wächter `e2e/geraete.spec.ts:66` wählt über
`getByRole("button", { name: "Defekt" })` und überlebt den Umbau auf `Radio.Group`/`Select` mit
Sicherheit nicht. Die **abschließende** Behauptung `:80` ist dagegen
`expect(page.getByText("Defekt")).toBeVisible()` auf der Check-Detailseite und prüft das
**persistierte** Literal über die Serverauswertung hinweg — dieser Teil überlebt, sofern er beim
Anpassen des Specs stehen bleibt.

**7. Zwei Validatoren für dasselbe Monatsfeld.** `src/db/lagerort-verfall.ts:10` definiert
`MONAT_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/` (streng), während der Zugang neuer Chargen
(`src/actions/buchung.ts:17`) und der BZ-Kompressenverfall (`src/actions/bz.ts:83`) mit
`/^\d{4}-\d{2}$/` arbeiten. Nachgestellt: `"2026-00"` passiert den laxen Ausdruck, und
`verfallStatus("2026-00", {kritisch:31, faellig:56}, 2026-08-03)` liefert
`{ampel:"rot", tage:-213, abgelaufen:true}` (Ende = 31.12.2025) — die Charge gilt ab dem Anlegen als
abgelaufen, taucht in der Verfall-Liste als Aufgabe auf und ist per Aussondern-Korrektur ausbuchbar.
`"2026-13"` landet auf dem 31.01.2027. Auf DB-Ebene gibt es keinen CHECK-Constraint
(`drizzle/0000_brief_zodiak.sql:33-40`: schlicht `text NOT NULL`).

*Kein Gate:* beide Regexes sind für sich gültig und getestet; die Inkonsistenz zeigt sich nur beim
Nebeneinanderlegen dreier Dateien. Die einzigen Bremsen vor den laxen Ausdrücken sind heute zwei
`<input type="month">`: `ArtikelDrawer.tsx:307` (Zugang) und `KontrolleForm.tsx:71` (BZ-Kontrolle) —
**genau diese zwei Felder** muss ihr antd-Ersatz mit derselben Strenge ersetzen. Der Check-Verfall
läuft ohnehin über `MONAT_REGEX` (`check.ts:58`).

**8. Übersprungene Check-Schritte sind im Nachweis nicht von bestätigten zu unterscheiden.**
Der Geräte-Schritt ist auf `{ vorhanden: true, zustand: "In Ordnung" }` vorbelegt
(`CheckFlow.tsx:25`), der Sauerstoff-Schritt auf den Nennfülldruck (`:137`), und beim Abschluss werden
ausnahmslos alle Geräte und alle Flaschen des Standorts gesendet (`:147-151`). Der Server schreibt je
Flasche eine Messung in `o2_messungen` (`check.ts:140-143`) und quittiert alle Geräte in
`checks.ergebnis` (`:127-131`). Wer den Schritt durchklickt, erzeugt einen positiven, plausibel
aussehenden Nachweis — fachlich das Gegenteil dessen, wofür eine Quittierung da ist. `o2_messungen`
trägt dabei keinen Trigger; die Append-only-Zusage steht nur als Kommentar
(`sauerstoff.ts:51`), ist also weder erzwungen noch korrigierbar-per-Design. *Kein Gate:* Defaults sind
typkorrekt; `check.test.ts:127-226` übergibt die Werte immer explizit, und ein Zustand „Schritt
übersprungen" existiert im Server-Vertrag nicht. (Die Vorbelegung ist in der Oberfläche wenigstens
ausgeschrieben: `CheckFlow.tsx:325`, `:384`, `:246-249`.)

**9. Die Fahrzeug-Korrektur bucht auf eine geschätzte Charge.** Siehe Abschnitt 2.3. *Kein Gate:*
typecheck, lint und Vitest bleiben grün, wenn jemand das Verfall-Feld im Zähl-Schritt als redundant
streicht — die Fahrzeug-Verfallsampel hängt danach an einer geratenen Charge. Dieser Zusammenhang ist
die eigentliche Begründung dafür, warum der Verfall-Schritt und die Geräte-/Flaschen-Defaults
zusammengehören.

**10. Die Leseseite skaliert mit der Journallänge, nicht mit dem Artikelstamm.**
`artikelListe` (`queries.ts:35-56`) fährt **pro Artikel** eine unbegrenzte Buchungsabfrage (`:40`)
plus `chargenMitRest` (`:28-33`) mit je einer Chargen- und einer Buchungsabfrage — also exakt 3N
Queries, jede über die volle Historie des Artikels. `kennzahlen` (`:128`), `verfallListe` (`:196`),
`fahrzeugUebersicht` (`:272`) und `bestellvorschlag` (`:515`) laden `buchungen` komplett in den Prozess.
Der Schreibpfad ebenso: `fefoAbbuchung` (`abbuchung.ts:36-37`) lädt alle Buchungen des Artikels **ohne
Lagerort-Prädikat** und filtert erst in JS (`:38-41`). Weil nichts je gelöscht wird, wächst das
monoton. Zwei Zwischenstände sind dagegen **nicht** rekonstruierbar: `artikel.bestelltAt` wird bei
jedem Zugang genullt (`buchung.ts:42`), `lagerort_verfall` wird per Upsert überschrieben
(`lagerort-verfall.ts:56-62`) — die alte Angabe ist danach weg. *Kein Gate:* Vitest läuft gegen
`:memory:` mit einstelliger Zeilenzahl, Playwright gegen eine frisch migrierte Wegwerf-DB. Die Kurve
wird erst mit der Produktionsdatenmenge sichtbar, und die steht nicht im Repo.

**11. Kleinere Modell-Unsauberkeiten**, siehe Abschnitt 2.1. *Kein Gate:* alles drei ist gültiges,
laufendes Verhalten — es gibt nichts, was rot werden könnte.

**59. Die Journalsuche ist zweigeteilt — und die beiden Hälften falten Groß-/Kleinschreibung
unterschiedlich.** `journalEintraege` sucht einen Begriff über **zwei** Wege und ODER-verknüpft sie
(`queries.ts:95-102`):

- **Artikelname** in JavaScript: `a.name.toLowerCase().includes(term.toLowerCase())` (`:97`). Der
  gesamte Artikelstamm wird dafür vorab geladen (`:88`) — auch die inaktiven; die Trefferliste geht
  als `inArray(buchungen.artikelId, …)` in die Abfrage (`:101`). `String.prototype.toLowerCase` ist
  Unicode-fähig.
- **Kommentar** in SQL: `LIKE '%…%' ESCAPE '\'` (`:100`), mit vorherigem Escapen von `%`, `_` und `\`
  (`:99`). SQLites eingebautes `LIKE` faltet **nur A–Z**.

**Gemessen** (better-sqlite3 ^12.11.1 aus diesem Repo, `:memory:`, dieselbe Prädikatform):

| Suchbegriff | Artikelname (JS) | Kommentar (SQL `LIKE`) |
|---|---|---|
| `VERBAND` / `verband` | `Verbandpäckchen` | `Verband groß` |
| `PAECK` / `paeck` | `Paeckchen`, `paeckchen` | `Paeckchen`, `paeckchen` |
| `päckchen` / `Päckchen` | `Verbandpäckchen` | `Nachschub Päckchen geliefert` |
| **`PÄCKCHEN`** | `Verbandpäckchen` | **nur** `NACHSCHUB PÄCKCHEN` — *nicht* `Nachschub Päckchen geliefert` |

**Die Bedingung ist eng:** die Hälften laufen genau dann auseinander, wenn der Begriff einen
**Nicht-ASCII-Buchstaben** enthält, dessen Groß-/Kleinschreibung sich vom gespeicherten Text
unterscheidet. Reine ASCII-Begriffe verhalten sich in beiden Hälften identisch — `LIKE` faltet A–Z
sauber; ein Beispiel wie „paeckchen findet Paeckchen nur im Artikelnamen" ist gemessen **falsch**.
Praktisch heißt das: wer `PÄCKCHEN` in Großschreibung eingibt (Feststelltaste, Kopie aus einer
Liste), findet den Artikel, verliert aber jeden Kommentar, der `Päckchen` normal schreibt. Ohne
Rückmeldung — die Seite zeigt einfach weniger Zeilen.

**Getrennt davon, und in beiden Hälften gleich blind:** `ß`/`ss`. Gemessen ergibt
`'Straße' LIKE '%STRASSE%'` → 0, und `"STRASSE".toLowerCase()` ist `"strasse"`, was in
`"straße".toLowerCase()` ebenfalls nicht vorkommt. Das ist keine Divergenz zwischen den Hälften,
sondern eine gemeinsame Lücke — und damit ein anderer, kleinerer Befund.

*Kein Gate:* `queries.test.ts` prüft die Freitextsuche nicht mit Umlauten,
`e2e/suche-filter.spec.ts:28` tippt `Verbandpäckchen` in der Schreibweise der Fixture — der Fall, der
bricht, kommt in keinem Test vor. Wer die Suche beim Port „vereinheitlicht" (etwa beide Hälften auf
SQL, oder beide auf JS), ändert das Verhalten in **beide** Richtungen, ohne dass irgendetwas rot
wird.

### Auth und Zugang

**12. Das Rate-Limit kehrt beim Umzug auf `core/ratelimit.ts` die X-Forwarded-For-Richtung um.**
lagerbuch nimmt bewusst den **rechtesten** Eintrag (`src/lib/auth/rateLimit.ts:29-35`) und begründet
das bei `:23-28` mit CWE-348: „Der linkeste Eintrag ist vom Client frei setzbar; ihm zu vertrauen
würde das Per-IP-Rate-Limit durch XFF-Spoofing aushebeln." `deployment.md:60-64` macht das zur
Betriebsauflage. Die Suite nimmt `cf-connecting-ip`, sonst den **ersten** XFF-Wert
(`core/ratelimit.ts:57-61`) und begründet auch das (`:52-55`: „Vor der Suite stehen Cloudflare und
Traefik", `cf-connecting-ip` ist „Notbremsen-Schlüssel, nie Primärschlüssel").

Was daran hängt: `/t/<code>` ist der einzige Weg in die Helfer-Sitzung, der Codespace ist 10⁶
(`src/actions/tokens.ts:10,15`), und `implementierungsplan.md` §6 nennt das Rate-Limit ausdrücklich
als eine von vier Kompensationen für die im Klartext gedruckten Codes. Ein Treffer gibt nicht nur
Lesezugriff, sondern auch Entnahmebuchung (`buchung.ts:82`) und Check-Abschluss (`check.ts:72`).

**In der neuen Topologie sind beide Richtungen falsch, nicht nur eine.** Rechtsaußen ist bei zwei
vorgeschalteten Proxies ein für alle Clients identischer Wert — und dann tritt genau der Fall ein, den
lagerbuchs eigenes `deployment.md:63-64` beschreibt: „greift das Rate-Limit für Token-Gate//t global
statt pro Client-IP", also fünf Versuche pro Minute für alle zusammen. Linksaußen ist frei setzbar.
Welcher Schlüssel richtig ist, entscheidet die tatsächliche Proxy-Kette.

*Kein Gate:* beide Implementierungen haben grüne Unit-Tests, und `rateLimit.test.ts:33-38` testet
sogar den Spoofing-Fall ausdrücklich. Ungesichert ist allein das **Löschen** dieses Tests zusammen
mit dem modul-eigenen `rateLimit.ts`; `core/ratelimit.test.ts:47` friert umgekehrt die
Erst-Eintrag-Auswertung ein. Nebenpunkt: beide Zähler sind prozesslokal
(`rateLimit.ts:9`, `core/ratelimit.ts:6-11`) — im Suite-Container teilt sich lagerbuch den Prozess mit
allen anderen Modulen, und jeder Suite-Deploy setzt das Limit zurück, nicht mehr nur ein
lagerbuch-Deploy.

**13. `isAdmin` bedeutet in beiden Systemen etwas anderes — und der Riegel kippt in beide Richtungen.**
In lagerbuch heißt es „Mitglied von `OIDC_ADMIN_GROUP`" (Vorgabe `lagerbuch-admin`,
`src/lib/config.ts:46`), in der Suite „ist Betreiber der Suite" (`core/auth/config.ts:170`, mit dem
Kommentar direkt darüber, dass es die Frage „darf Modul X administrieren" **nicht** beantwortet).
`verwaltungCordonDecision` (`src/lib/auth/cordon.ts:14-20`) liest genau dieses Feld. Ein 1:1-Port
öffnet die gesamte Lagerbuch-Verwaltung für jeden Suite-Betreiber und sperrt umgekehrt jede Person
aus, die heute in `lagerbuch-admin` ist, aber kein Suite-Betreiber. *Kein Gate:* beide Felder sind
`boolean`, der Zugriff typecheckt in beiden Systemen, und **beide** Dev-Logins setzen `isAdmin = true`
(`src/auth.config.ts:47-52`) — die E2E bleiben grün. Genau die Klasse, die der Entscheidungs-Log am
2026-07-28 festgehalten hat: was nur der echte OIDC-Weg berührt, kann der Dev-Login nicht bezeugen.

**14. Der Helfer-Token hat keinen wirksamen Zugriffsbereich.** Siehe Abschnitt 2.4. *Kein Gate:* eine
ungenutzte Spalte ist für Drizzle, typecheck und lint vollkommen unauffällig — sie ist im Schema
deklariert und wird sogar referenziert, also nicht einmal „unused". `e2e/helfer-flow.spec.ts` benutzt
genau einen Seed-Code und genau ein Fahrzeug; der Fall „Code von Fahrzeug A, Check von Fahrzeug B"
existiert in keinem Test, und Vitest übergibt die `fahrzeugId` selbst.

**15. `/helfer/check` schickt Soll, Geräte, Flaschen und Verfall ALLER aktiven Fahrzeuge in den
Client** — auch bei Deep-Link auf genau eines. `src/app/helfer/check/page.tsx:16,19-21,23,24-26` baut
vier `Object.fromEntries(fahrzeuge.map(...))`-Wörterbücher und reicht sie komplett als Props an die
Client-Komponente (`CheckFlow.tsx:50-58`); `?fz=` wirkt nur als Vorauswahl (`page.tsx:28`). Damit
wandert bei jedem Helfer-Aufruf die komplette Soll-Bestückung, Geräteliste und Flaschenliste der
Organisation in den RSC-Payload. *Kein Gate:* die Seite ist korrekt, typkorrekt und schnell, solange
die Testdaten klein sind. Beim antd-Neubau ist das der Moment, auf das gewählte Fahrzeug zu schneiden
— danach nachzurüsten heißt, den Flow ein zweites Mal umzubauen.

**16. `/t/<code>` baut Redirect und Cookie gegen `APP_BASE_URL` statt gegen den anfragenden Host.**
`src/app/t/[code]/route.ts:19` baut das Gate-Ziel als `new URL("/", config.appBaseUrl)`, `:30` das
Erfolgsziel als `new URL(ziel, config.appBaseUrl)` — und `:31` setzt das `helfer_session`-Cookie auf
**diese** Antwort, also auf den Host, unter dem der QR-Code aufgerufen wurde. Weicht `APP_BASE_URL`
vom Anfrage-Host ab, ist der Redirect cross-origin: das Cookie gilt für den einen Host, die Landung
passiert auf dem anderen, die Helferin kommt ohne Sitzung am Gate an — und der Code bleibt dabei
**gültig**, hinterlässt aber eine Spur, die man nicht mehr wegbekommt. `redeemToken` prüft allein
`tokens.aktiv` (`token-redeem.ts:15`); `lastUsedAt` wird erst danach geschrieben (`:16`) und von genau
zwei Stellen gelesen, von denen keine über Gültigkeit entscheidet. Die eine ist `pruefeToken`
(`src/actions/loeschen.ts:89-99`): ein Code mit `lastUsedAt` ist nicht mehr **löschbar** („bleibt als
Nachweis erhalten. Du kannst ihn stattdessen sperren."), nur noch sperrbar. Die andere ist
`TokenTable.tsx:67`, die daraufhin „zuletzt <Zeitstempel>" statt „nie benutzt" zeigt. Mehrfachgebrauch
ist beabsichtigt — `rateLimit.ts:1-3` begründet den Verzicht auf Redis ausdrücklich damit, dass „Codes
physisch laminiert" und „sofort sperrbar" sind —, und kein Test behauptet Einmalgebrauch
(`token-redeem.test.ts` prüft `aktiv`, Ziel und Session, nie ein zweites Einlösen). Die Helferin
verliert also nicht den Code, sondern den Weg; der Betrieb verliert die Löschbarkeit des Kärtchens.

Die Suite kennt `APP_BASE_URL` nicht einmal als Namen; ihr geltender Host steht in
`SUITE_HOST_<KEY>`, und `AUTH_URL` ist suiteweit **derselbe** Wert auf jedem Modul-Host
(`core/auth/redirect.ts:8-11`). Wer `appBaseUrl` unbesehen darauf mappt, setzt das Cookie auf
`lagerbuch.<domain>` und leitet auf `<portal-domain>/helfer` weiter.

**Die Inkonsistenz existiert bereits innerhalb von lagerbuch, und das macht den Fix billig:** derselbe
Code wird auf zwei Wegen eingelöst — `t/[code]/route.ts:30` leitet **absolut**,
`src/app/(gate)/actions.ts:24` leitet **relativ** (`redirect(returnTo ?? tokenZielPfad(...))`). Auch
`src/middleware.ts:19` und `:31` bauen host-relativ (`new URL(decision.to, req.nextUrl)`). Der relative
Weg bleibt im Mehrhost-Betrieb von selbst richtig.

**Drei stille Nebenwirkungen derselben Variablen**, die kein Rohbefund allein nennt:
`helferCookieOptions()` leitet das `Secure`-Flag aus
`config.nodeEnv === "production" || config.appBaseUrl.startsWith("https://")` ab
(`helferSession.ts:32`); `src/auth.config.ts:65` leitet aus demselben Ausdruck ab, ob das
Auth.js-Callback-Cookie den `__Secure-`-Präfix trägt (`:75`); und `compose.yaml:16` setzt
`AUTH_URL=${APP_BASE_URL}`, woraus Auth.js die OIDC-`redirect_uri` baut. Alle vier Fehlermodi sind
stumme Sitzungsverluste. (Der `Secure`-Teil entschärft sich in der Suite, weil `NODE_ENV=production`
dort fest im Image steht, `iuk-suite/Dockerfile:23`.)

*Kein Gate:* `src/actions/token-redeem.test.ts:3` mockt `appBaseUrl` auf `http://localhost:3000` —
dieselbe Herkunft wie der Testserver, der Bruch ist per Konstruktion unsichtbar. Playwright fährt
gegen genau **einen** Host; der Mehrhost-Fall ist im Testaufbau nicht darstellbar.

**17. Der `/verwaltung`-Riegel gehört in eine Funktion, nicht in ein Layout.**
Heute trägt der Edge-Cordon den Riegel **vor** dem Rendern (`src/middleware.ts:14-21`), das
`(admin)`-Layout ist ausdrücklich nur die Doppelabsicherung (`layout.tsx:8`). Fällt die Middleware
weg, bleibt das Layout als einziger Riegel — und Route-Group-Grenzen sind keine Sicherheitsgrenzen.
Das Verzeichnis belegt, dass die Grenze in diesem Repo bereits einmal überschritten wurde: unter
`src/app/verwaltung/` liegen genau `(admin)` und `kein-zugriff`, es gibt **kein**
`src/app/verwaltung/layout.tsx`, `kein-zugriff/page.tsx` hängt also nur am Root-Layout.

lagerbuch bringt zwei Kandidaten für ein zweites Layout mit: `/verwaltung/etiketten` rendert einen
Druckbogen mit den Token-**Codes im Klartext** (`etiketten.ts:19,23` — das Secret selbst) und braucht
beim Port fast sicher ein Layout ohne Suite-Shell; `/verwaltung/journal` zeigt die Klarnamen aus
`users` (`src/db/quelle.ts:12-25`). Die Suite hat die Lösung: `requireFeedbackAccess.ts:17-23` liegt
als **aufrufbare Funktion** vor, die beide Layouts rufen — mit der ausgeschriebenen Begründung, dass
die Druckansicht ein Layout ohne Shell braucht und damit **aus dem Schutz** des `(admin)`-Layouts
herausfiele.

*Kein Gate:* ein Layout, das eine Route nicht umschließt, ist kein Fehler, sondern die Definition von
Route Groups. Die Lücke entsteht erst durch die spätere Datei, die das zweite Layout einführt, und
die kommt in einem anderen Commit als der Riegel.

**18. Der Cordon fängt heute auch Server-Action-POSTs ab — aber der eigentliche Riegel war immer
`requireAdmin()`.** Der Matcher deckt `/verwaltung/:path*` (`middleware.ts:35`) und läuft damit auch
für die POSTs, mit denen Next Server Actions ausliefert. Verlagert man den Riegel ins Layout, fällt
diese Vorab-Absicherung ersatzlos weg. **Die Präzision ist hier wichtig, damit beim Port nicht das
Falsche geschützt wird:** Action-IDs sind global, ein Angreifer kann die Action-ID einer
Verwaltungsseite jederzeit gegen `/` posten, wo der Matcher nie griff. Der Cordon war nie der
Action-Riegel. Die eigentliche Zusage ist die Vollständigkeit der Guard-Liste — **44 von 44 Actions**
unter `src/actions/`, plus zwei bewusst ungeschützte außerhalb (Abschnitt 2.4). *Kein Gate:* eine
fehlende Guard-Zeile in einer neu hinzugefügten Action ist typkorrekt, lint-sauber und sieht wie ein
Erfolg aus. Es gibt keinen Test, der eine Action ohne Sitzung aufruft.

**60. `/t/<code>` schreibt eine Fehlermeldung, die niemand liest.** `src/app/t/[code]/route.ts:21`
hängt bei Ratelimit oder ungültigem Code ein `?err=rate` bzw. `?err=code` an die Gate-URL
(`:25`, `:27`). `src/app/(gate)/page.tsx:10` destrukturiert aus `searchParams` aber ausschließlich
`returnTo` und reicht `err` nirgends weiter; `Gate.tsx:41` zeigt `state.error`, und das ist der
Rückgabewert der Form-Action, nicht der URL-Parameter. Ein `grep` auf den String `"err"` über `src/`
liefert genau **einen** Treffer, und das ist die schreibende Zeile `route.ts:21`; die Gate-Seite ist
die einzige mögliche Leserin und ihr `searchParams`-Typ (`page.tsx:10`) kennt den Schlüssel nicht.
Wer heute ein laminiertes Etikett scannt und dessen Code gesperrt oder gerade rate-limitiert ist,
landet wortlos auf dem Gate und sieht dasselbe Bild wie bei einem ganz normalen Aufruf.

**Das ist ein Mangel des Bestands, kein Portierungsrisiko** — er wird nach dem Umzug weder besser
noch schlechter. Er gehört trotzdem hierher, weil er eine Falle für die Portierung selbst ist: `?err=`
sieht in `route.ts` nach einer funktionierenden Nutzerauskunft aus, und ein Port, der die Zeile
mitnimmt und abhakt, übernimmt eine Sackgasse als Feature. Entweder die Gate-Seite liest den Parameter
beim Neubau mit — sie wird für antd ohnehin angefasst — oder die Zeile fällt.

*Kein Gate:* ein ungelesener Query-Parameter ist typkorrekt und läuft fehlerfrei;
`src/app/t/[code]/route.ts` hat keinen Test, der das Gate-Rendering nach der Weiterleitung ansieht.

**19. Der Cookie-Name `helfer_session` trägt kein Modulpräfix — und das Cookie trägt den Code im
Klartext.** `helferCookieOptions()` setzt `path: "/"` **ohne** `domain` (`helferSession.ts:31-33`) —
host-only, in einer Ein-App-Welt genau richtig. Die Suite setzt für ihre eigenen Login-Cookies
`domain` aus `AUTH_COOKIE_DOMAIN` (`core/auth/cookies.ts:47`). Wer beim Port diese Vorlage als Muster
nimmt (die Datei heißt `core/auth/cookies.ts`, der Griff liegt nahe) und `domain` mitkopiert, macht
aus einer host-gebundenen Helfer-Sitzung ein Cookie, das an **jeden** Modul-Host geschickt wird.

**Was dabei mitwandert, ist nicht bloß „eine Sitzung":** `HelferPayload` trägt `code` als
Klartextfeld im JWT (`helferSession.ts:6,11,23`) — genau den Wert, den `implementierungsplan.md` §6 als
„das Etikett *ist* das Secret" bezeichnet. Es wäre bei jeder Anfrage an `files.<domain>`,
`feedback.<domain>` und jeden weiteren Modul-Host im Header, und in jeder Stelle, die Cookies
protokolliert. **Begrenzend:** kein anderes Suite-Modul liest `helfer_session` — es entsteht keine
Rechteausweitung auf den fremden Hosts, nur Exposition. Der Hausstil ist ohnehin präfigiert
(`files_s_<shareId>`, `m/files/_lib/passwort.ts:28`; `feedback-<surveyId>`,
`m/feedback/actions.ts:610`). *Kein Gate:* Cookie-Attribute sind Laufzeitwerte; Playwright fährt gegen
einen Host, wo ein domain-weites Cookie sich exakt wie ein host-only verhält.

**20. Die Helfer-Sitzung kennt weder Erneuerung noch Einzel-Widerruf noch eine `jti`.**
`createHelferSession` setzt `alg HS256`, `iat` und `exp` (`helferSession.ts:12-15`) — kein `jti`, kein
`iss`, keine `aud`. `verifyHelferSession` prüft Signatur, Ablauf und drei Feldtypen (`:18-29`). Die
Cookie-`maxAge` wird zum Ausstellungszeitpunkt gleich der JWT-Laufzeit gesetzt (`:33`), es gibt keine
gleitende Verlängerung: wer um 07:00 einlöst, fliegt um 19:00 raus, auch mitten im Fahrzeug-Check.
Umgekehrt gibt es keinen Weg, **eine** laufende Sitzung zu beenden — `beenden()` löscht nur das eigene
Cookie (`helfer/actions.ts:7`), und `setTokenAktiv(false)` wirkt nur schreibend. Der einzige globale
Widerruf ist eine Rotation von `HELFER_SESSION_SECRET`. Ändert der Betreiber
`HELFER_SESSION_STUNDEN`, tragen bereits ausgestellte Cookies weiter das alte `exp`. Die Suite hat mit
`m/files/_lib/passwort.ts:112-180` eine reifere Bauform derselben Idee im Haus (HMAC über ID+Ablauf,
`min(4h, Restlaufzeit)`, Bindung an den Datensatz durch Vergleich des **ganzen** Werts). *Kein Gate:*
ein JWT ohne `jti` ist ein gültiges JWT; der Ablauf mitten im Check ist ein Zeitverhalten über 12
Stunden.

**21. `session.error` wird serverseitig von keinem Riegel ausgewertet.** Siehe Abschnitt 3.2. Für
lagerbuch besonders relevant, weil das Modul anonyme Ansichten mitbringt (Gate, `/helfer`, `/a`, `/t`),
die sinnvollerweise **ohne** die Suite-Provider gerendert werden — dort greift der Client-Guard gar
nicht. *Kein Gate:* `session.error` ist ein optionales Feld; es nicht zu lesen ist typkorrekt, und der
Zustand ist selten und selbstheilend. **Zur Cutover-Kommunikation gehört die Gegenrichtung:**
lagerbuch setzt `token.isAdmin` **nur** beim Erst-Login (`auth.config.ts:105-110`, `account` liegt nur
dann an) und definiert keine `session.maxAge` — ein Gruppenentzug in Pocket ID wirkt heute bis zu 30
Tage lang **gar nicht** (Auth.js-Default, kein Repo-Wert). In der Suite sinkt das auf den Refresh-Takt
von rund einer Stunde. **Die Portierung verbessert das**; die beschriebene Restlücke bleibt.

**22. Der `users`-Upsert hängt an einem Auth.js-`events.signIn` — den es in der Suite nicht gibt.**
`src/auth.ts` schreibt den Datensatz in einem Login-Event und baut ihn über `kontoAusLogin(user,
profile)` mit `id = profile.sub` (`src/lib/auth/konto.ts:19-26`) — ausdruecklich **nicht** `user.id`,
weil Auth.js bei OIDC je Login eine Zufalls-UUID vergibt (`konto.ts:10-15`). Genau diese Tabelle löst
das Journal in Klarnamen auf (`src/db/quelle.ts:12-25`, Rückfall auf die rohe ID bei `:24`). Die Suite
hat keinen `events`-Block; das Hausmuster ist der Upsert pro Anfrage hinter dem Riegel
(`requireFeedbackAccess.ts:50-55`).

*Kein Gate:* die `users`-Tabelle bleibt migriert und befüllt (die Altdaten kommen mit), der Resolver
kompiliert, und für alle **bestehenden** Nutzer stimmen die Namen weiter. Erst der erste Login eines
Nutzers **nach** dem Umzug erzeugt keinen Satz mehr, und das Journal zeigt für dessen Buchungen eine
rohe UUID — genau die Regression, die `f2b515b` gerade behoben hat. Playwright fährt mit dem
Dev-Login, dessen `id` stabil `"dev-admin"` ist, und sieht den Unterschied nicht.

**Die Altlast dazu — der Erzeuger ist weg, der Altbestand bleibt.** `git show 2361f40:src/auth.ts`
Zeile 14 schreibt `.values({ id: user.id, … })` — jede Anmeldung erzeugte eine neue Waisenzeile, die
auf keine einzige Buchung passt. **`f2b515b` behebt genau das**, und weil der Freeze auf `ca04eb1`
liegt (Belegbasis), ist der Code-Defekt kein Portierungsposten mehr; was bleibt, ist die Bereinigung
der bis dahin entstandenen Zeilen in der produktiven `users`-Tabelle (Entscheidung 27, Teil ii).
**Der Kopf dieser Falle bleibt davon unberührt:** die Suite hat weiterhin keinen `events`-Block, der
Upsert braucht weiterhin einen neuen Ort. **Das Journal selbst ist heil:** schon `2361f40:src/auth.config.ts:85` holt den
echten `sub` aus dem Profil zurück, `:94` setzt `session.user.id` darauf; alle
`quelleId`/`created_by`-Werte tragen also die stabile Kennung. Verseucht ist nur die Nachschlagetabelle
— die Bereinigung ist Betriebsarbeit an **einer** Tabelle, kein Eingriff ins Journal. Und:
`select count(*) from users` ist **keine** Personenzahl.

**23. `assertProductionSecrets` verliert in der Suite seinen Ort — und `${VAR}` ohne `:?` ergibt den
Leerstring.** Der Startriegel (`src/lib/config.ts:101-113`) ist über `src/instrumentation.ts:6`
verdrahtet — eine Datei, die es in der Suite bereits gibt und die niemand modulweise anfasst; die
Suite-Bootstrap prüft nur Hosts, Gruppen und die files-Blob-Ablage (`core/bootstrap.ts:40-50`).

**Die schärfere Hälfte ist die Compose-Seite:** wird `HELFER_SESSION_SECRET` als schlichtes
`${HELFER_SESSION_SECRET}` **ohne** `:?` übernommen, setzt Compose es auf den **leeren String**
(ausdrücklich dokumentiert bei `iuk-suite/compose.yaml:10-13`) — und leer greift den zod-Default
**nicht** (gemessen: `z.string().default(x)` liefert bei `""` den Wert `""`, nur bei `undefined` den
Default). `jose` verweigert einen Nullschlüssel („Zero-length key is not supported"),
`createHelferSession` wirft. Heute fängt das der Boot ab; in der Suite bootet der Container grün und
fällt erst beim ersten `/t/<code>`-Scan mit 500 um. **Das Scheitern wandert von der Startzeit in die
Nutzungszeit** — laut, nicht still, also keine fälschbaren Sitzungen, aber genau die Sorte
Verschiebung, die kein Gate sieht.

**24. `redeemToken` normalisiert die Großschreibung, aber nicht den Bindestrich.**
Der Generator setzt den Bindestrich fest zwischen Position 3 und 4 (`tokens.ts:15`), `redeemToken`
normalisiert mit `trim().toUpperCase()` (`token-redeem.ts:13`) — auf einer reinen Ziffernfolge
wirkungslos — und sucht auf Gleichheit (`:14`). Die Eingabe `123456` findet `123-456` nicht. Das
Eingabefeld setzt weder `pattern` noch `maxLength` noch `inputMode`, nur `placeholder="000-000"`
(`Gate.tsx:40`); die Fehleingabe ist also nicht durch die Maske ausgeschlossen. **Schärfer als der
Tippfehler ist der geteilte Eimer:** der Bucket-Schlüssel ist die Client-IP
(`(gate)/actions.ts:17`, `t/[code]/route.ts:16`), und der Verbrauch geschieht **vor** jeder
Codeprüfung (`:19` bzw. `:25`). Alle Helferinnen hinter demselben Uplink — eine Bereitschaft an einem
Anschluss, oder Mobilfunk hinter CGNAT — teilen sich fünf Fehlversuche pro Minute. Der Bucket erlaubt
5 und blockt den 6. (`rateLimit.ts:4-5`). Die Bindestrich-Normalisierung ist damit nicht nur
Bequemlichkeit, sondern die billigste Maßnahme gegen einen gemeinsamen Eimer. *Kein Gate:* Tests und
Specs verwenden den Code in der kanonischen Form; eine Normalisierung, die weniger normalisiert als
gedacht, hat keine Fehlerform — sie liefert `{ ok: false }`, also genau das, was ein falscher Code
liefern soll.

**61. `/m/lagerbuch/*` beantwortet jeder Suite-Host — der Riegel hängt am Segment, nicht am Host.**
`decideRoute` behandelt bereits interne Pfade gesondert (`pathname.match(/^\/m\/([^/]+)(?:\/.*)?$/)`,
`core/routing.ts:58`) und gatet danach nach dem Modul **aus dem Segment**, nicht nach dem Host
(`:59-66`, Begründung im Kommentar `:54-57`). Für ein Modul mit `requiresAuth: false` steigt
`canAccess` sofort mit `true` aus (`core/registry.ts:155`), der Zweig endet also bei
`{ action: "next" }` — gleichgültig, welcher Host gefragt hat. `proxy.ts:103` nimmt `/m/*` bewusst
**nicht** aus dem Matcher; das wäre „ein Auth-Bypass" (`KONSOLIDIERUNG-PROGRESS.md`, Phase 1,
Post-Cutover-Befund 1). Folge: sobald lagerbuch das laut Abschnitt 3.3 zwingende `requiresAuth: false`
bekommt, beantwortet **jeder** Host, der auf den Suite-Container terminiert,
`/m/lagerbuch/t/<code>`, `/m/lagerbuch/g/<code>`, `/m/lagerbuch/helfer/*` und
`/m/lagerbuch/verwaltung/*`.

**Wie schlimm es ist, hängt an Entscheidung 10 — und nur eine ihrer Optionen macht daraus einen
echten Autorisierungs-Bypass.** Unter (a) und (b) ist der Verwaltungsriegel host-blind und bleibt es:
`verwaltungCordonDecision` liest `hasSession`/`isAdmin` (`src/lib/auth/cordon.ts:14-20`), und beide
Ersatzformen tun dasselbe — `/m/lagerbuch/verwaltung/*` und `/m/lagerbuch/a/<id>` sind auf einem
fremden Host dann genauso gegatet wie auf der eigenen Domain. **Unter (c) — zwei Hosts, ein anonymer
und ein Verwaltungs-Host mit `requiresAuth: true` — kippt das.** `requiresAuth` ist **ein** Boolean je
Modulschlüssel (`core/registry.ts:9-36`, ein Feld auf `ModuleDef`, ein Eintrag je Key); der anonyme
Teil erzwingt `false`, also kann der Verwaltungs-Host durch die Registry überhaupt nicht gegatet
werden, sondern nur modulintern über eine Hostprüfung — und genau die umgeht der interne Zweig, weil
er den Host nie ansieht. `files` ist der Beleg dafür, dass das so gebaut werden **muss**: zwei
Prod-Hosts, `requiresAuth: false` (`core/registry.ts:68-69,87-89`), Rollentrennung in
`_lib/hostRolle.ts` statt in der Registry. **(c) setzt also Option (d) aus Entscheidung 10 voraus,
sonst ist der Verwaltungs-Host über `/m/lagerbuch/verwaltung/*` von jedem anderen Suite-Host aus
offen.** `/g/<code>` entscheidet seine Rolle selbst (`src/app/g/[code]/page.tsx:21-26`) und ist auch
heute ungegatet — es steht nicht in lagerbuchs Matcher (`src/middleware.ts:35`); auf einem fremden
Host leitet es lediglich ans dortige Gate. Unter (a) und (b) bleibt damit **eine** Tür teuer — und die
aus einem anderen Grund als dem Zugriff.

**`/t/<code>` ist die Tür mit bleibender Nebenwirkung.** Vor `redeemToken` steht allein das
Rate-Limit (`src/app/t/[code]/route.ts:25`), keine Hostprüfung. `redeemToken` schreibt `lastUsedAt`
(`src/actions/token-redeem.ts:16`), und das Cookie wird auf **diese** Antwort gesetzt (`route.ts:31`)
— mit `helferCookieOptions()`, das **kein** `domain` führt (`src/lib/auth/helferSession.ts:31-34`):
host-only, also auf dem Host, der gefragt hat. Drei Folgen:

1. **Das Kärtchen wird unlöschbar.** `pruefeToken` verweigert das Löschen jedes Codes mit gesetztem
   `lastUsedAt`: „Dieser Code wurde bereits für Buchungen benutzt und bleibt als Nachweis erhalten.
   Du kannst ihn stattdessen sperren." (`src/actions/loeschen.ts:89-99`). Ein einziger Aufruf auf dem
   falschen Host macht aus einem nie ausgegebenen Kärtchen dauerhaft ein „benutztes".
2. **Die Token-Tabelle sagt etwas Falsches.** `TokenTable.tsx:67` zeigt danach „zuletzt
   <Zeitstempel>" statt „nie benutzt" — für einen Code, den niemand benutzt hat.
3. **Der Eimer ist geteilt.** `consumeRate` läuft **vor** jeder Codeprüfung (`route.ts:25`) und ist
   prozesslokal (`rateLimit.ts:9`); im Suite-Container teilt lagerbuch den Prozess mit allen Modulen
   (Falle 12). Fünf Fehlversuche pro Minute je Schlüssel (`rateLimit.ts:4-5`) gelten dann auch für
   Aufrufe, die die Lagerbuch-Domain nie erreicht haben.

**Der Code ist danach nicht verbraucht** — er bleibt gültig; die Begründung steht in Falle 16.

**Wie schwer die Sitzungsfolge wiegt, entscheidet Entscheidung 17 — beide Zweige sind schlecht.**
Bleibt der Redirect **absolut** gegen eine Modul-URL (heute `config.appBaseUrl`, `route.ts:19,30`),
ist das Cookie verwaist: gesetzt auf Host A, gelandet auf Host B, die Helferin steht ohne Sitzung am
Gate — und muss denselben, weiterhin gültigen Code erneut einlösen. Wird der Redirect **relativ** —
der naheliegende Fix, den `src/app/(gate)/actions.ts:23-24` schon geht —, bleiben Cookie und Landung
auf demselben fremden Host: dann läuft lagerbuch dort **vollständig**, als zweite funktionierende
Herkunft desselben Moduls, die in keinem Runbook steht und deren Sitzungen niemand sieht. Diese
Falle ist deshalb eine Auflage an Entscheidung 17, kein eigenständiger Fix.

**Eine Asymmetrie, die dabei mitzudenken ist:** die Suite-Sitzung folgt der Elterndomain
(`AUTH_COOKIE_DOMAIN`, `core/auth/cookies.ts:47`), die Helfer-Sitzung nicht. Ein Admin ist auf jedem
Suite-Host derselbe, eine Helferin ist es je Host neu — zwei Cookie-Familien mit gegenläufiger
Reichweite im selben Modul.

**Dass host-only-Cookies über Modul-Hosts hinweg produktiv zuschlagen, ist in dieser Suite belegt,
nicht vermutet:** `core/auth/cookies.ts:5-31` schreibt den Vorfall aus (Login von einer Modul-Domain,
`state`/`pkce`/`nonce` host-only, Callback auf `AUTH_URL`, `InvalidCheck: state value could not be
parsed`), `KONSOLIDIERUNG-PROGRESS.md` datiert ihn als Prod-Blocker nach dem **ersten** Modul-Cutover
— „mit nur einer Domain konnte das nicht auffallen". lagerbuch bringt die zweite Cookie-Familie in
genau diese Topologie.

*Kein Gate:* das Verhalten ist nicht bloß ungetestet, es ist **festgeschrieben**.
`core/routing.test.ts:61-65` prüft ausdrücklich, dass interne Pfade „nach dem Modul aus dem Segment,
nicht nach dem Host" gegatet werden. Der Fall „`requiresAuth: false`-Modul auf fremdem Host" ist von
keinem Test gedeckt — dort liefert `canAccess` per Frühausstieg `true`, und `next` ist das erwartete
Ergebnis. `typecheck`, `lint` und `pnpm build` sehen nichts; Playwright auch nicht, denn die Specs
laufen gegen genau **einen** `baseURL` (Falle 57).

**Das ist eine Klasse, kein lagerbuch-Problem — und die Zahl ist kleiner, als sie wirkt.** Fünf
Module tragen `requiresAuth: false` (`core/registry.ts:49` qr, `:65` feedback, `:87` files, `:97`
beta, `:100` kioskdemo). **Nur `files` sperrt sich modulintern gegen fremde Hosts**
(`m/files/_lib/hostRolle.ts:90-120`, gerufen aus drei Group-Layouts und zehn Route Handlern); `qr`
benutzt `resolveHost` überhaupt nicht, `feedback` nur zum **Bauen** von Adressen
(`m/feedback/f/[slugSecret]/qr.png/route.ts:54`, `m/feedback/_ui/Teilnahme.tsx:56`,
`m/feedback/(print)/aushang/[groupId]/page.tsx:44`), nie als Riegel. lagerbuch wäre damit das
**dritte** reale Modul ohne Host-Sperre, nicht das vierte. Der bereits dokumentierte Symptomfund
gehört in dieselbe Klasse: `iuk-ue.de/m/beta` liefert ein Manifest, das ins Leere zeigt, „Ursache ist,
dass `/m/<key>` auf jeder Domain erreichbar ist" — bewusst nicht gefixt, „wäre eine eigene Spec wert"
(`KONSOLIDIERUNG-PROGRESS.md`, Abschnitt zu den unterminierten Punkten). lagerbuch ist das erste
Modul, bei dem diese Klasse eine **Datenwirkung** hat statt einer kosmetischen. Ob `/m/*` suiteweit
gegatet wird, ist eine Suite-Spec und **keine** lagerbuch-Entscheidung; für Phase 5 genügt der
modulinterne Riegel aus Entscheidung 10, Option (d).

### Etiketten und Artefakte

**25. Der Host steckt in den gedruckten Pixeln — und das Kärtchen trägt zwei Verträge.**
Siehe Abschnitt 4.1. *Kein Gate:* `e2e/etiketten.spec.ts:13` prüft ausschließlich
`toHaveAttribute("src", /^data:image\/png/)` — der QR wird **nie dekodiert** (anders als im Modul `qr`,
wo `sharp`+`jsqr` echt dekodieren). `src/db/etiketten.test.ts:2` mockt `config` auf
`https://lager.example` und assertiert genau den gemockten Wert — es friert die Annahme ein, statt sie
zu prüfen. typecheck, lint und build sehen einen Template-String.

**26. Nachdruck-Lücke: deaktivierte Artikel funktionieren weiter, sind aber nie wieder druckbar.**
`etikettenDaten` filtert hart auf `aktiv = true` (`etiketten.ts:16` für Artikel, `:17` für Tokens).
Der Leseweg tut das **nicht**: `artikelDetail` sucht allein über `eq(artikel.id, id)`
(`queries.ts:60`), `artikelDetailHelfer` reicht das durch (`:159-161`). Nachgeprüft ist auch die
Schreibseite: `bucheEntnahmeHelfer` (`buchung.ts:82-93`) ruft `requireHelfer`, und
`session.ts:25-26` prüft ausschließlich `tokens.aktiv`, nie `artikel.aktiv`; `fefoAbbuchung`
(`abbuchung.ts:36-49`) liest ohne jede Aktiv-Bedingung. Ein deaktivierter Artikel ist unter `/a/<id>`
also **vollständig bebuchbar** und zugleich dauerhaft nicht nachdruckbar. Deaktivieren ist der von der
Anwendung selbst empfohlene Weg (`loeschen.ts:177`, Docstring „die history-schonende Alternative zum
Löschen"). **Für den Cutover heißt das: die Menge der physisch hängenden Etiketten ist echt
größer als die Menge der heute druckbaren — und die Differenz ist im Repo nicht abzählbar.**
*Kein Gate:* `e2e/etiketten.spec.ts` prüft nur, dass mindestens ein Etikett rendert;
`src/db/etiketten.test.ts:18` prüft nur, dass ein **gesperrter Token** ausgeschlossen wird.

**27. Ein hart gelöschter Artikel macht sein Regaletikett still stumm.**
`/a/[artikelId]` macht bei `null` einen `redirect("/helfer")` (`page.tsx:22-23`) — keine Meldung, kein
404, kein Query-Parameter, der die Zielseite informieren würde. Die Helferin scannt und landet
wortlos auf der allgemeinen Artikelliste; sie hat keinen Weg zu erfahren, dass das Etikett tot ist,
und wird plausibel annehmen, sie habe sich verscannt. Der Artikel ist genau im Zustand „angelegt,
etikettiert, nie bebucht" hart löschbar (`loeschen.ts:54-58` + `:166`). **Die Schwesterroute macht es
anders — und für eine andere Person:** `/g/[code]` endet bei unbekanntem Barcode mit `notFound()`
(`page.tsx:33`), erreichbar aber nur für einen angemeldeten Verwaltenden, weil `:21-26` jede
Nicht-Admin-Anfrage vorher wegschickt. Zwei Artefaktklassen, zwei gegensätzliche Fehlermodi, im selben
Repo — und die 404 ist keine Auskunft für die Person mit dem Etikett in der Hand, sondern für die mit
dem Verwaltungszugang. **Nach dem Port ändert sich zudem das Ziel dieses `notFound()`:** heute die
eingebaute Seite von Next in einem nackten `<body>` (`layout.tsx:42`), danach
`iuk-suite/src/app/not-found.tsx` — ohne Modul-Layout, mit Geist, Suite-Theme und dem Absatz „in
dieser Suite … wende dich an die Administration" (Entscheidung 36). Die hier empfohlene Abhilfe (eine
Meldung statt eines wortlosen Redirects) ist identisch mit Option (a) der Entscheidung 36.
*Kein Gate:* ein Redirect ist HTTP 200 nach dem Folgen; nur ein Test, der das **Ausbleiben** einer
Meldung prüft, würde es zeigen.

**28. Code-Recycling: ein gedrucktes, nie eingelöstes Kärtchen kann seinen Code verlieren.**
`generateUniqueCode` prüft Kollisionen ausschließlich gegen **lebende** Zeilen (`tokens.ts:16`) — es
gibt keine Grabstein-Tabelle, kein `deletedAt`, keinen reservierten Namensraum. `pruefeToken` erlaubt
den Hard-Delete, solange `lastUsedAt` null ist (`loeschen.ts:89-99`), `loescheElement` führt ihn aus
(`:168`). **Die Zufallsrate ist klein** (1/10⁶ je Ziehung; bei D gelöschten und N neuen Codes rund
N·D/10⁶ — für D=50/N=100 etwa 0,005), und `createToken` bietet keinen Weg, einen Code vorzugeben
(`:44` zieht immer zufällig). **Tragend ist deshalb nur die Kombination:** wer beim Umzug Codes
bewusst neu vergibt oder eine Alt-Menge importiert, macht aus dem Zufallsereignis eine Gewissheit — und
weil der Code zugleich Anzeigeschlüssel im Journal ist (1:1-Pflicht 6), erscheinen historische Zeilen
danach unter dem **neuen** Label, die Nachweiskette zeigt auf das falsche Fahrzeug. *Kein Gate:*
erfordert einen Test über zwei Zeitpunkte und einen physischen Gegenstand dazwischen.

**29. Der Barcode ist ein Vertrag mit der Außenwelt.** `POSSIBLE_FORMATS` umfasst CODE_128, CODE_39,
**EAN_13, EAN_8, ITF**, QR_CODE und DATA_MATRIX (`BarcodeScanner.tsx:72-78`). EAN/ITF sind reine
Handels- und Herstellercodierungen — sie stehen auf keinem lagerbuch-Etikett, sondern vom Hersteller
gedruckt am Gerät. Der Abgleich ist binär (`geraete.ts:77`, `bz.ts:120`; Spalten ohne `COLLATE`).
**Wichtige Präzisierung:** die Anwendung normalisiert sehr wohl — Schreibweg
(`z.string().trim().optional()`, `actions/geraete.ts:17`, `actions/bz.ts:15`) und Leseweg
(`code.trim()`, `geraete.ts:70`) sind konsistent getrimmt. Genau deshalb **muss ein Cutover-Import
ebenfalls trimmen**, sonst erzeugt er die Asymmetrie, die die Anwendung vermeidet. Einzige
unnormalisierte Lesestelle: `src/app/g/[code]/page.tsx:29,31` reicht den Routen-Parameter roh durch.
Ob überhaupt Hersteller-EANs im Bestand stehen, ist eine Betreiberfrage. *Kein Gate:*
`e2e/bz-scan.spec.ts:10` und `e2e/geraete.spec.ts:8` erzeugen ihre Barcodes selbst
(`SN-${Date.now()}`) und tippen sie manuell ein; der Kamerapfad läuft in **keinem** Test.

**30. Der Scanner erwartet `/g/<code>`-QR-Aufkleber, die die Anwendung nirgends erzeugt.**
`geraetZuBarcode` schneidet ein Deep-Link-Muster heraus: `code.match(/\/g\/([^/?#]+)/)`, dann
`decodeURIComponent` (`actions/geraete.ts:71-72`, zeichengleich `actions/bz.ts:73-74`).
`etikettenDaten` erzeugt aber ausschließlich `/a/`- und `/t/`-URLs (`etiketten.ts:19,23`); ein `grep`
über `src/` nach `/g/` findet genau **einen** Treffer, und der ist die Rücksprung-URL des Deep-Links
selbst (`g/[code]/page.tsx:25`). Entweder wurden solche Aufkleber außerhalb der Anwendung gedruckt —
dann sind sie ein Artefakt, das niemand im Repo zählen kann — oder der Zweig ist tot. Bemerkenswerte
Nebenwirkung: weil das Muster nur das **Pfadsegment** schneidet, überlebt so ein Aufkleber einen
Domainwechsel, sofern er **in** der App gescannt wird; mit der Systemkamera öffnet er weiter die alte
Domain. *Kein Gate:* ein toter oder außerhalb bedienter Codepfad sieht für jedes Gate wie normaler
Code aus.

**31. Nach dem Login geht das `/g/`-Ziel auf dem Rückfallpfad verloren.**
`g/[code]/page.tsx:25` leitet auf `/?returnTo=%2Fg%2F<code>`; `adminLandingPfad` (`cordon.ts:46`)
lässt nur `/verwaltung…` und `/a`/`/a/…` durch und wirft alles andere auf `/verwaltung` (`:47`) — der
Kommentar `:44-45` nennt ausdrücklich nur das Regaletikett als Grund. **Nicht bedingungslos:**
`Gate.tsx:22` setzt `adminCallback = returnTo || "/verwaltung"` und `:56` übergibt ihn als
`signIn("oidc", { redirectTo: adminCallback })`. Überlebt das `authjs.callback-url`-Cookie den
Pocket-ID-Umweg, landet der Admin **doch** auf `/g/<code>`. `adminLandingPfad` greift nur, wenn das
Cookie verlorengeht — `auth.config.ts:57-64` beschreibt genau diesen Fall und nennt ihn für
Mobilgeräte/PWA den **Regelfall**, weshalb dort `maxAge: 60*15` gesetzt wurde (`:81`). Zweite
Präzisierung: `sanitizeReturnTo` verwirft jede Zeichenkette mit `:` (`returnTo.ts:8`) — ein
Gerätebarcode mit Doppelpunkt verliert sein `returnTo` schon vorher. *Kein Gate:*
`cordon.test.ts:29-39` friert das aktuelle Verhalten als Sollverhalten ein.

**32. Kein einziger E2E deckt die beiden gescannten Routen ab.** Ein `grep` über alle
`page.goto(`-Aufrufe in `e2e/` liefert 38 Treffer; **kein einziger** beginnt mit `/t/` oder `/g/`. Die
einzige Deep-Link-Navigation im ganzen Bestand ist `e2e/helfer-flow.spec.ts:52`
(`page.goto("/a/e2e-artikel")`). Damit ist ausgerechnet der Weg ungetestet, den **jedes gedruckte
Etikett** nimmt — und `/t/[code]` bündelt in einer Funktion genau die vier Dinge, die der Port
ändert: Rate-Limit, Code-Einlösung, Cookie-Setzung, Redirect. *Kein Gate:* das ist die Abwesenheit
eines Gates, nicht sein Versagen. Die Suite hat dafür ein Präzedenzurteil: „ein Umbau von `proxy.ts`
schuldet weiterhin einen Lauf von `pnpm exec playwright test`, das den Ausfall als einziges immer
end-to-end sieht" (`iuk-suite/CLAUDE.md:88-89`).

### Oberfläche

**33. Fünfzehn Server Components importieren Icons — Falle 7 trifft sie alle, und das
Verwaltungs-Layout ist eine davon.** lagerbuch importiert `lucide-react` an 54 Stellen, 46 verschiedene
Icons. `lucide-react` trägt in jedem Blatt `"use client"` und läuft deshalb heute problemlos aus
Server Components. Bei einer 1:1-Umschreibung auf `@ant-design/icons` werden aus genau diesen 15
Importstellen HTTP 500 — **beim Import, nicht beim Rendern**
(`core/shell/icons.ts:35-43`, gemessen und dokumentiert):

`verwaltung/(admin)/layout.tsx:3` · `(admin)/page.tsx:2` · `checks/page.tsx:2` ·
`checks/[id]/page.tsx:3` · `bz/page.tsx:2` · `bz/scan/page.tsx:2` · `bz/[id]/page.tsx:3` ·
`bz/[id]/kontrolle/page.tsx:3` · `geraete/page.tsx:2` · `geraete/scan/page.tsx:2` ·
`geraete/[id]/page.tsx:3` · `fahrzeuge/[id]/page.tsx:3` · `vorlagen/page.tsx:2` ·
`vorlagen/[id]/page.tsx:3` · `sauerstoff/[id]/page.tsx:3`

Der schlimmste Fall ist die erste Zeile: das Layout über **allen** 24 Verwaltungsseiten — ein
einzelner `LogOut`-Import legt den gesamten Admin-Bereich lahm. Und der Reflex greift nicht:
`"use client"` darauf zu setzen ist keine Reparatur, sondern ein Umbau des Layouts zur
Client-Komponente (es ruft `await auth()`, `layout.tsx:7`). Zwei der 15 sind außerdem die
Scan-Einstiege, also der mobile Kernpfad. *Kein Gate:* typecheck und build bleiben grün
(`icons.ts:110-112`), und Vitest sieht es strukturell nicht (dort lädt `react` über die
`default`-Bedingung, die Icons rendern klaglos). `core/shell/icons.test.ts:147-171` ist ein
repo-weiter Quelltext-Scan über vier Importformen und schlägt beim Portieren zu — er nennt aber nur
die Dateien; die Abhilfe ist pro Stelle eine eigene Entscheidung.

**34. Sieben Icon-Namen tragen fachliche Bedeutung — und zwei davon bereits doppelt.**
39 der 46 Icons sind reine UI-Symbole. Sieben sind Fachzeichen: `HeartPulse` und `Package`
unterscheiden in `GeraeteListe.tsx:29-30` die Geräteklassen „medizin" und „objekt"; `Wind` steht
durchgängig für Sauerstoff (`SideNav.tsx:16`, `CheckFlow.tsx:3`, `checks/[id]/page.tsx:3`);
`BatteryCharging` für die BZ-Gerätekontrolle (`bz/[id]/page.tsx:3`); `Flashlight` schaltet die
Kamera-Taschenlampe (`BarcodeScanner.tsx:134`) und ist ein Bedienelement, dessen Zustand man erkennen
muss; `PackageCheck`/`PackageSearch` markieren die Phasen des Fahrzeug-Checks. Zum Vergleich: die Suite
führt insgesamt acht Icons (`icons.ts:132-139`), alle rein strukturell.

**Zwei davon sind schon heute doppeldeutig, und beide Paare erscheinen auf demselben Bildschirm:**
`Package` steht in der Navigation für den Bereich „Artikel" (`SideNav.tsx:10`) und in der Geräteliste
für die Klasse „objekt"; `HeartPulse` in der Navigation für „BZ-Kontrolle" (`SideNav.tsx:15`) und in
der Geräteliste für „medizin". Die Seitenleiste ist auf `/verwaltung/geraete` sichtbar. Wer eine
1:1-Icon-Tabelle anlegt, verfestigt die Doppeldeutigkeit; wer sie auflöst, fällt eine fachliche
Entscheidung. Nebenbei: `AlertTriangle` kommt 11× vor und steht durchgängig neben roten Statuschips —
es ist selbst kein reines UI-Symbol. *Kein Gate:* ein falsch gewähltes Ersatz-Icon ist gültiger Code.
Genau dieser Fehler ist der Suite schon passiert und blieb still: beim Registry-Eintrag von `files`
fehlte `FolderOutlined` in der Map, der Eintrag trug daraufhin das Portal-Icon — „kein Fehler, kein
Log, nur ein falsches Bild in jeder Kopfzeile" (`icons.ts:19-25`).

**35. Rot ist in lagerbuch gleichzeitig Primäraktion UND Fachstatus.** Das Suite-Theme setzt
`colorPrimary` und `colorError` beide auf `#c8000f` (`core/theme/theme.ts:22-23`). lagerbuch trennt die
beiden Rollen heute nicht über den Farbton, sondern über die **Flächenform**: die Primäraktion ist
eine vollflächige rote Schaltfläche mit weißer Schrift (`globals.css:65`), der Fachstatus ein
blasser Chip aus `--rot-bg` `#fbe9eb` mit rotem Text (`:60`). In antd verschwindet die Trennung:
`Tag color="error"`, `Alert type="error"` und `Button type="primary"` greifen alle auf denselben Token
zu.

Der Umfang, nachgezählt: **27× `chip-rot`, 12× `chip-gelb`, 15× `chip-ok`, 26× `chip-grau`** (80
Statuschips), **28× `btn-rot`**, dazu **21 KPI-Kacheln mit farbiger Kante** und die Journal-Deltas
(`.jdelta.minus`, `:176`). Belegstellen auf Datenflächen u. a.
`checks/[id]/page.tsx:99` („fehlt {a.offen}"), `:126`, `:173` („niedriger Druck"),
`checks/page.tsx:44-48`, `ArtikelTable.tsx:76` („unter Mindestbestand"),
`FahrzeugeListe.tsx:63` („{n} unter Soll"). Für Fehlbestand, Verfall, überfällige MTK, niedrigen
Sauerstoffdruck und fehlende Geräte **ist** Rot die Fachaussage. `docs/design/README.md:126-131`
lässt das nicht durch Weglassen erfüllen — es erzwingt eine eigene, modul-eigene Statuspalette unter
`app/m/lagerbuch/_lib/`, analog zur Schulnoten-Ampel des Moduls `feedback` (`tokens.ts:6-11` sieht
diese Ausnahme ausdrücklich vor). *Kein Gate:* ein `Tag color="error"` ist gültiges antd; im
jsdom-DOM steht in beiden Fällen dieselbe Klasse. Sichtbar wird es erst am Bildschirm, und dort sieht
es nicht kaputt aus, sondern nur falsch.

**36. Die Verfalls-Plakette: der Zusicherungsvertrag der Komponente trägt den Status nicht — und die
Ampel-Luminanz ist nicht monoton.** Die Plakette ist ein 40×40-SVG-Zifferblatt mit zwölf
Monatsstrichen, bei dem der Verfallsmonat als längerer, dickerer Strich hervortritt und Ring plus
Strich die Ampelfarbe tragen (`Plakette.tsx:11-32`). Ein antd-Gegenstück gibt es nicht.

Ihr `aria-label` lautet `Verfall ${fmtVerfall(verfall)}` (`:31`) — es nennt das **Datum**, nie den
Status; die Farbe kommt allein aus `:9`. **Präzisierung, damit der Befund nicht falsch gelesen wird:**
an allen vier Verwendungsstellen steht heute ein Textchip daneben (`VerfallItem.tsx:21`,
`ArtikelDrawer.tsx:327`, `ArtikelTable.tsx:240` via `StatusChips:80-82`, `HelferEntnahme.tsx:65`) —
die Bildschirme erfüllen „Bedeutung nie allein über Farbe" also. Der Verstoß liegt im
**Zusicherungsvertrag der Komponente selbst**: sie ist als `role="img"` mit unvollständigem Label
alleinstehend unbrauchbar, und genau das ist die Falle beim Neubau — wer sie isoliert übernimmt,
verliert eine Absicherung, die heute nur aus dem Umfeld kommt.

Die relative Luminanz der drei Ampelwerte ist nachgerechnet: ok `#1e7a3c` = **0,1452**, gelb `#b26a00`
= **0,1977**, rot `#c8000f` = **0,1231**. Über die Rangfolge gut → schlecht steigt sie und fällt dann;
Grün und Rot liegen 0,022 auseinander, Gelb ist der **hellste** der drei. Das verletzt
`docs/design/README.md:138-141` („Luminanz monoton führen") heute schon. Dazu drei feste Werte in der
Plakette: `fill="#fff"` (`:32`), `var(--tinte)` für die Ziffern (`:34`), `#C7CDD1` für die inaktiven
Striche (`:24`) — im Dunkelmodus bleibt sie eine weiße Scheibe. *Kein Gate:* die Plakette rendert
korrekt, `aria-label` ist gesetzt (a11y-Linter sind zufrieden), die Farbwerte sind gültig.
Luminanz-Monotonie prüft nur ein eigens geschriebener Test — die Suite hat einen für die
Schulnoten-Ampel, für lagerbuch gäbe es ihn nicht automatisch.

**37. Kein Dunkelmodus — und acht Flächen invertieren bereits fest gegen Hell.**
`globals.css` hat genau drei `@media`-Blöcke: `:160` (`prefers-reduced-motion`), `:250`
(`max-width:760px`), `:275` (print). Kein `prefers-color-scheme`, kein `data-theme`, kein
Dunkel-Gegenstück zu den zwölf Farben. Fest gegen Hell gebaut sind: `.side` (`:180`, Grund
`var(--tinte)`, Text `#fff`), `.summary` (`:162`), `.btn-tinte` (`:67`), `.input` (`:80`,
`background:#fff` **ohne** Variable), `.combo-input` (`:83`, dito), `.etikett` (`:266`),
`Plakette.tsx:32` (`fill="#fff"`) und `BarcodeScanner.tsx:113` (Inline-Style `background:"#000"` — eine
Stelle, die kein CSS-Scan findet). Die Suite schaltet über `<html data-theme>` per Cookie, **nicht**
über `prefers-color-scheme` (`docs/design/README.md:105-118`), und `bodyBg` dark ist `#000000`
(`theme.ts:42`). Ein portiertes lagerbuch im Dunkelmodus zeigt antd-Flächen dunkel und daneben weiße
Eingabefelder, eine weiße Plakette und einen Block, der heller als der Grund sein **sollte** und es
nicht mehr ist. Der Aufwand sind zwölf Farbrollen als Paar plus diese acht Stellen. *Kein Gate:* alle
acht sind syntaktisch einwandfrei; kein Gate der Suite rendert ein Modul im Dunkelmodus.

**38. Der Breakpoint steht auf 760px, nicht auf 767.98px.** `globals.css:250` ist die **einzige**
breitenabhängige Medienabfrage des Moduls und schaltet `.side` von 218px sticky auf waagerecht
scrollend (`:252-255`) und `.main` von `padding:20px 24px 48px` (`:187`) auf `14px 12px 48px` (`:257`).
Die Suite schaltet bei 768px (`docs/design/README.md:159`, festgehalten in
`core/shell/shell-css.test.ts:32-35`). **Im Fenster von 760,01 bis 767,98px** zeigt die Shell bereits
ihre mobile Fassung, während lagerbuchs Verwaltung noch auf die 218px-Leiste und den
Desktop-Innenabstand umschaltet. Das ist buchstäblich der Fehler, den `feedback.css` bis 2026-07-27
hatte (600 statt 768) und den `docs/design/README.md:205-211` als „bei 390px nicht zu unterscheiden —
und dazwischen kaputt" beschreibt. 767.98 statt 768 ist dabei kein Detail: bei exakt 768px gelten sonst
beide Seiten und die Stylesheet-Reihenfolge entscheidet (`:196`). *Kein Gate:* jsdom wertet Media
Queries nicht aus; Playwright bei 390px und bei 1280px sieht beide Fassungen richtig. Und
`shell-css.test.ts` prüft `shell.module.css`, nicht Modul-CSS.

**39. Der 16px-Riegel der Suite liest nur `font-size:` — drei von vier untergrößigen Feldern kommen
durch.** Die Suite sperrt den Zoom (`maximumScale: 1, userScalable: false`,
`iuk-suite/src/app/layout.tsx:43-48`) und zieht deshalb eine 16px-Untergrenze für Eingabefelder
(`globals.css:54-58`) — beide Regeln sind ausdrücklich eine Einheit
(`docs/design/README.md:167-171`). lagerbuch hat heute **keine** von beiden: kein `viewport`-Export,
und die Felder liegen bei 13–15px.

`core/theme/feldschrift.test.ts:114-141` ist der einzige Riegel dagegen, ein repo-weiter Scan über
alle `.css` unter `src/`. Er hat **zwei Lücken**, und lagerbuch trifft beide:

1. Er liest ausschließlich die Langform `/font-size:\s*(\d+)px/`. `.input{…font:500 14px var(--body)…}`
   (`globals.css:80`) und `.combo-input` (`:83`) — zusammen die Träger von 56 `<input>` und 16
   Comboboxen — setzen ihre 14px über die **font-Kurzschreibweise** und passieren grün.
2. Er filtert nach dem Selektortext (`/\b(input|textarea|select)\b|\.ant-select-selector/`).
   `.stepper.sm .stepval{…font-size:15px}` (`:76`) nennt kein Eingabeelement, obwohl `.stepval` in
   `Stepper.tsx:52` ein echtes `<input type="text" inputMode="numeric">` ist — das Mengenfeld der
   Verwaltung, 15px.

Gefangen wird genau eines: `.verfallfeld .input{font-size:13px}` (`:110-113`) — das Verfalls-Datumsfeld
direkt in der Zähl-Zeile des Fahrzeug-Checks, dessen Kommentar (`:110`) den Grund nennt: „kompakt,
damit Menge und Datum in einer Zeile bleiben". Die Auflösung ist nicht kosmetisch: 16px statt 13px
bricht genau diese Einzeiligkeit. *Kein Gate:* wer den Test als bestandene Prüfung liest, portiert
drei zu kleine Felder in eine Anwendung ohne Zoom. **Das ist eine Lücke in einem Suite-Gate, kein
Modulbefund.**

**40. Die Tap-Ziele sind 42px bzw. 30px — die Suite-Vorgabe ist 56px, und das ändert die Zeilenhöhe
im Fahrzeug-Check.** `core/theme/tokens.ts:33` setzt `TAP = 56` mit der Begründung „Bedienung mit
Handschuhen … eine Einsatzanforderung, keine Stilfrage"; `theme.ts:33` setzt `controlHeight: TAP`
bewusst **global**, damit es auch `Select` und `DatePicker` trifft. lagerbuch liegt darunter:
`.stepbtn` 42×42 (`globals.css:73`), `.stepval` 56×42 (`:74`), `.stepper.sm` 30×30 bzw. 46×30
(`:75-76`), `.btn-icon` 36×36 (`:226`), und die häufigste Knopfform überhaupt ist `.btn.slim` mit 9px
Innenabstand (**54 Verwendungen**). Beim Heben wird die Zähl-Zeile im Fahrzeug-Check höher: dort
steht pro Position ein Stepper, gruppiert Fach für Fach (`CheckFlow.tsx:106`) — 14px mehr je Zeile
sind auf 20 Positionen ein zusätzlicher Bildschirm, einhändig im Fahrzeug. Die **einzige** von der
Suite erlaubte Ausnahme ist `size="small"` **innerhalb von Tabellenzeilen**
(`docs/design/README.md:61-62`); lagerbuch hat genau zwei `<table>` (`journal/page.tsx:39`,
`ArtikelTable.tsx:200`), die kompakten Stepper stehen dagegen in Karten-Zeilen (`.main .row`, `:191`).
Die Ausnahme deckt den Fall also nicht. *Kein Gate:* `theme.test.ts` prüft, dass der Token 56 ist —
nicht, wie viele Zeilen dadurch aus dem Bild wandern.

**41. Der Helfer-Bereich ist eine Vollbild-App; die Suite-Shell bringt eine Kopfzeile schon mit.**
`.app` ist `height:100vh; height:100dvh; overflow:hidden; display:flex; flex-direction:column`
(`globals.css:129`), darunter roter Streifen (`:130`), eigene Markenzeile (`:131`), scrollender
Mittelteil (`:135`) und eine **feste Tab-Leiste unten** mit zwei Zielen (`:147-150`,
`HelferFrame.tsx:11-29`, Tabs `:26` Entnahme / `:27` Fahrzeug-Check), aufgehängt über den ganzen Ast
(`helfer/layout.tsx:10`). `FullShell` ist `<Layout style={{minHeight:"100vh"}}>` + `<SuiteHeader>` +
`<Content style={{padding: SPACE.lg}}>` (`core/shell/FullShell.tsx:19-22`), `headerHeight` fest 64
(`theme.ts:43`), `SPACE.lg` = 16 (`tokens.ts:53`). Ein `100dvh`-Kind in diesem Content ergibt
**64 + 32 = 96px Überlauf** — die untere Tab-Leiste wandert unter den Bildschirmrand, und damit ist
die Umschaltung zwischen Entnahme und Fahrzeug-Check auf einem Handy nicht mehr erreichbar.

Die drei Shell-Varianten passen alle nicht: `full` und `minimal` bringen die Kopfzeile mit; `kiosk` hat
keine, ist aber ausdrücklich „Vollbild ohne Bedienelemente" (`Shell.tsx:30-31`) und hebt über
`KioskThemeProvider.tsx:26-33` `fontSize` auf 20 und `controlHeight` auf `TAP_XL` (72) — für
Wandmonitore gedacht, nicht für ein Handy in der Hand. *Kein Gate:* zwei gestapelte Kopfzeilen und
eine abgeschnittene Tab-Leiste sind gültiges Layout; jsdom kennt weder Viewporthöhe noch `dvh`, und
ein Playwright-Lauf bei 1280×720 zeigt es ebenfalls nicht.

**42. Die Modulnavigation der Suite ist `flex` ohne `flex-wrap` und ohne `overflow-x` — 15 Einträge
scrollen die Seite, nicht die Leiste.** `SideNav.tsx:8-24` führt 15 gleichrangige Ziele (Übersicht,
Artikel, Verfall, Fahrzeuge, Vorlagen, Checks, BZ-Kontrolle, Sauerstoff, Geräte, Bestellung, Inventur,
Journal, Zugangs-Codes, Etiketten, Import), heute senkrecht in einer 218px-Leiste, wo sie bequem
passen. **Die Suite legt die Modulnavigation nicht in die Kopfzeile**, sondern als zweite Zeile
darunter (`core/shell/shell.module.css:106-112` schreibt die Begründung aus: „Der Knoten ist ein
Geschwister des `<Header>` und kein Kind. Solange er im Kopf saß, war er dort das dritte Flex-Kind und
nahm dem Titel die Breite weg: zwischen 768px und 903px blieben von ihm 0px"). Dort ist das Problem
also bereits behoben — es sitzt eine Ebene tiefer: `.modulnav` (`:122-129`) ist ein Flex-Container in
Vorgabestellung `nowrap` **ohne** `overflow-x`; `.navLink` trägt `min-height:56px` und
`padding-inline:12px` (`:161-168`). Fünfzehn Links mit den lagerbuch-Beschriftungen (zusammen ~128
Zeichen) liegen überschlägig bei 1.300–1.400px; bei 1280px kann kein Link unter seine
`min-content`-Breite schrumpfen, also läuft die Zeile über und **`documentElement` scrollt
waagerecht**.

Zwei Auswege sind außerdem **verbaut**: `types.ts:21-25` definiert `SuiteNavItem` ausdrücklich
**ohne** `icon`-Feld („die Modulnavigation steht in einer Zeile bzw. Liste mit Text, und ein Icon je
Unterseite wäre Zierrat, den niemand pflegt") — „nur Icons ab einer bestimmten Breite" ist damit eine
core-Änderung, keine Modulentscheidung. Und eine „zweite Ebene unterhalb der Kopfzeile" **ist**
`.modulnav`; einen dritten Streifen gibt es nicht. Unter 768px steht sie auf `display:none` und die
Ziele wandern in einen Drawer (`:132-151`). *Kein Gate:* kein bisher portiertes Modul hat mehr als eine
Handvoll Einträge — die Lücke ist nie aufgefallen. **Das ist ein `core`-Befund mit lagerbuch als
zweitem, heute belegbarem Nutznießer.** Nebenbei: `.sitem .cnt` (`globals.css:186`) sieht einen roten
Zähler-Badge je Eintrag vor, der nirgends verwendet wird — die ursprüngliche Absicht war offenbar
„Verfall: 7" in der Navigation.

**43. Der Etikettendruck: `body * { visibility: hidden }` ist per CSS-Modul nicht kapselbar.**
Der Druck funktioniert über Sichtbarkeitsumkehr: `globals.css:277` schaltet alles unsichtbar,
`:278-282` blendet nur `.etikettbogen` wieder ein, holt den Bogen per `position:absolute;left:0;top:0`
aus dem Fluss und setzt `gap:0`; `.etikett.deselected{display:none !important}` (`:281`) und
`.etikett input,.no-print{display:none !important}` (`:282`). Ausgelöst wird es aus einer
Client-Komponente (`EtikettenBogen.tsx:34`, `window.print()`), die Auswahl ist reiner Client-State
(`:10`).

**Der naheliegende Portierungsweg funktioniert für diesen Block nicht:** CSS Modules schreiben
ausschließlich **Klassenselektoren** um — `body *` bleibt global. Die Regel würde auf **jeder**
Druckseite der Suite greifen und jede andere Druckansicht (feedback-Aushang, files-Zugangslinks)
leeren. Dazu bleibt `Layout{minHeight:100vh}` (`FullShell.tsx:19`) im Fluss (`visibility:hidden`
reserviert den Platz) und erzeugt leere Folgeseiten hinter dem Bogen. Die zweite Zusage, die still
bricht: `.etikett input` (`:282`) trifft das tatsächlich gerenderte Auswahlelement — ein
antd-`Checkbox` rendert an dieser Stelle **kein nacktes `<input>`**.

**Beide Suite-Muster sind belastet.** `feedback` benutzt eine eigene Route-Gruppe `(print)` **ohne**
Shell — und `files` hält in `_ui/zugangslinks.module.css:11-16` ausdrücklich fest, warum es das
**nicht** tut: „DIE DRUCKANSICHT IST EIN `@media print`-BLOCK UND KEINE EIGENE ROUTE. Der
Präzedenzfall feedback hat sie als eigene Route mit eigenem Layout — und genau dort fiel sie aus dem
Zugriffsriegel heraus, weil der Riegel im anderen Layout hing." `files` löst es kapselbar mit
`.druckbereich{position:fixed;inset:0;z-index:1000;overflow:hidden}` plus `.nichtDrucken`
(`:148-153`). *Kein Gate:* kein Gate rendert Druck. `pnpm build` und Vitest sehen `@media print` gar
nicht, Playwright rendert per Default für Bildschirm, und der einzige heutige Test
(`e2e/etiketten.spec.ts:11`) prüft `.etikett img` im **Bildschirm**-DOM.

**44. Der Barcode-Scanner bleibt eine Insel — teuer ist das Bedienelement darüber.**
RSC-first ändert am Scanner wenig: er ist bereits eine saubere Client-Insel mit dynamischem
Doppelimport (`BarcodeScanner.tsx:66-69`, die zxing-Bundles laden erst beim Betreten der Seite), sein
`zuBarcode`-Prop ist eine Server-Action, die zwei dünne 13-Zeilen-Hüllen hineinreichen, und die
Elternseiten bleiben Server Components. Was bricht: (a) genau diese beiden Elternseiten tragen je ein
Icon und fallen unter Falle 33; (b) der Taschenlampen-Schalter sitzt absolut über dem Videobild und
färbt sich per **Inline-Style** aus `var(--rot)`/`var(--tinte)` (`:129-130`) — das ist eigenes Markup
außerhalb eines antd-Komponentenbaums, also **Falle 2**: `--ant-*`-Variablen sind dort nicht sichtbar
(antd deklariert sie auf seiner Scope-Klasse; `shell-css.test.ts:97-98` und `not-found.test.tsx:92-93`
verbieten das repo-weit). Wer beim Portieren `var(--rot)` reflexartig durch `var(--ant-color-primary)`
ersetzt, bekommt einen Knopf ohne Hintergrundfarbe — still. *Kein Gate:* ein Inline-Style mit einer
nicht auflösbaren CSS-Variablen ist gültiges CSS und fällt still auf transparent zurück. Die Kamera
lässt sich in keinem Gate prüfen.

**45. Genau ein `useActionState` im ganzen Modul — und der Stepper hat den Konflikt schon gelöst.**
`Gate.tsx:18` ist das einzige `useActionState`. Es gibt genau **vier** `<form>`-Elemente
(`verwaltung/(admin)/layout.tsx:22`, `BarcodeScanner.tsx:143`, `Gate.tsx:38`, `HelferFrame.tsx:18`) und
**kein einziges `<select>`** — jede Auswahl läuft über die eigene Combobox (16 Verwendungen). Das
Muster ist stattdessen: 35 direkte Action-Importe in Client-Komponenten, `useTransition` (50
Verwendungen), lokaler Fehler-State und frei gestylter roter Text unter dem Formular
(`NeuArtikel.tsx:74`, `ArtikelDrawer.tsx:211`). 160 `useState`-Aufrufe verteilen sich auf 37 Dateien.

Die Suite-Prüffrage lautet dagegen: „Kommen Fehler aus Server-Actions **am Feld** an
(`useActionState`), oder auf einer technischen Fehlerseite mit Datenverlust?"
(`docs/design/README.md:245`). Beim Umstieg auf `antd Form` kommt eine **dritte** Zustandsquelle dazu —
und genau an dieser Naht sitzt in lagerbuch ein bewusst gelöster Konflikt: `Stepper.tsx:24-28` hält
einen `draft`-State für die Direkteingabe und dokumentiert bei `:25-27`, dass der Parent-Wert die
Quelle der Wahrheit bleiben **muss**, „damit Klicks/Tastatur nie einen veralteten Wert zurücklesen
(siehe ArtikelDrawer-Kommentar zu genau dieser Sensitivität)". Wer den Stepper auf ein
`Form.Item`-gebundenes `InputNumber` hebt, baut diesen Konflikt neu auf — in einem Feld, dessen
falscher Wert eine falsche Bestandsbuchung ist. *Kein Gate:* das heutige Muster funktioniert
einwandfrei und ist typsicher; kein Gate kennt eine „richtige" Zustandsarchitektur, und
Doppelführung von Wert und Draft fällt erst unter schneller Bedienung auf — Vitest tippt nicht
schnell.

**46. Drei Schriften, 21 Größen — und die Anmutung hängt an der Display-Rolle.**
`src/app/layout.tsx:2` lädt Barlow, Barlow Condensed und IBM Plex Mono über `next/font/google`;
`:6-24` definiert `--font-body`/`--font-display`/`--font-mono`, `globals.css:32-34` leitet sie weiter.
In `globals.css` stehen **21** verschiedene px-Schriftgrößen; auf antds Leiter (12/14/16/20/24/30,
`docs/design/README.md:150`) liegen davon fünf. Die Halbpixelwerte (10,5 / 11,5 / 12,5 / 13,5 / 14,5)
sind kein Versehen — sie stehen wortgleich schon im Mockup.

Tragend ist nicht die Größenliste, sondern die **Rolle `--display`** (Barlow Condensed, versal,
`letter-spacing:.09em`). Sie trägt die gesamte Hierarchie: `.cardtitle` (`:49`), `.label` (`:101`),
`.screenhead` (`:136`), `.secthead` (`:199`), `.bignum` (`:56`), `.kpi b` (`:204`), `.tbl th` (`:207`),
`.brand` (`:132`), `.gatebrand` (`:118`), `.fachhead` (`:167`), `.mainhead h1` (`:197`). Fällt sie
weg, fällt nicht „eine Schrift" weg, sondern die Unterscheidung zwischen Struktur und Inhalt. Die
Mono-Rolle trägt Fachinformation: Fachnummern (`.fach`, `:58`), Journalzeilen (`.journal`, `:172`),
Fußnoten (`:102`) und die Ziffern in der Plakette (`Plakette.tsx:34`).

**Und der Punkt, der beim Wechsel auf Geist zählt:** `font-variant-numeric` bzw. `tabular-nums` kommt
im gesamten lagerbuch-Repo **null** Mal vor — die Ziffernausrichtung hängt heute allein an IBM Plex
Mono. `docs/design/README.md:154` verlangt sie ausdrücklich für verglichene Ziffern.
**Zusatzproblem, das keine Modulentscheidung ist:** die drei Schriften hängen als className am
`<html>`-Element des **Root**-Layouts (`layout.tsx:38-41`) — das gehört der Suite. Der einzige
Präzedenzfall für modul-lokale Schriften ist `m/feedback/f/[slugSecret]/Zustaende.tsx:2`
(`Newsreader` in einer Komponente, angewandt auf einem eigenen Wrapper). *Kein Gate:* Schriftgrößen
sind gültige Werte; ein Test, der „nur Werte aus antds Leiter" erzwingt, existiert nicht (die Regel
steht in der Prosa), und eine fehlende Schrift ist ein Fallback mit HTTP 200.

**47. Die Combobox ist der billigste Gewinn — aber ihr Ersatz sprengt zwei Eingabezeilen.**
242 Zeilen Portal-, Positionierungs- und Tastaturlogik lassen sich ersatzlos löschen; `Select`
mit `showSearch` kann all das. **Zwei Haken.** Erstens verschwindet mit ihr der **Grund** für ihre
Bauform: `Combobox.tsx:37-40` begründet Portal und `position:fixed` wörtlich damit, „dass es nicht an
`overflow: hidden`-Karten oder scrollenden Drawern abgeschnitten wird" — die Ursache ist
`.card{…overflow:hidden}` (`globals.css:46`), einzige heutige Ausnahme `.card:has(.tbl){overflow-x:auto}`
(`:209`). Werden die Karten zu antd-`Card`, ändert sich dieses Verhalten, und wer den Zusammenhang
nicht kennt, sucht das Portal-Problem später an der falschen Stelle. Zweitens ist die Combobox heute
~43px hoch (`:83`: 10+10px Polster, 14px Schrift, 2×1,5px Rahmen) und antds 56 sind +30 %. **Aber
betroffen sind nur zwei Stellen, nicht sechzehn:** `.addrow` kommt dreimal vor
(`SollEditor.tsx:74`, `TemplatePosEditor.tsx:55`, `BarcodeScanner.tsx:144`), und nur die ersten beiden
enthalten eine Combobox. Die übrigen 14 stehen in gestapelten Formularfeldern, wo mehr Höhe
senkrechten Platz kostet, aber keine Zeile umbricht. *Kein Gate:* `.addrow` trägt bereits
`flex-wrap:wrap` (`:221`) — genau die Eigenschaft, die verhindert, dass irgendetwas überläuft.
`documentElement.scrollWidth` bleibt unauffällig, kein Test schlägt an, die Zeile sieht nur anders
aus. Dasselbe Muster, das `docs/design/README.md:180-182` für `scroll={{x}}` beschreibt.

**48. Achtundzwanzig Selektor-Verwendungen hängen an eigenen CSS-Klassen; zwölf Specs am
Demo-Login.**
Nachgezählt, und es sind mehr, als der erste Durchgang fand: **28 Selektor-Verwendungen** hängen an
eigenen CSS-Klassen (Zusicherungen im engeren Sinn sind es weniger — ein Teil sind `.fill()`-Aktionen
und Locator-Handles). Die sechs bekannten sind `.drawer` 8× (`loeschen.spec.ts:21,33,43,63`,
`verwaltung-flow.spec.ts:26,40,55,61`), `.modalbox` 2× (`loeschen.spec.ts:46,66`), `.jdelta.minus` 1×
(`verwaltung-flow.spec.ts:67`), `.etikett img` 1× (`etiketten.spec.ts:11`), `.card.journal .row` 3×
(`loeschen.spec.ts:37`, `verwaltung-flow.spec.ts:51,57`) und `.row` 3× (`verfall.spec.ts:15,24`,
`helfer-flow.spec.ts:44`) — zusammen 18. Dazu kommen vier übersehene, alle ebenfalls in
`src/app/globals.css` deklariert: `tr.click` 5× (`loeschen.spec.ts:32,42,62,73`,
`verwaltung-flow.spec.ts:39`; `globals.css:211`), `div.grid2 input.input` 2× (`loeschen.spec.ts:24`,
`verwaltung-flow.spec.ts:32`; `:247`, `:80`), `table.tbl tbody tr` 2× (`helfer-flow.spec.ts:26`,
`verwaltung-flow.spec.ts:65`; `:206`) und `a.row` 1× (`helfer-flow.spec.ts:12`; `:50`). Die Klasse
`row` allein trägt damit **sieben** Verwendungen, nicht drei. Dazu zwei Attributselektoren, die keine
Klassen sind, aber dieselbe Kopplung ans eigene Markup haben: `input[type="month"]` 2×
(`loeschen.spec.ts:35`, `verwaltung-flow.spec.ts:45`) — der Selektor greift auf das **native**
Monatsfeld zu und trägt nur so weit, wie der Ersatz wieder ein `<input type="month">` rendert — und
`[title="111-111"]` 1× (`helfer-flow.spec.ts:28`).

`.row` (`globals.css:50`) ist die häufigste Layoutklasse des Moduls und geht als erste. Zwei der
Zusicherungen sind bedeutungstragend: `.drawer` ist der Hauptarbeitsweg der Verwaltung, und
`.jdelta.minus` prüft, dass eine Entnahme im Journal als negativ dargestellt wird (die Aussage muss
bleiben, der Träger wechselt) — für `.jdelta.minus` gibt es **kein** Netz unter `src/`. Bei
`.etikett img` ist die naheliegende Formulierung „die einzige heutige Absicherung des
Etikettenbogens überhaupt" dagegen **zu weit**: `src/db/etiketten.test.ts:8` prüft Auswahl (gesperrte
Token raus), absoluten Deep-Link **und** das `data:image/png`-Präfix. Ungegatet bleibt allein, dass
diese Daten im Bogen tatsächlich als `<img src>` landen.

Dazu der Einstieg: zwölf der 13 Specs melden sich über den Demo-Login an, der in lagerbuch hart
`isAdmin: true` zurückgibt; der Suite-Dev-Provider nimmt `email` **und** `groups` entgegen
(`core/auth/config.ts:56-66`), die Gruppen müssen also künftig explizit gesetzt werden.
`e2e/verwaltung.spec.ts:14` behauptet die **literale** URL
`/\/\?returnTo=%2Fverwaltung%2Fartikel$/` — nach dem Port führt kein Weg mehr dorthin, die Spec wird
also **rot**, nicht gegenstandslos.

*Kein Gate:* die Gefahr ist nicht der rote Test, sondern die bequeme Reparatur. Wer die Selektoren auf
antds interne Klassen umbiegt (`.ant-drawer-body`), tauscht eine Kopplung gegen eine schlechtere —
antds Klassennamen sind kein Vertrag, und die Suite geht diese Kopplung sonst an **genau einer** Stelle
bewusst ein, mit ausgeschriebener Begründung (`iuk-suite/src/app/globals.css:60-71`,
`:root .ant-select-selector`, „der Bruch wäre still"). Und ein neu geschriebener Nachfolgetest, der
grün läuft und etwas anderes prüft als vorher, ist schlimmer als ein roter.

**62. Zweiundzwanzig Action-Aufrufe haben kein `catch` — und im Modul gibt es nichts, was sie
auffängt.** 34 Aufrufe einer Server Action stehen in einem `useTransition`; zwölf sind gefangen
(Abschnitt 2.5), **22 nicht**. Sie liegen in elf Dateien:

| Datei | ungefangene Aufrufstellen |
|---|---|
| `verwaltung/(admin)/fahrzeuge/SollEditor.tsx` | `:29`, `:62`, `:66`, `:67` |
| `verwaltung/(admin)/fahrzeuge/[id]/TemplateVerknuepfung.tsx` | `:38`, `:42`, `:76`, `:83` |
| `verwaltung/(admin)/vorlagen/[id]/TemplateAktionen.tsx` | `:20`, `:27`, `:32`, `:34` |
| `verwaltung/(admin)/vorlagen/[id]/TemplatePosEditor.tsx` | `:28`, `:49`, `:50` |
| die vier `*AktivToggle.tsx` (`geraete/[id]`, `bz/[id]`, `fahrzeuge/[id]`, `sauerstoff/[id]`) | je `:11` |
| `verwaltung/(admin)/sauerstoff/[id]/MessungForm.tsx` | `:13` |
| `verwaltung/(admin)/vorlagen/NeuTemplate.tsx` | `:14` |
| `src/components/HelferEntnahme.tsx` | `:25` |

React reicht einen abgelehnten Aufruf aus einem `useTransition` an die nächste Fehlergrenze weiter.
Eine solche Grenze gibt es im Modul nicht — und nach dem Port auch in der Suite nicht: **beide Repos
führen zusammen null `error.tsx`.**

**Der Auslöser ist keine Exotik.** Alle vier `*AktivToggle.tsx` rufen Actions, die mit `requireAdmin`
beginnen (`actions/session.ts:10`, `throw new Error("Kein Zugriff")`) — ein Verwaltender mit
abgelaufener Sitzung tippt „Deaktivieren" und bekommt keine Meldung. Schwerer wiegt
`HelferEntnahme.tsx:25`: der Aufruf geht auf `bucheEntnahmeHelfer` (`actions/buchung.ts:82-93`), das
mit `requireHelfer` beginnt (`session.ts:24,26`: „Keine gültige Helfer-Session", „Token gesperrt") —
die Sofortwirkung, die `session.ts:20-21` als Zusage ausschreibt.

**Das Bemerkenswerte: es gibt ein Gate, und es zementiert den Ausfall.**
`e2e/helfer-flow.spec.ts:31-57` fährt genau diesen Weg (Token einlösen → als Admin sperren → Entnahme
versuchen) und schreibt in `:50-51` selbst hin: „Ohne eigene Error-Boundary schlägt der
Server-Action-Fehler bis zur Fehlerseite durch; der Erfolgs-Toast erscheint nie." Die Zusicherung in
`:56` lautet `await expect(page.getByText(/server-side exception/)).toBeVisible();` — **der Absturz
ist die erwartete Ausgabe.** Damit ist auch belegt, was der Browser zeigt: die eingebaute Fehlerseite
von Next mit dem englischen Satz über eine „server-side exception" (gemessen unter `next dev` — der
Lauf startet `pnpm dev`, `playwright.config.ts:29-36`). Die Helferin, deren Code gerade gesperrt
wurde, erfährt nicht, dass ihr Zugang beendet ist; sie sieht eine englische Absturzmeldung. Die
zugrundeliegende Pflicht („Spec §7: Token sperren → nächste Entnahme bounced", `:32`) ist erfüllt —
die **Buchung** findet nicht statt —, aber die Umsetzung erfüllt sie durch einen Absturz, und der Test
hält genau das fest.

**Zwei Folgen für die Portierung.** Erstens: wer beim Port eine `error.tsx` einzieht oder das `catch`
nachrüstet (Entscheidung 36 (c)/(d)), macht diesen Test **rot** — nicht weil das Verhalten schlechter
wurde, sondern weil es besser wurde. Die portierte Zusicherung muss auf „kein Erfolgs-Chip, sondern
eine deutsche Sperrmeldung" umgeschrieben werden. Zweitens: bleibt alles wie es ist, wandert der
Absturz mit, und in der Suite hat er zusätzlich keine gestaltete Auffangfläche. *Was kein Gate
findet:* die 21 **anderen** ungefangenen Stellen — nur diese eine ist getestet, und zwar auf ihr
Fehlverhalten; `typecheck` und `lint` sehen ein fehlendes `catch` grundsätzlich nicht.

**63. Client-Navigation unter dem Rewrite: drei Konsumenten vergleichen Pfade, die es in der Suite in
zwei Formen gibt — und die Suite hat gemessen, welche davon ankommt.**
`decideRoute` schreibt jeden Pfad des Modul-Hosts auf `/m/lagerbuch/<pfad>` um
(`core/routing.ts:78-79`) — dieselbe Mechanik, an der Falle 49 hängt, hier aber auf der **Client**-Seite.
lagerbuch hat drei Konsumenten von `usePathname()`, und alle drei sind Pfad-**Vergleiche** oder
Pfad-**Schreiber**:

| Stelle | was sie tut | Bruchbild auf dem inneren Pfad |
|---|---|---|
| `HelferFrame.tsx:8-9` | `pathname.startsWith("/helfer/check")` steuert die zwei Tabs (`:26-27`) | `/m/lagerbuch/helfer/check` beginnt nicht mit `/helfer/check` → „Entnahme" bleibt aktiv, auch im Fahrzeug-Check |
| `SideNav.tsx:27,33` | `pathname === href \|\| startsWith(href + "/")` über 15 Ziele (`:8-24`) | kein `href` passt → **gar keine** Markierung, auf allen 24 Verwaltungsseiten |
| `Filterleiste.tsx:29,34` | `useUrlFilter` schreibt `router.replace(\`${pathname}?${qs}\`)` | die Adresszeile springt auf `/m/lagerbuch/…` — ab da läuft die Sitzung dauerhaft in der inneren Form |

**Die Frage ist nicht offen — die Suite hat sie beantwortet, und das kehrt die Bewertung um.**
`core/shell/SuiteNav.tsx:88-95` hält den Messaufbau fest: ein `data-pfad`-Attribut am `modulnav`,
`curl` gegen `qr.localtest.me` unter Next 16.2.6 — `/` → `/`, `/wifi` → `/wifi`. **`usePathname()`
liefert den ÄUSSEREN Pfad.** Auf dem regulären Weg (Browser auf dem lagerbuch-Host) funktionieren
`HelferFrame` und `SideNav` also weiter, und `Filterleiste.tsx:34` ist nicht nur unschädlich, sondern
exakt das Muster, das die Suite selbst fährt: `m/feedback/_ui/Segment.tsx:29,34` schreibt
`router.replace(\`${pfad}?monate=${wert}\`)`. Wer diese drei Stellen als „bricht unter dem Rewrite"
notiert, notiert etwas Falsches.

**Was wirklich bricht, ist der zweite Weg — und den lässt die Suite absichtlich offen.**
`core/routing.ts:54-67` behandelt bereits präfixierte Pfade eigens („nicht erneut präfixen, sonst
akkumuliert jeder RSC-/Prefetch-Request eine weitere `/m/<key>`-Ebene"); der Kommentar `:55-57` sagt,
dass der Matcher `/m/*` **bewusst nicht** ausschließt, und der Matcher belegt es —
`proxy.ts:102-104` nimmt alles außer `_next/static`, `_next/image` und `favicon.ico`. Für ein
bekanntes Modul endet der Zweig auf `{action:"next"}` (`:66`), der Pfad wird also unverändert
durchgereicht und gerendert. Folge: `/m/lagerbuch/verwaltung/artikel` rendert — und zwar von **jedem**
Suite-Host aus, gegated allein über `requiresAuth`/`canAccess` des Zielmoduls (`:62-65`), nicht über
den Host (Falle 61). Landet ein Nutzer einmal darauf, schreibt `Filterleiste.tsx:34` sie beim ersten
Filterklick fest, und die Navigation bleibt für den Rest der Sitzung unmarkiert.

**Nachgeprüft und dazugesagt — die Messung hat zwei Ränder.** Sie steht gegen Next **16.2.6**
(`SuiteNav.tsx:92`), die Suite fährt inzwischen **16.2.11** (`iuk-suite/package.json:28`). Und sie ist
per `curl` gegen `qr.localtest.me` entstanden, also gegen den Dev-Server auf Wildcard-DNS und **ohne**
Reverse-Proxy davor (`:92`, dazu `next.config.ts:5-10` `allowedDevOrigins`). Der Befund ist damit weder
widerlegt noch nachgemessen — genau deshalb ist der E2E unten Teil der Auflage und nicht Zierrat.

*Kein Gate:* dreifach blind. `pnpm typecheck` und `pnpm build` sehen nichts, weil jede dieser Stellen
ein typkorrekter String-Vergleich ist. Vitest sieht es **strukturell** nicht — `SuiteNav.test.tsx:48`
mockt `next/navigation` (`vi.mock(… usePathname: pathnameMock)`), und der Test sagt das über sich
selbst: „Der DOM-Test oben mockt `usePathname` und kann daher NICHT beweisen, dass die Auflösung
unter dem Proxy-Rewrite stimmt — das gehört dem E2E" (`:263-266`). Und am Bildschirm sieht eine
fehlende Aktivmarkierung nicht kaputt aus, sondern nur unaufmerksam.

**Die Schreibrichtung ist die entgegengesetzte Konvention zu Falle 49 — und das ist die eigentliche
Falle.** Alles, was der Client an Pfaden **schreibt**, muss den **äußeren** Pfad tragen (der Browser
steht auf dem Modul-Host, `decideRoute` präfixiert danach); alles, was `revalidatePath` bekommt, den
**inneren** (Falle 49). Beide Sorten stehen in lagerbuch in denselben Dateien. Die Schreiber,
vollständig aufgezählt:

- `router.push` mit literalem Pfad: `vorlagen/[id]/TemplateAktionen.tsx:30` (`/verwaltung/vorlagen`),
  `vorlagen/NeuTemplate.tsx:17` (`/verwaltung/vorlagen/${id}`), `LoeschButton.tsx:39` über die
  `redirectTo`-Prop — vier Aufrufstellen: `sauerstoff/[id]/page.tsx:81` · `geraete/[id]/page.tsx:71` ·
  `fahrzeuge/[id]/page.tsx:170` · `bz/[id]/page.tsx:106`
- harte Navigation: `BarcodeScanner.tsx:45` `window.location.assign(zielUrl(treffer.id))`, mit
  `zielUrl` aus `geraete/scan/GeraetScanner.tsx:9` und `bz/scan/GeraetScanner.tsx:9` — das ist der
  mobile Kernpfad, und `:42-44` begründet die harte Navigation ausdrücklich
- `next-auth`-Ziele: `verwaltung/(admin)/layout.tsx:25` `signOut({ redirectTo: "/" })` und
  `Gate.tsx:55,62` `signIn(…, { redirectTo: adminCallback })`

Alle diese Ziele sind heute äußere Pfade und dürfen es **auf dem äußeren Host** bleiben —
weitgehend ein entlastender Befund. Er steht hier, weil die Nachbarschaft zu Falle 49 sonst zur
naheliegenden und falschen Vereinheitlichung („alles auf `/m/lagerbuch/…`") einlädt: die würde
`router.push` auf dem äußeren Host in einen doppelt präfixierten Pfad schicken.

**Der innere Pfad nimmt aber auch die Schreiber mit, und das ist die Konsequenz aus dem Absatz oben.**
Ein absoluter Pfad in `router.push` löst gegen die **aktuelle Herkunft** auf. Steht der Browser über
den `/m/`-Weg auf einem anderen Suite-Host, wird aus `router.push("/verwaltung/vorlagen")`
(`TemplateAktionen.tsx:30`) eine Anfrage an **jenen** Host, die `decideRoute` auf dessen eigenes
Modul umschreibt (`core/routing.ts:69,78-79`) — 404 statt Vorlagenliste. Dasselbe gilt für
`LoeschButton.tsx:39` an seinen vier Aufrufstellen und für `window.location.assign(zielUrl(…))`
(`BarcodeScanner.tsx:45`). Selten, weil dieser Einstieg selten ist — aber nicht ausgeschlossen,
solange `/m/*` erreichbar ist. Wer die Klasse dicht machen will, macht es an der Kante
(Betreiberfrage 36) und nicht an jeder einzelnen Aufrufstelle.

**Zwei Abgrenzungen, damit keine zweite Wahrheit entsteht.** Erstens: die **server**-seitigen Ziele —
zehn `redirect()`-Aufrufe mit literalem Pfad (`helfer/actions.ts:8` · `(gate)/actions.ts:24` ·
`(gate)/page.tsx:17` · `g/[code]/page.tsx:24,25,30,32` · `a/[artikelId]/page.tsx:18,19,23` ·
`helfer/layout.tsx:9` · `verwaltung/(admin)/layout.tsx:8`) und der absolute Weg in
`t/[code]/route.ts:30` — gehören **nicht** hierher, sondern sind in Falle 16, Falle 17 und
Entscheidung 18 bereits behandelt. Der suite-seitige Teil dieser Klasse ist außerdem schon gelöst:
`core/routing.ts:17-23` erklärt, warum `resolveHost` `x-forwarded-host` vorzieht — „nach einem
`redirect()` in einer Server Action rendert Next das Ziel über eine **interne** Anfrage mit
`host: localhost:<port>`".

Zweitens ein **negativer Befund**, der eine naheliegende Rückfrage schließt: `useSearchParams` hat in
lagerbuch **null** Konsumenten (`grep` über `src/`). Der Filterzustand wird ausschließlich
serverseitig als `searchParams`-Prop gelesen — `journal/page.tsx:11-15` · `checks/page.tsx:11-15` ·
`helfer/check/page.tsx:11-12` · `(gate)/page.tsx:10-11` — und `JournalFilter.tsx:27` /
`ChecksFilter.tsx:16` schreiben nur. Die Suspense-Falle rund um `useSearchParams` entfällt damit.

**Auflage für den Neubau.** `SideNav.tsx` und die Tab-Leiste in `HelferFrame.tsx` werden nicht
portiert, sondern durch die Suite-Shell ersetzt (Abschnitt 2.5, Tabelle „Reine Hülle"). Die Auflage
ist deshalb **keine Reparatur, sondern eine Übergabe** — und dabei geht ohne Zutun etwas verloren:

1. **Die 15 Ziele werden `SuiteNavItem[]` mit ÄUSSEREN `href`.** `aktiverEintrag` vergleicht
   `pfad === e.href || pfad.endsWith(e.href)` (`core/shell/SuiteNav.tsx:101-108`) und trifft damit
   **beide** Formen. Innere `href` (`/m/lagerbuch/verwaltung/artikel`) kehren das um: gegen den
   äußeren Pfad schlägt `endsWith` fehl, und die Markierung verschwindet auf dem Normalweg. Die
   Funktion soll die Rewrite-Konvention ausdrücklich **nicht** kennen (`:97-99`) — dieser Vorsatz ist
   nur haltbar, wenn die `href` außen bleiben.
2. **Der Sektionstreffer auf Detailseiten geht verloren — das ist eine bewusst zu treffende
   Entscheidung, keine Nebensache.** `SideNav.tsx:33` markiert heute über `startsWith(href + "/")`
   auch die Unterseiten. `aktiverEintrag` kennt nur Gleichheit und Suffix, und
   `"/verwaltung/bz/17/kontrolle".endsWith("/verwaltung/bz")` ist `false`. Betroffen sind **neun** der
   24 Verwaltungsseiten: `bz/[id]` · `bz/[id]/kontrolle` · `bz/scan` · `checks/[id]` ·
   `fahrzeuge/[id]` · `geraete/[id]` · `geraete/scan` · `sauerstoff/[id]` · `vorlagen/[id]`. Sie
   fallen auf den Wurzel-Fallback mit `genau: false` — oder, wenn kein `/`-Eintrag deklariert ist, auf
   `null` (`:107`), also auf gar keine Markierung. Darunter sind mit `bz/scan` und `geraete/scan`
   die beiden Scan-Einstiege, der mobile Kernpfad.
3. **Der `/`-Eintrag von lagerbuch ist das Gate, nicht `/verwaltung`.** Der äußere Modulwurzelpfad
   führt auf `src/app/(gate)/page.tsx`. `/verwaltung` als Wurzeleintrag zu deklarieren, wäre die
   naheliegende und falsche Abkürzung: der Wurzeleintrag ist bei `aktiverEintrag` der Fallback für
   **jede** nicht getroffene Seite (`:108`) — also auch für `/helfer`, `/a/<id>`, `/g/<code>` und
   `/t/<code>`.
4. **Die Helfer-Tabs beziehen ihren Zustand nicht mehr aus `usePathname`.** Der Server kennt das
   Segment ohnehin; die aktive Kachel gehört als Prop von dort herunter. Bleibt es beim
   Client-Vergleich, dann als Suffix-Vergleich analog `aktiverEintrag`, nie als `startsWith`.
5. **Ein E2E auf `aria-current` gegen den laufenden Server ist Pflicht, weil Vitest hier blind ist.**
   Vorbild ist `e2e/shell-mobil.spec.ts:288-324`: er prüft `a[aria-current="page"]` im
   `[data-testid="modulnav"]` und — in der Gegenrichtung — dass auf einer Nicht-Eintragsseite
   `aria-current="page"` **null**-mal vorkommt und stattdessen `aria-current="true"` steht
   (`:323-324`). Für lagerbuch braucht es mindestens drei Fälle: eine Listenseite (Treffer), eine
   Detailseite aus Punkt 2 (dokumentiert, was dort erwartet wird), und die Modulwurzel.
6. **Falle 42 bleibt bestehen und verschärft sich hier.** Die Modulnavigation der Suite ist `flex`
   ohne `flex-wrap` und ohne `overflow-x`; 15 Einträge sind der Auslöser. Punkt 1 dieser Auflage ist
   genau die Stelle, an der diese 15 Einträge entstehen — beide Fallen werden in einem Zug entschieden
   oder in einem Zug übersehen.
7. **Es gibt genau zwei Referenzen, und beide sind zu benutzen statt nachzubauen.** `grep` über
   `iuk-suite/src` findet `usePathname` ausschließlich in `core/shell/SuiteNav.tsx` (`:14,175,242`)
   und in `m/feedback/_ui/Segment.tsx` (`:3,29`): `aktiverEintrag` (`SuiteNav.tsx:101-108`) für die
   Markierung, `Segment.tsx:34` für das Schreiben eines relativen Ziels. `qr`, `files` und `portal`
   lösen die Frage nicht — sie haben sie nicht. Eine dritte, modul-eigene Auflösung in `lagerbuch`
   wäre der Ort, an dem die Suite und das Modul auseinanderlaufen.

### Stack und Betrieb

**49. Alle 61 `revalidatePath`-Aufrufe übergeben den ÄUSSEREN Pfad — ein Konventionsbruch, kein
Ausfall.** Der Host-Rewrite rendert unter `/m/lagerbuch/verwaltung/…`, während der Browser auf
`/verwaltung/…` steht (`core/routing.ts:78`). Alle vier vorhandenen Suite-Module übergeben durchweg
`/m/<key>…`; `files` hat dafür sogar eine Konstante `INTERNER_PFAD`
(`m/files/(verwaltung)/zugangslinks/actions.ts:106`). lagerbuch bricht das an 61 Stellen.

**Der befürchtete Ausfall ist am Next-16-Quelltext widerlegt.**
`next/dist/server/web/spec-extension/revalidate.js:210-211` setzt `store.pathWasRevalidated`
**unbedingt** — mit eigenem Kommentar `// TODO: only revalidate if the path matches`, also
ausdrücklich ohne Abgleich gegen den Routenbaum. Folge: `action-handler.js:960,987` setzt
`skipPageRendering = false`, die aktuelle Seite wird neu gerendert und mitgeliefert, und der Client
räumt in `server-action-reducer.js:208` den **gesamten** Prefetch-Cache
(`invalidateEntirePrefetchCache`). Die Zusage in `AussondernRow.tsx:18` („die Zeile verschwindet beim
Re-Render") trägt also weiter. Zweitens gibt es gar keinen Full Route Cache zu invalidieren: **30 der
34** `page.tsx`/`route.ts` tragen `export const dynamic = "force-dynamic"`, und die vier ohne
(`verwaltung/kein-zugriff`, `api/auth/[...nextauth]`, `geraete/scan`, `bz/scan`) sind Ziel keines
einzigen `revalidatePath`-Aufrufs.

**Was bleibt, ist eine Abhängigkeit:** dass die `force-dynamic`-Exporte den antd-Neubau überleben.
Fallen sie weg, werden Routen cachebar und die Pfadschreibweise fängt an zu zählen. *Kein Gate:*
`revalidatePath` mit unbekanntem Pfad ist typkorrekt, wirft nicht und loggt nicht; Vitest mockt
`next/cache`, misst also nie die Wirkung.

**50. Ein Migrationsfehler in lagerbuch nimmt portal, qr, feedback und files mit.**
`core/bootstrap.ts:54-60` iteriert über `MODULE_MIGRATIONS` **ohne** try/catch um den Schleifenkörper;
gerufen aus `instrumentation.ts:38`. Ein Wurf des fünften Eintrags beendet den Boot des ganzen
Prozesses. Dasselbe gilt für alles, was lagerbuch heute beim Start prüft. **Präzisierung, damit die
Ursache nicht falsch gesucht wird:** `parseConfig(process.env)` wirft praktisch nie beim Import —
jedes Feld hat einen `.default()` (`config.ts:30-47`), ein leeres env parst durch (gegen zod 3.25.76
und 4.4.3 ausgeführt). Werfen kann es nur bei einem **malformen** Wert (`APP_BASE_URL` kein URL) oder
im `superRefine`-Fall `AUTH_DEV_LOGIN=true` bei `NODE_ENV=production` (`:50-58`). Die realistische
Abbruchquelle ist die Migration. Wo das in lagerbuch ein Deployment kostet, kostet es in der Suite
fünf Domains — und die Bereitschaftsprobe zeigt die Ursache nicht: `compose.yaml:74` fragt
`/api/health/portal`, kommt der Prozess gar nicht hoch, ist der Container `unhealthy` und die Ursache
steht im Log eines Moduls, das niemand vermutet. *Kein Gate:* kein Gate baut das Prod-Image gegen die
Prod-`.env` und startet es. Der Kommentar in `config.ts:91-100` sagt selbst, warum
`assertProductionSecrets` **nicht** in `parseConfig` steht: `next build` läuft mit
`NODE_ENV=production` und ohne `AUTH_SECRET`.

**51. `/api/health` steht in `PASSTHROUGH` — die Lagerbuch-Domain antwortet `ok`, ohne
`lagerbuch.db` je anzufassen.** `core/routing.ts:12` führt `/api/health` in `PASSTHROUGH`,
`:50-52` gibt `{action:"next"}` zurück, und `iuk-suite/src/app/api/health/route.ts:1-3` antwortet
statisch. Die passende Prüfung existiert bereits (`/api/health/lagerbuch` →
`core/health/index.ts:6-10`, 503 bei Fehler), wird aber von niemandem gerufen — `compose.yaml:74`
nutzt nur `portal`. **Ehrlich dazugesagt:** auch lagerbuchs eigener Endpunkt
(`src/app/api/health/route.ts:5-6`) berührt keine Datenbank; verloren geht nicht Tiefe, sondern
**Zielgenauigkeit** — der Monitor sagt künftig „die Suite läuft", nicht „lagerbuch läuft". Der
Container-Healthcheck wird dabei sogar strenger als heute (er öffnet eine DB), nur für das falsche
Modul. Heute ist die Zusage an drei Stellen verankert: `Dockerfile:29-30` (HEALTHCHECK),
`deployment.md:46-47`, `playwright.config.ts:31` (Bereitschaftsprobe). *Kein Gate:* beide Antworten
sind HTTP 200 mit `{"status":"ok"}` — Playwright, `curl` und Docker sehen keinen Unterschied.

**52. `deploymentId` und der Container-HEALTHCHECK fallen ersatzlos weg.** Beide gehen auf einen
dokumentierten Produktionsvorfall zurück (Abschnitt 2.6); der Commit `2361f40` **ist** dieser Fix und
ist im eingefrorenen Stand `ca04eb1` enthalten. `iuk-suite/next.config.ts` führt kein `deploymentId`, `iuk-suite/Dockerfile` weder
`ARG NEXT_DEPLOYMENT_ID` noch eine `HEALTHCHECK`-Zeile. Der Umzug entfernt die Rückfallebene damit für
**alle** Module gleichzeitig — und die Suite hat, anders als lagerbuch, keine Vorgeschichte, aus der
jemand darauf käme. Zweitens: wer das Image außerhalb der compose-Datei fährt (ephemerer
Verifikations-Container aus dem Cutover-Runbook), hat gar keine Bereitschaftsprobe mehr. *Kein Gate:*
ein fehlendes `deploymentId` erzeugt dieselben, nur unstabileren Asset-URLs; lokal gibt es weder CDN
noch Neustartfenster.

**64. Der Suite-Build baut je Plattform zweimal — ein Build-Arg an nur einer Stelle ist still
falsch.** lagerbuchs Build-Arg steht an genau einer Stelle (`ci.yaml:87-88`), weil es genau einen
`build-push-action`-Aufruf gibt. Die Suite hat pro Matrix-Job **zwei**: `Build (lokal, für image-smoke)`
mit `load: true` (`ci.yml:70-80`) und `Push by digest` (`ci.yml:95-103`). Trägt man `build-args` nur in
den einen, unterscheiden sich das rauchgetestete und das ausgelieferte Image in der Deploy-Kennung —
und **nichts wird rot**: der Smoke prüft `/api/health/portal`, nicht die Asset-URLs. Dazu kommt: der
`merge`-Job baut **nicht**, er setzt nur Digests mit `imagetools create` zu einer Manifest-Liste
zusammen (`ci.yml:149-154`); das ARG muss also in den Plattform-Jobs leben und kann nicht nachträglich
angehängt werden. Bei zwei Matrix-Jobs sind das **vier** Stellen, an denen derselbe `github.sha`
stehen muss, statt einer. Die Zusage aus `ci.yaml:85-86` („Gleicher Wert für beide Architekturen →
identische Asset-URLs") hält im Ziel weiter — beide Jobs lesen `github.sha` desselben Laufs —, aber
sie ist keine Eigenschaft der Datei mehr, sondern eine Disziplin über vier Fundstellen.
*Zusatz:* die gha-Caches sind pro Plattform gescoped (`ci.yml:79-80`, `:103`); ein geänderter
Build-Arg entwertet sie, der erste Lauf nach der Umstellung läuft also kalt.

**53. Der Backup-Job verliert seinen Träger — und im Ziel liegen zwei Regime im selben Verzeichnis.**
`starteBackupJob()` läuft heute nur `if (config.nodeEnv === "production")`
(`src/instrumentation.ts:11`). `startBackgroundWork()` (`core/bootstrap.ts:76-78`) hat **keinen**
Riegel und wird immer gerufen — ein 1:1-Umzug schriebe ab sofort auch in Dev und in jedem E2E-Lauf
stündliche Snapshots. Das Hausmuster legt den Riegel dagegen **ins Modul**
(`m/files/_lib/boot.ts:113-130`), ist also nicht das Loch, sondern der Ort.

`snapshot()` braucht das rohe better-sqlite3-Handle für `.backup(ziel)` (`backup.ts:27`) — **und dafür
gibt es ein Gegenstück**: der drizzle-Client exponiert es als `$client`
(`drizzle-orm/better-sqlite3/driver.d.ts:23`), also
`getModuleDb("lagerbuch", schema).$client.backup(ziel)`, gecacht über `globalThis.__suiteDb`
(`core/db/index.ts:25-35`). Keine zweite Verbindung, keine Änderung an `core/db`.

**Der wertvolle Teil ist die Doppel-Retention.** Ziel ist `dirname(databasePath)/backups` —
in der Suite `/data/backups`, dasselbe Verzeichnis, in das `iuk-suite/scripts/backup.sh` schreibt
(`:7-8`, `BACKUP_DIR=$DATA_DIR/backups`). Sie löschen sich **nicht** gegenseitig (`backup.sh:105`
rotiert nur `*.tar.gz`, `veralteteBackups` matcht nur `^lagerbuch-\d{8}\.db$`, `backup.ts:16`) — sie
addieren sich, unbeobachtet, auf einem Volume. Und die Körnung ändert sich: ein Tarball für alle
Module statt einer Datei je Modul, `KEEP=7` **Tarball-Generationen** (`backup.sh:13`, überschreibbar
per `BACKUP_KEEP`) statt 14 Tagen. Dass daraus „Halbierung" wird, gilt nur bei täglichem Cron; der
Takt steht nirgends im Repo. *Kein Gate:* kein Test fährt `register()` mit `NODE_ENV=production`;
`backup.test.ts` prüft nur die beiden reinen Funktionen. Plattenverbrauch ist keine Codeeigenschaft.
**Dazu der Widerspruch zwischen Code und Runbook** (Abschnitt 2.6): wer die Betriebsseite aus
`deployment.md` rekonstruiert, portiert den Job gar nicht mit.

**54. `ensureHandlager` und die E2E-Token-Fixtures fallen beide unter `shouldSeed()` — und nur eines
davon gehört dorthin.** `src/instrumentation.ts:8` ruft `ensureHandlager(getDb())` bei **jedem** Boot
ohne Umgebungsbedingung (der `production`-Riegel bei `:10` klammert nur den Backup-Job); die Zeile ist
keine Testausstattung, sondern eine fachliche Konstante (1:1-Pflicht 10). Wandert sie beim Port in
`seedAllModules()`, fehlt sie in jeder Produktionsumgebung, die **nicht** aus einem Import entsteht:
Neuaufbau, neu angelegtes Volume, Staging, oder ein Import, der `lagerorte` selektiv auslässt, weil
jemand „handlager" für Testausstattung hält. `foreign_keys = ON` macht daraus einen harten Fehler bei
der ersten Entnahme. (Beim Cutover selbst fällt es **nicht** auf: die Zeile reist mit den Altdaten
mit, weil `onConflictDoNothing` sie seit M1 in jeder Produktions-DB angelegt hat.)

**Umgekehrt gehören die E2E-Fixtures ausdrücklich NICHT in den Seed.** `e2e/migrate-db.ts:30,33-36`
und `:96-99` legen **zwei aktive Zugangstoken** mit bekannten Codes an (`111-111`, plus ein zweites) —
`tokens.code` ist der anonyme Helfer-Zugang. Heute liegen sie außerhalb der Anwendung, in einem
eigenen tsx-Prozess. Der naheliegende Port legt sie in ein `_lib/seed.ts` unter `seedAllModules()`,
und dann greift `shouldSeed()` — wahr bei `SUITE_SEED=1`, genau dem Schalter, den eine Generalprobe
gegen eine Kopie der Produktionsdaten setzt. Ergebnis wäre ein funktionierender, im Repo nachlesbarer
anonymer Schreibzugang auf dem Lagerbuch-Host. Die Suite hat diese Falle **schon einmal benannt und
vermieden**: `core/bootstrap.ts:22-25` begründet ausdrücklich, warum `files` keinen Seed bekommt.
*Kein Gate:* `shouldSeed()` ist in Dev und CI immer wahr — genau der eine Zustand, in dem
`ensureHandlager` fehlt, ist der einzige, den kein Gate fährt. Und ein Seed, der läuft, macht Tests
**grüner**, nicht roter; `seedAllModules` ist nicht testgekoppelt, es gibt keine Prüfung, die fragt,
**was** ein Modul sät.

**55. Der Helfer-Cordon verlässt die Edge — aber das gefürchtete Hauptszenario ist unmöglich.**
Heute prüft `verifyHelferSession` das jose-Cookie in der Edge, **vor** jeder Route
(`middleware.ts:26-31`), bewusst DB-frei (Kommentar `:24-25`). Der Matcher nennt `/verwaltung`,
`/helfer` und `/a` — `/g` und `/t` stehen absichtlich **nicht** darin.

Die naheliegende Sorge — ein Layout-Guard unter `src/app/m/lagerbuch/layout.tsx` gatet `/t` mit und
macht das Einlösen unmöglich — trifft **nicht** zu: `/t/[code]` ist ein **Route Handler**
(`src/app/t/[code]/route.ts`), und Route Handler werden von keinem `layout.tsx` umschlossen. Aus
demselben Grund ist die Sorge um `/m/lagerbuch/api/*` leer: lagerbuch hat vier Route Handler
(`api/auth/[...nextauth]`, `api/health`, `manifest.webmanifest`, `t/[code]`), davon liegen zwei in
`PASSTHROUGH`. Die Sorge überlebt allein für `/g/[code]` — eine **Page** — und dafür hat lagerbuch
die Lösung bereits im Baum: Routengruppen (`(gate)`, `(admin)`), die genau diesen Zuschnitt ohne
Matcher leisten. Was **real** wandert: die Laufzeit (Node statt Edge, nach dem Routen-Matching statt
davor), und `jose` ist keine Suite-Abhängigkeit. *Kein Gate:* der Schnittzuschnitt eines Guards ist
eine Entwurfsentscheidung, keine Typfrage — jede Variante typecheckt und baut, und der Ausfall ist
asymmetrisch (zu weit = laut beim ersten Scan, zu eng = still offen). `cordon.test.ts` prüft die
reinen Entscheidungsfunktionen, nicht, auf welchen Pfaden sie überhaupt gerufen werden; der Matcher
steht in **keinem** Test.

**56. PWA: die drei `public/`-PNGs brechen, `favicon.ico` ist doppelt unerreichbar — und `start_url`
ist richtig.** Der Mechanismus ist genau umgekehrt zum naheliegenden Verdacht.
`docs/spikes/2026-07-19-qr-offline-pwa.md:20-24,36` und `m/qr/manifest.webmanifest/route.ts:10-11`
halten fest, dass der Browser den **externen** Modul-Host sieht und der Rewrite serverintern unsichtbar
bleibt — `start_url: "/"` und `scope: "/"` sind deshalb korrekt, sofern `SUITE_HOST_LAGERBUCH` gesetzt
ist. Was bricht, sind die drei Dateien in `public/`: `iuk-suite/src/proxy.ts:103` schließt vom Matcher
nur `_next/static|_next/image|favicon.ico` aus, `/icon-192.png` wird auf dem lagerbuch-Host also nach
`/m/lagerbuch/icon-192.png` umgeschrieben und läuft ins 404 — während dieselbe Datei auf **jedem
anderen** Host an der Wurzel ausgeliefert wird. Der Spike sagt das ausdrücklich: „`public/` wäre der
falsche Ort: statische Dateien werden auf allen Hosts ausgeliefert." `/favicon.ico` ist doppelt
unerreichbar (einmal über `PASSTHROUGH` `routing.ts:12`, einmal über die Matcher-Ausnahme).
`manifest: "/manifest.webmanifest"` steht in lagerbuchs **Root**-Layout (`layout.tsx:28`) und muss ins
Modul-Layout, sonst bewirbt es jeder Host. **Offen, nicht behauptbar:** ob Nexts Dateikonvention
`icon.svg`/`apple-icon.png` unter `/m/<key>/` überhaupt greift, ist im Repo nicht belegt — `qr` hat
sie **umgangen** und stattdessen einen Route Handler gebaut (`m/qr/pwa-icon.svg/route.ts`). Das gehört
als Prüfpunkt in die Spec, nicht als Feststellung. Belegt bleibt: lagerbuch hat **keinen** Service
Worker (`grep` über `src/` und `public/` nach `serviceWorker|workbox|sw.js`: 0 Treffer) — es ist
installierbar, aber nicht offlinefähig; der Umzug bringt hier keine Fähigkeit mit, die zu retten
wäre. *Kein Gate:* ein Manifest an der falschen Stelle liefert 200 mit gültigem JSON; niemand prüft,
ob die genannten Pfade auflösen.

**57. Die 13 E2E-Specs zielen auf `baseURL` — in der Suite ist das der PORTAL-Host.**
Alle Specs navigieren relativ (`page.goto("/")`, `/verwaltung/artikel`, `/a/e2e-artikel`);
`iuk-suite/playwright.config.ts:38` setzt `baseURL: "http://portal.localtest.me:3100"`, und portal
trägt `requiresAuth: true` — jeder Aufruf landete im Login. Die vier vorhandenen Module arbeiten mit
absoluten Per-Host-URLs plus `devLogin(page, {host})` (`e2e/fixtures.ts:3-9`, Vorbild
`e2e/qr.spec.ts:28,35`). **Die befürchteten Zusatzarbeiten sind allerdings praktisch null:**
`SUITE_HOST_LAGERBUCH` ist **nicht** Pflicht (`registry.ts:141-148` prüft
`h === "<key>.localtest.me"` vor und unabhängig von `prodHostsFor`), und `DATA_DIR=./.data/e2e` sowie
`AUTH_COOKIE_DOMAIN=.localtest.me` stehen bereits in der Suite-Konfiguration
(`playwright.config.ts:103-104`).

**Der interessanteste Punkt ist ein weggelassener:** lagerbuchs `playwright.config.ts` migriert die DB
über einen eigenen `tsx`-Prozess **vor** `next dev`, und `e2e/migrate-db.ts:1-21` begründet das auf
zwanzig Zeilen mit einer Messung. Die Suite hat kein Gegenstück; ihr `webServer` ist
`rm -rf ./.data/e2e && next dev -p 3100` (`playwright.config.ts:81`), und `core/db/index.ts:25-35`
cacht auf `globalThis` genau wie lagerbuchs `src/db/index.ts:30`. Empirisch fährt die Suite so seit
vier Modulen ohne dieses Phänomen — es bleibt ein **Restrisiko**, keine Vorhersage. *Kein Gate:* der
baseURL-Teil ist laut (rote Specs). Der migrate-db-Teil wäre es nicht: er zeigte sich als sporadisch
rote Specs mit „no such table" — also als Flakiness, die man mit Wiederholungen zudeckt statt sie zu
verstehen.

**58. Vier Laufzeit-Abhängigkeiten fehlen der Suite**, nicht eine: `jose`, `write-excel-file`,
`@zxing/browser`, `@zxing/library` (`qrcode` und `nanoid` sind vorhanden). Unter pnpm ist ein nur
transitiv vorhandenes Paket nicht importierbar. *Kein Gate:* die Importe brechen erst beim Build der
Suite mit dem übernommenen Code — laut, aber die Aufwandsschätzung unterschlägt es sonst.

**65. Der Node-Major springt beim Umzug 24 → 26, und die Alt-Buildfiles sind auf 26 tot.**
lagerbuch pinnt Node 24 dreifach: `Dockerfile:2`/`:14` (`node:24-slim`), `mise.toml:2`
(`node = "24"`), `.github/workflows/ci.yaml:24`/`:38` (`node-version: 24`). Das Suite-Image ist
`node:26-alpine` (`iuk-suite/Dockerfile:2`, `:14`, `:23`). Der Sprung kostet drei konkrete Dinge:

**Erstens `corepack` — die Alt-Buildfiles starten auf Node 26 nicht.** `lagerbuch/Dockerfile:4` und
`implementierungsplan.md:248` setzen beide `RUN corepack enable`. Die offiziellen Node-Images bündeln
corepack seit Node 25 nicht mehr; der Befehl bricht mit exit 127 ab. Die Suite hat genau das schon
gefressen: der Dependabot-Sprung `c06b3a9` (22 → 26, 03.08.2026) hat `main` rot gemacht — die
`deps`-Stage scheiterte am **ersten** Befehl des Builds —, repariert in `f5ac24a` durch
`RUN npm i -g pnpm@11.0.9` mit ausgeschriebener Begründung in `iuk-suite/Dockerfile:3-8`. Wer beim
Portieren Dockerfile-Zeilen oder das Plan-Snippet aus lagerbuch übernimmt, baut den Fehler neu ein.
Dieselbe Stelle nennt auch die Folgepflicht: Image-Pin und `packageManager` in `package.json` sind
zwei Wahrheiten, die zusammen bewegt werden müssen (`iuk-suite/Dockerfile:6-7`; lagerbuch führt
`pnpm@11.10.0` in `package.json:5`, die Suite `pnpm@11.0.9` in `package.json:5`).

**Zweitens: die Suite pinnt Node außerhalb des Images gar nicht.** Kein `mise.toml`, keine `.nvmrc`,
kein `engines`-Block in `iuk-suite/package.json` — und `iuk-suite/.github/workflows/ci.yml:23` fährt
`node-version: 22`, während das Image 26 ist. Drei Stände: 22 in der CI, 26 im Image, ungepinnt auf
dem Entwicklerrechner. lagerbuchs `mise.toml:2` bringt einen vierten mit, der beim Umzug ersatzlos
verfällt. Alles, was außerhalb des Images läuft — Vitest, `tsx`, `drizzle-kit`, `next build` lokal —
läuft damit auf einer anderen Major als das, was ausgeliefert wird.

**Drittens Typen:** `@types/node` geht von `^22.10.7` (`lagerbuch/package.json:37`) auf `^25.6.2`
(`iuk-suite/package.json:41`) — drei Majors, und zwar oben auf den bereits vermerkten Sprung
`typescript` 5.7 → 6.0.

**Was der Sprung nachweislich *nicht* kostet:** ein `grep` über lagerbuchs `src/` und `e2e/` nach
`punycode`, `url.parse`, `new Buffer`, `--experimental`, Import-Assertions und `createRequire` liefert
**0 Treffer**; die einzigen genutzten Node-Builtins sind `node:fs` und `node:path`. better-sqlite3
`12.11.1` deckt 26 in `engines` ab (siehe den entlastenden Befund zu musl unten). Der Sprung ist also
ein reines Buildfile-Thema, kein Quelltext-Thema.

**Und er wiederholt sich:** `iuk-suite/.github/dependabot.yml:13-16` fährt das `docker`-Ökosystem
wöchentlich; so kam 22 → 26 unbeaufsichtigt herein. Die nächste Major trifft lagerbuch dann als
fünftes Modul mit.

*Kein Gate:* der Sprung passiert in lagerbuchs Repo überhaupt nicht — er passiert erst, wenn der Code
im Suite-Image landet. `pnpm lint`, `pnpm typecheck`, Vitest und die Suite-CI laufen auf Node 22 und
sehen ihn nie; nur der Image-Build läuft auf 26, und der bricht nur, wenn eine Buildfile-Zeile
mitgewandert ist. Ein `corepack enable`, das in einem übernommenen Dockerfile-Fragment überlebt,
zeigt sich als exit 127 im ersten Build-Schritt — laut, aber erst im Deploy-Pfad.

**66. Die 22 deutschen Fehlermeldungen erreichen in Produktion niemanden.** *(Dieselbe Zahl wie in
Falle 62, aber ein anderer Nenner: dort Aufrufstellen ohne `catch`, hier Meldungstexte.)* Der Rückweg
eines Action-Wurfs läuft über den Flight-Strom: `next/dist/server/app-render/action-handler.js:747-768`
verpackt den Fehler als `actionResult: Promise.reject(err)` und übergibt ihn an `generateFlight`. Der
**Produktions**-Deserialisierer im Browser-Bündel hat für eine Fehlerzeile genau einen Zweig —
`resolveErrorProd()` in
`next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.browser.production.js`,
aufgerufen für die Zeilenmarke `"Z"` und den Zeilentyp `69`. Es baut einen `Error` mit dem festen
englischen Text „An error occurred in the Server Components render. The specific message is omitted in
production builds…" und führt nur eine `digest`-Eigenschaft mit. Das **Entwicklungs**-Bündel hat
daneben `resolveErrorDev`, das `errorInfo.message` durchreicht.

Folge: jede Stelle, die `e.message` anzeigt (`InventurForm.tsx:31`, `ArtikelDrawer.tsx:74`,
`CheckFlow.tsx:159`, `LoeschDialog.tsx:33` …), zeigt im Entwicklungsbetrieb „Charge hat keinen
Restbestand im Handlager" und in Produktion einen englischen Satz über Server Components. Die 22
sorgfältig formulierten Meldungstexte in `src/actions/*` und `src/db/*` sind fachlich richtig und
betrieblich wirkungslos. Für die Suite heißt das: **jede erwartbare Fehlerlage muss als Rückgabewert
transportiert werden, nicht als Wurf** — genau die Form, die `files` schon fährt
(`m/files/(verwaltung)/actions.ts:60-61`, `:310-311`: `{ ok: true } | { ok: false; feldFehler; werte }`).
Der Wurf bleibt der Riegelfall (`core/auth/guards.ts:20-24`, `throw new Error("Forbidden")`), wo kein
Text nach außen soll.

*Kein Gate:* `playwright.config.ts:29-36` startet `pnpm dev` mit `NODE_ENV: "development"`; die Suite
ebenso (`iuk-suite/playwright.config.ts:81` startet `next dev`, `:107` setzt
`NODE_ENV: "development"`). Der einzige Prüflauf, der diese Naht überhaupt sehen könnte, sieht sie
strukturell im falschen Modus.

### Entlastende Befunde — was ausdrücklich NICHT bricht

Diese zwölf Punkte stehen hier, damit ein späterer Durchgang sie nicht als offene Fragen erneut
aufmacht:

- **Pragma-Parität.** `core/db/index.ts:17-21` setzt dieselben vier Pragmas wie `src/db/index.ts:17-20`.
  Fremdschlüssel werden in der Suite genauso durchgesetzt wie heute.
- **`sanitizeReturnTo` hält.** Ein vom Nutzer gelieferter `?returnTo` landet auf zwei Wegen in einem
  echten Redirect (`(gate)/actions.ts:16→24`, `t/[code]/route.ts:15→29`), und
  `new URL("//evil.example", "https://host")` löst zu `https://evil.example` auf — die Suite
  dokumentiert genau diese Falle bei sich selbst (`core/auth/redirect.ts:41`). `returnTo.ts:3-10` lehnt
  ab, was nicht mit `/` beginnt (`:5`), protokoll-relative `//` (`:6`), `/\` (`:7`, mit Hinweis auf die
  Browser-Normalisierung) und jeden Wert mit `:` (`:8`); `returnTo.test.ts:9-17` riegelt alle drei
  Formen ab. **Muss unverändert mit** — die Suite-Allowlist in `suiteRedirect` greift eine Ebene
  höher (Auth.js-`callbackUrl`) und deckt lagerbuchs eigenen `?returnTo` **nicht** ab.
- **`/g/<code>` bewacht sich schon heute selbst** (Abschnitt 2.4). Die Verlagerung der Cordons aus der
  Edge ins Rendering ist kein Bruch mit lagerbuchs Architektur, sondern die Verallgemeinerung eines
  Musters, das ein Viertel der Zugangspfade bereits benutzt.
- **zod 3 → 4 ist an dieser Konfiguration folgenlos.** Dasselbe Schema
  (`z.enum().default().transform()`, `z.string().url().default()`, `superRefine` mit
  `z.ZodIssueCode.custom`, `flatten().fieldErrors`) gegen lagerbuchs 3.25.76 und die Suite-Fassung 4.4.3
  ausgeführt: identisches Ergebnis in allen drei Fällen (leeres env, ungültige URL, superRefine).
  Einziger Unterschied: die Meldung heißt `Invalid url` gegen `Invalid URL` — und `config.test.ts`
  koppelt nicht an die Meldung (`.toThrow()` ohne Argument bzw. `/HELFER_SESSION_SECRET/`).
- **Die `.next/standalone`-Falle trifft lagerbuchs Unit-Tests nicht.** `createTestDb()` öffnet
  `:memory:` (`src/db/testing.ts:7`) — kein Dateisystemanker, die parallele Quellbaum-Kopie unter
  `.next/standalone/src/` kann nichts kollidieren lassen. Wer die Suite-Warnung liest und daraus
  schließt, lagerbuchs Testdateien bräuchten dieselbe Behandlung, baut eine Vorrichtung gegen ein
  Problem, das es hier nicht gibt. **Ausnahme:** `MIGRATIONS_FOLDER = "./drizzle"` (`src/db/index.ts:42`)
  ist cwd-relativ und wird von Tests, Instrumentation und dem E2E-Skript gleichermaßen gelesen — eine
  Konstante, die mit umziehen muss.
- **Next 15.1 → 16.2 kostet an dieser Codebasis wenig, und die Treffer sind laut.** Die asynchronen
  Reqüst-APIs sind **bereits** umgesetzt: zehn dynamische Routen typisieren `params: Promise<…>`,
  keine einzige synchron; vier Seiten awaiten `searchParams` (`(gate)/page.tsx:10-11`,
  `journal/page.tsx:13,15`, `checks/page.tsx:13,15`, `helfer/check/page.tsx:11-12`); `cookies()` und
  `headers()` werden durchweg awaited. Drei echte Treffer: `next lint` gibt es nicht mehr
  (`next-lint.js` fehlt in `iuk-suite/node_modules/next/dist/cli/`, während `package.json:10` es
  führt), `middleware.ts` heißt `proxy.ts` und gehört der Suite, und `typescript` 5.7 → 6.0 ist der
  einzige ungeprüfte Major. `next-auth` geht **rückwärts** (beta.31 → beta.30), aber der
  TS2664-Workaround (`src/auth.config.ts:4-10`) wird gegenstandslos, weil lagerbuchs ganze
  Auth-Konfiguration mit dem Suite-SSO verschwindet. `drizzle-orm` (^0.45.2) und `better-sqlite3`
  (^12.11.1) sind in beiden Repos identisch, React geht 19.0 → 19.2.6.
- **lagerbuch trägt den `sub`-Fix bereits.** `src/auth.config.ts:85` setzt
  `token.sub = profile?.sub ?? token.sub` — genau die Zeile, deren Fehlen in `feedback` 13
  `known_users`-Zeilen für eine Person in drei Tagen erzeugt hat
  (`KONSOLIDIERUNG-PROGRESS.md`, Post-Cutover-Befunde feedback, Punkt 1). Sie muss beim Übersetzen auf
  die Suite-Auth erhalten bleiben oder durch deren bereits gefixte Fassung ersetzt werden — ein
  Weglassen ohne Ersatz nicht.
- **Der React Compiler bricht den Barcode-Scanner nicht.** Die Suite fährt `reactCompiler: true`
  (`iuk-suite/next.config.ts:3`), lagerbuch nicht — aber die Prämisse „Ref-Mutation während des
  Renderns" trifft auf `BarcodeScanner.tsx` nicht zu: alle drei Refs werden ausschließlich in
  Callbacks und Effekten geschrieben (`:35`, `:56`, `:82`, `:96`, `:148`). Die Wirkrichtung ist sogar
  umgekehrt: beide Aufrufer übergeben Inline-Arrows (`geraete/scan/GeraetScanner.tsx:9-10`,
  `bz/scan/GeraetScanner.tsx:9-10`), die heute bei jedem Render neue Identität haben →
  `pruefeCode` ändert sich (useCallback-deps `:59`) → `useEffect([pruefeCode])` (`:98`) reißt die
  Kamera ab und baut sie neu auf. Auto-Memoisierung **stabilisiert** das. Randbeobachtung: die
  eslint-Konfiguration der Suite (`eslint.config.mjs:15`) lädt keine react-compiler-Regel — als
  eigenständiger Portierungsposten trägt das nicht.
- **better-sqlite3 auf musl ist beantwortet — und der `>2,5 h`-Lauf, der dagegen zitiert wird, hatte
  eine andere Ursache.** Die Suite fährt seit ihrem allerersten Image Alpine (`9d9e79f`, 18.07.2026,
  damals `node:22-alpine`; seit `c06b3a9` vom 03.08.2026 `node:26-alpine`), und unter dieser Basis
  sind `qr`, `feedback` und `files` dazugekommen. better-sqlite3 ist in beiden Repos **dieselbe**
  Version (`iuk-suite/package.json:25`, `lagerbuch/package.json:19`: `^12.11.1`) und deklariert
  `engines.node: 20.x || 22.x || 23.x || 24.x || 25.x || 26.x`
  (`node_modules/better-sqlite3/package.json:18-20`). Im letzten grünen Lauf greift `prebuild-install`
  auf **beiden** Architekturen unter einer Sekunde: arm64 `09:59:36.4 → 09:59:37.0` (0,8 s), amd64
  `09:59:52.0 → 09:59:52.4` (0,4 s), jeweils
  `better-sqlite3 install$ prebuild-install || node-gyp rebuild --release` → `install: Done`
  (Actions-Run `30802917011`, Jobs `91654028783`/`91654028799`). `f5ac24a` schreibt es ausdrücklich
  aus: „better-sqlite3 12.11.1 findet auch für ABI 147 einen musl-Prebuild — auf linux/arm64 wie auf
  linux/amd64." Das ist auch der Grund, warum das Image ohne `python3/make/g++` auskommt, obwohl
  `pnpm-workspace.yaml` (`allowBuilds: better-sqlite3: true`) das Install-Skript laufen lässt.
  **Korrektur an einer Quelle im eigenen Repo:** `iuk-suite/.github/workflows/ci.yml:33-34` begründet
  die native Runner-Matrix damit, der emulierte arm64-Build habe „better-sqlite3 nativ kompiliert".
  Zwei Logs widersprechen dem. Der Job, dessen Dauer der Kommentar nennt, ist Run `29690003612`, Job
  `build-push`/`88201057292`, `14:02:48 → 16:33:22` = 2 h 30 min 34 s, `cancelled`. Die letzte
  Build-Ausgabe ist `#28 18.25 qemu: uncaught target signal 4 (Illegal instruction) - core dumped` um
  `14:04:37`, mitten in `pnpm install` (`Progress: resolved 499, reused 0, downloaded 20, added 4`) —
  also **bevor** irgendein Install-Skript laufen konnte; danach 2 h 28 min Stillstand bis zum Abbruch.
  Im gesamten 1978-zeiligen Job-Log kommen `better-sqlite3`, `node-gyp` und `prebuild-install` **null**
  mal vor. Und 45 Minuten früher, auf derselben Basis (`node:22-alpine`, ABI 127) und mit demselben
  QEMU-Multi-Arch-Build, lief Job `88197124910` (Run `29688524233`) in 7 min 02 s **grün** — mit
  `prebuild-install || node-gyp rebuild --release` → `install: Done` in 5,9 s, ohne eine einzige
  `node-gyp`-Zeile. Der musl-Prebuild griff also schon damals, emuliert. Was den 2,5-h-Lauf gekostet
  hat, war QEMU, nicht ein Quellbau. (Ältere Belege gibt es nicht: der Actions-Verlauf reicht nur bis
  `2026-07-19T08:18:33Z` zurück, 88 Läufe; die Läufe vom 18.07., an dem die Multi-Arch-CI entstand,
  sind nicht mehr vorhanden.) Die Abhilfe steht ohnehin schon (`ci.yml:37-47`, native Matrix; im
  letzten Lauf arm64 2 min 51 s, amd64 4 min 01 s), und lagerbuch bringt **keine weitere native
  Abhängigkeit** mit: `jose`, `qrcode`, `nanoid`, `write-excel-file`, `@zxing/browser`,
  `@zxing/library` sind reines JS (`lagerbuch/package.json:17-29`). *Konsequenz für spätere
  Durchgänge:* weder `implementierungsplan.md:242` noch `ci.yml:33-34` taugen als Beleg dafür, dass
  musl den Umzug etwas kostet.
- **Für unbekannte Pfade wird der Port eine Verbesserung, keine Regression.** lagerbuch hat **keine**
  `not-found.tsx` und **keine** `error.tsx` — im ganzen `src/app`-Baum liegt keine der beiden Dateien.
  `notFound()` in `src/app/g/[code]/page.tsx:33` (gescannter Geräte-Barcode ohne Treffer) rendert also
  heute Next.js' eingebaute Standardseite. Die Suite bringt an derselben Stelle
  `src/app/not-found.tsx` mit — gestaltet, in beiden Themes, mit Test.
- **Die drei nackten `catch {}`-Blöcke schlucken nichts.** `BarcodeScanner.tsx:49-50` und `:90-91`
  sowie `ArtikelTable.tsx:143-144` setzen jeweils eine sichtbare deutsche Meldung; der leere
  Klammerausdruck betrifft nur die Fehlervariable, nicht die Anzeige. Unverändert übernehmbar.
- **Das fehlende `loading.tsx` ist keine Lücke.** Beide Repos führen keines, und alle Einstiegsseiten
  sind `force-dynamic` (`g/[code]/page.tsx:8`, `(gate)/page.tsx:8`, `a/[artikelId]/page.tsx:8`,
  `helfer/page.tsx:5`) — der Wartezustand ist vorher wie nachher der Server-Rundlauf.

---

## 6. Die Entscheidungen

Siebenunddreißig, fortlaufend nummeriert über alle Dimensionen. **Zwanzig blockieren die Spec** und
sind so markiert; die übrigen können nach dem Spec-Beginn fallen, gehören aber ins Dokument, damit
sie nicht als Nebenwirkung entschieden werden. Die Entscheidungen 35–37 sind später ergänzt und
stehen am Ende ihres jeweiligen Themenblocks, damit kein Rückverweis auf 1–34 still verschoben wird;
`10a` ist ein Teilpunkt zu Entscheidung 10, keine eigene Nummer.

### Datenmodell und Fachlichkeit

**1. Behält der neue Check-Zählschritt den Vorbelegungs-Default „Ist = Soll" und sendet weiterhin
ALLE Positionen? ⛔ blockiert die Spec**
Optionen: (a) 1:1 übernehmen (`CheckFlow.tsx:97/:146`); (b) auf die Inventur-Konvention wechseln (nur
angefasste Positionen); (c) Hybrid — Default = Soll für die Anzeige, aber serverseitig ein explizites
`gezaehlt: boolean` je Position, damit Nicht-Zählung im Journal sichtbar bleibt.
*Daran hängt:* das Buchungsverhalten jedes Fahrzeug-Checks; ob `checkAbschluss` einen neuen Feldnamen
im Zod-Schema und in `checks.ergebnis` bekommt (Formatversion 3); und ob `check.test.ts:63-71` und
`e2e/geraete.spec.ts:59-61` beim Port umgeschrieben werden müssen. **Empfehlung: (a)** — die heutige
Konvention ist dokumentiert und testverankert; wer sie ändert, ändert eine bewiesene Invariante.
(c) wäre die einzige Variante, die den fehlenden Nachweis („wurde tatsächlich gezählt?") nachrüstet,
und kostet ein Schemafeld.

**2. Bleibt `zustand` ein freier String mit dem Vertragswert „Defekt"? ⛔**
Optionen: (a) 1:1 (`z.string()`, kein Migrationsaufwand); (b) Enum in zod plus geteilte Konstante in
einem `_lib/`-Modul **ohne** `"use client"` (wegen Falle 6 der Suite-`CLAUDE.md`), Altdaten unberührt;
(c) Enum plus Backfill der historischen `checks.ergebnis`-JSONs.
*Daran hängt:* ob `geraeteAuffaellig` in Übersicht und Detail für Altchecks weiter stimmt
(`queries.ts:379/:499`); ob der Playwright-Spec nach dem antd-Umbau noch etwas Fachliches absichert.

**3. Was passiert mit `BESTELL_FAKTOR`? ⛔**
Optionen: (a) ersatzlos streichen (der Code ist die Wahrheit: Vorschlag = Lücke bis Mindestbestand);
(b) die Plan-Formel implementieren (`Faktor × Mindestbestand − Bestand`) — ändert **jede**
Bestellmenge; (c) beibehalten und in `vorschlagsmenge` tatsächlich verdrahten, Default auf 1
(verhaltensneutral). *Daran hängt:* jede Zeile der Bestellliste; ob `implementierungsplan.md:202` als
Spezifikation oder als überholtes Dokument gilt. **Kein Rückbau ohne Betreiberantwort** — ein
abweichend gesetztes `BESTELL_FAKTOR` in Produktion würde beweisen, dass der Betreiber ein Verhalten
erwartet, das der Code nie hatte (Betreiberfrage 7/8).

**4. Wird das Migrationsverzeichnis 1:1 übernommen oder frisch generiert — und wie kommen die Daten
in die Ziel-DB? ⛔**
Das ist **ein** Entscheidungscluster, kein Vierteiler. Die Teile: (i) sieben `.sql`-Dateien samt
`meta/_journal.json` wörtlich nach `src/app/m/lagerbuch/_db/migrations` **oder** neu aus `schema.ts`
generieren; (ii) `lagerbuch.db` als **Datei** nach `/data/lagerbuch.db` kopieren **oder** zeilenweise
über ein `scripts/import/lagerbuch.ts` in eine frisch migrierte DB; (iii) `src/db/append-only.test.ts`
mitportieren oder nicht.

Die Teile sind gekoppelt: **regenerieren lässt die Trigger still weg** (Falle 1), und regenerieren ist
zugleich der Hausstil (alle vier portierten Module tragen frische `0000`-Squashes plus Zeilenimport in
eine leere DB). **Dateikopie** vermeidet jede Feldzuordnung, verlangt aber unveränderte `when`-Werte
(1:1-Pflicht 9) und liefert **keinen** Paritätsbeweis; sie bräuchte stattdessen Zeilenzahlen je
Tabelle, `PRAGMA integrity_check`, `PRAGMA foreign_key_check` und eine fachliche Invariante
(Bestandssumme je Artikel, höchster `buchungen.ts`, Zahl aktiver Tokens).

**Zwei Randbedingungen, die unabhängig von der Wahl gelten:** die Trigger blockieren nur `UPDATE` und
`DELETE` auf `buchungen` — ein zeilenweiser Importer mit reinem `INSERT` läuft durch, ein
korrigierend nachpflegender nicht. Und `onConflictDoUpdate` (das Muster beider vorhandener Importer)
**bricht** an `buchungen` beim zweiten Lauf: gemessen `FAILED: journal ist append-only`. Wiederholbar
ist der Import mit `onConflictDoNothing` bzw. `INSERT OR IGNORE` (gemessen: läuft durch) — für ein
append-only-Journal die fachlich richtige Strategie, und das Idiom steht bereits in diesem Repo
(`src/db/seed-handlager.ts:9`). **`INSERT OR REPLACE` ist die Falle:** es läuft bei
`recursive_triggers = 0` (dem gemessenen Default; `openModuleDatabase` setzt genau vier Pragmas, dieses
ist keines davon) **durch und umgeht den Trigger** — mit `ON` scheitert derselbe Aufruf. Wer den
Abbruch so „repariert", hebelt die Append-only-Zusage lautlos aus. `assertParity` bleibt trotzdem
wirksam, weil `rowChecksum` den vollständigen Zeileninhalt vergleicht und einen Teilimport aufdeckt.

**Einfügereihenfolge:** 16 Tabellen mit einer Referenz, die rückwärts aussieht
(`lagerorte.templateId` → `fahrzeug_templates`, `schema.ts:15`). Eine tragfähige Reihenfolge ist
artikel → fahrzeug_templates → template_positionen → lagerorte → chargen → soll_positionen →
buchungen/checks/lagerort_verfall → bz_geraete/o2_flaschen/geraete → bz_kontrollen/o2_messungen. Der
Graph ist damit ein DAG; `PRAGMA defer_foreign_keys = ON` innerhalb der Transaktion ist die zweite
Abhilfe (gemessen: wirkt).

**5. Werden `bz_kontrollen` und `o2_messungen` ebenfalls per Trigger append-only gemacht?**
Optionen: (a) wie heute (nur Insert im Code, kein Trigger); (b) Trigger analog `0001` auf beide —
beweisfeste Logbücher, aber Korrekturen brauchen dann eine Storno-Semantik, die es heute nicht gibt;
(c) Trigger nur auf `bz_kontrollen` (Medizinprodukte-Nachweis), `o2_messungen` bleibt korrigierbar.
*Daran hängt:* ob eine versehentlich beim Check erfasste Flaschenmessung (Default = Nennfülldruck,
Falle 8) je wieder aus dem Verlauf verschwinden kann.

**6. Wird der laxe Monats-Regex auf `MONAT_REGEX` vereinheitlicht?**
Optionen: (a) nur die zwei Eingangsprüfungen vereinheitlichen (`buchung.ts:17`, `bz.ts:83`);
(b) zusätzlich CHECK-Constraint in einer neuen Migration; (c) vereinheitlichen plus Bestandsprüfung
vor dem Cutover, ggf. Korrekturbuchung für fälschlich abgelaufene Chargen. *Daran hängt:* ob eine
Migration mit CHECK am Produktionsbestand scheitert; ob heute Chargen zu Unrecht als abgelaufen
geführt werden (Betreiberfrage 11).

**7. Bleibt der Bestand rein rekonstruktiv?**
Optionen: (a) 1:1 (`implementierungsplan.md:87`) — einfach, aber O(Journal) je Seitenaufruf;
(b) rekonstruktiv, aber die N+1-Muster in `queries.ts:35-56` durch je **eine** aggregierende
SQL-Query ersetzen (verhaltensgleich, kein Schemäingriff); (c) materialisierte Bestandstabelle —
zweiter Wahrheitsspeicher, widerspricht der Leitplanke. *Daran hängt:* Antwortzeiten bei der realen
Journalgröße (Betreiberfrage 9); ob die Portierung ein Datenmodell-Thema ist oder nur ein
Query-Thema. **Empfehlung: (b)** — es ist verhaltensneutral und fällt beim Neubau der Leseseite
ohnehin an.

**8. Wird der Löschpfad saniert, und bleibt Hard-Delete überhaupt?**
Optionen: (a) fehlende Zähler ergänzen (`template_positionen.artikelId`, `tokens.zielId`),
Hard-Delete bleibt; (b) Hard-Delete ganz streichen, nur noch Deaktivieren — passt zum
append-only-Geist und beseitigt die Fehlerklasse strukturell; (c) beibehalten, aber in eine Transaktion
mit Fangnetz für FK-Fehler und freundlicher Meldung. *Daran hängt:* ob die Verwaltung eine Aktion
anbietet, die reproduzierbar in eine redigierte Fehlermeldung läuft; ob gedruckte Codes ins Leere
zeigen können. **Nebenentscheidung dazu:** `loescheElement` in eine Transaktion ziehen (Falle 5,
dritter Teil) — unabhängig von der Wahl.

### Auth und Zugang

**9. Bekommt lagerbuch die Suite-Admin-Abkürzung? ⛔**
Optionen: (a) **files/feedback-Gabel** — keine Abkürzung, das Prädikat liest `adminGroupsFor` +
`requiredGroupsFor` und sonst nichts (`m/files/_lib/access.ts:62-69`); (b) **qr/portal-Muster** —
`isModuleAdmin` aus `core/groups`, damit ist der Suite-Betreiber überall Admin und das Modul nicht
aussperrbar. *Daran hängt:* alles hinter `/verwaltung` — Bestände, das Journal mit Klarnamen, der
Etikettendruck mit den Token-Codes im Klartext, das Sperren von Codes. Die Begründung, mit der
`feedback` die Abkürzung abgeschafft hat („Betrieb und Einsicht sind zwei Rollen",
Entscheidungs-Log 2026-07-28), trägt für ein Lagerbuch mit Journal und Personennamen mindestens
genauso weit. Die Gegenseite: lagerbuch hat heute genau **eine** Rolle, und die Abkürzung verhindert,
dass sich der Betreiber bei einer Gruppen-Fehlkonfiguration aussperrt. **Nicht** verhandelbar ist der
Mechanismus: `session.user.isAdmin` ist es in **keinem** Fall (Falle 13); die Suite hat die richtigen
Riegel fertig (`core/auth/guards.ts:20-25` und `:28-33`).

**10. Wo laufen die beiden Cordons nach dem Umzug? ⛔**
Optionen: (a) **modulintern als aufrufbare Funktion** in `_lib/` nach dem Muster
`requireFeedbackAccess`/`files/_lib/access.ts`; `requiresAuth: false` in der Registry, jedes Layout
unter `/verwaltung` ruft sie ausdrücklich, und `/helfer`+`/a` bekommen einen eigenen Guard in einer
Routengruppe (`/g` und `/t` bleiben außerhalb, siehe Falle 55); (b) **Sonderfall in
`core/routing.ts`** — ein Pfadpräfix je Modul, das trotz `requiresAuth: false` gegatet wird; verstößt
gegen die core-Regel, wäre aber der einzige Weg, den Riegel **vor** das Rendern zu bekommen;
(c) **zwei Hosts** wie bei `files`: ein anonymer Host für Gate//t//a//helfer und ein
Verwaltungs-Host mit `requiresAuth: true`. *Daran hängt:* Falle 13 (ohne Riegel ist `/verwaltung` für
jeden SSO-Nutzer offen), Falle 17 (Layout gegen Funktion) und Falle 18 (Action-POSTs). Option (c)
kostet eine zweite Domain und macht jeden erzeugten Link host-abhängig — genau die Komplexität, die
`files` mit `hostFuerRolle`/`oeffentlicheUrl` bezahlt hat.

(d) **das `files`-Muster übernehmen** — eine modul-eigene Host→Rolle-Auflösung, die auf jedem fremden
Host `notFound()` liefert. Das ist keine neue Idee, sondern der produktiv laufende Bau von `files`:
`m/files/_lib/hostRolle.ts:90-120` bietet `rolleOderNull` (wirft nicht — die Form für Route Handler),
`resolveRole` und `requireRolle` (werfen — die Form für Layouts und Seiten), verankert in drei
Group-Layouts und zehn Route Handlern. `notFound()` statt 403 ist dabei Hausregel, nicht Geschmack
(`docs/design/README.md:237-242`: die Existenz eines Pfades auf dem falschen Host wird nicht
verraten). Die Begründung steht dort bereits in genau unserer Sache ausgeschrieben:
„`core/routing.ts:57-67` laesst den internen `/m/<key>`-Pfad bei `requiresAuth: false` ungegatet
durch" (`m/files/api/upload/[fileId]/route.ts:57-62`). *Daran hängt:* Falle 61 und, über die
Cookie-Herkunft, Entscheidung 17.

**(d) ist keine Alternative zu den anderen drei: zu (a) und (b) additiv, unter (c) Voraussetzung.**
(a)/(b) beantworten „wer darf", (d) beantwortet „auf welchem Host existiert dieser Pfad überhaupt".
Unter (c) trägt der Host die Rolle — und weil `requiresAuth` ein einziger Boolean je Modulschlüssel
ist (`core/registry.ts:9-36`), kann der Verwaltungs-Host nur modulintern gegatet werden; ohne (d)
ist er über `/m/lagerbuch/verwaltung/*` von jedem anderen Suite-Host aus offen (Falle 61). Route
Handler brauchen (d) in jedem Fall einzeln, weil sie kein Layout haben — bei lagerbuch trifft das
genau `/t/<code>`; von den vier Handlern liegen `api/auth/[...nextauth]` und `api/health` in
`PASSTHROUGH` und gehören der Suite, und `manifest.webmanifest` ist der Träger von Falle 56.

**Zwei Kosten, die schon dokumentiert sind, bevor jemand sie neu findet.** Erstens: ohne gesetzten
`SUITE_HOST_LAGERBUCH` liefert eine Auflösung über `prodHostsFor` für **jeden** Host `null`; eine
unbesehene Kopie 404t damit das ganze Modul vor dem Cutover — `files` schreibt genau diesen Zustand
an `m/files/api/s/[id]/qr.png/route.ts:71` aus. lagerbuch braucht also entweder den Zweig „kein
Prod-Host konfiguriert → durchlassen" oder die Auflage, `SUITE_HOST_LAGERBUCH` schon in Dev und E2E
zu setzen. Zweitens die Wahl des Prädikats: `moduleForHost(resolveHost(headers))?.key === "lagerbuch"`
(`core/registry.ts:141-148`) deckt den Dev-Host `lagerbuch.localtest.me` **ohne** jede Env-Variable
mit ab, ein direkter Vergleich gegen `prodHostsFor` tut das nicht. `resolveHost` wird in beiden Fällen
**wiederverwendet und nicht nachgebaut** — die Vorrangregel `x-forwarded-host` vor `host` ist nach
dem Rewrite der Middleware die einzig richtige (`core/routing.ts:14-35`, `hostRolle.ts:85-88`).

**Empfehlung: (a) + (d)**, nicht (a) allein — (a) allein lässt die in Falle 61 beschriebene Tür
offen, und (d) allein ersetzt keinen Zugriffsriegel. Dazu die ausdrückliche Auflage, dass die
Vollständigkeit der 44 Action-Guards Datei für Datei nachgewiesen wird — sie ist die eigentliche
Zusage, nicht der Cordon.

**10a. Was sieht eine angemeldete Person ohne Lagerbuch-Gruppe? (Teilpunkt zu 10) ⛔**

*Zuerst die Umkehrung, weil sie die Optionen sortiert.* Diesen Zustand gibt es in lagerbuch **heute
gar nicht**. `src/auth.config.ts:90` lässt den OIDC-Login nur durch, wenn die Admin-Gruppe im Token
steht, und `:100` weist ihn sonst ab — ohne Gruppe entsteht nie eine Sitzung. Der Zweig „angemeldet,
aber kein Admin" (`src/lib/auth/cordon.ts:19`) ist damit eine Vorsichtsmaßnahme ohne erreichbaren
Fall; getestet ist er (`cordon.test.ts:14-17`), aber der Login davor lässt niemanden dorthin kommen.
Die reale Kundschaft von `/verwaltung/kein-zugriff` ist die **abgewiesene Anmeldung**:
`auth.config.ts:72` macht die Seite zum `pages.error`-Ziel, `cordon.ts:15` lässt sie deshalb **ohne
Sitzung** passieren, und `cordon.test.ts:22-26` sichert genau das mit der Begründung „sonst
Endlosschleife" ab — eine Schleife, die nur entstehen kann, wenn dort Leute **ohne** Sitzung ankommen.

In der Suite dreht sich das um. Die Suite hat **keinen `signIn`-Callback** — ein `grep` auf `signIn`
über `src/core/auth/` liefert nur den Seitenpfad (`config.ts:94`), die exportierte Aktion
(`index.ts:11`), `pocketId.ts` und Tests, **keinen Callback** —, jede Person mit Pocket-ID-Konto
bekommt eine Sitzung, gegatet wird erst hinterher (`core/registry.ts:44-101`,
`core/auth/guards.ts:20-33`). „Angemeldet ohne Lagerbuch-Gruppe" ist nach dem Port also nicht mehr der
unerreichbare Rand, sondern der **Normalfall**: jede Person, die das Portal benutzt und
`/m/lagerbuch/verwaltung` aufruft.

*Der Suite-Ausgang ist dabei **kein nacktes 404**.* `moduleAdminPageOrNotFound` ruft `notFound()`
(`core/auth/guards.ts:28-33`), und `notFound()` rendert in dieser Suite `src/app/not-found.tsx` — eine
gestaltete Seite, deren **zweiter Absatz genau für diesen Fall** geschrieben wurde: „Möglich ist auch,
dass die Seite deinem Konto nicht offensteht: Was nicht freigegeben ist, sieht in dieser Suite genauso
aus wie etwas, das es nicht gibt. Wenn du sie eigentlich brauchst, wende dich an die Administration."
Der Dateikopf nennt die Riegel, für die sie entstand (`requireFeedbackAccess`, `assertGroupAccess`,
der Gruppenvergleich), `not-found.module.css` trägt die Farben und `not-found.test.tsx` riegelt
Hell/Dunkel-Paare und die `--ant-*`-Falle ab. **Die Suite hat für diese Lage also bereits einmal
nachgebessert:** die Seite kam am 2026-08-02 (`582d354`, `59d03b1`) — nachweislich *nach* den Riegeln,
die sie in ihrem eigenen Kopf als Anlass nennt, und ausdrücklich mit dem Satz, die 404-Entscheidung
bleibe, „aber sie darf niemanden im Dunkeln stehen lassen" (`src/app/not-found.tsx:20-21`). (Ob das
zeitlich nach dem `feedback`-Cutover lag, lässt sich aus dem Repo **nicht** belegen:
`docs/runbooks/feedback-cutover.md` trägt kein Datum. Für das Argument ist es auch unnötig.) Verloren
geht beim Port also nicht die Gestaltung, sondern die **Genauigkeit**: der Gruppenname und der Satz
„Wende dich an die Leitung." (`src/app/verwaltung/kein-zugriff/page.tsx:9-11`).

Optionen: (a) **Suite-Standard** — `moduleAdminPageOrNotFound` und fertig; `kein-zugriff` wird
ersatzlos gestrichen. *Kosten:* die Seite trägt bewusst **keine** Shell und keine Modulnavigation
(`not-found.tsx`, Dateikopf) — das ist dort richtig begründet, heißt für lagerbuch aber, dass ihr
einziger Knopf `href="/"` ist, und der führt unter dem Host-Rewrite an den **Anfang genau dieses
Moduls**. **Wohin das führt, entscheidet Entscheidung 15:** bleibt das Gate der Modulanfang, bekommt
eine angemeldete Person ohne Lagerbuch-Gruppe ein Token-Feld angeboten, das ihr Problem nicht löst
(`src/app/(gate)/page.tsx:10-25`). *Nutzen:* null Zusatzarbeit, bereits getestet, bereits in beiden
Themes. (b) **`kein-zugriff` portieren** — eine modul-eigene Seite unter
`/m/lagerbuch/verwaltung/kein-zugriff`, auf die der Guard statt `notFound()` weiterleitet. *Kosten:*
erstens ist das die Rückkehr zur 403-förmigen Auskunft, die die Suite ausdrücklich abgeschafft hat
(„Bewusst 404 statt 403: ein 403 verriete, dass es die Admin-Route gibt", `core/auth/guards.ts:16-17`)
— für `/verwaltung` mit Journal, Klarnamen und Klartext-Codes ist das keine Formalie. Zweitens kommt
die Optik **nicht** mit: die Seite lebt von `.gate`/`.gatebrand`/`.gatesub` aus
`src/app/globals.css:116-120`, die beim antd-Neubau ohnehin fallen — es ist ein Neubau, keine
Übernahme. Drittens braucht sie eine Antwort auf die Erreichbarkeit: ohne `pages.error` (Abschnitt
3.2) und ohne den abweisenden `signIn`-Callback gibt es den Weg nicht mehr, über den heute fast alle
dort ankommen. (c) **Suiteweite 403-Seite** — *Kosten:* am höchsten. Sie kehrt eine niedergeschriebene
`core`-Entscheidung um (`guards.ts:16-17`), fasst `core` an und fällt damit unter die Regel „nur was
ein **zweites, heute belegbares** Modul braucht" (`docs/design/README.md:23-33`) — lagerbuch allein
belegt sie nicht. Dazu: die Next-Interrupts `forbidden()`/`unauthorized()` stehen **nicht** zur
Verfügung, `iuk-suite/next.config.ts` setzt `authInterrupts` nicht (die Datei hat genau drei Optionen:
`reactCompiler`, `output`, `allowedDevOrigins`), und ein `grep` auf `forbidden(`/`unauthorized(` über
`src/` liefert null Treffer. (c) hieße also Flag **plus** Seite **plus** Umbau der beiden Guards.

*Daran hängt:* die Sichtbarkeit der häufigsten Go-live-Fehlkonfiguration. Betreiberfrage 3 endet
heute mit „Ein falscher Wert erzeugt keinen Fehler, sondern ein stummes 404 für alle Verwaltenden" —
dieser Teilpunkt entscheidet, wie stumm. In dieselbe Lücke fällt der `console.warn` aus
`src/auth.config.ts:94-99`, dessen Wegfall Entscheidung 15 bereits festhält: er protokolliert genau
den Abweisungspfad, der mit dem `signIn`-Callback verschwindet. Beide Verluste betreffen denselben
Vorgang — die eine Hälfte für die Person vor dem Bildschirm, die andere für `docker logs`.

**Empfehlung: (a), mit zwei ausdrücklich mitentschiedenen Punkten.** Der Suite-404 ist die richtige
Grundform und bereits gehärtet; was lagerbuch mitbringt und die Suite nicht hat, ist die
*Benennbarkeit* der Ursache. Erstens: für die, die es beheben können, der wiederhergestellte
`console.warn` aus Entscheidung 15 — er beantwortet die Fehlkonfiguration in `docker logs`, ohne die
Existenz der Admin-Route gegenüber allen anderen preiszugeben; das ist der billige Teil. Zweitens:
für die Person vor dem Bildschirm bleibt eine Einbuße, und sie wird bewusst hingenommen — der Log
hilft ihr nicht, und der 404 nennt weder den Gruppennamen noch die Leitung. Der Gegenwert ist die
Zusage aus `guards.ts:16-17`, dass die Existenz von `/verwaltung` nicht verraten wird, und die ist bei
einem Journal mit Klarnamen und Klartext-Codes mehr wert als die genauere Auskunft. Wer das anders
gewichtet, wählt (b) und entscheidet damit zugleich, dass `/verwaltung` seine Existenz preisgeben darf.

**11. Behält die Helfer-Sitzung ein eigenes `HELFER_SESSION_SECRET`, und wird es 1:1 übernommen? ⛔**
Optionen: (a) eigenes Geheimnis beibehalten (`config.ts:42` + Prod-Refinement `:109-111`) — eine
zusätzliche Pflichtvariable in der Suite-`.env` **und** eine zusätzliche Bootstrap-Prüfung, die die
Suite heute nicht hat (Falle 23); (b) `AUTH_SECRET` mit Domänenpräfix nach dem Hausmuster von `files`
(`m/files/_lib/passwort.ts:30-36`: „Kein neues Geheimnis in der `.env` — `AUTH_SECRET` ist bereits
Pflicht") — das heutige jose-JWT trägt **keinen** Domänentrenner, der müsste also neu dazu.
*Daran hängt:* ob bestehende `helfer_session`-Cookies den Cutover überleben (bei Wechsel: nein, alle
Feld-Sitzungen enden schlagartig — bei laufenden Fahrzeug-Checks am Cutover-Abend relevant, siehe
1:1-Pflicht 19) und ob die Suite eine weitere Pflichtvariable bekommt, deren Fehlen erst zur Laufzeit
auffällt. **In jedem Fall gilt:** die Compose-Zeile muss `${VAR:?…}` tragen, nicht `${VAR}`
(Falle 23).

**12. Welches Rate-Limit zieht um, und woher kommt die Client-IP? ⛔**
Optionen: (a) `core/ratelimit.ts` benutzen **und** `clientIpAus` um die XFF-Richtung korrigieren bzw.
um einen zweiten Modus erweitern; (b) lagerbuchs `consumeRate`/`clientIp` als modul-eigene Datei
mitnehmen und die Suite-Notbremse für dieses Modul nicht anfassen; (c) beides behalten und die
Richtungsfrage über eine Env-Variable („Anzahl vertrauenswürdiger Proxies") auflösen.
*Daran hängt:* Falle 12 — direkt die Brute-Force-Sicherheit sechsstelliger Codes. **Solange nicht
feststeht, wie viele Proxies vor der Suite stehen und welcher Eintrag der echte ist, ist jede der drei
Optionen geraten** (Betreiberfrage 6). Mitzüntscheiden: die Bindestrich-Normalisierung und ob der
Verbrauch vor oder nach der Codeprüfung stattfindet (Falle 24) — `feedback` hat nach einem
Produktionsausfall auf `${ip}|${surveyId}` mit 60/10min umgestellt.

**13. Wird das Sperren eines Tokens auch lesend durchgesetzt? ⛔**
Optionen: (a) Verhalten 1:1 (DB-Recheck nur bei schreibenden Aktionen — das **ist** die Spec, siehe
Abschnitt 2.4); (b) `getHelferPayload` um den `tokens.aktiv`-Recheck erweitern — ein zusätzlicher
SQLite-Lookup pro Helfer-Seitenaufruf, technisch trivial, aber eine Verhaltensänderung; (c) Mittelweg:
Recheck im Helfer-Layout und auf `/a/<id>`, nicht auf jedem RSC-Teilaufruf.
*Daran hängt:* was passiert, wenn ein laminiertes Etikett aus einem Fahrzeug verschwindet — heute kann
der Finder bis zu 12 h lang den gesamten Bestand lesen, auch nachdem der Code gesperrt wurde.
**Der Port macht (b) billiger als heute:** die Helfer-Prüfung wandert ohnehin aus der Edge in den
Node-Kontext, wo der DB-Recheck ohne Zusatzaufwand möglich ist.

**14. Wird `tokens.scope_lagerort_id` zu einem echten Riegel, bleibt es Dekoration, oder fällt die
Spalte weg?**
Optionen: (a) zum Riegel machen (in die Sitzung aufnehmen wie in `implementierungsplan.md:51`
vorgesehen und `checkAbschluss`/`bucheEntnahmeHelfer` dagegen prüfen); (b) unverändert mitnehmen und
im Modul-README als bewusst nicht durchgesetzt ausschreiben; (c) Spalte streichen, `ziel_typ`/`ziel_id`
bleiben als Vorauswahl. *Daran hängt:* Falle 14. **(a) ist eine echte Verhaltensänderung:** Codes,
die heute im ganzen Bestand arbeiten dürfen, könnten danach nur noch ihr Fahrzeug bedienen — das muss
der Betreiber wollen und zur physischen Verteilung der Etiketten passen (Betreiberfrage 33). **(c)
zwingt zugleich, `pruefeFahrzeug` auf `tokens.zielId` umzustellen** (Falle 5) und berührt die
Migration (Spalte mit FK).

**15. Bleibt das Gate auf `/` die Anmeldeseite, oder verweist der Verwaltungs-Einstieg auf das
Suite-`/login`? ⛔**
Optionen: (a) Gate bleibt der sichtbare Einstieg für beide Wege; der Verwaltungs-Knopf verlinkt auf
`/login?callbackUrl=<absoluter Modul-Host>` und lässt `suiteRedirect` die Allowlist prüfen
(`core/auth/redirect.ts:52-54`); (b) Gate wird rein für Helferinnen, `/verwaltung` leitet ohne Sitzung
direkt auf `/login`, die Rückkehr läuft über das `rueckkehrZiel`-Muster
(`m/files/_lib/access.ts:117-140`). *Daran hängt:* der `callbackUrl` **muss** absolut und auf einen der
Suite bekannten Host zeigen — ein relatives `/m/lagerbuch/verwaltung` (feedbacks Weg,
`requireFeedbackAccess.ts:35`) setzt den Admin auf dem **Portal**-Host ab und entwertet lagerbuchs
ganzen `returnTo`-Apparat. Ob ein absoluter Host schon gesetzt werden kann, hängt daran, ob
`SUITE_HOST_LAGERBUCH` zum Zeitpunkt des Baus existiert; **vor dem Cutover ist der relative Pfad der
einzige sichere Wert** (`access.ts:130-138`).

**Was hier ersatzlos verschwindet und bewusst neu gebaut werden muss:** die `console.warn`-Zeile in
`src/auth.config.ts:94-99`, die bei abgelehntem OIDC-Login ausschreibt, **welche** Gruppen im Token
standen und welche Claims das Profil hatte. Der Kommentar daneben nennt sie ausdrücklich die Antwort
auf die häufigste Fehlkonfiguration beim Go-live. Ein `grep` auf `console\.` über
`iuk-suite/src/core/auth/` liefert **null** Treffer; `requireFeedbackAccess` und `files/_lib/access.ts`
antworten stumm mit 404.

**Und eine Aufgabe, die an die Suite geht, nicht an lagerbuch:** `src/auth.config.ts:73-83`
überschreibt die `maxAge` des `authjs.callback-url`-Cookies mit ausgeschriebener Begründung (mobile
Browser und PWAs räumen reine Session-Cookies beim Wechsel in den IdP-Kontext weg).
`core/auth/cookies.ts:33-40` lässt `maxAge` **bewusst** auf dem Auth.js-Default — also ein reines
Session-Cookie, genau der Zustand, den lagerbuch behoben hat. lagerbuch ist eine installierbare PWA und
wird auf Telefonen im Fahrzeug benutzt, also genau in der Population, in der der Fix entstand. Es gibt
dabei **keine** Kollision mit `authCookies()` — `cookies.ts:33-40` legt dar, dass Auth.js die Config
tief merged und nur bei `!== undefined` überschreibt; `domain`, `secure` und `maxAge` können
nebeneinander stehen.

### Etiketten, Hosts und Artefakte

**16. Übernimmt die Suite die bisherige lagerbuch-Domain unverändert als `SUITE_HOST_LAGERBUCH`? ⛔**
Optionen: (a) Domain 1:1 übernehmen — alle Etiketten leben weiter; (b) neue Domain **plus** die alte
dauerhaft als zweiter Host in derselben Variablen (die Registry erlaubt Mehrfach-Hosts); (c) neue
Domain plus 301-Weiterleitung außerhalb der Suite; (d) neue Domain ohne Übergang → alle
Artikel-Regaletiketten neu drucken und kleben. *Daran hängt:* Abschnitt 4.1. Die Übernahme ist die
billigste Antwort — dieselbe Mechanik wie bei `SUITE_HOST_FEEDBACK` und den gedruckten Aushängen
(`docs/runbooks/feedback-cutover.md:9-15`). **Zwingend dazu:** `SUITE_TRAEFIK_RULE` muss denselben
Host führen, sonst erreicht die Domain den Container nie — und der Boot bleibt fehlerfrei.

**17. Woher nimmt lagerbuch nach dem Umzug die öffentliche Basis-URL? ⛔**
Das ist **eine** Entscheidung, obwohl vier Codestellen daran hängen (Falle 16). Optionen:
(a) `resolveHost(headers)` wie der Rest der Suite — richtig für alles, was **bedient** wird;
(b) `APP_BASE_URL` als lagerbuch-eigene Env beibehalten — eine sechste, modul-eigene Wahrheit neben
`SUITE_HOST_LAGERBUCH`, mit der Gefahr, dass die beiden auseinanderlaufen; (c) gemischt: Cookies und
Redirects **relativ** bzw. über die Suite-Mechanik, und nur die gedruckten Etiketten aus
`moduleUrl("lagerbuch")` bzw. `prodHostsFor(...)`.
**Empfehlung: (c).** `resolveHost` ist für den Etikettendruck das falsche Werkzeug — es gibt dort
keinen Reqüst-Kontext, der den Modul-Host garantiert, und `moduleUrl` (`core/shell/moduleUrl.ts:15-27`)
ist genau dafür da. Für `/t/[code]` ist die **billigste** Portierung, den Route Handler auf
**relative** Ziele umzustellen, wie es `(gate)/actions.ts:24` und `middleware.ts:19` bereits tun —
dann fällt die ganze Frage für diesen Pfad weg. Mitzüntscheiden sind die drei Nebenwirkungen aus
Falle 16 (`Secure`-Flag, `__Secure-`-Präfix, `AUTH_URL`).

**18. Bleiben `/a`, `/g`, `/t` Top-Level-Pfade auf der lagerbuch-Domain? ⛔**
Optionen: (a) Top-Level bleiben — `decideRoute` schreibt `/a/<id>` auf `/m/lagerbuch/a/<id>` um, die
öffentliche Form ändert sich nicht; (b) unter ein Präfix legen → **alle** gedruckten QR sofort tot.
Der Rewrite deckt (a) ab, aber die Entscheidung muss ausdrücklich getroffen und ins Runbook
geschrieben werden — bei `qr` hat genau eine unausgesprochene URL-Deutung fast Telefonnummern
unerreichbar gemacht (`KONSOLIDIERUNG-PROGRESS.md`, Phase 2, Review-Befund 1).

**19. Wird der Token-Namensraum gegen Wiederverwendung gesperrt?**
Optionen: (a) Hard-Delete für Tokens entfernen — nur noch Sperren, der Code bleibt für immer belegt;
(b) gelöschte Codes in einer `verbrauchte_codes`-Tabelle führen und in `generateUniqueCode`
mitprüfen; (c) Code-Länge erhöhen (bricht alle gedruckten Kärtchen); (d) unverändert übernehmen
und das Restrisiko notieren. *Daran hängt:* Falle 28 — und die Kopplung an 1:1-Pflicht 6. **(a) ist
die billigste Variante** und passt zum append-only-Geist; (b) berührt das Schema.

**20. Wird der Etikettenbogen eine eigene Route-Gruppe ohne Shell, oder ein `@media print`-Block im
Modul-CSS? ⛔**
Optionen: (a) eigenständige Print-Route `(druck)/etiketten` ohne Shell — kein Vorfahre zwischen
`<body>` und Bogen; **belastet** durch den feedback-Vorfall, den `files` ausdrücklich dokumentiert
(die Druckansicht fiel dort aus dem Zugriffsriegel heraus); (b) `@media print`-Block im Modul-CSS nach
dem `files`-Muster (`.druckbereich{position:fixed;inset:0}` + `.nichtDrucken`) — kapselbar, behält die
Auswahl-Interaktion auf derselben Seite; (c) das Raster serverseitig als PDF erzeugen statt über
Browser-Druck. *Daran hängt:* ob gekaufte Etikettenbögen nach dem Cutover noch passen (Falle 43,
1:1-Pflicht 22). **Was in keiner Variante bleiben darf:** `body * { visibility: hidden }` — es ist per
CSS-Modul nicht kapselbar und leert jede Druckseite der Suite. **Wenn (a), dann mit dem Riegel als
aufrufbarer Funktion** (Entscheidung 10), sonst wiederholt sich der feedback-Vorfall.

**21. Was bedeutet `/api/health` auf der Lagerbuch-Domain nach dem Cutover?**
Optionen: (a) `PASSTHROUGH` so lassen — die Modul-Aussage lebt unter `/api/health/lagerbuch`; das
ändert Runbook und externen Monitor; (b) den compose-Healthcheck erweitern, sodass er alle
Modul-Endpunkte prüft — dann macht ein kaputtes lagerbuch den ganzen Container `unhealthy`, also auch
die vier anderen Module; (c) `/api/health` aus `PASSTHROUGH` nehmen — größter Eingriff, berührt
`core/routing` und alle Bestandsmodule. **Empfehlung: (a)** plus eine Runbook-Zeile; die richtige Route
existiert bereits.

**22. Wer sichert lagerbuch nach dem Cutover?**
Optionen: (a) nur `scripts/backup.sh` — kein Modul-Code, `lagerbuch.db` wird vom Glob automatisch
erfasst; Preis: Tarball-Körnung statt Einzeldateien, `KEEP` statt Tagen, und die Sicherung hängt an
einem Host-Cron, dessen Existenz nur der Betreiber bestätigen kann; (b) den Job als
`starteLagerbuchHintergrund()` mitnehmen, mit modul-eigenem Produktionsriegel und
`getModuleDb(...).$client.backup(...)` — erhält 14 Tage, erzeugt aber zwei Regime in `/data/backups`;
(c) Job streichen und `BACKUP_KEEP` anheben. **In jedem Fall:** `deployment.md` beim Umzug korrigieren
oder mitsamt seiner falschen Aussage archivieren, und das alte `backups/`-Verzeichnis im
`lagerbuch_data`-Volume vor dem Abbau des Alt-Stacks wegsichern — es ist die einzige historische Tiefe
vor dem Cutover-Snapshot.

**23. Wird `deploymentId` suiteweit nachgerüstet — und bekommt die Suite einen Release-Kanal?**
Das ist **eine** Entscheidung, weil beide Hälften an derselben Datei hängen:
`iuk-suite/.github/workflows/ci.yml`.

*Hälfte 1 — `deploymentId`.* Die Kette hat **drei** Beine, nicht zwei: `next.config.ts:14` liest die
Variable, `Dockerfile:10-11` und `:18-19` reichen sie durch (beide mit leerem Default), und gefüllt
wird sie ausschließlich in `.github/workflows/ci.yaml:87-88`. Ohne das dritte Bein ist der Rest eine
Nulloperation (Abschnitt 2.6). Optionen: (a) ja, im Zuge dieser Phase — `deploymentId` in
`iuk-suite/next.config.ts`, `ARG`/`ENV` in **beide** Stages von `iuk-suite/Dockerfile`, und
`build-args: NEXT_DEPLOYMENT_ID=${{ github.sha }}` in **beide** `build-push-action`-Schritte je
Matrix-Job (`ci.yml:70-80` und `:95-103`, siehe Falle 64) — nutzt allen fünf Modulen; (b) nein, die
Suite hat den Vorfall nie gehabt, und die zwei CDN-/Proxy-Einstellungen aus `deployment.md` sind
ohnehin die eigentliche Abhilfe; (c) nur die Betreibereinstellungen übernehmen (503 statt 404 im
Backend-Gap, CDN respektiert Origin-Header). *Daran hängt:* ob nach einem Suite-Deploy ein gecachtes
404 auf `/_next/static/*` für Stunden weiße Seiten erzeugen kann.
**Nicht kopieren, übersetzen:** lagerbuchs CI baut beide Architekturen in einem QEMU-Job
(`ci.yaml:64`, `:83`); die Suite hat genau das im Juli auf native Runner umgestellt (`ci.yml:32-36`).
Die lagerbuch-Datei ist an dieser Naht Merkliste, nicht Vorlage.

*Hälfte 2 — der Release-Kanal.* Mit dem Umzug verliert der Betrieb das Paar `edge`/`vX.Y.Z`
(Abschnitt 3.2): Erzeuger `ci.yaml:6` + `:78-79`, Verbraucher `stack.env.example:2`,
`deployment.md:29` und `compose.yaml:3`. Im Ziel gibt es weder Tag-Auslöser noch `type=semver`
(`ci.yml:3-7`, `:145-148`), und `iuk-suite/compose.yaml:3` pinnt `:latest` fest. Optionen:
(d) Verbraucher heilen — `image: ghcr.io/rubenvitt/iuk-suite:${SUITE_IMAGE_TAG:-latest}` nach dem
Muster von `iuk-suite/compose.yaml:102`; **eine Zeile**, und der Rückzug auf einen Commit-Tag
(`ci.yml:146`, `type=sha`) ist wieder ein `.env`-Eintrag statt einer Änderung an einer versionierten
Datei; (e) zusätzlich Erzeuger heilen — `tags: ["v*"]` in `on.push` und
`type=semver,pattern=v{{version}}` plus `latest` nur auf `refs/tags/v` in den `merge`-Metadaten; erst
dann bedeutet `latest` wieder „letztes Release" statt „letzter main-Push"; (f) nichts tun und die
Kanaltrennung ausdrücklich aufgeben — dann muss `deployment.md` beim Umzug korrigiert oder archiviert
werden (siehe Entscheidung 22), sonst pinnt der nächste Leser einen Tag, den niemand baut.
*Daran hängt:* ob nach dem Cutover ein Rückzug auf die lagerbuch-Version von gestern überhaupt eine
bedienbare Handlung ist.

**Empfehlung: (a) + (d).** Beide sind klein, beide haben in-Repo-Präzedenz, und (d) ist die
Voraussetzung dafür, dass der aus Abschnitt 3.2 verbleibende Rückzug auf einen Commit-Tag praktisch
benutzbar ist. (e) ist eine Betriebsentscheidung und hängt an Betreiberfrage 41; Hälfte 1 hängt an
Betreiberfrage 40.

**24. Braucht der Lager-Einsatz Offline-Fähigkeit?**
Optionen: (a) nur Manifest und Icons als Route Handler unter dem Modul (Stand heute: **kein** Service
Worker) — kleinster Umfang, keine neue Zusage; (b) Service Worker nach dem qr-Muster mit Denylist für
`/verwaltung` — dann gilt die Spike-Regel: Offline-Test gegen den **Prod-Build**, mit clientseitiger
Interaktion, in einer eigenen `playwright.pwa.config.ts`; (c) kein PWA-Anteil. *Daran hängt:* eine
fachliche Frage, keine technische — ob im Lagerraum und in der Fahrzeughalle Netz anliegt
(Betreiberfrage 30). **Unabhängig davon zu klären:** wohin die drei `public/`-PNGs wandern und ob
Nexts Dateikonvention unter `/m/<key>/` greift (Falle 56).

### Boot, Zeit und Identität

**25. `ensureHandlager` und die E2E-Fixtures: was ist Seed, was ist Schema-Vervollständigung? ⛔**
Optionen für `ensureHandlager`: (a) als Zeile in der ersten Migration
(`INSERT OR IGNORE INTO lagerorte(...) VALUES('handlager',…)`) — läuft immer, ist versioniert, und
passt dazu, dass es eine fachliche Konstante ist; (b) als ungegateter Boot-Schritt in einer
modul-eigenen Funktion analog `starteFilesHintergrund()` — näher am heutigen Verhalten;
(c) als Boot-Assert statt Schreibvorgang — ehrlich, macht aus einer fehlenden Zeile aber einen
Totalausfall der Suite. **Nicht** nach `seedAllModules()`.
Für die E2E-Fixtures gilt das Gegenteil: **die beiden aktiven Token-Codes gehören ausdrücklich
nicht in `seedAllModules()`.** Der Weg ist ein eigener Schritt in der `webServer.command`-Kette
(`pnpm exec tsx e2e/seed-lagerbuch.ts && …`), wie lagerbuch es heute schon macht.

**26. Bekommt die Suite eine Zeitzone, oder wird lagerbuch auf explizite Zonenrechnung umgestellt? ⛔**
Optionen: (a) `TZ=Europe/Berlin` in die Suite-`.env` — **eine Zeile**, keine Image-Änderung nötig
(gemessen, Falle 2); betrifft aber **alle** Module, und für `feedback` (`computeClosesAt`) wäre das
eine Verhaltensänderung; (b) lagerbuchs Datumslogik auf `Intl.DateTimeFormat` mit
`timeZone: "Europe/Berlin"` umstellen — sauberer, berührt aber `format.ts`, `verfall.ts`, `geraet.ts`,
`bestand-export.ts` und den Backup-Tick und macht aus dem Umzug an dieser Stelle eine Umschreibung;
(c) UTC akzeptieren. Das Modul `feedback` zeigt, wie (b) aussieht: `export const TIME_ZONE =
"Europe/Berlin"` (`_lib/lifecycle.ts:6`) plus explizites `timeZone:` an jeder Formatierung — genau das
Verhalten, das man in einem UTC-Container baut. **Mitzüntscheiden:** ob `iuk-suite/vitest.config.ts`
eine TZ pinnt, damit der Unterschied überhaupt testbar wird, und ob `config.tz` (heute tot)
verdrahtet oder ersatzlos gestrichen wird.

**27. Identität: wo entsteht der `users`-Satz, und was passiert mit den Waisenzeilen? ⛔**
Zwei gekoppelte Teile. **(i) Der Upsert-Ort:** die Suite hat keinen `events`-Block (Falle 22).
Optionen: pro Anfrage hinter dem Riegel nach dem `feedback`-Muster (`upsertKnownUser`); oder
`core/directory` nutzen und die Modul-Tabelle ganz aufgeben. Dieser Teil ist vom Freeze-Stand
**unberührt**: die Suite hat weiterhin keinen `events`-Block, der Upsert braucht weiterhin einen
neuen Ort. **(ii) Die Altlast:** die produktive `users`-Tabelle trägt eine Waisenzeile je Anmeldung
bis einschließlich `2361f40`. **Der Erzeuger ist seit `f2b515b` weg** (Belegbasis) — das hier ist
also die Bereinigung eines Altbestands, nicht die Reparatur eines laufenden Defekts. Optionen:
(a) Tabelle beim
Import leeren — `quelle.ts` fällt für Alt-Buchungen auf die rohe Kennung zurück, bis sich die
jeweilige Person einmal angemeldet hat, danach heilt sich das Journal von selbst (weil `quelleId`
bereits der `sub` ist); (b) zusammenführen — verlangt eine Zuordnung UUID → Person, die es in den
Daten nicht gibt (nur über `email`/`name`, also unsicher); (c) aus Pocket ID neu befüllen.
**Empfehlung: (a)** — einfach, sichtbarer Zwischenzustand, kein Ratewerk. *Daran hängt zusätzlich
eine Vorbedingung, die kein Repo beantwortet:* ob Pocket ID unter der Suite-Client-Registrierung
denselben `sub` liefert (Betreiberfrage 4). Bei pairwise subject identifiers verliert **nicht nur** die
Nachschlagetabelle, sondern das gesamte Journal seine Autorschaft — eine andere Fehlerklasse, und ein
Paritätscheck wäre dabei grün.

### Oberfläche

**28. Welche Shell-Variante bekommt `/helfer/*` — und bekommt das Modul überhaupt eine? ⛔**
Optionen: (a) `full` für alles; die Helfer-Tab-Leiste wird zur `SuiteNavItem[]`-Modulnavigation —
günstigste Variante, kostet die Vollbild-Anmutung und die untere Daumenreichweite; (b) `kiosk` für
`/helfer/*`, `full` für `/verwaltung/*` — bewahrt das Vollbild, aber `KioskThemeProvider.tsx:26-33`
hebt `fontSize` auf 20 und `controlHeight` auf 72 (für Wandmonitore), braucht also eine Anpassung oder
eine vierte Variante; (c) eine neue `core`-Variante `mobil` — sauber, aber `core` verlangt einen
zweiten, **heute belegbaren** Nutznießer, den es nicht gibt; (d) `/helfer/*` als **öffentliche
Ansichtsklasse** behandeln (ohne antd, eigenes CSS-Modul, eigene Anmutung) analog zum Abendzettel des
Moduls `feedback` — die Helfer-Sitzung läuft ohne Konto über einen Token, das passt zur Definition;
nur ist sie nicht ganz login-frei. *Daran hängt:* der gesamte Aufwandsschätzer für `/helfer/*`
(`HelferFrame`, `HelferListe`, `HelferEntnahme`, `CheckFlow` = 630 Zeilen), ob die untere Tab-Leiste
überlebt, und ob `CheckFlow.tsx` (495 Z., der längste Client-Baum des Moduls) in antd oder in eigenem
CSS neu entsteht.

**29. Wie lösen wir Falle 7 an den 15 Server Components — pro Stelle oder einmal fürs Modul? ⛔**
Optionen: (a) alle 15 als Inline-SVG (Vorbild `m/files/(verwaltung)/shares/[id]/page.tsx`) — sicher,
kein Test nötig, aber 15 handgepflegte Blätter; (b) eine `_ui/Icon.tsx`-Client-Insel je Modul: die
Server Component rendert `<Icon name="arrow-left"/>` — ein Ort, aber jede Icon-Stelle wird zu einer
Client-Grenze; (c) Tiefen-Import `@ant-design/icons/es/...` — gemessen HTTP 200 (`icons.ts:93-100`),
aber `CLAUDE.md:34-35` nennt es ausdrücklich „kein Vertrag, auf den man bauen sollte";
(d) `lucide-react` als **Modul-Abhängigkeit** behalten (es trägt `"use client"` in jedem Blatt, ist
also RSC-tauglich) und nur die Suite-Chrome-Icons aus antd nehmen — löst Falle 7 **und** die sieben
Fachzeichen auf einen Schlag, kehrt aber die Suite-Entscheidung vom 23.07. teilweise um.
*Daran hängt:* 15 Routen, darunter das Layout über allen 24 Admin-Seiten, und die Antwort auf
Falle 34.

**30. Wo liegt die fachsemantische Ampel-Palette, und mit welchen Werten? ⛔**
Optionen: (a) modul-eigene Palette unter `app/m/lagerbuch/_lib/ampel.ts`, analog `feedback/_lib/noten.ts`
— `tokens.ts:6-11` sieht diese Ausnahme ausdrücklich vor; (b) die heutigen drei Werte unverändert
übernehmen — dann bleibt die nicht-monotone Luminanz (0,145 / 0,198 / 0,123) bestehen und ein
Suite-Test darauf wäre von Anfang an rot; (c) die Werte so nachjustieren, dass die Luminanz über die
Rangfolge gut → schlecht monoton fällt — ändert den Farbeindruck sichtbar, und die Helfer kennen die
heutigen Farben vom Etikett und aus dem Fahrzeug; (d) nur die hellen Chip-Hintergründe neu ordnen und
die Textfarben lassen — berührt die Plakette nicht, die genau der Fall ist, der Text nicht mitführt.
*Daran hängt:* 80 Statuschips, 21 KPI-Kacheln, die Plakette an vier Stellen, die Journal-Deltas — und
die Frage, ob Rot überhaupt noch auf einer Datenfläche stehen darf (Falle 35).

**31. Wie kommen 15 Navigationsziele in `.modulnav`?**
Optionen: (a) alle 15 übernehmen und `.modulnav` in `core` um `overflow-x: auto` (oder ein
Überlaufmenü) erweitern — **das ist ein core-Befund mit lagerbuch als zweitem Nutznießer**, also
regelkonform; (b) sechs bis acht Hauptziele in die Leiste, der Rest in ein Überlaufmenü — die
Aufteilung ist eine fachliche Entscheidung; (c) Gruppierung nach Fachbereich (Bestand · Fahrzeuge ·
Geräte · Betrieb) — vier Einträge statt fünfzehn, aber ein zusätzlicher Klick auf jedem Weg.
**Ausgeschlossen:** „nur Icons ab einer bestimmten Breite" — `types.ts:21-25` definiert `SuiteNavItem`
bewusst ohne `icon`-Feld. *Daran hängt:* die Erreichbarkeit **aller** Verwaltungsseiten, und die
Suite-Prüffrage „Hat jede Action einen Weg in der Oberfläche?" — bei 15 Zielen ist der Verlust eines
Eintrags leicht zu übersehen.

**32. Bleiben die drei Schriften, oder wird auf Geist vereinheitlicht?**
Optionen: (a) auf Geist vereinheitlichen (Suite-Standard) — die Display-Rolle entfällt, die Hierarchie
muss über Größe und Gewicht neu gebaut werden, und **alle Vergleichsziffern brauchen dann
ausdrücklich `tabular-nums`** (Geist Sans liefert es nicht implizit); (b) nur `--mono` behalten, weil
sie Fachinformation trägt (Fachnummern, Journal, Plakette-Ziffern, Zugangscodes); (c) alle drei
behalten und modul-lokal registrieren nach dem `feedback`/`Newsreader`-Muster — bewahrt die Anmutung
vollständig, macht lagerbuch aber sichtbar zu einem Fremdkörper in der Suite. *Daran hängt:* der
visuelle Wiedererkennungswert; die Wortmarke „LAGERBUCH" ist Barlow Condensed und das Erste, was jede
Person an jedem Einstiegspunkt sieht. **Vorbedingung:** ob die Schriften CD-gebunden sind
(Betreiberfrage 29) — falls ja, ist (a) kein Option, sondern ein Verstoß.

**33. Wie löst sich der Konflikt zwischen Suite-Tap-Maß (56px) und der Dichte der Zähl-Liste?**
Optionen: (a) 56px durchziehen und die längeren Listen akzeptieren; (b) `size="small"` in den
Zähl-Zeilen — laut `docs/design/README.md:61-62` nur **innerhalb von Tabellenzeilen** erlaubt, die
Zähl-Zeilen sind aber Karten-Zeilen; also entweder Regel dehnen oder die Liste zu einer echten `Table`
machen; (c) eigenes Modul-CSS auf dem Stepper, mit der von der Suite verlangten Begründung und einer
Klasse mehr Spezifität (Falle 5 der Suite, Kommentarzwang gilt); (d) den Stepper gar nicht auf
`InputNumber` heben, sondern als eigenes Modul-Bedienelement behalten — mit Suite-Tap-Maß an den
+/−-Flächen und kompakter Ziffernanzeige dazwischen. **(d) löst zugleich Falle 45** (die dritte
Zustandsquelle) und erhält die `noText`-Variante.

**34. Welche der acht Neutralfarben werden auf antd-Tokens umgestellt?**
Optionen: (a) alle auf die antd-Pendants (`colorBorder`, `colorBgLayout`, `colorBgContainer`,
`colorTextSecondary` …) — ein Farbsystem, sichtbar anderer Eindruck, im Dunkelmodus automatisch
richtig; (b) alle als `--lb-*`-Modulvariablen behalten — Farbeindruck 1:1, aber zwei Neutralpaletten
nebeneinander und Dunkelmodus von Hand; (c) gemischt: Flächen und Rahmen an antd, Text und Akzente als
Modulvariablen. *Daran hängt:* praktisch jede Fläche des Moduls (`.card` 100 Verwendungen, `.row` 35,
`.kpi` 21) plus die Dunkelmodus-Frage (Betreiberfrage 27). **Zu (c) gehört eine klare Grenzziehung**,
sonst entsteht genau die Kollision aus Falle 2 und Falle 5 der Suite.

**35. Was wird aus den zwei stillen Obergrenzen (Journal 100, Checks 50)?**
Optionen: (a) **1:1 übernehmen, aber die Anzeige ehrlich machen** — `limit + 1` laden, `limit`
anzeigen, den Hinweis nur rendern, wenn die Grenze tatsächlich griff (heute steht „neuesten 100
Treffer" unbedingt da, `journal/page.tsx:32`, und die Checks-Seite nennt ihre 50 gar nicht);
billigste Variante, keine Modelländerung, behebt genau den Teil, der heute stillschweigend
Information unterschlägt. (b) **antd-`Table`-Pagination über die gedeckelten 100** — sieht nach
Vollständigkeit aus, ist aber ein Seitenumbruch über einem Ausschnitt: der Pager sagt „10 von 100",
während dahinter fünftausend Zeilen liegen. **Ausdrücklich ausgeschlossen**; es ist die Variante, die
ein naives `<Table dataSource={journal} />` von selbst erzeugt. (c) **Echte serverseitige
Seitenumbrüche über einen weiteren URL-Parameter (`seite`), OFFSET-basiert** — erbt Falle 3: die
Sortierung `orderBy(desc(buchungen.ts))` (`queries.ts:109`) hat keinen Tiebreaker und die Spalte
speichert Sekunden, ein Check schreibt aber mehrere Buchungen in derselben Sekunde; an einer
Seitengrenze können Zeilen doppelt erscheinen oder ausfallen. Behebbar durch
`ORDER BY ts DESC, id DESC` — `buchungen.id` ist ein `nanoid()` (`schema.ts:4,92`), zeitlich
bedeutungslos, aber ein deterministischer Totalorder, und mehr braucht ein Seitenumbruch nicht.
Kostet einen Index auf `(ts, id)`; heute gibt es nur `idx_buchungen_ts` (`schema.ts:107`).
(d) **Cursor-/Keyset-Nachladen („weitere 100")** mit `(ts, id) < (Cursor)` und demselben Tiebreaker —
stabil auch dann, wenn während des Blätterns gebucht wird (bei append-only kommen neue Zeilen oben
dazu und verschieben jeden OFFSET), dafür kein Sprung auf eine bestimmte Seite.
*Daran hängt:* ob die Verwaltung einen Vorgang, der älter ist als die letzten 100 Buchungen,
überhaupt noch findet, wenn sie den Zeitraum nicht kennt; ob die Journalseite bei realer Datenmenge
antwortet (Falle 10, Entscheidung 7); und ob der Seitenumbruch Falle 3 vom stillen Sortier-Ärgernis
zu einem Datenfehler befördert. **Empfehlung: (a) für den Cutover** — sie ist verhaltenserhaltend,
kostet ein `+1` und einen bedingten Satz, und macht die heutige stille Grenze überhaupt erst
sichtbar. **(d), sobald die reale Journalgröße bekannt ist** (Betreiberfrage 34); (d) und der
Tiebreaker aus (c) fallen bei Entscheidung 7 Option (b) ohnehin an. **Nebenentscheidung:** dieselbe
Frage gilt für die 50 der Checks-Seite — deren Grenze ist heute nirgends genannt und daher der
strengere Fall, nicht der harmlosere.

**36. Bekommt `m/lagerbuch` eigene Grenzen — und welche Anmutung tragen sie?**
Ausgangslage: lagerbuch hat null Grenzdateien, die Suite hat genau eine (an der Wurzel, ohne Shell)
und ebenfalls keine `error.tsx`. Die Portierung erbt aus **beiden** Richtungen nichts; die 22
ungefangenen Aufrufstellen aus Falle 62 laufen danach unverändert in die eingebaute Framework-Grenze.
Optionen:
(a) **Keine Modul-Grenzdatei, aber gestaltete Zustände in der Seite** — der Hausstil der Suite für
Personen mit gedrucktem Artefakt (`files/…/u/[token]/page.tsx:13-17`,
`feedback/f/[slugSecret]/page.tsx:257-262`). Für `/g/[code]` hieße das: statt `notFound()` eine Seite
„Dieser Barcode gehört zu keinem Gerät" in der lagerbuch-Anmutung, mit dem gescannten Code zur
Kontrolle. Für `/a/[artikelId]` löst dieselbe Form zugleich **Falle 27**. Kein Zusatzaufwand in
`core`, kein Framework-Verhalten, auf das man wetten muss.
(b) **`m/lagerbuch/not-found.tsx` und `m/lagerbuch/error.tsx`** — die generischen Fälle bekommen die
Modul-Anmutung, die Suite-404 bleibt für den Rest. **Vorbedingung, die im Repo nicht belegbar ist:**
ob eine Modul-`not-found.tsx` **innerhalb** von `m/lagerbuch/layout.tsx` rendert (also mit Shell und
Modulnavigation) oder an dessen Stelle, lässt sich an keinem Bestandsmodul ablesen — es gibt keine
einzige. Vor der Entscheidung an einem Wegwerf-Modul (`m/alpha`, `m/gamma`) messen; die Antwort
entscheidet, ob (b) überhaupt die versprochene Anmutung liefert.
(c) **Nur `error.tsx`, keine `not-found.tsx`** — die 404 bleibt die der Suite; inhaltlich passt sie,
weil lagerbuch mit `moduleAdminPageOrNotFound` denselben 404-statt-403-Riegel fährt. Der abgestürzte
Client-Baum bekommt eine Auffangfläche. Billigste Option gegen den schwersten der drei Befunde.
(d) **Die 22 Aufrufstellen fangen, statt eine Grenze zu bauen** — behebt die Ursache statt des
Symptoms und ist die Form, die die zwölf anderen Stellen des Moduls schon haben; bei einem Neubau auf
antd noch billiger über `App.useApp().message.error(...)` je Formular. **Ersetzt (c) nicht
vollständig** — einen Wurf im Render einer Server Component fängt so niemand —, deckt aber genau die
belegten 22. Zusammen mit Falle 66 heißt „fangen" allerdings: den erwarteten Fehlfall als
**Rückgabewert** führen (`files`-Muster `{ ok: false; feldFehler }`), nicht den maskierten Wurftext
anzeigen.
*Gekoppelt an Entscheidung 28 (Shell-Variante):* fällt 28 auf **(d) öffentliche Ansichtsklasse** für
`/helfer/*`, ist (a) die einzige kohärente Wahl — eine Suite-404 mit antd-Knopf unter einer Ansicht,
die bewusst ohne antd gebaut ist, wäre ein Bruch mitten im Weg der Helferin. Fällt 28 auf **(a) `full`
für alles**, werden (b)/(c) kohärent, weil die Shell dann ohnehin überall trägt.
*Daran hängt außerdem:* Entscheidung 32 (Schriften) — bei (a) und (b) trägt die Fehlerseite die
Modulschrift, bei der Suite-404 zwangsläufig Geist; **Falle 27**, deren Abhilfe identisch mit (a) ist;
und **eine E2E-Zusicherung**: `e2e/helfer-flow.spec.ts:56` verlangt heute wörtlich den Absturztext
(`/server-side exception/`). Jede Variante außer „alles so lassen" schreibt diese Zeile um. Sie ist
keine der achtundzwanzig klassengebundenen Selektor-Verwendungen aus Falle 48, sondern ein
Textabgleich — und ihre Portierung setzt eine **fachliche** Entscheidung voraus, nicht nur eine
Selektor-Anpassung.

### Ausgabeformate

**37. Bekommt `bestellvorschlag.csv` eine Formel-Neutralisierung — und wenn ja, wird sie beim Port
mitgebaut oder bewusst ausgelassen?**
`csvCell` (`BestellListe.tsx:8`) leistet genau das CSV-Dialektnötige: es setzt jede Zelle in
Anführungszeichen und verdoppelt enthaltene Anführungszeichen. Damit ist die **Dialektfrage** gelöst
— ein Semikolon oder ein Anführungszeichen im Artikelnamen zerlegt die Zeile nicht. Die
**Formelfrage** löst es nicht: ein führendes `=`, `+`, `-` oder `@` bleibt unverändert im Zellwert
stehen. Ob das empfangende Programm eine solche Zelle als Formel auswertet oder als Text, ist eine
Eigenschaft dieses Programms — und welches Programm das ist, ist genau Betreiberfrage 43. Das Repo
kann die Frage nicht beantworten; es kann nur zeigen, dass es nichts dagegen unternimmt (`:8`).
Wer die Funktion 1:1 überträgt, überträgt diese Eigenschaft mit.

**Schwere — mit Maß, nicht mit Alarm.** Die Klasse ist dieselbe wie beim Befund im Modul
`feedback`, die Exposition ist es nicht. Jede Textzelle beider Exporte stammt aus einem
**admin-geschützten** Schreibpfad, nicht aus anonymem Freitext: `artikel.name`/`einheit`/`fach`
entstehen ausschließlich in `createArtikel`/`updateArtikel` (`src/actions/artikel.ts:17,28`, beide
`requireAdmin()`) und im CSV-Import (`src/actions/csv.ts:10`, ebenfalls `requireAdmin()`);
`chargen.chargenNr` — die xlsx-Spalte „Nächste Charge" — entsteht nur in `bucheZugang`
(`src/actions/buchung.ts:17,22`, `requireAdmin()`); `Status` und `Hinweis` sind feste Code-Literale
(`bestand-export.ts:34-38`). Der einzige Schreibpfad unterhalb von Admin ist `bucheEntnahmeHelfer`
(`buchung.ts:82-87`, `requireHelfer`) — er schreibt eine **Menge**, nie eine Textzelle. Das Risiko ist
damit „ein Admin tippt versehentlich oder böswillig etwas, das ein anderer Admin später in Excel
öffnet", nicht „ein Unbekannter schiebt eine Formel in eine Datei, die jemand öffnet". Das
rechtfertigt eine Entscheidung, keine Eskalation.

**Der Excel-Pfad ist nicht betroffen** und muss in dieser Entscheidung nicht mitbehandelt werden:
`ArtikelTable.tsx:138` schreibt jede nicht-numerische Zelle ausdrücklich als
`{ value: String(…), type: String }` — die Bibliothek legt sie damit als Textzelle an, nicht als
Formel. Die Frage stellt sich in dieser Form allein bei der CSV.

Optionen: (a) **1:1 übernehmen** — `csvCell` unverändert; Preis: die Eigenschaft wandert mit ins neue
Modul und ist dort neu zu begründen, statt geerbt zu sein. (b) **Führende `=`/`+`/`-`/`@` mit einem
vorangestellten Apostroph neutralisieren** — Kosten: eine Zeile in `csvCell`; Preis: der Apostroph
ist in der Datei sichtbar, wenn sie **nicht** in einer Tabellenkalkulation geöffnet wird, das ändert
das Format für jeden anderen Abnehmer. (c) **Führende Sonderzeichen mit einem vorangestellten
Tabulator innerhalb der Quotes neutralisieren** — unsichtbarer als (b), verändert den Zellwert
ebenfalls und stört Textvergleiche stromabwärts.
**Empfehlung: (b), aber erst nach Betreiberfrage 43.** Solange nicht feststeht, ob die Datei
überhaupt in einer Tabellenkalkulation geöffnet wird, ändert jede Maßnahme ein Format zugunsten
eines Risikos, das derselbe Personenkreis trägt, der es auslösen könnte. Ist der Abnehmer Excel, ist
(b) eine Zeile; ist der Abnehmer ein Importer, ist (a) richtig und (b) schädlich.

**Zwei Nachbarfragen gehören in dieselbe Entscheidung, weil sie dieselbe Zeile anfassen**
(`BestellListe.tsx:31`): das fehlende UTF-8-BOM und das `\n` statt CRLF. Beide sind heutiges
Verhalten und damit erst einmal 1:1-Pflicht; beide sind nur dann zu ändern, wenn Betreiberfrage 43
einen Abnehmer nennt, der sie braucht. **Nicht ungeprüft „mit repariert" werden** — ein
nachgerüstetes BOM kann einen bestehenden Importer stromabwärts brechen, ohne dass es im Modul
sichtbar wird.

---

## 7. Was nur der Betreiber beantworten kann

Siebenundvierzig Punkte. Die ersten acht blockieren die Spec, der Rest blockiert einzelne
Entscheidungen oder ist Cutover-Vorbereitung. **Was auf dem Server steht, steht nicht im Repo** — jede
dieser Zahlen zu erfinden wäre der schlimmste Fehler dieser Analyse.

---

### ✅ Antworten des Betreibers vom 03.08.2026 — die acht Spec-Blocker sind aufgelöst

Die Antworten stehen hier gesammelt statt in den acht Fragen verstreut, damit nachvollziehbar bleibt,
**was gefragt war und was tatsächlich zurückkam** — bei drei der acht ist das nicht dasselbe.

**1 — Domain: `lagerbuch.iuk-ue.de`, „aber das sollte zu 100 % konfigurierbar bleiben".**
Die Auflage ist erfüllt, ohne dass etwas zu bauen wäre: die Suite liest Prod-Domains seit dem
19.07.2026 aus `SUITE_HOST_<KEY>`, der Registry-Wert ist nur Fallback. `SUITE_HOST_LAGERBUCH` ist
damit eine `.env`-Zeile, der Rollback das Leeren derselben Zeile. ⚠️ **Was dadurch NICHT konfigurierbar
wird:** die bereits gedruckten Etiketten. Die Domain zu wechseln bleibt teuer, egal wie leicht die
Variable zu ändern ist — die Konfigurierbarkeit betrifft den Cutover-Vorgang, nicht die Artefakte.

**2 — `TZ`: „keine Ahnung, aber wir sollten sie setzen".**
→ **Annahme für die Spec: `Europe/Berlin`.** ⚠️ **Das ist kein lagerbuch-Punkt, sondern ein Eingriff in
den laufenden Betrieb von vier Modulen.** Der Suite-Container fährt heute ohne `TZ`, `node:26-alpine`
liefert damit UTC; alles, was portal, qr, feedback und files bisher an Datumsgrenzen gezogen haben, ist
in UTC gezogen worden. Ein nachträgliches `TZ=Europe/Berlin` verschiebt jede solche Grenze um ein bis
zwei Stunden — betroffen sind unter anderem gerundete Zeitstempel in `feedback` und jede
Tagesbildung in `qr`. **Gehört als eigener Schritt mit eigener Prüfung gegen die vier laufenden Module
gefahren, nicht als Zeile in der lagerbuch-Spec.** Für lagerbuch selbst ist die Antwort damit
hinreichend: die Spec rechnet mit `Europe/Berlin` und nennt die Variable als Runbook-Eingabe.

**3 — Admin-Modell: „der Suite-Admin ist nur für das Portal, also ein Portal-Admin. Die restlichen sind
alles App-Admins pro App."** Die Antwort zerfällt in zwei Teile, und nur einer ist lagerbuchs:

- **Für lagerbuch beantwortet und sofort umsetzbar:** der Suite-Admin bekommt **keine**
  Lagerbuch-Rechte. Lagerbuch-Admin ist ausschließlich, wer in `SUITE_ADMIN_GROUP_LAGERBUCH` steht.
  Das ist genau das Muster, das `feedback` seit dem 28.07. fährt (modulinterne Prüfung, die
  `suiteAdminGroup` bewusst nicht mitliest) — und es ist vorwärtskompatibel zum Refactoring unten.
  **Blockiert die Spec nicht mehr.**
- **Suite-weit und NICHT Teil dieser Spec:** `isModuleAdmin` (`core/groups.ts:103`) steigt heute für
  **jedes** Modul beim Suite-Admin früh mit `true` aus. Das zu entfernen ist `core`-Arbeit und berührt
  portal, qr und files. ⚠️ **Der Kurzschluss ist kein Versehen** — `core/groups.ts:13-14` schreibt
  seinen Zweck aus: „Ist überall Admin, damit ein Modul nicht aussperrbar ist." Fällt er, sperrt ein
  falsch gesetztes `SUITE_ADMIN_GROUP_<KEY>` **alle** aus dem Modul aus, und der einzige Weg zurück ist
  eine `.env`-Änderung auf dem Server. Gehört als eigene Suite-Entscheidung protokolliert, nicht still
  über eine Modul-Spec eingeführt.

**4 — OIDC-`sub`: „keine Ahnung. Momentan ist es getrennt. Aber Suite ist das System und lagerbuch nur
eine App darin."** Die Richtung ist damit klar (ein OIDC-Client, der der Suite; lagerbuchs eigener
Client entfällt) — **die Frage selbst ist aber offen und bleibt der teuerste Posten der Portierung.**
Getrennte Clients heute heißt nicht, dass Pocket ID beiden denselben `sub` je Person ausstellt; bei
konfigurierten pairwise subject identifiers tut sie es gerade nicht. Alle historischen
`journal.quelle_id`, `tokens.created_by` und `users.id` tragen den alten Wert.
**✅ Am 03.08.2026 gemessen und damit entschieden:** die Discovery der Pocket-ID-Instanz liefert
`subject_types_supported: ["public"]` — **nur `public`, pairwise wird nicht einmal angeboten.** Der
`sub` ist damit die Pocket-ID-Nutzerkennung selbst und **über beide OIDC-Clients hinweg identisch**.
Die getrennten Clients spielen für die Kennung keine Rolle. _(Eine vorherige Recherche zu Pocket IDs
Subject-Typ blieb ergebnislos — die Antwort kam aus der laufenden Instanz, nicht aus der Dokumentation.
Für Folgemodule ist das die schnellere Reihenfolge: erst die Discovery abfragen, dann suchen.)_

⚠️ **Das entschärft die Client-Frage, aber NICHT den Import — der Bruch liegt innerhalb von lagerbuch
und ist belegt.** Bis `f2b515b` (29.07.2026) schrieb `src/auth.ts` in `users.id` den Auth.js-`user.id`,
also eine **Zufalls-UUID pro Anmeldung**; seither steht dort `profile.sub`. Für dieselbe Person tragen
Altzeilen und Neuzeilen daher verschiedene Kennungen, und alles, was auf `users.id` zeigt
(`journal.quelle_id`, `tokens.created_by`), erbt das.

**Die Zuordnungsaufgabe ist damit kleiner und schärfer geworden, statt zu verschwinden:**
- Zeilen **nach** `f2b515b` tragen bereits den `sub` und passen ohne Umrechnung zu dem, was die Suite
  führt — für sie ist der Import 1:1.
- Zeilen **vor** `f2b515b` tragen UUIDs, die zu keiner Person mehr auflösbar sind, außer über die
  Klarnamen in `users`. Für sie braucht es eine **Bereinigung**, keine Übersetzungstabelle.

🔗 **Und das ist dieselbe Altlast, die die Suite selbst noch offen hat.** Der feedback-Cutover brachte
exakt denselben Befund hervor (Auth.js prägt pro Anmeldung eine neue UUID statt des `sub`; siehe
„Post-Cutover-Befunde feedback" im Progress), gefixt am 28.07. — die **Datenbereinigung** dazu steht
im Progress bis heute als offener Punkt. **Beide Seiten haben denselben Fehler, aus derselben Ursache,
innerhalb einer Woche gefixt.** → Empfehlung: die Bereinigung **einmal** entwerfen und auf beide
Datenbestände anwenden, statt zweimal dasselbe Verfahren zu bauen.

⚠️ Unabhängig davon bleibt: **der Paritätscheck ist bei jeder Zuordnungsvariante grün**, weil er den
Rundlauf beweist, nicht die Richtigkeit der Zuordnung.

**5 — Secrets: „wird aus Prod übernommen … blast radius ist ja klein".**
Übernahme von `HELFER_SESSION_SECRET` und `AUTH_SECRET` aus der produktiven `stack.env`. Damit
überleben laufende Helfer-Sitzungen (bis 12 h) und Verwaltungs-Sitzungen den Cutover.
⚠️ **Zur Einschätzung „blast radius klein": sie stimmt für den Fehlerfall, nicht für die Übernahme
selbst.** Ein *neues* Geheimnis kostet nur Neuanmeldungen — das ist der kleine Radius. Ein *übernommenes*
Geheimnis wandert dagegen aus einer `stack.env` in eine zweite Datei auf demselben Server und lebt
danach an zwei Stellen weiter; wird der Alt-Stack abgebaut, ohne die alte Datei zu löschen, bleibt ein
gültiges Sitzungsgeheimnis in einer Datei liegen, die niemand mehr pflegt. **Gehört als Zeile in den
Abbau-Teil des Runbooks**, nicht als Nachtrag.

**6 — X-Forwarded-For: „keine Ahnung. Die App muss nach Domain routen können."**
⚠️ **Das beantwortet eine andere Frage als die gestellte, und die gestellte ist die sicherheitsrelevante.**
Das Domain-Routing ist unstrittig und gelöst: die Suite löst den Host über `resolveHost` auf
(`x-forwarded-host` vor `host`), daran hängt das gesamte Modul-Routing seit vier Modulen.
Die offene Frage war die **Absenderadresse für das Rate-Limit am Helfer-Gate** — und dort haben die
beiden Codebasen gegenläufige Annahmen: lagerbuch nimmt den **rechtesten** XFF-Eintrag mit
ausgeschriebener CWE-348-Begründung (`src/lib/auth/rateLimit.ts:23-35`), die Suite nimmt
`cf-connecting-ip` und sonst den **ersten** (`core/ratelimit.ts:60-64`). Der erste XFF-Eintrag ist der
vom Client behauptete. **Konsequenz für ein sechsstelliges Helfer-Kärtchen:** wer den Container an
Cloudflare vorbei erreicht, setzt pro Versuch eine andere Adresse und hat kein Rate-Limit mehr —
gegen einen Coderaum von 10⁶ ist das der Unterschied zwischen „aussichtslos" und „ein Nachmittag".
→ **Die Spec muss die IP-Quelle entscheiden, nicht deferieren.** Die eine Angabe, die dafür noch fehlt
und die nur der Betreiber hat: **ist der Suite-Container aus dem lokalen Netz an Cloudflare/Traefik
vorbei erreichbar?** Ist er es nicht, trägt `cf-connecting-ip` und die Suite-Fassung genügt; ist er es,
gehört die rechteste-Eintrag-Logik aus lagerbuch nach `core/ratelimit.ts` — und dann für alle Module.

**7 — Betriebswerte: „das geht dich wenig an, oder? :D"**
Angenommen — und für **`BESTELL_FAKTOR` nachgeprüft, mit einem Befund als Nebenertrag: die Variable ist
tot.** `config.ts:38` deklariert sie, `config.ts:76` mappt sie auf `config.bestellFaktor` — und
**kein einziger Produktivpfad liest das Feld.** Die einzigen Fundstellen außerhalb der Konfiguration
sind Tests, die es mitmocken (`actions/bestellung.test.ts:4`) oder das Parsen prüfen
(`config.test.ts:15,27`). Berechnet wird ausschließlich die Lücken-Formel in
`src/lib/domain/vorschlag.ts:7-12`. **Ein in der produktiven `stack.env` gesetztes `BESTELL_FAKTOR`
hat also nie etwas bewirkt** — es ist genau die Sorte stiller Konfiguration, die man beim Port
gewissenhaft mitschleppt und die nichts tut. → Beim Port **ersatzlos streichen**; die drei
Warn-/Sitzungswerte bleiben Runbook-Eingaben (ihre Defaults stehen im Code, ein abweichender Prod-Wert
ändert nur Schwellen, nicht Verhalten).

**8 — Bestellvorschlag: „arbeite so wie es im Code steht".**
→ **Die Lücken-Formel gilt** (`vorschlag.ts:7-12`: `max(0, mindestbestand − bestand)`, Kommentar „Kein
Faktor/Puffer"). Die Faktor-Formel aus `implementierungsplan.md:75/:202` ist damit endgültig eine nicht
eingelöste Planzeile. Zusammen mit Antwort 7 schließt sich das sauber: die Formel im Plan und die tote
Variable sind **dieselbe** nie gebaute Absicht, an zwei Stellen konserviert.

**Damit blockiert keine der acht Fragen die Spec mehr.** Offen bleiben zwei Messungen, die vor der
**Fertigstellung** der Spec laufen sollten und beide Struktur bestimmen, nicht nur Werte: die
`sub`-Gleichheit aus 4 und die Erreichbarkeit des Containers aus 6.

---

### Blockiert die Spec

1. **Wie lautet die produktive `APP_BASE_URL` — exakt, mit Schema und ohne abschließenden
   Schrägstrich? Und wird genau dieser Host `SUITE_HOST_LAGERBUCH`?**
   *Warum nicht im Repo:* `compose.yaml:11` liest `${APP_BASE_URL}` aus der gitignorierten `stack.env`;
   im Repo steht nur der zod-Default `http://localhost:3000` (`config.ts:33`) und der Platzhalter
   `lagerbuch.example.com` (`implementierungsplan.md:315`). `KONSOLIDIERUNG-PROGRESS.md` führt die
   Lagerbuch-Domain ausdrücklich unter „Offen". Der Wert ist der **Inhalt jedes gedruckten QR**.
2. **Mit welcher `TZ` läuft der Suite-Container heute — steht in der Server-`.env` etwas?**
   *Warum nicht im Repo:* im Repo ist belegt, was **nicht** gesetzt ist (`iuk-suite/Dockerfile:23-29`,
   `compose.yaml:20-39`) und dass `node:26-alpine` ohne `TZ` UTC liefert. Die Suite lädt aber eine
   `env_file` (`compose.yaml:16-19`), die nicht im Repo liegt.
3. **Wie heißt die produktive `OIDC_ADMIN_GROUP` — und soll der Suite-Betreiber lagerbuch
   mitverwalten dürfen?**
   *Warum nicht im Repo:* `config.ts:46` nennt nur die Vorgabe `lagerbuch-admin`. Die zweite Hälfte
   steht überhaupt nirgends im Code: `feedback` hat die Suite-Admin-Abkürzung ausdrücklich
   gestrichen („Betrieb bedeutet nicht Einsicht"), jedes Folgemodul beantwortet die Frage für sich.
   Für lagerbuch heißt Admin: Bestand korrigieren, aussondern, Etiketten mit Klartext-Codes drucken,
   Tokens ausstellen — Schreibrecht auf dem Materialjournal. Ein falscher Wert erzeugt keinen Fehler,
   sondern ein stummes 404 für alle Verwaltenden.
4. **Ist die Pocket-ID-Instanz der Suite dieselbe wie die von lagerbuch, und liefert sie denselben
   `sub` je Person — oder sind pairwise subject identifiers konfiguriert?**
   *Warum nicht im Repo:* der Subject-Typ ist eine Einstellung am OIDC-Client, nicht im Code. Alle
   historischen `journal.quelle_id`, `tokens.created_by` und `users.id` tragen diesen Wert. **Konkrete
   Prüfung vor jedem Cutover-Termin:** einen `quelleId`-Wert aus der produktiven `lagerbuch.db` ziehen
   und gegen den `sub` halten, den die bereits laufende Suite für dieselbe Person führt. Bei
   Abweichung verliert das gesamte Journal seine Autorschaft — und ein Paritätscheck wäre dabei grün.
5. **Kann `HELFER_SESSION_SECRET` aus der produktiven `stack.env` gelesen und übernommen werden — und
   wird `AUTH_SECRET` übernommen oder neu erzeugt?**
   *Warum nicht im Repo:* beide Werte erzeugt `generate-secrets.sh` zufällig und schreibt sie
   ausschließlich in die gitignorierte `stack.env`. Ein neues Helfer-Geheimnis kappt alle laufenden
   Helfer-Sitzungen (bis zu 12 h Fenster); ein neues `AUTH_SECRET` wirft alle Verwaltungs-Sitzungen
   raus.
6. **Wie sieht die X-Forwarded-For-Kette vor der Suite konkret aus — wie viele Proxies, in welcher
   Reihenfolge, wird `cf-connecting-ip` gesetzt, und ist der Container aus dem lokalen Netz an
   Cloudflare/Traefik vorbei erreichbar? Und wie sieht sie vor der heutigen lagerbuch-Instanz aus?**
   *Warum nicht im Repo:* `src/lib/auth/rateLimit.ts:23-28` und `deployment.md:60-64` nennen als
   Betriebsannahme genau **einen** vertrauenswürdigen Reverse-Proxy; `core/ratelimit.ts:52-55` nennt
   Cloudflare **und** Traefik. Beide Annahmen können nicht gleichzeitig für denselben Aufbau
   stimmen, und ohne die tatsächliche Kette ist Entscheidung 12 geraten. In der neuen Topologie sind
   beide Richtungen falsch (Falle 12).
7. **Welche Werte stehen produktiv in `BESTELL_FAKTOR`, `WARN_TAGE_KRITISCH`, `WARN_TAGE_FAELLIG`,
   `HELFER_SESSION_STUNDEN`?**
   *Warum nicht im Repo:* nur die Defaults stehen im Code (`config.ts:36-39`); `stack.env` ist
   gitignored (`implementierungsplan.md:331`). Ein **abweichend gesetztes** `BESTELL_FAKTOR` wäre der
   Beweis, dass der Betreiber ein Verhalten erwartet, das der Code nie hatte.
8. **Gilt für den Bestellvorschlag die Lücken-Formel (Code) oder die Faktor-Formel (Plan)?**
   *Warum nicht im Repo:* beide sind belegt und widersprechen sich —
   `src/lib/domain/vorschlag.ts:5-12` (mit Kommentar „Kein Faktor/Puffer") gegen
   `implementierungsplan.md:75/:202`. Der Code kann nicht entscheiden, welche Absicht gilt.

### Blockiert einzelne Entscheidungen

9. **Wie groß ist `lagerbuch.db`, und wie viele Zeilen stehen in `buchungen`, `chargen`, `artikel`,
   `checks`, `o2_messungen`, `bz_kontrollen`, `tokens` und `users`? Wie alt ist die älteste
   `buchungen.ts`?**
   *Warum nicht im Repo:* die Zahlen liegen im Volume `lagerbuch_data`. Ohne sie ist das
   Laufzeitverhalten der rekonstruktiven Bestandsrechnung (Falle 10) nicht bewertbar, kein
   Performance-Budget setzbar und die Dauer des Wartungsfensters geraten. Für `users` zusätzlich:
   wie viele **Menschen** haben Zugang — die Zeilenzahl ist wegen der Waisenzeilen kein Personenzähler
   (Falle 22).
10. **Enthält `checks.ergebnis` in Produktion noch Zeilen im ALTEN Array-Format?**
    *Warum nicht im Repo:* beide Leser halten beide Formate offen, aber ob Altzeilen existieren, sagt
    nur die Datenbank. „Nein" erlaubt es, den Altformat-Zweig beim Port entfallen zu lassen; „ja" macht
    ihn zur 1:1-Pflicht.
11. **Gibt es in `chargen.verfall`, `lagerort_verfall.verfall` oder `bz_kontrollen.kompresse_verfall`
    Werte außerhalb 01–12?**
    *Warum nicht im Repo:* der laxe Regex lässt sie zu, die DB hat keinen CHECK. Ob je einer entstanden
    ist, entscheidet, ob eine strengere Migration am Bestand scheitert und ob heute Chargen zu Unrecht
    als abgelaufen geführt werden.
12. **Wie viele Tokens sind aktiv, wie viele davon haben `ziel_typ`/`ziel_id` gesetzt, und wie viele
    `scope_lagerort_id`?**
    *Warum nicht im Repo:* Datenbestand. Die Zahl entscheidet, ob Entscheidung 14 eine Handvoll Codes
    betrifft oder den ganzen Fuhrpark, und sie bestimmt die Trefferwahrscheinlichkeit eines
    Brute-Force-Versuchs (aktive Codes / 10⁶).
13. **Wie viele Etiketten hängen physisch — aufgeschlüsselt nach Artikel-Regaletiketten,
    Token-Kärtchen und Geräte-Aufklebern — und wo? Gibt es Nachdrucke aus alten Beständen, und
    Etiketten außerhalb des Hauses (Container, Fremdstandorte)?**
    *Warum nicht im Repo:* die Datenbank kennt nur `aktiv`-Flags, nicht, ob je gedruckt und geklebt
    wurde. `tokens.lastUsedAt` sagt „schon mal eingelöst", nicht „hängt im RTW 1". Die Zahl entscheidet,
    ob ein Neudruck überhaupt eine Option ist (Entscheidung 16).
14. **Existieren gedruckte Etiketten für Artikel oder Codes, die inzwischen deaktiviert oder gelöscht
    sind?**
    *Warum nicht im Repo:* Druckseite filtert auf `aktiv = true`, Leseseite nicht (Falle 26). Ob die
    Differenz real existiert, weiß nur, wer die Regale sieht — diese Etiketten sind **nicht
    nachdruckbar**.
15. **Gibt es `/g/<barcode>`-QR-Aufkleber auf Geräten? Wenn ja: womit wurden sie erzeugt?**
    *Warum nicht im Repo:* der Auswertungs-Zweig existiert (`actions/geraete.ts:71-72`,
    `actions/bz.ts:73-74`), ein Erzeuger nicht. Entweder außerhalb gedruckt — dann ein Artefakt, das
    niemand im Repo zählen kann — oder der Zweig ist tot.
16. **Wurde jemals ein Artikel oder Fahrzeug hart gelöscht, während ein Zugangs-Code darauf zeigte
    (`tokens.ziel_typ`/`ziel_id`)?**
    *Warum nicht im Repo:* `tokens.zielId` ist bewusst ohne Fremdschlüssel, und `pruefeFahrzeug` prüft
    ihn nicht (Falle 5). Nur die Daten zeigen, ob heute gedruckte Codes ins Leere zeigen — was beim
    Cutover sonst als „funktioniert nach dem Umzug nicht mehr" fehlinterpretiert würde. Und: wurden je
    Zugangs-Codes **gelöscht** (nicht nur gesperrt), und wurden deren Kärtchen eingesammelt?
    Der Hard-Delete hinterlässt keine Spur (`loeschen.ts:168`).
17. **Sind die Fahrzeug-Vorlagen (`fahrzeug_templates`) produktiv im Einsatz, und hängt mindestens ein
    Fahrzeug an einer Vorlage?**
    *Warum nicht im Repo:* Migration `0004` ist eingespielt, aber ob die Funktion benutzt wird, steht
    nicht im Code. Davon hängt ab, wie viel Aufwand Sync-Semantik, Grabsteine (`entfernt`) und
    Überschreibungen (`ueberschrieben`) im Neubau verdienen — und ob der Artikel-Löschbefund
    (Falle 5) praktisch erreichbar ist.
18. **Wie viele Geräte tragen einen Hersteller-Barcode (EAN/Seriennummer vom Typenschild), wie viele
    einen selbst vergebenen?**
    *Warum nicht im Repo:* beide Spalten sind formfreier Text; die Herkunft ist nicht kodiert. Der
    Anteil entscheidet, ob das Eingabeformat ein Vertrag mit der Außenwelt ist (Falle 29).
19. **Existiert im Volume ein Verzeichnis `backups/`, wie viele Dateien liegen darin, wie alt ist die
    jüngste? Falls leer: läuft der Container überhaupt mit `NODE_ENV=production`?**
    *Warum nicht im Repo:* `deployment.md:120-125` behauptet, es gebe keine automatischen Backups;
    `src/instrumentation.ts:11-18` sagt das Gegenteil. Welche der beiden Aussagen für die laufende
    Instanz gilt, zeigt nur ein Blick ins Volume.
20. **Läuft auf dem Suite-Host bereits ein Cron für `scripts/backup.sh` — mit welchem Takt, welchem
    `BACKUP_KEEP`, welchem Ziel, und wie viel freier Platz steht neben `files_data` zur Verfügung?**
    *Warum nicht im Repo:* das Skript liegt im Repo, sein Aufruf nicht.
21. **Ist `AUTH_COOKIE_DOMAIN` in Produktion gesetzt, und auf welchen Wert?**
    *Warum nicht im Repo:* `core/auth/cookies.ts:47` liest die Variable; sie steht in keiner
    eingecheckten `.env` mit Wert. Davon hängt ab, ob ein mitkopiertes `domain`-Attribut die
    Helfer-Sitzung **samt Klartext-Code** auf fremde Modul-Hosts trägt (Falle 19).
22. **Läuft die Suite in Produktion mit genau einer Instanz oder mit mehreren hinter einem
    Load-Balancer?**
    *Warum nicht im Repo:* beide Rate-Limiter halten ihre Zähler im Prozessspeicher und schreiben das
    ausdrücklich als Vorbehalt hin. Bei zwei Instanzen verdoppelt sich das effektive Limit; lagerbuchs
    Kommentar rechtfertigt den Verzicht auf Redis ausdrücklich mit „Single-Process-standalone".
23. **Überwacht ein externer Dienst `https://<lagerbuch-domain>/api/health`?**
    *Warum nicht im Repo:* Monitoring-Konfiguration liegt außerhalb beider Repos. Ohne Umstellung auf
    `/api/health/lagerbuch` meldet der Monitor nach dem Cutover dauerhaft grün (Falle 51).
24. **Welche Cache-Regeln stehen heute vor der lagerbuch-Domain (Cloudflare-Cache-Rule für `/_next/*`,
    Browser-Cache-TTL auf „Respect Existing Headers", 503 statt 404 im Backend-Gap) — und gelten
    dieselben Regeln für die Suite-Domain?**
    *Warum nicht im Repo:* `deployment.md` (Abschnitt „CDN/Proxy") beschreibt sie ausführlich und nennt
    sie Pflicht, kann aber nicht wissen, ob sie gesetzt sind. Die Rückfallebene `?dpl=<sha>` fällt
    beim Umzug ohnehin weg (Falle 52).
25. **Mit welchen Geräten und Bildschirmgrößen wird `/helfer/*` im Lager tatsächlich bedient —
    private Handys, Diensttablets, beides? Hoch- oder Querformat?**
    *Warum nicht im Repo:* das Repo belegt nur, dass mobil gedacht wurde (`.app` mit `100dvh`,
    Tab-Leiste unten, die `noText`-Begründung in `Stepper.tsx:19-21`). Welche Geräte das sind,
    entscheidet, ob der Suite-Breakpoint 768px die Nutzung überhaupt trifft oder ob die reale Flotte im
    760–768-Fenster liegt (Falle 38).
26. **Wird beim Zählen und Buchen mit Handschuhen gearbeitet?**
    *Warum nicht im Repo:* die 42/30px stehen als Zahlen in `globals.css:73-76`, ohne Begründung. Ob
    sie eine bewusste Ergonomie-Entscheidung waren oder nur die Maße des Klickdummys, lässt sich aus
    dem Repo nicht entscheiden — und davon hängt ab, ob das Anheben auf 56px eine Verbesserung ist
    (Entscheidung 33). Die Suite begründet ihr `TAP = 56` ausdrücklich mit Handschuhen.
27. **Wird der Dunkelmodus der Suite benutzt, und soll lagerbuch ihn unterstützen — oder darf das
    Modul hell festgelegt bleiben?**
    *Warum nicht im Repo:* eine Betriebsentscheidung; sie halbiert oder verdoppelt die Palettenarbeit
    (Falle 37).
28. **Wie viele Positionen hat ein typisches Fahrzeug im Soll — 10, 30, 80? Und wie viele Fächer? Wie
    groß ist der Fuhrpark?**
    *Warum nicht im Repo:* `CheckFlow.tsx` gruppiert nach Fächern und rendert je Position einen
    Stepper; die Datenmenge steht nur in der Produktionsdatenbank. Die Antwort entscheidet, ob 14px mehr
    Zeilenhöhe ein Detail oder ein Bedienproblem sind (Entscheidung 33) — und wie groß der
    RSC-Payload aus Falle 15 real ist.
29. **Sind die drei Google-Schriften (Barlow, Barlow Condensed, IBM Plex Mono) eine Vorgabe des
    Corporate Designs, oder eine freie Wahl des Entwurfs?**
    *Warum nicht im Repo:* `layout.tsx:6-24` lädt sie, `implementierungsplan.md:53` nennt sie als
    Entwurfsentscheidung — eine CD-Bindung ist nirgends dokumentiert. Falls es eine gibt, ist
    Entscheidung 32 (a) ein Verstoß, keine Option.
30. **Gibt es im Lagerraum und in der Fahrzeughalle nutzbares Netz? Haben Helferinnen die Anwendung als
    PWA auf dem Startbildschirm installiert?**
    *Warum nicht im Repo:* Einsatzumgebung und Zustand auf fremden Geräten. Entscheidet, ob der
    PWA-Anteil bei „installierbar" bleibt oder einen Service Worker braucht (Entscheidung 24) — und
    jede installierte Verknüpfung trägt `start_url` auf der **alten** Domain.
31. **Wann laufen Fahrzeug-Checks, BZ-Kontrollen und Inventuren tatsächlich (Wochentag, Uhrzeit)?**
    *Warum nicht im Repo:* bestimmt das Wartungsfenster. Ein Cutover mitten in einem laufenden Check
    bricht diesen ab, sobald `HELFER_SESSION_SECRET` wechselt — und der abgebrochene Check hinterlässt
    eine `checks`-Zeile ohne `completedAt`.
32. **Welches Etikettenmaterial wird benutzt (Hersteller und Artikelnummer)? Und was passiert
    außerhalb des Repos mit den vier Ausgabewegen — Etikettenbogen, `bestellvorschlag.csv`,
    kopierte Bestellliste, `bestand-*.xlsx`?**
    *Warum nicht im Repo:* `globals.css:265-283` nennt die Maße, nicht das Produkt — ohne die
    Artikelnummer lässt sich nach dem Umbau nicht prüfen, ob der Bogen noch passt. Für den Druck ist
    die Repo-Seite abgeschlossen: es gibt genau **einen** `window.print()`-Aufruf
    (`EtikettenBogen.tsx:34`) und genau **einen** `@media print`-Block (`globals.css:275`) —
    nachgezählt. Was das Repo **nicht** wissen kann, ist der Weg danach: ob zusätzlich über den
    Browser-Druckdialog aus Listenansichten gedruckt wird; ob die CSV in Excel, in einer
    Warenwirtschaft oder in einem Lieferantenportal geöffnet wird (das entscheidet BOM, Zeilenende
    und die Formelfrage aus Entscheidung 37); ob ein nachgelagertes Blatt oder Makro die
    `bestand-*.xlsx` über **Spaltenposition** oder **Blattname** anspricht (das entscheidet, wie
    streng 1:1-Pflicht 28 zu lesen ist); wohin die kopierte Bestellliste eingefügt wird; und ob
    Exporte irgendwo als Nachweis abgelegt werden. Der Umfang der Wege ist damit belegt, ihre
    **Abnehmer** sind es nicht. Die Einzelfragen dazu stehen als 43–47.
33. **War eine Fahrzeug-Bindung der Helfer-Codes je gemeint?**
    *Warum nicht im Repo:* `implementierungsplan.md:51` sieht `scopeLagerortId` in der Sitzung vor, der
    Code führt sie nicht (Abschnitt 2.4). Ob das ein aufgegebener Plan oder ein vergessener Rückbau
    ist, sagt nur die Absicht — und sie entscheidet Entscheidung 14. Heute kann jede Helferin jedes
    Fahrzeug checken, was im Einsatz vermutlich erwünscht ist.
34. **Wie viele Zeilen hat `buchungen` heute in Produktion, wie viele hat `checks`, und wie schnell
    wachsen beide (Buchungen pro Woche, Checks pro Woche)? Und: wurde in den letzten Monaten je ein
    Vorgang gesucht, der älter war als die letzten 100 Buchungen?**
    *Warum nicht im Repo:* die Datenmenge steht ausschließlich auf dem Server. Beide Testregime sind
    Wegwerf: `lagerbuch/vitest.config.ts` fährt gegen `:memory:` mit einstelliger Zeilenzahl,
    Playwright startet mit `rm -rf ./.data/e2e` (`playwright.config.ts:81`). Die Produktionsdatenbank
    liegt im gitignorierten Volume. Ob die 100er-Grenze im Alltag überhaupt greift, ist eine
    Betriebsbeobachtung, keine Codeeigenschaft. *Blockiert:* Entscheidung 35.
35. **Werden Journal- und Check-Filter als Links geteilt, gespeichert oder in Runbooks/Mails abgelegt
    — und sind die Parameternamen `q`, `typ`, `von`, `bis`, `fz` damit ein Außenvertrag, oder dürfen
    sie beim Neubau umbenannt werden (etwa `von`/`bis` zu einem `zeitraum`-Paar, wie es `RangePicker`
    nahelegt)?**
    *Warum nicht im Repo:* ob ein Link außerhalb der Anwendung existiert, ist keine Codeeigenschaft.
    Im Repo bindet die Namen genau eine Stelle: `e2e/suche-filter.spec.ts:30` prüft literal
    `toHaveURL(/[?&]q=Verband/)` — ein selbst geschriebener Test, der bei einer Umbenennung einfach
    mitgeändert würde. Ein gespeichertes Lesezeichen würde das nicht.
36. **Filtert die Außenkante (Reverse-Proxy/Ingress vor dem Suite-Container) Pfade unter `/m/*`, oder
    ist die interne Pfadform von außen erreichbar? Falls sie gefiltert wird: gilt das für alle
    Suite-Domains gleich, oder nur für einzelne?**
    *Warum nicht im Repo:* im Repo lässt die Suite `/m/*` bewusst durch — `core/routing.ts:54-67`
    behandelt den Fall eigens, `proxy.ts:103` schließt nur `_next/static`, `_next/image` und
    `favicon.ico` aus. Ob davor noch etwas steht, das den Präfix an der Kante wegfiltert, steht
    ausschließlich in der Proxy-Konfiguration auf dem Server; das Repo enthält keine solche
    Konfiguration (`compose.yaml` beschreibt nur den Container selbst). Davon hängt ab, ob der Befund
    aus Falle 63 ein externer Fehlermodus ist (dann braucht es den E2E auf beiden Pfadformen und ggf.
    eine Kanonisierung) oder nur ein interner (dann reicht der E2E auf der äußeren Form).
37. **Welche Hostnamen terminieren heute auf dem Suite-Container — und darf lagerbuch auf allen davon
    antworten?**
    *Warum nicht im Repo:* die Traefik-Regel kommt aus `SUITE_TRAEFIK_RULE` (`compose.yaml:86`,
    `${SUITE_TRAEFIK_RULE:-…}`), steht also nur in der `.env` **auf dem Server**; der Wert in
    `.env.example:200` ist eine Vorlage, kein Prod-Beleg. `SUITE_HOST_<KEY>` sagt, welcher Host zu
    welchem Modul **gehört**, nicht, welcher überhaupt terminiert — und genau die zweite Liste ist die
    Fläche aus Falle 61: jeder terminierende Host beantwortet `/m/lagerbuch/*`, inklusive
    `/m/lagerbuch/t/<code>` mit seiner unumkehrbaren `lastUsedAt`-Nebenwirkung. Entscheidet, ob
    Entscheidung 10 die Option (d) mitnehmen muss und wie eng das Prädikat gefasst wird (ein Host,
    mehrere Hosts, Rollen wie bei `files`). **Blockiert die Spec nicht:** der modulinterne Riegel aus
    Option (d) schließt die Tür unabhängig davon, wie die suiteweite Frage ausgeht.
38. **Sind aus dem laufenden Betrieb Störungen gemeldet worden, bei denen nach dem Antippen einer
    Schaltfläche die Seite verschwand oder eine englische Fehlermeldung erschien — im Helfer-Weg
    (`/a/<id>`, Entnahme buchen) oder in der Verwaltung (Deaktivieren, Vorlagen, Soll-Positionen)?**
    *Warum nicht im Repo:* Vorfallgeschichte. Das Repo belegt, **dass** 22 Aufrufstellen ungefangen
    sind (Falle 62) und dass eine E2E-Zusicherung den Absturz als erwartete Ausgabe festhält
    (`e2e/helfer-flow.spec.ts:56`) — nicht, ob der Fall im Betrieb je eingetreten ist. Die Antwort
    entscheidet, ob Entscheidung 36 (c)/(d) Pflicht oder Kür ist, und ob der Absturz beim Cutover als
    Regression missdeutet würde.
39. **Wird ein Helfer-Zugangscode je mitten in einer laufenden Schicht gesperrt (und wenn ja, nach
    welcher Praxis — sofort oder zum Schichtende)? Und wurde je ein Verwaltungskonto während einer
    laufenden Sitzung aus der Admin-Gruppe entfernt?**
    *Warum nicht im Repo:* Betriebspraxis. Der Code schreibt die Sofortwirkung als Zusage aus
    (`src/actions/session.ts:20-21`) und `e2e/helfer-flow.spec.ts:31-57` prüft sie — aber ob die
    Sperrung im Betrieb während einer Schicht vorkommt, sagt nur, wer sperrt. Genau dieser Fall ist
    der einzige belegte Auslöser des Vollbild-Absturzes aus Falle 62. Frage 12 zählt aktive Tokens,
    Frage 31 legt die Check-Zeiten fest; nach der Sperrpraxis fragt keine der übrigen.
40. **Steht vor der Suite ein CDN oder ein cachender Reverse-Proxy, und cacht der Fehlerantworten
    (404/502) mit einer Browser-TTL?**
    *Warum nicht im Repo:* das Repo zeigt nur die Traefik-Labels des Suite-Containers
    (`iuk-suite/compose.yaml`). Was **vor** Traefik steht — Cloudflare, ein anderer CDN, ein cachender
    nginx — ist Host-Architektur und steht nirgends im Code. lagerbuchs ganzer `deploymentId`-Vorfall
    hängt genau daran (`deployment.md`, Abschnitt „CDN/Proxy": 404 im Neustartfenster, 4 h
    Browser-TTL, weiße Seite). Ohne cachende Schicht kauft `deploymentId` fast nur noch den
    Version-Skew-Reload. *Blockiert:* Entscheidung 23, Hälfte 1.
41. **Gibt es für die Suite zwei Stacks (Staging und Prod), oder deployt `main` direkt auf Prod — und
    soll die Kanaltrennung `edge`/`vX.Y.Z` aus lagerbuch einen Ersatz bekommen?**
    *Warum nicht im Repo:* die Zahl der Stacks und ihre Zuordnung zu Tags steht auf dem Server. Es
    gibt genau eine `iuk-suite/compose.yaml` mit fest verdrahtetem `:latest` (Zeile 3) und keine
    `IMAGE_TAG`-Variable; das **passt** zu „ein Stack", beweist es aber nicht. lagerbuch führt heute
    beide Kanäle (`stack.env.example:2`, `deployment.md:29`), erzeugt von `ci.yaml:6` und `:78-79` —
    im Ziel fehlt der Erzeuger vollständig. *Blockiert:* Entscheidung 23, Hälfte 2.
42. **Welche Architektur zieht der Prod-Host — arm64, amd64 oder beide?**
    *Warum nicht im Repo:* `iuk-suite/.github/workflows/ci.yml:37-47` baut und pusht **beide**
    Plattformen und legt sie per `imagetools create` in ein Manifest; welche davon der Server
    tatsächlich zieht, steht nur auf dem Server. `implementierungsplan.md:4` nennt ARM64, aber für den
    **Alt**-Stack vom 10.07.2026. Die Antwort entscheidet, wie teuer ein künftiger Node-/ABI-Sprung
    wird: solange better-sqlite3 für die gefahrene Architektur einen musl-Prebuild liefert, kostet er
    nichts (entlastender Befund zu musl) — fehlt er einmal für arm64, steht im Image keine Toolchain
    (`iuk-suite/Dockerfile:2-11`: kein `python3`, kein `make`, kein `g++`), und der Build scheitert,
    statt langsam zu werden.
43. **In welchem Programm wird `bestellvorschlag.csv` geöffnet — Excel, LibreOffice, eine
    Warenwirtschaft oder ein Lieferantenportal?**
    *Warum nicht im Repo:* das Repo belegt vollständig, **was** erzeugt wird
    (`BestellListe.tsx:29-33`: sechs Spalten, Semikolon, gequotet, kein BOM, `\n` statt CRLF) — aber
    nicht, wer es liest. Genau der Abnehmer entscheidet drei Dinge auf einmal: ob das fehlende
    UTF-8-BOM Umlaute in Artikelnamen zerlegt, ob CRLF nötig ist, und ob die Formel-Neutralisierung
    aus Entscheidung 37 gebaut wird oder schadet.
44. **Verarbeitet ein nachgelagertes Blatt, Makro oder Skript die heruntergeladene `bestand-*.xlsx`
    weiter — und wenn ja: über Spaltenposition, Spaltenüberschrift oder Blattname?**
    *Warum nicht im Repo:* das Repo legt die neun Überschriften (`ArtikelTable.tsx:89-99`), den
    Blattnamen `"Bestand Handlager"` (`:140`) und die Zellentypen (`:138`) fest, und die Tests nageln
    den Dateinamen doppelt fest (`bestand-export.test.ts:44`, `e2e/bestand-export.spec.ts:18`). Was
    dahinter liegt, endet am Download-Ordner. Die Antwort entscheidet, wie streng 1:1-Pflicht 28 zu
    lesen ist.
45. **Wohin wird die über „Liste kopieren" erzeugte Bestellliste eingefügt — E-Mail, Messenger, ein
    Bestellformular beim Lieferanten, oder wird sie abgeschrieben?**
    *Warum nicht im Repo:* der erzeugte Text ist belegt (`BestellListe.tsx:25`: `${vorschlag} ×
    ${name}` je Zeile, Trennzeichen U+00D7, nur unbestellte Zeilen). Das Ziel der Zwischenablage
    verlässt den Prozess und ist im Repo prinzipiell unsichtbar. Die Antwort entscheidet, ob das
    Multiplikationszeichen U+00D7 erhalten bleiben muss (manche Eingabefelder und Altsysteme vertragen
    es nicht) und ob die reine Textform beim Neubau bleibt.
46. **Warum liefern „Liste kopieren" (nur unbestellte Zeilen) und „CSV" (alle Zeilen)
    unterschiedliche Zeilenmengen — ist das gewollt, und soll es so bleiben?**
    *Warum nicht im Repo:* der Unterschied ist im Code eindeutig belegt (`BestellListe.tsx:25`
    filtert `!z.bestellt`, `:30` filtert nicht) und wird nirgends begründet — kein Kommentar, kein
    Test, kein Eintrag im Implementierungsplan. Ob es eine bewusste Arbeitsteilung ist
    (Zwischenablage = was noch zu tun ist, CSV = die Dokumentation des ganzen Vorgangs) oder ein
    historischer Zufall, sagt nur die Absicht. Beim antd-Neubau ist die Vereinheitlichung die
    naheliegendste stille Änderung — sie muss entschieden, nicht nebenbei begangen werden.
47. **Werden Exporte (CSV oder xlsx) irgendwo abgelegt und als Nachweis aufbewahrt, und gibt es
    Alt-Exporte, die weiterhin gelesen werden?**
    *Warum nicht im Repo:* beide Dateien entstehen im Browser und gehen in den Download-Ordner des
    jeweiligen Rechners (`BestellListe.tsx:31-34`, `ArtikelTable.tsx:142`); das Modul schreibt sie
    nirgends serverseitig weg und führt kein Verzeichnis darüber. Ob eine Ablage existiert,
    entscheidet, ob Format- und Statustext-Änderungen nur die Zukunft betreffen oder auch das Lesen
    alter Dateien — und ob der konstante Dateiname `bestellvorschlag.csv` ohne Datum (`:33`) in der
    Ablage bereits zu Überschreibungen geführt hat.

---

## 8. Rohbefunde, die die Gegenprüfung widerlegt hat

Diese Aussagen stammen aus den Rohanalysen und haben die Gegenprüfung **nicht** überstanden. Sie
stehen hier, damit sie beim nächsten Durchgang nicht erneut „gefunden" werden.

1. **„Alle 61 `revalidatePath`-Aufrufe werden beim Umzug zu Nulloperationen."** Widerlegt am
   Next-16-Quelltext: `revalidate.js:210-211` setzt `store.pathWasRevalidated` **unbedingt**, mit
   eigenem `// TODO: only revalidate if the path matches` — es gibt keinen Abgleich gegen den
   Routenbaum. Die Seite wird neu gerendert, und der Client räumt den ganzen Prefetch-Cache. Dazu:
   30 der 34 Routen tragen `force-dynamic`, die übrigen vier sind Ziel keines Aufrufs. Es bleibt ein
   Konventionsbruch mit einer Abhängigkeit (Falle 49), Schwere niedrig statt hoch.
2. **„Die naheliegende Korrektur `TZ=Europe/Berlin` wirkt auf Alpine nicht, solange `tzdata` fehlt."**
   Gemessen falsch: `docker run --rm -e TZ=Europe/Berlin node:26-alpine` liefert `Europe/Berlin` mit
   korrektem Offset, obwohl `/usr/share/zoneinfo/Europe/Berlin` im selben Lauf nicht existiert — Node
   bringt die Zonendatenbank in der gebündelten ICU mit. Die Abhilfe ist eine `.env`-Zeile.
3. **„Unter UTC schneidet `verfall.ts` das Monatsende zwei Stunden zu FRÜH und die MTK-Ampel springt
   einen Tag zu früh."** Richtung falsch: gemessen ergibt `new Date(2026,8,0,23,59,59,999)` unter
   Berlin `21:59:59.999Z`, unter UTC `23:59:59.999Z` — also **später**. Dasselbe für `geraet.ts:37`.
   Beide Ampelgrenzen wandern in die harmlose Richtung; der Schaden liegt in `format.ts:14`
   (Journal-Anzeige, Vortag) und in `backup.ts:41` / `bestand-export.ts:56`.
4. **„`bzFaelligkeit` ist DST-blind, weil sie `31 * 86_400_000` addiert — in Europe/Berlin verschiebt
   das den Fälligkeitstag."** Widerlegt: `src/lib/domain/bz.ts:22-24` rechnet `tageBisFaellig` und
   `ueberfaellig` ausschließlich aus rohen ms-Differenzen; beides ist zeitzonen- und DST-unabhängig.
   Die Zeitumstellung verschiebt nur die Wanduhrzeit des angezeigten `faelligAm` um eine Stunde; der
   Fälligkeits-**Tag** kippt nur, wenn die letzte Kontrolle in der 23-Uhr-Stunde lag. Ebenso ist
   `geraet.ts:37-38` DST-fest, weil `Math.round` über zwei lokale Mitternachte läuft.
5. **„Eine kopierte `lagerbuch.db` gegen neu gestempelte Migrationen führt zu einem Voll-Replay, das
   die Daten beschädigt."** Prämisse und Folge beide zu scharf: der geplante und bei allen vier
   Vorgängermodulen praktizierte Weg ist **regenerieren plus Zeilenimport in eine frische DB** — die
   Zieldatei trägt lagerbuchs `__drizzle_migrations` dann gar nicht. Und selbst im Dateikopie-Fall
   klammert `dialect.cjs:677,694` alles in BEGIN/ROLLBACK: es wäre ein **Startabbruch mit unversehrten
   Daten**, kein Datenverlust. (Die erste Anweisung ist außerdem `CREATE TABLE artikel`, nicht
   `lagerorte`.) Was bleibt, ist eine Runbook-Zeile — der tragende Befund ist stattdessen der
   **Trigger-Verlust beim Regenerieren** (Falle 1).
6. **„Der Import ist für `buchungen` nicht wiederholbar, weil `onConflictDoUpdate` am Trigger
   scheitert."** Halb widerlegt: der Abbruch ist gemessen real, aber `ON CONFLICT DO NOTHING` bzw.
   `INSERT OR IGNORE` laufen im zweiten Lauf durch (ebenfalls gemessen). Für ein append-only-Journal
   ist das die fachlich richtige Strategie, und das Idiom steht bereits in diesem Repo
   (`src/db/seed-handlager.ts:9`). Es ist eine Wortwahl im Import-Skript, kein blockierendes Problem.
   Die **zweite** Hälfte des Rohbefunds — `INSERT OR REPLACE` umgeht den Trigger still — steht
   unverändert (Entscheidung 4).
7. **„`ensureHandlager` fehlt nach dem Umzug in jeder Produktions-Datenbank."** Zu weit: weil die
   Funktion bei jedem Boot mit `onConflictDoNothing` läuft, trägt die produktive `lagerorte`-Tabelle
   die Zeile seit M1 — sie reist mit den Altdaten mit, und die erste Entnahme nach dem Cutover läuft.
   Die verbleibende Expositionsfläche ist enger und trotzdem echt: jede Umgebung, die **ohne** den
   Import entsteht (Falle 54).
8. **„`getSqlite()` hat in `core/db` kein Gegenstück; der Backup-Job braucht eine zweite Verbindung
   oder eine `core`-Erweiterung."** Widerlegt: der drizzle-Client exponiert das rohe better-sqlite3-Handle
   als `$client` (`drizzle-orm/better-sqlite3/driver.d.ts:23`), also
   `getModuleDb("lagerbuch", schema).$client.backup(ziel)` über den bestehenden `globalThis`-Cache.
   Keine zweite Verbindung, kein Querschnitt für vier Bestandsmodule.
9. **„Der Layout-Guard gatet `/t/<code>` mit und macht das Einlösen unmöglich."** Strukturell
   unmöglich: `/t/[code]` ist ein **Route Handler**, und Route Handler werden von keinem `layout.tsx`
   umschlossen. Aus demselben Grund ist die Sorge um `/m/lagerbuch/api/*` leer. Die Sorge überlebt nur
   für `/g/[code]` — eine Page — und dafür liegt die Lösung (Routengruppen) bereits im Baum
   (Falle 55).
10. **„Die lagerbuch-Fassung von `pages`/`cookies` kollidiert mit `authCookies()`."** Es gibt keine
    Kollision: `core/auth/cookies.ts:33-40` legt ausdrücklich dar, dass Auth.js die Config tief in die
    Defaults merged und nur bei `!== undefined` überschreibt — `domain`, `secure` und `maxAge` können
    im selben `options`-Objekt nebeneinander stehen. **Invertiert:** die Suite lässt `maxAge` bewusst
    auf dem Auth.js-Default (reines Session-Cookie), also bringt der Port den Fehler **zurück**, den
    lagerbuch behoben hat — eine Aufgabe an der Suite (Entscheidung 15). Ebenso ist `adminLandingPfad`
    **nicht** tot und nicht unportierbar: es liest den modul-eigenen `?returnTo` auf der modul-eigenen
    Gate-Seite und hat mit Auth.js-Cookies mechanisch nichts zu tun.
11. **„Das Sperren eines Tokens wirkt nur schreibend — die Zusage §6 wird gebrochen."** Der Mechanismus
    stimmt, die Rahmung nicht: `implementierungsplan.md` §6 spezifiziert den Mechanismus in der Klammer
    ausdrücklich als „bei **jeder schreibenden Aktion**" — der Code implementiert die Spec wörtlich.
    Es ist eine bewusste Entwurfsentscheidung, kein Riss. Falsch zitiert war zudem
    `implementierungsplan.md:357`: das steht unter **Integration** (Vitest gegen In-Memory-SQLite),
    nicht unter E2E; die echte Playwright-Spec ist `e2e/helfer-flow.spec.ts:31`.
12. **„Der Check-Default `ist ?? soll` ist ein latenter Defekt; es gibt keinen Testfall ‚Position nicht
    angefasst', und der einzige E2E fährt den unberührten Pfad nie."** Dreifach widerlegt: (a) ein
    **abgebrochener** Check schreibt gar nichts — `abschluss()` läuft nur aus den Abschluss-Knöpfen
    (`CheckFlow.tsx:361/:413/:484`); (b) `check.test.ts:63-71` **ist** dieser Testfall und behauptet
    ausdrücklich die Eröffnungs-Korrektur; (c) `e2e/geraete.spec.ts:59-61` klickt den Zähl-Schritt
    unberührt durch. Es ist eine dokumentierte und testverankerte Invariante, kein Defekt — Schwere
    unterhalb „blockierend" (Entscheidung 1). Was tatsächlich fehlt: niemand prüft die entstandenen
    Buchungen.
13. **„Der Artikel-Hard-Delete erzeugt eine unbehandelte Server-Action-Exception, also Fehlerseite/500."**
    Widerlegt: `LoeschDialog.tsx:54-65` fängt die Rejection und rendert sie in den Fehlerslot; der
    Artikel bleibt stehen. In Produktion redigiert Next die Meldung — ärgerlich, aber kein Absturz.
    **Der zweite Teil ist dagegen schärfer als der Rohbefund:** `tokens.scopeLagerortId` wird von
    **keinem** Produktionspfad geschrieben; der Zähler in `pruefeFahrzeug` steht dauerhaft auf 0
    (Falle 5).
14. **„Der `<input type=\"month\">` in `CheckFlow.tsx:280` ist die Bremse vor dem laxen Monats-Regex."**
    Falsche Stelle: der Check-Verfall läuft über `MONAT_REGEX` (`check.ts:58` via
    `lagerort-verfall.ts:10`) und ist ohnehin streng. Die tatsächlich einzigen Bremsen vor den laxen
    Ausdrücken sind `ArtikelDrawer.tsx:307` (Zugang) und `KontrolleForm.tsx:71` (BZ-Kontrolle).
15. **„Der Zustands-Vertrag verliert mit dem antd-Umbau seine einzige Absicherung."** Nur zur Hälfte:
    der Rollenselektor `e2e/geraete.spec.ts:66` ist die **Eingabe**seite und überlebt den Umbau nicht.
    Die abschließende Behauptung `:80` (`getByText("Defekt")` auf der Detailseite) prüft dagegen das
    **persistierte** Literal über die Serverauswertung hinweg und überlebt — sofern sie beim Anpassen
    stehen bleibt.
16. **„Code-Recycling ist bei ein paar hundert Codes kein exotischer Zufall."** Falsch gerechnet: die
    Wahrscheinlichkeit ist 1/10⁶ je Ziehung, bei D gelöschten und N neuen Codes rund N·D/10⁶ — für
    D=50/N=100 etwa 0,005. Tragend ist allein die **bewusste** Neuvergabe bzw. der Import (Falle 28).
17. **„Zweimal den Bindestrich vergessen und zweimal vertippt löst die Sperre aus."** Falsch: der
    Bucket erlaubt 5 und blockt den 6. (`rateLimit.ts:4-5`); vier Versuche sperren nicht. Schärfer ist
    der **geteilte** Eimer hinter NAT/CGNAT und der Verbrauch **vor** der Codeprüfung (Falle 24).
18. **„Das Rate-Limit-Verhalten ist heute ungetestet, deshalb fällt die Umkehrung nicht auf."**
    Widerlegt: `src/lib/auth/rateLimit.test.ts:33-38` testet genau den Spoofing-Fall („ignoriert vom
    Client gespoofte linke Einträge"). Ungesichert ist allein das **Löschen** dieses Tests zusammen
    mit dem modul-eigenen Limiter. Ebenfalls zu scharf: „dreht still die Anti-Spoofing-Entscheidung um"
    — `core/ratelimit.ts:52-55` schreibt die Gegenabwägung in Prosa aus, es ist eine dokumentierte
    andere Entscheidung für eine andere Vorschaltung.
19. **„`feedback` hat mit dem Layout-Riegel schon einmal ein Leck ausgeliefert."** Zu stark:
    `requireFeedbackAccess.ts:17-23` beschreibt, dass die Druckansicht ein Layout ohne Shell braucht und
    damit **aus dem Schutz** des `(admin)`-Layouts herausfiele — die Quelle belegt die strukturelle
    Exposition als Motiv für den Umbau, nicht einen Produktionsvorfall. Als Warnung trägt es
    unverändert; als Behauptung über einen Vorfall nicht.
20. **„Alle 40 exportierten Actions in `src/actions/` rufen `requireAdmin`/`requireHelfer`, einzige
    Ausnahme ist `redeemToken`."** Zählung und Ausnahme falsch: es sind **44** Actions in 16 Modulen
    mit `"use server"`, und alle 44 sind geschützt. `redeemToken` ist gar keine Server Action —
    `src/actions/token-redeem.ts` und `src/actions/session.ts` tragen kein `"use server"`. Die einzigen
    ungeschützten Actions liegen **außerhalb** von `src/actions/`
    (`(gate)/actions.ts:12`, `helfer/actions.ts:6`) — also genau dort, wo eine Checkliste nach dem
    Wortlaut des Rohbefunds nicht hinsähe.
21. **„Alle 13 Playwright-Specs hängen am Demo-Login-Knopf."** Zwölf: `e2e/gate.spec.ts:3-18` meldet
    sich überhaupt nicht an — und es ist genau die Spec, die den Port am ehesten unverändert übersteht.
    Zusätzlich vermischt der Rohbefund zwei Einstiege: `e2e/helfer-flow.spec.ts:5-8` ist der
    Gate-Code-Weg, Demo-Login kommt dort erst ab `:22` dazu. Und der `returnTo`-Test wird **rot**, nicht
    gegenstandslos: `verwaltung.spec.ts:14` behauptet eine literale URL, auf die nach dem Port kein Weg
    mehr führt.
22. **„`reactCompiler: true` übersetzt den Barcode-Scanner zum ersten Mal, und ein Bail-out ist still."**
    Prämisse trifft nicht zu: in `BarcodeScanner.tsx` gibt es keine einzige Ref-Mutation während des
    Renderns — alle drei Refs werden in Callbacks und Effekten geschrieben. Die Wirkrichtung ist
    außerdem umgekehrt: Auto-Memoisierung **stabilisiert** die Inline-Arrow-Props der beiden Aufrufer
    und verhindert, dass der Kamera-Effekt bei jedem Render neu läuft.
23. **„Die Verwaltungsnavigation muss in eine 64px-Kopfzeile mit 15 Einträgen; Auswege sind
    Icons-ohne-Text, Überlaufmenü oder eine zweite Ebene."** Zielseite falsch beschrieben: die
    Modulnavigation liegt **nicht** in der Kopfzeile, sondern als zweite Zeile darunter
    (`shell.module.css:106-112`, dort ist der 904px-Fehler bereits behoben); „Icons ohne Text" ist
    verbaut, weil `SuiteNavItem` bewusst **kein** `icon`-Feld hat (`types.ts:21-25`); und die „zweite
    Ebene" **ist** `.modulnav`, einen dritten Streifen gibt es nicht. Was übrig bleibt, ist schärfer
    und konkret: `.modulnav` ist `flex` **ohne** `flex-wrap` und **ohne** `overflow-x` — 15 Einträge
    lassen bei 1280px die Seite waagerecht scrollen (Falle 42).
24. **„`.verfallfeld .input{font-size:13px}` (0,2,0) schlägt die Suite-Untergrenze (0,0,1) regulär und
    still."** Widerlegt: `core/theme/feldschrift.test.ts:114-141` urteilt **nicht** über Spezifität,
    sondern scannt den Selektortext — `.verfallfeld .input` matcht, 13 < 16, Verstoß gefangen. Was der
    Scan **nicht** sieht, ist etwas anderes und schlimmer: `.input` und `.combo-input` benutzen die
    **font-Kurzschreibweise** und passieren bei 14px, `.stepper.sm .stepval` nennt kein Eingabeelement
    im Selektor und passiert bei 15px (Falle 39).
25. **„Die Plakette steht in `ArtikelDrawer.tsx:323` und `ArtikelTable.tsx:231` teils allein in ihrer
    Zelle."** Widerlegt: an allen **vier** Verwendungsstellen steht ein Textchip daneben
    (`ArtikelDrawer.tsx:327`, `ArtikelTable.tsx:240` via `StatusChips:80-82`, `VerfallItem.tsx:21`,
    `HelferEntnahme.tsx:65` — die vierte Stelle nennt der Rohbefund gar nicht). Der Verstoß liegt im
    **Zusicherungsvertrag der Komponente**, nicht in den heutigen Bildschirmen. Die nicht-monotone
    Luminanz stimmt.
26. **„`.toast` und `.scanwrap` sind harte Hell-Annahmen, die den Dunkelmodus kosten."** Beide sind
    **tot** (kein Vorkommen in irgendeiner `.tsx`) und stehen im selben Dokument bereits als
    Mockup-Rest. Der dunkle Scanner-Grund kommt aus einem **Inline-Style** (`BarcodeScanner.tsx:113`),
    den kein CSS-Scan findet. Ebenfalls falsch: `.scanline` (`globals.css:158`) ist **nicht** tot —
    `BarcodeScanner.tsx:120` rendert sie, und an ihr hängt der `prefers-reduced-motion`-Zweig.
27. **„antd-Portale (Modal/Drawer) rendern außerhalb des Bogens und verunreinigen den Druck."**
    Widerlegt: antd-Portale rendern als Kinder von `document.body` und werden von
    `body * { visibility: hidden }` (`globals.css:277`) mit erfasst. Ebenfalls widerlegt: „jede
    `transform`/`filter`/`contain` auf einem antd-Vorfahren macht ihn zum Bezugsrahmen und verschiebt
    den Bogen" — in `antd/es/layout/style/index.js` kommt keine dieser Eigenschaften vor. Der harte
    Befund ist ein anderer: `body *` ist per CSS-Modul **nicht kapselbar** (Falle 43).
28. **„Für den maßgenauen Etikettendruck ist die eigene Route-Gruppe der sicherere Weg."** Zu
    einfach: `files` hat genau diesen Weg **bereut** und schreibt in
    `_ui/zugangslinks.module.css:11-16` aus, warum — bei `feedback` fiel die Druckansicht als eigene
    Route mit eigenem Layout aus dem Zugriffsriegel heraus. Wer die Route-Gruppe empfiehlt, muss den
    Vorfall mitnennen (Entscheidung 20).
29. **„Der Ersatz der Combobox durch `Select` sprengt an 16 Stellen die Eingabezeile."** Zwei:
    `.addrow` kommt dreimal vor (`SollEditor.tsx:74`, `TemplatePosEditor.tsx:55`,
    `BarcodeScanner.tsx:144`), und nur die ersten beiden enthalten eine Combobox. Die übrigen 14
    stehen in gestapelten Formularfeldern, wo mehr Höhe senkrechten Platz kostet, aber keine Zeile
    umbricht. Auch die Höhe war ungenau: die Combobox ist ~43px, antds 56 sind +30 %, nicht +40 %.
30. **„`SUITE_HOST_LAGERBUCH`, `DATA_DIR` und `AUTH_COOKIE_DOMAIN` sind für den E2E-Lauf zusätzlich zu
    setzen."** Praktisch null: `registry.ts:141-148` löst `lagerbuch.localtest.me` ohne jede
    Env-Variable auf (das ist bei `files` nur anders, weil dort **zwei** Hosts nötig sind), und
    `DATA_DIR=./.data/e2e` sowie `AUTH_COOKIE_DOMAIN=.localtest.me` stehen bereits in
    `iuk-suite/playwright.config.ts:103-104`.
31. **„`parseConfig(process.env)` wirft schon beim Import des Moduls und ist damit eine
    Boot-Abbruchquelle."** Praktisch nie: jedes Feld des Schemas hat einen `.default()`
    (`config.ts:30-47`), ein leeres env parst durch (gegen zod 3.25.76 und 4.4.3 ausgeführt: `ok=true`).
    Werfen kann es nur bei einem malformen Wert oder im `superRefine`-Fall. Die realistische
    Abbruchquelle in der Suite ist die Migration (Falle 50). Ebenso ungenau: `assertProductionSecrets`
    wirft nicht „bei fehlendem Geheimnis", sondern wenn es fehlt **oder** auf dem Dev-Default steht,
    und nur bei `nodeEnv === "production"`.
32. **„lagerbuch führt drei Icon-PNGs in `public/`, die den Umzug problemlos überleben, während die
    Dateikonventionen brechen."** Genau umgekehrt: die drei PNGs in `public/` werden auf dem
    lagerbuch-Host nach `/m/lagerbuch/...` umgeschrieben und laufen ins 404, während sie auf jedem
    anderen Host an der Wurzel ausgeliefert werden; die Dateikonventionen (`icon.svg`, `apple-icon.png`)
    folgen dem Routing und wandern mit — mit der Ausnahme `favicon.ico`, das doppelt unerreichbar ist.
    Und `start_url: "/"` ist **richtig**, nicht falsch (Falle 56).
33. **„`/api/health` wird nach dem Cutover schlechter, weil die Suite ohne DB-Zugriff antwortet."**
    Halb: auch lagerbuchs eigener Endpunkt (`src/app/api/health/route.ts:5-6`) berührt keine Datenbank.
    Verloren geht **Zielgenauigkeit**, nicht Tiefe — und `/api/health/lagerbuch` wäre besser als alles,
    was lagerbuch heute hat (Falle 51).
34. **„`scripts/backup.sh` halbiert die Aufbewahrung von 14 Tagen auf 7."** Ungenau: `KEEP` (`:13`)
    zählt **Tarball-Generationen**, nicht Tage, und ist über `BACKUP_KEEP` überschreibbar. Die
    Halbierung gilt nur, wenn der Host-Cron genau täglich läuft — der Takt steht nirgends im Repo
    (Betreiberfrage 20). Ebenfalls übertrieben: „`/data/backups` ist die einzige Rückfallebene" — das
    Runbook-Muster verlangt ohnehin einen frischen Quell-Snapshot vor dem Import und die Archivierung
    des Alt-Volumes. Einzig beiträgt das Verzeichnis **historische Tiefe** (bis zu 14 Tage
    Vor-Cutover-Stände).
35. **„lagerbuchs Zählungen: 907 `className`, ~60 Klassen, 3.017 routen-lokale Zeilen, 45 Icons, 84
    Statuschips, 18 KPI-Kacheln, 49 `.btn.slim`, 197 `useState` in 48 Dateien, 12 klassengekoppelte
    E2E-Zusicherungen, 17 Tabellen."** Nachgezählt sind es: **915** `className`, **~140**
    Klassen-Tokens, **3.371** Zeilen, **46** Icons, **80** Statuschips (27/12/15/26), **21**
    KPI-Kacheln, **54** `.btn.slim`, **160** `useState`-Aufrufe in **37** Dateien (die 197 enthielten
    die Import-Zeilen, die 48 sind die Dateien mit `"use client"`), **28** klassengekoppelte
    E2E-Selektor-Verwendungen (die sechs `.card.journal .row`/`.row`-Fälle fehlten, dazu vier
    übersehene Klassen — `tr.click`, `div.grid2 input.input`, `table.tbl tbody tr`, `a.row`;
    Falle 48) und **16** Tabellen.

**Belegfehler, die die Gegenprüfung korrigiert hat** (die Sachaussagen stimmten, die Zeilenangaben
zeigten ins Leere): `src/db/etiketten.ts:19`/`:23` statt `:20`/`:24` · `src/actions/loeschen.ts:183`
(Artikel-Zweig von `deaktiviereElement`) statt `:185` (Token-Zweig) ·
`iuk-suite/src/core/bootstrap.ts:63-65` (`shouldSeed`) statt `:71-73`, `:80-84` (`seedAllModules`)
statt `:82-86`, `:54-60` (Migrationsschleife) statt `:56-62` ·
`iuk-suite/src/core/db/index.ts` statt `core/db.ts` ·
`core/theme/theme.ts:22-25`/`:33`/`:42-43` statt `:23-26`/`:29-30`/`:41,44` ·
`core/theme/tokens.ts:14-25`/`:33` statt `:16-29`/(unbelegt) ·
`core/shell/FullShell.tsx:19-22` statt `:19-24` · `deployment.md:60-64` statt `:59-64` ·
`src/lib/config.ts:73` (`tz`) statt `:72` · `e2e/etiketten.spec.ts:11`/`:16` statt `:12-14`/`:16-18` ·
`src/app/layout.tsx:6-24` statt `:5-24` · `src/db/bestand.ts:13-20` statt `:15-34` ·
`src/db/queries.ts:105-109` statt `:109` · `src/lib/auth/tokenZiel.ts:10` statt `:11` ·
`src/actions/tokens.ts:15` (Bindestrich-Formatierung) statt `:17` ·
`Combobox.tsx:37-40`/`:76-91` statt `:34-42`/`:77-91` · `src/middleware.ts:35` statt `:34-36` ·
`iuk-suite/src/proxy.ts:103` (`matcher`) statt `:105` — `export const config` steht auf `:102` ·
`iuk-suite/src/core/registry.ts:155` (Frühausstieg von `canAccess`) statt `:154` ·
`e2e/check.spec.ts:23` (`getByLabel(/^Verfall /)`) statt `:25` · `e2e/check.spec.ts:30-31` (der
Hinweis auf „Gelegt & abschließen" steht im Kommentar, geklickt wird `/abschließen/i`) statt `:35` ·
`e2e/bestand-export.spec.ts:18` (Dateinamens-Regex) statt `:24` — `:24` ist die `PK`-Behauptung ·
`e2e/suche-filter.spec.ts:30` (`toHaveURL(/[?&]q=Verband/)`) statt `:33`, das die schließende Zeile
ist · `.github/workflows/ci.yaml:87-88` (Build-Arg `NEXT_DEPLOYMENT_ID`) statt `:78-80`, das der
Tag-Block ist · `.github/workflows/ci.yaml:64`/`:83` (QEMU und Plattformliste) statt `:69`/`:72` ·
`.github/workflows/ci.yaml:24`/`:38` (`node-version: 24`) statt `:23`/`:37`, das die
`setup-node`-Zeilen sind · `src/lib/bestand-export.ts:34-38` (alle drei Status-Literale) statt
`:20-36` — das `return "ok"` (`:37`) fällt sonst heraus ·
`src/app/verwaltung/kein-zugriff/page.tsx:9-11` (der tragende Satz) statt `:1-18`; die Datei hat 17
Zeilen. `src/app/verwaltung/(admin)/` enthält **24** `page.tsx`, nicht 26.

**Drei Belege der Vollständigkeitskritik zeigten nicht auf die falsche Zeile, sondern auf die falsche
Datei** — die Sachaussagen stimmten trotzdem, weshalb sie in Kapitel 4 eingearbeitet sind:
`BestellListe.tsx` liegt unter `src/app/verwaltung/(admin)/bestellung/`, ein
`src/components/BestellListe.tsx` **existiert nicht** (die Zeilenangaben `:8`, `:24-27`, `:28-35`
stimmen dagegen exakt). Die neun deutschen Excel-Spaltenköpfe stehen in
`src/app/verwaltung/(admin)/artikel/ArtikelTable.tsx:89-99` (`EXCEL_SPALTEN`), nicht in
`src/lib/bestand-export.ts:20-36`; dort stehen die **Feldnamen des Typs** (`:21-31`), die den
Überschriften nur ähneln und nie in eine Datei geschrieben werden — das Typfeld heißt `charge`, die
Spalte im Blatt heißt `Nächste Charge`. Und das Nachladen der Excel-Bibliothek belegt
`ArtikelTable.tsx:132` (`await import("write-excel-file/browser")`), nicht `bestand-export.ts:3-7` —
das ist der Kommentar, der das Nachladen **beschreibt**, nicht der Code, der es tut. Der Unterschied
ist hier kein Formalismus: er verschiebt die Ausgabe-Überschriften aus dem testbaren reinen Modul in
eine Client-Komponente, und genau daran hängt die Client-Insel-Frage in Abschnitt 4.2.

**Zur Vorsicht bei `KONSOLIDIERUNG-PROGRESS.md`:** die Datei wächst laufend, ihre Zeilennummern sind
nur mit Ankertext belastbar. Alle Verweise dorthin in diesem Dokument nennen deshalb Abschnittsnamen,
keine Zeilen.

---

## Nicht als Quelle verwenden

**`lagerbuch/implementierungsplan.md`** beschreibt die **Absicht** vom 10.07.2026 und ist an fünf
Punkten überholt; wo er widerspricht, gilt der Code:

- `:120` listet drei Buchungstypen — `umlagerung` fehlt und ist tragend (1:1-Pflicht 15).
- `:75`/`:202` spezifizieren `BESTELL_FAKTOR × Mindestbestand − Bestand`; der Code rechnet die reine
  Lücke, mit ausgeschriebener Gegenbegründung (Falle 4).
- `:51` legt den Sitzungsinhalt auf `{tokenId, scopeLagerortId, exp}` fest; gebaut wurde
  `{tokenId, code, label}` (Abschnitt 2.4).
- `:89-166` zeigt ein gekürztes Schema mit acht Tabellen; es sind 16, und `lagerort_verfall`,
  `fahrzeug_templates`, `template_positionen`, `geraete`, `bz_*` und `o2_*` fehlen dort ganz.
- `:242` nennt `node:26-slim` — das ist **weder die Alt-Basis noch ein Hinweis auf die Suite**. Der
  gebaute Alt-Container fährt `node:24-slim` (`Dockerfile:2` und `:14`), passend zu `mise.toml:2`
  (`node = "24"`) und `.github/workflows/ci.yaml:24`/`:38` (`node-version: 24`); der Plan hat seine
  eigene Basis-Zeile also nie eingelöst — auch nicht im Snippet darunter (`:246`, `:254`). Von der
  Aussage stimmt nur die zweite Hälfte: die Suite fährt `node:26-alpine`
  (`iuk-suite/Dockerfile:2`, `:14`, `:23`) und damit musl statt glibc. **Die Begründung, die `:242`
  mitliefert** — „better-sqlite3 liefert Prebuilds für linux-arm64/glibc, unter musl müsste
  kompiliert werden" — **ist nicht überholt, sondern gemessen erledigt** (siehe den entlastenden
  Befund zu better-sqlite3 auf musl in Abschnitt 5). Belastbar bleibt an der Stelle nur `:4`:
  Zielumgebung ARM64.

Was der Plan dagegen **besser** belegt als der Code: die Begründungen. `:87` (Bestand ist nie eine
Spalte), `:181` (die vier Kompensationen für Klartext-Codes), `:54` (Deep-Links statt In-App-Scanner,
„jede native Kamera-App genügt"), `:236` (das Etikettenraster) und §6 (der Sperr-Mechanismus als
Spezifikation, nicht als Fußnote).

**`lagerbuch/deployment.md`** widerspricht dem Code an einer Stelle direkt: `:120-125` behauptet, es
gebe keine automatischen Backups, `src/instrumentation.ts:11-18` startet den Job. Wer die Betriebsseite
aus dem Runbook rekonstruiert, portiert ihn nicht mit.

**`lagerbuch-klickdummy-v2.jsx` / `mockup.jsx`** ist die Herkunft der Halbpixel-Schriftgrößen, der
zwölf Farben und rund 16 toter CSS-Zeilen. Als Quelle für die Oberfläche taugt es nicht mehr — die
Anwendung ist daran vorbeigewachsen.

**`KONSOLIDIERUNG-PROGRESS.md`, Phase 5, erste Zeile** nennt „17 Tabellen" und `main @ 2361f40`;
beides ist nachgezählt bzw. nachgeprüft anders — es sind **16** Tabellen, und der Freeze gilt seit der
Betreiberzusage vom 03.08.2026 ab **`ca04eb1`** (Belegbasis). Dort mitzuziehen sind außerdem die
Kennzahlen dieses Dokuments (Phase-5-Abschnitt): 37 Entscheidungen · 28 1:1-Pflichten · 66 Fallen ·
47 Betreiberfragen.




