# Portal produktiv machen (Spec 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die iuk-suite als Container deploybar, CI-abgesichert und für den Portal-Cutover bereit machen — Endpunkt: grüne Generalprobe + Cutover-Runbook.

**Architecture:** Boot-Zeit-Migration je Modul über Next-16-Instrumentation (kein drizzle-kit im Runtime-Image); Multi-Stage-Docker-Image (standalone) hinter Traefik (Host-Label, TLS an Cloudflare); CI = Test-Job (lint/typecheck/unit/e2e) + Multi-Arch-Build nach ghcr.io + image-smoke; generische Import-/Paritäts-Harness mit Portal als erster (risikoarmer) Anwendung; lokales Backup; Runbook.

**Tech Stack:** Next.js 16.2.6 (App Router, `output: standalone`), TypeScript, Drizzle + better-sqlite3 (WAL), Auth.js v5 / Pocket ID, Playwright, Docker Buildx (amd64+arm64), Traefik, GitHub Actions, tsx.

**Spec:** [`../specs/2026-07-18-portal-productionize-design.md`](../specs/2026-07-18-portal-productionize-design.md)

## Global Constraints

- **Node**: `node:22-alpine` im Image; pnpm `11.0.9` (corepack).
- **Registry/Image**: `ghcr.io/rubenvitt/iuk-suite`, Tags `sha` / branch / `latest` (nur `main`).
- **Multi-Arch**: `linux/amd64,linux/arm64` (Buildx + QEMU), Cache `type=gha`.
- **Traefik**: Netzwerk `proxy` (extern), Entrypoint `web` (:80), **kein `tls`/`certresolver`-Label** (TLS terminiert an Cloudflare, cloudflared → `traefik:80`). Router/Service-Name `iuk-suite`, Container-Port `3000`.
- **Portal-Domain**: `iuk-ue.de` (Apex). Session-Cookie auf `.iuk-ue.de`.
- **DATA_DIR**: `/data` in Prod (`./.data` in Dev), je Modul `<key>.db`, WAL.
- **Prod seedet nie**: Seed nur wenn `SUITE_SEED=1` **oder** `NODE_ENV==="development"`.
- **Dev-Login**: `AUTH_DEV_LOGIN=true` erzwingt Dev-Login auch im Prod-Build (CI-E2E ohne Pocket ID).
- **Scope-Grenze**: endet bei grüner Generalprobe gegen synthetischen Snapshot; echter Proxy-Flip = manuelle Betreiber-Operation (Runbook), kein Code.
- **Instrumentation** muss auf `process.env.NEXT_RUNTIME === "nodejs"` gegatet sein (better-sqlite3 ist nativ; die Edge-Middleware `proxy.ts` darf es nie laden).
- **Branch**: Arbeit läuft auf `feat/portal-productionize` (bereits angelegt, Spec committet).
- **Gates** nach jeder Aufgabe grün halten: `pnpm lint` (0), `pnpm typecheck` (0), `pnpm test`.

## Pre-flight (in dieser Umgebung bereits empirisch verifiziert)

Zwei riskante Annahmen wurden vor Planübergabe geprüft — Ergebnisse sind in die Tasks eingearbeitet:

1. **better-sqlite3 im standalone-Build:** `pnpm build` grün; das native Binding liegt unter `.next/standalone/node_modules/.pnpm/better-sqlite3@…/…/better_sqlite3.node`, `require()` daraus lädt + führt `select 1` aus. → **Kein `serverExternalPackages` nötig, KEIN `COPY better-sqlite3`** (der wäre wegen des pnpm-`.pnpm`-Symlinks sogar schädlich). Task 3 hat den COPY nicht.
2. **`tsx` löst den `@`-Alias aus `scripts/` auf:** `tsx scripts/_probe.ts` mit `import { moduleForHost } from "@/core/registry"` lief durch. → Import-Skripte bleiben top-level in `scripts/`, keine Umsiedlung nach `src/`. `vitest` (Alias in `vitest.config.ts`) und `tsc` (`paths` in `tsconfig.json`, `include: **/*.ts`) decken `scripts/` ebenfalls ab.

Sollte ein Executor in einer anderen Umgebung laufen, sind Task 3 Step 3–4 (Docker-Build + Health) der Guard, der #1 erneut absichert.

---

### Task 1: Registry — Portal-Apex-Host

**Files:**
- Modify: `src/core/registry.ts` (Zeile 17, `portal`-Eintrag)
- Test: `src/core/registry.test.ts` (Create, falls nicht vorhanden — sonst ergänzen)

**Interfaces:**
- Consumes: `moduleForHost(host: string): ModuleDef | null` (existiert)
- Produces: `portal.prodHosts === ["iuk-ue.de"]`

- [ ] **Step 1: Failing test schreiben**

Falls `src/core/registry.test.ts` schon existiert, den `it`-Block ergänzen; sonst Datei anlegen:

```ts
import { describe, it, expect } from "vitest";
import { moduleForHost } from "@/core/registry";

describe("moduleForHost — prod apex", () => {
  it("maps iuk-ue.de to portal", () => {
    expect(moduleForHost("iuk-ue.de")?.key).toBe("portal");
  });
  it("ignores the port when matching the apex host", () => {
    expect(moduleForHost("iuk-ue.de:443")?.key).toBe("portal");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag verifizieren**

Run: `pnpm test -- src/core/registry.test.ts`
Expected: FAIL — `moduleForHost("iuk-ue.de")` liefert `null` (prodHosts leer).

- [ ] **Step 3: Registry anpassen**

In `src/core/registry.ts` den portal-Eintrag ändern:

```ts
  { key: "portal", title: "Portal", icon: "LayoutGrid", shell: "full",
    requiresAuth: true, requiredGroups: [], prodHosts: ["iuk-ue.de"], showInSwitcher: true },
