# Ant Design als Design-System der Suite — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tailwind 4 und die kopierten shadcn/base-ui-Komponenten vollständig durch Ant Design 6 ersetzen, mit einem geteilten Theme-Modul (`src/core/theme/`), aus dem alle Suite-Module ihre Farben, Abstände und Tap-Höhen beziehen.

**Architecture:** Ein `ConfigProvider` im Root-Layout, gespeist aus `buildTheme(mode)` — einer reinen Funktion, die DRK-Tokens, den Light-/Dark-Algorithmus und die Einsatz-Tap-Höhen zusammenbaut. Der Dark-Mode hängt an einem Cookie auf `.iuk-ue.de` statt am `localStorage`, damit die Einstellung über alle Modul-Domains gilt und der Server sie beim ersten Render schon kennt. Module ändern nur ihre Darstellung; Server Actions, Auth, Routing und Datenmodell bleiben unangetastet.

**Tech Stack:** Next.js 16.2.6 (App Router, React 19.2.6, React Compiler), antd 6, `@ant-design/nextjs-registry`, `@ant-design/icons`, vitest + jsdom, Playwright.

**Spec:** [`../specs/2026-07-23-antd-design-system-design.md`](../specs/2026-07-23-antd-design-system-design.md)

## Global Constraints

Diese Punkte gelten für **jeden** Task. Sie werden nicht pro Task wiederholt.

