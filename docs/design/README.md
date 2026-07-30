# Design der iuk-Suite — verbindliche Querschnittsregeln

Hier liegt, was **modulübergreifend** gilt. Die ausführlichen Entwürfe einzelner Ansichten liegen
daneben:

| Dokument | Gegenstand |
|---|---|
| `feedback-oeffentliche-ansicht.md` | Der Entwurf „Der Abendzettel" — Referenz für **öffentliche, login-freie Ansichten** (mobile-first, eigenständig gestaltet, ohne antd) |
| `feedback-admin.md` | Der Entwurf „Die Lagekarte" — Referenz für **Admin-Arbeitsseiten** (antd, Suite-Chrome, Zustandsführung) |

Beide entstanden aus Konkurrenzentwürfen mit unabhängiger Jury; sie enthalten Begründungen, nicht nur
Ergebnisse. Wer eine ähnliche Ansicht baut, liest den passenden Entwurf — nicht um ihn zu kopieren,
sondern weil dort steht, **warum** etwas so entschieden wurde.

## Zwei Design-Klassen, bewusst unterschiedlich

- **Öffentliche Ansichten** (kein Login, per Link/QR erreichbar, oft auf einem fremden Handy): dürfen
  eigenständig aussehen, eigene CSS-Module, **kein antd**. Damit ist die RSC-Compound-Falle strukturell
  ausgeschlossen, das Route-JS bleibt klein, und die Ansicht kann eine eigene Anmutung tragen.
- **Admin-Ansichten**: gehören sichtbar zur Suite, antd + Suite-Theme, Suite-Chrome. Eigenes Markup nur
  dort, wo antd im Weg steht — und dann mit eigenen CSS-Variablen (siehe unten).

## Die Regel für `src/core`

**Maßstab: ein zweiter, heute belegbarer Nutznießer.** Nicht „könnte man teilen", sondern „ein zweites
Modul braucht es jetzt". Alles andere bleibt beim Modul. Ein Muster mit einem Anwender ist eine
Konvention, keine Komponente — und ein Framework für einen Nutzer ist teurer als die Verdopplung, die
es verhindern soll.

Gegenprobe aus der Praxis: `core/charts` wurde bewusst **nicht** um eine invertierte Achse erweitert,
obwohl es naheliegt — alle vier Aufrufer lägen im Modul `feedback`. Umgekehrt wurde der QR-Baustein
nach `core/qr` gehoben, weil zwei Module ihn erzeugen. Und `payloadToSvg` durfte nicht quer aus einem
Modul in ein anderes importiert werden: Modul-Interna sind kein API.

## Fallen, die der Build nicht findet

Diese sechs kosten je einen halben Tag, wenn man sie nicht kennt. Keine davon fällt in `pnpm build` auf.

**1. Compound-Zugriff auf antd in einer Server Component → HTTP 500.**
Verboten in RSC: `Typography.*`, `Form.Item`, `Descriptions.Item`, `List.Item`, `Card.Meta`,
`Collapse.Panel`, `Breadcrumb.Item`, `Input.Group`, `Input.TextArea`, `Space.Compact`,
`Statistic.Countdown`, `Table.Summary`, `Tag.CheckableTag`, `Badge.Ribbon`, `Layout.Header`,
`Grid.useBreakpoint`. Sicher sind `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag`.
Interaktive Teile werden Client-Kinder, die Seite bleibt RSC.

**2. `--ant-*`-Variablen sind nicht global.**
antd deklariert sie auf seiner Scope-Klasse, die es an die Wurzelelemente **seiner eigenen
Komponenten** hängt — nicht an `:root`. Eigenes Markup außerhalb eines antd-Komponentenbaums sieht sie
**nicht**, und der Fehler ist still: `var(--ant-color-border-secondary)` löst ins Leere auf, die
Haarlinie verschwindet einfach. **Regel:** `--ant-*` nur in Props von antd-Komponenten; eigenes Markup
nutzt modul-eigene Variablen (`--fb-*` im Modul `feedback`).

