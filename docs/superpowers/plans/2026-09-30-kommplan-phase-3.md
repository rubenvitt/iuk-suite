# Kommunikationspläne — Lieferphase 3: Gliederung mit mehrzeiligem Einfügen — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modul-Admins bearbeiten einen Plan wahlweise im Diagramm oder in einer eingerückten Gliederung — auf denselben Daten, mit derselben Rückgängig- und Autosave-Kette. Die Gliederung kann Enter/Tab/Umschalt+Tab/Alt+↑↓, Titel, Verbindung, Zeichen und Einheiten inline und legt aus mehrzeilig eingefügtem, eingerücktem Text einen Teilbaum an. Am Telefon öffnet der Editor in der Gliederung. Dazu werden die Griffe des Diagramm-Editors kompakter, rücken näher an die Karte, und die Seitengriffe tragen eine Beschriftung.

**Architecture:** Alles, was die Gliederung am Dokument tut, sind reine Operationen in `_lib/plan/gliederung.ts` (Spec §6.6) plus ein reiner Parser in `_lib/plan/einfuegen.ts`. Die neue Client-Insel `_ui/gliederung/` bekommt vom Editor dieselbe `aendere`-Funktion wie die Flyins; der Editor hält weiter genau einen Verlauf, einen Speicherer und eine Auswahl. Beide Ansichten bleiben montiert; welche zu sehen ist, entscheidet `data-editoransicht` am Editor — mit `?ansicht=` in der Adresse ausdrücklich, ohne Parameter per CSS am Suite-Breakpoint (docs/design/README.md, „Mobil": die Umschaltung ist CSS, nie JavaScript).

**Tech Stack:** Next.js 16 (App Router, RSC), React 19 mit React Compiler, TypeScript, zod 4, antd 6.6.4 (`Segmented`, `Select`, `Dropdown`, `Popover`, `Tooltip`), Vitest 4 (jsdom über `src/app/m/qr/_lib/test-dom.tsx`), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§6.2, §6.3, §6.5, §6.6, §9, §10, §11 Phase 3). Die Umsetzungspläne `docs/superpowers/plans/2026-09-30-kommplan-phase-1.md` und `…-phase-2.md` gelten samt ihrer Abschnitte „Abweichungen von der Spec", „Entscheidungen dieser Phase" und „Abweichungen bei der Umsetzung" weiter; wo dieser Plan davon abweicht, steht es unten ausdrücklich.

**Ticket:** DRK-500. Ticketnummer in jeden Commit-Body. ClickUp pflegt der Hauptlauf, nicht diese Umsetzung.

## Global Constraints

- Arbeitsverzeichnis ausschließlich `/Users/rubeen/dev/personal/drk/iuk-suite/.claude/worktrees/drk-363-8c5335`; nie `cd` ins Haupt-Repo. Nicht pushen. ClickUp nicht anfassen.
- Deutsche Texte mit echten Umlauten (`ä ö ü Ä Ö Ü ß`); Bezeichner, Datei- und Branchnamen ASCII (`~/.claude/CLAUDE.md`).
- `CLAUDE.md` gilt vollständig. Für diese Phase besonders: Falle 1 (kein antd-Compound in RSC), 2 (eigenes Markup nimmt `--kp-*`, nie `--ant-*`), 3 (Warnungen `type="warning"`, nie Rot auf der Datenfläche), 4 (kein `size` auf Bedienelementen; die FullShell gibt 44 px), 5 (eigenes CSS gegen antd nur mit einer Klasse mehr), 6 (Werte für Server Components nie aus `"use client"`-Modulen — `leseEditorAnsicht` liegt deshalb in `_lib/`), 7 (keine `@ant-design/icons`), 10 (im e2e jede ausgelöste Anfrage per `waitForResponse`), 12 (`klickeWennRuhig`, `warteAufSpaltenaufteilung`), 13 (`flyinBreite()`, Raster per `auto-fit`/`minmax`), 20 (keine Regel gegen einen `.ant-*`-Namen), 22 (`warteAufGestreamteInhalte` vor Zählungen).
- Zugriffsschutz: diese Phase legt **keine** neue Server Action und keine neue Route an. Die Gliederung schreibt ausschließlich über die vorhandene Speicherkette (`speichereInhaltAction` mit `version`, Riegel `darfKommplanBearbeiten`). Der Adressparameter `ansicht` ist reine Ansicht und wird serverseitig nur gegen die zwei erlaubten Werte geprüft.
- React Compiler ist an, `react-hooks/set-state-in-effect` ist aktiv: kein `setState` im Effekt-Rumpf; Fokus setzen (`el.focus()`) im Effekt ist erlaubt, Zustandswechsel gehören in Ereignis-Rückrufe (Vorbild `_ui/editor/Editor.tsx`, `_ui/editor/StelleFlyin.tsx`).
- Hell/Dunkel über `<html data-theme>`, nie `prefers-color-scheme`. Neue Farben als `--kp-*` in `:root` **und** `:root[data-theme="dark"]` (`_ui/kommplan.css`).
- Neue CSS-Regeln unter einem Breakpoint kommen **in die vorhandenen Blöcke** `@media (max-width: 767.98px)` bzw. `@media (min-width: 768px)` von `_ui/kommplan.css` — `kommplan-css.test.ts` liest jeweils den ersten Block.
- Tests, die dieser Plan an eine bestehende Testdatei anhängt, bringen ihre Importe mit: in die **vorhandenen** Importzeilen derselben Module zusammenführen (`pnpm lint` meldet doppelte Importe).
- DOM-Tests nur über das Harness `src/app/m/qr/_lib/test-dom.tsx` (`mount`, `unmount`, `query`, `queryAll`, `exists`, `fill`, `clickElement`, `queryPortal`, `existsPortal`, `clickPortal`), Kopfzeile `// @vitest-environment jsdom`, `afterEach(async () => { await unmount(); … })` (Phase-2-Abweichung U2).
- Kommentaranker in neuem Code nennen **Namen**, nie Zeilen (`pnpm anker:neu` bricht die CI). **Ankerschritt** vor jedem Commit, der eine bestehende Datei ändert: `git grep -n "<dateiname>:[0-9]" -- src scripts e2e docs` und `pnpm anker:drift <datei>`; ein Anker, der vorher zutraf und hinter der Änderungsstelle liegt, wird in derselben Zeile in die Namensform umgeschrieben. Nie eine Zahl nachziehen, nie eine Zeile dazu oder weg (Kommentaranker-Regel 4). Betroffene bestehende Dateien: `_lib/plan/operationen.ts`, `_lib/plan/einfuegen.ts`, `_lib/plan/einfuegen.test.ts`, `_ui/editor/Editor.tsx`, `_ui/editor/Editor.test.tsx`, `_ui/editor/Griffe.tsx`, `_ui/editor/Kopfleiste.tsx`, `_ui/betrachter/Flaeche.tsx`, `_ui/betrachter/Flaeche.test.tsx`, `_ui/kommplan.css`, `_ui/kommplan-css.test.ts`, `(intern)/p/[id]/page.tsx`, `e2e/kommplan-editor.spec.ts`, `e2e/gruppen.json`, die Release-Notiz, die Spec.
- Signierte Commits (`git commit -S`), Kopfzeile nach Conventional Commits: `feat(kommplan): …` für neue Funktion, `fix(kommplan): …`, `test(kommplan): …`, `refactor(kommplan): …`, `docs: …`. Body mit einer Zeile `DRK-500` und am Ende `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Last: andere Sessions laufen parallel. Vor jedem Urteil über einen roten Test `uptime` prüfen; bei Load > 10 die betroffene Datei einzeln fahren oder den CI-Weg (`pnpm e2e:gebaut` bzw. `E2E_VORGEBAUT=1`). Fremde Prozesse nie beenden. Kein `pnpm dev` offen lassen; ein von `next dev` umgeschriebenes `next-env.d.ts` mit `git checkout -- next-env.d.ts` zurücksetzen. `scripts/backup-sidecar.test.ts` ist auf macOS rot (DRK-501) — nicht dein Thema.
- Tore vor dem Abschluss: `pnpm typecheck` (Exit-Code prüfen) · `pnpm lint` · `pnpm anker:neu` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts e2e/kommplan-gliederung.spec.ts`. **Jeder Commit besteht `pnpm typecheck`.** Task 9 (Seite mit `searchParams`) fährt zusätzlich `pnpm build`.
- Next-Guides vor dem ersten Code, der die API benutzt, lesen: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (Abschnitt `searchParams`: ein `Promise`), `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` (Abschnitt „Native History API": `window.history.replaceState` ist mit dem Router verzahnt). antd-6-APIs im Zweifel über das antd-MCP (`ToolSearch` „antd", dann `antd_doc`/`antd_demo`): `Select` nimmt Suche **nur** als `showSearch={{ searchValue, onSearch, filterOption }}` (die gleichnamigen Einzel-Props sind `@deprecated`, `@rc-component/select` `SearchConfig`), `Dropdown` mit `menu={{ items, onClick }}`, `Popover` mit `open`/`onOpenChange`/`destroyOnHidden`, `Alert` mit `title=` und `closable={{ onClose }}`.
- Diese Phase fasst **nicht** an: Bibliothek (Phase 4, keine Bibliotheks-Suche in der Gliederung), Briefkopf/Logo (Phase 4, Spec §4.4), Token-Links, A3, Schwarzweiß (Phase 5).

## Entscheidungen dieser Phase (Abweichungen von Spec und früheren Plänen)