```

- [ ] **Step 4: Test laufen lassen, grün verifizieren**

Run: `pnpm test -- src/core/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/registry.ts src/core/registry.test.ts
git commit -m "feat(registry): portal prodHosts = iuk-ue.de (apex)"
```

---

### Task 2: Boot-Zeit-Migration via Instrumentation; Per-Request-Bootstrap ablösen

Ersetzt den lazy Per-Request-Bootstrap (`ensurePortalReady`) durch **einen** Startup-Pfad: Migration aller Modul-DBs beim Server-Boot, Seed nur in Dev/CI. Damit migriert der Container beim Start (fail-closed: schlägt Migration fehl, startet der Server nicht → Healthcheck rot).

**Files:**
- Create: `src/core/bootstrap.ts`
- Create: `src/core/bootstrap.test.ts`
- Create: `src/instrumentation.ts`
- Delete: `src/app/m/portal/_lib/instrument.ts`
- Modify: `src/app/m/portal/actions.ts` (Import + 2 Aufrufe entfernen)
- Modify: `src/app/m/portal/page.tsx` (Import + Aufruf entfernen)
- Modify: `src/app/m/portal/admin/page.tsx` (Import + Aufruf entfernen)
- Modify: `src/app/m/portal/actions.test.ts` (instrument-Mock entfernen)

**Interfaces:**
- Consumes: `openModuleDatabase(path)`, `moduleDbPath(key)`, `getModuleDb(key, schema)` (aus `@/core/db`); `seedPortal(db)` (aus `@/app/m/portal/_lib/seed`); `migrate` (aus `drizzle-orm/better-sqlite3/migrator`).
- Produces:
  - `migrateAllModules(): void`
  - `shouldSeed(): boolean`
  - `seedAllModules(): Promise<void>`
  - `register(): Promise<void>` (Next-Instrumentation-Hook)

- [ ] **Step 1: Failing test für bootstrap schreiben**

Create `src/core/bootstrap.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { migrateAllModules, shouldSeed } from "@/core/bootstrap";

const DIR = "./.data/bootstrap-test";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
});
afterEach(() => rmSync(DIR, { recursive: true, force: true }));

describe("migrateAllModules", () => {
  it("creates portal.db with the services table", () => {
    migrateAllModules();
    expect(existsSync(`${DIR}/portal.db`)).toBe(true);
    const db = new Database(`${DIR}/portal.db`);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='services'")
      .get() as { name?: string } | undefined;
    db.close();
    expect(row?.name).toBe("services");
  });
});

