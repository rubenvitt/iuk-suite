# iuk-suite — Projektanweisungen

Next.js 16 (App Router, RSC) · Ant Design 6 · Drizzle + better-sqlite3 · Auth.js v5 (Pocket ID) ·
Vitest + Playwright. Eine SQLite-Datenbank **pro Modul**.

## Bevor du Oberfläche baust

`docs/design/README.md` enthält die verbindlichen Querschnittsregeln. Referenzentwürfe:
`docs/design/feedback-oeffentliche-ansicht.md` (öffentliche, login-freie Ansichten) und
`docs/design/feedback-admin.md` (Admin-Arbeitsseiten).

### Fallen, die `pnpm build` nicht findet

Jede hat einen halben Tag gekostet. Hier steht Regel und Abhilfe; Messung, Ursache und Gegenproben
stehen unter derselben Nummer in **`docs/design/fallen.md`** — dort lesen, bevor du eine Abhilfe
umbaust. Die Nummern sind stabil; der Code verweist darauf („Falle 6, `CLAUDE.md`").

1. **Compound-Zugriff auf antd in einer Server Component = HTTP 500** (`Typography.Title`,
   `Form.Item`, `Input.TextArea` …). Sicher: `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag`.
2. **`--ant-*`-Variablen sind nicht global** — sie hängen an antds Scope-Klasse. Eigenes Markup sieht
   sie nicht, still. Eigene Variablen verwenden.
3. **`colorError === colorPrimary === #c8000f`** — ein `Alert type="error"` sieht aus wie eine
   Primäraktion. Wo Rot fachlich etwas bedeutet, nie Rot auf eine Datenfläche.
4. **Kein `size` auf Bedienelementen** (`large` = 72px). Die Bediendichten stehen in
   `core/theme/theme.ts`: `FullShell` 44 (`ARBEITSDICHTE`, auch auf dem Telefon); `MinimalShell` und
   ohne Shell 56/72; `SCHREIBTISCHDICHTE` 32/40 nur in `radio`s Verwaltung (Betreiberentscheidung).
5. **Eigenes CSS gegen antd verliert die Spezifität meist still.** Wo antd einen Token anbietet, den
   Token nehmen.
6. **Ein Wert aus einem `"use client"`-Modul kommt in einer Server Component als Client-Referenz an**
   — HTTP 500, Vitest sieht es nicht. Werte für Server Components in ein Modul ohne `"use client"`
   (`_lib/`).
7. **`@ant-design/icons` in einer Server Component = HTTP 500 schon beim Import**, und `"use client"`
   auf dem Icon-Modul macht es nur still (leere Map → Falle 6). Client-Insel oder Inline-SVG;
   `core/shell/icons.test.ts` riegelt ab.
8. **`.ant-layout-header` vererbt 64px `line-height` an jedes Kind**, auch an absolut positionierte.
   `line-height: normal` am gemeinsamen Vorfahren.
9. **`columns[].render` aus einer Server Component geht nicht über die RSC-Grenze.** Tabelle in eine
   `"use client"`-Komponente heben, die nur serialisierbare Props bekommt. Server Actions direkt
   importieren, nie als Prop reichen.
10. **Ein POST in die Erstkompilierung eines Route Handlers wird abgebrochen** (`next dev`). Im e2e
    vorher ein Warmlauf-GET; und jede ausgelöste Anfrage per `page.waitForResponse` prüfen.
11. **`locator.dragTo()` löst kein zuverlässiges `dragstart` aus.** Schrittweise `page.mouse`-Bewegung.
12. **Ein Klick trifft daneben, wenn die Hülle nach `load` umbricht** → `klickeWennRuhig` aus
    `e2e/fixtures.ts`. Und: jedes `Layout` mit `Sider` in einer Server Component setzt `hasSider`
    ausdrücklich (`hasSider={nav.length > 0}`), sonst fehlt die Klasse im Server-HTML; e2e-Messungen
    an der Inhaltsbreite warten vorher auf `warteAufSpaltenaufteilung` (`e2e/fixtures.ts`).
    (10–12 sind Testfallen: der e2e-Test misst etwas anderes, als sein Name sagt.)
13. **Eine `Drawer` mit fester Breite ragt über die linke Kante** und ist auf niedrigen Schirmen zu
    schmal für den Inhalt. `flyinBreite()` aus `core/theme/flyin.ts`; Raster darin per
    `auto-fit`/`minmax`, nicht per `@media`.
14. **Virtualisierte `Table`**: braucht numerische Spaltenbreiten (sonst 1px breit), rendert in jsdom
    keine Zeilen und hat kein `tbody`/`tr` — Greifer `[data-row-key]`. Immer über `Datentabelle`
    (`core/tabelle`): virtualisiert erst ab `VIRTUELL_AB_ZEILEN` und rüstet Rollen, `aria-rowcount`
    und `aria-rowindex` nach. Die Trennung Spaltenkopf → Zelle bei fixem Kopf ist bewusst
    hingenommen (DRK-362: keine Screenreader-Zusage für Verwaltungsflächen).
15. **`Table.onChange` meldet nicht, wenn sich `dataSource` daneben ändert.** Filter-/Sortierzustand
    merken und die Liste ableiten (`core/tabelle/angezeigt.ts`).
16. **Eine virtualisierte Tabelle ist ein zweiter Scroller**, und `scroll.y` ist nur der Körper.
    `TabellenVollhoehe` aus `core/tabelle`; Breakpoints in die Media Query, `100dvh` statt `100vh`.
17. **JSX als Spaltentitel aus einer Server Component → leere Kopfzellen.** `title` als Zeichenkette
    (`Datentabelle` setzt den Kicker im Client); `core/tabelle/spaltenkopf.test.ts` riegelt ab.
18. **`@page { size: A6/A7/A8 }` ist ungültiges CSS** → Kantenlängen ausschreiben (`74mm 105mm`).
    Gemischte Seitengrößen verwirft Chromium ganz: eine zweite Druckgröße ist eine eigene Route;
    mehrere Druckflächen in einem Stylesheet brauchen benannte `@page`. Portale (Navigationsschub)
    treffen Druckregeln unter `.druckRahmen` nicht.
19. **`.xlsx` in Tests nur über `core/export/test-mappe.ts` lesen** (Größe 0 im lokalen Kopf,
    fehlende leere Schlusszellen). `core/export`: `server.ts`/`client.ts` nie über `index.ts`
    re-exportieren.
20. **CSS gegen einen `.ant-*`-Klassennamen stirbt beim Major-Upgrade still**, und ein Test auf den
    Regeltext merkt es nicht. Wer so eine Regel schreibt, prüft per `renderToString` + `extractStyle`,
    dass die Klasse gerendert wird (Vorbild `core/theme/selektschrift.test.ts`).

### Hell/Dunkel und `core`

Hell/Dunkel läuft über `<html data-theme>` per Cookie, **nicht** `prefers-color-scheme`: `iuk-theme-pref`
trägt die Wahl (`auto|light|dark`), `iuk-theme-system` den zuletzt beobachteten OS-Wert. `data-theme`
trägt **immer** den aufgelösten Wert `light`/`dark` — ein gestempeltes `auto` kippt still alles auf hell.

Nach `src/core` kommt nur, was ein **zweites, heute belegbares** Modul braucht.

### Zeitzone

Zeiten und Tagesgrenzen rechnen in der Suite-Zone aus `core/zeit` (Standard `Europe/Berlin`,
einstellbar unter Portal → Verwaltung; der Browser liest `<html data-zeitzone>`). Nie `timeZone`
als Literal und nie `new Intl.DateTimeFormat({ timeZone })` auf Modulebene, denn das friert die
Zone beim Import ein. Stattdessen `zeitFormat(locale, optionen)` oder `timeZone: zeitzone()` je
Aufruf. Ausnahme: ein Kalendertag, der als Mitternacht UTC gespeichert ist, bleibt `timeZone: "UTC"`.

## Ein neues Modul registrieren — das Dreieck

Ein Modul mit eigener Datenbank braucht drei zusammenpassende Einträge: Migrationsverzeichnis unter
`_db/`, Eintrag in `MODULE_MIGRATIONS` (`core/bootstrap.ts`) und die `COPY`-Zeile im `Dockerfile`
(fehlt sie, läuft es lokal und bricht im Container). Datenbanken von `core` selbst (heute `konto`)
stehen in `CORE_MIGRATIONS`; `bootstrap.test.ts` prüft beide Listen.

Modul-Metadaten (Auth, Gruppen, Hosts) stehen in `src/core/registry.ts`, je Modul überschreibbar per
`SUITE_HOST_<KEY>` und `SUITE_ADMIN_GROUP_<KEY>`.

## Zugriffsschutz

- `requiresAuth`/`requiredGroups` gaten nur den Modulzugang. Objekt-Zugehörigkeit **innerhalb** eines
  Moduls wird serverseitig aus der Datenbank aufgelöst, nie aus einem URL-Parameter (IDOR). Vorbild:
  `assertGroupAccess` in `feedback`.
- Modul-Admin ist `isModuleAdmin` aus `core/groups`, **nicht** `session.user.isAdmin` (suiteweit).
- Gruppen im JWT sind nur so frisch wie der letzte Token-Refresh (Takt ≈ 1 Stunde): ein Entzug wirkt
  verzögert; wo das zu lang ist, aus der Datenbank auflösen.
- Aufgefrischt wird nur in `src/proxy.ts` und auf `/api/auth/*`, nie bei `auth()` aus einer Server
  Component — Pocket ID rotiert ohne Gnadenfrist, ein verlorenes Refresh-Token kostet die Sitzung.
- `src/proxy.ts` **ist** die Middleware (Next.js 16). Wer die Auth-Config zwischen Objekt- und
  Funktionsform umstellt, passt `proxy.ts` mit an (sonst HTTP 500 überall) und fährt Playwright.

## Lokale Demodaten

`pnpm seed:lokal [modul …]` füllt alle datenbankgestützten Module (idempotent, additiv). **Bewusst
nicht am Boot-Pfad:** `SUITE_SEED=1` ist der Generalproben-Schalter, ein Boot-Seed liefe also nicht
nur lokal. `scripts/seed-lokal.test.ts` verlangt einen Seed je Modul und verbietet die Verdrahtung in
`bootstrap.ts`/`instrumentation.ts`.

## Ticket-Board (ClickUp)

Aufgaben stehen als `DRK-<n>` auf dem Board „I&K Suite" (`901524923921`). Nachziehen **während** der
Arbeit: `in progress` beim Start, ein Kommentar bei jeder Entscheidung zu einer offenen Frage,
`review` bei offenem PR, `Closed` erst nach dem Merge. Ticketnummer in den Commit-Body. Funde außerhalb
des Auftrags werden ein neues Ticket, kein `TODO`. Details: Skill `.claude/skills/clickup/SKILL.md`.

## Release Notes

**Die meisten Änderungen bekommen keine Notiz.** Pflicht nur für ein neues Feature und für eine
Änderung, nach der jemand vergeblich suchen würde — dann im selben Commit. Ein Absatz, ein bis drei
Sätze, für Anwender (kein Datei-, Funktions- oder Ticketname), Du-Form, Wege mit den Wörtern vom
Bildschirm, keine Werbewörter, kein Markdown. Eine Datei je Notiz unter
`src/app/m/portal/_lib/neuigkeiten/notizen/<modul>/<YYYY-MM-DD>-<slug>.ts` plus eine Zeile in
`register.ts`; `datum` ist der Rollout-Tag. Kein Modul importiert `portal/_lib/neuigkeiten`.
`register.test.ts` prüft Grenzen und Stil; Langfassung in `docs/release-notes.md`.

## Versionsnummern

Jeder Merge auf `main` bekommt automatisch `X.Y.Z` aus der Historie (`scripts/version.mjs`, Runbook
`docs/runbooks/versionierung.md`). Der Typ der Commit-Kopfzeile entscheidet: `feat!`/`BREAKING
CHANGE:` Major, `feat` Minor, sonst Patch — der Präfix ist also keine Stilfrage. `package.json` ist
nicht die Quelle.

## Cutover einer Alt-Anwendung

Runbooks in `docs/runbooks/`. Ein Paritätscheck beweist den Datenbank-Rundlauf, nicht die
Feldzuordnung — zusätzlich feldweise Stichproben gegen die Alt-Anwendung.

## Kommentaranker

1. Ein Anker in dieses Repo nennt einen **Namen**, keine Zeile (`_db/schema.ts`, Feld `lastUsedAt`).
2. Ein Anker in die Alt-Anwendung nennt das Repo mit (`lagerbuch/src/app/globals.css:277`).
3. Ist ein Anker veraltet, zieh den **Anker** nach, nie die Zusicherung.
4. Wer Kommentare aufräumt, hält die **Zeilenzahl** der Datei — sonst veralten fremde Zeilenanker.

`src/core/kommentaranker.test.ts` prüft, dass jeder Zeilenanker auf eine existierende Zeile zeigt;
Drift innerhalb einer Datei meldet `pnpm anker:drift [pfad]` (bewusst kein Tor).

## Tests

`pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test`.

- `typecheck` läuft mit `--pretty false`; außerhalb dieser Umgebung den Exit-Code prüfen, nicht die
  Ausgabe greppen.
- DOM-Tests nutzen das Harness `src/app/m/qr/_lib/test-dom.tsx` — kein zweites erfinden.
- E2E-Ports gehören der Arbeitskopie (`e2e/helpers/ports.ts`): in Specs nie ein Portliteral, sondern
  `E2E_PORT`/`E2E_PORTS` aus `./fixtures`. Hält eine „FREMDE Arbeitskopie" den Port, nicht beenden.

**Cloud-Sessions (Claude Code on the web) haben kein `git-lfs`** (DRK-368): der frische Klon trägt
unter `public/` Zeigerdateien, und `src/lfs-medien.test.ts` ist rot, **ohne dass deine Änderung
etwas damit zu tun hat**. Abhilfe ist `scripts/cloud-lfs.sh` (installiert git-lfs, holt die
Medien, ~4 s) — nie den Wächter überspringen, er verhindert das Ausliefern von Zeigerdateien.
Ist er trotzdem rot, lief das Skript nicht; seine Meldung steht am Sitzungsanfang.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
