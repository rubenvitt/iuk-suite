# Mobiler Durchgang der Admin-Arbeitsseiten

**Datum:** 2026-07-27
**Status:** Entwurf zur Abnahme
**Teilprojekt C von drei** (siehe `2026-07-27-suite-chrome-design.md` §1)

---

## 1. Umfang und Abgrenzung

Teilprojekt **A** hat der Suite eine mobil brauchbare Kopfzeile, einen Drawer, die Zoom-Sperre und die
16px-Untergrenze für Eingabefelder gegeben — und die Querschnittsregeln, an denen C sich ausrichtet
(`docs/design/README.md`, Abschnitt „Mobil — ein Breakpoint, vier Regeln"). **B** behandelt Auth.
**C ist der Durchgang durch die Seiten**, die unter dieser Shell liegen.

Der Nutzer hat den Umfang selbst gewählt: „Shell + alle Admin-Arbeitsseiten". Die Shell ist mit A
erledigt. C nimmt sich vor:

| Modul | Seiten im Umfang |
|---|---|
| `feedback`-Admin | `/`, `/vergleich`, `/groups/[id]`, `/groups/[id]/trend`, `/groups/[id]/evenings/[id]/auswertung` — plus die 18 `_ui`-Bausteine, die sie rendern |
| `portal`-Admin | `/admin` (und die Modulwurzel `/`, weil sie der Weg dorthin ist) |
| `qr`-Admin | `/admin` — dazu die Generatorseiten `/`, `/qr`, `/wifi`, `/tel`, `/contact`, weil die Messung dort Befunde ergeben hat (§4) |

**Nicht in C** — mit Begründung in §6: die öffentliche Ausfüll-Ansicht (`feedback/f/**`), der Druckbogen
(`feedback/(print)/aushang`), die Wegwerf-Module (`alpha`, `beta`, `gamma`, `kioskdemo`), der
`size="large"`-Bestand des qr-Moduls, und ein zweiter Breakpoint irgendeiner Art.

---

## 2. Wie die Bestandsaufnahme entstanden ist

Der Spec enthält **keine** Vermutungen. Jeder Befund in §4 trägt eine Zahl, die aus einem echten Browser
kommt, oder er ist ausdrücklich als „strukturell, nicht gemessen" gekennzeichnet.

**Aufbau:** `next dev` auf `:3000`, Chrome unter CDP-Emulation `390x844x3, mobile, touch` (nicht
`resize_page` — ein macOS-Fenster wird nicht schmaler als ~500px, und `window.innerWidth` hätte dann
still 500 gemeldet statt 390; das wurde nach jedem Wechsel per `evaluate_script` nachgeprüft).
Anmeldung als `dev@localtest.me` mit `da-feedback-admin`, `dashboard-admins`, `drk-qr-admin` — die
Gruppennamen stammen aus `e2e/portal.spec.ts:13` und `e2e/feedback.spec.ts:527`, nicht aus einer
Rekonstruktion. `AUTH_COOKIE_DOMAIN=.localtest.me` trägt die eine Sitzung über alle Modul-Hosts.

**Angesehen wurden 17 Seitenaufrufe bei 390px** (nicht geschätzt, gezählt): feedback `/`, `/vergleich`,
`/groups/1`, `/groups/2` (mit ausgeklapptem Einstellungen-Block, weil die Zuordnungstabelle nur dort
sichtbar wird), `/groups/1/evenings/1/auswertung`, `/groups/1/evenings/3` (Redirect), `/groups/1/trend`,
`/aushang/1`, `/login`; portal `/`, `/admin`; qr `/`, `/admin`, `/qr?data=…`, `/wifi`, `/tel`,
`/contact`. Dazu Kontrollläufe bei **700×900** (feedback `/groups/2`, `/vergleich`) — der Bereich
zwischen 600 und 768px, aus dem §5.2 kommt — und bei **768×900**, **900×800** und **1280×800**
(feedback `/groups/2`), aus denen §5.4 kommt. Bei 768×900 wurden zusätzlich **beide dort erwogenen
Behebungen im DOM durchgespielt und vermessen**, bevor eine davon in einen Plan geschrieben wurde;
das Ergebnis steht in §5.4 und hat die Entscheidung umgedreht.

**Das Maß.** Der naheliegende Indikator `document.documentElement.scrollWidth > window.innerWidth`
findet nicht alles: eine Tabelle in einem eigenen Overflow-Container bewegt das Dokument nicht. Gemessen
wurde deshalb je Seite dreierlei:

1. `documentElement.scrollWidth` gegen `innerWidth`,
2. jedes Element, dessen `getBoundingClientRect().right` über `innerWidth` liegt,
3. für jede antd-`Table` die `scrollWidth` der `<table>` gegen die `clientWidth` ihres Containers.

Dazu die Trefferflächen (`height`/`width` jedes Knopfes und Links) und die Textkürzungen
(`scrollWidth > clientWidth` an blattlosen Elementen).

**Was das nicht kann.** Der Dev-Seed ist klein: eine Gruppe hat zwei Abende, das qr-Modul ein Preset mit
kurzem Namen. Wo ein Befund von der Länge realer Daten abhängt, wurde er entweder mit echten Daten
erzeugt (die lange URL im qr-Verlauf: einmal wirklich einen Code erzeugt) oder durch Verlängern des
DOM-Textes simuliert und **als Simulation gekennzeichnet** (qr-Admin-Zeile). Nichts wurde in eine
Datenbank geschrieben.

---

## 3. Drei Rohbefunde, die die Messung widerlegt hat

Sie stehen hier, weil sie sonst beim nächsten Durchgang erneut „gefunden" werden.

**`feedback/_ui/Verlauf.tsx:294` — Tabelle ohne `scroll={{x}}`, Spaltenbreiten 140+110+150+150+130 =
680px.** Die Rechnung stimmt, der Schluss nicht. Die Tabelle liegt in `<div class="fb-verlauf-breit">`,
und `feedback.css:187-190` setzt die Klasse per Vorgabe auf `display: none`; erst ab 768px
(`feedback.css:197`) erscheint sie. Bei 390px steht dort die `SchmaleListe`. Gemessen: die Elementkette
über der Tabelle meldet `display: none`, Breite 0, `documentElement.scrollWidth` 390. Ab 768px stehen der
Tabelle 736px zur Verfügung — 680 passen. **Kein Befund, keine Änderung.** Diese Datei ist im Gegenteil
das Vorbild: zwei Darstellungen im HTML, CSS blendet eine aus, kein `Grid.useBreakpoint`.

> **Nachgemessen statt gerechnet.** „736 verfügbar, 680 passen" wäre Arithmetik gewesen; bei 768×900 auf
> `/groups/2` gemessen: `.fb-verlauf-breit` ist `display: block`, 736px breit, die `<table>` 736px, ihre
> `scrollWidth` 736 — kein Überlauf. Die Spalte „Thema" (die einzige ohne `width`) wird dabei auf
> **56px** zusammengedrückt und ist mit `ellipsis: true` gekürzt. Das ist eng, aber es ist die einzige
> Spalte, die dafür ausgelegt ist, und `Thema` steht in der Schmalliste ungekürzt. Bei genau diesem
> Viewport fiel dagegen ein anderer Überlauf auf — er sitzt in der Kopfzeile, nicht in der Tabelle, und
> steht in §5.4.

**`qr/page.tsx:43` — `<Col span={8}>` ohne `xs`, „drei Spalten auch auf 390px".** Drei Spalten sind es,
aber sie passen: gemessen 123px je Spalte, ~111px innen, Kachelhöhe 72px, `documentElement.scrollWidth`
390. Ein `xs={8}` zu ergänzen änderte kein einziges Pixel, weil `span` ohnehin für alle Breiten gilt.
Die naheliegende Alternative — auf das Muster des Nachbarn `PresetGrid.tsx:33` (`xs={12} sm={8}`) zu
gehen — machte es **schlechter**: drei Kacheln in einem zweispaltigen Raster stehen 2+1, mit einer Lücke
rechts unten. **Keine Änderung**, und die Begründung steht hier, damit sie nicht als Versäumnis gilt.

**`feedback/_ui/Zuordnung.tsx:286` — die Kennung (OIDC-`sub`) ohne `wordBreak`.** Strukturell richtig
beobachtet, praktisch folgenlos: antd setzt an Tabellenzellen `overflow-wrap: break-word`, und das bricht
ein zu langes Wort auch ohne Trennstellen. Gemessen an einer echten Zuordnung mit
`da53e72e-d91b-415d-98e5-4fb5db963d29`: 198px Spaltenbreite, zwei Zeilen, 41px hoch, kein Überlauf,
`documentElement.scrollWidth` 390. **Kein Befund.**

---

## 4. Was gemessen wurde

Schweregrade: **unbenutzbar** = Inhalt nicht erreichbar, Bedienelement nicht treffbar, oder die Seite
scrollt seitwärts (und wegen der Zoom-Sperre aus A kann niemand mehr herauszoomen, um es zu sehen).
**unschön** = Abstände, Umbrüche, Regelverstoß ohne Funktionsverlust.

### 4.1 Seiten, die seitwärts scrollen — vier Stellen, alle gemessen

| Stelle | Messung bei 390px | Grad |
|---|---|---|
| `portal/admin/service-table.tsx:25` | Tabelle **483px** in einem **358px**-Container, `overflow-x: visible` am `.ant-table-content` ⇒ `documentElement.scrollWidth` **499**. Beide „Löschen"-Knöpfe stehen rechts außerhalb des Sichtfelds. | unbenutzbar |
| `feedback/_ui/VergleichTabelle.tsx:48` | Tabelle **545px** in **358px** ⇒ `documentElement.scrollWidth` **561**. Spaltenbreiten gemessen: GRUPPE 100, ABENDE 73, RÜCKLAUF Ø 91, Ø NOTE 133, VERLAUF 148. Die Spalte VERLAUF ist vollständig unerreichbar. | unbenutzbar |
| `qr/QrView.tsx:89` | `<h1>` mit einem URL-Label: **449px** breit bei 390px Sichtfeld, `word-break: normal`, `overflow-wrap: normal` ⇒ `documentElement.scrollWidth` **420**. Die Überschrift ist mittig gesetzt, also fehlt links *und* rechts etwas — der Screenshot beginnt mit „ps://wiki.iuk-". Zehn Zeilen tiefer trägt derselbe Text als `qr-raw` ein `wordBreak: "break-all"` (`QrView.tsx:106`) und bricht sauber. | unbenutzbar |
| `qr/HistoryList.tsx:50` | Nach echtem Erzeugen eines Codes mit einer 95 Zeichen langen URL: Knopf 358px breit, Inhalt **557px** (`scrollWidth`), das innere `<span>` **757px**, `white-space: nowrap` (antds Button-Basisstil), `overflow: visible` ⇒ `documentElement.scrollWidth` **574**. Der Gegenbeweis steht im selben Modul: `PresetGrid.tsx:41` setzt an derselben Konstruktion `whiteSpace: "normal"`. | unbenutzbar |

Dazu eine fünfte, **simuliert statt gemessen**, weil der Seed sie nicht auslöst:

| Stelle | Simulation | Grad |
|---|---|---|
| `qr/admin/page.tsx:42-58` | Das `<li>` ist `display:flex; justify-content: space-between` **ohne** `flexWrap`, und keines der beiden Kind-`<span>` hat `min-width: 0`. Mit dem Seed-Preset („Beispiel-Link" / `demo-url`) passt es: `scrollWidth` 356 = `clientWidth` 356. Nach Verlängern des Labels auf „Einsatzleitung Rettungsdienst Ortsverein" und des Slugs entsprechend — **nur im DOM, nichts geschrieben** — springt `scrollWidth` auf **427** bei 356 Container und `documentElement.scrollWidth` auf **444**; der „Löschen"-Knopf steht außerhalb. Ein Flex-Item hat `min-width: auto`: der linke Block kann nicht schrumpfen und darf nicht umbrechen. | unbenutzbar |

### 4.2 Handlungsknöpfe, die nicht volle Breite haben

Die Suite-Regel lautet: unter 768px volle Breite, untereinander. Gemessen auf `feedback/groups/2` bei
390px — 6 von 17 Knöpfen halten sie, 8 nicht (die restlichen drei sind Kopfzeile und Menü):

| Stelle | gemessene Breite | Grad |
|---|---|---|
| `feedback/_ui/Teilnahme.tsx:165` „Aushang drucken" | **144px** — direkt neben „Kopieren" und „PNG", die beide **324px** haben. Beide Geschwister tragen `className="fb-block-mobil"`, dieser eine nicht. Sichtbare Inkonsistenz in derselben Reihe. | unschön |
| `feedback/_ui/Verlauf.tsx:149-165` „Trend" / „CSV (alle Abende)" / „Abend ohne Feedback nachtragen" | **68 / 146 / 251px**, nebeneinander bzw. umgebrochen, alle `type="text"` ohne Rahmen. Die einzige Knopfreihe des Moduls ganz ohne `fb-knopfzeile`. | unschön |
| `feedback/(admin)/groups/[groupId]/page.tsx:437` „Auswertung ansehen" | **167px** in einem `flexWrap`-Container neben `Statistic` und `Notenpille` | unschön |
| `feedback/_ui/EinstellungenPanel.tsx:373` „Neues Secret erzeugen" / „Gruppe löschen" | **181 / 133px** — die beiden folgenschwersten Aktionen des Moduls stehen linksbündig als schmale Stummel | unschön |
| `portal/admin/service-form.tsx:35` „Anlegen" | **84px** wegen `alignSelf: "flex-start"` | unschön |

### 4.3 Trefferflächen unter 44px

`controlHeight` ist 56, `controlHeightSM` leitet antd daraus als 42 ab — **nicht** 24, wie eine
Rechnung mit antds Default nahelegt. Gemessen:

| Stelle | Messung | Grad |
|---|---|---|
| `feedback/_ui/Verlauf.tsx:618` das „…"-Menü der Verlaufszeile | **24 × 42px**. Die Höhe ist grenzwertig, die **Breite von 24px** ist der eigentliche Defekt — das ist das einzige Bedienelement der Zeile für „Bearbeiten" und „Löschen". | unbenutzbar |
| `feedback/_ui/Zuordnung.tsx:199` „Entfernen" | 78 × **42px**, in einer 110px-Spalte am rechten Rand | unschön |
| `feedback/_ui/Verlauf.tsx:570` „Jetzt starten" | `size="small"`, in der Schmalliste bei 390px erreichbar | unschön |
| `portal/admin/service-table.tsx:46` „Löschen" | 70 × **42px** — zerstörende Aktion ohne Rückfrage, in der Spalte, die bei 390px außerhalb des Sichtfelds liegt (§4.1) | unschön, im Verbund mit §4.1 aber der riskanteste Punkt des Portals |
| `feedback/_ui/TrendDiagramm.tsx:88` bis zu 8 Frage-Schalter | `size="small"`; nicht gemessen, weil die Trendseite nicht lädt (§5.1) | unschön |

Die vier `size`-Angaben verstoßen gegen eine Regel, die das Modul zwei Dateien weiter selbst zitiert
(`Zuordnung.tsx:387`: „§4.14: `size` gar nicht setzen — `controlHeight` ist bereits 56"). Ausdrücklich
**nicht** betroffen ist `Aktualisierer.tsx:80`, wo `size="small"` mit Begründung im Quelltext steht, und
`size` am `<Table>` selbst (das ist Zellpolster, kein Bedienelement).

### 4.4 Abgeschnittener Text

| Stelle | Messung | Grad |
|---|---|---|
| `feedback/_ui/Lagekarte.tsx:208` | Der Kartentitel „NÄCHSTER SCHRITT" braucht **140px**, bekommt **94px** und wird zu „NÄCHSTER …". Ursache ist antds `Card`-Kopf: `title` und `extra` teilen sich eine Zeile, und das `extra` („Gerade läuft kein Feedback.") nimmt den Rest. `.ant-card-head-title` trägt `white-space: nowrap; text-overflow: ellipsis`. Der einzige Fall im ganzen Durchgang, in dem bei 390px Text *verschwindet*. | unschön (Informationsverlust) |
| `feedback/_ui/StartFormular.tsx:103` | `<Col xs={12} sm={6}>` für „Teilnehmer" — halbe Zeile, während alle Nachbarn `xs={24}` sind. Gemessen: das Zahlenfeld steht allein und halb breit unter zwei vollbreiten Feldern und sieht abgeschnitten aus, nicht bewusst schmal. | unschön |

---

## 5. Die zwei Entscheidungen, an denen mehr hängt als an einer Zeile

### 5.1 Die Trendseite antwortet mit HTTP 500 — und das blockiert C

`/groups/[groupId]/trend` lädt nicht. Reproduziert mit hartem Neuladen, Stack im Dev-Log:

```
TypeError: MONATS_FENSTER.includes is not a function
  at fensterAus (trend/page.tsx:169)
  at TrendPage (trend/page.tsx:55)
```

`MONATS_FENSTER = [6, 12, 24] as const` steht in `_ui/Segment.tsx:27` — und `Segment.tsx` trägt in
Zeile 1 `"use client"`. Eine Server Component, die einen **Wert** (kein Element, keine Funktion) aus
einem Client-Modul importiert, bekommt keinen Array, sondern eine Client-Referenz. `.includes` gibt es
darauf nicht.

**Das ist dieselbe Familie wie Falle 1** aus `docs/design/README.md` — eine Grenzverletzung zwischen RSC
und Client, die **`pnpm build` nicht findet** und `pnpm typecheck` erst recht nicht: TypeScript sieht
`readonly [6, 12, 24]` und ist zufrieden. Ein Vitest fängt sie auch nicht, weil unter Vitest beide
Module normale ES-Module sind.

**Warum das zu C gehört, obwohl es kein 390px-Defekt ist:** drei der 18 `_ui`-Bausteine
(`TrendDiagramm`, `NotenVerlauf`, `Segment`) werden **ausschließlich** von dieser Seite gerendert. Ohne
sie ist ein Sechstel des beauftragten Umfangs weder anzusehen noch abzunehmen. C beginnt deshalb damit
und schreibt die Falle als **Falle 6** in `docs/design/README.md` fort.

**Die Behebung ist eine Zeile Umzug, kein Umbau:** die Konstante wandert nach `_lib/`, wo sie kein
`"use client"` trägt; `Segment.tsx` importiert sie von dort statt sie zu exportieren. Ein
Regressionstest, der sie aus einem Modul **ohne** `"use client"` importiert, hält die Grenze fest.

**Einmal im Bestand — und es wurde nach allen gesucht.** Bevor daraus eine Falle in
`docs/design/README.md` wird, muss belegt sein, dass sie eine Klasse ist und nicht eine Anekdote.
Gesucht wurde über `src/**` nach allen Modulen mit `"use client"` (39 Stück) und darin nach Exporten,
die keine Komponente sind. Es gibt genau vier:

| Export | Modul | von einer Server Component importiert? |
|---|---|---|
| `MONATS_FENSTER` | `_ui/Segment.tsx` | **ja** — `trend/page.tsx:11` ⇒ der Defekt |
| `MAX_SERIEN` | `_ui/NotenVerlauf.tsx` | nein — nur `_ui/TrendDiagramm.tsx`, das selbst `"use client"` trägt |
| `AKTUALISIERUNGS_TAKT_MS` | `_ui/Aktualisierer.tsx` | nein — kein Importeur außerhalb des Moduls |
| `SPERRE_MS`, `ENTWURF_VERFALL_MS` | `f/[slugSecret]/Zettel.tsx` | nein — kein Importeur außerhalb des Moduls |

Ausdrücklich mitgeprüft, weil es der naheliegendste Beinahe-Treffer wäre: `_ui/Teilnahme.tsx`
exportiert die Hilfsfunktion `teilnahmeUrlAus`, und **zwei** Server Components rufen sie
(`groups/[groupId]/page.tsx:186`, `(print)/aushang/[groupId]/page.tsx:6`). Nachgesehen statt
geschlossen: `Teilnahme.tsx` trägt **kein** `"use client"` — die Datei beginnt mit
`import type { CSSProperties }`. Kein zweiter 500er, der nur an den Seed-Daten vorbeigelaufen ist.

Ein Treffer aus vier Kandidaten, bei vollständiger Suche: das trägt einen Eintrag im Fallenverzeichnis,
und der Eintrag darf sagen, wie man danach sucht.

### 5.2 Das Modul `feedback` schaltet bei 600px, die Suite bei 768px

`feedback.css` kennt drei Breakpoints: **600px** (`max-width`) für Kartenpolster, Notenlegende,
`.fb-knopfzeile`, `.fb-block-mobil` und die Spurzeilen — sechs Regelblöcke; **768px** (`min-width`) nur
für die Verlauf-Umschaltung; **992px** (`min-width`) nur für `.fb-sticky`.

Bei 390px ist das folgenlos, und genau deshalb wäre es beinahe durchgerutscht. Der Kontrolllauf bei
**700×900** zeigt, was daran falsch ist — gemessen auf `feedback/groups/2`:

- Der Menü-Knopf der Shell ist sichtbar (`display: flex`) — die Suite sagt „das ist mobil".
- Der Verlauf zeigt die Schmalliste (`.fb-verlauf-breit` = `none`) — auch das sagt „mobil".
- Die Knöpfe stehen trotzdem nebeneinander und inhaltsbreit: „Feedback starten" **144px**,
  „QR-Code groß zeigen" **170px**, „Kopieren" **88px**, „PNG" **61px**.

Auf jedem Gerät zwischen 601 und 767px — jedes Tablet im Hochformat — ist die Oberfläche also halb
umgeschaltet. Ein 88px breiter „Kopieren"-Knopf neben einem Menü-Hamburger ist kein Entwurf, das ist ein
Riss.

**Entscheidung: die sechs `max-width: 600px`-Blöcke werden zu `max-width: 767.98px`.** Nicht
`max-width: 768px` — sonst gälten bei exakt 768px beide Regeln gleichzeitig, und welche gewinnt, hinge
an der Reihenfolge im Stylesheet.

Der Quelltext begründet die 600 heute mit „die sechsspaltige Tabelle braucht mehr Breite als eine
Knopfzeile oder eine Legende" (`feedback.css:183-185`). Das erklärt, warum die *Tabelle* bei 768
umschaltet — es erklärt nicht, warum die Knopfzeile bei 600 bleiben müsste. Die Suite-Regel aus A kennt
einen Breakpoint; ein Modul, das einen zweiten führt, macht jede spätere Aussage über „mobil"
mehrdeutig. Der Kommentar wird mitgeändert, sonst widerspricht er nach der Umstellung dem Code.

**Was mit den 992px passiert: nichts, und das ist begründet.** `feedback.css:277` (`.fb-sticky`) ist
formal ein dritter Breakpoint. Er ist aber **keine Mobil-/Desktop-Umschaltung**, sondern die Schwelle,
ab der die Seite `groups/[groupId]` überhaupt zwei Spalten hat: `page.tsx:225,254` setzt
`<Col xs={24} lg={…}>`, und `lg` **ist** 992 (antd). Eine mitfahrende rechte Karte in einer
einspaltigen Seite wäre sinnlos — sie klebte über der Lagekarte. Der Wert folgt also einer
Rasterentscheidung im selben Modul, nicht einer zweiten Vorstellung davon, was „mobil" heißt. Er bleibt.

Der Test aus §8 prüft deshalb **die begründete Menge** `{767.98, 768, 992}` und nennt jeden Wert samt
Grund im Testkommentar — nach dem Muster von `shell-css.test.ts:32-36`, das für die Shell dasselbe mit
`new Set` tut. „Ein Breakpoint" ist die Regel für die *Umschaltung*; `lg` ist ein Rasterwert. Wer diese
Unterscheidung nicht in den Test schreibt, hinterlässt einem Leser drei Zahlen neben dem Satz „genau
einer".

**Nachgeprüft, dass die Umstellung nichts kaputtmacht:** die Spurzeilen-Regel
(`feedback.css:370-394`) legt zwischen 600 und 768 die Notenspur in eine zweite Rasterreihe statt sie in
336px zu quetschen — bei 700px sind 336px zwar da, aber die zweizeilige Fassung ist dort nicht falsch,
nur luftiger. Die Notenlegende zeigt zwei Anker statt sechs Wörter — ebenfalls nicht falsch. Das
Kartenpolster geht von 20 auf 16px. Keine dieser drei Änderungen nimmt Information weg.

### 5.3 Wie die zwei überlaufenden Tabellen behandelt werden

`docs/design/README.md` schreibt vor: „antd-`Table` scrollt auf schmalen Geräten (`scroll={{ x: … }}`),
sie bricht nicht um." Die Frage ist nur, **welcher Wert**.

Nachgesehen: **keine** der beiden Tabellen setzt an **irgendeiner** Spalte ein `width`
(`VergleichTabelle.tsx:55-104`, `service-table.tsx:31-52`). Eine Pixelsumme gibt es also nicht zu
bilden; jede Zahl wäre erfunden. Beide bekommen **`scroll={{ x: "max-content" }}`**.

Der Unterschied zu `Verlauf.tsx:294`, wo 680px die richtige Zahl *wäre*: dort tragen fünf von sechs
Spalten ein `width`. Dass die Tabelle die Prop trotzdem nicht braucht, steht in §3.

**Die naheliegende Sorge — „`scroll.x` schaltet auf `table-layout: fixed`, und dann sieht die Tabelle
auf dem Desktop anders aus" — trifft hier nicht zu, und das ist nachgesehen, nicht gehofft.**
`@rc-component/table@1.10.4`, `lib/Table.js:426-442` entscheidet die Layout-Art so:

```js
if (fixColumn)  return mergedScrollX === 'max-content' ? 'auto' : 'fixed';
if (fixHeader || isSticky || flattenColumns.some(({ ellipsis }) => ellipsis)) return 'fixed';
return 'auto';
```

`fixColumn` verlangt eine Spalte mit `fixed`, `fixHeader` ein `scroll.y` — **keine der beiden Tabellen
hat eines von beidem, und keine ihrer zehn Spalten trägt `ellipsis`**. Beide bleiben also auf
`table-layout: auto`. Was `scroll.x` zusätzlich setzt, steht in `Table.js:260-274`:
`overflowX: auto` am Container und `{ width: "max-content", minWidth: "100%" }` an der `<table>`.

Daraus folgt genau das gewünschte Verhalten:

- **bei 1280px** gewinnt `min-width: 100%` über `max-content` — die Tabelle bleibt so breit wie ihr
  Container und verteilt die Spalten wie heute. Gemessen als Vorher-Werte, die der Test festhält:
  Gruppenvergleich 343 / 118 / 172 / 247 / 239 (Tabelle 1120), portal-Admin 233 / 229 / 380 / 200 / 207
  (Tabelle 1248).
- **bei 390px** gewinnt `max-content` — die Tabelle wird 545 bzw. 483 breit und scrollt in ihrem eigenen
  Container, statt das Dokument mitzunehmen.

Hätte eine der Tabellen ein `ellipsis` an einer Spalte, wäre das anders, und dann wäre `max-content`
die falsche Wahl. Das steht hier, weil `Verlauf.tsx:314` genau so ein `ellipsis` trägt — wer die Prop
später doch dorthin trägt, muss diesen Absatz noch einmal lesen.

**Was ausdrücklich nicht gemacht wird:** der Vergleichstabelle eine Schmalvariante nach dem Muster von
`Verlauf` zu geben. Das wäre die schönere Lösung und ist die falsche Aufgabe: es ist eine neue
Listenkomponente samt Entwurfsentscheidung, welche der fünf Spalten mobil überhaupt trägt — und
`Verlauf`s Doppelfassung existiert, weil `feedback-admin.md` §2.5 sie vorgibt. Für den Gruppenvergleich
gibt es keine solche Vorgabe. Eine scrollende Tabelle ist die Regel der Suite und behebt den Defekt
vollständig; wer die Liste will, hebt sie als eigene Entwurfsfrage.

---

### 5.4 Die Kopfzeile bricht zwischen 768px und ~903px — ein A-Befund, den C meldet statt ihn zu flicken

Gefunden beim Kontrolllauf bei 768×900 auf `feedback/groups/2` — der Messwert, der §3 absichern sollte,
hat stattdessen das hier zutage gefördert. Drei Dinge auf einmal:

| Viewport | `documentElement.scrollWidth` | Breite des Modultitels | Modulnavigation |
|---|---|---|---|
| 390 | 390 | sichtbar | ausgeblendet (richtig) |
| **768** | **904** | **0px** — „Feedback" ist unsichtbar | „Übersicht" angeschnitten, „Vergleich" außerhalb |
| **900** | **904** | **0px** | dieselbe Lage |
| 1280 | 1280 | sichtbar | sichtbar, aber **rechts neben dem Avatar** statt in einer zweiten Zeile |

Die Kopfzeile hat eine Mindestbreite von **904px**. Darunter scrollt jede Seite jedes Moduls seitwärts,
das den `nav`-Slot befüllt — feedback-Admin (alle fünf Seiten) und qr (alle Seiten). Gemessene
Aufteilung bei 768px: `.titel` **0px**, `.rechts` **573px**, `.modulnav` **209px**, dazu 32px Polsterung
und 32px Abstände.

**Der Verlust des Modultitels ist der schwerere der beiden Befunde.** `.titel` trägt
`flex: 0 1 auto; min-width: 0; overflow: hidden` (`shell.module.css:24-32`) und ist damit das einzige
Element, das nachgibt — es gibt so lange nach, bis nichts mehr da ist. Der Titel ist aber der Link auf
die Modulwurzel, und A hat ihn ausdrücklich eingeführt, weil ohne ihn „jede Unterseite eine Sackgasse"
ist (`SuiteHeader.tsx:49-52`). Zwischen 768 und 903px ist er weg.

**Die Ursache beider.** `SuiteHeader.tsx:47` rendert `<Header className={s.kopf}>` mit
`display: flex; flex-wrap: nowrap`, und `SuiteNav` gibt ein Fragment mit **zwei** Kindern zurück:
`<div class="rechts">` (`SuiteNav.tsx:259`) und `<nav class="modulnav">` (`SuiteNav.tsx:354`). Das
`<nav>` ist damit ein **drittes Flex-Kind derselben Zeile**, nicht eine zweite Zeile.
`2026-07-27-suite-chrome-design.md` §4 hatte eine „zweite Zeile" vorgesehen; die Umsetzung hat sie nie
bekommen. Weil A nur bei 390 und 1280 gemessen hat, ist das Band dazwischen nie angesehen worden.

#### Warum C das **nicht** behebt — und das ist eine Messung, keine Zuständigkeitsfrage

Der naheliegende Eingriff wäre eine Zeile CSS: `.modulnav { flex: 0 1 auto; min-width: 0; overflow-x:
auto }` — die Navigation schrumpft und scrollt in sich, wie es die Suite-Regel für Tabellen vorsieht.
**Im Browser durchgespielt (nur im DOM, nichts geschrieben), bei 768×900:**

- `documentElement.scrollWidth` fällt von 904 auf 768 — der Überlauf ist weg.
- **Die Navigation ist danach 32px breit.** Das ist ihre Polsterung; von 209px Inhalt ist nichts mehr
  zu sehen. `scrollWidth` 209 gegen `clientWidth` 32.
- Ihre Höhe steigt auf 67px in einer 64px hohen Kopfzeile — die Links (`min-height: 56px`) werden unten
  angeschnitten, schon bei einem 1px-Scrollbalken. Auf einer Plattform mit klassischen Scrollbalken
  (~15px) ist es deutlich mehr.

Ein „Fix", der den grünen Messwert liefert und die Navigation dabei unsichtbar macht, ist kein Fix.
Er wäre genau die Sorte Änderung, gegen die `docs/design/README.md` warnt: der Test wird grün, die
Oberfläche schlechter.

Die richtige Lösung ist die zweite Zeile aus A §4. Auch die ist durchgespielt worden
(`kopf { flex-wrap: wrap; height: auto; min-height: 64px }`, `modulnav { flex: 1 0 100% }`): der
Überlauf verschwindet, aber die Kopfzeile wächst von 64 auf **219px**, weil antds `Header` seine Höhe
und Zeilenhöhe aus `Layout.headerHeight` bezieht und der umbrechende Container beides nicht kennt. Das
sauber zu machen heißt, `Layout.headerHeight` von fest 64 auf `min-height` umzustellen — eine
Entscheidung über die Kopfzeile **jeder** Seite der Suite, einschließlich der Module ohne Navigation und
der Kiosk-Variante. Dazu kommt die Frage, was die Kopfzeile bei Tabletbreite überhaupt zeigen soll: bei
768px verbraucht allein der Modulwechsler 573px von 736 verfügbaren, und keine Umbruchregel macht das
kleiner.

**Das ist ein Entwurf, kein mobiler Durchgang.** C meldet den Befund mit allen Messwerten an A und
fasst `src/core/shell` nicht an. Die Playwright-Läufe aus §8 messen deshalb bei 390, 700 und 1280 — bei
768 und 900 würde C einen Test schreiben, der von Anfang an rot ist.

**Die Folge, offen benannt:** nach C bleibt das Band 768–903px auf feedback-Admin und qr defekt. Es ist
gemessen, dokumentiert und benannt — es ist nicht behoben.

**Nachtrag (Schlussreview des Branches, nach Commit `d980631`):** Der Befund ist inzwischen behoben —
`d980631` ("Modulnavigation in die zweite Zeile, Titel zurueck in den Kopf") setzt genau die hier
durchgespielte zweite Zeile um. `e2e/shell-mobil.spec.ts:142-195` haelt 768/820/900 grün, einschließlich
der Struktur-Zusage, dass `.modulnav` unter der Kopfzeile sitzt und nicht ihr drittes Flex-Kind ist. Die
Messwerte oben bleiben unverändert stehen — sie sind das Protokoll des Zustands vom 2026-07-27, nicht
des heutigen. Dass **C** in diesem Band trotzdem nicht misst, ist damit keine Frage eines von Anfang an
roten Tests mehr, sondern reine Zuständigkeitsteilung: das Band gehört der Shell (`src/core/shell`), die
C nicht anfasst — nicht den Modulseiten, die C behandelt.

---

## 6. Was bewusst nicht gemacht wird

**Die 25 `size="large"` im qr-Modul.** 16 `Input` und 9 `Button` stehen auf `size="large"`, das laut
`controlHeightLG` **72px** statt 56 ergibt — gemessen an `qr/page.tsx`: Eingabefeld 72px, Knopf 72px.
Das ist ein echter Regelverstoß (Falle 4), aber er ist bei 1280px **genau derselbe** wie bei 390px, und
keiner der fünf gemessenen Überläufe aus §4.1 kommt von ihm. Ihn hier mitzunehmen hieße, C ein zweites
Vorhaben mit einem anderen Abnahmekriterium unterzuschieben. Dazu kommt, dass er nicht aus 25
Einzelfällen besteht: `preset-form.tsx:45-53` bindet die Höhe zweier nativer `<select>` über
`nativeSelectStyle` an `TAP_XL` (72) und begründet das im Quelltext damit, dass die Höhen „nicht
auseinanderlaufen" sollen. Wer die 25 Props entfernt und die Konstante stehen lässt, erzeugt genau das
Auseinanderlaufen, das der Kommentar verhindern will. **Das gehört in ein eigenes, kleines Vorhaben**
(„qr auf `controlHeight` bringen"), und es ist heute durch keinen Test gepinnt — der Sweep ist damit
gefahrlos nachholbar.

**Die öffentliche Ausfüll-Ansicht `feedback/f/**`.** Sie ist mobile-first gebaut, hat eigene
CSS-Module, eigene Breakpoints und gehört zur anderen Design-Klasse (`docs/design/README.md` §„Zwei
Design-Klassen"). Nachgeprüft: sie importiert nichts aus `_ui/**` — Änderungen in C können sie nicht
brechen.

**Der Druckbogen `feedback/(print)/aushang`.** Bei 390px gemessen: `documentElement.scrollWidth` 390,
kein Überlauf. Er hat ein eigenes, chrome-loses Layout und Millimetermaße für A4. Er wird gedruckt, nicht
bedient. Einzige Kopplung: er importiert `_ui/feedback.css` wegen der `--fb-*`-Variablen — die
Umstellung aus §5.2 fasst nur `max-width`-Medienabfragen an, die im Druck ohnehin nicht greifen.

**Die Wegwerf-Module** `alpha`, `beta`, `gamma`, `kioskdemo`. Sie beweisen den Keystone und haben keine
Arbeitsseiten.

**Ein Umbau der Auswertungsseite.** Sie ist bei 390px gemessen sauber: kein Überlauf, keine
Textkürzung, alle Bedienelemente ≥ 44px außer den Brotkrumen (22px — das ist Konvention, kein Ziel).
Die drei Kennzahlen stehen über `xs={24} sm={8}` untereinander, die Notenspuren brechen auf zwei
Rasterreihen. **Nichts zu tun**, und das steht hier, damit niemand sie „der Vollständigkeit halber"
anfasst.

**`NotenVerlauf.tsx:195` — die Endbeschriftung der Kurven mit dem vollen Fragetext.** Strukturell ein
Überlaufkandidat am rechten Plotrand. Sie liegt auf der Trendseite, und die war während der
Bestandsaufnahme nicht erreichbar (§5.1). **Ohne Messung keine Änderung** — der Plan misst die Seite,
sobald sie lädt, und das Ergebnis ist ein Abnahmekriterium; ergibt die Messung einen Überlauf, ist das
ein Befund für eine Nacharbeit, keine Erweiterung dieses Umfangs.

**Die Kopfzeile im Band 768–903px** (§5.4). Zwei gemessene Defekte — der Modultitel ist dort 0px breit,
und die Modulnavigation liegt außerhalb des Sichtfelds — und beide sitzen in `src/core/shell`. Die
billige Behebung ist durchgespielt und **macht es schlechter** (die Navigation schrumpft auf 32px), die
richtige verlangt einen Umbau der Kopfzeilenhöhe für die ganze Suite. **Benannte Nacharbeit für A**,
mit allen Messwerten in §5.4. C fasst `src/core/shell` nicht an und schreibt dafür auch keinen Test,
der von Anfang an rot wäre.

**Nachtrag (Schlussreview des Branches):** die Nacharbeit für A ist inzwischen erledigt — Commit
`d980631` behebt den Befund, `e2e/shell-mobil.spec.ts:142-195` hält 768/820/900 grün. C schreibt in
diesem Band trotzdem keinen eigenen Test, aber aus einem anderen Grund als hier ursprünglich notiert:
nicht weil er von Anfang an rot wäre, sondern weil das Band der Shell gehört (§5.4-Nachtrag) und nicht
den Modulseiten, die C behandelt.

**Ein zweiter Breakpoint, gleich welcher.** §5.2 entfernt einen, statt einen hinzuzufügen; die 992 aus
`.fb-sticky` sind ein Rasterwert und kein Umschaltpunkt (§5.2, letzter Absatz).

---

## 7. Ein Befund, der nicht viewportabhängig ist, aber hier hingehört

`portal/layout.tsx:6` ruft `<Shell variant={mod.shell} moduleKey={mod.key}>` **ohne** das `nav`-Prop, das
A eingeführt hat. Es gibt damit weder in der Kopfzeile noch im Drawer einen Weg nach `/admin` — die Seite
ist nur über die Adresszeile erreichbar. Das ist bei 1280px derselbe Mangel wie bei 390px.

Er kommt trotzdem in den Umfang, aus zwei Gründen: es ist genau die Prüffrage „Hat jede Action einen Weg
in der Oberfläche?" aus `docs/design/README.md`, und auf einem Telefon ist die Adresszeile das
schlechteste Eingabegerät, das es gibt — was am Laptop lästig ist, ist dort eine Sperre. Der Slot
existiert seit A, `feedback` und `qr` befüllen ihn bereits; die Sichtbarkeit gatet
`canAdminModule("portal")` aus `core/auth/guards`, dieselbe Funktion, die `qr/layout.tsx` schon benutzt.
Kein neues Muster, ein Aufrufer mehr.

**Welche Gestalt `nav` bekommt, ist hier zu entscheiden und nicht der Umsetzung zu überlassen.** Für
einen Nicht-Admin ist `canAdminModule("portal")` falsch, und `nav` hielte dann genau einen Eintrag
(„Übersicht") — eine Navigationszeile mit einem Punkt, der auf die Seite zeigt, auf der man steht.
**Entscheidung: `nav` bleibt in diesem Fall leer.** Das Modul übergibt die Liste nur, wenn sie mehr als
einen Eintrag hat; sonst gar keine. Begründung: der Slot ist optional und „wer nichts übergibt, bekommt
exakt das heutige Bild" (A §5) — ein Ein-Punkt-Menü ist keine Navigation, es ist eine Beschriftung, und
seit §5.4 kostet jeder Eintrag im `nav` zusätzlich Breite in einer Kopfzeile, die im Band 768–903 ohnehin
knapp ist. `qr` führt heute die andere Gestalt (dort ist der zweite Eintrag ebenfalls admin-gegated, und
ein Nicht-Admin sieht eine Ein-Punkt-Zeile); das wird **nicht** im Zuge von C mitgeändert, weil es eine
sichtbare Änderung an einem Modul wäre, das keinen Befund hat — es steht als Beobachtung hier, damit der
Unterschied nicht später als Versehen gelesen wird.

---

## 8. Tests — wer welche Aussage besitzt

Die Aufteilung ist bindend und stammt aus `docs/design/README.md`, Abschnitt „Tests für Responsives".
**jsdom wertet Media Queries nicht aus**; auf Teilprojekt A sind sechs Tests genau daran gescheitert —
grün und trotzdem falsch.

| Zusage | Wo | Warum dort |
|---|---|---|
| `MONATS_FENSTER` liegt in einem Modul ohne `"use client"` | Vitest, Quelltext-Scan über `_lib/` und `_ui/Segment.tsx` | Der Defekt ist eine Modulgrenze, kein Verhalten. Ein Vitest, der die Konstante importiert, ist unter Vitest immer grün — beide Module sind dort normale ES-Module. |
| Die Trendseite antwortet mit 200 | Playwright | Der einzige Ort mit einer echten RSC-Grenze. Weder Build noch Typecheck noch jsdom sehen sie. |
| Beide Tabellen tragen `scroll` mit `x` | Vitest, Quelltext-Scan über die beiden `.tsx` | Die Regel ist eine Prop, also wird die Prop geprüft |
| Bei 390px scrollt keine der Seiten seitwärts | Playwright 390×844, `documentElement.scrollWidth === innerWidth` | Der einzige Ort, der Layout wirklich rechnet |
| Bei 1280×800 bleiben beide Tabellen auf `table-layout: auto` und verteilen ungleichmäßig | Playwright 1280×800, `getComputedStyle(...).tableLayout` gegen `"auto"`, plus die Spreizung zwischen breitester und schmalster `<th>`-Breite > 50px | **Keine Zugabe — und `scrollWidth === innerWidth` wäre hier die falsche Behauptung.** `scroll.x` schaltet in rc-table auf einen eigenen Scroll-Container und kann damit die Spaltenberechnung ändern; das Dokument liefe deswegen nicht über, die Tabelle sähe nur anders aus. Was „man sieht es auf dem Desktop nicht" hier tatsächlich heißt, sind die Spaltenbreiten. **Nachtrag (Schlussreview):** ausgeliefert ist ein Mechanismus-Test statt eines Vergleichs gegen die absoluten Vorher-Werte aus diesem Plan — begründet, aber hier nicht vorweggenommen: die absoluten Breiten hängen am Seed (`feedback.spec.ts` legt vor diesem Lauf Gruppen an, die Vergleichstabelle ist danach eine andere), und Aufgabe 2 hat gemessen, dass `scroll.x` über eine unsichtbare `MeasureRow` die Spalten zusätzlich um 1–4px verschiebt. Beides macht einen Vergleich gegen fixe Vorher-Zahlen brüchig, ohne dass er mehr beweist als der Mechanismus. |
| `feedback.css` kennt genau die begründete Breakpoint-Menge `{767.98, 768, 992}` | Vitest, Quelltext-Scan mit `new Set` | Genau der Test, den `shell-css.test.ts:32-36` für die Shell schon führt. Jeder der drei Werte bekommt seinen Grund in den Testkommentar (§5.2), sonst liest sich „ein Breakpoint" neben drei Zahlen wie ein Widerspruch. |
| Bei 700×900 stehen die Handlungsknöpfe untereinander und volle Breite | Playwright 700×900 | Der Bereich, in dem der Riss aus §5.2 sitzt. Bei 390px sind Vorher und Nachher identisch — dieser Lauf ist der einzige, der die Änderung überhaupt beweisen kann. |
| **Kein eigener C-Test bei 768 oder 900** | — | §5.4: der Kopfzeilendefekt in diesem Band war zum Zeitpunkt dieses Plans von C gemeldet, nicht behoben, und ein Test dort wäre von Anfang an rot gewesen. **Nachtrag (Schlussreview):** die A-Nacharbeit ist inzwischen erledigt (`d980631`, grün gehalten von `e2e/shell-mobil.spec.ts:142-195` bei 768/820/900). Dass C dort weiterhin keinen eigenen Test führt, ist seither eine Frage der Zuständigkeit — das Band gehört der Shell, nicht den Modulseiten —, nicht mehr die eines von Anfang an roten Tests. |
| Kein Bedienelement außerhalb einer Tabellenzeile trägt `size` | Vitest, Quelltext-Scan über `_ui/**` und `portal/admin/**` | Statisch prüfbar, und der Scan nennt die Ausnahme (`Aktualisierer.tsx`) beim Namen statt sie zu übersehen |
| „Aushang drucken", „Trend", „CSV", „Abend nachtragen" sind bei 390px so breit wie ihr Container | Playwright 390×844, `getBoundingClientRect().width` gegen die Elternbreite | Eine Klasse im DOM zu finden beweist nicht, dass sie wirkt (Falle 5) |
| Der Kartentitel „NÄCHSTER SCHRITT" ist bei 390px vollständig lesbar | Playwright 390×844, `scrollWidth <= clientWidth` | Kürzung entsteht aus Layout, nicht aus Markup |
| Das „…"-Menü der Verlaufszeile ist ≥ 44px breit und hoch | Playwright 390×844 | dito |
| `portal/layout.tsx` übergibt `nav` mit einem Admin-Eintrag, und nur für Modul-Admins | Vitest über `_lib/test-dom.tsx` | Reine Ableitungslogik, kein Layout |

Die vorletzte Zeile jedes Paares besitzt die **Regel**, die letzte das **Ergebnis**. Beides in jsdom zu
behaupten wäre ein Test, der immer grün ist.

### Der Playwright-Lauf muss sich sein Zeitbudget einteilen

`playwright.config.ts` fährt mit `workers: 1` und einem Zeitlimit von 90 s je Test; ein kalter
`devLogin` ist dort mit **13,7 s** gemessen und im Kommentar begründet. Sieben Seiten mal vier Viewports
mit je einer Anmeldung passen da nicht hinein.

**Die Aufteilung, die trägt:** ein `test.describe` je Viewport mit `test.use({ viewport })`, darin **eine**
Anmeldung, und aus dieser Sitzung heraus über die Modul-Hosts navigieren. Das ist zulässig, weil
`AUTH_COOKIE_DOMAIN=.localtest.me` die Sitzung über alle Modul-Subdomains trägt — im Durchgang dieses
Specs wurde genau so gearbeitet, eine Anmeldung für 17 Seitenaufrufe über drei Hosts.

Eine Warnung aus derselben Sitzung, die in den Plan gehört: eine **alte, mit einem anderen `AUTH_SECRET`
verschlüsselte** Sitzungs-Cookie im Browserprofil lässt jede folgende Anmeldung still scheitern —
`/api/auth/session` liefert `null`, der Server protokolliert `no matching decryption secret`, und die
Anmeldemaske erscheint einfach wieder. Playwright startet je Lauf mit einem frischen Kontext und ist
davon nicht betroffen; wer von Hand nachmisst, nimmt ein frisches Profil.

---

## 9. Reihenfolge der Umsetzung

1. **Der Blocker** (§5.1) — ohne ihn sind drei `_ui`-Bausteine nicht abnehmbar; **Falle 6 wandert mit diesem Schritt** in `docs/design/README.md`, weil eine Falle dort hingehört, wo sie behoben wird
2. **Die zwei Tabellen** (§5.3) — zwei Props, zwei der fünf schwersten Befunde
3. **Lange Zeichenketten** (§4.1, drei Stellen im qr-Modul)
4. **Der Breakpoint-Riss** (§5.2) samt der fehlenden Knopfzeilen-Mechanismen (§4.2)
5. **Trefferflächen** (§4.3)
6. **Kartentitel, Teilnehmerfeld, portal-Navigation** (§4.4, §7)
7. **Der dreiviewportige Playwright-Lauf und `docs/design/README.md`** (§8, Falle 6)

Schritt 1 kann vor allen anderen abgenommen und ausgeliefert werden; er ist ein Fehler der Produktion,
kein Gestaltungsanliegen. Die Schritte 2 und 3 sind untereinander unabhängig. Schritt 4 ist der einzige,
der eine Datei berührt, die auch der Druckbogen liest — deshalb steht er nicht vor 2 und 3.

**Kein Schritt fasst `src/core` an.** Der einzige Befund, der dort läge, ist §5.4, und der geht an A.
