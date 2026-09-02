# Modul „Taktische Zeichen" — Entwurf

**Modulschlüssel `zeichen` · ClickUp DRK-247 · 2026-09-02**

Ein Modul der iuk-suite, das Helfern die Arbeit mit taktischen Zeichen abnimmt: nachschlagen,
eigene Zeichen bauen, und üben, bis sie sitzen. Grundlage sind die npm-Pakete
`@einsatzzeichen/*` (Quelle: `~/dev/einsatzzeichen`, veröffentlichter Stand **1.1.0**).

Alle Zahlen in diesem Dokument sind **gemessen**, nicht geschätzt — gegen den veröffentlichten
npm-Stand 1.1.0 und gegen **Next 16.3.3** (identisch zur Suite: `node_modules/next/package.json`).
Wo etwas nicht gemessen wurde, steht das ausdrücklich dabei.

Schlüssel `zeichen` **ohne Bindestrich**: er bestimmt Verzeichnis (`src/app/m/zeichen/`), Datenbank
(`.data/zeichen.db`, `core/db/index.ts:6-10`), Dev-Host (`zeichen.localtest.me`) **und** die
Env-Namen. `envSuffix` ersetzt `-` durch `_` (`core/groups.ts:31-34`) — bei `taktische-zeichen`
hieße die Variable `SUITE_ADMIN_GROUP_TAKTISCHE_ZEICHEN` und sähe anders aus als der Key.

---

## 0. Eigene Messungen — sie entscheiden die Streitfragen

**M1 — Der RSC-Import von `@einsatzzeichen/catalog` bricht `pnpm build`. Reproduziert.**
Wegwerf-App unter `/tmp`, Next 16.3.3, RSC-Seite mit `RECIPES` + `composeFromCatalog` + `renderSvg`:

```
Collecting page data using 5 workers ...
Error: Failed to collect configuration for /rsc
  [cause]: TypeError: The "path" argument must be of type string or an instance of URL.
           Received an instance of URL   { code: 'ERR_INVALID_ARG_TYPE' }
      at module evaluation (app/rsc/page.tsx:7:1)
```

Ursache: `catalog/dist/src/index.js:23` re-exportiert `fonts.js`, dort steht
`fileURLToPath(new URL(...))` auf **Modulebene**.

**M2 — Eine Client-Komponente mit Katalogimport bricht ebenfalls, sobald sie SSR/Prerender
durchläuft.**

```
Error occurred prerendering page "/insel".
TypeError: The "path" argument must be of type string or an instance of URL.
Export encountered an error on /insel/page: /insel, exiting the build.
```

**M3 — `dynamic(() => import("./Insel"), { ssr: false })` aus einem `"use client"`-Lader baut grün,
ohne jede Änderung an `next.config`.** `✓ Generating static pages using 5 workers (4/4)`. Turbopack
shimmt `node:url` im Browser-Zweig selbst. Der Chunk: **720.283 B roh / 133.621 B gzip**, enthält
`curvedPaths` (= `fingerprints.json`).

**M4 — `serverExternalPackages: ["@einsatzzeichen/catalog"]` heilt M1 und M2** (beide grün). Ein
gangbarer, aber nicht der einzige Weg.

**M5 — Ein eingechecktes Generat schlägt den Katalog-Code um Faktor 4:**

| | roh | gzip -9 |
|---|---|---|
| Katalog-Code im Client-Chunk (M3) | 720.283 | **133.621** |
| Generat: 246 Zeichen **inkl. fertiger SVGs** (`size:64`) | 381.541 | **31.902** |
| davon nur Index (ohne SVG/Spec) | 49.979 | 6.317 |
| 177 Bausteine (Piktogramme) zusätzlich | 192.200 | 18.672 |

Bauzeit für 246 Zeichen + 177 Bausteine inkl. `composeFromCatalog` + `renderSvg`: **41,7 ms**.

**M6 — Ein JSON-Import funktioniert in beiden Graphen.** Testapp mit `_lib/katalog.json`, importiert
von einer Server Component **und** einer Client-Insel über eine geteilte Datei ohne `"use client"`:
`✓ Compiled successfully`, `✓ Generating static pages (4/4)`.

**M7 — Bestandszahlen.**

```
RECIPES 242 | haupt 232 | #alternative 10
Titelkollisionen ohne #alternative: 3
  Mehrzweckboot [I.3.5, E.2.29] · Mehrzweckarbeitsboot [I.3.6, E.2.30] · Mehrzweckponton [I.3.7, E.2.31]
#alternative mit gleichem Titel wie Hauptschlüssel: 10 von 10, abweichend: 0
BASE_SYMBOLS 14 | ALL_PICTOGRAMS 269 (254 distinkte IDs, 177 standalone)
haupt mit organization: 221 von 232   |   COVERAGE_MANIFEST.coreVersion 0.2.0
domain-Review {"pending":544}  |  technical {"approved":532,"deviation":12}
```

Zehn der dreizehn scheinbar doppelten Titel sind `X`/`X#alternative`-Paare — dasselbe Zeichen in
zwei zulässigen Darstellungen, keine zwei Zeichen.

**M8 — Piktogramme haben KEIN `drawing`-Feld.**

```
Piktogramm-Felder: section,id,variant,title,referenceAsset,placement,viewBox,box,primitives
hat drawing-Feld? false
standalone renderbar via {viewBox, children: primitives}: 177 | Fehler: 0
```

`renderSvg(p.drawing, …)` wirft.

**M9 — Drei stille Drift-Fälle.**

```
RECIPES['GIBTSNICHT']                 = undefined     (still)
symbolKindLabel('quatsch')            = undefined     (still)
describeSymbolSpec({kind:'quatsch'})  = "Grundzeichen: undefined."   (still, im Anwendertext)
```

Ein Adapter, der Paketfunktionen roh durchreicht, schreibt nach einem Upgrade das Wort „undefined"
in einen deutschen Satz — bei HTTP 200, grünem Build, grünem Vitest.

**M10 — Fehlerklassen in 1.1.0.** `instanceof` genügt.

```
core exportiert: NotMeasuredError ✓  BodyNotMeasuredError ✓  CompositionError ✓
amphibienfahrzeug     -> NotMeasuredError  scope=value
event+organization    -> NotMeasuredError  scope=combination
building+strength     -> CompositionError  [strength-requires-unit]
label zu breit        -> CompositionError  [label-too-wide]
kind 'quatsch'        -> Error  "Kein Grundzeichen für "quatsch" im Katalog."
VALIDATION_RULE_IDS   -> 72   (compose kann 78 werfen, s. §6.3)
```

**M11 — `renderSvg` ohne `idPrefix`** erzeugt `<svg … aria-labelledby="ez-title ez-desc">` — auf
einer Kachelfläche mit 24 Zeichen 24-mal dieselbe DOM-ID. Optisch fällt nichts auf, kein Gate sieht
es.

**M12 — Suchqualität.** Index = `falte(titel + rezeptschlüssel + describeSymbolSpec(spec))`, gegen
232 Hauptrezepte:

```
rtw 2 · ktw 2 · seg 4 · loeschgruppe 1 · löschgruppe 1 · sanitaet 22 · sanität 22
betreuung 22 · bergung 7 · wasserrettung 24 · fuehrung 26 · zugtrupp 4
drehleiter 0 · krankenwagen 0
```

Die letzten beiden sind **kein** Suchproblem: der Katalog führt nur 12 Feuerwehr-Rezepte, die
Fahrzeuge existieren nicht. Ohne Umlautfaltung fände `loeschgruppe` 0 — die Faltung ist Pflicht.

**M13 — Kapitelverteilung.** 27 Kapitel über die 232. Die zwölf kleinsten (< 4 Einträge) umfassen
zusammen 20 Zeichen; für die braucht die Distraktorenwahl einen Rückfall auf `spec.kind`
(formation 105, vehicle-land 40, circle-12 28, person 21, vehicle-water 16, trailer 12 …).

**M14 — Kanonischer Spec-Schlüssel.** 232 Rezepte → 232 eindeutige Schlüssel, 0 Kollisionen;
Median-Länge 123, Maximum 510 Zeichen. `{kind:'formation',bodyMarks:[]}` === `{kind:'formation'}`;
`capabilities:['transport','fire-fighting']` === `['fire-fighting','transport']`.

**M15 — `matchFingerprint` taugt nicht als Bewerter.**
`{kind:'formation', organization:'thw', strength:'staffel'}` — falsche Organisation, Fähigkeit fehlt
vollständig — besteht gegen den Kennwert von C.1.1 „Löschstaffel" mit `{"ok":true,"problems":[]}`.

**M16 — Der Baukasten muss sperren, nicht meckern.** Von 225.720 aufgezählten Kombinationen der
fünf Hauptachsen tragen **894 — 0,4 %**. `erlaubteWerte` über 247 Kandidaten und elf Felder:
**9,7 ms kalt / 3,4 ms warm**.

**M17 — Auth-pflichtige Routen und der Service Worker.**

1. Ein Host mit `requiresAuth: true` beantwortet **jeden** Pfad ohne Sitzung mit **307 → /login**
   (`routing.ts:88-93`, `proxy.ts:39-44`) — auch `/sw.js` und `/manifest.webmanifest`.
2. `fetch()` folgt dem Redirect: `status 200, ok true, redirected true, url …/login`.
   `cache.put("/katalog", res)` **gelingt** — im Cache liegt dann die Anmeldeseite unter dem
   Katalogschlüssel. Der Wächter `if (!res.ok) return releaseBody(res)`
   (`qr/_lib/sw-source.ts:100`) fängt das nicht.
3. Jede Seite unter `SuiteRahmen` trägt `{"userName":"…","angemeldet":true}` und die
   gruppenabhängige App-Liste im Flight-Payload. Zwei Personen, dieselbe URL: 281.170 vs. 279.159 B.
   Gegenbeispiel `uav /`: 45.944 B, mit **und** ohne Sitzung byteidentisch, 0× `userName`.
4. **Nichts in der Suite räumt Cache oder Registrierung** beim Logout, Ablauf oder
   Sitzungswiderruf.
5. **Kein Modul hat heute `requiresAuth: true` UND eine PWA.** Es gibt kein Vorbild.

**Nicht gemessen (M-A, vor Commit 9 nachzuholen, §9):** ob der `/sw.js`-Abruf von
`navigator.serviceWorker.register()` das Sitzungscookie mitsendet.

---

## 1. Die tragende Architekturentscheidung

**Kein `@einsatzzeichen/*`-Import im Server-Graph. Ein eingechecktes Generat trägt Katalog, Suche,
Lernstoff und Offline. Der Katalog-Code erscheint an genau einer Stelle: der Baukasten-Insel,
geladen mit `ssr: false`. `next.config.ts` bleibt unangetastet.**

1. M1/M2: jeder Paketimport, der Server-Auswertung erfährt, bricht den Build — RSC **und**
   SSR-gerenderte Client-Insel.
2. M3: `ssr:false` ist der einzige Weg ohne Eingriff in die **suiteweite** `next.config.ts`.
   `serverExternalPackages` (M4) wäre die Alternative; sie ist eine vierte Ecke am Dreieck aus
   CLAUDE.md, und niemand kann erklären, warum eine *Server*-Option den *Client*-Fall heilt. Eine
   Konfigzeile ohne erklärbare Wirkung ist Wartungsschuld.
3. M5: das Generat ist mit fertigen Bildern **4,2-mal kleiner** als der Katalog-Code ohne Bilder.
4. M6: derselbe JSON-Import trägt Server- und Client-Seite, und die Filterfunktion liegt in **einer**
   Datei ohne `"use client"`, die beide benutzen — ein Codepfad fürs Suchen, nicht zwei.

**Abweichung vom ursprünglichen Ansatz C, ausdrücklich benannt:** Der Betreiber hatte
„Baukasten/Quiz/Offline in EINER Client-Insel, die als einzige Stelle den Katalog ins Client-Bündel
zieht" freigegeben. Das Ziel — Isolation des Katalogs — wird hier **schärfer** erfüllt: der
Katalog-*Code* liegt in genau einer Datei (`_ui/baukasten/paket.ts`), und die Katalog-/Offline-Insel
zieht ihn **gar nicht**, nur 32 KB gzip Daten. Der Preis: zwei Inseln statt einer, weil sonst die
Katalogsuche 133 KB Baukasten-Code mitzahlte.

---

## 2. Routen und Flächen

`shell: "full"` → `FullShell` legt `ARBEITSDICHTE` 44/48 automatisch um den Inhalt
(`FullShell.tsx:36`, `theme.ts:244`). **An keinem antd-Bedienelement wird `size` gesetzt** (Falle 4).
Eigenes Markup erbt den Token nicht und trägt `minHeight: 44` als Literal (Vorbild
`Seitenkopf.tsx:154`). `SCHREIBTISCHDICHTE` steht dem Modul nicht zu — sie ist eine
Betreiberentscheidung vom 2026-08-28 für radios Verwaltung.