- **Branch:** `feat/antd-design-system` (existiert bereits, enthält die Spec-Commits). Nicht auf `main` arbeiten.
- **Paketmanager:** `pnpm` (11.0.9). Kein `npm install`.
- **antd-Version:** `antd@^6.5.1`. React 19 wird nativ unterstützt — **`@ant-design/v5-patch-for-react-19` darf NICHT installiert werden.**
- **pnpm-Peer:** `@ant-design/cssinjs` muss **explizit** in `dependencies`. `@ant-design/nextjs-registry` deklariert es als Peer; unter pnpms strikter Verlinkung reicht die transitive Abhängigkeit von antd nicht.
- **Tap-Höhen gehören in die GLOBALEN Tokens** `token.controlHeight` / `token.controlHeightLG`, niemals in `components: { Button: … }`. Grund: `theme.getDesignToken()` sieht Component-Overrides nicht — der Absicherungstest wäre sonst grün und würde nichts prüfen.
- **Alle `data-testid`-Attribute bleiben wortgleich erhalten.** Sie sind die tragenden Anker von Unit- und E2E-Tests. Ein `data-testid` umzubenennen ist ein Fehler, kein Refactoring.
- **Diese DOM-`id`s müssen überleben** (Unit-Tests selektieren darüber): `qr-url`, `wifi-ssid`, `wifi-pass`, `tel-number`, `c-name`, `c-tel`, `c-email`, `c-org`, `probe`.
- **Diese Accessible Names müssen überleben** (E2E selektiert darüber): `aria-label="email"` und `aria-label="groups"` an den Dev-Login-Feldern, der Button-Text `Dev-Login`, die Portal-Admin-Labels `Slug`/`Name`/`URL` und der Button-Text `Anlegen`, die Switcher-Linktexte (`Alpha`, `Gamma`, …).
- **Server Actions bleiben Server Actions.** Formulare, die heute `<form action={serverAction}>` benutzen, behalten ein natives `<form>` mit `name`-Attributen an den Feldern. antds `Form` sammelt Werte in JavaScript und postet **kein** `FormData` — es ist für diese Formulare das falsche Werkzeug.
- **In Server-Komponenten niemals `X.Y` auf einem antd-Import schreiben.** Alle Compound-Komponenten von antd entstehen durch Laufzeit-Property-Zuweisung auf einem `"use client"`-Modul (`Typography.Title = Title`, `Card.Meta = CardMeta`, `Layout.Header = Header`, `Form.Item`, `Input.TextArea`, `Space.Compact` …). Eine Server-Komponente sieht davon nur eine opake Client-Referenz; ein Property-Zugriff darauf ergibt `undefined` und die Route antwortet mit HTTP 500 („Element type is invalid"). Auflösung je nach Fall: benannter Import aus dem Untermodul (`import { Header, Content } from "antd/es/layout/layout"`), schlichtes HTML (`<h2>` statt `Typography.Title`), oder die Darstellung in eine Client-Komponente verschieben. **In Client-Komponenten (`"use client"`) ist `X.Y` unproblematisch** und bleibt die bevorzugte Schreibweise.
- **`pnpm build` ist für diese Fehlerklasse KEIN Gate.** Der Build rendert die dynamischen Modul-Routen nicht mit echten Requests; ein Server-Component-Renderfehler bleibt dort unsichtbar und schlägt erst im Browser oder in den E2E-Tests auf. Jede angefasste Route muss deshalb vor dem Commit tatsächlich abgerufen worden sein — über die E2E-Tests des Tasks oder per `curl` gegen `next dev`.
- **Sprache:** Alle neuen Kommentare und UI-Texte auf Deutsch, wie im Bestand.
- **Kein Redesign.** Gleiche Informationsarchitektur, gleiche Texte, gleiche Flows.
- **Jeder Task endet mit einem Commit.** Commit-Messages auf Deutsch im Conventional-Commits-Format.

**Gate-Kommandos** (in jedem Task am Ende, sofern nicht anders angegeben):

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

## File Structure

**Neu:**

| Datei | Verantwortung |
|---|---|
| `src/core/theme/tokens.ts` | Rohwerte: DRK-Farben, `TAP`, `TAP_XL`. Einzige Stelle mit Hex-Codes. |
| `src/core/theme/theme.ts` | `buildTheme(mode)` → `ThemeConfig`. Reine Funktion, keine React-Abhängigkeit. |
| `src/core/theme/theme.test.ts` | Sichert die Tap-Höhen und die Primärfarbe gegen stille Regression. |
| `src/core/theme/mode.ts` | Cookie-Name, Parser, Cookie-String, Init-Script. Reine Funktionen. |
| `src/core/theme/mode.test.ts` | Tests für `parseThemeMode` und `themeCookieString`. |
| `src/core/theme/AntdProvider.tsx` | Client: `ConfigProvider` + antd `App` + Mode-Context. |
| `src/core/theme/ThemeToggle.tsx` | Client: Umschalter für den Header. |
| `src/core/theme/KioskThemeProvider.tsx` | Client: vergrößertes Theme für die Kiosk-Shell. |
| `vitest.setup.ts` | jsdom-Stubs für `matchMedia` und `ResizeObserver`. |
| `src/app/m/portal/admin/service-table.tsx` | Client: antd `Table` für die Dienste-Liste. |

**Gelöscht:** `src/components/ui/` (komplett), `src/lib/utils.ts`, `src/lib/utils.test.ts`, `postcss.config.mjs`.

**Geändert:** `src/app/layout.tsx`, `src/components/providers.tsx`, `src/components/login-form.tsx`, `src/core/shell/*.tsx`, `src/core/registry.ts` (nur Icon-Namen), `src/app/globals.css`, `vitest.config.ts`, `package.json`, alle Modul-Seiten.

---

## Task 1: Fundament — Theme-Modul, Registry, Root-Layout

Nach diesem Task rendert die Suite über antd, Tailwind ist aber noch installiert und die Module sehen unverändert aus.

**Files:**
- Modify: `package.json`
- Create: `src/core/theme/tokens.ts`
- Create: `src/core/theme/theme.ts`
- Create: `src/core/theme/mode.ts`
- Create: `src/core/theme/AntdProvider.tsx`
- Create: `vitest.setup.ts`
- Modify: `vitest.config.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/providers.tsx`
- Test: `src/core/theme/theme.test.ts`, `src/core/theme/mode.test.ts`

**Interfaces:**
- Produces: `DRK` (Objekt mit `rot`, `rotDunkel`, `rotBg`, `tinte`, `stahl`, `linie`, `papier`, `karte`, `gelb`, `gelbBg`, `ok`, `okBg`), `TAP: 56`, `TAP_XL: 72` aus `@/core/theme/tokens`
- Produces: `type ThemeMode = "light" | "dark"` und `buildTheme(mode: ThemeMode): ThemeConfig` aus `@/core/theme/theme`
- Produces: `THEME_COOKIE: "iuk-theme"`, `parseThemeMode(raw: string | undefined | null): ThemeMode`, `themeCookieString(mode: ThemeMode, domain?: string): string`, `themeInitScript(domain?: string): string` aus `@/core/theme/mode` (das `ThemeMode` von dort re-exportiert)
- Produces: `AntdProvider({ initialMode, cookieDomain, children })` und `useThemeMode(): { mode: ThemeMode; setMode: (next: ThemeMode) => void }` aus `@/core/theme/AntdProvider`

---

- [ ] **Step 1: Abhängigkeiten installieren**

```bash
pnpm add antd@^6.5.1 @ant-design/icons@^6.3.2 @ant-design/nextjs-registry@^1.3.0 @ant-design/cssinjs
```

Danach prüfen, dass `@ant-design/v5-patch-for-react-19` **nicht** in `package.json` steht:

```bash
grep -c "v5-patch-for-react-19" package.json
```

Erwartet: `0`

- [ ] **Step 2: Tokens anlegen**

`src/core/theme/tokens.ts`:

```ts
/**
 * Rohwerte des Suite-Designs — die einzige Datei mit Hex-Codes.
 * Übernommen aus dem `@theme`-Block der abgelösten `globals.css`, damit der
 * Farbeindruck der Suite über den Umbau hinweg derselbe bleibt.
 */
export const DRK = {
  rot: "#c8000f",
  rotDunkel: "#a2000c",
  rotBg: "#fbe9eb",
  tinte: "#1a1d20",
  stahl: "#5b6570",
  linie: "#d9dde1",
  papier: "#eef0f1",
  karte: "#ffffff",
  gelb: "#b26a00",
  gelbBg: "#fbf1dc",
  ok: "#1e7a3c",
  okBg: "#e4f2e9",
} as const;

/**
 * Tap-Ziele für die Bedienung mit Handschuhen im Einsatz (übernommen aus
 * easy-qr). Das ist eine Einsatzanforderung, keine Stilfrage — deshalb an
 * genau einer Stelle, abgesichert durch `theme.test.ts`.
 */
export const TAP = 56;
export const TAP_XL = 72;
```

- [ ] **Step 3: Den fehlschlagenden Theme-Test schreiben**

`src/core/theme/theme.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { theme as antdTheme } from "antd";
import { buildTheme, type ThemeMode } from "@/core/theme/theme";
import { DRK, TAP, TAP_XL } from "@/core/theme/tokens";

const MODES: ThemeMode[] = ["light", "dark"];

describe("buildTheme", () => {
  // Der eigentliche Grund für diese Datei: die Tap-Höhen sind eine
  // Einsatzanforderung (Handschuhe), die nach dem Umbau nur noch an einer
  // Stelle hängt. Ohne diesen Test kippt sie beim nächsten Theme-Tweak still.
  it.each(MODES)("hält die Tap-Ziele im Modus %s ein", (mode) => {
    const token = antdTheme.getDesignToken(buildTheme(mode));
    expect(token.controlHeight).toBeGreaterThanOrEqual(TAP);
    expect(token.controlHeightLG).toBeGreaterThanOrEqual(TAP_XL);
  });

  it.each(MODES)("setzt DRK-Rot als Seed im Modus %s", (mode) => {
    // Geprüft wird der SEED, nicht der abgeleitete Token: antds darkAlgorithm
    // rechnet colorPrimary für den Kontrast auf dunklem Grund bewusst um
    // (#c8000f -> #ad0310, via generate(seed, {theme:'dark'})[5]). Diese
    // Verschiebung ist gewollt — sie zurückzudrehen hieße, dem Design-System
    // seine Lesbarkeitsregel zu nehmen. Unsere Zusage ist "die Suite ist auf
    // DRK-Rot eingestellt", nicht "jeder Modus zeigt denselben Hexwert".
    expect(buildTheme(mode).token?.colorPrimary).toBe(DRK.rot);
  });

  it("gibt DRK-Rot im hellen Modus unverändert durch", () => {
    // Im hellen Modus rechnet der defaultAlgorithm den Seed nicht um — hier
    // muss der abgeleitete Token also wirklich exakt die DRK-Farbe sein.
    const token = antdTheme.getDesignToken(buildTheme("light"));
    expect(token.colorPrimary.toLowerCase()).toBe(DRK.rot);
  });

  it("unterscheidet hellen und dunklen Grundton", () => {
    const light = antdTheme.getDesignToken(buildTheme("light"));
    const dark = antdTheme.getDesignToken(buildTheme("dark"));
    expect(light.colorBgBase).not.toBe(dark.colorBgBase);
  });
});
```

- [ ] **Step 4: Test laufen lassen, Fehlschlag bestätigen**

```bash
pnpm vitest run src/core/theme/theme.test.ts
```

Erwartet: FAIL — `Failed to resolve import "@/core/theme/theme"`.

- [ ] **Step 5: `buildTheme` implementieren**

`src/core/theme/theme.ts`:

```ts
import { theme as antdTheme, type ThemeConfig } from "antd";
import { DRK, TAP, TAP_XL } from "@/core/theme/tokens";

/** Die beiden Betriebsarten des Suite-Themes. Hier definiert, weil sie zum
 *  Theme gehören — `mode.ts` (Cookie-Transport) reicht den Typ nur weiter. */
export type ThemeMode = "light" | "dark";

/**
 * Das Design-System der Suite als eine Funktion. Reine Berechnung, kein React —
 * dadurch in `theme.test.ts` statisch prüfbar und aus Server- wie
 * Client-Komponenten aufrufbar.
 */
export function buildTheme(mode: ThemeMode): ThemeConfig {
  const dark = mode === "dark";
  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    // CSS-Variablen statt eingebetteter Werte: der Moduswechsel ist damit ein
    // Variablen-Swap und keine Neu-Serialisierung der Stylesheets.
    cssVar: { key: "iuk" },
    hashed: false,
    token: {
      colorPrimary: DRK.rot,
      colorError: DRK.rot,
      colorWarning: DRK.gelb,
      colorSuccess: DRK.ok,
      colorLink: DRK.rot,
      borderRadius: 8,
      fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
      fontFamilyCode: "var(--font-geist-mono), ui-monospace, monospace",
      // GLOBAL, nicht unter `components`: nur globale Tokens sieht
      // theme.getDesignToken(), und nur so greift die Höhe auch auf Select,
      // DatePicker & Co., statt auf eine handgepflegte Komponentenliste.
      controlHeight: TAP,
      controlHeightLG: TAP_XL,
    },
    components: {
      // Layout-Flächen explizit, weil antds Vorgabe für Layout.Header ein
      // dunkles Blau ist, das mit DRK-Rot streitet.
      Layout: {
        headerBg: dark ? "#141414" : DRK.karte,
        headerColor: dark ? "#ffffff" : DRK.tinte,
        bodyBg: dark ? "#000000" : DRK.papier,
        headerHeight: 64,
      },
    },
  };
}
```

- [ ] **Step 6: Test laufen lassen, Erfolg bestätigen**

```bash
pnpm vitest run src/core/theme/theme.test.ts
```

Erwartet: PASS, 6 Tests.

Der abgeleitete `colorPrimary` ist im **Dark Mode absichtlich nicht** `#c8000f` — antds `darkAlgorithm` rechnet den Seed über `generate(seed, { theme: "dark" })[5]` auf `#ad0310` um, damit er auf dunklem Grund lesbar bleibt. Diese Verschiebung ist der Sinn der Übung und darf **nicht** per zusammengesetztem Algorithmus zurückgedreht werden; deshalb prüft der Test den Seed und nur im hellen Modus den abgeleiteten Wert.

- [ ] **Step 7: Den fehlschlagenden Mode-Test schreiben**

`src/core/theme/mode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseThemeMode, themeCookieString, themeInitScript, THEME_COOKIE } from "@/core/theme/mode";

describe("parseThemeMode", () => {
  it("liest 'dark' als dark", () => {
    expect(parseThemeMode("dark")).toBe("dark");
  });

  // Alles andere ist light: ohne Cookie rendert der Server hell, und ein
  // kaputter Cookie-Wert darf die Seite nicht in einen dritten Zustand kippen.
  it.each([undefined, null, "", "light", "system", "kaputt"])("liest %s als light", (raw) => {
    expect(parseThemeMode(raw)).toBe("light");
  });
});

describe("themeCookieString", () => {
  it("setzt Pfad, Lebensdauer und SameSite", () => {
    const s = themeCookieString("dark");
    expect(s).toContain(`${THEME_COOKIE}=dark`);
    expect(s).toContain("Path=/");
    expect(s).toContain("SameSite=Lax");
    expect(s).not.toContain("Domain=");
  });

  // Der Grund für die ganze Cookie-Konstruktion: die Einstellung muss über
  // alle Modul-Domains hinweg gelten (qr.iuk-ue.de <-> iuk-ue.de).
  it("trägt die Domain, wenn eine gesetzt ist", () => {
    expect(themeCookieString("light", ".iuk-ue.de")).toContain("Domain=.iuk-ue.de");
  });
});

describe("themeInitScript", () => {
  it("prüft auf ein vorhandenes Cookie, bevor es schreibt", () => {
    expect(themeInitScript()).toContain(THEME_COOKIE);
    expect(themeInitScript()).toContain("prefers-color-scheme");
  });

  it("nimmt die Domain auf", () => {
    expect(themeInitScript(".iuk-ue.de")).toContain("Domain=.iuk-ue.de");
  });
});
```

- [ ] **Step 8: Test laufen lassen, Fehlschlag bestätigen**

```bash
pnpm vitest run src/core/theme/mode.test.ts
```

Erwartet: FAIL — `Failed to resolve import "@/core/theme/mode"`.

- [ ] **Step 9: `mode.ts` implementieren**

`src/core/theme/mode.ts`:

```ts
import type { ThemeMode } from "@/core/theme/theme";

export type { ThemeMode };

export const THEME_COOKIE = "iuk-theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Der Modus steckt in einem Cookie, nicht im localStorage. Grund ist die
 * Multi-Host-Architektur: localStorage ist pro Origin, die Einstellung auf
 * `qr.iuk-ue.de` gälte auf `iuk-ue.de` also nicht. Ein Cookie auf
 * `.iuk-ue.de` gilt überall — und der Server kann es lesen und damit schon
 * den ersten Render im richtigen Modus ausliefern.
 */
export function parseThemeMode(raw: string | undefined | null): ThemeMode {
  return raw === "dark" ? "dark" : "light";
}

export function themeCookieString(mode: ThemeMode, domain?: string): string {
  const parts = [`${THEME_COOKIE}=${mode}`, "Path=/", `Max-Age=${ONE_YEAR}`, "SameSite=Lax"];
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

/**
 * Läuft als Inline-Script im `<head>`.
 *
 * Es verhindert KEIN Flackern — das tut das serverseitig gelesene Cookie.
 * Seine einzige Aufgabe ist, beim allerersten Besuch die OS-Präferenz ins
 * Cookie zu schreiben, damit sie ab dem nächsten Seitenaufruf greift. Wer das
 * hier anfasst, soll nicht die next-themes-Denkweise ("Blocking-Script gegen
 * FOUC") hineinlesen: die trägt in dieser Architektur nicht.
 */
export function themeInitScript(domain?: string): string {
  const domainPart = domain ? `;Domain=${domain}` : "";
  return (
    `(function(){try{` +
    `if(document.cookie.indexOf('${THEME_COOKIE}=')>-1)return;` +
    `var m=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';` +
    `document.cookie='${THEME_COOKIE}='+m+';Path=/;Max-Age=${ONE_YEAR};SameSite=Lax${domainPart}';` +
    `}catch(e){}})()`
  );
}
```

- [ ] **Step 10: Test laufen lassen, Erfolg bestätigen**

```bash
pnpm vitest run src/core/theme/mode.test.ts
```

Erwartet: PASS, 10 Tests.

- [ ] **Step 11: jsdom-Stubs einrichten**

Ohne diesen Schritt brechen später **alle** Component-Tests aus Umgebungsgründen und sehen aus wie Migrationsschaden.

`vitest.setup.ts` (Projektwurzel):

```ts
/**
 * antd greift auf `matchMedia` (Responsive-Breakpoints in Grid, Table, Drawer)
 * und `ResizeObserver` (Overflow-Erkennung in Menu, Tabs, Select) zu. jsdom
 * kennt beides nicht. Ohne diese Stubs schlagen die Component-Tests reihenweise
 * mit "matchMedia is not a function" fehl — ein Umgebungsproblem, das leicht
 * für einen Migrationsfehler gehalten wird.
 *
 * Die Stubs sind absichtlich dumm: kein Test in diesem Projekt prüft
 * Responsive-Verhalten. Sobald einer das tut, gehört hier eine echte
 * Implementierung hin, kein `matches: false`.
 */
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof window.ResizeObserver;
  }
}
```

`vitest.config.ts` — `setupFiles` ergänzen:

```ts
import { defineConfig, configDefaults } from "vitest/config";
import path from "path";
export default defineConfig({
  // e2e/*.spec.ts are Playwright specs (run via `pnpm e2e`); exclude them from Vitest's
  // default glob so `pnpm test` only collects the unit tests under src/.
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "e2e/**"],
    // Läuft auch für die node-Umgebung; der Guard in der Datei greift dort.
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 12: `AntdProvider` schreiben**

`src/core/theme/AntdProvider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { App, ConfigProvider } from "antd";
import deDE from "antd/locale/de_DE";
import { buildTheme } from "@/core/theme/theme";
import { themeCookieString, type ThemeMode } from "@/core/theme/mode";

interface ThemeModeApi {
  mode: ThemeMode;
  setMode: (next: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeApi>({ mode: "light", setMode: () => {} });

export function useThemeMode(): ThemeModeApi {
  return useContext(ThemeModeContext);
}

/**
 * Der Provider bekommt den MODUS, nicht die fertige ThemeConfig. Das ist keine
 * Geschmacksfrage: `buildTheme` steckt eine Algorithmus-FUNKTION in die Config,
 * und Funktionen überleben die Server-zu-Client-Grenze nicht. Ein Server-Layout
 * könnte die Config also gar nicht durchreichen.
 *
 * `<App>` ist Pflicht, nicht Zierde: statische Aufrufe von `message`,
 * `notification` und `Modal.confirm` rendern in einen eigenen DOM-Knoten und
 * verlieren dabei Theme und Locale. Innerhalb von `<App>` holt man sich die
 * Instanzen über `App.useApp()` und behält beides.
 */
export function AntdProvider({
  initialMode,
  cookieDomain,
  children,
}: {
  initialMode: ThemeMode;
  cookieDomain?: string;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      document.cookie = themeCookieString(next, cookieDomain);
      // Scrollbalken und native Bedienelemente ziehen sonst nicht mit.
      document.documentElement.style.colorScheme = next;
    },
    [cookieDomain],
  );

  const api = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <ThemeModeContext.Provider value={api}>
      <ConfigProvider theme={buildTheme(mode)} locale={deDE}>
        <App>{children}</App>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
```

- [ ] **Step 13: `providers.tsx` entschlacken**

`src/components/providers.tsx` vollständig ersetzen. **`SessionGuard` bleibt unverändert** — der Signout bei `RefreshTokenError` ist Auth-Verhalten, kein UI-Beiwerk, und darf beim Wegfall von `TooltipProvider`/`ThemeProvider` nicht mit verschwinden.

```tsx
"use client";

import { useEffect } from "react";
import { SessionProvider, signOut, useSession } from "next-auth/react";

function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.error === "RefreshTokenError") {
      signOut({ callbackUrl: "/api/auth/oidc-signout" });
    }
  }, [session?.error]);

  return children;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionGuard>{children}</SessionGuard>
    </SessionProvider>
  );
}
```

- [ ] **Step 14: Root-Layout verdrahten**

`src/app/layout.tsx` vollständig ersetzen:

```tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Providers } from "@/components/providers";
import { AntdProvider } from "@/core/theme/AntdProvider";
import { THEME_COOKIE, parseThemeMode, themeInitScript } from "@/core/theme/mode";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IuK-Suite",
  description: "Internes Service-Dashboard für I&K",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Serverseitig gelesen, damit der ERSTE Render schon den richtigen
  // Algorithmus trägt: kein Hydration-Mismatch, kein FOUC. Kostet nichts —
  // alle Routen sind durch Proxy-Rewrite und auth() ohnehin dynamisch.
  const mode = parseThemeMode((await cookies()).get(THEME_COOKIE)?.value);
  const cookieDomain = process.env.AUTH_COOKIE_DOMAIN || undefined;

  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={{ colorScheme: mode }}
      suppressHydrationWarning
    >
      <head>
        {/* Primt beim ersten Besuch die OS-Präferenz ins Cookie — siehe mode.ts. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(cookieDomain) }} />
      </head>
      <body>
        <AntdRegistry>
          <Providers>
            <AntdProvider initialMode={mode} cookieDomain={cookieDomain}>
              {children}
            </AntdProvider>
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
```

`<Toaster>` entfällt ersatzlos: `grep -rn "toast(" src/` zeigt, dass sonner nur eingebunden, aber nie aufgerufen wurde.

- [ ] **Step 15: Gates + Build**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Erwartet: alles grün, 58+ Unit-Tests.

Bekannte Stolperstelle: bricht `pnpm build` mit einem ESM-Auflösungsfehler aus `antd`, `rc-*` oder `@ant-design/icons` ab, in `next.config.ts` ergänzen:

```ts
transpilePackages: ["antd", "@ant-design/icons", "rc-util", "rc-pagination", "rc-picker"],
```

- [ ] **Step 16: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts vitest.setup.ts src/core/theme src/app/layout.tsx src/components/providers.tsx
git commit -m "feat(theme): antd 6 als Fundament mit geteiltem Theme-Modul

buildTheme() als reine Funktion, Tap-Hoehen in den globalen Tokens,
Dark Mode ueber ein Cookie auf .iuk-ue.de statt localStorage."
```

---

## Task 2: Shells, App-Switcher, Login

**Files:**
- Modify: `src/core/registry.ts` (nur das `icon`-Feld und sein Kommentar)
- Modify: `src/core/shell/FullShell.tsx`, `MinimalShell.tsx`, `KioskShell.tsx`, `AppSwitcher.tsx`
- Create: `src/core/theme/ThemeToggle.tsx`, `src/core/theme/KioskThemeProvider.tsx`
- Modify: `src/components/login-form.tsx`
- Test: `e2e/keystone.spec.ts` (nur lesen — muss unverändert grün bleiben)

**Interfaces:**
- Consumes: `useThemeMode()`, `buildTheme()`, `TAP_XL` aus Task 1
- Produces: `ThemeToggle()` aus `@/core/theme/ThemeToggle`, `KioskThemeProvider({ children })` aus `@/core/theme/KioskThemeProvider`

---

- [ ] **Step 1: Icon-Namen in der Registry umstellen**

In `src/core/registry.ts` den Kommentar am `icon`-Feld ändern:

```ts
  icon: string; // @ant-design/icons Komponentenname
```

und die sechs Einträge in `MODULES` umstellen — nur das `icon`-Feld, alles andere bleibt:

| Modul | alt | neu |
|---|---|---|
| `portal` | `LayoutGrid` | `AppstoreOutlined` |
| `qr` | `QrCode` | `QrcodeOutlined` |
| `alpha` | `Square` | `BorderOutlined` |
| `gamma` | `Triangle` | `CaretUpOutlined` |
| `beta` | `Circle` | `GlobalOutlined` |
| `kioskdemo` | `Monitor` | `DesktopOutlined` |

- [ ] **Step 2: `AppSwitcher` auf antd umstellen**

`src/core/shell/AppSwitcher.tsx` vollständig ersetzen. Der Kommentar zur Sichtbarkeit bleibt — er begründet, warum hier kein Dropdown steht:

```tsx
"use client";

import {
  AppstoreOutlined,
  BorderOutlined,
  CaretUpOutlined,
  DesktopOutlined,
  GlobalOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Space } from "antd";
import type { ComponentType } from "react";

// Icon-Name (aus ModuleDef.icon, Registry) -> @ant-design/icons Komponente.
// Deckt die aktuell in MODULES verwendeten Namen ab; unbekannte Namen fallen
// auf AppstoreOutlined zurück statt den Render zu crashen.
const ICONS: Record<string, ComponentType> = {
  AppstoreOutlined,
  QrcodeOutlined,
  BorderOutlined,
  CaretUpOutlined,
  GlobalOutlined,
  DesktopOutlined,
};

export interface AppSwitcherEntry {
  key: string;
  title: string;
  icon: string;
  href: string;
}

// Always-visible Raster von Modul-Links (Waffel). Bewusst NICHT hinter einem
// geschlossenen Dropdown/Popup versteckt: keystone.spec.ts prüft
// `page.getByRole("link", { name: /Alpha/ }).toBeVisible()` ohne vorheriges
// Öffnen — die Links müssen also beim Seitenaufbau direkt sichtbar sein.
// Deshalb `Button href=…` (rendert ein <a>, Rolle "link") statt Menu/Dropdown.
export function AppSwitcher({
  entries,
  userName,
}: {
  entries: AppSwitcherEntry[];
  userName: string | null;
}) {
  const initials = (userName ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Space size="middle" data-testid="app-switcher">
      <Space size={4} wrap component="nav" aria-label="Module">
        {entries.map((entry) => {
          const Icon = ICONS[entry.icon] ?? AppstoreOutlined;
          return (
            <Button key={entry.key} type="text" href={entry.href} icon={<Icon />}>
              {entry.title}
            </Button>
          );
        })}
      </Space>
      {userName ? <Avatar size="small">{initials}</Avatar> : null}
    </Space>
  );
}
```

Unterstützt die installierte antd-Version `component` an `Space` nicht, stattdessen ein natives `<nav aria-label="Module" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>` verwenden — das `aria-label="Module"` muss in jedem Fall erhalten bleiben.

- [ ] **Step 3: `ThemeToggle` schreiben**

`src/core/theme/ThemeToggle.tsx`:

```tsx
"use client";

import { Button, Tooltip } from "antd";
import { BulbFilled, BulbOutlined } from "@ant-design/icons";
import { useThemeMode } from "@/core/theme/AntdProvider";

export function ThemeToggle() {
  const { mode, setMode } = useThemeMode();
  const next = mode === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Dunkles Design" : "Helles Design";

  return (
    <Tooltip title={label}>
      <Button
        type="text"
        shape="circle"
        data-testid="theme-toggle"
        aria-label={label}
        icon={mode === "dark" ? <BulbFilled /> : <BulbOutlined />}
        onClick={() => setMode(next)}
      />
    </Tooltip>
  );
}
```

- [ ] **Step 4: `FullShell` auf `Layout` umstellen**

`src/core/shell/FullShell.tsx` vollständig ersetzen. `data-testid="full-shell-header"` und `data-testid="module-title"` bleiben wortgleich:

```tsx
import { Layout } from "antd";
// `Header`/`Content` NICHT als `Layout.Header`/`Layout.Content`: diese Datei ist
// eine Server-Komponente, und antd hängt die Unterkomponenten erst zur Laufzeit
// per Property-Zuweisung an ein "use client"-Modul. Der Property-Zugriff auf die
// Client-Referenz ergibt `undefined` → HTTP 500. Siehe Global Constraints.
import { Header, Content } from "antd/es/layout/layout";
import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { switcherEntries } from "@/core/shell/switcherEntries";
import { AppSwitcher } from "@/core/shell/AppSwitcher";
import { ThemeToggle } from "@/core/theme/ThemeToggle";

export async function FullShell({
  moduleKey,
  children,
}: {
  moduleKey: string;
  children: React.ReactNode;
}) {
  const session = await auth();
  const mod = getModule(moduleKey);
  // Einträge werden hier (server-seitig) gebaut: switcherEntries() liest über
  // moduleUrl() process.env, das im Client-Bundle nicht verfügbar ist.
  // AppSwitcher bekommt nur fertige hrefs.
  const entries = switcherEntries(session?.user?.groups ?? null);
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        data-testid="full-shell-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          paddingInline: 16,
        }}
      >
        <strong data-testid="module-title">{mod.title}</strong>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AppSwitcher entries={entries} userName={session?.user?.name ?? null} />
          <ThemeToggle />
        </span>
      </Header>
      <Content style={{ padding: 16 }}>{children}</Content>
    </Layout>
  );
}
```

- [ ] **Step 5: `MinimalShell` auf `Layout` umstellen**

`src/core/shell/MinimalShell.tsx` vollständig ersetzen. `maxWidth` am Content, weil hier das qr-Modul hängt und auf dem Handy bedient wird:

```tsx
import { Layout } from "antd";
// Siehe FullShell: Named-Import statt Layout.Header/Layout.Content, weil eine
// Server-Komponente antds Compound-Zugriff nicht aufloest.
import { Header, Content } from "antd/es/layout/layout";
import { getModule } from "@/core/registry";

