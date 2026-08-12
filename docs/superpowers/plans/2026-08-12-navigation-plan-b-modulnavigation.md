# Plan B — Modul-Navigation mit Abschnitten

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die fünfzehn gleichrangigen Einträge der Lagerbuch-Verwaltung, die heute als umbrechende Wortkette unter der Kopfzeile stehen, werden eine Seitenleiste mit benannten Abschnitten — ohne dass Portal, Feedback und Dateien sich um eine Zeile ändern.

**Architecture:** `SuiteNavItem` bekommt ein **optionales** Feld `abschnitt`. Die Liste bleibt flach, `aktiverEintrag` bleibt unberührt, Gruppierung ist reine Darstellung. Trägt mindestens ein Eintrag einen Abschnitt, rendert `FullShell` eine Seitenleiste statt der zweiten Kopfzeile; sonst bleibt alles wie heute.

**Tech Stack:** Next.js 16 (App Router, RSC) · antd 6.5.3 · Vitest (jsdom) · Playwright

**Spec:** `docs/superpowers/specs/2026-08-12-navigation-redesign-design.md` §5

**Voraussetzung:** Plan A ist abgenommen — dieser Plan setzt auf der geräumten Kopfzeile auf.

## Global Constraints

Identisch zu Plan A. Kurzfassung, die hier scharf wird:

- **Kein Compound-Zugriff auf antd in einer Server Component.** `Sider` deshalb als tiefer Named-Import `antd/es/layout/Sider` — Pfad gegen antd 6.5.3 geprüft, die Datei liegt neben `layout.js`, aus dem `Header` und `Content` bereits kommen. `Layout.Sider` als Property-Zugriff ergäbe `undefined` und HTTP 500.
- **Ein WERT aus einem `"use client"`-Modul kommt in einer Server Component nicht an.** `LAGERBUCH_NAV` und die neue Gruppierungsfunktion liegen deshalb in Modulen **ohne** `"use client"`.
- **`@ant-design/icons` niemals in einer Server Component.** Die Modul-Navigation trägt bewusst keine Icons — das bleibt so.
- **`--ant-*` sind nicht global**, eigenes Markup sieht sie nicht, und der Fehler ist still.
- **Ein einziger Breakpoint: `@media (min-width: 768px)`.** Kein `Grid.useBreakpoint`.
- **`size` auf Bedienelementen nicht setzen.**
- **Alle Befehle mit `rtk` präfixen**, auch in Ketten mit `&&`.
- **Sprache:** Deutsch mit korrekten Umlauten.
- **DOM-Tests über** `src/app/m/qr/_lib/test-dom.tsx`.

## Dateiübersicht

**Neu:**

| Datei | Verantwortung |
|---|---|
| `src/core/shell/navAbschnitte.ts` | Gruppierung einer flachen Nav-Liste nach `abschnitt` — Server-Modul, ohne `"use client"` |
| `src/core/shell/navAbschnitte.test.ts` | Gruppierung, Reihenfolge, `hatAbschnitte`, und der Riegel „Abschnitte nur in full-Shell" |
| `src/core/shell/Modulleiste.tsx` | Die Seitenleiste als Client-Insel (Aktivmarkierung braucht `usePathname`) |
| `src/core/shell/Modulleiste.test.tsx` | Abschnittsüberschriften, Aktivmarkierung, Drawer-Gleichlauf |
| `e2e/modulnavigation.spec.ts` | Leiste ab 768px, Drawer darunter, Aktivmarkierung am laufenden Server |

**Geändert:** `src/core/shell/types.ts` · `SuiteHeader.tsx` · `SuiteNav.tsx` · `FullShell.tsx` · `shell.module.css` · `shell-css.test.ts` · `src/app/m/lagerbuch/_lib/nav.ts`

---

### Task 1: Das optionale Feld und die Gruppierung

Reine Logik, ohne Rendering. Der Kern der Entscheidung aus §5.1: **die Liste bleibt flach.**

**Files:**
- Modify: `src/core/shell/types.ts`
- Create: `src/core/shell/navAbschnitte.ts`
- Test: `src/core/shell/navAbschnitte.test.ts`

