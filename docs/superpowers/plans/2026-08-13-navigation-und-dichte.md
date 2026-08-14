# Navigation und Bediendichte — Umsetzungsplan

> **Für agentische Bearbeitung:** ERFORDERLICHE SUB-SKILL: `superpowers:subagent-driven-development`
> (empfohlen) oder `superpowers:executing-plans`, Aufgabe für Aufgabe. Die Schritte tragen
> Checkbox-Syntax (`- [ ]`).

**Ziel:** Ein Navigationsbild für alle Module, ein benutzbarer App-Umschalter, und das Handschuh-Maß
nur noch dort, wo mit Handschuhen bedient wird.

**Entwurf:** `docs/superpowers/specs/2026-08-13-navigation-und-dichte-design.md` — er enthält die
Befunde und die Begründungen. Dieser Plan enthält die Handgriffe.

**Architektur:** `FullShell` und `MinimalShell` teilen sich ein neues Gerüst `SuiteRahmen`
(Kopfzeile, optionale Seitenleiste, Inhalt) und unterscheiden sich nur noch in Inhaltsbreite und
Bediendichte. Die zweite Kopfzeile (`Modulnav`) entfällt ersatzlos. Die Arbeitsdichte kommt aus einem
verschachtelten antd-`ConfigProvider`, der das Elterntheme erbt und nur drei Tokens überschreibt.

**Tech-Stack:** Next.js 16 (App Router, RSC) · Ant Design 6 · CSS Modules · Vitest (jsdom + Quelltext-Scan) · Playwright

## Korrekturen während der Ausführung

Dieser Plan wurde beim Umsetzen an zwei Stellen als **falsch** erkannt und berichtigt. Beide
Korrekturen stehen unten schon eingearbeitet; hier stehen sie zusammen, damit niemand die alte
Fassung aus einem Commit-Diff für die gültige hält.

1. **Aufgabe 4, Begründung für `display: flex`.** Der ursprüngliche Kommentar behauptete, ein
   `inline-flex`-Kind schrumpfe in einer Flex-Spalte auf seine Inhaltsbreite und die getönte Fläche
   des aktiven Eintrags habe deshalb hinter dem längsten Wort geendet. **Das kann nicht passieren:**
   Flex-Items werden blockifiziert (CSS Display Module Level 3) — `inline-flex` *ist* dort `flex` —,
   und `align-items` ist an keinem der drei Container gesetzt, steht also auf `normal`/`stretch`.
   Der Fehlerhergang war beim Planschreiben **hergeleitet, nicht beobachtet**, in einem Repo, das
   „GEMESSEN, nicht hergeleitet" an mehreren Stellen als Maßstab führt. Die Zeile bleibt, die
   Begründung ist gestrichen.

2. **Aufgabe 4, Test der Aktivmarkierung.** Der vorgeschriebene Test prüfte Akzentfarbe, Fläche und
   Gewicht, aber **nicht** `color`. Damit wäre die Textfarbe des aktiven Eintrags ungetestet
   geblieben — und genau sie trägt die 4.5:1-Rechnung in `globals.css`, nicht die 3px-Akzentlinie.
   Die Zusicherung ist ergänzt, mit Anker: ein nacktes `/color:/` matcht false-positiv in
   `border-inline-start-color:`.

Eine dritte Korrektur betraf **Aufgabe 2** und ist dort nicht eingearbeitet, weil sie eine Streichung
war: der vorgeschriebene Test „rendert keine zweite Zeile mehr unter der Kopfzeile" war
tautologisch — `SuiteNav` ist im Testaufbau auf `() => null` gemockt, ein Knoten mit
`data-testid="modulnav"` konnte dort nie entstehen. Er wurde ersatzlos gestrichen; die Aussage
tragen `shell-css.test.ts` und `navAbschnitte.test.ts` bereits.

## Globale Randbedingungen

Sie gelten für **jede** Aufgabe, auch wo sie dort nicht wiederholt werden.

- **Sprache:** Bezeichner, Kommentare und Commit-Botschaften auf Deutsch. Commit-Botschaften ohne
  Umlaute (bestehende Konvention im Repo), Quelltext-Kommentare **mit** Umlauten, wo die Datei sie
  schon benutzt.
- **RTK:** Jeder Shell-Befehl mit `rtk` davor, auch in `&&`-Ketten.
- **Falle 1:** Kein Compound-Zugriff auf antd in Server Components. `Layout.Header`, `Layout.Content`,
  `Layout.Sider` sind verboten — es gilt der tiefe Named-Import (`antd/es/layout/layout`,
  `antd/es/layout/Sider`).
- **Falle 6:** Werte, die eine Server Component liest, liegen in einem Modul **ohne** `"use client"`.
  Die Gegenrichtung (Client-Modul importiert Wert aus Nicht-Client-Modul) ist erlaubt und wird hier
  mehrfach benutzt.
- **Falle 7:** `@ant-design/icons` nie in einer Server Component. `src/core/shell/icons.test.ts`
  riegelt das repo-weit ab.
- **Falle 2:** In eigenem Markup nie `var(--ant-*)`. Nur `--iuk-*` (global) oder modul-lokale
  Variablen.
- **Falle 5:** Wo eigenes CSS gegen antd-CSS steht, eine Klasse mehr voranstellen — nie `!important`
  — und die Erhöhung kommentieren.
- **Ein Breakpoint:** 768px, und nur dieser. In `max-width`-Abfragen 767.98px.
- **Kein `opacity` zum Dämpfen von Text.** `--iuk-gedaempft` hat einen Dunkelzweig, eine Deckkraft
  nicht.
- **Nach jeder Aufgabe grün:** `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run`.
  **Playwright läuft NICHT je Aufgabe**, sondern einmal gebündelt in Aufgabe 6 — ein offener
  `pnpm dev` legt die E2E-Suite lahm, und jeder Aufruf gegen `*.localtest.me` braucht eine eigene
  Genehmigung. Die E2E-Dateien werden trotzdem in der Aufgabe angepasst, die sie bricht.
- **Worktree:** Gearbeitet wird in
  `/Users/rubeen/dev/personal/drk/iuk-suite/.claude/worktrees/navigation-redesign-ddc1b6`.

---

## Dateiübersicht

| Datei | Verantwortung | Aufgabe |
|---|---|---|
| `src/app/globals.css` | vierte Suite-Variable `--iuk-flaeche-aktiv` | 1 |
| `src/core/shell/shell.module.css` | Umschalter, Leiste, Kopfblock; `.modulnav` entfällt | 1, 2, 3, 4 |
| `src/core/shell/AppUmschalter.tsx` | Kicker-Rolle statt CSS-Abschrift | 1 |
| `src/core/shell/navAbschnitte.ts` | `hatAbschnitte` entfällt, `gruppiereNav` bleibt | 2 |
| `src/core/shell/SuiteNav.tsx` | `Modulnav` entfällt; `navGruppen` setzt Kicker | 2, 4 |
| `src/core/shell/SuiteHeader.tsx` | nur noch Kopfzeile, in klebendem Block | 2, 3 |
| `src/core/shell/SuiteRahmen.tsx` | **neu** — Kopf + optionale Leiste + Inhalt | 2 |
| `src/core/shell/FullShell.tsx` | Rahmen + Arbeitsdichte | 2, 5 |
| `src/core/shell/MinimalShell.tsx` | Rahmen + 640px-Spalte | 2 |
| `src/core/theme/theme.ts` | `ARBEITSDICHTE` | 5 |
| `src/core/theme/Arbeitsdichte.tsx` | **neu** — Client-Insel mit `ConfigProvider` | 5 |
| `src/core/shell/Seitenkopf.tsx` | **neu** — Seitenkopf für alle Module | 7 |
| `src/app/m/lagerbuch/_ui/SeitenKopf.tsx` | Adapter über `core/shell/Seitenkopf` | 7 |
| 38 Verwaltungsseiten + `qr/admin` | Durchgang nach Prüfliste | 8–13 |

---

## Aufgabe 1: Der App-Umschalter wird benutzbar

**Dateien:**
- Ändern: `src/app/globals.css`
- Ändern: `src/core/shell/shell.module.css:379-555`
- Ändern: `src/core/shell/AppUmschalter.tsx:169-171`, `:198-201`
- Test: `src/core/shell/shell-css.test.ts`

**Schnittstellen:**
- Erzeugt: CSS-Variable `--iuk-flaeche-aktiv` (hell `rgb(0 0 0 / 0.06)`, dunkel `rgb(255 255 255 / 0.1)`).
  Aufgabe 4 benutzt sie für die Seitenleiste.
- Erzeugt: `.umschalter { line-height: normal }` — Aufgabe 6 misst das im Browser.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

In `src/core/shell/shell-css.test.ts`, innerhalb von `describe("shell.module.css", …)`, vor dem
Test `"spannt das Umschalter-Panel mobil über die volle Breite"`:

```ts
  it("nimmt dem Umschalter die von antd geerbte Zeilenhoehe", () => {
    /*
     * DIE URSACHE DES UNBENUTZBAREN PANELS, und sie steht in keiner Datei
     * dieses Repos: `antd/es/layout/style/index.js:50` setzt auf
     * `.ant-layout-header` ein `lineHeight: unit(headerHeight)` — in dieser
     * Suite 64px. Der Umschalter haengt als DOM-Kind im `<Header>`;
     * `position: absolute` am Panel aendert den enthaltenden Block, NICHT die
     * Vererbungskette. Gemessen waren daraus 82px je Panel-Eintrag
     * (8px Polster + 64px Zeilenbox + 8px Polster) und ein 76px hoher
     * Ausloeser in einer 64px hohen Kopfzeile.
     *
     * Die Deklaration steht am gemeinsamen VORFAHREN von Ausloeser und Panel,
     * nicht an beiden einzeln: es ist eine Ursache, und zwei Deklarationen
     * dafuer laufen beim naechsten Anfassen auseinander.
     *
     * `normal` und keine Zahl: eine Zahl waere eine erfundene Skala, die ein
     * spaeterer Leser fuer geprueft haelt (dieselbe Regel wie in
     * `core/theme/schrift.ts`).
     *
     * DIESE DATEI BESITZT „die Regel steht da". Dass sie WIRKT, besitzt
     * `e2e/shell-mobil.spec.ts` — antd spritzt seine Regel zur Laufzeit ueber
     * cssinjs ein, kein Quelltext-Scan und kein jsdom kann sie sehen.
     */
    const regel = /\.umschalter\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Klasse .umschalter fehlt").not.toBeNull();
    expect(regel![1], "antds .ant-layout-header vererbt sonst line-height: 64px").toMatch(
      /line-height:\s*normal/,
    );
  });

  it("faerbt Nebentext ueber `--iuk-gedaempft` statt ueber Deckkraft", () => {
    // Deckkraft dimmt den Kontrast unpruefbar mit und traegt in beiden Modi
    // verschieden; eine Variable hat einen Dunkelzweig. Dieselbe Begruendung
    // steht seit jeher an `.drawerTitel` — sie galt nur fuer den Umschalter
    // nicht (`.umschalterAbschnitt`, `.appEintragText`, `.umschalterLeer`,
    // `.umschalterFusszeile`, `.umschalterPfeil` standen auf `opacity`).
    for (const regel of cssRegeln(OHNE_KOMMENTARE)) {
      expect(regel.deklarationen, `opacity in "${regel.selektor}"`).not.toMatch(
        /(?:^|;)\s*opacity\s*:/,
      );
    }
  });

  it("gibt der aktiven Flaeche eine Variable mit Wert in BEIDEN Farbmodi", () => {
    /*
     * Dieselbe Bauart wie der Panel-Flaechen-Test darunter, und aus demselben
     * Grund: auf diesem Zweig war das Panel schon einmal weiss auf weiss, weil
     * ein Plan eine Variable erfunden hatte, die es nicht gab. `--iuk-flaeche-
     * aktiv` wird von `.appEintrag`, `.umschalterAusloeser` UND (ab Aufgabe 4)
     * `.navLink` gelesen — ein Fehlgriff faerbt drei Stellen still leer.
     *
     * Sie steht in `app/globals.css` und nicht hier: ein CSS-Modul kann `:root`
     * nicht scopen, und zwei Nutznieszer (Umschalter-Panel, Seitenleiste)
     * erfuellen den Maszstab aus `docs/design/README.md`.
     */
    const GLOBALS = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const alle = cssRegeln(GLOBALS);
    const deklariert = (regel: CssRegel) =>
      /(?:^|;)\s*--iuk-flaeche-aktiv\s*:/.test(regel.deklarationen);

    expect(
      alle.some((r) => deklariert(r) && !r.selektor.includes('[data-theme="dark"]')),
      "--iuk-flaeche-aktiv hat keinen Hellwert",
    ).toBe(true);
    expect(
      alle.some((r) => deklariert(r) && r.selektor.includes('[data-theme="dark"]')),
      "--iuk-flaeche-aktiv hat keinen Wert unter [data-theme=dark]",
    ).toBe(true);
  });
```

- [ ] **Schritt 2: Testlauf, der fehlschlagen MUSS**

```bash
rtk pnpm vitest run src/core/shell/shell-css.test.ts
```

Erwartet: drei Fehlschläge — `line-height: normal` fehlt, mehrere `opacity`-Treffer,
`--iuk-flaeche-aktiv` fehlt in `globals.css`.

- [ ] **Schritt 3: Die Variable in `globals.css` ergänzen**

Beide `:root`-Blöcke in `src/app/globals.css` (Hell- und Dunkelzweig) je um eine Zeile erweitern:

```css
:root {
  --iuk-marke: #c8000f;
  --iuk-gedaempft: #5b6570;
  --iuk-linie: #d9dde1;
  --iuk-flaeche-aktiv: rgb(0 0 0 / 0.06);
}

:root[data-theme="dark"] {
  --iuk-marke: #e45a66;
  --iuk-gedaempft: #9aa4ad;
  --iuk-linie: #2a2f34;
  --iuk-flaeche-aktiv: rgb(255 255 255 / 0.1);
}
```

Und den Kommentar über dem Block anpassen — dort steht „**NUR DREI, UND DAS IST DER MASZSTAB**".
Ersetze diesen Satz durch:

```
 * VIER, UND DAS IST DER MASZSTAB, KEIN ANFANG. Nach `core` kommt, was einen
 * heute belegbaren Anwender hat. `--iuk-flaeche-aktiv` ist am 2026-08-13
 * dazugekommen und hat deren zwei: die getoente Flaeche des aktiven Eintrags
 * im App-Umschalter-Panel und dieselbe Flaeche in der Seitenleiste. Sie hing
 * vorher als `--suite-hover` an `.umschalter` und war ausserhalb dieses
 * Teilbaums unsichtbar — die Seitenleiste haette sie nicht gesehen, und der
 * Fehler waere still gewesen (Falle 2).
```

Die Werte sind die bisherigen aus `.umschalter` (`shell.module.css:382`, `:393`) — kein neuer
Farbeindruck, nur ein neuer Ort.

- [ ] **Schritt 4: `shell.module.css` — Umschalter umbauen**

Ersetze den gesamten Block von `.umschalter` bis `.umschalterFusszeile:hover` (heute
`shell.module.css:379-548`) durch:

```css
.umschalter {
  /* NUR NOCH ZWEI LOKALE VARIABLEN. `--suite-hover` ist am 2026-08-13 als
     `--iuk-flaeche-aktiv` nach `globals.css` gewandert, weil die Seitenleiste
     denselben Wert braucht und ihn hier nicht saehe. Diese beiden bleiben
     lokal: sie beschreiben Flaeche und Kontur eines aufklappenden Panels und
     haben keinen zweiten Nutznieszer. Hellwerte = Suite-Tokens
     (`core/theme/tokens.ts`), Dunkelwerte = antds Vorgaben. */
  --suite-flaeche: #ffffff;
  --suite-linie: #d9dde1;

  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;

  /* DIE URSACHE DES UNBENUTZBAREN PANELS — ausfuehrlich begruendet im
     gleichnamigen Test in `shell-css.test.ts`. Kurz: antd setzt auf
     `.ant-layout-header` ein `line-height: 64px`, und dieser Knoten haengt
     darin. Ohne diese Zeile ist jeder Panel-Eintrag 80px hoch und der
     Ausloeser 76px. Am gemeinsamen Vorfahren, nicht an beiden einzeln. */
  line-height: normal;
}

:root[data-theme="dark"] .umschalter {
  --suite-flaeche: #141414;
  --suite-linie: #303030;
}

.umschalterAusloeser {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  min-width: 0;
}

/*
 * HIER STAND `border-color: currentColor` — der schwarze Rahmen. Er war nicht
 * die Ursache, sondern das, was die Ursache sichtbar machte: er zeichnete den
 * durch die geerbte Zeilenhoehe auf 76px aufgeblaehten Knopf in Textfarbe nach.
 * Eine Flaeche statt einer Kontur, und die Kontur nur im geoeffneten Zustand —
 * dort trennt sie den Ausloeser vom Panel darunter, das dieselbe Kontur traegt.
 */
.umschalterAusloeser:hover {
  background: var(--iuk-flaeche-aktiv);
}

.umschalterAusloeser[aria-expanded="true"] {
  background: var(--iuk-flaeche-aktiv);
  border-color: var(--suite-linie);
}

.umschalterAusloeser strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* `--iuk-gedaempft` statt `opacity`: Deckkraft dimmt den Kontrast unpruefbar
   mit und traegt in beiden Modi verschieden. */
.umschalterPfeil {
  font-size: 12px;
  color: var(--iuk-gedaempft);
  transition: transform 0.15s;
}

.umschalterAusloeser[aria-expanded="true"] .umschalterPfeil {
  transform: rotate(180deg);
}

/* Die Drehung ist die einzige Bewegung in dieser Datei — und deshalb die
   einzige Stelle, die einen reduced-motion-Zweig schuldet. Der Endzustand
   bleibt: der Pfeil zeigt weiterhin nach oben, er kommt nur ohne Weg dorthin. */
@media (prefers-reduced-motion: reduce) {
  .umschalterPfeil {
    transition: none;
  }
}

/* Deckt den Rest der Seite ab, damit ein Klick daneben schließt. Unter dem
   Panel (`z-index`), aber über allem anderen. */
.umschalterFang {
  position: fixed;
  inset: 0;
  z-index: 900;
}

/*
 * Mobil eine vollbreite Fläche unter der Kopfzeile, ab 768px ein Popover.
 * Das ist der einzige Suite-Breakpoint; `Grid.useBreakpoint` ist verboten und
 * ein JS-Breakpoint zeigte beim ersten Render die falsche Variante.
 */
.umschalterPanel {
  position: absolute;
  z-index: 901;
  inset-inline: 0;
  inset-block-start: calc(100% + 8px);
  max-height: 70vh;
  overflow-y: auto;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid var(--suite-linie);
  background: var(--suite-flaeche);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
}

.umschalterSuchfeld {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-block-end: 8px;
  border: 1px solid var(--suite-linie);
  border-radius: 8px;
}

.umschalterSuchfeld input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  color: inherit;
  /* 16px ist die Suite-Untergrenze für Eingabefelder (Suite-Chrome §3). */
  font-size: 16px;
  outline: none;
}

/* Nur Polsterung und Farbe. Die TYPOGRAFIE kommt als Inline-Stil aus
   `SCHRIFT.kicker` (AppUmschalter.tsx) — eine zweite Abschrift der Rolle in
   CSS waere genau die Doppelung, gegen die `core/theme/schrift.ts` gebaut ist. */
.umschalterAbschnitt {
  padding: 8px 8px 4px;
  color: var(--iuk-gedaempft);
}

.umschalterListe {
  display: grid;
  gap: 2px;
  margin-block-end: 8px;
}

.umschalterLeer {
  padding: 12px 8px;
  margin: 0;
  color: var(--iuk-gedaempft);
}

/*
 * DIESELBE AKTIVSPRACHE WIE DIE SEITENLEISTE — 3px linker Akzent in
 * `--iuk-marke` auf getoenter Flaeche. Ein Panel-Eintrag und ein
 * Leisteneintrag bedeuten dasselbe („das ist die Stelle, an der du bist");
 * sie duerfen nicht verschieden aussehen.
 *
 * Der transparente Rahmen steht auch im Ruhezustand, sonst springt die
 * Beschriftung beim Wechsel der aktiven Zeile um 3px zur Seite.
 */
.appEintrag {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-inline-start: 3px solid transparent;
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
}

.appEintrag:hover {
  background: var(--iuk-flaeche-aktiv);
}

.appEintrag[aria-current] {
  border-inline-start-color: var(--iuk-marke);
  background: var(--iuk-flaeche-aktiv);
  font-weight: 600;
}

.appEintragBild {
  inline-size: 20px;
  block-size: 20px;
  object-fit: contain;
}

.appEintragTitel {
  display: block;
}

.appEintragText {
  display: block;
  font-size: 12px;
  color: var(--iuk-gedaempft);
}

/*
 * Die Fußzeile des Panels — „Alle Apps im Portal", in jedem Zustand sichtbar
 * (Begründung an der Stelle in `AppUmschalter.tsx`). Eigene Klasse statt
 * `.appEintrag`: sie gehört nicht zur Liste und trägt kein `aria-current`.
 */
.umschalterFusszeile {
  display: block;
  margin-block-start: 4px;
  padding: 8px 6px;
  border-block-start: 1px solid var(--suite-linie);
  color: var(--iuk-gedaempft);
  text-decoration: none;
  font-size: 13px;
  text-align: center;
}

.umschalterFusszeile:hover {
  color: inherit;
  background: var(--iuk-flaeche-aktiv);
  border-radius: 8px;
}
```

Und im letzten Media-Block am Dateiende die Panelbreite von 360 auf 320 setzen:

```css
@media (min-width: 768px) {
  .umschalterPanel {
    inset-inline: 0 auto;
    inline-size: 320px;
  }
}
```

- [ ] **Schritt 5: `AppUmschalter.tsx` — Kicker-Rolle setzen**

Der Import oben (`SCHRIFT` ist schon importiert, `shell.module.css` auch). Die
Abschnittsüberschrift bekommt die Rolle als Inline-Stil (Zeile 169-171):

```tsx
                  <div
                    data-testid="app-abschnitt"
                    className={s.umschalterAbschnitt}
                    style={SCHRIFT.kicker}
                  >
                    {titel}
                  </div>
```

Begründung als Kommentar direkt darüber:

```tsx
                  {/* Die Rolle als INLINE-STIL, die Polsterung und Farbe als
                      Klasse: `core/theme/schrift.ts` ist die eine Quelle fuer
                      Typografie, und eine zweite Abschrift von `kicker` in
                      `shell.module.css` waere genau die Doppelung, gegen die
                      die Rollen-Datei gebaut ist. `SCHRIFT` liegt in einem
                      Modul ohne `"use client"`; von einer Client-Insel dorthin
                      zu greifen ist die unproblematische Richtung (Falle 6
                      verbietet die umgekehrte). */}
```

- [ ] **Schritt 6: Testlauf, der jetzt durchgehen MUSS**

```bash
rtk pnpm vitest run src/core/shell/shell-css.test.ts src/core/shell/AppUmschalter.test.tsx
```

Erwartet: PASS. Schlägt `AppUmschalter.test.tsx` fehl, weil es auf `.umschalterAbschnitt` ohne
Inline-Stil prüft, ist die Erwartung dort nachzuziehen — die Klasse bleibt, nur die Typografie
wandert.

- [ ] **Schritt 7: Volle Tore**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
```

- [ ] **Schritt 8: Commit**

```bash
rtk git add src/app/globals.css src/core/shell/shell.module.css src/core/shell/AppUmschalter.tsx src/core/shell/shell-css.test.ts src/core/shell/AppUmschalter.test.tsx && rtk git commit -m "fix(shell): der Umschalter erbt keine 64px-Zeilenhoehe mehr

antd setzt auf .ant-layout-header ein line-height in Kopfzeilenhoehe
(layout/style/index.js:50). Der App-Umschalter haengt als DOM-Kind darin;
position:absolute am Panel aendert den enthaltenden Block, nicht die
Vererbungskette. Daraus wurden 82px je Panel-Eintrag und ein 76px hoher
Ausloeser in einer 64px hohen Kopfzeile.

Der schwarze Rahmen war nicht die Ursache, sondern das, was sie sichtbar
machte. Er weicht einer getoenten Flaeche; die Kontur bleibt nur im
geoeffneten Zustand.

--suite-hover wird als --iuk-flaeche-aktiv global, weil die Seitenleiste
denselben Wert braucht und ihn an .umschalter nicht saehe. Fuenf Stellen
faerben Nebentext jetzt ueber --iuk-gedaempft statt ueber Deckkraft.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Aufgabe 2: Ein Navigationsbild — die Seitenleiste für alle

**Dateien:**
- Erstellen: `src/core/shell/SuiteRahmen.tsx`
- Ändern: `src/core/shell/navAbschnitte.ts` (`hatAbschnitte` löschen)
- Ändern: `src/core/shell/SuiteNav.tsx` (`Modulnav` löschen)
- Ändern: `src/core/shell/SuiteHeader.tsx` (zweite Zeile weg)
- Ändern: `src/core/shell/FullShell.tsx`, `src/core/shell/MinimalShell.tsx`
- Ändern: `src/core/shell/shell.module.css` (`.modulnav` weg)
- Test: `src/core/shell/navAbschnitte.test.ts`, `SuiteNav.test.tsx`, `SuiteHeader.test.tsx`,
  `shell-css.test.ts`, `src/app/m/files/_ui/VerwaltungsRahmen.test.tsx`
- E2E anpassen (kein Lauf): `e2e/modulnavigation.spec.ts`, `e2e/shell-mobil.spec.ts`,
  `e2e/lagerbuch-ux.spec.ts`, `e2e/lagerbuch-verwaltung.spec.ts`, `e2e/lagerbuch-mobil.spec.ts`,
  `e2e/portal.spec.ts`, `e2e/launcher.spec.ts`, `e2e/files-hosts.spec.ts`, `e2e/keystone.spec.ts`

**Schnittstellen:**
- Verbraucht: nichts aus Aufgabe 1.
- Erzeugt: `SuiteRahmen({ moduleKey: string, nav?: SuiteNavItem[], children: React.ReactNode })` —
  async Server Component. Aufgabe 5 hängt die Arbeitsdichte in die `children` von `FullShell`,
  **nicht** in `SuiteRahmen`.
- Entfällt: `hatAbschnitte`, `Modulnav`, `data-testid="modulnav"`, CSS-Klasse `.modulnav`.
  `data-testid="modulleiste"` bleibt und ist ab hier der **einzige** Desktop-Träger der
  Modulnavigation.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

In `src/core/shell/navAbschnitte.test.ts` den gesamten `describe`/`it`-Block zu `hatAbschnitte`
löschen und stattdessen ans Dateiende:

```ts
describe("die Bauform haengt nicht mehr an den Daten", () => {
  it("exportiert kein `hatAbschnitte` mehr", async () => {
    /*
     * DIE FORM FOLGTE DEN DATEN — und das war der Fehler. `hatAbschnitte`
     * machte ein OPTIONALES Feld zur Entscheidung ueber die Bauform: mit
     * `abschnitt` eine Seitenleiste, ohne eine zweite Kopfzeile. Fuer die
     * benutzende Person war das nicht ablesbar; sie sah keine Datenlage,
     * sie sah zwei Anwendungen.
     *
     * Seit 2026-08-13 bekommt JEDES Modul mit Navigation die Leiste.
     * `gruppiereNav` bleibt — die Gruppierung INNERHALB der Leiste ist
     * weiterhin datengetrieben, nur nicht mehr die Bauform.
     *
     * Dieser Test faengt das Wiedereinfuehren. Ohne ihn kaeme das Praedikat
     * beim naechsten Modul mit vielen Eintraegen als naheliegende Loesung
     * zurueck.
     */
    const modul = await import("@/core/shell/navAbschnitte");
    expect(Object.keys(modul)).not.toContain("hatAbschnitte");
  });
});
```

In `src/core/shell/shell-css.test.ts` **jetzt** alle sechs `.modulnav`-Tests löschen — sie prüfen
ab Schritt 8 eine Klasse, die es nicht mehr gibt, und `modulnavStruktur` verlangt ausdrücklich
„genau eine Basisregel .modulnav":

- `"laeszt .modulnav waagerecht scrollen statt documentElement"`
- `"animiert das Scrollen der Modulnavigation nicht"`
- `"verwirft eine spaetere .modulnav-Ueberschreibung trotz gruenem Ersttreffer"`
- `"verwirft .modulnav als erstes Kind einer spaeteren Media Query"`
- `"ignoriert Kommentare und aehnlich benannte Klassen bei .modulnav"`
- `"haelt die Modulnavigation unterhalb von 768px aus dem Weg"`

Und mit ihnen die Hilfsfunktionen `modulnavRegeln`, `modulnavStruktur` und
`erwartetRobusteModulnavUeberlaufbehandlung`. `cssRegeln`, `zieltAufKlasse` und
`deklarationsWerte` **bleiben** — Aufgabe 3 baut die drei Kaskaden-Prüfmuster damit auf `.sider`
nach. Die Lücke von einer Aufgabe ist bewusst und benannt: erst ab Aufgabe 3 trägt `.sider` den
Wert (`var(--iuk-kopf)`), gegen den geprüft wird.

Dazu ein neuer Test:

```ts
  it("kennt die Klasse .modulnav nicht mehr", () => {
    /*
     * Die zweite Kopfzeile ist am 2026-08-13 ersatzlos entfallen: jedes Modul
     * mit Navigation traegt die Seitenleiste. Ein Wiederauftauchen der Klasse
     * waere die Rueckkehr zu zwei Navigationsparadigmen — dasselbe Muster wie
     * beim Test `"kennt die Klasse .modulzeile nicht mehr"` darueber.
     */
    expect(OHNE_KOMMENTARE).not.toMatch(/\.modulnav\b/);
  });
```

- [ ] **Schritt 2: Testlauf, der fehlschlagen MUSS**

```bash
rtk pnpm vitest run src/core/shell/navAbschnitte.test.ts src/core/shell/shell-css.test.ts
```

Erwartet: FAIL — `hatAbschnitte` ist noch exportiert, `.modulnav` steht noch im CSS.

- [ ] **Schritt 3: `navAbschnitte.ts` — `hatAbschnitte` löschen**

Die Funktion `hatAbschnitte` (Zeile 22-24) entfernen. Im Dateikopf-Kommentar den Absatz „DIE FORM
FOLGT DEN DATEN, NICHT EINEM SCHWELLENWERT" ersetzen durch:

```
/**
 * DIE GRUPPIERUNG INNERHALB DER LEISTE — nicht mehr die Bauform.
 *
 * Hier stand bis 2026-08-13 zusaetzlich `hatAbschnitte`, und daraus leiteten
 * `SuiteHeader` und `FullShell` ZWEI Bauformen ab: mit `abschnitt` eine
 * Seitenleiste, ohne eine zweite Kopfzeile. Das war in sich schluessig und
 * trotzdem der Fehler — ein optionales Feld entschied, ob dasselbe Produkt
 * links oder oben navigiert. Seither bekommt jedes Modul mit Navigation die
 * Leiste, und diese Datei beantwortet nur noch, wie ihre Eintraege darin
 * gruppiert sind.
 *
 * KEIN `"use client"`: `Modulleiste` ist zwar eine Client-Komponente, aber der
 * Typ `SuiteNavItem` wird auch von Server Components gelesen. Ein `"use
 * client"` hier ergaebe dort eine Client-Referenz statt der Funktion — HTTP
 * 500, das kein Gate sieht (`docs/design/README.md`, Falle 6).
 */
```

- [ ] **Schritt 4: `SuiteNav.tsx` — `Modulnav` löschen**

Die gesamte Komponente `Modulnav` samt ihrem Kommentarblock (heute Zeile 188-218) entfernen.
`navLinks` bleibt — es hat mit `navGruppen` weiterhin einen Aufrufer. Den `usePathname`-Import
behalten (`SuiteNav` selbst benutzt ihn).

Im Kommentar an `navLinks` (Zeile 108-132) den Satz „geteilt zwischen der zweiten Zeile
(`Modulnav`, unter der Kopfzeile) und dem Drawer (mobil)" ersetzen durch „geteilt zwischen der
Seitenleiste (`Modulleiste`) und dem Drawer (mobil)".

- [ ] **Schritt 5: `SuiteHeader.tsx` — zweite Zeile entfernen**

Die Imports `Modulnav` und `hatAbschnitte` entfernen (Zeile 17-18 anpassen: nur noch
`import { SuiteNav } from "@/core/shell/SuiteNav";`). Das JSX am Ende (Zeile 127-130) löschen:

```tsx
      {/* Zweite Zeile NUR ohne Abschnitte. … */}
      {hatAbschnitte(nav) ? null : <Modulnav nav={nav} />}
```

Und den Kommentarblock „ZWEI GESCHWISTER, NICHT EIN VERSCHACHTELTER BLOCK" (Zeile 56-72) ersetzen
durch:

```tsx
  /*
   * NUR NOCH DIE KOPFZEILE. Bis 2026-08-13 stand hier eine zweite Zeile mit
   * der Modulnavigation, wenn diese keine Abschnitte trug. Sie ist ersatzlos
   * entfallen — die Navigation liegt jetzt in jedem Modul in der Seitenleiste
   * (`SuiteRahmen`), mobil im Drawer.
   *
   * Der historische Grund fuer die zweite ZEILE (statt einer dritten Spalte im
   * Kopf) bleibt lesenswert, weil er die heutige Kopfzeile erklaert: als
   * drittes Flex-Kind von `.kopf` konkurrierte die Navigation mit dem Titel um
   * die Breite und drueckte ihn zwischen 768px und 903px auf 0px — die Seite
   * scrollte seitwaerts (rechte Kante 904px, gemessen). Deshalb steht in
   * `.kopf` heute nur noch der Umschalter und `.rechts`, und `headerHeight`
   * bleibt 64.
   */
```

- [ ] **Schritt 6: `SuiteRahmen.tsx` anlegen**

```tsx
import { Layout } from "antd";
// Siehe SuiteHeader.tsx: direkte Named-Imports aus dem tiefen Pfad, nicht
// `Layout.Content` / `Layout.Sider` — Property-Zugriffe auf antd-Compounds
// ergeben in einer Server Component `undefined` und HTTP 500 (Falle 1).
// `Sider` liegt in einer eigenen Datei neben `layout.js`.
import { Content } from "antd/es/layout/layout";
import Sider from "antd/es/layout/Sider";

import { SuiteHeader } from "@/core/shell/SuiteHeader";
import { Modulleiste } from "@/core/shell/Modulleiste";
import type { SuiteNavItem } from "@/core/shell/types";
import { SPACE } from "@/core/theme/tokens";
import s from "./shell.module.css";

/**
 * DAS GERUEST, DAS `FullShell` UND `MinimalShell` TEILEN — Kopfzeile,
 * optionale Seitenleiste, Inhalt.
 *
 * Bis 2026-08-13 hatte jede der beiden Varianten ihr eigenes Geruest, und die
 * Seitenleiste gab es nur in `FullShell` und nur, wenn die Navigation
 * Abschnitte trug (`hatAbschnitte`, geloescht). Module auf `MinimalShell` —
 * `qr` und `beta` — bekamen ihre Navigation als zweite Kopfzeile. Zwei
 * Bauformen fuer dieselbe Sache; wer die zweite Zeile ersatzlos loeschte,
 * haette `qr` seine Navigation genommen.
 *
 * WAS DIE BEIDEN VARIANTEN NOCH UNTERSCHEIDET, steht deshalb nicht mehr hier,
 * sondern in ihren `children`: `FullShell` legt die Arbeitsdichte darum,
 * `MinimalShell` eine 640px-Spalte. Beides sind Eigenschaften des INHALTS,
 * nicht des Rahmens.
 *
 * DIE LEISTE HAENGT AN `nav.length > 0`, nicht an einem Praedikat ueber den
 * Daten. Ein Modul ohne Navigation (`alpha`, `gamma`, `beta`, `kioskdemo`)
 * bekommt gar keine Leiste und keinen leeren Streifen daneben.
 *
 * Unterhalb von 768px steht die Leiste auf `display: none` (`shell.module.css`)
 * und die Navigation liegt im Drawer. Die Umschaltung ist CSS und nie antds
 * `breakpoint`-Prop am Sider: das laeuft ueber JS und zeigt beim ersten Render
 * die falsche Variante.
 */