export function MinimalShell({
  moduleKey,
  children,
}: {
  moduleKey: string;
  children: React.ReactNode;
}) {
  const mod = getModule(moduleKey);
  return (
    <Layout style={{ minHeight: "100vh" }} data-testid="minimal-shell">
      <Header style={{ paddingInline: 16 }}>
        <strong>{mod.title}</strong>
      </Header>
      <Content style={{ padding: 16 }}>
        <div style={{ maxWidth: 640, marginInline: "auto" }}>{children}</div>
      </Content>
    </Layout>
  );
}
```

- [ ] **Step 6: Kiosk-Theme und `KioskShell` schreiben**

`src/core/theme/KioskThemeProvider.tsx`:

```tsx
"use client";

import { ConfigProvider } from "antd";
import { buildTheme } from "@/core/theme/theme";
import { useThemeMode } from "@/core/theme/AntdProvider";
import { TAP_XL } from "@/core/theme/tokens";

/**
 * Wandmonitor-Theme: erbt Farben und Algorithmus vom Suite-Theme, vergrößert
 * aber Schrift und Bedienelemente — ein Kiosk wird aus mehreren Metern
 * Entfernung gelesen, nicht aus Armlänge.
 *
 * Eigene Client-Komponente, weil `buildTheme()` eine Algorithmus-FUNKTION in
 * die Config legt und Funktionen die Server-zu-Client-Grenze nicht überleben.
 * Die Server-Shell könnte die Config also nicht als Prop durchreichen.
 */
