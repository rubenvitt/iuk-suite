# iuk-suite — Projektanweisungen

Next.js 16 (App Router, RSC) · Ant Design 6 · Drizzle + better-sqlite3 · Auth.js v5 (Pocket ID) ·
Vitest + Playwright. Eine SQLite-Datenbank **pro Modul**.

## Bevor du Oberfläche baust: `docs/design/` lesen

`docs/design/README.md` enthält die verbindlichen Querschnittsregeln — insbesondere **zwölf Fallen, die
`pnpm build` nicht findet** und die je einen halben Tag kosten:

1. **Compound-Zugriff auf antd in einer Server Component ergibt HTTP 500** (`Typography.Title`,
   `Form.Item`, `Descriptions.Item`, `List.Item`, `Input.TextArea` … — vollständige Liste dort).
   `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag` sind sicher.
2. **`--ant-*`-CSS-Variablen sind nicht global** — antd deklariert sie auf seiner Scope-Klasse. Eigenes
   Markup sieht sie nicht, und der Fehler ist still (die Linie verschwindet einfach).
3. **`colorError === colorPrimary === #c8000f`** — ein `Alert type="error"` sieht aus wie eine
   Primäraktion. In Modulen, wo Rot fachliche Bedeutung trägt, gehört Rot nie auf eine Datenfläche.
4. **`size="large"` ist 72px** — `size` auf Bedienelementen also gar nicht setzen. **Drei Bediendichten,
   alle in `core/theme/theme.ts`:** `FullShell`-Inhalte 44 (`ARBEITSDICHTE`; WCAG 2.5.5 AAA, gilt **überall**,
   weil `FullShell` auch auf dem Telefon rendert); `MinimalShell` (`qr`, `beta`) und alles ohne Shell 56/72;
   `SCHREIBTISCHDICHTE` 32/40 nur, wo ein Modul sie ausdrücklich anlegt — heute allein `radio`s Verwaltung
   (Betreiberentscheidung 2026-08-28; unterschreitet AAA bewusst, hält die AA-Untergrenze 24, WCAG 2.5.8).
5. **Eigenes CSS gegen antd-CSS entscheidet die Spezifität, meist gegen dich** — und immer still: die
   Regel steht richtig da und greift nur nicht. Drei Ausprägungen (Gleichstand → antd gewinnt durch
   Reihenfolge · eigene Regel zu schwach · eigene Regel zu stark und trifft das eigene Modul). Wo antd
   einen **Token** anbietet, ist der Token besser als jede Spezifität.
6. **Ein `WERT` aus einem `"use client"`-Modul kommt in einer Server Component nicht an** — sie bekommt
   eine Client-Referenz statt des Wertes, HTTP 500 für die ganze Seite. TypeScript ist zufrieden, `build`
   findet nichts, und **Vitest kann es strukturell nicht finden** (dort ist `"use client"` ein
   wirkungsloser String). Werte für Server Components gehören in ein Modul ohne `"use client"` (`_lib/`).
7. **`@ant-design/icons` in einer Server Component ergibt HTTP 500 — und `"use client"` behebt das
   nicht, es macht es still.** Der nackte Spezifizierer löst über `exports["."].node.import` auf CJS
   auf, das `createContext` auf **Modulebene** ruft; in der RSC-Ebene gibt es das nicht →
   `TypeError: (0, _react.createContext) is not a function`, **schon beim Import, nicht beim Rendern**.
   `typecheck` und `build` bleiben grün, und **Vitest kann es strukturell nicht sehen** (dort lädt
   `react` über die `default`-Bedingung, die Icons rendern klaglos) — nur ein echter Abruf zeigt den
   500. Abhilfe: Client-Insel oder eigenes Inline-SVG. Ein Tiefen-Import (`@ant-design/icons/es`) geht
   gemessen durch, ist aber kein Vertrag, auf den man bauen sollte. `src/core/shell/icons.test.ts`
   riegelt das repo-weit ab — geht der Test rot, liegt die Ursache fast nie in `core/shell`, sondern
   in der Datei, die die Fehlermeldung nennt.
   **Nicht mit Falle 6 zusammenlegen, die Ursachen sind gegenläufig:** dort kommt ein Wert aus einem
   als Client markierten Modul nicht an, hier wertet RSC ein Modul aus, das Client sein müsste. Setzt
   man `"use client"` auf `icons.ts`, verwandelt sich 7 in 6 — HTTP 200 mit **leerer** Map, und der
   Rückfall trägt still das falsche Icon. Laut ist besser als still.
