# Lagerbuch Helfer-Zweig: zweite Fassung für breite Schirme — Umsetzungsplan

> **Für agentische Umsetzer:** ERFORDERLICHER SUB-SKILL: `superpowers:subagent-driven-development`
> (empfohlen) oder `superpowers:executing-plans`, Task für Task. Die Schritte tragen
> Kästchen (`- [ ]`) zur Nachverfolgung.

**Ziel:** Der öffentliche Zweig des Lagerbuch-Moduls bekommt ab 768px eine zweite
Fassung, die die Bildschirmbreite nutzt, statt als 560px-Säule in der Mitte zu stehen.

**Architektur:** `.rahmen` gibt seine Rolle als Handy-Viewport-Hülle ab und behält nur
die als Variablenträger. Die Breitenkappung wird zu einem `padding-inline`-Ausdruck auf
`.kopf`, `.inhalt` und `.tableiste`, gesteuert über **eine** neue Variable `--lb-bahn`.
Genau **eine** `@media (min-width: 768px)`-Abfrage am Dateiende setzt `--lb-bahn` auf
1200px, dreht die Reiterleiste nach oben und schaltet Listen mehrspaltig.

**Tech-Stack:** Next.js 16 (App Router, RSC) · handgeschriebenes CSS-Modul (kein antd
in diesem Zweig) · Vitest (jsdom) · Playwright.

## Global Constraints

Diese Angaben gelten für **jeden** Task und werden nicht je Task wiederholt.

- **Unter 768px ändert sich kein Pixel.** Abnahmebedingung, nicht Vorsatz.
- **Genau eine `@media (min-width: 768px)`-Abfrage** in `_ui/helfer.module.css`. Sie
  darf **kein** `max-width` enthalten — eine kombinierte Abfrage löst
  `bauform.test.ts:631-655` aus.
- **Jede `max-width`-Abfrage im ganzen Modulbaum schreibt `767.98`**, nie `768`
  (`bauform.test.ts:631`). Dieser Plan fügt keine hinzu.
- **56px Tap-Flächen bleiben 56px**, auch im 768px-Zweig. `core/theme/tokens.ts:33`
  nennt das eine Einsatzanforderung (Bedienung mit Handschuhen), keine Stilfrage.
- **Feldschrift ≥16px**, `.verfallZeile input` ≥18px mit `min-height: 56px`
  (`bauform.test.ts:553-560`, `:707-729`).
- **Kein `antd`, kein `@ant-design/icons`, kein `lucide-react`** in diesem Zweig
  (`bauform.test.ts:733-802`, Untergrenze 18 Dateien). Icons kommen aus `_ui/ikonen.tsx`.
- **Kein `--ant-*`** in `_ui/*` — weder im CSS noch in einem Inline-Style
  (`bauform.test.ts:658-685`). antd deklariert seine Variablen auf seiner Scope-Klasse;
  eine nicht auflösbare CSS-Variable ist gültiges CSS und fällt still auf `transparent`.
- **Jede benutzte `var(--lb-…)` muss im Körper von `.rahmen` oder im Dunkelzweig
  deklariert sein** (`bauform.test.ts:540-544`, Mengenprüfung `unaufloesbar`). Die
  Vereinigung beider Körper zählt — eine Deklaration in `.rahmen` allein genügt.
- **Die 23 Farbnamen bleiben unangetastet.** 15 Neutrale + 8 Ampelwerte, in `.rahmen`
  **und** im Dunkelzweig (`bauform.test.ts:466-486`). Kein Name kommt weg.
- **Kein `outline: none`** irgendwo; Fokus mit `outline-offset` (`bauform.test.ts:597`).
- **Der `prefers-reduced-motion`-Zweig des Scanstrichs bleibt** (`bauform.test.ts:584`).
- **Kein `:global(body)`** und kein anderer Zugriff außerhalb des Modulbaums — das ist
  Falle 5 (eigenes CSS gegen fremdes CSS, Spezifität entscheidet still).
- **Der neue Media-Block steht am Dateiende**, nach allen Basisregeln. Bei gleicher
  Spezifität entscheidet die Reihenfolge, und die Überschreibungen für `.tab` brauchen
  den späteren Platz.
- **Keine breitenabhängige Kappung außerhalb des Media-Blocks.** Ein Ausdruck wie
  `padding-inline: max(14px, calc((100% - 560px) / 2))` in einer Basisregel ist
  **breitenstetig** — er schlägt ab 561px zu, nicht ab 768px. Der erste Entwurf dieses
  Plans hatte genau diesen Fehler.
- **Jede Sichtprüfung nimmt eine Breite aus der Mitte mit** (650px), nicht nur 375px und
  1440px. Der Bereich zwischen Bahnbreite und Breakpoint ist der, in dem stetige
  Ausdrücke unbemerkt zuschlagen.
- **Sprache:** Kommentare und Commit-Nachrichten auf Deutsch, wie im Modul üblich.
  Keine personenbezogenen Daten (`lagerbuch/CLAUDE.md`).
- **Nach jedem Task:** `pnpm typecheck && pnpm lint && pnpm vitest run` grün, dann
  committen. `pnpm build` und `pnpm exec playwright test` laufen in Task 6.

---

## Dateiübersicht

| Datei | Rolle in diesem Plan |
|---|---|
| `src/app/m/lagerbuch/_ui/helfer.module.css` | Trägt den gesamten CSS-Umbau. Ändert sich in **jedem** Task 1–5. |
| `src/app/m/lagerbuch/_lib/bauform.test.ts` | Die Bauform-Zusicherungen. Werden in Task 1 und 2 umgestellt und erweitert. |
| `src/app/m/lagerbuch/_ui/CheckFlow.tsx` | Task 3: eine Klasse am Zählliste-Container. |
| `src/app/m/lagerbuch/_ui/ArtikelSuche.tsx` | Task 4: eine Klasse an der Listen-Karte. |
| `src/app/m/lagerbuch/_ui/Entnahme.tsx` | Task 5: ein Wrapper-`<div>` mit Lesebreite. |
| `e2e/lagerbuch-mobil.spec.ts` | Task 6: die Helfer-Seiten kommen in den Überlauftest. |
| `docs/abnahme/2026-08-12-helfer-desktop.md` | Task 6: das verfolgte Abnahme-Artefakt. |

**Warum `helfer.module.css` in jedem Task auftaucht:** es ist die einzige Stilquelle des
Zweigs, und die Aufteilung folgt der *Wirkung*, nicht der Datei. Jeder Task ist für sich
prüfbar und rückabwickelbar.

---

## Task 1: `.rahmen` gibt die Viewport-Hülle ab

**Files:**
- Modify: `src/app/m/lagerbuch/_ui/helfer.module.css:68-79` (der `.rahmen`-Körper),
  `:117-121` (`.kopf`), `:133` (`.inhalt`), `:134` (`.tableiste`)
- Modify: `src/app/m/lagerbuch/_lib/bauform.test.ts:547-551` (der 560px-Test)

**Interfaces:**
- Produces: die CSS-Variable **`--lb-bahn`**, deklariert im Körper von `.rahmen` mit
  dem Wert `560px`, und `max-width: var(--lb-bahn)` an derselben Stelle. Task 2 setzt
  die Variable im Media-Block auf `1200px` um und hebt dort die Kappung von `.rahmen`
  auf. Jede Breitenkappung des Zweigs liest ab jetzt diese Variable und schreibt keine
  eigene Zahl.

