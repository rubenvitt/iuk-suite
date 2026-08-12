# Lagerbuch, Helfer-Zweig: eine zweite Fassung für breite Schirme

**Datum:** 2026-08-12
**Modul:** `src/app/m/lagerbuch`
**Umfang:** der öffentliche Zweig — Gate, `/helfer`, `/helfer/check`, `/a/[artikelId]`, `/g/[code]`
**Ausdrücklich nicht im Umfang:** `/verwaltung/*` (antd, Suite-Shell, anderes Publikum)

## Das Problem

`_ui/helfer.module.css:69` setzt `max-width: 560px` auf `.rahmen`. Auf einem
1440px-Schirm steht der gesamte Helfer-Weg damit als schmale Säule in der Mitte,
rechts und links je rund 440px leere Fläche.

Der Wert ist bei der Portierung entstanden und hat **kein Vorbild im Alt-Bestand**:
`lagerbuch/src/app/globals.css:129` gibt `.app` `width: 100%` ohne jede Kappung,
und `.gate` (`:116`) ist vollbreit mit einem zentrierten Kartenraster darin.

Gemessen am laufenden Dev-Server (1440×900, Dunkelmodus):

| Ansicht | Befund |
|---|---|
| `/helfer/check?fz=fz-rtw-1` (Zählen) | 3 Positionen gleichzeitig lesbar, die Sticky-Leiste „Alles auf Soll" verdeckt eine vierte; ~62 % Bildschirmfläche ungenutzt |
| `/helfer` (Artikelliste) | 9 Zeilen sichtbar, danach Scrollen in einer 560px-Säule |
| `/helfer/check` (Fahrzeugwahl) | drei Karten, darunter rund 500px Leere |
| `/` (Gate) | einspaltig — siehe unten, das ist ein eigener Fehler |

### Der stille Folgefehler auf dem Gate

`helfer.module.css:163-166` gibt `.gateKarten` ein
`grid-template-columns: repeat(auto-fit, minmax(272px, 1fr))` bei
`max-width: 680px`. Dieses Raster steht **in einem 560px-Elternteil** und kann
deshalb nie zweispaltig auslösen: zwei Spalten bräuchten mindestens 558px plus
14px Lücke plus 2×18px Innenabstand. Das Original zeigt „Im Dienst" und
„Verwaltung" nebeneinander; die portierte Fassung kann es nicht, ohne dass eine
Regel falsch aussieht.

Das ist der Beleg dafür, dass die 560px eine Entscheidung der *Helfer-App* sind,
die auf eine Seite durchgeschlagen ist, die keine Helfer-App ist.

## Die Entscheidung, die dahinter liegt

Der Kopfkommentar von `helfer.module.css:5-11` lautet „NULL MEDIA QUERIES für die
Breite (§7.7.1)", begründet mit *„Eine Ansicht, die es nur in EINER Fassung gibt,
kann keinen zweiten Breakpoint einführen."*

Die Prämisse wird hiermit aufgehoben: die Ansicht bekommt eine zweite Fassung.
Das ist als **Betreiberentscheidung 14** zu führen, in der Reihe der dreizehn vom
04.08.2026, und nicht stillschweigend zu ersetzen. Die Begründung ist die
Beobachtung oben — der Helfer-Weg wird nicht nur auf Telefonen benutzt, und auf
einem Monitor ist er heute unbrauchbar.

**Was von §7.7.1 bestehen bleibt:** die 767.98-Regel für jede `max-width`-Abfrage
(`bauform.test.ts:631-655`). Der neue Zweig ist eine `min-width`-Abfrage und
berührt sie nicht.

## Architektur

### 1. `.rahmen` trennt seine zwei Ämter

`.rahmen` trägt heute beides:

1. **Variablenträger** — 15 Neutrale + 8 Ampelwerte, hart festgenagelt von
   `bauform.test.ts:466-545` und von `rahmen.test.tsx` als *Enthaltenheit*
   geprüft. `_ui/BarcodeScanner.tsx` rendert auf beiden Ästen und braucht
   denselben Satz unter `.modul`.
2. **Handy-Viewport-Hülle** — `max-width: 560px`, `height: 100dvh`,
   `overflow: hidden`, `margin-inline: auto`.

Nur Amt 2 ist der Fehler. Der Umbau:

- `.rahmen` wird **vollbreit**. Der Papier-Hintergrund füllt damit den Schirm,
  statt dass eine 560px-Säule in fremdfarbiger Leere steht. Der Variablensatz
  und die `:root[data-theme="dark"]`-Hälfte bleiben **unverändert** — kein Name
  kommt hinzu, keiner fällt weg.
- `height: 100dvh`, `overflow: hidden` und `display: flex` bleiben: die
  App-Hülle mit innerem Scrollbereich trägt die Sticky-Abschlussleiste
  (`.abschluss`) und die Reiterleiste, und das gilt auf jeder Breite.
- Die Breitenkappung wandert nach innen — **ohne neues Markup**. `.kopf`,
  `.inhalt` und `.tableiste` bekommen die Kappung als Innenabstand:

  ```css
  padding-inline: max(14px, calc((100% - 560px) / 2));
  ```

