# iuk-suite — Projektanweisungen

Next.js 16 (App Router, RSC) · Ant Design 6 · Drizzle + better-sqlite3 · Auth.js v5 (Pocket ID) ·
Vitest + Playwright. Eine SQLite-Datenbank **pro Modul**.

## Bevor du Oberfläche baust: `docs/design/` lesen

`docs/design/README.md` enthält die verbindlichen Querschnittsregeln — insbesondere **sechs Fallen, die
`pnpm build` nicht findet** und die je einen halben Tag kosten:

1. **Compound-Zugriff auf antd in einer Server Component ergibt HTTP 500** (`Typography.Title`,
   `Form.Item`, `Descriptions.Item`, `List.Item`, `Input.TextArea` … — vollständige Liste dort).
   `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag` sind sicher.
2. **`--ant-*`-CSS-Variablen sind nicht global** — antd deklariert sie auf seiner Scope-Klasse. Eigenes
   Markup sieht sie nicht, und der Fehler ist still (die Linie verschwindet einfach).
3. **`colorError === colorPrimary === #c8000f`** — ein `Alert type="error"` sieht aus wie eine
   Primäraktion. In Modulen, wo Rot fachliche Bedeutung trägt, gehört Rot nie auf eine Datenfläche.
4. **`size="large"` ist 72px** — `controlHeight: 56` ist die Vorgabe und schon das richtige Maß, also
   `size` gar nicht setzen.
5. **Eigenes CSS gegen antd-CSS entscheidet die Spezifität, meist gegen dich** — und immer still: die
   Regel steht richtig da und greift nur nicht. Drei Ausprägungen (Gleichstand → antd gewinnt durch
   Reihenfolge · eigene Regel zu schwach · eigene Regel zu stark und trifft das eigene Modul). Wo antd
   einen **Token** anbietet, ist der Token besser als jede Spezifität.
6. **Ein `WERT` aus einem `"use client"`-Modul kommt in einer Server Component nicht an** — sie bekommt
   eine Client-Referenz statt des Wertes, HTTP 500 für die ganze Seite. TypeScript ist zufrieden, `build`
   findet nichts, und **Vitest kann es strukturell nicht finden** (dort ist `"use client"` ein
   wirkungsloser String). Werte für Server Components gehören in ein Modul ohne `"use client"` (`_lib/`).

Dazu: Hell/Dunkel läuft über `<html data-theme>` (Cookie-Umschalter, **nicht**
`prefers-color-scheme`), und die Regel für `src/core` lautet: nur was ein **zweites, heute belegbares**
Modul braucht.

Ausführliche Referenzentwürfe: `docs/design/feedback-oeffentliche-ansicht.md` (öffentliche, login-freie
Ansichten) und `docs/design/feedback-admin.md` (Admin-Arbeitsseiten).

## Ein neues Modul registrieren — das Dreieck

Ein Modul mit eigener Datenbank braucht **drei** zusammenpassende Einträge, sonst schlägt der Start
fehl: das Migrationsverzeichnis unter `_db/`, der Eintrag in `MODULE_MIGRATIONS` (`core/bootstrap.ts`),
und die `COPY`-Zeile im `Dockerfile`. Fehlt der dritte, läuft es lokal und bricht im Container.

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

Für DOM-Verhalten gibt es ein etabliertes Harness: `src/app/m/qr/_lib/test-dom.tsx`
(`mount`/`fill`/`click`/`query`/`submitForm`) — kein zweites erfinden.