```
src/app/m/zeichen/
  layout.tsx                              <link rel="manifest" crossOrigin> + Arimo-Klasse + children
  (shell)/layout.tsx                      <Shell variant="full" moduleKey="zeichen" nav={ZEICHEN_NAV}>
  (shell)/page.tsx                        RSC  Startseite (Vorbehalt + Katalogstand + Einstiege)
  (shell)/katalog/page.tsx                RSC-Hülle + <KatalogInsel />
  (shell)/katalog/[id]/page.tsx           RSC  Detail — SVG serverseitig aus dem Generat
  (shell)/merkliste/page.tsx              RSC
  (shell)/baukasten/page.tsx              RSC-Hülle + <BaukastenLader />  (ssr:false)
  (shell)/meine/page.tsx                  RSC
  (shell)/lernen/page.tsx                 RSC  Stand, Lernset-Auswahl, Startknopf
  (shell)/lernen/runde/page.tsx           RSC-Hülle + <QuizInsel frage={…} />   (kein Katalog-Code)
  (shell)/verwaltung/lernsets/page.tsx    RSC, moduleAdminPageOrNotFound als erste Anweisung
  (shell)/verwaltung/lernsets/[id]/page.tsx
  (rahmenlos)/layout.tsx                  eigener 56px-Kopf, KEIN <Shell>, gleiche Dichte
  (rahmenlos)/offline/page.tsx            <KatalogInsel offline />   ← die einzige gecachte Route
  manifest.webmanifest/route.ts · sw.js/route.ts · pwa-icon.svg/route.ts
  RegisterSW.tsx
```

**`/katalog` ist eine Insel, `/katalog/[id]` eine Server Component.** Beides ist begründet:

- Die **Liste** muss offline durchsuchbar sein, und Suchen braucht Client-JS. Sie rendert per SSR
  (kein `ssr:false` nötig — das Generat ist pures JSON, kein Paket) und hydriert ohne Mismatch, weil
  Server und Client dieselbe `sucheZeichen()`-Funktion mit demselben Generat aufrufen.
- Die **Detailseite** ist eine reine Server Component: `svgFuer(id)` → String →
  `dangerouslySetInnerHTML`. Das SVG stammt aus dem eingecheckten Generat, ist also
  vertrauenswürdig. Vorbilder im Repo: `qr/QrDisplay.tsx:151`, `lagerbuch/.../EtikettenBogen.tsx:66`,
  `radio/admin/(druck)/zugaenge/blatt/page.tsx:197`.

**`/offline` verdoppelt die Katalogfläche nicht** — sie rendert dieselbe `<KatalogInsel />`, nur ohne
`<Shell>` und mit gesetztem `offline`-Prop (§7.4). Das Layout ist ~20 Zeilen, die Seite drei. Grund
für die zweite Route ist M17.3: jede Seite unter `SuiteRahmen` trägt Klarnamen und gruppenabhängige
App-Liste im Flight-Payload.

> **Das rahmenlose Layout setzt dieselbe Bediendichte wie `FullShell`.** `(rahmenlos)/layout.tsx`
> umschließt seinen Inhalt mit demselben `ConfigProvider`-Dichtewert (`ARBEITSDICHTE`, 44/48), den
> `FullShell.tsx:36` legt. Ohne das stünden antd-Bedienelemente auf `/offline` auf 56/72, während
> das eigene Markup derselben Insel seine 44 als Literal trägt — dieselbe Fläche in zwei Größen,
> und kein Gate sieht es.

**Was RSC-seitig verboten bleibt und wie es hier gelöst ist:**

| Falle | Lösung im Modul |
|---|---|
| 1 (Compound in RSC) | Kein `Typography.Title` → natives `<h1>` mit `SCHRIFT.titel`. Kein `Descriptions.Item` → natives `<dl>`. Kein `Input.Search` → eigenes `<input>` in der Insel |
| 3 (Rot = Marke = Fehler) | Keine `Alert type="error"`, kein rotes `Tag`, kein roter `Progress`. `Progress` setzt `strokeColor`/`trailColor` selbst. Richtig/falsch: Wort zuerst, Zeichen zweitens, Farbe zuletzt aus `_lib/lernfarben.ts` |
| 6 (Client-Wert in RSC) | Alle Werte (Fragetypen, Achsen, Kapitel, Farben, `nav.ts`) in `_lib/` **ohne** `"use client"` |
| 7 (`@ant-design/icons` in RSC) | Das Modul fasst `@ant-design/icons` **nirgends** an — es ist ein SVG-Modul. Vorbild `aufgaben/_ui/ikonen.tsx` |
| 9 (Funktion über die Grenze) | Kein antd-`Table`, kein `Listy`. `Listy` verlangt `itemRender` als **Pflichtfeld** (`@rc-component/listy/es/List.d.ts:39`) — dieselbe Grenze. Server Actions werden in Inseln **direkt importiert** |
| 2/5 (CSS/Variablen) | Eigenes Markup liest **kein** `--ant-*`. Das Modul führt `--tz-*` in `_ui/zeichen.module.css`, umgeschaltet über `:root[data-theme="light"\|"dark"]` |
| Dunkelmodus | Gemessen haben alle drei `RENDER_THEMES` `surface:'#ffffff'`, und `renderSvg` malt keinen Hintergrund. Jedes Zeichen liegt auf einer **hellen Platte** (`--tz-blatt`), nie umgefärbtes Theme — die Organisationsfarben sind fachlich festgelegt |

### Navigation

`src/app/m/zeichen/_lib/nav.ts`, **ohne** `"use client"`:

```ts
export const ZEICHEN_NAV: SuiteNavItem[] = [
  { key: "katalog",   title: "Katalog",       href: "/m/zeichen/katalog",   ikon: "zeichensuche" },
  { key: "merkliste", title: "Merkliste",     href: "/m/zeichen/merkliste", ikon: "merkliste" },
  { key: "baukasten", title: "Baukasten",     href: "/m/zeichen/baukasten", ikon: "baukasten" },
  { key: "meine",     title: "Meine Zeichen", href: "/m/zeichen/meine",     ikon: "baukasten" },
  { key: "lernen",    title: "Üben",          href: "/m/zeichen/lernen",    ikon: "ueben" },
  { key: "lernsets",  title: "Lernsets",      href: "/m/zeichen/verwaltung/lernsets",
    ikon: "lernsets", abschnitt: "Verwaltung" },
];
```

Kein Eintrag mit `href: "/m/zeichen"` — `aktiverEintrag` behandelt die Wurzel als Rückfall und
markierte sie sonst auf jeder Seite. Der Verwaltungseintrag erscheint nur bei
`canAdminModule("zeichen")` — **dasselbe Prädikat**, das die Route gatet.

**Fünf neue Namen** in `core/shell/types.ts` (`NavIkonName`, heute 21) **und** in
`core/shell/navIkonen.tsx`. Verifiziert vorhanden in `react-icons/pi`:
`zeichensuche`→`PiMagnifyingGlass` · `merkliste`→`PiBookmarkSimple` · `baukasten`→`PiPuzzlePiece` ·
`ueben`→`PiGraduationCap` · `lernsets`→`PiCardsThree`. Kein geliehener Name: `katalog` ist von `uav`
belegt und heißt dort etwas anderes (Begründung ausgeschrieben in `types.ts:19-28`).

### Registry-Eintrag

```ts
// zeichen: alles hinter dem Login, aber ohne Zugangsgruppe — `requiredGroups: []` heißt
// „jeder Eingeloggte" (canAccess steigt bei leerer Liste mit true aus, registry.ts:266-276).
// switcherGroupSources MUSS [] bleiben: bei ["access"] und leerem requiredGroups ist
// hasAnyGroup(g, []) === [].some(...) === false (groups.ts:57-63) — die Kachel wäre für
// JEDEN unsichtbar. adminGroups gaten allein die kuratierten Lernsets; der Suite-Admin
// kommt über isModuleAdmin mit durch (groups.ts:125) — hier gewollt, weil hinter dem
// Riegel kein Geheimnis liegt (dieselbe Linie wie aufgaben, anders als files/lagerbuch).
//
// prodHosts bleibt leer, der Host steht ausschließlich in SUITE_HOST_ZEICHEN — dieselbe
// Betreiberauflage wie bei lagerbuch und radio. ANDERS ALS DORT ist er hier aber eine
// AUSLIEFERUNGSVORAUSSETZUNG, nicht eine Option: ohne ihn greift der Rewrite in
// decideRoute nicht, /sw.js landet im Portal-Modul, und die PWA fällt STILL aus (§7.1).
{ key: "zeichen", title: "Taktische Zeichen", icon: "DeploymentUnitOutlined", shell: "full",
  requiresAuth: true, requiredGroups: [], adminGroups: ["iuk-zeichen-admin"],
  prodHosts: [], showInSwitcher: true, switcherGroupSources: [] },
```

`DeploymentUnitOutlined` ist verifiziert vorhanden
(`node_modules/@ant-design/icons/es/icons/DeploymentUnitOutlined.js`) und von keinem der zwölf Namen
in `ICONS` (`icons.ts:138-151`) belegt. Ein fehlender Name fiele **still** auf `AppstoreOutlined`
zurück; einziger Wächter ist `AppUmschalter.test.tsx:227/:237`.

---

## 3. Die Adapterschicht

### 3.1 Der Generator — `scripts/zeichen-generat.ts`

Der **einzige** Ort im Repo außerhalb der Baukasten-Insel, der `@einsatzzeichen/*` importiert. Läuft
per Hand (`pnpm exec tsx scripts/zeichen-generat.ts`) und im Wächtertest. Schreibt
`src/app/m/zeichen/_lib/katalog.generiert.json` (382 KB roh, **eingecheckt**).

**Warum eingecheckt statt Build-Schritt:** eine frisch ausgecheckte Arbeitskopie muss ohne Vorlauf
`pnpm typecheck` und `pnpm vitest run` bestehen. Ein `prebuild`-Skript wäre eine vierte Ecke am
Dreieck, ein `fs`-Zugriff zur Laufzeit eine fünfte — dieselbe Begründung, die
`neuigkeiten/typen.ts:4-19` für die Release Notes ausschreibt. Drift ist ausgeschlossen, weil der
Wächter das Generat bei **jedem** `vitest run` in gemessenen 42 ms neu baut und byteweise vergleicht.
Preis, ausdrücklich benannt: ein ~382-KB-Diff bei jedem Paketupgrade.

Was der Generator tut:

1. `Object.entries(RECIPES).filter(([k]) => !k.includes("#"))` → **232**.
2. `Object.entries(BASE_SYMBOLS)` → **14**.
3. Die 10 `#alternative` an ihren Hauptschlüssel anhängen als `zweiteDarstellung` (M7: alle 10
   tragen denselben Titel — zwei zulässige Darstellungen desselben Zeichens).
4. Je Eintrag `composeFromCatalog(spec, titel)` → `renderSvg(drawing, { size: 64, idPrefix: slug })`.
   Grundzeichen über `entry.depictions[0].drawing`.
5. `describeSymbolSpec(spec)` → `bedeutung`; **auf `"undefined"` geprüft** (M9) und dann mit einer
   benannten `KatalogDriftFehler` **geworfen** — laut ist besser als still.
6. `symbolKindLabel(kind)` und `ORGANIZATION_LABELS[org]` gegen `undefined` geprüft → `null`,
   Anzeige „—", nie das Wort „undefined".
7. Kanonischer Spec-Schlüssel (§3.6).
8. `kapitel` über einen eigenen 8-Zeilen-Nachbau von `chapterForSection` (das Original liegt im
   Paket `@einsatzzeichen/website`, `"private": true`, nicht installierbar): `#alternative`
   abschneiden → `/^([A-Z])\.(\d+)/` → `Anhang $1.$2` → `/^(\d+)\./` → `Kapitel $1`. Ergibt gemessen
   27 Kapitel; Rückfall für unbekannte Form ist der rohe Abschnitt, kein Wurf.
9. `reviewNotiz` **nur** für die 12 Einträge mit `technical.status === "deviation"`, mit entfernten
   Dateinamen. **Kein „geprüft"-Abzeichen je Zeichen** — siehe §5.6.
10. **`referenceAsset`/`referenceAssets` werden NICHT geschrieben.** Das sind BABZ-Dateinamen mit
    Lizenzlage `unclear` (`catalog/src/sources.ts:79ff`); die Projekt-Website schwärzt sie aus jedem
    ausgelieferten Text.
11. `titel` doppelt vergeben (M7: drei Fälle) → `antwort = titel + " (" + organisation + ")"`,
    `mehrdeutigerTitel: true`. Damit ist die Frage zur **Bauzeit** beantwortet, nicht bei jeder
    Frageerzeugung.
12. `KATALOG_STAND` schreiben: Paketversion aus `node_modules/@einsatzzeichen/catalog/package.json`,
    Datenversion aus `COVERAGE_MANIFEST.coreVersion`, Anzahl, und das **Erzeugungsdatum als
    ISO-Tag** (§7.4 zeigt ihn an).
13. **Feldwächter für `ORDNUNG`** (§3.6): die Vereinigungsmenge aller Schlüssel über die 232
    Rezept-Specs muss Teilmenge von `ORDNUNG` sein, sonst `KatalogDriftFehler`. Ohne diesen Wächter
    ließe ein in einer künftigen Paketversion hinzukommendes `SymbolSpec`-Feld zwei verschiedene
    Zeichen auf denselben kanonischen Schlüssel fallen — still.
