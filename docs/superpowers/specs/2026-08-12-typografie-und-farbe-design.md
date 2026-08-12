# Typografie und Farbe — der Charakter des alten Lagerbuchs, suiteweit

**Datum:** 2026-08-12
**Status:** Entwurf zur Abnahme
**Berührt:** `app/layout.tsx`, `app/globals.css`, `core/theme/`, `core/shell/`, `app/m/portal/`,
die beiden Modul-Rollen-Dateien in `feedback` und `lagerbuch`

---

## 1. Auslöser und Umfang

Der Auftrag: „Die UI/UX sollte mehr Typografie bekommen und mehr mit Farben spielen. Das alte
Lagerbuch in `../lagerbuch` hat das ziemlich gut gezeigt; das Moderne und Effiziente darf natürlich
nicht verloren gehen."

Bei der Bestandsaufnahme kam heraus, dass das keine reine Neugestaltung ist. **Ein Teil des
gewünschten Charakters ist in der Suite bereits angelegt und fällt still aus** (§2). Der Auftrag
zerfällt damit in eine Reparatur und einen Ausbau, und die Reparatur trägt den Ausbau.

### Was in dieser Spec liegt

| | Gegenstand | Dateien |
|---|---|---|
| **A** | Die drei Schrift-Rollenvariablen werden real; Display-Familie kommt hinzu | `app/layout.tsx`, `app/globals.css`, `_lib/bauform.test.ts` |
| **B** | Eine Rollen-Leiter der Suite statt zweier modul-eigener | `core/theme/schrift.ts`, die zwei Adapter |
| **C** | Farbvokabular des Vorbilds als Suite-Muster, mit Dunkelzweig | `core/theme/flaechen.module.css` |
| **D** | Sichtbar gemacht in Shell und Portal | `core/shell/`, `app/m/portal/` |

### Was ausdrücklich nicht in dieser Spec liegt

`qr/admin`, das Modul `files`, die Innenseiten von `feedback`, der Kiosk. Sie stehen auf derselben
Grundlage danach an. Sie hier mitzunehmen machte aus einer prüfbaren Spec einen Sweep über fünf
Module — und die Grundlage muss erst an zwei Stellen belegt sein, bevor sie sich lohnt.

**Nicht in dieser Spec, weil es eine eigene Entscheidung wäre:** eine dunkle Kopfzeile in Tinte, wie
das Vorbild sie in seiner Verwaltung hatte. Sie wurde bei der Abnahme gegen die Akzent-Variante
abgewogen und verworfen — sie verlangt einen eigenen Kontrastnachweis für Hell **und** Dunkel und
berührt jedes Modul-Layout.

---

## 2. Der Befund, der die Aufgabe umdreht

`app/m/lagerbuch/_ui/helfer.module.css:64-66` löst seine Schriftstapel so auf:

```css
--lb-display: var(--font-display), "Arial Narrow", sans-serif;
--lb-body:    var(--font-body), system-ui, sans-serif;
--lb-mono:    var(--font-mono), ui-monospace, monospace;
```

Der Kommentar darüber (Zeile 28-29) sagt, diese drei „liegen auf `:root` (Wurzel-Layout)".
**Sie liegen dort nicht.** `app/layout.tsx` registriert `Geist` und `Geist_Mono` und damit
`--font-geist-sans` und `--font-geist-mono` — sonst nichts. Ein `grep` über `src/` findet
`--font-display` an genau drei Stellen: dieser Deklaration, ihrem Kommentar und einem Testkommentar.

Folge: der Helfer-Weg des Lagerbuchs rendert heute in **Arial Narrow / system-ui / ui-monospace**.
Der Ausfall ist still — die Variable löst ins Leere auf, der Fallback greift, nichts protokolliert
etwas. Es ist die Ausprägung von Falle 2 (`docs/design/README.md`), nur mit Schriften statt Farben.

### Warum kein Test das gefunden hat

`app/m/lagerbuch/_lib/bauform.test.ts:519` führt eine Ausnahmeliste:

```js
const VOM_LAYOUT = /^--font-(display|body|mono)$/;
```