> **⚠️ KORREKTUR NACH DEM ERSTEN REVIEW (12.08.2026).** Die ursprüngliche Fassung
> dieses Tasks ließ `.rahmen` sofort vollbreit werden und kappte stattdessen die drei
> Bänder per `padding-inline` — **ohne** Media Query. Das war ein Planfehler und
> verletzte die eigene Abnahmebedingung: der Ausdruck ist breitenstetig, sein
> Umschlagpunkt liegt bei `--lb-bahn` (560px), nicht bei 768px. Zwischen **561px und
> 767px** änderte sich dadurch sehr wohl etwas — der Kartenhintergrund von Kopf- und
> Reiterleiste lief randlos statt auf 560px, und die Inhaltsbreite sprang von 532px
> auf 560px.
>
> Der Fehler war in Task 1 nicht behebbar, weil zwei Vorgaben einander ausschlossen.
> **Die Auflösung: die Kappung bleibt unter dem Breakpoint genau, wie sie heute ist,
> und der Desktop-Zweig aus Task 2 hebt sie auf.** Task 1 legt damit nur noch die
> Variable und die Ableitung an; das `padding-inline` der drei Bänder wandert
> vollständig nach Task 2. Unter 768px ist die Datei danach wirkungsgleich mit heute —
> nicht „fast", sondern deckungsgleich.

- [ ] **Schritt 1: Den Test umstellen, der heute die falsche Sache bezeugt**

`bauform.test.ts:547-551` prüft heute gegen den **rohen Dateitext**. Verschöbe man
`max-width: 560px` nur, bliebe er grün und behauptete weiter „kein Breakpoint, eine
Obergrenze" — über eine Datei, die genau das nicht mehr ist.

Ersetze den Block:

```js
  it("setzt `100dvh` und `max-width: 560px` — kein Breakpoint, eine Obergrenze", () => {
    const css = lies();
    expect(css).toMatch(/height:\s*100dvh/);
    expect(css).toMatch(/max-width:\s*560px/);
  });
```

durch:

```js
  it("`.rahmen` kappt weiter auf 560px, aber ueber `--lb-bahn` statt ueber eine Zahl", () => {
    /**
     * ⚠️ DIESER TEST HAT SEINE AUSSAGE GESCHAERFT (12.08.2026,
     * Betreiberentscheidung 14). Vorher: `expect(css).toMatch(/max-width:\s*560px/)`
     * gegen den ROHTEXT der Datei. Diese Form war schon dann gruen, wenn die
     * Zeichenfolge IRGENDWO stand, egal an welchem Selektor — sie haette eine
     * Verschiebung der Kappung an einen anderen Traeger nicht bemerkt. Ein Test,
     * der nach einem Umbau gruen bleibt und dabei etwas anderes bezeugt als sein
     * Name sagt, ist schlimmer als keiner.
     *
     * ⚠️ UND `.rahmen` BEHAELT SEINE KAPPUNG — das ist die Korrektur nach dem
     * ersten Review. Der erste Entwurf machte `.rahmen` sofort vollbreit und
     * kappte stattdessen die drei Baender per `padding-inline`, ohne Media
     * Query. Dieser Ausdruck ist BREITENSTETIG: sein Umschlagpunkt liegt bei
     * `--lb-bahn`, also bei 560px, nicht bei 768px. Zwischen 561 und 767px lief
     * der Kartenhintergrund dadurch randlos statt auf 560px, und die
     * Inhaltsbreite sprang von 532 auf 560px — ein klarer Verstoss gegen „unter
     * 768px aendert sich kein Pixel". Aufgehoben wird die Kappung jetzt
     * ausschliesslich im Desktop-Zweig (Task 2).
     */
    const koerper = regelKoerper(lies(), /(?:^|\})\s*\.rahmen\s*\{/m);
    expect(koerper, "`.rahmen`-Regel fehlt").not.toBe("");
    expect(koerper, "die App-Huelle bleibt: innerer Scrollbereich statt Dokumentfluss")
      .toMatch(/height:\s*100dvh/);
    expect(koerper, "`--lb-bahn` ist die EINE Quelle der Bahnbreite")
      .toMatch(/--lb-bahn:\s*560px/);
    expect(koerper, "die Kappung leitet sich ab, statt die Zahl zu wiederholen")
      .toMatch(/max-width:\s*var\(--lb-bahn\)/);
  });
```

- [ ] **Schritt 2: Testlauf — er muss fehlschlagen**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Erwartet: **FAIL** an `expect(koerper).toMatch(/--lb-bahn:\s*560px/)` — die Variable
gibt es noch nicht. Die `max-width`-Prüfung schlägt ebenfalls fehl, weil dort heute die
Zahl statt der Ableitung steht.

- [ ] **Schritt 3: Die Variable einführen und die Kappung darauf umstellen**

In `helfer.module.css`, im `.rahmen`-Körper: die Zeilen

```css
  width: 100%;
  max-width: 560px;            /* kein Breakpoint — eine Obergrenze */
  margin-inline: auto;
```

ersetzen durch:

```css
  /*
   * DIE BAHNBREITE — die EINE Zahl, die den Zweig kappt (Betreiberentscheidung
   * 14, 12.08.2026). Sie steht hier und nicht an jeder kappenden Regel: der
   * Media-Block am Dateiende setzt sie auf 1200px um, und eine Kappung, die
   * ihre 560 selbst schriebe, liefe dabei still zurueck.
   *
   * ⚠️ SIE IST EIN MASS, KEINE FARBE, und gehoert deshalb NICHT in den
   * Dunkelzweig. Die Tests, die „dieselben zwanzig Farbnamen" dort verlangen,
   * laufen ueber eine feste Namensliste; `--lb-bahn` steht nicht darauf.
   */
  --lb-bahn: 560px;

  width: 100%;
  /*
   * ⚠️ DIE KAPPUNG BLEIBT HIER, und das ist die Korrektur nach dem ersten
   * Review. Der erste Entwurf machte `.rahmen` sofort vollbreit und kappte
   * stattdessen `.kopf`, `.inhalt` und `.tableiste` per `padding-inline` — ohne
   * Media Query. Dieser Ausdruck ist BREITENSTETIG: sein Umschlagpunkt liegt
   * bei `--lb-bahn`, also bei 560px, NICHT bei 768px. Zwischen 561 und 767px
   * lief der Kartenhintergrund von Kopf und Reiterleiste dadurch randlos statt
   * auf 560px, und die Inhaltsbreite sprang von 532 auf 560px — ein Verstoss
   * gegen die Abnahmebedingung „unter 768px aendert sich kein Pixel", und einer,
   * den der vorgesehene Pruefplan (375px und 1440px) nicht einmal getroffen
   * haette.
   *
   * Aufgehoben wird die Kappung ausschliesslich im Desktop-Zweig am Dateiende.
   * Unter 768px ist diese Datei damit wirkungsgleich mit dem Stand davor.
   */
  max-width: var(--lb-bahn);
  margin-inline: auto;
```

`height: 100dvh` und der Rest des Körpers bleiben **unverändert**.

- [ ] **Schritt 4: Nichts weiter**

Die drei Bänder (`.kopf`, `.inhalt`, `.tableiste`) werden in **diesem** Task nicht
angefasst — ihr `padding-inline` gehört in den Media-Block und kommt in Task 2. Der
öffentliche Rahmen (`.oeffentlichInhalt`, `:149`) bleibt ebenfalls unverändert: das Gate
zentriert über `.gate` und `.gateKarten` selbst.

Damit ist Task 1 rein vorbereitend: **unter jeder Breite verhält sich die Datei nach
diesem Task exakt wie davor.** Das ist beabsichtigt und der Grund, warum der Fehler des
ersten Entwurfs jetzt nicht mehr auftreten kann.