14. Arimo aus `node_modules/@einsatzzeichen/catalog/dist/assets/Arimo[wght].ttf` (82.756 B) nach
    `src/app/m/zeichen/_fonts/` kopieren, `Arimo-OFL.txt` daneben.

### 3.2 Die Naht — `src/app/m/zeichen/_lib/katalog.ts`

**Kein `"use client"`. Kein `@einsatzzeichen`-Import.** Liest ausschließlich die JSON. Wird von
Server Components **und** von der Katalog-/Offline-Insel benutzt — deshalb genau ein Codepfad fürs
Suchen.

```ts
export type ZeichenId = string;   // "rezept:E.1.1" | "grund:base.formation"

export interface Zeichen {
  id: ZeichenId;
  titel: string;                 // NICHT eindeutig
  antwort: string;               // Quiz-Antworttext, bei Kollision mit Organisation qualifiziert
  mehrdeutigerTitel: boolean;    // true bei den sechs Mehrzweck*-IDs
  abschnitt: string;             // "E.1.1" — Rohwert, sortierbar
  kapitel: string;               // "Anhang E.1"
  grundform: string | null;      // symbolKindLabel, auf undefined geprüft
  organisation: string | null;   // gemessen nur 221 von 232
  staerke: string | null;
  bedeutung: string;             // describeSymbolSpec — die Quizantwort und die Detailzeile
  suchtext: string;              // falte(titel + abschnitt + bedeutung)
  svg: string;                   // fertig, size 64, mit idPrefix
  spec: SymbolSpec | null;       // nur rezept/grundzeichen — der Weg in den Baukasten
  specKanon: string | null;      // kanonischer Schlüssel, für die Bauübung
  zweiteDarstellung?: { id: ZeichenId; svg: string; abschnitt: string };
  reviewNotiz: string | null;    // nur bei technischer Abweichung, Dateinamen entfernt
}

export const KATALOG_STAND: {
  paket: string; daten: string; anzahl: number; erzeugtAm: string;
};
export function alleZeichen(): readonly Zeichen[];
export function findeZeichen(id: string): Zeichen | null;   // gibt null zurück, wirft NIE
export function sucheZeichen(f: Filter): { treffer: readonly Zeichen[]; gesamt: number };
export function kapitel(): readonly { name: string; anzahl: number }[];
export function organisationen(): readonly string[];
export function grundformen(): readonly string[];
```

`findeZeichen` gibt `null` zurück — anders als `RECIPES[k]` (M9: `undefined`, still) und anders als
`pictogram()`/`composeFromCatalog()` (M10: werfen). Eine unbekannte ID ist hier ein **Zustand**,
kein Fehler (§4.6).

### 3.3 Die Faltung — `src/app/m/zeichen/_lib/falte.ts`

```ts
/**
 * DIE EINE Faltung des Moduls — Generator UND Insel benutzen sie, nie zwei äquivalente.
 * Sie faltet MEHR als lagerbuchs falte() (das ist buchstäblich s.toLowerCase()).
 * Gemessen: mit reiner Kleinschreibung findet "loeschgruppe" 0 von 232 und
 * "sanitaet" 0 von 22. Auf einem Tablet mit Handschuhen ist das ein Ausfall.
 */
export const falte = (s: string): string =>
  s.toLowerCase()
   .replaceAll("ä","ae").replaceAll("ö","oe").replaceAll("ü","ue").replaceAll("ß","ss")
   .normalize("NFD").replace(/\p{Diacritic}/gu, "")
   .replace(/[^a-z0-9]+/g, " ").trim();
```

### 3.4 Die Client-Naht — `src/app/m/zeichen/_ui/baukasten/paket.ts`

```
_ui/baukasten/BaukastenLader.tsx   "use client", 8 Zeilen:
                                   dynamic(() => import("./BaukastenInsel"), { ssr: false })
_ui/baukasten/BaukastenInsel.tsx   "use client", die Oberfläche
_ui/baukasten/paket.ts             "use client", EINZIGER Katalog-Code-Import
_ui/baukasten/zustand.ts           reduceSpec / erlaubteWerte / kodiereSpec / dekodiereSpec
```

`ssr: false` ist die **gemessene Bedingung** (M2/M3) dafür, dass `next.config.ts` unangetastet
bleibt. Über dem `dynamic`-Aufruf steht das als Kommentar, **und** `_lib/naht.test.ts` riegelt es ab.

### 3.5 Arimo

Gemessen tragen 160 von 242 Rezepten (66 %) `<text font-family="Arimo">`, und die Textgeometrie ist
gegen Arimo vermessen. Ohne die Schrift laufen „KatSL", „ÜMANV-S", „MLW IV Lbw" aus ihren Boxen.
Einbindung über `next/font/local` aus `_fonts/`, dann:

```css
.zeichenflaeche svg text { font-family: var(--tz-zeichenschrift); }
```

Das schlägt das `font-family`-Präsentationsattribut (Attributspezifität 0).

**Die `.variable`-Klasse hängt am `<div>` in `src/app/m/zeichen/layout.tsx`**, das `children`
umschließt — dem einzigen gemeinsamen Vorfahren **beider** Routengruppen. Am `(shell)`-Layout hinge
sie nicht über `/offline`; am `<html>` müsste sie ins Root-Layout der Suite und wäre eine
core-Änderung ohne zweiten Nutznießer.

**`next/font/local` statt `public/m/zeichen/`:** die Datei landet dann unter `/_next/static/media/`
mit Inhaltshash, und `/_next` steht in `PASSTHROUGH` (`routing.ts:12`) — sie ist ohne Sitzung
abrufbar und wird vom Service Worker über `cacheReferencedAssets` von selbst mitgenommen. Unter
`public/m/zeichen/` liefe sie durch `decideRoute` und wäre bei `requiresAuth: true` gegatet
(gemessen an `uav/illustrationen.test.ts:8-13`, das nur durchkommt, weil `uav` `requiresAuth: false`
trägt).

**Nicht gemessen:** ob die CSS-Regel im Browser tatsächlich greift. jsdom rechnet keine Glyphen
(§9, H2).

### 3.6 Der kanonische Schlüssel — `_lib/kanon.ts`

```ts
const ORDNUNG = ["kind","bodyVariant","organization","technicalFill","strength",
  "technicalHeadMark","administrativeLevel","functionRole","vehicleCategory",
  "capabilities","bodyMarks","designation","labels"] as const;
export function kanonischerSchluessel(spec: SymbolSpec): string;
```

Vier Regeln: `undefined`/`null`/`""` weglassen · leere Arrays weglassen · Arrays sortieren · Felder
in fester Reihenfolge serialisieren, `labels`-Zonen alphabetisch. Gemessen kollisionsfrei (M14).

Er trägt zwei Lasten: die Frage „diese Zusammenstellung habe ich schon gespeichert?" (§4.3) und die
Bewertung der Bauübung (§6.5). Der Generator hält `ORDNUNG` über Punkt 13 aus §3.1 gegen die
tatsächlich vorkommenden Felder — **ohne diesen Wächter ist die handgeschriebene Liste eine stille
Fehlerquelle**, weil ein neues Spec-Feld einfach weggelassen würde.

**`matchFingerprint` wird NICHT verwendet** (M15): es vergleicht vier Hüllwerte des
Körper-Primitivs; Farbe, Kopfzone, Piktogramm und Beschriftung gehen nicht ein. Als Bewerter wäre es
ein Prüfer, der die falsche Organisation durchwinkt. **Ein SVG-Vergleich ebenso wenig:** er würde
eine sachlich richtige Antwort mit anderer `capabilities`-Reihenfolge als falsch werten (die
Reihenfolge ändert die z-Ordnung).

---

## 4. Datenmodell

`src/app/m/zeichen/_db/schema.ts`, **kein `"use client"`, kein Icon-Import**. Hausstil `aufgaben`:
Zeitpunkte als **Unix-SEKUNDEN** (`{ mode: "timestamp" }`, niemals `timestamp_ms` — `qr` macht es
anders, ein Copy-Paste von dort ist der Weg in den Faktor-1000-Fehler), Kalendertage als **TEXT
`YYYY-MM-DD`**, Snake-Case in der DB, Camel-Case in TS, **kein Tabellenpräfix**.
`_db/client.ts`: `export const getDb = () => getModuleDb("zeichen", schema); export type DB = ReturnType<typeof getDb>;`

**Fünf Tabellen — genau die vier Gegenstände aus der Betreiberentscheidung, nicht mehr.**

### 4.1 `lernstand`

| Spalte | Typ |
|---|---|
| `sub` | `text("sub").notNull()` |
| `zeichen_id` | `text("zeichen_id").notNull()` |
| `stufe` | `integer("stufe").notNull().default(0)` |
| `faellig_am` | `text("faellig_am").notNull()` — `YYYY-MM-DD` |
| `richtig` | `integer("richtig").notNull().default(0)` |
| `falsch` | `integer("falsch").notNull().default(0)` |
| `letzte_antwort_am` | `integer("letzte_antwort_am", { mode: "timestamp" })` — nullable |
| `erstellt_am` | `integer(..., {mode:"timestamp"}).notNull().$defaultFn(() => new Date())` |

```ts
primaryKey({ columns: [t.sub, t.zeichenId] }),
index("lernstand_faellig_idx").on(t.sub, t.faelligAm),
check("lernstand_stufe_check", sql`${t.stufe} BETWEEN 0 AND 4`),
```

**Keine Surrogat-ID** — es gibt genau eine Zeile je Paar, geschrieben per `onConflictDoUpdate`.
**Ein Stand je (Person, Zeichen), NICHT je Fragetyp:** ein Zeichen kennt man oder nicht. Getrennte
Stufen verdoppelten die Fälligkeitsliste und erzeugten die absurde Karteikarte „erkannt, aber nicht
benannt". Die Richtung wird bei der Ausspielung gewürfelt (§5.2). **`check()` zusätzlich zum Typ**,
weil ein Drizzle-`enum` in SQL nur `text NOT NULL` erzeugt (ausgeschrieben in `radio/_db/schema.ts`).

### 4.2 `merkliste`

`sub text notNull` · `zeichen_id text notNull` · `titel_schnappschuss text notNull` ·
`erstellt_am integer timestamp notNull` · PK `(sub, zeichenId)`.

`titel_schnappschuss` ist die Antwort auf „was war das?", die auch dann noch trägt, wenn die ID nicht
mehr auflösbar ist. **Kein Fremdschlüssel** — die Wahrheit liegt im Generat, nicht in der Datenbank;
das gehört in den Schema-Kopf ausgeschrieben, sonst schreibt es jemand später als FK auf eine
Katalogtabelle um, die dann gepflegt werden müsste.

**Anzeigequelle ist immer das Generat, der Schnappschuss ist der Rückfall.** Löst `findeZeichen(id)`
auf, gewinnt der heutige Titel; sonst der Schnappschuss mit dem Zusatz aus §4.6. Ohne diese Regel
laufen zwei Fassungen desselben Titels bei jeder Katalogkorrektur auseinander, und niemand weiß,
welche stimmt.

### 4.3 `eigene_zeichen`

| Spalte | Typ | Anmerkung |
|---|---|---|
| `id` | `text` PK `$defaultFn(newId)` | `export const newId = () => nanoid()` |
| `sub` | `text` notNull | |
| `name` | `text` notNull | vom Nutzer vergeben |
| `spec_json` | `text` notNull | vollständige `SymbolSpec` |
| `spec_kanon` | `text` notNull | kanonischer Schlüssel |
| `svg_zwischenspeicher` | `text` notNull | das beim Speichern erzeugte SVG |
| `paket_version` | `text` notNull | aus `KATALOG_STAND.paket`, **nicht** als Literal |
| `daten_version` | `text` notNull | aus `KATALOG_STAND.daten`, **nicht** als Literal |
| `erstellt_am`, `geaendert_am` | `integer timestamp` notNull | |

```ts
uniqueIndex("eigene_zeichen_sub_name_idx").on(t.sub, t.name),
index("eigene_zeichen_sub_kanon_idx").on(t.sub, t.specKanon),   // NICHT unique
```

> **Warum `spec_kanon` ausdrücklich NICHT eindeutig ist.** Ein `uniqueIndex` darauf zusammen mit
> `onConflictDoUpdate` benennt ein bereits gespeichertes Zeichen **still um**, statt ein zweites
> anzulegen: Wer „Zugtrupp Nord" gespeichert hat und dieselbe Zusammenstellung zwei Wochen später
> beim Ausprobieren als „Test" sichert, findet „Zugtrupp Nord" danach nicht mehr — und niemand hat
> gelöscht. „Schon gespeichert?" ist eine **Lesefrage**, keine Eindeutigkeitszusage. Die
> Eindeutigkeit liegt deshalb dort, wo der Nutzer sie versteht: auf dem Namen. Der nicht-eindeutige
> Index beantwortet die Lesefrage, und die Action **fragt zurück**, statt zu entscheiden (§6.6).