8. **Die Kopfzeile vererbt ihre Zeilenhöhe an jedes Kind** — `antd/es/layout/style/index.js` setzt auf
   `.ant-layout-header` ein `lineHeight` in Kopfzeilenhöhe (hier **64px**), und `position: absolute`
   ändert den enthaltenden Block, **nicht die Vererbungskette**. Gemessen: 82px je Eintrag im Panel
   des App-Umschalters und 76px am Auslöser — in einer 64px hohen Kopfzeile. **Kein Gate findet das:**
   antd spritzt die Regel zur Laufzeit über cssinjs ein, sie steht in **keiner Datei des Repos**, und
   jsdom rechnet keine Zeilenboxen — nur ein echter Browser kennt die Zahl. Abhilfe: `line-height:
   normal` am **gemeinsamen Vorfahren**, nicht an jedem Kind einzeln.
9. **`<Table columns={[{ render: fn }]}>` geht nicht direkt aus einer Server Component** (gemessen
   im Modul `aufgaben`, Aufgabe 11):
   ```
   Error: Functions cannot be passed directly to Client Components unless you explicitly
   expose it by marking it with "use server".
     {title: "Titel", key: "titel", render: function render}
   ```
   antds `Table` ist selbst eine Client-Komponente; ein `columns[].render`, das in einer Server
   Component entsteht, ist eine **gewöhnliche Funktion** — keine Server Action —, und React lehnt
   ab, sie über die RSC-Grenze zu reichen. **Warum kein Gate es sieht:** `pnpm build` prüft
   Modulgrenzen statisch, nicht die tatsächliche Serialisierung eines Requests, und ein `mount()`
   in jsdom ist ein einziger JS-Prozess **ohne RSC-Grenze überhaupt** — `typecheck`/`lint` sowieso
   nicht. Nur ein echter Abruf zeigt es. **Abhilfe** (Vorbild `lagerbuch/verwaltung/(arbeit)/
   LetzteBuchungenTable.tsx`, `aufgaben/_ui/RoutinenTabelle.tsx`): die Tabelle in eine eigene
   `"use client"`-Komponente heben, die nur **serialisierbare** Daten als Prop bekommt und ihre
   `render`-Funktionen selbst definiert. Server Actions dürfen als einzige über die Grenze — aber
   **direkt importiert**, nicht als Prop durchgereicht. **Nicht mit Falle 1 oder 6 zusammenlegen**:
   dort geht es um Compound-Zugriff bzw. um einen Client-Wert in RSC, hier um eine **Funktion, die
   die Grenze überquert**.
10. **Ein POST auf einen Route Handler kann während dessen Erstkompilierung abgebrochen werden**
    (gemessen im Modul `aufgaben`, Aufgabe 19, per CDP-`Network`-Domäne, nicht vermutet). `next dev`/
    Turbopack kompiliert einen Route Handler beim **ersten** Treffer; landet der eigentliche
    `fetch(..., { method: "POST" })` genau in diesem Fenster, löst der HMR-Kanal einen vollen
    Seiten-Reload aus, und der Browser **bricht die laufende Anfrage mit ab** — `net::ERR_ABORTED`,
    `canceled: true`, **nie eine Antwort**. **Das Symptombild führt in die Irre:** keine
    Datenbankzeile, keine Protokollzeile, und ein e2e-Test läuft in sein Zeitbudget mit einer
    Meldung, die nach etwas ganz anderem klingt — isoliert grün, im Verbund rot, was erst an
    Ressourcendruck oder geteilten Zustand denken lässt. **Abhilfe:** ein Warmlauf-GET auf dieselbe
    Route vor dem ersten echten POST (Vorbild `e2e/files-fileshare.spec.ts`, das dieselbe Falle für
    `/api/download/[id]` schon lange kennt — sie stand nur nicht an der Stelle, an der man sie
    sucht). **Daraus folgt eine zweite Testregel:** ein e2e-Test, der eine Anfrage auslöst, **prüft
    ihre Antwort** (`page.waitForResponse`), statt nur auf eine spätere Zustandsänderung zu warten —
    sonst läuft jede abgelehnte Antwort (404, 405, 413, abgebrochen) still ins Zeitbudget und meldet
    sich als etwas anderes.
