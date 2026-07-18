# Spec 2 — Portal produktiv machen (bis grüne Generalprobe)

> Phase 1 der IuK-Suite-Konsolidierung, zweiter Zuschnitt. Spec 1 (lokales Skelett) ist
> fertig & auf `main`. Dieses Dokument beschreibt Spec 2: die Suite deploybar,
> CI-abgesichert und für den Portal-Cutover bereit machen.
>
> Plan & Architektur: [`../../../../APP-KONSOLIDIERUNG.md`](../../../../APP-KONSOLIDIERUNG.md) ·
> Arbeitsstand: [`../../../../KONSOLIDIERUNG-PROGRESS.md`](../../../../KONSOLIDIERUNG-PROGRESS.md) ·
> Spec 1: [`2026-07-17-iuk-suite-skeleton-design.md`](2026-07-17-iuk-suite-skeleton-design.md)

## Ziel & Scope-Grenze

Die Suite als Container deploybar machen, per **Traefik** auf `iuk-ue.de` routbar, mit
CI-Absicherung (E2E pro Domain), einem lokalen Backup, und einem **idempotenten
Import-Skript + generischer Paritäts-Harness**. Portal ist die risikoarme Generalprobe des
Import-/Paritäts-Musters, das später die harten Module trägt (`files`/`lagerbuch`/`radio`
mit gedruckten QR-Codes & externen API-Tokens im Umlauf).

**Deliverable-Grenze (bestätigt):** Spec 2 endet bei einer **grünen Generalprobe** gegen
einen Prod-nahen Datensatz plus einem geschriebenen Cutover-Runbook. Der eigentliche
Produktiv-Umschwenk (Traefik-Host-Regel umhängen) ist eine manuelle Operation, die der
Betreiber nach dem Runbook ausführt — kein Code in diesem Spec. Rollback ist architektonisch
frei (Flip zurück + Alt-Container an), wird also nicht als Tooling gebaut.

## Rahmenbedingungen (erfragt / abgeleitet)

| Frage | Antwort |
|---|---|
| Proxy/Routing | **Traefik (Docker-Labels)**, Netzwerk `proxy` (extern), Entrypoint `web` (:80). **Kein TLS/certresolver in Traefik** — TLS terminiert an Cloudflares Edge, cloudflared reicht plain HTTP an `traefik:80`. Cutover = Host-Regel `iuk-ue.de` vom Alt-Container auf `suite` umhängen (genau ein Router pro Host aktiv). |
| Prod-Snapshot für Generalprobe | **Synthetisch für jetzt.** Echten `pg_dump` zieht der Betreiber direkt vor dem Cutover nach demselben Runbook. Entkoppelt die Code-Deliverables von Prod-Zugang. |
| Backup-Ziel | **Erstmal lokal** (`sqlite .backup` + tar am Host). Externes Ziel (rclone/rsync) bewusst offen für ein Folge-Modul; Portal-Daten bleiben 2 Wochen in Postgres-Standby. |
| Portal-Domain | **`iuk-ue.de` (Apex)** → `prodHosts: ["iuk-ue.de"]` in der Registry. SSO-Cookie sitzt ohnehin auf `.iuk-ue.de`. |
| Deploy-Mechanismus | Angenommen: SSH + `docker compose pull && up -d` (zu bestätigen). |
| Dev-Login-Gating | `AUTH_DEV_LOGIN=true` erzwingt Dev-Login auch im Prod-Build (`next start`) — belegt in `src/core/auth/devLogin.ts` + Tests. Trägt die CI-E2E ohne Pocket ID. |

### Bestehende Muster (Vorlagen aus dem Bestand)

- **Dockerfile**: `iuk-overview/Dockerfile` — Multi-Stage node:22-alpine, corepack/pnpm,
  `output: standalone`, non-root (uid 1001), `start.sh` mit DB-Schritt beim Start.