- [ ] **Schritt 5: Testlauf — grün**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm vitest run src/app/m/lagerbuch
```

Erwartet: **PASS**, alle Lagerbuch-Tests. Besonders zu beachten:
`_ui/rahmen.test.tsx` („beide Träger nennen nur Klassen, die das Stylesheet
DEKLARIERT", Untergrenze 50 Klassen) und `_ui/HelferRahmen.test.tsx`.

- [ ] **Schritt 6: Sichtprüfung bei 375px — kein Unterschied**

Dev-Server läuft auf `lagerbuch.localtest.me:3000`. Token-Code **`100-100`** (Helfer
allgemein, aus `_lib/seedLokal.ts:132`; falls kein Seed vorhanden: `pnpm seed:lokal`).

```bash
open "http://lagerbuch.localtest.me:3000/t/100-100"
```

Prüfe `/helfer` bei **375px, 650px und 1440px**. Erwartung an allen dreien: **kein
sichtbarer Unterschied** zum Stand vor dem Task. Task 1 stellt nur die Kappung auf eine
Variable um, ohne ihren Wert zu ändern.

> **650px steht hier nicht zufällig.** Der erste Entwurf dieses Tasks brach genau in
> diesem Bereich, und ein Prüfplan aus nur 375px und 1440px hätte es nicht gesehen.
> Jede Sichtprüfung dieses Plans nimmt die Mitte deshalb mit.

- [ ] **Schritt 7: Commit**

```bash
git add src/app/m/lagerbuch/_ui/helfer.module.css src/app/m/lagerbuch/_lib/bauform.test.ts
git commit -m "refactor(lagerbuch): .rahmen gibt die Viewport-Huelle ab

Die Breitenkappung wandert von .rahmen auf .kopf/.inhalt/.tableiste und
laeuft ueber die neue Variable --lb-bahn. .rahmen ist damit vollbreit und
faerbt den ganzen Schirm statt einer Saeule.

Der 560px-Test in bauform.test.ts pruefte gegen den Rohtext der Datei und
waere nach dieser Verschiebung gruen geblieben, ohne noch etwas zu
bezeugen. Er bindet jetzt an den .rahmen-Koerper und an die drei Baender.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Der 768px-Zweig — Bahn auf 1200px, Reiter nach oben

**Files:**
- Modify: `src/app/m/lagerbuch/_ui/helfer.module.css` (neuer Block **am Dateiende**)
- Modify: `src/app/m/lagerbuch/_lib/bauform.test.ts` (neue Zusicherung im
  `§7.7.1`-describe, `:622-656`)

**Interfaces:**
- Consumes: `--lb-bahn` aus Task 1.
- Produces: der Media-Block `@media (min-width: 768px)`. **Alle folgenden Tasks
  schreiben ihre Desktop-Regeln in genau diesen Block** und öffnen keinen zweiten.

- [ ] **Schritt 1: Die Zusicherung schreiben**

