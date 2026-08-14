# Ein Navigationsbild und zwei Bediendichten

**Datum:** 2026-08-13
**Vorgänger:** `2026-08-12-navigation-redesign-design.md` — dieser Entwurf korrigiert ihn, er ersetzt
ihn nicht. Der App-Umschalter, die Abschnitts-Gruppierung und der Drawer bleiben; was fällt, ist die
datengetriebene Aufteilung in zwei Bauformen und das ungeprüfte Zusammenspiel mit antds Kopfzeile.

## Der Anlass

Drei Beobachtungen aus der Benutzung, alle drei begründet:

1. Das Panel des App-Umschalters ist unbenutzbar — acht Einträge füllen 1200px Höhe.
2. Die Modulnavigation steht mal seitlich, mal als zweite Kopfzeile.
3. Die Admin-Flächen wirken luftig bis unfertig und nicht wie Ant Design.

Alle drei haben Ursachen, die kein Gate der Suite sieht.

## Befund 1 — antds Kopfzeile vererbt eine Zeilenhöhe von 64px

`antd/es/layout/style/index.js:50` setzt auf `.ant-layout-header` ein `lineHeight: unit(headerHeight)`,
in dieser Suite also **64px**. Der `AppUmschalter` hängt als DOM-Kind im `<Header>`; `position:
absolute` am Panel ändert den enthaltenden Block, **nicht die Vererbungskette**. Jede Textzeile im
Panel bekommt damit eine 64px hohe Zeilenbox.

Nachgerechnet gegen den Screenshot: `.appEintrag` hat `padding: 8px 10px`, also 8 + 64 + 8 = 80px je
Eintrag. Gemessener Abstand: ~82px. Der zerrissene Umbruch der Dienst-Beschreibung
(„… Abrechnung" / „und Meldungen.") ist dieselbe Ursache.

**Derselbe Mechanismus trifft den Auslöser.** `.umschalterAusloeser` hat `padding: 6px 10px` und wird
damit ~76px hoch — in einer 64px-Kopfzeile. Die Regel

```css
.umschalterAusloeser:hover,
.umschalterAusloeser[aria-expanded="true"] { border-color: currentColor; }
```

zeichnet diese aufgeblähte Box in Textfarbe nach. Der schwarze Rahmen ist also **nicht** die Ursache,
sondern das, was die Ursache sichtbar macht. Wer nur den Rahmen entfernt, behält einen 76px-Knopf.

**Warum das nichts gefunden hat:** antd 6 spritzt die Regel zur Laufzeit über cssinjs ein. Sie steht
in keiner Datei des Repos, ein Quelltext-Scan kann sie strukturell nicht sehen, jsdom rechnet keine
Zeilenboxen. Nur `getComputedStyle` in einem echten Browser kennt die Zahl. Das ist derselbe Bautyp
wie die Fallen 2, 5 und 7 in `docs/design/README.md` — der Fehler ist still und steht nirgends falsch
im Quelltext.

## Befund 2 — ein optionales Feld entscheidet über die Bauform

`hatAbschnitte(nav)` (`core/shell/navAbschnitte.ts:23`) prüft, ob irgendein Navigationseintrag ein
`abschnitt`-Feld trägt, und `SuiteHeader` bzw. `FullShell` leiten daraus zwei **verschiedene
Navigationsparadigmen** ab:

| Modul | `abschnitt` gesetzt | Bauform heute |
|---|---|---|
| `lagerbuch` | ja (15 Einträge, 5 Abschnitte) | Seitenleiste links |
| `portal`, `feedback`, `files` | nein | zweite Zeile unter dem Kopf |
| `qr`, `beta` | nein (`MinimalShell`) | zweite Zeile unter dem Kopf |

Die Begründung im Vorgänger — „die Form folgt den Daten, nicht einem Schwellenwert" — ist in sich
schlüssig und trotzdem das Problem: für die benutzende Person ist nicht ablesbar, warum dasselbe
Produkt in einem Modul links navigiert und im nächsten oben. Sie sieht keine Datenlage, sie sieht
zwei Anwendungen.

## Befund 3 — das Handschuh-Maß gilt auch am Schreibtisch

`core/theme/theme.ts` setzt global `controlHeight: TAP` (56) und `controlHeightLG: TAP_XL` (72).
`TAP` ist als **Einsatzanforderung** dokumentiert (Bedienung mit Handschuhen) und durch
`theme.test.ts` verriegelt — es ist keine Stilfrage und wird hier auch nicht zu einer.

