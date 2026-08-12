# Lagerbuch — UX-Verbesserungen nach der Abnahme

**Datum:** 2026-08-12 · **Branch:** `feat/lagerbuch-ux-verbesserungen` · **Basis:** `origin/main` (791a94f)

Vier Anforderungen aus dem Betrieb, nachdem das portierte Lagerbuch-Modul abgenommen war
(PR #40). Sie sind fachlich unabhängig voneinander und teilen sich nur die Verifikation.

| # | Anforderung | Umfang |
|---|---|---|
| 1 | Batterierechnung wie im Original-Lagerbuch | Kennzahlleisten auf 5 Seiten, davon 1 mit der Akku-Kennzahl |
| 2 | Etikettenseite fehlt der Layout-Rahmen | Bildschirm-Chrome innerhalb der Druckroute |
| 3 | Inventur braucht ±-Knöpfe | Ein Bedienelement je Zeile |
| 4 | Zu wenig Icons | Vollmigration auf `react-icons/pi`, Nav-Icons über `core` |

## Betreiberentscheidungen dieser Sitzung

Vier Fragen wurden am 12.08.2026 entschieden. Zwei davon kehren eine im Repo
dokumentierte Festlegung um; sie stehen deshalb hier mit Begründung und nicht nur als
Ergebnis.

**E1 — react-icons statt der modul-eigenen Zeichenquelle.** Das Modul hatte mit
`_ui/ikonen.tsx` eine handgepflegte Inline-SVG-Quelle (36 Pfade), deren Kopfkommentar
„KEIN FREMDES PAKET" festschreibt. Der Grund war Falle 7 (`@ant-design/icons` ergibt in
einer Server Component HTTP 500 schon beim Import). Gegenvorschlag war, die 36 Pfade
zu erweitern. Der Betrieb hat sich für das Paket entschieden — und der Vorbefund unten
zeigt, dass die ursprüngliche Sorge auf `react-icons` nicht zutrifft.

**E2 — Vollmigration statt Koexistenz.** Alle 52 `<Ikone>`-Stellen in 32 Dateien ziehen
um; `_ui/ikonen.tsx` entfällt. Begründung: die heutigen Pfade sind lucide-Strichzeichnungen
(2px stroke, kein fill), Phosphor rendert gefüllte Pfade. Zwei Stile nebeneinander wären
sichtbar, und die Ein-Quellen-Regel des Moduls bliebe nur dem Namen nach erhalten.

**E3 — `core/shell` wird erweitert.** `SuiteNavItem` bekommt ein optionales Icon-Feld,
obwohl CLAUDE.md core-Änderungen auf „was ein zweites, heute belegbares Modul braucht"
begrenzt. Lagerbuch belegt es sofort; `files`, `feedback` und `portal` haben eigene
Nav-Definitionen und können folgen.

**E4 — Kennzahlleisten allgemein, nicht nur die Batteriezahl.** Das Original zeigt
Kennzahlleisten auf 10 Seiten, die Portierung auf 5. Alle fünf fehlenden werden
nachgezogen, nicht nur die BZ-Übersicht.

## Vorbefund: react-icons und die RSC-Ebene

`react-icons` 5.7.0 wurde vor der Festlegung ausgepackt und gegen Falle 7 geprüft. Es
löst sie nicht aus. Die drei Belege, jeder im Paket nachlesbar:

| Prüfpunkt | `@ant-design/icons` (bricht) | `react-icons` 5.7.0 |
|---|---|---|
| `exports`-Map | `["."].node.import` → CJS-Zweig | **keine `node`-Bedingung**; RSC bekommt `index.mjs` |
| `createContext` | ungeschützt auf Modulebene → `TypeError` beim Import | `lib/iconContext.mjs:9`: `React.createContext && React.createContext(…)` → bleibt `undefined`, kein Wurf |
| Rendern ohne Context | — | `lib/iconBase.mjs`: `IconContext !== undefined ? <Consumer> : elem(DefaultContext)` → reines SVG |

Das Paket ist mit Absicht RSC-fähig gebaut. **Das entbindet nicht von der Messung:**
der Beleg ist ein echter Abruf einer Server Component, die `react-icons/pi` importiert
(Abschnitt „Verifikation"), nicht diese Tabelle.

Phosphor liegt unter `react-icons/pi`, Standardgewicht „regular" (`PiXxx`; die Varianten
`…Bold`, `…Fill`, `…Light`, `…Thin`, `…Duotone` werden nicht verwendet). Alle 50 unten
genannten Namen wurden gegen `package/pi/index.d.ts` (9.072 Exporte) geprüft und
existieren.

