# Spec 1 — IuK-Suite: Lauffähiges Skelett (Walking Skeleton)

- **Datum:** 2026-07-17
- **Status:** freigegeben (Brainstorming), Implementierungsplan folgt
- **Kontext:** Phase 1 des Konsolidierungsplans ([APP-KONSOLIDIERUNG.md](../../../../APP-KONSOLIDIERUNG.md), Fortschritt in [KONSOLIDIERUNG-PROGRESS.md](../../../../KONSOLIDIERUNG-PROGRESS.md))
- **Teil 1 von 2:** Dieser Spec ist das lokal lauffähige Skelett. **Spec 2** (Produktivmachen + Cutover) folgt separat.

## 1. Ziel & Scope-Grenze

Ein lokal lauffähiger Next.js-Monolith, der den **architektonischen Keystone der Suite beweist**:
ein Container, mehrere Hosts, ein Login, pro Host die richtige Shell — end-to-end verifiziert per
Playwright-E2E über mehrere lokale Hosts.

Phase 1 wurde nach **Risiko** in zwei Specs geschnitten, damit Architektur-Risiko (dieser Spec) nicht
mit Ops-/Migrations-Risiko (Spec 2) vermischt wird.

**In Scope (Spec 1):**
- Repo-Gerüst `iuk-suite` (Next.js 16, TS, Tailwind 4, shadcn, Drizzle, better-sqlite3, next-auth v5)
- Modul-/Registry-Konvention + Host-Routing-Middleware
- Ein-OIDC-Client-SSO gegen Pocket ID, Session über Subdomains
- Drei Shell-Varianten (Voll / Minimal / Kiosk)
- Eine SQLite-Datei pro Modul + Health-Endpoints
- Keystone-Beweis mit Wegwerf-Modulen, danach **Portal** als erstes echtes Modul
- Lokale Verifikation per Playwright-E2E + vitest

**Out of Scope (→ Spec 2):**
- Dockerfile / Compose-Stack / Volume
- CI (multi-arch-Image nach ghcr.io, E2E-Smoke pro Domain in CI)
- Backup-Job für das Datenvolume
- Postgres→SQLite-**Import-Skript** mit Paritätscheck (Portal läuft in Spec 1 auf Seed-Daten)
- Generalprobe mit Prod-Snapshot, Proxy-Cutover, Standby/Abbau

## 2. Entscheidungen (aus dem Brainstorming)

| # | Entscheidung | Begründung |
|---|---|---|
| D1 | Phase 1 in **2 Specs nach Risiko** schneiden; dieser Spec = Skelett lokal | Architektur-Risiko isoliert vom Ops-/Migrations-Risiko |
| D2 | Neues Repo `~/dev/personal/drk/iuk-suite` (frisches `git init`) | Wie alle Geschwister-Repos; ab Tag 1 versioniert |
| D3 | Host→Modul per **Middleware-Rewrite auf Route-Groups** | Standard-Next-Muster; Host-Logik lebt nur in der Middleware, Modul-Routen bleiben host-ahnungslos |
| D4 | Session-Cookie-Domain **per Env** (`.iuk-ue.de` prod / `.localtest.me` dev) | SSO über Subdomains, lokal testbar ohne Server |
| D5 | Keystone **zuerst mit Wegwerf-Modulen** beweisen, dann Portal | Nichts Echtes portieren, bevor das Fundament nachweislich trägt |
| D6 | Portal-**Admin-CRUD** in Spec 1 mitnehmen (klein); Daten-**Import** erst Spec 2 | CRUD ist billig; der riskante Teil (Prod-Daten) gehört zum Cutover |

## 3. Repo & Stack

Pfad: `~/dev/personal/drk/iuk-suite`.
Stack: **Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui + Drizzle + better-sqlite3 + next-auth v5** —
der Stack, in dem iuk-overview und lagerbuch bereits laufen.

