# Plan A — Launcher, Portal, Grenze, Leerzustände

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Modulknopfreihe verschwindet aus der Kopfzeile; an ihre Stelle tritt ein App-Umschalter am Modultitel, der dieselbe gruppengefilterte Liste zeigt wie das Portal — Suite-Module und externe Dienste zusammen, mit einem Leerzustand, der einen Ansprechpartner nennt.

**Architecture:** Eine Merge-Funktion in `core/shell` führt zwei Quellen zusammen, die ihre Rechteprüfung je selbst behalten: `visibleSwitcherModules` (Registry) und `dienstEintraege` (die eine Funktion, die das Portal für `core` veröffentlicht). Das Ergebnis ist eine flache `LauncherEintrag[]`, die eine Client-Insel (`AppUmschalter`) als Popover und die Portal-Seite als Kachelraster rendert. Icons lösen ausschließlich in den Client-Inseln auf.

**Tech Stack:** Next.js 16 (App Router, RSC) · antd 6.5.3 · Drizzle + better-sqlite3 · Vitest (jsdom) · Playwright

**Spec:** `docs/superpowers/specs/2026-08-12-navigation-redesign-design.md`

## Global Constraints

Diese gelten für **jede** Aufgabe dieses Plans. Sie stammen aus `CLAUDE.md` und `docs/design/README.md`; keine davon findet `pnpm build`.

- **Kein Compound-Zugriff auf antd in einer Server Component.** Verboten: `Typography.*`, `Form.Item`, `Card.Meta`, `Input.TextArea`, `Layout.Header`, `Grid.useBreakpoint` … Ergebnis wäre `undefined` und HTTP 500. Tiefe Named-Imports statt dessen (`antd/es/layout/layout`). Sicher: `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag`.
- **`@ant-design/icons` niemals in einer Server Component**, auch nicht mittelbar über `@/core/shell/icons`. Der Import allein ergibt HTTP 500, den `typecheck`, `build` und Vitest **strukturell nicht sehen**. `src/core/shell/icons.test.ts` riegelt es repo-weit ab.
- **Ein WERT aus einem `"use client"`-Modul kommt in einer Server Component nicht an** — sie bekommt eine Client-Referenz, HTTP 500. Werte, die Server Components lesen, gehören in Module **ohne** `"use client"`.
- **`--ant-*`-CSS-Variablen sind nicht global.** Eigenes Markup sieht sie nicht, und der Fehler ist still. Eigene Variablen benutzen.
- **`colorError === colorPrimary === #c8000f`.** Ein `Alert type="error"` sieht aus wie eine Primäraktion. Der Leerzustand ist **keine** Störung und bekommt kein Rot.
- **`size` auf Bedienelementen gar nicht setzen.** `controlHeight` ist 56 und schon das richtige Touch-Maß; `size="large"` wäre 72px.
- **Ein einziger Breakpoint: `@media (min-width: 768px)`.** Kein `Grid.useBreakpoint`, kein JS-Breakpoint.
- **Alle Befehle mit `rtk` präfixen**, auch in Ketten mit `&&`.
- **Sprache:** Bezeichner, Kommentare und Oberflächentexte auf Deutsch, mit korrekten Umlauten.
- **Für DOM-Tests das bestehende Harness** `src/app/m/qr/_lib/test-dom.tsx` benutzen (`mount`, `unmount`, `query`, `queryAll`, `exists`, `fill`, `click`, `clickElement`). Kein zweites erfinden.

## Abweichung vom Entwurf, bewusst

§4 des Entwurfs sagt: „Mobil öffnet derselbe Auslöser keinen Popover, sondern den Drawer, gescrollt auf den Abschnitt Apps."

**Dieser Plan macht es anders:** der Umschalter öffnet auf **beiden** Größen sein eigenes Panel — ab 768px als Popover, darunter als vollbreite Fläche unter der Kopfzeile. Der Drawer hinter dem Menü-Knopf behält **nur** die Modul-Navigation.

Der Grund ist keine Geschmacksfrage: Auslöser und Drawer säßen sonst in zwei verschiedenen Client-Komponenten (`AppUmschalter` links, `SuiteNav` rechts) und müssten sich einen Öffnungszustand teilen. Das wäre entweder ein hochgezogener Zustand in einer neuen Klammer-Komponente oder ein Kontext — beides mehr Maschinerie, als die Sache wert ist. Für die bedienende Person ändert sich fast nichts: es öffnet sich eine Fläche mit Apps. Was besser wird: jeder der zwei Öffner besitzt genau eine Sache.

## Dateiübersicht

**Neu:**

| Datei | Verantwortung |
|---|---|
| `src/app/m/portal/_lib/launcher.ts` | Die eine Funktion, die das Portal für `core` veröffentlicht — Dienste als `LauncherEintrag` |
| `src/app/m/portal/_lib/launcher.test.ts` | Abbildung Dienst → Eintrag, rein geprüft |
| `src/core/shell/launcherEintraege.ts` | Merge beider Quellen; ersetzt `switcherEntries.ts` |
| `src/core/shell/launcherEintraege.test.ts` | Merge, Abschnittsreihenfolge, **Grenz-Scan** |
| `src/core/shell/AppUmschalter.tsx` | Client-Insel: Auslöser, Panel, Suche, Tastatur |
| `src/core/shell/AppUmschalter.test.tsx` | DOM-Verhalten über das qr-Harness |
| `src/app/m/portal/_lib/einstellungen.ts` | Schlüssel/Wert-Zugriff auf `portal_einstellungen` |
| `src/app/m/portal/_ui/DiensteRaster.tsx` | Client-Insel der Portal-Seite: Suche + Kacheln |
| `src/app/m/portal/_ui/DiensteRaster.test.tsx` | Filtern, Abschnitte, Leerzustand |
| `e2e/launcher.spec.ts` | Umschalter, leeres Portal, zwei Öffner auf Mobil |

**Geändert:** `src/core/shell/types.ts` · `SuiteHeader.tsx` · `SuiteNav.tsx` · `shell.module.css` · `SuiteNav.test.tsx` · `SuiteHeader.test.tsx` · `shell-css.test.ts` · `src/app/m/portal/page.tsx` · `admin/page.tsx` · `actions.ts` · `_db/schema.ts` · `e2e/keystone.spec.ts`

**Gelöscht:** `src/core/shell/switcherEntries.ts` · `src/core/shell/switcherEntries.test.ts`

---

### Task 1: Die Datenform und die Portal-Grenzfunktion

Das Portal bekommt eine einzige, benannte Öffnung nach `core`. Die Abbildung Dienst → Eintrag wird als **reine** Funktion gebaut, damit sie ohne Datenbank prüfbar ist; nur der dünne Wrapper darüber liest.

**Files:**
- Modify: `src/core/shell/types.ts`
- Create: `src/app/m/portal/_lib/launcher.ts`
- Test: `src/app/m/portal/_lib/launcher.test.ts`

**Interfaces:**
- Consumes: `Service` aus `@/app/m/portal/_db/schema`, `getVisibleServicesForUser` aus `@/app/m/portal/_lib/services`
- Produces:
  - `interface LauncherEintrag` (in `core/shell/types.ts`)
  - `const ABSCHNITT_WEITERE = "Weitere Dienste"`
  - `function dienstZuEintrag(dienst: Service): LauncherEintrag`
  - `async function dienstEintraege(groups: string[] | null): Promise<LauncherEintrag[]>`

- [ ] **Schritt 1: Die Datenform in `core/shell/types.ts` ergänzen**

`AppSwitcherEntry` bleibt vorerst stehen — `switcherEntries.ts` benutzt es noch und fällt erst in Task 2.

```ts
/**
 * Ein Eintrag der EINEN Einstiegsliste — Suite-Modul oder externer Dienst.
 * Beide Icon-Felder sind optional; der Umschalter faellt in dieser Reihenfolge
 * zurueck: `iconUrl` → `ICONS[icon]` → neutrales Link-Icon. Ein Union-Typ zwaenge
 * jede Aufrufstelle zu einer Fallunterscheidung, die genau diesen Rueckfall
 * nachbaut.
 */
export interface LauncherEintrag {
  /** Eindeutig ueber beide Quellen: Module tragen ihren Registry-Key, Dienste `dienst:<id>`. */
  key: string;
  title: string;
  beschreibung?: string;
  /** Schluessel der ICONS-Map — nur Suite-Module. Aufloesung NUR in Client-Inseln. */
  icon?: string;
  /** Bild-URL — nur externe Dienste. */
  iconUrl?: string | null;
  href: string;
  abschnitt: string;
  /** Oeffnet in neuem Tab (`services.openInNewTab`). */
  extern: boolean;
}
```

- [ ] **Schritt 2: Den fehlschlagenden Test schreiben**

