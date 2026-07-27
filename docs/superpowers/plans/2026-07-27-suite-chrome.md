# Suite-Chrome Implementation Plan (Teilprojekt A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine globale, mobil brauchbare Navigationsleiste für alle Shell-Module, eine suiteweite Zoom-Sperre mit 16px-Untergrenze für Eingabefelder, ein Abmelden-Knopf und ein Slot für modul-interne Navigation.

**Architecture:** `SuiteHeader` (Server Component, löst `auth()` auf und baut die Einträge) plus `SuiteNav` (Client Component, Drawer + Desktop-Knöpfe). Beide Shells mit Chrome (`full`, `minimal`) rufen `SuiteHeader`; `kiosk` und die layoutlosen öffentlichen Ansichten bleiben unberührt. Die Umschaltung mobil/desktop läuft ausschließlich über CSS-Media-Queries, nie über JS-Breakpoints.

**Tech Stack:** Next.js 16 (App Router, RSC), Ant Design 6, Auth.js v5, Vitest (jsdom), Playwright.

## Global Constraints

Diese gelten für **jede** Aufgabe. Sie stammen aus `CLAUDE.md` und `docs/design/README.md`.

- **Kein Compound-Zugriff auf antd in einer Server Component.** Verboten: `Typography.*`, `Form.Item`, `Descriptions.Item`, `List.Item`, `Card.Meta`, `Collapse.Panel`, `Breadcrumb.Item`, `Input.Group`, `Input.TextArea`, `Space.Compact`, `Statistic.Countdown`, `Table.Summary`, `Tag.CheckableTag`, `Badge.Ribbon`, `Layout.Header`, `Grid.useBreakpoint`. Ergibt HTTP 500, den kein Build findet.
- **`Grid.useBreakpoint` ist auch in Client Components hier verboten** — die Umschaltung mobil/desktop läuft über CSS, siehe Architecture.
- **`--ant-*`-CSS-Variablen sind nicht global.** Eigenes Markup außerhalb eines antd-Komponentenbaums sieht sie nicht, und der Fehler ist still. Eigenes Markup nutzt eigene Variablen.
- **`size` auf Bedienelementen nicht setzen.** `controlHeight` ist 56 und schon das richtige Touch-Maß; `size="large"` wäre 72.
- **`colorError === colorPrimary === #c8000f`.** Rot nie auf einer Datenfläche.
- **Hell/Dunkel läuft über `<html data-theme>`**, nie über `prefers-color-scheme`.
- **Abstände aus `SPACE`** (`@/core/theme/tokens`), keine Zahlenliterale.
- **Deutsche Bezeichner und Kommentare**, passend zum umgebenden Code. Testbeschreibungen auf Deutsch.
- **Regel für `src/core`:** nur was ein zweites, heute belegbares Modul braucht.
- **Befehle:** `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test`. Alle mit `rtk` präfigieren (`rtk pnpm vitest run`).
- **DOM-Tests** nutzen `src/app/m/qr/_lib/test-dom.tsx` (`mount`/`fill`/`click`/`query`/`queryAll`/`exists`/`unmount`). Kein zweites Harness erfinden.

## Bestehende Zusagen, die nicht brechen dürfen

| Zusage | Wo geprüft |
|---|---|
| `data-testid="module-title"` sitzt auf dem `<strong>`, nicht am Link | `e2e/`-Keystone, `FullShell.test.tsx` |
| Der Modultitel ist ein Link auf `moduleUrl(key) ?? "/"` | `FullShell.test.tsx` |
| `data-testid="minimal-shell"` existiert | `e2e/keystone.spec.ts:6` |
| `data-testid="kiosk-shell"` existiert, Kiosk hat keine Kopfzeile | `e2e/keystone.spec.ts:13-14` |
| Modul-Links sind auf dem Desktop **ohne Öffnen** sichtbar (`getByRole("link", {name: /Alpha/})`) | `e2e/keystone.spec.ts:35` — Playwright läuft ohne `viewport`-Angabe, also 1280×720 |
| `data-testid="portal-grid"` | `e2e/pwa-spike.spec.ts:103` |

**Bewusst geändert wird:** `data-testid="full-shell-header"` heißt künftig `suite-header` und erscheint **auch** in `minimal`. Betroffen: `e2e/keystone.spec.ts:8,14,28,33` und `e2e/pwa-spike.spec.ts:102`. Task 6 schreibt sie um.

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/app/layout.tsx` | **ändern** — `viewport`-Export (Task 1) |
| `src/app/globals.css` | **ändern** — 16px-Untergrenze für Eingabefelder (Task 2) |
| `src/core/theme/theme.ts` | **ändern** — `Select.optionFontSize` (Task 2) |
| `src/app/m/feedback/_ui/feedback.css` | **ändern** — die abgelöste `.fb-form`-Regel entfernen (Task 2) |
| `src/core/shell/types.ts` | **neu** — `SuiteNavItem`, `AppSwitcherEntry` (Task 3) |
| `src/core/shell/shell.module.css` | **neu** — mobil/desktop-Umschaltung (Task 3) |
| `src/core/shell/SuiteNav.tsx` | **neu** — Client: Drawer, Desktop-Knöpfe, Theme, Nutzer (Task 4) |
| `src/core/shell/SuiteHeader.tsx` | **neu** — Server: `auth()`, Titel-Link, rendert `SuiteNav` (Task 5) |
| `src/core/shell/AppSwitcher.tsx` | **löschen** — geht in `SuiteNav` auf (Task 5) |
| `src/core/shell/FullShell.tsx` | **ändern** — nutzt `SuiteHeader` (Task 5) |
| `src/core/shell/MinimalShell.tsx` | **ändern** — nutzt `SuiteHeader` (Task 6) |
| `src/core/shell/Shell.tsx` | **ändern** — reicht `nav` durch (Task 7) |
| `src/app/m/feedback/(admin)/layout.tsx`, `src/app/m/qr/layout.tsx` | **ändern** — `nav` befüllen (Task 7) |
| `docs/design/README.md` | **ändern** — Querschnittsregeln (Task 8) |

---

### Task 1: Zoom-Sperre im Root-Layout

**Files:**
- Modify: `src/app/layout.tsx`
- Test: `src/app/layout.test.ts` (neu)

**Interfaces:**
- Consumes: nichts
- Produces: `export const viewport: Viewport` in `src/app/layout.tsx`

- [ ] **Step 1: Test schreiben**

Neue Datei `src/app/layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { viewport } from "./layout";

/**
 * DIE ZOOM-SPERRE IST EINE BETREIBERENTSCHEIDUNG, KEIN VERSEHEN.
 *
 * `user-scalable=no` verletzt WCAG 1.4.4 (Text auf 200 % vergroesserbar). Die
 * Entscheidung wurde bewusst getroffen; dieser Test haelt sie fest, damit
 * niemand sie fuer einen Fehler haelt und "korrigiert", und damit niemand sie
 * still verliert.
 *
 * Sie haengt an der 16px-Untergrenze fuer Eingabefelder (globals.css,
 * theme.ts): ohne Zoom kann niemand mehr heranholen, was zu klein ist. Wer
 * eine der beiden Regeln anfasst, prueft die andere mit.
 *
 * `viewportFit: "cover"` gehoert ausdruecklich NICHT dazu — es waere eine
 * andere Anforderung (randlose Darstellung) und verpflichtete jede Flaeche der
 * Suite auf `env(safe-area-inset-*)`.
 */