```
core/                       Gemeinsames (edge-sicher wo nötig)
  registry.ts               Modul-Registry (pure Daten, edge-sicher)
  auth/                     next-auth v5 / Pocket ID (ein OIDC-Client)
  shell/                    Voll- / Minimal- / Kiosk-Shell + App-Switcher
  db/                       better-sqlite3-Helper (Node-only)
  health/                   Health-Bausteine
app/
  m/<modul>/               Modul-Routen (host-gerewritet)
    page.tsx  api/  _db/schema.ts  __tests__/
  api/health/<modul>/       Health-Endpoints
proxy.ts                    Host→Modul-Rewrite (Next-16-Middleware-Datei)
docs/superpowers/specs/     dieser Spec
```

**Bewusste Abweichung vom Plan-Wortlaut:** Der Plan schrieb `modules/<name>/` mit „eigenen Routen".
Next.js erzwingt Routen unter `app/`. Modul-Routen leben deshalb unter `app/m/<modul>/` — einem
**normalen, routbaren** Pfadsegment `m/`, auf das die Middleware host-basiert rewritet und das die
Module sauber namespaced (`/m/alpha/…` ≠ `/m/beta/…`); der Nutzer sieht das Segment nie (interner Rewrite).
⚠️ Wichtig (Next-16-Falle): `_`-präfigierte Ordner sind **Private Folders** und komplett vom Routing
ausgeschlossen — daher NICHT als Route-Gruppierung nutzbar. Sie eignen sich nur für colocated
Nicht-Routen wie `_db/`, `_lib/` innerhalb eines Moduls. Gemeinsames in `core/`.

**Next-16-Hinweis (Implementierung):** Die Middleware-Datei heißt `proxy.ts`
(vgl. `iuk-overview/src/proxy.ts`: `export { auth as proxy }`). Vor dem Schreiben von
Routing-/Auth-Code die Docs unter `node_modules/next/dist/docs/` lesen (Breaking Changes ggü. Trainingsstand).

## 4. Modul-Registry — `core/registry.ts`

Die **eine Quelle der Wahrheit**. Reine, **edge-sichere** Daten (kein DB-/better-sqlite3-Import),
damit die Middleware sie nutzen kann. Pro Modul:

```ts
{
  key: string            // z.B. "portal", "qr", "alpha"
  hosts: string[]        // env-gemappt: dev *.localtest.me, prod *.iuk-ue.de
  title: string
  icon: string
  requiredGroups: string[]   // OIDC-Gruppen; leer = kein Auth-Zwang
  shell: 'full' | 'minimal' | 'kiosk'
  nav?: NavEntry[]
}
```

Speist: (a) Host-Routing der Middleware, (b) App-Switcher, (c) Portal-Kacheln,
(d) Shell-Auswahl im Layout. Host-Mapping ist env-getrieben, sodass dieselbe Registry lokal
(`*.localtest.me`) und in Prod (`*.iuk-ue.de`) funktioniert.

## 5. Host-Routing — `proxy.ts`

Liest den Host-Header → `registry.byHost[host]` → `rewrite('/m/' + modul + pfad)`.
Unbekannter Host → Portal-Fallback bzw. 404. Edge-sicher, weil die Registry pure Daten ist
(better-sqlite3 wird **nie** in der Middleware importiert).
Matcher schließt aus: `_next/*`, `api/auth`, `api/health`, statische Assets, `favicon`, `login`.

## 6. Auth / SSO — `core/auth`

**Ein** next-auth-v5-/Pocket-ID-OIDC-Client — portiere `iuk-overview/src/lib/auth.ts` nahezu 1:1
(OIDC-Provider, JWT-Strategie, Gruppen-Claim, Refresh-Token-Handling). **Eine** kanonische Callback-URL.

- **Session-Cookie-Domain per Env:** prod `.iuk-ue.de`, dev `.localtest.me` → eine Session gilt über
  alle Subdomains = SSO.
- **Autorisierung** pro Modul über `registry.requiredGroups` × Session-Gruppen.
- **Anonyme/Token-Zugänge** (Minimal-Shell-Module/-Routen) umgehen den Auth-Zwang gezielt
  (`requiredGroups: []`).

**Keystone-Beweis:** Cookie auf der Apex → Besuch von `alpha.localtest.me` und danach
`beta.localtest.me` ohne erneuten Login.

## 7. Shell — `core/shell` (3 Varianten, per Registry gewählt)