Der Fehler ist nicht der Wert, sondern seine **Reichweite**: er gilt auch dort, wo mit Maus und
Tastatur an einem Schreibtisch gearbeitet wird. Ein 56px-Knopf, ein 56px-Select und ein 56px-Feld
nebeneinander ergeben genau den Eindruck „zu viel Weißraum, zu große Bedienelemente, nicht Ant
Design".

## Befund 4 — die Leiste klebt an der falschen Kante

`shell.module.css:333-337` setzt die Seitenleiste auf `position: sticky; inset-block-start: 64px;
block-size: calc(100vh - 64px)`. Die Kopfzeile ist aber **nicht** sticky, und über ihr steht
zusätzlich der 5px-Markenstreifen. Sobald gescrollt wird, scrollt die Kopfzeile weg und über der
Leiste steht ein 64px hohes Loch. Die 64 ist außerdem um den Streifen zu klein — 69 wäre die richtige
Zahl, wenn die Kopfzeile stehen bliebe.

## Befund 5 — ein waagerechtes Aktiv-Idiom in einer senkrechten Liste

`.navLink[aria-current]` markiert über `border-block-end: 2px` in Markenrot. Das ist für eine
waagerechte Leiste das richtige Zeichen. In der Seitenleiste erzeugt derselbe Selektor einen roten
Strich **unter** dem aktiven Eintrag über die volle Leistenbreite — er liest sich als Trennlinie
zwischen zwei Gruppen, nicht als Auswahl. Im Screenshot steht er unter „Übersicht" und direkt über
der Überschrift „Bestand", was die Fehldeutung noch verstärkt.

---

# Der Entwurf

## §1 Ein gemeinsames Gerüst, zwei Inhaltsbreiten

`hatAbschnitte` entfällt ersatzlos und wird gelöscht. `gruppiereNav` bleibt — die Gruppierung
innerhalb der Leiste ist weiterhin datengetrieben, nur nicht mehr die Bauform.

**Jedes Modul mit `nav.length > 0` bekommt die Seitenleiste**, unabhängig von Abschnitten und
unabhängig von der Shell-Variante. Mobil bleibt es unverändert der Drawer.

`Modulnav` (`core/shell/SuiteNav.tsx`) und die Klasse `.modulnav` werden gelöscht. Damit verliert
`SuiteHeader` sein zweites Kind und trägt nur noch die Kopfzeile.

**Das trifft `qr` und `beta`.** Beide laufen auf `MinimalShell` und übergeben eine Navigation
(`Generator` / `Verwaltung`); ohne Gegenmaßnahme verlören sie sie auf dem Desktop ersatzlos. Deshalb
ziehen `FullShell` und `MinimalShell` auf ein gemeinsames Gerüst zusammen:

```
<Layout minHeight=100vh>
  <SuiteHeader/>            ← Streifen + Kopfzeile, sticky
  <Layout>
    <Sider .sider/>         ← nur wenn nav.length > 0; unter 768px display:none
    <Content>{children}</Content>
  </Layout>
</Layout>
```

Der Unterschied zwischen den beiden Varianten schrumpft damit auf **zwei** Dinge:

| | `FullShell` | `MinimalShell` |
|---|---|---|
| Inhaltsbreite | voll | `maxWidth: 640`, zentriert |
| Bediendichte | Arbeit (§4) | Einsatz (unverändert 56px) |

`KioskShell` bleibt vollständig unberührt — Vollbild ohne Bedienelemente ist ihr Zweck.

**Bewusst in Kauf genommen:** `qr` bekommt eine 240px-Leiste für zwei Einträge neben einer
640px-Spalte. Das ist nicht die schönste Einzelansicht der Suite, aber es ist dieselbe Ansicht wie
überall sonst, und genau das ist der Zweck dieses Entwurfs. Die Alternative — eine waagerechte Zeile
nur für `MinimalShell` — wäre die Rückkehr zu zwei Paradigmen mit einer neuen Begründung.

## §2 Die Kopfzeile steht

Die Kopfzeile wird `position: sticky; inset-block-start: 0`. Die Leiste klebt darunter bei **69px**
(64 Kopfzeile + 5 Markenstreifen), ihre Höhe ist `calc(100vh - 69px)`.