export function KioskThemeProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useThemeMode();
  const base = buildTheme(mode);

  return (
    <ConfigProvider
      theme={{
        ...base,
        token: {
          ...base.token,
          fontSize: 20,
          fontSizeHeading1: 48,
          controlHeight: TAP_XL,
          controlHeightLG: TAP_XL + 24,
        },
      }}
      componentSize="large"
    >
      {children}
    </ConfigProvider>
  );
}
```

`src/core/shell/KioskShell.tsx` vollständig ersetzen:

```tsx
import { KioskThemeProvider } from "@/core/theme/KioskThemeProvider";

export function KioskShell({
  children,
}: {
  moduleKey: string;
  children: React.ReactNode;
}) {
  return (
    <KioskThemeProvider>
      <div
        data-testid="kiosk-shell"
        style={{ height: "100dvh", width: "100vw", overflow: "hidden", padding: 24 }}
      >
        {children}
      </div>
    </KioskThemeProvider>
  );
}
```

- [ ] **Step 7: Login-Formular umstellen**

`src/components/login-form.tsx`: **Struktur und Logik bleiben wie sie sind** — natives `<form onSubmit>`, `signIn(...)`-Aufrufe, alle Kommentare, `absoluteCallbackUrl`, `PocketIdLogo`. Geändert wird ausschließlich die Darstellung:

1. Alle Tailwind-`className`-Werte durch `style`-Objekte ersetzen. Die dekorativen Ebenen (Hintergrundbild, Verlauf, zwei weiche Farbkreise, Glas-Panel) bleiben erhalten — das ist eine gestaltete Seite und dieses Spec macht kein Redesign. Farbwerte aus `DRK` beziehen statt aus `var(--color-…)`.
2. Beide `<input>` durch antd `Input` ersetzen. **`aria-label="email"` und `aria-label="groups"` müssen wortgleich erhalten bleiben** — `e2e/fixtures.ts` greift über `getByLabel("email")` bzw. `getByLabel("groups")` zu, und diese Fixture trägt jeden einzelnen E2E-Test.
3. Beide `<button>` durch antd `Button` ersetzen: der Pocket-ID-Knopf als `<Button type="primary" size="large" block icon={<PocketIdLogo />} onClick={…}>Mit Pocket ID anmelden</Button>`, der Dev-Login-Knopf als `<Button htmlType="submit" size="large" block>Dev-Login</Button>`. **Der Text `Dev-Login` bleibt wortgleich** (`getByRole("button", { name: "Dev-Login" })`).
4. Das `<form>`-Element und sein `onSubmit`-Handler bleiben ein natives Formular. **Kein antd `Form`** — der Handler ruft `signIn("dev-login", …)` mit `redirect: false` und navigiert selbst; die Fixture verlässt sich auf genau dieses Verhalten.

- [ ] **Step 8: Gates + Build**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- [ ] **Step 9: E2E gegen die Shells**

```bash
pnpm e2e -- keystone.spec.ts
```

Erwartet: 4 Tests grün. Bricht `SSO: one login serves alpha + gamma` an `getByRole("link", { name: /Alpha/ })`, rendert der `AppSwitcher` seine Einträge nicht als `<a>` — dann prüfen, dass `Button` ein `href` bekommt (mit `href` rendert antd ein `<a>`, ohne ein `<button>`).

- [ ] **Step 10: Commit**

```bash
git add src/core/registry.ts src/core/shell src/core/theme src/components/login-form.tsx
git commit -m "feat(shell): Shells, App-Switcher und Login auf antd