1. **Ansicht in der Adresse, sonst per CSS** (ersetzt Phase-2-Entscheidung 13, „Gliederung deaktiviert"): Der Umschalter Diagramm | Gliederung in der Kopfleiste ist aktiv. Eine Wahl setzt `?ansicht=diagramm|gliederung` per `window.history.replaceState` (kein Neuladen, kein neuer Verlaufseintrag) und den Zustand im Editor; die Seite liest den Parameter beim Laden (`searchParams`) und reicht ihn als Prop. **Ohne** Parameter steht `data-editoransicht="auto"` am Editor (nicht `data-ansicht`: das trägt schon die Zeichnung, `<g data-ansicht>` in `Flaeche`, und Phase-1-Tests wie `e2e/kommplan.spec.ts` greifen `[data-ansicht]` ohne Einschränkung), beide Ansichten und **zwei** Umschalter (einer je Breakpoint, Wert „diagramm" bzw. „gliederung") stehen im DOM, und CSS zeigt unter 768 px die Gliederung, darüber das Diagramm. So zeigt der erste Render nie die falsche Variante (docs/design/README.md, „Mobil").
2. **Beide Ansichten bleiben montiert.** Umschalten verliert weder Zoom noch Einklappen, und Auswahl, Rückgängig-Stapel, offenes Flyin und Autosave hängen ohnehin am Editor. Umschalten speichert nichts.
3. **Spec §6.5 „Am Telefon ist die Gliederung der einzige Bearbeitungsweg"** wird zu „öffnet am Telefon in der Gliederung": das Diagramm bleibt dort über den Umschalter für kleine Korrekturen erreichbar (Phase-2-Entscheidung 13 bleibt insoweit gültig). Der Spec-Satz wird in Task 9 angepasst.
4. **Reihenfolge der Gliederung = Reihenfolge des Diagramms.** Die Gliederung ist eine Tiefensuche: Stelle, dann ihre Seitenstellen (links, dann rechts; eine Ebene tiefer eingerückt, mit Chip „Seitenstelle links/rechts"), dann ihre Unterstellen in **Anzeigereihenfolge** (`anzeigereihenfolge`, Busgruppen zusammenhängend wie im Layout). Wurzeln in `ordne`-Folge wie im Layout. Die Pfeiltasten ↑/↓ wandern entlang dieser Zeilenfolge.
5. **Enter** legt eine neue, leere Stelle **direkt nach der Zeile samt ihrem Teilbaum** an: gleiche Elternstelle, gleiche Lage, gleiche Verbindung (sie tritt dem Bus bei, wie Phase-2-Entscheidung 7; eine Wurzel bekommt keine), Fokus in ihren Titel. Die Geschwisterreihe wird dafür in Anzeigereihenfolge neu durchnummeriert (`reihenfolge` 0, 1, 2 …). Enter auf einer Zeile mit **leerem Titel** tut nichts — so entstehen keine Ketten leerer Karten (vgl. Phase-2-Abweichung U28). Enter auf einer Seitenstelle legt eine Seitenstelle auf derselben Seite an.
6. **Tab** hängt die Stelle als **letzte** Unterstelle unter die vorige Geschwisterstelle (Anzeigereihenfolge) und lässt sie deren letztem Bus beitreten (ohne Unterstellen: keine Verbindung). **Umschalt+Tab** stellt sie **direkt hinter** ihre Elternstelle, in deren Busgruppe (Verbindung der Elternstelle; auf oberster Ebene keine); spätere Geschwister bleiben, wo sie sind. Der Teilbaum wandert jeweils mit. Tab auf der ersten Stelle einer Ebene, Umschalt+Tab auf einer Wurzel und beides auf einer Seitenstelle sind ein `PlanFehler` mit Hinweis — das Dokument bleibt, und **der Fokus bleibt im selben Titelfeld** (Tab wird immer abgefangen).
7. **Alt+↑/↓** tauscht innerhalb der Busgruppe mit dem Nachbarn; steht die Stelle am Rand ihrer Gruppe, wandert die **ganze Gruppe** an der Nachbargruppe vorbei. Grund: Gruppen stehen im Layout immer zusammenhängend (`teile()` in `_lib/layout/gruppen.ts`); ein Tausch der `reihenfolge` über die Gruppengrenze hinweg änderte am Bild nichts, und die Verbindung still zu ändern hieße, Daten zu erfinden. Am Anfang/Ende der Reihe tut Alt+↑/↓ nichts.
8. **Entf/Rücktaste auf leerem Titel** löscht die Zeile, aber nur ohne Unter- und Seitenstellen (sonst Hinweis „… löschen über „Aktionen“ → „Stelle löschen“"); der Fokus geht bei Rücktaste auf die vorige, bei Entf auf die nächste Zeile. Ein per Enter angelegtes, **unberührtes** Element verschwindet beim Verlassen per ↑/↓, Esc oder Rücktaste ohne Wiederholen-Schritt (dasselbe `verwirf` wie U28).
9. **Mehrzeiliges Einfügen** (Spec §6.5): Enthält die Zwischenablage mindestens zwei nicht leere Zeilen, fängt das Titelfeld das Einfügen ab. Parser: Tabs zählen zwei Spalten, Leerzeichen und geschützte Leerzeichen eine; die Ebene folgt einem Einrückungsstapel (tiefer = genau eine Ebene tiefer, gleich = gleiche Ebene, zwischen zwei Stufen = die tiefere von beiden), die erste Zeile ist Ebene 0. Vorn abgestreift werden `-`, `*`, `•`, `‣`, `◦`, `▪`, `–` und Nummern `1.`, `1)`, `2.1.` — jeweils nur mit folgendem Leerraum, also bleiben „112 Leitstelle" und „1.2 Abschnitt" unverändert. **Nichts wird geraten:** auch „RTW RK UE 40-83-5" wird eine Stelle. Zu lange Titel sind ein Fehler mit Zeilennummer, dann wird nichts eingefügt (nie still gekürzt). Ebene-0-Zeilen werden Geschwister **nach** der Cursorzeile samt Teilbaum (Verbindung wie Enter), tiefere Zeilen Unterstellen ohne Verbindung. Ist die Cursorzeile ganz leer (kein Titel, nichts sonst, keine Nachkommen), nimmt die erste Zeile **ihren** Platz ein. In eine Seitenstelle wird nichts eingefügt (Hinweis). Über 500 Stellen → Hinweis mit Zahl. Das Einfügen ist **ein** Rückgängig-Schritt; der Fokus steht danach am Ende der zuletzt eingefügten Zeile.
10. **Tastatur und Barrierefreiheit der Gliederung:** Roving Tabindex — nur die aktive Zeile (gewählt, sonst die erste) hat ihre Bedienelemente in der Tab-Folge; so führt Tab aus der Liste hinaus, obwohl Tab im Titelfeld einrückt. **Esc** verlässt das Titelfeld auf den Knopf „Aktionen" derselben Zeile (Ausweg nach WCAG 2.1.2, steht in der Bedienzeile). **Strg/Cmd+Z** und Umschalt+Strg/Cmd+Z bzw. Strg+Y im Titelfeld der Gliederung sind das Rückgängig des **Dokuments** (anders als im Flyin, wo Strg+Z dem Feld gehört): in der Gliederung steht der Fokus fast immer in einem Titel, und Tippen ist ohnehin je Feld gebündelt (`titel:<id>`). **F2** öffnet das Flyin der Zeile.
11. **Touch-Weg:** Am Telefon gibt es kein Tab und kein Alt+Pfeil. Jede Zeile trägt deshalb einen 44-px-Knopf „⋯" (`aria-label` „Aktionen für <Titel>") mit dem Menü „Details …", „Einrücken", „Ausrücken", „Nach oben", „Nach unten", „Stelle löschen" (Tastenkürzel im Menütext, nicht erreichbare Einträge deaktiviert). Das ist zugleich der Mausweg am Desktop und der einzige Weg zum Flyin („Details") neben F2.
12. **Verbindung inline:** ein `Select` mit Suche. Leere Suche: „keine (dünne Linie)" und alle Verbindungen des Plans. Getippter Text ohne gleichnamige Verbindung derselben Art: je Verbindungsart eine Option „Neu: „<Text>“ als <Art>", die Art der zuletzt angelegten Verbindung zuerst. Anders als das in Phase 2 verworfene Kombifeld (Kritik 29) steht die Art damit **sichtbar** in jeder Option; Spec §6.4 „Bezeichnung + Art" bleibt erfüllt. Gleichnamig vorhanden → die vorhandene wird genommen. Wurzeln haben kein Feld („oberste Ebene"). Kanäle (`kanaele`) bleiben im Flyin.
13. **Zeichen kompakt:** ein 44-px-Knopf mit dem Zeichen (32 px) oder einem leeren Platzhalter; er öffnet ein `Popover` mit derselben `ZeichenWahl` wie das Flyin. Nach der Wahl schließt es, der Fokus geht zurück in den Titel.
14. **Einheiten als Zähler:** „0 Einheiten", „1 Einheit", „n Einheiten" als Knopf mit `aria-expanded`; er klappt unter der Zeile dieselbe `EinheitenListe` wie im Flyin auf (einzeln, „Liste einfügen"). Aufgeklappt ist Ansichtszustand, kein Dokumentinhalt.
15. **Telefon-Zeilen:** Unter 768 px zeigt eine Zeile Zeichen, Titel und „⋯"; Verbindung und Einheiten erscheinen nur an der **gewählten** Zeile (CSS). Einrückung 16 px je Ebene, gedeckelt bei 6 Ebenen; darüber 24 px.
16. **Hinweise und Fokus folgen der sichtbaren Ansicht:** Die Gliederung hat einen eigenen Meldungsplatz (klebt unten im Bild, `position: sticky`), in dem derselbe Editor-Hinweis erscheint wie in der Fläche. Wohin der Fokus nach Flyin-Schließen, Löschen und Rückgängig per Knopf zurückkehrt, entscheidet der Editor **zur Ereigniszeit** (`sichtbareAnsicht`: ausdrückliche Wahl, sonst `matchMedia("(max-width: 767.98px)")`) — nie im Rendern.
17. **Zeichensymbole einmal auf Editor-Ebene:** Die `<symbol>`-Vorräte stehen in einem 0×0-SVG direkt unter `.kp-editor`, außerhalb beider Ansichten; die Fläche des Editors rendert ihren eigenen Vorrat nicht (`defs={false}`). Sonst hinge jede `<use>`-Vorschau (Flyin, Zeichenknopf der Gliederung) an einem womöglich verborgenen Teilbaum, oder es gäbe doppelte IDs (Befund M11).
18. **Griffe kompakt** (UX-Nacharbeit aus der Sichtprüfung des Hauptlaufs, Fotos `phase2-shots/flyin-stelle-desktop-light.png`, `auswahl-desktop-dark.png`: die Griffe verdeckten Nachbarkarten, die seitlichen „+□–" waren ohne Beschriftung unverständlich): eigene `<button class="kp-griff">` statt antd-`Button` (keine Größenregel gegen antd, Falle 4/5/20), **32 px sichtbar**, 13 px Schrift, Pillenform mit Rand und Schatten; die **Trefferfläche bleibt 44 px** hoch über ein unsichtbares `::before` (je 6 px oben und unten), und jede Pille ist breiter als 44 px. Die Griffleiste („+ Unterstelle", „+ Einheit", „Bearbeiten") hängt 6 px unter der Karte (4 px Auswahlrahmen + 2 px), Zeilenabstand beim Umbruch 12 px (Trefferflächen überlappen nicht). Die Seitengriffe heißen sichtbar **„+ links"** / **„+ rechts"**, sitzen 6 px **über den oberen Ecken** der Karte (dort liegen nur Bus- und Abzweiglinien der eigenen Gruppe, keine Nachbarkarte) und rücken bei schmaler Karte nach außen, statt sich zu überdecken; `aria-label` („Seitenstelle links von <Titel> anlegen") und Tooltip bleiben, das Anbindungssymbol entfällt (die Beschriftung sagt es). Die Seitengriffe haben eine feste Breite `SEITENGRIFF_BREITE = 80` px (Griffe.tsx), damit ihr Überstand an einer schmalen Karte berechenbar ist (höchstens ihre ganze Breite); `GRIFF_RAND` wird daraus neu gerechnet (oben 48, seitlich `8 + SEITENGRIFF_BREITE + 8` = 96, unten 96), und die Fläche bekommt `platzOben`, damit eingepasst weiterhin alle Griffe im Bild sind (Phase-2-Entscheidung 18). **Bewusst hingenommen:** die Seitengriffe können die Bus- oder Sechseckbeschriftung der **eigenen** Gruppe teilweise verdecken, und in einer Kammreihe liegen sie über den Einheiten der Reihe darüber.
19. **Release-Notiz** (Vorgabe des Hauptlaufs: eine Notiz für das Modul, ehrlich zum Stand nach Phase 3): zwei Absätze; der erste nennt statt „dem seitlichen „+“" die neuen Namen „+ links" und „+ rechts", der zweite die Gliederung. Im Commit von Task 9.

## Review Focus

1. **Eingefügter Text aus Word, einer Webseite oder einem Editor** — gemischte Einrückung (Tabs, zwei oder vier Leerzeichen, geschützte Leerzeichen), Aufzählungszeichen und Nummern, CRLF, Leerzeilen, eine eingerückte erste Zeile, Sprünge über mehrere Ebenen, Zahlen im Titel („112 Leitstelle", „1.2 Abschnitt"), Fahrzeugzeilen → ein sinnvoller Baum, nichts geraten, nichts gekürzt. Gepinnt in `einfuegen.test.ts` (Task 1).
2. **Alt+↑/↓ an der Grenze einer Busgruppe** und an den Enden einer Reihe → sichtbare Bewegung (ganze Gruppe) bzw. nichts; nie ein Tausch, der am Bild nichts ändert. Gepinnt in `gliederung.test.ts` (Task 2).
3. **Tab auf der ersten Unterstelle, Umschalt+Tab auf einer Wurzel, beides auf einer Seitenstelle** → Hinweis im Meldungsplatz, Dokument unverändert, Fokus bleibt im selben Titelfeld. Gepinnt in `gliederung.test.ts` (Task 2), `Gliederung.test.tsx` (Task 7) und e2e (Task 10).
4. **Einfügen, das 500 Stellen überschreitet, eine überlange Zeile enthält oder in eine Seitenstelle zielt** → abgewiesen, Dokument unverändert, Hinweis mit Zeile bzw. Zahl. Gepinnt in `einfuegen.test.ts` (Task 1), `gliederung.test.ts` (Task 3) und `Gliederung.test.tsx` (Task 8).
5. **Umschalten der Ansicht mit gewählter Stelle, offenem Flyin und gefülltem Rückgängig-Stapel — auch am Seed-Plan** → Auswahl bleibt, Rückgängig bleibt, kein Neuladen, kein einziger Speicheraufruf. Gepinnt in `Editor.test.tsx` (Task 9) und e2e (Task 10).

---

## Dateistruktur

Im Folgenden steht `K` für `src/app/m/kommplan`.

```
K/
├── (intern)/p/[id]/page.tsx          geändert: liest ?ansicht= (searchParams), reicht es an den Editor
├── _lib/
│   ├── editorAnsicht.ts              NEU: EditorAnsicht, leseEditorAnsicht, adresseMitAnsicht, sichtbareAnsicht, SCHMAL
│   └── plan/
│       ├── einfuegen.ts              geändert: leseGliederung (Parser „mehrzeilig einfügen“)
│       ├── operationen.ts            geändert: leer → export leereStelle
│       └── gliederung.ts             NEU: reihe, gliederungsZeilen, nachbarZeile, zeilenAktionen, fuegeGeschwisterEin,
│                                          rueckeEin, rueckeAus, verschiebeInReihe, loescheLeereZeile, fuegeGliederungEin
├── _ui/
│   ├── kommplan.css                  geändert: Griffe, Gliederung, Ansichtsumschaltung
│   ├── betrachter/Flaeche.tsx        geändert: platzOben, defs
│   ├── editor/
│   │   ├── Editor.tsx                geändert: Symbolvorrat, Ansicht, Gliederung, fokusZurueck
│   │   ├── Griffe.tsx                geändert: kompakte, beschriftete Griffe
│   │   └── Kopfleiste.tsx            geändert: aktiver Umschalter
│   └── gliederung/                   NEU
│       ├── tasten.ts                 gliederungsBefehl (rein)
│       ├── verbindungsOptionen.ts    Optionen des Verbindungsfelds (rein)
│       ├── Gliederung.tsx            "use client": Liste, Tastatur, Fokus, Einfügen
│       ├── GliederungZeile.tsx       "use client": eine Zeile (Titel, Aktionen-Menü, Plätze)
│       ├── VerbindungFeld.tsx        "use client": Verbindung wählen oder neu tippen
│       └── ZeichenKnopf.tsx          "use client": Zeichen kompakt mit Popover
e2e/kommplan-hilfen.ts                NEU: gemeinsame Helfer der kommplan-e2e
e2e/kommplan-gliederung.spec.ts       NEU
```

Geändert außerhalb des Moduls: `e2e/kommplan-editor.spec.ts`, `e2e/gruppen.json`, `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§6.5), `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts`.

---

### Task 1: Parser „mehrzeilig einfügen“

**Files:**
- Modify: `src/app/m/kommplan/_lib/plan/einfuegen.ts`
- Test: `src/app/m/kommplan/_lib/plan/einfuegen.test.ts`

**Interfaces:**
- Consumes: `LAENGE` aus `./schema`.
- Produces: `export interface GliederungsEintrag { ebene: number; titel: string }`; `export const TAB_BREITE = 2`; `export function leseGliederung(text: string): { eintraege: GliederungsEintrag[]; fehler: string[] }`. Zusicherung: `eintraege[0].ebene === 0` und `eintraege[i+1].ebene <= eintraege[i].ebene + 1`; jeder `titel` ist getrimmt, innerer Leerraum zu einem Leerzeichen zusammengezogen, nicht leer und höchstens `LAENGE.titel` lang.

- [ ] **Step 1: Die fehlenden Tests schreiben**

An `src/app/m/kommplan/_lib/plan/einfuegen.test.ts` anhängen (Import `leseGliederung` in die vorhandene Importzeile aus `./einfuegen` aufnehmen, `LAENGE` in die aus `./schema`, falls vorhanden, sonst neue Zeile):

```ts
describe("leseGliederung (Spec §6.5, Entscheidung 9)", () => {
  const ebenen = (text: string) => leseGliederung(text).eintraege.map((e) => [e.ebene, e.titel]);

  it("Tabs und je zwei Leerzeichen sind dieselbe Ebene — auch gemischt", () => {
    expect(ebenen("EL\n\tEA 1\n  EA 2\n\t\tRTW 1\n    RTW 2")).toEqual([[0, "EL"], [1, "EA 1"], [1, "EA 2"], [2, "RTW 1"], [2, "RTW 2"]]);
  });
  it("vier Leerzeichen je Ebene und geschützte Leerzeichen gehen ebenso", () => {
    expect(ebenen("EL\n    EA\n        RTW")).toEqual([[0, "EL"], [1, "EA"], [2, "RTW"]]);
    expect(ebenen("EL\n  EA")).toEqual([[0, "EL"], [1, "EA"]]);
  });
  it("ein Sprung über mehrere Ebenen ist genau eine Ebene tiefer; zwischen zwei Stufen zählt die tiefere", () => {
    expect(ebenen("EL\n\t\t\tEA\n\t\t\t\tRTW\n\tEB")).toEqual([[0, "EL"], [1, "EA"], [2, "RTW"], [1, "EB"]]);
  });
  it("eine eingerückte erste Zeile ist Ebene 0; weniger eingerückte danach ebenfalls", () => {
    expect(ebenen("    EL\n      EA\nStab")).toEqual([[0, "EL"], [1, "EA"], [0, "Stab"]]);
  });
  it("Aufzählungszeichen und Nummern werden abgestreift — nur mit folgendem Leerraum", () => {
    expect(ebenen("- EL\n  * EA 1\n  • EA 2\n  1. EA 3\n  2) EA 4\n  2.1. EA 5\n  –\tEA 6")).toEqual(
      [[0, "EL"], [1, "EA 1"], [1, "EA 2"], [1, "EA 3"], [1, "EA 4"], [1, "EA 5"], [1, "EA 6"]]);
    expect(ebenen("112 Leitstelle\n1.2 Abschnitt\n-5 Grad\n2.OG")).toEqual([[0, "112 Leitstelle"], [0, "1.2 Abschnitt"], [0, "-5 Grad"], [0, "2.OG"]]);
  });
  it("Zeilen, die wie Fahrzeuge aussehen, werden nicht geraten: jede Zeile ist eine Stelle", () => {
    expect(ebenen("EA 1\n\tRTW RK UE 40-83-5\n\tKTW 40-92-1")).toEqual([[0, "EA 1"], [1, "RTW RK UE 40-83-5"], [1, "KTW 40-92-1"]]);
  });
  it("CRLF, CR, Leerzeilen und reine Leerraumzeilen; innerer Leerraum wird ein Leerzeichen", () => {
    expect(ebenen("EL\r\n\r\n\tEA  1\r   \n\t- \nStab")).toEqual([[0, "EL"], [1, "EA 1"], [0, "Stab"]]);
  });
  it("ein zu langer Titel ist ein Fehler mit Zeilennummer — nie still gekürzt", () => {
    const r = leseGliederung(`EL\n\t${"x".repeat(LAENGE.titel + 1)}\n\tEA`);
    expect(r.fehler).toEqual([`Zeile 2: Der Titel ist länger als ${LAENGE.titel} Zeichen.`]);
    expect(r.eintraege.map((e) => e.titel)).toEqual(["EL", "EA"]);
    expect(leseGliederung(`EL\n${"y".repeat(LAENGE.titel)}`).fehler).toEqual([]);
  });
  it("leerer Text: nichts", () => {
    expect(leseGliederung("")).toEqual({ eintraege: [], fehler: [] });
    expect(leseGliederung(" \n\t\n")).toEqual({ eintraege: [], fehler: [] });
  });
  it("Zusicherung: erste Ebene 0, danach höchstens eine Ebene tiefer (Zufallstexte)", () => {
    let saat = 7;
    const zufall = () => { saat = (saat * 1103515245 + 12345) % 2 ** 31; return saat / 2 ** 31; };
    for (let n = 0; n < 200; n++) {
      const zeilen = Array.from({ length: 1 + Math.floor(zufall() * 12) }, (_, i) =>
        `${["", "\t", "  ", "    ", "\t  ", " "][Math.floor(zufall() * 6)].repeat(Math.floor(zufall() * 4))}${["- ", "", "1. ", "• "][Math.floor(zufall() * 4)]}S${i}`);
      const e = leseGliederung(zeilen.join(zufall() < 0.5 ? "\n" : "\r\n")).eintraege;
      expect(e[0].ebene).toBe(0);
      for (let i = 1; i < e.length; i++) expect(e[i].ebene).toBeLessThanOrEqual(e[i - 1].ebene + 1);
    }
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan/einfuegen.test.ts`
Expected: FAIL — `leseGliederung is not a function` (bzw. Importfehler); die vorhandenen Tests der Einheitenliste bleiben grün.

- [ ] **Step 3: Parser schreiben**

Den Kopfkommentar von `einfuegen.ts` so ergänzen, dass er beide Parser nennt (Zeilenzahl der Datei ändert sich durch neuen Code ohnehin; die Kommentar-Regel 4 betrifft nur das Aufräumen), und am Ende anfügen:

```ts
/**
 * GLIEDERUNG EINFÜGEN (Spec §6.5; Umsetzungsplan Phase 3, Entscheidung 9). Die Ebene folgt einem
 * Einrückungsstapel, nicht einer festen Spaltenzahl: so tragen Tabs, zwei oder vier Leerzeichen und
 * Mischungen daraus, und ein Sprung über mehrere Stufen ist genau eine Ebene tiefer.
 *
 * NICHTS WIRD GERATEN: auch „RTW RK UE 40-83-5" wird eine Stelle — Einheiten entstehen nur über
 * „Liste einfügen". Aufzählungszeichen und Nummern fallen nur mit folgendem Leerraum weg, damit
 * „112 Leitstelle" und „1.2 Abschnitt" ihre Zahl behalten.
 */
export interface GliederungsEintrag { ebene: number; titel: string }
export const TAB_BREITE = 2;
const EINZUG = /^[\t  ]*/;
const AUFZAEHLUNG = /^(?:[-*•‣◦▪–]|\d+(?:\.\d+)*[.)])[\t  ]+/u;

export function leseGliederung(text: string): { eintraege: GliederungsEintrag[]; fehler: string[] } {
  const eintraege: GliederungsEintrag[] = [];
  const fehler: string[] = [];
  const stufen: number[] = [];
  text.split(/\r\n|\r|\n/).forEach((roh, i) => {
    const einzug = EINZUG.exec(roh)![0];
    const titel = roh.slice(einzug.length).replace(AUFZAEHLUNG, "").replace(/\s+/g, " ").trim();
    if (titel === "") return;
    const breite = [...einzug].reduce((n, z) => n + (z === "\t" ? TAB_BREITE : 1), 0);
    while (stufen.length > 0 && stufen[stufen.length - 1] > breite) stufen.pop();
    if (stufen.length === 0 || stufen[stufen.length - 1] < breite) stufen.push(breite);
    if (titel.length > LAENGE.titel) fehler.push(`Zeile ${i + 1}: Der Titel ist länger als ${LAENGE.titel} Zeichen.`);
    else eintraege.push({ ebene: stufen.length - 1, titel });
  });
  return { eintraege, fehler };
}
```

Hinweis zum Test „`- ` allein": die Zeile `"\t- "` wird nach dem Abstreifen leer und fällt weg — das ist gewollt (leere Aufzählungspunkte aus Word).

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan/einfuegen.test.ts`
Expected: PASS (alle, auch die der Einheitenliste).

- [ ] **Step 5: Typecheck, Lint, Ankerschritt, Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm exec eslint src/app/m/kommplan/_lib/plan/einfuegen.ts src/app/m/kommplan/_lib/plan/einfuegen.test.ts
git grep -n "einfuegen.ts:[0-9]\|einfuegen.test.ts:[0-9]" -- src scripts e2e docs
pnpm anker:drift src/app/m/kommplan/_lib/plan/einfuegen.ts
git add src/app/m/kommplan/_lib/plan/einfuegen.ts src/app/m/kommplan/_lib/plan/einfuegen.test.ts
git commit -S -m "feat(kommplan): Parser für mehrzeiliges Einfügen einer Gliederung

Einrückung mit Tabs oder Leerzeichen, auch gemischt; Aufzählungszeichen
und Nummern fallen weg, Zahlen im Titel bleiben; nichts wird als
Fahrzeug geraten, zu lange Titel sind ein Fehler mit Zeilennummer.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Gliederungs-Operationen — Zeilen, Enter, Tab, Umschalt+Tab, Alt+Pfeil, leere Zeile löschen

**Files:**
- Modify: `src/app/m/kommplan/_lib/plan/operationen.ts` (nur `function leer(` → `export function leereStelle(` und die drei Aufrufe)
- Create: `src/app/m/kommplan/_lib/plan/gliederung.ts`
- Test: `src/app/m/kommplan/_lib/plan/gliederung.test.ts`

**Interfaces:**
- Consumes: `anzeigereihenfolge` (`_lib/layout/gruppen`), `baueBaum`, `nachkommen` (`./baum`), `gueltig`, `leereStelle`, `loescheStelle`, `naechsteReihenfolge`, `PlanFehler`, `stelleOder` (`./operationen`), `GRENZE`, `Lage`, `PlanInhalt`, `Stelle` (`./schema`).
- Produces (alle rein, Eingabe unverändert, Ausgabe `gueltig` oder `PlanFehler`):
  - `export const MELDUNG: { ersteEinruecken; wurzelAusruecken; seiteEbene; nichtLeer; mitTitel; inSeitenstelle }` (Zeichenketten), `export function zuVieleStellen(zahl: number): string`
  - `export function reihe(inhalt: PlanInhalt, eltern: string | null, lage: Lage): Stelle[]` — Geschwister in Anzeigereihenfolge.
  - `export interface GliederungsZeile { stelle: Stelle; ebene: number; seite: "links" | "rechts" | null; eltern: Stelle | null }`, `export function gliederungsZeilen(inhalt: PlanInhalt): GliederungsZeile[]`
  - `export function nachbarZeile(zeilen: readonly GliederungsZeile[], id: string, richtung: "hoch" | "runter"): string | null`
  - `export function zeilenAktionen(inhalt: PlanInhalt, id: string): { einruecken: boolean; ausruecken: boolean; hoch: boolean; runter: boolean }`
  - `export function fuegeGeschwisterEin(inhalt: PlanInhalt, nachId: string, id: string): PlanInhalt`
  - `export function rueckeEin(inhalt: PlanInhalt, id: string): PlanInhalt`
  - `export function rueckeAus(inhalt: PlanInhalt, id: string): PlanInhalt`
  - `export function verschiebeInReihe(inhalt: PlanInhalt, id: string, richtung: "hoch" | "runter"): PlanInhalt` (am Ende der Reihe: **dasselbe Objekt**)
  - `export function loescheLeereZeile(inhalt: PlanInhalt, id: string): PlanInhalt`
  - aus `operationen.ts`: `export function leereStelle(id: string, eltern: string | null, lage: Lage, reihenfolge: number, verbindungId: string | null): Stelle`

- [ ] **Step 1: `leereStelle` exportieren**

In `src/app/m/kommplan/_lib/plan/operationen.ts` die Zeile `function leer(id: string, eltern: string | null, lage: Lage, reihenfolge: number, verbindungId: string | null): Stelle {` durch `export function leereStelle(id: string, eltern: string | null, lage: Lage, reihenfolge: number, verbindungId: string | null): Stelle {` ersetzen und die drei Aufrufe `leer(` in `fuegeWurzelEin`, `fuegeUnterstelleEin`, `fuegeSeitenstelleEin` auf `leereStelle(` umstellen. Keine Zeile dazu oder weg.

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan/operationen.test.ts` — Expected: PASS.

- [ ] **Step 2: Die fehlenden Tests schreiben**

`src/app/m/kommplan/_lib/plan/gliederung.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { MELDUNG, fuegeGeschwisterEin, gliederungsZeilen, loescheLeereZeile, nachbarZeile, reihe, rueckeAus, rueckeEin, verschiebeInReihe, zeilenAktionen, zuVieleStellen } from "./gliederung";
import { PlanFehler } from "./operationen";
import { GRENZE, leseInhalt, type PlanInhalt } from "./schema";

const V = [{ id: "a", art: "tmo" as const, bezeichnung: "A" }, { id: "b", art: "dmo" as const, bezeichnung: "B" }];
/** EL mit Seitenstelle links, fünf Unterstellen in zwei Busgruppen (A: x1, x2, x5 — B: y3, y4) und einer Unterunterstelle. */
const PLAN = baue({
  verbindungen: V,
  stellen: [
    { id: "el", titel: "EL" },
    { id: "kat", titel: "KatSL", eltern: "el", lage: "links" },
    { id: "x1", titel: "X1", eltern: "el", verbindung: "a" },
    { id: "x2", titel: "X2", eltern: "el", verbindung: "a" },
    { id: "y3", titel: "Y3", eltern: "el", verbindung: "b" },
    { id: "y4", titel: "Y4", eltern: "el", verbindung: "b" },
    { id: "x5", titel: "X5", eltern: "el", verbindung: "a" },
    { id: "u", titel: "U", eltern: "x2" },
    { id: "w2", titel: "Wurzel 2" },
  ],
});
const titel = (p: PlanInhalt) => gliederungsZeilen(p).map((z) => `${"·".repeat(z.ebene)}${z.stelle.titel}${z.seite ? `(${z.seite})` : ""}`);
const s = (p: PlanInhalt, id: string) => p.stellen.find((x) => x.id === id)!;
const gueltig = (p: PlanInhalt) => expect(leseInhalt(p).ok).toBe(true);

describe("Zeilen der Gliederung (Entscheidung 4)", () => {
  it("Tiefensuche: Seitenstellen direkt nach der Elternstelle, Unterstellen in Anzeigereihenfolge (Busgruppen zusammen)", () => {
    expect(titel(PLAN)).toEqual(["EL", "·KatSL(links)", "·X1", "·X2", "··U", "·X5", "·Y3", "·Y4", "Wurzel 2"]);
  });
  it("Nachbarzeilen folgen dieser Folge; am Rand null", () => {
    const z = gliederungsZeilen(PLAN);
    expect(nachbarZeile(z, "x2", "runter")).toBe("u");
    expect(nachbarZeile(z, "u", "runter")).toBe("x5");
    expect(nachbarZeile(z, "el", "hoch")).toBeNull();
    expect(nachbarZeile(z, "w2", "runter")).toBeNull();
  });
  it("die Reihe einer Seite ist nur diese Seite; die Reihe der Wurzeln ist ohne Gruppen", () => {
    expect(reihe(PLAN, "el", "links").map((x) => x.id)).toEqual(["kat"]);
    expect(reihe(PLAN, null, "unter").map((x) => x.id)).toEqual(["el", "w2"]);
  });
});

describe("Enter: neue Stelle darunter (Entscheidung 5)", () => {
  it("direkt nach der Zeile samt Teilbaum, gleiche Elternstelle und Verbindung, Reihe neu nummeriert", () => {
    const p = fuegeGeschwisterEin(PLAN, "x2", "neu");
    gueltig(p);
    expect(titel(p)).toEqual(["EL", "·KatSL(links)", "·X1", "·X2", "··U", "·", "·X5", "·Y3", "·Y4", "Wurzel 2"]);
    expect(s(p, "neu")).toMatchObject({ eltern: "el", lage: "unter", verbindungId: "a", titel: "" });
    expect(PLAN.stellen.find((x) => x.id === "neu")).toBeUndefined(); // Eingabe unverändert
  });
  it("auf einer Wurzel: neue Wurzel ohne Verbindung; auf einer Seitenstelle: Seitenstelle derselben Seite", () => {
    expect(s(fuegeGeschwisterEin(PLAN, "el", "n"), "n")).toMatchObject({ eltern: null, verbindungId: null });
    // hinter dem GANZEN Teilbaum von EL (acht Zeilen) und vor „Wurzel 2“
    expect(titel(fuegeGeschwisterEin(PLAN, "el", "n")).slice(7)).toEqual(["·Y4", "", "Wurzel 2"]);
    expect(s(fuegeGeschwisterEin(PLAN, "kat", "n"), "n")).toMatchObject({ eltern: "el", lage: "links" });
  });
  it("über 500 Stellen: PlanFehler mit Zahl", () => {
    const voll = baue({ stellen: Array.from({ length: GRENZE.stellen }, (_, i) => ({ id: `s${i}`, titel: `S${i}` })) });
    expect(() => fuegeGeschwisterEin(voll, "s0", "zu")).toThrow(zuVieleStellen(GRENZE.stellen + 1));
  });
});

describe("Tab und Umschalt+Tab (Entscheidung 6, Review Focus 3)", () => {
  it("Tab: letzte Unterstelle der vorigen Geschwisterstelle, tritt deren letztem Bus bei; der Teilbaum wandert mit", () => {
    const p = rueckeEin(PLAN, "x5"); // vorige in Anzeigereihenfolge: X2 (hat U ohne Verbindung)
    gueltig(p);
    expect(s(p, "x5")).toMatchObject({ eltern: "x2", verbindungId: null });
    expect(titel(p)).toEqual(["EL", "·KatSL(links)", "·X1", "·X2", "··U", "··X5", "·Y3", "·Y4", "Wurzel 2"]);
    const q = rueckeEin(PLAN, "x2"); // unter X1, das keine Unterstellen hat
    expect(s(q, "x2")).toMatchObject({ eltern: "x1", verbindungId: null });
    expect(s(q, "u").eltern).toBe("x2");
  });
  it("Tab auf der ersten Stelle einer Ebene, auf einer Seitenstelle: PlanFehler, nichts ändert sich", () => {
    expect(() => rueckeEin(PLAN, "x1")).toThrow(new PlanFehler(MELDUNG.ersteEinruecken));
    expect(() => rueckeEin(PLAN, "el")).toThrow(MELDUNG.ersteEinruecken);
    expect(() => rueckeEin(PLAN, "kat")).toThrow(MELDUNG.seiteEbene);
  });
  it("Tab auf der zweiten Wurzel: sie wird Unterstelle der ersten", () => {
    expect(s(rueckeEin(PLAN, "w2"), "w2")).toMatchObject({ eltern: "el", verbindungId: "b" }); // letzte in Anzeigereihenfolge: Y4
  });
  it("Umschalt+Tab: direkt hinter die Elternstelle, in deren Busgruppe; spätere Geschwister bleiben", () => {
    const p = rueckeAus(PLAN, "u");
    gueltig(p);
    expect(s(p, "u")).toMatchObject({ eltern: "el", verbindungId: "a" });
    expect(titel(p)).toEqual(["EL", "·KatSL(links)", "·X1", "·X2", "·U", "·X5", "·Y3", "·Y4", "Wurzel 2"]);
    const q = rueckeAus(PLAN, "y3"); // Elternstelle ist eine Wurzel: oberste Ebene, keine Verbindung
    expect(s(q, "y3")).toMatchObject({ eltern: null, verbindungId: null });
    expect(titel(q).slice(-3)).toEqual(["·Y4", "Y3", "Wurzel 2"]);
  });
  it("Umschalt+Tab auf einer Wurzel oder Seitenstelle: PlanFehler", () => {
    expect(() => rueckeAus(PLAN, "el")).toThrow(MELDUNG.wurzelAusruecken);
    expect(() => rueckeAus(PLAN, "kat")).toThrow(MELDUNG.seiteEbene);
  });
  it("Hin und zurück ist wieder derselbe Baum (Titelfolge): X5 steht wieder hinter X2s Teilbaum in Gruppe A", () => {
    expect(titel(rueckeAus(rueckeEin(PLAN, "x5"), "x5"))).toEqual(titel(PLAN));
  });
});

describe("Alt+↑/↓ (Entscheidung 7, Review Focus 2)", () => {
  it("innerhalb der Busgruppe: Tausch mit dem Nachbarn", () => {
    const p = verschiebeInReihe(PLAN, "x5", "hoch");
    gueltig(p);
    expect(titel(p)).toEqual(["EL", "·KatSL(links)", "·X1", "·X5", "·X2", "··U", "·Y3", "·Y4", "Wurzel 2"]);
  });
  it("am Rand der Gruppe wandert die ganze Gruppe — jeder Schritt ändert das Bild", () => {
    const p = verschiebeInReihe(PLAN, "y3", "hoch"); // Y3 ist erste der Gruppe B → B vor A
    expect(titel(p)).toEqual(["EL", "·KatSL(links)", "·Y3", "·Y4", "·X1", "·X2", "··U", "·X5", "Wurzel 2"]);
    const q = verschiebeInReihe(PLAN, "x5", "runter"); // X5 letzte der Gruppe A → A hinter B
    expect(titel(q).slice(2, 4)).toEqual(["·Y3", "·Y4"]);
  });
  it("am Anfang oder Ende der Reihe: dasselbe Objekt", () => {
    expect(verschiebeInReihe(PLAN, "x1", "hoch")).toBe(PLAN);
    expect(verschiebeInReihe(PLAN, "y4", "runter")).toBe(PLAN);
    expect(verschiebeInReihe(PLAN, "kat", "hoch")).toBe(PLAN);
    expect(verschiebeInReihe(PLAN, "w2", "hoch")).not.toBe(PLAN);
  });
  it("gleiche reihenfolge-Werte: die Anzeigereihenfolge (dann id) gilt, und danach ist die Reihe eindeutig nummeriert", () => {
    const gleich: PlanInhalt = { ...PLAN, stellen: PLAN.stellen.map((x) => (x.eltern === "el" && x.lage === "unter" ? { ...x, reihenfolge: 0 } : x)) };
    const vorher = titel(gleich); // Gleichstand → nach id: X1, X2, X5 | Y3, Y4
    const p = verschiebeInReihe(gleich, "x2", "runter");
    const r = reihe(p, "el", "unter").map((x) => x.reihenfolge);
    expect(new Set(r).size).toBe(r.length);
    expect(titel(p)).not.toEqual(vorher);
  });
});

describe("Zeilenaktionen und leere Zeilen (Entscheidungen 8, 11)", () => {
  it("was im Menü erreichbar ist", () => {
    expect(zeilenAktionen(PLAN, "x1")).toEqual({ einruecken: false, ausruecken: true, hoch: false, runter: true });
    expect(zeilenAktionen(PLAN, "el")).toEqual({ einruecken: false, ausruecken: false, hoch: false, runter: true });
    expect(zeilenAktionen(PLAN, "kat")).toEqual({ einruecken: false, ausruecken: false, hoch: false, runter: false });
    expect(zeilenAktionen(PLAN, "y4")).toEqual({ einruecken: true, ausruecken: true, hoch: true, runter: false });
  });
  it("leere Zeile ohne Nachkommen wird gelöscht; mit Nachkommen oder Titel: PlanFehler", () => {
    const mitLeer = fuegeGeschwisterEin(PLAN, "x1", "leer");
    expect(loescheLeereZeile(mitLeer, "leer").stellen.some((x) => x.id === "leer")).toBe(false);
    const leerMitKind = { ...PLAN, stellen: PLAN.stellen.map((x) => (x.id === "x2" ? { ...x, titel: " " } : x)) };
    expect(() => loescheLeereZeile(leerMitKind, "x2")).toThrow(MELDUNG.nichtLeer);
    expect(() => loescheLeereZeile(PLAN, "x1")).toThrow(MELDUNG.mitTitel);
  });
});
```

- [ ] **Step 3: Tests laufen lassen, sie schlagen fehl**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan/gliederung.test.ts`
Expected: FAIL — Modul `./gliederung` fehlt.

- [ ] **Step 4: `gliederung.ts` schreiben**

```ts
import { anzeigereihenfolge } from "../layout/gruppen";
import { baueBaum, nachkommen } from "./baum";
import { gueltig, leereStelle, loescheStelle, naechsteReihenfolge, PlanFehler, stelleOder } from "./operationen";
import { GRENZE, type Lage, type PlanInhalt, type Stelle } from "./schema";

/**
 * DIE GLIEDERUNG ALS REINE OPERATIONEN (Spec §6.5, §6.6; Umsetzungsplan Phase 3, Entscheidungen 4–8).
 * Diagramm und Gliederung zeigen dieselbe Reihenfolge: Geschwister in ANZEIGEREIHENFOLGE — Busgruppen
 * zusammenhängend, wie `anzeigereihenfolge` sie dem Layout vorgibt. Wo eine Operation die Folge
 * ändert, nummeriert sie die ganze Reihe in der neuen Folge durch (`mitFolge`); so bleibt jede Gruppe
 * zusammen und die Gruppenfolge = Folge des ersten Vorkommens.
 */
export const MELDUNG = {
  ersteEinruecken: "Die erste Stelle einer Ebene lässt sich nicht einrücken.",
  wurzelAusruecken: "Eine Stelle der obersten Ebene lässt sich nicht ausrücken.",
  seiteEbene: "Eine Seitenstelle wechselt ihre Ebene nicht in der Gliederung — dafür „Details“ → „Untersteht“.",
  nichtLeer: "Diese Zeile hat Unter- oder Seitenstellen — löschen über „Aktionen“ → „Stelle löschen“.",
  mitTitel: "Nur eine Zeile ohne Titel wird so gelöscht.",
  inSeitenstelle: "In eine Seitenstelle lässt sich keine Gliederung einfügen — sie trägt keine Unterstellen.",
} as const;
export const zuVieleStellen = (zahl: number) => `Höchstens ${GRENZE.stellen} Stellen je Plan — hier wären es ${zahl}.`;

export function pruefeAnzahl(inhalt: PlanInhalt, dazu: number): void {
  const zahl = inhalt.stellen.length + dazu;
  if (zahl > GRENZE.stellen) throw new PlanFehler(zuVieleStellen(zahl));
}

/** Geschwister derselben Lage in Anzeigereihenfolge; Wurzeln und Seitenstellen ohne Busgruppen (wie das Layout). */
export function reihe(inhalt: PlanInhalt, eltern: string | null, lage: Lage): Stelle[] {
  const baum = baueBaum(inhalt);
  if (lage !== "unter") return eltern === null ? [] : baum.seiten(eltern)[lage];
  return eltern === null ? baum.wurzeln : anzeigereihenfolge(baum.unter(eltern));
}

/** `reihenfolge` 0, 1, 2 … in der Folge `folge`; unveränderte Stellen bleiben dasselbe Objekt. */
function mitFolge(stellen: readonly Stelle[], folge: readonly string[]): Stelle[] {
  const nr = new Map(folge.map((id, i) => [id, i]));
  return stellen.map((s) => { const r = nr.get(s.id); return r === undefined || r === s.reihenfolge ? s : { ...s, reihenfolge: r }; });
}

export interface GliederungsZeile { stelle: Stelle; ebene: number; seite: "links" | "rechts" | null; eltern: Stelle | null }

export function gliederungsZeilen(inhalt: PlanInhalt): GliederungsZeile[] {
  const baum = baueBaum(inhalt);
  const aus: GliederungsZeile[] = [];
  const besuche = (s: Stelle, ebene: number, eltern: Stelle | null) => {
    aus.push({ stelle: s, ebene, seite: null, eltern });
    const seiten = baum.seiten(s.id);
    for (const x of seiten.links) aus.push({ stelle: x, ebene: ebene + 1, seite: "links", eltern: s });
    for (const x of seiten.rechts) aus.push({ stelle: x, ebene: ebene + 1, seite: "rechts", eltern: s });
    for (const k of anzeigereihenfolge(baum.unter(s.id))) besuche(k, ebene + 1, s);
  };
  baum.wurzeln.forEach((w) => besuche(w, 0, null));
  return aus;
}

export function nachbarZeile(zeilen: readonly GliederungsZeile[], id: string, richtung: "hoch" | "runter"): string | null {
  const i = zeilen.findIndex((z) => z.stelle.id === id);
  if (i < 0) return null;
  return zeilen[richtung === "hoch" ? i - 1 : i + 1]?.stelle.id ?? null;
}

export function zeilenAktionen(inhalt: PlanInhalt, id: string): { einruecken: boolean; ausruecken: boolean; hoch: boolean; runter: boolean } {
  const s = stelleOder(inhalt, id);
  const r = reihe(inhalt, s.eltern, s.lage);
  const i = r.findIndex((x) => x.id === id);
  const unter = s.lage === "unter";
  return { einruecken: unter && i > 0, ausruecken: unter && s.eltern !== null, hoch: i > 0, runter: i < r.length - 1 };
}

/** Entscheidung 5. Eine Wurzel bekommt keine Verbindung (die verbindungId einer Wurzel ist kein Weg). */
export function fuegeGeschwisterEin(inhalt: PlanInhalt, nachId: string, id: string): PlanInhalt {
  const s = stelleOder(inhalt, nachId);
  pruefeAnzahl(inhalt, 1);
  const folge = reihe(inhalt, s.eltern, s.lage).map((x) => x.id);
  folge.splice(folge.indexOf(nachId) + 1, 0, id);
  const neu = leereStelle(id, s.eltern, s.lage, 0, s.eltern === null ? null : s.verbindungId);
  return gueltig({ ...inhalt, stellen: mitFolge([...inhalt.stellen, neu], folge) });
}

/** Entscheidung 6: letzte Unterstelle der vorigen Geschwisterstelle, am Bus ihrer bisher letzten Unterstelle. */
export function rueckeEin(inhalt: PlanInhalt, id: string): PlanInhalt {
  const s = stelleOder(inhalt, id);
  if (s.lage !== "unter") throw new PlanFehler(MELDUNG.seiteEbene);
  const folge = reihe(inhalt, s.eltern, "unter");
  const i = folge.findIndex((x) => x.id === id);
  if (i <= 0) throw new PlanFehler(MELDUNG.ersteEinruecken);
  const eltern = folge[i - 1];
  const verbindungId = reihe(inhalt, eltern.id, "unter").at(-1)?.verbindungId ?? null;
  const reihenfolge = naechsteReihenfolge(inhalt, eltern.id, "unter");
  return gueltig({ ...inhalt, stellen: inhalt.stellen.map((x) => (x.id === id ? { ...x, eltern: eltern.id, reihenfolge, verbindungId } : x)) });
}

/** Entscheidung 6: direkt hinter die Elternstelle, in deren Busgruppe; spätere Geschwister bleiben. */
export function rueckeAus(inhalt: PlanInhalt, id: string): PlanInhalt {
  const s = stelleOder(inhalt, id);
  if (s.lage !== "unter") throw new PlanFehler(MELDUNG.seiteEbene);
  if (s.eltern === null) throw new PlanFehler(MELDUNG.wurzelAusruecken);
  const eltern = stelleOder(inhalt, s.eltern);
  const folge = reihe(inhalt, eltern.eltern, "unter").map((x) => x.id);
  folge.splice(folge.indexOf(eltern.id) + 1, 0, id);
  const verbindungId = eltern.eltern === null ? null : eltern.verbindungId;
  const stellen = inhalt.stellen.map((x) => (x.id === id ? { ...x, eltern: eltern.eltern, verbindungId } : x));
  return gueltig({ ...inhalt, stellen: mitFolge(stellen, folge) });
}

/** Busgruppen einer Reihe als zusammenhängende Läufe gleicher Verbindung (die Anzeigereihenfolge hält sie zusammen). */
function laeufe(folge: readonly Stelle[], gruppiert: boolean): Stelle[][] {
  if (!gruppiert) return folge.map((s) => [s]);
  const aus: Stelle[][] = [];
  for (const s of folge) {
    const letzte = aus.at(-1);
    if (letzte && (letzte[0].verbindungId ?? null) === (s.verbindungId ?? null)) letzte.push(s); else aus.push([s]);
  }
  return aus;
}

/** Entscheidung 7: in der Gruppe tauschen; am Gruppenrand wandert die ganze Gruppe; am Reihenende dasselbe Objekt. */
export function verschiebeInReihe(inhalt: PlanInhalt, id: string, richtung: "hoch" | "runter"): PlanInhalt {
  const s = stelleOder(inhalt, id);
  const gruppen = laeufe(reihe(inhalt, s.eltern, s.lage), s.lage === "unter" && s.eltern !== null);
  const g = gruppen.findIndex((gr) => gr.some((x) => x.id === id));
  const i = gruppen[g].findIndex((x) => x.id === id);
  const d = richtung === "hoch" ? -1 : 1;
  if (gruppen[g][i + d]) [gruppen[g][i], gruppen[g][i + d]] = [gruppen[g][i + d], gruppen[g][i]];
  else if (gruppen[g + d]) [gruppen[g], gruppen[g + d]] = [gruppen[g + d], gruppen[g]];
  else return inhalt;
  return gueltig({ ...inhalt, stellen: mitFolge(inhalt.stellen, gruppen.flat().map((x) => x.id)) });
}

/** Entscheidung 8: nur eine Zeile ohne Titel und ohne Unter- oder Seitenstellen. */
export function loescheLeereZeile(inhalt: PlanInhalt, id: string): PlanInhalt {
  const s = stelleOder(inhalt, id);
  if (s.titel.trim() !== "") throw new PlanFehler(MELDUNG.mitTitel);
  if (nachkommen(baueBaum(inhalt), id).length > 0) throw new PlanFehler(MELDUNG.nichtLeer);
  return loescheStelle(inhalt, id).inhalt;
}
```

Der Test „Hin und zurück" gilt, weil `rueckeAus` X5 direkt hinter X2 (die neue Elternstelle war X2) in Gruppe A stellt — X5 stand vorher ebenfalls als letzte der Gruppe A. Schlägt er fehl, ist das ein Befund an `rueckeAus`/`mitFolge`, nicht am Test.

- [ ] **Step 5: Tests laufen lassen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan/`
Expected: PASS (neue und alle bestehenden Planoperationen).

- [ ] **Step 6: Typecheck, Lint, Ankerschritt, Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm exec eslint src/app/m/kommplan/_lib/plan/
git grep -n "operationen.ts:[0-9]" -- src scripts e2e docs
pnpm anker:drift src/app/m/kommplan/_lib/plan/operationen.ts
git add src/app/m/kommplan/_lib/plan/operationen.ts src/app/m/kommplan/_lib/plan/gliederung.ts src/app/m/kommplan/_lib/plan/gliederung.test.ts
git commit -S -m "feat(kommplan): Gliederungs-Operationen für Enter, Tab, Umschalt+Tab und Alt+Pfeil

Die Gliederung zeigt dieselbe Reihenfolge wie das Diagramm; Tab rückt
unter die vorige Stelle, Umschalt+Tab hinter die Elternstelle, Alt+Pfeil
tauscht in der Busgruppe oder schiebt am Gruppenrand die ganze Gruppe.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Teilbaum aus eingefügter Gliederung

**Files:**
- Modify: `src/app/m/kommplan/_lib/plan/gliederung.ts`
- Test: `src/app/m/kommplan/_lib/plan/gliederung.test.ts`

**Interfaces:**
- Consumes: `GliederungsEintrag` (Task 1), `reihe`, `mitFolge`, `pruefeAnzahl`, `MELDUNG` (Task 2).
- Produces: `export function fuegeGliederungEin(inhalt: PlanInhalt, ankerId: string, eintraege: readonly GliederungsEintrag[], ids: readonly string[]): { inhalt: PlanInhalt; zeilenIds: string[] }` — `zeilenIds[i]` ist die Stelle zu `eintraege[i]` (bei ersetztem Anker `zeilenIds[0] === ankerId`); `ids` muss mindestens `eintraege.length` frische IDs tragen.

- [ ] **Step 1: Die fehlenden Tests schreiben**

An `gliederung.test.ts` anhängen (Importe `fuegeGliederungEin` in die Zeile aus `./gliederung`, `leseGliederung` neu aus `./einfuegen`):

```ts
describe("fuegeGliederungEin (Entscheidung 9, Review Focus 4)", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `g${i}`);
  const TEXT = "EA Nord\n\tRTW 1\n\tRTW 2\n\t\tNEF\nEA Süd";

  it("Ebene 0 wird Geschwister NACH der Cursorzeile samt Teilbaum (Verbindung wie Enter), tiefere Zeilen Unterstellen", () => {
    const { eintraege } = leseGliederung(TEXT);
    const r = fuegeGliederungEin(PLAN, "x2", eintraege, ids(5));
    gueltig(r.inhalt);
    expect(titel(r.inhalt)).toEqual(["EL", "·KatSL(links)", "·X1", "·X2", "··U", "·EA Nord", "··RTW 1", "··RTW 2", "···NEF", "·EA Süd", "·X5", "·Y3", "·Y4", "Wurzel 2"]);
    expect(s(r.inhalt, "g0").verbindungId).toBe("a");
    expect(s(r.inhalt, "g1").verbindungId).toBeNull();
    expect(r.zeilenIds).toEqual(ids(5));
  });
  it("eine ganz leere Cursorzeile wird ersetzt: die erste Zeile nimmt ihren Platz ein", () => {
    const mitLeer = fuegeGeschwisterEin(PLAN, "x1", "leer");
    const r = fuegeGliederungEin(mitLeer, "leer", leseGliederung("EA\n\tRTW").eintraege, ids(2));
    expect(r.zeilenIds).toEqual(["leer", "g0"]);
    expect(s(r.inhalt, "leer").titel).toBe("EA");
    expect(s(r.inhalt, "g0").eltern).toBe("leer");
    expect(r.inhalt.stellen).toHaveLength(mitLeer.stellen.length + 1);
  });
  it("auf oberster Ebene: neue Wurzeln ohne Verbindung", () => {
    const r = fuegeGliederungEin(PLAN, "w2", leseGliederung("Stab\n\tS1").eintraege, ids(2));
    expect(titel(r.inhalt).slice(-3)).toEqual(["Wurzel 2", "Stab", "·S1"]);
    expect(s(r.inhalt, "g0")).toMatchObject({ eltern: null, verbindungId: null });
  });
  it("in eine Seitenstelle: PlanFehler; über 500 Stellen: PlanFehler mit Zahl; das Dokument bleibt", () => {
    expect(() => fuegeGliederungEin(PLAN, "kat", leseGliederung("A\nB").eintraege, ids(2))).toThrow(MELDUNG.inSeitenstelle);
    const viele = Array.from({ length: GRENZE.stellen }, (_, i) => ({ ebene: 0, titel: `S${i}` }));
    expect(() => fuegeGliederungEin(PLAN, "x1", viele, ids(GRENZE.stellen))).toThrow(zuVieleStellen(PLAN.stellen.length + GRENZE.stellen));
  });
  it("leere Eingabe: dasselbe Objekt", () => {
    expect(fuegeGliederungEin(PLAN, "x1", [], []).inhalt).toBe(PLAN);
  });
  it("Zusicherung: jede eingefügte Zeile steht mit ihrer Ebene in der Gliederung, relativ zur Cursorzeile", () => {
    const { eintraege } = leseGliederung("A\n\tB\n\t\tC\n\tD\nE\n\tF");
    const r = fuegeGliederungEin(PLAN, "y3", eintraege, ids(6));
    const z = gliederungsZeilen(r.inhalt);
    const basis = z.find((x) => x.stelle.id === "y3")!.ebene;
    eintraege.forEach((e, i) => expect(z.find((x) => x.stelle.id === r.zeilenIds[i])).toMatchObject({ ebene: basis + e.ebene, stelle: { titel: e.titel } }));
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan/gliederung.test.ts`
Expected: FAIL — `fuegeGliederungEin` fehlt.

- [ ] **Step 3: Implementieren**

In `gliederung.ts` den Import `import type { GliederungsEintrag } from "./einfuegen";` ergänzen und anfügen:

```ts
/** Nichts an der Zeile außer der Lage: kein Titel, kein Zeichen, keine Angaben, keine Nachkommen. */
function istLeer(inhalt: PlanInhalt, s: Stelle): boolean {
  return s.titel.trim() === "" && s.leiter === null && s.zeichen === null && s.kontakte.length === 0
    && s.einheiten.length === 0 && s.kanaele.length === 0 && nachkommen(baueBaum(inhalt), s.id).length === 0;
}

/**
 * MEHRZEILIGES EINFÜGEN (Spec §6.5, Entscheidung 9). Ebene-0-Einträge werden Geschwister nach dem Anker
 * samt Teilbaum und treten seinem Bus bei (wie Enter); tiefere Einträge werden Unterstellen des letzten
 * Eintrags eine Ebene höher, ohne Verbindung. Ein ganz leerer Anker wird durch den ersten Eintrag ersetzt.
 */
export function fuegeGliederungEin(inhalt: PlanInhalt, ankerId: string, eintraege: readonly GliederungsEintrag[], ids: readonly string[]): { inhalt: PlanInhalt; zeilenIds: string[] } {
  const anker = stelleOder(inhalt, ankerId);
  if (anker.lage !== "unter") throw new PlanFehler(MELDUNG.inSeitenstelle);
  if (eintraege.length === 0) return { inhalt, zeilenIds: [] };
  const ersetzt = istLeer(inhalt, anker);
  const dazu = eintraege.length - (ersetzt ? 1 : 0);
  pruefeAnzahl(inhalt, dazu);
  if (ids.length < dazu) throw new Error(`fuegeGliederungEin: ${dazu} IDs nötig, ${ids.length} bekommen`);
  const zeilenIds = ersetzt ? [anker.id, ...ids.slice(0, dazu)] : ids.slice(0, dazu);
  const stapel: string[] = [];
  const naechste = new Map<string, number>();
  const oben: string[] = [];
  const neu: Stelle[] = [];
  let stellen = inhalt.stellen;
  eintraege.forEach((e, i) => {
    const id = zeilenIds[i];
    stapel.length = e.ebene;
    stapel.push(id);
    if (i === 0 && ersetzt) { stellen = stellen.map((x) => (x.id === id ? { ...x, titel: e.titel } : x)); return; }
    if (e.ebene === 0) {
      oben.push(id);
      neu.push({ ...leereStelle(id, anker.eltern, "unter", 0, anker.eltern === null ? null : anker.verbindungId), titel: e.titel });
      return;
    }
    const eltern = stapel[e.ebene - 1];
    const r = naechste.get(eltern) ?? 0;
    naechste.set(eltern, r + 1);
    neu.push({ ...leereStelle(id, eltern, "unter", r, null), titel: e.titel });
  });
  const folge = reihe(inhalt, anker.eltern, "unter").map((x) => x.id);
  folge.splice(folge.indexOf(anker.id) + 1, 0, ...oben);
  return { inhalt: gueltig({ ...inhalt, stellen: mitFolge([...stellen, ...neu], folge) }), zeilenIds };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan/`
Expected: PASS.

- [ ] **Step 5: Typecheck, Lint, Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm exec eslint src/app/m/kommplan/_lib/plan/gliederung.ts src/app/m/kommplan/_lib/plan/gliederung.test.ts
git add src/app/m/kommplan/_lib/plan/gliederung.ts src/app/m/kommplan/_lib/plan/gliederung.test.ts
git commit -S -m "feat(kommplan): eingefügte Gliederung wird ein Teilbaum an der Cursorzeile

Ebene-0-Zeilen stehen nach der Cursorzeile am selben Bus, tiefere Zeilen
werden Unterstellen; eine ganz leere Cursorzeile wird ersetzt. Seitenstellen
und mehr als 500 Stellen werden abgewiesen.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reine Bausteine der Gliederung — Ansicht in der Adresse, Tasten, Verbindungsoptionen

**Files:**
- Create: `src/app/m/kommplan/_lib/editorAnsicht.ts`, Test `src/app/m/kommplan/_lib/editorAnsicht.test.ts`
- Create: `src/app/m/kommplan/_ui/gliederung/tasten.ts`, Test `src/app/m/kommplan/_ui/gliederung/tasten.test.ts`
- Create: `src/app/m/kommplan/_ui/gliederung/verbindungsOptionen.ts`, Test `src/app/m/kommplan/_ui/gliederung/verbindungsOptionen.test.ts`

**Interfaces:**
- Consumes: `Taste` (`_ui/editor/tasten`), `ART_NAME`, `LAENGE`, `VERBINDUNGS_ARTEN`, `PlanInhalt`, `VerbindungsArt` (`_lib/plan/schema`), `findeVerbindung` (`_lib/plan/verbindungen`).
- Produces:
  - `_lib/editorAnsicht.ts` (ohne `"use client"`, Falle 6): `export const EDITOR_ANSICHTEN = ["diagramm", "gliederung"] as const`; `export type EditorAnsicht`; `export const SCHMAL = "(max-width: 767.98px)"`; `export function leseEditorAnsicht(wert: string | string[] | undefined): EditorAnsicht | null`; `export function adresseMitAnsicht(href: string, ansicht: EditorAnsicht): string` (Pfad + Suche + Anker); `export function sichtbareAnsicht(gewaehlt: EditorAnsicht | null, schmal: boolean): EditorAnsicht`.
  - `_ui/gliederung/tasten.ts`: `export type GliederungsBefehl = { art: "neu" } | { art: "einruecken" } | { art: "ausruecken" } | { art: "verschiebe"; richtung: "hoch" | "runter" } | { art: "wandere"; richtung: "hoch" | "runter" } | { art: "loeschen"; richtung: "hoch" | "runter" } | { art: "verlassen" } | { art: "details" }`; `export function gliederungsBefehl(t: Taste & { isComposing?: boolean }, titelLeer: boolean): GliederungsBefehl | null`.
  - `_ui/gliederung/verbindungsOptionen.ts`: `export const KEINE = "~keine"`; `export interface VerbindungsOption { value: string; label: string; disabled?: boolean }`; `export function verbindungsOptionen(inhalt: PlanInhalt, suche: string): VerbindungsOption[]`; `export function leseNeu(wert: string): VerbindungsArt | null`.

- [ ] **Step 1: Die fehlenden Tests schreiben**

`src/app/m/kommplan/_lib/editorAnsicht.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { adresseMitAnsicht, leseEditorAnsicht, sichtbareAnsicht } from "./editorAnsicht";

describe("Ansicht des Editors (Entscheidung 1)", () => {
  it("nur die zwei erlaubten Werte; alles andere heißt „nicht gewählt“", () => {
    expect(leseEditorAnsicht("gliederung")).toBe("gliederung");
    expect(leseEditorAnsicht(["diagramm", "gliederung"])).toBe("diagramm");
    expect(leseEditorAnsicht("Gliederung")).toBeNull();
    expect(leseEditorAnsicht("<script>")).toBeNull();
    expect(leseEditorAnsicht(undefined)).toBeNull();
  });
  it("die Adresse behält Pfad, andere Parameter und Anker", () => {
    expect(adresseMitAnsicht("http://kommplan.localtest.me:3100/p/abc?x=1#k", "gliederung")).toBe("/p/abc?x=1&ansicht=gliederung#k");
    expect(adresseMitAnsicht("http://h/p/abc?ansicht=gliederung", "diagramm")).toBe("/p/abc?ansicht=diagramm");
  });
  it("sichtbar: die ausdrückliche Wahl, sonst der Breakpoint", () => {
    expect(sichtbareAnsicht("diagramm", true)).toBe("diagramm");
    expect(sichtbareAnsicht(null, true)).toBe("gliederung");
    expect(sichtbareAnsicht(null, false)).toBe("diagramm");
  });
});
```

`src/app/m/kommplan/_ui/gliederung/tasten.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gliederungsBefehl } from "./tasten";

const t = (key: string, mehr: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; isComposing: boolean }> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mehr });

describe("Tasten der Gliederung (Spec §6.5, Entscheidungen 5–10)", () => {
  it("Enter, Tab, Umschalt+Tab, Alt+↑/↓, ↑/↓, Esc, F2", () => {
    expect(gliederungsBefehl(t("Enter"), false)).toEqual({ art: "neu" });
    expect(gliederungsBefehl(t("Tab"), false)).toEqual({ art: "einruecken" });
    expect(gliederungsBefehl(t("Tab", { shiftKey: true }), false)).toEqual({ art: "ausruecken" });
    expect(gliederungsBefehl(t("ArrowUp", { altKey: true }), false)).toEqual({ art: "verschiebe", richtung: "hoch" });
    expect(gliederungsBefehl(t("ArrowDown", { altKey: true }), false)).toEqual({ art: "verschiebe", richtung: "runter" });
    expect(gliederungsBefehl(t("ArrowUp"), false)).toEqual({ art: "wandere", richtung: "hoch" });
    expect(gliederungsBefehl(t("ArrowDown"), false)).toEqual({ art: "wandere", richtung: "runter" });
    expect(gliederungsBefehl(t("Escape"), false)).toEqual({ art: "verlassen" });
    expect(gliederungsBefehl(t("F2"), false)).toEqual({ art: "details" });
  });
  it("Rücktaste und Entf nur auf leerem Titel — sonst gehören sie dem Feld", () => {
    expect(gliederungsBefehl(t("Backspace"), true)).toEqual({ art: "loeschen", richtung: "hoch" });
    expect(gliederungsBefehl(t("Delete"), true)).toEqual({ art: "loeschen", richtung: "runter" });
    expect(gliederungsBefehl(t("Backspace"), false)).toBeNull();
    expect(gliederungsBefehl(t("Delete"), false)).toBeNull();
  });
  it("während einer Eingabekomposition (IME) und mit Strg/Cmd: nichts; Buchstaben: nichts", () => {
    expect(gliederungsBefehl(t("Enter", { isComposing: true }), false)).toBeNull();
    expect(gliederungsBefehl(t("Enter", { ctrlKey: true }), false)).toBeNull();
    expect(gliederungsBefehl(t("Tab", { metaKey: true }), false)).toBeNull();
    expect(gliederungsBefehl(t("Enter", { shiftKey: true }), false)).toBeNull();
    expect(gliederungsBefehl(t("n"), false)).toBeNull();
  });
});
```

`src/app/m/kommplan/_ui/gliederung/verbindungsOptionen.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { baue } from "../../_lib/beispiele/bau";
import { LAENGE, VERBINDUNGS_ARTEN } from "../../_lib/plan/schema";
import { KEINE, leseNeu, verbindungsOptionen } from "./verbindungsOptionen";

const PLAN = baue({
  verbindungen: [{ id: "a", art: "tmo", bezeichnung: "R_UE_2" }, { id: "b", art: "dmo", bezeichnung: "DMO 608" }],
  stellen: [{ id: "el", titel: "EL" }],
});

describe("Verbindung inline (Entscheidung 12)", () => {
  it("ohne Suche: „keine“ und alle Verbindungen, mit Art", () => {
    expect(verbindungsOptionen(PLAN, "")).toEqual([
      { value: KEINE, label: "keine (dünne Linie)" },
      { value: "a", label: "R_UE_2 · Digitalfunk TMO" },
      { value: "b", label: "DMO 608 · Digitalfunk DMO" },
    ]);
  });
  it("Suche filtert; neuer Text bietet JE ART eine Option, die zuletzt angelegte Art zuerst", () => {
    const o = verbindungsOptionen(PLAN, "R_UE_3");
    expect(o.filter((x) => leseNeu(x.value) === null)).toEqual([]);
    expect(o.map((x) => leseNeu(x.value))).toEqual(["dmo", ...VERBINDUNGS_ARTEN.filter((a) => a !== "dmo")]);
    expect(o[0].label).toBe("Neu: „R_UE_3“ als Digitalfunk DMO");
  });
  it("gleichnamig vorhanden: diese Art wird nicht noch einmal angeboten (Groß/Klein egal)", () => {
    const o = verbindungsOptionen(PLAN, "r_ue_2");
    expect(o[0]).toEqual({ value: "a", label: "R_UE_2 · Digitalfunk TMO" });
    expect(o.some((x) => leseNeu(x.value) === "tmo")).toBe(false);
    expect(o.some((x) => leseNeu(x.value) === "dmo")).toBe(true);
  });
  it("zu lange Bezeichnung: ein deaktivierter Hinweis statt neuer Optionen", () => {
    const o = verbindungsOptionen(PLAN, "x".repeat(LAENGE.bezeichnung + 1));
    expect(o).toEqual([{ value: "~zu-lang", label: `Höchstens ${LAENGE.bezeichnung} Zeichen`, disabled: true }]);
  });
  it("leseNeu erkennt nur die eigenen Werte", () => {
    expect(leseNeu("~neu:draht")).toBe("draht");
    expect(leseNeu("~neu:quatsch")).toBeNull();
    expect(leseNeu("a")).toBeNull();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `pnpm vitest run src/app/m/kommplan/_lib/editorAnsicht.test.ts src/app/m/kommplan/_ui/gliederung/`
Expected: FAIL — Module fehlen.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_lib/editorAnsicht.ts`:

```ts
/**
 * DIE ANSICHT DES EDITORS (Umsetzungsplan Phase 3, Entscheidung 1). Kein "use client": die Seite
 * (Server Component) liest den Adressparameter hiermit (Falle 6). `null` heißt „nicht gewählt" — dann
 * entscheidet CSS am Suite-Breakpoint (docs/design/README.md, „Mobil"), nie JavaScript im Rendern.
 */
export const EDITOR_ANSICHTEN = ["diagramm", "gliederung"] as const;
export type EditorAnsicht = (typeof EDITOR_ANSICHTEN)[number];
/** Derselbe Wert wie in `kommplan.css`; nur zur EREIGNISZEIT gefragt (wohin der Fokus zurückkehrt). */
export const SCHMAL = "(max-width: 767.98px)";

export function leseEditorAnsicht(wert: string | string[] | undefined): EditorAnsicht | null {
  const w = Array.isArray(wert) ? wert[0] : wert;
  return (EDITOR_ANSICHTEN as readonly string[]).includes(w ?? "") ? (w as EditorAnsicht) : null;
}

export function adresseMitAnsicht(href: string, ansicht: EditorAnsicht): string {
  const u = new URL(href);
  u.searchParams.set("ansicht", ansicht);
  return `${u.pathname}${u.search}${u.hash}`;
}

export function sichtbareAnsicht(gewaehlt: EditorAnsicht | null, schmal: boolean): EditorAnsicht {
  return gewaehlt ?? (schmal ? "gliederung" : "diagramm");
}
```

`src/app/m/kommplan/_ui/gliederung/tasten.ts`:

```ts
import type { Taste } from "../editor/tasten";

/**
 * TASTATUR DER GLIEDERUNG (Spec §6.5; Umsetzungsplan Phase 3, Entscheidungen 5–10) als reine Abbildung.
 * Sie gilt nur im Titelfeld einer Zeile. Strg/Cmd+Z behandelt die Gliederung vorher über
 * `globalerBefehl(…, false)` (Entscheidung 10). Rücktaste/Entf nur auf leerem Titel — sonst löschen sie
 * Zeichen. Während einer IME-Komposition bestätigt Enter die Komposition, nicht die Zeile.
 */
export type GliederungsBefehl =
  | { art: "neu" } | { art: "einruecken" } | { art: "ausruecken" }
  | { art: "verschiebe"; richtung: "hoch" | "runter" } | { art: "wandere"; richtung: "hoch" | "runter" }
  | { art: "loeschen"; richtung: "hoch" | "runter" } | { art: "verlassen" } | { art: "details" };

export function gliederungsBefehl(t: Taste & { isComposing?: boolean }, titelLeer: boolean): GliederungsBefehl | null {
  if (t.isComposing || t.ctrlKey || t.metaKey) return null;
  if (t.key === "Tab" && !t.altKey) return t.shiftKey ? { art: "ausruecken" } : { art: "einruecken" };
  if (t.shiftKey) return null;
  if (t.altKey) {
    if (t.key === "ArrowUp") return { art: "verschiebe", richtung: "hoch" };
    if (t.key === "ArrowDown") return { art: "verschiebe", richtung: "runter" };
    return null;
  }
  switch (t.key) {
    case "Enter": return { art: "neu" };
    case "ArrowUp": return { art: "wandere", richtung: "hoch" };
    case "ArrowDown": return { art: "wandere", richtung: "runter" };
    case "Backspace": return titelLeer ? { art: "loeschen", richtung: "hoch" } : null;
    case "Delete": return titelLeer ? { art: "loeschen", richtung: "runter" } : null;
    case "Escape": return { art: "verlassen" };
    case "F2": return { art: "details" };
    default: return null;
  }
}
```

`src/app/m/kommplan/_ui/gliederung/verbindungsOptionen.ts`:

```ts
import { ART_NAME, LAENGE, VERBINDUNGS_ARTEN, type PlanInhalt, type VerbindungsArt } from "../../_lib/plan/schema";
import { findeVerbindung } from "../../_lib/plan/verbindungen";

/**
 * OPTIONEN DES VERBINDUNGSFELDS DER GLIEDERUNG (Umsetzungsplan Phase 3, Entscheidung 12): wählen oder
 * neu tippen. Ein neuer Text bietet JE ART eine Option — die Art steht sichtbar in der Option (anders
 * als das in Phase 2 verworfene Kombifeld, Kritik 29), die zuletzt angelegte Art zuerst.
 */
export const KEINE = "~keine";
const NEU = "~neu:";
export interface VerbindungsOption { value: string; label: string; disabled?: boolean }

export function leseNeu(wert: string): VerbindungsArt | null {
  if (!wert.startsWith(NEU)) return null;
  const art = wert.slice(NEU.length);
  return (VERBINDUNGS_ARTEN as readonly string[]).includes(art) ? (art as VerbindungsArt) : null;
}

export function verbindungsOptionen(inhalt: PlanInhalt, suche: string): VerbindungsOption[] {
  const text = suche.trim();
  if (text.length > LAENGE.bezeichnung) return [{ value: "~zu-lang", label: `Höchstens ${LAENGE.bezeichnung} Zeichen`, disabled: true }];
  const klein = text.toLocaleLowerCase("de");
  const keine = klein === "" || "keine".includes(klein) ? [{ value: KEINE, label: "keine (dünne Linie)" }] : [];
  const vorhanden = inhalt.verbindungen
    .filter((v) => klein === "" || v.bezeichnung.toLocaleLowerCase("de").includes(klein))
    .map((v) => ({ value: v.id, label: `${v.bezeichnung} · ${ART_NAME[v.art]}` }));
  if (text === "") return [...keine, ...vorhanden];
  const zuerst = inhalt.verbindungen.at(-1)?.art ?? "tmo";
  const neu = [zuerst, ...VERBINDUNGS_ARTEN.filter((a) => a !== zuerst)]
    .filter((a) => !findeVerbindung(inhalt, text, a))
    .map((a) => ({ value: `${NEU}${a}`, label: `Neu: „${text}“ als ${ART_NAME[a]}` }));
  return [...keine, ...vorhanden, ...neu];
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/editorAnsicht.test.ts src/app/m/kommplan/_ui/gliederung/ src/app/m/kommplan/grenze.test.ts`
Expected: PASS (`grenze.test.ts`: `_lib/editorAnsicht.ts` ist rein).

- [ ] **Step 5: Typecheck, Lint, Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm exec eslint src/app/m/kommplan/_lib/editorAnsicht.ts src/app/m/kommplan/_lib/editorAnsicht.test.ts src/app/m/kommplan/_ui/gliederung/
git add src/app/m/kommplan/_lib/editorAnsicht.ts src/app/m/kommplan/_lib/editorAnsicht.test.ts src/app/m/kommplan/_ui/gliederung/
git commit -S -m "feat(kommplan): Bausteine der Gliederung — Ansicht in der Adresse, Tasten, Verbindungsoptionen

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Griffe kompakt, nah an der Karte, Seitengriffe beschriftet

**Files:**
- Modify: `src/app/m/kommplan/_ui/editor/Griffe.tsx`
- Modify: `src/app/m/kommplan/_ui/editor/Editor.tsx` (`GRIFF_RAND`, `platzOben` an die Fläche)
- Modify: `src/app/m/kommplan/_ui/betrachter/Flaeche.tsx` (Prop `platzOben`)
- Modify: `src/app/m/kommplan/_ui/kommplan.css`
- Test: `src/app/m/kommplan/_ui/kommplan-css.test.ts`, `src/app/m/kommplan/_ui/editor/Editor.test.tsx`, `src/app/m/kommplan/_ui/betrachter/Flaeche.test.tsx`, `e2e/kommplan-editor.spec.ts` (nur `ganzInDerFlaeche`)

**Interfaces:**
- Consumes: `KarteL`, `Ansicht`.
- Produces: `Griffe` mit unveränderten Props und unveränderten `data-griff`-Werten und `aria-label`s (e2e und Editor-Tests greifen darüber); `export const GRIFF_LUFT = 6` und `export const SEITENGRIFF_BREITE = 80` (Griffe.tsx); `GRIFF_RAND = { oben: 48, seite: 8 + SEITENGRIFF_BREITE + 8, unten: 96 }` (Editor.tsx); `Flaeche`-Prop `platzOben?: number` (Luft über der obersten Karte beim Einpassen; ohne Angabe 16 wie bisher).

- [ ] **Step 1: Die fehlenden Tests schreiben bzw. anpassen**

In `src/app/m/kommplan/_ui/kommplan-css.test.ts` die zwei Tests „der seitliche Griff bricht nicht um …" und „„+“ und Symbol im seitlichen Griff …" **ersetzen** durch (die Aussage über `.kp-betrachter > svg` bleibt als eigener Test erhalten):

```ts
  it("die Zeichnung ist nur das SVG direkt in der Fläche — kein Griff und kein Zeichenknopf erbt ihre Größe", () => {
    expect(css).toMatch(/\.kp-betrachter > svg \{[^}]*width: 100%/);
    expect(css).not.toMatch(/\.kp-betrachter svg \{/);
  });
  it("Griffe: 32 px sichtbar, einzeilig, Trefferfläche 44 px über ::before (Phase 3, Entscheidung 18)", () => {
    expect(css).toMatch(/\.kp-griff \{[^}]*height: 32px/);
    expect(css).toMatch(/\.kp-griff \{[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.kp-griff::before \{[^}]*inset: -6px 0/);
    expect(css).toMatch(/\.kp-griff:focus-visible \{[^}]*outline: 2px solid/);
    expect(css).toMatch(/\.kp-griffleiste \{[^}]*gap: 12px 6px/);
    expect(css).toMatch(/\.kp-griffe \.kp-griff-seite \{[^}]*bottom: calc\(100% \+ 6px\)/);
  });
  it("Rand der Griffe hebt sich vom Papier ab (WCAG 1.4.11): mindestens 3:1 gegen Weiß", () => {
    const farbe = /--kp-griff-rand: (#[0-9a-f]{6});/i.exec(css)?.[1];
    expect(farbe).toBeDefined();
    expect(kontrast(farbe!, "#ffffff")).toBeGreaterThanOrEqual(3);
  });
```

(`kontrast` ist in dieser Testdatei schon definiert — der Auswahlrahmen-Test nutzt es.)

In `src/app/m/kommplan/_ui/editor/Editor.test.tsx` die Importe ergänzen (`GRIFF_RAND` in die Zeile aus `./Editor`, neu `import { SEITENGRIFF_BREITE } from "./Griffe";`) und im ersten Test die Zeilen

```ts
    await waehle("a");
    expect(query('[data-griff="links"] .kp-griff-inhalt svg')).toBeTruthy();
```

ersetzen durch

```ts
    await waehle("a");
    expect(query('[data-griff="links"]').textContent).toBe("+ links");
    expect(query('[data-griff="rechts"]').textContent).toBe("+ rechts");
    expect(query('[data-griff="links"]').getAttribute("aria-label")).toBe("Seitenstelle links von EA 1 anlegen");
    expect(query<HTMLElement>('[data-griff="rechts"]').style.width).toBe(`${SEITENGRIFF_BREITE}px`); // berechenbarer Überstand
    expect(GRIFF_RAND.seite).toBe(8 + SEITENGRIFF_BREITE + 8);
    expect(queryAll("[data-griff]").every((b) => b.tagName === "BUTTON" && b.getAttribute("type") === "button")).toBe(true);
```

und anfügen (im `describe("Editor …")`):

```ts
  it("Griffleiste hängt 6 px unter der Karte, die Seitengriffe über ihren oberen Ecken (Phase 3, Entscheidung 18)", async () => {
    await zeige();
    await waehle("a");
    const karte = query<HTMLElement>('[data-griffe="a"] .kp-griffe-karte');
    const leiste = query<HTMLElement>('[data-griffe="a"] .kp-griffleiste');
    expect(parseFloat(leiste.style.top)).toBeCloseTo(parseFloat(karte.style.top) + parseFloat(karte.style.height) + 6, 5);
    expect(query('[data-griff="links"]').closest(".kp-griffe-karte")).toBe(karte);
  });
```

In `src/app/m/kommplan/_ui/betrachter/Flaeche.test.tsx` anfügen:

```ts
  it("platzOben: die eingepasste Zeichnung beginnt so weit unter der Oberkante (Platz für Griffe über der obersten Karte)", async () => {
    await zeige({ platzOben: 48 });
    expect(query("[data-ansicht]").getAttribute("transform")).toMatch(/^translate\([-\d.]+ 48\)/);
  });
```

Prüf vorher, dass `einpassen` bei Fläche 0 × 0 (jsdom misst nichts) `y: rand` liefert (`_ui/betrachter/ansicht.ts`, erster Zweig) — dann trägt der Test auch in jsdom.

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `pnpm vitest run src/app/m/kommplan/_ui/kommplan-css.test.ts src/app/m/kommplan/_ui/editor/Editor.test.tsx src/app/m/kommplan/_ui/betrachter/Flaeche.test.tsx`
Expected: FAIL in den neuen/angepassten Fällen (Klassen fehlen, Text ist „+", `platzOben` unbekannt).

- [ ] **Step 3: `Flaeche` bekommt `platzOben`**

In `Flaeche.tsx` die Prop in Destrukturierung und Typ ergänzen (`platzOben?: number`) und die Zeile

```ts
  const basis = einpassen(daten.breite, daten.hoehe, groesse.b - verdeckt, groesse.h, { max: maxMassstab, seite: platzSeite, unten: platzUnten });
```

ersetzen durch

```ts
  const basis = einpassen(daten.breite, daten.hoehe, groesse.b - verdeckt, groesse.h, { rand: platzOben, max: maxMassstab, seite: platzSeite, unten: platzUnten });
```

(`rand: undefined` fällt in `einpassen` auf 16 zurück; `seite`/`unten` werden ausdrücklich gereicht, der Rückfall auf `rand` greift dort also nicht.)

- [ ] **Step 4: `Griffe.tsx` neu schreiben**

Die ganze Datei ersetzen:

```tsx
"use client";

import { Tooltip } from "antd";
import type { KarteL } from "../../_lib/layout/typen";
import type { Ansicht } from "../betrachter/ansicht";

/** Abstand zwischen Karte und Griff: 4 px Auswahlrahmen außen plus 2 px Luft. */
export const GRIFF_LUFT = 6;
/**
 * Feste Breite der Seitengriffe: an einer schmalen Karte rücken sie nach außen, höchstens um ihre ganze
 * Breite — der Editor hält dafür seitlich `GRIFF_RAND.seite` frei (Phase 3, Entscheidung 18).
 */
export const SEITENGRIFF_BREITE = 80;

/**
 * GRIFFE DER AUSWAHL (Spec §6.3; Phase 2, Entscheidung 5; Phase 3, Entscheidung 18): eine
 * HTML-Überlagerung in Pixeln über dem SVG — die Knöpfe behalten bei jedem Zoom ihre Größe.
 *
 * KOMPAKT: eigene Knöpfe (`.kp-griff`), 32 px sichtbar, die Trefferfläche 44 px über ein unsichtbares
 * `::before` (Falle 4 und WCAG 2.5.5 ohne eine Größenregel gegen antd, Falle 5/20). Die Leiste hängt
 * `GRIFF_LUFT` unter der Karte; die Seitengriffe tragen „+ links"/„+ rechts" und sitzen über den oberen
 * Ecken — dort liegen Bus- und Abzweiglinien der EIGENEN Gruppe, keine Nachbarkarte. Ist die Karte
 * schmaler als beide Griffe, rücken sie nach außen (`translateX` mit `min`/`max` über die feste Breite
 * `SEITENGRIFF_BREITE` — gemessen wird nichts).
 *
 * DIE GRIFFLEISTE steht in Koordinaten der Überlagerung und wird per `clamp()` im Bild gehalten (Phase 2,
 * Kritik 26); ist sie breiter als die Fläche, bricht sie um (`flex-wrap`, Zeilenabstand 12 px, damit sich
 * die Trefferflächen nicht überlappen). Eine Seitenstelle trägt nichts (§4.2): dort nur „+ Einheit" und
 * „Bearbeiten".
 */
export function Griffe({ karte, ansicht, flaeche, seitenstelle, onUnterstelle, onSeitenstelle, onEinheit, onBearbeiten }: {
  karte: KarteL; ansicht: Ansicht; flaeche: { breite: number; hoehe: number }; seitenstelle: boolean;
  onUnterstelle: () => void; onSeitenstelle: (seite: "links" | "rechts") => void; onEinheit: () => void; onBearbeiten: () => void;
}) {
  const m = ansicht.massstab;
  const links = ansicht.x + karte.x * m, oben = ansicht.y + karte.y * m, breite = karte.breite * m, hoehe = karte.hoehe * m;
  const mitte = links + breite / 2;
  const halb = breite / 2 - 2;
  const titel = karte.titelVoll === "" ? "(ohne Titel)" : karte.titelVoll;
  const seitlich = (seite: "links" | "rechts") => (
    <Tooltip title={`Seitenstelle ${seite} anlegen — waagerecht, ohne Bus`} trigger={["hover", "focus"]}>
      <button type="button" data-griff={seite} className={`kp-griff kp-griff-seite kp-griff-${seite}`}
        aria-label={`Seitenstelle ${seite} von ${titel} anlegen`} onClick={() => onSeitenstelle(seite)}
        style={{ width: SEITENGRIFF_BREITE, transform: seite === "links" ? `translateX(min(0px, ${halb - SEITENGRIFF_BREITE}px))` : `translateX(max(0px, ${SEITENGRIFF_BREITE - halb}px))` }}>
        {`+ ${seite}`}
      </button>
    </Tooltip>
  );
  return (
    <div className="kp-griffe" data-griffe={karte.id}>
      <div className="kp-griffe-karte" style={{ left: links, top: oben, width: breite, height: hoehe }}>
        <div className="kp-auswahlrahmen" aria-hidden="true" />
        {seitenstelle ? null : <>{seitlich("links")}{seitlich("rechts")}</>}
      </div>
      <div className="kp-griffleiste" role="toolbar" aria-label={`Auswahl: ${titel}`}
        style={{
          left: mitte, top: oben + hoehe + GRIFF_LUFT, maxWidth: Math.max(0, flaeche.breite - 16),
          transform: `translateX(clamp(${8 - mitte}px, -50%, calc(${flaeche.breite - mitte - 8}px - 100%)))`,
        }}>
        {seitenstelle ? null : <button type="button" className="kp-griff" data-griff="unter" onClick={onUnterstelle}>+ Unterstelle</button>}
        <button type="button" className="kp-griff" data-griff="einheit" onClick={onEinheit}>+ Einheit</button>
        <button type="button" className="kp-griff" data-griff="bearbeiten" onClick={onBearbeiten}>Bearbeiten</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `GRIFF_RAND` und `platzOben` im Editor**

In `Editor.tsx` den Kommentar über `GRIFF_RAND` und die Konstante ersetzen (gleiche Zeilenzahl anstreben ist nicht nötig — es ist Code, kein Aufräumen):

```ts
/**
 * Luft um eine gezeigte Karte (Phase 3, Entscheidung 18): oben `GRIFF_LUFT` + 32 px Seitengriff + 10;
 * seitlich 8 px + höchstens `SEITENGRIFF_BREITE`, um die ein Seitengriff an einer schmalen Karte nach außen rückt, + 8;
 * unten `GRIFF_LUFT` + zwei Leistenzeilen am Telefon (32 + 12 + 32) + 14. Dieselben Zahlen gibt der
 * Editor der Fläche fürs Einpassen (`platzOben`, `platzSeite`, `platzUnten`): eingepasst liegen die
 * Griffe jeder Karte schon im Bild, `zeige()` verschiebt nichts, die Ansicht bleibt eingepasst
 * (Phase 2, Entscheidung 18).
 */
export const GRIFF_RAND = { oben: 48, seite: 8 + SEITENGRIFF_BREITE + 8, unten: 96 };
```

Import `SEITENGRIFF_BREITE` in die vorhandene Importzeile aus `./Griffe` aufnehmen, und an der `<Flaeche …>` ergänzen: `platzOben={GRIFF_RAND.oben}` (neben `platzSeite`/`platzUnten`).

- [ ] **Step 6: CSS**

In `src/app/m/kommplan/_ui/kommplan.css`:

1. In `:root` ergänzen: `--kp-griff-flaeche: #ffffff; --kp-griff-text: #1f2937; --kp-griff-rand: #6b7280;`
2. In `:root[data-theme="dark"]` ergänzen: `--kp-griff-flaeche: #2a303a; --kp-griff-text: #eef1f5; --kp-griff-rand: #8a94a3;`
3. Die Regeln `.kp-griffe .kp-griff-seite { … }`, `.kp-griffe .kp-griff-links { … }`, `.kp-griffe .kp-griff-rechts { … }`, `.kp-griff-inhalt { … }`, `.kp-griff-inhalt svg { … }` und `.kp-griffleiste { … }` samt dem Kommentar „„+“ und Symbol in einer Zeile …" ersetzen durch:

```css
/*
 * Griffe (Umsetzungsplan Phase 3, Entscheidung 18): eigene Knöpfe statt antd-Button — 32 px sichtbar,
 * damit sie Nachbarkarten nicht verdecken, die Trefferfläche bleibt 44 px (unsichtbares ::before,
 * WCAG 2.5.5, Falle 4). Keine Regel gegen einen .ant-*-Namen (Falle 20). Die Seitengriffe stehen über
 * den oberen Ecken, die Leiste 6 px unter der Karte (Griffe.tsx, GRIFF_LUFT).
 */
.kp-griff {
  position: relative; display: inline-flex; align-items: center; height: 32px; padding: 0 12px;
  font: inherit; font-size: 13px; line-height: 1; white-space: nowrap; cursor: pointer; pointer-events: auto;
  color: var(--kp-griff-text); background: var(--kp-griff-flaeche); border: 1px solid var(--kp-griff-rand);
  border-radius: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, .25);
}
.kp-griff::before { content: ""; position: absolute; inset: -6px 0; }
.kp-griff:hover { border-color: var(--kp-auswahl); }
.kp-griff:focus-visible { outline: 2px solid var(--kp-auswahl); outline-offset: 2px; }
.kp-griffe .kp-griff-seite { position: absolute; bottom: calc(100% + 6px); justify-content: center; padding: 0; }
.kp-griffe .kp-griff-links { left: 0; }
.kp-griffe .kp-griff-rechts { right: 0; }
.kp-griffleiste { position: absolute; display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 6px; width: max-content; }
```

(`.kp-griffe button { pointer-events: auto; }` bleibt stehen.)

- [ ] **Step 7: Tests laufen lassen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/`
Expected: PASS. Schlägt ein Phase-2-Editor-Test an `GRIFF_RAND` fehl (z. B. eine Erwartung an die eingepasste Lage), die Zahl im Test an die neue Konstante binden, nicht die Konstante an den Test.

- [ ] **Step 7a: Im Browser prüfen, dass die Griffe an den äußersten Karten im Bild bleiben — JETZT, nicht erst in Task 10**

In `e2e/kommplan-editor.spec.ts` in `ganzInDerFlaeche` die Oberkante ergänzen (die Seitengriffe stehen jetzt ÜBER der Karte):

```ts
  expect(b.y, `${was}: oben`).toBeGreaterThanOrEqual(rahmen.y);
```

Dann den CI-Zweig des Fototests fahren — er läuft bei 390 × 844, drückt Esc und 0 (eingepasst), klickt die äußerste linke und rechte Karte von OpenR und prüft JEDEN Griff mit `ganzInDerFlaeche`:

```bash
uptime
pnpm exec playwright test e2e/kommplan-editor.spec.ts -g "Bildschirmfotos"; echo "e2e exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
```

Expected: Exit 0. Rot an „Griff links an <id>: links" bzw. „… rechts: rechts" heißt: `GRIFF_RAND.seite` deckt den Überstand nicht — die Rechnung (`8 + SEITENGRIFF_BREITE + 8`) prüfen, nicht die Zusicherung lockern. (Diese Phase stellt das Telefon erst in Task 9 auf die Gliederung um; bis dahin zeigt 390 px noch das Diagramm, der Test läuft also unverändert.)

- [ ] **Step 8: Typecheck, Lint, Ankerschritt, Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm exec eslint src/app/m/kommplan/_ui/
for f in Griffe.tsx Editor.tsx Flaeche.tsx kommplan.css kommplan-css.test.ts Editor.test.tsx Flaeche.test.tsx kommplan-editor.spec.ts; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
pnpm anker:drift src/app/m/kommplan/_ui/kommplan.css
git add src/app/m/kommplan/_ui/editor/Griffe.tsx src/app/m/kommplan/_ui/editor/Editor.tsx src/app/m/kommplan/_ui/betrachter/Flaeche.tsx src/app/m/kommplan/_ui/kommplan.css src/app/m/kommplan/_ui/kommplan-css.test.ts src/app/m/kommplan/_ui/editor/Editor.test.tsx src/app/m/kommplan/_ui/betrachter/Flaeche.test.tsx e2e/kommplan-editor.spec.ts
git commit -S -m "fix(kommplan): Griffe kompakt und nah an der Karte, Seitengriffe beschriftet

Die Griffe deckten Nachbarkarten ab, die seitlichen „+“ waren ohne
Beschriftung unverständlich. Jetzt 32 px sichtbar bei 44 px Trefferfläche,
die Leiste direkt unter der Karte, „+ links“ und „+ rechts“ über den Ecken.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Zeichensymbole einmal auf Editor-Ebene

**Files:**
- Modify: `src/app/m/kommplan/_ui/betrachter/Flaeche.tsx` (Prop `defs`)
- Modify: `src/app/m/kommplan/_ui/editor/Editor.tsx`
- Test: `src/app/m/kommplan/_ui/betrachter/Flaeche.test.tsx`, `src/app/m/kommplan/_ui/editor/Editor.test.tsx`

**Interfaces:**
- Consumes: `SymbolDefs` (`_ui/zeichnung/Symbole`).
- Produces: `Flaeche`-Prop `defs?: boolean` (Vorgabe `true`: der Betrachter bleibt, wie er ist); im Editor ein `<svg class="kp-symbolvorrat">` als direktes Kind von `.kp-editor`.

- [ ] **Step 1: Die fehlenden Tests schreiben**

`Flaeche.test.tsx` anhängen:

```ts
  it("defs={false}: die Fläche bringt keinen eigenen Symbolvorrat mit (der Editor hält ihn, Phase 3, Entscheidung 17)", async () => {
    await zeige({ defs: false });
    expect(exists("symbol")).toBe(false);
    await unmount();
    await zeige();
    expect(exists("symbol")).toBe(true);
  });
```

`Editor.test.tsx` anhängen:

```ts
  it("Symbolvorrat genau einmal im Dokument, direkt unter dem Editor — nie in einer Ansicht (Phase 3, Entscheidung 17)", async () => {
    await zeige();
    const ids = [...document.querySelectorAll("symbol")].map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(query(".kp-symbolvorrat").parentElement!.classList.contains("kp-editor")).toBe(true);
  });
```

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `pnpm vitest run src/app/m/kommplan/_ui/betrachter/Flaeche.test.tsx src/app/m/kommplan/_ui/editor/Editor.test.tsx`
Expected: FAIL (`defs` unbekannt; `.kp-symbolvorrat` fehlt).

- [ ] **Step 3: Implementieren**

`Flaeche.tsx`: Prop `defs = true` (Typ `defs?: boolean`) und den Vorrat nur dann rendern:

```tsx
      {defs ? (
        <svg aria-hidden="true" width={0} height={0} style={{ position: "absolute" }}>
          <SymbolDefs symbole={symbole} />
        </svg>
      ) : null}
```

`Editor.tsx`: `import { SymbolDefs, type Symbolsatz } from "../zeichnung/Symbole";` (vorhandene Typ-Importzeile zusammenführen), als erstes Kind von `<div ref={wurzel} className="kp-editor" …>`:

```tsx
      {/* Der Symbolvorrat EINMAL für Zeichnung, Flyin und Gliederung, außerhalb jeder Ansicht (Phase 3,
          Entscheidung 17): eine verborgene Ansicht verbärge sonst die Vorschauen, zwei Vorräte gäben doppelte IDs (M11). */}
      <svg className="kp-symbolvorrat" aria-hidden="true" focusable="false" width={0} height={0} style={{ position: "absolute" }}>
        <SymbolDefs symbole={symbole} />
      </svg>
```

und an `<Flaeche …>` `defs={false}` ergänzen.

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/`
Expected: PASS.

- [ ] **Step 5: Typecheck, Lint, Ankerschritt, Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm exec eslint src/app/m/kommplan/_ui/betrachter/Flaeche.tsx src/app/m/kommplan/_ui/editor/Editor.tsx
git grep -n "Flaeche.tsx:[0-9]\|Editor.tsx:[0-9]" -- src scripts e2e docs
git add src/app/m/kommplan/_ui/betrachter/Flaeche.tsx src/app/m/kommplan/_ui/betrachter/Flaeche.test.tsx src/app/m/kommplan/_ui/editor/Editor.tsx src/app/m/kommplan/_ui/editor/Editor.test.tsx
git commit -S -m "refactor(kommplan): Zeichensymbole einmal auf Editor-Ebene

Vorbereitung der Gliederung: Vorschauen im Flyin und in der Gliederung
hängen nicht mehr am Vorrat der Zeichenfläche.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Gliederung, Teil 1 — Zeilen, Titel, Tastatur, Aktionen-Menü

**Files:**
- Create: `src/app/m/kommplan/_ui/gliederung/Gliederung.tsx`
- Create: `src/app/m/kommplan/_ui/gliederung/GliederungZeile.tsx`
- Modify: `src/app/m/kommplan/_ui/kommplan.css`
- Test: `src/app/m/kommplan/_ui/gliederung/Gliederung.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`gliederungsZeilen`, `nachbarZeile`, `zeilenAktionen`, `fuegeGeschwisterEin`, `rueckeEin`, `rueckeAus`, `verschiebeInReihe`, `loescheLeereZeile`, `GliederungsZeile`), Task 4 (`gliederungsBefehl`), `aendereStelle`, `fuegeWurzelEin` (`_lib/plan/operationen`), `Aendere` (`_ui/editor/aendere`), `neueId` (`_ui/editor/ids`), `globalerBefehl` (`_ui/editor/tasten`).
- Produces:
  - `export interface GliederungGriff { fokus(id: string | null): void; zeige(id: string): void }`
  - `export const GLIEDERUNG_BEDIENZEILE: string`
  - `export interface GliederungProps { inhalt: PlanInhalt; auswahl: string | null; aendere: Aendere; meldung: ReactNode; griff?: Ref<GliederungGriff>; onAuswahl(id: string): void; onDetails(id: string): void; onLoeschen(id: string): void; onRueck(): void; onWieder(): void; onHinweis(text: string): void; verwirfUnberuehrt(nach: PlanInhalt): boolean; symbole: Symbolsatz; zeichenIndex: readonly ZeichenIndexEintrag[]; ladeSymbole(schluessel: string[]): void }` — die drei letzten nutzt erst Task 8, sie sind aber schon Teil des Vertrags.
  - `export function Gliederung(p: GliederungProps)`
  - `export type ZeilenAktion = "details" | "einruecken" | "ausruecken" | "hoch" | "runter" | "loeschen"`; `export function GliederungZeile(…)` (siehe Code).
  - DOM-Vertrag für Tests und e2e: `.kp-gliederung[data-gliederung]`, `ul[aria-label="Gliederung"]`, `li[data-zeile=<id>]` mit `style="--ebene: n"` und `aria-current="true"` an der gewählten Zeile, `input[name="titel"]`, Knopf `Aktionen für <Titel>`, `[data-seite="links|rechts"]`, `[data-meldung]` im Meldungsplatz.

- [ ] **Step 1: Die fehlenden Tests schreiben**

`src/app/m/kommplan/_ui/gliederung/Gliederung.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useEffect, useState } from "react";
import { clickElement, clickPortal, existsPortal, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { baue } from "../../_lib/beispiele/bau";
import { MELDUNG } from "../../_lib/plan/gliederung";
import { leererPlan, PlanFehler } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import type { Aendere } from "../editor/aendere";
import { kannWiederholen, neuerVerlauf, rueckgaengig, tue, verwirf, wiederholen, type Verlauf } from "../editor/verlauf";
import { Gliederung } from "./Gliederung";

const START = baue({
  verbindungen: [{ id: "a", art: "tmo", bezeichnung: "R_UE_2" }],
  stellen: [
    { id: "el", titel: "EL" },
    { id: "kat", titel: "KatSL", eltern: "el", lage: "links" },
    { id: "ea1", titel: "EA 1", eltern: "el", verbindung: "a" },
    { id: "ea2", titel: "EA 2", eltern: "el", verbindung: "a" },
  ],
});
let stand: Verlauf = neuerVerlauf(START);
const details = vi.fn();
const loeschen = vi.fn();

/** Prüfstand wie der Editor: ein Verlauf, `aendere` mit PlanFehler → Hinweis im Meldungsplatz. */
function Pruefstand({ start, index = [] }: { start: PlanInhalt; index?: readonly ZeichenIndexEintrag[] }) {
  const [v, setV] = useState(() => neuerVerlauf(start));
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  useEffect(() => { stand = v; });
  const aendere: Aendere = (op, schluessel) => {
    try { setV(tue(v, op(v.jetzt), new Date().getTime(), schluessel)); setHinweis(null); return null; }
    catch (e) { if (e instanceof PlanFehler) { setHinweis(e.message); return e.message; } throw e; }
  };
  return (
    <Gliederung inhalt={v.jetzt} auswahl={auswahl} aendere={aendere} meldung={hinweis ? <p>{hinweis}</p> : null}
      onAuswahl={setAuswahl} onDetails={details} onLoeschen={loeschen} onHinweis={setHinweis}
      onRueck={() => setV(rueckgaengig(v))} onWieder={() => setV(wiederholen(v))}
      verwirfUnberuehrt={(nach) => { if (v.jetzt !== nach) return false; setV(verwirf(v)); return true; }}
      symbole={{}} zeichenIndex={index} ladeSymbole={() => {}} />
  );
}
const zeige = async (start: PlanInhalt = START) => { await mount(<Pruefstand start={start} />); await act(async () => {}); };
const feld = (id: string) => query<HTMLInputElement>(`[data-zeile="${id}"] input[name="titel"]`);
const titel = () => queryAll<HTMLInputElement>('[data-zeile] input[name="titel"]').map((i) => i.value);
const ebenen = () => queryAll("[data-zeile]").map((z) => z.style.getPropertyValue("--ebene"));
const aktiv = () => (document.activeElement as HTMLInputElement | null);
async function taste(el: Element, key: string, mehr: KeyboardEventInit = {}) {
  await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mehr })); });
}
async function fokus(id: string) { await act(async () => { feld(id).focus(); }); }
async function schreibe(el: HTMLInputElement, wert: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(el, wert); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
const meldung = () => query("[data-meldung]").textContent;

afterEach(async () => { await unmount(); vi.clearAllMocks(); });

describe("Gliederung (Spec §6.5)", () => {
  it("Zeilen in Anzeigereihenfolge, eingerückt; Seitenstellen erkennbar; Fokus wählt die Zeile", async () => {
    await zeige();
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2"]);
    expect(ebenen()).toEqual(["0", "1", "1", "1"]);
    expect(query('[data-zeile="kat"] [data-seite="links"]').textContent).toBe("Seitenstelle links");
    expect(feld("kat").getAttribute("aria-label")).toBe("Titel, Ebene 2, Seitenstelle links von EL");
    await fokus("ea1");
    expect(query('[data-zeile="ea1"]').getAttribute("aria-current")).toBe("true");
  });
  it("Tippen ändert den Titel — ein Rückgängig-Schritt je Feld und Bündel", async () => {
    await zeige();
    await fokus("ea1");
    await schreibe(feld("ea1"), "EA 1 Nord");
    await schreibe(feld("ea1"), "EA 1 Nordost");
    expect(stand.jetzt.stellen.find((s) => s.id === "ea1")!.titel).toBe("EA 1 Nordost");
    expect(stand.vergangen).toHaveLength(1);
  });
  it("Enter: neue Stelle direkt darunter, gleiche Verbindung, Fokus im neuen Titel; Enter auf leerem Titel tut nichts", async () => {
    await zeige();
    await fokus("ea1");
    await taste(feld("ea1"), "Enter");
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "", "EA 2"]);
    const neu = aktiv()!.closest("[data-zeile]")!.getAttribute("data-zeile")!;
    expect(stand.jetzt.stellen.find((s) => s.id === neu)).toMatchObject({ eltern: "el", verbindungId: "a" });
    await taste(aktiv()!, "Enter");
    expect(titel()).toHaveLength(5);
  });
  it("Tab rückt ein, Umschalt+Tab aus; der Fokus bleibt im selben Titel", async () => {
    await zeige();
    await fokus("ea2");
    await taste(feld("ea2"), "Tab");
    expect(ebenen()).toEqual(["0", "1", "1", "2"]);
    expect(aktiv()).toBe(feld("ea2"));
    await taste(feld("ea2"), "Tab", { shiftKey: true });
    expect(ebenen()).toEqual(["0", "1", "1", "1"]);
    expect(aktiv()).toBe(feld("ea2"));
  });
  it("Tab auf der ersten Unterstelle: Hinweis, nichts ändert sich, der Fokus bleibt (Review Focus 3)", async () => {
    await zeige();
    await fokus("ea1");
    const vorher = stand.jetzt;
    await taste(feld("ea1"), "Tab");
    expect(stand.jetzt).toBe(vorher);
    expect(meldung()).toBe(MELDUNG.ersteEinruecken);
    expect(aktiv()).toBe(feld("ea1"));
    await fokus("el");
    await taste(feld("el"), "Tab", { shiftKey: true });
    expect(meldung()).toBe(MELDUNG.wurzelAusruecken);
    expect(aktiv()).toBe(feld("el"));
  });
  it("Alt+↑/↓ verschiebt, der Fokus wandert mit", async () => {
    await zeige();
    await fokus("ea2");
    await taste(feld("ea2"), "ArrowUp", { altKey: true });
    expect(titel()).toEqual(["EL", "KatSL", "EA 2", "EA 1"]);
    expect(aktiv()).toBe(feld("ea2"));
  });
  it("↑/↓ wandern; eine per Enter angelegte, unberührte Zeile verschwindet beim Verlassen ohne Wiederholen-Schritt", async () => {
    await zeige();
    await fokus("ea1");
    await taste(feld("ea1"), "ArrowDown");
    expect(aktiv()).toBe(feld("ea2"));
    await taste(feld("ea2"), "Enter");
    expect(titel()).toHaveLength(5);
    await taste(aktiv()!, "ArrowUp");
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2"]);
    expect(aktiv()).toBe(feld("ea2"));
    expect(kannWiederholen(stand)).toBe(false);
  });
  it("Rücktaste auf leerem Titel löscht die Zeile, der Fokus geht nach oben; mit Unterstellen: Hinweis", async () => {
    await zeige();
    await fokus("ea1");
    await schreibe(feld("ea1"), "");
    await taste(feld("ea1"), "Backspace");
    expect(titel()).toEqual(["EL", "KatSL", "EA 2"]);
    expect(aktiv()).toBe(feld("kat"));
    await fokus("el");
    await schreibe(feld("el"), "");
    await taste(feld("el"), "Backspace");
    expect(meldung()).toBe(MELDUNG.nichtLeer);
  });
  it("Strg/Cmd+Z im Titel ist das Rückgängig des Dokuments (Entscheidung 10)", async () => {
    await zeige();
    await fokus("ea2");
    await taste(feld("ea2"), "Tab");
    await taste(feld("ea2"), "z", { ctrlKey: true });
    expect(ebenen()).toEqual(["0", "1", "1", "1"]);
    await taste(feld("ea2"), "z", { ctrlKey: true, shiftKey: true });
    expect(ebenen()).toEqual(["0", "1", "1", "2"]);
  });
  it("Enter während einer IME-Komposition legt nichts an", async () => {
    await zeige();
    await fokus("ea1");
    await taste(feld("ea1"), "Enter", { isComposing: true } as KeyboardEventInit);
    expect(titel()).toHaveLength(4);
  });
  it("Roving Tabindex: nur die aktive Zeile ist in der Tab-Folge; Esc verlässt das Titelfeld auf „Aktionen“", async () => {
    await zeige();
    expect(queryAll('input[name="titel"]').map((i) => i.tabIndex)).toEqual([0, -1, -1, -1]);
    await fokus("ea1");
    expect(queryAll('input[name="titel"]').map((i) => i.tabIndex)).toEqual([-1, -1, 0, -1]);
    await taste(feld("ea1"), "Escape");
    expect(aktiv()!.getAttribute("aria-label")).toBe("Aktionen für EA 1");
  });
  it("Aktionen-Menü: Einrücken per Tipp (Touch-Weg), unerreichbare Einträge deaktiviert, F2 öffnet Details", async () => {
    await zeige();
    await fokus("ea2");
    await clickElement(query<HTMLElement>('[data-zeile="ea2"] [aria-label="Aktionen für EA 2"]'));
    await clickPortal('[data-menu-id$="einruecken"]');
    expect(ebenen()).toEqual(["0", "1", "1", "2"]);
    await clickElement(query<HTMLElement>('[data-zeile="ea1"] [aria-label="Aktionen für EA 1"]'));
    expect(existsPortal('[data-menu-id$="einruecken"][aria-disabled="true"]')).toBe(true);
    await taste(feld("ea1"), "F2");
    expect(details).toHaveBeenCalledWith("ea1");
  });
  it("leerer Plan: „Erste Stelle anlegen“ legt eine Zeile an und setzt den Fokus hinein", async () => {
    await zeige(leererPlan());
    await clickElement([...document.querySelectorAll<HTMLButtonElement>(".kp-gliederung button")].find((b) => b.textContent === "Erste Stelle anlegen")!);
    expect(titel()).toEqual([""]);
    expect(aktiv()).toBe(queryAll<HTMLInputElement>('input[name="titel"]')[0]);
  });
});
```

Hinweis zur Menü-Greifung: antd rendert Einträge mit `data-menu-id="…-<key>"`; ist das in 6.6.4 anders, auf `li[role="menuitem"]` mit dem Menütext greifen (`[...document.querySelectorAll('li[role="menuitem"]')].find((l) => l.textContent?.startsWith("Einrücken"))`) — nicht den Vertrag ändern.

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `pnpm vitest run src/app/m/kommplan/_ui/gliederung/Gliederung.test.tsx`
Expected: FAIL — `./Gliederung` fehlt.

- [ ] **Step 3: `GliederungZeile.tsx` schreiben**

```tsx
"use client";

import type { ClipboardEvent, CSSProperties, KeyboardEvent, ReactNode, Ref } from "react";
import { Button, Dropdown, Input, type InputRef, type MenuProps } from "antd";
import type { GliederungsZeile } from "../../_lib/plan/gliederung";
import { LAENGE } from "../../_lib/plan/schema";

export type ZeilenAktion = "details" | "einruecken" | "ausruecken" | "hoch" | "runter" | "loeschen";
const titelVon = (s: { titel: string } | null) => (s === null ? "" : s.titel.trim() || "(ohne Titel)");

/**
 * EINE ZEILE DER GLIEDERUNG (Umsetzungsplan Phase 3, Entscheidungen 4, 10, 11, 15): rein darstellend,
 * alles Verhalten kommt vom Aufrufer. `aktiv` steuert den Roving Tabindex; `neben` (Verbindung,
 * Einheiten) blendet CSS am Telefon außer an der gewählten Zeile aus; `vorne` ist der Zeichenknopf,
 * `unten` die aufgeklappten Einheiten (Task 8).
 */
export function GliederungZeile({ zeile, gewaehlt, aktiv, menue, titelRef, aktionenRef, onTitel, onTaste, onEinfuegen, onFokus, onMenue, onAktion, vorne, neben, unten }: {
  zeile: GliederungsZeile; gewaehlt: boolean; aktiv: boolean; menue: MenuProps["items"];
  titelRef: Ref<InputRef>; aktionenRef: Ref<HTMLButtonElement>;
  onTitel(wert: string): void; onTaste(e: KeyboardEvent<HTMLInputElement>): void; onEinfuegen(e: ClipboardEvent<HTMLInputElement>): void;
  onFokus(): void; onMenue(offen: boolean): void; onAktion(a: ZeilenAktion): void;
  vorne?: ReactNode; neben?: ReactNode; unten?: ReactNode;
}) {
  const s = zeile.stelle;
  const lage = zeile.seite ? `Seitenstelle ${zeile.seite} von ${titelVon(zeile.eltern)}` : zeile.eltern ? `unter ${titelVon(zeile.eltern)}` : "oberste Ebene";
  const tab = aktiv ? 0 : -1;
  return (
    <li data-zeile={s.id} className="kp-g-zeile" aria-current={gewaehlt ? "true" : undefined} style={{ "--ebene": zeile.ebene } as CSSProperties}>
      <div className="kp-g-haupt">
        {zeile.seite ? <span className="kp-chip" data-seite={zeile.seite}>{`Seitenstelle ${zeile.seite}`}</span> : null}
        {vorne}
        <Input ref={titelRef} name="titel" className="kp-g-titel" tabIndex={tab} value={s.titel} maxLength={LAENGE.titel}
          placeholder="(ohne Titel)" enterKeyHint="enter" aria-label={`Titel, Ebene ${zeile.ebene + 1}, ${lage}`}
          onFocus={onFokus} onChange={(e) => onTitel(e.target.value)} onKeyDown={onTaste} onPaste={onEinfuegen} />
        {neben ? <div className="kp-g-neben">{neben}</div> : null}
        <Dropdown trigger={["click"]} onOpenChange={onMenue} menu={{ items: menue, onClick: ({ key }) => onAktion(key as ZeilenAktion) }}>
          <Button ref={aktionenRef} tabIndex={tab} aria-label={`Aktionen für ${titelVon(s)}`}>⋯</Button>
        </Dropdown>
      </div>
      {unten}
    </li>
  );
}
```

Falls `enterKeyHint` an antds `Input` einen Typfehler meldet, als `{...{ enterKeyHint: "enter" }}` durchreichen — nicht weglassen (Telefon-Tastatur).

- [ ] **Step 4: `Gliederung.tsx` schreiben**

```tsx
"use client";

import { useEffect, useImperativeHandle, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Button, type MenuProps } from "antd";
import { fuegeGeschwisterEin, gliederungsZeilen, loescheLeereZeile, nachbarZeile, rueckeAus, rueckeEin, verschiebeInReihe, zeilenAktionen, type GliederungsZeile } from "../../_lib/plan/gliederung";
import { aendereStelle, fuegeWurzelEin } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import type { Aendere } from "../editor/aendere";
import { neueId } from "../editor/ids";
import { globalerBefehl } from "../editor/tasten";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { GliederungZeile, type ZeilenAktion } from "./GliederungZeile";
import { gliederungsBefehl } from "./tasten";

export interface GliederungGriff {
  /** Fokus in den Titel dieser Zeile (fehlt sie: in die aktive; leerer Plan: „Erste Stelle anlegen"). */
  fokus(id: string | null): void;
  /** Zeile ins Bild holen, ohne den Fokus zu setzen (am Telefon öffnete Fokus die Tastatur). */
  zeige(id: string): void;
}
export const GLIEDERUNG_BEDIENZEILE = "Enter neue Stelle darunter · Tab / Umschalt+Tab Ebene · Alt+↑/↓ verschieben · ↑/↓ wandern · F2 Details · Esc verlässt das Titelfeld";
const LEER_ZIEL = "~leer";

export interface GliederungProps {
  inhalt: PlanInhalt; auswahl: string | null; aendere: Aendere; meldung: ReactNode; griff?: Ref<GliederungGriff>;
  onAuswahl(id: string): void; onDetails(id: string): void; onLoeschen(id: string): void;
  onRueck(): void; onWieder(): void; onHinweis(text: string): void;
  /** Verwirft den letzten Schritt, wenn `nach` noch der jetzige Stand ist — ein unberührt angelegtes Element (U28). */
  verwirfUnberuehrt(nach: PlanInhalt): boolean;
  symbole: Symbolsatz; zeichenIndex: readonly ZeichenIndexEintrag[]; ladeSymbole(schluessel: string[]): void;
}

function menue(a: ReturnType<typeof zeilenAktionen>): MenuProps["items"] {
  return [
    { key: "details", label: "Details … (F2)" },
    { key: "einruecken", label: "Einrücken (Tab)", disabled: !a.einruecken },
    { key: "ausruecken", label: "Ausrücken (Umschalt+Tab)", disabled: !a.ausruecken },
    { key: "hoch", label: "Nach oben (Alt+↑)", disabled: !a.hoch },
    { key: "runter", label: "Nach unten (Alt+↓)", disabled: !a.runter },
    { type: "divider" },
    { key: "loeschen", label: "Stelle löschen", danger: true },
  ];
}

/**
 * DIE GLIEDERUNG (Spec §6.5; Umsetzungsplan Phase 3, Entscheidungen 4–16). Dieselben Daten, derselbe
 * Verlauf und derselbe Speicherer wie das Diagramm: jede Änderung ist eine reine Operation über
 * `aendere`. Der Fokus folgt einer Anfrage (`fokus`), die ein Effekt NACH dem Rendern erfüllt — die
 * Zeile kann dabei im DOM umgezogen sein. Kein setState im Effekt-Rumpf.
 */
export function Gliederung(p: GliederungProps) {
  const { inhalt, auswahl, aendere } = p;
  const zeilen = gliederungsZeilen(inhalt);
  const felder = useRef(new Map<string, HTMLInputElement>());
  const aktionen = useRef(new Map<string, HTMLButtonElement>());
  const erste = useRef<HTMLButtonElement>(null);
  const neu = useRef<{ id: string; nach: PlanInhalt } | null>(null);
  const [fokus, setFokus] = useState<{ id: string; n: number; stelle: number | "ende" } | null>(null);
  const [menueOffen, setMenueOffen] = useState<string | null>(null);
  const aktiv = zeilen.some((z) => z.stelle.id === auswahl) ? auswahl : zeilen[0]?.stelle.id ?? null;

  useEffect(() => {
    if (!fokus) return;
    if (fokus.id === LEER_ZIEL) { erste.current?.focus(); return; }
    const el = felder.current.get(fokus.id) ?? felder.current.values().next().value;
    if (!el) { erste.current?.focus(); return; }
    el.focus();
    const pos = fokus.stelle === "ende" ? el.value.length : Math.min(fokus.stelle, el.value.length);
    el.setSelectionRange(pos, pos);
  }, [fokus]);

  const fokussiere = (id: string, stelle: number | "ende" = "ende") => setFokus((f) => ({ id, n: (f?.n ?? 0) + 1, stelle }));
  useImperativeHandle(p.griff, () => ({
    fokus: (id) => fokussiere(id ?? aktiv ?? LEER_ZIEL),
    zeige: (id) => felder.current.get(id)?.closest("li")?.scrollIntoView?.({ block: "nearest" }),
  }));

  function tueMit(op: (q: PlanInhalt) => PlanInhalt): PlanInhalt | null {
    let nach: PlanInhalt | null = null;
    return aendere((q) => (nach = op(q))) === null ? nach : null;
  }
  /** Ein per Enter angelegtes, unberührtes Element verschwindet beim Verlassen (Entscheidung 8). */
  function raeumeAuf(id: string): boolean {
    const n = neu.current;
    neu.current = null;
    return n !== null && n.id === id && p.verwirfUnberuehrt(n.nach);
  }
  function ersteStelle() {
    const id = neueId(inhalt, "s");
    if (tueMit((q) => fuegeWurzelEin(q, id))) fokussiere(id);
  }
  function aktion(z: GliederungsZeile, a: ZeilenAktion) {
    const id = z.stelle.id;
    setMenueOffen(null);
    if (a === "details") { p.onDetails(id); return; }
    if (a === "loeschen") { p.onLoeschen(id); return; }
    if (a === "einruecken") tueMit((q) => rueckeEin(q, id));
    else if (a === "ausruecken") tueMit((q) => rueckeAus(q, id));
    else tueMit((q) => verschiebeInReihe(q, id, a === "hoch" ? "hoch" : "runter"));
    fokussiere(id);
  }
  function taste(e: KeyboardEvent<HTMLInputElement>, z: GliederungsZeile) {
    const id = z.stelle.id;
    const g = globalerBefehl(e, false);
    if (g) {
      e.preventDefault();
      neu.current = null;
      if (g.art === "rueckgaengig") p.onRueck(); else p.onWieder();
      return;
    }
    const b = gliederungsBefehl({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, isComposing: e.nativeEvent.isComposing }, e.currentTarget.value.trim() === "");
    if (!b) return;
    e.preventDefault(); // auch Tab ohne Wirkung: der Fokus verlässt das Feld nie (Review Focus 3)
    const caret = e.currentTarget.selectionStart ?? "ende";
    switch (b.art) {
      case "neu": {
        if (z.stelle.titel.trim() === "") return;
        const neuId = neueId(inhalt, "s");
        const nach = tueMit((q) => fuegeGeschwisterEin(q, id, neuId));
        if (nach) { neu.current = { id: neuId, nach }; fokussiere(neuId); }
        return;
      }
      case "einruecken": tueMit((q) => rueckeEin(q, id)); fokussiere(id, caret); return;
      case "ausruecken": tueMit((q) => rueckeAus(q, id)); fokussiere(id, caret); return;
      case "verschiebe": tueMit((q) => verschiebeInReihe(q, id, b.richtung)); fokussiere(id, caret); return;
      case "wandere": {
        const ziel = nachbarZeile(zeilen, id, b.richtung);
        if (ziel === null) return;
        raeumeAuf(id);
        fokussiere(ziel);
        return;
      }
      case "loeschen": {
        const ziel = nachbarZeile(zeilen, id, b.richtung) ?? nachbarZeile(zeilen, id, b.richtung === "hoch" ? "runter" : "hoch");
        const weg = raeumeAuf(id) || tueMit((q) => loescheLeereZeile(q, id)) !== null;
        if (weg) fokussiere(ziel ?? LEER_ZIEL);
        return;
      }
      case "verlassen": {
        if (raeumeAuf(id)) { fokussiere(nachbarZeile(zeilen, id, "hoch") ?? nachbarZeile(zeilen, id, "runter") ?? LEER_ZIEL); return; }
        aktionen.current.get(id)?.focus();
        return;
      }
      case "details": p.onDetails(id); return;
    }
  }
  // Mehrzeiliges Einfügen folgt in Task 8; bis dahin fügt das Feld normal ein.
  const einfuegen = (_e: ClipboardEvent<HTMLInputElement>, _id: string) => {};

  return (
    <div className="kp-gliederung" data-gliederung="">
      {zeilen.length === 0 ? (
        <div className="kp-leer"><p>Dieser Plan hat noch keine Stellen.</p><Button ref={erste} type="primary" onClick={ersteStelle}>Erste Stelle anlegen</Button></div>
      ) : (
        <ul className="kp-g-liste" aria-label="Gliederung">
          {zeilen.map((z) => {
            const id = z.stelle.id;
            return (
              <GliederungZeile key={id} zeile={z} gewaehlt={id === auswahl} aktiv={id === aktiv}
                menue={menueOffen === id ? menue(zeilenAktionen(inhalt, id)) : []}
                titelRef={(r) => { const el = r?.input; if (el) felder.current.set(id, el); return () => { felder.current.delete(id); }; }}
                aktionenRef={(el) => { if (el) aktionen.current.set(id, el); return () => { aktionen.current.delete(id); }; }}
                onTitel={(wert) => aendere((q) => aendereStelle(q, id, { titel: wert }), `titel:${id}`)}
                onTaste={(e) => taste(e, z)} onEinfuegen={(e) => einfuegen(e, id)}
                onFokus={() => { if (auswahl !== id) p.onAuswahl(id); }}
                onMenue={(offen) => setMenueOffen(offen ? id : null)} onAktion={(a) => aktion(z, a)} />
            );
          })}
        </ul>
      )}
      <p className="kp-hilfe kp-bedienhinweis">{GLIEDERUNG_BEDIENZEILE}</p>
      {p.meldung ? <div className="kp-g-meldung" data-meldung="">{p.meldung}</div> : null}
    </div>
  );
}
```

Hinweise für den Implementierer:
- `einfuegen` mit den unbenutzten Parametern meldet `pnpm lint` womöglich (`no-unused-vars`); dann `onEinfuegen` in diesem Task gar nicht setzen und die Prop in `GliederungZeile` optional machen (`onEinfuegen?`) — Task 8 setzt sie.
- Menüeinträge werden nur für die Zeile mit offenem Menü berechnet (`menueOffen`), nicht für alle Zeilen je Render.
- Rückgaben aus Ref-Callbacks (Aufräumfunktion) sind React 19; der Rückgabetyp muss `void | (() => void)` sein.

- [ ] **Step 5: CSS der Gliederung**

In `_ui/kommplan.css` ergänzen:

1. `:root`: `--kp-auswahl-flaeche: #e8f0fc;` — `:root[data-theme="dark"]`: `--kp-auswahl-flaeche: #1c2a40;`
2. Neue Regeln (außerhalb der Media-Blöcke):

```css
/*
 * Gliederung (Spec §6.5; Umsetzungsplan Phase 3, Entscheidungen 4, 15, 16): eine Zeile je Stelle,
 * eingerückt über --ebene (24 px, am Telefon 16 px bis Ebene 6). Die gewählte Zeile trägt Fläche UND
 * Randstrich (nie nur Farbe). Der Meldungsplatz klebt unten im Bild — die Liste kann länger sein als
 * der Schirm, der Hinweis muss trotzdem zu sehen sein.
 */
.kp-g-liste { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.kp-g-zeile { padding-inline-start: calc(var(--ebene) * 24px); border-radius: 8px; }
.kp-g-zeile[aria-current="true"] { background: var(--kp-auswahl-flaeche); box-shadow: inset 3px 0 0 var(--kp-auswahl); }
.kp-g-haupt { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 4px 8px; }
.kp-g-haupt .kp-g-titel { flex: 1 1 12rem; min-width: 0; }
.kp-g-neben { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; flex: 0 1 auto; }
.kp-g-meldung { position: sticky; bottom: 12px; margin-top: 8px; z-index: 1; }
```

3. In den **vorhandenen** Block `@media (max-width: 767.98px) { … }` ergänzen:

```css
  .kp-g-zeile { padding-inline-start: calc(min(var(--ebene), 6) * 16px); }
  .kp-g-zeile:not([aria-current="true"]) .kp-g-neben { display: none; }
```

- [ ] **Step 6: CSS-Test ergänzen**

`kommplan-css.test.ts` anhängen:

```ts
  it("Gliederung: am Telefon Verbindung und Einheiten nur an der gewählten Zeile, Einrückung gedeckelt (Entscheidung 15)", () => {
    const zweig = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(zweig).toMatch(/\.kp-g-zeile:not\(\[aria-current="true"\]\) \.kp-g-neben \{ display: none; \}/);
    expect(zweig).toMatch(/\.kp-g-zeile \{ padding-inline-start: calc\(min\(var\(--ebene\), 6\) \* 16px\); \}/);
    expect(css).toMatch(/\.kp-g-meldung \{[^}]*position: sticky/);
  });
```

- [ ] **Step 7: Tests laufen lassen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/`
Expected: PASS.

- [ ] **Step 8: Typecheck, Lint, Ankerschritt, Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm exec eslint src/app/m/kommplan/_ui/gliederung/ src/app/m/kommplan/_ui/kommplan-css.test.ts
git grep -n "kommplan.css:[0-9]" -- src scripts e2e docs
pnpm anker:drift src/app/m/kommplan/_ui/kommplan.css
git add src/app/m/kommplan/_ui/gliederung/ src/app/m/kommplan/_ui/kommplan.css src/app/m/kommplan/_ui/kommplan-css.test.ts
git commit -S -m "feat(kommplan): Gliederung mit Tastatur und Aktionen-Menü (noch nicht eingebunden)

Enter legt die nächste Stelle an, Tab und Umschalt+Tab ändern die Ebene,
Alt+Pfeil verschiebt, Pfeile wandern; das Menü „⋯“ ist der Weg ohne
Tastatur. Der Editor bindet die Ansicht in einem späteren Schritt ein.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Gliederung, Teil 2 — Verbindung, Zeichen, Einheiten, mehrzeiliges Einfügen

**Files:**
- Create: `src/app/m/kommplan/_ui/gliederung/VerbindungFeld.tsx`
- Create: `src/app/m/kommplan/_ui/gliederung/ZeichenKnopf.tsx`
- Modify: `src/app/m/kommplan/_ui/gliederung/Gliederung.tsx`
- Modify: `src/app/m/kommplan/_ui/kommplan.css`
- Test: `src/app/m/kommplan/_ui/gliederung/Gliederung.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`leseGliederung`), Task 3 (`fuegeGliederungEin`), Task 4 (`verbindungsOptionen`, `leseNeu`, `KEINE`), `aendereStelle`, `findeVerbindung`, `legeVerbindungAn`, `neueId`, `neueIds`, `ZeichenWahl` (`_ui/editor/ZeichenWahl`), `EinheitenListe` (`_ui/editor/EinheitenListe`), `leseZuletzt` (`_ui/editor/zuletzt`), `symbolId` (`_ui/zeichnung/Symbole`).
- Produces: `export function VerbindungFeld({ inhalt, stelle, aendere, tabIndex }: { inhalt: PlanInhalt; stelle: Stelle; aendere: Aendere; tabIndex: number })`; `export function ZeichenKnopf({ stelle, index, symbole, ladeSymbole, planZeichen, aendere, tabIndex, onFertig }: {…})`; DOM-Vertrag: Select mit `aria-label` „Verbindung von <Titel>", Knopf „Zeichen von <Titel>: …", Einheiten-Knopf mit `aria-expanded` und Text „n Einheiten".

- [ ] **Step 1: Die fehlenden Tests schreiben**

An `Gliederung.test.tsx` anhängen und die Importe in die vorhandenen Zeilen zusammenführen: `queryPortal` (test-dom), `zuVieleStellen` (`../../_lib/plan/gliederung`), `GRENZE, LAENGE` als Wert-Import aus `../../_lib/plan/schema` (die Typzeile `PlanInhalt` bleibt):

```tsx
async function fuegeEin(el: HTMLInputElement, text: string): Promise<boolean> {
  const e = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "clipboardData", { value: { getData: (t: string) => (t === "text/plain" ? text : "") } });
  await act(async () => { el.dispatchEvent(e); });
  return e.defaultPrevented;
}

describe("Gliederung, Teil 2", () => {
  it("mehrzeilig einfügen: Teilbaum nach der Cursorzeile, EIN Rückgängig-Schritt, Fokus am Ende der letzten Zeile", async () => {
    await zeige();
    await fokus("ea1");
    const schritte = stand.vergangen.length;
    expect(await fuegeEin(feld("ea1"), "EA Nord\n\t- RTW 1\n\t- RTW 2\nEA Süd")).toBe(true);
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA Nord", "RTW 1", "RTW 2", "EA Süd", "EA 2"]);
    expect(ebenen()).toEqual(["0", "1", "1", "1", "2", "2", "1", "1"]);
    expect(stand.vergangen.length).toBe(schritte + 1);
    expect(aktiv()!.value).toBe("EA Süd");
    await taste(aktiv()!, "z", { ctrlKey: true });
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2"]);
  });
  it("in eine leere, eben angelegte Zeile: die erste eingefügte Zeile nimmt ihren Platz ein", async () => {
    await zeige();
    await fokus("ea2");
    await taste(feld("ea2"), "Enter");
    await fuegeEin(aktiv()!, "EA 3\n\tRTW");
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2", "EA 3", "RTW"]);
  });
  it("eine Zeile: das Feld fügt normal ein (kein Abfangen)", async () => {
    await zeige();
    await fokus("ea1");
    expect(await fuegeEin(feld("ea1"), "nur eine Zeile\n")).toBe(false);
  });
  it("fehlerhafte Liste, Seitenstelle, zu viele Stellen: Hinweis, nichts eingefügt (Review Focus 4)", async () => {
    await zeige();
    await fokus("ea1");
    await fuegeEin(feld("ea1"), `A\n\t${"x".repeat(LAENGE.titel + 1)}`);
    expect(meldung()).toContain("Zeile 2: Der Titel ist länger als");
    expect(titel()).toHaveLength(4);
    await fokus("kat");
    await fuegeEin(feld("kat"), "A\nB");
    expect(meldung()).toBe(MELDUNG.inSeitenstelle);
    await fokus("ea1");
    await fuegeEin(feld("ea1"), Array.from({ length: GRENZE.stellen }, (_, i) => `S${i}`).join("\n"));
    expect(meldung()).toBe(zuVieleStellen(START.stellen.length + GRENZE.stellen));
    expect(titel()).toHaveLength(4);
  });
  it("Verbindung inline: vorhandene wählen; neu tippen legt mit sichtbarer Art an; Wurzel ohne Feld", async () => {
    await zeige();
    await fokus("ea1");
    expect(query('[data-zeile="el"]').textContent).toContain("oberste Ebene");
    // Muster aus StelleFlyin.test.tsx (`oeffneAuswahl`): antds Select öffnet auf `mousedown`, die Liste liegt im Portal.
    const eingabe = query<HTMLInputElement>('[data-zeile="ea1"] [aria-label="Verbindung von EA 1"]');
    await act(async () => { eingabe.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    await schreibe(eingabe, "R_UE_3");
    const liste = [...document.querySelectorAll<HTMLElement>(".ant-select-dropdown")].filter((d) => !d.className.includes("-hidden")).at(-1)!;
    const texte = [...liste.querySelectorAll<HTMLElement>(".ant-select-item-option")].map((o) => o.textContent);
    expect(texte[0]).toBe("Neu: „R_UE_3“ als Digitalfunk TMO");
    expect(texte).toHaveLength(8); // je Art eine Option — die Art steht sichtbar da
    await clickElement([...liste.querySelectorAll<HTMLElement>(".ant-select-item-option")][0]);
    const v = stand.jetzt.verbindungen.find((x) => x.bezeichnung === "R_UE_3")!;
    expect(v.art).toBe("tmo");
    expect(stand.jetzt.stellen.find((s) => s.id === "ea1")!.verbindungId).toBe(v.id);
  });
  it("Einheiten als Zähler: klappt dieselbe Einheitenliste wie im Flyin auf", async () => {
    await zeige(baue({ stellen: [{ id: "el", titel: "EL", einheiten: ["RTW 1", "KTW 2"] }] }));
    const knopf = [...document.querySelectorAll<HTMLButtonElement>('[data-zeile="el"] button')].find((b) => b.textContent === "2 Einheiten")!;
    expect(knopf.getAttribute("aria-expanded")).toBe("false");
    await clickElement(knopf);
    expect(knopf.getAttribute("aria-expanded")).toBe("true");
    expect(queryAll('[data-zeile="el"] [data-einheit-zeile]')).toHaveLength(2);
  });
  it("Zeichen kompakt: Knopf öffnet die Zeichenwahl, eine Wahl setzt das Zeichen und gibt den Fokus an den Titel", async () => {
    const index = [{ schluessel: "k1", titel: "Einsatzleitung", suchtext: "einsatzleitung el" }];
    await mount(<PruefstandMitIndex index={index} />);
    await act(async () => {});
    await fokus("ea1");
    await clickElement(query('[data-zeile="ea1"] [aria-label^="Zeichen von EA 1"]'));
    await schreibe(queryPortal<HTMLInputElement>('input[aria-label="Zeichen suchen"]'), "Einsatz");
    await clickPortal('[data-zeichen="k1"]');
    expect(stand.jetzt.stellen.find((s) => s.id === "ea1")!.zeichen).toBe("k1");
    expect(aktiv()).toBe(feld("ea1"));
  });
});
```

Der Prüfstand braucht für den Zeichentest einen Zeichenindex: in Task 7 bekommt `Pruefstand` dafür gleich die Signatur `function Pruefstand({ start, index = [] }: { start: PlanInhalt; index?: readonly ZeichenIndexEintrag[] })` und reicht `zeichenIndex={index}` durch (Typ aus `../../_lib/zeichen/grundlagen`: `{ schluessel; titel; suchtext }`). Hier: `const PruefstandMitIndex = ({ index }: { index: readonly ZeichenIndexEintrag[] }) => <Pruefstand start={START} index={index} />;`.

Zur Select-Bedienung in jsdom: `aria-label` landet bei antds `Select` am Sucheingabefeld; dort öffnet `mousedown` die Liste, und Tippen in dasselbe Feld löst `onSearch` aus — wie in `StelleFlyin.test.tsx` (`oeffneAuswahl`, `waehleOption`). Greift das in 6.6.4 anders, dem dortigen Muster folgen; die Aussage des Tests bleibt.

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `pnpm vitest run src/app/m/kommplan/_ui/gliederung/Gliederung.test.tsx`
Expected: FAIL in den neuen Fällen.

- [ ] **Step 3: `VerbindungFeld.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Select } from "antd";
import { aendereStelle } from "../../_lib/plan/operationen";
import type { PlanInhalt, Stelle } from "../../_lib/plan/schema";
import { findeVerbindung, legeVerbindungAn } from "../../_lib/plan/verbindungen";
import type { Aendere } from "../editor/aendere";
import { neueId } from "../editor/ids";
import { KEINE, leseNeu, verbindungsOptionen } from "./verbindungsOptionen";

/** Verbindung zur Elternstelle, inline (Umsetzungsplan Phase 3, Entscheidung 12). Wurzeln haben keine. */
export function VerbindungFeld({ inhalt, stelle, aendere, tabIndex }: { inhalt: PlanInhalt; stelle: Stelle; aendere: Aendere; tabIndex: number }) {
  const [suche, setSuche] = useState("");
  if (stelle.eltern === null) return <span className="kp-hilfe">oberste Ebene</span>;
  const name = stelle.titel.trim() || "(ohne Titel)";
  const waehle = (wert: string) => {
    const art = leseNeu(wert);
    const bezeichnung = suche.trim();
    const id = neueId(inhalt, "v");
    aendere((q) => {
      if (art === null) return aendereStelle(q, stelle.id, { verbindungId: wert === KEINE ? null : wert });
      const vorhanden = findeVerbindung(q, bezeichnung, art);
      const mit = vorhanden ? q : legeVerbindungAn(q, { id, art, bezeichnung });
      return aendereStelle(mit, stelle.id, { verbindungId: vorhanden?.id ?? id });
    });
    setSuche("");
  };
  return (
    <Select className="kp-g-verbindung" aria-label={`Verbindung von ${name}`} tabIndex={tabIndex}
      value={stelle.verbindungId ?? KEINE} onChange={waehle} popupMatchSelectWidth={false}
      showSearch={{ searchValue: suche, onSearch: setSuche, filterOption: false }}
      options={verbindungsOptionen(inhalt, suche)} />
  );
}
```

- [ ] **Step 4: `ZeichenKnopf.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Popover } from "antd";
import { aendereStelle } from "../../_lib/plan/operationen";
import type { Stelle } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import type { Aendere } from "../editor/aendere";
import { ZeichenWahl } from "../editor/ZeichenWahl";
import { leseZuletzt } from "../editor/zuletzt";
import { symbolId, type Symbolsatz } from "../zeichnung/Symbole";

/**
 * ZEICHEN KOMPAKT (Umsetzungsplan Phase 3, Entscheidung 13): 44 px, das Zeichen per `<use>` aus dem
 * Symbolvorrat des Editors (Entscheidung 17); das Popover trägt dieselbe `ZeichenWahl` wie das Flyin.
 */
export function ZeichenKnopf({ stelle, index, symbole, ladeSymbole, planZeichen, aendere, tabIndex, onFertig }: {
  stelle: Stelle; index: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole(schluessel: string[]): void;
  planZeichen: readonly string[]; aendere: Aendere; tabIndex: number; onFertig(): void;
}) {
  const [offen, setOffen] = useState(false);
  const name = stelle.titel.trim() || "(ohne Titel)";
  const zeichen = stelle.zeichen === null ? "keins" : index.find((e) => e.schluessel === stelle.zeichen)?.titel ?? stelle.zeichen;
  return (
    <Popover open={offen} trigger="click" placement="bottomLeft" destroyOnHidden
      onOpenChange={(o) => { setOffen(o); if (o) ladeSymbole(leseZuletzt()); }}
      content={<div className="kp-g-zeichenwahl">
        <ZeichenWahl wert={stelle.zeichen} index={index} symbole={symbole} ladeSymbole={ladeSymbole} planZeichen={planZeichen}
          onWahl={(k) => { aendere((q) => aendereStelle(q, stelle.id, { zeichen: k })); setOffen(false); onFertig(); }} />
      </div>}>
      <button type="button" className="kp-g-zeichen" tabIndex={tabIndex} aria-expanded={offen} aria-label={`Zeichen von ${name}: ${zeichen} — ändern`}>
        {stelle.zeichen !== null && symbole[stelle.zeichen]
          ? <svg viewBox="0 0 10 10" width={32} height={32} aria-hidden="true"><use href={`#${symbolId(stelle.zeichen)}`} width={10} height={10} /></svg>
          : <span className="kp-g-zeichen-leer" aria-hidden="true" />}
      </button>
    </Popover>
  );
}
```

- [ ] **Step 5: `Gliederung.tsx` ergänzen**

1. Importe: `leseGliederung` (`../../_lib/plan/einfuegen`), `fuegeGliederungEin` (in die Zeile aus `../../_lib/plan/gliederung`), `neueIds` (in die Zeile aus `../editor/ids`), `EinheitenListe` (`../editor/EinheitenListe`), `VerbindungFeld`, `ZeichenKnopf`.
2. Zustand der aufgeklappten Einheiten: `const [offeneEinheiten, setOffeneEinheiten] = useState<ReadonlySet<string>>(() => new Set());` und `const planZeichen = [...new Set(inhalt.stellen.map((x) => x.zeichen).filter((z): z is string => z !== null))];`
3. Die Platzhalter-Funktion `einfuegen` ersetzen:

```tsx
  /** Entscheidung 9: ab zwei nicht leeren Zeilen fängt das Titelfeld das Einfügen ab — sonst fügt es normal ein. */
  function einfuegen(e: ClipboardEvent<HTMLInputElement>, id: string) {
    const r = leseGliederung(e.clipboardData.getData("text/plain"));
    if (r.eintraege.length + r.fehler.length < 2) return;
    e.preventDefault();
    neu.current = null;
    if (r.fehler.length > 0) {
      const mehr = r.fehler.length > 3 ? ` (und ${r.fehler.length - 3} weitere)` : "";
      p.onHinweis(`Nicht eingefügt. ${r.fehler.slice(0, 3).join(" ")}${mehr}`);
      return;
    }
    let ids: string[] = [];
    const nach = tueMit((q) => { const x = fuegeGliederungEin(q, id, r.eintraege, neueIds(q, "s", r.eintraege.length)); ids = x.zeilenIds; return x.inhalt; });
    if (nach && ids.length > 0) fokussiere(ids[ids.length - 1]);
  }
```

4. An `<GliederungZeile …>` die Plätze füllen (`tab = id === aktiv ? 0 : -1`, `n = z.stelle.einheiten.length`, `auf = offeneEinheiten.has(id)`):

```tsx
                vorne={<ZeichenKnopf stelle={z.stelle} index={p.zeichenIndex} symbole={p.symbole} ladeSymbole={p.ladeSymbole}
                  planZeichen={planZeichen} aendere={aendere} tabIndex={tab} onFertig={() => fokussiere(id)} />}
                neben={<>
                  <VerbindungFeld inhalt={inhalt} stelle={z.stelle} aendere={aendere} tabIndex={tab} />
                  <Button tabIndex={tab} aria-expanded={auf} aria-controls={`kp-g-einheiten-${id}`}
                    onClick={() => setOffeneEinheiten((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; })}>
                    {n === 1 ? "1 Einheit" : `${n} Einheiten`}
                  </Button>
                </>}
                unten={auf ? <div id={`kp-g-einheiten-${id}`} className="kp-g-einheiten">
                  <EinheitenListe key={`einheiten:${id}`} inhalt={inhalt} stelle={z.stelle} aendere={aendere} fokus={KEIN_FOKUS} />
                </div> : null}
```

mit `const KEIN_FOKUS = { ziel: "titel" as const, stelle: null, n: 0 };` auf Modulebene. `onEinfuegen={(e) => einfuegen(e, id)}` setzen (falls in Task 7 weggelassen).

- [ ] **Step 6: CSS**

Außerhalb der Media-Blöcke ergänzen:

```css
/* Zeichen kompakt (Entscheidung 13): 44 px Ziel, das Zeichen bleibt Papier (weißer Grund auch im Dunkeln). */
.kp-g-zeichen {
  display: inline-grid; place-items: center; width: 44px; height: 44px; padding: 0; cursor: pointer;
  border: 1px solid var(--kp-rand); border-radius: 8px; background: var(--kp-flaeche); color: inherit;
}
.kp-g-zeichen:focus-visible { outline: 2px solid var(--kp-auswahl); outline-offset: 2px; }
.kp-g-zeichen svg, .kp-g-zeichen-leer { width: 32px; height: 32px; background: #ffffff; border-radius: 4px; }
.kp-g-zeichen-leer { border: 1px dashed var(--kp-gedaempft); }
.kp-g-zeichenwahl { width: min(360px, 84vw); }
.kp-g-haupt .kp-g-verbindung { min-width: 12rem; }
.kp-g-einheiten { padding: 0 8px 8px calc(44px + 16px); }
```

- [ ] **Step 7: Tests laufen lassen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/ src/app/m/kommplan/grenze.test.ts`
Expected: PASS (`grenze.test.ts`: die neuen Inseln erreichen `zeichen/zeichen.ts` nicht).

- [ ] **Step 8: Typecheck, Lint, Ankerschritt, Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm exec eslint src/app/m/kommplan/_ui/gliederung/
git grep -n "kommplan.css:[0-9]" -- src scripts e2e docs
git add src/app/m/kommplan/_ui/gliederung/ src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Gliederung mit Verbindung, Zeichen, Einheiten und mehrzeiligem Einfügen

Verbindung inline wählen oder neu tippen (Art sichtbar in jeder Option),
Zeichen über einen kompakten Knopf, Einheiten als aufklappbarer Zähler.
Eingefügte, eingerückte Listen werden ein Teilbaum in einem Schritt.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Einbinden — Umschalter Diagramm | Gliederung, Adresse, Telefon, Hinweise, Fokus, Release-Notiz

**Files:**
- Modify: `src/app/m/kommplan/_ui/editor/Editor.tsx`
- Modify: `src/app/m/kommplan/_ui/editor/Kopfleiste.tsx`
- Modify: `src/app/m/kommplan/(intern)/p/[id]/page.tsx`
- Modify: `src/app/m/kommplan/_ui/kommplan.css`, `src/app/m/kommplan/_ui/kommplan-css.test.ts`
- Modify: `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts`
- Modify: `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§6.5, letzter Punkt)
- Modify: `e2e/kommplan-editor.spec.ts` (Step 9a)
- Test: `src/app/m/kommplan/_ui/editor/Editor.test.tsx`

**Interfaces:**
- Consumes: Task 4 (`EditorAnsicht`, `leseEditorAnsicht`, `adresseMitAnsicht`, `sichtbareAnsicht`, `SCHMAL`), Task 6 (Symbolvorrat), Tasks 7/8 (`Gliederung`, `GliederungGriff`), `verwirf` (`./verlauf`).
- Produces: `Editor`-Prop `ansicht?: EditorAnsicht | null`; `Kopfleiste`-Props `ansicht: EditorAnsicht | null; onAnsicht(a: EditorAnsicht): void`; DOM: `.kp-editor[data-editoransicht="diagramm|gliederung|auto"]`, `.kp-ansicht-diagramm`, `.kp-ansicht-gliederung`, Umschalter `radiogroup` „Ansicht" (im Automodus zwei, `.kp-nur-breit`/`.kp-nur-schmal`).

- [ ] **Step 1: Next-Guides lesen**

`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (Abschnitt `searchParams`) und `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` (Abschnitt „Native History API"). Festhalten: `searchParams` ist ein `Promise`; `replaceState(null, "", url)` ist das dokumentierte Muster.

- [ ] **Step 2: Die fehlenden Tests schreiben**

In `Editor.test.tsx`: `zeige` um einen optionalen Parameter erweitern (`const zeige = async (p = plan(), ansicht: EditorAnsicht | null = null) => { await mount(<Editor plan={p} ansicht={ansicht} symbole={{}} zeichenIndex={[]} schrift="Arimo" />); await act(async () => {}); };`, Import `type EditorAnsicht` aus `../../_lib/editorAnsicht`). Die bestehenden Tests bleiben unverändert: im DOM steht die Diagramm-Ansicht **vor** der Gliederung und die Kopfleiste vor beiden, `knopf(text)` findet also weiter den Diagramm-Knopf. Schlägt ein bestehender Test an einem doppelten Knopf fehl, diesen einen Aufruf auf `.kp-ansicht-diagramm` einschränken (`[...document.querySelectorAll<HTMLButtonElement>(".kp-ansicht-diagramm button")].find(…)`), nicht die Reihenfolge ändern.

Anhängen:

```tsx
describe("Ansichten (Spec §6.2, §6.5; Phase 3, Entscheidungen 1, 2, 16)", () => {
  /** Ein Radio des Umschalters; `gruppe` ist die radiogroup selbst (Vorgabe: die erste — mit ausdrücklicher Ansicht gibt es nur eine). */
  const radio = (name: string, gruppe: ParentNode = query('[role="radiogroup"][aria-label="Ansicht"]')) =>
    [...gruppe.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) => r.closest("label")!.textContent === name)!;

  it("ohne Parameter: data-editoransicht=auto, zwei Umschalter (CSS wählt je Breakpoint), beide Ansichten im DOM", async () => {
    await zeige();
    expect(query(".kp-editor").getAttribute("data-editoransicht")).toBe("auto");
    expect(queryAll('[role="radiogroup"][aria-label="Ansicht"]')).toHaveLength(2);
    expect(radio("Diagramm", query(".kp-nur-breit")).checked).toBe(true);
    expect(radio("Gliederung", query(".kp-nur-schmal")).checked).toBe(true);
    expect(exists(".kp-ansicht-diagramm .kp-betrachter")).toBe(true);
    expect(exists(".kp-ansicht-gliederung [data-gliederung]")).toBe(true);
  });
  it("Umschalten: Adresse per replaceState, Auswahl, Rückgängig und Speicherstand bleiben, kein Speichern (Review Focus 5)", async () => {
    const ersetze = vi.spyOn(window.history, "replaceState");
    const warte = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
    await zeige(plan(), "diagramm");
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("n"); // neue Unterstelle, Flyin offen
    await schreibe(queryPortal<HTMLInputElement>('input[name="titel"]'), "Neu"); // berührt: Esc verwirft sie nicht
    await warte(1200); // Autosave erledigt
    aktionen.speichereInhaltAction.mockClear();
    await clickElement(radio("Gliederung"));
    expect(query(".kp-editor").getAttribute("data-editoransicht")).toBe("gliederung");
    expect(ersetze).toHaveBeenLastCalledWith(null, "", expect.stringMatching(/\?ansicht=gliederung$/));
    expect(query<HTMLInputElement>('[data-zeile][aria-current="true"] input[name="titel"]').value).toBe("Neu");
    expect(flyinOffen()).toBe(true);
    expect(knopf("Rückgängig").disabled).toBe(false);
    await clickElement(radio("Diagramm"));
    expect(exists("[data-griffe]")).toBe(true);
    await warte(1200);
    expect(aktionen.speichereInhaltAction).not.toHaveBeenCalled();
  });
  it("Gliederung: Tab auf der ersten Unterstelle — der Hinweis steht im Meldungsplatz der Gliederung", async () => {
    await zeige(plan(), "gliederung");
    const feld = query<HTMLInputElement>('[data-zeile="a"] input[name="titel"]');
    await act(async () => { feld.focus(); });
    await taste("Tab", {}, feld);
    expect(query(".kp-gliederung [data-meldung]").textContent).toContain("Die erste Stelle einer Ebene lässt sich nicht einrücken.");
    expect(document.activeElement).toBe(feld);
  });
  it("Details aus der Gliederung öffnet das Flyin; Schließen gibt den Fokus an die Zeile zurück", async () => {
    await zeige(plan(), "gliederung");
    const feld = query<HTMLInputElement>('[data-zeile="a"] input[name="titel"]');
    await act(async () => { feld.focus(); });
    await taste("F2", {}, feld);
    expect(flyinOffen()).toBe(true);
    await escImFlyin();
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(document.activeElement).toBe(query('[data-zeile="a"] input[name="titel"]'));
  });
  it("Einfügen in der Gliederung ist EIN Schritt: „Rückgängig“ der Kopfleiste nimmt den ganzen Teilbaum zurück", async () => {
    await zeige(plan(), "gliederung");
    const feld = query<HTMLInputElement>('[data-zeile="a"] input[name="titel"]');
    await act(async () => { feld.focus(); });
    const e = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clipboardData", { value: { getData: () => "X\n\tY\n\tZ" } });
    await act(async () => { feld.dispatchEvent(e); });
    expect(queryAll("[data-zeile]")).toHaveLength(6);
    await clickElement(knopf("Rückgängig"));
    expect(queryAll("[data-zeile]")).toHaveLength(3);
  });
});
```

(`escImFlyin`, `taste`, `waehle`, `knopf`, `flyinOffen`, `aktionen` sind im Kopf der Datei schon definiert. Wartet das Flyin auf seine Schließanimation anders als 400 ms, die Wartezeit an den vorhandenen Test „Tastaturschleife …" angleichen.)

`kommplan-css.test.ts` anhängen:

```ts
  it("Ansichten: ausdrücklich per data-editoransicht, ohne Wahl per Breakpoint — in den vorhandenen Blöcken (Phase 3, Entscheidung 1)", () => {
    expect(css).toMatch(/\.kp-editor\[data-editoransicht="diagramm"\] \.kp-ansicht-gliederung,\s*\.kp-editor\[data-editoransicht="gliederung"\] \.kp-ansicht-diagramm \{ display: none; \}/);
    const schmal = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(schmal).toMatch(/\.kp-editor\[data-editoransicht="auto"\] \.kp-ansicht-diagramm,\s*\.kp-editor \.kp-nur-breit \{ display: none; \}/);
    const breit = /@media \(min-width: 768px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(breit).toMatch(/\.kp-editor\[data-editoransicht="auto"\] \.kp-ansicht-gliederung,\s*\.kp-editor \.kp-nur-schmal \{ display: none; \}/);
  });
```

- [ ] **Step 3: Tests laufen lassen, sie schlagen fehl**

Run: `pnpm vitest run src/app/m/kommplan/_ui/editor/Editor.test.tsx src/app/m/kommplan/_ui/kommplan-css.test.ts`
Expected: FAIL in den neuen Fällen.

- [ ] **Step 4: Kopfleiste**

In `Kopfleiste.tsx`: Import `type EditorAnsicht` aus `../../_lib/editorAnsicht`; Props `ansicht: EditorAnsicht | null; onAnsicht: (a: EditorAnsicht) => void` ergänzen; den Kopfkommentar-Satz „(die Gliederung folgt mit Phase 3 und ist bis dahin deaktiviert, Entscheidung 13)" ersetzen durch „(ohne Wahl in der Adresse zwei Umschalter, CSS zeigt je Breakpoint einen — Phase 3, Entscheidung 1)"; das bisherige `<Segmented … disabled …/>` ersetzen durch:

```tsx
            {ansicht === null
              ? <>{umschalter("diagramm", "kp-nur-breit")}{umschalter("gliederung", "kp-nur-schmal")}</>
              : umschalter(ansicht)}
```

mit, innerhalb der Funktion vor dem `return`:

```tsx
  const umschalter = (wert: EditorAnsicht, klasse?: string) => (
    <Segmented<EditorAnsicht> className={klasse} aria-label="Ansicht" value={wert} onChange={onAnsicht}
      options={[{ value: "diagramm", label: "Diagramm" }, { value: "gliederung", label: "Gliederung" }]} />
  );
```

- [ ] **Step 5: Editor**

In `Editor.tsx`:

1. Importe: `Gliederung, type GliederungGriff` (`../gliederung/Gliederung`), `adresseMitAnsicht, SCHMAL, sichtbareAnsicht, type EditorAnsicht` (`../../_lib/editorAnsicht`), `verwirf` ist schon importiert.
2. Props: `ansicht: ansichtStart = null` mit Typ `ansicht?: EditorAnsicht | null` (Kommentar: „aus `?ansicht=`; `null` = CSS wählt").
3. Zustand und Ref: `const [ansicht, setAnsicht] = useState<EditorAnsicht | null>(ansichtStart);` und `const gliederung = useRef<GliederungGriff>(null);`
4. Neue Funktionen (neben `schliesseFlyin`):

```ts
  /** Welche Ansicht zu sehen ist — zur EREIGNISZEIT gefragt, nie im Rendern (Phase 3, Entscheidung 16). */
  function sichtbar(): EditorAnsicht {
    const schmal = typeof window.matchMedia === "function" && window.matchMedia(SCHMAL).matches;
    return sichtbareAnsicht(ansicht, schmal);
  }
  /** Fokus zurück in die sichtbare Ansicht: die Fläche oder die Zeile (Phase 2, Entscheidung 17; Phase 3, Entscheidung 16). */
  function fokusZurueck(id: string | null = gewaehlt) {
    if (sichtbar() === "diagramm") flaeche.current?.fokus(); else gliederung.current?.fokus(id);
  }
  function wechsleAnsicht(a: EditorAnsicht) {
    setAnsicht(a);
    try { window.history.replaceState(null, "", adresseMitAnsicht(window.location.href, a)); } catch { /* ohne Adresse bleibt es Zustand */ }
    if (gewaehlt === null) return;
    if (a === "diagramm") zeigeNach.current = gewaehlt;
    else requestAnimationFrame(() => gliederung.current?.zeige(gewaehlt));
  }
```

5. Jeden bisherigen Aufruf `flaeche.current?.fokus()` in `schliesseFlyin`, `loesche`, `perKnopf` und `nachSchliessen` durch `fokusZurueck()` ersetzen — in `loesche` durch `fokusZurueck(s.eltern)` (die gelöschte Zeile gibt es danach nicht mehr). `lege()` und `taste()` bleiben (sie sind Diagramm-Wege).
6. Den Effekt „Neue, per Pfeil gewählte … Karte in den freien Bereich holen" um `ansicht` in der Abhängigkeitsliste erweitern: `[daten, gewaehlt, flyin, ansicht]`.
7. JSX: `data-editoransicht={ansicht ?? "auto"}` an `.kp-editor`; `<Kopfleiste … ansicht={ansicht} onAnsicht={wechsleAnsicht} />`; die bisherigen Kinder `<Flaeche …/>`, `<p className="kp-hilfe kp-bedienhinweis">`, `<div className={schriftKlasse}><Legende …/></div>` und `<Button …>Verbindungen bearbeiten</Button>` in `<div className="kp-ansicht-diagramm">…</div>` einschließen und **dahinter**:

```tsx
      <div className="kp-ansicht-gliederung">
        <Gliederung griff={gliederung} inhalt={inhalt} auswahl={gewaehlt} aendere={aendere} meldung={meldung}
          onAuswahl={setAuswahl} onDetails={(id) => oeffne(id)} onLoeschen={loesche}
          onRueck={rueck} onWieder={wieder} onHinweis={(text) => setHinweis({ text })}
          verwirfUnberuehrt={(nach) => { if (verlauf.jetzt !== nach) return false; uebernimm(verwirf(verlauf), true); return true; }}
          symbole={symbole} zeichenIndex={zeichenIndex} ladeSymbole={ladeSymbole} />
      </div>
```

   `meldung` ist dieselbe Konstante, die die Fläche bekommt — zwei Instanzen desselben Hinweises, CSS zeigt eine. Die Flyins (`StelleFlyin`, `PlanFlyin`) bleiben außerhalb beider Ansichten.
8. Den Kopfkommentar des Editors um einen Punkt ergänzen: „Zwei Ansichten auf denselben Zustand (Phase 3): Diagramm und Gliederung bleiben montiert; `data-editoransicht` und CSS entscheiden, was zu sehen ist; Fokus kehrt über `fokusZurueck` in die sichtbare zurück."

- [ ] **Step 6: Seite**

In `(intern)/p/[id]/page.tsx`: Signatur `export default async function PlanAnsicht({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> })`, Import `leseEditorAnsicht` aus `@/app/m/kommplan/_lib/editorAnsicht`, im Editor-Zweig `const ansicht = leseEditorAnsicht((await searchParams).ansicht);` und `<Editor … ansicht={ansicht} />`. Den Kopfkommentar um „`?ansicht=` wählt die Ansicht des Editors (Phase 3, Entscheidung 1); der Betrachter kennt nur das Diagramm" ergänzen.

- [ ] **Step 7: CSS**

Außerhalb der Media-Blöcke:

```css
/*
 * Ansichten des Editors (Umsetzungsplan Phase 3, Entscheidung 1): ausdrücklich über data-editoransicht,
 * ohne Wahl entscheidet der Suite-Breakpoint — CSS, nie JavaScript (docs/design/README.md, „Mobil").
 * .kp-editor davor: antds Segmented setzt display selbst, eine Klasse mehr gewinnt (Falle 5).
 */
.kp-editor[data-editoransicht="diagramm"] .kp-ansicht-gliederung,
.kp-editor[data-editoransicht="gliederung"] .kp-ansicht-diagramm { display: none; }
```

Im **vorhandenen** `@media (max-width: 767.98px)`-Block:

```css
  .kp-editor[data-editoransicht="auto"] .kp-ansicht-diagramm,
  .kp-editor .kp-nur-breit { display: none; }
```

Im **vorhandenen** `@media (min-width: 768px)`-Block:

```css
  .kp-editor[data-editoransicht="auto"] .kp-ansicht-gliederung,
  .kp-editor .kp-nur-schmal { display: none; }
```

- [ ] **Step 8: Release-Notiz und Spec**

Release-Notiz `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts`: Titel bleibt, `inhalt` wird:

```ts
  inhalt: [
    absatz(
      "Unter „Kommunikationspläne“ siehst du Pläne und Fernmeldeskizzen als Diagramm und druckst sie über „Drucken (A4 quer)“. " +
        "Mit Bearbeitungsrecht legst du über „Neu“ einen Plan an und baust ihn mit „+ Unterstelle“, „+ Einheit“, „+ links“ und „+ rechts“ auf. " +
        "Alles speichert sich selbst, „Rückgängig“ holt Schritte zurück.",
    ),
    absatz(
      "Unter „Gliederung“ bearbeitest du denselben Plan als eingerückte Liste: Enter legt die nächste Stelle an, Tab rückt ein, Umschalt+Tab rückt aus. " +
        "Fügst du eine eingerückte Liste ein, entsteht daraus ein ganzer Zweig. Am Telefon öffnet der Plan direkt in der Gliederung.",
    ),
  ],
```

(Gezählt: 317 und 268 Zeichen, zusammen 585 — unter 320 je Block und 640 gesamt, `register.test.ts`.)

Spec §6.5, letzter Punkt: „Am Telefon ist die Gliederung der einzige Bearbeitungsweg." ersetzen durch „Am Telefon öffnet der Editor in der Gliederung; das Diagramm bleibt über den Umschalter für kleine Korrekturen erreichbar." — eine Zeile, keine Zeile dazu.

- [ ] **Step 9: Tests laufen lassen**

Run: `pnpm vitest run src/app/m/kommplan/ src/app/m/portal/_lib/neuigkeiten/`
Expected: PASS.

- [ ] **Step 9a: Bestehende Editor-e2e an die neue Vorgabe anpassen (im selben Commit, damit er grün bleibt)**

Ab diesem Commit öffnet der Editor bei 390 px in der Gliederung, und beide Ansichten stehen im DOM. In `e2e/kommplan-editor.spec.ts`:

1. Seit diesem Task stehen beide Ansichten im DOM, und `getByText`/`getByLabel` sehen auch den verborgenen Teil (docs/design/README.md, Tabelle zu `Schmalkarten.tsx`: `getByRole` lässt Verborgenes aus, `getByText` nicht). In `ersteStelle` wird deshalb `page.getByText("Dieser Plan hat noch keine Stellen.")` zu `page.locator(".kp-betrachter").getByText("Dieser Plan hat noch keine Stellen.")` — sonst bricht jeder Aufruf am strikten Greifer (zwei Treffer). Die übrigen `getByText`/`getByLabel` der beiden kommplan-Specs sind auf Flyin, Formular oder Konflikthinweis eingeschränkt (Stand der Planung: `git grep -n "getByText\|getByLabel" e2e/kommplan*.ts`); neue Greifer auf Texte, die in beiden Ansichten stehen, immer einschränken oder `getByRole` nehmen.
2. Test „Hinweise in der Fläche liegen im Bild — Desktop, Tablet, Telefon …": direkt nach `neuerPlan(…)` die Diagramm-Ansicht ausdrücklich wählen — sonst zeigt 390 px die Gliederung:
   ```ts
   await page.getByRole("radiogroup", { name: "Ansicht" }).getByRole("radio", { name: "Diagramm" }).check();
   await expect(page).toHaveURL(/\?ansicht=diagramm$/);
   ```
   (Bei 1280 px Startbreite ist genau ein Umschalter sichtbar; `getByRole` sieht den verborgenen nicht.)
3. Fototest „Bildschirmfotos …": jede Navigation in den Editor, auf die ein Diagramm-Schritt folgt (`/p/${leerId}`, `/p/beispiel-openr-2022-07-01`), bekommt `?ansicht=diagramm`. Im Kopfkommentar ergänzen: „Am Telefon öffnet der Editor ohne Parameter in der Gliederung (Phase 3); die Diagrammfotos wählen es ausdrücklich." (Die Oberkante in `ganzInDerFlaeche` prüft der Test seit Task 5.)

Dann einzeln fahren:

```bash
uptime
pnpm exec playwright test e2e/kommplan-editor.spec.ts; echo "e2e exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
```

Expected: Exit 0 (bei Load > 10 den CI-Weg `pnpm e2e:gebaut`).

- [ ] **Step 10: Typecheck, Lint, Build**

```bash
uptime
pnpm typecheck; echo "typecheck exit $?"
pnpm lint; echo "lint exit $?"
pnpm build; echo "build exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
```

Expected: alle Exit 0; der Build zeigt `/m/kommplan/p/[id]` weiter als dynamische Route.

- [ ] **Step 11: Ankerschritt, Commit**

```bash
for f in Editor.tsx Kopfleiste.tsx page.tsx kommplan.css 2026-09-30-kommunikationsplaene-ansehen.ts 2026-09-30-modul-kommunikationsplaene-design.md kommplan-editor.spec.ts; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
pnpm anker:drift src/app/m/kommplan/_ui/editor/Editor.tsx
pnpm anker:drift docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md
git add src/app/m/kommplan/_ui/editor/ src/app/m/kommplan/_ui/kommplan.css src/app/m/kommplan/_ui/kommplan-css.test.ts "src/app/m/kommplan/(intern)/p/[id]/page.tsx" src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md e2e/kommplan-editor.spec.ts
git commit -S -m "feat(kommplan): Gliederung im Editor, am Telefon die erste Ansicht

Der Umschalter Diagramm | Gliederung ist aktiv und merkt sich die Wahl in
der Adresse; ohne Wahl zeigt das Telefon die Gliederung. Auswahl,
Rückgängig und Flyin bleiben beim Umschalten erhalten.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: End-to-End — Gliederung, Einfügen, Telefon, Umschalten, Griffe; bestehende Editor-e2e angepasst

**Files:**
- Create: `e2e/kommplan-hilfen.ts`
- Create: `e2e/kommplan-gliederung.spec.ts`
- Modify: `e2e/kommplan-editor.spec.ts`
- Modify: `e2e/gruppen.json`

**Interfaces:**
- Consumes: `devLogin`, `E2E_PORT`, `klickeWennRuhig`, `warteAufSpaltenaufteilung`, `warteAufGestreamteInhalte` (`e2e/fixtures.ts`).
- Produces: `e2e/kommplan-hilfen.ts` exportiert `HOST`, `url`, `ADMIN`, `istAktion`, `rumpf`, `istSpeichern`, `istStandAbfrage`, `flyinTitel`, `karten`, `speichertNach`, `oeffneEditor`, `neuerPlan`, `ersteStelle` — **wortgleich** aus `kommplan-editor.spec.ts` herausgezogen (dort danach importiert statt definiert).

- [ ] **Step 1: Helfer herausziehen**

Die genannten Konstanten und Funktionen aus `e2e/kommplan-editor.spec.ts` unverändert nach `e2e/kommplan-hilfen.ts` verschieben (mit `export`, Kopfkommentar „Gemeinsame Helfer der kommplan-e2e; Falle 10: jede ausgelöste Server Action per `waitForResponse`") und in der Spec importieren. `pnpm exec playwright test e2e/kommplan-editor.spec.ts --list` muss dieselben Testnamen zeigen wie vorher.

- [ ] **Step 2: Fototest um die Gliederung ergänzen**

In `e2e/kommplan-editor.spec.ts` (die Anpassungen an die Telefon-Vorgabe stehen seit Task 9, Step 9a) den Fototest um die Gliederung ergänzen, am Ende der Schleife je Breite und Modus:
   ```ts
      await oeffneEditor(page, () => page.goto(url("/p/beispiel-openr-2022-07-01?ansicht=gliederung")));
      await expect(page.getByRole("list", { name: "Gliederung" })).toBeVisible();
      await ohneUeberlauf();
      await foto(`gliederung-${n}`);
      await page.locator('[data-zeile="ea2"] input[name="titel"]').focus();
      await foto(`gliederung-auswahl-${n}`);
      if (b.name === "telefon") {
        await oeffneEditor(page, () => page.goto(url("/p/beispiel-openr-2022-07-01")));
        await expect(page.getByRole("list", { name: "Gliederung" })).toBeVisible(); // ohne Parameter: Gliederung
        await expect(page.locator(".kp-betrachter")).toBeHidden();
        await foto(`telefon-standard-${n}`);
      }
   ```
   Der Zähler `speicherungen` bleibt aktiv, bis alle Gliederungsfotos gemacht sind (Fokus in einen Titel speichert nichts).

- [ ] **Step 3: Neue Spec schreiben**

`e2e/kommplan-gliederung.spec.ts`:

```ts
import { expect, test, type Locator, type Page, type Response } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { ADMIN, HOST, istSpeichern, neuerPlan, oeffneEditor, speichertNach, url } from "./kommplan-hilfen";

/**
 * Kommunikationspläne, Phase 3: die Gliederung (Spec §6.5) und die kompakten Griffe. Jeder bearbeitende
 * Test legt seinen eigenen Plan an; der Seed-Plan OpenR wird nur angesehen (null Speicheraufrufe).
 */
const liste = (page: Page) => page.getByRole("list", { name: "Gliederung" });
async function baum(page: Page): Promise<string[]> {
  return page.locator(".kp-gliederung [data-zeile]").evaluateAll((els) =>
    els.map((e) => `${"·".repeat(Number((e as HTMLElement).style.getPropertyValue("--ebene")))}${(e.querySelector("input[name='titel']") as HTMLInputElement).value}`));
}
async function fuegeEin(feld: Locator, text: string): Promise<void> {
  await feld.evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}
async function zurGliederung(page: Page): Promise<void> {
  await page.getByRole("radiogroup", { name: "Ansicht" }).getByRole("radio", { name: "Gliederung" }).check();
  await expect(page).toHaveURL(/\?ansicht=gliederung$/);
  await expect(liste(page).or(page.getByRole("button", { name: "Erste Stelle anlegen" }))).toBeVisible();
}

test("Gliederung per Tastatur: Enter, Tab, Umschalt+Tab, Alt+↑, Rücktaste — gespeichert und im Diagramm derselbe Baum", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Gliederung Tastatur");
  await zurGliederung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
  const k = page.keyboard;
  await k.type("EL"); await k.press("Enter");
  await k.type("EA 1"); await k.press("Tab"); await k.press("Enter");
  await k.type("EA 2"); await k.press("Enter");
  await k.type("EA 3"); await k.press("Alt+ArrowUp");
  await k.press("Enter"); await k.press("Backspace"); // leere, unberührte Zeile verschwindet wieder
  await k.press("Enter"); await k.type("RTW"); await k.press("Tab");
  await speichertNach(page, () => k.press("Shift+Tab"));
  expect(await baum(page)).toEqual(["EL", "·EA 1", "·EA 3", "·RTW", "·EA 2"]);
  await oeffneEditor(page, () => page.reload());
  await expect(liste(page)).toBeVisible(); // die Adresse trägt ?ansicht=gliederung
  expect(await baum(page)).toEqual(["EL", "·EA 1", "·EA 3", "·RTW", "·EA 2"]);
  await page.getByRole("radiogroup", { name: "Ansicht" }).getByRole("radio", { name: "Diagramm" }).check();
  await expect(page.locator(".kp-betrachter [data-karte]")).toHaveCount(5);
});

test("Tab auf der ersten Unterstelle: Hinweis in der Gliederung, der Fokus bleibt im Titel (Review Focus 3)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Gliederung Tab");
  await zurGliederung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
  await page.keyboard.type("EL");
  await page.keyboard.press("Enter");
  await speichertNach(page, async () => { await page.keyboard.type("EA 1"); await page.keyboard.press("Tab"); });
  const feld = page.locator(".kp-gliederung [data-zeile] input[name='titel']").nth(1);
  await page.keyboard.press("Tab");
  await expect(page.locator(".kp-gliederung [data-meldung]")).toContainText("Die erste Stelle einer Ebene lässt sich nicht einrücken.");
  await expect(page.locator(".kp-gliederung [data-meldung]")).toBeInViewport({ ratio: 1 });
  await expect(feld).toBeFocused();
});

test("Mehrzeiliges Einfügen legt einen Teilbaum an; ein Rückgängig nimmt ihn ganz zurück", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Gliederung Einfügen");
  await zurGliederung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
  const erste = page.locator(".kp-gliederung [data-zeile] input[name='titel']").first();
  await speichertNach(page, () => fuegeEin(erste, "- Einsatzleitung\r\n\t- EA Nord\r\n\t\tRTW RK UE 40-83-5\r\n  - EA Süd\r\n"));
  expect(await baum(page)).toEqual(["Einsatzleitung", "·EA Nord", "··RTW RK UE 40-83-5", "·EA Süd"]);
  await expect(page.locator(".kp-gliederung [data-zeile] input[name='titel']").last()).toBeFocused();
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+z"));
  expect(await baum(page)).toEqual([""]);
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  expect(await baum(page)).toHaveLength(4);
});

test("Telefon: öffnet in der Gliederung; „⋯“ rückt ein, „Details …“ öffnet das Flyin", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const id = await neuerPlan(page, "e2e Gliederung Telefon");
  await expect(page).toHaveURL(new RegExp(`/p/${id}$`)); // ohne Parameter …
  await expect(page.getByRole("button", { name: "Erste Stelle anlegen" })).toBeVisible();
  await expect(page.locator(".kp-betrachter")).toBeHidden(); // … zeigt das Telefon die Gliederung
  await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
  await page.keyboard.type("EL");
  await page.keyboard.press("Enter");
  await speichertNach(page, () => page.keyboard.type("EA 1"));
  await klickeWennRuhig(page.getByRole("button", { name: "Aktionen für EA 1" }));
  await speichertNach(page, () => klickeWennRuhig(page.getByRole("menuitem", { name: /^Einrücken/ })));
  expect(await baum(page)).toEqual(["EL", "·EA 1"]);
  await klickeWennRuhig(page.getByRole("button", { name: "Aktionen für EA 1" }));
  await klickeWennRuhig(page.getByRole("menuitem", { name: /^Details/ }));
  await expect(page.locator(".kp-flyin").getByLabel("Titel", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".kp-gliederung [data-zeile] input[name='titel']").nth(1)).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("Umschalten am Seed-Plan: Auswahl bleibt, kein Neuladen, kein einziger Speicheraufruf (Review Focus 5)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const speicherungen: string[] = [];
  const zaehle = (r: Response) => { if (istSpeichern(r)) speicherungen.push(r.url()); };
  page.on("response", zaehle);
  await oeffneEditor(page, () => page.goto(url("/p/beispiel-openr-2022-07-01")));
  await page.evaluate(() => { (window as unknown as { marke: number }).marke = 42; });
  await klickeWennRuhig(page.locator('.kp-betrachter [data-karte="ea2"]'));
  await zurGliederung(page);
  await expect(page.locator('[data-zeile="ea2"]')).toHaveAttribute("aria-current", "true");
  await expect(page.locator('[data-zeile="ea2"]')).toBeInViewport();
  await page.getByRole("radiogroup", { name: "Ansicht" }).getByRole("radio", { name: "Diagramm" }).check();
  await expect(page.getByRole("toolbar", { name: /^Auswahl: EA 2/ })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { marke?: number }).marke)).toBe(42);
  page.off("response", zaehle);
  expect(speicherungen).toEqual([]);
});

test("Griffe: kompakt, 6 px an der Karte, Seitengriffe beschriftet und ohne Nachbarkarten zu verdecken; Treffer 44 px (Phase 3, Entscheidung 18)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await oeffneEditor(page, () => page.goto(url("/p/beispiel-openr-2022-07-01?ansicht=diagramm")));
  for (const id of ["ea1", "ea2", "ea4"]) {
    await page.keyboard.press("Escape");
    await klickeWennRuhig(page.locator(`.kp-betrachter [data-karte="${id}"]`));
    const karte = (await page.locator(`[data-griffe="${id}"] .kp-griffe-karte`).boundingBox())!;
    const leiste = (await page.locator(`[data-griffe="${id}"] .kp-griffleiste`).boundingBox())!;
    expect(leiste.y - (karte.y + karte.height), `${id}: Leiste an der Karte`).toBeLessThanOrEqual(8);
    const andere = await page.locator(`.kp-betrachter [data-karte]:not([data-karte="${id}"])`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    for (const seite of ["links", "rechts"] as const) {
      const g = page.locator(`[data-griffe="${id}"] [data-griff="${seite}"]`);
      await expect(g).toHaveText(`+ ${seite}`);
      const b = (await g.boundingBox())!;
      expect(b.height, `${id} ${seite}: sichtbar kompakt`).toBeLessThanOrEqual(33);
      expect(karte.y - (b.y + b.height), `${id} ${seite}: nah über der Karte`).toBeLessThanOrEqual(8);
      for (const a of andere) {
        const schneidet = b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y;
        expect(schneidet, `${id} ${seite} verdeckt eine Nachbarkarte`).toBe(false);
      }
      // Trefferfläche 44 px: 5 px über und unter dem sichtbaren Knopf trifft man noch ihn
      for (const dy of [-5, b.height + 5]) {
        const trifft = await page.evaluate(([x, y, s]) => document.elementFromPoint(x, y)?.closest(`[data-griff="${s}"]`) !== null, [b.x + b.width / 2, b.y + dy, seite] as const);
        expect(trifft, `${id} ${seite}: Treffer bei ${dy}`).toBe(true);
      }
    }
  }
});
```

Hinweise: `speichertNach` wartet auf die Antwort des Autosave — die Schritte davor (Enter, Tab …) sind reine Client-Änderungen und landen im selben gebündelten Speichern. Trifft `elementFromPoint` bei −5 den Tooltip-Wurzelknoten statt des Knopfs, ist das ein Befund an der Trefferfläche, kein Grund, `dy` zu verkleinern.

- [ ] **Step 4: Einzeln laufen lassen**

```bash
uptime
pnpm exec playwright test e2e/kommplan-gliederung.spec.ts; echo "e2e exit $?"
pnpm exec playwright test e2e/kommplan-editor.spec.ts; echo "e2e exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
```

Expected: beide Exit 0. Bei Load > 10 und einem Zeitüberschreitungs-Rot: `E2E_VORGEBAUT=1 pnpm e2e:gebaut e2e/kommplan-gliederung.spec.ts` bzw. den CI-Weg aus `CLAUDE.md` fahren, bevor es als Befund gilt. Die gemessene Laufzeit der neuen Spec notieren (Reporter-Ausgabe).

- [ ] **Step 5: Eimer**

`e2e/kommplan-gliederung.spec.ts` in `e2e/gruppen.json` in den Eimer mit der kleinsten Summe eintragen (Messung aus Phase-2-Abweichung U11 plus die dort genannten rund 20 s für eimer-8; die neue Spec mit der eben gemessenen Zeit). Innerhalb der `specs`-Zeichenkette in der Sortierung, die `scripts/e2e-gruppen.test.ts` verlangt (`localeCompare`). Dann:

Run: `pnpm vitest run scripts/e2e-gruppen.test.ts`
Expected: PASS.

- [ ] **Step 6: Ankerschritt, Commit**

```bash
for f in kommplan-editor.spec.ts gruppen.json; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
pnpm exec eslint e2e/kommplan-hilfen.ts e2e/kommplan-gliederung.spec.ts e2e/kommplan-editor.spec.ts
git add e2e/kommplan-hilfen.ts e2e/kommplan-gliederung.spec.ts e2e/kommplan-editor.spec.ts e2e/gruppen.json
git commit -S -m "test(kommplan): e2e für Gliederung, Einfügen, Telefon, Umschalten und Griffe

Gemeinsame Helfer der kommplan-e2e in einer Datei; der Fototest
fotografiert jetzt auch die Gliederung.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Sichtprüfung — Fotos hell und dunkel auf drei Breiten, Befunde beheben

**Files:**
- Modify (nur bei Befund): die betroffenen Dateien aus Tasks 5–9.

**Interfaces:**
- Consumes: den Fototest aus Task 10.
- Produces: Fotos unter `/private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase3-shots/`, eine Befundliste, je Befund ein `fix(kommplan): …`-Commit.

- [ ] **Step 1: Fotos schießen**

```bash
uptime
KOMMPLAN_FOTOS=/private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase3-shots pnpm exec playwright test e2e/kommplan-editor.spec.ts -g "Bildschirmfotos"; echo "exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
ls /private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase3-shots | wc -l
```

Expected: Exit 0; 8 Ansichten der Phase 2 + `gliederung`, `gliederung-auswahl` je Breite und Modus + `telefon-standard` je Modus = 48 + 12 + 2 = 62 Fotos.

- [ ] **Step 2: Jedes Foto mit Read ansehen**

Mindestens: `auswahl-*` (alle 6), `flyin-stelle-*` (6), `gliederung-*` und `gliederung-auswahl-*` (je 6), `telefon-standard-*` (2). Prüfliste:
1. Griffe: kompakt, direkt an der Karte; „+ links"/„+ rechts" lesbar, über den Ecken, ohne Nachbarkarte zu verdecken; im Dunkeln Pillen mit sichtbarem Rand.
2. Gliederung: Einrückung klar erkennbar, Seitenstellen-Chip lesbar, gewählte Zeile mit Fläche **und** Randstrich (hell wie dunkel), Titel nicht abgeschnitten bei 1024 px mit Sidebar.
3. Telefon: eine Zeile = Zeichen, Titel, „⋯"; die gewählte Zeile zeigt Verbindung und Einheiten; kein waagerechtes Überlaufen; Kopfleiste mit Umschalter voll breit.
4. Umschalter: genau einer sichtbar, der gewählte Wert markiert.
5. Hinweise (`hinweis-*`): im Bild, nicht über Griffen.
7. Last: die große Stab-Lage (`/p/beispiel-grosse-stabslage?ansicht=gliederung`, falls der Seed-Schlüssel anders heißt, aus `_lib/beispiele/index.ts`) in der Gliederung öffnen und in einem Titel tippen — jede Zeile trägt `Input`, `Select`, `Dropdown` und `Popover`, und anders als das Layout ist die Liste nicht `useDeferredValue`. Hakt das Tippen spürbar, `GliederungZeile` per `memo` an `zeile.stelle`, `gewaehlt` und `aktiv` binden (die Operationen erhalten unveränderte Stellen als dasselbe Objekt, `mitFolge`) und als Abweichung eintragen.
6. Zum Vergleich die Referenzbilder der alten Vorlage (`…/scratchpad/referenz/*.png`) daneben lesen: die Gliederung soll dieselbe Hierarchie erkennen lassen wie das Blatt.

- [ ] **Step 3: Befunde beheben**

Je Befund: kleinster Eingriff, ein DOM- oder CSS-Test, der ihn festhält (Quelltext-Scan für CSS-Regeln, e2e für „sieht man"), Fotos der betroffenen Ansicht neu schießen und ansehen, `fix(kommplan): …`-Commit mit `DRK-500`. Jeden Befund samt Entscheidung in die Tabelle „Abweichungen bei der Umsetzung" dieses Plans eintragen (U1, U2, …) und den Plan mit `docs: Abweichungen … im Umsetzungsplan Phase 3` committen.

- [ ] **Step 4: Release-Notiz gegenlesen**

Jeder Name in der Notiz steht so am Bildschirm (Fotos): „Drucken (A4 quer)", „Neu", „+ Unterstelle", „+ Einheit", „+ links", „+ rechts", „Rückgängig", „Gliederung". Weicht etwas ab, die Notiz in einem `fix(kommplan): …`-Commit nachziehen.

---

### Task 12: Alle Tore

**Files:** keine neuen Änderungen.

**Interfaces:**
- Consumes: alles.
- Produces: den abgeschlossenen Stand der Phase 3.

- [ ] **Step 1: Alle Tore**

Vorher `uptime`. Dann nacheinander, jeweils Exit-Code prüfen:

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm lint; echo "lint exit $?"
pnpm anker:neu; echo "anker exit $?"
pnpm vitest run; echo "vitest exit $?"
pnpm build; echo "build exit $?"
pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts e2e/kommplan-gliederung.spec.ts; echo "e2e exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
```

Expected: alles Exit 0. Bekannt und nicht Teil dieser Arbeit: `scripts/backup-sidecar.test.ts` auf macOS (DRK-501); `pnpm vitest run` darf ausschließlich daran rot sein. Ein rotes e2e bei hoher Last einzeln bzw. über `pnpm e2e:gebaut` (CI-Weg) nachfahren, bevor es als Befund gilt.

- [ ] **Step 2: Stand festhalten**

`git status` sauber (außer `next-env.d.ts`, zurückgesetzt); `git log --oneline main..HEAD` zeigt die Commits dieser Phase mit signierten Kopfzeilen (`git log --show-signature -1` für eine Stichprobe).

---

## Abdeckung der Spec (Selbstprüfung)

| Spec / Vorgabe | Aufgabe |
|---|---|
| §6.2 Umschalter Diagramm \| Gliederung aktiv; Auswahl bleibt; Ansicht per Adresse merkbar | 4, 9, 10 |
| §6.5 eingerückte Baumliste, auch Seitenstellen erkennbar | 2, 7 |
| §6.5 Titel, Verbindung (wählen/neu tippen) inline; Zeichen kompakt; Einheiten als aufklappbarer Zähler | 7, 8 |
| §6.5 Enter = Geschwister mit Fokus; Tab/Umschalt+Tab = Ebene (erste Kindstelle: kein Fokusverlust); Alt+↑/↓ = verschieben; Entf/Rücktaste auf leerem Titel = Zeile löschen; Pfeile wandern | 2, 4, 7, 10 |
| §6.5 mehrzeiliges Einfügen mit Einrückung (Tabs/zwei Leerzeichen, gemischt), Aufzählungszeichen abstreifen, nichts als Fahrzeug raten, ein Rückgängig-Schritt; Parser rein mit Tests | 1, 3, 8, 9, 10 |
| §6.5 Telefon: Editor öffnet in der Gliederung, Flyin für Details erreichbar | 7 (Menü), 9, 10 |
| §6.6 dieselbe Rückgängig-/Autosave-Kette, reine Operationen in `_lib/plan/` (`fuegeGliederungEin` …) | 2, 3, 7, 9 |
| §9 `_ui/gliederung/` als Client-Insel | 7, 8 |
| §10 Einfüge-Parser (Gliederung) getestet; e2e „Gliederung einfügen" | 1, 10 |
| Hauptlauf: Griffe kompakter und näher, Seitengriffe mit Kurzbeschriftung und `aria-label`, Touch-Ziele ≥ 44 px | 5, 10, 11 |
| Hauptlauf: Release-Notiz ehrlich zum Stand nach Phase 3, eine Notiz | 9, 11 |
| Hauptlauf: keine Bibliotheks-Suche, kein Briefkopf | Global Constraints (nicht angefasst) |
| Screenshots hell/dunkel, 1440×900, 1024×768, 390×844 | 10, 11 |

## Abweichungen bei der Umsetzung

Was sich erst am laufenden Code zeigt. Jede Zeile nennt die Aufgabe, in der die Entscheidung fiel.

| # | Aufgabe | Befund | Entscheidung |
|---|---|---|---|