Das ist die Bauform des Alt-Bestands: `.app` vollbreit, Inhalt zentriert.

**Warum als Padding und nicht als innerer `<div>`:** ein zusätzlicher
Markup-Knoten müsste in drei Komponenten eingezogen werden und stünde zwischen
`.rahmen` und dem Inhalt — genau die Naht, die `rahmen.test.tsx` als
*Enthaltenheit* prüft. Der Padding-Weg fasst kein `.tsx` an, lässt die
Variablenvererbung unberührt und kappt trotzdem auf denselben Wert.

**Warum kein `:global(body)`:** ein CSS-Modul, das den Body einfärbt, ist genau
Falle 5 (eigenes CSS gegen antd-CSS, Spezifität entscheidet still). Der
vollbreite `.rahmen` löst dasselbe Problem ohne Fremdzugriff.

### 2. Ein `@media (min-width: 768px)`

Genau eine Abfrage, in `_ui/helfer.module.css`. Sie enthält **keine**
`max-width`-Angabe — eine kombinierte Abfrage wie
`(min-width: 768px) and (max-width: 1200px)` würde `bauform.test.ts:631` auslösen
und ist verboten.

Darin:

- innere Obergrenze **560px → 1200px** für `.kopf`, `.inhalt`, `.tableiste`
  (derselbe `padding-inline`-Ausdruck, nur mit 1200 statt 560)
- die **Reiterleiste wandert nach oben**: `.tableiste` bekommt `order: -1` und
  steht damit direkt unter dem Kopf statt am unteren Rand. `border-top` wird zu
  `border-bottom`. Die Reiter geben ihr `flex: 1` auf und stehen linksbündig
  nebeneinander, Symbol und Beschriftung in einer Zeile statt übereinander.
- großzügigere Innenabstände für `.inhalt` (heute 14px)

**Der Grund für 768px:** unterhalb davon ändert sich nichts, und 768px ist die
Grenze, die das Modul ohnehin kennt (767.98 in der Gegenrichtung).

**Kein Markup-Eingriff, und das ist die tragende Zusage.**
`data-testid="lb-tableiste"` und `aria-current="page"` sind Zusicherungen an
E11/T171 und müssen **genau einmal** existieren. Zwei gerenderte Reiter-Sätze —
einer im Kopf, einer unten — brächen den E2E-Selektor auf zwei Treffer. Deshalb
bleibt es bei **einem `<nav data-testid="lb-tableiste">`**, das per `order` seine
Position wechselt; `HelferRahmen.tsx` wird nicht angefasst.

Die Reiter stehen dadurch **unter** dem Kopf, nicht *in* ihm neben der Marke —
das wäre mit CSS allein nicht erreichbar, weil `<header>` und `<nav>`
Geschwister sind. Der optische Unterschied ist gering, der Unterschied im Risiko
ist es nicht.

`aria-label="Helfer-Bereiche"` bleibt unverändert richtig: es beschreibt den
Zweck der Navigation, nicht ihre Position.

### 3. Die Inhalte nehmen die Breite an

Eine breitere Säule allein ist nur eine gestreckte Handy-App. Vier Stellen:

**Zählliste** (`CheckFlow.tsx:468-542`) — der Container `[data-rolle="zaehlliste"]`
enthält bereits je Fach ein `<div>` aus `.fachKopf` + `.karte`. Er bekommt eine
zusätzliche Klasse und wird ab 768px zu einem Grid: zweispaltig, ab 1100px
dreispaltig. Aus 3 sichtbaren Positionen werden rund 12. Die Karten selbst
bleiben unverändert.

**Artikelliste** (`ArtikelSuche.tsx:83-113`) — eine `.karte` mit vielen `.zeile`.
Ab 768px zweispaltig. Achtung: `.zeile` trennt heute per `border-top` mit
`:first-child { border-top: none }`. Im Grid gilt „erstes Kind" nur einmal, nicht
je Spalte — die Trenner fransen sonst aus. Die Regel muss für den Grid-Zweig auf
Zellkanten umgestellt werden.

**Gate** (`helfer.module.css:163`) — braucht keine eigene Regel. Sobald der
Elternteil breiter ist, löst `auto-fit` wie gebaut zweispaltig aus. Zu prüfen
ist nur, ob `.gate` selbst (`:156`) mit `justify-content: center` auf einem hohen
Schirm noch stimmig steht.

**Entnahme / Artikel-Detail** (`Entnahme.tsx:95-190`) — heute eine Kette aus
Bestands-Karte, Entnahme-Karte und FEFO-Karte untereinander. Ab 768px:
Bestandszahl und Entnahme nebeneinander, FEFO darunter über die volle Breite.

### 4. Was unverändert bleibt

- **Unter 768px ändert sich kein Pixel.** Das ist die Abnahmebedingung, nicht
  ein Vorsatz.
- **56px Tap-Flächen bleiben 56px**, auch auf Desktop. `core/theme/tokens.ts:33`
  nennt das eine Einsatzanforderung (Handschuhe), keine Stilfrage. Kein Test
  bewacht das auf einem `min-width`-Zweig — es ist eine Zusage dieser Spec.