Registry-Icons von lucide auf @ant-design/icons; Kiosk-Shell bekommt ein
eigenes, vergroessertes Theme fuer den Wandmonitor."
```

---

## Task 3: Portal

**Files:**
- Modify: `src/app/m/portal/page.tsx`
- Modify: `src/app/m/portal/admin/page.tsx`
- Modify: `src/app/m/portal/admin/service-form.tsx`
- Create: `src/app/m/portal/admin/service-table.tsx`
- Test: `e2e/portal.spec.ts` (muss unverändert grün bleiben)

**Interfaces:**
- Consumes: nichts Neues aus Task 1/2 außer dem globalen Theme
- Produces: `ServiceTable({ services, deleteAction })` aus `@/app/m/portal/admin/service-table`

**Zwingende Erhaltung:** `data-testid` `portal-grid`, `service-tile`, `portal-admin`, `service-table`, `service-row`. Die Formularfelder behalten `name="slug"`, `name="name"`, `name="url"`, `name="isPublic"` — `createServiceAction` liest sie aus `FormData`.

---

- [ ] **Step 1: Kachel-Raster auf `Row`/`Col`/`Card`**

`src/app/m/portal/page.tsx` vollständig ersetzen:

```tsx
import { Card, Col, Row } from "antd";
import { auth } from "@/core/auth";
import { getVisibleServicesForUser } from "@/app/m/portal/_lib/services";

export default async function PortalPage() {
  const session = await auth();
  const services = await getVisibleServicesForUser(session?.user?.groups ?? []);
  return (
    <Row gutter={[16, 16]} data-testid="portal-grid">
      {services.map((s) => (
        <Col key={s.id} xs={12} sm={8}>
          {/* Der Link liegt AUSSEN: antds Card rendert kein <a>, und die Kachel
              ist die einzige Navigation ins Ziel — sie muss ein Link bleiben. */}
          <a
            href={s.url}
            target={s.openInNewTab ? "_blank" : undefined}
            rel={s.openInNewTab ? "noopener noreferrer" : undefined}
            data-testid="service-tile"
            style={{ display: "block", height: "100%" }}
          >
            {/* Kein `Card.Meta`: diese Datei ist eine Server-Komponente, und
                Property-Zugriffe auf antd-Compounds ergeben dort `undefined`
                (siehe Global Constraints). Schlichtes Markup tut hier dasselbe. */}
            <Card hoverable size="small" style={{ height: "100%" }}>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              {s.description ? (
                <div style={{ fontSize: 14, opacity: 0.65 }}>{s.description}</div>
              ) : null}
            </Card>
          </a>
        </Col>
      ))}
    </Row>
  );
}
```

- [ ] **Step 2: Dienste-Tabelle als Client-Komponente**

antds `Table` braucht `columns` mit `render`-Funktionen — die überleben die Server-zu-Client-Grenze nicht. Deshalb eine eigene Client-Komponente, die nur Daten und die Server Action als Props bekommt (Server Actions **sind** als Props zulässig).

`src/app/m/portal/admin/service-table.tsx`:

```tsx
"use client";

import { Button, Table } from "antd";

export interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  url: string;
  isPublic: boolean;
}

export function ServiceTable({
  services,
  deleteAction,
}: {
  services: ServiceRow[];
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  // Das data-testid sitzt am umschließenden div, NICHT an <Table>: antds Table
  // reicht unbekannte DOM-Attribute nicht zuverlässig durch, und ein still
  // verschwindendes Testid wäre erst im nächsten Testlauf aufgefallen.
  return (
    <div data-testid="service-table">
    <Table<ServiceRow>
      rowKey="id"
      dataSource={services}
      pagination={false}
      size="small"
      onRow={() => ({ "data-testid": "service-row" }) as React.HTMLAttributes<HTMLElement>}
      columns={[
        { title: "Name", dataIndex: "name" },
        { title: "Slug", dataIndex: "slug" },
        { title: "URL", dataIndex: "url" },
        { title: "Öffentlich", dataIndex: "isPublic", render: (v: boolean) => (v ? "ja" : "nein") },
        {
          title: "",
          key: "aktionen",
          align: "right",
          // Natives <form> mit der Server Action, kein onClick-Handler: so
          // funktioniert das Löschen auch ohne JavaScript und bleibt genau das
          // Muster, das die Seite vorher hatte.
          render: (_, row) => (
            <form action={deleteAction}>
              <input type="hidden" name="id" value={row.id} />
              <Button htmlType="submit" danger size="small">
                Löschen
              </Button>
            </form>
          ),
        },
      ]}
    />
    </div>
  );
}
```

- [ ] **Step 3: Admin-Seite umbauen**

`src/app/m/portal/admin/page.tsx` vollständig ersetzen:

```tsx
import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { getAllServices } from "@/app/m/portal/_lib/services";
import { deleteServiceAction } from "@/app/m/portal/actions";
import { ServiceForm } from "@/app/m/portal/admin/service-form";
import { ServiceTable } from "@/app/m/portal/admin/service-table";

export default async function PortalAdminPage() {
  await moduleAdminPageOrNotFound("portal");

  const services = await getAllServices();

  // Überschriften als schlichtes HTML statt `Typography.Title`: diese Datei ist
  // eine Server-Komponente, und Property-Zugriffe auf antd-Compounds ergeben
  // dort `undefined` (siehe Global Constraints). Für zwei Überschriften lohnt
  // weder ein Untermodul-Import noch eine eigene Client-Komponente.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }} data-testid="portal-admin">
      <section>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBlock: "0 16px" }}>Dienste verwalten</h1>
        <ServiceTable services={services} deleteAction={deleteServiceAction} />
      </section>

      <section>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBlock: "0 16px" }}>
          Neuen Dienst anlegen
        </h2>
        <ServiceForm />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Anlege-Formular umstellen**

`src/app/m/portal/admin/service-form.tsx` vollständig ersetzen. **Bewusst kein antd `Form`**: die Seite postet an eine Server Action, und antds `Form` sammelt Werte in JavaScript statt `FormData` zu senden. Die Labels bleiben echte `<label htmlFor>` — `e2e/portal.spec.ts` greift über `getByLabel("slug")`, `getByLabel("name")`, `getByLabel("url")` zu (Playwright matcht Teilstrings ohne Groß-/Kleinschreibung, `Slug`/`Name`/`URL` passen also).

```tsx
import { Button, Checkbox, Input } from "antd";
import { createServiceAction } from "@/app/m/portal/actions";

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

export function ServiceForm() {
  return (
    <form
      action={createServiceAction}
      style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, marginTop: 16 }}
    >
      <label htmlFor="svc-slug" style={field}>
        Slug
        <Input id="svc-slug" name="slug" required />
      </label>
      <label htmlFor="svc-name" style={field}>
        Name
        <Input id="svc-name" name="name" required />
      </label>
      <label htmlFor="svc-url" style={field}>
        URL
        <Input id="svc-url" name="url" type="url" required />
      </label>
      {/* Ohne `value`-Attribut sendet ein angehakter Checkbox-Input "on" —
          genau das prüft createServiceAction (`formData.get("isPublic") === "on"`). */}
      <Checkbox name="isPublic" defaultChecked>
        Öffentlich sichtbar
      </Checkbox>
      <Button htmlType="submit" type="primary" style={{ alignSelf: "flex-start" }}>
        Anlegen
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Gates**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **Step 6: E2E gegen das Portal**

```bash
pnpm e2e -- portal.spec.ts
```

Erwartet: 2 Tests grün.

Bricht `admin can create a service` an `getByLabel("slug")`, hat antds `Input` das `id` nicht durchgereicht und die `<label htmlFor>`-Verbindung fehlt. Dann prüfen: `document.querySelector("#svc-slug")` muss das `<input>` selbst treffen, nicht den umschließenden Wrapper.

- [ ] **Step 7: Commit**

```bash
git add src/app/m/portal
git commit -m "feat(portal): Kacheln und Admin-CRUD auf antd