11. **`locator.dragTo()` löst kein zuverlässiges natives `dragstart` aus** (gemessen im Modul
    `aufgaben`, Aufgabe 20): ein Zug zwischen zwei Tagesspalten lief reproduzierbar in den vollen
    90-Sekunden-Timeout, ohne dass je ein `drop` feuerte — `dragstart` feuerte nur bei einem
    kleinen Zielelement, nie bei einer großen Zielfläche. Eine echte, schrittweise Mausbewegung
    (`page.mouse.move`/`down`/mehrfach `move` mit Pausen/`up`) löst dieselbe Kette zuverlässig aus;
    Chromiums native Drag-Erkennung braucht offenbar eine kontinuierliche Bewegung über eine
    Mindestdistanz, die ein einzelner `dragTo()`-Sprung nicht liefert.

12. **Ein `.click()` auf einen echten Anker navigiert nicht, wenn die Hülle zwischen `mousedown` und
    `mouseup` umbricht** (gemessen im Modul `lagerbuch`, CI-Lauf 31951787232 auf `main`, aus der
    Playwright-Ablaufverfolgung gelesen — nicht vermutet). Playwright meldet den Klick als gelungen,
    der Knoten ist ein `<a href>`, er trägt danach sogar den Fokus — und im Netzwerkteil steht für
    das Ziel **kein einziger Aufruf**. Ursache: Playwright legt beide Mausereignisse auf den Punkt,
    den es **vor** dem Klick berechnet hat; springt die Seite in den ~200 ms dazwischen, trifft
    `mouseup` etwas anderes, und das `click`-Ereignis feuert auf dem gemeinsamen **Vorfahren** —
    einem `<div>`, das nicht navigiert. **Der Auslöser sitzt in der Hülle:** `SessionProvider` holt
    `/api/auth/session` nach, deren erste Aufrufe unter `next dev` noch in die Erstübersetzung
    fallen (`ClientFetchError: Failed to fetch`); mit der Sitzung wechselt die Navigation von der
    schmalen Platzhalter- auf die volle Spalte und der Inhalt rutscht ~240 px hoch. Das passiert
    **nach** `load`, also hinter `page.goto(..., waitUntil: "load")` **und** hinter Playwrights
    eigener Stabilitätsprobe, die vor dem Klick misst. **Kein größeres Zeitbudget und keine
    Wiederholung heilt das** — gewartet wird auf eine Navigation, die nie angestoßen wurde, und die
    Lage hält über alle drei Versuche an. Lokal unsichtbar (warmes `.next`, 20 von 20 Mal grün).
    Abhilfe: `klickeWennRuhig` aus `e2e/fixtures.ts` klickt erst, wenn der Kasten des Elements
    dreimal in Folge stillsteht; dort steht auch die volle Messung mit Bildzeiten.

    **Fallen 10, 11 und 12 sind Testfallen, keine Produktionsfallen** — alle drei gehören zur selben
    Familie wie die zweite Testregel aus Falle 10: Fälle, in denen ein e2e-Test **etwas anderes
    misst, als sein Name sagt**.

Dazu: Hell/Dunkel läuft über `<html data-theme>` (Cookie-Umschalter, **nicht**
`prefers-color-scheme`). Der Umschalter hat drei Zustände, und `auto` ist die Vorgabe — deshalb
**zwei** Cookies: `iuk-theme-pref` trägt die Wahl (`auto|light|dark`), `iuk-theme-system` den
zuletzt vom Client beobachteten OS-Wert, weil der Server `prefers-color-scheme` nicht sieht.
`data-theme` trägt **immer** den aufgelösten Wert `light`/`dark`; ein gestempeltes `auto` besteht
`build` und Vitest und kippt trotzdem jede Modulfläche still auf helle Darstellung. Die Regel für
`src/core` lautet: nur was ein **zweites, heute belegbares** Modul braucht.

Ausführliche Referenzentwürfe: `docs/design/feedback-oeffentliche-ansicht.md` (öffentliche, login-freie
Ansichten) und `docs/design/feedback-admin.md` (Admin-Arbeitsseiten).

