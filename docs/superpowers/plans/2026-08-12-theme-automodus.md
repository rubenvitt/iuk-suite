# Auto-Modus für Hell/Dunkel — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Suite bekommt einen dritten Theme-Zustand „Automatisch", der der Betriebssystem-Präferenz folgt und ab sofort für alle die Vorgabe ist.

**Architecture:** Der Server, der `src/app/layout.tsx` rendert, sieht `prefers-color-scheme` nicht — die Medienabfrage existiert nur im Browser. Deshalb wird der Zustand auf **zwei** Cookies aufgeteilt: `iuk-theme-pref` (`auto|light|dark`, die Wahl) und `iuk-theme-system` (`light|dark`, der zuletzt bekannte OS-Wert, vom Client geschrieben). Eine reine Funktion `resolveThemeMode` löst beide zum bekannten `ThemeMode` auf, den `<html data-theme>` und `buildTheme` unverändert weiterverwenden. Der Namenswechsel des Präferenz-Cookies **ist** die Migration: der neue Schlüssel fehlt bei allen, also greift `auto` bei allen.

**Tech Stack:** Next.js 16 (App Router, RSC) · Ant Design 6 · TypeScript · Vitest (+ jsdom) · Playwright

**Entwurf:** `docs/superpowers/specs/2026-08-12-theme-automodus-design.md`

## Global Constraints

- **`<html data-theme>` und `style.colorScheme` tragen IMMER den aufgelösten Wert `light` oder `dark`, niemals `"auto"`.** Nur das Cookie kennt `auto`. Jedes Modul-CSS der Suite selektiert auf `[data-theme="dark"]`; ein gestempeltes `"auto"` besteht `typecheck`, `build` und Vitest und kippt trotzdem jede eigene Fläche still zurück auf helle Darstellung.
- **`useThemeMode().mode` bleibt der aufgelöste `ThemeMode`.** `preference`/`setPreference` treten daneben. `src/core/theme/KioskThemeProvider.tsx` liest nur `mode` und wird in diesem Plan **nicht angefasst**.
- **`ThemeMode = "light" | "dark"` bleibt unverändert.** `buildTheme(mode)` bekommt weiterhin nur diese beiden Werte.
- **Alles, was `src/app/layout.tsx` importiert, muss aus einem Modul ohne `"use client"` kommen** (`mode.ts`, `theme.ts` sind heute beide sauber — das muss so bleiben). Sonst: HTTP 500, den weder `build` noch Vitest sieht (`CLAUDE.md`, Falle 6).
- **`@ant-design/icons` nur in Client-Inseln** (`ThemeToggle.tsx` ist eine). Falle 7.
- **Kein `size` auf antd-Bedienelementen** — `controlHeight: 56` ist bereits das richtige Maß. Falle 4.
- Cookie-Konstruktion für **beide** Cookies identisch zur heutigen: `Path=/`, `Max-Age` ein Jahr, `SameSite=Lax`, optionale `Domain` aus `AUTH_COOKIE_DOMAIN`.
- Alle Bezeichner, Kommentare und Oberflächentexte auf Deutsch, wie im Bestand.
- Kommandos werden mit `rtk` präfigiert (`docs`/`CLAUDE.md` der Elternebene), auch in Ketten mit `&&`.

## Dateiplan

| Datei | Rolle |
| --- | --- |
| `src/core/theme/theme.ts` | **ändern** — `ThemePreference` neben `ThemeMode`. Bleibt frei von React und `"use client"`. |
| `src/core/theme/mode.ts` | **ändern** — Cookie-Namen, `parseThemePreference`, `resolveThemeMode`, zwei Cookie-String-Bauer, Init-Script. Reine Funktionen, serverseitig aufrufbar. |
| `src/core/theme/mode.test.ts` | **ändern** — Tests für die neuen Funktionen. |
| `src/app/layout.tsx` | **ändern** — liest beide Cookies, löst auf, reicht Modus **und** Präferenz durch. |
| `src/app/layout.test.tsx` | **ändern** — Cookie-Attrappe wird namensabhängig. |
| `src/core/theme/AntdProvider.tsx` | **ändern** — Präferenz im State, `matchMedia`-Effekt, `setPreference`. |
| `src/core/theme/AntdProvider.test.tsx` | **ändern** — `matchMedia`-Attrappe, Auflösung und Live-Nachführung. |
| `src/core/theme/ThemeToggle.tsx` | **ändern** — Dreier-Zyklus, drittes Icon, sprechendes Label. |
| `src/core/theme/ThemeToggle.test.tsx` | **neu** — der Zyklus über echte Klicks im echten Provider. |
| `e2e/theme.spec.ts` | **neu** — die Auflösung, die nur Playwright sehen kann. |
| `e2e/feedback.spec.ts` | **ändern** — zwei Zeilen Cookie-Name. |
| `CLAUDE.md`, `docs/design/README.md`, sechs Kommentarstellen | **ändern** — der Cookie heißt anders und kennt jetzt drei Zustände. |

---

### Task 1: Zustandsmodell — die reinen Funktionen

**Files:**
- Modify: `src/core/theme/theme.ts:6`
- Modify: `src/core/theme/mode.ts:1-24`
- Test: `src/core/theme/mode.test.ts`

**Interfaces:**
- Consumes: nichts (erste Aufgabe).
- Produces:
  - `type ThemePreference = "auto" | "light" | "dark"` aus `@/core/theme/theme`, re-exportiert aus `@/core/theme/mode`
  - `const THEME_PREF_COOKIE = "iuk-theme-pref"`
  - `const THEME_SYSTEM_COOKIE = "iuk-theme-system"`
  - `const LEGACY_THEME_COOKIE = "iuk-theme"`
  - `parseThemePreference(raw: string | undefined | null): ThemePreference`
  - `parseThemeMode(raw: string | undefined | null): ThemeMode` — **unverändert**, liest ab jetzt das System-Cookie
  - `resolveThemeMode(pref: ThemePreference, system: ThemeMode): ThemeMode`
  - `themePreferenceCookieString(pref: ThemePreference, domain?: string): string`
  - `themeSystemCookieString(mode: ThemeMode, domain?: string): string`
  - `themeCookieString(mode, domain)` **bleibt als Übergangsexport** (`@deprecated`, schreibt weiter den Altschlüssel): die einzige Aufruferin ist `AntdProvider`, und die wird erst in Task 3 umgestellt. Beides fällt dort gemeinsam weg, damit der Baum nach jedem Commit übersetzt.