Sie nimmt genau diese drei Namen aus **beiden** Mengenprüfungen heraus — aus der Prüfung „nur
`--lb-*` sind erlaubt" und aus der Prüfung „jede benutzte Variable ist auch deklariert". Die
Begründung im Kommentar wiederholt die falsche Annahme aus `helfer.module.css`. Der Test ist an
dieser Stelle nicht der Riegel, sondern die Augenbinde.

**Das ist die wichtigste Zeile dieser Spec:** die Whitelist muss fallen, wenn die Variablen real
werden. Andernfalls ist der Fehler behoben und die Blindstelle bleibt, und der nächste Umbau baut
ihn ungesehen wieder ein.

### Ein Gegenbefund, geprüft und verworfen

`feedback/f/[slugSecret]/zettel.module.css:61` setzt `--serif: var(--font-newsreader), …`, und
`--font-newsreader` steht ebenfalls nicht im Wurzel-Layout. Das ist **kein** zweiter Fall:
`Zustaende.tsx:32` lädt `Newsreader` modul-lokal und hängt `newsreader.variable` in Zeile 61 auf den
Träger `<div class={s.seite}>`. Die Variable ist unter dem Abendzettel aufgelöst. Der Abendzettel
bleibt unangetastet.

### Was der Befund für den Auftrag heißt

Ein Teil von „mehr Typografie" ist keine Gestaltungsfrage, sondern die Wiederherstellung eines
Vertrags, den die Suite schon geschlossen hat. Das senkt das Risiko des ganzen Vorhabens: Teil A ist
Reparatur mit belegbarem Vorher/Nachher, nicht Geschmack.

---

## 3. Die Beschränkung, die die Form bestimmt

`docs/design/README.md`, Abschnitt „Typografie":

> In Admin-Ansichten sind die Werte antds eigene Leiter (12/14/16/20/24/30) — eine dritte Skala im
> Produkt wäre der Fehler, nicht die Lösung.

**„Mehr Typografie" darf also keine neuen Schriftgrößen bedeuten.** Der Charakter kommt aus den vier
anderen Achsen, und genau das war auch der Griff des Vorbilds — es benutzte keine exotischen Größen,
sondern:

1. **Familie** — Barlow Condensed für Struktur, IBM Plex Mono für Daten. Diese Achse fehlt der Suite
   heute vollständig.
2. **Versalien und Laufweite** — das durchgehende Kicker-Muster (`.cardtitle`, `.secthead`,
   `.screenhead`, `.label`, `.fachhead`: versal, `.09em`, in Stahl).
3. **Gewicht** — 600/700 auf der Display-Familie gegen 400/500 im Fließtext.
4. **`font-variant-numeric: tabular-nums`** überall dort, wo Ziffern verglichen werden.

Übernommen werden die **Achsen**, nicht die Skala.

---

## 4. Teil A — die drei Rollenvariablen werden real

### A.1 Entscheidung: eine zusätzliche Familie, nicht drei

`app/layout.tsx` lädt zusätzlich `Barlow_Condensed` (Gewichte 600 und 700, `subsets: ["latin"]`,
`variable: "--font-barlow-condensed"`).

**Geist bleibt Fließtext und Mono.** Begründet aus dem Auftrag: „das Moderne und Effiziente darf
nicht verloren gehen." Das Trio des Vorbilds (Barlow / Barlow Condensed / IBM Plex Mono) zu
übernehmen hieße, Geist abzulösen und damit das Bild **jeder** Fläche der Suite zu ändern — auch der
Module, die in dieser Spec bewusst nicht vorkommen. Eine Familie mehr ist ein Ladevorgang mehr; drei
wären ein Umbau, den niemand bestellt hat.

Die Display-Familie trägt damit nur, was im Vorbild auch sie trug: Marke, Kicker, Überschriften,
große Zahlen. Fließtext, Formulare und Tabelleninhalt bleiben unverändert Geist.

### A.2 Die Deklaration

`app/globals.css` bekommt auf `:root`:

```css
:root {
  --font-display: var(--font-barlow-condensed), "Arial Narrow", sans-serif;
  --font-body:    var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono:    var(--font-geist-mono), ui-monospace, monospace;
}
```

