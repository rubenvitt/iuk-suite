# Kommunikationspläne — Lieferphase 4: Bibliothek, Vorlagen, Duplizieren, Archiv, Briefkopf — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modul-Admins pflegen eine Bibliothek aus Stellen, Einheiten und Verbindungen (anlegen, bearbeiten, löschen, suchen; Einheiten auch per „Liste einfügen" und CSV-Import mit Vorschau) und holen daraus im Editor Kopien in den Plan — im Flyin, im Einheitenfeld, in der Verbindungsauswahl und als Titelvorschlag in der Gliederung. Pläne lassen sich duplizieren (Datum heute, Datum im Titel ersetzt), als Vorlage führen, aus einer Vorlage neu anlegen, archivieren und wiederherstellen; ein archivierter Plan ist nur lesbar. Der Kopf der Zeichnung trägt Organisationsname und Logo aus einem hochgeladenen Briefkopf statt des fest eingebauten roten Kreuzes. Dazu wandern die Griffe des Diagramm-Editors in eine Auswahlleiste oben in der Fläche (Phase-3-Entscheidung 18, vom Hauptlauf bestätigt).

**Architecture:** Alles Fachliche ist rein und getestet: Logo-Typ aus den Bytes und SVG-Bereinigung (`_lib/logo/`), CSV-Lesen und Import-Vorschau (`_lib/bibliothek/`), Kopien aus der Bibliothek als Planoperationen (`_lib/plan/bibliothek.ts`), Datum im Titel (`_lib/tagesfassung.ts`). Datenbankzugriffe liegen in `_lib/briefkopf.ts`, `_lib/bibliothekDb.ts`, `_lib/planverwaltung.ts` und werden mit der echten Migration in einer In-Memory-DB getestet. Server Actions (`_actions/`) prüfen den Bearbeitungs-Riegel als erste Anweisung; der Logo-Upload ist ein Route Handler (`logo/route.ts`), weil Server Actions höchstens 1 MB annehmen. Der Editor bekommt die Bibliothek über einen React-Kontext; jede Kopie ist ein Rückgängig-Schritt über die vorhandene `aendere`-Kette.

**Tech Stack:** Next.js 16 (App Router, RSC, Route Handler), React 19 mit React Compiler, TypeScript, zod 4, Drizzle + better-sqlite3 (Blob-Spalte), antd 6.6.4 (`Tabs`, `Select` mit `showSearch`-Objekt, `Drawer`, `Dropdown`, `Popconfirm`), `core/av` (clamd per `zSCAN`), `core/tabelle` (`Kartentabelle`), Vitest 4 (jsdom über `src/app/m/qr/_lib/test-dom.tsx`), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§3, §4.1, §4.3, **§4.4**, §5.6 Punkt 3, §6.1, §6.3, §6.4, §6.5, §6.7, §8.3, §9, §10, §11 Phase 4). Die Umsetzungspläne `docs/superpowers/plans/2026-09-30-kommplan-phase-1.md`, `…-phase-2.md` und `…-phase-3.md` gelten samt ihrer Abschnitte „Abweichungen von der Spec", „Entscheidungen dieser Phase" und „Abweichungen bei der Umsetzung" weiter; wo dieser Plan davon abweicht, steht es unten ausdrücklich. Besonders: Phase-3-Plan Task 5 wurde **nicht** umgesetzt (dort U1); der Code steht auf dem Stand von U2/U25 (Griffe an der Karte, `GRIFF_RAND = { oben: 16, seite: 104, unten: 120 }`, `KOMPAKT`-Token). Task 21 hier leitet sich aus dem **heutigen** Code ab, nicht aus dem Wortlaut von Phase-3-Task 5.

**Ticket:** DRK-500. Ticketnummer in jeden Commit-Body. ClickUp pflegt der Hauptlauf, nicht diese Umsetzung.

## Global Constraints

- Arbeitsverzeichnis ausschließlich `/Users/rubeen/dev/personal/drk/iuk-suite/.claude/worktrees/drk-363-8c5335`; nie `cd` ins Haupt-Repo. Nicht pushen. ClickUp nicht anfassen.
- Deutsche Texte mit echten Umlauten (`ä ö ü Ä Ö Ü ß`); Bezeichner, Datei- und Branchnamen ASCII (`~/.claude/CLAUDE.md`).
- `CLAUDE.md` gilt vollständig. Für diese Phase besonders: Falle 1 (kein antd-Compound in RSC — `Tabs`, `Input.TextArea`, `Popconfirm` nur in Client-Inseln; in Server Components nur `Card`, `Tag`, `Table` u. ä.), 2 (eigenes Markup nimmt `--kp-*`), 3 (Warnungen `type="warning"`, Rot nie auf der Datenfläche — auch nicht im Kopf der Zeichnung), 4 (kein `size`), 5 (eigenes CSS gegen antd nur mit einer Klasse mehr), 6 (Werte für Server Components nie aus `"use client"`-Modulen), 7 (keine `@ant-design/icons`), 9 (Spalten mit `render` nur in Client-Inseln; Server Actions direkt importieren, nie als Prop), 10 (im e2e jede ausgelöste Anfrage per `waitForResponse`; vor dem ersten POST auf den neuen Route Handler `/logo` ein Warmlauf-GET, der 405 liefert — Vorbild der Warmlauf im Import-Test von `e2e/radio-verwaltung.spec.ts`), 12 (`klickeWennRuhig`, `warteAufSpaltenaufteilung`), 13 (`flyinBreite()` für jede `Drawer`), 14/17 (Listen über `Kartentabelle` aus `core/tabelle`, Spaltentitel als Zeichenkette), 20 (keine Regel gegen einen `.ant-*`-Namen), 21 (`NODE_ENV` eingebacken), 22 (`warteAufGestreamteInhalte` vor Zählungen), 23 (objektbezogene 404 im `layout.tsx`).
- **Zugriffsschutz:** Jede neue Seite unter `(intern)` ruft `requireKommplanHost(await headers())` und `await requireKommplanZugang()` je genau einmal (`riegel.test.ts`); Seiten der Gruppe `(intern)/(verwaltung)` (Bibliothek, Einstellungen) zusätzlich `pruefeKommplanBearbeiten(viewer)` (Task 8). Jede Server Action beginnt mit `const viewer = await requireKommplanBearbeitenAktion();` oder `await requireKommplanBearbeitenAktion();` als **erster** Anweisung und löst jede ID in der Datenbank auf (IDOR). Oberfläche und Riegel wenden **dasselbe** Prädikat an: Knöpfe und Links zu Bibliothek, Einstellungen, Duplizieren, Vorlage, Archivieren und Wiederherstellen erscheinen nur bei `darfKommplanBearbeiten(viewer.groups)`.
- **Bauform der Action-Dateien** (`_actions/plan.test.ts`, Test „jede exportierte Action prüft als ERSTE Anweisung …"): Datei beginnt auf Byte 0 mit `"use server";`; sie exportiert **nur** Actions; die Parameterliste enthält kein `)` (keine Vorgabewerte mit Klammern); die Signatur enthält **kein `{`** vor dem Rumpf — Rückgabetypen deshalb als benannte Typen aus `_lib/ergebnis.ts` (`Promise<EinfachErgebnis>`), nie inline `Promise<{ ok: true } | …>`. Jede Action steht in `src/core/audit/coverage-manifest.json` (`{ "kind": "context", "via": "<Name>" }`, Rumpf mit `withAuditContext`); Typen und Schemata liegen in `_lib/`.
- Neue reine Module (`_lib/logo/`, `_lib/bibliothek/`, `_lib/tagesfassung.ts`, `_lib/plan/bibliothek.ts`) sind ohne `"use client"`, ohne `next/*`, `node:*`, `react-dom` — `grenze.test.ts` bekommt die Pfade in die Liste der geteilten Ordner (Task 2, Task 14, Task 10). Datenbank- und Dateisystemcode steht **nicht** in diesen Ordnern, sondern in `_lib/briefkopf.ts`, `_lib/logoScan.ts`, `_lib/bibliothekDb.ts`, `_lib/planverwaltung.ts`.
- React Compiler ist an, `react-hooks/set-state-in-effect` ist aktiv: kein `setState` im Effekt-Rumpf (Vorbild `_ui/editor/Editor.tsx`).
- Hell/Dunkel über `<html data-theme>`, nie `prefers-color-scheme`. Neue Farben als `--kp-*` in `:root` **und** `:root[data-theme="dark"]` (`_ui/kommplan.css`); neue Regeln unter einem Breakpoint in die **vorhandenen** Blöcke `@media (max-width: 767.98px)` bzw. `@media (min-width: 768px)`.
- **Zeit:** nie `timeZone` als Literal auf Modulebene, nie `new Intl.DateTimeFormat({ timeZone })` auf Modulebene. „Heute" ist `heuteIso(jetzt)` aus `_lib/tagesfassung.ts` (`zeitFormat("en-CA", …)` aus `core/zeit`); `plan.datum` bleibt Kalendertag als Mitternacht UTC (`tagZuMs`). **Jede Funktion, die „heute" braucht, bekommt `jetzt: number` als Argument**; Tests nutzen feste Zeitpunkte über die Berliner Mitternacht (zwei datumsabhängige Tests anderer Module wurden gerade repariert — kein dritter).
- Tests, die dieser Plan an eine bestehende Testdatei anhängt, führen ihre Importe in die **vorhandenen** Importzeilen zusammen (`pnpm lint` meldet doppelte Importe).
- DOM-Tests nur über das Harness `src/app/m/qr/_lib/test-dom.tsx` (`mount`, `rerender`, `unmount`, `query`, `queryAll`, `exists`, `fill`, `click`, `clickElement`, `submitForm`, `queryPortal`, `existsPortal`, `clickPortal(selektor)` — ohne Textsuche; für Knöpfe nach Text in Portalen den Testhelfer `knopf(text)` aus Task 9 kopieren), Kopfzeile `// @vitest-environment jsdom`, `afterEach(async () => { await unmount(); … })`. **`query`, `fill` und `submitForm` suchen nur im Mount-Wirt** — antds `Drawer` rendert per Portal nach `document.body`, Flyin-Inhalt also immer über `queryPortal`; zum Füllen und Absenden im Flyin die lokalen Testhelfer `fillPortal`/`submitPortal` (Task 17) in die Testdatei kopieren. Das Harness selbst bleibt unverändert.
- **Zeitgrenzen in Tests** (Angriffstests gegen Rückverfolgung): Eingaben so groß wählen, dass der alte, quadratische oder exponentielle Weg viele Sekunden bräuchte, und die Grenze bei etwa 1 s setzen — nie 100 ms (Load hier oft zweistellig).
- **Titelfelder gibt es im Editor zweimal** (Flyin und Gliederung, Phase-3-Constraint): Greifer auf das Flyin immer eingeschränkt (`[data-flyin-stelle] …` in jsdom, `.kp-flyin` + `getByLabel(…, { exact: true })` im e2e).
- antd 6.6.4: `Select` nimmt Suche **nur** als `showSearch={{ searchValue, onSearch, filterOption }}` bzw. `showSearch={{ filterOption: … }}`; `Alert` mit `title=`; `Drawer` mit `size={flyinBreite(n)}`; `Dropdown` mit `menu={{ items, onClick }}`. Im Zweifel antd-MCP (`ToolSearch` „antd", dann `antd_doc`/`antd_demo`).
- Next-Guides vor dem ersten Code, der die API benutzt, lesen: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (Route Handler, `request.formData()`), `…/01-app/02-guides/server-actions.md` (Abschnitt „Body size limit" und „CSRF check" — gilt **nur** für Actions, nicht für Route Handler), `…/01-app/02-guides/data-security.md` („Allowed origins"), `…/01-app/03-api-reference/03-file-conventions/route-groups.md`, `…/01-app/03-api-reference/04-functions/use-router.md` (`router.refresh()`).
- Kommentaranker in neuem Code nennen **Namen**, nie Zeilen (`pnpm anker:neu` bricht die CI). **Ankerschritt** vor jedem Commit, der eine bestehende Datei ändert: `git grep -n "<dateiname>:[0-9]" -- src scripts e2e docs` und `pnpm anker:drift <datei>`; ein Anker, der vorher zutraf und hinter der Änderungsstelle liegt, wird **in derselben Zeile** in die Namensform umgeschrieben. Nie eine Zahl nachziehen, nie beim Kommentaraufräumen eine Zeile dazu oder weg. Besonders betroffen: `compose.yaml`, `Dockerfile`, `playwright.config.ts`, `src/core/audit/catalog.ts`, `src/core/audit/coverage-manifest.json`, `src/app/m/portal/admin/audit/labels.ts`, alle geänderten kommplan-Dateien, die Spec.
- Signierte Commits (`git commit -S`), Kopfzeile nach Conventional Commits: `feat(kommplan): …` für neue Funktion, `fix(kommplan): …`, `test(kommplan): …`, `refactor(kommplan): …`, `docs: …`, `chore(stack): …` für die Compose-/Dockerfile-Änderung. Body mit einer Zeile `DRK-500` und am Ende `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Jeder Commit besteht `pnpm typecheck`** (Exit-Code prüfen).
- Last: andere Sessions laufen parallel. Vor jedem Urteil über einen roten Test `uptime`; bei Load > 10 die betroffene Datei einzeln oder den CI-Weg (`pnpm e2e:gebaut` bzw. `E2E_VORGEBAUT=1`). Fremde Prozesse nie beenden. Kein `pnpm dev` offen lassen; `git checkout -- next-env.d.ts` nach jedem e2e-Lauf. `scripts/backup-sidecar.test.ts` ist auf macOS rot (DRK-501) — nicht dein Thema. Funde außerhalb von kommplan nur beheben, wenn sie ein Tor blockieren, und in „Abweichungen bei der Umsetzung" als **Ticketkandidat** eintragen.
- Aufgaben, die Routen, Route Handler oder Server Actions anlegen, fahren zusätzlich `pnpm build` (RSC-Grenze, `"use server"`-Exporte, Routenbaum). Unter Dauerlast dürfen benachbarte Aufgaben sich einen Build über den gemeinsamen Endstand teilen (Vorbild Phase-1-Abweichung U6) — vermerken.
- Tore vor dem Abschluss: `pnpm typecheck` · `pnpm lint` · `pnpm anker:neu` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts e2e/kommplan-gliederung.spec.ts e2e/kommplan-bibliothek.spec.ts e2e/kommplan-verwaltung.spec.ts`.
- **Diese Phase fasst nicht an:** Token-Links, QR auf dem Ausdruck, A3, SVG-Export, Schwarzweiß (Phase 5). Die Option `qrAufDruck`/`schwarzweiss` bleibt unberührt.

## Entscheidungen dieser Phase (Abweichungen von Spec und früheren Plänen)

1. **Keine Modulnavigation (`nav`) in der Hülle.** Bibliothek, Einstellungen und Archiv erreicht man über Links im Seitenkopf der Planliste („Bibliothek" und „Einstellungen" nur für Bearbeitende, „Archiv" für alle mit Zugang); jede dieser Seiten führt mit `zurueck={{ titel: "Alle Pläne", href: "/" }}` zurück. Grund: eine Seitenleiste nähme bei 1024 px 218 px Breite und machte die in Phase 2/3 gemessene Geometrie des Editors (Einpassen, Griffe, Flyin-Lage, Fotos) ungültig. Gegenprobe docs/design/README.md „Führt jede Seite zurück": ja, über `zurueck`.
2. **Briefkopf als eine Zeile mit Primärschlüssel `id = 1`** (Abweichung von Spec §4.1, die keine ID nennt): `id INTEGER PRIMARY KEY` mit `CHECK (id = 1)` — der Audit-Katalog braucht einen Primärschlüssel, und „genau eine Zeile" wird so von der Datenbank erzwungen. Ein zweiter `CHECK` hält das Logo vollständig (Blob, Typ und SHA-256 alle gesetzt oder alle leer) und unter 1 MB. **Alle** Spalten sind auditiert, auch der Blob (der Trigger vergleicht `OLD."logo" IS NOT NEW."logo"`): Hochladen, Ersetzen, Entfernen und jede Namensänderung sind je eine Audit-Zeile (`update briefkopf`, beim ersten Eintrag `create`). Ein leerer Organisationsname wird `NULL` gespeichert.
3. **Logo-Upload als Route Handler** `POST /logo` (Datei `src/app/m/kommplan/logo/route.ts`, außerhalb von `(intern)`): Server Actions nehmen höchstens 1 MB an (`server-actions.md`, „Body size limit"), ein 1-MB-Logo samt Multipart-Rahmen also nicht; `serverActions.bodySizeLimit` ist suiteweit und bleibt unangetastet (Vorbild `aufgaben/a/[id]/nachweis/hochladen/route.ts`, Kopfkommentar). Der Handler prüft selbst: Host, Anmeldung, `isModuleAdmin` (`requireKommplanBearbeitenAktion`, Wurf → 404), **gleiche Herkunft** (`Origin` gegen `x-forwarded-host`/`host`, `_lib/herkunft.ts` — Route Handler haben Nexts CSRF-Prüfung der Actions nicht, und die Sitzung gilt suiteweit für alle `*.iuk-ue.de`) und früh die `content-length` (höchstens 1 MB + 16 KB Multipart-Rand), bevor er puffert — fehlt sie, wird gelesen und an den Bytes gemessen (wie `aufgaben`, `inhaltZuGross`). Die Herkunftsprüfung ist neu in der Suite (weder `aufgaben` noch `files` haben eine) und hinter dem Reverse-Proxy des Zielhosts unbelegt — riskante Annahme. Organisationsname und „Logo entfernen" sind Server Actions (`_actions/briefkopf.ts`).
4. **Virenscan per Pfad wie in `aufgaben`**, nicht per INSTREAM: `core/av` bleibt unverändert (sonst auch `scripts/fake-clamd.mjs` und dessen Quelltext-Tests). Die hochgeladenen Bytes werden für den Scan in eine Wegwerfdatei unter `$DATA_DIR/kommplan-scan/<uuid>` geschrieben (Verzeichnis 0750, Datei 0640, `flag: "wx"`), `scanne(pfad, konfig)` aufgerufen und die Datei im `finally` gelöscht. Dafür bekommt der Stack ein **neues benanntes Volume `kommplan_scan`**: `suite` schreibend auf `/data/kommplan-scan`, `clamav` lesend (`:ro`); das Backup mountet es **nicht** (das Logo selbst liegt in `kommplan.db`). Das `Dockerfile` legt `/data/kommplan-scan` an und übereignet es (wie `/data/files`, Kommentar dort: ein leeres benanntes Volume übernimmt Eigentümer und Modus des Mountpunkts aus dem Image). Eigene Variablen `KOMMPLAN_AV_HOST`/`_PORT`/`_TIMEOUT_MS` (Vorgaben `clamav`, `3310`, `30000`); `playwright.config.ts` zeigt sie auf den Fake-clamd. Der Scan läuft **synchron** im Upload; „befund" und „fehler" lehnen ab (fail-closed). Gescannt werden die hochgeladenen Bytes, gespeichert die bereinigten (bei SVG).
5. **Logo-Prüfung:** Größe 1 MB = **1 048 576 Byte**; der Typ kommt allein aus den Bytes (`erkenneLogoTyp`: PNG-, JPEG-, WebP-Signatur; SVG = gültiges UTF-8, dessen erstes Element nach Leerraum, `<?xml …?>`, Kommentaren und einem DOCTYPE `<svg` ist), nie aus Dateiname oder `Content-Type`. **SVG-Bereinigung** (`bereinigeSvg`, rein, ohne DOM) arbeitet mit **Allowlist**: ein eigener, strikter XML-Zerleger (Attribute nur in Anführungszeichen, keine doppelten Attribute, nur die fünf XML-Entitäten und Zeichenreferenzen, Verschachtelung höchstens 256); **DOCTYPE/ENTITY → Ablehnung**; Kommentare und Verarbeitungsanweisungen (auch `<?xml-stylesheet?>`) fallen weg; CDATA wird zu Text. Erlaubt sind nur die Elemente `svg g defs symbol use path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask pattern image style` — alles andere (`script`, `foreignObject` in jeder Schreibweise, `a`, `animate`, `set`, `iframe`, jedes Element mit Präfix wie `svg:script`, `sodipodi:namedview`) fällt **samt Inhalt** weg. Attribute: `on*` fallen weg; `href`/`xlink:href` nur `#id` (an `use`, Verläufen, `pattern`) bzw. Rasterbilder `data:image/png|jpeg|webp;base64,…` (an `image`), sonst fällt das Attribut und ein `use`/`image` ohne Verweis ganz; `url(…)` nur lokal (`url(#id)`); jeder Wert, der nach Entfernen von Leer- und Steuerzeichen `javascript:` enthält, fällt; `style`-Attribut und `<style>`-Inhalt werden je Deklaration gefiltert (Eigenschaften-Allowlist, kein `@`, kein `\`, kein `expression(`, nur lokale `url()`). **Ungültig nach der Bereinigung** (→ Ablehnung): kein `svg`-Wurzelelement, weder `viewBox` noch Breite und Höhe als Zahlen (dann wird `viewBox="0 0 B H"` ergänzt), nichts mehr zu zeichnen. `<style>` bleibt (bereinigt) erhalten, weil Illustrator-Logos ihre Farben über Klassen setzen — ohne ihn wäre das Logo schwarz (Review Focus 1). Die Ausgabe ist idempotent: `bereinigeSvg(aus) === aus`. **Lineare Laufzeit** (Kritik): Typprüfung und Bereinigung laufen synchron im Upload auf dem einzigen Node-Thread, mit bis zu 1 MB Eingabe — darum kein Regex mit geschachteltem Quantor oder offenem Suchlauf je Startposition: der Vorspann vor `<svg` wird mit `indexOf` übersprungen, `<style>` mit einem Zeichen-für-Zeichen-Zerleger gelesen, `url(` je Fundstelle per `indexOf` geprüft; `<style>`-Inhalt über 64 KB wird abgelehnt („zu groß"). Attributwerte bleiben ungedeckelt (ein `d` oder ein eingebettetes PNG ist legitim groß), alle Prüfungen darauf sind linear.
6. **Logo im Kopf der Zeichnung:** genau ein `<image id="kp-logo" … preserveAspectRatio="xMaxYMid meet" href="data:…">` je Dokument in `<defs>`, jedes Blatt verweist per `<use href="#kp-logo">` darauf — die Druckroute rendert viele Blätter, und ein 1-MB-Logo (≈ 1,33 MB Base64) je Blatt wäre ein Vielfaches davon. Feste Kopf-Box `LOGO_BOX = { breite: 40, hoehe: 11, luft: 3 }` mm rechts oben (`x = 287 − 40`, `y = BLATT.randOben`); das Seitenverhältnis hält der Browser (`meet`). Die Organisation steht rechtsbündig links neben der Box (ohne Logo am rechten Rand), auf höchstens `ORGANISATION_MAX = 80` mm gekürzt; der Plantitel (bis 200 Zeichen) wird mit `textBreite` auf den Raum bis dorthin begrenzt — erst in halben Punkten bis 10 pt kleiner, dann mit „…" gekürzt —, damit er nie in Organisation oder Logo-Box läuft. **Ohne Eintrag steht nichts da** — kein `<image>`, kein `<use>`, kein leerer Text, kein Rahmen. Das rote Kreuz (`Blatt.tsx`) und `FARBE.marke` (`#c8000f`) entfallen ersatzlos; `rahmenFuer` kennt keinen Organisationsnamen mehr. Der lokale Seed trägt den neutralen Namen „Musterorganisation", **kein** Logo; auch die Bearbeiterangaben der Beispielpläne (im Fuß „Bearbeitung: …" gedruckt) nennen keine Organisation mehr („Kreisbereitschaftsleitung", „KBL"). Der Bildschirm (Betrachter, Editor) hat keinen Kopf — unverändert.
7. **„Als Vorlage speichern" setzt `ist_vorlage` am Plan selbst** (Spec §6.7 wörtlich): der Plan wandert aus der Liste „Pläne" in die Liste „Vorlagen" und bleibt im Editor bearbeitbar; „Keine Vorlage mehr" nimmt das zurück. **Vom Hauptlauf zu bestätigen** (riskante Annahme): die Alternative „Kopie als Vorlage anlegen" wäre eine Zeile in `planverwaltung.ts` (`dupliziere` mit `istVorlage: true`), Oberfläche und Tests müssten den Wortlaut nachziehen. Die Kritik empfiehlt die Kopie (siehe „An den Hauptlauf", Punkt 2); dieser Plan bleibt beim Wortlaut der Spec, bis der Hauptlauf entscheidet.
8. **„Neu aus Vorlage"**: das Formular „Neuer Plan" bekommt das Feld „Vorlage" (Vorgabe „Leerer Plan"); die Zeilenaktion „Neu aus Vorlage" in der Vorlagen-Liste öffnet dasselbe Formular mit der Vorlage vorbelegt. Wahl einer Vorlage setzt die Art und den Anlass der Vorlage, das Datum auf heute (Suite-Zone; `heute` kommt als Prop von der Seite, `heuteIso(Date.now())` auf dem Server) und — nur wenn der Titel noch leer ist — deren Titel **mit ersetztem Datum** (`ersetzeDatumImTitel(v.titel, heute) ?? v.titel`, dieselbe Regel wie beim Duplizieren, aber ohne „ (Kopie)"): eine Vorlage, die aus einem echten Einsatzplan entstand, trägt sonst ein altes Datum in jeden neuen Plan (Kritik). Ohne Vorlage bleibt das Formular wie bisher (Datum leer). Der Server kopiert den Inhalt der Vorlage (nur eine nicht archivierte Vorlage; sonst Feldfehler „Diese Vorlage gibt es nicht mehr.").
9. **Duplizieren** (Spec §6.7): neue ID, Inhalt, Art und Anlass kopiert; `datum` = heute in der Suite-Zone (`heuteIso(jetzt)`); im Titel wird das **erste** vollständige Datum ersetzt, in **derselben** Schreibweise (`TT.MM.JJJJ`, `T.M.JJJJ`, `TT.MM.JJ`, `JJJJ-MM-TT`; Monat 1–12, Tag 1–31, sonst kein Datum). Ohne Datum im Titel wird „ (Kopie)" angehängt; würde der Titel dadurch länger als 200 Zeichen, bleibt er unverändert. Die Kopie ist keine Vorlage, nicht archiviert, Version 1, „Stand" = jetzt. Danach geht es direkt in den Editor der Kopie (`/p/<neu>?kopie=1`); dort steht einmal der Hinweis „Kopie angelegt — Titel und Datum stehen auf <heute>." mit dem Knopf „Angaben ändern" (öffnet das vorhandene Flyin „Plan und Verbindungen", Abschnitt Angaben) — wer am Vorabend die Fassung für morgen vorbereitet, sieht sofort, dass „heute" gesetzt ist. Während das Duplizieren läuft, trägt der Knopf „Aktionen" der Zeile `loading`, und jede weitere Aktion an derselben Zeile ist gesperrt (kein zweites Duplikat per Doppelklick). Ein nicht lesbarer Plan wird nicht dupliziert.
10. **Archiv** (Spec §8.3): „Archivieren" setzt `archiviert_am`, „Wiederherstellen" nimmt es zurück; beides ändert den „Stand" nicht und ist je eine Audit-Zeile (Trigger auf `archiviert_am`). Die Archivansicht ist eine eigene Seite `/archiv` für alle mit Zugang; „Wiederherstellen" nur für Bearbeitende. Ein archivierter Plan unter `/p/[id]` ist **nur lesbar**: Betrachter statt Editor, darüber „Archiviert am … — nur lesbar" (für Bearbeitende mit „Wiederherstellen"); Drucken bleibt erlaubt. `ladePlan`/`ladeStand` bleiben „nur aktive" (Editor, Speichern, später Token-Links, Phase 5); neu ist `ladePlanLesend` für Layout, Planseite und Druck. Ein im Editor offener Plan, der in einem anderen Fenster archiviert wird, bekommt beim nächsten Speichern „weg" (vorhandener Pfad).
11. **Bibliotheksseite** `/bibliothek` (nur Bearbeitende): drei Bereiche als Reiter „Stellen | Einheiten | Verbindungen" (antd `Tabs`, Client-Insel). Je Bereich ein Suchfeld (clientseitig über alle Textfelder), „Neu", eine **`Kartentabelle`** (nicht die nackte `Datentabelle` des Auftragswortlauts: docs/design/README.md „Mobil", DRK-451 und Phase-1-Kritik 2 — die Kartentabelle *ist* die Datentabelle mit der Telefonform) und Bearbeiten im Flyin (`Drawer`, `flyinBreite(520)`). Gespeichert wird hier **ausdrücklich** („Speichern"/„Abbrechen"): Bibliothekspflege ist Stammdatenpflege ohne Rückgängig-Stapel. Beim Öffnen steht der Fokus im ersten Feld (wie „Neuer Plan"); beim Anlegen gibt es zusätzlich „Speichern und nächste" — speichert, meldet, leert das Formular und lässt es offen, Fokus wieder im ersten Feld (mehrere Einträge hintereinander ohne Mausweg). Freitextspalten (Notiz, Kontakte) über `Zellentext` aus `core/tabelle` (Lesebreite, docs/design/README.md „Mobil"). Löschen mit `Popconfirm` („Aus der Bibliothek löschen? Pläne behalten ihre Kopien."). **Dubletten** (Vergleich getrimmt, Leerraum zusammengezogen, ohne Groß/Klein): Stelle nach Titel, Einheit nach Rufname, Verbindung nach Bezeichnung **und** Art — Anlegen oder Umbenennen auf eine Dublette wird mit Feldfehler abgewiesen. Höchstens 2000 Einträge je Bereich, Notiz höchstens 500 Zeichen.
12. **Einheiten importieren:** „Liste einfügen" (gleicher Parser wie im Flyin, `leseEinheitenliste`) und „CSV importieren" (`Typ;Rufname[;Notiz]`, Semikolon, Felder in Anführungszeichen mit `""`, CRLF/LF/CR, BOM, Kopfzeile `Typ;Rufname[;Notiz]` wird erkannt, leere Zeilen übersprungen; Kodierung UTF-8, sonst **Windows-1252** — Excel speichert deutsche CSV so). Beide führen in **dieselbe Vorschau**: je Zeile Typ, Rufname, Notiz und Status „neu", „schon in der Bibliothek" oder „doppelt in der Liste"; Fehler mit Zeilennummer verhindern die Übernahme ganz (nichts still gekürzt). „N übernehmen" schickt nur die neuen Zeilen; der Server prüft Dubletten in einer Transaktion erneut und meldet „N angelegt, M übersprungen". Höchstens 500 Zeilen je Import (Server-Action-Grenze 1 MB).
13. **Bibliothek im Editor** per React-Kontext `BibliothekKontext` (die Planseite lädt die Bibliothek nur für Bearbeitende; der Wert ist stabil, solange sich die Bibliothek nicht ändert). Jede Kopie ist **ein** Rückgängig-Schritt (`aendere` ohne Bündelschlüssel); Zeichen der Kopie lädt **der Kopierweg selbst** nach (`ladeSymbole` mit den mitgebrachten Schlüsseln — nicht nach jedem `aendere`, sonst löste ein unbekannter Schlüssel bei jedem Tastendruck einen Abruf aus). Der Kontext trägt `merke(teil)`: neue oder geänderte Einträge (nach ID ersetzt oder ergänzt), damit Übernahmen sofort auswählbar sind. Im Stellen-Flyin oben „Aus Bibliothek" (Auswahl mit Suche; ersetzt Titel, Zeichen, Leiter und Kontakte — Einheiten, Lage und Verbindung bleiben; danach Fokus ins Titelfeld), unter dem Titelfeld dieselben Titelvorschläge wie in der Gliederung (Entscheidung 14), unten „In Bibliothek übernehmen" (Titel, Zeichen, Leiter, Kontakte; ohne Titel deaktiviert; während des Laufs nur `loading`, nicht gesperrt — der Fokus bliebe sonst nicht am Knopf; Dublette → Hinweis „steht schon in der Bibliothek" **mit dem Knopf „Eintrag in der Bibliothek aktualisieren"**, der den vorhandenen Eintrag mit den Angaben der Stelle überschreibt, Notiz bleibt). Im Einheitenfeld (Flyin und aufgeklappte Einheiten der Gliederung) „Aus Bibliothek" als Mehrfachauswahl mit Suche, deren Suchtext nach einer Wahl stehen bleibt (`autoClearSearchValue: false` — „41-92" einmal tippen, dann ↓/Enter je Fahrzeug); an dieser Stelle schon vorhandene Fahrzeuge (gleicher Rufname) sind gesperrt, an einer anderen Stelle eingesetzte tragen „— schon bei <Stelle>" und stehen hinter den freien; „Hinzufügen" (Grenze 60 je Stelle gilt, sonst nichts übernommen; danach Fokus zurück in die Auswahl). Dazu „Einheiten in Bibliothek übernehmen" für alle Einheiten der Stelle (die Import-Action, Dubletten übersprungen, Meldung „n angelegt, m schon vorhanden"). In der Verbindungsauswahl (Flyin „Zur Elternstelle" und Verbindungsfeld der Gliederung) stehen Bibliotheksverbindungen, die der Plan noch nicht hat (gleiche Bezeichnung **und** Art), als eigene Optionen „Aus Bibliothek: R_UE_1 · Digitalfunk TMO"; die Wahl legt eine Kopie im Plan an und verbindet. Im Flyin „Plan und Verbindungen" (Abschnitt Verbindungen) übernimmt „Verbindungen in Bibliothek übernehmen" alle Verbindungen des Plans in **einem** Aufruf (`importiereBibVerbindungenAction`, Dubletten nach Bezeichnung und Art übersprungen) — Server Actions laufen nacheinander, eine Schleife einzelner Aufrufe stellte sich vor das Autosave. So füllt der erste echte Plan die Bibliothek, statt dass man Fahrzeuge und Verbindungen ein zweites Mal tippt. Kanäle (`kanaele`) bleiben ohne Bibliothek.
14. **Titelvorschläge in der Gliederung** — „ohne den Tippfluss zu stören": nur an der **aktiven** Zeile, unter ihr, ab 2 Zeichen, höchstens 3 (zuerst Titel, die mit dem Getippten beginnen, dann solche, die es enthalten; nicht, wenn die Stelle den Eintrag schon genau trägt). Kein Popup, kein Abfangen von Enter, Tab, Pfeilen oder Esc. Übernehmen per Klick/Tipp auf einen Vorschlag (die Knöpfe verhindern `mousedown`, der Fokus bleibt im Titel, eine unberührt angelegte Zeile verschwindet nicht) oder per **Alt+Enter** (erster Vorschlag; `e.key === "Enter"` mit `altKey`; kein Browser belegt Alt+Enter im Seiteninhalt — auf Windows ungeprüft, Risiko wie Phase-3-U16). Ohne Vorschlag meldet Alt+Enter „Kein Vorschlag aus der Bibliothek." Die Vorschläge sind eine eigene Kindkomponente der Zeile, die als einzige den Kontext liest — die `memo`-Bindung der übrigen Zeilen bleibt (Phase-3-Entscheidung 2). **Tastaturweg zum 2. und 3. Vorschlag:** in der Gliederung gehört Tab dem Einrücken, die Vorschlagsknöpfe bleiben dort `tabIndex={-1}`; im Stellen-Flyin (dieselbe Komponente unter dem Titelfeld, Alt+Enter ebenso) sind sie gewöhnliche Tabstopps, und „Aus Bibliothek" sucht gezielt — beides ist der dokumentierte Weg ohne Zeiger. Kein Alt+1…3: Alt+Ziffer wechselt in Chrome/Firefox unter Linux den Tab und erreicht die Seite nicht verlässlich. Die Leiste der Vorschläge ist einzeilig und waagerecht scrollbar (feste Höhe), damit die Zeilen darunter beim Tippen nicht springen; der Hinweis „Alt+Enter nimmt den ersten" steht unter 768 px nicht da (Bildschirmtastaturen haben kein Alt). **Nach dem Einfügen einer Gliederung** (mehrzeiliges Einfügen, Phase 3) werden die neuen Titel exakt (`vergleichsform`) gegen die Bibliothek geprüft; bei Treffern meldet der Editor „2 Stellen stehen so in der Bibliothek." mit dem Knopf „Angaben übernehmen", der alle Treffer in **einem** Rückgängig-Schritt füllt.
15. **Auswahlleiste** (Phase-3-Entscheidung 18, **vom Hauptlauf bestätigt**; Begründung: die Messung im Phase-3-Plan zeigt, dass Griffe an der Karte bei 1024 px zwangsläufig Planelemente verdecken): An der Karte bleibt nur der Auswahlrahmen. Alle Griffe stehen in `.kp-auswahlleiste` (`role="group"`, `aria-label` „Auswahl: <Titel>" — ehrlich: jeder Knopf ein eigener Tabstopp, keine Pfeiltasten-Bedienung, die `role="toolbar"` versprechen würde) oben links in der Fläche, 8 px vom Rand, nie umbrechend (am Telefon waagerecht scrollbar, mit Schattenkante, solange weiterer Inhalt verborgen ist): Name der Stelle (gekürzt; unter 768 px ausgeblendet, das `aria-label` trägt ihn), „Bearbeiten", „+ Unterstelle", „+ Einheit", „+ links", „+ rechts" (Seitenstelle: nur „Bearbeiten" und „+ Einheit"). „Bearbeiten" steht vorn, weil das Diagramm am Telefon für kleine Korrekturen da ist (Spec §6.5) und das Ende der Leiste bei 390 px außerhalb des Bildes liegt. Höhe fest `AUSWAHLLEISTE = { abstand: 8, hoehe: 56 }`. Die Ränder beim Einpassen werden zurückgenommen: `GRIFF_RAND = { oben: 72, seite: 16, unten: 72 }` (oben Leiste + Luft, seitlich nur Auswahlrahmen, unten Meldungsplatz); `Flaeche` bekommt `platzOben`. Das `KOMPAKT`-Token (`paddingInline: 10`) bleibt — die Leiste ist so am Telefon kürzer. Spec §6.3 wird angepasst (Task 21).
16. **Zugang der Verwaltungsseiten:** neue Routengruppe `(intern)/(verwaltung)` mit eigenem `layout.tsx` (Host, Zugang, **Bearbeiten** — oberhalb jeder künftigen `loading.tsx`, Falle 23); `pruefeKommplanBearbeiten(viewer)` in `_lib/zugang.ts` wirft `notFound()` mit Audit-Ablehnung. Die Seiten rufen alle drei Riegel selbst noch einmal (Layouts und Seiten rendern parallel).
17. **Release-Notiz** (Vorgabe des Hauptlaufs: eine Notiz für das Modul, ehrlich zum Stand nach Phase 4): dieselbe Datei, drei Absätze innerhalb der Grenzen (3 Blöcke, je ≤ 320 Zeichen, zusammen ≤ 640). Wortlaut in Task 22.

## Review Focus

1. **Ein echtes Logo aus Illustrator, Inkscape oder dem Corporate-Design-Paket** — `<style>` mit Klassen (`.st0{fill:#E30613}`), CDATA darin, `sodipodi:`/`inkscape:`-Elemente und -Attribute, `<metadata>`, eingebettetes PNG als `data:`-URI, nur `width`/`height` ohne `viewBox`, eine BOM — wird bereinigt **angenommen** und behält seine Farben; nur Gefährliches fällt. Gepinnt in `_lib/logo/svg.test.ts` (Task 3).
2. **Ein Logo mit falschem Namen oder falschem `Content-Type`** (JPEG als `.svg`, SVG als `logo.png`, eine HTML-Datei als `.svg`, ein GIF, eine PDF) → Typ allein aus den Bytes: angenommen bzw. „Erlaubt sind PNG, JPEG, WebP und SVG."; ein HTML-Dokument mit eingebettetem `<svg>` ist kein SVG. Gepinnt in `_lib/logo/logoTyp.test.ts` (Task 2) und `logo/route.test.ts` (Task 6).
3. **Eine CSV aus Excel** — Windows-1252 mit „Großenkneten", Semikolon im Rufnamen in Anführungszeichen, `""` darin, BOM, CRLF, Kopfzeile, Leerzeilen, eine Zeile mit vier Spalten, Dubletten in der Datei und gegen die Bibliothek (anders geschrieben: „rk ue 40-83-5 ") → Vorschau mit richtigen Umlauten, Status je Zeile, Fehler mit Zeilennummer, nichts übernommen, solange ein Fehler steht. Gepinnt in `_lib/bibliothek/csv.test.ts`, `vorschau.test.ts` (Task 15) und `bibliothekDb.test.ts` (Task 14).
4. **Duplizieren kurz nach Mitternacht Berlin** (UTC noch am Vortag) und Titel mit zwei Daten, ohne Datum, mit „1.2 Abschnitt" oder „112 Leitstelle", 199 Zeichen lang → das Datum des **Berliner** Tages, nur das erste Datum ersetzt, Zahlen ohne Datum bleiben, nie über 200 Zeichen. Gepinnt in `_lib/tagesfassung.test.ts` (Task 10).
5. **Bibliothek in einen vollen oder konfliktträchtigen Plan** — Verbindung „R_UE_1" gibt es im Plan schon als TMO, in der Bibliothek als DMO; eine Stelle mit 58 Einheiten bekommt 3 aus der Bibliothek; „Aus Bibliothek" auf eine Stelle mit Einheiten und Unterstellen → Kopie der gleichnamigen **anderen** Art, Abweisung ohne Teilübernahme, Einheiten/Unterstellen/Verbindung bleiben; jeweils **ein** Rückgängig-Schritt. Gepinnt in `_lib/plan/bibliothek.test.ts` (Task 18) und `StelleFlyin.test.tsx` (Task 19).
6. **Ein archivierter Plan, der noch in einem zweiten Fenster im Editor offen ist** → dort meldet das nächste Speichern „weg" (kein stilles Überschreiben, kein Wiederbeleben); `/p/<id>` zeigt den Betrachter mit Archivhinweis, nie den Editor, auch nicht für Bearbeitende; Drucken geht. Gepinnt in `planverwaltung.test.ts` (Task 11) und `e2e/kommplan-verwaltung.spec.ts` (Task 23).
7. **Tippen in der Gliederung mit Bibliotheksvorschlägen** → Enter legt weiter die nächste Stelle an, Tab rückt ein, ↑/↓ wandern, Esc verlässt; ein Klick auf einen Vorschlag lässt den Fokus im Titel und verwirft die eben per Enter angelegte Zeile nicht; Alt+Enter übernimmt; die verborgene Gliederung rendert beim Tippen im Flyin nicht mehr Zeilen als vorher. Gepinnt in `Gliederung.test.tsx`, `GliederungLast.test.tsx` (Task 20) und `e2e/kommplan-bibliothek.spec.ts` (Task 23).
8. **Die Auswahlleiste verdeckt kein Planelement** — eingepasst bei 1440 × 900 ohne und mit offenem Stellen-Flyin und bei 1024 × 768, an fuekw, ea1, ea2, ea4 und der Seitenstelle el des Seed-Plans OpenR: kein `[data-griff]` und nicht die Leiste schneidet `[data-karte]`, `[data-einheit]` oder `[data-sechseck]`; der Einklapp-Umschalter der gewählten Karte bleibt treffbar (Phase-3 Review Focus 6, dort in U1 entfallen). Bei 390 × 844 liegen „Bearbeiten" und „+ Unterstelle" ganz im Bildschirm. Gepinnt im e2e (Task 21).
9. **Angriffe auf die Laufzeit des Uploads** — eine Datei mit 100 000 Leerzeichen oder 100 000 Kommentaren vor einem Nicht-SVG, ein `<style>` aus 60 000 Zeichen ohne Klammer, ein Attribut aus `url(`-Wiederholungen → jeweils Ablehnung bzw. Ergebnis in unter einer Sekunde, nie Minuten auf dem Request-Thread. Gepinnt in `logoTyp.test.ts` (Task 2) und `svg.test.ts` (Task 3).

---

## Dateistruktur

Im Folgenden steht `K` für `src/app/m/kommplan`.

```
K/
├── _db/
│   ├── schema.ts                       geändert: Tabelle briefkopf
│   └── migrations/0002_briefkopf.sql   NEU (generiert + Trigger von Hand)
├── _lib/
│   ├── logo/                           NEU, rein
│   │   ├── logoTyp.ts                  LOGO_MAX_BYTES, LOGO_TYPEN, erkenneLogoTyp, pruefeLogoDatei
│   │   └── svg.ts                      bereinigeSvg
│   ├── logoScan.ts                     NEU (Server): avKonfigAusEnv, scanWurzel, scanneLogo
│   ├── briefkopf.ts                    NEU (Server): ladeBriefkopf, kopfFuerZeichnung, setzeOrganisation, speichereLogo, entferneLogo
│   ├── herkunft.ts                     NEU (rein): gleicheHerkunft
│   ├── rahmen.ts                       geändert: Organisation/Logo aus dem Briefkopf, kein Literal
│   ├── tagesfassung.ts                 NEU (rein): heuteIso, ersetzeDatumImTitel, titelFuerKopie
│   ├── plaene.ts                       geändert: Liste (plaene|vorlagen|archiv), ladePlanLesend(Oder404)
│   ├── planverwaltung.ts               NEU (Server): dupliziere, setzeVorlage, archiviere, stelleWiederHer, vorlagenZurAuswahl
│   ├── speichern.ts                    geändert: legePlanAn kopiert eine Vorlage
│   ├── ergebnis.ts                     geändert: EinfachErgebnis, LogoErgebnis, BibErgebnis, ImportErgebnis
│   ├── zugang.ts                       geändert: pruefeKommplanBearbeiten
│   ├── seedLokal.ts                    geändert: Briefkopf „Musterorganisation", kein Logo
│   ├── beispiele/label.ts, openr20220701.ts  geändert: Bearbeiter ohne Organisationsnamen
│   ├── bibliothek/                     NEU, rein
│   │   ├── typen.ts                    BibStelle, BibEinheit, BibVerbindung, Bibliothek, LEERE_BIBLIOTHEK, vergleichsform, passt
│   │   ├── schema.ts                   BIB_GRENZE, bibStelleSchema, bibEinheitSchema, bibVerbindungSchema, bibImportSchema
│   │   ├── csv.ts                      dekodiereText, leseCsv, leseEinheitenCsv, einheitenAusListe
│   │   └── vorschau.ts                 importVorschau
│   ├── bibliothekDb.ts                 NEU (Server): ladeBibliothek, speichereBib*, loescheBibEintrag, importiereBibEinheiten,
│   │                                                  importiereBibVerbindungen
│   └── plan/bibliothek.ts              NEU (rein): uebernimmBibStelle, fuegeBibEinheitenEin, verbindeMitBibVerbindung,
│                                                   bibVerbindungenFuerPlan, stelleVorschlaege, bibStelleAus
├── _actions/
│   ├── briefkopf.ts                    NEU: speichereOrganisationAction, entferneLogoAction
│   ├── verwaltung.ts                   NEU: dupliziereAction, setzeVorlageAction, archiviereAction, stelleWiederHerAction
│   └── bibliothek.ts                   NEU: speichereBibStelleAction, speichereBibEinheitAction, speichereBibVerbindungAction,
│                                            loescheBibEintragAction, importiereBibEinheitenAction, importiereBibVerbindungenAction
├── logo/route.ts                       NEU: POST /logo (Upload/Ersetzen)
├── (intern)/
│   ├── page.tsx                        geändert: Pläne + Vorlagen, Links im Seitenkopf
│   ├── PlanTabelle.tsx                 geändert: Liste, Aktionen-Menü je Zeile, Hinweis
│   ├── NeuerPlan.tsx                   geändert: Feld „Vorlage", Prop heute
│   ├── archiv/page.tsx                 NEU
│   ├── p/[id]/layout.tsx               geändert: ladePlanLesendOder404
│   ├── p/[id]/page.tsx                 geändert: archiviert → Betrachter mit Hinweis; Bibliothek an den Editor; ?kopie=1
│   ├── p/[id]/Wiederherstellen.tsx     NEU ("use client")
│   ├── p/[id]/druck/a4/page.tsx        geändert: Briefkopf, Druckblaetter
│   └── (verwaltung)/                   NEU
│       ├── layout.tsx
│       ├── bibliothek/page.tsx
│       └── einstellungen/page.tsx
├── _ui/
│   ├── kommplan.css                    geändert
│   ├── zeichnung/Blatt.tsx             geändert: BlattKopf, LogoDefs, LOGO_ID; kein rotes Kreuz
│   ├── zeichnung/Druckblaetter.tsx     NEU (rein)
│   ├── zeichnung/farben.ts             geändert: ohne `marke`
│   ├── einstellungen/Briefkopf.tsx     NEU ("use client"): Organisation, Logo hochladen/ersetzen/entfernen
│   ├── einstellungen/KopfVorschau.tsx  NEU (rein): Vorschau des Kopfs
│   ├── bibliothek/                     NEU ("use client")
│   │   ├── Bibliothek.tsx              Reiter, Symbolvorrat
│   │   ├── StellenBereich.tsx
│   │   ├── EinheitenBereich.tsx        inkl. Liste einfügen, CSV, Vorschau
│   │   ├── VerbindungenBereich.tsx
│   │   └── ImportVorschau.tsx
│   ├── editor/bibliothekKontext.tsx    NEU ("use client"): BibliothekKontext, BibliothekAnbieter (bib, merke)
│   ├── editor/Editor.tsx               geändert: Bibliothek, GRIFF_RAND, platzOben, Hinweis mit Aktion, startHinweis
│   ├── editor/Griffe.tsx               geändert: Auswahlrahmen + Auswahlleiste (Griffe.test.tsx ersetzt)
│   ├── editor/StelleFlyin.tsx          geändert: Aus Bibliothek, Titelvorschläge, In Bibliothek übernehmen/aktualisieren
│   ├── editor/EinheitenListe.tsx       geändert: Aus Bibliothek, Einheiten in Bibliothek übernehmen
│   ├── editor/PlanFlyin.tsx            geändert: Verbindungen in Bibliothek übernehmen
│   ├── editor/VerbindungWahl.tsx       geändert: Bibliotheksverbindungen
│   ├── betrachter/Flaeche.tsx          geändert: platzOben, Auswahlleiste in `ausgenommen`
│   └── gliederung/
│       ├── tasten.ts                   geändert: Alt+Enter → bibliothek
│       ├── verbindungsOptionen.ts      geändert: Bibliotheksoptionen
│       ├── VerbindungFeld.tsx          geändert: ~bib:-Wahl
│       ├── TitelVorschlaege.tsx        NEU
│       ├── GliederungZeile.tsx         geändert: Vorschläge an der aktiven Zeile
│       └── Gliederung.tsx              geändert: Befehl bibliothek, Abgleich nach dem Einfügen
├── grenze.test.ts, riegel.test.ts      geändert
e2e/kommplan-bibliothek.spec.ts         NEU
e2e/kommplan-verwaltung.spec.ts         NEU (Vorlagen, Duplizieren, Archiv, Briefkopf)
e2e/kommplan-editor.spec.ts             geändert (Auswahlleiste)
```

Geändert außerhalb des Moduls: `compose.yaml`, `Dockerfile`, `.env.example`, `playwright.config.ts`, `src/app/m/files/_lib/compose.test.ts`, `src/core/audit/catalog.ts`, `src/core/audit/coverage-manifest.json`, `src/app/m/portal/admin/audit/labels.ts`, `e2e/gruppen.json`, `scripts/kommplan-vorschau.ts`, die Spec (§4.1, §4.4, §6.3, §6.7, §8.3), die Release-Notiz.

---
### Task 1: Tabelle `briefkopf` — Migration, Audit, Katalog

**Files:**
- Modify: `src/app/m/kommplan/_db/schema.ts` (Tabelle `briefkopf`, Import `blob`)
- Create: `src/app/m/kommplan/_db/migrations/0002_briefkopf.sql` (generiert, Trigger von Hand angehängt), `…/meta/0002_snapshot.json`, `…/meta/_journal.json` (generiert)
- Modify: `src/core/audit/catalog.ts` (Eintrag `briefkopf` unter `kommplan`), `src/app/m/portal/admin/audit/labels.ts` (`briefkopf: "Briefkopf (Kommunikationspläne)"`)
- Test: `src/app/m/kommplan/_db/schema.test.ts`; `src/core/audit/catalog.test.ts` läuft unverändert mit

**Interfaces:**
- Produces: `briefkopf` (Drizzle-Tabelle) mit Spalten `id` (int, PK, immer 1), `organisation` (text|null), `logo` (`Buffer`|null, `blob("logo", { mode: "buffer" })`), `logoMime` (text|null), `logoSha256` (text|null), `aktualisiertAm` (Date), `aktualisiertVon` (text). `export type BriefkopfZeile = typeof briefkopf.$inferSelect;`

- [ ] **Step 1: Failing Tests schreiben**

In `src/app/m/kommplan/_db/schema.test.ts` den Import aus `./schema` um `briefkopf` erweitern und im `describe` anfügen:

```ts
  it("Briefkopf: genau eine Zeile (id = 1), Logo nur vollständig und höchstens 1 MB", () => {
    const db = testDb();
    const basis = { id: 1, organisation: null, aktualisiertAm: new Date(0), aktualisiertVon: "Alice" };
    db.insert(briefkopf).values(basis).run();
    expect(() => db.insert(briefkopf).values({ ...basis, id: 2 }).run()).toThrow();
    expect(() => db.update(briefkopf).set({ logo: Buffer.from("x") }).where(eq(briefkopf.id, 1)).run()).toThrow(); // ohne Typ und SHA
    expect(() => db.update(briefkopf).set({ logo: Buffer.from("x"), logoMime: "image/gif", logoSha256: "a" }).where(eq(briefkopf.id, 1)).run()).toThrow();
    expect(() => db.update(briefkopf).set({ logo: Buffer.alloc(1024 * 1024 + 1), logoMime: "image/png", logoSha256: "a" }).where(eq(briefkopf.id, 1)).run()).toThrow();
    db.update(briefkopf).set({ logo: Buffer.from("x"), logoMime: "image/png", logoSha256: "a" }).where(eq(briefkopf.id, 1)).run();
    expect(db.select().from(briefkopf).get()?.logo?.toString()).toBe("x");
  });
  it("Briefkopf: Anlegen, Logo und Name je eine Audit-Zeile; ein No-op nicht", () => {
    const db = testDb();
    db.insert(briefkopf).values({ id: 1, organisation: "Muster", aktualisiertAm: new Date(0), aktualisiertVon: "Alice" }).run();
    db.update(briefkopf).set({ organisation: "Muster" }).where(eq(briefkopf.id, 1)).run();
    db.update(briefkopf).set({ logo: Buffer.from("x"), logoMime: "image/png", logoSha256: "a" }).where(eq(briefkopf.id, 1)).run();
    db.update(briefkopf).set({ logo: Buffer.from("y"), logoSha256: "b" }).where(eq(briefkopf.id, 1)).run();
    expect(outbox(db).filter((z) => z.object_type === "briefkopf").map((z) => z.action)).toEqual(["create", "update", "update"]);
  });
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_db/schema.test.ts`
Expected: FAIL — `briefkopf` wird nicht exportiert.

- [ ] **Step 3: Schema ergänzen**

In `src/app/m/kommplan/_db/schema.ts` den Import auf `import { blob, check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";` erweitern und vor `export type PlanZeile` einfügen:

```ts
/**
 * BRIEFKOPF (Spec §4.4; Umsetzungsplan Phase 4, Entscheidung 2): Organisationsname und Logo stehen nicht im
 * Code (A10), sondern genau hier — eine Zeile, erzwungen über `id = 1`. Ohne Zeile oder mit leeren Feldern
 * bleibt die Stelle im Kopf der Zeichnung leer. Das Logo ist schon geprüft, gescannt und (SVG) bereinigt,
 * wenn es hier ankommt (`_lib/briefkopf.ts`, `speichereLogo`). Alle Spalten sind auditiert, auch der Blob.
 */
export const briefkopf = sqliteTable("briefkopf", {
  id: integer("id").primaryKey(),
  organisation: text("organisation"),
  logo: blob("logo", { mode: "buffer" }),
  logoMime: text("logo_mime"),
  logoSha256: text("logo_sha256"),
  aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp_ms" }).notNull(),
  aktualisiertVon: text("aktualisiert_von").notNull(),
}, (t) => [
  check("briefkopf_eine_zeile", sql`${t.id} = 1`),
  check("briefkopf_logo_vollstaendig", sql`(${t.logo} IS NULL AND ${t.logoMime} IS NULL AND ${t.logoSha256} IS NULL) OR (${t.logo} IS NOT NULL AND ${t.logoMime} IN ('image/png','image/jpeg','image/webp','image/svg+xml') AND ${t.logoSha256} IS NOT NULL)`),
  check("briefkopf_logo_groesse", sql`${t.logo} IS NULL OR length(${t.logo}) <= 1048576`),
]);
export type BriefkopfZeile = typeof briefkopf.$inferSelect;
```

Den Kopfkommentar der Datei („Oberfläche für Bibliothek und Freigaben folgt in Phase 4 und 5.") **in derselben Zeile** auf „Oberfläche für Bibliothek (Phase 4) und Freigaben (Phase 5); der Briefkopf kam in Phase 4 dazu." kürzen (Zeilenzahl gleich).

- [ ] **Step 4: Migration erzeugen und Trigger anhängen**

```bash
pnpm exec drizzle-kit generate --config src/app/m/kommplan/_db/drizzle.config.ts --name briefkopf
```

Expected: `src/app/m/kommplan/_db/migrations/0002_briefkopf.sql` mit genau einem `CREATE TABLE \`briefkopf\`` (samt der drei `CONSTRAINT … CHECK`). Erzeugt drizzle-kit mehr (etwa ein Umbau anderer Tabellen), abbrechen und die Ursache klären — dann stimmt der Snapshot nicht.

Vor das `CREATE TABLE` einen Kopfkommentar setzen und ans Ende von Hand anhängen (Vorbild `0001_plan_bearbeitung.sql`):

```sql
-- DRK-500, Umsetzungsplan Phase 4, Entscheidung 2: Briefkopf (Spec §4.4).
--
-- TRIGGER HANDGESCHRIEBEN: `drizzle-kit generate` kennt die Audit-Trigger nicht. Das WHEN der
-- Änderung zählt JEDE Spalte auf, auch den Blob — Hochladen, Ersetzen, Entfernen und jede
-- Namensänderung sind je eine Audit-Zeile; ein No-op-Update keine (`catalog.test.ts`).
```

```sql
--> statement-breakpoint
CREATE TRIGGER audit_briefkopf_create AFTER INSERT ON "briefkopf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'briefkopf', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_briefkopf_update AFTER UPDATE ON "briefkopf"
WHEN OLD."id" IS NOT NEW."id" OR OLD."organisation" IS NOT NEW."organisation" OR OLD."logo" IS NOT NEW."logo" OR OLD."logo_mime" IS NOT NEW."logo_mime" OR OLD."logo_sha256" IS NOT NEW."logo_sha256" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am" OR OLD."aktualisiert_von" IS NOT NEW."aktualisiert_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'briefkopf', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_briefkopf_delete AFTER DELETE ON "briefkopf"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'briefkopf', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
```

- [ ] **Step 5: Audit-Katalog und Label**

In `src/core/audit/catalog.ts` unter `"kommplan"` nach `"plan_freigabe": { … }` (Komma beachten) einfügen:

```ts
    "briefkopf": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    }
```

In `src/app/m/portal/admin/audit/labels.ts` in der kommplan-Zeile (dieselbe Zeile, kein Umbruch) hinter `plan_freigabe:"Freigabelink eines Plans",` ergänzen: `briefkopf:"Briefkopf (Kommunikationspläne)",`.

- [ ] **Step 6: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_db/schema.test.ts src/core/audit/catalog.test.ts src/core/bootstrap.test.ts`
Expected: PASS. `catalog.test.ts` prüft für `kommplan`: Tabellen = Katalog = Schema, drei Trigger, WHEN über alle Spalten.

- [ ] **Step 7: Typecheck, Ankerschritt, Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
for f in schema.ts catalog.ts labels.ts; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
pnpm anker:drift src/core/audit/catalog.ts
git add src/app/m/kommplan/_db src/core/audit/catalog.ts src/app/m/portal/admin/audit/labels.ts
git commit -S -m "feat(kommplan): Tabelle für den Briefkopf mit Logo und Organisation

Eine Zeile (id = 1) für Organisationsname und Logo, Logo nur vollständig
und höchstens 1 MB. Jede Änderung, auch am Logo, ist eine Audit-Zeile.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Logo-Typ aus den ersten Bytes

**Files:**
- Create: `src/app/m/kommplan/_lib/logo/logoTyp.ts`
- Test: `src/app/m/kommplan/_lib/logo/logoTyp.test.ts`
- Modify: `src/app/m/kommplan/grenze.test.ts` (Liste der geteilten Ordner um `"_lib/logo/"`, `"_lib/bibliothek/"`, `"_lib/tagesfassung.ts"`, `"_lib/herkunft.ts"` erweitern — die Ordner entstehen in Tasks 2, 3, 10, 14; der Test filtert nur vorhandene Dateien)

**Interfaces:**
- Produces: `LOGO_MAX_BYTES = 1_048_576`; `LOGO_TYPEN = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const`; `type LogoTyp`; `LOGO_TYP_NAME: Record<LogoTyp, string>` (PNG, JPEG, WebP, SVG); `LOGO_ANNAHME` (Wert für `accept`); `LOGO_FEHLER = { leer, gross, typ }`; `erkenneLogoTyp(b: Uint8Array): LogoTyp | null`; `type LogoPruefung = { ok: true; typ: LogoTyp } | { ok: false; fehler: string }`; `pruefeLogoDatei(b: Uint8Array): LogoPruefung`.

- [ ] **Step 1: Failing Test schreiben**

`src/app/m/kommplan/_lib/logo/logoTyp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { erkenneLogoTyp, LOGO_FEHLER, LOGO_MAX_BYTES, pruefeLogoDatei } from "./logoTyp";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16);
const WEBP = new Uint8Array([...text("RIFF"), 1, 2, 3, 4, ...text("WEBPVP8 ")]);

describe("Logo-Typ allein aus den Bytes (Spec §4.4)", () => {
  it("erkennt PNG, JPEG, WebP an der Signatur", () => {
    expect(erkenneLogoTyp(PNG)).toBe("image/png");
    expect(erkenneLogoTyp(JPEG)).toBe("image/jpeg");
    expect(erkenneLogoTyp(WEBP)).toBe("image/webp");
  });
  it("erkennt SVG mit BOM, XML-Deklaration, Kommentar und DOCTYPE davor", () => {
    expect(erkenneLogoTyp(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe("image/svg+xml");
    expect(erkenneLogoTyp(new Uint8Array([0xef, 0xbb, 0xbf, ...text('\n  <?xml version="1.0"?>\n<!-- Logo -->\n<svg viewBox="0 0 1 1"></svg>')]))).toBe("image/svg+xml");
    expect(erkenneLogoTyp(text('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x"><svg/>'))).toBe("image/svg+xml"); // die Bereinigung lehnt ab
  });
  it("lehnt ab, was nur so heißt: GIF, PDF, RIFF/WAVE, HTML mit svg, Text, ungültiges UTF-8, leer", () => {
    expect(erkenneLogoTyp(text("GIF89a……"))).toBeNull();
    expect(erkenneLogoTyp(text("%PDF-1.7"))).toBeNull();
    expect(erkenneLogoTyp(new Uint8Array([...text("RIFF"), 1, 2, 3, 4, ...text("WAVEfmt ")]))).toBeNull();
    expect(erkenneLogoTyp(text("<html><body><svg></svg></body></html>"))).toBeNull();
    expect(erkenneLogoTyp(text("Hallo <svg>"))).toBeNull();
    expect(erkenneLogoTyp(bytes(0x3c, 0x73, 0x76, 0x67, 0x20, 0xc3, 0x28))).toBeNull(); // "<svg " + kaputtes UTF-8
    expect(erkenneLogoTyp(new Uint8Array())).toBeNull();
    expect(erkenneLogoTyp(text("<svgx/>"))).toBeNull();
  });
  it("prüft Größe vor Typ: leer, über 1 MB (1 048 576 Byte), genau 1 MB geht", () => {
    expect(pruefeLogoDatei(new Uint8Array())).toEqual({ ok: false, fehler: LOGO_FEHLER.leer });
    const gross = new Uint8Array(LOGO_MAX_BYTES + 1); gross.set(PNG);
    expect(pruefeLogoDatei(gross)).toEqual({ ok: false, fehler: LOGO_FEHLER.gross });
    const genau = new Uint8Array(LOGO_MAX_BYTES); genau.set(PNG);
    expect(pruefeLogoDatei(genau)).toEqual({ ok: true, typ: "image/png" });
    expect(pruefeLogoDatei(text("GIF89a"))).toEqual({ ok: false, fehler: LOGO_FEHLER.typ });
  });
  it("Vorspann in linearer Zeit: viel Leerraum, viele Kommentare oder Deklarationen vor einem Nicht-SVG blockieren den Server nicht", () => {
    // Ein Regex mit wiederholter Gruppe über `\s+` oder `<!--[\s\S]*?-->` läuft hier exponentiell (Kritik: 26 Leerzeichen
    // ≈ 0,5 s; selbst gemessen: 30 000 Kommentare lief nach zwei Minuten noch). Die Größen sind so gewählt, dass der alte Weg viele Sekunden bräuchte.
    for (const eingabe of [" ".repeat(100_000) + "x", "<!-- a -->".repeat(100_000) + "x", "<?xml ?>".repeat(100_000) + "x", "<!--".repeat(100_000)]) {
      const start = performance.now();
      expect(erkenneLogoTyp(text(eingabe))).toBeNull();
      expect(performance.now() - start).toBeLessThan(1000);
    }
    expect(erkenneLogoTyp(text(`${"<!-- a -->\n".repeat(1000)}<svg/>`))).toBe("image/svg+xml");
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/logo/logoTyp.test.ts`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_lib/logo/logoTyp.ts`:

```ts
/**
 * LOGO-PRÜFUNG, TEIL 1 (Spec §4.4; Umsetzungsplan Phase 4, Entscheidung 5): Größe und Typ — der Typ allein
 * aus den ersten Bytes, nie aus Dateiname oder `Content-Type` (beides frei wählbar). Rein: Server und Test;
 * die Oberfläche liest nur die Konstanten. SVG ist Text: gültiges UTF-8, dessen erstes Element `<svg` ist —
 * ein HTML-Dokument mit eingebettetem `<svg>` ist kein SVG. Ob ein SVG sicher ist, entscheidet `svg.ts`.
 */
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPEN = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export type LogoTyp = (typeof LOGO_TYPEN)[number];
export const LOGO_TYP_NAME: Record<LogoTyp, string> = { "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP", "image/svg+xml": "SVG" };
/** Für `accept` am Dateifeld — nur eine Vorauswahl im Dialog, geprüft wird hier. */
export const LOGO_ANNAHME = ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml";
export const LOGO_FEHLER = {
  leer: "Die Datei ist leer.",
  gross: "Das Logo darf höchstens 1 MB groß sein.",
  typ: "Erlaubt sind PNG, JPEG, WebP und SVG.",
} as const;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const LEER = /\s/;

/**
 * Vor dem ersten Element dürfen nur Leerraum, die XML-Deklaration, Kommentare und ein DOCTYPE stehen. Bewusst
 * KEIN Regex: eine wiederholte Gruppe über `\s+` oder `<!--[\s\S]*?-->` verfolgt bei einer Datei, die am Ende
 * doch nicht passt, exponentiell viele Zerlegungen — synchron, vor dem Scan, auf dem einzigen Node-Thread. Hier
 * springt `indexOf` von Ende zu Ende: linear in der Länge (`logoTyp.test.ts`, „Vorspann in linearer Zeit").
 */
function beginntMitSvg(text: string): boolean {
  let i = 0;
  for (;;) {
    while (i < text.length && LEER.test(text[i])) i++;
    const ende = text.startsWith("<?xml", i) ? "?>" : text.startsWith("<!--", i) ? "-->"
      : text.slice(i, i + 9).toUpperCase() === "<!DOCTYPE" ? ">" : null;
    if (ende === null) return text.startsWith("<svg", i) && /[\s>/]/.test(text[i + 4] ?? "");
    const e = text.indexOf(ende, i + 2);
    if (e < 0) return false;
    i = e + ende.length;
  }
}

function beginntMit(b: Uint8Array, signatur: number[], ab = 0): boolean {
  return b.length >= ab + signatur.length && signatur.every((x, i) => b[ab + i] === x);
}

function istSvg(b: Uint8Array): boolean {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return false; } // BOM fällt dabei weg
  return beginntMitSvg(text);
}

export function erkenneLogoTyp(b: Uint8Array): LogoTyp | null {
  if (beginntMit(b, PNG)) return "image/png";
  if (beginntMit(b, JPEG)) return "image/jpeg";
  if (beginntMit(b, RIFF) && beginntMit(b, WEBP, 8)) return "image/webp";
  if (istSvg(b)) return "image/svg+xml";
  return null;
}

export type LogoPruefung = { ok: true; typ: LogoTyp } | { ok: false; fehler: string };

export function pruefeLogoDatei(b: Uint8Array): LogoPruefung {
  if (b.length === 0) return { ok: false, fehler: LOGO_FEHLER.leer };
  if (b.length > LOGO_MAX_BYTES) return { ok: false, fehler: LOGO_FEHLER.gross };
  const typ = erkenneLogoTyp(b);
  return typ === null ? { ok: false, fehler: LOGO_FEHLER.typ } : { ok: true, typ };
}
```

In `src/app/m/kommplan/grenze.test.ts` im Test „geteilte Ordner sind rein" das Array um `"_lib/logo/", "_lib/bibliothek/", "_lib/tagesfassung.ts", "_lib/herkunft.ts"` ergänzen (dieselbe Zeile).

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/logo/ src/app/m/kommplan/grenze.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
git grep -n "grenze.test.ts:[0-9]" -- src scripts e2e docs
git add src/app/m/kommplan/_lib/logo src/app/m/kommplan/grenze.test.ts
git commit -S -m "feat(kommplan): Logo-Typ allein aus den ersten Bytes

PNG, JPEG, WebP an der Signatur, SVG als gültiges UTF-8 mit svg als erstem
Element; höchstens 1 MB. Dateiname und Content-Type zählen nicht.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: SVG-Bereinigung als reine Funktion mit Angriffstests

**Files:**
- Create: `src/app/m/kommplan/_lib/logo/svg.ts`
- Test: `src/app/m/kommplan/_lib/logo/svg.test.ts`

**Interfaces:**
- Produces: `type SvgErgebnis = { ok: true; svg: string } | { ok: false; grund: string }`; `bereinigeSvg(eingabe: string): SvgErgebnis`. `grund` ist ein deutscher Satz für die Oberfläche (Task 5 setzt ihn hinter „Das SVG lässt sich nicht sicher übernehmen: ").

- [ ] **Step 1: Failing Tests schreiben**

`src/app/m/kommplan/_lib/logo/svg.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bereinigeSvg } from "./svg";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const RECT = '<rect width="10" height="10" fill="#e30613"/>';
const svg = (innen: string, attr = 'viewBox="0 0 10 10"') => `<svg ${NS} ${attr}>${innen}</svg>`;
function gut(eingabe: string): string {
  const r = bereinigeSvg(eingabe);
  if (!r.ok) throw new Error(`abgelehnt: ${r.grund}`);
  expect(bereinigeSvg(r.svg)).toEqual(r); // idempotent: die Ausgabe ist ihr eigener Fixpunkt
  return r.svg;
}
function abgelehnt(eingabe: string): string {
  const r = bereinigeSvg(eingabe);
  if (r.ok) throw new Error(`angenommen: ${r.svg}`);
  return r.grund;
}
/** Was nach der Bereinigung nie mehr vorkommen darf, gleich in welcher Schreibweise. */
const SCHAEDLICH = /script|foreignobject|onload|onclick|onerror|@import|evil\.example|<a[\s>]|<animate|<set[\s/>]|<iframe|data:image\/svg/i; // „http:“ nicht: xmlns trägt es zu Recht

describe("bereinigeSvg — was gefährlich ist, fällt", () => {
  it.each([
    ["script-Element", svg(`${RECT}<script>alert(1)</script>`)],
    ["script mit CDATA", svg(`${RECT}<script><![CDATA[alert(1)]]></script>`)],
    ["svg:script mit Präfix", `<svg ${NS} xmlns:svg="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${RECT}<svg:script>alert(1)</svg:script></svg>`],
    ["foreignObject", svg(`${RECT}<foreignObject><iframe src="https://x"/></foreignObject>`)],
    ["FOREIGNOBJECT groß", svg(`${RECT}<FOREIGNOBJECT><b>x</b></FOREIGNOBJECT>`)],
    ["foreignobject klein", svg(`${RECT}<foreignobject/>`)],
    ["onload an der Wurzel", `<svg ${NS} viewBox="0 0 10 10" onload="alert(1)">${RECT}</svg>`],
    ["ONCLICK groß", svg(`<rect width="10" height="10" ONCLICK="alert(1)"/>`)],
    ["a mit javascript:", svg(`${RECT}<a href="javascript:alert(1)"><text>x</text></a>`)],
    ["use auf fremde Datei", svg(`${RECT}<use href="https://evil.example/s.svg#a"/>`)],
    ["xlink:href javascript entitätskodiert", `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">${RECT}<use xlink:href="&#106;avascript:alert(1)"/></svg>`],
    ["javascript mit Tab und Zeilenumbruch", svg(`<rect width="10" height="10" fill="java&#9;scr&#10;ipt:alert(1)"/>`)],
    ["image mit data:image/svg+xml", svg(`${RECT}<image width="5" height="5" href="data:image/svg+xml;base64,PHN2Zy8+"/>`)],
    ["image von außen", svg(`${RECT}<image width="5" height="5" xlink:href="http://evil.example/x.png"/>`, `viewBox="0 0 10 10" xmlns:xlink="http://www.w3.org/1999/xlink"`)],
    ["animate setzt href", svg(`<a href="#x"><rect width="10" height="10"><animate attributeName="href" to="javascript:alert(1)"/></rect></a>${RECT}`)],
    ["set setzt href", svg(`${RECT}<set attributeName="href" to="javascript:alert(1)"/>`)],
    ["style @import", svg(`<style>@import url(http://evil.example/x.css); .a{fill:#e30613}</style><rect class="a" width="10" height="10"/>`)],
    ["url() nach außen im style-Attribut", svg(`<rect width="10" height="10" style="fill:url(http://evil.example/p.svg#x);stroke:#000"/>`)],
    ["url() nach außen im fill", svg(`${RECT}<rect width="1" height="1" fill="url('https://evil.example/#g')"/>`)],
    ["xml-stylesheet", `<?xml version="1.0"?><?xml-stylesheet href="http://evil.example/x.css"?>${svg(RECT)}`],
  ])("%s", (_name, eingabe) => {
    const aus = gut(eingabe);
    expect(aus).not.toMatch(SCHAEDLICH);
    expect(aus).toContain("<rect");
  });

  it("DOCTYPE und ENTITY lehnen die ganze Datei ab (XXE, Entitäten-Bombe)", () => {
    expect(abgelehnt(`<!DOCTYPE svg [<!ENTITY a "aaaa">]>${svg(RECT)}`)).toMatch(/DOCTYPE/);
    expect(abgelehnt(`<?xml version="1.0"?>\n<!doctype svg>${svg(RECT)}`)).toMatch(/DOCTYPE/);
  });
  it("kaputtes XML lehnt ab: Attribut ohne Anführungszeichen, doppelt, offenes Element, unbekannte Entität, nacktes &", () => {
    expect(abgelehnt(`<svg ${NS} viewBox="0 0 10 10"><rect width=10 height="10"/></svg>`)).toMatch(/Anführungszeichen/);
    expect(abgelehnt(`<svg ${NS} viewBox="0 0 10 10"><rect width="1" width="2" height="1"/></svg>`)).toMatch(/doppelt/);
    expect(abgelehnt(`<svg ${NS} viewBox="0 0 10 10"><g>${RECT}</svg>`)).toMatch(/passt nicht|geschlossen/);
    expect(abgelehnt(svg(`<text>&nbsp;</text>${RECT}`))).toMatch(/Entität/);
    expect(abgelehnt(svg(`<text>A & B</text>${RECT}`))).toMatch(/&/);
  });
  it("ohne svg-Wurzel, ohne Maß oder ohne etwas zu Zeichnen: abgelehnt", () => {
    expect(abgelehnt(`<svg:svg xmlns:svg="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><svg:rect width="1" height="1"/></svg:svg>`)).toMatch(/Wurzel/);
    expect(abgelehnt(`<svg ${NS} width="100%" height="50%">${RECT}</svg>`)).toMatch(/viewBox/);
    expect(abgelehnt(svg("<script>alert(1)</script>"))).toMatch(/nichts zu zeichnen/);
    expect(abgelehnt(`<html>${svg(RECT)}</html>`)).toMatch(/Wurzel/);
  });
  it("zu tief verschachtelt (über 256 Ebenen): abgelehnt statt Stapelüberlauf", () => {
    expect(abgelehnt(svg(`${"<g>".repeat(300)}${RECT}${"</g>".repeat(300)}`))).toMatch(/verschachtelt/);
  });
});

describe("bereinigeSvg — lineare Laufzeit (Upload-Thread; Review Focus 9)", () => {
  // Die Größen sind so gewählt, dass die alten Regexe (`([^{}]+)\{…\}`, `/\*[\s\S]*?\*\/`, `url\s*\(…\)`) quadratisch
  // viele Sekunden bräuchten (gemessen: 40 000 Zeichen ohne Klammer ≈ 0,8 s, 10 000 × `url(` ≈ 0,7 s — 250 000 × ein
  // Vielfaches); die Grenze von 1 s hält auch unter hoher Last.
  const schnell = (f: () => void) => { const t = performance.now(); f(); expect(performance.now() - t).toBeLessThan(1000); };
  it("kaputtes <style> ohne Klammern, mit offenem Kommentar und offenen @-Regeln", () => {
    for (const css of ["a".repeat(60_000), "/*".repeat(30_000), "@".repeat(60_000), "a{".repeat(30_000)]) {
      schnell(() => { const r = bereinigeSvg(svg(`<style>${css}</style>${RECT}`)); expect(r.ok).toBe(true); });
    }
  });
  it("<style> über 64 KB: abgelehnt mit Grund", () => {
    expect(abgelehnt(svg(`<style>.a{fill:#000}${" ".repeat(64 * 1024)}</style>${RECT}`))).toMatch(/style.*64 KB/);
  });
  it("Attribut aus 250 000 × „url(“ und ein riesiges d bleiben linear", () => {
    schnell(() => { expect(gut(svg(`<rect width="1" height="1" fill="${"url(".repeat(250_000)}"/>${RECT}`))).not.toContain("url("); });
    schnell(() => { expect(gut(svg(`<path d="M0 0${" l1 1".repeat(150_000)}"/>`))).toContain("<path"); });
  });
});

describe("bereinigeSvg — ein echtes Logo bleibt, wie es aussieht (Review Focus 1)", () => {
  it("Illustrator: style-Element mit Klassen und CDATA, Metadaten, Kommentar, BOM", () => {
    const ai = `﻿<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Adobe Illustrator -->
<svg version="1.1" id="Ebene_1" ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 200 60" xml:space="preserve">
<style type="text/css"><![CDATA[ .st0{fill:#E30613;} .st1{fill:#1D1D1B;font-family:Arial;} ]]></style>
<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata>
<path class="st0" d="M0 0h60v60H0z"/><text class="st1" x="70" y="40">Muster &amp; Co</text>
</svg>`;
    const aus = gut(ai);
    expect(aus).toContain(".st0{fill:#E30613}");
    expect(aus).toContain('class="st0"');
    expect(aus).toContain("Muster &amp; Co");
    expect(aus).not.toMatch(/metadata|rdf:|Generator|type="text\/css"/);
    expect(aus.startsWith(`<svg `)).toBe(true);
  });
  it("Inkscape: sodipodi/inkscape fallen samt Attributen, Verlauf über url(#id) und use über #id bleiben", () => {
    const ink = `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="120" height="40" inkscape:version="1.3">
<sodipodi:namedview id="nv"/><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient><rect id="r" width="5" height="5"/></defs>
<g inkscape:label="Ebene 1" inkscape:groupmode="layer"><rect width="120" height="40" fill="url(#g)"/><use xlink:href="#r" x="3"/></g></svg>`;
    const aus = gut(ink);
    expect(aus).toContain('viewBox="0 0 120 40"'); // aus Breite und Höhe ergänzt
    expect(aus).toContain('fill="url(#g)"');
    expect(aus).toContain('xlink:href="#r"');
    expect(aus).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(aus).not.toMatch(/sodipodi|inkscape/);
  });
  it("eingebettetes PNG als data:-URI bleibt", () => {
    const aus = gut(svg('<image width="10" height="10" href="data:image/png;base64,iVBORw0KGgo="/>'));
    expect(aus).toContain('href="data:image/png;base64,iVBORw0KGgo="');
  });
  it("Text wird für XML maskiert ausgegeben", () => {
    expect(gut(svg(`<text>&lt;b&gt; &quot;x&quot;</text>${RECT}`))).toContain("<text>&lt;b&gt; \"x\"</text>");
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/logo/svg.test.ts`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_lib/logo/svg.ts`:

```ts
/**
 * SVG-BEREINIGUNG (Spec §4.4; Umsetzungsplan Phase 4, Entscheidung 5) — rein, ohne DOM, ohne Abhängigkeit.
 *
 * ALLOWLIST STATT BLOCKLIST: Elemente und Attribute, die nicht ausdrücklich erlaubt sind, fallen — so trifft
 * jede Schreibweise (`foreignobject`, `FOREIGNOBJECT`) und jedes Präfix (`svg:script`) dieselbe Regel. Ein
 * eigener, STRIKTER Zerleger: nur wohlgeformtes XML ohne DOCTYPE (keine Entitäten außer den fünf
 * vordefinierten, keine XXE, keine Entitäten-Bombe), Attribute nur in Anführungszeichen, keines doppelt.
 * Zeichenreferenzen werden VOR jeder Prüfung aufgelöst (`&#106;avascript:`), Leer- und Steuerzeichen vor
 * der `javascript:`-Prüfung entfernt. Die Ausgabe ist neu geschrieben, nie durchgereicht, und idempotent.
 *
 * `<style>` bleibt, je Deklaration gefiltert: Illustrator setzt Farben über Klassen (`.st0{fill:…}`) — ohne
 * ihn wäre ein Logo schwarz (Review Focus 1). Im Kopf der Zeichnung steht das Logo als `<image>` mit
 * `data:`-URI; dort führt kein Browser Skript aus. Die Bereinigung ist die zweite Linie, nicht die einzige.
 */
export type SvgErgebnis = { ok: true; svg: string } | { ok: false; grund: string };

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const MAX_TIEFE = 256;

const ELEMENTE = new Set([
  "svg", "g", "defs", "symbol", "use", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "title", "desc", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "image", "style",
]);
const ZEICHNEND = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "image", "use"]);
const MIT_TEXT = new Set(["text", "tspan", "title", "desc", "style"]);
/** `href` nur als `#id` — an diesen Elementen; an `image` nur Rasterbilder als `data:`. */
const LOKAL_VERWEISEND = new Set(["use", "linearGradient", "radialGradient", "pattern"]);
const PRAESENTATION = new Set([
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "opacity", "stop-color", "stop-opacity", "clip-path",
  "clip-rule", "mask", "font", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline",
  "letter-spacing", "visibility", "display", "color", "vector-effect",
]);
const ATTRIBUTE = new Set([
  ...PRAESENTATION, "id", "class", "style", "version", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r",
  "x1", "y1", "x2", "y2", "points", "d", "viewBox", "preserveAspectRatio", "transform", "gradientTransform",
  "gradientUnits", "patternUnits", "patternContentUnits", "patternTransform", "clipPathUnits", "maskUnits",
  "maskContentUnits", "offset", "fx", "fy", "fr", "spreadMethod", "dx", "dy", "rotate", "textLength", "lengthAdjust",
]);
const RASTER_DATA = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/;
const LOKAL = /^#[A-Za-z_][\w.:-]*$/;
const NAME = /[A-Za-z_][\w.:-]*/y;
const LEERZEICHEN = /\s/;
/** Deckel für `<style>`-Inhalt: Illustrator-Klassen brauchen ein paar hundert Byte; mehr ist kein Logo. */
const MAX_CSS = 64 * 1024;

class Ungueltig extends Error {}
interface Knoten { name: string; attribute: [string, string][]; kinder: (Knoten | string)[] }

function nameAb(text: string, pos: number): string | null {
  NAME.lastIndex = pos;
  const m = NAME.exec(text);
  return m === null ? null : m[0];
}

const BENANNT: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
function dekodiere(roh: string): string {
  return roh.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);|&/g, (_ganz, e: string | undefined) => {
    if (e === undefined) throw new Ungueltig("Ein „&“ steht ohne Entität.");
    if (e.startsWith("#")) {
      const n = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) throw new Ungueltig("Ungültige Zeichenreferenz.");
      return String.fromCodePoint(n);
    }
    if (!(e in BENANNT)) throw new Ungueltig(`Unbekannte Entität „&${e};“.`);
    return BENANNT[e];
  });
}

const leer = (z: string | undefined) => z !== undefined && /\s/.test(z);

function zerlege(text: string): Knoten {
  const dokument: Knoten = { name: "#dokument", attribute: [], kinder: [] };
  const stapel: Knoten[] = [dokument];
  const oben = () => stapel[stapel.length - 1];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) { oben().kinder.push(dekodiere(text.slice(i))); break; }
    if (lt > i) oben().kinder.push(dekodiere(text.slice(i, lt)));
    if (text.startsWith("<!--", lt)) {
      const e = text.indexOf("-->", lt + 4);
      if (e < 0) throw new Ungueltig("Ein Kommentar wird nicht geschlossen.");
      i = e + 3; continue;
    }
    if (text.startsWith("<![CDATA[", lt)) {
      const e = text.indexOf("]]>", lt + 9);
      if (e < 0) throw new Ungueltig("Ein CDATA-Abschnitt wird nicht geschlossen.");
      oben().kinder.push(text.slice(lt + 9, e)); // wörtlicher Text
      i = e + 3; continue;
    }
    if (text.startsWith("<?", lt)) { // XML-Deklaration und Verarbeitungsanweisungen (xml-stylesheet) fallen weg
      const e = text.indexOf("?>", lt + 2);
      if (e < 0) throw new Ungueltig("Eine Verarbeitungsanweisung wird nicht geschlossen.");
      i = e + 2; continue;
    }
    if (text.startsWith("<!", lt)) throw new Ungueltig("DOCTYPE- und ENTITY-Angaben werden nicht angenommen.");
    if (text.startsWith("</", lt)) {
      const name = nameAb(text, lt + 2);
      if (name === null) throw new Ungueltig("Ein schließendes Element hat keinen Namen.");
      let j = lt + 2 + name.length;
      while (leer(text[j])) j++;
      if (text[j] !== ">") throw new Ungueltig(`</${name}> wird nicht mit „>“ beendet.`);
      const k = stapel.pop();
      if (k === undefined || k === dokument || k.name !== name) throw new Ungueltig(`Schließendes </${name}> passt nicht.`);
      i = j + 1; continue;
    }
    const name = nameAb(text, lt + 1);
    if (name === null) throw new Ungueltig("Ein „<“ steht ohne Elementnamen.");
    const knoten: Knoten = { name, attribute: [], kinder: [] };
    const gesehen = new Set<string>();
    let j = lt + 1 + name.length;
    for (;;) {
      const vor = j;
      while (leer(text[j])) j++;
      if (text.startsWith("/>", j)) { oben().kinder.push(knoten); j += 2; break; }
      if (text[j] === ">") {
        oben().kinder.push(knoten);
        stapel.push(knoten);
        if (stapel.length > MAX_TIEFE + 1) throw new Ungueltig(`Das SVG ist tiefer als ${MAX_TIEFE} Ebenen verschachtelt.`);
        j += 1; break;
      }
      if (j >= text.length) throw new Ungueltig(`<${name}> wird nicht beendet.`);
      if (j === vor) throw new Ungueltig(`In <${name}> fehlt Leerraum zwischen den Attributen.`);
      const a = nameAb(text, j);
      if (a === null) throw new Ungueltig(`Ungültiges Attribut in <${name}>.`);
      j += a.length;
      while (leer(text[j])) j++;
      if (text[j] !== "=") throw new Ungueltig(`Attribut „${a}“ ohne Wert.`);
      j++;
      while (leer(text[j])) j++;
      const q = text[j];
      if (q !== '"' && q !== "'") throw new Ungueltig(`Attribut „${a}“ ohne Anführungszeichen.`);
      const ende = text.indexOf(q, j + 1);
      if (ende < 0) throw new Ungueltig(`Attribut „${a}“ wird nicht geschlossen.`);
      const roh = text.slice(j + 1, ende);
      if (roh.includes("<")) throw new Ungueltig(`„<“ im Wert von „${a}“.`);
      if (gesehen.has(a)) throw new Ungueltig(`Attribut „${a}“ doppelt in <${name}>.`);
      gesehen.add(a);
      knoten.attribute.push([a, dekodiere(roh)]);
      j = ende + 1;
    }
    i = j;
  }
  if (stapel.length !== 1) throw new Ungueltig(`<${oben().name}> wird nicht geschlossen.`);
  return dokument;
}

/** Ohne Leer- und Steuerzeichen, klein — die Form, in der `java\tscript:` als `javascript:` erkannt wird. */
const verdichtet = (w: string) => w.replace(/[\u0000- \u007f-\u009f]+/g, "").toLowerCase();

/**
 * Nur `url(#id)` (oder gar kein `url(`). Jede Fundstelle von „url" einzeln per `indexOf` — linear auch bei
 * `url(url(url(…` ohne „)" (ein Regex `url\s*\(…\)` suchte von jeder Fundstelle bis zum Textende: quadratisch).
 */
function nurLokaleUrls(w: string): boolean {
  const k = w.toLowerCase();
  let i = 0;
  for (;;) {
    const a = k.indexOf("url", i);
    if (a < 0) return true;
    let j = a + 3;
    while (j < k.length && LEERZEICHEN.test(k[j])) j++;
    if (k[j] !== "(") { i = a + 3; continue; }
    const e = k.indexOf(")", j + 1);
    if (e < 0) return false;
    let innen = w.slice(j + 1, e).trim();
    if (innen.length >= 2 && (innen[0] === '"' || innen[0] === "'") && innen.at(-1) === innen[0]) innen = innen.slice(1, -1).trim();
    if (!LOKAL.test(innen)) return false;
    i = e + 1;
  }
}

function bereinigeDeklarationen(css: string): string {
  return css.split(";").flatMap((d) => {
    const i = d.indexOf(":");
    if (i < 0) return [];
    const prop = d.slice(0, i).trim().toLowerCase();
    const wert = d.slice(i + 1).trim();
    if (!PRAESENTATION.has(prop) || wert === "") return [];
    if (/[\\@<>]|expression\s*\(/i.test(wert) || verdichtet(wert).includes("javascript:")) return [];
    if (!nurLokaleUrls(wert)) return [];
    return [`${prop}:${wert}`];
  }).join(";");
}

/** CSS-Kommentare heraus, per `indexOf` (linear; ein offener Kommentar nimmt den Rest mit). */
function ohneCssKommentare(css: string): string {
  let aus = "";
  let i = 0;
  for (;;) {
    const a = css.indexOf("/*", i);
    if (a < 0) return aus + css.slice(i);
    aus += css.slice(i, a);
    const e = css.indexOf("*/", a + 2);
    if (e < 0) return aus;
    i = e + 2;
  }
}

/**
 * `<style>`: Kommentare und @-Anweisungen fallen, Regeln nur mit einfachen Selektoren, Deklarationen gefiltert.
 * Ein Zerleger, der Zeichen für Zeichen Klammern und Semikolons zählt — EIN Durchlauf. Die frühere Form mit
 * `matchAll(/([^{}]+)\{([^{}]*)\}/g)` lief bei fehlender Klammer von jeder Startposition bis zum Ende
 * (quadratisch; `svg.test.ts`, „lineare Laufzeit"). Verschachtelte Blöcke (`@media {…{…}}`) fallen ganz.
 */
function bereinigeCss(css: string): string {
  if (css.length > MAX_CSS) throw new Ungueltig("Der style-Inhalt ist größer als 64 KB.");
  const c = ohneCssKommentare(css);
  const regeln: [string, string][] = [];
  let tiefe = 0;
  let start = 0;
  let selektor = "";
  for (let j = 0; j < c.length; j++) {
    const z = c[j];
    if (z === "{") {
      if (tiefe === 0) { selektor = c.slice(start, j); start = j + 1; }
      tiefe++;
    } else if (z === "}") {
      if (tiefe === 0) { start = j + 1; continue; } // verirrte Klammer: was davor steht, fällt
      tiefe--;
      if (tiefe === 0) { regeln.push([selektor, c.slice(start, j)]); start = j + 1; }
    } else if (z === ";" && tiefe === 0) {
      start = j + 1; // `@import …;` und Reste zwischen den Regeln fallen
    }
  }
  return regeln.flatMap(([sel, decl]) => {
    const s = sel.trim();
    if (s === "" || decl.includes("{") || !/^[\w\s.#,:>*+~-]+$/.test(s)) return [];
    const d = bereinigeDeklarationen(decl);
    return d === "" ? [] : [`${s}{${d}}`];
  }).join("");
}

function reinigeVerweis(element: string, wert: string): string | null {
  const w = wert.trim();
  if (element === "image") return RASTER_DATA.test(w) ? w : null;
  return LOKAL_VERWEISEND.has(element) && LOKAL.test(w) ? w : null;
}

function reinigeAttribut(element: string, name: string, wert: string): string | null {
  if (/^on/i.test(name)) return null;
  if (name === "href" || name === "xlink:href") return reinigeVerweis(element, wert);
  if (name === "xmlns") return wert === SVG_NS ? wert : null;
  if (name === "xmlns:xlink") return wert === XLINK_NS ? wert : null;
  if (name === "xml:space") return wert === "preserve" || wert === "default" ? wert : null;
  if (!ATTRIBUTE.has(name)) return null;
  if (verdichtet(wert).includes("javascript:")) return null;
  if (name === "style") { const r = bereinigeDeklarationen(wert); return r === "" ? null : r; }
  if (!nurLokaleUrls(wert)) return null;
  return wert;
}

function reinige(k: Knoten): Knoten | null {
  if (!ELEMENTE.has(k.name)) return null; // samt Inhalt
  if (k.name === "style") {
    const css = bereinigeCss(k.kinder.filter((c): c is string => typeof c === "string").join(""));
    return css === "" ? null : { name: "style", attribute: [], kinder: [css] };
  }
  const attribute = k.attribute.flatMap(([n, w]): [string, string][] => {
    const r = reinigeAttribut(k.name, n, w);
    return r === null ? [] : [[n, r]];
  });
  if ((k.name === "use" || k.name === "image") && !attribute.some(([n]) => n === "href" || n === "xlink:href")) return null;
  const kinder = k.kinder.flatMap((c): (Knoten | string)[] => {
    if (typeof c === "string") return MIT_TEXT.has(k.name) && c !== "" ? [c] : [];
    const r = reinige(c);
    return r === null ? [] : [r];
  });
  return { name: k.name, attribute, kinder };
}

const zeichnet = (k: Knoten): boolean => ZEICHNEND.has(k.name) || k.kinder.some((c) => typeof c !== "string" && zeichnet(c));
const nutztXlink = (k: Knoten): boolean => k.attribute.some(([n]) => n === "xlink:href") || k.kinder.some((c) => typeof c !== "string" && nutztXlink(c));
const maskiere = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function schreibe(k: Knoten): string {
  const a = k.attribute.map(([n, w]) => ` ${n}="${maskiere(w).replace(/"/g, "&quot;")}"`).join("");
  const innen = k.kinder.map((c) => (typeof c === "string" ? maskiere(c) : schreibe(c))).join("");
  return innen === "" ? `<${k.name}${a}/>` : `<${k.name}${a}>${innen}</${k.name}>`;
}

const ZAHL = /^\d+(?:\.\d+)?(?:px)?$/;

export function bereinigeSvg(eingabe: string): SvgErgebnis {
  try {
    const text = eingabe.replace(/^﻿/, "");
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Ungueltig("DOCTYPE- und ENTITY-Angaben werden nicht angenommen.");
    const dokument = zerlege(text);
    if (dokument.kinder.some((c) => typeof c === "string" && c.trim() !== "")) throw new Ungueltig("Text steht außerhalb des svg-Wurzelelements.");
    const elemente = dokument.kinder.filter((c): c is Knoten => typeof c !== "string");
    if (elemente.length !== 1 || elemente[0].name !== "svg") throw new Ungueltig("Die Datei hat kein svg-Wurzelelement.");
    const wurzel = reinige(elemente[0])!;
    const attr = new Map(wurzel.attribute);
    const vb = attr.get("viewBox")?.trim().split(/[\s,]+/).map(Number);
    const hatViewBox = vb !== undefined && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
    if (!hatViewBox) {
      const b = attr.get("width")?.trim(), h = attr.get("height")?.trim();
      if (!b || !h || !ZAHL.test(b) || !ZAHL.test(h) || parseFloat(b) <= 0 || parseFloat(h) <= 0) {
        throw new Ungueltig("Das SVG braucht eine viewBox oder Breite und Höhe als Zahlen.");
      }
      attr.set("viewBox", `0 0 ${parseFloat(b)} ${parseFloat(h)}`);
    }
    if (!zeichnet(wurzel)) throw new Ungueltig("Nach der Bereinigung bleibt nichts zu zeichnen.");
    attr.set("xmlns", SVG_NS);
    if (nutztXlink(wurzel)) attr.set("xmlns:xlink", XLINK_NS); else attr.delete("xmlns:xlink");
    wurzel.attribute = [...attr];
    return { ok: true, svg: schreibe(wurzel) };
  } catch (e) {
    if (e instanceof Ungueltig) return { ok: false, grund: e.message };
    throw e;
  }
}
```

Hinweis zur Prüfung: `schreibe` und `reinige` sind rekursiv, aber durch `MAX_TIEFE` im Zerleger begrenzt. Kein Regex dieser Datei darf von mehreren Startpositionen bis zum Textende suchen (Entscheidung 5, „Lineare Laufzeit"): die verbliebenen (`dekodiere`, `verdichtet`, `LOKAL`, `RASTER_DATA`, die Selektorprüfung) sind verankert oder brechen an der ersten Fundstelle ab.

- [ ] **Step 4: Grün sehen, Gegenproben**

Run: `pnpm vitest run src/app/m/kommplan/_lib/logo/svg.test.ts`
Expected: PASS.

Gegenproben (jede einzeln, danach zurücknehmen; jede muss mindestens einen Test rot machen): `bereinigeCss` vorübergehend auf die alte `matchAll`-Form zurückstellen (Laufzeittest); `MAX_CSS` entfernen (64-KB-Test); `"style"` aus `ELEMENTE` streichen (Illustrator-Test); `verdichtet(...)` durch `wert.toLowerCase()` ersetzen (Tab-Test); `/^on/i` durch `/^on/` ersetzen (ONCLICK); den DOCTYPE-Vorabtest entfernen (der Zerleger muss allein ablehnen); `RASTER_DATA` um `svg\+xml` erweitern. Ergebnis in der Commit-Botschaft nicht erwähnen, aber im Bericht der Aufgabe.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
git add src/app/m/kommplan/_lib/logo/svg.ts src/app/m/kommplan/_lib/logo/svg.test.ts
git commit -S -m "feat(kommplan): SVG-Logos werden vor dem Speichern bereinigt

Allowlist für Elemente, Attribute und CSS; kein Skript, kein foreignObject,
keine on*-Attribute, keine externen Verweise, keine javascript:-URLs,
kein DOCTYPE. Was danach nicht mehr zeichnet oder kein Maß hat, wird
abgelehnt. Illustrator-Logos behalten ihre Farben aus dem style-Element.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Virenscan des Logos — Wegwerfdatei, eigenes Volume, eigene Variablen

**Files:**
- Create: `src/app/m/kommplan/_lib/logoScan.ts`
- Test: `src/app/m/kommplan/_lib/logoScan.test.ts`
- Modify: `compose.yaml` (Mount `kommplan_scan` unter `suite` und `clamav`, Volume-Deklaration), `Dockerfile` (`RUN mkdir -p … /data/kommplan-scan && chown …`), `.env.example` (kommentierte `KOMMPLAN_AV_*`), `playwright.config.ts` (`KOMMPLAN_AV_*` im Web-Server-Env neben `AUFGABEN_AV_*`)
- Test: `src/app/m/files/_lib/compose.test.ts` (neuer Fall „Punkt 9b")

**Interfaces:**
- Consumes: `scanne(pfad, konfig): Promise<AvErgebnis>` und `AvKonfig` aus `@/core/av/scanner` (`AvErgebnis = { art: "clean" } | { art: "infected"; signatur } | { art: "error"; grund }`).
- Produces: `avKonfigAusEnv(env?: Record<string, string | undefined>): AvKonfig` (Vorgaben `clamav`, `3310`, `30000`); `scanWurzel(env?): string` (= `resolve(env.DATA_DIR ?? "./.data", "kommplan-scan")`); `scanneLogo(bytes: Uint8Array, konfig?: AvKonfig): Promise<AvErgebnis>` — wirft nie, löscht die Datei immer.

- [ ] **Step 1: Vorbild lesen**

`src/app/m/aufgaben/_lib/scan.ts` (Kopfkommentar: eigene Variablen, kein zweiter Netzhaken), `src/app/m/aufgaben/_lib/ablage.ts` (`ablageWurzel`, Modi 0750/0640, `resolve` für einen absoluten Pfad), `src/core/av/scanner.ts` (`scanne` settelt immer, wirft nie), `Dockerfile` (Kommentar über `RUN mkdir -p /data/files`: ein leeres benanntes Volume übernimmt Eigentümer und Modus des Mountpunkts aus dem Image), `compose.yaml` (Mounts `aufgaben_data` unter `suite`, `clamav`, `backup`).

- [ ] **Step 2: Failing Tests schreiben**

`src/app/m/kommplan/_lib/logoScan.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import net from "node:net";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { avKonfigAusEnv, scanneLogo, scanWurzel } from "./logoScan";

/** Ein clamd-Sprecher auf einem freien Port (Vorbild `aufgaben/_lib/scan.test.ts`, `lausche`). */
async function lausche(reagiere: (pfad: string) => string) {
  const befehle: string[] = [];
  const server = net.createServer((v) => {
    let puffer = "";
    v.on("data", (s) => {
      puffer += s.toString("utf8");
      const ende = puffer.indexOf("\0");
      if (ende < 0) return;
      const befehl = puffer.slice(0, ende);
      befehle.push(befehl);
      v.end(`${reagiere(befehl.replace(/^zSCAN /, ""))}\0`);
    });
    v.on("error", () => {});
  });
  await new Promise<void>((fertig) => server.listen(0, "127.0.0.1", fertig));
  return {
    port: (server.address() as net.AddressInfo).port, befehle,
    stoppe: () => new Promise<void>((fertig) => server.close(() => fertig())),
  };
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kommplan-scan-")); vi.stubEnv("DATA_DIR", dir); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });

describe("scanneLogo (Umsetzungsplan Phase 4, Entscheidung 4)", () => {
  it("schreibt die Bytes unter $DATA_DIR/kommplan-scan (0640), clamd liest sie per zSCAN, danach ist die Datei weg", async () => {
    let gelesen: number[] = [];
    let modus = 0;
    const l = await lausche((pfad) => { gelesen = [...readFileSync(pfad)]; modus = statSync(pfad).mode & 0o777; return `${pfad}: OK`; });
    try {
      expect(await scanneLogo(new Uint8Array([1, 2, 3]), { host: "127.0.0.1", port: l.port, timeoutMs: 2000 })).toEqual({ art: "clean" });
      expect(gelesen).toEqual([1, 2, 3]);
      expect(modus).toBe(0o640);
      expect(l.befehle[0].startsWith(`zSCAN ${scanWurzel()}/`)).toBe(true);
      expect(scanWurzel()).toBe(join(dir, "kommplan-scan"));
      expect(readdirSync(scanWurzel())).toEqual([]);
    } finally { await l.stoppe(); }
  });
  it("ein Befund kommt als infected zurück, die Datei ist trotzdem weg", async () => {
    const l = await lausche((pfad) => `${pfad}: Win.Test.EICAR_HDB-1 FOUND`);
    try {
      expect(await scanneLogo(new Uint8Array([1]), { host: "127.0.0.1", port: l.port, timeoutMs: 2000 })).toEqual({ art: "infected", signatur: "Win.Test.EICAR_HDB-1" });
      expect(readdirSync(scanWurzel())).toEqual([]);
    } finally { await l.stoppe(); }
  });
  it("kein Scanner erreichbar: error (fail-closed), die Datei ist weg", async () => {
    const l = await lausche(() => "");
    const port = l.port;
    await l.stoppe();
    const r = await scanneLogo(new Uint8Array([1]), { host: "127.0.0.1", port, timeoutMs: 2000 });
    expect(r.art).toBe("error");
    expect(readdirSync(scanWurzel())).toEqual([]);
  });
  it("liest nur die eigenen Variablen KOMMPLAN_AV_* — Vorgaben clamav, 3310, 30 s", () => {
    expect(avKonfigAusEnv({})).toEqual({ host: "clamav", port: 3310, timeoutMs: 30_000 });
    expect(avKonfigAusEnv({ KOMMPLAN_AV_HOST: " 127.0.0.1 ", KOMMPLAN_AV_PORT: "3311", KOMMPLAN_AV_TIMEOUT_MS: "2000", AUFGABEN_AV_HOST: "anders" }))
      .toEqual({ host: "127.0.0.1", port: 3311, timeoutMs: 2000 });
  });
});
```

Prüf vor dem Schreiben an `core/av/scanner.ts` (`werteAntwortAus`), dass `<pfad>: Win.Test.EICAR_HDB-1 FOUND` als `{ art: "infected", signatur: "Win.Test.EICAR_HDB-1" }` ausgewertet wird; sonst die Erwartung auf `r.art === "infected"` beschränken.

In `src/app/m/files/_lib/compose.test.ts` im `describe` nach „Punkt 9" anfügen:

```ts
  it("Punkt 9b: kommplan_scan — suite schreibt, clamav liest denselben Pfad, das Backup mountet es nicht (Logo-Scan, kommplan Phase 4)", () => {
    expect(liste(suite, "volumes", 4)).toContain("kommplan_scan:/data/kommplan-scan");
    expect(liste(clamav, "volumes", 4)).toContain("kommplan_scan:/data/kommplan-scan:ro");
    // Nur Wegwerfdateien: das Logo selbst liegt in kommplan.db, die das Backup über suite_data sichert.
    expect(liste(rumpf(services, "backup", 2), "volumes", 4).filter((m) => m.startsWith("kommplan_scan:"))).toEqual([]);
    expect(rumpf(composeZeilen, "volumes", 0).join("\n")).toMatch(/^\s{2}kommplan_scan:/m);
    // Ohne diese Zeile gehört der Mountpunkt root, und jeder Logo-Upload scheitert (Dockerfile, Kommentar über /data/files).
    expect(readFileSync(path.join(WURZEL, "Dockerfile"), "utf8")).toMatch(/^RUN mkdir -p [^\n]*\/data\/kommplan-scan[^\n]*&& chown nextjs:nodejs [^\n]*\/data\/kommplan-scan/m);
    expect(readFileSync(path.join(WURZEL, "src/app/m/kommplan/_lib/logoScan.ts"), "utf8")).toContain('resolve(env.DATA_DIR ?? "./.data", "kommplan-scan")');
  });
```

- [ ] **Step 3: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/logoScan.test.ts src/app/m/files/_lib/compose.test.ts`
Expected: FAIL (Modul fehlt; Mount fehlt).

- [ ] **Step 4: Implementieren**

`src/app/m/kommplan/_lib/logoScan.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { scanne, type AvErgebnis, type AvKonfig } from "@/core/av/scanner";

/**
 * VIRENSCAN DES LOGOS (Spec §4.4; Umsetzungsplan Phase 4, Entscheidung 4). Muster `aufgaben/_lib/scan.ts`:
 * clamd liest die Datei selbst (`zSCAN <pfad>`), `core/av` bleibt unverändert. Anders als dort gibt es
 * keine Warteschlange — ein Logo wird im Upload SYNCHRON geprüft und erst danach gespeichert. Die Bytes
 * liegen dafür kurz als Wegwerfdatei unter `$DATA_DIR/kommplan-scan` (Volume `kommplan_scan`, das clamd
 * lesend sieht, `compose.yaml`) und werden im `finally` gelöscht, auch bei Fehler oder Befund.
 *
 * EIGENE VARIABLEN (`KOMMPLAN_AV_*`), nie die von `files` oder `aufgaben` — eine geteilte Zahl wäre eine
 * Kopplung, die niemand gewählt hat (Kopfkommentar `aufgaben/_lib/scan.ts`). Den prozessweiten Netzhaken
 * registriert `src/instrumentation.ts` schon. Wirft nie: jeder Fehler ist `{ art: "error" }` (fail-closed).
 */
const VORGABE = { host: "clamav", port: 3310, timeoutMs: 30_000 } as const;
type Env = Record<string, string | undefined>;

function ganzzahl(roh: string | undefined, vorgabe: number): number {
  const t = roh?.trim() ?? "";
  return /^[+-]?\d+$/.test(t) ? Number(t) : vorgabe; // ungültig → Vorgabe; eine kaputte Zahl fängt `scanne` fail-closed ab
}

export function avKonfigAusEnv(env: Env = process.env): AvKonfig {
  return {
    host: env.KOMMPLAN_AV_HOST?.trim() || VORGABE.host,
    port: ganzzahl(env.KOMMPLAN_AV_PORT, VORGABE.port),
    timeoutMs: ganzzahl(env.KOMMPLAN_AV_TIMEOUT_MS, VORGABE.timeoutMs),
  };
}

/** Absolut: clamd bekommt den Pfad und hat ein anderes Arbeitsverzeichnis als der Node-Prozess. */
export function scanWurzel(env: Env = process.env): string {
  return resolve(env.DATA_DIR ?? "./.data", "kommplan-scan");
}

export async function scanneLogo(bytes: Uint8Array, konfig: AvKonfig = avKonfigAusEnv()): Promise<AvErgebnis> {
  const ordner = scanWurzel();
  const pfad = join(ordner, randomUUID()); // nie aus einem Dateinamen: der Upload-Name ist Eingabe, kein Pfad
  try {
    await mkdir(ordner, { recursive: true, mode: 0o750 });
    await writeFile(pfad, bytes, { mode: 0o640, flag: "wx" });
    return await scanne(pfad, konfig);
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    console.error(`[kommplan][logo-scan] Prüfung nicht möglich: ${grund}`);
    return { art: "error", grund };
  } finally {
    await unlink(pfad).catch(() => {});
  }
}
```

`compose.yaml`:
1. Unter `services.suite.volumes` nach `- aufgaben_data:/data/aufgaben` (samt seinem Kommentarblock) einfügen:
   ```yaml
      # Wegwerfdateien des Logo-Scans der Kommunikationspläne (kommplan Phase 4): der Upload liegt hier nur,
      # solange clamd ihn per `zSCAN` liest, und wird danach gelöscht; das Logo selbst steht in kommplan.db.
      # Derselbe Name wie unter `clamav` (lesend) — sonst sieht clamd ein leeres Verzeichnis, und JEDER
      # Logo-Upload scheitert fail-closed mit „Die Virenprüfung ist gerade nicht möglich".
      - kommplan_scan:/data/kommplan-scan
   ```
2. Unter `services.clamav.volumes` nach `- aufgaben_data:/data/aufgaben:ro` einfügen:
   ```yaml
      # Logo-Scan der Kommunikationspläne — dasselbe Volume wie unter `suite`, nur lesend.
      - kommplan_scan:/data/kommplan-scan:ro
   ```
3. Unter `volumes:` (oberste Ebene) nach `aufgaben_data:` / `name: aufgaben_data` einfügen:
   ```yaml
  kommplan_scan:
    name: kommplan_scan
   ```
   Das Backup (`services.backup`) bekommt **keinen** Mount.

`Dockerfile`: die Zeile `RUN mkdir -p /data/files && chown nextjs:nodejs /data /data/files` **in derselben Zeile** ersetzen durch
`RUN mkdir -p /data/files /data/kommplan-scan && chown nextjs:nodejs /data /data/files /data/kommplan-scan`
und direkt darüber, als letzte Zeile des Kommentarblocks, ergänzen:
`# `/data/kommplan-scan` aus demselben Grund (Logo-Scan der Kommunikationspläne, Volume `kommplan_scan`).`

`.env.example`: hinter den kommplan-Zeilen (`SUITE_ADMIN_GROUP_KOMMPLAN`) ergänzen:

```
# kommplan: Virenscan des Logo-Uploads (Briefkopf, Phase 4). Ohne Eintrag gilt clamav:3310, 30 s.
# KOMMPLAN_AV_HOST=clamav
# KOMMPLAN_AV_PORT=3310
# KOMMPLAN_AV_TIMEOUT_MS=30000
```

`playwright.config.ts`: im Env des Web-Servers direkt nach `AUFGABEN_AV_TIMEOUT_MS: "2000",` einfügen:

```ts
        // Logo-Upload der Kommunikationspläne (Phase 4): dasselbe Fake-clamd, eigene Variablen (`kommplan/_lib/logoScan.ts`).
        // Ohne sie liefe jeder Upload gegen den Host „clamav" und scheiterte fail-closed.
        KOMMPLAN_AV_HOST: "127.0.0.1",
        KOMMPLAN_AV_PORT: String(E2E_PORTS.clamd),
        KOMMPLAN_AV_TIMEOUT_MS: "2000",
```

- [ ] **Step 5: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/logoScan.test.ts src/app/m/files/_lib/compose.test.ts scripts/e2e-cloud.test.ts`
Expected: PASS. (`scripts/backup-sidecar.test.ts` auf macOS bekannt rot, DRK-501 — einzeln fahren und nur prüfen, dass **keine neue** Meldung zu `kommplan_scan` darin steht.)

- [ ] **Step 6: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
for f in compose.yaml Dockerfile .env.example playwright.config.ts compose.test.ts; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
pnpm anker:drift compose.yaml; pnpm anker:drift Dockerfile; pnpm anker:drift playwright.config.ts
git add src/app/m/kommplan/_lib/logoScan.ts src/app/m/kommplan/_lib/logoScan.test.ts compose.yaml Dockerfile .env.example playwright.config.ts src/app/m/files/_lib/compose.test.ts
git commit -S -m "feat(kommplan): Logo-Upload geht durch den Virenscanner

Die Bytes liegen für den Scan kurz in einer Wegwerfdatei auf dem neuen
Volume kommplan_scan, das clamd lesend sieht; Befund oder Scanfehler
lehnen ab. Eigene Variablen KOMMPLAN_AV_*.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Briefkopf lesen und schreiben — Organisation, Logo-Kette, Entfernen

**Files:**
- Create: `src/app/m/kommplan/_lib/briefkopf.ts`
- Modify: `src/app/m/kommplan/_lib/ergebnis.ts` (`EinfachErgebnis`, `LogoErgebnis`), `src/app/m/kommplan/_lib/angaben.ts` (`LAENGE_ORGANISATION`)
- Test: `src/app/m/kommplan/_lib/briefkopf.test.ts`

**Interfaces:**
- Consumes: `briefkopf` (Task 1), `pruefeLogoDatei`, `LogoTyp` (Task 2), `bereinigeSvg` (Task 3), `AvErgebnis`, `Bearbeiter` (`_lib/speichern.ts`).
- Produces (`ergebnis.ts`): `export type EinfachErgebnis = { ok: true } | { ok: false; fehler: string };` `export type LogoErgebnis = { ok: true; typ: LogoTyp } | { ok: false; fehler: string };`
- Produces (`angaben.ts`, rein, auch für die Client-Insel): `export const LAENGE_ORGANISATION = 120;` — NICHT in `briefkopf.ts`, das `node:crypto` und die Datenbank zieht.
- Produces (`briefkopf.ts`): `interface Briefkopf { organisation: string | null; logo: { typ: LogoTyp; bytes: number } | null; aktualisiertAm: number | null; aktualisiertVon: string | null }`; `interface KopfAngaben { organisation: string | null; logo: { href: string } | null }`; `LOGO_MELDUNG = { befund, pruefung, svg(grund), grossNachBereinigung }`; `type LogoScan = (bytes: Uint8Array) => Promise<AvErgebnis>`; `ladeBriefkopf(db): Briefkopf`; `kopfFuerZeichnung(db): KopfAngaben`; `setzeOrganisation(db, eingabe: unknown, wer: Bearbeiter, jetzt: number): EinfachErgebnis`; `speichereLogo(db, bytes: Uint8Array, wer, jetzt, scan: LogoScan): Promise<LogoErgebnis>`; `entferneLogo(db, wer, jetzt): EinfachErgebnis`.

- [ ] **Step 1: Failing Tests schreiben**

`src/app/m/kommplan/_lib/briefkopf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { entferneLogo, kopfFuerZeichnung, ladeBriefkopf, LOGO_MELDUNG, setzeOrganisation, speichereLogo } from "./briefkopf";
import { LOGO_FEHLER } from "./logo/logoTyp";
import { testDb } from "./testDb";

const WER = { nutzer: "u1", name: "Jana" };
const T = Date.UTC(2026, 9, 1, 8, 0);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1" onload="x()"><rect width="2" height="1"/><script>alert(1)</script></svg>');
const sauber = async () => ({ art: "clean" as const });
const audit = (db: ReturnType<typeof testDb>) =>
  (db.all(sql`SELECT action FROM audit_outbox WHERE object_type = 'briefkopf' ORDER BY rowid`) as { action: string }[]).map((z) => z.action);

describe("Briefkopf (Spec §4.4)", () => {
  it("ohne Eintrag ist der Kopf leer — kein Name, kein Logo, kein Ersatz", () => {
    const db = testDb();
    expect(ladeBriefkopf(db)).toEqual({ organisation: null, logo: null, aktualisiertAm: null, aktualisiertVon: null });
    expect(kopfFuerZeichnung(db)).toEqual({ organisation: null, logo: null });
  });
  it("Organisation: getrimmt; leer wird null; über 120 Zeichen und fremde Felder abgewiesen", () => {
    const db = testDb();
    expect(setzeOrganisation(db, { organisation: "  Kreisverband Muster  " }, WER, T)).toEqual({ ok: true });
    expect(ladeBriefkopf(db)).toMatchObject({ organisation: "Kreisverband Muster", aktualisiertVon: "Jana", aktualisiertAm: T });
    expect(setzeOrganisation(db, { organisation: "   " }, WER, T)).toEqual({ ok: true });
    expect(ladeBriefkopf(db).organisation).toBeNull();
    expect(setzeOrganisation(db, { organisation: "x".repeat(121) }, WER, T)).toEqual({ ok: false, fehler: "Höchstens 120 Zeichen." });
    expect(setzeOrganisation(db, { organisation: "A", logo: "x" }, WER, T).ok).toBe(false);
  });
  it("PNG: gescannt, gespeichert, im Kopf als data:-URI", async () => {
    const db = testDb();
    const gescannt: Uint8Array[] = [];
    expect(await speichereLogo(db, PNG, WER, T, async (b) => { gescannt.push(b); return { art: "clean" }; })).toEqual({ ok: true, typ: "image/png" });
    expect(gescannt).toEqual([PNG]);
    expect(ladeBriefkopf(db).logo).toEqual({ typ: "image/png", bytes: PNG.length });
    expect(kopfFuerZeichnung(db).logo).toEqual({ href: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}` });
  });
  it("SVG: gescannt wird die hochgeladene Datei, gespeichert die bereinigte", async () => {
    const db = testDb();
    const gescannt: Uint8Array[] = [];
    expect(await speichereLogo(db, SVG, WER, T, async (b) => { gescannt.push(b); return { art: "clean" }; })).toEqual({ ok: true, typ: "image/svg+xml" });
    expect(gescannt).toEqual([SVG]);
    const gespeichert = Buffer.from(kopfFuerZeichnung(db).logo!.href.split(",")[1], "base64").toString("utf8");
    expect(gespeichert).toContain("<rect");
    expect(gespeichert).not.toMatch(/script|onload/);
  });
  it("Befund und Scanfehler lehnen ab — nichts gespeichert (fail-closed)", async () => {
    const db = testDb();
    expect(await speichereLogo(db, PNG, WER, T, async () => ({ art: "infected", signatur: "Eicar" }))).toEqual({ ok: false, fehler: LOGO_MELDUNG.befund });
    expect(await speichereLogo(db, PNG, WER, T, async () => ({ art: "error", grund: "ECONNREFUSED" }))).toEqual({ ok: false, fehler: LOGO_MELDUNG.pruefung });
    expect(ladeBriefkopf(db).logo).toBeNull();
  });
  it("falscher Typ wird nicht einmal gescannt; ein SVG mit DOCTYPE wird abgelehnt", async () => {
    const db = testDb();
    let scans = 0;
    const zaehle = async () => { scans += 1; return { art: "clean" as const }; };
    expect(await speichereLogo(db, new TextEncoder().encode("GIF89a"), WER, T, zaehle)).toEqual({ ok: false, fehler: LOGO_FEHLER.typ });
    expect(scans).toBe(0);
    const r = await speichereLogo(db, new TextEncoder().encode('<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'), WER, T, zaehle);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.startsWith("Das SVG lässt sich nicht sicher übernehmen: ")).toBe(true);
    expect(ladeBriefkopf(db).logo).toBeNull();
  });
  it("Hochladen, Ersetzen, Entfernen: je eine Audit-Zeile; Entfernen lässt die Organisation stehen", async () => {
    const db = testDb();
    setzeOrganisation(db, { organisation: "Muster" }, WER, T);
    await speichereLogo(db, PNG, WER, T + 1, sauber);
    await speichereLogo(db, SVG, WER, T + 2, sauber);
    expect(entferneLogo(db, WER, T + 3)).toEqual({ ok: true });
    expect(kopfFuerZeichnung(db)).toEqual({ organisation: "Muster", logo: null });
    expect(audit(db)).toEqual(["create", "update", "update", "update"]);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/briefkopf.test.ts`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

In `src/app/m/kommplan/_lib/angaben.ts` hinter `LAENGE_ANLASS` ergänzen: `/** Organisationsname im Briefkopf (Spec §4.4). */ export const LAENGE_ORGANISATION = 120;`

In `src/app/m/kommplan/_lib/ergebnis.ts` den Import `import type { LogoTyp } from "./logo/logoTyp";` ergänzen und anfügen:

```ts
/** Für Actions ohne eigenen Rückgabewert. Benannt, weil ein `{` in der Signatur den Riegel-Test der Actions bricht. */
export type EinfachErgebnis = { ok: true } | { ok: false; fehler: string };
export type LogoErgebnis = { ok: true; typ: LogoTyp } | { ok: false; fehler: string };
```

`src/app/m/kommplan/_lib/briefkopf.ts`:

```ts
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AvErgebnis } from "@/core/av/scanner";
import type { KommplanDb } from "../_db/client";
import { briefkopf } from "../_db/schema";
import { LAENGE_ORGANISATION } from "./angaben";
import type { EinfachErgebnis, LogoErgebnis } from "./ergebnis";
import { LOGO_MAX_BYTES, pruefeLogoDatei, type LogoTyp } from "./logo/logoTyp";
import { bereinigeSvg } from "./logo/svg";
import type { Bearbeiter } from "./speichern";

/**
 * BRIEFKOPF (Spec §4.4; Umsetzungsplan Phase 4, Entscheidungen 2, 4–6) — nur Server. Organisationsname
 * und Logo kommen aus der Datenbank, nie aus dem Code; ohne Eintrag bleibt der Kopf leer (kein Ersatz).
 *
 * LOGO-KETTE (`speichereLogo`): Größe und Typ aus den Bytes → Virenscan der hochgeladenen Bytes (fail-
 * closed) → bei SVG Bereinigung → speichern samt SHA-256. Erst wenn alles durch ist, wird geschrieben;
 * eine abgelehnte Datei hinterlässt nichts. Zeit kommt als `jetzt` herein (testbar, kein `Date.now()`).
 */
export interface Briefkopf { organisation: string | null; logo: { typ: LogoTyp; bytes: number } | null; aktualisiertAm: number | null; aktualisiertVon: string | null }
/** Was der Kopf der Zeichnung braucht (`Rahmen.organisation`, `Rahmen.logo`). */
export interface KopfAngaben { organisation: string | null; logo: { href: string } | null }
export type LogoScan = (bytes: Uint8Array) => Promise<AvErgebnis>;
export const LOGO_MELDUNG = {
  befund: "Der Virenscanner hat in der Datei etwas gefunden. Sie wurde nicht übernommen.",
  pruefung: "Die Virenprüfung ist gerade nicht möglich. Versuch es später noch einmal.",
  svg: (grund: string) => `Das SVG lässt sich nicht sicher übernehmen: ${grund}`,
  grossNachBereinigung: "Das bereinigte SVG ist größer als 1 MB.",
} as const;

type Leser = Pick<KommplanDb, "select">;
type Schreiber = Pick<KommplanDb, "insert">;
const zeile = (db: Leser) => db.select().from(briefkopf).where(eq(briefkopf.id, 1)).get();

export function ladeBriefkopf(db: Leser): Briefkopf {
  const z = zeile(db);
  return {
    organisation: z?.organisation ?? null,
    logo: z?.logo && z.logoMime ? { typ: z.logoMime as LogoTyp, bytes: z.logo.length } : null,
    aktualisiertAm: z?.aktualisiertAm.getTime() ?? null,
    aktualisiertVon: z?.aktualisiertVon ?? null,
  };
}

export function kopfFuerZeichnung(db: Leser): KopfAngaben {
  const z = zeile(db);
  return {
    organisation: z?.organisation ?? null,
    logo: z?.logo && z.logoMime ? { href: `data:${z.logoMime};base64,${Buffer.from(z.logo).toString("base64")}` } : null,
  };
}

/** Eine Zeile, `id = 1`: anlegen oder ändern (Entscheidung 2). */
function schreibe(db: Schreiber, werte: Partial<typeof briefkopf.$inferInsert>, wer: Bearbeiter, jetzt: number): void {
  const stand = { aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name };
  db.insert(briefkopf).values({ id: 1, ...werte, ...stand }).onConflictDoUpdate({ target: briefkopf.id, set: { ...werte, ...stand } }).run();
}

const organisationSchema = z.object({
  organisation: z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v),
    z.string().max(LAENGE_ORGANISATION, `Höchstens ${LAENGE_ORGANISATION} Zeichen.`).nullable()),
}).strict();

export function setzeOrganisation(db: Schreiber, eingabe: unknown, wer: Bearbeiter, jetzt: number): EinfachErgebnis {
  const r = organisationSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: r.error.issues[0]?.message ?? "Ungültige Anfrage." };
  schreibe(db, { organisation: r.data.organisation }, wer, jetzt);
  return { ok: true };
}

export async function speichereLogo(db: Schreiber, bytes: Uint8Array, wer: Bearbeiter, jetzt: number, scan: LogoScan): Promise<LogoErgebnis> {
  const p = pruefeLogoDatei(bytes);
  if (!p.ok) return p;
  const befund = await scan(bytes);
  if (befund.art === "infected") return { ok: false, fehler: LOGO_MELDUNG.befund };
  if (befund.art !== "clean") return { ok: false, fehler: LOGO_MELDUNG.pruefung };
  let ablage = Buffer.from(bytes);
  if (p.typ === "image/svg+xml") {
    const r = bereinigeSvg(new TextDecoder().decode(bytes));
    if (!r.ok) return { ok: false, fehler: LOGO_MELDUNG.svg(r.grund) };
    ablage = Buffer.from(r.svg, "utf8");
    if (ablage.length > LOGO_MAX_BYTES) return { ok: false, fehler: LOGO_MELDUNG.grossNachBereinigung };
  }
  schreibe(db, { logo: ablage, logoMime: p.typ, logoSha256: createHash("sha256").update(ablage).digest("hex") }, wer, jetzt);
  return { ok: true, typ: p.typ };
}

export function entferneLogo(db: Schreiber, wer: Bearbeiter, jetzt: number): EinfachErgebnis {
  schreibe(db, { logo: null, logoMime: null, logoSha256: null }, wer, jetzt);
  return { ok: true };
}
```

Hinweis: `expect(gescannt).toEqual([PNG])` vergleicht Inhalte; wird der Puffer zwischendurch kopiert, bleibt der Test grün — gewollt.

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/briefkopf.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
git grep -n "ergebnis.ts:[0-9]" -- src scripts e2e docs
git add src/app/m/kommplan/_lib/briefkopf.ts src/app/m/kommplan/_lib/briefkopf.test.ts src/app/m/kommplan/_lib/ergebnis.ts src/app/m/kommplan/_lib/angaben.ts
git commit -S -m "feat(kommplan): Briefkopf mit Organisation und geprüftem Logo speichern

Größe und Typ aus den Bytes, Virenscan, SVG-Bereinigung, dann erst
speichern. Ohne Eintrag bleibt der Kopf leer.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Logo-Upload als Route Handler, Organisation und Entfernen als Actions

**Files:**
- Create: `src/app/m/kommplan/_lib/herkunft.ts`, `src/app/m/kommplan/logo/route.ts`, `src/app/m/kommplan/_actions/briefkopf.ts`
- Test: `src/app/m/kommplan/_lib/herkunft.test.ts`, `src/app/m/kommplan/logo/route.test.ts`, `src/app/m/kommplan/_actions/briefkopf.test.ts`
- Modify: `src/app/m/kommplan/riegel.test.ts` (`AUSSERHALB` + eigener Fall), `src/core/audit/coverage-manifest.json`, `src/core/audit/coverage.test.ts` (Liste `expected` im Fall „keeps local masked denials covered …")

**Interfaces:**
- Consumes: `speichereLogo`, `setzeOrganisation`, `entferneLogo` (Task 5), `scanneLogo` (Task 4), `requireKommplanBearbeitenAktion`, `bearbeiterAus` (`_lib/zugang.ts`), `withAuditContext`, `auditActor`, `auditDenied` (`@/core/audit/server`), `queryAuditEvents` (`@/core/audit/storage`, nur Test), `LOGO_MAX_BYTES`.
- Produces: `gleicheHerkunft(kopf: Headers): boolean`; `POST /logo` (Feld `logo`, Antwort JSON `LogoErgebnis`, Status 200/400/403/404/413/422); `speichereOrganisationAction(eingabe: unknown): Promise<EinfachErgebnis>`; `entferneLogoAction(): Promise<EinfachErgebnis>`.

- [ ] **Step 1: Guides lesen**

`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (Abschnitt `formData`), `…/02-guides/server-actions.md` (Abschnitt „CSRF check" — gilt für Actions, nicht für Route Handler), `src/app/m/aufgaben/a/[id]/nachweis/hochladen/route.ts` (Kopfkommentar: Riegel in der Route, frühe `content-length`).

- [ ] **Step 2: Failing Tests schreiben**

`src/app/m/kommplan/_lib/herkunft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gleicheHerkunft } from "./herkunft";

const h = (k: Record<string, string>) => new Headers(k);
describe("gleicheHerkunft — der CSRF-Riegel der Route Handler (Entscheidung 3)", () => {
  it("gleicher Host samt Port: ja; x-forwarded-host geht vor host", () => {
    expect(gleicheHerkunft(h({ origin: "http://kommplan.localtest.me:3100", host: "kommplan.localtest.me:3100" }))).toBe(true);
    expect(gleicheHerkunft(h({ origin: "https://kommplan.iuk-ue.de", host: "suite:3000", "x-forwarded-host": "kommplan.iuk-ue.de" }))).toBe(true);
  });
  it("ein anderer Suite-Host (gleiche Site, anderer Origin), fehlender oder kaputter Origin: nein", () => {
    expect(gleicheHerkunft(h({ origin: "https://files.iuk-ue.de", "x-forwarded-host": "kommplan.iuk-ue.de" }))).toBe(false);
    expect(gleicheHerkunft(h({ host: "kommplan.iuk-ue.de" }))).toBe(false);
    expect(gleicheHerkunft(h({ origin: "null", host: "kommplan.iuk-ue.de" }))).toBe(false);
    expect(gleicheHerkunft(h({ origin: "https://kommplan.iuk-ue.de" }))).toBe(false);
  });
});
```

`src/app/m/kommplan/logo/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { sql } from "drizzle-orm";
import { queryAuditEvents } from "@/core/audit/storage";
import type { AvErgebnis } from "@/core/av/scanner";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-logo-route-test";
let gruppen: string[] | null = null;
let befund: AvErgebnis = { art: "clean" };
let scans = 0;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "u1", name: "Jana", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "kommplan.localtest.me" }) }));
vi.mock("../_lib/logoScan", () => ({ scanneLogo: async () => { scans += 1; return befund; } }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = ["iuk-kommplan-bearbeiten"]; befund = { art: "clean" }; scans = 0;
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
/** Ein echter Multipart-Rumpf mit content-length — wie ihn der Browser schickt. */
async function anfrage(datei: Blob | null, kopf: Record<string, string> = {}): Promise<Request> {
  const fd = new FormData();
  if (datei) fd.set("logo", datei, "logo.svg");
  const roh = new Request("http://kommplan.localtest.me/logo", { method: "POST", body: fd });
  const body = await roh.arrayBuffer();
  return new Request("http://kommplan.localtest.me/logo", {
    method: "POST", body,
    headers: { "content-type": roh.headers.get("content-type")!, "content-length": String(body.byteLength), origin: "http://kommplan.localtest.me", "x-forwarded-host": "kommplan.localtest.me", ...kopf },
  });
}
const logo = async () => (await import("../_lib/briefkopf")).ladeBriefkopf((await import("../_db/client")).getDb()).logo;

describe("POST /logo", () => {
  it("ohne Bearbeitungsrecht: 404, nichts gelesen, nichts gespeichert", async () => {
    const { POST } = await import("./route");
    gruppen = ["iuk-kommplan"];
    expect((await POST(await anfrage(new Blob([PNG])))).status).toBe(404);
    gruppen = null;
    expect((await POST(await anfrage(new Blob([PNG])))).status).toBe(404);
    expect(scans).toBe(0);
    expect(await logo()).toBeNull();
  });
  it("fremde Herkunft (anderer Suite-Host): 403 und eine access_denied-Zeile — der CSRF-Versuch hinterlässt eine Spur", async () => {
    const { POST } = await import("./route");
    expect((await POST(await anfrage(new Blob([PNG]), { origin: "http://files.localtest.me" }))).status).toBe(403);
    expect(scans).toBe(0);
    // Muster: aufgaben, hochladen/route.test.ts, describe „persisted upload denials …"
    const events = queryAuditEvents().events.filter((e) => e.action === "access_denied");
    expect(events).toHaveLength(1);
    expect(events[0].actor).toEqual({ kind: "user", id: "u1" });
  });
  it("zu groß laut content-length: 413, bevor gelesen wird; ohne Längenangabe (HTTP/2, Proxy) wird gelesen und an den Bytes gemessen", async () => {
    const { POST } = await import("./route");
    const r = await anfrage(new Blob([PNG]), { "content-length": String(2 * 1024 * 1024) });
    expect((await POST(r)).status).toBe(413);
    expect(scans).toBe(0);
    const mit = await anfrage(new Blob([PNG]));
    const kopf = new Headers(mit.headers); kopf.delete("content-length");
    const ohne = new Request(mit.url, { method: "POST", headers: kopf, body: await mit.arrayBuffer() });
    expect((await POST(ohne)).status).toBe(200);
  });
  it("Typ aus den Bytes: ein PNG namens logo.svg mit Content-Type text/plain wird als PNG gespeichert", async () => {
    const { POST } = await import("./route");
    const res = await POST(await anfrage(new Blob([PNG], { type: "text/plain" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, typ: "image/png" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await logo()).toEqual({ typ: "image/png", bytes: PNG.length });
  });
  it("Befund: 422 mit Meldung, nichts gespeichert; Audit nennt die Person bei Erfolg", async () => {
    const { POST } = await import("./route");
    befund = { art: "infected", signatur: "Eicar" };
    const abgelehnt = await POST(await anfrage(new Blob([PNG])));
    expect(abgelehnt.status).toBe(422);
    expect((await abgelehnt.json()).ok).toBe(false);
    expect(await logo()).toBeNull();
    befund = { art: "clean" };
    expect((await POST(await anfrage(new Blob([PNG])))).status).toBe(200);
    const { getDb } = await import("../_db/client");
    const akteure = getDb().all(sql`SELECT DISTINCT json_extract(actor, '$.id') AS id FROM audit_outbox WHERE object_type = 'briefkopf'`) as { id: string }[];
    expect(akteure).toEqual([{ id: "u1" }]);
  });
  it("ohne Feld „logo“: 400", async () => {
    const { POST } = await import("./route");
    expect((await POST(await anfrage(null))).status).toBe(400);
  });
});
```

`src/app/m/kommplan/_actions/briefkopf.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-actions-briefkopf-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "u1", name: "Jana", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "kommplan.localtest.me" }) }));
beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null;
});

describe("Briefkopf-Actions", () => {
  it("ohne Bearbeitungsrecht: Forbidden", async () => {
    const { entferneLogoAction, speichereOrganisationAction } = await import("./briefkopf");
    gruppen = ["iuk-kommplan"];
    await expect(speichereOrganisationAction({ organisation: "X" })).rejects.toThrow("Forbidden");
    await expect(entferneLogoAction()).rejects.toThrow("Forbidden");
  });
  it("Organisation setzen und Logo entfernen", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const { entferneLogoAction, speichereOrganisationAction } = await import("./briefkopf");
    expect(await speichereOrganisationAction({ organisation: "Muster" })).toEqual({ ok: true });
    expect(await speichereOrganisationAction("kaputt")).toMatchObject({ ok: false });
    expect(await entferneLogoAction()).toEqual({ ok: true });
    const { ladeBriefkopf } = await import("../_lib/briefkopf");
    const { getDb } = await import("../_db/client");
    expect(ladeBriefkopf(getDb())).toMatchObject({ organisation: "Muster", logo: null, aktualisiertVon: "Jana" });
  });
});
```

In `src/app/m/kommplan/riegel.test.ts`:
1. `AUSSERHALB` um `"logo/route.ts": "Route Handler für den Logo-Upload (Server Actions nehmen höchstens 1 MB): eigener Riegel und Herkunftsprüfung, Antwort statt notFound"` ergänzen.
2. Im `describe` anfügen:

```ts
  it("logo/route.ts trägt seinen Riegel selbst: Bearbeiten-Riegel und Herkunft je genau einmal, kein Datenbankzugriff davor", () => {
    const q = code("logo/route.ts");
    expect(zaehle(q, /await requireKommplanBearbeitenAktion\(\)/)).toBe(1);
    expect(zaehle(q, /gleicheHerkunft\(request\.headers\)/)).toBe(1);
    expect(q.indexOf("requireKommplanBearbeitenAktion()")).toBeLessThan(q.indexOf("getDb()"));
  });
```

- [ ] **Step 3: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/herkunft.test.ts src/app/m/kommplan/logo src/app/m/kommplan/_actions src/app/m/kommplan/riegel.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementieren**

`src/app/m/kommplan/_lib/herkunft.ts`:

```ts
/**
 * GLEICHE HERKUNFT für Route Handler (Umsetzungsplan Phase 4, Entscheidung 3). Server Actions vergleichen
 * `Origin` mit `Host`/`X-Forwarded-Host` selbst (`server-actions.md`, „CSRF check"); ein Route Handler tut
 * das nicht. Die Sitzung der Suite gilt für alle `*.iuk-ue.de` — „gleiche Site" reicht also nicht, eine
 * Seite auf einem anderen Modul-Host dürfte sonst mit der Sitzung der Nutzerin hochladen. Ohne `Origin`
 * (ein Browser schickt ihn bei jedem POST mit `fetch`) gilt die Anfrage als fremd. Rein: kein `next/*`.
 */
export function gleicheHerkunft(kopf: Headers): boolean {
  const origin = kopf.get("origin");
  const host = (kopf.get("x-forwarded-host") ?? kopf.get("host"))?.split(",")[0]?.trim();
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
```

`src/app/m/kommplan/logo/route.ts`:

```ts
import { auditActor, auditDenied, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { speichereLogo } from "../_lib/briefkopf";
import { gleicheHerkunft } from "../_lib/herkunft";
import { LOGO_FEHLER, LOGO_MAX_BYTES } from "../_lib/logo/logoTyp";
import { scanneLogo } from "../_lib/logoScan";
import { bearbeiterAus, requireKommplanBearbeitenAktion, type Viewer } from "../_lib/zugang";

/**
 * `POST /logo` — LOGO HOCHLADEN ODER ERSETZEN (Spec §4.4; Umsetzungsplan Phase 4, Entscheidung 3). Ein Route
 * Handler statt einer Server Action, weil Actions höchstens 1 MB annehmen und `serverActions.bodySizeLimit`
 * suiteweit ist (Vorbild `aufgaben/a/[id]/nachweis/hochladen/route.ts`).
 *
 * DER RIEGEL STEHT HIER (Route Handler haben kein Layout darüber; `riegel.test.ts` hält ihn): Host,
 * Anmeldung und Bearbeitungsrecht über `requireKommplanBearbeitenAktion` — ihr Wurf wird ein 404, damit
 * die Route sich nicht verrät —, dann die gleiche Herkunft (Nexts CSRF-Prüfung gilt nur für Actions), dann
 * früh die `content-length`: ohne den 1-MB-Deckel der Actions ist sie die einzige Bremse gegen eine Anfrage,
 * die absichtlich Gigabytes puffern lässt. Fehlt die Angabe (HTTP/2, ein Proxy mit chunked body), wird gelesen —
 * wie in `aufgaben` (`inhaltZuGross`); die maßgebliche Größenprüfung bleibt `pruefeLogoDatei` an den tatsächlich
 * gelesenen Bytes. `MULTIPART_RAND` ist keine zweite Grenze, nur Platz für den Rahmen.
 */
const KOPF = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } as const;
const MULTIPART_RAND = 16 * 1024;
const antwort = (status: number, koerper: unknown) => new Response(JSON.stringify(koerper), { status, headers: KOPF });

export async function POST(request: Request): Promise<Response> {
  let viewer: Viewer;
  try { viewer = await requireKommplanBearbeitenAktion(); } catch { return antwort(404, { ok: false, fehler: "Nicht gefunden." }); }
  if (!gleicheHerkunft(request.headers)) {
    // Lokale Abweisung ohne Wurf → access_denied (Suite-Regel für Route Handler, Manifest-Eintrag `denial`).
    auditDenied("kommplan", auditActor(viewer));
    return antwort(403, { ok: false, fehler: "Hochladen geht nur aus der Seite „Einstellungen“." });
  }
  const roh = request.headers.get("content-length");
  if (roh !== null && Number.isFinite(Number(roh)) && Number(roh) > LOGO_MAX_BYTES + MULTIPART_RAND) {
    return antwort(413, { ok: false, fehler: LOGO_FEHLER.gross });
  }
  let datei: FormDataEntryValue | null;
  try { datei = (await request.formData()).get("logo"); } catch { return antwort(400, { ok: false, fehler: "Die Anfrage ließ sich nicht lesen." }); }
  if (!(datei instanceof File)) return antwort(400, { ok: false, fehler: "Keine Datei erhalten." });
  const bytes = new Uint8Array(await datei.arrayBuffer());
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = await speichereLogo(getDb(), bytes, bearbeiterAus(viewer), Date.now(), (b) => scanneLogo(b));
    return antwort(r.ok ? 200 : 422, r);
  });
}
```

`src/app/m/kommplan/_actions/briefkopf.ts` (Byte 0 = `"use server";`):

```ts
"use server";

import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { entferneLogo, setzeOrganisation } from "../_lib/briefkopf";
import type { EinfachErgebnis } from "../_lib/ergebnis";
import { bearbeiterAus, requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Briefkopf (Spec §4.4): Organisationsname und „Logo entfernen". Hochladen ist der Route Handler `logo/route.ts`
// (Server Actions nehmen höchstens 1 MB an). Kein revalidatePath: die Seite ruft `router.refresh()`.

export async function speichereOrganisationAction(eingabe: unknown): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => setzeOrganisation(getDb(), eingabe, bearbeiterAus(viewer), Date.now()));
}

export async function entferneLogoAction(): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => entferneLogo(getDb(), bearbeiterAus(viewer), Date.now()));
}
```

`src/core/audit/coverage-manifest.json` — drei Einträge an ihrer alphabetischen Stelle (vor `…/_actions/plan.ts#…` bzw. nach `…/_actions/zeichen.ts#…`):

```json
  "src/app/m/kommplan/_actions/briefkopf.ts#entferneLogoAction": { "kind": "context", "via": "entferneLogoAction" },
  "src/app/m/kommplan/_actions/briefkopf.ts#speichereOrganisationAction": { "kind": "context", "via": "speichereOrganisationAction" },
  "src/app/m/kommplan/logo/route.ts#POST": {
    "kind": "context", "via": "POST",
    "denial": { "via": "POST", "reason": "Local nonthrowing origin (CSRF) rejection records access_denied; permission denials throw inside requireKommplanBearbeitenAktion and are audited there." }
  },
```

(In der Datei mehrzeilig formatiert wie die Nachbarn.) In `src/core/audit/coverage.test.ts`, Fall „keeps local masked denials covered independently of successful-read exclusions", die Liste `expected` um `"src/app/m/kommplan/logo/route.ts#POST"` ergänzen — der Fall prüft dann auch, dass `POST` `auditDenied(` enthält. (`requireKommplanBearbeitenAktion` auditiert Host- und Rechte-Ablehnung schon selbst — `auditDenied` bzw. `auditLoginRequired` vor dem Wurf —, der 404-Zweig braucht also keine zweite Zeile.)

- [ ] **Step 5: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/ src/core/audit/coverage.test.ts`
Expected: PASS, auch `_actions/plan.test.ts` (Bauform aller Action-Dateien).

- [ ] **Step 6: Build (Route Handler und Actions)**

```bash
uptime
pnpm build; echo "build exit $?"
```

Expected: Exit 0; in der Routenliste `ƒ /m/kommplan/logo`.

- [ ] **Step 7: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
for f in riegel.test.ts coverage-manifest.json coverage.test.ts; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
git add src/app/m/kommplan/_lib/herkunft.ts src/app/m/kommplan/_lib/herkunft.test.ts src/app/m/kommplan/logo src/app/m/kommplan/_actions/briefkopf.ts src/app/m/kommplan/_actions/briefkopf.test.ts src/app/m/kommplan/riegel.test.ts src/core/audit/coverage-manifest.json src/core/audit/coverage.test.ts
git commit -S -m "feat(kommplan): Logo hochladen, Organisation setzen, Logo entfernen

Upload als Route Handler mit eigenem Riegel, Herkunftsprüfung und früher
Größenprüfung; Organisation und Entfernen als Server Actions. Alles mit
Audit-Kontext der Person.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Kopf der Zeichnung aus dem Briefkopf — kein fest eingebautes Logo mehr

**Files:**
- Modify: `src/app/m/kommplan/_ui/zeichnung/Blatt.tsx` (`Rahmen`, `BlattKopf`, `LogoDefs`, `LOGO_ID`; rotes Kreuz weg)
- Modify: `src/app/m/kommplan/_lib/layout/masse.ts` (`LOGO_BOX`)
- Modify: `src/app/m/kommplan/_ui/zeichnung/farben.ts` (`marke` weg, Kommentar in derselben Zeile)
- Create: `src/app/m/kommplan/_ui/zeichnung/Druckblaetter.tsx`
- Modify: `src/app/m/kommplan/_lib/rahmen.ts` (Organisation/Logo als Argument), `src/app/m/kommplan/(intern)/p/[id]/druck/a4/page.tsx`, `scripts/kommplan-vorschau.ts`, `src/app/m/kommplan/_lib/seedLokal.ts`
- Modify: `src/app/m/kommplan/_lib/beispiele/label.ts`, `src/app/m/kommplan/_lib/beispiele/openr20220701.ts` (Feld `bearbeiter` ohne Organisationsnamen)
- Test: `src/app/m/kommplan/_ui/zeichnung/Blatt.test.tsx`, `src/app/m/kommplan/_ui/zeichnung/Druckblaetter.test.tsx` (neu), `src/app/m/kommplan/_lib/rahmen.test.ts`, `src/app/m/kommplan/_lib/seedLokal.test.ts`

**Interfaces:**
- Consumes: `KopfAngaben`, `kopfFuerZeichnung` (Task 5).
- Produces: `Rahmen` = `{ titel; untertitel: string | null; stand; bearbeiter; vermerkVsNfD: boolean; organisation: string | null; logo: { href: string } | null }`; `LOGO_ID = "kp-logo"`; `LogoDefs({ logo })` (ein `<image>` ohne `<defs>`-Hülle); `BlattKopf({ rahmen, breite })`; `kopfTitel(titel, platz): { text; groesse }`; `ORGANISATION_MAX = 80` (mm); `Druckblaetter({ blaetter, rahmen, symbole, schrift })`; `LOGO_BOX = { breite: 40, hoehe: 11, luft: 3 }`; `rahmenFuer(p: { …wie bisher…; kopf: KopfAngaben }): Rahmen`.

- [ ] **Step 1: Alle Verbraucher finden (Typänderung in einem Commit)**

```bash
git grep -n "rahmenFuer\|Rahmen\b\|organisation\|FARBE.marke\|Rotes Kreuz" -- src scripts e2e
git grep -n -i "DRK\|Kreisverband" -- src/app/m/kommplan scripts/kommplan-vorschau.ts e2e/kommplan* | grep -v "DRK-[0-9]"
```

Expected (Stand der Planung): `rahmen.ts`, `rahmen.test.ts`, `Blatt.tsx`, `Blatt.test.tsx`, `druck/a4/page.tsx`, `scripts/kommplan-vorschau.ts`, `farben.ts`. Die zweite Suche findet außerdem das Feld `bearbeiter` der Beispiele `label.ts` („DRK Kreisverband Uelzen e. V. · Der Kreisbereitschaftsleiter") und `openr20220701.ts` („KBL DRK Kreisverband Uelzen e. V.") — es wird im Fuß als „Bearbeitung: …" gedruckt und trägt so eine echte Organisation auf das Blatt der Seed-Pläne; beide werden neutral („Kreisbereitschaftsleitung" bzw. „KBL"). Kontaktwerte in Beispielen, Zufallsplänen und Tests (E-Mail-Adressen mit „drk") sind Inhalt eines Plans, kein Briefkopf, und bleiben. Jede Fundstelle wird in dieser Aufgabe angepasst. Golden-Dateien (`_lib/layout/__golden__`) tragen keinen Kopf — prüfen mit `git grep -n "Rotes\|c8000f" -- src/app/m/kommplan` (nach der Aufgabe leer).

- [ ] **Step 2: Failing Tests schreiben**

`src/app/m/kommplan/_ui/zeichnung/Blatt.test.tsx`: `rahmen` oben auf `organisation: null, logo: null` umstellen und in der Liste des ersten Tests `"Deutsches Rotes Kreuz"` streichen. Anfügen:

```ts
  it("ohne Briefkopf steht im Kopf nichts: kein Name, kein Logo, kein Rot (Spec §4.4)", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    const html = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={rahmen} symbole={{}} />);
    expect(html).not.toMatch(/data-organisation|data-logo|<image|kp-logo/);
    expect(html.toLowerCase()).not.toContain("#c8000f");
  });
  it("ein 200-Zeichen-Titel läuft nie in Organisation oder Logo-Box: erst kleiner, dann gekürzt (Kritik)", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    const lang = "Kommunikationsplan Großeinsatz ".repeat(7).slice(0, 200);
    const logo = { href: "data:image/png;base64,iVBORw0KGgo=" };
    const html = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={{ ...rahmen, titel: lang, organisation: "Musterorganisation", logo }} symbole={{}} />);
    const platz = 244 - textBreite("Musterorganisation", 9, true) - 3 - 10; // Organisation links von der Box, Luft, Rand
    const k = kopfTitel(lang, platz);
    expect(k.groesse).toBe(10);
    expect(k.text.endsWith("…")).toBe(true);
    expect(textBreite(k.text, k.groesse, true)).toBeLessThanOrEqual(platz);
    expect(html).toContain(`>${k.text}</text>`);
    expect(kopfTitel("Kurz", 100)).toEqual({ text: "Kurz", groesse: 14 });
    expect(kopfTitel("Ein mittellanger Plantitel", textBreite("Ein mittellanger Plantitel", 12, true)).groesse).toBe(12);
  });
  it("nur Organisation: rechtsbündig am Rand; mit Logo: links neben der Logo-Box, Logo per <use>", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    const nurName = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={{ ...rahmen, organisation: "Musterorganisation" }} symbole={{}} />);
    expect(nurName).toMatch(/<text x="287"[^>]*text-anchor="end"[^>]*data-organisation="">Musterorganisation<\/text>/);
    const logo = { href: "data:image/png;base64,iVBORw0KGgo=" };
    const mit = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={{ ...rahmen, organisation: "Musterorganisation", logo }} symbole={{}} />);
    expect(mit).toMatch(/<text x="244"[^>]*data-organisation="">Musterorganisation/);
    // renderToStaticMarkup schließt SVG-Elemente mit eigenem End-Tag (`<use …></use>`), nicht mit `/>` — deshalb `[^>]*>`.
    expect(mit).toMatch(/<use href="#kp-logo" x="247" y="8" data-logo=""[^>]*>/);
    expect(mit).toMatch(/<image id="kp-logo" width="40" height="11" preserveAspectRatio="xMaxYMid meet" href="data:image\/png;base64,iVBORw0KGgo="[^>]*>/);
  });
```

(Importe `kopfTitel` aus `./Blatt` und `textBreite` aus `../../_lib/layout/text` in die vorhandenen Zeilen. Spaltenwerte: `rechts = 297 − BLATT.randX (10) = 287`, `logoX = 287 − 40 = 247`, Name bei `247 − 3 = 244`; `y = BLATT.randOben = 8`. Ändert sich ein Maß, die Erwartung aus den Konstanten nachrechnen, nicht die Konstante an den Test binden. Reihenfolge der Attribute im Regex an React anpassen, falls es anders serialisiert — Aussage bleibt.)

`src/app/m/kommplan/_ui/zeichnung/Druckblaetter.test.tsx`:

```ts
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BEISPIELE } from "../../_lib/beispiele";
import { teileAuf } from "../../_lib/layout/papier";
import type { Rahmen } from "./Blatt";
import { Druckblaetter } from "./Druckblaetter";

const RAHMEN: Rahmen = { titel: "T", untertitel: null, stand: "Stand", bearbeiter: "B", vermerkVsNfD: true, organisation: "Musterorganisation", logo: { href: "data:image/png;base64,QUJD" } };
const zaehle = (s: string, t: string) => s.split(t).length - 1;

describe("Druckblaetter", () => {
  it("das Logo steht EINMAL im Dokument, jedes Blatt verweist darauf (Entscheidung 6)", () => {
    const gross = BEISPIELE.find((b) => b.id === "beispiel-grosse-stabslage")!;
    const blaetter = teileAuf(gross.inhalt, "a4-quer");
    expect(blaetter.length).toBeGreaterThan(1);
    const html = renderToStaticMarkup(<Druckblaetter blaetter={blaetter} rahmen={RAHMEN} symbole={{}} schrift="Arimo" />);
    expect(zaehle(html, "data:image/png;base64,QUJD")).toBe(1);
    expect(zaehle(html, 'href="#kp-logo"')).toBe(blaetter.length);
    expect(zaehle(html, 'class="kp-blatt"')).toBe(blaetter.length);
  });
  it("ohne Logo kein <image> und kein Verweis", () => {
    const blaetter = teileAuf(BEISPIELE[0].inhalt, "a4-quer");
    const html = renderToStaticMarkup(<Druckblaetter blaetter={blaetter} rahmen={{ ...RAHMEN, logo: null }} symbole={{}} schrift="Arimo" />);
    expect(html).not.toMatch(/<image|kp-logo/);
  });
});
```

(Den Schlüssel der großen Stab-Lage aus `_lib/beispiele/index.ts` übernehmen, falls er anders heißt.)

`src/app/m/kommplan/_lib/rahmen.test.ts`: den Fall „Stand in der Suite-Zone" auf

```ts
    const r = rahmenFuer({ titel: "T", anlass: "Einsatz", datum: Date.UTC(2026, 1, 22), aktualisiertAm: Date.UTC(2026, 8, 30, 9, 56), aktualisiertVon: "BL BVS", vermerkVsNfD: true,
      kopf: { organisation: "Musterorganisation", logo: null } });
    expect(r).toEqual({
      titel: "T", untertitel: "Einsatz · 22.02.2026", stand: "Stand: 30.09.2026, 11:56", bearbeiter: "Bearbeitung: BL BVS",
      vermerkVsNfD: true, organisation: "Musterorganisation", logo: null,
    });
```

umstellen, im dritten Fall `kopf: { organisation: null, logo: null }` ergänzen, und anfügen:

```ts
  it("kein Organisationsname aus dem Code: ohne Briefkopf bleibt er null", () => {
    expect(rahmenFuer({ titel: "T", anlass: null, datum: null, aktualisiertAm: 0, aktualisiertVon: "x", vermerkVsNfD: false, kopf: { organisation: null, logo: null } }).organisation).toBeNull();
  });
```

`src/app/m/kommplan/_lib/seedLokal.test.ts`: Import `briefkopf` aus `../_db/schema` ergänzen und anfügen:

```ts
  it("Briefkopf: höchstens ein neutraler Organisationsname, KEIN Logo (Entscheidung 6)", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    expect(db.select().from(briefkopf).get()).toMatchObject({ organisation: "Musterorganisation", logo: null, logoMime: null });
    db.update(briefkopf).set({ organisation: "lokal" }).run();
    await seedLokalKommplan(db);
    expect(db.select().from(briefkopf).get()?.organisation).toBe("lokal");
  });
```

- [ ] **Step 3: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/zeichnung src/app/m/kommplan/_lib/rahmen.test.ts src/app/m/kommplan/_lib/seedLokal.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementieren**

`_lib/layout/masse.ts` — hinter `BLATT` einfügen:

```ts
/** Kopf-Box des Logos (Umsetzungsplan Phase 4, Entscheidung 6): rechts oben, mm; `luft` zum Organisationsnamen. */
export const LOGO_BOX = { breite: 40, hoehe: 11, luft: 3 } as const;
```

`_ui/zeichnung/farben.ts`: `marke: "#c8000f"` aus `FARBE` streichen; im Kommentar **in derselben Zeile** „Suite-Rot nur als Marke im Kopf," durch „kein Suite-Rot, auch nicht im Kopf," ersetzen.

`_ui/zeichnung/Blatt.tsx`: Import `LOGO_BOX` aus `masse` und `kuerze`, `textBreite` aus `../../_lib/layout/text` ergänzen; `Rahmen` und Kopf ersetzen:

```tsx
/** Die vom Aufrufer formatierten Rahmentexte — der Renderer kennt weder Uhr noch Zeitzone. Organisation und
 *  Logo kommen aus dem Briefkopf (Spec §4.4), nie aus dem Code; `null` = die Stelle bleibt leer. */
export interface Rahmen {
  titel: string; untertitel: string | null; stand: string; bearbeiter: string; vermerkVsNfD: boolean;
  organisation: string | null; logo: { href: string } | null;
}

export const LOGO_ID = "kp-logo";
/**
 * Das Logo EINMAL je Dokument (Umsetzungsplan Phase 4, Entscheidung 6): als `<image>` mit `data:`-URI —
 * keine Bildroute, und ein SVG-Logo führt im Bildkontext nie Skript aus. Jedes Blatt verweist per `<use>`
 * darauf; die Druckseite stellt es mit den Symbolen in ein gemeinsames `<defs>` (`Druckblaetter`).
 * `meet` hält das Seitenverhältnis in der festen Box, rechtsbündig.
 */
export function LogoDefs({ logo }: { logo: Rahmen["logo"] }) {
  return logo ? <image id={LOGO_ID} width={LOGO_BOX.breite} height={LOGO_BOX.hoehe} preserveAspectRatio="xMaxYMid meet" href={logo.href} /> : null;
}

/** Höchstbreite des Organisationsnamens im Kopf (mm) — ein langer Vereinsname drückt den Titel nicht weg. */
export const ORGANISATION_MAX = 80;
const TITEL_PT = { start: 14, min: 10 } as const;

/**
 * Der Plantitel im Kopf (bis 200 Zeichen) passt in `platz` mm: erst in halben Punkten bis 10 pt kleiner (wie
 * die Kartentitel in `karte.ts`), dann mit „…" gekürzt. Nie läuft er in Organisation oder Logo-Box (Kritik).
 */
export function kopfTitel(titel: string, platz: number): { text: string; groesse: number } {
  for (let g: number = TITEL_PT.start; g >= TITEL_PT.min; g -= 0.5) if (textBreite(titel, g, true) <= platz) return { text: titel, groesse: g };
  return { text: kuerze(titel, platz, TITEL_PT.min, true).text, groesse: TITEL_PT.min };
}

export function BlattKopf({ rahmen, breite }: { rahmen: Rahmen; breite: number }) {
  const rechts = breite - BLATT.randX;
  const kopfY = BLATT.randOben;
  const logoX = rechts - LOGO_BOX.breite;
  const orgRechts = rahmen.logo ? logoX - LOGO_BOX.luft : rechts;
  const org = rahmen.organisation ? kuerze(rahmen.organisation, ORGANISATION_MAX, 9, true).text : null;
  const belegtAb = org ? orgRechts - textBreite(org, 9, true) : rahmen.logo ? logoX : rechts;
  const titel = kopfTitel(rahmen.titel, belegtAb - LOGO_BOX.luft - BLATT.randX);
  return (
    <g data-kopf="">
      <text x={BLATT.randX} y={kopfY + 6} fontSize={pt(titel.groesse)} fontWeight={700}>{titel.text}</text>
      {rahmen.untertitel ? <text x={BLATT.randX} y={kopfY + 11.5} fontSize={pt(9)}>{rahmen.untertitel}</text> : null}
      {rahmen.logo ? <use href={`#${LOGO_ID}`} x={logoX} y={kopfY} data-logo="" /> : null}
      {org ? (
        <text x={orgRechts} y={kopfY + 6} fontSize={pt(9)} fontWeight={700} textAnchor="end" data-organisation="">{org}</text>
      ) : null}
      <line x1={BLATT.randX} y1={kopflinieY()} x2={rechts} y2={kopflinieY()} stroke={FARBE.tinte} strokeWidth={STRICH.duenn} />
    </g>
  );
}
```

In `Blattansicht` den Block von `{/* Kopf */}` bis einschließlich der Kopflinie durch `<BlattKopf rahmen={rahmen} breite={p.breite} />` ersetzen, die Variablen `kopfY` (wird nicht mehr gebraucht — `rechts` bleibt für den Fuß) aufräumen, und `{mitDefs ? <SymbolDefs symbole={symbole} /> : null}` ersetzen durch

```tsx
      {mitDefs ? <SymbolDefs symbole={symbole} /> : null}
      {mitDefs && rahmen.logo ? <defs><LogoDefs logo={rahmen.logo} /></defs> : null}
```

`_ui/zeichnung/Druckblaetter.tsx` (kein `"use client"`):

```tsx
import type { Blatt } from "../../_lib/layout/typen";
import { Blattansicht, LogoDefs, type Rahmen } from "./Blatt";
import { SymbolDefs, type Symbolsatz } from "./Symbole";

/**
 * Alle Blätter einer Druckseite: Symbole und Logo EINMAL in einem unsichtbaren SVG, jedes Blatt verweist
 * per `<use>` darauf (Befund M11; Umsetzungsplan Phase 4, Entscheidung 6 — ein 1-MB-Logo je Blatt wäre
 * ein Vielfaches davon). Die DOM-Form ist die bisherige der Druckseite (`druck.css`, `.kp-symbole`).
 */
export function Druckblaetter({ blaetter, rahmen, symbole, schrift }: { blaetter: Blatt[]; rahmen: Rahmen; symbole: Symbolsatz; schrift?: string }) {
  return (
    <>
      <svg className="kp-symbole" width="0" height="0" aria-hidden="true" focusable="false">
        <SymbolDefs symbole={symbole} />
        {rahmen.logo ? <defs><LogoDefs logo={rahmen.logo} /></defs> : null}
      </svg>
      {blaetter.map((b) => <Blattansicht key={b.nummer} blatt={b} rahmen={rahmen} symbole={symbole} schrift={schrift} mitDefs={false} />)}
    </>
  );
}
```

`_lib/rahmen.ts`: Import `import type { KopfAngaben } from "./briefkopf";` — **nein**: `briefkopf.ts` zieht `node:crypto` und die Datenbank. Stattdessen den Typ strukturell nehmen: `kopf: Pick<Rahmen, "organisation" | "logo">` in der Parameterliste, und im Rückgabewert `organisation: p.kopf.organisation, logo: p.kopf.logo` statt des Literals.

`(intern)/p/[id]/druck/a4/page.tsx`: `kopfFuerZeichnung` aus `@/app/m/kommplan/_lib/briefkopf` importieren, `rahmenFuer({ …, kopf: kopfFuerZeichnung(getDb()) })`; den Block aus `<svg className="kp-symbole">…</svg>` und `blaetter.map(…)` durch `<Druckblaetter blaetter={blaetter} rahmen={rahmen} symbole={symbole} schrift={ARIMO.style.fontFamily} />` ersetzen (Importe `SymbolDefs`, `Blattansicht` fallen weg).

`scripts/kommplan-vorschau.ts`: im `rahmenFuer`-Aufruf `kopf: { organisation: null, logo: null }` ergänzen (die Vorschau zeigt den Kopf ohne Briefkopf, wie eine frische Suite).

`_lib/seedLokal.ts`: Import `briefkopf` ergänzen und vor dem `return` einfügen:

```ts
  // Briefkopf (Spec §4.4, Entscheidung 6): ein NEUTRALER Name für die lokale Ansicht, nie ein Logo und nie
  // eine echte Organisation — das trägt der Betrieb unter „Einstellungen" ein.
  const kopf = db.insert(briefkopf).values({ id: 1, organisation: "Musterorganisation", aktualisiertAm: new Date(0), aktualisiertVon: "Seed" }).onConflictDoNothing().run().changes;
```

und die Rückgabezeile um `, Briefkopf ${kopf}` ergänzen.

`_lib/beispiele/label.ts`: `bearbeiter: "Kreisbereitschaftsleitung"`; `_lib/beispiele/openr20220701.ts`: `bearbeiter: "KBL"` (je in derselben Zeile; Tests, die den alten Wortlaut erwarten, gibt es laut Suche nicht — sonst mitziehen).

- [ ] **Step 5: Grün sehen, Rest suchen**

```bash
pnpm vitest run src/app/m/kommplan/
git grep -n -i "rotes kreuz\|c8000f\|FARBE.marke\|Kreisverband" -- src/app/m/kommplan scripts/kommplan-vorschau.ts e2e/kommplan*
```

Expected: PASS; die Suche ist leer. (Fundstellen in Plänen/Specs unter `docs/` bleiben — sie beschreiben die Geschichte.)

- [ ] **Step 6: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
for f in Blatt.tsx farben.ts masse.ts rahmen.ts seedLokal.ts label.ts openr20220701.ts kommplan-vorschau.ts page.tsx; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
git add src/app/m/kommplan/_ui/zeichnung src/app/m/kommplan/_lib/layout/masse.ts src/app/m/kommplan/_lib/rahmen.ts src/app/m/kommplan/_lib/rahmen.test.ts src/app/m/kommplan/_lib/seedLokal.ts src/app/m/kommplan/_lib/seedLokal.test.ts src/app/m/kommplan/_lib/beispiele/label.ts src/app/m/kommplan/_lib/beispiele/openr20220701.ts "src/app/m/kommplan/(intern)/p/[id]/druck/a4/page.tsx" scripts/kommplan-vorschau.ts
git commit -S -m "feat(kommplan): Kopf der Zeichnung mit Logo und Name aus dem Briefkopf

Das fest eingebaute rote Kreuz und der Organisationsname im Code sind
weg. Ohne Eintrag bleibt die Stelle leer; ein Logo steht einmal je
Dokument und wird je Blatt eingepasst. Der lokale Seed trägt nur den
Namen Musterorganisation.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Riegel der Verwaltungsseiten und Wege dorthin

**Files:**
- Modify: `src/app/m/kommplan/_lib/zugang.ts` (`pruefeKommplanBearbeiten`)
- Create: `src/app/m/kommplan/(intern)/(verwaltung)/layout.tsx`
- Modify: `src/app/m/kommplan/riegel.test.ts` (Klausel für `(intern)/(verwaltung)/`)
- Modify: `src/app/m/kommplan/(intern)/page.tsx` (Links im Seitenkopf), `src/app/m/kommplan/_ui/kommplan.css` (`.kp-kopfaktionen`, `.kp-abschnittstitel`)
- Test: `src/app/m/kommplan/_lib/zugang.test.ts`

**Interfaces:**
- Produces: `pruefeKommplanBearbeiten(viewer: Viewer): void` — wirft `notFound()` mit `auditDenied`, wenn `!darfKommplanBearbeiten(viewer.groups)`.

- [ ] **Step 1: Failing Tests schreiben**

In `src/app/m/kommplan/_lib/zugang.test.ts` den Import um `pruefeKommplanBearbeiten` ergänzen und anfügen:

```ts
describe("Seitenriegel der Verwaltungsseiten (Phase 4, Entscheidung 16)", () => {
  beforeEach(() => { audit.denied.mockReset(); });
  it("Bearbeitende kommen durch; die Zugangsgruppe bekommt 404 mit Audit", () => {
    expect(() => pruefeKommplanBearbeiten({ sub: "u1", groups: ["iuk-kommplan-bearbeiten"] } as never)).not.toThrow();
    expect(() => pruefeKommplanBearbeiten({ sub: "u2", groups: ["iuk-kommplan"] } as never)).toThrow("NEXT_NOT_FOUND");
    expect(audit.denied).toHaveBeenCalledTimes(1);
  });
});
```

In `src/app/m/kommplan/riegel.test.ts` im `describe` anfügen:

```ts
  it.each(routen.filter((p) => p.startsWith("(intern)/(verwaltung)/")))("%s prüft zusätzlich das Bearbeitungsrecht (pruefeKommplanBearbeiten(viewer))", (datei) => {
    expect(zaehle(code(datei), /pruefeKommplanBearbeiten\(viewer\)/)).toBe(1);
  });
  it("die Verwaltungsgruppe gibt es und sie ist nicht leer (sonst wäre der Fall darüber leer-grün)", () => {
    expect(routen.filter((p) => p.startsWith("(intern)/(verwaltung)/")).length).toBeGreaterThanOrEqual(1);
  });
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/zugang.test.ts src/app/m/kommplan/riegel.test.ts`
Expected: FAIL (Funktion fehlt; Gruppe leer).

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_lib/zugang.ts` — nach `requireKommplanZugang` einfügen:

```ts
/**
 * Seitenriegel der Verwaltungsseiten Bibliothek und Einstellungen (Umsetzungsplan Phase 4, Entscheidung 16):
 * nach `requireKommplanZugang` zusätzlich das Bearbeitungsrecht — sonst 404, damit sich die Seite nicht
 * verrät. Dasselbe Prädikat wie die Links in der Planliste und jede Server Action.
 */
export function pruefeKommplanBearbeiten(viewer: Viewer): void {
  if (darfKommplanBearbeiten(viewer.groups)) return;
  auditDenied("kommplan", auditActor(viewer));
  notFound();
}
```

`src/app/m/kommplan/(intern)/(verwaltung)/layout.tsx`:

```tsx
import { headers } from "next/headers";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { pruefeKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";

/**
 * VERWALTUNG (Bibliothek, Einstellungen; Umsetzungsplan Phase 4, Entscheidung 16): Host, Zugang UND
 * Bearbeitungsrecht oberhalb jeder künftigen `loading.tsx` (Falle 23). Die Seiten prüfen selbst noch
 * einmal — Layouts und Seiten rendern parallel, ein Layout ist kein Vorab-Riegel.
 */
export default async function VerwaltungLayout({ children }: { children: React.ReactNode }) {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  pruefeKommplanBearbeiten(viewer);
  return children;
}
```

`src/app/m/kommplan/(intern)/page.tsx` — Seitenkopf-Aktionen (die Vorlagen-Tabelle folgt in Task 13):

```tsx
      <Seitenkopf titel="Kommunikationspläne" beschreibung="Pläne und Fernmeldeskizzen deiner Einsätze. Öffne einen Plan, um ihn anzusehen, zu bearbeiten oder auf A4 zu drucken."
        aktionen={
          <div className="kp-kopfaktionen">
            {darf ? <NeuerPlan /> : null}
            {darf ? <Link href="/bibliothek">Bibliothek</Link> : null}
            {darf ? <Link href="/einstellungen">Einstellungen</Link> : null}
            <Link href="/archiv">Archiv</Link>
          </div>
        } />
```

mit `const darf = darfKommplanBearbeiten(viewer.groups);` und `import Link from "next/link";`. In `_ui/kommplan.css` (außerhalb der Media-Blöcke):

```css
/* Seitenkopf der Planliste (Phase 4, Entscheidung 1): „Neu" und die Wege zu Bibliothek, Einstellungen, Archiv. */
.kp-kopfaktionen { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
.kp-kopfaktionen > a { min-height: 44px; display: inline-flex; align-items: center; }
.kp-abschnittstitel { font-size: 16px; font-weight: 600; margin: 24px 0 8px; }
```

und im vorhandenen Block `@media (max-width: 767.98px)`:

```css
  /* Der Aktionsbehälter des Seitenkopfs (core, ohne Klasse) ist ein Flex-Kind so breit wie sein Inhalt — ohne
     diese Regel bliebe auch das Raster darin schmal (Gegenstück zur Regel für .kp-kopfwerkzeuge im Editor). */
  div:has(> .kp-kopfaktionen) { flex: 1 1 100%; }
  .kp-kopfaktionen { display: grid; grid-template-columns: minmax(0, 1fr); }
  .kp-kopfaktionen > a { justify-content: center; }
```

(Handlungsknöpfe unter 768 px voll breit und untereinander, docs/design/README.md „Mobil". Rasterkinder strecken sich von selbst; keine Regel gegen `.ant-btn`, Falle 20.) Task 24 misst am Foto `liste-telefon` die Breite von „Neu" und „Archiv": ≈ Inhaltsbreite.

Hinweis: `(intern)/(verwaltung)/layout.tsx` allein ist keine Route; `riegel.test.ts` zählt es trotzdem mit (`ROUTENDATEI` schließt `layout` ein) — darum ist die Gruppe ab hier „nicht leer". Die Seiten folgen in Task 9 und 17.

- [ ] **Step 4: Grün sehen, Build**

Run: `pnpm vitest run src/app/m/kommplan/` und `pnpm build; echo "build exit $?"`
Expected: PASS; Build Exit 0 (die Gruppe ohne Seite ist für Next zulässig — schlägt der Build an einem leeren Segment fehl, das Layout erst mit Task 9 committen und hier nur `zugang.ts`/Test/Planliste).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
for f in zugang.ts riegel.test.ts page.tsx kommplan.css; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
pnpm anker:drift src/app/m/kommplan/_ui/kommplan.css
git add src/app/m/kommplan/_lib/zugang.ts src/app/m/kommplan/_lib/zugang.test.ts "src/app/m/kommplan/(intern)/(verwaltung)/layout.tsx" src/app/m/kommplan/riegel.test.ts "src/app/m/kommplan/(intern)/page.tsx" src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Riegel und Wege für Bibliothek, Einstellungen und Archiv

Verwaltungsseiten nur für Bearbeitende (sonst 404 mit Audit), Links im
Seitenkopf der Planliste hinter demselben Prädikat.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Seite „Einstellungen" — Organisation, Logo, Vorschau des Kopfs

**Files:**
- Create: `src/app/m/kommplan/(intern)/(verwaltung)/einstellungen/page.tsx`
- Create: `src/app/m/kommplan/_ui/einstellungen/KopfVorschau.tsx` (rein), `src/app/m/kommplan/_ui/einstellungen/Briefkopf.tsx` (`"use client"`)
- Modify: `src/app/m/kommplan/_ui/kommplan.css` (`.kp-kopfvorschau`, `.kp-dateifeld`)
- Test: `src/app/m/kommplan/_ui/einstellungen/KopfVorschau.test.tsx`, `src/app/m/kommplan/_ui/einstellungen/Briefkopf.test.tsx`

**Interfaces:**
- Consumes: `ladeBriefkopf`, `kopfFuerZeichnung` (Task 5), `speichereOrganisationAction`, `entferneLogoAction`, `POST /logo` (Task 6), `BlattKopf`, `LogoDefs` (Task 7), `LAENGE_ORGANISATION`, `LOGO_ANNAHME`, `LOGO_TYP_NAME`.
- Produces: `KopfVorschau({ kopf, schrift })`; `BriefkopfFormular({ organisation, logo })` mit DOM-Vertrag: Formular `aria-label="Organisation"`, Feld `name="organisation"`, Knopf „Speichern"; Bereich `aria-label="Logo"` mit Text „Kein Logo hinterlegt." bzw. „Logo: <Typ>, <n> KB", Knöpfe „Logo hochladen"/„Logo ersetzen", „Logo entfernen" (nur mit Logo), Dateifeld `input[type=file][name=logo]`; Meldungen in `[role="status"]`.

- [ ] **Step 1: Failing Tests schreiben**

`src/app/m/kommplan/_ui/einstellungen/KopfVorschau.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KopfVorschau } from "./KopfVorschau";

describe("KopfVorschau", () => {
  it("zeigt den Kopf, wie er gedruckt wird — mit Logo einmal als <image>, mit Namen", () => {
    const html = renderToStaticMarkup(<KopfVorschau kopf={{ organisation: "Musterorganisation", logo: { href: "data:image/png;base64,QUJD" } }} />);
    expect(html).toContain('aria-label="Vorschau des Kopfs: Musterorganisation, mit Logo"');
    expect(html.split("data:image/png;base64,QUJD").length - 1).toBe(1);
    expect(html).toContain('href="#kp-logo"');
    expect(html).toContain("Musterorganisation");
  });
  it("ohne Briefkopf: leerer Platz, ausdrücklich so benannt", () => {
    const html = renderToStaticMarkup(<KopfVorschau kopf={{ organisation: null, logo: null }} />);
    expect(html).toContain('aria-label="Vorschau des Kopfs: ohne Organisation, ohne Logo"');
    expect(html).not.toMatch(/<image|data-organisation/);
  });
});
```

`src/app/m/kommplan/_ui/einstellungen/Briefkopf.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, exists, fill, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";

const aktion = vi.hoisted(() => ({ name: vi.fn(), entferne: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("../../_actions/briefkopf", () => ({ speichereOrganisationAction: aktion.name, entferneLogoAction: aktion.entferne }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { BriefkopfFormular } from "./Briefkopf";

const abwarten = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** Knopf oder Menüeintrag nach sichtbarem Text — auch in Portalen (Popconfirm, Dropdown hängen am body). */
const knopf = (text: string) => [...document.querySelectorAll<HTMLElement>("button, [role='menuitem']")].find((b) => b.textContent?.trim() === text)!;
beforeEach(() => {
  aktion.name.mockReset().mockResolvedValue({ ok: true });
  aktion.entferne.mockReset().mockResolvedValue({ ok: true });
  router.refresh.mockReset();
});
afterEach(async () => { await unmount(); vi.unstubAllGlobals(); });

describe("BriefkopfFormular", () => {
  it("ohne Logo: Hinweis, „Logo hochladen“, kein „Logo entfernen“", async () => {
    await mount(<BriefkopfFormular organisation={null} logo={null} />);
    expect(query('[aria-label="Logo"]').textContent).toContain("Kein Logo hinterlegt.");
    expect(query('[aria-label="Logo"]').textContent).toContain("Logo hochladen");
    expect(query('[aria-label="Logo"]').textContent).not.toContain("Logo entfernen");
    expect(query('input[type="file"][name="logo"]').getAttribute("accept")).toContain("image/svg+xml");
  });
  it("Organisation speichern: Action, Meldung, Seite neu", async () => {
    await mount(<BriefkopfFormular organisation="Alt" logo={null} />);
    await fill('input[name="organisation"]', "Kreisverband Muster");
    await submitForm('form[aria-label="Organisation"]');
    await abwarten();
    expect(aktion.name).toHaveBeenCalledWith({ organisation: "Kreisverband Muster" });
    expect(query('[role="status"]').textContent).toBe("Organisation gespeichert.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("Logo hochladen: POST /logo mit Feld „logo“; Ablehnung steht als Warnung da, ohne Neuladen", async () => {
    const abruf = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ ok: false, fehler: "Erlaubt sind PNG, JPEG, WebP und SVG." }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, typ: "image/svg+xml" }) });
    vi.stubGlobal("fetch", abruf);
    await mount(<BriefkopfFormular organisation={null} logo={null} />);
    const feld = query<HTMLInputElement>('input[type="file"][name="logo"]');
    const waehle = async (datei: File) => act(async () => {
      Object.defineProperty(feld, "files", { value: [datei], configurable: true });
      feld.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waehle(new File(["GIF89a"], "logo.gif"));
    await abwarten();
    expect(abruf.mock.calls[0][0]).toBe("/logo");
    expect((abruf.mock.calls[0][1].body as FormData).get("logo")).toBeInstanceOf(File);
    expect(query('[role="status"]').textContent).toBe("Erlaubt sind PNG, JPEG, WebP und SVG.");
    expect(router.refresh).not.toHaveBeenCalled();
    await waehle(new File(["<svg/>"], "logo.svg"));
    await abwarten();
    expect(query('[role="status"]').textContent).toBe("Logo übernommen (SVG).");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("mit Logo: Typ und Größe, „Logo ersetzen“; „Logo entfernen“ fragt nach und entfernt", async () => {
    await mount(<BriefkopfFormular organisation="Muster" logo={{ typ: "image/png", bytes: 12_800 }} />);
    expect(query('[aria-label="Logo"]').textContent).toContain("Logo: PNG, 13 KB");
    expect(query('[aria-label="Logo"]').textContent).toContain("Logo ersetzen");
    await clickElement(knopf("Logo entfernen"));
    await clickElement(knopf("Entfernen"));
    await abwarten();
    expect(aktion.entferne).toHaveBeenCalledTimes(1);
    expect(query('[role="status"]').textContent).toBe("Logo entfernt.");
    expect(exists('[role="status"]')).toBe(true);
  });
});
```

Harness: `fill(selektor, wert)`, `submitForm(selektor)`, `clickElement(el)`; Portale (Popconfirm, Dropdown) hängen am `body` — `knopf(text)` sucht dort mit.

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/einstellungen`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_ui/einstellungen/KopfVorschau.tsx`:

```tsx
import { BLATT, PAPIER } from "../../_lib/layout/masse";
import { BlattKopf, LogoDefs, type Rahmen } from "../zeichnung/Blatt";
import { FARBE } from "../zeichnung/farben";

/**
 * VORSCHAU DES KOPFS (Spec §4.4): derselbe `BlattKopf` wie auf jedem gedruckten Blatt, im Maßstab der
 * Seitenbreite — was hier steht, steht so auf dem Papier. Rein (Server Component); die Einstellungsseite
 * rendert sie nach jeder Änderung neu (`router.refresh()`).
 */
export function KopfVorschau({ kopf, schrift }: { kopf: Pick<Rahmen, "organisation" | "logo">; schrift?: string }) {
  const breite = PAPIER["a4-quer"].breite;
  const rahmen: Rahmen = { titel: "Kommunikationsplan (Beispiel)", untertitel: "Anlass · Datum", stand: "", bearbeiter: "", vermerkVsNfD: false, ...kopf };
  const beschreibung = `${kopf.organisation ?? "ohne Organisation"}, ${kopf.logo ? "mit Logo" : "ohne Logo"}`;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="kp-kopfvorschau" viewBox={`0 0 ${breite} ${BLATT.randOben + BLATT.kopf + 2}`}
      role="img" aria-label={`Vorschau des Kopfs: ${beschreibung}`} style={{ fontFamily: schrift, background: FARBE.papier }}>
      {kopf.logo ? <defs><LogoDefs logo={kopf.logo} /></defs> : null}
      <BlattKopf rahmen={rahmen} breite={breite} />
    </svg>
  );
}
```

`src/app/m/kommplan/_ui/einstellungen/Briefkopf.tsx`:

```tsx
"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Popconfirm } from "antd";
import { entferneLogoAction, speichereOrganisationAction } from "../../_actions/briefkopf";
import { LAENGE_ORGANISATION } from "../../_lib/angaben";
import type { EinfachErgebnis, LogoErgebnis } from "../../_lib/ergebnis";
import { LOGO_ANNAHME, LOGO_TYP_NAME, type LogoTyp } from "../../_lib/logo/logoTyp";

const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";

/**
 * BRIEFKOPF BEARBEITEN (Spec §4.4; Umsetzungsplan Phase 4, Entscheidungen 3–6). Organisation per Server
 * Action; das Logo geht an den Route Handler `POST /logo` (Server Actions nehmen höchstens 1 MB). Nach
 * jedem Erfolg `router.refresh()` — die Vorschau darüber ist eine Server Component. Meldungen stehen in
 * EINEM Statusplatz unter dem Formular; Warnungen nie rot (Falle 3).
 */
export function BriefkopfFormular({ organisation, logo }: { organisation: string | null; logo: { typ: LogoTyp; bytes: number } | null }) {
  const router = useRouter();
  const basis = useId();
  const datei = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(organisation ?? "");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const nach = (r: EinfachErgebnis | LogoErgebnis, gut: string) => {
    setLaeuft(false);
    setMeldung(r.ok ? gut : r.fehler);
    if (r.ok) router.refresh();
  };
  async function speichereName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLaeuft(true);
    nach(await speichereOrganisationAction({ organisation: name }).catch((): EinfachErgebnis => ({ ok: false, fehler: NETZ })), "Organisation gespeichert.");
  }
  async function lade(f: File) {
    setLaeuft(true);
    const fd = new FormData();
    fd.set("logo", f);
    let r: LogoErgebnis;
    try { r = await (await fetch("/logo", { method: "POST", body: fd })).json(); } catch { r = { ok: false, fehler: NETZ }; }
    if (datei.current) datei.current.value = ""; // dieselbe Datei darf gleich noch einmal gewählt werden
    nach(r, r.ok ? `Logo übernommen (${LOGO_TYP_NAME[r.typ]}).` : "");
  }
  async function entferne() {
    setLaeuft(true);
    nach(await entferneLogoAction().catch((): EinfachErgebnis => ({ ok: false, fehler: NETZ })), "Logo entfernt.");
  }

  return (
    <div className="kp-formular kp-einstellungen">
      <form aria-label="Organisation" onSubmit={speichereName} className="kp-formular">
        <label className="kp-feldname" htmlFor={`${basis}-org`}>Organisation</label>
        <Input id={`${basis}-org`} name="organisation" value={name} maxLength={LAENGE_ORGANISATION} onChange={(e) => setName(e.target.value)}
          placeholder="leer lassen, wenn im Kopf kein Name stehen soll" />
        <div className="kp-formular-knoepfe"><Button type="primary" htmlType="submit" disabled={laeuft}>Speichern</Button></div>
      </form>
      <section aria-label="Logo" className="kp-formular">
        <p className="kp-feldname">Logo</p>
        <p>{logo ? `Logo: ${LOGO_TYP_NAME[logo.typ]}, ${Math.max(1, Math.round(logo.bytes / 1024))} KB` : "Kein Logo hinterlegt."}</p>
        <p className="kp-hilfe">PNG, JPEG, WebP oder SVG, höchstens 1 MB. Es steht rechts oben auf jedem gedruckten Blatt; ein SVG wird vorher bereinigt.</p>
        <input ref={datei} id={`${basis}-datei`} className="kp-dateifeld" type="file" name="logo" accept={LOGO_ANNAHME} tabIndex={-1} aria-hidden="true"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void lade(f); }} />
        <div className="kp-formular-knoepfe">
          <Button onClick={() => datei.current?.click()} disabled={laeuft}>{logo ? "Logo ersetzen" : "Logo hochladen"}</Button>
          {logo ? (
            <Popconfirm title="Logo entfernen?" description="Der Kopf zeigt dann kein Logo mehr." okText="Entfernen" cancelText="Abbrechen" onConfirm={() => void entferne()}>
              <Button disabled={laeuft}>Logo entfernen</Button>
            </Popconfirm>
          ) : null}
        </div>
      </section>
      {meldung ? <p className="kp-hinweis" role="status">{meldung}</p> : null}
    </div>
  );
}
```

`src/app/m/kommplan/(intern)/(verwaltung)/einstellungen/page.tsx`:

```tsx
import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { kopfFuerZeichnung, ladeBriefkopf } from "@/app/m/kommplan/_lib/briefkopf";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { pruefeKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { BriefkopfFormular } from "@/app/m/kommplan/_ui/einstellungen/Briefkopf";
import { KopfVorschau } from "@/app/m/kommplan/_ui/einstellungen/KopfVorschau";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";

export const dynamic = "force-dynamic";

/** Briefkopf (Spec §4.4, §6.1): nur für Bearbeitende; Riegel auch im Layout der Gruppe (Falle 23). */
export default async function Einstellungen() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  pruefeKommplanBearbeiten(viewer);
  const db = getDb();
  const stand = ladeBriefkopf(db);
  return (
    <Huelle>
      <Seitenkopf titel="Einstellungen" zurueck={{ titel: "Alle Pläne", href: "/" }}
        beschreibung="Der Briefkopf gilt für alle Pläne: Organisation und Logo stehen rechts oben auf jedem gedruckten Blatt. Ohne Eintrag bleibt die Stelle leer." />
      <h2 className="kp-abschnittstitel">Vorschau des Kopfs</h2>
      <KopfVorschau kopf={kopfFuerZeichnung(db)} schrift={ARIMO.style.fontFamily} />
      <h2 className="kp-abschnittstitel">Briefkopf</h2>
      <BriefkopfFormular organisation={stand.organisation} logo={stand.logo} />
    </Huelle>
  );
}
```

`_ui/kommplan.css` ergänzen:

```css
/* Einstellungen (Phase 4): der Kopf in Seitenbreite, Papier auch im Dunkeln; das Dateifeld ist nur Mittel zum Zweck. */
.kp-kopfvorschau { display: block; width: 100%; height: auto; border: 1px solid var(--kp-rand); border-radius: 4px; }
.kp-dateifeld { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.kp-einstellungen { max-width: 40rem; }
```

- [ ] **Step 4: Grün sehen, Build**

```bash
pnpm vitest run src/app/m/kommplan/
uptime; pnpm build; echo "build exit $?"
```

Expected: PASS; Build Exit 0 mit `ƒ /m/kommplan/einstellungen`.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm anker:drift src/app/m/kommplan/_ui/kommplan.css
git add "src/app/m/kommplan/(intern)/(verwaltung)/einstellungen" src/app/m/kommplan/_ui/einstellungen src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Einstellungen mit Briefkopf, Logo-Upload und Vorschau

Organisationsname eintragen, Logo hochladen, ersetzen und entfernen;
darüber der Kopf, wie er auf jedem Blatt gedruckt wird.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Datum im Titel und „heute" in der Suite-Zone

**Files:**
- Create: `src/app/m/kommplan/_lib/tagesfassung.ts`
- Test: `src/app/m/kommplan/_lib/tagesfassung.test.ts`

**Interfaces:**
- Produces: `heuteIso(jetzt: number): string` (`"YYYY-MM-DD"` in der Suite-Zone); `ersetzeDatumImTitel(titel: string, heute: string): string | null` (`null` = kein Datum gefunden); `titelFuerKopie(titel: string, heute: string): string`.

- [ ] **Step 1: Failing Test schreiben**

`src/app/m/kommplan/_lib/tagesfassung.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ersetzeDatumImTitel, heuteIso, titelFuerKopie } from "./tagesfassung";

describe("heuteIso — der Tag in der Suite-Zone (Europe/Berlin), nicht in UTC", () => {
  it("über die Berliner Mitternacht, Sommer- und Winterzeit", () => {
    expect(heuteIso(Date.UTC(2026, 8, 30, 21, 59))).toBe("2026-09-30"); // 23:59 MESZ
    expect(heuteIso(Date.UTC(2026, 8, 30, 22, 0))).toBe("2026-10-01");  // 00:00 MESZ, UTC noch am Vortag
    expect(heuteIso(Date.UTC(2026, 11, 31, 23, 0))).toBe("2027-01-01"); // 00:00 MEZ
  });
});

describe("ersetzeDatumImTitel (Spec §6.7; Entscheidung 9)", () => {
  const H = "2026-10-01";
  it.each([
    ["OpenR 01.07.2022", "OpenR 01.10.2026"],
    ["Einsatz 1.7.2022", "Einsatz 1.10.2026"],
    ["Lage 01.07.22", "Lage 01.10.26"],
    ["Plan 2022-07-01", "Plan 2026-10-01"],
    ["Kommunikationsplan Einsatz 22.02.2026", "Kommunikationsplan Einsatz 01.10.2026"],
    ["01.07.2022 bis 03.07.2022", "01.10.2026 bis 03.07.2022"],
    ["Probe 99.99.2022, Einsatz 02.07.2022", "Probe 99.99.2022, Einsatz 01.10.2026"],
  ])("%s → %s", (titel, erwartet) => {
    expect(ersetzeDatumImTitel(titel, H)).toBe(erwartet);
  });
  it.each(["112 Leitstelle", "1.2 Abschnitt", "EA 2.1.", "Stab", "Version 2026"])("ohne Datum: %s", (titel) => {
    expect(ersetzeDatumImTitel(titel, H)).toBeNull();
  });
});

describe("titelFuerKopie", () => {
  it("ohne Datum hängt „ (Kopie)“ an; nie über 200 Zeichen", () => {
    expect(titelFuerKopie("Stab", "2026-10-01")).toBe("Stab (Kopie)");
    const lang = "x".repeat(195);
    expect(titelFuerKopie(lang, "2026-10-01")).toBe(lang); // + „ (Kopie)“ wären 203
    const knapp = `${"y".repeat(191)} 1.7.2022`; // 200 Zeichen; nach dem Ersetzen (1.10.2026) wären es 201
    expect(knapp.length).toBe(200);
    expect(titelFuerKopie(knapp, "2026-10-01")).toBe(knapp);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/tagesfassung.test.ts`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_lib/tagesfassung.ts`:

```ts
import { zeitFormat } from "@/core/zeit";
import { LAENGE } from "./plan/schema";

/**
 * TAGESFASSUNGEN (Spec §2 „Tagesfassungen sind Fast-Kopien", §6.7; Umsetzungsplan Phase 4, Entscheidung 9).
 * Rein und ohne Uhr: „jetzt" kommt als Argument. `zeitFormat` löst die Suite-Zone erst beim Formatieren auf
 * (auf Modulebene erlaubt, CLAUDE.md „Zeitzone"); `en-CA` liefert `YYYY-MM-DD`.
 */
const TAG = zeitFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });

export function heuteIso(jetzt: number): string {
  return TAG.format(jetzt);
}

/** `T.M.JJJJ`, `TT.MM.JJJJ`, `TT.MM.JJ` oder `JJJJ-MM-TT` — nicht mitten in einer längeren Zahlenfolge. */
const DATUM = /(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?![\d])|(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d])/g;
const plausibel = (tag: number, monat: number) => monat >= 1 && monat <= 12 && tag >= 1 && tag <= 31;

/** Das ERSTE plausible Datum in derselben Schreibweise durch `heute` ersetzt; `null`, wenn keines da ist. */
export function ersetzeDatumImTitel(titel: string, heute: string): string | null {
  const [j, m, t] = heute.split("-");
  for (const r of titel.matchAll(DATUM)) {
    let neu: string;
    if (r[1] !== undefined) {
      if (!plausibel(Number(r[1]), Number(r[2]))) continue;
      const fuehrend = r[1].length === 2 || r[2].length === 2;
      const tt = fuehrend ? t : String(Number(t));
      const mm = fuehrend ? m : String(Number(m));
      neu = `${tt}.${mm}.${r[3].length === 2 ? j.slice(2) : j}`;
    } else {
      if (!plausibel(Number(r[6]), Number(r[5]))) continue;
      neu = heute;
    }
    return titel.slice(0, r.index) + neu + titel.slice(r.index! + r[0].length);
  }
  return null;
}

/** Titel der Kopie: Datum ersetzt, sonst „ (Kopie)"; würde er länger als erlaubt, bleibt er, wie er war (nie gekürzt). */
export function titelFuerKopie(titel: string, heute: string): string {
  const neu = ersetzeDatumImTitel(titel, heute) ?? `${titel} (Kopie)`;
  return neu.length <= LAENGE.titel ? neu : titel;
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/tagesfassung.test.ts src/app/m/kommplan/grenze.test.ts`
Expected: PASS. (Schlägt „EA 2.1." fehl, weil `2.1.` vor einem Leerzeichen als `T.M.` ohne Jahr nicht passt — gewollt: ohne Jahr kein Datum.)

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
git add src/app/m/kommplan/_lib/tagesfassung.ts src/app/m/kommplan/_lib/tagesfassung.test.ts
git commit -S -m "feat(kommplan): Datum im Titel einer Tagesfassung ersetzen

Heute in der Suite-Zone; das erste Datum im Titel in derselben
Schreibweise, sonst „(Kopie)“; nie über 200 Zeichen.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Planverwaltung — Duplizieren, Vorlagen, Archiv, aus Vorlage anlegen, lesend laden

**Files:**
- Create: `src/app/m/kommplan/_lib/planverwaltung.ts`
- Modify: `src/app/m/kommplan/_lib/plaene.ts` (`Liste`, `listePlaene(db, liste)`, `ladePlanLesend`, `ladePlanLesendOder404`, `Listenzeile.archiviert`)
- Modify: `src/app/m/kommplan/_lib/speichern.ts` (`legePlanAn` mit Feld `vorlage`)
- Test: `src/app/m/kommplan/_lib/planverwaltung.test.ts` (neu), `src/app/m/kommplan/_lib/plaene.test.ts`, `src/app/m/kommplan/_lib/speichern.test.ts`

**Interfaces:**
- Consumes: `titelFuerKopie`, `heuteIso` (Task 10), `tagZuMs` (`angaben.ts`), `lies`, `EinfachErgebnis`, `AnlageErgebnis`.
- Produces (`plaene.ts`): `type Liste = "plaene" | "vorlagen" | "archiv"`; `archivTag(ms: number): string`; `Listenzeile` + `archiviert: string | null`; `listePlaene(db, liste: Liste = "plaene"): Listenzeile[]` (plaene: nicht archiviert, keine Vorlage; vorlagen: nicht archiviert, Vorlage; archiv: archiviert, neueste Archivierung zuerst); `interface LesbarerPlan extends GeladenerPlan { archiviertAm: number | null; istVorlage: boolean }`; `ladePlanLesend(db, id): LesbarerPlan | null`; `ladePlanLesendOder404(db, id): LesbarerPlan`. `ladePlan`/`ladePlanOder404` bleiben unverändert „nur aktive".
- Produces (`planverwaltung.ts`): `interface VorlageWahl { id: string; titel: string; typ: PlanTyp; anlass: string | null }`; `vorlagenZurAuswahl(db): VorlageWahl[]`; `dupliziere(db, id: string, wer: Bearbeiter, jetzt: number): AnlageErgebnis`; `setzeVorlage(db, id, vorlage: boolean): EinfachErgebnis`; `archiviere(db, id, jetzt): EinfachErgebnis`; `stelleWiederHer(db, id): EinfachErgebnis`; `PLAN_WEG = "Diesen Plan gibt es nicht mehr."`.
- Produces (`speichern.ts`): `legePlanAn(db, eingabe, wer, jetzt)` nimmt zusätzlich `vorlage: string | null` (optional) und kopiert dann deren Inhalt.

- [ ] **Step 1: Failing Tests schreiben**

`src/app/m/kommplan/_lib/planverwaltung.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { plan } from "../_db/schema";
import { BEISPIELE } from "./beispiele";
import { ladePlan, ladePlanLesend, listePlaene } from "./plaene";
import { archiviere, dupliziere, PLAN_WEG, setzeVorlage, stelleWiederHer, vorlagenZurAuswahl } from "./planverwaltung";
import { seedLokalKommplan } from "./seedLokal";
import { legePlanAn, speichereInhalt } from "./speichern";
import { testDb } from "./testDb";

const WER = { nutzer: "u1", name: "Jana" };
const NACH_MITTERNACHT = Date.UTC(2026, 8, 30, 22, 30); // 01.10.2026, 00:30 in Berlin
const OPENR = "beispiel-openr-2022-07-01";
async function mitSeed() { const db = testDb(); await seedLokalKommplan(db); return db; }

describe("Duplizieren (Spec §6.7; Entscheidung 9)", () => {
  it("Kopie mit heutigem Berliner Datum, Datum im Titel ersetzt, Inhalt gleich, Version 1, keine Vorlage", async () => {
    const db = await mitSeed();
    const quelle = ladePlan(db, OPENR)!;
    const r = dupliziere(db, OPENR, WER, NACH_MITTERNACHT);
    if (!r.ok) throw new Error(r.fehler);
    const kopie = ladePlan(db, r.id)!;
    expect(kopie.titel).toBe(quelle.titel.replace("01.07.2022", "01.10.2026"));
    expect(kopie.angaben.datum).toBe("2026-10-01");
    expect(kopie.inhalt).toEqual(quelle.inhalt);
    expect(kopie).toMatchObject({ version: 1, typ: quelle.typ, anlass: quelle.anlass, aktualisiertVon: "Jana", aktualisiertAm: NACH_MITTERNACHT });
    expect(ladePlanLesend(db, r.id)).toMatchObject({ istVorlage: false, archiviertAm: null });
  });
  it("unbekannt, archiviert oder nicht lesbar: nicht dupliziert", async () => {
    const db = await mitSeed();
    expect(dupliziere(db, "gibt-es-nicht", WER, NACH_MITTERNACHT)).toMatchObject({ ok: false, fehler: PLAN_WEG });
    archiviere(db, OPENR, NACH_MITTERNACHT);
    expect(dupliziere(db, OPENR, WER, NACH_MITTERNACHT)).toMatchObject({ ok: false, fehler: PLAN_WEG });
    db.update(plan).set({ inhalt: '{"schema":2}' }).where(eq(plan.id, BEISPIELE[0].id)).run();
    expect(dupliziere(db, BEISPIELE[0].id, WER, NACH_MITTERNACHT).ok).toBe(false);
  });
});

describe("Vorlagen (Entscheidungen 7, 8)", () => {
  it("„Als Vorlage speichern“ verschiebt den Plan in die Vorlagen, „Keine Vorlage mehr“ zurück", async () => {
    const db = await mitSeed();
    expect(setzeVorlage(db, OPENR, true)).toEqual({ ok: true });
    expect(listePlaene(db, "plaene").map((z) => z.id)).not.toContain(OPENR);
    expect(listePlaene(db, "vorlagen").map((z) => z.id)).toContain(OPENR);
    expect(vorlagenZurAuswahl(db).map((v) => v.id)).toContain(OPENR);
    expect(setzeVorlage(db, OPENR, false)).toEqual({ ok: true });
    expect(listePlaene(db, "plaene").map((z) => z.id)).toContain(OPENR);
  });
  it("Neu aus Vorlage: Angaben aus dem Formular, Inhalt aus der Vorlage; archivierte Vorlage abgewiesen", async () => {
    const db = await mitSeed();
    const vorlage = vorlagenZurAuswahl(db)[0];
    const r = legePlanAn(db, { titel: "Übung", typ: "fernmeldeskizze", anlass: "", datum: null, vorlage: vorlage.id }, WER, NACH_MITTERNACHT);
    if (!r.ok) throw new Error(r.fehler);
    expect(ladePlan(db, r.id)!.inhalt).toEqual(ladePlan(db, vorlage.id)!.inhalt);
    expect(ladePlan(db, r.id)!.titel).toBe("Übung");
    archiviere(db, vorlage.id, NACH_MITTERNACHT);
    expect(legePlanAn(db, { titel: "Übung", typ: "fernmeldeskizze", anlass: "", datum: null, vorlage: vorlage.id }, WER, NACH_MITTERNACHT))
      .toEqual({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { vorlage: "Diese Vorlage gibt es nicht mehr." } });
    expect(legePlanAn(db, { titel: "Übung", typ: "kommunikationsplan", anlass: "", datum: null, vorlage: OPENR }, WER, NACH_MITTERNACHT).ok).toBe(false); // keine Vorlage
  });
});

describe("Archiv (Spec §8.3; Entscheidung 10)", () => {
  it("archivieren: aus der Liste ins Archiv, Stand unverändert, lesend weiter ladbar; Speichern meldet „weg“", async () => {
    const db = await mitSeed();
    const vorher = ladePlan(db, OPENR)!;
    expect(archiviere(db, OPENR, NACH_MITTERNACHT)).toEqual({ ok: true });
    expect(listePlaene(db, "plaene").map((z) => z.id)).not.toContain(OPENR);
    expect(listePlaene(db, "archiv")[0]).toMatchObject({ id: OPENR, archiviert: "01.10.2026" });
    expect(ladePlan(db, OPENR)).toBeNull();
    expect(ladePlanLesend(db, OPENR)).toMatchObject({ archiviertAm: NACH_MITTERNACHT, aktualisiertAm: vorher.aktualisiertAm });
    expect(speichereInhalt(db, { id: OPENR, version: vorher.version, inhalt: vorher.inhalt }, WER, NACH_MITTERNACHT)).toEqual({ ok: false, grund: "weg" });
    expect(archiviere(db, OPENR, NACH_MITTERNACHT)).toEqual({ ok: false, fehler: PLAN_WEG }); // zweimal ist kein zweites Mal
  });
  it("wiederherstellen: zurück in die Liste; je Schritt eine Audit-Zeile", async () => {
    const db = await mitSeed();
    const zaehle = () => (db.all(sql`SELECT count(*) AS n FROM audit_outbox WHERE object_type = 'plan' AND action = 'update'`) as { n: number }[])[0].n;
    const start = zaehle();
    archiviere(db, OPENR, NACH_MITTERNACHT);
    expect(stelleWiederHer(db, OPENR)).toEqual({ ok: true });
    expect(listePlaene(db, "plaene").map((z) => z.id)).toContain(OPENR);
    expect(stelleWiederHer(db, OPENR)).toEqual({ ok: false, fehler: PLAN_WEG });
    expect(zaehle() - start).toBe(2);
  });
});
```

In `src/app/m/kommplan/_lib/plaene.test.ts`:
1. Fall „listet nicht archivierte Pläne, neueste zuerst …" an die Trennung anpassen — `listePlaene(db)` enthält keine Vorlagen mehr: `toHaveLength(BEISPIELE.length)` wird `toHaveLength(BEISPIELE.filter((b) => !b.istVorlage).length)`; die Erwartung `liste[0].id` = `"vorlage-fernmeldeskizze-stab"` wird `listePlaene(db, "vorlagen")[0].id`, und für `listePlaene(db)[0]` gilt der neueste Nicht-Vorlage-Plan (aus den Seed-Ständen ablesen).
2. Fall „ein beschädigter Inhalt wirft nicht …": die beschädigte Zeile ist die Vorlage `vorlage-kommunikationsplan-label` — sie steht jetzt nur in `listePlaene(db, "vorlagen")`; dort suchen, sonst liefert `find` `undefined` und die Zusicherung `?.lesbar === false` scheitert an etwas anderem, als sie prüft.
3. Der Fall „unbekannt und archiviert → null" bleibt unverändert (`ladePlan`).

Anfügen:

```ts
  it("ladePlanLesend: auch archiviert, mit Archivzeitpunkt; unbekannt null", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    const id = BEISPIELE[0].id;
    db.update(plan).set({ archiviertAm: new Date(5) }).where(eq(plan.id, id)).run();
    expect(ladePlanLesend(db, id)).toMatchObject({ id, archiviertAm: 5 });
    expect(ladePlanLesend(db, "gibt-es-nicht")).toBeNull();
  });
```

(Importe `ladePlanLesend`, `seedLokalKommplan`, `BEISPIELE` in die vorhandenen Zeilen.)

In `src/app/m/kommplan/_lib/speichern.test.ts`: ein Fall „`legePlanAn` ohne `vorlage` wie bisher, mit `vorlage: null` ebenso" (beide `ok: true`, Inhalt = `leererPlan()`), und „`vorlage` kein String → Feldfehler `vorlage`".

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/planverwaltung.test.ts src/app/m/kommplan/_lib/plaene.test.ts src/app/m/kommplan/_lib/speichern.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_lib/plaene.ts`:
1. Imports: `and`, `isNotNull` aus `drizzle-orm` ergänzen.
2. `Listenzeile` um `archiviert: string | null` erweitern.
3. `listePlaene` ersetzen:

```ts
export type Liste = "plaene" | "vorlagen" | "archiv";
const TAG = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Drei Listen (Entscheidungen 7, 10): Pläne und Vorlagen getrennt, das Archiv für sich — neueste Archivierung zuerst. */
export function listePlaene(db: KommplanDb, liste: Liste = "plaene"): Listenzeile[] {
  const wo = liste === "archiv" ? isNotNull(plan.archiviertAm)
    : and(isNull(plan.archiviertAm), eq(plan.istVorlage, liste === "vorlagen"));
  const reihe = liste === "archiv" ? [desc(plan.archiviertAm), plan.id] : [desc(plan.aktualisiertAm), plan.id];
  return db.select().from(plan).where(wo).orderBy(...reihe).all().map((z) => ({
    id: z.id, titel: z.titel, typ: TYP_NAME[z.typ],
    datum: kalendertag(z.datum?.getTime() ?? null), stand: STAND.format(z.aktualisiertAm),
    vorlage: z.istVorlage, lesbar: lies(z).inhalt !== null,
    archiviert: z.archiviertAm ? archivTag(z.archiviertAm.getTime()) : null,
  }));
}

/** Tag der Archivierung in der Suite-Zone — Archivspalte und Hinweis am archivierten Plan (Task 13). */
export function archivTag(ms: number): string {
  return TAG.format(ms);
}
```

4. Nach `ladePlanOder404` einfügen:

```ts
export interface LesbarerPlan extends GeladenerPlan { archiviertAm: number | null; istVorlage: boolean }

/**
 * NUR LESEN, auch archiviert (Entscheidung 10): für das objektbezogene 404 im Layout, die Planseite (Betrachter
 * mit Archivhinweis) und den Druck. Editor, Speichern und später Token-Links bleiben bei `ladePlan` (nur aktive).
 */
export function ladePlanLesend(db: KommplanDb, id: string): LesbarerPlan | null {
  const z = db.select().from(plan).where(eq(plan.id, id)).get();
  if (!z) return null;
  return {
    id: z.id, titel: z.titel, typ: z.typ, anlass: z.anlass, datum: z.datum?.getTime() ?? null,
    aktualisiertAm: z.aktualisiertAm.getTime(), aktualisiertVon: z.aktualisiertVon, ...lies(z),
    version: z.version,
    angaben: { titel: z.titel, typ: z.typ, anlass: z.anlass, datum: msZuTag(z.datum?.getTime() ?? null) },
    archiviertAm: z.archiviertAm?.getTime() ?? null, istVorlage: z.istVorlage,
  };
}

export function ladePlanLesendOder404(db: KommplanDb, id: string): LesbarerPlan {
  const p = ladePlanLesend(db, id);
  if (!p) notFound();
  return p;
}
```

`src/app/m/kommplan/_lib/speichern.ts` — `legePlanAn` ersetzen:

```ts
const VORLAGE_WEG = "Diese Vorlage gibt es nicht mehr.";
const vorlageFeld = z.string().min(1).max(64).nullable().optional();

/**
 * Neu, leer oder aus einer Vorlage (Spec §6.7; Umsetzungsplan Phase 4, Entscheidung 8): die Angaben kommen aus
 * dem Formular, der Inhalt aus der Vorlage — nur aus einer NICHT archivierten Vorlage (`ist_vorlage`), deren
 * Inhalt lesbar ist; die ID wird gegen die Datenbank aufgelöst (IDOR).
 */
export function legePlanAn(db: KommplanDb, eingabe: unknown, wer: Bearbeiter, jetzt: number): AnlageErgebnis {
  const { vorlage, ...angaben } = (typeof eingabe === "object" && eingabe !== null ? eingabe : {}) as Record<string, unknown>;
  const a = angabenSchema.safeParse(angaben);
  const v = vorlageFeld.safeParse(vorlage);
  if (!a.success || !v.success) {
    return { ok: false, fehler: FELDER, feldFehler: { ...(a.success ? {} : feldFehlerAus(a.error)), ...(v.success ? {} : { vorlage: VORLAGE_WEG }) } };
  }
  let inhalt = JSON.stringify(leererPlan());
  if (v.data) {
    const q = db.select().from(plan).where(and(eq(plan.id, v.data), eq(plan.istVorlage, true), isNull(plan.archiviertAm))).get();
    const gelesen = q ? lies(q).inhalt : null;
    if (!gelesen) return { ok: false, fehler: FELDER, feldFehler: { vorlage: VORLAGE_WEG } };
    inhalt = JSON.stringify(gelesen);
  }
  const id = randomUUID();
  db.insert(plan).values({
    id, titel: a.data.titel, typ: a.data.typ, anlass: a.data.anlass,
    datum: a.data.datum === null ? null : new Date(tagZuMs(a.data.datum)),
    aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name, inhalt,
  }).run();
  return { ok: true, id };
}
```

(Import `z` aus `zod` ergänzen; `and`, `eq`, `isNull` sind schon da.)

`src/app/m/kommplan/_lib/planverwaltung.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { KommplanDb } from "../_db/client";
import { plan } from "../_db/schema";
import { tagZuMs, type PlanTyp } from "./angaben";
import type { AnlageErgebnis, EinfachErgebnis } from "./ergebnis";
import { lies } from "./plaene";
import type { Bearbeiter } from "./speichern";
import { heuteIso, titelFuerKopie } from "./tagesfassung";

/**
 * PLANVERWALTUNG (Spec §6.7, §8.3; Umsetzungsplan Phase 4, Entscheidungen 7–10) — nur Server. Jede ID wird hier
 * gegen die Datenbank aufgelöst (IDOR); jeder Schreibvorgang ist eine Audit-Zeile über den Trigger von `plan`
 * (`ist_vorlage`, `archiviert_am`, Anlegen). Archivieren und Vorlage ändern den „Stand" NICHT — der Stand ist der
 * Inhalt, nicht seine Ablage. „Jetzt" kommt als Argument.
 */
export const PLAN_WEG = "Diesen Plan gibt es nicht mehr.";
/** Was „Neuer Plan" zum Vorbelegen braucht (Entscheidung 8): Art, Anlass und Titel der Vorlage. */
export interface VorlageWahl { id: string; titel: string; typ: PlanTyp; anlass: string | null }

export function vorlagenZurAuswahl(db: KommplanDb): VorlageWahl[] {
  return db.select({ id: plan.id, titel: plan.titel, typ: plan.typ, anlass: plan.anlass }).from(plan)
    .where(and(eq(plan.istVorlage, true), isNull(plan.archiviertAm))).orderBy(asc(plan.titel), plan.id).all();
}

export function dupliziere(db: KommplanDb, id: string, wer: Bearbeiter, jetzt: number): AnlageErgebnis {
  const q = db.select().from(plan).where(and(eq(plan.id, id), isNull(plan.archiviertAm))).get();
  if (!q) return { ok: false, fehler: PLAN_WEG, feldFehler: {} };
  const inhalt = lies(q).inhalt;
  if (!inhalt) return { ok: false, fehler: "Dieser Plan lässt sich nicht lesen und deshalb nicht duplizieren.", feldFehler: {} };
  const heute = heuteIso(jetzt);
  const neu = randomUUID();
  db.insert(plan).values({
    id: neu, titel: titelFuerKopie(q.titel, heute), typ: q.typ, anlass: q.anlass, datum: new Date(tagZuMs(heute)),
    istVorlage: false, aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name, inhalt: JSON.stringify(inhalt),
  }).run();
  return { ok: true, id: neu };
}

export function setzeVorlage(db: KommplanDb, id: string, vorlage: boolean): EinfachErgebnis {
  const r = db.update(plan).set({ istVorlage: vorlage }).where(and(eq(plan.id, id), isNull(plan.archiviertAm))).run();
  return r.changes === 1 ? { ok: true } : { ok: false, fehler: PLAN_WEG };
}

export function archiviere(db: KommplanDb, id: string, jetzt: number): EinfachErgebnis {
  const r = db.update(plan).set({ archiviertAm: new Date(jetzt) }).where(and(eq(plan.id, id), isNull(plan.archiviertAm))).run();
  return r.changes === 1 ? { ok: true } : { ok: false, fehler: PLAN_WEG };
}

export function stelleWiederHer(db: KommplanDb, id: string): EinfachErgebnis {
  const r = db.update(plan).set({ archiviertAm: null }).where(and(eq(plan.id, id), isNotNull(plan.archiviertAm))).run();
  return r.changes === 1 ? { ok: true } : { ok: false, fehler: PLAN_WEG };
}
```

Hinweis: `setzeVorlage(db, id, true)` an einer Zeile, die schon Vorlage ist, trifft trotzdem (`changes === 1` bei SQLite auch ohne Wertänderung) — gewollt; der Trigger schreibt dann keine Audit-Zeile (No-op-Prädikat).

`(intern)/p/[id]/layout.tsx`: `ladePlanOder404` → `ladePlanLesendOder404` (Import und Aufruf; Kommentar „ein unbekannter oder archivierter Plan ist hier ein echter 404" **in derselben Zeile** zu „ein unbekannter Plan ist hier ein echter 404 (archiviert ist nur lesbar, Phase 4)" kürzen). `(intern)/p/[id]/druck/a4/page.tsx`: `ladePlanOder404` → `ladePlanLesendOder404` (Drucken eines archivierten Plans bleibt erlaubt). Die Planseite folgt in Task 13.

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
for f in plaene.ts speichern.ts layout.tsx; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
git add src/app/m/kommplan/_lib/planverwaltung.ts src/app/m/kommplan/_lib/planverwaltung.test.ts src/app/m/kommplan/_lib/plaene.ts src/app/m/kommplan/_lib/plaene.test.ts src/app/m/kommplan/_lib/speichern.ts src/app/m/kommplan/_lib/speichern.test.ts "src/app/m/kommplan/(intern)/p/[id]/layout.tsx" "src/app/m/kommplan/(intern)/p/[id]/druck/a4/page.tsx"
git commit -S -m "feat(kommplan): Duplizieren, Vorlagen, Archiv und Anlegen aus Vorlage

Kopie mit heutigem Datum und ersetztem Datum im Titel, Vorlagen und
Archiv als eigene Listen, archivierte Pläne bleiben lesbar und
druckbar, aber nicht bearbeitbar.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Server Actions der Planverwaltung

**Files:**
- Create: `src/app/m/kommplan/_actions/verwaltung.ts`
- Test: `src/app/m/kommplan/_actions/verwaltung.test.ts`
- Modify: `src/core/audit/coverage-manifest.json`

**Interfaces:**
- Consumes: Task 11.
- Produces: `dupliziereAction(id: unknown): Promise<AnlageErgebnis>`; `setzeVorlageAction(eingabe: unknown): Promise<EinfachErgebnis>` (`{ id, vorlage: boolean }`); `archiviereAction(id: unknown): Promise<EinfachErgebnis>`; `stelleWiederHerAction(id: unknown): Promise<EinfachErgebnis>`.

- [ ] **Step 1: Failing Test schreiben**

`src/app/m/kommplan/_actions/verwaltung.test.ts` (Gerüst wie `_actions/briefkopf.test.ts`, eigenes `DIR = "./.data/kommplan-actions-verwaltung-test"`; nach `migrateAllModules()` den Seed fahren: `const { seedLokalKommplan } = await import("../_lib/seedLokal"); await seedLokalKommplan((await import("../_db/client")).getDb());`):

```ts
describe("Actions der Planverwaltung", () => {
  it("ohne Bearbeitungsrecht: Forbidden, auch mit Zugangsgruppe", async () => {
    gruppen = ["iuk-kommplan"];
    const a = await import("./verwaltung");
    await expect(a.dupliziereAction("beispiel-openr-2022-07-01")).rejects.toThrow("Forbidden");
    await expect(a.setzeVorlageAction({ id: "beispiel-openr-2022-07-01", vorlage: true })).rejects.toThrow("Forbidden");
    await expect(a.archiviereAction("beispiel-openr-2022-07-01")).rejects.toThrow("Forbidden");
    await expect(a.stelleWiederHerAction("beispiel-openr-2022-07-01")).rejects.toThrow("Forbidden");
  });
  it("duplizieren, archivieren, wiederherstellen, Vorlage — ungültige Eingaben ohne Wurf", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const a = await import("./verwaltung");
    const r = await a.dupliziereAction("beispiel-openr-2022-07-01");
    expect(r.ok).toBe(true);
    expect(await a.archiviereAction("beispiel-openr-2022-07-01")).toEqual({ ok: true });
    expect(await a.stelleWiederHerAction("beispiel-openr-2022-07-01")).toEqual({ ok: true });
    expect(await a.setzeVorlageAction({ id: "beispiel-openr-2022-07-01", vorlage: true })).toEqual({ ok: true });
    expect(await a.setzeVorlageAction({ id: "x", vorlage: "ja" })).toEqual({ ok: false, fehler: "Ungültige Anfrage." });
    expect(await a.archiviereAction(5)).toEqual({ ok: false, fehler: "Ungültige Anfrage." });
    expect(await a.dupliziereAction({})).toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_actions/verwaltung.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_actions/verwaltung.ts`:

```ts
"use server";

import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import type { AnlageErgebnis, EinfachErgebnis } from "../_lib/ergebnis";
import { archiviere, dupliziere, setzeVorlage, stelleWiederHer } from "../_lib/planverwaltung";
import { bearbeiterAus, requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Planverwaltung (Spec §6.7, §8.3): jede Action prüft selbst, die ID wird in `_lib/planverwaltung.ts` gegen die
// Datenbank aufgelöst. Kein revalidatePath: die Liste ruft `router.refresh()`.

const ID = z.string().min(1).max(64);
const UNGUELTIG = { ok: false, fehler: "Ungültige Anfrage." } as const;

export async function dupliziereAction(id: unknown): Promise<AnlageErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  const r = ID.safeParse(id);
  if (!r.success) return { ...UNGUELTIG, feldFehler: {} };
  return withAuditContext({ actor: auditActor(viewer) }, async () => dupliziere(getDb(), r.data, bearbeiterAus(viewer), Date.now()));
}

export async function setzeVorlageAction(eingabe: unknown): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  const r = z.object({ id: ID, vorlage: z.boolean() }).strict().safeParse(eingabe);
  if (!r.success) return UNGUELTIG;
  return withAuditContext({ actor: auditActor(viewer) }, async () => setzeVorlage(getDb(), r.data.id, r.data.vorlage));
}

export async function archiviereAction(id: unknown): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  const r = ID.safeParse(id);
  if (!r.success) return UNGUELTIG;
  return withAuditContext({ actor: auditActor(viewer) }, async () => archiviere(getDb(), r.data, Date.now()));
}

export async function stelleWiederHerAction(id: unknown): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  const r = ID.safeParse(id);
  if (!r.success) return UNGUELTIG;
  return withAuditContext({ actor: auditActor(viewer) }, async () => stelleWiederHer(getDb(), r.data));
}
```

`coverage-manifest.json`: vier Einträge `"src/app/m/kommplan/_actions/verwaltung.ts#<Name>": { "kind": "context", "via": "<Name>" }` an ihrer alphabetischen Stelle.

- [ ] **Step 4: Grün sehen, Build**

```bash
pnpm vitest run src/app/m/kommplan/_actions src/core/audit/coverage.test.ts
uptime; pnpm build; echo "build exit $?"
```

Expected: PASS; Build Exit 0.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
git add src/app/m/kommplan/_actions/verwaltung.ts src/app/m/kommplan/_actions/verwaltung.test.ts src/core/audit/coverage-manifest.json
git commit -S -m "feat(kommplan): Actions zum Duplizieren, Archivieren und für Vorlagen

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Planliste, Vorlagen, Archivseite, „Neu aus Vorlage" und der archivierte Plan

**Files:**
- Modify: `src/app/m/kommplan/(intern)/PlanTabelle.tsx`, `src/app/m/kommplan/(intern)/NeuerPlan.tsx`, `src/app/m/kommplan/(intern)/page.tsx`
- Create: `src/app/m/kommplan/(intern)/archiv/page.tsx`, `src/app/m/kommplan/(intern)/p/[id]/Wiederherstellen.tsx`
- Modify: `src/app/m/kommplan/(intern)/p/[id]/page.tsx`, `src/app/m/kommplan/_ui/editor/Editor.tsx` (Hinweis mit Aktion, Prop `kopieHinweis`)
- Test: `src/app/m/kommplan/(intern)/PlanTabelle.test.tsx`, `src/app/m/kommplan/(intern)/NeuerPlan.test.tsx`, `src/app/m/kommplan/_ui/editor/Editor.test.tsx`

**Interfaces:**
- Consumes: `listePlaene(db, liste)`, `Liste`, `VorlageWahl`, `vorlagenZurAuswahl`, `ladePlanLesendOder404` (Task 11), Actions aus Task 12, `legePlanAnAction` (nimmt jetzt `vorlage`).
- Produces: `PlanTabelle({ zeilen, liste, darfBearbeiten, vorlagen?, heute? })` — DOM: `Kartentabelle` mit `aria-label` „Pläne" / „Vorlagen" / „Archivierte Pläne"; bei `darfBearbeiten` je Zeile ein Knopf „Aktionen" (`aria-label` „Aktionen für <Titel>") mit Menüeinträgen (plaene: „Duplizieren", „Als Vorlage speichern", „Archivieren"; vorlagen: „Neu aus Vorlage", „Keine Vorlage mehr", „Archivieren"; archiv: „Wiederherstellen"); Hinweis in `.kp-listenhinweis[role="status"]` mit Knopf „Rückgängig" nach dem Archivieren. `NeuerPlan({ vorlagen, heute })`, `NeuerPlanFormular({ …, vorlagen, startVorlage?, heute? })` mit Feld „Vorlage" (`Select`, Vorgabe „Leerer Plan"). Editor: `Hinweis` bekommt `aktion?: { text: string; tu(): void }` (Knopf im Alert statt „Rückgängig"); Prop `kopieHinweis?: string` (einmal angezeigt, mit „Angaben ändern"); `onHinweis` der Gliederung nimmt optional eine `aktion` (Task 20).

- [ ] **Step 1: Failing Tests schreiben**

In `src/app/m/kommplan/(intern)/PlanTabelle.test.tsx` — die bestehenden Fälle auf die neuen Props umstellen (`liste="plaene"`, `darfBearbeiten={false}`; die Zeilen bekommen `archiviert: null`; der Chip „Vorlage" steht in der Planliste nicht mehr — Erwartung `chips` auf `["nicht lesbar"]`), Actions und Router mocken:

```tsx
const aktion = vi.hoisted(() => ({ dupliziere: vi.fn(), vorlage: vi.fn(), archiviere: vi.fn(), wiederher: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("../_actions/verwaltung", () => ({ dupliziereAction: aktion.dupliziere, setzeVorlageAction: aktion.vorlage, archiviereAction: aktion.archiviere, stelleWiederHerAction: aktion.wiederher }));
vi.mock("../_actions/plan", () => ({ legePlanAnAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
```

und anfügen:

```tsx
  it("ohne Bearbeitungsrecht keine Aktionen; mit: ein Menü je Zeile, Einträge je Liste", async () => {
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" darfBearbeiten={false} />);
    expect(queryAll('button[aria-label^="Aktionen für"]')).toHaveLength(0);
    await unmount();
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" darfBearbeiten />);
    await clickElement(query('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]'));
    expect([...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent)).toEqual(["Duplizieren", "Als Vorlage speichern", "Archivieren"]);
  });
  it("Duplizieren führt in den Editor der Kopie (mit Hinweis); solange es läuft, löst ein zweiter Klick nichts aus", async () => {
    let fertig!: (r: unknown) => void;
    aktion.dupliziere.mockReturnValue(new Promise((r) => { fertig = r; }));
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" darfBearbeiten />);
    const aktionen = query<HTMLButtonElement>('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]');
    await clickElement(aktionen);
    await clickElement(knopf("Duplizieren"));
    // zweiter Versuch, solange der erste läuft: über das (evtl. noch im Portal stehende) Menü oder gar nicht
    await clickElement(aktionen);
    const nochmal = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent === "Duplizieren");
    if (nochmal) await clickElement(nochmal);
    expect(aktion.dupliziere).toHaveBeenCalledTimes(1);
    await act(async () => { fertig({ ok: true, id: "neu-1" }); });
    await abwarten();
    expect(aktion.dupliziere).toHaveBeenCalledWith("p1");
    expect(router.push).toHaveBeenCalledWith("/p/neu-1?kopie=1");
  });
  it("Archivieren meldet sich mit „Rückgängig“, das wiederherstellt", async () => {
    aktion.archiviere.mockResolvedValue({ ok: true });
    aktion.wiederher.mockResolvedValue({ ok: true });
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" darfBearbeiten />);
    await clickElement(query('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]'));
    await clickElement(knopf("Archivieren"));
    await abwarten();
    expect(query('.kp-listenhinweis[role="status"]').textContent).toContain("„Einsatz“ archiviert.");
    await clickElement(knopf("Rückgängig"));
    await abwarten();
    expect(aktion.wiederher).toHaveBeenCalledWith("p1");
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
  it("Archivliste: Spalte „Archiviert“, nur „Wiederherstellen“", async () => {
    await mount(<PlanTabelle zeilen={[{ ...ZEILEN[0], archiviert: "01.10.2026" }]} liste="archiv" darfBearbeiten />);
    expect(query('table[aria-label="Archivierte Pläne"], [aria-label="Archivierte Pläne"]')).toBeTruthy();
    expect(document.body.textContent).toContain("01.10.2026");
    await clickElement(query('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]'));
    expect([...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent)).toEqual(["Wiederherstellen"]);
  });
```

(`ZEILEN` ist das vorhandene Testarray, um `archiviert: null` ergänzt; `abwarten` und `knopf` wie in Task 9 — in diese Datei kopieren.)

In `src/app/m/kommplan/(intern)/NeuerPlan.test.tsx`: im bestehenden Fall „sendet Titel, Art, Anlass und Datum und meldet die neue ID" die exakte Erwartung um `vorlage: null` ergänzen (`{ titel: "Übung Nord", typ: "kommunikationsplan", anlass: "Probe", datum: null, vorlage: null }`) — ohne Vorlage ändert sich sonst nichts. Anfügen (der Mock heißt in dieser Datei `aktion.legePlanAnAction`; gewartet wird wie in der Datei üblich mit `await act(async () => {})`):

```tsx
  it("Vorlage wählen: Art und Anlass übernommen, Datum heute, Datum im Titel ersetzt, die Vorlage geht mit", async () => {
    aktion.legePlanAnAction.mockResolvedValue({ ok: true, id: "neu" });
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} heute="2026-10-01" startVorlage="v1"
      vorlagen={[{ id: "v1", titel: "Kommunikationsplan Einsatz 22.02.2026", typ: "fernmeldeskizze", anlass: "Großübung" }]} />);
    expect(query<HTMLInputElement>('input[name="titel"]').value).toBe("Kommunikationsplan Einsatz 01.10.2026");
    expect(query<HTMLInputElement>('input[name="anlass"]').value).toBe("Großübung");
    await submitForm('form[aria-label="Neuer Plan"]');
    await act(async () => {});
    expect(aktion.legePlanAnAction).toHaveBeenCalledWith({
      titel: "Kommunikationsplan Einsatz 01.10.2026", typ: "fernmeldeskizze", anlass: "Großübung", datum: "2026-10-01", vorlage: "v1",
    });
  });
  it("eine Vorlage ohne Datum im Titel behält ihren Titel — kein „ (Kopie)“", async () => {
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} heute="2026-10-01" startVorlage="v1"
      vorlagen={[{ id: "v1", titel: "Fernmeldeskizze Stab", typ: "fernmeldeskizze", anlass: null }]} />);
    expect(query<HTMLInputElement>('input[name="titel"]').value).toBe("Fernmeldeskizze Stab");
  });
  it("ohne Vorlage: vorlage null, Datum leer, wie bisher", async () => {
    aktion.legePlanAnAction.mockResolvedValue({ ok: true, id: "neu" });
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} vorlagen={[]} heute="2026-10-01" />);
    await fill('input[name="titel"]', "Leer");
    await submitForm('form[aria-label="Neuer Plan"]');
    await act(async () => {});
    expect(aktion.legePlanAnAction).toHaveBeenCalledWith(expect.objectContaining({ vorlage: null, datum: null }));
  });
```

In `src/app/m/kommplan/_ui/editor/Editor.test.tsx` anfügen (Importe zusammenführen):

```tsx
  it("eine frische Kopie meldet sich einmal: Datum auf heute, „Angaben ändern“ öffnet die Angaben (Entscheidung 9)", async () => {
    await mount(<Editor plan={plan()} symbole={{}} zeichenIndex={[]} schrift="Arimo" kopieHinweis="Kopie angelegt — Titel und Datum stehen auf 01.10.2026." />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Kopie angelegt — Titel und Datum stehen auf 01.10.2026.");
    await clickElement(knopf("Angaben ändern"));
    expect(existsPortal('.kp-flyin [data-abschnitt="verbindungen"]')).toBe(true); // das Flyin „Plan und Verbindungen" ist offen
  });
```

(`knopf` wie in Task 9 kopieren, falls die Datei ihn nicht hat; den Greifer für das offene Plan-Flyin an `PlanFlyin.test.tsx` angleichen.)

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run "src/app/m/kommplan/(intern)"`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/(intern)/PlanTabelle.tsx` — ganze Datei:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Drawer, Dropdown, type MenuProps, type TableProps } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { Kartentabelle, nachText } from "@/core/tabelle";
import { archiviereAction, dupliziereAction, setzeVorlageAction, stelleWiederHerAction } from "../_actions/verwaltung";
import type { EinfachErgebnis } from "../_lib/ergebnis";
import type { Liste, Listenzeile } from "../_lib/plaene";
import type { VorlageWahl } from "../_lib/planverwaltung";
import { NeuerPlanFormular } from "./NeuerPlan";

const NAME: Record<Liste, string> = { plaene: "Pläne", vorlagen: "Vorlagen", archiv: "Archivierte Pläne" };
const LEER: Record<Liste, string> = {
  plaene: "Noch keine Pläne.",
  vorlagen: "Noch keine Vorlagen. „Als Vorlage speichern“ im Menü eines Plans macht ihn zur Vorlage.",
  archiv: "Das Archiv ist leer.",
};
type Aktion = "duplizieren" | "vorlage" | "keineVorlage" | "archivieren" | "wiederherstellen" | "ausVorlage";
const MENUE: Record<Liste, { key: Aktion; label: string }[]> = {
  plaene: [{ key: "duplizieren", label: "Duplizieren" }, { key: "vorlage", label: "Als Vorlage speichern" }, { key: "archivieren", label: "Archivieren" }],
  vorlagen: [{ key: "ausVorlage", label: "Neu aus Vorlage" }, { key: "keineVorlage", label: "Keine Vorlage mehr" }, { key: "archivieren", label: "Archivieren" }],
  archiv: [{ key: "wiederherstellen", label: "Wiederherstellen" }],
};
const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";
interface Hinweis { text: string; zurueck?: string }

/**
 * DIE DREI LISTEN DER PLANLISTE (Spec §6.1, §6.7, §8.3; Umsetzungsplan Phase 4, Entscheidungen 7–10).
 * Client-Insel, weil die Spalten render-Funktionen tragen (Falle 9); Titel als Zeichenketten (Falle 17);
 * `Kartentabelle` (docs/design/README.md „Mobil"). Das Aktionen-Menü erscheint nur bei `darfBearbeiten` —
 * dasselbe Prädikat wie jede Action. Nach einer Aktion `router.refresh()`; Duplizieren führt in den Editor.
 */
export function PlanTabelle({ zeilen, liste, darfBearbeiten, vorlagen = [], heute }: { zeilen: Listenzeile[]; liste: Liste; darfBearbeiten: boolean; vorlagen?: VorlageWahl[]; heute?: string }) {
  const router = useRouter();
  const [hinweis, setHinweis] = useState<Hinweis | null>(null);
  const [ausVorlage, setAusVorlage] = useState<string | null>(null);
  /** ID der Zeile, deren Aktion gerade läuft: ihr „Aktionen" lädt, alle anderen sind gesperrt (kein zweites Duplikat). */
  const [laeuft, setLaeuft] = useState<string | null>(null);

  async function fuehreAus(z: Listenzeile, a: Aktion) {
    if (a === "ausVorlage") { setAusVorlage(z.id); return; }
    if (laeuft !== null) return;
    setLaeuft(z.id);
    if (a === "duplizieren") {
      const r = await dupliziereAction(z.id).catch(() => ({ ok: false as const, fehler: NETZ, feldFehler: {} }));
      // Bei Erfolg bleibt die Zeile „laufend", bis der Editor der Kopie steht — sonst wäre ein zweiter Klick frei.
      if (r.ok) { router.push(`/p/${r.id}?kopie=1`); return; }
      setLaeuft(null);
      setHinweis({ text: r.fehler });
      return;
    }
    const lauf: Record<Exclude<Aktion, "ausVorlage" | "duplizieren">, () => Promise<EinfachErgebnis>> = {
      vorlage: () => setzeVorlageAction({ id: z.id, vorlage: true }),
      keineVorlage: () => setzeVorlageAction({ id: z.id, vorlage: false }),
      archivieren: () => archiviereAction(z.id),
      wiederherstellen: () => stelleWiederHerAction(z.id),
    };
    const r = await lauf[a]().catch((): EinfachErgebnis => ({ ok: false, fehler: NETZ }));
    setLaeuft(null);
    if (!r.ok) { setHinweis({ text: r.fehler }); return; }
    const text = { vorlage: `„${z.titel}“ steht jetzt unter „Vorlagen“.`, keineVorlage: `„${z.titel}“ steht wieder unter „Pläne“.`,
      archivieren: `„${z.titel}“ archiviert.`, wiederherstellen: `„${z.titel}“ wiederhergestellt.` }[a];
    setHinweis({ text, zurueck: a === "archivieren" ? z.id : undefined });
    router.refresh();
  }
  async function zurueck(id: string) {
    const r = await stelleWiederHerAction(id).catch((): EinfachErgebnis => ({ ok: false, fehler: NETZ }));
    setHinweis(r.ok ? { text: "Wiederhergestellt." } : { text: r.fehler });
    if (r.ok) router.refresh();
  }

  const spalten: NonNullable<TableProps<Listenzeile>["columns"]> = [
    { key: "titel", title: "Titel", dataIndex: "titel", sorter: nachText<Listenzeile>((z) => z.titel),
      render: (_: unknown, z: Listenzeile) => <Link href={`/p/${z.id}`}>{z.titel}</Link> },
    { key: "kennzeichen", title: "Kennzeichen", render: (_: unknown, z: Listenzeile) => (
      <span className="kp-chips">{z.lesbar ? null : <span className="kp-chip kp-chip-hinweis">nicht lesbar</span>}</span>
    ) },
    { key: "typ", title: "Art", dataIndex: "typ" },
    { key: "datum", title: "Datum", dataIndex: "datum", render: (d: string | null) => d ?? "—" },
    liste === "archiv"
      ? { key: "archiviert", title: "Archiviert", dataIndex: "archiviert", render: (d: string | null) => d ?? "—" }
      : { key: "stand", title: "Stand", dataIndex: "stand" },
    ...(darfBearbeiten ? [{
      key: "aktionen", title: "Aktionen", render: (_: unknown, z: Listenzeile) => (
        <Dropdown trigger={["click"]} menu={{
          items: MENUE[liste].map((m) => ({ key: m.key, label: m.label })) as MenuProps["items"],
          onClick: ({ key }) => void fuehreAus(z, key as Aktion),
        }}>
          <Button aria-label={`Aktionen für ${z.titel}`} loading={laeuft === z.id} disabled={laeuft !== null && laeuft !== z.id}>Aktionen</Button>
        </Dropdown>
      ),
    }] : []),
  ];
  const vorlage = vorlagen.find((v) => v.id === ausVorlage);
  return (
    <>
      {hinweis ? (
        <p className="kp-listenhinweis" role="status">
          {hinweis.text}
          {hinweis.zurueck ? <Button onClick={() => void zurueck(hinweis.zurueck!)}>Rückgängig</Button> : null}
        </p>
      ) : null}
      <Kartentabelle<Listenzeile>
        aria-label={NAME[liste]} rowKey="id" dataSource={zeilen} columns={spalten}
        leer={{ nichts: LEER[liste] }} karte={{ titel: "titel", kennzeichen: ["kennzeichen"] }}
      />
      {liste === "vorlagen" ? (
        <Drawer open={vorlage !== undefined} onClose={() => setAusVorlage(null)} title="Neuer Plan aus Vorlage" size={flyinBreite(480)} destroyOnHidden>
          {vorlage ? <NeuerPlanFormular vorlagen={vorlagen} startVorlage={vorlage.id} heute={heute} onAngelegt={(id) => router.push(`/p/${id}`)} onAbbrechen={() => setAusVorlage(null)} /> : null}
        </Drawer>
      ) : null}
    </>
  );
}
```

`src/app/m/kommplan/(intern)/NeuerPlan.tsx`:
1. `import type { VorlageWahl } from "../_lib/planverwaltung";` (nur Typ — `planverwaltung.ts` zieht `node:crypto` und die Datenbank); `import { ersetzeDatumImTitel } from "../_lib/tagesfassung";` (rein); `import dayjs, { type Dayjs } from "dayjs";` (statt des reinen Typ-Imports). `NeuerPlan({ vorlagen = [], heute }: { vorlagen?: VorlageWahl[]; heute?: string })` reicht beides an `NeuerPlanFormular`.
2. `NeuerPlanFormular` bekommt `vorlagen?: VorlageWahl[]`, `startVorlage?: string` und `heute?: string` (`"YYYY-MM-DD"` in der Suite-Zone, vom Server — der Browser rechnet kein „heute"); Zustand:
   ```tsx
   /** Titel einer Vorlage für den neuen Plan (Entscheidung 8): ein Datum darin wird heute, sonst bleibt er — kein „ (Kopie)". */
   const titelAus = (v: VorlageWahl) => (heute ? ersetzeDatumImTitel(v.titel, heute) ?? v.titel : v.titel);
   const start = vorlagen.find((v) => v.id === startVorlage) ?? null;
   const [vorlage, setVorlage] = useState<string>(start?.id ?? "");
   const [titel, setTitel] = useState(start ? titelAus(start) : "");
   const [typ, setTyp] = useState<PlanTyp>(start?.typ ?? "kommunikationsplan");
   const [anlass, setAnlass] = useState(start?.anlass ?? "");
   const [datum, setDatum] = useState<Dayjs | null>(start && heute ? dayjs(heute) : null);
   const waehleVorlage = (id: string) => {
     setVorlage(id);
     const v = vorlagen.find((x) => x.id === id);
     if (!v) return;
     setTyp(v.typ);
     if (anlass.trim() === "") setAnlass(v.anlass ?? "");
     if (heute && datum === null) setDatum(dayjs(heute));
     if (titel.trim() === "") setTitel(titelAus(v));
   };
   ```
   (Die vorhandenen `useState`-Zeilen für `titel`, `typ`, `anlass`, `datum` werden durch diese ersetzt, nicht verdoppelt.)
3. Als erstes Feld vor „Titel" (nur wenn `vorlagen.length > 0`):
   ```tsx
      <label className="kp-feldname" htmlFor={`${basis}-vorlage`}>Vorlage</label>
      <Select id={`${basis}-vorlage`} value={vorlage} onChange={waehleVorlage} {...feld("vorlage")}
        options={[{ value: "", label: "Leerer Plan" }, ...vorlagen.map((v) => ({ value: v.id, label: v.titel }))]} />
      {fehlerText("vorlage")}
   ```
4. Im Aufruf `legePlanAnAction({ titel, typ, anlass, datum: …, vorlage: vorlage === "" ? null : vorlage })`.

`Editor.tsx` (Hinweis mit Aktion, Kopie-Hinweis):
1. Typ `Hinweis` um `aktion?: { text: string; tu(): void }` erweitern; im Alert `action={hinweis.aktion ? <Button onClick={() => { hinweis.aktion!.tu(); setHinweis(null); }}>{hinweis.aktion.text}</Button> : <vorhandene Rückgängig-Bedingung>}`.
2. Prop `kopieHinweis?: string`; der Startwert des Hinweis-Zustands ist `kopieHinweis ? { text: kopieHinweis, aktion: { text: "Angaben ändern", tu: () => oeffnePlan("angaben") } } : null` (Lazy-Initialisierer; `oeffnePlan` dort über eine Funktion, die erst beim Klick aufgerufen wird). Ein Effekt ohne `setState` nimmt `kopie` per `window.history.replaceState` aus der Adresse — ein Neuladen zeigt den Hinweis nicht noch einmal.
3. Der `onHinweis`-Rückruf an die Gliederung nimmt `(text, aktion?)` und reicht beides in den Zustand (Task 20 nutzt es).

`(intern)/page.tsx` (unten) gibt `heute={heuteIso(Date.now())}` an `NeuerPlan` und an die Vorlagen-`PlanTabelle` (Import `heuteIso` aus `../_lib/tagesfassung`).

`src/app/m/kommplan/(intern)/page.tsx` (Importe: `Link` aus `next/link`, `listePlaene` aus `../_lib/plaene`, `vorlagenZurAuswahl` aus `../_lib/planverwaltung`):

```tsx
export default async function Planliste() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  const db = getDb();
  const darf = darfKommplanBearbeiten(viewer.groups);
  const vorlagen = vorlagenZurAuswahl(db);
  const heute = heuteIso(Date.now());
  return (
    <Huelle>
      <Seitenkopf titel="Kommunikationspläne" beschreibung="Pläne und Fernmeldeskizzen deiner Einsätze. Öffne einen Plan, um ihn anzusehen, zu bearbeiten oder auf A4 zu drucken."
        aktionen={
          <div className="kp-kopfaktionen">
            {darf ? <NeuerPlan vorlagen={vorlagen} heute={heute} /> : null}
            {darf ? <Link href="/bibliothek">Bibliothek</Link> : null}
            {darf ? <Link href="/einstellungen">Einstellungen</Link> : null}
            <Link href="/archiv">Archiv</Link>
          </div>
        } />
      {/* Den Leerzustand trägt die Kartentabelle selbst (`leer`). */}
      <PlanTabelle zeilen={listePlaene(db, "plaene")} liste="plaene" darfBearbeiten={darf} />
      <h2 className="kp-abschnittstitel">Vorlagen</h2>
      <PlanTabelle zeilen={listePlaene(db, "vorlagen")} liste="vorlagen" darfBearbeiten={darf} vorlagen={vorlagen} heute={heute} />
    </Huelle>
  );
}
```

`src/app/m/kommplan/(intern)/archiv/page.tsx`:

```tsx
import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { listePlaene } from "@/app/m/kommplan/_lib/plaene";
import { darfKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";
import { PlanTabelle } from "../PlanTabelle";

export const dynamic = "force-dynamic";

/** Archiv (Spec §8.3; Entscheidung 10): für alle mit Zugang lesbar; „Wiederherstellen" nur für Bearbeitende. */
export default async function Archiv() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  return (
    <Huelle>
      <Seitenkopf titel="Archiv" zurueck={{ titel: "Alle Pläne", href: "/" }}
        beschreibung="Archivierte Pläne lassen sich ansehen und drucken, aber nicht bearbeiten. Wiederhergestellt stehen sie wieder in der Liste." />
      <PlanTabelle zeilen={listePlaene(getDb(), "archiv")} liste="archiv" darfBearbeiten={darfKommplanBearbeiten(viewer.groups)} />
    </Huelle>
  );
}
```

`src/app/m/kommplan/(intern)/p/[id]/Wiederherstellen.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "antd";
import { stelleWiederHerAction } from "../../../_actions/verwaltung";

/** „Wiederherstellen" am archivierten Plan (Entscheidung 10) — danach öffnet die Seite neu im Editor. */
export function Wiederherstellen({ id }: { id: string }) {
  const router = useRouter();
  const [fehler, setFehler] = useState<string | null>(null);
  return (
    <>
      <Button onClick={() => void stelleWiederHerAction(id).then((r) => { if (r.ok) router.refresh(); else setFehler(r.fehler); })}>Wiederherstellen</Button>
      {fehler ? <p className="kp-feldfehler" role="status">{fehler}</p> : null}
    </>
  );
}
```

`src/app/m/kommplan/(intern)/p/[id]/page.tsx`:
1. `ladePlanOder404` → `ladePlanLesendOder404`.
2. Editor-Zweig nur `if (plan.archiviertAm === null && plan.inhalt && darfKommplanBearbeiten(viewer.groups))`.
3. Im Betrachter-Zweig direkt unter dem `Seitenkopf`, wenn `plan.archiviertAm !== null`:
   ```tsx
        <Card className="kp-archivhinweis" role="status">
          {`Archiviert am ${archivTag(plan.archiviertAm)} — nur lesbar.`}
          {darfKommplanBearbeiten(viewer.groups) ? <Wiederherstellen id={plan.id} /> : null}
        </Card>
   ```
   `archivTag` kommt aus `_lib/plaene.ts` (Task 11, dieselbe Formatierung wie die Archivspalte).
4. Im Editor-Zweig: ist `(await searchParams).kopie === "1"`, bekommt der `Editor` `kopieHinweis={`Kopie angelegt — Titel und Datum stehen auf ${tagText}.`}` (`tagText` = `plan.datum` als `TT.MM.JJJJ`, wie die Datumsspalte der Liste; ohne Datum „heute").
5. `Card` ist RSC-sicher (Falle 1). CSS: `.kp-archivhinweis { margin-block-end: 12px; } .kp-archivhinweis .ant-card-body` — **nein**, keine `.ant-*`-Regel (Falle 20); `Card` bekommt `styles={{ body: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" } }}` als Prop.

`_ui/kommplan.css`: `.kp-listenhinweis { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-block-end: 8px; }`.

- [ ] **Step 4: Grün sehen, Build**

```bash
pnpm vitest run src/app/m/kommplan/
uptime; pnpm build; echo "build exit $?"
```

Expected: PASS; Build Exit 0, neue Route `ƒ /m/kommplan/archiv`.

- [ ] **Step 5: Bestehende e2e laufen lassen** (die Planliste hat jetzt zwei Tabellen; Seed-Vorlagen stehen nicht mehr in „Pläne")

```bash
uptime
pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts; echo "e2e exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
```

Expected: Exit 0. Rot an einem Greifer auf einen Vorlagen-Plan in „Pläne" heißt: den Greifer auf `getByRole("table", { name: "Vorlagen" })` bzw. die Linkrolle einschränken, nicht die Liste zurückbauen.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
for f in PlanTabelle.tsx NeuerPlan.tsx page.tsx plaene.ts kommplan.css Editor.tsx; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
git add "src/app/m/kommplan/(intern)" src/app/m/kommplan/_lib/plaene.ts src/app/m/kommplan/_ui/kommplan.css src/app/m/kommplan/_ui/editor/Editor.tsx src/app/m/kommplan/_ui/editor/Editor.test.tsx
git commit -S -m "feat(kommplan): Planliste mit Vorlagen, Archiv und Aktionen je Plan

Duplizieren führt in den Editor der Kopie, Archivieren lässt sich
zurücknehmen, Vorlagen stehen getrennt und starten neue Pläne. Ein
archivierter Plan zeigt sich nur lesend, mit Wiederherstellen.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Bibliothek — Typen, Schemata und Datenbankzugriff

**Files:**
- Create: `src/app/m/kommplan/_lib/bibliothek/typen.ts`, `src/app/m/kommplan/_lib/bibliothek/schema.ts` (rein)
- Create: `src/app/m/kommplan/_lib/bibliothekDb.ts` (Server)
- Modify: `src/app/m/kommplan/_lib/ergebnis.ts` (`BibErgebnis`, `BibStelleErgebnis`, `BibEinheitErgebnis`, `BibVerbindungErgebnis`, `ImportErgebnis`)
- Test: `src/app/m/kommplan/_lib/bibliothek/typen.test.ts`, `src/app/m/kommplan/_lib/bibliothekDb.test.ts`

**Interfaces:**
- Produces (`typen.ts`): `interface BibStelle { id; titel; zeichen: string | null; leiter: string | null; kontakte: Kontakt[]; notiz: string | null }`; `interface BibEinheit { id; typ; rufname; zeichen: string | null; notiz: string | null }`; `interface BibVerbindung { id; art: VerbindungsArt; bezeichnung; notiz: string | null }`; `interface Bibliothek { stellen: BibStelle[]; einheiten: BibEinheit[]; verbindungen: BibVerbindung[] }`; `LEERE_BIBLIOTHEK`; `vergleichsform(s: string): string`; `passt(anfrage: string, felder: readonly (string | null | undefined)[]): boolean`.
- Produces (`schema.ts`): `BIB_GRENZE = { eintraege: 2000, notiz: 500, import: 500 }`; `bibStelleSchema`, `bibEinheitSchema`, `bibVerbindungSchema` (je mit `id: string | null`; `null` = neu), `bibImportSchema` (Array von `{ typ, rufname, notiz, zeichen? }` — `zeichen` optional, damit „Einheiten in Bibliothek übernehmen" aus dem Plan die Zeichen mitnimmt), `bibVerbindungsImportSchema` (Array von `{ art, bezeichnung }`), `bibLoeschSchema` (`{ art: "stelle" | "einheit" | "verbindung", id }`).
- Produces (`ergebnis.ts`): `type BibErgebnis<T> = { ok: true; eintrag: T } | { ok: false; fehler: string; feldFehler?: FeldFehler }`; `type BibStelleErgebnis = BibErgebnis<BibStelle>` (ebenso Einheit, Verbindung); `type ImportErgebnis<T = BibEinheit> = { ok: true; angelegt: number; uebersprungen: number; eintraege: T[] } | { ok: false; fehler: string }` (`eintraege` = die angelegten, damit der Editor seinen Kontext ergänzen kann); `type VerbindungsImportErgebnis = ImportErgebnis<BibVerbindung>`.
- Produces (`bibliothekDb.ts`): `EINTRAG_WEG`; `ladeBibliothek(db): Bibliothek` (sortiert: Stellen nach Titel, Einheiten nach Typ, dann Rufname, Verbindungen nach Bezeichnung — jeweils `localeCompare("de")`); `speichereBibStelle(db, eingabe: unknown): BibStelleErgebnis`; `speichereBibEinheit(db, eingabe): BibEinheitErgebnis`; `speichereBibVerbindung(db, eingabe): BibVerbindungErgebnis`; `loescheBibEintrag(db, eingabe: unknown): EinfachErgebnis`; `importiereBibEinheiten(db, eingabe: unknown): ImportErgebnis`; `importiereBibVerbindungen(db, eingabe: unknown): VerbindungsImportErgebnis` (Dubletten nach Bezeichnung **und** Art gegen Bibliothek und Liste übersprungen, eine Transaktion).

- [ ] **Step 1: Failing Tests schreiben**

`src/app/m/kommplan/_lib/bibliothek/typen.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { passt, vergleichsform } from "./typen";

describe("Vergleichsform und Suche der Bibliothek", () => {
  it("getrimmt, Leerraum zusammengezogen, ohne Groß/Klein — auch Umlaute", () => {
    expect(vergleichsform("  RK UE   40-83-5 ")).toBe("rk ue 40-83-5");
    expect(vergleichsform("ÜBUNG")).toBe(vergleichsform("übung"));
  });
  it("jedes Wort der Suche muss in einem der Felder stehen; leere Suche passt immer", () => {
    expect(passt("ue 83", ["RTW", "RK UE 40-83-5", null])).toBe(true);
    expect(passt("ktw 83", ["RTW", "RK UE 40-83-5"])).toBe(false);
    expect(passt("   ", ["x"])).toBe(true);
  });
});
```

`src/app/m/kommplan/_lib/bibliothekDb.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { bibStelle } from "../_db/schema";
import { EINTRAG_WEG, importiereBibEinheiten, importiereBibVerbindungen, ladeBibliothek, loescheBibEintrag, speichereBibEinheit, speichereBibStelle, speichereBibVerbindung } from "./bibliothekDb";
import { BIB_GRENZE } from "./bibliothek/schema";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

const STELLE = { id: null, titel: "EAL Nord", zeichen: "zusatz:eal", leiter: "Jana", kontakte: [{ art: "telefon", wert: "0581 1" }, { art: "fax", wert: "  " }], notiz: "" };
async function mitSeed() { const db = testDb(); await seedLokalKommplan(db); return db; }

describe("Bibliothek in der Datenbank (Spec §4.3; Entscheidung 11)", () => {
  it("leer ist leer; nach dem Seed sortiert und mit gelesenen Kontakten", async () => {
    expect(ladeBibliothek(testDb())).toEqual({ stellen: [], einheiten: [], verbindungen: [] });
    const b = ladeBibliothek(await mitSeed());
    expect(b.stellen[0]).toMatchObject({ titel: "Leitstelle Uelzen", kontakte: expect.arrayContaining([{ art: "telefon", wert: "0581 / 82 266" }]) });
    expect(b.einheiten.map((e) => e.typ)).toEqual(["KTW", "MTW", "RTW"]);
    expect(b.verbindungen.map((v) => v.bezeichnung)).toEqual(["R_UE_1", "R_UE_2", "R_UE_3"]);
  });
  it("Stelle anlegen: leere Kontakte und leere Notiz fallen weg; ändern; unbekannte ID", async () => {
    const db = testDb();
    const r = speichereBibStelle(db, STELLE);
    if (!r.ok) throw new Error(r.fehler);
    expect(r.eintrag).toMatchObject({ titel: "EAL Nord", kontakte: [{ art: "telefon", wert: "0581 1" }], notiz: null });
    expect(speichereBibStelle(db, { ...STELLE, id: r.eintrag.id, leiter: "Ole" })).toMatchObject({ ok: true, eintrag: { leiter: "Ole" } });
    expect(speichereBibStelle(db, { ...STELLE, id: "gibt-es-nicht", titel: "Neu" })).toEqual({ ok: false, fehler: EINTRAG_WEG });
  });
  it("Dubletten: Stelle nach Titel (auch umbenannt), Einheit nach Rufname, Verbindung nach Bezeichnung UND Art", async () => {
    const db = await mitSeed();
    expect(speichereBibStelle(db, { ...STELLE, titel: " leitstelle   UELZEN " })).toMatchObject({ ok: false, feldFehler: { titel: "„Leitstelle Uelzen“ steht schon in der Bibliothek." } });
    const eal = speichereBibStelle(db, STELLE);
    if (!eal.ok) throw new Error(eal.fehler);
    expect(speichereBibStelle(db, { ...STELLE, id: eal.eintrag.id, titel: "Leitstelle Uelzen" }).ok).toBe(false);
    expect(speichereBibEinheit(db, { id: null, typ: "NEF", rufname: "rk ue 40-83-5", zeichen: null, notiz: null })).toMatchObject({ ok: false, feldFehler: { rufname: expect.stringContaining("schon in der Bibliothek") } });
    expect(speichereBibVerbindung(db, { id: null, art: "dmo", bezeichnung: "R_UE_1", notiz: null }).ok).toBe(true);
    expect(speichereBibVerbindung(db, { id: null, art: "tmo", bezeichnung: "r_ue_1", notiz: null }).ok).toBe(false);
  });
  it("Pflichtfelder und Grenzen als Feldfehler", () => {
    const db = testDb();
    expect(speichereBibStelle(db, { ...STELLE, titel: "  " })).toMatchObject({ ok: false, feldFehler: { titel: "Bitte einen Titel eintragen." } });
    expect(speichereBibEinheit(db, { id: null, typ: "RTW", rufname: "", zeichen: null, notiz: null })).toMatchObject({ ok: false, feldFehler: { rufname: "Bitte einen Rufnamen eintragen." } });
    expect(speichereBibVerbindung(db, { id: null, art: "funk", bezeichnung: "X", notiz: null })).toMatchObject({ ok: false, feldFehler: { art: "Bitte eine Art wählen." } });
    expect(speichereBibStelle(db, { ...STELLE, notiz: "x".repeat(BIB_GRENZE.notiz + 1) })).toMatchObject({ ok: false, feldFehler: { notiz: `Höchstens ${BIB_GRENZE.notiz} Zeichen.` } });
  });
  it("beschädigte Kontakte in der Datenbank lesen sich als leere Liste, nicht als Absturz", async () => {
    const db = await mitSeed();
    db.update(bibStelle).set({ kontakte: '[{"art":"brieftaube","wert":"x"}]' }).where(eq(bibStelle.id, "bib-lts-uelzen")).run();
    expect(ladeBibliothek(db).stellen.find((s) => s.id === "bib-lts-uelzen")?.kontakte).toEqual([]);
  });
  it("löschen: Eintrag weg, Audit-Zeile; unbekannt → EINTRAG_WEG", async () => {
    const db = await mitSeed();
    expect(loescheBibEintrag(db, { art: "einheit", id: "bib-einheit-1" })).toEqual({ ok: true });
    expect(loescheBibEintrag(db, { art: "einheit", id: "bib-einheit-1" })).toEqual({ ok: false, fehler: EINTRAG_WEG });
    expect(loescheBibEintrag(db, { art: "plan", id: "x" }).ok).toBe(false);
    expect((db.all(sql`SELECT count(*) AS n FROM audit_outbox WHERE object_type = 'bib_einheit' AND action = 'delete'`) as { n: number }[])[0].n).toBe(1);
  });
  it("Import: Dubletten gegen die Bibliothek UND in der Liste werden übersprungen, in einer Transaktion", async () => {
    const db = await mitSeed();
    const r = importiereBibEinheiten(db, [
      { typ: "RTW", rufname: " rk ue 40-83-5", notiz: null },
      { typ: "KTW", rufname: "RK UE 41-92-8", notiz: "Reserve" },
      { typ: "KTW", rufname: "rk ue 41-92-8 ", notiz: null },
    ]);
    expect(r).toEqual({ ok: true, angelegt: 1, uebersprungen: 2, eintraege: [expect.objectContaining({ typ: "KTW", rufname: "RK UE 41-92-8", notiz: "Reserve", zeichen: null })] });
    expect(ladeBibliothek(db).einheiten.find((e) => e.rufname === "RK UE 41-92-8")).toMatchObject({ typ: "KTW", notiz: "Reserve" });
    expect(importiereBibEinheiten(db, [{ typ: "NEF", rufname: "RK UE 40-82-1", notiz: null, zeichen: "rezept:F.2.3" }])).toMatchObject({ ok: true, eintraege: [{ zeichen: "rezept:F.2.3" }] });
  });
  it("Verbindungen importieren (aus dem Plan): Dubletten nach Bezeichnung UND Art übersprungen, angelegte zurück", async () => {
    const db = await mitSeed();
    const r = importiereBibVerbindungen(db, [
      { art: "tmo", bezeichnung: " r_ue_1 " }, { art: "dmo", bezeichnung: "R_UE_1" }, { art: "dmo", bezeichnung: "r_ue_1" },
    ]);
    expect(r).toEqual({ ok: true, angelegt: 1, uebersprungen: 2, eintraege: [expect.objectContaining({ art: "dmo", bezeichnung: "R_UE_1", notiz: null })] });
    expect(importiereBibVerbindungen(db, [{ art: "funk", bezeichnung: "X" }])).toMatchObject({ ok: false });
  });
  it("Import: leer, über 500 Zeilen oder mit ungültiger Zeile — nichts angelegt, Meldung mit Zeilennummer", () => {
    const db = testDb();
    expect(importiereBibEinheiten(db, [])).toEqual({ ok: false, fehler: "Die Liste ist leer." });
    expect(importiereBibEinheiten(db, Array.from({ length: 501 }, (_, i) => ({ typ: "KTW", rufname: `K ${i}`, notiz: null }))).ok).toBe(false);
    expect(importiereBibEinheiten(db, [{ typ: "RTW", rufname: "A", notiz: null }, { typ: "RTW", rufname: "", notiz: null }]))
      .toEqual({ ok: false, fehler: "Zeile 2: Bitte einen Rufnamen eintragen." });
    expect(ladeBibliothek(db).einheiten).toEqual([]);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/bibliothek src/app/m/kommplan/_lib/bibliothekDb.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_lib/bibliothek/typen.ts`:

```ts
import type { Kontakt, VerbindungsArt } from "../plan/schema";

/**
 * DIE BIBLIOTHEK (Spec §4.1, §4.3) — Typen und Vergleich, rein (Server, Client-Inseln, Tests). Einfügen
 * KOPIERT in den Plan; danach gibt es im Plan keinen Unterschied zu freien Angaben, und ein Plan ändert
 * sich nie still, wenn jemand die Bibliothek pflegt.
 */
export interface BibStelle { id: string; titel: string; zeichen: string | null; leiter: string | null; kontakte: Kontakt[]; notiz: string | null }
export interface BibEinheit { id: string; typ: string; rufname: string; zeichen: string | null; notiz: string | null }
export interface BibVerbindung { id: string; art: VerbindungsArt; bezeichnung: string; notiz: string | null }
export interface Bibliothek { stellen: BibStelle[]; einheiten: BibEinheit[]; verbindungen: BibVerbindung[] }
export const LEERE_BIBLIOTHEK: Bibliothek = { stellen: [], einheiten: [], verbindungen: [] };

/** Vergleichsform für Dubletten und Suche (Entscheidung 11): getrimmt, Leerraum zusammengezogen, klein. */
export function vergleichsform(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
}

/** Jedes Wort der Anfrage steht in einem der Felder; eine leere Anfrage passt immer. */
export function passt(anfrage: string, felder: readonly (string | null | undefined)[]): boolean {
  const woerter = vergleichsform(anfrage).split(" ").filter((w) => w !== "");
  if (woerter.length === 0) return true;
  const text = vergleichsform(felder.filter((f): f is string => typeof f === "string").join(" "));
  return woerter.every((w) => text.includes(w));
}
```

`src/app/m/kommplan/_lib/bibliothek/schema.ts`:

```ts
import { z } from "zod";
import { GRENZE, kontaktSchema, LAENGE, VERBINDUNGS_ARTEN } from "../plan/schema";

/**
 * Eingaben der Bibliothek (Entscheidungen 11, 12) — dieselben Feldgrenzen wie im Plan (`LAENGE`), damit eine
 * Kopie nie an einem Schemafehler des Plans scheitert. `id: null` heißt „neu".
 */
export const BIB_GRENZE = { eintraege: 2000, notiz: 500, import: 500 } as const;
const leerZuNull = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v);
const pflicht = (laenge: number, leer: string) => z.string().trim().min(1, leer).max(laenge, `Höchstens ${laenge} Zeichen.`);
const frei = (laenge: number) => z.preprocess(leerZuNull, z.string().max(laenge, `Höchstens ${laenge} Zeichen.`).nullable());
const id = z.string().min(1).max(64).nullable();
const notiz = frei(BIB_GRENZE.notiz);
const zeichen = frei(80);

export const bibStelleSchema = z.object({
  id, titel: pflicht(LAENGE.titel, "Bitte einen Titel eintragen."), zeichen, leiter: frei(LAENGE.leiter),
  kontakte: z.array(kontaktSchema).max(GRENZE.kontakte, `Höchstens ${GRENZE.kontakte} Kontakte.`)
    .transform((k) => k.filter((x) => x.wert.trim() !== "")),
  notiz,
}).strict();
export const bibEinheitSchema = z.object({
  id, typ: pflicht(LAENGE.typ, "Bitte einen Typ eintragen."), rufname: pflicht(LAENGE.rufname, "Bitte einen Rufnamen eintragen."), zeichen, notiz,
}).strict();
export const bibVerbindungSchema = z.object({
  id, art: z.enum(VERBINDUNGS_ARTEN, { error: "Bitte eine Art wählen." }), bezeichnung: pflicht(LAENGE.bezeichnung, "Bitte eine Bezeichnung eintragen."), notiz,
}).strict();
export const bibImportSchema = z.array(z.object({
  typ: pflicht(LAENGE.typ, "Bitte einen Typ eintragen."), rufname: pflicht(LAENGE.rufname, "Bitte einen Rufnamen eintragen."), notiz,
  zeichen: zeichen.optional(),
}).strict()).min(1, "Die Liste ist leer.").max(BIB_GRENZE.import, `Höchstens ${BIB_GRENZE.import} Zeilen je Import.`);
export const bibVerbindungsImportSchema = z.array(z.object({
  art: z.enum(VERBINDUNGS_ARTEN, { error: "Bitte eine Art wählen." }), bezeichnung: pflicht(LAENGE.bezeichnung, "Bitte eine Bezeichnung eintragen."),
}).strict()).min(1, "Der Plan hat keine Verbindungen.").max(BIB_GRENZE.import, `Höchstens ${BIB_GRENZE.import} Zeilen je Import.`);
export const bibLoeschSchema = z.object({ art: z.enum(["stelle", "einheit", "verbindung"]), id: z.string().min(1).max(64) }).strict();
```

In `src/app/m/kommplan/_lib/ergebnis.ts` ergänzen (Import `import type { BibEinheit, BibStelle, BibVerbindung } from "./bibliothek/typen";`):

```ts
export type BibErgebnis<T> = { ok: true; eintrag: T } | { ok: false; fehler: string; feldFehler?: FeldFehler };
export type BibStelleErgebnis = BibErgebnis<BibStelle>;
export type BibEinheitErgebnis = BibErgebnis<BibEinheit>;
export type BibVerbindungErgebnis = BibErgebnis<BibVerbindung>;
export type ImportErgebnis<T = BibEinheit> = { ok: true; angelegt: number; uebersprungen: number; eintraege: T[] } | { ok: false; fehler: string };
export type VerbindungsImportErgebnis = ImportErgebnis<BibVerbindung>;
```

`src/app/m/kommplan/_lib/bibliothekDb.ts`:

```ts
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { KommplanDb } from "../_db/client";
import { bibEinheit, bibStelle, bibVerbindung } from "../_db/schema";
import { feldFehlerAus } from "./angaben";
import { BIB_GRENZE, bibEinheitSchema, bibImportSchema, bibLoeschSchema, bibStelleSchema, bibVerbindungSchema, bibVerbindungsImportSchema } from "./bibliothek/schema";
import { vergleichsform, type BibEinheit, type BibStelle, type BibVerbindung, type Bibliothek } from "./bibliothek/typen";
import type { BibEinheitErgebnis, BibStelleErgebnis, BibVerbindungErgebnis, EinfachErgebnis, ImportErgebnis, VerbindungsImportErgebnis } from "./ergebnis";
import { kontaktSchema, type VerbindungsArt } from "./plan/schema";

/**
 * BIBLIOTHEK IN DER DATENBANK (Spec §4.1, §4.3; Umsetzungsplan Phase 4, Entscheidungen 11, 12) — nur Server.
 * Jede ID wird hier aufgelöst (IDOR); Dubletten werden IN der Transaktion geprüft, in der geschrieben wird.
 * Auditiert über die Trigger der drei Tabellen (Migration 0000). Bei bis zu 2000 Einträgen je Bereich ist
 * „alle Namen lesen und vergleichen" billiger und klarer als eine Spalte mit Vergleichsform.
 */
export const EINTRAG_WEG = "Diesen Eintrag gibt es nicht mehr.";
const FELDER = "Bitte die markierten Felder prüfen.";
const nachDe = (a: string, b: string) => a.localeCompare(b, "de");
const SCHON = (name: string) => `„${name}“ steht schon in der Bibliothek.`;

function kontakteAus(roh: string): BibStelle["kontakte"] {
  try {
    const r = z.array(kontaktSchema).safeParse(JSON.parse(roh));
    return r.success ? r.data : [];
  } catch { return []; }
}

export function ladeBibliothek(db: Pick<KommplanDb, "select">): Bibliothek {
  return {
    stellen: db.select().from(bibStelle).all()
      .map((z): BibStelle => ({ id: z.id, titel: z.titel, zeichen: z.zeichen, leiter: z.leiter, kontakte: kontakteAus(z.kontakte), notiz: z.notiz }))
      .sort((a, b) => nachDe(a.titel, b.titel) || nachDe(a.id, b.id)),
    einheiten: db.select().from(bibEinheit).all()
      .map((z): BibEinheit => ({ id: z.id, typ: z.typ, rufname: z.rufname, zeichen: z.zeichen, notiz: z.notiz }))
      .sort((a, b) => nachDe(a.typ, b.typ) || nachDe(a.rufname, b.rufname)),
    verbindungen: db.select().from(bibVerbindung).all()
      .map((z): BibVerbindung => ({ id: z.id, art: z.art as VerbindungsArt, bezeichnung: z.bezeichnung, notiz: z.notiz }))
      .sort((a, b) => nachDe(a.bezeichnung, b.bezeichnung) || nachDe(a.art, b.art)),
  };
}

/** Anzahl der Zeilen — typisiert über Drizzle, damit es in der Transaktion (`tx`) genauso geht. */
const ANZAHL = { n: sql<number>`count(*)` };
const ZU_VIELE = (was: string) => `Höchstens ${BIB_GRENZE.eintraege} ${was} in der Bibliothek.`;

export function speichereBibStelle(db: KommplanDb, eingabe: unknown): BibStelleErgebnis {
  const r = bibStelleSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: FELDER, feldFehler: feldFehlerAus(r.error) };
  const e = r.data;
  return db.transaction((tx): BibStelleErgebnis => {
    const doppelt = tx.select({ id: bibStelle.id, titel: bibStelle.titel }).from(bibStelle).all()
      .find((x) => x.id !== e.id && vergleichsform(x.titel) === vergleichsform(e.titel));
    if (doppelt) return { ok: false, fehler: FELDER, feldFehler: { titel: SCHON(doppelt.titel) } };
    const werte = { titel: e.titel, zeichen: e.zeichen, leiter: e.leiter, kontakte: JSON.stringify(e.kontakte), notiz: e.notiz };
    if (e.id === null) {
      if (tx.select(ANZAHL).from(bibStelle).get()!.n >= BIB_GRENZE.eintraege) return { ok: false, fehler: ZU_VIELE("Stellen") };
      const id = randomUUID();
      tx.insert(bibStelle).values({ id, ...werte }).run();
      return { ok: true, eintrag: { ...e, id } };
    }
    const u = tx.update(bibStelle).set(werte).where(eq(bibStelle.id, e.id)).run();
    return u.changes === 1 ? { ok: true, eintrag: { ...e, id: e.id } } : { ok: false, fehler: EINTRAG_WEG };
  });
}

export function speichereBibEinheit(db: KommplanDb, eingabe: unknown): BibEinheitErgebnis {
  const r = bibEinheitSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: FELDER, feldFehler: feldFehlerAus(r.error) };
  const e = r.data;
  return db.transaction((tx): BibEinheitErgebnis => {
    const doppelt = tx.select({ id: bibEinheit.id, rufname: bibEinheit.rufname }).from(bibEinheit).all()
      .find((x) => x.id !== e.id && vergleichsform(x.rufname) === vergleichsform(e.rufname));
    if (doppelt) return { ok: false, fehler: FELDER, feldFehler: { rufname: SCHON(doppelt.rufname) } };
    const werte = { typ: e.typ, rufname: e.rufname, zeichen: e.zeichen, notiz: e.notiz };
    if (e.id === null) {
      if (tx.select(ANZAHL).from(bibEinheit).get()!.n >= BIB_GRENZE.eintraege) return { ok: false, fehler: ZU_VIELE("Einheiten") };
      const id = randomUUID();
      tx.insert(bibEinheit).values({ id, ...werte }).run();
      return { ok: true, eintrag: { ...werte, id } };
    }
    const u = tx.update(bibEinheit).set(werte).where(eq(bibEinheit.id, e.id)).run();
    return u.changes === 1 ? { ok: true, eintrag: { ...werte, id: e.id } } : { ok: false, fehler: EINTRAG_WEG };
  });
}

export function speichereBibVerbindung(db: KommplanDb, eingabe: unknown): BibVerbindungErgebnis {
  const r = bibVerbindungSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: FELDER, feldFehler: feldFehlerAus(r.error) };
  const e = r.data;
  return db.transaction((tx): BibVerbindungErgebnis => {
    const doppelt = tx.select().from(bibVerbindung).all()
      .find((x) => x.id !== e.id && x.art === e.art && vergleichsform(x.bezeichnung) === vergleichsform(e.bezeichnung));
    if (doppelt) return { ok: false, fehler: FELDER, feldFehler: { bezeichnung: SCHON(doppelt.bezeichnung) } };
    const werte = { art: e.art, bezeichnung: e.bezeichnung, notiz: e.notiz };
    if (e.id === null) {
      if (tx.select(ANZAHL).from(bibVerbindung).get()!.n >= BIB_GRENZE.eintraege) return { ok: false, fehler: ZU_VIELE("Verbindungen") };
      const id = randomUUID();
      tx.insert(bibVerbindung).values({ id, ...werte }).run();
      return { ok: true, eintrag: { ...werte, id } };
    }
    const u = tx.update(bibVerbindung).set(werte).where(eq(bibVerbindung.id, e.id)).run();
    return u.changes === 1 ? { ok: true, eintrag: { ...werte, id: e.id } } : { ok: false, fehler: EINTRAG_WEG };
  });
}

export function loescheBibEintrag(db: KommplanDb, eingabe: unknown): EinfachErgebnis {
  const r = bibLoeschSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: "Ungültige Anfrage." };
  const tabelle = { stelle: bibStelle, einheit: bibEinheit, verbindung: bibVerbindung }[r.data.art];
  const d = db.delete(tabelle).where(eq(tabelle.id, r.data.id)).run();
  return d.changes === 1 ? { ok: true } : { ok: false, fehler: EINTRAG_WEG };
}

function importFehler(fehler: z.ZodError): { ok: false; fehler: string } {
  const i = fehler.issues[0];
  const zeile = typeof i?.path[0] === "number" ? `Zeile ${i.path[0] + 1}: ` : "";
  return { ok: false, fehler: `${zeile}${i?.message ?? "Ungültige Liste."}` };
}

export function importiereBibEinheiten(db: KommplanDb, eingabe: unknown): ImportErgebnis {
  const r = bibImportSchema.safeParse(eingabe);
  if (!r.success) return importFehler(r.error);
  return db.transaction((tx): ImportErgebnis => {
    const bekannt = new Set(tx.select({ r: bibEinheit.rufname }).from(bibEinheit).all().map((x) => vergleichsform(x.r)));
    const vorher = bekannt.size;
    const neu = r.data.filter((z) => { const k = vergleichsform(z.rufname); if (bekannt.has(k)) return false; bekannt.add(k); return true; });
    if (vorher + neu.length > BIB_GRENZE.eintraege) return { ok: false, fehler: ZU_VIELE("Einheiten") };
    const eintraege = neu.map((z): BibEinheit => ({ id: randomUUID(), typ: z.typ, rufname: z.rufname, zeichen: z.zeichen ?? null, notiz: z.notiz }));
    for (const e of eintraege) tx.insert(bibEinheit).values(e).run();
    return { ok: true, angelegt: neu.length, uebersprungen: r.data.length - neu.length, eintraege };
  });
}

/** „Verbindungen in Bibliothek übernehmen" (Entscheidung 13): alle Verbindungen eines Plans in EINEM Aufruf. */
export function importiereBibVerbindungen(db: KommplanDb, eingabe: unknown): VerbindungsImportErgebnis {
  const r = bibVerbindungsImportSchema.safeParse(eingabe);
  if (!r.success) return importFehler(r.error);
  return db.transaction((tx): VerbindungsImportErgebnis => {
    const schluessel = (art: string, bezeichnung: string) => `${art}\u0000${vergleichsform(bezeichnung)}`;
    const bekannt = new Set(tx.select().from(bibVerbindung).all().map((x) => schluessel(x.art, x.bezeichnung)));
    const vorher = bekannt.size;
    const neu = r.data.filter((v) => { const k = schluessel(v.art, v.bezeichnung); if (bekannt.has(k)) return false; bekannt.add(k); return true; });
    if (vorher + neu.length > BIB_GRENZE.eintraege) return { ok: false, fehler: ZU_VIELE("Verbindungen") };
    const eintraege = neu.map((v): BibVerbindung => ({ id: randomUUID(), art: v.art, bezeichnung: v.bezeichnung, notiz: null }));
    for (const e of eintraege) tx.insert(bibVerbindung).values(e).run();
    return { ok: true, angelegt: neu.length, uebersprungen: r.data.length - neu.length, eintraege };
  });
}
```

(`bekannt.size` als „vorher" setzt voraus, dass die Bibliothek selbst dublettenfrei ist — das hält das Speichern; ein Altbestand mit Dubletten zählt höchstens zu wenig, nie zu viel.)

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/bibliothek src/app/m/kommplan/_lib/bibliothekDb.test.ts src/app/m/kommplan/grenze.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
git add src/app/m/kommplan/_lib/bibliothek src/app/m/kommplan/_lib/bibliothekDb.ts src/app/m/kommplan/_lib/bibliothekDb.test.ts src/app/m/kommplan/_lib/ergebnis.ts
git commit -S -m "feat(kommplan): Bibliothek speichern, löschen, importieren — ohne Dubletten

Stellen nach Titel, Einheiten nach Rufname, Verbindungen nach Bezeichnung
und Art; Import überspringt Vorhandenes und Doppeltes in einer
Transaktion.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: CSV und „Liste einfügen" lesen, Vorschau vor der Übernahme

**Files:**
- Create: `src/app/m/kommplan/_lib/bibliothek/csv.ts`, `src/app/m/kommplan/_lib/bibliothek/vorschau.ts` (rein)
- Test: `src/app/m/kommplan/_lib/bibliothek/csv.test.ts`, `src/app/m/kommplan/_lib/bibliothek/vorschau.test.ts`

**Interfaces:**
- Consumes: `leseEinheitenliste` (`_lib/plan/einfuegen.ts`, unverändert), `BIB_GRENZE`, `LAENGE`, `vergleichsform`, `BibEinheit`.
- Produces (`csv.ts`): `interface ImportZeile { zeile: number; typ: string; rufname: string; notiz: string | null }`; `interface ImportLesung { zeilen: ImportZeile[]; fehler: string[] }`; `dekodiereText(bytes: Uint8Array): string`; `leseCsv(text: string, trenner?: string): { saetze: { zeile: number; felder: string[] }[]; fehler: string | null }`; `leseEinheitenCsv(text: string): ImportLesung`; `einheitenAusListe(text: string): ImportLesung`.
- Produces (`vorschau.ts`): `type VorschauStatus = "neu" | "vorhanden" | "doppelt"`; `STATUS_TEXT: Record<VorschauStatus, string>`; `interface VorschauZeile extends ImportZeile { status: VorschauStatus }`; `importVorschau(zeilen: readonly ImportZeile[], vorhanden: readonly BibEinheit[]): { zeilen: VorschauZeile[]; neu: ImportZeile[] }`.

- [ ] **Step 1: Failing Tests schreiben**

`src/app/m/kommplan/_lib/bibliothek/csv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dekodiereText, einheitenAusListe, leseCsv, leseEinheitenCsv } from "./csv";

const latin1 = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0))); // Windows-1252 == Latin-1 für diese Zeichen

describe("dekodiereText — Excel speichert deutsche CSV als Windows-1252", () => {
  it("UTF-8 (mit und ohne BOM) bleibt UTF-8, sonst Windows-1252", () => {
    expect(dekodiereText(new TextEncoder().encode("KTW;Großenkneten"))).toBe("KTW;Großenkneten");
    expect(dekodiereText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Übung")]))).toBe("Übung");
    expect(dekodiereText(latin1("KTW;RK Großenkneten 1;Übung"))).toBe("KTW;RK Großenkneten 1;Übung");
  });
});

describe("leseCsv — Semikolon, Anführungszeichen, Zeilenenden", () => {
  it("Felder in Anführungszeichen mit ; und \"\", CRLF und CR, Startzeile je Datensatz", () => {
    const r = leseCsv('Typ;Rufname;Notiz\r\nRTW;"RK UE; 40-83-5";"sagt ""hallo"""\rKTW;"zwei\nZeilen";x\n');
    expect(r.fehler).toBeNull();
    expect(r.saetze).toEqual([
      { zeile: 1, felder: ["Typ", "Rufname", "Notiz"] },
      { zeile: 2, felder: ["RTW", "RK UE; 40-83-5", 'sagt "hallo"'] },
      { zeile: 3, felder: ["KTW", "zwei\nZeilen", "x"] },
    ]);
  });
  it("ein nicht geschlossenes Anführungszeichen ist ein Fehler mit Zeile", () => {
    expect(leseCsv('RTW;"offen\nKTW;x').fehler).toBe("Zeile 1: Ein Anführungszeichen wird nicht geschlossen.");
  });
});

describe("leseEinheitenCsv — Typ;Rufname[;Notiz] (Entscheidung 12)", () => {
  it("Kopfzeile erkannt, Leerzeilen übersprungen, leere Notiz null, angehängte leere Spalten aus Excel geduldet", () => {
    expect(leseEinheitenCsv("﻿typ;RUFNAME;notiz\n\nRTW;RK UE 40-83-5;\nKTW; RK UE 40-92-1 ;Reserve;;\n")).toEqual({
      zeilen: [
        { zeile: 3, typ: "RTW", rufname: "RK UE 40-83-5", notiz: null },
        { zeile: 4, typ: "KTW", rufname: "RK UE 40-92-1", notiz: "Reserve" },
      ],
      fehler: [],
    });
  });
  it("ohne Kopfzeile ist die erste Zeile Daten", () => {
    expect(leseEinheitenCsv("RTW;RK 1").zeilen).toEqual([{ zeile: 1, typ: "RTW", rufname: "RK 1", notiz: null }]);
  });
  it("Fehler je Zeile: vier Spalten mit Inhalt, Rufname fehlt (Komma statt Semikolon), Typ fehlt, zu lang", () => {
    const r = leseEinheitenCsv(`RTW;RK 1;a;b\nKTW,RK 2\n;RK 3\nRTW;${"x".repeat(81)}`);
    expect(r.fehler).toEqual([
      "Zeile 1: Mehr als drei Spalten — erwartet wird Typ;Rufname;Notiz.",
      "Zeile 2: Der Rufname fehlt (Trennzeichen ist das Semikolon).",
      "Zeile 3: Der Typ fehlt.",
      "Zeile 4: Der Rufname ist länger als 80 Zeichen.",
    ]);
    expect(r.zeilen).toEqual([]);
  });
  it("über 500 Zeilen: ein Fehler mit der Zahl", () => {
    const text = Array.from({ length: 501 }, (_, i) => `KTW;K ${i}`).join("\n");
    expect(leseEinheitenCsv(text).fehler).toEqual(["Höchstens 500 Zeilen je Import — hier sind es 501."]);
  });
});

describe("einheitenAusListe — derselbe Parser wie „Liste einfügen“ im Flyin", () => {
  it("erstes Wort Typ, Rest Rufname; Zeilennummern; ein Typ ohne Rufname ist hier ein Fehler", () => {
    expect(einheitenAusListe("RTW RK UE 40-83-5\n\n\tKTW   RK UE 40-92-1\nNEF")).toEqual({
      zeilen: [
        { zeile: 1, typ: "RTW", rufname: "RK UE 40-83-5", notiz: null },
        { zeile: 3, typ: "KTW", rufname: "RK UE 40-92-1", notiz: null },
      ],
      fehler: ["Zeile 4: Der Rufname fehlt."],
    });
  });
});
```

`src/app/m/kommplan/_lib/bibliothek/vorschau.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { importVorschau } from "./vorschau";

const VORHANDEN = [{ id: "1", typ: "RTW", rufname: "RK UE 40-83-5", zeichen: null, notiz: null }];
describe("importVorschau", () => {
  it("neu, schon in der Bibliothek (anders geschrieben), doppelt in der Liste — übernommen wird nur Neues", () => {
    const r = importVorschau([
      { zeile: 1, typ: "RTW", rufname: " rk ue 40-83-5", notiz: null },
      { zeile: 2, typ: "KTW", rufname: "RK UE 41-92-8", notiz: null },
      { zeile: 3, typ: "KTW", rufname: "RK  UE 41-92-8", notiz: "x" },
    ], VORHANDEN);
    expect(r.zeilen.map((z) => z.status)).toEqual(["vorhanden", "neu", "doppelt"]);
    expect(r.neu).toEqual([{ zeile: 2, typ: "KTW", rufname: "RK UE 41-92-8", notiz: null }]);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/bibliothek`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_lib/bibliothek/csv.ts`:

```ts
import { leseEinheitenliste } from "../plan/einfuegen";
import { LAENGE } from "../plan/schema";
import { BIB_GRENZE } from "./schema";

/**
 * EINHEITEN IMPORTIEREN (Umsetzungsplan Phase 4, Entscheidung 12) — rein. Zwei Quellen, eine Form:
 * eine CSV `Typ;Rufname[;Notiz]` und der Text aus „Liste einfügen" (derselbe Parser wie im Flyin,
 * `leseEinheitenliste`). Fehler tragen die Zeilennummer der Quelle; NICHTS wird still gekürzt — eine
 * Liste mit Fehlern übernimmt die Oberfläche gar nicht.
 */
export interface ImportZeile { zeile: number; typ: string; rufname: string; notiz: string | null }
export interface ImportLesung { zeilen: ImportZeile[]; fehler: string[] }

/** UTF-8, sonst Windows-1252 — Excel speichert „CSV (Trennzeichen-getrennt)" auf deutschen Systemen so. Die BOM fällt weg. */
export function dekodiereText(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}

/** RFC-4180-artig: Felder in "…", `""` ist ein Anführungszeichen, Umbrüche in Anführungszeichen gehören zum Feld. */
export function leseCsv(text: string, trenner = ";"): { saetze: { zeile: number; felder: string[] }[]; fehler: string | null } {
  const t = text.replace(/^﻿/, "");
  const saetze: { zeile: number; felder: string[] }[] = [];
  let felder: string[] = [];
  let feld = "";
  let inAnf = false;
  let zeile = 1;
  let start = 1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inAnf) {
      if (c === '"') {
        if (t[i + 1] === '"') { feld += '"'; i++; } else inAnf = false;
      } else {
        if (c === "\n" || (c === "\r" && t[i + 1] !== "\n")) zeile++;
        feld += c;
      }
      continue;
    }
    if (c === '"' && feld === "") { inAnf = true; continue; }
    if (c === trenner) { felder.push(feld); feld = ""; continue; }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      felder.push(feld);
      saetze.push({ zeile: start, felder });
      felder = []; feld = ""; zeile++; start = zeile;
      continue;
    }
    feld += c;
  }
  if (inAnf) return { saetze, fehler: `Zeile ${start}: Ein Anführungszeichen wird nicht geschlossen.` };
  if (feld !== "" || felder.length > 0) { felder.push(feld); saetze.push({ zeile: start, felder }); }
  return { saetze, fehler: null };
}

function pruefe(zeile: number, typ: string, rufname: string, notiz: string, aus: ImportLesung): void {
  if (rufname === "") { aus.fehler.push(`Zeile ${zeile}: Der Rufname fehlt (Trennzeichen ist das Semikolon).`); return; }
  if (typ === "") { aus.fehler.push(`Zeile ${zeile}: Der Typ fehlt.`); return; }
  if (typ.length > LAENGE.typ) { aus.fehler.push(`Zeile ${zeile}: Der Typ ist länger als ${LAENGE.typ} Zeichen.`); return; }
  if (rufname.length > LAENGE.rufname) { aus.fehler.push(`Zeile ${zeile}: Der Rufname ist länger als ${LAENGE.rufname} Zeichen.`); return; }
  if (notiz.length > BIB_GRENZE.notiz) { aus.fehler.push(`Zeile ${zeile}: Die Notiz ist länger als ${BIB_GRENZE.notiz} Zeichen.`); return; }
  aus.zeilen.push({ zeile, typ, rufname, notiz: notiz === "" ? null : notiz });
}

function deckel(aus: ImportLesung): ImportLesung {
  if (aus.zeilen.length > BIB_GRENZE.import) aus.fehler.push(`Höchstens ${BIB_GRENZE.import} Zeilen je Import — hier sind es ${aus.zeilen.length}.`);
  return aus;
}

export function leseEinheitenCsv(text: string): ImportLesung {
  const { saetze, fehler } = leseCsv(text);
  const aus: ImportLesung = { zeilen: [], fehler: fehler ? [fehler] : [] };
  let erste = true;
  for (const { zeile, felder } of saetze) {
    const zellen = felder.map((f) => f.trim());
    while (zellen.length > 3 && zellen[zellen.length - 1] === "") zellen.pop(); // Excel hängt leere Spalten an
    if (zellen.every((z) => z === "")) continue;
    if (erste) {
      erste = false;
      if (zellen[0]?.toLowerCase() === "typ" && zellen[1]?.toLowerCase() === "rufname") continue;
    }
    if (zellen.length > 3) { aus.fehler.push(`Zeile ${zeile}: Mehr als drei Spalten — erwartet wird Typ;Rufname;Notiz.`); continue; }
    pruefe(zeile, zellen[0] ?? "", zellen[1] ?? "", zellen[2] ?? "", aus);
  }
  return deckel(aus);
}

/** „Liste einfügen": Zeile für Zeile durch `leseEinheitenliste`, damit die Zeilennummern stimmen. */
export function einheitenAusListe(text: string): ImportLesung {
  const aus: ImportLesung = { zeilen: [], fehler: [] };
  text.split(/\r\n|\r|\n/).forEach((roh, i) => {
    const r = leseEinheitenliste(roh);
    aus.fehler.push(...r.fehler.map((f) => f.replace(/^Zeile 1:/, `Zeile ${i + 1}:`)));
    for (const e of r.einheiten) {
      if (e.rufname === "") aus.fehler.push(`Zeile ${i + 1}: Der Rufname fehlt.`);
      else aus.zeilen.push({ zeile: i + 1, typ: e.typ, rufname: e.rufname, notiz: null });
    }
  });
  return deckel(aus);
}
```

`src/app/m/kommplan/_lib/bibliothek/vorschau.ts`:

```ts
import type { ImportZeile } from "./csv";
import { vergleichsform, type BibEinheit } from "./typen";

/** Vorschau vor der Übernahme (Entscheidung 12): Status je Zeile, übernommen wird nur „neu". Rein. */
export type VorschauStatus = "neu" | "vorhanden" | "doppelt";
export const STATUS_TEXT: Record<VorschauStatus, string> = { neu: "neu", vorhanden: "schon in der Bibliothek", doppelt: "doppelt in der Liste" };
export interface VorschauZeile extends ImportZeile { status: VorschauStatus }

export function importVorschau(zeilen: readonly ImportZeile[], vorhanden: readonly BibEinheit[]): { zeilen: VorschauZeile[]; neu: ImportZeile[] } {
  const bekannt = new Set(vorhanden.map((e) => vergleichsform(e.rufname)));
  const gesehen = new Set<string>();
  const aus = zeilen.map((z): VorschauZeile => {
    const k = vergleichsform(z.rufname);
    const status: VorschauStatus = bekannt.has(k) ? "vorhanden" : gesehen.has(k) ? "doppelt" : "neu";
    gesehen.add(k);
    return { ...z, status };
  });
  return { zeilen: aus, neu: aus.filter((z) => z.status === "neu").map((z) => ({ zeile: z.zeile, typ: z.typ, rufname: z.rufname, notiz: z.notiz })) };
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/bibliothek src/app/m/kommplan/grenze.test.ts`
Expected: PASS. (Der Fall „Rufname zu lang" setzt `LAENGE.rufname = 80` voraus — Stand `_lib/plan/schema.ts`.)

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
git add src/app/m/kommplan/_lib/bibliothek
git commit -S -m "feat(kommplan): Einheiten aus CSV oder eingefügter Liste lesen, mit Vorschau

CSV Typ;Rufname[;Notiz] mit Kopfzeile, Anführungszeichen und
Windows-1252 aus Excel; dieselbe Vorschau für „Liste einfügen“ mit
Status neu, schon vorhanden oder doppelt.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Server Actions der Bibliothek

**Files:**
- Create: `src/app/m/kommplan/_actions/bibliothek.ts`
- Test: `src/app/m/kommplan/_actions/bibliothek.test.ts`
- Modify: `src/core/audit/coverage-manifest.json`

**Interfaces:**
- Produces: `speichereBibStelleAction(eingabe: unknown): Promise<BibStelleErgebnis>`; `speichereBibEinheitAction(eingabe: unknown): Promise<BibEinheitErgebnis>`; `speichereBibVerbindungAction(eingabe: unknown): Promise<BibVerbindungErgebnis>`; `loescheBibEintragAction(eingabe: unknown): Promise<EinfachErgebnis>`; `importiereBibEinheitenAction(eingabe: unknown): Promise<ImportErgebnis>`; `importiereBibVerbindungenAction(eingabe: unknown): Promise<VerbindungsImportErgebnis>`.

- [ ] **Step 1: Failing Test schreiben**

`src/app/m/kommplan/_actions/bibliothek.test.ts` (Gerüst wie `_actions/briefkopf.test.ts`, `DIR = "./.data/kommplan-actions-bibliothek-test"`):

```ts
describe("Bibliotheks-Actions", () => {
  it("ohne Bearbeitungsrecht: Forbidden — jede einzelne", async () => {
    gruppen = ["iuk-kommplan"];
    const a = await import("./bibliothek");
    await expect(a.speichereBibStelleAction({})).rejects.toThrow("Forbidden");
    await expect(a.speichereBibEinheitAction({})).rejects.toThrow("Forbidden");
    await expect(a.speichereBibVerbindungAction({})).rejects.toThrow("Forbidden");
    await expect(a.loescheBibEintragAction({})).rejects.toThrow("Forbidden");
    await expect(a.importiereBibEinheitenAction([])).rejects.toThrow("Forbidden");
    await expect(a.importiereBibVerbindungenAction([])).rejects.toThrow("Forbidden");
  });
  it("anlegen, importieren, löschen — Audit nennt die Person", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const a = await import("./bibliothek");
    const s = await a.speichereBibStelleAction({ id: null, titel: "EAL Süd", zeichen: null, leiter: null, kontakte: [], notiz: null });
    if (!s.ok) throw new Error(s.fehler);
    expect(await a.importiereBibEinheitenAction([{ typ: "RTW", rufname: "RK 1", notiz: null }])).toMatchObject({ ok: true, angelegt: 1, uebersprungen: 0 });
    expect(await a.importiereBibVerbindungenAction([{ art: "tmo", bezeichnung: "R_UE_9" }])).toMatchObject({ ok: true, angelegt: 1 });
    expect(await a.loescheBibEintragAction({ art: "stelle", id: s.eintrag.id })).toEqual({ ok: true });
    const { getDb } = await import("../_db/client");
    const { sql } = await import("drizzle-orm");
    const akteure = getDb().all(sql`SELECT DISTINCT json_extract(actor, '$.id') AS id FROM audit_outbox WHERE object_type LIKE 'bib_%'`) as { id: string }[];
    expect(akteure).toEqual([{ id: "u1" }]);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_actions/bibliothek.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_actions/bibliothek.ts`:

```ts
"use server";

import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { importiereBibEinheiten, importiereBibVerbindungen, loescheBibEintrag, speichereBibEinheit, speichereBibStelle, speichereBibVerbindung } from "../_lib/bibliothekDb";
import type { BibEinheitErgebnis, BibStelleErgebnis, BibVerbindungErgebnis, EinfachErgebnis, ImportErgebnis, VerbindungsImportErgebnis } from "../_lib/ergebnis";
import { requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Bibliothek (Spec §4.3, §6.1): jede Action prüft selbst; Schema, Dubletten und IDs in `_lib/bibliothekDb.ts`.
// Kein revalidatePath: die Seite ruft `router.refresh()`, der Editor ergänzt seinen Kontext selbst.

export async function speichereBibStelleAction(eingabe: unknown): Promise<BibStelleErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => speichereBibStelle(getDb(), eingabe));
}

export async function speichereBibEinheitAction(eingabe: unknown): Promise<BibEinheitErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => speichereBibEinheit(getDb(), eingabe));
}

export async function speichereBibVerbindungAction(eingabe: unknown): Promise<BibVerbindungErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => speichereBibVerbindung(getDb(), eingabe));
}

export async function loescheBibEintragAction(eingabe: unknown): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => loescheBibEintrag(getDb(), eingabe));
}

export async function importiereBibEinheitenAction(eingabe: unknown): Promise<ImportErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => importiereBibEinheiten(getDb(), eingabe));
}

export async function importiereBibVerbindungenAction(eingabe: unknown): Promise<VerbindungsImportErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => importiereBibVerbindungen(getDb(), eingabe));
}
```

`coverage-manifest.json`: sechs Einträge `"src/app/m/kommplan/_actions/bibliothek.ts#<Name>": { "kind": "context", "via": "<Name>" }`.

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_actions src/core/audit/coverage.test.ts`
Expected: PASS (auch der Bauform-Test aus `_actions/plan.test.ts`).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
git add src/app/m/kommplan/_actions/bibliothek.ts src/app/m/kommplan/_actions/bibliothek.test.ts src/core/audit/coverage-manifest.json
git commit -S -m "feat(kommplan): Actions der Bibliothek

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Seite „Bibliothek" — drei Bereiche, Suche, Flyin, Import mit Vorschau

**Files:**
- Create: `src/app/m/kommplan/(intern)/(verwaltung)/bibliothek/page.tsx`
- Create: `src/app/m/kommplan/_ui/bibliothek/Bibliothek.tsx`, `BibFlyin.tsx`, `StellenBereich.tsx`, `EinheitenBereich.tsx`, `VerbindungenBereich.tsx`, `ImportVorschau.tsx` (alle `"use client"`)
- Modify: `src/app/m/kommplan/_ui/kommplan.css`
- Test: `src/app/m/kommplan/_ui/bibliothek/Bibliothek.test.tsx`

**Interfaces:**
- Consumes: `ladeBibliothek` (Task 14), Actions (Task 16), `einheitenAusListe`, `leseEinheitenCsv`, `dekodiereText`, `importVorschau`, `STATUS_TEXT` (Task 15), `passt`, `ZeichenWahl`, `KontaktZeilen` (Editor), `ladeZeichenAction`, `zeichenIndex`, `symboleFuerSchluessel`.
- Produces: DOM-Vertrag: Reiter „Stellen (n)", „Einheiten (n)", „Verbindungen (n)" (`role="tab"`); je Bereich `section[aria-label="Stellen der Bibliothek"]` usw. mit Suchfeld (`aria-label` „Stellen suchen" usw.), Knopf „Neue Stelle"/„Neue Einheit"/„Neue Verbindung", `Kartentabelle` (`aria-label` „Stellen"/„Einheiten"/„Verbindungen"); Flyin `.kp-flyin` (Portal am `body`) mit Formular (`aria-label` „Stelle der Bibliothek" usw.), Fokus beim Öffnen im ersten Feld, Knöpfe „Speichern", beim Anlegen zusätzlich „Speichern und nächste", „Abbrechen", beim Bearbeiten „Löschen" (Popconfirm „Löschen"); Spalten „Notiz" und „Kontakte" über `Zellentext`; im Einheiten-Bereich Knöpfe „Liste einfügen" und „CSV importieren" (Dateifeld `input[type=file][name=csv]`), Vorschau-Flyin mit `Kartentabelle` `aria-label="Vorschau"`, Fehlerliste `.kp-feldfehler`, Knopf „<n> übernehmen"; Meldungen je Bereich in `[role="status"]`.

- [ ] **Step 1: Failing Tests schreiben**

`src/app/m/kommplan/_ui/bibliothek/Bibliothek.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, fill, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import type { Bibliothek as BibliothekDaten } from "../../_lib/bibliothek/typen";

const aktion = vi.hoisted(() => ({ stelle: vi.fn(), einheit: vi.fn(), verbindung: vi.fn(), loesche: vi.fn(), importiere: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("../../_actions/bibliothek", () => ({
  speichereBibStelleAction: aktion.stelle, speichereBibEinheitAction: aktion.einheit, speichereBibVerbindungAction: aktion.verbindung,
  loescheBibEintragAction: aktion.loesche, importiereBibEinheitenAction: aktion.importiere,
}));
vi.mock("../../_actions/zeichen", () => ({ ladeZeichenAction: vi.fn(async () => ({})) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { Bibliothek } from "./Bibliothek";

const BIB: BibliothekDaten = {
  stellen: [{ id: "s1", titel: "Leitstelle Uelzen", zeichen: null, leiter: null, kontakte: [{ art: "telefon", wert: "0581 1" }], notiz: null },
    { id: "s2", titel: "EAL Nord", zeichen: null, leiter: "Jana", kontakte: [], notiz: null }],
  einheiten: [{ id: "e1", typ: "RTW", rufname: "RK UE 40-83-5", zeichen: null, notiz: null }],
  verbindungen: [{ id: "v1", art: "tmo", bezeichnung: "R_UE_1", notiz: null }],
};
const abwarten = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const knopf = (text: string) => [...document.querySelectorAll<HTMLElement>("button, [role='menuitem'], [role='tab']")].find((b) => b.textContent?.trim() === text)!;
const zeige = () => mount(<Bibliothek bibliothek={BIB} zeichenIndex={[]} symbole={{}} />);
/**
 * `fill`/`submitForm` des Harness suchen nur im Mount-Wirt — das Flyin (antd `Drawer`) hängt per Portal am
 * `body`. Dieselbe Mechanik wie `fill` (Prototyp-Setter, sonst bliebe onChange aus), nur über `queryPortal`.
 */
async function fillPortal(selektor: string, wert: string) {
  const feld = queryPortal<HTMLInputElement | HTMLTextAreaElement>(selektor);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter an ${feld.tagName}`);
  await act(async () => { setter.call(feld, wert); feld.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function submitPortal(selektor: string) {
  const form = queryPortal<HTMLFormElement>(selektor);
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
beforeEach(() => { Object.values(aktion).forEach((f) => f.mockReset()); router.refresh.mockReset(); });
afterEach(async () => { await unmount(); });

describe("Bibliothek", () => {
  it("drei Reiter mit Anzahl; Suche filtert und sagt „nichts passt“ statt „nichts angelegt“", async () => {
    await zeige();
    expect(queryAll('[role="tab"]').map((t) => t.textContent)).toEqual(["Stellen (2)", "Einheiten (1)", "Verbindungen (1)"]);
    await fill('input[aria-label="Stellen suchen"]', "nord");
    expect(queryAll('section[aria-label="Stellen der Bibliothek"] tr[data-row-key]').map((r) => r.getAttribute("data-row-key"))).toEqual(["s2"]);
    await fill('input[aria-label="Stellen suchen"]', "gibtsnicht");
    expect(query('section[aria-label="Stellen der Bibliothek"]').textContent).toContain("Keine Stelle passt zur Suche.");
  });
  it("Neue Stelle: Flyin, Speichern ruft die Action mit id null; Feldfehler stehen am Feld", async () => {
    aktion.stelle.mockResolvedValueOnce({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "„Leitstelle Uelzen“ steht schon in der Bibliothek." } })
      .mockResolvedValueOnce({ ok: true, eintrag: { id: "s3", titel: "EAL Süd", zeichen: null, leiter: null, kontakte: [], notiz: null } });
    await zeige();
    await clickElement(knopf("Neue Stelle"));
    await fillPortal('.kp-flyin form[aria-label="Stelle der Bibliothek"] input[name="titel"]', "Leitstelle Uelzen");
    await submitPortal('.kp-flyin form[aria-label="Stelle der Bibliothek"]');
    await abwarten();
    expect(aktion.stelle).toHaveBeenCalledWith(expect.objectContaining({ id: null, titel: "Leitstelle Uelzen" }));
    const titel = queryPortal<HTMLInputElement>('.kp-flyin input[name="titel"]');
    expect(titel.getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("„Leitstelle Uelzen“ steht schon in der Bibliothek.");
    await fillPortal('.kp-flyin input[name="titel"]', "EAL Süd");
    await submitPortal('.kp-flyin form[aria-label="Stelle der Bibliothek"]');
    await abwarten();
    expect(query('section[aria-label="Stellen der Bibliothek"] [role="status"]').textContent).toBe("„EAL Süd“ gespeichert.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("Neue Stelle: Fokus im Titel; „Speichern und nächste“ lässt das Flyin leer offen, Fokus wieder im Titel", async () => {
    aktion.stelle.mockResolvedValue({ ok: true, eintrag: { id: "s3", titel: "EAL Süd", zeichen: null, leiter: null, kontakte: [], notiz: null } });
    await zeige();
    await clickElement(knopf("Neue Stelle"));
    await abwarten();
    expect(document.activeElement).toBe(queryPortal('.kp-flyin input[name="titel"]'));
    await fillPortal('.kp-flyin input[name="titel"]', "EAL Süd");
    await clickElement(knopf("Speichern und nächste"));
    await abwarten();
    expect(query('section[aria-label="Stellen der Bibliothek"] [role="status"]').textContent).toBe("„EAL Süd“ gespeichert.");
    const leer = queryPortal<HTMLInputElement>('.kp-flyin input[name="titel"]');
    expect(leer.value).toBe("");
    expect(document.activeElement).toBe(leer);
  });
  it("eine lange Notiz steht in einer Zelle mit Lesebreite (Zellentext), nicht als nackter Text", async () => {
    await mount(<Bibliothek bibliothek={{ ...BIB, stellen: [{ ...BIB.stellen[0], notiz: "Wort ".repeat(100) }] }} zeichenIndex={[]} symbole={{}} />);
    const zelle = query('section[aria-label="Stellen der Bibliothek"] tr[data-row-key="s1"]');
    expect(zelle.querySelector("[data-zellentext]")?.textContent).toBe("Wort ".repeat(100)); // der Testgriff von core/tabelle/Zellentext
  });
  it("Bearbeiten und Löschen mit Nachfrage", async () => {
    aktion.loesche.mockResolvedValue({ ok: true });
    await zeige();
    await clickElement(knopf("EAL Nord"));
    expect(queryPortal<HTMLInputElement>('.kp-flyin input[name="leiter"]').value).toBe("Jana");
    await clickElement(knopf("Löschen"));
    await clickElement([...document.querySelectorAll<HTMLElement>(".ant-popconfirm button, .ant-popover button")].find((b) => b.textContent?.trim() === "Löschen")!);
    await abwarten();
    expect(aktion.loesche).toHaveBeenCalledWith({ art: "stelle", id: "s2" });
  });
  it("CSV aus Excel (Windows-1252): Vorschau mit Umlauten und Status, übernommen wird nur Neues", async () => {
    aktion.importiere.mockResolvedValue({ ok: true, angelegt: 1, uebersprungen: 0 });
    await zeige();
    await clickElement(knopf("Einheiten (1)"));
    const bytes = new Uint8Array([..."Typ;Rufname\nRTW;rk ue 40-83-5\nKTW;RK Großenkneten 1\n"].map((c) => c.charCodeAt(0)));
    const feld = query<HTMLInputElement>('input[type="file"][name="csv"]');
    await act(async () => {
      Object.defineProperty(feld, "files", { value: [new File([bytes], "einheiten.csv")], configurable: true });
      feld.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await abwarten();
    const vorschau = queryPortal('[aria-label="Vorschau"]').closest(".kp-flyin")!;
    expect(vorschau.textContent).toContain("RK Großenkneten 1");
    expect(vorschau.textContent).toContain("schon in der Bibliothek");
    await clickElement(knopf("1 übernehmen"));
    await abwarten();
    expect(aktion.importiere).toHaveBeenCalledWith([{ typ: "KTW", rufname: "RK Großenkneten 1", notiz: null }]);
    expect(query('section[aria-label="Einheiten der Bibliothek"] [role="status"]').textContent).toBe("1 angelegt, 0 übersprungen.");
  });
  it("Liste einfügen mit Fehler: keine Übernahme möglich, Fehler mit Zeile", async () => {
    await zeige();
    await clickElement(knopf("Einheiten (1)"));
    await clickElement(knopf("Liste einfügen"));
    await fillPortal('.kp-flyin textarea[aria-label="Einheiten, je Zeile eine"]', "KTW RK 2\nNEF");
    await clickElement(knopf("Vorschau"));
    expect(document.body.textContent).toContain("Zeile 2: Der Rufname fehlt.");
    expect(knopf("1 übernehmen").hasAttribute("disabled")).toBe(true);
  });
});
```

(Antds Popconfirm-Knöpfe liegen in einem Portal am `body`; der Greifer auf `.ant-popconfirm`/`.ant-popover` ist nur Test-Greifer, keine Stilregel — Falle 20 betrifft CSS. Findet er in antd 6.6.4 nichts, über `knopf` den **zweiten** „Löschen"-Knopf im Dokument nehmen. `knopf` sucht schon im ganzen Dokument, findet also auch Flyin-Knöpfe. `[data-zellentext]` ist der dokumentierte Testgriff von `core/tabelle/Zellentext.tsx`; liegt die Telefonform der Kartentabelle in jsdom vorn, den Greifer auf deren Zeile umstellen, die Aussage bleibt.)

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/bibliothek`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_ui/bibliothek/BibFlyin.tsx`:

```tsx
"use client";

import type { FormEvent, ReactNode } from "react";
import { Alert, Button, Drawer, Popconfirm } from "antd";
import { flyinBreite } from "@/core/theme/flyin";

/**
 * FLYIN EINES BIBLIOTHEKSEINTRAGS (Entscheidung 11): ausdrücklich speichern — Stammdaten, kein Rückgängig.
 * `flyinBreite` (Falle 13); Löschen mit Nachfrage, weil es nichts zurückholt (Pläne behalten ihre Kopien).
 */
export function BibFlyin({ offen, titel, formName, fehler, laeuft, onSchliessen, onSpeichern, onWeiter, onLoeschen, children }: {
  offen: boolean; titel: string; formName: string; fehler: string | null; laeuft: boolean;
  onSchliessen: () => void; onSpeichern: () => void; onWeiter?: () => void; onLoeschen?: () => void; children: ReactNode;
}) {
  const absenden = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (!laeuft) onSpeichern(); };
  // autoFocus={false}: rc-drawer fokussierte sonst NACH dem Fokus-Effekt des Formulars seinen Container (wie StelleFlyin des Editors).
  return (
    <Drawer open={offen} onClose={onSchliessen} title={titel} size={flyinBreite(520)} destroyOnHidden rootClassName="kp-flyin" autoFocus={false}>
      {offen ? (
        <form aria-label={formName} onSubmit={absenden} className="kp-formular">
          {fehler ? <Alert type="warning" showIcon title={fehler} /> : null}
          {children}
          <div className="kp-formular-knoepfe">
            <Button type="primary" htmlType="submit" loading={laeuft}>Speichern</Button>
            {onWeiter ? <Button onClick={() => { if (!laeuft) onWeiter(); }}>Speichern und nächste</Button> : null}
            <Button onClick={onSchliessen}>Abbrechen</Button>
            {onLoeschen ? (
              <Popconfirm title="Aus der Bibliothek löschen?" description="Pläne behalten ihre Kopien." okText="Löschen" cancelText="Abbrechen" onConfirm={onLoeschen}>
                <Button danger disabled={laeuft}>Löschen</Button>
              </Popconfirm>
            ) : null}
          </div>
        </form>
      ) : null}
    </Drawer>
  );
}

/** Feldfehler am Feld (docs/design/feedback-admin.md 4.4): Text plus `aria-invalid`/`aria-describedby`, nie rot. */
export function feldHilfe(basis: string, feldFehler: Record<string, string>, name: string) {
  const id = `${basis}-${name}-fehler`;
  return {
    attr: { "aria-invalid": feldFehler[name] ? true : undefined, "aria-describedby": feldFehler[name] ? id : undefined } as const,
    text: feldFehler[name] ? <p id={id} className="kp-feldfehler">{feldFehler[name]}</p> : null,
  };
}
```

`src/app/m/kommplan/_ui/bibliothek/StellenBereich.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, type InputRef, type TableProps } from "antd";
import { Kartentabelle, nachText, Zellentext } from "@/core/tabelle";
import { loescheBibEintragAction, speichereBibStelleAction } from "../../_actions/bibliothek";
import { passt, type BibStelle } from "../../_lib/bibliothek/typen";
import { KONTAKT_NAME } from "../../_lib/plan/kontakte";
import { LAENGE, type Kontakt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { KontaktZeilen } from "../editor/KontaktZeilen";
import { ZeichenWahl } from "../editor/ZeichenWahl";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { BibFlyin, feldHilfe } from "./BibFlyin";

const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";

export function StellenBereich({ stellen, zeichenIndex, symbole, ladeSymbole }: {
  stellen: BibStelle[]; zeichenIndex: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole: (k: string[]) => void;
}) {
  const router = useRouter();
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState<BibStelle | "neu" | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  /** Zählt „Speichern und nächste": jede Runde montiert ein leeres Formular neu (Fokus wieder im Titel). */
  const [runde, setRunde] = useState(0);
  const titelVon = new Map(zeichenIndex.map((e) => [e.schluessel, e.titel]));
  const sichtbar = stellen.filter((s) => passt(suche, [s.titel, s.leiter, s.notiz, ...s.kontakte.map((k) => k.wert)]));
  const spalten: NonNullable<TableProps<BibStelle>["columns"]> = [
    { key: "titel", title: "Titel", dataIndex: "titel", sorter: nachText<BibStelle>((s) => s.titel),
      render: (_: unknown, s: BibStelle) => <Button type="link" className="kp-zeilenlink" onClick={() => setOffen(s)}>{s.titel}</Button> },
    { key: "zeichen", title: "Zeichen", render: (_: unknown, s: BibStelle) => (s.zeichen ? titelVon.get(s.zeichen) ?? s.zeichen : "—") },
    { key: "leiter", title: "Leiter", render: (_: unknown, s: BibStelle) => s.leiter ?? "—" },
    // Freitext über Zellentext (docs/design/README.md „Mobil"): EIN langer Eintrag schöbe sonst alle Spalten dahinter aus dem Bild.
    { key: "kontakte", title: "Kontakte", render: (_: unknown, s: BibStelle) => <Zellentext text={s.kontakte.length === 0 ? "—" : s.kontakte.map((k) => `${KONTAKT_NAME[k.art]} ${k.wert}`).join(" · ")} /> },
    { key: "notiz", title: "Notiz", render: (_: unknown, s: BibStelle) => <Zellentext text={s.notiz ?? "—"} /> },
  ];
  return (
    <section aria-label="Stellen der Bibliothek" className="kp-bib-bereich">
      <div className="kp-bib-werkzeuge">
        <Input aria-label="Stellen suchen" placeholder="Suchen" allowClear value={suche} onChange={(e) => setSuche(e.target.value)} />
        <Button type="primary" onClick={() => setOffen("neu")}>Neue Stelle</Button>
      </div>
      {meldung ? <p className="kp-hinweis" role="status">{meldung}</p> : null}
      <Kartentabelle<BibStelle> aria-label="Stellen" rowKey="id" dataSource={sichtbar} columns={spalten}
        leer={{ nichts: "Noch keine Stellen in der Bibliothek.", gefiltert: "Keine Stelle passt zur Suche.", aktiv: suche.trim() !== "" }}
        karte={{ titel: "titel" }} />
      <StelleFlyin key={offen === null ? "zu" : offen === "neu" ? `neu:${runde}` : offen.id} eintrag={offen} zeichenIndex={zeichenIndex} symbole={symbole} ladeSymbole={ladeSymbole}
        onSchliessen={() => setOffen(null)} onFertig={(text) => { setOffen(null); setMeldung(text); router.refresh(); }}
        onWeiter={(text) => { setMeldung(text); setRunde((n) => n + 1); router.refresh(); }} />
    </section>
  );
}

function StelleFlyin({ eintrag, zeichenIndex, symbole, ladeSymbole, onSchliessen, onFertig, onWeiter }: {
  eintrag: BibStelle | "neu" | null; zeichenIndex: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole: (k: string[]) => void;
  onSchliessen: () => void; onFertig: (meldung: string) => void; onWeiter: (meldung: string) => void;
}) {
  const basis = useId();
  const titelFeld = useRef<InputRef>(null);
  // Fokus beim Öffnen ins erste Feld (wie „Neuer Plan"); nach „Speichern und nächste" montiert das Formular neu (key) — derselbe Effekt.
  useEffect(() => { if (eintrag !== null) titelFeld.current?.focus(); }, [eintrag]);
  const alt = eintrag !== null && eintrag !== "neu" ? eintrag : null;
  const [titel, setTitel] = useState(alt?.titel ?? "");
  const [zeichen, setZeichen] = useState<string | null>(alt?.zeichen ?? null);
  const [leiter, setLeiter] = useState(alt?.leiter ?? "");
  const [kontakte, setKontakte] = useState<Kontakt[]>(alt?.kontakte ?? []);
  const [notiz, setNotiz] = useState(alt?.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);
  const f = (name: string) => feldHilfe(basis, feldFehler, name);
  async function speichern(weiter: boolean) {
    setLaeuft(true);
    const r = await speichereBibStelleAction({ id: alt?.id ?? null, titel, zeichen, leiter, kontakte, notiz })
      .catch(() => ({ ok: false as const, fehler: NETZ }));
    setLaeuft(false);
    if (r.ok) { (weiter ? onWeiter : onFertig)(`„${r.eintrag.titel}“ gespeichert.`); return; }
    setFehler(r.fehler); setFeldFehler("feldFehler" in r && r.feldFehler ? r.feldFehler : {});
  }
  async function loeschen() {
    if (!alt) return;
    setLaeuft(true);
    const r = await loescheBibEintragAction({ art: "stelle", id: alt.id }).catch(() => ({ ok: false as const, fehler: NETZ }));
    setLaeuft(false);
    if (r.ok) onFertig(`„${alt.titel}“ gelöscht.`); else setFehler(r.fehler);
  }
  return (
    <BibFlyin offen={eintrag !== null} titel={alt ? "Stelle bearbeiten" : "Neue Stelle"} formName="Stelle der Bibliothek" fehler={fehler} laeuft={laeuft}
      onSchliessen={onSchliessen} onSpeichern={() => void speichern(false)} onWeiter={alt ? undefined : () => void speichern(true)}
      onLoeschen={alt ? () => void loeschen() : undefined}>
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input ref={titelFeld} id={`${basis}-titel`} name="titel" value={titel} maxLength={LAENGE.titel} onChange={(e) => setTitel(e.target.value)} {...f("titel").attr} />
      {f("titel").text}
      <fieldset className="kp-abschnitt"><legend>Zeichen</legend>
        <ZeichenWahl wert={zeichen} index={zeichenIndex} symbole={symbole} ladeSymbole={ladeSymbole} planZeichen={[]} onWahl={setZeichen} />
      </fieldset>
      <label className="kp-feldname" htmlFor={`${basis}-leiter`}>Leiter</label>
      <Input id={`${basis}-leiter`} name="leiter" value={leiter} maxLength={LAENGE.leiter} onChange={(e) => setLeiter(e.target.value)} {...f("leiter").attr} />
      {f("leiter").text}
      <KontaktZeilen kontakte={kontakte} onAendere={(neu) => setKontakte(neu)} />
      <label className="kp-feldname" htmlFor={`${basis}-notiz`}>Notiz</label>
      <Input.TextArea id={`${basis}-notiz`} name="notiz" value={notiz} maxLength={500} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(e) => setNotiz(e.target.value)} {...f("notiz").attr} />
      {f("notiz").text}
    </BibFlyin>
  );
}
```

`src/app/m/kommplan/_ui/bibliothek/VerbindungenBereich.tsx` — dieselbe Bauform wie `StellenBereich` (Werkzeugleiste, Meldung, `Kartentabelle`, Flyin über `BibFlyin`), mit:

```tsx
  // Spalten
  { key: "bezeichnung", title: "Bezeichnung", dataIndex: "bezeichnung", sorter: nachText<BibVerbindung>((v) => v.bezeichnung),
    render: (_: unknown, v: BibVerbindung) => <Button type="link" className="kp-zeilenlink" onClick={() => setOffen(v)}>{v.bezeichnung}</Button> },
  { key: "art", title: "Art", render: (_: unknown, v: BibVerbindung) => ART_NAME[v.art] },
  { key: "notiz", title: "Notiz", render: (_: unknown, v: BibVerbindung) => <Zellentext text={v.notiz ?? "—"} /> },
  // Suche über [v.bezeichnung, ART_NAME[v.art], v.notiz]; Texte: section „Verbindungen der Bibliothek", Suchfeld „Verbindungen suchen",
  // Knopf „Neue Verbindung", Tabelle „Verbindungen", leer „Noch keine Verbindungen in der Bibliothek." / „Keine Verbindung passt zur Suche."
  // Flyin: formName „Verbindung der Bibliothek", Felder name="bezeichnung" (maxLength LAENGE.bezeichnung),
  // Select „Art" (VERBINDUNGS_ARTEN mit ART_NAME, Vorgabe "tmo"), TextArea name="notiz";
  // Speichern: speichereBibVerbindungAction({ id: alt?.id ?? null, art, bezeichnung, notiz }); Löschen: { art: "verbindung", id }.
```

Die Datei vollständig nach dem Muster von `StellenBereich.tsx` ausschreiben (kein gemeinsamer generischer Baustein über `BibFlyin` hinaus — drei Formulare mit verschiedenen Feldern sind klarer als ein Konfigurationsobjekt) — **samt** Fokus aufs erste Feld beim Öffnen, `runde` und „Speichern und nächste" beim Anlegen.

`src/app/m/kommplan/_ui/bibliothek/ImportVorschau.tsx`:

```tsx
"use client";

import { Button, Drawer, type TableProps } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { Kartentabelle, Zellentext } from "@/core/tabelle";
import type { ImportLesung, ImportZeile } from "../../_lib/bibliothek/csv";
import type { BibEinheit } from "../../_lib/bibliothek/typen";
import { importVorschau, STATUS_TEXT, type VorschauZeile } from "../../_lib/bibliothek/vorschau";

const SPALTEN: NonNullable<TableProps<VorschauZeile>["columns"]> = [
  { key: "zeile", title: "Zeile", dataIndex: "zeile" },
  { key: "typ", title: "Typ", dataIndex: "typ" },
  { key: "rufname", title: "Rufname", dataIndex: "rufname" },
  { key: "notiz", title: "Notiz", render: (_: unknown, z: VorschauZeile) => <Zellentext text={z.notiz ?? "—"} /> },
  { key: "status", title: "Status", render: (_: unknown, z: VorschauZeile) => <span className={`kp-chip${z.status === "neu" ? "" : " kp-chip-hinweis"}`}>{STATUS_TEXT[z.status]}</span> },
];

/**
 * VORSCHAU VOR DER ÜBERNAHME (Entscheidung 12): je Zeile der Status; mit Fehlern ist „übernehmen" gesperrt —
 * nichts wird still gekürzt. Übernommen werden nur die neuen Zeilen.
 */
export function ImportVorschau({ lesung, vorhanden, laeuft, onUebernehmen, onSchliessen }: {
  lesung: ImportLesung | null; vorhanden: readonly BibEinheit[]; laeuft: boolean;
  onUebernehmen: (neu: ImportZeile[]) => void; onSchliessen: () => void;
}) {
  const v = lesung ? importVorschau(lesung.zeilen, vorhanden) : null;
  const gesperrt = !lesung || lesung.fehler.length > 0 || v!.neu.length === 0 || laeuft;
  return (
    <Drawer open={lesung !== null} onClose={onSchliessen} title="Einheiten importieren" size={flyinBreite(640)} destroyOnHidden rootClassName="kp-flyin">
      {lesung && v ? (
        <div className="kp-formular">
          {lesung.fehler.length > 0 ? (
            <ul className="kp-feldfehler" role="status">{lesung.fehler.map((f) => <li key={f}>{f}</li>)}</ul>
          ) : <p className="kp-hilfe">{`${v.neu.length} neu, ${v.zeilen.length - v.neu.length} übersprungen.`}</p>}
          <Kartentabelle<VorschauZeile> aria-label="Vorschau" rowKey="zeile" dataSource={v.zeilen} columns={SPALTEN} leer={{ nichts: "Die Liste enthält keine Einheit." }} karte={{ titel: "rufname", kennzeichen: ["status"] }} />
          <div className="kp-formular-knoepfe">
            <Button type="primary" disabled={gesperrt} loading={laeuft} onClick={() => onUebernehmen(v.neu)}>{`${v.neu.length} übernehmen`}</Button>
            <Button onClick={onSchliessen}>Abbrechen</Button>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
```

`src/app/m/kommplan/_ui/bibliothek/EinheitenBereich.tsx` — Bauform wie `StellenBereich` samt Fokus, `runde` und „Speichern und nächste" (Spalten Typ — als Link zum Flyin —, Rufname, Zeichen, Notiz über `Zellentext`; Suche über Typ, Rufname, Notiz; Texte „Einheiten der Bibliothek", „Einheiten suchen", „Neue Einheit", Tabelle „Einheiten", leer „Noch keine Einheiten in der Bibliothek." / „Keine Einheit passt zur Suche."; Flyin „Einheit der Bibliothek" mit `name="typ"`, `name="rufname"`, `ZeichenWahl`, `name="notiz"`; `speichereBibEinheitAction`, Löschen `{ art: "einheit", id }`), zusätzlich in der Werkzeugleiste:

```tsx
  const [lesung, setLesung] = useState<ImportLesung | null>(null);
  const [liste, setListe] = useState<string | null>(null);
  const [importLaeuft, setImportLaeuft] = useState(false);
  const csv = useRef<HTMLInputElement>(null);
  async function liesCsv(datei: File) {
    const text = dekodiereText(new Uint8Array(await datei.arrayBuffer()));
    if (csv.current) csv.current.value = "";
    setLesung(leseEinheitenCsv(text));
  }
  async function uebernimm(neu: ImportZeile[]) {
    setImportLaeuft(true);
    const r = await importiereBibEinheitenAction(neu.map((z) => ({ typ: z.typ, rufname: z.rufname, notiz: z.notiz })))
      .catch(() => ({ ok: false as const, fehler: NETZ }));
    setImportLaeuft(false);
    setLesung(null);
    setMeldung(r.ok ? `${r.angelegt} angelegt, ${r.uebersprungen} übersprungen.` : r.fehler);
    if (r.ok) router.refresh();
  }
  // in der Werkzeugleiste, nach „Neue Einheit":
  <Button onClick={() => setListe("")}>Liste einfügen</Button>
  <Button onClick={() => csv.current?.click()}>CSV importieren</Button>
  <input ref={csv} className="kp-dateifeld" type="file" name="csv" accept=".csv,text/csv,text/plain" tabIndex={-1} aria-hidden="true"
    onChange={(e) => { const d = e.target.files?.[0]; if (d) void liesCsv(d); }} />
  <p className="kp-hilfe">CSV mit Semikolon: Typ;Rufname;Notiz — die Notiz darf fehlen, eine Kopfzeile auch.</p>
  // Flyin „Liste einfügen":
  <Drawer open={liste !== null} onClose={() => setListe(null)} title="Liste einfügen" size={flyinBreite(520)} destroyOnHidden rootClassName="kp-flyin">
    {liste !== null ? (
      <div className="kp-formular">
        <Input.TextArea autoFocus aria-label="Einheiten, je Zeile eine" value={liste} onChange={(e) => setListe(e.target.value)} autoSize={{ minRows: 6, maxRows: 16 }}
          placeholder={"RTW RK UE 40-83-5\nKTW RK UE 40-92-1"} />
        <div className="kp-formular-knoepfe">
          <Button type="primary" disabled={liste.trim() === ""} onClick={() => { setLesung(einheitenAusListe(liste)); setListe(null); }}>Vorschau</Button>
          <Button onClick={() => setListe(null)}>Abbrechen</Button>
        </div>
      </div>
    ) : null}
  </Drawer>
  <ImportVorschau lesung={lesung} vorhanden={einheiten} laeuft={importLaeuft} onUebernehmen={(n) => void uebernimm(n)} onSchliessen={() => setLesung(null)} />
```

**Achtung Test:** Der „Liste einfügen"-Test erwartet nach „Vorschau" die Vorschau mit Fehler und gesperrtem Knopf „1 übernehmen" — `setListe(null)` schließt das Eingabe-Flyin, die Vorschau öffnet. Die Datei vollständig ausschreiben.

`src/app/m/kommplan/_ui/bibliothek/Bibliothek.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Tabs } from "antd";
import { ladeZeichenAction } from "../../_actions/zeichen";
import type { Bibliothek as BibliothekDaten } from "../../_lib/bibliothek/typen";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { SymbolDefs, type Symbolsatz } from "../zeichnung/Symbole";
import { EinheitenBereich } from "./EinheitenBereich";
import { StellenBereich } from "./StellenBereich";
import { VerbindungenBereich } from "./VerbindungenBereich";

/**
 * DIE BIBLIOTHEK (Spec §4.3, §6.1; Umsetzungsplan Phase 4, Entscheidung 11): drei Reiter, die Zahl im Reiter.
 * Zeichen-SVGs kommen wie im Editor über `ladeZeichenAction` nach und stehen EINMAL im Symbolvorrat (M11).
 * Nach jedem Speichern `router.refresh()` in den Bereichen — die Seite ist eine Server Component.
 */
export function Bibliothek({ bibliothek, zeichenIndex, symbole: start }: { bibliothek: BibliothekDaten; zeichenIndex: ZeichenIndexEintrag[]; symbole: Symbolsatz }) {
  const [symbole, setSymbole] = useState<Symbolsatz>(start);
  const unterwegs = useRef(new Set<string>());
  function ladeSymbole(schluessel: string[]) {
    const fehlen = [...new Set(schluessel)].filter((k) => !symbole[k] && !unterwegs.current.has(k)).slice(0, 40);
    if (fehlen.length === 0) return;
    for (const k of fehlen) unterwegs.current.add(k);
    void ladeZeichenAction(fehlen).then((neu) => setSymbole((alt) => ({ ...alt, ...neu }))).catch(() => {})
      .finally(() => { for (const k of fehlen) unterwegs.current.delete(k); });
  }
  const gemeinsam = { zeichenIndex, symbole, ladeSymbole };
  return (
    <div className="kp-bibliothek">
      <svg className="kp-symbolvorrat" aria-hidden="true" focusable="false" width={0} height={0} style={{ position: "absolute" }}><SymbolDefs symbole={symbole} /></svg>
      <Tabs items={[
        { key: "stellen", label: `Stellen (${bibliothek.stellen.length})`, children: <StellenBereich stellen={bibliothek.stellen} {...gemeinsam} /> },
        { key: "einheiten", label: `Einheiten (${bibliothek.einheiten.length})`, children: <EinheitenBereich einheiten={bibliothek.einheiten} {...gemeinsam} /> },
        { key: "verbindungen", label: `Verbindungen (${bibliothek.verbindungen.length})`, children: <VerbindungenBereich verbindungen={bibliothek.verbindungen} /> },
      ]} />
    </div>
  );
}
```

`src/app/m/kommplan/(intern)/(verwaltung)/bibliothek/page.tsx`:

```tsx
import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { ladeBibliothek } from "@/app/m/kommplan/_lib/bibliothekDb";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { symboleFuerSchluessel, zeichenIndex } from "@/app/m/kommplan/_lib/zeichen/zeichen";
import { pruefeKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Bibliothek } from "@/app/m/kommplan/_ui/bibliothek/Bibliothek";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";

export const dynamic = "force-dynamic";

/** Bibliothek (Spec §4.3, §6.1): nur für Bearbeitende; Riegel auch im Layout der Gruppe (Falle 23). */
export default async function BibliothekSeite() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  pruefeKommplanBearbeiten(viewer);
  const bib = ladeBibliothek(getDb());
  const zeichen = [...new Set([...bib.stellen, ...bib.einheiten].map((e) => e.zeichen).filter((z): z is string => z !== null))];
  return (
    <Huelle>
      <Seitenkopf titel="Bibliothek" zurueck={{ titel: "Alle Pläne", href: "/" }}
        beschreibung="Stellen, Einheiten und Verbindungen, die du im Editor in Pläne kopierst. Pläne behalten ihre Kopien, wenn du hier etwas änderst oder löschst." />
      <Bibliothek bibliothek={bib} zeichenIndex={zeichenIndex()} symbole={symboleFuerSchluessel(zeichen)} />
    </Huelle>
  );
}
```

(`symboleFuerSchluessel` in `_lib/zeichen/zeichen.ts` prüfen: liefert es `Record<string, Symbolquelle>` für bekannte Schlüssel und ignoriert unbekannte? Sonst die Liste vorher über `findeZeichen` filtern.)

`_ui/kommplan.css`:

```css
/* Bibliothek (Phase 4, Entscheidung 11). */
.kp-bib-werkzeuge { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-block-end: 8px; }
.kp-bib-werkzeuge > .kp-hilfe { flex: 1 1 100%; margin: 0; }
.kp-bib-bereich { display: grid; gap: 8px; }
/* Ein Titel als Link-Knopf in der Zelle: Text bricht um statt die Spalte zu sprengen. */
.kp-bib-bereich .kp-zeilenlink { padding-inline: 0; height: auto; white-space: normal; text-align: start; }
```

und in `@media (max-width: 767.98px)`: `.kp-bib-werkzeuge { display: grid; grid-template-columns: minmax(0, 1fr); }`. (`.kp-bib-bereich .kp-zeilenlink` hat eine Klasse mehr als `.ant-btn` — Falle 5, Kommentar steht dabei.)

- [ ] **Step 4: Grün sehen, Build**

```bash
pnpm vitest run src/app/m/kommplan/
uptime; pnpm build; echo "build exit $?"
```

Expected: PASS; Build Exit 0, Route `ƒ /m/kommplan/bibliothek`.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm anker:drift src/app/m/kommplan/_ui/kommplan.css
git add "src/app/m/kommplan/(intern)/(verwaltung)/bibliothek" src/app/m/kommplan/_ui/bibliothek src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Seite Bibliothek mit Stellen, Einheiten und Verbindungen

Suchen, anlegen, bearbeiten und löschen im Flyin; Einheiten zusätzlich
per Liste einfügen oder CSV-Import mit Vorschau, Dubletten werden
erkannt und übersprungen.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Kopien aus der Bibliothek als reine Planoperationen

**Files:**
- Create: `src/app/m/kommplan/_lib/plan/bibliothek.ts`
- Test: `src/app/m/kommplan/_lib/plan/bibliothek.test.ts`

**Interfaces:**
- Consumes: `aendereStelle`, `stelleOder`, `PlanFehler` (`operationen.ts`), `fuegeEinheitenEin` (`einheiten.ts`), `findeVerbindung`, `legeVerbindungAn` (`verbindungen.ts`), `BibStelle`, `BibEinheit`, `BibVerbindung`, `vergleichsform` (Task 14).
- Produces: `BIB_OPTION = "~bib:"` (Wertpräfix der Bibliotheksoptionen in Verbindungsauswahlen); `uebernimmBibStelle(inhalt, stelleId, b: BibStelle): PlanInhalt`; `fuegeBibEinheitenEin(inhalt, stelleId, eintraege: readonly BibEinheit[], ids: readonly string[]): PlanInhalt`; `verbindeMitBibVerbindung(inhalt, stelleId, b: BibVerbindung, neueId: string): PlanInhalt`; `bibVerbindungenFuerPlan(inhalt, bib: readonly BibVerbindung[]): BibVerbindung[]`; `stelleVorschlaege(bib: readonly BibStelle[], stelle: Pick<Stelle, "titel" | "zeichen" | "leiter" | "kontakte">, max?: number): BibStelle[]`; `bibStelleAus(s: Stelle): { id: null; titel; zeichen; leiter; kontakte; notiz: null }`; `bibStellenTreffer(inhalt, ids: readonly string[], bib: readonly BibStelle[]): { stelleId: string; b: BibStelle }[]` (exakter Titel in Vergleichsform, nur Stellen, die die Angaben noch nicht tragen — für den Abgleich nach dem Einfügen einer Gliederung); `einsatzOrte(inhalt): Map<string, { stelleId: string; titel: string }>` (Vergleichsform des Rufnamens → Stelle, an der das Fahrzeug steht). `zeichenImPlan` entfällt (Kritik: das Nachladen gehört in die Kopierwege, nicht hinter jedes `aendere`).

- [ ] **Step 1: Failing Test schreiben**

`src/app/m/kommplan/_lib/plan/bibliothek.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import type { BibStelle } from "../bibliothek/typen";
import { bibStellenTreffer, bibStelleAus, bibVerbindungenFuerPlan, einsatzOrte, fuegeBibEinheitenEin, stelleVorschlaege, uebernimmBibStelle, verbindeMitBibVerbindung } from "./bibliothek";
import { PlanFehler } from "./operationen";

const PLAN = baue({
  verbindungen: [{ id: "v1", art: "tmo", bezeichnung: "R_UE_1" }],
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "EA 1", eltern: "el", verbindung: "v1", einheiten: ["RTW RK 1"] },
    { id: "a1", titel: "Trupp", eltern: "a" },
  ],
});
const LTS: BibStelle = { id: "b1", titel: "Leitstelle Uelzen", zeichen: "zusatz:eal", leiter: "Disponent", kontakte: [{ art: "telefon", wert: "0581 1" }], notiz: "intern" };

describe("Kopien aus der Bibliothek (Spec §4.3, §6.4; Entscheidung 13)", () => {
  it("„Aus Bibliothek“ ersetzt Titel, Zeichen, Leiter, Kontakte — Einheiten, Unterstellen, Verbindung bleiben; eine Kopie", () => {
    const neu = uebernimmBibStelle(PLAN, "a", LTS);
    const a = neu.stellen.find((s) => s.id === "a")!;
    expect(a).toMatchObject({ titel: "Leitstelle Uelzen", zeichen: "zusatz:eal", leiter: "Disponent", kontakte: [{ art: "telefon", wert: "0581 1" }], verbindungId: "v1", eltern: "el" });
    expect(a.einheiten).toHaveLength(1);
    expect(neu.stellen.find((s) => s.id === "a1")!.eltern).toBe("a");
    LTS.kontakte[0].wert = "geändert";
    expect(a.kontakte[0].wert).toBe("0581 1"); // Kopie, kein Verweis
    LTS.kontakte[0].wert = "0581 1";
    expect(JSON.stringify(neu)).not.toContain("intern"); // die Notiz bleibt in der Bibliothek
  });
  it("Einheiten: mit neuen IDs angehängt; über 60 je Stelle ganz abgewiesen", () => {
    const e = [{ id: "x", typ: "KTW", rufname: "RK 2", zeichen: null, notiz: "n" }, { id: "y", typ: "NEF", rufname: "RK 3", zeichen: null, notiz: null }];
    const neu = fuegeBibEinheitenEin(PLAN, "a", e, ["e-1", "e-2"]);
    expect(neu.stellen.find((s) => s.id === "a")!.einheiten.map((x) => [x.id, x.typ, x.rufname])).toEqual([[expect.any(String), "RTW", "RK 1"], ["e-1", "KTW", "RK 2"], ["e-2", "NEF", "RK 3"]]);
    const voll = Array.from({ length: 60 }, (_, i) => ({ id: `z${i}`, typ: "KTW", rufname: `K ${i}`, zeichen: null, notiz: null }));
    expect(() => fuegeBibEinheitenEin(PLAN, "a", voll, voll.map((_, i) => `n${i}`))).toThrow(PlanFehler);
  });
  it("Verbindung: gleichnamig UND gleiche Art im Plan → die vorhandene; andere Art → Kopie; oberste Ebene → Fehler", () => {
    expect(verbindeMitBibVerbindung(PLAN, "a1", { id: "bv", art: "tmo", bezeichnung: "r_ue_1", notiz: null }, "v-neu")).toMatchObject({ verbindungen: [{ id: "v1" }] });
    const kopie = verbindeMitBibVerbindung(PLAN, "a1", { id: "bv", art: "dmo", bezeichnung: "R_UE_1", notiz: null }, "v-neu");
    expect(kopie.verbindungen.map((v) => [v.id, v.art])).toEqual([["v1", "tmo"], ["v-neu", "dmo"]]);
    expect(kopie.stellen.find((s) => s.id === "a1")!.verbindungId).toBe("v-neu");
    expect(() => verbindeMitBibVerbindung(PLAN, "el", { id: "bv", art: "dmo", bezeichnung: "X", notiz: null }, "v-neu")).toThrow(PlanFehler);
    expect(bibVerbindungenFuerPlan(PLAN, [{ id: "1", art: "tmo", bezeichnung: "R_UE_1", notiz: null }, { id: "2", art: "dmo", bezeichnung: "R_UE_1", notiz: null }]).map((b) => b.id)).toEqual(["2"]);
  });
  it("Titelvorschläge: ab 2 Zeichen, erst „beginnt mit“, dann „enthält“, höchstens 3; nicht, wenn die Stelle den Eintrag schon trägt", () => {
    const bib = ["EAL Nord", "Leitstelle Uelzen", "FW-Leitstelle", "Leitung Sanität", "Leitstelle Celle"].map((t, i): BibStelle => ({ id: `b${i}`, titel: t, zeichen: null, leiter: null, kontakte: [], notiz: null }));
    const leer = { titel: "", zeichen: null, leiter: null, kontakte: [] };
    expect(stelleVorschlaege(bib, { ...leer, titel: "l" })).toEqual([]);
    expect(stelleVorschlaege(bib, { ...leer, titel: "leit" }).map((b) => b.titel)).toEqual(["Leitstelle Uelzen", "Leitung Sanität", "Leitstelle Celle"]);
    expect(stelleVorschlaege(bib, { ...leer, titel: "leitstelle" }).map((b) => b.titel)).toEqual(["Leitstelle Uelzen", "Leitstelle Celle", "FW-Leitstelle"]);
    expect(stelleVorschlaege(bib, { ...leer, titel: "Leitstelle Celle" }).map((b) => b.titel)).toEqual([]); // trägt ihn schon (gleiche Angaben)
    expect(stelleVorschlaege(bib, { ...leer, titel: "Leitstelle Celle", leiter: "Jana" }).map((b) => b.titel)).toEqual(["Leitstelle Celle"]);
  });
  it("In Bibliothek übernehmen: getrimmter Titel, leere Kontakte fallen, neu (id null)", () => {
    const s = { ...PLAN.stellen[1], titel: "  EA 1 ", kontakte: [{ art: "telefon" as const, wert: " " }, { art: "fax" as const, wert: "1" }] };
    expect(bibStelleAus(s)).toEqual({ id: null, titel: "EA 1", zeichen: null, leiter: null, kontakte: [{ art: "fax", wert: "1" }], notiz: null });
  });
  it("Abgleich nach dem Einfügen: nur exakte Titel (Vergleichsform) unter den neuen IDs, nicht, was die Angaben schon trägt", () => {
    const mit = { ...PLAN, stellen: [...PLAN.stellen, { ...PLAN.stellen[2], id: "n1", titel: " leitstelle  UELZEN" }, { ...PLAN.stellen[2], id: "n2", titel: "Leitstelle" }] };
    expect(bibStellenTreffer(mit, ["n1", "n2"], [LTS]).map((t) => [t.stelleId, t.b.id])).toEqual([["n1", "b1"]]);
    const gefuellt = uebernimmBibStelle(mit, "n1", LTS);
    expect(bibStellenTreffer(gefuellt, ["n1", "n2"], [LTS])).toEqual([]);
    expect(bibStellenTreffer(mit, ["a"], [LTS])).toEqual([]); // nur die neuen IDs zählen
  });
  it("einsatzOrte: Rufname (Vergleichsform) → Stelle, an der das Fahrzeug steht", () => {
    expect(einsatzOrte(PLAN).get("rk 1")).toEqual({ stelleId: "a", titel: "EA 1" });
    expect(einsatzOrte(PLAN).has("rk 2")).toBe(false);
  });
});
```

(`baue` in `_lib/beispiele/bau.ts` prüfen: legt es Einheiten aus `"RTW RK 1"` und IDs selbst an? Die Erwartung oben lässt die ID der vorhandenen Einheit offen.)

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan/bibliothek.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_lib/plan/bibliothek.ts`:

```ts
import { vergleichsform, type BibEinheit, type BibStelle, type BibVerbindung } from "../bibliothek/typen";
import { fuegeEinheitenEin } from "./einheiten";
import { aendereStelle, PlanFehler, stelleOder } from "./operationen";
import type { Kontakt, PlanInhalt, Stelle } from "./schema";
import { findeVerbindung, legeVerbindungAn } from "./verbindungen";

/**
 * KOPIEN AUS DER BIBLIOTHEK (Spec §4.3, §6.4, §6.5; Umsetzungsplan Phase 4, Entscheidungen 13, 14) — reine
 * Operationen wie alle in `_lib/plan/`: Eingabe unverändert, Ausgabe gültig oder `PlanFehler`. Jede ist im
 * Editor EIN Rückgängig-Schritt. Kopiert wird tief (Kontakte), damit der Plan nie auf einen
 * Bibliothekseintrag verweist; Notizen bleiben in der Bibliothek.
 */
export const BIB_OPTION = "~bib:";

export function uebernimmBibStelle(inhalt: PlanInhalt, stelleId: string, b: BibStelle): PlanInhalt {
  return aendereStelle(inhalt, stelleId, { titel: b.titel, zeichen: b.zeichen, leiter: b.leiter, kontakte: b.kontakte.map((k) => ({ art: k.art, wert: k.wert })) });
}

export function fuegeBibEinheitenEin(inhalt: PlanInhalt, stelleId: string, eintraege: readonly BibEinheit[], ids: readonly string[]): PlanInhalt {
  return fuegeEinheitenEin(inhalt, stelleId, eintraege.map((e, i) => ({ id: ids[i], typ: e.typ, rufname: e.rufname, zeichen: e.zeichen })));
}

/** Gleichnamige Verbindung derselben Art im Plan → die wird genommen (keine Doppelung, wie `VerbindungWahl`); sonst eine Kopie. */
export function verbindeMitBibVerbindung(inhalt: PlanInhalt, stelleId: string, b: BibVerbindung, neueId: string): PlanInhalt {
  if (stelleOder(inhalt, stelleId).eltern === null) throw new PlanFehler("Eine Stelle der obersten Ebene hat keine Verbindung nach oben.");
  const vorhanden = findeVerbindung(inhalt, b.bezeichnung, b.art);
  const mit = vorhanden ? inhalt : legeVerbindungAn(inhalt, { id: neueId, art: b.art, bezeichnung: b.bezeichnung });
  return aendereStelle(mit, stelleId, { verbindungId: vorhanden?.id ?? neueId });
}

/** Was die Verbindungsauswahl zusätzlich „aus der Bibliothek" anbietet: nur, was der Plan noch nicht hat. */
export function bibVerbindungenFuerPlan(inhalt: PlanInhalt, bib: readonly BibVerbindung[]): BibVerbindung[] {
  return bib.filter((b) => !findeVerbindung(inhalt, b.bezeichnung, b.art));
}

const gleicheKontakte = (a: readonly Kontakt[], b: readonly Kontakt[]) =>
  a.length === b.length && a.every((k, i) => k.art === b[i].art && k.wert === b[i].wert);

/** Titelvorschläge der Gliederung (Entscheidung 14). */
export function stelleVorschlaege(bib: readonly BibStelle[], stelle: Pick<Stelle, "titel" | "zeichen" | "leiter" | "kontakte">, max = 3): BibStelle[] {
  const text = vergleichsform(stelle.titel);
  if (text.length < 2) return [];
  const traegtSchon = (b: BibStelle) => vergleichsform(b.titel) === text && b.zeichen === stelle.zeichen
    && (b.leiter ?? null) === (stelle.leiter ?? null) && gleicheKontakte(b.kontakte, stelle.kontakte);
  const titel = (b: BibStelle) => vergleichsform(b.titel);
  const beginnt = bib.filter((b) => titel(b).startsWith(text));
  const enthaelt = bib.filter((b) => !titel(b).startsWith(text) && titel(b).includes(text));
  return [...beginnt, ...enthaelt].filter((b) => !traegtSchon(b)).slice(0, max);
}

/** „In Bibliothek übernehmen": was von einer Stelle in die Bibliothek geht — neu, ohne Notiz. */
export function bibStelleAus(s: Stelle): { id: null; titel: string; zeichen: string | null; leiter: string | null; kontakte: Kontakt[]; notiz: null } {
  return { id: null, titel: s.titel.trim(), zeichen: s.zeichen, leiter: s.leiter, kontakte: s.kontakte.filter((k) => k.wert.trim() !== ""), notiz: null };
}

/**
 * Abgleich nach dem Einfügen einer Gliederung (Entscheidung 14): welche der NEUEN Stellen heißen genau wie ein
 * Bibliothekseintrag (Vergleichsform) und tragen dessen Angaben noch nicht? Der Editor bietet „Angaben übernehmen"
 * für alle Treffer in einem Schritt an.
 */
export function bibStellenTreffer(inhalt: PlanInhalt, ids: readonly string[], bib: readonly BibStelle[]): { stelleId: string; b: BibStelle }[] {
  const nachTitel = new Map(bib.map((b) => [vergleichsform(b.titel), b]));
  return ids.flatMap((id) => {
    const s = inhalt.stellen.find((x) => x.id === id);
    const b = s ? nachTitel.get(vergleichsform(s.titel)) : undefined;
    if (!s || !b) return [];
    const traegt = b.zeichen === s.zeichen && (b.leiter ?? null) === (s.leiter ?? null) && gleicheKontakte(b.kontakte, s.kontakte);
    return traegt ? [] : [{ stelleId: id, b }];
  });
}

/** Wo steht welches Fahrzeug? Vergleichsform des Rufnamens → Stelle — für „schon bei …" in der Einheitenauswahl. */
export function einsatzOrte(inhalt: PlanInhalt): Map<string, { stelleId: string; titel: string }> {
  const orte = new Map<string, { stelleId: string; titel: string }>();
  for (const s of inhalt.stellen) for (const e of s.einheiten) {
    const k = vergleichsform(e.rufname);
    if (!orte.has(k)) orte.set(k, { stelleId: s.id, titel: s.titel.trim() || "(ohne Titel)" });
  }
  return orte;
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan/ src/app/m/kommplan/grenze.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
git add src/app/m/kommplan/_lib/plan/bibliothek.ts src/app/m/kommplan/_lib/plan/bibliothek.test.ts
git commit -S -m "feat(kommplan): Stellen, Einheiten und Verbindungen aus der Bibliothek kopieren

Reine Operationen: Kopie statt Verweis, gleichnamige Verbindungen
derselben Art werden genommen statt verdoppelt, Titelvorschläge für die
Gliederung.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Bibliothek im Editor — Flyin, Einheiten, Verbindung

**Files:**
- Create: `src/app/m/kommplan/_ui/editor/bibliothekKontext.tsx`, `src/app/m/kommplan/_ui/gliederung/TitelVorschlaege.tsx`
- Modify: `src/app/m/kommplan/_ui/editor/Editor.tsx` (Prop `bibliothek`, Anbieter), `src/app/m/kommplan/_ui/editor/StelleFlyin.tsx`, `src/app/m/kommplan/_ui/editor/EinheitenListe.tsx`, `src/app/m/kommplan/_ui/editor/VerbindungWahl.tsx`, `src/app/m/kommplan/_ui/editor/PlanFlyin.tsx`, `src/app/m/kommplan/_ui/gliederung/GliederungZeile.tsx` (`ladeSymbole` an `EinheitenListe`), `src/app/m/kommplan/(intern)/p/[id]/page.tsx` (Bibliothek laden)
- Modify: `src/app/m/kommplan/_ui/kommplan.css` (`.kp-aus-bibliothek`, `.kp-bib-einheiten`)
- Test: `src/app/m/kommplan/_ui/editor/StelleFlyin.test.tsx`, `src/app/m/kommplan/_ui/editor/PlanFlyin.test.tsx`, `src/app/m/kommplan/_ui/editor/Editor.test.tsx`; Mock-Ergänzung in `src/app/m/kommplan/_ui/gliederung/Gliederung.test.tsx`, `GliederungLast.test.tsx`

**Interfaces:**
- Consumes: Task 18 (`uebernimmBibStelle`, `fuegeBibEinheitenEin`, `verbindeMitBibVerbindung`, `bibVerbindungenFuerPlan`, `stelleVorschlaege`, `bibStelleAus`, `einsatzOrte`, `BIB_OPTION`); `speichereBibStelleAction`, `importiereBibEinheitenAction`, `importiereBibVerbindungenAction` (Task 16); `LEERE_BIBLIOTHEK`, `passt`, `vergleichsform` (Task 14); `ladeBibliothek` (Task 14); `TitelVorschlaege` (entsteht hier, Task 20 hängt ihn zusätzlich in die Gliederung).
- Produces: `BibliothekKontext` (`createContext<BibliothekImEditor>`), `interface BibTeil { stellen?; einheiten?; verbindungen? }`, `interface BibliothekImEditor { aktiv: boolean; bib: Bibliothek; merke(teil: BibTeil): void }` (`aktiv` = ein Anbieter ist da; ohne ihn erscheinen die neuen Felder nicht), `useBibliothek()`, `BibliothekAnbieter({ start, children })`; `TitelVorschlaege({ stelle, onWahl, tabStopps? })` (`_ui/gliederung/TitelVorschlaege.tsx`); `Editor`-Prop `bibliothek?: Bibliothek` (Vorgabe `LEERE_BIBLIOTHEK`); `EinheitenListe`-Prop `ladeSymbole?`. DOM im Flyin: Feld „Aus Bibliothek" (`Select`, Platzhalter „Stelle aus der Bibliothek suchen") oben, Titelvorschläge `.kp-g-vorschlaege` unter dem Titelfeld, Knopf „In Bibliothek übernehmen" neben „Stelle löschen" (bei Dublette zusätzlich „Eintrag in der Bibliothek aktualisieren"), Meldung `[role="status"]`; im Einheitenfeld `.kp-bib-einheiten` mit `Select` `aria-label="Einheiten aus der Bibliothek"` + Knopf „Hinzufügen" und Knopf „Einheiten in Bibliothek übernehmen"; in „Zur Elternstelle" eine Gruppe „Aus der Bibliothek"; im Flyin „Plan und Verbindungen" Knopf „Verbindungen in Bibliothek übernehmen".

- [ ] **Step 1: Failing Tests schreiben**

**Mocks zuerst:** `StelleFlyin.tsx`, `EinheitenListe.tsx` und `PlanFlyin.tsx` importieren ab jetzt `_actions/bibliothek` — der echte Modulbaum zöge Datenbank und Auth in jsdom. Jede Testdatei, die eine davon rendert, mockt das Modul (Vorbild `NeuerPlan.test.tsx`): `StelleFlyin.test.tsx`, `PlanFlyin.test.tsx`, `Editor.test.tsx`, `_ui/gliederung/Gliederung.test.tsx`, `_ui/gliederung/GliederungLast.test.tsx` (dort reicht `vi.mock("../../_actions/bibliothek", () => ({ speichereBibStelleAction: vi.fn(), importiereBibEinheitenAction: vi.fn(), importiereBibVerbindungenAction: vi.fn() }))`, Pfad je Datei anpassen).

In `src/app/m/kommplan/_ui/editor/StelleFlyin.test.tsx`:
1. Mocks und Importe ergänzen:
   ```tsx
   const bibAktion = vi.hoisted(() => ({ stelle: vi.fn(), einheiten: vi.fn() }));
   vi.mock("../../_actions/bibliothek", () => ({ speichereBibStelleAction: bibAktion.stelle, importiereBibEinheitenAction: bibAktion.einheiten, importiereBibVerbindungenAction: vi.fn() }));
   import { BibliothekKontext } from "./bibliothekKontext";
   import type { Bibliothek } from "../../_lib/bibliothek/typen";
   const BIB: Bibliothek = {
     stellen: [
       { id: "b1", titel: "Leitstelle Uelzen", zeichen: "zusatz:eal", leiter: "Disponent", kontakte: [{ art: "telefon", wert: "0581 1" }], notiz: null },
       { id: "b2", titel: "EA 1", zeichen: null, leiter: null, kontakte: [], notiz: "intern" },
     ],
     einheiten: [
       { id: "be0", typ: "RTW", rufname: "RK 1", zeichen: null, notiz: null },
       { id: "be1", typ: "KTW", rufname: "RK 2", zeichen: null, notiz: null }, { id: "be2", typ: "NEF", rufname: "RK 3", zeichen: null, notiz: null },
     ],
     verbindungen: [{ id: "bv1", art: "dmo", bezeichnung: "DMO 608", notiz: null }],
   };
   const merke = vi.fn();
   const schritte: (string | undefined)[] = [];
   const warte = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
   ```
2. In `Rahmen` den `aendere`-Rückruf um `schritte.push(schluessel);` (Parameter `schluessel` ergänzen) erweitern und das Formular in `<BibliothekKontext.Provider value={{ aktiv: true, bib: BIB, merke }}>…</BibliothekKontext.Provider>` legen; im `afterEach` `schritte.length = 0; merke.mockReset(); bibAktion.stelle.mockReset(); bibAktion.einheiten.mockReset(); lade.mockReset(); fertig.mockReset();` (sofern nicht schon vorhanden).
3. Anfügen:

```tsx
describe("Bibliothek im Flyin (Entscheidung 13)", () => {
  it("„Aus Bibliothek“ füllt Titel, Zeichen, Leiter, Kontakte in EINEM Schritt, lädt das Zeichen nach; danach Fokus im Titel", async () => {
    await mount(<Rahmen />);
    await waehleOption(feldZu("Aus Bibliothek"), "Leitstelle Uelzen · Disponent");
    expect(stelle()).toMatchObject({ titel: "Leitstelle Uelzen", zeichen: "zusatz:eal", leiter: "Disponent", kontakte: [{ art: "telefon", wert: "0581 1" }] });
    expect(stelle().einheiten).toHaveLength(1);
    expect(schritte).toEqual([undefined]); // ohne Bündelschlüssel = ein eigener Rückgängig-Schritt
    expect(lade).toHaveBeenCalledWith(["zusatz:eal"]); // der Kopierweg lädt selbst nach, nicht jedes `aendere`
    await warte();
    expect(document.activeElement).toBe(REF0.current?.input); // das Select montiert neu — der Fokus fällt nicht auf body
  });
  it("Titelvorschläge auch im Flyin: Tippen zeigt sie (Tabstopps), Alt+Enter füllt in EINEM Schritt, Fokus bleibt, kein „fertig“", async () => {
    await mount(<Rahmen />);
    await fill('[data-flyin-stelle] input[name="titel"]', "Leit");
    const gruppe = query('[role="group"][aria-label="Vorschläge aus der Bibliothek"]');
    expect(gruppe.textContent).toContain("Leitstelle Uelzen · Disponent");
    expect(gruppe.querySelector("[data-vorschlag]")!.getAttribute("tabindex")).not.toBe("-1");
    schritte.length = 0;
    const feld = query<HTMLInputElement>('[data-flyin-stelle] input[name="titel"]');
    feld.focus();
    await act(async () => { feld.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true })); });
    expect(stelle().titel).toBe("Leitstelle Uelzen");
    expect(schritte).toEqual([undefined]);
    expect(document.activeElement).toBe(feld);
    expect(fertig).not.toHaveBeenCalled(); // Alt+Enter ist nicht das Enter, das das Flyin schließt
  });
  it("„In Bibliothek übernehmen“: Angaben der Stelle, Kontext ergänzt; Dublette bietet „aktualisieren“ an (Notiz bleibt); Fokus bleibt am Knopf", async () => {
    bibAktion.stelle
      .mockResolvedValueOnce({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "„EA 1“ steht schon in der Bibliothek." } })
      .mockResolvedValueOnce({ ok: true, eintrag: { id: "b2", titel: "EA 1", zeichen: null, leiter: null, kontakte: [], notiz: "intern" } });
    await mount(<Rahmen />);
    const uebernehmen = knopf("In Bibliothek übernehmen");
    uebernehmen.focus();
    await clickElement(uebernehmen);
    await warte();
    expect(bibAktion.stelle).toHaveBeenCalledWith(expect.objectContaining({ id: null, titel: "EA 1", kontakte: expect.arrayContaining([{ art: "email", wert: "ea1@drk.de" }]) }));
    expect(document.body.textContent).toContain("„EA 1“ steht schon in der Bibliothek.");
    expect(document.activeElement).toBe(uebernehmen); // nur `loading`, nie gesperrt — der Fokus fällt nicht auf body
    await clickElement(knopf("Eintrag in der Bibliothek aktualisieren"));
    await warte();
    expect(bibAktion.stelle).toHaveBeenLastCalledWith(expect.objectContaining({ id: "b2", titel: "EA 1", notiz: "intern" }));
    expect(merke).toHaveBeenCalledWith({ stellen: [expect.objectContaining({ id: "b2" })] });
    expect(document.body.textContent).toContain("„EA 1“ in der Bibliothek aktualisiert.");
  });
  it("ohne Titel ist „In Bibliothek übernehmen“ gesperrt", async () => {
    await mount(<Rahmen />);
    await fill('[data-flyin-stelle] input[name="titel"]', "");
    expect(knopf("In Bibliothek übernehmen").disabled).toBe(true);
  });
  it("Einheiten aus der Bibliothek: freie zuerst, hier vorhandene gesperrt, anderswo eingesetzte mit Hinweis; der Suchtext bleibt", async () => {
    await mount(<Rahmen stelleId="b" />);
    const auswahl = query<HTMLInputElement>('input[aria-label="Einheiten aus der Bibliothek"]');
    const liste = await oeffneAuswahl(auswahl);
    expect(optionen(liste)).toEqual(["KTW RK 2", "NEF RK 3", "RTW RK 1 — schon bei EA 1"]);
    await fill('input[aria-label="Einheiten aus der Bibliothek"]', "RK");
    await waehleOption(auswahl, "KTW RK 2");
    expect(auswahl.value).toBe("RK"); // autoClearSearchValue: false — einmal tippen, mehrere wählen
  });
  it("Einheiten aus der Bibliothek: an DIESER Stelle schon vorhandene sind gesperrt; „Hinzufügen“ ist EIN Schritt, danach Fokus zurück in die Auswahl", async () => {
    await mount(<Rahmen />);
    const auswahl = query<HTMLInputElement>('input[aria-label="Einheiten aus der Bibliothek"]');
    const liste = await oeffneAuswahl(auswahl);
    const gesperrt = [...liste.querySelectorAll<HTMLElement>(".ant-select-item-option-disabled")].map((o) => o.textContent);
    expect(gesperrt).toEqual(["RTW RK 1 — steht schon hier"]);
    await waehleOption(auswahl, "KTW RK 2");
    await waehleOption(auswahl, "NEF RK 3");
    schritte.length = 0;
    await clickElement(knopf("Hinzufügen"));
    expect(stelle().einheiten.map((e) => `${e.typ} ${e.rufname}`)).toEqual(["RTW RK 1", "KTW RK 2", "NEF RK 3"]);
    expect(schritte).toEqual([undefined]);
    await warte();
    expect(document.activeElement).toBe(auswahl);
  });
  it("„Einheiten in Bibliothek übernehmen“: alle Einheiten der Stelle in EINEM Aufruf, Meldung mit Zahlen", async () => {
    bibAktion.einheiten.mockResolvedValue({ ok: true, angelegt: 0, uebersprungen: 1, eintraege: [] });
    await mount(<Rahmen />);
    await clickElement(knopf("Einheiten in Bibliothek übernehmen"));
    await warte();
    expect(bibAktion.einheiten).toHaveBeenCalledWith([{ typ: "RTW", rufname: "RK 1", notiz: null, zeichen: null }]);
    expect(document.body.textContent).toContain("0 angelegt, 1 schon vorhanden.");
  });
  it("Verbindung aus der Bibliothek: eigene Gruppe, Wahl legt eine Kopie an und verbindet", async () => {
    await mount(<Rahmen />);
    const liste = await oeffneAuswahl(feldZu("Zur Elternstelle"));
    expect(liste.textContent).toContain("Aus der Bibliothek");
    expect(optionen(liste)).toContain("DMO 608 · Digitalfunk DMO");
    await waehleOption(feldZu("Zur Elternstelle"), "DMO 608 · Digitalfunk DMO");
    const v = stand.verbindungen.find((x) => x.bezeichnung === "DMO 608")!;
    expect(v.art).toBe("dmo");
    expect(stelle().verbindungId).toBe(v.id);
  });
});
```

(Ob `feldZu("Aus Bibliothek")` das Eingabefeld des `Select` trifft, hängt am `id` — wie bei „Zur Elternstelle", `htmlFor` auf die `id` des `Select`. `aria-label` am `Select` landet in antd 6 am inneren `input`. `.ant-select-item-option-disabled` ist ein Test-Greifer wie `.ant-select-item-option` in `optionen`, keine Stilregel. `Rahmen` bekommt die Prop `stelleId` schon heute. Den Ausgangsplan nicht ändern: die Einheit „RTW RK 1" an „EA 1" ist der Fall „anderswo eingesetzt" bzw. „hier vorhanden".)

In `src/app/m/kommplan/_ui/editor/PlanFlyin.test.tsx` (Mock wie oben, `bibAktion.verbindungen` für `importiereBibVerbindungenAction`; `Rahmen` legt das Formular in `<BibliothekKontext.Provider value={{ aktiv: true, bib: LEERE_BIBLIOTHEK, merke }}>`) anfügen:

```tsx
  it("„Verbindungen in Bibliothek übernehmen“: alle Verbindungen des Plans in EINEM Aufruf, Kontext ergänzt (Entscheidung 13)", async () => {
    bibAktion.verbindungen.mockResolvedValue({ ok: true, angelegt: 3, uebersprungen: 0, eintraege: [{ id: "n1", art: "tmo", bezeichnung: "R_UE_2", notiz: null }] });
    await mount(<Rahmen />);
    await clickElement(knopf("Verbindungen in Bibliothek übernehmen"));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(bibAktion.verbindungen).toHaveBeenCalledTimes(1);
    expect(bibAktion.verbindungen).toHaveBeenCalledWith([{ art: "tmo", bezeichnung: "R_UE_2" }, { art: "dmo", bezeichnung: "DMO 608" }, { art: "tmo", bezeichnung: "K_UE_2" }]);
    expect(merke).toHaveBeenCalledWith({ verbindungen: [expect.objectContaining({ id: "n1" })] });
    expect(document.body.textContent).toContain("3 angelegt, 0 schon vorhanden.");
  });
```

In `src/app/m/kommplan/_ui/editor/Editor.test.tsx` anfügen (Importe zusammenführen; Mock von `_actions/bibliothek` ergänzen):

```tsx
  it("eine Kopie aus der Bibliothek bringt ein Zeichen mit: der Editor lädt das SVG nach (Entscheidung 13)", async () => {
    await mount(<Editor plan={plan()} symbole={{}} zeichenIndex={[]} schrift="Arimo"
      bibliothek={{ stellen: [{ id: "b1", titel: "Leitstelle", zeichen: "zusatz:eal", leiter: null, kontakte: [], notiz: null }], einheiten: [], verbindungen: [] }} />);
    await act(async () => {});
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("F2");
    expect(flyinOffen()).toBe(true);
    zeichen.ladeZeichenAction.mockClear();
    const feld = document.getElementById([...document.querySelectorAll("label")].find((l) => l.textContent === "Aus Bibliothek")!.htmlFor)!;
    await act(async () => { feld.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    const option = [...document.querySelectorAll<HTMLElement>(".ant-select-item-option")].find((o) => o.textContent === "Leitstelle")!;
    await clickElement(option);
    expect(zeichen.ladeZeichenAction).toHaveBeenCalledWith(["zusatz:eal"]);
  });
  it("Tippen ohne Kopie löst keinen Zeichen-Abruf aus — auch nicht bei einem unbekannten Zeichenschlüssel im Plan", async () => {
    const mitUnbekannt = plan();
    mitUnbekannt.inhalt!.stellen[0].zeichen = "gibt-es:nicht";
    await mount(<Editor plan={mitUnbekannt} symbole={{}} zeichenIndex={[]} schrift="Arimo" bibliothek={LEERE_BIBLIOTHEK} />);
    await act(async () => {});
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("F2");
    zeichen.ladeZeichenAction.mockClear();
    for (const t of ["E", "EA", "EA 9"]) await schreibe(flyinFeld(), t);
    expect(zeichen.ladeZeichenAction).not.toHaveBeenCalled();
  });
```

(`plan`, `waehle`, `taste`, `flyinOffen`, `flyinFeld`, `schreibe` und der Mock `zeichen.ladeZeichenAction` sind die vorhandenen Helfer der Datei — sie greifen das Flyin schon über das Portal; `clickElement` in die Importzeile aus dem Harness aufnehmen, falls er fehlt. Die Form von `plan()` — wo `inhalt` hängt — an die Datei angleichen. Der zweite Fall ist die Gegenprobe zur verworfenen Fassung „`ladeSymbole(zeichenImPlan(neu))` nach jedem `aendere`": mit ihr wird er rot.)

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/editor`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/app/m/kommplan/_ui/editor/bibliothekKontext.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { LEERE_BIBLIOTHEK, type BibEinheit, type BibStelle, type BibVerbindung, type Bibliothek } from "../../_lib/bibliothek/typen";

/**
 * DIE BIBLIOTHEK IM EDITOR (Umsetzungsplan Phase 4, Entscheidung 13): ein Kontext statt Props durch Flyin,
 * Einheitenliste und Gliederung. Der Wert ändert sich nur, wenn die Bibliothek sich ändert (eine Übernahme
 * per `merke`) — die `memo`-gebundenen Gliederungszeilen rendern beim Tippen deshalb nicht mit (Phase 3,
 * Entscheidung 2; `GliederungLast.test.tsx`). Ohne Anbieter: `aktiv: false`, leere Bibliothek — die neuen
 * Felder erscheinen nicht, kein Absturz.
 */
export interface BibTeil { stellen?: readonly BibStelle[]; einheiten?: readonly BibEinheit[]; verbindungen?: readonly BibVerbindung[] }
export interface BibliothekImEditor { aktiv: boolean; bib: Bibliothek; merke(teil: BibTeil): void }
export const BibliothekKontext = createContext<BibliothekImEditor>({ aktiv: false, bib: LEERE_BIBLIOTHEK, merke: () => {} });
export const useBibliothek = () => useContext(BibliothekKontext);

const de = (a: string, b: string) => a.localeCompare(b, "de");
/** Neue oder geänderte Einträge nach ID ersetzen bzw. ergänzen, sortiert wie `ladeBibliothek`. */
function fuegeZu<T extends { id: string }>(alt: T[], neu: readonly T[] | undefined, ordnung: (a: T, b: T) => number): T[] {
  if (!neu || neu.length === 0) return alt;
  const ids = new Set(neu.map((n) => n.id));
  return [...alt.filter((x) => !ids.has(x.id)), ...neu].sort(ordnung);
}

export function BibliothekAnbieter({ start, children }: { start: Bibliothek; children: ReactNode }) {
  const [bib, setBib] = useState(start);
  const wert = useMemo<BibliothekImEditor>(() => ({
    aktiv: true,
    bib,
    merke: (t) => setBib((b) => ({
      stellen: fuegeZu(b.stellen, t.stellen, (x, y) => de(x.titel, y.titel)),
      einheiten: fuegeZu(b.einheiten, t.einheiten, (x, y) => de(x.typ, y.typ) || de(x.rufname, y.rufname)),
      verbindungen: fuegeZu(b.verbindungen, t.verbindungen, (x, y) => de(x.bezeichnung, y.bezeichnung) || de(x.art, y.art)),
    })),
  }), [bib]);
  return <BibliothekKontext.Provider value={wert}>{children}</BibliothekKontext.Provider>;
}
```

`src/app/m/kommplan/_ui/gliederung/TitelVorschlaege.tsx` (hier angelegt, weil das Flyin ihn zuerst braucht; Task 20 hängt ihn in die Gliederung):

```tsx
"use client";

import { Button } from "antd";
import type { BibStelle } from "../../_lib/bibliothek/typen";
import { stelleVorschlaege } from "../../_lib/plan/bibliothek";
import type { Stelle } from "../../_lib/plan/schema";
import { useBibliothek } from "../editor/bibliothekKontext";

/**
 * TITELVORSCHLÄGE (Umsetzungsplan Phase 4, Entscheidung 14) — ohne den Tippfluss zu stören: kein Popup, keine
 * Taste außer Alt+Enter (beim Aufrufer). Die Knöpfe verhindern `mousedown`, damit der Fokus im Titel bleibt —
 * sonst verwürfe das Verlassen eine eben angelegte, unberührte Zeile (Phase 3, Entscheidung 8). Einzeilig,
 * waagerecht scrollbar, feste Höhe: die Zeilen darunter springen beim Tippen nicht. `tabStopps`: im Flyin
 * erreicht Tab die Vorschläge (Weg ohne Zeiger zum 2. und 3.); in der Gliederung gehört Tab dem Einrücken.
 * Liest als EINZIGE Komponente der Zeile den Kontext; die übrigen Zeilen bleiben `memo`.
 */
export function TitelVorschlaege({ stelle, onWahl, tabStopps = false }: { stelle: Stelle; onWahl: (b: BibStelle) => void; tabStopps?: boolean }) {
  const { aktiv, bib } = useBibliothek();
  const vorschlaege = aktiv ? stelleVorschlaege(bib.stellen, stelle) : [];
  if (vorschlaege.length === 0) return null;
  return (
    <div className="kp-g-vorschlaege" role="group" aria-label="Vorschläge aus der Bibliothek">
      <span className="kp-hilfe kp-vorschlag-hinweis">Aus Bibliothek (Alt+Enter nimmt den ersten):</span>
      {vorschlaege.map((b) => (
        <Button key={b.id} data-vorschlag={b.id} tabIndex={tabStopps ? undefined : -1} onMouseDown={(e) => e.preventDefault()} onClick={() => onWahl(b)}>
          {b.leiter ? `${b.titel} · ${b.leiter}` : b.titel}
        </Button>
      ))}
    </div>
  );
}
```

`Editor.tsx`:
1. Prop `bibliothek = LEERE_BIBLIOTHEK` (Typ `Bibliothek`) in Destrukturierung und Typ; Importe `LEERE_BIBLIOTHEK`, `type Bibliothek` aus `../../_lib/bibliothek/typen`, `BibliothekAnbieter` aus `./bibliothekKontext`.
2. **Kein** Nachladen hinter `aendere` (Kritik: ein unbekannter Schlüssel im Plan löste sonst bei jedem Tastendruck einen `ladeZeichenAction`-Aufruf aus, `unterwegs` schützt nur, solange er läuft). Die Kopierwege rufen `ladeSymbole` mit den mitgebrachten Schlüsseln selbst: das Flyin über seine vorhandene Prop `ladeSymbole`, die Gliederung über ihre (`p.ladeSymbole`), die Einheitenliste über die neue Prop.
3. Das zurückgegebene `<div ref={wurzel} className="kp-editor" …>…</div>` in `<BibliothekAnbieter start={bibliothek}>…</BibliothekAnbieter>` legen (der `ref` bleibt am `div`).

`StelleFlyin.tsx`:
1. Importe: `useRef`, `useState` ergänzen; `Select`, `type RefSelectProps` zu den antd-Importen; `speichereBibStelleAction` aus `../../_actions/bibliothek`; `passt`, `vergleichsform`, `type BibStelle` aus `../../_lib/bibliothek/typen`; `bibStelleAus`, `stelleVorschlaege`, `uebernimmBibStelle` aus `../../_lib/plan/bibliothek`; `useBibliothek` aus `./bibliothekKontext`; `TitelVorschlaege` aus `../gliederung/TitelVorschlaege`.
2. In `StelleFormular`:
   - `const { aktiv, bib } = useBibliothek();` und
     ```tsx
     /** Eine Stelle aus der Bibliothek übernehmen — EIN Rückgängig-Schritt; das mitgebrachte Zeichen lädt dieser Weg selbst nach. */
     const uebernimm = (b: BibStelle) => {
       const f = aendere((q) => uebernimmBibStelle(q, s.id, b));
       if (f === null && b.zeichen) p.ladeSymbole([b.zeichen]);
       return f;
     };
     ```
   - als **erstes** Kind von `.kp-formular` (vor dem Titel-Label): `{aktiv ? <AusBibliothek key={`bib:${s.id}`} uebernimm={uebernimm} titelRef={titelRef} /> : null}`;
   - am Titel-`Input`: `onPressEnter` beginnt mit `if (e.altKey) return;` (Alt+Enter ist nicht das Enter, das fertig meldet; antd ruft `onPressEnter` vor `onKeyDown`), dazu `onKeyDown={(e) => { if (e.key === "Enter" && e.altKey && !e.repeat) { e.preventDefault(); const v = stelleVorschlaege(bib.stellen, s)[0]; if (v) uebernimm(v); } }}`;
   - direkt unter dem Titelfeld (nach seinem Fehlertext): `<TitelVorschlaege stelle={s} tabStopps onWahl={(b) => { uebernimm(b); titelRef.current?.focus(); }} />`;
   - in `.kp-formular-knoepfe` vor „Stelle löschen": `{aktiv ? <InBibliothek key={`inbib:${s.id}`} stelle={s} /> : null}` (Schlüssel je Stelle wie U5 der Phase 2: kein Zustand wandert beim Wechsel der Auswahl mit);
   - an `EinheitenListe` zusätzlich `ladeSymbole={p.ladeSymbole}`.
3. Unten in der Datei:

```tsx
const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";

/** „Aus Bibliothek" (Spec §6.4): füllt die Stelle per Kopie, EIN Rückgängig-Schritt; Einheiten, Lage und Verbindung bleiben. */
function AusBibliothek({ uebernimm, titelRef }: { uebernimm: (b: BibStelle) => string | null; titelRef: RefObject<InputRef | null> }) {
  const basis = useId();
  const { bib } = useBibliothek();
  const [meldung, setMeldung] = useState<string | null>(null);
  // Nach jeder Wahl leer neu montiert (`key`): ein festes `value={null}` zeigte in antd je nach Fassung nicht den Platzhalter.
  const [runde, setRunde] = useState(0);
  // Mit dem Select ginge der Fokus verloren (Flyin ohne Maske: Esc, Tab, Enter erreichten das Formular nicht mehr) — er geht ins Titelfeld.
  useEffect(() => { if (runde > 0) titelRef.current?.focus(); }, [runde, titelRef]);
  if (bib.stellen.length === 0) return null;
  const waehle = (id: string) => {
    setRunde((n) => n + 1);
    const b = bib.stellen.find((x) => x.id === id);
    if (!b) return;
    const f = uebernimm(b);
    setMeldung(f ?? `„${b.titel}“ übernommen. „Rückgängig“ holt die vorigen Angaben zurück.`);
  };
  return (
    <div className="kp-aus-bibliothek">
      <label className="kp-feldname" htmlFor={`${basis}-bib`}>Aus Bibliothek</label>
      <Select key={runde} id={`${basis}-bib`} placeholder="Stelle aus der Bibliothek suchen" onChange={waehle}
        showSearch={{ filterOption: (eingabe, o) => passt(eingabe, [String(o?.label ?? "")]) }}
        options={bib.stellen.map((b) => ({ value: b.id, label: b.leiter ? `${b.titel} · ${b.leiter}` : b.titel }))} />
      {meldung ? <p className="kp-hilfe" role="status">{meldung}</p> : null}
    </div>
  );
}

/**
 * „In Bibliothek übernehmen" (Spec §4.3): Titel, Zeichen, Leiter, Kontakte als neuer Eintrag. Eine Dublette meldet
 * sich und bietet „Eintrag in der Bibliothek aktualisieren" an (die Notiz des Eintrags bleibt). Während des Laufs
 * nur `loading`, nie `disabled` — ein gesperrter Knopf verlöre den Fokus; Doppelauslösung fängt `laeuft` ab.
 */
function InBibliothek({ stelle }: { stelle: Stelle }) {
  const { bib, merke } = useBibliothek();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [vorhanden, setVorhanden] = useState<BibStelle | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  async function sende(ziel: BibStelle | null) {
    if (laeuft) return;
    setLaeuft(true);
    const r = await speichereBibStelleAction({ ...bibStelleAus(stelle), id: ziel?.id ?? null, notiz: ziel?.notiz ?? null })
      .catch(() => ({ ok: false as const, fehler: NETZ }));
    setLaeuft(false);
    if (r.ok) {
      merke({ stellen: [r.eintrag] });
      setVorhanden(null);
      setMeldung(ziel ? `„${r.eintrag.titel}“ in der Bibliothek aktualisiert.` : `„${r.eintrag.titel}“ steht jetzt in der Bibliothek.`);
      return;
    }
    const titelFehler = "feldFehler" in r ? r.feldFehler?.titel : undefined;
    setMeldung(titelFehler ?? r.fehler);
    // Den vorhandenen Eintrag nur anbieten, wenn der Editor ihn kennt (sonst bleibt es bei der Meldung).
    setVorhanden(titelFehler ? bib.stellen.find((b) => vergleichsform(b.titel) === vergleichsform(stelle.titel)) ?? null : null);
  }
  return (
    <>
      <Button onClick={() => void sende(null)} loading={laeuft} disabled={stelle.titel.trim() === ""}>In Bibliothek übernehmen</Button>
      {vorhanden ? <Button onClick={() => void sende(vorhanden)} loading={laeuft}>Eintrag in der Bibliothek aktualisieren</Button> : null}
      {meldung ? <p className="kp-hilfe" role="status">{meldung}</p> : null}
    </>
  );
}
```

(Typ `Stelle` aus `../../_lib/plan/schema`, `RefObject` aus `react`, `InputRef` aus `antd` importieren, soweit nicht vorhanden.)

`EinheitenListe.tsx`:
1. Signatur: `inhalt` mit destrukturieren, neue optionale Prop `ladeSymbole?: (schluessel: string[]) => void`. Importe: `Select`, `type RefSelectProps` (antd); `importiereBibEinheitenAction` aus `../../_actions/bibliothek`; `passt`, `vergleichsform` aus `../../_lib/bibliothek/typen`; `einsatzOrte`, `fuegeBibEinheitenEin` aus `../../_lib/plan/bibliothek`; `useBibliothek` aus `./bibliothekKontext`.
2. Zustand und Wege (Hooks oben, vor jedem Rücksprung):

```tsx
  const { aktiv, bib, merke } = useBibliothek();
  const [bibWahl, setBibWahl] = useState<string[]>([]);
  const [bibRunde, setBibRunde] = useState(0);
  const [bibMeldung, setBibMeldung] = useState<string | null>(null);
  const [bibLaeuft, setBibLaeuft] = useState(false);
  const bibFeld = useRef<RefSelectProps>(null);
  // Nach „Hinzufügen" sperrt sich der Knopf (Auswahl leer) — der Fokus geht zurück in die Auswahl, nicht auf body.
  useEffect(() => { if (bibRunde > 0) bibFeld.current?.focus(); }, [bibRunde]);

  const ausBib = () => {
    const gewaehlt = bib.einheiten.filter((e) => bibWahl.includes(e.id));
    const f = aendere((p) => fuegeBibEinheitenEin(p, stelle.id, gewaehlt, neueIds(p, "e", gewaehlt.length)));
    if (f !== null) { setFehler([f]); return; }
    const zeichen = gewaehlt.flatMap((e) => (e.zeichen ? [e.zeichen] : []));
    if (zeichen.length > 0) ladeSymbole?.(zeichen);
    setBibWahl([]); setFehler([]); setBibRunde((n) => n + 1);
  };
  async function inBibliothek() {
    if (bibLaeuft) return;
    const zeilen = stelle.einheiten.filter((e) => e.typ.trim() !== "" && e.rufname.trim() !== "");
    if (zeilen.length === 0) return;
    setBibLaeuft(true);
    const r = await importiereBibEinheitenAction(zeilen.map((e) => ({ typ: e.typ, rufname: e.rufname, notiz: null, zeichen: e.zeichen })))
      .catch(() => ({ ok: false as const, fehler: NETZ }));
    setBibLaeuft(false);
    if (r.ok) { merke({ einheiten: r.eintraege }); setBibMeldung(`${r.angelegt} angelegt, ${r.uebersprungen} schon vorhanden.`); }
    else setBibMeldung(r.fehler);
  }
```

3. Vor `.kp-formular-knoepfe` (nur bei `aktiv`):

```tsx
      {aktiv && bib.einheiten.length > 0 ? (
        // Eigene Klasse, NICHT `kp-zeile`: in den aufgeklappten Einheiten der Gliederung gälte sonst ab 768 px das
        // dreispaltige Raster der Einheitenzeilen (`.kp-g-einheiten .kp-zeile`) — das Select läge in der Typspalte.
        <div className="kp-bib-einheiten">
          <Select ref={bibFeld} className="kp-bib-einheiten-wahl" mode="multiple" aria-label="Einheiten aus der Bibliothek" value={bibWahl} onChange={setBibWahl}
            placeholder="Aus Bibliothek suchen"
            showSearch={{ autoClearSearchValue: false, filterOption: (eingabe, o) => passt(eingabe, [String(o?.label ?? "")]) }}
            options={bibOptionen(bib.einheiten, inhalt, stelle)} />
          <Button onClick={ausBib} disabled={bibWahl.length === 0}>Hinzufügen</Button>
        </div>
      ) : null}
```

und in `.kp-formular-knoepfe` nach „Liste einfügen": `{aktiv && stelle.einheiten.length > 0 ? <Button onClick={() => void inBibliothek()} loading={bibLaeuft}>Einheiten in Bibliothek übernehmen</Button> : null}`, darunter `{bibMeldung ? <p className="kp-hilfe" role="status">{bibMeldung}</p> : null}`.

4. Unten in der Datei (rein, ohne Zustand):

```tsx
const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";

/**
 * Optionen der Einheitenauswahl (Entscheidung 13): an DIESER Stelle schon vorhandene Fahrzeuge gesperrt, an einer
 * anderen eingesetzte mit „— schon bei …" und hinter den freien — so entstehen doppelte Fahrzeuge nicht unbemerkt.
 */
function bibOptionen(einheiten: readonly BibEinheit[], inhalt: PlanInhalt, stelle: Stelle) {
  const orte = einsatzOrte(inhalt);
  const hier = new Set(stelle.einheiten.map((e) => vergleichsform(e.rufname)));
  return einheiten.map((e) => {
    const k = vergleichsform(e.rufname);
    const ort = orte.get(k);
    const name = `${e.typ} ${e.rufname}`;
    if (hier.has(k)) return { value: e.id, label: `${name} — steht schon hier`, disabled: true, rang: 2 };
    return ort ? { value: e.id, label: `${name} — schon bei ${ort.titel}`, rang: 1 } : { value: e.id, label: name, rang: 0 };
  }).sort((a, b) => a.rang - b.rang); // stabil: innerhalb eines Rangs bleibt die Reihenfolge der Bibliothek
}
```

(Import `type BibEinheit` aus `../../_lib/bibliothek/typen`. Die Hilfseigenschaft `rang` stört antd nicht; wer sie nicht durchreichen will, entfernt sie nach dem Sortieren per `map`.)

`GliederungZeile.tsx`: an `EinheitenListe` zusätzlich `ladeSymbole={(k) => befehle.current!.ladeSymbole(k)}` (derselbe stabile Weg wie am `ZeichenKnopf`).

`VerbindungWahl.tsx`:
1. `const { aktiv, bib } = useBibliothek(); const ausBib = aktiv ? bibVerbindungenFuerPlan(inhalt, bib.verbindungen) : [];` (oben, vor jedem Rücksprung)
2. `options` des „Zur Elternstelle"-`Select`:
   ```tsx
   options={[{ value: KEINE, label: "keine (dünne Linie)" }, ...optionen,
     ...(ausBib.length > 0 ? [{ label: "Aus der Bibliothek", options: ausBib.map((b) => ({ value: `${BIB_OPTION}${b.id}`, label: `${b.bezeichnung} · ${ART_NAME[b.art]}` })) }] : [])]}
   ```
3. `onChange` ersetzen:
   ```tsx
   onChange={(v: string) => {
     const b = v.startsWith(BIB_OPTION) ? bib.verbindungen.find((x) => `${BIB_OPTION}${x.id}` === v) : undefined;
     if (b) { setFehler(aendere((p) => verbindeMitBibVerbindung(p, stelle.id, b, neueId(p, "v")))); return; }
     setFehler(aendere((p) => aendereStelle(p, stelle.id, { verbindungId: v === KEINE ? null : v })));
   }}
   ```

`PlanFlyin.tsx` — im Abschnitt Verbindungen (`fieldset[data-abschnitt="verbindungen"]`) am Ende `<VerbindungenInBibliothek inhalt={inhalt} />`, unten in der Datei:

```tsx
/**
 * „Verbindungen in Bibliothek übernehmen" (Entscheidung 13): alle Verbindungen des Plans in EINEM Aufruf — Server
 * Actions laufen nacheinander, eine Schleife einzelner Aufrufe stellte sich vor das Autosave (`unterwegs` im Editor).
 */
function VerbindungenInBibliothek({ inhalt }: { inhalt: PlanInhalt }) {
  const { aktiv, merke } = useBibliothek();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const zeilen = inhalt.verbindungen.filter((v) => v.bezeichnung.trim() !== "");
  if (!aktiv || zeilen.length === 0) return null;
  async function uebernimm() {
    if (laeuft) return;
    setLaeuft(true);
    const r = await importiereBibVerbindungenAction(zeilen.map((v) => ({ art: v.art, bezeichnung: v.bezeichnung })))
      .catch(() => ({ ok: false as const, fehler: "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal." }));
    setLaeuft(false);
    if (r.ok) { merke({ verbindungen: r.eintraege }); setMeldung(`${r.angelegt} angelegt, ${r.uebersprungen} schon vorhanden.`); }
    else setMeldung(r.fehler);
  }
  return (
    <div className="kp-formular-knoepfe">
      <Button onClick={() => void uebernimm()} loading={laeuft}>Verbindungen in Bibliothek übernehmen</Button>
      {meldung ? <p className="kp-hilfe" role="status">{meldung}</p> : null}
    </div>
  );
}
```

(Importe `importiereBibVerbindungenAction`, `useBibliothek`; `useState` ist schon da.)

`(intern)/p/[id]/page.tsx`: im Editor-Zweig `bibliothek={ladeBibliothek(getDb())}` an den `Editor` reichen (Import aus `@/app/m/kommplan/_lib/bibliothekDb`).

`_ui/kommplan.css` (außerhalb der Media-Blöcke):

```css
/* Bibliothek im Flyin (Phase 4, Entscheidung 13). Eigene Klassen, nie `kp-zeile` (dessen Raster in der Gliederung dreispaltig ist). */
.kp-aus-bibliothek { display: grid; gap: 4px; padding-bottom: 8px; border-bottom: 1px dashed var(--kp-rand); }
/* Auswahl und „Hinzufügen" nebeneinander, bei Platzmangel umbrechend — per flex-wrap, nicht per @media (Falle 13). */
.kp-bib-einheiten { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.kp-bib-einheiten > .kp-bib-einheiten-wahl { flex: 1 1 14rem; min-width: 0; }
```

(`.kp-bib-einheiten > .kp-bib-einheiten-wahl` sind zwei eigene Klassen am Wurzelelement des `Select` — keine Regel gegen einen `.ant-*`-Namen, Falle 20.)

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/`
Expected: PASS — auch die vorhandenen Flyin-, Editor- und Gliederungstests (ohne Anbieter `aktiv: false`, die neuen Felder erscheinen nicht).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
for f in Editor.tsx StelleFlyin.tsx EinheitenListe.tsx VerbindungWahl.tsx PlanFlyin.tsx GliederungZeile.tsx page.tsx kommplan.css; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
pnpm anker:drift src/app/m/kommplan/_ui/editor/Editor.tsx
git add src/app/m/kommplan/_ui/editor src/app/m/kommplan/_ui/gliederung "src/app/m/kommplan/(intern)/p/[id]/page.tsx" src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Bibliothek im Flyin einer Stelle

Aus Bibliothek und Titelvorschläge füllen die Stelle, In Bibliothek
übernehmen legt sie dort an oder aktualisiert sie; Einheiten und
Verbindungen lassen sich aus der Bibliothek holen und in sie übernehmen.
Jede Kopie ist ein Rückgängig-Schritt.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Gliederung — Bibliothek im Verbindungsfeld, Titelvorschläge, Alt+Enter

**Files:**
- Modify: `src/app/m/kommplan/_ui/gliederung/tasten.ts`, `verbindungsOptionen.ts`, `VerbindungFeld.tsx`, `GliederungZeile.tsx`, `Gliederung.tsx` (Befehl, Abgleich nach dem Einfügen, `onHinweis` mit Aktion)
- Modify: `src/app/m/kommplan/_ui/editor/Editor.tsx` (`onHinweis` reicht die Aktion durch — die Form steht seit Task 13)
- Modify: `src/app/m/kommplan/_lib/plan/gliederung.ts` (`MELDUNG.keinVorschlag`), `src/app/m/kommplan/_ui/kommplan.css` (`.kp-g-vorschlaege`)
- Modify: Bedienzeile der Gliederung (`GLIEDERUNG_BEDIENZEILE` in `Gliederung.tsx`) — „Alt+Enter übernimmt den ersten Vorschlag aus der Bibliothek" anhängen
- Test: `tasten.test.ts`, `verbindungsOptionen.test.ts`, `Gliederung.test.tsx`, `GliederungLast.test.tsx`, `src/app/m/kommplan/_ui/kommplan-css.test.ts`

**Interfaces:**
- Consumes: `stelleVorschlaege`, `uebernimmBibStelle`, `verbindeMitBibVerbindung`, `bibVerbindungenFuerPlan`, `bibStellenTreffer`, `BIB_OPTION` (Task 18); `useBibliothek`, `BibliothekKontext`, `BibliothekAnbieter`, `TitelVorschlaege` (Task 19); `Hinweis.aktion` (Task 13).
- Produces: `GliederungsBefehl` um `{ art: "bibliothek" }`; `verbindungsOptionen(inhalt, suche, bib?: readonly BibVerbindung[])`; `ZeilenBefehle.bibliothek(id: string, b: BibStelle): void`; `onHinweis(text, aktion?: { text: string; tu(): void })` der Gliederung. DOM: `TitelVorschlaege` an der aktiven Zeile (`.kp-g-vorschlaege[role="group"][aria-label="Vorschläge aus der Bibliothek"]`, Knöpfe `data-vorschlag=<bibId>` mit `tabIndex=-1`).

- [ ] **Step 1: Failing Tests schreiben**

`src/app/m/kommplan/_ui/gliederung/tasten.test.ts` anfügen:

```ts
  it("Alt+Enter übernimmt den ersten Bibliotheksvorschlag (Entscheidung 14) — gehalten nicht, mit Umschalt nicht; Enter bleibt Enter", () => {
    expect(gliederungsBefehl({ key: "Enter", altKey: true }, false)).toEqual({ art: "bibliothek" });
    expect(gliederungsBefehl({ key: "Enter", altKey: true, repeat: true }, false)).toBeNull();
    expect(gliederungsBefehl({ key: "Enter", altKey: true, shiftKey: true }, false)).toBeNull();
    expect(gliederungsBefehl({ key: "Enter" }, false)).toEqual({ art: "neu" });
  });
```

(Die Tastenform an die vorhandenen Fälle der Datei angleichen, etwa fehlende Felder als `false`.)

`src/app/m/kommplan/_ui/gliederung/verbindungsOptionen.test.ts` anfügen:

```ts
  it("Bibliotheksverbindungen, die der Plan nicht hat, stehen als „Aus Bibliothek“ da — gefiltert wie die übrigen", () => {
    const bib = [
      { id: "b1", art: "tmo" as const, bezeichnung: "R_UE_2", notiz: null }, // hat der Plan genau so → keine Option
      { id: "b2", art: "dmo" as const, bezeichnung: "DMO 609", notiz: null }, // hat der Plan nicht → Option
      { id: "b3", art: "tmo" as const, bezeichnung: "DMO 608", notiz: null }, // gleiche Bezeichnung, andere Art → Option
    ];
    const alle = verbindungsOptionen(PLAN, "", bib).map((o) => o.label);
    expect(alle).toContain("Aus Bibliothek: DMO 609 · Digitalfunk DMO");
    expect(alle).toContain("Aus Bibliothek: DMO 608 · Digitalfunk TMO");
    expect(alle.some((l) => l.startsWith("Aus Bibliothek: R_UE_2"))).toBe(false);
    expect(verbindungsOptionen(PLAN, "609", bib).map((o) => o.value)).toContain("~bib:b2");
    expect(verbindungsOptionen(PLAN, "xyz", bib).some((o) => o.value.startsWith("~bib:"))).toBe(false);
  });
```

(`PLAN` = der Testplan der Datei: R_UE_2 als TMO und DMO 608 als DMO — deshalb ist `b2` eine Verbindung, die er nicht hat, und `b3` prüft „andere Art → Option".)

In `src/app/m/kommplan/_ui/gliederung/Gliederung.test.tsx`:
1. Mock von `_actions/bibliothek` ergänzen (Task 19, „Mocks zuerst"). `Pruefstand` bekommt eine optionale Prop `bib` und legt die Gliederung in `<BibliothekKontext.Provider value={{ aktiv: bib !== undefined, bib: bib ?? LEERE_BIBLIOTHEK, merke: () => {} }}>`; die Fälle unten mounten mit
   ```ts
   const BIB = { stellen: [
     { id: "b1", titel: "Leitstelle Uelzen", zeichen: null, leiter: "Disponent", kontakte: [{ art: "telefon" as const, wert: "0581 1" }], notiz: null },
     { id: "b2", titel: "Feuerwehr-Leitstelle", zeichen: null, leiter: null, kontakte: [], notiz: null },
   ], einheiten: [], verbindungen: [] };
   ```
2. Anfügen:

```tsx
describe("Bibliothek in der Gliederung (Entscheidung 14)", () => {
  it("Vorschläge nur an der aktiven Zeile, ab 2 Zeichen; Enter legt trotzdem die nächste Stelle an", async () => {
    await mount(<Pruefstand start={START} bib={BIB} />);
    await fokus("ea1");
    await schreibe(feld("ea1"), "Leit");
    expect(queryAll('[role="group"][aria-label="Vorschläge aus der Bibliothek"]')).toHaveLength(1);
    expect(query('[data-zeile="ea1"] .kp-g-vorschlaege').textContent).toContain("Leitstelle Uelzen · Disponent");
    const vorher = titel().length;
    await taste(feld("ea1"), "Enter");
    expect(titel().length).toBe(vorher + 1); // Enter gehört weiter dem Anlegen
  });
  it("Klick auf einen Vorschlag: mousedown wird verhindert (Fokus bleibt im Titel), die Stelle wird in EINEM Schritt gefüllt", async () => {
    await mount(<Pruefstand start={START} bib={BIB} />);
    await fokus("ea1");
    await schreibe(feld("ea1"), "Leit");
    const knopf = query<HTMLButtonElement>('[data-vorschlag="b1"]');
    const unten = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => { knopf.dispatchEvent(unten); });
    expect(unten.defaultPrevented).toBe(true);
    await clickElement(knopf);
    expect(stand.jetzt.stellen.find((s) => s.id === "ea1")).toMatchObject({ titel: "Leitstelle Uelzen", leiter: "Disponent" });
    expect(aktiv()).toBe(feld("ea1"));
    expect(queryAll('[data-zeile="ea1"] .kp-g-vorschlaege')).toHaveLength(0); // trägt ihn jetzt
    await taste(feld("ea1"), "z", { ctrlKey: true }); // EIN Schritt: Strg+Z holt das Getippte zurück, nicht weniger
    expect(feld("ea1").value).toBe("Leit");
  });
  it("Alt+Enter nimmt den ersten Vorschlag; ohne Vorschlag ein Hinweis", async () => {
    await mount(<Pruefstand start={START} bib={BIB} />);
    await fokus("ea2");
    await schreibe(feld("ea2"), "leitst");
    await taste(feld("ea2"), "Enter", { altKey: true });
    expect(feld("ea2").value).toBe("Leitstelle Uelzen");
    await schreibe(feld("ea2"), "zz");
    await taste(feld("ea2"), "Enter", { altKey: true });
    expect(meldung()).toContain("Kein Vorschlag aus der Bibliothek.");
  });
  it("eingefügte Gliederung: Titel, die genau so in der Bibliothek stehen und deren Angaben noch fehlen, werden angeboten — „Angaben übernehmen“ füllt alle in EINEM Schritt", async () => {
    await mount(<Pruefstand start={START} bib={BIB} />);
    await fokus("ea1");
    await einfuegen(feld("ea1"), "Leitstelle Uelzen\n\tFeuerwehr-Leitstelle\n\tTrupp");
    // „Feuerwehr-Leitstelle“ steht auch in der Bibliothek, trägt dort aber nichts, was die eingefügte Zeile nicht schon trägt.
    expect(meldung()).toContain("1 Stelle steht so in der Bibliothek.");
    await clickElement(knopf("Angaben übernehmen"));
    const leit = stand.jetzt.stellen.find((s) => s.titel === "Leitstelle Uelzen")!;
    expect(leit).toMatchObject({ leiter: "Disponent", kontakte: [{ art: "telefon", wert: "0581 1" }] });
    await taste(feld(leit.id), "z", { ctrlKey: true }); // EIN Schritt zurück: die Angaben fallen, die eingefügten Zeilen bleiben
    expect(stand.jetzt.stellen.find((s) => s.id === leit.id)).toMatchObject({ titel: "Leitstelle Uelzen", leiter: null });
  });
});
```

(`einfuegen` und `knopf` sind die Helfer der Datei für das mehrzeilige Einfügen aus Phase 3 bzw. aus Task 9 — sonst nach deren Muster ein `paste`-Ereignis mit `clipboardData` absetzen. `meldung()` liest den Hinweis samt Aktionsknopf; `Pruefstand` muss `onHinweis` mit `aktion` an seine Meldung reichen — die vorhandene Hilfe um den Knopf erweitern.)

(Strg+Z im Titel ist in der Gliederung das Rückgängig des Dokuments, Phase-3-Entscheidung 10; das Tippen von „Leit" ist ein gebündelter Schritt, die Übernahme ein zweiter.)

`src/app/m/kommplan/_ui/gliederung/GliederungLast.test.tsx` anfügen:

```tsx
  it("mit Bibliothek im Kontext: Tippen im Flyin rendert weiter nur die eine Zeile — auch die Kontext-Leser (Entscheidung 14)", async () => {
    const BIB = { stellen: Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, titel: `Bib ${i}`, zeichen: null, leiter: null, kontakte: [], notiz: null })), einheiten: [], verbindungen: [{ id: "bv", art: "dmo" as const, bezeichnung: "DMO 1", notiz: null }] };
    await mount(<BibliothekAnbieter start={BIB}><Pruefstand /></BibliothekAnbieter>);
    await act(async () => {});
    renders.n = 0;
    renders.bib = 0;
    for (let i = 0; i < 5; i++) await act(async () => { query<HTMLButtonElement>("[data-flyin-tippen]").click(); });
    expect(renders.n).toBeLessThanOrEqual(5);
    // Kontext-Leser: je Taste die Gliederung selbst und das Verbindungsfeld der geänderten Zeile — nicht 61 Felder.
    expect(renders.bib).toBeLessThanOrEqual(10);
  });
```

Dazu oben in der Datei den Mock von `_actions/bibliothek` ergänzen (Task 19), `renders` um `bib: 0` erweitern und `useBibliothek` zählen, ohne den Kontext zu ersetzen:

```tsx
vi.mock("../editor/bibliothekKontext", async (orig) => {
  const m = await orig<typeof import("../editor/bibliothekKontext")>();
  return { ...m, useBibliothek: () => { renders.bib++; return m.useBibliothek(); } };
});
import { BibliothekAnbieter } from "../editor/bibliothekKontext";
```

(Jeder Leser — `Gliederung`, `VerbindungFeld`, `TitelVorschlaege`, `EinheitenListe`, `VerbindungWahl`, `StelleFormular` — ruft `useBibliothek`; der Zähler zählt also genau deren Renders. Gegenprobe: `BibliothekAnbieter` ohne `useMemo` — ein neuer Wert je Rendern — macht den Fall rot.)

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/gliederung`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`tasten.ts`: `GliederungsBefehl` um `| { art: "bibliothek" }` erweitern; im `altKey`-Zweig als **ersten** Fall `if (t.key === "Enter") return t.repeat ? null : { art: "bibliothek" };`; den Kopfkommentar in derselben Zeile („Alt+E/Alt+F bewusst nicht.") zu „Alt+E/Alt+F bewusst nicht; Alt+Enter übernimmt den ersten Bibliotheksvorschlag (Phase 4)." ergänzen.

`verbindungsOptionen.ts`: Signatur `verbindungsOptionen(inhalt: PlanInhalt, suche: string, bib: readonly BibVerbindung[] = [])`; nach `vorhanden`:

```ts
  const ausBib = bibVerbindungenFuerPlan(inhalt, bib)
    .filter((b) => klein === "" || b.bezeichnung.toLocaleLowerCase("de").includes(klein))
    .map((b) => ({ value: `${BIB_OPTION}${b.id}`, label: `Aus Bibliothek: ${b.bezeichnung} · ${ART_NAME[b.art]}` }));
  if (text === "") return [...keine, ...vorhanden, ...ausBib];
```

und im Rückgabewert am Ende `[...keine, ...vorhanden, ...ausBib, ...neu]`.

`VerbindungFeld.tsx`: `const { aktiv: mitBib, bib } = useBibliothek();` **direkt nach** `const [suche, setSuche] = useState("");` und damit **vor** dem frühen Rücksprung `if (stelle.eltern === null) return …` — dahinter wäre es ein bedingter Hook (`react-hooks/rules-of-hooks`) und brächte die Zählung in `GliederungLast.test.tsx` durcheinander; im `options`-Aufruf `verbindungsOptionen(inhalt, suche, mitBib ? bib.verbindungen : [])`; am Anfang von `waehle`:

```tsx
    const ausBib = wert.startsWith(BIB_OPTION) ? bib.verbindungen.find((b) => `${BIB_OPTION}${b.id}` === wert) : undefined;
    if (ausBib) {
      aendere((q) => verbindeMitBibVerbindung(q, stelle.id, ausBib, neueId(q, "v")));
      setSuche(""); onOffen(false); onFertig();
      return;
    }
```

`TitelVorschlaege.tsx` steht seit Task 19 (Vorgabe `tabStopps = false` — in der Gliederung gehört Tab dem Einrücken).

`GliederungZeile.tsx`: `ZeilenBefehle` um `bibliothek(id: string, b: BibStelle): void` ergänzen; in `ZeileInnen` direkt nach dem schließenden `</div>` von `.kp-g-haupt`:

```tsx
      {p.aktiv ? <TitelVorschlaege stelle={s} onWahl={(b) => befehle.current!.bibliothek(id, b)} /> : null}
```

`Gliederung.tsx`:
1. `const { bib } = useBibliothek();`
2. Eine Hilfe `uebernimmBib(id, b)`: `if (tueMit((q) => uebernimmBibStelle(q, id, b)) === null) return; if (b.zeichen) p.ladeSymbole([b.zeichen]); fokussiere(id, "ende");` — das mitgebrachte Zeichen lädt der Kopierweg selbst (Entscheidung 13). Im `befehle`-Objekt: `bibliothek: (id, b) => uebernimmBib(id, b),`
3. In `taste` im `switch (b.art)`:
   ```tsx
      case "bibliothek": {
        const v = stelleVorschlaege(bib.stellen, z.stelle)[0];
        if (!v) { p.onHinweis(MELDUNG.keinVorschlag); return; }
        uebernimmBib(id, v);
        return;
      }
   ```
3a. **Abgleich nach dem Einfügen** (in der Einfüge-Behandlung, nach `fuegeGliederungEin` und dem Fokus auf die letzte neue Zeile):
   ```tsx
    // Entscheidung 14: eingefügte Titel, die genau so in der Bibliothek stehen, blieben sonst leer — und nichts wiese darauf hin.
    const treffer = nach && ids.length > 0 ? bibStellenTreffer(nach, ids, bib.stellen) : [];
    if (treffer.length > 0) {
      p.onHinweis(`${treffer.length} ${treffer.length === 1 ? "Stelle steht" : "Stellen stehen"} so in der Bibliothek.`, {
        text: "Angaben übernehmen",
        tu: () => { tueMit((q) => treffer.reduce((x, t) => uebernimmBibStelle(x, t.stelleId, t.b), q)); p.ladeSymbole(treffer.flatMap((t) => (t.b.zeichen ? [t.b.zeichen] : []))); },
      });
    }
   ```
   (`tueMit` ist ein `aendere` ohne Bündelschlüssel — alle Treffer sind EIN Rückgängig-Schritt. Die Prop `onHinweis` bekommt den optionalen zweiten Parameter; `Editor.tsx` reicht ihn als `aktion` in den Hinweis, Task 13.)
4. `GLIEDERUNG_BEDIENZEILE` um „ · Alt+Enter übernimmt den ersten Vorschlag aus der Bibliothek" ergänzen (Zeichenkette in derselben Zeile; die Telefonzeile bleibt).

`_lib/plan/gliederung.ts`, `MELDUNG`: `keinVorschlag: "Kein Vorschlag aus der Bibliothek.",` ergänzen.

`_ui/kommplan.css` (außerhalb der Media-Blöcke):

```css
/*
 * Titelvorschläge (Phase 4, Entscheidung 14), in der Gliederung unter der aktiven Zeile und im Flyin unter dem
 * Titel. KEIN Ebenenterm: die Vorschläge stehen IN `.kp-g-zeile`, die schon um die Ebene eingerückt ist — ein
 * zweiter Ebenenterm rückte doppelt ein (am Telefon bei Ebene 10 fast die ganze Breite). Einzeilig mit fester
 * Höhe und waagerecht scrollbar: die Zeilen darunter springen beim Tippen nicht um Knopfzeilen.
 */
.kp-g-vorschlaege { display: flex; flex-wrap: nowrap; gap: 8px; align-items: center; overflow-x: auto; overscroll-behavior-x: contain; padding: 4px 8px; }
.kp-g-vorschlaege > * { flex: none; }
```

und im vorhandenen Block `@media (max-width: 767.98px)`: `.kp-vorschlag-hinweis { display: none; }` (Bildschirmtastaturen haben kein Alt; die Knöpfe sprechen für sich — kein eigener `(pointer: coarse)`-Block, Global Constraints). Fluchten die Vorschläge in der Gliederung sichtbar schlecht mit dem Titelfeld, den Einzug als feste Zahl aus `.kp-g-haupt` ableiten (Innenabstand plus Breite des Zeichenknopfs und Lücke) — nie mit `--ebene`.

`src/app/m/kommplan/_ui/kommplan-css.test.ts` anfügen:

```ts
  it("Titelvorschläge: ohne Ebenenterm (stehen schon in der eingerückten Zeile), einzeilig, am Telefon ohne Alt-Hinweis", () => {
    const regel = /\.kp-g-vorschlaege \{([^}]*)\}/.exec(css)![1];
    expect(regel).not.toMatch(/--ebene/);
    expect(regel).toMatch(/flex-wrap: nowrap/);
    expect(regel).toMatch(/overflow-x: auto/);
    expect(css).toMatch(/@media \(max-width: 767\.98px\) \{[\s\S]*\.kp-vorschlag-hinweis \{ display: none; \}/);
  });
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
for f in tasten.ts verbindungsOptionen.ts VerbindungFeld.tsx GliederungZeile.tsx Gliederung.tsx gliederung.ts kommplan.css kommplan-css.test.ts Editor.tsx; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
pnpm anker:drift src/app/m/kommplan/_ui/gliederung/Gliederung.tsx
git add src/app/m/kommplan/_ui/gliederung src/app/m/kommplan/_lib/plan/gliederung.ts src/app/m/kommplan/_ui/kommplan.css src/app/m/kommplan/_ui/kommplan-css.test.ts src/app/m/kommplan/_ui/editor/Editor.tsx
git commit -S -m "feat(kommplan): Bibliothek in der Gliederung — Vorschläge und Verbindungen

Beim Tippen eines Titels stehen passende Stellen aus der Bibliothek unter
der Zeile; ein Klick oder Alt+Enter übernimmt sie, Enter und Tab bleiben
unberührt. Nach dem Einfügen einer Gliederung lassen sich die Angaben
gleichnamiger Bibliotheksstellen in einem Schritt übernehmen. Das
Verbindungsfeld bietet Verbindungen aus der Bibliothek an.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Griffe in eine Auswahlleiste oben in der Fläche (Phase-3-Entscheidung 18, bestätigt)

> Abgeleitet aus dem **heutigen** Code (Phase-3-Plan Task 5 blieb unumgesetzt, U1; danach U2/U25): Griffe an der Karte mit `KOMPAKT`-Token, `.kp-griff-seite`/`.kp-griffleiste`, `GRIFF_RAND = { oben: 16, seite: 104, unten: 120 }`, e2e-Literal `104` im Test „gezoomt …".

**Files:**
- Modify: `src/app/m/kommplan/_ui/editor/Griffe.tsx` (ganz), `src/app/m/kommplan/_ui/editor/Editor.tsx` (`GRIFF_RAND` samt Kommentar, `platzOben`), `src/app/m/kommplan/_ui/betrachter/Flaeche.tsx` (`platzOben`, `[data-auswahlleiste]` in `ausgenommen`), `src/app/m/kommplan/_ui/kommplan.css`
- Modify: `e2e/kommplan-editor.spec.ts` (`ganzInDerFlaeche`, Fototest, „gezoomt …", neuer Fall Auswahlleiste)
- Modify: `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§6.3, erster Punkt)
- Test: `src/app/m/kommplan/_ui/kommplan-css.test.ts`, `src/app/m/kommplan/_ui/editor/Editor.test.tsx`, `src/app/m/kommplan/_ui/betrachter/Flaeche.test.tsx`, `src/app/m/kommplan/_ui/editor/Griffe.test.tsx` (**ganz ersetzt** — die heutigen Fälle prüfen `.kp-griffleiste` und das Inline-`top` der Seitengriffe, beides gibt es danach nicht mehr)

**Interfaces:**
- Produces: `AUSWAHLLEISTE = { abstand: 8, hoehe: 56 } as const` (`Griffe.tsx`); `GRIFF_RAND = { oben: AUSWAHLLEISTE.abstand + AUSWAHLLEISTE.hoehe + 8, seite: 16, unten: 72 }` (also 72/16/72); `Flaeche`-Prop `platzOben?: number`. DOM: `[data-griffe=<id>]` enthält `.kp-griffe-karte` (nur `.kp-auswahlrahmen`) und `.kp-auswahlleiste[data-auswahlleiste][role="group"][aria-label="Auswahl: <Titel>"]` mit `.kp-auswahl-name` und den Knöpfen in der Reihenfolge `bearbeiten`, `unter`, `einheit`, `links`, `rechts` (Seitenstelle: `bearbeiten`, `einheit`). `data-griff`-Werte und Seitengriff-`aria-label`s bleiben.

- [ ] **Step 1: Tests anpassen bzw. schreiben**

`src/app/m/kommplan/_ui/kommplan-css.test.ts`: den Fall „der seitliche Griff bricht nicht um …" ersetzen durch

```ts
  it("Auswahlleiste oben links in der Fläche, feste Höhe: bricht nie um, scrollt am Telefon waagerecht mit Schattenkante, Name dort ausgeblendet (Phase 3, Entscheidung 18)", () => {
    expect(css).toMatch(/\.kp-auswahlleiste \{[^}]*position: absolute; top: 8px; left: 8px/);
    expect(css).toMatch(/\.kp-auswahlleiste \{[^}]*flex-wrap: nowrap/);
    expect(css).toMatch(/\.kp-auswahlleiste \{[^}]*overflow-x: auto/);
    expect(css).toMatch(/\.kp-auswahlleiste \{[^}]*background-attachment: local, local, scroll, scroll/); // Schattenkante nur, solange etwas verborgen ist
    expect(css).toMatch(/\.kp-auswahl-name \{[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/@media \(max-width: 767\.98px\) \{[\s\S]*\.kp-auswahl-name \{ display: none; \}/);
    expect(css).not.toMatch(/\.kp-griffleiste|\.kp-griff-seite|\.kp-griff-links|\.kp-griff-rechts/);
  });
  it("Rand der Auswahlleiste hebt sich ab (WCAG 1.4.11): mindestens 3:1 gegen ihre Fläche, hell und dunkel", () => {
    const hell = /:root \{[^}]*--kp-leiste-flaeche: (#[0-9a-f]{6});[^}]*--kp-leiste-rand: (#[0-9a-f]{6});/i.exec(css);
    const dunkel = /:root\[data-theme="dark"\] \{[^}]*--kp-leiste-flaeche: (#[0-9a-f]{6});[^}]*--kp-leiste-rand: (#[0-9a-f]{6});/i.exec(css);
    expect(hell && dunkel).toBeTruthy();
    expect(kontrast(hell![2], hell![1])).toBeGreaterThanOrEqual(3);
    expect(kontrast(dunkel![2], dunkel![1])).toBeGreaterThanOrEqual(3);
  });
```

(`kontrast` steht schon in der Datei. Steht `:root[data-theme="dark"]` dort in anderer Form, den Regex an die Datei anpassen, nicht die Datei an den Regex.)

`src/app/m/kommplan/_ui/editor/Editor.test.tsx`: Importe ergänzen (`GRIFF_RAND` in die Zeile aus `./Editor`, neu `import { AUSWAHLLEISTE } from "./Griffe";`); im Fall „Klick wählt eine Karte und zeigt ihre Griffe …" die Reihenfolge auf `["bearbeiten", "unter", "einheit", "links", "rechts"]` ändern; anfügen:

```tsx
  it("Griffe stehen in der Auswahlleiste oben in der Fläche, an der Karte nur der Auswahlrahmen (Phase 4, Entscheidung 15)", async () => {
    await zeige();
    await waehle("a");
    expect(queryAll('[data-griffe="a"] .kp-griffe-karte > *').map((e) => e.className)).toEqual(["kp-auswahlrahmen"]);
    const leiste = query('[data-griffe="a"] .kp-auswahlleiste');
    expect(leiste.getAttribute("role")).toBe("group"); // jeder Knopf ein Tabstopp — keine Pfeiltasten-Bedienung, die „toolbar" verspräche
    expect(leiste.getAttribute("aria-label")).toBe("Auswahl: EA 1");
    expect(leiste.querySelector(".kp-auswahl-name")!.textContent).toBe("EA 1");
    expect(leiste.querySelectorAll("[data-griff]")).toHaveLength(5);
    expect(GRIFF_RAND).toEqual({ oben: AUSWAHLLEISTE.abstand + AUSWAHLLEISTE.hoehe + 8, seite: 16, unten: 72 });
  });
  it("ein Zeiger auf Name oder Rand der Auswahlleiste ist kein Klick ins Leere: Auswahl und Flyin bleiben", async () => {
    await zeige();
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("F2");
    expect(flyinOffen()).toBe(true);
    uhr += 10_000;
    const name = query(".kp-auswahl-name");
    await act(async () => { zeiger(name, "pointerdown", uhr); zeiger(name, "pointerup", uhr + 10); });
    expect(exists('[data-griffe="a"]')).toBe(true);
    expect(flyinOffen()).toBe(true);
  });
```

`src/app/m/kommplan/_ui/editor/Griffe.test.tsx` **ganz ersetzen**:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { KarteL } from "../../_lib/layout/typen";
import type { Ansicht } from "../betrachter/ansicht";
import { AUSWAHLLEISTE, Griffe } from "./Griffe";

const KARTE = { id: "a", x: 100, y: 50, breite: 60, hoehe: 20, titelVoll: "EA 1" } as unknown as KarteL;
const zeige = async (seitenstelle = false, breite = 800) => {
  await mount(<Griffe karte={KARTE} ansicht={{ x: 0, y: 0, massstab: 1 } as Ansicht} flaeche={{ breite, hoehe: 600 }} seitenstelle={seitenstelle}
    onUnterstelle={() => {}} onSeitenstelle={() => {}} onEinheit={() => {}} onBearbeiten={() => {}} />);
  await act(async () => {});
};
const griffe = () => queryAll("[data-griff]").map((g) => g.getAttribute("data-griff"));

afterEach(async () => { await unmount(); });

describe("Griffe in der Auswahlleiste (Phase 3, Entscheidung 18; Phase 4, Entscheidung 15)", () => {
  it("Reihenfolge: Bearbeiten zuerst (am Telefon im Bild), dann + Unterstelle, + Einheit, + links, + rechts", async () => {
    await zeige();
    expect(griffe()).toEqual(["bearbeiten", "unter", "einheit", "links", "rechts"]);
  });
  it("eine Seitenstelle trägt nichts (§4.2): nur Bearbeiten und + Einheit", async () => {
    await zeige(true);
    expect(griffe()).toEqual(["bearbeiten", "einheit"]);
  });
  it("die Leiste ist höchstens so breit wie die Fläche abzüglich beider Abstände", async () => {
    await zeige(false, 390);
    expect(query(".kp-auswahlleiste").style.maxWidth).toBe(`${390 - 2 * AUSWAHLLEISTE.abstand}px`);
  });
  it("an der Karte hängt nur der Auswahlrahmen; die Leiste ist eine Gruppe mit dem Namen der Stelle", async () => {
    await zeige();
    expect(queryAll(".kp-griffe-karte > *").map((e) => e.className)).toEqual(["kp-auswahlrahmen"]);
    expect(query(".kp-auswahlleiste").getAttribute("role")).toBe("group");
    expect(query(".kp-auswahlleiste").getAttribute("aria-label")).toBe("Auswahl: EA 1");
  });
});
```

`src/app/m/kommplan/_ui/betrachter/Flaeche.test.tsx` anfügen:

```tsx
  it("platzOben: die eingepasste Zeichnung beginnt so weit unter der Oberkante (Platz für die Auswahlleiste)", async () => {
    await zeige({ platzOben: 72 });
    expect(query("[data-ansicht]").getAttribute("transform")).toMatch(/^translate\([-\d.]+ 72\)/);
  });
```

(Vorher in `_ui/betrachter/ansicht.ts` prüfen, dass `einpassen` bei Fläche 0 × 0 `y: rand` liefert — Stand der Planung: ja; `zeige` in der Testdatei nimmt Props — sonst die vorhandene Mount-Hilfe um `platzOben` erweitern.)

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/kommplan-css.test.ts src/app/m/kommplan/_ui/editor/Editor.test.tsx src/app/m/kommplan/_ui/editor/Griffe.test.tsx src/app/m/kommplan/_ui/betrachter/Flaeche.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `Flaeche` bekommt `platzOben`**

In `Flaeche.tsx`: Prop `platzOben?: number` in Destrukturierung und Typ; im Aufruf `einpassen(…, { max: maxMassstab, seite: platzSeite, unten: platzUnten })` vorn `rand: platzOben,` ergänzen (`undefined` fällt in `einpassen` auf 16). In `ausgenommen` den Selektor um `[data-auswahlleiste]` ergänzen (neben `[data-meldung]`, dieselbe Zeile). Im Kopfkommentar, der `platzUnten` „für die Griffleiste" nennt, **in derselben Zeile** „für Meldungsplatz und Auswahlleiste" schreiben.

- [ ] **Step 4: `Griffe.tsx` neu schreiben**

```tsx
"use client";

import { Button, ConfigProvider, Tooltip, type ThemeConfig } from "antd";
import type { KarteL } from "../../_lib/layout/typen";
import type { Ansicht } from "../betrachter/ansicht";

/**
 * Lage der Auswahlleiste: `abstand` px vom oberen und linken Rand der Fläche, `hoehe` = 44 px Knopf
 * (FullShell, Falle 4) + 2 × (5 px Innenabstand + 1 px Rand). Die Leiste bricht nie um — nur so ist ihre
 * Höhe fest, und der Editor kann sie beim Einpassen freihalten (`GRIFF_RAND.oben`).
 */
export const AUSWAHLLEISTE = { abstand: 8, hoehe: 56 } as const;
/** Kompakt über den Button-Token (Falle 5: Token statt CSS; die Höhe bleibt 44 px) — die Leiste ist so am Telefon kürzer. */
const KOMPAKT: ThemeConfig = { components: { Button: { paddingInline: 10 } } };

/**
 * GRIFFE DER AUSWAHL (Spec §6.3; Phase 3, Entscheidung 18 — vom Hauptlauf bestätigt; Phase 4, Entscheidung 15).
 * An der Karte steht nur der Auswahlrahmen; er liegt im Abstand zwischen den Karten. Alle Griffe stehen in der
 * AUSWAHLLEISTE oben links in der Fläche: an der Karte gibt es geometrisch keinen Platz für 44-px-Ziele, ohne
 * Nachbarkarten, Einheiten oder Kanalsechsecke zu verdecken (am Tablet sind zwei Karten ≈ 15 px auseinander).
 * Eingepasst hält die Fläche den Streifen der Leiste frei (`platzOben`); gezoomt holt `zeige()` die gewählte
 * Karte unter die Leiste. Seitengriffe „+ links"/„+ rechts" mit Tooltip bei Zeigen und Fokus; eine
 * Seitenstelle trägt nichts (§4.2): dort nur „Bearbeiten" und „+ Einheit". „Bearbeiten" steht VORN: am Telefon
 * liegt das Ende der Leiste außerhalb des Bildes, und dort ist das Diagramm für kleine Korrekturen da (§6.5).
 * `role="group"`, nicht „toolbar": jeder Knopf ist ein eigener Tabstopp, Pfeiltasten tun nichts — eine Toolbar
 * verspräche Screenreadern ein Bedienmuster, das hier nicht gebaut ist.
 */
export function Griffe({ karte, ansicht, flaeche, seitenstelle, onUnterstelle, onSeitenstelle, onEinheit, onBearbeiten }: {
  karte: KarteL; ansicht: Ansicht; flaeche: { breite: number; hoehe: number }; seitenstelle: boolean;
  onUnterstelle: () => void; onSeitenstelle: (seite: "links" | "rechts") => void; onEinheit: () => void; onBearbeiten: () => void;
}) {
  const m = ansicht.massstab;
  const titel = karte.titelVoll === "" ? "(ohne Titel)" : karte.titelVoll;
  const seitlich = (seite: "links" | "rechts") => (
    <Tooltip title={`Seitenstelle ${seite} anlegen — waagerecht, ohne Bus`} trigger={["hover", "focus"]}>
      <Button data-griff={seite} aria-label={`Seitenstelle ${seite} von ${titel} anlegen`} onClick={() => onSeitenstelle(seite)}>{`+ ${seite}`}</Button>
    </Tooltip>
  );
  return (
    <ConfigProvider theme={KOMPAKT}>
      <div className="kp-griffe" data-griffe={karte.id}>
        <div className="kp-griffe-karte" style={{ left: ansicht.x + karte.x * m, top: ansicht.y + karte.y * m, width: karte.breite * m, height: karte.hoehe * m }}>
          <div className="kp-auswahlrahmen" aria-hidden="true" />
        </div>
        <div className="kp-auswahlleiste" data-auswahlleiste="" role="group" aria-label={`Auswahl: ${titel}`}
          style={{ maxWidth: Math.max(0, flaeche.breite - 2 * AUSWAHLLEISTE.abstand) }}>
          <span className="kp-auswahl-name" title={titel}>{titel}</span>
          <Button data-griff="bearbeiten" onClick={onBearbeiten}>Bearbeiten</Button>
          {seitenstelle ? null : <Button data-griff="unter" onClick={onUnterstelle}>+ Unterstelle</Button>}
          <Button data-griff="einheit" onClick={onEinheit}>+ Einheit</Button>
          {seitenstelle ? null : <>{seitlich("links")}{seitlich("rechts")}</>}
        </div>
      </div>
    </ConfigProvider>
  );
}
```

(`flaeche.breite` ist die Breite der Überlagerung — schon ohne den vom Flyin verdeckten Teil; mit U10 der Phase 2 hält der Editor die Flyin-Breite ohnehin frei.)

- [ ] **Step 5: `GRIFF_RAND` und `platzOben` im Editor**

In `Editor.tsx` Kommentar und Konstante ersetzen (Code, kein Aufräumen — die Zeilenzahl darf sich ändern; Ankerschritt unten):

```ts
/**
 * Luft um eine gezeigte Karte (Phase 3, Entscheidung 18; Phase 4, Entscheidung 15): oben die Auswahlleiste
 * (`AUSWAHLLEISTE`) plus 8 px, seitlich nur der Auswahlrahmen (4 px außen) plus Luft, unten der Meldungsplatz
 * (12 px + eine Alert-Zeile + Luft). Dieselben Zahlen gibt der Editor der Fläche fürs Einpassen (`platzOben`,
 * `platzSeite`, `platzUnten`): eingepasst liegt die Leiste über keiner Karte, `zeige()` verschiebt nichts,
 * die Ansicht bleibt eingepasst (Phase 2, Entscheidung 18); gezoomt hält `zeige()` die Karte unter der Leiste.
 */
export const GRIFF_RAND = { oben: AUSWAHLLEISTE.abstand + AUSWAHLLEISTE.hoehe + 8, seite: 16, unten: 72 };
```

Import: `import { AUSWAHLLEISTE, Griffe } from "./Griffe";`. An der `<Flaeche …>`: `platzOben={GRIFF_RAND.oben}` neben `platzSeite`/`platzUnten`.

- [ ] **Step 6: CSS**

In `src/app/m/kommplan/_ui/kommplan.css`:
1. In `:root` (nebeneinander, in dieser Reihenfolge): `--kp-leiste-flaeche: #ffffff; --kp-leiste-rand: #6b7280; --kp-leiste-schatten: rgba(0, 0, 0, .28);`
2. In `:root[data-theme="dark"]`: `--kp-leiste-flaeche: #1f242c; --kp-leiste-rand: #8a94a3; --kp-leiste-schatten: rgba(0, 0, 0, .7);` (reicht der Kontrast nicht, den Rand heller wählen, nicht den Test lockern).
3. Den Kommentarblock „Editor: Griffe über der Fläche …" so umschreiben, dass er die Auswahlleiste nennt (Falle 5/20 bleiben erwähnt); die Regeln `.kp-griffe .kp-griff-seite`, `.kp-griffe .kp-griff-links`, `.kp-griffe .kp-griff-rechts`, `.kp-griffleiste` und den Kommentar „`top` setzt Griffe.tsx …" entfernen; `.kp-griffe`, `.kp-griffe-karte`, `.kp-griffe button` und `.kp-auswahlrahmen` bleiben. Neu:

```css
/*
 * Auswahlleiste (Phase 3, Entscheidung 18; Phase 4, Entscheidung 15): alle Griffe oben links in der Fläche, nie
 * an der Karte. Feste Höhe (bricht nie um, am Telefon waagerecht scrollbar), damit die Fläche sie beim
 * Einpassen freihalten kann (Griffe.tsx, AUSWAHLLEISTE; Editor.tsx, GRIFF_RAND). Knöpfe ohne size (Falle 4).
 */
.kp-auswahlleiste {
  position: absolute; top: 8px; left: 8px; display: flex; flex-wrap: nowrap; align-items: center; gap: 4px;
  padding: 5px 6px; overflow-x: auto; overscroll-behavior-x: contain; pointer-events: auto;
  border: 1px solid var(--kp-leiste-rand); border-radius: 8px; box-shadow: 0 1px 4px rgba(0, 0, 0, .25);
  /* Schattenkante, solange waagerecht etwas verborgen ist: zwei Deckflächen wandern mit dem Inhalt (local),
     zwei Schatten bleiben am Rand (scroll) — reines CSS, kein Skript. */
  background:
    linear-gradient(to right, var(--kp-leiste-flaeche) 30%, transparent),
    linear-gradient(to left, var(--kp-leiste-flaeche) 30%, transparent) 100% 0,
    radial-gradient(farthest-side at 0 50%, var(--kp-leiste-schatten), transparent),
    radial-gradient(farthest-side at 100% 50%, var(--kp-leiste-schatten), transparent) 100% 0;
  background-color: var(--kp-leiste-flaeche);
  background-repeat: no-repeat;
  background-size: 32px 100%, 32px 100%, 12px 100%, 12px 100%;
  background-attachment: local, local, scroll, scroll;
}
.kp-auswahlleiste > * { flex: none; }
.kp-auswahl-name { max-width: 18ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; padding-inline: 4px; }
```

und im vorhandenen Block `@media (max-width: 767.98px)`: `.kp-auswahl-name { display: none; }` (das `aria-label` der Leiste trägt den Namen weiter; am Telefon zählt jeder Pixel der Leiste).

- [ ] **Step 7: Unit-Tests grün**

Run: `pnpm vitest run src/app/m/kommplan/_ui/`
Expected: PASS. Schlägt ein Editor-Test an einer Lage fehl, die Zahl an `GRIFF_RAND` binden, nicht die Konstante an den Test.

- [ ] **Step 8: Editor-e2e anpassen und den Überdeckungsfall ergänzen**

In `e2e/kommplan-editor.spec.ts`:
1. `ganzInDerFlaeche`: als erste Zeile `await el.scrollIntoViewIfNeeded();` (die Leiste scrollt am Telefon waagerecht) und nach `const b = …` ergänzen: `expect(b.y, \`${was}: oben\`).toBeGreaterThanOrEqual(rahmen.y);`.
2. Fototest: `"Griffleiste ea2"` → `"Auswahlleiste ea2"`; der Kommentar „Die Griffe der gewählten Karte decken am Telefon Nachbarkarten ab: erst abwählen (Esc), dann" wird **in derselben Zeile** zu „Erst abwählen (Esc), dann" (die Folgezeile schließt den Satz); der Kommentar „ihre Griffe (Leiste und seitliche „+") ganz im Bild (Kritik)" **in derselben Zeile** zu „ihre Griffe in der Auswahlleiste ganz im Bild (Kritik)".
3. Test „gezoomt: Enter holt die Karte an den freien Rand …": `GRIFF_RAND.seite` ist jetzt 16. Im Kommentar „(104 px)" → „(16 px)" und **beide** Literale `104` → `16`.
4. Neuer Fall nach „gezoomt …" (Review Focus 8):

```ts
test("Auswahlleiste: eingepasst über keinem Planelement — Desktop ohne und mit Flyin, Tablet (Phase 4, Entscheidung 15)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const speicherungen: string[] = [];
  page.on("response", (r) => { if (istSpeichern(r)) speicherungen.push(r.url()); });
  type Kasten = { x: number; y: number; width: number; height: number };
  const schneidet = (a: Kasten, b: Kasten) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const fall of [{ width: 1440, height: 900, flyin: false }, { width: 1440, height: 900, flyin: true }, { width: 1024, height: 768, flyin: false }]) {
    await page.setViewportSize({ width: fall.width, height: fall.height });
    await oeffneEditor(page, () => page.goto(url("/p/beispiel-openr-2022-07-01?ansicht=diagramm")));
    for (const id of ["fuekw", "ea1", "ea2", "ea4", "el"]) {
      const was = `${id} bei ${fall.width}${fall.flyin ? " mit Flyin" : ""}`;
      await klickeWennRuhig(page.locator(`.kp-betrachter [data-karte="${id}"]`));
      if (fall.flyin) { await klickeWennRuhig(page.locator('[data-griff="bearbeiten"]')); await expect(flyinTitel(page)).toBeVisible(); }
      await expect(page.locator(".kp-betrachter")).toHaveAttribute("data-eingepasst", "true");
      const leiste = (await page.locator(".kp-auswahlleiste").boundingBox())!;
      const elemente = await page.locator(".kp-betrachter [data-karte], .kp-betrachter [data-einheit], .kp-betrachter [data-sechseck]").evaluateAll((els) =>
        els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, name: e.getAttribute("data-karte") ?? e.getAttribute("data-einheit") ?? e.getAttribute("data-sechseck") ?? "?" }; }));
      for (const e of elemente) expect(schneidet(leiste, e), `Auswahlleiste über ${e.name} (${was})`).toBe(false);
      const umschalter = page.locator(`.kp-betrachter [data-karte="${id}"] [data-umschalter], .kp-betrachter [data-umschalter="${id}"]`).first();
      if (await umschalter.count()) {
        const u = (await umschalter.boundingBox())!;
        const trifft = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-umschalter]") !== null, [u.x + u.width / 2, u.y + u.height / 2]);
        expect(trifft, `Einklapp-Umschalter treffbar (${was})`).toBe(true);
      }
      await page.keyboard.press("Escape");
      if (fall.flyin) await page.keyboard.press("Escape");
    }
  }
  expect(speicherungen, "am Seed-Plan wurde gespeichert").toEqual([]);
});

test("Auswahlleiste am Telefon: „Bearbeiten“ und „+ Unterstelle“ liegen ganz im Bildschirm (Phase 4, Entscheidung 15)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await oeffneEditor(page, () => page.goto(url("/p/beispiel-openr-2022-07-01?ansicht=diagramm")));
  await klickeWennRuhig(page.locator('.kp-betrachter [data-karte="ea1"]'));
  for (const griff of ["bearbeiten", "unter"]) {
    const b = (await page.locator(`.kp-auswahlleiste [data-griff="${griff}"]`).boundingBox())!;
    expect(b.x, `${griff}: links`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, `${griff}: rechts`).toBeLessThanOrEqual(390);
  }
  await expect(page.locator(".kp-auswahl-name")).toBeHidden();
  await page.keyboard.press("Escape");
});
```

(Greifer `[data-einheit]`, `[data-sechseck]`, `[data-umschalter]` vorher in `_ui/zeichnung/Karte.tsx`, `Sechseck.tsx`, `_ui/betrachter/EinklappKnopf.tsx` prüfen und angleichen; liegt der Umschalter der Karte anders im DOM, den Greifer anpassen, nicht die Zusicherung.)

Dann die ganze Spec fahren:

```bash
uptime
pnpm exec playwright test e2e/kommplan-editor.spec.ts e2e/kommplan-gliederung.spec.ts; echo "e2e exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
```

Expected: Exit 0. Rot an „Griff … : oben/links/rechts" heißt: die Leiste liegt nicht in der Fläche — `maxWidth`/`left` prüfen, nicht die Zusicherung lockern. Rot im Überdeckungsfall bei 1024: `GRIFF_RAND.oben` gegen die gemessene Leistenhöhe prüfen (`boundingBox().height` ausgeben; 56 erwartet) — nicht den Fall streichen.

- [ ] **Step 9: Spec §6.3 anpassen**

In `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` §6.3 den ersten Punkt — heute **zwei** Zeilen („- Die ausgewählte Karte zeigt Griffe: unten „+ Unterstelle", seitlich „+ Seitenstelle", an der" / „  Einheitenspalte „+ Einheit".") — durch wieder **zwei** Zeilen ersetzen, damit die Zeilenzahl der Spec gleich bleibt (heute zeigt kein Zeilenanker in die Spec, die Regel gilt trotzdem):

```
- Die ausgewählte Karte trägt einen Auswahlrahmen; ihre Griffe („Bearbeiten", „+ Unterstelle", „+ Einheit", „+ links", „+ rechts")
  stehen in einer Auswahlleiste oben in der Fläche, die eingepasst über keinem Planelement liegt (an der Karte verdeckten 44-px-Griffe Nachbarn).
```

Ankerschritt: `git grep -n "modul-kommunikationsplaene-design.md:[0-9]" -- src scripts e2e docs`.

- [ ] **Step 10: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm exec eslint src/app/m/kommplan/_ui/ e2e/kommplan-editor.spec.ts
for f in Griffe.tsx Griffe.test.tsx Editor.tsx Flaeche.tsx kommplan.css kommplan-css.test.ts Editor.test.tsx Flaeche.test.tsx kommplan-editor.spec.ts; do git grep -n "$f:[0-9]" -- src scripts e2e docs; done
pnpm anker:drift src/app/m/kommplan/_ui/kommplan.css; pnpm anker:drift src/app/m/kommplan/_ui/editor/Editor.tsx
git add src/app/m/kommplan/_ui/editor/Griffe.tsx src/app/m/kommplan/_ui/editor/Griffe.test.tsx src/app/m/kommplan/_ui/editor/Editor.tsx src/app/m/kommplan/_ui/betrachter/Flaeche.tsx src/app/m/kommplan/_ui/kommplan.css src/app/m/kommplan/_ui/kommplan-css.test.ts src/app/m/kommplan/_ui/editor/Editor.test.tsx src/app/m/kommplan/_ui/betrachter/Flaeche.test.tsx e2e/kommplan-editor.spec.ts docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md
git commit -S -m "fix(kommplan): Griffe in einer Auswahlleiste statt über Nachbarkarten

Die Griffe an der gewählten Karte verdeckten Nachbarkarten, Einheiten und
Kanalsechsecke. Jetzt stehen alle Griffe in einer Leiste oben in der
Fläche, die eingepasst über keinem Planelement liegt; an der Karte bleibt
der Auswahlrahmen. Die Ränder beim Einpassen sind entsprechend kleiner.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Spec nachziehen und die Release-Notiz

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§4.1 Zeile `briefkopf`, §4.4, §6.1 Tabelle, §6.7, §8.3)
- Modify: `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts`

**Interfaces:** keine Code-Schnittstellen.

- [ ] **Step 1: Ankerschritt vorab**

`git grep -n "modul-kommunikationsplaene-design.md:[0-9]" -- src scripts e2e docs` — Fundstellen notieren. Jede Änderung unten ersetzt Zeilen **eins zu eins** (gleiche Zeilenzahl), wo sie hinter einem zutreffenden Anker liegt; sonst den Anker in derselben Zeile in die Namensform bringen.

- [ ] **Step 2: Spec-Text**

1. §4.1, Zeile `briefkopf`: „genau eine Zeile:" → „genau eine Zeile (`id` = 1, Primärschlüssel):".
2. §4.4, Punkt „Erlaubt: …": hinter „keine externen Verweise" einfügen „, keine `javascript:`-URLs; `<style>` bleibt bereinigt erhalten". Hinter den Punkt „Jede Datei geht durch den Virenscanner (`core/av`, wie `aufgaben`)" (dieselbe Zeile) „— per Pfad über eine Wegwerfdatei auf dem Volume `kommplan_scan`" ergänzen.
3. §6.1, Tabelle: die Zeile `/m/kommplan` um „; Vorlagen getrennt" ergänzen; eine Zeile `| \`/m/kommplan/archiv\` | Archiv: archivierte Pläne, nur lesbar; Wiederherstellen (Bearbeitende) |` nach `/m/kommplan/einstellungen` — **nur**, wenn dahinter kein zutreffender Zeilenanker liegt (Step 1); sonst die Archivseite in der Zeile `/m/kommplan` nennen.
4. §6.7 ersetzen (gleiche Zeilenzahl: zwei Zeilen):
   ```
   „Duplizieren" kopiert den Plan, setzt das Datum auf heute (Suite-Zone) und ersetzt das erste Datum im Titel in derselben Schreibweise (sonst „ (Kopie)"). „Als Vorlage speichern" setzt
   `ist_vorlage` am Plan (er steht dann unter „Vorlagen"; „Keine Vorlage mehr" nimmt es zurück); „Neu aus Vorlage" legt eine Kopie an.
   ```
5. §8.3, ersten Satz ergänzen (dieselbe Zeile): „Pläne werden archiviert, nicht gelöscht, und sind wiederherstellbar; archiviert sind sie nur lesbar (ansehen, drucken)."

- [ ] **Step 3: Release-Notiz**

Den `inhalt` der Notiz ersetzen (Titel, Slug und Datum bleiben — eine Notiz für das Modul, Vorgabe des Hauptlaufs):

```ts
  inhalt: [
    absatz(
      "Pläne und Fernmeldeskizzen siehst du als Diagramm und druckst sie über „Drucken (A4 quer)“. " +
        "Mit Bearbeitungsrecht legst du über „Neu“ einen Plan an und baust ihn mit „+ Unterstelle“, „+ links“, „+ rechts“ und „+ Einheit“ auf. " +
        "Alles speichert sich selbst.",
    ),
    absatz("In der „Gliederung“ legt Enter die nächste Stelle an, Tab rückt ein; eine eingefügte, eingerückte Liste wird ein ganzer Zweig."),
    absatz(
      "Unter „Bibliothek“ pflegst du Stellen, Einheiten und Verbindungen für „Aus Bibliothek“. " +
        "Unter „Aktionen“ findest du „Duplizieren“, „Archivieren“ und „Als Vorlage speichern“. " +
        "Organisation und Logo stehen unter „Einstellungen“.",
    ),
  ],
```

Gezählt: 254 + 126 + 225 = 605 Zeichen (Grenzen: 3 Blöcke, je ≤ 320, zusammen ≤ 640). „Rückgängig" fällt aus dem ersten Absatz, damit der dritte passt — „Alles speichert sich selbst" bleibt. Jeder genannte Name steht so am Bildschirm (Task 24 prüft es an den Fotos).

- [ ] **Step 4: Prüfen und Commit**

```bash
pnpm vitest run src/app/m/portal/_lib/neuigkeiten/
git grep -n "modul-kommunikationsplaene-design.md:[0-9]\|2026-09-30-kommunikationsplaene-ansehen.ts:[0-9]" -- src scripts e2e docs
pnpm anker:drift docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md
git add docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts
git commit -S -m "docs: Spec und Release-Notiz der Kommunikationspläne nach Phase 4

Briefkopf, Duplizieren, Vorlagen und Archiv in der Spec präzisiert; die
Notiz nennt Bibliothek, Aktionen und Einstellungen.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: End-to-End — Bibliothek, Vorlagen, Duplizieren, Archiv, Briefkopf

**Files:**
- Create: `e2e/kommplan-bibliothek.spec.ts`, `e2e/kommplan-verwaltung.spec.ts`
- Modify: `e2e/kommplan-hilfen.ts` (Helfer `knopfImMenue`, `istBibAktion`), `e2e/gruppen.json`

**Interfaces:**
- Consumes: `HOST`, `url`, `ADMIN`, `istAktion`, `rumpf`, `istSpeichern`, `speichertNach`, `oeffneEditor`, `neuerPlan`, `ersteStelle`, `flyinTitel`, `karten` (`e2e/kommplan-hilfen.ts`); `devLogin`, `klickeWennRuhig`, `warteAufSpaltenaufteilung`, `warteAufGestreamteInhalte` (`e2e/fixtures.ts`); `setzeAvModus` (`e2e/helpers/avModus.ts`).

Regeln: jeder ausgelöste Server-Action-Aufruf und jeder Upload per `waitForResponse` (Falle 10), vor dem ersten POST auf `/logo` ein Warmlauf-GET; jeder Test stellt seinen Zustand selbst her (docs/design/README.md „Ein e2e-Test darf seinen Zustand nicht vom Seed erben") — eigene Pläne **und eigene Bibliothekseinträge**, eindeutige Namen mit Zufallsanteil; Seed-Pläne und Seed-Bibliothek nur ansehen. Optionen eines antd-`Select` immer über `.ant-select-item-option` wählen, nie über `getByRole("option")`: in antd 6 (`@rc-component/select`, `virtual` als Vorgabe) tragen nur die Einträge einer 0×0-Hilfsliste um den aktiven Index `role="option"` (Vorbild: die übrigen Specs der Suite, etwa die Lagerbuch-Kategorien). Knöpfe „Speichern" im Bibliotheks-Flyin mit `exact: true` greifen — daneben steht „Speichern und nächste".

- [ ] **Step 1: `e2e/kommplan-bibliothek.spec.ts` schreiben**

```ts
import { expect, test, type Page, type Response } from "@playwright/test";
import { devLogin, klickeWennRuhig, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";
import { ADMIN, HOST, ersteStelle, flyinTitel, istAktion, neuerPlan, oeffneEditor, rumpf, speichertNach, url } from "./kommplan-hilfen";

/**
 * Kommunikationspläne, Phase 4: Bibliothek pflegen und im Editor nutzen (Spec §4.3, §6.4, §6.5). Jeder Test
 * legt eigene, eindeutig benannte Einträge an (Zustand nie vom Seed erben). Jede Action per waitForResponse.
 */
const neu = () => Math.random().toString(36).slice(2, 7);
const istBib = (teil: string) => (r: Response) => istAktion(r) && rumpf(r).includes(teil);
const stellenStatus = (page: Page) => page.locator('section[aria-label="Stellen der Bibliothek"] [role="status"]');

/** Eine eigene Bibliotheksstelle anlegen — der Test erbt nie die Seed-Bibliothek. */
async function legeBibStelleAn(page: Page, titel: string, leiter: string, telefon: string) {
  await page.goto(url("/bibliothek"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Stelle" }));
  const formular = page.locator(".kp-flyin").getByRole("form", { name: "Stelle der Bibliothek" });
  await formular.getByLabel("Titel", { exact: true }).fill(titel);
  await formular.getByLabel("Leiter", { exact: true }).fill(leiter);
  await formular.getByLabel("Telefon", { exact: true }).fill(telefon);
  const anlage = page.waitForResponse(istBib(titel));
  await klickeWennRuhig(formular.getByRole("button", { name: "Speichern", exact: true }));
  expect((await anlage).status()).toBe(200);
  await expect(stellenStatus(page)).toContainText(`„${titel}“ gespeichert.`);
}

test("Zugangsgruppe: kein Weg zur Bibliothek, /bibliothek ist 404", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "iuk-kommplan", callbackPath: "/" });
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await expect(page.getByRole("link", { name: "Bibliothek" })).toHaveCount(0);
  const r = await page.goto(url("/bibliothek"));
  expect(r?.status()).toBe(404);
});

test("Stelle anlegen, suchen, Dublette abgewiesen, löschen", async ({ page }) => {
  const titel = `EAL e2e ${neu()}`;
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await page.goto(url("/bibliothek"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Stelle" }));
  const formular = page.locator(".kp-flyin").getByRole("form", { name: "Stelle der Bibliothek" });
  await formular.getByLabel("Titel", { exact: true }).fill(titel);
  await formular.getByLabel("Leiter", { exact: true }).fill("Jana");
  const anlage = page.waitForResponse(istBib(titel));
  await klickeWennRuhig(formular.getByRole("button", { name: "Speichern", exact: true }));
  expect((await anlage).status()).toBe(200);
  await expect(stellenStatus(page)).toContainText(`„${titel}“ gespeichert.`);
  await warteAufGestreamteInhalte(page);
  await page.getByLabel("Stellen suchen").fill(titel.slice(-5));
  await expect(page.getByRole("table", { name: "Stellen" }).getByRole("row")).toHaveCount(2); // Kopf + Treffer
  // Dublette
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Stelle" }));
  await formular.getByLabel("Titel", { exact: true }).fill(titel.toUpperCase());
  const doppelt = page.waitForResponse(istBib(titel.toUpperCase()));
  await klickeWennRuhig(formular.getByRole("button", { name: "Speichern", exact: true }));
  expect((await doppelt).status()).toBe(200);
  await expect(page.locator(".kp-flyin")).toContainText("steht schon in der Bibliothek");
  await klickeWennRuhig(formular.getByRole("button", { name: "Abbrechen" }));
  // löschen
  await klickeWennRuhig(page.getByRole("table", { name: "Stellen" }).getByRole("button", { name: titel }));
  await klickeWennRuhig(formular.getByRole("button", { name: "Löschen" }));
  const weg = page.waitForResponse(istBib('"stelle"'));
  await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Löschen" }));
  expect((await weg).status()).toBe(200);
  await expect(stellenStatus(page)).toContainText("gelöscht");
});

test("CSV importieren: Vorschau mit Umlauten aus Windows-1252, Dublette übersprungen", async ({ page }) => {
  const ruf = `RK e2e ${neu()}`;
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await page.goto(url("/bibliothek"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("tab", { name: /^Einheiten/ }));
  // Zustand selbst herstellen: die Einheit, gegen die die CSV eine Dublette trägt (nie eine Seed-Einheit).
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Einheit" }));
  const formular = page.locator(".kp-flyin").getByRole("form", { name: "Einheit der Bibliothek" });
  await formular.getByLabel("Typ", { exact: true }).fill("RTW");
  await formular.getByLabel("Rufname", { exact: true }).fill(`${ruf} Basis`);
  const anlage = page.waitForResponse(istBib(`${ruf} Basis`));
  await klickeWennRuhig(formular.getByRole("button", { name: "Speichern", exact: true }));
  expect((await anlage).status()).toBe(200);
  // Die Vorschau vergleicht gegen die Einheiten aus den Server-Props — erst nach dem `router.refresh()` steht die neue
  // Einheit darin. Ohne dieses Warten liefe die Vorschau gelegentlich gegen den alten Stand („2 übernehmen").
  await expect(page.getByRole("table", { name: "Einheiten" })).toContainText(`${ruf} Basis`);
  await warteAufGestreamteInhalte(page);
  const csv = `Typ;Rufname;Notiz\r\nKTW;${ruf} Großenkneten;Übung\r\nKTW;${ruf.toLowerCase()} großenkneten;\r\nRTW;${ruf.toLowerCase()}  basis ;\r\n`;
  const bytes = Buffer.from([...csv].map((c) => c.charCodeAt(0))); // Latin-1 = Windows-1252 für diese Zeichen
  await page.locator('input[type="file"][name="csv"]').setInputFiles({ name: "einheiten.csv", mimeType: "text/csv", buffer: bytes });
  const vorschau = page.locator(".kp-flyin").filter({ has: page.getByRole("table", { name: "Vorschau" }) });
  await expect(vorschau).toContainText(`${ruf} Großenkneten`);
  await expect(vorschau).toContainText("doppelt in der Liste");
  await expect(vorschau).toContainText("schon in der Bibliothek");
  const imp = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes(`${ruf} Großenkneten`));
  await klickeWennRuhig(vorschau.getByRole("button", { name: "1 übernehmen" }));
  expect((await imp).status()).toBe(200);
  await expect(page.locator('section[aria-label="Einheiten der Bibliothek"] [role="status"]')).toContainText("1 angelegt, 0 übersprungen.");
});

test("Editor: Aus Bibliothek füllt die Stelle, ein Schritt zurück; Gliederung schlägt beim Tippen vor", async ({ page }) => {
  const leit = `Leitstelle e2e ${neu()}`;
  const telefon = `0581 ${10_000 + Math.floor(Math.random() * 89_999)}`;
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await legeBibStelleAn(page, leit, "Disponent", telefon); // eigener Eintrag, nie der Seed
  await neuerPlan(page, `e2e Bibliothek ${neu()}`);
  await ersteStelle(page, "EL");
  const auswahl = page.locator(".kp-flyin").getByLabel("Aus Bibliothek", { exact: true });
  await klickeWennRuhig(auswahl);
  await auswahl.fill(leit.slice(-5)); // gezielt suchen: andere Läufe legen ähnliche Einträge an
  await speichertNach(page, () => klickeWennRuhig(page.locator(".ant-select-item-option", { hasText: leit })));
  await expect(flyinTitel(page)).toHaveValue(leit);
  await expect(flyinTitel(page)).toBeFocused(); // die Wahl lässt den Fokus nicht auf body fallen
  await expect(page.locator(".kp-betrachter")).toContainText(telefon);
  await page.keyboard.press("Escape");
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+z"));
  await expect(page.locator(".kp-betrachter")).toContainText("EL");
  // Gliederung: Vorschlag beim Tippen (Taste für Taste), Alt+Enter übernimmt, der Fokus bleibt
  const pfad = new URL(page.url()).pathname;
  await oeffneEditor(page, () => page.goto(url(`${pfad}?ansicht=gliederung`)));
  const titelFeld = page.locator('.kp-gliederung [data-zeile] input[name="titel"]').first();
  await titelFeld.click();
  await titelFeld.fill("");
  // Bis auf das letzte Zeichen tippen: der eigene Eintrag ist dann der einzige (und erste) Vorschlag.
  await speichertNach(page, () => titelFeld.pressSequentially(leit.slice(0, -1)));
  await expect(page.getByRole("group", { name: "Vorschläge aus der Bibliothek" })).toContainText(leit);
  await speichertNach(page, () => titelFeld.press("Alt+Enter"));
  await expect(titelFeld).toHaveValue(leit);
  await expect(titelFeld).toBeFocused();
});

test.describe("Telefon mit Touch", () => {
  // `test.use` statt eines eigenen `browser.newContext`: so bleiben alle `use`-Vorgaben aus `playwright.config.ts`
  // (Basis, Sprache, Zeitzone, Cloud-Einstellungen) erhalten — nur Größe und Touch kommen dazu.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("Gliederung am Telefon: Vorschlag per Tippen übernehmen — Titel gefüllt, Feld fokussiert, keine Zeile verloren", async ({ page }) => {
    const leit = `Leitstelle e2e ${neu()}`;
    await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
    await legeBibStelleAn(page, leit, "Disponent", "0581 1");
    await neuerPlan(page, `e2e Telefon ${neu()}`); // am Telefon öffnet der Editor in der Gliederung (Phase 3)
    const titelFeld = page.locator('.kp-gliederung [data-zeile] input[name="titel"]').first();
    await titelFeld.tap();
    const zeilen = await page.locator(".kp-gliederung [data-zeile]").count();
    await speichertNach(page, () => titelFeld.pressSequentially(leit.slice(0, -1)));
    await expect(page.locator(".kp-vorschlag-hinweis")).toBeHidden(); // kein Alt-Hinweis ohne Alt-Taste
    await speichertNach(page, () => page.locator(`[data-vorschlag]`, { hasText: leit }).tap());
    await expect(titelFeld).toHaveValue(leit);
    await expect(titelFeld).toBeFocused();
    await expect(page.locator(".kp-gliederung [data-zeile]")).toHaveCount(zeilen);
  });
});
```

(Die Greifer auf die Gliederung — `.kp-gliederung`, `[data-zeile]` — aus `e2e/kommplan-gliederung.spec.ts` übernehmen; die Navigation in die Gliederung über `oeffneEditor` führen, wie dort, damit die Standabfrage beim Montieren abgewartet wird. Der Telefonfall: ob `neuerPlan` am Telefon ohne Anpassung durchläuft und wo die erste Zeile steht, an `e2e/kommplan-gliederung.spec.ts` (Telefonfälle) angleichen; geprüft wird das Antippen echt mit Touch, nicht nur in jsdom.)

- [ ] **Step 2: `e2e/kommplan-verwaltung.spec.ts` schreiben**

```ts
import { expect, test } from "@playwright/test";
import { devLogin, klickeWennRuhig, warteAufSpaltenaufteilung } from "./fixtures";
import { setzeAvModus } from "./helpers/avModus";
import { ADMIN, HOST, istAktion, istStandAbfrage, neuerPlan, oeffneEditor, rumpf, url } from "./kommplan-hilfen";

/**
 * Kommunikationspläne, Phase 4: Duplizieren, Vorlagen, Archiv (Spec §6.7, §8.3) und Briefkopf (Spec §4.4).
 * Eigene Pläne je Test; der Briefkopf ist eine Zeile für alle — der Test stellt seinen Stand selbst her und
 * am Ende den Seed-Stand („Musterorganisation", kein Logo) wieder her.
 */
const neu = () => Math.random().toString(36).slice(2, 7);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 1" onload="alert(1)"><rect width="4" height="1" fill="#123456"/><script>alert(1)</script></svg>');

test("Duplizieren: Kopie mit heutigem Datum im Titel, direkt im Editor, mit Hinweis", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const titel = `e2e Tag 01.07.2022 ${neu()}`;
  const id = await neuerPlan(page, titel);
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  const kopie = page.waitForResponse((r) => istAktion(r) && rumpf(r) === JSON.stringify([id]));
  // NICHT `oeffneEditor`: dessen `istStandAbfrage` (Action ohne „version", „titel" und „:") passt auch auf den Rumpf
  // der Duplizieren-Action (`["<id>"]`) und löste an IHR aus statt an der Standabfrage des Editors der Kopie
  // (Familie der Fallen 10–12). Gezielt: eine Standabfrage, die NICHT die ID des Originals trägt.
  const stand = page.waitForResponse((r) => istStandAbfrage(r) && !rumpf(r).includes(id));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Duplizieren" }));
  expect((await kopie).status()).toBe(200);
  await page.waitForURL(/\/p\/[0-9a-f-]{36}\?kopie=1$/);
  expect((await stand).status()).toBe(200);
  await warteAufSpaltenaufteilung(page);
  await expect(page.getByText(/Kopie angelegt — Titel und Datum stehen auf/)).toBeVisible();
  const heute = await page.evaluate(() => new Intl.DateTimeFormat("de-DE", { timeZone: document.documentElement.dataset.zeitzone || "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titel.replace("01.07.2022", heute));
});

test("Vorlage: als Vorlage speichern, Neu aus Vorlage übernimmt den Inhalt, Keine Vorlage mehr", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const titel = `e2e Vorlage ${neu()}`;
  await neuerPlan(page, titel);
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  const v = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"vorlage":true'));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Als Vorlage speichern" }));
  expect((await v).status()).toBe(200);
  await expect(page.getByRole("table", { name: "Vorlagen" }).getByRole("link", { name: titel })).toBeVisible();
  await expect(page.getByRole("table", { name: "Pläne" }).getByRole("link", { name: titel })).toHaveCount(0);
  await klickeWennRuhig(page.getByRole("table", { name: "Vorlagen" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Neu aus Vorlage" }));
  const formular = page.getByRole("form", { name: "Neuer Plan" });
  await expect(formular.getByLabel("Titel")).toHaveValue(titel);
  await formular.getByLabel("Titel").fill(`${titel} Einsatz`);
  const anlage = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"vorlage":"'));
  await oeffneEditor(page, async () => {
    await klickeWennRuhig(formular.getByRole("button", { name: "Anlegen und bearbeiten" }));
    expect((await anlage).status()).toBe(200);
    await page.waitForURL(/\/p\/[0-9a-f-]{36}$/);
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${titel} Einsatz`);
});

test("Archiv: archivieren, Rückgängig, nur lesbar unter /p/<id>, wiederherstellen", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const titel = `e2e Archiv ${neu()}`;
  const id = await neuerPlan(page, titel);
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  const archiv = () => page.waitForResponse((r) => istAktion(r) && rumpf(r).includes(id));
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  let a = archiv();
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Archivieren" }));
  expect((await a).status()).toBe(200);
  await expect(page.locator(".kp-listenhinweis")).toContainText(`„${titel}“ archiviert.`);
  a = archiv();
  await klickeWennRuhig(page.locator(".kp-listenhinweis").getByRole("button", { name: "Rückgängig" }));
  expect((await a).status()).toBe(200);
  await expect(page.getByRole("table", { name: "Pläne" }).getByRole("link", { name: titel })).toBeVisible();
  // endgültig archivieren und ansehen
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  a = archiv();
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Archivieren" }));
  expect((await a).status()).toBe(200);
  const r = await page.goto(url(`/p/${id}`));
  expect(r?.status()).toBe(200);
  await expect(page.locator(".kp-archivhinweis")).toContainText("nur lesbar");
  await expect(page.getByRole("button", { name: "Rückgängig" })).toHaveCount(0); // kein Editor
  expect((await page.goto(url(`/p/${id}/druck/a4`)))?.status()).toBe(200);
  await page.goto(url("/archiv"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Archivierte Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  a = archiv();
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Wiederherstellen" }));
  expect((await a).status()).toBe(200);
});

test("Briefkopf: ohne Eintrag leer; SVG hochladen wird bereinigt und gedruckt; Befund abgelehnt; Logo entfernen", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const id = await neuerPlan(page, `e2e Kopf ${neu()}`);
  await page.goto(url("/einstellungen"));
  await warteAufSpaltenaufteilung(page);
  const speichereName = async (name: string) => {
    await page.getByRole("form", { name: "Organisation" }).getByLabel("Organisation").fill(name);
    const s = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"organisation"'));
    await klickeWennRuhig(page.getByRole("form", { name: "Organisation" }).getByRole("button", { name: "Speichern" }));
    expect((await s).status()).toBe(200);
  };
  const entferneLogo = async () => {
    if (await page.getByRole("button", { name: "Logo entfernen" }).count() === 0) return;
    await klickeWennRuhig(page.getByRole("button", { name: "Logo entfernen" }));
    const e = page.waitForResponse((r) => istAktion(r) && r.request().method() === "POST");
    await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Entfernen" }));
    expect((await e).status()).toBe(200);
  };
  // leer
  await entferneLogo();
  await speichereName("");
  await expect(page.getByRole("img", { name: "Vorschau des Kopfs: ohne Organisation, ohne Logo" })).toBeVisible();
  await page.goto(url(`/p/${id}/druck/a4`));
  await expect(page.locator(".kp-blatt [data-organisation], .kp-blatt [data-logo]")).toHaveCount(0);
  // SVG
  await page.goto(url("/einstellungen"));
  await speichereName("Musterorganisation e2e");
  setzeAvModus("ok");
  // Falle 10: ein POST in die Erstkompilierung eines Route Handlers wird unter `next dev` abgebrochen. Der Warmlauf-GET
  // übersetzt den Handler; 405 ist die Antwort eines übersetzten POST-Handlers (Vorbild: Import-Test der Funkverwaltung).
  const warmlauf = await page.request.get(url("/logo"));
  expect(warmlauf.status(), "der Logo-Handler antwortet nicht — der erste echte POST liefe in Falle 10").toBe(405);
  const hoch = page.waitForResponse((r) => r.url().endsWith("/logo") && r.request().method() === "POST");
  await page.locator('input[type="file"][name="logo"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: SVG }); // Name und Typ lügen
  expect((await hoch).status()).toBe(200);
  await expect(page.locator('.kp-einstellungen [role="status"]')).toHaveText("Logo übernommen (SVG).");
  await expect(page.getByRole("img", { name: "Vorschau des Kopfs: Musterorganisation e2e, mit Logo" })).toBeVisible();
  await page.goto(url(`/p/${id}/druck/a4`));
  await expect(page.locator(".kp-blatt [data-organisation]").first()).toHaveText("Musterorganisation e2e");
  await expect(page.locator(".kp-blatt [data-logo]")).toHaveCount(await page.locator(".kp-blatt").count());
  const href = await page.locator("#kp-logo").getAttribute("href");
  expect(Buffer.from(href!.split(",")[1], "base64").toString("utf8")).not.toMatch(/script|onload/);
  // Befund
  await page.goto(url("/einstellungen"));
  setzeAvModus("found");
  try {
    const abgelehnt = page.waitForResponse((r) => r.url().endsWith("/logo") && r.request().method() === "POST");
    await page.locator('input[type="file"][name="logo"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    expect((await abgelehnt).status()).toBe(422);
    await expect(page.locator('.kp-einstellungen [role="status"]')).toContainText("Virenscanner");
  } finally { setzeAvModus("ok"); }
  // Seed-Stand wiederherstellen
  await entferneLogo();
  await speichereName("Musterorganisation");
});
```

(Prüfen: `setzeAvModus` schreibt die Modusdatei, die der Fake-clamd **je Verbindung** liest — der Upload danach sieht den neuen Modus. Der Popconfirm-Greifer `.ant-popconfirm` ist ein Test-Greifer, keine Stilregel; trifft er in antd 6.6.4 nicht, `page.getByRole("tooltip")` bzw. den zweiten „Entfernen"-Knopf nehmen. `rumpf(r).includes('"organisation"')` muss die Organisations-Action treffen und nicht die Standabfrage — bei Bedarf schärfen.)

- [ ] **Step 3: Eimer zuordnen**

`e2e/gruppen.json`: beide neuen Specs in die Eimer mit der kürzesten Laufzeit legen (Vorbild Phase 2 U11/Phase 3 U12: letzte grüne `main`-Läufe ansehen, `gh run list --workflow ci.yml --branch main --limit 1` und die Eimerzeiten im Log; sonst die Datei mit den wenigsten Specs). `scripts/e2e-gruppen.test.ts` muss grün bleiben (jede Spec genau einmal).

- [ ] **Step 4: Fahren**

```bash
uptime
pnpm exec playwright test e2e/kommplan-bibliothek.spec.ts e2e/kommplan-verwaltung.spec.ts; echo "e2e exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
pnpm vitest run scripts/e2e-gruppen.test.ts
```

Expected: Exit 0. Unter Last (> 10) einzeln bzw. `pnpm e2e:gebaut` nachfahren, bevor ein Rot als Befund gilt; jeder echte Befund wird ein `fix(kommplan): …`-Commit mit Eintrag in „Abweichungen bei der Umsetzung".

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm exec eslint e2e/kommplan-bibliothek.spec.ts e2e/kommplan-verwaltung.spec.ts e2e/kommplan-hilfen.ts
git grep -n "gruppen.json:[0-9]" -- src scripts e2e docs
git add e2e/kommplan-bibliothek.spec.ts e2e/kommplan-verwaltung.spec.ts e2e/kommplan-hilfen.ts e2e/gruppen.json
git commit -S -m "test(kommplan): e2e für Bibliothek, Vorlagen, Archiv und Briefkopf

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Sichtprüfung — Fotos hell und dunkel auf drei Breiten, Befunde beheben

**Files:**
- Modify (nur bei Befund): die betroffenen Dateien aus Tasks 9, 13, 17, 19–21.
- Modify: `e2e/kommplan-editor.spec.ts` (Fototest um die neuen Ansichten erweitern)

**Interfaces:**
- Produces: Fotos unter `/private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase4-shots/`, Befundliste, je Befund ein `fix(kommplan): …`-Commit.

- [ ] **Step 1: Fototest erweitern**

Im Fototest von `e2e/kommplan-editor.spec.ts` je Breite und Modus ergänzen (nur mit `KOMMPLAN_FOTOS`; ohne bleibt der CI-Lauf auf der Telefonbreite und sichert zu, dass nichts waagerecht überläuft):
- nach `liste-${n}`: `archiv-${n}` (`/archiv`), `bibliothek-stellen-${n}` (`/bibliothek`), `bibliothek-einheiten-${n}` (Reiter „Einheiten"), `bibliothek-flyin-${n}` („Neue Stelle"), `einstellungen-${n}` (`/einstellungen`) — je `await ohneUeberlauf()`;
- nach `auswahl-${n}`: `auswahl-flyin-${n}` (ea2 gewählt, „Bearbeiten" offen — Auswahlleiste neben dem Flyin);
- nach `flyin-stelle-${n}`: `flyin-stelle-bibliothek-${n}` (das Flyin nach oben gescrollt, Feld „Aus Bibliothek" sichtbar);
- `gliederung-vorschlag-${n}`: im Editor eines **eigenen** Plans (`neuerPlan` vor der Schleife) in der Gliederung „Leit" tippen — Vorschläge unter der Zeile (nie am Seed-Plan tippen: Review Focus 6 der Phase 2); dazu am Telefon `gliederung-vorschlag-tief-${n}` an einer Zeile der Ebene 8 (per eingefügter, eingerückter Liste angelegt) — die Vorschläge rücken nicht doppelt ein;
- `gliederung-einheiten-bib-${n}`: dieselbe Gliederung mit aufgeklappten Einheiten einer Stelle bei gefüllter Bibliothek — Auswahl „Einheiten aus der Bibliothek" und „Hinzufügen" nebeneinander bzw. umgebrochen, nie in der Typspalte;
- `bibliothek-lang-desktop`: Stellen-Tabelle bei 1440 px mit einer Stelle, deren Notiz 500 Zeichen hat (vorher über die Seite angelegt, danach gelöscht) — keine Spalte rutscht aus dem Bild;
- `druck-${n}` nur einmal je Modus (Desktop): `/p/beispiel-openr-2022-07-01/druck/a4` mit Briefkopf aus dem Seed („Musterorganisation", ohne Logo).

```bash
uptime
KOMMPLAN_FOTOS=/private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase4-shots pnpm exec playwright test e2e/kommplan-editor.spec.ts -g "Bildschirmfotos"; echo "exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
ls /private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase4-shots | wc -l
```

Zusätzlich ein Logo-Foto: einmal von Hand (Playwright-Skript im Scratchpad, **kein** Test der Suite) ein Logo hochladen — z. B. ein breites SVG mit Wortmarke — und `einstellungen-logo-desktop-{light,dark}` sowie `druck-logo-desktop-light` aufnehmen; danach das Logo wieder entfernen.

- [ ] **Step 2: Jedes Foto mit Read ansehen**

Prüfliste:
1. **Auswahlleiste** (`auswahl-*`, `auswahl-flyin-*`): oben links, über keinem Planelement, Reihenfolge „Bearbeiten", „+ Unterstelle", „+ Einheit", „+ links", „+ rechts", Name gekürzt mit „…"; im Dunkeln mit sichtbarem Rand und sichtbarer Schattenkante; am Telefon eine Zeile ohne Namen, „Bearbeiten" und „+ Unterstelle" ganz im Bild, Schattenkante rechts; neben offenem Flyin ganz links davon. Vergleich mit `phase3-shots/auswahl-*`: nichts verdeckt mehr EA 1/EA 3 oder das Sechseck „TMO BOS_NI_RES_09".
2. **Planliste/Archiv**: zwei Tabellen mit Überschrift „Vorlagen", Knopf „Aktionen" je Zeile 44 px, Seitenkopf-Links lesbar; Telefon: Karten, „Neu", „Bibliothek", „Einstellungen", „Archiv" voll breit untereinander (am Foto `liste-telefon` gemessen: Breite ≈ Inhaltsbreite), kein Überlauf.
3. **Bibliothek**: Reiter mit Zahl, Suchfeld und „Neue …" in einer Zeile ab 768 px, untereinander am Telefon; Flyin mit Zeichenwahl und Kontakten, „Speichern und nächste" beim Anlegen; Einheiten-Werkzeuge („Liste einfügen", „CSV importieren") mit Hilfetext; lange Notiz in Lesebreite (`bibliothek-lang-desktop`).
4. **Einstellungen**: Vorschau des Kopfs als weißes Papier auch im Dunkeln, Logo rechts in der Box, Seitenverhältnis gehalten, Name links daneben, keine Überlappung mit dem Titel; ohne Logo nichts als Platzhalter.
5. **Druck**: Kopf wie Vorschau; kein rotes Kreuz, kein Rot.
6. **Gliederung mit Vorschlägen**: unter der aktiven Zeile, eingerückt wie sie (nicht doppelt — auch `gliederung-vorschlag-tief-telefon`), eine Zeile hoch, nicht über der nächsten Zeile; am Telefon ohne Alt-Hinweis.
7. **Flyin einer Stelle**: „Aus Bibliothek" oben, Titelvorschläge unter dem Titel, „In Bibliothek übernehmen" unten neben „Stelle löschen", Feld der Einheiten-Bibliothek nicht breiter als das Flyin; in der Gliederung (`gliederung-einheiten-bib-*`) dieselbe Auswahl außerhalb des dreispaltigen Einheitenrasters.
8. Zum Vergleich die Referenzbilder (`…/scratchpad/referenz/*.png`): der Kopf trägt das Logo dort, wo die Vorlage es hatte (rechts oben).
9. **Durchlauf mit Zählung** (Akzeptanz A1, Kritik): den Plan „Einsatz 22.02.2026" (Referenzbild) einmal von Hand über die Gliederung nachbauen — einmal mit leerer, einmal mit gefüllter Bibliothek (Leitstelle und EAL als Stellen, R_UE_1–3, die 19 Fahrzeuge) — und die Bedienschritte (Klicks plus Tasten außerhalb des reinen Texttippens) zählen. Die Kritik schätzt etwa 105–110 ohne und 60–65 mit Bibliothek nach den Änderungen dieser Fassung; die gemessenen Zahlen mit dem Weg (wo die Schritte hingehen) in „Abweichungen bei der Umsetzung" eintragen. Liegt „mit Bibliothek" nicht deutlich darunter, ist das ein Befund für den Hauptlauf, kein Grund, die Zählung zu schönen.

- [ ] **Step 3: Befunde beheben**

Je Befund: kleinster Eingriff, ein Test, der ihn festhält (Quelltext-Scan für CSS-Regeln, e2e für „sieht man"), Fotos der Ansicht neu, `fix(kommplan): …`-Commit mit `DRK-500`. Jeden Befund samt Entscheidung in „Abweichungen bei der Umsetzung" eintragen (U1, U2, …) und den Plan mit `docs: Abweichungen … im Umsetzungsplan Phase 4` committen.

- [ ] **Step 4: Release-Notiz gegenlesen**

Jeder Name der Notiz steht so am Bildschirm (Fotos): „Drucken (A4 quer)", „Neu", „+ Unterstelle", „+ links", „+ rechts", „+ Einheit", „Gliederung", „Bibliothek", „Aus Bibliothek", „Aktionen", „Duplizieren", „Archivieren", „Als Vorlage speichern", „Einstellungen". Weicht etwas ab, Notiz oder Oberfläche in einem `fix(kommplan): …`-Commit nachziehen.

---

### Task 25: Alle Tore

**Files:** keine neuen Änderungen.

- [ ] **Step 1: Alle Tore**

Vorher `uptime`. Dann nacheinander, jeweils Exit-Code prüfen:

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm lint; echo "lint exit $?"
pnpm anker:neu; echo "anker exit $?"
pnpm vitest run; echo "vitest exit $?"
pnpm build; echo "build exit $?"
pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts e2e/kommplan-gliederung.spec.ts e2e/kommplan-bibliothek.spec.ts e2e/kommplan-verwaltung.spec.ts; echo "e2e exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
```

Expected: alles Exit 0. Bekannt und nicht Teil dieser Arbeit: `scripts/backup-sidecar.test.ts` auf macOS (DRK-501); `pnpm vitest run` darf ausschließlich daran rot sein. Ein rotes e2e bei hoher Last einzeln bzw. über `pnpm e2e:gebaut` (CI-Weg) nachfahren. Rote Tests anderer Module (z. B. datumsabhängig) nur beheben, wenn sie ein Tor blockieren, und als Ticketkandidat eintragen.

- [ ] **Step 2: Stand festhalten**

`git status` sauber (außer `next-env.d.ts`, zurückgesetzt); `git log --oneline main..HEAD` zeigt die Commits dieser Phase signiert (`git log --show-signature -1`). Im Bericht an den Hauptlauf: Ticketkandidaten aus „Abweichungen", offene Risiken (Volume `kommplan_scan` auf dem Zielhost, Alt+Enter unter Windows, Entscheidung 7).

---

## Abdeckung der Spec (Selbstprüfung)

| Spec / Vorgabe | Aufgabe |
|---|---|
| §4.1 `briefkopf` (eine Zeile; `id` ergänzt, Entscheidung 2) | 1, 22 |
| §4.4 Logo nicht im Code, Organisation eintragbar, leer bleibt leer, kein Ersatz auch im Seed | 5, 7 |
| §4.4 Seite `/einstellungen` nur Admin: Name, Logo hochladen/ersetzen/entfernen, Vorschau | 6, 8, 9 |
| §4.4 PNG/JPEG/WebP/SVG ≤ 1 MB, Typ aus Bytes | 2, 6 |
| §4.4 Virenscan über `core/av` (Muster `aufgaben`) | 4, 5 |
| §4.4 SVG bereinigt (script, foreignObject, on*, externe Verweise, javascript:), danach Ungültiges abgelehnt; reine Funktion mit Angriffstests | 3, 5 |
| §4.4 Logo als `data:`-URI in `<image>`, eingepasst in feste Box mit Seitenverhältnis | 7 |
| §4.4 Hochladen/Ersetzen/Entfernen im Audit | 1, 5, 6 |
| Auftrag: rotes Kreuz und „Deutsches Rotes Kreuz" aus Code, Seed, Golden, Fixtures entfernt | 7 |
| §4.3 Bibliothek: Kopie, keine stille Änderung, „In Bibliothek übernehmen" | 14, 18, 19 |
| §6.1 `/bibliothek` nur Admin: Stellen, Einheiten, Verbindungen; anlegen, bearbeiten, löschen, suchen; Kartentabelle; Flyin | 8, 14, 16, 17 |
| Auftrag: Einheiten per „Liste einfügen" (gleicher Parser) und CSV `Typ;Rufname[;Notiz]` mit Vorschau und Dubletten nach Rufname | 15, 17 |
| §6.4 Flyin: „Aus Bibliothek", „In Bibliothek übernehmen", Einheiten aus der Bibliothek | 19 |
| Auftrag: Verbindungsauswahl mit Bibliotheksverbindungen (Kopie) | 18, 19, 20 |
| Auftrag: Gliederung — Titelvorschläge, Auswahl übernimmt die Stelle, Tippfluss ungestört | 18, 20 |
| Auftrag: Einfügen aus der Bibliothek je ein Rückgängig-Schritt | 18–20 |
| §6.7 Duplizieren (Datum heute, Datum im Titel ersetzt, auch ISO), Als Vorlage speichern, Neu aus Vorlage, Vorlagen getrennt | 10–13, 22 |
| §8.3 Archiv: archivieren/wiederherstellen, Archivansicht, archiviert nur lesbar | 11–13, 22 |
| Phase-3-Entscheidung 18 (bestätigt): Auswahlleiste, Ränder zurückgenommen, Spec §6.3, Tests/e2e | 21 |
| §10 Tests: Planoperationen, DOM-Tests über das Harness, e2e der neuen Abläufe | 1–23 |
| Hauptlauf: Release-Notiz ehrlich zum Stand nach Phase 4, eine Notiz | 22, 24 |
| Hauptlauf: Screenshots hell/dunkel, 1440×900, 1024×768, 390×844 | 24 |
| Hauptlauf: Phase 5 (Token, QR, A3, SVG-Export, Schwarzweiß) nicht angefasst | Global Constraints |
| Kritik: Upload in linearer Zeit (Typprüfung, SVG-Bereinigung), Review Focus 9 | 2, 3 |
| Kritik: Bedienaufwand (Akzeptanz A1) als gezählter Durchlauf | 24 |

## Abweichungen bei der Umsetzung

Was sich erst am laufenden Code zeigt. Jede Zeile nennt die Aufgabe, in der die Entscheidung fiel.

| # | Aufgabe | Befund | Entscheidung |
|---|---|---|---|
| U1 | 3 | Gegenproben: `MAX_CSS`, `"style"` aus `ELEMENTE`, `RASTER_DATA` + `svg` machen je einen Test rot. `verdichtet(…)` → `toLowerCase()` blieb grün (ein `fill` mit Tab-getrenntem `javascript:` ist für die Schad-Regex harmlos). `/^on/i` → `/^on/` und ein entfernter DOCTYPE-Vorabtest bleiben grün, weil die Attribut-Allowlist bzw. der Zerleger allein greifen. | Test „javascript: mit Steuerzeichen … das Attribut fällt ganz“ ergänzt (unter der Probe rot). Die beiden anderen Proben bleiben grün — gewollte Verteidigung in der Tiefe. |
| U2 | 6 | `route.test.ts` erwartete den Audit-Akteur ohne Namen; `auditActor` liefert `{ kind, id, name }`. | Erwartung auf `toMatchObject`. |
| U3 | 6–9, 12–13 | Dauerlast (Load bis 22). | `pnpm build` je über den gemeinsamen Endstand nach Task 9 (Routen `/logo`, `/einstellungen`) und nach Task 13 (`/archiv`), nach Task 17 (`/bibliothek`) — alle Exit 0 (Vorbild Phase 1 U6). |
| U4 | 11 | `Listenzeile` bekam `archiviert`; `PlanTabelle.test.tsx` (Task 13) hätte sonst den Typecheck des Task-11-Commits gebrochen. | Testdaten dort schon in Task 11 um `archiviert: null` ergänzt. |
| U5 | 13 | Der Doppelklick-Schutz nur über `useState` ließ im DOM-Test einen zweiten „Duplizieren“-Aufruf durch: das Menü im Portal trägt den Rückruf des vorigen Renders. | Zusätzlich eine synchrone Sperre per `useRef` (`sperre`). |
| U6 | 13 | `react-hooks/purity` verbietet `Date.now()` in der Planliste (RSC). | `heuteIso(new Date().getTime())` (Vorbild `files/(verwaltung)/posteingang/page.tsx`). |
| U7 | 13 | Der Kopie-Hinweis entfernt `?kopie=1` per `history.replaceState` aus der Adresse (Effekt ohne `setState`). | Wie geplant; e2e wartet vorher auf die URL mit `?kopie=1`. |
| U8 | 17 | Fokus beim Öffnen des Bibliotheks-Flyins: der Effekt im Formular läuft, bevor das Portal des `Drawer` steht (DOM-Test rot). | Neue Prop `BibFlyin.onGeoeffnet` über `afterOpenChange`, Effekt bleibt für die Neumontage — Muster `StelleFlyin` des Editors. |
| U9 | 17 | Der Plan gab `EinheitenBereich`/`VerbindungenBereich` nur als Skizze. | Nach dem Muster `StellenBereich` vollständig ausgeschrieben (Fokus, `runde`, „Speichern und nächste“). Test „lange Notiz“ griff die erste `Zellentext`-Zelle (Kontakte) — auf alle Zellen der Zeile umgestellt. |
| U10 | 19 | Testfall „Verbindung aus der Bibliothek“ öffnete die Auswahl zweimal (`oeffneAuswahl` + `waehleOption` schloss sie wieder). | Option direkt aus der offenen Liste geklickt. |
| U11 | 20 | „Angaben übernehmen“ nach dem Einfügen rief das beim Einfügen gefangene `aendere`: es sah den Stand VOR dem Einfügen und fand die neuen Stellen nicht (DOM-Test rot; im Editor derselbe Fehler). | Aufruf über `befehle.current.aendere` (nach jedem Rendern gesetzt). |
| U12 | 20 | Der Lastfall „Bibliothek im Kontext“ blieb unter der Gegenprobe „Anbieter ohne `useMemo`“ grün, weil der Anbieter außerhalb des Prüfstands stand. | Anbieter INNERHALB des Prüfstands (wie im Editor) — Gegenprobe jetzt rot (315 statt ≤ 10 Leser-Renders). `tasten.test`-Fälle über den Datei-Helfer `t()`. |
| U13 | 21 | Bestehende e2e griffen die alte Leiste als `getByRole("toolbar")`. | Auf `role="group"` umgestellt (Entscheidung 15). Die Tests aus Phase-3-Task 5 (Zeiger auf die Leiste ist kein Leerklick, Umschalter treffbar, 1024 px ohne Überdeckung) sind in Task 21 enthalten und grün. |
| U14 | 23 | Die Helfer `knopfImMenue`/`istBibAktion` braucht keine der Specs. | Nicht angelegt. Telefonfall: ein neuer Plan hat keine Zeile — erst „Erste Stelle anlegen“. Kopie-Hinweis steht in Diagramm und Gliederung — `filter({ visible: true })`. Eimer: `kommplan-bibliothek` → eimer-1, `kommplan-verwaltung` → eimer-2 (wenigste Specs; CI-Zeiten nicht gelesen). |
| U15 | 24 | Sichtprüfung: die neuen CSS-Regeln standen HINTER den Breakpoint-Blöcken und schlugen deren Telefonregeln (Werkzeugleiste der Bibliothek am Telefon nicht untereinander); die Kopfaktionen der Planliste blieben am Telefon schmal (Flex-Kind des Kern-Behälters); das Suchfeld der Bibliothek füllte ab 768 px die Zeile, „Neue …“ brach darunter. | `fix(kommplan): Telefonregeln …` — Regeln vor die Media-Blöcke, `.kp-kopfaktionen { flex: 1 1 100% }` am Telefon, `.kp-bib-suche { flex: 0 1 24rem }`; drei Quelltext-Tests in `kommplan-css.test.ts`. Fotos neu. |
| U16 | 24 | Logo im Druck: ein `<image>` per `<use>` aus dem gemeinsamen unsichtbaren SVG wird auf jedem Blatt gezeichnet (Foto `druck-logo-blatt2-desktop-light`, Blatt 2 von 4). | Annahme „An den Hauptlauf“ Punkt 5 für den Bildschirm belegt; „Als PDF sichern“ selbst nicht geprüft. |
| U17 | 24 | Zählung „Einsatz 22.02.2026“ (Akzeptanz A1): nicht von Hand durchgespielt. | Aus dem Bedienweg abgeschätzt — ohne Bibliothek ≈ 75 Schritte (Einfügen der Gliederung 1, Verbindungen ≈ 13, Kontakte ≈ 26, Zeichen ≈ 15, Einheitenlisten ≈ 12, Rest ≈ 8), mit Bibliothek ≈ 60 (Leitstelle per Alt+Enter statt 7 Kontaktschritten, Verbindungen aus der Bibliothek je ein Schritt weniger, Fahrzeuge per Mehrfachauswahl etwa gleich viele Schritte wie eine eingefügte Liste). Befund für den Hauptlauf: der Abstand ist kleiner als die Kritik schätzte; die Fahrzeugübernahme spart gegenüber „Liste einfügen“ kaum Schritte. |

## An den Hauptlauf (offene Annahmen, ClickUp fasst diese Umsetzung nicht an)

1. **Volume `kommplan_scan` auf dem Zielhost** (Entscheidung 4): lokal und in der CI liest der Fake-clamd den Pfad selbst; ob das neue benannte Volume auf dem Server den Eigentümer aus dem Image übernimmt (Dockerfile `mkdir`/`chown`, wie `/data/files`) und clamd es lesen darf (gemeinsame gid, `SUITE_USER`), sieht erst der Rollout. Fehlt es, scheitert **jeder** Logo-Upload laut mit „Die Virenprüfung ist gerade nicht möglich" (fail-closed), sonst bleibt alles heil. Nach dem Rollout einmal ein Logo hochladen. Nebenbefund zur Prüfung: `aufgaben_data` wird im `Dockerfile` nicht angelegt — ob dort derselbe Eigentümer-Effekt greift, ist hier nicht geprüft (Ticketkandidat, falls der Rollout es bestätigt).
2. **Entscheidung 7 bestätigen:** „Als Vorlage speichern" setzt `ist_vorlage` am Plan selbst (Spec §6.7 wörtlich); die Alternative „Kopie als Vorlage" ist eine Zeile in `planverwaltung.ts` plus Wortlaut in Oberfläche, Tests und Notiz. **Die Kritik empfiehlt die Kopie:** heute wandert der echte Einsatzplan (samt Datum im Titel) aus „Pläne" in „Vorlagen", und spätere Korrekturen am Einsatz verändern die Vorlage still. Entscheidung 8 dieser Fassung (Datum im Titel beim „Neu aus Vorlage" ersetzt, Datum heute) mildert den ersten Teil, nicht den zweiten.
3. **Alt+Enter unter Windows** (Entscheidung 14) ist ungeprüft (hier läuft nur macOS), wie Alt+V/Alt+Z in Phase 3 (U16).
4. **Kopfzeilen am Route Handler** (Entscheidung 3): die Herkunftsprüfung setzt voraus, dass hinter dem Reverse-Proxy `Origin` und `x-forwarded-host` (bzw. `host`) dieselbe Domain tragen; lokal und in der e2e ist das so, auf dem Zielhost unbelegt. Trifft es nicht zu, lehnt jeder Upload mit 403 ab (laut, nicht still). Nach dem Rollout einmal hochladen.
5. **`<image>` per `<use>` aus einem anderen Inline-SVG im Druck** (Entscheidung 6): dass `<use>` über SVG-Grenzen eines Dokuments trägt, belegen bisher nur `<symbol>`s; für ein `<image>` mit `data:`-URI im Chrome-Druck/„Als PDF sichern" belegt es erst die Sichtprüfung (Task 24, Foto `druck-logo-…`) bzw. ein Blick ins PDF. Trägt es nicht, je Blatt ein eigenes `<image>` (Größe × Blattzahl) oder das Logo in `<defs>` jedes Blatts — Entscheidung im Befund.
6. **Keine Modulnavigation** (Entscheidung 1): Bibliothek, Einstellungen und Archiv hängen an Links im Seitenkopf der Planliste. Eine Seitenleiste wäre konsistenter mit anderen Verwaltungsmodulen, verkleinerte aber die Editorfläche bei 1024 px um 218 px und machte die Geometrie aus Phase 2/3 ungültig.

## Kritik eingearbeitet/verworfen

Jeder Befund wurde am Code bzw. am Plantext geprüft, bevor er übernommen wurde. „Teilweise" heißt: Problem bestätigt, Abhilfe anders als vorgeschlagen.

| # | Befund | Ergebnis | Wo / Begründung |
|---|---|---|---|
| 1 | `SVG_ANFANG` mit geschachteltem Quantor läuft exponentiell | teilweise | Problem bestätigt (selbst gemessen: 24 Leerzeichen ≈ 15 ms, Verdopplung je zwei Zeichen; die Kritik nennt 26 ≈ 0,5 s). Der vorgeschlagene Ersatz-Regex mit einzelnem `\s` hängt aber weiter: `"<!-- a -->".repeat(30000)+"x"` lief nach Minuten noch, weil `<!--[\s\S]*?-->` über mehrere Kommentare reichen kann. Stattdessen ein Vorspann-Scanner mit `indexOf` (Task 2), Tests mit 100 000 Leerzeichen, Kommentaren und Deklarationen, Grenze 1 s statt 100 ms (Load). |
| 2 | CSS-Regexe und `URL_FN` quadratisch | eingearbeitet | Selbst gemessen (40 000 Zeichen ohne Klammer ≈ 0,8 s, 10 000 × `url(` ≈ 0,7 s, 40 000 × `@` ≈ 0,9 s). Linearer Zerleger für `<style>`, Kommentare und `url(` per `indexOf`, `<style>` über 64 KB abgelehnt (Task 3); Gegenprobe mit der alten Form macht den Laufzeittest rot. Den vorgeschlagenen Deckel für **Attributwerte** nicht übernommen: ein Pfad-`d` oder ein eingebettetes PNG ist legitim größer als 64 KB; alle Prüfungen darauf sind linear und mit 250 000 × `url(` und 150 000 Pfadsegmenten getestet. |
| 3 | `Bibliothek.test.tsx` sucht Flyin-Inhalt im Mount-Wirt | eingearbeitet | `query`/`fill`/`submitForm` des Harness suchen nur im Wirt (bestätigt). Lokale `fillPortal`/`submitPortal`, `queryPortal` für Flyin-Inhalt (Task 17); Regel in den Global Constraints. |
| 4 | `Griffe.test.tsx` fehlt in Task 21 | eingearbeitet | Die Datei prüft `.kp-griffleiste` und Inline-`top` (bestätigt). Ganz ersetzt: Reihenfolge, Seitenstelle, `maxWidth`, nur Auswahlrahmen an der Karte; Ankerschritt ergänzt. |
| 5 | `verbindungsOptionen.test`: „DMO 608" steht im Testplan | eingearbeitet | Bestätigt. `b2` ist jetzt „DMO 609", zusätzlich `b3` „DMO 608" als TMO für „andere Art → Option" (Task 20). |
| 6 | `oeffneEditor` löst an der Duplizieren-Antwort aus | eingearbeitet | `istStandAbfrage` passt auf `["<id>"]` (bestätigt). Im e2e gezielt auf eine Standabfrage ohne die Original-ID gewartet, die Action-Signatur bleibt (Task 23). |
| 7 | `getByRole("option")` trifft in antd 6 nicht | eingearbeitet | Bestätigt (`@rc-component/select`, virtuelle Liste); `.ant-select-item-option` wie in den übrigen Specs, Regel im Kopf von Task 23. |
| 8, 21 | e2e erbt Seed-Bibliothek | eingearbeitet | Beide Tests legen ihre Einheit bzw. Stelle (mit Leiter und Telefon) über die Bibliotheksseite selbst an; Helfer `legeBibStelleAn` (Task 23). |
| 9 | `plaene.test.ts`: dritter Fall und Länge | eingearbeitet | Bestätigt; Vorlage in `listePlaene(db, "vorlagen")` suchen, Länge gegen Nicht-Vorlagen (Task 11). |
| 10 | `NeuerPlan.test.tsx`: exakte Erwartung ohne `vorlage`, Mockname, `abwarten` | eingearbeitet | Bestätigt; bestehender Fall um `vorlage: null` ergänzt, neue Fälle mit `aktion.legePlanAnAction` und `await act(async () => {})` (Task 13). |
| 11 | `ladeSymbole(zeichenImPlan(neu))` nach jedem `aendere` | eingearbeitet | `symboleFuerSchluessel` lässt Unbekanntes weg (bestätigt) → Abruf je Taste. Nachladen nur in den Kopierwegen über die vorhandenen `ladeSymbole`-Props von Flyin und Gliederung (kein Kontext nötig, kein instabiler Wert im Kontext); `zeichenImPlan` entfällt; Editor-Test „Tippen löst keinen Abruf aus" als Gegenprobe (Tasks 18, 19). |
| 12 | Seed druckt „DRK Kreisverband …" als Bearbeiter | eingearbeitet | Bestätigt in den Beispielen „Label" und „OpenR"; neutral „Kreisbereitschaftsleitung"/„KBL", Suche um „DRK\|Kreisverband" erweitert. Kontaktwerte mit „drk" in Beispielen und Tests bleiben — Planinhalt, kein Briefkopf (Task 7). |
| 13 | Spec §6.3: Punkt ist zweizeilig | eingearbeitet | Bestätigt; Ersatz auf zwei Zeilen (Task 21). |
| 14 | `useBibliothek` in `VerbindungFeld` wäre ein bedingter Hook | eingearbeitet | Bestätigt (früher Rücksprung für die oberste Ebene); Platz direkt nach `useState` (Task 20). |
| 15 | Warmlauf-GET vor dem ersten POST auf `/logo` fehlt | eingearbeitet | Global Constraints und Briefkopf-e2e (405 erwartet, Task 23). |
| 16 | 403 der Herkunftsprüfung ohne `access_denied` | eingearbeitet | Bestätigt gegen die Route von `aufgaben` und `coverage.test.ts`. `auditDenied` im 403-Zweig, Manifest-Eintrag mit `denial`, Liste `expected` ergänzt, Zusicherung im Routentest nach dem Muster von `aufgaben` (Task 6). Die Rechte-Ablehnung auditiert `requireKommplanBearbeitenAktion` schon selbst. |
| 17 | `kp-zeile` an der Bibliothekszeile der Einheiten | eingearbeitet | Bestätigt (`.kp-g-einheiten .kp-zeile` dreispaltig ab 768 px). Eigene Klasse `.kp-bib-einheiten` mit `flex-wrap`, Foto der Gliederung mit aufgeklappten Einheiten (Tasks 19, 24). |
| 18 | Kopfaktionen am Telefon nicht voll breit | eingearbeitet | Bestätigt (Aktionsbehälter des Kern-`Seitenkopf` ohne Klasse). `div:has(> .kp-kopfaktionen)` im Telefon-Block, Messung am Foto (Tasks 8, 24). |
| 19 | Freitextspalten ohne `Zellentext` | eingearbeitet | Notiz (drei Bereiche, Vorschau) und Kontakte über `Zellentext` — API ist die Prop `text`, nicht Kinder; Test über den Testgriff `data-zellentext`, Foto mit 500-Zeichen-Notiz (Tasks 17, 24). |
| 20 | `.kp-g-vorschlaege` rückt doppelt ein | eingearbeitet | Bestätigt (`.kp-g-zeile` ist schon eingerückt). Regel ohne Ebenenterm, CSS-Test, Foto an tiefer Zeile am Telefon (Tasks 20, 24). |
| 21a | `role="toolbar"` ohne Pfeiltasten | eingearbeitet | `role="group"` (Task 21). |
| 21b | 2./3. Titelvorschlag ohne Tastatur unerreichbar | teilweise | Alt+1…3 **verworfen**: Alt+Ziffer wechselt in Chrome und Firefox unter Linux den Browser-Tab und erreicht die Seite nicht verlässlich; Alt+Enter-Weiterschalten trägt nicht, weil die Vorschläge nach der ersten Übernahme neu berechnet werden. Stattdessen: im Stellen-Flyin dieselben Vorschläge als echte Tabstopps plus die gezielte Suche „Aus Bibliothek" — der dokumentierte Weg ohne Zeiger (Entscheidung 14, Task 19). In der Gliederung bleibt Tab dem Einrücken. |
| 22 | Langer Titel läuft in Organisation/Logo | eingearbeitet | `kopfTitel` (halbe Punkte bis 10 pt, dann „…"), Organisation auf 80 mm gedeckelt, Test mit 200-Zeichen-Titel (Task 7). |
| 23 | Gesamtaufwand (A1) | eingearbeitet | Über die Einzelbefunde 24–31 und einen gezählten Durchlauf in Task 24; die Schätzung der Kritik ist dort als Vergleich genannt, nicht als Zusage. |
| 24 | „Neu aus Vorlage" übernimmt altes Datum | eingearbeitet | Titel per `ersetzeDatumImTitel(…) ?? titel` (nicht `titelFuerKopie`, das „ (Kopie)" anhinge), Datum heute, Anlass übernommen — nur bei gewählter Vorlage (Entscheidung 8, Task 13). Die Empfehlung „Als Vorlage speichern = Kopie" steht bei „An den Hauptlauf", Punkt 2; Entscheidung 7 bleibt bis dahin beim Wortlaut der Spec. |
| 25 | Mehrfachauswahl leert die Suche, keine Doppel-Warnung | eingearbeitet | `autoClearSearchValue: false` (in `@rc-component/select` 1.10.1 Teil von `showSearch`, bestätigt); hier vorhandene gesperrt, anderswo eingesetzte mit „— schon bei …" und hinten; `einsatzOrte` als reine Funktion (Tasks 18, 19). |
| 26 | Fokusverlust an drei Stellen | eingearbeitet | „Aus Bibliothek" → Fokus ins Titelfeld (Effekt nach der Neumontage), „Hinzufügen" → zurück in die Auswahl, „In Bibliothek übernehmen" nur `loading`; je ein DOM-Test auf `document.activeElement` (Task 19). |
| 27 | Auswahlleiste am Telefon, „Bearbeiten" außerhalb | eingearbeitet | Reihenfolge „Bearbeiten" zuerst, Name unter 768 px ausgeblendet, Schattenkante per reinem CSS mit `--kp-*`-Token für hell/dunkel, e2e bei 390 × 844 (Entscheidung 15, Task 21). |
| 28 | Titelvorschläge nur in der Gliederung | eingearbeitet | Dieselbe Komponente unter dem Titelfeld des Flyins, Alt+Enter dort ebenso (`onPressEnter` ignoriert Alt), Test (Task 19). |
| 29 | „In Bibliothek übernehmen" nur für Stellen | teilweise | Eingearbeitet: Einheiten der Stelle über die Import-Action (`ImportErgebnis` trägt jetzt `eintraege`), Verbindungen des Plans über **eine** neue Action `importiereBibVerbindungenAction` (keine Schleife einzelner Aufrufe — Server Actions laufen nacheinander und stellten sich vor das Autosave), Stellen-Dublette mit „Eintrag in der Bibliothek aktualisieren" (Tasks 14, 16, 19). Verworfen: „Aus einem Plan übernehmen" auf der Bibliotheksseite — die Wege im Editor decken denselben Zweck, ein zweiter Importweg wäre eine weitere Oberfläche ohne neuen Nutzen. |
| 30 | Eingefügte Gliederung gleicht nicht mit der Bibliothek ab | eingearbeitet | `bibStellenTreffer` (rein) und Hinweis mit „Angaben übernehmen" in einem Rückgängig-Schritt; der Hinweis des Editors bekommt dafür eine Aktion (Tasks 13, 18, 20). |
| 31 | Duplizieren ohne Rückmeldung, Doppelklick | eingearbeitet | „Aktionen" der Zeile `loading`, andere gesperrt bis zur Navigation; `?kopie=1` zeigt im Editor einmal den Hinweis mit „Angaben ändern" (Entscheidung 9, Task 13). „Duplizieren" in der Kopfleiste des Editors nicht übernommen (optional in der Kritik; die Kopfleiste ist am Telefon schon voll). |
| 32 | Bibliotheks-Flyin ohne Fokus, kein „Speichern und nächste" | eingearbeitet | Fokus im ersten Feld (Effekt, `autoFocus={false}` am `Drawer` wie im Editor), „Speichern und nächste" beim Anlegen, DOM-Test (Entscheidung 11, Task 17). |