Table als Client-Komponente (render-Funktionen ueberqueren die
RSC-Grenze nicht); Formulare bleiben nativ, weil sie an Server Actions
posten."
```

---

## Task 4: QR-Modul

Der umfangreichste Task. Das qr-Modul ist eine Offline-PWA und hat die dichteste Testabdeckung.

**Files:**
- Modify: `src/app/m/qr/page.tsx`, `UrlInput.tsx`, `HistoryList.tsx`, `PresetGrid.tsx`, `QrView.tsx`, `QrDisplay.tsx`
- Modify: `src/app/m/qr/wifi/page.tsx`, `tel/page.tsx`, `contact/page.tsx`
- Modify: `src/app/m/qr/admin/page.tsx`, `admin/preset-form.tsx`
- Modify: `src/app/globals.css` (SVG-Regel, siehe Step 1)
- Test: alle `src/app/m/qr/**/*.test.tsx`, `e2e/qr.spec.ts`, `e2e/pwa-spike.spec.ts`

**Interfaces:**
- Consumes: das globale Theme aus Task 1; keine neuen Exporte
- Produces: nichts Neues — dieser Task ändert nur Darstellung

**Zwingende Erhaltung:** die `id`s `qr-url`, `wifi-ssid`, `wifi-pass`, `tel-number`, `c-name`, `c-tel`, `c-email`, `c-org`; die `data-testid` `qr-home`, `qr-login-hint`, `too-long`, `qr-history`, `history-entry`, `preset-grid`, `preset-tile`, `qr-view`, `qr-missing`, `qr-raw`, `qr-display`, `qr-error`, `qr-admin`, `preset-row`, `preset-edit`; alle `<form>`-Elemente als native Formulare mit `onSubmit` (die Tests lösen `submitForm()` direkt am Formular aus, weil ein deaktivierter Knopf das Ereignis verschluckte — das ist der Prüfgegenstand).

---

- [ ] **Step 1: Die SVG-Größenregel retten**

`QrDisplay.tsx` trägt heute `[&>svg]:block [&>svg]:h-auto [&>svg]:w-full` — eine Tailwind-Arbitrary-Variant. Ohne Ersatz fällt das erzeugte SVG (das nur eine `viewBox` mitbringt, keine Breite/Höhe) auf die Ersatzgröße des Browsers zurück und der QR-Code wird winzig. Kein Test schlägt dabei an.

In `src/app/globals.css` ergänzen:

```css
/*
 * Das von `qrcode` erzeugte SVG bringt nur eine viewBox mit, keine Breite und
 * Höhe. Ohne diese Regel fällt es auf die Ersatzgröße des Browsers zurück
 * statt seine Box zu füllen — der Code wird winzig, ohne dass ein Test
 * anschlägt. Vorher war das die Tailwind-Variante `[&>svg]:w-full`.
 */
[data-testid="qr-display"] > svg {
  display: block;
  width: 100%;
  height: auto;
}
```

- [ ] **Step 2: `UrlInput` umstellen**

`src/app/m/qr/UrlInput.tsx` — Logik (State, `exceedsQrCapacity`, `canSubmit`, `recordEntry`, `router.push`) und alle Kommentare bleiben unverändert. Nur die Darstellung wechselt:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Typography } from "antd";
import { QR_MAX_LENGTH, exceedsQrCapacity } from "@/app/m/qr/_lib/qr";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import { recordEntry } from "@/app/m/qr/_lib/history";

export function UrlInput() {
  const [value, setValue] = useState("");
  const router = useRouter();
  // Byte-Länge, nicht value.length: ein Text aus Umlauten wäre nach Zeichen
  // gezählt längst erlaubt, während die Erzeugung ihn bereits ablehnt. Die
  // Warnung schwiege dann genau dann, wenn sie gebraucht wird.
  const tooLong = exceedsQrCapacity(value);
  const canSubmit = value.length > 0 && !tooLong;

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const payload = { kind: "url" as const, value };
        recordEntry(value, payload);
        router.push(buildQrUrl(value, payload));
      }}
    >
      <label htmlFor="qr-url" style={{ fontWeight: 600 }}>
        Link oder Text
      </label>
      <Input
        id="qr-url"
        size="large"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        placeholder="https://…"
      />
      {tooLong ? (
        <Typography.Text type="danger" data-testid="too-long">
          Zu lang für einen QR-Code (max. {QR_MAX_LENGTH} Bytes — Umlaute zählen doppelt, Emoji
          vierfach).
        </Typography.Text>
      ) : null}
      <Button htmlType="submit" type="primary" size="large" block disabled={!canSubmit}>
        QR-Code erzeugen
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: `UrlInput`-Test laufen lassen**

```bash
pnpm vitest run src/app/m/qr/UrlInput.test.tsx
```

Erwartet: PASS. Der Test füllt über `fill("#qr-url")` und löst `submitForm()` aus — beides trägt weiter, weil das `id` am antd-`Input` hängt und das `<form>` nativ geblieben ist.

- [ ] **Step 4: `HistoryList` umstellen**

`src/app/m/qr/HistoryList.tsx` — `useSyncExternalStore`-Logik und Kommentare unverändert. **Struktur-Auflage:** `HistoryList.test.tsx` klickt über den Selektor `section > button` auf „Verlauf löschen". Dieser Knopf muss ein **direktes Kind** von `<section>` bleiben; er darf nicht in `Space`, `Flex` oder ein `<div>` gewickelt werden. antds `Button` rendert das `<button>` selbst, ist also als direktes Kind zulässig.

```tsx
"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button, Typography } from "antd";
import {
  clearHistory,
  getHistorySnapshot,
  getHistoryServerSnapshot,
  subscribeHistory,
} from "@/app/m/qr/_lib/history";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";

export function HistoryList() {
  // Der Verlauf liegt im localStorage, den es auf dem Server nicht gibt.
  // useSyncExternalStore rendert deshalb serverseitig die leere Liste und
  // schaltet nach dem Hydrieren auf den echten Stand um — ohne Mismatch und
  // ohne den Umweg über einen useEffect, der nur State spiegelt.
  const entries = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot,
  );
  const router = useRouter();

  if (entries.length === 0) return null;

  return (
    <section
      aria-label="Verlauf"
      data-testid="qr-history"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <Typography.Title level={5} style={{ margin: 0 }}>
        Zuletzt erzeugt
      </Typography.Title>
      <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
        {entries.map((e) => (
          <li key={e.id}>
            <Button
              block
              size="large"
              // Der Verlauf haelt das Payload, nicht den fertigen String —
              // deshalb entsteht die URL hier ueber denselben Weg wie beim
              // ersten Erzeugen und kann gar nicht davon abweichen.
              onClick={() => router.push(buildQrUrl(e.label, e.payload))}
              data-testid="history-entry"
              style={{ textAlign: "left" }}
            >
              {e.label}
            </Button>
          </li>
        ))}
      </ul>
      {/* Direktes Kind von <section>: HistoryList.test.tsx klickt über den
          Selektor `section > button`. Nicht in einen Wrapper packen. */}
      <Button type="link" onClick={() => clearHistory()} style={{ alignSelf: "flex-start", padding: 0 }}>
        Verlauf löschen
      </Button>
    </section>
  );
}
```

- [ ] **Step 5: `PresetGrid` umstellen**

`src/app/m/qr/PresetGrid.tsx` vollständig ersetzen. `open()`-Logik und Kommentare unverändert:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button, Col, Row, Typography } from "antd";
import { recordEntry } from "@/app/m/qr/_lib/history";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import type { Preset } from "@/app/m/qr/_lib/types";

/** Client-Komponente, weil ein Tipp in den Verlauf schreibt und dann
 *  navigiert — beides gibt es auf dem Server nicht. */
export function PresetGrid({ presets }: { presets: Preset[] }) {
  const router = useRouter();
  if (presets.length === 0) return null;

  function open(p: Preset) {
    // `p` ist ein Preset, also ein QrPayload mit Zusatzfeldern — buildQrUrl
    // kodiert daraus denselben String, den auch die Formulare erzeugen.
    recordEntry(p.label, p);
    router.push(buildQrUrl(p.label, p));
  }

  return (
    <section aria-label="Schnellzugriffe" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        Schnellzugriffe
      </Typography.Title>
      <Row gutter={[12, 12]} data-testid="preset-grid">
        {presets.map((p) => (
          <Col key={p.id} xs={12} sm={8}>
            {/* Bleibt ein echter <button>: PresetGrid.test.tsx klickt die Kachel an. */}
            <Button
              block
              onClick={() => open(p)}
              data-testid="preset-tile"
              style={{ height: 128, whiteSpace: "normal", display: "flex", flexDirection: "column", gap: 4 }}
            >
              <span aria-hidden="true" style={{ fontSize: 30, lineHeight: 1 }}>
                {p.icon ?? p.label.charAt(0).toUpperCase()}
              </span>
              <span>{p.label}</span>
            </Button>
          </Col>
        ))}
      </Row>
    </section>
  );
}
```

