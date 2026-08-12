# T176a1 — Fehlerzustand 27 nachgebaut: „`checks.ergebnis` unlesbar"

**Auftrag:** Nachzügler zu T176a, Fund F-2. §11.5 Zustand 27 verlangt einen Anzeigezustand, den es im
Modul nicht gab: `parseCheckErgebnis` beantwortete **jeden** Lesefehler mit `leer()` — ohne
Diskriminator. „Kaputtes JSON" war damit von „legitim leerem V2-Ergebnis" nicht unterscheidbar, und
`/verwaltung/checks/[id]` zeigte für einen zerstörten Datensatz „0 Positionen": genau das, was
`:10332` ausschließt.

**Vorgehen:** TDD, Schicht für Schicht, je Schicht erst rot, dann grün. Drei Commits.

---

## 1. Die Abgrenzung bei `ergebnis IS NULL` — Rückfrage gestellt, vom Lead entschieden

**Festlegung 1** lautete zunächst: „unlesbar heißt jeder Lesefehler, den `parseCheckErgebnis` heute
mit `leer()` beantwortet — lies die drei Rückgabestellen und nimm genau die."

Eine der drei Stellen hält das nicht aus. **Vor** dem Bau an den Lead gemeldet, **vom Lead
entschieden**: Variante B ist richtig, die ursprüngliche Formulierung war zu grob — maßgeblich ist
die Spec (§4.4 sieht `completed_at IS NULL` ausdrücklich vor), nicht die Zusammenfassung. Gebaut ist
genau das.

| Rückgabestelle (Stand vor dem Umbau) | Bedeutung | unlesbar? |
|---|---|---|
| `:149` `if (!roh)` mit `roh === null` | `checks.ergebnis IS NULL` — **noch kein Ergebnis geschrieben** | **nein** |
| `:149` `if (!roh)` mit `roh === ""` | ein geschriebener Wert, der nichts trägt | ja |
| `:154` `catch` | kein JSON | ja |
| `:161` `daten === null \|\| typeof daten !== "object"` | JSON in falscher Form (Skalar, `null`) | ja |