- **CI**: `iuk-overview/.github/workflows/build-and-publish.yml` — Buildx + QEMU, Multi-Arch
  `linux/amd64,linux/arm64`, ghcr.io, `metadata-action` (tags sha/branch/latest), cache=gha.
  Baut heute **ohne** Tests; Spec 2 stellt einen `test`-Job davor.
- **Compose**: `iuk-overview/compose.yaml` — Image aus ghcr, Healthcheck via wget,
  restart unless-stopped. **Keine** Proxy-Labels in der App-Compose → Proxy ist zentral.
- Suite hat `output: "standalone"` und `allowedDevOrigins: ["*.localtest.me"]` bereits gesetzt.

## Architektur & Komponenten

### 1. Containerisierung — `Dockerfile`, `start.sh`, `scripts/migrate.ts`

- Multi-Stage wie iuk-overview: `deps` → `builder` (`pnpm build`) → `runner` (standalone,
  non-root). `NEXT_TELEMETRY_DISABLED=1`, `HOSTNAME=0.0.0.0`, `PORT=3000`.
- **Startup**: `start.sh` ruft `scripts/migrate.ts`, dann `node server.js`.
  - `scripts/migrate.ts` iteriert über jedes Modul mit `src/app/m/<key>/_db/migrations/`
    und fährt die Drizzle-Migrationen **programmatisch** via `migrate()` aus
    `drizzle-orm/better-sqlite3/migrator` gegen `${DATA_DIR}/<key>.db` (WAL).
    **Kein `drizzle-kit` im Runtime-Image** (Unterschied zu iuk-overviews `push`).
    Skaliert per Design auf N Module; heute nur `portal`.
  - **Kein Auto-Seed in Prod** — die Prod-`portal.db` entsteht aus dem Import (§4), nicht aus
    `seed.ts`. Seeding bleibt Dev-/E2E-/Generalprobe-Sache.
- `DATA_DIR=/data`. Healthcheck im Image/Compose: wget auf `/api/health/portal`.
- Runtime-Image muss `better-sqlite3` (native) + die Migrations-SQL + `drizzle-orm` enthalten
  — im `runner`-Stage entsprechend mitkopieren.

### 2. Compose-Stack — `compose.yaml` (+ `.env.example`)

```yaml
services:
  suite:
    image: ghcr.io/rubenvitt/iuk-suite:latest
    restart: unless-stopped
    environment:
      - DATA_DIR=/data
      - AUTH_URL / AUTH_SECRET / AUTH_TRUST_HOST=true
      - AUTH_COOKIE_DOMAIN=.iuk-ue.de
      - POCKET_ID_ISSUER / POCKET_ID_CLIENT_ID / POCKET_ID_CLIENT_SECRET / POCKET_ID_SCOPES
      # Modul-Präfixe für spätere Module: FILES_… / RADIO_… …
    volumes:
      - suite_data:/data
    networks: [proxy]
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/api/health/portal"]
    labels:
      - traefik.enable=true
      - traefik.docker.network=proxy
      - traefik.http.routers.iuk-suite.rule=Host(`iuk-ue.de`)
      - traefik.http.routers.iuk-suite.entrypoints=web
      - traefik.http.services.iuk-suite.loadbalancer.server.port=3000
volumes:
  suite_data:
networks:
  proxy:
    external: true
```

- Konkrete Werte: Netzwerk **`proxy`** (extern), Entrypoint **`web`** (:80),
  Router-/Service-Name **`iuk-suite`**, Container-Port **3000**.
- **Kein `tls`/`certresolver`-Label** — TLS terminiert an Cloudflares Edge, cloudflared reicht
  plain HTTP an `traefik:80`; Traefik kennt nur den `web`-Entrypoint. Ein certresolver-Label
  würde Traefik ein nie gebrauchtes Zertifikat beschaffen lassen.
