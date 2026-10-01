# Kommunikationspläne — Lieferphase 5: Token-Links, A3, Schwarzweiß, SVG-Export, QR, Vorlage als Kopie — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bearbeitende stellen im Editor über „Teilen" Token-Links aus (24 h, 7 Tage, 30 Tage, unbegrenzt; mit Notiz; kopieren, widerrufen; Abrufe sichtbar), unter denen jeder ohne Anmeldung den aktuellen Stand des Plans liest und druckt — und sonst nichts: unbekannt, abgelaufen, widerrufen oder archiviert ist ein ununterscheidbares 404. Gedruckt wird in A4 oder A3 quer (Menü „Drucken"), wahlweise schwarzweiß, mit QR-Code „Aktuelle Fassung" auf einen gültigen Link; jedes Blatt lässt sich als eigenständige SVG-Datei herunterladen. „Als Vorlage speichern" legt künftig eine Kopie als Vorlage an. Die Release-Notiz wird die endgültige Notiz des Moduls.

**Architecture:** Fachliches bleibt rein und getestet: Ablauf, Status, QR-Wahl, Tokenform und URL (`_lib/freigabe/regeln.ts`), Dateiname (`_lib/dateiname.ts`), QR-Grafik aus dem SVG der Bibliothek (`_lib/qrGrafik.ts`), Platz für den QR im Papierlayout (`_lib/layout/papier.ts`). Datenbankzugriffe stehen in `_lib/freigaben.ts` (mit der echten Migration in einer In-Memory-DB getestet), die Auflösung eines Tokens je Anfrage in `_lib/tokenZugang.ts` (React `cache`, Fehlversuchs-Schranke aus `core/ratelimit`, entprellte Abrufzählung). Die Token-Routen liegen außerhalb von `(intern)` unter `t/[token]/` mit eigenem Riegel im `layout.tsx` (Falle 23); Antwortköpfe (`X-Robots-Tag`, `Referrer-Policy`, `Cache-Control`) setzt der Proxy, weil eine Seite das nicht kann. Der Druck wird eine gemeinsame Server-Komponente (`_ui/druck/Druckseite.tsx`) für vier Routen (intern/Token × A4/A3) mit einem Stylesheet und zwei benannten `@page`. Schwarzweiß ist ein zweites, eingechecktes Rezept-Generat (`PRINT_MONOCHROME_THEME`), der SVG-Export ein DOM-Abschluss über die referenzierten `<defs>` plus eingebettete Arimo.

**Tech Stack:** Next.js 16 (App Router, RSC, Proxy), React 19 mit React Compiler (`cache`), TypeScript, zod 4, Drizzle + better-sqlite3, antd 6.6.4 (`Drawer`, `Dropdown`, `Radio.Group`, `Popconfirm`, `Switch`), `core/ratelimit`, `core/qr` (`qrcode`), `core/shell/moduleUrl`, `@einsatzzeichen/core` (`PRINT_MONOCHROME_THEME`, nur im Generatorskript), Vitest 4 (jsdom über `src/app/m/qr/_lib/test-dom.tsx`), Playwright mit `pdf-lib`.

**Spec:** `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§3, §4.1, §4.2, §5.6, §6.1, §6.2, §6.7, **§8.1, §8.2**, §8.3, §9, §10, §11 Phase 5). Die Umsetzungspläne `docs/superpowers/plans/2026-09-30-kommplan-phase-1.md` bis `…-phase-4.md` gelten samt ihren Abschnitten „Abweichungen von der Spec", „Entscheidungen dieser Phase" und „Abweichungen bei der Umsetzung" weiter; wo dieser Plan davon abweicht, steht es unten ausdrücklich (betroffen: Phase-2-Entscheidung 20 „Drucken (A4 quer)", Phase-4-Entscheidung 7 „Vorlage am Plan selbst", Phase-4-Entscheidung 17 „Release-Notiz in drei Absätzen").

**Ticket:** DRK-500. Ticketnummer in jeden Commit-Body. ClickUp pflegt der Hauptlauf, nicht diese Umsetzung.

## Global Constraints

- Arbeitsverzeichnis ausschließlich `/Users/rubeen/dev/personal/drk/iuk-suite/.claude/worktrees/drk-363-8c5335`; nie `cd` ins Haupt-Repo. Nicht pushen. ClickUp nicht anfassen.
- Deutsche Texte mit echten Umlauten (`ä ö ü Ä Ö Ü ß`); Bezeichner, Datei- und Branchnamen ASCII (`~/.claude/CLAUDE.md`). Dateinamen der SVG-Downloads sind Bezeichner: ASCII.
- `CLAUDE.md` gilt vollständig. Für diese Phase besonders: Falle 1 (kein antd-Compound in RSC — `Radio.Group`, `Input.TextArea`, `Popconfirm`, `Dropdown` nur in Client-Inseln; Token-Rahmen, Token-Kopf, Token-404 und Druckseite sind Server-Komponenten **ohne** antd; antd kommt auf der Token-Route nur über die Client-Inseln `Betrachter` und `DruckMenue`, Entscheidung 8), 2 (eigenes Markup nimmt `--kp-*`, nie `--ant-*`), 3 (Rot nie auf der Datenfläche — der VS-NfD-Vermerk der Token-Ansicht ist neutral, nicht rot; im **eigenen Markup** der Token-Ansicht Suite-Rot nur Fahne und Wortzeichen, docs/design/feedback-oeffentliche-ansicht.md; die antd-Bedienknöpfe von Betrachter und Druckmenü behalten das Suite-Thema und färben Hover und Fokus rot — keine rote Fläche, kein `type="primary"` auf der Token-Route, Entscheidung 8), 4 (kein `size`; auf der Token-Route ohne Hülle gilt 56/72), 5, 6 (Werte für Server Components nie aus `"use client"`-Modulen — `TEILEN_FLYIN_GRUND` steht im Client-Modul, wird aber nur von Client-Modulen gelesen), 7 (keine `@ant-design/icons`; der Pfeil am Druckmenü ist Inline-SVG), 9 (Server Actions direkt importieren, nie als Prop), 10 (jede ausgelöste Anfrage im e2e per `waitForResponse`), 12 (`klickeWennRuhig`, `warteAufSpaltenaufteilung`), 13 (`flyinBreite()` für jede `Drawer`), 18 (benanntes `@page` mit ausgeschriebenen Kantenlängen, A3 eigene Route), 20 (keine Regel gegen einen `.ant-*`-Namen), 21 (`NODE_ENV` eingebacken — Header- und Downloadtests über `pnpm e2e:gebaut`), 22 (`warteAufGestreamteInhalte` vor Zählungen), 23 (Token-404 im `layout.tsx`, keine `loading.tsx` unter `t/`).
- **Zugriffsschutz:** Jede neue Seite unter `(intern)` ruft `requireKommplanHost(await headers())` und `await requireKommplanZugang()` je genau einmal (`riegel.test.ts`). Jede Datei unter `t/[token]/` ruft `requireKommplanHost(await headers())` und `await tokenPlanOder404(` je genau einmal, **nie** `requireKommplanZugang`, `auth(`, `ladePlan…` oder etwas aus `_actions/` (Task 8 hält das fest). Jede Server Action beginnt mit `const viewer = await requireKommplanBearbeitenAktion();` als **erster** Anweisung und löst jede ID in der Datenbank auf (IDOR) — ein Link wird immer über **(id, planId)** gefunden, nie über die ID allein. Oberfläche und Riegel wenden dasselbe Prädikat an: „Teilen" gibt es nur im Editor (`darfKommplanBearbeiten`, nicht archiviert).
- **Sicherheit der Token-Route hat Vorrang vor Bequemlichkeit** (Vorgabe des Hauptlaufs): kein Planinhalt, kein Briefkopf, keine Plan-ID kommt ohne gültigen Token heraus; Plan-IDs stehen nie in der Token-URL und nie im HTML oder in den Flight-Daten der Token-Seiten.
- **Bauform der Action-Dateien** (`_actions/plan.test.ts`): Datei beginnt auf Byte 0 mit `"use server";`; nur Actions exportiert; Parameterliste ohne `)`; Signatur ohne `{` vor dem Rumpf — Rückgabetypen als benannte Typen aus `_lib/ergebnis.ts`. Jede Action steht in `src/core/audit/coverage-manifest.json` (`{ "kind": "context", "via": "<Name>" }`, Rumpf mit `withAuditContext`).
- Neue reine Module (`_lib/freigabe/`, `_lib/dateiname.ts`, `_lib/qrGrafik.ts`) sind ohne `"use client"`, ohne `next/*`, `node:*`, `react-dom`; `grenze.test.ts` bekommt die Pfade in die Liste der geteilten Ordner. Server-Code mit `node:crypto`/Datenbank steht in `_lib/freigaben.ts`, `_lib/tokenZugang.ts`, `_lib/druckdaten.ts`.
- React Compiler ist an, `react-hooks/set-state-in-effect` und `react-hooks/purity` sind aktiv: kein `setState` im Effekt-Rumpf, kein `Date.now()` im Rendern — in Server Components `new Date().getTime()` (Vorbild Phase-4-U6), in Actions `Date.now()`.
- Hell/Dunkel über `<html data-theme>`, nie `prefers-color-scheme`. Neue Farben als `--kp-*` in `:root` **und** `:root[data-theme="dark"]`; neue Regeln unter einem Breakpoint in die **vorhandenen** Blöcke von `_ui/kommplan.css` (Phase-4-U15: Regeln vor den Media-Blöcken).
- **Zeit:** nie `timeZone` als Literal, nie `new Intl.DateTimeFormat({ timeZone })` auf Modulebene; `zeitFormat(locale, optionen)` aus `core/zeit`. Jede Funktion, die „jetzt" braucht, bekommt `jetzt: number` als Argument; Tests nutzen feste Zeitpunkte.
- Tests, die an eine bestehende Testdatei angehängt werden, führen ihre Importe in die **vorhandenen** Importzeilen zusammen (`pnpm lint`).
- DOM-Tests nur über `src/app/m/qr/_lib/test-dom.tsx` (`mount`, `rerender`, `unmount`, `query`, `queryAll`, `exists`, `fill`, `click`, `clickElement`, `submitForm`, `queryPortal`, `existsPortal`, `clickPortal`), Kopfzeile `// @vitest-environment jsdom`, `afterEach(async () => { await unmount(); … })`. `query`/`fill` suchen nur im Mount-Wirt — Flyin- und Menüinhalt (Portal) über `queryPortal`/`document.querySelectorAll`. Das Harness bleibt unverändert.
- antd 6.6.4: `Drawer` mit `size={flyinBreite(n)}`; `Dropdown` mit `menu={{ items, onClick }}`; `Alert` mit `title=`; `Radio.Group` mit `options` und `optionType="button"`. Im Zweifel antd-MCP (`ToolSearch` „antd", dann `antd_doc`/`antd_demo`).
- Next-Guides vor dem ersten Code, der die API benutzt, lesen: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (Abschnitt „Setting Headers", Reihenfolge der Ausführung), `…/03-file-conventions/layout.md` und `…/03-file-conventions/dynamic-routes.md` (`params` als Promise), `…/04-functions/not-found.md`, `…/04-functions/generate-metadata.md` (Felder `robots`, `referrer` des statischen `metadata`), `…/02-guides/self-hosting.md` (Cache-Control dynamischer Seiten), `…/02-guides/caching…` bzw. die React-Doku zu `cache` (Deduplizierung je Anfrage).
- **Kommentaranker** in neuem Code nennen **Namen**, nie Zeilen (`pnpm anker:neu` bricht die CI). **Ankerschritt** vor jedem Commit, der eine bestehende Datei ändert: `git grep -n "<dateiname>:[0-9]" -- src scripts e2e docs` und `pnpm anker:drift <datei>`; ein Anker, der vorher zutraf und hinter der Änderungsstelle liegt, wird **in derselben Zeile** in die Namensform umgeschrieben. Nie eine Zahl nachziehen, nie beim Kommentaraufräumen eine Zeile dazu oder weg. **Besonders betroffen:** `src/proxy.ts`, `src/core/routing.ts` (viele Zeilenanker in `docs/*-portierung-analyse.md` und in Code-Kommentaren — neue Funktionen deshalb **ans Dateiende**), `src/core/audit/coverage-manifest.json`, `e2e/gruppen.json`, `scripts/kommplan-zeichen-generat.ts`, alle geänderten kommplan-Dateien, die Spec. `src/core/registry.ts` wird in dieser Phase **nicht** geändert.
- Signierte Commits (`git commit -S`), Kopfzeile nach Conventional Commits: `feat(kommplan): …` für neue Funktion, `fix(kommplan): …`, `test(kommplan): …`, `refactor(kommplan): …`, `docs: …`, `feat(core): …` nur für die Proxy-Köpfe (Task 6). Body mit einer Zeile `DRK-500` und am Ende `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Jeder Commit besteht `pnpm typecheck`** (Exit-Code prüfen).
- Last: andere Sessions laufen parallel (Load oft zweistellig). Vor jedem Urteil über einen roten Test `uptime`; bei Load > 10 die betroffene Datei einzeln oder den CI-Weg (`pnpm e2e:gebaut` bzw. `E2E_VORGEBAUT=1`). Fremde Prozesse nie beenden. Kein `pnpm dev` offen lassen; `git checkout -- next-env.d.ts` nach jedem e2e-Lauf. `scripts/backup-sidecar.test.ts` ist auf macOS rot (DRK-501) — nicht dein Thema. Funde außerhalb von kommplan nur beheben, wenn sie ein Tor blockieren, und in „Abweichungen bei der Umsetzung" als **Ticketkandidat** eintragen.
- Aufgaben, die Routen, Route Handler, Server Actions oder den Proxy anlegen oder ändern, fahren zusätzlich `pnpm build`. Unter Dauerlast dürfen benachbarte Aufgaben sich einen Build über den gemeinsamen Endstand teilen (Vorbild Phase-1-U6, Phase-4-U3) — vermerken.
- **e2e und die Fehlversuchs-Schranke:** die Schranke lebt im Prozessspeicher des einen Servers einer Gruppe (`workers: 1`). Ohne `cf-connecting-ip` zählen alle Anfragen gegen den Sammeleimer `"unknown"`. Jeder anonyme Kontext im e2e setzt deshalb **eigene** `extraHTTPHeaders: { "cf-connecting-ip": ip(n) }` mit `ip(n) = 2001:db8:<LAUF>::<n>` (IPv6-Dokumentationsnetz, RFC 3849; `LAUF` = vier Zufalls-Hexziffern, beim Laden der Spec-Datei gezogen): **je Test UND je Versuch eine andere Adresse** — ein CI-Wiederholungslauf (`retries: 1`) startet einen neuen Worker und zieht damit ein neues `LAUF`, ebenso ein zweiter lokaler Lauf gegen einen wiederverwendeten Server; sonst träfe er die Fehlversuche des ersten Versuchs, und ein Flake würde sicher rot. `clientIpAus` prüft die Form nicht, der Schlüssel bleibt unter `SCHLUESSEL_MAX_ZEICHEN` (64). Kein `203.0.113.x`-Literal in den e2e-Specs (die Unit-Tests der Schranke in Task 7 haben ihren eigenen Speicher und dürfen feste Adressen nehmen).
- Tore vor dem Abschluss: `pnpm typecheck` · `pnpm lint` · `pnpm anker:neu` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts e2e/kommplan-gliederung.spec.ts e2e/kommplan-bibliothek.spec.ts e2e/kommplan-verwaltung.spec.ts e2e/kommplan-teilen.spec.ts` (Header-, PDF- und Downloadfälle zusätzlich über `pnpm e2e:gebaut`).

## Entscheidungen dieser Phase (Abweichungen von Spec und früheren Plänen)

1. **Keine Migration.** `plan_freigabe` (Phase 1, Abweichung 9) trägt alle Spalten aus Spec §8.2: `token` eindeutig (`plan_freigabe_token_idx`), `plan_id` mit Fremdschlüssel und Index, `ablauf` null = unbegrenzt, `widerrufen_am`, `erstellt_*`, `zuletzt_abgerufen`, `abrufe`; im Audit-Katalog sind `zuletzt_abgerufen` und `abrufe` schon `unauditedColumns` (Ausstellen = `create`, Widerrufen = `update`, Zählen = nichts). Grenzen, die die Datenbank nicht braucht, hält der Code: Notiz höchstens 200 Zeichen, höchstens 20 **gültige** Links je Plan (Schutz gegen versehentliche Massenausstellung; abgelaufene und widerrufene zählen nicht). `schema.test.ts` bekommt einen Fall, der die Annahme festhält (Spalten, Eindeutigkeit, Audit).
2. **Token:** `randomBytes(32).toString("base64url")` — genau 43 Zeichen `[A-Za-z0-9_-]`, im Klartext gespeichert (Spec §8.2). Vor jeder Datenbankabfrage prüft `istTokenForm` die Form; eine falsche Form ist ein Fehlversuch wie ein unbekannter Token.
3. **Gültig** heißt: nicht widerrufen, `ablauf` null oder **größer** als jetzt (genau an der Grenze abgelaufen), Plan nicht archiviert. Ablauf wird als Dauer ab „jetzt" gerechnet (24 h, 7 × 24 h, 30 × 24 h), nicht als Kalendertag — ein am Abend ausgestellter 24-h-Link gilt bis zum nächsten Abend. Abgelaufene und widerrufene Links bleiben in der Liste sichtbar (unter „Abgelaufen und widerrufen", ohne „Link kopieren"), gelöscht wird nie. **Archivieren widerruft** (Kritik, Sicherheit vor Bequemlichkeit): `archiviere` setzt in derselben Transaktion `widerrufen_am = jetzt` an allen gültigen Links des Plans (je Link eine Audit-Zeile `update`; schon widerrufene behalten ihren Zeitpunkt). Wiederherstellen erweckt also **keinen** Link wieder — sonst würden alte, auch unbegrenzte Links still wieder gültig, die während der Archivzeit niemand sehen oder widerrufen konnte (archiviert gibt es kein „Teilen"). Der Preis, bewusst: „Rückgängig" direkt nach dem Archivieren holt den Plan zurück, die Links nicht; wer weiter teilen will, stellt neue aus (das Flyin zeigt die alten unter „Abgelaufen und widerrufen"). Der Listenhinweis bleibt dafür ohne Zusatz — die Zahl der widerrufenen Links bräuchte einen neuen Ergebnistyp für eine seltene Lage. `loeseToken` prüft `archiviert_am` trotzdem weiter (doppelter Boden).
4. **Ein Tokenabruf wird je Anfrage genau einmal aufgelöst** (`tokenAbruf = cache(…)` in `_lib/tokenZugang.ts`): Layout und Seite rendern parallel und fragen beide; Fehlversuch und Abrufzählung buchen nur im ersten Aufruf. Die gecachte Funktion gibt `null` zurück, `notFound()` rufen Layout und Seite selbst (`tokenPlanOder404`) — keine im Cache gespeicherte Ausnahme. Unter `t/` gibt es **keine** `loading.tsx` (Falle 23); die Prüfung steht trotzdem im `layout.tsx`, damit eine spätere Ladegrenze das 404 nicht still zu 200 macht. **Eigene 404-Seite** `t/not-found.tsx` (Kritik; Muster Zustand F in docs/design/feedback-oeffentliche-ansicht.md): sie ist die Not-Found-Grenze des Segments `t` und fängt damit das `notFound()` aus `t/[token]/layout.tsx` (das Kind-Segment liegt innerhalb ihrer Grenze) — sonst landete der Empfänger auf der Suite-404 mit „wende dich an die Administration" und „Zur Startseite", also bei einer Anmeldung, die er nicht hat. Inhalt, für alle Fälle gleich: im `TokenRahmen` H1 „Dieser Link gilt nicht (mehr)." und „Vielleicht ist er abgelaufen, widerrufen oder unvollständig kopiert. Bitte die Person, die ihn dir geschickt hat, um einen neuen." — kein Knopf, kein Link auf `/`, keine Anmeldung, nichts aus der Datenbank. Status 404 und die Proxy-Köpfe bleiben; dass die Grenze das Layout-`notFound()` wirklich fängt, belegt `pnpm e2e:gebaut` (Task 15).
5. **Fehlversuchs-Schranke** (`core/ratelimit`, Vorbild `feedback` `tokenGuard`): je Absender (`clientIpAus`) höchstens 30 Fehlversuche (unbekannt, falsche Form, abgelaufen, widerrufen, archiviert) je Minute. **Gesperrt heißt 404 ohne Datenbankabfrage — auch für einen gültigen Token derselben Adresse** (Sicherheit vor Bequemlichkeit: sonst wäre die Sperre ein Orakel). Gültige Abrufe buchen nichts. **Warum 30 und nicht 10** (Kritik): der Schutz kommt aus der Entropie (2^256), die Schranke bremst nur; ein abgeschnittener Link, den eine ganze Führungsstelle hinter derselben öffentlichen Adresse ein paar Mal neu lädt, soll nicht für eine Minute auch alle gültigen Links dieser Adresse sperren. 60 wäre ebenso sicher, verlängert aber den e2e-Schrankentest so, dass er unter Last das gleitende 60-s-Fenster überschreiten kann. Preis, bewusst hingenommen und riskante Annahme: ohne `cf-connecting-ip` (lokal, http im LAN, Direktzugriff am Proxy vorbei) teilen sich alle den Eimer `"unknown"` — wer dann dreißigmal rät, sperrt eine Minute lang alle Token-Ansichten dieses Prozesses; das ist eine Rollout-Bedingung („An den Hauptlauf" 2), kein eigener Eimer. Auf dem Zielhost kommt `cf-connecting-ip` laut `src/proxy.ts` (Rewrite intern, Messbericht 2026-08-22) unverfälscht an.
6. **Abrufe zählen ohne Schreiblast:** ein `UPDATE plan_freigabe SET abrufe = abrufe + 1, zuletzt_abgerufen = ?` (ein Statement, kein Lesen davor, keine Audit-Zeile) je Seitenabruf (Ansicht **oder** Druck); dieselbe Adresse und derselbe Link zählen binnen 60 s nur einmal (zweiter `RateLimiter` mit `max: 1` als Entpreller). Neuladen, ein Druck direkt nach dem Ansehen oder ein Bot im Takt schreiben also höchstens einmal je Minute und Adresse. `zuletzt_abgerufen` kann dadurch bis zu 60 s alt sein; „Abrufe" ist eine Größenordnung, keine Zählung einzelner Klicks — so steht es im Flyin („Abrufe" ohne Zusatz).
7. **Antwortköpfe im Proxy** (Spec §8.2 `noindex`, `Cache-Control: no-store`; dazu `Referrer-Policy: no-referrer`, damit der Token nicht per `Referer` an verlinkte Seiten geht): eine Seite kann keine Köpfe setzen. `src/core/routing.ts` bekommt am Dateiende `antwortKoepfeFuer(internerPfad)` (eine Liste vertraulicher Ansichten, heute nur `/m/kommplan/t/`), `src/proxy.ts` am Dateiende `mitVertraulichenKoepfen(antwort, anfragePfad)` und ruft sie in `proxy()` nach dem Rewrite-Rückschreiben. Gemessen wird am **internen** Pfad (Rewrite-Ziel, sonst Anfragepfad), damit `/t/x` auf dem Modul-Host und `/m/kommplan/t/x` gleich behandelt werden — auch beim 404. Köpfe: `x-robots-tag: noindex, nofollow, noarchive`, `referrer-policy: no-referrer`, `cache-control: no-store` (Next setzt bei dynamischen Seiten selbst `private, no-cache, no-store, …`; zugesichert wird „enthält `no-store`"). Dazu statische Metadaten an jeder Token-Seite (`robots: { index: false, follow: false, nocache: true }`, `referrer: "no-referrer"`, Titel „Kommunikationspläne" — der Modulname, typneutral, ohne Plantitel; eine Fernmeldeskizze hieße sonst im Tab „Kommunikationsplan") — **kein** `generateMetadata`, das die Datenbank anfasst. Kein Registry-Feld: `registry.ts` trägt Dutzende Zeilenanker in fremden Dokumenten, und eine einzelne Ansicht rechtfertigt kein neues Modulfeld.
8. **Token-Ansicht** `/t/[token]`: eigener Rahmen `_ui/token/TokenRahmen.tsx` nach docs/design/feedback-oeffentliche-ansicht.md (3-px-Fahne und Wortzeichen „IDA" als einzige Suite-Rot-Stellen des eigenen Markups, Kicker „KOMMUNIKATIONSPLÄNE" — der Modulname, typneutral wie der `<title>`; die Art steht in der Angabenzeile), **keine** Suite-Hülle, kein App-Umschalter, kein Login-Hinweis. **Abweichung vom Abendzettel** (Kritik): jener ist „ohne antd" gebaut; die Token-Ansicht lädt antd über den `Betrachter` (die Spec verlangt **denselben** Betrachter) und über das `DruckMenue`. Der Rahmen selbst, `TokenKopf` und die 404-Seite bleiben ohne antd. Folgen: ohne Hülle gilt die Bediendichte 56/72 (README, Falle 4) — Task 16 misst die Knopfhöhen; die antd-Knöpfe färben Hover und Fokus in Suite-Rot (`colorPrimary`), keine Fläche, kein `type="primary"`. Neutrale Bedienknöpfe für öffentliche Ansichten wären ein `ConfigProvider` mit eigenem Hell/Dunkel-Satz — **Ticketkandidat** (öffentliche Ansichten mit antd-Inseln, zusammen mit dem Rahmen unten). **Höhe** (Kritik): die Seite ist eine `100dvh`-Spalte (`.kp-token-seite`/`.kp-token-blatt` als Raster mit `grid-template-rows: auto auto minmax(0, 1fr)`), der Betrachter füllt den Rest (`.kp-token-flaeche` mit `min-height: 0`, `.kp-token-flaeche .kp-betrachter { height: 100%; min-height: 320px }`) — sonst ist die Seite am Telefon höher als der Schirm, und jede Wischbewegung auf dem Betrachter verschiebt das Diagramm statt der Seite. Am Telefon stehen Angaben und Stand in einer Zeile, der Vermerk inline. Darunter ein HTML-Kopf (`TokenKopf`): Organisation und Logo aus dem Briefkopf (Logo als `<image>` mit `data:`-URI in einem kleinen Inline-SVG — kein `<img>`, keine Bildroute, ein SVG-Logo führt dort kein Skript aus), Plantitel als `h1`, „Art · Anlass · Datum", „Stand 30.09.2026, 14:05 · Bearbeitung: …", der VS-NfD-Vermerk als neutral umrandete Zeile (wenn die Option an ist) und das Druckmenü (A4/A3, Ziel `/t/<token>/druck/…`). Darunter **derselbe** `Betrachter` (Zoom, Verschieben, Einklappen, Legende) mit dem aktuellen Stand. Der Rahmen ist eine eigene Datei im Modul statt `files/_ui/OeffentlicherRahmen.tsx` (kein Modul importiert aus einem anderen) — **Ticketkandidat:** öffentlichen Rahmen nach `core` heben, sobald beide ihn teilen sollen.
9. **Token-Druck** `/t/[token]/druck/a4` und `…/a3`: dieselbe Druckseite ohne SVG-Export. Der QR-Code auf dem Token-Druck codiert **den benutzten Token** — nie den „besten" Link des Plans: sonst bekäme, wer einen 24-h-Link hat, beim Drucken den unbegrenzten (Review Focus 1).
10. **QR auf dem internen Druck** (Option `qrAufDruck`, Spec §8.2): unter den gültigen Links des Plans gewinnt „unbegrenzt", sonst der späteste Ablauf, bei Gleichstand der zuletzt ausgestellte (`waehleQrFreigabe`). Basis-URL ist `moduleUrl("kommplan")` (aus `SUITE_HOST_KOMMPLAN` über `prodHostsFor`, lokal `http://kommplan.localtest.me:<PORT>`) — nie der Request-Host (Vorbild `radio/admin/(druck)/zugaenge/blatt/page.tsx`). Liefert `moduleUrl` `null`, gibt es keinen QR, und „Link ausstellen" ist gesperrt mit dem Hinweis „Für die Kommunikationspläne ist keine Adresse eingerichtet. Links lassen sich erst ausstellen, wenn der Betrieb sie festlegt." Ohne gültigen Link kein QR, und im Flyin „Plan und Verbindungen" steht unter dem Schalter „Ohne gültigen Link druckt der Plan keinen QR-Code." mit dem Knopf „Link ausstellen", der direkt auf das Flyin „Teilen" umschaltet (Kritik: vorher reiner Text, zwei getrennte Flyins). **Wohin der QR führt, steht da, wo man ihn einschaltet** (Kritik — ein einziger 24-h-Link hinge sonst am nächsten Tag als toter QR im Führungsraum): bei eingeschaltetem QR und gültigem Link sagt `qrZielSatz` „Der QR-Code führt auf „Aushang“ – unbegrenzt gültig." bzw. „… – gültig bis 02.10.2026, 20:00; danach führt der Ausdruck ins Leere." — im Plan-Flyin, im Teilen-Flyin und in der `noprint`-Leiste der internen Druckseite. Der Editor wählt dafür aus seinem Freigaben-Zustand mit `besteFreigabe` (dieselbe Rangfolge wie `waehleQrFreigabe`, aber ohne Uhr über den vom Server berechneten Status — kein `Date.now()` im Rendern); die Druckseite rechnet frisch. Das Teilen-Flyin trägt denselben Schalter „QR-Code „Aktuelle Fassung“ auf dem Ausdruck" (dieselbe Option `qrAufDruck`, eine Quelle, zwei Orte) — wer einen Link ausstellt, sieht dort, ob der Ausdruck ihn trägt.
11. **Platz für den QR** (Spec §5.6 nennt ihn nicht): `QR_BOX = { kante: 24, beschriftung: 4, luft: 3 }` mm unten rechts, direkt über der Fußzeile; darüber die Beschriftung „Aktuelle Fassung" (7 pt). Gemessen mit `qrcode` (Fehlerkorrektur H, Rand 4, `core/qr` unverändert) an **echten** Tokens (`randomBytes(32).toString("base64url")`, 300 Läufe; Kritik: `"A".repeat(43)` kodiert alphanumerisch und täuscht Version 7 vor): eine 72-Zeichen-URL `https://kommplan.iuk-ue.de/t/<43>` wird als Byte-Segment kodiert und ergibt **immer Version 8 = 49 Module + 8 Rand = 57** → bei 20 mm nur 0,35 mm je Modul, deshalb 24 mm → **0,42 mm**. Ein längerer Produktionshost (ab ≈ 87 Zeichen URL) ergibt Version 9 = 61 → 0,39 mm. Reserviert wird **nur**, wenn tatsächlich ein QR gedruckt wird (`teileAuf(inhalt, format, { qr: true })`); dann endet die Zeichenfläche über der QR-Box, und die Legende wird um `kante + luft` schmaler. Ohne QR ist alles bytegleich zu vorher (Golden-Tests unverändert). Preis: einen Link auszustellen kann Maßstab und Blattzahl des Drucks ändern (Review Focus 5).
12. **„Drucken" als geteilter Knopf** (ersetzt Phase-2-Entscheidung 20; Kritik: ein reines Menü kostete im Regelfall A4 zwei Klicks, und per Tastatur blieb der Fokus nach Enter am Knopf): `Space.Compact` aus dem Knopf „Drucken", der **direkt A4 quer** druckt, und einem Pfeilknopf „Weitere Druckformate" (`Dropdown` mit `autoFocus`, `trigger={["click"]}`) mit „A4 quer" und „A3 quer" — intern zusätzlich die Gruppe „SVG-Dateien" (Entscheidung 15). `Dropdown.Button` ist in antd 6 veraltet (`devUseWarning`: „Space.Compact + Dropdown + Button"). Im Editor (vorher speichern, `window.open` synchron im Klick wie bisher), im Betrachter und in der Token-Ansicht (`window.open(…, "_blank", "noopener")` im Klick — keine Anker im Menü, sonst bliebe die Wahl per Enter wirkungslos: `@rc-component/menu` aktiviert nur bei `e.which === 13`). Die Blattzahl je Format im Menü („A4 quer · 3 Blätter") entfällt: sie hängt am QR (Option, gültiger Link) und kostete je Öffnen eine Aufteilung im Client; die Druckseite zeigt die Blätter. Der alte Name „Drucken (A4 quer)" verschwindet überall (DOM-Tests, e2e, Release-Notiz).
13. **A3 quer** als eigene Routen `/p/[id]/druck/a3` und `/t/[token]/druck/a3` (Falle 18). **Ein** Stylesheet `_ui/druck/druck.css` mit `@page kommplan-a4 { size: 297mm 210mm }` und `@page kommplan-a3 { size: 420mm 297mm }`; die Seite wählt per `.kp-druck[data-format="a4-quer"|"a3-quer"]` — so liegt jedes Dokument auf genau einer benannten Seite, und zwei geladene Stylesheets können sich nicht überschreiben. Die Druckseite ist eine gemeinsame Server-Komponente `_ui/druck/Druckseite.tsx` (ohne Riegel — die Routen riegeln), die Daten baut `_lib/druckdaten.ts`. `Drucken.tsx` zieht nach `_ui/druck/`.
14. **Schwarzweiß** (`optionen.schwarzweiss`, Spec §8.1): wirkt auf **Druck** (A4/A3, intern und Token) und **SVG-Export**; **Bildschirm bleibt farbig** (Editor, Betrachter, Token-Ansicht). Begründung: die Organisationsfarbe der Taktischen Zeichen ist am Bildschirm die schnellste Erkennung; Schwarzweiß ist eine Eigenschaft von Drucker und Kopierer, nicht der Planansicht — und ein grauer Bildschirm ließe die Bearbeitenden glauben, der Plan habe seine Farben verloren. Umsetzung: zweites Rezept-Generat `_lib/zeichen/zeichen-sw.generiert.json` aus demselben Generatorlauf mit `renderSvg(…, { theme: PRINT_MONOCHROME_THEME })` (inklusive der Zusatzzeichen aus D.1.4) — Grauwerte **und** Strichmuster der Organisationen, die eine reine Farbersetzung nicht hätte (Probelauf in der Planung mit catalog 1.5.0/core 3.0.0: 232 Hauptrezepte, 0 mit Buntton, 207 mit `stroke-dasharray`, 11 unverändert, weil schon schwarz-weiß); `symboleFuer(inhalt, { schwarzweiss })`. Auf dem Blatt: `data-sw` am `<svg>`, ein `<style>` setzt hervorgehobene Kartenköpfe (`[data-hervor]`) auf `#e6e6e6`, das Logo bekommt einen Graufilter (`<filter id="kp-grau">` mit `feColorMatrix saturate 0`). Kommunikations- und Kontaktpiktogramme sind schon schwarz. Im Flyin „Plan und Verbindungen" der Schalter „Schwarzweiß drucken" mit dem Satz „Gilt für Ausdruck und SVG-Datei; am Bildschirm bleibt der Plan farbig."
15. **SVG herunterladen** (Spec §8.1 „je Seite"): auf den **internen** Druckseiten über jedem Blatt ein Knopf „SVG herunterladen (Blatt n von y)" (nicht gedruckt). **Erreichbar ohne Druckdialog** (Kritik: vorher nur über Drucken → Format → Dialog abbrechen): das interne Druckmenü trägt die Gruppe „SVG-Dateien" mit „SVG – A4 quer" und „SVG – A3 quer"; sie öffnen `…/druck/<format>?export=svg`. Die Seite liest `searchParams` und reicht `automatisch={false}` an `Drucken` — kein `window.print()` beim Laden, oben steht „Zum Herunterladen: je Blatt ein Knopf. Drucken geht weiter über „Drucken“." Die Datei ist eigenständig: das Blatt plus der Abschluss aller per `href="#…"`/`xlink:href`/`url(#…)` erreichten `<defs>`-Einträge aus dem gemeinsamen Vorrat (Symbole, Piktogramme, Logo, Graufilter), Breite und Höhe in mm, Hintergrund weiß, ein `<style>` mit `@font-face { font-family: "Arimo"; src: url(data:font/ttf;base64,…) }` und als Schriftliste `Arimo, Arial, "Liberation Sans", Helvetica, sans-serif` — Arimo ist metrisch gleich mit Arial und Liberation Sans, also setzen auch Programme ohne `@font-face`-Unterstützung (Inkscape, Illustrator) die Zeilen gleich breit. Die Schriftbytes kommen aus einem dritten, eingecheckten Generat `_lib/zeichen/schrift.generiert.json` (Base64 von `Arimo-Variable.ttf`, ≈ 110 KB), das die Insel **erst beim Klick** per dynamischem `import()` lädt — kein `fs` zur Laufzeit (unter `output: "standalone"` wäre `_fonts/` nicht mitkopiert), kein Ballast auf jeder Druckseite. Dateiname `<titel>_<YYYY-MM-DD>_blatt-<n>-von-<y>_<a4|a3>.svg`: Titel mit ä→ae, ö→oe, ü→ue, ß→ss, sonst Diakritika weg, alles außer `A–Z a–z 0–9` → „-", höchstens 60 Zeichen, leer → „kommunikationsplan"; Datum = Plandatum, sonst der Tag des Stands in der Suite-Zone. Der Token-Druck hat keinen SVG-Export (Weiterverarbeitung ist Sache der Bearbeitenden; die Token-Ansicht ist Lesen und Drucken).
16. **„Als Vorlage speichern" legt eine Kopie an** (ändert Phase-4-Entscheidung 7, Vorgabe des Hauptlaufs: ein laufender Plan soll nicht unbemerkt in die Vorlagenliste wandern): neue ID, Titel **unverändert**, Art, Anlass und Inhalt kopiert, **Datum leer** (eine Vorlage hat keinen Einsatztag; „Neu aus Vorlage" setzt heute, Phase-4-Entscheidung 8), `ist_vorlage = 1`, Version 1, Stand jetzt. Der Ausgangsplan bleibt unverändert in „Pläne"; Links werden nicht mitkopiert. Hinweis: „Vorlage „<Titel>“ angelegt — sie steht unter „Vorlagen“." Der Hinweis trägt den Knopf „Vorlage öffnen" (`/p/<neue id>`, aus `AnlageErgebnis.id`; Kritik: meist will man die Kopie sofort von Namen und Nummern des Einsatzes bereinigen). **In der Vorlagenliste heißt der Punkt „Vorlage archivieren"** (Kritik: „Keine Vorlage mehr" versprach, der Eintrag werde ein normaler Plan; dasselbe Verb wie in „Pläne") und archiviert die Vorlage (wiederherstellbar, mit „Rückgängig" im Hinweis „Vorlage „<Titel>“ archiviert."); ein zweiter Punkt „Archivieren" entfällt dort (ein Weg zu einer Wirkung). Den Namen „Keine Vorlage mehr" gibt es danach nicht mehr. Löschen gibt es weiterhin nicht (Spec §8.3). Im Archiv trägt eine Vorlage das Kennzeichen „Vorlage" und kehrt beim Wiederherstellen unter „Vorlagen" zurück. `setzeVorlage`/`setzeVorlageAction` entfallen; neu ist `speichereAlsVorlage`/`speichereAlsVorlageAction`. Eine Vorlage lässt sich nicht noch einmal „als Vorlage speichern" (der Menüpunkt steht nur in „Pläne").
17. **Teilen-Flyin** (`_ui/teilen/Teilen.tsx`, `Drawer` `flyinBreite(520)`, ohne Maske wie die übrigen Flyins, freigehalten über `flyinGrund`; `autoFocus={basis === null}` und die Notiz mit `autoFocus` — Kritik: sonst fokussierte rc-drawer seinen Container, Vorbild `StelleFlyin`; Tastaturweg „Teilen" → Notiz tippen → Enter → Enter = kopiert): oben „Neuen Link ausstellen" mit „Gültig für" (24 Stunden · 7 Tage · 30 Tage · Unbegrenzt; Vorgabe 7 Tage) und „Notiz (wofür, für wen)", Knopf „Link ausstellen"; der neue Link steht danach zuoberst, hervorgehoben, mit „Link kopieren" im Fokus. Darunter „Gültige Links" (je Eintrag: Notiz oder „ohne Notiz", „gültig bis …"/„unbegrenzt gültig", „ausgestellt … von …", „noch nie abgerufen"/„n Abrufe, zuletzt …", die URL in Kleinschrift, „Link kopieren", „Widerrufen" mit `Popconfirm` „Link widerrufen? Wer ihn hat, sieht den Plan danach nicht mehr."), dann eingeklappt „Abgelaufen und widerrufen (n)". **Kopieren:** `navigator.clipboard.writeText` nur im sicheren Kontext; sonst (http im LAN, `*.localtest.me`) ein unsichtbares `textarea` mit `document.execCommand("copy")`, Fokus danach zurück; schlägt beides fehl, erscheint die URL markiert in einem Lesefeld mit „Kopieren ging hier nicht von selbst — der Link ist markiert. Kopiere ihn mit Strg+C bzw. ⌘C." Meldungen in einem `role="status"` (für Screenreader); **sichtbar antwortet der Eintrag selbst** (Kritik): „Link kopieren" zeigt für etwa 2 s „Kopiert", und das markierte Lesefeld des Rückfalls erscheint **im betroffenen Eintrag**, nicht oben. Nach „Widerrufen" geht der Fokus auf den nächsten gültigen Eintrag („Link kopieren"), sonst auf die Legende „Gültige Links (0)" (`tabIndex={-1}`) — der Popconfirm-Knopf ist mit dem Eintrag verschwunden. Der neue Link trägt den Rahmen in `--kp-auswahl` (Bildschirmfarbe, hell und dunkel definiert), nicht `--kp-auswahl-papier`. Darunter der QR-Schalter (Entscheidung 10). Die Actions geben die **ganze** Liste mit serverseitig berechnetem Status zurück; der Editor hält sie im Zustand, damit der QR-Hinweis im Plan-Flyin nach Ausstellen und Widerrufen stimmt (kein `Date.now()` im Rendern).
18. **Release-Notiz** (Vorgabe des Hauptlaufs: endgültige Notiz für das ganze Modul): dieselbe Datei, **ein** Absatz, ein bis drei Sätze, höchstens 320 Zeichen, Du-Form, nur Namen vom Bildschirm. Wortlaut in Task 14; die Länge wird dort per `node` gezählt.

## Review Focus

1. **Der Token-Druck verrät keinen besseren Link** — wer einen 24-h-Link hat und `/t/<token>/druck/a4` öffnet, während der Plan auch einen unbegrenzten Link hat, bekommt im QR genau **seinen** Token. Gepinnt in `_lib/druckdaten.test.ts` (Task 10) und `e2e/kommplan-teilen.spec.ts` (Task 15): jede QR-Gruppe trägt ihr Ziel als `data-qr-ziel` (keine zusätzliche Preisgabe — der Code selbst trägt dieselbe URL), und der e2e vergleicht es mit der URL des benutzten Tokens.
2. **Ununterscheidbare 404** — unbekannter, falsch geformter, widerrufener, abgelaufener Token und Token eines archivierten Plans liefern denselben Status, dieselben Köpfe (`x-robots-tag`, `referrer-policy`) und denselben Seitentext (Token im Text ersetzt); kein Plantitel, keine Plan-ID, kein Briefkopf in irgendeiner Antwort ohne gültigen Token. Gepinnt in `_lib/freigaben.test.ts`, `_lib/tokenZugang.test.ts` (Task 2, 7) und im e2e (Task 15).
3. **Kopieren über http ohne Clipboard-API** — im LAN über `http://<ip>` oder `*.localtest.me` fehlt `navigator.clipboard`; „Link kopieren" kopiert trotzdem (Rückfall) oder zeigt den markierten Link — nie ein stiller Fehlschlag, nie ein Wurf. Gepinnt in `_ui/teilen/zwischenablage.test.ts` (Task 9) und im e2e (Task 15, läuft auf http).
4. **Plan-ID in den Flight-Daten** — die Token-Seite reicht nur Planinhalt (Stellen-IDs), Titel und Token an Client-Inseln; die Plan-ID steht weder im HTML noch im RSC-Payload. Gepinnt im e2e mit einem frisch angelegten Plan (UUID, nicht Seed-ID) gegen den ganzen Antworttext (Task 15) und in `riegel.test.ts` (keine `id` aus `params`, Task 8).
5. **Ein neuer Link verändert den Druck** — mit QR wird die Zeichenfläche kürzer, ein knapp passender Plan bekommt ein zweites Blatt oder einen kleineren Maßstab; nie überdeckt die Zeichnung den QR, nie läuft die Legende hinein. Gepinnt in `_lib/layout/papier.test.ts` und `eigenschaften.test.ts` (Task 10, Zufallsbäume, beide Formate).
6. **Die SVG-Datei taugt allein** — jede `#id`-Referenz der Datei löst in der Datei auf, Arimo ist eingebettet, Titel mit Umlauten, Schrägstrichen, Anführungszeichen oder Emoji ergeben einen ASCII-Dateinamen. Gepinnt in `_lib/dateiname.test.ts`, `_ui/druck/svgExport.test.ts` (Task 12) und im e2e-Download (Task 15).
7. **Archivieren oder Widerrufen bei offener Token-Ansicht** — die nächste Anfrage (Neuladen, Druck) ist 404, auch wenn dieselbe Adresse den Link eben noch zählen ließ (Entpreller zählt, prüft aber nicht). Gepinnt in `_lib/tokenZugang.test.ts` (Task 7) und im e2e (Task 15). **Archivieren widerruft** die Links, Wiederherstellen erweckt keinen (Entscheidung 3) — gepinnt in `_lib/freigaben.test.ts` (Task 2).
8. **Der Verteilweg bleibt kurz** (Kritik; Bilanz am Referenzplan „Einsatz 22.02.2026"). Der Aufbau des Plans selbst kostet ≈ 100 Schritte (Kontakte und Zeichen, außerhalb dieser Phase). Phase 5 nach dem ersten Planstand hätte den Weg danach — teilen, QR, drucken, SVG — auf ≈ 15 Schritte über zwei Flyins, ein Menü und einen Druckdialog verlängert. Nach der Kritik: **Teilen → Notiz → Enter → Enter** (Link ausgestellt und kopiert, Fokus folgt; Entscheidung 17) · QR im selben Flyin einschalten, 1 Schritt (Entscheidung 10) · **Drucken** = 1 Klick für A4 quer, A3 über den Pfeil 2 (Entscheidung 12) · SVG direkt aus dem Menü ohne Druckdialog, 2 Schritte plus 1 je Blatt (Entscheidung 15) — zusammen ≈ 7–8. Gepinnt in `Teilen.test.tsx` (Anfangsfokus, Fokus nach Ausstellen), `DruckMenue.test.tsx` (Hauptknopf druckt A4) und im e2e-Tastaturweg (Task 5).

---

## Dateistruktur

Im Folgenden steht `K` für `src/app/m/kommplan`.

```
K/
├── _lib/
│   ├── freigabe/regeln.ts              NEU, rein: FREIGABE_DAUERN, DAUER_NAME, DAUER_VORGABE, FREIGABE_GRENZE, TOKEN_MUSTER,
│   │                                              istTokenForm, ablaufFuer, freigabeStatus, besteFreigabe, waehleQrFreigabe, tokenPfad,
│   │                                              tokenUrl, ausstellenSchema, widerrufenSchema, FreigabeZeile, FreigabeStatus
│   ├── freigabe/texte.ts               NEU, rein: ZEIT, ablaufText, abrufText, qrZielSatz (Teilen, PlanFlyin, Druckdaten)
│   ├── freigaben.ts                    NEU (Server): neuesToken, freigabenFuer, stelleFreigabeAus, widerrufeFreigabe,
│   │                                                 loeseToken, zaehleAbruf, qrTokenFuer, TokenTreffer
│   ├── tokenZugang.ts                  NEU (Server): TOKEN_SCHRANKE, neueSchranken, pruefeTokenAbruf, tokenAbruf, tokenPlanOder404
│   ├── tokenMetadaten.ts               NEU (rein, Typ-Import aus next): TOKEN_METADATEN
│   ├── druckdaten.ts                   NEU (Server): druckseitenDaten, qrZielIntern, qrUrlFuerToken
│   ├── qrGrafik.ts                     NEU, rein: QrGrafik, qrGrafikAus
│   ├── dateiname.ts                    NEU, rein: asciiTeil, svgDateiname
│   ├── ergebnis.ts                     geändert: FreigabeErgebnis
│   ├── layout/masse.ts                 geändert: QR_BOX (Dateiende)
│   ├── layout/papier.ts                geändert: PapierOptionen, qrBox, legendenBreite; zeichenflaeche/teileAuf mit qr
│   ├── plan/operationen.ts             geändert: setzeOptionen nimmt alle vier Optionen
│   ├── planverwaltung.ts               geändert: archiviere widerruft die Links (Task 2), speichereAlsVorlage statt setzeVorlage (Task 13)
│   └── zeichen/
│       ├── zeichen.ts                  geändert: symboleFuer(…, { schwarzweiss })
│       ├── zeichen-sw.generiert.json   NEU (generiert)
│       └── schrift.generiert.json      NEU (generiert)
├── _actions/
│   ├── freigabe.ts                     NEU: stelleFreigabeAusAction, widerrufeFreigabeAction
│   └── verwaltung.ts                   geändert: speichereAlsVorlageAction statt setzeVorlageAction
├── _ui/
│   ├── druck/                          NEU
│   │   ├── druck.css                   (verschoben aus (intern)/p/[id]/druck/a4/, zwei benannte @page)
│   │   ├── Drucken.tsx, Drucken.test.tsx  (verschoben; Prop `automatisch` für den SVG-Weg)
│   │   ├── Druckseite.tsx              Server, ohne antd: Knopf, QR-Satz, Blätter, SVG-Knöpfe
│   │   ├── DruckMenue.tsx              "use client": geteilter Knopf „Drucken" (A4) + Pfeil: A4 quer / A3 quer (intern: SVG-Dateien)
│   │   ├── SvgHerunterladen.tsx        "use client": ein Knopf je Blatt
│   │   └── svgExport.ts                DOM: verweiseIn, eigenstaendigesSvg, SCHRIFTLISTE
│   ├── teilen/                         NEU ("use client")
│   │   ├── Teilen.tsx                  TeilenFlyin, Teilen, TEILEN_FLYIN_GRUND
│   │   └── zwischenablage.ts           kopiere
│   ├── token/                          NEU (Server, ohne antd — antd nur in den Inseln Betrachter/DruckMenue)
│   │   ├── TokenRahmen.tsx, token.css
│   │   ├── TokenKopf.tsx
│   │   └── TokenUngueltig.tsx          Inhalt der 404-Seite (testbar ohne Route)
│   ├── zeichnung/Blatt.tsx             geändert: format, QR, Schwarzweiß, Logo-Graufilter
│   ├── zeichnung/Druckblaetter.tsx     geändert: format, schwarzweiss an LogoDefs
│   ├── zeichnung/Karte.tsx             geändert: data-hervor
│   ├── editor/Editor.tsx               geändert: Flyin „teilen", Freigaben-Zustand, drucken(format), Hinweise an PlanFlyin
│   ├── editor/Kopfleiste.tsx           geändert: „Teilen", DruckMenue, Telefon zweispaltig
│   ├── editor/PlanFlyin.tsx            geändert: Schalter QR und Schwarzweiß, QR-Satz, „Link ausstellen"
│   └── kommplan.css                    geändert: Teilen-Liste, Druckmenü, Kopfleiste am Telefon
├── (intern)/
│   ├── page.tsx                        unverändert
│   ├── PlanTabelle.tsx                 geändert: Vorlage als Kopie mit „Vorlage öffnen", „Vorlage archivieren", Kennzeichen „Vorlage"
│   ├── p/[id]/page.tsx                 geändert: DruckMenue, Teilen-Daten an den Editor
│   ├── p/[id]/druck/a4/page.tsx        geändert: Druckseite, `?export=svg`
│   └── p/[id]/druck/a3/page.tsx        NEU
├── t/not-found.tsx                     NEU: 404 der Token-Ansicht (Grenze über t/[token]/layout.tsx)
├── t/[token]/                          NEU
│   ├── layout.tsx                      Host + Token (Falle 23)
│   ├── page.tsx                        Token-Ansicht
│   ├── druck/a4/page.tsx
│   └── druck/a3/page.tsx
├── grenze.test.ts, riegel.test.ts      geändert
src/core/routing.ts                     geändert (Dateiende): antwortKoepfeFuer, VERTRAULICHE_KOEPFE
src/proxy.ts                            geändert: mitVertraulichenKoepfen (Dateiende), Aufruf in proxy()
scripts/kommplan-zeichen-generat.ts     geändert: SW-Generat, Schrift-Generat
e2e/kommplan-teilen.spec.ts             NEU (Teilen, Token-Ansicht, 404, Schranke, QR, SW, SVG, A3, Fotos)
e2e/kommplan-editor.spec.ts             geändert (Druckmenü)
e2e/kommplan-verwaltung.spec.ts         geändert (Vorlage als Kopie)
e2e/kommplan.spec.ts                    geändert (A3-Seitengröße, Betrachter-Druckmenü)
e2e/gruppen.json                        geändert (neue Spec)
```

Unverändert, obwohl naheliegend: `_lib/rahmen.ts` (`qr` und `schwarzweiss` setzt `druckseitenDaten` per Spread) und `_lib/plaene.ts` (`Listenzeile.vorlage` gibt es schon). Geändert außerhalb des Moduls außerdem: `src/core/audit/coverage-manifest.json`, `src/core/routing.test.ts`, `src/proxy.test.ts`, die Spec (§6.1, §6.2, §6.7, §8.1, §8.2, §8.3), die Release-Notiz.

---

### Task 1: Regeln der Token-Links — rein und getestet

**Files:**
- Create: `src/app/m/kommplan/_lib/freigabe/regeln.ts`
- Test: `src/app/m/kommplan/_lib/freigabe/regeln.test.ts`
- Modify: `src/app/m/kommplan/grenze.test.ts` (Liste der geteilten Ordner um `"_lib/freigabe/"`)

**Interfaces:**
- Consumes: nichts aus früheren Aufgaben.
- Produces:
  - `FREIGABE_DAUERN = ["24h", "7d", "30d", "unbegrenzt"] as const`, `type FreigabeDauer`, `DAUER_VORGABE: FreigabeDauer = "7d"`, `DAUER_NAME: Record<FreigabeDauer, string>`
  - `FREIGABE_GRENZE = { notiz: 200, gueltigJePlan: 20 }`
  - `TOKEN_MUSTER: RegExp`, `istTokenForm(t: string): boolean`
  - `ablaufFuer(dauer: FreigabeDauer, jetzt: number): number | null`
  - `type FreigabeStatus = "gueltig" | "abgelaufen" | "widerrufen"`, `freigabeStatus(f: { ablauf: number | null; widerrufenAm: number | null }, jetzt: number): FreigabeStatus`
  - `interface FreigabeZeile { id; token; notiz: string | null; ablauf: number | null; widerrufenAm: number | null; erstelltAm: number; erstelltVon: string; zuletztAbgerufen: number | null; abrufe: number; status: FreigabeStatus }`
  - `besteFreigabe<T extends { erstelltAm: number; ablauf: number | null }>(zeilen: readonly T[]): T | null` (Rangfolge ohne Uhr — für den Editor, der den Status vom Server hat)
  - `waehleQrFreigabe<T extends { token: string; erstelltAm: number; ablauf: number | null; widerrufenAm: number | null }>(zeilen: readonly T[], jetzt: number): T | null`
  - `tokenPfad(token: string): string` (`/t/<token>`), `tokenUrl(basis: string, token: string): string`
  - `ausstellenSchema` (zod: `{ planId, dauer, notiz }`), `widerrufenSchema` (zod: `{ planId, freigabeId }`)

- [ ] **Step 1: Write the failing test**

```ts
// src/app/m/kommplan/_lib/freigabe/regeln.test.ts
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  ablaufFuer, ausstellenSchema, besteFreigabe, DAUER_VORGABE, FREIGABE_DAUERN, FREIGABE_GRENZE, freigabeStatus, istTokenForm,
  tokenPfad, tokenUrl, waehleQrFreigabe, widerrufenSchema,
} from "./regeln";

const JETZT = Date.UTC(2026, 9, 1, 18, 0); // 01.10.2026, 20:00 in Berlin
const STUNDE = 3_600_000;

describe("Ablauf (Spec §8.2; Entscheidung 3)", () => {
  it("rechnet Dauern ab jetzt, nicht in Kalendertagen; unbegrenzt ist null", () => {
    expect(ablaufFuer("24h", JETZT)).toBe(JETZT + 24 * STUNDE);
    expect(ablaufFuer("7d", JETZT)).toBe(JETZT + 7 * 24 * STUNDE);
    expect(ablaufFuer("30d", JETZT)).toBe(JETZT + 30 * 24 * STUNDE);
    expect(ablaufFuer("unbegrenzt", JETZT)).toBeNull();
  });
  it("Vorgabe sind 7 Tage, die Reihenfolge ist die des Flyins", () => {
    expect(DAUER_VORGABE).toBe("7d");
    expect(FREIGABE_DAUERN).toEqual(["24h", "7d", "30d", "unbegrenzt"]);
  });
});

describe("Status", () => {
  it("gültig, abgelaufen genau an der Grenze, widerrufen schlägt abgelaufen", () => {
    expect(freigabeStatus({ ablauf: null, widerrufenAm: null }, JETZT)).toBe("gueltig");
    expect(freigabeStatus({ ablauf: JETZT + 1, widerrufenAm: null }, JETZT)).toBe("gueltig");
    expect(freigabeStatus({ ablauf: JETZT, widerrufenAm: null }, JETZT)).toBe("abgelaufen");
    expect(freigabeStatus({ ablauf: JETZT - 1, widerrufenAm: JETZT - 5 }, JETZT)).toBe("widerrufen");
    expect(freigabeStatus({ ablauf: null, widerrufenAm: JETZT }, JETZT)).toBe("widerrufen");
  });
});

describe("Token-Form (Entscheidung 2)", () => {
  it("32 Byte Zufall base64url sind genau 43 Zeichen und passen", () => {
    for (let i = 0; i < 50; i++) {
      const t = randomBytes(32).toString("base64url");
      expect(t).toHaveLength(43);
      expect(istTokenForm(t)).toBe(true);
    }
  });
  it("weist alles andere ab: zu kurz, zu lang, Auffüllung, Pfadzeichen, Prozent, Leerzeichen", () => {
    const gut = "A".repeat(43);
    for (const t of ["", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}=`, `${"A".repeat(42)}/`, `${"A".repeat(42)}%`, `${"A".repeat(42)} `, `${"A".repeat(42)}+`, `../${gut}`]) {
      expect(istTokenForm(t), JSON.stringify(t)).toBe(false);
    }
  });
});

describe("QR-Wahl (Entscheidung 10)", () => {
  const z = (token: string, ablauf: number | null, erstelltAm: number, widerrufenAm: number | null = null) => ({ token, ablauf, erstelltAm, widerrufenAm });
  it("unbegrenzt vor spätestem Ablauf, bei Gleichstand der jüngste; ungültige nie", () => {
    expect(waehleQrFreigabe([z("a", JETZT + STUNDE, 1), z("b", JETZT + 2 * STUNDE, 2)], JETZT)?.token).toBe("b");
    expect(waehleQrFreigabe([z("a", null, 1), z("b", JETZT + 999 * STUNDE, 2)], JETZT)?.token).toBe("a");
    expect(waehleQrFreigabe([z("a", null, 1), z("b", null, 2)], JETZT)?.token).toBe("b");
    expect(waehleQrFreigabe([z("a", null, 1, JETZT - 1), z("b", JETZT, 2), z("c", JETZT - 1, 3)], JETZT)).toBeNull();
    expect(waehleQrFreigabe([], JETZT)).toBeNull();
  });
  it("besteFreigabe: dieselbe Rangfolge ohne Uhr — der Editor reicht nur die schon gültigen", () => {
    expect(besteFreigabe([z("a", JETZT + STUNDE, 1), z("b", null, 2), z("c", JETZT + 2 * STUNDE, 3)])?.token).toBe("b");
    expect(besteFreigabe([z("a", JETZT + STUNDE, 5), z("b", JETZT + STUNDE, 6)])?.token).toBe("b");
    expect(besteFreigabe([])).toBeNull();
  });
});

describe("URL", () => {
  it("hängt /t/<token> an die Basis, ohne doppelten Schrägstrich", () => {
    expect(tokenPfad("abc")).toBe("/t/abc");
    expect(tokenUrl("https://kommplan.iuk-ue.de", "abc")).toBe("https://kommplan.iuk-ue.de/t/abc");
    expect(tokenUrl("http://kommplan.localtest.me:3000/", "abc")).toBe("http://kommplan.localtest.me:3000/t/abc");
  });
});

describe("Eingaben der Actions", () => {
  it("Ausstellen: Dauer aus der Liste, Notiz getrimmt und höchstens 200 Zeichen, keine fremden Felder", () => {
    expect(ausstellenSchema.parse({ planId: "p", dauer: "24h", notiz: "  Leitstelle  " })).toEqual({ planId: "p", dauer: "24h", notiz: "Leitstelle" });
    expect(ausstellenSchema.safeParse({ planId: "p", dauer: "1y", notiz: "" }).success).toBe(false);
    expect(ausstellenSchema.safeParse({ planId: "p", dauer: "7d", notiz: "x".repeat(FREIGABE_GRENZE.notiz + 1) }).success).toBe(false);
    expect(ausstellenSchema.safeParse({ planId: "p", dauer: "7d", notiz: "", token: "eigen" }).success).toBe(false);
  });
  it("Widerrufen braucht Plan UND Link", () => {
    expect(widerrufenSchema.safeParse({ freigabeId: "f" }).success).toBe(false);
    expect(widerrufenSchema.parse({ planId: "p", freigabeId: "f" })).toEqual({ planId: "p", freigabeId: "f" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/_lib/freigabe/regeln.test.ts`
Expected: FAIL — „Failed to resolve import "./regeln"".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/m/kommplan/_lib/freigabe/regeln.ts
import { z } from "zod";

/**
 * TOKEN-LINKS — die reinen Regeln (Spec §8.2; Umsetzungsplan Phase 5, Entscheidungen 2, 3, 10). Keine Uhr:
 * „jetzt" kommt als Argument. Server (Ausstellen, Auflösen, Druck) und Flyin teilen diese Datei.
 */
export const FREIGABE_DAUERN = ["24h", "7d", "30d", "unbegrenzt"] as const;
export type FreigabeDauer = (typeof FREIGABE_DAUERN)[number];
export const DAUER_VORGABE: FreigabeDauer = "7d";
export const DAUER_NAME: Record<FreigabeDauer, string> = { "24h": "24 Stunden", "7d": "7 Tage", "30d": "30 Tage", unbegrenzt: "Unbegrenzt" };
const STUNDE = 3_600_000;
const DAUER_MS: Record<FreigabeDauer, number | null> = { "24h": 24 * STUNDE, "7d": 7 * 24 * STUNDE, "30d": 30 * 24 * STUNDE, unbegrenzt: null };

/** Notiz und Menge — die Datenbank braucht beides nicht, die Bedienung schon (Entscheidung 1). */
export const FREIGABE_GRENZE = { notiz: 200, gueltigJePlan: 20 } as const;

/** 32 Byte als base64url ohne Auffüllung: genau 43 Zeichen. Geprüft VOR jeder Datenbankabfrage (Entscheidung 2). */
export const TOKEN_MUSTER = /^[A-Za-z0-9_-]{43}$/;
export const istTokenForm = (t: string): boolean => TOKEN_MUSTER.test(t);

/** Dauer ab jetzt, kein Kalendertag: ein am Abend ausgestellter 24-h-Link gilt bis zum nächsten Abend. */
export function ablaufFuer(dauer: FreigabeDauer, jetzt: number): number | null {
  const d = DAUER_MS[dauer];
  return d === null ? null : jetzt + d;
}

export type FreigabeStatus = "gueltig" | "abgelaufen" | "widerrufen";
interface Zustand { ablauf: number | null; widerrufenAm: number | null }
/** Genau an der Grenze ist ein Link schon abgelaufen. Widerrufen schlägt abgelaufen (die stärkere Aussage). */
export function freigabeStatus(f: Zustand, jetzt: number): FreigabeStatus {
  if (f.widerrufenAm !== null) return "widerrufen";
  if (f.ablauf !== null && f.ablauf <= jetzt) return "abgelaufen";
  return "gueltig";
}

/** Eine Zeile, wie das Flyin sie bekommt — nur für Bearbeitende (sie trägt den Token). */
export interface FreigabeZeile {
  id: string; token: string; notiz: string | null; ablauf: number | null; widerrufenAm: number | null;
  erstelltAm: number; erstelltVon: string; zuletztAbgerufen: number | null; abrufe: number; status: FreigabeStatus;
}

/**
 * Der Link für den QR auf dem INTERNEN Ausdruck (Entscheidung 10): unbegrenzt vor spätestem Ablauf, bei Gleichstand
 * der zuletzt ausgestellte. Der Token-Druck nimmt nie diesen, sondern den benutzten (Entscheidung 9).
 */
export function waehleQrFreigabe<T extends Zustand & { token: string; erstelltAm: number }>(zeilen: readonly T[], jetzt: number): T | null {
  return besteFreigabe(zeilen.filter((z) => freigabeStatus(z, jetzt) === "gueltig"));
}

/** Dieselbe Rangfolge ohne Uhr: der Aufrufer reicht nur gültige Zeilen (der Editor nimmt den Status vom Server). */
export function besteFreigabe<T extends { erstelltAm: number; ablauf: number | null }>(zeilen: readonly T[]): T | null {
  const rang = (z: T) => z.ablauf ?? Number.POSITIVE_INFINITY;
  let best: T | null = null;
  for (const z of zeilen) {
    if (best === null || rang(z) > rang(best) || (rang(z) === rang(best) && z.erstelltAm > best.erstelltAm)) best = z;
  }
  return best;
}

export const tokenPfad = (token: string): string => `/t/${token}`;
/** Die Basis kommt aus `moduleUrl("kommplan")`, nie aus dem Request-Host (Entscheidung 10). */
export const tokenUrl = (basis: string, token: string): string => `${basis.replace(/\/+$/, "")}${tokenPfad(token)}`;

const ID = z.string().min(1).max(64);
export const ausstellenSchema = z.object({
  planId: ID,
  dauer: z.enum(FREIGABE_DAUERN),
  notiz: z.string().max(FREIGABE_GRENZE.notiz, `Höchstens ${FREIGABE_GRENZE.notiz} Zeichen.`).transform((s) => s.trim()),
}).strict();
export const widerrufenSchema = z.object({ planId: ID, freigabeId: ID }).strict();
```

In `grenze.test.ts`, Test „geteilte Ordner sind rein", die Liste erweitern (gleiche Zeile, Eintrag anhängen):

```ts
      ["_lib/layout/", "_lib/plan/", "_lib/beispiele/", "_ui/zeichnung/", "_lib/angaben.ts", "_lib/ergebnis.ts", "_lib/editorAnsicht.ts", "_lib/logo/", "_lib/bibliothek/", "_lib/tagesfassung.ts", "_lib/herkunft.ts", "_lib/freigabe/"].some((o) => relative(MODUL, p).startsWith(o)),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan/_lib/freigabe/regeln.test.ts src/app/m/kommplan/grenze.test.ts`
Expected: PASS. Gegenprobe: `ablauf <= jetzt` → `ablauf < jetzt` macht „abgelaufen genau an der Grenze" rot; zurück.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "exit $?"
git add src/app/m/kommplan/_lib/freigabe src/app/m/kommplan/grenze.test.ts
git commit -S -m "feat(kommplan): Regeln der Token-Links

Ablauf, Status, Tokenform, QR-Wahl und URL als reine Funktionen
(Spec §8.2, Umsetzungsplan Phase 5, Entscheidungen 2, 3, 10).

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Links in der Datenbank — ausstellen, widerrufen, auflösen, zählen

**Files:**
- Create: `src/app/m/kommplan/_lib/freigaben.ts`
- Test: `src/app/m/kommplan/_lib/freigaben.test.ts`
- Modify: `src/app/m/kommplan/_lib/ergebnis.ts` (Typ `FreigabeErgebnis`)
- Modify: `src/app/m/kommplan/_db/schema.test.ts` (Annahme „keine Migration nötig", Entscheidung 1)
- Modify: `src/app/m/kommplan/_lib/planverwaltung.ts` (`archiviere` widerruft die gültigen Links, Entscheidung 3)

**Interfaces:**
- Consumes: Task 1 (`ausstellenSchema`, `widerrufenSchema`, `ablaufFuer`, `freigabeStatus`, `istTokenForm`, `waehleQrFreigabe`, `FREIGABE_GRENZE`, `FreigabeZeile`); `ladePlanLesend`, `LesbarerPlan` aus `_lib/plaene.ts`; `feldFehlerAus` aus `_lib/angaben.ts`; `PLAN_WEG` aus `_lib/planverwaltung.ts`; `Bearbeiter` aus `_lib/speichern.ts`.
- Produces:
  - `type FreigabeErgebnis = { ok: true; neu: string | null; freigaben: FreigabeZeile[] } | { ok: false; fehler: string; feldFehler: FeldFehler }` (in `_lib/ergebnis.ts`)
  - `neuesToken(): string`
  - `freigabenFuer(db: KommplanDb, planId: string, jetzt: number): FreigabeZeile[]` — gültige zuerst, je Gruppe neueste zuerst
  - `stelleFreigabeAus(db: KommplanDb, eingabe: unknown, wer: Bearbeiter, jetzt: number): FreigabeErgebnis`
  - `widerrufeFreigabe(db: KommplanDb, eingabe: unknown, jetzt: number): FreigabeErgebnis`
  - `interface TokenTreffer { freigabeId: string; token: string; plan: LesbarerPlan }`, `loeseToken(db: KommplanDb, token: string, jetzt: number): TokenTreffer | null`
  - `zaehleAbruf(db: KommplanDb, freigabeId: string, jetzt: number): void`
  - `qrTokenFuer(db: KommplanDb, planId: string, jetzt: number): string | null`
  - `archiviere(db, id, jetzt)` (Signatur unverändert) widerruft in derselben Transaktion alle gültigen Links des Plans

- [ ] **Step 1: Write the failing test**

```ts
// src/app/m/kommplan/_lib/freigaben.test.ts
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { plan, planFreigabe } from "../_db/schema";
import { FREIGABE_GRENZE } from "./freigabe/regeln";
import { freigabenFuer, loeseToken, neuesToken, qrTokenFuer, stelleFreigabeAus, widerrufeFreigabe, zaehleAbruf } from "./freigaben";
import { archiviere, PLAN_WEG, stelleWiederHer } from "./planverwaltung";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

const WER = { nutzer: "u1", name: "Jana" };
const JETZT = Date.UTC(2026, 9, 1, 18, 0);
const STUNDE = 3_600_000;
const OPENR = "beispiel-openr-2022-07-01";
const EINSATZ = "beispiel-einsatz-2026-02-22";
async function mitSeed() { const db = testDb(); await seedLokalKommplan(db); return db; }
const audit = (db: ReturnType<typeof testDb>) =>
  db.all(sql`SELECT action FROM audit_outbox WHERE object_type = 'plan_freigabe' ORDER BY rowid`) as { action: string }[];
function aus(db: ReturnType<typeof testDb>, planId = OPENR, dauer = "7d", notiz = "Leitstelle", jetzt = JETZT) {
  const r = stelleFreigabeAus(db, { planId, dauer, notiz }, WER, jetzt);
  if (!r.ok) throw new Error(r.fehler);
  return r.freigaben.find((f) => f.id === r.neu)!;
}

describe("Ausstellen (Spec §8.2; Entscheidungen 1–3)", () => {
  it("legt einen gültigen Link mit 43-Zeichen-Token, Notiz und Ablauf an — eine Audit-Zeile", async () => {
    const db = await mitSeed();
    const f = aus(db);
    expect(f.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(f).toMatchObject({ notiz: "Leitstelle", ablauf: JETZT + 7 * 24 * STUNDE, widerrufenAm: null, erstelltAm: JETZT, erstelltVon: "Jana", abrufe: 0, zuletztAbgerufen: null, status: "gueltig" });
    expect(audit(db)).toEqual([{ action: "create" }]);
  });
  it("leere Notiz wird null, unbegrenzt hat keinen Ablauf", async () => {
    const db = await mitSeed();
    expect(aus(db, OPENR, "unbegrenzt", "   ")).toMatchObject({ notiz: null, ablauf: null });
  });
  it("Tokens sind verschieden", () => {
    const viele = new Set(Array.from({ length: 200 }, neuesToken));
    expect(viele.size).toBe(200);
  });
  it("unbekannter oder archivierter Plan: abgewiesen; ungültige Eingabe: Feldfehler", async () => {
    const db = await mitSeed();
    expect(stelleFreigabeAus(db, { planId: "gibt-es-nicht", dauer: "7d", notiz: "" }, WER, JETZT)).toEqual({ ok: false, fehler: PLAN_WEG, feldFehler: {} });
    archiviere(db, EINSATZ, JETZT);
    expect(stelleFreigabeAus(db, { planId: EINSATZ, dauer: "7d", notiz: "" }, WER, JETZT)).toMatchObject({ ok: false, fehler: PLAN_WEG });
    const r = stelleFreigabeAus(db, { planId: OPENR, dauer: "7d", notiz: "x".repeat(FREIGABE_GRENZE.notiz + 1) }, WER, JETZT);
    expect(r).toMatchObject({ ok: false, feldFehler: { notiz: expect.any(String) } });
  });
  it("höchstens 20 gültige Links je Plan; abgelaufene und widerrufene zählen nicht", async () => {
    const db = await mitSeed();
    const erster = aus(db, OPENR, "24h", "", JETZT - 48 * STUNDE); // längst abgelaufen
    for (let i = 0; i < FREIGABE_GRENZE.gueltigJePlan; i++) aus(db);
    expect(stelleFreigabeAus(db, { planId: OPENR, dauer: "7d", notiz: "" }, WER, JETZT)).toMatchObject({ ok: false, fehler: expect.stringContaining("Höchstens 20") });
    const einer = freigabenFuer(db, OPENR, JETZT).find((f) => f.status === "gueltig")!;
    expect(widerrufeFreigabe(db, { planId: OPENR, freigabeId: einer.id }, JETZT).ok).toBe(true);
    expect(stelleFreigabeAus(db, { planId: OPENR, dauer: "7d", notiz: "" }, WER, JETZT).ok).toBe(true);
    expect(freigabenFuer(db, OPENR, JETZT).find((f) => f.id === erster.id)?.status).toBe("abgelaufen");
  });
});

describe("Liste", () => {
  it("gültige zuerst, je Gruppe die neuesten oben; nur die Links DIESES Plans", async () => {
    const db = await mitSeed();
    const alt = aus(db, OPENR, "7d", "alt", JETZT - 2);
    const weg = aus(db, OPENR, "7d", "weg", JETZT - 1);
    const neu = aus(db, OPENR, "7d", "neu", JETZT);
    aus(db, EINSATZ);
    widerrufeFreigabe(db, { planId: OPENR, freigabeId: weg.id }, JETZT);
    expect(freigabenFuer(db, OPENR, JETZT).map((f) => [f.notiz, f.status])).toEqual([["neu", "gueltig"], ["alt", "gueltig"], ["weg", "widerrufen"]]);
    expect(alt.status).toBe("gueltig");
    expect(neu.status).toBe("gueltig");
  });
});

describe("Widerrufen (IDOR)", () => {
  it("nur über (Link, Plan); ein fremder Plan widerruft nichts und erfährt nichts", async () => {
    const db = await mitSeed();
    const f = aus(db);
    expect(widerrufeFreigabe(db, { planId: EINSATZ, freigabeId: f.id }, JETZT)).toEqual({ ok: false, fehler: "Diesen Link gibt es nicht.", feldFehler: {} });
    expect(freigabenFuer(db, OPENR, JETZT)[0].status).toBe("gueltig");
    const r = widerrufeFreigabe(db, { planId: OPENR, freigabeId: f.id }, JETZT + 1);
    expect(r).toMatchObject({ ok: true, neu: null });
    if (r.ok) expect(r.freigaben[0]).toMatchObject({ status: "widerrufen", widerrufenAm: JETZT + 1 });
    expect(audit(db)).toEqual([{ action: "create" }, { action: "update" }]);
    // noch einmal: kein zweites Audit, der Zeitpunkt bleibt
    expect(widerrufeFreigabe(db, { planId: OPENR, freigabeId: f.id }, JETZT + 9).ok).toBe(true);
    expect(freigabenFuer(db, OPENR, JETZT)[0].widerrufenAm).toBe(JETZT + 1);
    expect(audit(db)).toHaveLength(2);
  });
});

describe("Auflösen (Spec §8.2: unbekannt, abgelaufen, widerrufen, archiviert → nichts)", () => {
  it("gültig → der lesbare Plan; alles andere → null", async () => {
    const db = await mitSeed();
    const f = aus(db, OPENR, "24h");
    expect(loeseToken(db, f.token, JETZT)?.plan).toMatchObject({ id: OPENR, archiviertAm: null });
    expect(loeseToken(db, f.token, JETZT + 24 * STUNDE)).toBeNull(); // genau an der Grenze
    expect(loeseToken(db, "A".repeat(43), JETZT)).toBeNull();
    expect(loeseToken(db, `${f.token}x`, JETZT)).toBeNull();
    expect(loeseToken(db, f.token.toLowerCase() === f.token ? f.token.toUpperCase() : f.token.toLowerCase(), JETZT)).toBeNull();
    const g = aus(db, OPENR, "unbegrenzt");
    widerrufeFreigabe(db, { planId: OPENR, freigabeId: g.id }, JETZT);
    expect(loeseToken(db, g.token, JETZT)).toBeNull();
    const h = aus(db, EINSATZ, "unbegrenzt");
    // Archiv OHNE Widerruf (direkt in der Spalte): `archiviere` widerruft die Links selbst (Entscheidung 3) — dann
    // prüfte dieser Fall nur den Widerruf, und die Archiv-Bedingung in `loeseToken` (doppelter Boden) bliebe ungetestet.
    db.update(plan).set({ archiviertAm: new Date(JETZT) }).where(eq(plan.id, EINSATZ)).run();
    expect(freigabenFuer(db, EINSATZ, JETZT).find((f) => f.id === h.id)?.status).toBe("gueltig");
    expect(loeseToken(db, h.token, JETZT)).toBeNull();
  });
  it("falsche Form fragt die Datenbank gar nicht erst (kein Wurf bei SQL-artigem Text)", async () => {
    const db = await mitSeed();
    expect(loeseToken(db, "' OR 1=1 --", JETZT)).toBeNull();
    expect(loeseToken(db, "", JETZT)).toBeNull();
  });
});

describe("Archivieren widerruft (Entscheidung 3, Review Focus 7)", () => {
  it("gültige Links werden widerrufen — je eine Audit-Zeile; widerrufene behalten ihren Zeitpunkt, abgelaufene bleiben abgelaufen; Wiederherstellen erweckt keinen", async () => {
    const db = await mitSeed();
    const a = aus(db, EINSATZ, "unbegrenzt", "a");
    const b = aus(db, EINSATZ, "7d", "b");
    const alt = aus(db, EINSATZ, "24h", "alt", JETZT - 48 * STUNDE);
    const weg = aus(db, EINSATZ, "7d", "weg");
    widerrufeFreigabe(db, { planId: EINSATZ, freigabeId: weg.id }, JETZT - 5);
    const andere = aus(db, OPENR, "unbegrenzt", "anderer Plan");
    const vorher = audit(db).length;
    expect(archiviere(db, EINSATZ, JETZT)).toEqual({ ok: true });
    const nach = new Map(freigabenFuer(db, EINSATZ, JETZT).map((f) => [f.id, f]));
    expect(nach.get(a.id)).toMatchObject({ status: "widerrufen", widerrufenAm: JETZT });
    expect(nach.get(b.id)).toMatchObject({ status: "widerrufen", widerrufenAm: JETZT });
    expect(nach.get(weg.id)?.widerrufenAm).toBe(JETZT - 5);
    expect(nach.get(alt.id)).toMatchObject({ status: "abgelaufen", widerrufenAm: null });
    expect(audit(db).slice(vorher)).toEqual([{ action: "update" }, { action: "update" }]);
    expect(loeseToken(db, andere.token, JETZT)).not.toBeNull(); // nur DIESER Plan
    expect(stelleWiederHer(db, EINSATZ)).toEqual({ ok: true });
    expect(loeseToken(db, a.token, JETZT + 1)).toBeNull();
    expect(qrTokenFuer(db, EINSATZ, JETZT + 1)).toBeNull();
  });
});

describe("Zählen (Entscheidung 6)", () => {
  it("zählt hoch und setzt zuletzt abgerufen — ohne Audit-Zeile", async () => {
    const db = await mitSeed();
    const f = aus(db);
    const vorher = audit(db).length;
    zaehleAbruf(db, f.id, JETZT + 5);
    zaehleAbruf(db, f.id, JETZT + 9);
    expect(db.select().from(planFreigabe).where(eq(planFreigabe.id, f.id)).get()).toMatchObject({ abrufe: 2, zuletztAbgerufen: new Date(JETZT + 9) });
    expect(audit(db)).toHaveLength(vorher);
  });
});

describe("QR des internen Drucks", () => {
  it("nimmt den besten gültigen Link des Plans, sonst null", async () => {
    const db = await mitSeed();
    expect(qrTokenFuer(db, OPENR, JETZT)).toBeNull();
    aus(db, OPENR, "24h");
    const unbegrenzt = aus(db, OPENR, "unbegrenzt", "", JETZT - 10);
    aus(db, OPENR, "30d");
    expect(qrTokenFuer(db, OPENR, JETZT)).toBe(unbegrenzt.token);
    widerrufeFreigabe(db, { planId: OPENR, freigabeId: unbegrenzt.id }, JETZT);
    expect(qrTokenFuer(db, OPENR, JETZT)).not.toBe(unbegrenzt.token);
  });
});
```

In `_db/schema.test.ts` (vorhandene Importe nutzen; `sql` ist schon importiert) einen Fall anhängen:

```ts
  it("Freigabe: Spalten aus Spec §8.2 vorhanden — Phase 5 braucht keine Migration (Entscheidung 1)", () => {
    const db = testDb();
    const spalten = (db.all(sql`PRAGMA table_info(plan_freigabe)`) as { name: string; notnull: number }[]).map((s) => [s.name, s.notnull]);
    expect(spalten).toEqual([
      ["id", 1], ["plan_id", 1], ["token", 1], ["notiz", 0], ["ablauf", 0], ["widerrufen_am", 0],
      ["erstellt_am", 1], ["erstellt_von", 1], ["zuletzt_abgerufen", 0], ["abrufe", 1],
    ]);
  });
```

(Die Migration `0000_plaene.sql` legt `id` als `text PRIMARY KEY NOT NULL` an, daher `notnull = 1`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/_lib/freigaben.test.ts src/app/m/kommplan/_db/schema.test.ts`
Expected: FAIL — „Failed to resolve import "./freigaben"" (der Schema-Fall läuft schon grün — er hält eine Annahme fest, keine neue Funktion).

- [ ] **Step 3: Write minimal implementation**

In `_lib/ergebnis.ts` den Typ-Import und den Typ ergänzen (Importzeile alphabetisch einreihen):

```ts
import type { FreigabeZeile } from "./freigabe/regeln";
```

```ts
/** Ausstellen und Widerrufen geben die ganze Liste mit serverseitig berechnetem Status zurück (Entscheidung 17). */
export type FreigabeErgebnis = { ok: true; neu: string | null; freigaben: FreigabeZeile[] } | { ok: false; fehler: string; feldFehler: FeldFehler };
```

```ts
// src/app/m/kommplan/_lib/freigaben.ts
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { KommplanDb } from "../_db/client";
import { plan, planFreigabe } from "../_db/schema";
import { feldFehlerAus } from "./angaben";
import type { FreigabeErgebnis } from "./ergebnis";
import {
  ablaufFuer, ausstellenSchema, FREIGABE_GRENZE, freigabeStatus, istTokenForm, waehleQrFreigabe, widerrufenSchema,
  type FreigabeZeile,
} from "./freigabe/regeln";
import { ladePlanLesend, type LesbarerPlan } from "./plaene";
import { PLAN_WEG } from "./planverwaltung";
import type { Bearbeiter } from "./speichern";

/**
 * TOKEN-LINKS IN DER DATENBANK (Spec §8.2; Umsetzungsplan Phase 5, Entscheidungen 1–3, 6, 10) — nur Server.
 * Ein Link wird immer über (Link-ID, Plan-ID) gefunden, nie über die Link-ID allein (IDOR). Ausstellen und
 * Widerrufen sind je eine Audit-Zeile über die Trigger von `plan_freigabe`; die Abrufzähler sind im Katalog
 * `unauditedColumns`. Alles synchron (better-sqlite3): zwischen Zählen und Anlegen liegt kein `await`, also
 * kein zweiter Aufruf dazwischen.
 */
export const neuesToken = (): string => randomBytes(32).toString("base64url");

const UNGUELTIG = { ok: false, fehler: "Ungültige Anfrage.", feldFehler: {} } as const;
const ms = (d: Date | null): number | null => (d === null ? null : d.getTime());

export function freigabenFuer(db: KommplanDb, planId: string, jetzt: number): FreigabeZeile[] {
  const zeilen = db.select().from(planFreigabe).where(eq(planFreigabe.planId, planId))
    .orderBy(desc(planFreigabe.erstelltAm), desc(planFreigabe.id)).all()
    .map((z): FreigabeZeile => {
      const roh = { ablauf: ms(z.ablauf), widerrufenAm: ms(z.widerrufenAm) };
      return {
        id: z.id, token: z.token, notiz: z.notiz, ...roh, erstelltAm: z.erstelltAm.getTime(), erstelltVon: z.erstelltVon,
        zuletztAbgerufen: ms(z.zuletztAbgerufen), abrufe: z.abrufe, status: freigabeStatus(roh, jetzt),
      };
    });
  // stabil: innerhalb der Gruppen bleibt „neueste zuerst"
  return [...zeilen.filter((z) => z.status === "gueltig"), ...zeilen.filter((z) => z.status !== "gueltig")];
}

const istAktiv = (db: KommplanDb, id: string) =>
  db.select({ id: plan.id }).from(plan).where(and(eq(plan.id, id), isNull(plan.archiviertAm))).get() !== undefined;

export function stelleFreigabeAus(db: KommplanDb, eingabe: unknown, wer: Bearbeiter, jetzt: number): FreigabeErgebnis {
  const r = ausstellenSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: feldFehlerAus(r.error) };
  const { planId, dauer, notiz } = r.data;
  if (!istAktiv(db, planId)) return { ok: false, fehler: PLAN_WEG, feldFehler: {} };
  const gueltig = freigabenFuer(db, planId, jetzt).filter((f) => f.status === "gueltig").length;
  if (gueltig >= FREIGABE_GRENZE.gueltigJePlan) {
    return { ok: false, fehler: `Höchstens ${FREIGABE_GRENZE.gueltigJePlan} gültige Links je Plan. Widerrufe zuerst einen, den niemand mehr braucht.`, feldFehler: {} };
  }
  const id = randomUUID();
  const ablauf = ablaufFuer(dauer, jetzt);
  db.insert(planFreigabe).values({
    id, planId, token: neuesToken(), notiz: notiz === "" ? null : notiz, ablauf: ablauf === null ? null : new Date(ablauf),
    erstelltAm: new Date(jetzt), erstelltVon: wer.name,
  }).run();
  return { ok: true, neu: id, freigaben: freigabenFuer(db, planId, jetzt) };
}

export function widerrufeFreigabe(db: KommplanDb, eingabe: unknown, jetzt: number): FreigabeErgebnis {
  const r = widerrufenSchema.safeParse(eingabe);
  if (!r.success) return UNGUELTIG;
  const { planId, freigabeId } = r.data;
  const da = db.select({ widerrufenAm: planFreigabe.widerrufenAm }).from(planFreigabe)
    .where(and(eq(planFreigabe.id, freigabeId), eq(planFreigabe.planId, planId))).get();
  if (!da) return { ok: false, fehler: "Diesen Link gibt es nicht.", feldFehler: {} };
  if (da.widerrufenAm === null) {
    db.update(planFreigabe).set({ widerrufenAm: new Date(jetzt) })
      .where(and(eq(planFreigabe.id, freigabeId), eq(planFreigabe.planId, planId), isNull(planFreigabe.widerrufenAm))).run();
  }
  return { ok: true, neu: null, freigaben: freigabenFuer(db, planId, jetzt) };
}

export interface TokenTreffer { freigabeId: string; token: string; plan: LesbarerPlan }

/** Gültig = nicht widerrufen, nicht abgelaufen (`ablauf > jetzt`), Plan nicht archiviert. Sonst null — in jedem Fall gleich. */
export function loeseToken(db: KommplanDb, token: string, jetzt: number): TokenTreffer | null {
  if (!istTokenForm(token)) return null;
  const z = db.select({ freigabeId: planFreigabe.id, planId: planFreigabe.planId }).from(planFreigabe)
    .innerJoin(plan, eq(plan.id, planFreigabe.planId))
    .where(and(
      eq(planFreigabe.token, token), isNull(planFreigabe.widerrufenAm),
      or(isNull(planFreigabe.ablauf), gt(planFreigabe.ablauf, new Date(jetzt))), isNull(plan.archiviertAm),
    )).get();
  if (!z) return null;
  const p = ladePlanLesend(db, z.planId);
  return p && p.archiviertAm === null ? { freigabeId: z.freigabeId, token, plan: p } : null;
}

/** Ein Statement, kein Lesen davor, kein Audit (Entscheidung 6). Den Entpreller hält `tokenZugang.ts`. */
export function zaehleAbruf(db: KommplanDb, freigabeId: string, jetzt: number): void {
  db.update(planFreigabe).set({ abrufe: sql`${planFreigabe.abrufe} + 1`, zuletztAbgerufen: new Date(jetzt) })
    .where(eq(planFreigabe.id, freigabeId)).run();
}

export function qrTokenFuer(db: KommplanDb, planId: string, jetzt: number): string | null {
  return waehleQrFreigabe(freigabenFuer(db, planId, jetzt), jetzt)?.token ?? null;
}
```

`_lib/planverwaltung.ts` — `archiviere` ersetzen (Importe: `planFreigabe` in die vorhandene `../_db/schema`-Zeile, `gt`, `or` in die `drizzle-orm`-Zeile; **nichts** aus `freigaben.ts`, das umgekehrt `PLAN_WEG` von hier holt) und im Kopfkommentar „Entscheidungen 7–10" → „Entscheidungen 7–10; Phase 5 Entscheidung 3" **in derselben Zeile**:

```ts
/**
 * Archivieren widerruft die gültigen Links des Plans in DERSELBEN Transaktion (Umsetzungsplan Phase 5,
 * Entscheidung 3): Wiederherstellen erweckt keinen wieder. Je Link eine Audit-Zeile über den Trigger von
 * `plan_freigabe`; abgelaufene und schon widerrufene bleiben, wie sie sind.
 */
export function archiviere(db: KommplanDb, id: string, jetzt: number): EinfachErgebnis {
  return db.transaction((tx): EinfachErgebnis => {
    const r = tx.update(plan).set({ archiviertAm: new Date(jetzt) }).where(and(eq(plan.id, id), isNull(plan.archiviertAm))).run();
    if (r.changes !== 1) return { ok: false, fehler: PLAN_WEG };
    tx.update(planFreigabe).set({ widerrufenAm: new Date(jetzt) }).where(and(
      eq(planFreigabe.planId, id), isNull(planFreigabe.widerrufenAm),
      or(isNull(planFreigabe.ablauf), gt(planFreigabe.ablauf, new Date(jetzt))),
    )).run();
    return { ok: true };
  });
}
```

(Transaktion wie `bibliothekDb.ts`. Die vorhandenen Tests von `archiviere` in `planverwaltung.test.ts` bleiben grün — Pläne ohne Links ändern sich nicht.)

Hinweis zum Import von `PLAN_WEG`: `planverwaltung.ts` importiert nichts aus `freigaben.ts` — kein Kreis.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan/_lib/freigaben.test.ts src/app/m/kommplan/_db/schema.test.ts`
Expected: PASS (dazu `pnpm vitest run src/app/m/kommplan/_lib/planverwaltung.test.ts`). Gegenproben: `gt(…)` → `gte(…)` macht „genau an der Grenze" rot; `eq(planFreigabe.planId, planId)` aus dem Widerruf entfernt macht den IDOR-Fall rot; das Widerrufen in `archiviere` entfernt macht „Wiederherstellen erweckt keinen" rot; `isNull(plan.archiviertAm)` in `loeseToken` entfernt macht den Auflösen-Fall rot (Archiv ohne Widerruf); je zurück.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "exit $?"
git grep -n "ergebnis.ts:[0-9]\|schema.test.ts:[0-9]\|planverwaltung.ts:[0-9]" -- src scripts e2e docs; pnpm anker:drift src/app/m/kommplan/_lib/ergebnis.ts; pnpm anker:drift src/app/m/kommplan/_lib/planverwaltung.ts
git add src/app/m/kommplan/_lib/freigaben.ts src/app/m/kommplan/_lib/freigaben.test.ts src/app/m/kommplan/_lib/ergebnis.ts src/app/m/kommplan/_db/schema.test.ts src/app/m/kommplan/_lib/planverwaltung.ts
git commit -S -m "feat(kommplan): Token-Links ausstellen, widerrufen, auflösen und zählen

Ohne Migration (plan_freigabe seit Phase 1): Notiz und Menge im Code,
Widerruf nur über Link und Plan, Zähler ohne Audit. Archivieren
widerruft die gültigen Links; Wiederherstellen erweckt keinen.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server Actions „Link ausstellen" und „Widerrufen"

**Files:**
- Create: `src/app/m/kommplan/_actions/freigabe.ts`
- Test: `src/app/m/kommplan/_actions/freigabe.test.ts`
- Modify: `src/core/audit/coverage-manifest.json`

**Interfaces:**
- Consumes: Task 2 (`stelleFreigabeAus`, `widerrufeFreigabe`, `FreigabeErgebnis`); `requireKommplanBearbeitenAktion`, `bearbeiterAus` aus `_lib/zugang.ts`.
- Produces: `stelleFreigabeAusAction(eingabe: unknown): Promise<FreigabeErgebnis>`, `widerrufeFreigabeAction(eingabe: unknown): Promise<FreigabeErgebnis>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/m/kommplan/_actions/freigabe.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-actions-freigabe-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "u1", name: "Jana", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "kommplan.localtest.me" }) }));
beforeEach(async () => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  const { seedLokalKommplan } = await import("../_lib/seedLokal");
  await seedLokalKommplan((await import("../_db/client")).getDb());
  gruppen = null;
});
const OPENR = "beispiel-openr-2022-07-01";

describe("Actions der Token-Links", () => {
  it("ohne Bearbeitungsrecht: Forbidden — auch mit Zugangsgruppe, auch anonym", async () => {
    const a = await import("./freigabe");
    await expect(a.stelleFreigabeAusAction({ planId: OPENR, dauer: "7d", notiz: "" })).rejects.toThrow("Forbidden");
    gruppen = ["iuk-kommplan"];
    await expect(a.stelleFreigabeAusAction({ planId: OPENR, dauer: "7d", notiz: "" })).rejects.toThrow("Forbidden");
    await expect(a.widerrufeFreigabeAction({ planId: OPENR, freigabeId: "x" })).rejects.toThrow("Forbidden");
  });
  it("ausstellen und widerrufen mit Audit-Akteur aus der Sitzung", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const a = await import("./freigabe");
    const r = await a.stelleFreigabeAusAction({ planId: OPENR, dauer: "24h", notiz: "Leitstelle" });
    if (!r.ok) throw new Error(r.fehler);
    expect(r.freigaben[0]).toMatchObject({ id: r.neu, notiz: "Leitstelle", erstelltVon: "Jana", status: "gueltig" });
    const w = await a.widerrufeFreigabeAction({ planId: OPENR, freigabeId: r.neu });
    expect(w).toMatchObject({ ok: true, freigaben: [{ status: "widerrufen" }] });
    const { getDb } = await import("../_db/client");
    const { sql } = await import("drizzle-orm");
    const akteure = getDb().all(sql`SELECT DISTINCT json_extract(actor, '$.id') AS id FROM audit_outbox WHERE object_type = 'plan_freigabe'`) as { id: string }[];
    expect(akteure).toEqual([{ id: "u1" }]);
  });
  it("Unsinn wird abgewiesen, nicht geworfen", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const a = await import("./freigabe");
    expect(await a.stelleFreigabeAusAction("x")).toMatchObject({ ok: false });
    expect(await a.widerrufeFreigabeAction({ planId: 5 })).toEqual({ ok: false, fehler: "Ungültige Anfrage.", feldFehler: {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/_actions/freigabe.test.ts src/app/m/kommplan/_actions/plan.test.ts`
Expected: FAIL — „Failed to resolve import "./freigabe"".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/m/kommplan/_actions/freigabe.ts
"use server";

import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import type { FreigabeErgebnis } from "../_lib/ergebnis";
import { stelleFreigabeAus, widerrufeFreigabe } from "../_lib/freigaben";
import { bearbeiterAus, requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Token-Links (Spec §8.2): Plan und Link werden in `_lib/freigaben.ts` gegen die Datenbank aufgelöst (IDOR).
// Beide geben die ganze Liste zurück — das Flyin und der QR-Hinweis rechnen nie selbst mit der Uhr.

export async function stelleFreigabeAusAction(eingabe: unknown): Promise<FreigabeErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => stelleFreigabeAus(getDb(), eingabe, bearbeiterAus(viewer), Date.now()));
}

export async function widerrufeFreigabeAction(eingabe: unknown): Promise<FreigabeErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => widerrufeFreigabe(getDb(), eingabe, Date.now()));
}
```

In `src/core/audit/coverage-manifest.json` alphabetisch vor `"src/app/m/kommplan/_actions/plan.ts#ladeStandAction"` einfügen:

```json
  "src/app/m/kommplan/_actions/freigabe.ts#stelleFreigabeAusAction": {
    "kind": "context",
    "via": "stelleFreigabeAusAction"
  },
  "src/app/m/kommplan/_actions/freigabe.ts#widerrufeFreigabeAction": {
    "kind": "context",
    "via": "widerrufeFreigabeAction"
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan/_actions/ src/core/audit/`
Expected: PASS (auch der Bauform-Test „jede exportierte Action prüft als ERSTE Anweisung …" und die Abdeckung von `core/audit`).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "exit $?"
git grep -n "coverage-manifest.json:[0-9]" -- src scripts e2e docs; pnpm anker:drift src/core/audit/coverage-manifest.json
git add src/app/m/kommplan/_actions/freigabe.ts src/app/m/kommplan/_actions/freigabe.test.ts src/core/audit/coverage-manifest.json
git commit -S -m "feat(kommplan): Actions zum Ausstellen und Widerrufen von Links

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Gemeinsame Druckseite und A3 quer als eigene Route

**Files:**
- Move: `src/app/m/kommplan/(intern)/p/[id]/druck/a4/druck.css` → `src/app/m/kommplan/_ui/druck/druck.css`
- Move: `src/app/m/kommplan/(intern)/p/[id]/druck/a4/Drucken.tsx` → `src/app/m/kommplan/_ui/druck/Drucken.tsx` (samt `Drucken.test.tsx`)
- Create: `src/app/m/kommplan/_ui/druck/Druckseite.tsx`, `src/app/m/kommplan/_ui/druck/Druckseite.test.tsx`
- Create: `src/app/m/kommplan/_lib/druckdaten.ts`, `src/app/m/kommplan/_lib/druckdaten.test.ts`
- Create: `src/app/m/kommplan/(intern)/p/[id]/druck/a3/page.tsx`
- Modify: `src/app/m/kommplan/(intern)/p/[id]/druck/a4/page.tsx`
- Modify: `src/app/m/kommplan/_ui/zeichnung/Blatt.tsx` (`format`), `src/app/m/kommplan/_ui/zeichnung/Druckblaetter.tsx` (`format`)
- Modify: `src/app/m/kommplan/_ui/zeichnung/Blatt.test.tsx`, `src/app/m/kommplan/_ui/kommplan-css.test.ts`, `src/app/m/kommplan/_lib/layout/eigenschaften.test.ts`

**Interfaces:**
- Consumes: `teileAuf`, `PAPIER`, `Papierformat`, `Blatt`; `rahmenFuer`; `kopfFuerZeichnung`; `symboleFuer`; `LesbarerPlan`.
- Produces:
  - `Blattansicht({ …, format?: Papierformat })` (Vorgabe `"a4-quer"`), `Druckblaetter({ format, blaetter, rahmen, symbole, schrift })`
  - `interface DruckseiteDaten { format: Papierformat; blaetter: Blatt[] | null; rahmen: Rahmen; symbole: Symbolsatz }`
  - `Druckseite({ daten, schrift }: { daten: DruckseiteDaten; schrift: { familie: string; klasse: string } })`
  - `druckseitenDaten(db: KommplanDb, plan: LesbarerPlan, auftrag: { format: Papierformat }): Promise<DruckseiteDaten>` (Tasks 10–12 erweitern `auftrag`)

- [ ] **Step 1: Write the failing test**

`Blatt.test.tsx` — neuer Fall im `describe("Blattansicht")`:

```ts
  it("A3 quer: 420 × 297 mm, Fuß und Legende am unteren Rand des A3-Blatts", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a3-quer");
    const html = renderToStaticMarkup(<Blattansicht format="a3-quer" blatt={blatt} rahmen={rahmen} symbole={{}} />);
    expect(html).toContain('width="420mm"');
    expect(html).toContain('height="297mm"');
    expect(html).toContain('viewBox="0 0 420 297"');
    const fussY = Number(/<text x="410"[^>]*y="([\d.]+)"[^>]*>Blatt 1 von 1/.exec(html)?.[1]);
    expect(fussY).toBeCloseTo(297 - 8 - 2, 6); // BLATT.randUnten + 2 über der Unterkante, rechts bei 420 − randX
  });
```

```tsx
// src/app/m/kommplan/_ui/druck/Druckseite.test.tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BEISPIELE } from "../../_lib/beispiele";
import { teileAuf } from "../../_lib/layout/papier";
import type { Rahmen } from "../zeichnung/Blatt";
import { Druckseite } from "./Druckseite";

const RAHMEN: Rahmen = { titel: "T", untertitel: null, stand: "Stand", bearbeiter: "B", vermerkVsNfD: false, organisation: null, logo: null };
const SCHRIFT = { familie: "Arimo", klasse: "arimo" };

describe("Druckseite (Entscheidung 13)", () => {
  it("trägt das Format am gemeinsamen Vorfahren (benanntes @page) und alle Blätter", () => {
    const gross = BEISPIELE.find((b) => b.id === "beispiel-grosse-stabslage")!;
    const blaetter = teileAuf(gross.inhalt, "a3-quer");
    const html = renderToStaticMarkup(<Druckseite schrift={SCHRIFT} daten={{ format: "a3-quer", blaetter, rahmen: RAHMEN, symbole: {} }} />);
    expect(html).toMatch(/<main class="kp-druck arimo" data-format="a3-quer">/);
    expect(html.split('class="kp-blatt"').length - 1).toBe(blaetter.length);
    expect(html).toContain('width="420mm"');
  });
  it("nicht lesbar: ein Satz, kein Druckanstoß, dasselbe Format", () => {
    const html = renderToStaticMarkup(<Druckseite schrift={SCHRIFT} daten={{ format: "a4-quer", blaetter: null, rahmen: RAHMEN, symbole: {} }} />);
    expect(html).toContain('data-format="a4-quer"');
    expect(html).toContain("Dieser Plan lässt sich nicht lesen.");
    expect(html).not.toContain("kp-druck-knopf");
  });
});
```

```ts
// src/app/m/kommplan/_lib/druckdaten.test.ts
import { describe, expect, it } from "vitest";
import { druckseitenDaten } from "./druckdaten";
import { ladePlanLesend } from "./plaene";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

async function mitSeed() { const db = testDb(); await seedLokalKommplan(db); return db; }

describe("Druckdaten (Spec §5.6, §8.1)", () => {
  it("A3 teilt die große Stab-Lage auf höchstens so viele Blätter wie A4, mit A3-Rahmen", async () => {
    const db = await mitSeed();
    const plan = ladePlanLesend(db, "beispiel-grosse-stabslage")!;
    const a4 = await druckseitenDaten(db, plan, { format: "a4-quer" });
    const a3 = await druckseitenDaten(db, plan, { format: "a3-quer" });
    expect(a3.format).toBe("a3-quer");
    expect(a3.blaetter!.length).toBeLessThanOrEqual(a4.blaetter!.length);
    expect(a3.rahmen).toMatchObject({ titel: plan.titel, organisation: "Musterorganisation" });
  });
});
```

`kommplan-css.test.ts` — neuer Fall (vorhandene `readFileSync`-Importe nutzen):

```ts
  it("Druck: EIN Stylesheet, zwei benannte @page mit ausgeschriebenen Kanten, Wahl am gemeinsamen Vorfahren (Falle 18)", () => {
    const css = readFileSync("src/app/m/kommplan/_ui/druck/druck.css", "utf8");
    expect(css).toMatch(/@page kommplan-a4\s*\{\s*size:\s*297mm 210mm;/);
    expect(css).toMatch(/@page kommplan-a3\s*\{\s*size:\s*420mm 297mm;/);
    expect(css).toMatch(/\.kp-druck\[data-format="a4-quer"\]\s*\{\s*page:\s*kommplan-a4;\s*\}/);
    expect(css).toMatch(/\.kp-druck\[data-format="a3-quer"\]\s*\{\s*page:\s*kommplan-a3;\s*\}/);
    expect(css).not.toMatch(/size:\s*A[3-8]/i);
  });
```

`eigenschaften.test.ts` (das Kammbudget hängt am Format, Spec §5.5): in den drei Kopfzeilen `describe.each(["bildschirm", "a4-quer"] as const)` (Zufallsbäume, eingeklappt, Stab-förmig) `"a3-quer"` ergänzen, und den Block „Aufteilung deckt jede Stelle genau einmal ab …" über beide Formate fahren:

```ts
describe.each(["a4-quer", "a3-quer"] as const)("Aufteilung deckt jede Stelle genau einmal ab, jedes Blatt sauber und angebunden (%s)", (format) => {
  const faelle = [ /* unverändert */ ];
  it.each(faelle)("Seed %i", (seed, inhalt) => {
    const blaetter = teileAuf(inhalt, format);
    /* Rest unverändert */
  });
});
```

(`offeneSchnitte(inhalt, b)` kennt kein Format — es schneidet nach der Sicht des Blatts; unverändert.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/_ui/zeichnung/Blatt.test.tsx src/app/m/kommplan/_ui/druck src/app/m/kommplan/_lib/druckdaten.test.ts src/app/m/kommplan/_ui/kommplan-css.test.ts`
Expected: FAIL — `format` unbekannt am Blatt (Typfehler/420mm fehlt), `./Druckseite` und `./druckdaten` nicht auflösbar, `druck.css` nicht unter `_ui/druck/`.

- [ ] **Step 3: Write minimal implementation**

Dateien verschieben:

```bash
git mv "src/app/m/kommplan/(intern)/p/[id]/druck/a4/druck.css" src/app/m/kommplan/_ui/druck/druck.css
git mv "src/app/m/kommplan/(intern)/p/[id]/druck/a4/Drucken.tsx" src/app/m/kommplan/_ui/druck/Drucken.tsx
git mv "src/app/m/kommplan/(intern)/p/[id]/druck/a4/Drucken.test.tsx" src/app/m/kommplan/_ui/druck/Drucken.test.tsx
```

`_ui/druck/druck.css` — die beiden ersten Regelblöcke ersetzen (Kommentar und `@page`/`.kp-druck`), der Rest bleibt:

```css
/*
 * Falle 18: benannte @page mit ausgeschriebenen Kantenlängen; jede Größe hat ihre EIGENE Route (gemischte
 * Seitengrößen in einem Dokument verwirft Chromium ganz). Beide Größen stehen in DIESEM einen Stylesheet:
 * so können zwei geladene Stylesheets (Client-Navigation behält CSS) einander nicht überschreiben, und jedes
 * Dokument wählt über `data-format` am gemeinsamen Vorfahren genau eine Seite (Umsetzungsplan Phase 5,
 * Entscheidung 13). Papier kennt keinen Dunkelmodus: Blätter und Umfeld sind hell, unabhängig von data-theme.
 */
@page kommplan-a4 {
  size: 297mm 210mm;
  margin: 0;
}
@page kommplan-a3 {
  size: 420mm 297mm;
  margin: 0;
}

/*
 * ⚠️ `page: …` SITZT AM GEMEINSAMEN VORFAHREN, nicht an jedem Blatt (Vorbild
 * `lagerbuch/verwaltung/(druck)/druck.css`, `.lb-ortbogen`): ALLES Gedruckte dieser Seite liegt auf derselben
 * Seitengröße — auch der Zweig „Dieser Plan lässt sich nicht lesen.". Die Blätter tragen nur den Umbruch.
 */
.kp-druck { background: #e9ebee; color: #000; padding-block: 16px; }
.kp-druck[data-format="a4-quer"] { page: kommplan-a4; }
.kp-druck[data-format="a3-quer"] { page: kommplan-a3; }
```

`_ui/zeichnung/Blatt.tsx` — `Blattansicht` bekommt das Format (Import `type Papierformat` aus `../../_lib/layout/typen` zur vorhandenen `Blatt`-Typzeile):

```tsx
export function Blattansicht({ blatt, rahmen, symbole, schrift, kopfStil, mitDefs = true, format = "a4-quer" }: {
  blatt: Blatt; rahmen: Rahmen; symbole: Symbolsatz; schrift?: string; kopfStil?: string; mitDefs?: boolean; format?: Papierformat;
}) {
  const p = PAPIER[format];
  const f = zeichenflaeche(format, blatt.legendeZeilen.length);
  const rechts = p.breite - BLATT.randX;
  const fussY = p.hoehe - BLATT.randUnten - 2;
  const legendeOben = legendeObenY(format, blatt.legendeZeilen.length);
```

(der Rest der Funktion bleibt; `aria-label`, `width`, `height`, `viewBox` lesen schon `p`.)

`_ui/zeichnung/Druckblaetter.tsx`:

```tsx
import type { Blatt, Papierformat } from "../../_lib/layout/typen";
…
export function Druckblaetter({ format, blaetter, rahmen, symbole, schrift }: { format: Papierformat; blaetter: Blatt[]; rahmen: Rahmen; symbole: Symbolsatz; schrift?: string }) {
  …
      {blaetter.map((b) => <Blattansicht key={b.nummer} format={format} blatt={b} rahmen={rahmen} symbole={symbole} schrift={schrift} mitDefs={false} />)}
```

und in `Druckblaetter.test.tsx` an beiden Aufrufen `format="a4-quer"` ergänzen.

```tsx
// src/app/m/kommplan/_ui/druck/Druckseite.tsx
import "./druck.css";
import type { Blatt, Papierformat } from "../../_lib/layout/typen";
import type { Rahmen } from "../zeichnung/Blatt";
import { Druckblaetter } from "../zeichnung/Druckblaetter";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { Drucken } from "./Drucken";

/** Was eine Druckroute braucht — gebaut von `_lib/druckdaten.ts`, gleich für intern und Token. */
export interface DruckseiteDaten { format: Papierformat; blaetter: Blatt[] | null; rahmen: Rahmen; symbole: Symbolsatz }

/**
 * DIE DRUCKSEITE für vier Routen (intern/Token × A4/A3; Umsetzungsplan Phase 5, Entscheidung 13): jedes Blatt als
 * Vektor-SVG in Originalgröße, „Als PDF sichern" im Druckdialog liefert das PDF (Spec §8.1). KEIN Riegel hier — die
 * Routen riegeln (`riegel.test.ts`). Keine Hülle (sie druckte mit, Phase-1-Abweichung 6), kein antd außer in der
 * Client-Insel `Drucken`. Die Schrift kommt als Prop: `next/font` gehört in die Route, nicht in eine testbare Komponente.
 */
export function Druckseite({ daten, schrift }: { daten: DruckseiteDaten; schrift: { familie: string; klasse: string } }) {
  if (!daten.blaetter) {
    return <main className="kp-druck" data-format={daten.format}><p>Dieser Plan lässt sich nicht lesen.</p></main>;
  }
  return (
    <main className={`kp-druck ${schrift.klasse}`} data-format={daten.format}>
      <Drucken />
      <Druckblaetter format={daten.format} blaetter={daten.blaetter} rahmen={daten.rahmen} symbole={daten.symbole} schrift={schrift.familie} />
    </main>
  );
}
```

```ts
// src/app/m/kommplan/_lib/druckdaten.ts
import type { KommplanDb } from "../_db/client";
import type { DruckseiteDaten } from "../_ui/druck/Druckseite";
import { kopfFuerZeichnung } from "./briefkopf";
import { teileAuf } from "./layout/papier";
import type { Papierformat } from "./layout/typen";
import type { LesbarerPlan } from "./plaene";
import { rahmenFuer } from "./rahmen";
import { symboleFuer } from "./zeichen/zeichen";

/**
 * DIE DATEN EINER DRUCKSEITE (Umsetzungsplan Phase 5, Entscheidung 13) — nur Server (liest das Rezept-Generat).
 * Gleich für die internen und die Token-Druckrouten; was sich unterscheidet (QR-Ziel, SVG-Export), kommt als Auftrag.
 */
export interface DruckAuftrag { format: Papierformat }

export async function druckseitenDaten(db: KommplanDb, plan: LesbarerPlan, auftrag: DruckAuftrag): Promise<DruckseiteDaten> {
  const inhalt = plan.inhalt;
  const rahmen = rahmenFuer({
    titel: plan.titel, anlass: plan.anlass, datum: plan.datum, aktualisiertAm: plan.aktualisiertAm,
    aktualisiertVon: plan.aktualisiertVon, vermerkVsNfD: inhalt?.optionen.vermerkVsNfD ?? false, kopf: kopfFuerZeichnung(db),
  });
  return {
    format: auftrag.format,
    blaetter: inhalt ? teileAuf(inhalt, auftrag.format) : null,
    rahmen,
    symbole: inhalt ? symboleFuer(inhalt) : {},
  };
}
```

(`async` schon jetzt: Task 10 erzeugt hier den QR per `await qrSvg(…)`.)

`(intern)/p/[id]/druck/a4/page.tsx` ganz ersetzen:

```tsx
import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { druckseitenDaten } from "@/app/m/kommplan/_lib/druckdaten";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { ladePlanLesendOder404 } from "@/app/m/kommplan/_lib/plaene";
import { requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Druckseite } from "@/app/m/kommplan/_ui/druck/Druckseite";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";

export const dynamic = "force-dynamic";

/**
 * DRUCK A4 QUER (Spec §8.1). Host, Zugang und das 404 des Plans prüfen `(intern)/layout.tsx`,
 * `(intern)/p/[id]/layout.tsx` UND diese Seite; archiviert bleibt druckbar (Phase 4, Entscheidung 10).
 */
export default async function DruckA4({ params }: { params: Promise<{ id: string }> }) {
  requireKommplanHost(await headers());
  await requireKommplanZugang();
  const { id } = await params;
  const db = getDb();
  const plan = ladePlanLesendOder404(db, id);
  return <Druckseite schrift={{ familie: ARIMO.style.fontFamily, klasse: ARIMO.className }} daten={await druckseitenDaten(db, plan, { format: "a4-quer" })} />;
}
```

`(intern)/p/[id]/druck/a3/page.tsx` — dieselbe Datei mit `DruckA3`, Kopfkommentar „DRUCK A3 QUER (Spec §8.1; Falle 18: eigene Route, Phase 5, Entscheidung 13).", Format `"a3-quer"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan`
Expected: PASS (auch `riegel.test.ts`: die neue A3-Seite liegt unter `(intern)` und trägt beide Riegel; `grenze.test.ts`: `Druckseite.tsx` ist keine Client-Insel und darf `druckdaten.ts` nicht importieren — tut sie nicht, die Richtung ist umgekehrt).

- [ ] **Step 5: Build, Ankerschritt, Commit**

```bash
uptime
pnpm typecheck; echo "exit $?"
pnpm build; echo "build exit $?"   # neue Route /p/[id]/druck/a3
git grep -n "druck/a4/page.tsx:[0-9]\|druck.css:[0-9]\|Drucken.tsx:[0-9]\|Blatt.tsx:[0-9]\|Druckblaetter.tsx:[0-9]" -- src scripts e2e docs
pnpm anker:drift src/app/m/kommplan/_ui/zeichnung/Blatt.tsx
git add -A src/app/m/kommplan
git commit -S -m "feat(kommplan): Druck A3 quer als eigene Route, gemeinsame Druckseite

Ein Stylesheet mit zwei benannten @page (Falle 18), Format am
gemeinsamen Vorfahren; Blatt und Druckblätter kennen das Format.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: „Drucken" als geteilter Knopf — A4 quer mit einem Klick, A3 quer über den Pfeil

**Files:**
- Create: `src/app/m/kommplan/_ui/druck/DruckMenue.tsx`, `src/app/m/kommplan/_ui/druck/DruckMenue.test.tsx`
- Modify: `src/app/m/kommplan/_ui/editor/Kopfleiste.tsx`, `src/app/m/kommplan/_ui/editor/Editor.tsx` (`drucken(wahl)`)
- Modify: `src/app/m/kommplan/_ui/editor/Editor.test.tsx` (zwei Druck-Fälle)
- Modify: `src/app/m/kommplan/(intern)/p/[id]/page.tsx` (Betrachter-Zweig)
- Modify: `src/app/m/kommplan/_ui/kommplan.css`
- Modify: `e2e/kommplan-editor.spec.ts` (Test „Drucken aus dem Editor …"), `e2e/kommplan.spec.ts` (A3-Seitengröße, A3 in den 404-Schleifen, Tastaturweg)

**Interfaces:**
- Consumes: Task 4 (Route `…/druck/a3`).
- Produces: `type DruckFormatKurz = "a4" | "a3"`, `interface DruckWahl { format: DruckFormatKurz; svg: boolean }`, `DRUCKFORMATE: readonly { key: DruckFormatKurz; label: string }[]`, `druckZiel(basis: string, w: DruckWahl): string`, `DruckMenue({ basis?: string; onWahl?: (w: DruckWahl) => void })` (Task 12 ergänzt `mitSvg?: boolean`). `Kopfleiste` nimmt `onDrucken: (w: DruckWahl) => void`.

**Vorher messen (für Task 9 und 16):** Höhe der Kopfleiste am Telefon im **Stand vor Phase 5**, einmal mit einem Playwright-Skript im Scratchpad (kein Suite-Test; `devLogin`, 390 × 844, `/p/beispiel-openr-2022-07-01?ansicht=diagramm`, `page.locator(".kp-kopfwerkzeuge").evaluate((e) => e.getBoundingClientRect().height)`). Die Zahl steht danach als `KOPFLEISTE_TELEFON_VORHER` in „Abweichungen bei der Umsetzung" und im Fototest (Task 16).

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/m/kommplan/_ui/druck/DruckMenue.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { DruckMenue } from "./DruckMenue";

afterEach(async () => { await unmount(); });
const punkte = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const pfeil = () => query<HTMLButtonElement>('button[aria-label="Weitere Druckformate"]');
async function oeffne() {
  await clickElement(pfeil());
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
// rc-menu aktiviert einen Punkt per Enter nur bei `e.which === 13` (@rc-component/menu, MenuItem); React leitet
// `which` aus `keyCode` ab, und jsdom setzt keyCode bei `{ key: "Enter" }` allein auf 0 — also beides angeben.
const enter = () => new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true, cancelable: true });

describe("DruckMenue (Entscheidung 12)", () => {
  it("„Drucken“ druckt A4 quer mit EINEM Klick; der Pfeil öffnet die zwei Formate in fester Reihenfolge", async () => {
    const wahl = vi.fn();
    await mount(<DruckMenue onWahl={wahl} />);
    expect(queryAll<HTMLButtonElement>("button").map((b) => b.textContent || b.getAttribute("aria-label"))).toEqual(["Drucken", "Weitere Druckformate"]);
    await clickElement(queryAll<HTMLButtonElement>("button")[0]);
    expect(wahl).toHaveBeenLastCalledWith({ format: "a4", svg: false });
    expect(pfeil().getAttribute("aria-haspopup")).toBe("menu");
    await oeffne();
    expect(punkte().map((p) => p.textContent)).toEqual(["A4 quer", "A3 quer"]);
  });
  it("mit basis: …/druck/a4 bzw. …/druck/a3 in einem neuen Tab — Hauptknopf, Klick und Enter im Menü", async () => {
    const auf = vi.spyOn(window, "open").mockReturnValue(null);
    await mount(<DruckMenue basis="/t/TOKEN" />);
    await clickElement(queryAll<HTMLButtonElement>("button")[0]);
    expect(auf).toHaveBeenLastCalledWith("/t/TOKEN/druck/a4", "_blank", "noopener");
    await oeffne();
    expect(punkte().some((p) => p.querySelector("a"))).toBe(false); // keine Anker: antd aktiviert per Enter nur onClick
    await clickElement(punkte()[1]);
    expect(auf).toHaveBeenLastCalledWith("/t/TOKEN/druck/a3", "_blank", "noopener");
    auf.mockClear();
    await oeffne();
    await act(async () => { punkte()[0].dispatchEvent(enter()); });
    await act(async () => {});
    expect(auf).toHaveBeenLastCalledWith("/t/TOKEN/druck/a4", "_blank", "noopener");
    auf.mockRestore();
  });
  it("mit onWahl: der Aufrufer entscheidet (Editor speichert vorher)", async () => {
    const wahl = vi.fn();
    await mount(<DruckMenue onWahl={wahl} />);
    await oeffne();
    await clickElement(punkte()[1]);
    expect(wahl).toHaveBeenCalledWith({ format: "a3", svg: false });
  });
});
```

`Editor.test.tsx` — die zwei vorhandenen Druck-Fälle umstellen (Helfer neben `knopf`):

```ts
async function druckeIn(format: "A4 quer" | "A3 quer") {
  if (format === "A4 quer") { await clickElement(knopf("Drucken")); return; } // der Hauptknopf druckt A4 quer
  await clickElement(query('button[aria-label="Weitere Druckformate"]'));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await clickElement([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent === format)!);
}
```

Im Fall „Drucken öffnet das Fenster sofort …" `await clickElement(knopf("Drucken (A4 quer)"));` durch `await druckeIn("A3 quer");` ersetzen und die Erwartung auf `expect(fenster.location.href).toBe("/p/p1/druck/a3");`; im Fall „Drucken, wenn das Speichern misslingt …" durch `await druckeIn("A4 quer");`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/_ui/druck/DruckMenue.test.tsx src/app/m/kommplan/_ui/editor/Editor.test.tsx`
Expected: FAIL — `./DruckMenue` nicht auflösbar; im Editor kein Knopf „Drucken".

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/app/m/kommplan/_ui/druck/DruckMenue.tsx
"use client";

import { Button, Dropdown, Space, type MenuProps } from "antd";

export type DruckFormatKurz = "a4" | "a3";
export interface DruckWahl { format: DruckFormatKurz; svg: boolean }
export const DRUCKFORMATE: readonly { key: DruckFormatKurz; label: string }[] = [
  { key: "a4", label: "A4 quer" },
  { key: "a3", label: "A3 quer" },
];
/** Das Ziel einer Wahl unter `basis` (`/p/<id>` oder `/t/<token>`); `svg` öffnet die Druckseite ohne Druckdialog (Task 12). */
export const druckZiel = (basis: string, w: DruckWahl): string => `${basis}/druck/${w.format}${w.svg ? "?export=svg" : ""}`;

/** Pfeil als Inline-SVG (Falle 7: keine @ant-design/icons) — Schmuck; der Knopf heißt über aria-label. */
function Pfeil() {
  return (
    <svg aria-hidden="true" focusable="false" width="10" height="10" viewBox="0 0 10 10" className="kp-druckmenue-pfeil">
      <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * „DRUCKEN" ALS GETEILTER KNOPF (Umsetzungsplan Phase 5, Entscheidung 12; ersetzt Phase-2-Entscheidung 20): der
 * Hauptknopf druckt A4 quer mit einem Klick, der Pfeil öffnet die Formate. `Space.Compact` statt des in antd 6
 * veralteten `Dropdown.Button`. `autoFocus` am Dropdown: per Enter am Pfeil steht der Fokus danach im Menü, die
 * Pfeiltasten wählen. Mit `basis` (Pfad ohne `/druck/…`) öffnet die Wahl die Druckroute in einem neuen Tab —
 * Betrachter und Token-Ansicht. KEINE Anker im Menü: rc-menu aktiviert einen Punkt per Enter nur über `onClick`,
 * ein `<a>` im Label bliebe für die Tastatur tot. Mit `onWahl` entscheidet der Aufrufer: der Editor speichert erst
 * und öffnet das Fenster synchron im Klick (Phase-2-Entscheidung 12).
 */
export function DruckMenue({ basis, onWahl }: { basis?: string; onWahl?: (w: DruckWahl) => void }) {
  const items: MenuProps["items"] = DRUCKFORMATE.map((f) => ({ key: f.key, label: f.label }));
  const waehle = (w: DruckWahl) => {
    if (basis) window.open(druckZiel(basis, w), "_blank", "noopener");
    else onWahl?.(w);
  };
  return (
    <Space.Compact className="kp-druckmenue">
      <Button onClick={() => waehle({ format: "a4", svg: false })}>Drucken</Button>
      <Dropdown trigger={["click"]} autoFocus menu={{ items, onClick: ({ key }) => waehle({ format: key as DruckFormatKurz, svg: false }) }}>
        <Button aria-label="Weitere Druckformate" aria-haspopup="menu"><Pfeil /></Button>
      </Dropdown>
    </Space.Compact>
  );
}
```

`Kopfleiste.tsx`: Import `import { DruckMenue, type DruckWahl } from "../druck/DruckMenue";`, Prop-Typ `onDrucken: (w: DruckWahl) => void`, Knopf ersetzen:

```tsx
            <DruckMenue onWahl={onDrucken} />
```

und im Kopfkommentar „„Drucken (A4 quer)" (derselbe Name wie im Betrachter, Entscheidung 20)" ersetzen durch „„Drucken" als geteilter Knopf A4/A3 (Phase 5, Entscheidung 12)" — **in derselben Zeile**, keine Zeile dazu oder weg.

`Editor.tsx`:

```tsx
  async function drucken(wahl: DruckWahl) {
    const ziel = druckZiel(`/p/${plan.id}`, wahl);
```

(Rest unverändert), Aufruf `onDrucken={(w) => void drucken(w)}`, Import `druckZiel, type DruckWahl` aus `../druck/DruckMenue`.

`(intern)/p/[id]/page.tsx` im Betrachter-Zweig: `import Link from "next/link";` entfällt (sonst unbenutzt), dazu `import { DruckMenue } from "@/app/m/kommplan/_ui/druck/DruckMenue";` und

```tsx
        aktionen={plan.inhalt ? <DruckMenue basis={`/p/${plan.id}`} /> : undefined}
```

`kommplan.css` (vor den Media-Blöcken): `.kp-druckmenue-pfeil { display: block; }`; im Block `@media (max-width: 767.98px)`: `.kp-druckmenue { width: 100%; } .kp-druckmenue > :first-child { flex: 1 1 auto; }` (Kindkombinator statt `.ant-*`-Namen, Falle 20).

e2e `kommplan-editor.spec.ts`, Test „Drucken aus dem Editor zeigt den gerade getippten Stand": den Klick ersetzen durch

```ts
  await klickeWennRuhig(page.getByRole("button", { name: "Weitere Druckformate" }));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "A3 quer" }));
```

und `await druck.waitForURL(/\/druck\/a4$/);` durch `/\/druck\/a3$/`.

e2e `kommplan.spec.ts`:
- Tests „ohne Gruppe: 404 auf Liste, Plan und Druck" und „unbekannter Plan: 404 auf Betrachter und Druck": die Pfadlisten um `` `/p/${EINSATZ}/druck/a3` `` bzw. `"/p/gibt-es-nicht/druck/a3"` erweitern (Kritik: sonst belegt die Wirkung des Riegels an der neuen Route nur die Bauform in `riegel.test.ts`).
- im Test „Druck A4: …" nach dem Einsatz-PDF ergänzen:

```ts
  const a3 = await page.goto(url(`/p/${EINSATZ}/druck/a3`));
  expect(a3?.status()).toBe(200);
  await warteAufGestreamteInhalte(page);
  await expect(page.locator("main.kp-druck")).toHaveAttribute("data-format", "a3-quer");
  const pdfA3 = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
  const groesse = pdfA3.getPage(0).getSize();
  expect(groesse.width).toBeCloseTo(1190.55, 0); // 420 mm in pt
  expect(groesse.height).toBeCloseTo(841.89, 0); // 297 mm in pt
```

- im Test „mit der Zugangsgruppe …" nach dem Plan-Abruf: `await expect(page.getByRole("button", { name: "Drucken", exact: true })).toBeVisible();`, `await expect(page.getByRole("button", { name: "Teilen" })).toHaveCount(0);` (die Zugangsgruppe teilt nicht, Entscheidung 17) und der **echte Tastaturweg** (Kritik: der DOM-Test löst Enter direkt am Menüpunkt aus, ohne dass er je den Fokus hatte):

```ts
  await page.context().addInitScript(() => { window.print = () => {}; });
  await page.getByRole("button", { name: "Weitere Druckformate" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "A3 quer" })).toBeVisible();
  const popup = page.waitForEvent("popup");
  for (let i = 0; i < PFEIL_RUNTER_BIS_A3; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const druck = await popup;
  await druck.waitForURL(/\/druck\/a3$/);
  await druck.close();
```

mit `const PFEIL_RUNTER_BIS_A3 = 2;` über dem Test — die Zahl einmal am echten Menü bestimmen (fokussiert `autoFocus` das Menü ohne aktiven Punkt, wählt der erste Pfeil „A4 quer") und in „Abweichungen" vermerken, falls sie abweicht. Geht der Weg ohne Tab gar nicht, ist das ein Befund für Entscheidung 12, kein Anlass, den Test auf Klicks umzustellen.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan` und (Last prüfen) `pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts -g "Druck|Zugangsgruppe"; git checkout -- next-env.d.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "exit $?"
git grep -n "Kopfleiste.tsx:[0-9]\|Editor.tsx:[0-9]\|p/\[id\]/page.tsx:[0-9]\|kommplan.css:[0-9]\|kommplan-editor.spec.ts:[0-9]\|kommplan.spec.ts:[0-9]" -- src scripts e2e docs
pnpm anker:drift src/app/m/kommplan/_ui/editor/Editor.tsx
git add src/app/m/kommplan e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts
git commit -S -m "feat(kommplan): Drucken als geteilter Knopf, A3 quer über den Pfeil

Ersetzt den Knopf „Drucken (A4 quer)“ (Phase-2-Entscheidung 20) im
Editor und im Betrachter: „Drucken“ druckt A4 quer mit einem Klick,
der Pfeil öffnet A4 quer und A3 quer; der Editor speichert vorher.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Vertrauliche Antwortköpfe im Proxy (noindex, no-referrer, no-store)

**Files:**
- Modify: `src/core/routing.ts` (Dateiende), `src/core/routing.test.ts`
- Modify: `src/proxy.ts` (Aufruf in `proxy()`, Funktion am Dateiende), `src/proxy.test.ts`

**Interfaces:**
- Consumes: nichts aus früheren Aufgaben.
- Produces: `VERTRAULICHE_KOEPFE` (`x-robots-tag`, `referrer-policy`, `cache-control`), `antwortKoepfeFuer(internerPfad: string): Readonly<Record<string, string>> | null` in `core/routing`; `mitVertraulichenKoepfen(antwort: Response, anfragePfad: string): Response` in `src/proxy.ts`.

- [ ] **Step 1: Write the failing test**

`src/core/routing.test.ts` (Importzeile um `antwortKoepfeFuer` erweitern), am Dateiende:

```ts
describe("antwortKoepfeFuer — vertrauliche Ansichten (kommplan Phase 5, Entscheidung 7)", () => {
  it("die Token-Ansicht und ihre Druckrouten bekommen noindex, no-referrer, no-store", () => {
    for (const p of ["/m/kommplan/t/abc", "/m/kommplan/t/abc/druck/a4", "/m/kommplan/t/abc/druck/a3"]) {
      expect(antwortKoepfeFuer(p)).toEqual({ "x-robots-tag": "noindex, nofollow, noarchive", "referrer-policy": "no-referrer", "cache-control": "no-store" });
    }
  });
  it("nichts sonst — auch nicht die /t/-Pfade anderer Module oder die Arbeitsrouten", () => {
    for (const p of ["/m/kommplan", "/m/kommplan/p/abc", "/m/kommplan/tt/abc", "/m/lagerbuch/t/abc", "/m/radio/t/abc", "/t/abc", "/m/kommplan/t"]) {
      expect(antwortKoepfeFuer(p), p).toBeNull();
    }
  });
});
```

`src/proxy.test.ts`, am Dateiende:

```ts
describe("mitVertraulichenKoepfen — gemessen am INTERNEN Pfad", () => {
  const { mitVertraulichenKoepfen } = proxyModul;
  it("Rewrite auf dem Modul-Host (/t/x → /m/kommplan/t/x): Köpfe gesetzt, auch wenn die Seite später 404 sagt", () => {
    const a = mitVertraulichenKoepfen(NextResponse.rewrite(new URL("http://kommplan.localtest.me:3000/m/kommplan/t/x")), "/t/x");
    expect(a.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(a.headers.get("referrer-policy")).toBe("no-referrer");
    expect(a.headers.get("cache-control")).toBe("no-store");
  });
  it("Direktpfad ohne Rewrite: der Anfragepfad zählt", () => {
    expect(mitVertraulichenKoepfen(NextResponse.next(), "/m/kommplan/t/x").headers.get("x-robots-tag")).toContain("noindex");
  });
  it("andere Pfade bleiben unberührt — auch ein /t/ eines anderen Moduls hinter einem Rewrite", () => {
    expect(mitVertraulichenKoepfen(NextResponse.rewrite(new URL("http://x/m/lagerbuch/t/abc")), "/t/abc").headers.get("x-robots-tag")).toBeNull();
    expect(mitVertraulichenKoepfen(NextResponse.next(), "/m/kommplan/p/abc").headers.get("referrer-policy")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/routing.test.ts src/proxy.test.ts`
Expected: FAIL — `antwortKoepfeFuer` und `mitVertraulichenKoepfen` sind nicht exportiert.

- [ ] **Step 3: Write minimal implementation**

`src/core/routing.ts`, **am Dateiende** anhängen (keine Zeile davor verschieben — Zeilenanker in `docs/*-portierung-analyse.md`):

```ts

/**
 * VERTRAULICHE ANSICHTEN (kommplan Phase 5, Entscheidung 7): anonyme Pfade, deren Inhalt nur der Linkinhaber
 * sehen soll. Eine Seite kann keine Antwortköpfe setzen — nur der Proxy. Gemessen wird am INTERNEN Pfad
 * (Rewrite-Ziel oder `/m/<key>/…`), damit `/t/x` auf dem Modul-Host und `/m/kommplan/t/x` gleich behandelt
 * werden, auch beim 404. `cache-control` setzt Next bei dynamischen Seiten zusätzlich selbst; zugesichert wird
 * „enthält no-store". Kein Registry-Feld: eine einzelne Ansicht rechtfertigt kein neues Modulfeld.
 */
const VERTRAULICHE_ANSICHTEN: readonly RegExp[] = [/^\/m\/kommplan\/t\/[^/]/];
export const VERTRAULICHE_KOEPFE: Readonly<Record<string, string>> = {
  "x-robots-tag": "noindex, nofollow, noarchive",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
};
export function antwortKoepfeFuer(internerPfad: string): Readonly<Record<string, string>> | null {
  return VERTRAULICHE_ANSICHTEN.some((m) => m.test(internerPfad)) ? VERTRAULICHE_KOEPFE : null;
}
```

`src/proxy.ts`: Import `antwortKoepfeFuer` in die vorhandene Zeile `import { decideRoute, resolveHost } from "@/core/routing";` aufnehmen. In `proxy()` die letzte Anweisung ersetzen — **in derselben Zeile**:

```ts
  return mitVertraulichenKoepfen(rewriteZielAufAnfrageOrigin(antwort, request.nextUrl.origin), request.nextUrl.pathname);
```

und **am Dateiende** (nach `export const config = …`):

```ts

/**
 * Vertrauliche Köpfe an die Antwort (kommplan Phase 5, Entscheidung 7; `antwortKoepfeFuer` in `core/routing`).
 * Erst NACH `rewriteZielAufAnfrageOrigin`: das Rewrite-Ziel ist der interne Pfad, an dem gemessen wird.
 */
export function mitVertraulichenKoepfen(antwort: Response, anfragePfad: string): Response {
  const ziel = antwort.headers.get(REWRITE_KOPF);
  const koepfe = antwortKoepfeFuer(ziel ? new URL(ziel).pathname : anfragePfad);
  if (koepfe) for (const [name, wert] of Object.entries(koepfe)) antwort.headers.set(name, wert);
  return antwort;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/core/routing.test.ts src/proxy.test.ts src/proxy.selbsthop.test.ts`
Expected: PASS.

- [ ] **Step 5: Build, Ankerschritt, Commit**

```bash
pnpm typecheck; echo "exit $?"
pnpm build; echo "build exit $?"
git grep -n "proxy.ts:[0-9]\|routing.ts:[0-9]" -- src scripts e2e docs
pnpm anker:drift src/proxy.ts
pnpm anker:drift src/core/routing.ts
git add src/core/routing.ts src/core/routing.test.ts src/proxy.ts src/proxy.test.ts
git commit -S -m "feat(core): vertrauliche Antwortköpfe für die Token-Ansicht der Kommunikationspläne

X-Robots-Tag noindex, Referrer-Policy no-referrer und Cache-Control
no-store am internen Pfad /m/kommplan/t/…, auch beim 404.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Wirkung am echten Abruf, auch auf 404: e2e in Task 15, gegen den gebauten Stand.)

---

### Task 7: Einen Tokenabruf je Anfrage auflösen — Schranke und entprellte Zählung

**Files:**
- Create: `src/app/m/kommplan/_lib/tokenZugang.ts`
- Test: `src/app/m/kommplan/_lib/tokenZugang.test.ts`

**Interfaces:**
- Consumes: Task 2 (`loeseToken`, `zaehleAbruf`, `TokenTreffer`); `RateLimiter`, `clientIpAus` aus `core/ratelimit`.
- Produces:
  - `TOKEN_SCHRANKE = { fehlversucheJeMinute: 30, abrufFensterMs: 60_000 }`
  - `interface Schranken { fehlversuche: RateLimiter; abrufe: RateLimiter }`, `neueSchranken(now?: () => number): Schranken`
  - `pruefeTokenAbruf(db: KommplanDb, token: string, absender: string, jetzt: number, s: Schranken): TokenTreffer | null`
  - `tokenAbruf: (token: string) => Promise<TokenTreffer | null>` (React `cache`), `tokenPlanOder404(token: string): Promise<TokenTreffer>`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/m/kommplan/_lib/tokenZugang.test.ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { planFreigabe } from "../_db/schema";
import { stelleFreigabeAus, widerrufeFreigabe } from "./freigaben";
import { archiviere } from "./planverwaltung";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";
import { neueSchranken, pruefeTokenAbruf, TOKEN_SCHRANKE } from "./tokenZugang";

const JETZT = Date.UTC(2026, 9, 1, 18, 0);
const OPENR = "beispiel-openr-2022-07-01";
async function aufbau() {
  const db = testDb();
  await seedLokalKommplan(db);
  const r = stelleFreigabeAus(db, { planId: OPENR, dauer: "7d", notiz: "" }, { nutzer: "u1", name: "Jana" }, JETZT);
  if (!r.ok) throw new Error(r.fehler);
  let uhr = JETZT;
  const s = neueSchranken(() => uhr);
  return { db, s, f: r.freigaben[0], weiter: (ms: number) => { uhr += ms; return uhr; }, jetzt: () => uhr };
}
const zeile = (db: ReturnType<typeof testDb>, id: string) => db.select().from(planFreigabe).where(eq(planFreigabe.id, id)).get()!;

describe("Tokenabruf (Spec §8.2; Entscheidungen 4–6)", () => {
  it("gültig → Plan; zählt den ersten Abruf, Wiederholung derselben Adresse binnen 60 s nicht", async () => {
    const { db, s, f, weiter, jetzt } = await aufbau();
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.1", jetzt(), s)?.plan.id).toBe(OPENR);
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.1", weiter(5_000), s)).not.toBeNull();
    expect(zeile(db, f.id)).toMatchObject({ abrufe: 1, zuletztAbgerufen: new Date(JETZT) });
    pruefeTokenAbruf(db, f.token, "203.0.113.2", jetzt(), s); // andere Adresse zählt
    pruefeTokenAbruf(db, f.token, "203.0.113.1", weiter(TOKEN_SCHRANKE.abrufFensterMs), s); // Fenster vorbei
    expect(zeile(db, f.id).abrufe).toBe(3);
  });
  it("nach 29 Fehlversuchen geht ein gültiger Token noch, nach dem 30. ist die Adresse gesperrt — ohne Datenbankabfrage, auch für gültige", async () => {
    const { db, s, f, jetzt, weiter } = await aufbau();
    expect(TOKEN_SCHRANKE.fehlversucheJeMinute).toBe(30);
    for (let i = 0; i < TOKEN_SCHRANKE.fehlversucheJeMinute - 1; i++) expect(pruefeTokenAbruf(db, "B".repeat(43), "203.0.113.9", jetzt(), s)).toBeNull();
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.9", jetzt(), s)).not.toBeNull();
    expect(pruefeTokenAbruf(db, "falsch", "203.0.113.9", jetzt(), s)).toBeNull(); // falsche Form zählt mit
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.9", jetzt(), s)).toBeNull();
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.10", jetzt(), s)).not.toBeNull(); // andere Adresse
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.9", weiter(60_001), s)).not.toBeNull(); // Fenster abgelaufen
  });
  it("widerrufen oder archiviert: die NÄCHSTE Anfrage ist null, obwohl der Entpreller den Link eben noch kannte", async () => {
    const { db, s, f, jetzt } = await aufbau();
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.3", jetzt(), s)).not.toBeNull();
    widerrufeFreigabe(db, { planId: OPENR, freigabeId: f.id }, jetzt());
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.3", jetzt(), s)).toBeNull();
    const r = stelleFreigabeAus(db, { planId: OPENR, dauer: "unbegrenzt", notiz: "" }, { nutzer: "u1", name: "Jana" }, jetzt());
    if (!r.ok) throw new Error(r.fehler);
    expect(pruefeTokenAbruf(db, r.freigaben[0].token, "203.0.113.4", jetzt(), s)).not.toBeNull();
    archiviere(db, OPENR, jetzt());
    expect(pruefeTokenAbruf(db, r.freigaben[0].token, "203.0.113.4", jetzt(), s)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/_lib/tokenZugang.test.ts`
Expected: FAIL — „Failed to resolve import "./tokenZugang"".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/m/kommplan/_lib/tokenZugang.ts
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { clientIpAus, RateLimiter } from "@/core/ratelimit";
import { getDb, type KommplanDb } from "../_db/client";
import { loeseToken, zaehleAbruf, type TokenTreffer } from "./freigaben";

/**
 * DER RIEGEL DER TOKEN-ANSICHT (Spec §8.2; Umsetzungsplan Phase 5, Entscheidungen 4–6) — nur Server.
 *
 * - Fehlversuche (unbekannt, falsche Form, abgelaufen, widerrufen, archiviert) zählen je Absender; dreißig in einer
 *   Minute sperren die Adresse. Gesperrt heißt 404 OHNE Datenbankabfrage — auch für einen gültigen Token derselben
 *   Adresse, sonst wäre die Sperre ein Orakel. Gültige Abrufe buchen nichts. VORBEHALT (mitgehoben aus
 *   `core/ratelimit`): Prozessspeicher; ohne `cf-connecting-ip` teilen sich alle den Eimer "unknown".
 * - Abrufe: ein UPDATE je Abruf, dieselbe Adresse und derselbe Link zählen binnen 60 s nur einmal.
 * - Layout und Seite rendern parallel und fragen beide: `tokenAbruf` ist je Anfrage gecacht (React `cache`), also
 *   bucht genau der erste Aufruf. Er gibt `null` zurück; `notFound()` rufen die Aufrufer — keine gecachte Ausnahme.
 */
export const TOKEN_SCHRANKE = { fehlversucheJeMinute: 30, abrufFensterMs: 60_000 } as const;
export interface Schranken { fehlversuche: RateLimiter; abrufe: RateLimiter }
export function neueSchranken(now?: () => number): Schranken {
  return {
    fehlversuche: new RateLimiter({ windowMs: 60_000, max: TOKEN_SCHRANKE.fehlversucheJeMinute, now }),
    abrufe: new RateLimiter({ windowMs: TOKEN_SCHRANKE.abrufFensterMs, max: 1, now }),
  };
}
const SCHRANKEN = neueSchranken();

export function pruefeTokenAbruf(db: KommplanDb, token: string, absender: string, jetzt: number, s: Schranken): TokenTreffer | null {
  if (s.fehlversuche.istGesperrt(absender)) return null;
  const treffer = loeseToken(db, token, jetzt);
  if (!treffer) {
    s.fehlversuche.check(absender);
    return null;
  }
  if (s.abrufe.check(`${absender}|${treffer.freigabeId}`)) zaehleAbruf(db, treffer.freigabeId, jetzt);
  return treffer;
}

export const tokenAbruf = cache(async (token: string): Promise<TokenTreffer | null> =>
  pruefeTokenAbruf(getDb(), token, clientIpAus(await headers()), new Date().getTime(), SCHRANKEN));

/** Für `t/[token]/layout.tsx` und jede Seite darunter: derselbe Treffer, sonst ein echtes 404 (Falle 23). */
export async function tokenPlanOder404(token: string): Promise<TokenTreffer> {
  const t = await tokenAbruf(token);
  if (!t) notFound();
  return t;
}
```

(`getDb` und `KommplanDb` kommen beide aus `_db/client.ts`; dort ist `KommplanDb` schon exportiert.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan/_lib/tokenZugang.test.ts`
Expected: PASS. Gegenproben: `istGesperrt`-Zeile entfernt → „gesperrt — auch für gültige" rot; Entpreller entfernt → `abrufe` 4 statt 3, rot; je zurück. Die Deduplizierung über React `cache` belegt erst der e2e (Task 15: 29 Fehlversuche über Seiten mit Layout **und** Seite sperren noch nicht — bei doppelter Buchung wären es 58).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "exit $?"
git add src/app/m/kommplan/_lib/tokenZugang.ts src/app/m/kommplan/_lib/tokenZugang.test.ts
git commit -S -m "feat(kommplan): Tokenabruf je Anfrage einmal auflösen, Fehlversuche sperren

Dreißig Fehlversuche je Minute und Adresse sperren ohne Datenbankabfrage;
Abrufe zählen entprellt (eine Adresse, ein Link, eine Minute).

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Token-Ansicht und Token-Druck — Routen, Rahmen, Riegel

**Files:**
- Create: `src/app/m/kommplan/t/[token]/layout.tsx`, `src/app/m/kommplan/t/[token]/page.tsx`
- Create: `src/app/m/kommplan/t/[token]/druck/a4/page.tsx`, `src/app/m/kommplan/t/[token]/druck/a3/page.tsx`
- Create: `src/app/m/kommplan/_lib/tokenMetadaten.ts`
- Create: `src/app/m/kommplan/_ui/token/TokenRahmen.tsx`, `src/app/m/kommplan/_ui/token/token.css`, `src/app/m/kommplan/_ui/token/TokenKopf.tsx`, `src/app/m/kommplan/_ui/token/TokenKopf.test.tsx`
- Create: `src/app/m/kommplan/t/not-found.tsx`, `src/app/m/kommplan/_ui/token/TokenUngueltig.tsx`, `src/app/m/kommplan/_ui/token/TokenUngueltig.test.tsx` (eigene 404, Entscheidung 4)
- Modify: `src/app/m/kommplan/riegel.test.ts`, `src/app/m/kommplan/grenze.test.ts`
- Modify: `src/app/m/kommplan/_ui/betrachter/Betrachter.tsx`, `src/app/m/kommplan/_ui/betrachter/Flaeche.tsx` (nur `className="kp-betrachter-wurzel"` bzw. `"kp-flaeche-wurzel"` am klassenlosen Wurzel-`div`, in derselben Zeile — Haken für die Höhenkette der Token-Ansicht, ohne Wirkung im Editor)

**Interfaces:**
- Consumes: Task 4 (`Druckseite`, `druckseitenDaten`), Task 5 (`DruckMenue`), Task 7 (`tokenPlanOder404`), Task 1 (`tokenPfad`); `Betrachter`, `kopfFuerZeichnung`, `symboleFuer`, `ARIMO`, `TYP_NAME`, `kalendertag`.
- Produces: `TOKEN_METADATEN: Metadata`; `TokenRahmen({ children })`; `TokenUngueltig()`; `TokenKopf({ plan, kopf, token })` mit `plan: { titel; typ; anlass; datum; aktualisiertAm; aktualisiertVon; vermerkVsNfD }`.

- [ ] **Step 1: Write the failing test**

`riegel.test.ts` — `AUSSERHALB` um die vier Dateien erweitern:

```ts
  "t/[token]/layout.tsx": "Token-Ansicht (Spec §8.2): anonym; Riegel ist der Token selbst — Host und tokenPlanOder404 oberhalb jeder loading.tsx (Falle 23)",
  "t/[token]/page.tsx": "Token-Ansicht: prüft Host und Token selbst noch einmal (Layouts und Seiten rendern parallel)",
  "t/[token]/druck/a4/page.tsx": "Token-Druck A4 quer: wie die Token-Ansicht",
  "t/[token]/druck/a3/page.tsx": "Token-Druck A3 quer: wie die Token-Ansicht",
```

und einen Block anhängen:

```ts
describe("kommplan: die Token-Routen tragen ihren eigenen Riegel und nichts Internes (Phase 5)", () => {
  const token = routen.filter((p) => p.startsWith("t/"));
  it("genau die vier Dateien (sonst wäre unten alles leer-grün)", () => {
    expect(token).toEqual(["t/[token]/druck/a3/page.tsx", "t/[token]/druck/a4/page.tsx", "t/[token]/layout.tsx", "t/[token]/page.tsx"]);
  });
  it.each(token)("%s: Host-Riegel und Token-Riegel je genau einmal; kein Anmelde-Riegel, keine Plan-ID, keine Action", (datei) => {
    const q = code(datei);
    expect(zaehle(q, /requireKommplanHost\(await headers\(\)\)/), "Host-Riegel").toBe(1);
    expect(zaehle(q, /await tokenPlanOder404\(/), "Token-Riegel").toBe(1);
    expect(q).not.toMatch(/requireKommplanZugang|\bauth\(|ladePlan|_actions|\.id\b.*params|params[^;]*\bid\b/);
    expect(q.indexOf("tokenPlanOder404(")).toBeLessThan(q.indexOf("return"));
  });
  it.each(token.filter((p) => p.endsWith("page.tsx")))("%s: statische Metadaten (noindex) und kein generateMetadata", (datei) => {
    const q = code(datei);
    expect(q).toMatch(/export const metadata = TOKEN_METADATEN;/);
    expect(q).not.toMatch(/generateMetadata/);
  });
});
```

`grenze.test.ts` — im `describe("kommplan: Importgrenzen")` anhängen (nutzt das vorhandene `erreichbar`):

```ts
  it("keine Token-Route erreicht eine Server Action, den Editor oder die Planliste — auch nicht über Umwege", () => {
    const routen = laufzeit.filter((p) => relative(MODUL, p).startsWith("t/"));
    expect(routen.map((p) => relative(MODUL, p)).sort()).toEqual([
      "t/[token]/druck/a3/page.tsx", "t/[token]/druck/a4/page.tsx", "t/[token]/layout.tsx", "t/[token]/page.tsx", "t/not-found.tsx",
    ]); // die 404-Seite ist keine ROUTENDATEI für riegel.test.ts, zählt hier aber mit: auch sie erreicht nichts Internes
    for (const r of routen) {
      const treffer = [...erreichbar(r)].map((d) => relative(MODUL, d))
        .filter((d) => d.startsWith("_actions/") || d.startsWith("_ui/editor/") || d.startsWith("_ui/teilen/") || d.startsWith("(intern)/"));
      expect(treffer, `${relative(MODUL, r)} zieht ${treffer.join(", ")}`).toEqual([]);
    }
  });
```

(`erreichbar` hält an einer `"use server"`-Datei an, zählt sie aber als erreicht — genau das soll hier rot werden.)

```tsx
// src/app/m/kommplan/_ui/token/TokenKopf.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { TokenKopf } from "./TokenKopf";

afterEach(async () => { await unmount(); });
const PLAN = {
  titel: "Kommunikationsplan Einsatz 22.02.2026", typ: "kommunikationsplan" as const, anlass: "Hochwasser",
  datum: Date.UTC(2026, 1, 22), aktualisiertAm: Date.UTC(2026, 8, 30, 12, 5), aktualisiertVon: "Jana", vermerkVsNfD: true,
};

describe("TokenKopf (Entscheidung 8)", () => {
  it("Titel als h1, Art · Anlass · Datum, Stand und Bearbeitung, VS-NfD-Vermerk, Druckmenü auf den Token-Pfad", async () => {
    await mount(<TokenKopf plan={PLAN} kopf={{ organisation: "Musterorganisation", logo: null }} token="T".repeat(43) />);
    expect(query("h1").textContent).toBe(PLAN.titel);
    expect(query("[data-token-angaben]").textContent).toBe("Kommunikationsplan · Hochwasser · 22.02.2026");
    expect(query("[data-token-stand]").textContent).toBe("Stand 30.09.2026, 14:05 · Bearbeitung: Jana");
    expect(query("[data-vermerk]").textContent).toBe("VS – nur für den Dienstgebrauch");
    expect(query("[data-organisation]").textContent).toBe("Musterorganisation");
    expect(exists("[data-logo]")).toBe(false);
    expect(query("button").textContent).toBe("Drucken");
  });
  it("ohne Vermerk, ohne Briefkopf: nichts davon steht da; das Logo kommt als <image> mit data:-URI, nie als <img>", async () => {
    await mount(<TokenKopf plan={{ ...PLAN, vermerkVsNfD: false }} kopf={{ organisation: null, logo: { href: "data:image/png;base64,QUJD" } }} token="T".repeat(43) />);
    expect(exists("[data-vermerk]")).toBe(false);
    expect(exists("[data-organisation]")).toBe(false);
    expect(query("[data-logo] image").getAttribute("href")).toBe("data:image/png;base64,QUJD");
    expect(exists("img")).toBe(false);
  });
});
```

(Die Uhrzeit 14:05 gilt für `Europe/Berlin`, die Vorgabe der Suite-Zone in Tests — Vorbild `Kopfleiste.test.ts`, „Gespeichert 11:05".)

```tsx
// src/app/m/kommplan/_ui/token/TokenUngueltig.test.tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TokenUngueltig } from "./TokenUngueltig";

describe("404 der Token-Ansicht (Entscheidung 4)", () => {
  it("ein Satz für alle Fälle, im Token-Rahmen, ohne Weg zur Startseite oder Anmeldung", () => {
    const html = renderToStaticMarkup(<TokenUngueltig />);
    expect(html).toContain("<h1>Dieser Link gilt nicht (mehr).</h1>");
    expect(html).toContain("Bitte die Person, die ihn dir geschickt hat, um einen neuen.");
    expect(html).toContain("kp-token-fahne");
    expect(html).not.toMatch(/<a\b|<button|href=|Anmeld|Startseite|Administration/);
  });
});
```

`TokenKopf.test.tsx` zusätzlich (Kritik zum Raster): `expect(query("[data-token-stand]").closest(".kp-token-links")).not.toBeNull();` — Titel, Angaben, Stand und Vermerk stehen in einem eigenen linken Block, der Briefkopf rechts daneben.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/riegel.test.ts src/app/m/kommplan/grenze.test.ts src/app/m/kommplan/_ui/token`
Expected: FAIL — die vier Routen fehlen (`toEqual` der Liste, `routen.length` 0), `./TokenKopf` nicht auflösbar.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/m/kommplan/_lib/tokenMetadaten.ts
import type { Metadata } from "next";

/**
 * Statische Metadaten JEDER Token-Seite (Entscheidung 7): kein Plantitel im <title> (Verlauf, Lesezeichen,
 * Vorschaukarten in Messengern), noindex auch als Meta-Element, Referrer aus. KEIN generateMetadata — das liefe
 * parallel zum Riegel und dürfte die Datenbank nicht anfassen.
 */
export const TOKEN_METADATEN: Metadata = {
  title: "Kommunikationspläne",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};
```

```tsx
// src/app/m/kommplan/t/[token]/layout.tsx
import { headers } from "next/headers";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { tokenPlanOder404 } from "@/app/m/kommplan/_lib/tokenZugang";

/**
 * FALLE 23 FÜR DIE TOKEN-ANSICHT (Spec §8.2; Umsetzungsplan Phase 5, Entscheidung 4): unbekannt, falsch geformt,
 * abgelaufen, widerrufen oder Plan archiviert ist hier ein echtes 404 — oberhalb jeder künftigen `loading.tsx`,
 * sonst wäre es still ein HTTP 200. Kein Anmelde-Riegel: der Token IST der Riegel. Die Seiten darunter prüfen
 * selbst noch einmal; `tokenPlanOder404` ist je Anfrage gecacht, gebucht wird einmal.
 */
export default async function TokenSchutz({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  requireKommplanHost(await headers());
  await tokenPlanOder404((await params).token);
  return children;
}
```

```tsx
// src/app/m/kommplan/t/[token]/page.tsx
import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { kopfFuerZeichnung } from "@/app/m/kommplan/_lib/briefkopf";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { TOKEN_METADATEN } from "@/app/m/kommplan/_lib/tokenMetadaten";
import { tokenPlanOder404 } from "@/app/m/kommplan/_lib/tokenZugang";
import { symboleFuer } from "@/app/m/kommplan/_lib/zeichen/zeichen";
import { Betrachter } from "@/app/m/kommplan/_ui/betrachter/Betrachter";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";
import { TokenKopf } from "@/app/m/kommplan/_ui/token/TokenKopf";
import { TokenRahmen } from "@/app/m/kommplan/_ui/token/TokenRahmen";

export const dynamic = "force-dynamic";
export const metadata = TOKEN_METADATEN;

/**
 * DIE TOKEN-ANSICHT (Spec §8.2; Entscheidung 8): nur lesend, immer der aktuelle Stand, derselbe Betrachter wie
 * innen. An Client-Inseln gehen NUR Planinhalt, Titel, Symbole und der Token (für die Druckziele) — nie die
 * Plan-ID (Review Focus 4).
 */
export default async function TokenAnsicht({ params }: { params: Promise<{ token: string }> }) {
  requireKommplanHost(await headers());
  const { token } = await params;
  const { plan } = await tokenPlanOder404(token);
  return (
    <TokenRahmen>
      <TokenKopf token={token} kopf={kopfFuerZeichnung(getDb())} plan={{
        titel: plan.titel, typ: plan.typ, anlass: plan.anlass, datum: plan.datum, aktualisiertAm: plan.aktualisiertAm,
        aktualisiertVon: plan.aktualisiertVon, vermerkVsNfD: plan.inhalt?.optionen.vermerkVsNfD ?? false,
      }} />
      {plan.inhalt ? (
        <div className={`kp-token-flaeche ${ARIMO.className}`}>
          <Betrachter inhalt={plan.inhalt} symbole={symboleFuer(plan.inhalt)} titel={plan.titel} schrift={ARIMO.style.fontFamily} />
        </div>
      ) : (
        <p className="kp-token-hinweis">Dieser Plan lässt sich gerade nicht anzeigen.</p>
      )}
    </TokenRahmen>
  );
}
```

```tsx
// src/app/m/kommplan/t/[token]/druck/a4/page.tsx
import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { druckseitenDaten } from "@/app/m/kommplan/_lib/druckdaten";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { TOKEN_METADATEN } from "@/app/m/kommplan/_lib/tokenMetadaten";
import { tokenPlanOder404 } from "@/app/m/kommplan/_lib/tokenZugang";
import { Druckseite } from "@/app/m/kommplan/_ui/druck/Druckseite";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";

export const dynamic = "force-dynamic";
export const metadata = TOKEN_METADATEN;

/** TOKEN-DRUCK A4 QUER (Entscheidung 9): dieselbe Druckseite, ohne SVG-Export. */
export default async function TokenDruckA4({ params }: { params: Promise<{ token: string }> }) {
  requireKommplanHost(await headers());
  const { token } = await params;
  const { plan } = await tokenPlanOder404(token);
  return <Druckseite schrift={{ familie: ARIMO.style.fontFamily, klasse: ARIMO.className }} daten={await druckseitenDaten(getDb(), plan, { format: "a4-quer" })} />;
}
```

`t/[token]/druck/a3/page.tsx` — gleich, `TokenDruckA3`, Kopfkommentar „TOKEN-DRUCK A3 QUER …", Format `"a3-quer"`.

In **beiden** Token-Druckseiten in dieser Aufgabe statt der zwei Zeilen `const { token } = await params;` / `const { plan } = await tokenPlanOder404(token);` die eine Zeile `const { plan } = await tokenPlanOder404((await params).token);` schreiben — `token` wird erst in Task 10 (QR) gebraucht, und `pnpm lint` meldet eine unbenutzte Variable. Task 10 stellt auf die zweizeilige Form oben um.

```tsx
// src/app/m/kommplan/_ui/token/TokenRahmen.tsx
import type { ReactNode } from "react";
import "../kommplan.css";
import "./token.css";

/**
 * DER RAHMEN DER TOKEN-ANSICHT (Entscheidung 8; Muster docs/design/feedback-oeffentliche-ansicht.md und
 * `files/_ui/OeffentlicherRahmen.tsx`): 3-px-Fahne und Wortzeichen „IDA" — die einzigen zwei Stellen mit
 * Suite-Rot im eigenen Markup —, Kicker mit dem Modulnamen (typneutral), darunter der Inhalt. KEINE Shell, kein
 * App-Umschalter, kein Request-Zustand; der Rahmen SELBST ohne antd (antd kommt nur über die Inseln Betrachter und
 * DruckMenue, dort Dichte 56/72 ohne Hülle). Breiter als die Feedback-Ansicht: der Betrachter braucht Fläche.
 */
export function TokenRahmen({ children }: { children: ReactNode }) {
  return (
    <div className="kp-token-seite">
      <div className="kp-token-fahne" aria-hidden="true" />
      <main className="kp-token-blatt">
        <p className="kp-token-kicker">KOMMUNIKATIONSPLÄNE<span className="kp-token-wortzeichen">IDA</span></p>
        {children}
      </main>
    </div>
  );
}
```

```css
/* src/app/m/kommplan/_ui/token/token.css — Token-Ansicht (Phase 5, Entscheidung 8). Farben nur über --kp-*. */
:root {
  --kp-token-grund: #f5f6f8;
  --kp-token-text: #1f1f1f;
  --kp-token-leise: #595959;
  --kp-token-linie: #d0d4da;
}
:root[data-theme="dark"] {
  --kp-token-grund: #141414;
  --kp-token-text: #f0f0f0;
  --kp-token-leise: #b8b8b8;
  --kp-token-linie: #3a3a3a;
}
.kp-token-seite { height: 100dvh; display: grid; grid-template-rows: auto minmax(0, 1fr); background: var(--kp-token-grund); color: var(--kp-token-text); }
/* Suite-Rot nur hier und am Wortzeichen (feedback-oeffentliche-ansicht.md, Entscheidung 1) — nie als Fläche im Inhalt. */
.kp-token-fahne { height: 3px; background: #c8000f; }
/* Die Seite ist eine 100dvh-Spalte, der Betrachter füllt den Rest (Kritik: sonst ist die Seite am Telefon höher als
   der Schirm, und jedes Wischen auf dem Betrachter verschiebt das Diagramm statt der Seite). min-height: 0 an JEDEM
   Glied der Kette, sonst wächst das Raster mit dem Inhalt. Die 404-Seite hat keinen Betrachter: dort ist die letzte
   Zeile einfach leer. */
.kp-token-blatt { width: 100%; max-width: 1600px; margin-inline: auto; padding: 16px; display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 12px; min-height: 0; box-sizing: border-box; }
.kp-token-kicker { margin: 0; font-size: 11px; letter-spacing: .08em; color: var(--kp-token-leise); display: flex; justify-content: space-between; }
.kp-token-wortzeichen { color: #c8000f; font-weight: 700; font-size: 13px; letter-spacing: .10em; }
/* Zwei Spalten: links ein eigener Block (Titel, Angaben, Stand, Vermerk), rechts der Briefkopf; die Aktionen darunter
   über die ganze Breite (Kritik: ohne eigenen Block legte die automatische Platzierung Zeilen in die schmale Spalte). */
.kp-token-kopf { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 16px; align-items: start; line-height: normal; }
.kp-token-links { display: grid; gap: 4px; min-width: 0; }
.kp-token-kopf h1 { margin: 0; font-size: 22px; line-height: 1.25; overflow-wrap: anywhere; }
.kp-token-briefkopf { display: flex; align-items: center; gap: 8px; justify-self: end; }
.kp-token-briefkopf svg { width: 120px; height: 33px; }
.kp-token-zeile { margin: 0; color: var(--kp-token-leise); }
.kp-token-vermerk { justify-self: start; margin: 0; padding: 2px 8px; border: 1px solid var(--kp-token-text); border-radius: 4px; font-weight: 600; }
.kp-token-aktionen { grid-column: 1 / -1; }
.kp-token-flaeche, .kp-token-flaeche .kp-betrachter-wurzel, .kp-token-flaeche .kp-flaeche-wurzel { min-height: 0; display: flex; flex-direction: column; }
.kp-token-flaeche .kp-betrachter-wurzel, .kp-token-flaeche .kp-flaeche-wurzel { flex: 1 1 auto; }
/* Überschreibt die Grundhöhe calc(100dvh - 240px) des Betrachters: hier füllt er, was Kopf, Werkzeuge und Legende lassen. */
.kp-token-flaeche .kp-betrachter { flex: 1 1 auto; height: auto; min-height: 320px; }
.kp-token-ungueltig h1 { margin: 0; font-size: 22px; line-height: 1.25; }
.kp-token-ungueltig p { margin: 8px 0 0; color: var(--kp-token-leise); max-width: 60ch; }
@media (max-width: 767.98px) {
  .kp-token-blatt { padding: 12px 16px; gap: 8px; }
  .kp-token-kopf { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .kp-token-kopf h1 { font-size: 19px; }
  .kp-token-briefkopf { justify-self: start; }
  /* Angaben und Stand in EINER Zeile, der Vermerk inline dahinter — der Kopf darf den Betrachter nicht verdrängen. */
  .kp-token-links { display: block; }
  .kp-token-links .kp-token-zeile, .kp-token-links .kp-token-vermerk { display: inline; font-size: 13px; }
  .kp-token-links .kp-token-zeile + .kp-token-zeile::before { content: " · "; }
  .kp-token-links .kp-token-vermerk { margin-inline-start: 6px; padding: 0 4px; }
}
```

```tsx
// src/app/m/kommplan/_ui/token/TokenKopf.tsx
import { zeitFormat } from "@/core/zeit";
import { TYP_NAME, type PlanTyp } from "../../_lib/angaben";
import type { KopfAngaben } from "../../_lib/briefkopf";
import { tokenPfad } from "../../_lib/freigabe/regeln";
import { kalendertag } from "../../_lib/rahmen";
import { DruckMenue } from "../druck/DruckMenue";

// zeitFormat löst die Zone erst beim Formatieren auf — auf Modulebene erlaubt (CLAUDE.md, „Zeitzone").
const STAND = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export interface TokenKopfPlan {
  titel: string; typ: PlanTyp; anlass: string | null; datum: number | null; aktualisiertAm: number; aktualisiertVon: string; vermerkVsNfD: boolean;
}

/**
 * DER KOPF DER TOKEN-ANSICHT (Entscheidung 8) — HTML statt Blattkopf, damit er am Telefon lesbar bleibt.
 * Briefkopf aus `kopfFuerZeichnung` (Spec §4.4: ohne Eintrag bleibt die Stelle leer). Das Logo als `<image>` mit
 * `data:`-URI im Inline-SVG wie auf dem Blatt: keine Bildroute, kein Skript aus einem SVG-Logo, kein `<img>`.
 * Der VS-NfD-Vermerk neutral umrandet, nie rot (Falle 3). Keine Server-Abhängigkeit außer der Uhrformatierung.
 */
export function TokenKopf({ plan, kopf, token }: { plan: TokenKopfPlan; kopf: KopfAngaben; token: string }) {
  const angaben = [TYP_NAME[plan.typ], plan.anlass?.trim() || null, kalendertag(plan.datum)].filter(Boolean).join(" · ");
  return (
    <header className="kp-token-kopf">
      <div className="kp-token-links">
        <h1>{plan.titel}</h1>
        <p className="kp-token-zeile" data-token-angaben="">{angaben}</p>
        <p className="kp-token-zeile" data-token-stand="">{`Stand ${STAND.format(plan.aktualisiertAm)} · Bearbeitung: ${plan.aktualisiertVon}`}</p>
        {plan.vermerkVsNfD ? <p className="kp-token-vermerk" data-vermerk="">VS – nur für den Dienstgebrauch</p> : null}
      </div>
      {kopf.organisation || kopf.logo ? (
        <div className="kp-token-briefkopf">
          {kopf.organisation ? <span data-organisation="">{kopf.organisation}</span> : null}
          {kopf.logo ? (
            <svg data-logo="" viewBox="0 0 40 11" role="img" aria-label={kopf.organisation ? `Logo ${kopf.organisation}` : "Logo"}>
              <image width="40" height="11" preserveAspectRatio="xMaxYMid meet" href={kopf.logo.href} />
            </svg>
          ) : null}
        </div>
      ) : null}
      <div className="kp-token-aktionen"><DruckMenue basis={tokenPfad(token)} /></div>
    </header>
  );
}
```

(`KopfAngaben` ist in `_lib/briefkopf.ts` exportiert; der Import ist reiner Typ — `TokenKopf` zieht kein `node:*`. Der Test montiert den Kopf in jsdom: `zeitFormat` liest dort `<html data-zeitzone>` und fällt auf `Europe/Berlin` zurück.)

```tsx
// src/app/m/kommplan/_ui/token/TokenUngueltig.tsx
import { TokenRahmen } from "./TokenRahmen";

/**
 * DIE 404 DER TOKEN-ANSICHT (Entscheidung 4; Muster Zustand F in docs/design/feedback-oeffentliche-ansicht.md):
 * EIN Text für unbekannt, falsch geformt, abgelaufen, widerrufen und archiviert — nach außen kein Unterschied.
 * Kein Knopf, kein Link auf „/" (dort wartet eine Anmeldung, die der Empfänger nicht hat), nichts aus der Datenbank.
 */
export function TokenUngueltig() {
  return (
    <TokenRahmen>
      <section className="kp-token-ungueltig">
        <h1>Dieser Link gilt nicht (mehr).</h1>
        <p>Vielleicht ist er abgelaufen, widerrufen oder unvollständig kopiert. Bitte die Person, die ihn dir geschickt hat, um einen neuen.</p>
      </section>
    </TokenRahmen>
  );
}
```

```tsx
// src/app/m/kommplan/t/not-found.tsx
import { TokenUngueltig } from "@/app/m/kommplan/_ui/token/TokenUngueltig";

/**
 * Not-Found-Grenze des Segments `t` — sie fängt das `notFound()` aus `t/[token]/layout.tsx` und jeder Seite darunter
 * (Entscheidung 4). Ohne sie fiele die Antwort auf die Suite-404 (`src/app/not-found.tsx`) mit Weg zur Anmeldung.
 */
export default function TokenNichtGefunden() {
  return <TokenUngueltig />;
}
```

(`not-found.tsx` ist keine `ROUTENDATEI` in `riegel.test.ts` und braucht keinen Eintrag in `AUSSERHALB`; `grenze.test.ts` zählt sie oben mit. Vor dem Code `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md` lesen: die Datei rendert innerhalb der Grenzen ihres Segments, eine `loading.tsx` in `t/` machte sie zu einem 200 — es gibt keine.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan`
Expected: PASS. Gegenproben: in `t/[token]/page.tsx` `await tokenPlanOder404(` durch `await tokenAbruf(` ersetzt → Riegel-Test rot; `import { setzeOptionen } …` aus `_ui/editor/…` in `TokenKopf.tsx` → Grenztest rot; je zurück.

- [ ] **Step 5: Build, Ankerschritt, Commit**

```bash
uptime
pnpm typecheck; echo "exit $?"
pnpm lint; echo "lint exit $?"
pnpm build; echo "build exit $?"   # Routen /t/[token], /t/[token]/druck/a4|a3
git grep -n "riegel.test.ts:[0-9]\|grenze.test.ts:[0-9]\|Betrachter.tsx:[0-9]\|Flaeche.tsx:[0-9]" -- src scripts e2e docs
git add src/app/m/kommplan
git commit -S -m "feat(kommplan): Token-Ansicht und Token-Druck ohne Anmeldung

/t/<token> mit eigenem Rahmen, Briefkopf, Stand, VS-NfD-Vermerk und
demselben Betrachter; Druck A4/A3. Unbekannt, abgelaufen, widerrufen
oder archiviert ist ein echtes 404 im Layout (Falle 23), mit eigener
Seite ohne Weg zur Anmeldung.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: „Teilen" im Editor — Links ausstellen, kopieren, widerrufen

**Files:**
- Create: `src/app/m/kommplan/_ui/teilen/zwischenablage.ts`, `src/app/m/kommplan/_ui/teilen/zwischenablage.test.ts`
- Create: `src/app/m/kommplan/_ui/teilen/Teilen.tsx`, `src/app/m/kommplan/_ui/teilen/Teilen.test.tsx`, `src/app/m/kommplan/_lib/freigabe/texte.ts` (rein — liegt im geteilten Ordner `_lib/freigabe/` aus Task 1)
- Modify: `src/app/m/kommplan/_ui/editor/Editor.tsx` (Flyin „teilen", Zustand `freigaben`, Prop `teilen`)
- Modify: `src/app/m/kommplan/_ui/editor/Kopfleiste.tsx` (Knopf „Teilen", Prop `onTeilen`, Klasse `kp-ganze-zeile` für Umschalter, „Wiederholen" und „Plan und Verbindungen")
- Modify: `src/app/m/kommplan/_ui/editor/Editor.test.tsx` (Mock der neuen Actions, ein Fall)
- Modify: `src/app/m/kommplan/(intern)/p/[id]/page.tsx` (Teilen-Daten an den Editor)
- Modify: `src/app/m/kommplan/_ui/kommplan.css`

**Interfaces:**
- Consumes: Task 1 (`FreigabeZeile`, `FREIGABE_DAUERN`, `DAUER_NAME`, `DAUER_VORGABE`, `FREIGABE_GRENZE`, `tokenUrl`), Task 2 (`freigabenFuer`), Task 3 (`stelleFreigabeAusAction`, `widerrufeFreigabeAction`); `moduleUrl` aus `core/shell/moduleUrl`.
- Produces:
  - `kopiere(text: string): Promise<"kopiert" | "manuell">`
  - `ZEIT`, `ablaufText(f)`, `abrufText(f)` in `_lib/freigabe/texte.ts` (Task 10 ergänzt `qrZielSatz`)
  - `TEILEN_FLYIN_GRUND = 520`, `TeilenFlyin({ offen, onSchliessen, nachSchliessen, planId, basis, freigaben, onFreigaben })`, `Teilen({ planId, basis, freigaben, onFreigaben })`
  - `Editor`-Prop `teilen?: { freigaben: FreigabeZeile[]; basis: string | null }` (Vorgabe `{ freigaben: [], basis: null }`); Editor-Zustand `freigaben` — Task 10 wählt daraus `qrLink` (`besteFreigabe`).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/m/kommplan/_ui/teilen/zwischenablage.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { kopiere } from "./zwischenablage";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const URL_ = "http://kommplan.localtest.me:3000/t/" + "A".repeat(43);

describe("kopiere (Review Focus 3)", () => {
  it("sicherer Kontext mit Clipboard-API: schreibt dorthin", async () => {
    const schreibe = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: schreibe } });
    expect(await kopiere(URL_)).toBe("kopiert");
    expect(schreibe).toHaveBeenCalledWith(URL_);
  });
  it("http ohne Clipboard-API: Rückfall über ein verstecktes Textfeld, Fokus kehrt zurück, nichts bleibt im DOM", async () => {
    vi.stubGlobal("isSecureContext", false);
    const knopf = document.body.appendChild(document.createElement("button"));
    knopf.focus();
    let kopiert = "";
    document.execCommand = vi.fn((befehl: string) => { kopiert = befehl === "copy" ? (document.activeElement as HTMLTextAreaElement).value : ""; return true; });
    expect(await kopiere(URL_)).toBe("kopiert");
    expect(kopiert).toBe(URL_);
    expect(document.activeElement).toBe(knopf);
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
    knopf.remove();
  });
  it("Clipboard-API wirft (Berechtigung verweigert) und execCommand scheitert: „manuell“, nie ein Wurf", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowed")) } });
    document.execCommand = vi.fn(() => false);
    expect(await kopiere(URL_)).toBe("manuell");
  });
});
```

```tsx
// src/app/m/kommplan/_ui/teilen/Teilen.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { clickElement, exists, fill, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { FreigabeZeile } from "../../_lib/freigabe/regeln";
import { Teilen } from "./Teilen";

const aktion = vi.hoisted(() => ({ aus: vi.fn(), weg: vi.fn() }));
vi.mock("../../_actions/freigabe", () => ({ stelleFreigabeAusAction: aktion.aus, widerrufeFreigabeAction: aktion.weg }));
const ablage = vi.hoisted(() => ({ kopiere: vi.fn() }));
vi.mock("./zwischenablage", () => ({ kopiere: ablage.kopiere }));

const BASIS = "http://kommplan.localtest.me:3000";
const T = (c: string) => c.repeat(43);
const Z = (o: Partial<FreigabeZeile>): FreigabeZeile => ({
  id: "f1", token: T("A"), notiz: "Leitstelle", ablauf: Date.UTC(2026, 9, 8, 16, 0), widerrufenAm: null, erstelltAm: Date.UTC(2026, 9, 1, 16, 0),
  erstelltVon: "Jana", zuletztAbgerufen: null, abrufe: 0, status: "gueltig", ...o,
});
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent === text)!;
const imEintrag = (id: string, text: string) => [...query(`[data-freigabe="${id}"]`).querySelectorAll("button")].find((b) => b.textContent === text)!;
const neue = vi.fn();
/** Hält die Liste wie der Editor im Zustand — für Fälle, in denen die Liste nach einer Action wechselt. */
function Wirt({ start }: { start: FreigabeZeile[] }) {
  const [f, setF] = useState(start);
  return <Teilen planId="p1" basis={BASIS} freigaben={f} onFreigaben={(n) => { neue(n); setF(n); }} />;
}
afterEach(async () => { await unmount(); aktion.aus.mockReset(); aktion.weg.mockReset(); ablage.kopiere.mockReset(); neue.mockReset(); });

describe("Teilen (Spec §8.2; Entscheidung 17)", () => {
  it("beim Öffnen steht der Fokus in der Notiz (Tastaturweg: Notiz, Enter, Enter)", async () => {
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[]} onFreigaben={neue} />);
    expect(document.activeElement?.id).toBe("kp-teilen-notiz");
  });
  it("Vorgabe 7 Tage; Ausstellen schickt Dauer und Notiz, übernimmt die Liste, fokussiert „Link kopieren“ am neuen Link", async () => {
    aktion.aus.mockResolvedValue({ ok: true, neu: "f2", freigaben: [Z({ id: "f2", token: T("B"), notiz: "Presse" }), Z({})] });
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[Z({})]} onFreigaben={neue} />);
    expect(query<HTMLInputElement>('input[type="radio"][value="7d"]').checked).toBe(true);
    await clickElement(query('input[type="radio"][value="24h"]'));
    await fill("#kp-teilen-notiz", "Presse");
    await clickElement(knopf("Link ausstellen"));
    await act(async () => {});
    expect(aktion.aus).toHaveBeenCalledWith({ planId: "p1", dauer: "24h", notiz: "Presse" });
    expect(neue).toHaveBeenCalledWith([expect.objectContaining({ id: "f2" }), expect.objectContaining({ id: "f1" })]);
  });
  it("ein Eintrag zeigt Notiz, Ablauf, Abrufe und die URL; Kopieren meldet sich im Status", async () => {
    ablage.kopiere.mockResolvedValue("kopiert");
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[Z({ abrufe: 3, zuletztAbgerufen: Date.UTC(2026, 9, 1, 17, 30) })]} onFreigaben={neue} />);
    const e = query('[data-freigabe="f1"]');
    expect(e.textContent).toContain("Leitstelle");
    expect(e.textContent).toContain("gültig bis 08.10.2026, 18:00");
    expect(e.textContent).toContain("3 Abrufe, zuletzt 01.10.2026, 19:30");
    expect(query('[data-freigabe="f1"] [data-link]').textContent).toBe(`${BASIS}/t/${T("A")}`);
    await clickElement(knopf("Link kopieren"));
    await act(async () => {});
    expect(ablage.kopiere).toHaveBeenCalledWith(`${BASIS}/t/${T("A")}`);
    expect(query('[role="status"]').textContent).toBe("Link kopiert.");
    expect(imEintrag("f1", "Kopiert")).toBeTruthy(); // sichtbar am Eintrag, nicht nur oben
  });
  it("zwei Links: Kopieren am zweiten antwortet am zweiten — „Kopiert“ und das Lesefeld stehen dort", async () => {
    ablage.kopiere.mockResolvedValueOnce("kopiert").mockResolvedValueOnce("manuell");
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[Z({}), Z({ id: "f2", token: T("B"), notiz: "Presse" })]} onFreigaben={neue} />);
    await clickElement(imEintrag("f2", "Link kopieren"));
    await act(async () => {});
    expect(imEintrag("f2", "Kopiert")).toBeTruthy();
    expect(imEintrag("f1", "Link kopieren")).toBeTruthy();
    await clickElement(imEintrag("f2", "Kopiert"));
    await act(async () => {});
    expect(query('[data-freigabe="f2"] input[data-manuell]').getAttribute("value")).toBe(`${BASIS}/t/${T("B")}`);
    expect(exists('[data-freigabe="f1"] input[data-manuell]')).toBe(false);
    expect(document.activeElement?.closest("[data-freigabe]")?.getAttribute("data-freigabe")).toBe("f2");
  });
  it("nach dem Widerrufen steht der Fokus am nächsten gültigen Link, beim letzten an „Gültige Links (0)“", async () => {
    aktion.weg.mockResolvedValueOnce({ ok: true, neu: null, freigaben: [Z({ id: "f2", token: T("B") }), Z({ status: "widerrufen", widerrufenAm: 1 })] });
    await mount(<Wirt start={[Z({}), Z({ id: "f2", token: T("B") })]} />);
    const bestaetige = async () => {
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      await clickElement([...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Widerrufen" && !b.closest("[data-freigabe]"))!);
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    };
    await clickElement(imEintrag("f1", "Widerrufen"));
    await bestaetige();
    expect(document.activeElement?.closest("[data-freigabe]")?.getAttribute("data-freigabe")).toBe("f2");
    aktion.weg.mockResolvedValueOnce({ ok: true, neu: null, freigaben: [Z({ id: "f2", token: T("B"), status: "widerrufen", widerrufenAm: 2 }), Z({ status: "widerrufen", widerrufenAm: 1 })] });
    await clickElement(imEintrag("f2", "Widerrufen"));
    await bestaetige();
    expect(document.activeElement?.textContent).toBe("Gültige Links (0)");
  });
  it("Kopieren geht nicht von selbst: der Link steht markiert in einem Lesefeld mit Anleitung — im Eintrag", async () => {
    ablage.kopiere.mockResolvedValue("manuell");
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[Z({})]} onFreigaben={neue} />);
    await clickElement(knopf("Link kopieren"));
    await act(async () => {});
    const feld = query<HTMLInputElement>('[data-freigabe="f1"] input[data-manuell]');
    expect(feld.readOnly).toBe(true);
    expect(feld.value).toBe(`${BASIS}/t/${T("A")}`);
    expect(document.activeElement).toBe(feld);
    expect(query('[role="status"]').textContent).toContain("Kopiere ihn mit Strg+C");
  });
  it("abgelaufene und widerrufene stehen eingeklappt darunter, ohne „Link kopieren“", async () => {
    await mount(<Teilen planId="p1" basis={BASIS} onFreigaben={neue} freigaben={[
      Z({}), Z({ id: "f3", token: T("C"), status: "abgelaufen" }), Z({ id: "f4", token: T("D"), status: "widerrufen", widerrufenAm: Date.UTC(2026, 9, 1, 17, 0) }),
    ]} />);
    expect(query("details summary").textContent).toBe("Abgelaufen und widerrufen (2)");
    expect(queryAll("details [data-freigabe]")).toHaveLength(2);
    expect(queryAll("details button").map((b) => b.textContent)).not.toContain("Link kopieren");
    expect(query('[data-freigabe="f4"]').textContent).toContain("widerrufen am 01.10.2026, 19:00");
  });
  it("ohne eingerichtete Adresse: Ausstellen gesperrt, mit Grund", async () => {
    await mount(<Teilen planId="p1" basis={null} freigaben={[]} onFreigaben={neue} />);
    expect(knopf("Link ausstellen").disabled).toBe(true);
    expect(query("[data-keine-adresse]").textContent).toContain("keine Adresse eingerichtet");
  });
  it("Fehler der Action steht im Status, die Liste bleibt", async () => {
    aktion.aus.mockResolvedValue({ ok: false, fehler: "Höchstens 20 gültige Links je Plan.", feldFehler: {} });
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[Z({})]} onFreigaben={neue} />);
    await clickElement(knopf("Link ausstellen"));
    await act(async () => {});
    expect(query('[role="status"]').textContent).toBe("Höchstens 20 gültige Links je Plan.");
    expect(neue).not.toHaveBeenCalled();
    expect(exists('[data-freigabe="f1"]')).toBe(true);
  });
});
```

`Editor.test.tsx` — die einzige Testdatei, die `<Editor>` montiert (`grep -rl "<Editor" src/app/m/kommplan | grep test` beim Planen: nur sie; vor dem Commit erneut prüfen und jede weitere Datei genauso versorgen) —, zu den vorhandenen `vi.mock`-Zeilen (der Editor zieht über `Teilen.tsx` jetzt `_actions/freigabe.ts`):

```ts
const freigabeAktion = vi.hoisted(() => ({ aus: vi.fn(), weg: vi.fn() }));
vi.mock("../../_actions/freigabe", () => ({ stelleFreigabeAusAction: freigabeAktion.aus, widerrufeFreigabeAction: freigabeAktion.weg }));
```

und ein Fall:

```ts
  it("„Teilen“ öffnet das Flyin mit den Links des Plans und hält seine Breite frei", async () => {
    await mount(<Editor plan={plan()} symbole={{}} zeichenIndex={[]} schrift="Arimo"
      teilen={{ basis: "http://kommplan.localtest.me:3000", freigaben: [{ id: "f1", token: "A".repeat(43), notiz: "Leitstelle", ablauf: null, widerrufenAm: null, erstelltAm: 1, erstelltVon: "Jana", zuletztAbgerufen: null, abrufe: 0, status: "gueltig" }] }} />);
    await act(async () => {});
    await clickElement(knopf("Teilen"));
    await act(async () => {});
    expect(document.querySelector('[data-freigabe="f1"]')?.textContent).toContain("Leitstelle");
    expect(query(".kp-editor").getAttribute("data-flyin")).toBe("teilen");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/_ui/teilen src/app/m/kommplan/_ui/editor/Editor.test.tsx`
Expected: FAIL — `./zwischenablage`, `./Teilen` nicht auflösbar; kein Knopf „Teilen".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/m/kommplan/_ui/teilen/zwischenablage.ts
/**
 * KOPIEREN AUCH ÜBER HTTP (Entscheidung 17, Review Focus 3): `navigator.clipboard` gibt es nur im sicheren Kontext
 * (HTTPS, `localhost`) — im LAN über `http://<ip>` und auf `*.localtest.me` fehlt es. Dann ein unsichtbares Textfeld
 * mit `execCommand("copy")` (veraltet, aber in allen Browsern vorhanden und im Klick erlaubt); der Fokus kehrt
 * danach dorthin zurück, wo er war. Scheitert beides: „manuell" — der Aufrufer zeigt den Link markiert. Nie ein Wurf.
 */
export async function kopiere(text: string): Promise<"kopiert" | "manuell"> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return "kopiert";
    }
  } catch { /* weiter mit dem Rückfall */ }
  const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const feld = document.createElement("textarea");
  feld.value = text;
  feld.setAttribute("readonly", "");
  feld.setAttribute("aria-hidden", "true");
  Object.assign(feld.style, { position: "fixed", top: "0", left: "0", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(feld);
  try {
    feld.select();
    return document.execCommand("copy") ? "kopiert" : "manuell";
  } catch {
    return "manuell";
  } finally {
    feld.remove();
    vorher?.focus();
  }
}
```

```ts
// src/app/m/kommplan/_lib/freigabe/texte.ts
import { zeitFormat } from "@/core/zeit";
import type { FreigabeZeile } from "./regeln";

// zeitFormat löst die Zone erst beim Formatieren auf — auf Modulebene erlaubt (CLAUDE.md, „Zeitzone").
export const ZEIT = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Texte eines Links — geteilt von Teilen-Flyin, (Task 10) Plan-Flyin und Druckdaten. Rein; der Status kommt vom Server. */
export function ablaufText(f: Pick<FreigabeZeile, "status" | "ablauf" | "widerrufenAm">): string {
  if (f.status === "widerrufen") return `widerrufen am ${ZEIT.format(f.widerrufenAm!)}`;
  if (f.status === "abgelaufen") return `abgelaufen am ${ZEIT.format(f.ablauf!)}`;
  return f.ablauf === null ? "unbegrenzt gültig" : `gültig bis ${ZEIT.format(f.ablauf)}`;
}
export function abrufText(f: Pick<FreigabeZeile, "abrufe" | "zuletztAbgerufen">): string {
  if (f.abrufe === 0 || f.zuletztAbgerufen === null) return "noch nie abgerufen";
  return `${f.abrufe} ${f.abrufe === 1 ? "Abruf" : "Abrufe"}, zuletzt ${ZEIT.format(f.zuletztAbgerufen)}`;
}
```

```tsx
// src/app/m/kommplan/_ui/teilen/Teilen.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Drawer, Input, Popconfirm, Radio, type InputRef } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { stelleFreigabeAusAction, widerrufeFreigabeAction } from "../../_actions/freigabe";
import type { FreigabeErgebnis } from "../../_lib/ergebnis";
import { DAUER_NAME, DAUER_VORGABE, FREIGABE_DAUERN, FREIGABE_GRENZE, tokenUrl, type FreigabeDauer, type FreigabeZeile } from "../../_lib/freigabe/regeln";
import { ablaufText, abrufText, ZEIT } from "../../_lib/freigabe/texte";
import { kopiere } from "./zwischenablage";

export const TEILEN_FLYIN_GRUND = 520;
const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";
const KEINE_ADRESSE = "Für die Kommunikationspläne ist keine Adresse eingerichtet. Links lassen sich erst ausstellen, wenn der Betrieb sie festlegt.";
const KOPIERT_MS = 2000;

interface Props { planId: string; basis: string | null; freigaben: FreigabeZeile[]; onFreigaben: (f: FreigabeZeile[]) => void }

/**
 * Das Flyin (Entscheidung 17): ohne Maske wie die übrigen Flyins; `nachSchliessen` gibt den Fokus an die Fläche zurück.
 * `autoFocus` nur ohne Adresse: sonst fokussiert sich die Notiz selbst, und rc-drawer fokussierte seinen Container
 * NACH ihr (wie StelleFlyin).
 */
export function TeilenFlyin({ offen, onSchliessen, nachSchliessen, ...p }: Props & { offen: boolean; onSchliessen: () => void; nachSchliessen: () => void }) {
  return (
    <Drawer open={offen} onClose={onSchliessen} mask={false} size={flyinBreite(TEILEN_FLYIN_GRUND)} destroyOnHidden rootClassName="kp-flyin"
      autoFocus={p.basis === null} title="Teilen" afterOpenChange={(auf) => { if (!auf) nachSchliessen(); }}>
      {offen ? <Teilen {...p} /> : null}
    </Drawer>
  );
}

/**
 * TOKEN-LINKS AUSSTELLEN, KOPIEREN, WIDERRUFEN (Spec §8.2; Umsetzungsplan Phase 5, Entscheidung 17). Die Liste kommt
 * vom Server mit fertigem Status und geht nach jeder Action ganz zurück an den Editor (`onFreigaben`) — hier rechnet
 * niemand mit der Uhr. Rückmeldung am Eintrag selbst („Kopiert", Lesefeld), dazu EIN `role="status"` für Screenreader.
 * Fokus: beim Öffnen die Notiz, nach dem Ausstellen „Link kopieren" am neuen Link, nach dem Widerrufen der nächste
 * gültige Link oder die Legende „Gültige Links (0)" — der Knopf, auf den Popconfirm zurückwollte, ist dann weg.
 */
export function Teilen({ planId, basis, freigaben, onFreigaben }: Props) {
  const [dauer, setDauer] = useState<FreigabeDauer>(DAUER_VORGABE);
  const [notiz, setNotiz] = useState("");
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [neu, setNeu] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState<string | null>(null);
  const [manuell, setManuell] = useState<{ id: string; url: string } | null>(null);
  const neuKnopf = useRef<HTMLButtonElement>(null);
  const manuellFeld = useRef<InputRef>(null);
  const gueltigeListe = useRef<HTMLFieldSetElement>(null);
  const nachWiderruf = useRef(false);
  useEffect(() => { if (neu) neuKnopf.current?.focus(); }, [neu]);
  // `focus({ cursor: "all" })` fokussiert UND markiert (antds InputRef) — `select()` allein bewegt den Fokus nicht verlässlich.
  useEffect(() => { if (manuell) manuellFeld.current?.focus({ cursor: "all" }); }, [manuell]);
  useEffect(() => {
    if (!nachWiderruf.current) return;
    nachWiderruf.current = false;
    const feld = gueltigeListe.current;
    (feld?.querySelector<HTMLElement>("[data-freigabe] button") ?? feld?.querySelector<HTMLElement>("legend"))?.focus();
  }, [freigaben]);

  async function lauf(schluessel: string, tu: () => Promise<FreigabeErgebnis>, erfolg: (r: Extract<FreigabeErgebnis, { ok: true }>) => void) {
    if (laeuft !== null) return;
    setLaeuft(schluessel); setMeldung(null); setManuell(null); setKopiert(null);
    const r = await tu().catch((): FreigabeErgebnis => ({ ok: false, fehler: NETZ, feldFehler: {} }));
    setLaeuft(null);
    if (!r.ok) { setMeldung(r.feldFehler.notiz ?? r.fehler); return; }
    erfolg(r);              // vor onFreigaben: die Fokusregel nach dem Widerrufen hängt an der neuen Liste
    onFreigaben(r.freigaben);
  }
  const ausstellen = () => lauf("neu", () => stelleFreigabeAusAction({ planId, dauer, notiz }), (r) => {
    setNotiz(""); setNeu(r.neu); setMeldung("Link ausgestellt.");
  });
  const widerrufe = (f: FreigabeZeile) => lauf(f.id, () => widerrufeFreigabeAction({ planId, freigabeId: f.id }), () => {
    nachWiderruf.current = true;
    setMeldung("Link widerrufen. Wer ihn hat, sieht den Plan nicht mehr.");
  });
  async function kopiereLink(f: FreigabeZeile) {
    if (!basis) return;
    const url = tokenUrl(basis, f.token);
    if ((await kopiere(url)) === "kopiert") {
      setManuell(null); setKopiert(f.id); setMeldung("Link kopiert.");
      setTimeout(() => setKopiert((k) => (k === f.id ? null : k)), KOPIERT_MS);
      return;
    }
    setKopiert(null);
    setManuell({ id: f.id, url });
    setMeldung("Kopieren ging hier nicht von selbst — der Link ist markiert. Kopiere ihn mit Strg+C bzw. ⌘C.");
  }

  const gueltig = freigaben.filter((f) => f.status === "gueltig");
  const vorbei = freigaben.filter((f) => f.status !== "gueltig");
  const eintrag = (f: FreigabeZeile) => (
    <li key={f.id} className="kp-freigabe" data-freigabe={f.id} data-neu={f.id === neu ? "" : undefined}>
      <p className="kp-freigabe-notiz">{f.notiz ?? "ohne Notiz"}</p>
      <p className="kp-hilfe">{`${ablaufText(f)} · ausgestellt ${ZEIT.format(f.erstelltAm)} von ${f.erstelltVon}`}</p>
      <p className="kp-hilfe">{abrufText(f)}</p>
      {basis ? <p className="kp-freigabe-link" data-link="">{tokenUrl(basis, f.token)}</p> : null}
      {f.status === "gueltig" ? (
        <div className="kp-formular-knoepfe">
          <Button ref={f.id === neu ? neuKnopf : undefined} onClick={() => void kopiereLink(f)} disabled={!basis}>
            {kopiert === f.id ? "Kopiert" : "Link kopieren"}
          </Button>
          <Popconfirm title="Link widerrufen?" description="Wer ihn hat, sieht den Plan danach nicht mehr." okText="Widerrufen" cancelText="Abbrechen"
            onConfirm={() => widerrufe(f)}>
            <Button loading={laeuft === f.id}>Widerrufen</Button>
          </Popconfirm>
        </div>
      ) : null}
      {manuell?.id === f.id ? <Input ref={manuellFeld} data-manuell="" readOnly value={manuell.url} aria-label="Link zum Kopieren" /> : null}
    </li>
  );

  return (
    <div className="kp-formular kp-teilen">
      <fieldset className="kp-abschnitt">
        <legend>Neuen Link ausstellen</legend>
        <p className="kp-hilfe">Wer den Link hat, sieht den aktuellen Stand dieses Plans ohne Anmeldung und kann ihn drucken — nicht bearbeiten.</p>
        <span className="kp-feldname" id="kp-teilen-dauer">Gültig für</span>
        <Radio.Group aria-labelledby="kp-teilen-dauer" optionType="button" value={dauer} onChange={(e) => setDauer(e.target.value as FreigabeDauer)}
          options={FREIGABE_DAUERN.map((d) => ({ value: d, label: DAUER_NAME[d] }))} />
        <label className="kp-feldname" htmlFor="kp-teilen-notiz">Notiz (wofür, für wen)</label>
        <Input id="kp-teilen-notiz" autoFocus={basis !== null} value={notiz} maxLength={FREIGABE_GRENZE.notiz} showCount onChange={(e) => setNotiz(e.target.value)}
          onPressEnter={() => { if (basis) void ausstellen(); }} />
        {basis ? null : <p className="kp-hilfe" data-keine-adresse="">{KEINE_ADRESSE}</p>}
        <Button type="primary" onClick={() => void ausstellen()} loading={laeuft === "neu"} disabled={!basis}>Link ausstellen</Button>
      </fieldset>
      <p className="kp-teilen-meldung" role="status">{meldung ?? ""}</p>
      <fieldset className="kp-abschnitt" ref={gueltigeListe} data-gueltige="">
        <legend tabIndex={-1}>{`Gültige Links (${gueltig.length})`}</legend>
        {gueltig.length === 0 ? <p className="kp-hilfe">Noch kein gültiger Link.</p> : <ul className="kp-freigaben">{gueltig.map(eintrag)}</ul>}
      </fieldset>
      {vorbei.length > 0 ? (
        <details className="kp-abschnitt">
          <summary>{`Abgelaufen und widerrufen (${vorbei.length})`}</summary>
          <ul className="kp-freigaben">{vorbei.map(eintrag)}</ul>
        </details>
      ) : null}
    </div>
  );
}
```

Hinweis zur Fokusregel: die Effekte fokussieren nur (erlaubt) bzw. setzen eine Ref zurück; `setState` passiert in Ereignis-Rückrufen und im `setTimeout` des Kopierens (kein Effekt). `Input` mit `ref` und `.focus({ cursor: "all" })` ist antds `InputRef`. Das Widerrufen samt Fokus prüft der DOM-Test über den echten `Popconfirm` (Bestätigen-Knopf außerhalb der Einträge) und zusätzlich der e2e (Task 15). Läuft der DOM-Fall wegen der Popconfirm-Animation in jsdom nicht stabil, trägt der e2e allein — dann in „Abweichungen" vermerken.

`kommplan.css` (vor den Media-Blöcken):

```css
/* Teilen-Flyin (Phase 5, Entscheidung 17) */
.kp-freigaben { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.kp-freigabe { border: 1px solid var(--kp-rand); border-radius: 6px; padding: 8px 12px; display: grid; gap: 4px; }
.kp-freigabe[data-neu] { border-color: var(--kp-auswahl); box-shadow: 0 0 0 1px var(--kp-auswahl); } /* Bildschirmfarbe, nicht die Papierfarbe (Kritik: #1f5fbf hätte dunkel ≈ 2,5:1) */
.kp-freigabe-notiz { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.kp-freigabe-link { margin: 0; font-size: 12px; color: var(--kp-gedaempft); overflow-wrap: anywhere; font-family: ui-monospace, monospace; }
.kp-teilen-meldung { margin: 0; min-height: 1.5em; }
.kp-teilen details > summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; }
```

(`--kp-rand`, `--kp-gedaempft`, `--kp-auswahl` und die Klasse `.kp-feldname` gibt es in `kommplan.css` schon, für hell und dunkel.)

Im Block `@media (max-width: 767.98px)` die vorhandene Zeile `.kp-kopfwerkzeuge { display: grid; grid-template-columns: minmax(0, 1fr); flex: 1 1 100%; }` **in derselben Zeile** ersetzen und direkt danach eine Zeile ergänzen (Kritik: sonst wächst die Kopfleiste am Telefon um eine volle Zeile auf fünf):

```css
  .kp-kopfwerkzeuge { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); flex: 1 1 100%; }
  .kp-kopfwerkzeuge > .kp-ganze-zeile { grid-column: 1 / -1; } /* Umschalter, „Wiederholen", „Plan und Verbindungen"; „Teilen" und „Drucken" teilen sich die letzte Zeile */
```

Ergibt am Telefon vier Zeilen wie vor Phase 5 (Umschalter · Wiederholen · Plan und Verbindungen · Teilen | Drucken) in **DOM-Reihenfolge** — kein `grid-auto-flow: dense`, sonst liefe der Tab-Fokus „Wiederholen → Plan → Teilen" eine Zeile hinab und wieder hinauf (WCAG 2.4.3). `kp-nur-breit` ist dort `display: none` und belegt keine Zelle. Der geteilte Knopf „Drucken" | Pfeil braucht ≈ 130 px und passt in die halbe Zeile (≈ 175 px bei 390 px Breite). Gemessen wird gegen `KOPFLEISTE_TELEFON_VORHER` (Task 5) im Fototest (Task 16).

`Kopfleiste.tsx`: Prop `onTeilen: () => void`, Knopf direkt vor dem Druckmenü:

```tsx
            <Button onClick={onTeilen}>Teilen</Button>
```

dazu die Klasse `kp-ganze-zeile` am Umschalter — in `umschalter` selbst, nicht über den Parameter `klasse` (der bildet auch den `name` des `Segmented`): `className={klasse ? `${klasse} kp-ganze-zeile` : "kp-ganze-zeile"}` —, an „Wiederholen" und an „Plan und Verbindungen" (`className="kp-ganze-zeile"`; „Rückgängig" ist am Telefon ausgeblendet und braucht sie nicht). Prüfen, dass `Kopfleiste.test.ts` keine Klasse exakt vergleicht.

`Editor.tsx`:
- Import `import { TEILEN_FLYIN_GRUND, TeilenFlyin } from "../teilen/Teilen";` und `import type { FreigabeZeile } from "../../_lib/freigabe/regeln";`
- Prop in der Signatur: `teilen = KEIN_TEILEN` mit `const KEIN_TEILEN: { freigaben: FreigabeZeile[]; basis: string | null } = { freigaben: [], basis: null };` auf Modulebene und im Prop-Typ `teilen?: { freigaben: FreigabeZeile[]; basis: string | null };` (Kommentar: „Nur für Bearbeitende und nicht archivierte Pläne — die Seite lädt sie, Phase 5, Entscheidung 17.")
- Zustand: `const [flyin, setFlyin] = useState<"stelle" | "plan" | "teilen" | null>(null);` und `const [freigaben, setFreigaben] = useState<FreigabeZeile[]>(teilen.freigaben);`
- `flyinGrund`: `… : flyin === "plan" ? PLAN_FLYIN_GRUND : flyin === "teilen" ? TEILEN_FLYIN_GRUND : null;`
- Kopfleiste: `onTeilen={() => setFlyin("teilen")}`
- nach dem `PlanFlyin`:

```tsx
        <TeilenFlyin offen={flyin === "teilen"} onSchliessen={schliesseFlyin} nachSchliessen={nachSchliessen}
          planId={plan.id} basis={teilen.basis} freigaben={freigaben} onFreigaben={setFreigaben} />
```

`(intern)/p/[id]/page.tsx` im Editor-Zweig: Importe `import { moduleUrl } from "@/core/shell/moduleUrl";` und `import { freigabenFuer } from "@/app/m/kommplan/_lib/freigaben";`, am `<Editor …>` ergänzen:

```tsx
          teilen={{ freigaben: freigabenFuer(getDb(), plan.id, new Date().getTime()), basis: moduleUrl("kommplan") }}
```

(`new Date().getTime()` statt `Date.now()`: `react-hooks/purity`, Phase-4-U6.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan`
Expected: PASS (auch `grenze.test.ts`: `Teilen.tsx` ist eine Client-Insel und erreicht `zeichen.ts` nicht; die Action-Datei ist Grenze).

- [ ] **Step 5: Build, Ankerschritt, Commit**

```bash
pnpm typecheck; echo "exit $?"
pnpm lint; echo "lint exit $?"
pnpm build; echo "build exit $?"
git grep -n "Editor.tsx:[0-9]\|Kopfleiste.tsx:[0-9]\|kommplan.css:[0-9]\|p/\[id\]/page.tsx:[0-9]" -- src scripts e2e docs
pnpm anker:drift src/app/m/kommplan/_ui/editor/Editor.tsx
git add src/app/m/kommplan
git commit -S -m "feat(kommplan): Teilen im Editor — Links ausstellen, kopieren, widerrufen

Ablauf 24 h, 7 Tage, 30 Tage oder unbegrenzt mit Notiz; Abrufe und
Ablauf je Link; Kopieren auch über http (Rückfall, sonst markiert).

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: QR „Aktuelle Fassung" auf dem Ausdruck

**Files:**
- Create: `src/app/m/kommplan/_lib/qrGrafik.ts`, `src/app/m/kommplan/_lib/qrGrafik.test.ts`
- Modify: `src/app/m/kommplan/_lib/layout/masse.ts` (Dateiende: `QR_BOX`), `src/app/m/kommplan/_lib/layout/papier.ts`
- Modify: `src/app/m/kommplan/_lib/layout/papier.test.ts`, `src/app/m/kommplan/_lib/layout/eigenschaften.test.ts`
- Modify: `src/app/m/kommplan/_ui/zeichnung/Blatt.tsx` (`Rahmen.qr`, `QrAufBlatt`), `src/app/m/kommplan/_ui/zeichnung/Blatt.test.tsx`
- Modify: `src/app/m/kommplan/_lib/druckdaten.ts` (`qrUrl`, `qrSatz`, `qrZielIntern`, `qrUrlFuerToken`), `src/app/m/kommplan/_lib/druckdaten.test.ts`
- Modify: `src/app/m/kommplan/_ui/druck/Druckseite.tsx` (`qrSatz` in der `noprint`-Leiste), `src/app/m/kommplan/_ui/druck/Druckseite.test.tsx`
- Modify: `src/app/m/kommplan/_lib/freigabe/texte.ts` (`qrZielSatz`), `src/app/m/kommplan/_lib/freigabe/regeln.test.ts` (Fall dazu)
- Modify: `src/app/m/kommplan/_ui/teilen/Teilen.tsx` (QR-Schalter samt Satz), `src/app/m/kommplan/_ui/teilen/Teilen.test.tsx`
- Modify: die vier Druckseiten (`(intern)/p/[id]/druck/a4|a3/page.tsx`, `t/[token]/druck/a4|a3/page.tsx`)
- Modify: `src/app/m/kommplan/_lib/plan/operationen.ts` (`setzeOptionen` nimmt alle vier Optionen), `src/app/m/kommplan/_lib/plan/operationen.test.ts`
- Modify: `src/app/m/kommplan/_ui/editor/PlanFlyin.tsx` (Schalter, Hinweise), `src/app/m/kommplan/_ui/editor/PlanFlyin.test.tsx`, `src/app/m/kommplan/_ui/editor/Editor.tsx` (Hinweisdaten durchreichen)
- Modify: `src/app/m/kommplan/grenze.test.ts` (`"_lib/qrGrafik.ts"` in die Liste der geteilten Ordner)

**Interfaces:**
- Consumes: Task 1 (`tokenUrl`, `besteFreigabe`, `waehleQrFreigabe`), Task 2 (`freigabenFuer`), Task 4 (`druckseitenDaten`), Task 9 (Editor-Zustand `freigaben`, `teilen.basis`, `_lib/freigabe/texte.ts`); `qrSvg` aus `core/qr`; `moduleUrl`.
- Produces:
  - `QR_BOX = { kante: 24, beschriftung: 4, luft: 3 }`
  - `interface PapierOptionen { qr?: boolean }`, `qrBox(format): { x: number; y: number; kante: number; oben: number }`, `legendenBreite(format, qr?: boolean): number`, `zeichenflaeche(format, legendeZeilen, qr?: boolean)`, `teileAuf(inhalt, format, optionen?: PapierOptionen)`
  - `interface QrGrafik { module: number; pfad: string; ziel: string }`, `qrGrafikAus(svg: string, ziel: string): QrGrafik`
  - `Rahmen.qr?: QrGrafik | null`
  - `DruckAuftrag = { format: Papierformat; qrUrl: string | null; qrSatz?: string | null }`, `DruckseiteDaten.qrSatz: string | null`
  - `QrZiel = { url: string; notiz: string | null; ablauf: number | null }`, `qrZielIntern(db, plan: LesbarerPlan, jetzt: number, basis?: string | null): QrZiel | null`, `qrUrlFuerToken(plan: LesbarerPlan, token: string, basis?: string | null): string | null`
  - `qrZielSatz(f: { notiz: string | null; ablauf: number | null }): string` in `_lib/freigabe/texte.ts`
  - `PlanFormularProps.qrLink?: { notiz: string | null; ablauf: number | null } | null` (Vorgabe `null`), `PlanFormularProps.linkAdresse?: boolean` (Vorgabe `true`), `PlanFormularProps.onTeilen?: () => void`
  - `Teilen`/`TeilenFlyin`-Prop `qr?: { an: boolean; onAendern: (an: boolean) => void }`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/m/kommplan/_lib/qrGrafik.test.ts
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { qrSvg } from "@/core/qr";
import { QR_BOX } from "./layout/masse";
import { qrGrafikAus } from "./qrGrafik";

// Ein ECHTER Token (Kritik): "A".repeat(43) kodiert qrcode alphanumerisch und kommt mit Version 7 aus; base64url mit
// Groß- und Kleinbuchstaben ist ein Byte-Segment und braucht bei Fehlerkorrektur H Version 8.
const URL_ = `https://kommplan.iuk-ue.de/t/${randomBytes(32).toString("base64url")}`;

describe("QR-Grafik aus core/qr (Entscheidung 11)", () => {
  it("liest Modulzahl samt Rand und den Pfad der dunklen Module — 72 Zeichen ergeben 57 × 57", async () => {
    const g = qrGrafikAus(await qrSvg(URL_), URL_);
    expect(URL_).toHaveLength(72);
    expect(g.module).toBe(57); // Version 8: 49 Module + 2 × 4 Rand
    expect(g.pfad).toMatch(/^M\d/);
    expect(g.ziel).toBe(URL_);
    expect(QR_BOX.kante / g.module).toBeGreaterThanOrEqual(0.4); // mm je Modul (24 mm → 0,42)
  });
  it("unerwartete Form wirft — lieber kein Druck als ein falscher Code", () => {
    expect(() => qrGrafikAus("<svg/>", URL_)).toThrow();
  });
});
```

`papier.test.ts` (vorhandene Importzeile um `legendenBreite, qrBox` erweitern; `QR_BOX` aus `./masse` dazu):

```ts
describe("Platz für den QR (Phase 5, Entscheidung 11)", () => {
  const gross = BEISPIELE.find((b) => b.id === "beispiel-grosse-stabslage")!.inhalt;
  it("ohne QR alles wie bisher — bytegleich", () => {
    expect(teileAuf(gross, "a4-quer", { qr: false })).toEqual(teileAuf(gross, "a4-quer"));
    expect(zeichenflaeche("a4-quer", 2, false)).toEqual(zeichenflaeche("a4-quer", 2));
  });
  it("QR-Box unten rechts über dem Fuß; die Zeichenfläche endet über ihrer Beschriftung, die Legende ist schmaler", () => {
    for (const format of ["a4-quer", "a3-quer"] as const) {
      const b = qrBox(format);
      const p = PAPIER[format];
      expect(b.x + b.kante).toBeCloseTo(p.breite - BLATT.randX, 9);
      expect(b.y + b.kante).toBeCloseTo(p.hoehe - BLATT.randUnten - BLATT.fuss, 9);
      expect(b.oben).toBeCloseTo(b.y - QR_BOX.beschriftung, 9);
      const f = zeichenflaeche(format, 1, true);
      expect(f.y + f.hoehe).toBeLessThanOrEqual(b.oben - BLATT.luft + 1e-9);
      expect(legendenBreite(format, true)).toBeCloseTo(legendenBreite(format) - QR_BOX.kante - QR_BOX.luft, 9);
    }
  });
  it("mit QR: keine Zeichnung reicht in die QR-Box, keine Legendenzeile ist breiter als erlaubt", () => {
    for (const format of ["a4-quer", "a3-quer"] as const) {
      for (const b of teileAuf(gross, format, { qr: true })) {
        expect(b.ursprung.y + b.zeichnung.hoehe * b.massstab).toBeLessThanOrEqual(qrBox(format).oben - BLATT.luft + 1e-6);
        for (const zeile of b.legendeZeilen) {
          const breite = zeile.reduce((s, e) => s + LEGENDE.symbolBreite + LEGENDE.symbolLuft + textBreite(e.text, LEGENDE.schrift, false) + LEGENDE.eintragLuft, 0) - LEGENDE.eintragLuft;
          expect(breite).toBeLessThanOrEqual(legendenBreite(format, true) + 1e-6);
        }
      }
    }
  });
});
```

(Importe ergänzen, soweit nicht vorhanden: `BEISPIELE` aus `../beispiele`, `PAPIER`, `BLATT`, `QR_BOX` aus `./masse`, `LEGENDE` aus `./papier`, `textBreite` aus `./text`.)

`eigenschaften.test.ts`, im Block „Aufteilung deckt jede Stelle genau einmal ab …" (Task 4: `describe.each` über Formate) einen zweiten Lauf je Seed mit QR, im selben `it.each`:

```ts
    for (const b of teileAuf(inhalt, format, { qr: true })) {
      expect(b.ursprung.y + b.zeichnung.hoehe * b.massstab, erklaere(seed, inhalt, `QR: Blatt ${b.nummer} reicht in die QR-Box`))
        .toBeLessThanOrEqual(qrBox(format).oben - BLATT.luft + 1e-6);
    }
```

(Import `qrBox` in die vorhandene Zeile `import { offeneSchnitte, teileAuf } from "./papier";`, `BLATT` aus `./masse`, falls nicht schon da.)

`Blatt.test.tsx`:

```ts
  it("mit QR: Gruppe unten rechts mit Ziel, Beschriftung „Aktuelle Fassung“ und einem Pfad; ohne QR nichts davon", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer", { qr: true });
    const qr = { module: 57, pfad: "M4 4.5h7", ziel: "https://kommplan.iuk-ue.de/t/abc" };
    const html = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={{ ...rahmen, qr }} symbole={{}} />);
    expect(html).toContain('data-qr-ziel="https://kommplan.iuk-ue.de/t/abc"');
    expect(html).toContain("Aktuelle Fassung");
    expect(html).toMatch(/<svg x="263" y="171" width="24" height="24" viewBox="0 0 57 57"/);
    expect(html).toContain('d="M4 4.5h7"');
    expect(renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={rahmen} symbole={{}} />)).not.toContain("data-qr");
  });
```

(A4: x = 297 − 10 − 24 = 263, y = 210 − 8 − 7 − 24 = 171.)

`druckdaten.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { plan as planTabelle } from "../_db/schema";
import { stelleFreigabeAus } from "./freigaben";
import { druckseitenDaten, qrUrlFuerToken, qrZielIntern } from "./druckdaten";
import { setzeOptionen } from "./plan/operationen";
import { archiviere } from "./planverwaltung";

const BASIS = "https://kommplan.iuk-ue.de";
const JETZT = Date.UTC(2026, 9, 1, 18, 0);
const WER = { nutzer: "u1", name: "Jana" };
function mitQrOption(db: ReturnType<typeof testDb>, id: string) {
  const p = ladePlanLesend(db, id)!;
  db.update(planTabelle).set({ inhalt: JSON.stringify(setzeOptionen(p.inhalt!, { qrAufDruck: true })) }).where(eq(planTabelle.id, id)).run();
  return ladePlanLesend(db, id)!;
}
const aus = (db: ReturnType<typeof testDb>, planId: string, dauer: string) => {
  const r = stelleFreigabeAus(db, { planId, dauer, notiz: "" }, WER, JETZT);
  if (!r.ok) throw new Error(r.fehler);
  return r.freigaben.find((f) => f.id === r.neu)!;
};

describe("QR-Ziel (Entscheidungen 9, 10)", () => {
  it("intern: nur mit Option, Adresse und gültigem Link — dann der beste, mit Notiz und Ablauf für den Satz", async () => {
    const db = await mitSeed();
    const ohne = ladePlanLesend(db, "beispiel-openr-2022-07-01")!;
    aus(db, ohne.id, "24h");
    expect(qrZielIntern(db, ohne, JETZT, BASIS)).toBeNull(); // Option aus
    const p = mitQrOption(db, ohne.id);
    const unbegrenzt = aus(db, p.id, "unbegrenzt");
    expect(qrZielIntern(db, p, JETZT, BASIS)).toEqual({ url: `${BASIS}/t/${unbegrenzt.token}`, notiz: null, ablauf: null });
    expect(qrZielIntern(db, p, JETZT, null)).toBeNull(); // keine Adresse eingerichtet
  });
  it("Token-Druck: IMMER der benutzte Token, nie der beste Link des Plans (Review Focus 1)", async () => {
    const db = await mitSeed();
    const p = mitQrOption(db, "beispiel-openr-2022-07-01");
    const kurz = aus(db, p.id, "24h");
    aus(db, p.id, "unbegrenzt");
    expect(qrUrlFuerToken(p, kurz.token, BASIS)).toBe(`${BASIS}/t/${kurz.token}`);
  });
  it("archiviert: kein QR; Druckdaten tragen den QR nur, wenn ein Ziel da ist", async () => {
    const db = await mitSeed();
    const p = mitQrOption(db, "beispiel-einsatz-2026-02-22");
    aus(db, p.id, "unbegrenzt");
    const ziel = qrZielIntern(db, p, JETZT, BASIS)!;
    const mit = await druckseitenDaten(db, p, { format: "a4-quer", qrUrl: ziel.url, qrSatz: "Der QR-Code führt auf …" });
    expect(mit.rahmen.qr).toMatchObject({ ziel: ziel.url, module: expect.any(Number) });
    expect(mit.qrSatz).toBe("Der QR-Code führt auf …");
    const ohne = await druckseitenDaten(db, p, { format: "a4-quer", qrUrl: null });
    expect(ohne.rahmen.qr).toBeNull();
    expect(ohne.qrSatz).toBeNull();
    archiviere(db, p.id, JETZT);
    expect(qrZielIntern(db, ladePlanLesend(db, p.id)!, JETZT, BASIS)).toBeNull();
  });
});
```

und im vorhandenen Fall „A3 teilt …" die beiden Aufrufe auf `{ format: …, qrUrl: null }` umstellen.

`operationen.test.ts` (vorhandenen Fall zu `setzeOptionen` ergänzen):

```ts
    expect(setzeOptionen(leererPlan(), { qrAufDruck: true, schwarzweiss: true }).optionen).toEqual({ leerzeilen: false, vermerkVsNfD: true, qrAufDruck: true, schwarzweiss: true });
```

`PlanFlyin.test.tsx` — `Rahmen` bekommt optionale Props (`function Rahmen({ qrLink = null, linkAdresse = true, onTeilen }: { qrLink?: { notiz: string | null; ablauf: number | null } | null; linkAdresse?: boolean; onTeilen?: () => void })` und reicht sie an `PlanFormular` durch), dann:

```ts
  it("QR-Schalter: ohne gültigen Link Hinweis mit Knopf zu „Teilen“; mit Link der Satz, wohin er führt; ohne Adresse eigener Hinweis", async () => {
    const teilen = vi.fn();
    await mount(<Rahmen onTeilen={teilen} />);
    expect(exists("[data-qr-hinweis]")).toBe(false);
    await clickElement(query('[data-option="qrAufDruck"]'));
    expect(stand.optionen.qrAufDruck).toBe(true);
    expect(query("[data-qr-hinweis]").textContent).toContain("Ohne gültigen Link druckt der Plan keinen QR-Code.");
    await clickElement(query("[data-qr-hinweis] button"));
    expect(teilen).toHaveBeenCalled(); // „Link ausstellen“ schaltet auf das Flyin „Teilen“
    await unmount();
    await mount(<Rahmen qrLink={{ notiz: "Aushang", ablauf: Date.UTC(2026, 9, 2, 18, 0) }} />);
    await clickElement(query('[data-option="qrAufDruck"]'));
    expect(exists("[data-qr-hinweis]")).toBe(false);
    expect(query("[data-qr-ziel-satz]").textContent).toBe("Der QR-Code führt auf „Aushang“ – gültig bis 02.10.2026, 20:00; danach führt der Ausdruck ins Leere.");
    await unmount();
    await mount(<Rahmen qrLink={{ notiz: null, ablauf: null }} linkAdresse={false} />);
    await clickElement(query('[data-option="qrAufDruck"]'));
    expect(query("[data-qr-hinweis]").textContent).toContain("keine Adresse eingerichtet");
  });
```

`regeln.test.ts` bekommt einen Fall für `qrZielSatz` (die Uhrzeit gilt für `Europe/Berlin`, die Suite-Zone in Tests):

```ts
// am Ende von src/app/m/kommplan/_lib/freigabe/regeln.test.ts (Import aus "./texte" als eigene Zeile)
describe("qrZielSatz (Entscheidung 10)", () => {
  it("sagt Notiz und Ablauf; unbegrenzt ohne Warnung, befristet mit", () => {
    expect(qrZielSatz({ notiz: "Aushang", ablauf: null })).toBe("Der QR-Code führt auf „Aushang“ – unbegrenzt gültig.");
    expect(qrZielSatz({ notiz: null, ablauf: null })).toBe("Der QR-Code führt auf den Link ohne Notiz – unbegrenzt gültig.");
    expect(qrZielSatz({ notiz: "Leitstelle", ablauf: Date.UTC(2026, 9, 2, 18, 0) })).toBe("Der QR-Code führt auf „Leitstelle“ – gültig bis 02.10.2026, 20:00; danach führt der Ausdruck ins Leere.");
  });
});
```

`Teilen.test.tsx`:

```ts
  it("QR-Schalter im Teilen-Flyin: dieselbe Option; an mit Link → der Satz zum besten Link", async () => {
    const aendern = vi.fn();
    await mount(<Teilen planId="p1" basis={BASIS} onFreigaben={neue} qr={{ an: true, onAendern: aendern }}
      freigaben={[Z({ notiz: "kurz" }), Z({ id: "f2", token: T("B"), notiz: "Aushang", ablauf: null })]} />);
    expect(query("[data-qr-ziel-satz]").textContent).toBe("Der QR-Code führt auf „Aushang“ – unbegrenzt gültig.");
    await clickElement(query('[data-option="qrAufDruck"]'));
    expect(aendern).toHaveBeenCalledWith(false);
  });
```

`Druckseite.test.tsx`: die vorhandenen `daten`-Literale bekommen `qrSatz: null`, dazu `expect(renderToStaticMarkup(<Druckseite … daten={{ …, qrSatz: "Der QR-Code führt auf „Aushang“ – unbegrenzt gültig." }} />)).toMatch(/class="noprint[^"]*"[^>]*data-qr-satz=""[^>]*>Der QR-Code führt auf/)`.

(`exists` in den vorhandenen Import aus `test-dom` aufnehmen.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/_lib/qrGrafik.test.ts src/app/m/kommplan/_lib/layout/papier.test.ts src/app/m/kommplan/_ui/zeichnung/Blatt.test.tsx src/app/m/kommplan/_lib/druckdaten.test.ts src/app/m/kommplan/_ui/editor/PlanFlyin.test.tsx src/app/m/kommplan/_lib/plan/operationen.test.ts src/app/m/kommplan/_lib/freigabe src/app/m/kommplan/_ui/teilen src/app/m/kommplan/_ui/druck`
Expected: FAIL — `./qrGrafik` nicht auflösbar, `qrBox`/`legendenBreite`/`qrZielSatz`/`qrZielIntern` nicht exportiert, `qrAufDruck` in `setzeOptionen` ein Typfehler, kein Schalter `qrAufDruck`, kein `qrSatz`.

- [ ] **Step 3: Write minimal implementation**

`_lib/layout/masse.ts`, **am Dateiende**:

```ts

/**
 * QR „Aktuelle Fassung" unten rechts über dem Fuß (Umsetzungsplan Phase 5, Entscheidung 11). Gemessen mit `core/qr`
 * (Fehlerkorrektur H, Rand 4) an echten base64url-Tokens: eine 72-Zeichen-URL ergibt Version 8 = 57 × 57 Module,
 * bei 24 mm also 0,42 mm je Modul (20 mm hätten nur 0,35 mm).
 */
export const QR_BOX = { kante: 24, beschriftung: 4, luft: 3 } as const;
```

`_lib/layout/papier.ts` — Import `QR_BOX` in die vorhandene `./masse`-Zeile, dann:

```ts
/** Optionen der Aufteilung. `qr`: es wird tatsächlich ein QR gedruckt — nur dann ist sein Platz reserviert. */
export interface PapierOptionen { qr?: boolean }

/** Die QR-Box unten rechts, direkt über der Fußzeile; `oben` schließt die Beschriftung ein. */
export function qrBox(format: Papierformat): { x: number; y: number; kante: number; oben: number } {
  const p = PAPIER[format];
  const x = p.breite - BLATT.randX - QR_BOX.kante;
  const y = p.hoehe - BLATT.randUnten - BLATT.fuss - QR_BOX.kante;
  return { x, y, kante: QR_BOX.kante, oben: y - QR_BOX.beschriftung };
}

/** Breite einer Legendenzeile; mit QR steht die Legende links neben der Box. */
export function legendenBreite(format: Papierformat, qr = false): number {
  return PAPIER[format].breite - 2 * BLATT.randX - (qr ? QR_BOX.kante + QR_BOX.luft : 0);
}
```

`zeichenflaeche` ersetzen:

```ts
/** Wo die Zeichnung stehen darf: unter der Kopflinie, über der Legende (und mit QR über dessen Beschriftung), je `BLATT.luft` Abstand. */
export function zeichenflaeche(format: Papierformat, legendeZeilen: number, qr = false) {
  const p = PAPIER[format];
  const y = kopflinieY() + BLATT.luft;
  const ohneQr = legendeZeilen === 0 ? p.hoehe - BLATT.randUnten - BLATT.fuss : legendeObenY(format, legendeZeilen) - BLATT.luft;
  const unten = qr ? Math.min(ohneQr, qrBox(format).oben - BLATT.luft) : ohneQr;
  return { x: BLATT.randX, y, breite: p.breite - 2 * BLATT.randX, hoehe: unten - y };
}
```

`blattAus`, `passt`, `schneide`, `teileAuf` reichen `qr` durch:

```ts
function blattAus(nummer: number, format: Papierformat, z: Zeichnungsdaten, auftrag: Auftrag | undefined, qr: boolean): Blatt {
  const zeilen = legendenZeilen(z.legende, legendenBreite(format, qr));
  const f = zeichenflaeche(format, zeilen.length, qr);
  …
}
function passt(inhalt: PlanInhalt, format: Papierformat, auftrag: Auftrag | undefined, schnitte: ReadonlySet<string>, qr: boolean): boolean {
  const darstellung = new Map<string, Darstellung>([...schnitte].map((id) => [id, PLATZHALTER]));
  return !blattAus(0, format, zeichne(inhalt, format, { blatt: auftrag, darstellung }), auftrag, qr).unterMindestschrift;
}
function schneide(inhalt: PlanInhalt, format: Papierformat, baum: Baum, auftrag: Auftrag | undefined, qr: boolean): Schnittplan {
  if (passt(inhalt, format, auftrag, new Set(), qr)) return { auftrag, schnitte: [], unter: [] };
  …   // im Rumpf: passt(inhalt, format, auftrag, s, qr); im Rückgabewert: schneide(inhalt, format, baum, { … }, qr)
}
export function teileAuf(inhalt: PlanInhalt, format: Papierformat, optionen: PapierOptionen = {}): Blatt[] {
  const qr = optionen.qr ?? false;
  …   // sammle(schneide(inhalt, format, baum, undefined, qr)); blattAus(i + 1, format, zeichne(…), p.auftrag, qr)
}
```

(`legendenZeilen(…, PAPIER[format].breite - 2 * BLATT.randX)` war vorher der Ausdruck in `blattAus` — `legendenBreite(format, false)` ist derselbe Wert.)

```ts
// src/app/m/kommplan/_lib/qrGrafik.ts
/** Der QR als Pfad für das Blatt (Entscheidung 11): kein `dangerouslySetInnerHTML`, nur Modulzahl und Pfad. */
export interface QrGrafik { module: number; pfad: string; ziel: string }

/**
 * Aus dem SVG von `core/qr` (Bibliothek `qrcode`): `viewBox="0 0 N N"` und der Pfad der dunklen Module
 * (`stroke="#000000"`, `QR_OPTIONS.color.dark`). Wirft bei anderer Form — lieber kein Druck als ein falscher Code.
 */
export function qrGrafikAus(svg: string, ziel: string): QrGrafik {
  const vb = /viewBox="0 0 (\d+) \1"/.exec(svg);
  const pfad = /<path stroke="#000000" d="([^"]+)"/.exec(svg);
  if (!vb || !pfad) throw new Error("QR-SVG in unerwarteter Form");
  return { module: Number(vb[1]), pfad: pfad[1], ziel };
}
```

`_ui/zeichnung/Blatt.tsx`: `import type { QrGrafik } from "../../_lib/qrGrafik";`, `qrBox` in die vorhandene `../../_lib/layout/papier`-Zeile; im `Rahmen`-Interface `qr?: QrGrafik | null;`; neue Komponente

```tsx
/** QR „Aktuelle Fassung" unten rechts (Entscheidung 11). `data-qr-ziel` trägt die URL — dieselbe, die der Code trägt. */
function QrAufBlatt({ qr, format }: { qr: QrGrafik; format: Papierformat }) {
  const b = qrBox(format);
  return (
    <g data-qr="" data-qr-ziel={qr.ziel}>
      <text x={b.x + b.kante / 2} y={b.y - 1} fontSize={pt(7)} textAnchor="middle">Aktuelle Fassung</text>
      <svg x={b.x} y={b.y} width={b.kante} height={b.kante} viewBox={`0 0 ${qr.module} ${qr.module}`} shapeRendering="crispEdges">
        <rect width={qr.module} height={qr.module} fill="#ffffff" />
        <path d={qr.pfad} stroke="#000000" />
      </svg>
    </g>
  );
}
```

in `Blattansicht` `zeichenflaeche(format, blatt.legendeZeilen.length, Boolean(rahmen.qr))` und vor dem Fuß `{rahmen.qr ? <QrAufBlatt qr={rahmen.qr} format={format} /> : null}`.

`_lib/druckdaten.ts`:

```ts
import { qrSvg } from "@/core/qr";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { tokenUrl, waehleQrFreigabe } from "./freigabe/regeln";
import { freigabenFuer } from "./freigaben";
import { qrGrafikAus } from "./qrGrafik";
…
export interface DruckAuftrag { format: Papierformat; qrUrl: string | null; qrSatz?: string | null }
export interface QrZiel { url: string; notiz: string | null; ablauf: number | null }

/**
 * QR des INTERNEN Drucks (Entscheidung 10): Option an, nicht archiviert, Adresse eingerichtet, gültiger Link — der
 * beste. Notiz und Ablauf gehen in den Satz der `noprint`-Leiste („Der QR-Code führt auf …").
 */
export function qrZielIntern(db: KommplanDb, plan: LesbarerPlan, jetzt: number, basis: string | null = moduleUrl("kommplan")): QrZiel | null {
  if (!plan.inhalt?.optionen.qrAufDruck || plan.archiviertAm !== null || !basis) return null;
  const f = waehleQrFreigabe(freigabenFuer(db, plan.id, jetzt), jetzt);
  return f ? { url: tokenUrl(basis, f.token), notiz: f.notiz, ablauf: f.ablauf } : null;
}

/** QR des TOKEN-Drucks (Entscheidung 9): der benutzte Token, nie ein anderer Link des Plans (Review Focus 1). */
export function qrUrlFuerToken(plan: LesbarerPlan, token: string, basis: string | null = moduleUrl("kommplan")): string | null {
  return plan.inhalt?.optionen.qrAufDruck && basis ? tokenUrl(basis, token) : null;
}
```

und in `druckseitenDaten`:

```ts
  const qr = inhalt && auftrag.qrUrl ? qrGrafikAus(await qrSvg(auftrag.qrUrl), auftrag.qrUrl) : null;
  return {
    format: auftrag.format,
    blaetter: inhalt ? teileAuf(inhalt, auftrag.format, { qr: qr !== null }) : null,
    rahmen: { ...rahmen, qr },
    symbole: inhalt ? symboleFuer(inhalt) : {},
    qrSatz: qr ? auftrag.qrSatz ?? null : null,
  };
```

(`qrTokenFuer` aus Task 2 bleibt für `freigaben.test.ts`; `qrZielIntern` braucht die ganze Zeile.)

`_lib/freigabe/texte.ts` ergänzen:

```ts
/** Wohin der QR des Ausdrucks führt (Entscheidung 10) — Plan-Flyin, Teilen-Flyin und Druckseite sagen es gleich. */
export function qrZielSatz(f: { notiz: string | null; ablauf: number | null }): string {
  const name = f.notiz ? `„${f.notiz}“` : "den Link ohne Notiz";
  return f.ablauf === null
    ? `Der QR-Code führt auf ${name} – unbegrenzt gültig.`
    : `Der QR-Code führt auf ${name} – gültig bis ${ZEIT.format(f.ablauf)}; danach führt der Ausdruck ins Leere.`;
}
```

`_ui/druck/Druckseite.tsx`: `DruckseiteDaten` um `qrSatz: string | null`; im lesbaren Zweig direkt nach `<Drucken />`: `{daten.qrSatz ? <p className="noprint kp-druck-qr-satz" data-qr-satz="">{daten.qrSatz}</p> : null}`; `druck.css` (vor `@media print`): `.kp-druck .kp-druck-qr-satz { text-align: center; margin: 0 0 8px; }`. Der Zweig „nicht lesbar" bleibt ohne.

Die vier Druckseiten:
- intern (a4, a3): `const ziel = qrZielIntern(db, plan, new Date().getTime());` und `daten={await druckseitenDaten(db, plan, { format: "a4-quer", qrUrl: ziel?.url ?? null, qrSatz: ziel ? qrZielSatz(ziel) : null })}` (Import `qrZielIntern` in die `druckdaten`-Zeile, `qrZielSatz` aus `@/app/m/kommplan/_lib/freigabe/texte`).
- Token (a4, a3): auf die zweizeilige Form umstellen (`const { token } = await params;` / `const { plan } = await tokenPlanOder404(token);`) und `daten={await druckseitenDaten(getDb(), plan, { format: "a4-quer", qrUrl: qrUrlFuerToken(plan, token) })}`.

`_lib/plan/operationen.ts`: `export function setzeOptionen(inhalt: PlanInhalt, aenderung: Partial<PlanOptionen>): PlanInhalt {` (Rumpf unverändert).

`_ui/editor/PlanFlyin.tsx`: `PlanFormularProps` um `qrLink?: { notiz: string | null; ablauf: number | null } | null; linkAdresse?: boolean; onTeilen?: () => void;` erweitern, `PlanFormular({ …, qrLink = null, linkAdresse = true, onTeilen })`, im Abschnitt „Optionen" nach dem VS-NfD-Schalter:

```tsx
        <label className="kp-schalter"><Switch data-option="qrAufDruck" checked={inhalt.optionen.qrAufDruck}
          onChange={(v) => aendere((q) => setzeOptionen(q, { qrAufDruck: v }))} /> QR-Code „Aktuelle Fassung“ auf dem Ausdruck</label>
        {!inhalt.optionen.qrAufDruck ? null : !linkAdresse ? (
          <p className="kp-hilfe" data-qr-hinweis="">Für die Kommunikationspläne ist keine Adresse eingerichtet — der Ausdruck trägt keinen QR-Code.</p>
        ) : qrLink === null ? (
          <div className="kp-hilfe" data-qr-hinweis="">
            <p>Ohne gültigen Link druckt der Plan keinen QR-Code.</p>
            {onTeilen ? <Button onClick={onTeilen}>Link ausstellen</Button> : null}
          </div>
        ) : (
          <p className="kp-hilfe" data-qr-ziel-satz="">{qrZielSatz(qrLink)}</p>
        )}
```

(Import `qrZielSatz` aus `../../_lib/freigabe/texte`; `Button` ist in `PlanFlyin.tsx` schon importiert — sonst ergänzen.) `PlanFlyin` reicht die drei Props über `...p` schon durch.

`_ui/teilen/Teilen.tsx`: `Props` um `qr?: { an: boolean; onAendern: (an: boolean) => void }`; am Ende des Formulars (nach den Listen) ein eigener Abschnitt — derselbe Schalter wie im Plan-Flyin (eine Option, zwei Orte; Entscheidung 10):

```tsx
      {qr ? (
        <fieldset className="kp-abschnitt">
          <legend>Ausdruck</legend>
          <label className="kp-schalter"><Switch data-option="qrAufDruck" checked={qr.an} onChange={qr.onAendern} /> QR-Code „Aktuelle Fassung“ auf dem Ausdruck</label>
          {qr.an ? <p className="kp-hilfe" data-qr-ziel-satz="">{qrBester ? qrZielSatz(qrBester) : "Ohne gültigen Link druckt der Plan keinen QR-Code."}</p> : null}
        </fieldset>
      ) : null}
```

mit `const qrBester = besteFreigabe(gueltig);` (Importe `Switch` aus antd, `besteFreigabe` aus `regeln`, `qrZielSatz` aus `texte`).

`Editor.tsx`: `const qrLink = besteFreigabe(freigaben.filter((f) => f.status === "gueltig"));` (Status vom Server, keine Uhr im Rendern — Entscheidung 10); am `<PlanFlyin …>`: `qrLink={qrLink} linkAdresse={teilen.basis !== null} onTeilen={() => setFlyin("teilen")}`; am `<TeilenFlyin …>`: `qr={{ an: <Inhalt>.optionen.qrAufDruck, onAendern: (v) => <aendere>((q) => setzeOptionen(q, { qrAufDruck: v })) }}` — `<Inhalt>` und `<aendere>` sind dieselben Werte, die der Editor schon an `PlanFlyin` reicht (`inhalt`, `aendere`).

`grenze.test.ts`: `"_lib/qrGrafik.ts"` an die Liste der geteilten Ordner anhängen.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan`
Expected: PASS — auch `golden.test.ts` und `eigenschaften.test.ts` (ohne QR bytegleich; mit QR keine Überdeckung). Gegenprobe: in `zeichenflaeche` das `Math.min(…)` weglassen → der QR-Fall in `papier.test.ts` und in `eigenschaften.test.ts` rot; zurück. Der Fall „große Stab-Lage passt mit QR" ist mit 24 mm Kante strenger als mit 20 — bleibt er grün, ist der Preis (Review Focus 5) tragbar; sonst Befund in „Abweichungen", nicht die Kante zurückdrehen.

- [ ] **Step 5: Build, Ankerschritt, Commit**

```bash
uptime
pnpm typecheck; echo "exit $?"
pnpm build; echo "build exit $?"
git grep -n "masse.ts:[0-9]\|papier.ts:[0-9]\|Blatt.tsx:[0-9]\|operationen.ts:[0-9]\|PlanFlyin.tsx:[0-9]\|Teilen.tsx:[0-9]\|Druckseite.tsx:[0-9]" -- src scripts e2e docs
pnpm anker:drift src/app/m/kommplan/_lib/layout/papier.ts
git add src/app/m/kommplan
git commit -S -m "feat(kommplan): QR „Aktuelle Fassung“ auf dem Ausdruck

Intern der beste gültige Link, im Token-Druck immer der benutzte Token.
Platz nur, wenn ein QR gedruckt wird (24 mm); Plan-Flyin, Teilen-Flyin
und Druckseite sagen, wohin er führt; ohne Link ein Knopf zu „Teilen“.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Schwarzweiß für Druck und SVG — zweites Rezept-Generat

**Files:**
- Modify: `scripts/kommplan-zeichen-generat.ts` (SW-Lauf, Datei `zeichen-sw.generiert.json`)
- Create (generiert): `src/app/m/kommplan/_lib/zeichen/zeichen-sw.generiert.json`
- Modify: `src/app/m/kommplan/_lib/zeichen/zeichen.ts`, `src/app/m/kommplan/_lib/zeichen/zeichen.test.ts`, `src/app/m/kommplan/_lib/zeichen/generat.test.ts`
- Modify: `src/app/m/kommplan/grenze.test.ts` (Leser- und Client-Regel auch für das SW-Generat)
- Modify: `src/app/m/kommplan/_ui/zeichnung/Blatt.tsx` (`Rahmen.schwarzweiss`, `data-sw`, Stil, Graufilter), `src/app/m/kommplan/_ui/zeichnung/Druckblaetter.tsx`, `src/app/m/kommplan/_ui/zeichnung/Karte.tsx` (`data-hervor`), `src/app/m/kommplan/_ui/zeichnung/Blatt.test.tsx`
- Modify: `src/app/m/kommplan/_lib/druckdaten.ts`, `src/app/m/kommplan/_lib/druckdaten.test.ts`
- Modify: `src/app/m/kommplan/_ui/editor/PlanFlyin.tsx`, `src/app/m/kommplan/_ui/editor/PlanFlyin.test.tsx`

**Interfaces:**
- Consumes: Task 4/10 (`druckseitenDaten`), Task 10 (`setzeOptionen` mit allen Optionen).
- Produces: `symboleFuer(inhalt, optionen?: { schwarzweiss?: boolean })`, `symboleFuerSchluessel(schluessel, optionen?: { schwarzweiss?: boolean })`; `Rahmen.schwarzweiss?: boolean`; `LogoDefs({ logo, schwarzweiss? })`; `GRAU_FILTER_ID = "kp-grau"`.

- [ ] **Step 1: Write the failing test**

`generat.test.ts` (Import `zeichenSw from "./zeichen-sw.generiert.json";` zu den vorhandenen JSON-Importen):
- im Fall „entspricht dem installierten Paketstand": die Liste auf `["zeichen.generiert.json", "zeichen-sw.generiert.json", "grundlagen.generiert.json"]` erweitern;
- im Fall „vermerkt fünf aufgelöste Paketversionen": `expect(zeichenSw.stand).toEqual(zeichen.stand);`
- neu:

```ts
  it("Schwarzweiß (Phase 5, Entscheidung 14): dieselben Schlüssel, kein Buntton, Strichmuster der Organisationen", () => {
    const farbe = zeichen.zeichen as Record<string, { inhalt: string }>;
    const sw = zeichenSw.zeichen as Record<string, { viewBox: string; inhalt: string }>;
    expect(Object.keys(sw)).toEqual(Object.keys(farbe));
    const bunt = Object.entries(sw).flatMap(([k, e]) => [...e.inhalt.matchAll(/#([0-9a-f]{6})\b/gi)]
      .map((m) => m[1].toLowerCase()).filter((h) => !(h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6))).map((h) => `${k}: #${h}`));
    expect(bunt).toEqual([]);
    expect(Object.values(sw).some((e) => /rgb\(|hsl\(/.test(e.inhalt))).toBe(false);
    expect(Object.values(sw).filter((e) => e.inhalt.includes("stroke-dasharray")).length).toBeGreaterThan(100);
    expect(sw["rezept:C.1.1"].inhalt).not.toBe(farbe["rezept:C.1.1"].inhalt); // Löschstaffel: in Farbe rot
    for (const k of ["zusatz:eal", "zusatz:ea", "zusatz:stab", "zusatz:oel"]) expect(sw[k].inhalt).toContain(`>${k === "zusatz:oel" ? "ÖEL" : k === "zusatz:stab" ? "Stab" : k.slice(7).toUpperCase()}<`);
  });
  it("jede SVG-ID ist im SW-Satz samt Piktogrammen eindeutig (ein Druck lädt nur einen der beiden Sätze)", () => {
    const alle = [
      ...Object.values(zeichenSw.zeichen as Record<string, { inhalt: string }>),
      ...Object.values(grundlagen.piktogramme as Record<string, { inhalt: string }>),
    ].flatMap((e) => [...e.inhalt.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(alle).size).toBe(alle.length);
  });
```

`zeichen.test.ts`:

```ts
  it("symboleFuer mit schwarzweiss: dieselben Schlüssel, grauer Inhalt", () => {
    const inhalt = baue({ stellen: [{ id: "a", titel: "A", zeichen: "rezept:C.1.1" }] });
    const farbig = symboleFuer(inhalt);
    const sw = symboleFuer(inhalt, { schwarzweiss: true });
    expect(Object.keys(sw)).toEqual(Object.keys(farbig));
    expect(farbig["rezept:C.1.1"].inhalt).toContain("#fa1919");
    expect(sw["rezept:C.1.1"].inhalt).not.toContain("#fa1919");
    expect(symboleFuerSchluessel(["gibt:es-nicht"], { schwarzweiss: true })).toEqual({});
  });
```

`grenze.test.ts`:
- im Fall „nur _lib/zeichen/zeichen.ts liest das Rezept-Generat": `s.endsWith("zeichen.generiert.json")` → `/(^|\/)zeichen(-sw)?\.generiert\.json$/.test(s)`;
- im Fall „keine Client-Insel erreicht zeichen.ts oder das Rezept-Generat": `verboten` um `join(MODUL, "_lib/zeichen/zeichen-sw.generiert.json")` erweitern.

`Blatt.test.tsx`:

```ts
  it("Schwarzweiß: data-sw am Blatt, Stil für hervorgehobene Köpfe, Logo über den Graufilter", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    const r = { ...rahmen, organisation: "Muster", logo: { href: "data:image/png;base64,QUJD" }, schwarzweiss: true };
    const html = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={r} symbole={{}} />);
    expect(html).toMatch(/<svg[^>]*data-sw=""/);
    expect(html).toContain("svg[data-sw] [data-hervor]{fill:#e6e6e6}");
    expect(html).toMatch(/<filter id="kp-grau"[^>]*><feColorMatrix type="saturate" values="0"/);
    expect(html).toMatch(/<use href="#kp-logo"[^>]*filter="url\(#kp-grau\)"/);
    const farbig = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={{ ...r, schwarzweiss: false }} symbole={{}} />);
    expect(farbig).not.toMatch(/data-sw|kp-grau/);
  });
```

`druckdaten.test.ts`:

```ts
  it("Schwarzweiß-Option: graue Symbole und Rahmen mit schwarzweiss", async () => {
    const db = await mitSeed();
    const p0 = ladePlanLesend(db, "beispiel-einsatz-2026-02-22")!;
    db.update(planTabelle).set({ inhalt: JSON.stringify(setzeOptionen(p0.inhalt!, { schwarzweiss: true })) }).where(eq(planTabelle.id, p0.id)).run();
    const d = await druckseitenDaten(db, ladePlanLesend(db, p0.id)!, { format: "a4-quer", qrUrl: null });
    expect(d.rahmen.schwarzweiss).toBe(true);
    for (const s of Object.values(d.symbole)) for (const m of s.inhalt.matchAll(/#([0-9a-f]{6})\b/gi)) {
      const h = m[1].toLowerCase();
      expect(h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6), `#${h}`).toBe(true);
    }
  });
```

`PlanFlyin.test.tsx`:

```ts
  it("Schwarzweiß-Schalter setzt die Option; der Satz sagt, wofür sie gilt", async () => {
    await mount(<Rahmen />);
    expect(query("[data-sw-hinweis]").textContent).toBe("Gilt für Ausdruck und SVG-Datei; am Bildschirm bleibt der Plan farbig.");
    await clickElement(query('[data-option="schwarzweiss"]'));
    expect(stand.optionen.schwarzweiss).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/_lib/zeichen src/app/m/kommplan/grenze.test.ts src/app/m/kommplan/_ui/zeichnung/Blatt.test.tsx src/app/m/kommplan/_lib/druckdaten.test.ts src/app/m/kommplan/_ui/editor/PlanFlyin.test.tsx`
Expected: FAIL — `./zeichen-sw.generiert.json` fehlt, `schwarzweiss` unbekannt.

- [ ] **Step 3: Write minimal implementation**

`scripts/kommplan-zeichen-generat.ts`:
- Import: `import { PRINT_MONOCHROME_THEME, renderSvg } from "@einsatzzeichen/core";` (statt nur `renderSvg`).
- im Kopfkommentar „WARUM ZWEI DATEIEN" ergänzen — **in einer vorhandenen Kommentarzeile**, keine neue Zeile davor (Zeilenanker): „… `zeichen-sw.generiert.json` (dieselben Rezepte im Druckthema `PRINT_MONOCHROME_THEME`, Phase 5) liest ebenfalls nur der Server;"
- im Rezept-Lauf nach `zeichen[schluessel] = { … };`:

```ts
  zeichenSw[schluessel] = zerlege(kuerzelMitLuft(renderSvg(zeichnung, { size: 64, idPrefix: praefix(abschnitt), theme: PRINT_MONOCHROME_THEME })), schluessel);
```

  mit `const zeichenSw: Record<string, Symbol> = {};` neben `const zeichen …`;
- die Zusatzzeichen-Schleife in eine Funktion heben, die je Thema rendert, und beide Sätze füllen:

```ts
type Thema = Parameters<typeof renderSvg>[1] extends infer O ? (O extends { theme?: infer T } ? T : never) : never;
function zusatzSvg(z: (typeof ZUSATZ)[number], theme: Thema | undefined): string {
  const svg = renderSvg(
    composeFromCatalog(VORLAGE_ZUSATZ!.spec as Spec, z.titel) as unknown as Zeichnung,
    { size: 64, idPrefix: praefix(z.schluessel), ...(theme ? { theme } : {}) },
  );
  const kuerzel = /<text\b([^>]*)\bfont-size="([\d.]+)"([^>]*)>EL<\/text>/g;
  const treffer = [...svg.matchAll(kuerzel)];
  if (treffer.length !== 1) throw new GeneratFehler(`D.1.4 trägt das Kürzel EL nicht genau einmal (${treffer.length})`);
  return kuerzelMitLuft(svg.replace(kuerzel, (_, vor: string, g: string, nach: string) => `<text${vor}font-size="${g}"${nach}>${z.text}</text>`));
}
for (const z of ZUSATZ) {
  zeichen[z.schluessel] = { titel: z.titel, suchtext: `${z.titel} ${z.text}`.toLocaleLowerCase("de-DE"), ...zerlege(zusatzSvg(z, undefined), z.schluessel) };
  zeichenSw[z.schluessel] = zerlege(zusatzSvg(z, PRINT_MONOCHROME_THEME), z.schluessel);
}
```

  (Der Rumpf der bisherigen Schleife wird zu `zusatzSvg`; die Prüfung „EL genau einmal" gilt je Thema.)
- Schreiben: nach der Zeile für `zeichen.generiert.json`

```ts
schreibe("zeichen-sw.generiert.json", { stand: STAND, zeichen: nachSchluessel(zeichenSw) });
```

Generat erzeugen und ansehen:

```bash
pnpm exec tsx scripts/kommplan-zeichen-generat.ts
git status --short src/app/m/kommplan/_lib/zeichen src/app/m/kommplan/_fonts   # nur zeichen-sw.generiert.json neu; zeichen/grundlagen/Schriften unverändert
```

`_lib/zeichen/zeichen.ts`:

```ts
import rohSw from "./zeichen-sw.generiert.json";
…
/** Derselbe Satz im Druckthema (Phase 5, Entscheidung 14) — nur für Druck und SVG-Export, nie für den Bildschirm. */
const ZEICHEN_SW = rohSw.zeichen as unknown as Readonly<Record<string, Symbolquelle>>;
export interface SymbolOptionen { schwarzweiss?: boolean }

export function symboleFuer(inhalt: PlanInhalt, optionen: SymbolOptionen = {}): Record<string, Symbolquelle> {
  return symboleFuerSchluessel(inhalt.stellen.flatMap((s) => [s.zeichen, ...s.einheiten.map((e) => e.zeichen)]).filter((k): k is string => k !== null), optionen);
}

export function symboleFuerSchluessel(schluessel: readonly string[], optionen: SymbolOptionen = {}): Record<string, Symbolquelle> {
  return Object.fromEntries(
    [...new Set(schluessel)].sort().flatMap((k) => {
      const e = findeZeichen(k);
      if (!e) return [];
      const q = optionen.schwarzweiss && Object.prototype.hasOwnProperty.call(ZEICHEN_SW, k) ? ZEICHEN_SW[k] : e;
      return [[k, { viewBox: q.viewBox, inhalt: q.inhalt }]];
    }),
  );
}
```

`_ui/zeichnung/Karte.tsx`: am Hervorhebungs-`<rect>` `data-hervor=""` ergänzen (in derselben Zeile).

`_ui/zeichnung/Blatt.tsx`:

```tsx
export const GRAU_FILTER_ID = "kp-grau";
/** Hervorgehobene Köpfe im Schwarzweißdruck hellgrau statt hellorange (Entscheidung 14) — im Blatt selbst, damit die SVG-Datei es mitnimmt. */
const SW_STIL = "svg[data-sw] [data-hervor]{fill:#e6e6e6}";

export function LogoDefs({ logo, schwarzweiss = false }: { logo: Rahmen["logo"]; schwarzweiss?: boolean }) {
  if (!logo) return null;
  return (
    <>
      <image id={LOGO_ID} width={LOGO_BOX.breite} height={LOGO_BOX.hoehe} preserveAspectRatio="xMaxYMid meet" href={logo.href} />
      {schwarzweiss ? <filter id={GRAU_FILTER_ID} colorInterpolationFilters="sRGB"><feColorMatrix type="saturate" values="0" /></filter> : null}
    </>
  );
}
```

- `Rahmen`: `schwarzweiss?: boolean;`
- `BlattKopf`: `<use href={`#${LOGO_ID}`} x={logoX} y={kopfY} data-logo="" filter={rahmen.schwarzweiss ? `url(#${GRAU_FILTER_ID})` : undefined} />`
- `Blattansicht`: am `<svg>` `data-sw={rahmen.schwarzweiss ? "" : undefined}`; direkt nach `{kopfStil ? <style>…}`: `{rahmen.schwarzweiss ? <style>{SW_STIL}</style> : null}`; `LogoDefs` mit `schwarzweiss={rahmen.schwarzweiss}`.

`_ui/zeichnung/Druckblaetter.tsx`: `<LogoDefs logo={rahmen.logo} schwarzweiss={rahmen.schwarzweiss} />`.

`_lib/druckdaten.ts` in `druckseitenDaten`:

```ts
  const sw = inhalt?.optionen.schwarzweiss ?? false;
  …
    rahmen: { ...rahmen, qr, schwarzweiss: sw },
    symbole: inhalt ? symboleFuer(inhalt, { schwarzweiss: sw }) : {},
```

`_ui/editor/PlanFlyin.tsx`, nach dem QR-Block:

```tsx
        <label className="kp-schalter"><Switch data-option="schwarzweiss" checked={inhalt.optionen.schwarzweiss}
          onChange={(v) => aendere((q) => setzeOptionen(q, { schwarzweiss: v }))} /> Schwarzweiß drucken</label>
        <p className="kp-hilfe" data-sw-hinweis="">Gilt für Ausdruck und SVG-Datei; am Bildschirm bleibt der Plan farbig.</p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan`
Expected: PASS (der Generat-Vergleich dauert unter Last bis 120 s). Gegenprobe: im Generator `theme: PRINT_MONOCHROME_THEME` weglassen und neu erzeugen → „kein Buntton" rot; zurück und neu erzeugen.

- [ ] **Step 5: Build, Ankerschritt, Commit**

```bash
pnpm typecheck; echo "exit $?"
pnpm build; echo "build exit $?"
git grep -n "kommplan-zeichen-generat.ts:[0-9]\|zeichen.ts:[0-9]\|Karte.tsx:[0-9]\|Blatt.tsx:[0-9]\|grenze.test.ts:[0-9]" -- src scripts e2e docs
pnpm anker:drift scripts/kommplan-zeichen-generat.ts
git add scripts/kommplan-zeichen-generat.ts src/app/m/kommplan
git commit -S -m "feat(kommplan): Schwarzweiß für Druck und SVG-Datei

Zweites Rezept-Generat im Druckthema PRINT_MONOCHROME_THEME (Grauwerte
und Strichmuster); hervorgehobene Köpfe grau, Logo über Graufilter.
Am Bildschirm bleibt der Plan farbig.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: „SVG herunterladen" je Blatt — eigenständige Datei mit Arimo

**Files:**
- Modify: `scripts/kommplan-zeichen-generat.ts` (Datei `schrift.generiert.json`)
- Create (generiert): `src/app/m/kommplan/_lib/zeichen/schrift.generiert.json`
- Create: `src/app/m/kommplan/_lib/dateiname.ts`, `src/app/m/kommplan/_lib/dateiname.test.ts`
- Create: `src/app/m/kommplan/_ui/druck/svgExport.ts`, `src/app/m/kommplan/_ui/druck/svgExport.test.ts`
- Create: `src/app/m/kommplan/_ui/druck/SvgHerunterladen.tsx`, `src/app/m/kommplan/_ui/druck/SvgHerunterladen.test.tsx`
- Modify: `src/app/m/kommplan/_ui/druck/Druckseite.tsx`, `src/app/m/kommplan/_ui/druck/Druckseite.test.tsx`, `src/app/m/kommplan/_ui/zeichnung/Druckblaetter.tsx` (`vorBlatt`), `src/app/m/kommplan/_ui/druck/druck.css`
- Modify: `src/app/m/kommplan/_lib/druckdaten.ts` (`mitSvgExport`), `src/app/m/kommplan/_lib/druckdaten.test.ts`, die beiden internen Druckseiten (`searchParams.export`)
- Modify: `src/app/m/kommplan/_ui/druck/Drucken.tsx` (`automatisch`), `src/app/m/kommplan/_ui/druck/Drucken.test.tsx`
- Modify: `src/app/m/kommplan/_ui/druck/DruckMenue.tsx` (`mitSvg`), `src/app/m/kommplan/_ui/druck/DruckMenue.test.tsx`, `src/app/m/kommplan/_ui/editor/Kopfleiste.tsx`, `src/app/m/kommplan/(intern)/p/[id]/page.tsx` (Betrachter: `mitSvg`)
- Modify: `src/app/m/kommplan/_lib/zeichen/generat.test.ts`, `src/app/m/kommplan/grenze.test.ts`

**Interfaces:**
- Consumes: Task 4 (`Druckseite`, `DruckseiteDaten`), Task 11 (SW-Defs im Vorrat); `heuteIso` aus `_lib/tagesfassung.ts`; `msZuTag` aus `_lib/angaben.ts`.
- Produces:
  - `asciiTeil(text: string, max?: number): string`, `svgDateiname(p: { titel: string; tag: string; blatt: number; von: number; format: Papierformat }): string`
  - `SCHRIFTLISTE`, `verweiseIn(text: string): string[]`, `eigenstaendigesSvg(blatt: SVGSVGElement, vorraete: readonly Element[], schriftBase64: string | null): string`
  - `SvgHerunterladen({ nummer, von, dateiname })`
  - `DruckseiteDaten.svgExport: { titel: string; tag: string } | null`; `DruckAuftrag.mitSvgExport?: boolean`
  - `Druckblaetter({ …, vorBlatt?: (b: Blatt) => ReactNode })`
  - `Drucken({ automatisch?: boolean })` (Vorgabe `true`), `Druckseite({ daten, schrift, automatisch? })`
  - `DruckMenue({ …, mitSvg?: boolean })` — Gruppe „SVG-Dateien" mit „SVG – A4 quer"/„SVG – A3 quer", Wahl `{ format, svg: true }` → `…/druck/<format>?export=svg` (Entscheidung 15)

- [ ] **Step 1: Write the failing test**

```ts
// src/app/m/kommplan/_lib/dateiname.test.ts
import { describe, expect, it } from "vitest";
import { asciiTeil, svgDateiname } from "./dateiname";

describe("Dateiname der SVG-Datei (Entscheidung 15, Review Focus 6)", () => {
  it("Umlaute ausgeschrieben, Diakritika weg, alles andere ein Bindestrich, höchstens 60 Zeichen", () => {
    expect(asciiTeil("Übung Großenkneten 01.07.2022")).toBe("Uebung-Grossenkneten-01-07-2022");
    expect(asciiTeil("Café / „Nord“ — EA 3: 🚒 Süd")).toBe("Cafe-Nord-EA-3-Sued");
    expect(asciiTeil("x".repeat(70))).toHaveLength(60);
    expect(asciiTeil(`${"a".repeat(59)} b`)).toBe("a".repeat(59));
    expect(asciiTeil("„“ / 🚒")).toBe("");
  });
  it("Titel, Tag, Blatt und Format; leerer Titel → kommunikationsplan", () => {
    expect(svgDateiname({ titel: "Einsatz Süd", tag: "2026-02-22", blatt: 2, von: 3, format: "a3-quer" })).toBe("Einsatz-Sued_2026-02-22_blatt-2-von-3_a3.svg");
    expect(svgDateiname({ titel: "🚒", tag: "2026-10-01", blatt: 1, von: 1, format: "a4-quer" })).toBe("kommunikationsplan_2026-10-01_blatt-1-von-1_a4.svg");
    expect(svgDateiname({ titel: "x", tag: "2026-10-01", blatt: 1, von: 1, format: "a4-quer" })).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});
```

```ts
// src/app/m/kommplan/_ui/druck/svgExport.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { eigenstaendigesSvg, SCHRIFTLISTE, verweiseIn } from "./svgExport";

function baue(html: string): HTMLElement {
  const wirt = document.createElement("div");
  wirt.innerHTML = html;
  document.body.appendChild(wirt);
  return wirt;
}

describe("eigenständiges SVG (Entscheidung 15, Review Focus 6)", () => {
  it("findet href-, xlink:href- und url()-Verweise", () => {
    expect(verweiseIn('<use href="#a"/><use xlink:href="#b"/><g filter="url(#c)" fill="url(#a)"/>')).toEqual(["a", "b", "c"]);
  });
  it("nimmt genau die erreichten Defs mit (auch über Ketten), dazu Schrift, Schriftliste, weißen Grund — jeder Verweis löst auf", () => {
    const w = baue(`
      <svg class="kp-symbole" width="0" height="0"><defs>
        <symbol id="kp-rezept-A" viewBox="0 0 1 1"><use href="#kp-innen"></use></symbol>
        <symbol id="kp-innen" viewBox="0 0 1 1"><rect width="1" height="1"></rect></symbol>
        <symbol id="kp-unbenutzt" viewBox="0 0 1 1"></symbol>
        <image id="kp-logo" width="40" height="11" href="data:image/png;base64,QUJD"></image>
        <filter id="kp-grau"><feColorMatrix type="saturate" values="0"></feColorMatrix></filter>
      </defs></svg>
      <svg class="kp-blatt" data-blatt="1" width="297mm" height="210mm" viewBox="0 0 297 210" style="font-family: __Arimo_abc; background: rgb(255, 255, 255);">
        <use href="#kp-rezept-A"></use><use href="#kp-logo" filter="url(#kp-grau)"></use><text>Stand</text>
      </svg>`);
    const text = eigenstaendigesSvg(w.querySelector("svg.kp-blatt") as SVGSVGElement, [w.querySelector("svg.kp-symbole")!], "QUJD");
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    for (const id of ["kp-rezept-A", "kp-innen", "kp-logo", "kp-grau"]) expect(text).toContain(`id="${id}"`);
    expect(text).not.toContain("kp-unbenutzt");
    const ids = new Set([...text.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const ref of verweiseIn(text)) expect(ids.has(ref), ref).toBe(true);
    expect(text).toContain('@font-face{font-family:"Arimo";src:url(data:font/ttf;base64,QUJD) format("truetype")');
    expect(text).toContain(`font-family="${SCHRIFTLISTE.replace(/"/g, "&quot;")}"`);
    expect(text).toContain('style="background:#ffffff"');
    expect(text).not.toContain("__Arimo_abc");
    expect(text).not.toContain('class="kp-blatt"');
    expect(text).toContain('width="297mm"');
    // das Blatt im Dokument bleibt unberührt
    expect(w.querySelector("svg.kp-blatt defs")).toBeNull();
    w.remove();
  });
  it("die Datei ist wohlgeformtes XML im SVG-Namensraum — mit und ohne xmlns am Blatt", () => {
    for (const kopf of ['<svg class="kp-blatt" data-blatt="1">', '<svg xmlns="http://www.w3.org/2000/svg" class="kp-blatt" data-blatt="1">']) {
      const w = baue(`<svg class="kp-symbole"><defs><symbol id="kp-a"></symbol></defs></svg>${kopf}<use href="#kp-a"></use><text>Ä &amp; Ö</text></svg>`);
      const text = eigenstaendigesSvg(w.querySelector("svg.kp-blatt") as SVGSVGElement, [w.querySelector("svg.kp-symbole")!], "QUJD");
      const dok = new DOMParser().parseFromString(text, "image/svg+xml");
      expect(dok.querySelector("parsererror"), text.slice(0, 300)).toBeNull();
      expect(dok.documentElement.namespaceURI).toBe("http://www.w3.org/2000/svg");
      expect(text.match(/\sxmlns="/g)?.length ?? 0).toBeLessThanOrEqual(1);
      w.remove();
    }
  });
});
```

```tsx
// src/app/m/kommplan/_ui/druck/SvgHerunterladen.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { SvgHerunterladen } from "./SvgHerunterladen";

vi.mock("../../_lib/zeichen/schrift.generiert.json", () => ({ default: { stand: {}, arimoVariable: "QUJD" } }));
afterEach(async () => { await unmount(); vi.restoreAllMocks(); document.body.querySelectorAll("svg").forEach((s) => s.remove()); });

describe("SvgHerunterladen", () => {
  it("lädt die Schrift erst beim Klick, baut die Datei und lädt sie unter dem übergebenen Namen herunter", async () => {
    document.body.insertAdjacentHTML("beforeend", '<svg class="kp-symbole"><defs><symbol id="kp-x"></symbol></defs></svg><svg class="kp-blatt" data-blatt="2"><use href="#kp-x"></use></svg>');
    let blob: Blob | null = null;
    const url = vi.fn((b: Blob) => { blob = b; return "blob:x"; });
    Object.assign(URL, { createObjectURL: url, revokeObjectURL: vi.fn() });
    // Nur festhalten, nicht im Stub prüfen: ein Wurf dort landete im try/catch der Komponente, und der Test bliebe grün.
    const gesehen: { download: string; href: string }[] = [];
    const klick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      gesehen.push({ download: this.download, href: this.href });
    });
    await mount(<SvgHerunterladen nummer={2} von={3} dateiname="Plan_2026-10-01_blatt-2-von-3_a4.svg" />);
    expect(query("button").textContent).toBe("SVG herunterladen (Blatt 2 von 3)");
    await clickElement(query("button"));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(klick).toHaveBeenCalledTimes(1);
    expect(gesehen).toEqual([{ download: "Plan_2026-10-01_blatt-2-von-3_a4.svg", href: "blob:x" }]);
    expect(document.querySelector('[role="status"]')).toBeNull(); // keine Fehlermeldung
    expect(blob!.type).toBe("image/svg+xml");
    const text = await blob!.text();
    expect(text).toContain('id="kp-x"');
    expect(text).toContain("@font-face");
  });
  it("fehlt das Blatt: eine Meldung, kein Wurf", async () => {
    await mount(<SvgHerunterladen nummer={9} von={9} dateiname="x.svg" />);
    await clickElement(query("button"));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(query('[role="status"]').textContent).toContain("ließ sich nicht erstellen");
  });
});
```

`Druckseite.test.tsx`:

```ts
  it("mit SVG-Export: über jedem Blatt ein Knopf mit ASCII-Dateinamen; ohne (Token-Druck) keiner", () => {
    const gross = BEISPIELE.find((b) => b.id === "beispiel-grosse-stabslage")!;
    const blaetter = teileAuf(gross.inhalt, "a4-quer");
    const daten = { format: "a4-quer" as const, blaetter, rahmen: RAHMEN, symbole: {}, qrSatz: null };
    const mit = renderToStaticMarkup(<Druckseite schrift={SCHRIFT} daten={{ ...daten, svgExport: { titel: "Große Stab-Lage", tag: "2026-10-01" } }} />);
    expect(mit.split("SVG herunterladen (Blatt").length - 1).toBe(blaetter.length);
    expect(mit).toContain(`SVG herunterladen (Blatt 1 von ${blaetter.length})`);
    const ohne = renderToStaticMarkup(<Druckseite schrift={SCHRIFT} daten={{ ...daten, svgExport: null }} />);
    expect(ohne).not.toContain("SVG herunterladen");
  });
```

(und die vorhandenen Fälle bekommen `svgExport: null` in `daten`).

`Drucken.test.tsx` (verschoben in Task 4) — neuer Fall:

```ts
  it("automatisch={false} (SVG-Weg): kein Druckdialog beim Laden, der Knopf druckt weiter", async () => {
    const drucke = vi.spyOn(window, "print").mockImplementation(() => {});
    await mount(<Drucken automatisch={false} />);
    await act(async () => { await document.fonts?.ready; });
    expect(drucke).not.toHaveBeenCalled();
    await clickElement(query("button"));
    expect(drucke).toHaveBeenCalledTimes(1);
    drucke.mockRestore();
  });
```

(Importe in die vorhandenen Zeilen zusammenführen; liefert jsdom kein `document.fonts`, stubbt der vorhandene Test es schon — dasselbe Muster nehmen.)

`DruckMenue.test.tsx` — neuer Fall:

```ts
  it("mitSvg (intern): Gruppe „SVG-Dateien“ öffnet die Druckroute mit ?export=svg — ohne Druckdialog", async () => {
    const auf = vi.spyOn(window, "open").mockReturnValue(null);
    await mount(<DruckMenue basis="/p/x" mitSvg />);
    await oeffne();
    expect(punkte().map((p) => p.textContent)).toEqual(["A4 quer", "A3 quer", "SVG – A4 quer", "SVG – A3 quer"]);
    await clickElement(punkte()[3]);
    expect(auf).toHaveBeenLastCalledWith("/p/x/druck/a3?export=svg", "_blank", "noopener");
    auf.mockRestore();
  });
```

und im ersten Fall bleibt ohne `mitSvg` die Liste `["A4 quer", "A3 quer"]` (Token-Ansicht: kein SVG).

`druckdaten.test.ts`:

```ts
  it("SVG-Export nur auf Wunsch; Tag = Plandatum, sonst der Tag des Stands in der Suite-Zone", async () => {
    const db = await mitSeed();
    const p = ladePlanLesend(db, "beispiel-einsatz-2026-02-22")!;
    expect((await druckseitenDaten(db, p, { format: "a4-quer", qrUrl: null })).svgExport).toBeNull();
    expect((await druckseitenDaten(db, p, { format: "a4-quer", qrUrl: null, mitSvgExport: true })).svgExport).toEqual({ titel: p.titel, tag: "2026-02-22" });
    const ohneDatum = { ...p, datum: null, aktualisiertAm: Date.UTC(2026, 8, 30, 22, 30) }; // 01.10.2026, 00:30 in Berlin
    expect((await druckseitenDaten(db, ohneDatum, { format: "a4-quer", qrUrl: null, mitSvgExport: true })).svgExport?.tag).toBe("2026-10-01");
  });
```

(Der Seed `beispiele/einsatz20260222.ts` trägt `datum: "2026-02-22"`.)

`generat.test.ts` (Import `schrift from "./schrift.generiert.json";`, `TEXT_FONT_SHA256` ist schon importiert):
- Vergleichsliste um `"schrift.generiert.json"` erweitern;
- neu:

```ts
  it("die Schrift für den SVG-Export ist Arimo-Variable des Katalogs, byteweise (Entscheidung 15)", () => {
    const bytes = Buffer.from(schrift.arimoVariable, "base64");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(TEXT_FONT_SHA256);
    expect(sha("src/app/m/kommplan/_fonts/Arimo-Variable.ttf")).toBe(TEXT_FONT_SHA256);
    expect(schrift.stand).toEqual(zeichen.stand);
  });
```

`grenze.test.ts`:
- `"_lib/dateiname.ts"` an die Liste der geteilten Ordner anhängen;
- neu:

```ts
  it("die Schrift-Generat lädt nur SvgHerunterladen, und nur per dynamischem import() — nie im Bündel jeder Druckseite", () => {
    const leser = laufzeit.filter((p) => /schrift\.generiert\.json/.test(ohneKommentare(quelltext(p))));
    expect(leser.map((p) => relative(MODUL, p))).toEqual(["_ui/druck/SvgHerunterladen.tsx"]);
    const q = ohneKommentare(quelltext(leser[0]));
    expect(q).toMatch(/await import\(\s*["'][^"']*schrift\.generiert\.json["']\s*\)/);
    expect(q).not.toMatch(/from\s+["'][^"']*schrift\.generiert\.json["']/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/_lib/dateiname.test.ts src/app/m/kommplan/_ui/druck src/app/m/kommplan/_lib/druckdaten.test.ts src/app/m/kommplan/grenze.test.ts`
Expected: FAIL — Module fehlen, `svgExport` unbekannt.

- [ ] **Step 3: Write minimal implementation**

`scripts/kommplan-zeichen-generat.ts`: Import `TEXT_FONT_PATH` ist schon da; nach dem Schreiben des SW-Generats:

```ts
// Die Schrift für den SVG-Export (Phase 5, Entscheidung 15): als Base64, damit sie gebündelt wird — unter
// `output: "standalone"` ist `_fonts/` zur Laufzeit nicht mitkopiert. Gelesen nur beim Klick (`SvgHerunterladen`).
schreibe("schrift.generiert.json", { stand: STAND, arimoVariable: readFileSync(TEXT_FONT_PATH).toString("base64") });
```

(`readFileSync` ist schon importiert.) Dann `pnpm exec tsx scripts/kommplan-zeichen-generat.ts` und `git status --short` — neu ist nur `schrift.generiert.json` (≈ 110 KB).

```ts
// src/app/m/kommplan/_lib/dateiname.ts
import type { Papierformat } from "./layout/typen";

const ERSATZ: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss" };

/**
 * ASCII-sicherer Teil eines Dateinamens (Entscheidung 15): Umlaute ausgeschrieben, Diakritika weg, alles außer
 * A–Z a–z 0–9 zu einem Bindestrich, höchstens `max` Zeichen, ohne Bindestrich am Rand. Kann leer werden.
 */
export function asciiTeil(text: string, max = 60): string {
  return text.replace(/[äöüÄÖÜß]/g, (c) => ERSATZ[c])
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, max).replace(/-+$/, "");
}

export function svgDateiname(p: { titel: string; tag: string; blatt: number; von: number; format: Papierformat }): string {
  const titel = asciiTeil(p.titel) || "kommunikationsplan";
  return `${titel}_${p.tag}_blatt-${p.blatt}-von-${p.von}_${p.format === "a3-quer" ? "a3" : "a4"}.svg`;
}
```

```ts
// src/app/m/kommplan/_ui/druck/svgExport.ts
/**
 * DIE EIGENSTÄNDIGE SVG-DATEI EINES BLATTS (Spec §8.1; Umsetzungsplan Phase 5, Entscheidung 15). Im Druckdokument
 * stehen Symbole, Logo und Graufilter EINMAL in einem gemeinsamen Vorrat (`Druckblaetter`), die Blätter verweisen per
 * `<use>`/`url(#…)`. Die Datei nimmt genau die erreichten Einträge mit (auch über Ketten, etwa ein Symbol, das ein
 * anderes verwendet), bettet Arimo als `@font-face` ein und setzt eine Schriftliste, die auch ohne `@font-face` gleich
 * breit setzt (Arimo ist metrisch gleich mit Arial und Liberation Sans). DOM-Code für die Client-Insel; kein React.
 */
const SVG_NS = "http://www.w3.org/2000/svg";
export const SCHRIFTLISTE = 'Arimo, Arial, "Liberation Sans", Helvetica, sans-serif';
const VERWEIS = /(?:\bhref|xlink:href)="#([^"]+)"|url\(#([^)"']+)\)/g;
const SICHERE_ID = /^[A-Za-z0-9_.:-]+$/;

export function verweiseIn(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(VERWEIS)) {
    const id = m[1] ?? m[2];
    if (SICHERE_ID.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function eigenstaendigesSvg(blatt: SVGSVGElement, vorraete: readonly Element[], schriftBase64: string | null): string {
  const kopie = blatt.cloneNode(true) as SVGSVGElement;
  const defs = document.createElementNS(SVG_NS, "defs");
  const vorhanden = new Set([...kopie.querySelectorAll("[id]")].map((e) => e.id));
  const offen = verweiseIn(kopie.outerHTML);
  while (offen.length > 0) {
    const id = offen.shift()!;
    if (vorhanden.has(id)) continue;
    const quelle = vorraete.map((v) => v.querySelector(`[id="${id}"]`)).find((e): e is Element => e !== null);
    if (!quelle) continue;
    const klon = quelle.cloneNode(true) as Element;
    defs.appendChild(klon);
    for (const e of [klon, ...klon.querySelectorAll("[id]")]) if (e.id) vorhanden.add(e.id);
    offen.push(...verweiseIn(klon.outerHTML));
  }
  if (defs.childNodes.length > 0) kopie.insertBefore(defs, kopie.firstChild);
  if (schriftBase64) {
    const stil = document.createElementNS(SVG_NS, "style");
    stil.textContent = `@font-face{font-family:"Arimo";src:url(data:font/ttf;base64,${schriftBase64}) format("truetype");font-weight:400 700;font-style:normal;}`;
    kopie.insertBefore(stil, kopie.firstChild);
  }
  kopie.removeAttribute("class");
  kopie.setAttribute("style", "background:#ffffff");
  kopie.setAttribute("font-family", SCHRIFTLISTE);
  // KEIN setAttribute("xmlns"): das Blatt rendert es schon, und ein zweites (namensraumloses) Attribut kann der
  // XMLSerializer doppelt ausgeben — dann öffnet die Datei nirgends. Der Serializer setzt den SVG-Namensraum selbst.
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(kopie)}\n`;
}
```

```tsx
// src/app/m/kommplan/_ui/druck/SvgHerunterladen.tsx
"use client";

import { useState } from "react";
import { Button } from "antd";
import { eigenstaendigesSvg } from "./svgExport";

/**
 * „SVG HERUNTERLADEN" JE BLATT (Entscheidung 15). Die Schrift (≈ 110 KB Base64) kommt erst beim Klick per
 * dynamischem `import()` — `grenze.test.ts` hält fest, dass sie in keinem anderen Bündel landet. Der Name kommt
 * fertig vom Server (`svgDateiname`).
 */
export function SvgHerunterladen({ nummer, von, dateiname }: { nummer: number; von: number; dateiname: string }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function lade() {
    setLaeuft(true);
    setFehler(null);
    try {
      const blatt = document.querySelector<SVGSVGElement>(`svg.kp-blatt[data-blatt="${nummer}"]`);
      const vorrat = document.querySelector("svg.kp-symbole");
      if (!blatt || !vorrat) throw new Error("Blatt oder Vorrat fehlt");
      const { default: schrift } = await import("../../_lib/zeichen/schrift.generiert.json");
      const text = eigenstaendigesSvg(blatt, [vorrat], schrift.arimoVariable);
      const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = dateiname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setFehler("Die SVG-Datei ließ sich nicht erstellen. Lade die Seite neu und versuche es noch einmal.");
    } finally {
      setLaeuft(false);
    }
  }
  return (
    <>
      <Button onClick={() => void lade()} loading={laeuft}>{`SVG herunterladen (Blatt ${nummer} von ${von})`}</Button>
      {fehler ? <p role="status">{fehler}</p> : null}
    </>
  );
}
```

`_ui/zeichnung/Druckblaetter.tsx`: Prop `vorBlatt?: (b: Blatt) => ReactNode` (Import `type ReactNode` aus `react`, `Fragment`):

```tsx
      {blaetter.map((b) => (
        <Fragment key={b.nummer}>
          {vorBlatt ? vorBlatt(b) : null}
          <Blattansicht format={format} blatt={b} rahmen={rahmen} symbole={symbole} schrift={schrift} mitDefs={false} />
        </Fragment>
      ))}
```

`_ui/druck/Drucken.tsx`: `export function Drucken({ automatisch = true }: { automatisch?: boolean })`, im Effekt `if (!automatisch) return;` als erste Anweisung, Abhängigkeit `[automatisch]`; Kopfkommentar um „`automatisch={false}` auf dem SVG-Weg (`?export=svg`, Phase 5, Entscheidung 15)" ergänzen — in einer vorhandenen Zeile.

`_ui/druck/Druckseite.tsx`: Prop `automatisch?: boolean` (Vorgabe `true`), `<Drucken automatisch={automatisch} />`; ohne Automatik steht über den Blättern `<p className="noprint kp-druck-svg-hinweis">Zum Herunterladen: je Blatt ein Knopf. Drucken geht weiter über „Drucken“.</p>`. `DruckseiteDaten` um `svgExport: { titel: string; tag: string } | null` erweitern; Import `svgDateiname` aus `../../_lib/dateiname`, `SvgHerunterladen` aus `./SvgHerunterladen`; am `Druckblaetter`:

```tsx
        vorBlatt={daten.svgExport ? (b) => (
          <div className="noprint kp-blatt-werkzeug">
            <SvgHerunterladen nummer={b.nummer} von={b.von}
              dateiname={svgDateiname({ titel: daten.svgExport!.titel, tag: daten.svgExport!.tag, blatt: b.nummer, von: b.von, format: daten.format })} />
          </div>
        ) : undefined}
```

(`vorBlatt` ist eine Funktion an einer **Server**-Komponente — sie überquert keine RSC-Grenze; über die Grenze geht nur `SvgHerunterladen` mit drei serialisierbaren Props, Falle 9.)

`druck.css` (vor `@media print`): `.kp-druck .kp-blatt-werkzeug { text-align: center; margin-block-end: 8px; }`.

`_lib/druckdaten.ts`: `DruckAuftrag` um `mitSvgExport?: boolean`; Importe `msZuTag` aus `./angaben`, `heuteIso` aus `./tagesfassung`; im Rückgabewert:

```ts
    svgExport: auftrag.mitSvgExport
      ? { titel: plan.titel, tag: plan.datum !== null ? msZuTag(plan.datum)! : heuteIso(plan.aktualisiertAm) }
      : null,
```

Interne Druckseiten (a4, a3): Auftrag um `mitSvgExport: true`; dazu `searchParams` lesen (Next 16: `searchParams: Promise<{ export?: string | string[] }>` — vorher `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` lesen) und `<Druckseite … automatisch={(await searchParams).export !== "svg"} />`. Die Token-Druckseiten bleiben ohne SVG und ohne `searchParams` (Entscheidung 15).

`_ui/druck/DruckMenue.tsx`: Prop `mitSvg?: boolean`; die Einträge

```tsx
  const items: MenuProps["items"] = [
    ...DRUCKFORMATE.map((f) => ({ key: f.key, label: f.label })),
    ...(mitSvg ? [{ type: "group" as const, label: "SVG-Dateien", children: DRUCKFORMATE.map((f) => ({ key: `${f.key}-svg`, label: `SVG – ${f.label}` })) }] : []),
  ];
```

und im `onClick`: `const [format, art] = key.split("-"); waehle({ format: format as DruckFormatKurz, svg: art === "svg" });`. Kopfkommentar um „Intern (`mitSvg`) zusätzlich die SVG-Dateien ohne Druckdialog (Entscheidung 15)" ergänzen. Aufrufer: `Kopfleiste` (`<DruckMenue onWahl={onDrucken} mitSvg />`) und der Betrachter-Zweig von `(intern)/p/[id]/page.tsx` (`mitSvg`); die Token-Ansicht nicht.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan`
Expected: PASS. Gegenprobe: in `eigenstaendigesSvg` die Kette (`offen.push(...)` für den Klon) entfernen → „jeder Verweis löst auf" rot (`kp-innen` fehlt); zurück. Gegenprobe zum SVG-Weg: `if (!automatisch) return;` entfernen → `Drucken.test.tsx` rot; zurück.

- [ ] **Step 5: Build, Ankerschritt, Commit**

```bash
uptime
pnpm typecheck; echo "exit $?"
pnpm lint; echo "lint exit $?"
pnpm build; echo "build exit $?"
git grep -n "kommplan-zeichen-generat.ts:[0-9]\|Druckblaetter.tsx:[0-9]\|Druckseite.tsx:[0-9]\|druckdaten.ts:[0-9]\|Drucken.tsx:[0-9]\|DruckMenue.tsx:[0-9]\|Kopfleiste.tsx:[0-9]" -- src scripts e2e docs
git add scripts/kommplan-zeichen-generat.ts src/app/m/kommplan
git commit -S -m "feat(kommplan): SVG herunterladen je Blatt

Eigenständige Datei mit den erreichten Symbolen, Logo und Graufilter,
Arimo als @font-face (erst beim Klick geladen) und metrisch gleicher
Schriftliste; ASCII-Dateiname aus Titel, Datum, Blatt und Format.
Im Druckmenü „SVG-Dateien“: die Druckseite ohne Druckdialog.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: „Als Vorlage speichern" legt eine Kopie an; „Vorlage archivieren" ersetzt „Keine Vorlage mehr"

**Files:**
- Modify: `src/app/m/kommplan/_lib/planverwaltung.ts` (`speichereAlsVorlage` statt `setzeVorlage`), `src/app/m/kommplan/_lib/planverwaltung.test.ts`
- Modify: `src/app/m/kommplan/_actions/verwaltung.ts` (`speichereAlsVorlageAction` statt `setzeVorlageAction`), `src/app/m/kommplan/_actions/verwaltung.test.ts`
- Modify: `src/core/audit/coverage-manifest.json`
- Modify: `src/app/m/kommplan/(intern)/PlanTabelle.tsx`, `src/app/m/kommplan/(intern)/PlanTabelle.test.tsx`
- Modify: `e2e/kommplan-verwaltung.spec.ts` (Test „Vorlage: …")

**Interfaces:**
- Consumes: `AnlageErgebnis` aus `_lib/ergebnis.ts`; `archiviereAction`, `stelleWiederHerAction` (unverändert).
- Produces: `speichereAlsVorlage(db: KommplanDb, id: string, wer: Bearbeiter, jetzt: number): AnlageErgebnis`, `speichereAlsVorlageAction(id: unknown): Promise<AnlageErgebnis>`. `setzeVorlage`, `setzeVorlageAction` entfallen.

- [ ] **Step 1: Write the failing test**

`planverwaltung.test.ts` — Importzeile: `setzeVorlage` → `speichereAlsVorlage`. **Alle vier** Aufrufe von `setzeVorlage` in der Datei verschwinden (Kritik: zwei stehen außerhalb des ersetzten Falls):
- im Block „Planverwaltung — Grenzfälle (Review Phase 4)", Fall „die Kopie einer Vorlage ist ein Plan, keine zweite Vorlage": auf eine Seed-Vorlage umstellen —

```ts
  it("die Kopie einer Vorlage ist ein Plan, keine zweite Vorlage", async () => {
    const db = await mitSeed();
    const v = vorlagenZurAuswahl(db)[0];
    const r = dupliziere(db, v.id, WER, NACH_MITTERNACHT);
    if (!r.ok) throw new Error(r.fehler);
    expect(ladePlanLesend(db, r.id)).toMatchObject({ istVorlage: false });
  });
```

- im selben Block den Fall „ein archivierter Plan wird nicht zur Vorlage (und nicht zurück)" **streichen** — den Inhalt deckt der neue Fall „aus einer Vorlage, einem archivierten oder unbekannten Plan wird keine Vorlage" unten ab;
- den Fall „„Als Vorlage speichern“ verschiebt den Plan …" (Block „Vorlagen") ersetzen:

```ts
  it("„Als Vorlage speichern“ legt eine KOPIE als Vorlage an — Titel gleich, Datum leer, Ausgangsplan unverändert (Phase 5, Entscheidung 16)", async () => {
    const db = await mitSeed();
    const vorher = ladePlanLesend(db, OPENR)!;
    const r = speichereAlsVorlage(db, OPENR, WER, NACH_MITTERNACHT);
    if (!r.ok) throw new Error(r.fehler);
    expect(r.id).not.toBe(OPENR);
    expect(ladePlanLesend(db, OPENR)).toEqual(vorher); // Ausgangsplan unberührt, auch der Stand
    expect(listePlaene(db, "plaene").map((z) => z.id)).toContain(OPENR);
    const v = ladePlanLesend(db, r.id)!;
    expect(v).toMatchObject({ titel: vorher.titel, typ: vorher.typ, anlass: vorher.anlass, datum: null, istVorlage: true, archiviertAm: null, version: 1, aktualisiertAm: NACH_MITTERNACHT, aktualisiertVon: "Jana" });
    expect(v.inhalt).toEqual(vorher.inhalt);
    expect(vorlagenZurAuswahl(db).map((x) => x.id)).toContain(r.id);
  });
  it("aus einer Vorlage, einem archivierten oder unbekannten Plan wird keine Vorlage", async () => {
    const db = await mitSeed();
    const vorlage = vorlagenZurAuswahl(db)[0];
    expect(speichereAlsVorlage(db, vorlage.id, WER, NACH_MITTERNACHT)).toEqual({ ok: false, fehler: PLAN_WEG, feldFehler: {} });
    archiviere(db, OPENR, NACH_MITTERNACHT);
    expect(speichereAlsVorlage(db, OPENR, WER, NACH_MITTERNACHT).ok).toBe(false);
    expect(speichereAlsVorlage(db, "gibt-es-nicht", WER, NACH_MITTERNACHT).ok).toBe(false);
  });
  it("„Vorlage archivieren“ = archivieren: die Vorlage verschwindet aus der Auswahl und kehrt beim Wiederherstellen als Vorlage zurück", async () => {
    const db = await mitSeed();
    const vorlage = vorlagenZurAuswahl(db)[0];
    archiviere(db, vorlage.id, NACH_MITTERNACHT);
    expect(vorlagenZurAuswahl(db).map((x) => x.id)).not.toContain(vorlage.id);
    expect(listePlaene(db, "archiv").find((z) => z.id === vorlage.id)?.vorlage).toBe(true);
    stelleWiederHer(db, vorlage.id);
    expect(listePlaene(db, "vorlagen").map((z) => z.id)).toContain(vorlage.id);
  });
```

`verwaltung.test.ts` — im Forbidden-Fall `setzeVorlageAction({ id: …, vorlage: true })` → `speichereAlsVorlageAction("beispiel-openr-2022-07-01")`; im Erfolgsfall die zwei `setzeVorlageAction`-Zeilen ersetzen durch:

```ts
    const v = await a.speichereAlsVorlageAction("beispiel-openr-2022-07-01");
    expect(v).toMatchObject({ ok: true, id: expect.any(String) });
    expect(await a.speichereAlsVorlageAction({ id: "x" })).toEqual({ ok: false, fehler: "Ungültige Anfrage.", feldFehler: {} });
```

(Achtung Reihenfolge: der Fall archiviert und stellt OpenR vorher wieder her — die Kopie entsteht danach aus dem aktiven Plan.)

`PlanTabelle.test.tsx`:
- Mock: `vorlage: vi.fn()` bleibt als Name, die Zuordnung wird `speichereAlsVorlageAction: aktion.vorlage` (statt `setzeVorlageAction`).
- im Fall „ohne Bearbeitungsrecht keine Aktionen …" bleibt die Liste `["Duplizieren", "Als Vorlage speichern", "Archivieren"]`.
- neu:

```ts
  it("„Als Vorlage speichern“ legt eine Kopie an, sagt, wo sie steht, und bietet „Vorlage öffnen“ — der Plan bleibt in der Liste", async () => {
    aktion.vorlage.mockResolvedValue({ ok: true, id: "v9" });
    await mount(<PlanTabelle zeilen={[ZEILEN[0]]} liste="plaene" darfBearbeiten />);
    await clickElement(query('button[aria-label="Aktionen für Einsatz"]'));
    await abwarten();
    await clickElement(knopf("Als Vorlage speichern"));
    await abwarten();
    expect(aktion.vorlage).toHaveBeenCalledWith("p1");
    expect(query(".kp-listenhinweis").textContent).toContain("Vorlage „Einsatz“ angelegt — sie steht unter „Vorlagen“.");
    const oeffnen = query<HTMLAnchorElement>(".kp-listenhinweis a");
    expect(oeffnen.textContent).toBe("Vorlage öffnen");
    expect(oeffnen.getAttribute("href")).toBe("/p/v9");
    expect(document.activeElement).toBe(oeffnen);
    expect(router.refresh).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
```

- den Fall „Vorlagenliste: „Keine Vorlage mehr“ setzt vorlage:false …" ersetzen:

```ts
  it("Vorlagenliste: „Neu aus Vorlage“ und „Vorlage archivieren“ (mit Rückgängig) — kein „Keine Vorlage mehr“, kein zweites „Archivieren“", async () => {
    aktion.archiviere.mockResolvedValue({ ok: true });
    await mount(<PlanTabelle zeilen={[ZEILEN[1]]} liste="vorlagen" darfBearbeiten />);
    await clickElement(query('button[aria-label="Aktionen für Label"]'));
    await abwarten();
    expect([...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent)).toEqual(["Neu aus Vorlage", "Vorlage archivieren"]);
    await clickElement(knopf("Vorlage archivieren"));
    await abwarten();
    expect(aktion.archiviere).toHaveBeenCalledWith("p2");
    expect(query(".kp-listenhinweis").textContent).toContain("Vorlage „Label“ archiviert.");
    expect(knopf("Rückgängig")).toBeTruthy();
  });
  it("Archiv: eine Vorlage trägt das Kennzeichen „Vorlage“; Wiederherstellen sagt, wohin sie zurückkehrt", async () => {
    aktion.wiederher.mockResolvedValue({ ok: true });
    await mount(<PlanTabelle zeilen={[{ ...ZEILEN[1], lesbar: true, archiviert: "01.10.2026" }]} liste="archiv" darfBearbeiten />);
    expect(queryAll("tr[data-row-key] .kp-chip").map((c) => c.textContent)).toEqual(["Vorlage"]);
    await clickElement(query('button[aria-label="Aktionen für Label"]'));
    await abwarten();
    await clickElement(knopf("Wiederherstellen"));
    await abwarten();
    expect(query(".kp-listenhinweis").textContent).toBe("„Label“ wiederhergestellt — sie steht wieder unter „Vorlagen“.");
  });
```

(Die Aktionen-Knöpfe tragen `aria-label="Aktionen für <Titel>"`; die Tabelle rendert Tabelle UND Karten — `query` nimmt den ersten Treffer, die Tabellenzeile.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/m/kommplan/_lib/planverwaltung.test.ts src/app/m/kommplan/_actions/verwaltung.test.ts "src/app/m/kommplan/(intern)/PlanTabelle.test.tsx"`
Expected: FAIL — `speichereAlsVorlage` und `speichereAlsVorlageAction` nicht exportiert, Menü der Vorlagen hat noch „Keine Vorlage mehr" und „Archivieren".

- [ ] **Step 3: Write minimal implementation**

`_lib/planverwaltung.ts` — `setzeVorlage` ersetzen (Import `AnlageErgebnis` in die vorhandene `./ergebnis`-Typzeile):

```ts
/**
 * „ALS VORLAGE SPEICHERN" LEGT EINE KOPIE AN (Umsetzungsplan Phase 5, Entscheidung 16; ändert Phase-4-Entscheidung 7):
 * ein laufender Plan soll nicht unbemerkt in die Vorlagenliste wandern, und spätere Korrekturen am Einsatz sollen die
 * Vorlage nicht still ändern. Titel bleibt, Datum leer (eine Vorlage hat keinen Einsatztag; „Neu aus Vorlage" setzt
 * heute), Links werden nicht kopiert. Nur aus einem aktiven Plan, der selbst keine Vorlage ist.
 */
export function speichereAlsVorlage(db: KommplanDb, id: string, wer: Bearbeiter, jetzt: number): AnlageErgebnis {
  const q = db.select().from(plan).where(and(eq(plan.id, id), isNull(plan.archiviertAm), eq(plan.istVorlage, false))).get();
  if (!q) return { ok: false, fehler: PLAN_WEG, feldFehler: {} };
  const inhalt = lies(q).inhalt;
  if (!inhalt) return { ok: false, fehler: "Dieser Plan lässt sich nicht lesen und deshalb nicht als Vorlage speichern.", feldFehler: {} };
  const neu = randomUUID();
  db.insert(plan).values({
    id: neu, titel: q.titel, typ: q.typ, anlass: q.anlass, datum: null, istVorlage: true,
    aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name, inhalt: JSON.stringify(inhalt),
  }).run();
  return { ok: true, id: neu };
}
```

und im Kopfkommentar der Datei „(`ist_vorlage`, `archiviert_am`, Anlegen)" stehen lassen; „Entscheidungen 7–10; Phase 5 Entscheidung 3" (so steht es seit Task 2) → „Entscheidungen 7–10; Phase 5 Entscheidungen 3, 16" **in derselben Zeile**.

`_actions/verwaltung.ts` — `setzeVorlageAction` ersetzen (Import `AnlageErgebnis` in die Typzeile, `speichereAlsVorlage` statt `setzeVorlage`):

```ts
export async function speichereAlsVorlageAction(id: unknown): Promise<AnlageErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  const r = ID.safeParse(id);
  if (!r.success) return { ...UNGUELTIG, feldFehler: {} };
  return withAuditContext({ actor: auditActor(viewer) }, async () => speichereAlsVorlage(getDb(), r.data, bearbeiterAus(viewer), Date.now()));
}
```

`coverage-manifest.json`: den Schlüssel `…/verwaltung.ts#setzeVorlageAction` (samt `via`) ersetzen durch

```json
  "src/app/m/kommplan/_actions/verwaltung.ts#speichereAlsVorlageAction": {
    "kind": "context",
    "via": "speichereAlsVorlageAction"
  },
```

an der alphabetisch richtigen Stelle (vor `…#stelleWiederHerAction`, nach `…#dupliziereAction`).

`(intern)/PlanTabelle.tsx`:

```ts
import { archiviereAction, dupliziereAction, speichereAlsVorlageAction, stelleWiederHerAction } from "../_actions/verwaltung";
…
const LEER: Record<Liste, string> = {
  plaene: "Noch keine Pläne.",
  vorlagen: "Noch keine Vorlagen. „Als Vorlage speichern“ im Menü eines Plans legt eine Kopie als Vorlage an.",
  archiv: "Das Archiv ist leer.",
};
…
const MENUE: Record<Liste, { key: Aktion; label: string }[]> = {
  plaene: [{ key: "duplizieren", label: "Duplizieren" }, { key: "vorlage", label: "Als Vorlage speichern" }, { key: "archivieren", label: "Archivieren" }],
  vorlagen: [{ key: "ausVorlage", label: "Neu aus Vorlage" }, { key: "vorlageArchivieren", label: "Vorlage archivieren" }],
  archiv: [{ key: "wiederherstellen", label: "Wiederherstellen" }],
};
```

(Der Schlüssel `keineVorlage` heißt jetzt `vorlageArchivieren` — im Typ `Aktion` mitziehen.) `Hinweis` bekommt ein zweites Ziel: `interface Hinweis { text: string; zurueck?: string; oeffnen?: string; fokus?: boolean }`, gerendert nach dem „Rückgängig"-Knopf als `{hinweis.oeffnen ? <Button ref={oeffnenRef} href={`/p/${hinweis.oeffnen}`}>Vorlage öffnen</Button> : null}` (`useRef<HTMLAnchorElement>` — antd rendert `Button` mit `href` als `<a>`), und der Fokus-Effekt nimmt `(zurueckRef.current ?? oeffnenRef.current ?? hinweisRef.current)?.focus()`.

in `fuehreAus`:

```ts
    let neueVorlage: string | undefined;
    const lauf: Record<Exclude<Aktion, "ausVorlage" | "duplizieren">, () => Promise<EinfachErgebnis>> = {
      vorlage: () => speichereAlsVorlageAction(z.id).then((r): EinfachErgebnis => {
        if (!r.ok) return { ok: false, fehler: r.fehler };
        neueVorlage = r.id;
        return { ok: true };
      }),
      vorlageArchivieren: () => archiviereAction(z.id),
      archivieren: () => archiviereAction(z.id),
      wiederherstellen: () => stelleWiederHerAction(z.id),
    };
    …
    const text = {
      vorlage: `Vorlage „${z.titel}“ angelegt — sie steht unter „Vorlagen“.`,
      vorlageArchivieren: `Vorlage „${z.titel}“ archiviert.`,
      archivieren: `„${z.titel}“ archiviert.`,
      wiederherstellen: z.vorlage ? `„${z.titel}“ wiederhergestellt — sie steht wieder unter „Vorlagen“.` : `„${z.titel}“ wiederhergestellt.`,
    }[a];
    setHinweis({ text, zurueck: a === "archivieren" || a === "vorlageArchivieren" ? z.id : undefined, oeffnen: neueVorlage, fokus: true });
```

und in der Spalte „Kennzeichen":

```tsx
      <span className="kp-chips">
        {z.lesbar ? null : <span className="kp-chip kp-chip-hinweis">nicht lesbar</span>}
        {liste === "archiv" && z.vorlage ? <span className="kp-chip">Vorlage</span> : null}
      </span>
```

e2e `kommplan-verwaltung.spec.ts`, Test „Vorlage: …" — umbenennen in „Vorlage: als Kopie speichern, Neu aus Vorlage übernimmt den Inhalt, Vorlage archivieren" und anpassen:

```ts
  const v = page.waitForResponse((r) => istAktion(r) && rumpf(r) === JSON.stringify([id]));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Als Vorlage speichern" }));
  expect((await v).status()).toBe(200);
  await expect(page.locator(".kp-listenhinweis")).toContainText(`Vorlage „${titel}“ angelegt`);
  await expect(page.locator(".kp-listenhinweis").getByRole("link", { name: "Vorlage öffnen" })).toHaveAttribute("href", /\/p\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("table", { name: "Vorlagen" }).getByRole("link", { name: titel, exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Pläne" }).getByRole("link", { name: titel, exact: true })).toBeVisible(); // der Plan bleibt
```

(`id` aus `const id = await neuerPlan(page, titel);` — die bisherige Zeile `await neuerPlan(page, titel);` entsprechend fassen.) Der Abschnitt „Neu aus Vorlage" bleibt. Der Schluss:

```ts
  // Vorlage archivieren: die Vorlage geht ins Archiv, der Plan bleibt unter „Pläne“
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Vorlagen" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  const keine = page.waitForResponse((r) => istAktion(r));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Vorlage archivieren" }));
  expect((await keine).status()).toBe(200);
  await expect(page.locator(".kp-listenhinweis")).toContainText(`Vorlage „${titel}“ archiviert.`);
  await expect(page.getByRole("table", { name: "Vorlagen" }).getByRole("link", { name: titel, exact: true })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Pläne" }).getByRole("link", { name: titel, exact: true })).toBeVisible();
  await page.goto(url("/archiv"));
  await warteAufSpaltenaufteilung(page);
  await expect(page.getByRole("table", { name: "Archivierte Pläne" }).getByRole("row").filter({ hasText: titel }).locator(".kp-chip")).toHaveText("Vorlage");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/m/kommplan src/core/audit` und `pnpm exec playwright test e2e/kommplan-verwaltung.spec.ts -g "Vorlage"; git checkout -- next-env.d.ts`
Expected: PASS. `git grep -n "setzeVorlage\|Keine Vorlage mehr\|keineVorlage" -- src e2e` liefert nichts mehr (Prüfschritt, Kritik: sonst bleibt ein Aufruf in `planverwaltung.test.ts` stehen, und `pnpm typecheck` wird rot).

- [ ] **Step 5: Commit**

```bash
pnpm typecheck; echo "exit $?"
pnpm build; echo "build exit $?"
git grep -n "planverwaltung.ts:[0-9]\|verwaltung.ts:[0-9]\|PlanTabelle.tsx:[0-9]\|coverage-manifest.json:[0-9]\|kommplan-verwaltung.spec.ts:[0-9]" -- src scripts e2e docs
git add src/app/m/kommplan src/core/audit/coverage-manifest.json e2e/kommplan-verwaltung.spec.ts
git commit -S -m "feat(kommplan): Als Vorlage speichern legt eine Kopie an

Der Ausgangsplan bleibt unter „Pläne“; die Vorlage ist eine Kopie ohne
Datum, der Hinweis bietet „Vorlage öffnen“. In der Vorlagenliste heißt
der Punkt „Vorlage archivieren“ (wiederherstellbar). Ändert
Phase-4-Entscheidung 7.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Spec nachziehen und die endgültige Release-Notiz

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§6.1, §6.2, §6.7, §8.1, §8.2, §8.3)
- Modify: `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts`

**Interfaces:** keine Code-Schnittstellen.

- [ ] **Step 1: Ankerschritt vor dem Ändern**

```bash
git grep -n "modul-kommunikationsplaene-design.md:[0-9]" -- src scripts e2e docs
pnpm anker:drift docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md
```

Jeder Treffer, der hinter einer Änderungsstelle liegt, wird in derselben Zeile in die Namensform („Spec §8.2") umgeschrieben. Die Spec selbst **hält ihre Zeilenzahl, wo es geht**: Sätze werden ersetzt, nicht Absätze eingefügt; wo eine neue Zeile nötig ist, am Ende des betroffenen Abschnitts.

- [ ] **Step 2: Spec ändern (Edit-Werkzeug, Wortlaut wie folgt)**

- §6.1, Tabellenzeile `/m/kommplan/t/[token]`: Inhalt „Token-Ansicht (§8)" → „Token-Ansicht (§8.2); Druck unter `…/druck/a4` und `…/druck/a3`".
- §6.2, Satz „Kopfleiste: Titel, Umschalter **Diagramm | Gliederung**, Rückgängig/Wiederholen, Drucken, Teilen," → „Kopfleiste: Titel, Umschalter **Diagramm | Gliederung**, Rückgängig/Wiederholen, Teilen, Drucken (A4 quer; über den Pfeil A3 quer und SVG-Dateien),".
- §6.7 — der Satzteil läuft über **zwei** Zeilen (Kritik; Zeilenende nach „setzt"). Suchtext für das Edit-Werkzeug, genau so:

  ```
  „Als Vorlage speichern" setzt
  `ist_vorlage` am Plan (er steht dann unter „Vorlagen"; „Keine Vorlage mehr" nimmt es zurück); „Neu aus Vorlage" legt eine Kopie an.
  ```

  ersetzen durch — wieder mit dem Umbruch nach dem ersten Satzteil, damit die Spec ihre Zeilenzahl behält (Kommentaranker, Regel 4):

  ```
  „Als Vorlage speichern" legt
  eine Kopie als Vorlage an (Titel gleich, ohne Datum; der Plan bleibt unter „Pläne"); „Vorlage archivieren" archiviert sie; „Neu aus Vorlage" legt eine Kopie an.
  ```

- §8.3 — ebenfalls zweizeilig (Zeilenende nach „macht"): „Ein archivierter Plan macht⏎seine Token-Links sofort ungültig." → „Ein archivierter Plan macht⏎seine Token-Links sofort ungültig: Archivieren widerruft sie, Wiederherstellen erweckt keinen wieder." (der Umbruch bleibt an derselben Stelle).
- §8.1, Punkt „Option Schwarzweiß (`PRINT_MONOCHROME_THEME`)." → „Option Schwarzweiß (`PRINT_MONOCHROME_THEME` als zweites Rezept-Generat): gilt für Ausdruck und SVG-Datei, am Bildschirm bleibt der Plan farbig."
- §8.1, Punkt „„SVG herunterladen" je Seite." → „„SVG herunterladen" je Blatt auf den internen Druckseiten: eigenständige Datei mit Symbolen, Logo und Arimo als `@font-face`; Dateiname aus Titel, Datum, Blatt und Format in ASCII."
- §8.2, Punkt „Je Abruf `zuletzt_abgerufen` und `abrufe`. Ausstellen und Widerrufen gehen ins Audit-Log." → „Je Abruf `zuletzt_abgerufen` und `abrufe` (dieselbe Adresse und derselbe Link zählen binnen einer Minute einmal). Ausstellen und Widerrufen gehen ins Audit-Log. Dreißig Fehlversuche je Minute und Adresse sperren die Adresse (404 ohne Datenbankabfrage). `X-Robots-Tag`, `Referrer-Policy: no-referrer` und `Cache-Control: no-store` setzt der Proxy."
- §8.2, Punkt „**QR auf dem Ausdruck** (Option): hat der Plan einen gültigen Link, trägt der Druck unten rechts einen QR-Code „aktuelle Fassung" (`qrcode` ist bereits Abhängigkeit)." → „**QR auf dem Ausdruck** (Option): hat der Plan einen gültigen Link, trägt jedes Blatt unten rechts einen QR-Code „Aktuelle Fassung" (24 mm) — intern auf den Link mit dem spätesten Ablauf (unbegrenzt zuerst), im Token-Druck immer auf den benutzten Link; Plan-Flyin, Teilen-Flyin und Druckseite sagen, auf welchen Link und wie lange. Basis ist die Adresse des Moduls aus der Suite-Konfiguration."

- [ ] **Step 3: Release-Notiz ersetzen und zählen**

Datei `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts` — `titel` und `inhalt` ersetzen (Kopf, `modul`, `slug`, `datum` bleiben; den Rollout-Tag setzt der Hauptlauf):

```ts
  titel: "Kommunikationspläne ansehen, erstellen, drucken und teilen",
  inhalt: [
    absatz(
      "Unter „Kommunikationspläne“ siehst du Pläne und Fernmeldeskizzen als Diagramm und druckst sie über „Drucken“ in A4 oder A3. " +
        "Mit Bearbeitungsrecht legst du über „Neu“ einen Plan an, baust ihn in Diagramm oder „Gliederung“ auf " +
        "und gibst ihn über „Teilen“ als Link weiter, der ohne Anmeldung den aktuellen Stand zeigt.",
    ),
  ],
```

(Kritik: zuerst der Einstieg für **alle** Empfänger der Notiz — die Zugangsgruppe bekommt sie laut Kopfzeile der Datei mit —, dann Bearbeitende samt „Neu". „Kommunikationspläne" ist der Name im App-Umschalter (`registry.ts`, `title`), „Neu" der Knopf der Planliste (`NeuerPlan.tsx`). „Aus Bibliothek" fällt dafür heraus — Bibliothek und Vorlagen stehen in den Menüs, die Notiz nennt die Wege, die man suchen würde.)

Länge prüfen (Grenze 320 je Block, ein Absatz, zwei Sätze; Titel gegen `NOTIZ_GRENZEN.zeichenImTitel`):

```bash
node -e 'const t="Unter „Kommunikationspläne“ siehst du Pläne und Fernmeldeskizzen als Diagramm und druckst sie über „Drucken“ in A4 oder A3. Mit Bearbeitungsrecht legst du über „Neu“ einen Plan an, baust ihn in Diagramm oder „Gliederung“ auf und gibst ihn über „Teilen“ als Link weiter, der ohne Anmeldung den aktuellen Stand zeigt."; console.log(t.length)'
```

Expected: `315`.

- [ ] **Step 4: Tests**

Run: `pnpm vitest run src/app/m/portal/_lib/neuigkeiten src/core/kommentaranker.test.ts`
Expected: PASS (Grenzen, Werbewörter, kein Markdown; alle Zeilenanker zeigen auf existierende Zeilen). Jeder Name in Anführungszeichen steht so am Bildschirm: „Kommunikationspläne" (App-Umschalter), „Drucken" (Hauptknopf), „Neu" (Planliste), „Gliederung" (Umschalter), „Teilen" (Kopfleiste) — gegenlesen in Task 16.

- [ ] **Step 5: Commit**

```bash
pnpm anker:neu; echo "anker exit $?"
git add docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts
git commit -S -m "docs: Spec und Release-Notiz der Kommunikationspläne nach Phase 5

Token-Links, A3, Schwarzweiß, SVG-Datei, QR, Vorlage als Kopie und
Archivieren widerruft in der Spec; die Notiz ist jetzt die eine Notiz
des Moduls, zuerst für alle, dann für Bearbeitende.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: End-to-End — Teilen, Token-Ansicht, 404, Schranke, QR, Schwarzweiß, SVG

**Files:**
- Create: `e2e/kommplan-teilen.spec.ts`
- Modify: `e2e/gruppen.json` (neue Spec in **eimer-1**, die Gruppe mit `kommplan-bibliothek.spec.ts`)

**Interfaces:**
- Consumes: alles aus Tasks 1–13; Helfer aus `e2e/kommplan-hilfen.ts` (`HOST`, `url`, `ADMIN`, `istAktion`, `rumpf`, `istSpeichern`, `neuerPlan`, `ersteStelle`, `speichertNach`) und `e2e/fixtures.ts` (`devLogin`, `klickeWennRuhig`, `warteAufGestreamteInhalte`, `warteAufSpaltenaufteilung`).
- Produces: e2e-Abdeckung der Review-Focus-Punkte 1–4, 6, 7, 8 am echten Abruf.

Regeln für diese Spec (Falle 10, 21, 22; Global Constraints): jede ausgelöste Action per `waitForResponse`; Köpfe, PDF und Download zusätzlich gegen den gebauten Stand (`pnpm e2e:gebaut`); jeder anonyme Kontext mit **eigener** `cf-connecting-ip` `ip(n)` aus `2001:db8:<LAUF>::/48` — je Test und je Versuch verschieden (Global Constraints); `window.print` in jedem Kontext per `addInitScript` stillgelegt; nie an einem Seed-Plan tippen oder ihn umstellen (eigene Pläne oder ein Duplikat).

- [ ] **Step 1: Write the spec**

```ts
// e2e/kommplan-teilen.spec.ts
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { devLogin, klickeWennRuhig, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";
import { ADMIN, ersteStelle, istAktion, istSpeichern, neuerPlan, rumpf, url } from "./kommplan-hilfen";

/**
 * Kommunikationspläne, Phase 5: Token-Links (Spec §8.2), Druck A3, QR, Schwarzweiß, SVG-Datei. Die anonymen
 * Kontexte tragen je eine eigene `cf-connecting-ip` — die Fehlversuchs-Schranke lebt im Prozessspeicher des
 * einen Servers dieser Gruppe, und ohne Kopf teilten sich alle den Eimer "unknown" (Umsetzungsplan Phase 5,
 * Entscheidung 5).
 */
const neu = () => Math.random().toString(36).slice(2, 7);
/**
 * Absenderadressen der anonymen Kontexte: IPv6-Dokumentationsnetz (RFC 3849), `LAUF` je Laden dieser Datei neu —
 * ein CI-Wiederholungslauf (neuer Worker) und ein zweiter lokaler Lauf gegen einen wiederverwendeten Server treffen
 * so nie die Fehlversuche eines früheren Versuchs (Kritik).
 */
const LAUF = randomBytes(2).toString("hex");
const ip = (n: number) => `2001:db8:${LAUF}::${n}`;
const TOKEN_URL = new RegExp(`^${url("/t/").replace(/[.]/g, "\\.")}[A-Za-z0-9_-]{43}$`);

async function anonym(browser: Browser, ip: string): Promise<Page> {
  const kontext = await browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": ip } });
  await kontext.addInitScript(() => { window.print = () => {}; });
  return kontext.newPage();
}
async function oeffneTeilen(page: Page) {
  await klickeWennRuhig(page.getByRole("button", { name: "Teilen", exact: true }));
  const flyin = page.locator(".kp-flyin").filter({ has: page.getByText("Neuen Link ausstellen") });
  await expect(flyin).toBeVisible();
  await expect(flyin.getByLabel("Notiz (wofür, für wen)")).toBeFocused(); // Anfangsfokus (Entscheidung 17)
  return flyin;
}
async function stelleAus(page: Page, dauer: "24 Stunden" | "7 Tage" | "30 Tage" | "Unbegrenzt", notiz: string): Promise<string> {
  const flyin = page.locator(".kp-flyin").filter({ has: page.getByText("Neuen Link ausstellen") });
  await klickeWennRuhig(flyin.getByText(dauer, { exact: true }));
  await flyin.getByLabel("Notiz (wofür, für wen)").fill(notiz);
  const aus = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes(`"notiz":"${notiz}"`));
  await klickeWennRuhig(flyin.getByRole("button", { name: "Link ausstellen" }));
  expect((await aus).status()).toBe(200);
  const eintrag = flyin.locator("[data-freigabe][data-neu]");
  await expect(eintrag).toContainText(notiz);
  const link = (await eintrag.locator("[data-link]").textContent())!;
  expect(link).toMatch(TOKEN_URL);
  return link;
}
async function archiviereUeberListe(page: Page, titel: string) {
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  const weg = page.waitForResponse((r) => istAktion(r));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Archivieren" }));
  expect((await weg).status()).toBe(200);
}
async function setzeOption(page: Page, option: "qrAufDruck" | "schwarzweiss") {
  await klickeWennRuhig(page.getByRole("button", { name: "Plan und Verbindungen" }));
  const gespeichert = page.waitForResponse(istSpeichern);
  await klickeWennRuhig(page.locator(`.kp-flyin [data-option="${option}"]`));
  expect((await gespeichert).status()).toBe(200);
}

test("Teilen: ausstellen, kopieren, anonym ansehen und drucken, Abrufe zählen, widerrufen → 404", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  const titel = `e2e Teilen ${neu()}`;
  const id = await neuerPlan(page, titel);
  await ersteStelle(page, "EL Teilen");
  await page.keyboard.press("Escape");
  const flyin = await oeffneTeilen(page);
  await expect(flyin.locator('input[type="radio"][value="7d"]')).toBeChecked(); // Vorgabe
  const link = await stelleAus(page, "7 Tage", "Leitstelle");
  await expect(flyin.locator("[data-freigabe][data-neu]")).toContainText("gültig bis");
  await expect(flyin.locator("[data-freigabe][data-neu]").getByRole("button", { name: "Link kopieren" })).toBeFocused();
  await page.keyboard.press("Enter"); // Tastaturweg (Review Focus 8): der Fokus steht schon am Knopf
  // http ist kein sicherer Kontext: der Rückfall kopiert oder zeigt den Link markiert — nie ein stiller Fehlschlag (Review Focus 3)
  await expect(flyin.getByRole("status")).toHaveText(/^(Link kopiert\.|Kopieren ging hier nicht von selbst.*)$/);
  // die sichtbare Antwort steht am Eintrag: „Kopiert“ oder das markierte Lesefeld
  await expect(flyin.locator("[data-freigabe][data-neu]").locator('input[data-manuell], button:has-text("Kopiert")')).toHaveCount(1);

  const seite = await anonym(browser, ip(11));
  const antwort = (await seite.goto(link))!;
  expect(antwort.status()).toBe(200);
  const koepfe = antwort.headers();
  expect(koepfe["x-robots-tag"]).toContain("noindex");
  expect(koepfe["referrer-policy"]).toBe("no-referrer");
  expect(koepfe["cache-control"]).toContain("no-store");
  expect(await antwort.text(), "keine Plan-ID in HTML oder Flight-Daten (Review Focus 4)").not.toContain(id);
  await warteAufGestreamteInhalte(seite);
  await expect(seite.getByRole("heading", { level: 1 })).toHaveText(titel);
  await expect(seite.locator("[data-token-stand]")).toHaveText(/^Stand \d\d\.\d\d\.\d{4}, \d\d:\d\d · Bearbeitung: /);
  await expect(seite.locator("[data-vermerk]")).toHaveText("VS – nur für den Dienstgebrauch");
  await expect(seite.locator(".kp-betrachter [data-karte]")).toHaveCount(1);
  await expect(seite.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(seite.getByRole("button", { name: "Teilen" })).toHaveCount(0);
  await expect(seite.getByRole("link", { name: /Alle Pläne/ })).toHaveCount(0); // keine Wege ins Innere
  await expect(seite.locator(".kp-token-kicker")).toContainText("KOMMUNIKATIONSPLÄNE");
  await expect(seite).toHaveTitle("Kommunikationspläne"); // typneutral, kein Plantitel

  // immer der aktuelle Stand (Spec §8.2): eine Änderung im Editor steht nach dem Neuladen in der Token-Ansicht
  await page.keyboard.press("Escape"); // Teilen-Flyin zu
  await klickeWennRuhig(page.getByRole("button", { name: "Plan und Verbindungen" }));
  const titelFeld = page.locator(".kp-flyin").getByLabel("Titel", { exact: true });
  const angaben = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes(`${titel} neu`));
  await titelFeld.fill(`${titel} neu`);
  await titelFeld.press("Enter");
  expect((await angaben).status()).toBe(200);
  await page.keyboard.press("Escape");
  expect((await seite.goto(link))?.status()).toBe(200);
  await warteAufGestreamteInhalte(seite);
  await expect(seite.getByRole("heading", { level: 1 })).toHaveText(`${titel} neu`);

  // Druck aus der Token-Ansicht: A3 quer, eigene Seitengröße
  const druck = (await seite.goto(`${link}/druck/a3`))!;
  expect(druck.status()).toBe(200);
  expect(druck.headers()["x-robots-tag"]).toContain("noindex");
  expect(await druck.text()).not.toContain(id);
  await warteAufGestreamteInhalte(seite);
  await expect(seite.locator("main.kp-druck")).toHaveAttribute("data-format", "a3-quer");
  await expect(seite.getByRole("button", { name: /SVG herunterladen/ })).toHaveCount(0); // nur intern (Entscheidung 15)
  const pdf = await PDFDocument.load(await seite.pdf({ preferCSSPageSize: true }));
  expect(pdf.getPage(0).getSize().width).toBeCloseTo(1190.55, 0);

  // Abrufe: im Flyin nach Neuladen sichtbar (≥ 1 — dieselbe Adresse zählt binnen einer Minute einmal)
  await page.reload();
  await warteAufSpaltenaufteilung(page);
  const wieder = await oeffneTeilen(page);
  await expect(wieder.locator("[data-freigabe]").first()).toContainText(/\d+ Abrufe?, zuletzt/);

  // Widerrufen → die nächste Anfrage ist 404 (Review Focus 7)
  await klickeWennRuhig(wieder.locator("[data-freigabe]").first().getByRole("button", { name: "Widerrufen" }));
  const weg = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"freigabeId"'));
  await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Widerrufen" }));
  expect((await weg).status()).toBe(200);
  await expect(wieder.getByRole("status")).toHaveText("Link widerrufen. Wer ihn hat, sieht den Plan nicht mehr.");
  await expect(wieder.locator("[data-gueltige] legend")).toBeFocused(); // der letzte gültige Link ist weg (Entscheidung 17)
  expect((await seite.goto(link))?.status()).toBe(404);
  expect((await seite.goto(`${link}/druck/a4`))?.status()).toBe(404);
  await seite.context().close();
});

test("404 ist ununterscheidbar: unbekannt, falsch geformt, widerrufen, archiviert (Review Focus 2)", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  const titelW = `e2e Widerruf ${neu()}`;
  await neuerPlan(page, titelW);
  await oeffneTeilen(page);
  const widerrufen = await stelleAus(page, "24 Stunden", "weg");
  const flyin = page.locator(".kp-flyin").filter({ has: page.getByText("Neuen Link ausstellen") });
  await klickeWennRuhig(flyin.locator("[data-freigabe]").first().getByRole("button", { name: "Widerrufen" }));
  const w = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"freigabeId"'));
  await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Widerrufen" }));
  expect((await w).status()).toBe(200);
  const titelA = `e2e Archiv-Link ${neu()}`;
  const idA = await neuerPlan(page, titelA);
  await oeffneTeilen(page);
  const archiviert = await stelleAus(page, "Unbegrenzt", "archiv");
  await archiviereUeberListe(page, titelA);

  const seite = await anonym(browser, ip(22));
  const faelle = { unbekannt: url(`/t/${"Q".repeat(43)}`), falsch: url("/t/kurz"), widerrufen, archiviert };
  const texte: string[] = [];
  const htmls: string[] = [];
  for (const [fall, ziel] of Object.entries(faelle)) {
    const r = (await seite.goto(ziel))!;
    expect(r.status(), fall).toBe(404);
    expect(r.headers()["x-robots-tag"], fall).toContain("noindex");
    expect(r.headers()["referrer-policy"], fall).toBe("no-referrer");
    const html = await r.text();
    for (const geheim of [titelW, titelA, idA, "Musterorganisation"]) expect(html, `${fall}: ${geheim}`).not.toContain(geheim);
    await expect(seite.getByRole("heading", { level: 1 }), fall).toHaveText("Dieser Link gilt nicht (mehr)."); // t/not-found.tsx, nicht die Suite-404
    expect(await seite.locator('a[href="/"], a[href$="/login"]').count(), `${fall}: kein Weg zur Anmeldung`).toBe(0);
    const token = new URL(ziel).pathname.split("/").pop()!;
    texte.push((await seite.locator("body").innerText()).replaceAll(token, "<T>"));
    htmls.push(html.replaceAll(token, "<T>"));
  }
  expect(new Set(texte).size, "alle vier 404 sehen gleich aus").toBe(1);
  // Auch der Quelltext unterscheidet die Fälle nicht: nach dem Ersetzen des Tokens gleich lang (eine Längendifferenz
  // wäre ein Orakel). Setzt Next je Antwort eigene IDs oder Nonces und bricht DAS die Gleichheit, ist das ein Befund
  // in „Abweichungen" — dann den Vergleich auf die Differenz dieser Stellen beschränken, nie ganz streichen.
  expect(new Set(htmls.map((h) => h.length)).size, "404-Antworten gleich lang nach Ersetzen des Tokens").toBe(1);
  await seite.context().close();
});

test("Fehlversuchs-Schranke: 29 Fehlversuche sperren nicht (Layout und Seite buchen einmal), der dreißigste sperrt die Adresse — nur sie", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, `e2e Schranke ${neu()}`);
  await oeffneTeilen(page);
  const link = await stelleAus(page, "7 Tage", "schranke");
  const rater = await anonym(browser, ip(33));
  // `request.get` statt `goto`: rendert Layout UND Seite ebenso (sonst prüfte der Test die Doppelbuchung nicht), ist
  // aber schnell genug, dass 29 Abrufe unter Last im gleitenden 60-s-Fenster bleiben (Entscheidung 5). Der Kopf
  // `cf-connecting-ip` kommt aus den extraHTTPHeaders des Kontexts; hier zur Sicherheit noch einmal ausdrücklich.
  const kopf = { headers: { "cf-connecting-ip": ip(33) } };
  for (let i = 0; i < 29; i++) expect((await rater.request.get(url(`/t/${"R".repeat(41)}${String(i).padStart(2, "0")}`), kopf)).status()).toBe(404);
  expect((await rater.goto(link))?.status(), "nach 29 Fehlversuchen noch offen — sonst bucht die Anfrage doppelt").toBe(200);
  expect((await rater.request.get(url(`/t/${"R".repeat(42)}X`), kopf)).status()).toBe(404);
  expect((await rater.goto(link))?.status(), "nach dem dreißigsten gesperrt, auch für einen gültigen Link").toBe(404);
  const andere = await anonym(browser, ip(34));
  expect((await andere.goto(link))?.status()).toBe(200);
  await rater.context().close();
  await andere.context().close();
});

test("QR „Aktuelle Fassung“: ohne Link Hinweis und kein QR; intern der unbegrenzte Link; im Token-Druck der benutzte (Review Focus 1)", async ({ page, browser, context }) => {
  test.setTimeout(150_000);
  await context.addInitScript(() => { window.print = () => {}; });
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  const id = await neuerPlan(page, `e2e QR ${neu()}`);
  await ersteStelle(page, "EL QR");
  await page.keyboard.press("Escape");
  await setzeOption(page, "qrAufDruck");
  await expect(page.locator(".kp-flyin [data-qr-hinweis]")).toContainText("Ohne gültigen Link druckt der Plan keinen QR-Code.");
  await page.keyboard.press("Escape");
  await page.goto(url(`/p/${id}/druck/a4`));
  await warteAufGestreamteInhalte(page);
  await expect(page.locator("svg.kp-blatt")).not.toHaveCount(0);
  await expect(page.locator("[data-qr]")).toHaveCount(0);
  await expect(page.locator("[data-qr-satz]")).toHaveCount(0);

  // „Link ausstellen“ im Hinweis führt direkt ins Flyin „Teilen“ (Entscheidung 10)
  await page.goto(url(`/p/${id}`));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Plan und Verbindungen" }));
  await klickeWennRuhig(page.locator(".kp-flyin [data-qr-hinweis]").getByRole("button", { name: "Link ausstellen" }));
  const teilen = page.locator(".kp-flyin").filter({ has: page.getByText("Neuen Link ausstellen") });
  await expect(teilen).toBeVisible();
  const kurz = await stelleAus(page, "24 Stunden", "kurz");
  await expect(teilen.locator("[data-qr-ziel-satz]")).toContainText("„kurz“ – gültig bis"); // befristet: mit Warnung
  await expect(teilen.locator("[data-qr-ziel-satz]")).toContainText("danach führt der Ausdruck ins Leere");
  const lang = await stelleAus(page, "Unbegrenzt", "lang");
  await expect(teilen.locator("[data-qr-ziel-satz]")).toHaveText("Der QR-Code führt auf „lang“ – unbegrenzt gültig.");
  await page.goto(url(`/p/${id}/druck/a4`));
  await warteAufGestreamteInhalte(page);
  const blaetter = await page.locator("svg.kp-blatt").count();
  await expect(page.locator("[data-qr]")).toHaveCount(blaetter);
  for (const z of await page.locator("[data-qr]").all()) expect(await z.getAttribute("data-qr-ziel")).toBe(lang);
  await expect(page.locator("[data-qr-satz]")).toHaveText("Der QR-Code führt auf „lang“ – unbegrenzt gültig.");

  const seite = await anonym(browser, ip(44));
  expect((await seite.goto(`${kurz}/druck/a4`))?.status()).toBe(200);
  await warteAufGestreamteInhalte(seite);
  for (const z of await seite.locator("[data-qr]").all()) expect(await z.getAttribute("data-qr-ziel"), "nie der bessere Link").toBe(kurz);
  await seite.context().close();
});

test("Schwarzweiß und SVG herunterladen: graue Symbole im Druck, eigenständige Datei mit ASCII-Namen, SVG-Weg ohne Druckdialog (Review Focus 6, 8)", async ({ page, context }) => {
  test.setTimeout(150_000);
  await context.addInitScript(() => {
    (window as unknown as { gedruckt: number }).gedruckt = 0;
    window.print = () => { (window as unknown as { gedruckt: number }).gedruckt++; };
  });
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  // ein Duplikat der Seed-Vorlage OpenR (Zeichen in Farbe) — nie den Seed-Plan selbst umstellen
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: "Aktionen für Kommunikationsplan OpenR 01.07.2022", exact: true })); // exakt: Duplikate anderer Läufe tragen ein neues Datum
  const kopie = page.waitForResponse((r) => istAktion(r) && rumpf(r) === JSON.stringify(["beispiel-openr-2022-07-01"]));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Duplizieren" }));
  expect((await kopie).status()).toBe(200);
  await page.waitForURL(/\/p\/[0-9a-f-]{36}\?kopie=/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await warteAufSpaltenaufteilung(page);
  await setzeOption(page, "schwarzweiss");
  await page.keyboard.press("Escape");
  // der SVG-Weg aus dem Druckmenü: neues Fenster mit ?export=svg, KEIN Druckdialog (Entscheidung 15)
  const fenster = page.waitForEvent("popup");
  await klickeWennRuhig(page.getByRole("button", { name: "Weitere Druckformate" }));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "SVG – A4 quer" }));
  const druck = await fenster;
  await druck.waitForURL(/\/druck\/a4\?export=svg$/);
  await warteAufGestreamteInhalte(druck);
  await druck.evaluate(() => document.fonts.ready);
  expect(await druck.evaluate(() => (window as unknown as { gedruckt: number }).gedruckt), "kein window.print() auf dem SVG-Weg").toBe(0);
  await expect(druck.locator("svg.kp-blatt").first()).toHaveAttribute("data-sw", "");
  const bunt = await druck.locator("svg.kp-symbole").evaluate((s) => [...s.innerHTML.matchAll(/#([0-9a-f]{6})\b/gi)]
    .map((m) => m[1].toLowerCase()).filter((h) => !(h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6))));
  expect(bunt).toEqual([]);

  const runter = druck.waitForEvent("download");
  await klickeWennRuhig(druck.getByRole("button", { name: /^SVG herunterladen \(Blatt 1 von \d+\)$/ }));
  const datei = await runter;
  expect(datei.suggestedFilename()).toMatch(/^[A-Za-z0-9-]+_\d{4}-\d{2}-\d{2}_blatt-1-von-\d+_a4\.svg$/);
  const text = readFileSync((await datei.path())!, "utf8");
  expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(text).toContain("@font-face");
  expect(text).toContain("<symbol");
  const ids = new Set([...text.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const verweise = [...text.matchAll(/(?:\bhref|xlink:href)="#([^"]+)"|url\(#([^)"']+)\)/g)].map((m) => m[1] ?? m[2]);
  expect(verweise.length).toBeGreaterThan(0);
  for (const v of verweise) expect(ids.has(v), `#${v} löst in der Datei auf`).toBe(true);
  // wohlgeformt — sonst öffnet die Datei nirgends, und alle Prüfungen darüber wären trotzdem grün
  expect(await druck.evaluate((t) => new DOMParser().parseFromString(t, "image/svg+xml").querySelector("parsererror") === null, text)).toBe(true);
  // der normale Druck ruft den Dialog weiter von selbst
  await page.goto(url(`/p/${id}/druck/a4`));
  await warteAufGestreamteInhalte(page);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => (window as unknown as { gedruckt: number }).gedruckt)).toBe(1);
  await druck.close();
});
```

`e2e/gruppen.json`: in `eimer-1` an `specs` anhängen: ` e2e/kommplan-teilen.spec.ts`.

- [ ] **Step 2: Run against dev**

```bash
uptime
pnpm exec playwright test e2e/kommplan-teilen.spec.ts; echo "exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
```

Expected: 5 passed. Rot bei hoher Last: Datei einzeln oder Schritt 3.

- [ ] **Step 3: Run against the built stand (CI-Weg, Köpfe/PDF/Download, Falle 21)**

```bash
pnpm e2e:gebaut e2e/kommplan-teilen.spec.ts e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts e2e/kommplan-verwaltung.spec.ts; echo "exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
pnpm vitest run scripts/e2e-gruppen.test.ts
```

Expected: alle grün; `e2e-gruppen.test.ts` grün (jede Spec in genau einer Gruppe). Liefert `cache-control` gegen den gebauten Stand **kein** `no-store`, ist das ein Befund für Entscheidung 7 (Next überschreibt den Proxy-Kopf) — eintragen, nicht die Zusicherung lockern. Zeigt der gebaute Stand für einen der 404-Fälle die Suite-404 statt „Dieser Link gilt nicht (mehr).", fängt `t/not-found.tsx` das Layout-`notFound()` nicht (Entscheidung 4) — Befund, nicht die Zusicherung lockern.

- [ ] **Step 4: Commit**

```bash
git add e2e/kommplan-teilen.spec.ts e2e/gruppen.json
git commit -S -m "test(kommplan): e2e für Token-Links, 404, Schranke, QR, Schwarzweiß und SVG

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Sichtprüfung — Fotos hell und dunkel auf drei Breiten, Befunde beheben

**Files:**
- Modify: `e2e/kommplan-teilen.spec.ts` (Fototest)
- Modify (nur bei Befund): die betroffenen Dateien aus Tasks 5, 8–13

**Interfaces:**
- Produces: Fotos unter `/private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase5-shots/`, Befundliste, je Befund ein `fix(kommplan): …`-Commit.

- [ ] **Step 1: Fototest schreiben**

An `e2e/kommplan-teilen.spec.ts` anhängen (Muster: Fototest in `e2e/kommplan-editor.spec.ts` — Thema über das Cookie `iuk-theme-pref`, nie `emulateMedia({ colorScheme })`; ohne `KOMMPLAN_FOTOS` nur die Telefonbreite, ohne Fotos, als Zusicherung „kein waagerechter Überlauf"):

```ts
import { mkdirSync } from "node:fs"; // in die vorhandene node:fs-Importzeile aufnehmen

const BREITEN = [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "telefon", width: 390, height: 844 }] as const;
const FOTOS = process.env.KOMMPLAN_FOTOS;
/** Höhe der Editor-Kopfleiste bei 390 × 844 im Stand vor Phase 5 — gemessen in Task 5 (Kritik: „Teilen" darf sie nicht wachsen lassen). */
const KOPFLEISTE_TELEFON_VORHER = 0; // ← Messwert aus Task 5 eintragen; 0 lässt den Test absichtlich rot

test("Bildschirmfotos Phase 5: Teilen, Plan-Optionen, Druckmenü, Token-Ansicht und 404 — hell und dunkel, drei Breiten", async ({ page, browser, context }, testInfo) => {
  test.setTimeout(FOTOS ? 300_000 : 120_000);
  const ordner = FOTOS ?? testInfo.outputPath("fotos");
  if (FOTOS) mkdirSync(ordner, { recursive: true });
  await context.addInitScript(() => { window.print = () => {}; });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  const id = await neuerPlan(page, `e2e Fotos Teilen ${neu()}`);
  await ersteStelle(page, "Einsatzleitung");
  await page.keyboard.press("Escape");
  await oeffneTeilen(page);
  const link = await stelleAus(page, "7 Tage", "Leitstelle Nord — Lagekarte im Führungsraum");
  await stelleAus(page, "Unbegrenzt", "Aushang");
  await page.keyboard.press("Escape");
  const anon = await anonym(browser, ip(55));
  const foto = async (p: Page, name: string) => { if (FOTOS) await p.screenshot({ path: `${ordner}/${name}.png`, animations: "disabled" }); };
  const ohneUeberlauf = async (p: Page) =>
    expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // Token-Ansicht: keine senkrechte Seitenrolle — sonst schiebt jedes Wischen auf dem Betrachter das Diagramm statt der Seite (Entscheidung 8)
  const ohneSeitenrolle = async (p: Page) =>
    expect(await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
  const breiten = FOTOS ? BREITEN : [BREITEN[2]];

  for (const modus of ["light", "dark"] as const) {
    await context.addCookies([{ name: "iuk-theme-pref", value: modus, url: url("/") }]);
    await anon.context().addCookies([{ name: "iuk-theme-pref", value: modus, url: url("/") }]);
    for (const b of breiten) {
      await page.setViewportSize({ width: b.width, height: b.height });
      await anon.setViewportSize({ width: b.width, height: b.height });
      const n = `${b.name}-${modus}`;
      await page.goto(url(`/p/${id}?ansicht=diagramm`));
      await warteAufSpaltenaufteilung(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", modus);
      if (b.name === "telefon") {
        const hoehe = await page.locator(".kp-kopfwerkzeuge").evaluate((e) => e.getBoundingClientRect().height);
        expect(hoehe, "Kopfleiste am Telefon nicht höher als vor Phase 5").toBeLessThanOrEqual(KOPFLEISTE_TELEFON_VORHER + 0.5);
      }
      await oeffneTeilen(page);
      await ohneUeberlauf(page);
      await foto(page, `teilen-${n}`);
      await page.keyboard.press("Escape");
      await klickeWennRuhig(page.getByRole("button", { name: "Plan und Verbindungen" }));
      await page.locator('.kp-flyin [data-option="qrAufDruck"]').scrollIntoViewIfNeeded();
      await foto(page, `plan-optionen-${n}`);
      await page.keyboard.press("Escape");
      // der Pfeil, nicht „Drucken“: der Hauptknopf druckt sofort A4 quer (Entscheidung 12)
      await klickeWennRuhig(page.getByRole("button", { name: "Weitere Druckformate" }));
      await expect(page.getByRole("menuitem", { name: "A3 quer" })).toBeVisible();
      await foto(page, `druckmenue-${n}`);
      await page.keyboard.press("Escape");

      expect((await anon.goto(link))?.status()).toBe(200);
      await warteAufGestreamteInhalte(anon);
      await expect(anon.locator("html")).toHaveAttribute("data-theme", modus);
      await ohneUeberlauf(anon);
      await ohneSeitenrolle(anon);
      // ohne Hülle gilt 56/72 (README, Falle 4) — auch für die antd-Inseln der Token-Ansicht (Entscheidung 8)
      expect(await anon.getByRole("button", { name: "Drucken", exact: true }).evaluate((e) => e.getBoundingClientRect().height)).toBeCloseTo(56, 0);
      await foto(anon, `token-${n}`);
      if (b.name === "desktop") {
        await anon.getByRole("button", { name: "Drucken", exact: true }).hover();
        await foto(anon, `token-hover-${n}`); // Rot nur als Hover-Rahmen/Text, keine Fläche (Entscheidung 8)
      }
      expect((await anon.goto(url(`/t/${"Z".repeat(43)}`)))?.status()).toBe(404);
      await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Dieser Link gilt nicht (mehr).");
      await foto(anon, `token-404-${n}`);
      if (FOTOS && b.name === "desktop" && modus === "light") {
        await anon.goto(`${link}/druck/a3`);
        await warteAufGestreamteInhalte(anon);
        await foto(anon, "druck-token-a3-desktop-light");
        await page.goto(url(`/p/${id}/druck/a4`));
        await warteAufGestreamteInhalte(page);
        await foto(page, "druck-qr-desktop-light");
      }
    }
  }
  await anon.context().close();
});
```

Dazu einmal von Hand (Playwright-Skript im Scratchpad, **kein** Test der Suite) ein Duplikat von OpenR mit Schwarzweiß drucken und `druck-sw-desktop-light` aufnehmen, und die heruntergeladene SVG-Datei eines Blatts **im Browser allein** öffnen (`file://…`) und als `svg-allein-desktop-light` fotografieren.

```bash
uptime
KOMMPLAN_FOTOS=/private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase5-shots pnpm exec playwright test e2e/kommplan-teilen.spec.ts -g "Bildschirmfotos"; echo "exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
ls /private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase5-shots | wc -l
```

Expected: 30 Fotos aus dem Test (5 Ansichten × 3 Breiten × 2 Modi) plus 2 Hover-Fotos und 2 Druckfotos, plus die zwei von Hand. Außerdem einmal von Hand: die Token-Ansicht eines Plans **mit** und **ohne** Briefkopf bei 1440 × 900 (`token-briefkopf-mit`/`-ohne`) — Kritik zum Kopfraster.

- [ ] **Step 2: Jedes Foto mit Read ansehen**

Prüfliste:
1. **Teilen-Flyin** (`teilen-*`): Abschnitt „Neuen Link ausstellen" oben, der Fokusring in der Notiz; „Gültig für" als vier Knöpfe, am Telefon umbrechend, nie aus dem Bild; Notiz mit Zähler; „Link ausstellen" primär; Liste mit Notiz fett, Ablauf, „ausgestellt … von …", Abrufe, URL klein und umbrechend; „Link kopieren"/„Widerrufen" je 44 px; der neue Link mit Rand in `--kp-auswahl` (dunkel `#7fb0ff`, ≥ 3:1 gegen den Flyin-Grund); der Abschnitt „Ausdruck" mit QR-Schalter und Satz; im Dunkeln lesbar (Kontrast der kleinen URL).
2. **Plan-Optionen** (`plan-optionen-*`): Schalter QR und Schwarzweiß mit Sätzen darunter; bei QR an der Satz „Der QR-Code führt auf „Aushang“ – unbegrenzt gültig." (der Plan hat Links) — einmal ohne Link gegenprüfen: Hinweis mit Knopf „Link ausstellen" (von Hand).
3. **Druckmenü** (`druckmenue-*`): geteilter Knopf „Drucken" | Pfeil, Menü „A4 quer", „A3 quer", Gruppe „SVG-Dateien"; am Telefon „Teilen" und der geteilte Knopf nebeneinander in der letzten Zeile, Tab-Reihenfolge gleich der Lesereihenfolge (einmal per Tastatur durchgehen), die Kopfleiste nicht höher als vorher (Zusicherung im Test), Menü im Bild.
4. **Token-Ansicht** (`token-*`): Fahne 3 px rot, Kicker „KOMMUNIKATIONSPLÄNE" mit „IDA" rechts, links der Block aus Titel, Angaben-, Standzeile und VS-NfD-Vermerk (neutral umrandet, nicht rot), rechts daneben Organisation „Musterorganisation" (am Telefon darunter, Angaben und Stand in einer Zeile), „Drucken" | Pfeil in 56 px; darunter der Betrachter mit Legende, eingepasst, **füllt den Rest der Höhe ohne Seitenrolle** (Zusicherung im Test); kein App-Umschalter, keine Suite-Kopfzeile; dunkel: Grund dunkel, Zeichnung weißes Papier. `token-hover-*`: Rot nur als Rahmen/Text des gehoverten Knopfs, keine rote Fläche. `token-briefkopf-mit`/`-ohne`: keine Zeile in der schmalen rechten Spalte.
5. **Token-404** (`token-404-*`): eigene Seite im Token-Rahmen (Fahne, Kicker), H1 „Dieser Link gilt nicht (mehr).", der Satz darunter; kein Knopf, kein Link zur Startseite, nichts vom Plan; hell und dunkel.
6. **Druck** (`druck-token-a3-*`, `druck-qr-*`, `druck-sw-*`): A3 mit größerem Maßstab als A4; QR unten rechts über „Blatt x von y", Beschriftung „Aktuelle Fassung" darüber, Legende links daneben, keine Karte in der QR-Ecke; Schwarzweiß ohne Farbe, Zeichen mit Strichmustern, Logo (falls hochgeladen) grau.
7. **SVG allein** (`svg-allein-*`): sieht aus wie das Blatt im Druck — Zeichen, Sechsecke, Logo, Schrift Arimo (keine Ersatzschrift-Verschiebung in Karten).
8. Vergleich mit den Referenzbildern (`…/scratchpad/referenz/*.png`): Position des QR stört die Vorlage-Optik nicht (Fuß unverändert).

- [ ] **Step 3: Befunde beheben**

Je Befund: kleinster Eingriff, ein Test, der ihn festhält (Quelltext-Scan für CSS-Regeln in `kommplan-css.test.ts`, e2e für „sieht man"), Fotos der Ansicht neu, `fix(kommplan): …`-Commit mit `DRK-500`. Jeden Befund samt Entscheidung in „Abweichungen bei der Umsetzung" eintragen (U1, U2, …) und den Plan mit `docs: Abweichungen aus der Sichtprüfung im Umsetzungsplan Phase 5` committen.

- [ ] **Step 4: Release-Notiz gegenlesen**

Jeder Name der Notiz steht so am Bildschirm (Fotos): „Kommunikationspläne" (App-Umschalter — einmal die Planliste mit offenem Umschalter fotografieren), „Drucken", „Neu", „Gliederung", „Teilen". Weicht etwas ab, Notiz oder Oberfläche in einem `fix(kommplan): …`-Commit nachziehen.

- [ ] **Step 5: Commit des Fototests**

```bash
git add e2e/kommplan-teilen.spec.ts
git commit -S -m "test(kommplan): Bildschirmfotos der Phase 5

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Alle Tore

**Files:** keine neuen Änderungen.

- [ ] **Step 1: Alle Tore**

Vorher `uptime`. Dann nacheinander, jeweils Exit-Code prüfen:

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm lint; echo "lint exit $?"
pnpm anker:neu; echo "anker exit $?"
pnpm vitest run; echo "vitest exit $?"
pnpm build; echo "build exit $?"
pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts e2e/kommplan-gliederung.spec.ts e2e/kommplan-bibliothek.spec.ts e2e/kommplan-verwaltung.spec.ts e2e/kommplan-teilen.spec.ts; echo "e2e exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
pnpm e2e:gebaut e2e/kommplan-teilen.spec.ts; echo "e2e gebaut exit $?"
git checkout -- next-env.d.ts 2>/dev/null || true
```

Expected: alles Exit 0. Bekannt und nicht Teil dieser Arbeit: `scripts/backup-sidecar.test.ts` auf macOS (DRK-501); `pnpm vitest run` darf ausschließlich daran rot sein. Ein rotes e2e bei hoher Last einzeln bzw. über `pnpm e2e:gebaut` nachfahren. Rote Tests anderer Module nur beheben, wenn sie ein Tor blockieren, und als Ticketkandidat eintragen.

- [ ] **Step 2: Stand festhalten**

`git status` sauber (außer `next-env.d.ts`, zurückgesetzt); `git log --oneline main..HEAD` zeigt die Commits dieser Phase signiert (`git log --show-signature -1`). `git grep -n "setzeVorlage\|Drucken (A4 quer)\|Keine Vorlage mehr\|keineVorlage" -- src e2e` liefert nichts. Im Bericht an den Hauptlauf: Ticketkandidaten aus „Abweichungen", offene Annahmen (unten „An den Hauptlauf").

---

## Abdeckung der Spec (Selbstprüfung)

| Spec | Anforderung | Aufgabe |
|---|---|---|
| §3 | `requiresAuth: false` für die Token-Ansicht; Arbeitsrouten bleiben durch `_lib/zugang.ts` geschützt | 8 (`riegel.test.ts`, Grenztest), unverändert `(intern)/layout.tsx` |
| §4.1 | `freigabe` (bei uns `plan_freigabe`) mit allen Spalten | 2 (keine Migration, Schema-Fall) |
| §5.6 | Kopf, Fuß, Legende je Blatt — auch A3, auch mit QR | 4, 10 |
| §6.1 | `/…/druck/a3`, `/t/[token]` | 4, 8 |
| §6.2 | Kopfleiste: Drucken, Teilen | 5, 9 |
| §6.7 | Vorlagen (geändert: Kopie) | 13, 14 |
| §8.1 | A4 und A3 als eigene Routen mit benanntem `@page`; Schwarzweiß; SVG je Seite | 4, 11, 12 |
| §8.2 | Teilen: 24 h / 7 Tage (Vorgabe) / 30 Tage / unbegrenzt, Notiz, mehrere, widerrufbar | 1, 2, 3, 9 |
| §8.2 | Token 32 Byte base64url, Klartext | 1, 2 |
| §8.2 | minimale Hülle, nur lesend, derselbe Betrachter, aktueller Stand, noindex, no-store, VS-NfD und Stand sichtbar | 6, 8 |
| §8.2 | unbekannt/abgelaufen/widerrufen/archiviert → 404 im Layout oberhalb `loading.tsx` | 2, 7, 8, 15 |
| §8.2 | `zuletzt_abgerufen`, `abrufe`; Audit für Ausstellen/Widerrufen | 2, 3, 7 |
| §8.2 | QR auf dem Ausdruck bei gültigem Link | 10 |
| §8.3 | archivierter Plan macht Links sofort ungültig — Archivieren widerruft, Wiederherstellen erweckt keinen | 2, 7, 14, 15 |
| §10 | e2e: Token-Link 200, nach Widerruf 404 | 15 |
| §11 | Lieferphase 5 vollständig | 1–17 |
| Auftrag | Rate-Limit gegen Token-Raten (`core/ratelimit`) | 7, 15 |
| Auftrag | `Referrer-Policy: no-referrer`, Metadata `robots` + `X-Robots-Tag` | 6, 8, 15 |
| Auftrag | Kopieren mit Rückfall bei http | 9, 15 |
| Auftrag | Basis-URL aus der Suite-Konfiguration | 9, 10 (`moduleUrl`) |
| Auftrag | Release-Notiz endgültig, ein Absatz | 14 |
| Auftrag | Screenshots hell/dunkel, drei Breiten | 16 |
| Kritik | eigene 404 der Token-Ansicht ohne Weg zur Anmeldung | 8, 15, 16 |
| Kritik | Verteilweg kurz: Anfangsfokus, geteilter Druckknopf, SVG ohne Druckdialog, QR-Satz | 5, 9, 10, 12, 15 |

## Abweichungen bei der Umsetzung

Was sich erst am laufenden Code zeigt. Jede Zeile nennt die Aufgabe, in der die Entscheidung fiel. (Bei Planstand leer.)

| # | Aufgabe | Befund | Entscheidung |
|---|---|---|---|
| U1 | 4, 5, 9 | `pnpm build` je Aufgabe hätte unter Dauerlast (Load 12–56) je Lauf Minuten gekostet | Gemeinsame Builds über die Endstände von Task 4–8, 9–10, 11, 12 und 13 (Vorbild Phase-1-U6, Phase-4-U3); jeder grün |
| U2 | 5 | `KOPFLEISTE_TELEFON_VORHER` gemessen | 204 px (390 × 844, `/p/beispiel-openr-2022-07-01?ansicht=diagramm`, Stand vor Phase 5); der Fototest sichert ihn, die zweispaltige Kopfleiste hält ihn |
| U3 | 5 | `PFEIL_RUNTER_BIS_A3` ist 1, nicht 2: per Enter geöffnet steht „A4 quer“ schon aktiv, zwei Pfeile liefen herum | 1; der e2e wartet vor dem Pfeil auf den Fokus im Menü und vor Enter auf den Fokus an „A3 quer“ — rc-menu liest den aktiven Punkt aus seinem Zustand, ohne Warten druckte Enter unter Last A4 |
| U4 | 5, 15 | A3-PDF misst 1191,12 × 841,92 pt statt 1190,55 × 841,89 (Chromium rundet auf ganze CSS-Pixel) | Toleranz < 1 pt statt `toBeCloseTo(…, 0)` |
| U5 | 8 | Im Planwortlaut von `TokenKopf.test.tsx` stand `token="T".repeat(43)` — kein gültiges JSX | `token={"T".repeat(43)}` |
| U6 | 9 | `kopiere`: `select()` allein fokussiert das versteckte Textfeld nicht überall (jsdom nie), `execCommand("copy")` kopiert die Auswahl im fokussierten Feld | `feld.focus({ preventScroll: true })` vor `select()`; der Fokus kehrt wie geplant zurück |
| U7 | 9 | `kommplan-css.test.ts` sicherte die einspaltige Telefon-Kopfleiste zu | Fall auf die zweispaltige Kopfleiste mit `kp-ganze-zeile` umgestellt |
| U8 | 10 | antds `Switch.onChange` liefert `(checked, event)`; `onChange={qr.onAendern}` reichte das Ereignis mit durch | `onChange={(v) => qr.onAendern(v)}`. Der Fall „Optionen: nur leerzeilen und vermerkVsNfD“ heißt jetzt „Optionen: alle vier schaltbar (Phase 5)“. Mit 24 mm QR bleiben alle Eigenschaftsfälle grün (Review Focus 5) |
| U9 | 12 | Der dynamische `import()` der Schrift braucht in Vitest mehr als eine Runde der Ereignisschleife | `SvgHerunterladen.test.tsx` wartet per `vi.waitFor` (bis 5 s); der neue `Drucken`-Fall stubbt `document.fonts` selbst; `asciiTeil` schreibt die Kombinationszeichen als `\u0300-\u036f` |
| U10 | 15 | Unter `next dev` steht in `cache-control` kein `no-store`: der Dev-Server setzt „no-cache, must-revalidate“ und überschreibt den Proxy-Kopf. Der gebaute Stand liefert `private, no-cache, no-store, …` | Zusicherung hinter `E2E_VORGEBAUT` (Falle 21; CI fährt den gebauten Stand); `x-robots-tag` und `referrer-policy` gelten in beiden Wegen. „An den Hauptlauf“ 1 ist damit belegt: die Proxy-Köpfe erreichen die Antwort, auch beim 404 |
| U11 | 15 | Seit „SVG – A4 quer“/„SVG – A3 quer“ im Menü stehen (Task 12), traf `getByRole("menuitem", { name: "A3 quer" })` zwei Punkte (strict mode) — `kommplan.spec.ts` und `kommplan-editor.spec.ts` liefen bis dahin nur mit `-g` | `exact: true` an allen Formatpunkten der e2e |
| U12 | 16 | Sichtprüfung: am Telefon zerfiel der umrandete VS-NfD-Vermerk der Token-Ansicht in zwei Rahmenstücke | `white-space: nowrap` (Telefon-Block von `token.css`), Quelltext-Fall in `kommplan-css.test.ts`; Foto neu |
| U13 | 16 | Der Fototest des Plans schaltete den QR nie ein — `druck-qr-*` zeigte keinen Code, die Flyins keinen Satz | Der Fototest setzt `qrAufDruck` vor dem Ausstellen. Die Handfotos (Schwarzweiß, SVG allein, Briefkopf mit Logo/ohne, Planliste mit Umschalter) kamen aus einem Wegwerf-Spec im Scratchpad-Lauf, danach gelöscht; der Briefkopf ist auf den Seed-Stand zurückgesetzt |
| U14 | 16 | Unter `next dev` meldet jede 404 aus einem `layout.tsx` („Encountered a script tag while rendering React component“, das Theme-Skript in `src/app/layout.tsx`) — auch das vorhandene `/p/gibt-es-nicht`, also nicht aus Phase 5 | **Ticketkandidat** (außerhalb von kommplan, kein Tor betroffen) |
| U15 | 16 | Release-Notiz gegen den Bildschirm gelesen: „Kommunikationspläne“ (App-Umschalter), „Drucken“, „Neu“, „Gliederung“, „Teilen“ stehen so da | keine Änderung; `datum` bleibt 2026-09-30, den Rollout-Tag setzt der Hauptlauf |
| U16 | Review | Der Editor übernahm die Links nur beim Seitenladen: ein inzwischen abgelaufener Link stand als gültig und kopierbar da; nach Browser-Zurück oder aus einem zweiten Tab zeigten Teilen-Flyin und QR-Hinweis einen alten Stand | Lesende Action `ladeFreigabenAction` (Bearbeitungsrecht, nur die Links des Plans, Status vom Server, im Audit-Katalog „excluded“); der Editor gleicht beim Montieren und beim Öffnen von „Teilen“ und „Plan und Verbindungen“ ab, ein von einer jüngeren Liste überholter Abgleich verfällt (Zähler) |
| U17 | Review | Die Zugangsgruppe bekam über den internen Druck den besten gültigen Link (QR, `data-qr-ziel`, Satz) — der Code IST der Link und überdauerte den Entzug der Gruppe | „An den Hauptlauf“ 6 entschieden (Sicherheit vor Bequemlichkeit): `qrZielIntern` nur mit Bearbeitungsrecht; die Zugangsgruppe druckt intern ohne QR. Token-Druck unverändert. Spec §8.2, Unit- und e2e-Fall |
| U18 | Review | Die zweispaltige Telefon-Kopfleiste (Kritik 21, U2, U7) widerspricht der verbindlichen Regel in docs/design/README.md („Mobil“: untereinander, nie nebeneinander) | Zurückgenommen: eine Spalte, „Teilen“ kostet eine Zeile; `kp-ganze-zeile` entfällt. Der Fototest prüft volle Breite und eine Zeile je Knopf statt `KOPFLEISTE_TELEFON_VORHER` |
| U19 | Review | Gewählte Dauer im Dunkelmodus Suite-Rot auf Schwarz (≈ 2,5:1); am Telefon zerriss die verbundene Knopfgruppe | Einfache Radios im eigenen Raster `.kp-dauer` (`auto-fit`, 4 → 2 × 2), Beschriftung in Textfarbe, 44 px je Wahl (gemessen). Der rote Punkt bleibt das Theme-Rot — Ticketkandidat zusammen mit dem Fokusring (unten) |
| U20 | Review | Escape im Druckmenü ließ den Fokus auf body (Token-Ansicht und Editor, Maus und Tastatur; im Browser nachgestellt) | Gesteuertes `Dropdown` (`open`/`onOpenChange`), eigener Escape-Horcher in der Capture-Phase, Fokus an den Pfeil im nächsten Frame; DOM-Fall (rot ohne die Änderung) und e2e |
| U21 | Review | Zweimal „Als Vorlage speichern“ ergab zwei ununterscheidbare Vorlagen | Gibt es eine aktive Vorlage gleichen Titels, legt der Server nichts an und nennt sie; die Liste bietet „Vorlage öffnen“ und „Trotzdem anlegen“. Titel bleibt unverändert (Entscheidung 16). Spec §6.7, e2e |
| U22 | Review | Druckvorschau ragte bei 1440 px (A3) und 1024 px (A4) hinaus; Token-Kopf belegte am Desktop ein Drittel der Höhe | `@media screen`: Blatt `max-width: 100%; height: auto` (Druck und SVG-Datei unberührt). Token-Ansicht ab 768 px: „Drucken“ rechts unter dem Briefkopf; Betrachter bei y = 227 statt 291 |
| U23 | Review | Release-Notiz (Task 14) wiederholte den App-Namen in Titel und Text | Titel „Pläne und Fernmeldeskizzen erstellen, drucken und teilen“, erster Satz ohne Modultitel, Formate „A4 quer oder A3 quer“ (304 Zeichen). Der Wortlaut in Task 14 ist damit überholt |
| U24 | Review | `VERTRAULICHE_ANSICHTEN` in `core/routing.ts` hat einen Nutzer | Ausnahme von der core-Regel im Kommentar begründet (nur der Proxy setzt Köpfe, er importiert nur aus core); ein zweites Modul hebt die Liste in die Registry |
| U25 | Review | Mehrere Zusicherungen blieben unter gezielten Mutationen grün (A3-Aufteiler, QR-Platz, QR-Inhalt, Token-Druck ohne Option, Formprüfung und Sperre vor der Datenbank, Entpreller je Adresse und Link, `where` in `zaehleAbruf`, Druckziel der Token-Ansicht, QR-Schleife im e2e) | Je ein Fall, der unter seiner Mutation rot wird; Datenbankabfragen über einen Zähl-Proxy |

## An den Hauptlauf (offene Annahmen, ClickUp fasst diese Umsetzung nicht an)

1. **Köpfe aus dem Proxy erreichen die Antwort** (Entscheidung 7), auch beim 404 und auch `cache-control` neben Nexts eigenem Wert — belegt erst der e2e gegen den gebauten Stand (Task 15, Schritt 3). Trägt es nicht, wäre der Ausweg ein `headers()`-Eintrag in `next.config.ts` mit `source: "/t/:token*"` und `has: [{ type: "host", … }]` — aber der Host steht erst zur Laufzeit fest (`SUITE_HOST_KOMMPLAN`), und `next.config` wird beim Build gelesen.
2. **Client-Adresse auf dem Modul-Host** (Entscheidung 5): die Schranke rechnet mit `cf-connecting-ip` als echter Client-Adresse. Seit dem internen Rewrite (`src/proxy.ts`, Messbericht 2026-08-22) gilt das laut Kommentar; der ältere Vorbehalt in `core/ratelimit.ts` („auf Modul-Hosts die Egress-Adresse") steht dort noch. Trifft der Vorbehalt doch zu — oder kommen Anfragen ohne `cf-connecting-ip` an (http im LAN, Direktzugriff) —, sperren dreißig geratene Tokens eine Minute lang **alle** Token-Ansichten dieses Eimers. **Rollout-Bedingung:** nach dem Rollout einmal mit zwei Geräten gegenprüfen, dass `cf-connecting-ip` je Gerät verschieden ankommt; trägt es nicht, braucht der Eimer `"unknown"` eine eigene, großzügigere Schranke (eigene Aufgabe). Ticketkandidat: den Kommentar in `core/ratelimit.ts` nachziehen.
3. **Basis-URL** (`moduleUrl("kommplan")`): in Produktion `https://<SUITE_HOST_KOMMPLAN>`; fehlt die Variable, gibt es weder Links noch QR (laut, mit Hinweis). Vor dem Rollout `SUITE_HOST_KOMMPLAN` setzen und einen gedruckten QR scannen.
4. **Lesbarkeit des QR** bei 24 mm (Version 8 = 57 Module an echten Tokens, also 0,42 mm je Modul, Fehlerkorrektur H) — gemessen am SVG, nicht am Papier. Ein Produktionshost, dessen URL länger als ≈ 86 Zeichen wird, hebt den Code auf Version 9 (61 Module, 0,39 mm). Einmal ausdrucken und mit zwei Telefonen scannen; reicht es nicht, ist die nächste Stellschraube die Kante (Kosten: Zeichenfläche), nicht die Fehlerkorrektur (`core/qr` ist für alle Module einheitlich).
5. **Entscheidung 14 bestätigen:** Schwarzweiß nur für Druck und SVG, Bildschirm farbig. Die Alternative (auch der Bildschirm grau) wäre eine Zeile im Betrachter, aber eine Annahme über die Erwartung der Bearbeitenden.
6. ~~**Die Zugangsgruppe sieht den besten Link im internen Druck.**~~ **Entschieden im Review (U17):** QR nur im internen Druck von Bearbeitenden; die Zugangsgruppe druckt intern ohne QR, weil der Code selbst der Link ist und den Entzug der Gruppe überdauerte.
7. **Entscheidung 16 umgesetzt wie vorgegeben;** in der Vorlagenliste heißt der Punkt jetzt „Vorlage archivieren" (statt „Keine Vorlage mehr"), der Hinweis nach „Als Vorlage speichern" bietet „Vorlage öffnen". Wer eine Vorlage ändern will, öffnet sie wie jeden Plan im Editor — das bleibt unverändert.
8. **Archivieren widerruft die Links** (Entscheidung 3, Kritik): „Rückgängig" direkt nach dem Archivieren holt den Plan zurück, die Links nicht. Zur Bestätigung — die Alternative (Wiederbelebung mit Hinweis „n Links sind wieder gültig") wäre bequemer, ließe aber Links aufleben, die während der Archivzeit niemand sehen konnte.
9. **Rot auf der Token-Route** (Entscheidung 8): die antd-Knöpfe von Betrachter und Druckmenü färben Hover und Fokus in Suite-Rot; das Rot-Budget des Abendzettels gilt nur für das eigene Markup. Ticketkandidat: neutrale Bedienknöpfe und gemeinsamer öffentlicher Rahmen in `core`.
10. **Ticketkandidat Theme (Review, außerhalb von kommplan):** im Dunkelmodus ist der Fokusring der antd-Bedienelemente rgb(74, 14, 19) auf rgb(20, 20, 20) (≈ 1,2:1), suiteweit und nicht aus Phase 5; dieselbe Ursache (dunkles `colorPrimary` ≈ rgb(173, 3, 16)) trägt den gefüllten Kreis der gewählten Dauer im Teilen-Flyin (≈ 2,5:1 zum Grund; der weiße Punkt darin bleibt deutlich). Die Abhilfe gehört in `core/theme` (Fokus- und Primärfarbe im Dunkel-Satz).

## Kritik eingearbeitet/verworfen

Jeder Befund wurde vor der Übernahme am Code bzw. an der Bibliothek geprüft (Spalte „Geprüft"). Widerlegt wurde keiner; „teilweise" heißt: der Kern übernommen, ein Nebenvorschlag mit Grund nicht.

| # | Befund | Geprüft | Ergebnis | Wo / Begründung |
|---|---|---|---|---|
| 1 | Enter-Fall im `DruckMenue.test` scheitert (`e.which`) | `@rc-component/menu` 1.5.0 `MenuItem.js`: `if (e.which === KeyCode.ENTER)`; antd 6.6.4 bindet `~1.5.0` | übernommen | Task 5: Ereignis mit `keyCode: 13`, Kommentar dazu; Komponente unverändert ohne Anker |
| 2 | `setzeVorlage` steht noch in zwei weiteren Fällen | `planverwaltung.test.ts` ruft es viermal (Grenzfälle-Block und Vorlagen-Block) | übernommen | Task 13: „Kopie einer Vorlage" auf Seed-Vorlage, „archivierter Plan wird nicht zur Vorlage" gestrichen (deckt der neue Fall), `git grep` als Prüfschritt |
| 3 | §6.7-Satz läuft über zwei Zeilen | Spec: Umbruch nach „setzt" | übernommen | Task 14: zweizeiliger Suchtext und zweizeilige Ersetzung; §8.3 ebenso |
| 4 | `rahmen.ts`/`plaene.ts` als geändert gelistet, keine Aufgabe ändert sie | `plaene.ts`: `Listenzeile.vorlage` existiert; Spread in `druckdaten.ts` | übernommen | Dateistruktur: beide Zeilen gestrichen, Satz „Unverändert, obwohl naheliegend" |
| 5 | antd-Knöpfe färben Hover/Fokus rot — Rot-Zusage stimmt nicht | `theme.ts`: `colorPrimary: FARBEN.rot` | übernommen (Variante „Zusage einschränken") | Global Constraints, Entscheidung 8, Hauptlauf 9: Rot-Budget gilt für das eigene Markup, kein `type="primary"`, Task 16 fotografiert den Hover. Neutrale Knöpfe per `ConfigProvider` bräuchten einen eigenen Hell/Dunkel-Satz — Ticketkandidat |
| 6 | A3-Route fehlt in den 404-Schleifen des e2e | `e2e/kommplan.spec.ts`: beide Schleifen nur `/druck/a4` | übernommen | Task 5: beide Pfadlisten um `/druck/a3` |
| 7 | Wiederherstellen belebt alte Links still wieder | `stelleWiederHer` setzt nur `archiviertAm: null`; `loeseToken` prüft nur das Archiv | übernommen (sicherer Weg) | Entscheidung 3, Task 2: `archiviere` widerruft in einer Transaktion (Audit je Link), Test „Wiederherstellen erweckt keinen"; Spec §8.3 in Task 14; Preis „Rückgängig" in Hauptlauf 8 |
| 8 | QR-Messung mit `"A".repeat(43)` zu günstig | Nachgemessen: 300 echte Tokens → immer Version 8 = 57 Module | übernommen | Entscheidung 11, `QR_BOX.kante` 24 mm (0,42 mm/Modul), Test mit `randomBytes`, Blatt-Literale 263/171/24/57, Hauptlauf 4 (Version 9 bei langem Host) |
| 9 | Kopfraster legt Zeilen in die schmale Spalte | Kinderfolge h1, Briefkopf, p, p, Vermerk, Aktionen; nur Aktionen mit `grid-column` | übernommen | Task 8: linker Block `.kp-token-links`, DOM-Fall dazu; Task 16 fotografiert mit/ohne Briefkopf |
| 10 | Feste `cf-connecting-ip` machen Retry sicher rot | `playwright.config.ts`: `retries: CI ? 1 : 0`, `workers: 1` | übernommen | Global Constraints, Task 15/16: `ip(n) = 2001:db8:<LAUF>::<n>`, `LAUF` je Laden der Datei (neuer Worker je Retry, auch lokaler Zweitlauf) |
| 11 | `--kp-auswahl-papier` im Flyin dunkel zu schwach | `kommplan.css`: „Nicht im Dunkel-Block überschreiben" | übernommen | Task 9 CSS `--kp-auswahl`, Entscheidung 17, Prüfliste Task 16 |
| 12 | Fokus geht nach dem Widerrufen verloren | Eintrag samt Knopf wandert in `<details>` | übernommen | Task 9: Ref + Effekt auf `freigaben`, nächster gültiger Link oder Legende; DOM-Fall über echten `Popconfirm`, e2e (Legende fokussiert) |
| 13 | Kicker/Titel „Kommunikationsplan" auch für Fernmeldeskizzen | `TYP_NAME` in der Angabenzeile, Kicker statisch | übernommen | Entscheidungen 7, 8, Task 8: „KOMMUNIKATIONSPLÄNE"/„Kommunikationspläne" (Modulname, `registry.ts`); e2e prüft Kicker und `<title>` |
| 14 | A3-Route ohne Wirkungstest (Duplikat zu 6) | wie 6 | übernommen | mit 6 erledigt |
| 15 | Token-Route lädt antd — Abweichung vom Abendzettel nicht festgehalten | README: Abendzettel „ohne antd", 56/72 ohne Shell | übernommen | Entscheidung 8, Global Constraints (Falle 1, 4), Rahmen-Kommentar „der Rahmen selbst ohne antd"; Task 16 misst 56 px. Ein antd-freies Druckmenü nur für die Token-Ansicht nicht: der Betrachter bringt antd ohnehin mit |
| 16 | Keine Klickbilanz; Verteilweg ≈ 15 Schritte | Wege im Plan nachgezählt | übernommen | Review Focus 8 mit Bilanz vorher/nachher (≈ 7–8), umgesetzt über 17–20 |
| 17 | Teilen-Flyin ohne Anfangsfokus | `StelleFlyin`/`BibFlyin`: `autoFocus={false}` + eigener Fokus | übernommen | Task 9: `autoFocus={basis === null}`, Notiz `autoFocus`; DOM-Fall und e2e (`oeffneTeilen`) |
| 18 | „Drucken" kostet zwei Klicks; Menü per Tastatur nicht erreichbar | `useAccessibility.js`: Menüfokus nur bei `autoFocus` oder Tab; `Dropdown.Button` in antd 6 veraltet | teilweise | Entscheidung 12, Task 5: geteilter Knopf (`Space.Compact`), `autoFocus`, e2e-Tastaturweg. **Nicht** die Blattzahl je Format im Menü: sie hängt am QR (Option und gültiger Link) und kostete je Öffnen eine Aufteilung im Client |
| 19 | „SVG herunterladen" nur über den Druckdialog erreichbar | `Drucken.tsx` druckt im Effekt; SVG-Knöpfe nur auf der Druckseite | übernommen | Entscheidung 15, Task 12: Gruppe „SVG-Dateien" im internen Menü → `?export=svg`, `Drucken automatisch={false}`; e2e zählt `window.print` |
| 20 | QR-Hinweis ohne Weg zu „Teilen", Ziel des QR unsichtbar | Hinweis ist reiner Text; `waehleQrFreigabe` wählt still | übernommen | Entscheidung 10, Task 10: (a) Knopf „Link ausstellen", (b) `qrZielSatz` mit Ablauf-Warnung, (c) derselbe Schalter im Teilen-Flyin, (d) Satz in der `noprint`-Leiste; ohne Uhr im Rendern über `besteFreigabe` (Task 1) |
| 21 | „Teilen" verlängert die Kopfleiste am Telefon um eine Zeile | Media-Regel: eine Spalte; vier sichtbare Knöpfe heute | übernommen | Task 9: zwei Spalten in DOM-Reihenfolge (kein `dense`, sonst springt der Tab-Fokus), ganze Zeilen für Umschalter/Wiederholen/Plan, „Teilen" und „Drucken" nebeneinander; Messung vorher (Task 5), Zusicherung im Fototest (Task 16) |
| 22 | Token-404 führt zur Suite-404 mit Weg zur Anmeldung | Nur `src/app/not-found.tsx` im Repo; Next-Doku: Grenze je Segment | übernommen | Entscheidung 4, Task 8: `t/not-found.tsx` + `TokenUngueltig`; Task 15 prüft Text, keinen Link auf `/`, gleiche Länge der vier 404; Beleg der Grenze über `pnpm e2e:gebaut` |
| 23 | Schranke 10/min zu knapp | `clientIpAus`: ohne Kopf `"unknown"` | teilweise | Entscheidung 5: 30 statt 60 — 60 verlängert den e2e so, dass er unter Last das gleitende 60-s-Fenster überschreiten kann; e2e mit `request.get`. Kein eigener Eimer für `"unknown"`: Rollout-Bedingung in Hauptlauf 2 |
| 24 | Rückmeldung fern vom Knopf; Fokus nach Widerruf (zweiter Teil = 12) | `role="status"` und Lesefeld zwischen Formular und Liste | übernommen | Task 9: „Kopiert" am Knopf für 2 s, Lesefeld im Eintrag, DOM-Fall mit zwei Links |
| 25 | Token-Ansicht am Telefon höher als der Schirm (Scroll-Falle) | `.kp-betrachter { height: calc(100dvh - 240px) }`, Token-Kopf größer | übernommen | Entscheidung 8, Task 8: `100dvh`-Raster, Flex-Kette über `kp-betrachter-wurzel`/`kp-flaeche-wurzel`, Kopf am Telefon verdichtet; Task 16 sichert `scrollHeight ≤ innerHeight` |
| 26 | Release-Notiz ohne Einstieg für die Zugangsgruppe und ohne „Neu" | Kopfzeile der Notiz: Zugangs- und Admin-Gruppe; Vorschlag hat 322 Zeichen | übernommen (gekürzt) | Task 14: „Unter „Kommunikationspläne" …" zuerst, dann „Neu", „Gliederung", „Teilen"; 315 Zeichen (Vorschlag lag über 320), „Aus Bibliothek" fällt heraus |
| 27 | „Keine Vorlage mehr" verspricht etwas anderes; kein Weg zur neuen Vorlage | Menü in `PlanTabelle.tsx`; `AnlageErgebnis.id` vorhanden; `Hinweis` hat nur `zurueck` | übernommen | Entscheidung 16, Task 13: „Vorlage archivieren", `Hinweis.oeffnen` mit „Vorlage öffnen" (Fokus darauf), Spec §6.7, e2e |
| 28 | Kicker für Fernmeldeskizze (Duplikat zu 13) | wie 13 | übernommen | mit 13 erledigt |