| Variante | Rahmen | Für wen |
|---|---|---|
| **Voll** | Header, App-Switcher (Waffel, aus Registry, gefiltert auf Session-Gruppen), Benutzermenü, Dark Mode | eingeloggte interne Nutzer |
| **Minimal** | nur Logo + Modulname, kein Switcher | anonyme/Token-Zugänge |
| **Kiosk** | keine Chrome, Fullscreen-Touch | Kiosk-Oberflächen |

Das Layout wählt die Variante anhand des aufgelösten Moduls (`registry[modul].shell`).
Design-Tokens: Tailwind-4-`@theme` mit den DRK-Tokens aus `lagerbuch/src/app/globals.css`
(DRK-Rot `#c8000f`, Regalgrau, Ampelfarben) + shadcn-Primitives aus iuk-overview.
Dark Mode via next-themes.

## 8. Daten — `core/db` + pro Modul

better-sqlite3 (WAL), **eine Datei pro Modul** unter `${DATA_DIR}/<modul>.db`
(dev → `./.data/`, prod später `/data/` in Spec 2). Jedes Modul besitzt sein Drizzle-Schema
(`app/m/<modul>/_db/schema.ts`) und einen `getDb()`-Helper; drizzle-kit pro Modul.
**Nur Node-Runtime** — nie in der Middleware/Edge importieren.

## 9. Health — `core/health`

`/api/health/<modul>` pro Modul (öffnet die Modul-DB, gibt `ok`) plus Suite-`/api/health`.

## 10. Keystone-Beweis (Wegwerf-Module) → dann Portal

**Erst drei Wegwerf-Module**, um alle drei Shells + SSO nachzuweisen, bevor etwas Echtes portiert wird:

- `alpha` — Voll-Shell, Gruppe erforderlich → `alpha.localtest.me`
- `beta` — Minimal-Shell, anonym → `beta.localtest.me`
- `kioskdemo` — Kiosk → `kioskdemo.localtest.me`

E2E beweist: Host → richtiges Modul + richtige Shell; Login einmal auf `alpha`, `beta` ohne Re-Login;
Kiosk ohne Chrome; `alpha` für Unberechtigte verborgen.

**Dann Portal** als erstes echtes Modul:
- Registry-getriebene Kacheln + der App-Switcher als Vollbild.
- Externe Services aus der `services`-Tabelle — SQLite-Port des iuk-overview-Schemas
  (`iuk-overview/src/db/schema.ts`: `slug, name, description, url, iconUrl, category, tags,
  requiredGroups, isPublic, isActive, sortOrder, openInNewTab, …`), gefiltert auf Session-Gruppen.
- **Admin-CRUD** des Portals in Spec 1 mitgenommen (klein).
- Läuft auf lokaler SQLite mit **Seed-Daten**; der echte Postgres→SQLite-Import ist Spec 2.

## 11. Verifikation (lokal)

- **Playwright-E2E** über die `localtest.me`-Hosts — der eigentliche Keystone-Beweis
  (Host→Modul+Shell, SSO, Gruppen-Gating, Kiosk-Chrome).
- **vitest**-Unit für Registry-Auflösung und RBAC-Filter.
- `pnpm dev` mit Multi-Host. **Kein Server, kein Docker.**

## 12. Referenzen (Quell-Codebases)

- `iuk-overview/src/lib/auth.ts` — OIDC/Pocket-ID-Setup (Port-Vorlage)
- `iuk-overview/src/proxy.ts` — Next-16-Middleware-Muster
- `iuk-overview/src/db/schema.ts` — `services`-Tabelle (Portal-Datenmodell)
- `lagerbuch/src/app/globals.css` — DRK-Design-Tokens
- `lagerbuch` — better-sqlite3 + Playwright-E2E-Muster

## 13. Offene Punkte für Spec 2 (nur Merkzettel)

- Konkrete Prod-Subdomains je Modul aus der Proxy-Config erfassen (nur Apex `iuk-ue.de` belegt).
- Import-Skript Portal (Postgres `services` → `portal.db`) + Paritätscheck.
- Docker/Compose, CI, Backup, Generalprobe, Cutover.
