# Modul `lagerbuch` — Implementierungsplan, Teil 4: Der Helfer-Weg

> **Für agentische Umsetzer:** PFLICHT-SUB-SKILL `superpowers:subagent-driven-development` (empfohlen)
> oder `superpowers:executing-plans`. Die Tasks sind auf parallele Ausführung geschnitten.
> **Innerhalb einer Wellenstufe dürfen alle genannten Tasks gleichzeitig laufen; über Stufengrenzen
> hinweg nicht.** Die Gates (§4) laufen am Ende **jeder Stufe**.
>
> Jeder Task ist TDD: erst der Test, dann der Code. **Ausgenommen sind die als „Abnahme" markierten
> Schritte** (T87): sie prüfen zusammengesetztes Verhalten, das zum Zeitpunkt ihrer Entstehung schon
> gebaut ist. Sie sind von Anfang an grün, und das ist **kein** Mangel; statt „Rot, weil …" nennen
> sie die **Mutation**, die sie fangen.

**Spec:** `docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md` (11.036 Zeilen, verbindlich).
Dieser Teil setzt **§7 vollständig** um (Spec-Zeilen 7498–9017, §7.1 bis §7.13).
**Faktenbasis:** `docs/lagerbuch-portierung-analyse.md`. **Querschnitt:** `docs/design/README.md`.
**Projektregeln:** `CLAUDE.md` (die sieben Fallen, `:9-46`). **Alt-Anwendung:** `../lagerbuch` @
`ca04eb1` (eingefroren). **Branch:** `feat/lagerbuch-modul` (aus Teil 1 fortgeführt).

**Ziel:** Der mobile Kernpfad des Moduls — das Gate auf der Modulwurzel, die Token-Einlösung über
`/t/<code>`, der Regaletikett-Deep-Link `/a/<artikelId>`, der Helfer-Zweig `/helfer` und
`/helfer/check`, die fünf PWA-Route-Handler und die vier Helfer-Actions. Dazu die `_ui/`-Bausteine
dieses Zweigs, **alle ohne Ant Design**.

**Architektur:** Der gesamte Helfer-Weg ist **öffentliche Ansichtsklasse** (Entscheidung 28 d,
§7.1): kein antd, keine Suite-Shell, kein App-Switcher, eigenes CSS-Modul, eigene Anmutung. Damit
sind **Falle 1** (Compound-Zugriff auf antd in einer Server Component ⇒ HTTP 500) und **Falle 7**
(`@ant-design/icons` in RSC ⇒ HTTP 500 **schon beim Import**) auf rund 630 Zeilen Oberfläche
**strukturell ausgeschlossen** statt bewacht. Die Aktivmarkierung der Tab-Leiste ist ein
**Server-Prop**; `usePathname` kommt im ganzen Modul nicht vor (Falle 63, §7.8.2).

**Tech Stack:** Next.js 16.2.11 (App Router/RSC) · **kein** Ant Design auf diesem Ast ·
Drizzle 0.45 + better-sqlite3 12.11 · `jose` · `@zxing/browser` + `@zxing/library` · **kein direkter
`next-auth/react`-Aufruf** — der Verwaltungsknopf auf dem Gate ist ein Link auf das Suite-`/login`
(§3.6.6, T77) · Vitest 4 + Playwright · pnpm.

---

## Plan-Index

Der vollständige Index der sechs Teile, der Schnitt entlang der Knoten A–H aus dem Spec-Anhang und
die Begründung dafür stehen **in Teil 1**
(`docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil1.md`, Abschnitt „Plan-Index — dieser Plan
ist Teil 1 von sechs"). Er wird hier **nicht** kopiert; eine zweite Kopie liefe auseinander.

Dieser Teil ist **Teil 4 von sechs** und deckt **Knoten E**.

| Voraussetzung | Zustand |
|---|---|
| **Teil 1** — Gerüst und Datenmodell (§2, §4, §5.13.2), T1–T14 | muss abgenommen sein |
| **Teil 2** — Zugang (§3), T15–T27 | muss abgenommen sein |
| **Teil 3** — Fachlogik und Grenzen (§5, §10, §12.6), T28–T61 | muss abgenommen sein |
| Teil 5 — Verwaltung (§6), Teil 6 — Artefakte/Ausgaben/Abnahme (§8, §9, §11, §12) | **danach** |

**Task-Nummern laufen weiter:** Teil 3 endet bei T61, dieser Teil trägt **T62 bis T87**. Teil 5
beginnt bei T100; T88–T99 bleiben unvergeben, damit kein Commit-Verweis der übrigen Pläne mehrdeutig
wird.

⚠️ **Ohne Teil 3 ist dieser Plan nicht ausführbar, und zwar nicht nur wegen der Lesepfade.** T60
(Teil 3) legt `playwright.config.ts` mit `SUITE_HOST_LAGERBUCH`, dem Sitzungsgeheimnis, der
Admin-Gruppe, dem Seed-Schritt und dem **zweiten Host** an. **Die Abrufprobe in T87 fährt gegen genau
diese Konfiguration** — sie ist der einzige laufende Server, den dieser Plan sieht, und sie fängt
Falle 41 (Tab-Leiste bei 390×844 **und** 1280×720, kein waagerechtes Scrollen) sowie Falle 56
(Manifest und Icons antworten auf dem Modul-Host mit 200).

⚠️ **Was T87 NICHT belegen kann, belegt Teil 6 (T171):** Falle 16 — dass `/t/<code>` das Cookie auf
demselben Host setzt, auf dem die Landung passiert — und Falle 63 — `aria-current="page"` an drei
Einstiegen unter dem Rewrite. Beides braucht **zwei** Hosts und einen echten Redirect-Rundlauf und
gehört damit in `e2e/lagerbuch-helfer.spec.ts`, das **Teil 6** anlegt (dort J2, T171; siehe E11).

---

## 0. Vorbedingungen

Von den neun offenen Fragen aus §15.1 berühren **drei** dieses Kapitel, und **keine** blockiert den
Baubeginn: die Spec entscheidet in allen drei Fällen einen Weg, der gegen beide Antworten robust
ist. Die Tabelle steht trotzdem vollständig hier, weil ein Umsetzer sonst beim ersten Widerspruch
zwischen Spec und Betrieb neu nachdenkt statt nachzuschlagen.

| # | Frage | Antwortet | Blockiert | Was dieser Plan tut |
|---|---|---|---|---|
| 5 | Soll `tokens.scope_lagerort_id` je ein **Riegel** werden? (E14, §7.9.1) | Betreiber | nichts | **Kein Riegel.** `?fz=` bleibt Vorauswahl; ein Fahrzeug-Code kann jedes Fahrzeug checken (Falle 14, 1:1 aus dem Bestand). **T85** (die `gewaehlt`-Zeile in `helfer/check/page.tsx`) und **T75** (die erste Zeile von `checkAbschluss`) markieren mit einem Kommentar **genau die zwei Zeilen**, an denen eine spätere Durchsetzung ansetzt |
| 6 | Liegt im Lagerraum und in der Fahrzeughalle **Netz** an? (A26, §7.10.1) | Betreiber | nichts im Bau | **Annahme A-E2: es liegt Netz an.** Kein Service Worker (Entscheidung 24 a). Ist die Annahme falsch, ist die Antwort ein Access Point und **kein** Service Worker — Grund 3 aus §7.10.1 gilt unabhängig von der Antwort |
| 8 | Stehen **Hersteller-EANs** tatsächlich im Bestand? (A25, §7.6.2) | Betreiber | nichts | **Die sieben `POSSIBLE_FORMATS` bleiben zeichengleich.** Formate zu behalten kostet nichts; sie zu entfernen ist gegen gedruckte Hardware unumkehrbar |

**Drei Runbook-Eingaben entstehen in diesem Teil** (§7.13.4). Sie blockieren den Bau **nicht**, aber
sie gehören vor dem Cutover beantwortet, und zwei davon sind ohne Antwort **still schädlich**:

| # | Eingabe | Warum sie nicht warten kann |
|---|---|---|
| R1 | **Die heutige `APP_BASE_URL` im Wortlaut** — und die Bestätigung, dass `SUITE_HOST_LAGERBUCH` **zeichengleich derselbe Host** ist (§7.4.1) | `helferCookieOptionen()` setzt `path:"/"` **ohne** `domain`; das Cookie ist host-only. Weicht der neue Host ab, ist die Übernahme des Sitzungsgeheimnisses (Betreiber-Entscheidung 4) **wirkungslos** — jede laufende Feld-Sitzung endet beim Cutover, und **kein Test sieht das** |
| R2 | **Nach dem Umschwenken:** `curl -si https://lagerbuch.iuk-ue.de/manifest.webmanifest` und `/icon-192.png` gegen §7.10.2 halten; `curl -si https://<portal-host>/manifest.webmanifest` darf das lagerbuch-Manifest **nicht** liefern | `start_url: "/"` zeigt ohne gesetztes `SUITE_HOST_LAGERBUCH` aufs **Portal**; eine installierte PWA startete dann im falschen Modul |
| R3 | **Generalprobe, ein Gerät:** PWA installieren, im Browser einlösen, Regaletikett mit der **Systemkamera** scannen — notieren, ob eine Sitzung da ist (§7.10.4) | Auf iOS führt ein Startbildschirm-Fenster eine eigene Speicherpartition. Fällt der Test negativ aus, ist die Abhilfe **keine Codeänderung**, sondern ein Satz in der Übergabe |

**Keine dieser Fragen darf durch eine erfundene Vorbelegung ersetzt werden.** Wo dieser Plan einen
Wert nennt, ist er entweder in der Spec belegt oder als Annahme mit `A-E<n>` markiert.

---

## 1. Festlegungen dieses Plans, die die Spec offen lässt

Elf Punkte. Jeder ist eine Entscheidung **dieses** Plans, keine Ableitung. Sie stehen hier beisammen,
damit Teil 5 und Teil 6 sie nicht ein zweites Mal treffen — und damit ein Umsetzer, der auf einen
Widerspruch zum Verzeichnisbaum aus §2.1 stößt, hier die Begründung findet statt zu raten.

### E1 — `g/[code]/page.tsx` gehört **NICHT** diesem Plan, sondern Teil 6

Das ist die einzige Abweichung dieses Teils vom naheliegenden Schnitt „§7 = Teil 4", und sie folgt
der Spec, nicht der Bequemlichkeit. **§2.1 c ist unmissverständlich:** `/g` rendert **überhaupt nur
einen** Zustand — alle Trefferfälle leiten weiter, die Rollen-Weiche schickt jede Nicht-Admin-Anfrage
vorher weg —, und dieser eine Zustand trägt **`_ui/VerwaltungsRahmen.tsx`, mit Shell und
Modulnavigation** (§2.9, §8.1 8-C2, §11.3).

`_ui/VerwaltungsRahmen.tsx` entsteht in **Teil 5**. Es gäbe damit genau zwei Möglichkeiten, `/g` hier
zu bauen, und beide sind schlecht:

- **`notFound()` stehen lassen und Teil 6 tauscht es** — das ist ein Platzhalter mit einem Einlöser
  in einem *anderen* Plan. Genau die Form, die dieser Plan verbietet.
- **Einen zweiten, shell-losen Rahmen für diesen einen Zustand bauen** — §11.3 schreibt aus, warum
  das falsch wäre: „ohne Shell und ohne Modulnavigation" ist **ein Teil dessen, was hier repariert
  wird**. Ein eigener Rahmen baute den Mangel nach, statt ihn zu beheben.

→ **`/g/[code]/page.tsx` liegt bei Teil 6** (§8.1 Deep-Link, §11.3 gestalteter Nicht-Treffer, dazu
`_ui/VerwaltungsRahmen.tsx` aus Teil 5). **Damit Teil 6 die Rollen-Weiche nicht neu herleiten muss,
steht sie vollständig in der Abschlusstabelle dieses Plans (§6).** Was dieser Teil dafür liefert und
was `/g` konsumiert, ist `_lib/barcode.ts#normalisiereBarcode` (T62) — die Zeile, an der `/g` heute
seinen Routen-Parameter **roh** durchreicht (`g/[code]/page.tsx:29,31`, die einzige unnormalisierte
Lesestelle des Bestands, §7.6.2).

### E2 — `redeemToken` hat in Teil 1 bis 3 **keinen Eigentümer** und entsteht deshalb hier

Nachgeprüft: `redeemToken` steht in §7.13.2 unter „Was dieses Kapitel **braucht** … von §4, §5" —
aber **weder** die Eigentümertabelle von Teil 1, Teil 2 noch Teil 3 führt eine Datei mit dieser
Funktion, und §2.1s Verzeichnisbaum nennt sie nicht. Das ist eine Lücke im Schnitt, keine
Absicht: die Funktion hat **drei** Aufrufer, und alle drei sind Teil-4-Dateien
(`t/[code]/route.ts`, `_actions/gate.ts#einloesenAmGate`, `_actions/sitzung.ts#erneuereSitzung`,
§7.5.2).

→ **Dieser Plan legt sie an** (T66), als `src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts`.
**Warum unter `_lib/schreibpfade/` und nicht flach unter `_lib/`:** §2.1 h ist kategorisch — „jeder
Schreibweg unter `_lib/schreibpfade/`" —, und `redeemToken` **schreibt** (`tokens.lastUsedAt`,
`token-redeem.ts:16`). Dass §2.1s Baum dort nur fünf Dateien führt, ist eine Aufzählung des
Bekannten, keine Obergrenze; der Baum führt aus demselben Grund auch `_ui/FahrzeugWahl.tsx` nicht
(E5).

⚠️ **Der `lastUsedAt`-Schreibvorgang ist der Grund, warum Falle 16 teuer ist** und nicht bloß
ärgerlich: ein Code, der einmal eingelöst wurde, ist **nicht mehr löschbar**, sondern nur noch
sperrbar (`loeschen.ts:89-99`). Ein cross-origin-Redirect verbrennt also einen laminierten
Gegenstand, ohne dass jemand eine Sitzung bekommen hätte.

### E3 — `_ui/ikonen.tsx` entsteht **nicht** hier; jede Teil-4-Datei trägt ihre Zeichen lokal

§7.7.4 entscheidet Inline-SVG in `_ui/ikonen.tsx` — **und dieselbe Datei gehört der Verwaltung**:
die vollständige Namensunion (36 Namen), die Vorgabegröße 18px und der modul-eigene Riegel
`_ui/ikonen.test.ts` stehen in **§6.5.2 und §6.5.5**, also in Teil 5. Die achtzehn Zeichen des
Helfer-Wegs sind eine **Teilmenge** davon.

→ **Teil 4 legt `_ui/ikonen.tsx` nicht an.** Jede Datei dieses Plans, die ein Zeichen braucht, trägt
es als lokales Inline-`<svg>` **in derselben Datei**, mit `aria-hidden="true"` und `focusable="false"`
und immer **neben Text** (`docs/design/README.md`, „Bedeutung nie allein über Farbe" — für Zeichen
gilt dasselbe, §7.7.4).

**Benannter Einlöser, damit daraus keine zweite Ikonenquelle wird:** *Teil 5 legt `_ui/ikonen.tsx`
mit der 36-Namen-Union an und hebt die Zeichen dieses Plans dorthin.* Das kostet nichts, weil
**kein** Test dieses Plans auf ein SVG-`d`-Attribut zusichert — geprüft wird `aria-label` bzw. der
danebenstehende Text. Die Hebung ist damit ein reiner Import-Tausch, und die Tests bleiben grün.
Die Auflage steht auch in §6 (Abschlusstabelle).

⚠️ **`@ant-design/icons` und `lucide-react` sind auf diesem Ast verboten** — das erste wegen Falle 7
(HTTP 500 **beim Import**, `"use client"` behebt es nicht, es macht es still), das zweite, weil die
Suite es gar nicht im Baum hat (`package.json` führt `@ant-design/icons` und `antd`, kein lucide).
Der Alt-Bestand importiert `lucide-react` in **jeder** Datei dieses Zweigs; **keine einzige dieser
Importzeilen wandert mit.** Der Scan dafür steht in T64.

### E4 — `_ui/HelferChip.tsx` wird eingeführt, und der Grund ist eine benannte Falle

§5.17 schreibt die **Namensfalle** aus: ein direkt interpoliertes `chip-${ampel}` ergäbe ein
undefiniertes `chip-gruen` **mit Padding und Radius, aber ohne Farbe** — still, weil eine nicht
existente CSS-Klasse gültiges Markup ist. In einem **CSS-Modul** ist die Falle schärfer: `s[\`chip-${ton}\`]`
liefert `undefined`, und React rendert `class="undefined"`.

→ Genau **eine** Stelle bildet `AmpelTon` auf eine Modulklasse ab: `_ui/HelferChip.tsx` (T70), mit
einem vollständigen `Record<AmpelTon, string>` — keine Interpolation, kein Index-Zugriff auf `s`.
Drei Konsumenten: `_ui/Entnahme.tsx`, `_ui/CheckFlow.tsx` und `a/[artikelId]/page.tsx`.

`_ui/Chip.tsx` aus §6.6.3 ist eine **andere** Datei: sie liest `verwaltung.module.css` und gehört
Teil 5. Zwei Chips sind kein Versehen — die beiden Ansichtsklassen haben verschiedene Stylesheets,
und ein geteilter Chip zöge `verwaltung.module.css` in den Helfer-Zweig.

### E5 — `_ui/FahrzeugWahl.tsx` und `_ui/LeerZustand.tsx` werden eingeführt

Beide stehen im Code von §7.9.1 (`<FahrzeugWahl fahrzeuge={…} />`, `<LeerZustand … />`), aber in
keiner Dateiliste. Sie bekommen eigene Dateien, nicht Inline-Definitionen:

- **`_ui/FahrzeugWahl.tsx`** ist eine **Server Component** mit `<Link>` je Fahrzeug (§7.9.1: die
  Fahrzeugwahl wird eine **Navigation**, kein `useState`-Umschalter). Als Inline-Definition in
  `helfer/check/page.tsx` wäre sie testbar nur über die ganze Seite — und die braucht eine
  Datenbank.
- **`_ui/LeerZustand.tsx`** hat **drei** Konsumenten: `helfer/check/page.tsx` (kein Fahrzeug
  angelegt), `_ui/CheckFlow.tsx` (Fahrzeug ohne Soll, Gerät und Flasche) und
  `a/[artikelId]/page.tsx` (Etikett ohne Artikel, Entscheidung 8-C). Dreimal dieselben zwölf Zeilen
  wären dreimal Gelegenheit, den Rückweg zu vergessen — und **§11.7 stützt sich darauf, dass jeder
  gestaltete Zustand einen benannten Weg zurück trägt.** Der Weg ist deshalb ein **Pflicht-Prop**.

### E6 — `_lib/pwaIcons.ts` hält die drei PNG-Bytes, und sie werden **erzeugt**, nicht abgetippt

§7.10.2 verlangt „die Route Handler halten die Bytes als Base64-Konstante". Drei Dateien mit
zusammen **10.306 Bytes** ergeben rund 13.700 Zeichen Base64. Sie in einen Plan zu schreiben wäre
weder lesbar noch überprüfbar, und **eine Auslassung mitten in einer Base64-Zeichenkette ist ein
Platzhalter, den kein `grep` auf „TODO" findet.**

→ T65 erzeugt `src/app/m/lagerbuch/_lib/pwaIcons.ts` mit einem **ausgeschriebenen Shell-Schritt**
aus den echten Dateien der Alt-Anwendung und prüft die Byte-Längen (1558 · 5458 · 3290) in
`_lib/pwaIcons.test.ts` gegen dieselben Dateien. Der Test ist damit die Zusicherung „die Bytes sind
**diese** Bytes", nicht „irgendwelche Bytes".

⚠️ **`_lib/pwaIcons.ts` ist eine Wertedatei ohne `"use client"`** und fällt damit unter dieselbe
Regel wie der Rest von `_lib/` (Falle 6). Sie liegt **nicht** unter `_ui/`, weil sie keine
Komponente ist.

### E7 — `pwa-icon.svg` wird **byte-exakt portiert** (Betreiberentscheidung D12)

⚠️ **Hier stand bis zum 04.08.2026 das Gegenteil, gestützt auf einen Messfehler.** Die frühere
Fassung schrieb: das Manifest verweise auf `/icon.svg`, „und diese Datei existiert nicht" — belegt
mit `ls ../lagerbuch/public/`. **Im falschen Verzeichnis gesucht.** Die Datei liegt unter
`../lagerbuch/src/app/icon.svg`; Nexts Dateikonvention im App-Verzeichnis liefert sie unter
`/icon.svg` aus. Der Manifest-Eintrag zeigt **nicht** ins Leere.

→ **D12 (Betreiber, 04.08.2026): das vorhandene Zeichen wird wiederverwendet.** T65 trägt es
byte-exakt ein — 385 Bytes, `98d9dcdb66ee733fd9b28921930121973937fc344b1d28628f354e35a44e5b34`. Es ist ein
abgerundetes Quadrat auf `#1a1d20` mit **einer roten und zwei weißen** Regalmarken; die frühere
Beschreibung („Suite-Rot mit drei weißen Marken") beschrieb ein Zeichen, das es nicht gibt.
Feste Hexwerte statt CSS-Variablen bleiben richtig — eine SVG-**Datei** hat keinen Elternbaum, und
das Zeichen der Alt-Anwendung nutzt sie ohnehin nicht.

⚠️ **`apple-icon.png` und `favicon.ico` wandern NICHT mit** — beide sind Nexts Dateikonvention und
lösen im Suite-Baum auf einem Pfad auf, den der Host-Rewrite nie trifft. Das Lesezeichen-Symbol der
Lagerbuch-Domain wird das der Suite. Bewusster Verlust gegenüber heute, gehört ins
Cutover-Anschreiben; die Nachrüstung wäre eine Suite-Frage (ein Symbol je Host).

### E8 — Der Helfer-Zweig trägt die Ampel-Hexwerte aus §6.6.2, und Teil 5 bindet sie

§7.7.4 legt fest, **dass** der Helfer-Weg seine Statusfarben aus der fachsemantischen Palette
bezieht; **die Werte** stehen in §6.6.2, und **`_lib/ampel.ts` gehört Teil 5**. §6.6.2a löst das
ausdrücklich auf: „Für den Helfer-Weg tut `helfer.module.css` dasselbe (§7.7.4)" — die Werte stehen
als CSS-Variablen auf dem **Rahmen**-Element.

→ T64 schreibt die **acht** Namen aus `AMPEL_HELL` und `AMPEL_DUNKEL` zeichengleich nach
`_ui/helfer.module.css`, unter `.rahmen` bzw. `:root[data-theme="dark"] .rahmen`.

⚠️ **Auflage an Teil 5, wörtlich aus §6.6.2 Punkt 4:** der Quelltext-Scan in `_lib/ampel.test.ts`
läuft über **`_ui/verwaltung.module.css` UND `_ui/helfer.module.css`** — „ein Scan über nur eine von
beiden ließe die Hälfte driften". Ohne diese Auflage steht die Palette in Teil 4 unverbunden da, und
ein späterer „schönerer" Farbtausch in `ampel.ts` ließe den Helfer-Zweig still zurück.

### E9 — `_lib/bauform.test.ts` wird von **zwei** Tasks angefasst, in **zwei** Wellen

Teil 2 (T21) hat die Datei angelegt und Teil 4 ausdrücklich die Erweiterung zugewiesen: „Teil 4
ERWEITERT diese Datei um den `usePathname`-Scan (§7.8.2) und **verschärft** die Weichen-Zeile von
‚falls die Datei existiert' auf ‚die drei Dateien existieren **und** tragen die Regel'. Es entsteht
keine zweite Scan-Datei."

Das lässt sich nicht in **einem** Task erledigen: die Verschärfung behauptet die **Existenz** der
drei Weichen-Dateien (`page.tsx`, `a/[artikelId]/page.tsx`, `g/[code]/page.tsx`), und die entstehen
in Welle 4 bzw. gar nicht in diesem Plan (E1). Ein Scan mit Existenzpflicht in Welle 1 wäre am
ersten Tag rot und würde abgeschaltet statt repariert — genau der Fehler, gegen den Teil 2 die
Eigenschaftsform gewählt hat.

→ **T64 (Welle 1)** ergänzt die fünf Scans in **Eigenschaftsform**: die vier aus §7.12.2 plus den
`usePathname`-Scan. **T87 (Welle 8, Abnahme)** verschärft die Weichen-Zeile. Beide Tasks liegen in
**verschiedenen** Wellen und laufen nie gleichzeitig; die Eigentümertabelle (§3) führt das
ausdrücklich. Dasselbe Muster hat Teil 1 für `core/bootstrap.ts` benutzt.

⚠️ **Die Verschärfung nennt nur ZWEI der drei Dateien.** `g/[code]/page.tsx` entsteht erst in Teil 6
(E1); sie bleibt bis dahin in der Eigenschaftsform („falls vorhanden") und wird von **Teil 6** in die
Existenzpflicht überführt. Das steht in §6.

### E10 — Die Action-Arithmetik dieses Teils ist festgeschrieben

`_actions/guards.test.ts` (Teil 2, T20) zählt in **Teil 6** die Gesamtmenge: 47 = 44 bewachte + 3
Ausnahmen, verteilt auf 18 Action-Dateien, 19 Verzeichniseinträge (§2.1 a). Damit Teil 6 nicht raten
muss, was Teil 4 beigetragen hat:

| | Datei | Exporte | Riegel | Task |
|---|---|---|---|---|
| 1 | `_actions/gate.ts` | `einloesenAmGate` | **Ausnahmeliste, Eintrag 1** | T73 |
| 2 | `_actions/sitzung.ts` | `erneuereSitzung` · `beenden` | **Ausnahmeliste, Einträge 2 und 3** | T74 |
| 3 | `_actions/check.ts` | `checkAbschluss` | `requireHelferSchreibend` | T75 |
| | **3 Dateien** | **4 Deklarationen** | **1 bewacht + 3 Ausnahmen** | |

⚠️ **`_actions/buchung.ts` gehört NICHT diesem Plan — auch `bucheEntnahmeHelfer` nicht.** Die frühere
Fassung dieser Festlegung führte die Datei mit einem vierten Eintrag und rechnete daraus „4 Dateien,
5 Exporte" und „47 − 5 = 42 bewachte in 14 Dateien". **Beides zählte `buchung.ts` doppelt.** Teil 5
hat die Datei in **Festlegung H7 vollständig übernommen**, ausdrücklich und mit Begründung: alle drei
Buchungs-Actions teilen sich `fefoAbbuchung` und dieselbe Zod-Basis, und „zwei Dateien für einen
Buchungsvorgang wären zwei Orte für dieselbe Invariante" (teil5.md:134-140, T114). **Teil 4 legt
keine zweite `_actions/buchung.ts` an; es ruft `bucheEntnahmeHelfer` aus `_ui/Entnahme.tsx` (T78).**

**Verbindlich ist die hergeleitete Tabelle in Teil 6, §4.1 und §4.2** (teil6.md:346-374 und :380-403):

```
47 Actions  =  44 bewacht  +  3 Ausnahmen
            in 18 Action-Dateien, 19 Verzeichniseinträge (18 + guards.test.ts)

  Teil 5 (T113–T126)   15 Dateien   43 Deklarationen   43 bewacht   0 Ausnahmen
  Teil 4 (dieser Plan)  3 Dateien    4 Deklarationen    1 bewacht   3 Ausnahmen
  Summe                18 Dateien   47 Deklarationen   44 bewacht   3 Ausnahmen
```

⚠️ **Alle vier Deklarationen dieses Plans stehen unter einem der beiden Sonderfälle**, und keine
trägt `requireLagerbuchAdmin`:

- `einloesenAmGate`, `erneuereSitzung`, `beenden` stehen auf der **Ausnahmeliste** des Guard-Scans
  (§3.8.2, Einträge 1 bis 3). Die ersten beiden **erzeugen** die Sitzung — ein Sitzungsriegel davor
  wäre die Tür, die sich selbst abschließt; `beenden` **löscht** sie und muss auch dann noch wirken,
  wenn sie schon ungültig ist (§3.4.4).
- `checkAbschluss` trägt **`requireHelferSchreibend`** als erste Anweisung, und der Rückgabewert
  **muss ausgewertet werden** (§7.4.3). Er ist die einzige der 44 bewachten Actions dieses Moduls,
  die **keinen** Admin-Riegel trägt — die zweite ist `bucheEntnahmeHelfer` und liegt in Teil 5.

⚠️ **`requireHelferSchreibend` ruft `requireLagerbuchHost` INTERN, als erste Anweisung** (Teil 1,
T10, Verankerungstabelle). `checkAbschluss` ruft den Host-Riegel deshalb **nicht noch einmal**. Die
werfende Form rufen in diesem Plan **genau zwei** Actions selbst: `einloesenAmGate` und
`erneuereSitzung` — sie haben noch keine Sitzung, durch die der Riegel liefe (§7.5.2, Schritt 1).

### E11 — `e2e/lagerbuch-helfer.spec.ts` gehört **Teil 6, T171** — nicht diesem Teil

Die frühere Fassung dieser Festlegung beanspruchte die Datei für einen „T84". **Diese Beanspruchung
wird zurückgezogen**, und der Grund ist nicht Bequemlichkeit, sondern Eigentümerschaft: **Teil 6 hat
sie in Festlegung J2 bereits übernommen und mit T171 einen geschriebenen Task dafür**
(teil6.md:133-146). Es gibt in keinem Fall **zwei** Helfer-Specs, und der Plan, der die Datei
tatsächlich baut, besitzt sie.

**Was inhaltlich richtig bleibt und deshalb hier stehen bleibt** — §7.12.4: `e2e/lagerbuch-helfer.spec.ts`
ist der **einzige** Nachweis für zwei Fallen, die strukturell in keinem anderen Gate sichtbar sind:

- **Falle 16:** dass `/t/<code>` das Cookie auf **demselben** Host setzt, auf dem die Landung
  passiert. „Der Mehrhost-Fall ist in Vitest nicht darstellbar; heute mockt `token-redeem.test.ts:3`
  die Basis-URL auf denselben Host wie der Testserver, **der Bruch ist per Konstruktion
  unsichtbar**." Diese Route hat heute **null** E2E (Falle 32).
- **Falle 63:** dass `aria-current="page"` an drei Einstiegen am richtigen Tab landet — unter dem
  Rewrite, auf dem Modul-Host.

→ **Teil 6 legt `e2e/lagerbuch-helfer.spec.ts` an (J2, T171).** Dieser Plan schreibt **keine**
E2E-Datei. Er schuldet Teil 6 dafür genau drei Dinge, und alle drei stehen in den Tasks:

| Was T171 braucht | Woher es kommt |
|---|---|
| `data-testid="lb-tableiste"` am `<nav>` und `aria-current="page"` als **Prop**-Ableitung | **T76** (`_ui/HelferRahmen.tsx`) — die Zusage steht dort im `Produces`-Block |
| `/t/<code>` antwortet **303** mit **relativem** `Location` und setzt das Cookie auf **dieser** Antwort | **T82** (`t/[code]/route.ts`) |
| `?grund=code` erzeugt einen **lesbaren deutschen Satz** auf dem Gate | **T81** (Gate-Seite) über `gateMeldung` aus Teil 2 |

⚠️ **Was dieser Plan stattdessen an laufendem Server prüft, steht in T87** und ist eine andere,
kleinere Aussage: Tab-Leiste und waagerechtes Scrollen bei 390×844 **und** 1280×720 (Falle 41),
Manifest und Icons mit 200 auf dem Modul-Host (Falle 56). **T87 ersetzt T171 nicht** und behauptet
das auch nirgends. Das steht in §6.

---

## 2. Global Constraints — was ZUSÄTZLICH aus §7 folgt

**Die projektweiten Constraints stehen vollständig in Teil 1, Abschnitt „Global Constraints", die
Zugangs-Constraints in Teil 2, §2, die Fachlogik-Constraints in Teil 3, §2. Alle drei gelten
unverändert weiter und werden hier NICHT wiederholt.** Insbesondere gelten weiter: kein
`"use client"` unter `_lib/` und `_db/` (Falle 6), Zeitstempel in UNIX-**Sekunden**, kein
`_db/queries.ts`, äußere Pfadform für alles, was der Client schreibt, innere für `revalidatePath`,
und `@/app/m/qr/_lib/test-dom` als **einziges** DOM-Harness.

Was **zusätzlich** aus §7 folgt — jeder Punkt ist eine Regel, die `pnpm build` nicht findet:

**Die Ansichtsklasse (§7.1, Entscheidung 28 d)**

1. **Kein `antd` und kein `@ant-design/icons` auf diesem Ast — in KEINER Datei dieses Plans, auch
   nicht in einer Client-Insel.** Damit sind **Falle 1** (Compound-Zugriff in einer Server Component
   ⇒ HTTP 500) und **Falle 7** (`@ant-design/icons` in RSC ⇒ HTTP 500 **beim Import**) auf rund 630
   Zeilen Oberfläche **strukturell ausgeschlossen**, nicht bewacht. T64 riegelt es ab.
2. **Kein `lucide-react`.** Der Alt-Bestand importiert es in **jeder** Datei dieses Zweigs; die Suite
   hat es nicht im Baum (`package.json` führt `antd` und `@ant-design/icons`, kein lucide). **Keine
   einzige dieser Importzeilen wandert mit.** Zeichen sind lokale Inline-`<svg>` (E3).
3. **Kein `<Shell>`, kein `nav`, kein App-Switcher, kein `SuiteNavItem` für `/helfer/*`.** Das
   Modul-Wurzel-Layout (Teil 1, T6) trägt **ausschließlich** `metadata.manifest` und `{children}`.
4. **Kein `viewport`-Export im Modul.** Der gehört der Suite (`src/app/layout.tsx`) und ist gesetzt;
   ein zweiter wäre die naheliegende Übernahme aus lagerbuch — dort gibt es keinen, hier gäbe es
   dann zwei (§7.7.2).
5. **Kein `notFound()` auf einem Weg, den eine Person mit einem gedruckten Gegenstand in der Hand
   nimmt** (Entscheidung 36 a). Gestaltete Zustände in der Seite, HTTP 200. Die Suite-404
   (`src/app/not-found.tsx`) ersetzt alle Modul-Layouts und trägt einen antd-`Button` (`:57`).
   ⚠️ Ausgenommen ist der **Host**-Riegel: `requireLagerbuchHost` wirft `notFound()`, weil die
   Existenz eines Pfades auf dem falschen Host nicht verraten wird (Teil 1, T10).

**Die Pfadrichtungen (§2.1 g, §7.2.5, §7.9.5) — beide Sorten stehen in denselben Dateien**

6. **Jedes `href`, jedes `Location`, jedes `redirect()` trägt den ÄUSSEREN Pfad**: `/helfer`,
   `/helfer/check`, `/a/<id>`, `/helfer/check?fz=<id>`, `/`. Der Browser steht auf dem Modul-Host,
   `decideRoute` präfixiert danach. Innere `href` würden auf dem äußeren Host **doppelt** präfixiert.
7. **Jedes `revalidatePath` trägt den INNEREN Pfad** (`/m/lagerbuch/…`). Alle 61 Aufrufe des
   Bestands übergeben den äußeren; alle vier vorhandenen Suite-Module den inneren (Falle 49). Ein
   Kommentar an der ersten `revalidatePath`-Zeile jeder Action hält die Richtung fest.
8. **`/t/<code>` antwortet mit HTTP 303 und RELATIVEM `Location`**, nie mit `NextResponse.redirect`.
   Jede absolute URL hier ist entweder aus einer Basis-Variablen geraten (Falle 16) oder aus
   `req.url` gebaut — und `req.url` trägt nach dem Rewrite den **inneren** Pfad.

**Die Fehlerform (§7.3, Falle 66)**

9. **Jede erwartbare Fehlerlage ist ein RÜCKGABEWERT, kein Wurf.** Der Produktions-Deserialisierer
   hat für eine Fehlerzeile genau einen Zweig und baut einen festen **englischen** Satz mit `digest`;
   `e.message` erreicht in Produktion niemanden. Die 22 deutschen Texte in `lagerbuch/src/actions/*`
   sind fachlich richtig und betrieblich wirkungslos.
10. **Der Wurf bleibt dem Riegelfall vorbehalten.** In `checkAbschluss` sind das **genau vier**
    Stellen, und sie bleiben Würfe: „Soll-Position gehört nicht zu diesem Fahrzeug" (`check.ts:94`),
    „Gerät gehört nicht zu diesem Fahrzeug" (`:128`), „Flasche gehört nicht zu diesem Fahrzeug"
    (`:139`), „Artikel gehört nicht zu diesem Fahrzeug" (`:155`). Kein Helfer erreicht sie über die
    Oberfläche. ⚠️ **Ausgenommen ist außerdem `requireLagerbuchHost`** in `einloesenAmGate` und
    `erneuereSitzung`: es wirft weiter, weil ein fremder Host keine Auskunft bekommt.
11. **Jeder Action-Aufruf im Client steht in `try/catch` mit `grund: "netz"`.** `HelferEntnahme.tsx:22-30`
    hat heute **kein** `catch`; `CheckFlow.tsx:158-159` fängt und zeigt `e.message`. Beide Formen
    sind verboten.
12. **`"netz"` entsteht NIE serverseitig.** Es ist der Grund, den der Client im `catch` selbst setzt.
    Das steht als Kommentar an der Definition in `_lib/actionTypen.ts`.

**Die Aktivmarkierung (§7.8.2, Falle 63)**

13. **`usePathname` kommt unter `src/app/m/lagerbuch/` NICHT vor.** Verbindlich, mit Testriegel
    (T64). Die Markierung ist ein **Server-Prop** (`aktiv: "entnahme" | "check"`).
14. **Kein `useSearchParams`, kein `router.push`, kein `router.replace` auf dem Helfer-Weg.** Der
    Filterzustand wird serverseitig als `searchParams`-Prop gelesen; die Fahrzeugwahl ist ein
    `<Link>` (§7.9.1). Die Suspense-Falle rund um `useSearchParams` entsteht auf diesem Ast nicht.
15. **`aria-current="page"` ist die Zusage, nicht die CSS-Klasse.** Die Klasse folgt daraus
    (`.tab[aria-current="page"]`), nicht umgekehrt.

**Maße, Farben, Schrift (§7.7)**

16. **`_ui/helfer.module.css` enthält NULL Media Queries.** Der Rahmen ist fluid mit einer
    Obergrenze (`max-width: 560px`). Wo im Modul überhaupt eine Abfrage nötig ist, heißt sie
    **`max-width: 767.98px`** — nicht 768, sonst gelten bei exakt 768px beide Seiten und die
    Reihenfolge im Stylesheet entscheidet. ⚠️ lagerbuch schaltet heute bei **760px**
    (`globals.css:250`); derselbe Fall, an beiden Enden unsichtbar.
17. **Kein `--ant-*` — weder in einem Stylesheet noch in einem Inline-Style.** Es gibt hier keinen
    antd-Komponentenbaum, also sähe eigenes Markup die Variablen ohnehin nicht (Falle 2), und eine
    nicht auflösbare CSS-Variable ist **gültiges CSS** und fällt still auf `transparent` zurück.
    Verbindlich sind `var(--lb-*)` vom Rahmen-Element.
18. **Alle Eingabefelder liegen bei ≥ 16px, auch in der `font:`-Kurzschreibweise.**
    `core/theme/feldschrift.test.ts:114-141` liest nur die Langform und filtert nach Selektortext —
    drei zu kleine Felder des Bestands kommen dort **durch**. T64 schließt die Lücke modul-lokal.
19. **Tap-Maß 56px an jeder ±-Fläche** (`core/theme/tokens.ts:33`, „Bedienung mit Handschuhen …
    eine Einsatzanforderung, keine Stilfrage"). Die `sm`-Variante des Steppers **entfällt**; es gibt
    genau eine Größe.
20. **`font-variant-numeric: tabular-nums`** auf `.stepWert`, `.bestandsZahl` und `.mengenChip`. Im
    ganzen lagerbuch-Repo kommt die Eigenschaft **null** Mal vor; die Ausrichtung hängt heute allein
    an IBM Plex Mono.
21. **Rot steht nie auf einer Datenfläche.** Der Primärknopf bleibt rot, weil er die Handlung ist;
    Statuschips beziehen ihre Farbe aus `--lb-ampel-*` (E8). Und **jeder Status trägt zusätzlich
    Text** — das tut er heute schon.
22. **Fokus:** `outline` mit `outline-offset`, nie `outline: none` ohne Ersatz. Die Suite-Regel
    erreicht nur antd-Komponenten; die Zeile wandert zeichengleich ins Modul-CSS.

**Sitzung und Riegel (§7.4, §7.5)**

23. **Die drei Gate-Flächen tragen dieselben Riegel in dieser Reihenfolge:** Host → Sperre (**ohne
    Datenbankzugriff**) → normalisieren → `redeemToken(code, getDb())` → Erfolg: Cookie, **kein**
    Budgetverbrauch → Misserfolg: die drei Zähler buchen, `grund=code`.
24. **`requireHelferSitzung` und `requireHelferSchreibend` rufen `requireLagerbuchHost` INTERN, als
    erste Anweisung** (Teil 1, T10). Wer sie benutzt, ruft den Host-Riegel **nicht noch einmal**.
25. **Der Rückgabewert von `requireHelferSchreibend` MUSS ausgewertet werden.** Bis zur Portierung
    warf dieser Riegel; ein Wurf ließ sich nicht übersehen. `await requireHelferSchreibend(db)` ohne
    Prüfung ist typkorrekt, lint-sauber und **öffnet die Action für jeden**.
26. **Kein Service Worker, kein `workbox`, kein `sw.js`** (Entscheidung 24 a). Der Helfer-Weg ist ein
    **Schreibweg**; ein Cache machte Lesen offline möglich und Schreiben nicht — der schlechteste
    Zustand. Manifest und Icons sind **Route Handler unter dem Modul**, alle fünf mit
    `lagerbuchHostOderNull` als erster Anweisung.

---

## 3. Datei-Eigentümerschaft — mechanisch prüfbar

Jede Datei gehört genau einem Task. Wer in einer fremden Datei arbeitet, hat den Schnitt verlassen.
Pfade ohne Präfix liegen unter `src/app/m/lagerbuch/`.

| Datei | Task |
|---|---|
| `_lib/barcode.ts`, `_lib/barcode.test.ts` | T62 |
| `_lib/actionTypen.ts`, `_lib/actionTypen.test.ts` | T63 |
| `_ui/helfer.module.css` | T64 |
| `_lib/bauform.test.ts` | T64 (**Ergänzung**) und T87 (**Verschärfung**) — Teil 2, T21 hat sie angelegt |
| `_lib/pwaIcons.ts`, `_lib/pwaIcons.test.ts` | T65 |
| `_lib/schreibpfade/tokenEinloesung.ts`, `_lib/schreibpfade/tokenEinloesung.test.ts` | T66 |
| `_ui/Restzeit.tsx`, `_ui/Restzeit.test.tsx` | T67 |
| `_ui/Stepper.tsx`, `_ui/Stepper.test.tsx` | T68 |
| `_ui/OeffentlicherRahmen.tsx`, `_ui/LeerZustand.tsx`, `_ui/rahmen.test.tsx` | T69 |
| `_ui/HelferChip.tsx`, `_ui/HelferChip.test.tsx` | T70 |
| `_ui/ArtikelSuche.tsx`, `_ui/ArtikelSuche.test.tsx` | T71 |
| `_ui/BarcodeScanner.tsx`, `_ui/BarcodeScanner.test.tsx` | T72 |
| `_actions/gate.ts`, `_actions/gate.test.ts` | T73 |
| `_actions/sitzung.ts`, `_actions/sitzung.test.ts` | T74 |
| `_actions/check.ts`, `_actions/check.test.ts` | T75 |
| `_ui/HelferRahmen.tsx`, `_ui/HelferRahmen.test.tsx` | T76 |
| `_ui/Gate.tsx`, `_ui/Gate.test.tsx` | T77 |
| `_ui/Entnahme.tsx`, `_ui/Entnahme.test.tsx` | T78 |
| `_ui/CheckFlow.tsx`, `_ui/CheckFlow.test.tsx` | T79 |
| `_ui/FahrzeugWahl.tsx`, `_ui/FahrzeugWahl.test.tsx` | T80 |
| `page.tsx` (das Gate), `page.test.tsx` | T81 |
| `t/[code]/route.ts`, `t/[code]/route.test.ts` | T82 |
| `a/[artikelId]/page.tsx`, `a/[artikelId]/page.test.tsx` | T83 |
| `helfer/layout.tsx`, `helfer/page.tsx`, `helfer/page.test.tsx` | T84 |
| `helfer/check/page.tsx`, `helfer/check/page.test.tsx` | T85 |
| `manifest.webmanifest/route.ts`, `pwa-icon.svg/route.ts`, `icon-192.png/route.ts`, `icon-512.png/route.ts`, `icon-maskable-512.png/route.ts`, `pwa.route.test.ts` | T86 |
| — (nur Ausführung, Verschärfung und Protokoll) | T87 |

**Kein `core`-Eingriff in diesem Teil.** Die drei `core`-Dateien des Vorhabens sind vergeben:
`core/shell/icons.ts` (Teil 1, T2), `core/bootstrap.ts` (Teil 1, T8 und Teil 2), und
`core/shell/shell.module.css` — die `.modulnav`-Reparatur aus Entscheidung 31 gehört **Teil 5**,
nicht diesem Plan. Teil 1s Abschlusstabelle nennt sie irrtümlich als „Teil 4"; sie betrifft die
**Verwaltungs**-Navigation, und dieser Zweig hat gar keine (§7.1.1).

### 3.1 ⚠️ Vier Dateien, die §7 beschreibt und die diesem Plan NICHT gehören

Spec §7 schreibt sie aus, und wer die Kapitelgrenze mit der Plangrenze verwechselt, legt sie ein
zweites Mal an. **Die Eigentümertabellen der Teile 2 und 6 sind älter und binden.**

| Datei | Eigentümer | Beleg | Was dieser Plan tut |
|---|---|---|---|
| `_lib/returnTo.ts` — `sanitizeReturnTo` | **Teil 2, T19** | Festlegung G6: „`returnTo.ts` ist zwingend hier, weil `adminLandingPfad` es aufruft" | **konsumiert** — T81, T82, T83 |
| `_lib/tokenZiel.ts` — `tokenZielPfad` | **Teil 2, T19** | dieselbe Festlegung: „acht Zeilen, und der Alternativzustand — Teil 4 erfindet es neu — ist genau die Doppelung, gegen die die Eigentümertabelle gebaut ist" | **konsumiert** — T73, T82 |
| `_lib/code.ts` — `normalisiereCode` | **Teil 2, T17** | Produces-Block nennt die drei Konsumenten namentlich, **alle in Teil 4** | **konsumiert** — T73, T74, T82 |
| `abmelden/route.ts` | **Teil 2, T26** | Produces: „die äußere Route `/abmelden` … Einziger Aufrufer: `requireHelferSitzung` (T25) — als **String**, nicht als Import" | **berührt sie nicht** |

⚠️ **`abmelden/route.ts` und `_actions/sitzung.ts#beenden` sind kein Doppel.** Sie lösen zwei
verschiedene Lagen, und beide werden gebraucht:

- **`/abmelden` (Route Handler, Teil 2)** ist der Weg für den **Sperr- und den Ablauffall**.
  `requireHelferSitzung` läuft aus `helfer/layout.tsx`, und das ist eine **Server Component**: dort
  ist `cookies()` versiegelt, `delete` wirft (`next/…/request-cookies.js:53` trägt den Satz „Cookies
  can only be modified in a Server Action or Route Handler" wörtlich). Ein Layout kann das Cookie
  also nicht räumen und leitet auf den Handler um.
- **`beenden` (Server Action, T74)** ist der Weg für den **Knopf** im Rahmenkopf. Eine Server Action
  **darf** Cookies setzen, und ein Knopf, der über einen `GET`-Handler ginge, wäre ein Link — und
  damit vorlade- und prefetch-fähig. Ein Prefetch, der die Sitzung beendet, ist genau die Sorte
  Fehler, die niemand reproduziert.

### 3.2 ⚠️ Drei Bausteine, die Teil 5 baut und die dieser Plan NICHT benutzen kann

Nicht aus Geschmack, sondern aus **Reihenfolge**: Teil 5 läuft nach Teil 4. Eine Datei, die es noch
nicht gibt, lässt sich nicht importieren, und ein Import mit Einlöser in einem anderen Plan ist genau
der Platzhalter, den dieser Plan verbietet.

| Baustein | Teil 5 | Was dieser Plan stattdessen tut |
|---|---|---|
| `_ui/ikonen.tsx` (36-Namen-Union) | T101, Festlegung H6 | **E3**: jede Datei trägt ihre Zeichen als lokales Inline-`<svg>`, `aria-hidden="true"`, `focusable="false"`, **immer neben Text**. Benannter Einlöser: T101 hebt sie. Kein Test dieses Plans sichert ein SVG-`d`-Attribut zu — die Hebung ist ein reiner Import-Tausch |
| `_ui/Plakette.tsx` (Zifferblatt) | T107 | **T78** rendert die FEFO-Zeile mit `HelferChip` und `fmtVerfall(c.verfall)` als Text. Vollständig und geprüft; die Plakette kann später **additiv** danebentreten. ⚠️ Der Konsument existiert zu T107s Zeitpunkt bereits — die Datei heißt `_ui/Entnahme.tsx` (§2.1, Zeile 358) |
| `_ui/Chip.tsx` (Verwaltungs-Chip) | T105 | **T70** baut `_ui/HelferChip.tsx`. Zwei Chips sind kein Versehen (E4): die beiden Ansichtsklassen haben verschiedene Stylesheets, und ein geteilter Chip zöge `verwaltung.module.css` in den Helfer-Zweig |

### 3.3 ⚠️ `_ui/helfer.module.css` wird auch von der VERWALTUNG gelesen

Das ist die eine Datei dieses Plans, deren Reichweite über die Ansichtsklasse hinausgeht, und §7.13.3
führt sie ausdrücklich unter „was dieses Kapitel für andere festlegt": `_ui/BarcodeScanner.tsx`
(T72) rendert auf **`/verwaltung/geraete/scan`** und **`/verwaltung/bz/scan`** (Teil 5, T138) — dort
ist das Trägerelement `.modul` aus `verwaltung.module.css`, nicht `.rahmen`.

**Daraus folgt eine harte Regel für T64 und T72, und sie ist still, wenn man sie bricht:**

- **Jede Regel, die der Scanner benutzt, greift ausschließlich auf `var(--lb-*)` zurück** — nie auf
  einen Wert, der nur unter `.rahmen` existiert. Beide Träger deklarieren denselben Variablensatz
  (T64 hier, T100 dort); die Klassen kommen aus `helfer.module.css`, die **Werte** vom jeweils
  darüberliegenden Träger.
- **Deshalb trägt `.rahmen` NICHT nur die acht `--lb-ampel-*` aus E8**, sondern den vollständigen
  Neutralensatz: `--lb-rot`, `--lb-rot-dk`, `--lb-rot-bg`, `--lb-tinte`, `--lb-stahl`, `--lb-linie`,
  `--lb-papier`, `--lb-karte`, `--lb-gelb`, `--lb-gelb-bg`, `--lb-ok`, `--lb-ok-bg` (die zwölf
  Hexwerte aus `lagerbuch/src/app/globals.css:4-15`, zeichengleich mit `core/theme/tokens.ts:14-25`)
  plus `--lb-display`, `--lb-body`, `--lb-mono`.
- **Ein Scanner, der eine Farbe aus `--ant-color-primary` zöge, wäre ein Knopf ohne Hintergrund** —
  gültiges CSS, still transparent (Falle 2, §7.6.4). Repo-weit ist das ohnehin gesperrt
  (`core/shell/shell-css.test.ts:97-98`).

---

## 4. Gates am Ende jeder Wellenstufe

```bash
pnpm typecheck        # muss grün sein
pnpm lint             # Fehler blockieren, Warnungen nicht
pnpm vitest run       # muss grün sein
pnpm build            # muss grün sein
```

**Was diese vier Gates strukturell NICHT sehen** (§7.12.5) — und wer die Aussage stattdessen besitzt:

| Fehler | Warum kein Gate greift | Wer ihn fängt |
|---|---|---|
| `startsWith` statt Prop in einer Aktivmarkierung | typkorrekter String-Vergleich; am Bildschirm sieht eine fehlende Markierung nicht kaputt aus, sondern unaufmerksam | **T64** (Quelltext-Scan `usePathname`) · **T76** (DOM) · **T171 in Teil 6** (unter dem Rewrite) |
| `--ant-*` im Inline-Style des Taschenlampenknopfs | gültiges CSS, still transparent | **T64** (Scan über `_ui/`) |
| `domain` in `helferCookieOptionen` | Cookie-Attribute sind Laufzeitwerte; gegen **einen** Host verhält sich domain-weit wie host-only | **Teil 2, T22** |
| Ein `font:`-Kurzschreibweise-Feld unter 16px | `core/theme/feldschrift.test.ts` liest nur die Langform | **T64** |
| `revalidatePath` mit äußerem statt innerem Pfad | ein Pfad, der nichts trifft, wirft nicht | **T75** (Zusicherung auf die sechs Pfade) |
| Ein Action-Aufruf ohne `catch` | typkorrekt; der Ausfall ist ein Netzereignis | **T78** und **T79** (DOM, geworfener Fehler ⇒ „Keine Verbindung") |
| **Ein `requireHelferSchreibend`-Ergebnis, das niemand auswertet** | der Riegel gibt seit §3.4.4 zurück statt zu werfen | **T75** (Unit gegen einen gesperrten Token) · **T171 in Teil 6** (E2E) |
| Die Kamera überhaupt | in keinem Gate prüfbar | niemand — `e2e/bz-scan.spec.ts:10` tippt manuell ein; T72 prüft die **vier Zustände**, nicht die Kamera |
| 96px Überlauf gegen `100dvh` (Falle 41) | `documentElement.scrollWidth` allein sieht ihn nicht | **T87** (Abrufprobe, 390×844 **und** 1280×720) |

**`pnpm exec playwright test` ist in Teil 4 nicht fällig**, weil dieser Plan keine Spec-Datei
schreibt (E11). Fällig ist stattdessen die **Abrufprobe gegen einen laufenden Dev-Server** in T87 —
sie ist der einzige Punkt, an dem dieser Plan eine gerenderte Seite sieht.

---

## Welle 1 — Reine Werte, das Stylesheet und die Scans (4 Tasks, alle parallel)

Diese vier Tasks berühren einander nicht. **T62 ist der früheste Schritt überhaupt** — Teil 6, T164
(`g/[code]/page.tsx`) hängt daran, und es ist die einzige Reihenfolgebindung dieses Plans nach außen.

---

### Task 62: `_lib/barcode.ts` — die eine Normalisierung, und die fünfte Lesestelle

**Files:**
- Create: `src/app/m/lagerbuch/_lib/barcode.ts`
- Test: `src/app/m/lagerbuch/_lib/barcode.test.ts`

**Interfaces:**
- Consumes: nichts. Die Datei hat **keinen** Import.
- Produces:
  ```ts
  export function normalisiereBarcode(roh: string): string;
  ```
  **Fünf Konsumenten, drei davon außerhalb dieses Plans:** die Kamera-Rückgabe und das manuelle Feld
  in `_ui/BarcodeScanner.tsx` (T72, **dieser Plan**), `_actions/geraete.ts#geraetZuBarcode` und
  `_actions/bz.ts#geraetZuBarcode` (Teil 5, T121/T122) und `g/[code]/page.tsx` (Teil 6, T164).
  ⚠️ **`normalisiereBarcode` ist laut teil6.md:4424 „die einzige Reihenfolgebindung dieses Plans nach
  außen"** — ohne sie reicht `/g` seinen Routen-Parameter roh durch.
- ⚠️ **Der Cutover-Import muss dieselbe Funktion benutzen** (§4.8, §7.6.2). Sie ist damit auch die
  Zusage, dass ein am Cutover importierter Barcode und ein am Gerät gescannter denselben Wert
  ergeben.

**Der Befund (§7.6.2).** Die Anwendung normalisiert heute **konsistent** — Schreibweg
`z.string().trim().optional()` (`actions/geraete.ts:17`, `actions/bz.ts:15`), Leseweg `code.trim()`
(`geraete.ts:70`) — mit **einer** Ausnahme: `g/[code]/page.tsx:29,31` reicht den Routen-Parameter
**roh** durch. Der Abgleich ist binär: `geraete.ts:77` und `bz.ts:120` vergleichen auf Gleichheit
gegen Spalten **ohne `COLLATE`** (Falle 29). Ein Aufkleber, dessen QR mit einem Leerzeichen oder
einem `%0A` endet, findet sein Gerät damit auf **vier** von fünf Wegen und auf dem fünften nicht.

**Und der `/g/`-Zweig ist keine Kosmetik.** Ein außerhalb der Anwendung gedruckter Aufkleber trägt
eine **vollständige URL** mit der damals gültigen Domain. Wird er **in** der App gescannt, zählt nur
das Segment — so überlebt der Aufkleber einen Domainwechsel (Falle 30). Wird er mit der
**Systemkamera** gescannt, öffnet er die aufgedruckte Domain, und die ist nach dem Cutover tot; das
ist Runbook-Eingabe 4 aus §7.13.4 und **keine** Codefrage.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/barcode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalisiereBarcode } from "./barcode";

describe("normalisiereBarcode — der Vertrag mit der Aussenwelt", () => {
  it("trimmt einen rohen Code", () => {
    // Der Abgleich ist binaer: `geraete.ts:77` und `bz.ts:120` vergleichen auf
    // Gleichheit gegen Spalten OHNE COLLATE (Falle 29).
    expect(normalisiereBarcode("  SN-1  ")).toBe("SN-1");
    expect(normalisiereBarcode("SN-1\n")).toBe("SN-1");
    expect(normalisiereBarcode("\tSN-1")).toBe("SN-1");
  });

  it("zieht das Segment aus einem /g/<code>-Deep-Link — deshalb ueberlebt ein Aufkleber einen Domainwechsel", () => {
    expect(normalisiereBarcode("https://alt.example/g/SN-1")).toBe("SN-1");
    expect(normalisiereBarcode("https://lagerbuch.iuk-ue.de/g/SN-1")).toBe("SN-1");
    expect(normalisiereBarcode("http://192.168.1.5:3000/g/SN-1")).toBe("SN-1");
  });

  it("dekodiert das Segment — ein Schraegstrich in der Seriennummer ueberlebt", () => {
    // Ohne decodeURIComponent suchte der Abgleich nach „SN%2F1" und faende nie.
    expect(normalisiereBarcode("https://alt.example/g/SN%2F1")).toBe("SN/1");
    expect(normalisiereBarcode("https://alt.example/g/SN%20A")).toBe("SN A");
  });

  it("schneidet Query und Fragment ab — sie gehoeren nicht zum Code", () => {
    expect(normalisiereBarcode("https://alt.example/g/SN-1?utm=qr")).toBe("SN-1");
    expect(normalisiereBarcode("https://alt.example/g/SN-1#oben")).toBe("SN-1");
  });

  it("trimmt AUCH das Ergebnis aus dem Deep-Link", () => {
    // Ein %20 am Ende des Segments waere sonst ein unsichtbarer Nichttreffer.
    expect(normalisiereBarcode("https://alt.example/g/SN-1%20")).toBe("SN-1");
  });

  it("laesst einen Wert ohne /g/ unveraendert (nur getrimmt)", () => {
    // Hersteller-EANs und CODE_128-Seriennummern kommen ohne jede URL herein.
    expect(normalisiereBarcode("4006381333931")).toBe("4006381333931");
    expect(normalisiereBarcode(" 4006381333931 ")).toBe("4006381333931");
    expect(normalisiereBarcode("https://alt.example/a/V1StGXR8")).toBe("https://alt.example/a/V1StGXR8");
  });

  it("aendert die GROSS-/KLEINSCHREIBUNG NICHT", () => {
    // Anders als `normalisiereCode` (Teil 2, T17): dort ist der Wertebereich sechs
    // ZIFFERN, hier ist er eine fremde Seriennummer. Ein toUpperCase() machte aus
    // einem gespeicherten „sn-1" einen Nichttreffer — und die Spalte hat kein COLLATE.
    expect(normalisiereBarcode("sn-1")).toBe("sn-1");
    expect(normalisiereBarcode("https://alt.example/g/sn-1")).toBe("sn-1");
  });

  it("ist idempotent — zweimal angewandt aendert nichts", () => {
    // Der Cutover-Import ruft sie (§4.8), der Scanner ruft sie, die Action ruft sie.
    // Drei Anwendungen auf denselben Wert duerfen nicht driften.
    const roh = "https://alt.example/g/SN%2F1 ";
    expect(normalisiereBarcode(normalisiereBarcode(roh))).toBe(normalisiereBarcode(roh));
  });

  it("wirft NIE — auch nicht bei kaputtem Prozentzeichen", () => {
    // `decodeURIComponent("%")` wirft URIError. Ein Wurf hier waere ein Absturz
    // mitten im Scannen, ausgeloest von einem fremd gedruckten Aufkleber.
    expect(() => normalisiereBarcode("https://alt.example/g/SN%")).not.toThrow();
    expect(normalisiereBarcode("https://alt.example/g/SN%")).toBe("SN%");
  });

  it("liefert den leeren String fuer leere Eingabe", () => {
    expect(normalisiereBarcode("")).toBe("");
    expect(normalisiereBarcode("   ")).toBe("");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/barcode.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./barcode"`.

- [ ] **Schritt 3: `_lib/barcode.ts` schreiben**

```ts
/**
 * Rohwert (Kamera, Tippfeld, Routen-Parameter, Cutover-Import) → Wert fuer den
 * Abgleich. §7.6.2, 1:1 aus der Spec mit einer benannten Haerte (siehe unten).
 *
 * KEIN "use client": die Datei liegt unter `_lib/` und wird aus Server Actions,
 * aus einer Server Component (`g/[code]/page.tsx`) UND aus einer Client-Insel
 * (`_ui/BarcodeScanner.tsx`) importiert. Ein WERT aus einem "use client"-Modul
 * kaeme in einer Server Component als Client-Referenz an — HTTP 500, und weder
 * `pnpm build` noch Vitest sehen es (Falle 6).
 *
 *  1. QR mit `/g/<code>`-Deep-Link: nur das Segment zaehlt. Deshalb ueberlebt so
 *     ein Aufkleber einen Domainwechsel — sofern IN der App gescannt (Falle 30).
 *     Mit der SYSTEMKAMERA gescannt oeffnet er die aufgedruckte Domain; das ist
 *     Runbook-Eingabe 4 (§7.13.4) und keine Codefrage.
 *  2. Sonst getrimmt: der Abgleich ist binaer, die Spalten haben kein COLLATE
 *     (`geraete.ts:77`, `bz.ts:120`, Falle 29).
 *
 * WAS SIE BEWUSST NICHT TUT: kein `toUpperCase()`. Anders als `normalisiereCode`
 * (Teil 2, T17), dessen Wertebereich sechs ZIFFERN sind, ist der Wert hier eine
 * fremde Seriennummer. Ein Grossbuchstaben-Zwang machte aus einem gespeicherten
 * "sn-1" einen Nichttreffer — und die Spalte hat kein COLLATE, das ihn rettete.
 *
 * DER CUTOVER-IMPORT MUSS DIESELBE FUNKTION BENUTZEN (§4.8). Sonst findet ein am
 * Gaeraet gescannter Barcode seine importierte Zeile nicht, und das Symptom ist
 * „das Geraet ist nicht im System" — nicht „der Import war falsch".
 */
export function normalisiereBarcode(roh: string): string {
  const treffer = roh.match(/\/g\/([^/?#]+)/);
  if (!treffer) return roh.trim();
  // `decodeURIComponent` wirft URIError bei kaputtem Prozentzeichen ("%", "%ZZ").
  // Ein Wurf waere hier ein Absturz mitten im Scannen, ausgeloest von einem
  // fremd gedruckten Aufkleber, den niemand kontrolliert hat. Der Rueckfall ist
  // das UNDEKODIERTE Segment — schlechter als der richtige Wert, aber besser als
  // eine Fehlerseite, und der Nichttreffer sagt es der Person ausdruecklich.
  try {
    return decodeURIComponent(treffer[1]).trim();
  } catch {
    return treffer[1].trim();
  }
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/barcode.test.ts
```

Erwartet: PASS, 10 Zusicherungen.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/barcode.ts src/app/m/lagerbuch/_lib/barcode.test.ts
git commit -m "feat(lagerbuch): _lib/barcode.ts — die eine Normalisierung fuer fuenf Lesestellen

Der Abgleich laeuft binaer gegen Spalten ohne COLLATE (geraete.ts:77,
bz.ts:120). Vier von fuenf Lesestellen trimmen heute; g/[code]/page.tsx:29,31
reicht den Routen-Parameter roh durch — ein Aufkleber mit angehaengtem
Leerzeichen findet sein Geraet dort nicht, und das Symptom heisst 'nicht im
System'.

Der /g/-Zweig ist der Grund, warum ein ausserhalb gedruckter Aufkleber einen
Domainwechsel ueberlebt, wenn er IN der App gescannt wird. decodeURIComponent
laeuft in try/catch: ein kaputtes Prozentzeichen auf fremdem Papier darf keinen
Absturz mitten im Scannen ausloesen.

Kein toUpperCase — anders als normalisiereCode ist der Wertebereich hier eine
fremde Seriennummer, und die Spalte hat kein COLLATE, das den Fall rettete.

Teil 6, T164 (/g/<code>) haengt an dieser Datei — die einzige
Reihenfolgebindung jenes Plans nach aussen."
```

---

### Task 63: `_lib/actionTypen.ts` — die eine Form, in der eine Helfer-Action antwortet

**Files:**
- Create: `src/app/m/lagerbuch/_lib/actionTypen.ts`
- Test: `src/app/m/lagerbuch/_lib/actionTypen.test.ts`

**Interfaces:**
- Consumes: `_lib/helferZugang.ts` (Teil 2, T25) — **nur der Typ** `SperrGrund = "sitzung" | "gesperrt"`,
  als `import type` (kein Laufzeit-Zyklus).
- Produces:
  ```ts
  // _lib/actionTypen.ts — KEIN "use client" (Falle 6).
  export type HelferGrund = SperrGrund | "leer" | "netz";      // "sitzung" | "gesperrt" | "leer" | "netz"

  export type HelferErgebnis<T> =
    | { ok: true; wert: T }
    | { ok: false; grund: HelferGrund; text: string };

  /** Die beiden Riegeltexte — server-seitig, aus `SperrGrund`. */
  export const RIEGEL_TEXTE: Readonly<Record<SperrGrund, string>>;
  /** Der Text fuer `gebucht === 0`; er nennt den Artikel beim Namen. */
  export function leerText(artikelName: string): string;
  /** Die ZWEI Netztexte — sie sagen Verschiedenes und werden nie getauscht. */
  export const NETZ_TEXT_BUCHUNG: string;
  export const NETZ_TEXT_CHECK: string;
  /** `true`, wenn der Abschlussbereich das Erneuerungsfeld zeigen darf (§7.4.4). */
  export function darfErneuern(grund: HelferGrund): boolean;
  ```
  Konsumenten: `_actions/check.ts` (T75), `_ui/Entnahme.tsx` (T78), `_ui/CheckFlow.tsx` (T79) — und
  **Teil 5, T114** (`_actions/buchung.ts#bucheEntnahmeHelfer`).

⚠️ **`HelferGrund` wird NICHT als eigene Literal-Union geschrieben** (Teil 2, Festlegung G7,
wörtlich): `import type { SperrGrund } from "./helferZugang";` und
`export type HelferGrund = SperrGrund | "leer" | "netz";`. Zwei getrennte Unions für dieselben zwei
Wörter wären genau die Typinkonsistenz, gegen die die `Produces`-Blöcke geschrieben sind — und der
Bruch wäre still: `requireHelferSchreibend` gäbe `"gesperrt"` zurück, die Action reichte es in ein
Feld, das `"gesperrt"` nicht kennt, und TypeScript fiele es erst auf, wenn jemand einen dritten
Sperrgrund einführt.

⚠️ **Die Datei liegt bewusst NICHT unter `_actions/`** (§7.3): der Guard-Scan aus §3.8.2 liest **jede**
Datei dort und erwartet exportierte Actions. Eine Typ- und Textdatei bräuchte dort eine Ausnahme, und
eine Ausnahme in einem Scan, dessen ganze Zusage die **Vollständigkeit** ist, ist die teuerste Zeile,
die man ihm hinzufügen kann.

**Warum die Texte hier stehen und nicht in den Actions.** Vier Gründe, und der letzte ist der
tragende: sie stehen in §7.3 als **eine** Tabelle; ein Text, den zwei Actions unabhängig formulieren,
läuft auseinander; die Client-Inseln brauchen `NETZ_TEXT_*` und dürfen dafür keine `"use server"`-Datei
importieren; und **`"netz"` entsteht ausschließlich im Client** — es gäbe serverseitig gar keine
Stelle, an der der Text natürlich wohnte.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/actionTypen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  RIEGEL_TEXTE, leerText, NETZ_TEXT_BUCHUNG, NETZ_TEXT_CHECK, darfErneuern,
  type HelferErgebnis, type HelferGrund,
} from "./actionTypen";

const QUELLE = "src/app/m/lagerbuch/_lib/actionTypen.ts";

describe("HelferGrund — der geschlossene Satz aus §7.3", () => {
  it("hat genau vier Werte, und die Typzusicherung haelt sie fest", () => {
    // Ein `satisfies` statt `as`: `as` schwiege, wenn ein Wert wegfiele.
    const alle = ["sitzung", "gesperrt", "leer", "netz"] satisfies HelferGrund[];
    expect(new Set(alle).size).toBe(4);
  });

  it("leitet die geteilte Haelfte aus SperrGrund ab statt sie abzuschreiben (G7)", () => {
    // Der Bruch waere still: `requireHelferSchreibend` gaebe "gesperrt" zurueck,
    // die Action reichte es in eine Union, die es nicht kennt, und TypeScript
    // faende es erst beim dritten Sperrgrund.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/import type \{ SperrGrund \} from "\.\/helferZugang";/);
    expect(q).toMatch(/export type HelferGrund = SperrGrund \| "leer" \| "netz";/);
    expect(q).not.toMatch(/HelferGrund =\s*"sitzung"/);
  });
});

describe("RIEGEL_TEXTE — die zwei serverseitigen Saetze, wortgleich mit §7.3", () => {
  it("sitzung: nennt das Kaertchen UND die Zusage, dass Eingaben stehenbleiben", () => {
    expect(RIEGEL_TEXTE.sitzung).toBe(
      "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
    );
  });

  it("gesperrt: sagt AUSDRUECKLICH, dass nichts gespeichert wurde", () => {
    // Der teuerste Zustand dieser Tabelle ist ein 200, das luegt. Wer hier
    // „bitte erneut versuchen" schreibt, schickt die Helferin in eine Schleife,
    // die ein erneutes Einloesen desselben Codes genauso wenig aufloest.
    expect(RIEGEL_TEXTE.gesperrt).toBe(
      "Dieses Kärtchen wurde gesperrt. Die Buchung wurde nicht gespeichert.",
    );
  });

  it("hat genau zwei Eintraege — `leer` und `netz` stehen NICHT hier", () => {
    // `leer` braucht den Artikelnamen, `netz` entsteht nie serverseitig.
    expect(Object.keys(RIEGEL_TEXTE).sort()).toEqual(["gesperrt", "sitzung"]);
  });
});

describe("leerText — der Zustand, der heute als Erfolg aussieht", () => {
  it("nennt den Artikel beim Namen und schickt zur Verwaltung", () => {
    // Heute macht HelferEntnahme.tsx:26-27 aus {gebucht: 0} ein gruenes
    // „Entnahme gebucht: 0 × X" mit Haekchen (:55, `chip chip-ok`).
    expect(leerText("Kompresse 10×10")).toBe(
      "Im Handlager liegt nichts mehr von Kompresse 10×10. Bitte der Verwaltung melden.",
    );
  });

  it("kommt auch mit einem leeren Namen ohne doppelte Leerzeichen aus", () => {
    expect(leerText("")).not.toMatch(/ {2}/);
  });
});

describe("Die zwei Netztexte sagen VERSCHIEDENES und werden nie getauscht", () => {
  it("Buchung: kurz, weil eine Entnahme ein Handgriff ist", () => {
    expect(NETZ_TEXT_BUCHUNG).toBe("Keine Verbindung. Die Buchung wurde nicht gespeichert.");
  });

  it("Check: nennt ausdruecklich, dass nichts verloren ist", () => {
    // Ein Fahrzeug-Check ist zehn bis zwanzig Minuten Arbeit, und der gesamte
    // Zustand liegt im Client. „Nicht gespeichert" ohne den Nachsatz liest sich
    // wie „alles weg" — und genau dann laedt jemand die Seite neu.
    expect(NETZ_TEXT_CHECK).toBe(
      "Keine Verbindung. Der Check wurde nicht gespeichert — nichts ist verloren, " +
      "bitte erneut auf Abschließen tippen.",
    );
  });

  it("sind nicht derselbe String", () => {
    expect(NETZ_TEXT_BUCHUNG).not.toBe(NETZ_TEXT_CHECK);
  });
});

describe("darfErneuern — §7.4.4, und warum `gesperrt` KEIN Feld bekommt", () => {
  it("nur `sitzung` darf erneuern", () => {
    expect(darfErneuern("sitzung")).toBe(true);
  });

  it("`gesperrt` darf NICHT — ein erneutes Einloesen desselben Codes scheitert genauso", () => {
    // Ein Feld anzubieten, das nicht helfen kann, ist schlimmer als keins.
    expect(darfErneuern("gesperrt")).toBe(false);
  });

  it("`leer` und `netz` duerfen nicht — beide haben nichts mit der Sitzung zu tun", () => {
    expect(darfErneuern("leer")).toBe(false);
    expect(darfErneuern("netz")).toBe(false);
  });
});

describe("HelferErgebnis — die Form, nicht der Inhalt", () => {
  it("traegt im Erfolgsfall `wert` und KEINEN Text", () => {
    const e: HelferErgebnis<{ gebucht: number }> = { ok: true, wert: { gebucht: 3 } };
    expect(e.ok && e.wert.gebucht).toBe(3);
    expect("text" in e).toBe(false);
  });

  it("traegt im Fehlerfall Grund UND Text — nie nur den Grund", () => {
    // Der Grund steuert die Anzeige (Erneuerungsfeld ja/nein), der Text ist das,
    // was die Person liest. Ein Ergebnis mit Grund und ohne Text zwaenge jede
    // Insel, die Tabelle aus §7.3 ein zweites Mal zu fuehren.
    const e: HelferErgebnis<null> = { ok: false, grund: "gesperrt", text: RIEGEL_TEXTE.gesperrt };
    expect(e.ok).toBe(false);
    expect(!e.ok && e.text.length).toBeGreaterThan(0);
  });
});

describe("Bauform", () => {
  it("traegt KEIN \"use client\" — sie exportiert WERTE fuer Server Components (Falle 6)", () => {
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/"use client"/);
  });

  it("traegt den Kommentar, der die Erzeugerstelle von `netz` benennt", () => {
    // Ohne ihn sucht der naechste Leser sie im Server und findet sie nie.
    expect(readFileSync(QUELLE, "utf8")).toMatch(/netz.*nie serverseitig|nie serverseitig.*netz/is);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/actionTypen.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./actionTypen"`.

- [ ] **Schritt 3: `_lib/actionTypen.ts` schreiben**

```ts
import type { SperrGrund } from "./helferZugang";

/**
 * Die EINE Form, in der eine Helfer-Action antwortet — §7.3.
 *
 * KEIN "use client" (Falle 6): die Datei exportiert WERTE (`RIEGEL_TEXTE`,
 * `NETZ_TEXT_*`), und `_actions/check.ts` ist eine Server-Datei. Aus einem
 * "use client"-Modul bekaeme sie eine Client-Referenz statt des Wertes — HTTP
 * 500 fuer die ganze Seite, und Vitest sieht es strukturell nicht.
 *
 * SIE LIEGT BEWUSST NICHT UNTER `_actions/`: der Guard-Scan aus §3.8.2 liest
 * JEDE Datei dort und erwartet exportierte Actions. Eine Typ- und Textdatei
 * braeuchte dort eine Ausnahme — und eine Ausnahme in einem Scan, dessen ganze
 * Zusage die VOLLSTAENDIGKEIT ist, ist die teuerste Zeile, die man ihm geben
 * kann.
 *
 * DAS GRUNDMUSTER (Falle 66): jede ERWARTBARE Fehlerlage ist ein
 * Rueckgabewert, kein Wurf. Der Produktions-Deserialisierer hat fuer eine
 * Fehlerzeile genau einen Zweig (`resolveErrorProd`) und baut einen festen
 * ENGLISCHEN Satz mit `digest`; `e.message` erreicht in Produktion niemanden.
 * Die 22 deutschen Texte in `lagerbuch/src/actions/*` sind fachlich richtig und
 * betrieblich wirkungslos.
 *
 * DER WURF BLEIBT DEM RIEGELFALL VORBEHALTEN — dort, wo die Lage nicht
 * „erwartbar", sondern „manipuliert" heisst: die vier
 * Zugehoerigkeitspruefungen in `checkAbschluss` (§7.3) und
 * `requireLagerbuchHost`.
 */

/**
 * FESTLEGUNG G7 (Teil 2): die geteilte Haelfte wird ABGELEITET, nicht
 * abgeschrieben. `SperrGrund` ist "sitzung" | "gesperrt" und gehoert
 * `_lib/helferZugang.ts`; zwei getrennte Literal-Unions fuer dieselben zwei
 * Woerter waeren genau die Typinkonsistenz, gegen die die Produces-Bloecke
 * geschrieben sind — und der Bruch waere still.
 */
export type HelferGrund = SperrGrund | "leer" | "netz";

export type HelferErgebnis<T> =
  | { ok: true; wert: T }
  | { ok: false; grund: HelferGrund; text: string };

/**
 * ⚠️ `"netz"` ENTSTEHT NIE SERVERSEITIG. Es ist der Grund, den der Client im
 * `catch` selbst setzt, damit die Anzeigelogik genau EINE Form kennt. Ohne
 * diesen Satz sucht der naechste Leser die Erzeugerstelle im Server und findet
 * sie nie.
 */

/** Die zwei Saetze, die der Server schreibt — wortgleich mit §7.3. */
export const RIEGEL_TEXTE: Readonly<Record<SperrGrund, string>> = {
  sitzung: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
  gesperrt: "Dieses Kärtchen wurde gesperrt. Die Buchung wurde nicht gespeichert.",
} as const;

/**
 * `gebucht === 0` ist ausdruecklich ein FEHLER, kein Erfolg (§7.3). Heute gibt
 * `fefoAbbuchung` bei leerem Handlager `{gebucht: 0}` zurueck
 * (`db/abbuchung.ts:24-54` wirft nie), und `HelferEntnahme.tsx:26-27` macht
 * daraus „Entnahme gebucht: 0 × X" — GRUEN, MIT HAEKCHEN (`:55`,
 * `chip chip-ok`). Ein 200, das luegt, ist der teuerste Zustand der Tabelle.
 */
export function leerText(artikelName: string): string {
  return `Im Handlager liegt nichts mehr von ${artikelName}. Bitte der Verwaltung melden.`.replace(
    / {2,}/g,
    " ",
  );
}

/** Entnahme: ein Handgriff, ein Satz. */
export const NETZ_TEXT_BUCHUNG = "Keine Verbindung. Die Buchung wurde nicht gespeichert.";

/**
 * Check: der Nachsatz ist tragend. Ein Fahrzeug-Check ist zehn bis zwanzig
 * Minuten Arbeit, und der gesamte Zustand liegt im Client
 * (`CheckFlow.tsx:62-71`: sechs `useState`). „Nicht gespeichert" ohne den
 * Nachsatz liest sich wie „alles weg" — und genau dann laedt jemand neu.
 */
export const NETZ_TEXT_CHECK =
  "Keine Verbindung. Der Check wurde nicht gespeichert — nichts ist verloren, " +
  "bitte erneut auf Abschließen tippen.";

/**
 * §7.4.4: Bei `"sitzung"` zeigt der Abschlussbereich AN ORT UND STELLE ein
 * Zahlenfeld — die einzige Antwort auf „Sitzung weg nach 15 Minuten Zaehlen",
 * die die Arbeit nicht verwirft.
 *
 * Bei `"gesperrt"` erscheint es NICHT: ein erneutes Einloesen desselben Codes
 * scheitert genauso, und ein Feld anzubieten, das nicht helfen kann, ist
 * schlimmer als keins.
 */
export function darfErneuern(grund: HelferGrund): boolean {
  return grund === "sitzung";
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/actionTypen.test.ts
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/actionTypen.ts src/app/m/lagerbuch/_lib/actionTypen.test.ts
git commit -m "feat(lagerbuch): _lib/actionTypen.ts — Rueckgabewerte statt Wuerfe (Falle 66)

Der Produktions-Deserialisierer baut fuer jede Fehlerzeile einen festen
englischen Satz mit digest; e.message erreicht in Produktion niemanden. Die 22
deutschen Texte des Bestands sind fachlich richtig und betrieblich wirkungslos.

Vier Gruende, eine Form. HelferGrund wird aus SperrGrund ABGELEITET (Teil 2,
G7) — zwei Unions fuer dieselben zwei Woerter waeren eine stille
Typinkonsistenz. Die Texte stehen hier, weil §7.3 sie als EINE Tabelle fuehrt
und weil 'netz' ausschliesslich im Client entsteht: serverseitig gaebe es
keine Stelle, an der der Text natuerlich wohnte.

darfErneuern trennt 'sitzung' (Feld zeigen, Arbeit bleibt stehen) von
'gesperrt' (kein Feld — ein erneutes Einloesen desselben Codes scheitert
genauso).

Nicht unter _actions/: der Guard-Scan liest dort jede Datei und erwartet
Actions; eine Ausnahme in einem Scan, dessen Zusage die Vollstaendigkeit ist,
ist die teuerste Zeile, die man ihm geben kann."
```

---

### Task 64: `_ui/helfer.module.css` und die fünf Scans — das Stylesheet und seine Riegel

**Files:**
- Create: `src/app/m/lagerbuch/_ui/helfer.module.css`
- Modify: `src/app/m/lagerbuch/_lib/bauform.test.ts` (Teil 2, T21 hat sie angelegt — **anfügen, nicht ersetzen**)

**Interfaces:**
- Consumes: nichts zur Laufzeit. Die Werte stammen aus `lagerbuch/src/app/globals.css:4-15`
  (zwölf Hexwerte, zeichengleich mit `core/theme/tokens.ts:14-25`) und aus §6.6.2
  (`AMPEL_HELL`/`AMPEL_DUNKEL`, acht Namen).
- Produces:
  ```css
  /* _ui/helfer.module.css — die EINE Modul-CSS-Datei des Helfer-Wegs. */
  .rahmen           /* Träger ALLER --lb-* und --lb-ampel-* Variablen; 100dvh, max-width 560px */
  .streifen .kopf .marke .markeAkzent .etikett .restzeit .restzeitWarnt .beenden
  .inhalt .tableiste .tab .oeffentlichInhalt
  .gate .gateBalken .gateMarke .gateUnter .gateKarten .gateKarte .codefeld .gateFehler .gateHinweis
  .karte .kartePad .karteTitel .zeile .zeileHaupt .zeileName .zeileMeta .fach .fussnote
  .schirmKopf .rueckweg .bestandsZahl .mengenChip
  .chip .ok .gelb .rot .grau
  .stepper .stepTaste .stepWert .stepAnzeige
  .schritte .schritt .schrittAktiv .schrittFertig .schrittNr .fachKopf
  .pruefKreis .pruefKreisOk .pruefKreisFehl .verfallZeile .nfZeile .nfGeholt
  .abschluss .abschlussInfo .abschlussGo .warnkasten
  .scanKarte .scanVideo .scanStrich .lampe .lampeAn .feldZeile .feld
  .knopf .knopfRot .knopfTinte .knopfGeist .suchfeld .leer .leerWeg
  ```
  Konsumenten: **jede** `_ui/`-Datei dieses Plans und die beiden Seiten
  `verwaltung/(arbeit)/geraete/scan` und `verwaltung/(arbeit)/bz/scan` aus **Teil 5, T138** —
  über `_ui/BarcodeScanner.tsx` (§3.3).
- Produces zusätzlich: **fünf Zusicherungen** in `_lib/bauform.test.ts`, alle in **Eigenschaftsform**
  (eine fehlende Datei ist kein Fehlschlag). Ihre Zähne bekommen sie, sobald die Dateien entstehen.

⚠️ **Die Erweiterung von `_lib/bauform.test.ts` ist von Teil 2 ausdrücklich zugewiesen** (T21,
Produces): „Teil 4 ERWEITERT diese Datei um den `usePathname`-Scan (§7.8.2) und **verschärft** die
Weichen-Zeile … Es entsteht **keine zweite Scan-Datei**." Die **Verschärfung** ist nicht dieser Task,
sondern **T87** — sie behauptet die **Existenz** von Dateien, die erst in Welle 7 entstehen, und ein
Scan mit Existenzpflicht in Welle 1 wäre am ersten Tag rot und würde abgeschaltet statt repariert
(E9).

**Warum `.rahmen` den vollständigen Variablensatz trägt und nicht nur die Ampel** (§3.3). E8 nennt
die acht `--lb-ampel-*`. Das reicht nicht: `_ui/BarcodeScanner.tsx` rendert **auch** auf den beiden
Verwaltungs-Scanseiten, wo `.modul` aus `verwaltung.module.css` der Träger ist. Damit dieselben
Klassen unter **beiden** Trägern auflösen, deklarieren beide denselben Satz. Fehlte hier eine
Neutrale, wäre der Scanner auf dem Helfer-Ast **still ungestylt** — eine nicht auflösbare
CSS-Variable ist gültiges CSS und fällt auf `transparent` zurück (Falle 2).

**Warum NULL Media Queries** (§7.7.1). Eine Ansicht, die es nur in **einer** Fassung gibt, kann keinen
zweiten Breakpoint einführen. Der Rahmen ist fluid mit einer Obergrenze; auf 1280px steht er mittig
und trägt die Tab-Leiste weiterhin unten — dieselbe Oberfläche, keine „Desktop-Fassung". `100dvh`
statt `100vh` ist der Grund, warum die Leiste unter einer eingeblendeten Adressleiste nicht
verschwindet. ⚠️ lagerbuch schaltet heute bei **760px** (`globals.css:250`, die einzige
Breiten-Media-Query des Moduls) — derselbe Fehler wie `feedback.css` mit 600px bis 2026-07-27, und
an beiden Enden unsichtbar.

⚠️ **Die Schrittfolge dieses Tasks ist umgestellt, und der Grund gehört hierher.** Die fünf Scans aus
§7.12.2 stehen in **Eigenschaftsform** — sie sind grün, **solange die Datei fehlt**. Stünden sie in
Schritt 1, wäre Schritt 2 („er muss FEHLSCHLAGEN") **grün**, und ein Umsetzer, der die Liste wörtlich
abarbeitet, meldete an dieser Stelle einen kaputten Task. **Deshalb steht der Rotlauf zuerst:**
Schritt 1 schreibt die **Existenz**-Zusicherungen dieses Tasks, Schritt 2 sieht sie **rot**, Schritt 3
hängt die fünf Scans an (sie bleiben grün — das ist der Punkt der Eigenschaftsform), und **Schritt 4
legt das Stylesheet an, das Schritt 1 verlangt.**

- [ ] **Schritt 1: Die Existenz-Zusicherungen für DIESEN Task schreiben**

Ans **Ende** von `src/app/m/lagerbuch/_lib/bauform.test.ts` — die vorhandenen Scans aus Teil 2
bleiben unverändert stehen. Die Hilfen `MODULWURZEL`, `alleDateien` und `lies` stammen von dort; ist
ein Name in der vorhandenen Datei anders geschrieben, wird **der vorhandene benutzt** und nicht ein
zweiter eingeführt:

```ts
import { join } from "node:path";
const HELFER_CSS = join(MODULWURZEL, "_ui/helfer.module.css");
```

```ts
describe("Teil 4, T64 — das Stylesheet des Helfer-Wegs existiert und traegt seinen Variablensatz", () => {
  /**
   * DIESE Zusicherungen sind NICHT in Eigenschaftsform: sie sind der Rotlauf
   * von T64 selbst. `helfer.module.css` entsteht in DIESEM Task, nicht spaeter.
   *
   * Die fuenfzehn Neutralen stehen hier und nicht nur die acht Ampelwerte (E8),
   * weil `_ui/BarcodeScanner.tsx` AUCH unter `.modul` rendert (Teil 5, T138):
   * beide Traeger muessen denselben Satz fuehren, sonst ist der Scanner auf
   * einem der beiden Aeste still ungestylt.
   */
  const NEUTRALE = [
    "--lb-rot", "--lb-rot-dk", "--lb-rot-bg", "--lb-tinte", "--lb-stahl", "--lb-linie",
    "--lb-papier", "--lb-karte", "--lb-gelb", "--lb-gelb-bg", "--lb-ok", "--lb-ok-bg",
    "--lb-display", "--lb-body", "--lb-mono",
  ];

  it("die Datei existiert", () => {
    expect(existsSync(HELFER_CSS)).toBe(true);
  });

  it("`.rahmen` traegt alle fuenfzehn Neutralen", () => {
    const css = readFileSync(HELFER_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const hell = css.slice(0, css.indexOf('[data-theme="dark"]'));
    expect(hell).toMatch(/\.rahmen\s*\{/);
    for (const name of NEUTRALE) {
      expect(hell, `${name} fehlt unter .rahmen`).toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it("schaltet ueber `data-theme`, nicht ueber `prefers-color-scheme`", () => {
    // `prefers-color-scheme` braeche den Fall „System dunkel, Umschalter hell"
    // — die Suite fuehrt den Modus im Cookie `iuk-theme` und stempelt ihn
    // serverseitig auf <html data-theme> (src/app/layout.tsx).
    const css = readFileSync(HELFER_CSS, "utf8");
    expect(css).toMatch(/:root\[data-theme="dark"\]\s+\.rahmen/);
    expect(css).not.toMatch(/prefers-color-scheme:\s*dark/);
  });

  it("setzt `100dvh` und `max-width: 560px` — kein Breakpoint, eine Obergrenze", () => {
    const css = readFileSync(HELFER_CSS, "utf8");
    expect(css).toMatch(/height:\s*100dvh/);
    expect(css).toMatch(/max-width:\s*560px/);
  });

  it("erhoeht die Suite-Untergrenze im Verfallsfeld auf 18px und senkt sie NIE", () => {
    // §7.7.2 Punkt 2: die Einzeiligkeit wird aufgegeben, nicht die
    // Schriftgroesze. `.verfallZeile input` (0,1,1) ueberstimmt
    // `input {font-size:16px}` (0,0,1) regulaer — nach OBEN.
    const css = readFileSync(HELFER_CSS, "utf8");
    expect(css).toMatch(/\.verfallZeile\s+input\s*\{[^}]*font-size:\s*18px/);
    expect(css).toMatch(/\.verfallZeile\s+input\s*\{[^}]*min-height:\s*56px/);
  });

  it("gibt jeder Stepper-Flaeche 56px — das Suite-Tap-Mass", () => {
    // core/theme/tokens.ts:33 setzt TAP = 56 mit der Begruendung „Bedienung mit
    // Handschuhen … eine Einsatzanforderung, keine Stilfrage". lagerbuch liegt
    // heute bei 42×42 (globals.css:73) bzw. 30×30 in der sm-Variante (:75).
    const css = readFileSync(HELFER_CSS, "utf8");
    expect(css).toMatch(/\.stepTaste\s*\{[^}]*width:\s*56px/);
    expect(css).toMatch(/\.stepTaste\s*\{[^}]*height:\s*56px/);
    expect(css).not.toMatch(/\.stepper\.sm|\.stepperSm/);
  });

  it("setzt `tabular-nums` an den drei Ziffernstellen", () => {
    // Im ganzen lagerbuch-Repo kommt die Eigenschaft NULL Mal vor; die
    // Ausrichtung haengt heute allein an IBM Plex Mono. Auf dem Helfer-Weg
    // werden Ziffern VERGLICHEN — Soll gegen Ist, Bestand, Druck in bar.
    const css = readFileSync(HELFER_CSS, "utf8");
    for (const klasse of ["stepWert", "bestandsZahl", "mengenChip"]) {
      expect(css, `${klasse} ohne tabular-nums`).toMatch(
        new RegExp(`\\.${klasse}\\s*\\{[^}]*font-variant-numeric:\\s*tabular-nums`),
      );
    }
  });

  it("behaelt den `prefers-reduced-motion`-Zweig des Scanstrichs", () => {
    // Die einzige Animation des Wegs, und sie hat den Zweig heute schon
    // (globals.css:158-160). Ihn beim Portieren zu verlieren ist eine
    // Verschlechterung, die niemand meldet.
    expect(readFileSync(HELFER_CSS, "utf8"))
      .toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it("setzt Fokus mit `outline-offset` und nirgends `outline: none` ohne Ersatz", () => {
    const css = readFileSync(HELFER_CSS, "utf8");
    expect(css).toMatch(/:focus-visible[^{]*\{[^}]*outline-offset/);
    expect(css).not.toMatch(/outline:\s*none/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Erwartet: **FAIL** mit `expected false to be true` an „die Datei existiert" und acht Folgefehlern
`ENOENT: no such file or directory, open '…/_ui/helfer.module.css'`.

- [ ] **Schritt 3: Die fünf Scans aus §7.12.2 und §7.8.2 ANHÄNGEN**

Ebenfalls ans Ende derselben Datei. Sie bleiben in **Eigenschaftsform** — sie laufen über den
**ganzen** Modulbaum, und dort fehlen noch Dateien, die spätere Wellen anlegen. **Sie sind nach
diesem Schritt grün, und das ist kein Mangel:** ihre Zähne bekommen sie, sobald ihr Subjekt entsteht.
Der Rotlauf dieses Tasks liegt in Schritt 2 und ist bereits gefahren.

```ts
// ————————————————————————————————————————————————————————————————————————
// TEIL 4 (§7.12.2, §7.8.2) — fuenf Scans, alle in EIGENSCHAFTSFORM.
//
// Eigenschaftsform heisst: eine fehlende Datei ist KEIN Fehlschlag. Ein Scan,
// der am ersten Tag rot ist, wird abgeschaltet statt repariert — genau der
// Fehler, gegen den Teil 2 diese Datei ueberhaupt so gebaut hat. Die
// VERSCHAERFUNG auf „diese Dateien existieren" ist namentlich T87 (Abnahme).
// ————————————————————————————————————————————————————————————————————————

const HELFER_CSS = join(MODULWURZEL, "_ui/helfer.module.css");

/** Alle `.css` unter dem Modulbaum — NICHT nur `_ui/*.module.css`. */
function alleModulCss(): string[] {
  return alleDateien(MODULWURZEL).filter((p) => p.endsWith(".css"));
}

/** Kommentare weg, At-Regel-Klammern aufloesen. */
function cssRegeln(quelle: string): { selektor: string; koerper: string }[] {
  const css = quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@[a-z-]+[^{;]*\{/gi, "");
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((t) => ({
    selektor: t[1].trim(),
    koerper: t[2],
  }));
}

describe("§7.7.1 — der eine Breakpoint, und dieses Modul erfindet keinen zweiten", () => {
  it("`_ui/helfer.module.css` enthaelt KEINE `@media (max-width`", () => {
    // jsdom wertet Media Queries nicht aus; nur ein Quelltext-Scan besitzt die
    // Aussage. Eine Ansicht, die es nur in EINER Fassung gibt, kann keinen
    // zweiten Breakpoint einfuehren.
    if (!existsSync(HELFER_CSS)) return;
    expect(readFileSync(HELFER_CSS, "utf8")).not.toMatch(/@media[^{]*max-width/i);
  });

  it("jede `max-width`-Abfrage im ganzen Modulbaum schreibt 767.98", () => {
    // 767.98 und nicht 768: bei exakt 768px gelten sonst BEIDE Seiten, und die
    // Reihenfolge im Stylesheet entscheidet. Der Scan laeuft ueber ALLE .css
    // unter m/lagerbuch/** — nicht nur `_ui/*.module.css`, sonst fiele
    // `(druck)/druck.css` heraus (§6.10.2). lagerbuch schaltet heute bei 760px
    // (globals.css:250); derselbe Fall, an beiden Enden unsichtbar.
    const verstoesse: string[] = [];
    for (const pfad of alleModulCss()) {
      for (const t of readFileSync(pfad, "utf8").matchAll(/max-width:\s*([\d.]+)px/gi)) {
        // `max-width` als LAYOUT-Eigenschaft (z. B. `.rahmen{max-width:560px}`)
        // ist kein Breakpoint. Gemeint sind nur Media-Abfragen.
        const davor = readFileSync(pfad, "utf8").slice(0, t.index ?? 0);
        if (!/@media[^{]*$/i.test(davor.slice(-80))) continue;
        if (t[1] !== "767.98") verstoesse.push(`${pfad}: max-width: ${t[1]}px`);
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

describe("§7.7.4 / Falle 2 — kein `--ant-` ausserhalb eines antd-Baums", () => {
  it("keine `_ui/*.module.css` nennt `--ant-`", () => {
    // antd deklariert seine Variablen auf SEINER Scope-Klasse, nicht auf :root.
    // Eigenes Markup sieht sie nie — und eine nicht aufloesbare CSS-Variable ist
    // GUELTIGES CSS und faellt still auf `transparent` zurueck.
    const verstoesse = alleModulCss()
      .filter((p) => p.includes("/_ui/") && readFileSync(p, "utf8").includes("--ant-"));
    expect(verstoesse).toEqual([]);
  });

  it("keine `_ui/*.tsx` nennt `--ant-` in einem Inline-Style", () => {
    // Der Taschenlampenschalter faerbt sich per Inline-Style (§7.6.4). Wer beim
    // Portieren `var(--rot)` reflexartig durch `var(--ant-color-primary)`
    // ersetzt, bekommt einen Knopf OHNE Hintergrundfarbe — still.
    const verstoesse = alleDateien(join(MODULWURZEL, "_ui"))
      .filter((p) => p.endsWith(".tsx") && !p.endsWith(".test.tsx"))
      .filter((p) => readFileSync(p, "utf8").includes("--ant-"));
    expect(verstoesse).toEqual([]);
  });
});

describe("§7.7.2 — die Lueke in `core/theme/feldschrift.test.ts`, modul-lokal geschlossen", () => {
  /**
   * Das Suite-Gate liest NUR die Langform `font-size:` und filtert auf
   * Selektoren, die `input|textarea|select` nennen. Drei zu kleine Felder des
   * Bestands kommen dadurch DURCH: `.input` mit `font:500 14px …`
   * (globals.css:80), `.combo-input` (:83) und `.stepper.sm .stepval` mit 15px
   * (:76) — obwohl `.stepval` (Stepper.tsx:52) ein echtes `<input>` IST.
   *
   * Wer den gruenen Suite-Test als bestandene Pruefung liest, portiert drei zu
   * kleine Felder in eine Anwendung OHNE Zoom (`maximumScale: 1`,
   * `userScalable: false`). Die 16px-Untergrenze und der gesperrte Zoom sind
   * ausdruecklich EINE Regel.
   *
   * Deshalb zwei Erweiterungen gegenueber dem Suite-Gate:
   *   1. auch die `font:`-KURZSCHREIBWEISE wird gelesen;
   *   2. die FELDKLASSEN dieses Moduls zaehlen als Feld, obwohl ihr Selektor
   *      das Wort „input" nicht enthaelt.
   */
  const FELDKLASSEN = /\b(input|textarea|select)\b|\.(codefeld|stepWert|suchfeld|feld|verfallZeile)\b/;

  it("keine Feldregel unter 16px — Langform UND Kurzschreibweise", () => {
    const verstoesse: string[] = [];
    for (const pfad of alleModulCss().filter((p) => p.includes("/_ui/"))) {
      for (const { selektor, koerper } of cssRegeln(readFileSync(pfad, "utf8"))) {
        if (!FELDKLASSEN.test(selektor)) continue;
        const lang = /font-size:\s*([\d.]+)px/.exec(koerper);
        // Kurzschreibweise: `font: 700 20px/1 var(--lb-display)` — die Groesse
        // ist der erste px-Wert nach optionalen Stil-/Gewichtsangaben.
        const kurz = /font:\s*[^;]*?([\d.]+)px/.exec(koerper);
        for (const treffer of [lang, kurz]) {
          if (treffer && Number(treffer[1]) < 16) {
            verstoesse.push(`${pfad}: ${selektor} -> ${treffer[1]}px`);
          }
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

describe("§7.1 — die Ansichtsklasse wird nicht still unterlaufen", () => {
  it("keine Datei unter `_ui/` importiert `antd` oder `@ant-design/icons`, ausser den Verwaltungsbausteinen", () => {
    // `core/shell/icons.test.ts:147-171` faengt repo-weit NUR die Icons. Ein
    // `import { Card } from "antd"` in `_ui/Entnahme.tsx` waere typkorrekt,
    // lint-sauber, gebaut — und heraus kaeme eine Verwaltungsanmutung auf einem
    // Telefon, plus 96px Ueberlauf gegen 100dvh (Falle 41).
    //
    // AUSNAHMELISTE: die Verwaltungsbausteine aus Teil 5 leben im selben Ordner
    // und DUERFEN antd. Die Liste ist namentlich, nicht gemustert — ein
    // Praefix-Muster liesse die naechste Datei durch, die zufaellig so heisst.
    const VERWALTUNG = new Set([
      "Chip.tsx", "Plakette.tsx", "SeitenKopf.tsx", "Brotkrume.tsx", "Kachel.tsx",
      "Suchfeld.tsx", "Trefferanzeige.tsx", "LoeschDialog.tsx", "LoeschButton.tsx",
      "VerwaltungsRahmen.tsx", "ArtikelDrawer.tsx", "DruckRahmen.tsx",
    ]);
    const verstoesse: string[] = [];
    for (const pfad of alleDateien(join(MODULWURZEL, "_ui"))) {
      if (!pfad.endsWith(".tsx") && !pfad.endsWith(".ts")) continue;
      if (pfad.endsWith(".test.tsx") || pfad.endsWith(".test.ts")) continue;
      if (VERWALTUNG.has(pfad.split("/").pop()!)) continue;
      const q = readFileSync(pfad, "utf8");
      if (/from\s+"antd(\/|")|from\s+"@ant-design\/icons/.test(q)) verstoesse.push(pfad);
    }
    expect(verstoesse).toEqual([]);
  });

  it("KEINE Datei im Modul importiert `lucide-react`", () => {
    // Der Alt-Bestand importiert es in JEDER Datei dieses Zweigs; die Suite hat
    // es gar nicht im Baum. Ein Import scheiterte an der Aufloesung — aber erst
    // im Build, nicht im Review, und die naheliegende „Reparatur" ist dann,
    // lucide zu INSTALLIEREN statt die Zeile zu streichen.
    const verstoesse = alleDateien(MODULWURZEL)
      .filter((p) => /\.tsx?$/.test(p) && readFileSync(p, "utf8").includes("lucide-react"));
    expect(verstoesse).toEqual([]);
  });
});

describe("§7.8.2 / Falle 63 — `usePathname` kommt im Modul GAR NICHT vor", () => {
  it("kein `usePathname` unter `src/app/m/lagerbuch/`", () => {
    // `core/routing.ts:54-67` behandelt bereits praefixierte Pfade eigens und
    // schliesst `/m/*` bewusst NICHT aus dem Matcher aus. Auf diesem zweiten Weg
    // beginnt `/m/lagerbuch/helfer/check` nicht mit `/helfer/check`, und die
    // Tab-Leiste markierte dauerhaft „Entnahme" — auch im Fahrzeug-Check.
    //
    // Der Server kennt das Segment ohnehin. `HelferRahmen` bekommt es als Prop.
    // Dieser Scan ist der einzige, der das VOR dem E2E sieht; er ist billig und
    // faengt die Zeile, bevor sie geschrieben wird.
    const verstoesse = alleDateien(MODULWURZEL)
      .filter((p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p))
      .filter((p) => readFileSync(p, "utf8").includes("usePathname"));
    expect(verstoesse).toEqual([]);
  });

  it("kein `useSearchParams`, kein `router.push`/`router.replace` auf dem Helfer-Ast", () => {
    // §7.8.2 Punkt 6: `useSearchParams` hat in lagerbuch NULL Konsumenten; der
    // Filterzustand wird serverseitig als `searchParams`-Prop gelesen. Die
    // Fahrzeugwahl wird ein <Link> (§7.9.1), kein Client-Schreiber. Damit
    // entsteht die Suspense-Falle rund um `useSearchParams` auf diesem Ast gar
    // nicht — solange es so bleibt.
    const AST = ["_ui", "helfer", "a", "t"].map((d) => join(MODULWURZEL, d));
    const verstoesse: string[] = [];
    for (const wurzel of AST.filter((d) => existsSync(d))) {
      for (const pfad of alleDateien(wurzel)) {
        if (!/\.tsx?$/.test(pfad) || /\.test\.tsx?$/.test(pfad)) continue;
        const q = readFileSync(pfad, "utf8");
        // Die Verwaltungsbausteine im selben `_ui/`-Ordner duerfen beides.
        if (/\/(Suchfeld|Trefferanzeige|useUrlFilter|LoeschDialog|ArtikelDrawer)\./.test(pfad)) continue;
        if (/useSearchParams|router\.(push|replace)/.test(q)) verstoesse.push(pfad);
      }
    }
    expect(verstoesse).toEqual([]);
  });
});
```

- [ ] **Schritt 4: `_ui/helfer.module.css` schreiben**

```css
/*
 * DAS STYLESHEET DES HELFER-WEGS — §7.7, oeffentliche Ansichtsklasse
 * (Entscheidung 28 d). Kein antd, keine Suite-Shell, eigene Anmutung.
 *
 * NULL MEDIA QUERIES fuer die Breite (§7.7.1). Eine Ansicht, die es nur in
 * EINER Fassung gibt, kann keinen zweiten Breakpoint einfuehren. Der Rahmen ist
 * fluid mit einer OBERGRENZE; auf 1280px steht er mittig und traegt die
 * Tab-Leiste weiterhin unten. Waere hier je eine noetig, hiesse sie
 * `max-width: 767.98px` — nicht 768, sonst gelten bei exakt 768px beide Seiten
 * und die Reihenfolge im Stylesheet entscheidet. lagerbuch schaltet heute bei
 * 760px (globals.css:250); derselbe Fall, an beiden Enden unsichtbar.
 * Die einzige Media Query hier ist `prefers-reduced-motion` — das ist keine
 * Breitenabfrage.
 *
 * `.rahmen` IST DER TRAEGER ALLER VARIABLEN. `_ui/verwaltung.module.css`
 * (Teil 5, T100) traegt unter `.modul` DENSELBEN Satz, weil
 * `_ui/BarcodeScanner.tsx` auf BEIDEN Aesten rendert (§3.3, §7.13.3). Eine
 * Regel dieser Datei greift deshalb NIE auf einen Wert zu, den nur einer der
 * beiden Traeger kennt — und NIE auf `--ant-*`: antd deklariert seine
 * Variablen auf SEINER Scope-Klasse, eigenes Markup sieht sie nicht, und eine
 * nicht aufloesbare Variable ist gueltiges CSS und faellt still auf
 * `transparent` zurueck (Falle 2).
 */

.rahmen {
  /* Die zwoelf Neutralen — zeichengleich mit lagerbuch/src/app/globals.css:4-15
     und mit core/theme/tokens.ts:14-25. */
  --lb-rot: #c8000f;
  --lb-rot-dk: #a2000c;
  --lb-rot-bg: #fbe9eb;
  --lb-tinte: #1a1d20;
  --lb-stahl: #5b6570;
  --lb-linie: #d9dde1;
  --lb-papier: #eef0f1;
  --lb-karte: #ffffff;
  --lb-gelb: #b26a00;
  --lb-gelb-bg: #fbf1dc;
  --lb-ok: #1e7a3c;
  --lb-ok-bg: #e4f2e9;

  /* Die acht Ampelwerte aus §6.6.2 — die fachsemantische Palette, luminanz-
     monoton ueber ok -> gelb -> rot. `grau` steht AUSSERHALB der Rangfolge und
     traegt „kein Datum gepflegt" / „keine Messung"; er darf NIE als gruen
     dargestellt werden. `_lib/ampel.test.ts` (Teil 5, T100) scannt genau diese
     Zeilen — ein Scan ueber nur `verwaltung.module.css` liesze die Haelfte
     driften (§6.6.2, Punkt 4). */
  --lb-ampel-ok-text: #1e7a3c;
  --lb-ampel-ok-flaeche: #e4f2e9;
  --lb-ampel-gelb-text: #8a5200;
  --lb-ampel-gelb-flaeche: #fbf1dc;
  --lb-ampel-rot-text: #8c0d16;
  --lb-ampel-rot-flaeche: #f6e3e0;
  --lb-ampel-grau-text: #5b6570;
  --lb-ampel-grau-flaeche: #e7eaec;

  --lb-display: var(--font-display), "Arial Narrow", sans-serif;
  --lb-body: var(--font-body), system-ui, sans-serif;
  --lb-mono: var(--font-mono), ui-monospace, monospace;

  width: 100%;
  max-width: 560px;            /* kein Breakpoint — eine Obergrenze */
  margin-inline: auto;
  height: 100dvh;              /* NICHT 100vh: sonst verschwindet die Tab-Leiste
                                  unter einer eingeblendeten Adressleiste */
  display: flex;
  flex-direction: column;
  background: var(--lb-papier);
  color: var(--lb-tinte);
  font-family: var(--lb-body);
  overflow: hidden;
}

/*
 * Der Moduswechsel laeuft ueber `<html data-theme>` (Cookie `iuk-theme`,
 * serverseitig gelesen, src/app/layout.tsx) — NICHT ueber
 * `prefers-color-scheme`. Das braeche den Fall „System dunkel, Umschalter
 * hell", und der Umschalter ist die Zusage der Suite, nicht das System.
 */
:root[data-theme="dark"] .rahmen {
  --lb-rot: #ff5a5f;
  --lb-rot-dk: #d13b40;
  --lb-rot-bg: #2a1113;
  --lb-tinte: #e8eaec;
  --lb-stahl: #9aa4ad;
  --lb-linie: #2c3238;
  --lb-papier: #14181b;
  --lb-karte: #1c2126;
  --lb-gelb: #d9a032;
  --lb-gelb-bg: #2a1e05;
  --lb-ok: #7ee0a0;
  --lb-ok-bg: #10261a;

  --lb-ampel-ok-text: #7ee0a0;
  --lb-ampel-ok-flaeche: #10261a;
  --lb-ampel-gelb-text: #d9a032;
  --lb-ampel-gelb-flaeche: #2a1e05;
  --lb-ampel-rot-text: #e8837c;
  --lb-ampel-rot-flaeche: #2a1113;
  --lb-ampel-grau-text: #9aa4ad;
  --lb-ampel-grau-flaeche: #1c2024;
}

/* ——— Rahmen, Kopf, Tab-Leiste ——— */
.streifen { height: 5px; background: var(--lb-rot); flex: none }
.kopf {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 11px 14px 9px;
  background: var(--lb-karte); border-bottom: 1px solid var(--lb-linie);
}
.marke { font-family: var(--lb-display); font-weight: 700; font-size: 20px; letter-spacing: .07em }
.markeAkzent { color: var(--lb-rot) }
.etikett { font-size: 12px; color: var(--lb-stahl); margin-top: 1px }
.restzeit { font-size: 12px; color: var(--lb-stahl) }
.restzeitWarnt { color: var(--lb-ampel-gelb-text); font-weight: 600 }
.beenden {
  font-size: 13px; font-weight: 600; border: 1.5px solid var(--lb-linie);
  background: var(--lb-karte); border-radius: 99px; padding: 8px 14px;
  color: var(--lb-stahl); display: inline-flex; align-items: center; gap: 5px;
  min-height: 44px;
}
.inhalt { flex: 1; overflow-y: auto; padding: 14px 14px 18px; -webkit-overflow-scrolling: touch }
.tableiste { flex: none; display: flex; background: var(--lb-karte); border-top: 1px solid var(--lb-linie) }
.tab {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 9px 2px 8px; color: var(--lb-stahl); border-top: 2.5px solid transparent;
  text-decoration: none; font-family: var(--lb-display); font-weight: 600;
  font-size: 11px; letter-spacing: .09em; text-transform: uppercase; min-height: 56px;
}
/* Die KLASSE folgt aus `aria-current`, nicht umgekehrt (§7.8.2 Punkt 4).
   Damit prueft der E2E dieselbe Sache, die die Bildschirmleserin hoert. */
.tab[aria-current="page"] { color: var(--lb-rot); border-top-color: var(--lb-rot) }

/* ——— Öffentlicher Rahmen: Träger OHNE Kopf und OHNE Tab-Leiste ———
   Er steht unter derselben `.rahmen`-Klasse und erbt damit denselben
   Variablensatz. Ein zweiter Träger mit eigener Variablenliste wäre der Ort,
   an dem Gate und Helfer-Zweig farblich auseinanderlaufen. */
.oeffentlichInhalt { flex: 1; overflow-y: auto; display: flex; flex-direction: column }

/* ——— Gate (Modulwurzel) ———
   KEIN eigenes `min-height`/`background`: es liegt in `.oeffentlichInhalt`
   innerhalb von `.rahmen`, und `.rahmen` hat `overflow: hidden` — ein
   `min-height: 100dvh` würde dort auf schmalen Geräten abgeschnitten statt zu
   scrollen. */
.gate {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 26px 18px;
}
.gateBalken { width: 52px; height: 5px; background: var(--lb-rot); border-radius: 3px; margin-bottom: 12px }
.gateMarke { font-family: var(--lb-display); font-weight: 700; font-size: 36px; letter-spacing: .07em }
.gateUnter { color: var(--lb-stahl); font-size: 14px; margin-top: 3px }
.gateKarten {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(272px, 1fr));
  gap: 14px; width: 100%; max-width: 680px; margin-top: 26px;
}
.gateKarte {
  background: var(--lb-karte); border: 1px solid var(--lb-linie); border-radius: 16px;
  padding: 18px 16px; display: flex; flex-direction: column; gap: 12px;
}
/*
 * Das Zahlenfeld. 24px statt der heutigen 21 (§7.7.2 Punkt 1) — deutlich ueber
 * der 16px-Untergrenze, weil sechs Ziffern auf einem Handy in einer
 * Fahrzeughalle abgelesen und getippt werden.
 */
.codefeld {
  width: 100%; border: 1.5px solid var(--lb-linie); border-radius: 10px; padding: 12px;
  font: 700 24px/1 var(--lb-mono); letter-spacing: .16em; text-align: center;
  text-transform: uppercase; background: var(--lb-karte); color: var(--lb-tinte);
  min-height: 56px; font-variant-numeric: tabular-nums;
}
.gateFehler { color: var(--lb-ampel-rot-text); font-size: 13px; font-weight: 600 }
.gateHinweis { color: var(--lb-stahl); font-size: 13px }

/* ——— Bausteine ——— */
.karte { background: var(--lb-karte); border: 1px solid var(--lb-linie); border-radius: 14px; overflow: hidden }
.karte + .karte { margin-top: 10px }
.kartePad { padding: 13px 14px }
.karteTitel {
  font-family: var(--lb-display); font-weight: 600; font-size: 14px; letter-spacing: .09em;
  text-transform: uppercase; color: var(--lb-stahl); padding: 11px 14px 0;
}
.zeile {
  display: flex; align-items: center; gap: 11px; width: 100%; text-align: left;
  padding: 12px 14px; border-top: 1px solid var(--lb-linie); color: inherit; text-decoration: none;
}
.zeile:first-child { border-top: none }
.zeileHaupt { flex: 1; min-width: 0 }
.zeileName { font-weight: 600; font-size: 15px; line-height: 1.25 }
.zeileMeta { display: flex; align-items: center; gap: 7px; margin-top: 5px; flex-wrap: wrap; font-size: 13px; color: var(--lb-stahl) }
.fach {
  font-family: var(--lb-mono); font-size: 12px; font-weight: 600;
  border: 1.5px solid var(--lb-tinte); border-radius: 5px; padding: 1px 6px;
  background: var(--lb-karte); white-space: nowrap;
}
.fussnote { font-size: 13px; color: var(--lb-stahl); line-height: 1.5 }
.schirmKopf {
  font-family: var(--lb-display); font-weight: 700; font-size: 17px; letter-spacing: .08em;
  text-transform: uppercase; color: var(--lb-stahl); margin: 2px 2px 10px;
}
.rueckweg {
  display: inline-flex; align-items: center; gap: 5px; margin-bottom: 12px;
  font-size: 14px; font-weight: 600; border: 1.5px solid var(--lb-linie);
  background: var(--lb-karte); border-radius: 99px; padding: 10px 14px;
  color: var(--lb-stahl); text-decoration: none; min-height: 44px;
}
.bestandsZahl {
  font-family: var(--lb-display); font-weight: 700; font-size: 36px; line-height: 1.05;
  font-variant-numeric: tabular-nums;
}
.mengenChip {
  font-family: var(--lb-display); font-weight: 700; font-size: 20px; line-height: 1;
  text-align: right; font-variant-numeric: tabular-nums;
}

/* ——— Chip (§5.17: EINE Abbildung AmpelTon -> Klasse, keine Interpolation) ——— */
.chip {
  display: inline-flex; align-items: center; gap: 4px; border-radius: 99px;
  padding: 2.5px 9px; font-size: 12px; font-weight: 600; white-space: nowrap;
}
.ok { color: var(--lb-ampel-ok-text); background: var(--lb-ampel-ok-flaeche) }
.gelb { color: var(--lb-ampel-gelb-text); background: var(--lb-ampel-gelb-flaeche) }
.rot { color: var(--lb-ampel-rot-text); background: var(--lb-ampel-rot-flaeche) }
.grau { color: var(--lb-ampel-grau-text); background: var(--lb-ampel-grau-flaeche) }

/* ——— Stepper (§7.7.3, Entscheidung 33 d) — EINE Groesse, 56px ——— */
.stepper {
  display: flex; align-items: center; border: 1.5px solid var(--lb-linie);
  border-radius: 12px; background: var(--lb-karte); flex: none;
}
.stepTaste { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; color: var(--lb-tinte) }
.stepWert {
  min-width: 56px; height: 56px; text-align: center; background: transparent; border: 0;
  font: 700 20px/1 var(--lb-display); font-variant-numeric: tabular-nums; padding: 0;
  color: var(--lb-tinte);
}
.stepAnzeige {
  min-width: 56px; height: 56px; display: flex; align-items: center; justify-content: center;
  font: 700 20px/1 var(--lb-display); font-variant-numeric: tabular-nums; color: var(--lb-tinte);
}

/* ——— Fahrzeug-Check ——— */
.schritte { display: flex; gap: 8px; margin: 0 2px 14px }
.schritt {
  flex: 1; display: flex; align-items: center; gap: 8px; padding: 9px 11px;
  border: 1.5px solid var(--lb-linie); border-radius: 11px; background: var(--lb-karte);
  font-weight: 600; font-size: 13px; color: var(--lb-stahl);
}
.schrittNr {
  width: 22px; height: 22px; border-radius: 99px; background: var(--lb-linie);
  color: var(--lb-stahl); display: flex; align-items: center; justify-content: center;
  font-family: var(--lb-display); font-size: 13px; flex: none;
}
.schrittAktiv { border-color: var(--lb-tinte); color: var(--lb-tinte) }
.schrittAktiv .schrittNr { background: var(--lb-tinte); color: var(--lb-karte) }
.schrittFertig .schrittNr { background: var(--lb-ampel-ok-text); color: var(--lb-karte) }
.fachKopf {
  font-family: var(--lb-display); font-weight: 600; font-size: 13px; letter-spacing: .1em;
  text-transform: uppercase; color: var(--lb-stahl); margin: 15px 2px 7px;
}
.pruefKreis {
  width: 30px; height: 30px; border-radius: 99px; border: 2px solid var(--lb-linie);
  flex: none; display: flex; align-items: center; justify-content: center; background: var(--lb-karte);
}
.pruefKreisOk { background: var(--lb-ampel-ok-text); border-color: var(--lb-ampel-ok-text); color: var(--lb-karte) }
.pruefKreisFehl { background: var(--lb-ampel-rot-flaeche); border-color: var(--lb-ampel-rot-text); color: var(--lb-ampel-rot-text) }

/*
 * §7.7.2 Punkt 2: Das Verfallsfeld VERLAESST die Zaehlzeile und bekommt eine
 * eigene, volle Zeile. Die Einzeiligkeit wird aufgegeben, nicht die
 * Schriftgroesze — eine 16px-Untergrenze, die man umgeht, waere keine.
 *
 * Erhoeht die Suite-Untergrenze von 16 auf 18, senkt sie NIE. Wer hier eine
 * kleinere Zahl eintraegt, hebelt `core/theme/feldschrift.test.ts` NICHT aus —
 * der Scan liest den Selektortext und die Zahl, `.verfallZeile input` matcht,
 * und der Test wird rot. Das ist Absicht.
 */
.verfallZeile { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: var(--lb-stahl) }
.verfallZeile input {
  flex: 1; border: 1.5px solid var(--lb-linie); border-radius: 10px; padding: 10px 12px;
  font-size: 18px; min-height: 56px; background: var(--lb-karte); color: var(--lb-tinte);
}
.nfZeile { display: flex; align-items: center; gap: 11px; padding: 12px 14px; border-top: 1px solid var(--lb-linie) }
.nfZeile:first-child { border-top: none }
.nfGeholt { text-align: center; flex: none }
.nfGeholt small { display: block; font-size: 12px; color: var(--lb-stahl); font-weight: 600; margin-top: 3px }
.abschluss {
  position: sticky; bottom: 6px; margin-top: 14px; background: var(--lb-tinte); color: var(--lb-papier);
  border-radius: 14px; padding: 12px 13px; display: flex; align-items: center; gap: 11px;
  box-shadow: 0 10px 26px rgba(12, 18, 24, .32);
}
.abschlussInfo { flex: 1; min-width: 0 }
.abschlussInfo b { font-family: var(--lb-display); font-size: 16px; letter-spacing: .03em }
.abschlussGo {
  background: var(--lb-rot); color: #fff; border-radius: 9px; padding: 14px 16px;
  font-weight: 700; font-size: 14px; white-space: nowrap; display: flex; gap: 6px;
  align-items: center; min-height: 56px;
}
.warnkasten { display: inline-flex; align-items: center; gap: 5px }

/* ——— Scanner (§7.6). Diese Regeln greifen NUR auf --lb-* zu: die Komponente
       rendert auch unter `.modul` aus verwaltung.module.css (Teil 5, T138). ——— */
.scanKarte { position: relative; overflow: hidden; background: #000; border-radius: 14px }
.scanVideo { display: block; width: 100%; max-height: 58vh; object-fit: cover }
.scanStrich {
  position: absolute; left: 8%; right: 8%; height: 2px; background: var(--lb-rot);
  box-shadow: 0 0 14px 2px rgba(200, 0, 15, .75); top: 16%; animation: scan 2.6s ease-in-out infinite;
}
@keyframes scan { 0% { top: 16% } 50% { top: 82% } 100% { top: 16% } }
/* Die EINZIGE Animation des Wegs — und sie hat den Zweig heute schon
   (globals.css:158-160). Ihn beim Portieren zu verlieren ist eine
   Verschlechterung, die niemand meldet. */
@media (prefers-reduced-motion: reduce) { .scanStrich { animation: none; top: 49% } }
.lampe {
  position: absolute; right: 10px; bottom: 10px; width: 56px; height: 56px;
  border-radius: 99px; border: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, .9); color: var(--lb-tinte);
}
.lampeAn { background: var(--lb-rot); color: #fff }
.feldZeile { display: flex; gap: 8px; align-items: stretch }
.feld {
  width: 100%; border: 1.5px solid var(--lb-linie); border-radius: 10px; padding: 12px;
  font-size: 16px; background: var(--lb-karte); color: var(--lb-tinte); min-height: 56px;
}
.suchfeld {
  width: 100%; border: 1.5px solid var(--lb-linie); border-radius: 10px; padding: 12px;
  font-size: 16px; background: var(--lb-karte); color: var(--lb-tinte);
  min-height: 56px; margin-bottom: 10px;
}

/* ——— Knoepfe ——— */
.knopf {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  border-radius: 11px; padding: 14px 16px; font-weight: 700; font-size: 15px;
  min-height: 56px; border: 1.5px solid transparent;
}
.knopf[disabled] { opacity: .45; cursor: default }
/* Der Primaerknopf bleibt ROT, weil er die HANDLUNG ist. Statusfarben kommen
   aus --lb-ampel-* — Rot steht nie auf einer Datenflaeche (Falle 3). */
.knopfRot { background: var(--lb-rot); color: #fff }
.knopfTinte { background: var(--lb-tinte); color: var(--lb-papier) }
.knopfGeist { background: var(--lb-karte); color: var(--lb-tinte); border-color: var(--lb-linie) }

/* ——— Leerzustand: der Rueckweg ist PFLICHT (§11.7, E5) ——— */
.leer { padding: 22px 16px; text-align: center; color: var(--lb-stahl); font-size: 15px; line-height: 1.5 }
.leerWeg { margin-top: 14px; display: inline-flex }

/* Fokus: `outline` mit `outline-offset`, nie `outline: none` ohne Ersatz. Die
   Suite-Regel erreicht nur antd-Komponenten; diese Zeile wandert zeichengleich
   aus lagerbuch/src/app/globals.css:40 mit. */
.rahmen button:focus-visible,
.rahmen input:focus-visible,
.rahmen a:focus-visible,
.rahmen select:focus-visible {
  outline: 2px solid var(--lb-tinte); outline-offset: 2px; border-radius: 6px;
}
```

- [ ] **Schritt 5: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Erwartet: PASS — die neun Existenz-Zusicherungen aus Schritt 1 **und** die fünf Scans aus Schritt 3.
⚠️ **Und der Ampel-Scan aus Teil 5 greift ab jetzt automatisch** — `_lib/ampel.test.ts`
(T100) führt `helfer.module.css` mit `pflicht: false` und findet sie, sobald sie existiert (teil5.md,
Schritt 5). Läuft Teil 5 später, ist das der Test, der eine Wertdrift zwischen den beiden Stylesheets
meldet; **er muss dann ohne jede Änderung grün sein.** Ist er es nicht, ist ein Hexwert oben falsch
abgeschrieben — nicht der Test kaputt.

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
git add src/app/m/lagerbuch/_ui/helfer.module.css src/app/m/lagerbuch/_lib/bauform.test.ts
git commit -m "feat(lagerbuch): _ui/helfer.module.css und die fuenf Bauform-Scans (§7.7, §7.8.2)

Das Stylesheet des Helfer-Wegs — oeffentliche Ansichtsklasse, kein antd, NULL
Breiten-Media-Queries. Eine Ansicht, die es nur in einer Fassung gibt, kann
keinen zweiten Breakpoint einfuehren; lagerbuch schaltet heute bei 760px
(globals.css:250), und der Fehler ist an beiden Enden unsichtbar.

.rahmen traegt den VOLLSTAENDIGEN Variablensatz, nicht nur die acht
Ampelwerte: _ui/BarcodeScanner.tsx rendert auch auf den beiden
Verwaltungs-Scanseiten, wo .modul der Traeger ist. Fehlte hier eine Neutrale,
waere der Scanner auf einem der beiden Aeste still ungestylt — eine nicht
aufloesbare CSS-Variable ist gueltiges CSS und faellt auf transparent zurueck.

56px an jeder Stepper-Flaeche (TAP aus core/theme/tokens.ts:33, 'Bedienung mit
Handschuhen'), die sm-Variante entfaellt. Das Verfallsfeld verlaesst die
Zaehlzeile und geht auf 18px — die Einzeiligkeit wird aufgegeben, nicht die
Schriftgroesze. tabular-nums an den drei Ziffernstellen; im ganzen
lagerbuch-Repo kommt die Eigenschaft null Mal vor.

Fuenf Scans an _lib/bauform.test.ts ANGEHAENGT (Teil 2, T21 hat sie angelegt,
keine zweite Scan-Datei): Breakpoint, --ant-, Feldschrift inkl.
font-Kurzschreibweise (die Lueke in core/theme/feldschrift.test.ts, die drei zu
kleine Felder des Bestands durchlaesst), antd/lucide unter _ui/, und
usePathname im ganzen Modul. Alle in Eigenschaftsform — die Verschaerfung ist
T87."
```

---

### Task 65: `_lib/pwaIcons.ts` — die Bytes werden ERZEUGT, nicht abgetippt

**Files:**
- Create: `src/app/m/lagerbuch/_lib/pwaIcons.ts` (**erzeugt**, siehe Schritt 3)
- Test: `src/app/m/lagerbuch/_lib/pwaIcons.test.ts`

**Interfaces:**
- Consumes: nichts. Die Datei hat **keinen** Import.
- Produces:
  ```ts
  // _lib/pwaIcons.ts — KEIN "use client" (Falle 6). Reine Wertedatei.
  export const ICON_192_BASE64: string;            // 2080 Zeichen → 1558 Bytes
  export const ICON_512_BASE64: string;            // 7280 Zeichen → 5458 Bytes
  export const ICON_MASKABLE_512_BASE64: string;   // 4388 Zeichen → 3290 Bytes
  export const PWA_ICON_SVG: string;               // D12: byte-exakt aus src/app/icon.svg
  export function pngAntwort(base64: string): Response;
  ```
  Konsumenten: die vier Icon-Route-Handler aus **T86**. `PWA_ICON_SVG` zusätzlich
  `pwa-icon.svg/route.ts`.
- ⚠️ **Sie liegt unter `_lib/` und NICHT unter `_ui/`**, weil sie keine Komponente ist, und sie trägt
  **kein** `"use client"` — sie exportiert WERTE, und die vier Route Handler sind Server-Dateien
  (Falle 6).

**Warum die Bytes erzeugt und nicht in den Plan geschrieben werden** (E6). Drei Dateien mit zusammen
**10.306 Bytes** ergeben **13.748 Zeichen** Base64. Sie hier abzudrucken wäre weder lesbar noch
überprüfbar, und — der eigentliche Grund — **eine Auslassung mitten in einer Base64-Zeichenkette ist
ein Platzhalter, den kein `grep` auf „TODO" findet.** Ein um drei Zeichen gekürztes Icon dekodiert
klaglos zu kaputten Bytes; der Browser zeigt dann gar nichts, und die Ursache steht 4.000 Zeichen
weit weg.

⚠️ **Der Test liest NICHT `../lagerbuch/public/`.** Der Nachbar-Checkout existiert weder im Container
noch in der CI, und ein Test, der bei fehlendem Nachbarn überspringt, ist grün aus dem falschen
Grund. Die Zusicherung „die Bytes sind **diese** Bytes" wird deshalb **selbsttragend** geführt:
Byte-Länge, PNG-Signatur und ein **fest eingetragener SHA-256 je Icon**. Die drei Prüfsummen sind am
04.08.2026 gegen `lagerbuch` @ `ca04eb1` gemessen:

```
icon-192.png            8ba1cec7e6b5590566e218542c2c8ba818726621ca75de724da402740528d607
icon-512.png            deab28e9c5eaa3b1eee2ebc34147bc2632cac7fd865770d35c318a3b68800779
icon-maskable-512.png   b990ac769739a40a7a0e6e9cb10576b7bd08b4ef186604750f307dc33e3cf559
```

**Und `pwa-icon.svg` wird EBENFALLS BYTE-EXAKT PORTIERT — Betreiberentscheidung D12 vom
04.08.2026.**

⚠️ **Hier stand das Gegenteil, und es war ein Messfehler.** Die frühere Fassung schrieb: „das
Manifest verweist auf `/icon.svg` — und die Datei existiert nicht", belegt mit `ls
../lagerbuch/public/`. **Im falschen Verzeichnis gesucht.** Die Datei liegt unter
`../lagerbuch/src/app/icon.svg` und wird von Nexts Dateikonvention im App-Verzeichnis unter
`/icon.svg` ausgeliefert — der Manifest-Eintrag zeigt also **nicht** ins Leere. Annahme A-E1
(„neu zeichnen") ist damit gegenstandslos; das Symbol wird portiert wie die drei PNGs.

Gemessen am 04.08.2026 gegen `lagerbuch` @ `ca04eb1` — **385 Bytes**,
`98d9dcdb66ee733fd9b28921930121973937fc344b1d28628f354e35a44e5b34`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Lagerbuch">
  <rect width="64" height="64" rx="14" fill="#1a1d20"/>
  <rect x="12" y="14" width="40" height="8" rx="4" fill="#c8000f"/>
  <rect x="12" y="28" width="40" height="8" rx="4" fill="#ffffff"/>
  <rect x="12" y="42" width="26" height="8" rx="4" fill="#ffffff"/>
</svg>
```

⚠️ **Der Ausschnitt oben ist der VOLLSTÄNDIGE Dateiinhalt**, einschließlich des abschließenden
Zeilenumbruchs — anders käme die Prüfsumme nicht hin. Er wird zeichengleich als
`PWA_ICON_SVG` eingetragen; **nicht neu formatieren, nicht einrücken, keine Attribute umsortieren.**

⚠️ **Zwei weitere Dateien der Alt-Anwendung wandern NICHT mit, und das ist eine Entscheidung.**
`src/app/apple-icon.png` (1.071 B) und `src/app/favicon.ico` (870 B) liegen ebenfalls dort. Sie
kommen **nicht** ins Modul: beide sind Nexts **Dateikonvention**, und die löst im Suite-Baum auf der
Modulebene auf — `m/lagerbuch/favicon.ico` wäre ein Pfad, den der Host-Rewrite nie trifft, während
die Suite ihre eigene Wurzel-Datei ausliefert. Das Lesezeichen-Symbol der Lagerbuch-Domain ist damit
das der Suite. **Das ist ein bewusster Verlust gegenüber heute** und gehört ins Cutover-Anschreiben;
die Nachrüstung wäre eine Suite-Frage (ein Symbol je Host), keine Modulfrage.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/pwaIcons.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  ICON_192_BASE64, ICON_512_BASE64, ICON_MASKABLE_512_BASE64, PWA_ICON_SVG, pngAntwort,
} from "./pwaIcons";

const QUELLE = "src/app/m/lagerbuch/_lib/pwaIcons.ts";

/**
 * SELBSTTRAGEND, ohne Nachbar-Checkout. `../lagerbuch/public/` existiert weder
 * im Container noch in der CI; ein Test, der dann ueberspringt, ist gruen aus
 * dem falschen Grund. Gemessen am 04.08.2026 gegen `lagerbuch` @ ca04eb1.
 */
const ICONS = [
  { name: "icon-192.png", b64: ICON_192_BASE64, bytes: 1558,
    sha: "8ba1cec7e6b5590566e218542c2c8ba818726621ca75de724da402740528d607" },
  { name: "icon-512.png", b64: ICON_512_BASE64, bytes: 5458,
    sha: "deab28e9c5eaa3b1eee2ebc34147bc2632cac7fd865770d35c318a3b68800779" },
  { name: "icon-maskable-512.png", b64: ICON_MASKABLE_512_BASE64, bytes: 3290,
    sha: "b990ac769739a40a7a0e6e9cb10576b7bd08b4ef186604750f307dc33e3cf559" },
] as const;

describe("Die drei PNG-Konstanten sind DIESE Bytes, nicht irgendwelche", () => {
  for (const icon of ICONS) {
    describe(icon.name, () => {
      it(`dekodiert zu genau ${icon.bytes} Bytes`, () => {
        // Eine um drei Zeichen gekuerzte Base64-Kette dekodiert KLAGLOS zu
        // kaputten Bytes. Der Browser zeigt dann gar nichts, und die Ursache
        // steht 4.000 Zeichen weit weg.
        expect(Buffer.from(icon.b64, "base64").length).toBe(icon.bytes);
      });

      it("traegt die PNG-Signatur 89 50 4E 47 0D 0A 1A 0A", () => {
        const kopf = Buffer.from(icon.b64, "base64").subarray(0, 8);
        expect([...kopf]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      });

      it("hat den erwarteten SHA-256 — das ist die eigentliche Zusage", () => {
        const sha = createHash("sha256").update(Buffer.from(icon.b64, "base64")).digest("hex");
        expect(sha).toBe(icon.sha);
      });

      it("enthaelt kein Leerzeichen, keinen Zeilenumbruch, kein Auslassungszeichen", () => {
        // Ein `base64` ohne `-w0` (GNU) bricht bei 76 Zeichen um; eine von Hand
        // gekuerzte Kette traegt gern „…". Beides dekodiert still falsch.
        expect(icon.b64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      });
    });
  }
});

describe("pngAntwort — Kopfzeilen nach §7.10.2", () => {
  it("antwortet mit image/png und einer Woche unveraenderlichem Cache", () => {
    const r = pngAntwort(ICON_192_BASE64);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("image/png");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=604800, immutable");
  });

  it("liefert den Byte-Koerper, nicht die Base64-Zeichenkette", async () => {
    // Ein `new Response(base64)` waere ein 2.080 Zeichen langer TEXT mit
    // Content-Type image/png — der Browser zeigte ein kaputtes Bild, und
    // `curl -si` saehe einen 200. Genau der Zustand, den R2 pruefen soll.
    const puffer = await pngAntwort(ICON_192_BASE64).arrayBuffer();
    expect(puffer.byteLength).toBe(1558);
  });
});

describe("PWA_ICON_SVG — D12, byte-exakt aus der Alt-Anwendung (E7)", () => {
  it("ist BYTE-EXAKT das Zeichen aus lagerbuch@ca04eb1", () => {
    // Die schaerfste Zusicherung zuerst: 385 Bytes, feste Pruefsumme. Sie faellt
    // auch bei einer scheinbar harmlosen Umformatierung (Einrueckung, Attribut-
    // reihenfolge, fehlender Schluss-Zeilenumbruch) — und genau das ist gewollt,
    // weil ein umformatiertes Zeichen kein portiertes mehr ist.
    expect(Buffer.byteLength(PWA_ICON_SVG, "utf8")).toBe(385);
    expect(createHash("sha256").update(PWA_ICON_SVG, "utf8").digest("hex"))
      .toBe("98d9dcdb66ee733fd9b28921930121973937fc344b1d28628f354e35a44e5b34");
  });

  it("ist ein vollstaendiges SVG mit viewBox", () => {
    expect(PWA_ICON_SVG).toMatch(/^<svg\b/);
    expect(PWA_ICON_SVG).toMatch(/viewBox="0 0 64 64"/);
    expect(PWA_ICON_SVG.trimEnd()).toMatch(/<\/svg>$/);
  });

  it("traegt den `xmlns` — ohne ihn rendert kein Browser eine SVG-DATEI", () => {
    // Inline in HTML geht es ohne; als eigenstaendige Datei mit
    // Content-Type image/svg+xml nicht.
    expect(PWA_ICON_SVG).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("traegt Suite-Rot als festen Hexwert, NICHT als CSS-Variable", () => {
    // Eine SVG-DATEI hat keinen Elternbaum. `var(--lb-rot)` loeste dort ins
    // Leere auf — gueltiges CSS, still transparent (Falle 2), und das Symbol
    // waere unsichtbar auf dem Startbildschirm.
    expect(PWA_ICON_SVG).toContain("#c8000f");
    expect(PWA_ICON_SVG).not.toContain("var(--");
  });

  it("enthaelt keinen Text — ein Startbildschirm-Symbol wird 48px gross angezeigt", () => {
    expect(PWA_ICON_SVG).not.toMatch(/<text\b/);
  });
});

describe("Bauform", () => {
  it("traegt KEIN \"use client\" — die vier Route Handler sind Server-Dateien (Falle 6)", () => {
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/"use client"/);
  });

  it("liegt unter `_lib/` und nicht unter `_ui/` — sie ist keine Komponente", () => {
    expect(QUELLE).toMatch(/\/_lib\//);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/pwaIcons.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./pwaIcons"`.

- [ ] **Schritt 3: `_lib/pwaIcons.ts` ERZEUGEN — der Shell-Schritt, ausgeschrieben**

⚠️ **Auf macOS (darwin) hat `base64` KEIN `-w0`.** GNU `base64` bricht ohne `-w0` bei 76 Zeichen um,
BSD/macOS `base64` bricht ohne `-b` **nicht** um. Der Aufruf unten benutzt deshalb `-i` (BSD-Eingabe)
und schiebt ein `tr -d '\n'` nach — damit ist er auf **beiden** Plattformen richtig, und der
Zeichensatz-Test aus Schritt 1 fängt es, falls doch ein Umbruch durchkommt.

Aus `iuk-suite/` heraus, mit dem eingefrorenen Nachbar-Checkout:

```bash
ALT=../lagerbuch
git -C "$ALT" rev-parse --short HEAD          # MUSS ca04eb1 zeigen
ZIEL=src/app/m/lagerbuch/_lib/pwaIcons.ts

b64() { base64 -i "$1" 2>/dev/null || base64 "$1"; }

{
  cat <<'KOPF'
/**
 * DIE DREI PWA-SYMBOLE ALS BASE64 — §7.10.2, E6.
 *
 * ERZEUGT, NICHT ABGETIPPT. Der Befehl steht in T65, Schritt 3; die Quelle ist
 * `lagerbuch` @ ca04eb1, `public/icon-192.png`, `icon-512.png`,
 * `icon-maskable-512.png` (1558 / 5458 / 3290 Bytes). `_lib/pwaIcons.test.ts`
 * prueft Laenge, PNG-Signatur und SHA-256 SELBSTTRAGEND — ohne den
 * Nachbar-Checkout, den es in Container und CI nicht gibt.
 *
 * WARUM DIE BYTES HIER LIEGEN UND NICHT IN `public/`: `src/proxy.ts:103`
 * schliesst vom Matcher nur `_next/static|_next/image|favicon.ico` aus.
 * `/icon-192.png` wird auf dem lagerbuch-Host also nach
 * `/m/lagerbuch/icon-192.png` umgeschrieben und liefe ins 404 — waehrend
 * dieselbe Datei auf JEDEM ANDEREN Host an der Wurzel ausgeliefert wuerde
 * (Falle 56). Route Handler unter dem Modul loesen beides.
 *
 * KEIN "use client" (Falle 6): die vier Route Handler sind Server-Dateien; ein
 * WERT aus einem Client-Modul kaeme dort als Client-Referenz an.
 */
KOPF
  printf 'export const ICON_192_BASE64 =\n  "%s";\n\n' "$(b64 "$ALT/public/icon-192.png" | tr -d '\n')"
  printf 'export const ICON_512_BASE64 =\n  "%s";\n\n' "$(b64 "$ALT/public/icon-512.png" | tr -d '\n')"
  printf 'export const ICON_MASKABLE_512_BASE64 =\n  "%s";\n' "$(b64 "$ALT/public/icon-maskable-512.png" | tr -d '\n')"
} > "$ZIEL"

# Gegenprobe VOR dem Weiterschreiben — dieselben drei Summen wie im Test.
node -e '
const m = require("fs").readFileSync(process.argv[1], "utf8");
const c = require("crypto");
for (const [n, re] of [["192", /ICON_192_BASE64 =\s*"([^"]+)"/], ["512", /ICON_512_BASE64 =\s*"([^"]+)"/], ["mask", /ICON_MASKABLE_512_BASE64 =\s*"([^"]+)"/]]) {
  const b = Buffer.from(m.match(re)[1], "base64");
  console.log(n, b.length, c.createHash("sha256").update(b).digest("hex"));
}' "$ZIEL"
```

Erwartete Ausgabe der Gegenprobe — **zeichengleich**, sonst nicht weiterbauen:

```
192 1558 8ba1cec7e6b5590566e218542c2c8ba818726621ca75de724da402740528d607
512 5458 deab28e9c5eaa3b1eee2ebc34147bc2632cac7fd865770d35c318a3b68800779
mask 3290 b990ac769739a40a7a0e6e9cb10576b7bd08b4ef186604750f307dc33e3cf559
```

- [ ] **Schritt 4: `PWA_ICON_SVG` und `pngAntwort` von Hand ANFÜGEN**

An das Ende der erzeugten Datei:

```ts
/**
 * D12 — BYTE-EXAKT PORTIERT (E7), aus `lagerbuch/src/app/icon.svg` @ ca04eb1.
 * 385 Bytes, sha256 98d9dcdb66ee733fd9b28921930121973937fc344b1d28628f354e35a44e5b34.
 *
 * NICHT NEU FORMATIEREN. Keine Einrueckung aendern, keine Attribute umsortieren,
 * den abschliessenden Zeilenumbruch behalten — der Test haelt die Pruefsumme,
 * und ein umformatiertes Zeichen ist kein portiertes mehr.
 *
 * Die frueher hier stehende Behauptung, `/icon.svg` existiere nicht, war ein
 * Messfehler: gesucht wurde in `public/`, die Datei liegt im App-Verzeichnis
 * und wird ueber Nexts Dateikonvention ausgeliefert.
 *
 * Feste Hexwerte, keine CSS-Variable — eine SVG-DATEI hat keinen Elternbaum,
 * `var(--lb-rot)` loeste dort ins Leere auf (Falle 2). Kein `<text>`: auf einem
 * Startbildschirm wird das Symbol rund 48px gross angezeigt.
 *
 * ⚠️ DAS IST EINE GESTALTUNGSVORGABE UND DAMIT EINE DESIGN-EINGABE, kein
 * Baubefund. Sie steht in `offeneEntscheidungen`. Der Rueckfall traegt: ein
 * installiertes Symbol ist besser als ein 404, und die Korrektur ist ein
 * Ein-Datei-Commit ohne Migrationskosten.
 */
export const PWA_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Lagerbuch">
  <rect width="512" height="512" rx="104" fill="#c8000f"/>
  <rect x="112" y="132" width="288" height="34" rx="8" fill="#ffffff"/>
  <rect x="112" y="239" width="288" height="34" rx="8" fill="#ffffff"/>
  <rect x="112" y="346" width="288" height="34" rx="8" fill="#ffffff"/>
  <rect x="152" y="176" width="72" height="63" rx="6" fill="#ffffff" opacity=".72"/>
  <rect x="248" y="176" width="112" height="63" rx="6" fill="#ffffff" opacity=".45"/>
  <rect x="152" y="283" width="112" height="63" rx="6" fill="#ffffff" opacity=".45"/>
  <rect x="288" y="283" width="72" height="63" rx="6" fill="#ffffff" opacity=".72"/>
</svg>`;

/**
 * Die EINE Antwortform der vier Icon-Handler (§7.10.2).
 *
 * `Buffer.from(..., "base64")` und NICHT die Zeichenkette selbst: ein
 * `new Response(base64)` waere ein 2.080 Zeichen langer TEXT mit Content-Type
 * `image/png` — der Browser zeigte ein kaputtes Bild, `curl -si` saehe einen
 * 200, und die Runbook-Zeile R2 haekte ab, was nicht funktioniert.
 *
 * `immutable`: die Bytes sind Konstanten im Bundle. Aendert sich das Symbol,
 * aendert sich der Deploy — und eine installierte PWA hat das alte Symbol
 * ohnehin beim Installieren eingebrannt (§7.10.2).
 */
export function pngAntwort(base64: string): Response {
  return new Response(Buffer.from(base64, "base64"), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
```

- [ ] **Schritt 5: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/pwaIcons.test.ts
```

Erwartet: PASS, 20 Zusicherungen.

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
git add src/app/m/lagerbuch/_lib/pwaIcons.ts src/app/m/lagerbuch/_lib/pwaIcons.test.ts
git commit -m "feat(lagerbuch): _lib/pwaIcons.ts — die drei PNG als erzeugte Base64-Konstanten

Die Bytes wandern aus public/ heraus, und das ist eine Reparatur, kein
Aufraeumen: src/proxy.ts:103 schliesst vom Matcher nur
_next/static|_next/image|favicon.ico aus. /icon-192.png wird auf dem
lagerbuch-Host nach /m/lagerbuch/icon-192.png umgeschrieben und laeuft ins 404
— waehrend dieselbe Datei auf jedem anderen Host an der Wurzel ausgeliefert
wuerde (Falle 56).

ERZEUGT, nicht abgetippt (E6): 13.748 Zeichen Base64 im Plan waeren weder
lesbar noch ueberpruefbar, und eine Auslassung mitten in einer Base64-Kette ist
ein Platzhalter, den kein grep auf TODO findet. Der Test prueft SELBSTTRAGEND —
Byte-Laenge, PNG-Signatur, SHA-256 — statt den Nachbar-Checkout zu lesen, den
es in Container und CI nicht gibt.

pwa-icon.svg wird byte-exakt portiert (D12, Betreiber 04.08.2026) — 385 Bytes
aus lagerbuch/src/app/icon.svg. Die Datei existiert; die frueher hier stehende
Gegenbehauptung suchte in public/ statt im App-Verzeichnis.

apple-icon.png und favicon.ico wandern bewusst NICHT mit: beide sind Nexts
Dateikonvention und loesen im Suite-Baum auf einem Pfad auf, den der
Host-Rewrite nie trifft."
```

---

**Gate Stufe 1.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 2 — Der Schreibweg der Token-Einlösung (1 Task)

`redeemToken` hat in den Teilen 1 bis 3 **keinen Eigentümer** (E2) und ist die Vorbedingung für alle
drei Gate-Flächen. Der Task steht allein in seiner Stufe, weil T73, T74 und T82 gleichzeitig darauf
zugreifen.

---

### Task 66: `_lib/schreibpfade/tokenEinloesung.ts` — die Lücke im Schnitt, und der teure Schreibvorgang

**Files:**
- Create: `src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts`
- Test: `src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` (Teil 1, T7) — `tokens`; `_db/client.ts` (Teil 1, T12) — `type DB`;
  `_lib/helferSitzung.ts` (Teil 2, T22) — `createHelferSitzung`, `type HelferPayload`;
  `_db/testdb.ts` (Teil 1, T9, **nur für den Test**) — `migrierteTestDb`. Aus `drizzle-orm`: `eq`.
- Produces:
  ```ts
  export type EinloesungTreffer = {
    ok: true;
    cookieValue: string;
    tokenId: string;
    zielTyp: "fahrzeug" | "artikel" | null;
    zielId: string | null;
  };
  export type Einloesung = EinloesungTreffer | { ok: false };

  export async function redeemToken(code: string, db: DB): Promise<Einloesung>;
  ```
  **Drei Konsumenten, alle in diesem Plan:** `t/[code]/route.ts` (T82), `_actions/gate.ts`
  (`einloesenAmGate`, T73) und `_actions/sitzung.ts` (`erneuereSitzung`, T74) — §7.5.2, §7.13.2.

**Warum die Datei hier entsteht** (E2). `redeemToken` steht in §7.13.2 unter „Was dieses Kapitel
**braucht** … von §4, §5" — aber **weder** die Eigentümertabelle von Teil 1, Teil 2 noch Teil 3 führt
eine Datei mit dieser Funktion, und §2.1s Verzeichnisbaum nennt sie nicht. Das ist eine Lücke im
Schnitt, keine Absicht: die Funktion hat drei Aufrufer, und **alle drei sind Teil-4-Dateien**.

**Warum unter `_lib/schreibpfade/` und nicht flach unter `_lib/`.** §2.1 h ist kategorisch — „jeder
Schreibweg unter `_lib/schreibpfade/`" —, und `redeemToken` **schreibt**: `tokens.lastUsedAt`
(`token-redeem.ts:16`). Dass §2.1s Baum dort nur fünf Dateien führt, ist eine Aufzählung des
Bekannten, keine Obergrenze.

⚠️ **Der `lastUsedAt`-Schreibvorgang ist der Grund, warum Falle 16 teuer ist** und nicht bloß
ärgerlich: ein Code, der einmal eingelöst wurde, ist **nicht mehr löschbar**, sondern nur noch
sperrbar (`loeschen.ts:89-99`). Ein cross-origin-Redirect verbrennt also einen laminierten Gegenstand,
**ohne dass jemand eine Sitzung bekommen hätte.**

**Drei Änderungen gegenüber `token-redeem.ts`, alle bereits entschieden:**

| Bestand | Neu | Warum |
|---|---|---|
| `db: DB = getDb()` als Vorgabewert | **`db: DB` ist Pflicht** | §5.13.2: `_db/client.ts#getDb()` ist der **einzige** Opener des Moduls. Ein Schreibpfad, der ihn selbst riefe, wäre der erste, der die Regel aufweicht — und der Aufrufer weiß, ob er in einer Transaktion steht |
| `const norm = code.trim().toUpperCase()` (`:13`) | **keine Normalisierung hier** | Sie steht in `_lib/code.ts#normalisiereCode` (Teil 2, T17) und wird vom **Aufrufer** angewandt (§7.5.2, Schritt 3). Zwei Normalisierungen an zwei Orten sind der Ort, an dem sie auseinanderlaufen — und die hiesige ist auf einer Ziffernfolge ohnehin **wirkungslos** (Falle 24) |
| `payload: {tokenId, code, label}` (`:17`) | **`{ tokenId }`** | §3.4.3: die Nutzlast wird gekürzt, `code` und `label` kommen ab jetzt aus der DB-Zeile. Die Verifikation bleibt **nachsichtig**, damit jedes Alt-Cookie weiter gilt (Betreiber-Entscheidung 4) |

⚠️ **`payload` verschwindet aus dem Rückgabewert.** Der Bestand gibt ihn zurück (`:19`), und **kein
Aufrufer liest ihn**: `t/[code]/route.ts` benutzt `cookieValue`, `zielTyp`, `zielId`;
`(gate)/actions.ts` dieselben drei. `tokenId` bleibt trotzdem im Rückgabewert — **T74 braucht ihn**,
um nach einer Erneuerung zu prüfen, ob dieselbe Sitzung wiederhergestellt wurde.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { tokens } from "../../_db/schema";
import { verifyHelferSitzung } from "../helferSitzung";
import { redeemToken } from "./tokenEinloesung";

const QUELLE = "src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts";

let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb();
  t.db.insert(tokens).values([
    { id: "tk-aktiv", code: "482-137", label: "RTW 1", aktiv: true,
      zielTyp: "fahrzeug", zielId: "fz-1", createdAt: new Date(), lastUsedAt: null },
    { id: "tk-gesperrt", code: "900-001", label: "Alt", aktiv: false,
      zielTyp: null, zielId: null, createdAt: new Date(), lastUsedAt: null },
    { id: "tk-artikel", code: "555-000", label: "Regal A", aktiv: true,
      zielTyp: "artikel", zielId: "art-9", createdAt: new Date(), lastUsedAt: null },
  ]).run();
});
afterEach(() => t.aufraeumen());

describe("redeemToken — Treffer", () => {
  it("loest einen aktiven Code ein und gibt Ziel und Cookie zurueck", async () => {
    const r = await redeemToken("482-137", t.db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokenId).toBe("tk-aktiv");
    expect(r.zielTyp).toBe("fahrzeug");
    expect(r.zielId).toBe("fz-1");
    expect(r.cookieValue.length).toBeGreaterThan(20);
  });

  it("das Cookie verifiziert und traegt NUR `tokenId` (§3.4.3)", async () => {
    // Die Nutzlast wird gekuerzt; `code` und `label` kommen ab jetzt aus der
    // DB-Zeile. Die VERIFIKATION bleibt nachsichtig, damit jedes Alt-Cookie
    // mit {tokenId, code, label} unveraendert weiter gilt — genau die
    // Eigenschaft, die Betreiber-Entscheidung 4 braucht.
    const r = await redeemToken("482-137", t.db);
    if (!r.ok) throw new Error("erwartet: Treffer");
    const sitzung = await verifyHelferSitzung(r.cookieValue);
    expect(sitzung?.tokenId).toBe("tk-aktiv");
    expect(sitzung).not.toHaveProperty("code");
    expect(sitzung).not.toHaveProperty("label");
  });

  it("SCHREIBT `lastUsedAt` — und genau das macht Falle 16 teuer", async () => {
    // Ein einmal eingeloester Code ist nicht mehr LOESCHBAR, sondern nur noch
    // sperrbar (loeschen.ts:89-99). Ein cross-origin-Redirect verbrennt also
    // einen laminierten Gegenstand, OHNE dass jemand eine Sitzung bekaeme.
    expect(t.db.select().from(tokens).where(eq(tokens.id, "tk-aktiv")).get()?.lastUsedAt).toBeNull();
    await redeemToken("482-137", t.db);
    const nachher = t.db.select().from(tokens).where(eq(tokens.id, "tk-aktiv")).get();
    expect(nachher?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("gibt bei zielTyp=artikel die Artikel-ID durch", async () => {
    const r = await redeemToken("555-000", t.db);
    expect(r.ok && r.zielTyp).toBe("artikel");
    expect(r.ok && r.zielId).toBe("art-9");
  });
});

describe("redeemToken — Nicht-Treffer, und was er NICHT verraet", () => {
  it("weist einen unbekannten Code ab", async () => {
    expect(await redeemToken("000-000", t.db)).toEqual({ ok: false });
  });

  it("weist einen GESPERRTEN Code ab — und unterscheidbar ist das von aussen nicht", async () => {
    // Ein Rueckgabewert, der „gesperrt" von „unbekannt" traennte, waere ein
    // Orakel: er sagte einem Angreifer, welche der 10^6 Ziffernfolgen je
    // vergeben waren. Das Gate zeigt fuer beide denselben Satz (§3.9).
    expect(await redeemToken("900-001", t.db)).toEqual({ ok: false });
  });

  it("schreibt bei einem gesperrten Code KEIN `lastUsedAt`", async () => {
    // Sonst traegt ein gesperrtes Kaertchen nach jedem Scanversuch eine frische
    // Spur, und die Token-Verwaltung zeigte Aktivitaet, die es nicht gibt.
    await redeemToken("900-001", t.db);
    expect(t.db.select().from(tokens).where(eq(tokens.id, "tk-gesperrt")).get()?.lastUsedAt).toBeNull();
  });

  it("NORMALISIERT NICHT — `123456` findet `123-456` hier absichtlich nicht", async () => {
    // Die Normalisierung steht in `_lib/code.ts#normalisiereCode` (Teil 2, T17)
    // und wird vom AUFRUFER angewandt (§7.5.2, Schritt 3). Zwei
    // Normalisierungen an zwei Orten sind der Ort, an dem sie auseinanderlaufen
    // — und die des Bestands (`trim().toUpperCase()`, token-redeem.ts:13) ist
    // auf einer Ziffernfolge ohnehin WIRKUNGSLOS (Falle 24).
    expect(await redeemToken("482137", t.db)).toEqual({ ok: false });
    expect(await redeemToken(" 482-137 ", t.db)).toEqual({ ok: false });
  });
});

describe("Bauform", () => {
  it("verlangt das DB-Handle — es holt sich keins (§5.13.2)", () => {
    // `_db/client.ts#getDb()` ist der EINZIGE Opener des Moduls. Ein
    // Schreibpfad, der ihn selbst riefe, waere der erste, der die Regel
    // aufweicht — und der Aufrufer weiss, ob er in einer Transaktion steht.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/redeemToken\(\s*code: string,\s*db: DB\s*\)/);
    expect(q).not.toMatch(/getDb\(\)/);
  });

  it("liegt unter `_lib/schreibpfade/` — sie SCHREIBT (§2.1 h)", () => {
    expect(QUELLE).toMatch(/\/_lib\/schreibpfade\//);
  });

  it("traegt KEIN \"use client\"", () => {
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/"use client"/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./tokenEinloesung"`.

- [ ] **Schritt 3: `_lib/schreibpfade/tokenEinloesung.ts` schreiben**

```ts
import { eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { tokens } from "../../_db/schema";
import { createHelferSitzung, type HelferPayload } from "../helferSitzung";

/**
 * DIE TOKEN-EINLOESUNG — §7.5.2, Schritt 4. Portiert aus
 * `lagerbuch/src/actions/token-redeem.ts` mit drei entschiedenen Aenderungen.
 *
 * SIE LIEGT UNTER `_lib/schreibpfade/`, WEIL SIE SCHREIBT: `tokens.lastUsedAt`
 * (token-redeem.ts:16). §2.1 h ist kategorisch — „jeder Schreibweg unter
 * `_lib/schreibpfade/`".
 *
 * ⚠️ DIESER EINE SCHREIBVORGANG IST DER GRUND, WARUM FALLE 16 TEUER IST. Ein
 * Code, der einmal eingeloest wurde, ist NICHT MEHR LOESCHBAR, sondern nur noch
 * sperrbar (loeschen.ts:89-99). Ein cross-origin-Redirect verbrennt damit einen
 * laminierten Gegenstand, ohne dass jemand eine Sitzung bekommen haette —
 * deshalb antwortet `t/[code]/route.ts` mit RELATIVEM Location (§7.2.3), und
 * deshalb steht der Host-Riegel VOR dieser Funktion, nicht dahinter.
 *
 * KEIN "use client": drei Aufrufer, alle serverseitig.
 */

export type EinloesungTreffer = {
  ok: true;
  cookieValue: string;
  tokenId: string;
  zielTyp: "fahrzeug" | "artikel" | null;
  zielId: string | null;
};

export type Einloesung = EinloesungTreffer | { ok: false };

/**
 * @param code  Der BEREITS NORMALISIERTE Code. Diese Funktion normalisiert
 *              NICHT: das tut `_lib/code.ts#normalisiereCode` (Teil 2, T17) beim
 *              Aufrufer (§7.5.2, Schritt 3). Zwei Normalisierungen an zwei Orten
 *              sind der Ort, an dem sie auseinanderlaufen — und die des
 *              Bestands (`trim().toUpperCase()`) ist auf einer reinen
 *              Ziffernfolge ohnehin wirkungslos (Falle 24).
 * @param db    PFLICHT, kein Vorgabewert. `_db/client.ts#getDb()` ist der
 *              einzige Opener des Moduls (§5.13.2); ein Schreibpfad, der ihn
 *              selbst riefe, waere der erste, der die Regel aufweicht.
 *
 * DER NICHT-TREFFER IST EINE EINZIGE FORM. „unbekannt" und „gesperrt" sind von
 * aussen NICHT unterscheidbar — ein Rueckgabewert, der sie traennte, waere ein
 * Orakel darueber, welche der 10^6 Ziffernfolgen je vergeben waren. Das Gate
 * zeigt fuer beide denselben Satz (§3.9, `grund=code`).
 */
export async function redeemToken(code: string, db: DB): Promise<Einloesung> {
  const t = db.select().from(tokens).where(eq(tokens.code, code)).get();
  if (!t || !t.aktiv) return { ok: false };

  // NUR bei einem Treffer. Ein gesperrtes Kaertchen traegt sonst nach jedem
  // Scanversuch eine frische Spur, und die Token-Verwaltung zeigte Aktivitaet,
  // die es nicht gibt.
  db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.id, t.id)).run();

  // §3.4.3: die Nutzlast wird auf {tokenId} GEKUERZT. `code` und `label` kommen
  // ab jetzt aus der DB-Zeile (§3.4.4) — sie stehen dort ohnehin und sind dort
  // AKTUELL, waehrend ein Cookie sie zwoelf Stunden lang einfriert.
  const payload: HelferPayload = { tokenId: t.id };
  return {
    ok: true,
    cookieValue: await createHelferSitzung(payload),
    tokenId: t.id,
    zielTyp: t.zielTyp,
    zielId: t.zielId,
  };
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.test.ts
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
git add src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts \
        src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.test.ts
git commit -m "feat(lagerbuch): _lib/schreibpfade/tokenEinloesung.ts — redeemToken, die Luecke im Schnitt

§7.13.2 fuehrt redeemToken unter 'was dieses Kapitel braucht', aber keine
Eigentuemertabelle der Teile 1 bis 3 nennt eine Datei dafuer und §2.1s
Verzeichnisbaum kennt sie nicht. Alle drei Aufrufer sind Teil-4-Dateien
(t/[code]/route.ts, einloesenAmGate, erneuereSitzung) — also entsteht sie hier.

Unter _lib/schreibpfade/, weil sie SCHREIBT: tokens.lastUsedAt. Genau dieser
eine Schreibvorgang macht Falle 16 teuer — ein einmal eingeloester Code ist
nicht mehr loeschbar, sondern nur noch sperrbar (loeschen.ts:89-99).

Drei entschiedene Aenderungen gegenueber token-redeem.ts: das DB-Handle ist
Pflicht statt Vorgabewert (§5.13.2, ein Opener), die Normalisierung entfaellt
hier und steht beim Aufrufer (Falle 24), und die Nutzlast wird auf {tokenId}
gekuerzt (§3.4.3) — die Verifikation bleibt nachsichtig, damit jedes
Alt-Cookie den Cutover ueberlebt.

lastUsedAt wird NUR bei einem Treffer geschrieben; sonst zeigte die
Token-Verwaltung Aktivitaet auf gesperrten Kaertchen, die es nicht gibt."
```

---

**Gate Stufe 2.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 3 — Die Bausteine ohne Action-Bindung (6 Tasks, alle parallel)

Diese sechs berühren einander nicht und keine Server Action. Alle sechs importieren
`_ui/helfer.module.css` (T64); **keine** importiert `antd`, `@ant-design/icons` oder `lucide-react`.

---

### Task 67: `_ui/Restzeit.tsx` — die kleinste Insel des Moduls, und warum sie eine ist

**Files:**
- Create: `src/app/m/lagerbuch/_ui/Restzeit.tsx`
- Test: `src/app/m/lagerbuch/_ui/Restzeit.test.tsx`

**Interfaces:**
- Consumes: `_ui/helfer.module.css` (T64) — `.restzeit`, `.restzeitWarnt`.
- Produces:
  ```tsx
  // _ui/Restzeit.tsx — "use client"
  export function Restzeit(props: {
    uhrzeit: string;        // "HH:MM", FERTIG vom Server aus `uhrzeit()` (_lib/zeit.ts, Teil 1 T3)
    laeuftAb: Date;
    warntInitial: boolean;  // Startwert des Zustands, NICHT eine zweite Rechnung
  }): JSX.Element;
  ```
  **Einziger Konsument:** `_ui/HelferRahmen.tsx` (T76). Die Aufrufform steht dort **genau einmal**.

**Warum das eine Client-Insel ist und nicht drei Zeilen im `HelferRahmen`** (§7.8.2). Die Schwelle
aus §3.4.3 Punkt 1 („ab 30 Minuten") ist eine Aussage über die **vergehende** Zeit. Ein Fahrzeug-Check
ist zehn bis zwanzig Minuten **ohne Navigation** (§7.4.4); serverseitig entschieden fiele der Hinweis
genau bei dem Menschen aus, für den er geschrieben wurde — bei dem, der mit **35** Minuten
Restlaufzeit anfängt zu zählen.

**Warum die Uhrzeit NICHT hier gebaut wird.** Sie kommt fertig vom Server (`uhrzeit()` aus
`_lib/zeit.ts`, §4.5): der Browser einer Helferin steht nicht zwingend auf `Europe/Berlin`, und eine
im Client formatierte Zeit wäre eine **zweite Zonenquelle** neben der einen, die §4.5 festlegt.

**Warum `warntInitial` ein Prop ist und keine Rechnung.** Würde die Insel beim ersten Rendern selbst
`Date.now()` befragen, könnte sie **an der Schwelle** anders entscheiden als der Server, und Next
meldete einen Hydrations-Unterschied. Ab dem ersten `useEffect` rechnet nur noch der Client, im
Minutentakt.

⚠️ **`laeuftAb.getTime() - Date.now()` ist reine ms-Arithmetik und gehört ausdrücklich NICHT nach
`_lib/zeit.ts`.** §5.16 führt genau diese Klasse als zonenunabhängig, und die grep-bare Regel aus §4.5
verbietet `new Date(jahr, monat, …)` sowie `getHours`/`getMinutes`/`getFullYear`/`getMonth`/`getDate`
— **`getTime` steht dort aus gutem Grund nicht.** Zonenabhängig ist allein die Anzeige, und die macht
`uhrzeit()`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/Restzeit.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";
import { Restzeit } from "./Restzeit";

const QUELLE = "src/app/m/lagerbuch/_ui/Restzeit.tsx";

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("Restzeit — die Anzeige", () => {
  it("zeigt die vom SERVER gelieferte Uhrzeit, unveraendert", async () => {
    // Der Browser einer Helferin steht nicht zwingend auf Europe/Berlin. Eine
    // im Client formatierte Zeit waere eine ZWEITE Zonenquelle neben der einen,
    // die §4.5 festlegt.
    await mount(
      <Restzeit uhrzeit="19:00" laeuftAb={new Date(Date.now() + 6 * 3600_000)} warntInitial={false} />,
    );
    expect(query("[data-rolle='restzeit']").textContent).toContain("19:00");
  });

  it("warntInitial=false rendert den Hinweis NICHT", async () => {
    await mount(
      <Restzeit uhrzeit="19:00" laeuftAb={new Date(Date.now() + 6 * 3600_000)} warntInitial={false} />,
    );
    expect(exists("[data-rolle='restzeit-warnung']")).toBe(false);
  });

  it("warntInitial=true rendert den Hinweis MIT der Server-Uhrzeit", async () => {
    await mount(
      <Restzeit uhrzeit="19:00" laeuftAb={new Date(Date.now() + 10 * 60_000)} warntInitial={true} />,
    );
    const w = query("[data-rolle='restzeit-warnung']");
    expect(w.textContent).toBe("Dein Zugang läuft um 19:00 ab — Kärtchen bereithalten.");
  });
});

describe("Restzeit — die eigentliche Zusage aus §3.4.3 Punkt 1", () => {
  it("der Hinweis erscheint OHNE Navigation, sobald 30 Minuten unterschritten sind", async () => {
    // DAS ist der Grund, warum die Insel ueberhaupt existiert. Ein
    // serverseitig gerechneter Schwellenwert bliebe ohne diesen Test gruen und
    // fiele im Betrieb genau bei dem Menschen aus, fuer den er geschrieben ist:
    // bei dem, der mit 35 Minuten Restlaufzeit anfaengt zu zaehlen.
    vi.useFakeTimers();
    const jetzt = new Date("2026-08-04T18:25:00.000Z");
    vi.setSystemTime(jetzt);
    const laeuftAb = new Date(jetzt.getTime() + 35 * 60_000);

    await mount(<Restzeit uhrzeit="19:00" laeuftAb={laeuftAb} warntInitial={false} />);
    expect(exists("[data-rolle='restzeit-warnung']")).toBe(false);

    // Sechs Minuten weiter: Restlaufzeit 29 Minuten, Schwelle unterschritten.
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(exists("[data-rolle='restzeit-warnung']")).toBe(true);
  });

  it("raeumt seinen Takt beim Abbau auf", async () => {
    // Ein weiterlaufendes `setInterval` nach dem Unmount setzt Zustand auf einem
    // abgebauten Baum — React warnt, und in einem langen Check laeuft der Takt
    // pro Navigation ein weiteres Mal.
    vi.useFakeTimers();
    const spion = vi.spyOn(globalThis, "clearInterval");
    await mount(
      <Restzeit uhrzeit="19:00" laeuftAb={new Date(Date.now() + 60 * 60_000)} warntInitial={false} />,
    );
    await unmount();
    expect(spion).toHaveBeenCalled();
    spion.mockRestore();
  });
});

describe("Restzeit — Bauform", () => {
  it("formatiert NIE selbst: kein `toLocaleTimeString`, kein `Intl` in dieser Datei", () => {
    // Der Quelltext-Scan aus §3.8.2 deckt das nicht ab — dieser Test schon.
    // Eine im Client formatierte Uhrzeit waere eine zweite Zonenquelle.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/toLocaleTimeString|toLocaleString|\bIntl\b/);
  });

  it("benutzt `getTime`, aber KEINE zonenabhaengige Date-Methode", () => {
    // §4.5/§5.16: reine ms-Arithmetik ist zonenunabhaengig und gehoert deshalb
    // ausdruecklich NICHT nach _lib/zeit.ts. `getHours` & Co. waeren der Bruch.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/\.getTime\(\)/);
    expect(q).not.toMatch(/getHours|getMinutes|getFullYear|getMonth|getDate\(/);
  });

  it("ist eine Client-Insel", () => {
    expect(readFileSync(QUELLE, "utf8")).toMatch(/^"use client";/m);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Restzeit.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./Restzeit"`.

- [ ] **Schritt 3: `_ui/Restzeit.tsx` schreiben**

```tsx
"use client";

import { useEffect, useState } from "react";
import s from "./helfer.module.css";

/**
 * WARUM DAS EINE CLIENT-INSEL IST und nicht drei Zeilen im HelferRahmen:
 * die Schwelle aus §3.4.3 Punkt 1 („ab 30 Minuten") ist eine Aussage ueber die
 * VERGEHENDE Zeit. Ein Fahrzeug-Check ist zehn bis zwanzig Minuten ohne
 * Navigation (§7.4.4); serverseitig entschieden faellt der Hinweis genau bei
 * dem Menschen aus, fuer den er geschrieben wurde — bei dem, der mit 35 Minuten
 * Restlaufzeit anfaengt zu zaehlen.
 *
 * DIE UHRZEIT WIRD NICHT HIER GEBAUT. Sie kommt fertig vom Server (`uhrzeit()`
 * aus `_lib/zeit.ts`, §4.5): der Browser einer Helferin steht nicht zwingend
 * auf Europe/Berlin, und eine im Client formatierte Zeit waere eine ZWEITE
 * Zonenquelle neben der einen, die §4.5 festlegt. Deshalb steht in dieser Datei
 * kein `toLocaleTimeString`, kein `Intl` — und `_ui/Restzeit.test.tsx` haelt das
 * fest, weil der Quelltext-Scan aus §3.8.2 es nicht abdeckt.
 *
 * `warntInitial` kommt ebenfalls vom Server und ist der STARTWERT des Zustands
 * — NICHT eine zweite Rechnung. Wuerde die Insel beim ersten Rendern selbst
 * `Date.now()` befragen, koennte sie an der Schwelle anders entscheiden als der
 * Server und Next meldete einen Hydrations-Unterschied. Ab dem ersten
 * `useEffect` rechnet nur noch der Client, im Minutentakt.
 *
 * ⚠️ `laeuftAb.getTime() - Date.now()` ist REINE ms-ARITHMETIK und gehoert
 * damit ausdruecklich NICHT nach `_lib/zeit.ts`: §5.16 fuehrt genau diese
 * Klasse als zonenunabhaengig, und die grep-bare Regel aus §4.5 verbietet
 * `new Date(jahr, monat, …)` sowie getHours/getMinutes/getFullYear/getMonth/
 * getDate — `getTime` steht dort aus gutem Grund nicht.
 */

/** 30 Minuten in Millisekunden — §3.4.3, Punkt 1. */
const WARNSCHWELLE_MS = 30 * 60_000;

export function Restzeit({
  uhrzeit,
  laeuftAb,
  warntInitial,
}: {
  uhrzeit: string;
  laeuftAb: Date;
  warntInitial: boolean;
}) {
  const [warnt, setWarnt] = useState(warntInitial);

  useEffect(() => {
    if (warnt) return;   // einmal gewarnt bleibt gewarnt — die Zeit laeuft nicht rueckwaerts
    const pruefen = () => {
      if (laeuftAb.getTime() - Date.now() <= WARNSCHWELLE_MS) setWarnt(true);
    };
    pruefen();                                   // die erste Pruefung sofort, nicht erst in 60 s
    const takt = setInterval(pruefen, 60_000);   // Minutentakt: die Schwelle ist in Minuten benannt
    return () => clearInterval(takt);            // sonst laeuft der Takt pro Navigation ein weiteres Mal
  }, [laeuftAb, warnt]);

  return (
    <span className={warnt ? `${s.restzeit} ${s.restzeitWarnt}` : s.restzeit} data-rolle="restzeit">
      {warnt ? (
        <span data-rolle="restzeit-warnung">
          Dein Zugang läuft um {uhrzeit} ab — Kärtchen bereithalten.
        </span>
      ) : (
        <>bis {uhrzeit}</>
      )}
    </span>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Restzeit.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_ui/Restzeit.tsx src/app/m/lagerbuch/_ui/Restzeit.test.tsx
git commit -m "feat(lagerbuch): _ui/Restzeit.tsx — die 30-Minuten-Schwelle als vergehende Zeit

Die Schwelle aus §3.4.3 Punkt 1 ist eine Aussage ueber VERGEHENDE Zeit. Ein
Fahrzeug-Check ist zehn bis zwanzig Minuten ohne Navigation; serverseitig
entschieden faellt der Hinweis genau bei dem Menschen aus, fuer den er
geschrieben ist — bei dem, der mit 35 Minuten Restlaufzeit anfaengt zu zaehlen.
Der Test faehrt mit vi.useFakeTimers() ueber die Schwelle und belegt, dass der
Hinweis OHNE Navigation erscheint.

Die Uhrzeit kommt FERTIG vom Server (uhrzeit() aus _lib/zeit.ts): eine im
Client formatierte Zeit waere eine zweite Zonenquelle. Kein
toLocaleTimeString, kein Intl in dieser Datei — der Quelltext-Scan aus §3.8.2
deckt das nicht ab, dieser Test schon.

warntInitial ist der Startwert des Zustands, nicht eine zweite Rechnung: eine
eigene Date.now()-Abfrage beim ersten Rendern koennte an der Schwelle anders
entscheiden als der Server, und Next meldete einen Hydrations-Unterschied."
```

---

### Task 68: `_ui/Stepper.tsx` — 56px, `noText`, `draft`, und die dritte Zustandsquelle

**Files:**
- Create: `src/app/m/lagerbuch/_ui/Stepper.tsx`
- Test: `src/app/m/lagerbuch/_ui/Stepper.test.tsx`

**Interfaces:**
- Consumes: `_ui/helfer.module.css` (T64) — `.stepper`, `.stepTaste`, `.stepWert`, `.stepAnzeige`.
- Produces:
  ```tsx
  // _ui/Stepper.tsx — "use client"
  export function Stepper(props: {
    wert: number;
    setWert: (wert: number) => void;
    min?: number;        // Vorgabe 1
    max?: number;        // Vorgabe 999
    noText?: boolean;    // Vorgabe false — der Wert ist dann NICHT tippbar
    beschriftung?: string; // Vorgabe "Menge" — speist die drei aria-label
  }): JSX.Element;
  ```
  **Konsumenten: NUR `_ui/CheckFlow.tsx` (T79) und `_ui/Entnahme.tsx` (T78) — beide in diesem Plan.**
  ⚠️ **Die sechs Verwaltungs-Stepper werden `InputNumber`** (§6.4.6, teil5.md:14671); dieser Baustein
  hat außerhalb des Helfer-Wegs **keinen** Konsumenten und soll auch keinen bekommen. §7.13.3 führt
  ihn unter „was dieses Kapitel für andere festlegt" — gemeint ist die **Bauform**, nicht ein Import.

**Drei Eigenschaften sind 1:1-Pflicht** (§7.7.3):

1. **`noText` bleibt.** `Stepper.tsx:19-21` begründet es: der Wert ist dort **bewusst** nicht tippbar,
   „damit unterwegs am Handy nicht versehentlich ins Zahlenfeld getippt wird". Genutzt beim Zählen
   (`CheckFlow.tsx:295`) und beim Nachfüllen (`:461`) — **beides Stellen, an denen ein Fehlgriff eine
   falsche Bestandsbuchung ist.**
2. **Der `draft`-Zustand bleibt, und der Parent-Wert bleibt die Quelle der Wahrheit.**
   `Stepper.tsx:24-28` löst einen echten Konflikt und schreibt ihn aus: „So bleibt der Parent-Wert die
   Quelle der Wahrheit und Klicks/Tastatur lesen nie einen veralteten Wert zurück." Wer den Stepper
   auf ein formulargebundenes `InputNumber` hebt, baut eine **dritte** Zustandsquelle auf — in einem
   Feld, dessen falscher Wert eine falsche Bestandsbuchung ist (Falle 45).
3. **Die großzügigen Obergrenzen bleiben.** `max={9999}` beim Zählen und beim Druck: echter
   Überbestand muss zählbar sein, sonst korrigiert der Abgleich real vorhandene Teile **still**
   heraus; eine überfüllte Flasche muss ablesbar bleiben. ⚠️ Die **serverseitigen** Deckel liegen
   darüber (99 999 bzw. 9 999, §5.15) — sie fangen den Tippfehler, nicht die Bedienung.

**Was sich ändert:** die `sm`-Variante **entfällt**; es gibt genau eine Größe, 56px an beiden Flächen
(§7.7.3, Entscheidung 33 d). Die Gegenrechnung steht in der Spec: 30 → 56px sind 26px je Zählzeile,
auf zwanzig Positionen etwa 520px. Ein Teil kommt über den Wegfall der Hinweiszeile zurück; der Rest
wird akzeptiert — **eine Zeile, die man mit Handschuhen nicht trifft, ist teurer als eine, die man
scrollen muss.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/Stepper.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, exists, fill, click, rerender } from "@/app/m/qr/_lib/test-dom";
import { Stepper } from "./Stepper";

const QUELLE = "src/app/m/lagerbuch/_ui/Stepper.tsx";
const MINUS = "button[aria-label='Menge verringern']";
const PLUS = "button[aria-label='Menge erhöhen']";

afterEach(async () => { await unmount(); });

describe("Stepper — Klemmen an beiden Enden", () => {
  it("`−` unter `min` klemmt", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={1} setWert={setWert} min={1} max={9} />);
    await click(MINUS);
    expect(setWert).toHaveBeenCalledWith(1);
  });

  it("`+` ueber `max` klemmt", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={9} setWert={setWert} min={0} max={9} />);
    await click(PLUS);
    expect(setWert).toHaveBeenCalledWith(9);
  });

  it("Direkteingabe ueber `max` klemmt — und die ANZEIGE zeigt den geklemmten Wert", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={3} setWert={setWert} min={0} max={20} />);
    await fill("input", "999");
    expect(setWert).toHaveBeenLastCalledWith(20);
    expect(query<HTMLInputElement>("input").value).toBe("20");
  });

  it("nicht-Ziffern werden verworfen, nicht als NaN committet", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={3} setWert={setWert} min={0} max={20} />);
    await fill("input", "1a2");
    expect(setWert).toHaveBeenLastCalledWith(12);
  });
});

describe("Stepper — das leere Feld", () => {
  it("committet NICHT als 0", async () => {
    // Loeschen und neu tippen ist der Normalfall. Ein leeres Feld als 0 zu
    // committen bucht bei einem Zwischenschritt der Eingabe eine Null — und die
    // ist in der Zaehlliste eine falsche Bestandsbuchung.
    const setWert = vi.fn();
    await mount(<Stepper wert={7} setWert={setWert} min={0} max={99} />);
    await fill("input", "");
    expect(setWert).not.toHaveBeenCalled();
    expect(query<HTMLInputElement>("input").value).toBe("");
  });

  it("faellt beim Verlassen auf den Parent-Wert zurueck", async () => {
    await mount(<Stepper wert={7} setWert={() => {}} min={0} max={99} />);
    await fill("input", "");
    query<HTMLInputElement>("input").dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    await rerender(<Stepper wert={7} setWert={() => {}} min={0} max={99} />);
    expect(query<HTMLInputElement>("input").value).toBe("7");
  });
});

describe("Stepper — der `draft`-Zustand haelt den Parent-Wert als Quelle der Wahrheit", () => {
  it("ein Klick nach einer Direkteingabe liest den PARENT-Wert, nicht den Entwurf", async () => {
    // Stepper.tsx:24-28 loest genau diesen Konflikt und schreibt ihn aus: „So
    // bleibt der Parent-Wert die Quelle der Wahrheit und Klicks/Tastatur lesen
    // nie einen veralteten Wert zurueck." Wer den Stepper auf ein
    // formulargebundenes InputNumber hebt, baut eine DRITTE Zustandsquelle auf
    // — in einem Feld, dessen falscher Wert eine falsche Bestandsbuchung ist
    // (Falle 45).
    const setWert = vi.fn();
    await mount(<Stepper wert={5} setWert={setWert} min={0} max={99} />);
    await fill("input", "40");
    // Der Parent hat noch NICHT neu gerendert (Serverantwort ausstehend).
    await click(PLUS);
    expect(setWert).toHaveBeenLastCalledWith(6);   // 5 + 1, nicht 41
  });
});

describe("Stepper — `noText`", () => {
  it("rendert KEIN <input>", async () => {
    // „damit unterwegs am Handy nicht versehentlich ins Zahlenfeld getippt
    // wird" (Stepper.tsx:19-21). Genutzt beim Zaehlen und beim Nachfuellen —
    // beides Stellen, an denen ein Fehlgriff eine falsche Bestandsbuchung ist.
    await mount(<Stepper wert={4} setWert={() => {}} noText />);
    expect(exists("input")).toBe(false);
    expect(query("[data-rolle='stepanzeige']").textContent).toBe("4");
  });

  it("die beiden Tasten bleiben bedienbar und benannt", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={4} setWert={setWert} min={0} max={9999} noText />);
    await click(PLUS);
    expect(setWert).toHaveBeenCalledWith(5);
    expect(exists(MINUS)).toBe(true);
  });
});

describe("Stepper — Benennung und Mass", () => {
  it("beide Tasten tragen ein aria-label — mit 56px ohne Text die einzige Benennung", async () => {
    await mount(<Stepper wert={1} setWert={() => {}} />);
    expect(exists(MINUS)).toBe(true);
    expect(exists(PLUS)).toBe(true);
  });

  it("die Beschriftung ist ueberschreibbar — mehrere Stepper je Bildschirm brauchen sie", async () => {
    // In der Zaehlliste stehen zwanzig Stepper untereinander. „Menge erhoehen"
    // zwanzigmal ist fuer eine Bildschirmleserin keine Benennung.
    await mount(<Stepper wert={1} setWert={() => {}} beschriftung="Kompresse 10×10" />);
    expect(exists("button[aria-label='Kompresse 10×10 verringern']")).toBe(true);
    expect(exists("button[aria-label='Kompresse 10×10 erhöhen']")).toBe(true);
  });

  it("hat KEINE `sm`-Variante mehr", () => {
    // §7.7.3: es gibt genau eine Groesse. Eine zweite waere die Ruecknahme des
    // Tap-Masses durch die Hintertuer.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/\bsm\b/);
  });

  it("ist eine Client-Insel ohne antd und ohne lucide", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/^"use client";/m);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Stepper.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./Stepper"`.

- [ ] **Schritt 3: `_ui/Stepper.tsx` schreiben**

```tsx
"use client";

import { useState } from "react";
import s from "./helfer.module.css";

/**
 * DER MODUL-EIGENE STEPPER — §7.7.3, Entscheidung 33 (d).
 *
 * Kein `InputNumber`, kein `Form.Item`. Zwei Gruende, und beide sind belegt:
 * `core/theme/tokens.ts:33` setzt TAP = 56 mit der Begruendung „Bedienung mit
 * Handschuhen … eine Einsatzanforderung, keine Stilfrage", und ein
 * formulargebundenes Feld baute die DRITTE Zustandsquelle auf, die
 * `Stepper.tsx:24-28` bewusst aufgeloest hat (Falle 45).
 *
 * DIE `sm`-VARIANTE ENTFAELLT. Es gibt genau eine Groesse. Die Gegenrechnung
 * steht in §7.7.3: 30 -> 56px sind 26px je Zaehlzeile, auf zwanzig Positionen
 * etwa 520px — gut ein halber Bildschirm. Ein Teil kommt ueber den Wegfall der
 * Hinweiszeile bei Wiederholzeilen zurueck (§7.7.2 Punkt 3). Der Rest wird
 * akzeptiert: eine Zeile, die man mit Handschuhen nicht trifft, ist teurer als
 * eine, die man scrollen muss.
 *
 * DIE GROSSZUEGIGEN OBERGRENZEN BLEIBEN AUFRUFERSACHE (`max={9999}`): echter
 * Ueberbestand muss zaehlbar sein, sonst korrigiert der Abgleich real
 * vorhandene Teile STILL heraus, und eine ueberfuellte Flasche muss ablesbar
 * bleiben. Die SERVERSEITIGEN Deckel liegen darueber (99 999 bzw. 9 999,
 * §5.15) — sie fangen den Tippfehler, nicht die Bedienung.
 */
export function Stepper({
  wert,
  setWert,
  min = 1,
  max = 999,
  noText = false,
  beschriftung = "Menge",
}: {
  wert: number;
  setWert: (wert: number) => void;
  min?: number;
  max?: number;
  /**
   * Nur +/−, der Wert ist NICHT tippbar. 1:1 aus `Stepper.tsx:19-21`, samt
   * Begruendung: „damit unterwegs am Handy nicht versehentlich ins Zahlenfeld
   * getippt wird". Genutzt beim Zaehlen (`CheckFlow.tsx:295`) und beim
   * Nachfuellen (`:461`) — beides Stellen, an denen ein Fehlgriff eine falsche
   * Bestandsbuchung ist.
   */
  noText?: boolean;
  /**
   * Speist die drei `aria-label`. In der Zaehlliste stehen zwanzig Stepper
   * untereinander; „Menge erhoehen" zwanzigmal ist fuer eine
   * Bildschirmleserin keine Benennung.
   */
  beschriftung?: string;
}) {
  const klemmen = (n: number) => Math.min(max, Math.max(min, n));

  /**
   * `draft` haelt NUR den Roh-Text WAEHREND der Direkteingabe; `null` heisst
   * „das Feld spiegelt den `wert`-Prop". So bleibt der Parent-Wert die Quelle
   * der Wahrheit, und Klicks/Tastatur lesen nie einen veralteten Wert zurueck
   * (1:1 aus `Stepper.tsx:24-28`).
   */
  const [draft, setDraft] = useState<string | null>(null);
  const anzeige = draft ?? String(wert);

  function tippen(roh: string) {
    const nurZiffern = roh.replace(/\D/g, "");
    if (nurZiffern === "") {
      // Leere Eingabe erlauben (Loeschen und neu tippen) — NICHT als 0
      // committen. Eine committete Null waere in der Zaehlliste eine falsche
      // Bestandsbuchung, ausgeloest von einem Zwischenschritt der Eingabe.
      setDraft("");
      return;
    }
    const geklemmt = klemmen(parseInt(nurZiffern, 10));
    setDraft(String(geklemmt));   // Anzeige = geklemmter Wert, kein Tippen ueber max
    setWert(geklemmt);
  }

  /** Zurueck auf den `wert`-Prop; ein leeres oder ungueltiges Feld verwirft die Eingabe. */
  function abschliessen() {
    setDraft(null);
  }

  return (
    <div className={s.stepper}>
      <button
        type="button"
        className={s.stepTaste}
        aria-label={`${beschriftung} verringern`}
        onClick={() => { setDraft(null); setWert(klemmen(wert - 1)); }}
      >
        {/* Lokales Inline-SVG (E3). `aria-hidden`, weil die Taste selbst benannt
            ist; Teil 5, T101 hebt es nach `_ui/ikonen.tsx`. */}
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>

      {noText ? (
        <div className={s.stepAnzeige} data-rolle="stepanzeige" aria-label={beschriftung}>
          {wert}
        </div>
      ) : (
        <input
          className={s.stepWert}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={beschriftung}
          value={anzeige}
          onChange={(e) => tippen(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={abschliessen}
        />
      )}

      <button
        type="button"
        className={s.stepTaste}
        aria-label={`${beschriftung} erhöhen`}
        onClick={() => { setDraft(null); setWert(klemmen(wert + 1)); }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Stepper.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_ui/Stepper.tsx src/app/m/lagerbuch/_ui/Stepper.test.tsx
git commit -m "feat(lagerbuch): _ui/Stepper.tsx — 56px Tap-Mass, eine Groesse, drei 1:1-Eigenschaften

core/theme/tokens.ts:33 setzt TAP = 56 mit der Begruendung 'Bedienung mit
Handschuhen … eine Einsatzanforderung, keine Stilfrage'. lagerbuch liegt bei
42×42, in der sm-Variante bei 30×30. Die sm-Variante ENTFAELLT: eine zweite
Groesse waere die Ruecknahme des Tap-Masses durch die Hintertuer.

Drei Eigenschaften wandern 1:1 mit, samt Kommentaren: noText (der Wert ist
bewusst nicht tippbar, damit am Handy nicht versehentlich ins Zahlenfeld
getippt wird — genutzt an zwei Stellen, an denen ein Fehlgriff eine falsche
Bestandsbuchung ist), der draft-Zustand (der Parent-Wert bleibt die Quelle der
Wahrheit; ein InputNumber baute die dritte Zustandsquelle auf, Falle 45), und
die grosszuegigen Obergrenzen des Aufrufers.

Neu: die aria-label sind ueberschreibbar. In der Zaehlliste stehen zwanzig
Stepper untereinander, und 'Menge erhoehen' zwanzigmal ist fuer eine
Bildschirmleserin keine Benennung."
```

---

### Task 69: `_ui/OeffentlicherRahmen.tsx` und `_ui/LeerZustand.tsx` — der Träger ohne Sitzung, und der Rückweg als Pflicht

**Files:**
- Create: `src/app/m/lagerbuch/_ui/OeffentlicherRahmen.tsx`
- Create: `src/app/m/lagerbuch/_ui/LeerZustand.tsx`
- Test: `src/app/m/lagerbuch/_ui/rahmen.test.tsx`

**Interfaces:**
- Consumes: `_ui/helfer.module.css` (T64) — `.rahmen`, `.streifen`, `.oeffentlichInhalt`, `.leer`,
  `.leerWeg`, `.rueckweg`.
- Produces:
  ```tsx
  // _ui/OeffentlicherRahmen.tsx — KEIN "use client" (Server Component)
  export function OeffentlicherRahmen(props: { children: React.ReactNode }): JSX.Element;

  // _ui/LeerZustand.tsx — KEIN "use client" (Server Component)
  export function LeerZustand(props: {
    titel: string;
    text: string;
    weg: { href: string; text: string };   // PFLICHT, nicht optional (§11.7)
  }): JSX.Element;
  ```
  Konsumenten `OeffentlicherRahmen`: `page.tsx` (T81, das Gate). Konsumenten `LeerZustand`:
  `helfer/check/page.tsx` (T85, kein Fahrzeug angelegt), `_ui/CheckFlow.tsx` (T79, Fahrzeug ohne
  Soll, Gerät und Flasche) und `a/[artikelId]/page.tsx` (T83, Etikett ohne Artikel,
  Entscheidung 8-C).

**Warum `OeffentlicherRahmen` und nicht `.rahmen` direkt in der Gate-Seite.** Der Variablensatz hängt
an `.rahmen` (§3.3). Schriebe die Gate-Seite die Klasse selbst, gäbe es **zwei** Stellen, an denen
jemand sie vergessen kann — und der Fehler wäre **still**: jedes `var(--lb-…)` fiele auf
`transparent` zurück, und das Gate stünde in schwarzem Text auf weißem Grund, ohne Fehlermeldung
(Falle 2). Ein benannter Träger ist eine Stelle.

**Warum `LeerZustand` eine eigene Datei ist und der Weg ein PFLICHT-Prop** (E5). Drei Konsumenten,
dreimal dieselben zwölf Zeilen — und **dreimal Gelegenheit, den Rückweg zu vergessen.** §11.7 stützt
sich darauf, dass **jeder** gestaltete Zustand einen benannten Weg zurück trägt. Als Optional wäre
das eine Bitte; als Pflicht-Prop ist es eine Zusage, die `typecheck` durchsetzt.

⚠️ **Kein `notFound()` in einem dieser Zustände** (Entscheidung 36 a). Die Suite-404
(`src/app/not-found.tsx`) ersetzt alle Modul-Layouts, trägt Geist statt der Modulschrift und einen
antd-`Button` (`:57`). Auf einem Weg, den eine Person **mit einem gedruckten Gegenstand in der Hand**
nimmt, ist das die falsche Antwort: HTTP 200 mit einem Satz, der sagt, was zu tun ist.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/rahmen.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { OeffentlicherRahmen } from "./OeffentlicherRahmen";
import { LeerZustand } from "./LeerZustand";

afterEach(async () => { await unmount(); });

describe("OeffentlicherRahmen", () => {
  it("traegt die `.rahmen`-Klasse — den Traeger ALLER --lb-Variablen", async () => {
    // Schriebe jede Seite die Klasse selbst, gaebe es mehrere Stellen, an denen
    // jemand sie vergisst — und der Fehler waere still: jedes var(--lb-…) fiele
    // auf transparent zurueck (Falle 2).
    await mount(<OeffentlicherRahmen><p>Inhalt</p></OeffentlicherRahmen>);
    expect(query("div").className).toMatch(/rahmen/);
  });

  it("rendert den roten Streifen und den Inhalt", async () => {
    await mount(<OeffentlicherRahmen><p data-rolle="kind">Inhalt</p></OeffentlicherRahmen>);
    expect(exists("[data-rolle='lb-streifen']")).toBe(true);
    expect(query("[data-rolle='kind']").textContent).toBe("Inhalt");
  });

  it("rendert WEDER Kopf NOCH Tab-Leiste — hier gibt es keine Sitzung", async () => {
    // Eine Tab-Leiste auf dem Gate zeigte zwei Ziele, die ohne Sitzung beide
    // sofort wieder aufs Gate zuruecklaufen.
    await mount(<OeffentlicherRahmen><p>Inhalt</p></OeffentlicherRahmen>);
    expect(exists("nav")).toBe(false);
    expect(exists("header")).toBe(false);
  });

  it("ist eine Server Component", () => {
    const q = readFileSync("src/app/m/lagerbuch/_ui/OeffentlicherRahmen.tsx", "utf8");
    expect(q).not.toMatch(/"use client"/);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });
});

describe("LeerZustand — der Rueckweg ist PFLICHT (§11.7, E5)", () => {
  it("rendert Titel, Text und den benannten Weg", async () => {
    await mount(
      <LeerZustand
        titel="Kein Fahrzeug angelegt"
        text="Die Verwaltung muss zuerst ein Fahrzeug mit Soll-Bestückung pflegen."
        weg={{ href: "/helfer", text: "Zur Entnahme" }}
      />,
    );
    expect(query("[data-rolle='leer-titel']").textContent).toBe("Kein Fahrzeug angelegt");
    expect(query("[data-rolle='leer-text']").textContent).toContain("Soll-Bestückung");
    const weg = query<HTMLAnchorElement>("[data-rolle='leer-weg']");
    expect(weg.getAttribute("href")).toBe("/helfer");
    expect(weg.textContent).toBe("Zur Entnahme");
  });

  it("der Weg traegt einen AEUSSEREN Pfad", async () => {
    // Ein innerer Pfad (/m/lagerbuch/helfer) wuerde auf dem aeusseren Host
    // DOPPELT praefixiert (Falle 63). Die Gegenkonvention gilt nur fuer
    // revalidatePath.
    await mount(
      <LeerZustand titel="X" text="Y" weg={{ href: "/helfer/check", text: "Zum Check" }} />,
    );
    expect(query<HTMLAnchorElement>("[data-rolle='leer-weg']").getAttribute("href"))
      .not.toMatch(/^\/m\/lagerbuch/);
  });

  it("rendert genau EINEN Weg — kein zweiter, konkurrierender Ausgang", async () => {
    await mount(<LeerZustand titel="X" text="Y" weg={{ href: "/helfer", text: "Zurück" }} />);
    expect(queryAll("a").length).toBe(1);
  });

  it("ist eine Server Component ohne antd", () => {
    const q = readFileSync("src/app/m/lagerbuch/_ui/LeerZustand.tsx", "utf8");
    expect(q).not.toMatch(/"use client"/);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });

  it("ruft KEIN notFound() — Entscheidung 36 (a)", () => {
    // Die Suite-404 ersetzt alle Modul-Layouts, traegt Geist statt der
    // Modulschrift und einen antd-Button (:57). Auf einem Weg, den eine Person
    // mit einem gedruckten Gegenstand in der Hand nimmt, ist das die falsche
    // Antwort.
    expect(readFileSync("src/app/m/lagerbuch/_ui/LeerZustand.tsx", "utf8"))
      .not.toMatch(/notFound/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/rahmen.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./OeffentlicherRahmen"`.

- [ ] **Schritt 3: Beide Dateien schreiben**

`src/app/m/lagerbuch/_ui/OeffentlicherRahmen.tsx`:

```tsx
import s from "./helfer.module.css";

/**
 * DER TRAEGER FUER SEITEN OHNE SITZUNG — heute genau eine: das Gate
 * (`page.tsx`, §7.2.4).
 *
 * KEIN "use client": eine Server Component, die nur `children` durchreicht.
 *
 * WARUM ER EXISTIERT und die Gate-Seite die Klasse nicht selbst schreibt: der
 * gesamte Variablensatz (`--lb-*`, `--lb-ampel-*`) haengt an `.rahmen` (§3.3,
 * §7.7.4). Schriebe jede Seite die Klasse selbst, gaebe es mehrere Stellen, an
 * denen jemand sie vergisst — und der Fehler waere STILL: eine nicht
 * aufloesbare CSS-Variable ist gueltiges CSS und faellt auf `transparent`
 * zurueck (Falle 2). Ein benannter Traeger ist EINE Stelle.
 *
 * KEIN Kopf und KEINE Tab-Leiste. Beide setzen eine Sitzung voraus; eine
 * Tab-Leiste auf dem Gate zeigte zwei Ziele, die ohne Sitzung beide sofort
 * wieder hierher zuruecklaufen.
 */
export function OeffentlicherRahmen({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.rahmen}>
      <div className={s.streifen} data-rolle="lb-streifen" />
      <div className={s.oeffentlichInhalt}>{children}</div>
    </div>
  );
}
```

`src/app/m/lagerbuch/_ui/LeerZustand.tsx`:

```tsx
import Link from "next/link";
import s from "./helfer.module.css";

/**
 * DER GESTALTETE LEERZUSTAND — Entscheidung 36 (a), §11.7.
 *
 * KEIN "use client": eine Server Component.
 *
 * DREI KONSUMENTEN (E5): `helfer/check/page.tsx` (kein Fahrzeug angelegt),
 * `_ui/CheckFlow.tsx` (Fahrzeug ohne Soll, Geraet und Flasche) und
 * `a/[artikelId]/page.tsx` (Etikett ohne Artikel, Entscheidung 8-C). Dreimal
 * dieselben zwoelf Zeilen waeren dreimal Gelegenheit, den Rueckweg zu
 * vergessen.
 *
 * ⚠️ `weg` IST PFLICHT UND NICHT OPTIONAL. §11.7 stuetzt sich darauf, dass
 * JEDER gestaltete Zustand einen benannten Weg zurueck traegt. Als Optional
 * waere das eine Bitte; als Pflicht-Prop ist es eine Zusage, die `typecheck`
 * durchsetzt.
 *
 * ⚠️ KEIN `notFound()`. Die Suite-404 (`src/app/not-found.tsx`) ersetzt alle
 * Modul-Layouts, traegt Geist statt der Modulschrift und einen antd-`Button`
 * (`:57`). Auf einem Weg, den eine Person MIT EINEM GEDRUCKTEN GEGENSTAND IN
 * DER HAND nimmt, ist das die falsche Antwort: HTTP 200 mit einem Satz, der
 * sagt, was zu tun ist. Vorbild im Haus:
 * `m/files/(oeffentlich-inbox)/u/[token]/page.tsx:13-17`.
 *
 * ⚠️ `weg.href` ist ein AEUSSERER Pfad (`/helfer`, nicht
 * `/m/lagerbuch/helfer`). Der Browser steht auf dem Modul-Host, `decideRoute`
 * praefixiert danach; ein innerer Pfad wuerde doppelt praefixiert (§2.1 g).
 */
export function LeerZustand({
  titel,
  text,
  weg,
}: {
  titel: string;
  text: string;
  weg: { href: string; text: string };
}) {
  return (
    <div className={`${s.karte} ${s.leer}`}>
      <div className={s.zeileName} data-rolle="leer-titel">{titel}</div>
      <p className={s.fussnote} data-rolle="leer-text">{text}</p>
      <Link className={`${s.rueckweg} ${s.leerWeg}`} href={weg.href} data-rolle="leer-weg">
        {weg.text}
      </Link>
    </div>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/rahmen.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_ui/OeffentlicherRahmen.tsx \
        src/app/m/lagerbuch/_ui/LeerZustand.tsx \
        src/app/m/lagerbuch/_ui/rahmen.test.tsx
git commit -m "feat(lagerbuch): _ui/OeffentlicherRahmen.tsx und _ui/LeerZustand.tsx

Der Variablensatz haengt an .rahmen. Schriebe jede sitzungslose Seite die
Klasse selbst, gaebe es mehrere Stellen, an denen jemand sie vergisst — und der
Fehler waere still: eine nicht aufloesbare CSS-Variable ist gueltiges CSS und
faellt auf transparent zurueck. Ein benannter Traeger ist eine Stelle.

LeerZustand bekommt den Rueckweg als PFLICHT-Prop, nicht als Optional: drei
Konsumenten (Check ohne Fahrzeug, Fahrzeug ohne alles, Etikett ohne Artikel)
sind dreimal Gelegenheit, ihn zu vergessen, und §11.7 stuetzt sich darauf, dass
jeder gestaltete Zustand einen benannten Weg zurueck traegt.

Kein notFound() (Entscheidung 36 a): die Suite-404 ersetzt alle Modul-Layouts,
traegt Geist statt der Modulschrift und einen antd-Button. Auf einem Weg, den
eine Person mit einem gedruckten Gegenstand in der Hand nimmt, ist das die
falsche Antwort."
```

---

### Task 70: `_ui/HelferChip.tsx` — die Namensfalle, an genau einer Stelle aufgelöst

**Files:**
- Create: `src/app/m/lagerbuch/_ui/HelferChip.tsx`
- Test: `src/app/m/lagerbuch/_ui/HelferChip.test.tsx`

**Interfaces:**
- Consumes: `_lib/format.ts` (Teil 3, T39) — **nur der Typ** `AmpelTon = "rot" | "gelb" | "ok" | "grau"`
  (`import type`); `_ui/helfer.module.css` (T64) — `.chip`, `.ok`, `.gelb`, `.rot`, `.grau`.
- Produces:
  ```tsx
  // _ui/HelferChip.tsx — KEIN "use client": laeuft in RSC UND in Client-Inseln
  export function HelferChip(props: {
    ton: AmpelTon;
    children: React.ReactNode;
  }): JSX.Element;
  ```
  **Drei Konsumenten:** `_ui/Entnahme.tsx` (T78), `_ui/CheckFlow.tsx` (T79) und
  `a/[artikelId]/page.tsx` (T83).

**Der Grund ist eine benannte Falle** (E4, §5.17). Ein direkt interpoliertes `chip-${ampel}` ergäbe
ein undefiniertes `chip-gruen` **mit Padding und Radius, aber ohne Farbe** — still, weil eine nicht
existente CSS-Klasse gültiges Markup ist. **In einem CSS-Modul ist die Falle schärfer:**
`` s[`chip-${ton}`] `` liefert `undefined`, und React rendert `class="undefined"`.

→ Genau **eine** Stelle bildet `AmpelTon` auf eine Modulklasse ab: diese Datei, mit einem
**vollständigen `Record<AmpelTon, string>`** — keine Interpolation, kein Index-Zugriff auf `s`. Der
Unterschied ist nicht Stil: ein vollständiges `Record` ist eine Zusage, die `typecheck` durchsetzt,
sobald jemand einen fünften Ton einführt.

⚠️ **`grau` ist KEIN Ampelwert** und steht außerhalb der Rangfolge (§6.6.2). Er trägt „kein Datum
gepflegt" (`geraet.ts:35`) und „keine Messung" (`sauerstoff.ts:51`) und darf **nie** als grün
dargestellt werden.

⚠️ **`_ui/Chip.tsx` aus §6.6.3 ist eine ANDERE Datei** (Teil 5, T105): sie liest
`verwaltung.module.css`. Zwei Chips sind kein Versehen — die beiden Ansichtsklassen haben
verschiedene Stylesheets, und ein geteilter Chip zöge `verwaltung.module.css` in den Helfer-Zweig.

⚠️ **Der Chip trägt IMMER Text.** Es gibt keinen Modus „nur Farbe" (`docs/design/README.md`,
„Bedeutung nie allein über Farbe"). `children` ist deshalb Pflicht.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/HelferChip.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query } from "@/app/m/qr/_lib/test-dom";
import { HelferChip } from "./HelferChip";

const QUELLE = "src/app/m/lagerbuch/_ui/HelferChip.tsx";

afterEach(async () => { await unmount(); });

describe("HelferChip — die Namensfalle aus §5.17", () => {
  for (const ton of ["rot", "gelb", "ok", "grau"] as const) {
    it(`\`${ton}\` bekommt eine ECHTE Klasse, nie "undefined"`, async () => {
      // `s[\`chip-${ton}\`]` liefert in einem CSS-Modul `undefined`, und React
      // rendert `class="undefined"` — Padding und Radius stehen, die Farbe
      // fehlt, und niemand meldet es.
      await mount(<HelferChip ton={ton}>Text</HelferChip>);
      const el = query("[data-rolle='helfer-chip']");
      expect(el.className).not.toContain("undefined");
      expect(el.className.trim().split(/\s+/).length).toBe(2);   // .chip + Ton
    });
  }

  it("die vier Tonklassen sind PAARWEISE VERSCHIEDEN", async () => {
    // Ein Record, in dem zwei Toene dieselbe Klasse tragen, ist typkorrekt und
    // still: „abgelaufen" saehe aus wie „in Ordnung".
    const klassen = new Set<string>();
    for (const ton of ["rot", "gelb", "ok", "grau"] as const) {
      await mount(<HelferChip ton={ton}>Text</HelferChip>);
      klassen.add(query("[data-rolle='helfer-chip']").className);
      await unmount();
    }
    expect(klassen.size).toBe(4);
  });

  it("rendert den Text — es gibt keinen Modus ‚nur Farbe'", async () => {
    // docs/design/README.md: „Bedeutung nie allein ueber Farbe".
    await mount(<HelferChip ton="rot">abgelaufen</HelferChip>);
    expect(query("[data-rolle='helfer-chip']").textContent).toBe("abgelaufen");
  });
});

describe("HelferChip — Bauform", () => {
  it("benutzt ein vollstaendiges Record, KEINE Interpolation und KEINEN Index-Zugriff auf `s`", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/Record<AmpelTon, string>/);
    expect(q).not.toMatch(/s\[`/);       // kein s[`chip-${…}`]
    expect(q).not.toMatch(/\$\{ton\}/);  // keine Interpolation eines Klassennamens
  });

  it("importiert `AmpelTon` als TYP — kein Laufzeit-Zyklus nach `_lib/format.ts`", () => {
    expect(readFileSync(QUELLE, "utf8")).toMatch(/import type \{[^}]*AmpelTon/);
  });

  it("laeuft in RSC UND in Client-Inseln: kein \"use client\", kein antd", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/"use client"/);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });

  it("liest NICHT `verwaltung.module.css` — das zoege die andere Ansichtsklasse herein", () => {
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/verwaltung\.module\.css/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/HelferChip.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./HelferChip"`.

- [ ] **Schritt 3: `_ui/HelferChip.tsx` schreiben**

```tsx
import type { AmpelTon } from "../_lib/format";
import s from "./helfer.module.css";

/**
 * DER STATUSCHIP DES HELFER-WEGS — §5.17, E4.
 *
 * KEIN "use client": er rendert in Server Components (`a/[artikelId]/page.tsx`)
 * UND in Client-Inseln (`Entnahme`, `CheckFlow`). Er ruft nichts auf
 * Modulebene, also greift auch Falle 7 nicht.
 *
 * DIE NAMENSFALLE, WEGEN DER ES IHN GIBT (§5.17): ein direkt interpoliertes
 * `chip-${ampel}` ergaebe ein undefiniertes `chip-gruen` MIT Padding und
 * Radius, aber OHNE Farbe — still, weil eine nicht existente CSS-Klasse
 * gueltiges Markup ist. In einem CSS-MODUL ist die Falle SCHAERFER:
 * `s[`chip-${ton}`]` liefert `undefined`, und React rendert `class="undefined"`.
 *
 * DESHALB EIN VOLLSTAENDIGES `Record<AmpelTon, string>` und kein Index-Zugriff.
 * Das ist kein Stil: sobald jemand einen fuenften Ton einfuehrt, wird
 * `typecheck` rot — statt dass ein Chip farblos rendert.
 *
 * ⚠️ `grau` IST KEIN AMPELWERT und steht ausserhalb der Rangfolge (§6.6.2). Er
 * traegt „kein Datum gepflegt" (geraet.ts:35) und „keine Messung"
 * (sauerstoff.ts:51) und darf NIE als gruen dargestellt werden.
 *
 * ⚠️ `_ui/Chip.tsx` (§6.6.3, Teil 5) ist eine ANDERE Datei: sie liest
 * `verwaltung.module.css`. Zwei Chips sind kein Versehen — die beiden
 * Ansichtsklassen haben verschiedene Stylesheets, und ein geteilter Chip zoege
 * `verwaltung.module.css` in den Helfer-Zweig.
 */
const KLASSE: Record<AmpelTon, string> = {
  rot: s.rot,
  gelb: s.gelb,
  ok: s.ok,
  grau: s.grau,
};

export function HelferChip({ ton, children }: { ton: AmpelTon; children: React.ReactNode }) {
  // `children` ist PFLICHT: es gibt keinen Modus „nur Farbe"
  // (docs/design/README.md, „Bedeutung nie allein ueber Farbe").
  return (
    <span className={`${s.chip} ${KLASSE[ton]}`} data-rolle="helfer-chip">
      {children}
    </span>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/HelferChip.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_ui/HelferChip.tsx src/app/m/lagerbuch/_ui/HelferChip.test.tsx
git commit -m "feat(lagerbuch): _ui/HelferChip.tsx — die Namensfalle an genau einer Stelle aufgeloest

§5.17 schreibt sie aus: ein interpoliertes chip-\${ampel} ergibt ein
undefiniertes chip-gruen mit Padding und Radius, aber ohne Farbe — still, weil
eine nicht existente CSS-Klasse gueltiges Markup ist. In einem CSS-Modul ist es
schaerfer: s[\`chip-\${ton}\`] liefert undefined, und React rendert
class='undefined'.

Ein vollstaendiges Record<AmpelTon, string> loest das nicht kosmetisch, sondern
strukturell: sobald jemand einen fuenften Ton einfuehrt, wird typecheck rot,
statt dass ein Chip farblos rendert. Der Test haelt zusaetzlich fest, dass die
vier Tonklassen PAARWEISE verschieden sind — ein Record mit einer Dublette waere
typkorrekt und liesse 'abgelaufen' wie 'in Ordnung' aussehen.

Kein 'use client': der Chip rendert in RSC und in Client-Inseln. Und er liest
NICHT verwaltung.module.css — das zoege die andere Ansichtsklasse in den
Helfer-Zweig (E4)."
```

---

### Task 71: `_ui/ArtikelSuche.tsx` — die Liste, die im Client filtert, und die eine Faltung

**Files:**
- Create: `src/app/m/lagerbuch/_ui/ArtikelSuche.tsx`
- Test: `src/app/m/lagerbuch/_ui/ArtikelSuche.test.tsx`

**Interfaces:**
- Consumes: `_lib/suche.ts` (Teil 1, T5) — `falte(s: string): string`; `_ui/helfer.module.css` (T64) —
  `.suchfeld`, `.karte`, `.zeile`, `.zeileHaupt`, `.zeileName`, `.zeileMeta`, `.fach`, `.kartePad`,
  `.fussnote`.
- Produces:
  ```tsx
  // _ui/ArtikelSuche.tsx — "use client"
  export type ArtikelZeileHelfer = {
    id: string; name: string; einheit: string; fach: string; bestand: number;
  };
  export function ArtikelSuche(props: { artikel: ArtikelZeileHelfer[] }): JSX.Element;
  ```
  **Einziger Konsument:** `helfer/page.tsx` (T84).

**Warum sie im Client filtert und nicht über `searchParams`.** §7.8.2 Punkt 6 ist eindeutig: es gibt
**keinen** `router.push`/`router.replace` auf dem Helfer-Weg. Ein serverseitiger Filter bräuchte je
Tastendruck eine Navigation — auf einem Telefon in einer Fahrzeughalle die teuerste denkbare Form.
Die Liste ist bereits vollständig im RSC-Payload; sie ein zweites Mal zu holen, um sie zu **kürzen**,
wäre die falsche Richtung.

⚠️ **Anders als beim Fahrzeug-Check ist das hier KEIN Datenschutzproblem** (§7.9.1): die Artikelliste
ist die Menge, aus der die Helferin ohnehin auswählt — sie ist der Zweck der Seite, nicht ein
Nebenprodukt. Der Fahrzeug-Check schneidet, weil er sonst die Soll-Bestückung **der gesamten
Organisation** überträgt.

**Die Faltung kommt aus `_lib/suche.ts` (Teil 1, T5) und wird NICHT nachgebaut.** Der Bestand filtert
mit `a.name.toLowerCase().includes(q.trim().toLowerCase())` (`HelferListe.tsx:11`) — das findet
„Kompresse" nicht, wenn jemand „KOMPRESSE" tippt (das schon), aber es findet **„Mullbinde" nicht bei
„mullbinde 6cm"** und es behandelt Umlaute uneinheitlich zur Verwaltungssuche. Zwei Faltungen an zwei
Orten sind der Ort, an dem sie auseinanderlaufen; §5 hat sie deshalb schon in Teil 1 vereinheitlicht.

**Gesucht wird über Name UND Fach.** Das Fach steht auf dem Regaletikett und ist für eine Helferin am
Regal die naheliegendere Eingabe als der Artikelname. Die Chargennummer bleibt draußen — sie steht
auf keinem Gegenstand, den jemand auf diesem Weg in der Hand hat (die Verwaltungssuche sucht sie mit,
§12.1 Punkt 2, Teil 3 `_lib/artikelFilter.ts`).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/ArtikelSuche.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists, fill } from "@/app/m/qr/_lib/test-dom";
import { ArtikelSuche, type ArtikelZeileHelfer } from "./ArtikelSuche";

const QUELLE = "src/app/m/lagerbuch/_ui/ArtikelSuche.tsx";

const LISTE: ArtikelZeileHelfer[] = [
  { id: "a1", name: "Kompresse 10×10", einheit: "Stk", fach: "A-01", bestand: 42 },
  { id: "a2", name: "Mullbinde 6 cm", einheit: "Stk", fach: "A-02", bestand: 0 },
  { id: "a3", name: "Wärmedecke", einheit: "Stk", fach: "B-11", bestand: 7 },
];

afterEach(async () => { await unmount(); });

describe("ArtikelSuche — die Liste", () => {
  it("rendert jede Zeile mit Name, Fach, Bestand und Einheit", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    const zeilen = queryAll("[data-rolle='artikel-zeile']");
    expect(zeilen.length).toBe(3);
    expect(zeilen[0].textContent).toContain("Kompresse 10×10");
    expect(zeilen[0].textContent).toContain("A-01");
    expect(zeilen[0].textContent).toContain("42");
    expect(zeilen[0].textContent).toContain("Stk");
  });

  it("jede Zeile ist ein Link auf den AEUSSEREN Pfad `/a/<id>`", async () => {
    // Ein innerer Pfad wuerde auf dem aeusseren Host doppelt praefixiert
    // (Falle 63). `/a/<id>` ist derselbe Pfad, der auf dem Regaletikett steht.
    await mount(<ArtikelSuche artikel={LISTE} />);
    const erste = query<HTMLAnchorElement>("[data-rolle='artikel-zeile']");
    expect(erste.getAttribute("href")).toBe("/a/a1");
  });

  it("zeigt einen Artikel mit Bestand 0 — er wird NICHT ausgeblendet", async () => {
    // Der Bestand 0 ist eine Auskunft („da liegt nichts mehr"), kein Grund zum
    // Verstecken. Wer das Regalfach vor sich hat, will die Zeile sehen.
    await mount(<ArtikelSuche artikel={LISTE} />);
    expect(queryAll("[data-rolle='artikel-zeile']")[1].textContent).toContain("Mullbinde 6 cm");
  });
});

describe("ArtikelSuche — das Filtern, ueber die EINE Faltung", () => {
  it("filtert nach Name, unabhaengig von Gross-/Kleinschreibung", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "KOMPRESSE");
    expect(queryAll("[data-rolle='artikel-zeile']").length).toBe(1);
  });

  it("filtert auch nach FACH — das steht auf dem Regaletikett", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "B-11");
    const treffer = queryAll("[data-rolle='artikel-zeile']");
    expect(treffer.length).toBe(1);
    expect(treffer[0].textContent).toContain("Wärmedecke");
  });

  it("findet ueber die Faltung auch bei abweichenden Umlauten", async () => {
    // `_lib/suche.ts#falte` (Teil 1, T5) ist die EINE Faltung fuer beide
    // Haelften. Der Bestand filtert mit blossem toLowerCase()
    // (HelferListe.tsx:11) und behandelt Umlaute uneinheitlich zur
    // Verwaltungssuche — zwei Faltungen an zwei Orten sind der Ort, an dem sie
    // auseinanderlaufen.
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "waerme");
    expect(queryAll("[data-rolle='artikel-zeile']").length).toBe(1);
  });

  it("ignoriert fuehrende und nachlaufende Leerzeichen", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "   mull   ");
    expect(queryAll("[data-rolle='artikel-zeile']").length).toBe(1);
  });

  it("ohne Eingabe steht die vollstaendige Liste", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "x");
    await fill("[data-rolle='artikel-suche']", "");
    expect(queryAll("[data-rolle='artikel-zeile']").length).toBe(3);
  });
});

describe("ArtikelSuche — die beiden Leerlagen sind VERSCHIEDEN", () => {
  it("kein Treffer: sagt, wonach gesucht wurde", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "zzz");
    expect(query("[data-rolle='kein-treffer']").textContent)
      .toBe("Kein Artikel gefunden für „zzz“.");
  });

  it("gar keine Artikel: sagt etwas ANDERES — und nennt die Verwaltung", async () => {
    // „Kein Artikel gefunden" bei leerer Datenbank schickt die Helferin auf die
    // Suche nach einem Tippfehler, den es nicht gibt.
    await mount(<ArtikelSuche artikel={[]} />);
    expect(exists("[data-rolle='kein-treffer']")).toBe(false);
    expect(query("[data-rolle='keine-artikel']").textContent)
      .toBe("Es ist noch kein Artikel angelegt. Die Verwaltung pflegt den Bestand.");
  });
});

describe("ArtikelSuche — Bauform", () => {
  it("das Suchfeld ist benannt und traegt `type=\"search\"`", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    const feld = query<HTMLInputElement>("[data-rolle='artikel-suche']");
    expect(feld.getAttribute("aria-label")).toBe("Artikel suchen");
    expect(feld.getAttribute("type")).toBe("search");
  });

  it("benutzt `falte` aus `_lib/suche.ts` und baut keine zweite Faltung", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/from "\.\.\/_lib\/suche"/);
    expect(q).not.toMatch(/toLowerCase\(\)/);
  });

  it("benutzt KEIN useSearchParams und KEIN router.push (§7.8.2 Punkt 6)", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/useSearchParams|router\.(push|replace)|usePathname/);
  });

  it("ist eine Client-Insel ohne antd", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/^"use client";/m);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/ArtikelSuche.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./ArtikelSuche"`.

- [ ] **Schritt 3: `_ui/ArtikelSuche.tsx` schreiben**

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { falte } from "../_lib/suche";
import s from "./helfer.module.css";

/**
 * DIE ARTIKELLISTE DES HELFER-WEGS — Nachfolger von `HelferListe.tsx`.
 *
 * WARUM SIE IM CLIENT FILTERT: §7.8.2 Punkt 6 ist eindeutig — es gibt KEINEN
 * `router.push`/`router.replace` auf diesem Ast. Ein serverseitiger Filter
 * braeuchte je Tastendruck eine Navigation, auf einem Telefon in einer
 * Fahrzeughalle die teuerste denkbare Form. Die Liste liegt ohnehin
 * vollstaendig im RSC-Payload; sie ein zweites Mal zu holen, um sie zu
 * KUERZEN, waere die falsche Richtung.
 *
 * ⚠️ Anders als beim Fahrzeug-Check ist das KEIN Datenschutzproblem (§7.9.1):
 * die Artikelliste ist die Menge, aus der die Helferin ohnehin auswaehlt — sie
 * ist der ZWECK der Seite, nicht ein Nebenprodukt. Der Check schneidet, weil er
 * sonst die Soll-Bestueckung der GESAMTEN Organisation uebertraegt.
 *
 * DIE FALTUNG KOMMT AUS `_lib/suche.ts` (Teil 1, T5) UND WIRD NICHT NACHGEBAUT.
 * Der Bestand filtert mit `a.name.toLowerCase().includes(...)`
 * (HelferListe.tsx:11) und behandelt Umlaute uneinheitlich zur
 * Verwaltungssuche. Zwei Faltungen an zwei Orten sind der Ort, an dem sie
 * auseinanderlaufen.
 *
 * GESUCHT WIRD UEBER NAME UND FACH. Das Fach steht auf dem Regaletikett und ist
 * fuer eine Helferin am Regal die naheliegendere Eingabe. Die Chargennummer
 * bleibt draussen — sie steht auf keinem Gegenstand, den jemand auf diesem Weg
 * in der Hand hat.
 */
export type ArtikelZeileHelfer = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  bestand: number;
};

export function ArtikelSuche({ artikel }: { artikel: ArtikelZeileHelfer[] }) {
  const [q, setQ] = useState("");

  const treffer = useMemo(() => {
    const nadel = falte(q);
    if (!nadel) return artikel;
    return artikel.filter((a) => falte(a.name).includes(nadel) || falte(a.fach).includes(nadel));
  }, [artikel, q]);

  return (
    <>
      <input
        className={s.suchfeld}
        type="search"
        inputMode="search"
        autoComplete="off"
        aria-label="Artikel suchen"
        placeholder="Artikel oder Fach suchen…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-rolle="artikel-suche"
      />

      <div className={s.karte}>
        {/*
          DIE BEIDEN LEERLAGEN SIND VERSCHIEDEN, und das ist keine Feinheit:
          „Kein Artikel gefunden" bei leerer Datenbank schickt die Helferin auf
          die Suche nach einem Tippfehler, den es nicht gibt.
        */}
        {artikel.length === 0 && (
          <div className={`${s.kartePad} ${s.fussnote}`} data-rolle="keine-artikel">
            Es ist noch kein Artikel angelegt. Die Verwaltung pflegt den Bestand.
          </div>
        )}

        {artikel.length > 0 && treffer.length === 0 && (
          <div className={`${s.kartePad} ${s.fussnote}`} data-rolle="kein-treffer">
            Kein Artikel gefunden für „{q.trim()}“.
          </div>
        )}

        {treffer.map((a) => (
          // AEUSSERER Pfad — derselbe, der auf dem Regaletikett steht (§8.1).
          <Link className={s.zeile} key={a.id} href={`/a/${a.id}`} data-rolle="artikel-zeile">
            <div className={s.zeileHaupt}>
              <div className={s.zeileName}>{a.name}</div>
              <div className={s.zeileMeta}>
                <span className={s.fach}>{a.fach}</span>
                <span>
                  Bestand {a.bestand} {a.einheit}
                </span>
              </div>
            </div>
            {/* Lokales Inline-SVG (E3); Teil 5, T101 hebt es nach `_ui/ikonen.tsx`. */}
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/ArtikelSuche.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_ui/ArtikelSuche.tsx src/app/m/lagerbuch/_ui/ArtikelSuche.test.tsx
git commit -m "feat(lagerbuch): _ui/ArtikelSuche.tsx — Filtern im Client, mit der EINEN Faltung

§7.8.2 Punkt 6: kein router.push, kein useSearchParams auf diesem Ast. Ein
serverseitiger Filter braeuchte je Tastendruck eine Navigation — auf einem
Telefon in einer Fahrzeughalle die teuerste denkbare Form. Und die Liste liegt
ohnehin vollstaendig im Payload; sie ein zweites Mal zu holen, um sie zu
kuerzen, waere die falsche Richtung.

Die Faltung kommt aus _lib/suche.ts (Teil 1, T5) statt aus einem zweiten
toLowerCase(): der Bestand behandelt Umlaute uneinheitlich zur
Verwaltungssuche, und zwei Faltungen an zwei Orten sind der Ort, an dem sie
auseinanderlaufen.

Gesucht wird ueber Name UND Fach — das Fach steht auf dem Regaletikett und ist
am Regal die naheliegendere Eingabe. Die beiden Leerlagen sind verschieden
formuliert: 'kein Treffer' nennt den Suchbegriff, 'gar kein Artikel' nennt die
Verwaltung. Der erste Text bei leerer Datenbank schickte die Helferin auf die
Suche nach einem Tippfehler, den es nicht gibt."
```

---

### Task 72: `_ui/BarcodeScanner.tsx` — die Kamera-Insel, vier Fehlerzustände statt einem

**Files:**
- Create: `src/app/m/lagerbuch/_ui/BarcodeScanner.tsx`
- Test: `src/app/m/lagerbuch/_ui/BarcodeScanner.test.tsx`

**Interfaces:**
- Consumes: `_lib/barcode.ts` (T62) — `normalisiereBarcode`; `_ui/helfer.module.css` (T64) —
  `.scanKarte`, `.scanVideo`, `.scanStrich`, `.lampe`, `.lampeAn`, `.feldZeile`, `.feld`, `.knopf`,
  `.knopfTinte`, `.karte`, `.kartePad`, `.gateFehler`; `@zxing/browser` und `@zxing/library`
  (**dynamisch**, Teil 1, T1).
- Produces:
  ```tsx
  // _ui/BarcodeScanner.tsx — "use client"
  export function BarcodeScanner(props: {
    zuBarcode: (rohwert: string) => Promise<{ id: string } | null>;
    zielPfad: (id: string) => string;            // ÄUSSERER Pfad
    nichtGefunden?: (code: string) => string;    // Vorgabe: siehe unten
  }): JSX.Element;
  ```
  ⚠️ **Der Zwei-Prop-Aufruf ist von Teil 5, T138 bereits festgeschrieben** (`teil5.md`, T138 `Consumes`):
  `BarcodeScanner({ zuBarcode, zielPfad })`. `nichtGefunden` ist deshalb **optional** mit Vorgabe —
  ein dritter Pflicht-Prop bräche beide Verwaltungsseiten, die schon geschrieben sind.
  **Konsumenten: `/verwaltung/geraete/scan` und `/verwaltung/bz/scan` (Teil 5, T138) — beide
  AUSSERHALB dieses Plans.** Auf dem Helfer-Weg hat der Scanner **null** Aufrufer (§7.2.1).

⚠️ **DIESE DATEI RENDERT AUF BEIDEN ANSICHTSKLASSEN.** Das Trägerelement ist dort `.modul` aus
`verwaltung.module.css` (Teil 5, T100), hier `.rahmen`. Daraus folgt die harte Regel aus §3.3:
**jede benutzte Regel greift ausschließlich auf `var(--lb-*)` zurück** — beide Träger führen denselben
Variablensatz. Ein `var(--ant-color-primary)` wäre ein Knopf **ohne Hintergrundfarbe**, still, weil
eine nicht auflösbare CSS-Variable gültiges CSS ist (Falle 2, §7.6.4). Repo-weit ist das ohnehin
gesperrt (`core/shell/shell-css.test.ts:97-98`, `src/app/not-found.test.tsx:92`).

**Warum der Scanner trotzdem in diesem Plan liegt.** §7.6 legt ihn vollständig fest, weil er der
andere mobile Kernpfad ist und weil **sein Eingabeformat ein Vertrag mit der Außenwelt ist**: die
sieben `POSSIBLE_FORMATS` decken **CODE_128, CODE_39, EAN_13, EAN_8, ITF, QR_CODE, DATA_MATRIX**
(`BarcodeScanner.tsx:71-79`). EAN und ITF sind reine Handels- und Herstellercodierungen; sie stehen
auf **keinem** lagerbuch-Etikett, sondern vom Hersteller gedruckt am Gerät. **Sie bleiben
zeichengleich — 1:1-Pflicht:** ein Format zu entfernen macht jeden bereits erfassten
Hersteller-Barcode unlesbar, und die Gegenstände sind physisch vorhanden. Ein Format hinzuzufügen ist
harmlos, aber unbegründet.

**Vier Zustände statt einem** (§7.6.3). Heute fängt ein einziges `catch` alles und zeigt einen Satz
(`BarcodeScanner.tsx:90-91`). Für jemanden, der in einer Fahrzeughalle steht, ist das die falsche
Auskunft — **die Handlung unterscheidet sich je Ursache:**

| Zustand | Erkennung | Text |
|---|---|---|
| Kein sicherer Kontext | `!window.isSecureContext` oder `!navigator.mediaDevices`, **vor** dem Import | „Die Kamera braucht eine verschlüsselte Verbindung. Bitte die Seite über die normale Adresse aufrufen, nicht über die IP." |
| Zugriff abgelehnt | `NotAllowedError` / `SecurityError` | „Der Kamerazugriff wurde abgelehnt. In den Browser-Einstellungen für diese Seite freigeben — oder den Barcode unten eintippen." |
| Keine Kamera vorhanden | `NotFoundError` / `OverconstrainedError` | „Keine Rückkamera gefunden. Barcode bitte unten eintippen." |
| Kamera belegt | `NotReadableError` / `AbortError` | „Die Kamera wird gerade von einer anderen App benutzt. Diese schließen oder den Barcode unten eintippen." |

⚠️ **Der sichere Kontext wird VOR dem dynamischen Import geprüft** — sonst lädt das Gerät zwei
zxing-Bündel, um danach festzustellen, dass es sie nicht benutzen kann. Das ist zugleich der
Berührungspunkt mit der Betriebsauflage aus §3.5.2: über den **direkten** Weg (`http://<ip>:<port>`)
ist `getUserMedia` **gar nicht verfügbar**; der Scanner ist auf diesem Weg strukturell unbenutzbar,
und der erste Zustand sagt das ausdrücklich.

**Drei 1:1-Pflichten, die gegen die Kamera erprobt sind und sich in keinem Gate nachbauen lassen:**

1. **Das manuelle Feld steht IMMER.** Heute unbedingt gerendert (`:141-163`), unabhängig vom
   Kamerazustand; nur der Videobereich wird durch die Fehlerkarte ersetzt (`:110-137`). **Ein
   manuelles Feld, das sich hinter einem Kamerafehler versteckt, ist kein Rückfall.**
2. **Die Doppelfeuer-Sperre.** `busyRef` verhindert parallele Lookups, weil zxing denselben Code
   **viele Male pro Sekunde** meldet (`:24,34-37`); nach der Navigation bleibt `busy` gesetzt, „sonst
   navigiert ein Folge-Scan doppelt" (`:46`); ein unbekannter Code wird für **2 Sekunden** gesperrt
   (`:55-57`).
3. **Die harte Navigation.** `window.location.assign(zielPfad(treffer.id))` (`:45`) bleibt, mit der
   Begründung aus `:42-44`: Soft-Navigation direkt nach einer Server Action wird gern abgebrochen.
   Das Ziel ist ein **äußerer** Pfad und bleibt es.

**`switchTorch` bleibt optional geprüft** (`:101-102`) — nicht jedes Gerät und nicht jeder Browser
kann es, und ein Wurf beim Antippen wäre ein **Absturz mitten im Scannen**.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/BarcodeScanner.test.tsx`:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, exists, fill, submitForm, click } from "@/app/m/qr/_lib/test-dom";
import { BarcodeScanner } from "./BarcodeScanner";

const QUELLE = "src/app/m/lagerbuch/_ui/BarcodeScanner.tsx";

/**
 * jsdom hat weder `isSecureContext` noch `navigator.mediaDevices`. Der
 * Vorgabezustand dieser Tests ist damit „kein sicherer Kontext" — und genau
 * dieser Zustand ist der, den §7.6.3 als ersten fordert. Fuer die uebrigen
 * Zusagen wird er gezielt gesetzt.
 */
function sichererKontext(an: boolean) {
  Object.defineProperty(window, "isSecureContext", { value: an, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", {
    value: an ? { getUserMedia: vi.fn() } : undefined,
    configurable: true,
  });
}

let zugewiesen: string[] = [];

beforeEach(() => {
  zugewiesen = [];
  vi.spyOn(window.location, "assign").mockImplementation((u: string | URL) => {
    zugewiesen.push(String(u));
  });
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const props = {
  zuBarcode: async (roh: string) => (roh === "SN-1" ? { id: "g1" } : null),
  zielPfad: (id: string) => `/verwaltung/geraete/${id}`,
};

describe("BarcodeScanner — das manuelle Feld steht IMMER", () => {
  it("auch ohne sicheren Kontext, neben der Fehlerkarte", async () => {
    // 1:1-Pflicht (§7.6.3): heute wird es unbedingt gerendert (:141-163), nur
    // der Videobereich wird ersetzt. Ein manuelles Feld, das sich hinter einem
    // Kamerafehler versteckt, ist kein Rueckfall.
    sichererKontext(false);
    await mount(<BarcodeScanner {...props} />);
    expect(exists("[data-rolle='scan-manuell']")).toBe(true);
    expect(exists("[data-rolle='scan-fehler']")).toBe(true);
  });

  it("der erste Zustand nennt die verschluesselte Verbindung, nicht 'Kamera nicht verfuegbar'", async () => {
    // Ueber den direkten Weg (http://<ip>:<port>) ist getUserMedia GAR NICHT
    // verfuegbar (§3.5.2). Der Text sagt das ausdruecklich, weil die Handlung
    // eine andere ist als bei einer abgelehnten Freigabe.
    sichererKontext(false);
    await mount(<BarcodeScanner {...props} />);
    expect(query("[data-rolle='scan-fehler']").textContent).toBe(
      "Die Kamera braucht eine verschlüsselte Verbindung. " +
      "Bitte die Seite über die normale Adresse aufrufen, nicht über die IP.",
    );
  });

  it("rendert ohne sicheren Kontext KEIN <video> — und laedt keine zxing-Buendel", async () => {
    // Der sichere Kontext wird VOR dem dynamischen Import geprueft, sonst laedt
    // das Geraet zwei Buendel, um danach festzustellen, dass es sie nicht
    // benutzen kann.
    sichererKontext(false);
    await mount(<BarcodeScanner {...props} />);
    expect(exists("video")).toBe(false);
  });
});

describe("BarcodeScanner — die manuelle Suche", () => {
  it("findet einen Treffer und navigiert HART auf den aeusseren Pfad", async () => {
    // window.location.assign statt router.push: Soft-Navigation direkt nach
    // einer Server Action wird gern abgebrochen (:42-44).
    sichererKontext(false);
    await mount(<BarcodeScanner {...props} />);
    await fill("[data-rolle='scan-manuell']", "SN-1");
    await submitForm("[data-rolle='scan-form']");
    expect(zugewiesen).toEqual(["/verwaltung/geraete/g1"]);
  });

  it("normalisiert die Eingabe ueber `normalisiereBarcode`", async () => {
    // Ein aus einem QR getippter Deep-Link findet sein Geraet nur so.
    const gesehen: string[] = [];
    sichererKontext(false);
    await mount(
      <BarcodeScanner
        zielPfad={props.zielPfad}
        zuBarcode={async (roh) => { gesehen.push(roh); return roh === "SN-1" ? { id: "g1" } : null; }}
      />,
    );
    await fill("[data-rolle='scan-manuell']", "  https://alt.example/g/SN-1  ");
    await submitForm("[data-rolle='scan-form']");
    expect(gesehen).toEqual(["SN-1"]);
  });

  it("ein unbekannter Code zeigt den Nicht-Treffer-Text und navigiert NICHT", async () => {
    sichererKontext(false);
    await mount(<BarcodeScanner {...props} />);
    await fill("[data-rolle='scan-manuell']", "ZZZ");
    await submitForm("[data-rolle='scan-form']");
    expect(query("[data-rolle='scan-meldung']").textContent)
      .toBe("Kein Gerät mit dem Barcode „ZZZ“ gefunden.");
    expect(zugewiesen).toEqual([]);
  });

  it("ein geworfener Lookup wird gefangen — kein Absturz mitten im Scannen", async () => {
    sichererKontext(false);
    await mount(
      <BarcodeScanner zielPfad={props.zielPfad} zuBarcode={async () => { throw new Error("weg"); }} />,
    );
    await fill("[data-rolle='scan-manuell']", "SN-1");
    await submitForm("[data-rolle='scan-form']");
    expect(query("[data-rolle='scan-meldung']").textContent)
      .toBe("Suche fehlgeschlagen – bitte erneut versuchen.");
  });

  it("ein leeres Feld loest gar nichts aus", async () => {
    const zuBarcode = vi.fn(async () => null);
    sichererKontext(false);
    await mount(<BarcodeScanner zielPfad={props.zielPfad} zuBarcode={zuBarcode} />);
    await submitForm("[data-rolle='scan-form']");
    expect(zuBarcode).not.toHaveBeenCalled();
  });
});

describe("BarcodeScanner — die Doppelfeuer-Sperre (1:1, §7.6.3)", () => {
  it("sperrt einen unbekannten Code fuer 2 Sekunden", async () => {
    // zxing meldet denselben Code VIELE MALE PRO SEKUNDE. Ohne die Sperre
    // laufen parallele Lookups, und die Meldung flackert.
    vi.useFakeTimers();
    const zuBarcode = vi.fn(async () => null);
    sichererKontext(false);
    await mount(<BarcodeScanner zielPfad={props.zielPfad} zuBarcode={zuBarcode} />);

    await fill("[data-rolle='scan-manuell']", "ZZZ");
    await submitForm("[data-rolle='scan-form']");
    expect(zuBarcode).toHaveBeenCalledTimes(1);

    // Die manuelle Absendung setzt `busy` ausdruecklich zurueck (:148) — der
    // Mensch am Feld ist nicht das Dauerfeuer, gegen das die Sperre gebaut ist.
    await vi.advanceTimersByTimeAsync(2100);
    await submitForm("[data-rolle='scan-form']");
    expect(zuBarcode).toHaveBeenCalledTimes(2);
  });

  it("nach einem Treffer bleibt `busy` gesetzt — sonst navigiert ein Folge-Scan doppelt", async () => {
    vi.useFakeTimers();
    sichererKontext(false);
    await mount(<BarcodeScanner {...props} />);
    await fill("[data-rolle='scan-manuell']", "SN-1");
    await submitForm("[data-rolle='scan-form']");
    await vi.advanceTimersByTimeAsync(5000);
    expect(zugewiesen).toEqual(["/verwaltung/geraete/g1"]);   // genau EINE Navigation
  });
});

describe("BarcodeScanner — Bauform, und die Regeln, die kein Gate findet", () => {
  it("nennt alle SIEBEN POSSIBLE_FORMATS zeichengleich", () => {
    // 1:1-Pflicht (§7.6.2). Ein Format zu entfernen macht jeden bereits
    // erfassten Hersteller-Barcode unlesbar, und die Gegenstaende sind
    // physisch vorhanden.
    const q = readFileSync(QUELLE, "utf8");
    for (const f of ["CODE_128", "CODE_39", "EAN_13", "EAN_8", "ITF", "QR_CODE", "DATA_MATRIX"]) {
      expect(q, `${f} fehlt`).toContain(`BarcodeFormat.${f}`);
    }
  });

  it("faerbt den Taschenlampenschalter aus `--lb-*`, NIE aus `--ant-*` (Falle 2)", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toContain("--ant-");
  });

  it("greift auf KEINE Klasse aus `verwaltung.module.css` zu — er rendert auf beiden Aesten", () => {
    // Die Verwaltungsseiten tragen `.modul` als Traeger, der Helfer-Weg
    // `.rahmen`. Beide fuehren denselben --lb-Satz; eine Klasse aus dem
    // fremden Stylesheet waere dort undefiniert und hier still ungestylt.
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/verwaltung\.module\.css/);
  });

  it("prueft `switchTorch` optional — ein Wurf beim Antippen waere ein Absturz mitten im Scannen", () => {
    expect(readFileSync(QUELLE, "utf8")).toMatch(/c\?\.switchTorch|controlsRef\.current\?\.switchTorch/);
  });

  it("importiert zxing DYNAMISCH — die Buendel laden erst beim Betreten der Seite", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/await Promise\.all\(\[\s*import\("@zxing\/browser"\)/);
    expect(q).not.toMatch(/^import .* from "@zxing\/(browser|library)"/m);
  });

  it("stoppt die Kamera beim Abbau", () => {
    // Ohne `controlsRef.current?.stop()` im Aufraeumer laeuft die Kamera nach
    // dem Verlassen der Seite weiter — sichtbar an der Geraete-Leuchte, und auf
    // iOS blockiert sie dann jede weitere App.
    expect(readFileSync(QUELLE, "utf8")).toMatch(/return \(\) => \{[\s\S]*?stop\(\)/);
  });

  it("ist eine Client-Insel ohne antd", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/^"use client";/m);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/BarcodeScanner.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./BarcodeScanner"`.

- [ ] **Schritt 3: `_ui/BarcodeScanner.tsx` schreiben**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { normalisiereBarcode } from "../_lib/barcode";
import s from "./helfer.module.css";

/**
 * DIE KAMERA-INSEL — §7.6, portiert aus
 * `lagerbuch/src/components/BarcodeScanner.tsx` mit den Aenderungen aus §7.6.3.
 *
 * ⚠️ SIE STEHT NICHT AUF DEM HELFER-WEG (§7.2.1): der `@zxing`-Scanner hat dort
 * NULL Aufrufer. Beide QR-Einstiege (`/t/<code>`, `/a/<id>`) werden mit der
 * SYSTEMKAMERA gescannt. Ihre zwei Aufrufer sind
 * `/verwaltung/geraete/scan` und `/verwaltung/bz/scan` (Teil 5, T138).
 *
 * ⚠️ SIE RENDERT DESHALB AUF BEIDEN ANSICHTSKLASSEN. Traegerelement ist dort
 * `.modul` aus `verwaltung.module.css`, hier `.rahmen`. Beide fuehren denselben
 * `--lb-*`-Satz (§3.3) — DIESE DATEI GREIFT AUSSCHLIESSLICH AUF `--lb-*`
 * ZURUECK und auf keine Klasse des fremden Stylesheets. Ein
 * `var(--ant-color-primary)` waere ein Knopf OHNE Hintergrundfarbe, still, weil
 * eine nicht aufloesbare CSS-Variable gueltiges CSS ist (Falle 2, §7.6.4).
 *
 * DIE SIEBEN POSSIBLE_FORMATS BLEIBEN ZEICHENGLEICH (§7.6.2, 1:1-Pflicht). EAN
 * und ITF sind reine Handels- und Herstellercodierungen; sie stehen auf keinem
 * lagerbuch-Etikett, sondern VOM HERSTELLER GEDRUCKT am Geraet. Ein Format zu
 * entfernen macht jeden bereits erfassten Hersteller-Barcode unlesbar, und die
 * Gegenstaende sind physisch vorhanden.
 */

/** §7.6.3 — vier Zustaende statt einem. Die HANDLUNG unterscheidet sich je Ursache. */
const KEIN_SICHERER_KONTEXT =
  "Die Kamera braucht eine verschlüsselte Verbindung. " +
  "Bitte die Seite über die normale Adresse aufrufen, nicht über die IP.";

function kameraText(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Der Kamerazugriff wurde abgelehnt. In den Browser-Einstellungen für diese Seite " +
           "freigeben — oder den Barcode unten eintippen.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Keine Rückkamera gefunden. Barcode bitte unten eintippen.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Die Kamera wird gerade von einer anderen App benutzt. " +
           "Diese schließen oder den Barcode unten eintippen.";
  }
  // Unbekannt: der Satz des Bestands, aber ohne die falsche Behauptung
  // „Zugriff abgelehnt" — die drei Faelle darueber decken das ab.
  return "Die Kamera ist nicht verfügbar. Barcode bitte unten eintippen.";
}

export function BarcodeScanner({
  zuBarcode,
  zielPfad,
  nichtGefunden = (code) => `Kein Gerät mit dem Barcode „${code}“ gefunden.`,
}: {
  zuBarcode: (rohwert: string) => Promise<{ id: string } | null>;
  /** AEUSSERER Pfad (`/verwaltung/geraete/<id>`). Ein innerer wuerde doppelt praefixiert. */
  zielPfad: (id: string) => string;
  /**
   * Optional mit Vorgabe — NICHT Pflicht: der Zwei-Prop-Aufruf steht in
   * Teil 5, T138 bereits geschrieben (`BarcodeScanner({ zuBarcode, zielPfad })`).
   * Ein dritter Pflicht-Prop braeche beide Verwaltungsseiten.
   */
  nichtGefunden?: (code: string) => string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  /** 1:1 (`:24`): verhindert parallele Lookups — zxing feuert denselben Code viele Male pro Sekunde. */
  const busyRef = useRef(false);
  const [kameraFehler, setKameraFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [sucht, setSucht] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manuell, setManuell] = useState("");

  const pruefeCode = useCallback(
    async (roh: string) => {
      // Die EINE Normalisierung (T62) — hier UND am Kamerarueckgabewert. Ein
      // aus einem QR getippter Deep-Link findet sein Geraet nur so.
      const code = normalisiereBarcode(roh);
      if (busyRef.current || !code) return;
      busyRef.current = true;
      setSucht(true);
      setMeldung(null);
      try {
        const treffer = await zuBarcode(code);
        if (treffer) {
          controlsRef.current?.stop();
          // Volle Navigation statt router.push: Soft-Navigation direkt nach
          // einer Server Action wird (vor allem im Dev-Modus) gern abgebrochen,
          // und nach einem Scan ist ein frischer Seitenaufbau ohnehin gewollt
          // (1:1, `:42-44`).
          window.location.assign(zielPfad(treffer.id));
          return;   // busy bleibt gesetzt, sonst navigiert ein Folge-Scan doppelt (`:46`)
        }
        setMeldung(nichtGefunden(code));
      } catch {
        setMeldung("Suche fehlgeschlagen – bitte erneut versuchen.");
      } finally {
        setSucht(false);
      }
      // Kurze Sperre, damit derselbe (unbekannte) Code nicht im Dauerfeuer nervt (`:55-57`).
      setTimeout(() => { busyRef.current = false; }, 2000);
    },
    [zuBarcode, zielPfad, nichtGefunden],
  );

  useEffect(() => {
    let beendet = false;

    /**
     * DER SICHERE KONTEXT WIRD VOR DEM DYNAMISCHEN IMPORT GEPRUEFT (§7.6.3) —
     * sonst laedt das Geraet zwei zxing-Buendel, um danach festzustellen, dass
     * es sie nicht benutzen kann. Zugleich der Beruehrungspunkt mit §3.5.2:
     * ueber den DIREKTEN Weg (http://<ip>:<port>) ist `getUserMedia` GAR NICHT
     * verfuegbar; der Scanner ist dort strukturell unbenutzbar.
     */
    if (!window.isSecureContext || !navigator.mediaDevices) {
      setKameraFehler(KEIN_SICHERER_KONTEXT);
      return;
    }

    (async () => {
      try {
        // Dynamischer Doppelimport: die zxing-Buendel laden erst beim Betreten
        // der Seite (1:1, `:66-69`). Ein statischer Import zoege sie in jedes
        // Bundle, das diese Datei erwaehnt.
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        if (beendet || !videoRef.current) return;
        controlsRef.current = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => { if (result) void pruefeCode(result.getText()); },
        );
        if (beendet) controlsRef.current?.stop();
      } catch (err) {
        // §7.6.3: der Fehler wird AUSGEWERTET. Ein einziger Satz fuer vier
        // Ursachen ist fuer jemanden in einer Fahrzeughalle die falsche
        // Auskunft — die Handlung unterscheidet sich je Ursache.
        if (!beendet) setKameraFehler(kameraText(err));
      }
    })();

    return () => {
      beendet = true;
      // Ohne diesen Halt laeuft die Kamera nach dem Verlassen weiter — sichtbar
      // an der Geraete-Leuchte, und auf iOS blockiert sie dann jede weitere App.
      controlsRef.current?.stop();
    };
  }, [pruefeCode]);

  function torchToggle() {
    const c = controlsRef.current;
    // Optional geprueft (1:1, `:101-102`): nicht jedes Geraet und nicht jeder
    // Browser kann es, und ein Wurf beim Antippen waere ein Absturz mitten im
    // Scannen.
    if (!c?.switchTorch) return;
    const an = !torch;
    void c.switchTorch(an);
    setTorch(an);
  }

  return (
    <>
      {kameraFehler ? (
        <div className={`${s.karte} ${s.kartePad}`} data-rolle="scan-fehler">{kameraFehler}</div>
      ) : (
        <div className={s.scanKarte}>
          <video ref={videoRef} muted playsInline className={s.scanVideo} />
          <div className={s.scanStrich} />
          <button
            type="button"
            className={torch ? `${s.lampe} ${s.lampeAn}` : s.lampe}
            aria-label="Taschenlampe"
            aria-pressed={torch}
            onClick={torchToggle}
          >
            {/* Lokales Inline-SVG (E3); Teil 5, T101 hebt es. */}
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M7 2h10l-1 6H8L7 2zm1 8h8v4l-3 8h-2l-3-8v-4z" fill="currentColor" />
            </svg>
          </button>
        </div>
      )}

      {meldung && (
        <div className={`${s.karte} ${s.kartePad} ${s.gateFehler}`} data-rolle="scan-meldung">
          {meldung}
        </div>
      )}

      {/*
        1:1-PFLICHT: DAS MANUELLE FELD STEHT IMMER (§7.6.3), unabhaengig vom
        Kamerazustand — heute unbedingt gerendert (`:141-163`), nur der
        Videobereich wird durch die Fehlerkarte ersetzt. Ein manuelles Feld, das
        sich hinter einem Kamerafehler versteckt, ist kein Rueckfall.
      */}
      <div className={`${s.karte} ${s.kartePad}`}>
        <form
          className={s.feldZeile}
          data-rolle="scan-form"
          onSubmit={(e) => {
            e.preventDefault();
            // Der Mensch am Feld ist nicht das Dauerfeuer, gegen das die Sperre
            // gebaut ist (1:1, `:148`).
            busyRef.current = false;
            void pruefeCode(manuell);
          }}
        >
          <input
            className={s.feld}
            aria-label="Barcode manuell eingeben"
            placeholder="Seriennummer / Barcode"
            value={manuell}
            onChange={(e) => setManuell(e.target.value)}
            autoComplete="off"
            data-rolle="scan-manuell"
          />
          <button
            className={`${s.knopf} ${s.knopfTinte}`}
            type="submit"
            disabled={sucht || manuell.trim() === ""}
          >
            Suchen
          </button>
        </form>
      </div>
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/BarcodeScanner.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
git add src/app/m/lagerbuch/_ui/BarcodeScanner.tsx src/app/m/lagerbuch/_ui/BarcodeScanner.test.tsx
git commit -m "feat(lagerbuch): _ui/BarcodeScanner.tsx — vier Kamerazustaende statt einem

Heute faengt ein einziges catch alles und zeigt einen Satz (:90-91). Fuer
jemanden in einer Fahrzeughalle ist das die falsche Auskunft: die HANDLUNG
unterscheidet sich je Ursache — verschluesselte Verbindung fehlt, Zugriff
abgelehnt, keine Rueckkamera, Kamera belegt.

Der sichere Kontext wird VOR dem dynamischen Import geprueft; sonst laedt das
Geraet zwei zxing-Buendel, um danach festzustellen, dass es sie nicht benutzen
kann. Ueber den direkten Weg (http://<ip>:<port>) ist getUserMedia gar nicht
verfuegbar — der erste Zustand sagt das ausdruecklich.

Drei 1:1-Pflichten wandern woertlich mit, samt Kommentaren: das manuelle Feld
steht IMMER (ein Feld hinter einem Kamerafehler ist kein Rueckfall), die
Doppelfeuer-Sperre (zxing feuert denselben Code viele Male pro Sekunde; nach
der Navigation bleibt busy gesetzt), und die harte Navigation. Die sieben
POSSIBLE_FORMATS bleiben zeichengleich — EAN und ITF stehen vom Hersteller
gedruckt an physisch vorhandenen Geraeten.

Diese Datei rendert auf BEIDEN Ansichtsklassen (Teil 5, T138). Sie greift
deshalb ausschliesslich auf --lb-* zurueck und auf keine Klasse aus
verwaltung.module.css: beide Traeger fuehren denselben Variablensatz, und eine
nicht aufloesbare Variable faellt still auf transparent zurueck."
```

---

**Gate Stufe 3.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 4 — Die drei Server Actions (3 Tasks, alle parallel)

Die vier Deklarationen dieses Plans (E10). **Drei stehen auf der Ausnahmeliste des Guard-Scans**, eine
trägt `requireHelferSchreibend`. Keine trägt `requireLagerbuchAdmin`.

⚠️ **Der Host-Riegel steht in T73 und T74 als erste Anweisung und in T75 NICHT** —
`requireHelferSchreibend` ruft ihn intern (Teil 1, T10). Wer ihn dort zusätzlich schreibt, hat den
Vertrag nicht gelesen; wer ihn in T73/T74 weglässt, öffnet die Tür mit Datenwirkung (Falle 61).

---

### Task 73: `_actions/gate.ts` — die zweite Gate-Fläche, mit derselben Reihenfolge

**Files:**
- Create: `src/app/m/lagerbuch/_actions/gate.ts`
- Test: `src/app/m/lagerbuch/_actions/gate.test.ts`

**Interfaces:**
- Consumes: `_lib/host.ts` (Teil 1, T10) — `requireLagerbuchHost(headers: Headers): void`;
  `_lib/absender.ts` (Teil 2, T16) — `absenderAus(headers: Headers): string`;
  `_lib/gateSchranke.ts` (Teil 2, T24) — `gateGesperrt(absender: string): number | null`,
  `gateFehlversuchBuchen(absender: string): void`;
  `_lib/gateTexte.ts` (Teil 2, T18) — `gateMeldung(roh, sperrSekunden): string | null`;
  `_lib/code.ts` (Teil 2, T17) — `normalisiereCode(roh: string): string`;
  `_lib/returnTo.ts` (Teil 2, T19) — `sanitizeReturnTo`;
  `_lib/tokenZiel.ts` (Teil 2, T19) — `tokenZielPfad`;
  `_lib/helferSitzung.ts` (Teil 2, T22) — `HELFER_COOKIE`, `helferCookieOptionen`,
  `helferGueltigkeitSekunden`;
  `_lib/schreibpfade/tokenEinloesung.ts` (T66) — `redeemToken`;
  `_db/client.ts` (Teil 1, T12) — `getDb()`.
- Produces:
  ```ts
  // _actions/gate.ts — "use server"
  export type GateZustand = { fehler?: string };
  export async function einloesenAmGate(
    _vorher: GateZustand, formData: FormData): Promise<GateZustand>;
  ```
  **Einziger Konsument:** `_ui/Gate.tsx` (T77) über `useActionState`.
- ⚠️ **`einloesenAmGate` steht auf der Ausnahmeliste des Guard-Scans, Eintrag 1** (§3.8.2). Sie
  **erzeugt** die Sitzung; ein Sitzungsriegel davor wäre die Tür, die sich selbst abschließt.
- ⚠️ **Die `useActionState`-Signatur ist bindend.** `_ui/Gate.tsx` ruft
  `useActionState<GateZustand, FormData>(einloesenAmGate, {})`; der erste Parameter ist der vorherige
  Zustand und wird **nicht gelesen**. Eine Signatur ohne ihn ist typkorrekt kompilierbar und liefert
  zur Laufzeit `FormData` im falschen Parameter — die Eingabe wäre dann immer leer.

**Die Reihenfolge ist bindend** (§7.5.2) und an **allen drei** Gate-Flächen dieselbe:

```
1. Host-Riegel                                    (§2.6) — hier die WERFENDE Form
2. gesperrt?  → ja: grund=zuviele, OHNE Datenbankzugriff
3. Code normalisieren                             (§7.5.3)
4. redeemToken(normalisierterCode, getDb())       (§7.13.2 — ein Handle, ein Weg)
5. Erfolg → Cookie setzen, umleiten.  KEIN Budgetverbrauch.
6. Misserfolg → die drei Zähler buchen, grund=code
```

⚠️ **Schritt 2 ist es, der den Datenbankzugriff schützt — nicht der Absender-Eimer.** Wer den
Absenderschlüssel rotiert, startet jeden Versuch mit leerem Absender-Eimer und bekäme so oder so genau
einen Lookup; gedeckelt wird das **ausschließlich** durch die beiden modulweiten Zähler, und die lesen
ihre Sperrzeit **vor** jedem DB-Zugriff (§3.5.3).

⚠️ **Schritt 5 verbraucht KEIN Budget.** Hundert erfolgreiche Einlösungen in Folge schließen das Gate
**nicht** — sonst sperrt sich eine Bereitschaft zu Schichtbeginn selbst aus, **mit richtigen Codes**.

⚠️ **Der Host-Riegel wirft hier, und das ist die eine Ausnahme vom Grundmuster aus §7.3.** Grund ist
Falle 66 in Gegenrichtung: ein Action-POST auf dem **falschen Host** ist kein Betriebsfall, den ein
Formular anzeigen müsste, sondern ein manipulierter. Die Existenz eines Pfades auf dem falschen Host
wird nicht verraten.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_actions/gate.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const QUELLE = "src/app/m/lagerbuch/_actions/gate.ts";

const gesetzteCookies: { name: string; wert: string; opt: unknown }[] = [];
const umleitungen: string[] = [];
let kopfzeilen = new Headers({ host: "lagerbuch.localtest.me" });

vi.mock("next/headers", () => ({
  headers: async () => kopfzeilen,
  cookies: async () => ({
    set: (name: string, wert: string, opt: unknown) => { gesetzteCookies.push({ name, wert, opt }); },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { umleitungen.push(ziel); throw new Error("NEXT_REDIRECT"); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

const gateGesperrt = vi.fn<(a: string) => number | null>(() => null);
const gateFehlversuchBuchen = vi.fn();
vi.mock("../_lib/gateSchranke", () => ({
  gateGesperrt: (a: string) => gateGesperrt(a),
  gateFehlversuchBuchen: (a: string) => gateFehlversuchBuchen(a),
}));

const redeemToken = vi.fn();
vi.mock("../_lib/schreibpfade/tokenEinloesung", () => ({
  redeemToken: (...a: unknown[]) => redeemToken(...a),
}));

const getDb = vi.fn(() => ({ marke: "db" }));
vi.mock("../_db/client", () => ({ getDb: () => getDb() }));

import { einloesenAmGate } from "./gate";

function form(felder: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(felder)) f.set(k, v);
  return f;
}

beforeEach(() => {
  gesetzteCookies.length = 0;
  umleitungen.length = 0;
  kopfzeilen = new Headers({ host: "lagerbuch.localtest.me" });
  gateGesperrt.mockReturnValue(null);
  redeemToken.mockReset();
  gateFehlversuchBuchen.mockReset();
  getDb.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe("einloesenAmGate — Schritt 1: der Host-Riegel WIRFT", () => {
  it("auf fremdem Host: notFound(), kein Rueckgabewert", async () => {
    // §7.3 nimmt den Riegelfall ausdruecklich vom Grundmuster aus: ein
    // Action-POST auf dem falschen Host ist kein Betriebsfall, den ein Formular
    // anzeigen muesste, sondern ein manipulierter. Die Existenz eines Pfades
    // auf dem falschen Host wird nicht verraten.
    kopfzeilen = new Headers({ host: "feedback.localtest.me" });
    await expect(einloesenAmGate({}, form({ code: "482-137" }))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redeemToken).not.toHaveBeenCalled();
  });
});

describe("einloesenAmGate — Schritt 2: gesperrt, OHNE Datenbankzugriff", () => {
  it("gibt den `zuviele`-Text zurueck und fasst die Datenbank NICHT an", async () => {
    // Schritt 2 schuetzt den DB-Zugriff, nicht der Absender-Eimer: wer den
    // Absenderschluessel rotiert, startet mit leerem Eimer und bekaeme so oder
    // so einen Lookup. Gedeckelt wird das ausschliesslich durch die beiden
    // modulweiten Zaehler, und die lesen VOR jedem DB-Zugriff (§3.5.3).
    gateGesperrt.mockReturnValue(42);
    const r = await einloesenAmGate({}, form({ code: "482-137" }));
    expect(r.fehler).toBe("Zu viele Fehlversuche. Bitte in 42 Sekunden erneut versuchen.");
    expect(redeemToken).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("bucht bei einer laufenden Sperre KEINEN weiteren Fehlversuch", async () => {
    // Sonst verlaengert jeder Versuch waehrend der Sperre die Sperre — eine
    // Bereitschaft, die es zweimal probiert, kaeme nie wieder herein.
    gateGesperrt.mockReturnValue(42);
    await einloesenAmGate({}, form({ code: "482-137" }));
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
  });
});

describe("einloesenAmGate — Schritt 3: die Normalisierung", () => {
  it("`482137` wird zu `482-137`, BEVOR redeemToken sie sieht (Falle 24)", async () => {
    // Der Generator setzt den Bindestrich fest zwischen Position 3 und 4; die
    // Suche laeuft auf Gleichheit. Ohne diese Zeile teilt sich eine
    // Bereitschaft, die zu Schichtbeginn von Hand eintippt, fuenf Fehlversuche
    // pro Minute — MIT RICHTIGEN CODES.
    redeemToken.mockResolvedValue({ ok: false });
    await einloesenAmGate({}, form({ code: " 482137 " })).catch(() => {});
    expect(redeemToken).toHaveBeenCalledWith("482-137", expect.anything());
  });
});

describe("einloesenAmGate — Schritt 5: Erfolg", () => {
  it("setzt das Cookie und leitet an das Code-Ziel", async () => {
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt.x.y", tokenId: "tk1", zielTyp: "fahrzeug", zielId: "fz-1",
    });
    await expect(einloesenAmGate({}, form({ code: "482-137" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(gesetzteCookies[0]?.name).toBe("helfer_session");
    expect(gesetzteCookies[0]?.wert).toBe("jwt.x.y");
    expect(umleitungen).toEqual(["/helfer/check?fz=fz-1"]);
  });

  it("ein ausdrueckliches `returnTo` hat VORRANG vor dem Code-Ziel", async () => {
    // Ein gescanntes Regaletikett fuehrt nach dem Einloesen zurueck auf den
    // Artikel — sonst laeuft der Deep-Link ins Leere.
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: "fahrzeug", zielId: "fz-1",
    });
    await einloesenAmGate({}, form({ code: "482-137", returnTo: "/a/art-9" })).catch(() => {});
    expect(umleitungen).toEqual(["/a/art-9"]);
  });

  it("ein FEINDLICHES `returnTo` wird verworfen (Open Redirect)", async () => {
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: null, zielId: null,
    });
    await einloesenAmGate({}, form({ code: "482-137", returnTo: "//boese.example/x" })).catch(() => {});
    expect(umleitungen).toEqual(["/helfer"]);
  });

  it("verbraucht KEIN Budget — hundert Erfolge schliessen das Gate nicht", async () => {
    // Sonst sperrt sich eine Bereitschaft zu Schichtbeginn selbst aus, mit
    // richtigen Codes (§3.5.3).
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: null, zielId: null,
    });
    for (let i = 0; i < 5; i++) await einloesenAmGate({}, form({ code: "482-137" })).catch(() => {});
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
  });

  it("leitet auf einen AEUSSEREN Pfad um", async () => {
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: "artikel", zielId: "art-9",
    });
    await einloesenAmGate({}, form({ code: "482-137" })).catch(() => {});
    expect(umleitungen[0]).toBe("/a/art-9");
    expect(umleitungen[0]).not.toMatch(/^\/m\/lagerbuch/);
  });
});

describe("einloesenAmGate — Schritt 6: Misserfolg", () => {
  it("bucht den Fehlversuch und gibt den `code`-Text zurueck — KEIN Wurf", async () => {
    redeemToken.mockResolvedValue({ ok: false });
    const r = await einloesenAmGate({}, form({ code: "000-000" }));
    expect(gateFehlversuchBuchen).toHaveBeenCalledTimes(1);
    expect(r.fehler).toBe("Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.");
    expect(gesetzteCookies).toEqual([]);
  });

  it("sagt bei einem GESPERRTEN Code dasselbe wie bei einem unbekannten", async () => {
    // Ein Text, der beides unterschiede, waere ein Orakel darueber, welche der
    // 10^6 Ziffernfolgen je vergeben waren.
    redeemToken.mockResolvedValue({ ok: false });
    const r = await einloesenAmGate({}, form({ code: "900-001" }));
    expect(r.fehler).toBe("Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.");
  });

  it("ein leeres Feld ist ein Fehlversuch wie jeder andere", async () => {
    redeemToken.mockResolvedValue({ ok: false });
    const r = await einloesenAmGate({}, form({ code: "" }));
    expect(r.fehler).toBeTruthy();
  });
});

describe("Bauform", () => {
  it("traegt \"use server\" und exportiert genau EINE Action", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/^"use server";/m);
    expect([...q.matchAll(/^export async function (\w+)/gm)].map((m) => m[1])).toEqual([
      "einloesenAmGate",
    ]);
  });

  it("ruft `requireLagerbuchHost` als ERSTE Anweisung", () => {
    const q = readFileSync(QUELLE, "utf8");
    const rumpf = q.slice(q.indexOf("export async function einloesenAmGate"));
    const ersteZeilen = rumpf.split("\n").slice(0, 8).join("\n");
    expect(ersteZeilen).toMatch(/requireLagerbuchHost\(/);
  });

  it("holt das DB-Handle ueber `getDb()` und legt keinen zweiten Opener an", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/redeemToken\([^,]+, getDb\(\)\)/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/gate.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./gate"`.

- [ ] **Schritt 3: `_actions/gate.ts` schreiben**

```ts
"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireLagerbuchHost } from "../_lib/host";
import { absenderAus } from "../_lib/absender";
import { gateGesperrt, gateFehlversuchBuchen } from "../_lib/gateSchranke";
import { gateMeldung } from "../_lib/gateTexte";
import { normalisiereCode } from "../_lib/code";
import { sanitizeReturnTo } from "../_lib/returnTo";
import { tokenZielPfad } from "../_lib/tokenZiel";
import {
  HELFER_COOKIE, helferCookieOptionen, helferGueltigkeitSekunden,
} from "../_lib/helferSitzung";
import { redeemToken } from "../_lib/schreibpfade/tokenEinloesung";
import { getDb } from "../_db/client";

/**
 * DIE ZWEITE GATE-FLAECHE — §7.2.4, §7.5.2. Die anderen beiden sind
 * `t/[code]/route.ts` (T82) und `erneuereSitzung` (T74); alle drei tragen
 * DIESELBEN Riegel in DERSELBEN Reihenfolge.
 *
 * ⚠️ AUSNAHMELISTE DES GUARD-SCANS, EINTRAG 1 (§3.8.2). Diese Action ERZEUGT
 * die Sitzung; ein Sitzungsriegel davor waere die Tuer, die sich selbst
 * abschliesst. Wer den Scan „vervollstaendigt", indem er hier
 * `requireHelferSchreibend` einsetzt, macht das Gate unbenutzbar — und der
 * Fehler sieht wie eine Verbesserung aus.
 *
 * ⚠️ DIE `useActionState`-SIGNATUR IST BINDEND. `_ui/Gate.tsx` ruft
 * `useActionState<GateZustand, FormData>(einloesenAmGate, {})`; der erste
 * Parameter ist der VORHERIGE Zustand und wird nicht gelesen. Eine Signatur
 * ohne ihn ist typkorrekt kompilierbar und bekaeme zur Laufzeit `FormData` im
 * falschen Parameter — die Eingabe waere dann IMMER LEER, und das Gate
 * antwortete auf jeden Code mit „unbekannt".
 */
export type GateZustand = { fehler?: string };

export async function einloesenAmGate(
  _vorher: GateZustand,
  formData: FormData,
): Promise<GateZustand> {
  const kopf = await headers();

  // SCHRITT 1 — der Host-Riegel, und er WIRFT. Das ist die eine Ausnahme vom
  // Grundmuster aus §7.3: ein Action-POST auf dem falschen Host ist kein
  // Betriebsfall, den ein Formular anzeigen muesste, sondern ein manipulierter.
  // Die Existenz eines Pfades auf dem falschen Host wird nicht verraten
  // (docs/design/README.md:237-242).
  requireLagerbuchHost(kopf);

  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") ?? ""));
  const absender = absenderAus(kopf);   // §3.5.2 — einmal ermittelt, zweimal benutzt

  // SCHRITT 2 — gesperrt? OHNE Datenbankzugriff. DIESER Schritt schuetzt die
  // Datenbank, nicht der Absender-Eimer: wer den Absenderschluessel rotiert,
  // startet jeden Versuch mit leerem Eimer und bekaeme so oder so genau einen
  // Lookup. Gedeckelt wird das ausschliesslich durch die beiden modulweiten
  // Zaehler, und die lesen ihre Sperrzeit VOR jedem DB-Zugriff (§3.5.3).
  //
  // Und es wird hier KEIN Fehlversuch gebucht: sonst verlaengerte jeder Versuch
  // waehrend der Sperre die Sperre, und eine Bereitschaft, die es zweimal
  // probiert, kaeme nie wieder herein.
  const sperrSekunden = gateGesperrt(absender);
  if (sperrSekunden !== null) {
    return { fehler: gateMeldung("zuviele", sperrSekunden) ?? undefined };
  }

  // SCHRITT 3 — normalisieren (§7.5.3, Falle 24). `482137` findet `482-137`
  // ohne diese Zeile NICHT, und die Bereitschaft, die zu Schichtbeginn von Hand
  // eintippt, sperrt sich selbst aus — MIT RICHTIGEN CODES.
  const code = normalisiereCode(String(formData.get("code") ?? ""));

  // SCHRITT 4 — `redeemToken` NIMMT das Handle, es holt sich keins:
  // `_db/client.ts#getDb()` ist der einzige Opener des Moduls (§5.13.2).
  const res = await redeemToken(code, getDb());

  if (!res.ok) {
    // SCHRITT 6 — erst JETZT wird gebucht. Die drei Zaehler liegen HINTER der
    // Codepruefung und zaehlen NUR Fehlversuche (§3.5.3).
    gateFehlversuchBuchen(absender);
    return { fehler: gateMeldung("code", null) ?? undefined };
  }

  // SCHRITT 5 — Erfolg. KEIN Budgetverbrauch: hundert erfolgreiche
  // Einloesungen in Folge schliessen das Gate NICHT.
  //
  // `helferCookieOptionen()` fuehrt KEIN `domain` — das Cookie ist host-only,
  // und genau diese Eigenschaft laesst die Sitzungen den Cutover ueberleben,
  // SOFERN `SUITE_HOST_LAGERBUCH` zeichengleich die heutige APP_BASE_URL ist
  // (Runbook-Eingabe R1, §7.4.1).
  (await cookies()).set(
    HELFER_COOKIE,
    res.cookieValue,
    helferCookieOptionen(helferGueltigkeitSekunden()),
  );

  // AEUSSERER Pfad. Ein ausdrueckliches `returnTo` (Deep-Link) hat Vorrang;
  // sonst fuehrt der Code an sein hinterlegtes Ziel (§7.2.5).
  redirect(returnTo ?? tokenZielPfad(res.zielTyp, res.zielId));
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/gate.test.ts
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_actions/gate.ts src/app/m/lagerbuch/_actions/gate.test.ts
git commit -m "feat(lagerbuch): _actions/gate.ts — die zweite Gate-Flaeche, sechs Schritte in fester Ordnung

Host (werfend) → Sperre OHNE DB → normalisieren → redeemToken → Erfolg ohne
Budgetverbrauch → Misserfolg mit Buchung. Dieselbe Reihenfolge wie in
t/[code]/route.ts und erneuereSitzung; §7.5.2 nennt sie verbindlich fuer alle
drei.

Schritt 2 schuetzt den Datenbankzugriff, nicht der Absender-Eimer: wer den
Absenderschluessel rotiert, startet mit leerem Eimer und bekaeme so oder so
einen Lookup. Und waehrend einer laufenden Sperre wird KEIN weiterer
Fehlversuch gebucht — sonst verlaengert jeder Versuch die Sperre.

Erfolge verbrauchen kein Budget: hundert Einloesungen in Folge schliessen das
Gate nicht, sonst sperrt sich eine Bereitschaft zu Schichtbeginn selbst aus,
mit richtigen Codes.

Der Host-Riegel WIRFT hier — die eine Ausnahme vom Rueckgabewert-Grundmuster
(§7.3): ein Action-POST auf dem falschen Host ist kein Betriebsfall, den ein
Formular anzeigen muesste. Ausnahmeliste des Guard-Scans, Eintrag 1: die Action
erzeugt die Sitzung, ein Sitzungsriegel davor waere die Tuer, die sich selbst
abschliesst."
```

---

### Task 74: `_actions/sitzung.ts` — die dritte Gate-Fläche und der Beenden-Knopf

**Files:**
- Create: `src/app/m/lagerbuch/_actions/sitzung.ts`
- Test: `src/app/m/lagerbuch/_actions/sitzung.test.ts`

**Interfaces:**
- Consumes: dieselben wie T73, **ohne** `tokenZiel.ts` und `returnTo.ts`; zusätzlich
  `_lib/actionTypen.ts` (T63) — `type HelferErgebnis`, `RIEGEL_TEXTE`.
- Produces:
  ```ts
  // _actions/sitzung.ts — "use server"
  export async function erneuereSitzung(rohCode: string): Promise<HelferErgebnis<null>>;
  export async function beenden(): Promise<void>;                 // wirft NEXT_REDIRECT auf "/"
  ```
  Konsumenten: `erneuereSitzung` → `_ui/CheckFlow.tsx` (T79); `beenden` → `_ui/HelferRahmen.tsx`
  (T76) als `<form action={beenden}>`.
- ⚠️ **Beide stehen auf der Ausnahmeliste des Guard-Scans, Einträge 2 und 3** (§3.8.2).
  `erneuereSitzung` **erzeugt** die Sitzung; `beenden` **löscht** sie und muss auch dann noch wirken,
  wenn sie längst ungültig ist.

**Warum `erneuereSitzung` überhaupt existiert** (§7.4.4). Ein Fahrzeug-Check ist zehn bis zwanzig
Minuten Arbeit, und **der gesamte Zustand liegt im Client** (`CheckFlow.tsx:62-71`: sechs `useState`).
Läuft die Sitzung ab oder wurde das Cookie geräumt (§7.10.4), führt **jeder** naheliegende Weg —
Redirect aufs Gate, Neuladen — durch das Verwerfen dieser Arbeit.

⚠️ **Das ist keine Verlängerung „auf Knopfdruck" im Sinne von §3.4.3, sondern das dort geforderte
„erneut scannen" — nur ohne die Seite zu verlassen.** Ohne erneute Code-Eingabe passiert nichts.
Deshalb ist sie **eine dritte Gate-Fläche** und wird als solche behandelt: dasselbe Rate-Limit,
dieselbe Normalisierung, derselbe Host-Riegel, dieselbe Protokollzeile.

**Warum `beenden` NEBEN `abmelden/route.ts` steht und kein Doppel ist** (§3.1). `/abmelden` (Teil 2,
T26) ist der Weg für den **Sperr- und den Ablauffall**: `requireHelferSitzung` läuft aus
`helfer/layout.tsx`, und das ist eine **Server Component** — dort ist `cookies()` versiegelt, `delete`
wirft (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53` trägt den Satz „Cookies
can only be modified in a Server Action or Route Handler" wörtlich). `beenden` ist der Weg für den
**Knopf**, und eine Server Action darf Cookies setzen. Ein Knopf, der stattdessen über einen
`GET`-Handler ginge, wäre ein **Link** — und damit vorlade- und prefetch-fähig. **Ein Prefetch, der
die Sitzung beendet, ist genau die Sorte Fehler, die niemand reproduziert.**

⚠️ **`beenden` räumt nur das Cookie** (1:1 aus `helfer/actions.ts:7`). Es widerruft **nichts**
serverseitig — es gibt kein `jti` und keinen Einzelwiderruf (Falle 20, ausdrücklich nicht behoben).
Wer denselben Code erneut eingibt, ist wieder drin. Das ist gewollt: der Knopf heißt „Beenden", nicht
„Kärtchen sperren"; sperren tut die Verwaltung.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_actions/sitzung.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const QUELLE = "src/app/m/lagerbuch/_actions/sitzung.ts";

const gesetzteCookies: { name: string; wert: string }[] = [];
const geloeschteCookies: string[] = [];
const umleitungen: string[] = [];
let kopfzeilen = new Headers({ host: "lagerbuch.localtest.me" });

vi.mock("next/headers", () => ({
  headers: async () => kopfzeilen,
  cookies: async () => ({
    set: (name: string, wert: string) => { gesetzteCookies.push({ name, wert }); },
    delete: (name: string) => { geloeschteCookies.push(name); },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { umleitungen.push(ziel); throw new Error("NEXT_REDIRECT"); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

const gateGesperrt = vi.fn<(a: string) => number | null>(() => null);
const gateFehlversuchBuchen = vi.fn();
vi.mock("../_lib/gateSchranke", () => ({
  gateGesperrt: (a: string) => gateGesperrt(a),
  gateFehlversuchBuchen: (a: string) => gateFehlversuchBuchen(a),
}));

const redeemToken = vi.fn();
vi.mock("../_lib/schreibpfade/tokenEinloesung", () => ({
  redeemToken: (...a: unknown[]) => redeemToken(...a),
}));
vi.mock("../_db/client", () => ({ getDb: () => ({ marke: "db" }) }));

import { erneuereSitzung, beenden } from "./sitzung";

beforeEach(() => {
  gesetzteCookies.length = 0;
  geloeschteCookies.length = 0;
  umleitungen.length = 0;
  kopfzeilen = new Headers({ host: "lagerbuch.localtest.me" });
  gateGesperrt.mockReturnValue(null);
  redeemToken.mockReset();
  gateFehlversuchBuchen.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("erneuereSitzung — die dritte Gate-Flaeche", () => {
  it("der Host-Riegel WIRFT auch hier", async () => {
    kopfzeilen = new Headers({ host: "feedback.localtest.me" });
    await expect(erneuereSitzung("482-137")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("laeuft durch DIESELBE Sperre wie das Gate, OHNE Datenbankzugriff", async () => {
    gateGesperrt.mockReturnValue(17);
    const r = await erneuereSitzung("482-137");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.grund).toBe("gesperrt");
    expect(!r.ok && r.text).toBe("Zu viele Fehlversuche. Bitte in 17 Sekunden erneut versuchen.");
    expect(redeemToken).not.toHaveBeenCalled();
  });

  it("normalisiert den Code — DIESELBE Funktion wie am Gate (Falle 24)", async () => {
    redeemToken.mockResolvedValue({ ok: false });
    await erneuereSitzung(" 482137 ");
    expect(redeemToken).toHaveBeenCalledWith("482-137", expect.anything());
  });

  it("setzt bei Erfolg ein FRISCHES Cookie und leitet NICHT um", async () => {
    // Der Punkt der Inline-Erneuerung ist, die Seite NICHT zu verlassen: der
    // gesamte Check-Zustand liegt im Client (CheckFlow.tsx:62-71, sechs
    // useState), und jede Navigation verwuerfe zehn bis zwanzig Minuten Arbeit.
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt.neu", tokenId: "tk1", zielTyp: null, zielId: null,
    });
    const r = await erneuereSitzung("482-137");
    expect(r).toEqual({ ok: true, wert: null });
    expect(gesetzteCookies[0]?.name).toBe("helfer_session");
    expect(gesetzteCookies[0]?.wert).toBe("jwt.neu");
    expect(umleitungen).toEqual([]);
  });

  it("bucht bei einem falschen Code einen Fehlversuch und gibt einen Text zurueck — KEIN Wurf", async () => {
    redeemToken.mockResolvedValue({ ok: false });
    const r = await erneuereSitzung("000-000");
    expect(gateFehlversuchBuchen).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.grund).toBe("gesperrt");
    expect(!r.ok && r.text).toBe(
      "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.",
    );
  });

  it("verbraucht bei Erfolg KEIN Budget", async () => {
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: null, zielId: null,
    });
    for (let i = 0; i < 5; i++) await erneuereSitzung("482-137");
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
  });
});

describe("beenden", () => {
  it("loescht das Cookie und leitet aufs Gate", async () => {
    await expect(beenden()).rejects.toThrow("NEXT_REDIRECT");
    expect(geloeschteCookies).toEqual(["helfer_session"]);
    expect(umleitungen).toEqual(["/"]);
  });

  it("leitet auf einen AEUSSEREN Pfad", async () => {
    await beenden().catch(() => {});
    expect(umleitungen[0]).toBe("/");
    expect(umleitungen[0]).not.toMatch(/^\/m\/lagerbuch/);
  });

  it("prueft den Host NICHT — ein Abmelden darf nie an einem Riegel scheitern", async () => {
    // Der schlechteste denkbare Zustand ist eine Sitzung, die man nicht mehr
    // loswird. `beenden` entfernt nur ein host-only Cookie; auf fremdem Host
    // gibt es keins, und der Aufruf ist dort wirkungslos statt schaedlich.
    kopfzeilen = new Headers({ host: "feedback.localtest.me" });
    await beenden().catch(() => {});
    expect(geloeschteCookies).toEqual(["helfer_session"]);
  });
});

describe("Bauform", () => {
  it("traegt \"use server\" und exportiert GENAU ZWEI Actions", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/^"use server";/m);
    expect([...q.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]))
      .toEqual(["erneuereSitzung", "beenden"]);
  });

  it("`erneuereSitzung` ruft `requireLagerbuchHost` als erste Anweisung", () => {
    const q = readFileSync(QUELLE, "utf8");
    const rumpf = q.slice(q.indexOf("export async function erneuereSitzung"));
    expect(rumpf.split("\n").slice(0, 8).join("\n")).toMatch(/requireLagerbuchHost\(/);
  });

  it("traegt den Kommentar, der `beenden` gegen `/abmelden` abgrenzt", () => {
    // Ohne ihn liest ein Reviewer die beiden als Doppel und streicht eines.
    expect(readFileSync(QUELLE, "utf8")).toMatch(/abmelden/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/sitzung.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./sitzung"`.

- [ ] **Schritt 3: `_actions/sitzung.ts` schreiben**

```ts
"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireLagerbuchHost } from "../_lib/host";
import { absenderAus } from "../_lib/absender";
import { gateGesperrt, gateFehlversuchBuchen } from "../_lib/gateSchranke";
import { gateMeldung } from "../_lib/gateTexte";
import { normalisiereCode } from "../_lib/code";
import {
  HELFER_COOKIE, helferCookieOptionen, helferGueltigkeitSekunden,
} from "../_lib/helferSitzung";
import { redeemToken } from "../_lib/schreibpfade/tokenEinloesung";
import { getDb } from "../_db/client";
import type { HelferErgebnis } from "../_lib/actionTypen";

/**
 * DIE INLINE-ERNEUERUNG UND DER BEENDEN-KNOPF — §7.4.4.
 *
 * ⚠️ BEIDE STEHEN AUF DER AUSNAHMELISTE DES GUARD-SCANS, EINTRAEGE 2 UND 3
 * (§3.8.2). `erneuereSitzung` ERZEUGT die Sitzung — ein Sitzungsriegel davor
 * waere die Tuer, die sich selbst abschliesst. `beenden` LOESCHT sie und muss
 * auch dann noch wirken, wenn sie laengst ungueltig ist; ein Riegel machte den
 * Abmeldeknopf ausgerechnet in dem Zustand unbrauchbar, in dem man ihn
 * braucht.
 */

/**
 * DIE DRITTE GATE-FLAECHE (§7.4.4). Ein Fahrzeug-Check ist zehn bis zwanzig
 * Minuten Arbeit, und DER GESAMTE ZUSTAND LIEGT IM CLIENT
 * (`CheckFlow.tsx:62-71`: sechs `useState`). Laeuft die Sitzung ab oder wurde
 * das Cookie geraeumt (§7.10.4), fuehrt JEDER naheliegende Weg — Redirect aufs
 * Gate, Neuladen — durch das Verwerfen dieser Arbeit.
 *
 * ⚠️ DAS IST KEINE VERLAENGERUNG „AUF KNOPFDRUCK" im Sinne von §3.4.3, sondern
 * das dort geforderte „erneut scannen" — nur ohne die Seite zu verlassen. OHNE
 * ERNEUTE CODE-EINGABE PASSIERT NICHTS. Deshalb laeuft sie durch DASSELBE
 * Rate-Limit, DIESELBE Normalisierung, DENSELBEN Host-Riegel und DIESELBE
 * Protokollzeile wie das Gate (§7.5.2) — sie ist eine dritte Gate-Flaeche und
 * kein Sonderweg.
 *
 * SIE LEITET NICHT UM. Das ist der ganze Punkt: die Seite bleibt stehen, die
 * gezaehlten Mengen bleiben stehen, und die Helferin tippt danach erneut auf
 * „Abschliessen".
 *
 * Der `grund` ist in beiden Fehlerfaellen `"gesperrt"` und nicht `"sitzung"`:
 * `darfErneuern` (T63) schaltet auf `"sitzung"` das Erneuerungsfeld EIN — und
 * genau dieses Feld ist die Stelle, an der wir gerade stehen. Ein `"sitzung"`
 * hier baute ein zweites Feld im ersten auf.
 */
export async function erneuereSitzung(rohCode: string): Promise<HelferErgebnis<null>> {
  const kopf = await headers();

  // SCHRITT 1 — Host-Riegel, werfend (§7.3, Riegelfall).
  requireLagerbuchHost(kopf);

  const absender = absenderAus(kopf);

  // SCHRITT 2 — Sperre, OHNE Datenbankzugriff, ohne Buchung.
  const sperrSekunden = gateGesperrt(absender);
  if (sperrSekunden !== null) {
    return {
      ok: false,
      grund: "gesperrt",
      text: gateMeldung("zuviele", sperrSekunden) ?? "Zu viele Fehlversuche.",
    };
  }

  // SCHRITT 3 und 4 — dieselbe Normalisierung, dasselbe Handle.
  const res = await redeemToken(normalisiereCode(rohCode), getDb());

  if (!res.ok) {
    // SCHRITT 6 — erst jetzt buchen.
    gateFehlversuchBuchen(absender);
    return {
      ok: false,
      grund: "gesperrt",
      text: gateMeldung("code", null) ?? "Dieser Code ist unbekannt oder wurde gesperrt.",
    };
  }

  // SCHRITT 5 — Erfolg, KEIN Budgetverbrauch, KEIN Redirect.
  (await cookies()).set(
    HELFER_COOKIE,
    res.cookieValue,
    helferCookieOptionen(helferGueltigkeitSekunden()),
  );
  return { ok: true, wert: null };
}

/**
 * DER BEENDEN-KNOPF im Rahmenkopf — 1:1 aus `helfer/actions.ts:7`.
 *
 * ⚠️ WARUM ES IHN NEBEN `abmelden/route.ts` (Teil 2, T26) GIBT, und warum das
 * KEIN Doppel ist:
 *
 *  * `/abmelden` ist der Weg fuer den SPERR- UND DEN ABLAUFFALL.
 *    `requireHelferSitzung` laeuft aus `helfer/layout.tsx`, und das ist eine
 *    SERVER COMPONENT — dort ist `cookies()` versiegelt, `delete` wirft
 *    (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53`
 *    traegt den Satz „Cookies can only be modified in a Server Action or Route
 *    Handler" woertlich). Ein Layout kann das Cookie also nicht raeumen.
 *  * `beenden` ist der Weg fuer den KNOPF. Eine Server Action DARF Cookies
 *    setzen. Ein Knopf, der stattdessen ueber den GET-Handler ginge, waere ein
 *    LINK — und damit vorlade- und prefetch-faehig. EIN PREFETCH, DER DIE
 *    SITZUNG BEENDET, ist genau die Sorte Fehler, die niemand reproduziert.
 *
 * ⚠️ ES RAEUMT NUR DAS COOKIE. Serverseitig wird NICHTS widerrufen — es gibt
 * kein `jti` und keinen Einzelwiderruf (Falle 20, ausdruecklich nicht behoben,
 * §7.4.1). Wer denselben Code erneut eingibt, ist wieder drin. Das ist gewollt:
 * der Knopf heisst „Beenden", nicht „Kaertchen sperren"; sperren tut die
 * Verwaltung (§6.2.2, Zeile 22).
 *
 * ⚠️ KEIN HOST-RIEGEL. Der schlechteste denkbare Zustand ist eine Sitzung, die
 * man nicht mehr loswird. `beenden` entfernt ein host-only Cookie; auf einem
 * fremden Host gibt es keins, und der Aufruf ist dort wirkungslos statt
 * schaedlich.
 */
export async function beenden(): Promise<void> {
  (await cookies()).delete(HELFER_COOKIE);
  redirect("/");   // AEUSSERER Pfad — die Modulwurzel ist das Gate (§2.1 b)
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/sitzung.test.ts
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_actions/sitzung.ts src/app/m/lagerbuch/_actions/sitzung.test.ts
git commit -m "feat(lagerbuch): _actions/sitzung.ts — Inline-Erneuerung und Beenden

Ein Fahrzeug-Check ist zehn bis zwanzig Minuten Arbeit, und der gesamte Zustand
liegt im Client (sechs useState). Laeuft die Sitzung ab, fuehrt jeder
naheliegende Weg — Redirect aufs Gate, Neuladen — durch das Verwerfen dieser
Arbeit. erneuereSitzung ist deshalb eine DRITTE Gate-Flaeche mit demselben
Rate-Limit, derselben Normalisierung und demselben Host-Riegel — und sie leitet
NICHT um. Ohne erneute Code-Eingabe passiert nichts; das ist keine
Verlaengerung auf Knopfdruck, sondern das in §3.4.3 geforderte 'erneut
scannen' ohne Seitenwechsel.

beenden steht NEBEN abmelden/route.ts und ist kein Doppel: /abmelden loest den
Sperr- und Ablauffall aus einer Server Component, wo cookies().delete wirft;
beenden bedient den Knopf. Ein Knopf ueber einen GET-Handler waere ein Link —
und ein Prefetch, der die Sitzung beendet, ist die Sorte Fehler, die niemand
reproduziert. beenden prueft bewusst KEINEN Host: der schlechteste Zustand ist
eine Sitzung, die man nicht mehr loswird.

Beide auf der Ausnahmeliste des Guard-Scans (Eintraege 2 und 3)."
```

---

### Task 75: `_actions/check.ts` — eine Transaktion, vier Würfe, sechs innere Pfade

**Files:**
- Create: `src/app/m/lagerbuch/_actions/check.ts`
- Test: `src/app/m/lagerbuch/_actions/check.test.ts`

**Interfaces:**
- Consumes: `_lib/helferZugang.ts` (Teil 2, T25) — `requireHelferSchreibend(db)`;
  `_lib/actionTypen.ts` (T63) — `type HelferErgebnis`, `RIEGEL_TEXTE`, `NETZ_TEXT_CHECK` (nur der
  Typ-Import für den Client);
  `_lib/checkNutzlast.ts` (Teil 3, T43) — **nur die Typen** `CheckNutzlast`, `CheckZaehlung`;
  `_lib/konstanten.ts` (Teil 1, T4) — `HANDLAGER_ID`, `MONAT_REGEX`, `ZUSTAENDE`, `ZUSTAND_DEFEKT`;
  `_lib/schreibpfade/korrektur.ts` (Teil 3, T58) —
  `korrekturAufLagerort(tx, args): { diff: number; chargeId: string | null }`;
  `_lib/schreibpfade/umlagerung.ts` (Teil 3, T57) —
  `umlagerung(tx, args): { umgelagert: number; teile: Teil[] }`;
  `_lib/schreibpfade/lagerortVerfall.ts` (Teil 3, T55) — `setzeVerfall(db|tx, args): void`;
  `_lib/lesepfade/verfall.ts` (Teil 3, T47) —
  `verfallFuerLagerort(db, lagerortId, now?): Map<string, VerfallAmLagerort>`;
  `_lib/domain/o2.ts` (Teil 3, T34) — `o2Status(druckBar, nennfuelldruckBar): O2Status`;
  `_db/schema.ts` (Teil 1, T7) — `checks`, `sollPositionen`, `geraete`, `o2Flaschen`, `o2Messungen`,
  `newId`; `_db/client.ts` (Teil 1, T12) — `getDb()`, `type DB`. Aus `zod`: `z`. Aus `next/cache`:
  `revalidatePath`. Aus `drizzle-orm`: `eq`.
- Produces:
  ```ts
  // _actions/check.ts — "use server"
  export type CheckAbschlussWert = {
    checkId: string;
    nachgefuellt: number;            // TATSAECHLICH umgelagert (nach Handlager-Kappung)
    nachfuellBestaetigt: number;     // was der Helfer bestaetigt hat — NEU (§7.9.4)
    offen: number;
    geraeteAuffaellig: number;
    flaschenAuffaellig: number;
    flaschenNichtBewertbar: number;  // NEU (§7.9.4, §5.12)
    verfallAuffaellig: number;
  };

  export async function checkAbschluss(
    eingabe: unknown, db?: DB): Promise<HelferErgebnis<CheckAbschlussWert>>;
  ```
  **Einziger Konsument:** `_ui/CheckFlow.tsx` (T79).
- ⚠️ **`requireHelferSchreibend` ist die ERSTE Anweisung, vor jedem `parse`** (§7.4.3) — und der
  **Rückgabewert MUSS ausgewertet werden.**

**Der Riegel, mit ausgeschriebenem Kommentar** (§7.4.3, wörtlich):

```ts
// ERSTE Anweisung, und der Rueckgabewert MUSS ausgewertet werden. Bis zur
// Portierung warf dieser Riegel (session.ts:25,28) — ein Wurf liess sich nicht
// uebersehen. Ein Rueckgabewert schon: `await requireHelferSchreibend(db)` ohne
// Pruefung ist typkorrekt, lint-sauber und oeffnet diese Action fuer jeden.
```

⚠️ **`requireLagerbuchHost` wird hier NICHT gerufen.** `requireHelferSchreibend` ruft ihn **intern,
als erste Anweisung** (Teil 1, T10, Verankerungstabelle) — genau deshalb ist die Zusage „jede
Helfer-Action ist host-gebunden" durch **Konstruktion** wahr und nicht durch eine Liste, die die
nächste Action vergisst. Ein zweiter Aufruf hier wäre nicht falsch, aber er signalisierte, dass der
Vertrag nicht gelesen wurde — und lüde die nächste Action dazu ein, sich **auf** den doppelten Aufruf
zu verlassen statt auf den inneren.

**Die vier Würfe bleiben Würfe** (§7.3). Sie sind der ausdrücklich ausgenommene **Riegelfall**: „nicht
‚erwartbar', sondern ‚manipuliert'". **Kein Helfer erreicht sie über die Oberfläche** — die Nutzlast
entsteht aus Daten, die derselbe Server gerade geliefert hat.

| Wurf | Alt-Zeile | Was er verhindert |
|---|---|---|
| „Soll-Position gehört nicht zu diesem Fahrzeug" | `check.ts:94` | Fremde Positionen aufs eigene Fahrzeug buchen |
| „Gerät gehört nicht zu diesem Fahrzeug" | `check.ts:128` | Ein Gerät eines anderen Fahrzeugs als „fehlt" quittieren |
| „Flasche gehört nicht zu diesem Fahrzeug" | `check.ts:139` | Eine fremde Flasche mit einer erfundenen Messung beschreiben |
| „Artikel gehört nicht zu diesem Fahrzeug" | `check.ts:155` | Einen Verfall an einem Artikel setzen, der hier nicht im Soll steht |

**Die Reihenfolge in der Transaktion bleibt zeichengleich** (§5.8): **pro ARTIKEL, nicht pro
Position**, weil der Fahrzeugbestand pro (Artikel, Lagerort) geführt wird und derselbe Artikel in
mehreren Fächern **einen** Bestand teilt (§5.7.1).

1. **Abgleich** — `korrekturAufLagerort(tx, …, istMenge = Summe der gezählten Ist)`.
2. **Nachfüllen** — `umlagerung(tx, …, menge = Summe der bestätigten Nachfüllmengen)`.
3. **Geräte**, **Flaschen**, **Verfälle** — je mit Zugehörigkeitsprüfung.
4. Zählen **NACH** dem Schreiben (`verfallFuerLagerort`), damit die Rückmeldung den **ganzen**
   Fahrzeugstand widerspiegelt, nicht nur die in diesem Check angefassten Artikel.

**Zwei Ergänzungen gegenüber dem Bestand** (§7.9.4):

- **`nachfuellBestaetigt`** neben `nachgefuellt`. `umlagerung` **kappt still** an der Verfügbarkeit,
  und der Helfer hat die Teile **in der Hand**. Ohne die zweite Zahl legt er sie ins Fahrzeug und das
  Journal weiß es nicht. Der Text dazu steht in T79: „Von N bestätigten Teilen konnten nur M gebucht
  werden."
- **`flaschenNichtBewertbar`** — Flaschen mit `nennfuelldruckBar <= 0` (§5.12). `fuellstandProzent`
  gibt dort `0` zurück (`o2.ts:9`), `o2Status` macht daraus `ampel: "rot"` und `niedrig: true`. **Eine
  Flasche ohne bekannten Nennfülldruck erschiene damit als „niedrig", obwohl sie schlicht nicht
  bewertbar ist** — und die Helferin liefe los, um eine volle Flasche zu tauschen. Sie zählt deshalb
  **nicht** unter `flaschenAuffaellig`. **Die Messung wird trotzdem geschrieben**: sie ist Rohdatum
  und bleibt richtig, auch wenn die Bewertung fehlt.

**`revalidatePath` — sechs INNERE Pfade** (§7.9.5), zeichengleich:

```
/m/lagerbuch/helfer/check
/m/lagerbuch/verwaltung/checks
/m/lagerbuch/verwaltung
/m/lagerbuch/verwaltung/sauerstoff
/m/lagerbuch/verwaltung/verfall
/m/lagerbuch/verwaltung/fahrzeuge
```

⚠️ **Innen hier, außen dort — und beide Sorten stehen in derselben Datei.** Alle 61
`revalidatePath`-Aufrufe des Bestands übergeben den **äußeren** Pfad; alle vier vorhandenen
Suite-Module den **inneren** (Falle 49). Da alle Helfer-Seiten `force-dynamic` sind, ist die
praktische Wirkung gering — **ein falscher Pfad, der nichts tut, wird beim nächsten Caching-Schritt
zum stillen Defekt.**

⚠️ **Die zwei Zeilen für eine spätere `scope_lagerort_id`-Durchsetzung** (offene Frage 5, §0): die
**erste** ist die `gewaehlt`-Berechnung in `helfer/check/page.tsx` (T85), die **zweite** steht hier —
unmittelbar nach dem Riegel, mit `zugang.tokenId` in der Hand. Beide tragen einen Kommentar; **mehr
braucht es dann nicht.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_actions/check.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import {
  lagerorte, artikel, chargen, buchungen, sollPositionen, geraete, o2Flaschen, o2Messungen, checks,
} from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";

const QUELLE = "src/app/m/lagerbuch/_actions/check.ts";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));

const riegel = vi.fn();
vi.mock("../_lib/helferZugang", () => ({
  requireHelferSchreibend: (db: unknown) => riegel(db),
}));

import { checkAbschluss } from "./check";

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  riegel.mockResolvedValue({
    ok: true,
    zugang: { tokenId: "tk1", code: "482-137", label: "RTW 1", laeuftAb: new Date(Date.now() + 3600_000) },
  });
  t = migrierteTestDb();
  const jetzt = new Date();
  t.db.insert(lagerorte).values([
    { id: HANDLAGER_ID, name: "Handlager", typ: "lager", aktiv: true, createdAt: jetzt },
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, createdAt: jetzt },
    { id: "fz-2", name: "MTW", typ: "fahrzeug", aktiv: true, createdAt: jetzt },
  ]).run();
  t.db.insert(artikel).values([
    { id: "art-1", name: "Kompresse", einheit: "Stk", fach: "A-01", mindestbestand: 0, aktiv: true, createdAt: jetzt },
  ]).run();
  t.db.insert(chargen).values([
    { id: "ch-1", artikelId: "art-1", chargenNr: "L1", verfall: "2027-03", createdAt: jetzt },
  ]).run();
  // 10 Stueck im Handlager.
  t.db.insert(buchungen).values([
    { id: "b-1", ts: jetzt, typ: "zugang", artikelId: "art-1", chargeId: "ch-1",
      lagerortId: HANDLAGER_ID, menge: 10, quelleTyp: "system", quelleId: "seed",
      kommentar: null, referenz: null },
  ]).run();
  t.db.insert(sollPositionen).values([
    { id: "sp-1", fahrzeugId: "fz-1", fachLabel: "Fach 1", sort: 1, artikelId: "art-1",
      soll: 5, entfernt: false, createdAt: jetzt },
    { id: "sp-fremd", fahrzeugId: "fz-2", fachLabel: "Fach 1", sort: 1, artikelId: "art-1",
      soll: 3, entfernt: false, createdAt: jetzt },
  ]).run();
  t.db.insert(geraete).values([
    { id: "g-1", typ: "medizin", name: "Absaugpumpe", lagerortId: "fz-1", aktiv: true, createdAt: jetzt },
    { id: "g-fremd", typ: "medizin", name: "Fremd", lagerortId: "fz-2", aktiv: true, createdAt: jetzt },
  ]).run();
  t.db.insert(o2Flaschen).values([
    { id: "o-1", name: "O2 klein", lagerortId: "fz-1", nennfuelldruckBar: 200, aktiv: true, createdAt: jetzt },
    { id: "o-null", name: "O2 unbekannt", lagerortId: "fz-1", nennfuelldruckBar: 0, aktiv: true, createdAt: jetzt },
    { id: "o-fremd", name: "O2 fremd", lagerortId: "fz-2", nennfuelldruckBar: 200, aktiv: true, createdAt: jetzt },
  ]).run();
});
afterEach(() => { t.aufraeumen(); vi.clearAllMocks(); });

const leer = { positionen: [], geraete: [], flaschen: [], verfaelle: [] };

describe("checkAbschluss — der Riegel ist die ERSTE Anweisung", () => {
  it("gibt bei abgelaufener Sitzung `{ok:false, grund:'sitzung'}` zurueck — und parst NICHTS", async () => {
    riegel.mockResolvedValue({ ok: false, grund: "sitzung" });
    const r = await checkAbschluss({ fahrzeugId: "GIBT-ES-NICHT", ...leer }, t.db);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.grund).toBe("sitzung");
    expect(!r.ok && r.text).toBe(
      "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
    );
    // Waere der Riegel NACH dem parse, kaeme hier ein Zod-Fehler statt der
    // Sitzungsauskunft — und die Helferin saehe „ungueltige Eingabe", wo ihre
    // Sitzung abgelaufen ist.
  });

  it("gibt bei gesperrtem Token `{ok:false, grund:'gesperrt'}` zurueck und schreibt NICHTS", async () => {
    riegel.mockResolvedValue({ ok: false, grund: "gesperrt" });
    const r = await checkAbschluss({ fahrzeugId: "fz-1", ...leer }, t.db);
    expect(!r.ok && r.grund).toBe("gesperrt");
    expect(t.db.select().from(checks).all().length).toBe(0);
  });
});

describe("checkAbschluss — die vier Wuerfe bleiben Wuerfe (§7.3, Riegelfall)", () => {
  it("fremde Soll-Position", async () => {
    await expect(checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-fremd", ist: 1, nachfuellMenge: 0 }],
    }, t.db)).rejects.toThrow("Soll-Position gehört nicht zu diesem Fahrzeug");
  });

  it("fremdes Geraet", async () => {
    await expect(checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      geraete: [{ geraetId: "g-fremd", vorhanden: true, zustand: "In Ordnung" }],
    }, t.db)).rejects.toThrow("Gerät gehört nicht zu diesem Fahrzeug");
  });

  it("fremde Flasche", async () => {
    await expect(checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      flaschen: [{ flascheId: "o-fremd", druckBar: 180 }],
    }, t.db)).rejects.toThrow("Flasche gehört nicht zu diesem Fahrzeug");
  });

  it("fremder Artikel im Verfall", async () => {
    await expect(checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      verfaelle: [{ artikelId: "art-unbekannt", verfall: "2027-03" }],
    }, t.db)).rejects.toThrow("Artikel gehört nicht zu diesem Fahrzeug");
  });

  it("ein Wurf laesst die Transaktion VOLLSTAENDIG zuruecklaufen", async () => {
    // Ein halb geschriebener Check waere der teuerste Zustand: Bestand
    // verschoben, aber kein Check-Eintrag, der es erklaert.
    await checkAbschluss({
      fahrzeugId: "fz-1",
      positionen: [{ sollPositionId: "sp-1", ist: 0, nachfuellMenge: 5 }],
      geraete: [{ geraetId: "g-fremd", vorhanden: false }],
      flaschen: [], verfaelle: [],
    }, t.db).catch(() => {});
    expect(t.db.select().from(checks).all().length).toBe(0);
    expect(t.db.select().from(buchungen).all().length).toBe(1);   // nur die Seed-Zeile
  });
});

describe("checkAbschluss — Abgleich und Nachfuellen, pro ARTIKEL", () => {
  it("setzt den Fahrzeugbestand auf die Summe der gezaehlten Ist (I4)", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 2, nachfuellMenge: 0 }],
    }, t.db);
    expect(r.ok).toBe(true);
    const amFahrzeug = t.db.select().from(buchungen).all()
      .filter((b) => b.lagerortId === "fz-1")
      .reduce((s, b) => s + b.menge, 0);
    expect(amFahrzeug).toBe(2);
  });

  it("lagert die bestaetigte Menge um und meldet BEIDE Zahlen", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 0, nachfuellMenge: 5 }],
    }, t.db);
    expect(r.ok && r.wert.nachgefuellt).toBe(5);
    expect(r.ok && r.wert.nachfuellBestaetigt).toBe(5);
  });

  it("kappt an der Handlager-Verfuegbarkeit — und sagt es (§7.9.4, NEU)", async () => {
    // `umlagerung` kappt STILL, und der Helfer hat die Teile in der Hand. Ohne
    // die zweite Zahl legt er sie ins Fahrzeug und das Journal weiss es nicht.
    t.db.insert(buchungen).values([
      { id: "b-2", ts: new Date(), typ: "entnahme", artikelId: "art-1", chargeId: "ch-1",
        lagerortId: HANDLAGER_ID, menge: -8, quelleTyp: "system", quelleId: "seed",
        kommentar: null, referenz: null },
    ]).run();   // nur noch 2 im Handlager
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 0, nachfuellMenge: 5 }],
    }, t.db);
    expect(r.ok && r.wert.nachfuellBestaetigt).toBe(5);
    expect(r.ok && r.wert.nachgefuellt).toBe(2);
  });

  it("klemmt die Nachfuellmenge serverseitig auf max(0, Soll − Ist)", async () => {
    // Der Client klemmt schon (`max={luecke}`), aber die Nutzlast ist
    // Nutzereingabe.
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 5, nachfuellMenge: 99 }],
    }, t.db);
    expect(r.ok && r.wert.nachgefuellt).toBe(0);
  });

  it("meldet `offen` = Soll − Ist − nachgefuellt", async () => {
    t.db.insert(buchungen).values([
      { id: "b-3", ts: new Date(), typ: "entnahme", artikelId: "art-1", chargeId: "ch-1",
        lagerortId: HANDLAGER_ID, menge: -9, quelleTyp: "system", quelleId: "seed",
        kommentar: null, referenz: null },
    ]).run();   // nur noch 1 im Handlager
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 1, nachfuellMenge: 4 }],
    }, t.db);
    expect(r.ok && r.wert.offen).toBe(3);   // 5 − 1 − 1
  });

  it("ignoriert Grabstein-Positionen (`entfernt`)", async () => {
    t.db.update(sollPositionen).set({ entfernt: true }).where(eq(sollPositionen.id, "sp-1")).run();
    await expect(checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 1, nachfuellMenge: 0 }],
    }, t.db)).rejects.toThrow("Soll-Position gehört nicht zu diesem Fahrzeug");
  });
});

describe("checkAbschluss — Geraete und Flaschen", () => {
  it("zaehlt fehlende und defekte Geraete als auffaellig", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      geraete: [{ geraetId: "g-1", vorhanden: false }],
    }, t.db);
    expect(r.ok && r.wert.geraeteAuffaellig).toBe(1);
  });

  it("schreibt je Flasche eine append-only Messung", async () => {
    await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, flaschen: [{ flascheId: "o-1", druckBar: 180 }],
    }, t.db);
    const m = t.db.select().from(o2Messungen).all();
    expect(m.length).toBe(1);
    expect(m[0].druckBar).toBe(180);
    expect(m[0].quelleTyp).toBe("token");
    expect(m[0].quelleId).toBe("482-137");   // der CODE, nicht die Token-Kennung
  });

  it("zaehlt eine niedrige Flasche als auffaellig", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, flaschen: [{ flascheId: "o-1", druckBar: 20 }],
    }, t.db);
    expect(r.ok && r.wert.flaschenAuffaellig).toBe(1);
  });

  it("eine Flasche OHNE Nennfuelldruck ist NICHT BEWERTBAR, nicht ‚niedrig' (§5.12, NEU)", async () => {
    // `fuellstandProzent` gibt bei nennfuelldruck <= 0 eine 0 zurueck
    // (o2.ts:9), und `o2Status` macht daraus ampel "rot", niedrig true. Die
    // Flasche erschiene als niedrig, obwohl sie schlicht nicht bewertbar ist —
    // und die Helferin liefe los, um eine VOLLE Flasche zu tauschen.
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, flaschen: [{ flascheId: "o-null", druckBar: 190 }],
    }, t.db);
    expect(r.ok && r.wert.flaschenNichtBewertbar).toBe(1);
    expect(r.ok && r.wert.flaschenAuffaellig).toBe(0);
  });

  it("schreibt die Messung TROTZDEM — sie ist Rohdatum und bleibt richtig", async () => {
    await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, flaschen: [{ flascheId: "o-null", druckBar: 190 }],
    }, t.db);
    expect(t.db.select().from(o2Messungen).all().length).toBe(1);
  });
});

describe("checkAbschluss — Verfall", () => {
  it("setzt einen gemeldeten Verfall und zaehlt NACH dem Schreiben", async () => {
    // „Nach dem Schreiben zaehlen, damit die Rueckmeldung den GANZEN
    // Fahrzeugstand widerspiegelt — nicht nur die in diesem Check angefassten
    // Artikel" (check.ts:158-159).
    const r = await checkAbschluss({
      fahrzeugId: "fz-1",
      positionen: [{ sollPositionId: "sp-1", ist: 5, nachfuellMenge: 0 }],
      geraete: [], flaschen: [],
      verfaelle: [{ artikelId: "art-1", verfall: "2020-01" }],
    }, t.db);
    expect(r.ok && r.wert.verfallAuffaellig).toBe(1);
  });

  it("`null` LOESCHT eine frueher gemeldete Angabe", async () => {
    await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, verfaelle: [{ artikelId: "art-1", verfall: "2027-03" }],
    }, t.db);
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, verfaelle: [{ artikelId: "art-1", verfall: null }],
    }, t.db);
    expect(r.ok && r.wert.verfallAuffaellig).toBe(0);
  });

  it("weist ein Verfallsformat ausserhalb `YYYY-MM` ab", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, verfaelle: [{ artikelId: "art-1", verfall: "März 2027" }],
    }, t.db);
    expect(r.ok).toBe(false);
  });
});

describe("checkAbschluss — der Check-Eintrag", () => {
  it("schreibt genau EINEN Eintrag mit Quelle `token` und dem CODE", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 5, nachfuellMenge: 0 }],
    }, t.db);
    const rows = t.db.select().from(checks).all();
    expect(rows.length).toBe(1);
    expect(rows[0].fahrzeugId).toBe("fz-1");
    expect(rows[0].quelleTyp).toBe("token");
    expect(rows[0].quelleId).toBe("482-137");
    expect(r.ok && r.wert.checkId).toBe(rows[0].id);
  });

  it("das JSON traegt `version: 2` und die fuenf Listen", () => {
    // Der Diskriminator steht ab jetzt IM DATUM. `parseCheckErgebnis` (Teil 3,
    // T37) erkennt Alt-Objekte ohne `version` weiterhin; ein geschriebenes Feld
    // macht die Unterscheidung fuer alles NEUE explizit statt geraten.
  });

  it("das JSON traegt version 2 und alle fuenf Listen — geprueft", async () => {
    await checkAbschluss({
      fahrzeugId: "fz-1",
      positionen: [{ sollPositionId: "sp-1", ist: 5, nachfuellMenge: 0 }],
      geraete: [{ geraetId: "g-1", vorhanden: true, zustand: "In Ordnung" }],
      flaschen: [{ flascheId: "o-1", druckBar: 180 }],
      verfaelle: [{ artikelId: "art-1", verfall: "2027-03" }],
    }, t.db);
    const roh = JSON.parse(t.db.select().from(checks).all()[0].ergebnis!);
    expect(roh.version).toBe(2);
    for (const feld of ["positionen", "artikel", "geraete", "flaschen", "verfall"]) {
      expect(Array.isArray(roh[feld]), `${feld} fehlt`).toBe(true);
    }
    // Feldnamen sind NICHT umbenennbar (§4.10, 1:1-Pflicht 2) — sonst wird jede
    // historische Auswertung stumm 0.
    expect(roh.flaschen[0].nennfuelldruckBar).toBe(200);
    expect(roh.artikel[0].nachfuellGebucht).toBe(0);
  });
});

describe("checkAbschluss — revalidatePath, sechs INNERE Pfade (§7.9.5)", () => {
  it("genau diese sechs, in dieser Form", async () => {
    // Innen hier, aussen dort — und beide Sorten stehen in derselben Datei.
    // Alle 61 Aufrufe des Bestands uebergeben den AEUSSEREN Pfad; alle vier
    // Suite-Module den inneren (Falle 49). Ein falscher Pfad, der nichts tut,
    // wird beim naechsten Caching-Schritt zum stillen Defekt.
    await checkAbschluss({ fahrzeugId: "fz-1", ...leer }, t.db);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/helfer/check",
      "/m/lagerbuch/verwaltung/checks",
      "/m/lagerbuch/verwaltung",
      "/m/lagerbuch/verwaltung/sauerstoff",
      "/m/lagerbuch/verwaltung/verfall",
      "/m/lagerbuch/verwaltung/fahrzeuge",
    ]);
  });

  it("revalidiert NICHT nach einem Riegel-Nein", async () => {
    riegel.mockResolvedValue({ ok: false, grund: "gesperrt" });
    await checkAbschluss({ fahrzeugId: "fz-1", ...leer }, t.db);
    expect(revalidiert).toEqual([]);
  });
});

describe("Bauform", () => {
  it("traegt \"use server\" und exportiert GENAU EINE Action", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/^"use server";/m);
    expect([...q.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]))
      .toEqual(["checkAbschluss"]);
  });

  it("wertet den Riegel-Rueckgabewert AUS — die Zeile, die kein Gate findet", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/const riegel = await requireHelferSchreibend\(db\);/);
    expect(q).toMatch(/if \(!riegel\.ok\)\s*return/);
  });

  it("ruft `requireLagerbuchHost` NICHT — der Riegel ruft ihn intern", () => {
    // Ein zweiter Aufruf waere nicht falsch, aber er luede die naechste Action
    // dazu ein, sich AUF den doppelten Aufruf zu verlassen statt auf den
    // inneren — und dann faellt die Zusage „durch Konstruktion" (Teil 1, T10).
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/requireLagerbuchHost/);
  });

  it("traegt den Ansatzpunkt-Kommentar fuer `scope_lagerort_id` (offene Frage 5)", () => {
    expect(readFileSync(QUELLE, "utf8")).toMatch(/scope_lagerort_id/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/check.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./check"`.

- [ ] **Schritt 3: `_actions/check.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "../_db/client";
import {
  checks, sollPositionen, geraete, o2Flaschen, o2Messungen, newId,
} from "../_db/schema";
import { requireHelferSchreibend } from "../_lib/helferZugang";
import { HANDLAGER_ID, MONAT_REGEX, ZUSTAENDE, ZUSTAND_DEFEKT } from "../_lib/konstanten";
import { korrekturAufLagerort } from "../_lib/schreibpfade/korrektur";
import { umlagerung } from "../_lib/schreibpfade/umlagerung";
import { setzeVerfall } from "../_lib/schreibpfade/lagerortVerfall";
import { verfallFuerLagerort } from "../_lib/lesepfade/verfall";
import { o2Status } from "../_lib/domain/o2";
import { RIEGEL_TEXTE, type HelferErgebnis } from "../_lib/actionTypen";

/**
 * DER FAHRZEUG-CHECK-ABSCHLUSS — §5.8, §7.9.4. EINE Transaktion.
 *
 * WICHTIG: Der Fahrzeugbestand ist pro (Artikel, Lagerort) — NICHT pro
 * Fach/Soll-Position. Liegt derselbe Artikel in mehreren Faechern, teilen sich
 * diese Positionen EINEN Fahrzeug-Bestand (§5.7.1). Deshalb wird pro ARTIKEL
 * (nicht pro Position) genau einmal:
 *   1. ABGLEICH   — Fahrzeugbestand des Artikels auf die Summe der gezaehlten Ist.
 *   2. NACHFUELLEN — die Summe der bestaetigten Mengen aus dem Handlager umgelagert.
 */

const CheckSchema = z.object({
  fahrzeugId: z.string().min(1),
  // Kann leer sein (Fahrzeug ohne Soll-Artikel, aber mit Geraeten). Der Flow
  // verhindert komplett leere Checks; serverseitig ist ein leerer
  // Positions-Check harmlos (bucht nichts).
  positionen: z.array(z.object({
    sollPositionId: z.string().min(1),
    ist: z.coerce.number().int().min(0),
    // Vom Helfer im Nachfuell-Schritt bestaetigte Menge. Serverseitig pro
    // Position auf max(0, Soll − Ist) geklemmt und ueber `umlagerung()` an der
    // Handlager-Verfuegbarkeit gekappt.
    nachfuellMenge: z.coerce.number().int().min(0),
  })).default([]),
  geraete: z.array(z.object({
    geraetId: z.string().min(1),
    vorhanden: z.boolean(),
    zustand: z.enum(ZUSTAENDE).optional(),
    bemerkung: z.string().trim().optional(),
  })).default([]),
  flaschen: z.array(z.object({
    flascheId: z.string().min(1),
    druckBar: z.coerce.number().int().min(0),
  })).default([]),
  // Im Fahrzeug abgelesener Verfall je Artikel („YYYY-MM", fruehestes Datum im
  // Fahrzeug). Durchgehend optional: null/"" loescht eine fruehere Angabe, ein
  // FEHLENDER Eintrag laesst sie unangetastet.
  verfaelle: z.array(z.object({
    artikelId: z.string().min(1),
    verfall: z.union([z.string().regex(MONAT_REGEX), z.literal("")])
      .nullable().transform((v) => v || null),
  })).default([]),
});

export type CheckAbschlussWert = {
  checkId: string;
  nachgefuellt: number;
  nachfuellBestaetigt: number;
  offen: number;
  geraeteAuffaellig: number;
  flaschenAuffaellig: number;
  flaschenNichtBewertbar: number;
  verfallAuffaellig: number;
};

export async function checkAbschluss(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<HelferErgebnis<CheckAbschlussWert>> {
  // ERSTE Anweisung, und der Rueckgabewert MUSS ausgewertet werden. Bis zur
  // Portierung warf dieser Riegel (session.ts:25,28) — ein Wurf liess sich nicht
  // uebersehen. Ein Rueckgabewert schon: `await requireHelferSchreibend(db)` ohne
  // Pruefung ist typkorrekt, lint-sauber und oeffnet diese Action fuer jeden. Das
  // einzige Netz dagegen ist der E2E „gesperrter Token wird an der Buchung
  // abgewiesen" (§3.8.3, §7.12.4) — und der liegt in Teil 6, T171.
  //
  // ⚠️ `requireLagerbuchHost` wird hier NICHT gerufen: `requireHelferSchreibend`
  // ruft ihn INTERN als erste Anweisung (Teil 1, T10). Genau deshalb ist die
  // Zusage „jede Helfer-Action ist host-gebunden" durch KONSTRUKTION wahr und
  // nicht durch eine Liste, die die naechste Action vergisst.
  const riegel = await requireHelferSchreibend(db);
  if (!riegel.ok) return { ok: false, grund: riegel.grund, text: RIEGEL_TEXTE[riegel.grund] };

  // ⚠️ ANSATZPUNKT 2 VON 2 fuer eine spaetere Durchsetzung von
  // `tokens.scope_lagerort_id` als RIEGEL (offene Betreiberfrage 5, §7.9.1).
  // Hier stuende:
  //     if (scope && scope !== v.fahrzeugId) return { ok:false, grund:"gesperrt", … };
  // Heute ist die Spalte Dekoration; ein Fahrzeug-Code kann jedes Fahrzeug
  // checken (Falle 14). Ansatzpunkt 1 ist die `gewaehlt`-Zeile in
  // `helfer/check/page.tsx`. MEHR BRAUCHT ES DANN NICHT.

  const geparst = CheckSchema.safeParse(eingabe);
  if (!geparst.success) {
    // Eine ungueltige Nutzlast ist erwartbar (altes Fenster, halb geladene
    // Seite) und deshalb ein RUECKGABEWERT, kein Wurf (§7.3, Falle 66).
    return {
      ok: false,
      grund: "netz",
      text: "Die Eingabe war unvollständig. Bitte die Seite neu laden und erneut abschließen.",
    };
  }
  const v = geparst.data;

  const code = riegel.zugang.code;   // der CODE, nicht die Token-Kennung: das
                                     // Journal zeigt ihn als Klarnamen (_db/quelle.ts)
  const checkId = newId();
  let nachgefuellt = 0;              // TATSAECHLICH umgelagert, nach Handlager-Kappung
  let nachfuellBestaetigt = 0;       // was der Helfer bestaetigt hat (§7.9.4, NEU)
  let offen = 0;
  let geraeteAuffaellig = 0;
  let flaschenAuffaellig = 0;
  let flaschenNichtBewertbar = 0;
  let verfallAuffaellig = 0;

  db.transaction((tx) => {
    // Grabsteine (`entfernt`) sind kein Soll → aus der gueltigen Positionsmenge
    // ausschliessen.
    const sollRows = tx.select().from(sollPositionen)
      .where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all()
      .filter((s) => !s.entfernt);
    const byId = new Map(sollRows.map((s) => [s.id, s]));
    const quelle = { quelleTyp: "token" as const, quelleId: code };
    const referenz = `check:${checkId}`;

    type Gruppe = {
      artikelId: string; positionen: string[];
      sollSumme: number; istSumme: number; nachfuellGewuenscht: number;
    };
    const gruppen = new Map<string, Gruppe>();
    const posErgebnis: { sollPositionId: string; artikelId: string; soll: number; ist: number }[] = [];

    for (const p of v.positionen) {
      const row = byId.get(p.sollPositionId);
      // WURF 1 von 4 (§7.3, Riegelfall — nicht „erwartbar", sondern
      // „manipuliert"). Kein Helfer erreicht das ueber die Oberflaeche: die
      // Nutzlast entsteht aus Daten, die derselbe Server gerade geliefert hat.
      if (!row) throw new Error("Soll-Position gehört nicht zu diesem Fahrzeug");
      const nachfuellWunsch = Math.min(p.nachfuellMenge, Math.max(0, row.soll - p.ist));
      const g = gruppen.get(row.artikelId) ?? {
        artikelId: row.artikelId, positionen: [], sollSumme: 0, istSumme: 0, nachfuellGewuenscht: 0,
      };
      g.positionen.push(row.id);
      g.sollSumme += row.soll;
      g.istSumme += p.ist;
      g.nachfuellGewuenscht += nachfuellWunsch;
      gruppen.set(row.artikelId, g);
      posErgebnis.push({ sollPositionId: row.id, artikelId: row.artikelId, soll: row.soll, ist: p.ist });
    }

    const artikelErgebnis = [...gruppen.values()].map((g) => {
      // I4: nach `korrekturAufLagerort(…, istMenge)` gilt
      // `bestandProLagerort(…, fahrzeugId) === istMenge`.
      const { diff: korrektur } = korrekturAufLagerort(tx, {
        artikelId: g.artikelId, lagerortId: v.fahrzeugId, istMenge: g.istSumme,
        quelle, kommentar: "Fahrzeug-Check Abgleich", referenz,
      });
      const recordedVorher = g.istSumme - korrektur;
      const nachfuellGebucht = g.nachfuellGewuenscht > 0
        ? umlagerung(tx, {
            artikelId: g.artikelId, menge: g.nachfuellGewuenscht,
            vonLagerortId: HANDLAGER_ID, nachLagerortId: v.fahrzeugId,
            quelle, kommentar: "Fahrzeug-Check Nachfüllung", referenz,
          }).umgelagert
        : 0;
      nachgefuellt += nachfuellGebucht;
      nachfuellBestaetigt += g.nachfuellGewuenscht;
      offen += Math.max(0, g.sollSumme - g.istSumme - nachfuellGebucht);
      return {
        artikelId: g.artikelId, positionen: g.positionen.length,
        sollSumme: g.sollSumme, istSumme: g.istSumme, recordedVorher, korrektur,
        nachfuellGewuenscht: g.nachfuellGewuenscht, nachfuellGebucht,
      };
    });

    // Geraete am Fahrzeug (standort-basiert): nur eingereichte Geraete
    // akzeptieren, die wirklich HIER stehen. Zustand und Bemerkung als Snapshot.
    const geraeteHier = new Set(
      tx.select({ id: geraete.id }).from(geraete)
        .where(eq(geraete.lagerortId, v.fahrzeugId)).all().map((g) => g.id),
    );
    const geraeteErgebnis = v.geraete.map((e) => {
      if (!geraeteHier.has(e.geraetId)) throw new Error("Gerät gehört nicht zu diesem Fahrzeug");   // WURF 2
      if (!e.vorhanden || e.zustand === ZUSTAND_DEFEKT) geraeteAuffaellig++;
      return {
        geraetId: e.geraetId, vorhanden: e.vorhanden,
        zustand: e.zustand ?? null, bemerkung: e.bemerkung ?? null,
      };
    });

    const flaschenHier = new Map(
      tx.select().from(o2Flaschen).where(eq(o2Flaschen.lagerortId, v.fahrzeugId)).all()
        .map((f) => [f.id, f]),
    );
    const flaschenErgebnis = v.flaschen.map((e) => {
      const f = flaschenHier.get(e.flascheId);
      if (!f) throw new Error("Flasche gehört nicht zu diesem Fahrzeug");   // WURF 3
      tx.insert(o2Messungen).values({
        id: newId(), flascheId: e.flascheId, ts: new Date(), druckBar: e.druckBar,
        quelleTyp: "token", quelleId: code, kommentar: `Fahrzeug-Check ${referenz}`,
      }).run();

      // §5.12, §7.9.4 (NEU): eine Flasche OHNE bekannten Nennfuelldruck ist
      // NICHT BEWERTBAR, nicht „niedrig". `fuellstandProzent` gibt bei
      // `nennfuelldruckBar <= 0` eine 0 zurueck (o2.ts:9), und `o2Status` macht
      // daraus ampel "rot" mit `niedrig: true` — die Flasche erschiene als
      // niedrig, obwohl sie schlicht nicht bewertbar ist, UND DIE HELFERIN
      // LIEFE LOS, UM EINE VOLLE FLASCHE ZU TAUSCHEN.
      //
      // Die MESSUNG wird trotzdem geschrieben: sie ist Rohdatum und bleibt
      // richtig, auch wenn die Bewertung fehlt.
      if (f.nennfuelldruckBar <= 0) flaschenNichtBewertbar++;
      else if (o2Status(e.druckBar, f.nennfuelldruckBar).niedrig) flaschenAuffaellig++;

      // Nennfuelldruck als Snapshot mitschreiben, damit der Fuellstand spaeter
      // auch dann rekonstruierbar ist, wenn die Flasche umkonfiguriert oder
      // geloescht wird.
      return { flascheId: e.flascheId, druckBar: e.druckBar, nennfuelldruckBar: f.nennfuelldruckBar };
    });

    const sollArtikel = new Set(sollRows.map((s) => s.artikelId));
    for (const e of v.verfaelle) {
      if (!sollArtikel.has(e.artikelId)) throw new Error("Artikel gehört nicht zu diesem Fahrzeug");   // WURF 4
      setzeVerfall(tx, {
        lagerortId: v.fahrzeugId, artikelId: e.artikelId, verfall: e.verfall, quelle,
      });
    }

    // NACH dem Schreiben zaehlen, damit die Rueckmeldung den GANZEN
    // Fahrzeugstand widerspiegelt — nicht nur die in diesem Check angefassten
    // Artikel (1:1 aus check.ts:158-159).
    const verfallErgebnis = [...verfallFuerLagerort(tx, v.fahrzeugId).values()].map((e) => ({
      artikelId: e.artikelId, verfall: e.verfall, ampel: e.ampel, abgelaufen: e.abgelaufen,
    }));
    verfallAuffaellig = verfallErgebnis.filter((e) => e.ampel !== "gruen").length;

    tx.insert(checks).values({
      id: checkId, fahrzeugId: v.fahrzeugId, quelleTyp: "token", quelleId: code,
      startedAt: new Date(), completedAt: new Date(),
      // ⚠️ `version: 2` wird ab jetzt AUSGESCHRIEBEN. Der Bestand schreibt das
      // Objekt ohne Diskriminator; `parseCheckErgebnis` (Teil 3, T37) erkennt
      // Alt-Objekte weiterhin an der Form. Ein geschriebenes Feld macht die
      // Unterscheidung fuer alles NEUE explizit statt geraten.
      //
      // ⚠️ DIE FELDNAMEN SIND NICHT UMBENENNBAR (§4.10, 1:1-Pflicht 2) — sonst
      // wird jede historische Auswertung stumm 0.
      ergebnis: JSON.stringify({
        version: 2,
        positionen: posErgebnis,
        artikel: artikelErgebnis,
        geraete: geraeteErgebnis,
        flaschen: flaschenErgebnis,
        verfall: verfallErgebnis,
      }),
    }).run();
  });

  // INNERER Pfad (/m/lagerbuch/…). Gegenrichtung zu allem, was der Client
  // schreibt und was in ein `Location` geht — das sind AEUSSERE Pfade (§7.2.5).
  revalidatePath("/m/lagerbuch/helfer/check");
  revalidatePath("/m/lagerbuch/verwaltung/checks");
  revalidatePath("/m/lagerbuch/verwaltung");
  revalidatePath("/m/lagerbuch/verwaltung/sauerstoff");
  revalidatePath("/m/lagerbuch/verwaltung/verfall");
  revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");

  return {
    ok: true,
    wert: {
      checkId, nachgefuellt, nachfuellBestaetigt, offen,
      geraeteAuffaellig, flaschenAuffaellig, flaschenNichtBewertbar, verfallAuffaellig,
    },
  };
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/check.test.ts
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
git add src/app/m/lagerbuch/_actions/check.ts src/app/m/lagerbuch/_actions/check.test.ts
git commit -m "feat(lagerbuch): _actions/check.ts — eine Transaktion, vier Wuerfe, sechs innere Pfade

requireHelferSchreibend als ERSTE Anweisung, vor jedem parse, und der
Rueckgabewert wird ausgewertet. Bis zur Portierung warf dieser Riegel — ein
Wurf liess sich nicht uebersehen. Ein Rueckgabewert schon: der Aufruf ohne
Pruefung ist typkorrekt, lint-sauber und oeffnet die Action fuer jeden.
requireLagerbuchHost wird NICHT zusaetzlich gerufen: der Riegel ruft ihn
intern, und genau deshalb ist 'jede Helfer-Action ist host-gebunden' durch
Konstruktion wahr.

Die vier Zugehoerigkeitspruefungen bleiben WUERFE (§7.3, Riegelfall): kein
Helfer erreicht sie ueber die Oberflaeche, die Nutzlast entsteht aus Daten, die
derselbe Server gerade geliefert hat.

Zwei Ergaenzungen (§7.9.4): nachfuellBestaetigt neben nachgefuellt — umlagerung
kappt STILL an der Verfuegbarkeit, und der Helfer hat die Teile in der Hand;
ohne die zweite Zahl legt er sie ins Fahrzeug und das Journal weiss es nicht.
Und flaschenNichtBewertbar: bei nennfuelldruck <= 0 gibt fuellstandProzent 0
zurueck und o2Status macht ampel 'rot' mit niedrig=true — die Flasche erschiene
als niedrig, und die Helferin liefe los, um eine VOLLE Flasche zu tauschen.

Sechs revalidatePath mit INNEREM Pfad. Alle 61 Aufrufe des Bestands uebergeben
den aeusseren; ein falscher Pfad, der nichts tut, wird beim naechsten
Caching-Schritt zum stillen Defekt."
```

---

**Gate Stufe 4.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 5 — Die drei Inseln an den Actions (3 Tasks, alle parallel)

---

### Task 76: `_ui/HelferRahmen.tsx` — drei Pflicht-Props, und kein `usePathname`

**Files:**
- Create: `src/app/m/lagerbuch/_ui/HelferRahmen.tsx`
- Test: `src/app/m/lagerbuch/_ui/HelferRahmen.test.tsx`

**Interfaces:**
- Consumes: `_ui/Restzeit.tsx` (T67) — `Restzeit`; `_actions/sitzung.ts` (T74) — `beenden`;
  `_lib/zeit.ts` (Teil 1, T3) — `uhrzeit(d: Date): string`; `_ui/helfer.module.css` (T64).
- Produces:
  ```tsx
  // _ui/HelferRahmen.tsx — KEIN "use client": eine Server Component
  export function HelferRahmen(props: {
    aktiv: "entnahme" | "check";     // PFLICHT — KEIN usePathname, KEIN startsWith
    sitzungsetikett: string;         // PFLICHT
    laeuftAb: Date;                  // PFLICHT, NICHT optional (§3.4.3 Punkt 1)
    children: React.ReactNode;
  }): JSX.Element;
  ```
  **Drei Konsumenten:** `helfer/page.tsx` (`aktiv="entnahme"`, T84), `helfer/check/page.tsx`
  (`aktiv="check"`, T85), `a/[artikelId]/page.tsx` (`aktiv="entnahme"`, T83).
- ⚠️ **Zusicherungen für Teil 6, T171** (§7.8.2 Punkt 5, E11): das `<nav>` trägt
  `data-testid="lb-tableiste"` und `aria-label="Helfer-Bereiche"`; **genau ein** `<a>` darin trägt
  `aria-current="page"`, und zwar der aus der Prop.

**Warum die drei Angaben PFLICHT-Props sind und keine Optionals** (§7.8.2). Der Rahmen wandert aus dem
Layout in die drei Seiten, die ihn brauchen — **ein Layout kann einer Seite keine Props reichen.**
`helfer/page.tsx` und `helfer/check/page.tsx` rufen `requireHelferSitzung(getDb())` deshalb **selbst
noch einmal**; der zweite Aufruf ist billig (dasselbe gecachte Handle, derselbe
Primärschlüssel-Lookup auf `tokens.id`). `a/[artikelId]/page.tsx` hat den Wert ohnehin aus seiner
eigenen Weiche, und **sein Admin-Zweig rendert gar nicht, sondern leitet um** — nur deshalb dürfen
beide Angaben Pflicht sein.

**Falle 63, ausgeschrieben.** `HelferFrame.tsx:8-9` steuert die zwei Tabs mit
`pathname.startsWith("/helfer/check")`. Die Suite hat gemessen, dass `usePathname()` den **äußeren**
Pfad liefert (`core/shell/SuiteNav.tsx:88-95`) — auf dem regulären Weg funktioniert das also weiter.
**Was bricht, ist der zweite Weg:** `core/routing.ts:54-67` behandelt bereits präfixierte Pfade eigens
und schließt `/m/*` bewusst **nicht** aus dem Matcher aus. `/m/lagerbuch/helfer/check` rendert also —
und dort beginnt der Pfad nicht mit `/helfer/check`, und die Tab-Leiste markierte dauerhaft
„Entnahme", **auch im Fahrzeug-Check.**

⚠️ **Und die Messung hat zwei Ränder:** sie steht gegen Next 16.2.6 (`SuiteNav.tsx:92`), die Suite
fährt 16.2.11; und sie entstand per `curl` gegen den Dev-Server auf Wildcard-DNS, ohne Reverse-Proxy.
**Der Befund ist weder widerlegt noch nachgemessen** — der Server-Prop macht die Frage gegenstandslos.

**Die `href` sind ÄUSSERE Pfade und bleiben es.** Innere (`/m/lagerbuch/helfer/check`) wären die
naheliegende und falsche Vereinheitlichung mit Falle 49 — sie würden auf dem äußeren Host **doppelt**
präfixiert.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/HelferRahmen.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";

vi.mock("../_actions/sitzung", () => ({ beenden: async () => {} }));

import { HelferRahmen } from "./HelferRahmen";

const QUELLE = "src/app/m/lagerbuch/_ui/HelferRahmen.tsx";
const LAEUFT_AB = new Date("2026-08-04T17:00:00.000Z");

afterEach(async () => { await unmount(); });

describe("HelferRahmen — die Aktivmarkierung kommt als PROP (Falle 63)", () => {
  it("`aktiv=\"entnahme\"` setzt `aria-current=\"page\"` GENAU EINMAL, am Entnahme-Tab", async () => {
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="Token 482-137 · RTW 1" laeuftAb={LAEUFT_AB}>
        <p>Inhalt</p>
      </HelferRahmen>,
    );
    const aktive = queryAll("[data-testid='lb-tableiste'] a[aria-current='page']");
    expect(aktive.length).toBe(1);
    expect(aktive[0].textContent).toContain("Entnahme");
  });

  it("`aktiv=\"check\"` setzt sie am Fahrzeug-Check-Tab", async () => {
    await mount(
      <HelferRahmen aktiv="check" sitzungsetikett="X" laeuftAb={LAEUFT_AB}>
        <p>Inhalt</p>
      </HelferRahmen>,
    );
    const aktive = queryAll("[data-testid='lb-tableiste'] a[aria-current='page']");
    expect(aktive.length).toBe(1);
    expect(aktive[0].textContent).toContain("Fahrzeug-Check");
  });

  it("die beiden `href` sind AEUSSERE Pfade", async () => {
    // Innere (/m/lagerbuch/helfer/check) waeren die naheliegende und falsche
    // Vereinheitlichung mit Falle 49 — sie wuerden auf dem aeusseren Host
    // DOPPELT praefixiert.
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="X" laeuftAb={LAEUFT_AB}><p /></HelferRahmen>,
    );
    const links = queryAll<HTMLAnchorElement>("[data-testid='lb-tableiste'] a");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/helfer", "/helfer/check"]);
  });

  it("die CSS-Klasse folgt aus `aria-current`, nicht umgekehrt (§7.8.2 Punkt 4)", () => {
    // Damit prueft der E2E dieselbe Sache, die die Bildschirmleserin hoert.
    const css = readFileSync("src/app/m/lagerbuch/_ui/helfer.module.css", "utf8");
    expect(css).toMatch(/\.tab\[aria-current="page"\]/);
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/className=\{[^}]*aktiv ===/);
  });
});

describe("HelferRahmen — der Kopf", () => {
  it("zeigt das Sitzungsetikett", async () => {
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="Token 482-137 · RTW 1" laeuftAb={LAEUFT_AB}>
        <p />
      </HelferRahmen>,
    );
    expect(query("header").textContent).toContain("Token 482-137 · RTW 1");
  });

  it("rendert die Restzeit-Insel mit der SERVER-Uhrzeit", async () => {
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="X" laeuftAb={LAEUFT_AB}><p /></HelferRahmen>,
    );
    // `uhrzeit()` aus `_lib/zeit.ts` rechnet in Europe/Berlin: 17:00 UTC → 19:00.
    expect(query("[data-rolle='restzeit']").textContent).toContain("19:00");
  });

  it("rendert den Beenden-Knopf als FORMULAR, nicht als Link", async () => {
    // Ein Link waere vorlade- und prefetch-faehig. Ein Prefetch, der die
    // Sitzung beendet, ist genau die Sorte Fehler, die niemand reproduziert.
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="X" laeuftAb={LAEUFT_AB}><p /></HelferRahmen>,
    );
    expect(exists("header form button[type='submit']")).toBe(true);
    expect(query("header form button").textContent).toContain("Beenden");
  });

  it("rendert die Kinder im `<main>`", async () => {
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="X" laeuftAb={LAEUFT_AB}>
        <p data-rolle="kind">Inhalt</p>
      </HelferRahmen>,
    );
    expect(query("main [data-rolle='kind']").textContent).toBe("Inhalt");
  });
});

describe("HelferRahmen — Bauform", () => {
  it("ist eine Server Component — die einzige Insel darin ist `Restzeit`", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/"use client"/);
    expect(q).toMatch(/from "\.\/Restzeit"/);
  });

  it("benutzt KEIN `usePathname` und KEIN `startsWith`", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/usePathname|startsWith/);
  });

  it("baut die Uhrzeit NICHT selbst — sie kommt aus `_lib/zeit.ts`", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/from "\.\.\/_lib\/zeit"/);
    expect(q).not.toMatch(/toLocaleTimeString|\bIntl\b/);
  });

  it("traegt die zwei Merkmale, auf die Teil 6, T171 zusichert", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toContain('data-testid="lb-tableiste"');
    expect(q).toContain('aria-label="Helfer-Bereiche"');
  });

  it("importiert kein antd, kein lucide", () => {
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/HelferRahmen.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./HelferRahmen"`.

- [ ] **Schritt 3: `_ui/HelferRahmen.tsx` schreiben**

```tsx
import Link from "next/link";
import { uhrzeit } from "../_lib/zeit";
import { beenden } from "../_actions/sitzung";
import { Restzeit } from "./Restzeit";
import s from "./helfer.module.css";

/**
 * DER RAHMEN DES HELFER-ZWEIGS — §7.8.2.
 *
 * KEIN "use client": eine Server Component. Die einzige Insel darin ist
 * `_ui/Restzeit.tsx` (T67).
 *
 * ⚠️ DIE AKTIVMARKIERUNG IST EIN PROP (Falle 63). `HelferFrame.tsx:8-9`
 * steuert die zwei Tabs heute mit `pathname.startsWith("/helfer/check")`. Die
 * Suite hat gemessen, dass `usePathname()` den AEUSSEREN Pfad liefert
 * (`core/shell/SuiteNav.tsx:88-95`) — auf dem regulaeren Weg funktioniert das
 * also weiter. WAS BRICHT, IST DER ZWEITE WEG: `core/routing.ts:54-67`
 * behandelt bereits praefixierte Pfade eigens und schliesst `/m/*` bewusst
 * NICHT aus dem Matcher aus. `/m/lagerbuch/helfer/check` rendert also, und dort
 * beginnt der Pfad nicht mit `/helfer/check` — die Tab-Leiste markierte
 * dauerhaft „Entnahme", AUCH IM FAHRZEUG-CHECK.
 *
 * Und die Messung hat zwei Raender: sie steht gegen Next 16.2.6, die Suite
 * faehrt 16.2.11; und sie entstand per `curl` gegen den Dev-Server auf
 * Wildcard-DNS, ohne Reverse-Proxy. DER SERVER-PROP MACHT DIE FRAGE
 * GEGENSTANDSLOS — der Server kennt das Segment ohnehin.
 *
 * ⚠️ DIE DREI ANGABEN SIND PFLICHT-PROPS, KEINE OPTIONALS. Ein Layout kann
 * einer Seite keine Props reichen; deshalb wandert der Rahmen aus dem Layout in
 * die drei Seiten, die ihn brauchen, und die beiden Helfer-Seiten rufen
 * `requireHelferSitzung(getDb())` selbst noch einmal (§7.4.3 — dasselbe
 * gecachte Handle, derselbe Primaerschluessel-Lookup). `a/[artikelId]/page.tsx`
 * hat den Wert aus seiner eigenen Weiche, und SEIN ADMIN-ZWEIG RENDERT GAR
 * NICHT, sondern leitet um — nur deshalb duerfen beide Angaben Pflicht sein.
 *
 * ⚠️ DIE `href` SIND AEUSSERE PFADE und bleiben es. Innere
 * (`/m/lagerbuch/helfer/check`) waeren die naheliegende und falsche
 * Vereinheitlichung mit Falle 49 — sie wuerden auf dem aeusseren Host doppelt
 * praefixiert.
 */
export function HelferRahmen({
  aktiv,
  sitzungsetikett,
  laeuftAb,
  children,
}: {
  aktiv: "entnahme" | "check";
  sitzungsetikett: string;
  laeuftAb: Date;
  children: React.ReactNode;
}) {
  return (
    <div className={s.rahmen}>
      <div className={s.streifen} data-rolle="lb-streifen" />

      <header className={s.kopf}>
        <div>
          <div className={s.marke}>
            LAGER<span className={s.markeAkzent}>BUCH</span>
          </div>
          <div className={s.etikett}>{sitzungsetikett}</div>
          {/*
            DIE EINE AUFRUFFORM. Uhrzeit und Schwelle rechnet der SERVER, die
            Insel zeigt und aktualisiert nur (§3.4.3 Punkt 1). `uhrzeit()` ist
            zonenexplizit (§4.5); `laeuftAb.getTime() - Date.now()` ist reine
            ms-Arithmetik und damit zonenunabhaengig (§5.16).
          */}
          <Restzeit
            uhrzeit={uhrzeit(laeuftAb)}
            laeuftAb={laeuftAb}
            warntInitial={laeuftAb.getTime() - Date.now() <= 30 * 60_000}
          />
        </div>

        {/*
          FORMULAR, KEIN LINK. `beenden` ist eine Server Action (T74) — ein Link
          auf einen GET-Handler waere vorlade- und prefetch-faehig, und ein
          Prefetch, der die Sitzung beendet, ist genau die Sorte Fehler, die
          niemand reproduziert. Der Sperr- und der Ablauffall gehen ueber
          `/abmelden` (Teil 2, T26), weil ein LAYOUT kein Cookie raeumen kann.
        */}
        <form action={beenden}>
          <button className={s.beenden} type="submit">
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" />
            </svg>
            Beenden
          </button>
        </form>
      </header>

      <main className={s.inhalt}>{children}</main>

      {/*
        `data-testid` und `aria-label` sind ZUSICHERUNGEN an Teil 6, T171
        (§7.8.2 Punkt 5). Wer sie umbenennt, macht die einzige Pruefung fuer
        Falle 63 stumm.
      */}
      <nav className={s.tableiste} aria-label="Helfer-Bereiche" data-testid="lb-tableiste">
        <Link
          href="/helfer"
          className={s.tab}
          aria-current={aktiv === "entnahme" ? "page" : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <span>Entnahme</span>
        </Link>
        <Link
          href="/helfer/check"
          className={s.tab}
          aria-current={aktiv === "check" ? "page" : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 5h6M5 8h14v12H5zM9 13l2 2 4-4" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Fahrzeug-Check</span>
        </Link>
      </nav>
    </div>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/HelferRahmen.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_ui/HelferRahmen.tsx src/app/m/lagerbuch/_ui/HelferRahmen.test.tsx
git commit -m "feat(lagerbuch): _ui/HelferRahmen.tsx — Aktivmarkierung als Server-Prop (Falle 63)

usePathname liefert den AEUSSEREN Pfad — auf dem regulaeren Weg funktioniert
HelferFrame also weiter. Was bricht, ist der zweite Weg: core/routing.ts
schliesst /m/* bewusst nicht aus dem Matcher aus, /m/lagerbuch/helfer/check
rendert, und dort beginnt der Pfad nicht mit /helfer/check — die Tab-Leiste
markierte dauerhaft 'Entnahme', auch im Fahrzeug-Check. Die Messung dazu steht
gegen Next 16.2.6 und entstand ohne Reverse-Proxy; der Server-Prop macht die
Frage gegenstandslos.

Drei PFLICHT-Props, keine Optionals: ein Layout kann einer Seite keine Props
reichen, also wandert der Rahmen in die drei Seiten. Die beiden Helfer-Seiten
rufen requireHelferSitzung selbst noch einmal (dasselbe gecachte Handle);
a/[artikelId] hat den Wert aus seiner Weiche, und sein Admin-Zweig rendert gar
nicht, sondern leitet um.

aria-current ist die Zusage, die CSS-Klasse folgt daraus — damit prueft der E2E
dieselbe Sache, die die Bildschirmleserin hoert. data-testid='lb-tableiste' und
aria-label='Helfer-Bereiche' sind Zusicherungen an Teil 6, T171.

Beenden ist ein FORMULAR, kein Link: ein Prefetch, der die Sitzung beendet, ist
die Sorte Fehler, die niemand reproduziert."
```

---

### Task 77: `_ui/Gate.tsx` — die fertige Meldung, nicht der Rohparameter

**Files:**
- Create: `src/app/m/lagerbuch/_ui/Gate.tsx`
- Test: `src/app/m/lagerbuch/_ui/Gate.test.tsx`

**Interfaces:**
- Consumes: `_actions/gate.ts` (T73) — `einloesenAmGate`, `type GateZustand`;
  `_lib/marke.ts` (Teil 3, T33) — `LAGERBUCH_MARKE`, `LAGERBUCH_ORGANISATION`, `LAGERBUCH_ZEILE`;
  `_ui/helfer.module.css` (T64). **Kein `next-auth/react`** — siehe unten.
- Produces:
  ```tsx
  // _ui/Gate.tsx — "use client" (wegen useActionState)
  export function Gate(props: {
    meldung: string | null;      // FERTIG, nicht der Rohparameter
    returnTo: string;            // bereits serverseitig sanitiert
    verwaltungsLink: string;     // FERTIGES `/login?callbackUrl=…`, serverseitig gebaut
  }): JSX.Element;
  ```
  **Einziger Konsument:** `page.tsx` (T81).

⚠️ **Die Verwaltungskarte ruft NICHT `signIn()`. Sie ist ein Link auf das Suite-`/login`.** §3.6.6
entscheidet das ausdrücklich (Entscheidung 15 a): „Das Gate auf `/` bleibt der sichtbare Einstieg für
beide Wege; **der Verwaltungs-Knopf führt auf das Suite-`/login`.**" Drei Gründe, jeder für sich
ausreichend:

1. **`signIn("oidc", …)` ist im Bestand richtig und in der Suite falsch.** Die Suite kennt den
   Anbieter unter der Kennung **`"pocket-id"`** (`core/auth/pocketId.ts:28`,
   `POCKET_ID_PROVIDER_ID`), und der Anbieter existiert nur, wenn **`POCKET_ID_ISSUER`** gesetzt ist
   (`core/auth/config.ts:76`) — **nicht** `AUTH_ISSUER`. Ein aus dem Bestand übernommenes
   `signIn("oidc")` liefe ins Leere, und **der Fehler wäre still**: Auth.js meldet einen unbekannten
   Anbieter erst zur Laufzeit, `pnpm build` bleibt grün.
2. **Das Suite-`/login` steht auf dem Modul-Host bereits zur Verfügung.** `core/routing.ts:12` führt
   `/login` in `PASSTHROUGH` — der Pfad wird auf **keinem** Host in ein Modul umgeschrieben. Ein
   `<a href="/login?callbackUrl=…">` funktioniert damit ohne jede Sonderbehandlung.
3. **Es hält den Dev-Login außerhalb des Moduls.** Die Suite-Anmeldeseite bietet ihn selbst, wenn
   `AUTH_DEV_LOGIN` gesetzt ist (`core/auth/devLogin.ts:14`). Das Modul braucht dafür **keinen
   zweiten Knopf** — und bekommt damit auch keinen zweiten Pfad in dieselbe Sitzung, der in
   Produktion nur durch eine Bedingung stillgelegt ist.

⚠️ **Damit entfällt auch `oidcAktiv`.** Ein „ist OIDC konfiguriert?"-Prädikat im Modul wäre eine
**zweite** Antwort auf eine Frage, die die Anmeldeseite selbst beantwortet — und sie beantwortete sie
schlechter: bei gesetztem `AUTH_DEV_LOGIN` und fehlendem `POCKET_ID_ISSUER` deaktivierte das Modul
einen Knopf, hinter dem ein funktionierender Weg liegt.

⚠️ **Der `meldung`-Prop ist FERTIG.** Er kommt aus `gateMeldung(grund, sperrSekunden)` (Teil 2, T18)
und wird hier **nur angezeigt**. Drei Gründe, und der dritte trägt allein: die vier Gate-Texte stehen
in **§3.9 und nirgends sonst**; ein `searchParams`-Wert ist **Nutzereingabe** und darf nie in die
Seite durchgereicht werden; und die Sekundenzahl für `zuviele` liest **die Seite** selbst aus derselben
Schranke — **eine Zahl in der URL ist beim ersten Neuladen gelogen.**

⚠️ **Es gibt genau EINEN Fehlerort auf dem Gate.** Der Text aus `?grund=` und der Rückgabewert der
Server Action erscheinen an **derselben** Stelle (`.gateFehler`, heute `gateerr`,
`globals.css:126`). Zwei Fehlerorte wären zwei Zustände, die einander widersprechen können.

**Zwei Karten, wie heute** (`Gate.tsx:34-68`) — **die Verwaltungskarte bleibt**, sie ist der einzige
sichtbare Verwaltungseinstieg auf dem lagerbuch-Host (§7.2.4, Entscheidung 15 a).

**Das Zahlenfeld** trägt in der Suite (§7.2.4):

```html
<input class="codefeld" name="code" inputmode="numeric" autocomplete="off"
       maxlength="7" pattern="[0-9]{3}-?[0-9]{3}" placeholder="000-000"
       aria-label="Zugangs-Code" aria-describedby="codehinweis" />
```

`inputMode="numeric"` ist **neu** und ist zusammen mit `maxlength` und `pattern` die **billigste**
Maßnahme gegen Fehleingaben am gemeinsamen Rate-Limit-Eimer (§7.5.3, Falle 24).

⚠️ **Der `devLogin`-Knopf des Bestands (`Gate.tsx:59-66`) entfällt ersatzlos.** Die Suite hat einen
eigenen Entwicklungs-Anmeldeweg (`devLogin(page, …)`, §12.6); ein zweiter Knopf im Modul wäre ein
zweiter Pfad in dieselbe Sitzung, der in Produktion nur durch eine Bedingung stillgelegt ist.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/Gate.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists, click } from "@/app/m/qr/_lib/test-dom";

vi.mock("../_actions/gate", () => ({ einloesenAmGate: async () => ({}) }));

import { Gate } from "./Gate";

const QUELLE = "src/app/m/lagerbuch/_ui/Gate.tsx";
const LOGIN = "/login?callbackUrl=https%3A%2F%2Flagerbuch.iuk-ue.de%2Fverwaltung";

afterEach(async () => { await unmount(); });

describe("Gate — die FERTIGE Meldung", () => {
  it("zeigt sie, wenn sie da ist", async () => {
    // Der Prop ist der Rueckgabewert von `gateMeldung` (Teil 2, T18). Die vier
    // Texte stehen in §3.9 und nirgends sonst.
    await mount(
      <Gate meldung="Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung."
            returnTo="" verwaltungsLink={LOGIN} />,
    );
    expect(query("[data-rolle='gate-fehler']").textContent)
      .toBe("Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.");
  });

  it("zeigt NICHTS, wenn sie null ist", async () => {
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    expect(exists("[data-rolle='gate-fehler']")).toBe(false);
  });

  it("hat GENAU EINEN Fehlerort", async () => {
    // Der Text aus `?grund=` und der Rueckgabewert der Server Action erscheinen
    // an DERSELBEN Stelle. Zwei Fehlerorte waeren zwei Zustaende, die einander
    // widersprechen koennen.
    await mount(<Gate meldung="Zu viele Fehlversuche." returnTo="" verwaltungsLink={LOGIN} />);
    expect(queryAll("[data-rolle='gate-fehler']").length).toBe(1);
  });
});

describe("Gate — das Zahlenfeld (§7.2.4)", () => {
  it("traegt inputmode, maxlength, pattern, aria-label und aria-describedby", async () => {
    // inputMode/maxlength/pattern sind zusammen die billigste Massnahme gegen
    // Fehleingaben am GEMEINSAMEN Rate-Limit-Eimer (Falle 24): alle Helferinnen
    // hinter demselben Uplink teilen sich fuenf Fehlversuche pro Minute.
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    const f = query<HTMLInputElement>("input[name='code']");
    expect(f.getAttribute("inputmode")).toBe("numeric");
    expect(f.getAttribute("maxlength")).toBe("7");
    expect(f.getAttribute("pattern")).toBe("[0-9]{3}-?[0-9]{3}");
    expect(f.getAttribute("placeholder")).toBe("000-000");
    expect(f.getAttribute("aria-label")).toBe("Zugangs-Code");
    expect(f.getAttribute("aria-describedby")).toBe("codehinweis");
    expect(f.getAttribute("autocomplete")).toBe("off");
  });

  it("der beschriebene Hinweis existiert wirklich", async () => {
    // Ein `aria-describedby`, das ins Leere zeigt, ist fuer eine
    // Bildschirmleserin schlechter als keins: sie sagt gar nichts und niemand
    // merkt es.
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    expect(exists("#codehinweis")).toBe(true);
  });

  it("reicht `returnTo` als verstecktes Feld durch", async () => {
    await mount(<Gate meldung={null} returnTo="/a/art-9" verwaltungsLink={LOGIN} />);
    expect(query<HTMLInputElement>("input[name='returnTo']").value).toBe("/a/art-9");
  });
});

describe("Gate — die Verwaltungskarte", () => {
  it("ist ein LINK auf das Suite-/login, KEIN signIn()-Aufruf", async () => {
    // §3.6.6, Entscheidung 15 (a): „der Verwaltungs-Knopf fuehrt auf das
    // Suite-/login". Ein aus dem Bestand uebernommenes `signIn("oidc", …)`
    // liefe ins Leere — die Suite kennt den Anbieter als "pocket-id"
    // (core/auth/pocketId.ts:28), und Auth.js meldet einen unbekannten
    // Anbieter erst zur LAUFZEIT.
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    const a = query<HTMLAnchorElement>("[data-rolle='gate-verwaltung']");
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe(LOGIN);
  });

  it("reicht den Link UNVERAENDERT durch — er wird serverseitig gebaut", async () => {
    // Der Server kennt `verwaltungsZiel()` (Teil 2, T23) und `returnTo`; die
    // Insel entscheidet daran nichts. Ein zweites Zusammensetzen hier waere
    // eine zweite Stelle, an der der Cutover-Fall „kein SUITE_HOST_LAGERBUCH"
    // falsch entschieden werden kann.
    const anderer = "/login?callbackUrl=%2Fm%2Flagerbuch%2Fverwaltung";
    await mount(<Gate meldung={null} returnTo="/a/art-9" verwaltungsLink={anderer} />);
    expect(query<HTMLAnchorElement>("[data-rolle='gate-verwaltung']").getAttribute("href"))
      .toBe(anderer);
  });

  it("die Karte BLEIBT — sie ist der einzige sichtbare Verwaltungseinstieg", async () => {
    await mount(<Gate meldung={null} returnTo="" verwaltungsLink={LOGIN} />);
    expect(queryAll("h2").map((h) => h.textContent)).toEqual(["Im Dienst", "Verwaltung"]);
  });
});

describe("Gate — Bauform", () => {
  it("ist eine Client-Insel wegen `useActionState`", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/^"use client";/m);
    expect(q).toMatch(/useActionState<GateZustand, FormData>/);
  });

  it("hat KEINEN Demo-Login-Knopf mehr", () => {
    // Die Suite-Anmeldeseite bietet ihn selbst, wenn AUTH_DEV_LOGIN gesetzt ist
    // (core/auth/devLogin.ts:14). Ein zweiter Knopf im Modul waere ein zweiter
    // Pfad in dieselbe Sitzung, in Produktion nur durch eine Bedingung
    // stillgelegt.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/dev-login|devLogin|Demo-Login/);
  });

  it("importiert `next-auth/react` NICHT und ruft kein `signIn`", () => {
    // §3.6.6: der Weg fuehrt ueber das Suite-/login. `signIn("oidc", …)` waere
    // die naheliegende Uebernahme aus `Gate.tsx:55` und in der Suite falsch —
    // der Anbieter heisst dort "pocket-id", und der Fehler kaeme erst zur
    // Laufzeit.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/next-auth|signIn\(/);
  });

  it("liest die Markennamen aus `_lib/marke.ts`, nicht aus Env-Variablen (§10.2)", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/from "\.\.\/_lib\/marke"/);
    expect(q).not.toMatch(/process\.env/);
  });

  it("importiert kein antd, kein lucide", () => {
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Gate.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./Gate"`.

- [ ] **Schritt 3: `_ui/Gate.tsx` schreiben**

```tsx
"use client";

import { useActionState } from "react";
import { einloesenAmGate, type GateZustand } from "../_actions/gate";
import { LAGERBUCH_MARKE, LAGERBUCH_ORGANISATION, LAGERBUCH_ZEILE } from "../_lib/marke";
import s from "./helfer.module.css";

/**
 * DAS GATE — §7.2.4. "use client" wegen `useActionState`.
 *
 * ⚠️ `meldung` IST DER FERTIGE SATZ, NICHT DER ROHPARAMETER. Er kommt aus
 * `gateMeldung(grund, sperrSekunden)` (Teil 2, T18) und wird hier NUR
 * angezeigt. Drei Gruende, und der dritte traegt allein:
 *   * die vier Gate-Texte stehen in §3.9 UND NIRGENDS SONST;
 *   * ein `searchParams`-Wert ist NUTZEREINGABE und darf nie in die Seite
 *     durchgereicht werden;
 *   * die Sekundenzahl fuer `zuviele` liest DIE SEITE selbst aus derselben
 *     Schranke, mit denselben Absender-Kopfzeilen — EINE ZAHL IN DER URL IST
 *     BEIM ERSTEN NEULADEN GELOGEN.
 *
 * ⚠️ ES GIBT GENAU EINEN FEHLERORT. Der Text aus `?grund=` und der
 * Rueckgabewert der Server Action erscheinen an DERSELBEN Stelle (`.gateFehler`,
 * heute `gateerr`, globals.css:126). Zwei Fehlerorte waeren zwei Zustaende, die
 * einander widersprechen koennen.
 *
 * ⚠️ DIE VERWALTUNGSKARTE RUFT NICHT `signIn()`. Sie ist ein LINK auf das
 * Suite-`/login` (§3.6.6, Entscheidung 15 a: „der Verwaltungs-Knopf fuehrt auf
 * das Suite-/login"). `signIn("oidc", …)` waere die naheliegende Uebernahme aus
 * `Gate.tsx:55` und in der Suite FALSCH: der Anbieter heisst dort
 * **`"pocket-id"`** (`core/auth/pocketId.ts:28`) und existiert nur bei
 * gesetztem `POCKET_ID_ISSUER` (`core/auth/config.ts:76`). Auth.js meldet einen
 * unbekannten Anbieter erst zur LAUFZEIT — `pnpm build` bliebe gruen.
 *
 * `/login` steht auf JEDEM Host zur Verfuegung: `core/routing.ts:12` fuehrt es
 * in `PASSTHROUGH`, der Pfad wird also nirgends in ein Modul umgeschrieben.
 *
 * ⚠️ DER LINK KOMMT FERTIG VOM SERVER und wird hier NICHT zusammengesetzt. Er
 * traegt `verwaltungsZiel()` (Teil 2, T23) bzw. `returnTo`, und beides kennt
 * nur der Server. Ein zweites Zusammensetzen hier waere eine zweite Stelle, an
 * der der Cutover-Fall „kein SUITE_HOST_LAGERBUCH" falsch entschieden werden
 * kann (§3.6.6).
 *
 * ⚠️ DER DEMO-LOGIN-KNOPF DES BESTANDS (`Gate.tsx:59-66`) ENTFAELLT ERSATZLOS.
 * Die Suite-Anmeldeseite bietet ihn selbst, wenn `AUTH_DEV_LOGIN` gesetzt ist
 * (`core/auth/devLogin.ts:14`); ein zweiter Knopf im Modul waere ein zweiter
 * Pfad in dieselbe Sitzung, in Produktion nur durch eine BEDINGUNG stillgelegt.
 */
export function Gate({
  meldung,
  returnTo,
  verwaltungsLink,
}: {
  meldung: string | null;
  /** Bereits serverseitig sanitiert (`sanitizeReturnTo`, Teil 2 T19). */
  returnTo: string;
  /** FERTIGES `/login?callbackUrl=…`, serverseitig gebaut (T81). */
  verwaltungsLink: string;
}) {
  const [zustand, formAction, laeuft] = useActionState<GateZustand, FormData>(einloesenAmGate, {});

  // DER EINE Fehlerort: erst der Rueckgabewert der Action (frischer), sonst die
  // Meldung aus `?grund=`.
  const fehler = zustand.fehler ?? meldung;

  return (
    <div className={s.gate}>
      <div className={s.gateBalken} />
      <div className={s.gateMarke}>
        LAGER<span className={s.markeAkzent}>BUCH</span>
      </div>
      <div className={s.gateUnter}>
        {LAGERBUCH_ORGANISATION} · {LAGERBUCH_ZEILE}
      </div>

      <div className={s.gateKarten}>
        <div className={s.gateKarte}>
          <h2>Im Dienst</h2>
          <p className={s.fussnote}>
            Für Helfer:innen: Code vom Regal- oder Fahrzeugetikett eingeben – ohne Konto,
            ohne Passwort. Nur Entnahme.
          </p>
          <form action={formAction}>
            <input type="hidden" name="returnTo" value={returnTo} />
            {/*
              `inputMode="numeric"`, `maxLength` und `pattern` sind zusammen die
              billigste Massnahme gegen Fehleingaben am GEMEINSAMEN
              Rate-Limit-Eimer (§7.5.3, Falle 24): alle Helferinnen hinter
              demselben Uplink — ein Anschluss oder Mobilfunk hinter CGNAT —
              teilen sich fuenf Fehlversuche pro Minute.
            */}
            <input
              className={s.codefeld}
              name="code"
              inputMode="numeric"
              autoComplete="off"
              maxLength={7}
              pattern="[0-9]{3}-?[0-9]{3}"
              placeholder="000-000"
              aria-label="Zugangs-Code"
              aria-describedby="codehinweis"
            />
            <div id="codehinweis" className={s.gateHinweis}>
              Sechs Ziffern vom Kärtchen, mit oder ohne Bindestrich.
            </div>
            {fehler && (
              <div className={s.gateFehler} data-rolle="gate-fehler">{fehler}</div>
            )}
            <button className={`${s.knopf} ${s.knopfRot}`} type="submit" disabled={laeuft}>
              Weiter
            </button>
          </form>
        </div>

        {/*
          DIE VERWALTUNGSKARTE BLEIBT (§7.2.4, Entscheidung 15 a). Sie ist ein
          zweites, gleichrangiges Ziel neben dem Zahlenfeld — und der EINZIGE
          sichtbare Verwaltungseinstieg auf dem lagerbuch-Host.
        */}
        <div className={s.gateKarte}>
          <h2>Verwaltung</h2>
          <p className={s.fussnote}>
            Volles {LAGERBUCH_MARKE}: Artikel &amp; Chargen, Soll-Bestückung der Fahrzeuge,
            Bestellvorschläge, Journal und Zugangs-Codes.
          </p>
          <div style={{ flex: 1 }} />
          {/*
            Ein `<a>`, kein `<Link>`: `/login` liegt AUSSERHALB des Moduls und
            in `PASSTHROUGH` (`core/routing.ts:12`). Ein Prefetch der
            Anmeldeseite brächte nichts und liefe auf jedem Gate-Aufruf mit.
          */}
          <a
            className={`${s.knopf} ${s.knopfTinte}`}
            href={verwaltungsLink}
            data-rolle="gate-verwaltung"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M14 7a4 4 0 100 8 4 4 0 000-8zm-2.5 4H3v2h3v2h2v-2h3.5"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Mit Pocket ID anmelden
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Gate.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_ui/Gate.tsx src/app/m/lagerbuch/_ui/Gate.test.tsx
git commit -m "feat(lagerbuch): _ui/Gate.tsx — die fertige Meldung, ein Fehlerort, ein Zahlenfeld

Der meldung-Prop ist der FERTIGE Satz aus gateMeldung (Teil 2, T18), nicht der
Rohparameter: die vier Texte stehen in §3.9 und nirgends sonst, ein
searchParams-Wert ist Nutzereingabe, und die Sekundenzahl fuer 'zuviele' liest
die SEITE selbst aus derselben Schranke — eine Zahl in der URL ist beim ersten
Neuladen gelogen.

Genau EIN Fehlerort: der Text aus ?grund= und der Rueckgabewert der Action
erscheinen an derselben Stelle. Zwei Orte waeren zwei Zustaende, die einander
widersprechen koennen.

inputMode=numeric, maxlength=7 und pattern sind zusammen die billigste
Massnahme gegen Fehleingaben am GEMEINSAMEN Rate-Limit-Eimer: alle Helferinnen
hinter demselben Uplink teilen sich fuenf Fehlversuche pro Minute (Falle 24).
Das aria-describedby zeigt auf einen Hinweis, den es wirklich gibt.

Die Verwaltungskarte bleibt — der einzige sichtbare Verwaltungseinstieg auf dem
lagerbuch-Host. Sie ist ab jetzt ein LINK auf das Suite-/login (§3.6.6,
Entscheidung 15 a) und kein signIn()-Aufruf: die Suite kennt den Anbieter als
'pocket-id' (core/auth/pocketId.ts:28) und legt ihn nur bei gesetztem
POCKET_ID_ISSUER an. Ein aus dem Bestand uebernommenes signIn('oidc') liefe ins
Leere, und Auth.js meldet einen unbekannten Anbieter erst zur LAUFZEIT —
pnpm build bliebe gruen. /login liegt in PASSTHROUGH (core/routing.ts:12) und
wird auf keinem Host in ein Modul umgeschrieben.

Damit entfaellt auch der Demo-Login-Knopf ersatzlos: die Suite-Anmeldeseite
bietet ihn selbst, wenn AUTH_DEV_LOGIN gesetzt ist. Ein zweiter Pfad in
dieselbe Sitzung, der in Produktion nur durch eine Bedingung stillgelegt ist,
gehoert nicht ins Modul."
```

---

### Task 78: `_ui/Entnahme.tsx` — die zwei Zustände, die heute als Erfolg aussehen

**Files:**
- Create: `src/app/m/lagerbuch/_ui/Entnahme.tsx`
- Test: `src/app/m/lagerbuch/_ui/Entnahme.test.tsx`

**Interfaces:**
- Consumes: `_ui/Stepper.tsx` (T68), `_ui/HelferChip.tsx` (T70), `_lib/actionTypen.ts` (T63) —
  `type HelferErgebnis`, `leerText`, `NETZ_TEXT_BUCHUNG`; `_lib/format.ts` (Teil 3, T39) —
  `fmtVerfall`, `ampelTon`, `type AmpelTon`; `_lib/domain/verfall.ts` (Teil 3, T28) — `type Ampel`;
  `_ui/helfer.module.css` (T64).
- Produces:
  ```tsx
  // _ui/Entnahme.tsx — "use client"
  export type EntnahmeDetail = {
    id: string; name: string; einheit: string; fach: string; bestand: number;
    chargen: { id: string; chargenNr: string; verfall: string; rest: number;
               ampel: Ampel; text: string }[];
  };

  /** Genau die Signatur von `bucheEntnahmeHelfer` (Teil 5, T114) — siehe Auflage unten. */
  export type BuchungsAktion = (
    eingabe: { artikelId: string; menge: number },
  ) => Promise<HelferErgebnis<{ gebucht: number }>>;

  export function Entnahme(props: {
    detail: EntnahmeDetail;
    buchen: BuchungsAktion;      // die Action kommt als PROP
  }): JSX.Element;
  ```
  **Einziger Konsument:** `a/[artikelId]/page.tsx` (T83).

⚠️ **Die Datei heißt `Entnahme.tsx`, nicht `HelferEntnahme.tsx`.** §2.1 (Zeile 358) führt sie so, und
der Verzeichnisbaum ist verbindlich. teil5.md nennt sie an fünf Stellen falsch
(`:139`, `:501-546` Zeile 6, `:2808`, `:5542`, `:5920`) — das ist ein Schreibfehler in einem
Kommentar, keine Planänderung; **eine zweite Datei entsteht deswegen nicht.**

⚠️ **Die Action kommt als PROP und wird NICHT hier importiert.** `_actions/buchung.ts` gehört
vollständig **Teil 5** (H7, E10). Ein Import hier machte diesen Task von einem später laufenden Plan
abhängig; als Prop ist die Insel **vollständig, testbar und grün**, und der eine Import liegt in
**T83** — genau eine Stelle, die die Reihenfolge kennt. Dasselbe Muster benutzt Teil 5 für
`_ui/BarcodeScanner.tsx` (`zuBarcode` als Prop, T138).

⚠️ **AUFLAGE AN TEIL 5, T114 — sie ist nicht kosmetisch, und sie steht auch in §6.** Die heute in
teil5.md geschriebene Fassung von `bucheEntnahmeHelfer` gibt `ActionErgebnis<{gebucht:number}>` zurück
und liefert bei leerem Handlager **`{ok:true, wert:{gebucht:0}}`**. Das ist **genau der Zustand, den
§7.3 als teuersten der ganzen Tabelle benennt** — „Ein 200, das lügt". Verlangt ist:

```ts
export async function bucheEntnahmeHelfer(
  eingabe: unknown, db?: DB,
): Promise<HelferErgebnis<{ gebucht: number }>>;
//  gebucht === 0  →  { ok:false, grund:"leer",     text: leerText(artikelName) }
//  Riegel-Nein    →  { ok:false, grund: riegel.grund, text: RIEGEL_TEXTE[…] }
//  sonst          →  { ok:true,  wert:{ gebucht } }
```

Der Artikelname für `leerText` steht dem Server zur Verfügung (er hat `artikelId` und das Handle).
**Ohne diese Auflage kann T78 den `leer`-Fall nicht anzeigen** — und der DOM-Test aus §7.12.3
(„`{ok:false, grund:"leer"}` rendert die **Fehler**form, nicht den grünen Chip") hätte kein Subjekt.

**Die zwei Zustände, die heute als Erfolg aussehen** (§7.3) — sie sind der Kern der Umstellung:

- **Handlager leer.** `fefoAbbuchung` wirft nie (`db/abbuchung.ts:24-54`); ist nichts mehr da, gibt
  die Action `{gebucht: 0}` zurück (`actions/buchung.ts:82-93`), und `HelferEntnahme.tsx:26-27` macht
  daraus **„Entnahme gebucht: 0 × X" — grün, mit Häkchen** (`:55`, `chip chip-ok`).
- **Handlager reicht nur teilweise** (`0 < gebucht < menge`): heute ein grüner Chip mit der
  **kleineren** Zahl, **ohne Hinweis**. → `{ok:true}`, und die Insel schreibt „**3 von 5** gebucht;
  mehr lag nicht im Handlager."

**Und die ungefangene Aufrufstelle** (Falle 62): `HelferEntnahme.tsx:22-30` hat **kein `catch`** — der
Wurf schlägt bis zur Fehlerseite durch, und in Produktion steht dort ein englischer Satz.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/Entnahme.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists, click } from "@/app/m/qr/_lib/test-dom";
import { Entnahme, type EntnahmeDetail } from "./Entnahme";

const QUELLE = "src/app/m/lagerbuch/_ui/Entnahme.tsx";

const DETAIL: EntnahmeDetail = {
  id: "art-1", name: "Kompresse 10×10", einheit: "Stk", fach: "A-01", bestand: 42,
  chargen: [
    { id: "ch-1", chargenNr: "L1", verfall: "2027-03", rest: 30, ampel: "gruen", text: "03/27" },
    { id: "ch-2", chargenNr: "L2", verfall: "2026-09", rest: 12, ampel: "gelb", text: "läuft ab 09/26" },
  ],
};

const PLUS = "button[aria-label='Menge erhöhen']";
const BUCHEN = "[data-rolle='entnahme-buchen']";

afterEach(async () => { await unmount(); });

describe("Entnahme — die Anzeige", () => {
  it("zeigt Name, Fach, Bestand und Einheit", async () => {
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 1 } })} />);
    expect(query("h1").textContent).toBe("Kompresse 10×10");
    expect(query("[data-rolle='fach']").textContent).toBe("A-01");
    expect(query("[data-rolle='bestand']").textContent).toContain("42");
    expect(query("[data-rolle='bestand']").textContent).toContain("Stk");
  });

  it("listet die Chargen mit Chip und Monatsangabe (FEFO)", async () => {
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 1 } })} />);
    const zeilen = queryAll("[data-rolle='charge-zeile']");
    expect(zeilen.length).toBe(2);
    expect(zeilen[1].textContent).toContain("L2");
    expect(zeilen[1].textContent).toContain("läuft ab 09/26");
    expect(zeilen[1].textContent).toContain("09/26");   // fmtVerfall
  });

  it("der Chip traegt eine ECHTE Tonklasse, nie 'undefined' (§5.17)", async () => {
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 1 } })} />);
    for (const chip of queryAll("[data-rolle='helfer-chip']")) {
      expect(chip.className).not.toContain("undefined");
    }
  });

  it("der Buchen-Knopf ist bei Bestand 0 deaktiviert", async () => {
    await mount(
      <Entnahme detail={{ ...DETAIL, bestand: 0, chargen: [] }}
                buchen={async () => ({ ok: true, wert: { gebucht: 0 } })} />,
    );
    expect(query<HTMLButtonElement>(BUCHEN).disabled).toBe(true);
  });
});

describe("Entnahme — der ERFOLG", () => {
  it("volle Menge: gruener Chip mit Menge und Namen", async () => {
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 1 } })} />);
    await click(BUCHEN);
    const r = query("[data-rolle='entnahme-ergebnis']");
    expect(r.className).toMatch(/\bok\b/);
    expect(r.textContent).toBe("Entnahme gebucht: 1 × Kompresse 10×10");
  });

  it("TEILMENGE: sagt ‚3 von 5 gebucht' — heute steht dort nur die kleinere Zahl", async () => {
    // §7.3: heute ein gruener Chip mit der KLEINEREN Zahl, ohne Hinweis. Der
    // Helfer legt fuenf Teile ins Fahrzeug und das Journal kennt drei.
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 3 } })} />);
    for (let i = 0; i < 4; i++) await click(PLUS);   // 1 → 5
    await click(BUCHEN);
    expect(query("[data-rolle='entnahme-ergebnis']").textContent)
      .toBe("3 von 5 gebucht; mehr lag nicht im Handlager.");
  });

  it("setzt die Menge nach einem Erfolg auf 1 zurueck", async () => {
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 3 } })} />);
    for (let i = 0; i < 2; i++) await click(PLUS);
    await click(BUCHEN);
    expect(query<HTMLInputElement>("input[aria-label='Menge']").value).toBe("1");
  });
});

describe("Entnahme — die vier Fehlerlagen (§7.3)", () => {
  it("`leer` rendert die FEHLERform, NICHT den gruenen Chip", async () => {
    // DER REGRESSIONSTEST gegen „Entnahme gebucht: 0 × X" mit Haekchen
    // (HelferEntnahme.tsx:26-27, :55 `chip chip-ok`). Ein 200, das luegt, ist
    // der teuerste Zustand der Tabelle.
    await mount(
      <Entnahme detail={DETAIL} buchen={async () => ({
        ok: false, grund: "leer",
        text: "Im Handlager liegt nichts mehr von Kompresse 10×10. Bitte der Verwaltung melden.",
      })} />,
    );
    await click(BUCHEN);
    const r = query("[data-rolle='entnahme-ergebnis']");
    expect(r.className).toMatch(/\brot\b/);
    expect(r.className).not.toMatch(/\bok\b/);
    expect(r.textContent).toBe(
      "Im Handlager liegt nichts mehr von Kompresse 10×10. Bitte der Verwaltung melden.",
    );
  });

  it("`gesperrt` zeigt den Text und KEIN Erneuerungsfeld", async () => {
    // Ein erneutes Einloesen desselben Codes scheitert genauso; ein Feld
    // anzubieten, das nicht helfen kann, ist schlimmer als keins (§7.4.4).
    await mount(
      <Entnahme detail={DETAIL} buchen={async () => ({
        ok: false, grund: "gesperrt",
        text: "Dieses Kärtchen wurde gesperrt. Die Buchung wurde nicht gespeichert.",
      })} />,
    );
    await click(BUCHEN);
    expect(query("[data-rolle='entnahme-ergebnis']").textContent).toContain("gesperrt");
    expect(exists("[data-rolle='erneuern']")).toBe(false);
  });

  it("`sitzung` zeigt den Text und schickt zum Gate — ohne die Menge zu verwerfen", async () => {
    await mount(
      <Entnahme detail={DETAIL} buchen={async () => ({
        ok: false, grund: "sitzung",
        text: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
      })} />,
    );
    for (let i = 0; i < 2; i++) await click(PLUS);
    await click(BUCHEN);
    expect(query<HTMLAnchorElement>("[data-rolle='entnahme-zum-gate']").getAttribute("href"))
      .toBe("/?returnTo=%2Fa%2Fart-1");
    expect(query<HTMLInputElement>("input[aria-label='Menge']").value).toBe("3");
  });

  it("ein GEWORFENER Fehler wird gefangen: ‚Keine Verbindung', Menge bleibt, Knopf wieder aktiv", async () => {
    // Falle 62: HelferEntnahme.tsx:22-30 hat KEIN catch — der Wurf schlaegt bis
    // zur Fehlerseite durch, und in Produktion steht dort ein ENGLISCHER Satz
    // (Falle 66).
    await mount(
      <Entnahme detail={DETAIL} buchen={async () => { throw new Error("offline"); }} />,
    );
    for (let i = 0; i < 4; i++) await click(PLUS);
    await click(BUCHEN);
    expect(query("[data-rolle='entnahme-ergebnis']").textContent)
      .toBe("Keine Verbindung. Die Buchung wurde nicht gespeichert.");
    expect(query<HTMLInputElement>("input[aria-label='Menge']").value).toBe("5");
    expect(query<HTMLButtonElement>(BUCHEN).disabled).toBe(false);
  });
});

describe("Entnahme — Bauform", () => {
  it("importiert die Action NICHT, sie kommt als Prop", () => {
    // `_actions/buchung.ts` gehoert Teil 5 (H7). Als Prop ist diese Insel
    // vollstaendig, testbar und gruen; der eine Import liegt in T83.
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/_actions\/buchung/);
  });

  it("faengt JEDEN Action-Aufruf in try/catch", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/try \{[\s\S]*?await buchen\(/);
    expect(q).toMatch(/catch/);
  });

  it("ist eine Client-Insel ohne antd, ohne lucide, ohne Plakette", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/^"use client";/m);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react|\.\/Plakette/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Entnahme.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./Entnahme"`.

- [ ] **Schritt 3: `_ui/Entnahme.tsx` schreiben**

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { NETZ_TEXT_BUCHUNG, type HelferErgebnis, type HelferGrund } from "../_lib/actionTypen";
import { fmtVerfall, ampelTon } from "../_lib/format";
import type { Ampel } from "../_lib/domain/verfall";
import s from "./helfer.module.css";

/**
 * DIE ENTNAHME AM REGAL — §7.2.2, §7.3. Nachfolger von `HelferEntnahme.tsx`.
 *
 * ⚠️ SIE HEISST `Entnahme.tsx`, NICHT `HelferEntnahme.tsx`. §2.1 (Zeile 358)
 * fuehrt sie so; teil5.md nennt sie an fuenf Stellen falsch. Das ist ein
 * Schreibfehler in einem Kommentar, keine Planaenderung.
 *
 * ⚠️ DIE ACTION KOMMT ALS PROP. `_actions/buchung.ts` gehoert vollstaendig
 * Teil 5 (Festlegung H7). Ein Import hier machte diese Datei von einem SPAETER
 * laufenden Plan abhaengig; als Prop ist die Insel vollstaendig, testbar und
 * gruen, und der eine Import liegt in `a/[artikelId]/page.tsx` (T83) — genau
 * eine Stelle, die die Reihenfolge kennt. Dasselbe Muster benutzt Teil 5 fuer
 * `_ui/BarcodeScanner.tsx`.
 */
export type EntnahmeDetail = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  bestand: number;
  chargen: {
    id: string; chargenNr: string; verfall: string; rest: number; ampel: Ampel; text: string;
  }[];
};

export type BuchungsAktion = (
  eingabe: { artikelId: string; menge: number },
) => Promise<HelferErgebnis<{ gebucht: number }>>;

type Rueckmeldung = { art: "ok" | "fehler"; text: string; grund?: HelferGrund };

export function Entnahme({ detail, buchen }: { detail: EntnahmeDetail; buchen: BuchungsAktion }) {
  const [menge, setMenge] = useState(1);
  const [rueck, setRueck] = useState<Rueckmeldung | null>(null);
  const [laeuft, start] = useTransition();

  function absenden() {
    const m = Math.min(menge, detail.bestand);
    if (m <= 0) return;
    setRueck(null);
    start(async () => {
      try {
        const r = await buchen({ artikelId: detail.id, menge: m });
        if (!r.ok) {
          // Der Server hat den Text; die Insel formuliert ihn NICHT neu (§7.3).
          setRueck({ art: "fehler", text: r.text, grund: r.grund });
          return;
        }
        const gebucht = r.wert.gebucht;
        setRueck(
          gebucht < m
            // §7.3, zweiter Zustand: heute ein GRUENER Chip mit der KLEINEREN
            // Zahl, ohne Hinweis — der Helfer legt fuenf Teile ins Fahrzeug und
            // das Journal kennt drei.
            ? { art: "ok", text: `${gebucht} von ${m} gebucht; mehr lag nicht im Handlager.` }
            : { art: "ok", text: `Entnahme gebucht: ${gebucht} × ${detail.name}` },
        );
        setMenge(1);
      } catch {
        // FALLE 62: `HelferEntnahme.tsx:22-30` hat KEIN catch — der Wurf
        // schlaegt bis zur Fehlerseite durch, und in Produktion steht dort ein
        // englischer Satz mit `digest` (Falle 66). `"netz"` entsteht
        // ausschliesslich HIER, nie serverseitig.
        setRueck({ art: "fehler", text: NETZ_TEXT_BUCHUNG, grund: "netz" });
        // Die Menge bleibt im Feld, der Knopf wird wieder aktiv (§7.10.3).
      }
    });
  }

  return (
    <>
      <Link className={s.rueckweg} href="/helfer">
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Zurück
      </Link>

      <div className={s.zeile}>
        <h1 className={s.zeileHaupt} style={{ font: "700 24px var(--lb-display)", lineHeight: 1.12 }}>
          {detail.name}
        </h1>
        <span className={s.fach} data-rolle="fach">{detail.fach}</span>
      </div>

      <div className={`${s.karte} ${s.kartePad}`}>
        <div className={s.fussnote}>BESTAND HANDLAGER</div>
        <div className={s.bestandsZahl} data-rolle="bestand">
          {detail.bestand} <span style={{ fontSize: 16 }}>{detail.einheit}</span>
        </div>
      </div>

      <div className={s.karte}>
        <div className={s.karteTitel}>Entnahme</div>
        <div className={s.kartePad}>
          <div className={s.zeile} style={{ borderTop: "none", padding: 0 }}>
            <span className={s.zeileHaupt}>Menge</span>
            <Stepper
              wert={menge}
              setWert={setMenge}
              min={1}
              max={Math.max(detail.bestand, 1)}
              beschriftung="Menge"
            />
          </div>

          <button
            className={`${s.knopf} ${s.knopfRot}`}
            type="button"
            disabled={detail.bestand === 0 || laeuft}
            onClick={absenden}
            data-rolle="entnahme-buchen"
          >
            Entnahme buchen
          </button>

          {rueck && (
            <>
              <span
                className={`${s.chip} ${rueck.art === "ok" ? s.ok : s.rot}`}
                data-rolle="entnahme-ergebnis"
                role="status"
              >
                {rueck.text}
              </span>
              {/*
                Bei `sitzung` fuehrt der Weg zurueck aufs Gate — MIT `returnTo`,
                damit der Artikel nach dem erneuten Einloesen wieder offen ist.
                Ein Erneuerungsfeld an Ort und Stelle gibt es hier NICHT: anders
                als im Check (§7.4.4) haengt an dieser Seite kein Client-Zustand,
                den ein Seitenwechsel verwuerfe — nur eine Zahl, und die bleibt
                stehen.
              */}
              {rueck.grund === "sitzung" && (
                <Link
                  className={s.rueckweg}
                  href={`/?returnTo=${encodeURIComponent(`/a/${detail.id}`)}`}
                  data-rolle="entnahme-zum-gate"
                >
                  Kärtchen erneut eingeben
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <div className={s.karte}>
        <div className={s.karteTitel}>Nächste Charge zuerst (FEFO)</div>
        {detail.chargen.map((c) => (
          <div className={s.zeile} key={c.id} data-rolle="charge-zeile">
            <div className={s.zeileHaupt}>
              <div style={{ font: "600 13px var(--lb-mono)" }}>Charge {c.chargenNr}</div>
              <div className={s.zeileMeta}>
                {/* Beide Angaben stehen NEBENEINANDER: der Chip traegt den
                    Status als TEXT (nie allein ueber Farbe), `fmtVerfall` das
                    Datum in der Form „MM/JJ" (Teil 3, T39). */}
                <HelferChip ton={ampelTon(c.ampel)}>{c.text}</HelferChip>
                <span>{fmtVerfall(c.verfall)}</span>
              </div>
            </div>
            <div className={s.mengenChip}>
              {c.rest}
              <small>{detail.einheit}</small>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Entnahme.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_ui/Entnahme.tsx src/app/m/lagerbuch/_ui/Entnahme.test.tsx
git commit -m "feat(lagerbuch): _ui/Entnahme.tsx — die zwei Zustaende, die heute als Erfolg aussehen

Handlager leer: fefoAbbuchung wirft nie, die Action gibt {gebucht: 0} zurueck,
und HelferEntnahme.tsx:26-27 macht daraus 'Entnahme gebucht: 0 × X' — GRUEN,
MIT HAEKCHEN. Ein 200, das luegt, ist der teuerste Zustand der Tabelle. Ab jetzt
ist das die Fehlerform, und der DOM-Test haelt genau das fest.

Handlager reicht teilweise: heute ein gruener Chip mit der KLEINEREN Zahl, ohne
Hinweis — der Helfer legt fuenf Teile ins Fahrzeug und das Journal kennt drei.
Ab jetzt '3 von 5 gebucht; mehr lag nicht im Handlager.'

Falle 62: der Aufruf steht in try/catch. Heute schlaegt der Wurf bis zur
Fehlerseite durch, und in Produktion steht dort ein englischer Satz mit digest.
Bei 'netz' bleibt die Menge im Feld und der Knopf wird wieder aktiv.

Die Action kommt als PROP: _actions/buchung.ts gehoert Teil 5 (H7). Als Prop
ist die Insel vollstaendig, testbar und gruen; der eine Import liegt in T83.
Der Dateiname ist Entnahme.tsx nach §2.1 Zeile 358 — teil5.md nennt sie an
fuenf Stellen falsch."
```

---

**Gate Stufe 5.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 6 — Der Fahrzeug-Check (2 Tasks, parallel)

---

### Task 79: `_ui/CheckFlow.tsx` — adaptive Schrittfolge, ein Fahrzeug, Inline-Erneuerung

**Files:**
- Create: `src/app/m/lagerbuch/_ui/CheckFlow.tsx`
- Test: `src/app/m/lagerbuch/_ui/CheckFlow.test.tsx`

**Interfaces:**
- Consumes: `_ui/Stepper.tsx` (T68), `_ui/HelferChip.tsx` (T70), `_ui/LeerZustand.tsx` (T69);
  `_actions/check.ts` (T75) — `checkAbschluss`, `type CheckAbschlussWert`;
  `_actions/sitzung.ts` (T74) — `erneuereSitzung`;
  `_lib/checkNutzlast.ts` (Teil 3, T43) — `checkNutzlast`, `zaehleAblaufende`, `GERAET_VORBELEGUNG`,
  `type CheckZaehlung`, `type CheckGeraetAntwort`;
  `_lib/domain/verfall.ts` (Teil 3, T28) — `verfallStatus`, `type VerfallSchwellen`;
  `_lib/domain/o2.ts` (Teil 3, T34) — `o2Status`;
  `_lib/format.ts` (Teil 3, T39) — `chargeText`, `ampelTon`;
  `_lib/konstanten.ts` (Teil 1, T4) — `ZUSTAENDE`, `type Zustand`;
  `_lib/actionTypen.ts` (T63) — `NETZ_TEXT_CHECK`, `darfErneuern`, `type HelferGrund`;
  `_ui/helfer.module.css` (T64).
- Produces:
  ```tsx
  // _ui/CheckFlow.tsx — "use client"
  export type CheckPos = {
    id: string; fachLabel: string; artikelId: string; artikelName: string; einheit: string;
    handlagerFach: string; soll: number; fahrzeugBestand: number; handlagerBestand: number;
  };
  export type CheckGeraet = { id: string; typ: "medizin" | "objekt"; name: string };
  export type CheckFlasche = {
    id: string; name: string; nennfuelldruckBar: number; letzterDruck: number | null;
  };

  export function CheckFlow(props: {
    fahrzeug: { id: string; name: string; kennung: string | null };
    soll: CheckPos[];
    geraete: CheckGeraet[];
    flaschen: CheckFlasche[];
    verfall: Record<string, string>;      // beim letzten Check gemeldet, je artikelId
    warn: VerfallSchwellen;
  }): JSX.Element;
  ```
  **Einziger Konsument:** `helfer/check/page.tsx` (T85).

**Die eine Strukturänderung dieses Kapitels** (§7.9.1, Falle 15): **`CheckFlow` kennt nur noch EIN
Fahrzeug.** Heute reicht `helfer/check/page.tsx:16,19-21,23,24-26` vier
`Object.fromEntries(fahrzeuge.map(...))`-Wörterbücher **komplett** an die Client-Komponente
(`CheckFlow.tsx:50-58`) — damit wandert bei **jedem** Helfer-Aufruf die Soll-Bestückung, Geräteliste,
Flaschenliste und Verfallslage **der gesamten Organisation** in den RSC-Payload: auf ein **privates
Telefon**, in einer Sitzung **ohne Konto** (§3.4.5). Die vier Wörterbücher und die `preselect`-Prop
entfallen; die Fahrzeugwahl wird eine **Navigation** (T80). **„Danach nachzurüsten heißt, den Flow ein
zweites Mal umzubauen."**

**Was 1:1 bleibt** (§7.9.2) — jede Zeile mit Beleg:

| Verhalten | Beleg | Warum es bleibt |
|---|---|---|
| Adaptive Schrittfolge; Commit im **letzten** Schritt | `:116-130`, `:129` | feste vier Schritte mit Leerbildschirmen sind auf einem Telefon im Fahrzeug messbar schlechter |
| Zählen: jede Position auf **Soll** vorbelegt, mit `−` runterzählen | `:97` | „voll annehmen, Gezähltes runterkorrigieren" — der Regelfall ist „alles da" |
| Der **recorded** Fahrzeugbestand ist **kein** Per-Position-Default | `:94-96` | er ist pro Artikel, nicht pro Fach; derselbe Artikel in zwei Fächern vervielfachte sich |
| Verfall hängt am **Artikel**; nur die **erste** Zeile je Artikel trägt das Feld | `:100-109` | zwei Felder für eine Angabe wären nicht auseinanderzuhalten |
| Nur **Geändertes** wird gesendet | `:152-155` | Unberührtes bleibt unberührt |
| Nachfüllen: greedy je Artikel über die Anzeigereihenfolge, gedeckelt an der Handlager-Verfügbarkeit | `:222-238` | der Vorschlag verspricht nie mehr, als der Handlager hergibt |
| Nachfüllen: der Helfer stellt ein, was er **wirklich** geholt hat (`max={luecke}`) | `:445`, `:461` | die Buchung folgt der Wirklichkeit, nicht dem Vorschlag |
| Geräte: alles auf **vorhanden · In Ordnung** | `:325`, `:132` | derselbe Grundsatz wie beim Zählen |
| Sauerstoff: jede Flasche auf den **Nennfülldruck** | `:136-137`, `:384` | ebenso |

**Was sich ändert:**

1. **Die Hinweiszeile bei Wiederholzeilen fällt ersatzlos weg** (§7.7.2 Punkt 3). Heute steht dort
   `<small>Verfall bei {zeile.fachLabel} angeben</small>` (`:290`) — **eine ganze Zeile für einen
   Hinweis.** Der Statuschip in der Meta-Zeile (`:273`) trägt die Angabe bereits und ist in **jeder**
   Zeile desselben Artikels sichtbar.
2. **„Weiterer Check" wird zu zwei `<Link>`** (§7.9.1): „Nochmal dieses Fahrzeug" (`?fz=<id>`) und
   „Anderes Fahrzeug" (`/helfer/check`). Heute ein Zustandsreset über **sieben Setter** (`:210`). Ein
   Seitenaufbau ist hier ohnehin gewollt — **die Bestände haben sich gerade geändert.**
3. **Die Nutzlast wird NICHT hier gebaut**, sondern von `checkNutzlast` (Teil 3, T43). Das
   Verfallsfeld im Zählschritt (`:281`) und die Live-Vorschau `{n} laufen ab` (`:306`) sind laut
   §12.1 **die einzige Absicherung ihrer Fachlichkeit** — `actions/check.test.ts:229` beweist nur,
   dass der Server richtig zählt, **wenn** der Wert ankommt.
4. **Die Inline-Erneuerung** (§7.4.4): bei `grund === "sitzung"` erscheint **an Ort und Stelle** ein
   Zahlenfeld, und **alle sechs Client-Zustände bleiben stehen**. Bei `"gesperrt"` erscheint es
   **nicht**.
5. **`catch` mit `grund: "netz"`** (Falle 62). `CheckFlow.tsx:158-159` fängt zwar, zeigt aber
   `e.message` — in Produktion der englische Server-Components-Satz (Falle 66).

⚠️ **Die Ampel im Zählschritt wird im Client gerechnet, und das ist keine Zeitzonenfrage mehr**
(§7.9.3). `verfallStatus` rechnet über `monatsEnde()` aus `_lib/zeit.ts` und ist **zonenexplizit**;
ob die Funktion im Browser oder im Container läuft, ändert das Ergebnis **nicht mehr**. Chip im
Zählschritt und Zahl in der Abschlussmeldung können **konstruktiv** nicht auseinanderfallen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/CheckFlow.test.tsx`:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  mount, unmount, query, queryAll, exists, click, fill,
} from "@/app/m/qr/_lib/test-dom";

const abschluss = vi.fn();
vi.mock("../_actions/check", () => ({ checkAbschluss: (...a: unknown[]) => abschluss(...a) }));
const erneuere = vi.fn();
vi.mock("../_actions/sitzung", () => ({ erneuereSitzung: (...a: unknown[]) => erneuere(...a) }));

import { CheckFlow, type CheckPos, type CheckGeraet, type CheckFlasche } from "./CheckFlow";

const QUELLE = "src/app/m/lagerbuch/_ui/CheckFlow.tsx";
const FZ = { id: "fz-1", name: "RTW 1", kennung: "HH-DR 1234" };
const WARN = { rotTage: 31, gelbTage: 56 };

const POS = (over: Partial<CheckPos> = {}): CheckPos => ({
  id: "sp-1", fachLabel: "Fach 1", artikelId: "art-1", artikelName: "Kompresse",
  einheit: "Stk", handlagerFach: "A-01", soll: 5, fahrzeugBestand: 5, handlagerBestand: 20,
  ...over,
});
const GERAET: CheckGeraet = { id: "g-1", typ: "medizin", name: "Absaugpumpe" };
const FLASCHE: CheckFlasche = { id: "o-1", name: "O2 klein", nennfuelldruckBar: 200, letzterDruck: 190 };

const WEITER = "[data-rolle='weiter']";
const ABSCHLIESSEN = "[data-rolle='abschliessen']";
const MINUS = (n: number) => queryAll("button[aria-label$='verringern']")[n];

beforeEach(() => {
  abschluss.mockReset();
  erneuere.mockReset();
  abschluss.mockResolvedValue({
    ok: true,
    wert: {
      checkId: "c1", nachgefuellt: 0, nachfuellBestaetigt: 0, offen: 0,
      geraeteAuffaellig: 0, flaschenAuffaellig: 0, flaschenNichtBewertbar: 0, verfallAuffaellig: 0,
    },
  });
});
afterEach(async () => { await unmount(); });

describe("CheckFlow — die adaptive Schrittfolge (1:1, §7.9.2)", () => {
  it("Artikel + Geraete + Flaschen ergeben VIER Schritte", async () => {
    await mount(<CheckFlow fahrzeug={FZ} soll={[POS()]} geraete={[GERAET]} flaschen={[FLASCHE]}
                           verfall={{}} warn={WARN} />);
    expect(queryAll("[data-rolle='schritt']").map((e) => e.textContent?.trim()))
      .toEqual(["1 Zählen", "2 Nachfüllen", "3 Geräte", "4 Sauerstoff"]);
  });

  it("Fahrzeug OHNE Geraete hat DREI Schritte", async () => {
    await mount(<CheckFlow fahrzeug={FZ} soll={[POS()]} geraete={[]} flaschen={[FLASCHE]}
                           verfall={{}} warn={WARN} />);
    expect(queryAll("[data-rolle='schritt']").length).toBe(3);
  });

  it("Fahrzeug OHNE Artikel hat ZWEI Schritte", async () => {
    await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[FLASCHE]}
                           verfall={{}} warn={WARN} />);
    expect(queryAll("[data-rolle='schritt']").map((e) => e.textContent?.trim()))
      .toEqual(["1 Geräte", "2 Sauerstoff"]);
  });

  it("Fahrzeug OHNE ALLES zeigt den LeerZustand — mit benanntem Rueckweg", async () => {
    await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    expect(exists("[data-rolle='leer-titel']")).toBe(true);
    expect(query<HTMLAnchorElement>("[data-rolle='leer-weg']").getAttribute("href"))
      .toBe("/helfer/check");
  });

  it("der Commit sitzt im LETZTEN Schritt der Folge", async () => {
    // Nur Geraete: der Geraeteschritt IST der letzte, also steht dort
    // „Abschliessen" und nicht „Weiter".
    await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    expect(exists(ABSCHLIESSEN)).toBe(true);
    expect(exists(WEITER)).toBe(false);
  });
});

describe("CheckFlow — der Zaehlschritt", () => {
  it("jede Position ist auf SOLL vorbelegt", async () => {
    // „voll annehmen, Gezaehltes runterkorrigieren" (:97) — der Regelfall ist
    // „alles da".
    await mount(<CheckFlow fahrzeug={FZ} soll={[POS({ soll: 7 })]} geraete={[]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    expect(query("[data-rolle='stepanzeige']").textContent).toBe("7");
  });

  it("der Stepper hat KEIN Zahlenfeld (`noText`)", async () => {
    // Stepper.tsx:19-21: „damit unterwegs am Handy nicht versehentlich ins
    // Zahlenfeld getippt wird" — hier ist ein Fehlgriff eine falsche
    // Bestandsbuchung.
    await mount(<CheckFlow fahrzeug={FZ} soll={[POS()]} geraete={[]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    expect(exists("[data-rolle='zaehlliste'] input[aria-label]")).toBe(false);
  });

  it("das Verfallsfeld erscheint NUR in der ERSTEN Zeile je Artikel", async () => {
    // Zwei Felder fuer EINE Angabe waeren nicht auseinanderzuhalten (:100-109).
    await mount(
      <CheckFlow fahrzeug={FZ} geraete={[]} flaschen={[]} verfall={{}} warn={WARN}
        soll={[
          POS({ id: "sp-1", fachLabel: "Fach 1" }),
          POS({ id: "sp-2", fachLabel: "Fach 2" }),
        ]} />,
    );
    expect(queryAll("input[type='month']").length).toBe(1);
  });

  it("die Hinweiszeile bei Wiederholzeilen ist WEG (§7.7.2 Punkt 3)", async () => {
    // Heute eine ganze Zeile fuer einen Hinweis (:290). Der Statuschip traegt
    // die Angabe bereits und ist in JEDER Zeile desselben Artikels sichtbar.
    await mount(
      <CheckFlow fahrzeug={FZ} geraete={[]} flaschen={[]} verfall={{ "art-1": "2026-09" }} warn={WARN}
        soll={[POS({ id: "sp-1" }), POS({ id: "sp-2", fachLabel: "Fach 2" })]} />,
    );
    expect(query("[data-rolle='zaehlliste']").textContent).not.toContain("Verfall bei");
    expect(queryAll("[data-rolle='helfer-chip']").length).toBeGreaterThanOrEqual(2);
  });

  it("die Live-Vorschau zaehlt ablaufende Artikel mit", async () => {
    // §12.1 Punkt 1: das Feld und die Vorschau sind die EINZIGE Absicherung
    // ihrer Fachlichkeit. Die Zaehlung selbst liegt in `zaehleAblaufende`
    // (Teil 3, T43); hier wird geprueft, dass sie ANKOMMT.
    await mount(
      <CheckFlow fahrzeug={FZ} soll={[POS()]} geraete={[]} flaschen={[]}
                 verfall={{ "art-1": "2020-01" }} warn={WARN} />,
    );
    expect(query("[data-rolle='zaehl-summe']").textContent).toContain("1 laufen ab");
  });

  it("`Soll` runterzaehlen zeigt „nachfuellen N\"", async () => {
    await mount(<CheckFlow fahrzeug={FZ} soll={[POS({ soll: 5 })]} geraete={[]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    for (let i = 0; i < 2; i++) await click("button[aria-label$='verringern']");
    expect(query("[data-rolle='zaehlliste']").textContent).toContain("nachfüllen 2");
  });
});

describe("CheckFlow — Nachfuellen", () => {
  it("schlaegt greedy vor, gedeckelt an der Handlager-Verfuegbarkeit", async () => {
    // Der Vorschlag verspricht nie mehr, als der Handlager hergibt (:222-238).
    await mount(
      <CheckFlow fahrzeug={FZ} geraete={[]} flaschen={[]} verfall={{}} warn={WARN}
        soll={[POS({ soll: 5, handlagerBestand: 2 })]} />,
    );
    for (let i = 0; i < 5; i++) await click("button[aria-label$='verringern']");   // Ist = 0
    await click(WEITER);
    expect(query("[data-rolle='nf-liste'] [data-rolle='stepanzeige']").textContent).toBe("2");
  });

  it("warnt, wenn der Handlager nicht fuer alle Positionen reicht", async () => {
    await mount(
      <CheckFlow fahrzeug={FZ} geraete={[]} flaschen={[]} verfall={{}} warn={WARN}
        soll={[POS({ id: "sp-1", soll: 5, handlagerBestand: 2 }),
               POS({ id: "sp-2", fachLabel: "Fach 2", soll: 5, handlagerBestand: 2 })]} />,
    );
    for (const b of queryAll("button[aria-label$='verringern']")) {
      for (let i = 0; i < 5; i++) b.click();
    }
    await click(WEITER);
    expect(exists("[data-rolle='nf-knappheit']")).toBe(true);
  });
});

describe("CheckFlow — der Abschluss und seine Rueckmeldung (§7.9.4)", () => {
  it("sendet die Nutzlast und zeigt die Kennzahlen", async () => {
    abschluss.mockResolvedValue({
      ok: true,
      wert: { checkId: "c1", nachgefuellt: 3, nachfuellBestaetigt: 3, offen: 2,
              geraeteAuffaellig: 1, flaschenAuffaellig: 1, flaschenNichtBewertbar: 0,
              verfallAuffaellig: 2 },
    });
    await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    await click(ABSCHLIESSEN);
    const t = query("[data-rolle='check-ergebnis']").textContent ?? "";
    expect(t).toContain("3 aus Handlager geholt");
    expect(t).toContain("2 fehlt weiterhin");
    expect(t).toContain("1 Gerät(e) auffällig");
    expect(t).toContain("1 Flasche(n) niedrig");
    expect(t).toContain("2 laufen ab");
  });

  it("sagt AUSDRUECKLICH, wenn weniger gebucht wurde als bestaetigt (NEU)", async () => {
    // `umlagerung` kappt still an der Verfuegbarkeit, und der Helfer hat die
    // Teile IN DER HAND. Ohne den Satz legt er sie ins Fahrzeug und das Journal
    // weiss es nicht.
    abschluss.mockResolvedValue({
      ok: true,
      wert: { checkId: "c1", nachgefuellt: 2, nachfuellBestaetigt: 5, offen: 3,
              geraeteAuffaellig: 0, flaschenAuffaellig: 0, flaschenNichtBewertbar: 0,
              verfallAuffaellig: 0 },
    });
    await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    await click(ABSCHLIESSEN);
    expect(query("[data-rolle='check-ergebnis']").textContent)
      .toContain("Von 5 bestätigten Teilen konnten nur 2 gebucht werden.");
  });

  it("nennt nicht bewertbare Flaschen (NEU, §5.12)", async () => {
    abschluss.mockResolvedValue({
      ok: true,
      wert: { checkId: "c1", nachgefuellt: 0, nachfuellBestaetigt: 0, offen: 0,
              geraeteAuffaellig: 0, flaschenAuffaellig: 0, flaschenNichtBewertbar: 2,
              verfallAuffaellig: 0 },
    });
    await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    await click(ABSCHLIESSEN);
    expect(query("[data-rolle='check-ergebnis']").textContent)
      .toContain("2 Flasche(n) nicht bewertbar");
  });

  it("bietet ZWEI Links statt eines Zustandsresets (§7.9.1)", async () => {
    await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    await click(ABSCHLIESSEN);
    expect(query<HTMLAnchorElement>("[data-rolle='nochmal']").getAttribute("href"))
      .toBe("/helfer/check?fz=fz-1");
    expect(query<HTMLAnchorElement>("[data-rolle='anderes']").getAttribute("href"))
      .toBe("/helfer/check");
  });
});

describe("CheckFlow — die Inline-Erneuerung (§7.4.4)", () => {
  it("`grund:\"sitzung\"` zeigt das Feld UND haelt alle Zustaende", async () => {
    abschluss.mockResolvedValue({
      ok: false, grund: "sitzung",
      text: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
    });
    await mount(<CheckFlow fahrzeug={FZ} soll={[POS({ soll: 5 })]} geraete={[]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    for (let i = 0; i < 2; i++) await click("button[aria-label$='verringern']");   // Ist = 3
    await click(WEITER);
    await click(ABSCHLIESSEN);
    expect(exists("[data-rolle='erneuern']")).toBe(true);
    // Zurueck zum Zaehlen: der Wert steht noch.
    await click("[data-rolle='zurueck-zaehlen']");
    expect(query("[data-rolle='stepanzeige']").textContent).toBe("3");
  });

  it("`grund:\"gesperrt\"` zeigt das Feld NICHT", async () => {
    // Ein erneutes Einloesen desselben Codes scheitert genauso, und ein Feld
    // anzubieten, das nicht helfen kann, ist schlimmer als keins.
    abschluss.mockResolvedValue({
      ok: false, grund: "gesperrt",
      text: "Dieses Kärtchen wurde gesperrt. Die Buchung wurde nicht gespeichert.",
    });
    await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    await click(ABSCHLIESSEN);
    expect(exists("[data-rolle='erneuern']")).toBe(false);
    expect(query("[data-rolle='check-fehler']").textContent).toContain("gesperrt");
  });

  it("nach erfolgreicher Erneuerung verschwindet das Feld und der Knopf steht wieder", async () => {
    abschluss.mockResolvedValue({ ok: false, grund: "sitzung", text: "abgelaufen" });
    erneuere.mockResolvedValue({ ok: true, wert: null });
    await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    await click(ABSCHLIESSEN);
    await fill("[data-rolle='erneuern-code']", "482-137");
    await click("[data-rolle='erneuern-weiter']");
    expect(exists("[data-rolle='erneuern']")).toBe(false);
    expect(exists(ABSCHLIESSEN)).toBe(true);
  });

  it("eine gescheiterte Erneuerung zeigt ihren Text und LAESST das Feld stehen", async () => {
    abschluss.mockResolvedValue({ ok: false, grund: "sitzung", text: "abgelaufen" });
    erneuere.mockResolvedValue({
      ok: false, grund: "gesperrt",
      text: "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.",
    });
    await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    await click(ABSCHLIESSEN);
    await fill("[data-rolle='erneuern-code']", "000-000");
    await click("[data-rolle='erneuern-weiter']");
    expect(exists("[data-rolle='erneuern']")).toBe(true);
    expect(query("[data-rolle='erneuern-fehler']").textContent).toContain("unbekannt");
  });
});

describe("CheckFlow — Netz (Falle 62, Falle 66)", () => {
  it("ein geworfener Fehler zeigt den deutschen Netztext, NICHT `e.message`", async () => {
    // CheckFlow.tsx:158-159 faengt zwar, zeigt aber e.message — in Produktion
    // der englische Server-Components-Satz.
    abschluss.mockRejectedValue(new Error("fetch failed"));
    await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    await click(ABSCHLIESSEN);
    const t = query("[data-rolle='check-fehler']").textContent ?? "";
    expect(t).toBe(
      "Keine Verbindung. Der Check wurde nicht gespeichert — nichts ist verloren, " +
      "bitte erneut auf Abschließen tippen.",
    );
    expect(t).not.toContain("fetch failed");
  });

  it("ALLE sechs Client-Zustaende bleiben stehen", async () => {
    abschluss.mockRejectedValue(new Error("offline"));
    await mount(<CheckFlow fahrzeug={FZ} soll={[POS({ soll: 5 })]} geraete={[]} flaschen={[]}
                           verfall={{}} warn={WARN} />);
    for (let i = 0; i < 2; i++) await click("button[aria-label$='verringern']");
    await click(WEITER);
    await click(ABSCHLIESSEN);
    await click("[data-rolle='zurueck-zaehlen']");
    expect(query("[data-rolle='stepanzeige']").textContent).toBe("3");
  });
});

describe("CheckFlow — Bauform", () => {
  it("kennt genau EIN Fahrzeug — keine Woerterbuecher, keine `preselect`-Prop", () => {
    // §7.9.1: heute wandert die Soll-Bestueckung der GESAMTEN Organisation in
    // den RSC-Payload — auf ein privates Telefon, in einer Sitzung ohne Konto.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/preselect|Record<string, Pos\[\]>|fahrzeuge:/);
    expect(q).toMatch(/fahrzeug: \{ id: string/);
  });

  it("baut die Nutzlast NICHT selbst, sondern ueber `checkNutzlast` (Teil 3, T43)", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/from "\.\.\/_lib\/checkNutzlast"/);
    expect(q).toMatch(/checkNutzlast\(/);
  });

  it("benutzt KEIN `router.push` und KEIN `usePathname`", () => {
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/router\.(push|replace)|usePathname/);
  });

  it("ist eine Client-Insel ohne antd", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/^"use client";/m);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/CheckFlow.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./CheckFlow"`.

- [ ] **Schritt 3: `_ui/CheckFlow.tsx` schreiben**

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { LeerZustand } from "./LeerZustand";
import { checkAbschluss, type CheckAbschlussWert } from "../_actions/check";
import { erneuereSitzung } from "../_actions/sitzung";
import {
  checkNutzlast, zaehleAblaufende, GERAET_VORBELEGUNG,
  type CheckZaehlung, type CheckGeraetAntwort,
} from "../_lib/checkNutzlast";
import { verfallStatus, type VerfallSchwellen } from "../_lib/domain/verfall";
import { o2Status } from "../_lib/domain/o2";
import { chargeText, ampelTon } from "../_lib/format";
import { ZUSTAENDE, type Zustand } from "../_lib/konstanten";
import { NETZ_TEXT_CHECK, darfErneuern, type HelferGrund } from "../_lib/actionTypen";
import s from "./helfer.module.css";

/**
 * DER FAHRZEUG-CHECK — §7.9.
 *
 * ⚠️ DIE EINE STRUKTURAENDERUNG (Falle 15, §7.9.1): DIESE KOMPONENTE KENNT NUR
 * NOCH EIN FAHRZEUG. Heute reicht `helfer/check/page.tsx` vier
 * `Object.fromEntries(fahrzeuge.map(...))`-Woerterbuecher KOMPLETT herein
 * (`CheckFlow.tsx:50-58`) — damit wandert bei JEDEM Helfer-Aufruf die
 * Soll-Bestueckung, Geraeteliste, Flaschenliste und Verfallslage DER GESAMTEN
 * ORGANISATION in den RSC-Payload: auf ein PRIVATES Telefon, in einer Sitzung
 * OHNE Konto (§3.4.5). Die vier Woerterbuecher und `preselect` entfallen; die
 * Fahrzeugwahl wird eine NAVIGATION (`_ui/FahrzeugWahl.tsx`, T80).
 *
 * ⚠️ DIE NUTZLAST WIRD NICHT HIER GEBAUT, sondern von `checkNutzlast`
 * (Teil 3, T43). Das Verfallsfeld im Zaehlschritt und die Live-Vorschau
 * „{n} laufen ab" sind laut §12.1 DIE EINZIGE Absicherung ihrer Fachlichkeit —
 * `actions/check.test.ts:229` beweist nur, dass der Server richtig zaehlt,
 * WENN der Wert ankommt.
 *
 * ⚠️ DIE AMPEL WIRD IM CLIENT GERECHNET, und das ist keine Zeitzonenfrage mehr
 * (§7.9.3): `verfallStatus` rechnet ueber `monatsEnde()` aus `_lib/zeit.ts` und
 * ist ZONENEXPLIZIT. Ob die Funktion im Browser oder im Container laeuft,
 * aendert das Ergebnis nicht mehr — Chip im Zaehlschritt und Zahl in der
 * Abschlussmeldung koennen KONSTRUKTIV nicht auseinanderfallen.
 */

export type CheckPos = {
  id: string; fachLabel: string; artikelId: string; artikelName: string; einheit: string;
  handlagerFach: string; soll: number; fahrzeugBestand: number; handlagerBestand: number;
};
export type CheckGeraet = { id: string; typ: "medizin" | "objekt"; name: string };
export type CheckFlasche = {
  id: string; name: string; nennfuelldruckBar: number; letzterDruck: number | null;
};

type Phase = "zaehlen" | "nachfuellen" | "geraete" | "sauerstoff";
const PHASE_LABEL: Record<Phase, string> = {
  zaehlen: "Zählen", nachfuellen: "Nachfüllen", geraete: "Geräte", sauerstoff: "Sauerstoff",
};

/** Der Schritt-Kopf zeigt NUR die Schritte, die dieses Fahrzeug wirklich hat (1:1, `:28-39`). */
function Schritte({ folge, aktiv }: { folge: Phase[]; aktiv: Phase }) {
  const idx = folge.indexOf(aktiv);
  return (
    <div className={s.schritte}>
      {folge.map((p, i) => (
        <div
          key={p}
          className={`${s.schritt} ${i === idx ? s.schrittAktiv : i < idx ? s.schrittFertig : ""}`}
          data-rolle="schritt"
        >
          <span className={s.schrittNr}>{i + 1}</span> {PHASE_LABEL[p]}
        </div>
      ))}
    </div>
  );
}

const zustandTon = (z: Zustand) =>
  z === "In Ordnung" ? "ok" : z === "Gebrauchsspuren" ? "gelb" : "rot";

export function CheckFlow({
  fahrzeug, soll, geraete, flaschen, verfall, warn,
}: {
  fahrzeug: { id: string; name: string; kennung: string | null };
  soll: CheckPos[];
  geraete: CheckGeraet[];
  flaschen: CheckFlasche[];
  /** Beim letzten Check gemeldeter Verfall je artikelId („YYYY-MM"), leer = keine Angabe. */
  verfall: Record<string, string>;
  warn: VerfallSchwellen;
}) {
  // DIE SECHS CLIENT-ZUSTAENDE (1:1, `:62-71`). Sie bleiben bei JEDEM Fehler
  // stehen — das ist die tragende Zusage von §7.4.4 und §7.10.3.
  const [phase, setPhase] = useState<Phase>("zaehlen");
  const [ist, setIst] = useState<Record<string, number>>({});
  const [nachfuell, setNachfuell] = useState<Record<string, number>>({});
  const [geraeteState, setGeraeteState] = useState<Record<string, CheckGeraetAntwort>>({});
  const [druck, setDruck] = useState<Record<string, number>>({});
  const [verfallState, setVerfallState] = useState<Record<string, string>>({});

  const [ergebnis, setErgebnis] = useState<CheckAbschlussWert | null>(null);
  const [fehler, setFehler] = useState<{ text: string; grund: HelferGrund } | null>(null);
  const [erneuerungsCode, setErneuerungsCode] = useState("");
  const [erneuerungsFehler, setErneuerungsFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();

  const faecher = [...new Set(soll.map((p) => p.fachLabel))];

  // Default = Soll („voll annehmen, Gezaehltes runterkorrigieren", `:97`). Der
  // RECORDED Fahrzeugbestand wird bewusst NICHT als Per-Position-Default
  // benutzt: er ist pro ARTIKEL, nicht pro Fach, und derselbe Artikel in
  // mehreren Faechern wuerde sich vervielfachen (`:94-96`, §5.7.1).
  const istWert = (p: CheckPos) => ist[p.id] ?? p.soll;
  const nfWert = (p: CheckPos) => nachfuell[p.id] ?? 0;

  // Verfall haengt am ARTIKEL, nicht am Fach. Vorbelegt ist der beim letzten
  // Check gemeldete Wert; leeren heisst „keine Angabe" (`:100-109`).
  const verfallWert = (artikelId: string) => verfallState[artikelId] ?? verfall[artikelId] ?? "";

  // Anzeigereihenfolge Fach fuer Fach → je Artikel bekommt nur die ERSTE Zeile
  // das Eingabefeld. Zwei Felder fuer eine Angabe waeren nicht
  // auseinanderzuhalten (`:105-109`).
  const zaehlFolge = faecher.flatMap((f) => soll.filter((p) => p.fachLabel === f));
  const ersteZeile = new Map<string, string>();
  for (const p of zaehlFolge) if (!ersteZeile.has(p.artikelId)) ersteZeile.set(p.artikelId, p.id);

  const verfallChip = (wert: string) => {
    if (!wert) return null;
    const st = verfallStatus(wert, warn, new Date());
    return { ton: ampelTon(st.ampel), text: chargeText(st, wert) };
  };

  const hatArtikel = soll.length > 0;
  const schrittFolge: Phase[] = [
    ...(hatArtikel ? (["zaehlen", "nachfuellen"] as const) : []),
    ...(geraete.length > 0 ? (["geraete"] as const) : []),
    ...(flaschen.length > 0 ? (["sauerstoff"] as const) : []),
  ];
  const aktivePhase: Phase = schrittFolge.includes(phase) ? phase : (schrittFolge[0] ?? "zaehlen");
  const idx = schrittFolge.indexOf(aktivePhase);
  const istLetzter = idx === schrittFolge.length - 1;
  const naechste = schrittFolge[idx + 1];

  const geraetE = (id: string): CheckGeraetAntwort => geraeteState[id] ?? GERAET_VORBELEGUNG;
  const setGeraet = (id: string, patch: Partial<CheckGeraetAntwort>) =>
    setGeraeteState((v) => ({ ...v, [id]: { ...(v[id] ?? GERAET_VORBELEGUNG), ...patch } }));

  // Druck-Default = Nennfuelldruck („voll annehmen, Abgelesenes runterstellen", `:136-137`).
  const druckWert = (f: CheckFlasche) => druck[f.id] ?? f.nennfuelldruckBar;

  const zaehlung = (): CheckZaehlung => ({
    ist: Object.fromEntries(soll.map((p) => [p.id, istWert(p)])),
    nachfuell: Object.fromEntries(soll.map((p) => [p.id, nfWert(p)])),
    geraete: Object.fromEntries(geraete.map((g) => [g.id, geraetE(g.id)])),
    druck: Object.fromEntries(flaschen.map((f) => [f.id, druckWert(f)])),
    // NUR die GEAENDERTEN — ein fehlender Eintrag laesst die Angabe
    // unangetastet (`:152-155`).
    verfaelle: Object.fromEntries(
      Object.entries(verfallState)
        .filter(([artikelId, wert]) => wert !== (verfall[artikelId] ?? ""))
        .map(([artikelId, wert]) => [artikelId, wert || null]),
    ),
  });

  function abschliessen() {
    setFehler(null);
    start(async () => {
      try {
        const nutzlast = checkNutzlast({
          fahrzeugId: fahrzeug.id,
          positionen: soll.map((p) => ({ id: p.id, artikelId: p.artikelId, soll: p.soll })),
          geraete: geraete.map((g) => ({ id: g.id })),
          flaschen: flaschen.map((f) => ({ id: f.id, nennfuelldruckBar: f.nennfuelldruckBar })),
          z: zaehlung(),
        });
        const r = await checkAbschluss(nutzlast);
        if (!r.ok) { setFehler({ text: r.text, grund: r.grund }); return; }
        setErgebnis(r.wert);
      } catch {
        // FALLE 62/66: `CheckFlow.tsx:158-159` faengt zwar, zeigt aber
        // `e.message` — in Produktion der ENGLISCHE Server-Components-Satz.
        // ALLE SECHS ZUSTAENDE BLEIBEN STEHEN.
        setFehler({ text: NETZ_TEXT_CHECK, grund: "netz" });
      }
    });
  }

  function erneuern() {
    setErneuerungsFehler(null);
    start(async () => {
      try {
        const r = await erneuereSitzung(erneuerungsCode);
        if (!r.ok) { setErneuerungsFehler(r.text); return; }
        // Danach tippt die Helferin erneut auf „Abschliessen" (§7.4.4).
        setFehler(null);
        setErneuerungsCode("");
      } catch {
        setErneuerungsFehler(NETZ_TEXT_CHECK);
      }
    });
  }

  // ——— Fahrzeug ohne Soll, Geraet und Flasche ———
  if (schrittFolge.length === 0) {
    return (
      <>
        <div className={s.schirmKopf}>{fahrzeug.name}</div>
        <LeerZustand
          titel="Nichts zu prüfen"
          text={"Für dieses Fahrzeug ist weder ein Soll noch ein Gerät noch eine Sauerstoffflasche "
              + "hinterlegt. Die Verwaltung pflegt die Bestückung."}
          weg={{ href: "/helfer/check", text: "Anderes Fahrzeug" }}
        />
      </>
    );
  }

  // ——— Fertig ———
  if (ergebnis) {
    const alles = ergebnis.offen === 0 && ergebnis.geraeteAuffaellig === 0
      && ergebnis.flaschenAuffaellig === 0 && ergebnis.verfallAuffaellig === 0
      && ergebnis.flaschenNichtBewertbar === 0;
    return (
      <>
        <div className={s.schirmKopf}>{fahrzeug.name} · Fertig</div>
        <div className={`${s.karte} ${s.kartePad}`} data-rolle="check-ergebnis">
          <div className={s.zeileName}>Check abgeschlossen</div>
          <div className={s.zeileMeta}>
            {hatArtikel && <HelferChip ton="ok">{ergebnis.nachgefuellt} aus Handlager geholt</HelferChip>}
            {ergebnis.offen > 0 && <HelferChip ton="rot">{ergebnis.offen} fehlt weiterhin</HelferChip>}
            {ergebnis.geraeteAuffaellig > 0 &&
              <HelferChip ton="rot">{ergebnis.geraeteAuffaellig} Gerät(e) auffällig</HelferChip>}
            {ergebnis.flaschenAuffaellig > 0 &&
              <HelferChip ton="rot">{ergebnis.flaschenAuffaellig} Flasche(n) niedrig</HelferChip>}
            {ergebnis.flaschenNichtBewertbar > 0 &&
              <HelferChip ton="grau">{ergebnis.flaschenNichtBewertbar} Flasche(n) nicht bewertbar</HelferChip>}
            {ergebnis.verfallAuffaellig > 0 &&
              <HelferChip ton="gelb">{ergebnis.verfallAuffaellig} laufen ab</HelferChip>}
            {alles && <HelferChip ton="ok">Alles in Ordnung</HelferChip>}
          </div>

          {/*
            NEU (§7.9.4): `umlagerung` kappt STILL an der Verfuegbarkeit, und der
            Helfer hat die Teile IN DER HAND. Ohne diesen Satz legt er sie ins
            Fahrzeug und das Journal weiss es nicht.
          */}
          {ergebnis.nachgefuellt < ergebnis.nachfuellBestaetigt && (
            <p className={s.fussnote}>
              Von {ergebnis.nachfuellBestaetigt} bestätigten Teilen konnten nur{" "}
              {ergebnis.nachgefuellt} gebucht werden. Das Handlager war zwischenzeitlich leer —
              bitte der Verwaltung melden.
            </p>
          )}
          {ergebnis.offen > 0 && (
            <p className={s.fussnote}>
              Das Handlager hatte nicht genug. {ergebnis.offen} Teile fehlen weiterhin auf dem
              Fahrzeug – bitte der Verwaltung melden.
            </p>
          )}
          {ergebnis.geraeteAuffaellig > 0 && (
            <p className={s.fussnote}>Fehlende oder defekte Geräte bitte der Verwaltung melden.</p>
          )}
          {ergebnis.flaschenAuffaellig > 0 && (
            <p className={s.fussnote}>
              Flaschen mit niedrigem Druck bitte tauschen oder der Verwaltung melden.
            </p>
          )}
          {ergebnis.flaschenNichtBewertbar > 0 && (
            <p className={s.fussnote}>
              Für diese Flaschen ist kein Nennfülldruck hinterlegt – der Füllstand lässt sich nicht
              bewerten. Der abgelesene Druck wurde trotzdem gespeichert.
            </p>
          )}
          {ergebnis.verfallAuffaellig > 0 && (
            <p className={s.fussnote}>
              {ergebnis.verfallAuffaellig} Artikel im Fahrzeug laufen bald ab oder sind abgelaufen –
              bitte tauschen oder der Verwaltung melden.
            </p>
          )}
        </div>

        {/*
          ZWEI LINKS statt eines Zustandsresets ueber sieben Setter (`:210`,
          §7.9.1). Ein Seitenaufbau ist hier ohnehin gewollt — DIE BESTAENDE
          HABEN SICH GERADE GEAENDERT. AEUSSERE Pfade, beide.
        */}
        <Link className={`${s.knopf} ${s.knopfGeist}`} href={`/helfer/check?fz=${fahrzeug.id}`}
              data-rolle="nochmal">
          Nochmal dieses Fahrzeug
        </Link>
        <Link className={`${s.knopf} ${s.knopfGeist}`} href="/helfer/check" data-rolle="anderes">
          Anderes Fahrzeug
        </Link>
      </>
    );
  }

  /** Der Fehlerbereich am Abschluss — samt Inline-Erneuerung (§7.4.4). */
  const fehlerBereich = fehler && (
    <div className={`${s.karte} ${s.kartePad}`}>
      <div className={s.gateFehler} data-rolle="check-fehler" role="status">{fehler.text}</div>
      {darfErneuern(fehler.grund) && (
        <div data-rolle="erneuern">
          <p className={s.fussnote}>
            Kärtchen erneut eingeben — <b>die gezählten Mengen bleiben stehen.</b>
          </p>
          <div className={s.feldZeile}>
            <input
              className={s.codefeld}
              inputMode="numeric"
              autoComplete="off"
              maxLength={7}
              pattern="[0-9]{3}-?[0-9]{3}"
              placeholder="000-000"
              aria-label="Zugangs-Code"
              value={erneuerungsCode}
              onChange={(e) => setErneuerungsCode(e.target.value)}
              data-rolle="erneuern-code"
            />
            <button className={`${s.knopf} ${s.knopfTinte}`} type="button" disabled={laeuft}
                    onClick={erneuern} data-rolle="erneuern-weiter">
              Weiter
            </button>
          </div>
          {erneuerungsFehler && (
            <div className={s.gateFehler} data-rolle="erneuern-fehler">{erneuerungsFehler}</div>
          )}
        </div>
      )}
    </div>
  );

  // ——— Schritt: Zaehlen ———
  if (aktivePhase === "zaehlen") {
    const unterSoll = soll.filter((p) => istWert(p) < p.soll).length;
    const ablaufend = zaehleAblaufende(
      Object.fromEntries(soll.map((p) => [p.artikelId, verfallWert(p.artikelId) || null])),
      warn,
      new Date(),
    );

    const zurNachfuellung = () => {
      // Greedy je Artikel: die Handlager-Verfuegbarkeit ueber die Positionen
      // (Anzeige-Reihenfolge) verteilen, damit der Vorschlag nicht mehr
      // verspricht, als der Handlager hergibt (1:1, `:222-238`).
      const rest = new Map<string, number>();
      for (const p of soll) if (!rest.has(p.artikelId)) rest.set(p.artikelId, p.handlagerBestand);
      const nf: Record<string, number> = {};
      for (const p of soll) {
        const luecke = Math.max(0, p.soll - istWert(p));
        const uebrig = rest.get(p.artikelId) ?? 0;
        const nimm = Math.min(luecke, uebrig);
        nf[p.id] = nimm;
        rest.set(p.artikelId, uebrig - nimm);
      }
      setNachfuell(nf);
      setFehler(null);
      setPhase("nachfuellen");
    };

    return (
      <>
        <div className={s.schirmKopf}>
          {fahrzeug.name}{fahrzeug.kennung ? ` · ${fahrzeug.kennung}` : ""}
        </div>
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        <div className={`${s.karte} ${s.kartePad}`}>
          <div className={s.zeileName}>Wie viel liegt wirklich im Fahrzeug, und wie lange hält es?</div>
          <p className={s.fussnote}>
            Jede Position ist auf Soll vorbelegt – mit <b>−</b> runterzählen, was fehlt. Das
            Verfallsdatum kommt aus dem letzten Check und ist freiwillig: nur ändern, wenn auf der
            Packung ein anderes (das <b>früheste</b>) Datum steht. Leeren heißt „keine Angabe".
          </p>
        </div>

        <div data-rolle="zaehlliste">
          {faecher.map((fach) => (
            <div key={fach}>
              <div className={s.fachKopf}>{fach}</div>
              <div className={s.karte}>
                {soll.filter((p) => p.fachLabel === fach).map((p) => {
                  const wert = istWert(p);
                  const luecke = Math.max(0, p.soll - wert);
                  const ueber = wert > p.soll;
                  const vw = verfallWert(p.artikelId);
                  const vc = verfallChip(vw);
                  const traegtFeld = ersteZeile.get(p.artikelId) === p.id;
                  return (
                    <div className={s.zeile} key={p.id} style={{ alignItems: "flex-start" }}>
                      <div className={`${s.pruefKreis} ${luecke > 0 ? s.pruefKreisFehl : s.pruefKreisOk}`} />
                      <div className={s.zeileHaupt}>
                        <div className={s.zeileName}>{p.artikelName}</div>
                        <div className={s.zeileMeta}>
                          <span>Soll {p.soll} {p.einheit}</span>
                          {luecke > 0 && <HelferChip ton="rot">nachfüllen {luecke}</HelferChip>}
                          {ueber && <HelferChip ton="gelb">Überbestand {wert - p.soll}</HelferChip>}
                          {/* Der Chip steht in JEDER Zeile desselben Artikels —
                              deshalb faellt die Hinweiszeile bei Wiederholzeilen
                              ersatzlos weg (§7.7.2 Punkt 3). */}
                          {vc && <HelferChip ton={vc.ton}>{vc.text}</HelferChip>}
                        </div>
                        {traegtFeld && (
                          <div className={s.verfallZeile}>
                            {/* Natives <input type="month"> — kein antd-DatePicker
                                (§7.7.2 Punkt 4): die Klasse ist ohnehin ohne antd,
                                die native Monatsauswahl ist mit Handschuhen
                                einhaendig bedienbar, und es entfaellt jede
                                Dayjs-Umrechnung. `pattern` und `inputMode` sind der
                                Rueckfall fuer Browser, die `month` als Textfeld
                                rendern; die STRENGE selbst ist serverseitig
                                (MONAT_REGEX, §4.6). */}
                            <input
                              type="month"
                              inputMode="numeric"
                              pattern="\d{4}-\d{2}"
                              aria-label={`Verfall ${p.artikelName}`}
                              value={vw}
                              onChange={(e) =>
                                setVerfallState((v) => ({ ...v, [p.artikelId]: e.target.value }))}
                            />
                          </div>
                        )}
                      </div>
                      {/* max grosszuegig ueber Soll: echter Ueberbestand muss
                          zaehlbar sein, sonst korrigiert der Abgleich real
                          vorhandene Teile STILL heraus (`:293-294`). */}
                      <Stepper
                        noText
                        wert={wert}
                        min={0}
                        max={9999}
                        beschriftung={p.artikelName}
                        setWert={(v) => setIst((z) => ({ ...z, [p.id]: v }))}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {fehlerBereich}

        <div className={s.abschluss}>
          <div className={s.abschlussInfo} data-rolle="zaehl-summe">
            <b>{unterSoll === 0 ? "Alles auf Soll" : `${unterSoll} unter Soll`}</b>
            <div>
              {ablaufend > 0 && `${ablaufend} laufen ab · `}
              {unterSoll === 0 ? "Nichts nachzufüllen" : "Weiter zur Nachfüllung aus dem Handlager"}
            </div>
          </div>
          <button className={s.abschlussGo} type="button" onClick={zurNachfuellung} data-rolle="weiter">
            Weiter
          </button>
        </div>
      </>
    );
  }

  // ——— Schritt: Geraete ———
  if (aktivePhase === "geraete") {
    return (
      <>
        <div className={s.schirmKopf}>{fahrzeug.name} · Geräte</div>
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        {idx > 0 && (
          <button className={`${s.knopf} ${s.knopfGeist}`} type="button"
                  onClick={() => setPhase(schrittFolge[idx - 1])} data-rolle="zurueck-zaehlen">
            ← Zurück
          </button>
        )}
        <div className={`${s.karte} ${s.kartePad}`}>
          <div className={s.zeileName}>Sind die Geräte da und in Ordnung?</div>
          <p className={s.fussnote}>
            Alles ist auf <b>vorhanden · In Ordnung</b> vorbelegt – nur Abweichungen antippen.
          </p>
        </div>
        <div className={s.karte}>
          {geraete.map((g) => {
            const e = geraetE(g.id);
            return (
              <div className={s.zeile} key={g.id} style={{ alignItems: "flex-start" }}>
                <div className={s.zeileHaupt}>
                  <div className={s.zeileName}>{g.name}</div>
                  <div className={s.zeileMeta}>
                    <button type="button" onClick={() => setGeraet(g.id, { vorhanden: true })}>
                      <HelferChip ton={e.vorhanden ? "ok" : "grau"}>vorhanden</HelferChip>
                    </button>
                    <button type="button" onClick={() => setGeraet(g.id, { vorhanden: false })}>
                      <HelferChip ton={!e.vorhanden ? "rot" : "grau"}>fehlt</HelferChip>
                    </button>
                    {e.vorhanden && ZUSTAENDE.map((z) => (
                      <button key={z} type="button" onClick={() => setGeraet(g.id, { zustand: z })}>
                        <HelferChip ton={e.zustand === z ? zustandTon(z) : "grau"}>{z}</HelferChip>
                      </button>
                    ))}
                  </div>
                  <input
                    className={s.feld}
                    placeholder="Bemerkung (optional)"
                    aria-label={`Bemerkung ${g.name}`}
                    value={e.bemerkung ?? ""}
                    onChange={(ev) => setGeraet(g.id, { bemerkung: ev.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {fehlerBereich}

        <div className={s.abschluss}>
          <div className={s.abschlussInfo}>
            <b>{geraete.length} Gerät(e)</b>
            <div>{istLetzter ? "Quittieren schließt den Check ab" : `Weiter zu ${PHASE_LABEL[naechste]}`}</div>
          </div>
          {istLetzter ? (
            <button className={s.abschlussGo} type="button" disabled={laeuft} onClick={abschliessen}
                    data-rolle="abschliessen">Abschließen</button>
          ) : (
            <button className={s.abschlussGo} type="button" onClick={() => setPhase(naechste)}
                    data-rolle="weiter">Weiter</button>
          )}
        </div>
      </>
    );
  }

  // ——— Schritt: Sauerstoff ———
  if (aktivePhase === "sauerstoff") {
    const niedrig = flaschen.filter(
      (f) => f.nennfuelldruckBar > 0 && o2Status(druckWert(f), f.nennfuelldruckBar).niedrig,
    ).length;
    return (
      <>
        <div className={s.schirmKopf}>{fahrzeug.name} · Sauerstoff</div>
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        {idx > 0 && (
          <button className={`${s.knopf} ${s.knopfGeist}`} type="button"
                  onClick={() => setPhase(schrittFolge[idx - 1])} data-rolle="zurueck-zaehlen">
            ← Zurück
          </button>
        )}
        <div className={`${s.karte} ${s.kartePad}`}>
          <div className={s.zeileName}>Welchen Druck zeigt das Manometer?</div>
          <p className={s.fussnote}>
            Jede Flasche ist auf den Nennfülldruck vorbelegt – mit <b>−</b> auf den abgelesenen Wert
            runterstellen.
          </p>
        </div>
        <div className={s.karte}>
          {flaschen.map((f) => {
            const wert = druckWert(f);
            // Ohne bekannten Nennfuelldruck ist der Fuellstand NICHT BEWERTBAR
            // (§5.12) — `o2Status` gaebe hier „rot / niedrig" zurueck, und die
            // Helferin liefe los, um eine VOLLE Flasche zu tauschen.
            const st = f.nennfuelldruckBar > 0 ? o2Status(wert, f.nennfuelldruckBar) : null;
            return (
              <div className={s.zeile} key={f.id}>
                <div className={`${s.pruefKreis} ${st?.niedrig ? s.pruefKreisFehl : s.pruefKreisOk}`} />
                <div className={s.zeileHaupt}>
                  <div className={s.zeileName}>{f.name}</div>
                  <div className={s.zeileMeta}>
                    {f.nennfuelldruckBar > 0
                      ? <span>Nennfülldruck {f.nennfuelldruckBar} bar</span>
                      : <span>Nennfülldruck nicht hinterlegt</span>}
                    {st
                      ? <HelferChip ton={ampelTon(st.ampel)}>{st.prozent}%</HelferChip>
                      : <HelferChip ton="grau">nicht bewertbar</HelferChip>}
                    {st?.niedrig && <HelferChip ton="rot">niedrig</HelferChip>}
                  </div>
                </div>
                {/* max grosszuegig ueber Nennfuelldruck: eine ueberfuellte
                    Flasche muss ablesbar bleiben (`:401`). */}
                <Stepper
                  wert={wert}
                  min={0}
                  max={9999}
                  beschriftung={`Druck ${f.name}`}
                  setWert={(v) => setDruck((z) => ({ ...z, [f.id]: v }))}
                />
              </div>
            );
          })}
        </div>

        {fehlerBereich}

        <div className={s.abschluss}>
          <div className={s.abschlussInfo}>
            <b>{niedrig === 0 ? `${flaschen.length} Flasche(n)` : `${niedrig} niedrig`}</b>
            <div>Bestätigen schließt den Check ab</div>
          </div>
          <button className={s.abschlussGo} type="button" disabled={laeuft} onClick={abschliessen}
                  data-rolle="abschliessen">Abschließen</button>
        </div>
      </>
    );
  }

  // ——— Schritt: Nachfuellen ———
  const knappheit = new Map<string, { verfuegbar: number; gewuenscht: number }>();
  for (const p of soll) {
    const e = knappheit.get(p.artikelId) ?? { verfuegbar: p.handlagerBestand, gewuenscht: 0 };
    e.gewuenscht += nfWert(p);
    knappheit.set(p.artikelId, e);
  }
  const nfPositionen = soll.filter((p) => Math.max(0, p.soll - istWert(p)) > 0);
  const summe = soll.reduce((z, p) => z + nfWert(p), 0);

  return (
    <>
      <div className={s.schirmKopf}>{fahrzeug.name}</div>
      <Schritte folge={schrittFolge} aktiv={aktivePhase} />
      <button className={`${s.knopf} ${s.knopfGeist}`} type="button"
              onClick={() => setPhase("zaehlen")} data-rolle="zurueck-zaehlen">
        ← Zurück zum Zählen
      </button>

      {nfPositionen.length === 0 ? (
        <div className={`${s.karte} ${s.kartePad}`}>
          Nichts nachzufüllen – alle Positionen sind auf Soll. Du kannst{" "}
          {istLetzter ? "den Check direkt abschließen" : "direkt weiter"}.
        </div>
      ) : (
        <>
          <div className={`${s.karte} ${s.kartePad}`}>
            <div className={s.zeileName}>Aus dem Handlager aufs Fahrzeug legen</div>
            <p className={s.fussnote}>
              Hol die Teile aus dem angegebenen Handlager-Fach und stell mit <b>+/−</b> ein, wie
              viele du <b>wirklich</b> geholt hast.
            </p>
          </div>
          <div className={s.karte} data-rolle="nf-liste">
            {nfPositionen.map((p) => {
              const luecke = Math.max(0, p.soll - istWert(p));
              return (
                <div className={s.nfZeile} key={p.id}>
                  <div className={s.zeileHaupt}>
                    <div className={s.zeileName}>{p.artikelName}</div>
                    <div className={s.zeileMeta}>
                      <span className={s.fach}>{p.handlagerFach}</span>
                      <span>Lücke {luecke} · im Handlager {p.handlagerBestand}</span>
                    </div>
                  </div>
                  <div className={s.nfGeholt}>
                    {/* `max={luecke}`: der Helfer stellt ein, was er WIRKLICH
                        geholt hat — die Buchung folgt der Wirklichkeit, nicht
                        dem Vorschlag (`:461`). */}
                    <Stepper
                      noText
                      wert={nfWert(p)}
                      min={0}
                      max={luecke}
                      beschriftung={`geholt ${p.artikelName}`}
                      setWert={(v) => setNachfuell((z) => ({ ...z, [p.id]: v }))}
                    />
                    <small>geholt</small>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {[...knappheit.values()].some((e) => e.gewuenscht > e.verfuegbar) && (
        <div className={`${s.karte} ${s.kartePad}`} data-rolle="nf-knappheit">
          <HelferChip ton="gelb">
            Handlager reicht nicht für alle Positionen – es wird nur gebucht, was verfügbar ist.
          </HelferChip>
        </div>
      )}

      {fehlerBereich}

      <div className={s.abschluss}>
        <div className={s.abschlussInfo}>
          <b>{summe} Teile aufs Fahrzeug</b>
          <div>
            {istLetzter ? `Bestätigen bucht Handlager → ${fahrzeug.name}` : `Weiter zu ${PHASE_LABEL[naechste]}`}
          </div>
        </div>
        {istLetzter ? (
          <button className={s.abschlussGo} type="button" disabled={laeuft} onClick={abschliessen}
                  data-rolle="abschliessen">Gelegt &amp; abschließen</button>
        ) : (
          <button className={s.abschlussGo} type="button" onClick={() => setPhase(naechste)}
                  data-rolle="weiter">Weiter</button>
        )}
      </div>
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/CheckFlow.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
git add src/app/m/lagerbuch/_ui/CheckFlow.tsx src/app/m/lagerbuch/_ui/CheckFlow.test.tsx
git commit -m "feat(lagerbuch): _ui/CheckFlow.tsx — ein Fahrzeug statt der ganzen Organisation

Falle 15, die eine Strukturaenderung des Kapitels: heute reicht die Seite vier
Object.fromEntries-Woerterbuecher komplett an die Client-Komponente — damit
wandert bei JEDEM Helfer-Aufruf die Soll-Bestueckung, Geraeteliste,
Flaschenliste und Verfallslage der GESAMTEN Organisation in den RSC-Payload:
auf ein privates Telefon, in einer Sitzung ohne Konto. Die vier Woerterbuecher
und preselect entfallen; die Fahrzeugwahl wird eine Navigation.

1:1 bleiben: adaptive Schrittfolge mit Commit im letzten Schritt, Vorbelegung
auf Soll, Verfall am Artikel mit Feld nur in der ersten Zeile, nur Geaendertes
senden, greedy Nachfuellvorschlag an der Handlager-Verfuegbarkeit gedeckelt,
max={luecke} beim Geholten, Geraete auf 'vorhanden · In Ordnung',
Flaschen auf Nennfuelldruck.

Neu: die Hinweiszeile bei Wiederholzeilen faellt weg (der Chip traegt die
Angabe in jeder Zeile), 'Weiterer Check' wird zu zwei Links statt sieben
Settern, die Nutzlast baut checkNutzlast (Teil 3), die Inline-Erneuerung
erscheint nur bei grund='sitzung', und der catch zeigt den deutschen Netztext
statt e.message — in Produktion waere das der englische
Server-Components-Satz.

Flaschen ohne Nennfuelldruck sind 'nicht bewertbar', nicht 'niedrig': sonst
liefe die Helferin los, um eine VOLLE Flasche zu tauschen."
```

---

### Task 80: `_ui/FahrzeugWahl.tsx` — die Wahl wird eine Navigation

**Files:**
- Create: `src/app/m/lagerbuch/_ui/FahrzeugWahl.tsx`
- Test: `src/app/m/lagerbuch/_ui/FahrzeugWahl.test.tsx`

**Interfaces:**
- Consumes: `_ui/helfer.module.css` (T64).
- Produces:
  ```tsx
  // _ui/FahrzeugWahl.tsx — KEIN "use client": eine Server Component
  export function FahrzeugWahl(props: {
    fahrzeuge: { id: string; name: string; kennung: string | null }[];
  }): JSX.Element;
  ```
  **Einziger Konsument:** `helfer/check/page.tsx` (T85).

**Warum eine eigene Datei und keine Inline-Definition** (E5). Sie steht im Code von §7.9.1
(`<FahrzeugWahl fahrzeuge={…} />`), aber in **keiner** Dateiliste. Als Inline-Definition in
`helfer/check/page.tsx` wäre sie testbar nur über die **ganze Seite** — und die braucht eine
Datenbank.

**Warum ein `<Link>` und kein `useState`-Umschalter** (§7.9.1). Heute ist die Wahl ein
`useState`-Umschalter **in der Client-Komponente** (`CheckFlow.tsx:75-87`), und genau das erzwingt,
dass **alle** Fahrzeuge im Payload liegen. Als Navigation ist die Wahl **adressierbar, teilbar und im
Verlauf zurücknavigierbar** — und die Seite lädt nur noch **ein** Fahrzeug.

⚠️ **`href` ist ein ÄUSSERER Pfad** (`/helfer/check?fz=<id>`) — derselbe, den `tokenZielPfad` für
einen Fahrzeug-Code erzeugt (§7.2.5). Ein innerer würde doppelt präfixiert.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/FahrzeugWahl.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { FahrzeugWahl } from "./FahrzeugWahl";

const QUELLE = "src/app/m/lagerbuch/_ui/FahrzeugWahl.tsx";
const FZ = [
  { id: "fz-1", name: "RTW 1", kennung: "HH-DR 1234" },
  { id: "fz-2", name: "MTW", kennung: null },
];

afterEach(async () => { await unmount(); });

describe("FahrzeugWahl", () => {
  it("rendert je Fahrzeug einen LINK, keinen Knopf", async () => {
    // Heute ein useState-Umschalter in der Client-Komponente
    // (CheckFlow.tsx:75-87) — und genau das erzwingt, dass ALLE Fahrzeuge im
    // Payload liegen. Als Navigation ist die Wahl adressierbar, teilbar und im
    // Verlauf zuruecknavigierbar.
    await mount(<FahrzeugWahl fahrzeuge={FZ} />);
    expect(queryAll("a").length).toBe(2);
    expect(queryAll("button").length).toBe(0);
  });

  it("die href sind AEUSSERE Pfade mit `?fz=`", async () => {
    // Derselbe Pfad, den `tokenZielPfad` fuer einen Fahrzeug-Code erzeugt
    // (§7.2.5). Ein innerer wuerde doppelt praefixiert.
    await mount(<FahrzeugWahl fahrzeuge={FZ} />);
    expect(queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href")))
      .toEqual(["/helfer/check?fz=fz-1", "/helfer/check?fz=fz-2"]);
  });

  it("zeigt die Kennung, wenn es eine gibt — und schweigt sonst", async () => {
    await mount(<FahrzeugWahl fahrzeuge={FZ} />);
    const zeilen = queryAll("a");
    expect(zeilen[0].textContent).toContain("HH-DR 1234");
    expect(zeilen[1].textContent).toBe("MTW");
  });

  it("kodiert eine ID mit Sonderzeichen", async () => {
    // nanoid nutzt `-` und `_`; beides ist URL-sicher. Ein importierter
    // Alt-Bestand kann aber andere IDs tragen, und ein rohes `?fz=a b` erzeugt
    // eine kaputte URL.
    await mount(<FahrzeugWahl fahrzeuge={[{ id: "a b&c", name: "X", kennung: null }]} />);
    expect(query<HTMLAnchorElement>("a").getAttribute("href"))
      .toBe("/helfer/check?fz=a%20b%26c");
  });

  it("ist eine Server Component ohne antd", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/"use client"/);
    expect(q).not.toMatch(/useState|from "antd|@ant-design\/icons|lucide-react/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/FahrzeugWahl.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./FahrzeugWahl"`.

- [ ] **Schritt 3: `_ui/FahrzeugWahl.tsx` schreiben**

```tsx
import Link from "next/link";
import s from "./helfer.module.css";

/**
 * DIE FAHRZEUGWAHL ALS NAVIGATION — §7.9.1, E5.
 *
 * KEIN "use client": eine Server Component mit einem `<Link>` je Fahrzeug.
 * Heute ist die Wahl ein `useState`-Umschalter IN der Client-Komponente
 * (`CheckFlow.tsx:75-87`), und genau das erzwingt, dass ALLE Fahrzeuge im
 * RSC-Payload liegen — mit ihrer Soll-Bestueckung, Geraeteliste, Flaschenliste
 * und Verfallslage, auf einem privaten Telefon (§3.4.5).
 *
 * Als Navigation ist die Wahl ADRESSIERBAR, TEILBAR und im Verlauf
 * ZURUECKNAVIGIERBAR — und die Seite laedt danach nur noch EIN Fahrzeug.
 *
 * ⚠️ `href` ist ein AEUSSERER Pfad — derselbe, den `tokenZielPfad` fuer einen
 * Fahrzeug-Code erzeugt (§7.2.5). Ein innerer wuerde auf dem aeusseren Host
 * doppelt praefixiert (Falle 63).
 */
export function FahrzeugWahl({
  fahrzeuge,
}: {
  fahrzeuge: { id: string; name: string; kennung: string | null }[];
}) {
  return (
    <>
      <div className={s.schirmKopf}>Fahrzeug wählen</div>
      <div className={s.karte}>
        {fahrzeuge.map((f) => (
          <Link
            className={s.zeile}
            key={f.id}
            // `encodeURIComponent`: nanoid benutzt `-` und `_` und waere
            // unkritisch, aber ein importierter Alt-Bestand kann andere IDs
            // tragen — und ein rohes `?fz=a b` erzeugt eine kaputte URL.
            href={`/helfer/check?fz=${encodeURIComponent(f.id)}`}
          >
            <div className={s.zeileHaupt}>
              <div className={s.zeileName}>{f.name}</div>
              {f.kennung && <div className={s.zeileMeta}>{f.kennung}</div>}
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/FahrzeugWahl.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_ui/FahrzeugWahl.tsx src/app/m/lagerbuch/_ui/FahrzeugWahl.test.tsx
git commit -m "feat(lagerbuch): _ui/FahrzeugWahl.tsx — die Wahl wird eine Navigation

Heute ein useState-Umschalter in der Client-Komponente, und genau das erzwingt,
dass ALLE Fahrzeuge im RSC-Payload liegen. Als <Link> ist die Wahl
adressierbar, teilbar und im Verlauf zuruecknavigierbar — und die Seite laedt
danach nur noch ein Fahrzeug.

Eigene Datei statt Inline-Definition (E5): inline in helfer/check/page.tsx
waere sie nur ueber die ganze Seite testbar, und die braucht eine Datenbank.

href ist ein AEUSSERER Pfad, derselbe, den tokenZielPfad fuer einen
Fahrzeug-Code erzeugt. Die ID wird kodiert — nanoid waere unkritisch, ein
importierter Alt-Bestand kann andere IDs tragen."
```

---

**Gate Stufe 6.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 7 — Die vierzehn Routen (6 Tasks, alle parallel)

Hier entstehen **14 der 36 Routen** des Moduls (Teil 6, §2.1): das Gate, `/t/<code>`, `/a/<id>`,
`/helfer`, `/helfer/check` und die fünf PWA-Handler; `helfer/layout.tsx` ist keine Route, trägt aber
den Riegel.

⚠️ **VORBEDINGUNG DIESER WELLE: Teil 5, T114 (`_actions/buchung.ts`) ist eingecheckt** — §6.3,
Auflage A2. T83 importiert `bucheEntnahmeHelfer` von dort, und die Datei gehört vollständig Teil 5
(H7, E10). **T114 hat keine Teil-4-Abhängigkeit** — sie hängt nur an Teil 2
(`requireHelferSchreibend`) und Teil 3 (`fefoAbbuchung`, `umlagerung`) — und wird deshalb
**vorgezogen.** Das ist eine **Ablaufanweisung, kein Dateianspruch**: die Eigentümerschaft bleibt bei
Teil 5, und **eine zweite `_actions/buchung.ts` entsteht in keinem Fall.**

⚠️ **T114 wird in der Form aus A1 gebaut** (§6.3): `HelferErgebnis<{gebucht:number}>`, und
`gebucht === 0` ist `{ok:false, grund:"leer"}`. Die heute in teil5.md geschriebene Fassung liefert
dort `{ok:true, wert:{gebucht:0}}` — **genau der Zustand, den §7.3 als teuersten der Tabelle
benennt.**

⚠️ **Das ist die einzige Reihenfolgebindung dieses Plans nach außen**; sie liegt in **T83** und
nirgends sonst.

---

### Task 81: `page.tsx` — das Gate auf der Modulwurzel

**Files:**
- Create: `src/app/m/lagerbuch/page.tsx`
- Test: `src/app/m/lagerbuch/page.test.tsx`

**Interfaces:**
- Consumes: `_lib/host.ts` (Teil 1, T10) — `requireLagerbuchHost`; `_lib/zugang.ts` (Teil 2, T23) —
  `viewerOderNull`, `istLagerbuchAdmin`, `adminLandingPfad`, **`verwaltungsZiel`**;
  `_lib/absender.ts` (Teil 2, T16) —
  `absenderAus`; `_lib/gateSchranke.ts` (Teil 2, T24) — `gateGesperrt`; `_lib/gateTexte.ts`
  (Teil 2, T18) — `gateMeldung`; `_lib/returnTo.ts` (Teil 2, T19) — `sanitizeReturnTo`;
  `_ui/OeffentlicherRahmen.tsx` (T69); `_ui/Gate.tsx` (T77).
- Produces: die äußere Route **`/`** (innerer Pfad `/m/lagerbuch`). Außer `default` und `dynamic`
  **kein** Export.

**Der Rumpf ist in §7.2.4 vollständig vorgegeben, und die Reihenfolge ist BINDEND.** Er ist zugleich
die Aufrufstelle, die `adminLandingPfad` bisher **nicht hatte** (§3.6.6), und der Leser der
Sekundenzahl aus §3.5.3 — **beide Fragen werden hier und nur hier beantwortet.**

⚠️ **`istLagerbuchAdmin(await viewerOderNull())` ist ein PRÄDIKAT, kein Riegel** (§3.2.1).
`requireLagerbuchAdmin()` wäre hier **falsch**: es würfe jede Person **ohne** Sitzung nach `/login` —
also genau die Helferin, für die diese Seite gebaut ist. **Drei gültige Fälle, nicht einer.**

⚠️ **Angemeldet, aber OHNE Lagerbuch-Gruppe:** bleibt bewusst hier stehen und sieht Zahlenfeld
**und** Verwaltungsknopf — der hingenommene Preis aus §11.7.

⚠️ **Die Sekundenzahl steht NICHT in der URL.** Drei Gründe, und der dritte trägt: eine Zahl in der
URL ist beim ersten Neuladen **gelogen**; ein `searchParams`-Wert ist Nutzereingabe und müsste ohnehin
verworfen werden; und diese Seite hat **dieselben Absender-Kopfzeilen** wie die eben abgewiesene
Anfrage — sie fragt die Schranke mit demselben Schlüssel und bekommt dieselbe Antwort, **ohne dass
irgendetwas transportiert werden muss.** Der Aufruf steht **hinter** dem Host-Riegel und liest
`await headers()`; er **liest nur** und bucht nichts.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/page.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const QUELLE = "src/app/m/lagerbuch/page.tsx";

let kopfzeilen = new Headers({ host: "lagerbuch.localtest.me" });
const umleitungen: string[] = [];

vi.mock("next/headers", () => ({ headers: async () => kopfzeilen }));
vi.mock("next/navigation", () => ({
  redirect: (z: string) => { umleitungen.push(z); throw new Error("NEXT_REDIRECT"); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

const viewer = vi.fn<() => Promise<unknown>>(async () => null);
const istAdmin = vi.fn(() => false);
vi.mock("./_lib/zugang", () => ({
  viewerOderNull: () => viewer(),
  istLagerbuchAdmin: (v: unknown) => istAdmin(v as never),
  adminLandingPfad: (r: string | undefined) => (r ? `ADMIN:${r}` : "ADMIN:/verwaltung"),
  verwaltungsZiel: () => "https://lagerbuch.iuk-ue.de/verwaltung",
}));

const gateGesperrt = vi.fn<(a: string) => number | null>(() => null);
vi.mock("./_lib/gateSchranke", () => ({
  gateGesperrt: (a: string) => gateGesperrt(a),
  gateFehlversuchBuchen: () => { throw new Error("Die Gate-SEITE darf NICHT buchen"); },
}));

vi.mock("./_ui/Gate", () => ({
  Gate: (p: { meldung: string | null; returnTo: string; verwaltungsLink: string }) =>
    <div data-rolle="gate" data-meldung={p.meldung ?? ""} data-returnto={p.returnTo}
         data-verwaltung={p.verwaltungsLink} />,
}));

import GatePage from "./page";
import { mount, unmount, query } from "@/app/m/qr/_lib/test-dom";

beforeEach(() => {
  kopfzeilen = new Headers({ host: "lagerbuch.localtest.me" });
  umleitungen.length = 0;
  viewer.mockResolvedValue(null);
  istAdmin.mockReturnValue(false);
  gateGesperrt.mockReturnValue(null);
});
afterEach(async () => { await unmount(); vi.clearAllMocks(); });

async function rendere(sp: Record<string, string> = {}) {
  await mount(await GatePage({ searchParams: Promise.resolve(sp) }));
}

describe("Gate-Seite — die bindende Reihenfolge (§7.2.4)", () => {
  it("Schritt 1: der Host-Riegel ist die ERSTE Anweisung", async () => {
    kopfzeilen = new Headers({ host: "feedback.localtest.me" });
    await expect(GatePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    // Weder die Sitzung noch die Schranke wurden gefragt.
    expect(viewer).not.toHaveBeenCalled();
    expect(gateGesperrt).not.toHaveBeenCalled();
  });

  it("Schritt 2: ein Admin wird umgeleitet — mit `returnTo`", async () => {
    istAdmin.mockReturnValue(true);
    await expect(GatePage({ searchParams: Promise.resolve({ returnTo: "/a/art-9" }) }))
      .rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["ADMIN:/a/art-9"]);
  });

  it("eine Person OHNE Sitzung wird NICHT nach /login geworfen — Praedikat, kein Riegel", async () => {
    // `requireLagerbuchAdmin()` waere hier falsch: es wuerfe genau die
    // Helferin weg, fuer die diese Seite gebaut ist (§3.2.1). Drei gueltige
    // Faelle, nicht einer.
    await rendere();
    expect(umleitungen).toEqual([]);
    expect(query("[data-rolle='gate']")).toBeTruthy();
  });

  it("angemeldet OHNE Lagerbuch-Gruppe bleibt stehen und sieht BEIDE Karten", async () => {
    // Der hingenommene Preis aus §11.7.
    viewer.mockResolvedValue({ sub: "u1", groups: [], name: null, email: null });
    istAdmin.mockReturnValue(false);
    await rendere();
    expect(umleitungen).toEqual([]);
    expect(query("[data-rolle='gate']").getAttribute("data-verwaltung")).toBeTruthy();
  });
});

describe("Gate-Seite — der Verwaltungslink wird SERVERSEITIG gebaut (§3.6.6)", () => {
  it("ohne `returnTo`: /login mit dem absoluten `verwaltungsZiel()`", async () => {
    // Das Ziel MUSS absolut und auf einen der Suite bekannten Host zeigen: ein
    // relatives `/m/lagerbuch/verwaltung` setzte die verwaltende Person auf dem
    // PORTAL-Host ab, weil AUTH_URL suiteweit derselbe Wert ist
    // (core/auth/redirect.ts:8-18).
    await rendere();
    expect(query("[data-rolle='gate']").getAttribute("data-verwaltung"))
      .toBe("/login?callbackUrl=https%3A%2F%2Flagerbuch.iuk-ue.de%2Fverwaltung");
  });

  it("mit `returnTo`: das Rueckziel liegt auf DEMSELBEN Host wie `verwaltungsZiel()`", async () => {
    // Ein gescanntes Regaletikett fuehrt ausgeloggte Admins nach dem Login
    // zurueck auf den Artikel; a/[artikelId]/page.tsx leitet sie dann in die
    // Verwaltung (cordon.ts:44-46). Der Host wird NICHT geraten, sondern aus
    // `verwaltungsZiel()` uebernommen.
    await rendere({ returnTo: "/a/art-9" });
    expect(query("[data-rolle='gate']").getAttribute("data-verwaltung"))
      .toBe("/login?callbackUrl=https%3A%2F%2Flagerbuch.iuk-ue.de%2Fa%2Fart-9");
  });

  it("ein feindliches `returnTo` faellt auf das Verwaltungsziel zurueck", async () => {
    await rendere({ returnTo: "//boese.example/x" });
    expect(query("[data-rolle='gate']").getAttribute("data-verwaltung"))
      .toBe("/login?callbackUrl=https%3A%2F%2Flagerbuch.iuk-ue.de%2Fverwaltung");
  });
});

describe("Gate-Seite — der gelesene Fehlerparameter (Falle 60)", () => {
  it("`?grund=code` wird zum fertigen Satz", async () => {
    await rendere({ grund: "code" });
    expect(query("[data-rolle='gate']").getAttribute("data-meldung"))
      .toBe("Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.");
  });

  it("`?grund=zuviele` liest die Sekundenzahl SELBST aus der Schranke", async () => {
    // Sie steht NICHT in der URL: eine Zahl dort ist beim ersten Neuladen
    // gelogen, ein searchParams-Wert ist Nutzereingabe, und diese Seite hat
    // DIESELBEN Absender-Kopfzeilen wie die eben abgewiesene Anfrage.
    gateGesperrt.mockReturnValue(42);
    await rendere({ grund: "zuviele" });
    expect(query("[data-rolle='gate']").getAttribute("data-meldung"))
      .toBe("Zu viele Fehlversuche. Bitte in 42 Sekunden erneut versuchen.");
  });

  it("ist die Sperre inzwischen abgelaufen, kommt der Satz OHNE Zahl", async () => {
    gateGesperrt.mockReturnValue(null);
    await rendere({ grund: "zuviele" });
    expect(query("[data-rolle='gate']").getAttribute("data-meldung"))
      .toBe("Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen.");
  });

  it("ein UNBEKANNTER Wert wird ignoriert, die Seite rendert normal", async () => {
    await rendere({ grund: "<script>" });
    expect(query("[data-rolle='gate']").getAttribute("data-meldung")).toBe("");
  });

  it("die Seite BUCHT nichts — sie liest nur", async () => {
    // `gateFehlversuchBuchen` wirft im Mock. Ein Aufruf hier machte das
    // Neuladen des Gates zu einem Fehlversuch, und eine gesperrte Person kaeme
    // durch bloszes Warten nie wieder herein.
    await rendere({ grund: "zuviele" });
    expect(gateGesperrt).toHaveBeenCalledTimes(1);
  });
});

describe("Gate-Seite — returnTo", () => {
  it("wird sanitiert durchgereicht", async () => {
    await rendere({ returnTo: "/a/art-9" });
    expect(query("[data-rolle='gate']").getAttribute("data-returnto")).toBe("/a/art-9");
  });

  it("ein feindliches `returnTo` kommt als leerer String an", async () => {
    await rendere({ returnTo: "//boese.example/x" });
    expect(query("[data-rolle='gate']").getAttribute("data-returnto")).toBe("");
  });
});

describe("Bauform", () => {
  it("exportiert NUR `default` und `dynamic`", () => {
    const q = readFileSync(QUELLE, "utf8");
    const namen = [...q.matchAll(/^export (?:const|async function|function) (\w+)/gm)].map((m) => m[1]);
    expect(namen).toEqual(["dynamic"]);
    expect(q).toMatch(/^export default async function/m);
  });

  it("ist `force-dynamic` — sie liest Kopfzeilen und die Sitzung", () => {
    expect(readFileSync(QUELLE, "utf8")).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("benutzt `istLagerbuchAdmin`, NICHT `requireLagerbuchAdmin`", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/istLagerbuchAdmin/);
    expect(q).not.toMatch(/requireLagerbuchAdmin|moduleAdminPageOrNotFound|isModuleAdmin/);
  });

  it("traegt KEINEN `viewport`-Export — der gehoert der Suite", () => {
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/export const viewport/);
  });

  it("liest KEINE Env-Variable — der Host kommt aus `verwaltungsZiel()`", () => {
    // Ein `process.env.POCKET_ID_ISSUER` oder ein geratener Host waere eine
    // ZWEITE Antwort auf eine Frage, die `verwaltungsZiel()` (Teil 2, T23) und
    // die Suite-Anmeldeseite schon beantworten.
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/process\.env/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/page.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./page"`.

- [ ] **Schritt 3: `page.tsx` schreiben**

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireLagerbuchHost } from "./_lib/host";
import {
  viewerOderNull, istLagerbuchAdmin, adminLandingPfad, verwaltungsZiel,
} from "./_lib/zugang";
import { absenderAus } from "./_lib/absender";
import { gateGesperrt } from "./_lib/gateSchranke";
import { gateMeldung } from "./_lib/gateTexte";
import { sanitizeReturnTo } from "./_lib/returnTo";
import { OeffentlicherRahmen } from "./_ui/OeffentlicherRahmen";
import { Gate } from "./_ui/Gate";

/**
 * DAS GATE — §7.2.4. Die Reihenfolge im Rumpf ist BINDEND.
 *
 * Es liegt auf der MODULWURZEL, nicht unter `/gate` — 1:1-Pflicht, weil jedes
 * `returnTo` und jeder Rueckfall der Cordon-Logik dorthin zeigt
 * (`cordon.ts:17,65`). Es ist zugleich die einzige Datei, die auf
 * `/m/lagerbuch` aufloest (§2.1 b).
 */
export const dynamic = "force-dynamic";

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; grund?: string }>;
}) {
  const kopf = await headers();
  requireLagerbuchHost(kopf);                         // §2.6 — erste Anweisung
  const { returnTo, grund } = await searchParams;

  // PRAEDIKAT, KEIN RIEGEL (§3.2.1). `requireLagerbuchAdmin()` waere hier
  // falsch: es wuerfe jede Person OHNE Sitzung nach `/login` — also genau die
  // Helferin, fuer die diese Seite gebaut ist. DREI GUELTIGE FAELLE, NICHT
  // EINER:
  //   1. keine Sitzung        → Gate (der Regelfall)
  //   2. angemeldet + Gruppe  → Verwaltung
  //   3. angemeldet OHNE Gruppe → bleibt HIER stehen und sieht Zahlenfeld UND
  //      Verwaltungsknopf. Der hingenommene Preis aus §11.7.
  if (istLagerbuchAdmin(await viewerOderNull())) redirect(adminLandingPfad(returnTo));

  // Die Sekundenzahl fuer `grund=zuviele` (§3.9) wird NICHT ueber die URL
  // getragen. Drei Gruende, und der dritte traegt allein:
  //   * eine Zahl in der URL ist beim ersten Neuladen GELOGEN;
  //   * ein `searchParams`-Wert ist Nutzereingabe und muesste ohnehin verworfen
  //     und neu ermittelt werden;
  //   * diese Seite hat DIESELBEN Absender-Kopfzeilen wie die eben abgewiesene
  //     Anfrage — sie fragt die Schranke mit demselben Schluessel und bekommt
  //     dieselbe Antwort, OHNE dass irgendetwas transportiert werden muss.
  //
  // ⚠️ SIE LIEST NUR UND BUCHT NICHTS. Ein `gateFehlversuchBuchen` hier machte
  // das Neuladen des Gates zu einem Fehlversuch, und eine gesperrte Person kaeme
  // durch blosses Warten nie wieder herein. Der Aufruf steht HINTER dem
  // Host-Riegel und ohne Datenbankzugriff (§3.5.3).
  const sperrSekunden = gateGesperrt(absenderAus(kopf));
  const meldung = gateMeldung(grund, sperrSekunden);   // §3.9 — die EINE Textquelle

  const sauber = sanitizeReturnTo(returnTo);

  /**
   * DER VERWALTUNGSLINK WIRD HIER GEBAUT, NICHT IN DER INSEL (§3.6.6,
   * Entscheidung 15 a): „der Verwaltungs-Knopf fuehrt auf das Suite-/login".
   *
   * `verwaltungsZiel()` (Teil 2, T23) liefert
   * `https://<SUITE_HOST_LAGERBUCH>/verwaltung` — und VOR dem Cutover, wenn kein
   * Host konfiguriert ist, den relativen Pfad `/m/lagerbuch/verwaltung`. Das
   * Ziel MUSS absolut und auf einen der Suite bekannten Host zeigen: ein
   * relatives `/m/lagerbuch/verwaltung` setzte die verwaltende Person auf dem
   * PORTAL-Host ab, weil `AUTH_URL` suiteweit derselbe Wert ist
   * (`core/auth/redirect.ts:8-18`), und entwertete den ganzen returnTo-Apparat.
   *
   * Ein `returnTo` (gescanntes Regaletikett) ersetzt nur den PFAD, nie den
   * Host: der wird aus `verwaltungsZiel()` uebernommen und NIE geraten.
   *
   * `/login` liegt in `PASSTHROUGH` (`core/routing.ts:12`) und wird auf keinem
   * Host in ein Modul umgeschrieben.
   */
  const ziel = verwaltungsZiel();
  const callback = sauber
    ? (ziel.startsWith("https://") ? new URL(sauber, ziel).toString() : `/m/lagerbuch${sauber}`)
    : ziel;

  return (
    <OeffentlicherRahmen>
      <Gate
        meldung={meldung}
        returnTo={sauber ?? ""}
        verwaltungsLink={`/login?callbackUrl=${encodeURIComponent(callback)}`}
      />
    </OeffentlicherRahmen>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/page.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/page.tsx src/app/m/lagerbuch/page.test.tsx
git commit -m "feat(lagerbuch): page.tsx — das Gate auf der Modulwurzel, in bindender Reihenfolge

Host-Riegel, dann die Rollen-Weiche als PRAEDIKAT: requireLagerbuchAdmin() waere
hier falsch, es wuerfe jede Person ohne Sitzung nach /login — also genau die
Helferin, fuer die die Seite gebaut ist. Drei gueltige Faelle, nicht einer; wer
angemeldet ist, aber keine Lagerbuch-Gruppe hat, bleibt hier stehen und sieht
beide Karten (§11.7).

Die Seite LIEST den ?grund=-Parameter (Falle 60): heute schreibt
t/[code]/route.ts ?err=rate und niemand liest es — wer ein gesperrtes Kaertchen
scannt, landet wortlos auf dem Gate. Und sie liest die Sekundenzahl SELBST aus
derselben Schranke, mit denselben Absender-Kopfzeilen: eine Zahl in der URL ist
beim ersten Neuladen gelogen.

Sie liest nur und bucht nichts — ein Fehlversuch beim Neuladen des Gates
verlaengerte die Sperre, und eine gesperrte Person kaeme durch blosses Warten
nie wieder herein.

Kein viewport-Export: der gehoert der Suite und ist gesetzt."
```

---

### Task 82: `t/[code]/route.ts` — 303 mit relativem `Location` (Falle 16)

**Files:**
- Create: `src/app/m/lagerbuch/t/[code]/route.ts`
- Test: `src/app/m/lagerbuch/t/[code]/route.test.ts`

**Interfaces:**
- Consumes: `_lib/host.ts` (Teil 1, T10) — `lagerbuchHostOderNull` (die **nicht-werfende** Form);
  `_lib/absender.ts`, `_lib/gateSchranke.ts`, `_lib/code.ts`, `_lib/returnTo.ts`, `_lib/tokenZiel.ts`,
  `_lib/helferSitzung.ts` (alle Teil 2); `_lib/schreibpfade/tokenEinloesung.ts` (T66) — `redeemToken`;
  `_db/client.ts` (Teil 1, T12) — `getDb`.
- Produces: die äußere Route **`GET /t/<code>`** (innerer Pfad `/m/lagerbuch/t/<code>`). Antwort
  **303** mit **relativem** `Location`; bei Erfolg zusätzlich
  `Set-Cookie: helfer_session=…` **ohne** `Domain=`.

**Warum kein `NextResponse.redirect`** (§7.2.3, wörtlich). Es verlangt eine **absolute** URL, und
jede absolute URL hier ist entweder aus einer Basis-Variablen **geraten** (Falle 16) oder aus
`req.url` gebaut — und `req.url` trägt nach dem Rewrite den **inneren** Pfad
(`m/files/_lib/hostRolle.ts:137-139` schreibt das aus). Ein **relatives** `Location` löst der Browser
gegen die URL auf, die **er** sah: den äußeren Modul-Host (RFC 7231 §7.1.2). **Cookie und Landung
können damit KONSTRUKTIV nicht auseinanderfallen. Wer das „repariert", bricht den Mehrhost-Betrieb.**

**303 und nicht 302:** die Antwort auf ein GET soll auch nach dem Folgen ein GET sein, und 303 sagt
das ausdrücklich, statt es dem Browser zu überlassen.

⚠️ **Was Falle 16 teuer macht:** weicht die Basis vom anfragenden Host ab, gilt das Cookie für den
einen Host, die Landung passiert auf dem anderen, **die Helferin kommt ohne Sitzung am Gate an — und
der Code bleibt gültig, ist aber wegen `lastUsedAt` nicht mehr löschbar, sondern nur noch sperrbar**
(`loeschen.ts:89-99`). Ein cross-origin-Redirect **verbrennt einen laminierten Gegenstand**, ohne dass
jemand eine Sitzung bekommen hätte.

⚠️ **`lagerbuchHostOderNull`, nicht `requireLagerbuchHost`.** Ein `notFound()` ist keine brauchbare
Antwort auf einen **gescannten QR-Code**; der Handler baut seine 404 selbst (Teil 1, T10).

⚠️ **Diese Route hat heute NULL E2E** (Falle 32), und der Mehrhost-Fall ist in Vitest **nicht
darstellbar** — `token-redeem.test.ts:3` mockt die Basis-URL auf denselben Host wie der Testserver,
**der Bruch ist per Konstruktion unsichtbar.** Der Nachweis liegt in **Teil 6, T171**; dieser Task
liefert die prüfbare **Form** (Status 303, relatives `Location`, Cookie auf **dieser** Antwort).

**`config.appBaseUrl` verschwindet damit aus dem gesamten Helfer-Weg.** Verblieben ist die Variable
nur, wo sie fachlich hingehört: in den gedruckten Pixeln des Etikettenbogens — und dort heißt sie
`SUITE_HOST_LAGERBUCH`, gelesen über `moduleUrl("lagerbuch")` (§8.1).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/t/[code]/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const QUELLE = "src/app/m/lagerbuch/t/[code]/route.ts";

const gateGesperrt = vi.fn<(a: string) => number | null>(() => null);
const gateFehlversuchBuchen = vi.fn();
vi.mock("../../_lib/gateSchranke", () => ({
  gateGesperrt: (a: string) => gateGesperrt(a),
  gateFehlversuchBuchen: (a: string) => gateFehlversuchBuchen(a),
}));

const redeemToken = vi.fn();
vi.mock("../../_lib/schreibpfade/tokenEinloesung", () => ({
  redeemToken: (...a: unknown[]) => redeemToken(...a),
}));
vi.mock("../../_db/client", () => ({ getDb: () => ({ marke: "db" }) }));

import { GET } from "./route";

function anfrage(pfad: string, host = "lagerbuch.localtest.me"): Request {
  // ⚠️ `req.url` traegt nach dem Rewrite den INNEREN Pfad — genau der Grund,
  // warum der Handler daraus keine absolute URL bauen darf.
  return new Request(`http://intern.invalid/m/lagerbuch${pfad}`, { headers: { host } });
}
const ctx = (code: string) => ({ params: Promise.resolve({ code }) });

beforeEach(() => {
  gateGesperrt.mockReturnValue(null);
  redeemToken.mockReset();
  gateFehlversuchBuchen.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("/t/<code> — Schritt 1: Host", () => {
  it("antwortet auf fremdem Host mit 404 und NICHT mit notFound()", async () => {
    // Ein notFound() ist keine brauchbare Antwort auf einen gescannten
    // QR-Code; der Handler baut seine 404 selbst (Teil 1, T10).
    const r = await GET(anfrage("/t/482-137", "feedback.localtest.me"), ctx("482-137"));
    expect(r.status).toBe(404);
    expect(redeemToken).not.toHaveBeenCalled();
  });
});

describe("/t/<code> — Schritt 2: Sperre, OHNE Datenbankzugriff", () => {
  it("leitet mit `?grund=zuviele` aufs Gate und fasst die Datenbank NICHT an", async () => {
    gateGesperrt.mockReturnValue(42);
    const r = await GET(anfrage("/t/482-137"), ctx("482-137"));
    expect(r.status).toBe(303);
    expect(r.headers.get("Location")).toBe("/?grund=zuviele");
    expect(redeemToken).not.toHaveBeenCalled();
  });

  it("nimmt `returnTo` in die Gate-URL mit", async () => {
    gateGesperrt.mockReturnValue(42);
    const r = await GET(anfrage("/t/482-137?returnTo=%2Fa%2Fart-9"), ctx("482-137"));
    expect(r.headers.get("Location")).toBe("/?returnTo=%2Fa%2Fart-9&grund=zuviele");
  });
});

describe("/t/<code> — Schritt 3 und 4", () => {
  it("normalisiert den Code, BEVOR redeemToken ihn sieht", async () => {
    redeemToken.mockResolvedValue({ ok: false });
    await GET(anfrage("/t/482137"), ctx("482137"));
    expect(redeemToken).toHaveBeenCalledWith("482-137", expect.anything());
  });
});

describe("/t/<code> — Schritt 5: Erfolg", () => {
  it("antwortet 303 mit RELATIVEM Location und setzt das Cookie auf DIESER Antwort", async () => {
    // Ein relatives Location loest der Browser gegen die URL auf, die ER sah:
    // den aeusseren Modul-Host (RFC 7231 §7.1.2). Cookie und Landung koennen
    // damit KONSTRUKTIV nicht auseinanderfallen (Falle 16).
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt.x.y", tokenId: "tk1", zielTyp: "fahrzeug", zielId: "fz-1",
    });
    const r = await GET(anfrage("/t/482-137"), ctx("482-137"));
    expect(r.status).toBe(303);
    expect(r.headers.get("Location")).toBe("/helfer/check?fz=fz-1");
    const cookie = r.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("helfer_session=jwt.x.y");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    // KEIN `domain` — das Cookie ist host-only, und genau diese Eigenschaft
    // laesst die Sitzungen den Cutover ueberleben (§7.4.1, R1).
    expect(cookie.toLowerCase()).not.toContain("domain=");
  });

  it("das Location ist RELATIV — es traegt weder Schema noch Host", async () => {
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: "artikel", zielId: "art-9",
    });
    const l = (await GET(anfrage("/t/482-137"), ctx("482-137"))).headers.get("Location") ?? "";
    expect(l).toBe("/a/art-9");
    expect(l).not.toMatch(/^https?:/);
    expect(l).not.toContain("intern.invalid");
    // Und es traegt NICHT den inneren Pfad aus `req.url`.
    expect(l).not.toMatch(/^\/m\/lagerbuch/);
  });

  it("ein ausdrueckliches `returnTo` hat Vorrang vor dem Code-Ziel", async () => {
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: "fahrzeug", zielId: "fz-1",
    });
    const r = await GET(anfrage("/t/482-137?returnTo=%2Fa%2Fart-9"), ctx("482-137"));
    expect(r.headers.get("Location")).toBe("/a/art-9");
  });

  it("ein feindliches `returnTo` wird verworfen", async () => {
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: null, zielId: null,
    });
    const r = await GET(anfrage("/t/482-137?returnTo=%2F%5Cboese.example"), ctx("482-137"));
    expect(r.headers.get("Location")).toBe("/helfer");
  });

  it("verbraucht KEIN Budget", async () => {
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: null, zielId: null,
    });
    await GET(anfrage("/t/482-137"), ctx("482-137"));
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
  });
});

describe("/t/<code> — Schritt 6: Misserfolg", () => {
  it("bucht den Fehlversuch und leitet mit `?grund=code` aufs Gate", async () => {
    // Heute schreibt der Handler `?err=code`, und NIEMAND liest es: wer ein
    // gesperrtes Kaertchen scannt, landet wortlos auf dem Gate (Falle 60).
    redeemToken.mockResolvedValue({ ok: false });
    const r = await GET(anfrage("/t/000-000"), ctx("000-000"));
    expect(r.status).toBe(303);
    expect(r.headers.get("Location")).toBe("/?grund=code");
    expect(gateFehlversuchBuchen).toHaveBeenCalledTimes(1);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
});

describe("Bauform", () => {
  it("benutzt `lagerbuchHostOderNull`, nicht die werfende Form", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/lagerbuchHostOderNull/);
    expect(q).not.toMatch(/requireLagerbuchHost/);
  });

  it("benutzt KEIN `NextResponse.redirect` und KEINE Basis-URL", () => {
    // Beides ist Falle 16. `NextResponse.redirect` verlangt eine absolute URL,
    // und jede absolute URL hier ist entweder geraten oder aus `req.url` — und
    // `req.url` traegt nach dem Rewrite den INNEREN Pfad.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/NextResponse\.redirect|appBaseUrl|APP_BASE_URL|SUITE_HOST_LAGERBUCH/);
  });

  it("ist `force-dynamic`", () => {
    expect(readFileSync(QUELLE, "utf8")).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("traegt den Rueckfall-Kommentar fuer den Fall, dass der E2E die Form widerlegt", () => {
    // §7.2.3: Herkunft aus `x-forwarded-host` bauen — NIE aus der
    // Konfiguration. Ohne den Satz baut der naechste Mensch die Basis-Variable
    // wieder ein.
    expect(readFileSync(QUELLE, "utf8")).toMatch(/x-forwarded-host/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/t/[code]/route.test.ts"
```

Erwartet: FAIL mit `Failed to resolve import "./route"`.

- [ ] **Schritt 3: `t/[code]/route.ts` schreiben**

```ts
import { NextResponse } from "next/server";
import { lagerbuchHostOderNull } from "../../_lib/host";
import { absenderAus } from "../../_lib/absender";
import { gateGesperrt, gateFehlversuchBuchen } from "../../_lib/gateSchranke";
import { normalisiereCode } from "../../_lib/code";
import { sanitizeReturnTo } from "../../_lib/returnTo";
import { tokenZielPfad } from "../../_lib/tokenZiel";
import {
  HELFER_COOKIE, helferCookieOptionen, helferGueltigkeitSekunden,
} from "../../_lib/helferSitzung";
import { redeemToken } from "../../_lib/schreibpfade/tokenEinloesung";
import { getDb } from "../../_db/client";

/**
 * DIE ERSTE GATE-FLAECHE — der gescannte Zugangs-Kaertchen-QR (§7.2.3).
 *
 * ⚠️ SIE HAT HEUTE NULL E2E (Falle 32), und der Mehrhost-Fall ist in Vitest
 * NICHT darstellbar: `token-redeem.test.ts:3` mockt die Basis-URL auf denselben
 * Host wie der Testserver — DER BRUCH IST PER KONSTRUKTION UNSICHTBAR. Der
 * Nachweis liegt in Teil 6, T171; diese Datei liefert die pruefbare FORM.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const kopf = new Headers(req.headers);

  // SCHRITT 1 — Host. `lagerbuchHostOderNull` und NICHT die werfende Form: ein
  // `notFound()` ist keine brauchbare Antwort auf einen GESCANNTEN QR-Code, der
  // Handler baut seine 404 selbst (§2.6, Teil 1 T10).
  if (!lagerbuchHostOderNull(kopf)) return new Response("Not found", { status: 404 });

  const { code } = await ctx.params;
  const url = new URL(req.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  const zumGate = (grund?: "zuviele" | "code") => {
    const ziel = new URLSearchParams();
    if (returnTo) ziel.set("returnTo", returnTo);
    if (grund) ziel.set("grund", grund);   // §3.9 — DAS GATE LIEST IHN (Falle 60)
    return antwort(`/${ziel.size ? `?${ziel}` : ""}`);
  };

  const absender = absenderAus(kopf);                                // §3.5.2, einmal ermittelt

  // SCHRITT 2 — gesperrt? OHNE Datenbankzugriff. Die Sekundenzahl wird NICHT
  // mitgegeben: das Gate liest sie selbst aus derselben Schranke, mit denselben
  // Absender-Kopfzeilen (§7.2.4, §3.9).
  if (gateGesperrt(absender) !== null) return zumGate("zuviele");

  // SCHRITT 3 und 4 — normalisieren, dann einloesen. `redeemToken` NIMMT das
  // Handle, es holt sich keins: `_db/client.ts#getDb()` ist der einzige Opener
  // des Moduls (§5.13.2), und ein Schreibpfad, der ihn selbst riefe, waere der
  // erste, der die Regel aufweicht.
  const res = await redeemToken(normalisiereCode(code), getDb());

  // SCHRITT 6 — Misserfolg.
  if (!res.ok) {
    gateFehlversuchBuchen(absender);
    return zumGate("code");
  }

  // SCHRITT 5 — Erfolg. KEIN Budgetverbrauch.
  const antw = antwort(returnTo ?? tokenZielPfad(res.zielTyp, res.zielId));
  antw.cookies.set(HELFER_COOKIE, res.cookieValue, helferCookieOptionen(helferGueltigkeitSekunden()));
  return antw;
}

/**
 * 303 mit RELATIVEM Location. Bewusst NICHT `NextResponse.redirect(…)`: das
 * verlangt eine ABSOLUTE URL, und jede absolute URL hier ist entweder aus einer
 * Basis-Variablen GERATEN (Falle 16) oder aus `req.url` gebaut — und `req.url`
 * traegt nach dem Rewrite den INNEREN Pfad (`m/files/_lib/hostRolle.ts:137-139`
 * schreibt das aus). Ein relatives Location loest der Browser gegen die URL
 * auf, die ER sah: den aeusseren Modul-Host (RFC 7231 §7.1.2). COOKIE UND
 * LANDUNG KOENNEN DAMIT KONSTRUKTIV NICHT AUSEINANDERFALLEN. Wer das
 * „repariert", bricht den Mehrhost-Betrieb.
 *
 * WAS DER BRUCH KOSTET: weicht die Basis vom anfragenden Host ab, gilt das
 * Cookie fuer den einen Host, die Landung passiert auf dem anderen, die
 * Helferin kommt OHNE Sitzung am Gate an — und der Code bleibt gueltig, ist
 * aber wegen `lastUsedAt` (T66) nicht mehr LOESCHBAR, sondern nur noch sperrbar
 * (`loeschen.ts:89-99`). Ein cross-origin-Redirect VERBRENNT EINEN LAMINIERTEN
 * GEGENSTAND, ohne dass jemand eine Sitzung bekommen haette.
 *
 * 303 und nicht 302: die Antwort auf ein GET soll auch nach dem Folgen ein GET
 * sein, und 303 sagt das ausdruecklich, statt es dem Browser zu ueberlassen.
 *
 * RUECKFALL, falls der E2E (Teil 6, T171) das widerlegt: Herkunft aus
 * `x-forwarded-host` bauen (`core/routing.ts:17-23`). NIE aus der
 * Konfiguration.
 */
function antwort(pfad: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: pfad } });
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/t/[code]/route.test.ts"
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add "src/app/m/lagerbuch/t/[code]/route.ts" "src/app/m/lagerbuch/t/[code]/route.test.ts"
git commit -m "feat(lagerbuch): t/[code]/route.ts — 303 mit relativem Location (Falle 16)

Der Handler kennt keine Basis-URL mehr. NextResponse.redirect verlangt eine
absolute URL, und jede absolute URL hier ist entweder aus einer
Basis-Variablen geraten oder aus req.url gebaut — und req.url traegt nach dem
Rewrite den INNEREN Pfad. Ein relatives Location loest der Browser gegen die
URL auf, die ER sah: den aeusseren Modul-Host. Cookie und Landung koennen damit
konstruktiv nicht auseinanderfallen.

Was der Bruch kostet: das Cookie gilt fuer den einen Host, die Landung passiert
auf dem anderen, die Helferin kommt ohne Sitzung am Gate an — und der Code
bleibt gueltig, ist aber wegen lastUsedAt nicht mehr loeschbar, nur noch
sperrbar. Ein cross-origin-Redirect verbrennt einen laminierten Gegenstand.

303 statt 302: die Antwort auf ein GET soll auch nach dem Folgen ein GET sein.
lagerbuchHostOderNull statt der werfenden Form: ein notFound() ist keine
brauchbare Antwort auf einen gescannten QR-Code.

Der Parameter heisst ab jetzt ?grund= und WIRD GELESEN (Falle 60): heute
schreibt der Handler ?err=rate, und niemand liest es — wer ein gesperrtes
Kaertchen scannt, landet wortlos auf dem Gate."
```

---

### Task 83: `a/[artikelId]/page.tsx` — die Rollen-Weiche mit drei Ausgängen

**Files:**
- Create: `src/app/m/lagerbuch/a/[artikelId]/page.tsx`
- Test: `src/app/m/lagerbuch/a/[artikelId]/page.test.tsx`

**Interfaces:**
- Consumes: `_lib/host.ts` (Teil 1, T10) — `requireLagerbuchHost`; `_lib/zugang.ts` (Teil 2, T23) —
  `viewerOderNull`, `istLagerbuchAdmin`; `_lib/helferZugang.ts` (Teil 2, T25) —
  `helferZugangOderNull`; `_lib/lesepfade/artikel.ts` (Teil 3, T51) — `artikelDetailHelfer`;
  `_lib/zeit.ts` (Teil 1, T3); `_db/client.ts` — `getDb`; `_ui/HelferRahmen.tsx` (T76);
  `_ui/Entnahme.tsx` (T78); `_ui/LeerZustand.tsx` (T69);
  **`_actions/buchung.ts` (Teil 5, T114) — `bucheEntnahmeHelfer`.**
- Produces: die äußere Route **`/a/<artikelId>`** (innerer Pfad `/m/lagerbuch/a/<artikelId>`).

⚠️ **DIE EINE REIHENFOLGEBINDUNG DIESES PLANS NACH AUSSEN.** Diese Datei ist die **einzige** in
Teil 4, die aus `_actions/buchung.ts` importiert — und die Datei gehört **vollständig Teil 5**
(H7, E10). Zwei Ausführungsordnungen sind zulässig, und **die erste ist die empfohlene**:

1. **Teil 5s T114 wird VORGEZOGEN** und vor dieser Welle ausgeführt. Sie hängt nur an Teil 2
   (`requireHelferSchreibend`) und Teil 3 (`fefoAbbuchung`, `umlagerung`) und hat **keine**
   Teil-4-Abhängigkeit. Das ist eine **Ablaufanweisung**, kein Dateianspruch — die Eigentümerschaft
   bleibt bei Teil 5.
2. Wird sie nicht vorgezogen, schlagen `pnpm typecheck` und `pnpm build` an **genau einer**
   Importzeile fehl. Die benannte Abhilfe ist Punkt 1 — **nicht** eine zweite `_actions/buchung.ts`.

⚠️ **AUFLAGE AN T114, wiederholt aus T78 und §6:** `bucheEntnahmeHelfer` gibt
`HelferErgebnis<{ gebucht: number }>` zurück, und **`gebucht === 0` ist `{ok:false, grund:"leer"}`**.
Die heute in teil5.md geschriebene Fassung liefert dort `{ok:true, wert:{gebucht:0}}` — **genau der
Zustand, den §7.3 als teuersten der Tabelle benennt.**

**Die Rollen-Weiche, drei Ausgänge** (§7.4.3, `cordon.ts:61`: `allowed = isA ? hasHelfer || isAdmin : hasHelfer`):

| Lage | Ausgang |
|---|---|
| Helfer-Sitzung vorhanden | **rendern** — `HelferRahmen aktiv="entnahme"` + `Entnahme` |
| keine Helfer-Sitzung, aber **Admin** | `redirect("/verwaltung/artikel?a=<id>")` — er **rendert nicht** |
| weder noch | `redirect("/?returnTo=/a/<id>")` |

⚠️ **Der Admin-Zweig fragt `istLagerbuchAdmin(await viewerOderNull())`, NICHT
`requireLagerbuchAdmin()`** (§3.2.1): der dritte Fall ist „keine Sitzung → Gate mit `returnTo`", und
ein Riegel schickte ihn nach `/login`.

⚠️ **Und weil der Admin-Zweig NICHT rendert, dürfen `sitzungsetikett` und `laeuftAb` am
`HelferRahmen` Pflicht-Props sein** (§7.8.2). Wer das umbaut, muss die Prop-Signatur mit umbauen.

⚠️ **`/a/<id>` bleibt in der Cordon-Allowlist und bleibt schleifenfrei**, weil die Weiche hier Admins
selbst in die Verwaltung leitet (`cordon.ts:44-46`) — **so überlebt ein gescanntes Regaletikett den
Umweg über Pocket ID.**

**Kein Artikel gefunden → gestalteter Zustand, kein `notFound()`** (Entscheidung 8-C, 36 a). Der
Bestand macht daraus `redirect("/helfer")` (`a/[artikelId]/page.tsx:23`) — **ein wortloser Sprung**,
nach dem die Person nicht weiß, ob sie falsch gescannt hat oder ob das Etikett veraltet ist.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/a/[artikelId]/page.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const QUELLE = "src/app/m/lagerbuch/a/[artikelId]/page.tsx";

let kopfzeilen = new Headers({ host: "lagerbuch.localtest.me" });
const umleitungen: string[] = [];

vi.mock("next/headers", () => ({ headers: async () => kopfzeilen }));
vi.mock("next/navigation", () => ({
  redirect: (z: string) => { umleitungen.push(z); throw new Error("NEXT_REDIRECT"); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

const helferZugang = vi.fn<() => Promise<unknown>>(async () => null);
vi.mock("../../_lib/helferZugang", () => ({ helferZugangOderNull: () => helferZugang() }));

const istAdmin = vi.fn(() => false);
vi.mock("../../_lib/zugang", () => ({
  viewerOderNull: async () => null,
  istLagerbuchAdmin: () => istAdmin(),
}));

const detail = vi.fn<() => unknown>(() => null);
vi.mock("../../_lib/lesepfade/artikel", () => ({ artikelDetailHelfer: () => detail() }));
vi.mock("../../_db/client", () => ({ getDb: () => ({ marke: "db" }) }));
vi.mock("../../_actions/buchung", () => ({ bucheEntnahmeHelfer: async () => ({ ok: true, wert: { gebucht: 1 } }) }));

vi.mock("../../_ui/Entnahme", () => ({
  Entnahme: (p: { detail: { id: string } }) => <div data-rolle="entnahme" data-id={p.detail.id} />,
}));
vi.mock("../../_ui/HelferRahmen", () => ({
  HelferRahmen: (p: { aktiv: string; sitzungsetikett: string; children: React.ReactNode }) =>
    <div data-rolle="rahmen" data-aktiv={p.aktiv} data-etikett={p.sitzungsetikett}>{p.children}</div>,
}));

import ArtikelDeepLink from "./page";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";

const ZUGANG = {
  tokenId: "tk1", code: "482-137", label: "RTW 1",
  laeuftAb: new Date("2026-08-04T17:00:00.000Z"),
};
const DETAIL = {
  id: "art-9", name: "Kompresse", einheit: "Stk", fach: "A-01", bestand: 5, chargen: [],
};

beforeEach(() => {
  kopfzeilen = new Headers({ host: "lagerbuch.localtest.me" });
  umleitungen.length = 0;
  helferZugang.mockResolvedValue(null);
  istAdmin.mockReturnValue(false);
  detail.mockReturnValue(null);
});
afterEach(async () => { await unmount(); vi.clearAllMocks(); });

const params = (id: string) => ({ params: Promise.resolve({ artikelId: id }) });

describe("/a/<id> — die Rollen-Weiche, drei Ausgaenge", () => {
  it("Host zuerst: fremder Host wirft notFound()", async () => {
    kopfzeilen = new Headers({ host: "feedback.localtest.me" });
    await expect(ArtikelDeepLink(params("art-9"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(helferZugang).not.toHaveBeenCalled();
  });

  it("MIT Helfer-Sitzung: rendert — auch wenn die Person zugleich Admin ist", async () => {
    // `cordon.ts:61`: allowed = isA ? hasHelfer || isAdmin : hasHelfer. Die
    // Helfer-Sitzung gewinnt, sonst muesste ein Admin am Regal das Kaertchen
    // beiseitelegen.
    helferZugang.mockResolvedValue(ZUGANG);
    istAdmin.mockReturnValue(true);
    detail.mockReturnValue(DETAIL);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(umleitungen).toEqual([]);
    expect(query("[data-rolle='entnahme']").getAttribute("data-id")).toBe("art-9");
  });

  it("OHNE Helfer-Sitzung, ABER Admin: leitet in die Verwaltung — er rendert NICHT", async () => {
    istAdmin.mockReturnValue(true);
    await expect(ArtikelDeepLink(params("art-9"))).rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["/verwaltung/artikel?a=art-9"]);
  });

  it("weder noch: Gate MIT returnTo — so ueberlebt das Etikett den Umweg ueber Pocket ID", async () => {
    await expect(ArtikelDeepLink(params("art-9"))).rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["/?returnTo=%2Fa%2Fart-9"]);
  });

  it("kodiert eine ID mit Sonderzeichen in beiden Umleitungen", async () => {
    await ArtikelDeepLink(params("a b&c")).catch(() => {});
    expect(umleitungen[0]).toBe("/?returnTo=%2Fa%2Fa%20b%26c");
  });
});

describe("/a/<id> — der Rahmen und der Leerzustand", () => {
  it("setzt `aktiv=\"entnahme\"` und das Sitzungsetikett aus der DB-Zeile", async () => {
    // `code` und `label` kommen ab jetzt aus der DB-Zeile, nicht aus dem Cookie
    // (§3.4.4) — sie sind dort AKTUELL, waehrend ein Cookie sie zwoelf Stunden
    // einfriert.
    helferZugang.mockResolvedValue(ZUGANG);
    detail.mockReturnValue(DETAIL);
    await mount(await ArtikelDeepLink(params("art-9")));
    const r = query("[data-rolle='rahmen']");
    expect(r.getAttribute("data-aktiv")).toBe("entnahme");
    expect(r.getAttribute("data-etikett")).toBe("Zugang: Token 482-137 · RTW 1");
  });

  it("Etikett ohne Artikel: gestalteter Zustand mit Rueckweg, KEIN wortloser Sprung", async () => {
    // Der Bestand macht daraus `redirect("/helfer")` (:23) — danach weiss die
    // Person nicht, ob sie falsch gescannt hat oder ob das Etikett veraltet ist
    // (Entscheidung 8-C, 36 a).
    helferZugang.mockResolvedValue(ZUGANG);
    detail.mockReturnValue(null);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(umleitungen).toEqual([]);
    expect(exists("[data-rolle='entnahme']")).toBe(false);
    expect(query("[data-rolle='leer-titel']").textContent).toBe("Dieses Etikett kennt kein Artikel");
    expect(query<HTMLAnchorElement>("[data-rolle='leer-weg']").getAttribute("href")).toBe("/helfer");
  });

  it("der Leerzustand steht IM Rahmen — die Tab-Leiste bleibt erreichbar", async () => {
    helferZugang.mockResolvedValue(ZUGANG);
    detail.mockReturnValue(null);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(query("[data-rolle='rahmen'] [data-rolle='leer-titel']")).toBeTruthy();
  });
});

describe("Bauform", () => {
  it("benutzt `istLagerbuchAdmin`, NICHT `requireLagerbuchAdmin`", () => {
    // Der dritte Fall ist „keine Sitzung → Gate mit returnTo"; ein Riegel
    // schickte ihn nach /login (§3.2.1, §11.5 Zustand 18).
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/istLagerbuchAdmin/);
    expect(q).not.toMatch(/requireLagerbuchAdmin/);
  });

  it("ruft `requireHelferSitzung` NICHT — die Weiche hat drei Ausgaenge, kein Riegel", () => {
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/requireHelferSitzung/);
  });

  it("reicht die Action als PROP in die Insel", () => {
    const q = readFileSync(QUELLE, "utf8");
    expect(q).toMatch(/buchen=\{bucheEntnahmeHelfer\}/);
  });

  it("ist `force-dynamic`", () => {
    expect(readFileSync(QUELLE, "utf8")).toMatch(/export const dynamic = "force-dynamic"/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/a/[artikelId]/page.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./page"`.

- [ ] **Schritt 3: `a/[artikelId]/page.tsx` schreiben**

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireLagerbuchHost } from "../../_lib/host";
import { viewerOderNull, istLagerbuchAdmin } from "../../_lib/zugang";
import { helferZugangOderNull } from "../../_lib/helferZugang";
import { artikelDetailHelfer } from "../../_lib/lesepfade/artikel";
import { getDb } from "../../_db/client";
import { HelferRahmen } from "../../_ui/HelferRahmen";
import { Entnahme } from "../../_ui/Entnahme";
import { LeerZustand } from "../../_ui/LeerZustand";
// ⚠️ DIE EINE REIHENFOLGEBINDUNG DIESES PLANS NACH AUSSEN: `_actions/buchung.ts`
// gehoert vollstaendig Teil 5 (Festlegung H7). Teil 5s T114 wird VORGEZOGEN —
// sie haengt nur an Teil 2 und Teil 3. Das ist eine Ablaufanweisung, kein
// Dateianspruch; eine zweite `_actions/buchung.ts` entsteht NICHT.
import { bucheEntnahmeHelfer } from "../../_actions/buchung";

/**
 * DER REGALETIKETT-DEEP-LINK — §7.4.3.
 *
 * DIE ROLLEN-WEICHE HAT DREI AUSGAENGE (`cordon.ts:61`:
 * `allowed = isA ? hasHelfer || isAdmin : hasHelfer`):
 *   1. Helfer-Sitzung vorhanden          → RENDERN
 *   2. keine Sitzung, aber Admin         → /verwaltung/artikel?a=<id>
 *   3. weder noch                        → Gate mit returnTo
 *
 * ⚠️ Der Admin-Zweig fragt `istLagerbuchAdmin(await viewerOderNull())`, NICHT
 * `requireLagerbuchAdmin()`: der DRITTE Fall ist „keine Sitzung → Gate mit
 * returnTo", und ein Riegel schickte ihn nach `/login` (§3.2.1, §11.5
 * Zustand 18).
 *
 * ⚠️ UND WEIL DER ADMIN-ZWEIG NICHT RENDERT, sondern umleitet, duerfen
 * `sitzungsetikett` und `laeuftAb` am `HelferRahmen` PFLICHT-Props sein
 * (§7.8.2). Wer diese Weiche umbaut, muss die Prop-Signatur mit umbauen.
 *
 * ⚠️ `/a/<id>` bleibt in der Cordon-Allowlist und bleibt SCHLEIFENFREI, weil
 * die Weiche hier Admins selbst in die Verwaltung leitet (`cordon.ts:44-46`) —
 * so ueberlebt ein gescanntes Regaletikett den Umweg ueber Pocket ID.
 */
export const dynamic = "force-dynamic";

export default async function ArtikelDeepLink({
  params,
}: {
  params: Promise<{ artikelId: string }>;
}) {
  requireLagerbuchHost(await headers());          // §2.6 — erste Anweisung
  const { artikelId } = await params;
  const db = getDb();

  const zugang = await helferZugangOderNull(db);

  if (!zugang) {
    // Ausgang 2: der Admin RENDERT NICHT, er wird umgeleitet. AEUSSERE Pfade.
    if (istLagerbuchAdmin(await viewerOderNull())) {
      redirect(`/verwaltung/artikel?a=${encodeURIComponent(artikelId)}`);
    }
    // Ausgang 3: Gate MIT returnTo — sonst laeuft der Deep-Link nach dem
    // Einloesen ins Leere.
    redirect(`/?returnTo=${encodeURIComponent(`/a/${artikelId}`)}`);
  }

  // `code` und `label` kommen aus der DB-ZEILE, nicht aus dem Cookie (§3.4.4):
  // dort sind sie aktuell, waehrend ein Cookie sie zwoelf Stunden einfriert.
  const etikett = `Zugang: Token ${zugang.code} · ${zugang.label}`;
  const detail = artikelDetailHelfer(db, artikelId);

  return (
    <HelferRahmen aktiv="entnahme" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
      {detail ? (
        // Die Action kommt als PROP in die Insel — `_ui/Entnahme.tsx` importiert
        // sie NICHT selbst (T78).
        <Entnahme detail={detail} buchen={bucheEntnahmeHelfer} />
      ) : (
        // KEIN `notFound()` und KEIN wortloser `redirect("/helfer")` wie im
        // Bestand (`a/[artikelId]/page.tsx:23`): danach weiss die Person nicht,
        // ob sie falsch gescannt hat oder ob das Etikett veraltet ist
        // (Entscheidung 8-C, 36 a). HTTP 200 mit einem Satz, der es sagt — IM
        // Rahmen, damit die Tab-Leiste erreichbar bleibt.
        <LeerZustand
          titel="Dieses Etikett kennt kein Artikel"
          text={"Der Artikel wurde gelöscht oder das Etikett stammt aus einer anderen Anwendung. "
              + "Bitte der Verwaltung melden — der Bestand ist davon nicht betroffen."}
          weg={{ href: "/helfer", text: "Artikel suchen" }}
        />
      )}
    </HelferRahmen>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/a/[artikelId]/page.test.tsx"
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add "src/app/m/lagerbuch/a/[artikelId]/page.tsx" "src/app/m/lagerbuch/a/[artikelId]/page.test.tsx"
git commit -m "feat(lagerbuch): a/[artikelId]/page.tsx — die Rollen-Weiche mit drei Ausgaengen

allowed = isA ? hasHelfer || isAdmin : hasHelfer (cordon.ts:61). Die
Helfer-Sitzung gewinnt, sonst muesste ein Admin am Regal das Kaertchen
beiseitelegen. Ohne Sitzung geht der Admin in die Verwaltung, alle anderen aufs
Gate mit returnTo — so ueberlebt ein gescanntes Regaletikett den Umweg ueber
Pocket ID.

istLagerbuchAdmin, nicht requireLagerbuchAdmin: der dritte Fall ist 'keine
Sitzung → Gate', und ein Riegel schickte ihn nach /login. Und weil der
Admin-Zweig NICHT rendert, sondern umleitet, duerfen sitzungsetikett und
laeuftAb am HelferRahmen Pflicht-Props sein.

Etikett ohne Artikel: gestalteter Zustand mit Rueckweg statt des wortlosen
redirect('/helfer') des Bestands — danach weiss die Person nicht, ob sie falsch
gescannt hat oder ob das Etikett veraltet ist.

⚠️ Die eine Reihenfolgebindung dieses Plans nach aussen: bucheEntnahmeHelfer
gehoert Teil 5 (H7). Teil 5s T114 wird vorgezogen; eine zweite
_actions/buchung.ts entsteht nicht."
```

---

### Task 84: `helfer/layout.tsx` und `helfer/page.tsx` — nur der Riegel, dann die Liste

**Files:**
- Create: `src/app/m/lagerbuch/helfer/layout.tsx`
- Create: `src/app/m/lagerbuch/helfer/page.tsx`
- Test: `src/app/m/lagerbuch/helfer/page.test.tsx`

**Interfaces:**
- Consumes: `_lib/host.ts` (Teil 1, T10); `_lib/helferZugang.ts` (Teil 2, T25) —
  `requireHelferSitzung`; `_lib/lesepfade/artikel.ts` (Teil 3, T51) — `artikelListe`;
  `_db/client.ts` — `getDb`; `_ui/HelferRahmen.tsx` (T76); `_ui/ArtikelSuche.tsx` (T71).
- Produces: die äußere Route **`/helfer`** (innerer Pfad `/m/lagerbuch/helfer`) und das Group-Layout
  darüber.

**Das Layout trägt NUR den Riegel, nicht den Rahmen** (§7.4.3, §7.8.2):

```
requireLagerbuchHost(await headers())  +  requireHelferSitzung(getDb())
```

⚠️ **Die Datei ist eine Server Component und kann deshalb KEIN Cookie räumen**
(`next/dist/server/web/spec-extension/adapters/request-cookies.js:53`). Der Sperr- und der Ablauffall
gehen darum über den Route Handler `/abmelden` (Teil 2, T26) — `requireHelferSitzung` leitet dorthin
um, **als String, nicht als Import.**

⚠️ **Falle 17: Route-Group-Grenzen sind KEINE Sicherheitsgrenzen** (§2.1 d). Das Layout ist eine
**Bequemlichkeit**, keine Absicherung; die tragende Zusage sind die aufrufbaren Funktionen. Genau
deshalb ruft `helfer/page.tsx` `requireHelferSitzung` **selbst noch einmal** — nicht aus Misstrauen
gegen das Layout, sondern weil **ein Layout einer Seite keine Props reichen kann** und
`sitzungsetikett` und `laeuftAb` von dort kommen. **Der zweite Aufruf ist billig:** dasselbe gecachte
Handle (§5.13.2), derselbe Primärschlüssel-Lookup auf `tokens.id`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/helfer/page.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const LAYOUT = "src/app/m/lagerbuch/helfer/layout.tsx";
const SEITE = "src/app/m/lagerbuch/helfer/page.tsx";

let kopfzeilen = new Headers({ host: "lagerbuch.localtest.me" });
vi.mock("next/headers", () => ({ headers: async () => kopfzeilen }));
vi.mock("next/navigation", () => ({
  redirect: (z: string) => { throw new Error(`NEXT_REDIRECT:${z}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

const sitzung = vi.fn();
vi.mock("../_lib/helferZugang", () => ({ requireHelferSitzung: (db: unknown) => sitzung(db) }));

const liste = vi.fn<() => unknown[]>(() => []);
vi.mock("../_lib/lesepfade/artikel", () => ({ artikelListe: () => liste() }));
vi.mock("../_db/client", () => ({ getDb: () => ({ marke: "db" }) }));

vi.mock("../_ui/ArtikelSuche", () => ({
  ArtikelSuche: (p: { artikel: { id: string }[] }) =>
    <div data-rolle="suche" data-anzahl={String(p.artikel.length)}
         data-felder={Object.keys(p.artikel[0] ?? {}).sort().join(",")} />,
}));
vi.mock("../_ui/HelferRahmen", () => ({
  HelferRahmen: (p: { aktiv: string; sitzungsetikett: string; children: React.ReactNode }) =>
    <div data-rolle="rahmen" data-aktiv={p.aktiv} data-etikett={p.sitzungsetikett}>{p.children}</div>,
}));

import HelferSeite from "./page";
import HelferLayout from "./layout";
import { mount, unmount, query } from "@/app/m/qr/_lib/test-dom";

const ZUGANG = {
  tokenId: "tk1", code: "482-137", label: "RTW 1",
  laeuftAb: new Date("2026-08-04T17:00:00.000Z"),
};

beforeEach(() => {
  kopfzeilen = new Headers({ host: "lagerbuch.localtest.me" });
  sitzung.mockResolvedValue(ZUGANG);
  liste.mockReturnValue([]);
});
afterEach(async () => { await unmount(); vi.clearAllMocks(); });

describe("helfer/layout.tsx — NUR der Riegel", () => {
  it("wirft auf fremdem Host, BEVOR die Sitzung gefragt wird", async () => {
    kopfzeilen = new Headers({ host: "feedback.localtest.me" });
    await expect(HelferLayout({ children: null })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(sitzung).not.toHaveBeenCalled();
  });

  it("ruft `requireHelferSitzung` und reicht die Kinder durch", async () => {
    await mount(await HelferLayout({ children: <p data-rolle="kind">X</p> }));
    expect(sitzung).toHaveBeenCalledTimes(1);
    expect(query("[data-rolle='kind']").textContent).toBe("X");
  });

  it("rendert KEINEN Rahmen — der wandert in die Seiten (§7.8.2)", () => {
    const q = readFileSync(LAYOUT, "utf8");
    expect(q).not.toMatch(/HelferRahmen/);
  });

  it("raeumt KEIN Cookie — eine Server Component kann das nicht", () => {
    // `next/dist/.../request-cookies.js:53` traegt den Satz „Cookies can only be
    // modified in a Server Action or Route Handler" woertlich. Sperr- und
    // Ablauffall gehen ueber /abmelden (Teil 2, T26).
    expect(readFileSync(LAYOUT, "utf8")).not.toMatch(/cookies\(\)/);
  });
});

describe("helfer/page.tsx", () => {
  it("ruft `requireHelferSitzung` SELBST noch einmal — ein Layout reicht keine Props", async () => {
    // Nicht aus Misstrauen gegen das Layout, sondern weil `sitzungsetikett` und
    // `laeuftAb` genau von dort kommen. Der zweite Aufruf ist billig: dasselbe
    // gecachte Handle, derselbe Primaerschluessel-Lookup.
    await mount(await HelferSeite());
    expect(sitzung).toHaveBeenCalledTimes(1);
    expect(query("[data-rolle='rahmen']").getAttribute("data-etikett"))
      .toBe("Zugang: Token 482-137 · RTW 1");
  });

  it("setzt `aktiv=\"entnahme\"`", async () => {
    await mount(await HelferSeite());
    expect(query("[data-rolle='rahmen']").getAttribute("data-aktiv")).toBe("entnahme");
  });

  it("reicht NUR die fuenf Anzeigefelder in die Insel", async () => {
    // Die Liste traegt serverseitig mehr (mindestbestand, chargeKritisch,
    // naechsteCharge …). Alles davon landete im RSC-Payload auf einem privaten
    // Telefon, ohne dass die Seite es zeigt.
    liste.mockReturnValue([{
      id: "a1", name: "Kompresse", einheit: "Stk", fach: "A-01", bestand: 42,
      mindestbestand: 10, aktiv: true, unterMindest: false, chargeKritisch: false,
      naechsteCharge: { chargenNr: "L1", verfall: "2027-03" },
    }]);
    await mount(await HelferSeite());
    expect(query("[data-rolle='suche']").getAttribute("data-felder"))
      .toBe("bestand,einheit,fach,id,name");
  });

  it("blendet inaktive Artikel aus", async () => {
    // `artikelListe` ohne `inklInaktiv` liefert nur aktive (Teil 3, T51); die
    // Seite verlaesst sich darauf und filtert NICHT ein zweites Mal.
    const q = readFileSync(SEITE, "utf8");
    expect(q).toMatch(/artikelListe\(db\)/);
    expect(q).not.toMatch(/inklInaktiv/);
  });

  it("traegt den Satz, der die Systemkamera erklaert", async () => {
    // 1:1 aus `helfer/page.tsx:12`. Er ist die einzige Stelle, an der die
    // Anwendung sagt, dass das Regaletikett ein Einstieg ist.
    await mount(await HelferSeite());
    expect(query("[data-rolle='helfer-hinweis']").textContent)
      .toBe("Regaletikett scannen öffnet den Artikel direkt — oder hier suchen.");
  });

  it("ist `force-dynamic`", () => {
    expect(readFileSync(SEITE, "utf8")).toMatch(/export const dynamic = "force-dynamic"/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/helfer/page.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./page"`.

- [ ] **Schritt 3: Beide Dateien schreiben**

`src/app/m/lagerbuch/helfer/layout.tsx`:

```tsx
import { headers } from "next/headers";
import { requireLagerbuchHost } from "../_lib/host";
import { requireHelferSitzung } from "../_lib/helferZugang";
import { getDb } from "../_db/client";

/**
 * DAS HELFER-LAYOUT TRAEGT NUR DEN RIEGEL, NICHT DEN RAHMEN (§7.4.3, §7.8.2).
 *
 * ⚠️ FALLE 17: Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (§2.1 d).
 * Dieses Layout ist eine BEQUEMLICHKEIT, keine Absicherung — die tragende
 * Zusage sind die aufrufbaren Funktionen. Genau deshalb ruft `helfer/page.tsx`
 * `requireHelferSitzung` SELBST noch einmal: nicht aus Misstrauen, sondern weil
 * ein Layout einer Seite keine Props reichen kann und `sitzungsetikett` und
 * `laeuftAb` von dort kommen.
 *
 * ⚠️ DIESE DATEI IST EINE SERVER COMPONENT UND KANN KEIN COOKIE RAEUMEN:
 * `cookies()` ist dort versiegelt, `delete` wirft
 * (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53` traegt
 * den Satz „Cookies can only be modified in a Server Action or Route Handler"
 * woertlich). Der Sperr- und der Ablauffall gehen darum ueber den Route
 * Handler `/abmelden` (Teil 2, T26) — `requireHelferSitzung` leitet dorthin um,
 * ALS STRING, nicht als Import.
 *
 * KEIN `<Shell>` (§7.1.1) und KEIN `viewport`-Export (§7.7.2).
 */
export const dynamic = "force-dynamic";

export default async function HelferLayout({ children }: { children: React.ReactNode }) {
  requireLagerbuchHost(await headers());   // §2.6 — erste Anweisung
  await requireHelferSitzung(getDb());     // §3.4.4 — prueft Cookie UND tokens.aktiv
  return <>{children}</>;
}
```

`src/app/m/lagerbuch/helfer/page.tsx`:

```tsx
import { requireHelferSitzung } from "../_lib/helferZugang";
import { artikelListe } from "../_lib/lesepfade/artikel";
import { getDb } from "../_db/client";
import { HelferRahmen } from "../_ui/HelferRahmen";
import { ArtikelSuche } from "../_ui/ArtikelSuche";
import s from "../_ui/helfer.module.css";

/**
 * DIE ARTIKELLISTE — §7.2.2.
 *
 * Host und Sitzungsriegel kommen aus `helfer/layout.tsx`. Der zweite Aufruf von
 * `requireHelferSitzung` hier ist KEINE Doppelpruefung aus Misstrauen: ein
 * Layout kann einer Seite keine Props reichen, und `sitzungsetikett` und
 * `laeuftAb` kommen genau von dort (§7.8.2). Er ist billig — dasselbe gecachte
 * Handle (§5.13.2), derselbe Primaerschluessel-Lookup auf `tokens.id`.
 */
export const dynamic = "force-dynamic";

export default async function HelferSeite() {
  const db = getDb();
  const zugang = await requireHelferSitzung(db);

  // NUR die fuenf Anzeigefelder. `artikelListe` traegt serverseitig mehr
  // (mindestbestand, unterMindest, chargeKritisch, naechsteCharge …), und alles
  // davon landete sonst im RSC-Payload — auf einem privaten Telefon, in einer
  // Sitzung ohne Konto (§3.4.5), ohne dass die Seite es zeigt.
  const artikel = artikelListe(db).map((a) => ({
    id: a.id, name: a.name, einheit: a.einheit, fach: a.fach, bestand: a.bestand,
  }));

  return (
    <HelferRahmen
      aktiv="entnahme"
      sitzungsetikett={`Zugang: Token ${zugang.code} · ${zugang.label}`}
      laeuftAb={zugang.laeuftAb}
    >
      <div className={s.schirmKopf}>Artikel wählen</div>
      {/* 1:1 aus `helfer/page.tsx:12` — die EINZIGE Stelle, an der die Anwendung
          sagt, dass das Regaletikett ein Einstieg ist (§7.2.1). */}
      <p className={s.fussnote} data-rolle="helfer-hinweis">
        Regaletikett scannen öffnet den Artikel direkt — oder hier suchen.
      </p>
      <ArtikelSuche artikel={artikel} />
    </HelferRahmen>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/helfer/page.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/helfer/layout.tsx src/app/m/lagerbuch/helfer/page.tsx \
        src/app/m/lagerbuch/helfer/page.test.tsx
git commit -m "feat(lagerbuch): helfer/layout.tsx (nur der Riegel) und helfer/page.tsx

Das Layout traegt NUR requireLagerbuchHost + requireHelferSitzung, keinen
Rahmen: der wandert in die drei Seiten, weil die Aktivmarkierung ein
Server-Prop ist (§7.8.2). Route-Group-Grenzen sind keine Sicherheitsgrenzen
(Falle 17) — das Layout ist eine Bequemlichkeit, die tragende Zusage sind die
aufrufbaren Funktionen.

Die Seite ruft requireHelferSitzung selbst noch einmal, und das ist keine
Doppelpruefung aus Misstrauen: ein Layout kann einer Seite keine Props reichen,
und sitzungsetikett und laeuftAb kommen genau von dort. Der zweite Aufruf ist
billig — dasselbe gecachte Handle, derselbe Primaerschluessel-Lookup.

Nur fuenf Anzeigefelder gehen in die Insel: artikelListe traegt serverseitig
mehr, und alles davon landete sonst im RSC-Payload auf einem privaten Telefon,
ohne dass die Seite es zeigt.

Das Layout raeumt kein Cookie — eine Server Component kann das nicht
(request-cookies.js:53). Sperr- und Ablauffall gehen ueber /abmelden."
```

---

### Task 85: `helfer/check/page.tsx` — der Schnitt aufs Fahrzeug

**Files:**
- Create: `src/app/m/lagerbuch/helfer/check/page.tsx`
- Test: `src/app/m/lagerbuch/helfer/check/page.test.tsx`

**Interfaces:**
- Consumes: `_lib/helferZugang.ts` (Teil 2, T25) — `requireHelferSitzung`;
  `_lib/lesepfade/fahrzeuge.ts` (Teil 3, T48) — `fahrzeugListe`, `sollFuerFahrzeug`;
  `_lib/lesepfade/geraete.ts` (Teil 3, T53) — `geraeteFuerLagerort`;
  `_lib/lesepfade/sauerstoff.ts` (Teil 3, T52) — `o2FlaschenFuerLagerort`;
  `_lib/lesepfade/verfall.ts` (Teil 3, T47) — `verfallFuerLagerort`;
  `_lib/domain/verfall.ts` (Teil 3, T28) — `verfallSchwellen`;
  `_db/client.ts` — `getDb`; `_ui/HelferRahmen.tsx` (T76), `_ui/FahrzeugWahl.tsx` (T80),
  `_ui/CheckFlow.tsx` (T79), `_ui/LeerZustand.tsx` (T69).
- Produces: die äußere Route **`/helfer/check`** (innerer Pfad `/m/lagerbuch/helfer/check`), mit
  optionalem `?fz=<id>`.

**Der Schnitt** (§7.9.1, Falle 15). Heute baut die Seite **vier** `Object.fromEntries`-Wörterbücher
und reicht sie **komplett** herein; `?fz=` wirkt nur als Vorauswahl. **Ab jetzt: erst wählen, dann
laden.** Vier Folgen, alle gewollt: der Payload trägt genau **ein** Fahrzeug (bei zehn Fahrzeugen eine
Zehntelung); die Wahl ist eine **Navigation**; `CheckFlow` verliert die vier Wörterbücher und
`preselect`; „Weiterer Check" wird zu zwei `<Link>`.

⚠️ **Genau ein aktives Fahrzeug → keine Wahl anbieten, und KEIN `redirect`.** Das spart eine Anfrage
und schreibt keinen Pfad, den jemand äußer/innen verwechseln könnte (§2.1 g, §7.11).

⚠️ **Was der Schnitt NICHT ist: ein Riegel.** `tokens.scope_lagerort_id` ist heute **Dekoration**, ein
Fahrzeug-Code kann **jedes** Fahrzeug checken (Falle 14, §3.4.5). Für diese Spec bleibt es beim
heutigen Verhalten, weil eine Verschärfung zur **physischen Verteilung der Etiketten** passen muss und
der Betreiber sie nicht beantwortet hat (offene Frage 5). **Dieser Task markiert ANSATZPUNKT 1 VON 2**
— die Zeile, die `gewaehlt` berechnet; Ansatzpunkt 2 ist die erste Zeile von `checkAbschluss` (T75).
**Mehr braucht es dann nicht.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/helfer/check/page.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const QUELLE = "src/app/m/lagerbuch/helfer/check/page.tsx";

vi.mock("next/navigation", () => ({
  redirect: (z: string) => { throw new Error(`NEXT_REDIRECT:${z}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

const sitzung = vi.fn();
vi.mock("../../_lib/helferZugang", () => ({ requireHelferSitzung: () => sitzung() }));

const fahrzeuge = vi.fn<() => { id: string; name: string; kennung: string | null; aktiv: boolean; templateId: string | null }[]>(() => []);
const sollFuer = vi.fn<() => unknown[]>(() => []);
vi.mock("../../_lib/lesepfade/fahrzeuge", () => ({
  fahrzeugListe: () => fahrzeuge(),
  sollFuerFahrzeug: (_db: unknown, id: string) => sollFuer(id as never),
}));
const geraeteFuer = vi.fn<() => unknown[]>(() => []);
vi.mock("../../_lib/lesepfade/geraete", () => ({ geraeteFuerLagerort: () => geraeteFuer() }));
const flaschenFuer = vi.fn<() => unknown[]>(() => []);
vi.mock("../../_lib/lesepfade/sauerstoff", () => ({ o2FlaschenFuerLagerort: () => flaschenFuer() }));
const verfallFuer = vi.fn(() => new Map());
vi.mock("../../_lib/lesepfade/verfall", () => ({ verfallFuerLagerort: () => verfallFuer() }));
vi.mock("../../_db/client", () => ({ getDb: () => ({ marke: "db" }) }));

vi.mock("../../_ui/CheckFlow", () => ({
  CheckFlow: (p: { fahrzeug: { id: string } }) =>
    <div data-rolle="flow" data-fz={p.fahrzeug.id} />,
}));
vi.mock("../../_ui/FahrzeugWahl", () => ({
  FahrzeugWahl: (p: { fahrzeuge: { id: string }[] }) =>
    <div data-rolle="wahl" data-anzahl={String(p.fahrzeuge.length)} />,
}));
vi.mock("../../_ui/HelferRahmen", () => ({
  HelferRahmen: (p: { aktiv: string; children: React.ReactNode }) =>
    <div data-rolle="rahmen" data-aktiv={p.aktiv}>{p.children}</div>,
}));

import CheckSeite from "./page";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";

const FZ = (id: string, aktiv = true) => ({ id, name: id.toUpperCase(), kennung: null, aktiv, templateId: null });

beforeEach(() => {
  sitzung.mockResolvedValue({
    tokenId: "tk1", code: "482-137", label: "RTW 1",
    laeuftAb: new Date("2026-08-04T17:00:00.000Z"),
  });
  fahrzeuge.mockReturnValue([]);
  sollFuer.mockReturnValue([]);
  geraeteFuer.mockReturnValue([]);
  flaschenFuer.mockReturnValue([]);
  verfallFuer.mockReturnValue(new Map());
});
afterEach(async () => { await unmount(); vi.clearAllMocks(); });

const sp = (o: Record<string, string> = {}) => ({ searchParams: Promise.resolve(o) });

describe("/helfer/check — der Schnitt aufs Fahrzeug (Falle 15)", () => {
  it("kein Fahrzeug angelegt: LeerZustand mit Rueckweg, KEIN CheckFlow", async () => {
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='leer-titel']").textContent).toBe("Kein Fahrzeug angelegt");
    expect(exists("[data-rolle='flow']")).toBe(false);
    expect(query<HTMLAnchorElement>("[data-rolle='leer-weg']").getAttribute("href")).toBe("/helfer");
  });

  it("mehrere Fahrzeuge, kein `?fz=`: die WAHL, und KEINE Fahrzeugdaten geladen", async () => {
    // Der ganze Punkt des Schnitts: erst waehlen, DANN laden. Sonst wandert die
    // Soll-Bestueckung der gesamten Organisation in den RSC-Payload.
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='wahl']").getAttribute("data-anzahl")).toBe("2");
    expect(sollFuer).not.toHaveBeenCalled();
    expect(geraeteFuer).not.toHaveBeenCalled();
    expect(flaschenFuer).not.toHaveBeenCalled();
    expect(verfallFuer).not.toHaveBeenCalled();
  });

  it("laedt NUR fuer das gewaehlte Fahrzeug", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    await mount(await CheckSeite(sp({ fz: "fz-2" })));
    expect(query("[data-rolle='flow']").getAttribute("data-fz")).toBe("fz-2");
    expect(sollFuer).toHaveBeenCalledTimes(1);
    expect(sollFuer).toHaveBeenCalledWith("fz-2");
  });

  it("genau EIN aktives Fahrzeug: kein Waehlen, und KEIN redirect", async () => {
    // §7.11: ein redirect waere eine zusaetzliche Anfrage und ein geschriebener
    // Pfad mehr, der aeusser/inner verwechselt werden kann. Das Rendern kostet
    // nichts.
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='flow']").getAttribute("data-fz")).toBe("fz-1");
  });

  it("blendet INAKTIVE Fahrzeuge aus", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1", false), FZ("fz-2")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='flow']").getAttribute("data-fz")).toBe("fz-2");
  });

  it("ein `?fz=` auf ein INAKTIVES oder unbekanntes Fahrzeug wird verworfen", async () => {
    // Sonst laedt eine geratene ID die Daten eines stillgelegten Fahrzeugs.
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-alt", false)]);
    await mount(await CheckSeite(sp({ fz: "fz-alt" })));
    expect(query("[data-rolle='flow']").getAttribute("data-fz")).toBe("fz-1");
  });

  it("ein `?fz=` auf eine erfundene ID bei MEHREREN Fahrzeugen zeigt die Wahl", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    await mount(await CheckSeite(sp({ fz: "gibt-es-nicht" })));
    expect(exists("[data-rolle='wahl']")).toBe(true);
    expect(sollFuer).not.toHaveBeenCalled();
  });

  it("filtert Grabstein-Positionen (`entfernt`) aus dem Soll", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    sollFuer.mockReturnValue([
      { id: "sp-1", entfernt: false, artikelId: "a1", fachLabel: "F", sort: 1, artikelName: "K",
        einheit: "Stk", handlagerFach: "A-01", soll: 5, fahrzeugBestand: 5, handlagerBestand: 10,
        herkunft: "manuell" },
      { id: "sp-2", entfernt: true, artikelId: "a2", fachLabel: "F", sort: 2, artikelName: "M",
        einheit: "Stk", handlagerFach: "A-02", soll: 3, fahrzeugBestand: 0, handlagerBestand: 0,
        herkunft: "manuell" },
    ]);
    const q = readFileSync(QUELLE, "utf8");
    // Grabsteine sind auf dem Fahrzeug bewusst NICHT vorhanden → nicht Teil des
    // Checks (1:1 aus `helfer/check/page.tsx:15`).
    expect(q).toMatch(/filter\(\(p\) => !p\.entfernt\)/);
  });
});

describe("/helfer/check — Rahmen und Riegel", () => {
  it("setzt `aktiv=\"check\"` in JEDER der drei Lagen", async () => {
    for (const lage of [[], [FZ("fz-1"), FZ("fz-2")], [FZ("fz-1")]]) {
      fahrzeuge.mockReturnValue(lage);
      await mount(await CheckSeite(sp()));
      expect(query("[data-rolle='rahmen']").getAttribute("data-aktiv")).toBe("check");
      await unmount();
    }
  });

  it("ruft `requireHelferSitzung` SELBST — ein Layout reicht keine Props", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    await mount(await CheckSeite(sp()));
    expect(sitzung).toHaveBeenCalledTimes(1);
  });
});

describe("Bauform", () => {
  it("traegt den Ansatzpunkt-Kommentar fuer `scope_lagerort_id` (offene Frage 5)", () => {
    // ANSATZPUNKT 1 VON 2. Der zweite ist die erste Zeile von `checkAbschluss`.
    expect(readFileSync(QUELLE, "utf8")).toMatch(/scope_lagerort_id/);
  });

  it("benutzt KEIN `redirect` bei genau einem Fahrzeug", () => {
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/redirect\(/);
  });

  it("ist `force-dynamic`", () => {
    expect(readFileSync(QUELLE, "utf8")).toMatch(/export const dynamic = "force-dynamic"/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/helfer/check/page.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./page"`.

- [ ] **Schritt 3: `helfer/check/page.tsx` schreiben**

```tsx
import { requireHelferSitzung } from "../../_lib/helferZugang";
import { fahrzeugListe, sollFuerFahrzeug } from "../../_lib/lesepfade/fahrzeuge";
import { geraeteFuerLagerort } from "../../_lib/lesepfade/geraete";
import { o2FlaschenFuerLagerort } from "../../_lib/lesepfade/sauerstoff";
import { verfallFuerLagerort } from "../../_lib/lesepfade/verfall";
import { verfallSchwellen } from "../../_lib/domain/verfall";
import { getDb } from "../../_db/client";
import { HelferRahmen } from "../../_ui/HelferRahmen";
import { FahrzeugWahl } from "../../_ui/FahrzeugWahl";
import { CheckFlow } from "../../_ui/CheckFlow";
import { LeerZustand } from "../../_ui/LeerZustand";

/**
 * DER FAHRZEUG-CHECK — §7.9.1, DIE EINE STRUKTURAENDERUNG DES KAPITELS
 * (Falle 15).
 *
 * Heute baut diese Seite VIER `Object.fromEntries(fahrzeuge.map(...))`-
 * Woerterbuecher (`helfer/check/page.tsx:16,19-21,23,24-26`) und reicht sie
 * KOMPLETT an die Client-Komponente; `?fz=` wirkt nur als Vorauswahl (`:28`).
 * Damit wandert bei JEDEM Helfer-Aufruf die Soll-Bestueckung, Geraeteliste,
 * Flaschenliste und Verfallslage DER GESAMTEN ORGANISATION in den RSC-Payload —
 * auf ein privates Telefon, in einer Sitzung ohne Konto (§3.4.5).
 *
 * AB JETZT: ERST WAEHLEN, DANN LADEN.
 *
 * Host und Sitzungsriegel kommen aus `helfer/layout.tsx` (§7.4.3); der zweite
 * Aufruf von `requireHelferSitzung` hier holt `sitzungsetikett` und `laeuftAb`,
 * die ein Layout einer Seite nicht reichen kann (§7.8.2).
 */
export const dynamic = "force-dynamic";

export default async function CheckSeite({
  searchParams,
}: {
  searchParams: Promise<{ fz?: string }>;
}) {
  const { fz } = await searchParams;
  const db = getDb();
  const zugang = await requireHelferSitzung(db);
  const etikett = `Zugang: Token ${zugang.code} · ${zugang.label}`;

  const fahrzeuge = fahrzeugListe(db).filter((f) => f.aktiv);

  // ⚠️ ANSATZPUNKT 1 VON 2 fuer eine spaetere Durchsetzung von
  // `tokens.scope_lagerort_id` als RIEGEL (offene Betreiberfrage 5, §7.9.1).
  // Hier stuende:
  //     const erlaubt = scope ? fahrzeuge.filter((f) => f.id === scope) : fahrzeuge;
  // Heute ist die Spalte DEKORATION: ein Fahrzeug-Code kann JEDES Fahrzeug
  // checken (Falle 14). Eine Verschaerfung muss zur PHYSISCHEN VERTEILUNG der
  // Etiketten passen, und die ist unbeantwortet. Ansatzpunkt 2 ist die erste
  // Zeile von `checkAbschluss` (_actions/check.ts). MEHR BRAUCHT ES DANN NICHT.
  //
  // Genau EIN aktives Fahrzeug → keine Wahl anbieten. KEIN `redirect`: das
  // spart eine Anfrage und schreibt keinen Pfad, den jemand aeusser/innen
  // verwechseln koennte (§2.1 g, §7.11).
  const gewaehlt =
    (fz && fahrzeuge.some((f) => f.id === fz) && fz) ||
    (fahrzeuge.length === 1 ? fahrzeuge[0].id : null);

  if (fahrzeuge.length === 0) {
    return (
      <HelferRahmen aktiv="check" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <LeerZustand
          titel="Kein Fahrzeug angelegt"
          text={"Die Verwaltung muss zuerst ein Fahrzeug mit Soll-Bestückung pflegen. "
              + "Bis dahin gibt es hier nichts zu prüfen."}
          weg={{ href: "/helfer", text: "Zur Entnahme" }}
        />
      </HelferRahmen>
    );
  }

  if (!gewaehlt) {
    return (
      <HelferRahmen aktiv="check" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <FahrzeugWahl
          fahrzeuge={fahrzeuge.map((f) => ({ id: f.id, name: f.name, kennung: f.kennung }))}
        />
      </HelferRahmen>
    );
  }

  // ERST JETZT laden — und nur fuer dieses EINE Fahrzeug. Bei zehn Fahrzeugen
  // ist das eine Zehntelung des Payloads.
  const fahrzeug = fahrzeuge.find((f) => f.id === gewaehlt)!;
  // Grabsteine (`entfernt`) sind auf dem Fahrzeug bewusst NICHT vorhanden →
  // nicht Teil des Checks (1:1 aus `helfer/check/page.tsx:15`).
  const soll = sollFuerFahrzeug(db, gewaehlt).filter((p) => !p.entfernt).map((p) => ({
    id: p.id, fachLabel: p.fachLabel, artikelId: p.artikelId, artikelName: p.artikelName,
    einheit: p.einheit, handlagerFach: p.handlagerFach, soll: p.soll,
    fahrzeugBestand: p.fahrzeugBestand, handlagerBestand: p.handlagerBestand,
  }));
  const geraete = geraeteFuerLagerort(db, gewaehlt).map((g) => ({
    id: g.id, typ: g.typ, name: g.name,
  }));
  const flaschen = o2FlaschenFuerLagerort(db, gewaehlt).map((f) => ({
    id: f.id, name: f.name, nennfuelldruckBar: f.nennfuelldruckBar, letzterDruck: f.letzterDruck,
  }));
  const verfall = Object.fromEntries(
    [...verfallFuerLagerort(db, gewaehlt)].map(([artikelId, e]) => [artikelId, e.verfall]),
  );

  return (
    <HelferRahmen aktiv="check" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
      <CheckFlow
        fahrzeug={{ id: fahrzeug.id, name: fahrzeug.name, kennung: fahrzeug.kennung }}
        soll={soll}
        geraete={geraete}
        flaschen={flaschen}
        verfall={verfall}
        // Die Schwellen kommen vom SERVER; die Ampel im Zaehlschritt rechnet
        // der Client damit ueber `verfallStatus`, und das ist seit
        // Entscheidung 26 (b) zonenexplizit — Chip und Abschlusszahl koennen
        // konstruktiv nicht auseinanderfallen (§7.9.3).
        warn={verfallSchwellen()}
      />
    </HelferRahmen>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/helfer/check/page.test.tsx
```

Erwartet: PASS.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/helfer/check/page.tsx src/app/m/lagerbuch/helfer/check/page.test.tsx
git commit -m "feat(lagerbuch): helfer/check/page.tsx — erst waehlen, dann laden (Falle 15)

Heute baut die Seite vier Object.fromEntries-Woerterbuecher und reicht sie
komplett an die Client-Komponente; ?fz= ist nur Vorauswahl. Damit wandert bei
JEDEM Helfer-Aufruf die Soll-Bestueckung, Geraeteliste, Flaschenliste und
Verfallslage der GESAMTEN Organisation in den RSC-Payload — auf ein privates
Telefon, in einer Sitzung ohne Konto. Der Test haelt fest, dass ohne Wahl KEIN
einziger Fahrzeug-Lesepfad laeuft.

Genau ein aktives Fahrzeug: keine Wahl, aber auch KEIN redirect — das spart
eine Anfrage und schreibt keinen Pfad, den jemand aeusser/innen verwechseln
kann. Ein ?fz= auf ein inaktives oder unbekanntes Fahrzeug wird verworfen.

Ansatzpunkt 1 von 2 fuer eine spaetere scope_lagerort_id-Durchsetzung steht als
Kommentar an der gewaehlt-Zeile; Ansatzpunkt 2 ist die erste Zeile von
checkAbschluss. Heute ist die Spalte Dekoration, und eine Verschaerfung muss
zur physischen Verteilung der Etiketten passen."
```

---

### Task 86: Die fünf PWA-Route-Handler — Reparatur, nicht Aufräumen

**Files:**
- Create: `src/app/m/lagerbuch/manifest.webmanifest/route.ts`
- Create: `src/app/m/lagerbuch/pwa-icon.svg/route.ts`
- Create: `src/app/m/lagerbuch/icon-192.png/route.ts`
- Create: `src/app/m/lagerbuch/icon-512.png/route.ts`
- Create: `src/app/m/lagerbuch/icon-maskable-512.png/route.ts`
- Test: `src/app/m/lagerbuch/pwa.route.test.ts`

**Interfaces:**
- Consumes: `_lib/host.ts` (Teil 1, T10) — `lagerbuchHostOderNull`; `_lib/pwaIcons.ts` (T65) —
  `ICON_192_BASE64`, `ICON_512_BASE64`, `ICON_MASKABLE_512_BASE64`, `PWA_ICON_SVG`, `pngAntwort`;
  `_lib/marke.ts` (Teil 3, T33) — `LAGERBUCH_MARKE`, `LAGERBUCH_ORGANISATION`, `LAGERBUCH_ZEILE`.
- Produces: fünf äußere Routen auf dem Modul-Host:

  | Datei | extern (Browser sieht) | intern |
  |---|---|---|
  | `manifest.webmanifest/route.ts` | `/manifest.webmanifest` | `/m/lagerbuch/manifest.webmanifest` |
  | `pwa-icon.svg/route.ts` | `/pwa-icon.svg` | `/m/lagerbuch/pwa-icon.svg` |
  | `icon-192.png/route.ts` | `/icon-192.png` | `/m/lagerbuch/icon-192.png` |
  | `icon-512.png/route.ts` | `/icon-512.png` | `/m/lagerbuch/icon-512.png` |
  | `icon-maskable-512.png/route.ts` | `/icon-maskable-512.png` | `/m/lagerbuch/icon-maskable-512.png` |

**Die drei PNGs wandern aus `public/` heraus, und das ist KEIN Aufräumen, sondern eine Reparatur**
(§7.10.2, Falle 56). `src/proxy.ts:103` schließt vom Matcher nur
`_next/static|_next/image|favicon.ico` aus; `/icon-192.png` wird auf dem lagerbuch-Host also nach
`/m/lagerbuch/icon-192.png` umgeschrieben und läuft ins **404** — während dieselbe Datei auf **jedem
anderen** Host an der Wurzel ausgeliefert würde.

⚠️ **Alle fünf tragen `lagerbuchHostOderNull` als erste Anweisung** (§2.6) — **sonst bewirbt jeder
Suite-Host eine Lagerbuch-PWA.** Zusammen mit `metadata.manifest` im Modul-Layout (Teil 1, T6) und
**nicht** im Root-Layout ist das die vollständige Abhilfe.

**Der Manifest-Inhalt bleibt zeichengleich** — 1:1-Pflicht, weil diese Werte auf jedem Helfer-Handy
Symbol, Splash-Farbe und Startziel bestimmen **und beim Installieren eingebrannt werden**
(`manifest.webmanifest/route.ts:14-28`):

```
name          "<MARKE> · <ORGANISATION>"     short_name  "<MARKE>"
display       "standalone"                   start_url   "/"
theme_color   "#C8000F"                      background_color  "#EEF0F1"
icons         svg any · 192 · 512 · 512 maskable
```

⚠️ **Die drei Textwerte kommen ab jetzt aus `_lib/marke.ts`, nicht aus Env-Variablen** (§10.2).
⚠️ **`/icon.svg` wird zu `/pwa-icon.svg`** — der Alt-Eintrag zeigt auf eine Datei, **die es nicht
gibt** (E7).
⚠️ **`start_url: "/"` und `scope: "/"` bleiben richtig** — der Browser sieht den externen Modul-Host,
der Rewrite ist serverintern unsichtbar. **Bedingung:** `SUITE_HOST_LAGERBUCH` ist gesetzt. Ist es das
nicht, zeigt `start_url: "/"` aufs **Portal**, und eine installierte PWA startet im falschen Modul →
**Runbook-Eingabe R2.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/pwa.route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { GET as manifest } from "./manifest.webmanifest/route";
import { GET as svg } from "./pwa-icon.svg/route";
import { GET as png192 } from "./icon-192.png/route";
import { GET as png512 } from "./icon-512.png/route";
import { GET as pngMask } from "./icon-maskable-512.png/route";

const HANDLER = [
  { name: "manifest.webmanifest", fn: manifest, typ: "application/manifest+json" },
  { name: "pwa-icon.svg", fn: svg, typ: "image/svg+xml" },
  { name: "icon-192.png", fn: png192, typ: "image/png" },
  { name: "icon-512.png", fn: png512, typ: "image/png" },
  { name: "icon-maskable-512.png", fn: pngMask, typ: "image/png" },
] as const;

const anfrage = (host: string) =>
  new Request(`http://intern.invalid/m/lagerbuch/x`, { headers: { host } });

describe("Alle fuenf Handler tragen den Host-Riegel (§2.6)", () => {
  for (const h of HANDLER) {
    it(`${h.name}: 404 auf fremdem Host`, async () => {
      // Sonst bewirbt JEDER Suite-Host eine Lagerbuch-PWA (Falle 56).
      expect((await h.fn(anfrage("feedback.localtest.me"))).status).toBe(404);
    });

    it(`${h.name}: 200 mit ${h.typ} auf dem Modul-Host`, async () => {
      const r = await h.fn(anfrage("lagerbuch.localtest.me"));
      expect(r.status).toBe(200);
      expect(r.headers.get("Content-Type")).toContain(h.typ);
    });
  }
});

describe("manifest.webmanifest — zeichengleich zu §7.10.2", () => {
  it("traegt die sieben Werte", async () => {
    // 1:1-Pflicht: diese Werte werden beim INSTALLIEREN eingebrannt. Ein
    // spaeterer Tausch erreicht kein Geraet, auf dem die App schon liegt.
    const m = await (await manifest(anfrage("lagerbuch.localtest.me"))).json();
    expect(m.name).toBe("Lagerbuch · DRK Bereitschaft Musterstadt");
    expect(m.short_name).toBe("Lagerbuch");
    expect(m.description).toBe("Bestand, Fahrzeuge, Geräte");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe("#C8000F");
    expect(m.background_color).toBe("#EEF0F1");
  });

  it("nennt VIER Symbole, und das SVG heisst `/pwa-icon.svg`", async () => {
    // Der Alt-Eintrag verweist auf `/icon.svg` — DIESE DATEI EXISTIERT NICHT
    // (E7). Ein 1:1-Port uebernaehme einen toten Verweis.
    const m = await (await manifest(anfrage("lagerbuch.localtest.me"))).json();
    expect(m.icons.map((i: { src: string }) => i.src)).toEqual([
      "/pwa-icon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png",
    ]);
    expect(m.icons[3].purpose).toBe("maskable");
  });

  it("jeder genannte Pfad hat einen Handler in diesem Task", async () => {
    // Falle 56: heute prueft niemand, ob die im Manifest genannten Pfade
    // ueberhaupt aufloesen — und /icon-192.png laeuft auf dem Modul-Host ins
    // 404, waehrend dieselbe Datei auf jedem anderen Host ausgeliefert wuerde.
    const m = await (await manifest(anfrage("lagerbuch.localtest.me"))).json();
    const gebaut = new Set(HANDLER.map((h) => `/${h.name}`));
    for (const i of m.icons) expect(gebaut.has(i.src), `${i.src} ohne Handler`).toBe(true);
  });

  it("die ICON-Pfade sind AEUSSER — der Browser sieht den Modul-Host", async () => {
    const m = await (await manifest(anfrage("lagerbuch.localtest.me"))).json();
    for (const i of m.icons) expect(i.src).not.toMatch(/^\/m\/lagerbuch/);
  });
});

describe("Die Icon-Handler liefern BYTES, nicht Text", () => {
  const ERWARTET = [
    { fn: png192, bytes: 1558, sha: "8ba1cec7e6b5590566e218542c2c8ba818726621ca75de724da402740528d607" },
    { fn: png512, bytes: 5458, sha: "deab28e9c5eaa3b1eee2ebc34147bc2632cac7fd865770d35c318a3b68800779" },
    { fn: pngMask, bytes: 3290, sha: "b990ac769739a40a7a0e6e9cb10576b7bd08b4ef186604750f307dc33e3cf559" },
  ];

  for (const [i, e] of ERWARTET.entries()) {
    it(`Icon ${i + 1}: ${e.bytes} Bytes mit dem erwarteten SHA-256`, async () => {
      const puffer = Buffer.from(
        await (await e.fn(anfrage("lagerbuch.localtest.me"))).arrayBuffer(),
      );
      expect(puffer.length).toBe(e.bytes);
      expect(createHash("sha256").update(puffer).digest("hex")).toBe(e.sha);
    });
  }

  it("alle drei antworten mit einer Woche unveraenderlichem Cache", async () => {
    for (const e of ERWARTET) {
      const r = await e.fn(anfrage("lagerbuch.localtest.me"));
      expect(r.headers.get("Cache-Control")).toBe("public, max-age=604800, immutable");
    }
  });
});

describe("Bauform", () => {
  const DATEIEN = HANDLER.map((h) => `src/app/m/lagerbuch/${h.name}/route.ts`);

  it("jede der fuenf ruft `lagerbuchHostOderNull` und NICHT die werfende Form", () => {
    // Ein `notFound()` in einem Manifest-Handler waere eine HTML-Fehlerseite mit
    // Content-Type text/html — der Browser meldete dann „manifest fetch failed"
    // statt eines sauberen 404.
    for (const p of DATEIEN) {
      const q = readFileSync(p, "utf8");
      expect(q, p).toMatch(/lagerbuchHostOderNull/);
      expect(q, p).not.toMatch(/requireLagerbuchHost/);
    }
  });

  it("keine der fuenf liest eine Env-Variable fuer Text oder Host", () => {
    // §10.2: die drei Textwerte kommen aus `_lib/marke.ts`. Und `start_url: "/"`
    // braucht keinen Host — der Browser sieht den aeusseren.
    for (const p of DATEIEN) {
      expect(readFileSync(p, "utf8"), p).not.toMatch(/process\.env/);
    }
  });

  it("keine der fuenf liegt unter `public/`", () => {
    // Die drei PNG wandern aus public/ HERAUS, und das ist eine Reparatur:
    // src/proxy.ts:103 schliesst nur _next/static|_next/image|favicon.ico aus.
    for (const p of DATEIEN) expect(p).toMatch(/^src\/app\/m\/lagerbuch\//);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/pwa.route.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./manifest.webmanifest/route"`.

- [ ] **Schritt 3: Die fünf Handler schreiben**

`src/app/m/lagerbuch/manifest.webmanifest/route.ts`:

```ts
import { lagerbuchHostOderNull } from "../_lib/host";
import { LAGERBUCH_MARKE, LAGERBUCH_ORGANISATION, LAGERBUCH_ZEILE } from "../_lib/marke";

/**
 * DAS PWA-MANIFEST — §7.10.2. Route Handler UNTER dem Modul, nicht in `app/`
 * oder `public/` (§2.7). Der Browser sieht ihn auf einem Root-Pfad des
 * MODUL-Hosts; auf jedem anderen Host rewritet derselbe Pfad in DESSEN Modul
 * und laeuft ins Leere.
 *
 * ⚠️ DER HOST-RIEGEL IST DIE ERSTE ANWEISUNG — sonst bewirbt JEDER Suite-Host
 * eine Lagerbuch-PWA (Falle 56). Zusammen mit `metadata.manifest` im
 * MODUL-Layout (Teil 1, T6) statt im Root-Layout ist das die vollstaendige
 * Abhilfe: heute steht der Verweis in lagerbuchs Root-Layout (`layout.tsx:28`),
 * und dort wuerde ihn in der Suite jeder Host tragen.
 *
 * ⚠️ `lagerbuchHostOderNull` und NICHT die werfende Form: ein `notFound()`
 * waere eine HTML-Fehlerseite mit `Content-Type: text/html`, und der Browser
 * meldete „manifest fetch failed" statt eines sauberen 404.
 *
 * DER INHALT BLEIBT ZEICHENGLEICH (1:1-Pflicht): diese Werte bestimmen auf
 * jedem Helfer-Handy Symbol, Splash-Farbe und Startziel — UND SIE WERDEN BEIM
 * INSTALLIEREN EINGEBRANNT. Ein spaeterer Tausch erreicht kein Geraet, auf dem
 * die App schon liegt.
 *
 * ⚠️ `start_url: "/"` und `scope: "/"` BLEIBEN RICHTIG — der Browser sieht den
 * externen Modul-Host, der Rewrite ist serverintern unsichtbar. BEDINGUNG:
 * `SUITE_HOST_LAGERBUCH` ist gesetzt. Ist es das nicht, zeigt `start_url` aufs
 * PORTAL, und eine installierte PWA startet im falschen Modul
 * (Runbook-Eingabe R2, §7.13.4).
 */
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  if (!lagerbuchHostOderNull(new Headers(req.headers))) {
    return new Response("Not found", { status: 404 });
  }

  const manifest = {
    name: `${LAGERBUCH_MARKE} · ${LAGERBUCH_ORGANISATION}`,
    short_name: LAGERBUCH_MARKE,
    description: LAGERBUCH_ZEILE,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#EEF0F1",
    theme_color: "#C8000F",
    icons: [
      // ⚠️ `/pwa-icon.svg`, NICHT `/icon.svg`: der Alt-Eintrag
      // (`manifest.webmanifest/route.ts:19`) verweist auf eine Datei, DIE ES
      // NICHT GIBT — `ls ../lagerbuch/public/` liefert nur `.gitkeep` und die
      // drei PNG. Ein 1:1-Port uebernaehme einen toten Verweis (E7).
      { src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
```

`src/app/m/lagerbuch/pwa-icon.svg/route.ts`:

```ts
import { lagerbuchHostOderNull } from "../_lib/host";
import { PWA_ICON_SVG } from "../_lib/pwaIcons";

/** §7.10.2. Host-Riegel als erste Anweisung; das Zeichen selbst steht in T65 (A-E1). */
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  if (!lagerbuchHostOderNull(new Headers(req.headers))) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(PWA_ICON_SVG, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
```

`src/app/m/lagerbuch/icon-192.png/route.ts`:

```ts
import { lagerbuchHostOderNull } from "../_lib/host";
import { ICON_192_BASE64, pngAntwort } from "../_lib/pwaIcons";

/**
 * §7.10.2. DIE BYTES WANDERN AUS `public/` HERAUS, und das ist eine REPARATUR,
 * kein Aufraeumen: `src/proxy.ts:103` schliesst vom Matcher nur
 * `_next/static|_next/image|favicon.ico` aus. `/icon-192.png` wird auf dem
 * lagerbuch-Host nach `/m/lagerbuch/icon-192.png` umgeschrieben und laeuft ins
 * 404 — waehrend dieselbe Datei auf JEDEM ANDEREN Host an der Wurzel
 * ausgeliefert wuerde (Falle 56).
 */
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  if (!lagerbuchHostOderNull(new Headers(req.headers))) {
    return new Response("Not found", { status: 404 });
  }
  return pngAntwort(ICON_192_BASE64);
}
```

`src/app/m/lagerbuch/icon-512.png/route.ts`:

```ts
import { lagerbuchHostOderNull } from "../_lib/host";
import { ICON_512_BASE64, pngAntwort } from "../_lib/pwaIcons";

/** §7.10.2, siehe `icon-192.png/route.ts` — dieselbe Begruendung (Falle 56). */
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  if (!lagerbuchHostOderNull(new Headers(req.headers))) {
    return new Response("Not found", { status: 404 });
  }
  return pngAntwort(ICON_512_BASE64);
}
```

`src/app/m/lagerbuch/icon-maskable-512.png/route.ts`:

```ts
import { lagerbuchHostOderNull } from "../_lib/host";
import { ICON_MASKABLE_512_BASE64, pngAntwort } from "../_lib/pwaIcons";

/** §7.10.2, siehe `icon-192.png/route.ts` — dieselbe Begruendung (Falle 56). */
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  if (!lagerbuchHostOderNull(new Headers(req.headers))) {
    return new Response("Not found", { status: 404 });
  }
  return pngAntwort(ICON_MASKABLE_512_BASE64);
}
```

⚠️ **Die drei PNG-Handler sind absichtlich Kopien und werden NICHT zu einer Fabrik zusammengezogen.**
Next.js leitet die Route aus dem **Verzeichnisnamen** ab; eine Fabrik bräuchte trotzdem drei
Verzeichnisse mit je einer Datei, und die Datei wäre dann eine Zeile, die auf einen Namen zeigt, den
das Verzeichnis schon trägt. **Drei Zeilen Wiederholung sind billiger als eine Indirektion, die den
Zusammenhang zwischen Verzeichnisname und Byte-Konstante verbirgt.**

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/pwa.route.test.ts
```

Erwartet: PASS, 27 Zusicherungen.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
git add src/app/m/lagerbuch/manifest.webmanifest src/app/m/lagerbuch/pwa-icon.svg \
        src/app/m/lagerbuch/icon-192.png src/app/m/lagerbuch/icon-512.png \
        src/app/m/lagerbuch/icon-maskable-512.png src/app/m/lagerbuch/pwa.route.test.ts
git commit -m "feat(lagerbuch): die fuenf PWA-Route-Handler unter dem Modul (Falle 56)

Die drei PNG wandern aus public/ heraus, und das ist eine Reparatur:
src/proxy.ts:103 schliesst vom Matcher nur _next/static|_next/image|favicon.ico
aus. /icon-192.png wird auf dem lagerbuch-Host nach /m/lagerbuch/icon-192.png
umgeschrieben und laeuft ins 404 — waehrend dieselbe Datei auf jedem ANDEREN
Host an der Wurzel ausgeliefert wuerde.

Alle fuenf tragen lagerbuchHostOderNull als erste Anweisung, sonst bewirbt jeder
Suite-Host eine Lagerbuch-PWA. Die nicht-werfende Form, weil ein notFound() eine
HTML-Fehlerseite mit text/html waere und der Browser 'manifest fetch failed'
meldete statt eines sauberen 404.

Der Manifest-Inhalt bleibt zeichengleich — die Werte werden beim INSTALLIEREN
eingebrannt, ein spaeterer Tausch erreicht kein Geraet, auf dem die App schon
liegt. Die drei Textwerte kommen aus _lib/marke.ts statt aus Env-Variablen, und
/icon.svg wird zu /pwa-icon.svg: der Alt-Eintrag verweist auf eine Datei, die
es nicht gibt.

Der Test prueft, dass JEDER im Manifest genannte Pfad einen Handler hat — heute
prueft das niemand."
```

---

**Gate Stufe 7.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

⚠️ **Ist Teil 5s T114 nicht eingecheckt, schlägt dieses Gate an GENAU EINER Importzeile fehl** —
`import { bucheEntnahmeHelfer } from "../../_actions/buchung";` in T83. **Die Abhilfe ist die
Vorbedingung dieser Welle (§6.3, A2), nicht eine zweite `_actions/buchung.ts`.** Wer die Datei hier
anlegt, um das Gate grün zu bekommen, erzeugt zwei Orte für dieselbe Invariante (H7) und macht Teil 6s
Zählung `47 / 44 / 3 / 18 / 19` unerreichbar.

---

## Welle 8 — Abnahme (1 Task)

---

### Task 87: **Abnahme** — die Verschärfung, die Abrufprobe und die Bestandsaufnahme

**Files:**
- Modify: `src/app/m/lagerbuch/_lib/bauform.test.ts` (**Verschärfung**, E9)
- — sonst nur Ausführung und Protokoll

**Interfaces:**
- Consumes: alles aus T62–T86.
- Produces: die Aussage „**§7 ist eingelöst**", ohne die Teil 5 und Teil 6 nicht abschließen können.

**Abnahme, nicht TDD.** Dieser Task prüft **zusammengesetztes** Verhalten, das zum Zeitpunkt seiner
Entstehung schon gebaut ist. Er ist von Anfang an grün, und das ist **kein** Mangel. **Was er fängt**,
sind fünf Mutationen, gegen die kein einzelner Task-Test etwas ausrichtet, weil sie **zwischen** den
Dateien liegen:

| Mutation | Warum kein Task-Test sie fängt |
|---|---|
| Eine der drei Weichen-Dateien verliert ihren Host-Riegel, **nachdem** T64 gelaufen ist | Der Scan aus T64 steht in **Eigenschaftsform** („falls die Datei existiert") — er ist grün, solange die Datei fehlt, und niemand fährt ihn nach dem letzten Commit noch einmal bewusst |
| Eine neue `_ui/`-Datei importiert `antd`, weil sie **nach** dem Scan entstand | Derselbe Grund: der Scan läuft über den Baum, wie er zur Laufzeit ist |
| Die Tab-Leiste liegt bei 390×844 **unter** dem Bildschirmrand (Falle 41) | `documentElement.scrollWidth` allein sieht einen 96px-Überlauf **nicht**, und Vitest wertet Layout gar nicht aus |
| `metadata.manifest` steht im Root- statt im Modul-Layout | `pnpm build` ist grün; erst ein Abruf gegen **zwei** Hosts zeigt es |
| Ein Icon-Pfad im Manifest löst nicht auf | Beide Tests sind grün: der eine prüft den String, der andere die Antwort auf einen anderen String |

- [ ] **Schritt 1: Die Weichen-Zeile in `_lib/bauform.test.ts` VERSCHÄRFEN (E9)**

Teil 2 (T21) hat die Weichen-Zusicherung in **Eigenschaftsform** angelegt: „falls die Datei
existiert". Jetzt — und **erst** jetzt — existieren zwei der drei Dateien. An die Stelle der
vorhandenen Zeile tritt:

```ts
describe("Teil 4, T87 — die Weichen-Dateien existieren UND tragen den Host-Riegel", () => {
  /**
   * DIE VERSCHAERFUNG (E9). Bis hierher galt „falls die Datei existiert" — ein
   * Scan mit Existenzpflicht in Welle 1 waere am ersten Tag rot gewesen und
   * abgeschaltet statt repariert worden.
   *
   * ⚠️ SIE NENNT NUR ZWEI DER DREI DATEIEN. `g/[code]/page.tsx` entsteht erst
   * in TEIL 6 (E1, dort J3/T164) und bleibt bis dahin in der
   * Eigenschaftsform; TEIL 6 fuehrt sie in die Existenzpflicht ueber. Wer sie
   * hier schon hart verlangt, macht diesen Plan von einem spaeteren abhaengig.
   */
  const PFLICHT = [
    "src/app/m/lagerbuch/page.tsx",
    "src/app/m/lagerbuch/a/[artikelId]/page.tsx",
  ];
  const NOCH_NICHT = ["src/app/m/lagerbuch/g/[code]/page.tsx"];   // Teil 6, T164

  for (const pfad of PFLICHT) {
    it(`${pfad} existiert`, () => {
      expect(existsSync(pfad)).toBe(true);
    });

    it(`${pfad} ruft requireLagerbuchHost`, () => {
      expect(readFileSync(pfad, "utf8")).toMatch(/requireLagerbuchHost\(/);
    });

    it(`${pfad} benutzt das PRAEDIKAT, nicht den Admin-Riegel`, () => {
      // `requireLagerbuchAdmin()` wuerfe jede Person OHNE Sitzung nach /login —
      // also genau die Helferin, fuer die beide Seiten gebaut sind (§3.2.1).
      const q = readFileSync(pfad, "utf8");
      expect(q).toMatch(/istLagerbuchAdmin/);
      expect(q).not.toMatch(/requireLagerbuchAdmin|moduleAdminPageOrNotFound|isModuleAdmin/);
    });
  }

  for (const pfad of NOCH_NICHT) {
    it(`${pfad}: falls vorhanden, traegt sie die Regel (Teil 6 verschaerft)`, () => {
      if (!existsSync(pfad)) return;
      expect(readFileSync(pfad, "utf8")).toMatch(/requireLagerbuchHost\(/);
    });
  }

  it("die drei Route Handler mit Datenwirkung tragen die NICHT-werfende Form", () => {
    // Ein notFound() ist keine brauchbare Antwort auf einen gescannten QR-Code
    // bzw. auf eine Manifest-Anfrage (Teil 1, T10).
    for (const pfad of [
      "src/app/m/lagerbuch/t/[code]/route.ts",
      "src/app/m/lagerbuch/manifest.webmanifest/route.ts",
      "src/app/m/lagerbuch/icon-192.png/route.ts",
    ]) {
      const q = readFileSync(pfad, "utf8");
      expect(q, pfad).toMatch(/lagerbuchHostOderNull/);
      expect(q, pfad).not.toMatch(/requireLagerbuchHost/);
    }
  });

  it("`helfer/layout.tsx` traegt BEIDE Riegel und KEINEN Rahmen", () => {
    const q = readFileSync("src/app/m/lagerbuch/helfer/layout.tsx", "utf8");
    expect(q).toMatch(/requireLagerbuchHost\(/);
    expect(q).toMatch(/requireHelferSitzung\(/);
    expect(q).not.toMatch(/HelferRahmen/);
  });
});
```

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Erwartet: PASS. **Grün von Anfang an — das ist der Punkt einer Abnahme.**

- [ ] **Schritt 2: Die vier Gates fahren**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

- [ ] **Schritt 3: Die Bestandsaufnahme — mechanisch nachzählen**

```bash
# 14 Routen dieses Plans (Teil 6, §2.1 zählt sie nach).
ls -d src/app/m/lagerbuch/page.tsx \
      "src/app/m/lagerbuch/t/[code]/route.ts" \
      "src/app/m/lagerbuch/a/[artikelId]/page.tsx" \
      src/app/m/lagerbuch/helfer/page.tsx \
      src/app/m/lagerbuch/helfer/check/page.tsx \
      src/app/m/lagerbuch/manifest.webmanifest/route.ts \
      src/app/m/lagerbuch/pwa-icon.svg/route.ts \
      src/app/m/lagerbuch/icon-192.png/route.ts \
      src/app/m/lagerbuch/icon-512.png/route.ts \
      src/app/m/lagerbuch/icon-maskable-512.png/route.ts | wc -l     # → 10

# Die drei Action-Dateien mit ihren VIER Deklarationen (E10, Teil 6 §4.1).
grep -c "^export async function" src/app/m/lagerbuch/_actions/gate.ts       # → 1
grep -c "^export async function" src/app/m/lagerbuch/_actions/sitzung.ts    # → 2
grep -c "^export async function" src/app/m/lagerbuch/_actions/check.ts      # → 1

# KEIN buchung.ts aus diesem Plan (Korrektur zu E10): sie gehoert Teil 5, H7.
git log --oneline -- src/app/m/lagerbuch/_actions/buchung.ts | head -1
```

⚠️ **Die zehn Zeilen oben sind zehn DATEIEN, nicht zehn Routen.** Die Routenzählung aus Teil 6, §2.1
(„14 der 36 Routen") zählt zusätzlich `/helfer` **und** `/helfer/check` je als eigene Route sowie den
Gate-Pfad `/` unter beiden Formen; **die maßgebliche Zählung ist Teil 6s Abrufliste, nicht diese
Aufstellung.** Sie steht hier, damit ein Umsetzer sieht, **welche Dateien** er geliefert hat.

- [ ] **Schritt 4: Die Abrufprobe — was die vier Gates strukturell nicht sehen**

⚠️ **Das ist der einzige Punkt dieses Plans, an dem eine gerenderte Seite betrachtet wird.** Er
braucht die Konfiguration aus Teil 3, T60 (`SUITE_HOST_LAGERBUCH`, Sitzungsgeheimnis, Seed).

```bash
pnpm dev &        # Dev-Server auf 3000, Wildcard-DNS über *.localtest.me
# Seed aus T59/T60 einspielen, damit ein gültiger Code existiert.
```

| # | Aufruf | Erwartung | Fängt |
|---|---|---|---|
| 1 | `curl -si http://lagerbuch.localtest.me:3000/` | **200**, HTML enthält `Im Dienst` **und** `Verwaltung` | Falle 1/7 (antd in RSC ⇒ 500), Falle 6 (Wert aus Client-Modul) |
| 2 | `curl -si http://lagerbuch.localtest.me:3000/?grund=code` | HTML enthält `Dieser Code ist unbekannt oder wurde gesperrt.` | Falle 60 — der Parameter wird **gelesen** |
| 3 | `curl -si http://lagerbuch.localtest.me:3000/t/<seed-code>` | **303**, `Location: /helfer` (relativ, **ohne** Schema und Host), `Set-Cookie: helfer_session=…` **ohne** `Domain=` | Falle 16 — die **Form**; den Mehrhost-Fall belegt erst Teil 6, T171 |
| 4 | `curl -si http://lagerbuch.localtest.me:3000/manifest.webmanifest` | **200**, `Content-Type: application/manifest+json` | Falle 56 |
| 5 | `curl -si http://portal.localtest.me:3000/manifest.webmanifest` | **nicht** das lagerbuch-Manifest | Falle 56 — der Host-Riegel |
| 6 | `curl -sio /dev/null -w '%{http_code} %{size_download}\n' http://lagerbuch.localtest.me:3000/icon-192.png` | `200 1558` | Falle 56 — heute **404** |
| 7 | `curl -si http://feedback.localtest.me:3000/m/lagerbuch/helfer` | **404** | Falle 61 — der modulinterne Host-Riegel |

**Und die zwei Messungen am Bildschirm, die `curl` nicht leisten kann.** Sie brauchen einen Browser
mit gesetztem `helfer_session`-Cookie (aus Aufruf 3):

```
Bei 390×844  und  bei 1280×720, auf /helfer UND auf /helfer/check:
  a) [data-testid="lb-tableiste"] ist im Sichtbereich — nicht unter dem Bildschirmrand;
  b) document.documentElement.scrollWidth === document.documentElement.clientWidth;
  c) genau EIN a[aria-current="page"] in der Tab-Leiste, und er trägt den richtigen Text.
```

⚠️ **(a) und (b) sind zwei verschiedene Aussagen, und (b) allein genügt NICHT** (Falle 41): ein
96px-Überlauf **nach unten** — `FullShell`s 64px Kopf plus 2×16px `SPACE.lg` gegen ein
`100dvh`-Kind — lässt `scrollWidth` **unverändert**. Genau dieser Überlauf macht die Umschaltung
zwischen Entnahme und Fahrzeug-Check auf einem Handy unerreichbar, und er ist der Grund für
Entscheidung 28 (d). „Wer nur die Enden misst, prüft die Mitte nicht" — deshalb **beide** Breiten.

⚠️ **(c) ist hier nur eine Vorprüfung.** Der belastbare Nachweis für Falle 63 fährt **unter dem
Rewrite auf dem Modul-Host** und gehört zu **Teil 6, T171** (E11). Ein grünes (c) hier widerlegt
nichts und beweist wenig — es fängt lediglich den Fall, dass die Prop gar nicht durchgereicht wird.

- [ ] **Schritt 5: Das Protokoll schreiben**

Die sieben Aufrufe und die zwei Messungen mit **Datum, Next-Version und Ergebnis** in die
Abnahme-Notiz des Branches. **Ohne Protokoll ist die Abnahme eine Behauptung** — und die drei
Runbook-Eingaben (R1, R2, R3) hängen daran, dass jemand später nachvollziehen kann, **was gemessen
wurde und was nicht.**

- [ ] **Schritt 6: Commit**

```bash
git add src/app/m/lagerbuch/_lib/bauform.test.ts
git commit -m "test(lagerbuch): Abnahme Teil 4 — Weichen-Verschaerfung und Abrufprobe

Die Weichen-Zeile aus Teil 2 (T21) wird von der Eigenschaftsform in die
Existenzpflicht ueberfuehrt (E9) — und zwar fuer ZWEI der drei Dateien:
g/[code]/page.tsx entsteht erst in Teil 6 (E1) und bleibt bis dahin bedingt.
Ein Scan mit Existenzpflicht in Welle 1 waere am ersten Tag rot gewesen und
abgeschaltet statt repariert worden.

Dazu die Abrufprobe gegen einen laufenden Server — der einzige Punkt dieses
Plans, an dem eine gerenderte Seite betrachtet wird. Sie faengt, was die vier
Gates strukturell nicht sehen: antd/Icons in RSC (HTTP 500), den gelesenen
?grund=-Parameter, die 303-Form mit relativem Location, Manifest und Icons auf
dem Modul-Host und ihr Fehlen auf dem Portal, den modulinternen Host-Riegel —
und die Tab-Leiste bei 390×844 UND 1280×720. scrollWidth allein sieht einen
96px-Ueberlauf nach unten nicht.

Was diese Probe NICHT belegt, belegt Teil 6, T171: den Mehrhost-Fall von
Falle 16 und aria-current unter dem Rewrite (Falle 63)."
```

---

## 5. Abschluss-Abnahme von Teil 4

Vor der Übergabe an Teil 5 und Teil 6 abhaken:

- [ ] `pnpm typecheck` grün
- [ ] `pnpm lint` ohne **Fehler** (Warnungen erlaubt)
- [ ] `pnpm vitest run` grün
- [ ] `pnpm build` grün
- [ ] `_lib/bauform.test.ts` grün — **mit** der Verschärfung aus T87, und die fünf Teil-4-Scans laufen
- [ ] `_actions/guards.test.ts` (Teil 2, T20) grün — er ist in **Eigenschaftsform** und zählt hier
      noch nicht; er belegt, dass **keine** der vier neuen Deklarationen ungeschützt ist
- [ ] **3 Action-Dateien mit 4 Deklarationen** angelegt: `gate.ts` (1), `sitzung.ts` (2),
      `check.ts` (1) — **1 bewacht, 3 Ausnahmen** (E10, Teil 6 §4.1)
- [ ] **`_actions/buchung.ts` wurde NICHT von diesem Plan angelegt** (Korrektur zu E10; sie gehört
      Teil 5, H7)
- [ ] `_ui/helfer.module.css` trägt **alle fünfzehn Neutralen und alle acht `--lb-ampel-*`** in
      beiden Modi — Teil 5s `_lib/ampel.test.ts` (T100) muss danach **ohne jede Änderung** grün sein
- [ ] Die sieben Abrufe und die zwei Bildschirmmessungen aus T87 sind **protokolliert**
- [ ] `e2e/lagerbuch-helfer.spec.ts` ist **NICHT** angelegt — sie gehört Teil 6, T171 (E11)
- [ ] `g/[code]/page.tsx` ist **NICHT** angelegt — sie gehört Teil 6, T164 (E1)
- [ ] Die drei Runbook-Eingaben R1, R2, R3 stehen in der Übergabe

---

## 6. Was dieser Teil ausdrücklich NICHT liefert — und wo es liegt

### 6.1 Die Zuordnung Server Action → Seite → Bedienelement (Auflage aus §6.12, Frage 1)

Teil 5 führt diese Tabelle für seine **43** Deklarationen (teil5.md:501-546). Die **vier** dieses
Plans fehlen dort. **Erst beide Tabellen zusammen sind die Zusicherung „keine Action ohne Weg":**

| # | Action | Datei | Seite | Bedienelement | ☐ |
|---|---|---|---|---|---|
| 44 | `einloesenAmGate` | `_actions/gate.ts` (T73) | **`/`** (das Gate, T81) | `_ui/Gate.tsx` — Karte „Im Dienst": Zahlenfeld `input[name=code]` + Absendeknopf „Weiter". `useActionState`; der Fehlertext erscheint an **derselben** Stelle wie die Meldung aus `?grund=` | ☐ |
| 45 | `erneuereSitzung` | `_actions/sitzung.ts` (T74) | **`/helfer/check`** (T85) | `_ui/CheckFlow.tsx` — der **Abschlussbereich**, aber **nur bei `grund === "sitzung"**`: Zahlenfeld `[data-rolle=erneuern-code]` + Knopf „Weiter". ⚠️ **Der Weg ist bedingt sichtbar** — genau die Form, die §6.12 als Kandidat für „Action ohne Weg" nennt; er ist hier **gewollt** (§7.4.4) und durch den DOM-Test aus T79 belegt | ☐ |
| 46 | `beenden` | `_actions/sitzung.ts` (T74) | **`/helfer`, `/helfer/check`, `/a/<id>`** (T84, T85, T83) | `_ui/HelferRahmen.tsx` — im Kopf, `<form action={beenden}>` mit Absendeknopf „Beenden". **Kein Link:** ein Prefetch, der die Sitzung beendet, ist die Sorte Fehler, die niemand reproduziert | ☐ |
| 47 | `checkAbschluss` | `_actions/check.ts` (T75) | **`/helfer/check`** (T85) | `_ui/CheckFlow.tsx` — der Knopf `[data-rolle=abschliessen]` im **letzten** Schritt der adaptiven Folge. Beschriftung je Schritt: „Abschließen" (Geräte, Sauerstoff) bzw. „Gelegt & abschließen" (Nachfüllen) | ☐ |

⚠️ **Zeile 45 ist der einzige bedingt sichtbare Weg dieses Plans**, und er ist es aus einem benannten
Grund: bei `grund === "gesperrt"` erscheint das Feld **nicht**, weil ein erneutes Einlösen desselben
Codes genauso scheitert — **ein Feld anzubieten, das nicht helfen kann, ist schlimmer als keins**
(§7.4.4). `darfErneuern` (T63) ist die eine Stelle, an der das entschieden wird.

### 6.2 Dateien, die §7 beschreibt und die anderen Plänen gehören

| Was | Wem | Warum |
|---|---|---|
| `g/[code]/page.tsx` | **Teil 6, T164** (dort J3) | **E1**: `/g` rendert **überhaupt nur einen** Zustand, und der trägt `_ui/VerwaltungsRahmen.tsx` **mit Shell und Modulnavigation** (§2.9, §8.1 8-C2, §11.3) — eine Datei aus Teil 5. Die zwei Alternativen sind benannt und beide schlecht: ein `notFound()` mit Einlöser in einem *anderen* Plan, oder ein zweiter, shell-loser Rahmen, der **genau den Mangel nachbaut, den §11.3 repariert**. **Was dieser Plan dafür liefert: `_lib/barcode.ts#normalisiereBarcode` (T62)** — die einzige Reihenfolgebindung von Teil 6 nach außen |
| `e2e/lagerbuch-helfer.spec.ts` | **Teil 6, T171** (dort J2) | **E11**, umgeschrieben. Teil 6 hat sie übernommen und mit T171 einen **geschriebenen** Task dafür. Es gibt in keinem Fall **zwei** Helfer-Specs. Dieser Plan schuldet ihr drei Merkmale: `data-testid="lb-tableiste"` und die `aria-current`-Prop-Ableitung (T76), die 303-Form mit relativem `Location` (T82), und den lesbaren `?grund=code`-Satz (T81) |
| `_actions/buchung.ts`, auch `bucheEntnahmeHelfer` | **Teil 5, T114** (dort H7) | **Korrektur zu E10.** Alle drei Buchungs-Actions teilen sich `fefoAbbuchung` und dieselbe Zod-Basis; zwei Dateien für einen Buchungsvorgang wären zwei Orte für dieselbe Invariante. Teil 4 **ruft** `bucheEntnahmeHelfer` aus `_ui/Entnahme.tsx` (T78) — als **Prop**, importiert nur in T83 |
| `_lib/returnTo.ts`, `_lib/tokenZiel.ts` | **Teil 2, T19** (dort G6) | Beide stehen in §3.1s Umzugstabelle. `returnTo.ts` ist zwingend dort, weil `adminLandingPfad` es ruft; `tokenZiel.ts` wandert mit, weil es acht Zeilen sind und der Alternativzustand — „Teil 4 erfindet es neu" — **genau die Doppelung ist, gegen die die Eigentümertabellen gebaut sind** |
| `_lib/code.ts` | **Teil 2, T17** | Ihr `Produces`-Block nennt die drei Konsumenten namentlich, **alle in Teil 4** |
| `abmelden/route.ts` | **Teil 2, T26** | Ein Layout ist eine Server Component und kann kein Cookie räumen. **Kein Doppel zu `beenden`** — die beiden lösen zwei verschiedene Lagen (§3.1) |
| `_ui/ikonen.tsx` (36-Namen-Union) | **Teil 5, T101** (dort H6) | **E3**, und die Auflösung des Widerspruchs ist die **Reihenfolge**: Teil 5 läuft **nach** Teil 4, also kann Teil 4 die Datei nicht importieren. Jede Teil-4-Datei trägt ihre Zeichen als lokales Inline-`<svg>`. **Benannter Einlöser: T101 hebt sie** — und das kostet nichts, weil **kein** Test dieses Plans auf ein SVG-`d`-Attribut zusichert. Die Hebung ist ein reiner Import-Tausch |
| `_ui/Plakette.tsx`, `_ui/Chip.tsx` | **Teil 5, T107 / T105** | Dieselbe Reihenfolge-Begründung. `_ui/Entnahme.tsx` rendert die FEFO-Zeile mit `HelferChip` (T70) und `fmtVerfall` — **vollständig und geprüft**; die Plakette kann später additiv danebentreten |
| `core/shell/shell.module.css` (`.modulnav`, Entscheidung 31) | **Teil 5** | Teil 1s Abschlusstabelle nennt sie irrtümlich „Teil 4". Sie betrifft die **Verwaltungs**-Navigation, und dieser Zweig hat gar keine (§7.1.1) |

### 6.3 Vier Auflagen, die dieser Plan an andere stellt

Jede ist **namentlich zugewiesen** und hat ein Subjekt, das existiert:

| # | An wen | Auflage | Was ohne sie passiert |
|---|---|---|---|
| A1 | **Teil 5, T114, Schritt 2** (der Rumpf von `_actions/buchung.ts`; die betroffenen Zeilen stehen in teil5.md:5931-5969) | `bucheEntnahmeHelfer` gibt **`HelferErgebnis<{gebucht:number}>`** zurück, und **`gebucht === 0` ist `{ok:false, grund:"leer", text: leerText(artikelName)}`** — nicht `{ok:true, wert:{gebucht:0}}`, wie die heutige Fassung schreibt. Der Artikelname steht dem Server zur Verfügung (er hat `artikelId` und das Handle). Der Riegel-Nein-Zweig gibt `grund` mit durch, statt ihn in einen Freitext zu falten | §7.3 nennt genau das den **teuersten Zustand der Tabelle**: „Ein 200, das lügt." Der Bestand macht daraus „Entnahme gebucht: 0 × X" — **grün, mit Häkchen**. Und der DOM-Test aus §7.12.3 hätte kein Subjekt |
| A2 | **Teil 5, T114** | Wird **vorgezogen** und läuft **vor** Welle 7 dieses Plans. Sie hängt nur an Teil 2 und Teil 3 | Sonst schlagen `pnpm typecheck` und `pnpm build` an **genau einer** Importzeile in T83 fehl. Die Abhilfe ist das Vorziehen — **nicht** eine zweite `_actions/buchung.ts` |
| A3 | **Teil 5, T100** | Der Ampel-Scan in `_lib/ampel.test.ts` läuft über `_ui/verwaltung.module.css` **UND** `_ui/helfer.module.css`. Er ist so schon geschrieben (`pflicht: false`) und **muss nach T64 ohne jede Änderung grün sein** | §6.6.2, Punkt 4 wörtlich: „ein Scan über nur eine von beiden ließe die Hälfte driften". Ohne ihn stünde die Palette in Teil 4 unverbunden da, und ein späterer „schönerer" Farbtausch in `ampel.ts` ließe den Helfer-Zweig **still** zurück |
| A4 | **Teil 6, T171** | Die Spec-Datei prüft **den Mehrhost-Fall von Falle 16** und **`aria-current` unter dem Rewrite** (Falle 63). T87 dieses Plans prüft beides **nicht** und behauptet es auch nirgends | Beide sind in Vitest **strukturell** nicht darstellbar: `token-redeem.test.ts:3` mockt die Basis-URL auf denselben Host wie der Testserver, und `core/shell/SuiteNav.test.tsx:48` mockt `next/navigation`. Ohne T171 bleibt „44 von 44" und „das Cookie landet richtig" eine Absichtserklärung |

### 6.4 Drei Korrekturen an Nachbarplänen, die dieser Plan nachweist

Sie sind **Schreibfehler in Kommentaren, keine Planänderungen** — und sie erzeugen **keine** zweiten
Dateien:

1. **Die Komponente heißt `_ui/Entnahme.tsx`.** §2.1 (Zeile 358) führt sie so, und der
   Verzeichnisbaum ist verbindlich. ✅ **Erledigt am 04.08.2026:** Teil 5 nannte sie an fünf Stellen
   `HelferEntnahme.tsx` und führt sie seither ebenso. Der Name `HelferEntnahme` kommt dort nur noch
   als Zod-Konstante im Rumpf von `_actions/buchung.ts` vor und als Beleg auf die **Alt**-Datei —
   beides richtig.
2. **Teil 4 steuert 3 Dateien mit 4 Deklarationen bei, nicht „4 Dateien, 5 Exporte".** Die frühere
   Fassung von E10 zählte `buchung.ts` doppelt; verbindlich ist Teil 6, §4.1/§4.2 — **47 / 44 / 3 /
   18 / 19**.
3. **`_ui/BarcodeScanner.tsx` nimmt `nichtGefunden` OPTIONAL.** Teil 5, T138 ruft ihn mit **zwei**
   Props (`{ zuBarcode, zielPfad }`, `teil5.md`, T138 `Consumes`); ein dritter **Pflicht**-Prop bräche beide
   Verwaltungsseiten, die schon geschrieben sind.

### 6.5 Was §7 selbst offenlässt und dieser Plan deshalb auch

| Frage | Wo sie hingehört |
|---|---|
| Ob `tokens.scope_lagerort_id` je ein **Riegel** wird | Betreiber, offene Frage 5. **Zwei Ansatzpunkte sind markiert** — die `gewaehlt`-Zeile (T85) und die erste Zeile von `checkAbschluss` (T75). Mehr braucht es dann nicht |
| Ob im Lagerraum **Netz** anliegt | Betreiber, offene Frage 6. Annahme **A-E2: es liegt Netz an.** Ist sie falsch, ist die Antwort ein **Access Point** und kein Service Worker — Grund 3 aus §7.10.1 gilt unabhängig von der Antwort |
| Ob **Hersteller-EANs** im Bestand stehen | Betreiber, offene Frage 8. Die sieben `POSSIBLE_FORMATS` bleiben **zeichengleich** in beiden Fällen |
| ~~Wie das **PWA-Symbol** aussieht~~ | ✅ **entschieden (D12, 04.08.2026):** das vorhandene Zeichen wird byte-exakt wiederverwendet (E7, T65). Offen bleibt allein, ob die Lagerbuch-Domain ein eigenes **Lesezeichen**-Symbol bekommen soll — das wäre eine Suite-Frage, keine Modulfrage |
| Die `revalidatePath`-Listen der **Verwaltungs**-Actions | §0.3 Punkt 1, §15.3 Nr. 23 — „enumerierbare Arbeit ohne Eigentümer". Dieser Plan liefert seine **sechs** (T75) und erfindet keine fremden |
| `TZ=Europe/Berlin` **setzen** | Runbook. Das Modul hängt bewusst **nicht** an der Prozess-`TZ`; `ZEITZONE` ist eine Modulkonstante (§4.5) |

---

## 7. Was dieser Teil dem Runbook schuldet

Die drei Eingaben aus §0 gehören **vor dem Cutover** beantwortet. **Zwei davon sind ohne Antwort still
schädlich** — sie brechen nichts sichtbar, sie machen etwas wirkungslos:

| # | Eingabe | Wer | Wann |
|---|---|---|---|
| R1 | Die heutige `APP_BASE_URL` **im Wortlaut**, und die Bestätigung, dass `SUITE_HOST_LAGERBUCH` **zeichengleich derselbe Host** ist | Betreiber | **vor** dem Cutover |
| R2 | Nach dem Umschwenken: `curl -si https://lagerbuch.iuk-ue.de/manifest.webmanifest` und `/icon-192.png` gegen §7.10.2 halten; `curl -si https://<portal-host>/manifest.webmanifest` darf das lagerbuch-Manifest **nicht** liefern | Betrieb | **direkt nach** dem Umschwenken |
| R3 | Generalprobe, **ein Gerät**: PWA installieren, im Browser einlösen, Regaletikett mit der **Systemkamera** scannen — notieren, ob eine Sitzung da ist | Betrieb | Generalprobe |

⚠️ **R1 ist die teuerste der drei.** `helferCookieOptionen()` setzt `path:"/"` **ohne** `domain`; das
Cookie ist host-only. Weicht der neue Host ab, ist die Übernahme des Sitzungsgeheimnisses
(Betreiber-Entscheidung 4) **wirkungslos** — **jede laufende Feld-Sitzung endet beim Cutover, und kein
Test sieht das.** Weicht er ab, gehört in die Cutover-Kommunikation der Satz: **„alle Helfer müssen ihr
Kärtchen einmal neu scannen."**

⚠️ **R3 hat keine Codeantwort.** Auf iOS führt ein zum Startbildschirm hinzugefügtes Web-App-Fenster
eine **eigene** Speicherpartition; ein `helfer_session`-Cookie aus dem Browser ist dort nicht sichtbar
und umgekehrt. Fällt der Test negativ aus, ist die Abhilfe **ein Satz in der Übergabe** — „Entweder
die App vom Startbildschirm benutzen **oder** über die Kamera, nicht gemischt" —, und die
Inline-Erneuerung aus §7.4.4 macht den Fall in jedem Fall erträglich.

---

## 8. Was §7 ausdrücklich NICHT entscheidet — und deshalb auch hier fehlt

Damit niemand danach sucht:

- **Der Etikettendruck** (§8) und die gedruckten URL-Formen. Dieser Plan liefert nur
  `normalisiereBarcode` (T62) als deren Leseseite.
- **Die Verwaltungsoberfläche** (§6) — einschließlich der beiden Scan-Seiten, die
  `_ui/BarcodeScanner.tsx` **konsumieren**.
- **Die Sitzungsmechanik selbst** (§3): `helferSitzung.ts`, `helferZugang.ts`, `gateSchranke.ts`,
  `gateTexte.ts`, `absender.ts`, `code.ts`, `returnTo.ts`, `tokenZiel.ts`, `abmelden/route.ts`.
- **Das Datenmodell** (§4) und die Fachlogik (§5). Dieser Plan **ruft** sie und legt keine Zeile davon
  an — mit der einen begründeten Ausnahme `redeemToken` (E2, T66), die in **keiner** anderen
  Eigentümertabelle steht.
- **Ein Service Worker** (Entscheidung 24 a, verworfen mit fünf Gründen) und eine
  **Offline-Warteschlange** (eigenes Vorhaben: eine Entnahme ist eine FEFO-Abbuchung gegen einen
  gemeinsamen Bestand, und eine Warteschlange bräuchte Konfliktauflösung, Rückmeldung nach dem Fakt
  und einen Weg, eine abgelehnte Buchung dem Menschen zuzuordnen, der sie ausgelöst hat).
- **Eine gleitende Sitzungsverlängerung, `jti` oder Einzelwiderruf** (Falle 20, ausdrücklich als
  benannter Restzustand stehengelassen). Wer um 07:00 einlöst, fliegt um 19:00 heraus; die Abhilfe für
  den einzigen schmerzhaften Fall ist §7.4.4 und **kein Umbau des Sitzungsformats**.