**Interfaces:**
- Consumes: `SuiteNavItem` aus `@/core/shell/types`, `MODULES` aus `@/core/registry`
- Produces:
  - `SuiteNavItem.abschnitt?: string`
  - `interface NavAbschnitt { titel: string | null; items: SuiteNavItem[] }`
  - `function hatAbschnitte(nav: SuiteNavItem[]): boolean`
  - `function gruppiereNav(nav: SuiteNavItem[]): NavAbschnitt[]`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Datei `src/core/shell/navAbschnitte.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { gruppiereNav, hatAbschnitte } from "@/core/shell/navAbschnitte";
import type { SuiteNavItem } from "@/core/shell/types";

const OHNE: SuiteNavItem[] = [
  { key: "start", title: "Freigaben", href: "/" },
  { key: "post", title: "Posteingang", href: "/posteingang" },
];

const MIT: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung" },
  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", abschnitt: "Bestand" },
  { key: "journal", title: "Journal", href: "/verwaltung/journal", abschnitt: "Protokoll" },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", abschnitt: "Bestand" },
];

describe("hatAbschnitte", () => {
  it("ist falsch fuer eine flache Liste und wahr, sobald EIN Eintrag einen Abschnitt traegt", () => {
    expect(hatAbschnitte(OHNE)).toBe(false);
    expect(hatAbschnitte(MIT)).toBe(true);
    expect(hatAbschnitte([])).toBe(false);
  });

  it("wertet Leerraum nicht als Abschnitt", () => {
    // Sonst kippte die ganze Navigation in die Seitenleiste, wegen eines
    // Leerzeichens — und die Ueberschrift waere unsichtbar.
    expect(hatAbschnitte([{ key: "a", title: "A", href: "/a", abschnitt: "  " }])).toBe(false);
  });
});

describe("gruppiereNav", () => {
  it("stellt Eintraege ohne Abschnitt voran, vor jeder Ueberschrift", () => {
    expect(gruppiereNav(MIT).map((g) => g.titel)).toEqual([null, "Bestand", "Protokoll"]);
    expect(gruppiereNav(MIT)[0].items.map((i) => i.key)).toEqual(["uebersicht"]);
  });

  it("ordnet Abschnitte nach erstem Auftreten, nicht alphabetisch", () => {
    // „Protokoll" steht im Quell-Array vor dem zweiten „Bestand"-Eintrag und
    // trotzdem dahinter: die Reihenfolge gehoert dem Abschnitt, nicht dem
    // einzelnen Eintrag.
    const bestand = gruppiereNav(MIT).find((g) => g.titel === "Bestand");
    expect(bestand?.items.map((i) => i.key)).toEqual(["artikel", "verfall"]);
  });

  it("liefert fuer eine flache Liste genau eine Gruppe ohne Titel", () => {
    expect(gruppiereNav(OHNE)).toEqual([{ titel: null, items: OHNE }]);
  });

  it("liefert fuer eine leere Liste nichts, statt einer leeren Gruppe", () => {
    expect(gruppiereNav([])).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
rtk pnpm vitest run src/core/shell/navAbschnitte.test.ts
```

Erwartet: FAIL — Modul nicht auflösbar.

- [ ] **Schritt 3: Das Feld ergänzen**

In `src/core/shell/types.ts` an `SuiteNavItem`:

```ts
  /**
   * Ueberschrift, unter der dieser Eintrag steht. FEHLT SIE UEBERALL, bleibt es
   * die Zeile von heute — Portal, Feedback und Dateien aendern sich damit um
   * null Zeilen.
   *
   * Ein OPTIONALES FELD und bewusst keine verschachtelte Struktur
   * (`{ titel, items[] }`): die haette `aktiverEintrag` flach machen lassen, was
   * der Aufrufer schachtelt, dem Drawer einen zweiten Zweig gegeben und die
   * Quelltext-Zusicherung in `lagerbuch/_ui/VerwaltungsRahmen.test.tsx:303`
   * gebrochen (`typ: "SuiteNavItem[]"`). So bleibt die Liste flach und
   * Gruppierung reine Darstellung.
   */
  abschnitt?: string;
```

- [ ] **Schritt 4: Die Gruppierung schreiben**

Datei `src/core/shell/navAbschnitte.ts`:

```ts
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE FORM FOLGT DEN DATEN, NICHT EINEM SCHWELLENWERT.
 *
 * KEIN `"use client"`: `SuiteHeader` und `FullShell` sind Server Components und
 * lesen `hatAbschnitte`. Ein `"use client"` hier ergaebe dort eine
 * Client-Referenz statt der Funktion — HTTP 500, das kein Gate sieht
 * (`docs/design/README.md`, Falle 6).
 *
 * Warum kein Schwellenwert auf der Anzahl („ab zehn Eintraegen eine Leiste"):
 * das waere eine Zahl, die niemand begruenden kann und die bei elf anders
 * aussieht als bei zehn. Und warum kein zusaetzliches Prop am `Shell`: das
 * erlaubte zwei Modulen, sich bei gleicher Datenlage verschieden zu verhalten.
 */
export interface NavAbschnitt {
  /** `null` = die Eintraege VOR der ersten Ueberschrift. */
  titel: string | null;
  items: SuiteNavItem[];
}

export function hatAbschnitte(nav: SuiteNavItem[]): boolean {
  return nav.some((e) => (e.abschnitt?.trim() ?? "") !== "");
}

/**
 * Reihenfolge der Abschnitte = Reihenfolge ihres ersten Auftretens. Eine
 * alphabetische Sortierung waere eine zweite, unsichtbare Entscheidung ueber
 * etwas, das der Aufrufer schon getroffen hat.
 */
export function gruppiereNav(nav: SuiteNavItem[]): NavAbschnitt[] {
  const gruppen: NavAbschnitt[] = [];
  const nachTitel = new Map<string | null, NavAbschnitt>();

  for (const eintrag of nav) {
    const titel = eintrag.abschnitt?.trim() ? eintrag.abschnitt : null;
    const vorhanden = nachTitel.get(titel);
    if (vorhanden) {
      vorhanden.items.push(eintrag);
      continue;
    }
    const gruppe: NavAbschnitt = { titel, items: [eintrag] };
    nachTitel.set(titel, gruppe);
    gruppen.push(gruppe);
  }

  // Die titellose Gruppe nach vorn — sie steht vor jeder Ueberschrift, egal wo
  // ihre Eintraege im Quell-Array lagen.
  return gruppen.sort((a, b) => (a.titel === null ? -1 : b.titel === null ? 1 : 0));
}
```

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

```bash
rtk pnpm vitest run src/core/shell/navAbschnitte.test.ts
```

Erwartet: PASS, 6 Tests.

- [ ] **Schritt 6: Commit**

```bash
rtk git add src/core/shell/types.ts src/core/shell/navAbschnitte.ts src/core/shell/navAbschnitte.test.ts && rtk git commit -m "feat(shell): optionales abschnitt-Feld haelt die Nav-Liste flach"
```

---

### Task 2: Die Seitenleiste

Client-Insel, weil die Aktivmarkierung `usePathname()` braucht. **`aktiverEintrag` wird nicht angefasst** — es arbeitet weiter auf der flachen Liste.

**Files:**
- Create: `src/core/shell/Modulleiste.tsx`
- Test: `src/core/shell/Modulleiste.test.tsx`
- Modify: `src/core/shell/SuiteNav.tsx` (Drawer-Gruppierung), `src/core/shell/SuiteHeader.tsx`, `src/core/shell/FullShell.tsx`, `src/core/shell/shell.module.css`, `src/core/shell/shell-css.test.ts`

**Interfaces:**
- Consumes: `gruppiereNav`, `hatAbschnitte` (Task 1), `aktiverEintrag` aus `@/core/shell/SuiteNav`
- Produces: `function Modulleiste({ nav }: { nav: SuiteNavItem[] })`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Datei `src/core/shell/Modulleiste.test.tsx`. Das Mocken von `usePathname` folgt der Bauform, die `SuiteNav.test.tsx` bereits benutzt — dort nachsehen und übernehmen, nicht neu erfinden.

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import type { SuiteNavItem } from "@/core/shell/types";

const pfad = vi.hoisted(() => ({ wert: "/verwaltung" }));
vi.mock("next/navigation", () => ({ usePathname: () => pfad.wert }));

const { Modulleiste } = await import("@/core/shell/Modulleiste");

const NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung" },
  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", abschnitt: "Bestand" },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", abschnitt: "Bestand" },
  { key: "journal", title: "Journal", href: "/verwaltung/journal", abschnitt: "Protokoll" },
];

afterEach(async () => {
  await unmount();
  pfad.wert = "/verwaltung";
});