**Warum drei Rollennamen und nicht ein direkter Verweis auf `--font-geist-*`:** weil der Bestand die
drei Namen bereits benutzt und sie Rollen bezeichnen, keine Schriften. Ein späterer Wechsel der
Fließtextschrift ist damit eine Zeile hier, nicht eine Suche über alle Module. Und
`helfer.module.css` bleibt unverändert korrekt, statt auf einen zweiten Namen umgeschrieben zu
werden.

`<html>` trägt zusätzlich `barlowCondensed.variable` in seiner `className`.

### A.3 Die Whitelist fällt

In `_lib/bauform.test.ts` entfällt `VOM_LAYOUT` aus beiden Filtern. Der irreführende Kommentar
(Zeile 500-503) und der in `helfer.module.css:28-29` werden auf den neuen Stand gebracht — sie
sagen künftig, wo die Variablen **wirklich** stehen und dass `globals.css` sie schuldet.

An ihre Stelle tritt eine Zusicherung in `core/theme/` (nicht im Modul, weil die Schuld beim
Wurzel-Layout liegt): ein Quelltext-Scan, der belegt, dass `globals.css` alle drei Namen deklariert
**und** `layout.tsx` die Familie registriert, aus der `--font-display` seinen Wert zieht. Ein Scan,
der nur `globals.css` prüft, ginge durch, wenn jemand die Schrift aus `layout.tsx` entfernt — dann
stünde `var(--font-barlow-condensed)` ins Leere und der Fallback „Arial Narrow" wäre wieder da.

### A.4 Was sonst rot wird

`app/layout.test.tsx` und `app/layout.test.ts` mocken beide `next/font/google`. Der Mock kennt heute
zwei Familien und braucht die dritte. Beides gehört in denselben Commit wie die Änderung.

---

## 5. Teil B — eine Rollen-Leiter der Suite

### B.1 Der Beleg für `core`

Die Regel aus `docs/design/README.md` lautet: **ein zweiter, heute belegbarer Nutznießer.** Er ist
nicht bloß absehbar, er liegt zweifach im Repo:

| Datei | Rollen | Leiter | Ziffern |
|---|---|---|---|
| `app/m/feedback/_ui/typo.ts` (`T`) | kicker · meta · body · lead · h2 · h1 · zahl | antd | `tabular-nums lining-nums` |
| `app/m/lagerbuch/_lib/schrift.ts` (`SCHRIFT`) | titel · abschnitt · feldname · text · neben · zahl · mono | antd | `tabular-nums` |

Zwei unabhängig entstandene Fassungen derselben Sache, beide aus derselben README-Regel abgeleitet,
beide auf antds Leiter, beide mit tabellarischen Ziffern — verschieden nur in den Namen. Das ist
keine Vermutung über einen künftigen Bedarf, sondern eine bereits eingetretene Verdopplung.

### B.2 Die Leiter

`core/theme/schrift.ts` exportiert `SCHRIFT` als `Record<string, CSSProperties>`.
**Kein `"use client"`** — Server Components lesen die Konstante (Falle 6; `lagerbuch/_lib/schrift.ts`
begründet das an Ort und Stelle für seine 23 Seiten).

| Rolle | Größe/Gewicht | Familie | Weitere Griffe |
|---|---|---|---|
| `titel` | 24 / 600 | display | `letterSpacing: .02em`, `lineHeight: 1.2` |
| `unterTitel` | 20 / 600 | display | `letterSpacing: .02em` |
| `kicker` | 12 / 600 | display | versal, `letterSpacing: .09em`, gedämpfte Farbe |
| `zahl` | 30 / 700 | display | `tabular-nums`, `lineHeight: 1` |
| `text` | 14 / 400 | body | `tabular-nums` |
| `neben` | 12 / 400 | body | gedämpfte Farbe |
| `mono` | 12 / 400 | mono | `tabular-nums` |

Alle Größen liegen auf antds Leiter. `lineHeight` steht nur dort, wo es eine Aussage trägt — sonst
gilt antds Vorgabe, damit kein Wert erfunden wird, den ein späterer Leser für geprüft hält (die
Regel stammt aus `typo.ts` und wird übernommen).

**Die gedämpfte Farbe ist eine `--iuk-*`-Variable aus Teil C, nie `--ant-*`** (Falle 2). `typo.ts`
löst das heute über `--fb-muted` und begründet es dort ausführlich; suiteweit braucht es einen
suiteweiten Träger, und den stellt Teil C auf `:root`.