## Ein neues Modul registrieren — das Dreieck

Ein Modul mit eigener Datenbank braucht **drei** zusammenpassende Einträge, sonst schlägt der Start
fehl: das Migrationsverzeichnis unter `_db/`, der Eintrag in `MODULE_MIGRATIONS` (`core/bootstrap.ts`),
und die `COPY`-Zeile im `Dockerfile`. Fehlt der dritte, läuft es lokal und bricht im Container.

Datenbanken, die **`core` selbst** führt, stehen in **`CORE_MIGRATIONS`** statt in `MODULE_MIGRATIONS`
(heute: `konto`, der Sitzungswiderruf). Das Dreieck gilt dort unverändert und wird von
`bootstrap.test.ts` über **beide** Listen geprüft. Die zweite Liste existiert, weil der Seed-Test unter
`scripts/` für jeden Eintrag in `MODULE_MIGRATIONS` einen lokalen Seed verlangt — und eine geseedete
Widerrufszeile sperrte den Dev-Nutzer aus.

Modul-Metadaten (Auth, Gruppen, Hosts) stehen in `src/core/registry.ts`; pro Modul überschreibbar per
`SUITE_HOST_<KEY>` und `SUITE_ADMIN_GROUP_<KEY>`.

## Zugriffsschutz

`requiresAuth`/`requiredGroups` im Registry gaten den Modulzugang. Für Datenzugriff **innerhalb** eines
Moduls reicht das nicht: die Objekt-Zugehörigkeit muss serverseitig aus der Datenbank aufgelöst werden,
nie aus einem URL-Parameter (sonst IDOR). Vorbild: `assertGroupAccess` im Modul `feedback`.