- **Feldschrift ≥16px**, `.verfallZeile input` ≥18px
  (`bauform.test.ts:553-560`, `:707-729`).
- **Kein `antd`, kein `@ant-design/icons`, kein `lucide-react`** in diesem Zweig
  (`bauform.test.ts:733-802`, Untergrenze 18 Dateien). Alles handgeschriebenes
  CSS, Icons aus `_ui/ikonen.tsx`.
- **Kein neuer `--lb-*`-Name**, es sei denn er wird in `.rahmen` **und** im
  Dunkelzweig deklariert — sonst schlägt die `unaufloesbar`-Mengenprüfung
  (`bauform.test.ts:540-544`) zu.
- **Kein `--ant-*`** in `_ui/*` (`bauform.test.ts:658-685`).
- Der `prefers-reduced-motion`-Zweig des Scanstrichs bleibt (`:584-595`).

## Die Tests werden mitgezogen, nicht umgangen

`bauform.test.ts:547-551` prüft heute:

```js
expect(css).toMatch(/height:\s*100dvh/);
expect(css).toMatch(/max-width:\s*560px/);
```

gegen den **rohen Dateitext**, nicht gegen den `.rahmen`-Körper. Verschiebt man
`max-width: 560px` auf einen inneren Container, bleibt der Test **grün** — und
bezeugt dann etwas anderes, als sein Name behauptet („kein Breakpoint, eine
Obergrenze").

Ein still falsch gewordener Test ist in diesem Modul der Fehlertyp, gegen den die
halbe Datei geschrieben ist. Er wird deshalb umgestellt:

1. Der `560px`-Nachweis bindet an den **inneren Container**, nicht an die Datei.
2. Neu hinzu: `.rahmen` trägt **keine** `max-width` mehr (der positive Nachweis
   dafür, dass die Trennung aus Abschnitt 1 wirklich vollzogen ist).
3. Neu hinzu: genau **eine** `@media (min-width:`-Abfrage, und sie enthält kein
   `max-width`.
4. Der Testname und sein Kommentar sagen die neue Wahrheit.

`bauform.test.ts:623-629` (`not.toMatch(/@media[^{]*max-width/i)`) bleibt
**unverändert** und läuft durch: `min-width` enthält die Zeichenfolge nicht.

Ebenfalls zu prüfen, bevor der Plan geschrieben wird:

- `_ui/rahmen.test.tsx` und `_ui/HelferRahmen.test.tsx` — beide sollten
  durchlaufen, weil kein `.tsx` angefasst wird. Das ist eine Erwartung, keine
  Messung: sie gehört im Plan belegt, nicht vorausgesetzt.
- `e2e/` — jeder Selektor auf `lb-tableiste`. Playwright fährt eine
  Desktop-Viewport-Größe, die Reiter liegen dort künftig **oben statt unten**.
  Der Knoten bleibt derselbe, ein Selektor auf `data-testid` oder `aria-current`
  trägt also weiter. Was brechen kann, sind Prüfungen auf **Position oder
  Sichtbarkeit im Ansichtsfenster** und alles, was auf die Reihenfolge im
  Zugänglichkeitsbaum baut. Eigener Plan-Task, keine Nebensache.

## Abnahme

1. `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
   `pnpm exec playwright test` — alle grün.
2. Sichtprüfung bei **375px, 768px, 1024px, 1440px** auf: Gate, `/helfer`,
   `/helfer/check`, `/helfer/check?fz=…` (Zählen), `/a/<id>` — in **hell und
   dunkel**, weil der Dunkelzweig ein eigener Variablensatz ist.
3. Die 375px-Bilder sind gegen den heutigen Stand zu halten: **kein sichtbarer
   Unterschied.**
4. Das Gate zeigt bei ≥768px zwei Karten nebeneinander.
5. Die Zähl-Ansicht zeigt bei 1440px mindestens 10 Positionen gleichzeitig.
6. Kein waagerechtes Scrollen auf keiner der geprüften Breiten.
7. Die Messwerte gehören in ein **verfolgtes Artefakt** (Abnahmenotiz im Repo),
   nicht in einen git-ignorierten Bericht.

## Offene Punkte für den Plan

Zwei, beide Maßfragen und beide erst am gerenderten Bild zu beantworten:

- Ob `.inhalt` bei 1200px größere Innenabstände und Zeilenhöhen braucht oder die
  heutigen Werte tragen.
- Die genauen Umbruchpunkte der Zählliste (zwei- bzw. dreispaltig). Der Entwurf
  nennt 768px und 1100px; ob eine Fach-Karte bei 1100px in drei Spalten noch
  lesbar bleibt, entscheidet das Bild.

Der Barcode-Scanner ist **kein** offener Punkt, sondern eine Festlegung:
`.scanVideo` steht auf `max-height: 58vh`, das sind auf 1440×900 rund 522px
Videofläche. Er bekommt im 768px-Zweig eine zusätzliche Obergrenze in px, damit
das Kamerabild auf breiten Schirmen nicht die ganze Ansicht einnimmt.
