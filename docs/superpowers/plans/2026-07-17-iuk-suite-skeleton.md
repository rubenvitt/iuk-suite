# IuK-Suite Walking Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein lokal lauffähiger Next.js-16-Monolith, der den Suite-Keystone beweist — ein Container, mehrere Hosts, ein Login, pro Host die richtige Shell — plus Portal als erstes echtes Modul.

**Architecture:** Eine `proxy.ts`-Middleware liest den Host-Header, entscheidet über eine reine, edge-sichere Modul-Registry Zugriff + Ziel und rewritet auf `app/m/<modul>/…`. Ein einziger next-auth-v5-/Pocket-ID-Client hält die Session über ein auf die Apex gesetztes Cookie (SSO); ein env-gegateter Dev-Login-Provider macht das lokal ohne echten OIDC-Server testbar. Jedes Modul hat eine eigene better-sqlite3-Datei. Drei Shell-Varianten (Voll/Minimal/Kiosk) werden per statischem Modul-Layout aus der Registry gewählt.

**Tech Stack:** Next.js 16.2.6 · React 19.2.6 · next-auth 5.0.0-beta.30 · Tailwind 4.3 · shadcn/ui · Drizzle 0.45.2 · better-sqlite3 12.x · drizzle-kit 0.31.x · Playwright · vitest · pnpm · TypeScript (strict).

## Global Constraints

- **Next.js 16:** Die Middleware-Datei heißt `proxy.ts` (nicht `middleware.ts`). Vor dem Schreiben von Routing-/Auth-Code die relevanten Guides unter `node_modules/next/dist/docs/` lesen (Breaking Changes ggü. Trainingsstand).
- **Pinned versions (verbatim aus iuk-overview):** `next@16.2.6`, `react@19.2.6`, `react-dom@19.2.6`, `next-auth@5.0.0-beta.30`, `@base-ui/react@^1.4.1`, `drizzle-orm@^0.45.2`, `drizzle-kit@^0.31.10`, `tailwindcss@^4.3.0`, `@tailwindcss/postcss@^4.3.0`, `typescript@^6.0.3`, `vitest@^4.1.5`, `babel-plugin-react-compiler@1.0.0`. Aus lagerbuch: `better-sqlite3@^12.11.1`, `@types/better-sqlite3@^7.6.13`, `nanoid@^5.1.16`, `@playwright/test@^1.50.0`, `jsdom@^26`.
- **Import-Reconcile-Regel (Ports):** Wann immer eine Datei aus iuk-overview/lagerbuch kopiert wird (shadcn-UI-Komponenten, auth, providers), müssen **alle** ihre `import`-Zeilen auf eine gelistete Dependency auflösen. Vorgehen: `grep -h "^import" <kopierte Dateien>` und jede externe Quelle gegen `package.json` abgleichen; fehlende (z. B. `@base-ui/react`, evtl. `cmdk`) ergänzen, bevor der Task-Build/Typecheck läuft.
- **Pfad-Alias:** `@/*` → `./src/*` (tsconfig `paths`). Alle Imports nutzen `@/…`.
- **Edge-Sicherheit:** `core/registry.ts` und `core/routing.ts` dürfen **niemals** (auch nicht transitiv) `better-sqlite3` oder Node-`fs` importieren — sie laufen in der Edge-Middleware.
- **DB-Pfade:** eine Datei pro Modul unter `${DATA_DIR}/<modul>.db`; `DATA_DIR` default `./.data` (dev). E2E nutzt `./.data/e2e/`.
- **Cookie-Domain per Env:** `AUTH_COOKIE_DOMAIN` (dev `.localtest.me`, prod `.iuk-ue.de` in Spec 2). Ohne Wert: kein `domain`-Attribut (Fallback host-only).
- **Dev-Login per Env:** `AUTH_DEV_LOGIN=true` aktiviert den Credentials-Dev-Provider; in Prod nie gesetzt.
- **Design-Tokens:** DRK-`@theme`-Block aus `../../../lagerbuch/src/app/globals.css` (DRK-Rot `#c8000f`, Regalgrau, Ampel) übernehmen; shadcn-Basis-Tokens/Setup aus `../../../iuk-overview/src/app/globals.css`.
- **Scope-Grenze:** Kein Docker, keine CI, kein Backup, kein Postgres→SQLite-Import (→ Spec 2). Portal läuft auf Seed-Daten.
- **Commit-Disziplin:** DRY, YAGNI, TDD, häufige Commits. Jeder Task endet mit Commit.

Pfad-Konvention in diesem Plan: die Notation `../../../<repo>/…` bezeichnet die **Geschwister-Repos** der Alt-Apps. Absolut sind das `/Users/rubeen/dev/personal/drk/<repo>/…` — z. B. `/Users/rubeen/dev/personal/drk/iuk-overview/src/app/globals.css` und `/Users/rubeen/dev/personal/drk/lagerbuch/src/db/index.ts`. Beim Kopieren/Portieren immer diese absoluten Pfade verwenden.

---