- **Ein OIDC-Client**, Session-Cookie auf `.iuk-ue.de`. Kein ClamAV (Phase 4).
- **Router-Kollision beim Cutover:** Suite-Router `Host(\`iuk-ue.de\`)` und der gleichnamige
  iuk-overview-Router dürfen nie gleichzeitig aktiv sein. Cutover = genau einen enablen, den
  anderen disablen. Pre-Cutover-Verify läuft daher per Host-Header direkt gegen den Container
  (nicht über den kollidierenden Traefik-Router) — siehe §6.

### 3. CI — `.github/workflows/ci.yml`

- **Job `test`**: `pnpm install --frozen-lockfile`, dann `lint` · `typecheck` · `test`
  (vitest) · `e2e`. Playwright läuft gegen **`next dev`** (gesät, `AUTH_DEV_LOGIN=true`,
  **ungesetztem** Pocket ID) — zuverlässiger als gegen den Prod-Build; das echte
  Artefakt wird separat über `build-push` + `image-smoke` validiert. E2E deckt mehrere
  Domains/Shells ab: portal (full) + die vorhandenen Minimal-/Kiosk-Hosts über
  `.localtest.me` (`moduleForHost` matcht `.localtest.me` unabhängig von `prodHosts`).
- **Job `build-push`** (`needs: test`): Buildx + QEMU, `linux/amd64,linux/arm64` → ghcr.io,
  tags sha/branch/latest, cache=gha. **Push nur auf main** (nicht bei PR).
- **`image-smoke`** (günstig, nach dem Build): `docker run` des frischen Image, `curl`
  `/api/health/portal` mit Host-Header — validiert das echte Artefakt End-to-End.

> Entschieden (siehe Plan): CI bleibt bei `next dev -p 3100` (wie lokales `pnpm e2e`) —
> zuverlässiger als ein Prod-Build im E2E-Job. Dev-Login bleibt per `AUTH_DEV_LOGIN=true`
> erzwungen. Das Prod-Artefakt selbst wird über `build-push` + `image-smoke` geprüft.

### 4. Import + Paritäts-Harness — `scripts/import/`

- **`parity.ts` (generisch, wiederverwendbar)**: vergleicht Quelle vs. Ziel über
  Zeilenzahlen, Spalten-Checksums/Hashes und Stichproben-Diff; **bricht bei Abweichung ab**
  und druckt einen Report. Das ist die Vorlage für `files`/`lagerbuch`/`radio`, wo Tokens/IDs
  1:1 überleben müssen (siehe Plan §5.3).
- **`portal.ts`**: liest Postgres `services` (aus `pg_dump`/SQL-Fixture oder live),
  mappt Feld für Feld:
  - `uuid → text` — **IDs 1:1 erhalten** (obwohl Portal keine öffentlichen Links im Umlauf
    hat, wird der ID-Preservation-Pfad hier bewusst geübt).
  - `text[] → JSON`-Text (`tags`, `requiredGroups`).
  - `boolean → integer` (`isPublic`, `isActive`, `openInNewTab`).
  - `timestamp → epoch`-Integer (`createdAt`, `updatedAt`).
  - schreibt **idempotent** nach `portal.db` (Upsert/`onConflictDoNothing` per `id`/`slug`),
    ruft danach `parity.ts`.
- **Unit-Tests** gegen synthetische Daten — kein Prod-Zugang nötig. Quell- & Ziel-Schema:
  `iuk-overview/src/db/schema.ts` (pg) → `src/app/m/portal/_db/schema.ts` (sqlite); beide
  sind bereits fast deckungsgleich.

### 5. Backup — `scripts/backup.sh`

Pro `<modul>.db`: `sqlite3 <db> ".backup <ziel>"` (konsistent trotz WAL) + `tar` über `/data`
(inkl. späterem `files/`), Ablage in lokalem `/data/backups/` (bzw. gemountetem Host-Ordner)
mit Rotation (z. B. 7 Tage). Als Host-/Compose-Cron dokumentiert. Externes Ziel bleibt offen.