> **Warum `parseThemeMode` bleibt, wie es ist:** seine Semantik („`dark` heißt dunkel, alles andere hell") passt exakt auf das neue System-Cookie. Es umzubenennen wäre Bewegung ohne Gewinn, und seine bestehenden Tests bleiben damit gültig. Neu ist nur, dass ein **unlesbarer Präferenz-Wert** `auto` ergibt, nicht `light` — das prüft `parseThemePreference`.

- [ ] **Step 1: Die neuen Tests schreiben**

An `src/core/theme/mode.test.ts` anhängen (der bestehende `parseThemeMode`-Block und der `themeInitScript`-Block bleiben vorerst unangetastet; `themeCookieString` wird ersetzt):

```ts
describe("parseThemePreference", () => {
  it.each(["light", "dark"] as const)("liest '%s' als ausdrueckliche Wahl", (raw) => {
    expect(parseThemePreference(raw)).toBe(raw);
  });

  // Die Vorgabe der Suite. Ein fehlendes Cookie ist der Normalfall (der
  // Schluessel ist neu), ein kaputter Wert darf keinen vierten Zustand
  // erzeugen — beide landen auf 'auto'.
  it.each([undefined, null, "", "auto", "system", "kaputt"])("liest %s als auto", (raw) => {
    expect(parseThemePreference(raw)).toBe("auto");
  });
});

describe("resolveThemeMode", () => {
  it("auto folgt dem System", () => {
    expect(resolveThemeMode("auto", "dark")).toBe("dark");
    expect(resolveThemeMode("auto", "light")).toBe("light");
  });

  // Der Fall, fuer den die ganze Cookie-Konstruktion existiert: 'System
  // dunkel, Umschalter hell' darf nicht brechen.
  it("eine ausdrueckliche Wahl schlaegt das System", () => {
    expect(resolveThemeMode("light", "dark")).toBe("light");
    expect(resolveThemeMode("dark", "light")).toBe("dark");
  });
});

describe("die beiden Cookie-Bauer", () => {
  it("setzen Pfad, Lebensdauer und SameSite", () => {
    for (const s of [themePreferenceCookieString("auto"), themeSystemCookieString("dark")]) {
      expect(s).toContain("Path=/");
      expect(s).toContain("SameSite=Lax");
      expect(s).not.toContain("Domain=");
    }
  });

  it("schreiben unter getrennten Schluesseln", () => {
    expect(themePreferenceCookieString("auto")).toContain(`${THEME_PREF_COOKIE}=auto`);
    expect(themeSystemCookieString("dark")).toContain(`${THEME_SYSTEM_COOKIE}=dark`);
  });

  // Der Grund fuer die ganze Cookie-Konstruktion: die Einstellung muss ueber
  // alle Modul-Domains hinweg gelten (qr.iuk-ue.de <-> iuk-ue.de).
  it("tragen die Domain, wenn eine gesetzt ist", () => {
    expect(themePreferenceCookieString("light", ".iuk-ue.de")).toContain("Domain=.iuk-ue.de");
    expect(themeSystemCookieString("light", ".iuk-ue.de")).toContain("Domain=.iuk-ue.de");
  });
});
```

Den bestehenden `describe("themeCookieString", …)`-Block (Zeilen 16-30) **löschen** — er ist durch den Block oben ersetzt.

Die Import-Zeile oben in der Datei ersetzen:

```ts
import {
  parseThemeMode,
  parseThemePreference,
  resolveThemeMode,
  themePreferenceCookieString,
  themeSystemCookieString,
  themeInitScript,
  THEME_COOKIE,
  THEME_PREF_COOKIE,
  THEME_SYSTEM_COOKIE,
} from "@/core/theme/mode";
```

> `THEME_COOKIE` wird in Task 2 zu `LEGACY_THEME_COOKIE` — bis dahin bleibt der alte Name importiert, damit der `themeInitScript`-Block dieser Datei weiterläuft.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
rtk pnpm vitest run src/core/theme/mode.test.ts
```

Erwartung: FAIL — `parseThemePreference is not a function` bzw. `resolveThemeMode is not a function`.

- [ ] **Step 3: `ThemePreference` in `theme.ts` ergänzen**

In `src/core/theme/theme.ts` direkt unter `ThemeMode` (Zeile 6):

```ts
/** Die beiden Betriebsarten des Suite-Themes. Hier definiert, weil sie zum
 *  Theme gehören — `mode.ts` (Cookie-Transport) reicht den Typ nur weiter. */
export type ThemeMode = "light" | "dark";

/**
 * Was die Person GEWÄHLT hat — nicht, was daraus folgt. `auto` ist die Vorgabe
 * und heißt „folge dem Betriebssystem"; die Auflösung nach `ThemeMode` macht
 * `resolveThemeMode` in `mode.ts`, weil sie den zweiten Cookie-Wert braucht.
 *
 * Die Trennung ist keine Kosmetik: `buildTheme` und `<html data-theme>` dürfen
 * `auto` nie zu sehen bekommen.
 */
export type ThemePreference = "auto" | "light" | "dark";
```

- [ ] **Step 4: `mode.ts` umbauen**

`src/core/theme/mode.ts` Zeilen 1-24 ersetzen (das Init-Script ab Zeile 26 bleibt in dieser Aufgabe unangetastet):

```ts
import type { ThemeMode, ThemePreference } from "@/core/theme/theme";

export type { ThemeMode, ThemePreference };

/**
 * Der Modus steckt in Cookies, nicht im localStorage. Grund ist die
 * Multi-Host-Architektur: localStorage ist pro Origin, die Einstellung auf
 * `qr.iuk-ue.de` gälte auf `iuk-ue.de` also nicht. Ein Cookie auf
 * `.iuk-ue.de` gilt überall — und der Server kann es lesen und damit schon
 * den ersten Render im richtigen Modus ausliefern.
 *
 * ZWEI Cookies, und das ist der Kern des Auto-Modus: der Server sieht
 * `prefers-color-scheme` nicht, die Medienabfrage existiert nur im Browser.
 * `iuk-theme-pref` trägt die WAHL (auch `auto`), `iuk-theme-system` den
 * zuletzt vom Client beobachteten OS-Wert. Erst beide zusammen ergeben den
 * Modus, den `<html data-theme>` stempeln darf.
 */
export const THEME_PREF_COOKIE = "iuk-theme-pref";
export const THEME_SYSTEM_COOKIE = "iuk-theme-system";

/**
 * Der Vorgänger, der Wahl UND Auflösung in einem Wert führte. Er wird nicht
 * mehr gelesen — und genau DAS ist die Migration: unter dem neuen Schlüssel
 * hat niemand einen Wert, also gilt `auto` für alle. Das Init-Script räumt ihn
 * ab, damit er nicht ein Jahr lang mitgeschickt wird.
 *
 * Nötig war der Namenswechsel, weil `iuk-theme` bei jedem Bestandsnutzer
 * gesetzt ist — vom alten Init-Script automatisch geschrieben und von einer
 * bewussten Wahl nicht unterscheidbar.
 */
export const LEGACY_THEME_COOKIE = "iuk-theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Liest das SYSTEM-Cookie: `dark` heißt dunkel, alles andere hell. Ein
 * fehlender oder kaputter Wert darf die Seite nicht in einen dritten Zustand
 * kippen.
 */
export function parseThemeMode(raw: string | undefined | null): ThemeMode {
  return raw === "dark" ? "dark" : "light";
}

/**
 * Liest das PRÄFERENZ-Cookie. Alles, was keine ausdrückliche Wahl ist — auch
 * ein kaputter Wert —, ist `auto`. Das ist die Vorgabe der Suite.
 */
export function parseThemePreference(raw: string | undefined | null): ThemePreference {
  return raw === "light" || raw === "dark" ? raw : "auto";
}

/**
 * Die einzige Stelle, an der aus zwei Cookies ein Modus wird.
 *
 * Rein und ohne React, damit `layout.tsx` (Server Component) und
 * `AntdProvider` (Client) dieselbe Rechnung benutzen — zwei Auflösungen liefen
 * auseinander, ohne dass ein Test rot würde.
 */
export function resolveThemeMode(pref: ThemePreference, system: ThemeMode): ThemeMode {
  return pref === "auto" ? system : pref;
}

function cookieString(name: string, wert: string, domain?: string): string {
  const parts = [`${name}=${wert}`, "Path=/", `Max-Age=${ONE_YEAR}`, "SameSite=Lax"];
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

export function themePreferenceCookieString(pref: ThemePreference, domain?: string): string {
  return cookieString(THEME_PREF_COOKIE, pref, domain);
}

export function themeSystemCookieString(mode: ThemeMode, domain?: string): string {
  return cookieString(THEME_SYSTEM_COOKIE, mode, domain);
}

/**
 * @deprecated Übergang. Schreibt noch den Altschlüssel und hat genau eine
 * Aufruferin: `AntdProvider`, das erst in Task 3 auf die getrennten Cookies
 * umgestellt wird. Fällt mit dieser Umstellung weg — beides zusammen, damit
 * der Baum nach jedem Commit übersetzt.
 */
export function themeCookieString(mode: ThemeMode, domain?: string): string {
  return cookieString(LEGACY_THEME_COOKIE, mode, domain);
}
```

> Das Init-Script darunter referenziert noch `THEME_COOKIE`. Damit die Datei in diesem Zwischenschritt übersetzt, direkt unter `LEGACY_THEME_COOKIE` vorübergehend ergänzen:
>
> ```ts
> /** @deprecated Übergang — fällt in Task 2 weg. */
> export const THEME_COOKIE = LEGACY_THEME_COOKIE;
> ```
>
> **Kein Test auf `themeCookieString`.** Es ist Gerüst mit Verfallsdatum; der Compiler ist sein Wächter. Der bisherige `describe("themeCookieString", …)`-Block fällt wie oben beschrieben weg.

- [ ] **Step 5: Tests laufen lassen**

```bash
rtk pnpm vitest run src/core/theme/mode.test.ts && rtk pnpm typecheck
```

Erwartung: alle Tests PASS, `typecheck` sauber.

- [ ] **Step 6: Commit**

```bash
rtk git add src/core/theme/theme.ts src/core/theme/mode.ts src/core/theme/mode.test.ts && rtk git commit -m "feat(theme): Praeferenz und Systemwert trennen — der Server sieht prefers-color-scheme nicht"
```

---

### Task 2: Das Init-Script schreibt den Systemwert fort

**Files:**
- Modify: `src/core/theme/mode.ts:26-44` (Init-Script)
- Test: `src/core/theme/mode.test.ts` (Block `themeInitScript`)

**Interfaces:**
- Consumes: `THEME_SYSTEM_COOKIE`, `LEGACY_THEME_COOKIE`, `ONE_YEAR` aus Task 1.
- Produces: `themeInitScript(domain?: string): string` — Signatur unverändert.

> **Was sich ändert und warum:** Das Script hatte einen Early-Return auf ein vorhandenes Cookie — es lief also genau einmal pro Browser. Mit einem Auto-Modus wäre das ein Fehler: wer sein OS später auf dunkel stellt, behielte für immer den Wert vom ersten Besuch, und Auto hörte still auf zu funktionieren. Ab jetzt schreibt es bei jedem Aufruf fort (vergleichen, dann schreiben) und räumt nebenbei den Altschlüssel ab.
>
> Was sich **nicht** ändert: es stempelt kein `data-theme`. Siehe die Warnung in Step 3.

- [ ] **Step 1: Die Tests schreiben**

Den Block `describe("themeInitScript", …)` in `src/core/theme/mode.test.ts` (Zeilen 32-41) vollständig ersetzen:

```ts
describe("themeInitScript", () => {
  it("schreibt den Systemwert und nicht die Praeferenz", () => {
    const s = themeInitScript();
    expect(s).toContain("prefers-color-scheme");
    expect(s).toContain(THEME_SYSTEM_COOKIE);
    expect(s).not.toContain(THEME_PREF_COOKIE);
  });

  // Der Early-Return des Vorgaengers liess das Script genau einmal pro Browser
  // laufen. Mit Auto waere das ein Fehler: ein spaeterer OS-Wechsel kaeme nie
  // an, und Auto hoerte still auf zu funktionieren. Der Vergleich vor dem
  // Schreiben ist der Ersatz — er verhindert nur unnoetige Schreibvorgaenge,
  // nicht das Fortschreiben eines GEAENDERTEN Wertes. Das neue Script hat
  // deshalb ueberhaupt kein `return` mehr.
  it("Regression: kehrt NICHT frueh zurueck, wenn schon ein Cookie steht", () => {
    expect(themeInitScript()).not.toContain("return");
  });

  it("raeumt den Altschluessel ab", () => {
    const s = themeInitScript();
    expect(s).toContain(LEGACY_THEME_COOKIE);
    expect(s).toContain("Max-Age=0");
  });

  it("nimmt die Domain auf", () => {
    expect(themeInitScript(".iuk-ue.de")).toContain("Domain=.iuk-ue.de");
  });
});
```

Im Import-Block oben `THEME_COOKIE` durch `LEGACY_THEME_COOKIE` ersetzen.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
rtk pnpm vitest run src/core/theme/mode.test.ts
```

Erwartung: FAIL — `expected '(function(){try{if(document.cookie…' to contain 'iuk-theme-system'`.

- [ ] **Step 3: Das Script neu schreiben**

`src/core/theme/mode.ts`, Zeilen 26-44 (Kommentar und Funktion) ersetzen, und die `@deprecated`-Zeile `export const THEME_COOKIE` aus Task 1 **löschen**:

```ts
/**
 * Läuft als Inline-Script im `<head>`.
 *
 * Es verhindert KEIN Flackern — das tut das serverseitig gelesene Cookie.
 * Seine Aufgabe ist, den Betriebssystem-Wert ins Cookie zu schreiben, damit
 * der NÄCHSTE Seitenaufruf serverseitig richtig auflöst. Wer das hier anfasst,
 * soll nicht die next-themes-Denkweise ("Blocking-Script gegen FOUC")
 * hineinlesen: die trägt in dieser Architektur nicht.
 *
 * ES STEMPELT BEWUSST KEIN `data-theme`. Das wäre der naheliegende Fix für das
 * Aufblitzen beim allerersten Besuch und ist schlimmer als das Problem: antd
 * wählt seinen Algorithmus aus React-State, den dieses Script nicht erreicht.
 * Das Attribut zeigte dann dunkel, während antd hell rendert — ein DAUERHAFT
 * inkonsistenter Zustand statt eines einmaligen Aufblitzens.
 *
 * Es ist NICHT durch den `matchMedia`-Effekt in `AntdProvider` ersetzbar,
 * obwohl beide dasselbe Cookie schreiben: dieses Script läuft vor dem ersten
 * Paint und unabhängig von der Hydration, der Effekt erst danach. Wer die
 * Seite verlässt, bevor React übernimmt, hätte sonst beim nächsten Besuch
 * wieder keinen Systemwert. Der Effekt kann dafür, was dieses Script nicht
 * kann: auf einen Wechsel WÄHREND der Sitzung reagieren.
 */
export function themeInitScript(domain?: string): string {
  const domainPart = domain ? `;Domain=${domain}` : "";
  const optionen = `;Path=/;Max-Age=${ONE_YEAR};SameSite=Lax${domainPart}`;
  return (
    `(function(){try{` +
    `var m=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';` +
    `var c=document.cookie;` +
    // Vergleichen, dann schreiben: der unveraenderte Normalfall fasst
    // `document.cookie` gar nicht erst an.
    `if(c.indexOf('${THEME_SYSTEM_COOKIE}='+m)===-1){` +
    `document.cookie='${THEME_SYSTEM_COOKIE}='+m+'${optionen}';}` +
    // Der Altschluessel. Zweimal, weil Loeschen Domain und Pfad treffen muss
    // und beide Formen im Umlauf sind (mit AUTH_COOKIE_DOMAIN und ohne).
    `if(c.indexOf('${LEGACY_THEME_COOKIE}=')>-1){` +
    `document.cookie='${LEGACY_THEME_COOKIE}=;Path=/;Max-Age=0;SameSite=Lax${domainPart}';` +
    `document.cookie='${LEGACY_THEME_COOKIE}=;Path=/;Max-Age=0;SameSite=Lax';}` +
    `}catch(e){}})()`
  );
}
```

- [ ] **Step 4: Tests laufen lassen**

```bash
rtk pnpm vitest run src/core/theme/mode.test.ts && rtk pnpm typecheck
```

Erwartung: alle PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/core/theme/mode.ts src/core/theme/mode.test.ts && rtk git commit -m "feat(theme): Init-Script schreibt den OS-Wert fort statt nur einmal — sonst friert Auto ein"
```

---

### Task 3: Server löst auf, Provider führt nach

**Files:**
- Modify: `src/app/layout.tsx:8`, `:54-58`, `:60-88`
- Modify: `src/core/theme/AntdProvider.tsx` (vollständig)
- Test: `src/app/layout.test.tsx`, `src/core/theme/AntdProvider.test.tsx`

**Interfaces:**
- Consumes: `THEME_PREF_COOKIE`, `THEME_SYSTEM_COOKIE`, `parseThemePreference`, `parseThemeMode`, `resolveThemeMode`, `themePreferenceCookieString`, `themeSystemCookieString`, `themeInitScript` aus Tasks 1–2.
- Produces:
  - `AntdProvider` nimmt `{ initialMode: ThemeMode, initialPreference: ThemePreference, cookieDomain?: string }`
  - `useThemeMode(): { mode: ThemeMode; preference: ThemePreference; setPreference: (next: ThemePreference) => void; setMode: (next: ThemeMode) => void }`
  - `setMode` ist **Übergangsgerüst** für den heutigen `ThemeToggle` und fällt in Task 4 weg.

- [ ] **Step 1: Die Provider-Tests schreiben**

`src/core/theme/AntdProvider.test.tsx` vollständig ersetzen:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AntdProvider, useThemeMode } from "./AntdProvider";
import type { ThemePreference } from "@/core/theme/theme";

/**
 * `setPreference` wechselt den Modus OHNE Reload. Wenn es dabei nur das Cookie
 * und `style.colorScheme` schreibt, bleiben eigene CSS-Variablen, die an
 * `[data-theme]` haengen, bis zur naechsten Navigation auf dem alten Modus
 * stehen — der Umschalter waere fuer sie sichtbar wirkungslos. Deshalb muss der
 * Client `dataset.theme` mitschreiben.
 *
 * Umgeschaltet wird ueber echte Knopfdruecke, nicht ueber ein nach draussen
 * gereichtes `setPreference`: eine Zuweisung an eine Variable ausserhalb der
 * Komponente waere ein Seiteneffekt im Render (`react-hooks/globals`) — und
 * ein Klick prueft ohnehin den Weg, den der echte Umschalter nimmt.
 *
 * `window.matchMedia` gibt es in jsdom NICHT. Ohne die Attrappe unten wirft der
 * Provider beim Mounten.
 */
let root: Root | null = null;
let container: HTMLElement | null = null;

interface MediaAttrappe {
  wechseln: (nachDunkel: boolean) => void;
}

function matchMediaStellen(dunkel: boolean): MediaAttrappe {
  const hoerer = new Set<(e: MediaQueryListEvent) => void>();
  const liste = {
    matches: dunkel,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, h: (e: MediaQueryListEvent) => void) => {
      hoerer.add(h);
    },
    removeEventListener: (_: string, h: (e: MediaQueryListEvent) => void) => {
      hoerer.delete(h);
    },
  };
  window.matchMedia = (() => liste) as unknown as typeof window.matchMedia;
  return {
    wechseln(nachDunkel: boolean) {
      liste.matches = nachDunkel;
      act(() => {
        for (const h of hoerer) h({ matches: nachDunkel } as MediaQueryListEvent);
      });
    },
  };
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  // BEIDE Cookies — sonst leckt Zustand in andere Testdateien.
  document.cookie = "iuk-theme-pref=; Path=/; Max-Age=0";
  document.cookie = "iuk-theme-system=; Path=/; Max-Age=0";
});