**Warum die volle Spec statt einer Katalog-ID:** eine `SymbolSpec` ist ein reines serialisierbares
Objekt (typisch ~120 B JSON) und überlebt das Umbenennen einzelner Katalogeinträge; ein Verweis
nicht.

**Warum zusätzlich `svg_zwischenspeicher`:** `/meine` ist eine Server Component, und Rendern aus der
Spec bräuchte `composeFromCatalog` — dann zöge der Server-Graph den Katalog und M1 schlüge zu. Die
Insel hat das SVG beim Speichern ohnehin schon.

> **Dieses SVG wird auf `/meine` NICHT mit `dangerouslySetInnerHTML` gerendert.** Es ist vom Client
> geliefertes Markup, das die Server Action fachlich nicht nachprüfen kann (§6.6) — der Vertrag im
> Repo lautet an beiden Präzedenzstellen, dass nur serverseitig erzeugtes Markup so eingesetzt wird.
> Stattdessen: `<img src={"data:image/svg+xml;base64," + b64} alt={name} />`. In einem `<img>`
> führt ein SVG **kein** Script aus und lädt nichts nach. Dazu eine Formprüfung beim Speichern
> (beginnt mit `<svg`, endet mit `</svg>`, Längenobergrenze, kein `<script`, kein `on…=`) — sie ist
> Hygiene, nicht der Riegel; der Riegel ist das `<img>`. Die Detailseiten des **Katalogs** rendern
> weiter mit `dangerouslySetInnerHTML`, weil ihr SVG aus dem eingecheckten Generat stammt.

**Warum die zwei Versionsspalten:** es gibt **keine** dokumentierte ID-Stabilitätszusage (grep über
`README.md` + `docs/decisions/` nach semver/breaking/Kompatibilität: 0 Treffer; Präzedenzfall
`d0532ee` entfernte acht `comms.*`-IDs). Mit den Spalten sagt ein Blick, gegen welchen Stand ein
Zeichen einmal gültig war. Sie werden aus `KATALOG_STAND` gelesen — als Literale im Quelltext
notiert lögen sie ab dem ersten Upgrade.

### 4.4 `lernsets` / `lernset_zeichen`

`lernsets`: `id text PK newId` · `slug text notNull` + `uniqueIndex` · `titel text notNull` ·
`beschreibung text` · `aktiv integer boolean notNull default false` ·
`sortierung integer notNull default 0` · `erstellt_von text notNull` · `erstellt_am` · `geaendert_am`.

`lernset_zeichen`: `lernset_id text notNull references(() => lernsets.id, { onDelete: "cascade" })` ·
`zeichen_id text notNull` · `titel_schnappschuss text notNull` · `position integer notNull` ·
PK `(lernsetId, zeichenId)` · `index(lernsetId, position)`.

`aktiv` beginnt auf `false`: ein Lernset entsteht über mehrere Sitzungen, ohne Entwurfszustand sieht
jeder Lernende jede Halbfertigkeit. `foreign_keys = ON` ist scharf (`core/db/index.ts:12-23`), der
Cascade wirkt wirklich.

`erstellt_von` wird gespeichert, aber **nicht angezeigt** — deshalb braucht das Modul **keine**
Personen-/Namenstabelle. Ein kuratiertes Lernset trägt die Autorität der Ausbildung, nicht die einer
Person.

**Lernsets haben einen Konsumenten** — das ist Bedingung, nicht Beiwerk: §5.1 schränkt die Runde auf
ein gewähltes Set ein, `/lernen` trägt das Auswahlfeld. Ohne diesen Weg wären Tabellen, Admin-Fläche
und Admin-Gruppe write-only.

### 4.5 Personenidentität

**`session.user.id`, und das IST der Pocket-ID-`sub`** — aber nur, weil `core/auth/config.ts:159-162`
ihn im `jwt`-Callback aktiv zurückholt (@auth/core setzt sonst eine Zufalls-UUID pro Anmeldung;
gemessener Anlass: 13 `known_users`-Zeilen für eine Person in drei Tagen).