---

## Punkt 1 — Kennzahlleisten

### Was tatsächlich fehlt

Die Batterie**rechnung** ist zeilengleich zum Original: `_lib/domain/bz.ts#akkuLebensdauer`
und `_lib/lesepfade/bz.ts#bzAkkuKennzahlGesamt` stimmen mit `lagerbuch/src/lib/domain/bz.ts`
bzw. `lagerbuch/src/db/bz.ts` überein — inklusive der Regel, dass nur geräteinterne
Intervalle gepoolt werden. Es gibt keine Zahlendifferenz zu suchen.

Was fehlt, ist die Verdrahtung: `bzAkkuKennzahlGesamt` (`_lib/lesepfade/bz.ts:218`) wird
von **keiner** Seite aufgerufen. `(arbeit)/bz/page.tsx` hat überhaupt keine Kennzahlleiste.

### Die fünf Leisten

Alle Zahlen werden aus den bereits geladenen Übersichts-Arrays abgeleitet — genau wie im
Original (`geraete.filter(…)`). Kein neuer Datenbankzugriff außer `bzAkkuKennzahlGesamt`,
das es schon gibt.

| Seite | Kacheln | Quelle |
|---|---|---|
| `(arbeit)/bz/page.tsx` | Aktive Geräte · Kontrolle fällig/bald · Überfällig/nie geprüft · **Ø Akku-Lebensdauer** | `bzGeraeteUebersicht` + `bzAkkuKennzahlGesamt` |
| `(arbeit)/geraete/page.tsx` | Aktive Geräte · MTK fällig/bald · MTK überfällig · Objekte ablaufend | `geraeteUebersicht` |
| `(arbeit)/geraete/[id]/page.tsx` | Gerätetyp · MTK-Fälligkeit bzw. Ablauf · Standort · Status | `geraetById` |
| `(arbeit)/sauerstoff/page.tsx` | Aktive Flaschen · Niedriger Druck | `o2FlaschenUebersicht` |
| `(arbeit)/vorlagen/[id]/page.tsx` | Positionen · Fächer · Fahrzeuge | vorhandene Detaildaten |

Dazu eine Korrektur im Detail: `(arbeit)/bz/[id]/page.tsx:137` beschriftet die Kachel
`Ø Akkulaufzeit`; das Original schreibt `Ø Akku (n Wechsel)` und macht damit sichtbar, auf
wie vielen Intervallen der Mittelwert beruht. Die Wechselanzahl wird ergänzt.

### Muster und Fallen

Vorbild ist die bestehende Leiste auf `(arbeit)/bz/[id]/page.tsx:119-152`: `Row gutter={[12,12]}`
mit `Col xs={24} md={12} xl={6}` und `Kachel`. `Kachel` und `Row`/`Col` sind in Server
Components unbedenklich — sie sind keine Compound-Zugriffe (Falle 1).

Die Ampeltöne folgen `ampelTon()` wie auf der BZ-Detailseite. **Rot bleibt fachlich:**
`colorError === colorPrimary === #c8000f` (Falle 3), ein roter Ton auf einer Kachel muss
also eine Fachaussage tragen (überfällig, niedriger Druck) und nie bloß Betonung sein.

Die Kennzahl `Ø Akku-Lebensdauer` zeigt `–`, solange weniger als zwei Wechsel erfasst sind
(`tageDurchschnitt === null`). Das ist kein Fehlerzustand und bekommt keinen Warnton.

### Nicht in diesem Umfang

Die BZ-Fälligkeitsfalle bleibt unangetastet: `nieGeprueft: true` liefert `ampel: "rot"`
bei `ueberfaellig: false`. Die neue Kachel „Überfällig / nie geprüft" zählt deshalb
`ueberfaellig || nieGeprueft` — wie im Original (`lagerbuch/src/app/verwaltung/(admin)/bz/page.tsx:17`).
Wer nur `ueberfaellig` zählt, meldet das schlechteste Gerät im Bestand als unauffällig.

---

## Punkt 2 — Etikettenseite

### Warum der Rahmen fehlt

Das ist Absicht, aber nur fürs Papier. `(druck)/layout.tsx` lässt die Suite-Shell weg, weil
`FullShell` sonst Kopfzeile und App-Switcher mitdruckt und `minHeight:100vh` leere
Folgeseiten hinter dem Bogen erzeugt. Am Bildschirm ist die Seite dadurch eine Sackgasse:
kein Titel im Suite-Stil, kein Weg zurück außer dem Sonderfall „leerer Bestand".