**Daraus folgt eine Reihenfolge, die den Buchstaben widerspricht:** die Variablendeklaration aus
Teil C muss vor Teil B stehen, sonst trägt `kicker` eine Farbe, die es nicht gibt — und der Ausfall
wäre still (Falle 2). Siehe §9.

### B.3 Die zwei Adapter

`feedback/_ui/typo.ts` und `lagerbuch/_lib/schrift.ts` **behalten ihre Exportnamen und ihre Rollen**
und beziehen die Werte aus `core/theme/schrift.ts`.

Der Ertrag: die 23 Verwaltungsseiten des Lagerbuchs und die Feedback-Lagekarte bekommen den
Display-Schnitt, **ohne dass eine Seite angefasst wird**. Genau dafür wurden die Rollen-Dateien
gebaut; hier zahlt es sich zum ersten Mal aus.

Wo die Rollen nicht deckungsgleich sind, bleibt die modul-eigene Rolle bestehen und wird als solche
benannt — `T.lead` (16/600) und `T.h1`/`T.h2` haben in `SCHRIFT` kein Gegenstück, und eine Rolle
nach `core` zu heben, die ein Modul hat, verstößt gegen dieselbe Regel, die den Umzug hier
rechtfertigt.

### B.4 Eine Annahme wird ausgetragen, nicht überschrieben

`lagerbuch/_lib/schrift.ts` trägt im Kopf:

> **DIE VERWALTUNG BEKOMMT GEIST** … Die Display-Rolle trug in der Verwaltung Struktur, nicht Marke
> — und Struktur lässt sich mit Größe, Gewicht, Laufweite und Versalien ebenso ausdrücken.
> ANNAHME A-S1: die drei Schriften sind KEINE CD-Vorgabe (Betreiberfrage 29, unbeantwortet).

Der Auftrag nimmt diese Entscheidung zurück. Der Kommentar wird **umgeschrieben, nicht gelöscht**:
er hält fest, dass die Display-Rolle jetzt eine Familie trägt, wer das entschieden hat und wann.
Eine stillschweigende Umkehr wäre für den nächsten Leser nicht von einem Versehen zu unterscheiden.

A-S1 selbst bleibt unberührt und weiterhin offen — sie sagt „nicht CD-gebunden", und daraus folgt
die Freiheit, Barlow Condensed zu wählen, nicht die Pflicht, es zu lassen.

---

## 6. Teil C — Farbvokabular mit Dunkelzweig

### C.1 Der Träger

`core/theme/flaechen.module.css`, importiert im Wurzel-Layout, deklariert `--iuk-*`-Variablen auf
`:root` und einen zweiten Satz unter `:root[data-theme="dark"]`.

**Nie `--ant-*`** (Falle 2): antd deklariert seine Variablen auf der Scope-Klasse an den
Wurzelelementen seiner eigenen Komponenten, nicht auf `:root`. Eigenes Markup sieht sie nicht, und
der Ausfall ist still.

**`data-theme`, nicht `prefers-color-scheme`**: die Suite hat einen Umschalter (Cookie `iuk-theme`,
serverseitig gelesen); auf die Systemvorliebe zu selektieren bräche den Fall „System dunkel,
Umschalter hell".

### C.2 Der größte versteckte Posten

**Das Vorbild hat keinen Dunkelmodus.** Seine Palette ist durchgehend hell — `#f6f8f9`,
`--rot-bg: #fbe9eb`, die Tinte-Seitenleiste, Schatten in `rgba(12,18,24,.16)`. Jede portierte Farbe
braucht ein Gegenstück, und das ist kein Nachtrag, sondern die Hälfte der Arbeit an Teil C.

Vorlage ist `app/m/lagerbuch/_ui/verwaltung.module.css:1-33`: dort steht der vollständige Satz für
beide Modi bereits, aus der Portierung des Vorbilds gewonnen. Die Suite-Variablen übernehmen diese
Werte, statt sie ein zweites Mal herzuleiten.

### C.3 Das Vokabular

