# Navigation — App-Umschalter, Portal als Startseite, Modul-Navigation mit Abschnitten

Ersetzt die Navigationsentscheidungen aus `2026-07-27-suite-chrome-design.md` §4 und §5. Alles
andere aus jenem Dokument (Zoom-Sperre §2, 16px-Untergrenze §3, anonymer Zustand §6) bleibt
unberührt und gilt weiter.

## 1. Der Befund

Die Kopfzeile von heute rendert **jedes** sichtbare Modul als Text-plus-Icon-Knopf nebeneinander
(`SuiteNav.tsx`, `.modulzeile`). Bei zwei Modulen war das eine Liste, bei acht ist es eine Wand —
und der Entwurf von 2026-07-27 hat das vorhergesehen, ohne es zu lösen: er verwarf Icons ohne
Beschriftung ausdrücklich („`AppstoreOutlined` vs. `QrcodeOutlined` vs. `CommentOutlined` sagen
einem Gelegenheitsnutzer wenig") und nahm die zweite Zeile als Preis in Kauf, damals bei „heute
zwei von sieben Modulen". Heute übergeben vier Module Navigation, eines davon **fünfzehn Einträge**
(`LAGERBUCH_NAV`), die als gleichrangige Wortkette umbrechen.

Dazu kommt eine zweite Einstiegsliste, die niemand mit der ersten verbunden hat: das Portal listet
datenbankgestützte Dienste als Kacheln — eigene Rechteprüfung, eigene Darstellung, kein Bezug zum
App-Wechsler in der Kopfzeile. Zwei Orte für dieselbe Frage.

Die Gruppenfilterung ist **kein** Teil des Befunds. `visibleSwitcherModules` und
`switcherGroupSources` arbeiten korrekt und bleiben unangetastet (§3.3).

## 2. Der Grundgedanke: zwei Fragen, zwei Orte

Die heutige Kopfzeile beantwortet zwei verschiedene Fragen an derselben Stelle. Der Entwurf trennt
sie:

| Frage | Ort | überall gleich? |
|---|---|---|
| **Welche App?** | App-Umschalter am Modultitel · Portal als vollflächige Version derselben Liste | ja |
| **Wo darin?** | Modul-Navigation — Seitenleiste mit Abschnitten, sonst Zeile wie heute | nein, pro Modul |

Was in der Kopfzeile bleibt: Modultitel mit Chevron (links), Theme-Umschalter und Avatar (rechts).
Die Modulknopfreihe entfällt ersatzlos.

## 3. Die eine Einstiegsliste

### 3.1 Datenform

Neu: `src/core/shell/launcherEintraege.ts`. **Ohne `"use client"`** — dieses Modul exportiert einen
WERT, den Server Components lesen. Ein `"use client"` hier ergäbe eine Client-Referenz statt der
Liste und damit HTTP 500 für jede Seite der Suite, was weder `build` noch Vitest findet
(`docs/design/README.md`, Falle 6; dieselbe Begründung steht schon an `FILES_NAV`).

```ts
export interface LauncherEintrag {
  key: string;
  title: string;
  beschreibung?: string;
  /** ICONS-Schlüssel aus `core/shell/icons` — nur Suite-Module. */
  icon?: string;
  /** Bild-URL — nur externe Dienste. */
  iconUrl?: string | null;
  href: string;
  abschnitt: string;
  /** Öffnet in neuem Tab (`services.openInNewTab`). */
  extern: boolean;
}
```

`icon` und `iconUrl` sind bewusst beide optional statt eines Union-Typs: der Umschalter fällt in
dieser Reihenfolge zurück — `iconUrl` → `ICONS[icon]` → neutrales Link-Icon. Ein Union zwänge jede
Aufrufstelle zu einer Fallunterscheidung, die genau diesen Rückfall nachbaut.

### 3.2 Zwei Quellen, ein Ergebnis

```ts
export async function launcherEintraege(groups: string[] | null): Promise<LauncherEintrag[]>
```

- **Suite-Module** — `visibleSwitcherModules(groups)` und `moduleUrl(key)`, beides unverändert.
  Module ohne auflösbare URL fallen heraus, wie in `switcherEntries` heute. Abschnitt fest `"Apps"`,
  Reihenfolge die der Registry.
- **Externe Dienste** — `dienstEintraege(groups)` aus `src/app/m/portal/_lib/launcher.ts` (§3.4).
  Abschnitt ist `services.category`; ist die Spalte leer, `"Weitere Dienste"`.

Abschnittsreihenfolge: `"Apps"` zuerst, danach die Kategorien in der Reihenfolge ihres ersten
Auftretens (`sortOrder`, dann `name` — die bestehende Sortierung aus `getVisibleServicesForUser`).

`switcherEntries.ts` geht in dieser Datei auf und entfällt.

**Anonym wird die Funktion gar nicht gerufen.** `SuiteHeader` ruft `launcherEintraege` nur bei
`angemeldet` — nicht mit `groups: null`. Sonst öffnete jeder anonyme Aufruf von `qr` und `beta` die
Portal-Datenbank für eine Liste, die §4 ohnehin nicht anzeigt, und `MinimalShell` ruft dieselbe
Kopfzeile wie `FullShell`. Der Parametertyp bleibt trotzdem `string[] | null`, weil ein
eingeloggter Nutzer ohne Gruppen `null` mitbringen kann; die Ersparnis liegt am Aufrufer, nicht im
Typ.

### 3.3 Die Rechteprüfung bleibt zweigeteilt — mit Absicht

Es liegt nahe, die beiden Filter zu einem zu verschmelzen. Das wäre falsch, und der Grund steht
schon in der Registry: `canAccess()` steigt bei `requiresAuth: false` **sofort mit `true` aus**,
weshalb `requiredGroups` für `feedback`, `files` und `lagerbuch` nie gelesen wird — diese Module
müssen `requiresAuth: false` behalten, weil sie anonyme Teilpfade tragen (`/f/…`, `/s/<id>`,
`/t/<code>`). Genau diese Lücke füllt `switcherGroupSources`. Eine Vereinheitlichung würde entweder
Einträge zeigen, die in ein `notFound()` führen, oder Einträge verstecken, die erreichbar sind.

Also: `visibleSwitcherModules` prüft die Module, `filterVisibleServices` prüft die Dienste, jede
Prüfung auf ihrer Seite der Grenze. Der Merge fügt zusammen, er entscheidet nicht.

### 3.4 Die Grenze zwischen `core` und dem Portal

`docs/design/README.md` hält fest, dass Modul-Interna kein API sind — `payloadToSvg` durfte nicht
quer aus einem Modul in ein anderes importiert werden. Der Umschalter liegt aber in `core/shell` und
läuft auf **jeder Seite jedes Moduls**, während die Dienste in der Portal-Datenbank stehen.

Auflösung: das Portal **veröffentlicht genau eine Funktion** für diesen Zweck.

```ts
// src/app/m/portal/_lib/launcher.ts  — kein "use client"
export async function dienstEintraege(groups: string[] | null): Promise<LauncherEintrag[]>
```

Sie kapselt `getVisibleServicesForUser` samt Datenbankzugriff und liefert fertige `LauncherEintrag`.
`core/shell` sieht weder Schema noch Drizzle-Client. Dieselbe Bauform nutzt `core/bootstrap.ts`
heute schon (`seedPortal`, `filesBootFehler`, `lagerbuchBootFehler`) — sie ist also nicht neu,
sondern nur zum ersten Mal außerhalb des Bootstraps.

**Und sie wird bewacht, nicht bloß beschrieben.** Ein Quelltext-Scan in
`launcherEintraege.test.ts` (Bauform von `scripts/seed-lokal.test.ts`) stellt fest, dass unter
`src/core/shell/` kein Import aus `@/app/m/portal/` steht außer `_lib/launcher`. Der Scan fängt die
naheliegende Verdrahtung, nicht jede denkbare — ein umbenanntes Re-Export käme durch. Das ist
dieselbe eingestandene Grenze wie beim Seed-Scan und besser als nichts.

**Kosten, benannt:** jede Seite jedes ANGEMELDETEN Moduls liest damit die Portal-Datenbank — auch
unter `lagerbuch.…` oder `qr.…`. Das ist geprüft tragbar, nicht angenommen: `instrumentation.ts`
ruft `register()` einmal beim Server-Boot **vor dem ersten Request** und darin `migrateAllModules()`
für jedes Modul aus `MODULE_MIGRATIONS`; die Portal-Datenbank ist also migriert, unabhängig davon,
welcher Host die Anfrage bedient. better-sqlite3 liest synchron aus dem Prozess, es ist keine
Netzrunde.

Der Vorbehalt aus `CLAUDE.md` — lagerbuch bekäme über `getModuleDb()` eine Verbindung ohne
`lb_falte` — greift hier **nicht**: er betrifft den Boot-Seed, der vor den lagerbuch-eigenen
Laufzeit-Vorbereitungen liefe, nicht einen Lesezugriff auf ein anderes, fertig migriertes Modul.

Sollte das je messbar stören, ist der Ausweg ein Cache in `dienstEintraege` — hinter derselben
Signatur, ohne Änderung an `core`.

### 3.5 Kein neues Feld in `ModuleDef`

Naheliegend wären `kategorie` und `sortOrder` an jedem Modul. Beides entfällt: alle Suite-Module
teilen den Abschnitt `"Apps"`, und ihre Reihenfolge ist die der Registry-Liste. Ein Feld, das heute
für jedes Modul denselben Wert trüge, ist Vorratshaltung (`docs/design/README.md`, Regel für
`src/core`).

## 4. Der App-Umschalter

`src/core/shell/AppUmschalter.tsx`, Client-Komponente. **Die Icon-Auflösung findet ausschließlich
hier statt** — `@ant-design/icons` in einer Server Component ergibt HTTP 500 beim Import, den weder
`typecheck` noch `build` noch Vitest sieht (Falle 7). `SuiteHeader` bleibt Server Component und
übergibt nur fertige `LauncherEintrag`.

**Auslöser** ist der Modultitel selbst, ergänzt um ein Chevron: `Lagerbuch ▾`. Ein `<button>` mit
`aria-haspopup="menu"`, `aria-expanded={offen}` und dem Modultitel als zugänglichem Namen. Der
Zustand wird selbst gehalten und nicht antds `Dropdown` überlassen — dieselbe Begründung wie beim
Nutzermenü heute: nur so lässt sich `aria-expanded` am Auslöser setzen.

**Panel** (Desktop, Popover):

1. Suchfeld — filtert clientseitig über `title` und `beschreibung`, ohne Server-Runde.
2. Abschnitte mit Überschrift, Einträge zweispaltig mit Icon, Titel und Beschreibung.
3. Der Eintrag des aktuellen Moduls trägt `aria-current="true"` — „das ist die aktuelle App", nicht
   `"page"`, denn die aufgerufene Seite ist er in aller Regel nicht.
4. Fußzeile: „Alle Apps im Portal".

**Zwei `aria-current` im selben Dokument — und was das kostet.** Auf `/verwaltung/import` markiert
die Modul-Navigation ihren Eintrag und das geöffnete Panel zusätzlich „Lagerbuch". Beides ist wahr
und beides gehört so; die Aussagen betreffen verschiedene Ebenen. Zwei Folgen, beide vorweggenommen:

- **Optisch keine.** `shell.module.css` unterstreicht `.navLink[aria-current]`, nicht
  `[aria-current]` — die Regel ist bereits an die Klasse gebunden. Der Umschalter bekommt deshalb
  eine **eigene Klasse** und darf `.navLink` nicht wiederverwenden. `shell-css.test.ts` hält das
  fest (§7.1).
- **Für Playwright schon.** Ein Locator auf `[aria-current]` fände zwei Knoten und wäre eine
  Strict-Mode-Verletzung — dieselbe Falle, die das Repo bei `theme-toggle` und `abmelden` schon
  zweimal umgeht. Jede Zusicherung auf die Aktivmarkierung wird deshalb über den umschließenden
  `nav`-Knoten eingegrenzt, nie global gestellt.

**Tastatur:** `Enter`/`Space` öffnet, Fokus springt ins Suchfeld, Pfeiltasten wandern durch die
Einträge, `Esc` schließt und gibt den Fokus an den Auslöser zurück.

**Der Modulstartseiten-Link geht nicht verloren, er wandert.** Der heutige Kommentar an
`SuiteHeader` ist richtig — „ohne diesen Link ist jede Unterseite eine Sackgasse" — und der Weg
zurück existiert künftig doppelt: als eigener, markierter Eintrag im Panel, und als erster Eintrag
der Modul-Navigation. Das kostet einen Klick mehr als der direkte Titel-Link. Der Gegenwert ist,
dass „wo bin ich" und „wohin kann ich" an einer Stelle stehen statt an zweien.

**Mobil** öffnet derselbe Auslöser keinen Popover, sondern den Drawer, gescrollt auf den Abschnitt
„Apps". Der Menü-Knopf links behält die Modul-Navigation. Zwei Öffner, aber sie beantworten die
zwei Fragen aus §2 — das ist die Trennung, nicht ihre Verletzung.

**Anonym** gibt es keinen Umschalter, sondern wie heute nur den Anmelden-Knopf. Die Begründung von
2026-07-27 §6 gilt unverändert: eine Liste, deren Einträge sämtlich zum Login umleiten, verspricht
„hier kannst du hin" und liefert „hier musst du dich erst anmelden".

## 5. Modul-Navigation mit Abschnitten

### 5.1 Ein optionales Feld statt einer verschachtelten Struktur

```ts
export interface SuiteNavItem {
  key: string;
  title: string;
  href: string;
  /** Überschrift, unter der dieser Eintrag steht. Fehlt sie überall, bleibt es die Zeile von heute. */
  abschnitt?: string;
}
```

Die naheliegende Alternative — `{ titel: string; items: SuiteNavItem[] }[]` — ist bewusst verworfen.
Sie hätte drei Dinge mitgezogen, die heute funktionieren: `aktiverEintrag` (die einzige echte Logik
in `SuiteNav.tsx`, ohne DOM prüfbar) hätte flach machen müssen, was der Aufrufer schachtelt; die
Drawer-Darstellung hätte einen zweiten Zweig bekommen; und die Quelltext-Zusicherung in
`src/app/m/lagerbuch/_ui/VerwaltungsRahmen.test.tsx:303` (`{ optional: false, typ: "SuiteNavItem[]" }`)
wäre gebrochen.

Mit dem optionalen Feld bleibt die Liste flach. `aktiverEintrag` ändert sich **nicht**. Gruppierung
ist reine Darstellung: die Renderfunktion gruppiert nach `abschnitt` in der Reihenfolge des ersten
Auftretens; Einträge ohne `abschnitt` stehen oben, vor der ersten Überschrift.

### 5.2 Die Form folgt den Daten

**Trägt mindestens ein Eintrag ein `abschnitt`, wird die Navigation eine Seitenleiste. Sonst bleibt
sie die Zeile von heute.**

Kein Schwellenwert auf der Anzahl, kein zusätzliches Prop am `Shell`. Ein Schwellenwert wäre eine
Zahl, die niemand begründen kann und die bei elf Einträgen anders aussieht als bei zehn; ein Prop
erlaubte zwei Module, sich bei gleicher Datenlage verschieden zu verhalten.

Folge: `portal/layout.tsx` (2 Einträge), `feedback/(admin)/layout.tsx` (2) und `FILES_NAV` (3)
ändern sich um **null Zeilen** und sehen exakt aus wie heute. Nur `LAGERBUCH_NAV` vergibt Abschnitte
und bekommt damit die Leiste.

**Zur `core`-Regel, offen:** die Shell trägt danach zwei Darstellungsformen, und die zweite hat heute
genau einen Nutznießer. Der Maßstab „ein zweites, heute belegbares Modul" ist für die *Abschnitte*
also nicht erfüllt. Er wird bewusst zurückgestellt, weil die Alternative — eine Lagerbuch-eigene
Seitenleiste neben der Suite-Navigation — dieselbe Zeile zweimal beantworten würde, an derselben
Stelle des Bildschirms, mit zwei Aktivmarkierungen. Das ist der teurere Fehler. Wird die Leiste in
sechs Monaten immer noch von einem Modul allein benutzt, gehört sie zurück ins Modul.

### 5.3 Ausprägung

- Ab 768px eine 240px breite Spalte links, klebend, mit eigenem Überlauf bei Überlänge.
  `Sider` als **tiefer Named-Import** (`antd/es/layout/Sider` — Pfad gegen antd 6.5.3 geprüft, die
  Datei liegt neben `layout.js`, aus dem `Header` und `Content` kommen) — `Layout.Sider` als
  Property-Zugriff ergibt in einer Server Component `undefined` und einen 500er (Falle 1, gleiche
  Begründung wie bei `Header` und `Content` heute).
- Unter 768px keine Spalte; die Navigation steht im Drawer, mit denselben Abschnittsüberschriften.
- **Kein antd `Menu`.** Die Einträge bleiben `next/link` mit `aria-current` und CSS, wie
  `navLinks` heute. `Menu` brächte eigene Aktivlogik, eigenes Markup und zusätzliches Client-Bündel,
  um eine Funktion zu ersetzen, die geprüft ist.
- Die zweite Kopfzeile (`Modulnav`) bleibt für Module ohne Abschnitte unverändert bestehen.
  `headerHeight` bleibt 64.
- Die Umschaltung Mobil/Desktop läuft über `@media (min-width: 768px)`, nicht über
  `Grid.useBreakpoint` — verboten in RSC, und ein JS-Breakpoint zeigt beim ersten Render die falsche
  Variante (2026-07-27 §4).

### 5.4 Die Abschnitte des Lagerbuchs

Abgeleitet aus `2026-08-03-lagerbuch-modul-design.md`: „Vorlagen" sind Fahrzeug-Soll-Positionen und
gehören zu den Fahrzeugen, nicht zu den Prüfungen; „Checks" sind die durchgeführten Fahrzeug-Checks.

| Abschnitt | Einträge |
|---|---|
| *(ohne)* | Übersicht |
| Bestand | Artikel · Verfall · Inventur · Bestellung |
| Fahrzeuge & Geräte | Fahrzeuge · Vorlagen · Geräte · Sauerstoff |
| Prüfungen | Checks · BZ-Kontrolle |
| Protokoll | Journal |
| Einrichtung | Etiketten · Zugangs-Codes · Import |

Die Zuordnung ist fachlich und darf beim Umsetzen korrigiert werden; die Struktur ändert sich
dadurch nicht.

## 6. Das Portal als Startseite

Das Portal rendert dieselbe `launcherEintraege(groups)` vollflächig: Suchfeld oben, Abschnitte als
Überschriften, Kacheln mit Icon, Name und Beschreibung. Der heutige `Row`/`Col`-Aufbau bleibt in
seiner Bauform erhalten (Link außen, `Card` innen, kein `Card.Meta` — Falle 1).

Damit ist das Portal die vollflächige Ansicht derselben Liste, die der Umschalter als Popover zeigt.
Eine Wahrheit, zwei Darstellungen.

### 6.1 Der Ansprechpartner

Neue Schlüssel/Wert-Tabelle in der Portal-Datenbank (`portal_einstellungen`), gepflegt unter
`/admin`. Erster und vorerst einziger Schlüssel: `ansprechpartner` (Freitext, z. B. Name plus
E-Mail).

Gegen `env` sprach, dass jede Änderung sonst einen Deploy kostet — und die Person, die den Kontakt
kennt, ist die Portal-Verwaltung, nicht der Betreiber der Container.

Die Tabelle braucht eine Migration unter `src/app/m/portal/_db/migrations/`. Das **Dreieck** aus
`CLAUDE.md` gilt: Migrationsverzeichnis, `MODULE_MIGRATIONS`-Eintrag und `COPY`-Zeile im
`Dockerfile` bestehen für `portal` bereits — es kommt nur eine Migrationsdatei hinzu, kein neuer
Eintrag.

### 6.2 Leerzustände, vollständig

Geprüft, welche überhaupt eintreten können:

| Zustand | Erreichbar? | Verhalten |
|---|---|---|
| Portal ohne jeden Eintrag | ja, sobald für `portal` und `qr` eine **echte Gruppe** in `SUITE_ACCESS_GROUP_*` steht — eine leer gesetzte Variable ist wirkungslos (`envAccessGroupsFor`), damit sie bei `requiresAuth: true` nicht still für alle öffnet | Überschrift „Für dich ist noch nichts freigeschaltet", ein Satz Erklärung, Ansprechpartner. Ist keiner gepflegt: nur die Erklärung |
| Portal ohne Dienste, nur Module | ja, heute der Normalfall | Abschnitt „Apps"; der Dienste-Abschnitt entfällt, statt leer zu erscheinen |
| Suche ohne Treffer (Panel und Portal) | ja | „Nichts gefunden für ‚…'", im Panel mit Weg ins Portal |
| Umschalter ohne Einträge | praktisch nein — `portal` und `qr` sind ohne Gruppenzwang für jeden sichtbar | Fällt mit dem Portal-Leerzustand zusammen; kein eigener Text |
| Modul-Navigation leer | ja | wie heute nichts (`Modulnav` → `null`) |
| Anonym | ja | wie heute nur „Anmelden" (§4) |

Der heutige Defekt ist der zweite und dritte Fall: `services.map` über `[]` rendert ein leeres
`<Row>` — eine weiße Fläche, die wie ein Ausfall aussieht.

`Result` ist in Server Components sicher (`docs/design/README.md`) und trägt den Leerzustand. **Kein
`Alert type="error"`** — `colorError === colorPrimary === #c8000f`, ein fehlender Zugang ist keine
Störung und darf nicht aussehen wie eine Primäraktion (Falle 3).

## 7. Tests

### 7.1 Was rot wird, und warum das dazugehört

- `src/core/shell/SuiteNav.test.tsx`, `SuiteHeader.test.tsx` — neu geschrieben. Sie beschreiben das
  DOM, das dieser Entwurf ersetzt.
- `src/core/shell/shell-css.test.ts` — die `.modulzeile`-Zusicherungen entfallen mit der Modulzeile;
  neue kommen für Panel und Seitenleiste hinzu.
- `src/core/shell/switcherEntries.test.ts` → `launcherEintraege.test.ts`, ergänzt um den Grenz-Scan
  aus §3.4.
- **`e2e/keystone.spec.ts:39`** prüft heute `getByRole("link", { name: /Alpha/ })` **ohne
  vorheriges Öffnen** — genau das, was der Kommentar in `SuiteNav.tsx` als Grund gegen ein Dropdown
  nennt. Der Test wird zu „Umschalter öffnen, dann prüfen". Das ist eine bewusste Änderung des
  Vertrags und wird im Commit als solche begründet, nicht als Anpassung an kaputten Code.

### 7.2 Was grün bleiben muss

- `src/app/m/lagerbuch/_ui/VerwaltungsRahmen.test.tsx:303` — `SuiteNavItem[]` bleibt erhalten (§5.1).
- `src/core/shell/icons.test.ts` — repo-weiter Riegel gegen `@ant-design/icons` in RSC, unverändert
  gültig und für §4 der wichtigste.
- `src/proxy.test.ts` — unberührt, dieser Entwurf fasst das Routing nicht an.

### 7.3 Neu

- Unit: Merge zweier Quellen zu einer Liste; Abschnittsreihenfolge; Rückfall der Icon-Auflösung;
  Gruppierung nach `abschnitt` bei unveränderter `aktiverEintrag`-Antwort.
- Quelltext-Scan der Grenze `core/shell` → `portal` (§3.4).
- DOM (`_lib/test-dom.tsx`, kein zweites Harness): Umschalter öffnet, filtert, schließt mit `Esc`,
  gibt den Fokus zurück.
- E2E: Wechsel über den Umschalter; leeres Portal zeigt den Ansprechpartner; mobil öffnen Titel und
  Menü-Knopf zwei verschiedene Dinge.

## 8. Umsetzung in zwei Plänen

Die Testflächen überlappen kaum, deshalb zwei Pläne statt eines:

**Plan A — Launcher, Portal, Grenze, Leerzustände.**
`launcherEintraege.ts` samt Grenz-Scan · `portal/_lib/launcher.ts` · `AppUmschalter.tsx` ·
Kopfzeile ohne Modulzeile · `portal_einstellungen` mit Migration und Verwaltung · Portal-Seite mit
Abschnitten, Suche und Leerzustand · `keystone.spec.ts`.

**Plan B — Modul-Navigation.**
`abschnitt?` an `SuiteNavItem` · Seitenleiste samt CSS und Drawer-Darstellung · Abschnitte in
`LAGERBUCH_NAV`.

A zuerst: B setzt auf der geräumten Kopfzeile auf.

## 9. Was dieser Entwurf nicht tut

- **Er ändert die Gruppenfilterung nicht.** `visibleSwitcherModules`, `switcherGroupSources` und
  `filterVisibleServices` bleiben, wie sie sind (§3.3).
- **Er hebt die Dienste nicht nach `core`.** Das wäre die sauberste Schichtung, kostet aber die
  Wanderung von Schema, Migrationen, `Dockerfile`-Zeile und Seed. Der schmale Lesepfad (§3.4) löst
  dasselbe Problem zu einem Bruchteil.
- **Er erfindet keine Favoriten und kein „zuletzt genutzt".** Beides wäre plausibel und beides hat
  heute keinen Anlass — die Liste ist nach Gruppenfilterung kurz.
- **Er fasst die modul-internen Inhalte nicht an.** Was auf `/verwaltung/artikel` steht, bleibt, wie
  es ist; nur der Weg dorthin ändert sich.