### Task 1: Projekt-Bootstrap (bootet, typecheckt, testet)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`
- Create: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/lib/utils.ts`
- Create: `src/app/api/health/route.ts`
- Create: `vitest.config.ts`
- Test: `src/lib/utils.test.ts`

**Interfaces:**
- Produces: `cn(...inputs)` in `src/lib/utils.ts`; suite-`GET /api/health` → `{status:"ok",timestamp}`.

- [ ] **Step 1: package.json**

```json
{
  "name": "iuk-suite",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@11.0.9",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@base-ui/react": "^1.4.1",
    "better-sqlite3": "^12.11.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "drizzle-orm": "^0.45.2",
    "lucide-react": "^1.14.0",
    "nanoid": "^5.1.16",
    "next": "16.2.6",
    "next-auth": "5.0.0-beta.30",
    "next-themes": "^0.4.6",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.5.0",
    "tw-animate-css": "^1.4.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "@tailwindcss/postcss": "^4.3.0",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^25.6.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "babel-plugin-react-compiler": "1.0.0",
    "drizzle-kit": "^0.31.10",
    "eslint": "^9.39.4",
    "eslint-config-next": "16.2.6",
    "jsdom": "^26.0.0",
    "tailwindcss": "^4.3.0",
    "tsx": "^4.21.0",
    "typescript": "^6.0.3",
    "vitest": "^4.1.5"
  }
}
```

- [ ] **Step 2: Config-Dateien**

`tsconfig.json` — 1:1 aus `../../../iuk-overview/tsconfig.json` übernehmen (identischer Alias `@/*`→`./src/*`, `strict`, Next-Plugin).

`next.config.ts`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = { reactCompiler: true, output: "standalone" };
export default nextConfig;
```

`postcss.config.mjs`:
```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

`eslint.config.mjs`:
```js
import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const eslintConfig = [...compat.extends("next/core-web-vitals", "next/typescript")];
export default eslintConfig;
```
(Falls `@eslint/eslintrc` fehlt, `pnpm add -D @eslint/eslintrc` — es ist transitive Dep von eslint-config-next; sonst hinzufügen.)

`.gitignore`:
```
node_modules
.next
.data
/test-results
/playwright-report
*.tsbuildinfo
.env*.local
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 3: globals.css, layout, page, utils**

`src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`src/app/globals.css`: als Basis den Inhalt von `../../../iuk-overview/src/app/globals.css` übernehmen (Tailwind-4-`@import` + shadcn-Basis-Tokens), dann den DRK-`@theme`-Block aus `../../../lagerbuch/src/app/globals.css` einfügen (die `--color-rot: #c8000f;` … Variablen). Ziel: shadcn-Komponenten funktionieren und DRK-Tokens (`--color-rot` etc.) sind verfügbar.

`src/app/layout.tsx`: Port von `../../../iuk-overview/src/app/layout.tsx`, aber Titel `"IuK-Suite"` und **Providers-Import erst in Task 8 hinzufügen** — in Task 1 ohne `<Providers>` und ohne `<Toaster>`, nur `<html><body>{children}</body></html>` mit `lang="de"` und `suppressHydrationWarning`. Fonts (`Geist`/`Geist_Mono`) wie im Original.

`src/app/page.tsx`:
```tsx
export default function Home() {
  return <main className="p-8">IuK-Suite Skeleton</main>;
}
```

`src/app/api/health/route.ts`:
```ts
export async function GET() {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() });
}
```

- [ ] **Step 4: Failing test für cn()**

`src/lib/utils.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges and dedupes tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold");
  });
});
```

- [ ] **Step 5: Install + verify**

Run:
```bash
pnpm install
pnpm exec playwright install chromium
pnpm test
pnpm typecheck
pnpm build
```
Expected: `pnpm test` PASS (1 file); `pnpm typecheck` no errors; `pnpm build` succeeds (standalone output).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: bootstrap Next 16 skeleton (build, typecheck, health, cn)"
```

---

### Task 2: Modul-Registry (`core/registry.ts`)

**Files:**
- Create: `src/core/registry.ts`
- Test: `src/core/registry.test.ts`

**Interfaces:**
- Produces:
  - `type ShellVariant = "full" | "minimal" | "kiosk"`
  - `interface ModuleDef { key: string; title: string; icon: string; shell: ShellVariant; requiresAuth: boolean; requiredGroups: string[]; prodHosts: string[]; showInSwitcher: boolean }`
  - `const MODULES: ModuleDef[]`
  - `getModule(key: string): ModuleDef` (throws on unknown)
  - `moduleForHost(host: string): ModuleDef | null` (dev-Konvention `<key>.localtest.me` + `prodHosts`)
  - `canAccess(mod: ModuleDef, groups: string[] | null): boolean`
  - `visibleSwitcherModules(groups: string[] | null): ModuleDef[]`

Muss **edge-sicher** bleiben (pure Daten, keine Node/DB-Imports).

- [ ] **Step 1: Failing tests**

`src/core/registry.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  getModule, moduleForHost, canAccess, visibleSwitcherModules, MODULES,
} from "@/core/registry";

describe("registry", () => {
  it("resolves dev host by convention", () => {
    expect(moduleForHost("alpha.localtest.me")?.key).toBe("alpha");
    expect(moduleForHost("alpha.localtest.me:3000")?.key).toBe("alpha");
    expect(moduleForHost("PORTAL.localtest.me")?.key).toBe("portal");
  });
  it("returns null for unknown host", () => {
    expect(moduleForHost("nope.example.com")).toBeNull();
  });
  it("getModule throws on unknown key", () => {
    expect(() => getModule("ghost")).toThrow();
  });
  it("canAccess: anonymous module open to everyone", () => {
    expect(canAccess(getModule("beta"), null)).toBe(true);
  });
  it("canAccess: auth-required module blocks anonymous", () => {
    expect(canAccess(getModule("alpha"), null)).toBe(false);
  });
  it("canAccess: group-gated module needs overlap", () => {
    expect(canAccess(getModule("alpha"), ["other"])).toBe(false);
    expect(canAccess(getModule("alpha"), ["alpha-users"])).toBe(true);
  });
  it("canAccess: auth-only module (no groups) allows any logged-in user", () => {
    expect(canAccess(getModule("portal"), [])).toBe(true);
    expect(canAccess(getModule("portal"), null)).toBe(false);
  });
  it("visibleSwitcherModules filters by access and showInSwitcher", () => {
    const anon = visibleSwitcherModules(null).map((m) => m.key);
    expect(anon).not.toContain("alpha");
    const withAlpha = visibleSwitcherModules(["alpha-users"]).map((m) => m.key);
    expect(withAlpha).toContain("alpha");
    expect(withAlpha).toContain("portal");
    // kioskdemo is never in the switcher
    expect(withAlpha).not.toContain("kioskdemo");
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test src/core/registry.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/core/registry.ts`**

```ts
export type ShellVariant = "full" | "minimal" | "kiosk";

export interface ModuleDef {
  key: string;
  title: string;
  icon: string; // lucide icon name
  shell: ShellVariant;
  requiresAuth: boolean;
  requiredGroups: string[];
  prodHosts: string[]; // Spec 2 füllt echte iuk-ue.de-Hosts; vorerst leer
  showInSwitcher: boolean;
}

// Wegwerf-Module (alpha/beta/kioskdemo) beweisen den Keystone; portal ist das erste echte Modul.
export const MODULES: ModuleDef[] = [
  { key: "portal", title: "Portal", icon: "LayoutGrid", shell: "full",
    requiresAuth: true, requiredGroups: [], prodHosts: [], showInSwitcher: true },
  { key: "alpha", title: "Alpha", icon: "Square", shell: "full",
    requiresAuth: true, requiredGroups: ["alpha-users"], prodHosts: [], showInSwitcher: true },
  // gamma: authentifiziertes Voll-Shell-Modul ohne Gruppenzwang — SSO-Cross-Ziel im Keystone-E2E.
  { key: "gamma", title: "Gamma", icon: "Triangle", shell: "full",
    requiresAuth: true, requiredGroups: [], prodHosts: [], showInSwitcher: true },
  { key: "beta", title: "Beta", icon: "Circle", shell: "minimal",
    requiresAuth: false, requiredGroups: [], prodHosts: [], showInSwitcher: false },
  { key: "kioskdemo", title: "Kiosk Demo", icon: "Monitor", shell: "kiosk",
    requiresAuth: false, requiredGroups: [], prodHosts: [], showInSwitcher: false },
];

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

export function getModule(key: string): ModuleDef {
  const m = BY_KEY.get(key);
  if (!m) throw new Error(`Unknown module: ${key}`);
  return m;
}

export function moduleForHost(host: string): ModuleDef | null {
  const h = host.split(":")[0].toLowerCase();
  for (const m of MODULES) {
    if (h === `${m.key}.localtest.me`) return m;
    if (m.prodHosts.some((p) => p.toLowerCase() === h)) return m;
  }
  return null;
}

export function canAccess(mod: ModuleDef, groups: string[] | null): boolean {
  if (!mod.requiresAuth) return true;
  if (groups === null) return false;
  if (mod.requiredGroups.length === 0) return true;
  return mod.requiredGroups.some((g) => groups.includes(g));
}

export function visibleSwitcherModules(groups: string[] | null): ModuleDef[] {
  return MODULES.filter((m) => m.showInSwitcher && canAccess(m, groups));
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm test src/core/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/registry.ts src/core/registry.test.ts
git commit -m "feat(core): module registry with host + access resolution"
```

---

### Task 3: Routing-Entscheidung (`core/routing.ts`)

**Files:**
- Create: `src/core/routing.ts`
- Test: `src/core/routing.test.ts`

**Interfaces:**
- Consumes: `moduleForHost`, `getModule`, `canAccess` (Task 2).
- Produces:
  - `type RouteDecision = { action: "next" } | { action: "rewrite"; target: string; moduleKey: string } | { action: "login"; callbackUrl: string } | { action: "forbidden" }`
  - `decideRoute(input: { host: string; pathname: string; groups: string[] | null }): RouteDecision`

Edge-sicher.

- [ ] **Step 1: Failing tests**

`src/core/routing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { decideRoute } from "@/core/routing";

describe("decideRoute", () => {
  it("passes through next-auth, health, login, next-internal", () => {
    for (const p of ["/api/auth/session", "/api/health", "/api/health/portal", "/login", "/_next/static/x.js"]) {
      expect(decideRoute({ host: "portal.localtest.me", pathname: p, groups: [] }).action).toBe("next");
    }
  });
  it("rewrites anonymous module without auth", () => {
    const d = decideRoute({ host: "beta.localtest.me", pathname: "/", groups: null });
    expect(d).toEqual({ action: "rewrite", target: "/m/beta", moduleKey: "beta" });
  });
  it("keeps subpaths in rewrite target", () => {
    const d = decideRoute({ host: "beta.localtest.me", pathname: "/foo/bar", groups: null });
    expect(d).toMatchObject({ action: "rewrite", target: "/m/beta/foo/bar" });
  });
  it("redirects to login when auth required and anonymous", () => {
    const d = decideRoute({ host: "alpha.localtest.me", pathname: "/x", groups: null });
    expect(d).toEqual({ action: "login", callbackUrl: "/x" });
  });
  it("forbids when logged in without required group", () => {
    const d = decideRoute({ host: "alpha.localtest.me", pathname: "/", groups: ["other"] });
    expect(d.action).toBe("forbidden");
  });
  it("rewrites when group matches", () => {
    const d = decideRoute({ host: "alpha.localtest.me", pathname: "/", groups: ["alpha-users"] });
    expect(d).toMatchObject({ action: "rewrite", target: "/m/alpha", moduleKey: "alpha" });
  });
  it("unknown host falls back to portal", () => {
    const d = decideRoute({ host: "weird.example.com", pathname: "/", groups: [] });
    expect(d).toMatchObject({ action: "rewrite", target: "/m/portal", moduleKey: "portal" });
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test src/core/routing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/core/routing.ts`**

```ts
import { moduleForHost, getModule, canAccess } from "@/core/registry";

export type RouteDecision =
  | { action: "next" }
  | { action: "rewrite"; target: string; moduleKey: string }
  | { action: "login"; callbackUrl: string }
  | { action: "forbidden" };

const PASSTHROUGH = ["/api/auth", "/api/health", "/login", "/_next", "/favicon.ico"];

export function decideRoute(input: {
  host: string;
  pathname: string;
  groups: string[] | null;
}): RouteDecision {
  const { host, pathname, groups } = input;

  if (PASSTHROUGH.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return { action: "next" };
  }

  const mod = moduleForHost(host) ?? getModule("portal");

  if (mod.requiresAuth && groups === null) {
    return { action: "login", callbackUrl: pathname };
  }
  if (!canAccess(mod, groups)) {
    return { action: "forbidden" };
  }

  const rest = pathname === "/" ? "" : pathname;
  return { action: "rewrite", target: `/m/${mod.key}${rest}`, moduleKey: mod.key };
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm test src/core/routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/routing.ts src/core/routing.test.ts
git commit -m "feat(core): host->module routing decision (rewrite/login/forbidden)"
```

---

### Task 4: Auth-Core + Dev-Login + Login-Seite (`core/auth`)

**Files:**
- Create: `src/core/auth/index.ts`, `src/core/auth/groups.ts`
- Create: `src/types/next-auth.d.ts`
- Create: `src/app/login/page.tsx`, `src/components/login-form.tsx`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Test: `src/core/auth/groups.test.ts`

**Interfaces:**
- Consumes: env `POCKET_ID_*`, `AUTH_DEV_LOGIN`, `AUTH_COOKIE_DOMAIN`, `ADMIN_GROUP`.
- Produces:
  - `export const { auth, handlers, signIn, signOut }` in `src/core/auth/index.ts` (used by `proxy.ts` and server components as `req.auth`/`await auth()`).
  - `parseGroups(source: Record<string, unknown>, claim?: string): string[]` in `groups.ts`.
  - `parseDevGroups(raw: unknown): string[]` in `groups.ts`.

- [ ] **Step 1: Failing tests für die reine Gruppen-Logik**

`src/core/auth/groups.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseGroups, parseDevGroups } from "@/core/auth/groups";

describe("parseGroups", () => {
  it("reads the configured claim as string[]", () => {
    expect(parseGroups({ groups: ["a", "b"] })).toEqual(["a", "b"]);
    expect(parseGroups({ roles: ["x"] }, "roles")).toEqual(["x"]);
  });
  it("returns [] when missing or not an array", () => {
    expect(parseGroups({})).toEqual([]);
    expect(parseGroups({ groups: "nope" })).toEqual([]);
  });
});

describe("parseDevGroups", () => {
  it("splits a comma string, trims, drops empties", () => {
    expect(parseDevGroups("alpha-users, dashboard-admins ,")).toEqual(["alpha-users", "dashboard-admins"]);
  });
  it("handles undefined", () => {
    expect(parseDevGroups(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test src/core/auth/groups.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/core/auth/groups.ts`**

```ts
export function parseGroups(source: Record<string, unknown>, claim = process.env.POCKET_ID_GROUPS_CLAIM ?? "groups"): string[] {
  const value = source[claim];
  return Array.isArray(value) ? (value as string[]) : [];
}

export function parseDevGroups(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm test src/core/auth/groups.test.ts`
Expected: PASS.

- [ ] **Step 5: `src/types/next-auth.d.ts`** — 1:1 aus `../../../iuk-overview/src/types/next-auth.d.ts` übernehmen (Session.user.groups/isAdmin, JWT-Felder).

- [ ] **Step 6: Implement `src/core/auth/index.ts`**

Basis: Port von `../../../iuk-overview/src/lib/auth.ts` (OIDC-Provider `pocket-id`, `refreshAccessToken`, jwt/session/authorized-Callbacks, `trustHost: true`) mit `parseGroups` aus `groups.ts` statt der Inline-Variante. Zusätzlich die folgenden Änderungen:

```ts
// zusätzliche Imports oben:
import Credentials from "next-auth/providers/credentials";
import { parseGroups, parseDevGroups } from "@/core/auth/groups";

// Provider-Array: Dev-Login nur wenn aktiviert, gefolgt vom pocket-id-Provider (portiert)
const providers = [
  ...(process.env.AUTH_DEV_LOGIN === "true"
    ? [
        Credentials({
          id: "dev-login",
          name: "Dev Login",
          credentials: { email: {}, groups: {} },
          authorize(credentials) {
            const email = String(credentials?.email ?? "dev@localtest.me");
            return {
              id: `dev:${email}`,
              name: "Dev User",
              email,
              groups: parseDevGroups(credentials?.groups),
            };
          },
        }),
      ]
    : []),
  // ...der portierte pocket-id-OIDC-Provider aus iuk-overview (unverändert)...
];

// In NextAuth({ ... }) ergänzen:
//   providers,                    // statt der Inline-Liste
//   cookies: {
//     sessionToken: {
//       options: {
//         domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
//         sameSite: "lax",
//         path: "/",
//         secure: process.env.NODE_ENV === "production",
//       },
//     },
//   },
// jwt-Callback: die Gruppen-Extraktion nutzt parseGroups(profile as Record<string,unknown>)
//   und behält `if (user?.groups) token.groups = user.groups;` (fängt den Dev-Login-Fall).
```

`src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/core/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 7: Login-Seite + Formular**

`src/app/login/page.tsx`:
```tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  // LoginForm nutzt useSearchParams() — Next 16 verlangt dafür eine Suspense-Boundary,
  // sonst schlägt `pnpm build` fehl ("useSearchParams should be wrapped in a suspense boundary").
  // pnpm typecheck fängt das NICHT; erst der Build.
  return (
    <Suspense fallback={null}>
      <LoginForm devLogin={process.env.AUTH_DEV_LOGIN === "true"} />
    </Suspense>
  );
}
```

`src/components/login-form.tsx` (Client): bietet den Pocket-ID-Button (`signIn("pocket-id")`) und — wenn `devLogin` — ein Formular mit `email`- und `groups`-Feld, das `signIn("dev-login", { email, groups, redirectTo: callbackUrl })` aufruft. `callbackUrl` aus `useSearchParams().get("callbackUrl") ?? "/"`.
```tsx
"use client";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm({ devLogin }: { devLogin: boolean }) {
  const callbackUrl = useSearchParams().get("callbackUrl") ?? "/";
  const [email, setEmail] = useState("dev@localtest.me");
  const [groups, setGroups] = useState("");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">IuK-Suite Login</h1>
      <button className="rounded-md bg-[var(--color-rot)] px-4 py-2 text-white"
        onClick={() => signIn("pocket-id", { redirectTo: callbackUrl })}>
        Mit Pocket ID anmelden
      </button>
      {devLogin && (
        <form className="flex flex-col gap-2 border-t pt-4"
          onSubmit={(e) => { e.preventDefault(); signIn("dev-login", { email, groups, redirectTo: callbackUrl }); }}>
          <input aria-label="email" className="rounded border px-2 py-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input aria-label="groups" placeholder="comma,separated,groups" className="rounded border px-2 py-1" value={groups} onChange={(e) => setGroups(e.target.value)} />
          <button className="rounded-md bg-[var(--color-tinte)] px-4 py-2 text-white" type="submit">Dev-Login</button>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 8: Verify build/typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: no type errors; all unit tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/core/auth src/types/next-auth.d.ts src/app/login src/components/login-form.tsx src/app/api/auth
git commit -m "feat(core): single-OIDC-client auth + env-gated dev-login + cross-domain cookie"
```

---

### Task 5: Middleware `proxy.ts` (Host-Rewrite + Auth verdrahten)

**Files:**
- Create: `src/proxy.ts`

**Interfaces:**
- Consumes: `auth` (Task 4), `decideRoute` (Task 3).

- [ ] **Step 1: Implement `src/proxy.ts`**

> Vorher: den Middleware-Guide in `node_modules/next/dist/docs/` lesen (Next 16 nennt die Datei `proxy.ts`; vgl. `../../../iuk-overview/src/proxy.ts`).

```ts
import { NextResponse } from "next/server";
import { auth } from "@/core/auth";
import { decideRoute } from "@/core/routing";

export default auth((req) => {
  const host = req.headers.get("host") ?? "";
  const { nextUrl } = req;
  const groups = req.auth?.user?.groups ?? null;

  const decision = decideRoute({ host, pathname: nextUrl.pathname, groups });

  switch (decision.action) {
    case "next":
      return NextResponse.next();
    case "rewrite": {
      const url = nextUrl.clone();
      url.pathname = decision.target;
      return NextResponse.rewrite(url);
    }
    case "login": {
      const url = nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", decision.callbackUrl);
      return NextResponse.redirect(url);
    }
    case "forbidden":
      return new NextResponse("Forbidden", { status: 403 });
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Manuelle Verifikation (Host-Rewrite lebt, keine echten Module nötig)**

Temporär eine Beweisseite anlegen: `src/app/m/beta/page.tsx` → `export default () => <div data-testid="beta">beta module</div>;`
Run (zwei Terminals oder Hintergrund):
```bash
AUTH_SECRET=dev AUTH_DEV_LOGIN=true AUTH_COOKIE_DOMAIN=.localtest.me pnpm dev
curl -s -H "Host: beta.localtest.me" http://localhost:3000/ | grep -q "beta module" && echo "REWRITE OK"
```
Expected: `REWRITE OK` (Host `beta.localtest.me` rendert das beta-Modul, obwohl die URL `/` ist).
Danach die temporäre Seite belassen — sie wird in Task 9 durch die echte beta-Seite ersetzt.

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts src/app/m/beta/page.tsx
git commit -m "feat: proxy middleware wires host-rewrite + auth gating"
```

---

### Task 6: DB-Core — per-Modul better-sqlite3 (`core/db`)

**Files:**
- Create: `src/core/db/index.ts`
- Test: `src/core/db/index.test.ts`

**Interfaces:**
- Produces:
  - `moduleDbPath(key: string): string` (`${DATA_DIR}/<key>.db`, DATA_DIR default `./.data`)
  - `openModuleDatabase(path: string): Database.Database` (WAL-Pragmas, legt Ordner an)
  - `getModuleDb<TSchema>(key: string, schema: TSchema): BetterSQLite3Database<TSchema>` (globalThis-gecacht pro key)

Node-only. Nie in Edge/Registry importieren.

- [ ] **Step 1: Failing test**

`src/core/db/index.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { rmSync } from "node:fs";
import { moduleDbPath, openModuleDatabase } from "@/core/db";

describe("core/db", () => {
  it("moduleDbPath honours DATA_DIR", () => {
    const prev = process.env.DATA_DIR;
    process.env.DATA_DIR = "./.data/testdir";
    expect(moduleDbPath("portal")).toBe("./.data/testdir/portal.db");
    process.env.DATA_DIR = prev;
  });
  it("openModuleDatabase creates file + sets WAL", () => {
    const p = "./.data/test/unit.db";
    rmSync("./.data/test", { recursive: true, force: true });
    const db = openModuleDatabase(p);
    expect(existsSync(p)).toBe(true);
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    db.close();
    rmSync("./.data/test", { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test src/core/db/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/core/db/index.ts`** (Muster aus `../../../lagerbuch/src/db/index.ts`)

```ts
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DATA_DIR = () => process.env.DATA_DIR ?? "./.data";

export function moduleDbPath(key: string): string {
  return join(DATA_DIR(), `${key}.db`);
}

export function openModuleDatabase(path: string): Database.Database {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  return sqlite;
}

const g = globalThis as unknown as { __suiteDb?: Record<string, unknown> };

export function getModuleDb<TSchema extends Record<string, unknown>>(
  key: string,
  schema: TSchema,
): BetterSQLite3Database<TSchema> {
  g.__suiteDb ??= {};
  if (!g.__suiteDb[key]) {
    g.__suiteDb[key] = drizzle(openModuleDatabase(moduleDbPath(key)), { schema });
  }
  return g.__suiteDb[key] as BetterSQLite3Database<TSchema>;
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm test src/core/db/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/db
git commit -m "feat(core): per-module better-sqlite3 factory (WAL, globalThis-cached)"
```

---

### Task 7: Health pro Modul (`/api/health/[modul]`)

**Files:**
- Create: `src/app/api/health/[modul]/route.ts`
- Create: `src/core/health/index.ts`
- Test: `src/core/health/index.test.ts`

**Interfaces:**
- Consumes: `getModule` (Task 2), `openModuleDatabase`, `moduleDbPath` (Task 6).
- Produces: `checkModuleHealth(key: string): { status: "ok" | "error"; module: string; error?: string }`

- [ ] **Step 1: Failing test**

`src/core/health/index.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { checkModuleHealth } from "@/core/health";

describe("checkModuleHealth", () => {
  it("returns ok for a known module (opens its db)", () => {
    process.env.DATA_DIR = "./.data/health-test";
    const r = checkModuleHealth("portal");
    expect(r).toMatchObject({ status: "ok", module: "portal" });
  });
  it("returns error for an unknown module", () => {
    const r = checkModuleHealth("ghost");
    expect(r.status).toBe("error");
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test src/core/health/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/core/health/index.ts`:
```ts
import { getModule } from "@/core/registry";
import { openModuleDatabase, moduleDbPath } from "@/core/db";

export function checkModuleHealth(key: string): { status: "ok" | "error"; module: string; error?: string } {
  try {
    getModule(key); // throws on unknown
    const db = openModuleDatabase(moduleDbPath(key));
    db.prepare("SELECT 1").get();
    db.close();
    return { status: "ok", module: key };
  } catch (e) {
    return { status: "error", module: key, error: e instanceof Error ? e.message : String(e) };
  }
}
```

`src/app/api/health/[modul]/route.ts`:
```ts
import { checkModuleHealth } from "@/core/health";

export async function GET(_req: Request, ctx: { params: Promise<{ modul: string }> }) {
  const { modul } = await ctx.params;
  const result = checkModuleHealth(modul);
  return Response.json(result, { status: result.status === "ok" ? 200 : 503 });
}
```
> Next 16: `params` ist ein Promise — vor Nutzung `await`. Im Zweifel den Route-Handler-Guide in `node_modules/next/dist/docs/` prüfen.

- [ ] **Step 4: Run → pass**

Run: `pnpm test src/core/health/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/health src/app/api/health
git commit -m "feat(core): per-module health endpoint"
```

---

### Task 8: Shell-Core — 3 Varianten + App-Switcher (`core/shell`)

**Files:**
- Create: `src/core/shell/Shell.tsx`, `src/core/shell/FullShell.tsx`, `src/core/shell/MinimalShell.tsx`, `src/core/shell/KioskShell.tsx`, `src/core/shell/AppSwitcher.tsx`, `src/core/shell/moduleUrl.ts`
- Create: `src/components/providers.tsx` (Port), benötigte shadcn-UI-Komponenten
- Modify: `src/app/layout.tsx` (Providers + Toaster einhängen)
- Test: `src/core/shell/moduleUrl.test.ts`

**Interfaces:**
- Consumes: `visibleSwitcherModules`, `getModule` (Task 2); `auth` (Task 4).
- Produces:
  - `moduleUrl(key: string): string` (dev: `http://<key>.localtest.me:${PORT}`)
  - `<Shell variant moduleKey>` dispatcht auf `FullShell|MinimalShell|KioskShell`.
  - `<FullShell>` (server component) lädt `auth()`-Gruppen und rendert `<AppSwitcher>`.

- [ ] **Step 1: shadcn-Basis kopieren**

Aus `../../../iuk-overview/src/components/ui/` diese Dateien nach `src/components/ui/` kopieren: `button.tsx`, `card.tsx`, `dropdown-menu.tsx`, `avatar.tsx`, `sonner.tsx`, `tooltip.tsx`. `src/components/providers.tsx` aus iuk-overview portieren (SessionProvider + ThemeProvider + TooltipProvider + SessionGuard). `src/lib/utils.ts` existiert bereits (Task 1).
Danach `src/app/layout.tsx` anpassen: `<Providers>{children}<Toaster richColors position="bottom-right" /></Providers>` einhängen (wie iuk-overview).

**Import-Reconcile (Pflicht, siehe Global Constraints):** Nach dem Kopieren
`grep -h "^import" src/components/ui/*.tsx src/components/providers.tsx` ausführen und
jede externe Quelle gegen `package.json` prüfen. `dropdown-menu.tsx`/`tooltip.tsx`/`avatar.tsx`
importieren aus `@base-ui/react` (in Task 1 bereits als Dependency gelistet); falls eine kopierte
Datei zusätzlich `cmdk` o. Ä. zieht, jetzt nachinstallieren, sonst schlägt der Build fehl.

- [ ] **Step 2: Failing test für moduleUrl**

`src/core/shell/moduleUrl.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { moduleUrl } from "@/core/shell/moduleUrl";

describe("moduleUrl", () => {
  it("builds dev localtest.me url with port", () => {
    const prev = process.env.PORT;
    process.env.PORT = "3000";
    expect(moduleUrl("qr")).toBe("http://qr.localtest.me:3000");
    process.env.PORT = prev;
  });
});
```

- [ ] **Step 3: Run → fail**

Run: `pnpm test src/core/shell/moduleUrl.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement `moduleUrl.ts`**

```ts
export function moduleUrl(key: string): string {
  const port = process.env.PORT ?? "3000";
  const base = process.env.SUITE_DEV_HOST_SUFFIX ?? "localtest.me";
  return `http://${key}.${base}:${port}`;
}
```

- [ ] **Step 5: Run → pass**

Run: `pnpm test src/core/shell/moduleUrl.test.ts`
Expected: PASS.

- [ ] **Step 6: Shell-Komponenten**

`src/core/shell/AppSwitcher.tsx` (client): bekommt `entries: {key,title,icon}[]` als Prop und rendert ein Raster mit `<a href={moduleUrl(key)}>` (Waffel). Icons via `lucide-react` dynamisch (Map von icon-Name → Komponente für die verwendeten Namen).

`src/core/shell/FullShell.tsx` (server component):
```tsx
import { auth } from "@/core/auth";
import { visibleSwitcherModules, getModule } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { AppSwitcher } from "@/core/shell/AppSwitcher";

export async function FullShell({ moduleKey, children }: { moduleKey: string; children: React.ReactNode }) {
  const session = await auth();
  const mod = getModule(moduleKey);
  const entries = visibleSwitcherModules(session?.user?.groups ?? null)
    .map((m) => ({ key: m.key, title: m.title, icon: m.icon, href: moduleUrl(m.key) }));
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-4 py-3" data-testid="full-shell-header">
        <div className="font-bold" data-testid="module-title">{mod.title}</div>
        <AppSwitcher entries={entries} userName={session?.user?.name ?? null} />
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
```

`src/core/shell/MinimalShell.tsx` (server component): nur Logo + Modulname, **kein Switcher**.
```tsx
import { getModule } from "@/core/registry";
export function MinimalShell({ moduleKey, children }: { moduleKey: string; children: React.ReactNode }) {
  const mod = getModule(moduleKey);
  return (
    <div className="min-h-screen" data-testid="minimal-shell">
      <header className="border-b px-4 py-3 font-bold">{mod.title}</header>
      <main className="p-4">{children}</main>
    </div>
  );
}
```

`src/core/shell/KioskShell.tsx`: gar keine Chrome, Fullscreen.
```tsx
export function KioskShell({ children }: { moduleKey: string; children: React.ReactNode }) {
  return <div className="h-screen w-screen overflow-hidden" data-testid="kiosk-shell">{children}</div>;
}
```

`src/core/shell/Shell.tsx`:
```tsx
import type { ShellVariant } from "@/core/registry";
import { FullShell } from "@/core/shell/FullShell";
import { MinimalShell } from "@/core/shell/MinimalShell";
import { KioskShell } from "@/core/shell/KioskShell";

export function Shell({ variant, moduleKey, children }: { variant: ShellVariant; moduleKey: string; children: React.ReactNode }) {
  if (variant === "full") return <FullShell moduleKey={moduleKey}>{children}</FullShell>;
  if (variant === "minimal") return <MinimalShell moduleKey={moduleKey}>{children}</MinimalShell>;
  return <KioskShell moduleKey={moduleKey}>{children}</KioskShell>;
}
```

- [ ] **Step 7: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add src/core/shell src/components src/app/layout.tsx
git commit -m "feat(core): three shell variants + registry-driven app-switcher"
```

---

### Task 9: Wegwerf-Module alpha/beta/kioskdemo (Keystone-Oberflächen)

**Files:**
- Create: `src/app/m/alpha/layout.tsx`, `src/app/m/alpha/page.tsx`
- Create: `src/app/m/gamma/layout.tsx`, `src/app/m/gamma/page.tsx`
- Modify/Create: `src/app/m/beta/layout.tsx`, `src/app/m/beta/page.tsx` (ersetzt die Task-5-Beweisseite)
- Create: `src/app/m/kioskdemo/layout.tsx`, `src/app/m/kioskdemo/page.tsx`

**Interfaces:**
- Consumes: `Shell` (Task 8), `getModule` (Task 2).

- [ ] **Step 1: Modul-Layouts (statische Shell-Wahl aus Registry)**

Muster für jedes Modul (Beispiel alpha):
`src/app/m/alpha/layout.tsx`:
```tsx
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
export default function AlphaLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("alpha");
  return <Shell variant={mod.shell} moduleKey={mod.key}>{children}</Shell>;
}
```
`src/app/m/gamma/layout.tsx`, `src/app/m/beta/layout.tsx` und `src/app/m/kioskdemo/layout.tsx` analog mit `getModule("gamma")`, `getModule("beta")` bzw. `getModule("kioskdemo")`.

- [ ] **Step 2: Modul-Seiten**

```tsx
// src/app/m/alpha/page.tsx
export default function AlphaPage() {
  return <div data-testid="alpha-content">Alpha (Voll-Shell, Gruppe alpha-users)</div>;
}
// src/app/m/gamma/page.tsx
export default function GammaPage() {
  return <div data-testid="gamma-content">Gamma (Voll-Shell, nur Login, keine Gruppe)</div>;
}
// src/app/m/beta/page.tsx
export default function BetaPage() {
  return <div data-testid="beta-content">Beta (Minimal-Shell, anonym)</div>;
}
// src/app/m/kioskdemo/page.tsx
export default function KioskPage() {
  return <div data-testid="kiosk-content">Kiosk Demo (Fullscreen)</div>;
}
```

- [ ] **Step 3: Manuelle Verifikation aller drei Hosts**

Run (dev-Server aus Task 5-Env):
```bash
AUTH_SECRET=dev AUTH_DEV_LOGIN=true AUTH_COOKIE_DOMAIN=.localtest.me pnpm dev
# beta: anonym, Minimal-Shell
curl -s -H "Host: beta.localtest.me" http://localhost:3000/ | grep -q 'minimal-shell' && echo "BETA MINIMAL OK"
# kioskdemo: anonym, Kiosk
curl -s -H "Host: kioskdemo.localtest.me" http://localhost:3000/ | grep -q 'kiosk-shell' && echo "KIOSK OK"
# alpha: anonym -> redirect zu /login (302)
curl -s -o /dev/null -w "%{http_code}" -H "Host: alpha.localtest.me" http://localhost:3000/ | grep -q '30' && echo "ALPHA GUARDED OK"
```
Expected: `BETA MINIMAL OK`, `KIOSK OK`, `ALPHA GUARDED OK`.

- [ ] **Step 4: Commit**

```bash
git add src/app/m/alpha src/app/m/gamma src/app/m/beta src/app/m/kioskdemo
git commit -m "feat: throwaway alpha/gamma/beta/kioskdemo modules exercising all three shells"
```

---

### Task 10: Keystone-E2E (Playwright über localtest.me-Hosts)

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/keystone.spec.ts`
- Create: `e2e/fixtures.ts`

**Interfaces:**
- Consumes: laufende Suite unter mehreren `*.localtest.me`-Hosts; Dev-Login.

Der Beweis: (1) Host→richtiges Modul+Shell, (2) SSO (ein Login auf alpha, portal ohne Re-Login), (3) Gruppen-Gating (alpha verborgen/verboten ohne Gruppe), (4) Kiosk ohne Chrome.

- [ ] **Step 1: `playwright.config.ts`** (Muster aus `../../../lagerbuch/playwright.config.ts`)

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: "http://portal.localtest.me:3100" },
  webServer: {
    command: "rm -rf ./.data/e2e && next dev -p 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AUTH_SECRET: "test-secret",
      AUTH_DEV_LOGIN: "true",
      AUTH_COOKIE_DOMAIN: ".localtest.me",
      DATA_DIR: "./.data/e2e",
      PORT: "3100",
      NODE_ENV: "development",
    },
  },
});
```
> `*.localtest.me` löst ohne `/etc/hosts`-Eintrag auf `127.0.0.1` auf. Der Dev-Server lauscht auf `localhost:3100`; die Tests sprechen `http://<key>.localtest.me:3100` an → gleicher Server, unterschiedlicher Host-Header. Deshalb greift `AUTH_COOKIE_DOMAIN=.localtest.me` und die Session gilt hostübergreifend.

- [ ] **Step 2: Login-Helper**

`e2e/fixtures.ts`:
```ts
import { Page, expect } from "@playwright/test";

export async function devLogin(page: Page, opts: { host: string; email?: string; groups?: string; callbackPath?: string }) {
  const cb = encodeURIComponent(opts.callbackPath ?? "/");
  await page.goto(`http://${opts.host}:3100/login?callbackUrl=${cb}`);
  await page.getByLabel("email").fill(opts.email ?? "dev@localtest.me");
  await page.getByLabel("groups").fill(opts.groups ?? "");
  await page.getByRole("button", { name: "Dev-Login" }).click();
  await page.waitForLoadState("networkidle");
}
```

- [ ] **Step 3: Failing E2E**

`e2e/keystone.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

test("anonymous beta host renders minimal shell, no switcher", async ({ page }) => {
  await page.goto("http://beta.localtest.me:3100/");
  await expect(page.getByTestId("minimal-shell")).toBeVisible();
  await expect(page.getByTestId("beta-content")).toBeVisible();
  await expect(page.getByTestId("full-shell-header")).toHaveCount(0);
});

test("kiosk host renders fullscreen, no chrome", async ({ page }) => {
  await page.goto("http://kioskdemo.localtest.me:3100/");
  await expect(page.getByTestId("kiosk-shell")).toBeVisible();
  await expect(page.getByTestId("full-shell-header")).toHaveCount(0);
});

test("alpha requires the alpha-users group", async ({ page }) => {
  // logged in WITHOUT the group -> forbidden
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  const res = await page.goto("http://alpha.localtest.me:3100/");
  expect(res?.status()).toBe(403);
});

test("SSO: one login serves alpha + gamma; switcher reflects groups", async ({ page }) => {
  await devLogin(page, { host: "alpha.localtest.me", groups: "alpha-users", callbackPath: "/" });
  // now on alpha, full shell, content visible (no second login)
  await expect(page.getByTestId("alpha-content")).toBeVisible();
  await expect(page.getByTestId("full-shell-header")).toBeVisible();
  // cross to gamma host (auth-required, no group) WITHOUT logging in again — proves the cookie
  // set on .localtest.me carries the session across subdomains
  await page.goto("http://gamma.localtest.me:3100/");
  await expect(page.getByTestId("gamma-content")).toBeVisible();
  await expect(page.getByTestId("full-shell-header")).toBeVisible();
  // switcher contains Alpha (group present)
  await expect(page.getByRole("link", { name: /Alpha/ })).toBeVisible();
});
```

- [ ] **Step 4: Run → fail, then make pass**

Run: `pnpm e2e`
Expected initially: FAIL where behavior/markup differs. Fix markup/labels (e.g. AppSwitcher link accessible name must include the module title) until green. Re-run until all four specs PASS.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/keystone.spec.ts e2e/fixtures.ts
git commit -m "test(e2e): keystone proof — host->shell, SSO, group-gating, kiosk"
```

---

### Task 11: Portal-Datenschicht (SQLite `services` + rbac + Queries + Seed)

**Files:**
- Create: `src/app/m/portal/_db/schema.ts`, `src/app/m/portal/_db/client.ts`
- Create: `src/app/m/portal/_lib/rbac.ts`, `src/app/m/portal/_lib/services.ts`, `src/app/m/portal/_lib/seed.ts`
- Create: `src/app/m/portal/_db/drizzle.config.ts`
- Test: `src/app/m/portal/_lib/rbac.test.ts`, `src/app/m/portal/_lib/services.test.ts`

**Interfaces:**
- Consumes: `getModuleDb`, `openModuleDatabase` (Task 6).
- Produces:
  - `services`-Tabelle (sqlite) + `type Service`, `type NewService`
  - `getDb()` (portal-DB) in `client.ts`
  - `canViewService`, `filterVisibleServices` in `rbac.ts`
  - `getVisibleServicesForUser`, `getAllServices`, `getServiceById`, `createService`, `updateService`, `deleteService` in `services.ts`
  - `seedPortal(db)` in `seed.ts`

- [ ] **Step 1: SQLite-Schema (Port des iuk-overview-pg-Schemas)**

`src/app/m/portal/_db/schema.ts`:
```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const services = sqliteTable("services", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  url: text("url").notNull(),
  iconUrl: text("icon_url"),
  category: text("category"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().$defaultFn(() => []),
  requiredGroups: text("required_groups", { mode: "json" }).$type<string[]>().notNull().$defaultFn(() => []),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  openInNewTab: integer("open_in_new_tab", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
```

`src/app/m/portal/_db/client.ts`:
```ts
import { getModuleDb } from "@/core/db";
import * as schema from "./schema";
export const getDb = () => getModuleDb("portal", schema);
```

`src/app/m/portal/_db/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/app/m/portal/_db/schema.ts",
  out: "./src/app/m/portal/_db/migrations",
  dbCredentials: { url: "./.data/portal.db" },
});
```

- [ ] **Step 2: rbac test + impl** (dialekt-neutral, Port aus iuk-overview)

`src/app/m/portal/_lib/rbac.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { canViewService, filterVisibleServices } from "@/app/m/portal/_lib/rbac";

const base = { isPublic: false, isActive: true, requiredGroups: ["g"] };
describe("portal rbac", () => {
  it("inactive is never visible", () => {
    expect(canViewService([], { ...base, isActive: false })).toBe(false);
  });
  it("public is always visible", () => {
    expect(canViewService([], { ...base, isPublic: true })).toBe(true);
  });
  it("private needs group overlap", () => {
    expect(canViewService(["x"], base)).toBe(false);
    expect(canViewService(["g"], base)).toBe(true);
  });
  it("filterVisibleServices keeps only viewable", () => {
    const list = [{ ...base, id: 1 }, { ...base, id: 2, isPublic: true }];
    expect(filterVisibleServices([], list).map((s) => s.id)).toEqual([2]);
  });
});
```
`src/app/m/portal/_lib/rbac.ts`: 1:1-Port von `../../../iuk-overview/src/lib/rbac.ts` (`canViewService`, `filterVisibleServices`, `isAdmin`). Reine Funktionen, kein DB-Import.

- [ ] **Step 3: Queries (Port; better-sqlite3-Anpassungen)**

`src/app/m/portal/_lib/services.ts`: Port von `../../../iuk-overview/src/lib/services.ts` mit diesen Änderungen:
- `import { getDb } from "@/app/m/portal/_db/client"` und `const db = getDb()` innerhalb jeder Funktion (nicht Modul-Top, wegen Lazy-Open).
- `import { services, type Service, type NewService } from "@/app/m/portal/_db/schema"`.
- `import { filterVisibleServices } from "@/app/m/portal/_lib/rbac"`.
- **Nur diese Funktionen übernehmen** (YAGNI): `getAllServices`, `getVisibleServicesForUser`, `getServiceById`, `getServiceBySlug`, `createService`, `updateService`, `deleteService`. `reorderServices` und `getCategories` **weglassen** (nicht im Skeleton-Scope; `reorderServices` nutzte zudem eine async-Transaktion, die better-sqlite3 nicht erlaubt).
- `updateService`: `updatedAt: new Date()` bleibt (timestamp-mode akzeptiert `Date`).

`src/app/m/portal/_lib/services.test.ts` — gegen eine frische Temp-DB (Migrationen anwenden), z. B.:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/portal/_db/schema";

// getDb() liest DATA_DIR; hier isolierte Datei setzen und Migrationen anwenden
beforeEach(() => {
  process.env.DATA_DIR = "./.data/portal-test";
});

it("create + list visible", async () => {
  // Migration einmalig anwenden (Task-11-Step-4 erzeugt ./src/app/m/portal/_db/migrations)
  const db = drizzle(new Database("./.data/portal-test/portal.db"), { schema });
  migrate(db, { migrationsFolder: "./src/app/m/portal/_db/migrations" });
  const { createService, getVisibleServicesForUser } = await import("@/app/m/portal/_lib/services");
  await createService({ slug: "wiki", name: "Wiki", url: "https://wiki", isPublic: true });
  const visible = await getVisibleServicesForUser([]);
  expect(visible.map((s) => s.slug)).toContain("wiki");
});
```
> Hinweis: Test-Isolation über eigenes `DATA_DIR` je Lauf; `./.data/portal-test` vor dem Lauf löschen (im Test-Setup oder per `rm -rf` im Script).

`src/app/m/portal/_lib/seed.ts`:
```ts
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/app/m/portal/_db/schema";

export async function seedPortal(db: BetterSQLite3Database<typeof schema>) {
  const rows: schema.NewService[] = [
    { slug: "bookstack", name: "BookStack", url: "https://wiki.iuk-ue.de", category: "Doku", isPublic: true, sortOrder: 1 },
    { slug: "vaultwarden", name: "Vaultwarden", url: "https://vault.iuk-ue.de", category: "Tools", requiredGroups: ["dashboard-admins"], isPublic: false, sortOrder: 2 },
  ];
  for (const r of rows) await db.insert(schema.services).values(r).onConflictDoNothing();
}
```

- [ ] **Step 4: Migration generieren + Tests**

Run:
```bash
pnpm exec drizzle-kit generate --config src/app/m/portal/_db/drizzle.config.ts
rm -rf ./.data/portal-test
pnpm test src/app/m/portal
```
Expected: Migrationsordner entsteht; rbac- und services-Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/portal/_db src/app/m/portal/_lib
git commit -m "feat(portal): sqlite services schema, rbac, queries, seed"
```

---

### Task 12: Portal-UI — Kacheln, Vollbild-Switcher, Admin-CRUD

**Files:**
- Create: `src/app/m/portal/layout.tsx`, `src/app/m/portal/page.tsx`
- Create: `src/app/m/portal/actions.ts` (server actions)
- Create: `src/app/m/portal/admin/page.tsx`, `src/app/m/portal/admin/service-form.tsx`
- Create: `src/app/m/portal/_lib/instrument.ts` (Migration+Seed beim ersten Zugriff)
- Create: `e2e/portal.spec.ts`

**Interfaces:**
- Consumes: `getVisibleServicesForUser`, `createService`, `updateService`, `deleteService` (Task 11); `Shell`, `auth`, `isAdmin`.

- [ ] **Step 1: Migration+Seed-Bootstrap für lokale Läufe**

`src/app/m/portal/_lib/instrument.ts`:
```ts
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/app/m/portal/_db/client";
import { seedPortal } from "@/app/m/portal/_lib/seed";

let done = false;
export async function ensurePortalReady() {
  if (done) return;
  const db = getDb();
  migrate(db, { migrationsFolder: "./src/app/m/portal/_db/migrations" });
  await seedPortal(db);
  done = true;
}
```
> Für den Skeleton genügt dieser Lazy-Bootstrap; Spec 2 ersetzt ihn durch echte Migration/Import beim Deploy.

- [ ] **Step 2: Portal-Layout + -Seite (Kacheln)**

`src/app/m/portal/layout.tsx`: wie Task 9, mit `getModule("portal")` → `<Shell variant="full" moduleKey="portal">`.

`src/app/m/portal/page.tsx` (server component):
```tsx
import { auth } from "@/core/auth";
import { ensurePortalReady } from "@/app/m/portal/_lib/instrument";
import { getVisibleServicesForUser } from "@/app/m/portal/_lib/services";

export default async function PortalPage() {
  await ensurePortalReady();
  const session = await auth();
  const services = await getVisibleServicesForUser(session?.user?.groups ?? []);
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" data-testid="portal-grid">
      {services.map((s) => (
        <a key={s.id} href={s.url} target={s.openInNewTab ? "_blank" : undefined}
           className="rounded-xl border p-4 hover:bg-[var(--color-papier)]" data-testid="service-tile">
          <div className="font-semibold">{s.name}</div>
          {s.description && <div className="text-sm text-[var(--color-stahl)]">{s.description}</div>}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Admin-CRUD (server actions + Formular)**

`src/app/m/portal/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/core/auth";
import { isAdmin } from "@/app/m/portal/_lib/rbac";
import { createService, updateService, deleteService } from "@/app/m/portal/_lib/services";
import { ensurePortalReady } from "@/app/m/portal/_lib/instrument";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.groups)) throw new Error("Forbidden");
}

export async function createServiceAction(formData: FormData) {
  await assertAdmin(); await ensurePortalReady();
  await createService({
    slug: String(formData.get("slug")),
    name: String(formData.get("name")),
    url: String(formData.get("url")),
    isPublic: formData.get("isPublic") === "on",
  });
  revalidatePath("/admin");
}

export async function deleteServiceAction(formData: FormData) {
  await assertAdmin(); await ensurePortalReady();
  await deleteService(String(formData.get("id")));
  revalidatePath("/admin");
}
```
(update analog; `isPublic` etc. aus dem Formular.)

`src/app/m/portal/admin/page.tsx` (server component): prüft `isAdmin`, listet alle Services (`getAllServices`), rendert `<ServiceForm>` (create) und je Zeile einen Delete-Button (`<form action={deleteServiceAction}>`). Nicht-Admins → `notFound()` oder 403-Hinweis.

`src/app/m/portal/admin/service-form.tsx`: einfaches `<form action={createServiceAction}>` mit `slug`, `name`, `url`, `isPublic`-Checkbox.

- [ ] **Step 4: Portal-E2E**

`e2e/portal.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

test("portal shows seeded public tiles to any logged-in user", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await expect(page.getByTestId("portal-grid")).toBeVisible();
  await expect(page.getByText("BookStack")).toBeVisible();
  // group-gated service hidden without admin group
  await expect(page.getByText("Vaultwarden")).toHaveCount(0);
});

test("admin can create a service", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "dashboard-admins", callbackPath: "/admin" });
  await page.getByLabel("slug").fill("neu");
  await page.getByLabel("name").fill("Neuer Dienst");
  await page.getByLabel("url").fill("https://neu.iuk-ue.de");
  await page.getByRole("button", { name: /anlegen|create/i }).click();
  await page.goto("http://portal.localtest.me:3100/");
  await expect(page.getByText("Neuer Dienst")).toBeVisible();
});
```
> Admin-User sieht auch das gruppen-gated `Vaultwarden` — optional als weitere Assertion.

- [ ] **Step 5: Run alles**

Run:
```bash
pnpm typecheck
pnpm test
pnpm e2e
```
Expected: typecheck sauber; alle Unit-Tests grün; alle E2E (keystone + portal) grün.

- [ ] **Step 6: Commit**

```bash
git add src/app/m/portal e2e/portal.spec.ts
git commit -m "feat(portal): tiles view + admin CRUD + portal e2e"
```

---

## Definition of Done (Spec 1)

- `pnpm typecheck`, `pnpm test`, `pnpm build` und `pnpm e2e` sind grün.
- Die Wegwerf-Hosts (`alpha`/`gamma` Voll, `beta` Minimal, `kioskdemo` Kiosk auf `*.localtest.me`) rendern die drei Shells; ein Dev-Login auf `alpha` trägt per Cookie auf `.localtest.me` nach `gamma` (SSO, kein Re-Login); `alpha` ist ohne `alpha-users`-Gruppe verboten; Portal zeigt gruppen-gefilterte Kacheln und erlaubt Admin-CRUD.
- Kein Docker/CI/Backup/Import/Cutover (alles Spec 2).

## Self-Review-Ergebnis (gegen den Spec geprüft)

- **Spec-Coverage:** Registry (T2) · Host-Routing/proxy (T3,T5) · Ein-OIDC-Client-SSO + Cookie-Domain + Dev-Login (T4) · 3 Shells + Switcher (T8,T9) · per-Modul-SQLite (T6,T11) · Health (T7) · Keystone-Beweis (T9,T10) · Portal inkl. Admin-CRUD (T11,T12) · lokale Verifikation (T10,T12). Alle Spec-1-Abschnitte haben einen Task.
- **Out-of-Scope** (Docker/CI/Backup/Import/Cutover) bewusst ausgelassen → Spec 2.
- **Typ-Konsistenz:** `ModuleDef`/`ShellVariant` (T2) werden in T3/T8/T9 unverändert genutzt; `RouteDecision` (T3) exakt in `proxy.ts` (T5) konsumiert; `getModuleDb` (T6) in Health (T7) und Portal-Client (T11); `Service`/`NewService` (T11) in Queries/UI (T11,T12).
- **Pre-Flight-Fixes eingearbeitet (Advisor-Review):** (1) fehlende Deps `@base-ui/react` (shadcn base-nova) + `babel-plugin-react-compiler` (reactCompiler) ergänzt + Import-Reconcile-Regel; (2) `gamma`-Wegwerfmodul als authentifiziertes SSO-Cross-Ziel, damit Task 10 self-contained ist und Portal erst in T11/T12 entsteht; (3) `useSearchParams` in Suspense-Boundary (sonst Build-Fehler).
- **Offene Umsetzungsrisiken (beim Bauen prüfen, nicht raten):** (a) next-auth-v5-Cookie-Domain-Option + Credentials-Provider im Edge-`auth()`-Wrapper — Guide in `node_modules/next/dist/docs/` und next-auth-Beta-Docs lesen; (b) Next-16-`params`-Promise in Route-Handlern; (c) drizzle-better-sqlite3 `RETURNING`/`onConflictDoNothing` Verhalten.