export async function SuiteRahmen({
  moduleKey,
  nav = [],
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <SuiteHeader moduleKey={moduleKey} nav={nav} />
      <Layout>
        {nav.length > 0 ? (
          <Sider width={240} theme="light" className={s.sider}>
            <Modulleiste nav={nav} />
          </Sider>
        ) : null}
        <Content style={{ padding: SPACE.lg }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
```

- [ ] **Schritt 7: `FullShell.tsx` und `MinimalShell.tsx` auf den Rahmen setzen**

`FullShell.tsx` vollständig ersetzen:

```tsx
import { SuiteRahmen } from "@/core/shell/SuiteRahmen";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Arbeitsflaechen-Variante: voller Inhaltsbreite, Seitenleiste wenn das
 * Modul eine Navigation uebergibt. Das Geruest teilt sie sich mit
 * `MinimalShell` (`SuiteRahmen`); der Unterschied liegt allein im Inhalt.
 *
 * Die Bediendichte kommt in Aufgabe 5 hier dazu.
 */
export async function FullShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  return (
    <SuiteRahmen moduleKey={moduleKey} nav={nav}>
      {children}
    </SuiteRahmen>
  );
}
```

`MinimalShell.tsx` vollständig ersetzen:

```tsx
import { SuiteRahmen } from "@/core/shell/SuiteRahmen";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Wie `FullShell`, nur mit begrenzter Inhaltsbreite — und mit dem
 * Handschuh-Masz, das die Suite ueberall vorgibt (`controlHeight: 56`). Genau
 * das ist ab 2026-08-13 der Unterschied: `FullShell` legt fuer die
 * Schreibtischarbeit eine dichtere Bediendichte darueber, `MinimalShell` nicht.
 * `qr` und `beta` sind Einsatzformulare.
 *
 * Die Seitenleiste bekommt diese Variante seither ebenfalls — `qr` uebergibt
 * eine Navigation („Generator" / „Verwaltung"), und die stand vorher als
 * zweite Kopfzeile da.
 *
 * `data-testid="minimal-shell"` bleibt: `e2e/qr.spec.ts` fragt es ab.
 */
export async function MinimalShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  return (
    <SuiteRahmen moduleKey={moduleKey} nav={nav}>
      <div data-testid="minimal-shell" style={{ maxWidth: 640, marginInline: "auto" }}>
        {children}
      </div>
    </SuiteRahmen>
  );
}
```

> **Achtung:** `data-testid="minimal-shell"` saß bisher am äußeren `<Layout>`. Es wandert auf den
> Inhaltsknoten. Prüfe mit `rtk grep -rn "minimal-shell" e2e src`, ob eine Zusicherung von der
> Position abhängt (z. B. eine Höhenmessung); ist das so, ziehe sie im selben Schritt nach.

- [ ] **Schritt 8: `.modulnav` aus dem CSS entfernen**

In `src/core/shell/shell.module.css` den gesamten `.modulnav`-Block (heute Zeile 137-183) löschen
und im Media-Block bei Zeile 273-275 den Eintrag `.modulnav { display: flex; }` ebenfalls.

- [ ] **Schritt 9: Vitest-Nachzug**

```bash
rtk pnpm vitest run
```

`SuiteNav.test.tsx` importiert `Modulnav` — den Import und alle `Modulnav`-Tests entfernen.
`SuiteHeader.test.tsx` prüft auf `data-testid="modulnav"` — diese Zusicherungen entfernen und
durch eine ersetzen, die festhält, dass der Kopf **nur noch** die Kopfzeile trägt:

```ts
  it("rendert keine zweite Zeile mehr unter der Kopfzeile", async () => {
    // Die Modulnavigation liegt seit 2026-08-13 in der Seitenleiste
    // (`SuiteRahmen`), auf jeder Groesze und in jedem Modul. Eine zweite Zeile
    // hier waere dieselbe Aussage an zwei Stellen, mit zwei Aktivmarkierungen.
    await zeichne({ nav: NAV_MIT_ABSCHNITTEN });
    expect(exists('[data-testid="modulnav"]')).toBe(false);
  });
```

`src/app/m/files/_ui/VerwaltungsRahmen.test.tsx` prüft auf `hatAbschnitte`/`modulnav` — nachziehen.

- [ ] **Schritt 10: E2E-Dateien anpassen (ohne Lauf)**

```bash
rtk grep -rn "modulnav" e2e
```

Jede Fundstelle auf `[data-testid="modulleiste"]` umstellen. `e2e/modulnavigation.spec.ts` prüft
heute beide Bauformen; die Fallunterscheidung entfällt — es bleibt die Leiste. Die mobilen
Zusicherungen (Drawer) bleiben unverändert.

**Nicht laufen lassen** — der gebündelte Lauf ist Aufgabe 6.

- [ ] **Schritt 11: Volle Tore**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
```

`pnpm build` ist hier zusätzlich dabei: `SuiteRahmen` ist neu und importiert zwei antd-Deep-Pfade;
ein Tippfehler darin ist ein Build-Fehler, kein Laufzeitfehler.

- [ ] **Schritt 12: Commit**

```bash
rtk git add -A src/core/shell e2e src/app/m/files/_ui/VerwaltungsRahmen.test.tsx && rtk git commit -m "feat(shell): ein Navigationsbild — die Seitenleiste fuer jedes Modul

hatAbschnitte machte ein optionales Feld zur Entscheidung ueber die
Bauform: mit abschnitt eine Seitenleiste, ohne eine zweite Kopfzeile. Fuer
die benutzende Person war das nicht ablesbar — sie sah keine Datenlage,
sie sah zwei Anwendungen.

Das Praedikat und die Komponente Modulnav entfallen ersatzlos. FullShell
und MinimalShell teilen sich ein neues Geruest SuiteRahmen und
unterscheiden sich nur noch im Inhalt; qr und beta behalten dadurch ihre
Navigation, die vorher an der zweiten Zeile hing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Aufgabe 3: Die Kopfzeile steht

**Dateien:**
- Ändern: `src/core/shell/SuiteHeader.tsx`
- Ändern: `src/core/shell/shell.module.css`
- Test: `src/core/shell/shell-css.test.ts`

**Schnittstellen:**
- Erzeugt: CSS-Klasse `.kopfBlock` (klebender Wrapper um Streifen + Kopfzeile) und CSS-Variable
  `--iuk-kopf` an `.sider`. Aufgabe 4 benutzt `--iuk-kopf` für Höhe und Klebekante.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

In `src/core/shell/shell-css.test.ts`, nach dem Test `"klebt die Seitenleiste ab 768px unter der
Kopfzeile fest"`:

```ts
  it("rechnet `--iuk-kopf` aus headerHeight UND Streifenhoehe", async () => {
    /*
     * DIE LEISTE KLEBTE AN DER FALSCHEN KANTE, und beides war falsch.
     *
     * Sie stand auf `inset-block-start: 64px` — dem Wert von
     * `Layout.headerHeight`. Ueber der Kopfzeile steht aber zusaetzlich der
     * 5px hohe Markenstreifen, und die Kopfzeile war ueberhaupt nicht
     * klebend: beim Scrollen wanderte sie weg und ueber der Leiste stand ein
     * 64px hohes Loch.
     *
     * Seit 2026-08-13 klebt der ganze Kopfblock (Streifen + Kopfzeile) und die
     * Leiste darunter bei 69px. Die Zahl faellt aus zwei Groeszen, die es
     * schon gibt — und genau die Situation „eine dritte Zahl laeuft still
     * daneben" ist der Befund, den dieser Test verriegelt.
     *
     * CSS kann die TypeScript-Konstante nicht lesen, dieser Test schon: er
     * liest `headerHeight` aus `buildTheme` und die Streifenhoehe aus dem CSS
     * und haelt die Summe gegen `--iuk-kopf`.
     */
    const { buildTheme } = await import("@/core/theme/theme");
    const headerHeight = buildTheme("light").components?.Layout?.headerHeight;
    expect(typeof headerHeight, "Layout.headerHeight fehlt in buildTheme").toBe("number");

    const streifen = /\.streifen\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(streifen, "Klasse .streifen fehlt").not.toBeNull();
    const streifenHoehe = /height:\s*(\d+)px/.exec(streifen![1]);
    expect(streifenHoehe, ".streifen hat keine Hoehe in px").not.toBeNull();

    const kopf = /--iuk-kopf:\s*(\d+)px/.exec(OHNE_KOMMENTARE);
    expect(kopf, "Variable --iuk-kopf fehlt").not.toBeNull();
    expect(Number(kopf![1])).toBe(Number(headerHeight) + Number(streifenHoehe![1]));
  });

  it("laeszt den Kopfblock kleben, nicht nur die Leiste", () => {
    /*
     * Ohne das ist `--iuk-kopf` eine richtige Zahl fuer eine falsche Annahme:
     * die Leiste klebt bei 69px unter einer Kopfzeile, die weggescrollt ist.
     *
     * Der Streifen klebt NICHT selbst, er sitzt im selben klebenden Block —
     * zwei unabhaengig klebende Elemente waeren zwei Zahlen statt einer.
     *
     * `z-index` ist noetig, weil ein klebender Knoten ohne ihn von spaeterem
     * Inhalt ueberzeichnet wird. Er erzeugt zugleich einen Stapelkontext, in
     * dem `.umschalterFang` (900) und `.umschalterPanel` (901) liegen — beide
     * bleiben damit ueber dem Seiteninhalt (auto = 0), und antds Drawer (1000,
     * ins `body` portalisiert) bleibt darueber. Wer diese Zahl senkt, prueft
     * alle drei.
     */
    const regel = /\.kopfBlock\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Klasse .kopfBlock fehlt").not.toBeNull();
    expect(regel![1]).toMatch(/position:\s*sticky/);
    expect(regel![1]).toMatch(/inset-block-start:\s*0/);
    expect(regel![1]).toMatch(/z-index:\s*\d+/);
  });
```

**Und im selben Schritt die drei Kaskaden-Prüfmuster nachbauen**, die mit `.modulnav` in Aufgabe 2
weggefallen sind. Sie prüfen eine **Klasse von Fehlern**, nicht eine Klasse dieses Namens — und
`.sider` ist ab jetzt der einzige Desktop-Träger der Navigation, also genau der Ort, an dem eine
stille `display`-Überschreibung am teuersten wäre. Nach `zieltAufKlasse` in die Hilfsfunktionen:

```ts
function siderRegeln(css: string): CssRegel[] {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return cssRegeln(ohneKommentare).filter((regel) => zieltAufKlasse(regel.selektor, "sider"));
}

/**
 * DIE DREI KASKADEN-PRUEFMUSTER, UEBERNOMMEN VON `.modulnav`.
 *
 * Sie pruefen eine KLASSE VON FEHLERN: ein gruener Ersttreffer, hinter dem eine
 * spaetere Regel dieselbe Eigenschaft still ueberschreibt. Mit dem Wegfall der
 * zweiten Kopfzeile (2026-08-13) waeren sie sonst ersatzlos verloren gewesen.
 *
 * Die Invarianten: genau EIN `display`-Wert vor dem Breakpoint (`none`), genau
 * EINER darin (`block`), genau EIN `inset-block-start`. Eine zweite Regel mit
 * demselben Wert ist ebenso ein Kaskadenrisiko wie eine mit `initial`.
 *
 * Die Media Query wird erst AB der Position der `.sider`-Basisregel gesucht:
 * die Basisregel steht selbst HINTER dem ersten `(min-width: 768px)`-Block
 * (`.rechts .nurMobil` & Co.). Eine Suche ab der ersten Fundstelle schnitte
 * sie nicht ab, und der folgende `.sider`-Treffer waere der FALSCHE. Genau
 * diese Falle steht schon am Test „klebt die Seitenleiste ab 768px fest".
 */
function erwartetRobusteSiderUmschaltung(css: string) {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const basisIndex = ohneKommentare.indexOf(".sider {");
  expect(basisIndex, "Basisregel .sider fehlt").toBeGreaterThanOrEqual(0);

  const mediaStart = ohneKommentare.indexOf("@media (min-width: 768px)", basisIndex);
  expect(mediaStart, "Desktop-Breakpoint nach der .sider-Basisregel fehlt").toBeGreaterThanOrEqual(0);

  const basis = siderRegeln(ohneKommentare.slice(basisIndex, mediaStart));
  expect(basis, "vor der Media Query muss genau eine Basisregel .sider stehen").toHaveLength(1);
  expect(deklarationsWerte(basis, "display")).toEqual(["none"]);

  const desktop = siderRegeln(ohneKommentare.slice(mediaStart));
  expect(desktop, "ab 768px muss genau eine Regel .sider stehen").toHaveLength(1);
  expect(deklarationsWerte(desktop, "display")).toEqual(["block"]);
  expect(deklarationsWerte(siderRegeln(ohneKommentare), "inset-block-start")).toEqual([
    "var(--iuk-kopf)",
  ]);

  return { basis: basis[0], desktop: desktop[0] };
}
```

und die drei Tests dazu:

```ts
  it("verwirft eine spaetere `.sider`-Ueberschreibung trotz gruenem Ersttreffer", () => {
    const mutation = `${OHNE_KOMMENTARE}
      .sider {
        display: none;
        inset-block-start: 0;
      }
    `;

    // Genau der naive Ersttreffer: er bleibt gruen und sieht die spaetere
    // Kaskaden-Ueberschreibung nicht.
    const ersterTreffer = /\.sider\s*\{([^}]*)\}/.exec(mutation);
    expect(ersterTreffer, "Basisregel .sider fehlt").not.toBeNull();
    expect(ersterTreffer![1]).toMatch(/display:\s*none/);

    expect(() => erwartetRobusteSiderUmschaltung(mutation)).toThrow();
  });

  it("verwirft `.sider` als erstes Kind einer spaeteren Media Query", () => {
    const mutation = `${OHNE_KOMMENTARE}
      @media (min-width: 768px) {
        .sider {
          display: none;
        }
      }
    `;
    expect(() => erwartetRobusteSiderUmschaltung(mutation)).toThrow();
  });

  it("ignoriert Kommentare und aehnlich benannte Klassen bei .sider", () => {
    const nurNamen = `${CSS}
      /* .sider { display: none; } */
      .siderleiste { display: none; }
      .nicht-sider { display: none; }
    `;
    expect(() => erwartetRobusteSiderUmschaltung(nurNamen)).not.toThrow();
  });
```

Der bestehende Test `"klebt die Seitenleiste ab 768px unter der Kopfzeile fest"` prüft heute
`inset-block-start: 64px` als Literal. Er wird auf `var(--iuk-kopf)` umgestellt; die Zahl selbst
prüft ab jetzt der erste neue Test.

- [ ] **Schritt 2: Testlauf, der fehlschlagen MUSS**

```bash
rtk pnpm vitest run src/core/shell/shell-css.test.ts
```

Erwartet: FAIL — `--iuk-kopf` und `.kopfBlock` gibt es nicht, und `.sider` trägt noch `64px` statt
der Variablen.

- [ ] **Schritt 3: `.kopfBlock` im CSS anlegen**

In `src/core/shell/shell.module.css` direkt **vor** `.streifen`:

```css
/*
 * DER KLEBENDE KOPFBLOCK — Markenstreifen und Kopfzeile als eine Einheit.
 *
 * Vorher klebte nur die Seitenleiste (`inset-block-start: 64px`), waehrend die
 * Kopfzeile mitscrollte: beim Scrollen stand ueber der Leiste ein 64px hohes
 * Loch. Und die 64 war zusaetzlich zu klein, weil der Streifen darueber steht.
 *
 * EIN Block statt zweier klebender Elemente: sonst waeren zwei Zahlen zu
 * pflegen statt einer, und `--iuk-kopf` (an `.sider`) muesste beide kennen.
 *
 * `z-index` erzeugt hier einen Stapelkontext. Das ist gewollt und in
 * `shell-css.test.ts` ausgeschrieben: `.umschalterFang` (900) und
 * `.umschalterPanel` (901) liegen darin und bleiben ueber dem Seiteninhalt
 * (`auto` = 0); antds Drawer wird ins `body` portalisiert und liegt darueber.
 */
.kopfBlock {
  position: sticky;
  inset-block-start: 0;
  z-index: 100;
}
```

- [ ] **Schritt 4: `--iuk-kopf` an `.sider` deklarieren und benutzen**

Die Basisregel `.sider` erweitern:

```css
.sider {
  /*
   * 64px Kopfzeile (`Layout.headerHeight`, core/theme/theme.ts) + 5px
   * Markenstreifen (`.streifen` oben). Die Summe steht hier EINMAL; ein
   * zweiter Ort dafuer ist genau der Fehler, den `shell-css.test.ts` mit
   * „rechnet --iuk-kopf aus headerHeight UND Streifenhoehe" verriegelt.
   *
   * An `.sider` und nicht an `:root`: ein CSS-Modul kann `:root` nicht scopen,
   * und `.sider` ist der einzige Konsument.
   */
  --iuk-kopf: 69px;

  display: none;
}
```

Und im Media-Block:

```css
@media (min-width: 768px) {
  .sider {
    display: block;
    position: sticky;
    inset-block-start: var(--iuk-kopf);
    block-size: calc(100vh - var(--iuk-kopf));
    overflow-y: auto;
  }
}
```

- [ ] **Schritt 5: `SuiteHeader.tsx` — den Block umschließen**

Das `<>…</>`-Fragment durch den Block ersetzen:

```tsx
  return (
    <div className={s.kopfBlock}>
      {/* Vor der Kopfzeile, nicht darin: eine Kante an der antd-Flaeche waere ein
          Spezifitaetsstreit, ein eigenes Element ist keiner. `aria-hidden`, weil
          der Streifen reine Marke ist und nichts vorliest. */}
      <div className={s.streifen} aria-hidden="true" />
      <Header data-testid="suite-header" className={s.kopf}>
        {/* … unveraendert … */}
      </Header>
    </div>
  );
```

`data-testid="suite-header"` bleibt am `<Header>` — der 390px-Höhentest misst diesen Knoten und
soll weiterhin nur die Kopfzeile messen, nicht den Streifen.

- [ ] **Schritt 6: Testlauf, der jetzt durchgehen MUSS**

```bash
rtk pnpm vitest run src/core/shell/shell-css.test.ts src/core/shell/SuiteHeader.test.tsx
```

- [ ] **Schritt 7: Volle Tore**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
```

- [ ] **Schritt 8: Commit**

```bash
rtk git add src/core/shell && rtk git commit -m "fix(shell): die Kopfzeile klebt, und die Leiste an der richtigen Kante

Die Seitenleiste stand auf inset-block-start: 64px unter einer Kopfzeile,
die gar nicht klebte — beim Scrollen stand ueber ihr ein 64px hohes Loch.
Die 64 war zusaetzlich zu klein: ueber der Kopfzeile steht der 5px hohe
Markenstreifen.

Streifen und Kopfzeile bilden jetzt einen klebenden Block, die Leiste
haengt an --iuk-kopf (69px). shell-css.test.ts rechnet die Zahl aus
Layout.headerHeight und der Streifenhoehe nach, damit keine dritte still
danebenlaeuft.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Aufgabe 4: Die Seitenleiste sieht aus wie eine Seitenleiste

**Dateien:**
- Ändern: `src/core/shell/shell.module.css`
- Ändern: `src/core/shell/SuiteNav.tsx` (`navGruppen` setzt Kicker)
- Test: `src/core/shell/shell-css.test.ts`, `src/core/shell/Modulleiste.test.tsx`

**Schnittstellen:**
- Verbraucht: `--iuk-flaeche-aktiv` (Aufgabe 1), `--iuk-kopf` (Aufgabe 3).
- Erzeugt: nichts, was spätere Aufgaben lesen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

In `src/core/shell/shell-css.test.ts` kommen nur noch die **optischen** Zusicherungen dazu — die
Kaskaden-Prüfmuster und `erwartetRobusteSiderUmschaltung` stehen seit Aufgabe 3:

```ts
  it("markiert den aktiven Eintrag mit linkem Akzent statt Unterstrich", () => {
    /*
     * `border-block-end` war das richtige Zeichen fuer eine WAAGERECHTE Leiste.
     * In der Seitenleiste zog derselbe Selektor einen roten Strich UNTER dem
     * aktiven Eintrag ueber die volle Leistenbreite — er las sich als
     * Trennlinie zwischen zwei Gruppen, nicht als Auswahl. Im gemeldeten
     * Screenshot stand er unter „Uebersicht" und direkt ueber der Ueberschrift
     * „Bestand", was die Fehldeutung noch verstaerkte.
     *
     * `--iuk-marke` und nicht `--ant-color-primary`: eigenes Markup sieht antds
     * Variablen nicht (Falle 2), die Markierung verloere ihren Farbkanal.
     *
     * `font-weight: 600` BLEIBT und ist nicht redundant: es ist der Traeger,
     * der uebrig bleibt, wenn der Farbkanal ausfaellt — technisch (unaufgeloeste
     * Variable) wie beim Leser (Rot-Gruen-Blindheit, Graustufen). Bedeutung nie
     * allein ueber Farbe.
     */
    const regel = /\.navLink\[aria-current\]\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Regel `.navLink[aria-current]` fehlt").not.toBeNull();
    expect(regel![1], "waagerechtes Aktiv-Idiom in einer senkrechten Liste").not.toMatch(
      /border-block-end/,
    );
    expect(regel![1]).toMatch(/border-inline-start-color:\s*var\(--iuk-marke\)/);
    expect(regel![1]).toMatch(/background:\s*var\(--iuk-flaeche-aktiv\)/);
    // DIE TEXTFARBE, und der Anker ist keine Feinheit: ein nacktes `/color:/`
    // matcht false-positiv in `border-inline-start-color:` und bleibt gruen,
    // auch wenn `color` gar nicht mehr dasteht. Dieselbe Anker-Konvention wie
    // in `deklarationsWerte` weiter oben. Die Textfarbe traegt die
    // 4.5:1-Rechnung in `globals.css` — die Akzentlinie tut das nicht.
    expect(regel![1]).toMatch(/(?:^|;)\s*color:\s*var\(--iuk-marke\)/);
    expect(regel![1]).toMatch(/font-weight:\s*600/);
  });

  it("haelt den Ruhezustand auf demselben linken Rand wie den aktiven", () => {
    // Ohne den transparenten Rahmen springt die Beschriftung beim Wechsel der
    // aktiven Zeile um 3px zur Seite.
    const regel = /\.navLink\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Klasse .navLink fehlt").not.toBeNull();
    expect(regel![1]).toMatch(/border-inline-start:\s*3px solid transparent/);
  });

  it("gibt der Leiste eine dichtere Zeile als dem Drawer", () => {
    /*
     * `.navLink` bleibt in seiner Basis auf 56px — das ist der Drawer, und dort
     * ist es ein Finger (`TAP` in core/theme/tokens.ts, Einsatzanforderung).
     * Die Leiste existiert unterhalb von 768px gar nicht und wird mit Maus
     * bedient; 40px ist antds eigenes Masz.
     *
     * `.modulleiste .navLink` ist (0,2,0). Die Verschachtelung ist NICHT
     * Ballast: `.navLink` allein waere (0,1,0) und stuende gleichauf mit der
     * Basisregel — bei Gleichstand entschiede die Reihenfolge. Sie ist auch
     * kein Spezifitaetsstreit mit antd: `<a>` aus `next/link` traegt keine
     * antd-Klasse. Wer sie entfernt, macht aus einer Regel eine Wette.
     */
    const regel = /\.modulleiste\s+\.navLink\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Regel `.modulleiste .navLink` fehlt").not.toBeNull();
    expect(regel![1]).toMatch(/min-height:\s*40px/);

    const basis = /\.navLink\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(basis![1], "der Drawer braucht das Tap-Masz").toMatch(/min-height:\s*56px/);
  });

  it("setzt die Leiste mit einer Kante vom Inhalt ab", () => {
    // Ohne sie steht die Leiste ohne erkennbaren Grund neben dem Inhalt —
    // die zweite Haelfte von „passt nicht hinein". `--iuk-linie` gibt es
    // global mit Dunkelzweig; `--ant-*` saehe eigenes Markup nicht (Falle 2).
    const { desktop } = erwartetRobusteSiderUmschaltung(OHNE_KOMMENTARE);
    expect(desktop.deklarationen).toMatch(/border-inline-end:\s*1px solid var\(--iuk-linie\)/);
  });
```

Die alten `.modulnav`-Tests sind bereits in Aufgabe 2 gelöscht — hier ist nichts mehr zu entfernen.

- [ ] **Schritt 2: Testlauf, der fehlschlagen MUSS**

```bash
rtk pnpm vitest run src/core/shell/shell-css.test.ts
```

- [ ] **Schritt 3: Das CSS der Leiste umbauen**

Ersetze in `src/core/shell/shell.module.css` die Blöcke `.navLink`, `.navLink[aria-current]`,
`.modulleiste`, `.navGruppe`, `.navGruppe + .navGruppe`, `.navAbschnitt` sowie den
`.sider`-Media-Block durch:

```css
/*
 * Die Modulnavigation ist `next/link` und damit rohes Markup — antds
 * Button-Aussehen faellt hier weg und muss gesetzt werden. Bewusst KEINE
 * `--ant-*`-Variablen: die sieht eigenes Markup nicht (der Fehler waere still).
 * `currentColor` erbt die Schriftfarbe und traegt damit hell wie dunkel, ohne
 * eine zweite Farbquelle aufzumachen.
 *
 * `min-height: 56px` ist das Touch-Masz der Suite (`TAP` in core/theme/tokens)
 * und gilt hier fuer den DRAWER. Die Seitenleiste ueberschreibt es weiter unten
 * auf 40px — sie existiert unterhalb von 768px gar nicht und wird mit Maus
 * bedient.
 *
 * `flex` und nicht `inline-flex`: fuer ein Flex-Kind ist das dasselbe
 * (Flex-Items werden blockifiziert, CSS Display Module Level 3) — `flex` sagt
 * die Absicht nur direkter, diese Zeile ist eine Listenzeile, kein
 * Inline-Element.
 */
.navLink {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding-inline: 12px;
  border-inline-start: 3px solid transparent;
  border-radius: 6px;
  color: inherit;
  text-decoration: none;
}

.navLink:hover {
  background: var(--iuk-flaeche-aktiv);
}

/*
 * `[aria-current]` OHNE Wert, und das ist Absicht: der Wert ist `"page"` auf der
 * aufgerufenen Seite und `"true"` auf einer Seite, die nur zum Abschnitt gehoert
 * (SuiteNav.tsx, `aktiverEintrag`). Optisch ist beides dieselbe Hervorhebung;
 * ein Selektor auf `="page"` liesze die Abschnitts-Markierung still verschwinden.
 *
 * LINKER AKZENT STATT UNTERSTRICH, seit 2026-08-13. `border-block-end` war das
 * richtige Zeichen fuer eine waagerechte Leiste; in der senkrechten Liste zog
 * derselbe Selektor einen roten Strich ueber die volle Leistenbreite, der sich
 * als Trennlinie las. Dieselbe Aktivsprache traegt jetzt auch der App-Umschalter
 * (`.appEintrag[aria-current]`) — ein Panel-Eintrag und ein Leisteneintrag
 * bedeuten dasselbe.
 *
 * FALLS `--iuk-marke` NICHT AUFLOEST — die Variable fehlt, ist umbenannt, oder
 * `globals.css` kommt nicht an —, faellt der Akzent auf `transparent` zurueck
 * (die 3px bleiben als Leerraum) und `color` auf die geerbte Schriftfarbe. Der
 * Ausfall ist still (Falle 2).
 *
 * `font-weight: 600` BLEIBT und ist nicht redundant: es ist der Traeger, der
 * uebrig bleibt, wenn der Farbkanal ausfaellt — technisch wie beim Leser (bei
 * Rot-Gruen-Blindheit und in Graustufen traegt Farbe hier nichts). Bedeutung nie
 * allein ueber Farbe.
 */
.navLink[aria-current] {
  border-inline-start-color: var(--iuk-marke);
  background: var(--iuk-flaeche-aktiv);
  color: var(--iuk-marke);
  font-weight: 600;
}

.modulleiste {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 8px;
}

/*
 * 40px STATT 56 — Begruendung im gleichnamigen Test in `shell-css.test.ts`.
 * Der `.modulleiste`-Praefix ist (0,2,0) und traegt die Regel; ohne ihn stuende
 * sie gleichauf mit der Basisregel und die Reihenfolge entschiede.
 */
.modulleiste .navLink {
  min-height: 40px;
}

.navGruppe {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/*
 * 20px = SPACE.lg + SPACE.xs. Keine neue Zahl, eine Summe zweier vorhandener
 * (`core/theme/tokens.ts`). Bei 40px-Zeilen muss die Trennung ZWISCHEN Gruppen
 * deutlich groeszer sein als die zwischen Zeilen (2px), sonst zerfaellt die
 * Ordnung — 16px waren dafuer zu wenig.
 */
.navGruppe + .navGruppe {
  margin-block-start: 20px;
}

/* Nur Polsterung und Farbe. Die TYPOGRAFIE kommt als Inline-Stil aus
   `SCHRIFT.kicker` (`navGruppen` in SuiteNav.tsx) — dieselbe Aufteilung wie
   bei `.umschalterAbschnitt`, und aus demselben Grund: `core/theme/schrift.ts`
   ist die eine Quelle. */
.navAbschnitt {
  padding: 4px 12px;
  color: var(--iuk-gedaempft);
}

@media (min-width: 768px) {
  .sider {
    display: block;
    position: sticky;
    inset-block-start: var(--iuk-kopf);
    block-size: calc(100vh - var(--iuk-kopf));
    overflow-y: auto;
    /* Ohne sie steht die Leiste ohne erkennbaren Grund neben dem Inhalt.
       `--iuk-linie` gibt es global mit Dunkelzweig; `--ant-*` saehe eigenes
       Markup nicht (Falle 2). */
    border-inline-end: 1px solid var(--iuk-linie);
  }
}
```

`.drawerTitel` bleibt unverändert.

- [ ] **Schritt 4: `navGruppen` setzt die Kicker-Rolle**

In `src/core/shell/SuiteNav.tsx` den Import ergänzen:

```tsx
import { SCHRIFT } from "@/core/theme/schrift";
```

und in `navGruppen` die Überschrift:

```tsx
        <div data-testid="nav-abschnitt" className={s.navAbschnitt} style={SCHRIFT.kicker}>
          {gruppe.titel}
        </div>
```

- [ ] **Schritt 5: Testlauf, der jetzt durchgehen MUSS**

```bash
rtk pnpm vitest run src/core/shell/shell-css.test.ts src/core/shell/Modulleiste.test.tsx src/core/shell/SuiteNav.test.tsx
```

- [ ] **Schritt 6: Volle Tore**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
```

- [ ] **Schritt 7: Commit**

```bash
rtk git add src/core/shell && rtk git commit -m "fix(shell): die Leiste bekommt ein senkrechtes Aktiv-Idiom

border-block-end war das richtige Zeichen fuer eine waagerechte Leiste. In
der senkrechten Liste zog derselbe Selektor einen roten Strich ueber die
volle Leistenbreite, der sich als Trennlinie zwischen zwei Gruppen las —
nicht als Auswahl. Jetzt 3px linker Akzent auf getoenter Flaeche, dieselbe
Sprache wie im App-Umschalter.

Dazu: 40px Zeilen in der Leiste (der Drawer behaelt 56), eine Kante zum
Inhalt, Gruppenabstand 20 statt 16, und die Abschnittsueberschriften
tragen SCHRIFT.kicker statt einer CSS-Abschrift.

Die drei Kaskaden-Pruefmuster von .modulnav ziehen auf .sider um — sie
pruefen eine Klasse von Fehlern, nicht eine Klasse dieses Namens.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Aufgabe 5: Zwei Bediendichten

**Dateien:**
- Ändern: `src/core/theme/theme.ts`
- Erstellen: `src/core/theme/Arbeitsdichte.tsx`
- Ändern: `src/core/shell/FullShell.tsx`
- Test: `src/core/theme/theme.test.ts`

**Schnittstellen:**
- Verbraucht: `SuiteRahmen` (Aufgabe 2).
- Erzeugt: `ARBEITSDICHTE: ThemeConfig` (Wert, Modul **ohne** `"use client"`) und
  `Arbeitsdichte({ children })` (Client-Insel).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

In `src/core/theme/theme.test.ts`: den bestehenden Import oben um `ARBEITSDICHTE` erweitern —

```ts
import { ARBEITSDICHTE, buildTheme } from "@/core/theme/theme";
```

— und ans Dateiende:

```ts
describe("ARBEITSDICHTE", () => {
  it("setzt genau die drei Groeszen und erbt alles andere", () => {
    /*
     * `controlHeight: TAP` (56) ist eine EINSATZANFORDERUNG — Bedienung mit
     * Handschuhen —, keine Stilfrage. Der Fehler war nie der Wert, sondern
     * seine REICHWEITE: er galt auch dort, wo mit Maus und Tastatur an einem
     * Schreibtisch gearbeitet wird.
     *
     * NACHGESEHEN, NICHT ANGENOMMEN (antd/es/config-provider/hooks/
     * useTheme.js:44-53): antd mischt `{...parentThemeConfig, ...themeConfig}`,
     * `token` flach und `components` eine Ebene tief. `algorithm`,
     * `colorPrimary`, `fontFamily`, `Layout` und `Input.inputFontSize` werden
     * also GEERBT. Wiederholte man sie hier, liefe die Kopie beim naechsten
     * Themewechsel still auseinander — genau das prueft dieser Test.
     *
     * `Radio` MUSS mit: das Elterntheme setzt `radioSize: 28, dotSize: 14`,
     * weil die Trefferflaeche mit Handschuhen die ganze Zeile ist. Neben einem
     * 40px-Bedienelement ist eine 28px-Marke unverhaeltnismaeszig, und der
     * Grund traegt am Schreibtisch nicht.
     */
    expect(ARBEITSDICHTE.token).toEqual({ controlHeight: 40, controlHeightLG: 48 });
    expect(ARBEITSDICHTE.components).toEqual({ Radio: { radioSize: 16, dotSize: 8 } });
    expect(ARBEITSDICHTE.algorithm, "algorithm wird geerbt, nie wiederholt").toBeUndefined();
    expect(ARBEITSDICHTE.token?.colorPrimary, "Farben werden geerbt, nie wiederholt").toBeUndefined();
  });

  it("traegt einen ausdruecklichen cssVar-Schluessel", () => {
    /*
     * Ohne ihn erzeugt antd ueber `useId` einen generierten Schluessel
     * (useTheme.js:35) und warnt in der Entwicklung ausdruecklich davor
     * (useTheme.js:19). Ein stabiler Name ist ausserdem im Inspektor
     * auffindbar — `iuk` fuer die Suite, `iuk-arbeit` fuer die Dichte darin.
     */
    expect(ARBEITSDICHTE.cssVar).toEqual({ key: "iuk-arbeit" });
  });

  it("laeszt `buildTheme` beim Handschuh-Masz", () => {
    // Die Einsatzanforderung bleibt die Vorgabe der Suite. Was sich geaendert
    // hat, ist allein, wo sie NICHT mehr gilt.
    const t = buildTheme("light");
    expect(t.token?.controlHeight).toBe(56);
    expect(t.token?.controlHeightLG).toBe(72);
  });
});
```

Den `ARBEITSDICHTE`-Import oben in der Datei zu den bestehenden Imports ergänzen.

- [ ] **Schritt 2: Testlauf, der fehlschlagen MUSS**

```bash
rtk pnpm vitest run src/core/theme/theme.test.ts
```

Erwartet: FAIL — `ARBEITSDICHTE` existiert nicht.

- [ ] **Schritt 3: `ARBEITSDICHTE` in `theme.ts`**

Ans Ende von `src/core/theme/theme.ts`, **nach** `buildTheme`:

```ts
/**
 * DIE ZWEITE BEDIENDICHTE — fuer Arbeitsflaechen am Schreibtisch.
 *
 * `buildTheme` setzt `controlHeight: TAP` (56) und `controlHeightLG: TAP_XL`
 * (72). Das ist eine EINSATZANFORDERUNG (Bedienung mit Handschuhen), keine
 * Stilfrage, und sie bleibt unveraendert. Der Fehler war ihre REICHWEITE: sie
 * galt auch auf den Verwaltungsseiten, die mit Maus und Tastatur bedient
 * werden — und ein 56px-Knopf neben einem 56px-Select neben einem 56px-Feld
 * ergibt genau den Eindruck „zu viel Weiszraum, nicht Ant Design".
 *
 * NUR DREI GROESZEN, ALLES ANDERE GEERBT. antd mischt ein verschachteltes
 * Theme in das Elterntheme (`antd/es/config-provider/hooks/useTheme.js:44-53`):
 * `token` flach, `components` eine Ebene tief, der Rest per Spread. `algorithm`,
 * `colorPrimary`, `fontFamily`, `Layout` und `Input.inputFontSize` kommen
 * dadurch von selbst. Sie hier zu wiederholen waere eine Kopie, die beim
 * naechsten Themewechsel still auseinanderlaeuft; `theme.test.ts` verbietet es.
 *
 * `Radio` MUSS mit. `buildTheme` setzt `radioSize: 28, dotSize: 14`, weil die
 * Trefferflaeche mit Handschuhen die ganze Zeile aus Marke und Beschriftung
 * ist. Neben einem 40px-Bedienelement ist eine 28px-Marke unverhaeltnismaeszig,
 * und der Grund traegt am Schreibtisch nicht. Checkbox braucht kein
 * Gegenstueck: ihre Marke ist `controlHeight / 2` und faellt automatisch mit.
 *
 * `cssVar.key` AUSDRUECKLICH: ohne ihn erzeugt antd ueber `useId` einen
 * generierten Schluessel und warnt in der Entwicklung davor (useTheme.js:19).
 *
 * KEIN `"use client"` in dieser Datei — `FullShell` ist eine Server Component
 * und liest diesen Wert mittelbar. Aus einem Client-Modul kaeme eine
 * Client-Referenz statt des Objekts (Falle 6).
 *
 * WO SIE GILT: ueber dem INHALT von `FullShell` — portal, feedback, files,
 * lagerbuch, alpha, gamma. NICHT ueber `MinimalShell` (qr, beta: Einsatz-
 * formulare) und NICHT ueber der Kopfzeile, die in jedem Modul gleich aussehen
 * soll. Die drei tatsaechlich handschuhkritischen Ansichten
 * (`lagerbuch/helfer`, `feedback/f`, `files/(oeffentlich-*)`) benutzen gar
 * keine Shell und sind strukturell unberuehrt.
 */
export const ARBEITSDICHTE: ThemeConfig = {
  cssVar: { key: "iuk-arbeit" },
  token: { controlHeight: 40, controlHeightLG: 48 },
  components: { Radio: { radioSize: 16, dotSize: 8 } },
};
```

- [ ] **Schritt 4: Die Client-Insel `Arbeitsdichte.tsx`**

```tsx
"use client";

import { ConfigProvider } from "antd";

import { ARBEITSDICHTE } from "@/core/theme/theme";

/**
 * DIE ARBEITSDICHTE ALS CLIENT-INSEL — duenn mit Absicht.
 *
 * `ConfigProvider` ist eine Client-Komponente; sie liesze sich auch direkt aus
 * `FullShell` (Server Component) heraus rendern. Diese Insel steht trotzdem
 * dazwischen, aus zwei Gruenden: der Grund fuer die Dichte gehoert zum Theme
 * und nicht zur Shell, und `ARBEITSDICHTE` wird hier EINMAL importiert statt an
 * jeder kuenftigen Aufrufstelle.
 *
 * Die Importrichtung ist die unproblematische: `theme.ts` traegt KEIN
 * `"use client"`, und ein Wert von dort in eine Client-Insel zu ziehen ist
 * erlaubt (verboten ist die umgekehrte, Falle 6).
 *
 * KEIN WRAPPER-KNOTEN. antd haengt seine cssVar-Klasse in jeder KOMPONENTE
 * selbst an (`_util/hooks/useCSSVarCls`: `${prefixCls}-css-var`), nicht an
 * einem Container — der Provider rendert nur seinen Kontext. Das Layout aendert
 * sich dadurch nicht.
 */
export function Arbeitsdichte({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={ARBEITSDICHTE}>{children}</ConfigProvider>;
}
```

- [ ] **Schritt 5: `FullShell.tsx` legt sie um den Inhalt**

```tsx
import { SuiteRahmen } from "@/core/shell/SuiteRahmen";
import { Arbeitsdichte } from "@/core/theme/Arbeitsdichte";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Arbeitsflaechen-Variante: volle Inhaltsbreite, Seitenleiste wenn das
 * Modul eine Navigation uebergibt, und die dichtere Bediendichte darueber.
 *
 * DIE DICHTE LIEGT UM DEN INHALT, NICHT UM DEN RAHMEN. Die Kopfzeile soll in
 * jedem Modul gleich aussehen, gleich welcher Variante darunter — und ihre drei
 * Bedienelemente (Menue, Theme, Avatar) sind auf jeder Groesze potenzielle
 * Fingerziele.
 *
 * DIE SEITENLEISTE BLEIBT EBENFALLS AUSZERHALB, und der Grund ist genauer als
 * „sie liest keinen Token". Ihre Eintraege sind rohes `next/link`-Markup, das
 * stimmt. Der `Sider` SELBST leitet aber sehr wohl aus `controlHeightLG` ab:
 * `triggerHeight`, `zeroTriggerWidth` und `zeroTriggerHeight`
 * (antd/es/layout/style/index.js:99-103). Wirkungslos sind die nur, WEIL dieser
 * Sider weder `collapsible` noch `breakpoint` traegt — beides ist bewusst nicht
 * gesetzt (antds Sider-Breakpoints laufen ueber JS und zeigen beim ersten
 * Render die falsche Variante). Wer den Sider spaeter einklappbar macht, holt
 * sich damit einen 80px-Ausloeser neben 40px-Bedienelemente und muss diese
 * Grenze neu entscheiden.
 */
export async function FullShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  return (
    <SuiteRahmen moduleKey={moduleKey} nav={nav}>
      <Arbeitsdichte>{children}</Arbeitsdichte>
    </SuiteRahmen>
  );
}
```

- [ ] **Schritt 6: Testlauf, der jetzt durchgehen MUSS**

```bash
rtk pnpm vitest run src/core/theme/theme.test.ts
```

- [ ] **Schritt 7: Volle Tore inklusive Build**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
```

`pnpm build` ist hier Pflicht: eine neue Client-Grenze in einem Server-Layout ist genau die Stelle,
an der Falle 6 zuschlägt.

- [ ] **Schritt 8: Commit**

```bash
rtk git add src/core/theme src/core/shell/FullShell.tsx && rtk git commit -m "feat(theme): das Handschuh-Masz gilt nur noch, wo Handschuhe getragen werden

controlHeight: 56 ist eine Einsatzanforderung, keine Stilfrage — und sie
bleibt. Der Fehler war ihre Reichweite: sie galt auch auf den
Verwaltungsseiten, die mit Maus und Tastatur bedient werden.

ARBEITSDICHTE ueberschreibt drei Groeszen und erbt alles andere; die
Mischung ist in antd/es/config-provider/hooks/useTheme.js:44-53
nachgesehen, nicht angenommen. Sie liegt ueber dem Inhalt der FullShell —
nicht ueber der Kopfzeile, die in jedem Modul gleich aussehen soll, und
nicht ueber MinimalShell, wo qr und beta Einsatzformulare tragen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Aufgabe 6: Der eine gebündelte Playwright-Lauf

**Dateien:**
- Ändern: `e2e/shell-mobil.spec.ts` (neue Messungen)
- Ändern: was der Lauf als gebrochen ausweist

**Schnittstellen:**
- Verbraucht: alles aus Aufgaben 1–5.
- Erzeugt: den Nachweis. Ohne diese Aufgabe ist keine Aussage über die Wirkung belegt.

> **Warum hier und nicht je Aufgabe:** antd spritzt seine Regeln zur Laufzeit über cssinjs ein — kein
> Quelltext-Scan und kein jsdom sieht sie. Nur ein echter Browser misst. Und: ein offener `pnpm dev`
> legt die E2E-Suite lahm, jeder Aufruf gegen `*.localtest.me` braucht eine eigene Genehmigung.
> Iteratives Einzelprüfen ist hier teuer, ein Lauf ist es nicht.

- [ ] **Schritt 1: Die Messungen als Test schreiben**

Ans Ende von `e2e/shell-mobil.spec.ts`. Die Datei trägt oben ein datei-weites
`test.use({ viewport: { width: 390, height: 844 } })` — Desktop-Messungen brauchen deshalb ein
eigenes `test.describe` mit eigenem `test.use`, genau wie die bestehenden Blöcke
`"Desktop — was ohne Drawer erreichbar sein muss"` und `"Modulnavigation am laufenden Server"`.
Anmeldung über `devLogin` aus `./fixtures`, Lagerbuch-Host und -Gruppe aus
`./helpers/lagerbuch` — **kein zweites Muster erfinden**, die Konstanten liegen dort aus einem
ausgeschriebenen Grund (zwei Literale liefen auseinander, ohne dass ein Lauf rot wurde).

```ts
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

test.describe("Wirkungsnachweis Navigation und Dichte — Desktop 1280x720", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("die Kopfzeile vererbt dem Umschalter keine Zeilenhoehe mehr", async ({ page }) => {
    /*
     * DIE EINZIGE STELLE, DIE DAS BEWEISEN KANN. antd setzt auf
     * `.ant-layout-header` ein `line-height: 64px` (layout/style/index.js:50)
     * und spritzt die Regel zur Laufzeit ueber cssinjs ein — sie steht in
     * keiner Datei dieses Repos. `shell-css.test.ts` haelt fest, dass die
     * Gegenmaszahme DASTEHT; ob sie WIRKT, weisz nur der Browser.
     *
     * Gemessen wird der Ausloeser und nicht das Panel, weil er auch
     * geschlossen existiert — und weil er es war, der mit 76px in einer 64px
     * hohen Kopfzeile stand.
     */
    await devLogin(page, { host: "portal.localtest.me", groups: "" });

    const ausloeser = page.getByTestId("app-umschalter");
    await expect(ausloeser).toBeVisible();
    expect(await ausloeser.evaluate((el) => getComputedStyle(el).lineHeight)).not.toBe("64px");
    expect((await ausloeser.boundingBox())!.height).toBeLessThan(56);
  });

  test("ein Panel-Eintrag ist eine Zeile, keine Flaeche", async ({ page }) => {
    await devLogin(page, { host: "portal.localtest.me", groups: "" });
    await page.getByTestId("app-umschalter").click();

    const eintrag = page.getByTestId("app-eintrag").first();
    await expect(eintrag).toBeVisible();
    expect((await eintrag.boundingBox())!.height).toBeLessThan(56);
  });

  test("das offene Panel liegt ueber der Seitenleiste", async ({ page }) => {
    /*
     * DIE EINE MESSUNG ZUM STAPELKONTEXT, den dieser Umbau NEU einfuehrt.
     *
     * `.kopfBlock` bekommt `position: sticky` und `z-index: 100` und wird damit
     * zum Stapelkontext. Darin liegen `.umschalterFang` (900) und
     * `.umschalterPanel` (901) — ihre Zahlen gelten ab sofort nur noch
     * INNERHALB dieses Kontexts, nicht mehr gegen die ganze Seite. Die
     * Seitenleiste ist ebenfalls `position: sticky`, aber ohne `z-index`
     * (`auto`) und auszerhalb des Kontexts: sie malt ueber nicht-positionierten
     * Inhalt und unter `.kopfBlock`.
     *
     * Das ist das gewuenschte Ergebnis — und genau deshalb wird es gemessen.
     * Das Panel klappt nach UNTEN auf und deckt dabei die obersten Zeilen der
     * Leiste ab; kippte die Reihenfolge, waere der erste Eintrag des Panels
     * unklickbar, und keine der anderen fuenf Messungen saehe das.
     *
     * `hit-testable` und nicht nur `visible`: ein verdeckter Knoten ist im
     * Sinne von Playwright weiterhin sichtbar. `click` mit kurzem Timeout
     * schlaegt fehl, sobald ein anderer Knoten den Punkt abfaengt („intercepts
     * pointer events") — das ist die Aussage, die hier gebraucht wird.
     */
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
    await expect(page.getByTestId("modulleiste")).toBeVisible();

    await page.getByTestId("app-umschalter").click();
    const ersterEintrag = page.getByTestId("app-eintrag").first();
    await expect(ersterEintrag).toBeVisible();
    await ersterEintrag.click({ trial: true, timeout: 2000 });
  });

  test("die Leiste traegt die Navigation, es gibt keine zweite Zeile", async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });

    await expect(page.getByTestId("modulleiste")).toBeVisible();
    await expect(page.getByTestId("modulnav")).toHaveCount(0);
  });

  test("die Kopfzeile bleibt stehen und laeszt kein Loch ueber der Leiste", async ({ page }) => {
    /*
     * Der Defekt war NICHT sichtbar, solange man nicht scrollte: die Leiste
     * klebte bei 64px unter einer Kopfzeile, die mitscrollte. Deshalb das
     * `wheel` — ohne es sagen die richtige und die kaputte Fassung dasselbe.
     */
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
    await page.mouse.wheel(0, 600);

    const kopf = (await page.getByTestId("suite-header").boundingBox())!;
    const leiste = (await page.getByTestId("modulleiste").boundingBox())!;
    expect(leiste.y).toBeGreaterThanOrEqual(kopf.y + kopf.height - 1);
    expect(leiste.y).toBeLessThan(kopf.y + kopf.height + 8);
  });

  test("Arbeitsflaechen sind dichter als Einsatzformulare", async ({ page }) => {
    /*
     * Die eine Messung, die die zweite Bediendichte belegt. `theme.test.ts`
     * haelt fest, WAS `ARBEITSDICHTE` setzt; dass antd das Elterntheme
     * tatsaechlich mischt und die 40px unten ankommen, weisz nur der Browser.
     */
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung/artikel",
    });
    const arbeit = (await page.locator("button.ant-btn").first().boundingBox())!.height;
    expect(arbeit).toBeGreaterThan(36);
    expect(arbeit).toBeLessThan(44);

    await page.goto("http://qr.localtest.me:3100/");
    const einsatz = (await page.locator("button.ant-btn").first().boundingBox())!.height;
    expect(einsatz).toBeGreaterThanOrEqual(56);
  });
});

test.describe("Wirkungsnachweis Navigation und Dichte — Mittelband 820px", () => {
  /*
   * 820px, nicht nur 390 und 1280. `docs/design/README.md` ist dazu
   * ausdruecklich: die beiden letzten Shell-Defekte lagen BEIDE im Mittelband
   * und waren an beiden Enden unsichtbar — die Knopfregel bei 600 statt 768,
   * und die Kopfzeile mit 904px Mindestbreite zwischen 768 und 903.
   *
   * Die Datei hat dafuer schon einen Block (`Mittelbreite ${breite}px`); dieser
   * hier misst die Leiste, die es dort vorher nicht gab.
   */
  test.use({ viewport: { width: 820, height: 900 } });

  test("kein waagerechter Ueberlauf, und der Titel behaelt Breite", async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });

    const breiten = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(breiten.scroll).toBeLessThanOrEqual(breiten.client + 1);
    expect((await page.getByTestId("module-title").boundingBox())!.width).toBeGreaterThan(0);
  });
});
```

> **Wenn `lagerbuchUrl` im Import ungenutzt bleibt**, entferne es — `pnpm lint` schlägt sonst zu.
> Der Aufruf oben geht über `devLogin(…, { callbackPath })`, weil ein `page.goto` vor der Anmeldung
> auf `/login` umleitet und der spätere `goto` die noch laufende Login-Weiterleitung abbrechen kann
> (`net::ERR_ABORTED`, in `fixtures.ts` ausgeschrieben).

- [ ] **Schritt 2: Sicherstellen, dass kein `pnpm dev` läuft**

```bash
rtk pnpm exec playwright test --list | tail -5
```

Läuft ein Dev-Server auf demselben Port, bricht der Lauf mit Portkonflikt ab. Vorher beenden.

- [ ] **Schritt 3: Der gebündelte Lauf**

```bash
rtk pnpm exec playwright test
```

- [ ] **Schritt 4: Befunde abarbeiten**

Für **jeden** Fehlschlag: erst die Ursache benennen, dann entscheiden, ob der Test die falsche
Erwartung trägt oder der Umbau den Fehler. Keine Erwartung „passend machen", ohne den Grund
aufzuschreiben. Nach jeder Korrektur erneut laufen lassen.

- [ ] **Schritt 5: Commit**

```bash
rtk git add e2e && rtk git commit -m "test(e2e): der Browser misst, was kein Gate sehen kann

Sechs Messungen, die den Umbau belegen: die geerbte Zeilenhoehe ist weg,
ein Panel-Eintrag ist eine Zeile, die Leiste traegt die Navigation allein,
die Kopfzeile bleibt beim Scrollen stehen, Arbeitsflaeche und
Einsatzformular haben verschiedene Bediendichte, und im Mittelband bei
820px laeuft nichts ueber.

820 und nicht nur 390/1280: die beiden letzten Shell-Defekte lagen beide
dort und waren an beiden Enden unsichtbar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Aufgabe 7: Der Seitenkopf zieht nach `core`

**Dateien:**
- Erstellen: `src/core/shell/Seitenkopf.tsx`
- Erstellen: `src/core/shell/Seitenkopf.test.tsx`
- Ändern: `src/app/m/lagerbuch/_ui/SeitenKopf.tsx` (Adapter)

**Schnittstellen:**
- Erzeugt: `Seitenkopf({ titel: string, beschreibung?: ReactNode, aktionen?: ReactNode, zurueck?: { titel: string; href: string } })`.
  Aufgaben 8–13 benutzen genau diese Signatur.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/core/shell/Seitenkopf.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

afterEach(unmount);

describe("Seitenkopf", () => {
  it("setzt den Titel als einziges h1", async () => {
    await mount(<Seitenkopf titel="Artikel" />);
    const ueberschriften = document.querySelectorAll("h1");
    expect(ueberschriften).toHaveLength(1);
    expect(ueberschriften[0].textContent).toBe("Artikel");
  });

  it("laeszt Beschreibung und Aktionen weg, wenn keine da sind", async () => {
    await mount(<Seitenkopf titel="Artikel" />);
    expect(exists('[data-testid="seitenkopf-beschreibung"]')).toBe(false);
    expect(exists('[data-testid="seitenkopf-aktionen"]')).toBe(false);
  });

  it("traegt einen Rueckweg, wenn einer uebergeben wird", async () => {
    /*
     * „Fuehrt jede Seite zurueck, oder ist sie eine Sackgasse?" steht als
     * Pruef­frage in `docs/design/README.md` und hatte bis 2026-08-13 keinen
     * gemeinsamen Traeger — jede Detailseite loeste es selbst oder gar nicht.
     */
    await mount(<Seitenkopf titel="Kompressen" zurueck={{ titel: "Artikel", href: "/verwaltung/artikel" }} />);
    const link = query('[data-testid="seitenkopf-zurueck"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/verwaltung/artikel");
    expect(link.textContent).toContain("Artikel");
  });
});
```

- [ ] **Schritt 2: Testlauf, der fehlschlagen MUSS**

```bash
rtk pnpm vitest run src/core/shell/Seitenkopf.test.tsx
```

- [ ] **Schritt 3: `core/shell/Seitenkopf.tsx` schreiben**

```tsx
import type { ReactNode } from "react";
import Link from "next/link";

import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DER KOPF JEDER ARBEITSSEITE DER SUITE.
 *
 * Er lag bis 2026-08-13 als `lagerbuch/_ui/SeitenKopf.tsx` bei einem Modul,
 * waehrend `feedback`, `files` und `portal` ihre Ueberschriften jeweils selbst
 * bauten. Drei belegbare Nutznieszer erfuellen den Maszstab aus
 * `docs/design/README.md`; `lagerbuch` behaelt seinen Namen als Adapter
 * darueber, genau wie `SCHRIFT` es vorgemacht hat.
 *
 * KEINE CLIENT-DIREKTIVE, und das ist der Punkt: die Ueberschrift ist NACKTES
 * `<h1>` mit einer Typografie-Rolle, nicht `Typography.Title`. Ein
 * Compound-Zugriff auf antd ergibt in einer Server Component HTTP 500
 * (Falle 1) — und die Alternative „macht die Ueberschrift halt zu einer
 * Client-Insel" kostete ueber vierzig Client-Grenzen fuer eine Zeile Text.
 *
 * `zurueck` ist der einzige Zuwachs gegenueber der Lagerbuch-Fassung. „Fuehrt
 * jede Seite zurueck, oder ist sie eine Sackgasse?" ist eine Pruef­frage aus
 * `docs/design/README.md` und hatte bisher keinen gemeinsamen Traeger.
 * `next/link` und nicht `<a>`: der Weg bleibt im selben Modul, ein `<a>` warf
 * die ganze Anwendung weg und lud sie neu.
 *
 * KEIN ZEICHEN AM RUECKWEG. `@ant-design/icons` in einer Server Component
 * ergibt HTTP 500 schon beim Import, und `"use client"` behebt das nicht, es
 * macht es still (Falle 7). Das Pfeilzeichen steht deshalb als Textliteral da.
 */
export function Seitenkopf({
  titel,
  beschreibung,
  aktionen,
  zurueck,
}: {
  titel: string;
  beschreibung?: ReactNode;
  aktionen?: ReactNode;
  zurueck?: { titel: string; href: string };
}) {
  return (
    <div style={{ marginBlockEnd: SPACE.lg }}>
      {zurueck ? (
        <Link
          data-testid="seitenkopf-zurueck"
          href={zurueck.href}
          style={{
            ...SCHRIFT.neben,
            display: "inline-block",
            marginBlockEnd: SPACE.xs,
            color: "inherit",
          }}
        >
          ‹ {zurueck.titel}
        </Link>
      ) : null}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: SPACE.md,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ ...SCHRIFT.titel, margin: 0 }}>{titel}</h1>
          {beschreibung ? (
            <p
              data-testid="seitenkopf-beschreibung"
              style={{ ...SCHRIFT.neben, margin: `${SPACE.xs}px 0 0`, maxWidth: "72ch" }}
            >
              {beschreibung}
            </p>
          ) : null}
        </div>
        {aktionen ? (
          <div
            data-testid="seitenkopf-aktionen"
            style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}
          >
            {aktionen}
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Schritt 4: `lagerbuch/_ui/SeitenKopf.tsx` wird Adapter**

```tsx
export { Seitenkopf as SeitenKopf } from "@/core/shell/Seitenkopf";

/*
 * ADAPTER, KEINE ZWEITE FASSUNG. Der Kopf ist am 2026-08-13 nach
 * `core/shell/Seitenkopf.tsx` gezogen, weil `feedback`, `files` und `portal`
 * ihn ebenfalls brauchen. Der Name bleibt hier stehen, damit die 24
 * Aufrufstellen dieses Moduls unveraendert bleiben — dasselbe Muster wie bei
 * `_lib/schrift.ts` ueber `core/theme/schrift.ts`.
 *
 * Die Lagerbuch-Fassung zog ihre Rollen aus `_lib/schrift.ts`, die Suite-
 * Fassung aus `core/theme/schrift.ts`. Das ist derselbe Wert: `_lib/schrift.ts`
 * ist bereits ein Adapter darueber.
 */
```

- [ ] **Schritt 5: Testlauf und Tore**

```bash
rtk pnpm vitest run src/core/shell/Seitenkopf.test.tsx && rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
```

- [ ] **Schritt 6: Commit**

```bash
rtk git add src/core/shell/Seitenkopf.tsx src/core/shell/Seitenkopf.test.tsx src/app/m/lagerbuch/_ui/SeitenKopf.tsx && rtk git commit -m "refactor(shell): der Seitenkopf zieht nach core und bekommt einen Rueckweg

Er lag bei einem Modul, waehrend feedback, files und portal ihre
Ueberschriften jeweils selbst bauten — drei belegbare Nutznieszer.
lagerbuch behaelt seinen Namen als Adapter, wie SCHRIFT es vorgemacht hat.

Neu ist der optionale Rueckweg: „fuehrt jede Seite zurueck, oder ist sie
eine Sackgasse?" steht als Pruef­frage in docs/design/README.md und hatte
bisher keinen gemeinsamen Traeger.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Aufgaben 8–13: Der Durchgang über die Verwaltungsseiten

**Die Prüfliste gilt für alle sechs Aufgaben.** Sie wird hier einmal ausgeschrieben und in jeder
Aufgabe nur benannt.

### Die Prüfliste

Für **jede** Seite im Zuschnitt der Aufgabe:

1. **Seitenkopf.** `Seitenkopf` aus `@/core/shell/Seitenkopf` mit `titel`. Detailseiten
   (`[id]`-Routen) tragen zusätzlich `zurueck` auf ihre Listenseite. Kein eigenes `<h1>` daneben.
2. **Keine Handschuh-Reste.** `rtk grep -n "size=\"large\"\|minHeight: 56\|min-height: 56" <pfad>` —
   jeder Treffer wird entfernt oder mit einem Grund kommentiert, warum diese Seite Touch ist.
   `TAP_ROW` gehört auf keine `FullShell`-Seite.
3. **Abstände aus `SPACE`.** Zahlenliterale in `gap`/`padding`/`margin`/`Row gutter` durch
   `SPACE.*` ersetzen. Dimensionale Werte (Höhen, `maxWidth`, `borderRadius`, `fontSize`) bleiben
   Literale — sie gehören zu anderen Achsen.
4. **Tabellen.** Spaltenköpfe über `columns[].title` mit `<span style={SCHRIFT.kicker}>`, nie über
   CSS gegen `.ant-table-thead`. `scroll={{ x: … }}` gesetzt: Summe der `width`-Angaben, wenn die
   Spalten welche tragen, sonst `"max-content"`.

   **⚠️ ZEILENAKTIONEN BEKOMMEN KEIN `size="small"` MEHR** — korrigiert am 2026-08-13, nach
   Aufgabe 8. Hier stand die Ausnahme aus `docs/design/README.md`; ihre Begründung dort lautet
   „weil eine 56px-Zeilenaktion die Zeile sprengt". Seit Aufgabe 5 sind Bedienelemente auf
   `FullShell`-Seiten **44px**, nicht 56 — die Begründung trägt nicht mehr. Was bleibt, ist der
   Schaden: `size="small"` an einer ikonischen Zeilenaktion ergibt 24px und fällt unter die
   Mindesttapfläche, die `e2e/lagerbuch-mobil.spec.ts:312` ausdrücklich **wegen genau eines
   solchen Knopfes** von „44px breit" auf „44px breit UND hoch" verschärft hat.

   Zeilenaktionen behalten also die 44px der Arbeitsdichte. Wo eine Zeile dadurch wirklich zu
   voll wird, ist das ein Befund für den Bericht — keine Einladung, die Tapfläche zu unterbieten.
   Ausnahme: eine Tabelle, die unter 768px auf `display: none` steht, braucht kein `scroll`.

   **⚠️ DIESER SCHRITT KANN DAS DESKTOP-BILD STILL VERÄNDERN, und kein Tor sieht es.** rc-table
   schaltet auf `table-layout: fixed`, sobald eine Spalte `fixed` oder `ellipsis` trägt oder
   `scroll.y` gesetzt ist (`rc-table/lib/Table.js:426-442`); dann verteilt es die Spalten
   gleichmäßig. `documentElement.scrollWidth` bleibt dabei unauffällig — es läuft ja nichts über,
   die Spalten stehen nur woanders. `pnpm build`, `vitest` und ein Quelltext-Scan können das
   strukturell nicht sehen.

   **Deshalb, je angefasster Tabelle:** Spaltenbreiten bei 1280px **vorher und nachher** messen und
   die beiden Zahlenreihen in die Commit-Botschaft schreiben. Das ist die Messung, die
   `docs/design/README.md` an dieser Stelle ausdrücklich vorschreibt.

   ```js
   // In der Konsole des laufenden Browsers, auf der Seite mit der Tabelle:
   [...document.querySelectorAll(".ant-table-thead th")].map((th) => Math.round(th.getBoundingClientRect().width))
   ```

   Weichen die Reihen ab, ist das kein Fehlschlag — aber es ist eine **Entscheidung**, und sie
   gehört begründet in den Commit, nicht unbemerkt in den Diff.
5. **Leerzustände.** Jede Liste und jedes Diagramm hat einen, und er benennt den nächsten Schritt.
   Ein leeres Achsenkreuz sieht kaputt aus.
6. **Rot nie auf einer Datenfläche**, wo Rot fachlich etwas bedeutet. Warnungen sind
   `type="warning"` oder Text plus 3px linke Kante.
7. **Jede Server-Action hat einen Weg** — und kein Weg führt dorthin, wo der Riegel `notFound()`
   wirft. Prüfen: `rtk grep -rn "use server" <modulpfad>/_lib <modulpfad>/**/actions.ts` auflisten,
   für jede exportierte Action den Aufrufer in der Oberfläche suchen. **Eine Action ohne Aufrufer
   wird nicht stillschweigend verdrahtet** — sie wird im Commit benannt, und wenn ein Einstiegspunkt
   fehlt, wird er gebaut oder die Action als tot markiert und gelöscht.

### Das Vorgehen je Aufgabe

- [ ] **Schritt 1: Bestand aufnehmen**

```bash
rtk grep -n "size=\"large\"\|TAP_ROW\|minHeight: 56\|<h1" <pfade der Aufgabe>
```

Das Ergebnis als Liste in die Commit-Botschaft übernehmen — sie ist der Nachweis, dass der
Durchgang stattgefunden hat und nicht nur behauptet wird.

- [ ] **Schritt 2: Seite für Seite die Prüfliste abarbeiten**

- [ ] **Schritt 3: Tore**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
```

- [ ] **Schritt 4: Commit** mit dem Bestand aus Schritt 1 und der Liste dessen, was sich geändert hat.

---

### Aufgabe 8: `lagerbuch` — Übersicht und Bestand

**Dateien:** `src/app/m/lagerbuch/verwaltung/(arbeit)/page.tsx`, `artikel/`, `verfall/`,
`inventur/`, `bestellung/`

Erwartungsgemäß der größte Posten: `artikel` und `verfall` tragen die breitesten Tabellen des
Moduls. `SeitenKopf` ist hier bereits im Einsatz — Punkt 1 der Prüfliste ist meist schon erfüllt,
Punkt 4 (Tabellen) fast nie.

### Aufgabe 9: `lagerbuch` — Fahrzeuge & Geräte

**Dateien:** `fahrzeuge/`, `fahrzeuge/[id]/`, `vorlagen/`, `vorlagen/[id]/`, `geraete/`,
`geraete/[id]/`, `geraete/scan/`, `sauerstoff/`, `sauerstoff/[id]/`

Neun Seiten, davon fünf Detailseiten — hier trägt `zurueck` aus Aufgabe 7 zum ersten Mal.
`geraete/scan` ist ein Scan-Weg und **könnte** eine Touch-Ansicht sein: prüfen, ob sie im Fahrzeug
benutzt wird. Wenn ja, ist Punkt 2 der Prüfliste dort mit Begründung auszusetzen — und die
Begründung gehört in den Quelltext, nicht nur in den Commit.

### Aufgabe 10: `lagerbuch` — Prüfungen, Protokoll, Einrichtung

**Dateien:** `checks/`, `checks/[id]/`, `bz/`, `bz/[id]/`, `bz/[id]/kontrolle/`, `bz/scan/`,
`journal/`, `etiketten/`, `tokens/`, `import/`

`bz/[id]/kontrolle` und `bz/scan` sind Kandidaten für dieselbe Touch-Frage wie `geraete/scan`.
`etiketten` liegt in der Route-Group `(druck)` und hat ein eigenes Druck-Layout — dort gilt die
Prüfliste nur, soweit die Seite am Bildschirm bedient wird.

### Aufgabe 11: `feedback` — Admin

**Dateien:** `src/app/m/feedback/(admin)/page.tsx`, `groups/[groupId]/`,
`groups/[groupId]/evenings/[eveningId]/`, `.../auswertung/`, `groups/[groupId]/trend/`,
`vergleich/`

Sechs Seiten, keine davon benutzt heute einen gemeinsamen Seitenkopf. **Punkt 6 der Prüfliste ist
hier scharf:** in diesem Modul bedeutet Rot „Note 6 — ungenügend", und `colorError ===
colorPrimary === #c8000f`. Kein rotes `Tag`, kein roter `Progress`, kein roter Balken auf einer
Datenfläche.

Und **Punkt 7 ist hier historisch belastet**: der Port dieses Moduls hatte sechs von acht
Server-Actions ohne Einstiegspunkt. Die Prüfung ist hier keine Formalie.

### Aufgabe 12: `files` — Verwaltung

**Dateien:** `src/app/m/files/page.tsx`, `(verwaltung)/posteingang/`,
`(verwaltung)/zugangslinks/`, `(verwaltung)/shares/neu/`, `(verwaltung)/shares/[id]/`,
`(verwaltung)/shares/[id]/bearbeiten/`

Sechs Seiten. `shares/[id]` und `.../bearbeiten` sind Detailseiten und brauchen `zurueck`.
**Nicht anfassen:** `(oeffentlich-inbox)` und `(oeffentlich-share)` — das sind öffentliche
Ansichten mit eigenem CSS und ohne antd, und sie sind bewusst so gebaut.

### Aufgabe 13: `portal` und `qr/admin`

**Dateien:** `src/app/m/portal/page.tsx`, `src/app/m/portal/admin/page.tsx`,
`src/app/m/qr/admin/page.tsx`

Drei Seiten. `qr/admin` läuft unter `MinimalShell` und behält die Einsatzdichte — **Punkt 2 der
Prüfliste gilt dort nicht**, Punkt 1 und 5 schon. Das ist im Quelltext zu vermerken, sonst
entfernt der nächste Durchgang die `size="large"` dort als vermeintlichen Rest.

`portal/page.tsx` ist die Startseite der Suite und hat mit dem App-Umschalter aus Aufgabe 1 einen
optischen Verwandten — die Kachelfläche des Portals und die Panel-Einträge sollten dieselbe
Aktivsprache und dieselbe gedämpfte Farbe benutzen.

---

## Abschluss

- [ ] **Voller Torlauf, alle fünf**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build && rtk pnpm exec playwright test
```

- [ ] **Kein `pnpm dev` offen**, sonst schlägt der Playwright-Lauf mit Portkonflikt fehl.

- [ ] **`docs/design/README.md` nachziehen.** Der Abschnitt „Fallen, die der Build nicht findet"
  bekommt die geerbte Zeilenhöhe als achte Falle; „Mobil — ein Breakpoint, vier Regeln" bekommt
  einen Satz über die zwei Bediendichten und wo die Grenze läuft. Die Datei ist die verbindliche
  Querschnittsregel — ein Umbau dieser Größe, der sie nicht anfasst, macht sie unwahr.