In `bauform.test.ts`, im describe `"§7.7.1 — der eine Breakpoint, und dieses Modul
erfindet keinen zweiten"` (ab `:622`), **nach** dem bestehenden
`it("`_ui/helfer.module.css` enthaelt KEINE `@media (max-width`")` einfügen:

```js
  it("hat GENAU EINEN min-width-Zweig, und der nennt kein max-width", () => {
    /**
     * Betreiberentscheidung 14 (12.08.2026) hebt „NULL Media Queries fuer die
     * Breite" auf — fuer GENAU EINE Abfrage, nicht fuer beliebig viele. Der
     * urspruengliche Grund von §7.7.1 traegt weiter: zwei Breakpoints heissen
     * drei Fassungen, und die dritte prueft niemand.
     *
     * ⚠️ UND SIE DARF KEIN `max-width` ENTHALTEN. Eine kombinierte Abfrage wie
     * `(min-width: 768px) and (max-width: 1200px)` loest den 767.98-Scan
     * darunter aus — und zwar zu Recht: bei exakt 1200px gaelten sonst beide
     * Seiten, und die Reihenfolge im Stylesheet entschiede.
     */
    const css = ohneKommentare(readFileSync(HELFER_CSS, "utf8"));
    const zweige = [...css.matchAll(/@media([^{]*min-width[^{]*)\{/g)];
    expect(zweige.length, "genau ein min-width-Zweig").toBe(1);
    expect(zweige[0]![1], "der Zweig schaltet bei 768px").toMatch(/min-width:\s*768px/);
    expect(zweige[0]![1], "kein max-width im selben Zweig").not.toMatch(/max-width/);
  });

  it("der Desktop-Zweig setzt die Bahn um und dreht die Reiterleiste nach oben", () => {
    // Die zwei Zusagen, die den Zweig ueberhaupt rechtfertigen. Ohne sie waere
    // er eine leere Abfrage, die den Test darueber bestehen laesst.
    const css = ohneKommentare(readFileSync(HELFER_CSS, "utf8"));
    const auf = css.search(/@media[^{]*min-width/);
    expect(auf, "kein min-width-Zweig gefunden").toBeGreaterThan(-1);
    const zweig = css.slice(auf);
    expect(zweig, "die Bahn weitet nicht auf").toMatch(/--lb-bahn:\s*1200px/);
    expect(zweig, "`.rahmen` gibt seine Kappung nicht ab").toMatch(
      /\.rahmen\s*\{[^}]*max-width:\s*none/,
    );
    expect(zweig, "die Reiterleiste wandert nicht nach oben").toMatch(
      /\.tableiste\s*\{[^}]*order:\s*-1/,
    );
  });

  it("die Kappung der drei Baender steht NUR im Desktop-Zweig", () => {
    /**
     * ⚠️ DIE ZUSICHERUNG, DIE AUS DEM ERSTEN REVIEW ENTSTANDEN IST. Der erste
     * Entwurf setzte dieses `padding-inline` in die BASISREGELN der drei
     * Klassen, ohne Media Query. Der Ausdruck ist breitenstetig und schlug
     * damit schon ab 561px zu, nicht erst ab 768 — der Kartenhintergrund lief
     * randlos, die Inhaltsbreite sprang um 28px. „Unter 768px aendert sich kein
     * Pixel" war damit verletzt, ohne dass ein Test es gesehen haette.
     *
     * Der Scan prueft BEIDE Richtungen: im Zweig muss es stehen, davor nicht.
     * Nur die zweite Haelfte faengt den Rueckfall.
     */
    const css = ohneKommentare(readFileSync(HELFER_CSS, "utf8"));
    const auf = css.search(/@media[^{]*min-width/);
    expect(auf, "kein min-width-Zweig gefunden").toBeGreaterThan(-1);
    const davor = css.slice(0, auf);
    const zweig = css.slice(auf);

    expect(zweig, "die Baender kappen im Desktop-Zweig nicht ueber --lb-bahn").toMatch(
      /padding-inline:\s*max\([^;]*--lb-bahn/,
    );
    expect(davor, "eine Kappung VOR dem Breakpoint schlaegt schon ab 561px zu")
      .not.toMatch(/padding-inline:\s*max\(/);
  });
```

- [ ] **Schritt 2: Testlauf — er muss fehlschlagen**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Erwartet: **FAIL** mit `expected 0 to be 1` — es gibt noch keinen `min-width`-Zweig.

- [ ] **Schritt 3: Den Block ans Dateiende schreiben**

Ans **Ende** von `helfer.module.css`, nach der Fokus-Regel:

```css
/* ————————————————————————————————————————————————————————————————————————
 * DIE ZWEITE FASSUNG — ab 768px (Betreiberentscheidung 14, 12.08.2026).
 *
 * ⚠️ SIE HEBT DEN KOPFKOMMENTAR DIESER DATEI TEILWEISE AUF. Dort steht „NULL
 * MEDIA QUERIES fuer die Breite (§7.7.1)", begruendet mit „eine Ansicht, die es
 * nur in EINER Fassung gibt, kann keinen zweiten Breakpoint einfuehren". Genau
 * diese Praemisse ist aufgehoben: der Helfer-Weg wird nicht nur auf Telefonen
 * benutzt, und auf einem Monitor stand er als 560px-Saeule mit rund 62 %
 * ungenutzter Flaeche — drei sichtbare Positionen in der Zaehlliste.
 *
 * WAS VON §7.7.1 BLEIBT, UND ES IST DAS MEISTE:
 *   * GENAU EIN Zweig, nicht zwei. Drei Fassungen prueft niemand.
 *   * KEIN `max-width` hier drin — sonst gaelten an der oberen Kante beide
 *     Seiten und die Reihenfolge entschiede. `bauform.test.ts` haelt beides.
 *   * Die 767.98-Regel fuer jede max-width-Abfrage im Modulbaum: unberuehrt,
 *     dies ist eine min-width-Abfrage.
 *
 * ⚠️ DIESER BLOCK STEHT AM DATEIENDE, und das ist tragend, keine Ordnung:
 * `.tab[aria-current="page"]` unten hat DIESELBE Spezifitaet wie die Basisregel
 * (:143). Bei Gleichstand entscheidet die Reihenfolge (Falle 5) — vorne
 * einsortiert bliebe die rote Linie still oben statt unten.
 * ———————————————————————————————————————————————————————————————————————— */
@media (min-width: 768px) {
  /*
   * ERST HIER GIBT `.rahmen` SEINE KAPPUNG AB — und ausschliesslich hier.
   * Unterhalb bleibt er bei 560px wie eh und je; das ist die Abnahmebedingung
   * „unter 768px aendert sich kein Pixel" in ihrer einzig haltbaren Form.
   *
   * VOLLBREIT IST KEINE STILFRAGE: `.rahmen` traegt `background:
   * var(--lb-papier)`. Gekappt faerbt er nur die Saeule, und rechts und links
   * steht die Grundfarbe des Dokuments — genau der „Fenster im Fenster"-Eindruck,
   * den der Umbau beseitigen soll.
   */
  .rahmen { --lb-bahn: 1200px; max-width: none }

  /*
   * DIE DREI BAENDER UEBERNEHMEN DIE KAPPUNG. `padding-inline` steht in einer
   * EIGENEN Regel und nicht in den Basisregeln der drei Klassen: dort traegt
   * jede ein `padding`-KURZFORMAT, und das ueberschriebe `padding-inline`, wenn
   * es davor stuende. Eine eigene Regel im spaeter stehenden Media-Block hat die
   * Frage gar nicht erst (Falle 5).
   *
   * `max(…)` und nicht der nackte `calc`: zwischen 768px und 1200px ist
   * `(100% - 1200px) / 2` NEGATIV, und ein negativer Innenabstand ist
   * ungueltiges CSS — die Zeile fiele still ganz aus und die Baender haetten
   * gar keinen Seitenabstand mehr.
   */
  .kopf, .inhalt { padding-inline: max(14px, calc((100% - var(--lb-bahn)) / 2)) }

  /* `0px` statt `14px` und `0px` MIT Einheit: die zwei Reiter tragen `flex: 1`
     und sollen bis an die Bahnkante reichen; `max()` verlangt vergleichbare
     Typen, ein nacktes `0` macht die Funktion ungueltig. */
  .tableiste { padding-inline: max(0px, calc((100% - var(--lb-bahn)) / 2)) }

  /*
   * DIE REITERLEISTE WANDERT NACH OBEN — per `order`, NICHT per zweitem Markup.
   *
   * ⚠️ WARUM NICHT „in den Kopf, neben die Marke": `<header>` und `<nav>` sind
   * Geschwister in `.rahmen` (`HelferRahmen.tsx:75,128`); CSS kann das eine
   * nicht in das andere schieben. Die naheliegende Loesung — die Reiter ZWEIMAL
   * rendern und je eine Fassung ausblenden — braeche `data-testid="lb-tableiste"`
   * auf zwei Treffer und damit E11/T171. Ein Knoten, eine `aria-current`-Marke.
   */
  .tableiste {
    order: -1;
    border-top: none;
    border-bottom: 1px solid var(--lb-linie);
  }

  /*
   * Waagerechte Reiter statt gestapelter Symbolknoepfe. `flex: 1` faellt weg —
   * zwei Reiter, die sich 1200px teilen, waeren zwei riesige Flaechen.
   *
   * ⚠️ `min-height: 56px` BLEIBT. Das Suite-Tapmass gilt auch hier:
   * `core/theme/tokens.ts:33` nennt es eine Einsatzanforderung (Handschuhe),
   * und ein 834px-Tablet ist genauso ein Touchgeraet wie ein Telefon.
   */
  .tab {
    flex: none;
    flex-direction: row;
    gap: 8px;
    padding: 10px 18px;
    min-height: 56px;
    border-top: 2.5px solid transparent;
    border-bottom: 2.5px solid transparent;
  }

  /* Die Marke wandert von oben nach unten — beide Kanten explizit, sonst bleibt
     die Basisregel (:143) mit ihrer roten Oberkante stehen. */
  .tab[aria-current="page"] {
    border-top-color: transparent;
    border-bottom-color: var(--lb-rot);
  }

  /* Mehr Luft, sobald welche da ist. Die Seitenabstaende regelt `--lb-bahn`. */
  .inhalt { padding-block: 20px 26px; }

  /*
   * Das Kamerabild bekommt eine Obergrenze in px. `max-height: 58vh` (:326)
   * sind auf 1440x900 rund 522px Video — auf einem Monitor nimmt das die ganze
   * Ansicht ein, ohne dass der Code besser lesbar wuerde.
   */
  .scanVideo { max-height: min(58vh, 420px); }
}
```

- [ ] **Schritt 4: Den Dateikopf nachziehen — er ist jetzt falsch**

`helfer.module.css:5-11` behauptet im Eröffnungsabsatz weiterhin:

> *„NULL MEDIA QUERIES fuer die Breite (§7.7.1). Eine Ansicht, die es nur in EINER
> Fassung gibt, kann keinen zweiten Breakpoint einfuehren. Der Rahmen ist fluid mit
> einer OBERGRENZE; auf 1280px steht er mittig …"*

Ab diesem Task stimmt davon der erste Satz nicht mehr, und der letzte beschreibt ein
Verhalten, das es nicht mehr gibt. **In einer Datei, deren ganzes Ethos ist, dass die
Kommentare die Entscheidungen tragen, ist ein widersprüchlicher Eröffnungsabsatz ein
echter Defekt** — nicht Kosmetik. Wer ihn stehen lässt, hinterlässt die nächste Person
mit zwei Aussagen und keiner Möglichkeit zu erkennen, welche gilt.

Schreibe den betreffenden Absatz um: **eine** Breiten-Media-Query, ab 768px, mit dem
Verweis auf Betreiberentscheidung 14 und darauf, dass unterhalb alles bleibt. Der
Hinweis auf `max-width: 767.98px` (falls je eine nötig wird) und die Ausnahme für
`prefers-reduced-motion` bleiben **wörtlich** stehen — beide gelten unverändert.

- [ ] **Schritt 5: Testlauf — grün**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm vitest run src/app/m/lagerbuch
```

Erwartet: **PASS**. `rahmen.test.tsx` löst genestete `@media`-Klammern in
`deklarierteKlassen()` fünffach auf (`:64`) — der gesamte Media-Block fällt dabei weg.
Für die Klassen dieses Tasks ist das unschädlich (alle sind schon in der Basis
deklariert); für neue Klassen in späteren Tasks ist es der Grund, warum sie eine
Basisregel brauchen.

- [ ] **Schritt 6: Sichtprüfung bei fünf Breiten**

```bash
open "http://lagerbuch.localtest.me:3000/t/100-100"
```

| Breite | Erwartung |
|---|---|
| 375px | unverändert gegenüber Task 1: Reiter **unten**, Bahn 560px |
| 650px | **unverändert** — Bahn 560px, Kartenhintergrund endet bei 560px, Reiter unten |
| 767px | unverändert — die Abfrage greift noch nicht |
| 768px | Reiter springen **nach oben**, rote Linie unter dem aktiven Reiter |
| 1440px | Bahn 1200px, Kopf und Inhalt nutzen die Breite |

> **650px ist die wichtigste Zeile dieser Tabelle.** Genau dort brach der erste Entwurf.
> Prüfe hier nicht nur „sieht plausibel aus", sondern gezielt: endet die weiße bzw.
> dunkle Fläche von Kopf- und Reiterleiste bei 560px, mit Papiergrund daneben? Wenn sie
> randlos bis zum Fensterrand läuft, ist die Kappung wieder stetig geworden.

Zusätzlich `/` (Gate) bei 1440px: **„Im Dienst" und „Verwaltung" stehen jetzt
nebeneinander.** `.gateKarten` (`:163`) hat sein `auto-fit`-Raster die ganze Zeit
gehabt, konnte es im 560px-Elternteil aber nie auslösen.

- [ ] **Schritt 7: Commit**

```bash
git add src/app/m/lagerbuch/_ui/helfer.module.css src/app/m/lagerbuch/_lib/bauform.test.ts
git commit -m "feat(lagerbuch): zweite Fassung des Helfer-Wegs ab 768px

Eine min-width-Abfrage am Dateiende: Bahn auf 1200px, Reiterleiste per
order nach oben, Kamerabild gedeckelt. Ein Knoten, eine aria-current-Marke
— die Reiter werden nicht zweimal gerendert, das braeche lb-tableiste.

Nebenwirkung, die kein eigener Task ist: das Gate zeigt seine zwei Karten
endlich nebeneinander. Das auto-fit-Raster war immer da und konnte im
560px-Elternteil nie ausloesen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Die Zählliste wird mehrspaltig

Der teuerste Bildschirm des Zweigs: gemessen bei 1440px sind **drei** Positionen
gleichzeitig lesbar, und die Sticky-Leiste „Alles auf Soll" verdeckt eine vierte.

**Files:**
- Modify: `src/app/m/lagerbuch/_ui/CheckFlow.tsx:468` (eine Klasse)
- Modify: `src/app/m/lagerbuch/_ui/helfer.module.css` (Basisklasse + Regeln im
  Media-Block aus Task 2)

**Interfaces:**
- Consumes: der Media-Block `@media (min-width: 768px)` aus Task 2.
- Produces: die CSS-Klasse **`.fachraster`**, gesetzt auf dem Container
  `[data-rolle="zaehlliste"]`.

- [ ] **Schritt 1: Die Zusicherung schreiben**

`CheckFlow.test.tsx` läuft unter jsdom und wertet Media Queries nicht aus — die Aussage
gehört deshalb in den Quelltext-Scan. In `bauform.test.ts`, im describe
`"Teil 4, T64 — das Stylesheet des Helfer-Wegs …"` ans Ende einfügen:

```js
  it("die Zaehlliste ist im Desktop-Zweig ein Raster", () => {
    // Der teuerste Bildschirm des Zweigs: bei 1440px waren drei Positionen
    // gleichzeitig lesbar, die Sticky-Leiste verdeckte eine vierte. Der Wert
    // des ganzen Umbaus haengt an dieser einen Regel.
    const css = ohneKommentare(readFileSync(HELFER_CSS, "utf8"));
    const zweig = css.slice(css.search(/@media[^{]*min-width/));
    expect(zweig, "`.fachraster` wird im Desktop-Zweig kein Grid").toMatch(
      /\.fachraster\s*\{[^}]*display:\s*grid/,
    );
  });
```

- [ ] **Schritt 2: Testlauf — er muss fehlschlagen**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Erwartet: **FAIL** — `.fachraster` existiert nicht.

- [ ] **Schritt 3: Die Klasse im Stylesheet anlegen**

Basisregel zu den Bausteinen (bei `.karte`, etwa `:186`):

```css
/*
 * Der Container der Zaehlliste. EINSPALTIGES Grid, nicht `display: block` —
 * optisch dasselbe, aber der Desktop-Zweig muss dann nur noch EINE
 * Eigenschaft umsetzen statt die Anzeigeart zu wechseln.
 *
 * ⚠️ DIE KLASSE GEHOERT IN DIE BASIS, nicht nur in den @media-Block:
 * `rahmen.test.tsx:60-68` leert genestete Klammern fuenffach, um Regelkoerper
 * von Selektoren zu trennen — dabei faellt der GANZE @media-Block weg. Eine
 * Klasse, die es nur dort gibt, gilt diesem Scan als nicht deklariert. Heute
 * traefe das `.fachraster` nicht (der Scan liest nur die zwei Rahmen-Dateien),
 * aber die naechste Datei, die er aufnimmt, braeche daran.
 *
 * `gap: 0 18px` heisst: senkrecht nichts, waagerecht 18px. Der senkrechte
 * Abstand kommt weiter aus `.fachKopf`s eigenem `margin` (:279) — eine
 * row-gap hier addierte sich dazu.
 */
.fachraster {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0 18px;
  align-items: start;
}
```

Im Media-Block aus Task 2, vor `.scanVideo`:

```css
  /*
   * ZWEI SPALTEN AB 768px, DREI AB 1100px — ohne zweite Media Query: `auto-fit`
   * mit `minmax` bricht selbst um. Das ist dieselbe Bauform, die `.gateKarten`
   * (:163) schon benutzt, und sie haelt §7.7.1 („genau ein Breakpoint") ein.
   *
   * 360px Mindestbreite je Spalte ist kein runder Wert, sondern der Platz, den
   * eine Zaehlzeile braucht: Pruefkreis 30 + Name + Stepper 3x56 = 168 + die
   * Verfallszeile darunter. Enger bricht der Stepper um.
   *
   * EINE Eigenschaft — `display`, `gap` und `align-items` stehen schon in der
   * Basisregel. `align-items: start` ist dort Pflicht: ohne das zieht Grid jede
   * Karte auf die Hoehe der hoechsten Zeile, und ein Fach mit zwei Positionen
   * bekaeme den Weissraum eines Fachs mit zwanzig.
   */
  .fachraster { grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)) }
```

- [ ] **Schritt 4: Die Klasse setzen**

`CheckFlow.tsx:468`:

```jsx
        <div data-rolle="zaehlliste">
```

wird zu:

```jsx
        <div className={s.fachraster} data-rolle="zaehlliste">
```

`data-rolle` bleibt unverändert — es ist der Testanker, `className` ist der Stil. Die
beiden werden nicht zusammengelegt.

- [ ] **Schritt 5: Testlauf — grün**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm vitest run src/app/m/lagerbuch
```

Erwartet: **PASS**. `CheckFlow.test.tsx` sucht über `[data-rolle='zaehlliste']` — der
Anker ist unberührt.

- [ ] **Schritt 6: Sichtprüfung**

```bash
open "http://lagerbuch.localtest.me:3000/helfer/check?fz=fz-rtw-1"
```

Bei 1440px: die Fachkarten stehen nebeneinander, **mindestens 10 Positionen** sind
gleichzeitig sichtbar. Bei 375px: unverändert untereinander.

Prüfe zusätzlich, dass `.abschluss` (die Sticky-Leiste, `:309`) über der vollen Bahn
sitzt und keine Karte verdeckt.

- [ ] **Schritt 7: Commit**

```bash
git add src/app/m/lagerbuch/_ui/helfer.module.css src/app/m/lagerbuch/_ui/CheckFlow.tsx src/app/m/lagerbuch/_lib/bauform.test.ts
git commit -m "feat(lagerbuch): Zaehlliste laeuft ab 768px mehrspaltig

auto-fit mit minmax(360px) — zwei Spalten ab 768, drei ab rund 1100, ohne
zweite Media Query. 360px ist der Platz, den eine Zaehlzeile mit Stepper
tatsaechlich braucht, kein runder Wert.

Statt drei sichtbaren Positionen bei 1440px sind es jetzt ueber zehn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Die Artikelliste wird zweispaltig

**Files:**
- Modify: `src/app/m/lagerbuch/_ui/ArtikelSuche.tsx:83` (eine Klasse)
- Modify: `src/app/m/lagerbuch/_ui/helfer.module.css` (Basisklasse + Media-Block)

**Interfaces:**
- Consumes: der Media-Block aus Task 2.
- Produces: die CSS-Klasse **`.karteRaster`**, als Zusatz zu `.karte` auf der
  Listen-Karte.

- [ ] **Schritt 1: Die Zusicherung schreiben**

Der heikle Teil ist **nicht** das Grid, sondern die Trenner. `.zeile` trennt heute per
`border-top` mit `.zeile:first-child { border-top: none }` (`:193-197`). Im Grid ist
„erstes Kind" **einmal** wahr, nicht je Spalte — die obere Reihe bekäme rechts eine
Linie, links keine.

In `bauform.test.ts`, im selben describe wie Task 3:

```js
  it("das Listenraster repariert seine Trenner — sonst franst die obere Reihe aus", () => {
    /**
     * ⚠️ DAS IST DER EIGENTLICHE INHALT DIESES TASKS, nicht das Grid.
     * `.zeile:first-child { border-top: none }` (:197) ist im Grid EINMAL wahr,
     * nicht je Spalte: die rechte Zelle der obersten Reihe traegt dann eine
     * Linie, die linke nicht. Der Fehler ist rein optisch, faellt in keinem
     * Test auf und sieht nach Schlamperei aus, nicht nach einem Bug.
     *
     * `:nth-child(-n + 2)` nimmt beide Zellen der ersten Reihe aus,
     * `:nth-child(2n)` gibt jeder rechten Zelle ihre senkrechte Kante.
     */
    const css = ohneKommentare(readFileSync(HELFER_CSS, "utf8"));
    const zweig = css.slice(css.search(/@media[^{]*min-width/));
    expect(zweig, "kein Grid auf `.karteRaster`").toMatch(
      /\.karteRaster\s*\{[^}]*display:\s*grid/,
    );
    expect(zweig, "die erste Reihe wird nicht von der Trennlinie ausgenommen").toMatch(
      /\.karteRaster\s+\.zeile:nth-child\(-n\s*\+\s*2\)/,
    );
    expect(zweig, "die rechte Spalte bekommt keine senkrechte Kante").toMatch(
      /\.karteRaster\s+\.zeile:nth-child\(2n\)/,
    );
  });
```

- [ ] **Schritt 2: Testlauf — er muss fehlschlagen**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Erwartet: **FAIL** — `.karteRaster` existiert nicht.

- [ ] **Schritt 3: Die Klasse im Stylesheet anlegen**

Basisregel direkt nach `.karte` (`:186`) — einspaltiges Grid, aus demselben Grund wie
bei `.fachraster` in Task 3:

```css
/* Zusatz zu `.karte` fuer lange, gleichfoermige Listen. Einspaltig ist optisch
   dasselbe wie der Blockfluss; der Desktop-Zweig setzt dann nur noch die
   Spaltenzahl um. Die Klasse gehoert in die BASIS — `rahmen.test.tsx:60-68`
   sieht Klassen nicht, die es nur im @media-Block gibt. */
.karteRaster { display: grid; grid-template-columns: 1fr }
```

Im Media-Block, nach `.fachraster`:

```css
  /*
   * ZWEI SPALTEN, FEST — hier bewusst KEIN `auto-fit` wie bei `.fachraster`.
   * Der Unterschied hat einen Grund: die Trennerregeln darunter zaehlen mit
   * `:nth-child(2n)` und setzen damit ZWEI Spalten voraus. Bei drei Spalten
   * saesse die senkrechte Kante an der falschen Zelle — und `auto-fit` sagt
   * einem CSS-Selektor nicht, wie viele Spalten es gerade erzeugt hat.
   */
  .karteRaster { grid-template-columns: 1fr 1fr }

  /* Jede Zelle bekommt ihre Oberkante zurueck … */
  .karteRaster .zeile { border-top: 1px solid var(--lb-linie) }
  /* … ausser den beiden der ersten Reihe. */
  .karteRaster .zeile:nth-child(-n + 2) { border-top: none }
  /* Die rechte Spalte trennt sich senkrecht von der linken. */
  .karteRaster .zeile:nth-child(2n) { border-inline-start: 1px solid var(--lb-linie) }
```

> **Achtung bei der Umsetzung:** `.karteRaster .zeile` (0,2,0) überstimmt
> `.zeile:first-child` (0,2,0) nur durch die spätere Position im Stylesheet — beide
> haben dieselbe Spezifität. Der Media-Block steht am Dateiende, das trägt. Wer den
> Block verschiebt, bricht das still (Falle 5).

- [ ] **Schritt 4: Die Klasse setzen**

`ArtikelSuche.tsx:83`:

```jsx
      <div className={s.karte}>
```

wird zu:

```jsx
      <div className={`${s.karte} ${s.karteRaster}`}>
```

- [ ] **Schritt 5: Testlauf — grün**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm vitest run src/app/m/lagerbuch
```

Erwartet: **PASS**. `ArtikelSuche.test.tsx` sucht über `[data-rolle='artikel-zeile']`.

- [ ] **Schritt 6: Sichtprüfung**

```bash
open "http://lagerbuch.localtest.me:3000/helfer"
```

Bei 1440px zwei Spalten. Genau prüfen: **die obere Reihe hat links wie rechts keine
Trennlinie**, und zwischen den Spalten läuft eine senkrechte. Bei ungerader Zeilenzahl
bleibt unten rechts eine Lücke — das ist richtig so.

Zusätzlich: ins Suchfeld tippen, bis nur **ein** Treffer bleibt. Die einzelne Zeile darf
keine senkrechte Kante tragen.

- [ ] **Schritt 7: Commit**

```bash
git add src/app/m/lagerbuch/_ui/helfer.module.css src/app/m/lagerbuch/_ui/ArtikelSuche.tsx src/app/m/lagerbuch/_lib/bauform.test.ts
git commit -m "feat(lagerbuch): Artikelliste zweispaltig ab 768px

Feste zwei Spalten, nicht auto-fit: die Trennerregeln zaehlen mit
nth-child(2n) und setzen zwei Spalten voraus.

Der eigentliche Inhalt sind die Trenner. .zeile:first-child ist im Grid
einmal wahr statt je Spalte — ohne die Reparatur traegt die obere Reihe
rechts eine Linie und links keine.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Detailseiten bekommen eine Lesebreite statt der vollen Bahn

Nicht jede Ansicht gewinnt durch 1200px. Die Entnahme zeigt eine Bestandszahl, einen
Stepper und eine FEFO-Liste — über 1200px gezogen stünde ein 24px-Titel allein auf
einer Zeile, in der 90 % Weißraum ist. Detailseiten bekommen deshalb eine engere Bahn.

> **⚠️ ABWEICHUNG VON DER SPEC, ausdrücklich statt stillschweigend.** Die Spec
> (`docs/superpowers/specs/2026-08-12-lagerbuch-helfer-desktop-design.md`, Abschnitt 3)
> sagt für diese Ansicht: *„Bestandszahl und Entnahme nebeneinander, FEFO darunter über
> die volle Breite."* Dieser Plan macht stattdessen **eine 720px-Lesebahn, einspaltig**.
>
> Grund: die zweispaltige Fassung verlangt einen Umbau der Kettenstruktur in
> `Entnahme.tsx` (drei Karten in ein Grid mit `grid-column`-Zuweisungen) und liefert
> dafür eine Ansicht, deren rechte Spalte nach dem Stepper leer ist — die FEFO-Liste hat
> im Seed drei Zeilen. Die Lesebahn kostet einen Wrapper-`<div>` und löst dasselbe
> Problem: der Inhalt steht nicht mehr über 1200px gezogen.
>
> Wer die zweispaltige Fassung doch will, hat mit `.lesebahn` die richtige Grundlage —
> sie ist der Ort, an dem ein Grid später hinkäme.

**Files:**
- Modify: `src/app/m/lagerbuch/_ui/Entnahme.tsx:95-96` (Wrapper)
- Modify: `src/app/m/lagerbuch/_ui/helfer.module.css`

**Interfaces:**
- Consumes: der Media-Block aus Task 2.
- Produces: die CSS-Klasse **`.lesebahn`** — ein Wrapper mit `max-width: 720px` im
  Desktop-Zweig, unter 768px wirkungslos.

- [ ] **Schritt 1: Die Zusicherung schreiben**

```js
  it("Detailansichten bekommen eine Lesebahn, nicht die volle Bahn", () => {
    // 1200px sind fuer eine Liste richtig und fuer eine Detailseite falsch: ein
    // 24px-Titel ueber 1200px hat 90 % Weissraum neben sich. `.lesebahn` ist
    // die schmalere Bahn fuer Ansichten mit wenig, aber wichtigem Inhalt.
    const css = ohneKommentare(readFileSync(HELFER_CSS, "utf8"));
    const zweig = css.slice(css.search(/@media[^{]*min-width/));
    expect(zweig, "`.lesebahn` kappt im Desktop-Zweig nicht").toMatch(
      /\.lesebahn\s*\{[^}]*max-width:\s*720px/,
    );
  });
```

- [ ] **Schritt 2: Testlauf — er muss fehlschlagen**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Erwartet: **FAIL** — `.lesebahn` existiert nicht.

- [ ] **Schritt 3: Die Klasse anlegen**

Basisregel bei den Bausteinen — die **Zentrierung** steht hier, die Kappung im
Desktop-Zweig:

```css
/* Die schmalere Bahn fuer Detailansichten. `margin-inline: auto` ohne
   `max-width` tut nichts und wird ab 768px tragend — die Regel ist damit
   halb hier und halb im Desktop-Zweig, nicht tot. Sie gehoert in die BASIS,
   weil `rahmen.test.tsx:60-68` Klassen nicht sieht, die es nur im
   @media-Block gibt. Unter 768px braucht es sie ohnehin nicht: dort ist die
   Bahn 560px und damit enger als jede Lesebreite. */
.lesebahn { margin-inline: auto }
```

Im Media-Block:

```css
  /*
   * NICHT JEDE ANSICHT GEWINNT DURCH 1200px. Die Entnahme zeigt eine Zahl, einen
   * Stepper und eine kurze Chargenliste; ueber die volle Bahn gezogen steht ein
   * 24px-Titel allein in einer Zeile mit 90 % Weissraum. 720px ist die Breite,
   * bei der die Entnahme-Karte ihre Innenaufteilung behaelt, ohne zu zerfallen.
   */
  .lesebahn { max-width: 720px }
```

- [ ] **Schritt 4: Den Wrapper einziehen**

`Entnahme.tsx:95-96` — heute ein Fragment:

```jsx
  return (
    <>
      <Link className={s.rueckweg} href="/helfer">
```

wird zu:

```jsx
  return (
    <div className={s.lesebahn}>
      <Link className={s.rueckweg} href="/helfer">
```

**Das schließende `</>` am Ende der Komponente muss zu `</div>` werden.** Suche das
zugehörige Fragment-Ende, nicht das erstbeste.

> **Warum ein echtes Element und kein Fragment:** ein Fragment hat keinen Knoten, an dem
> eine Klasse hängen könnte. Der zusätzliche `<div>` steht **innerhalb** von `.inhalt`
> und damit innerhalb von `.rahmen` — die Variablenvererbung und die
> Enthaltenheitsaussage von `rahmen.test.tsx` bleiben unberührt.

- [ ] **Schritt 5: Testlauf — grün**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm vitest run src/app/m/lagerbuch
```

Erwartet: **PASS**. `Entnahme.test.tsx` sucht über `data-rolle`-Anker; ein zusätzlicher
Elternknoten ändert daran nichts. **Schlägt hier etwas fehl, liegt es fast sicher an
einer Zusicherung über die direkte Kindschaft** — dann den Test lesen, nicht den
Wrapper entfernen.

- [ ] **Schritt 6: Sichtprüfung**

```bash
open "http://lagerbuch.localtest.me:3000/t/300-300"
```

Code `300-300` ist das Regaletikett „Kompressen 10×10" und landet direkt auf der
Artikel-Detailseite (`_lib/seedLokal.ts:134`).

Bei 1440px: der Inhalt steht in 720px-Bahn mittig, nicht über 1200px gezogen. Bei
375px: unverändert.

- [ ] **Schritt 7: Commit**

```bash
git add src/app/m/lagerbuch/_ui/helfer.module.css src/app/m/lagerbuch/_ui/Entnahme.tsx src/app/m/lagerbuch/_lib/bauform.test.ts
git commit -m "feat(lagerbuch): Detailansichten bekommen 720px Lesebahn

Listen gewinnen durch 1200px, Detailseiten nicht: die Entnahme zeigt eine
Zahl, einen Stepper und eine kurze Chargenliste. Ueber die volle Bahn
gezogen steht der Titel allein in einer Zeile mit 90 % Weissraum.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Abnahme — E2E deckt die Helfer-Seiten ab, Messwerte werden verfolgt

`e2e/lagerbuch-mobil.spec.ts` prüft waagerechten Überlauf bei 390/834/1280px — aber
nur auf **drei Verwaltungsseiten** (`:69-91`). Der ganze Helfer-Zweig ist heute nicht
abgedeckt, und genau er hat sich in Task 1–5 verändert.

**Files:**
- Modify: `e2e/lagerbuch-mobil.spec.ts` (neuer describe-Block)
- Create: `docs/abnahme/2026-08-12-helfer-desktop.md`

**Interfaces:**
- Consumes: alles aus Task 1–5.

- [ ] **Schritt 1: Den E2E-Block schreiben**

Ans Ende von `e2e/lagerbuch-mobil.spec.ts`. Die Helfer-Seiten brauchen **kein**
`devLogin`, sondern eine Token-Sitzung über `/t/<code>` — das ist der Unterschied zu
den Verwaltungsseiten oben.

```ts
/**
 * DER HELFER-ZWEIG BEI DREI BREITEN (12.08.2026, Betreiberentscheidung 14).
 *
 * ⚠️ WARUM ER BISHER FEHLTE UND WARUM DAS JETZT NICHT MEHR TRAGBAR IST: der
 * Ueberlauftest oben deckt drei VERWALTUNGSseiten ab. Solange der Helfer-Weg
 * auf 560px gekappt war, konnte er konstruktionsbedingt nicht ueberlaufen —
 * die Luecke war ungefaehrlich. Mit der zweiten Fassung ab 768px ist sie es
 * nicht mehr: `.fachraster` und `.karteRaster` erzeugen echte Rasterbreiten.
 *
 * KEIN devLogin. Der Helfer-Zweig kennt keine Anmeldung, sondern eine
 * Token-Sitzung: `/t/<code>` loest den Code ein und setzt das Sitzungscookie.
 * Ein `devLogin` hier fuehrte auf die Verwaltung und bezeugte die falsche
 * Seite — derselbe Fehlerzustand, gegen den Ruling A9 die Anker oben verlangt.
 */
test.describe("Der Helfer-Zweig laeuft bei keiner Breite ueber", () => {
  const HELFER_SEITEN: { pfad: string; anker: (page: Page) => Promise<void> }[] = [
    {
      pfad: "/helfer",
      anker: async (page) => {
        await expect(page.getByTestId("lb-tableiste")).toBeVisible();
        await expect(page.getByText("Artikel wählen", { exact: true })).toBeVisible();
      },
    },
    {
      pfad: "/helfer/check?fz=fz-rtw-1",
      anker: async (page) => {
        await expect(page.getByTestId("lb-tableiste")).toBeVisible();
        // Der Zaehlbildschirm, nicht die Fahrzeugwahl — nur er traegt das Raster.
        await expect(page.locator("[data-rolle='zaehlliste']")).toBeVisible();
      },
    },
  ];

  for (const b of BREITEN) {
    test.describe(`${b.name} (${b.width}x${b.height})`, () => {
      test.use({ viewport: { width: b.width, height: b.height } });

      for (const seite of HELFER_SEITEN) {
        test(`${seite.pfad} laeuft nicht ueber`, async ({ page }) => {
          // Token 100-100 = „Helfer Bereitschaft (Demo)" (_lib/seedLokal.ts:132).
          // Die Codes sind FEST, damit Lesezeichen und Tests stabil bleiben.
          const einloesen = await page.goto(lagerbuchUrl("/t/100-100"));
          expect(einloesen?.status(), "/t/100-100: HTTP").toBe(200);

          const antwort = await page.goto(lagerbuchUrl(seite.pfad));
          expect(antwort?.status(), `${seite.pfad}: HTTP`).toBe(200);
          await seite.anker(page);
          await page.waitForLoadState("networkidle");

          const mass = await ueberlauf(page);
          expect(
            mass.doc,
            `${seite.pfad} bei ${b.width}px: ${mass.schuldige.join(" | ")}`,
          ).toBeLessThanOrEqual(mass.vw);
        });
      }
    });
  }

  /**
   * DIE REITERLEISTE WECHSELT DIE SEITE — die eine Zusage, die ein
   * Quelltext-Scan nicht besitzen kann. `bauform.test.ts` sieht `order: -1`
   * als Deklaration; ob die Leiste dadurch tatsaechlich ueber dem Inhalt
   * landet, sieht nur ein Browser (Falle 5: die Regel steht richtig da und
   * greift nur nicht).
   */
  test("Reiterleiste steht bei 390px unten und bei 1280px oben", async ({ page }) => {
    const kante = async () => {
      const leiste = await page.getByTestId("lb-tableiste").boundingBox();
      const inhalt = await page.locator("main").boundingBox();
      expect(leiste, "Reiterleiste hat keinen Kasten").not.toBeNull();
      expect(inhalt, "Inhaltsbereich hat keinen Kasten").not.toBeNull();
      return { leiste: leiste!, inhalt: inhalt! };
    };

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lagerbuchUrl("/t/100-100"));
    await page.goto(lagerbuchUrl("/helfer"));
    await expect(page.getByTestId("lb-tableiste")).toBeVisible();
    const schmal = await kante();
    expect(schmal.leiste.y, "bei 390px gehoert die Leiste unter den Inhalt")
      .toBeGreaterThan(schmal.inhalt.y);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await expect(page.getByTestId("lb-tableiste")).toBeVisible();
    const breit = await kante();
    expect(breit.leiste.y, "bei 1280px gehoert die Leiste ueber den Inhalt")
      .toBeLessThan(breit.inhalt.y);
  });
});
```

- [ ] **Schritt 2: E2E laufen lassen**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm exec playwright test e2e/lagerbuch-mobil.spec.ts
```

Erwartet: **PASS**. Bei Fehlschlag im Überlauftest nennt die Meldung den Verursacher
namentlich (`ueberlauf()` sammelt bis zu fünf Schuldige mit Klasse und rechter Kante) —
das ist der Einstieg, nicht die Zahl.

- [ ] **Schritt 3: Die volle Kette**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
```

Alle fünf grün. `pnpm lint`: **Fehler** blockieren, Warnungen nicht.

- [ ] **Schritt 4: Die Messwerte aufschreiben**

Lege `docs/abnahme/2026-08-12-helfer-desktop.md` an. Das Artefakt gehört **ins Repo**,
nicht in einen git-ignorierten Bericht — eine Abnahmemessung, die nur im Werkzeug steht,
ist beim nächsten Umbau nicht mehr da.

Inhalt: je Breite (**375, 768, 1024, 1440**) und je Modus (**hell und dunkel**, weil der
Dunkelzweig ein eigener Variablensatz ist) für die fünf Ansichten `/`, `/helfer`,
`/helfer/check`, `/helfer/check?fz=fz-rtw-1`, `/a/<id>`:

| Feld | Wert |
|---|---|
| Ansicht, Breite, Modus | — |
| Sichtbare Positionen (nur Zählliste) | Zahl |
| Waagerechter Überlauf | ja/nein |
| Reiterleiste | oben/unten |
| Abweichung gegenüber dem Stand vor Task 1 bei 375px | muss **keine** sein |

Dazu die vier Abnahmesätze im Klartext:

1. Bei 375px ist **kein** Unterschied zum Stand vor Task 1 sichtbar.
2. Das Gate zeigt ab 768px **zwei Karten nebeneinander**.
3. Die Zählliste zeigt bei 1440px **mindestens 10 Positionen** gleichzeitig.
4. **Kein** waagerechtes Scrollen auf keiner der vier Breiten, in keinem Modus.

- [ ] **Schritt 5: Die Entscheidung dokumentieren**

Betreiberentscheidung 14 gehört dorthin, wo die dreizehn vom 04.08.2026 stehen. Finde
die Datei:

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite && grep -rln "Betreiberentscheidung" docs/ | head
```

Trage nach: **14 — §7.7.1 („NULL Media Queries für die Breite") wird für genau eine
`min-width: 768px`-Abfrage aufgehoben.** Begründung: der Helfer-Weg wird nicht nur auf
Telefonen benutzt; auf einem Monitor stand er als 560px-Säule mit rund 62 % ungenutzter
Fläche und drei sichtbaren Positionen in der Zählliste. Was von §7.7.1 bleibt: genau ein
Zweig, kein `max-width` darin, und die 767.98-Regel unberührt.

- [ ] **Schritt 7: Commit**

```bash
git add e2e/lagerbuch-mobil.spec.ts docs/abnahme/2026-08-12-helfer-desktop.md docs/
git commit -m "test(lagerbuch): Helfer-Zweig kommt in den Ueberlauftest, Abnahme verfolgt

Der Ueberlauftest deckte drei Verwaltungsseiten ab. Solange der Helfer-Weg
auf 560px gekappt war, konnte er nicht ueberlaufen — mit den Rastern ab
768px ist die Luecke nicht mehr tragbar.

Dazu die eine Zusage, die kein Quelltext-Scan besitzen kann: dass die
Reiterleiste durch order:-1 wirklich die Seite wechselt, sieht nur ein
Browser.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Was dieser Plan bewusst nicht tut

- **Die Verwaltung** (`/verwaltung/*`) bleibt unangetastet. Anderer Stack (antd 6,
  Suite-Shell), anderes Publikum, und sie hat bereits ein Desktop-Layout.
- **Kein neuer Breakpoint.** Wenn sich bei der Sichtprüfung zeigt, dass 1100px für drei
  Spalten zu eng ist, wird der `minmax`-Wert in `.fachraster` angepasst — nicht eine
  zweite Media Query eingeführt.
- **Keine Farbänderung.** Die 23 `--lb-*`-Namen bleiben, wie sie sind; `--lb-bahn` ist
  ein Maß, keine Farbe, und deshalb nicht im Dunkelzweig zu wiederholen.
- **`HelferRahmen.tsx` wird nicht angefasst.** Die Reiterleiste wandert per CSS.