- [ ] **Step 6: `QrView` und `QrDisplay` umstellen**

`src/app/m/qr/QrView.tsx`: Der lange Kommentarblock zum URL-Vertrag bleibt vollständig erhalten. `<Link href="/">← Zurück</Link>` wird zu `<Button type="link" href="/" style={{ alignSelf: "flex-start", padding: 0 }}>← Zurück</Button>`; Überschrift zu `Typography.Title level={4}`; die Hinweiszeile und `data-testid="qr-raw"` zu `Typography.Text type="secondary"`. `data-testid` `qr-view`, `qr-missing`, `qr-raw` bleiben wortgleich.

`src/app/m/qr/QrDisplay.tsx`: **Die gesamte Logik bleibt unverändert** — `payloadToSvg`-Effekt, `startPress`/`endPress` mit dem 600-ms-Timer, `downloadPng`, `share`, `toggleFullscreen`, `dangerouslySetInnerHTML` samt aller Kommentare. Geändert wird nur:
- Das `className` am `qr-display`-Div fällt weg (die SVG-Regel steht jetzt in `globals.css`, Step 1); die Box bekommt `style={{ width: "100%", maxWidth: 448, background: "#ffffff", padding: 16, ...(inverted ? { filter: "invert(1)" } : {}) }}`. **Der weiße Hintergrund bleibt hart `#ffffff`, auch im Dark Mode** — ein QR-Code auf dunklem Grund ist von vielen Scannern nicht lesbar.
- Die drei Knöpfe (`PNG speichern`, `Teilen`, `Vollbild`) werden antd `Button size="large"`, gruppiert in `<Space wrap>`.
- Die Fehlerzeile wird `<Typography.Text type="danger" data-testid="qr-error">`.

- [ ] **Step 7: `qr/page.tsx` umstellen**

Vollständig ersetzen. `KINDS`, `listPresets()` und der Kommentar zum anonymen Zugang bleiben unverändert:

```tsx
import Link from "next/link";
import { Button, Col, Row } from "antd";
import { auth } from "@/core/auth";
import { listPresets } from "@/app/m/qr/_lib/presets";
import { PresetGrid } from "@/app/m/qr/PresetGrid";
import { UrlInput } from "@/app/m/qr/UrlInput";
import { HistoryList } from "@/app/m/qr/HistoryList";

const KINDS = [
  { href: "/wifi", label: "WLAN", icon: "📶" },
  { href: "/tel", label: "Telefon", icon: "📞" },
  { href: "/contact", label: "Kontakt", icon: "👤" },
];

export default async function QrHomePage() {
  const session = await auth();
  // Anonym: keine Presets. Das Modul ist requiresAuth: false, session ist dann
  // schlicht null — kein Fehler, nur weniger Inhalt.
  const presets = session?.user ? await listPresets() : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }} data-testid="qr-home">
      <UrlInput />

      {/* Überschrift und Hinweis als schlichtes HTML: Server-Komponente, also
          kein `Typography.Title`/`Typography.Paragraph` (Global Constraints). */}
      <section aria-label="Weitere Typen" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Andere Typen</h2>
        <Row gutter={[12, 12]}>
          {KINDS.map((k) => (
            <Col key={k.href} span={8}>
              <Button
                block
                href={k.href}
                style={{ height: 72, display: "flex", flexDirection: "column", gap: 4 }}
              >
                <span aria-hidden="true" style={{ fontSize: 24, lineHeight: 1 }}>
                  {k.icon}
                </span>
                <span>{k.label}</span>
              </Button>
            </Col>
          ))}
        </Row>
      </section>

      {session?.user ? (
        <PresetGrid presets={presets} />
      ) : (
        <p data-testid="qr-login-hint" style={{ opacity: 0.65 }}>
          {/* Die MinimalShell hat keinen Login-Einstieg im Header, und ein
              anonymes Modul leitet nirgends automatisch hin — ohne diesen Link
              wüsste der Nutzer vom Anmelden, käme aber nicht hin. */}
          <Link href={`/login?callbackUrl=${encodeURIComponent("/")}`}>Anmelden</Link>, um
          persönliche Schnellzugriffe zu sehen.
        </p>
      )}

      <HistoryList />
    </div>
  );
}
```

- [ ] **Step 8: Die drei Formularseiten umstellen**

`wifi`, `tel` und `contact` folgen demselben Muster. **Ausschließlich Darstellung ändern** — `useState`, `canSubmit`, `submit()`, `recordEntry`, `buildQrUrl`, alle Payload-Konstruktion und alle Kommentare bleiben byte-identisch.

Mechanische Regel, an `wifi` durchexerziert:

| alt | neu |
|---|---|
| `<Link href="/" className="min-h-…">← Zurück</Link>` | `<Button type="link" href="/" style={{ alignSelf: "flex-start", padding: 0 }}>← Zurück</Button>` |
| `<h1 className="text-lg font-bold">` | `<Typography.Title level={4}>` |
| `<p className="text-[var(--color-stahl)]">` | `<Typography.Paragraph type="secondary">` |
| `<input id="…" className="min-h-…">` | `<Input id="…" size="large" …>` — **`id` unverändert übernehmen** |
| `<p className="text-sm text-[var(--color-stahl)]">` (Hilfetext) | `<Typography.Text type="secondary">` |
| `<button type="submit" disabled={!canSubmit}>` | `<Button htmlType="submit" type="primary" size="large" block disabled={!canSubmit}>` |
| Radio-Gruppe in `<fieldset>` | `Radio.Group` **innerhalb** des `<fieldset>` belassen |
| `<label><input type="checkbox" …/>…</label>` | `<Checkbox checked={hidden} onChange={(e) => setHidden(e.target.checked)}>Verstecktes Netzwerk</Checkbox>` |

Das `<fieldset>` in `wifi` bleibt bestehen: `forms.test.tsx` selektiert über `fieldset input`. `<legend className="font-semibold">Verschlüsselung</legend>` bleibt ebenfalls.

`contact` behält seine `fields`-Schleife samt der `id`s `c-name`, `c-tel`, `c-email`, `c-org` und dem `type`-Feld.

- [ ] **Step 9: `qr/admin` umstellen**

`src/app/m/qr/admin/page.tsx` ist eine **Server-Komponente** — dort gilt das Verbot von `X.Y` auf antd-Importen (Global Constraints). `List.Item` wäre also ein 500er. Entweder die Liste in eine kleine Client-Komponente `admin/preset-list.tsx` auslagern (die Server Action als Prop übergeben, das ist zulässig), oder bei schlichtem `<ul>`/`<li>` mit antd `Button` bleiben — Letzteres ist hier der kleinere Eingriff und erhält die Struktur des Bestands. Überschriften als `<h1>`/`<h2>` statt `Typography.Title`.

Im Detail: Die Liste bekommt `data-testid="preset-row"` an jedem Eintrag; „Bearbeiten" bleibt ein `<Link>` mit `data-testid="preset-edit"` (der Kommentar, warum es ein Link und kein Formular ist, bleibt); „Löschen" bleibt ein `<form action={deletePresetAction}>` mit antd `Button danger htmlType="submit"`. `data-testid="qr-admin"` bleibt. Der `key`-Kommentar an `<PresetForm>` bleibt vollständig erhalten.

`src/app/m/qr/admin/preset-form.tsx` (291 LOC): **State-Modell, Validierung, `submit()` und alle Kommentare bleiben unverändert.** Ersetzt werden nur `<input>` → `Input`, `<select>` → `Select`, `<button>` → `Button`, `<textarea>` → `Input.TextArea`; die Konstante `inputClass` entfällt. Alle vorhandenen `id`-Attribute und das `<fieldset>` bleiben, weil `preset-form.test.tsx` über `fill("fieldset input")` zugreift.

- [ ] **Step 10: `test-dom.tsx` prüfen (nicht blind ändern)**

Die Spec nennt `src/app/m/qr/_lib/test-dom.tsx` (100 LOC) als möglicherweise nachzuziehen. Prüfen statt raten — der Helfer arbeitet mit generischen CSS-Selektoren und dem `HTMLInputElement`-Prototyp-Setter und funktioniert mit antds kontrollierten Inputs unverändert:

```bash
pnpm vitest run src/app/m/qr
```

Bleiben die Tests grün, bleibt die Datei **unverändert**. Schlägt `fill()` fehl, weil der Selektor den antd-Wrapper statt das `<input>` trifft, den **Selektor im aufrufenden Test** korrigieren (z. B. `#qr-url` → `input#qr-url`), nicht den Helfer verallgemeinern.

