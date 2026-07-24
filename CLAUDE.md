# iuk-suite — Projektanweisungen

Next.js 16 (App Router, RSC) · Ant Design 6 · Drizzle + better-sqlite3 · Auth.js v5 (Pocket ID) ·
Vitest + Playwright. Eine SQLite-Datenbank **pro Modul**.

## Bevor du Oberfläche baust: `docs/design/` lesen

`docs/design/README.md` enthält die verbindlichen Querschnittsregeln — insbesondere **vier Fallen, die
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