describe("shouldSeed", () => {
  it("is true when SUITE_SEED=1", () => {
    const prevSeed = process.env.SUITE_SEED, prevEnv = process.env.NODE_ENV;
    process.env.SUITE_SEED = "1"; process.env.NODE_ENV = "production";
    expect(shouldSeed()).toBe(true);
    process.env.SUITE_SEED = prevSeed; process.env.NODE_ENV = prevEnv;
  });
  it("is false in production without SUITE_SEED", () => {
    const prevSeed = process.env.SUITE_SEED, prevEnv = process.env.NODE_ENV;
    delete process.env.SUITE_SEED; process.env.NODE_ENV = "production";
    expect(shouldSeed()).toBe(false);
    process.env.SUITE_SEED = prevSeed; process.env.NODE_ENV = prevEnv;
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag verifizieren**

Run: `pnpm test -- src/core/bootstrap.test.ts`
Expected: FAIL — Modul `@/core/bootstrap` existiert nicht.

- [ ] **Step 3: `src/core/bootstrap.ts` implementieren**

```ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase, moduleDbPath, getModuleDb } from "@/core/db";
import * as portalSchema from "@/app/m/portal/_db/schema";
import { seedPortal } from "@/app/m/portal/_lib/seed";

// Module mit eigener SQLite-DB + Migrationen. Neue Module hier eintragen.
// Migrations-Pfad ist cwd-relativ: Dev = Repo-Root, Prod = /app (Dockerfile
// kopiert den Ordner an genau diesen Pfad in das standalone-Image).
const MODULE_MIGRATIONS: { key: string; migrationsFolder: string }[] = [
  { key: "portal", migrationsFolder: "src/app/m/portal/_db/migrations" },
];

// Schema-freies Migrieren: eigene Verbindung öffnen, migrieren, schließen.
// Muss vor dem ersten Request abgeschlossen sein (Instrumentation register()).
export function migrateAllModules(): void {
  for (const m of MODULE_MIGRATIONS) {
    const sqlite = openModuleDatabase(moduleDbPath(m.key));
    migrate(drizzle(sqlite), { migrationsFolder: m.migrationsFolder });
    sqlite.close();
  }
}

// Seed nur in Dev/CI/Generalprobe — nie in echter Prod.
export function shouldSeed(): boolean {
  return process.env.SUITE_SEED === "1" || process.env.NODE_ENV === "development";
}

export async function seedAllModules(): Promise<void> {
  await seedPortal(getModuleDb("portal", portalSchema));
}
```

- [ ] **Step 4: Test laufen lassen, grün verifizieren**

Run: `pnpm test -- src/core/bootstrap.test.ts`
Expected: PASS (beide describe-Blöcke grün).

- [ ] **Step 5: `src/instrumentation.ts` anlegen**

```ts
// Next-16-Instrumentation: register() läuft einmal beim Server-Boot, vor dem
// ersten Request. Nur im Node-Runtime ausführen — die Edge-Middleware (proxy.ts)
// darf better-sqlite3 nie laden. Dynamischer Import hält das aus dem Edge-Bundle.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrateAllModules, shouldSeed, seedAllModules } = await import("@/core/bootstrap");
  migrateAllModules();
  if (shouldSeed()) await seedAllModules();
}
```

- [ ] **Step 6: `ensurePortalReady` aus den Consumern entfernen**

`src/app/m/portal/actions.ts` — Import (Zeile 6) löschen und beide `await ensurePortalReady();` (Zeilen 15 & 27) entfernen. Ergebnis:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/core/auth";
import { isAdmin } from "@/app/m/portal/_lib/rbac";
import { createService, deleteService } from "@/app/m/portal/_lib/services";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.groups)) throw new Error("Forbidden");
}

export async function createServiceAction(formData: FormData) {
  await assertAdmin();
  await createService({
    slug: String(formData.get("slug")),
    name: String(formData.get("name")),
    url: String(formData.get("url")),
    isPublic: formData.get("isPublic") === "on",
  });
  revalidatePath("/m/portal");
}

export async function deleteServiceAction(formData: FormData) {
  await assertAdmin();
  await deleteService(String(formData.get("id")));
  revalidatePath("/m/portal");
}
```

(Der `updateServiceAction`-Kommentar am Ende bleibt erhalten.)

`src/app/m/portal/page.tsx` — Import (Zeile 2) und `await ensurePortalReady();` (Zeile 6) entfernen:

```tsx
import { auth } from "@/core/auth";
import { getVisibleServicesForUser } from "@/app/m/portal/_lib/services";

export default async function PortalPage() {
  const session = await auth();
  const services = await getVisibleServicesForUser(session?.user?.groups ?? []);
  return (
```

(Rest der Datei unverändert.)

`src/app/m/portal/admin/page.tsx` — Import (Zeile 4) und `await ensurePortalReady();` (Zeile 13) entfernen. Der Body ab `const services = await getAllServices();` bleibt.

- [ ] **Step 7: instrument-Mock aus dem Action-Test entfernen**

`src/app/m/portal/actions.test.ts` — den Block (Zeilen 13–15) löschen:

```ts
vi.mock("@/app/m/portal/_lib/instrument", () => ({
  ensurePortalReady: vi.fn().mockResolvedValue(undefined),
}));
```

(Die anderen Mocks — `@/core/auth`, `_lib/services`, `next/cache` — bleiben. Der Test braucht keine DB, da `createService`/`deleteService` gemockt sind.)

- [ ] **Step 8: Alte Bootstrap-Datei löschen**

```bash
git rm src/app/m/portal/_lib/instrument.ts
```

- [ ] **Step 9: Gates + Suite laufen lassen**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: typecheck 0 Fehler (kein toter `ensurePortalReady`-Import mehr), lint 0, alle Vitest-Tests grün.

- [ ] **Step 10: E2E lokal verifizieren (Seed läuft jetzt beim Boot)**

Run: `pnpm exec playwright install chromium && pnpm e2e`
Expected: 6/6 grün. (Playwright startet `next dev` mit `NODE_ENV=development` → `shouldSeed()` true → Instrumentation migriert + seedet vor dem ersten Request.)

- [ ] **Step 11: Commit**

```bash
git add src/core/bootstrap.ts src/core/bootstrap.test.ts src/instrumentation.ts \
  src/app/m/portal/actions.ts src/app/m/portal/actions.test.ts \
  src/app/m/portal/page.tsx src/app/m/portal/admin/page.tsx
git rm --cached src/app/m/portal/_lib/instrument.ts 2>/dev/null || true
git commit -m "feat(core): boot-time per-module migration via instrumentation; retire per-request bootstrap"
```

---

### Task 3: Dockerfile + .dockerignore

Produziert das standalone-Image. Migrationen werden ins Image kopiert (Boot-Migration braucht sie), das native better-sqlite3-Binding wird explizit übernommen (Absicherung gegen unvollständiges Output-Tracing).

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: `output: "standalone"` (in `next.config.ts` bereits gesetzt), `src/instrumentation.ts` (Task 2), `src/app/m/portal/_db/migrations/` (existiert).
- Produces: Image mit CMD `node server.js`, Health `/api/health/portal`.

- [ ] **Step 1: `.dockerignore` anlegen**

```
node_modules
.next
.data
.git
test-results
playwright-report
*.tsbuildinfo
docs
e2e
**/*.test.ts
```

- [ ] **Step 2: `Dockerfile` anlegen**

```dockerfile
# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Stage 3: Production runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATA_DIR=/data

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone-Output (server.js + getracte node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migrationen: die Boot-Instrumentation migriert cwd-relativ von /app aus.
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/portal/_db/migrations ./src/app/m/portal/_db/migrations

# (better-sqlite3 inkl. nativem Binding steckt bereits im standalone-Output —
#  in dieser Umgebung verifiziert, siehe „Pre-flight". KEIN separater COPY: der
#  pnpm-Symlink → .pnpm würde beim bare copy brechen.)

# Datenvolume
RUN mkdir -p /data && chown nextjs:nodejs /data
VOLUME /data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Image lokal bauen**

Run: `docker build -t iuk-suite:local .`
Expected: Build erfolgreich, letzte Zeile `naming to docker.io/library/iuk-suite:local`.

- [ ] **Step 4: Container starten und Health prüfen (fährt Boot-Migration)**

```bash
docker run -d --rm --name iuk-suite-smoke -p 3000:3000 \
  -e AUTH_SECRET=smoke-secret -e AUTH_DEV_LOGIN=true iuk-suite:local
sleep 6
curl -fsS -H "Host: iuk-ue.de" http://127.0.0.1:3000/api/health/portal; echo
docker logs iuk-suite-smoke | tail -20
docker stop iuk-suite-smoke
```

Expected: `{"status":"ok","module":"portal"}` (HTTP 200). Logs zeigen keinen Migrationsfehler. Schlägt es wider Erwarten mit einem better-sqlite3-Binding-Fehler fehl → `serverExternalPackages: ["better-sqlite3"]` in `next.config.ts` ergänzen und neu bauen (in dieser Umgebung nicht nötig — standalone enthält das Binding via `.pnpm`-Symlink, siehe „Pre-flight").

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build: standalone Dockerfile + .dockerignore (boot-migrating suite image)"
```

---

### Task 4: Compose-Stack + .env.example

**Files:**
- Create: `compose.yaml`
- Create: `.env.example`

**Interfaces:**
- Consumes: Image `ghcr.io/rubenvitt/iuk-suite:latest`; Traefik-Netzwerk `proxy` (extern).
- Produces: deploybarer Stack hinter Traefik; Health `/api/health/portal`.

- [ ] **Step 1: `compose.yaml` anlegen**

```yaml
services:
  suite:
    image: ghcr.io/rubenvitt/iuk-suite:latest
    restart: unless-stopped
    environment:
      - DATA_DIR=/data
      - AUTH_URL=${AUTH_URL:-https://iuk-ue.de}
      - AUTH_SECRET=${AUTH_SECRET:?AUTH_SECRET must be set}
      - AUTH_TRUST_HOST=true
      - AUTH_COOKIE_DOMAIN=${AUTH_COOKIE_DOMAIN:-.iuk-ue.de}
      - POCKET_ID_ISSUER=${POCKET_ID_ISSUER}
      - POCKET_ID_CLIENT_ID=${POCKET_ID_CLIENT_ID}
      - POCKET_ID_CLIENT_SECRET=${POCKET_ID_CLIENT_SECRET}
      - POCKET_ID_SCOPES=${POCKET_ID_SCOPES:-openid profile email groups}
    volumes:
      - suite_data:/data
    networks:
      - proxy
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/api/health/portal"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
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

> **Cutover-Hinweis:** Der Router `iuk-suite` (Host `iuk-ue.de`) und der gleichnamige
> iuk-overview-Router dürfen nie gleichzeitig aktiv sein — beim Flip genau einen enablen.
> Details im Runbook (Task 9).

- [ ] **Step 2: `.env.example` anlegen**

```
# iuk-suite — Stack-Env (Modul-Präfixe für spätere Module: FILES_… / RADIO_… …)
AUTH_URL=https://iuk-ue.de
AUTH_SECRET=change-me-openssl-rand-base64-32
AUTH_COOKIE_DOMAIN=.iuk-ue.de
# Pocket ID (ein OIDC-Client für alle Suite-Domains)
POCKET_ID_ISSUER=https://id.iuk-ue.de
POCKET_ID_CLIENT_ID=
POCKET_ID_CLIENT_SECRET=
POCKET_ID_SCOPES=openid profile email groups
```

- [ ] **Step 3: Compose validieren**

Run: `docker compose --env-file .env.example config >/dev/null && echo OK`
Expected: `OK` (keine Schema-/Interpolationsfehler; `AUTH_SECRET` ist in `.env.example` gesetzt).

- [ ] **Step 4: Commit**

```bash
git add compose.yaml .env.example
git commit -m "build: Traefik compose stack + .env.example (apex iuk-ue.de, network proxy)"
```

---

### Task 5: Generische Paritäts-Harness

Wiederverwendbarer Baustein für alle künftigen Modul-Importe (files/lagerbuch/radio): vergleicht Quelle vs. Ziel über Zeilenzahl + Multiset-Checksums, bricht bei Abweichung mit Report ab.

**Files:**
- Create: `scripts/import/parity.ts`
- Create: `scripts/import/parity.test.ts`

**Interfaces:**
- Produces:
  - `type Row = Record<string, unknown>`
  - `rowChecksum(row: Row): string`
  - `checkParity(source: Row[], target: Row[]): ParityReport`
  - `assertParity(report: ParityReport): void`
  - `interface ParityReport { ok: boolean; sourceCount: number; targetCount: number; missingInTarget: string[]; missingInSource: string[] }`

- [ ] **Step 1: Failing test schreiben**

Create `scripts/import/parity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checkParity, assertParity } from "./parity";

const a = { id: "1", name: "A", tags: ["x", "y"], flag: true };
const b = { id: "2", name: "B", tags: [], flag: false };

describe("checkParity", () => {
  it("passes when source and target hold the same rows (order-independent)", () => {
    const r = checkParity([a, b], [b, a]);
    expect(r.ok).toBe(true);
    expect(r.sourceCount).toBe(2);
    expect(r.targetCount).toBe(2);
  });

  it("fails and lists the row missing in target", () => {
    const r = checkParity([a, b], [a]);
    expect(r.ok).toBe(false);
    expect(r.missingInTarget).toHaveLength(1);
  });

  it("assertParity throws on mismatch with a report in the message", () => {
    const r = checkParity([a, b], [a]);
    expect(() => assertParity(r)).toThrow(/parity/i);
  });

  it("assertParity is silent when ok", () => {
    expect(() => assertParity(checkParity([a], [a]))).not.toThrow();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag verifizieren**

Run: `pnpm test -- scripts/import/parity.test.ts`
Expected: FAIL — `./parity` existiert nicht.

- [ ] **Step 3: `scripts/import/parity.ts` implementieren**

```ts
import { createHash } from "node:crypto";

export type Row = Record<string, unknown>;

export interface ParityReport {
  ok: boolean;
  sourceCount: number;
  targetCount: number;
  missingInTarget: string[]; // checksums in source but not target
  missingInSource: string[]; // checksums in target but not source
}

// Stabile, wertkanonische Serialisierung: Schlüssel sortiert, Date→ISO,
// Arrays elementweise. Gleiche Daten → gleicher Hash, unabhängig von
// Schlüssel-/Zeilenreihenfolge.
function canon(value: unknown): unknown {
  if (value instanceof Date) return { __date: value.toISOString() };
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Row).sort()) out[k] = canon((value as Row)[k]);
    return out;
  }
  return value;
}

export function rowChecksum(row: Row): string {
  return createHash("sha256").update(JSON.stringify(canon(row))).digest("hex");
}

function multiset(rows: Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = rowChecksum(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function checkParity(source: Row[], target: Row[]): ParityReport {
  const s = multiset(source), t = multiset(target);
  const missingInTarget: string[] = [];
  const missingInSource: string[] = [];
  for (const [k, n] of s) if ((t.get(k) ?? 0) < n) missingInTarget.push(k);
  for (const [k, n] of t) if ((s.get(k) ?? 0) < n) missingInSource.push(k);
  return {
    ok: missingInTarget.length === 0 && missingInSource.length === 0 && source.length === target.length,
    sourceCount: source.length,
    targetCount: target.length,
    missingInTarget,
    missingInSource,
  };
}

export function assertParity(report: ParityReport): void {
  if (report.ok) return;
  throw new Error(
    `Parity check FAILED: source=${report.sourceCount} target=${report.targetCount} ` +
      `missingInTarget=${report.missingInTarget.length} missingInSource=${report.missingInSource.length}. ` +
      `Import ABORTED — no cutover.`,
  );
}
```

- [ ] **Step 4: Test laufen lassen, grün verifizieren**

Run: `pnpm test -- scripts/import/parity.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/import/parity.ts scripts/import/parity.test.ts
git commit -m "feat(import): generic parity-check harness (row count + multiset checksums)"
```

---

### Task 6: Portal-Import-Skript (Postgres services → portal.db)

Liest die `services`-Zeilen als NDJSON (`psql -Atc "select row_to_json(t) from services t"`), mappt Postgres→SQLite feldweise (IDs 1:1), schreibt idempotent und prüft Parität.

**Files:**
- Create: `scripts/import/portal.ts`
- Create: `scripts/import/portal.test.ts`

**Interfaces:**
- Consumes: `checkParity`, `assertParity` (Task 5); `services`, `NewService` (aus `@/app/m/portal/_db/schema`); `getModuleDb` (`@/core/db`); `migrateAllModules` (`@/core/bootstrap`).
- Produces:
  - `interface PgServiceRow { id, slug, name, description, url, icon_url, category, tags, required_groups, is_public, is_active, sort_order, open_in_new_tab, created_at, updated_at }`
  - `parseNdjson(text: string): PgServiceRow[]`
  - `toNewService(row: PgServiceRow): NewService`
  - `importPortalServices(rows: PgServiceRow[], db): { imported: number }`
  - `runPortalImport(sourcePath: string): ParityReport`

- [ ] **Step 1: Failing test schreiben**

Create `scripts/import/portal.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/app/m/portal/_db/schema";
import { parseNdjson, toNewService, importPortalServices } from "./portal";
import { checkParity } from "./parity";

const DIR = "./.data/portal-import-test";

function pgRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "wiki", name: "Wiki", description: "Doku", url: "https://wiki.iuk-ue.de",
    icon_url: null, category: "Doku", tags: ["a", "b"], required_groups: ["dashboard-admins"],
    is_public: true, is_active: true, sort_order: 3, open_in_new_tab: true,
    created_at: "2026-01-02T03:04:05.000Z", updated_at: "2026-01-02T03:04:05.000Z",
    ...over,
  };
}

// Direkt gebaute, migrierte DB — NICHT getModuleDb(): dessen globaler Cache ist
// per Modulschlüssel gekeyt (nicht per DATA_DIR) und würde zwischen Tests ein
// stale Handle auf die alte Datei zurückgeben. Spiegelt services.test.ts.
function freshDb(): BetterSQLite3Database<typeof schema> {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const db = drizzle(new Database(`${DIR}/portal.db`), { schema });
  migrate(db, { migrationsFolder: "./src/app/m/portal/_db/migrations" });
  return db;
}
afterEach(() => rmSync(DIR, { recursive: true, force: true }));

describe("parseNdjson", () => {
  it("parses one row per non-empty line", () => {
    const rows = parseNdjson(`${JSON.stringify(pgRow())}\n\n${JSON.stringify(pgRow({ slug: "vault" }))}\n`);
    expect(rows.map((r) => r.slug)).toEqual(["wiki", "vault"]);
  });
});

describe("toNewService", () => {
  it("preserves id and maps pg types to sqlite types", () => {
    const n = toNewService(pgRow() as never);
    expect(n.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(n.tags).toEqual(["a", "b"]);
    expect(n.requiredGroups).toEqual(["dashboard-admins"]);
    expect(n.isPublic).toBe(true);
    expect(n.sortOrder).toBe(3);
    expect(n.createdAt).toBeInstanceOf(Date);
    expect(n.iconUrl).toBeNull();
  });
});

describe("importPortalServices", () => {
  it("imports rows and the target matches the source (parity)", () => {
    const rows = [pgRow(), pgRow({ id: "22222222-2222-2222-2222-222222222222", slug: "vault" })];
    const db = freshDb();
    const res = importPortalServices(rows as never, db);
    expect(res.imported).toBe(2);
    const stored = db.select().from(schema.services).all();
    const source = rows.map((r) => ({ id: r.id, slug: r.slug, url: r.url }));
    const target = stored.map((s) => ({ id: s.id, slug: s.slug, url: s.url }));
    expect(checkParity(source, target).ok).toBe(true);
  });

  it("is idempotent (re-run keeps the same rows)", () => {
    const rows = [pgRow()];
    const db = freshDb();
    importPortalServices(rows as never, db);
    importPortalServices(rows as never, db);
    expect(db.select().from(schema.services).all()).toHaveLength(1);
  });
});
```

> **Cache-Falle (wichtig):** In `portal.test.ts` NICHT `getModuleDb()` verwenden —
> dessen `globalThis.__suiteDb`-Cache ist per Modulschlüssel gekeyt, nicht per
> `DATA_DIR`; ein zweiter Test bekäme das stale Handle des ersten. `runPortalImport`
> (CLI, Task 9) darf `getModuleDb` nutzen, weil jeder `tsx`-Aufruf ein frischer
> Prozess ist.

- [ ] **Step 2: Test laufen lassen, Fehlschlag verifizieren**

Run: `pnpm test -- scripts/import/portal.test.ts`
Expected: FAIL — `./portal` existiert nicht.

- [ ] **Step 3: `scripts/import/portal.ts` implementieren**

```ts
import { readFileSync } from "node:fs";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getModuleDb } from "@/core/db";
import { migrateAllModules } from "@/core/bootstrap";
import * as schema from "@/app/m/portal/_db/schema";
import { checkParity, assertParity, type ParityReport } from "./parity";

export interface PgServiceRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  url: string;
  icon_url: string | null;
  category: string | null;
  tags: string[] | null;
  required_groups: string[] | null;
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
  open_in_new_tab: boolean;
  created_at: string; // ISO from row_to_json
  updated_at: string;
}

type PortalDb = BetterSQLite3Database<typeof schema>;

export function parseNdjson(text: string): PgServiceRow[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as PgServiceRow);
}

// Postgres → SQLite (Drizzle-Typen). ID wird 1:1 erhalten (uuid als text).
export function toNewService(row: PgServiceRow): schema.NewService {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    url: row.url,
    iconUrl: row.icon_url ?? null,
    category: row.category ?? null,
    tags: row.tags ?? [],
    requiredGroups: row.required_groups ?? [],
    isPublic: !!row.is_public,
    isActive: !!row.is_active,
    sortOrder: row.sort_order ?? 0,
    openInNewTab: !!row.open_in_new_tab,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Idempotent: Upsert per Primärschlüssel (id 1:1).
export function importPortalServices(rows: PgServiceRow[], db: PortalDb): { imported: number } {
  for (const row of rows) {
    const v = toNewService(row);
    db.insert(schema.services).values(v).onConflictDoUpdate({ target: schema.services.id, set: v }).run();
  }
  return { imported: rows.length };
}

// Vergleicht auf den Feldern, die den Umzug überleben müssen. sortOrder ist im
// Insert-Typ optional (hat .default(0)) → auf 0 normalisieren, sonst Typfehler
// und Quelle/Ziel könnten uneinheitlich (undefined vs 0) hashen.
function parityView(r: { id: string; slug: string; url: string; sortOrder?: number | null }) {
  return { id: r.id, slug: r.slug, url: r.url, sortOrder: r.sortOrder ?? 0 };
}

export function runPortalImport(sourcePath: string): ParityReport {
  migrateAllModules();
  const rows = parseNdjson(readFileSync(sourcePath, "utf8"));
  const db = getModuleDb("portal", schema);
  importPortalServices(rows, db);
  const stored = db.select().from(schema.services).all();
  const report = checkParity(
    rows.map((r) => parityView(toNewService(r))),
    stored.map(parityView),
  );
  assertParity(report);
  return report;
}

// CLI: tsx scripts/import/portal.ts <services.ndjson>   (DATA_DIR steuert das Ziel)
if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: tsx scripts/import/portal.ts <services.ndjson>");
    process.exit(1);
  }
  const report = runPortalImport(src);
  console.log(`Portal import OK — ${report.sourceCount} services, parity green.`);
}
```

- [ ] **Step 4: Test laufen lassen, grün verifizieren**

Run: `pnpm test -- scripts/import/portal.test.ts`
Expected: PASS (parseNdjson, toNewService, 2× importPortalServices).

- [ ] **Step 5: Gates**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 / 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/import/portal.ts scripts/import/portal.test.ts
git commit -m "feat(import): portal services import (pg NDJSON -> portal.db, id-preserving, idempotent, parity-gated)"
```

---

### Task 7: Backup-Skript (dünner erster Wurf)

Konsistenter Hot-Backup je `<modul>.db` via `sqlite3 .backup`, plus tar über das Datenverzeichnis, lokale Ablage mit Rotation. Läuft als Host-Cron (Host braucht `sqlite3` + `tar`).

**Files:**
- Create: `scripts/backup.sh`

**Interfaces:**
- Consumes: env `DATA_DIR` (default `/data`), `BACKUP_DIR` (default `$DATA_DIR/backups`), `BACKUP_KEEP` (default `7`).
- Produces: `$BACKUP_DIR/<stamp>.tar.gz`, rotiert auf die neuesten `BACKUP_KEEP`.

- [ ] **Step 1: `scripts/backup.sh` anlegen**

```bash
#!/usr/bin/env bash
# Dünner erster Wurf: konsistenter SQLite-Backup je Modul + tar, lokal, rotiert.
# Läuft als Host-Cron; benötigt sqlite3 + tar. Externes Ziel (rclone/rsync) folgt
# bei einem späteren Modul.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
KEEP="${BACKUP_KEEP:-7}"

stamp="$(date +%Y%m%dT%H%M%S)"
work="$BACKUP_DIR/$stamp"
mkdir -p "$work"

shopt -s nullglob
found=0
for db in "$DATA_DIR"/*.db; do
  found=1
  sqlite3 "$db" ".backup '$work/$(basename "$db")'"
done
if [ "$found" -eq 0 ]; then
  echo "backup: no *.db in $DATA_DIR — nothing to do" >&2
fi

tar -czf "$work.tar.gz" -C "$BACKUP_DIR" "$stamp"
rm -rf "$work"

# Rotation: nur die neuesten $KEEP Tarballs behalten.
ls -1t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "backup: wrote $work.tar.gz"
```

- [ ] **Step 2: Ausführbar machen**

Run: `chmod +x scripts/backup.sh`

- [ ] **Step 3: Real gegen ein Temp-Verzeichnis verifizieren**

```bash
tmp="$(mktemp -d)"
sqlite3 "$tmp/portal.db" "CREATE TABLE t(x); INSERT INTO t VALUES(1);"
DATA_DIR="$tmp" BACKUP_DIR="$tmp/backups" BACKUP_KEEP=2 ./scripts/backup.sh
ls -1 "$tmp/backups"/*.tar.gz | wc -l   # erwartet: 1
tar -tzf "$tmp"/backups/*.tar.gz | grep portal.db   # erwartet: <stamp>/portal.db
rm -rf "$tmp"
```

Expected: genau eine `.tar.gz`, die `portal.db` enthält; `backup: wrote …` in der Ausgabe.

- [ ] **Step 4: Commit**

```bash
git add scripts/backup.sh
git commit -m "feat(ops): local sqlite backup script (.backup + tar + rotation)"
```

---

### Task 8: CI-Workflow (Test → Multi-Arch-Build → image-smoke)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm` scripts (`lint`/`typecheck`/`test`/`e2e`), `Dockerfile` (Task 3), Health `/api/health/portal`.
- Produces: Multi-Arch-Image auf ghcr.io (nur `main`), grüner Test-Gate, image-smoke.

- [ ] **Step 1: `.github/workflows/ci.yml` anlegen**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11.0.9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e

  build-push:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - name: Log in to ghcr.io
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha
            type=ref,event=branch
            type=raw,value=latest,enable={{is_default_branch}}
      - name: Build (amd64 local, für image-smoke)
        uses: docker/build-push-action@v6
        with:
          context: .
          load: true
          tags: iuk-suite:ci
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: image-smoke — Health mit Host-Header
        run: |
          docker run -d --rm --name smoke -p 3000:3000 \
            -e AUTH_SECRET=smoke -e AUTH_DEV_LOGIN=true iuk-suite:ci
          for i in $(seq 1 20); do
            if curl -fsS -H "Host: iuk-ue.de" http://127.0.0.1:3000/api/health/portal; then ok=1; break; fi
            sleep 2
          done
          docker logs smoke | tail -30
          docker stop smoke
          test "${ok:-0}" = "1"
      - name: Build + Push (multi-arch, nur main)
        if: github.event_name != 'pull_request'
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: YAML-Syntax lokal prüfen**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"`
Expected: `yaml ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: test gate (lint/typecheck/unit/e2e) + multi-arch build + image-smoke"
```

- [ ] **Step 4: Verifikation nach Push (dokumentiert, nicht im Plan-Run)**

Nach `git push` den Actions-Run beobachten: `test` grün, `build-push` grün, `image-smoke` liefert `{"status":"ok","module":"portal"}`. Auf `main` erscheint das Image unter `ghcr.io/rubenvitt/iuk-suite`.

---

### Task 9: Generalprobe-Fixture + Cutover-Runbook

Schließt Spec 2 ab: synthetischer Prod-naher Snapshot, grüner Import + Paritätscheck, geschriebenes Runbook.

**Files:**
- Create: `scripts/import/fixtures/portal-services.sample.ndjson`
- Create: `docs/runbooks/portal-cutover.md`

**Interfaces:**
- Consumes: `runPortalImport(sourcePath)` (Task 6).
- Produces: reproduzierbare grüne Generalprobe; Betreiber-Runbook.

- [ ] **Step 1: Synthetische Fixture anlegen**

`scripts/import/fixtures/portal-services.sample.ndjson` (jede Zeile = eine `row_to_json(services)`-Zeile; realitätsnah, inkl. Gruppen/Arrays/Timestamps):

```
{"id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","slug":"bookstack","name":"BookStack","description":"Wiki & Doku","url":"https://wiki.iuk-ue.de","icon_url":null,"category":"Doku","tags":["doku","wiki"],"required_groups":[],"is_public":true,"is_active":true,"sort_order":1,"open_in_new_tab":true,"created_at":"2026-03-23T09:00:00.000Z","updated_at":"2026-03-23T09:00:00.000Z"}
{"id":"9b2e4d1a-1c3f-4a8b-9d2e-5f6a7b8c9d0e","slug":"vaultwarden","name":"Vaultwarden","description":"Passwörter","url":"https://vault.iuk-ue.de","icon_url":null,"category":"Tools","tags":["security"],"required_groups":["dashboard-admins"],"is_public":false,"is_active":true,"sort_order":2,"open_in_new_tab":true,"created_at":"2026-03-23T09:05:00.000Z","updated_at":"2026-03-23T09:05:00.000Z"}
{"id":"a1b2c3d4-e5f6-7788-99aa-bbccddeeff00","slug":"syncthing","name":"Syncthing","description":"","url":"https://sync.iuk-ue.de","icon_url":null,"category":"Tools","tags":[],"required_groups":["dashboard-admins"],"is_public":false,"is_active":true,"sort_order":3,"open_in_new_tab":true,"created_at":"2026-03-23T09:10:00.000Z","updated_at":"2026-03-23T09:10:00.000Z"}
```

- [ ] **Step 2: Generalprobe fahren (Import + Paritätscheck grün)**

```bash
rm -rf ./.data/generalprobe
DATA_DIR=./.data/generalprobe pnpm exec tsx scripts/import/portal.ts \
  scripts/import/fixtures/portal-services.sample.ndjson
```

Expected: `Portal import OK — 3 services, parity green.`

- [ ] **Step 3: Idempotenz der Generalprobe verifizieren (2. Lauf)**

```bash
DATA_DIR=./.data/generalprobe pnpm exec tsx scripts/import/portal.ts \
  scripts/import/fixtures/portal-services.sample.ndjson
```

Expected: erneut `parity green` (kein Duplikat, keine Abweichung); danach `rm -rf ./.data/generalprobe`.

- [ ] **Step 4: `docs/runbooks/portal-cutover.md` schreiben**

```markdown
# Runbook — Portal-Cutover (iuk-overview → iuk-suite)

Ziel: Die Apex-Domain `iuk-ue.de` von der Alt-App iuk-overview auf die Suite
umschwenken. Rollback ist frei (Router zurück + Alt-Container an). Alt-Stack
bleibt 2 Wochen in Standby.

## Vorbedingungen
- CI grün, Image `ghcr.io/rubenvitt/iuk-suite:latest` gepusht.
- Suite-Stack am Server deployt (`compose.yaml` + `.env` gesetzt), aber der
  Router `iuk-suite` (Host `iuk-ue.de`) ist NOCH NICHT aktiv — sonst kollidiert
  er mit dem iuk-overview-Router auf demselben Host.

## Ablauf
1. **Generalprobe** (lokal/Staging, automatisierbar):
   `DATA_DIR=./.data/gp pnpm exec tsx scripts/import/portal.ts <snapshot>.ndjson`
   → muss `parity green` liefern.
2. **Freeze**: iuk-overview read-only/stoppen (kurzes Wartungsfenster).
3. **Echten Snapshot ziehen** (auf dem iuk-overview-Postgres):
   `psql "$DATABASE_URL" -Atc "select row_to_json(t) from services t" > services.ndjson`
4. **Import** — aus einem **Repo-Checkout**, identisch zum Generalprobe-Befehl,
   nur mit echtem Snapshot + echtem Volume. Das standalone-Image enthält weder
   `scripts/` noch `tsx` → NICHT aus dem App-Image importieren. `DATA_DIR` auf das
   gemountete `suite_data`-Volume zeigen:
   `VOL=$(docker volume inspect suite_data -f '{{ .Mountpoint }}')`
   `DATA_DIR="$VOL" pnpm exec tsx scripts/import/portal.ts services.ndjson`
   (Alternative ohne Host-Pfad: throwaway `node:22-alpine` mit
   `-v suite_data:/data -v "$PWD":/repo -w /repo`, darin `pnpm install` + derselbe
   `tsx`-Aufruf mit `DATA_DIR=/data`.) Entscheidend: Ausgabe endet mit `parity green`.
5. **Paritätscheck**: bricht das Skript ab → KEIN Cutover, Report prüfen.
6. **Verify vor dem Flip** (Router kollidiert noch, daher per Host-Header direkt
   gegen den Suite-Container, nicht über Traefik):
   `curl -H "Host: iuk-ue.de" http://<suite-container>:3000/api/health/portal`
   und die Portal-Kacheln / Admin-CRUD / Gruppen-Gating stichprobenhaft.
7. **Cutover**: Traefik-Router `Host(\`iuk-ue.de\`)` bei iuk-overview deaktivieren
   und bei der Suite aktivieren (genau einer aktiv). `docker compose up -d`.
8. **Standby & Abbau**: nach 2 Wochen iuk-overview-Stack + Postgres abbauen,
   Volume-Tarball archivieren, GitHub-Repo archivieren.

## Rollback
Router zurück auf iuk-overview + dessen Container starten. Sekunden.
```

- [ ] **Step 5: Progress-Datei aktualisieren**

In `../../../../KONSOLIDIERUNG-PROGRESS.md` (Workspace-Root) den „Aktueller Stand" auf Spec 2 fertig / Cutover ausstehend setzen und die Spec-1/Spec-2-Häkchen in Phase 1 pflegen. (Diese Datei liegt außerhalb des iuk-suite-Repos — separat editieren, nicht committen im Suite-Repo.)

- [ ] **Step 6: Commit**

```bash
git add scripts/import/fixtures/portal-services.sample.ndjson docs/runbooks/portal-cutover.md
git commit -m "docs(ops): portal generalprobe fixture + cutover runbook (Spec 2 done)"
```

---

## Self-Review

**Spec-Abdeckung:**
- §1 Containerisierung → Task 3 (Dockerfile, Boot-Migration via Task 2). ✓
- §2 Compose (Traefik) → Task 4. ✓
- §3 CI (Test/Build/image-smoke) → Task 8. ✓
- §4 Import + Paritäts-Harness → Task 5 (generisch) + Task 6 (portal). ✓
- §5 Backup → Task 7. ✓
- §6 Generalprobe + Runbook → Task 9. ✓
- Registry `prodHosts` → Task 1. ✓
- „Startup migriert, seedet nicht (prod)" → Task 2 (`shouldSeed`). ✓
- „Wegwerf-Module bleiben" → keine Änderung nötig (bewusst). ✓

**Placeholder-Scan:** Keine TBD/TODO; alle Code-Steps enthalten vollständigen Code, alle Infra-Steps exakte Befehle + erwartete Ausgabe. Die Traefik-Werte sind konkret (proxy/web/kein certresolver). Der einzige „…" steht in einer Runbook-Doku-Zeile (bewusste Betreiber-Variante), nicht in ausführbarem Code.

**Typ-Konsistenz:** `migrateAllModules`/`shouldSeed`/`seedAllModules` (Task 2) ↔ genutzt in Task 6 (`migrateAllModules`) und `src/instrumentation.ts`. `checkParity`/`assertParity`/`ParityReport` (Task 5) ↔ Task 6. `NewService`/`services` aus dem realen Schema. `getModuleDb(key, schema)`-Signatur stimmt mit `core/db`. Health-Pfad `/api/health/portal` konsistent in Task 3/4/8.