**Nie die E-Mail:** `core/directory/index.ts:158-168` liefert bewusst *alle* Konten zu einer Adresse
(„im Betrieb gemessen: drei `sub`s auf einer Adresse").

**Der Typ lügt.** `@auth/core@0.41.3/lib/actions/session.js:38` baut `user` **ohne** `id`. Jede
Stelle prüft explizit — TypeScript sieht das nicht:

```ts
const sub = (await auth())?.user?.id;
if (!sub) notFound();                                   // Seiten
if (!sub) throw new Error("Forbidden");                 // Server Actions
if (!sub) return new Response(null, { status: 404 });   // Route Handler
```

**IDOR:** kein Lesepfad nimmt einen `sub` aus einem URL-Parameter. Alles serverseitig aus `auth()`.
Modul-Admin ist `isModuleAdmin` aus `core/groups`, **nie** `session.user.isAdmin` (das ist suiteweit).

Abfragen mit dem **Query-Builder**: `db.query.*` und `relations()` kommen im ganzen Repo null mal vor.

**Wird eine Person in Pocket ID gelöscht und neu angelegt, ändert sich ihr `sub`** — Lernstand,
Merkliste und eigene Zeichen sind danach nicht mehr zuzuordnen. Das Modul führt bewusst keine
Namens- oder Adresskopie, mit der man sie wieder verbinden könnte; eine solche Kopie wäre eine
zweite Personenquelle mit eigener Alterung. Waisenzeilen bleiben stehen, wie überall sonst in der
Suite auch (§9, E5).

### 4.6 Wenn eine gespeicherte Zeichen-ID verschwindet

Drei Stufen, **keine davon löscht etwas.**

**Stufe 1 — Bestandszusicherung** in `_lib/katalog.test.ts`, rot beim Paketupgrade:

```ts
expect(KATALOG_STAND.anzahl).toBe(246);      // 232 + 14
expect(KATALOG_STAND.daten).toBe("0.2.0");
for (const id of ANKER) expect(findeZeichen(id), id).not.toBeNull();
```

`ANKER` ist die namentliche Liste aller IDs aus `seedLokal.ts`. Die Zahl wird beim Upgrade
**angehoben, nicht gelöscht** — dieselbe Regel wie `bootstrap.test.ts:718`.

**Stufe 2 — Oberfläche.** Eine Merkzeile ohne Auflösung bleibt sichtbar und zeigt
„**Bergungsgruppe** — dieses Zeichen führt der Katalog nicht mehr", plus Entfernen-Knopf. Eine
Lernstandszeile ohne Auflösung wird beim Fragenziehen **übersprungen**, nicht gelöscht (der Katalog
könnte sie zurückbringen). Ein Lernset bleibt nutzbar, die Größe nennt die auflösbaren
(„18 von 20 verfügbar"). Ein eigenes Zeichen bleibt sichtbar (`svg_zwischenspeicher` überlebt jede
Katalogänderung); nur *Bearbeiten* kann fehlschlagen, und die Insel sagt dann: „Diese
Zusammenstellung lässt sich mit der heutigen Katalogfassung nicht mehr zeichnen — sie wurde mit
`<paket_version>` gespeichert."

**Stufe 3 — keine automatische Migration.** Eine Regel „alte ID → neue ID" wäre eine Vermutung über
fremde Absicht; der Präzedenzfall zeigt, dass IDs auch ersatzlos entfallen. Falls je nötig: eine
handgeschriebene `000N_<name>.sql` plus Journalzeile, mit einem Commit, der sie begründet.

**Der wahrscheinlichste Fall ist nicht der Verlust EINER ID, sondern eine Neunummerierung.** Dagegen
trägt keine der drei Stufen — sie fangen ihn nur laut auf: die Bestandszusicherung wird rot, jede
Merkzeile zeigt ihren Schnappschuss, jedes eigene Zeichen bleibt als Bild erhalten. Die Zuordnung
alt→neu bliebe Handarbeit und ist dann eine eigene Aufgabe mit eigener Entscheidung, kein
Automatismus.

### 4.7 Kommandos

```bash
pnpm exec drizzle-kit generate --config=src/app/m/zeichen/_db/drizzle.config.ts
```

Es gibt **kein** pnpm-Skript dafür (`package.json:6-19`) und es wird auch keines erfunden.
`_db/drizzle.config.ts` mit repo-root-relativen Pfaden, `dbCredentials.url: "./.data/zeichen.db"`.

---

## 5. Lernlogik

Alles in `_lib/lernen/`, **ohne** `"use client"`, mit `heute` und `seed` **als Parameter** — nie
`new Date()`/`Math.random()` im Rumpf. Das ist die einzige Bauform, in der ein Quiz testbar ist.

### 5.1 Bestand

Fragbar sind die **232 Hauptrezepte**. Ausgeschlossen:

- die 10 `#alternative` (M7: identischer Titel, also identische Bedeutung → zwei richtige Antworten),
- die 269 Piktogramme (`describePictogram` liefert gemessen nur „Eigenständiges Piktogramm:
  `<title>`." — eine Titelwiederholung, keine Frage),
- **die 14 Grundzeichen**, aus demselben Grund: ihre `bedeutung` ist die Titelwiederholung plus eine
  Aktenzeichennummer. Sie stehen im Katalog, sind merkbar und im Baukasten wählbar — nur nicht
  fragbar. Die Zahlen in §5.5 summieren sich deshalb auf **232**, nicht 246.

**Lernset-Einschränkung.** `/lernen` trägt ein Auswahlfeld „Alle Zeichen" (Vorgabe) oder eines der
`aktiv`-Lernsets. Die Wahl steht in der URL (`?set=<slug>`), nicht in der Datenbank — sie ist eine
Ansicht, kein Zustand. Der Bestand ist dann die Schnittmenge aus `lernset_zeichen` und den 232
fragbaren; **Distraktoren kommen weiterhin aus dem ganzen Katalog** (§5.3), sonst würde ein Set mit
15 Zeichen die falschen Antworten verraten. Ein Set, aus dem nach einem Upgrade weniger als vier
Zeichen auflösbar sind, wird nicht angeboten und sagt warum.

### 5.2 Fragetypen und Richtung

```ts
export const FRAGETYPEN = ["zeichen_bedeutung", "bedeutung_zeichen"] as const;
```

Kein Freitext. Die **Richtung wird gewürfelt**, nicht getrennt gezählt:

| Stufe | Verteilung |
|---|---|
| 0–1 | immer `zeichen_bedeutung` (erkennen kommt vor benennen) |
| 2–4 | 50/50 zeichen ↔ bedeutung |

`bedeutung_zeichen` **überspringt die sechs Zeichen mit `mehrdeutigerTitel`** (M7). In
`zeichen_bedeutung` sind sie unproblematisch: dort ist `antwort` die Antwort, und die trägt die
Organisation.

> **Die Bauaufgabe ist kein Quiz-Fragetyp, sondern eine freie Übung im Baukasten** (§6.5,
> Betreiberentscheidung 2026-09-02). Als Fragetyp bräuchte sie den Katalog-Code auf `/lernen/runde`
> — also eine dritte, dynamisch geladene Insel mit gemessenen 133 KB gzip auf dem Lernpfad, genau
> den Kosten, wegen derer §1 die Inseln trennt. Und über die Leitner-Stufen wäre sie frühestens am
> 27. Tag erreichbar gewesen: der teuerste Fragetyp vier Wochen lang toter Code. Als Übung im
> Baukasten, wo der Katalog-Code ohnehin liegt, ist sie ab Tag 1 benutzbar und kostet keine Insel.
> Sie schreibt **keinen** Lernstand.

### 5.3 Distraktoren — `_lib/lernen/fragen.ts`

```ts
export interface Frage {
  readonly zeichenId: ZeichenId;
  readonly typ: Fragetyp;
  readonly stamm: string;                    // Bedeutungstext oder ""
  readonly optionen: readonly { id: ZeichenId; antwort: string; svg: string | null }[];
}
export function baueFrage(ziel: Zeichen, typ: Fragetyp,
                          bestand: readonly Zeichen[], seed: number): Frage;
```

Drei Stufen, mehr braucht es nicht (M13):

1. **Gleiches Kapitel** — die fachliche Nachbarschaft (Löschstaffel gegen Löschgruppe). Deckt 212
   von 232 Zeichen mit ≥ 3 Kandidaten ab.
2. **Gleiche `spec.kind`** als Rückfall für die 20 Zeichen in den zwölf kleinsten Kapiteln.
3. Ganzer Bestand, falls immer noch zu wenig.

Filter, jeder als benannte Bedingung: `k.id !== ziel.id` **und** `k.antwort !== ziel.antwort`
(fängt die drei echten Kollisionen und die Alternativen) **und** `k.id !== ziel.zweiteDarstellung?.id`.

Gezogen wird über einen **deterministischen** Generator (`_lib/lernen/zufall.ts`, xorshift32,
12 Zeilen) aus `seed = hash(sub, zeichenId, typ, rundenNr)`. Zwei Gründe: die Frage würfelt bei einem
Rerender nicht neu, und derselbe Testfall ergibt zweimal dasselbe. Die Position der richtigen Antwort
ist gleichverteilt — der Test prüft das über ≥ 200 Ziehungen.

**Ein Verwechslungsgraph (Ein-Feld-Nachbarn) wird nicht gebaut.** Er wäre eine zusätzliche
Datenstruktur im Generat mit eigener Testfläche; Kapitel + `kind` decken gemessen 232/232 ab, und die
Auflösung erklärt den Unterschied ohnehin, indem sie beide `bedeutung`-Sätze nebeneinander zeigt.

### 5.4 Wiederholung — `_lib/lernen/leitner.ts`

```ts
export const INTERVALL_TAGE = [1, 3, 7, 16, 35] as const;   // Stufe 0..4
export function naechsterStand(stufe: number, ergebnis: "richtig" | "falsch", heute: string):
  { stufe: number; faelligAm: string };
```

richtig → `stufe = min(stufe+1, 4)`, fällig in `INTERVALL_TAGE[neu]` Tagen ·
falsch → `stufe = 0`, `faelligAm = heute` (also sofort wieder im Stapel).

**Warum Leitner und nicht SM-2:** SM-2 braucht eine Selbsteinschätzung 0–5, die es bei Multiple
Choice nicht gibt, und führt drei Gleitkommafelder, die nach einem Jahr niemand mehr erklärt. Leitner
ist mit **einer** Integer-Spalte vollständig beschrieben und in drei Zeilen prüfbar.

`faellig_am` ist ein **Kalendertag als TEXT** — als Zeitpunkt hinge „heute fällig" an der Zeitzone
des Lesers, und lexikografisch ist `faellig_am <= :heute` ohne Datumsrechnen vergleichbar.

**Freiwilliges Üben ändert `lernstand` nicht.** Wer ein Zeichen übt, das erst in 12 Tagen fällig
wäre, bekommt keine neue Stufe — sonst arbeitet man sich mit Fleiß aus dem Stapel, ohne etwas zu
behalten.

**Der Stand wird nach jeder einzelnen Antwort serverseitig geschrieben**, nicht am Rundenende:
`session.error === "RefreshTokenError"` löst in `components/providers.tsx:63-94` einen stillen
Re-Login mit vollem Seitenwechsel aus — mitten in der Bearbeitung.

### 5.5 Was gezählt und gezeigt wird

Vier Zahlen, die sich auf **232** summieren, ohne jedes Journal:

- **Gefestigt** — `stufe >= 3 AND faellig_am > heute`
- **In Arbeit** — `stufe BETWEEN 1 AND 2`
- **Heute fällig** — `faellig_am <= heute`
- **Noch nie gefragt** — keine Zeile in `lernstand`

Bei gewähltem Lernset summieren sie sich auf dessen auflösbare Größe, und die Fläche sagt das
(„von 15 im Set").

**Kein Prozentbalken über allem** — er mischt „einmal geraten" mit „seit Monaten sicher" und steigt
auch, wenn nichts hängenbleibt. **Kein Antwort-Journal** — es beantwortet keine Frage, die die
Oberfläche stellt, und kostet dafür unbegrenztes Wachstum plus eine Datenschutzfrage („wer sieht, wie
oft ich danebenlag?").

Farben aus `_lib/lernfarben.ts` — einer modul-eigenen, fachsemantischen Palette nach Vorbild
`feedback/_lib/noten.ts` (ausgeschriebene Hex-Werte hell/dunkel, monoton fallende Luminanz, Vitest
CSS-gegen-TS). Suite-Rot ist ausgeschlossen (`colorError === colorPrimary === #c8000f`), und
Bedeutung nie allein über Farbe: **Wort zuerst** („Richtig" / „Nicht ganz"), **Zeichen zweitens**,
Farbe zuletzt.

Die Bewertung läuft in einer Server Action `beantworte(zeichenId, typ, gewaehlteId)`. Kein signiertes
Fragetoken: die Insel kennt die Optionen ohnehin, und wer sich selbst belügt, schadet nur sich. Die
Action ist die Wahrheit über den Fortschritt.

### 5.6 Der Hinweis, der nicht verhandelbar ist

Gemessen ist `review.domain.status` bei **544 von 544** Zeilen `"pending"` — kein einziges
`approved`. Die README des Quellprojekts hält fest, dass der AFKzV die vorläufige Anwendung der
Empfehlungen am 13./14.03.2025 aufgehoben hat und die Verbreitung ausgesetzt ist.

Auf `/lernen` **über** dem ersten Startknopf und auf der Modul-Startseite steht deshalb ein Kasten —
`Alert type="warning"`, **nie** `type="error"` (Falle 3):

> Die Bedeutungen in dieser App folgen einem Entwurf, dessen fachliche Prüfung noch läuft. Zum Üben
> der Systematik taugt er; für eine verbindliche Auskunft gilt die Dienstvorschrift deiner
> Organisation.

**Kein „geprüft"-Abzeichen an einzelnen Zeichen.** Das technische Review ist zu 532/544 `approved`,
das fachliche zu 544/544 `pending` — ein grünes Häkchen je Zeichen zeigte ausgerechnet das Review,
das über die *Bedeutung* nichts aussagt, und widerspräche dem Kasten darüber. Gezeigt wird nur die
**technische Abweichungsnotiz** bei den 12 betroffenen Zeichen, in einem Satz und ohne Dateinamen.

Der Wortlaut des Kastens ist Betreibersache (§9, E2). **Dass er dasteht, ist keine Option.**

---

## 6. Baukasten

### 6.1 Achsen und Schrittfolge

Gemessen tragen von 225.720 aufgezählten Kombinationen der fünf Hauptachsen **894 — 0,4 %** (M16).
Sechs unabhängige Auswahlfelder produzierten in 99,6 % der Fälle Unsinn. Der Baukasten **muss
sperren**, nicht hinterher meckern. Die Reihenfolge ist von den Daten erzwungen:

| # | Feld in der Oberfläche | Spec-Felder | Begründung |
|---|---|---|---|
| 1 | **Grundzeichenart** | `kind` (19) | entscheidet, welche Achsen überhaupt existieren. Kachelraster mit Miniatur; `circle-12` und `reduced-house` bekommen einen **Platzhalter**, sie komponieren nackt nicht |
| 2 | **Zugehörigkeit** | `organization` (9) **oder** `technicalFill` | **ein** Feld — sie schließen sich aus (`technical-fill-organization-conflict`) |
| 3 | **Kopfzone** | `strength` (4) **oder** `administrativeLevel` (6) **oder** `technicalHeadMark` (1) | **ein** Feld, drei Quellen. Als drei Felder erzeugte jeder zweite Klick `head-zone-conflict`. Stärke nur an `formation`/`person`; Verwaltungsstufe gemessen **nie allein** gültig — erscheint erst mit gewählter Funktion |
| 4 | **Funktion** | `functionRole` (25) | |
| 5 | **Unter dem Körper** | `vehicleCategory` (8) **oder** `designation` | **ein** Feld — beide belegen denselben Streifen (`chassis-foot-conflict`). Kategorie nur an `vehicle-land`/`trailer`/`swap-loader-vehicle`; `amphibienfahrzeug` wirft `NotMeasuredError` (M10) |
| 6 | **Körperform** | `bodyVariant` (10) | nur wo vermessen. **Für `bodyVariant` gibt es im Paket keine Bezeichnungstabelle** (gemessen: 0 Exporte). Das Modul benennt die zehn selbst in `_lib/bezeichnungen.ts` — eine englische ID in deutscher Oberfläche ist keine Option |
| 7 | **Fähigkeit** | `capabilities` (88) | **Einfachauswahl.** Gemessen landen mehrere in derselben festen Box 4/8/24/16 mm und überlagern sich, und die Array-Reihenfolge ändert das Bild. Eine Mehrfachauswahl baut unleserliche Zeichen, die **kein Gate ablehnt** |
| 8 | **Körpermarken** | `bodyMarks` (132) | Mehrfach erlaubt — gemessen frei mit Fähigkeiten kombinierbar |
| 9 | **Beschriftung** | `labels.center/.bottomLeft/.bottomCenter/.bottomRight/.topLeft` + `designation` | **fünf** Textfelder |

**Die elf Metrikfelder in `BodyLabels`** erscheinen **nicht** in der Oberfläche — das sind
Quellenvermessungen, kein Nutzerregler. Stammt die Spec aus einem Rezept, werden sie unverändert
**durchgereicht**; ein Verwerfen änderte das Bild.

### 6.2 Vorschau und Wertesperrung

Vollständig im Browser, in der `ssr:false`-Insel:

```ts
export function baue(spec, groessePx, idPrefix):
  | { ok: true; svg: string; bedeutung: string }
  | { ok: false; art: "regel"; verstoesse: readonly ValidationIssue[] }
  | { ok: false; art: "unvermessen"; bereich: "value" | "combination" };
// CompositionError -> regel · NotMeasuredError/BodyNotMeasuredError -> unvermessen
// alles andere (nacktes Error) -> weiterwerfen, Programmfehler
```

`instanceof` genügt (M10) — die Wortlautprüfung `/vermessen|nicht belegt/` aus dem Referenz-Builder
ist gegen 1.0.2 geschrieben und in 1.1.0 überflüssig.

**`validateSpec` wird nicht benutzt.** Gemessen hat es falsch-negative Befunde (unbekannte IDs und
Vermessungslücken passieren es) **und** falsch-positive (ohne `ValidationContext` lehnt es alle 25
Funktionsrollen ab: 0 gültige Paare statt 8). Zwei Prüfwege, die sich widersprechen, sind unwartbar.

`erlaubteWerte(spec, feld, kandidaten)` probiert jeden Kandidaten einmal durch `baue`. Gemessen:
247 Kandidaten über elf Felder in 9,7 ms kalt / 3,4 ms warm. Der gerade gesetzte Wert wird **nie**
gesperrt. Zwei Sperrarten über `NotMeasuredError.scope`: `"value"` → überall unmöglich, dauerhaft
ausgegraut; `"combination"`/`CompositionError` → passt hier nicht, mit Grund am Feld.

**Warum im Browser und nicht per Server Action:** 247 Kandidaten je Tastendruck über die Leitung
wären ein Roundtrip pro Zeichen — und liefen zusätzlich in Falle 10.

Zustand in der URL als `?s=<base64url>` — base64url über UTF-8, weil `btoa` nur Latin-1 kann und
`designation` Umlaute trägt.

### 6.3 Regelverstöße

Die Sperrung ist der Hauptweg. Bleibt ein Befund, wird **`error.issues`** gerendert (nicht
`error.message` — die ist fürs Log), als Liste **am betroffenen Feld**, **nicht rot** (Falle 3):
Text mit 3 px linker Kante in `--tz-hinweis`.

`_lib/regeltexte.ts` führt **~15** Einträge, nicht 78: die Wertesperrung fängt fast alle
Kombinationsregeln vorher ab; übrig bleiben die, die sie strukturell nicht abfangen kann, weil der
Text frei ist:

```
label-too-wide · label-unknown-glyph · designation-too-wide · designation-unknown-glyph
function-role-run-too-wide · function-role-run-unknown-glyph · head-zone-conflict
technical-fill-organization-conflict · chassis-foot-conflict · body-variant-foot-conflict
surface-label-foot-conflict · strength-requires-unit · administrative-level-not-measured
foot-band-head-requires-measured-strength · plain-wheel-pair-chassis-conflict
```

Plus ein **Rückfall**: unbekannte Regel-ID → generischer Satz mit der rohen ID in Klammern.

**Warum nicht die 835-Zeilen-Tabelle aus `packages/website` kopieren:** sie ist MIT-lizenziert und
erlaubt, aber es wären 78 Texte, die niemand gegen ein Upgrade prüft und die still veralten. Der Test
prüft in die **Gegenrichtung**: jede ID in der eigenen Tabelle muss in `VALIDATION_RULE_IDS`
(gemessen 72) **oder** in der Liste der sechs `assertTextRunsFit`-IDs vorkommen — `compose()` kann
gemessen 78 werfen, nicht 72.

Die Paketmeldungen werden nicht roh gezeigt: „Die Verwaltungsstufe ‚kreis' besitzt keinen aufgelösten
gemessenen Kopf aus D.3/D.4" sagt einem Anwender nichts, und vier Meldungen sind englisch. Der eigene
Text kommt zuerst, die Paketmeldung darunter klein.

### 6.4 Export

- **SVG (Standardweg):** `new Blob([svg], { type: "image/svg+xml" })` → `<a download>`. Verlustfrei,
  keine Schriftabhängigkeit im Moment des Exports.
- **PNG (zweite Taste):** `rasterDimensionsForWidth` → Canvas → `renderCanvas(drawing, ctx, {size})`
  → `toBlob`. Drei Fallstricke, alle behandelt: (a) `renderCanvas` malt **keinen Hintergrund** →
  Umschalter „weißer Hintergrund", voreingestellt an, sonst landet ein schwarzes Zeichen in einer
  dunklen Präsentation; (b) **`await document.fonts.load("16px Arimo")` vor dem Zeichnen** — sonst
  rastert der erste Export mit der Ersatzschrift und der zweite mit Arimo, ein stiller, nicht
  reproduzierbarer Unterschied; (c) `renderCanvas` kann werfen → try/catch mit Anwendermeldung.
- **Spec als JSON (dritte Taste)** — damit ein Zeichen den Weg zurück in den Baukasten findet.

**Kein serverseitiger PNG-Export.** Er bräuchte `@resvg/resvg-js` plus die TTF *zur Laufzeit* — eine
native Abhängigkeit und ein `fs`-Lesepfad. Gemessen macht `renderSvg` über 242 Aufrufe **null**
`fs`-Zugriffe; dieser Zustand hält das Dreieck bei drei Ecken.

### 6.5 Die Bauübung

Ein Knopf **im Baukasten**, nicht im Quiz: „Übungsaufgabe". Er zieht ein Zeichen aus den 232 (oder
aus dem zuletzt auf `/lernen` gewählten Lernset, wenn eines gesetzt war), zeigt **nur** dessen
`bedeutung` und setzt die Achsen zurück. Wer fertig ist, drückt „Prüfen".

Bewertet wird über `kanonischerSchluessel` (§3.6), nicht über das Bild und nicht über
`matchFingerprint` (M15). Die Rückmeldung nennt die **Felddifferenz**: „Körper und Organisation
stimmen. Es fehlt die Fähigkeit *Sanitätsdienst*." Danach steht das Zielzeichen daneben.

**Die Übung schreibt keinen Lernstand** und keine Zeile in irgendeine Tabelle. Sie ist ein Werkzeug,
kein Prüfungsteil — deshalb braucht sie weder Server Action noch Fragetoken noch eine dritte Insel.
Der Katalog-Code liegt an dieser Stelle ohnehin schon im Browser.

### 6.6 Speichern

Server Action `speichereEigenesZeichen` in `src/app/m/zeichen/actions.ts` (`"use server"`):
`sub` prüfen → **Formprüfung** der Spec (JSON parsebar, alle Feldnamen aus `ORDNUNG`, alle Werte
Strings/Arrays) und des SVG (§4.3) → `kanonischerSchluessel` → schreiben →
`revalidatePath("/m/zeichen", "layout")`. Rückgabe als `FormState`
(`{ok:true} | {ok:false, fieldErrors, values}`); Zugriffsverletzungen **werfen**.

⚠️ Eine *fachliche* Nachprüfung bräuchte `composeFromCatalog` — und das zöge den Katalog in den
Server-Graph (M1). Die Action prüft deshalb nur die Form und speichert das von der Insel gelieferte
SVG. Ein manipuliertes Spec-JSON schädigt nur die eigene Zeichenliste, und das Markup wird nie als
HTML ausgeführt (§4.3).

**Zwei Konfliktfälle, beide mit Rückfrage statt Entscheidung:**

- Gleicher **Name** (`uniqueIndex`): „Unter diesem Namen hast du schon ein Zeichen. Überschreiben
  oder anders benennen?"
- Gleiche **Zusammenstellung** (nicht-eindeutiger Index): „Diese Zusammenstellung hast du schon als
  ‚Zugtrupp Nord' gespeichert — trotzdem zusätzlich sichern?" Bestätigt der Nutzer, entsteht eine
  zweite Zeile. Nichts wird still überschrieben.

Kein `Form`/`Form.Item` (Compound + RSC-verboten), sondern `useActionState` mit nativem
`<label htmlFor>`, `status={err ? "error" : undefined}`, `aria-invalid`, Fehlertext gedämpft statt rot.

---

## 7. Offline

### 7.1 Voraussetzung: ein eigener Produktions-Host

**`SUITE_HOST_ZEICHEN` ist Auslieferungsvoraussetzung, nicht Option** (Betreiberentscheidung
2026-09-02; Vorschlag `zeichen.iuk-ue.de`). Ohne ihn findet `moduleForHost` in Produktion kein Modul
(`registry.ts:257-264`), `decideRoute` fällt aufs Portal zurück, `/sw.js` rewritet nach
`/m/portal/sw.js` → 404, und die Registrierung scheitert mit **einer Konsolenzeile**. `/manifest.
webmanifest`, `/pwa-icon.svg` und `/offline` sind ebenfalls Portal-Pfade und 404. Die Release-Notiz
verspräche dann „Der Katalog steht auch ohne Verbindung bereit", und niemand merkte, dass er es
nicht tut, bis jemand ohne Netz danebensteht.

**Deshalb ein Boot-Riegel** — `_lib/boot.ts` mit `zeichenBootFehler()`, eingehängt in
`assertHostConfig` (`core/bootstrap.ts`), nach dem Muster von `uav`s `UAV_SW_MODUS`: er wird laut,
wenn `NODE_ENV === "production"` und `SUITE_HOST_ZEICHEN` fehlt. Er **wirft nie** selbst (ein Wurf
nähme den ganzen Prozess mit, samt aller anderen Module), sondern liefert seine Meldung an die
Sammelstelle, wie `lagerbuchBootFehler` und `radioBootFehler` es tun.

Der Preis ist eine Zeile in `bootstrap.test.ts` (`toBe(4)` → `toBe(5)`) — und der ist es wert: die
Alternative ist ein stiller Ausfall genau des Features, für das ein halber Commit gebaut wurde.

### 7.2 Der gemessene Knoten

Siehe M17. Die drei tragenden Punkte: eine auth-pflichtige Route antwortet ohne Sitzung mit
`307 → /login`, `fetch` folgt dem Redirect und liefert `ok: true`, und jede Seite unter `SuiteRahmen`
trägt den Klarnamen im Flight-Payload.

### 7.3 Die Bauform

**Genau eine gecachte Navigationsroute: `/offline`** (der externe Pfad auf dem Modul-Host — das ist
zugleich der Cache-Schlüssel; der interne `/m/zeichen/offline` kommt in `sw-quelle.ts` nirgends vor).
Rahmenlos, ohne `<Shell>`, ohne `auth()`-Aufruf, der einen Namen liest. Vorbild `uav /`: gemessen
45.944 B, mit **und** ohne Sitzung byteidentisch, 0× `userName`.

**Manifest und Navigations-Rückfall zeigen beide auf `/offline`:**

```jsonc
// manifest.webmanifest/route.ts
{ "start_url": "/offline", "scope": "/", … }
```

```js
const NAV_FALLBACK = "/offline";
const SHELL_ROUTES = [NAV_FALLBACK];
```

> Beide bestehenden Manifeste der Suite setzen `start_url: "/"` (`qr/manifest.webmanifest/route.ts:19`,
> `uav` ebenso), und `qr`s Worker führt `NAV_FALLBACK = "/"`. Hier wäre `/` die RSC-Startseite unter
> `SuiteRahmen` — die ausdrücklich **nicht** im Cache liegt. Die installierte PWA landete offline auf
> Chromiums Netzwerkfehlerseite: `caches.match("/")` leer, `caches.match(NAV_FALLBACK)` ebenfalls
> leer, `respondWith` löst auf `undefined` auf. Dasselbe für jeden Lesezeichen-Aufruf auf `/katalog`.
> Deshalb ist der Rückfall hier **jede** nicht gecachte Navigation innerhalb des Scopes → `/offline`.
> Die Adresszeile steht dann auf `/katalog`, während `/offline` gerendert wird — sie lügt, und das
> ist der bewusst gewählte kleinere Schaden gegenüber einer Fehlerseite. `qr` hat dieselbe Lehre in
> `sw-source.ts:27-33` schon bezahlt.

**Das Datenpaket ist der JS-Chunk der Insel.** Das Generat (32 KB gzip inkl. aller 246 Bilder) landet
unter `/_next/static/chunks/…` — und `/_next` steht in `PASSTHROUGH` (`routing.ts:12`), ist also
**ohne Sitzung abrufbar** und kann nie durch Login-HTML ersetzt werden. Der Worker holt es über
`cacheReferencedAssets` aus dem HTML, wie `qr` es tut. Es braucht **keine** separate Datendatei,
keinen Route Handler für Katalogdaten und keinen Durchlass für Daten. Eine Datei unter
`public/m/zeichen/` liefe dagegen durch `decideRoute` und wäre gegatet.

**Cache-Inhalt, vollständig:** `/offline` (HTML) · alle `/_next/static/*` daraus (Allowlist
`isCacheableAsset`, **nie** Denylist — eine Denylist ließ `"/?_rsc=<hash>"` durch, die RSC-Antwort
einer Soft-Navigation mit denselben personalisierten Daten) · `/manifest.webmanifest` ·
`/pwa-icon.svg` · Arimo (kommt über `/_next/static/media/` mit).
**Nicht gecacht:** `/katalog`, `/katalog/[id]`, `/merkliste`, `/meine`, `/lernen`, `/baukasten`,
`/verwaltung/**`, jedes `/api/`.

**Die Riegel, die der Worker gegenüber `qr`/`uav` mehr hat** — `_lib/sw-quelle.ts`:

```js
async function holeGeprueft(pfad) {                    // für HTML UND für Assets
  const res = await fetch(pfad);                        // MIT Cookies: /offline ist auth-pflichtig
  if (!res.ok) return releaseBody(res);
  if (res.redirected) return releaseBody(res);          // ← der gemessene 307→/login kommt als 200 an
  if (new URL(res.url).pathname !== pfad) return releaseBody(res);
  return res;
}

async function cacheShellRoute(pfad, cache) {
  const res = await holeGeprueft(pfad); if (!res) return;
  const text = await res.text();
  if (text.includes('"userName"') || text.includes('"angemeldet"')) return;   // Inhaltsriegel
  const assets = referenzierteAssets(text).filter(isCacheableAsset);
  await Promise.all(assets.map(a => cacheAsset(a, cache)));                   // ZUERST die Bündel
  await cache.put(pfad, new Response(text, { status: 200, headers: res.headers }));
}
```

Drei Dinge daran sind gemessen begründet:

- **Der `redirected`-Riegel gilt auch für Assets.** `/manifest.webmanifest` und `/pwa-icon.svg` liefen
  in `qr`/`uav` cache-first ohne ihn; hier brennte sich sonst Login-HTML dauerhaft als Manifest ein.
- **Die Bündel werden vor dem HTML abgelegt.** Umgekehrt hinterließe ein Deploy am Netzrand ein
  gecachtes HTML, dessen Chunk-Hashes es nicht mehr gibt — offline kaputt, ohne Fehlermeldung.
- **`releaseBody` (`res.body.cancel()`) ist Pflicht:** gemessen kam nach drei liegengelassenen
  404-Antworten kein weiterer `fetch` des Workers mehr zurück, der Worker blieb dauerhaft
  „installing", `navigator.serviceWorker.ready` löste nie auf — gar keine PWA, ohne Fehlermeldung.
  Und 404 ist ein **vorgesehener** Fall.

**Der Navigationszweig ist network-first mit Redirect-Riegel:** landet die Antwort auf `/login` (mit
Netz, aber abgelaufener Sitzung), wird **nicht** weitergeleitet, sondern die gecachte `/offline`
ausgeliefert — mit einem Streifen „Du bist abgemeldet. Zum Merken und Üben bitte neu anmelden." Ohne
diesen Riegel verlöre jemand mit schwacher Verbindung den vollständig vorhandenen Katalog an eine
Anmeldemaske.

Cache-Name `zeichen-pwa-v1`; `activate` löscht jeden anderen Namen — der einzige nachträgliche Hebel
gegen Altbestand, und er wirkt erst, wenn `sw.js` sich **byteweise** ändert.
`refreshShellIfStale()` an jeder Navigation mit `SHELL_MAX_AGE_MS = 5 * 60 * 1000`,
`lastShellRefresh` **vor** den Abrufen gesetzt.

**Manifest von Hand statt `metadata.manifest`** — im Modul-`layout.tsx`:

```tsx
<link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
```

Ohne das Attribut holt der Browser das Manifest **ohne Cookies** und bekommt Login-HTML. Das Attribut
kommt im ganzen Repo bisher nicht vor (`grep -rn "crossorigin\|crossOrigin" src/` → leer).

**Kein Durchlass in `core/routing.ts` — als Vorgabe.** Der `/sw.js`-Abruf von
`navigator.serviceWorker.register()` ist same-origin und sendet nach Spezifikation Cookies mit; eine
Sitzung besteht, weil man sonst gar nicht auf der Seite wäre. **Das ist nicht gemessen** (M-A). Die
Messung steht als Vorbedingung vor Commit 9 (§9). Fällt sie negativ aus, braucht es einen host- **und**
pfadgebundenen `rewrite` **innerhalb** des Host-Zweigs, **nicht** in `PASSTHROUGH` — dort gemessen
kaputt (`e2e/radio-hosts.spec.ts:260-265`). Das wäre eine core-Änderung ohne zweiten Nutznießer und
damit eine erneute Betreiberentscheidung.

### 7.4 Was offline geht — und was nicht

| Fläche | Offline |
|---|---|
| Alle 246 Zeichen nachschlagen und durchsuchen | **ja** |
| Merkliste ansehen | **ja** (§7.5) |
| Merkliste ändern, Baukasten, Üben, eigene Zeichen | **nein** |

Das steht als **erster Satz** auf `/offline`, nicht als Fußnote: „Offline kannst du alle Zeichen
nachschlagen, durchsuchen und deine Merkliste ansehen. Ändern, Bauen und Üben brauchen eine
Verbindung." Ein Knopf, der offline in einen Fehler läuft, kostet an der Einsatzstelle genau die
Zeit, um die es geht.

`/offline` zeigt außerdem **den Stand der Sammlung** aus `KATALOG_STAND` in einem Satz: „246 Zeichen,
Stand `<erzeugtAm>`." Ohne diese Zeile kann niemand beurteilen, ob das, was er offline sieht, aktuell
ist — und der Cache kann beliebig alt sein.

### 7.5 Die Merkliste offline — und was das kostet

**Betreiberentscheidung 2026-09-02: ja, mit sichtbarem Hinweis.**

Umsetzung: die Merkliste wird **nicht** über den HTTP-Cache getragen (dort läge personenbezogenes
HTML, und der Inhaltsriegel aus §7.3 lehnte es zu Recht ab), sondern von der Insel bei jedem
Online-Aufruf in **IndexedDB** geschrieben (`zeichen-merkliste`, ein Objekt: Liste von
`{ id, titelSchnappschuss }`). Offline liest sie von dort. Geschrieben wird nur online, über die
bestehende Server Action.

Auf `/offline` steht dazu, unmittelbar bei der Liste und nicht in einer Fußzeile:

> Deine Merkliste ist auf diesem Gerät gespeichert, damit sie ohne Verbindung da ist. Auf einem
> geteilten Gerät sieht sie auch, wer sich nach dir anmeldet. **[Von diesem Gerät löschen]**

Der Knopf löscht IndexedDB und den Cache, sofort und ohne Rückfrage-Dialog.

**Was diese Entscheidung aufgibt, ausgeschrieben:** Offline gibt es keine Authentifizierung — das
Sitzungscookie ist `HttpOnly` und für Seite wie Worker unsichtbar, und IndexedDB überlebt den Logout
genauso wie der Cache. Die Zusage „auf dem Gerät liegt nichts Personenbezogenes" war mit einem
Unit-Test gegen den Worker-Quelltext haltbar; sie ist es jetzt **nicht mehr**. An ihre Stelle treten
drei Dinge, von denen nur das erste eine Maschinenprüfung ist:

1. Der **Inhaltsriegel** bleibt und gilt weiter für den HTTP-Cache: dort landet nach wie vor kein
   HTML mit `"userName"`. Der Test dazu bleibt scharf.
2. Der **Logout-Haken** wird von Vorsorge zur tragenden Maßnahme: der Worker fängt
   `POST /api/auth/signout` (next-auth sendet genau das,
   `node_modules/next-auth/react.js:191`) und löscht Cache **und** IndexedDB. Er deckt den
   geordneten Fall ab — und ausdrücklich **nicht** Ablauf, Widerruf, Gruppenentzug oder ein
   weggelegtes Gerät.
3. Der **Hinweis samt Löschknopf**. Er ist kein Riegel, er ist eine Aussage.

Diese Aufgabe der Zusage gehört in den Commit-Text von Commit 9 und in die Release-Notiz.

---

## 8. Tests

### 8.1 Gates, die von selbst rot werden

| Test | Wann |
|---|---|
| `src/core/bootstrap.test.ts:151` | `_db/` existiert ohne `MODULE_MIGRATIONS`-Eintrag |
| `:159` | Migrationsordner ohne `meta/_journal.json` — ein `.gitkeep` genügt nicht |
| `:166` | fehlende/vertippte COPY-**Ziel**zeile im Dockerfile |
| `:718` | **von Hand** auf 5 anzuheben — der neue `zeichenBootFehler` (§7.1) |
| `scripts/seed-lokal.test.ts:38` | `MODULE_MIGRATIONS`-Eintrag ohne `SEED_MODULE`-Zeile (exakter Mengenvergleich) |
| `src/core/shell/AppUmschalter.test.tsx:227/:237` | Registry-`icon` fehlt in `ICONS` / verwaister Eintrag |
| `src/core/shell/icons.test.ts:147` | bedingt: eine Nicht-Test-Datei importiert `@ant-design/icons` ohne `"use client"` |
| `register.test.ts` | erst *sobald* eine Notizdatei unter `notizen/zeichen/` liegt und die Registerzeile fehlt |

**Von Hand zu erweitern, sonst nie geprüft:** `core/shell/navIkonen.test.tsx:21` —
`...ZEICHEN_NAV` in `GESETZTE_NAVS`. `proxy.test.ts` und `registry.test.ts` sind nicht betroffen.

### 8.2 Modul-eigene Tests

| Datei | Testnamen |
|---|---|
| `_lib/katalog.test.ts` | „das Generat entspricht dem installierten Paket" (regeneriert, 42 ms, byteweiser Vergleich) · „der Bestand ist 246 Zeichen" · „die Datenversion ist 0.2.0" · „jede Anker-ID ist auflösbar" · „jede SVG-ID im Dokument ist eindeutig" (M11, reine Stringarbeit) · „findeZeichen liefert null statt zu werfen" · „keine Bedeutung enthält das Wort undefined" (M9) · „genau drei Titel sind mehrdeutig und alle sechs IDs sind markiert" (M7) · „KATALOG_STAND trägt Paket-, Datenversion und Erzeugungstag" |
| `_lib/naht.test.ts` | „@einsatzzeichen wird nur in den zwei erlaubten Dateien importiert" — Quelltext-Scan über **`src/` UND `scripts/`** (der Generator liegt außerhalb von `src/`; ein Scan nur über `src/` sähe eine der beiden Ausnahmen gar nicht), vier Importformen (`from`, `import`, `import()`, `require`), Vorbild `icons.test.ts:147`. Ausnahmenliste als **benannte Konstante** mit `expect(AUSNAHMEN.length).toBe(2)`. **Reine Typimporte (`import type`) zählen nicht** — sie verschwinden im Build und kommen in mehr als zwei Dateien vor · „der Baukasten-Lader lädt mit ssr:false" |
| `_lib/falte.test.ts` | „loeschgruppe findet Löschgruppe" · „sanitaet findet Sanität" (M12) |
| `_lib/kanon.test.ts` | „232 Rezepte ergeben 232 verschiedene Schlüssel" · „leeres Array ist gleich weggelassen" · „die Reihenfolge in capabilities ist egal" · „die Spec, die matchFingerprint fälschlich durchwinkt, wird hier abgelehnt" (M15) · **„ORDNUNG deckt jedes in den Rezepten vorkommende Spec-Feld ab"** (§3.1 Punkt 13) |
| `_lib/lernen/fragen.test.ts` | „zwei verschiedene Fragen bekommen verschiedene Distraktoren" (**mindestens zwei Fragen** — mit einer bewiese der Test nichts; Regel ausgeschrieben in `RoutinenTabelle.test.tsx:7-15`) · „kein Distraktor trägt denselben Antworttext wie das Ziel" · „bedeutung_zeichen überspringt die sechs mehrdeutigen Zeichen" · „die richtige Antwort steht über 200 Ziehungen gleichverteilt" · „derselbe Seed ergibt dieselben Optionen" · **„ein Lernset schränkt den Bestand ein, nicht die Distraktoren"** |
| `_lib/lernen/leitner.test.ts` | „richtig hebt um eine Stufe, höchstens auf vier" · „falsch setzt auf null und macht heute fällig" · „heute kommt als Parameter herein" |
| `_lib/regeltexte.test.ts` | „jede eigene Regel-ID existiert im Paket" (72 + 6) · „eine unbekannte Regel-ID bekommt einen Rückfalltext" |
| `_lib/sw-quelle.test.ts` | „cacht keine weitergeleitete Antwort" (Netzattrappe liefert `{ok:true, redirected:true, url:'…/login'}` — **ohne diesen Fall sieht der Test die gefährlichste Lage nicht**) · „cacht auch kein weitergeleitetes Manifest" · „cacht kein HTML mit userName" · „legt die Bündel vor dem HTML ab" · „gibt jeden gelesenen Body frei" (Spy auf `body.cancel`) · „beantwortet ?_rsc-Anfragen nicht" · „liefert bei Login-Redirect die gecachte Offline-Fläche" · „jede nicht gecachte Navigation fällt auf /offline zurück" · „löscht Cache und IndexedDB bei POST /api/auth/signout" |
| `_lib/lernfarben.test.ts` | „CSS-Variablen und TS-Werte stimmen überein, hell und dunkel" (Vorbild `feedback/_lib/noten.test.ts`) |
| `_db/migrations.test.ts` | Dreieck-Prüfungen · Tabellenexistenz · **„Zeitstempel stehen in Sekunden, nicht Millisekunden"** am Rohwert (über die Drizzle-Schicht unsichtbar, `aufgaben/_db/migrations.test.ts:73-80`) · „derselbe kanonische Schlüssel darf zweimal gespeichert werden, derselbe Name nicht" |
| `_db/testdb.ts` | `:memory:` + `pragma("foreign_keys = ON")` + `migrate(...)`, Vorbild `aufgaben/_db/testdb.ts:29-39` |
| `_ui/*.test.tsx` | über `src/app/m/qr/_lib/test-dom.tsx` — `mount`/`fill`/`click`/`submitForm`, für Dropdown-/Modalinhalte des Baukastens zwingend `queryPortal`. **Kein zweites Harness.** Zeile 1 `// @vitest-environment jsdom`, `afterEach(async () => { await unmount(); })` |
| `registry.test.ts` | „requiresAuth ist true" · „requiredGroups ist leer" · „switcherGroupSources ist leer" · „das Icon steht in ICONS" |

### 8.3 e2e — `e2e/zeichen.spec.ts`

- Login über `devLogin(page, { host: "zeichen.localtest.me" })`, Rollenwechsel über
  `wechsleAnmeldung`, **nie** blankes `clearCookies()`.
- **Jeder navigierende Klick über `klickeWennRuhig`** — gemessener Anlass auf `main` (Lauf
  31951787232): Playwright meldete den Klick als gelungen, der Knoten war ein echter `<a href>`, und
  im Netzwerkteil stand kein Aufruf, weil die Seite zwischen `mousedown` und `mouseup` um ~240 px
  sprang.
- **Der wichtigste einzelne Fall:** „die Detailseite liefert SVG aus dem Server" — ein Abruf von
  `/m/zeichen/katalog/[id]` und `expect(html).toContain("<svg")`. Das ist das **einzige** Tor, das
  einen RSC-Bruch nach einem Paketupgrade sähe; Vitest kann diese Klasse strukturell nicht sehen.
- Für jeden POST-Pfad ein **Warmlauf-GET** vor dem ersten echten POST und `page.waitForResponse`
  statt Warten auf eine spätere Zustandsänderung (Falle 10).
- `playwright.config.ts`: `&& pnpm exec tsx scripts/seed-lokal.ts zeichen` in die webServer-Kette.

`e2e/zeichen-pwa.spec.ts` läuft unter `playwright.pwa.config.ts` (Prod-Build, voller Chromium-Kanal).
**Die Datei muss dort ausdrücklich eingetragen und aus `playwright.config.ts` per `testIgnore`
ausgeschlossen werden** — `playwright.config.ts:16` schließt heute nur die bestehenden PWA-Fälle aus;
ohne beide Änderungen läuft der Test entweder gar nicht oder im falschen Profil. Inhalt: nach
`devLogin` Cache-Inspektion auf `"userName"` und auf einen `"LOGIN"`-Marker, danach `setOffline(true)`,
`page.goto("/")` (der `start_url`-Fall!) und eine **echte Interaktion** — Suche eingeben, Treffer
sehen. „Seite lädt offline" ist als Zusage wertlos, unter `next dev` variieren die Chunk-URLs pro
Request.

### 8.4 Was strukturell NICHT testbar ist

1. **Ein RSC-Bruch nach einem Paketupgrade** — `typecheck`, `lint` und Vitest sehen ihn nicht. Nur
   der e2e-Abruf aus 8.3. (Der Build sieht ihn, aber erst spät.)
2. **Arimo** — jsdom rechnet keine Glyphen, `build` sieht nur den String. Sichtbar erst bei den 66 %
   der Zeichen mit Text, im Browser.
3. **Ob die CSS-Regel auf `svg text` das Präsentationsattribut schlägt** — argumentativ sicher, nicht
   gemessen (§9, H2).
4. **`idPrefix`-Kollisionen im Browser** — der Test prüft die Eindeutigkeit der Strings; ob ein
   Bildschirmleser den falschen Namen liest, sieht nur ein Mensch mit einem Bildschirmleser.
5. **Zeilenhöhen und CSS-Spezifität** (Fallen 5/8) — antd spritzt die Regeln zur Laufzeit über
   cssinjs ein, sie stehen in keiner Datei des Repos.
6. **Der Offline-Datenschutz in Produktion.** `pnpm e2e:pwa` läuft in **keiner CI**
   (`.github/workflows/ci.yml:148` fährt nur `pnpm e2e`). Der belastbare Teil sitzt im
   Vitest-Fake-Worker; der Browser-Beweis ist ein Handlauf. **Das ist eine Schwäche des Entwurfs,
   keine Eigenschaft** — und sie wiegt seit der Merkliste-Entscheidung (§7.5) schwerer als zuvor.
7. **Ob Nexts File-Tracing im pnpm-Layout dieselben Assets zieht** — alle Standalone-Messungen liefen
   im npm-Layout. Mit `next/font/local` ist die Frage entschärft (Arimo liegt unter `src/`), aber ein
   `docker build` vor dem Merge bleibt Pflicht (§9, H1).

---

## 9. Offene Punkte, Vorbedingungen und Handläufe

**Vorbedingung vor Commit 9:**

- **M-A — Sendet Chrome beim `/sw.js`-Abruf das Sitzungscookie?** Rund 20 Minuten mit
  `playwright.pwa.config.ts` und echtem Chromium. Positiv → §7.3 trägt unverändert. Negativ → der
  core-Durchlass wird zur erneuten Betreiberentscheidung, und Commit 9 wartet.

**Betreiberentscheidungen, noch offen:**

- **E1 — Wie heißt die Admin-Gruppe in Pocket ID?** `iuk-zeichen-admin` ist ein Vorschlag nach dem
  Muster `iuk-qr-admin`/`iuk-files-admin`/`iuk-radio-admin`. Verbindlich wird
  `SUITE_ADMIN_GROUP_ZEICHEN`; die Registry trägt nur den Rückfall. Die Gruppe muss existieren,
  bevor jemand Lernsets pflegen soll.
- **E2 — Der Wortlaut des fachlichen Vorbehalts** (§5.6). Der Vorschlag steht dort. Dass der Kasten
  dasteht, ist keine Option; wie er formuliert ist, schon.
- **E3 — Der Prod-Host.** `zeichen.iuk-ue.de` ist der Vorschlag. Nach dem Aufsetzen einmal von der
  neuen Domain aus anmelden — die Variable ist zugleich die Login-Allowlist, und ein `curl` sieht
  das nicht.
- **E4 — Sollen die eigenständigen Piktogramme als zweite Katalogebene erscheinen?** In v1
  weggelassen: gemessen 177 standalone, +18.672 B gzip, keine `SymbolSpec`, kein Bedeutungssatz, und
  die Projekt-Website führt sie nicht als Symbolseiten. Als „Bausteine" mit eigenem Filterwert wäre
  es die naheliegende erste Erweiterung.
- **E5 — Aufräumweg für Zeilen gelöschter Pocket-ID-Konten.** Heute hat kein Modul der Suite einen;
  Waisenzeilen bleiben stehen. Für v1 bleibt es dabei — ein selbstgebauter Löschpfad wäre die erste
  Stelle in der Suite, die Nutzerdaten von sich aus entfernt, und das ist keine Modulentscheidung.
- **E6 — Upstream in `einsatzzeichen`: `sideEffects: false` und eine `exports`-Map mit Subpfaden.**
  Kein Vorbedingung — das Generat umgeht den Katalog-Code für Katalog, Suche, Lernen und Offline
  vollständig; nur der Baukasten zahlt die 133 KB. Aber eine lohnende eigene Aufgabe im
  Schwesterrepo: gemessen sind 258.874 B minifiziert allein `fingerprints.json`, ein Audit-Artefakt,
  das dieses Modul nie anfasst. Schätzung nach der Änderung: 40–86 KB gzip.
- **E7 — Woher kommen umgangssprachliche Suchbegriffe langfristig?** v1 kommt ohne Synonymtabelle aus
  (M12: die Kürzel kommen über `describeSymbolSpec` gratis). Der richtige Ort ist upstream, wo
  `CatalogEntry.synonyms` und `legacyIds` bereits deklariert und leer sind — eine Modulliste liefe
  mit dem Paket auseinander.

**Handläufe vor dem Merge (zusammen unter einer Stunde, beide Fehlerbilder still):**

- **H1 — `docker build`, dann `find .next/standalone -name '*.ttf'`.** Ob Nexts File-Tracing im
  pnpm-Layout dieselben Assets zieht wie im gemessenen npm-Layout. Das Dockerfile trägt bereits
  einen Hinweis, dass pnpm-Symlinks und bare copy hier schon einmal Ärger gemacht haben.
- **H2 — Ein Blick in einen echten Browser** auf ein Zeichen mit langer Beschriftung (etwa
  „MLW IV Lbw"): greift die CSS-Regel auf `svg text` gegen das Präsentationsattribut, und steht
  Arimo?

---

## 10. Prüfliste — was anzufassen ist, in Reihenfolge

**Commit 1 — Registrierung** (nach dem Muster `b49a71e`/uav; zwei Tests dürfen rot bleiben und werden
im Commit-Text benannt):

1. `src/core/registry.ts` — die Zeile aus §2
2. `src/core/shell/icons.ts` — `DeploymentUnitOutlined` in **beide** Hälften (Import :1-14, Map :138-151)
3. `src/core/bootstrap.ts` — `{ key: "zeichen", migrationsFolder: "src/app/m/zeichen/_db/migrations" }`
   in `MODULE_MIGRATIONS`, mit ausgeschriebenem Grund für den Ausschluss aus `seedAllModules()`
   (die Demodaten schlüsseln auf `dev:<email>` und wären in einer Generalprobe wertlos; `shouldSeed()`
   ist bei `SUITE_SEED=1` auch dort wahr)
4. `Dockerfile` — nach Zeile 58, in Stage `runner`:
   `COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/zeichen/_db/migrations ./src/app/m/zeichen/_db/migrations`
5. `.env.example` — `# SUITE_ADMIN_GROUP_ZEICHEN=iuk-zeichen-admin` und **`SUITE_HOST_ZEICHEN=`
   mit Erklärung, dass er in Produktion Pflicht ist** (§7.1). **Auf keinen Fall eine leere
   `SUITE_ACCESS_GROUP_ZEICHEN=`-Zeile** — die meldet `validateGroupConfig` als Konfigurationsfehler
   und **bricht den Boot ab**
6. `src/app/m/zeichen/registry.test.ts`
7. `src/app/m/zeichen/_db/migrations/.gitkeep`

**Commit 2 — Abhängigkeit und Generat:**
`pnpm add @einsatzzeichen/catalog@^1.1.0 @einsatzzeichen/core@^1.1.0` (**nicht**
`@einsatzzeichen/react` — für diesen Entwurf wertlos und als Paket ohne `"use client"`, das in RSC
klaglos rendert, eine Einladung zum Fehlschluss; **nicht** `web-component` — Shadow DOM, gegen das
weder das antd-Theme noch die `--tz-*`-Variablen wirken) ·
`scripts/zeichen-generat.ts` · `_lib/katalog.generiert.json` · `_lib/katalog.ts` · `_lib/falte.ts` ·
`_lib/kanon.ts` · `_lib/bezeichnungen.ts` · `_lib/katalog.test.ts` · `_lib/naht.test.ts` ·
`_lib/kanon.test.ts` · `_lib/falte.test.ts` · `_fonts/arimo.ttf` + `Arimo-OFL.txt`

**Commit 3 — Datenhaltung:** `_db/schema.ts` · `_db/client.ts` · `_db/drizzle.config.ts` ·
`drizzle-kit generate` · `_db/testdb.ts` · `_db/migrations.test.ts`

**Commit 4 — Demodaten** (macht `seed-lokal.test.ts` grün): `_lib/seedLokal.ts` mit
`seedLokalZeichen(db): Promise<string[]>` — zwei kuratierte Lernsets („Grundzeichen und
Organisationen", 12 Einträge; „Rettungsdienst", 15), drei Merkzeilen und drei Lernstände für
`dev:demo@localtest.me`; idempotent **pro Zeile** (`onConflictDoNothing()`), rein additiv,
Protokollzeilen nennen Dev-Login-Adresse und Admin-Gruppe · Zeile in `scripts/seed-lokal.ts`
`SEED_MODULE` · `playwright.config.ts`

**Commit 5 — Hülle:** `layout.tsx` (Manifest-Link + Arimo-Klasse) · `(shell)/layout.tsx` ·
`(shell)/page.tsx` · `_lib/nav.ts` · `core/shell/types.ts` (+5) · `core/shell/navIkonen.tsx` (+5) ·
`core/shell/navIkonen.test.tsx:21`

**Commit 6 — Katalog** (+ Release-Notiz 1): `_ui/KatalogInsel.tsx` · `(shell)/katalog/page.tsx` ·
`(shell)/katalog/[id]/page.tsx` · `(shell)/merkliste/page.tsx` · `actions.ts` (Merken/Entfernen).
**Hier ist der erste echte Abruf gegen `next dev` fällig** — der einzige Weg, RSC-Fallen zu sehen.

**Commit 7 — Baukasten** (+ Release-Notiz 2): `_ui/baukasten/*` · `(shell)/baukasten/page.tsx` ·
`(shell)/meine/page.tsx` · `_lib/regeltexte.ts` + Test · die Bauübung aus §6.5

**Commit 8 — Lernen** (+ Release-Notiz 3): `_lib/lernen/*` · `(shell)/lernen/*` ·
`(shell)/verwaltung/lernsets/*` (inkl. Lernset-Auswahl auf `/lernen`) · `_lib/lernfarben.ts` + Test

**Commit 9 — Offline** (+ Release-Notiz 4), **erst nach M-A**: `_lib/boot.ts` +
`core/bootstrap.ts`-Einhängung + `bootstrap.test.ts:718` · `_lib/sw-quelle.ts` + Test ·
`sw.js/route.ts` · `manifest.webmanifest/route.ts` · `pwa-icon.svg/route.ts` · `RegisterSW.tsx` ·
`(rahmenlos)/layout.tsx` + `(rahmenlos)/offline/page.tsx` · IndexedDB-Merkliste + Hinweis + Löschknopf

**Commit 10:** `e2e/zeichen.spec.ts` · `e2e/zeichen-pwa.spec.ts` + Eintrag in
`playwright.pwa.config.ts` + `testIgnore` in `playwright.config.ts` · `pnpm e2e:pwa` von Hand ·
H1 und H2 von Hand

### Release Notes

**Vier Notizen**, je im selben Commit wie die Änderung, unter
`src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/` plus je eine Zeile in `register.ts`. Vier, weil
jede Notiz höchstens **einen** `hinweis` tragen darf und zwei Handlungsaufforderungen laut
`register.test.ts:113-118` zwei Notizen bedeuten.

1. `<datum>-taktische-zeichen-nachschlagen.ts` — „Taktische Zeichen nachschlagen und merken".
   Absatz 1: was neu ist. Absatz 2: was gleich bleibt. Absatz 3: die Suche kennt auch Kürzel wie SEG
   und RTW, aber nicht jedes umgangssprachliche Fahrzeug. Absatz 4: der fachliche Vorbehalt. Kein
   `hinweis`.
2. `<datum>-eigene-zeichen-bauen.ts` — „Eigene Zeichen zusammenstellen und herunterladen". Nennt die
   Übungsaufgabe. Kein `hinweis`.
3. `<datum>-zeichen-ueben.ts` — „Zeichen üben, bis sie sitzen". Trägt den Geltungsvorbehalt aus §5.6
   als `hinweis`.
4. `<datum>-zeichen-ohne-netz.ts` — „Der Katalog steht auch ohne Verbindung bereit". `hinweis`:
   „Öffne den Katalog einmal mit Netz, bevor du losfährst." Ein Absatz nennt die Randbedingung im
   uav-Stil (offline erst nach dem ersten Öffnen mit Netz; ein Gerät, das lange nicht online war,
   verlangt beim nächsten Netzkontakt eine Anmeldung). **Ein weiterer Absatz sagt, dass die
   Merkliste auf dem Gerät gespeichert wird und auf einem geteilten Gerät sichtbar bleibt** — das
   ist keine Handlungsaufforderung, sondern eine Tatsache, die niemand überrascht erfahren soll.

Du-Form, Präsens, aktiv; kein Markdown, kein Dateiname, kein Ticket, keine Werbewörter; drei bis fünf
Absätze; Titel als Aussage ohne Modulnamen. `datum` ist der Tag des **Rollouts**.

---

## Anhang — Betreiberentscheidungen, die diesen Entwurf geformt haben

| Datum | Frage | Entscheidung |
|---|---|---|
| 2026-09-02 | Umfang | Katalog, Baukasten und Lernen — alle drei in einem Rutsch |
| 2026-09-02 | Zugang | Alles hinter dem Login; `requiresAuth: true`, keine Zugangsgruppe |
| 2026-09-02 | Datenbank | Lernfortschritt, eigene Zeichen, Merkliste, kuratierte Lernsets |
| 2026-09-02 | Fragetypen | Zeichen→Bedeutung, Bedeutung→Zeichen, Bauaufgabe; kein Freitext |
| 2026-09-02 | Offline | Der Katalog muss ohne Netz verfügbar sein |
| 2026-09-02 | Lernsets | Filter auf `/lernen` ergänzen, statt sie zu streichen |
| 2026-09-02 | Bauaufgabe | Als freie Übung im Baukasten, nicht als Quiz-Fragetyp |
| 2026-09-02 | PWA | Eigener Prod-Host **und** M-A messen, bevor Commit 9 beginnt |
| 2026-09-02 | Merkliste offline | Ja, mit sichtbarem Hinweis und Löschknopf (§7.5) |