| Baustein | Griff |
|---|---|
| KPI-Kachel | `border-inline-start: 4px` in rot / gelb / ok / stahl |
| Chip | Fläche und Text als **Paar** (`--iuk-ampel-ok-flaeche` + `--iuk-ampel-ok-text`), nie antds `Tag`-Vorgabe |
| Abschnittsstreifen in Karten | eigene Fläche, hell `#f6f8f9`, dunkel `#1c2024` |
| Journal-Delta | grün / rot, zusätzlich mit Vorzeichen |
| Gefahrenzone | 1px rote Kontur, versaler Titel in Rot |

### C.4 Die Linie, die das Vorbild nicht ziehen musste

`core/theme/theme.ts` setzt `colorError = colorPrimary = #c8000f`. Ein `Alert type="error"` ist
damit optisch eine Primäraktion. Das Vorbild konnte Rot frei als Markenfarbe einsetzen; die Suite
kann das nicht überall.

**Die Regel, die in `docs/design/README.md` nachgetragen wird:**

- Rot auf **Chrome** — Markenstreifen, Aktivzustand der Navigation, Wortmarke, Gefahrenzone: ja.
- Rot auf einer **Datenfläche** in einem Modul, wo Rot fachlich etwas bedeutet: nie. Dort gilt eine
  eigene, getrennte Ampelfarbe.

`lagerbuch` trennt bereits `--lb-ampel-rot-text` (`#8c0d16`) von `--lb-rot` (`#c8000f`), und
`feedback` hält Rot ganz von der Notenskala fern. Die Trennung ist gelebte Praxis; sie wird nur
aufgeschrieben.

**Barrierefreiheit, ohne Ausnahme:** Bedeutung nie allein über Farbe. Jeder Chip trägt Text, jedes
Delta ein Vorzeichen, der aktive Navigationseintrag behält `font-weight: 600` zusätzlich zur Farbe.
Kontrast wird belegt, nicht geschätzt — für beide Modi.

---

## 7. Teil D — sichtbar in Shell und Portal

### D.1 Shell

- **5px Markenstreifen** über der Kopfzeile, in Suite-Rot. Der Griff des Vorbilds (`.stripe`), der
  am billigsten am meisten tut.
- **Wortmarke und Modultitel** im Display-Schnitt, beide über `SCHRIFT.unterTitel` (20/600). **Keine
  achte Rolle für die Marke** — die Kopfzeile ist 64px hoch, 24px wären darin zu laut, und eine Rolle
  mit einem einzigen Anwender ist eine Konvention, keine Komponente (dieselbe Regel, die §5.1 für
  `core` überhaupt erst erfüllt sieht). Die Sperrung `.07em` des Vorbilds kommt am Ort der
  Verwendung dazu, so wie `typo.ts` es für Knöpfe vormacht (`{ ...T.body, fontWeight: 600 }`).
- **`.navLink[aria-current]`** bekommt Suite-Rot für Unterkante **und** Schrift, statt `currentColor`.
  `font-weight: 600` bleibt — die Markierung darf nicht allein an Farbe hängen.
- **`.drawerTitel`** wird ein echter Kicker (Display, `.09em`) statt `opacity: 0.6`.

**Die Kaskade ist hier der Gegner, nicht die Gestaltung.** `shell.module.css` dokumentiert an drei
Stellen ausführlich, wie eigene Regeln gegen antd verloren haben (`.nurMobil` gegen `.ant-btn`,
`padding-inline` gegen `.ant-layout-header`). Jede neue Regel auf einer antd-Fläche geht denselben
Weg: erst prüfen, ob antd einen **Token** anbietet (dann `core/theme/theme.ts`), sonst eine Klasse
mehr voranstellen — nie `!important`, und die Erhöhung kommentieren.

Der Markenstreifen sitzt bewusst **über** `<Header>` als eigenes Geschwister, nicht als
`border-block-start` an `.kopf`: eine Kante an der antd-Fläche wäre wieder ein Spezifitätsstreit,
ein eigenes Element ist keiner.

### D.2 Portal

`app/m/portal/page.tsx` trägt heute `fontWeight: 600` und `fontSize: 14, opacity: 0.65` inline. Die
Kacheln bekommen `SCHRIFT.titel`/`SCHRIFT.neben`, darüber einen Kicker, und eine farbige Innenkante
je Modul.

`Card.Meta` bleibt verboten (Falle 1, Server Component) — das ist heute schon so gelöst und im
Quelltext begründet.

