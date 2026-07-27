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

Diese fünf kosten je einen halben Tag, wenn man sie nicht kennt. Keine davon fällt in `pnpm build` auf.

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

**5. Eine eigene Klasse auf einer antd-Komponente verliert bei Gleichstand.**
`.meineKlasse` ist Spezifität (0,1,0) — genau so viel wie `.ant-btn`, `.ant-input-lg`,
`.ant-select-selector`. Bei Gleichstand entscheidet die Reihenfolge im Dokument, und **antds
Stylesheet kommt später**. Die eigene Regel matcht also, greift aber nicht — und der Fehler ist
still, weil im Quelltext alles richtig dasteht. Zweimal passiert: `.nurMobil { display: none }` in der
768px-Media-Query verlor gegen `.ant-btn { display: inline-flex }`, der Menü-Knopf stand sichtbar auf
dem Desktop; und `.ant-input-lg` schlug die globale `input { font-size: 16px }` (0,0,1).

**Regel:** wo eigenes CSS auf einer antd-Komponente sitzt, eine Klasse mehr voranstellen
(`.rechts .nurMobil` = (0,2,0)) — nie `!important`, und nie mehr als nötig. Wo antd einen **Token**
anbietet, ist der Token der bessere Weg als jede Spezifität (`Input.inputFontSizeLG` statt CSS).
**Und die Erhöhung kommentieren**, sonst entfernt sie die nächste Aufräumrunde als vermeintlichen
Ballast. Prüfen kann das nur ein echter Browser: siehe „Tests für Responsives" unten.

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

**Handlungsknöpfe unter 768px sind volle Breite und stehen untereinander, nie nebeneinander.** Ein
630px breiter Knopf liest sich als Fläche, nicht als Ziel.

### Tests für Responsives — wer welche Aussage besitzt

**jsdom wertet Media Queries nicht aus.** Ein Vitest, der „auf 390px ist X unsichtbar" behauptet und
dafür im DOM sucht, geht **immer** durch — er misst nichts, und der grüne Balken ist eine Lüge. Die
Aufteilung, die trägt:

- **Quelltext-Scan (Vitest)** besitzt die Regel: „die Klasse trägt die richtige Media Query".
- **Playwright bei 390×844** besitzt das Ergebnis: „man sieht es mobil".
- **Playwright bei 1280×720** besitzt die andere Hälfte: „man sieht es auf dem Desktop **nicht**".

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
- Ist der **Zustand** ablesbar, ohne zu klicken? Und der nächste Schritt benannt?
- Führt jede Seite **zurück** (Breadcrumb, klickbarer Modultitel) — oder ist sie eine Sackgasse?
- Kommen Fehler aus Server-Actions **am Feld** an (`useActionState`), oder auf einer technischen
  Fehlerseite mit Datenverlust?
- Gibt es **Leerzustände** — auch für Diagramme (ein leeres Achsenkreuz sieht kaputt aus)?
- Zeigt die Liste, was sie zeigen soll (Status, Menge, Datum) — oder nur einen Link?