Module-Admin ist **nicht** `session.user.isAdmin` — das ist suiteweit („ist Betreiber"). Die Frage
„darf diese Person Modul X verwalten?" beantwortet `isModuleAdmin` aus `core/groups`.

**Gruppen im JWT sind nur so frisch wie der letzte erfolgreiche Token-Refresh.** Sie werden beim
Login gesetzt und bei jedem erfolgreichen Refresh aus dem neuen `id_token` nachgezogen
(`core/auth/refresh.ts`) — der Takt ist damit die Access-Token-Lebensdauer von Pocket ID (heute eine
Stunde, Fosite-Default), nicht die Sitzungsdauer (30 Tage). Zwei Folgen für jedes Modul: ein
Gruppenentzug wirkt mit bis zu einer Stunde Verzug, und wo das zu lang ist, muss die Berechtigung
serverseitig aus der Datenbank aufgelöst werden statt aus `session.user.groups`.

Aufgefrischt wird auf dem Proxy-/Middleware-Pfad (`src/proxy.ts`, dessen `matcher` praktisch jede
Anfrage umfasst) und auf `/api/auth/*` — dort kommt das `Set-Cookie` beim Client an —, **nicht** bei
`auth()` aus einer Server Component: next-auth wirft es dort weg, und `core/auth/config.ts` sperrt
den Refresh auf diesem Pfad zusätzlich selbst (`darfSchreiben: request !== undefined`). Grund ist
Pocket IDs Rotation ohne Gnadenfrist: ein verlorenes neues Refresh-Token macht den nächsten Versuch
zur Wiederverwendung und kostet die ganze Sitzung, nicht nur den Refresh.

`src/proxy.ts` **ist** in Next.js 16 die Middleware (Umbenennung von `middleware.ts`) — wer die Datei
unter dem alten Namen sucht und nichts findet, schließt sonst fälschlich, es gäbe keine. Wer die
Auth-Konfiguration zwischen Objekt- und Funktionsform umstellt, muss `proxy.ts` mit anpassen: bei
Funktions-Config liefert `auth(callback)` ein Promise statt einer Funktion, Next verlangt aber eine
aufrufbare Funktion aus `proxy`/`default`. Das Symptom ist HTTP 500 auf jeder Route; `pnpm build`
sieht es nicht. `src/proxy.test.ts` bewacht die heutige Naht (`pnpm vitest run` schlägt dann fehl) —
das gilt nur für ihre heutige Form; ein Umbau von `proxy.ts` schuldet weiterhin einen Lauf von
`pnpm exec playwright test`, das den Ausfall als einziges immer end-to-end sieht.

## Lokale Demodaten

`pnpm seed:lokal [modul …]` füllt alle fünf datenbankgestützten Module (`scripts/seed-lokal.ts`, je
ein `_lib/seedLokal.ts` pro Modul). Idempotent und rein additiv; das Protokoll nennt die erzeugten
Links, Codes und Passwörter.

**Bewusst nicht am Boot-Pfad**, und der Grund ist keine Stilfrage: `shouldSeed()` ist
`SUITE_SEED === "1" || NODE_ENV === "development"`, und `SUITE_SEED=1` ist der **Generalproben**-
Schalter. Der Boot-Seed ist also nicht lokal-only — genau darauf beruhen die zwei ausgeschriebenen
Ausschlüsse in `core/bootstrap.ts` (ein geseedeter files-Abgabelink wäre in einer Generalprobe ein
gültiger anonymer **Schreib**zugang; lagerbuch bekäme über `getModuleDb()` eine Verbindung ohne
`lb_falte`). `scripts/seed-lokal.test.ts` hält beides fest: jedes Modul aus `MODULE_MIGRATIONS`
braucht einen Seed, und ein Quelltext-Scan verbietet die Namen `seedLokal`/`seed-lokal` in
`bootstrap.ts` und `instrumentation.ts` — er fängt die naheliegende Verdrahtung, nicht jede
denkbare (ein umbenanntes Re-Export käme durch).

## Release Notes — für Anwender, nur im Portal

**Wer eine Änderung ausliefert, die jemand bemerkt, schreibt eine Notiz dazu.** Bemerkbar heißt: eine
neue Fläche, ein neuer Knopf, ein anderer Weg, ein anderes Wort auf dem Bildschirm, ein Ergebnis, das
anders aussieht als gestern. Umbauten unter der Haube, Tests, CI, Abhängigkeiten bekommen keine —
eine Notiz über etwas, das niemand sehen kann, macht die Liste unglaubwürdig, nicht vollständig.

**Zwei Fälle sind nicht verhandelbar: ein neues Feature und eine spürbare Verbesserung.** Für beide
gehört eine Notiz in denselben Commit wie die Änderung — nicht „später nachgetragen", denn nachgetragen
wird sie nicht. Ein Feature ist etwas, das vorher nicht ging; eine spürbare Verbesserung ist etwas,
das vorher ging und sich jetzt anders anfühlt (eine Fläche, die auf dem Telefon endlich bedienbar ist;
ein Weg, der kürzer wurde; eine Ansicht, die sich neu ordnet). Im Zweifel gilt die Probe: **Würde
jemand, der die App gestern benutzt hat, den Unterschied heute bemerken?** Ja → Notiz. Und sie ist
**für Anwender geschrieben, nicht für Entwickler** — verständlich, so wenig technisch wie möglich,
in den Wörtern, die auf dem Bildschirm stehen. Der ausführliche Stil steht unten und ist verbindlich.

**Eine Datei je Notiz**, `src/app/m/portal/_lib/neuigkeiten/notizen/<modul>/<YYYY-MM-DD>-<slug>.ts`,
plus **eine Zeile in `register.ts`**. Das Dreieck ist Dateiname ↔ Felder (`modul`, `datum`, `slug`) ↔
Registerzeile; `register.test.ts` liest das Verzeichnis und hält alle drei zusammen — eine nicht
eingetragene Notiz ist ein roter Test und keine stille Auslassung. Kein Markdown, kein `fs`, keine
Datenbank: die Notiz ist ein importiertes Modul und liegt im Bundle (Begründung im Kopf von
`typen.ts`, kurz: alles andere kostet eine `COPY`-Zeile im `Dockerfile`, die zu vergessen still ist).
`datum` ist der Tag des **Rollouts**, nicht des Commits.

**Sichtbar ausschließlich im Portal**, unter `/neuigkeiten`. Kein Modul importiert
`portal/_lib/neuigkeiten` — auch dafür gibt es einen Quelltext-Scan in `register.test.ts`, weil ein
`import` diese Regel bricht, ohne dass ein Tor rot wird. **Wer eine Notiz sieht, entscheidet die
Kachelliste**: sichtbar sind die Apps aus `visibleSwitcherModules`, keine zweite Rechteprüfung
daneben. Modultitel und Zeichen stehen in `core/registry.ts` und werden in der Notiz **nicht**
wiederholt.

**Der Stil ist verbindlich, nicht empfohlen** — die Notizen sind das einzige, was die Suite von sich
aus an ihre Anwender schreibt:

* **Für Anwender.** Kein Dateiname, kein Funktionsname, keine Versionsnummer, kein Commit, kein
  Ticket, kein Framework. Wenn ein Satz nur mit Kenntnis des Quelltextes verständlich ist, gehört er
  nicht hinein.
* **Du-Form, Präsens, aktiv** — wie der Rest der Oberfläche.
* **Der erste Absatz sagt, was jetzt anders ist.** Er ist zugleich die Zusammenfassung; ein
  Teaser-Feld gibt es deshalb nicht. Kein „In diesem Release", kein „Wir freuen uns".
* **Nenne den Weg mit den Wörtern, die auf dem Bildschirm stehen** („Verwaltung → Checklisten",
  „Von allen Geräten abmelden"). Eine Notiz, nach der man suchen muss, hat ihre Aufgabe verfehlt.
* **Schreib die Begründung dazu, nicht ein Adjektiv davor.** „Der Druckdialog liefert je nach Browser
  ein anderes Blatt" trägt; „deutlich verbessert" trägt nichts. Verboten sind Werbewörter
  (nahtlos, intuitiv, leistungsstark, ab sofort noch besser), Ausrufezeichen und Emoji.
* **Höchstens ein `hinweis` je Notiz, und nur wenn wirklich etwas zu tun ist.** Zwei Aufforderungen
  heißen: es sind zwei Änderungen, also zwei Notizen. `register.test.ts` erzwingt beides.
* **Sag auch, was gleich bleibt**, wenn die Frage naheliegt („Adressen und Lesezeichen bleiben") —
  die häufigste stille Sorge nach einer Änderung.
* **Drei bis fünf Absätze.** Der Titel ist eine Aussage („Fahrzeug-Checklisten als PDF"), kein Etikett
  („Neues Feature: PDF-Export"), und wiederholt den App-Namen nicht.
* **Kein Markdown im Text.** Er wird als Textknoten gerendert; `**fett**` käme mit Sternchen auf dem
  Bildschirm an. Auch das prüft `register.test.ts`.

## Cutover einer Alt-Anwendung

Runbooks liegen in `docs/runbooks/`. Muster: Generalprobe mit Snapshot-Kopie → Freeze → echter Snapshot
→ Volume sichern → Import mit Paritätscheck → Verifikation gegen einen ephemeren Container ohne
Traefik-Labels → Router umschwenken (nie zwei Router gleichzeitig aktiv) → 2 Wochen Standby.

**Paritätscheck beweist den Datenbank-Rundlauf, nicht die Richtigkeit der Feldzuordnung.** Ein
konsistenter Mapping-Fehler ist paritätsgrün. Deshalb zusätzlich feldweise Stichproben gegen die
Alt-Anwendung.

## Tests

`pnpm typecheck` · `pnpm lint` (Fehler blockieren die CI, Warnungen nicht) · `pnpm vitest run` ·
`pnpm build` · `pnpm exec playwright test`.

⚠️ **`typecheck` läuft mit `--pretty false`, und das ist kein Geschmack.** RTKs tsc-Filter
(gemessen an 0.45.0) meldet `TypeScript: No errors found`, wenn tsc seine pretty-Form ausgibt — und
die wählt tsc in jeder TTY selbst. Das Flag macht die Ausgabe formatstabil. Der zweite Stolperstein
ist pnpms eigene farbige Kopfzeile; dagegen steht `NO_COLOR=1` in Claude Codes `env`. **Wer das Tor
außerhalb dieser Umgebung fährt, prüft den Exit-Code** — nicht die Meldung, und niemals mit
`grep "error TS"` auf farbigem Output (dort steht eine ANSI-Sequenz zwischen `error` und `TS`, und
`grep` zählt 0). Hintergrund: NT7 in
`docs/superpowers/plans/2026-08-18-radio-ausfuehrungsplan.md`.

Für DOM-Verhalten gibt es ein etabliertes Harness: `src/app/m/qr/_lib/test-dom.tsx`
(`mount`/`fill`/`click`/`query`/`submitForm`) — kein zweites erfinden.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