### Die Lösung

Bildschirm-Chrome **innerhalb** der Druckroute, über die im Modul bereits etablierte
Konvention `lb-nichtDrucken` (`druck.css:143`, `display: none !important` innerhalb
`@media print`). Kein `FullShell`, keine Änderung an der Route-Gruppe.

Inhalt des Chromes:
- Brotkrume zurück nach `/verwaltung`
- Seitenkopf im Modulstil („Etiketten")
- der bestehende Basis-Hinweis („Alle QR-Codes zeigen auf …") — bleibt inhaltlich unverändert
- Druck-Knopf (`window.print()`)

### Drei Randbedingungen, die nicht verhandelbar sind

1. **`DruckRahmen` behält `className={s.modul}`.** Auf `.modul` liegen alle `--lb-*`-
   Variablen. Ohne den Träger löst jedes `var(--lb-…)` ins Leere auf, was gültiges CSS ist —
   HTTP 200, kein Log, kein roter Test, nur farblose Chips.
2. **`(druck)/etiketten/page.tsx` bleibt antd-frei und icon-frei.** Die Datei ist eine Server
   Component; ihr Kopfkommentar schließt beides strukturell aus (Fallen 1 und 7). Das Chrome
   wird eine Client-Insel daneben, nicht Markup in dieser Datei.
3. **Beide Zugriffsriegel bleiben doppelt.** `requireLagerbuchHost` und `requireLagerbuchAdmin`
   stehen zeichengleich in Layout und Seite, weil `requiresAuth: false` gilt und die Middleware
   hier nicht gatet. Die Seite zeigt Zugangs-Codes im Klartext. Am Chrome wird nichts davon
   angefasst.

Der bestehende Sonderfall-Link bei leerem Bestand (`page.tsx:90-94`) wird durch die
Brotkrume redundant. Er bleibt trotzdem stehen: seine Bedingung und seine DOM-Position
sind in Tests festgehalten, und ein zweiter Weg zurück schadet nicht.

---

## Punkt 3 — Inventur ±

### Umfang

Je Zeile ein `−` links und ein `+` rechts des bestehenden `InputNumber`
(`InventurForm.tsx:132-142`). Beide rufen `wertSetzen(zeile.id, aktuellerWert ± 1)` — denselben
Pfad, den das Eingabefeld nutzt. Kein zweiter Zustandsweg.

- `min={0}`, `max={9999}` und `disabled={laeuft}` werden gespiegelt: `−` ist bei 0 gesperrt,
  `+` bei 9999, beide während des Absendens.
- Eigene barrierefreie Namen (`Ist-Bestand ${name} verringern` / `… erhöhen`) neben dem
  bestehenden `aria-label` des Feldes.
- Zeichen: `PiMinus` / `PiPlus`.

### Was ausdrücklich nicht „verbessert" wird

`positionenAus` (`InventurForm.tsx:25-29`) reicht eine berührte Zeile auch dann ein, wenn ihr
Wert dem Seitenladebestand entspricht. Das ist kein Versehen: der Server vergleicht gegen den
**Live**-Bestand und verhindert damit Lost Updates. Folge für die ±-Knöpfe: einmal `+` und
einmal `−` hinterlässt die Zeile in `beruehrt`, und sie wird eingereicht. Das ist richtig so.
Wer hier „unveränderte Zeilen herausfiltert", entfernt den Schutz.

Die Zählung im Abschlussknopf (`abweichungen`) bleibt unverändert und zählt weiterhin nur
Zeilen mit echter Differenz.

---

## Punkt 4 — Icons

### 4a — Migration auf `react-icons/pi`

`_ui/ikonen.tsx` und `_ui/ikonen.test.ts` entfallen. Alle 52 Verwendungsstellen in 32 Dateien
importieren künftig direkt aus `react-icons/pi`. Die Zuordnung der 36 bestehenden Namen:

| Bisher | Phosphor | Bisher | Phosphor |
|---|---|---|---|
| `pfeil-links` | `PiArrowLeft` | `lupe` | `PiMagnifyingGlass` |
| `pfeil-rechts` | `PiArrowRight` | `info` | `PiInfo` |
| `chevron-rechts` | `PiCaretRight` | `erneut` | `PiArrowsClockwise` |
| `chevron-links` | `PiCaretLeft` | `zuruecksetzen` | `PiArrowCounterClockwise` |
| `plus` | `PiPlus` | `verketten` | `PiLink` |
| `minus` | `PiMinus` | `entketten` | `PiLinkBreak` |
| `kreuz` | `PiX` | `tabelle` | `PiTable` |
| `haken` | `PiCheck` | `liste` | `PiList` |
| `stift` | `PiPencilSimple` | `scannen` | `PiBarcode` |
| `papierkorb` | `PiTrash` | `qr` | `PiQrCode` |
| `archiv` | `PiArchive` | `schluessel` | `PiKey` |
| `kopieren` | `PiCopy` | `taschenlampe` | `PiFlashlight` |
| `herunterladen` | `PiDownloadSimple` | `auf-ab` | `PiCaretUpDown` |
| `hochladen` | `PiUploadSimple` | | |
| `drucken` | `PiPrinter` | | |

Die acht Fachzeichen:

| Bisher | Phosphor | Bedeutung |
|---|---|---|
| `warnung` | `PiWarning` | Auffälligkeit |
| `medizin` | `PiHeartbeat` | medizinisches Gerät |
| `objekt` | `PiPackage` | Objekt-Gerät |
| `sauerstoff` | `PiWind` | O₂-Flasche |
| `akku` | `PiBatteryCharging` | Batteriewechsel |
| `verfall` | `PiCalendarX` | Verfallsdatum |
| `handlager-griff` | `PiHandGrabbing` | Griff ins Handlager |
| `fahrzeug` | `PiTruck` | Fahrzeug |

**Größe (`groesse={n}`) wird zu `size={n}`.** react-icons erwartet `size`; ohne die Angabe
rendert es `1em`. Die heutigen Größen (Standard 18, örtlich 11–16) werden 1:1 übernommen.

**`aria-hidden` und `focusable="false"` müssen mitwandern.** `ikonen.tsx` setzt beide fest;
react-icons setzt sie nicht von selbst. Alle Zeichen im Modul sind dekorativ, der Name sitzt
am Bedienelement. Ein Icon ohne `aria-hidden` wird von Screenreadern als leeres Grafikelement
angesagt.

### 4b — Der Import-Riegel

`ikonen.test.ts:177` führt heute eine Positivliste verbotener Quellen: `@ant-design/icons`,
`lucide-react`, `@/core/shell/icons`. `react-icons` steht nicht darauf — der Import ginge
still durch, während der Kommentar bei `:329` „kein fremdes Zeichenpaket im ganzen Modul"
behauptet. Code und Dokumentation liefen auseinander.

Der Test wird deshalb nicht gelöscht, sondern **umgedreht**: `react-icons/pi` wird die
einzige erlaubte Zeichenquelle des Moduls, `@ant-design/icons` und `lucide-react` bleiben
verboten, und die 36-Namen-Zusicherung (`ikonen.test.ts:390`) entfällt ersatzlos mit der
Datei, deren Inhalt sie prüfte. Der repo-weite Riegel `core/shell/icons.test.ts` bleibt
unangetastet — er adressiert `@ant-design/icons` und ist von dieser Migration nicht betroffen.

### 4c — Bundle: keine Konfiguration nötig

`react-icons/pi` ist ein Barrel über 9.072 Exporte, aber **Next 16.3.0 optimiert es bereits
von sich aus**: der Spezifizierer steht in der eingebauten Standardliste für
`optimizePackageImports` (`node_modules/next/dist/server/config.js:1194`, zusammen mit den
übrigen `react-icons/*`-Sets, die dort einzeln aufgeführt sind, weil Wildcards nicht
unterstützt werden).

`next.config.ts` wird deshalb **nicht** angefasst. Ein eigener
`experimental.optimizePackageImports`-Eintrag wäre wirkungslose Doppelung — und riskant,
weil ein selbst gesetztes Array die Standardliste je nach Zusammenführung verdrängen kann.

Die Route-Größen aus `pnpm build` werden vor und nach der Migration festgehalten, damit die
Annahme belegt ist statt geglaubt.

### 4d — Nav-Icons (`core/shell`)

`SuiteNavItem` (`src/core/shell/types.ts:22`) bekommt ein optionales Feld:

```ts
export interface SuiteNavItem {
  key: string;
  title: string;
  href: string;
  /** Schlüssel eines Zeichens, aufgelöst in SuiteNav. NIE eine Komponente. */
  ikon?: NavIkonName;
}
```

**Warum ein String und keine Komponente.** `LAGERBUCH_NAV` wird von einer Server Component
gelesen; sein Kopfkommentar hält das fest. Eine Komponentenreferenz aus einem
`"use client"`-Modul käme dort als Client-Referenz statt als Wert an — Falle 6, HTTP 500 für
die ganze Seite, unsichtbar für `typecheck`, `build` und Vitest. Der Schlüssel wird in
`SuiteNav` aufgelöst, das ohnehin Client ist.

Die Zuordnung liegt als `Record<NavIkonName, IconType>` in `core/shell`; `IconType` kommt
aus `react-icons/lib` (`lib/iconBase.d.ts:16`) — ein reiner Typ-Import, der wegkompiliert
wird. Ein unbekannter Schlüssel rendert **kein** Zeichen und wirft nicht — die Navigation
darf an einem Tippfehler nicht ausfallen.

`types.ts` selbst darf den Icon-Typ nicht als Wert berühren: die Datei wird von
Server Components gelesen (`_lib/nav.ts` importiert `SuiteNavItem` von dort). `NavIkonName`
ist deshalb eine String-Union, keine Ableitung aus der Komponentenmap.

Die 15 Einträge von `LAGERBUCH_NAV`:

| Eintrag | Zeichen | Eintrag | Zeichen |
|---|---|---|---|
| Übersicht | `PiSquaresFour` | Geräte | `PiCube` |
| Artikel | `PiPackage` | Bestellung | `PiShoppingCart` |
| Verfall | `PiCalendarX` | Inventur | `PiClipboardText` |
| Fahrzeuge | `PiTruck` | Journal | `PiClockCounterClockwise` |
| Vorlagen | `PiLayout` | Zugangs-Codes | `PiKey` |
| Checks | `PiCheckSquare` | Etiketten | `PiQrCode` |
| BZ-Kontrolle | `PiHeartbeat` | Import | `PiUploadSimple` |
| Sauerstoff | `PiWind` | | |

`files`, `feedback` und `portal` bleiben in diesem Branch ohne Icons — das Feld ist optional
und ihre Navigationen ändern sich nicht.

---

## Verifikation

**Der wichtigste Abschnitt dieser Spec.** Jede der vier Fallen, die dieser Branch berührt
(1, 3, 6, 7), ist unter `pnpm typecheck`, `pnpm lint`, `pnpm build` **und** `pnpm vitest run`
grün. „Alle Gates grün" bedeutet für diese Arbeit nichts.

Die Standardkette läuft trotzdem vollständig:
`pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test`

Dazu folgende Abrufe, die es zusätzlich braucht:

| Abruf | Beweist |
|---|---|
| `/verwaltung` (Server-Rendering mit Nav) | `react-icons/pi` in der RSC-Ebene: HTTP 200, Nav-Zeichen im Markup |
| `/verwaltung/bz` | Kennzahlleiste; Ø Akku aus `bzAkkuKennzahlGesamt` |
| `/verwaltung/geraete`, `/verwaltung/sauerstoff` | die übrigen Leisten |
| `/verwaltung/inventur` | ± verändert den Wert und bucht die Zeile |
| `/verwaltung/etiketten` — Bildschirm | Chrome sichtbar, Brotkrume führt zurück |
| `/verwaltung/etiketten` — Druckemulation | Chrome verschwunden, Bogen unverändert, keine leere Folgeseite |
| `/verwaltung/etiketten` ohne Lagerbuch-Gruppe | dieselbe Antwort wie `/verwaltung/artikel` ohne Gruppe |

Der letzte ist keine Regression aus diesem Branch, sondern die einzige Zusicherung, die die
Kopplung der beiden Zugriffsriegel überhaupt prüft (T167, T175). Er läuft mit, weil dieser
Branch die Druckroute anfasst.

**Ein Vitest-Erfolg ist für die Icon-Migration kein Beleg.** In Vitest lädt `react` über die
`default`-Bedingung; Icons rendern dort klaglos, auch wenn sie im echten RSC-Lauf brächen.
Der Beleg ist ausschließlich der HTTP-200 aus Zeile 1 der Tabelle.

## Abgrenzung

Nicht in diesem Branch, gehört auf das ClickUp-Board („I&K Suite", 901524923921):

- Nav-Icons für `files`, `feedback` und `portal` — das Feld steht bereit, die Zuordnung ist
  eine eigene Entscheidung je Modul.
- Die vier weiteren Kennzahlleisten, die das Original auf Detailseiten zeigt und die Portierung
  bereits hat — sie sind vollständig und werden nicht angefasst.
- Eine Umstellung der Suite-Kopfzeile (`core/shell/icons.ts`, `@ant-design/icons`) auf
  Phosphor. Das ist ein eigener, suiteweiter Eingriff mit eigenem Risiko.