Der Markenstreifen scrollt mit weg — er gehört zur Kopfzeile und wird deshalb Teil desselben
klebenden Blocks, nicht ein separat klebendes Element. Das kostet einen umschließenden Knoten in
`SuiteHeader`; die Alternative (zwei unabhängig klebende Elemente) hätte zwei Zahlen zu pflegen statt
einer.

**Die 69 steht an genau einer Stelle.** Sie fällt aus `Layout.headerHeight` (64, `core/theme/theme.ts`)
plus der Streifenhöhe (5, `.streifen`) — beide Zahlen existieren schon, und eine dritte, die still
danebenläuft, ist der Fehler, den Befund 4 beschreibt. Da CSS die TypeScript-Konstante nicht lesen
kann, wird sie als CSS-Variable `--iuk-kopf` in `shell.module.css` deklariert und von
`shell-css.test.ts` gegen `theme.ts` gehalten.

## §3 Der App-Umschalter

**Die Ursache zuerst:**

```css
.umschalter { line-height: normal; }
```

Eine Deklaration am gemeinsamen Vorfahren von Auslöser und Panel — sie nimmt beiden die geerbten
64px. Nicht am Panel allein: der Auslöser hat dasselbe Problem (Befund 1), und zwei Deklarationen für
eine Ursache laufen später auseinander.

`normal` und nicht ein Zahlenwert: eine Zahl wäre eine erfundene Skala, die ein späterer Leser für
geprüft hält (dieselbe Regel, nach der `core/theme/schrift.ts` `lineHeight` nur dort setzt, wo es eine
Aussage trägt).

**Auslöser:**

| Zustand | heute | neu |
|---|---|---|
| Ruhe | rahmenlos, ~76px hoch | rahmenlos, ~34px hoch |
| Hover | 1px `currentColor` (schwarz) | Fläche `--suite-hover` |
| Offen | 1px `currentColor` (schwarz) | Fläche `--suite-hover` + 1px `--suite-linie` |

Der Pfeil dreht beim Öffnen um 180°, unter `@media (prefers-reduced-motion: reduce)` ohne Übergang.

**Panel:** Breite 360 → 320px. Abschnittsüberschriften bekommen `SCHRIFT.kicker` (12/600 versal)
statt `font-size: 12px; opacity: 0.65` — dieselbe Rolle, die die Suite für Kicker überall sonst
benutzt, und `opacity` verstößt gegen die Regel aus `.drawerTitel` (Deckkraft dimmt den Kontrast
unprüfbar mit). Farbe wird `--iuk-gedaempft`.

Der aktive Eintrag bekommt zusätzlich zur getönten Fläche einen **3px linken Akzent** in
`--iuk-marke` — buchstäblich dieselbe Aktivsprache wie die Seitenleiste (§4), gleiche Stärke, gleiche
Farbe, gleiche Fläche. Ein Panel-Eintrag und ein Leisteneintrag bedeuten dasselbe; sie dürfen nicht
verschieden aussehen. `font-weight: 600` bleibt: Bedeutung nie allein über Farbe.

## §4 Die Seitenleiste

**Aktivmarkierung.** `border-block-end` fällt weg. Neu:

```css
.modulleiste .navLink[aria-current] {
  border-inline-start: 3px solid var(--iuk-marke);
  background: var(--iuk-flaeche-aktiv);
  color: var(--iuk-marke);
  font-weight: 600;
}
```