Datei `src/app/m/portal/_lib/launcher.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dienstZuEintrag, ABSCHNITT_WEITERE } from "@/app/m/portal/_lib/launcher";
import type { Service } from "@/app/m/portal/_db/schema";

function dienst(teil: Partial<Service> = {}): Service {
  return {
    id: "abc123",
    slug: "nextcloud",
    name: "Nextcloud",
    description: "Dateiablage des Kreisverbands",
    url: "https://cloud.example.org",
    iconUrl: null,
    category: "Zusammenarbeit",
    tags: [],
    requiredGroups: [],
    isPublic: true,
    isActive: true,
    sortOrder: 0,
    openInNewTab: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...teil,
  } as Service;
}

describe("dienstZuEintrag", () => {
  it("bildet einen Dienst auf einen Launcher-Eintrag ab", () => {
    expect(dienstZuEintrag(dienst())).toEqual({
      key: "dienst:abc123",
      title: "Nextcloud",
      beschreibung: "Dateiablage des Kreisverbands",
      iconUrl: null,
      href: "https://cloud.example.org",
      abschnitt: "Zusammenarbeit",
      extern: true,
    });
  });

  // Der Schluessel traegt ein Praefix, weil Modul-Keys und Dienst-Ids in
  // DERSELBEN Liste stehen. Ein Dienst mit der id "portal" wuerde sonst den
  // React-Key des Portal-Moduls doppeln — und React zeigt bei doppelten Keys
  // nicht den zweiten Eintrag, sondern verwirft ihn still.
  it("praefixt den Schluessel, damit er nicht mit einem Modul-Key kollidiert", () => {
    expect(dienstZuEintrag(dienst({ id: "portal" })).key).toBe("dienst:portal");
  });

  it("ordnet Dienste ohne Kategorie einem Sammelabschnitt zu", () => {
    expect(dienstZuEintrag(dienst({ category: null })).abschnitt).toBe(ABSCHNITT_WEITERE);
    // Leerraum ist keine Kategorie — sonst entstuende ein Abschnitt mit
    // unsichtbarer Ueberschrift.
    expect(dienstZuEintrag(dienst({ category: "   " })).abschnitt).toBe(ABSCHNITT_WEITERE);
  });

  it("laesst eine leere Beschreibung weg, statt sie als leeren String zu fuehren", () => {
    // `description` ist NOT NULL DEFAULT "" — ohne diesen Zweig traegt jeder
    // Eintrag ohne Beschreibung eine leere Zeile unter dem Namen.
    expect(dienstZuEintrag(dienst({ description: "" })).beschreibung).toBeUndefined();
  });
});
```

- [ ] **Schritt 3: Test laufen lassen, Fehlschlag bestätigen**

```bash
rtk pnpm vitest run src/app/m/portal/_lib/launcher.test.ts
```

Erwartet: FAIL — `Failed to resolve import "@/app/m/portal/_lib/launcher"`.

- [ ] **Schritt 4: Die Implementierung schreiben**

Datei `src/app/m/portal/_lib/launcher.ts`:

```ts
import { getVisibleServicesForUser } from "@/app/m/portal/_lib/services";
import type { Service } from "@/app/m/portal/_db/schema";
import type { LauncherEintrag } from "@/core/shell/types";

/**
 * DIE EINE FUNKTION, DIE DAS PORTAL FUER `core/shell` VEROEFFENTLICHT.
 *
 * `docs/design/README.md` haelt fest, dass Modul-Interna kein API sind
 * (`payloadToSvg` durfte nicht quer importiert werden). Der Launcher liegt aber
 * in `core/shell` und laeuft auf jeder Seite jedes angemeldeten Moduls, waehrend
 * die Dienste in DIESER Datenbank stehen. Statt `core` das Schema sehen zu
 * lassen, veroeffentlicht das Modul genau eine Funktion — dieselbe Bauform, die
 * `core/bootstrap.ts` mit `seedPortal` schon nutzt.
 *
 * KEIN `"use client"`: `core/shell/launcherEintraege.ts` ist ein Server-Modul und
 * bekaeme sonst eine Client-Referenz statt der Funktion (`docs/design/README.md`,
 * Falle 6).
 *
 * `launcherEintraege.test.ts` haelt mit einem Quelltext-Scan fest, dass
 * `core/shell` aus diesem Modul NUR diese Datei importiert.
 */
export const ABSCHNITT_WEITERE = "Weitere Dienste";

/**
 * Rein, damit sie ohne Datenbank pruefbar ist — der lesende Wrapper darunter
 * bleibt so duenn, dass an ihm nichts mehr schiefgehen kann.
 */
export function dienstZuEintrag(dienst: Service): LauncherEintrag {
  return {
    key: `dienst:${dienst.id}`,
    title: dienst.name,
    beschreibung: dienst.description.trim() || undefined,
    iconUrl: dienst.iconUrl,
    href: dienst.url,
    abschnitt: dienst.category?.trim() ? dienst.category : ABSCHNITT_WEITERE,
    extern: dienst.openInNewTab,
  };
}

export async function dienstEintraege(groups: string[] | null): Promise<LauncherEintrag[]> {
  const dienste = await getVisibleServicesForUser(groups ?? []);
  return dienste.map(dienstZuEintrag);
}
```

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

```bash
rtk pnpm vitest run src/app/m/portal/_lib/launcher.test.ts
```

Erwartet: PASS, 4 Tests.

- [ ] **Schritt 6: Typecheck**

```bash
rtk pnpm typecheck
```

Erwartet: keine Ausgabe.

- [ ] **Schritt 7: Commit**

```bash
rtk git add src/core/shell/types.ts src/app/m/portal/_lib/launcher.ts src/app/m/portal/_lib/launcher.test.ts && rtk git commit -m "feat(portal): eine benannte Oeffnung nach core statt Schemazugriff quer"
```

---

### Task 2: Der Merge — und der Riegel an der Grenze

Ersetzt `switcherEntries.ts`. Die beiden Rechteprüfungen bleiben getrennt: `visibleSwitcherModules` für Module, `filterVisibleServices` (in `getVisibleServicesForUser`) für Dienste. Der Merge fügt zusammen, er entscheidet nicht.

**Files:**
- Create: `src/core/shell/launcherEintraege.ts`
- Test: `src/core/shell/launcherEintraege.test.ts`
- Delete: `src/core/shell/switcherEntries.ts`, `src/core/shell/switcherEntries.test.ts`
- Modify: `src/core/shell/types.ts` (`AppSwitcherEntry` entfernen)

**Interfaces:**
- Consumes: `LauncherEintrag` (Task 1), `dienstEintraege` (Task 1), `visibleSwitcherModules` aus `@/core/registry`, `moduleUrl` aus `@/core/shell/moduleUrl`
- Produces:
  - `const ABSCHNITT_APPS = "Apps"`
  - `function modulEintraege(groups: string[] | null): LauncherEintrag[]`
  - `function mischeEintraege(module: LauncherEintrag[], dienste: LauncherEintrag[]): LauncherEintrag[]`
  - `async function launcherEintraege(groups: string[] | null): Promise<LauncherEintrag[]>`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Datei `src/core/shell/launcherEintraege.test.ts`. Der erste Block erbt die Zusicherungen aus `switcherEntries.test.ts` — sie beschreiben Verhalten, das erhalten bleiben muss.

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  modulEintraege,
  mischeEintraege,
  ABSCHNITT_APPS,
} from "@/core/shell/launcherEintraege";
import type { LauncherEintrag } from "@/core/shell/types";

afterEach(() => {
  vi.unstubAllEnvs();
});

function eintrag(teil: Partial<LauncherEintrag>): LauncherEintrag {
  return { key: "x", title: "X", href: "/", abschnitt: "A", extern: false, ...teil };
}

describe("modulEintraege", () => {
  it("verlinkt in Dev nur die fuer den Nutzer sichtbaren Module ueber *.localtest.me", () => {
    vi.stubEnv("PORT", "3000");
    const groups = ["da-feedback-gl", "iuk-files-admin", "lagerbuch_nutzer"];
    expect(modulEintraege(groups).map((e) => e.key)).toEqual([
      "portal",
      "qr",
      "feedback",
      "files",
      "lagerbuch",
      "gamma",
    ]);
    const gamma = modulEintraege(groups).find((e) => e.key === "gamma");
    expect(gamma?.href).toBe("http://gamma.localtest.me:3000");
  });

  it("laesst in Prod Module ohne eigene Domain weg", () => {
    vi.stubEnv("NODE_ENV", "production");
    const eintraege = modulEintraege([]);
    expect(eintraege.map((e) => e.key)).toEqual(["portal"]);
    expect(eintraege[0].href).toBe("https://iuk-ue.de");
  });

  it("filtert weiterhin auf die Gruppen der Session", () => {
    expect(modulEintraege(["alpha-users"]).map((e) => e.key)).toContain("alpha");
    expect(modulEintraege(null).map((e) => e.key)).toEqual(["qr"]);
  });

  it("steckt alle Module in denselben Abschnitt und traegt ihren Icon-Namen", () => {
    vi.stubEnv("PORT", "3000");
    const portal = modulEintraege([]).find((e) => e.key === "portal");
    expect(portal?.abschnitt).toBe(ABSCHNITT_APPS);
    // Der NAME, nicht die Komponente: die Aufloesung gehoert in die Client-Insel
    // (`@ant-design/icons` in RSC ist HTTP 500, den kein Gate sieht).
    expect(portal?.icon).toBe("AppstoreOutlined");
    // Module bleiben im selben Tab — sie liegen zwar auf fremden Hosts, gehoeren
    // aber zur Suite.
    expect(portal?.extern).toBe(false);
  });
});

describe("mischeEintraege", () => {
  it("stellt die Apps voran und ordnet Dienste nach erstem Auftreten ihrer Kategorie", () => {
    const module = [eintrag({ key: "portal", abschnitt: ABSCHNITT_APPS })];
    const dienste = [
      eintrag({ key: "dienst:1", abschnitt: "Zusammenarbeit" }),
      eintrag({ key: "dienst:2", abschnitt: "Verwaltung" }),
      eintrag({ key: "dienst:3", abschnitt: "Zusammenarbeit" }),
    ];
    expect(mischeEintraege(module, dienste).map((e) => e.key)).toEqual([
      "portal",
      "dienst:1",
      "dienst:3",
      "dienst:2",
    ]);
  });

  it("laesst den Apps-Abschnitt weg, wenn keine Module sichtbar sind", () => {
    const dienste = [eintrag({ key: "dienst:1", abschnitt: "Zusammenarbeit" })];
    expect(mischeEintraege([], dienste).map((e) => e.key)).toEqual(["dienst:1"]);
  });

  it("liefert eine leere Liste, wenn beide Quellen leer sind", () => {
    expect(mischeEintraege([], [])).toEqual([]);
  });
});