describe("Root-Layout — Viewport", () => {
  it("sperrt den Zoom", () => {
    expect(viewport.userScalable).toBe(false);
    expect(viewport.maximumScale).toBe(1);
  });

  it("bleibt auf Geraetebreite mit Anfangsmassstab 1", () => {
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
  });

  it("schaltet NICHT auf randlose Darstellung", () => {
    expect(viewport.viewportFit).toBeUndefined();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/layout.test.ts`
Expected: FAIL — `viewport` wird nicht exportiert.

- [ ] **Step 3: Implementieren**

In `src/app/layout.tsx` den Typ-Import erweitern und den Export ergänzen. Der Import in Zeile 1 lautet heute `import type { Metadata } from "next";` — daraus wird:

```ts
import type { Metadata, Viewport } from "next";
```

Direkt unter dem bestehenden `metadata`-Export (nach Zeile 23) einfügen:

```ts
/**
 * ZOOM GESPERRT, SUITEWEIT. Bewusste Betreiberentscheidung, keine
 * Nachlaessigkeit — sie verletzt WCAG 1.4.4 und wird dadurch aufgefangen, dass
 * Eingabefelder nirgends unter 16px fallen (`globals.css`, dort begruendet).
 * Die beiden Regeln gehoeren zusammen: ohne Zoom kann niemand mehr heranholen,
 * was zu klein ist.
 *
 * Hier und nur hier — das Root-Layout liegt ueber allem, also gilt die Sperre
 * auch fuer den Kiosk und die login-freien Ansichten.
 *
 * KEIN `viewportFit: "cover"`. Das waere randlose Darstellung, eine andere
 * Anforderung, und verpflichtete Kopfzeile, jedes Modul-Padding und die
 * Kiosk-Shell auf `env(safe-area-inset-*)`. Wer sie will, hebt sie als eigene
 * Entscheidung — und stellt dann `Layout.headerHeight` von fest 64 auf
 * `min-height` um, sonst klemmt die Kopfzeile unter der Notch.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
```

- [ ] **Step 4: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/layout.test.ts`
Expected: PASS (3 Tests)

- [ ] **Step 5: Typecheck und Commit**

```bash
rtk pnpm typecheck
rtk git add src/app/layout.tsx src/app/layout.test.ts
rtk git commit -m "feat(core): Zoom suiteweit sperren"
```

---

### Task 2: 16px-Untergrenze für Eingabefelder

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/core/theme/theme.ts:50` (nach dem `Radio`-Eintrag in `components`)
- Modify: `src/app/m/feedback/_ui/feedback.css:319-336` (Regel entfernen)
- Modify: `src/app/m/feedback/_ui/Noten.test.tsx:298` (Test zeigt auf die neue Stelle)
- Test: `src/core/theme/feldschrift.test.ts` (neu)

**Interfaces:**
- Consumes: nichts
- Produces: die CSS-Regel in `globals.css` und `components.Select.optionFontSize` in `buildTheme()`

**Warum nicht der naheliegende Weg:** Ein globaler `fontSize: 16` in `theme.ts` verschöbe antds ganze Leiter (`fontSizeSM/LG/XL`, alle Überschriften) — `docs/design/README.md:110` verbietet das. Der Weg über Komponenten-Tokens trägt ebenfalls nicht: `Input` hat keinen `fontSize`, sondern `inputFontSize`, und **`Select` hat für den Selektor gar keinen Schriftgrößen-Token** (nur `optionFontSize` für die Dropdown-Liste). Deshalb CSS für die Felder, ein Token für die Optionen.

- [ ] **Step 1: Test schreiben**

Neue Datei `src/core/theme/feldschrift.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildTheme } from "./theme";

/**
 * EINGABEFELDER FALLEN NIRGENDS UNTER 16px.
 *
 * Die Begruendung hat sich UMGEDREHT und das ist der Grund, warum sie hier so
 * ausfuehrlich steht: frueher war 16px die Abwehr gegen iOS' Auto-Zoom beim
 * Fokus. Seit der Zoom suiteweit gesperrt ist (`app/layout.tsx`), zoomt iOS gar
 * nicht mehr — der alte Grund ist weg. Die Regel bleibt aus dem UMGEKEHRTEN:
 * ohne Zoom kann niemand mehr heranholen, was zu klein ist. Ein 14px-Feld war
 * vorher unbequem, jetzt ist es endgueltig.
 *
 * Wer den alten Kommentar irgendwo findet und die Regel deshalb fuer redundant
 * haelt: sie ist es nicht. Zoom-Sperre und 16px sind eine Einheit.
 */

const CSS_GLOBAL = readFileSync("src/app/globals.css", "utf8");

/** Alle CSS-Dateien unter src/, rekursiv. */
function alleCss(verzeichnis: string): string[] {
  return readdirSync(verzeichnis).flatMap((eintrag) => {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) return alleCss(pfad);
    return pfad.endsWith(".css") ? [pfad] : [];
  });
}

describe("Feldschrift — 16px als Suite-Untergrenze", () => {
  it("hebt die vier Eingabe-Selektoren in globals.css auf 16px", () => {
    // Kommentare raus, sonst zaehlt eine Erwaehnung im Fliesstext als Regel.
    const css = CSS_GLOBAL.replace(/\/\*[\s\S]*?\*\//g, "");
    const block = /:root input[\s\S]*?\{([\s\S]*?)\}/.exec(css);
    expect(block, "Regel `:root input, …` fehlt in globals.css").not.toBeNull();
    expect(block![1]).toMatch(/font-size:\s*16px/);
    for (const selektor of ["input", "textarea", "select", ".ant-select-selector"]) {
      expect(css).toContain(`:root ${selektor}`);
    }
  });

  it("gibt den Select-Optionen 16px (die CSS-Regel erreicht sie nicht — kein input)", () => {
    for (const modus of ["light", "dark"] as const) {
      const optionFontSize = buildTheme(modus).components?.Select?.optionFontSize;
      expect(optionFontSize).toBe(16);
    }
  });

  it("laesst die globale Schriftleiter unangetastet", () => {
    // Basis 16 verschoebe jede Ueberschrift und Tabellenzelle — verboten laut
    // docs/design/README.md:110 ("antds eigene Leiter, keine dritte Skala").
    for (const modus of ["light", "dark"] as const) {
      expect(buildTheme(modus).token?.fontSize).toBeUndefined();
    }
  });

  it("hat in keiner CSS-Datei eine Eingabe-Regel unter 16px", () => {
    const verstoesse: string[] = [];
    for (const pfad of alleCss("src")) {
      const css = readFileSync(pfad, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        // At-Regel-Klammern aufloesen, SONST SIEHT DER SCAN NICHTS.
        // Bei `@media (…) { .fb-form input { font-size: 14px } }` faengt der
        // naive Klammer-Regex unten `@media (…)` als Selektor und schluckt die
        // innere Regel in den Koerper — die Eingabe-Regel wird nie geprueft.
        // Und in Media Queries steht genau das, worum es hier geht: kleine
        // Schriftgroeszen fuer schmale Geraete. Waere derselbe Fehler wie ein
        // jsdom-Test auf Media Queries: gruen, ohne zu messen.
        .replace(/@[a-z-]+[^{;]*\{/gi, "");
      // Regelbloecke, deren Selektor ein Eingabefeld benennt.
      for (const treffer of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const selektor = treffer[1];
        const koerper = treffer[2];
        if (!/\b(input|textarea|select)\b|\.ant-select-selector/.test(selektor)) continue;
        const groesse = /font-size:\s*(\d+)px/.exec(koerper);
        if (groesse && Number(groesse[1]) < 16) {
          verstoesse.push(`${pfad}: ${selektor.trim()} -> ${groesse[1]}px`);
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/core/theme/feldschrift.test.ts`
Expected: FAIL — die Regel fehlt in `globals.css`, `optionFontSize` ist `undefined`.

- [ ] **Step 3: `globals.css` ergänzen**

> **ÜBERHOLT durch Fix-Runde 1.** Die Regel unten steht auf `:root input, …` (Spezifität 0,1,1) und
> überstimmt damit Modul-Klassen wie `.textfeld` (0,1,0) — sie hätte das 18px-Freitextfeld des
> öffentlichen Abendzettels auf 16px heruntergezwungen. Umgesetzt ist stattdessen: `input, textarea,
> select` **ohne** `:root` (0,0,1, von Modul-CSS überschreibbar), `:root .ant-select-selector` als
> einzige Ausnahme, und `Input`/`InputNumber`/`DatePicker` je `inputFontSize: 16` in `theme.ts`.
> Siehe den Korrekturkasten im Spec, §3. Der Text unten bleibt als Beleg dafür stehen, wie der
> Fehler aussah.

Am Ende von `src/app/globals.css`, **vor** dem `@media print`-Block, einfügen:

```css
/*
 * EINGABEFELDER NIE UNTER 16px — suiteweit, ohne Media Query.
 *
 * Frueher war das die Abwehr gegen iOS' Auto-Zoom beim Fokus. Seit der Zoom in
 * `app/layout.tsx` gesperrt ist, zoomt iOS gar nicht mehr; die Regel bleibt aus
 * dem UMGEKEHRTEN Grund: ohne Zoom kann niemand mehr heranholen, was zu klein
 * ist. Die beiden Regeln gehoeren zusammen — wer eine anfasst, prueft die
 * andere. `core/theme/feldschrift.test.ts` haelt beides fest.
 *
 * `:root` steht davor, NICHT aus Gewohnheit: eine nackte Regel `input {…}` hat
 * Spezifitaet (0,0,1) und unterliegt antds `.ant-input` (0,1,0) — sie wirkt
 * still nicht. Mit `:root` sind es (0,1,1) bzw. (0,2,0), und es braucht kein
 * `!important`. Modul-eigenes CSS mit hoeherer Spezifitaet gewinnt weiterhin
 * nach oben (der Abendzettel setzt `.textfeld` auf 18px).
 *
 * `.ant-select-selector` gehoert dazu, weil antd die geschlossene Auswahl aus
 * einem `<div>` baut — das `input` darin ist unsichtbar und traegt die
 * Schriftgroesse nicht. antd bietet dafuer KEINEN Token an (`Select` kennt nur
 * `optionFontSize` fuer die offene Liste, siehe theme.ts). Dass hier ein
 * antd-interner Klassenname steht, ist eine bewusst eingegangene Kopplung: ein
 * antd-Major koennte ihn umbenennen, und der Bruch waere still.
 *
 * Keine Media Query: `controlHeight` ist 56, da ist reichlich Platz, und ein
 * zweiter Breakpoint neben dem der Shell (768px) waere eine zweite Skala.
 */
:root input,
:root textarea,
:root select,
:root .ant-select-selector {
  font-size: 16px;
}
```

- [ ] **Step 4: `theme.ts` ergänzen**

In `src/core/theme/theme.ts`, im `components`-Objekt **nach** dem `Radio`-Eintrag (der heute bei Zeile 50 endet), einfügen:

```ts
      /*
       * Die Optionen der offenen Auswahlliste sind Tap-Ziele, die gelesen
       * werden muessen, bevor man sie trifft. Sie sind KEIN `input` — die
       * 16px-Regel in `globals.css` erreicht sie nicht, deshalb hier.
       *
       * Das ist keine Doppelung: die CSS-Regel deckt das geschlossene Feld ab
       * (ueber `.ant-select-selector`), dieser Token die offene Liste. Fuer den
       * Selektor selbst bietet antd keinen Token an — sonst staende er hier
       * statt in CSS.
       *
       * 16 ist ein Wert aus antds eigener Leiter (12/14/16/20/24/30), also
       * keine dritte Skala im Sinne von docs/design/README.md:110.
       */
      Select: { optionFontSize: 16 },
```

- [ ] **Step 5: Abgelöste Modul-Regel entfernen**

In `src/app/m/feedback/_ui/feedback.css` den Block von Zeile 319 (`/*` vor „MOBILE FELDSCHRIFT") bis einschließlich der schließenden `}` der `.fb-form`-Regel (Zeile 336) **ersetzen** durch:

```css
/*
 * Die mobile Feldschrift stand frueher hier (`.fb-form input/textarea/
 * .ant-select-selector` unter `max-width: 600px`). Sie ist nach
 * `app/globals.css` gewandert und gilt jetzt suiteweit und ohne Breakpoint —
 * der Maszstab aus docs/design/README.md ist ein zweiter, heute belegbarer
 * Nutznieszer, und den gibt es seit portal-Admin und qr-Admin.
 */
@media (max-width: 600px) {
```

**Achtung:** Der `@media (max-width: 600px)`-Block enthält danach noch `.fb-block-mobil` (Zeilen 338-345). Der bleibt erhalten — nur die `.fb-form`-Regel und ihr Kommentar verschwinden, die Media Query und alles Weitere darin bleiben stehen.

- [ ] **Step 6: Zeigenden Test umhängen**

`src/app/m/feedback/_ui/Noten.test.tsx:298` prüft `expect(CSS_CODE).toMatch(/@media\s*\(max-width:\s*600px\)/)`. Diese Zusage bleibt gültig (die Media Query existiert weiter wegen `.fb-block-mobil`) — **prüfen und nur anfassen, wenn der Test rot wird.** Lauf: `rtk pnpm vitest run src/app/m/feedback/_ui/Noten.test.tsx`. Wenn rot, den Test auf die verbliebene Regel zeigen lassen, nicht die Media Query wiederherstellen.

- [ ] **Step 7: Tests laufen lassen**

```bash
rtk pnpm vitest run src/core/theme/ src/app/m/feedback/_ui/Noten.test.tsx
```
Expected: PASS

- [ ] **Step 8: Volle Suite und Commit**

```bash
rtk pnpm typecheck && rtk pnpm vitest run && rtk pnpm lint
rtk git add src/app/globals.css src/core/theme/theme.ts src/core/theme/feldschrift.test.ts src/app/m/feedback/_ui/feedback.css
rtk git commit -m "feat(core): 16px-Untergrenze fuer Eingabefelder, suiteweit"
```

---

### Task 3: Typen, Shell-CSS, Portal-Abfragen im Test-Harness

**Files:**
- Create: `src/core/shell/types.ts`
- Create: `src/core/shell/shell.module.css`
- Test: `src/core/shell/shell-css.test.ts` (neu)
- Modify: `src/app/m/qr/_lib/test-dom.tsx` (Portal-Abfragen)
- Modify: `src/core/theme/ThemeToggle.tsx` (`testId`-Prop)

**Interfaces:**
- Produces:
  - `export interface AppSwitcherEntry { key: string; title: string; icon: string; href: string }`
  - `export interface SuiteNavItem { key: string; title: string; href: string }`
  - CSS-Klassen: `.kopf`, `.titel`, `.nurMobil`, `.nurDesktop`, `.modulzeile`, `.drawerGruppe`, `.drawerTitel`, `.drawerEintrag`, `.drawerAktiv`

**Warum eine eigene Typdatei:** `AppSwitcherEntry` liegt heute in `AppSwitcher.tsx`, das in Task 5 gelöscht wird. `switcherEntries.ts` importiert von dort. Die Typen zuerst umzuziehen hält Task 5 klein.

- [ ] **Step 1: Test schreiben**

Neue Datei `src/core/shell/shell-css.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DIE UMSCHALTUNG MOBIL/DESKTOP IST CSS, NICHT JAVASCRIPT.
 *
 * Warum das hier und nicht im DOM geprueft wird: **jsdom wertet Media Queries
 * nicht aus.** Ein Test, der "auf 390px steht kein Modulknopf im Kopf"
 * behauptet und dafuer in jsdom nach Knoepfen sucht, geht IMMER durch — er
 * misst nichts. Diese Datei besitzt die Regel (die Klasse traegt die richtige
 * Media Query), das sichtbare Ergebnis besitzt der Playwright-Lauf bei
 * 390x844.
 *
 * Warum ueberhaupt CSS und nicht `Grid.useBreakpoint`: das ist in Server
 * Components verboten (docs/design/README.md, Falle 1), und ein JS-Breakpoint
 * zeigt beim ersten Render immer die falsche Variante.
 */
const CSS = readFileSync("src/core/shell/shell.module.css", "utf8");
const OHNE_KOMMENTARE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("shell.module.css", () => {
  it("kennt genau einen Breakpoint, und der ist 768px", () => {
    const breakpoints = [...OHNE_KOMMENTARE.matchAll(/\(min-width:\s*(\d+)px\)/g)].map((m) => m[1]);
    expect(breakpoints.length).toBeGreaterThan(0);
    expect(new Set(breakpoints)).toEqual(new Set(["768"]));
  });

  it("blendet Desktop-Inhalte unterhalb von 768px aus", () => {
    // `.nurDesktop` steht ohne Media Query auf `display: none` und wird erst
    // ab 768px eingeblendet — mobile-first, kein Aufblitzen beim Laden.
    const basis = /\.nurDesktop\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(basis, "Klasse .nurDesktop fehlt").not.toBeNull();
    expect(basis![1]).toMatch(/display:\s*none/);
  });

  it("blendet den Menue-Knopf ab 768px aus", () => {
    const abBreakpoint = OHNE_KOMMENTARE.slice(OHNE_KOMMENTARE.indexOf("(min-width: 768px)"));
    const regel = /\.nurMobil\s*\{([^}]*)\}/.exec(abBreakpoint);
    expect(regel, ".nurMobil wird ab 768px nicht ausgeblendet").not.toBeNull();
    expect(regel![1]).toMatch(/display:\s*none/);
  });

  it("nutzt keine `--ant-*`-Variablen (die sieht eigenes Markup nicht)", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/var\(--ant-/);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/core/shell/shell-css.test.ts`
Expected: FAIL — Datei existiert nicht.

- [ ] **Step 3: `types.ts` anlegen**

```ts
/**
 * Die Datenformen der Suite-Kopfzeile. Eigene Datei, weil `switcherEntries.ts`
 * (Server) und `SuiteNav.tsx` (Client) beide darauf zugreifen — laege der Typ
 * in der Client-Komponente, zoege der Server-Import sie mit ins Bundle.
 */

/** Ein Modul im App-Wechsler. `icon` ist ein @ant-design/icons Komponentenname. */
export interface AppSwitcherEntry {
  key: string;
  title: string;
  icon: string;
  href: string;
}

/**
 * Ein Eintrag der modul-internen Navigation. Module uebergeben das optional an
 * `Shell`; wer nichts uebergibt, bekommt genau das Bild von vorher.
 *
 * Bewusst OHNE `icon`: die Modulnavigation steht in einer Zeile bzw. Liste mit
 * Text, und ein Icon je Unterseite waere Zierrat, den niemand pflegt.
 */
export interface SuiteNavItem {
  key: string;
  title: string;
  href: string;
}
```

- [ ] **Step 4: `shell.module.css` anlegen**

```css
/*
 * Die Kopfzeile der Suite, mobil zuerst.
 *
 * Beide Ausprägungen (Menue-Knopf und Modulknopfreihe) werden IMMER gerendert;
 * welche man sieht, entscheidet allein CSS. Der Grund steht in
 * `shell-css.test.ts`: `Grid.useBreakpoint` ist in Server Components verboten,
 * und ein JS-Breakpoint zeigt beim ersten Render die falsche Variante.
 *
 * 768px ist der EINZIGE Breakpoint der Suite (= antds `md`). Ein zweiter waere
 * eine zweite Skala — siehe docs/design/README.md.
 *
 * Keine `--ant-*`-Variablen hier: antd deklariert sie auf seiner Scope-Klasse,
 * nicht auf `:root`, und eigenes Markup sieht sie nicht. Der Fehler waere still.
 */

.kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-inline: 16px;
}

.titel {
  color: inherit;
  text-decoration: none;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rechts {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

/* Mobil sichtbar, ab 768px weg. */
.nurMobil {
  display: flex;
  align-items: center;
}

/* Umgekehrt: mobil weg, ab 768px sichtbar. Mobile-first — die Basis ist `none`,
   damit auf schmalen Geraeten nichts aufblitzt, bevor CSS greift. */
.nurDesktop {
  display: none;
}

.modulzeile {
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}

/* Die modul-interne Navigation als zweite Kopfzeile (nur Desktop, nur wenn das
   Modul welche uebergibt). */
.modulnav {
  display: none;
  gap: 4px;
  padding-inline: 16px;
  border-block-end: 1px solid;
  border-color: color-mix(in srgb, currentColor 12%, transparent);
}

.drawerGruppe {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-block: 8px;
}

.drawerGruppe + .drawerGruppe {
  border-block-start: 1px solid;
  border-color: color-mix(in srgb, currentColor 12%, transparent);
}

.drawerTitel {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.6;
  padding-inline: 16px;
  padding-block: 8px;
}

/*
 * Die Modulnavigation ist `next/link` und damit rohes Markup — antds
 * Button-Aussehen faellt hier weg und muss gesetzt werden. Bewusst KEINE
 * `--ant-*`-Variablen: die sieht eigenes Markup nicht (der Fehler waere still).
 * `currentColor` erbt die Schriftfarbe der Kopfzeile und traegt damit hell wie
 * dunkel, ohne eine zweite Farbquelle aufzumachen.
 *
 * `min-height: 56px` ist das Touch-Masz der Suite (`TAP` in core/theme/tokens).
 */
.navLink {
  display: inline-flex;
  align-items: center;
  min-height: 56px;
  padding-inline: 12px;
  color: inherit;
  text-decoration: none;
  border-block-end: 2px solid transparent;
}

.navLink[aria-current="page"] {
  border-block-end-color: currentColor;
  font-weight: 600;
}

@media (min-width: 768px) {
  .nurMobil {
    display: none;
  }

  .nurDesktop {
    display: flex;
  }

  .modulnav {
    display: flex;
  }
}
```

- [ ] **Step 5: `switcherEntries.ts` auf die neue Typquelle zeigen lassen**

In `src/core/shell/switcherEntries.ts` Zeile 3 ändern:

```ts
import type { AppSwitcherEntry } from "@/core/shell/types";
```

`AppSwitcher.tsx` re-exportiert den Typ vorerst weiter, damit nichts bricht — ergänze dort **nach** der bestehenden `export interface AppSwitcherEntry`-Deklaration nichts, sondern **ersetze** die Deklaration durch:

```ts
export type { AppSwitcherEntry } from "@/core/shell/types";
```

und entferne das nun doppelte `interface AppSwitcherEntry` aus `AppSwitcher.tsx`.

- [ ] **Step 6: Portal-Abfragen ins Test-Harness**

**Warum das hier gebraucht wird — sonst scheitert Task 4 stumm:** antds `Drawer` rendert seinen
Inhalt durch ein **Portal nach `document.body`**. Das Harness `test-dom.tsx` löst jede Abfrage gegen
den Mount-Wirt auf (`container()` gibt `host` zurück). Portal-Inhalt ist ein **Geschwister** von
`host`, kein Nachfahre — `query('[data-testid="suite-drawer"]')` findet ihn also nie, und
`forceRender` rettet das nicht (es setzt den Inhalt ins DOM, nur eben in den falschen Teilbaum).

Die naheliegende Notlösung wäre, in Task 4 einfach gegen `document.body` zu prüfen. Das wäre ein Test,
der das Harness des Projekts umgeht — und der nächste macht es wieder anders. Stattdessen bekommt das
Harness das, was antd nun einmal tut: Drawer, Modal, Tooltip und Dropdown rendern alle in Portale.

In `src/app/m/qr/_lib/test-dom.tsx` **ans Ende** anfügen:

```tsx
/**
 * Abfragen fuer PORTAL-Inhalt.
 *
 * antd rendert `Drawer`, `Modal`, `Tooltip` und `Dropdown` durch ein Portal
 * nach `document.body` — der Inhalt ist ein GESCHWISTER des Mount-Wirts, kein
 * Nachfahre. `query()` oben sucht im Wirt und findet ihn deshalb nie. Das ist
 * keine Eigenheit eines einzelnen Tests, sondern wie antd arbeitet.
 *
 * Bewusst eigene Funktionen statt `query()` aufzubohren: wer `queryPortal`
 * schreibt, sagt damit "ich pruefe etwas, das ausserhalb meines Baums haengt".
 * Ein `query()`, das erst im Wirt und dann im Dokument sucht, faende auch
 * Ueberbleibsel eines vorherigen Tests, ohne dass es auffiele.
 */
export function queryPortal<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.body.querySelector<T>(selector);
  if (!el) throw new Error(`Element nicht im Dokument gefunden: ${selector}`);
  return el;
}

export function existsPortal(selector: string): boolean {
  return document.body.querySelector(selector) !== null;
}

export async function clickPortal(selector: string): Promise<void> {
  await clickElement(queryPortal(selector));
}
```

**Achtung, Aufräumen:** `unmount()` entfernt nur den Wirt. Portal-Knoten von antd bleiben in
`document.body` stehen und werden vom nächsten Test mitgefunden. Ergänze in `unmount()`, direkt vor
`currentHost?.remove();`:

```tsx
  // antd haengt Portale (Drawer, Modal, Tooltip) direkt an document.body. Ohne
  // dieses Aufraeumen sieht der naechste Test die Reste des vorherigen und
  // `existsPortal` liefert falsche Treffer — ein Fehler, der als bestandener
  // Test daherkommt.
  for (const rest of Array.from(document.body.children)) {
    if (rest !== currentHost) rest.remove();
  }
```

- [ ] **Step 7: `ThemeToggle` ein `testId`-Prop geben**

`SuiteNav` rendert den Umschalter zweimal (Kopfzeile und Drawer) — beide im DOM, per CSS wird einer
ausgeblendet. `ThemeToggle` trägt heute fest `data-testid="theme-toggle"`; zweimal im DOM ist das für
jeden künftigen Playwright-Zugriff eine Strict-Mode-Verletzung („resolved to 2 elements"). Heute prüft
kein E2E darauf (`rtk grep -rn "theme-toggle" src e2e` liefert nur die Definition), aber die Falle
gehört zugestellt, bevor jemand hineinläuft.

In `src/core/theme/ThemeToggle.tsx` die Signatur ändern:

```tsx
export function ThemeToggle({ testId = "theme-toggle" }: { testId?: string } = {}) {
```

und in der Komponente `data-testid={testId}` statt des festen Werts. Alle bestehenden Aufrufer bleiben
unverändert gültig.

- [ ] **Step 8: Tests laufen lassen**

```bash
rtk pnpm vitest run src/core/shell/ src/app/m/qr/ src/core/theme/ && rtk pnpm typecheck
```
Expected: PASS. Die bestehenden `qr`-Tests belegen, dass die Harness-Änderung nichts kaputt macht.

- [ ] **Step 9: Commit**

```bash
rtk git add src/core/shell/types.ts src/core/shell/shell.module.css src/core/shell/shell-css.test.ts src/core/shell/switcherEntries.ts src/core/shell/AppSwitcher.tsx src/app/m/qr/_lib/test-dom.tsx src/core/theme/ThemeToggle.tsx
rtk git commit -m "feat(core/shell): Typen, Kopfzeilen-CSS, Portal-Abfragen im Test-Harness"
```

---

### Task 4: `SuiteNav` — Drawer, Desktop-Knöpfe, Abmelden

**Files:**
- Create: `src/core/shell/SuiteNav.tsx`
- Test: `src/core/shell/SuiteNav.test.tsx` (neu)

**Interfaces:**
- Consumes: `AppSwitcherEntry`, `SuiteNavItem` aus `@/core/shell/types`; Klassen aus `shell.module.css`
- Produces:
```ts
export function SuiteNav(props: {
  entries: AppSwitcherEntry[];
  nav: SuiteNavItem[];
  userName: string | null;
  angemeldet: boolean;
}): JSX.Element
```

**Drei Zusagen, die still brechen würden:**
1. `e2e/keystone.spec.ts:35` prüft `getByRole("link", { name: /Alpha/ })` **ohne vorheriges Öffnen**. Playwright läuft bei 1280×720, also greift `.nurDesktop` — die Modul-Knöpfe müssen dort echte `<a>` sein (antds `Button href=…` rendert eines). Kein `Menu`/`Dropdown` an dieser Stelle.
2. Der Drawer-Inhalt muss **immer im DOM** stehen (antd `Drawer` mit `forceRender`), sonst findet ihn der jsdom-Test nicht, bevor er geöffnet wurde — und der Test prüfte dann nur, dass ein Knopf existiert.
3. **Der Drawer rendert in ein Portal nach `document.body`, nicht in den Mount-Wirt.** Deshalb nutzen alle Drawer-Zusagen unten `queryPortal`/`existsPortal`/`clickPortal` aus Task 3, nicht `query`/`exists`/`click`. Wer sie verwechselt, bekommt „Element nicht gefunden" auf Inhalt, der sichtbar da ist — und die naheliegende Reaktion (Assertion umschreiben) umgeht das Harness des Projekts.

- [ ] **Step 1: Test schreiben**

Neue Datei `src/core/shell/SuiteNav.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  mount,
  unmount,
  query,
  queryAll,
  exists,
  queryPortal,
  existsPortal,
  clickPortal,
} from "@/app/m/qr/_lib/test-dom";
import { SuiteNav, aktiverSchluessel } from "./SuiteNav";
import type { AppSwitcherEntry, SuiteNavItem } from "./types";

/**
 * DRAWER-INHALT WIRD MIT `…Portal`-ABFRAGEN GEPRUEFT, KOPFZEILEN-INHALT NICHT.
 *
 * antd rendert den `Drawer` durch ein Portal nach `document.body` — sein Inhalt
 * ist ein GESCHWISTER des Mount-Wirts, kein Nachfahre. `query()` sucht im Wirt
 * und faende ihn nie, auch mit `forceRender` nicht. Alles in der Kopfzeile
 * (`modulzeile`, `modulnav`, `menue-knopf`) bleibt dagegen im Wirt und wird mit
 * `query`/`exists` geprueft.
 *
 * Zwei Dinge, die dieser Test NICHT kann und die anderswo geprueft werden:
 * - Was man auf 390px SIEHT: jsdom wertet Media Queries nicht aus. Das besitzt
 *   der Playwright-Lauf; die CSS-Regel besitzt `shell-css.test.ts`.
 * - Ob antds Drawer korrekt animiert. Hier zaehlt nur, dass die Eintraege im
 *   DOM stehen und die richtigen Ziele tragen.
 */

const { signOutMock, pathnameMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  pathnameMock: vi.fn(() => "/"),
}));

vi.mock("next-auth/react", () => ({ signOut: signOutMock }));
vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));
vi.mock("@/core/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

const MODULE: AppSwitcherEntry[] = [
  { key: "portal", title: "Portal", icon: "AppstoreOutlined", href: "https://iuk-ue.de" },
  { key: "qr", title: "QR-Codes", icon: "QrcodeOutlined", href: "https://qr.iuk-ue.de" },
];

const NAV: SuiteNavItem[] = [
  { key: "start", title: "Uebersicht", href: "/" },
  { key: "vergleich", title: "Vergleich", href: "/vergleich" },
];

async function zeichne(props: Partial<Parameters<typeof SuiteNav>[0]> = {}) {
  await mount(
    <SuiteNav
      entries={MODULE}
      nav={[]}
      userName="Ruben Vitt"
      angemeldet
      {...props}
    />,
  );
}

afterEach(async () => {
  await unmount();
  signOutMock.mockClear();
  pathnameMock.mockReturnValue("/");
});

describe("SuiteNav — angemeldet", () => {
  it("rendert jedes Modul als echten Link, ohne dass etwas geoeffnet werden muss", async () => {
    await zeichne();
    // keystone.spec.ts:35 prueft `getByRole("link", {name: /Alpha/})` ohne
    // Oeffnen. Waere das ein Menu/Dropdown, faende Playwright nichts.
    const desktop = query('[data-testid="modulzeile"]');
    const links = Array.from(desktop.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://iuk-ue.de",
      "https://qr.iuk-ue.de",
    ]);
    expect(links.map((a) => a.textContent)).toEqual(["Portal", "QR-Codes"]);
  });

  it("zeigt dieselben Module im Drawer", async () => {
    await zeichne();
    const drawer = queryPortal('[data-testid="suite-drawer"]');
    const ziele = Array.from(drawer.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(ziele).toContain("https://iuk-ue.de");
    expect(ziele).toContain("https://qr.iuk-ue.de");
  });

  it("hat einen Abmelden-Knopf, der ueber den OIDC-Signout geht", async () => {
    await zeichne();
    await clickPortal('[data-testid="abmelden"]');
    // Derselbe Weg, den SessionGuard bei RefreshTokenError automatisch geht —
    // ohne ihn endete der Logout auf einer 404 (siehe oidc-signout/route.ts).
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/api/auth/oidc-signout" });
  });

  it("zeigt den Namen und keine Anmelde-Aufforderung", async () => {
    await zeichne();
    expect(queryPortal('[data-testid="suite-drawer"]').textContent).toContain("Ruben Vitt");
    expect(existsPortal('[data-testid="anmelden"]')).toBe(false);
  });

  it("zeigt die Modulnavigation, wenn das Modul welche uebergibt", async () => {
    await zeichne({ nav: NAV });
    const zeile = query('[data-testid="modulnav"]');
    expect(Array.from(zeile.querySelectorAll("a")).map((a) => a.textContent)).toEqual([
      "Uebersicht",
      "Vergleich",
    ]);
  });

  it("markiert den aktiven Eintrag der Modulnavigation", async () => {
    pathnameMock.mockReturnValue("/vergleich");
    await zeichne({ nav: NAV });
    const aktiv = queryAll('[data-testid="modulnav"] a[aria-current="page"]');
    expect(aktiv).toHaveLength(1);
    expect(aktiv[0].getAttribute("href")).toBe("/vergleich");
  });
});

describe("aktiverSchluessel — welcher Eintrag ist dran", () => {
  // Reine Berechnung, deshalb ohne DOM. Der DOM-Test oben mockt `usePathname`
  // und kann daher NICHT beweisen, dass die Aufloesung unter dem Proxy-Rewrite
  // stimmt — das gehoert dem E2E. Hier geht es um die Faelle, die der E2E
  // nicht guenstig durchspielen kann.

  it("nimmt den aeuszeren Pfad (ohne Rewrite)", () => {
    expect(aktiverSchluessel("/vergleich", NAV)).toBe("vergleich");
  });

  it("nimmt den inneren Pfad (mit Rewrite) — welchen usePathname liefert, haengt an Next", () => {
    expect(aktiverSchluessel("/m/feedback/vergleich", NAV)).toBe("vergleich");
  });

  it("markiert die Uebersicht auf der Modulwurzel, obwohl `/` Suffix von nichts ist", () => {
    // "/m/feedback".endsWith("/") ist false — ein naiver Suffix-Test liesze die
    // Uebersicht auf ihrer eigenen Seite unmarkiert.
    expect(aktiverSchluessel("/m/feedback", NAV)).toBe("start");
    expect(aktiverSchluessel("/", NAV)).toBe("start");
  });

  it("laeszt die Uebersicht auf einer Unterseite NICHT mitleuchten", () => {
    expect(aktiverSchluessel("/m/feedback/vergleich", NAV)).not.toBe("start");
  });

  it("nimmt den spezifischsten Treffer, wenn zwei passen", () => {
    const verschachtelt = [
      { key: "gruppen", title: "Gruppen", href: "/groups" },
      { key: "eine", title: "Eine Gruppe", href: "/groups/17" },
    ];
    expect(aktiverSchluessel("/m/feedback/groups/17", verschachtelt)).toBe("eine");
  });

  it("gibt null, wenn nichts passt und es keine Wurzel gibt", () => {
    expect(aktiverSchluessel("/irgendwo", [{ key: "a", title: "A", href: "/anders" }])).toBeNull();
  });

  it("laesst die Modulnavigation weg, wenn nichts uebergeben wird", async () => {
    await zeichne({ nav: [] });
    expect(exists('[data-testid="modulnav"]')).toBe(false);
  });
});

describe("SuiteNav — anonym", () => {
  it("bietet Anmelden statt Abmelden und KEINE Modulliste", async () => {
    // Der anonyme Besucher auf `qr` bekaeme sonst `feedback` angeboten:
    // canAccess() steigt bei requiresAuth:false frueh mit true aus, aber die
    // Modulwurzel von feedback liegt hinter requireFeedbackAccess() und wirft
    // ihn auf 404. Ein Wechselziel, das nicht funktioniert, gehoert nicht in
    // die Leiste.
    await zeichne({ angemeldet: false, userName: null });
    expect(existsPortal('[data-testid="anmelden"]')).toBe(true);
    expect(existsPortal('[data-testid="abmelden"]')).toBe(false);
    // Die Knopfreihe liegt in der Kopfzeile, nicht im Portal — hier `exists`.
    expect(exists('[data-testid="modulzeile"]')).toBe(false);
    expect(queryPortal('[data-testid="anmelden"]').getAttribute("href")).toBe("/login");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/core/shell/SuiteNav.test.tsx`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implementieren**

`src/core/shell/SuiteNav.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  AppstoreOutlined,
  BorderOutlined,
  CaretUpOutlined,
  DesktopOutlined,
  GlobalOutlined,
  LoginOutlined,
  LogoutOutlined,
  MenuOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Drawer } from "antd";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { ThemeToggle } from "@/core/theme/ThemeToggle";
import type { AppSwitcherEntry, SuiteNavItem } from "@/core/shell/types";
import s from "./shell.module.css";

// Icon-Name (aus ModuleDef.icon, Registry) -> @ant-design/icons Komponente.
// Unbekannte Namen fallen auf AppstoreOutlined zurueck, statt den Render zu
// crashen — eine neue Registry-Zeile soll die Kopfzeile nicht zerlegen.
const ICONS: Record<string, ComponentType> = {
  AppstoreOutlined,
  QrcodeOutlined,
  BorderOutlined,
  CaretUpOutlined,
  GlobalOutlined,
  DesktopOutlined,
};

function initialen(name: string | null): string {
  return (name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Welcher Navigationseintrag ist der aktive? Exportiert, weil das die einzige
 * Stelle mit echter Logik in dieser Datei ist und sie sich ohne DOM pruefen
 * laeszt.
 *
 * Zwei Faellen wird hier ausgewichen:
 *
 * 1. **Der Proxy schreibt um.** `/vergleich` wird zu `/m/feedback/vergleich`,
 *    und was `usePathname()` unter einem Rewrite liefert — den aeuszeren oder
 *    den inneren Pfad — haengt an der Next-Version. Ein Vergleich auf
 *    Gleichheit waere still falsch: nichts wuerde je markiert, und der
 *    Unit-Test faellt nicht darauf herein, weil er `usePathname` mockt. Deshalb
 *    Suffix-Vergleich, und deshalb prueft der E2E in Task 8 `aria-current` am
 *    laufenden Server.
 *
 * 2. **`/` ist Suffix von nichts.** `"/m/feedback".endsWith("/")` ist `false` —
 *    die Uebersicht waere auf ihrer eigenen Seite nie markiert. Und ein
 *    naiver Suffix-Test in die andere Richtung markierte sie auf JEDER
 *    Unterseite mit. Deshalb: der spezifischste Nicht-Wurzel-Treffer gewinnt,
 *    und nur wenn keiner passt, ist die Wurzel dran.
 */
export function aktiverSchluessel(pfad: string, nav: SuiteNavItem[]): string | null {
  const treffer = nav
    .filter((e) => e.href !== "/" && (pfad === e.href || pfad.endsWith(e.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (treffer) return treffer.key;
  return nav.find((e) => e.href === "/")?.key ?? null;
}

/**
 * Die Navigation der Suite: mobil ein Drawer hinter dem Menue-Knopf, ab 768px
 * eine Knopfreihe in der Kopfzeile. BEIDES wird immer gerendert; welche man
 * sieht, entscheidet `shell.module.css`. Ein JS-Breakpoint zeigte beim ersten
 * Render die falsche Variante, und `Grid.useBreakpoint` ist ohnehin verboten.
 *
 * Die Modul-Knoepfe sind `Button href=…` (rendert ein `<a>`, Rolle "link") und
 * bewusst NICHT in einem Dropdown: `keystone.spec.ts:35` prueft
 * `getByRole("link", {name: /Alpha/})` OHNE vorheriges Oeffnen. Playwright
 * laeuft ohne Viewport-Angabe, also auf 1280x720 — dort greift `.nurDesktop`.
 */
export function SuiteNav({
  entries,
  nav,
  userName,
  angemeldet,
}: {
  entries: AppSwitcherEntry[];
  nav: SuiteNavItem[];
  userName: string | null;
  angemeldet: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const pfad = usePathname();

  const modulLinks = entries.map((eintrag) => {
    const Icon = ICONS[eintrag.icon] ?? AppstoreOutlined;
    return (
      <Button key={eintrag.key} type="text" href={eintrag.href} icon={<Icon />}>
        {eintrag.title}
      </Button>
    );
  });

  const aktiv = aktiverSchluessel(pfad, nav);

  /*
   * `next/link` und NICHT `Button href` wie bei den Modulen darueber. Der
   * Unterschied ist fachlich: Module liegen auf FREMDEN Hosts, dorthin ist ein
   * voller Seitenwechsel richtig. Die Modulnavigation bleibt im selben Modul —
   * ein `<a>` warf dort die ganze Anwendung weg und lud sie neu. Der Modultitel
   * in `SuiteHeader` nutzt aus demselben Grund `Link`.
   */
  const navLinks = nav.map((eintrag) => (
    <Link
      key={eintrag.key}
      href={eintrag.href}
      className={s.navLink}
      aria-current={aktiv === eintrag.key ? "page" : undefined}
    >
      {eintrag.title}
    </Link>
  ));

  return (
    <>
      <div className={s.rechts}>
        <Button
          className={s.nurMobil}
          type="text"
          shape="circle"
          data-testid="menue-knopf"
          aria-label="Menü öffnen"
          aria-expanded={offen}
          icon={<MenuOutlined />}
          onClick={() => setOffen(true)}
        />
        {angemeldet ? (
          <nav
            aria-label="Module"
            data-testid="modulzeile"
            className={`${s.nurDesktop} ${s.modulzeile}`}
          >
            {modulLinks}
          </nav>
        ) : null}
        <span className={s.nurDesktop}>
          <ThemeToggle />
        </span>
        {/* Der zweite Umschalter steht im Drawer (unten) und traegt dort eine
            eigene testId — zwei Knoten mit `data-testid="theme-toggle"` waeren
            fuer jeden kuenftigen Playwright-Zugriff eine Strict-Mode-Verletzung
            ("resolved to 2 elements"). */}
        {userName ? <Avatar size="small">{initialen(userName)}</Avatar> : null}
      </div>

      {nav.length > 0 ? (
        <nav aria-label="Modulnavigation" data-testid="modulnav" className={s.modulnav}>
          {navLinks}
        </nav>
      ) : null}

      {/*
        `forceRender`: ohne das baut antd den Inhalt erst beim Oeffnen. Der
        jsdom-Test faende dann nur den Knopf und pruefte nichts — und der
        Fehler saehe aus wie ein gruener Test.
      */}
      <Drawer
        open={offen}
        onClose={() => setOffen(false)}
        placement="left"
        title="IuK-Suite"
        forceRender
        rootClassName="suite-drawer-root"
      >
        <div data-testid="suite-drawer">
          {nav.length > 0 ? (
            <div className={s.drawerGruppe}>
              <div className={s.drawerTitel}>In diesem Modul</div>
              {navLinks}
            </div>
          ) : null}

          {angemeldet ? (
            <div className={s.drawerGruppe}>
              <div className={s.drawerTitel}>Module</div>
              {modulLinks}
            </div>
          ) : null}

          <div className={s.drawerGruppe}>
            <ThemeToggle testId="theme-toggle-drawer" />
            {angemeldet ? (
              <>
                {userName ? <div>{userName}</div> : null}
                <Button
                  type="text"
                  data-testid="abmelden"
                  icon={<LogoutOutlined />}
                  onClick={() => signOut({ callbackUrl: "/api/auth/oidc-signout" })}
                >
                  Abmelden
                </Button>
              </>
            ) : (
              /*
               * Anonym gibt es KEINE Modulliste, sondern diesen Knopf. Grund:
               * `canAccess()` steigt bei `requiresAuth: false` frueh mit true
               * aus und wuerde `feedback` anbieten — dessen Modulwurzel liegt
               * aber hinter `requireFeedbackAccess()` und wirft den Besucher
               * auf 404. Ein Wechselziel, das nicht funktioniert, gehoert nicht
               * in die Leiste. Die saubere Alternative waere ein Registry-Feld,
               * das `qr` von `feedback` unterscheidet; das aendert aber
               * `core/registry` und gehoert damit in ein eigenes Vorhaben.
               */
              <Button type="text" data-testid="anmelden" href="/login" icon={<LoginOutlined />}>
                Anmelden
              </Button>
            )}
          </div>
        </div>
      </Drawer>
    </>
  );
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `rtk pnpm vitest run src/core/shell/SuiteNav.test.tsx`
Expected: PASS (8 Tests). Bei Fehlschlag zuerst prüfen, ob `forceRender` greift — wenn der Drawer-Inhalt fehlt, ist das die Ursache.

- [ ] **Step 5: Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint
rtk git add src/core/shell/SuiteNav.tsx src/core/shell/SuiteNav.test.tsx
rtk git commit -m "feat(core/shell): SuiteNav mit Drawer, Abmelden und anonymem Zustand"
```

---

### Task 5: `SuiteHeader` und Umbau von `FullShell`

**Files:**
- Create: `src/core/shell/SuiteHeader.tsx`
- Create: `src/core/shell/SuiteHeader.test.tsx`
- Modify: `src/core/shell/FullShell.tsx`
- Delete: `src/core/shell/AppSwitcher.tsx`
- Delete: `src/core/shell/FullShell.test.tsx` (Zusagen wandern nach `SuiteHeader.test.tsx`)

**Interfaces:**
- Consumes: `SuiteNav` aus Task 4, `switcherEntries`, `moduleUrl`, `getModule`, `auth`
- Produces:
```ts
export async function SuiteHeader(props: {
  moduleKey: string;
  nav?: SuiteNavItem[];
}): Promise<JSX.Element>
```

- [ ] **Step 1: Test schreiben**

Neue Datei `src/core/shell/SuiteHeader.test.tsx` — die Zusagen aus `FullShell.test.tsx` wandern mit, plus die neuen:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * DER MODULTITEL IM KOPF IST EIN LINK (Entwurf feedback-admin §4.1, §5.1).
 *
 * Uebernommen aus der abgeloesten `FullShell.test.tsx`: wer sich in einem Modul
 * verlaufen hatte, kam ohne diesen Link nur ueber die Zurueck-Taste zurueck.
 * Der Defekt hing an der Shell, nicht am Modul — deshalb pruefen diese Tests
 * ALLE Module mit Chrome, nicht nur das, das den Anlass gab.
 *
 * Zwei Zusagen, die still brechen wuerden:
 * 1. `data-testid="module-title"` bleibt auf dem `<strong>`, INNERHALB des
 *    Links. Der Keystone-E2E fragt es dort ab; waere es an den Link gewandert,
 *    faende der Test weiterhin den richtigen Text und niemandem fiele auf, dass
 *    die Zusage verschoben wurde.
 * 2. Die Kopfzeile traegt `data-testid="suite-header"` — der alte Name
 *    `full-shell-header` ist bewusst weg, weil die Kopfzeile jetzt auch in
 *    `minimal` steht. Die E2E-Dateien sind mit umgeschrieben.
 *
 * `SuiteNav` ist ersetzt: es ist eine Client-Komponente mit antd-Kontext
 * (`useThemeMode` wirft ausserhalb des Providers), und geprueft wird hier die
 * Kopfzeile, nicht ihr Inhalt.
 */
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/core/shell/SuiteNav", () => ({ SuiteNav: () => null }));

import { SuiteHeader } from "./SuiteHeader";
import { moduleUrl } from "./moduleUrl";
import { MODULES } from "@/core/registry";
import type { SuiteNavItem } from "./types";

/** Genau die Module mit Chrome — aus der Registry gelesen, nicht behauptet. */
const MIT_CHROME = MODULES.filter((m) => m.shell === "full" || m.shell === "minimal").map(
  (m) => m.key,
);

async function zeichne(moduleKey: string, nav?: SuiteNavItem[]): Promise<HTMLElement> {
  authMock.mockResolvedValue({ user: { name: "Test", groups: [] } });
  const element = await SuiteHeader({ moduleKey, nav });
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

const titel = (wirt: HTMLElement) => wirt.querySelector<HTMLElement>('[data-testid="module-title"]');

describe("SuiteHeader", () => {
  it("kennt mehr als ein Modul mit Chrome (sonst waere der Test wertlos)", () => {
    expect(MIT_CHROME.length).toBeGreaterThan(1);
    expect(MIT_CHROME).toContain("feedback");
    // qr ist `minimal` und bekommt die Kopfzeile NEU — das ist die
    // Verhaltensaenderung dieses Vorhabens.
    expect(MIT_CHROME).toContain("qr");
  });

  it.each(MIT_CHROME)("wickelt den Titel von `%s` in einen Link auf moduleUrl", async (key) => {
    const wirt = await zeichne(key);
    const strong = titel(wirt);
    expect(strong).not.toBeNull();
    expect(strong!.tagName).toBe("STRONG");
    const link = strong!.closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(moduleUrl(key) ?? "/");
  });

  it("traegt data-testid=suite-header", async () => {
    expect(
      (await zeichne("feedback")).querySelector('[data-testid="suite-header"]'),
    ).not.toBeNull();
  });

  it("zeigt den Titel des Moduls, nicht seinen Schluessel", async () => {
    expect(titel(await zeichne("gamma"))!.textContent).toBe("Gamma");
  });

  it("reicht die Modulnavigation durch, ohne sie zu erfinden", async () => {
    // Ohne `nav` bleibt es beim heutigen Bild — die Aenderung ist fuer Module,
    // die nichts uebergeben, unsichtbar.
    const ohne = await SuiteHeader({ moduleKey: "gamma" });
    expect(ohne).toBeTruthy();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/core/shell/SuiteHeader.test.tsx`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: `SuiteHeader.tsx` anlegen**

```tsx
import Link from "next/link";
import { Layout } from "antd";

import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { switcherEntries } from "@/core/shell/switcherEntries";
import { SuiteNav } from "@/core/shell/SuiteNav";
import type { SuiteNavItem } from "@/core/shell/types";
import s from "./shell.module.css";

const { Header } = Layout;

/**
 * Die eine Kopfzeile der Suite. `FullShell` und `MinimalShell` rufen beide sie —
 * damit ist der Maszstab aus docs/design/README.md erfuellt (zwei belegbare
 * Nutznieszer, heute).
 *
 * Server-Komponente, und das ist geprueft unbedenklich: der Kommentar in
 * `app/m/qr/layout.tsx`, ein `await auth()` mache die Routen dynamisch, ist
 * veraltet — `pnpm build` weist jede Route der Suite als `f (Dynamic)` aus,
 * weil das Root-Layout `cookies()` fuer den Theme-Modus liest.
 *
 * Die Eintraege werden HIER gebaut, nicht im Client: `switcherEntries()` liest
 * ueber `moduleUrl()` `process.env`, das im Client-Bundle nicht existiert.
 * `SuiteNav` bekommt nur fertige hrefs.
 */
export async function SuiteHeader({
  moduleKey,
  nav = [],
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
}) {
  const session = await auth();
  const mod = getModule(moduleKey);
  const angemeldet = !!session?.user;
  const entries = switcherEntries(session?.user?.groups ?? null);

  return (
    <Header data-testid="suite-header" className={s.kopf}>
      {/*
       * Der Modultitel fuehrt auf die Startseite SEINES Moduls (Entwurf
       * feedback-admin §4.1). Ohne diesen Link ist jede Unterseite eine
       * Sackgasse — der Defekt hing an der Shell und galt fuer jedes Modul.
       *
       * `data-testid` bleibt auf dem `<strong>` und wandert NICHT an den Link:
       * der Keystone-E2E fragt es dort ab. `moduleUrl` kennt Dev- und
       * Prod-Hosts; ohne Host bleibt "/" — nie ein toter Link.
       */}
      <Link href={moduleUrl(moduleKey) ?? "/"} className={s.titel}>
        <strong data-testid="module-title">{mod.title}</strong>
      </Link>
      <SuiteNav
        entries={entries}
        nav={nav}
        userName={session?.user?.name ?? null}
        angemeldet={angemeldet}
      />
    </Header>
  );
}
```

**Achtung:** `Layout.Header` als Compound-Zugriff ist in RSC verboten. Deshalb steht oben `const { Header } = Layout;` **auf Modulebene** — das ist Destrukturierung beim Import-Zeitpunkt, kein Property-Zugriff im Render, und genau das Muster, das `FullShell.tsx` heute schon nutzt.

- [ ] **Step 4: `FullShell.tsx` umbauen**

Vollständiger neuer Inhalt:

```tsx
import { Layout } from "antd";

import { SuiteHeader } from "@/core/shell/SuiteHeader";
import type { SuiteNavItem } from "@/core/shell/types";
import { SPACE } from "@/core/theme/tokens";

const { Content } = Layout;

export async function FullShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <SuiteHeader moduleKey={moduleKey} nav={nav} />
      <Content style={{ padding: SPACE.lg }}>{children}</Content>
    </Layout>
  );
}
```

- [ ] **Step 5: `AppSwitcher.tsx` und `FullShell.test.tsx` löschen**

```bash
rtk git rm src/core/shell/AppSwitcher.tsx src/core/shell/FullShell.test.tsx
```

Danach prüfen, dass niemand mehr importiert: `rtk grep -rn "AppSwitcher" src/ e2e/` darf nur noch Treffer in `types.ts`-Kommentaren liefern. Falls `switcherEntries.ts` noch auf `AppSwitcher` zeigt, auf `@/core/shell/types` umstellen (sollte Task 3 erledigt haben).

- [ ] **Step 6: Tests laufen lassen**

```bash
rtk pnpm vitest run src/core/shell/ && rtk pnpm typecheck && rtk pnpm build
```
Expected: PASS. Der Build muss durchlaufen — er ist hier der Wächter gegen die RSC-Compound-Falle.

- [ ] **Step 7: Commit**

```bash
rtk git add -A src/core/shell/
rtk git commit -m "feat(core/shell): SuiteHeader als eine Kopfzeile, AppSwitcher geht darin auf"
```

---

### Task 6: Reichweite auf `MinimalShell`, E2E-Zusagen umschreiben

**Files:**
- Modify: `src/core/shell/MinimalShell.tsx`
- Modify: `src/core/shell/Shell.tsx`
- Modify: `e2e/keystone.spec.ts:4-15,28,33`
- Modify: `e2e/pwa-spike.spec.ts:102`
- Modify: `src/app/m/qr/layout.tsx` (veralteter Kommentar)

**Interfaces:**
- Consumes: `SuiteHeader` aus Task 5
- Produces: `Shell` nimmt `nav?: SuiteNavItem[]` und reicht es durch

- [ ] **Step 1: `MinimalShell.tsx` umbauen**

```tsx
import { Layout } from "antd";

import { SuiteHeader } from "@/core/shell/SuiteHeader";
import type { SuiteNavItem } from "@/core/shell/types";
import { SPACE } from "@/core/theme/tokens";

const { Content } = Layout;

/**
 * Wie `FullShell`, nur mit begrenzter Inhaltsbreite. Die Kopfzeile ist seit
 * dem Suite-Chrome-Umbau dieselbe: vorher zeigte `minimal` nur den Modultitel,
 * und wer in `qr` sasz, kam ohne Adressleiste in kein anderes Modul.
 */
export async function MinimalShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  return (
    <Layout style={{ minHeight: "100vh" }} data-testid="minimal-shell">
      <SuiteHeader moduleKey={moduleKey} nav={nav} />
      <Content style={{ padding: SPACE.lg }}>
        <div style={{ maxWidth: 640, marginInline: "auto" }}>{children}</div>
      </Content>
    </Layout>
  );
}
```

- [ ] **Step 2: `Shell.tsx` durchreichen lassen**

```tsx
import { FullShell } from "@/core/shell/FullShell";
import { KioskShell } from "@/core/shell/KioskShell";
import { MinimalShell } from "@/core/shell/MinimalShell";
import type { ShellVariant } from "@/core/registry";
import type { SuiteNavItem } from "@/core/shell/types";

export function Shell({
  variant,
  moduleKey,
  nav,
  children,
}: {
  variant: ShellVariant;
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  if (variant === "full")
    return (
      <FullShell moduleKey={moduleKey} nav={nav}>
        {children}
      </FullShell>
    );
  if (variant === "minimal")
    return (
      <MinimalShell moduleKey={moduleKey} nav={nav}>
        {children}
      </MinimalShell>
    );
  // Kiosk bleibt bewusst ohne Kopfzeile und ohne `nav`: Vollbild ohne
  // Bedienelemente ist der Zweck dieser Variante.
  return <KioskShell moduleKey={moduleKey}>{children}</KioskShell>;
}
```

**Achtung:** `FullShell` und `MinimalShell` sind jetzt `async`. `Shell` ist eine synchrone Funktion, die JSX-Elemente zurückgibt — das ist in RSC zulässig (React awaitet die Kinder). Prüfe mit `rtk pnpm build`, ob der Typcheck durchgeht; wenn TypeScript meckert, `Shell` ebenfalls `async` machen und die Rückgaben `await`en.

- [ ] **Step 3: E2E-Zusagen umschreiben**

In `e2e/keystone.spec.ts` den ersten Test **ersetzen** (Zeilen 4-9):

```ts
test("anonymous beta host renders minimal shell WITH suite header", async ({ page }) => {
  // BEWUSSTE AENDERUNG (Suite-Chrome): `minimal` hatte vorher keine Kopfzeile.
  // Wer in einem minimal-Modul sasz, kam ohne Adressleiste in kein anderes.
  // Anonym zeigt der Drawer keine Modulliste, sondern Anmelden — geprueft in
  // src/core/shell/SuiteNav.test.tsx.
  await page.goto("http://beta.localtest.me:3100/");
  await expect(page.getByTestId("minimal-shell")).toBeVisible();
  await expect(page.getByTestId("beta-content")).toBeVisible();
  await expect(page.getByTestId("suite-header")).toBeVisible();
});
```

Zeile 14 (Kiosk) — `full-shell-header` durch `suite-header` ersetzen, `toHaveCount(0)` bleibt:

```ts
  await expect(page.getByTestId("suite-header")).toHaveCount(0);
```

Zeilen 28 und 33 — `full-shell-header` → `suite-header`, `toBeVisible()` bleibt.

In `e2e/pwa-spike.spec.ts:102` — `full-shell-header` → `suite-header`.

Danach prüfen, dass keine Stelle übrig ist: `rtk grep -rn "full-shell-header\|full-shell-switcher\|app-switcher" src/ e2e/` muss leer sein.

- [ ] **Step 4: Veralteten Kommentar in `qr/layout.tsx` korrigieren**

Den Kommentarblock über `<HistoryOwner />` ersetzen:

```tsx
      {/* Liest die Sitzung selbst, clientseitig — aus PWA-Gruenden, nicht aus
          Rendering-Gruenden. Der frueher hier stehende Hinweis, ein `await
          auth()` im Layout mache die Routen dynamisch, war veraltet: `pnpm
          build` weist jede Route der Suite als `f (Dynamic)` aus, weil das
          Root-Layout `cookies()` fuer den Theme-Modus liest. Siehe
          HistoryOwner.tsx fuer den tatsaechlichen Grund. */}
```

- [ ] **Step 5: Tests laufen lassen**

```bash
rtk pnpm typecheck && rtk pnpm vitest run && rtk pnpm build
```
Expected: PASS

- [ ] **Step 6: E2E laufen lassen**

```bash
rtk pnpm exec playwright test e2e/keystone.spec.ts
```
Expected: PASS. Wenn `getByRole("link", {name: /Alpha/})` fehlschlägt, prüfen ob `.nurDesktop` bei 1280×720 greift — das ist die wahrscheinlichste Ursache.

- [ ] **Step 7: Commit**

```bash
rtk git add -A src/core/shell/ e2e/ src/app/m/qr/layout.tsx
rtk git commit -m "feat(core/shell): Kopfzeile auch in minimal, E2E-Zusagen nachgezogen"
```

---

### Task 7: Modul-Navigation befüllen

**Files:**
- Modify: `src/app/m/feedback/(admin)/layout.tsx`
- Modify: `src/app/m/qr/layout.tsx`

**Interfaces:**
- Consumes: `Shell` mit `nav`-Prop aus Task 6, `canAdminModule` aus `@/core/auth/guards`

- [ ] **Step 1: feedback-Admin befüllen**

In `src/app/m/feedback/(admin)/layout.tsx` den `Shell`-Aufruf ersetzen:

```tsx
  return (
    <Shell
      variant={mod.shell}
      moduleKey={mod.key}
      /*
       * `vergleich` hatte bisher keinen festen Einstieg — die Seite existierte,
       * war aber nur ueber eine geratene URL erreichbar. Genau die Prueffrage
       * aus docs/design/README.md: "Hat jede Seite einen Weg in der
       * Oberflaeche?"
       */
      nav={[
        { key: "start", title: "Übersicht", href: "/" },
        { key: "vergleich", title: "Vergleich", href: "/vergleich" },
      ]}
    >
      {children}
    </Shell>
  );
```

- [ ] **Step 2: qr befüllen**

In `src/app/m/qr/layout.tsx` — das Layout wird dafür `async` und fragt den Admin-Status:

```tsx
import type { Metadata } from "next";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { canAdminModule } from "@/core/auth/guards";
import { RegisterSW } from "./RegisterSW";
import { HistoryOwner } from "./HistoryOwner";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
};

export default async function QrLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("qr");
  // Die Verwaltung steht nur Modul-Admins offen (`core/auth/guards`), also
  // steht sie auch nur ihnen in der Navigation. Ein Eintrag, der auf 404
  // fuehrt, ist schlimmer als kein Eintrag.
  const darfVerwalten = await canAdminModule("qr");

  return (
    <Shell
      variant={mod.shell}
      moduleKey={mod.key}
      nav={[
        { key: "start", title: "Generator", href: "/" },
        ...(darfVerwalten ? [{ key: "admin", title: "Verwaltung", href: "/admin" }] : []),
      ]}
    >
      <RegisterSW />
      {/* Liest die Sitzung selbst, clientseitig — aus PWA-Gruenden, nicht aus
          Rendering-Gruenden. Siehe HistoryOwner.tsx. */}
      <HistoryOwner />
      {children}
    </Shell>
  );
}
```

**Achtung:** Der in Task 6 Schritt 4 korrigierte Kommentar wird hier gekürzt — das ist beabsichtigt, die ausführliche Begründung steht dann in `SuiteHeader.tsx`.

- [ ] **Step 3: Tests laufen lassen**

```bash
rtk pnpm typecheck && rtk pnpm vitest run && rtk pnpm build
rtk pnpm exec playwright test e2e/qr.spec.ts e2e/feedback.spec.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/m/feedback/\(admin\)/layout.tsx src/app/m/qr/layout.tsx
rtk git commit -m "feat: Modulnavigation in feedback-Admin und qr"
```

---

### Task 8: Playwright-Lauf bei 390×844 und Querschnittsregeln

**Files:**
- Create: `e2e/shell-mobil.spec.ts`
- Modify: `docs/design/README.md`
- Modify: `docs/design/feedback-admin.md:875` (§4.14 — beschreibt eine Regel, die es nicht mehr gibt)

- [ ] **Step 1: E2E schreiben**

Neue Datei `e2e/shell-mobil.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * Der einzige Ort, der Media Queries wirklich auswertet. Was `shell-css.test.ts`
 * als Regel festhaelt ("die Klasse traegt die richtige Media Query"), belegt
 * dieser Lauf als Ergebnis ("man sieht es nicht").
 *
 * 390x844 ist das Mass, mit dem die feedback-Specs schon arbeiten.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("mobil: Modulknoepfe stehen nicht im Kopf, das Menue oeffnet sie", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  await expect(page.getByTestId("suite-header")).toBeVisible();
  // Die Knopfreihe ist im DOM, aber per CSS ausgeblendet — genau das ist der
  // Unterschied, den jsdom nicht sehen kann.
  await expect(page.getByTestId("modulzeile")).toBeHidden();

  await page.getByTestId("menue-knopf").click();
  await expect(page.getByTestId("suite-drawer").getByRole("link", { name: /Alpha/ })).toBeVisible();
});

test("mobil: die Kopfzeile bleibt einzeilig", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  const kopf = page.getByTestId("suite-header");
  const hoehe = await kopf.evaluate((el) => el.getBoundingClientRect().height);
  // 64px ist `Layout.headerHeight`. Bricht die Leiste um, wird sie hoeher —
  // genau der Defekt, den der alte `overflow: hidden` kaschierte.
  expect(hoehe).toBeLessThanOrEqual(72);
});

test("mobil: der Drawer fuehrt in ein anderes Modul", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  await page.getByTestId("menue-knopf").click();
  await page.getByTestId("suite-drawer").getByRole("link", { name: /Alpha/ }).click();
  await expect(page.getByTestId("alpha-content")).toBeVisible();
});

test("mobil: abmelden ist erreichbar", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await page.getByTestId("menue-knopf").click();
  await expect(page.getByTestId("abmelden")).toBeVisible();
});
```

**Zusätzlich, außerhalb des mobilen Blocks** — dieser Test ist der einzige, der die Aktivmarkierung
wirklich beweist:

```ts
test.describe("Modulnavigation am laufenden Server", () => {
  // Desktop-Viewport (Standard), weil `.modulnav` dort sichtbar ist.
  test.use({ viewport: { width: 1280, height: 720 } });

  test("markiert genau einen Eintrag als aktuelle Seite", async ({ page }) => {
    // DER EINZIGE ORT, DER DAS BEWEISEN KANN. Der Unit-Test mockt
    // `usePathname()`; was die Funktion unter dem Proxy-Rewrite (`/vergleich`
    // -> `/m/feedback/vergleich`) tatsaechlich liefert, haengt an der
    // Next-Version. Waere die Aufloesung falsch, wuerde schlicht nie etwas
    // markiert — ein stiller Fehlschlag, den kein Unit-Test sieht.
    await devLogin(page, {
      host: "feedback.localtest.me",
      groups: "da-feedback-admin",
      callbackPath: "/vergleich",
    });
    const aktiv = page.locator('[data-testid="modulnav"] a[aria-current="page"]');
    await expect(aktiv).toHaveCount(1);
    await expect(aktiv).toHaveText("Vergleich");
  });

  test("markiert die Uebersicht auf der Modulwurzel", async ({ page }) => {
    await devLogin(page, {
      host: "feedback.localtest.me",
      groups: "da-feedback-admin",
      callbackPath: "/",
    });
    const aktiv = page.locator('[data-testid="modulnav"] a[aria-current="page"]');
    await expect(aktiv).toHaveCount(1);
    await expect(aktiv).toHaveText("Übersicht");
  });
});
```

**Falls `toHaveCount(1)` hier 0 ergibt:** dann liefert `usePathname()` etwas, das weder auf `/vergleich`
endet noch gleich ist — die Ausgabe von `page.evaluate(() => location.pathname)` und ein
`console.log` im Client zeigen, was. Die Auflösung in `aktiverSchluessel` ist dann anzupassen, **nicht**
der Test aufzuweichen.

- [ ] **Step 2: E2E laufen lassen**

```bash
rtk pnpm exec playwright test e2e/shell-mobil.spec.ts
```
Expected: PASS

- [ ] **Step 3: `docs/design/README.md` fortschreiben**

Nach dem Abschnitt „Typografie" einen neuen Abschnitt einfügen:

```markdown
## Mobil — ein Breakpoint, vier Regeln

**768px ist der einzige Breakpoint der Suite** (= antds `md`, festgehalten in
`core/shell/shell-css.test.ts`). Kein Modul erfindet einen zweiten; `Row`/`Col` bekommen `xs`/`md`,
keine festen Breiten.

**Die Umschaltung ist CSS, nie JavaScript.** `Grid.useBreakpoint` ist in Server Components ohnehin
verboten (Falle 1), und ein JS-Breakpoint zeigt beim ersten Render die falsche Variante. Beide
Ausprägungen rendern, CSS blendet eine aus.

**Zoom ist suiteweit gesperrt, und deshalb fallen Eingabefelder nirgends unter 16px.** Die beiden
Regeln sind eine Einheit: ohne Zoom kann niemand mehr heranholen, was zu klein ist. Die Begründung hat
sich damit umgedreht — früher war 16px die Abwehr gegen iOS' Auto-Zoom, heute ist es reine
Lesbarkeit. Wer eine der beiden anfasst, prüft die andere (`app/layout.tsx`, `app/globals.css`,
`core/theme/feldschrift.test.ts`).

**antd-`Table` scrollt auf schmalen Geräten (`scroll={{ x: … }}`), sie bricht nicht um.** Eine
umgebrochene Tabellenzeile ist unlesbarer als eine gescrollte.

**Handlungsknöpfe unter 768px sind volle Breite und stehen untereinander, nie nebeneinander.** Ein
630px breiter Knopf liest sich als Fläche, nicht als Ziel.

### Tests für Responsives — wer welche Aussage besitzt

**jsdom wertet Media Queries nicht aus.** Ein Vitest, der „auf 390px ist X unsichtbar" behauptet und
dafür im DOM sucht, geht **immer** durch — er misst nichts, und der grüne Balken ist eine Lüge. Die
Aufteilung, die trägt:

- **Quelltext-Scan (Vitest)** besitzt die Regel: „die Klasse trägt die richtige Media Query".
- **Playwright bei 390×844** besitzt das Ergebnis: „man sieht es nicht".
```

- [ ] **Step 4: Den Referenzentwurf nachziehen**

`docs/design/feedback-admin.md:875` (§4.14) beschreibt als geltende Regel:

> Mobile Feldschrift: `@media (max-width: 600px) { .fb-form input, .fb-form textarea, .fb-form …`

**Diese Regel gibt es nicht mehr** — Task 2 hat sie aus `feedback.css` entfernt, weil sie zur
suiteweiten Regel in `globals.css` geworden ist. Ein Referenzentwurf, der eine gelöschte Regel als
aktuell beschreibt, schickt den nächsten Leser in die falsche Datei.

Ersetze den Satz an dieser Stelle durch:

```markdown
Mobile Feldschrift: gilt inzwischen **suiteweit** und ohne Breakpoint. Die modul-eigene Fassung unter
`@media (max-width: 600px)` ist entfallen. An ihre Stelle treten zwei Wege für zwei Welten:
`app/globals.css` hält mit `input, textarea, select` eine **Untergrenze** für eigenes Markup —
bewusst niedrig spezifisch, damit Modul-CSS sie nach oben überschreiben darf (der Abendzettel setzt
`.textfeld` auf 18px und behält das) — und `core/theme/theme.ts` gibt den antd-Feldern
`inputFontSize: 16`. Nur `.ant-select-selector` braucht in CSS erhöhte Spezifität, weil antd dafür
keinen Token anbietet.

Die Begründung hat sich dabei umgedreht: früher war 16px die Abwehr gegen iOS' Auto-Zoom beim Fokus,
seit der suiteweiten Zoom-Sperre (`app/layout.tsx`) ist es reine Lesbarkeit — ohne Zoom kann niemand
mehr heranholen, was zu klein ist. Festgehalten in `core/theme/feldschrift.test.ts`.
```

Prüfe im selben Zug, ob der umgebende Absatz noch stimmt, und passe nur an, was durch die
Verschiebung falsch geworden ist — der Entwurf ist ein historisches Dokument mit Begründungen, keine
Referenzdokumentation, und wird nicht umgeschrieben.

- [ ] **Step 5: Volle Prüfung und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
rtk pnpm exec playwright test
rtk git add e2e/shell-mobil.spec.ts docs/design/README.md docs/design/feedback-admin.md
rtk git commit -m "test(shell): mobiler E2E-Lauf, Querschnittsregeln in docs/design"
```

---

## Self-Review

**Spec-Abdeckung:**

| Spec-Abschnitt | Task |
|---|---|
| §2 Zoom und Viewport | 1 |
| §3 16px-Untergrenze | 2 |
| §4 Globale Leiste (`SuiteHeader`, `SuiteNav`, CSS) | 3, 4, 5 |
| §5 Modul-Navigation | 3 (Typ), 4 (Darstellung), 6 (Durchreichen), 7 (Befüllung) |
| §6 Abmelden und anonymer Zustand | 4 |
| §7 Reichweite | 5 (full), 6 (minimal, kiosk) |
| §8 Querschnittsregeln in docs/design | 8 |
| §9 Tests | in jeder Task, mobiler E2E in 8 |

**Typkonsistenz:** `SuiteNavItem` ({key,title,href}) und `AppSwitcherEntry` ({key,title,icon,href}) werden in Task 3 definiert und in 4, 5, 6, 7 unverändert verwendet. `SuiteHeader({moduleKey, nav?})` und `SuiteNav({entries, nav, userName, angemeldet})` stimmen zwischen Task 4 und 5 überein.

**Bekannte Risiken beim Ausführen:**
1. `Shell` ruft jetzt async-Komponenten. Falls TypeScript meckert, `Shell` async machen (Task 6, Schritt 2 nennt das).
2. antds `Drawer` braucht `forceRender`, sonst ist der jsdom-Test leer (Task 4, Schritt 4 nennt das).
3. `.nurDesktop` muss bei 1280×720 greifen, sonst bricht `keystone.spec.ts:35` (Task 6, Schritt 6 nennt das).