Alle nicht-aktiven Einträge tragen `border-inline-start: 3px solid transparent`, damit die Beschriftung
nicht springt. Das Farbvokabular ist das dokumentierte (`docs/design/README.md`: „KPI-Kachel |
`border-inline-start: 4px` in der Ampelfarbe"); 3px statt 4, weil hier keine Kachel steht, sondern
eine Textzeile.

**`--suite-hover` wird zu `--iuk-flaeche-aktiv` und wandert nach `app/globals.css`** — mit
Dunkelzweig, als vierte Suite-Variable neben `--iuk-marke`, `--iuk-gedaempft` und `--iuk-linie`.
Sie hängt heute an `.umschalter` und ist außerhalb dieses Teilbaums unsichtbar
(`shell.module.css:379`, mit ausgeschriebener Begründung); die Leiste braucht denselben Wert. Der
Maßstab aus `docs/design/README.md` ist erfüllt: zwei heute belegbare Nutznießer, Umschalter-Panel
und Seitenleiste.

**Es bleibt bei EINEM Namen für diesen Wert.** Panel-Hover, Panel-Aktiv, Leisten-Hover und
Leisten-Aktiv benutzen alle `--iuk-flaeche-aktiv`; `.umschalter` deklariert `--suite-hover` nicht
mehr. Zwei Namen für denselben Farbwert wären genau die Doppelung, die beim nächsten Anfassen
auseinanderläuft. `.umschalter` behält seine beiden übrigen lokalen Variablen (`--suite-flaeche`,
`--suite-linie`): sie beschreiben die Fläche und Kontur eines aufklappenden Panels und haben keinen
zweiten Nutznießer. Die Kante der Leiste zieht `--iuk-linie`, die es global schon gibt.

**Dichte.** `.navLink` bleibt in seiner Basis auf `min-height: 56px` — das ist der Drawer, und dort
ist es ein Finger. In der Leiste, die unterhalb von 768px ohnehin nicht existiert:

```css
.modulleiste .navLink { min-height: 40px; }
```

(0,2,0) gegen `<a>`-Markup ohne antd-Gegenspieler — keine Spezifitätserhöhung nötig, aber die
Verschachtelung ist trotzdem zu kommentieren, sonst entfernt die nächste Aufräumrunde sie als Ballast.

**Rhythmus.** Abschnittsüberschriften bekommen `SCHRIFT.kicker` wie im Panel. Der Gruppenabstand
steigt von 16 auf 20px: bei 40px-Zeilen muss die Trennung zwischen Gruppen deutlich größer sein als
die zwischen Zeilen, sonst zerfällt die Ordnung. 20 liegt nicht auf `SPACE` (4/8/12/16/24/32) und ist
deshalb `SPACE.lg + SPACE.xs` — keine neue Zahl, eine Summe zweier vorhandener.

**Kante.** Die Leiste bekommt `border-inline-end: 1px solid var(--iuk-linie)`. Ohne sie steht sie
ohne erkennbaren Grund neben dem Inhalt — das ist der zweite Teil von „passt nicht hinein".

## §5 Zwei Bediendichten, benannt statt implizit

Neu in `core/theme/theme.ts` (**ohne** `"use client"` — Server Components lesen den Wert, Falle 6):

```ts
export const ARBEITSDICHTE: ThemeConfig = {
  cssVar: { key: "iuk-arbeit" },
  token: { controlHeight: 40, controlHeightLG: 48 },
  components: { Radio: { radioSize: 16, dotSize: 8 } },
};
```

Gelegt über Leiste **und** Inhalt der `FullShell` durch einen verschachtelten `ConfigProvider`.

**Warum das trägt, nachgesehen statt angenommen** (`antd/es/config-provider/hooks/useTheme.js:44-53`):
antd mischt `{...parentThemeConfig, ...themeConfig}`, `token` flach und `components` eine Ebene tief.
`algorithm`, `colorPrimary`, `fontFamily`, `Layout`, `Input.inputFontSize` werden also geerbt und
müssen hier nicht wiederholt werden. Wiederholte man sie, liefe die Kopie beim nächsten Themewechsel
still auseinander.

**`cssVar.key` steht ausdrücklich da.** Ohne ihn erzeugt antd über `useId` einen generierten Schlüssel
(`useTheme.js:35`) und warnt in der Entwicklung ausdrücklich davor (`useTheme.js:19`). Ein stabiler
Name ist außerdem im DevTools-Inspektor auffindbar.

**`Radio` muss mit.** Das Elterntheme setzt `radioSize: 28, dotSize: 14` — eine 28px-Marke neben einem
40px-Bedienelement ist unverhältnismäßig. Der Grund für die Vergrößerung (Trefferfläche mit
Handschuhen) trägt am Schreibtisch nicht. `TAP_ROW` (`core/theme/tokens.ts`) bleibt unverändert und
wird von Admin-Seiten künftig nicht mehr gesetzt — geprüft: heute setzt es keine.

**Die Grenze fällt auf die Shell-Variante, und das ist kein Zufall:**

| Variante | Module | Dichte | Begründung |
|---|---|---|---|
| `full` | portal, feedback, files, lagerbuch, alpha, gamma | 40px | Schreibtisch, Maus |
| `minimal` | qr, beta | 56px | Einsatzformulare, Handschuh |
| `kiosk` | kioskdemo | unberührt | keine Bedienelemente |

Die drei tatsächlich handschuhkritischen Ansichten — `lagerbuch/helfer`, `feedback/f`,
`files/(oeffentlich-*)` — benutzen **gar keine Shell** (nachgesehen: kein `<Shell` in ihren Layouts)
und sind strukturell unberührt. `size="large"` steht im ganzen Repo ausschließlich in `qr`
(18 Fundstellen, alle unter `MinimalShell`) — dort ändert sich nichts.

**Die Kopfzeile bleibt außerhalb der Arbeitsdichte** und behält 56px. Sie soll in jedem Modul
identisch aussehen, unabhängig von der Variante darunter; und ihre drei Bedienelemente (Menü, Theme,
Avatar) sind auf jeder Größe potenzielle Fingerziele.

`theme.test.ts` bekommt dazu: `ARBEITSDICHTE` setzt genau `controlHeight`/`controlHeightLG`/`Radio`
und **kein** `algorithm` und **keine** Farbe (sonst liefe die Kopie auseinander), und `buildTheme`
bleibt bei 56/72.

## §6 Das Seitenraster der Arbeitsseiten

`SeitenKopf` existiert genau einmal, in `lagerbuch/_ui/SeitenKopf.tsx`; `feedback`, `files` und
`portal` bauen ihre Überschriften jeweils selbst. Er zieht nach `core/shell/Seitenkopf.tsx` — drei
belegbare Nutznießer, der Maßstab aus `docs/design/README.md` ist erfüllt. `lagerbuch` behält seinen
Namen als Adapter darüber, genau wie `SCHRIFT` es vorgemacht hat.

Er bekommt dabei **einen** neuen, optionalen Parameter: `zurueck` (Beschriftung + href) für
Detailseiten. Die Prüffrage „führt jede Seite zurück, oder ist sie eine Sackgasse?" steht in
`docs/design/README.md` und hat heute keinen gemeinsamen Träger.

Darüber der Durchgang über die **38 Verwaltungsseiten unter `FullShell`** (lagerbuch/verwaltung 24,
feedback/(admin) 6, files/(verwaltung) 5 plus `files/page.tsx`, portal 2) und zusätzlich
`qr/admin/page.tsx` — dort nur Aufbau und Rückweg, nicht die Dichte, denn `qr` bleibt auf 56px.
Die feste Liste:

1. Seitenkopf vorhanden, Titel in `SCHRIFT.titel`, Detailseiten mit Rückweg.
2. Keine 56px-Reste in eigenem CSS (`min-height: 56` außerhalb von Touch-Ansichten).
3. Abstände aus `SPACE`, keine Literale.
4. `Table`: `scroll={{ x: … }}` korrekt (Summe der Spaltenbreiten oder `"max-content"`),
   Spaltenköpfe über `columns[].title` mit `SCHRIFT.kicker`, Zeilenaktionen `size="small"`.
5. Leerzustände vorhanden, auch für Diagramme.
6. Jede Server-Action hat einen Weg in der Oberfläche — und kein Weg führt dorthin, wo der Riegel
   `notFound()` wirft.

Punkt 6 ist die Prüffrage, an der der `feedback`-Port gescheitert ist (sechs von acht Actions ohne
Einstiegspunkt). Er ist Fleißarbeit, kein Design, und er ist der eigentliche Inhalt von „halbfertig".

---

# Was das kostet

## Quelldateien

| Datei | Änderung |
|---|---|
| `core/shell/navAbschnitte.ts` | `hatAbschnitte` gelöscht, `gruppiereNav` bleibt |
| `core/shell/SuiteNav.tsx` | `Modulnav` gelöscht |
| `core/shell/SuiteHeader.tsx` | zweite Zeile weg, sticky-Wrapper dazu |
| `core/shell/FullShell.tsx` | Sider unbedingt bei `nav.length > 0`, `ARBEITSDICHTE` |
| `core/shell/MinimalShell.tsx` | Sider dazu, Inhalt bleibt 640px |
| `core/shell/Modulleiste.tsx` | unverändert |
| `core/shell/shell.module.css` | `.modulnav` weg, Leiste und Umschalter neu |
| `core/theme/theme.ts` | `ARBEITSDICHTE` |
| `app/globals.css` | `--iuk-flaeche-aktiv` mit Dunkelzweig |
| `core/shell/Seitenkopf.tsx` | neu (aus `lagerbuch/_ui/SeitenKopf.tsx`) |
| `lagerbuch/_ui/SeitenKopf.tsx` | Adapter |
| 38 Verwaltungsseiten + `qr/admin` | Durchgang nach §6 |

## Tests

`shell-css.test.ts` ist der größte Posten: sechs `.modulnav`-Zusicherungen entfallen (darunter die
drei Kaskaden-Fallen „spätere Überschreibung", „erstes Kind einer Media Query", „Kommentare und
ähnlich benannte Klassen"). **Diese drei Prüfmuster wandern auf `.sider` und `.modulleiste` mit** —
sie prüfen eine Klasse von Fehlern, nicht eine Klasse namens `.modulnav`, und wären sonst ersatzlos
verloren.

Weiter: `navAbschnitte.test.ts` (`hatAbschnitte`-Block weg), `SuiteNav.test.tsx`,
`SuiteHeader.test.tsx`, `Modulleiste.test.tsx`, `AppUmschalter.test.tsx`, `theme.test.ts`,
`files/_ui/VerwaltungsRahmen.test.tsx`.

E2E: `modulnavigation.spec.ts`, `shell-mobil.spec.ts`, `lagerbuch-ux.spec.ts`,
`lagerbuch-verwaltung.spec.ts`, `lagerbuch-mobil.spec.ts`, `portal.spec.ts`, `launcher.spec.ts`,
`files-hosts.spec.ts`, `keystone.spec.ts`.

## Verifikation

**Was nur ein Browser beweisen kann**, weil antd die Regeln zur Laufzeit einspritzt:

| Messung | Viewport |
|---|---|
| `getComputedStyle(.umschalterAusloeser).lineHeight` ≠ `64px` | 1280 |
| Höhe eines `.appEintrag` < 56px | 1280 |
| Leiste sichtbar, zweite Zeile existiert nicht | 1280 |
| Leiste unsichtbar, Drawer trägt die Navigation | 390 |
| Kopfzeile bleibt beim Scrollen stehen, kein Loch über der Leiste | 1280 |
| `getComputedStyle` eines Admin-`Button` ≈ 40px, eines `qr`-Button ≈ 56px | 1280 |
| kein waagerechter Überlauf, Titel > 0px | 820 |

**820px, nicht nur 390 und 1280.** `docs/design/README.md` ist dazu ausdrücklich: die beiden letzten
Shell-Defekte lagen beide im Mittelband und waren an beiden Enden unsichtbar.

**Ein einziger gebündelter Lauf.** Ein offener `pnpm dev` legt die E2E-Suite lahm, und jeder Aufruf
gegen `*.localtest.me` braucht eine eigene Genehmigung — iteratives Einzelprüfen ist hier teuer.

Dazu die üblichen Tore: `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
`pnpm exec playwright test`.

# Bewusst nicht in diesem Entwurf

- **`TAP` wird nicht angetastet.** Der Wert bleibt 56, die Konstante bleibt, `buildTheme` bleibt bei
  56/72. Was sich ändert, ist allein die Reichweite.
- **Keine dritte Skala.** 48 als „Kompromissdichte" wurde erwogen und verworfen — 40/48 sind antds
  eigene Leiter, 48 als `controlHeight` wäre eine erfundene Zwischengröße.
- **Kein antd `Menu` in der Leiste.** Die Begründung aus `Modulleiste.tsx` gilt unverändert: es
  brächte eigene Aktivlogik und eigenes Bündel, um `aktiverEintrag` zu ersetzen, dessen drei Fallen
  (Rewrite, Wurzel-Fallback, `page` vs. `true`) geprüft und ausgeschrieben sind.
- **Der Drawer ändert sich nicht.** Er bleibt bei 56px, flacher Gruppierung und seinem eigenen
  Theme-Umschalter.
- **Der Menü-Knopf bleibt rechts.** Er steht in `.rechts` und öffnet einen Drawer von links, was eine
  echte Inkonsistenz ist — aber eine, die weder in den Befunden auftaucht noch mit ihnen
  zusammenhängt. Sie gehört in einen eigenen Vorgang, nicht in diesen.