/*
 * Der Riegel an der Schichtgrenze. `docs/design/README.md`: Modul-Interna sind
 * kein API. Genau EIN Import aus dem Portal ist verabredet — die
 * Launcher-Funktion. Ohne diesen Scan waechst der zweite lautlos nach, und
 * `core` haette danach das Portal-Schema im Blick.
 *
 * Der Scan faengt die naheliegende Verdrahtung, nicht jede denkbare: ein
 * umbenanntes Re-Export kaeme durch. Dieselbe eingestandene Grenze wie beim
 * Seed-Scan in `scripts/seed-lokal.test.ts` — und besser als nichts.
 */
describe("Grenze zwischen core/shell und dem Modul portal", () => {
  it("importiert aus dem Portal ausschliesslich _lib/launcher", () => {
    const verzeichnis = "src/core/shell";
    const dateien = readdirSync(verzeichnis).filter((d) => /\.tsx?$/.test(d));
    expect(dateien.length).toBeGreaterThan(0);

    for (const datei of dateien) {
      const quelle = readFileSync(join(verzeichnis, datei), "utf8");
      const treffer = [...quelle.matchAll(/from\s+"@\/app\/m\/portal\/([^"]+)"/g)];
      for (const [, pfad] of treffer) {
        expect(
          pfad,
          `${datei} importiert @/app/m/portal/${pfad} — erlaubt ist nur _lib/launcher`,
        ).toBe("_lib/launcher");
      }
    }
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
rtk pnpm vitest run src/core/shell/launcherEintraege.test.ts
```

Erwartet: FAIL — `Failed to resolve import "@/core/shell/launcherEintraege"`.

- [ ] **Schritt 3: Die Implementierung schreiben**

Datei `src/core/shell/launcherEintraege.ts`:

```ts
import { visibleSwitcherModules } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { dienstEintraege } from "@/app/m/portal/_lib/launcher";
import type { LauncherEintrag } from "@/core/shell/types";

/**
 * DIE EINE EINSTIEGSLISTE — Suite-Module und externe Dienste in einer Form.
 *
 * KEIN `"use client"`: `SuiteHeader` ist eine Server Component und liest diese
 * Funktion. Ein `"use client"` hier ergaebe dort eine Client-Referenz statt der
 * Liste — HTTP 500 fuer jede Seite der Suite, und weder `build` noch Vitest
 * findet es (`docs/design/README.md`, Falle 6).
 *
 * DIE ZWEI RECHTEPRUEFUNGEN BLEIBEN GETRENNT, MIT ABSICHT. `canAccess()` steigt
 * bei `requiresAuth: false` sofort mit `true` aus — `requiredGroups` wird fuer
 * feedback, files und lagerbuch also NIE gelesen, weil diese Module anonyme
 * Teilpfade tragen muessen. Genau diese Luecke fuellt `switcherGroupSources`.
 * Eine Vereinheitlichung zeigte entweder Eintraege, die in ein `notFound()`
 * fuehren, oder verstecke Eintraege, die erreichbar sind. Der Merge fuegt
 * zusammen; er entscheidet nicht.
 */
export const ABSCHNITT_APPS = "Apps";

/** Die Suite-Module fuer diese Session. Liest `process.env` ueber `moduleUrl`. */
export function modulEintraege(groups: string[] | null): LauncherEintrag[] {
  return visibleSwitcherModules(groups).flatMap((mod) => {
    const href = moduleUrl(mod.key);
    if (!href) return [];
    return [
      {
        key: mod.key,
        title: mod.title,
        // Der NAME, nicht die Komponente — aufgeloest wird nur in Client-Inseln.
        icon: mod.icon,
        href,
        abschnitt: ABSCHNITT_APPS,
        extern: false,
      },
    ];
  });
}

/**
 * Apps zuerst, danach die Dienste-Kategorien in der Reihenfolge ihres ersten
 * Auftretens. Die Sortierung INNERHALB der Dienste kommt schon aus
 * `getVisibleServicesForUser` (`sortOrder`, dann `name`) und wird hier nicht
 * angetastet — diese Funktion gruppiert nur stabil.
 */
export function mischeEintraege(
  module: LauncherEintrag[],
  dienste: LauncherEintrag[],
): LauncherEintrag[] {
  const nachAbschnitt = new Map<string, LauncherEintrag[]>();
  for (const eintrag of dienste) {
    const bisher = nachAbschnitt.get(eintrag.abschnitt);
    if (bisher) bisher.push(eintrag);
    else nachAbschnitt.set(eintrag.abschnitt, [eintrag]);
  }
  return [...module, ...[...nachAbschnitt.values()].flat()];
}

export async function launcherEintraege(groups: string[] | null): Promise<LauncherEintrag[]> {
  return mischeEintraege(modulEintraege(groups), await dienstEintraege(groups));
}
```

- [ ] **Schritt 4: Test laufen lassen, Erfolg bestätigen**

```bash
rtk pnpm vitest run src/core/shell/launcherEintraege.test.ts
```

Erwartet: PASS, 8 Tests. Der Grenz-Scan ist grün, weil `launcherEintraege.ts` genau `_lib/launcher` importiert.

- [ ] **Schritt 5: Den Vorgänger entfernen und `SuiteHeader` umhängen**

`switcherEntries.ts` und `switcherEntries.test.ts` löschen. In `src/core/shell/types.ts` das Interface `AppSwitcherEntry` streichen. In `src/core/shell/SuiteHeader.tsx` den Import und den Aufruf ersetzen — **und den anonymen Fall abfangen**:

```ts
// statt: const entries = switcherEntries(session?.user?.groups ?? null);
// Anonym wird die Funktion GAR NICHT gerufen: `MinimalShell` nutzt dieselbe
// Kopfzeile wie `FullShell`, also oeffnete sonst jeder anonyme Aufruf von qr
// und beta die Portal-Datenbank fuer eine Liste, die anonym ohnehin nicht
// erscheint (Entwurf §3.2, §4).
const eintraege = angemeldet ? await launcherEintraege(session?.user?.groups ?? null) : [];
```

`SuiteNav` bekommt vorerst `entries={eintraege}` weitergereicht; der Prop-Typ in `SuiteNav.tsx` wird von `AppSwitcherEntry[]` auf `LauncherEintrag[]` gezogen. Die Modulknopfreihe bleibt in dieser Aufgabe noch stehen — sie fällt in Task 4.

`angemeldet` steht in `SuiteHeader.tsx` bereits vor dieser Zeile; die Reihenfolge im Quelltext gegebenenfalls anpassen.

- [ ] **Schritt 6: Volle Prüfung**

```bash
rtk pnpm vitest run && rtk pnpm typecheck && rtk pnpm lint
```

Erwartet: alles grün. `SuiteNav.test.tsx` läuft weiter, weil `LauncherEintrag` dieselben Felder trägt, die es benutzt (`key`, `title`, `icon`, `href`).

- [ ] **Schritt 7: Commit**

```bash
rtk git add -A src/core/shell src/app/m/portal && rtk git commit -m "feat(shell): eine Einstiegsliste aus zwei Quellen, mit Riegel an der Grenze"
```

---

### Task 3: Der App-Umschalter als Client-Insel

Reine Komponente, noch nicht eingebaut. **Die Icon-Auflösung findet ausschließlich hier statt.** Das Panel wird nur gerendert, wenn es offen ist — serverseitig entsteht damit nichts, also auch kein Hydration-Mismatch (die Lehre aus dem Drawer, der die anonymen QR-Formulare unbenutzbar gemacht hatte).

**Files:**
- Create: `src/core/shell/AppUmschalter.tsx`
- Test: `src/core/shell/AppUmschalter.test.tsx`
- Modify: `src/core/shell/shell.module.css`

**Interfaces:**
- Consumes: `LauncherEintrag` (Task 1), `ICONS` aus `@/core/shell/icons`
- Produces: `function AppUmschalter({ modulTitel, modulKey, eintraege }: { modulTitel: string; modulKey: string; eintraege: LauncherEintrag[] })`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Datei `src/core/shell/AppUmschalter.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll, exists, fill, click } from "@/app/m/qr/_lib/test-dom";
import { AppUmschalter } from "@/core/shell/AppUmschalter";
import type { LauncherEintrag } from "@/core/shell/types";

const EINTRAEGE: LauncherEintrag[] = [
  { key: "portal", title: "Portal", icon: "AppstoreOutlined", href: "https://p", abschnitt: "Apps", extern: false },
  { key: "lagerbuch", title: "Lagerbuch", icon: "ContainerOutlined", href: "https://l", abschnitt: "Apps", extern: false },
  { key: "dienst:1", title: "Nextcloud", beschreibung: "Dateiablage", href: "https://n", abschnitt: "Zusammenarbeit", extern: true },
];

function umschalter() {
  return <AppUmschalter modulTitel="Lagerbuch" modulKey="lagerbuch" eintraege={EINTRAEGE} />;
}

afterEach(async () => {
  await unmount();
});

describe("AppUmschalter", () => {
  it("zeigt geschlossen nur den Ausloeser und sagt das an", async () => {
    await mount(umschalter());
    const knopf = query('[data-testid="app-umschalter"]');
    expect(knopf.textContent).toContain("Lagerbuch");
    expect(knopf.getAttribute("aria-expanded")).toBe("false");
    expect(knopf.getAttribute("aria-haspopup")).toBe("menu");
    expect(exists('[data-testid="app-panel"]')).toBe(false);
  });

  it("oeffnet das Panel und gruppiert nach Abschnitt", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    expect(query('[data-testid="app-umschalter"]').getAttribute("aria-expanded")).toBe("true");
    expect(queryAll('[data-testid="app-abschnitt"]').map((a) => a.textContent)).toEqual([
      "Apps",
      "Zusammenarbeit",
    ]);
    expect(queryAll('[data-testid="app-eintrag"]').length).toBe(3);
  });

  it("markiert das aktuelle Modul, aber nicht als aufgerufene Seite", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    const aktiv = queryAll('[data-testid="app-eintrag"]').filter((e) =>
      e.hasAttribute("aria-current"),
    );
    expect(aktiv.length).toBe(1);
    expect(aktiv[0].textContent).toContain("Lagerbuch");
    // "true" und nicht "page": das Panel benennt die aktuelle APP, nicht die
    // aufgerufene Seite — auf /verwaltung/import ist der Eintrag beides nicht.
    expect(aktiv[0].getAttribute("aria-current")).toBe("true");
  });

  it("benutzt eine eigene Klasse, nicht die der Modulnavigation", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    // `shell.module.css` unterstreicht `.navLink[aria-current]`. Griffe der
    // Umschalter zu derselben Klasse, traege sein aktiver Eintrag die
    // Unterstreichung der MODULNAVIGATION — und jeder kuenftige Playwright-
    // Locator auf `[aria-current]` faende zwei Knoten (Strict-Mode-Verletzung,
    // dieselbe Falle wie bei theme-toggle und abmelden).
    for (const el of queryAll('[data-testid="app-eintrag"]')) {
      expect(el.className).not.toMatch(/navLink/);
    }
  });

  it("filtert ueber Titel und Beschreibung und blendet leere Abschnitte aus", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    await fill('[data-testid="app-suche"]', "dateiablage");
    expect(queryAll('[data-testid="app-eintrag"]').map((e) => e.textContent?.trim())).toHaveLength(1);
    expect(queryAll('[data-testid="app-abschnitt"]').map((a) => a.textContent)).toEqual([
      "Zusammenarbeit",
    ]);
  });

  it("sagt es, wenn die Suche nichts findet", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    await fill('[data-testid="app-suche"]', "gibtesnicht");
    expect(exists('[data-testid="app-leer"]')).toBe(true);
    expect(query('[data-testid="app-leer"]').textContent).toContain("gibtesnicht");
  });

  it("oeffnet externe Dienste in neuem Tab, Suite-Module nicht", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    const links = queryAll<HTMLAnchorElement>('[data-testid="app-eintrag"]');
    const nextcloud = links.find((l) => l.textContent?.includes("Nextcloud"));
    expect(nextcloud?.target).toBe("_blank");
    expect(nextcloud?.rel).toContain("noopener");
    expect(links.find((l) => l.textContent?.includes("Portal"))?.target).toBe("");
  });

  it("schliesst mit Escape", async () => {
    await mount(umschalter());
    await click('[data-testid="app-umschalter"]');
    const knopf = query('[data-testid="app-umschalter"]');
    knopf.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(exists('[data-testid="app-panel"]')).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
rtk pnpm vitest run src/core/shell/AppUmschalter.test.tsx
```

Erwartet: FAIL — `Failed to resolve import "@/core/shell/AppUmschalter"`.

- [ ] **Schritt 3: Die Komponente schreiben**

Datei `src/core/shell/AppUmschalter.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { AppstoreOutlined, DownOutlined, LinkOutlined, SearchOutlined } from "@ant-design/icons";

import { ICONS } from "@/core/shell/icons";
import type { LauncherEintrag } from "@/core/shell/types";
import s from "./shell.module.css";

/**
 * DER APP-UMSCHALTER — der Modultitel IST der Ausloeser.
 *
 * Die Kopfzeile trug bis hierher jedes sichtbare Modul als eigenen Knopf. Bei
 * zwei Modulen war das eine Liste, bei acht eine Wand; und der Entwurf von
 * 2026-07-27 hatte das vorhergesehen, ohne es zu loesen.
 *
 * DIE ICON-AUFLOESUNG FINDET NUR HIER STATT. `@ant-design/icons` in einer Server
 * Component ergibt HTTP 500 SCHON BEIM IMPORT, den weder `typecheck` noch
 * `build` noch Vitest sieht (`docs/design/README.md`, Falle 7). `SuiteHeader`
 * bleibt Server Component und uebergibt nur NAMEN.
 *
 * DAS PANEL ENTSTEHT NUR, WENN ES OFFEN IST — und das ist keine Sparmassnahme:
 * ein serverseitig aufgebautes Portal-Element hat kein `document` ("Portal only
 * work in client side"), und der folgende Hydration-Mismatch hat auf diesem
 * Zweig schon einmal die anonymen QR-Formulare unbenutzbar gemacht. Hier
 * entsteht geschlossen nur der Knopf. Deshalb auch kein antd `Dropdown`: der
 * Zustand muss ohnehin selbst gehalten werden, damit `aria-expanded` am
 * Ausloeser stehen kann.
 *
 * DIE EINTRAEGE TRAGEN EINE EIGENE KLASSE (`.appEintrag`), NICHT `.navLink`.
 * Auf einer Unterseite markieren Modulnavigation und Panel gleichzeitig; beides
 * ist wahr, aber `.navLink[aria-current]` traegt die Unterstreichung der
 * Navigation, und ein Playwright-Locator auf `[aria-current]` faende sonst zwei
 * Knoten (Strict-Mode-Verletzung, dieselbe Falle wie bei theme-toggle).
 */
export function AppUmschalter({
  modulTitel,
  modulKey,
  eintraege,
}: {
  modulTitel: string;
  modulKey: string;
  eintraege: LauncherEintrag[];
}) {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const ausloeser = useRef<HTMLButtonElement>(null);

  const gefiltert = useMemo(() => {
    const nadel = suche.trim().toLowerCase();
    if (!nadel) return eintraege;
    return eintraege.filter(
      (e) =>
        e.title.toLowerCase().includes(nadel) ||
        (e.beschreibung?.toLowerCase().includes(nadel) ?? false),
    );
  }, [eintraege, suche]);

  // Reihenfolge der Abschnitte = Reihenfolge des ersten Auftretens. Sie kommt
  // aus `mischeEintraege` und wird hier nur nachgezeichnet, nicht neu erfunden.
  const abschnitte = useMemo(() => {
    const map = new Map<string, LauncherEintrag[]>();
    for (const e of gefiltert) {
      const bisher = map.get(e.abschnitt);
      if (bisher) bisher.push(e);
      else map.set(e.abschnitt, [e]);
    }
    return [...map.entries()];
  }, [gefiltert]);

  function schliessen() {
    setOffen(false);
    setSuche("");
    ausloeser.current?.focus();
  }

  return (
    <div
      className={s.umschalter}
      onKeyDown={(e) => {
        if (e.key === "Escape" && offen) schliessen();
      }}
    >
      <button
        ref={ausloeser}
        type="button"
        data-testid="app-umschalter"
        className={s.umschalterAusloeser}
        aria-haspopup="menu"
        aria-expanded={offen}
        onClick={() => setOffen((v) => !v)}
      >
        <strong data-testid="module-title">{modulTitel}</strong>
        <DownOutlined className={s.umschalterPfeil} aria-hidden="true" />
      </button>

      {offen ? (
        <>
          {/* Fangflaeche zum Schliessen per Klick daneben. `aria-hidden`, weil
              der Weg fuer die Tastatur `Escape` ist — ein fokussierbarer
              Knoten hier waere eine Station ohne Bedeutung. */}
          <div className={s.umschalterFang} aria-hidden="true" onClick={schliessen} />
          <div data-testid="app-panel" className={s.umschalterPanel} role="menu">
            <label className={s.umschalterSuchfeld}>
              <SearchOutlined aria-hidden="true" />
              <input
                data-testid="app-suche"
                type="search"
                value={suche}
                autoFocus
                placeholder="Apps und Dienste durchsuchen"
                aria-label="Apps und Dienste durchsuchen"
                onChange={(e) => setSuche(e.target.value)}
              />
            </label>

            {abschnitte.length === 0 ? (
              <p data-testid="app-leer" className={s.umschalterLeer}>
                Nichts gefunden für „{suche}".
              </p>
            ) : (
              abschnitte.map(([titel, liste]) => (
                <div key={titel}>
                  <div data-testid="app-abschnitt" className={s.umschalterAbschnitt}>
                    {titel}
                  </div>
                  <div className={s.umschalterListe}>
                    {liste.map((e) => {
                      const Icon = e.icon ? (ICONS[e.icon] ?? AppstoreOutlined) : LinkOutlined;
                      return (
                        <a
                          key={e.key}
                          data-testid="app-eintrag"
                          className={s.appEintrag}
                          href={e.href}
                          role="menuitem"
                          target={e.extern ? "_blank" : undefined}
                          rel={e.extern ? "noopener noreferrer" : undefined}
                          aria-current={e.key === modulKey ? "true" : undefined}
                        >
                          {e.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.iconUrl} alt="" className={s.appEintragBild} />
                          ) : (
                            <Icon aria-hidden="true" />
                          )}
                          <span>
                            <span className={s.appEintragTitel}>{e.title}</span>
                            {e.beschreibung ? (
                              <span className={s.appEintragText}>{e.beschreibung}</span>
                            ) : null}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Schritt 4: Das CSS ergänzen**

An `src/core/shell/shell.module.css` anhängen. **Keine `--ant-*`-Variablen** — dieses Markup steht außerhalb jedes antd-Komponentenbaums und sähe sie nicht, still (Falle 2).

```css
/*
 * DER APP-UMSCHALTER. Eigene Klassen statt `.navLink`, weil dessen
 * `[aria-current]`-Unterstreichung der Modulnavigation gehoert — siehe die
 * ausfuehrliche Begruendung in AppUmschalter.tsx.
 *
 * Das Panel steht `position: absolute` in einem `relative` Elternknoten und
 * NICHT in einem Portal: es soll serverseitig gar nicht erst entstehen.
 */
.umschalter {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
}

.umschalterAusloeser {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  min-width: 0;
}

.umschalterAusloeser:hover,
.umschalterAusloeser[aria-expanded="true"] {
  border-color: currentColor;
}

.umschalterAusloeser strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.umschalterPfeil {
  font-size: 12px;
  opacity: 0.6;
}

/* Deckt den Rest der Seite ab, damit ein Klick daneben schliesst. Unter dem
   Panel (`z-index`), aber ueber allem anderen. */
.umschalterFang {
  position: fixed;
  inset: 0;
  z-index: 900;
}

/*
 * Mobil eine vollbreite Flaeche unter der Kopfzeile, ab 768px ein Popover.
 * Das ist der einzige Suite-Breakpoint; `Grid.useBreakpoint` ist verboten und
 * ein JS-Breakpoint zeigte beim ersten Render die falsche Variante.
 */
.umschalterPanel {
  position: absolute;
  z-index: 901;
  inset-inline: 0;
  inset-block-start: calc(100% + 8px);
  max-height: 70vh;
  overflow-y: auto;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgb(0 0 0 / 0.12);
  background: var(--suite-flaeche, #fff);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
}

.umschalterSuchfeld {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-block-end: 12px;
  border: 1px solid rgb(0 0 0 / 0.12);
  border-radius: 8px;
}

.umschalterSuchfeld input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  color: inherit;
  /* 16px ist die Suite-Untergrenze fuer Eingabefelder (Suite-Chrome §3). */
  font-size: 16px;
  outline: none;
}

.umschalterAbschnitt {
  padding: 4px 6px;
  font-size: 12px;
  opacity: 0.65;
}

.umschalterListe {
  display: grid;
  gap: 2px;
  margin-block-end: 8px;
}

.umschalterLeer {
  padding: 12px 6px;
  margin: 0;
  opacity: 0.75;
}

.appEintrag {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
}

.appEintrag:hover {
  background: rgb(0 0 0 / 0.06);
}

.appEintrag[aria-current] {
  background: rgb(0 0 0 / 0.06);
  font-weight: 600;
}

.appEintragBild {
  inline-size: 20px;
  block-size: 20px;
  object-fit: contain;
}

.appEintragTitel {
  display: block;
}

.appEintragText {
  display: block;
  font-size: 12px;
  opacity: 0.65;
}

@media (min-width: 768px) {
  .umschalterPanel {
    inset-inline: 0 auto;
    inline-size: 360px;
  }
}
```

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

```bash
rtk pnpm vitest run src/core/shell/AppUmschalter.test.tsx
```

Erwartet: PASS, 8 Tests.

- [ ] **Schritt 6: Der Icon-Riegel muss grün bleiben**

```bash
rtk pnpm vitest run src/core/shell/icons.test.ts && rtk pnpm typecheck && rtk pnpm lint
```

Erwartet: grün. Geht `icons.test.ts` rot, liegt die Ursache in der Datei, die die Fehlermeldung nennt — nicht in `core/shell`.

- [ ] **Schritt 7: Commit**

```bash
rtk git add src/core/shell/AppUmschalter.tsx src/core/shell/AppUmschalter.test.tsx src/core/shell/shell.module.css && rtk git commit -m "feat(shell): App-Umschalter am Modultitel, Icons nur in der Client-Insel"
```

---

### Task 4: Die Kopfzeile räumen

Die Modulknopfreihe fällt, der Umschalter tritt an die Stelle des Titel-Links. Der Drawer verliert seinen Modul-Abschnitt und behält die Modul-Navigation und den Theme-Umschalter. **Hier bricht `keystone.spec.ts` — mit Absicht**, und wird in derselben Aufgabe nachgezogen, damit das Repo danach grün ist.

**Files:**
- Modify: `src/core/shell/SuiteHeader.tsx`, `src/core/shell/SuiteNav.tsx`, `src/core/shell/shell.module.css`
- Modify: `src/core/shell/SuiteNav.test.tsx`, `src/core/shell/SuiteHeader.test.tsx`, `src/core/shell/shell-css.test.ts`
- Modify: `e2e/keystone.spec.ts:39`

**Interfaces:**
- Consumes: `AppUmschalter` (Task 3), `launcherEintraege` (Task 2)
- Produces: `SuiteNav` ohne `entries`-Prop; `SuiteHeader` rendert `AppUmschalter` statt des Titel-`Link`

- [ ] **Schritt 1: `SuiteHeader` umbauen**

Der `Link` um den Modultitel entfällt; `data-testid="module-title"` wandert mit in den Umschalter (Task 3 setzt es dort bereits) — der Keystone-E2E fragt es weiter ab und findet es.

```tsx
<Header data-testid="suite-header" className={s.kopf}>
  {/*
   * DER TITEL IST JETZT DER UMSCHALTER, kein Link mehr.
   *
   * Der Weg zurueck auf die Modulstartseite geht nicht verloren, er wandert:
   * als eigener, markierter Eintrag im Panel und als erster Eintrag der
   * Modulnavigation. Das kostet einen Klick. Der Gegenwert ist, dass „wo bin
   * ich" und „wohin kann ich" an einer Stelle stehen statt an zweien — und
   * dass die Kopfzeile nicht mehr jedes sichtbare Modul auffuehrt.
   *
   * Anonym gibt es keinen Umschalter, sondern nur den Titel: eine Liste, deren
   * Eintraege saemtlich zum Login umleiten, verspricht „hier kannst du hin" und
   * liefert „hier musst du dich erst anmelden" (Suite-Chrome §6).
   */}
  {angemeldet ? (
    <AppUmschalter modulTitel={mod.title} modulKey={moduleKey} eintraege={eintraege} />
  ) : (
    <Link href={moduleUrl(moduleKey) ?? "/"} className={s.titel}>
      <strong data-testid="module-title">{mod.title}</strong>
    </Link>
  )}
  <SuiteNav nav={nav} userName={session?.user?.name ?? null} angemeldet={angemeldet} />
</Header>
<Modulnav nav={nav} />
```

- [ ] **Schritt 2: `SuiteNav` entschlacken**

- Das Prop `entries` und die Konstante `modulLinks` entfallen.
- Der Block `<nav aria-label="Module" data-testid="modulzeile">` entfällt ersatzlos.
- Im Drawer entfällt die Gruppe „Module"; er behält „In diesem Modul" und den Theme-Umschalter.
- Die Importe `AppstoreOutlined`, `ICONS` und `LauncherEintrag` entfallen aus dieser Datei.
- `MenuOutlined`, `LoginOutlined`, `LogoutOutlined`, `Avatar`, `Dropdown`, `Drawer` bleiben.

Am Drawer den bestehenden Kommentar um einen Satz ergänzen:

```tsx
{/* Kein Modul-Abschnitt mehr: die Apps haengen am Umschalter der Kopfzeile,
    auf JEDER Groesze. Der Drawer traegt damit genau eine Sache — die
    Modulnavigation — und der Umschalter genau eine andere. */}
```

- [ ] **Schritt 3: Das CSS aufräumen**

In `shell.module.css` die Regeln `.modulzeile` samt `::-webkit-scrollbar`-Pendant entfernen. `.titel` bleibt (anonymer Fall). Der Kommentar an `.kopf`, der `.modulzeile` als Scrollcontainer erklärt, wird auf den neuen Stand gebracht: es gibt keine Knopfreihe mehr, die überlaufen könnte.

- [ ] **Schritt 4: Die Unit-Tests nachziehen**

In `SuiteNav.test.tsx`:
- Zusicherungen auf `data-testid="modulzeile"` und auf Modul-Links im Drawer entfernen.
- Neu: der Drawer enthält keine Modul-Links mehr —
  `expect(queryAll('[data-testid="suite-drawer"] [data-testid="app-eintrag"]').length).toBe(0);`
- **Die Icon-Zusicherung darf nicht verlorengehen.** Sie hängt heute an `SuiteNav.test.tsx`, gehört
  aber jetzt zum Umschalter. Wortgleich nach `AppUmschalter.test.tsx` verschieben und dort **ohne
  Rendering** halten — sie prüft die Map gegen die Registry, nicht das DOM:

```ts
import { MODULES } from "@/core/registry";
import { ICONS } from "@/core/shell/icons";

/*
 * Ohne diese Zusicherung traegt ein neues Modul STILL das Portal-Icon: `icon`
 * muss ein Schluessel DIESER Map sein, nicht bloss ein existierender
 * @ant-design/icons-Name, und der Rueckfall auf AppstoreOutlined ist die Falle,
 * nicht die Rettung. Beim Registry-Eintrag von `files` (2026-07-30) ist genau
 * das passiert — kein Fehler, kein Log, nur ein falsches Bild in jeder
 * Kopfzeile.
 */
describe("Modul-Icons", () => {
  it("jedes Modul der Registry hat einen Eintrag in ICONS", () => {
    for (const mod of MODULES) {
      expect(Object.keys(ICONS), `Modul ${mod.key}`).toContain(mod.icon);
    }
  });
});
```

In `SuiteHeader.test.tsx`: die Zusicherung auf den Titel-`Link` wird zu „angemeldet ein
Umschalter-Knopf (`data-testid="app-umschalter"`), anonym ein Link mit `href` auf die
Modulstartseite". `data-testid="module-title"` muss in **beiden** Fällen vorhanden sein — der
Keystone-E2E fragt es ab.

In `shell-css.test.ts` — die Datei zuerst lesen, sie prüft den CSS-Quelltext und hat eine eigene
Bauform. Zu ändern:
- alle `.modulzeile`-Zusicherungen streichen (die Klasse existiert nicht mehr);
- neu: `.umschalterPanel` trägt in der Basis-Regel `inset-inline: 0` und innerhalb von
  `@media (min-width: 768px)` eine feste `inline-size`;
- neu: `.appEintrag[aria-current]` existiert;
- unverändert bestehen bleibt `.navLink[aria-current]` — die Unterstreichung gehört weiter der
  Modulnavigation, und dass der Umschalter sie **nicht** erbt, ist der Punkt.

- [ ] **Schritt 5: Den Keystone-E2E nachziehen**

`e2e/keystone.spec.ts:39` prüft heute `getByRole("link", { name: /Alpha/ })` **ohne vorheriges Öffnen** — genau das, was der alte Kommentar in `SuiteNav.tsx` als Grund gegen ein Dropdown nannte. Das ist eine bewusste Vertragsänderung:

```ts
  // Der App-Wechsel haengt seit dem Navigations-Umbau am Modultitel, nicht mehr
  // an einer Knopfreihe: erst oeffnen, dann pruefen. Die Zusage dahinter ist
  // unveraendert — die Session traegt `alpha-users`, also steht Alpha drin.
  await page.getByTestId("app-umschalter").click();
  await expect(
    page.getByTestId("app-panel").getByRole("menuitem", { name: /Alpha/ }),
  ).toBeVisible();
```

Die Einschränkung auf `app-panel` ist nicht Zierrat: ohne sie sucht der Locator im ganzen Dokument.

- [ ] **Schritt 6: Volle Prüfung**

```bash
rtk pnpm vitest run && rtk pnpm typecheck && rtk pnpm lint && rtk pnpm build
```

Erwartet: alles grün.

- [ ] **Schritt 7: Den echten Abruf prüfen**

`build` und Vitest sehen die RSC-Fallen strukturell nicht — nur ein echter Abruf zeigt einen 500er. Den liefert **Playwright**, das seinen eigenen Server auf Port 3100 startet (`webServer` in `playwright.config.ts`) und über echtes HTTP abruft:

```bash
rtk pnpm exec playwright test e2e/keystone.spec.ts e2e/shell-mobil.spec.ts
```

`keystone` ruft alle drei Shell-Varianten ab — `beta` (minimal), `kioskdemo` (kiosk), `alpha`/`gamma` (full). Ein von Hand gestarteter `pnpm dev` plus `curl` ist dafür nicht nur unnötig, sondern schädlich: der Dev-Server bleibt offen und legt die E2E-Suite lahm.

Erwartet: grün. Schlägt eine Navigation fehl, liegt es fast immer an einem Icon- oder Compound-Zugriff auf der Server-Seite.

- [ ] **Schritt 8: Commit**

```bash
rtk git add -A src/core/shell e2e/keystone.spec.ts && rtk git commit -m "feat(shell): Modulknopfreihe faellt, der Titel uebernimmt den App-Wechsel"
```

---

### Task 5: Der Ansprechpartner

Eine Schlüssel/Wert-Tabelle in der Portal-Datenbank, gepflegt in der bestehenden Verwaltung. Gegen `env` sprach, dass jede Änderung sonst einen Deploy kostet — und die Person, die den Kontakt kennt, ist die Portal-Verwaltung, nicht der Betreiber der Container.

**Files:**
- Modify: `src/app/m/portal/_db/schema.ts`
- Create: `src/app/m/portal/_db/migrations/0001_*.sql` (von drizzle-kit erzeugt)
- Create: `src/app/m/portal/_lib/einstellungen.ts`
- Modify: `src/app/m/portal/actions.ts`, `src/app/m/portal/admin/page.tsx`
- Create: `src/app/m/portal/admin/ansprechpartner-form.tsx`

**Interfaces:**
- Produces:
  - `const einstellungen` (Drizzle-Tabelle `portal_einstellungen`)
  - `async function leseAnsprechpartner(): Promise<string | null>`
  - `async function setzeAnsprechpartner(wert: string): Promise<void>`
  - `async function setzeAnsprechpartnerAction(formData: FormData): Promise<void>`

- [ ] **Schritt 1: Das Schema ergänzen**

An `src/app/m/portal/_db/schema.ts` anhängen:

```ts
/**
 * Schluessel/Wert fuer Portal-Einstellungen. Heute genau ein Schluessel:
 * `ansprechpartner` — der Kontakt, den der Leerzustand nennt, wenn jemand fuer
 * nichts freigeschaltet ist. Eine Tabelle statt einer env-Variable, weil sonst
 * jede Aenderung einen Deploy kostet und die Person, die den Kontakt kennt, die
 * Portal-Verwaltung ist.
 */
export const einstellungen = sqliteTable("portal_einstellungen", {
  schluessel: text("schluessel").primaryKey(),
  wert: text("wert").notNull(),
});

export type Einstellung = typeof einstellungen.$inferSelect;
```

- [ ] **Schritt 2: Die Migration erzeugen**

```bash
rtk pnpm exec drizzle-kit generate --config=src/app/m/portal/_db/drizzle.config.ts
```

Erwartet: eine neue Datei `0001_*.sql` unter `src/app/m/portal/_db/migrations/` und ein zweiter Eintrag in `meta/_journal.json`. **Von Hand geschriebene Migrationen sind hier falsch** — das Journal und der Snapshot müssen mitwachsen.

Das **Dreieck** aus `CLAUDE.md` ist für `portal` bereits vollständig (Migrationsverzeichnis, `MODULE_MIGRATIONS`-Eintrag, `COPY`-Zeile im `Dockerfile`): es kommt nur eine Datei hinzu, kein neuer Eintrag.

- [ ] **Schritt 3: Den Zugriff schreiben**

Datei `src/app/m/portal/_lib/einstellungen.ts`:

```ts
import { eq } from "drizzle-orm";
import { getDb } from "@/app/m/portal/_db/client";
import { einstellungen } from "@/app/m/portal/_db/schema";

const ANSPRECHPARTNER = "ansprechpartner";

/** `null`, wenn nichts gepflegt ist — der Leerzustand zeigt dann nur die Erklaerung. */
export async function leseAnsprechpartner(): Promise<string | null> {
  const db = getDb();
  const zeilen = await db
    .select()
    .from(einstellungen)
    .where(eq(einstellungen.schluessel, ANSPRECHPARTNER))
    .limit(1);
  return zeilen[0]?.wert.trim() || null;
}

export async function setzeAnsprechpartner(wert: string): Promise<void> {
  const db = getDb();
  await db
    .insert(einstellungen)
    .values({ schluessel: ANSPRECHPARTNER, wert })
    .onConflictDoUpdate({ target: einstellungen.schluessel, set: { wert } });
}
```

- [ ] **Schritt 4: Die Server Action ergänzen**

An `src/app/m/portal/actions.ts` anhängen:

```ts
export async function setzeAnsprechpartnerAction(formData: FormData) {
  await assertAdmin();
  await setzeAnsprechpartner(String(formData.get("ansprechpartner") ?? "").trim());
  revalidatePath("/m/portal");
}
```

Import ergänzen: `import { setzeAnsprechpartner } from "@/app/m/portal/_lib/einstellungen";`

- [ ] **Schritt 5: Das Formular anlegen**

Datei `src/app/m/portal/admin/ansprechpartner-form.tsx`. **Client-Komponente**, weil `Input.TextArea` ein antd-Compound ist und in einer Server Component `undefined` ergäbe (Falle 1). `size` wird nicht gesetzt (Falle 4).

```tsx
"use client";

import { Button, Input } from "antd";

/**
 * Der Kontakt, den der Portal-Leerzustand nennt. Freitext und bewusst kein
 * Namens-/E-Mail-Paar: was hier hilft, unterscheidet sich je Kreisverband
 * („IuK-Gruppe, iuk@…" oder eine Telefonnummer), und ein zu enges Schema
 * zwaenge zu einer Angabe, die nicht stimmt.
 */
export function AnsprechpartnerForm({
  wert,
  action,
}: {
  wert: string | null;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} data-testid="ansprechpartner-form">
      <Input.TextArea
        name="ansprechpartner"
        defaultValue={wert ?? ""}
        rows={2}
        placeholder="z. B. IuK-Gruppe — iuk@kreisverband.example"
        aria-label="Ansprechpartner für Zugänge"
      />
      <Button htmlType="submit" type="primary" style={{ marginBlockStart: 12 }}>
        Speichern
      </Button>
    </form>
  );
}
```

- [ ] **Schritt 6: In die Verwaltung einhängen**

In `src/app/m/portal/admin/page.tsx` einen dritten Abschnitt ergänzen (Überschrift als schlichtes `<h2>`, wie die beiden vorhandenen — kein `Typography.Title`):

```tsx
<section>
  <h2 style={{ fontSize: 20, fontWeight: 600, marginBlock: "0 16px" }}>
    Ansprechpartner für Zugänge
  </h2>
  <p style={{ marginBlock: "0 12px", opacity: 0.75 }}>
    Steht im Portal, wenn jemand für nichts freigeschaltet ist. Bleibt das Feld leer,
    erscheint dort nur die Erklärung ohne Kontaktweg.
  </p>
  <AnsprechpartnerForm wert={ansprechpartner} action={setzeAnsprechpartnerAction} />
</section>
```

Dazu oben `const ansprechpartner = await leseAnsprechpartner();` und die zwei Importe.

- [ ] **Schritt 7: Prüfen**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm build
```

Dazu der echte Abruf — **über Playwright, nicht über `pnpm dev` plus `curl`**:

```bash
rtk pnpm exec playwright test e2e/portal.spec.ts
```

Playwright startet seinen eigenen Server auf Port 3100 und ruft die Seiten über echtes HTTP ab; damit sieht es die RSC-Fallen, die `build` und Vitest strukturell nicht sehen. Ein von Hand gestarteter `pnpm dev` ist dafür nicht nur unnötig, sondern schädlich: er bleibt offen und legt die E2E-Suite lahm.

Der Rundlauf durch das Formular (speichern → neu laden → Wert steht da) wird **nicht** hier von Hand geprüft, sondern in Task 7 als E2E festgeschrieben.

- [ ] **Schritt 8: Commit**

```bash
rtk git add -A src/app/m/portal && rtk git commit -m "feat(portal): Ansprechpartner in der Verwaltung statt in einer env-Variable"
```

---

### Task 6: Die Portal-Seite

Dieselbe Liste wie im Umschalter, vollflächig — mit Suche, Abschnitten und dem Leerzustand, der heute eine weiße Fläche ist.

**Files:**
- Create: `src/app/m/portal/_ui/DiensteRaster.tsx`
- Test: `src/app/m/portal/_ui/DiensteRaster.test.tsx`
- Modify: `src/app/m/portal/page.tsx`

**Interfaces:**
- Consumes: `launcherEintraege` (Task 2), `leseAnsprechpartner` (Task 5), `LauncherEintrag` (Task 1)
- Produces: `function DiensteRaster({ eintraege, ansprechpartner }: { eintraege: LauncherEintrag[]; ansprechpartner: string | null })`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Datei `src/app/m/portal/_ui/DiensteRaster.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll, exists, fill } from "@/app/m/qr/_lib/test-dom";
import { DiensteRaster } from "@/app/m/portal/_ui/DiensteRaster";
import type { LauncherEintrag } from "@/core/shell/types";

const EINTRAEGE: LauncherEintrag[] = [
  { key: "lagerbuch", title: "Lagerbuch", icon: "ContainerOutlined", href: "https://l", abschnitt: "Apps", extern: false },
  { key: "dienst:1", title: "Nextcloud", beschreibung: "Dateiablage", href: "https://n", abschnitt: "Zusammenarbeit", extern: true },
];

afterEach(async () => {
  await unmount();
});

describe("DiensteRaster", () => {
  it("gruppiert nach Abschnitt und verlinkt jede Kachel", async () => {
    await mount(<DiensteRaster eintraege={EINTRAEGE} ansprechpartner={null} />);
    expect(queryAll('[data-testid="portal-abschnitt"]').map((a) => a.textContent)).toEqual([
      "Apps",
      "Zusammenarbeit",
    ]);
    expect(queryAll('[data-testid="service-tile"]').length).toBe(2);
  });

  it("filtert ueber die Suche", async () => {
    await mount(<DiensteRaster eintraege={EINTRAEGE} ansprechpartner={null} />);
    await fill('[data-testid="portal-suche"]', "lager");
    expect(queryAll('[data-testid="service-tile"]').length).toBe(1);
  });

  /*
   * DER DEFEKT, DEN DIESE AUFGABE BEHEBT. Bisher rendert `services.map` ueber
   * `[]` ein leeres `<Row>` — eine weisze Flaeche, die wie ein Ausfall
   * aussieht. Der haeufigere Fall ist eine frisch angelegte Helferin, die noch
   * fuer nichts freigeschaltet ist.
   */
  it("nennt den Ansprechpartner, wenn nichts freigeschaltet ist", async () => {
    await mount(<DiensteRaster eintraege={[]} ansprechpartner="IuK-Gruppe — iuk@example.org" />);
    const leer = query('[data-testid="portal-leer"]');
    expect(leer.textContent).toContain("freigeschaltet");
    expect(leer.textContent).toContain("iuk@example.org");
    expect(exists('[data-testid="portal-suche"]')).toBe(false);
  });

  it("zeigt ohne gepflegten Ansprechpartner nur die Erklaerung", async () => {
    await mount(<DiensteRaster eintraege={[]} ansprechpartner={null} />);
    expect(exists('[data-testid="portal-leer"]')).toBe(true);
    expect(exists('[data-testid="portal-kontakt"]')).toBe(false);
  });

  it("sagt es, wenn die Suche nichts findet — das ist nicht derselbe Zustand", async () => {
    await mount(<DiensteRaster eintraege={EINTRAEGE} ansprechpartner={null} />);
    await fill('[data-testid="portal-suche"]', "gibtesnicht");
    expect(exists('[data-testid="portal-ohne-treffer"]')).toBe(true);
    // Kein Ansprechpartner-Hinweis: nicht freigeschaltet zu sein und nichts
    // gefunden zu haben sind zwei verschiedene Lagen.
    expect(exists('[data-testid="portal-leer"]')).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
rtk pnpm vitest run src/app/m/portal/_ui/DiensteRaster.test.tsx
```

Erwartet: FAIL — Modul nicht auflösbar.

- [ ] **Schritt 3: Die Komponente schreiben**

Datei `src/app/m/portal/_ui/DiensteRaster.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { AppstoreOutlined, LinkOutlined } from "@ant-design/icons";
import { Card, Col, Empty, Input, Result, Row } from "antd";

import { ICONS } from "@/core/shell/icons";
import type { LauncherEintrag } from "@/core/shell/types";
import { SPACE } from "@/core/theme/tokens";

/**
 * DAS PORTAL ALS VOLLFLAECHIGE ANSICHT DERSELBEN LISTE, die der Umschalter als
 * Popover zeigt. Eine Wahrheit, zwei Darstellungen.
 *
 * Client-Insel, aus zwei Gruenden zugleich: die Suche braucht Zustand, und die
 * Icons duerfen nur hier aufloesen (`@ant-design/icons` in RSC ist HTTP 500
 * schon beim Import, Falle 7). Die Seite darueber bleibt Server Component und
 * uebergibt fertige Daten.
 *
 * KEIN `Alert type="error"` im Leerzustand: `colorError === colorPrimary ===
 * #c8000f`, ein fehlender Zugang saehe damit aus wie eine Primaeraktion — und
 * er ist keine Stoerung, sondern eine Auskunft (Falle 3).
 */
export function DiensteRaster({
  eintraege,
  ansprechpartner,
}: {
  eintraege: LauncherEintrag[];
  ansprechpartner: string | null;
}) {
  const [suche, setSuche] = useState("");

  const abschnitte = useMemo(() => {
    const nadel = suche.trim().toLowerCase();
    const gefiltert = nadel
      ? eintraege.filter(
          (e) =>
            e.title.toLowerCase().includes(nadel) ||
            (e.beschreibung?.toLowerCase().includes(nadel) ?? false),
        )
      : eintraege;
    const map = new Map<string, LauncherEintrag[]>();
    for (const e of gefiltert) {
      const bisher = map.get(e.abschnitt);
      if (bisher) bisher.push(e);
      else map.set(e.abschnitt, [e]);
    }
    return [...map.entries()];
  }, [eintraege, suche]);

  // Nichts freigeschaltet — nicht dasselbe wie „Suche ohne Treffer". Deshalb
  // steht dieser Zweig VOR dem Suchfeld: ein Suchfeld ueber einer leeren Liste
  // laedt zu einer Suche ein, die nichts finden kann.
  if (eintraege.length === 0) {
    return (
      <Result
        data-testid="portal-leer"
        status="info"
        title="Für dich ist noch nichts freigeschaltet"
        subTitle={
          <>
            <p>
              Welche Apps und Dienste du hier siehst, hängt an deinen Gruppen. Im Moment ist
              für dich keine hinterlegt.
            </p>
            {ansprechpartner ? (
              <p data-testid="portal-kontakt">
                <strong>Ansprechpartner:</strong> {ansprechpartner}
              </p>
            ) : null}
          </>
        }
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
      <Input
        data-testid="portal-suche"
        type="search"
        value={suche}
        placeholder="Apps und Dienste durchsuchen"
        aria-label="Apps und Dienste durchsuchen"
        onChange={(e) => setSuche(e.target.value)}
        style={{ maxInlineSize: 420 }}
      />

      {abschnitte.length === 0 ? (
        <Empty data-testid="portal-ohne-treffer" description={`Nichts gefunden für „${suche}".`} />
      ) : (
        abschnitte.map(([titel, liste]) => (
          <section key={titel}>
            <h2
              data-testid="portal-abschnitt"
              style={{ fontSize: 16, fontWeight: 600, marginBlock: "0 12px", opacity: 0.75 }}
            >
              {titel}
            </h2>
            <Row gutter={[SPACE.lg, SPACE.lg]} data-testid="portal-grid">
              {liste.map((e) => {
                const Icon = e.icon ? (ICONS[e.icon] ?? AppstoreOutlined) : LinkOutlined;
                return (
                  <Col key={e.key} xs={12} sm={8}>
                    {/* Der Link liegt AUSSEN: antds Card rendert kein <a>, und
                        die Kachel ist die einzige Navigation ins Ziel. */}
                    <a
                      href={e.href}
                      target={e.extern ? "_blank" : undefined}
                      rel={e.extern ? "noopener noreferrer" : undefined}
                      data-testid="service-tile"
                      style={{ display: "block", blockSize: "100%" }}
                    >
                      <Card hoverable size="small" style={{ blockSize: "100%" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {e.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.iconUrl} alt="" width={20} height={20} />
                          ) : (
                            <Icon aria-hidden="true" />
                          )}
                          <span style={{ fontWeight: 600 }}>{e.title}</span>
                        </div>
                        {e.beschreibung ? (
                          <div style={{ fontSize: 14, opacity: 0.65, marginBlockStart: 4 }}>
                            {e.beschreibung}
                          </div>
                        ) : null}
                      </Card>
                    </a>
                  </Col>
                );
              })}
            </Row>
          </section>
        ))
      )}
    </div>
  );
}
```

- [ ] **Schritt 4: Die Seite umbauen**

`src/app/m/portal/page.tsx` vollständig ersetzen:

```tsx
import { auth } from "@/core/auth";
import { launcherEintraege } from "@/core/shell/launcherEintraege";
import { leseAnsprechpartner } from "@/app/m/portal/_lib/einstellungen";
import { DiensteRaster } from "@/app/m/portal/_ui/DiensteRaster";

/**
 * Server Component: sie loest Sitzung, Liste und Ansprechpartner auf und
 * uebergibt fertige Daten. Icons und Suchzustand gehoeren in die Client-Insel
 * darunter — `@ant-design/icons` hier waere HTTP 500 schon beim Import.
 */
export default async function PortalPage() {
  const session = await auth();
  const [eintraege, ansprechpartner] = await Promise.all([
    launcherEintraege(session?.user?.groups ?? null),
    leseAnsprechpartner(),
  ]);
  return <DiensteRaster eintraege={eintraege} ansprechpartner={ansprechpartner} />;
}
```

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

```bash
rtk pnpm vitest run src/app/m/portal/_ui/DiensteRaster.test.tsx
```

Erwartet: PASS, 5 Tests.

- [ ] **Schritt 6: Volle Prüfung samt echtem Abruf**

```bash
rtk pnpm vitest run && rtk pnpm typecheck && rtk pnpm lint && rtk pnpm build
```

Dazu der echte Abruf — **über Playwright, nicht über `pnpm dev` plus `curl`**:

```bash
rtk pnpm exec playwright test e2e/portal.spec.ts
```

Playwright startet seinen eigenen Server auf Port 3100 und ruft die Seite über echtes HTTP ab; damit sieht es die RSC-Fallen (Icon-Import in einer Server Component, Compound-Zugriff), die `build` und Vitest strukturell nicht sehen. Ein von Hand gestarteter `pnpm dev` ist dafür nicht nur unnötig, sondern schädlich — er bleibt offen und legt die E2E-Suite lahm.

Erwartet: die Spec läuft grün. Ein 500er auf der Portal-Seite fiele hier als fehlgeschlagene Navigation auf.

- [ ] **Schritt 7: Commit**

```bash
rtk git add -A src/app/m/portal && rtk git commit -m "feat(portal): Abschnitte, Suche und ein Leerzustand, der einen naechsten Schritt nennt"
```

---

### Task 7: End-to-End

Die drei Zusagen, die nur ein laufender Server belegen kann.

**Files:**
- Create: `e2e/launcher.spec.ts`

**Interfaces:**
- Consumes: `devLogin` aus `e2e/fixtures`

- [ ] **Schritt 1: Kein `pnpm dev` darf laufen**

Playwright startet seinen **eigenen** Server (Port 3100, `webServer` in `playwright.config.ts`) — ein von Hand gestarteter `pnpm dev` wird nicht gebraucht und legt die Suite lahm. Prüfen und gegebenenfalls beenden:

```bash
rtk pnpm exec playwright test --list | head -5
```

- [ ] **Schritt 2: Die Spec schreiben**

Datei `e2e/launcher.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

test("Umschalter oeffnet, filtert und wechselt das Modul", async ({ page }) => {
  await devLogin(page, { host: "alpha.localtest.me", groups: "alpha-users", callbackPath: "/" });

  // Geschlossen steht keine Modulliste in der Kopfzeile — das ist der ganze
  // Zweck des Umbaus.
  await expect(page.getByTestId("app-panel")).toHaveCount(0);
  await expect(page.getByTestId("modulzeile")).toHaveCount(0);

  await page.getByTestId("app-umschalter").click();
  const panel = page.getByTestId("app-panel");
  await expect(panel).toBeVisible();

  await panel.getByTestId("app-suche").fill("gamma");
  await expect(panel.getByTestId("app-eintrag")).toHaveCount(1);

  // `link`, nicht `menuitem`: das Panel trägt bewusst keine ARIA-Menürollen —
  // es enthält ein Suchfeld, und das Menümodell verträgt kein Textfeld.
  await panel.getByRole("link", { name: /Gamma/ }).click();
  await expect(page.getByTestId("gamma-content")).toBeVisible();
  // Der Modultitel folgt dem Modul — sonst waere der Wechsel nur halb passiert.
  await expect(page.getByTestId("module-title")).toHaveText("Gamma");
});

test("das aktuelle Modul ist im Panel markiert, und zwar genau einmal", async ({ page }) => {
  await devLogin(page, { host: "gamma.localtest.me", groups: "", callbackPath: "/" });
  await page.getByTestId("app-umschalter").click();
  const panel = page.getByTestId("app-panel");
  await expect(panel.locator("[aria-current]")).toHaveCount(1);
  await expect(panel.locator("[aria-current]")).toContainText("Gamma");
});

test("mobil oeffnen Titel und Menue-Knopf zwei verschiedene Dinge", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await devLogin(page, { host: "gamma.localtest.me", groups: "", callbackPath: "/" });

  await page.getByTestId("app-umschalter").click();
  await expect(page.getByTestId("app-panel")).toBeVisible();
  // Der Drawer bleibt zu — die zwei Oeffner teilen sich keinen Zustand.
  await expect(page.getByTestId("suite-drawer")).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app-panel")).toHaveCount(0);

  await page.getByTestId("menue-knopf").click();
  await expect(page.getByTestId("suite-drawer")).toBeVisible();
  // Und im Drawer stehen KEINE Apps mehr.
  await expect(page.getByTestId("suite-drawer").getByTestId("app-eintrag")).toHaveCount(0);
});

/*
 * Der Rundlauf des Ansprechpartners aus Task 5 — Verwaltung schreibt, Portal
 * liest. Er steht hier und nicht in Task 5, weil er zwei Seiten und einen
 * Neuladevorgang umfasst; nur ein laufender Server kann das belegen.
 *
 * Die Gruppe des Portal-Admins ist die SUITE-Admin-Gruppe: `portal` führt keine
 * eigene (`registry.ts`, `adminGroups: []`), also greift `ADMIN_GROUP` aus
 * `core/groups.ts` — Vorgabe `dashboard-admins`, und `playwright.config.ts`
 * setzt die Variable nicht, die Vorgabe gilt also.
 */
test("was die Verwaltung als Ansprechpartner pflegt, steht im leeren Portal", async ({ page }) => {
  await devLogin(page, {
    host: "portal.localtest.me",
    groups: "dashboard-admins",
    callbackPath: "/admin",
  });

  await page.getByTestId("ansprechpartner-form").getByRole("textbox").fill("IuK-Gruppe — iuk@example.org");
  await page.getByTestId("ansprechpartner-form").getByRole("button", { name: /Speichern/ }).click();

  // Neu laden statt dem Formular zu glauben: der Wert muss die Datenbank
  // erreicht haben, nicht nur den Client-State.
  await page.reload();
  await expect(page.getByTestId("ansprechpartner-form").getByRole("textbox")).toHaveValue(
    "IuK-Gruppe — iuk@example.org",
  );
});
```

- [ ] **Schritt 3: Die neue Spec laufen lassen**

```bash
rtk pnpm exec playwright test e2e/launcher.spec.ts
```

Erwartet: 4 Tests grün. Schlägt der Titel-Vergleich fehl, weil `module-title` nicht am erwarteten Knoten hängt: Task 3 setzt es im Umschalter-Auslöser, Task 4 im anonymen Link.

**Zum Leerzustand selbst:** ihn end-to-end zu erzwingen hieße, einer Sitzung jeden Zugang zu nehmen — `portal` und `qr` sind ohne Gruppenzwang für jeden Angemeldeten sichtbar, das ginge nur über `SUITE_ACCESS_GROUP_*` in der Server-Umgebung und damit für die ganze Suite. Der Leerzustand ist deshalb in `DiensteRaster.test.tsx` (Task 6) abgedeckt, und hier nur der Rundlauf des Wertes, den er anzeigt. Schreib diese Abgrenzung als Kommentar in die Spec, damit niemand später den vermeintlich fehlenden Test nachrüstet.

- [ ] **Schritt 4: Die ganze Suite**

```bash
rtk pnpm exec playwright test
```

Erwartet: alles grün, `keystone.spec.ts` eingeschlossen (in Task 4 nachgezogen).

- [ ] **Schritt 5: Commit**

```bash
rtk git add e2e/launcher.spec.ts && rtk git commit -m "test(e2e): Umschalter, Markierung und die zwei Oeffner auf Mobil"
```

---

## Abnahme von Plan A

Alle fünf Tore, in dieser Reihenfolge:

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build && rtk pnpm exec playwright test
```

Der echte Abruf je Shell-Variante steckt bereits im letzten Tor: `keystone.spec.ts` ruft `beta` (minimal), `kioskdemo` (kiosk) und `alpha`/`gamma` (full) über echtes HTTP ab, und Playwright startet dafür seinen eigenen Server. Ein von Hand gestarteter `pnpm dev` plus `curl` prüft weniger und legt danach die Suite lahm.

Dazu zwei Dinge, die kein Tor sieht und die von Hand angesehen werden müssen:

1. **Anonym auf `qr.localtest.me`**: kein Umschalter, ein Anmelden-Knopf — und die Portal-Datenbank wird nicht gelesen. Der Test dazu steht in `SuiteHeader.test.tsx`; was er nicht zeigt, ist, wie es aussieht.
2. **Der Leerzustand des Portals im Auge einer Person, die für nichts freigeschaltet ist.** Der Text ist die ganze Aussage der Seite; ob er trägt, entscheidet niemand am Selektor.
