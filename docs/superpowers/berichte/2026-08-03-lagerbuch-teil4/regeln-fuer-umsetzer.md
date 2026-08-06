# Bindende Regeln für jeden Umsetzer und jeden Reviewer in Teil 4

Vom Betreiber am 05.08.2026 entschieden, nachdem ein Vorab-Scan des ganzen Plans **51 Befunde**
ergeben hat (davon 9 bau-anhaltende). Der vollständige Scan liegt neben dieser Datei:
`preflight-scan.md` — **lies dort den Abschnitt zu deinem Task, bevor du anfängst.**

Diese Regeln stehen **über** dem Wortlaut des Plans. Wo sie mit dem abgedruckten Code kollidieren,
gewinnen sie — und die Abweichung gehört in deinen Bericht.

---

## Regel 1 — Mechanische Defekte reparierst du, statt sie zu bauen

Der Plan druckt an rund 30 Stellen Code ab, der nachweislich nicht laufen kann. Repariere nach der
im Scan benannten Regel, halte die Abweichung im Bericht fest, und **lösche dabei niemals einen
Kommentar, den der Plan als Begründung vorschreibt** — die naheliegende „Reparatur" ist fast immer
das Löschen genau der Begründung, die konserviert werden soll.

Die vier häufigsten Ausprägungen:

1. **Quelltext-Scans, die ihre eigene Begründung treffen** (27 Fundstellen, 16 Tasks). Ein Scan wie
   `expect(readFileSync(QUELLE, "utf8")).not.toMatch(/"use client"/)` liest den Rohtext inklusive
   Kommentaren — und derselbe Task schreibt die verbotene Zeichenfolge in einen Kommentar derselben
   Datei. **Teil 2 hat den Riegel dagegen bereits gebaut:** `ohneKommentare()` in
   `src/app/m/lagerbuch/_lib/bauform.test.ts` (dort steht wörtlich „⚠️ OHNE DAS IST JEDER DIESER
   SCANS AUF SEINER EIGENEN BEGRUENDUNG ROT"). **Benutze sie.** Liegt dein Scan in einer anderen
   Testdatei, exportiere sie nicht neu, sondern schreibe die zwei Zeilen lokal — und sag es im
   Bericht.
2. **DOM-Testdateien ohne `// @vitest-environment jsdom`.** `vitest.config.ts:7` setzt
   `environment: "node"`. Alle 29 Bestandsdateien, die `@/app/m/qr/_lib/test-dom` importieren,
   tragen den Docblock in den ersten drei Zeilen — ohne Ausnahme. Ohne ihn stirbt jeder DOM-Test mit
   `document is not defined`. Die Zeichenfolge kommt im ganzen Plan null Mal vor.
3. **Falsche API-Namen und -Signaturen gegen den eingecheckten Bestand.** Beispiele:
   `t.aufraeumen()` → `TestDb` kennt nur `schliessen()`; `alleDateien`/`MODULWURZEL` →
   `bauform.test.ts` hat `quellDateien`/`MODUL`; `verwaltungsZiel()` → verlangt `headers: Headers`.
   **Prüfe jede Signatur am eingecheckten Code, bevor du sie abschreibst**, statt der im Plan
   abgedruckten Fassung zu vertrauen.
4. **Fixtures ohne NOT-NULL-Spalten** (z.B. `tokens.createdBy`) und **falsche Erwartungszahlen**
   („Erwartet: PASS, N Zusicherungen" trifft in drei Tasks keine Zählweise). Rechne nach, korrigiere
   die **Erwartung**, nie die Regel — und berichte die tatsächliche Zahl.

## Regel 2 — Eine Zusicherung, die ihre Regel nicht trägt, schreibst du um

Zwölf Testkörper des Plans blieben grün, wenn man genau die Regel entfernte, die sie zusichern
sollen. Das ist die Klasse, die in Teil 3 dreiundzwanzig Mal auftrat.

**Frage bei jeder Zusicherung: bliebe sie grün, wenn ich genau die Regel entfernte, die sie
zusichern soll?** Wenn ja: schreibe sie so um, dass sie die Regel trägt, und **belege es durch eine
gefahrene Mutation** (Regel entfernen → Test rot → Regel zurück → Test grün), nicht durch Erzählen.
Die Mutation und ihr Ergebnis gehören in den Bericht, je tragender Regel eine.

Die sechs Ausprägungen aus Teil 3, jede mindestens einmal real eingetreten:

1. Die **Einfügereihenfolge** fällt mit der Sollreihenfolge zusammen → eine Sortierung ist ersatzlos
   entfernbar, ohne dass ein Test rot wird.
2. Die Fixture-**Namen** sind alphabetisch mit der geprüften Ordnung gleichgerichtet.
3. Die geforderte **Menge** liegt unter allen in Frage kommenden Restmengen → das Prädikat ist
   wirkungslos.
4. **Vitest behandelt bei `toEqual` eine Eigenschaft mit Wert `undefined` wie einen fehlenden
   Schlüssel.** Für „der Schlüssel fehlt" braucht es `toStrictEqual` oder
   `expect("x" in obj).toBe(false)`; für „die Map hat keinen Eintrag" ein `has()`.
5. Zwei Rechenwege liefern mit der Fixture **zufällig** dieselbe Zahl.
6. Die **Erwartungswerte des Plans** sind rechnerisch falsch — in drei von drei nachgerechneten
   Fällen aus Teil 3.

Dazu drei Formen, die der Scan in Teil 4 gefunden hat und die alle drei verboten sind:

- Ein `it()`-Rumpf **ohne jedes `expect`** (Vitest meldet ihn als bestanden).
- Eine `for`-Schleife über einen Selektor, die bei **leerem** Trefferarray null Zusicherungen
  ausführt — davor gehört ein `expect(treffer.length).toBeGreaterThanOrEqual(n)`.
- Eine Zusicherung gegen eine Zeichenkette, die der **Test selbst** aus demselben Literal gebaut
  hat — sie kann konstruktiv nie fehlschlagen.

Und: ein Quelltext-Scan, der eine exakte **Schreibweise** prüft (`/filter\(\(p\) => !p\.entfernt\)/`),
ist kein Verhaltenstest. Wo die Seite in einem Nachbartest ohnehin schon gemountet wird, gehört die
Prüfung ans Verhalten.

## Regel 3 — Lange Ausgaben in eine Datei, daraus zitieren

Nichts schätzen, nichts per `tail` gekürzt berichten. In Teil 3 kostete eine geschätzte Zahl aus
einer gekürzten Ausgabe eine ganze Fix-Runde, und die Zahl war falsch.

## Regel 4 — Zwei Tests, die dieselbe Zusage tragen sollen

Die Probe muss zeigen, **welcher welchen Fall allein hält**. Sonst ist der zweite eine Kopie, die als
Absicherung gelesen wird.

## Regel 5 — Wenn du unsicher bist, fragst du

Nicht raten, nicht „nah genug". Status `NEEDS_CONTEXT` oder `BLOCKED` kostet nichts; eine falsch
geratene Annahme kostet eine Fix-Runde und manchmal mehr.

---

## Betreiberentscheidungen vom 05.08.2026, die einzelne Tasks binden

| # | Entscheidung | Betroffen |
|---|---|---|
| B1 | **`falte()` in `_lib/artikelFilter.ts` ist ratifiziert** (Übergabe Teil 3, Punkt 9). Ein Quelltext-Scan darauf gehört zusätzlich in die T64-Erweiterung von `_lib/bauform.test.ts` | T64, T71 |
| B2 | **Der Reihenfolge-Scan der drei Gate-Flächen wird gebaut** (Befund 15, die von §0 verlangte Entscheidung). Host → Sperre **ohne DB-Zugriff** → normalisieren → `redeemToken` → Erfolg **ohne** Budgetverbrauch. In T64 in **Eigenschaftsform** („falls die Datei existiert"), weil die drei Dateien erst in Welle 4 und 7 entstehen; **T87 überführt ihn in die Existenzpflicht** — dasselbe Muster, das E9 für die Weichen-Zeile benutzt | T64, T87 |
| B3 | **`src/components/login-form.tsx:220` wird repariert** (Befund 14, Übergabe Teil 2 Punkt 3b): der Dev-Login verwirft heute jeden absoluten `callbackUrl` und landet auf `/`, womit der Verwaltungsknopf des Gates in **jeder** Dev- und E2E-Umgebung still ins Leere führt. Eigener, klein geschnittener Zusatz-Task mit eigenem Review — **nicht** nebenbei in einem Plan-Task | Zusatz-Task, dann T77, T81, T87 |

---

## Nachtrag aus dem Bau — Befunde, die spätere Tasks binden

**N-1 (aus T66, betrifft T73, T74, T77, T82):** Jedes `beforeEach`, dessen Testpfad
`createHelferSitzung` erreicht, muss **`LAGERBUCH_HELFER_SITZUNG_SECRET` setzen** — sonst wirft die
Funktion in jedem Treffer-Test. Der Plan erwähnt das an keiner Stelle.

**N-2 (aus T66):** `redeemToken` **normalisiert nicht selbst**; die Normalisierung liegt beim
Aufrufer. Ein Aufruf ohne `normalisiereCode` scheitert **still** am Erfolgspfad. Gedeckt ist das nur
durch den Reihenfolge-Scan aus T64 — und erst vollständig, wenn T87 ihn in die Existenzpflicht zieht.

**N-3 (aus T66):** Der Reihenfolge-Scan aus T64 (`GATE_FLAECHEN`, `bauform.test.ts:808`) ist eine
**feste Dreierliste** (`_actions/gate.ts`, `_actions/sitzung.ts`, `t/[code]/route.ts`), kein Sammler.
Wer eine vierte Gate-Fläche baut, muss sie dort eintragen — sonst behauptet der Scan über sie nichts.

**N-4 (empirisch belegt in T66):** Die `toEqual`/`undefined`-Falle ist real. Dieselbe Mutation
(`{ok:false, grund:undefined}`) lief mit `toEqual` **11/11 grün** und mit `toStrictEqual` rot.

**N-5 (aus T65, T66):** `ohneKommentare()` ist in `_lib/bauform.test.ts` **nicht exportiert**. Wer sie
in einer anderen Testdatei braucht, kopiert sie zeichengleich lokal (so halten es `pwaIcons.test.ts`
und `tokenEinloesung.test.ts`) und nennt es im Bericht.

**N-6 (Werkzeug):** `pnpm build` schreibt `next-env.d.ts` von der dev- auf die build-Variante des
Typ-Imports um. Nach jedem Build zurücksetzen (`git checkout -- next-env.d.ts`), sonst ist der Baum
scheinbar schmutzig.

**N-7 (aus T72, Fix-Runde 1; betrifft Teil 5, T101):** Die Querschnittsregel „Zeichen sind lokale
Inline-`<svg>` in derselben Datei, mit `aria-hidden="true"`, `focusable="false"`, **immer neben
Text**" (Plan Teil 4, Zeilen 171–173 und E3) hat **genau eine** festgeschriebene Ausnahme: den
**Taschenlampenschalter** in `_ui/BarcodeScanner.tsx`. Er trägt das Symbol allein, ohne
danebenstehenden Text.

Das ist **keine Umsetzerentscheidung**, sondern schon in der Spec ratifiziert —
`docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md:6308-6313` (§6.5.2) benennt die Datei
wörtlich:

> „Ein Zeichen **ohne** danebenstehenden Text ist ein Bedienelement und trägt dann ein `aria-label`
> am **Knopf**, nicht am `<svg>`. Genau ein Fall in der Verwaltung: der Taschenlampen-Schalter
> (`BarcodeScanner.tsx:134`) — und dessen Zustand muss zusätzlich `aria-pressed` tragen, weil man
> „an" von „aus" sonst nur an der Farbe erkennt."

(Die Zeilenangabe `:134` zeigt wie alle Herkunftsmarken dieses Plans in die **Alt-Datei**
`lagerbuch/src/components/BarcodeScanner.tsx`, nicht in die neue.) `teil5.md:1616-1624` trägt
denselben Absatz wörtlich in den Kopfkommentar der Datei, die T101 anlegt.

**Damit sind die drei Ausgleichsmaßnahmen Pflicht, nicht Kür**, und in T72 gebaut und getestet:
`aria-label="Taschenlampe"` am `<button>`, `aria-pressed={torch}` für den Zustand, und
`aria-hidden="true"` / `focusable="false"` am `<svg>`. **Für T101 heißt das: das Zeichen wandert per
Import-Tausch nach `_ui/ikonen.tsx`, die drei Attribute am Knopf bleiben, wo sie sind** — die
Ausnahme schlägt dort nicht erneut auf.

⚠️ **Wer die Ausnahme kippen will** (sichtbare Beschriftung neben dem Symbol; `.lampe` müsste dann
von `56×56` auf `min-height: 56px` mit Innenabstand), ändert damit §6.5.2 der Spec und §7.6 — das
gehört dorthin entschieden, nicht in einen Umsetzer- oder Fix-Task.

---

## B4 — Entscheidung zu Befund 5, getroffen am 06.08.2026 unter dem Autonomie-Auftrag

**Der Widerspruch:** `checkAbschluss` gibt im `safeParse`-Fehlerzweig `grund: "netz"` **serverseitig**
zurück. Global Constraint 12 verbietet das wörtlich („`"netz"` entsteht NIE serverseitig. Es ist der
Grund, den der Client im `catch` selbst setzt."), und T63 hat das mechanisch zementiert: ein
Quelltext-Scan auf `actionTypen.ts` verlangt den Satz, und die Datei trägt ihn.

Der Bruch wäre **still und typkorrekt** — `HelferGrund` enthält `"netz"` —, und die Anzeige sagte
„Keine Verbindung", wo die Verbindung steht und die Eingabe unvollständig ist.

**Entscheidung: `HelferGrund` bekommt einen fünften Wert `"eingabe"`.** Additiv, in
`src/app/m/lagerbuch/_lib/actionTypen.ts`:

- `export type HelferGrund = SperrGrund | "leer" | "netz" | "eingabe";`
- `darfErneuern("eingabe")` ist **`false`** — eine unvollständige Nutzlast wird nicht dadurch
  vollständig, dass jemand die Sitzung erneuert.
- Ein Kommentar an der Definition hält fest, **warum** es diesen Wert gibt: der `safeParse`-Zweig ist
  eine erwartbare Fehlerlage (Falle 66 verlangt einen Rückgabewert, keinen Wurf), aber sie ist weder
  ein Netzereignis noch ein Riegelfall noch „nichts gebucht".

**Warum nicht die Alternativen:** Ein **Wurf** verletzt Falle 66 — der Produktions-Deserialisierer
baut daraus einen festen englischen Satz mit `digest`, der Text erreicht niemanden. `"leer"` bedeutet
`gebucht === 0` und wäre fachlich falsch. `"netz"` beizubehalten verletzt Constraint 12 und die
Zusicherung, die T63 dafür gebaut hat.

⚠️ **Diese Änderung fasst `_lib/actionTypen.ts` an, die laut Eigentümertabelle T63 gehört.** Das ist
bewusst und hier ausdrücklich erlaubt; sie ist rein additiv, und T63 ist abgenommen. Die vier
Konsumenten (`_actions/check.ts`, `_ui/Entnahme.tsx`, `_ui/CheckFlow.tsx`, Teil 5 T114) müssen den
neuen Wert **anzeigen** können — der `text` des Ergebnisses trägt die Botschaft, der Grund steuert nur
das Erneuerungsfeld.

---

## B-1 — BINDEND für T77, T81 und T87 (Befund aus dem B3-Task, unabhängig vom Reviewer verifiziert)

**Der im Plan abgedruckte literale Wert
`"/login?callbackUrl=https%3A%2F%2Flagerbuch.iuk-ue.de%2Fverwaltung"` wird von der B3-Reparatur
ABGEWIESEN** — aus drei unabhängigen Gründen:

- `playwright.config.ts` setzt `AUTH_DEV_LOGIN:"true"` (:105) und `SUITE_HOST_FILES` (:123), aber
  **kein** `SUITE_HOST_LAGERBUCH`;
- der E2E-Host ist `lagerbuch.localtest.me` (`e2e/helpers/lagerbuch.ts:17`);
- `prodHosts` von `lagerbuch` ist in `src/core/registry.ts:103-105` **bewusst leer**.

`lagerbuch.iuk-ue.de` ist damit weder eigene Origin noch bekannter Modul-Host, und `https:` stünde
zusätzlich gegen die `http:`-Origin des E2E-Servers.

→ **T77 und T81 MÜSSEN den Verwaltungsknopf aus `verwaltungsZiel(kopf)` bauen**
(`src/app/m/lagerbuch/_lib/zugang.ts:205-213`, Signatur verlangt `headers: Headers`), **nicht** aus
dem Literal. Dann ergibt sich `http://lagerbuch.localtest.me:3100/verwaltung` = eigene Origin, und der
Dev-Login nimmt es an. Dass genau diese Form ankommt, ist seit B3 mechanisch zugesichert; es fehlt
allein, dass der Knopf sie benutzt.

⚠️ **Ein literaler Prod-Host lässt T87 weiterhin ins Leere laufen — und dann sieht es aus, als hätte
B3 nicht gewirkt.**

---

## Nachtrag aus den Wellen 5 und 6 — bindet alle folgenden Tasks

**N-7 — `Date.now()` im Render ist in diesem Projekt ein Lint-FEHLER, kein Stilproblem.**
`react-hooks/purity` meldet „Cannot call impure function during render", und `pnpm lint` bricht ab. Der
Plan druckt den Ausdruck trotzdem ab. Die Form, die das Projekt benutzt, ist eine Ablesung vor dem
Render: `const jetzt = new Date()` — Vorbild `src/app/(verwaltung)/posteingang/page.tsx:56` im Modul
`files`.

**N-8 — Quelltext-Scans in der `toContain`/`toMatch`-Form sind falsch-NEGATIV und still, und
`ohneKommentare()` repariert das NICHT.** Gemessen in T76: `data-testid="lb-tableiste"` und
`aria-label="Helfer-Bereiche"` standen im **Kopfkommentar** der Datei; der Scan des Plans blieb 18/18
grün, obwohl die Zusage **am Markup fehlte**. Ein positiver Scan beweist nur, dass die Zeichenfolge
irgendwo in der Datei steht. **Wo eine Zusage das gerenderte Ergebnis betrifft, gehört sie an den
gerenderten Baum**, nicht an den Dateitext. Betrifft mindestens T81, T83, T84, T85, T86.

**N-9 — ein Server-Startwert an eine Client-Insel ist im gemounteten Baum strukturell unprüfbar.**
Die Insel rechnet im `useEffect` sofort nach, ein falsch verdrahtetes Prop wäre dort unsichtbar grün.
Geprüft wird über `hydrate()` am **Server-HTML**. Jeder Task, der einen Server-Startwert reicht, hat
diese Falle.

**N-10 — `next/link` braucht unter Next 16.2.11 + jsdom keinen `vi.mock` mehr** (nachgemessen).
`src/app/m/qr/…/forms.test.tsx:13-18` mockt ihn noch mit einer heute nicht mehr zutreffenden
Begründung; wer sie als Vorlage nimmt, baut sich eine Stelle ein, an der Props wie `aria-current`
**verschluckt** werden.

**N-11 — Auflage an T83, T84 und T85 (aus T76):** Dass `helfer/page.tsx` und `helfer/check/page.tsx`
`requireHelferSitzung(getDb())` **selbst noch einmal** rufen müssen — ein Layout kann einer Seite
keine Props reichen —, steht bisher nur als Begründung in einem Kopfkommentar und ist **nirgends
geprüft**. Prüft es dort.