### 6. Generalprobe + Cutover-Runbook — `docs/runbooks/portal-cutover.md`

**Generalprobe (in Spec 2 grün zu bekommen):** synthetischer, Prod-naher `services`-Datensatz
als `pg_dump`-Format-Fixture → `import/portal.ts` + `parity.ts` grün → Smoke gegen die Suite
mit Host-Header `iuk-ue.de`: Portal-Kacheln rendern, Admin-CRUD, Gruppen-Gating (403).

**Runbook (Doku, vom Betreiber ausgeführt):**
1. Generalprobe grün (automatisierbar).
2. Freeze: iuk-overview read-only/stoppen (kurzes Fenster).
3. Echten `pg_dump` der `services`-Tabelle ziehen.
4. `import/portal.ts` gegen den Snapshot → `portal.db`.
5. Paritätscheck grün (sonst Abbruch + Report).
6. Verify: Smoke gegen die Suite per Host-Header, **vor** dem Flip.
7. Cutover: Traefik-Router `Host(\`iuk-ue.de\`)` auf `suite` umhängen.
8. Standby 2 Wochen → dann iuk-overview-Stack + Postgres abbauen, Repo archivieren.
- **Rollback** = Router zurück + Alt-Container an. Sekunden, kein Tooling.

## Getroffene Entscheidungen (YAGNI)

- **Wegwerf-Module (`alpha`/`beta`/`gamma`/`kioskdemo`) bleiben vorerst.** Sie liefern die
  Multi-Shell-E2E-Abdeckung (minimal/kiosk), die Portal allein nicht hat, und sind in Prod
  unerreichbar (`prodHosts: []` → `moduleForHost` matcht sie nur auf `.localtest.me`).
  Entfernen, sobald echte Module alle drei Shell-Varianten abdecken.
- **Kein ClamAV** (Phase 4 mit `files`), **kein externes Backup** (Folge-Modul),
  **kein Renovate** (später) in Spec 2.
- **Startup migriert nur, seedet nicht** — die Prod-DB kommt aus dem Import.
- **Generalprobe synthetisch**, echter Snapshot erst zur Cutover-Zeit → Code-Deliverables
  brauchen keinen Prod-Zugang.

## Zu klären beim Bauen (keine Blocker)

- Deploy-Mechanismus bestätigen (Annahme: SSH + `compose pull && up -d`).
- `AUTH_URL`/Callback-URL des einen OIDC-Clients für die Apex-Domain.

Traefik-Werte sind geklärt: Netzwerk `proxy` (extern), Entrypoint `web`, kein
certresolver/TLS-Label (Cloudflare terminiert TLS).

## Definition of Done (Spec 2)

- [ ] `Dockerfile` + `start.sh` + `scripts/migrate.ts`: Image baut, migriert Per-Modul-DBs, startet.
- [ ] `compose.yaml` + `.env.example` mit Traefik-Labels (Platzhalter markiert).
- [ ] CI: `test`-Job (lint/typecheck/unit/e2e gegen `next dev`) grün; das Prod-Artefakt wird
      separat über `build-push` + `image-smoke` validiert; `build-push` Multi-Arch nach
      ghcr.io; `image-smoke` grün.
- [ ] `scripts/import/parity.ts` + `scripts/import/portal.ts` mit Unit-Tests (synthetisch) grün.
- [ ] `scripts/backup.sh` mit lokalem Ziel + Rotation, dokumentiert.
- [ ] Registry: `portal.prodHosts = ["iuk-ue.de"]`.
- [ ] Generalprobe grün gegen synthetischen Prod-nahen Snapshot (Import + Parität + Smoke).
- [ ] `docs/runbooks/portal-cutover.md` geschrieben.
- [ ] Alle Gates grün (lint 0, typecheck 0, unit, e2e).