**Warum `null` nicht mitzählt:** `checks.ergebnis` ist nullable (`_db/schema.ts:232`), und ein
**offener** Check hat planmäßig keins. `_lib/seedLokal.ts:523-526` legt genau diese Bauform an
(`completedAt: null, ergebnis: null`, Kommentar `:505-507`: „Offene Checks erzeugt `check.ts` heute
nie, das Schema sieht die Bauform aber ausdrücklich vor (`completed_at IS NULL`, §4.4)").
Nähme man die Zeile wörtlich mit, meldete `/verwaltung/checks/<CHECK_KTW>` nach jedem lokalen Seed
„Ergebnis unlesbar" für einen Check, an dem schlicht noch niemand fertig war — **eine zweite Lüge
statt keiner**, und der Zustand „Check läuft noch" ist nicht Gegenstand von §11.5 Zustand 27.

Die Abgrenzung `null` gegen `""` steht als Kommentar in `checkErgebnis.ts` bei `unlesbar()` und wird
von je einem Test auf **beiden** betroffenen Schichten festgehalten.

**Nebenbefund (Bestand, nicht von mir geändert):** Die Alt-Anwendung las `null` als
`JSON.parse(c.ergebnis ?? "[]")` → V1 → `altFormat`. Heute wird daraus ein leeres V2 ohne
`altFormat`. Das war schon vorher so und bleibt so; es fällt nur bei dieser Arbeit auf.

---

## 2. Die Schichten

Der Weg ist `parseCheckErgebnis` → `summiereCheckErgebnis` (`CheckSummen`) → `checkDetail` /
`checkHistorie` → die beiden Seiten.

⚠️ **Hier stand zunächst das Gegenteil, und die Begründung hat sich mit der Lage gedreht.** In der
ersten Runde lief `unlesbar` bewusst **nicht** über `CheckSummen`: es gab genau **einen** Leser (die
Detailseite), `checkDetail` parst ohnehin selbst, und ein Feld, das niemand liest, ist die nächste
Halbwahrheit. Mit Minor 2 (Abschnitt 10) bekam die **Übersicht** einen Anzeigezustand — jetzt lesen
es **beide** Leser (§5.8.3), und eine zweite Herleitung derselben Wahrheit über dasselbe JSON wäre
schlimmer als das Feld. Seit `407075e` trägt `CheckSummen` es deshalb, und `checkDetail` bezieht es
aus `summe` wie `altFormat` in der Zeile daneben. Preis: drei `toEqual`-Fixtures in
`domain/check.test.ts` mussten mit — sie sind Teil der TDD-Belege in Abschnitt 10, nicht
Kollateralschaden.

### Schicht 1 — Parser (Commit `a4cb945`)

`src/app/m/lagerbuch/_lib/checkErgebnis.ts`

* `CheckErgebnisV2.unlesbar?: true` (`:96-118`) — **additiv und optional**, `undefined` ist der
  Vorgabewert „lesbar". Nur `true`, nie `false`: ein geschriebenes `unlesbar: false` stünde in jedem
  guten Ergebnis und machte aus dem Ausnahmefall ein Regelfeld.
* neue Hilfsfunktion `unlesbar()` (`:159-173`) neben `leer()`, mit der `null`/`""`-Abgrenzung im
  Kommentar.
* `parseCheckErgebnis` (`:191-197`, `:204`): `roh === null` → `leer()`, `roh === ""` → `unlesbar()`,
  `catch` → `unlesbar()`, Nicht-Objekt → `unlesbar()`.
* Doc-Kommentar von `LEERES_ERGEBNIS` (`:100-107`) berichtigt — es ist nicht mehr „der Wert jedes
  Lesefehlers".

**Signatur unverändert**, keine Aufrufstelle angefasst (`_actions/loeschen.ts:181`,
`domain/check.ts:83`, `lesepfade/checks.ts:118`, `seedLokal.test.ts:258` — alle unberührt).

### Schicht 2 — Leser (Commit `748e63c`)

`src/app/m/lagerbuch/_lib/lesepfade/checks.ts`

* `CheckDetail.unlesbar: boolean` (`:105-116`), **erforderlich**, direkt neben `altFormat` — zwei
  Felder, weil es zwei Ursachen sind.
* Belegt in `checkDetail` (`:238-241`): zunächst `e.version === 2 && e.unlesbar === true` —
  **seit `407075e` `summe.unlesbar`**, aus derselben Quelle wie `altFormat` daneben (Abschnitt 2,
  Kasten). V1 kann nie unlesbar sein — ein Array **ist** lesbar, es trägt nur weniger.

Einzige Folge der Erforderlichkeit: das Fixture `BASIS` in `page.test.tsx:31` bekommt
`unlesbar: false`. Danach beweisen die ~12 bestehenden Seitentests mit, dass ein normaler Check
**keine** Meldung bekommt.

### Schicht 3 — Anzeige (Commit `5b90e9f`)

`src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/page.tsx`

* `Alert type="warning" showIcon={false}` (`:129-156`) mit Titel
  **„Ergebnis unlesbar: Dieser Check trägt ein beschädigtes Ergebnis. Die Listen und Summen unten
  sind deshalb leer — das heißt nicht, dass nichts zu tun war."**
* **Nie `type="error"`** (§6.6.5, `CLAUDE.md` Falle 3) — ein Test schließt `"error"` ausdrücklich aus.
* **Kein Icon**, kein Compound-Zugriff, kein neuer Import: `Alert` ist in derselben Datei bereits für
  `altFormat` im Einsatz (Fallen 1 und 7 der `CLAUDE.md`).
* Die **Leertexte** der Tabellen gehören zur Meldung: „Keine Einzelposition erfasst." ist eine
  Tatsachenbehauptung, die bei unlesbarem `ergebnis` niemand prüfen konnte — sonst widerspricht die
  Tabelle der Warnung über ihr. **Eine kleine bewusste Erweiterung über den Wortlaut von Festlegung 4
  hinaus**, mit demselben Muster aus Meldung + Leertext, das `altFormat` schon hat; keine zweite
  Warnklasse (derselbe Zustand, dieselbe Seite, kein zweites Signal). Zunächst nur `nachfuellLeertext`
  als dritter Ternär-Zweig — **seit `407075e` alle fünf Tabellen über ein Prop `unlesbarLeertext`**,
  und der Ternär ist wieder zweizweigig (Review-Minor 3, Abschnitt 10).

---

## 3. TDD-Belege je Schicht

### Schicht 1

`rtk pnpm vitest run src/app/m/lagerbuch/_lib/checkErgebnis.test.ts` **vor** der Implementierung
(neuer `describe`-Block „unlesbar ist von legitim leer unterscheidbar (§11.5, 27)", **8** Tests —
der Bericht nannte hier zunächst 7, Review-Minor 4; die rote Ausgabe unten war schon immer mit 8
konsistent, der Fehler lag in der Zusammenfassung, nicht in der Messung):

```
 FAIL … > kaputtes JSON ist unlesbar
 FAIL … > ein leerer String ist unlesbar — ein geschriebener Wert, der nichts traegt
 FAIL … > ein Skalar statt Objekt oder Array ist unlesbar — JSON in falscher Form
AssertionError: expected undefined to be true // Object.is equality
 Test Files  1 failed (1)
      Tests  3 failed | 20 passed (23)
```

**Warum der Fehlschlag der erwartete war:** genau die drei Zusicherungen „ist unlesbar" schlagen fehl
(`e.unlesbar` ist `undefined`, das Feld existiert nicht); die vier Zusicherungen „ist **nicht**
unlesbar" sind schon grün — sie müssen es sein, weil ein fehlendes Feld auch falsy ist. Rot genau
dort, wo der neue Zustand fehlt, und nirgends sonst.

Nach der Implementierung schlugen zusätzlich **die drei alten Zusicherungen** um, die das alte
Verhalten festschrieben:

```
 FAIL … > jeder Lesefehler wird ein LEERES V2 > ein Skalar statt Objekt oder Array
AssertionError: expected { version: 2, positionen: [], …(5) } to deeply equal { … (4) }
+   "unlesbar": true,
      Tests  3 failed | 20 passed (23)
```

Betroffen: „kaputtes JSON", „leerer String", „ein Skalar" — **nicht** „null". Dass die
`null`-Zusicherung unverändert grün blieb, ist der Beleg für die Abgrenzung aus Abschnitt 1. Die drei
wurden auf `{ ...LEERES_ERGEBNIS, unlesbar: true }` gezogen (Zusicherungsstärke unverändert:
weiterhin `toEqual` auf die ganze Struktur).

Grün: `Test Files 1 passed (1) · Tests 23 passed (23)`.

### Schicht 2

`rtk pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/checks.test.ts` **vor** der Implementierung
(neuer `describe`-Block „ein UNLESBARES ergebnis (§11.5, 27)", 6 Tests):

```
AssertionError: expected undefined to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  6 failed | 18 passed (24)
```

**Warum erwartet:** `CheckDetail` trug das Feld nicht — alle sechs, auch die „meldet NICHT"-Fälle,
lesen `undefined`. Ein Feld, das es nicht gibt, kann weder melden noch schweigen; genau das ist der
Befund F-2 eine Schicht höher.

Grün: `Tests 24 passed (24)`. Danach `typecheck` mit **einem** erwarteten Fehler
(`page.test.tsx(16,7): TS2741: Property 'unlesbar' is missing`) — der einzige Preis der
erforderlichen Feldform; Fixture ergänzt, dann `No errors found`.

### Schicht 3

`rtk pnpm vitest run '…/checks/[id]/page.test.tsx'` **vor** der Implementierung (3 neue Tests):

```
 FAIL … > kennzeichnet ein unlesbares Ergebnis, statt 0 Positionen zu behaupten
AssertionError: expected [] to have a length of 1 but got +0
 FAIL … > haelt Altformat und unlesbar auseinander — je eine Meldung, nie beide
TypeError: Cannot read properties of undefined (reading 'props')
      Tests  2 failed | 11 passed (13)
```

**Warum erwartet:** die Seite rendert für `unlesbar: true` **null** Alerts. Der dritte neue Test
(„meldet NICHTS fuer einen lesbaren Check mit 0 Positionen") war von Anfang an grün und **musste** es
sein — er ist die Gegenprobe, die auch nach der Implementierung grün bleiben muss.

Grün: `Tests 13 passed (13)`.

**Ein Fund beim Grünmachen:** der erste Implementierungsversuch machte einen **bestehenden** Test rot
— „verriegelt die directive-freie RSC-Seite gegen direkte antd-Table-Importe" scannt den **Quelltext**
der Seite gegen `/@ant-design\/icons|Table\.Column|Card\.Meta/`, und mein Erklärkommentar nannte den
Paketnamen wörtlich. Der Riegel funktioniert also auch gegen Kommentare; Kommentar umformuliert. Das
ist der Grund, warum vor jedem Commit die ganze Datei läuft.

---

## 4. Wie „unlesbar" von „legitim leer" und von `altFormat" getrennt ist

| Eingabe | `version` | `unlesbar` | `altFormat` | Anzeige |
|---|---|---|---|---|
| `"{kaputt"` | 2 | **true** | false | Alert „Ergebnis unlesbar" |
| `'"text"'`, `"5"`, `"true"`, `"null"` | 2 | **true** | false | dito |
| `""` | 2 | **true** | false | dito |
| `'{"version":2,"positionen":[],…}'` | 2 | false | false | **keine Meldung** |
| `null` (offener Check) | 2 | false | false | **keine Meldung** |
| `"[]"`, `'[{"fehlt":3}]'` | 1 | – (Feld existiert nicht) | **true** | Alert „altes Format" (unverändert) |
| gefülltes V2 | 2 | false | false | keine Meldung |

Festgehalten von:

* **Parser:** `checkErgebnis.test.ts` — „ein legitim LEERES V2-Ergebnis ist NICHT unlesbar",
  „`null` ist NICHT unlesbar — ein offener Check hat noch kein Ergebnis", „V1 bleibt V1 — `altFormat`
  ist eine ANDERE Ursache und wird nicht eingemeindet" (letzterer prüft
  `expect(e).not.toHaveProperty("unlesbar")`), sowie „ein Objekt mit Müll in den Listen ist NICHT
  unlesbar — die Form stimmt" (keine zweite Warnklasse).
* **Leser:** `lesepfade/checks.test.ts` — sechs Fälle, darunter „meldet NICHT unlesbar für einen
  legitim leeren Check", „… für einen OFFENEN Check ohne ergebnis", „… für das ALTE Format — das hat
  sein eigenes Signal".
* **Anzeige:** `page.test.tsx` — „meldet NICHTS fuer einen lesbaren Check mit 0 Positionen"
  (0 Alerts) und „haelt Altformat und unlesbar auseinander — je eine Meldung, nie beide" (die beiden
  Titel sind verschieden, keiner enthält das Stichwort des anderen).

⚠️ **Wo die `null`-Entscheidung wirklich hängt.** Erzwungen wird sie **am Parser**
(`toEqual(LEERES_ERGEBNIS)` — die Struktur darf die Zusatz-Eigenschaft nicht tragen); am Leser wird
sie nur **beobachtet**. Denn `unlesbar: e.version === 2 && e.unlesbar === true` liefert für `null`
auch dann `false`, wenn das Feld nie gesetzt würde — der Test „meldet NICHT unlesbar für einen
OFFENEN Check" unterscheidet also nicht zwischen „Ausnahme greift" und „greift zufällig". Er ist
Regressionsschutz, nicht der Beleg. Der Beleg ist die Parser-Zusicherung.

`altFormat` selbst ist **unverändert**: gleicher Text, gleicher Alert, gleicher Leertext, gleiche
Herkunft (`summe.altFormat`). Kein Test dazu wurde angefasst.

---

## 4a. Schicht 4 — der echte Render (Commit `443ddb0`, auf Anforderung des Leads)

Vitest beweist auf dieser Seite die **Auswahl** des Zustands, nicht die **Auslieferung**: sie ist
eine Server Component ohne Insel, und `build`, `typecheck` und Vitest sehen die Fehler, die sie
umbringen, strukturell nicht (`CLAUDE.md` Fallen 1/6/7 — HTTP 500 schon beim Import). Der Lead hat
deshalb einen echten Render **in beiden Fällen** verlangt. Gewählt: der **dauerhafte** Weg, weil die
Deckung bleibt und kein Seed-Umbau nötig war (beide Änderungen sind rein additiv in vorhandenen
Dateien; **keine** neue Datei unter `e2e/`, T172-Abzählung unberührt — `_actions/guards.test.ts`
grün, 12 Tests).

**`e2e/seed-lagerbuch.ts`** (`checkFixtures`), zwei neue Zeilen in `checks`:

| ID | `ergebnis` | erwartet |
|---|---|---|
| `e2e-check-unlesbar` | `"{das ist kein json"` | Meldung |
| `e2e-check-lesbar` | gültiges V2 mit einer Position | **keine** Meldung |

Beide hängen am **vorhandenen** `e2e-fahrzeug`: ein zusätzliches Fahrzeug erschiene in der
Flottenliste und im Helfer-Wähler und veränderte fremde Zusicherungen; eine Check-Zeile tut das
nicht. `completedAt` liegt in der Vergangenheit, damit `lagerbuch-helfer.spec.ts:396`
(`order by completed_at desc, id desc limit 1`) weiterhin seine **eigene** neue Zeile als jüngste
sieht.

**`e2e/lagerbuch-verwaltung.spec.ts`**, zwei ergänzte Zusicherungen (Teil-5-Eigentum, additiv):

* unlesbar → `status() === 200`, kein `server-side exception`, **genau eine** `.ant-alert` mit
  „Ergebnis unlesbar", Klasse `ant-alert-warning` und **nicht** `ant-alert-error`. Die Klasse ist der
  einzige Beleg, der die **gerenderte** Fassung prüft statt des Props (§6.6.5).
* lesbar → `status() === 200`, Inhalt sichtbar, **0 ×** „Ergebnis unlesbar".

**Nicht-Vakuität gemessen, nicht behauptet — und zwar für die Anzeigekopplung.** Mit abgeschaltetem
`check.unlesbar` (Bedingung temporär auf `false`):

```
    Expect "toHaveCount" with timeout 5000ms
      - waiting for locator('.ant-alert').filter({ hasText: 'Ergebnis unlesbar' })
        14 × locator resolved to 0 elements
  1 failed
    … › ein unlesbares ergebnis wird benannt — als Warnung, nie als Fehler
  1 passed (17.2s)
```

Genau der eine Test fällt, die Gegenprobe bleibt grün (die Seite liefert also auch ohne die Meldung
mit 200 aus — der Fehlschlag ist die fehlende Meldung, kein RSC-Ausfall). Nach dem Zurücknehmen:
**9 passed (22.8s)** in dieser Datei.

⚠️ **Was dieses Experiment NICHT zeigt.** Mutiert wurde der Anzeigezweig; belegt ist damit, dass der
E2E-Lauf die Meldung wirklich sieht und nicht ins Leere prüft. Die **Unterscheidung** „kaputt gegen
legitim leer" prüft es nicht — dafür stehen der grün laufende `e2e-check-lesbar`-Fall gegen denselben
Code und die Zusicherungen der Parserschicht (Abschnitt 4). Zwei verschiedene Belege, nicht einer.

**Regression der übrigen Suite nach dem Seed-Eingriff:** `lagerbuch-helfer`, `-mobil`, `-etiketten`,
`-bestand-export`, `-hosts` → **54 passed (1.7m)**.

---

## 5. Was strukturell nicht testbar war

1. **Die Route hatte vor dieser Arbeit gar keine E2E-Deckung** — `lagerbuch-verwaltung.spec.ts`
   besuchte `/verwaltung`, `/verwaltung/artikel`, `/verwaltung/geraete`; `checks` kam in der ganzen
   Suite nur als `/helfer/check` vor (`lagerbuch-helfer.spec.ts:332`), und `e2e/seed-lagerbuch.ts`
   legte **keine `checks`-Zeile** an. Die Datei, nach der ich laut Auftrag suchen sollte, gab es
   nicht. **Mit Commit `443ddb0` ist die Lücke für diese Route geschlossen** (siehe 4a); der Lead
   legt aus dem Befund einen Board-Posten an.
2. **Ein echter Abruf mit unlesbarem Datensatz war zunächst nicht gefahren** — das ist mit 4a
   erledigt. Der Dev-Server-Weg (T175-Muster) war damit nicht nötig.
3. **Weiterhin nicht belegt:** die Darstellung in Hell/Dunkel und auf 390px für die neue Meldung.
   Sie erbt Form und Abstände vom `altFormat`-Alert derselben Datei, der von
   `lagerbuch-mobil.spec.ts` mit abgedeckt ist; ein eigener Überlauftest wurde nicht ergänzt (kein
   neues Layout, nur ein zweiter Alert derselben Bauart).

---

## 6. Gates

| Gate | Ergebnis |
|---|---|
| `rtk pnpm typecheck` | **No errors found** |
| `rtk pnpm lint` | **0 errors, 5 warnings** — alle fünf vorbestehend und in fremden Dateien (`e2e/fixtures.ts`, `_lib/boot.test.ts` ×2, `_lib/grenzen.test.ts`, `_lib/lesepfade/artikel.ts`); Warnungen blockieren die CI nicht |
| `rtk pnpm vitest run` | **337 Dateien / 5798 Tests passed** — zuletzt **nach** `443ddb0` erneut gemessen (der E2E-Commit fügt keine Vitest-Tests hinzu, die Zahl bleibt deshalb gleich) |
| `rtk pnpm build` | **✓ Compiled successfully** |
| `rtk pnpm exec playwright test e2e/lagerbuch-verwaltung.spec.ts` | **9 passed (22.8s)** — darin die zwei neuen Render-Nachweise (siehe 4a) |
| `rtk pnpm exec playwright test` (übrige lagerbuch-Specs: helfer, mobil, etiketten, bestand-export, hosts) | **54 passed (1.7m)** — Regression nach dem Seed-Eingriff |

Vor **jedem** der drei Commits lief die vollständige Suite: `5789` → `5795` → `5798`.

⚠️ **Ein einmaliger roter Lauf, den ich nicht erklären konnte — hier, weil Verschweigen schlimmer
wäre.** Unmittelbar nach dem Playwright-Lauf meldete ein Vitest-Durchgang **2 failed / 5796 passed**
(2 Dateien). Die Namen habe ich nicht, die Ausgabe war beim Nachsehen schon durchgelaufen. **Fünf
weitere vollständige Läufe danach waren grün** (`337 / 5798`), darunter ein gezielter
Reproduktionsversuch mit genau der verdächtigen Reihenfolge (E2E-Lauf → sofort Vitest). Die
plausibelste Ursache ist Gleichzeitigkeit auf demselben Checkout: auf diesem Arbeitsverzeichnis läuft
parallel ein Review, mehrere Tests greifen auf Datenverzeichnisse zu
(`core/db`, `core/bootstrap`, `_lib/seedLokal.test.ts`, …), und zwei gleichzeitige Testläufe teilen
sich diese Pfade. **Belegt ist das nicht** — belegt ist nur, dass es sich in fünf Läufen nicht
wiederholt hat und nicht an einer meiner Dateien hing (die berührten Dateien laufen einzeln und im
Verbund wiederholt grün).

**Zur Lesart dieser Zahlen, ehrlich gerechnet:** insgesamt sind 17 Tests neu (**8** Parser, 6 Leser,
3 Anzeige); die vier umgeschriebenen Parser-Zusicherungen zählten schon vorher mit. Ein Basiswert
**vor** der Parserschicht steht nicht im Protokoll — der erste vollständige Lauf (`5789`) fand statt,
als die Parsertests bereits grün waren. Belastbar sind daher nur die beiden Deltas `+6` (Leser) und
`+3` (Anzeige); die roten Ausgaben in Abschnitt 3 sind der eigentliche Beleg, nicht die Summen.

---

## 7. Selbstreview

**Vollständigkeit.** Drei Schichten tragen je ihren Teil, jede mit eigenen Tests. „Legitim leer" wird
nachweislich nicht gewarnt — auf allen drei Schichten je eine Zusicherung, auf der Anzeige zusätzlich
über die ~12 bestehenden Seitentests, die mit `BASIS` (leer, lesbar) arbeiten und 0 Alerts sehen.

**Disziplin.** Diskriminator additiv (`unlesbar?: true`), Parsersignatur unverändert, **keine**
Aufrufstelle angefasst. `altFormat` in Text, Typ, Herkunft und Tests unverändert. `src/core` nicht
berührt. Keine Datei unter `e2e/` oder `_actions/` angelegt (`_actions/guards.test.ts` grün).

**Kein Overbuild.** Eine Warnklasse, ein Text — nach der Fix-Runde auf zwei Flächen (Detailseite mit
Begründung, Übersicht mit einem Wort), beide aus **einer** Quelle. Objekte mit Müll in den Listen
bleiben tolerant und lesbar — keine zweite Klasse. Kein „Check läuft noch". Die Leertexte der fünf
Detailtabellen sind der einzige Schritt über den Wortlaut hinaus, und sie verhindern, dass die Seite
sich selbst widerspricht.

**Funde beim Selbstreview.**

* Der Erklärkommentar an der neuen `Alert`-Stelle nannte zunächst den Namen des antd-Icon-Pakets und
  machte den bestehenden Quelltext-Riegel rot — umformuliert, und der Riegel ist im Kommentar jetzt
  selbst genannt, damit der nächste Leser nicht dieselbe Minute verliert.
* Ein `//`-Kommentar stand zwischenzeitlich **innerhalb** der JSX-Attributliste von
  `CheckDetailTabellen`. Er parste und typecheckte, ist in dieser Datei aber unüblich — auf die
  `{/** … */}`-Form über dem Element gezogen.

**Bedenken.**

1. ~~**Die Abweichung von Festlegung 1** (`null` zählt nicht) ist eine fachliche Entscheidung, die ich
   nicht allein treffen soll; Rückfrage unbeantwortet.~~ **ERLEDIGT — vom Lead entschieden:** Variante
   B ist richtig, die ursprüngliche Formulierung war zu grob, maßgeblich ist die Spec (§4.4).
   **Kein Rückbau.** Es steht damit keine unbeantwortete Frage mehr im Bericht. Die Zusicherung, die
   der Lead ausdrücklich sehen wollte („`ergebnis IS NULL` ist NICHT unlesbar"), war bereits gebaut —
   auf **beiden** Schichten, benannt: `checkErgebnis.test.ts` („`null` ist NICHT unlesbar — ein
   offener Check hat noch kein Ergebnis", der eigentliche Beleg) und `lesepfade/checks.test.ts`
   („meldet NICHT unlesbar für einen OFFENEN Check ohne ergebnis", Regressionsschutz).
2. **Der offene Check bleibt ohne eigenen Anzeigezustand.** `/verwaltung/checks/<offener>` zeigt
   weiterhin „Abgeschlossen —" und „0 Positionen". Das ist derselbe Klasse-Fehler wie Zustand 27
   (ein 200, das nicht sagt, was los ist), steht aber **nicht** in §11.5 und war nicht mein Auftrag.
   Empfehlung: als eigener Zustand aufnehmen, nicht in 27 einbauen. Der Lead legt einen Board-Posten
   an.
3. ~~**Die E2E-Lücke aus 5.1** — die Check-Detailseite hat gar keine End-to-End-Abdeckung.~~
   **ERLEDIGT für diesen Zustand** mit `443ddb0` (Abschnitt 4a): echter Render beider Fälle. Als
   **Klasse** bleibt die Lücke bestehen (Tabellen, Kacheln, Verfallszeilen der Seite sind weiterhin
   nur unter Vitest belegt) — dafür legt der Lead einen Board-Posten an.

---

## 8. Nachtrag: die Rückmeldung des Leads, Punkt für Punkt

| Auflage | Erledigt |
|---|---|
| Variante B bauen (`null` nicht unlesbar, `""`/`catch`/falsche Form schon) | ja — war bereits so gebaut, unverändert |
| Die Unterscheidung **benannt** zusichern | ja — „`null` ist NICHT unlesbar — ein offener Check hat noch kein Ergebnis" (Parser, der eigentliche Beleg) und „meldet NICHT unlesbar für einen OFFENEN Check ohne ergebnis" (Leser, Regressionsschutz; siehe die ⚠️-Notiz in Abschnitt 4) |
| Echter Render, **beide** Fälle | ja — dauerhafter Weg, Commit `443ddb0`, Abschnitt 4a |
| E2E-Lücke im Bericht benennen | Abschnitt 5.1 |
| „Check läuft noch" **nicht** bauen | nicht gebaut; als Anzeigelücke in Abschnitt 7, Bedenken 2 |
| Nebenbefund 1 (`?? "[]"` der Alt-Anwendung) liegen lassen | unverändert, nur dokumentiert |
| Kein `src/core`, keine neue Datei unter `e2e/` oder `_actions/` | eingehalten — beide E2E-Änderungen sind Ergänzungen in vorhandenen Dateien, `guards.test.ts` grün |

---

## 9. Nachweis in der vom Lead verlangten Form — Kommando und Ausgabe

Die Antwort des Leads (Variante B + Render-Nachweis) kam **zweimal** an, das zweite Mal nach der
Fertigstellung. Der Inhalt war identisch; es gibt also **eine** Umsetzung, nicht zwei. Zum Abschluss
die genaue vom Lead genannte Befehlsfolge frisch gegen den committeten Stand gefahren:

```
$ rtk pnpm build && rtk pnpm exec playwright test e2e/lagerbuch-verwaltung.spec.ts
✓ Compiled successfully in 896ms

  ✓  8 … › Check-Detail benennt ein unlesbares Ergebnis (§11.5, 27)
         › ein unlesbares ergebnis wird benannt — als Warnung, nie als Fehler (2.4s)
  ✓  9 … › Check-Detail benennt ein unlesbares Ergebnis (§11.5, 27)
         › ein lesbarer Check mit 0 Positionen bekommt KEINE solche Warnung (2.0s)

  9 passed (28.6s)
```

Das unterscheidende Merkmal je Fall (verlangt für den Dev-Server-Weg, hier dauerhaft zugesichert
statt einmalig protokolliert):

| Fall | Status | Merkmal |
|---|---|---|
| `e2e-check-unlesbar` | 200 | genau **eine** `.ant-alert` mit „Ergebnis unlesbar", Klasse `ant-alert-warning`, **nicht** `ant-alert-error` |
| `e2e-check-lesbar` | 200 | Inhalt sichtbar, **0 ×** „Ergebnis unlesbar" — die Gegenprobe, ohne die eine Warnung auf jedem Check unentdeckt bliebe |

Der Dev-Server-Weg (T175-Muster) war damit nicht nötig; der dauerhafte Weg ging **ohne** Seed-Umbau,
der andere Tests berührt — belegt durch **54 passed** über die übrigen lagerbuch-Specs nach dem
Eingriff.

---

## 10. Fix-Runde nach dem Review (Commit `407075e`)

Sechs Minor, fünf davon zu beheben; Fund 6 (der eine rote Vitest-Lauf) hat der Reviewer als
Gleichzeitigkeit eingeordnet und der Lead abgeschlossen. Reihenfolge bewusst: erst das Isolierte,
zuletzt das, was gemeinsame Fixtures anfasst.

### Minor 5 — `undefined` verhält sich wieder wie `null`

Vor T176a1 fing `if (!roh)` auch `undefined` mit ab; die präzisere `roh === null`-Prüfung ließ es in
`JSON.parse(undefined)` → `catch` → **unlesbar** laufen. Kein lebender Pfad (Signatur ist
`string | null`), aber eine künftige Signaturerweiterung produzierte damit still eine Warnung für
einen intakten Datensatz.

Rot (Test zuerst, `checkErgebnis.test.ts`):

```
     × `undefined` verhaelt sich wie `null`, nicht wie kaputtes JSON
AssertionError: expected true to be falsy
      Tests  1 failed | 23 passed (24)
```

Der Test trägt einen Cast **mit** Begründung im Kommentar — sonst löscht ihn der nächste Leser als
toten Code. Fix: `roh === null || roh === undefined` (explizit statt `==`, damit kein
`eqeqeq`-Streit entsteht). Der Parser-`describe` hat damit jetzt **9** Tests.

### Minor 3 — alle fünf Leertexte, nicht nur einer

„Keine Geräte in diesem Check." behauptet dasselbe wie „Keine Einzelposition erfasst." — bei
zerstörtem `ergebnis` hat es niemand geprüft. **Ein** Prop `unlesbarLeertext?: string | null`
ersetzt alle fünf; fünf getrennte Props laden dazu ein, den Satz später an vier Stellen zu pflegen
und an einer zu vergessen. Der Dreifach-Ternär aus `5b90e9f` fällt dadurch auf die ursprüngliche
Altformat-Form zurück — eine Vereinfachung von Code, den dieselbe Aufgabe eine Runde vorher
hinzugefügt hat.

Rot auf beiden Ebenen:

```
     × nimmt bei unlesbarem Ergebnis ALLEN fuenf Tabellen die Tatsachenbehauptung
AssertionError: expected undefined to be truthy                      (page.test.tsx)
     × ersetzt bei unlesbarem Ergebnis ALLE fünf Leertexte durch denselben Satz
AssertionError: Target cannot be null or undefined.        (CheckDetailTabellen.test.tsx)
```

Der Komponententest zählt den Satz **fünfmal** im gerenderten DOM und schließt alle fünf
Vorgabetexte einzeln aus; die Gegenprobe hält fest, dass ein lesbarer Check **keine**
Überschreibung bekommt und das Altformat seinen eigenen Nachfüll-Text behält.

### Minor 2 — die Übersicht kennzeichnet die Zeile

Begründung des Leads geprüft und geteilt: §11.5:10332 sagt „die **Zeile**", `:5619` verortet nur den
`Alert` auf der Detailseite und verbietet der Übersicht nichts. Umsetzung minimal: die Spalte
„Positionen" zeigt für eine unlesbare Zeile das Wort **`unlesbar`** statt der Zahl. Kein Chip, kein
Rot, kein Symbol (§6.6.5) — die Zahl selbst ist das Irreführende, nicht ihre Farbe.

Zwei Schichten, beide zuerst rot:

```
     × reicht `unlesbar` weiter — die Uebersicht braucht den Grund, nicht nur die Null
AssertionError: expected undefined to be true                     (domain/check.test.ts)
     × zeigt in der Positionen-Spalte das Wort statt der Zahl
AssertionError: expected '0' to be 'unlesbar'                (checks/page.test.tsx)
```

Nach der Implementierung schlugen die drei erwarteten `toEqual`-Fixtures in `domain/check.test.ts`
um (dieselbe Klasse wie beim Parser eine Runde vorher) — darunter „liefert bei kaputtem JSON Nullen
statt eines Wurfs", das jetzt `unlesbar: true` mitführt und damit festhält, dass der Grund auf dem
Weg nicht verlorengeht.

**Drei Gegenproben** sichern die Übersicht ab: legitim leer zeigt weiter `0`, das Altformat zählt
weiter seine Einträge, und die DTO-Zusicherung bleibt grün — über die RSC-Naht geht nur der fertige
Text, `CheckAnzeigeZeile` bekommt **kein** `unlesbar`-Flag (`ChecksTabelle` ist `"use client"`).

### Minor 1 — der Gegenprobentest heißt jetzt, was er prüft

`e2e-check-lesbar` trägt eine Position; der Test hieß aber „mit 0 Positionen". Statt nur umzubenennen
den besseren Weg genommen: **dritte Seed-Zeile** `e2e-check-leer` mit gültigem, leerem V2. Damit sind
alle drei Fälle echt gerendert — **kaputt**, **legitim leer**, **gefüllt** — und die Unterscheidung
„leer ≠ kaputt" ist nicht mehr nur unter Vitest belegt. Der gefüllte Fall bleibt erhalten, nur
umbenannt.

### Minor 4 — Zählfehler im Bericht

`8` statt `7` Parsertests, `17` statt `16` neue Tests; beide Stellen korrigiert (Abschnitte 3 und 6).
Die **Messungen** waren nie falsch — die rote Ausgabe `3 failed | 20 passed (23)` ist nur mit 8
konsistent.

### Gates der Fix-Runde

| Gate | Ergebnis |
|---|---|
| `rtk pnpm typecheck` | No errors found |
| `rtk pnpm lint` | 0 errors, 5 warnings (dieselben fünf vorbestehenden) |
| `rtk pnpm vitest run` (mit `tee /tmp/z27-fix-vitest.log`, wie erbeten) | **337 Dateien / 5806 Tests passed** (+8) |
| `rtk pnpm build` | ✓ Compiled successfully |
| `rtk pnpm exec playwright test e2e/lagerbuch-verwaltung.spec.ts` | **11 passed (29.6s)** — darin die vier Zustände (kaputt · leer · gefüllt · Übersichtszeile) |
| übrige lagerbuch-Specs (helfer, mobil, etiketten, bestand-export, hosts) | **54 passed (1.7m)** — Regression nach der dritten Seed-Zeile und nach dem `CheckSummen`-Umbau |

Der Vitest-Lauf lief diesmal ohne Parallelbetrieb und mit erfasster Ausgabe; er war grün, es gibt
also keine Namen nachzureichen.

**Zur Nicht-Vakuität der neuen Übersichts-Zusicherung:** sie ist strukturell nicht leer grün zu
bekommen — `toHaveCount(1)` auf einem nach „unlesbar" gefilterten Zeilen-Locator schlägt bei 0
Treffern fehl, und die zweite Zusicherung verlangt zusätzlich eine sichtbare **lesbare** Zeile, damit
„genau eine" nicht auf einer leeren Tabelle erfüllbar ist.

---

## Statusmeldung

- **Status:** DONE
- **Commits:**
  - `a4cb945` fix(lagerbuch): kaputtes ergebnis war von einem leeren nicht unterscheidbar
  - `748e63c` fix(lagerbuch): checkDetail reicht den Grund durch, statt ihn zu verschlucken
  - `5b90e9f` feat(lagerbuch): „Ergebnis unlesbar" statt einer ruhigen Null (§11.5, 27)
  - `45cb27c` docs(lagerbuch): T176a1-Bericht, und der Erklärtext zum Leertext an seinen Platz —
    reine Kommentarverschiebung, kein Verhalten (diese Berichtsdatei selbst ist über
    `.superpowers/sdd/.gitignore` **nicht** versioniert, wie alle Berichte hier)
  - `923df99` chore: `next-env.d.ts` auf den Stand vor dem Bau zurückgenommen — `pnpm build` schreibt
    die generierte Datei von `.next/dev/types/*` auf `.next/types/*` um; sie war in `45cb27c`
    versehentlich mitgelaufen
  - `443ddb0` test(lagerbuch): die Check-Detailseite echt rendern — beide Fälle (§11.5, 27)
  - `407075e` fix(lagerbuch): Zustand 27 auch dort, wo die Null noch ruhig blieb — die fünf Minor
    aus dem Review (Abschnitt 10)
- **Tests (Stand nach der Fix-Runde):** typecheck grün · lint 0 Fehler (5 vorbestehende Warnungen) ·
  vitest **337 Dateien / 5806 Tests** grün (mit `tee /tmp/z27-fix-vitest.log`, grün — keine Namen
  nachzureichen) · build ✓ · playwright `lagerbuch-verwaltung.spec.ts` **11 passed** (kaputt · leer ·
  gefüllt · Übersichtszeile) · übrige lagerbuch-Specs **54 passed**.
- **Bedenken (1) ist erledigt, nicht offen:** der Lead hat Variante B bestätigt (seine Formulierung
  war zu grob, maßgeblich ist §4.4) — kein Rückbau, keine offene Frage. Die benannte Zusicherung
  „`ergebnis IS NULL` ist NICHT unlesbar" liegt auf beiden Schichten.
- **Bedenken (2) ist geschlossen:** echter Render beider Fälle, `443ddb0`, Abschnitte 4a und 9.
- **Eine Beobachtung, die du kennen solltest:** ein einzelner Vitest-Lauf meldete `2 failed`, fünf
  weitere danach waren grün (inkl. gezieltem Reproduktionsversuch); Namen nicht erfasst,
  wahrscheinlich Gleichzeitigkeit mit dem parallelen Review auf demselben Checkout. Details in
  Abschnitt 6.
- **Fix-Runde:** alle fünf Minor behoben (Abschnitt 10), Fund 6 wie abgestimmt geschlossen. Zwei
  davon gingen über das Nötige hinaus, weil der bessere Weg da war: die dritte Seed-Zeile (statt nur
  umzubenennen) und ein Prop statt vier für die Leertexte.
- **Offene Punkte (keine Blocker, für dein Board):** (1) Ein **offener** Check
  (`ergebnis IS NULL`, §4.4) erscheint weiterhin als Check mit „0 Positionen" — benannte
  Anzeigelücke, bewusst nicht gebaut. (2) `/verwaltung/checks/[id]` hatte vor `443ddb0` **keine**
  E2E-Deckung; für diesen Zustand ist sie jetzt da, für den Rest der Seite (Tabellen, Kacheln)
  nicht.
- **Bericht:**
  `/Users/rubeen/dev/personal/drk/iuk-suite-lagerbuch-teil6/.superpowers/sdd/2026-08-03-lagerbuch-modul-teil6/task-176a1-report.md`