describe("Modulleiste", () => {
  it("traegt die Abschnittsueberschriften in der Reihenfolge des ersten Auftretens", async () => {
    await mount(<Modulleiste nav={NAV} />);
    expect(queryAll('[data-testid="nav-abschnitt"]').map((a) => a.textContent)).toEqual([
      "Bestand",
      "Protokoll",
    ]);
  });

  it("stellt den Eintrag ohne Abschnitt vor die erste Ueberschrift", async () => {
    await mount(<Modulleiste nav={NAV} />);
    const kinder = queryAll('[data-testid="nav-abschnitt"], [data-testid="nav-link"]');
    expect(kinder[0].textContent).toBe("Übersicht");
  });

  it("markiert die aufgerufene Seite als page", async () => {
    pfad.wert = "/verwaltung/artikel";
    await mount(<Modulleiste nav={NAV} />);
    const aktiv = queryAll('[data-testid="nav-link"]').filter((l) => l.hasAttribute("aria-current"));
    expect(aktiv.length).toBe(1);
    expect(aktiv[0].getAttribute("aria-current")).toBe("page");
    expect(aktiv[0].textContent).toBe("Artikel");
  });

  it("benennt sich fuer Screenreader", async () => {
    await mount(<Modulleiste nav={NAV} />);
    expect(query('[data-testid="modulleiste"]').getAttribute("aria-label")).toBe(
      "Modulnavigation",
    );
  });

  it("rendert nichts bei leerer Navigation", async () => {
    await mount(<Modulleiste nav={[]} />);
    expect(queryAll('[data-testid="modulleiste"]').length).toBe(0);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
rtk pnpm vitest run src/core/shell/Modulleiste.test.tsx
```

Erwartet: FAIL — Modul nicht auflösbar.

- [ ] **Schritt 3: Die gemeinsame Renderfunktion aus `SuiteNav` heben**

`navLinks` in `SuiteNav.tsx` bekommt eine Schwester, die gruppiert rendert, und beide teilen sich die Aktivmarkierung. `navLinks` bleibt exportiert (Drawer und `Modulnav` benutzen es weiter) und bekommt zusätzlich `data-testid="nav-link"`, damit beide Formen gleich adressierbar sind.

In `SuiteNav.tsx`, an `navLinks` anschließend:

```tsx
/**
 * Dieselben Links, nur mit Ueberschriften dazwischen — geteilt zwischen der
 * Seitenleiste und dem Drawer. Eine Funktion statt zweier Abschriften, weil die
 * Aktivmarkierung an beiden Stellen dieselbe Aussage treffen muss.
 *
 * `aktiverEintrag` bekommt die FLACHE Liste und bleibt damit unveraendert: die
 * Gruppierung ist Darstellung, nicht Bedeutung.
 */
export function navGruppen(nav: SuiteNavItem[], pfad: string) {
  return gruppiereNav(nav).map((gruppe) => (
    <div key={gruppe.titel ?? "__ohne"} className={s.navGruppe}>
      {gruppe.titel ? (
        <div data-testid="nav-abschnitt" className={s.navAbschnitt}>
          {gruppe.titel}
        </div>
      ) : null}
      {navLinks(gruppe.items, pfad, nav)}
    </div>
  ));
}
```

`navLinks` bekommt dafür einen dritten, optionalen Parameter — die **vollständige** Liste, gegen die `aktiverEintrag` auflöst:

```tsx
function navLinks(sichtbar: SuiteNavItem[], pfad: string, ganze: SuiteNavItem[] = sichtbar) {
  const aktiv = aktiverEintrag(pfad, ganze);
  return sichtbar.map((eintrag) => (
    <Link
      key={eintrag.key}
      href={eintrag.href}
      data-testid="nav-link"
      className={s.navLink}
      aria-current={
        aktiv?.schluessel === eintrag.key ? (aktiv.genau ? "page" : "true") : undefined
      }
    >
      {eintrag.title}
    </Link>
  ));
}
```

Der dritte Parameter ist nicht Zierrat: `aktiverEintrag` sucht unter anderem den Wurzel-Fallback, und der stünde in einer anderen Gruppe als der gerade gerenderten. Ohne ihn markierte jede Gruppe für sich — und damit womöglich mehrere gleichzeitig.

- [ ] **Schritt 4: Die Seitenleiste schreiben**

Datei `src/core/shell/Modulleiste.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";

import { navGruppen } from "@/core/shell/SuiteNav";
import type { SuiteNavItem } from "@/core/shell/types";
import s from "./shell.module.css";

/**
 * DIE MODULNAVIGATION ALS SEITENLEISTE — fuer Module, deren Eintraege Abschnitte
 * tragen.
 *
 * Die Lagerbuch-Verwaltung hatte fuenfzehn gleichrangige Eintraege in einer
 * umbrechenden Zeile; „BZ-Kontrolle" stand dabei zweizeilig zwischen „Checks"
 * und „Sauerstoff". Eine Zeile skaliert bis etwa fuenf Ziele, danach ist sie
 * eine Aufzaehlung ohne Ordnung.
 *
 * Client-Komponente, weil die Aktivmarkierung `usePathname()` braucht — dieselbe
 * Begruendung wie bei `Modulnav`. `aktiverEintrag` selbst ist unveraendert: es
 * bekommt die flache Liste, die Gruppierung ist reine Darstellung.
 *
 * KEIN antd `Menu`: das braechte eigene Aktivlogik, eigenes Markup und
 * zusaetzliches Client-Buendel, um eine Funktion zu ersetzen, die geprueft ist
 * und deren drei Fallen (Rewrite, Wurzel-Fallback, `page` vs. `true`) an
 * `aktiverEintrag` ausgeschrieben stehen.
 */
export function Modulleiste({ nav }: { nav: SuiteNavItem[] }) {
  const pfad = usePathname();
  if (nav.length === 0) return null;
  return (
    <nav aria-label="Modulnavigation" data-testid="modulleiste" className={s.modulleiste}>
      {navGruppen(nav, pfad)}
    </nav>
  );
}
```

- [ ] **Schritt 5: Die Shell verdrahten**

In `src/core/shell/SuiteHeader.tsx` die zweite Zeile nur noch für flache Navigationen rendern:

```tsx
{/* Zweite Zeile NUR ohne Abschnitte. Traegt die Navigation Abschnitte, steht
    sie als Seitenleiste in `FullShell` — beides gleichzeitig waere dieselbe
    Aussage an zwei Stellen, mit zwei Aktivmarkierungen. */}
{hatAbschnitte(nav) ? null : <Modulnav nav={nav} />}
```

In `src/core/shell/FullShell.tsx`:

```tsx
import { Layout } from "antd";
// Siehe SuiteHeader.tsx: direkte Named-Imports aus dem tiefen Pfad, nicht
// `Layout.Content` / `Layout.Sider` — Property-Zugriffe auf antd-Compounds
// ergeben in einer Server Component `undefined` und HTTP 500. `Sider` liegt in
// einer eigenen Datei neben `layout.js` (antd 6.5.3, nachgesehen).
import { Content } from "antd/es/layout/layout";
import Sider from "antd/es/layout/Sider";

import { SuiteHeader } from "@/core/shell/SuiteHeader";
import { Modulleiste } from "@/core/shell/Modulleiste";
import { hatAbschnitte } from "@/core/shell/navAbschnitte";
import type { SuiteNavItem } from "@/core/shell/types";
import { SPACE } from "@/core/theme/tokens";

export async function FullShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  const mitLeiste = hatAbschnitte(nav ?? []);
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <SuiteHeader moduleKey={moduleKey} nav={nav} />
      {mitLeiste ? (
        <Layout>
          {/*
           * `breakpoint`/`collapsedWidth` bewusst NICHT gesetzt: antds
           * Sider-Breakpoints laufen ueber JS und zeigen beim ersten Render die
           * falsche Variante. Die Umschaltung macht `shell.module.css` mit dem
           * einen Suite-Breakpoint — unter 768px steht die Leiste gar nicht da,
           * die Navigation liegt dort im Drawer.
           */}
          <Sider width={240} theme="light" className={s.sider}>
            <Modulleiste nav={nav ?? []} />
          </Sider>
          <Content style={{ padding: SPACE.lg }}>{children}</Content>
        </Layout>
      ) : (
        <Content style={{ padding: SPACE.lg }}>{children}</Content>
      )}
    </Layout>
  );
}
```

Dazu `import s from "./shell.module.css";`.

- [ ] **Schritt 6: Den Drawer gruppieren**

In `SuiteNav.tsx` im Drawer `drawerNavLinks` durch `navGruppen(nav, pfad)` ersetzen. Damit trägt der Drawer dieselben Überschriften wie die Leiste — für flache Navigationen ändert sich nichts, weil `gruppiereNav` dort genau eine titellose Gruppe liefert.

- [ ] **Schritt 7: Das CSS ergänzen**

An `shell.module.css`:

```css
/*
 * DIE SEITENLEISTE. Unter 768px steht sie NICHT da — die Navigation liegt dort
 * im Drawer. Die Umschaltung laeuft ueber Media Queries und nicht ueber antds
 * `breakpoint`-Prop am Sider: das ist JS und zeigt beim ersten Render die
 * falsche Variante.
 *
 * `.navLink` gilt hier weiter, samt seiner `[aria-current]`-Markierung — sie ist
 * DIESER Navigation zugeordnet. Der App-Umschalter benutzt bewusst eine eigene
 * Klasse (`.appEintrag`), sonst traege sein aktiver Eintrag dieselbe
 * Hervorhebung.
 */
.sider {
  display: none;
}

.modulleiste {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 8px;
}

.navGruppe {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.navGruppe + .navGruppe {
  margin-block-start: 16px;
}

.navAbschnitt {
  padding: 4px 9px;
  font-size: 12px;
  opacity: 0.65;
}

@media (min-width: 768px) {
  .sider {
    display: block;
    position: sticky;
    /* Unter der 64px-Kopfzeile; `headerHeight` bleibt unveraendert. */
    inset-block-start: 64px;
    block-size: calc(100vh - 64px);
    overflow-y: auto;
  }
}
```

Die Leiste ist in `.navGruppe` bewusst dieselbe Struktur wie im Drawer — eine Regel für beide.

- [ ] **Schritt 8: `shell-css.test.ts` nachziehen**

Die Datei zuerst lesen — sie prüft den CSS-Quelltext und hat eine eigene Bauform. Drei neue
Zusicherungen in dieser Bauform ergänzen:

1. `.sider` steht in der Basis-Regel auf `display: none` — die Leiste darf mobil nicht bloß
   schmal werden, sie darf gar nicht da sein.
2. Innerhalb von `@media (min-width: 768px)` steht `.sider` auf `display: block` und
   `position: sticky` mit `inset-block-start: 64px` — derselbe Wert wie `headerHeight`. Weicht er ab,
   klebt die Leiste unter oder über der Kopfzeile, und `build` sieht das nicht.
3. `.navAbschnitt` existiert.

`.navLink[aria-current]` bleibt **unverändert** bestehen und wird nicht angetastet: die
Unterstreichung gehört der Modulnavigation, und dass der App-Umschalter aus Plan A sie nicht erbt,
ist genau der Grund für dessen eigene Klasse.

- [ ] **Schritt 9: Prüfen**

```bash
rtk pnpm vitest run && rtk pnpm typecheck && rtk pnpm lint && rtk pnpm build
```

Erwartet: alles grün — `VerwaltungsRahmen.test.tsx:303` eingeschlossen, weil `SuiteNavItem[]` unverändert ist.

- [ ] **Schritt 10: Echter Abruf**

Kein zweiter `pnpm dev` darf laufen. Dann:

```bash
rtk pnpm dev
```

Und in einem zweiten Terminal gegen ein Modul **ohne** Abschnitte, das den unveränderten Zweig belegt:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://portal.localtest.me:3000/
```

Erwartet: kein `500`. Der `Sider`-Importpfad ist genau hier prüfbar und sonst nirgends.

- [ ] **Schritt 11: Commit**

```bash
rtk git add -A src/core/shell && rtk git commit -m "feat(shell): Seitenleiste, wo die Navigation Abschnitte traegt"
```

---

### Task 3: Die Abschnitte des Lagerbuchs

Bis hierher hat sich für keine bestehende Seite etwas geändert — die Leiste existiert, wird aber von niemandem benutzt. Diese Aufgabe schaltet sie ein.

**Files:**
- Modify: `src/app/m/lagerbuch/_lib/nav.ts`
- Modify: `src/core/shell/navAbschnitte.test.ts` (Riegel)

**Interfaces:**
- Consumes: `SuiteNavItem.abschnitt` (Task 1)

- [ ] **Schritt 1: Den Riegel schreiben, bevor die Abschnitte kommen**

Die Seitenleiste lebt in `FullShell`. Ein `minimal`-Shell-Modul, das Abschnitte vergibt, bekäme sie **still nicht** — die Einträge stünden dann in der zweiten Zeile, ohne Überschriften, und niemand fände den Grund. An `src/core/shell/navAbschnitte.test.ts` anhängen:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { MODULES } from "@/core/registry";

/*
 * Die Seitenleiste haengt in `FullShell`. Vergaebe ein `minimal`- oder
 * `kiosk`-Modul Abschnitte, verschwaenden sie lautlos: die Eintraege landeten in
 * der zweiten Zeile, ohne Ueberschriften. Kein Fehler, kein Log — nur eine
 * Gliederung, die niemand sieht.
 */
describe("Abschnitte gibt es nur in der full-Shell", () => {
  it("kein minimal- oder kiosk-Modul vergibt abschnitt in seiner Nav", () => {
    const nichtFull = MODULES.filter((m) => m.shell !== "full").map((m) => m.key);
    for (const key of nichtFull) {
      const verzeichnis = `src/app/m/${key}`;
      let dateien: string[];
      try {
        dateien = readdirSync(join(verzeichnis, "_lib"));
      } catch {
        continue; // Modul ohne _lib — nichts zu pruefen.
      }
      for (const datei of dateien.filter((d) => /nav\.tsx?$/.test(d))) {
        const quelle = readFileSync(join(verzeichnis, "_lib", datei), "utf8");
        expect(quelle, `${key}/_lib/${datei} vergibt abschnitt, bekommt aber keine Leiste`)
          .not.toMatch(/abschnitt\s*:/);
      }
    }
  });
});
```

- [ ] **Schritt 2: Riegel laufen lassen**

```bash
rtk pnpm vitest run src/core/shell/navAbschnitte.test.ts
```

Erwartet: PASS — heute vergibt kein Modul Abschnitte.

- [ ] **Schritt 3: Die Abschnitte vergeben**

`src/app/m/lagerbuch/_lib/nav.ts` ersetzen. Die Zuordnung folgt `2026-08-03-lagerbuch-modul-design.md`: „Vorlagen" sind Fahrzeug-Soll-Positionen und gehören zu den Fahrzeugen, „Checks" sind die durchgeführten Fahrzeug-Checks.

```ts
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Modulnavigation der Verwaltung. Dieser Wert wird von einer Server
 * Component gelesen und liegt deshalb bewusst in `_lib/` ohne "use client".
 * Die hrefs tragen die aeuszere Pfadform, damit `aktiverEintrag` sie sowohl
 * gegen aeuszere als auch gegen umgeschriebene Pfade per Suffix aufloesen kann.
 *
 * Es gibt absichtlich keinen `/`-Eintrag: Der Wurzel-Fallback wuerde sonst auf
 * nicht zugeordneten Detailseiten eine falsche aktive Navigation anzeigen.
 *
 * ABSCHNITTE, UND DAMIT EINE SEITENLEISTE STATT EINER ZEILE. Fuenfzehn
 * gleichrangige Eintraege brachen in der zweiten Kopfzeile um; „BZ-Kontrolle"
 * stand zweizeilig mitten in der Reihe. Das Feld ist optional — Portal,
 * Feedback und Dateien vergeben es nicht und behalten ihre Zeile
 * (`core/shell/navAbschnitte.ts`).
 *
 * „Uebersicht" traegt bewusst KEINEN Abschnitt und steht damit vor der ersten
 * Ueberschrift.
 */
export const LAGERBUCH_NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung" },

  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", abschnitt: "Bestand" },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", abschnitt: "Bestand" },
  { key: "inventur", title: "Inventur", href: "/verwaltung/inventur", abschnitt: "Bestand" },
  { key: "bestellung", title: "Bestellung", href: "/verwaltung/bestellung", abschnitt: "Bestand" },

  { key: "fahrzeuge", title: "Fahrzeuge", href: "/verwaltung/fahrzeuge", abschnitt: "Fahrzeuge & Geräte" },
  { key: "vorlagen", title: "Vorlagen", href: "/verwaltung/vorlagen", abschnitt: "Fahrzeuge & Geräte" },
  { key: "geraete", title: "Geräte", href: "/verwaltung/geraete", abschnitt: "Fahrzeuge & Geräte" },
  { key: "sauerstoff", title: "Sauerstoff", href: "/verwaltung/sauerstoff", abschnitt: "Fahrzeuge & Geräte" },

  { key: "checks", title: "Checks", href: "/verwaltung/checks", abschnitt: "Prüfungen" },
  { key: "bz", title: "BZ-Kontrolle", href: "/verwaltung/bz", abschnitt: "Prüfungen" },

  { key: "journal", title: "Journal", href: "/verwaltung/journal", abschnitt: "Protokoll" },

  { key: "etiketten", title: "Etiketten", href: "/verwaltung/etiketten", abschnitt: "Einrichtung" },
  { key: "tokens", title: "Zugangs-Codes", href: "/verwaltung/tokens", abschnitt: "Einrichtung" },
  { key: "import", title: "Import", href: "/verwaltung/import", abschnitt: "Einrichtung" },
];
```

Die Reihenfolge der Einträge ändert sich gegenüber heute — die Zuordnung ist fachlich und darf korrigiert werden; die Struktur bleibt davon unberührt. **Kein `key` wurde umbenannt**, damit bestehende Zusicherungen weiter greifen.

- [ ] **Schritt 4: Prüfen**

```bash
rtk pnpm vitest run && rtk pnpm typecheck && rtk pnpm lint && rtk pnpm build
```

Der Riegel aus Schritt 1 bleibt grün: `lagerbuch` hat `shell: "full"`.

- [ ] **Schritt 5: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/nav.ts src/core/shell/navAbschnitte.test.ts && rtk git commit -m "feat(lagerbuch): fuenfzehn Ziele bekommen fuenf Abschnitte und eine Seitenleiste"
```

---

### Task 4: End-to-End

**Files:**
- Create: `e2e/modulnavigation.spec.ts`

- [ ] **Schritt 1: Die Spec schreiben**

Datei `e2e/modulnavigation.spec.ts`. Der Zugang zur Lagerbuch-Verwaltung läuft über `lagerbuch_nutzer` (`adminGroups` in der Registry); die Bauform des Logins aus einer bestehenden Lagerbuch-Spec übernehmen.

```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

test("ab 768px steht die Navigation als Leiste mit Abschnitten", async ({ page }) => {
  await devLogin(page, {
    host: "lagerbuch.localtest.me",
    groups: "lagerbuch_nutzer",
    callbackPath: "/verwaltung",
  });

  const leiste = page.getByTestId("modulleiste");
  await expect(leiste).toBeVisible();
  await expect(leiste.getByTestId("nav-abschnitt")).toHaveText([
    "Bestand",
    "Fahrzeuge & Geräte",
    "Prüfungen",
    "Protokoll",
    "Einrichtung",
  ]);
  // Die zweite Kopfzeile entfaellt fuer dieses Modul — sonst staende dieselbe
  // Aussage zweimal, mit zwei Aktivmarkierungen.
  await expect(page.getByTestId("modulnav")).toHaveCount(0);
});

test("die Aktivmarkierung steht genau einmal und am richtigen Eintrag", async ({ page }) => {
  await devLogin(page, {
    host: "lagerbuch.localtest.me",
    groups: "lagerbuch_nutzer",
    callbackPath: "/verwaltung/import",
  });
  const leiste = page.getByTestId("modulleiste");
  await expect(leiste.locator("[aria-current]")).toHaveCount(1);
  await expect(leiste.locator("[aria-current]")).toHaveText("Import");
  await expect(leiste.locator("[aria-current]")).toHaveAttribute("aria-current", "page");
});

test("unter 768px liegt die Navigation im Drawer, mit denselben Abschnitten", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await devLogin(page, {
    host: "lagerbuch.localtest.me",
    groups: "lagerbuch_nutzer",
    callbackPath: "/verwaltung",
  });

  await expect(page.getByTestId("modulleiste")).toBeHidden();
  await page.getByTestId("menue-knopf").click();
  const drawer = page.getByTestId("suite-drawer");
  await expect(drawer.getByTestId("nav-abschnitt").first()).toHaveText("Bestand");
});

test("ein Modul ohne Abschnitte behaelt seine Zeile", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "", callbackPath: "/" });
  await expect(page.getByTestId("modulleiste")).toHaveCount(0);
});
```

- [ ] **Schritt 2: Laufen lassen**

```bash
rtk pnpm exec playwright test e2e/modulnavigation.spec.ts
```

Erwartet: 4 Tests grün. Der letzte belegt, dass Plan B für Module ohne Abschnitte wirklich folgenlos ist — und schlägt fehl, falls `hatAbschnitte` je auf „immer wahr" kippt.

- [ ] **Schritt 3: Die ganze Suite**

```bash
rtk pnpm exec playwright test
```

- [ ] **Schritt 4: Commit**

```bash
rtk git add e2e/modulnavigation.spec.ts && rtk git commit -m "test(e2e): Leiste, Drawer und die Zeile, die unveraendert bleibt"
```

---

## Abnahme von Plan B

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build && rtk pnpm exec playwright test
```

Dazu drei Dinge, die kein Tor sieht:

1. `curl` gegen `portal.localtest.me` (ohne Abschnitte) und `lagerbuch.localtest.me/verwaltung` (mit) — beide ohne `500`. Der `Sider`-Importpfad zeigt sich nur hier.
2. Die Lagerbuch-Verwaltung bei 1280px, 768px und 390px ansehen: keine seitwärts scrollende Seite, keine zweite Aktivmarkierung, kein doppelter Weg zur selben Seite.
3. Die fachliche Zuordnung der fünf Abschnitte gegenlesen — sie ist aus dem Modul-Entwurf abgeleitet, nicht aus dem Einsatz.