function Sonde() {
  const { mode, preference, setPreference } = useThemeMode();
  return (
    <div>
      <span data-testid="modus">{mode}</span>
      <span data-testid="praeferenz">{preference}</span>
      <button type="button" data-testid="nach-auto" onClick={() => setPreference("auto")} />
      <button type="button" data-testid="nach-dunkel" onClick={() => setPreference("dark")} />
      <button type="button" data-testid="nach-hell" onClick={() => setPreference("light")} />
    </div>
  );
}

function mount(initialMode: "light" | "dark", initialPreference: ThemePreference) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AntdProvider initialMode={initialMode} initialPreference={initialPreference}>
        <Sonde />
      </AntdProvider>,
    );
  });
}

function umschalten(ziel: ThemePreference) {
  const testId = { auto: "nach-auto", dark: "nach-dunkel", light: "nach-hell" }[ziel];
  const knopf = container!.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!knopf) throw new Error(`Umschalt-Knopf fuer '${ziel}' nicht gefunden`);
  act(() => knopf.click());
}

function angezeigt(was: "modus" | "praeferenz") {
  return container!.querySelector(`[data-testid="${was}"]`)?.textContent;
}

describe("AntdProvider: die ausdrueckliche Wahl", () => {
  it("Wechsel auf dunkel setzt dataset.theme auf dem Wurzelelement — ohne Navigation", () => {
    matchMediaStellen(false);
    mount("light", "auto");

    umschalten("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(angezeigt("modus")).toBe("dark");
  });

  it("Regression: colorScheme wird weiterhin mitgeschrieben, nicht ersetzt", () => {
    matchMediaStellen(false);
    mount("light", "auto");

    umschalten("dark");

    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("Regression: das Praeferenz-Cookie wird weiterhin geschrieben", () => {
    matchMediaStellen(false);
    mount("light", "auto");

    umschalten("dark");

    expect(document.cookie).toContain("iuk-theme-pref=dark");
  });

  // Der Fall, fuer den die ganze Cookie-Konstruktion existiert.
  it("eine ausdrueckliche Wahl schlaegt das System", () => {
    matchMediaStellen(true);
    mount("dark", "auto");

    umschalten("light");

    expect(angezeigt("modus")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("AntdProvider: der Auto-Modus", () => {
  it("schreibt den Systemwert schon beim Mounten ins Cookie", () => {
    matchMediaStellen(true);
    mount("light", "auto");

    expect(document.cookie).toContain("iuk-theme-system=dark");
  });

  // Der erste Besuch: der Server kannte den OS-Wert noch nicht und hat hell
  // geliefert. Der Client zieht einen Render spaeter nach.
  it("holt beim Mounten einen abweichenden Systemwert nach", () => {
    matchMediaStellen(true);
    mount("light", "auto");

    expect(angezeigt("modus")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("zieht bei einem OS-Wechsel waehrend der Sitzung nach", () => {
    const medien = matchMediaStellen(false);
    mount("light", "auto");
    expect(angezeigt("modus")).toBe("light");

    medien.wechseln(true);

    expect(angezeigt("modus")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  // Die Gegenprobe: wer ausdruecklich gewaehlt hat, wird vom OS nicht mehr
  // umgestellt. Ohne diesen Test waere ein Effekt, der IMMER nachzieht, gruen.
  it("laesst eine ausdrueckliche Wahl bei einem OS-Wechsel in Ruhe", () => {
    const medien = matchMediaStellen(false);
    mount("light", "light");

    medien.wechseln(true);

    expect(angezeigt("modus")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    // Das Cookie wird trotzdem fortgeschrieben — sonst gilt beim spaeteren
    // Wechsel zurueck auf Auto ein veralteter Systemwert.
    expect(document.cookie).toContain("iuk-theme-system=dark");
  });

  it("zurueck auf Auto uebernimmt sofort den Systemwert", () => {
    matchMediaStellen(true);
    mount("light", "light");
    expect(angezeigt("modus")).toBe("light");

    umschalten("auto");

    expect(angezeigt("praeferenz")).toBe("auto");
    expect(angezeigt("modus")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  // DIE INVARIANTE. `data-theme="auto"` besteht typecheck, build und Vitest
  // und kippt trotzdem jede Modulflaeche still auf helle Darstellung.
  it("stempelt NIE 'auto' auf das Wurzelelement", () => {
    matchMediaStellen(true);
    mount("dark", "dark");

    umschalten("auto");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
rtk pnpm vitest run src/core/theme/AntdProvider.test.tsx
```

Erwartung: FAIL — `preference` ist `undefined`, `setPreference is not a function`.

- [ ] **Step 3: `AntdProvider.tsx` neu schreiben**

> Mit dieser Datei fällt die letzte Aufruferin von `themeCookieString` weg. **Die Funktion `themeCookieString` deshalb im selben Schritt aus `src/core/theme/mode.ts` löschen** — sie war Übergangsgerüst genau bis hierher (die Konstante `THEME_COOKIE` ist schon in Task 2 gefallen). `rtk pnpm typecheck` in Step 8 ist der Nachweis, dass niemand sonst daran hing.

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { App, ConfigProvider } from "antd";
import deDE from "antd/locale/de_DE";
import { buildTheme, type ThemeMode, type ThemePreference } from "@/core/theme/theme";
import {
  resolveThemeMode,
  themePreferenceCookieString,
  themeSystemCookieString,
} from "@/core/theme/mode";

interface ThemeModeApi {
  /** Der AUFGELÖSTE Modus. Nie `auto` — daran hängt `buildTheme` und jedes
   *  Modul-CSS über `[data-theme]`. */
  mode: ThemeMode;
  /** Was die Person gewählt hat. Nur der Umschalter braucht das. */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** @deprecated Übergangsgerüst für den Zwei-Zustands-Umschalter. Fällt mit
   *  dem Dreier-Zyklus weg. */
  setMode: (next: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeApi>({
  mode: "light",
  preference: "auto",
  setPreference: () => {},
  setMode: () => {},
});

export function useThemeMode(): ThemeModeApi {
  return useContext(ThemeModeContext);
}

const SYSTEM_ABFRAGE = "(prefers-color-scheme: dark)";

/**
 * Der Provider bekommt den MODUS, nicht die fertige ThemeConfig. Das ist keine
 * Geschmacksfrage: `buildTheme` steckt eine Algorithmus-FUNKTION in die Config,
 * und Funktionen überleben die Server-zu-Client-Grenze nicht. Ein Server-Layout
 * könnte die Config also gar nicht durchreichen.
 *
 * Er bekommt ZUSÄTZLICH die Präferenz, weil der Modus allein die Frage „folgt
 * das dem Gerät?" nicht beantwortet — und genau die entscheidet, ob ein
 * OS-Wechsel während der Sitzung nachgezogen wird.
 *
 * `<App>` ist Pflicht, nicht Zierde: statische Aufrufe von `message`,
 * `notification` und `Modal.confirm` rendern in einen eigenen DOM-Knoten und
 * verlieren dabei Theme und Locale. Innerhalb von `<App>` holt man sich die
 * Instanzen über `App.useApp()` und behält beides.
 */
export function AntdProvider({
  initialMode,
  initialPreference,
  cookieDomain,
  children,
}: {
  initialMode: ThemeMode;
  initialPreference: ThemePreference;
  cookieDomain?: string;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);

  /**
   * Der aufgelöste Modus, an drei Stellen zugleich — und keine davon ist
   * verzichtbar:
   *   - React-State, weil antd seinen Algorithmus daraus wählt;
   *   - `style.colorScheme`, weil Scrollbalken und native Bedienelemente sonst
   *     nicht mitziehen;
   *   - `dataset.theme`, weil jedes CSS-Modul der Suite daran hängt. Ohne die
   *     letzte Zeile wechselte antd sofort und jede eigene Fläche erst bei der
   *     nächsten Navigation — der Umschalter wäre für sie sichtbar wirkungslos.
   */
  const stempeln = useCallback((next: ThemeMode) => {
    setModeState(next);
    document.documentElement.style.colorScheme = next;
    document.documentElement.dataset.theme = next;
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      document.cookie = themePreferenceCookieString(next, cookieDomain);
      const system: ThemeMode = window.matchMedia(SYSTEM_ABFRAGE).matches ? "dark" : "light";
      stempeln(resolveThemeMode(next, system));
    },
    [cookieDomain, stempeln],
  );

  /**
   * Die Live-Hälfte des Auto-Modus. Das Inline-Script im `<head>` kann sie
   * nicht übernehmen: es läuft einmal beim Laden und sieht keinen Wechsel
   * während der Sitzung.
   *
   * Das Cookie wird IMMER fortgeschrieben, auch bei ausdrücklicher Wahl —
   * sonst gälte beim späteren Zurückschalten auf Auto ein veralteter Wert.
   * Gestempelt wird über `resolveThemeMode`, nicht nur bei `auto`: bei
   * ausdrücklicher Wahl liefert die Funktion die Wahl selbst zurück und der
   * Systemwert bleibt wirkungslos — der Aufruf ist dann ein Leerlauf-Stempel
   * auf den bereits geltenden Modus. Der lohnt sich trotzdem, weil der Effekt
   * schon beim ERSTEN Mount läuft: ohne ihn bliebe `dataset.theme` bis zur
   * nächsten Wahl unangetastet und verließe sich stillschweigend darauf, dass
   * das Server-Markup es schon richtig gesetzt hat.
   *
   * `preference` steht in den Abhängigkeiten (statt in einem Ref): der Effekt
   * hängt sich dann bei jeder Wahl neu ein. Das ist einmal pro Klick und
   * spart die Ref-Synchronisation, bei der man leicht den veralteten Wert
   * liest.
   */
  useEffect(() => {
    const mq = window.matchMedia(SYSTEM_ABFRAGE);
    const nachziehen = () => {
      const system: ThemeMode = mq.matches ? "dark" : "light";
      document.cookie = themeSystemCookieString(system, cookieDomain);
      stempeln(resolveThemeMode(preference, system));
    };
    nachziehen();
    mq.addEventListener("change", nachziehen);
    return () => mq.removeEventListener("change", nachziehen);
  }, [preference, cookieDomain, stempeln]);

  const setMode = useCallback((next: ThemeMode) => setPreference(next), [setPreference]);

  const api = useMemo(
    () => ({ mode, preference, setPreference, setMode }),
    [mode, preference, setPreference, setMode],
  );

  return (
    <ThemeModeContext.Provider value={api}>
      <ConfigProvider theme={buildTheme(mode)} locale={deDE}>
        <App>{children}</App>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
```

- [ ] **Step 4: Provider-Tests laufen lassen**

```bash
rtk pnpm vitest run src/core/theme/AntdProvider.test.tsx
```

Erwartung: alle PASS.

- [ ] **Step 5: Die Layout-Tests schreiben**

In `src/app/layout.test.tsx` den Kopfkommentar und die Attrappe anpassen — die Cookie-Attrappe muss ab jetzt **nach Namen** antworten:

```tsx
/**
 * `data-theme` auf `<html>` ist der verbindliche Selektor fuer jedes kuenftige
 * CSS-Modul der Suite. Auf `prefers-color-scheme` zu selektieren waere falsch:
 * die Suite hat einen Umschalter mit DREI Zustaenden (`iuk-theme-pref`,
 * serverseitig gelesen), und dann bricht der Fall "System dunkel, Umschalter
 * hell". Der Auto-Zustand loest der Server aus dem zweiten Cookie
 * `iuk-theme-system` auf — er sieht die Medienabfrage selbst nicht.
 * `colorScheme` bleibt zusaetzlich stehen — es zieht Scrollbalken und native
 * Bedienelemente mit, was ein Attribut nicht kann. Dieser Test haelt BEIDES
 * fest, damit niemand das eine gegen das andere austauscht.
 *
 * Gerendert wird nicht: `RootLayout` ist eine Server Component, ihr Rueckgabe-
 * wert ist ein React-Element. Dessen Props zu lesen prueft genau die Zusage,
 * ohne antd, AntdRegistry oder eine DOM-Umgebung hochzufahren.
 */
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

const get = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get }),
}));

import RootLayout from "./layout";

async function htmlElement(kekse: { pref?: string; system?: string }) {
  get.mockImplementation((name: string) => {
    const wert = name === "iuk-theme-pref" ? kekse.pref : name === "iuk-theme-system" ? kekse.system : undefined;
    return wert === undefined ? undefined : { value: wert };
  });
  return (await RootLayout({ children: null })) as ReactElement<
    Record<string, unknown> & { style?: { colorScheme?: string } }
  >;
}

describe("Wurzel-Layout: Theme-Signal fuer CSS", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("Wahl hell: <html> traegt data-theme='light'", async () => {
    const html = await htmlElement({ pref: "light", system: "dark" });

    expect(html.type).toBe("html");
    expect(html.props["data-theme"]).toBe("light");
  });

  it("Wahl dunkel: <html> traegt data-theme='dark'", async () => {
    const html = await htmlElement({ pref: "dark", system: "light" });

    expect(html.props["data-theme"]).toBe("dark");
  });

  // Der Regelfall nach der Umstellung: niemand hat den neuen Schluessel.
  it("kein Praeferenz-Cookie: der Systemwert entscheidet", async () => {
    expect((await htmlElement({ system: "dark" })).props["data-theme"]).toBe("dark");
    expect((await htmlElement({ system: "light" })).props["data-theme"]).toBe("light");
  });

  // Der allererste Besuch, bevor das Init-Script gelaufen ist.
  it("gar kein Cookie: faellt auf 'light' zurueck", async () => {
    const html = await htmlElement({});

    expect(html.props["data-theme"]).toBe("light");
  });

  // DIE INVARIANTE: 'auto' darf das Wurzelelement nie erreichen.
  it("Praeferenz 'auto' wird aufgeloest, nicht durchgereicht", async () => {
    const html = await htmlElement({ pref: "auto", system: "dark" });

    expect(html.props["data-theme"]).toBe("dark");
    expect(html.props.style?.colorScheme).toBe("dark");
  });

  it("Regression: colorScheme bleibt ZUSAETZLICH gesetzt, nicht ersetzt", async () => {
    expect((await htmlElement({ pref: "dark" })).props.style?.colorScheme).toBe("dark");
    expect((await htmlElement({ pref: "light" })).props.style?.colorScheme).toBe("light");
  });

  it("data-theme und colorScheme sagen immer dasselbe", async () => {
    for (const kekse of [{ pref: "light" }, { pref: "dark" }, { system: "dark" }, {}]) {
      const html = await htmlElement(kekse);
      expect(html.props["data-theme"]).toBe(html.props.style?.colorScheme);
    }
  });
});
```

- [ ] **Step 6: Layout-Test laufen lassen, Fehlschlag bestätigen**

```bash
rtk pnpm vitest run src/app/layout.test.tsx
```

Erwartung: FAIL — `expected 'light' to be 'dark'` beim Systemwert-Test (`layout.tsx` liest den zweiten Schlüssel noch nicht).

- [ ] **Step 7: `layout.tsx` anpassen**

Import-Zeile 8 ersetzen:

```tsx
import {
  THEME_PREF_COOKIE,
  THEME_SYSTEM_COOKIE,
  parseThemeMode,
  parseThemePreference,
  resolveThemeMode,
  themeInitScript,
} from "@/core/theme/mode";
```

Zeilen 54-58 ersetzen:

```tsx
  // Serverseitig gelesen, damit der ERSTE Render schon den richtigen
  // Algorithmus trägt: kein Hydration-Mismatch, kein FOUC. Kostet nichts —
  // alle Routen sind durch Proxy-Rewrite und auth() ohnehin dynamisch.
  //
  // ZWEI Cookies, weil der Server `prefers-color-scheme` nicht sieht: die
  // Wahl (auch `auto`) und der zuletzt vom Client beobachtete OS-Wert.
  const keks = await cookies();
  const preference = parseThemePreference(keks.get(THEME_PREF_COOKIE)?.value);
  const system = parseThemeMode(keks.get(THEME_SYSTEM_COOKIE)?.value);
  const mode = resolveThemeMode(preference, system);
  const cookieDomain = process.env.AUTH_COOKIE_DOMAIN || undefined;
```

Den Kommentar am `<html>`-Element (Zeilen 64-70) ersetzen:

```tsx
      // BEIDES, nicht das eine statt des anderen: `colorScheme` zieht
      // Scrollbalken und native Bedienelemente mit, aber CSS kann darauf nicht
      // selektieren. `data-theme` ist der verbindliche Selektor fuer eigene
      // CSS-Variablen jedes Moduls — bewusst NICHT `prefers-color-scheme`:
      // die Suite hat einen Umschalter mit drei Zustaenden (`iuk-theme-pref`,
      // oben serverseitig gelesen), sonst bricht der Fall "System dunkel,
      // Umschalter hell".
      //
      // HIER STEHT IMMER DER AUFGELOESTE WERT, nie `auto`. Ein gestempeltes
      // `auto` besteht typecheck, build und Vitest und kippt trotzdem jede
      // Modulflaeche still auf helle Darstellung, waehrend antd dunkel rendert.
      // Den Wechsel ohne Reload schreibt `AntdProvider` mit.
```

Und die Provider-Zeile:

```tsx
            <AntdProvider
              initialMode={mode}
              initialPreference={preference}
              cookieDomain={cookieDomain}
            >
              {children}
            </AntdProvider>
```

- [ ] **Step 8: Beide Testdateien laufen lassen**

```bash
rtk pnpm vitest run src/app/layout.test.tsx src/core/theme/AntdProvider.test.tsx && rtk pnpm typecheck && rtk pnpm lint
```

Erwartung: alle PASS, `typecheck` und `lint` sauber.

- [ ] **Step 9: Commit**

```bash
rtk git add src/app/layout.tsx src/app/layout.test.tsx src/core/theme/AntdProvider.tsx src/core/theme/AntdProvider.test.tsx && rtk git commit -m "feat(theme): Server loest aus zwei Cookies auf, Provider zieht OS-Wechsel live nach"
```

---

### Task 4: Der Umschalter bekommt drei Zustände

**Files:**
- Modify: `src/core/theme/ThemeToggle.tsx` (vollständig)
- Modify: `src/core/theme/AntdProvider.tsx` (`setMode` entfernen)
- Test: `src/core/theme/ThemeToggle.test.tsx` (neu)

**Interfaces:**
- Consumes: `useThemeMode(): { mode, preference, setPreference }` aus Task 3.
- Produces: `ThemeToggle({ testId?: string })` — Signatur unverändert, damit `SuiteNav.tsx:316` und `:427` nicht angefasst werden müssen.

> **Warum das Label länger wird:** Bei zwei Zuständen konnte das Label allein das Ziel nennen („Dunkles Design") — es gab nur eine mögliche Richtung. Ein Dreier-Zyklus ohne Ansage des **aktuellen** Zustands ist eine Rate-Runde, besonders für Screenreader-Nutzung.

- [ ] **Step 1: Den Test schreiben**

Neue Datei `src/core/theme/ThemeToggle.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AntdProvider } from "./AntdProvider";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Der Dreier-Zyklus, ueber echte Klicks im echten Provider — nicht gegen eine
 * herausgeloeste Zyklus-Tabelle. Der Test soll den Weg pruefen, den ein Finger
 * nimmt: Klick -> Praeferenz -> aufgeloester Modus -> `dataset.theme`.
 *
 * `window.matchMedia` gibt es in jsdom nicht; der Provider wirft sonst beim
 * Mounten.
 */
let root: Root | null = null;
let container: HTMLElement | null = null;

function matchMediaStellen(dunkel: boolean) {
  window.matchMedia = (() => ({
    matches: dunkel,
    media: "(prefers-color-scheme: dark)",
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  matchMediaStellen(true);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  document.cookie = "iuk-theme-pref=; Path=/; Max-Age=0";
  document.cookie = "iuk-theme-system=; Path=/; Max-Age=0";
});

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AntdProvider initialMode="dark" initialPreference="auto">
        <ThemeToggle />
      </AntdProvider>,
    );
  });
}

function knopf(): HTMLButtonElement {
  const k = container!.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]');
  if (!k) throw new Error("Umschalter nicht gefunden");
  return k;
}

describe("ThemeToggle: Dreier-Zyklus", () => {
  it("laeuft auto -> hell -> dunkel -> auto", () => {
    mount();
    expect(knopf().getAttribute("aria-label")).toContain("Automatisch");

    act(() => knopf().click());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(knopf().getAttribute("aria-label")).toContain("Design: Hell");

    act(() => knopf().click());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(knopf().getAttribute("aria-label")).toContain("Design: Dunkel");

    // Rundum: das System steht auf dunkel, also bleibt es dunkel — aber die
    // Praeferenz ist wieder 'auto'.
    act(() => knopf().click());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("iuk-theme-pref=auto");
    expect(knopf().getAttribute("aria-label")).toContain("Automatisch");
  });

  // Ein Zyklus, dessen Label nur das Ziel nennt, zwingt zum Raten, was gerade
  // gilt. Beides muss drinstehen.
  it("das Label nennt den geltenden Zustand UND das Ziel des naechsten Klicks", () => {
    mount();

    const label = knopf().getAttribute("aria-label") ?? "";
    expect(label).toContain("Automatisch (folgt dem Gerät)");
    expect(label).toContain("weiter zu Hell");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
rtk pnpm vitest run src/core/theme/ThemeToggle.test.tsx
```

Erwartung: FAIL — `expected 'Helles Design' to contain 'Automatisch'`.

- [ ] **Step 3: `ThemeToggle.tsx` neu schreiben**

```tsx
"use client";

import { Button, Tooltip } from "antd";
import { BulbFilled, BulbOutlined, DesktopOutlined } from "@ant-design/icons";
import { useThemeMode } from "@/core/theme/AntdProvider";
import type { ThemePreference } from "@/core/theme/theme";

/** Ein Knopf, drei Zustände: jeder Klick geht einen Schritt weiter. */
const NAECHSTE: Record<ThemePreference, ThemePreference> = {
  auto: "light",
  light: "dark",
  dark: "auto",
};

/** Der geltende Zustand — mit dem Zusatz, der `auto` überhaupt erklärt. */
const LANG: Record<ThemePreference, string> = {
  auto: "Automatisch (folgt dem Gerät)",
  light: "Hell",
  dark: "Dunkel",
};

/** Das Ziel des nächsten Klicks. Kurz, sonst wird das Label unlesbar. */
const KURZ: Record<ThemePreference, string> = {
  auto: "Automatisch",
  light: "Hell",
  dark: "Dunkel",
};

/**
 * Das Icon zeigt, was GILT — nicht, was der Klick tut. Die Glühbirnen sind aus
 * dem Zwei-Zustands-Umschalter übernommen; `DesktopOutlined` für `auto` sagt
 * „das Gerät entscheidet".
 */
const ICON: Record<ThemePreference, React.ReactNode> = {
  auto: <DesktopOutlined />,
  light: <BulbOutlined />,
  dark: <BulbFilled />,
};

export function ThemeToggle({ testId = "theme-toggle" }: { testId?: string } = {}) {
  const { preference, setPreference } = useThemeMode();
  const naechste = NAECHSTE[preference];
  /*
   * BEIDES im Label, und das ist der Unterschied zum Vorgänger: bei zwei
   * Zuständen genügte das Ziel ("Dunkles Design"), weil es nur eine Richtung
   * gab. Bei dreien muss man wissen, wo man steht — sonst ist jeder Klick ein
   * Versuch. Für Screenreader ist es die einzige Auskunft überhaupt.
   */
  const label = `Design: ${LANG[preference]} — weiter zu ${KURZ[naechste]}`;

  return (
    <Tooltip title={label}>
      <Button
        type="text"
        shape="circle"
        data-testid={testId}
        aria-label={label}
        icon={ICON[preference]}
        onClick={() => setPreference(naechste)}
      />
    </Tooltip>
  );
}
```

- [ ] **Step 4: Das Übergangsgerüst aus dem Provider entfernen**

In `src/core/theme/AntdProvider.tsx` drei Dinge löschen:

1. aus `interface ThemeModeApi` die Zeilen

```ts
  /** @deprecated Übergangsgerüst für den Zwei-Zustands-Umschalter. Fällt mit
   *  dem Dreier-Zyklus weg. */
  setMode: (next: ThemeMode) => void;
```

2. aus dem Default-Wert des Kontexts die Zeile `setMode: () => {},`
3. die Definition `const setMode = useCallback((next: ThemeMode) => setPreference(next), [setPreference]);`

und `api` auf

```tsx
  const api = useMemo(
    () => ({ mode, preference, setPreference }),
    [mode, preference, setPreference],
  );
```

- [ ] **Step 5: Tests laufen lassen**

```bash
rtk pnpm vitest run src/core/theme && rtk pnpm typecheck && rtk pnpm lint
```

Erwartung: alle PASS. `typecheck` findet keine weitere `setMode`-Verwendung — falls doch, ist es eine Stelle, die auf `setPreference` umzustellen ist.

- [ ] **Step 6: Der Icon-Riegel und die Shell-Tests**

```bash
rtk pnpm vitest run src/core/shell
```

Erwartung: PASS. `src/core/shell/icons.test.ts` riegelt `@ant-design/icons` repo-weit ab; `ThemeToggle.tsx` ist eine Client-Insel und darf importieren — `DesktopOutlined` ändert daran nichts. Geht der Test rot, liegt die Ursache in der Datei, die die Fehlermeldung nennt.

- [ ] **Step 7: Commit**

```bash
rtk git add src/core/theme/ThemeToggle.tsx src/core/theme/ThemeToggle.test.tsx src/core/theme/AntdProvider.tsx && rtk git commit -m "feat(theme): Umschalter zyklisch ueber drei Zustaende, Label nennt Stand und Ziel"
```

---

### Task 5: Der Beweis, den nur Playwright führen kann

**Files:**
- Create: `e2e/theme.spec.ts`
- Modify: `e2e/feedback.spec.ts:492`, `:500`

**Interfaces:**
- Consumes: das fertige Verhalten aus Tasks 1–4.
- Produces: nichts für spätere Tasks.

> **Warum hier und nicht in Vitest:** Vitest sieht den SSR-Pfad strukturell nicht — `layout.test.tsx` prüft Props eines React-Elements, nicht ausgeliefertes HTML, und `prefers-color-scheme` gibt es in jsdom nur als Attrappe. Nur Playwright emuliert die echte Medienabfrage (`colorScheme`) gegen einen echten Serverrender.
>
> **Warum mit `javaScriptEnabled: false`:** Sonst ist der Test wertlos. Mit JavaScript zieht der `matchMedia`-Effekt das Attribut nach der Hydration ohnehin nach — ein grüner Test bewiese dann nur, dass der Client funktioniert, und würde eine kaputte serverseitige Auflösung durchlassen. Ohne JavaScript kann das Attribut nur vom Server kommen.

- [ ] **Step 1: Die neue Spec schreiben**

Neue Datei `e2e/theme.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

/**
 * DIE AUFLOESUNG DES AUTO-MODUS, serverseitig.
 *
 * Der Server sieht `prefers-color-scheme` nicht — deshalb fuehrt die Suite den
 * zuletzt beobachteten OS-Wert in einem zweiten Cookie (`iuk-theme-system`)
 * und die Wahl in `iuk-theme-pref`. Ob beide richtig zusammenkommen, ist in
 * Vitest strukturell nicht pruefbar: dort gibt es weder einen Serverrender
 * noch eine echte Medienabfrage.
 *
 * `/login` ist bewusst gewaehlt: login-frei, auf jedem Host erreichbar und
 * ohne Seed-Abhaengigkeit.
 */
const PORTAL = "http://portal.localtest.me:3100";

test("Auto ohne Praeferenz: der Server liefert den Systemwert — ohne eine Zeile JavaScript", async ({
  browser,
}) => {
  const kontext = await browser.newContext({ colorScheme: "dark", javaScriptEnabled: false });
  try {
    // Kein `iuk-theme-pref` — genau der Zustand nach der Umstellung, in dem
    // jeder Bestandsnutzer landet.
    await kontext.addCookies([{ name: "iuk-theme-system", value: "dark", url: PORTAL }]);
    const seite = await kontext.newPage();
    await seite.goto(`${PORTAL}/login`);

    await expect(seite.locator("html")).toHaveAttribute("data-theme", "dark");
  } finally {
    await kontext.close();
  }
});

test("eine ausdrueckliche Wahl schlaegt das System — der Fall, fuer den es das Cookie gibt", async ({
  browser,
}) => {
  const kontext = await browser.newContext({ colorScheme: "dark", javaScriptEnabled: false });
  try {
    await kontext.addCookies([
      { name: "iuk-theme-system", value: "dark", url: PORTAL },
      { name: "iuk-theme-pref", value: "light", url: PORTAL },
    ]);
    const seite = await kontext.newPage();
    await seite.goto(`${PORTAL}/login`);

    await expect(seite.locator("html")).toHaveAttribute("data-theme", "light");
  } finally {
    await kontext.close();
  }
});

/**
 * Die andere Haelfte: WIE der Systemwert ueberhaupt ins Cookie kommt. Ohne
 * diesen Test steht der erste auf einem von Hand gesetzten Cookie und belegt
 * die Kette nie ganz.
 *
 * Der erste Aufruf rendert serverseitig hell — der Server kennt den OS-Wert
 * noch nicht. Das wird hier NICHT zugesichert: der Client zieht nach der
 * Hydration sofort nach, eine Zusicherung auf "hell" waere ein Rennen. Belegt
 * wird, dass der Wert danach im Cookie steht und der zweite Aufruf ihn traegt.
 */
test("erster Besuch: der Client legt den Systemwert ab, der zweite Aufruf traegt ihn", async ({
  browser,
}) => {
  const kontext = await browser.newContext({ colorScheme: "dark" });
  try {
    const seite = await kontext.newPage();
    await seite.goto(`${PORTAL}/login`);

    // Nach der Hydration steht der Modus richtig — auch schon beim ersten Mal.
    await expect(seite.locator("html")).toHaveAttribute("data-theme", "dark");

    const kekse = await kontext.cookies();
    expect(kekse.find((k) => k.name === "iuk-theme-system")?.value).toBe("dark");
    // Die Wahl selbst bleibt ungesetzt: Auto ist die Vorgabe, kein Zustand,
    // den man erst waehlen muss.
    expect(kekse.find((k) => k.name === "iuk-theme-pref")).toBeUndefined();

    await seite.reload();
    await expect(seite.locator("html")).toHaveAttribute("data-theme", "dark");
  } finally {
    await kontext.close();
  }
});
```

- [ ] **Step 2: Die zwei Zeilen in `feedback.spec.ts` umziehen**

In `e2e/feedback.spec.ts` den Kommentar ab Zeile 488 und die zwei `addCookies`-Aufrufe anpassen:

```ts
  // Der Umschalter der Suite IST dieses Cookie (`core/theme/mode.ts`,
  // serverseitig gelesen) — er gilt auch ohne Login. `iuk-theme-pref` traegt
  // die ausdrueckliche Wahl und schlaegt damit die OS-Praeferenz; die
  // Aufloesung des Auto-Zustands prueft `theme.spec.ts`. Beide Richtungen
  // werden geprueft: eine Zusicherung nur fuer dunkel wuerde auch eine fest
  // eingebaute Dunkelfarbe durchlassen.
  await context.addCookies([{ name: "iuk-theme-pref", value: "light", url: FEEDBACK }]);
```

und weiter unten:

```ts
  await context.addCookies([{ name: "iuk-theme-pref", value: "dark", url: FEEDBACK }]);
```

- [ ] **Step 3: Sicherstellen, dass kein `pnpm dev` läuft**

```bash
rtk lsof -ti :3100
```

Erwartung: **keine Ausgabe**. Ein offener Dev-Server auf 3100 belegt den Port, den `webServer` mit `reuseExistingServer: false` braucht — die ganze E2E-Suite fällt dann aus. Falls etwas läuft: beenden, bevor der nächste Schritt startet.

- [ ] **Step 4: Die beiden Specs laufen lassen**

```bash
rtk pnpm exec playwright test e2e/theme.spec.ts e2e/feedback.spec.ts
```

Erwartung: alle PASS. Der erste Lauf braucht lange (kaltes `.next`, siehe `playwright.config.ts`).

- [ ] **Step 5: Commit**

```bash
rtk git add e2e/theme.spec.ts e2e/feedback.spec.ts && rtk git commit -m "test(theme): E2E belegt die serverseitige Aufloesung — ohne JavaScript, sonst beweist sie nichts"
```

---

### Task 6: Kommentare, Dokumentation und der Gesamtlauf

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/design/README.md`
- Modify: `src/app/not-found.module.css:24`, `src/app/m/feedback/f/[slugSecret]/zettel.module.css:19`, `src/app/m/lagerbuch/_ui/helfer.module.css:82`, `src/app/m/files/_ui/files.css:13`, `src/app/m/files/_ui/files-css.test.ts:377`, `src/app/m/lagerbuch/_lib/bauform.test.ts:490`

**Interfaces:**
- Consumes: alles aus Tasks 1–5.
- Produces: nichts.

> Sechs Kommentare im Bestand nennen den Cookie beim alten Namen `iuk-theme`. Sie beschreiben weiterhin die richtige Regel („nicht `prefers-color-scheme`, die Suite hat einen Umschalter"), aber der Name ist ab jetzt falsch — und ein falscher Name in einem Kommentar, der genau vor einer Falle warnt, kostet die nächste Person eine Suche ins Leere.

- [ ] **Step 1: Die Fundstellen auflisten**

```bash
rtk grep -rn "iuk-theme" src docs CLAUDE.md
```

Erwartung: die sechs Kommentarstellen oben plus die bereits umgestellten Quelldateien und `e2e/theme.spec.ts`. Trifft der Fund eine Datei, die nicht in der Liste steht, gehört sie mit in diesen Schritt.

- [ ] **Step 2: Die sechs Kommentare nachziehen**

In jeder der sechs Dateien `` `iuk-theme` `` durch `` `iuk-theme-pref` `` ersetzen. Die umgebende Begründung bleibt unverändert — sie ist weiterhin richtig.

- [ ] **Step 3: `CLAUDE.md` anpassen**

Den Satz im Abschnitt „Bevor du Oberfläche baust"

```
Dazu: Hell/Dunkel läuft über `<html data-theme>` (Cookie-Umschalter, **nicht**
`prefers-color-scheme`), und die Regel für `src/core` lautet: nur was ein **zweites, heute belegbares**
Modul braucht.
```

ersetzen durch:

```
Dazu: Hell/Dunkel läuft über `<html data-theme>` (Cookie-Umschalter, **nicht**
`prefers-color-scheme`). Der Umschalter hat drei Zustände, und `auto` ist die Vorgabe — deshalb
**zwei** Cookies: `iuk-theme-pref` trägt die Wahl (`auto|light|dark`), `iuk-theme-system` den
zuletzt vom Client beobachteten OS-Wert, weil der Server `prefers-color-scheme` nicht sieht.
`data-theme` trägt **immer** den aufgelösten Wert `light`/`dark`; ein gestempeltes `auto` besteht
`build` und Vitest und kippt trotzdem jede Modulfläche still auf helle Darstellung. Die Regel für
`src/core` lautet: nur was ein **zweites, heute belegbares** Modul braucht.
```

- [ ] **Step 4: `docs/design/README.md` anpassen**

Den Abschnitt „Hell- und Dunkelmodus" (Zeilen 105-118) ersetzen:

```markdown
## Hell- und Dunkelmodus

Die Suite hat einen **Umschalter mit drei Zuständen** — `auto` (die Vorgabe), `light`, `dark`. Auf
`prefers-color-scheme` zu selektieren ist deshalb **falsch**: es bricht den Fall „System dunkel,
Umschalter hell".

Dahinter stehen **zwei** Cookies, und der Grund ist, dass der Server `prefers-color-scheme` nicht
sieht — die Medienabfrage existiert nur im Browser:

| Cookie | Werte | Bedeutung |
| --- | --- | --- |
| `iuk-theme-pref` | `auto \| light \| dark` | die Wahl. Fehlt → `auto` |
| `iuk-theme-system` | `light \| dark` | der zuletzt vom Client beobachtete OS-Wert |

`resolveThemeMode` in `core/theme/mode.ts` ist die einzige Stelle, an der daraus ein Modus wird.

`<html>` trägt `data-theme="light" | "dark"`. Eigenes CSS selektiert darauf:

```css
:root[data-theme="dark"] { --fb-ink: #ECE9E2; }
```

**Dort steht nie `auto`.** Ein gestempeltes `auto` besteht `typecheck`, `pnpm build` und Vitest und
kippt trotzdem jede eigene Fläche still auf helle Darstellung, während antd korrekt dunkel rendert —
dieselbe Bauart wie Falle 2 und 5 oben.

`AntdProvider` schreibt das Attribut beim Umschalten mit — ohne das bleiben eigene Variablen bis zur
nächsten Navigation auf dem alten Modus stehen. Im Zustand `auto` zieht ein `matchMedia`-Effekt dort
auch einen OS-Wechsel während der Sitzung nach.
```

> Achtung beim Einfügen: der innere ```` ```css ````-Block muss im README ein echter Codeblock bleiben.

- [ ] **Step 5: Der Gesamtlauf**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
```

Erwartung: alle vier sauber. `lint`-Warnungen blockieren nicht, Fehler schon.

- [ ] **Step 6: Die vollständige E2E-Suite**

```bash
rtk pnpm exec playwright test
```

Erwartung: alle PASS. Vorher wieder prüfen, dass kein `pnpm dev` auf 3100 läuft.

- [ ] **Step 7: Ein Blick mit echten Augen**

```bash
rtk pnpm dev
```

Portal öffnen, dreimal auf den Umschalter klicken und prüfen: Icon und Tooltip wechseln mit, die Fläche wechselt mit, und im Zustand „Automatisch" folgt die Seite einem Wechsel der macOS-Systemeinstellung **ohne Reload**. Danach den Dev-Server wieder beenden.

- [ ] **Step 8: Commit**

```bash
rtk git add CLAUDE.md docs/design/README.md src && rtk git commit -m "docs(theme): Cookie-Namen und den dritten Zustand ueberall nachziehen"
```

---

## Selbstprüfung des Plans

**Abdeckung gegen den Entwurf**

| Entwurfsabschnitt | Aufgabe |
| --- | --- |
| Zustandsmodell (zwei Cookies, Typen, `resolveThemeMode`) | Task 1 |
| Migration durch Namenswechsel, Altschlüssel abräumen | Task 1 (Konstante) + Task 2 (Abräumen) |
| Invariante „nie `auto` stempeln" | Global Constraints + Tests in Task 3 (Provider **und** Layout) |
| Init-Script: kein Early-Return, Fortschreiben | Task 2 |
| `layout.tsx` liest beide, löst auf | Task 3 |
| `AntdProvider`: `preference`, `setPreference`, `matchMedia`-Effekt | Task 3 |
| `ThemeToggle`: Dreier-Zyklus, drittes Icon, Label | Task 4 |
| Was bewusst offen bleibt (Erstbesuch-Aufblitzen) | Task 2 Step 3 (Kommentar), Task 5 Step 1 (Kommentar erklärt, warum darauf nicht zugesichert wird) |
| Prüfung Vitest | Tasks 1–4 |
| Prüfung Playwright | Task 5 |
| `KioskThemeProvider` unangetastet | Global Constraints; kein Task fasst die Datei an |
| Nicht im Umfang (kein `buildTheme`, keine Token, keine Kontopersistenz) | kein Task fasst das an |

**Platzhalter:** keine. Jeder Code-Schritt trägt den vollständigen Text; kein „analog zu Task N".

**Typkonsistenz:** `ThemePreference` wird in Task 1 in `theme.ts` definiert und in Tasks 3–4 aus `@/core/theme/theme` importiert (nicht aus `mode.ts`, das ihn nur weiterreicht). `resolveThemeMode(pref, system)` hat in Task 1, Task 3 (Provider) und Task 3 (Layout) dieselbe Signatur. `themeSystemCookieString`/`themePreferenceCookieString` heißen in Definition (Task 1) und Verwendung (Tasks 2–3) gleich. `setMode` existiert nur zwischen Task 3 und Task 4 und ist an beiden Stellen als Übergangsgerüst ausgewiesen.