### D.3 Zwei Punkte, die vor der Zusage gemessen werden

1. **Versalien auf `Table`-Spaltenköpfen.** antd bietet für `Table` nur `headerBg`, `headerColor`
   und `headerSplitColor` an — keinen Schrift-Token. Kicker-Spaltenköpfe brauchen daher CSS gegen
   `.ant-table-thead th`, also eine dokumentierte Spezifitätserhöhung und eine bewusst eingegangene
   Kopplung an einen antd-internen Klassennamen. **Fällt die Messung ungünstig aus, entfällt der
   Punkt** — er ist keine Voraussetzung für den Rest.
2. **Ob Barlow Condensed neben Geist trägt.** Das entscheidet ein Blick im Browser in beiden Modi,
   nicht dieses Dokument. Fällt es billig aus, wird die Familie getauscht, nicht die Rollenstruktur
   — sie ist absichtlich eine Rollen- und keine Schriftliste.

---

## 8. Prüfung — wer welche Aussage besitzt

`docs/design/README.md` teilt die Zuständigkeit; sie gilt hier unverändert.

| Aussage | Wer sie besitzt |
|---|---|
| „`globals.css` deklariert alle drei `--font-*`, `layout.tsx` registriert die Familie" | Quelltext-Scan (Vitest), neu in `core/theme/` |
| „`helfer.module.css` benutzt keine unauflösbare Variable" | `bauform.test.ts` — **ohne** `VOM_LAYOUT` |
| „Die Rollen liegen auf antds Leiter, keine dritte Skala" | Vitest gegen `core/theme/schrift.ts` |
| „Beide Adapter beziehen ihre Werte aus `core`" | Vitest, Wertevergleich |
| „Der Aktivzustand ist mobil **und** auf dem Desktop richtig" | Playwright bei 390×844 **und** 1280×720 |
| „Der Markenstreifen verdrängt die Kopfzeile nicht" | Playwright, Höhenmessung — der 390er Test misst `[data-testid="suite-header"]` |
| „Die Schrift kommt wirklich an" | Playwright: `getComputedStyle(...).fontFamily` enthält Barlow Condensed |

**Der letzte Punkt ist der wichtigste und der einzige, der den Ursprungsfehler wirklich fängt.** Ein
Quelltext-Scan kann eine Kaskadenkollision strukturell nicht sehen, und ein fehlgeschlagener
Font-Fallback ist von einer erfolgreichen Zuweisung im Quelltext nicht zu unterscheiden. Nur ein
echter Browser weiß, welche Familie gerendert wurde.

**Gemessen wird in beiden Modi.** Der Dunkelzweig aus Teil C ist die Hälfte der Arbeit und hätte
sonst keine Zusicherung.

Die Tore bleiben: `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
`pnpm exec playwright test`. Kein offener `pnpm dev` während des E2E-Laufs.

---

## 9. Reihenfolge

**A → C → B → D**, und die Vertauschung von B und C ist Absicht, kein Tippfehler. Jeder Schritt ist
für sich lauffähig und abnehmbar.

- **A** ist Reparatur mit belegbarem Vorher/Nachher und trägt alles Weitere. Nach A allein hat der
  Helfer-Weg seinen Charakter zurück.
- **C vor B**, weil `SCHRIFT.kicker` und `SCHRIFT.neben` eine gedämpfte Farbe tragen und die aus dem
  `--iuk-*`-Satz kommt (§5.2). Andersherum stünde die Farbe ins Leere, und zwar still.
- **B** ohne A wäre wirkungslos — die Familie stünde ins Leere.
- **D** benutzt beides und ist das, was man sieht.

---

## 10. Offene Punkte

| | Punkt | Wer entscheidet |
|---|---|---|
| 1 | Trägt Barlow Condensed neben Geist? (§7.3) | Messung im Browser, beide Modi |
| 2 | Versalien auf `Table`-Spaltenköpfen — Spezifität vertretbar? (§7.3) | Messung; im Zweifel entfällt der Punkt |
| 3 | Betreiberfrage 29 (sind die drei Schriften CD-gebunden?) bleibt unbeantwortet | Betreiber; berührt diese Spec nicht, weil die Rollen Rollen und keine Schriftnamen sind |