- [ ] **Step 11: Alle qr-Unit-Tests laufen lassen**

```bash
pnpm vitest run src/app/m/qr
```

Erwartet: alle grün.

Bricht ein Test an einem **strukturellen** Selektor (`section > button`, `fieldset input`), zuerst prüfen, ob sich die Struktur wiederherstellen lässt (Wrapper entfernen). Geht das nicht, im Test den Selektor auf ein vorhandenes `data-testid` umstellen — **die Zusicherung des Tests bleibt dabei dieselbe**, nur die Abfrage ändert sich. Tests niemals löschen oder abschwächen.

Bricht ein Test an `#…`-Selektoren, hat antd das `id` nicht ans `<input>` durchgereicht — dann `id` explizit setzen statt den Test zu ändern.

- [ ] **Step 12: E2E qr + PWA**

```bash
pnpm e2e -- qr.spec.ts
pnpm e2e:pwa
```

Erwartet: beide grün. **`pnpm e2e:pwa` ist das Risiko-Gate dieses Specs** — es misst, ob die Offline-PWA mit dem größeren antd-Bundle noch vollständig precacht.

Läuft es auf, in dieser Reihenfolge vorgehen und **nicht** direkt zu Schritt 3 springen:
1. Precache-Liste in `src/app/m/qr/_lib/sw-source.ts` nachziehen.
2. `zeroRuntime: true` in `buildTheme()` aktivieren (antd 6: statisches CSS, keine Runtime-Serialisierung; braucht einen zusätzlichen CSS-Import).
3. Erst dann über Komponentenverzicht reden.

- [ ] **Step 13: Commit**

```bash
git add src/app/m/qr src/app/globals.css
git commit -m "feat(qr): QR-Modul auf antd

Formulare bleiben native <form>-Elemente mit unveraenderten ids, damit
die Unit-Tests weiter ueber Selektoren und submitForm() greifen. Die
SVG-Groessenregel wandert von einer Tailwind-Arbitrary-Variant nach
globals.css."
```

---

## Task 5: Purge — Demo-Module, Tailwind-Ausbau, Dependency-Bereinigung

Erst hier verschwindet Tailwind. Bis zu diesem Task laufen Preflight-Reset und antd parallel; migrierte Komponenten sehen zwischendurch stellenweise schief aus. **Das ist erwartet und kein Befund** — bewertet wird der optische Zustand erst nach diesem Task.

**Files:**
- Modify: `src/app/m/beta/OfflineProbe.tsx`, `src/app/m/{alpha,beta,gamma,kioskdemo}/page.tsx`
- Delete: `src/components/ui/` (komplett), `src/lib/utils.ts`, `src/lib/utils.test.ts`, `postcss.config.mjs`
- Modify: `src/app/globals.css`, `package.json`

---

- [ ] **Step 1: Demo-Module entstylen**

`alpha`, `gamma`, `kioskdemo`: die `page.tsx` tragen kein `className`, bleiben unverändert. Prüfen, nicht raten:

```bash
grep -rn "className" src/app/m/alpha src/app/m/gamma src/app/m/kioskdemo
```

Erwartet: keine Treffer.

`src/app/m/beta/OfflineProbe.tsx`: `className`-Werte durch antd ersetzen. **`id="probe"` und `data-testid="probe-output"` bleiben wortgleich** — `pwa-spike.spec.ts` hängt daran:

```tsx
"use client";

import { useState } from "react";
import { Input } from "antd";

/**
 * Stellvertreter für die spätere QR-Generierung: rein clientseitige Berechnung
 * ohne Server-Roundtrip. Offline muss nicht nur das HTML aus dem Cache kommen,
 * sondern die Hydration durchlaufen und diese Interaktion funktionieren —
 * sonst wäre "offline" nur ein Standbild.
 */
export function OfflineProbe() {
  const [text, setText] = useState("");
  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <label htmlFor="probe">Eingabe</label>
      <Input id="probe" value={text} onChange={(e) => setText(e.target.value)} />
      <output data-testid="probe-output" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
        {text.split("").reverse().join("")}
      </output>
    </div>
  );
}
```

- [ ] **Step 2: Prüfen, dass nichts mehr auf die Altlasten zeigt**

```bash
grep -rn "@/components/ui\|@/lib/utils\|lucide-react\|next-themes\|sonner\|@base-ui" src/
```

Erwartet: keine Treffer. Jeder Treffer ist ein übersehener Import aus den Tasks 2–4 und wird dort behoben, nicht hier umgangen.

- [ ] **Step 3: Altlasten löschen**

```bash
git rm -r src/components/ui
git rm src/lib/utils.ts src/lib/utils.test.ts postcss.config.mjs
```

- [ ] **Step 4: `globals.css` eindampfen**

`src/app/globals.css` vollständig ersetzen. Die 227 Zeilen Tailwind-Theme und base-ui-Varianten entfallen mit ihrem Gegenstand:

```css
/*
 * Alles Thematische steckt jetzt in `src/core/theme/` und kommt über antds
 * ConfigProvider als CSS-Variablen. Hier bleibt nur, was kein Komponenten-Theme
 * abdecken kann.
 */

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  margin: 0;
}

/*
 * Das von `qrcode` erzeugte SVG bringt nur eine viewBox mit, keine Breite und
 * Höhe. Ohne diese Regel fällt es auf die Ersatzgröße des Browsers zurück
 * statt seine Box zu füllen — der Code wird winzig, ohne dass ein Test
 * anschlägt. Vorher war das die Tailwind-Variante `[&>svg]:w-full`.
 */
[data-testid="qr-display"] > svg {
  display: block;
  width: 100%;
  height: auto;
}

/*
 * Druck: der QR-Code ist das Einzige, was aufs Papier gehört — Etiketten
 * werden aus dieser Ansicht gedruckt.
 */
@media print {
  body {
    background: #ffffff;
  }
}
```

- [ ] **Step 5: Dependencies entfernen**

```bash
pnpm remove tailwindcss @tailwindcss/postcss tw-animate-css @base-ui/react class-variance-authority clsx tailwind-merge lucide-react sonner next-themes
```

- [ ] **Step 6: Gates + Build**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Erwartet: alles grün. Der `cn`-Test ist mit `src/lib/utils.test.ts` entfallen, `theme.test.ts` und `mode.test.ts` sind dazugekommen — die Gesamtzahl der Unit-Tests ändert sich entsprechend.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(ui): Tailwind, base-ui und shadcn-Reste entfernen

globals.css von 227 auf ~40 Zeilen: alles Thematische kommt jetzt aus
core/theme ueber den ConfigProvider."
```

---

## Task 6: Abnahme

**Files:** keine Änderungen — dieser Task prüft nur.

- [ ] **Step 1: Vollständige Gate-Kette**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm e2e && pnpm e2e:pwa
```

Erwartet: alles grün.

- [ ] **Step 2: Belegen, dass kein Rest übrig ist**

```bash
grep -rniE "tailwind|shadcn|base-ui|lucide|next-themes|sonner" src/ package.json
```

Erwartet: keine Treffer. Treffer in Kommentaren, die den Umbau beschreiben, sind zulässig — Treffer in Imports oder `package.json` nicht.

- [ ] **Step 3: Dark Mode manuell prüfen**

```bash
pnpm dev
```

Dann in einem Browser mit geleerten Cookies:
1. `http://portal.localtest.me:3000/` öffnen → helle Oberfläche, **kein** Aufblitzen.
2. Über den Umschalter im Header auf dunkel stellen → schaltet sofort um.
3. Seite neu laden → kommt direkt dunkel, ohne hellen Zwischenzustand.
4. `http://qr.localtest.me:3000/` öffnen → ebenfalls dunkel. **Das ist der eigentliche Beleg** für die Cookie-Entscheidung: mit `localStorage` wäre diese Domain hell.

Schlägt Punkt 4 fehl, ist `AUTH_COOKIE_DOMAIN` in `.env` nicht gesetzt. Für die lokale Prüfung `AUTH_COOKIE_DOMAIN=.localtest.me` setzen.

- [ ] **Step 4: Tap-Ziele im Browser gegenprüfen**

Auf `http://qr.localtest.me:3000/` in den DevTools:

```js
document.querySelector("#qr-url").getBoundingClientRect().height
```

Erwartet: ≥ 56. Der Unit-Test sichert das Token ab, diese Messung den tatsächlich gerenderten Knopf.

- [ ] **Step 5: Abschluss-Commit**

```bash
git commit --allow-empty -m "chore: antd-Umbau abgenommen

typecheck, lint, Unit-Tests, Build, E2E und PWA-Spike gruen; Dark Mode
ueber Modul-Domains hinweg manuell geprueft."
```

---

## Nacharbeit (nicht Teil dieses Plans)

`APP-KONSOLIDIERUNG.md` und `KONSOLIDIERUNG-PROGRESS.md` nennen als Zielstack noch „TW4 + shadcn". Das ist nach diesem Plan falsch und gehört auf antd korrigiert — zusammen mit dem Hinweis, dass Phase 6 (radio) davon profitiert, weil `radio-admin`/`radio-inventar` bereits antd-SPAs sind.