**3. `colorError === colorPrimary === #c8000f`.**
`core/theme/theme.ts` setzt die Fehlerfarbe auf DRK-Rot. Ein `Alert type="error"` ist damit optisch
eine Primäraktion. Wo Rot zusätzlich eine **fachliche** Bedeutung trägt (im Modul `feedback`: „Note 6 —
ungenügend"), darf Rot **niemals auf einer Datenfläche** erscheinen — kein rotes `Tag`, kein roter
`Progress`, kein roter Balken. Warnungen sind `type="warning"` oder Text plus 3px linke Kante.

**4. `size="large"` ist 72px, nicht 56.**
`controlHeight: TAP` (56) ist die Suite-Vorgabe und schon das richtige Touch-Maß;
`controlHeightLG` ist 72. **`size` auf Bedienelementen also gar nicht setzen.** Ausnahme:
`size="small"` innerhalb von Tabellenzeilen, weil eine 56px-Zeilenaktion die Zeile sprengt.

**5. Eigenes CSS und antd-CSS treffen sich, und die Spezifität entscheidet — meist gegen dich.**
Der Fehler ist immer still: im Quelltext steht alles richtig, die Regel matcht, sie greift nur nicht.
Dreimal passiert, in drei verschiedenen Ausprägungen:

- **Gleichstand, antd gewinnt durch Reihenfolge.** `.nurMobil` ist (0,1,0) — genau so viel wie
  `.ant-btn`. Bei Gleichstand entscheidet die Dokumentreihenfolge, und **antds Stylesheet kommt
  später**: `.nurMobil { display: none }` in der 768px-Media-Query verlor gegen
  `.ant-btn { display: inline-flex }`, der Menü-Knopf stand sichtbar auf dem Desktop.
- **Kein Gleichstand, eigene Regel schlicht zu schwach.** `.ant-input-lg` (0,1,0) schlägt eine globale
  `input { font-size: 16px }` (0,0,1) regulär. Kein Reihenfolgeproblem — sie war nie im Rennen.
- **Eigene Regel zu stark, und trifft die falschen.** `:root textarea` (0,1,1) überstimmte
  `.textfeld` (0,1,0) im öffentlichen Abendzettel und hätte dessen bewusste 18px auf 16px
  heruntergezwungen. Wer gegen antd aufrüstet, überfährt dabei leicht das eigene Modul-CSS.

Merksatz: **so spezifisch wie nötig, nicht wie möglich** — und in welche Richtung „nötig" zeigt,
hängt davon ab, wer der Gegenspieler ist.

**Regel:** wo eigenes CSS auf einer antd-Komponente sitzt, eine Klasse mehr voranstellen
(`.rechts .nurMobil` = (0,2,0)) — nie `!important`, und nie mehr als nötig. Wo antd einen **Token**
anbietet, ist der Token der bessere Weg als jede Spezifität (`Input.inputFontSizeLG` statt CSS).
**Und die Erhöhung kommentieren**, sonst entfernt sie die nächste Aufräumrunde als vermeintlichen
Ballast. Prüfen kann das nur ein echter Browser: siehe „Tests für Responsives" unten.

**6. Ein WERT aus einem `"use client"`-Modul kommt in einer Server Component nicht an.**
Falle 1 verbietet den Compound-Zugriff. Das hier ist ihre Schwester und sieht harmloser aus: eine
Server Component importiert aus einem Client-Modul keine Komponente, sondern eine **Konstante** —
und bekommt eine Client-Referenz statt des Wertes. `MONATS_FENSTER.includes is not a function`,
HTTP 500 für die ganze Seite. **TypeScript ist zufrieden** (es sieht `readonly [6, 12, 24]`),
`pnpm build` findet nichts, und ein Vitest kann es strukturell nicht finden: unter Vitest sind beide
Module normale ES-Module, `"use client"` ist dort ein wirkungsloser String.

**Regel:** Werte, die eine Server Component liest, liegen in einem Modul ohne `"use client"` —
im Modul `feedback` heißt das `_lib/`. Die Komponente importiert von dort, nicht umgekehrt.

**So sucht man danach:** alle Module mit `"use client"` auflisten, darin die Exporte suchen, die
keine Komponente sind (`export const GROSSBUCHSTABEN`, `export function kleinbuchstabe`), und für
jeden prüfen, ob ihn eine Datei ohne `"use client"` importiert. Am 2026-07-27 ergab das vier
Kandidaten und genau einen Treffer (`MONATS_FENSTER`, behoben). Die drei anderen —
`MAX_SERIEN`, `AKTUALISIERUNGS_TAKT_MS`, `SPERRE_MS` — haben keinen Importeur jenseits ihrer eigenen
Client-Insel.

## Hell- und Dunkelmodus

Die Suite hat einen **Umschalter** (Cookie `iuk-theme`, serverseitig gelesen) — auf
`prefers-color-scheme` zu selektieren ist deshalb **falsch**: es bricht den Fall „System dunkel,
Umschalter hell".

`<html>` trägt `data-theme="light" | "dark"`. Eigenes CSS selektiert darauf:

```css
:root[data-theme="dark"] { --fb-ink: #ECE9E2; }
```

`AntdProvider.setMode` schreibt das Attribut beim Umschalten mit — ohne das bleiben eigene Variablen
bis zur nächsten Navigation auf dem alten Modus stehen.

## Farben und fachsemantische Paletten

`core/theme/tokens.ts` ist die Datei mit den **Suite**-Hex-Codes. **Ausnahme:** fachsemantische
Paletten eines einzelnen Moduls liegen beim Modul — sie tragen die Bedeutung eines Fachbereichs, nicht
den Farbeindruck der Suite. Beispiel: die Schulnoten-Ampel in `app/m/feedback/_lib/noten.ts`.

Drei Farbrollen, sauber getrennt:

1. **DRK-Rot** = Marke und Primäraktion. Nie Statusfarbe, nie Datenfarbe.
2. **Fachsemantische Palette** = ausschließlich Werte ihrer Skala. Nie für Serien, Kategorien,
   Fortschritt oder Zustand.
3. **Neutral/Graphit** = alles andere, insbesondere Fortschritt und Mengen.

## Barrierefreiheit — zwei Regeln, die tragen

**Bedeutung nie allein über Farbe.** Eine Bewertung, ein Status, eine Warnung trägt immer zusätzlich
Text oder Ziffer. Farbe ist die verzichtbare letzte Schicht.

**Luminanz monoton führen.** Wenn eine Palette eine Rangfolge ausdrückt (gut → schlecht, wenig → viel),
muss die Helligkeit monoton fallen oder steigen. Dann bleibt die Rangfolge bei Rot-Grün-Blindheit — dem
häufigsten Fall — und in Graustufen erhalten. Ein Test darauf verhindert, dass ein späterer „schönerer"
Farbtausch den Kanal unbemerkt zerstört.

Dazu, ohne Ausnahme: Fokus immer sichtbar (`outline` mit `outline-offset`, nie `outline: none` ohne
Ersatz), echte Radiogruppen statt Knopfreihen (ein Tabstop pro Gruppe, Pfeiltasten wählen nativ),
Kontrast AA belegt statt geschätzt, `@media (prefers-reduced-motion: reduce)` behandelt.

## Typografie

Rollen statt Werte: eine Datei mit fertigen `CSSProperties` je Rolle (Kicker, Meta, Body, Überschrift),
statt Schriftgrößen im Markup zu verstreuen. In Admin-Ansichten sind die Werte antds eigene Leiter
(12/14/16/20/24/30) — eine dritte Skala im Produkt wäre der Fehler, nicht die Lösung. Öffentliche
Ansichten dürfen eine eigene Skala haben, weil sie eine eigene Anmutung tragen.

Ziffern, die verglichen werden, brauchen `font-variant-numeric: tabular-nums`. Eingabefelder nie unter
16px (Begründung: Abschnitt „Mobil" unten).

## Mobil — ein Breakpoint, vier Regeln

**768px ist der einzige Breakpoint der Suite** (= antds `md`, festgehalten in
`core/shell/shell-css.test.ts`). Kein Modul erfindet einen zweiten; `Row`/`Col` bekommen `xs`/`md`,
keine festen Breiten.

**Die Umschaltung ist CSS, nie JavaScript.** `Grid.useBreakpoint` ist in Server Components ohnehin
verboten (Falle 1), und ein JS-Breakpoint zeigt beim ersten Render die falsche Variante. Beide
Ausprägungen rendern, CSS blendet eine aus.

**Zoom ist suiteweit gesperrt, und deshalb fallen Eingabefelder nirgends unter 16px.** Die beiden
Regeln sind eine Einheit: ohne Zoom kann niemand mehr heranholen, was zu klein ist. Die Begründung hat
sich damit umgedreht — früher war 16px die Abwehr gegen iOS' Auto-Zoom, heute ist es reine
Lesbarkeit. Wer eine der beiden anfasst, prüft die andere (`app/layout.tsx`, `app/globals.css`,
`core/theme/feldschrift.test.ts`).

**antd-`Table` scrollt auf schmalen Geräten (`scroll={{ x: … }}`), sie bricht nicht um.** Eine
umgebrochene Tabellenzeile ist unlesbarer als eine gescrollte.

**`scroll={{ x: … }}` braucht den richtigen Wert, und der hängt an den Spaltenbreiten.** Tragen die
Spalten `width`, ist die Summe die Zahl. Tragen sie keine, ist `"max-content"` die einzige ehrliche
Angabe — jede Pixelzahl wäre erfunden. **Eine Bedingung dazu:** rc-table schaltet auf
`table-layout: fixed`, sobald eine Spalte `fixed` oder `ellipsis` trägt oder `scroll.y` gesetzt ist
(`lib/Table.js:426-442`); dann verteilt es die Spalten gleichmäßig und **das Desktop-Bild ändert sich**,
ohne dass irgendwo etwas überläuft. Wer `scroll` ergänzt, misst die Spaltenbreiten bei 1280px vorher
und nachher — `documentElement.scrollWidth` allein würde den Unterschied nicht sehen.

**Eine Tabelle, die auf schmalen Geräten gar nicht sichtbar ist, braucht kein `scroll`.**
`feedback/_ui/Verlauf.tsx` rendert beide Darstellungen ins HTML und blendet per CSS eine aus; die
breite Tabelle steht unter 768px auf `display: none`. Sie ist das Vorbild, nicht der Mangel — und der
Grund, warum „keine `scroll`-Prop" allein noch kein Befund ist.

**Handlungsknöpfe unter 768px sind volle Breite und stehen untereinander, nie nebeneinander.** Ein
630px breiter Knopf liest sich als Fläche, nicht als Ziel.

**Ein Modul, das seine Knopfregel bei einer anderen Breite schaltet als die Suite, ist bei 390px nicht
zu unterscheiden — und dazwischen kaputt.** `feedback.css` schaltete bis 2026-07-27 bei 600px. Bei
700px war der Menü-Knopf der Shell sichtbar und der Verlauf zeigte die Schmalliste (beides „mobil"),
während „Kopieren" 88px und „PNG" 61px breit nebeneinander standen. In `max-width`-Abfragen heißt der
Suite-Breakpoint **767.98px**, nicht 768 — sonst gelten bei exakt 768px beide Seiten und die
Reihenfolge im Stylesheet entscheidet.

### Tests für Responsives — wer welche Aussage besitzt

**jsdom wertet Media Queries nicht aus.** Ein Vitest, der „auf 390px ist X unsichtbar" behauptet und
dafür im DOM sucht, geht **immer** durch — er misst nichts, und der grüne Balken ist eine Lüge. Die
Aufteilung, die trägt:

- **Quelltext-Scan (Vitest)** besitzt die Regel: „die Klasse trägt die richtige Media Query".
- **Playwright bei 390×844** besitzt das Ergebnis: „man sieht es mobil".
- **Playwright bei 1280×720** besitzt die andere Hälfte: „man sieht es auf dem Desktop **nicht**".
- **Playwright dazwischen** besitzt, was an keinem der beiden Enden sichtbar ist. Zwei Defekte auf
  Teilprojekt C waren von dieser Art: die Knopfregel bei 600 statt 768 (unsichtbar bei 390 **und** bei
  1280) und die Kopfzeile, die zwischen 768 und 903px eine Mindestbreite von 904px hatte (unsichtbar
  bei 390, weil die Modulnavigation dort ausgeblendet ist, und bei 1280, weil dort Platz ist). **Wer
  nur die Enden misst, prüft die Mitte nicht** — und die Mitte ist jedes Tablet im Hochformat.

**Ein e2e-Test darf seinen Zustand nicht vom Seed erben.** Die Playwright-Datenbank wird einmal je
Lauf gelöscht (`rm -rf ./.data/e2e`), aber alle Dateien teilen sie sich, `workers: 1`, in
Pfadreihenfolge. `e2e/feedback.spec.ts` beendet die Umfrage der Gruppe 2 — jede später laufende Datei
sieht dieselbe Seite in einer **anderen** Belegung als beim Einzelaufruf. Ein Test, der „hier läuft
eine Umfrage" voraussetzt, ist deshalb entweder allein grün oder in der Suite grün, nie beides. Die
Regel: **den benötigten Zustand im Test selbst herstellen** (idempotent, oder über eine eigens
angelegte Gruppe) — ein Kommentar „läuft an Position 3" ist eine Zeitbombe, keine Lösung.

**Der Desktop-Lauf ist keine Zugabe.** Ein Test, der nur bei 390px misst, kann eine
`display:none`-Regel gar nicht widerlegen: dort sagen die richtige und die kaputte Fassung beide
„sichtbar". Genau so ist Falle 5 durchgekommen — die Media-Query-Regel war da, der Quelltext-Scan war
grün, und der Knopf stand trotzdem auf dem Desktop. **Ein Quelltext-Scan findet eine
Kaskadenkollision strukturell nicht**, weil er Reihenfolge und Fremd-Stylesheets nicht kennt. Was er
festhalten kann, ist die Gegenmaßnahme (der Selektor trägt den Präfix); ob sie wirkt, weiß nur der
Browser. Jede `nurMobil`/`nurDesktop`-Zusage braucht deshalb **beide** Viewports.

## Was eine Oberfläche zeigen muss, damit sie benutzbar ist

Aus der Fehleranalyse des `feedback`-Ports, die sich auf jede Admin-Ansicht übertragen lässt: Das
Modul war nicht schlecht gestaltet, es war **unfertig** — sechs von acht Server-Actions und drei Seiten
hatten keinen Einstiegspunkt. Daraus die Prüffragen für jede neue Ansicht:

- Hat **jede** Action einen Weg in der Oberfläche? Eine Action ohne Aufrufer ist kein Feature.
- Und die Gegenprobe: führt **kein** Weg dorthin, wo die aufrufende Person nicht hindarf? Mehrere
  Riegel der Suite werfen absichtlich `notFound()` statt eines 403, damit die Existenz einer Seite
  nicht verraten wird — ein Navigationseintrag oder Knopf davor hebt genau das wieder auf und ist für
  alle anderen eine Sackgasse. Oberfläche und Riegel müssen **dasselbe Prädikat auf denselben Viewer**
  anwenden (Vorbild: `isFeedbackAdmin` in `(admin)/layout.tsx` und `(admin)/vergleich/page.tsx`); zwei
  verschiedene Quellen laufen spätestens im Verzugsfenster veralteter JWT-Gruppen auseinander.
- Ist der **Zustand** ablesbar, ohne zu klicken? Und der nächste Schritt benannt?
- Führt jede Seite **zurück** (Breadcrumb, klickbarer Modultitel) — oder ist sie eine Sackgasse?
- Kommen Fehler aus Server-Actions **am Feld** an (`useActionState`), oder auf einer technischen
  Fehlerseite mit Datenverlust? (Die 404-Seite der Suite ist `src/app/not-found.tsx` — eine für alle
  Module, ohne Shell, weil die Not-Found-Grenze an der Wurzel liegt und alle Modul-Layouts ersetzt.)
- Gibt es **Leerzustände** — auch für Diagramme (ein leeres Achsenkreuz sieht kaputt aus)?
- Zeigt die Liste, was sie zeigen soll (Status, Menge, Datum) — oder nur einen Link?
