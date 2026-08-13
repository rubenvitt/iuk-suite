# Modul `aufgaben` — Bauabschnitt 1 (Klickdummy als Modulroute) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein durchklickbarer Klickdummy des Moduls `aufgaben` als echte Route der iuk-Suite — echtes antd, echtes Suite-Theme, echte Shell, fest verdrahtete Demodaten, kein `_db/`.

**Architecture:** Neues Modul unter `src/app/m/aufgaben/`. Alle Seiten sind Server Components; die Seiteninhalte liegen als **reine, exportierte Funktionen** vor, die Daten und `jetzt` als Argumente nehmen (Muster: `verwaltungInhalt(db, jetzt)` in `lagerbuch/verwaltung/(arbeit)/page.tsx`) — nur so sind sie unter Vitest prüfbar. Die Rolle des Betrachters kommt in dieser Stufe aus einem Cookie, den ein sichtbar gekennzeichneter Demo-Rollenwechsler setzt; in Bauabschnitt 2 ersetzt ihn die Tabelle `person`. Interaktive Teile sind Client-Inseln, alles andere bleibt RSC.

**Tech Stack:** Next.js 16 (App Router, RSC) · Ant Design 6 · `react-icons/pi` (Phosphor) · CSS Modules · Vitest + Playwright · pnpm

## Global Constraints

Diese gelten für **jede** Aufgabe dieses Plans. Sie sind keine Empfehlungen, sondern jeweils ein Ausfall, den `pnpm build` nicht findet.

- **Kein Compound-Zugriff auf antd in einer Server Component.** Verboten: `Typography.*`, `Form.Item`, `Descriptions.Item`, `List.Item`, `Card.Meta`, `Collapse.Panel`, `Breadcrumb.Item`, `Input.Group`, `Input.TextArea`, `Space.Compact`, `Statistic.Countdown`, `Table.Summary`, `Tag.CheckableTag`, `Badge.Ribbon`, `Layout.Header`, `Grid.useBreakpoint`. Sicher: `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag`, `Row`, `Col`, `Empty`, `Button`.
- **`Typography` kommt im ganzen Modul nicht vor**, auch nicht in Client-Komponenten. Überschriften sind natives `<h1>`/`<h2>`/`<h3>` mit den Rollen aus `SCHRIFT`.
- **`@ant-design/icons` kommt im Modul nicht vor.** Der nackte Spezifizierer ergibt in einer Server Component HTTP 500 **beim Import**, nicht beim Rendern, und `"use client"` behebt das nicht, sondern macht es still. Zeichen kommen aus `react-icons/pi` — gemessen unbedenklich in RSC, Beleg: `src/app/m/lagerbuch/_ui/ikonen.tsx`. `src/core/shell/icons.test.ts` riegelt das repo-weit ab.
- **Werte, die eine Server Component liest, liegen in einem Modul ohne `"use client"`** — hier `_lib/`. Eine Konstante aus einem Client-Modul kommt als Client-Referenz an, HTTP 500 für die ganze Seite; TypeScript ist zufrieden, `build` findet nichts, Vitest kann es strukturell nicht sehen.
- **Eigenes Markup nutzt `--auf-*`, nie `--ant-*`.** antd deklariert seine Variablen auf seiner Scope-Klasse, nicht auf `:root`; eigenes Markup außerhalb eines antd-Komponentenbaums sieht sie nicht, und der Fehler ist still.
- **Dunkelmodus selektiert `:root[data-theme="dark"] .modul`**, nie `prefers-color-scheme`. Dort steht nie `auto`.
- **`colorError === colorPrimary === #c8000f`.** Kein `Alert type="error"`, kein rotes `Tag`, kein roter `Progress`, kein `type="primary" danger` auf einer Datenfläche. „Hoch" ist nicht Suite-Rot.
- **Bedienelemente setzen kein `size`.** `controlHeight` ist 56 und schon das richtige Touchmaß; `size="large"` wäre 72px. Ausnahme: `size="small"` in Tabellenzeilen.
- **Ein Breakpoint: 768px.** In `max-width`-Abfragen **767.98px**, nicht 768. Umschaltung ist CSS, nie JavaScript — beide Ausprägungen rendern, CSS blendet eine aus.
- **Abstände aus `SPACE`** (`@/core/theme/tokens`): 4/8/12/16/24/32. Das gilt für `Row gutter`, `margin*` und `padding` von Flächen — jede Datei, die davon etwas setzt, importiert `SPACE`. **Eine dokumentierte Ausnahme:** der Zwischenraum *innerhalb* einer Chipzeile ist 6px und liegt bewusst unter dem Raster; er trennt Geschwister in einer Zeile, nicht Flächen, und dieselbe Praxis steht in `lagerbuch/verwaltung/(arbeit)/page.tsx`. **Hierfür gibt es absichtlich keinen Test:** ein Scan, der jede Zahl außerhalb von `SPACE` verbietet, wäre strenger als der bestehende Code und würde beim ersten Lauf auf `lagerbuch` und auf diesem Modul selbst rot — ein Riegel, der die geltende Norm falsch behauptet, wird abgeschaltet statt befolgt.
- **Schrift ausschließlich aus `SCHRIFT`** (`@/core/theme/schrift`): `titel` 24/600 · `unterTitel` 20/600 · `kicker` 12/600 versal · `zahl` 30/700 · `text` 14/400 · `neben` 12/400 · `mono` 12/400. **Keine neue Größe.** Kein eigener Adapter im Modul — die Datei ist bereits das Ergebnis einer eingetretenen Verdopplung.
- **`href` trägt die äußere Pfadform** (`/verteilen`, nicht `/m/aufgaben/verteilen`). Unter dem Host-Rewrite führt die äußere Form an die richtige Stelle, die innere in einen doppelt präfixierten Pfad.
- **Bedeutung nie allein über Farbe.** Jeder Chip trägt Text. Fokus immer sichtbar, `outline` mit `outline-offset`, nie `outline: none` ohne Ersatz.
- **Ziffern, die verglichen werden, tragen `tabular-nums`** — in `SCHRIFT` schon enthalten, bei eigenem CSS explizit.

**Gates nach jeder Aufgabe:** `pnpm typecheck` · `pnpm lint` · `pnpm vitest run`. Nach Aufgaben mit neuen Routen zusätzlich `pnpm build` und der e2e-Abruf. Vor Abschluss des Bauabschnitts der vollständige Lauf inkl. `pnpm exec playwright test`.

## Was dieser Plan NICHT enthält

Bauabschnitte 2–6 aus `docs/superpowers/specs/2026-08-13-modul-aufgaben-design.md` §12: keine Datenbank, kein `_db/`, kein Eintrag in `MODULE_MIGRATIONS`, keine `COPY`-Zeile im `Dockerfile`, keine Server-Actions, die Zustand ändern, kein Upload, kein Drag & Drop. **Das Dreieck aus §11 des Specs entfällt in dieser Stufe vollständig** — es greift erst, wenn das Modul eine Datenbank hat.

---

## File Structure

**Bestehende Dateien, die geändert werden:**

| Datei | Verantwortung der Änderung |
|---|---|
| `src/core/registry.ts` | ein `ModuleDef`-Eintrag für `aufgaben` |
| `src/core/shell/icons.ts` | `ScheduleOutlined` in die `ICONS`-Map |
| `.env.example` | drei dokumentierte Zeilen (`SUITE_HOST_AUFGABEN`, `SUITE_ACCESS_GROUP_AUFGABEN`, `SUITE_ADMIN_GROUP_AUFGABEN`) |

**Neue Dateien — `_lib/` (kein `"use client"`, von Server Components gelesen):**

| Datei | Eine Verantwortung |
|---|---|
| `_lib/typen.ts` | die Datenformen: `Rolle`, `Status`, `Prioritaet`, `Person`, `Aufgabe`, `Routine`, `Nachweis`, `VerlaufZeile`, `DemoDaten` |
| `_lib/demoDaten.ts` | die fest verdrahteten Demodaten, aus einem Bezugsmontag abgeleitet |
| `_lib/anzeige.ts` | Beschriftungen, Chip-Töne und alle Ableitungen (`vorschlagOffen`, `istUeberfaellig`, `tagesBudget`, `fmtDauer`, `fmtStunden`) |
| `_lib/zugang.ts` | die Berechtigungsprädikate aus Spec §7 |
| `_lib/nav.ts` | die Modulnavigation je Rolle |
| `_lib/demoRolle.ts` | Cookie-Name, Vorgabe, und die reine Auflösung Cookie-Wert → `Person` |
| `_lib/demoRolleAktion.ts` | `"use server"` — die eine Action, die das Cookie setzt. **Streichposten** |

**Neue Dateien — `_ui/`:**

| Datei | Eine Verantwortung | Ebene |
|---|---|---|
| `_ui/aufgaben.module.css` | `--auf-*` in hell und dunkel, Chips, Kacheln, Wochengitter, Mobilumschaltung | — |
| `_ui/ikonen.tsx` | die eine Zeichenquelle des Moduls (`react-icons/pi`), Union als Autorität | RSC-fähig |
| `_ui/Chip.tsx` | Zustands- und Prioritätschip, Fläche und Text als Paar | RSC-fähig |
| `_ui/Kachel.tsx` | KPI-Kachel, `Card` plus 4px-Kante, Zahl in Tinte | RSC-fähig |
| `_ui/SeitenKopf.tsx` | das Seitenkopf-Muster: Brotkrume, `<h1>`, Aktionen, Kontextzeile | RSC-fähig |
| `_ui/Wochenplan.tsx` | Wochengitter **und** Mobilliste, beide gerendert | RSC-fähig |
| `_ui/AufgabenListe.tsx` | die Zeilenliste, die auf sechs Seiten wiederkehrt | RSC-fähig |
| `_ui/DemoRollenWechsler.tsx` | Client-Insel für den Rollenwechsel. **Streichposten** | `"use client"` |

**Neue Dateien — Routen:**

`layout.tsx` · `page.tsx` · `neu/page.tsx` · `verteilen/page.tsx` · `freigaben/page.tsx` · `plan/[personId]/page.tsx` · `routinen/page.tsx` · `personen/page.tsx` · `archiv/page.tsx` · `a/[id]/page.tsx`

**Neue Testdateien:** je Modul-Datei eine `.test.ts`/`.test.tsx` daneben, plus `e2e/aufgaben.spec.ts`.

---

## Task 1: Registrierung und erreichbare Modulroute

Zuerst das Riskanteste: dass das Modul überhaupt antwortet, die Shell rendert und das Icon stimmt. Drei der vier Suite-Fallen, die `build` nicht findet, schlagen hier zu oder nie.

**Files:**
- Modify: `src/core/registry.ts` (Ende der `MODULES`-Liste, vor `alpha`)
- Modify: `src/core/shell/icons.ts` (Import-Block und `ICONS`-Map)
- Modify: `.env.example`
- Create: `src/app/m/aufgaben/layout.tsx`
- Create: `src/app/m/aufgaben/page.tsx`
- Create: `src/app/m/aufgaben/_ui/aufgaben.module.css`
- Create: `src/app/m/aufgaben/registry.test.ts`
- Create: `e2e/aufgaben.spec.ts`

**Interfaces:**
- Consumes: `Shell` und `getModule` aus `@/core/shell/Shell` bzw. `@/core/registry`
- Produces: die CSS-Klasse `.modul` aus `_ui/aufgaben.module.css` als Träger aller `--auf-*`-Variablen, importiert vom `layout.tsx`. Jede spätere Aufgabe verlässt sich darauf, dass genau **ein** Element diese Klasse trägt und alle Modulinhalte darin liegen.

- [ ] **Step 1: Registry-Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findModule, canAccess, requiredGroupsFor } from "@/core/registry";
import { ICONS } from "@/core/shell/icons";

/**
 * WARUM DIESER TEST NEBEN `SuiteNav.test.tsx` STEHT, DAS DIE ICONS-MAP SCHON
 * GEGEN DIE REGISTRY PRUEFT: dort ist die Zusicherung „kein Modul-Icon fehlt",
 * hier ist sie „DIESES Modul ist so registriert, wie das Spec es sagt". Der
 * erste Test wird gruen, sobald irgendein Icon eingetragen ist; dieser wird nur
 * gruen, wenn der Eintrag stimmt.
 */
describe("Registrierung des Moduls aufgaben", () => {
  it("steht in der Registry mit den Werten aus Spec §3", () => {
    const mod = findModule("aufgaben");
    expect(mod).not.toBeNull();
    expect(mod!.title).toBe("Aufgaben");
    expect(mod!.icon).toBe("ScheduleOutlined");
    expect(mod!.shell).toBe("full");
    expect(mod!.requiresAuth).toBe(true);
    expect(mod!.prodHosts).toEqual([]);
    expect(mod!.switcherGroupSources).toEqual(["access"]);
  });

  /*
   * Bauabschnitt 1 haelt das Modul aus dem App-Switcher heraus: ein
   * halbfertiges Modul soll nicht in der Navigation aller Nutzer auftauchen.
   * Bauabschnitt 2 dreht den Wert und aendert DIESE Zeile mit — der Test ist
   * die Erinnerung daran, nicht ein Verbot.
   */
  it("ist in dieser Stufe nicht im App-Switcher", () => {
    expect(findModule("aufgaben")!.showInSwitcher).toBe(false);
  });

  it("verlangt die Zugangsgruppe iuk-aufgaben-nutzer", () => {
    const mod = findModule("aufgaben")!;
    expect(requiredGroupsFor(mod, {})).toEqual(["iuk-aufgaben-nutzer"]);
    expect(canAccess(mod, [], {})).toBe(false);
    expect(canAccess(mod, null, {})).toBe(false);
    expect(canAccess(mod, ["iuk-aufgaben-nutzer"], {})).toBe(true);
  });

  it("laesst die Zugangsgruppe per Env ueberschreiben", () => {
    const mod = findModule("aufgaben")!;
    const env = { SUITE_ACCESS_GROUP_AUFGABEN: "andere-gruppe" };
    expect(requiredGroupsFor(mod, env)).toEqual(["andere-gruppe"]);
    expect(canAccess(mod, ["iuk-aufgaben-nutzer"], env)).toBe(false);
    expect(canAccess(mod, ["andere-gruppe"], env)).toBe(true);
  });

  it("hat sein Icon in der ICONS-Map — sonst traegt es still das Portal-Icon", () => {
    expect(findModule("aufgaben")!.icon in ICONS).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/registry.test.ts`
Expected: FAIL — `expected null not to be null` beim ersten Test.

- [ ] **Step 3: Registry-Eintrag ergänzen**

In `src/core/registry.ts`, in der `MODULES`-Liste **vor** dem `alpha`-Eintrag einfügen:

```ts
  // aufgaben: Aufgabenverteilung und Zeitplanung fuer BuFDis
  // (docs/superpowers/specs/2026-08-13-modul-aufgaben-design.md).
  //
  // requiresAuth: true — und das ist hier RICHTIG, obwohl qr, feedback, files
  // und lagerbuch daneben ausdruecklich das Gegenteil festschreiben. Deren
  // Begruendung ist jeweils ein ANONYMER TEILPFAD (/f/…, /s/…, /t/…, der
  // QR-Generator). Dieses Modul hat keinen: jede Ansicht setzt eine bekannte
  // Person voraus. Ein uebernommenes `false` wuerde den generischen
  // Middleware-Riegel abschalten und die Durchsetzung komplett ins Modul
  // verlagern, ohne dass dadurch irgendetwas moeglich wuerde.
  //
  // requiredGroups ist eine VORGABE, keine Festschreibung: eine Instanz mit
  // anders benannten SSO-Gruppen setzt SUITE_ACCESS_GROUP_AUFGABEN. Die Gruppe
  // MUSS in Pocket ID existieren, bevor das Modul produktiv erreichbar ist —
  // eine nicht existierende Gruppe hier sperrt jeden aus, den Betreiber
  // eingeschlossen. Lokal ist das unkritisch: AUTH_DEV_LOGIN nimmt Gruppen als
  // freies Feld an.
  //
  // showInSwitcher: false NUR in Bauabschnitt 1 (Klickdummy). Bauabschnitt 2
  // dreht den Wert; `src/app/m/aufgaben/registry.test.ts` haelt beide Stufen
  // fest.
  //
  // icon: NICHT „irgendein existierender @ant-design/icons-Name" — wirksam ist
  // allein die Map ICONS in `core/shell/icons.ts`. Ein dort FEHLENDER Name
  // faellt STILL auf AppstoreOutlined zurueck, und „Aufgaben" waere vom
  // „Portal" in Kopfzeile UND Drawer nicht zu unterscheiden.
  { key: "aufgaben", title: "Aufgaben", icon: "ScheduleOutlined", shell: "full",
    requiresAuth: true, requiredGroups: ["iuk-aufgaben-nutzer"],
    adminGroups: ["iuk-aufgaben-koordination"], prodHosts: [],
    showInSwitcher: false, switcherGroupSources: ["access"] },
```

- [ ] **Step 4: Icon in die ICONS-Map**

In `src/core/shell/icons.ts` den Import-Block um `ScheduleOutlined` erweitern (alphabetisch nach `QrcodeOutlined`):

```ts
  QrcodeOutlined,
  ScheduleOutlined,
```

und in der `ICONS`-Map die Zeile ergänzen:

```ts
  ScheduleOutlined,
```

- [ ] **Step 5: Tests laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/registry.test.ts src/core/shell`
Expected: PASS — alle fünf Fälle grün, und `SuiteNav.test.tsx` („jedes Modul-Icon ist ein Schluessel der ICONS-Map") bleibt grün.

- [ ] **Step 6: `.env.example` dokumentieren**

Am Ende von `.env.example` anfügen:

```
# ─── Modul aufgaben ──────────────────────────────────────────────────────────
# Aufgabenverteilung und Zeitplanung fuer BuFDis.
#
# ACHTUNG, DIE SEMANTIK DER BEIDEN VARIABLENARTEN IST NICHT SYMMETRISCH:
#   SUITE_HOST_AUFGABEN=          → „keine Prod-Hosts". Eine ehrliche Aussage,
#                                    mit der ein Cutover ohne Rebuild
#                                    zurueckgenommen werden kann.
#   SUITE_ACCESS_GROUP_AUFGABEN=  → NICHT „keine Gruppe". Bei requiresAuth:true
#                                    waere die leere Liste eine stille Oeffnung
#                                    fuer alle Eingeloggten; der leere Wert ist
#                                    deshalb wirkungslos statt wirksam.
#
# In Dev/E2E braucht keine der drei Zeilen gesetzt zu werden: `moduleForHost`
# loest `aufgaben.localtest.me` ueber die eingebaute Wildcard-Konvention auf.
# SUITE_HOST_AUFGABEN=aufgaben.iuk-ue.de
# SUITE_ACCESS_GROUP_AUFGABEN=iuk-aufgaben-nutzer
# SUITE_ADMIN_GROUP_AUFGABEN=iuk-aufgaben-koordination
```

- [ ] **Step 7: CSS-Modul mit dem `.modul`-Träger anlegen**

Create `src/app/m/aufgaben/_ui/aufgaben.module.css`:

```css
/*
 * Modul-CSS von `aufgaben`. `.modul` ist der Traeger aller --auf-*-Variablen
 * und liegt im `layout.tsx` um die ganze Shell.
 *
 * WARUM EIGENE VARIABLEN UND NICHT --ant-*: antd deklariert seine Variablen auf
 * SEINER Scope-Klasse, die es an die Wurzelelemente seiner eigenen Komponenten
 * haengt — nicht an `:root`. Eigenes Markup ausserhalb eines
 * antd-Komponentenbaums sieht sie NICHT, und der Fehler ist still: die Regel
 * loest ins Leere auf und die Haarlinie verschwindet einfach.
 *
 * WARUM :root[data-theme="dark"] UND NICHT prefers-color-scheme: der Umschalter
 * der Suite hat drei Zustaende (auto|light|dark). Auf die Medienabfrage zu
 * selektieren bricht den Fall „System dunkel, Umschalter hell".
 *
 * JEDE HELLE VARIABLE BRAUCHT EIN DUNKLES GEGENSTUECK. Das prueft
 * `aufgaben-css.test.ts` strukturell — es ist der groesste versteckte Posten
 * bei jeder Uebernahme aus `lagerbuch`, dessen Palette durchgehend hell ist.
 */
.modul {
  --auf-tinte: #1a1d20;
  --auf-stahl: #5b6570;
  --auf-linie: #d9dde1;
  --auf-papier: #eef0f1;
}

:root[data-theme="dark"] .modul {
  --auf-tinte: #ece9e2;
  --auf-stahl: #9aa4ad;
  --auf-linie: #2a2f34;
  --auf-papier: #0f1113;
}

.modul a:focus-visible,
.modul button:focus-visible,
.modul input:focus-visible,
.modul select:focus-visible {
  outline: 2px solid var(--iuk-marke);
  outline-offset: 2px;
}
```

- [ ] **Step 8: Layout und Platzhalter-Seite anlegen**

Create `src/app/m/aufgaben/layout.tsx`:

```tsx
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import s from "./_ui/aufgaben.module.css";

/**
 * `.modul` liegt AUSSERHALB der Shell, wie im Lagerbuch (`VerwaltungsRahmen`):
 * so tragen auch die Teile der Shell, die Modulinhalt umschliessen, die
 * --auf-*-Variablen. Innerhalb waere der Traeger ein Nachfahre der Kopfzeile
 * und die Variablen fehlten dort.
 */
export default function AufgabenLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("aufgaben");
  return (
    <div className={s.modul}>
      <Shell variant={mod.shell} moduleKey={mod.key}>
        {children}
      </Shell>
    </div>
  );
}
```

Create `src/app/m/aufgaben/page.tsx`:

```tsx
/**
 * Platzhalter aus Task 1. Task 8 ersetzt ihn durch den rollenabhaengigen
 * Einstieg; bis dahin belegt er, dass die Route antwortet und die Shell traegt.
 */
export default function AufgabenPage() {
  return <div data-testid="aufgaben-content">Aufgaben (Klickdummy, Bauabschnitt 1)</div>;
}
```

- [ ] **Step 9: e2e-Abruf schreiben**

Create `e2e/aufgaben.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

const HOST = "aufgaben.localtest.me";
const GRUPPE = "iuk-aufgaben-nutzer";

/**
 * WARUM DIESER ABRUF DER WICHTIGSTE TEST DES BAUABSCHNITTS IST: die vier
 * Suite-Fallen, die diesen Plan bedrohen (antd-Compound in RSC, ein WERT aus
 * einem "use client"-Modul, @ant-design/icons in RSC, ein gestempeltes
 * data-theme="auto") bestehen ALLE `pnpm typecheck`, `pnpm lint`, `pnpm build`
 * UND `pnpm vitest run`. Nur ein echter Abruf zeigt den 500.
 */
test("Modulwurzel antwortet mit 200 und traegt die Suite-Kopfzeile", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: GRUPPE, callbackPath: "/" });
  await expect(page.getByTestId("aufgaben-content")).toBeVisible();
  await expect(page.getByTestId("suite-header")).toBeVisible();
});

test("ohne die Zugangsgruppe verweigert die Middleware den Zugang", async ({ page }) => {
  // Gegenprobe zum Test darueber: der Riegel liegt in der Middleware
  // (core/routing.ts), nicht im Modul — dasselbe Bild wie bei `alpha`
  // in keystone.spec.ts.
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  const res = await page.goto(`http://${HOST}:3100/`);
  expect(res?.status()).toBe(403);
});
```

- [ ] **Step 10: Gates laufen lassen**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
```
Expected: alle grün.

Dann der echte Abruf:
```bash
rtk pnpm exec playwright test e2e/aufgaben.spec.ts
```
Expected: beide Tests PASS. **Schlägt der erste mit HTTP 500 fehl, ist die Ursache eine der vier Fallen aus den Global Constraints — nicht die Registry.**

- [ ] **Step 11: Commit**

```bash
rtk git add src/core/registry.ts src/core/shell/icons.ts .env.example \
  src/app/m/aufgaben e2e/aufgaben.spec.ts && \
rtk git commit -m "feat(aufgaben): Modul registrieren und Route erreichbar machen

Registry-Eintrag, ICONS-Zeile (ohne sie traegt das Modul still das
Portal-Icon), .env.example-Dokumentation, Layout mit dem .modul-Traeger
der --auf-*-Variablen, Platzhalter-Seite.

Der e2e-Abruf ist hier der eigentliche Test: die vier Suite-Fallen, die
diesen Bauabschnitt bedrohen, bestehen typecheck, lint, build und Vitest."
```

---

## Task 2: Datenformen und Demodaten

**Files:**
- Create: `src/app/m/aufgaben/_lib/typen.ts`
- Create: `src/app/m/aufgaben/_lib/demoDaten.ts`
- Create: `src/app/m/aufgaben/_lib/demoDaten.test.ts`

**Interfaces:**
- Consumes: nichts aus früheren Aufgaben.
- Produces:
  - `_lib/typen.ts` exportiert die Typen `Rolle`, `Status`, `Prioritaet`, `NachweisArt`, `Person`, `Aufgabe`, `Routine`, `Nachweis`, `VerlaufZeile`, `DemoDaten` sowie die Wertelisten `ROLLEN`, `STATUS_WERTE`, `PRIORITAETEN`.
  - `_lib/demoDaten.ts` exportiert `montagDerWoche(jetzt: Date): Date`, `isoTag(d: Date): string`, `demoDaten(jetzt: Date): DemoDaten` und `DEMO_HEUTE_WOCHENTAG = 2`.
  - **Alle Datumsangaben sind ISO-Tagesstrings (`"2026-08-13"`), alle Uhrzeiten `"HH:MM"`.** Keine `Date`-Objekte in den Datenformen — sie wandern über Server-/Client-Grenzen und ein `Date` in einem Client-Prop ist eine Serialisierungsfalle.

- [ ] **Step 1: Typen anlegen**

Create `src/app/m/aufgaben/_lib/typen.ts`:

```ts
/*
 * DIE DATENFORMEN DES MODULS. KEIN "use client" — jede Server Component des
 * Moduls importiert von hier, und ein Wert-Import (die Listen unten) aus einem
 * als Client markierten Modul kaeme als Client-Referenz an statt als Wert:
 * HTTP 500 fuer die ganze Seite, unsichtbar fuer typecheck, build und Vitest.
 *
 * In Bauabschnitt 2 werden diese Typen zu Drizzle-Tabellen. Die Feldnamen sind
 * deshalb schon die des Specs §6, nur in camelCase — die Umbenennung auf
 * snake_case passiert dort in EINER Schicht, nicht verstreut.
 *
 * DATUM IST EIN ISO-TAGESSTRING, NIE EIN `Date`. Diese Objekte wandern als
 * Props in Client-Inseln; ein `Date` ueberlebt die Serialisierung nur als
 * String und kommt dann als String an, waehrend der Typ `Date` behauptet.
 */

export type Rolle = "koordination" | "auftrag" | "bufdi";
export const ROLLEN: readonly Rolle[] = ["koordination", "auftrag", "bufdi"];

/**
 * Sechs Zustaende (Spec §5). Die Werte tragen KEINE Umlaute, weil sie in
 * Bauabschnitt 2 Datenbankwerte werden; die Beschriftung liegt in
 * `anzeige.ts`.
 */
export type Status =
  | "eingegangen"
  | "verteilt"
  | "in_arbeit"
  | "freigabe_offen"
  | "abgeschlossen"
  | "zurueckgewiesen";

export const STATUS_WERTE: readonly Status[] = [
  "eingegangen",
  "verteilt",
  "in_arbeit",
  "freigabe_offen",
  "abgeschlossen",
  "zurueckgewiesen",
];

export type Prioritaet = "hoch" | "mittel" | "niedrig";
export const PRIORITAETEN: readonly Prioritaet[] = ["hoch", "mittel", "niedrig"];

export type NachweisArt = "text" | "bild";

export interface Person {
  id: string;
  name: string;
  initialen: string;
  rolle: Rolle;
  /** 468 = 7,8 Std. — die Vorgabe fuer einen BuFDi mit 39-Stunden-Woche. */
  sollMinutenTag: number;
  /** ISO-Tagesstring oder null. Null heisst „unbefristet aktiv". */
  aktivBis: string | null;
}

export interface Aufgabe {
  id: string;
  titel: string;
  beschreibung: string;
  prioritaet: Prioritaet;
  erstellerId: string;
  zugewiesenAn: string | null;
  status: Status;
  faelligAm: string;
  faelligUhrzeit: string | null;
  dauerMinuten: number;
  nachweisPflicht: boolean;
  nachweisArt: NachweisArt;
  /** Null genau dann, wenn `istSelbst` — eine Selbstaufgabe hat keinen Pruefer. */
  prueferId: string | null;
  /**
   * Fachlich folgt das aus `erstellerId === zugewiesenAn`, wird aber GESPEICHERT:
   * eine spaetere Umverteilung wuerde den Charakter der Aufgabe sonst still
   * aendern — aus einer freigabefreien Selbstaufgabe wuerde rueckwirkend eine
   * freigabepflichtige Fremdaufgabe.
   */
  istSelbst: boolean;
  /** Gesetzt = der BuFDi hat sie in einen Tag gelegt. */
  planDatum: string | null;
  planUhrzeit: string | null;
  /** Reihenfolge innerhalb des Tages. Ohne `planDatum` bedeutungslos. */
  planRang: number;
  /** Der Zeitvorschlag der Koordination (Spec §5.1). */
  vorschlagDatum: string | null;
  vorschlagUhrzeit: string | null;
}

export interface Routine {
  id: string;
  personId: string;
  titel: string;
  /** 0 = Montag … 4 = Freitag. */
  wochentage: number[];
  uhrzeit: string | null;
  dauerMinuten: number;
  aktiv: boolean;
}

export interface Nachweis {
  id: string;
  aufgabeId: string;
  art: NachweisArt;
  text: string | null;
  dateiname: string | null;
  erstelltVon: string;
  erstelltAm: string;
}

export interface VerlaufZeile {
  id: string;
  aufgabeId: string;
  ereignis: string;
  akteurId: string;
  notiz: string | null;
  /** ISO-Tagesstring plus Uhrzeit, z. B. „2026-08-10 08:14". */
  ts: string;
}

export interface DemoDaten {
  personen: Person[];
  aufgaben: Aufgabe[];
  routinen: Routine[];
  nachweise: Nachweis[];
  verlauf: VerlaufZeile[];
}
```

- [ ] **Step 2: Test für die Demodaten schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_lib/demoDaten.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { demoDaten, isoTag, montagDerWoche } from "./demoDaten";
import { PRIORITAETEN, STATUS_WERTE } from "./typen";

/**
 * Ein Donnerstag: 2026-08-13. Alle Faelle rechnen gegen diesen Tag, damit der
 * Test nicht am Wochentag des Laufs haengt — genau der Grund, warum
 * `demoDaten` `jetzt` als Argument nimmt statt `new Date()` selbst zu rufen.
 */
const DONNERSTAG = new Date("2026-08-13T10:00:00Z");

describe("montagDerWoche", () => {
  it("findet den Montag derselben Woche", () => {
    expect(isoTag(montagDerWoche(DONNERSTAG))).toBe("2026-08-10");
  });

  it("gibt an einem Montag den Tag selbst zurueck", () => {
    expect(isoTag(montagDerWoche(new Date("2026-08-10T23:00:00Z")))).toBe("2026-08-10");
  });

  /*
   * DER FALL, DER EINE NAIVE FASSUNG KIPPT: `getDay()` gibt am Sonntag 0, und
   * `d - 0 + 1` landet auf dem Montag der FOLGENDEN Woche. Fachlich gehoert
   * der Sonntag zur Woche, die am Montag davor begann.
   */
  it("rechnet am Sonntag rueckwaerts, nicht vorwaerts", () => {
    expect(isoTag(montagDerWoche(new Date("2026-08-16T12:00:00Z")))).toBe("2026-08-10");
  });
});

describe("demoDaten", () => {
  const d = demoDaten(DONNERSTAG);

  it("hat sechs Personen: eine Koordination, zwei Auftrag, drei BuFDi", () => {
    expect(d.personen).toHaveLength(6);
    const je = (r: string) => d.personen.filter((p) => p.rolle === r).length;
    expect(je("koordination")).toBe(1);
    expect(je("auftrag")).toBe(2);
    expect(je("bufdi")).toBe(3);
  });

  it("gibt jeder Person eindeutige id und Initialen", () => {
    expect(new Set(d.personen.map((p) => p.id)).size).toBe(d.personen.length);
    expect(new Set(d.personen.map((p) => p.initialen)).size).toBe(d.personen.length);
  });

  it("belegt jeden der sechs Zustaende mindestens einmal", () => {
    const belegt = new Set(d.aufgaben.map((a) => a.status));
    expect([...STATUS_WERTE].filter((s) => !belegt.has(s))).toEqual([]);
  });

  it("belegt jede der drei Prioritaeten mindestens einmal", () => {
    const belegt = new Set(d.aufgaben.map((a) => a.prioritaet));
    expect([...PRIORITAETEN].filter((p) => !belegt.has(p))).toEqual([]);
  });

  it("verweist nur auf existierende Personen", () => {
    const ids = new Set(d.personen.map((p) => p.id));
    for (const a of d.aufgaben) {
      expect(ids.has(a.erstellerId), `Ersteller von ${a.id}`).toBe(true);
      if (a.zugewiesenAn) expect(ids.has(a.zugewiesenAn), `Empfaenger von ${a.id}`).toBe(true);
      if (a.prueferId) expect(ids.has(a.prueferId), `Pruefer von ${a.id}`).toBe(true);
    }
    for (const r of d.routinen) expect(ids.has(r.personId), `Person von ${r.id}`).toBe(true);
  });

  /*
   * DIE INVARIANTE AUS SPEC §5.2, DIE DEN GANZEN FREIGABEZWEIG TRAEGT: eine
   * Selbstaufgabe hat keinen Pruefer und ist sich selbst zugewiesen. Waere das
   * in den Demodaten verletzt, zeigte der Klickdummy einen Freigabeknopf, den
   * es fachlich nicht gibt — und niemandem faellt es auf, weil er funktioniert.
   */
  it("haelt die Selbstaufgaben-Invariante", () => {
    for (const a of d.aufgaben) {
      if (a.istSelbst) {
        expect(a.prueferId, `${a.id} ist selbst gestellt, hat aber einen Pruefer`).toBeNull();
        expect(a.zugewiesenAn).toBe(a.erstellerId);
      } else {
        expect(a.prueferId, `${a.id} ist fremd gestellt, hat aber keinen Pruefer`).not.toBeNull();
      }
    }
  });

  it("gibt fremd gestellten Aufgaben den Ersteller als Pruefer", () => {
    for (const a of d.aufgaben.filter((x) => !x.istSelbst)) {
      expect(a.prueferId).toBe(a.erstellerId);
    }
  });

  it("hat eine unverteilte Aufgabe genau dann ohne Empfaenger", () => {
    for (const a of d.aufgaben) {
      expect(a.zugewiesenAn === null).toBe(a.status === "eingegangen");
    }
  });

  it("liefert zu jeder Aufgabe in freigabe_offen einen Nachweis", () => {
    const mitNachweis = new Set(d.nachweise.map((n) => n.aufgabeId));
    for (const a of d.aufgaben.filter((x) => x.status === "freigabe_offen")) {
      expect(mitNachweis.has(a.id), `${a.id} wartet auf Freigabe ohne Nachweis`).toBe(true);
    }
  });

  it("gibt jeder Aufgabe mindestens eine Verlaufszeile", () => {
    const mitVerlauf = new Set(d.verlauf.map((v) => v.aufgabeId));
    for (const a of d.aufgaben) {
      expect(mitVerlauf.has(a.id), `${a.id} hat keinen Verlauf`).toBe(true);
    }
  });

  /*
   * Damit der Klickdummy in JEDER Woche derselbe ist: die Plandaten liegen in
   * der Woche des Aufrufs, nicht auf festen Kalendertagen.
   */
  it("legt alle Plandaten in die Woche des Aufrufs", () => {
    const montag = isoTag(montagDerWoche(DONNERSTAG));
    const freitag = "2026-08-14";
    for (const a of d.aufgaben.filter((x) => x.planDatum)) {
      expect(a.planDatum! >= montag && a.planDatum! <= freitag, `${a.id}: ${a.planDatum}`).toBe(true);
    }
  });

  it("belegt den Fall „Zeitvorschlag offen" mindestens einmal", () => {
    const offen = d.aufgaben.filter(
      (a) => a.status === "verteilt" && a.planDatum === null && a.vorschlagDatum !== null,
    );
    expect(offen.length).toBeGreaterThan(0);
  });

  it("belegt eine ueberfaellige und eine ausgeschiedene Person", () => {
    expect(d.aufgaben.some((a) => a.faelligAm < "2026-08-13" && a.status !== "abgeschlossen")).toBe(true);
    expect(d.personen.some((p) => p.aktivBis !== null)).toBe(true);
  });
});
```

- [ ] **Step 3: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/demoDaten.test.ts`
Expected: FAIL — `Failed to resolve import "./demoDaten"`.

- [ ] **Step 4: Demodaten schreiben**

Create `src/app/m/aufgaben/_lib/demoDaten.ts`:

```ts
import type { DemoDaten } from "./typen";

/*
 * DIE DEMODATEN DES KLICKDUMMYS — Streichposten. Bauabschnitt 2 ersetzt sie
 * durch die Datenbank; das Gegenstueck, das dann BLEIBT, ist `seedLokal.ts`.
 *
 * `jetzt` KOMMT ALS ARGUMENT, NICHT AUS `new Date()`. Zwei Gruende, und beide
 * sind Erfahrung aus diesem Repo: ein Test, der gegen die echte Uhr laeuft,
 * kippt am Wochenende (und dann montags wieder nicht), und die Plandaten
 * sollen in JEDER Woche in der Woche des Aufrufs liegen, damit der Klickdummy
 * nicht mit der Zeit verwaist.
 *
 * Die Belegung folgt Spec §5: jeder der sechs Zustaende mindestens einmal,
 * jede Prioritaet, der abgeleitete Fall „Zeitvorschlag offen", eine
 * ueberfaellige Aufgabe, eine ausgeschiedene Person, Selbst- und
 * Fremdaufgaben. `demoDaten.test.ts` haelt das fest — die Liste unten ist die
 * Fassung, nicht die Zusicherung.
 */

/** ISO-Tagesstring in Ortszeit-Semantik (die Daten sind Kalendertage, keine Zeitpunkte). */
export function isoTag(d: Date): string {
  const j = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const t = String(d.getUTCDate()).padStart(2, "0");
  return `${j}-${m}-${t}`;
}

/**
 * Der Montag der Woche, in der `jetzt` liegt.
 *
 * `getUTCDay()` gibt am Sonntag 0. Ein naives `tag - wochentag + 1` landet dann
 * auf dem Montag der FOLGENDEN Woche — fachlich gehoert der Sonntag zur Woche,
 * die am Montag davor begann. Deshalb der Sonderfall.
 */
export function montagDerWoche(jetzt: Date): Date {
  const d = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
  const wochentag = d.getUTCDay();
  const versatz = wochentag === 0 ? -6 : 1 - wochentag;
  d.setUTCDate(d.getUTCDate() + versatz);
  return d;
}

/** Der Wochentag, den der Klickdummy als „heute" hervorhebt, wenn die Woche nicht die laufende ist. */
export const DEMO_HEUTE_WOCHENTAG = 2;

export function demoDaten(jetzt: Date): DemoDaten {
  const montag = montagDerWoche(jetzt);
  /** `tag(0)` = Montag … `tag(4)` = Freitag der Woche des Aufrufs. */
  const tag = (versatz: number): string => {
    const d = new Date(montag);
    d.setUTCDate(d.getUTCDate() + versatz);
    return isoTag(d);
  };
  /** Ein Tag der Vorwoche — fuer die ueberfaellige und die abgeschlossene Aufgabe. */
  const vorwoche = (versatz: number): string => tag(versatz - 7);

  return {
    personen: [
      { id: "sarah", name: "Sarah", initialen: "SA", rolle: "koordination", sollMinutenTag: 468, aktivBis: null },
      { id: "schulle", name: "Schulle", initialen: "SC", rolle: "auftrag", sollMinutenTag: 468, aktivBis: null },
      { id: "joenne", name: "Jönne", initialen: "JÖ", rolle: "auftrag", sollMinutenTag: 468, aktivBis: null },
      { id: "lea", name: "Lea", initialen: "LE", rolle: "bufdi", sollMinutenTag: 468, aktivBis: null },
      { id: "noah", name: "Noah", initialen: "NO", rolle: "bufdi", sollMinutenTag: 468, aktivBis: null },
      // Die ausgeschiedene Person: Dienstjahr beendet. Sie verschwindet aus
      // Verteillisten und Plan-Navigation, ihre Geschichte bleibt lesbar.
      { id: "mika", name: "Mika", initialen: "MI", rolle: "bufdi", sollMinutenTag: 468, aktivBis: vorwoche(4) },
    ],

    aufgaben: [
      // eingegangen — der Posteingang, den Sarah verteilt
      {
        id: "a1",
        titel: "Social-Media-Fotos sortieren",
        beschreibung:
          "Fotos vom Sommerfest sichten, unscharfe Aufnahmen aussortieren und eine Auswahl von maximal 30 Bildern zusammenstellen.",
        prioritaet: "niedrig", erstellerId: "joenne", zugewiesenAn: null,
        status: "eingegangen", faelligAm: tag(4), faelligUhrzeit: "14:00",
        dauerMinuten: 120, nachweisPflicht: false, nachweisArt: "text",
        prueferId: "joenne", istSelbst: false,
        planDatum: null, planUhrzeit: null, planRang: 0,
        vorschlagDatum: null, vorschlagUhrzeit: null,
      },
      {
        id: "a2",
        titel: "Erste-Hilfe-Material im MTW nachfüllen",
        beschreibung:
          "Verbandkasten prüfen, abgelaufene Artikel aussondern und die Fehlmengen an das Lagerbuch melden.",
        prioritaet: "hoch", erstellerId: "schulle", zugewiesenAn: null,
        status: "eingegangen", faelligAm: tag(3), faelligUhrzeit: "12:00",
        dauerMinuten: 90, nachweisPflicht: true, nachweisArt: "bild",
        prueferId: "schulle", istSelbst: false,
        planDatum: null, planUhrzeit: null, planRang: 0,
        vorschlagDatum: null, vorschlagUhrzeit: null,
      },
      // verteilt MIT offenem Zeitvorschlag — der abgeleitete Zustand aus §5.1
      {
        id: "a3",
        titel: "Materiallager inventarisieren",
        beschreibung:
          "Bestände im Materiallager prüfen, Fehlmengen notieren und die Liste im Ordner „Lager 2026“ aktualisieren.",
        prioritaet: "hoch", erstellerId: "schulle", zugewiesenAn: "lea",
        status: "verteilt", faelligAm: tag(3), faelligUhrzeit: "12:00",
        dauerMinuten: 120, nachweisPflicht: true, nachweisArt: "bild",
        prueferId: "schulle", istSelbst: false,
        planDatum: null, planUhrzeit: null, planRang: 0,
        vorschlagDatum: tag(3), vorschlagUhrzeit: "09:00",
      },
      // verteilt UND eingeplant, ohne feste Uhrzeit
      {
        id: "a4",
        titel: "Fahrzeugpflege MTW",
        beschreibung:
          "Innenraum aussaugen, Scheiben reinigen und Verbrauchsmaterial im Fahrzeug auffüllen.",
        prioritaet: "mittel", erstellerId: "sarah", zugewiesenAn: "noah",
        status: "verteilt", faelligAm: tag(3), faelligUhrzeit: "15:00",
        dauerMinuten: 90, nachweisPflicht: true, nachweisArt: "bild",
        prueferId: "sarah", istSelbst: false,
        planDatum: tag(3), planUhrzeit: null, planRang: 2,
        vorschlagDatum: tag(3), vorschlagUhrzeit: null,
      },
      // in_arbeit, mit fester Uhrzeit — der Anker in der Tagesspalte
      {
        id: "a5",
        titel: "Aushang Ferienprogramm aktualisieren",
        beschreibung:
          "Die neuen Uhrzeiten eintragen, Kontaktdaten prüfen und den aktualisierten Aushang als PDF speichern.",
        prioritaet: "hoch", erstellerId: "sarah", zugewiesenAn: "lea",
        status: "in_arbeit", faelligAm: tag(2), faelligUhrzeit: "15:00",
        dauerMinuten: 90, nachweisPflicht: true, nachweisArt: "text",
        prueferId: "sarah", istSelbst: false,
        planDatum: tag(2), planUhrzeit: "11:30", planRang: 1,
        vorschlagDatum: null, vorschlagUhrzeit: null,
      },
      // freigabe_offen, Prüfer Schulle — der Kern der Anforderung 4
      {
        id: "a6",
        titel: "Getränkevorrat auffüllen",
        beschreibung:
          "Bestand im Aufenthaltsraum prüfen und fehlende Getränkekisten aus dem Lager nachfüllen.",
        prioritaet: "mittel", erstellerId: "schulle", zugewiesenAn: "lea",
        status: "freigabe_offen", faelligAm: tag(1), faelligUhrzeit: "16:00",
        dauerMinuten: 60, nachweisPflicht: true, nachweisArt: "bild",
        prueferId: "schulle", istSelbst: false,
        planDatum: tag(1), planUhrzeit: "14:00", planRang: 1,
        vorschlagDatum: null, vorschlagUhrzeit: null,
      },
      // freigabe_offen, Prüfer Sarah — belegt „meine" gegen „in Vertretung"
      {
        id: "a7",
        titel: "Infomappe Empfang ergänzen",
        beschreibung: "Die neuen Ansprechpartner einheften und das Inhaltsverzeichnis aktualisieren.",
        prioritaet: "niedrig", erstellerId: "sarah", zugewiesenAn: "noah",
        status: "freigabe_offen", faelligAm: tag(1), faelligUhrzeit: "13:00",
        dauerMinuten: 90, nachweisPflicht: true, nachweisArt: "text",
        prueferId: "sarah", istSelbst: false,
        planDatum: tag(1), planUhrzeit: "10:00", planRang: 1,
        vorschlagDatum: null, vorschlagUhrzeit: null,
      },
      // zurueckgewiesen, mit Begründung im Verlauf
      {
        id: "a8",
        titel: "Schlüsselliste prüfen",
        beschreibung: "Alle ausgegebenen Schlüssel gegen die Liste abgleichen und Abweichungen notieren.",
        prioritaet: "mittel", erstellerId: "schulle", zugewiesenAn: "noah",
        status: "zurueckgewiesen", faelligAm: tag(0), faelligUhrzeit: "17:00",
        dauerMinuten: 60, nachweisPflicht: true, nachweisArt: "text",
        prueferId: "schulle", istSelbst: false,
        planDatum: tag(4), planUhrzeit: null, planRang: 1,
        vorschlagDatum: null, vorschlagUhrzeit: null,
      },
      // überfällig UND unerledigt: Frist letzte Woche, Zustand verteilt
      {
        id: "a9",
        titel: "Ausrüstungskisten beschriften",
        beschreibung: "Die neuen Kisten im Materiallager mit Etiketten aus dem Lagerbuch versehen.",
        prioritaet: "niedrig", erstellerId: "joenne", zugewiesenAn: "noah",
        status: "verteilt", faelligAm: vorwoche(4), faelligUhrzeit: "17:00",
        dauerMinuten: 60, nachweisPflicht: false, nachweisArt: "text",
        prueferId: "joenne", istSelbst: false,
        planDatum: null, planUhrzeit: null, planRang: 0,
        vorschlagDatum: null, vorschlagUhrzeit: null,
      },
      // Selbstaufgabe, eingeplant — Kurzstrecke ohne Prüfer
      {
        id: "a10",
        titel: "Website-Termine prüfen",
        beschreibung: "Kalender auf der Website mit dem internen Terminplan abgleichen.",
        prioritaet: "niedrig", erstellerId: "lea", zugewiesenAn: "lea",
        status: "verteilt", faelligAm: tag(4), faelligUhrzeit: "15:00",
        dauerMinuten: 60, nachweisPflicht: false, nachweisArt: "text",
        prueferId: null, istSelbst: true,
        planDatum: tag(4), planUhrzeit: null, planRang: 1,
        vorschlagDatum: null, vorschlagUhrzeit: null,
      },
      // abgeschlossen, Selbstaufgabe — belegt „keine Freigabe noetig"
      {
        id: "a11",
        titel: "Ablage Vorwoche sortieren",
        beschreibung: "Eingegangene Post der Vorwoche einsortieren und Doppel aussondern.",
        prioritaet: "niedrig", erstellerId: "noah", zugewiesenAn: "noah",
        status: "abgeschlossen", faelligAm: vorwoche(4), faelligUhrzeit: "16:00",
        dauerMinuten: 45, nachweisPflicht: false, nachweisArt: "text",
        prueferId: null, istSelbst: true,
        planDatum: vorwoche(4), planUhrzeit: null, planRang: 1,
        vorschlagDatum: null, vorschlagUhrzeit: null,
      },
      // abgeschlossen, Fremdaufgabe mit erteilter Freigabe
      {
        id: "a12",
        titel: "Rettungswache Fotos für Bericht",
        beschreibung: "Drei Aufnahmen der neuen Fahrzeughalle für den Jahresbericht anfertigen.",
        prioritaet: "mittel", erstellerId: "joenne", zugewiesenAn: "lea",
        status: "abgeschlossen", faelligAm: vorwoche(3), faelligUhrzeit: "12:00",
        dauerMinuten: 60, nachweisPflicht: true, nachweisArt: "bild",
        prueferId: "joenne", istSelbst: false,
        planDatum: vorwoche(3), planUhrzeit: "10:00", planRang: 1,
        vorschlagDatum: null, vorschlagUhrzeit: null,
      },
    ],

    routinen: [
      { id: "r1", personId: "lea", titel: "Post & Tagesstart", wochentage: [0, 1, 2, 3, 4], uhrzeit: "08:00", dauerMinuten: 45, aktiv: true },
      { id: "r2", personId: "lea", titel: "Telefon & Empfang", wochentage: [1, 3], uhrzeit: "15:00", dauerMinuten: 60, aktiv: true },
      { id: "r3", personId: "noah", titel: "Fahrzeug-Kurzcheck", wochentage: [0, 2, 4], uhrzeit: "08:00", dauerMinuten: 60, aktiv: true },
      { id: "r4", personId: "noah", titel: "Materialausgabe", wochentage: [1, 3], uhrzeit: null, dauerMinuten: 90, aktiv: true },
      // Eine inaktive Routine: belegt, dass sie nicht ins Budget zaehlt.
      { id: "r5", personId: "noah", titel: "Archivdienst (ruht)", wochentage: [2], uhrzeit: null, dauerMinuten: 120, aktiv: false },
      { id: "r6", personId: "mika", titel: "Ablage & Archiv", wochentage: [2], uhrzeit: "13:00", dauerMinuten: 120, aktiv: true },
    ],

    nachweise: [
      { id: "n1", aufgabeId: "a6", art: "bild", text: "Vorrat aufgefüllt. Zwei Kisten Wasser und eine Kiste Apfelschorle ergänzt.", dateiname: "getraenkevorrat_nachher.jpg", erstelltVon: "lea", erstelltAm: `${tag(1)} 15:04` },
      { id: "n2", aufgabeId: "a7", art: "text", text: "Mappe vollständig aktualisiert; alle neuen Register sind eingeheftet.", dateiname: null, erstelltVon: "noah", erstelltAm: `${tag(1)} 11:42` },
      { id: "n3", aufgabeId: "a8", art: "text", text: "Liste abgeglichen.", dateiname: null, erstelltVon: "noah", erstelltAm: `${tag(0)} 16:20` },
      { id: "n4", aufgabeId: "a12", art: "bild", text: "Drei Aufnahmen bei Tageslicht.", dateiname: "fahrzeughalle_01.jpg", erstelltVon: "lea", erstelltAm: `${vorwoche(3)} 11:10` },
    ],

    verlauf: [
      { id: "v1", aufgabeId: "a1", ereignis: "Aufgabe eingestellt", akteurId: "joenne", notiz: null, ts: `${tag(2)} 14:47` },
      { id: "v2", aufgabeId: "a2", ereignis: "Aufgabe eingestellt", akteurId: "schulle", notiz: null, ts: `${tag(2)} 07:55` },
      { id: "v3", aufgabeId: "a3", ereignis: "Aufgabe eingestellt", akteurId: "schulle", notiz: null, ts: `${tag(0)} 08:14` },
      { id: "v4", aufgabeId: "a3", ereignis: "An Lea verteilt", akteurId: "sarah", notiz: "Zeitvorschlag: Donnerstag, 09:00", ts: `${tag(0)} 09:02` },
      { id: "v5", aufgabeId: "a4", ereignis: "Aufgabe eingestellt", akteurId: "sarah", notiz: null, ts: `${tag(1)} 10:20` },
      { id: "v6", aufgabeId: "a4", ereignis: "An Noah verteilt", akteurId: "sarah", notiz: null, ts: `${tag(1)} 10:22` },
      { id: "v7", aufgabeId: "a4", ereignis: "Für Donnerstag eingeplant", akteurId: "noah", notiz: null, ts: `${tag(1)} 16:05` },
      { id: "v8", aufgabeId: "a5", ereignis: "Aufgabe eingestellt", akteurId: "sarah", notiz: null, ts: `${tag(1)} 09:05` },
      { id: "v9", aufgabeId: "a5", ereignis: "Bearbeitung gestartet", akteurId: "lea", notiz: null, ts: `${tag(2)} 11:31` },
      { id: "v10", aufgabeId: "a6", ereignis: "Aufgabe eingestellt", akteurId: "schulle", notiz: null, ts: `${tag(1)} 08:20` },
      { id: "v11", aufgabeId: "a6", ereignis: "Mit Bildnachweis fertig gemeldet", akteurId: "lea", notiz: null, ts: `${tag(1)} 15:04` },
      { id: "v12", aufgabeId: "a7", ereignis: "Aufgabe eingestellt", akteurId: "sarah", notiz: null, ts: `${tag(0)} 12:11` },
      { id: "v13", aufgabeId: "a7", ereignis: "Fertig gemeldet", akteurId: "noah", notiz: null, ts: `${tag(1)} 11:42` },
      { id: "v14", aufgabeId: "a8", ereignis: "Aufgabe eingestellt", akteurId: "schulle", notiz: null, ts: `${tag(0)} 07:40` },
      { id: "v15", aufgabeId: "a8", ereignis: "Zurückgewiesen", akteurId: "schulle", notiz: "Die Abweichungen fehlen — bitte die drei fehlenden Schlüssel einzeln benennen.", ts: `${tag(1)} 09:15` },
      { id: "v16", aufgabeId: "a9", ereignis: "Aufgabe eingestellt", akteurId: "joenne", notiz: null, ts: `${vorwoche(1)} 10:00` },
      { id: "v17", aufgabeId: "a9", ereignis: "An Noah verteilt", akteurId: "sarah", notiz: null, ts: `${vorwoche(1)} 10:30` },
      { id: "v18", aufgabeId: "a10", ereignis: "Eigene Aufgabe angelegt", akteurId: "lea", notiz: null, ts: `${tag(1)} 13:42` },
      { id: "v19", aufgabeId: "a11", ereignis: "Eigene Aufgabe angelegt", akteurId: "noah", notiz: null, ts: `${vorwoche(4)} 08:10` },
      { id: "v20", aufgabeId: "a11", ereignis: "Direkt abgeschlossen", akteurId: "noah", notiz: "Keine Freigabe nötig", ts: `${vorwoche(4)} 16:02` },
      { id: "v21", aufgabeId: "a12", ereignis: "Aufgabe eingestellt", akteurId: "joenne", notiz: null, ts: `${vorwoche(2)} 09:00` },
      { id: "v22", aufgabeId: "a12", ereignis: "Mit Bildnachweis fertig gemeldet", akteurId: "lea", notiz: null, ts: `${vorwoche(3)} 11:10` },
      { id: "v23", aufgabeId: "a12", ereignis: "Freigegeben von Sarah in Vertretung für Jönne", akteurId: "sarah", notiz: null, ts: `${vorwoche(4)} 08:45` },
    ],
  };
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/demoDaten.test.ts`
Expected: PASS — alle Fälle grün.

- [ ] **Step 6: Gates und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && \
rtk git add src/app/m/aufgaben/_lib && \
rtk git commit -m "feat(aufgaben): Datenformen und Demodaten

Die Typen sind schon die des Specs §6, nur in camelCase — Bauabschnitt 2
uebersetzt in EINER Schicht auf Drizzle statt verstreut. Datum ist
durchgehend ein ISO-Tagesstring, nie ein Date: diese Objekte wandern als
Props in Client-Inseln, und ein Date behauptet dort einen Typ, den es nach
der Serialisierung nicht mehr hat.

\`demoDaten(jetzt)\` nimmt die Zeit als Argument. Ein Test gegen die echte
Uhr kippt am Wochenende, und die Plandaten sollen in jeder Woche in der
Woche des Aufrufs liegen, damit der Klickdummy nicht verwaist."
```

---

## Task 3: Ableitungen und Anzeigetexte

Die Rechenkerne des Moduls. Sie sind der einzige Ort, an dem „Zeitvorschlag offen", „überfällig" und das Tagesbudget definiert werden — jede Seite und jede KPI-Kachel liest von hier, nie mit eigener Bedingung.

**Files:**
- Create: `src/app/m/aufgaben/_lib/anzeige.ts`
- Create: `src/app/m/aufgaben/_lib/anzeige.test.ts`

**Interfaces:**
- Consumes: `Aufgabe`, `Routine`, `Person`, `Status`, `Prioritaet`, `STATUS_WERTE`, `PRIORITAETEN` aus `_lib/typen.ts`
- Produces:
  - `export type ChipTon = "grau" | "stahl" | "ocker" | "ok" | "achtung"`
  - `export type PrioritaetForm = "gefuellt" | "kontur" | "text"`
  - `export const STATUS_TEXT: Record<Status, string>`, `STATUS_TON: Record<Status, ChipTon>`
  - `export const PRIORITAET_TEXT: Record<Prioritaet, string>`, `PRIORITAET_FORM: Record<Prioritaet, PrioritaetForm>`
  - `vorschlagOffen(a: Aufgabe): boolean`
  - `istUeberfaellig(a: Aufgabe, heute: string): boolean`
  - `wochentagVon(iso: string): number | null`
  - `routineAmTag(r: Routine, wochentag: number): boolean`
  - `interface Budget { verplantMinuten: number; sollMinuten: number; ueberbucht: boolean }`
  - `tagesBudget(aufgaben: Aufgabe[], routinen: Routine[], person: Person, datum: string): Budget`
  - `fmtDauer(minuten: number): string`, `fmtStunden(minuten: number): string`, `fmtTagKurz(iso: string): string`

- [ ] **Step 1: Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_lib/anzeige.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PRIORITAETEN,
  STATUS_WERTE,
  type Aufgabe,
  type Person,
  type Routine,
} from "./typen";
import {
  PRIORITAET_FORM,
  PRIORITAET_TEXT,
  STATUS_TEXT,
  STATUS_TON,
  fmtDauer,
  fmtStunden,
  fmtTagKurz,
  istUeberfaellig,
  routineAmTag,
  tagesBudget,
  vorschlagOffen,
  wochentagVon,
} from "./anzeige";

/** Eine Vorlage, aus der jeder Fall nur das aendert, was er prueft. */
const AUFGABE: Aufgabe = {
  id: "x", titel: "T", beschreibung: "B", prioritaet: "mittel",
  erstellerId: "schulle", zugewiesenAn: "lea", status: "verteilt",
  faelligAm: "2026-08-14", faelligUhrzeit: null, dauerMinuten: 60,
  nachweisPflicht: false, nachweisArt: "text", prueferId: "schulle",
  istSelbst: false, planDatum: null, planUhrzeit: null, planRang: 0,
  vorschlagDatum: null, vorschlagUhrzeit: null,
};

const LEA: Person = {
  id: "lea", name: "Lea", initialen: "LE", rolle: "bufdi",
  sollMinutenTag: 468, aktivBis: null,
};

describe("Beschriftungen sind vollstaendig", () => {
  /*
   * ERSCHOEPFEND, NICHT STICHPROBENWEISE: ein fehlender Eintrag ergaebe
   * `undefined` als Beschriftung — im Browser eine leere Stelle, kein Fehler.
   * Und `STATUS_TON` waere `undefined` als CSS-Klasse: der Chip bekaeme Polster
   * und Rundung, aber KEINE FARBE. Genau diese Namensfalle ist im Lagerbuch
   * dokumentiert (`_ui/Chip.tsx`).
   */
  it("hat fuer jeden Status einen Text und einen Ton", () => {
    for (const s of STATUS_WERTE) {
      expect(STATUS_TEXT[s], `Text fuer ${s}`).toBeTruthy();
      expect(STATUS_TON[s], `Ton fuer ${s}`).toBeTruthy();
    }
  });

  it("hat fuer jede Prioritaet einen Text und eine Form", () => {
    for (const p of PRIORITAETEN) {
      expect(PRIORITAET_TEXT[p], `Text fuer ${p}`).toBeTruthy();
      expect(PRIORITAET_FORM[p], `Form fuer ${p}`).toBeTruthy();
    }
  });

  /*
   * DIE FARBREGEL ALS TEST: „zurueckgewiesen" ist der einzige Zustand, der
   * Aufmerksamkeit fordert — und er darf NICHT denselben Ton tragen wie ein
   * Erfolg. Der Ton `achtung` loest sich in der getrennten Ampel-Rot-TEXTfarbe
   * auf, nicht in Markenrot (colorError === colorPrimary === #c8000f).
   */
  it("gibt genau „zurueckgewiesen" den Ton achtung", () => {
    const mitAchtung = STATUS_WERTE.filter((s) => STATUS_TON[s] === "achtung");
    expect(mitAchtung).toEqual(["zurueckgewiesen"]);
  });

  it("gibt genau „abgeschlossen" den Ton ok", () => {
    expect(STATUS_WERTE.filter((s) => STATUS_TON[s] === "ok")).toEqual(["abgeschlossen"]);
  });

  /*
   * Die Prioritaetsskala traegt ihre Rangfolge ueber die FORM, absteigend
   * gefuellt → kontur → text. Waere „hoch" nicht die einzige gefuellte Stufe,
   * waere die Rangfolge nicht mehr ablesbar, und in Graustufen gar nicht.
   */
  it("gibt genau „hoch" die gefuellte Form", () => {
    expect(PRIORITAETEN.filter((p) => PRIORITAET_FORM[p] === "gefuellt")).toEqual(["hoch"]);
  });
});

describe("vorschlagOffen", () => {
  it("ist wahr, wenn verteilt, ungeplant und ein Vorschlag anhaengt", () => {
    expect(vorschlagOffen({ ...AUFGABE, vorschlagDatum: "2026-08-13" })).toBe(true);
  });

  it("ist falsch ohne Vorschlag", () => {
    expect(vorschlagOffen(AUFGABE)).toBe(false);
  });

  /*
   * DER FALL, DER DIE ABLEITUNG UEBERHAUPT RECHTFERTIGT: sobald der BuFDi die
   * Aufgabe in einen Tag legt, IST der Vorschlag verbraucht — auch wenn die
   * Vorschlagsfelder stehenbleiben (sie tun es, damit der Verlauf belegen kann,
   * ob angenommen oder abgewichen wurde). Ohne diese Bedingung stuende
   * „Vorschlag offen" fuer immer an jeder Aufgabe, die je einen hatte.
   */
  it("ist falsch, sobald die Aufgabe eingeplant ist", () => {
    expect(
      vorschlagOffen({ ...AUFGABE, vorschlagDatum: "2026-08-13", planDatum: "2026-08-14" }),
    ).toBe(false);
  });

  it("ist falsch in jedem anderen Zustand als verteilt", () => {
    for (const s of STATUS_WERTE.filter((x) => x !== "verteilt")) {
      expect(vorschlagOffen({ ...AUFGABE, status: s, vorschlagDatum: "2026-08-13" }), s).toBe(false);
    }
  });
});

describe("istUeberfaellig", () => {
  it("zaehlt die Frist, nicht den Zeitplan", () => {
    // Frist gestern, eingeplant fuer morgen → ueberfaellig
    expect(
      istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-12", planDatum: "2026-08-14" }, "2026-08-13"),
    ).toBe(true);
    // Frist morgen, gar nicht eingeplant → nicht ueberfaellig
    expect(istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-14" }, "2026-08-13")).toBe(false);
  });

  it("ist am Fristtag selbst noch nicht ueberfaellig", () => {
    expect(istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-13" }, "2026-08-13")).toBe(false);
  });

  it("ist fuer abgeschlossene Aufgaben nie wahr", () => {
    expect(
      istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-01", status: "abgeschlossen" }, "2026-08-13"),
    ).toBe(false);
  });

  it("ist fuer jeden unerledigten Zustand wahr", () => {
    for (const s of STATUS_WERTE.filter((x) => x !== "abgeschlossen")) {
      expect(istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-01", status: s }, "2026-08-13"), s).toBe(true);
    }
  });
});

describe("wochentagVon", () => {
  it("bildet Montag auf 0 und Freitag auf 4 ab", () => {
    expect(wochentagVon("2026-08-10")).toBe(0);
    expect(wochentagVon("2026-08-14")).toBe(4);
  });

  /*
   * Samstag und Sonntag ergeben null, nicht 5 und 6. Das Modul kennt eine
   * Fuenftagewoche; eine 5 waere ein Index neben das Wochengitter, und
   * `routinen[5]` waere `undefined` — still leer statt laut falsch.
   */
  it("gibt am Wochenende null", () => {
    expect(wochentagVon("2026-08-15")).toBeNull();
    expect(wochentagVon("2026-08-16")).toBeNull();
  });
});

describe("routineAmTag", () => {
  const R: Routine = {
    id: "r", personId: "lea", titel: "Post", wochentage: [0, 2, 4],
    uhrzeit: "08:00", dauerMinuten: 45, aktiv: true,
  };

  it("gilt an den genannten Tagen", () => {
    expect(routineAmTag(R, 0)).toBe(true);
    expect(routineAmTag(R, 1)).toBe(false);
  });

  it("gilt nie, wenn die Routine ruht", () => {
    expect(routineAmTag({ ...R, aktiv: false }, 0)).toBe(false);
  });
});

describe("tagesBudget", () => {
  const MO = "2026-08-10";

  it("summiert eingeplante Aufgaben des Tages", () => {
    const b = tagesBudget(
      [
        { ...AUFGABE, id: "a", planDatum: MO, dauerMinuten: 120 },
        { ...AUFGABE, id: "b", planDatum: MO, dauerMinuten: 60 },
      ],
      [],
      LEA,
      MO,
    );
    expect(b.verplantMinuten).toBe(180);
    expect(b.sollMinuten).toBe(468);
    expect(b.ueberbucht).toBe(false);
  });

  it("zaehlt Aufgaben anderer Tage und anderer Personen nicht mit", () => {
    const b = tagesBudget(
      [
        { ...AUFGABE, id: "a", planDatum: MO, dauerMinuten: 120 },
        { ...AUFGABE, id: "b", planDatum: "2026-08-11", dauerMinuten: 999 },
        { ...AUFGABE, id: "c", planDatum: MO, zugewiesenAn: "noah", dauerMinuten: 999 },
        { ...AUFGABE, id: "d", planDatum: null, dauerMinuten: 999 },
      ],
      [],
      LEA,
      MO,
    );
    expect(b.verplantMinuten).toBe(120);
  });

  /*
   * ROUTINEN BELEGEN BUDGET, ERZEUGEN ABER KEINE AUFGABEN (Spec §6). Genau
   * deshalb muessen sie HIER mitgerechnet werden — sonst zeigte der Tag Luft,
   * die es nicht gibt, und der Zeitvorschlag der Koordination liefe ins Leere.
   */
  it("rechnet aktive Routinen des Wochentags mit ein", () => {
    const b = tagesBudget(
      [{ ...AUFGABE, planDatum: MO, dauerMinuten: 60 }],
      [
        { id: "r1", personId: "lea", titel: "Post", wochentage: [0], uhrzeit: "08:00", dauerMinuten: 45, aktiv: true },
        { id: "r2", personId: "lea", titel: "Ruht", wochentage: [0], uhrzeit: null, dauerMinuten: 300, aktiv: false },
        { id: "r3", personId: "lea", titel: "Anderer Tag", wochentage: [1], uhrzeit: null, dauerMinuten: 300, aktiv: true },
        { id: "r4", personId: "noah", titel: "Andere Person", wochentage: [0], uhrzeit: null, dauerMinuten: 300, aktiv: true },
      ],
      LEA,
      MO,
    );
    expect(b.verplantMinuten).toBe(105);
  });

  it("meldet Ueberbuchung, sobald das Soll ueberschritten ist", () => {
    const b = tagesBudget([{ ...AUFGABE, planDatum: MO, dauerMinuten: 500 }], [], LEA, MO);
    expect(b.ueberbucht).toBe(true);
  });

  it("meldet bei genau erreichtem Soll keine Ueberbuchung", () => {
    const b = tagesBudget([{ ...AUFGABE, planDatum: MO, dauerMinuten: 468 }], [], LEA, MO);
    expect(b.ueberbucht).toBe(false);
  });

  it("liefert am Wochenende ein leeres Budget statt eines Fehlers", () => {
    const b = tagesBudget(
      [{ ...AUFGABE, planDatum: "2026-08-15", dauerMinuten: 60 }],
      [{ id: "r", personId: "lea", titel: "X", wochentage: [0], uhrzeit: null, dauerMinuten: 60, aktiv: true }],
      LEA,
      "2026-08-15",
    );
    expect(b.verplantMinuten).toBe(60);
  });
});

describe("Formatierung", () => {
  it("schreibt Dauern unter einer Stunde in Minuten", () => {
    expect(fmtDauer(45)).toBe("45 Min.");
    expect(fmtDauer(30)).toBe("30 Min.");
  });

  it("schreibt ganze Stunden ohne Komma", () => {
    expect(fmtDauer(60)).toBe("1 Std.");
    expect(fmtDauer(120)).toBe("2 Std.");
  });

  it("schreibt halbe Stunden mit deutschem Komma", () => {
    expect(fmtDauer(90)).toBe("1,5 Std.");
    expect(fmtDauer(105)).toBe("1,75 Std.");
  });

  it("schreibt Stundenzahlen mit deutschem Komma und ohne Nullen am Ende", () => {
    expect(fmtStunden(468)).toBe("7,8");
    expect(fmtStunden(120)).toBe("2");
    expect(fmtStunden(165)).toBe("2,75");
    expect(fmtStunden(0)).toBe("0");
  });

  it("schreibt Tage als Wochentag plus Datum, nie als ISO", () => {
    expect(fmtTagKurz("2026-08-13")).toBe("Do, 13.08.");
    expect(fmtTagKurz("2026-08-10")).toBe("Mo, 10.08.");
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/anzeige.test.ts`
Expected: FAIL — `Failed to resolve import "./anzeige"`.

- [ ] **Step 3: `anzeige.ts` schreiben**

Create `src/app/m/aufgaben/_lib/anzeige.ts`:

```ts
import type { Aufgabe, Person, Prioritaet, Routine, Status } from "./typen";

/*
 * BESCHRIFTUNGEN UND ABLEITUNGEN — die eine Quelle. KEIN "use client": jede
 * Server Component des Moduls liest diese Konstanten, und aus einem
 * Client-Modul kaeme eine Client-Referenz statt des Objekts.
 *
 * WARUM DIE ABLEITUNGEN HIER LIEGEN UND NICHT IN DEN SEITEN: „ueberfaellig"
 * und „Zeitvorschlag offen" erscheinen je auf mehreren Seiten UND in einer
 * KPI-Kachel. Zwei Fassungen derselben Bedingung laufen auseinander, und der
 * Fehler ist nicht sichtbar kaputt, sondern nur falsch: die Kachel zaehlt drei,
 * die Liste zeigt zwei, und beide Zahlen sehen richtig aus.
 */

/** Die fuenf Toene der Zustands-Chips. Jeder loest sich in ein Paar --auf-<ton>-text/-flaeche auf. */
export type ChipTon = "grau" | "stahl" | "ocker" | "ok" | "achtung";

/** Die drei Gewichtsstufen der Prioritaet — die Rangfolge traegt die Form, nicht nur die Farbe. */
export type PrioritaetForm = "gefuellt" | "kontur" | "text";

export const STATUS_TEXT: Record<Status, string> = {
  eingegangen: "Zu verteilen",
  verteilt: "Verteilt",
  in_arbeit: "In Bearbeitung",
  freigabe_offen: "Freigabe offen",
  abgeschlossen: "Abgeschlossen",
  zurueckgewiesen: "Zurückgewiesen",
};

/**
 * `achtung` ist ABSICHTLICH nur einmal vergeben und loest sich in die getrennte
 * Ampel-Rot-TEXTfarbe auf, nicht in Markenrot: `colorError === colorPrimary
 * === #c8000f`, und ein rotes Chip auf einer Datenflaeche liest sich als
 * Primaeraktion. `anzeige.test.ts` haelt die Einmaligkeit fest.
 */
export const STATUS_TON: Record<Status, ChipTon> = {
  eingegangen: "grau",
  verteilt: "grau",
  in_arbeit: "stahl",
  freigabe_offen: "ocker",
  abgeschlossen: "ok",
  zurueckgewiesen: "achtung",
};

export const PRIORITAET_TEXT: Record<Prioritaet, string> = {
  hoch: "Hoch",
  mittel: "Mittel",
  niedrig: "Niedrig",
};

export const PRIORITAET_FORM: Record<Prioritaet, PrioritaetForm> = {
  hoch: "gefuellt",
  mittel: "kontur",
  niedrig: "text",
};

/**
 * „Zeitvorschlag offen" (Spec §5.1) — ein ABGELEITETER Zustand, kein siebter
 * gespeicherter. Die drei Bedingungen zusammen: noch nicht begonnen, noch in
 * keinem Tag, aber ein Vorschlag haengt an.
 *
 * Die MITTLERE Bedingung ist die, die man vergisst: die Vorschlagsfelder
 * bleiben nach dem Einplanen stehen (der Verlauf soll belegen koennen, ob
 * angenommen oder abgewichen wurde). Ohne `planDatum === null` stuende
 * „Vorschlag offen" fuer immer an jeder Aufgabe, die je einen hatte.
 */
export function vorschlagOffen(a: Aufgabe): boolean {
  return a.status === "verteilt" && a.planDatum === null && a.vorschlagDatum !== null;
}

/**
 * Ueberfaellig heisst: die FRIST ist verstrichen und die Aufgabe ist nicht
 * abgeschlossen. Der Zeitplan spielt keine Rolle — eine fuer morgen eingeplante
 * Aufgabe mit Frist gestern ist ueberfaellig, und eine ungeplante mit Frist in
 * der Zukunft ist es nicht.
 *
 * ISO-Tagesstrings sind lexikografisch vergleichbar; deshalb `<` und kein
 * Datums-Parsen. Am Fristtag selbst ist noch nichts ueberfaellig.
 */
export function istUeberfaellig(a: Aufgabe, heute: string): boolean {
  return a.status !== "abgeschlossen" && a.faelligAm < heute;
}

/**
 * 0 = Montag … 4 = Freitag; Samstag und Sonntag ergeben `null`.
 *
 * NULL UND NICHT 5/6: das Modul kennt eine Fuenftagewoche. Eine 5 waere ein
 * Index neben das Wochengitter, und ein `routinen[5]` waere `undefined` — still
 * leer statt laut falsch.
 */
export function wochentagVon(iso: string): number | null {
  const tag = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return tag >= 1 && tag <= 5 ? tag - 1 : null;
}

export function routineAmTag(r: Routine, wochentag: number): boolean {
  return r.aktiv && r.wochentage.includes(wochentag);
}

export interface Budget {
  verplantMinuten: number;
  sollMinuten: number;
  ueberbucht: boolean;
}

/**
 * Das Tagesbudget einer Person: eingeplante Aufgaben plus aktive Routinen des
 * Wochentags, gegen `sollMinutenTag`.
 *
 * ROUTINEN MUESSEN HIER MITGERECHNET WERDEN, obwohl sie keine Aufgaben sind
 * (Spec §6). Sonst zeigte der Tag Luft, die es nicht gibt, und der
 * Zeitvorschlag der Koordination liefe genau dorthin.
 *
 * ALLE ZUSTAENDE ZAEHLEN, auch `abgeschlossen`: „verplant" ist eine Aussage
 * ueber den Tag, nicht ueber den Arbeitsvorrat. Ein Rueckblick auf eine
 * vergangene Woche zeigte sonst leere Tage.
 *
 * `ueberbucht` ist ECHT groesser, nicht groesser-gleich: ein exakt gefuellter
 * Tag ist voll, nicht ueberbucht.
 */
export function tagesBudget(
  aufgaben: Aufgabe[],
  routinen: Routine[],
  person: Person,
  datum: string,
): Budget {
  const wochentag = wochentagVon(datum);
  const ausAufgaben = aufgaben
    .filter((a) => a.zugewiesenAn === person.id && a.planDatum === datum)
    .reduce((summe, a) => summe + a.dauerMinuten, 0);
  const ausRoutinen =
    wochentag === null
      ? 0
      : routinen
          .filter((r) => r.personId === person.id && routineAmTag(r, wochentag))
          .reduce((summe, r) => summe + r.dauerMinuten, 0);
  const verplantMinuten = ausAufgaben + ausRoutinen;
  return {
    verplantMinuten,
    sollMinuten: person.sollMinutenTag,
    ueberbucht: verplantMinuten > person.sollMinutenTag,
  };
}

/** „45 Min." · „1 Std." · „1,5 Std." — deutsches Komma, keine Nullen am Ende. */
export function fmtDauer(minuten: number): string {
  if (minuten < 60) return `${minuten} Min.`;
  return `${fmtStunden(minuten)} Std.`;
}

/** „7,8" · „2" · „2,75" — fuer Budgetangaben, die neben einem Wort stehen. */
export function fmtStunden(minuten: number): string {
  const stunden = minuten / 60;
  // `toFixed(2)` statt `toLocaleString`: die Rundung soll nicht von der
  // ICU-Fassung des Laufzeitsystems abhaengen (Runner gegen Entwicklermaschine).
  return stunden.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

const WOCHENTAGE_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

/**
 * „Do, 13.08." — nie ISO. Ein Datum in der Form `2026-08-13` liest im
 * deutschsprachigen Betrieb niemand fluessig, und der Wochentag ist bei einer
 * Wochenplanung die eigentliche Information.
 *
 * Eigene Tabelle statt `Intl.DateTimeFormat`: die Kurzform kommt dort mit einem
 * Punkt („Do."), und die Abkuerzungen sind zwischen ICU-Fassungen nicht stabil.
 */
export function fmtTagKurz(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const tag = String(d.getUTCDate()).padStart(2, "0");
  const monat = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${WOCHENTAGE_KURZ[d.getUTCDay()]}, ${tag}.${monat}.`;
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/anzeige.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && \
rtk git add src/app/m/aufgaben/_lib && \
rtk git commit -m "feat(aufgaben): Ableitungen und Anzeigetexte

\`vorschlagOffen\`, \`istUeberfaellig\` und \`tagesBudget\` liegen an genau
einer Stelle. Beide Bedingungen erscheinen je auf mehreren Seiten UND in
einer KPI-Kachel; zwei Fassungen laufen auseinander, und der Fehler ist
nicht sichtbar kaputt, sondern nur falsch — die Kachel zaehlt drei, die
Liste zeigt zwei, und beide Zahlen sehen richtig aus.

Die Beschriftungstabellen sind erschoepfend getestet: ein fehlender
Eintrag ergaebe \`undefined\` als CSS-Klasse, und der Chip bekaeme Polster
und Rundung, aber keine Farbe."
```

---

## Task 4: Berechtigungsprädikate

Spec §7. Auch im Klickdummy sind das die echten Prädikate mit den echten Signaturen — Bauabschnitt 2 tauscht nur, woher die `Person` kommt. Sie sind zugleich die Quelle für die Oberfläche: welcher Knopf erscheint, entscheidet dieselbe Funktion wie später der Riegel.

**Files:**
- Create: `src/app/m/aufgaben/_lib/zugang.ts`
- Create: `src/app/m/aufgaben/_lib/zugang.test.ts`

**Interfaces:**
- Consumes: `Aufgabe`, `Person` aus `_lib/typen.ts`
- Produces:
  - `istAktiv(p: Person, heute: string): boolean`
  - `darfVerteilen(p: Person, heute: string): boolean`
  - `darfFreigeben(p: Person, a: Aufgabe, heute: string): boolean`
  - `istVertretungsfreigabe(p: Person, a: Aufgabe): boolean`
  - `darfEinstellenFuerAndere(p: Person, heute: string): boolean`
  - `darfPlanAendern(p: Person, zielId: string, heute: string): boolean`
  - `darfPlanSehen(p: Person, zielId: string): boolean`
  - `darfNachweisSehen(p: Person, a: Aufgabe): boolean`
  - `darfPersonenVerwalten(p: Person, heute: string): boolean`

- [ ] **Step 1: Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_lib/zugang.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Aufgabe, Person, Rolle } from "./typen";
import {
  darfEinstellenFuerAndere,
  darfFreigeben,
  darfNachweisSehen,
  darfPersonenVerwalten,
  darfPlanAendern,
  darfPlanSehen,
  darfVerteilen,
  istAktiv,
  istVertretungsfreigabe,
} from "./zugang";

const HEUTE = "2026-08-13";

const person = (id: string, rolle: Rolle, aktivBis: string | null = null): Person => ({
  id, name: id, initialen: id.slice(0, 2).toUpperCase(), rolle,
  sollMinutenTag: 468, aktivBis,
});

const SARAH = person("sarah", "koordination");
const SCHULLE = person("schulle", "auftrag");
const JOENNE = person("joenne", "auftrag");
const LEA = person("lea", "bufdi");
const NOAH = person("noah", "bufdi");
const EHEMALIG = person("mika", "bufdi", "2026-07-31");

const AUFGABE: Aufgabe = {
  id: "a", titel: "T", beschreibung: "B", prioritaet: "mittel",
  erstellerId: "schulle", zugewiesenAn: "lea", status: "freigabe_offen",
  faelligAm: "2026-08-14", faelligUhrzeit: null, dauerMinuten: 60,
  nachweisPflicht: true, nachweisArt: "text", prueferId: "schulle",
  istSelbst: false, planDatum: null, planUhrzeit: null, planRang: 0,
  vorschlagDatum: null, vorschlagUhrzeit: null,
};

/** Die Selbstaufgabe: Lea fuer Lea, ohne Pruefer. */
const SELBST: Aufgabe = {
  ...AUFGABE, id: "s", erstellerId: "lea", zugewiesenAn: "lea",
  prueferId: null, istSelbst: true, status: "verteilt",
};

describe("istAktiv", () => {
  it("ist wahr ohne Enddatum", () => {
    expect(istAktiv(LEA, HEUTE)).toBe(true);
  });

  it("ist wahr, solange das Enddatum in der Zukunft liegt", () => {
    expect(istAktiv(person("x", "bufdi", "2026-08-14"), HEUTE)).toBe(true);
  });

  /*
   * DER RANDFALL, DER EINEN LETZTEN ARBEITSTAG KOSTET ODER SCHENKT: am
   * Enddatum SELBST ist die Person noch aktiv. `aktivBis` ist ein
   * einschliessendes Ende („aktiv bis einschliesslich"), nicht der erste Tag
   * danach — sonst kann jemand an seinem letzten Dienstag nichts mehr abgeben.
   */
  it("ist am Enddatum selbst noch aktiv", () => {
    expect(istAktiv(person("x", "bufdi", HEUTE), HEUTE)).toBe(true);
  });

  it("ist falsch, sobald das Enddatum verstrichen ist", () => {
    expect(istAktiv(EHEMALIG, HEUTE)).toBe(false);
  });
});

describe("darfVerteilen", () => {
  it("erlaubt es nur der Koordination", () => {
    expect(darfVerteilen(SARAH, HEUTE)).toBe(true);
    expect(darfVerteilen(SCHULLE, HEUTE)).toBe(false);
    expect(darfVerteilen(LEA, HEUTE)).toBe(false);
  });

  /*
   * DIE ANTWORT AUF „JOENNE UND SCHULLE PFUSCHEN IMMER WIEDER REIN": der Weg
   * zum Verteilen existiert in ihrer Oberflaeche nicht, UND der Riegel dahinter
   * prueft dieselbe Funktion. Zwei Quellen liefen genau hier auseinander.
   */
  it("erlaubt es einem Auftraggeber auch dann nicht, wenn er die Aufgabe erstellt hat", () => {
    expect(darfVerteilen(JOENNE, HEUTE)).toBe(false);
  });
});

describe("darfFreigeben", () => {
  it("erlaubt es dem Pruefer", () => {
    expect(darfFreigeben(SCHULLE, AUFGABE, HEUTE)).toBe(true);
  });

  it("erlaubt es der Koordination in Vertretung", () => {
    expect(darfFreigeben(SARAH, AUFGABE, HEUTE)).toBe(true);
    expect(istVertretungsfreigabe(SARAH, AUFGABE)).toBe(true);
  });

  it("nennt die Freigabe des Pruefers selbst keine Vertretung", () => {
    expect(istVertretungsfreigabe(SCHULLE, AUFGABE)).toBe(false);
  });

  it("verweigert es einem fremden Auftraggeber", () => {
    expect(darfFreigeben(JOENNE, AUFGABE, HEUTE)).toBe(false);
  });

  it("verweigert es dem ausfuehrenden BuFDi", () => {
    expect(darfFreigeben(LEA, AUFGABE, HEUTE)).toBe(false);
  });

  /*
   * SELBSTAUFGABEN HABEN KEINEN PRUEFER (Spec §5.2), und daraus folgt: NIEMAND
   * gibt sie frei, auch die Koordination nicht. Waere das nicht geprueft, zeigte
   * die Vertretungs-Warteschlange Sarah einen Freigabeknopf fuer Leas eigene
   * Aufgabe — fachlich sinnlos und technisch unauffaellig, weil `prueferId ===
   * null` und `rolle === "koordination"` beide fuer sich stimmen.
   */
  it("verweigert es fuer Selbstaufgaben, auch der Koordination", () => {
    expect(darfFreigeben(SARAH, SELBST, HEUTE)).toBe(false);
    expect(darfFreigeben(LEA, SELBST, HEUTE)).toBe(false);
  });

  it("verweigert es einer ausgeschiedenen Person", () => {
    const alt = { ...AUFGABE, erstellerId: EHEMALIG.id, prueferId: EHEMALIG.id };
    expect(darfFreigeben(EHEMALIG, alt, HEUTE)).toBe(false);
  });
});

describe("darfEinstellenFuerAndere", () => {
  it("erlaubt es Koordination und Auftraggebern, nicht BuFDis", () => {
    expect(darfEinstellenFuerAndere(SARAH, HEUTE)).toBe(true);
    expect(darfEinstellenFuerAndere(SCHULLE, HEUTE)).toBe(true);
    expect(darfEinstellenFuerAndere(LEA, HEUTE)).toBe(false);
  });
});

describe("darfPlanAendern", () => {
  it("erlaubt jedem nur den eigenen Plan", () => {
    expect(darfPlanAendern(LEA, "lea", HEUTE)).toBe(true);
    expect(darfPlanAendern(LEA, "noah", HEUTE)).toBe(false);
  });

  /*
   * AUCH DIE KOORDINATION NICHT — das ist die getroffene Entscheidung, nicht
   * ein Versehen: Sarah SCHLAEGT einen Zeitpunkt vor, sie setzt ihn nicht.
   * Anforderung 3 gibt dem BuFDi die Gestaltungshoheit ueber seinen Tag.
   */
  it("erlaubt der Koordination fremde Plaene NICHT", () => {
    expect(darfPlanAendern(SARAH, "lea", HEUTE)).toBe(false);
  });

  it("verweigert es einer ausgeschiedenen Person auch fuer den eigenen Plan", () => {
    expect(darfPlanAendern(EHEMALIG, EHEMALIG.id, HEUTE)).toBe(false);
  });
});

describe("darfPlanSehen", () => {
  /*
   * DIESES PRAEDIKAT IST HEUTE KONSTANT WAHR, und der Test sagt das, statt es
   * mit drei Faellen zu verdecken.
   *
   * Drei Einzeltests („BuFDis gegenseitig", „Koordination alle", „Ausgeschiedene
   * lesen ihre Geschichte") koennten bei dieser Fassung NICHT FEHLSCHLAGEN. Sie
   * lasen sich wie Abdeckung und waren keine — genau die Art gruener Balken, die
   * spaeter jemand fuer eine Zusicherung haelt. Der eine Test unten ist ehrlich:
   * er haelt die POLITIK fest („jeder darf jeden Plan sehen") und schlaegt fehl,
   * sobald sie sich aendert, ohne zu behaupten, drei Faelle unterschieden zu
   * haben.
   *
   * WARUM DAS PRAEDIKAT TROTZDEM EXISTIERT: es ist die benannte Naht, die
   * Bauabschnitt 2 braucht. Die Alternative waere, in
   * `plan/[personId]/page.tsx` gar nichts zu pruefen — dann muesste die spaetere
   * Einschraenkung erst die Stelle finden, an der sie hingehoert. Die Sicht ist
   * dabei ABSICHTLICH nicht an `istAktiv` gebunden: ein ehemaliger BuFDi darf
   * seine eigene Geschichte noch einsehen.
   */
  it("erlaubt heute jeder Rolle jeden Plan — auch einer ausgeschiedenen Person", () => {
    const paare: [Person, string][] = [
      [LEA, "noah"], [NOAH, "lea"], [SARAH, "lea"], [SCHULLE, "noah"],
      [EHEMALIG, EHEMALIG.id], [EHEMALIG, "lea"],
    ];
    expect(paare.filter(([p, ziel]) => !darfPlanSehen(p, ziel))).toEqual([]);
  });
});

describe("darfNachweisSehen", () => {
  it("laesst den Verfasser sehen", () => {
    expect(darfNachweisSehen(LEA, AUFGABE)).toBe(true);
  });

  it("laesst den Auftraggeber sehen", () => {
    expect(darfNachweisSehen(SCHULLE, AUFGABE)).toBe(true);
  });

  it("laesst die Koordination sehen", () => {
    expect(darfNachweisSehen(SARAH, AUFGABE)).toBe(true);
  });

  /*
   * DIE EINE VERWEIGERUNG, DIE DAS GANZE PRAEDIKAT RECHTFERTIGT: BuFDis sehen
   * die Zeitplaene der anderen (getroffene Entscheidung), aber NICHT deren
   * Nachweise. Ein Nachweis ist eine Leistungsdokumentation, kein Aushang —
   * und ein Kollege, der die Leistungsnachweise seiner Kollegen lesen kann, ist
   * arbeitsrechtlich heikel.
   */
  it("verweigert es einem unbeteiligten BuFDi", () => {
    expect(darfNachweisSehen(NOAH, AUFGABE)).toBe(false);
  });

  it("verweigert es einem unbeteiligten Auftraggeber", () => {
    expect(darfNachweisSehen(JOENNE, AUFGABE)).toBe(false);
  });
});

describe("darfPersonenVerwalten", () => {
  it("erlaubt es nur der aktiven Koordination", () => {
    expect(darfPersonenVerwalten(SARAH, HEUTE)).toBe(true);
    expect(darfPersonenVerwalten(SCHULLE, HEUTE)).toBe(false);
    expect(darfPersonenVerwalten(LEA, HEUTE)).toBe(false);
    expect(darfPersonenVerwalten(person("alt", "koordination", "2026-07-01"), HEUTE)).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/zugang.test.ts`
Expected: FAIL — `Failed to resolve import "./zugang"`.

- [ ] **Step 3: `zugang.ts` schreiben**

Create `src/app/m/aufgaben/_lib/zugang.ts`:

```ts
import type { Aufgabe, Person } from "./typen";

/*
 * DIE BERECHTIGUNGSPRAEDIKATE DES MODULS (Spec §7). KEIN "use client".
 *
 * SIE SIND ZUGLEICH DIE QUELLE FUER DIE OBERFLAECHE. Welcher Knopf erscheint,
 * entscheidet dieselbe Funktion, die spaeter der Riegel ruft — und das ist
 * keine Bequemlichkeit, sondern die Bedingung dafuer, dass beide nicht
 * auseinanderlaufen. Ein Knopf, der auf eine Seite zeigt, die fuer die
 * klickende Person 404 ist, ist fuer alle anderen eine Sackgasse; und mehrere
 * Riegel der Suite werfen absichtlich `notFound()` statt 403, damit die
 * Existenz einer Seite nicht verraten wird.
 *
 * IN BAUABSCHNITT 1 KOMMT DIE `Person` AUS EINEM COOKIE, in Bauabschnitt 2 aus
 * der Tabelle `person`. Die Signaturen aendern sich dabei NICHT — nur der
 * Aufrufer. Deshalb tragen sie hier schon `heute` als Argument statt
 * `new Date()` zu rufen: so sind sie testbar, und der Aufrufer sieht, dass die
 * Aktivitaet eine Frage des Datums ist.
 *
 * HANDLUNGSPRAEDIKATE PRUEFEN `istAktiv` SELBST, SICHTPRAEDIKATE NICHT. Eine
 * ausgeschiedene Person darf ihre eigene Geschichte lesen, aber nichts mehr
 * bewegen. Die Pruefung liegt in JEDEM Handlungspraedikat statt in einem
 * vorgeschalteten Gate, weil ein Gate genau einmal vergessen wird.
 */

/**
 * `aktivBis` ist ein EINSCHLIESSENDES Ende: am Enddatum selbst ist die Person
 * noch aktiv. Andernfalls kann jemand an seinem letzten Diensttag nichts mehr
 * abgeben — und das waere ein Randfall, der genau einmal im Jahr auffaellt und
 * dann jemanden einen Arbeitstag kostet.
 */
export function istAktiv(p: Person, heute: string): boolean {
  return p.aktivBis === null || p.aktivBis >= heute;
}

export function darfVerteilen(p: Person, heute: string): boolean {
  return istAktiv(p, heute) && p.rolle === "koordination";
}

/**
 * Freigeben darf der Pruefer, und die Koordination in Vertretung.
 *
 * SELBSTAUFGABEN HABEN KEINEN PRUEFER, und daraus folgt: NIEMAND gibt sie frei,
 * auch die Koordination nicht. Ohne die erste Zeile stimmten `prueferId ===
 * null` und `rolle === "koordination"` je fuer sich, und Sarah bekaeme in ihrer
 * Vertretungs-Warteschlange einen Freigabeknopf fuer Leas eigene Aufgabe.
 */
export function darfFreigeben(p: Person, a: Aufgabe, heute: string): boolean {
  if (a.istSelbst || a.prueferId === null) return false;
  if (!istAktiv(p, heute)) return false;
  return p.id === a.prueferId || p.rolle === "koordination";
}

/**
 * Ob eine Freigabe durch DIESE Person eine Vertretung waere. Der Verlauf soll
 * „Freigegeben von Sarah in Vertretung fuer Schulle" schreiben koennen —
 * ohne diese Unterscheidung verliert die Leistungsdokumentation genau die
 * Information, um derentwillen die Freigabe eingefuehrt wurde.
 */
export function istVertretungsfreigabe(p: Person, a: Aufgabe): boolean {
  return a.prueferId !== null && p.id !== a.prueferId && p.rolle === "koordination";
}

export function darfEinstellenFuerAndere(p: Person, heute: string): boolean {
  return istAktiv(p, heute) && (p.rolle === "koordination" || p.rolle === "auftrag");
}

/**
 * Den Zeitplan aendern darf jeder nur bei sich — AUCH DIE KOORDINATION NICHT
 * bei anderen. Das ist die getroffene Entscheidung, nicht ein Versehen: Sarah
 * SCHLAEGT einen Zeitpunkt vor (`vorschlagDatum`), sie setzt ihn nicht.
 * Anforderung 3 gibt dem BuFDi die Gestaltungshoheit ueber seinen Tag, damit er
 * sich Zeit fuer Routinearbeiten freihalten kann.
 */
export function darfPlanAendern(p: Person, zielId: string, heute: string): boolean {
  return istAktiv(p, heute) && p.id === zielId;
}

/**
 * Sehen darf jeder jeden Plan — BuFDis gegenseitig lesend (getroffene
 * Entscheidung: Vertretungsabsprachen ohne die Koordination als Nadeloehr).
 * KEINE Aktivitaetspruefung: ein ehemaliger BuFDi darf seine eigene Geschichte
 * noch einsehen.
 */
export function darfPlanSehen(_p: Person, _zielId: string): boolean {
  return true;
}

/**
 * Ein Nachweis ist eine Leistungsdokumentation, kein Aushang. Sichtbar fuer den
 * Verfasser, den Auftraggeber und die Koordination — NICHT fuer die anderen
 * BuFDis, obwohl die die Zeitplaene sehen. Ein Kollege, der die
 * Leistungsnachweise seiner Kollegen lesen kann, ist arbeitsrechtlich heikel.
 */
export function darfNachweisSehen(p: Person, a: Aufgabe): boolean {
  return (
    p.rolle === "koordination" ||
    p.id === a.erstellerId ||
    p.id === a.zugewiesenAn
  );
}

export function darfPersonenVerwalten(p: Person, heute: string): boolean {
  return istAktiv(p, heute) && p.rolle === "koordination";
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/zugang.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && \
rtk git add src/app/m/aufgaben/_lib && \
rtk git commit -m "feat(aufgaben): Berechtigungspraedikate

Sie sind zugleich die Quelle fuer die Oberflaeche: welcher Knopf
erscheint, entscheidet dieselbe Funktion, die spaeter der Riegel ruft.
Zwei Quellen laufen genau hier auseinander — und ein Knopf vor einem
notFound() hebt auf, dass der Riegel die Existenz der Seite verschweigt.

Handlungspraedikate pruefen \`istAktiv\` selbst, Sichtpraedikate nicht:
eine ausgeschiedene Person darf ihre eigene Geschichte lesen, aber nichts
mehr bewegen. Die Pruefung liegt in JEDEM Handlungspraedikat statt in
einem vorgeschalteten Gate, weil ein Gate genau einmal vergessen wird."
```

---

## Task 5: Das Farbvokabular und die Mobilumschaltung

Hier wird die Palette **festgelegt**, nicht später — sonst trägt der Klickdummy provisorische Werte, die niemand mehr anfasst. Der Test ist ein Quelltext-Scan: er besitzt die Aussage „jede helle Variable hat ein dunkles Gegenstück" und „die Umschaltklasse trägt die richtige Media Query". Ob sie **wirkt**, weiß nur der Browser — das ist Aufgabe 13.

**Files:**
- Modify: `src/app/m/aufgaben/_ui/aufgaben.module.css` (der Stub aus Aufgabe 1 wird vollständig ersetzt)
- Create: `src/app/m/aufgaben/_ui/aufgaben-css.test.ts`

**Interfaces:**
- Produces: die Klassen `.modul` · `.chip` · `.tonGrau` `.tonStahl` `.tonOcker` `.tonOk` `.tonAchtung` · `.prioGefuellt` `.prioKontur` `.prioText` · `.kpi` `.kpiKanteAchtung` `.kpiKanteOcker` `.kpiKanteOk` `.kpiLink` · `.wochenGitter` `.tagesListe` `.tagSpalte` `.tagKopf` `.budget` `.budgetUeberbucht` · `.ankerSpur` `.ohneAnker` · `.routineZeile` · `.knopfzeile` · `.journal` `.jts` · `.backlink` · `.demoLeiste`
- Konsumiert von: Aufgaben 6–12

- [ ] **Step 1: CSS-Struktur-Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_ui/aufgaben-css.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QUELLTEXT-SCAN, KEIN VERHALTENSTEST — und das ist eine Aussage, keine
 * Ausrede: jsdom wertet Media Queries nicht aus. Ein Vitest, der „auf 390px ist
 * das Wochengitter unsichtbar" behauptet und dafuer im DOM sucht, geht IMMER
 * durch. Er misst nichts, und der gruene Balken ist eine Luege.
 *
 * Die Aufteilung, die traegt (docs/design/README.md):
 *   - Quelltext-Scan (hier)      → „die Klasse traegt die richtige Media Query"
 *   - Playwright bei 390×844     → „man sieht es mobil"
 *   - Playwright bei 1280×720    → „man sieht es auf dem Desktop NICHT"
 *   - Playwright dazwischen      → was an keinem der beiden Enden sichtbar ist
 *
 * Ein Quelltext-Scan findet eine KASKADENKOLLISION strukturell nicht, weil er
 * Reihenfolge und Fremd-Stylesheets nicht kennt. Was er festhalten kann, ist
 * die Gegenmassnahme; ob sie wirkt, weiss nur der Browser (Aufgabe 13).
 */
const QUELLE = readFileSync(join(process.cwd(), "src/app/m/aufgaben/_ui/aufgaben.module.css"), "utf8");

/** Kommentare entfernen — sonst zaehlt eine ERWAEHNTE Zahl als Medienabfrage mit. */
const OHNE_KOMMENTARE = QUELLE.replace(/\/\*[\s\S]*?\*\//g, "");

/** Der Inhalt der `@media (max-width: 767.98px)`-Blocks, verkettet. */
function mobilBlock(): string {
  const treffer = [
    ...OHNE_KOMMENTARE.matchAll(/@media\s*\(max-width:\s*767\.98px\)\s*\{([\s\S]*?)\n\}/g),
  ];
  return treffer.map((m) => m[1]).join("\n");
}

/** Der Text ausserhalb aller Medienabfragen. */
function basisBlock(): string {
  return OHNE_KOMMENTARE.replace(/@media[\s\S]*?\n\}/g, "");
}

function regelInhalt(text: string, klasse: string): string | null {
  const m = new RegExp(`\\.${klasse}\\s*\\{([^}]*)\\}`).exec(text);
  return m ? m[1] : null;
}

describe("aufgaben.module.css — Breakpoints", () => {
  /*
   * 767.98 UND SONST NICHTS. „768" in einer max-width-Abfrage waere der Fehler,
   * den die Suite schon einmal bezahlt hat: bei exakt 768px gelten dann BEIDE
   * Seiten, und die Reihenfolge im Stylesheet entscheidet — also der Zufall.
   */
  it("kennt genau eine Schwelle, und zwar 767.98px", () => {
    const werte = [
      ...OHNE_KOMMENTARE.matchAll(/@media\s*\((?:min|max)-width:\s*([\d.]+)px\)/g),
    ].map((m) => m[1]);
    expect(werte.length).toBeGreaterThan(0);
    expect(new Set(werte)).toEqual(new Set(["767.98"]));
  });

  it("hat keine Medienabfrage bei 768, 600 oder 390px", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/\((?:min|max)-width:\s*(?:768|600|390)px\)/);
  });

  /*
   * DIE ZENTRALE ZUSICHERUNG DES BAUABSCHNITTS: beide Ausprägungen des
   * Zeitplans stehen im HTML, CSS blendet eine aus. Kein `Grid.useBreakpoint` —
   * es ist in Server Components verboten (Falle 1) und zeigt beim ersten Render
   * die falsche Variante.
   */
  it("blendet das Wochengitter unterhalb der Schwelle aus", () => {
    const inhalt = regelInhalt(mobilBlock(), "wochenGitter");
    expect(inhalt, ".wochenGitter fehlt im 767.98px-Block").not.toBeNull();
    expect(inhalt!).toMatch(/display:\s*none/);
  });

  it("zeigt die Tagesliste unterhalb der Schwelle", () => {
    const inhalt = regelInhalt(mobilBlock(), "tagesListe");
    expect(inhalt, ".tagesListe fehlt im 767.98px-Block").not.toBeNull();
    expect(inhalt!).toMatch(/display:\s*block/);
  });

  /*
   * DIE ANDERE HAELFTE, die man beim Mobil-Bauen vergisst: die Tagesliste muss
   * auf dem Desktop AUSGEBLENDET sein. Ohne diese Regel stehen beide
   * Darstellungen untereinander, und ein Test, der nur bei 390px messen wuerde,
   * kann das gar nicht widerlegen — dort sagen die richtige und die kaputte
   * Fassung beide „sichtbar".
   */
  it("blendet die Tagesliste ausserhalb der Medienabfrage aus", () => {
    const inhalt = regelInhalt(basisBlock(), "tagesListe");
    expect(inhalt, ".tagesListe fehlt in der Basis").not.toBeNull();
    expect(inhalt!).toMatch(/display:\s*none/);
  });

  /*
   * Handlungsknoepfe unter 768px sind volle Breite und stehen untereinander. Ein
   * 630px breiter Knopf liest sich als Flaeche, nicht als Ziel.
   */
  it("stapelt die Knopfzeile unterhalb der Schwelle", () => {
    const inhalt = regelInhalt(mobilBlock(), "knopfzeile");
    expect(inhalt, ".knopfzeile fehlt im 767.98px-Block").not.toBeNull();
    expect(inhalt!).toMatch(/flex-direction:\s*column/);
  });
});

describe("aufgaben.module.css — Dunkelmodus", () => {
  const hellBlock = /(?:^|\n)\.modul\s*\{([\s\S]*?)\n\}/.exec(OHNE_KOMMENTARE)?.[1] ?? "";
  const dunkelBlock =
    /:root\[data-theme="dark"\]\s*\.modul\s*\{([\s\S]*?)\n\}/.exec(OHNE_KOMMENTARE)?.[1] ?? "";

  const namen = (block: string): string[] =>
    [...block.matchAll(/(--auf-[a-z0-9-]+):/g)].map((m) => m[1]).sort();

  it("deklariert ueberhaupt Variablen in beiden Blocken", () => {
    expect(namen(hellBlock).length).toBeGreaterThan(0);
    expect(namen(dunkelBlock).length).toBeGreaterThan(0);
  });

  /*
   * DER GROESSTE VERSTECKTE POSTEN JEDER UEBERNAHME AUS `lagerbuch`: dessen
   * Vorbild-Palette ist durchgehend hell. Eine Variable ohne dunkles
   * Gegenstueck faellt still auf den hellen Wert zurueck — dunkler Grund,
   * dunkle Schrift, und niemand bemerkt es, weil der Rest der Seite korrekt
   * umschaltet.
   */
  it("gibt jeder hellen Variable ein dunkles Gegenstueck", () => {
    const fehlend = namen(hellBlock).filter((n) => !namen(dunkelBlock).includes(n));
    expect(fehlend, "ohne Dunkelwert").toEqual([]);
  });

  it("hat im Dunkelblock keine Variable, die es hell nicht gibt", () => {
    const ueberzaehlig = namen(dunkelBlock).filter((n) => !namen(hellBlock).includes(n));
    expect(ueberzaehlig, "nur im Dunkelblock").toEqual([]);
  });

  /*
   * `prefers-color-scheme` ist hier FALSCH, nicht bloss unnoetig: der
   * Umschalter der Suite hat drei Zustaende, und die Medienabfrage bricht den
   * Fall „System dunkel, Umschalter hell".
   */
  it("selektiert nie auf prefers-color-scheme", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/prefers-color-scheme/);
  });

  /*
   * `data-theme` traegt IMMER den aufgeloesten Wert. Ein gestempeltes `auto`
   * besteht typecheck, build und Vitest und kippt trotzdem jede Modulflaeche
   * still auf helle Darstellung, waehrend antd korrekt dunkel rendert.
   */
  it("selektiert nie auf data-theme=auto", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/data-theme="auto"/);
  });
});

describe("aufgaben.module.css — Farbregeln der Suite", () => {
  /*
   * FALLE 3: colorError === colorPrimary === #c8000f. Suite-Rot ist Marke und
   * Primaeraktion — es darf in diesem Modul auf keiner Datenflaeche stehen.
   * Erlaubt ist es ausschliesslich als `var(--iuk-marke)` im Fokusring, und der
   * ist Chrome, keine Datenflaeche.
   */
  it("schreibt Suite-Rot nirgends als Hex-Wert aus", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/#c8000f/i);
    expect(OHNE_KOMMENTARE).not.toMatch(/#a2000c/i);
  });

  it("nutzt in eigenem Markup keine --ant-*-Variable", () => {
    // antd deklariert sie auf SEINER Scope-Klasse, nicht auf :root. Eigenes
    // Markup sieht sie nicht, und der Fehler ist still.
    expect(OHNE_KOMMENTARE).not.toMatch(/var\(--ant-/);
  });

  /*
   * Jeder Chip-Ton ist ein PAAR aus Flaeche und Text. Ein Ton mit nur einem
   * der beiden ergaebe entweder Text ohne Flaeche oder Flaeche ohne
   * lesbaren Text — beides sieht nicht kaputt aus, sondern nur falsch.
   */
  it("gibt jedem Chip-Ton ein Flaeche/Text-Paar", () => {
    for (const ton of ["grau", "stahlton", "ocker", "ok", "achtung"]) {
      expect(OHNE_KOMMENTARE, `--auf-${ton}-text`).toMatch(new RegExp(`--auf-${ton}-text:`));
      expect(OHNE_KOMMENTARE, `--auf-${ton}-flaeche`).toMatch(new RegExp(`--auf-${ton}-flaeche:`));
    }
  });

  it("setzt den Fokusring nie auf outline: none ohne Ersatz", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/outline:\s*none/);
    expect(OHNE_KOMMENTARE).toMatch(/outline-offset/);
  });

  it("nutzt kein !important", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/!important/);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/aufgaben-css.test.ts`
Expected: FAIL — mehrere Fälle, u. a. „`.wochenGitter` fehlt im 767.98px-Block" (die Stub-Datei aus Aufgabe 1 hat nur vier Variablen und keine Medienabfrage).

- [ ] **Step 3: CSS vollständig schreiben**

Replace the whole content of `src/app/m/aufgaben/_ui/aufgaben.module.css`:

```css
/*
 * Modul-CSS von `aufgaben`. `.modul` ist der Traeger aller --auf-*-Variablen
 * und liegt im `layout.tsx` um die ganze Shell.
 *
 * WARUM EIGENE VARIABLEN UND NICHT --ant-*: antd deklariert seine Variablen auf
 * SEINER Scope-Klasse, die es an die Wurzelelemente seiner eigenen Komponenten
 * haengt — nicht an `:root`. Eigenes Markup ausserhalb eines
 * antd-Komponentenbaums sieht sie NICHT, und der Fehler ist still: die Regel
 * loest ins Leere auf und die Haarlinie verschwindet einfach.
 *
 * WARUM :root[data-theme="dark"] UND NICHT prefers-color-scheme: der Umschalter
 * der Suite hat drei Zustaende (auto|light|dark). Auf die Medienabfrage zu
 * selektieren bricht den Fall „System dunkel, Umschalter hell". Und `auto`
 * steht hier nie — `data-theme` traegt immer den aufgeloesten Wert.
 *
 * DIE PALETTE IST HIER FESTGELEGT, NICHT SPAETER. Waere sie provisorisch,
 * traegt der Klickdummy Werte, die niemand mehr anfasst. Kontraste sind gegen
 * die jeweilige Flaeche auf AA gemessen, nicht geschaetzt;
 * `aufgaben-css.test.ts` prueft die STRUKTUR (jede helle Variable hat ein
 * dunkles Gegenstueck), nicht die Zahlen.
 *
 * SUITE-ROT KOMMT HIER NICHT VOR — auch nicht als Hex.
 * `colorError === colorPrimary === #c8000f`; ein rotes Chip oder ein roter
 * Balken auf einer Datenflaeche liest sich als Primaeraktion. Die einzige
 * Ausnahme ist der Fokusring, und der nutzt `var(--iuk-marke)` aus
 * `globals.css` (dort auf `:root` deklariert, also auch fuer eigenes Markup
 * sichtbar) — Chrome, keine Datenflaeche.
 */
.modul {
  --auf-tinte: #1a1d20;
  --auf-stahl: #5b6570;
  --auf-linie: #d9dde1;
  --auf-papier: #eef0f1;

  /* Zustands-Chips: Flaeche und Text immer als PAAR. */
  --auf-grau-text: #5b6570;
  --auf-grau-flaeche: #e7eaec;
  --auf-stahlton-text: #1d4e6b;
  --auf-stahlton-flaeche: #e3edf3;
  --auf-ocker-text: #8a5200;
  --auf-ocker-flaeche: #fbf1dc;
  --auf-ok-text: #1e7a3c;
  --auf-ok-flaeche: #e4f2e9;
  /*
   * `achtung` ist die GETRENNTE Ampel-Rot-Textfarbe, nicht Markenrot — genau
   * die Trennung, die `lagerbuch` zwischen --lb-ampel-rot-text und --lb-rot
   * zieht.
   */
  --auf-achtung-text: #8c0d16;
  --auf-achtung-flaeche: #f6e3e0;

  /*
   * Prioritaet: EINE Hue, drei Gewichte. Sie ist eine Rangskala, also muss die
   * Helligkeit monoton laufen — dann bleibt die Rangfolge bei Rot-Gruen-Blindheit
   * und in Graustufen erhalten. Und sie darf nicht mit der Zustandsampel
   * verwechselbar sein, weil beide Chips in derselben Zeile stehen: deshalb
   * Rostbraun und nicht Rot, Gelb oder Gruen.
   */
  --auf-prio-hoch-text: #8a3a12;
  --auf-prio-hoch-flaeche: #fbeadf;
  --auf-prio-mittel-text: #5b6570;
  --auf-prio-niedrig-text: #7a838c;
}

:root[data-theme="dark"] .modul {
  --auf-tinte: #ece9e2;
  --auf-stahl: #9aa4ad;
  --auf-linie: #2a2f34;
  --auf-papier: #0f1113;

  --auf-grau-text: #9aa4ad;
  --auf-grau-flaeche: #1c2024;
  --auf-stahlton-text: #8ec2de;
  --auf-stahlton-flaeche: #10202a;
  --auf-ocker-text: #d9a032;
  --auf-ocker-flaeche: #2a1e05;
  --auf-ok-text: #7ee0a0;
  --auf-ok-flaeche: #10261a;
  --auf-achtung-text: #e8837c;
  --auf-achtung-flaeche: #2a1113;

  --auf-prio-hoch-text: #e0a077;
  --auf-prio-hoch-flaeche: #2a1a0f;
  --auf-prio-mittel-text: #9aa4ad;
  --auf-prio-niedrig-text: #7d868f;
}

.modul a:focus-visible,
.modul button:focus-visible,
.modul input:focus-visible,
.modul select:focus-visible {
  outline: 2px solid var(--iuk-marke);
  outline-offset: 2px;
}

/* ── Chips ──────────────────────────────────────────────────────────────── */

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 99px;
  padding: 2.5px 9px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.tonGrau { color: var(--auf-grau-text); background: var(--auf-grau-flaeche); }
.tonStahl { color: var(--auf-stahlton-text); background: var(--auf-stahlton-flaeche); }
.tonOcker { color: var(--auf-ocker-text); background: var(--auf-ocker-flaeche); }
.tonOk { color: var(--auf-ok-text); background: var(--auf-ok-flaeche); }
.tonAchtung { color: var(--auf-achtung-text); background: var(--auf-achtung-flaeche); }

/*
 * Die drei Prioritaetsstufen tragen ihre Rangfolge in der FORM: gefuellt →
 * Kontur → nur Text. Waere der Unterschied allein die Farbe, wuerde die
 * Rangfolge in Graustufen verschwinden.
 */
.prioGefuellt {
  color: var(--auf-prio-hoch-text);
  background: var(--auf-prio-hoch-flaeche);
}
.prioKontur {
  border: 1px solid var(--auf-linie);
  color: var(--auf-prio-mittel-text);
  background: transparent;
}
.prioText {
  padding-inline: 0;
  color: var(--auf-prio-niedrig-text);
  background: transparent;
  font-weight: 400;
}

/* ── KPI-Kacheln ────────────────────────────────────────────────────────── */

.kpi {
  border-inline-start: 4px solid transparent;
  padding-inline-start: 12px;
  height: 100%;
}
.kpiKanteAchtung { border-inline-start-color: var(--auf-achtung-text); }
.kpiKanteOcker { border-inline-start-color: var(--auf-ocker-text); }
.kpiKanteOk { border-inline-start-color: var(--auf-ok-text); }
.kpiLink { display: block; color: inherit; text-decoration: none; }
.kpiLink:hover { background: var(--auf-papier); }

/* ── Wochenplan: zwei Ausprägungen, CSS blendet eine aus ─────────────────── */

/*
 * BEIDE STEHEN IM HTML. `Grid.useBreakpoint` ist in Server Components verboten
 * (Falle 1) und zeigt beim ersten Render die falsche Variante; ein
 * JS-Breakpoint waere hier also gleich zweimal falsch.
 */
.wochenGitter {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.tagesListe {
  display: none;
}

.tagSpalte {
  border: 1px solid var(--auf-linie);
  border-radius: 8px;
  padding: 8px;
  min-width: 0;
}
.tagKopf {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  border-block-end: 1px solid var(--auf-linie);
  padding-block-end: 6px;
  margin-block-end: 8px;
}
.budget {
  color: var(--auf-stahl);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/*
 * Ein ueberbuchter Tag bekommt Kante PLUS Text („8,5 von 7,8 Std. —
 * ueberbucht"), keinen roten Balken: Menge ist keine Statusfarbe, und die
 * Bedeutung darf nie allein an der Farbe haengen.
 */
.budgetUeberbucht {
  border-inline-start: 3px solid var(--auf-achtung-text);
  padding-inline-start: 6px;
  color: var(--auf-achtung-text);
  font-weight: 600;
}

/*
 * Die Uhrzeit-Spur links am Eintrag: ein Eintrag MIT fester Uhrzeit ist der
 * Anker des Tages, freie Eintraege ordnen sich davor und dahinter ein. Beide
 * Formen sind gleich breit, damit die Titel untereinander stehen.
 */
.ankerSpur {
  flex: 0 0 46px;
  color: var(--auf-tinte);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.ohneAnker {
  flex: 0 0 46px;
  color: var(--auf-stahl);
  font-size: 12px;
}

/* Routinen belegen Budget und tragen keine Aktionen — sichtbar als andere Sorte. */
.routineZeile {
  border-inline-start: 2px dashed var(--auf-linie);
  padding-inline-start: 8px;
  color: var(--auf-stahl);
}

/* ── Journal, Brotkrume, Demo-Leiste ────────────────────────────────────── */

.journal { list-style: none; margin: 0; padding: 0; }
.jts {
  color: var(--auf-stahl);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.backlink {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  color: var(--auf-stahl);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-decoration: none;
  text-transform: uppercase;
}
.backlink:hover { color: var(--auf-tinte); }

/*
 * Die Leiste des Demo-Rollenwechslers. STREICHPOSTEN — sie verschwindet mit
 * Bauabschnitt 2 samt Komponente. Die gestrichelte Kontur ist Absicht: sie soll
 * nicht wie ein Bestandteil des Produkts aussehen.
 */
.demoLeiste {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  border: 1px dashed var(--auf-stahl);
  border-radius: 6px;
  padding: 8px 12px;
  margin-block-end: 24px;
  background: var(--auf-papier);
}

.knopfzeile { display: flex; gap: 8px; flex-wrap: wrap; }

@media (max-width: 767.98px) {
  /*
   * 767.98 und nicht 768: bei exakt 768px gelten sonst BEIDE Seiten, und die
   * Reihenfolge im Stylesheet entscheidet — also der Zufall.
   */
  .wochenGitter { display: none; }
  .tagesListe { display: block; }

  /*
   * Handlungsknoepfe volle Breite und untereinander. Ein 630px breiter Knopf
   * liest sich als Flaeche, nicht als Ziel.
   *
   * SPEZIFITAET: `.knopfzeile > *` ist (0,1,0) plus Universal — genau so viel
   * wie `.ant-btn`, und antds Stylesheet kommt SPAETER. Deshalb die eine
   * Klasse mehr voranstellen (`.modul .knopfzeile > *` = (0,2,0)), sonst
   * gewinnt antd durch Dokumentreihenfolge und die Knoepfe stehen weiter
   * nebeneinander. Nicht entfernen — das ist keine Redundanz.
   */
  .knopfzeile { flex-direction: column; align-items: stretch; }
  .modul .knopfzeile > * { width: 100%; }
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/aufgaben-css.test.ts`
Expected: PASS — alle Fälle grün.

- [ ] **Step 5: Gates und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && \
rtk git add src/app/m/aufgaben/_ui && \
rtk git commit -m "feat(aufgaben): Farbvokabular und Mobilumschaltung

Die Palette wird JETZT festgelegt, nicht spaeter: waere sie provisorisch,
traegt der Klickdummy Werte, die niemand mehr anfasst.

Der Test ist ein Quelltext-Scan, und das ist eine Aussage: jsdom wertet
Media Queries nicht aus, ein Verhaltenstest darauf ginge IMMER durch. Er
besitzt zwei Zusicherungen — jede helle Variable hat ein dunkles
Gegenstueck (der groesste versteckte Posten jeder Uebernahme aus
lagerbuch), und die Umschaltklasse traegt 767.98px. Ob sie WIRKT, weiss
nur der Browser."
```

---

## Task 6: Die vier Bausteine

**Files:**
- Create: `src/app/m/aufgaben/_ui/ikonen.tsx`
- Create: `src/app/m/aufgaben/_ui/ikonen.test.tsx`
- Create: `src/app/m/aufgaben/_ui/Chip.tsx`
- Create: `src/app/m/aufgaben/_ui/Chip.test.tsx`
- Create: `src/app/m/aufgaben/_ui/Kachel.tsx`
- Create: `src/app/m/aufgaben/_ui/SeitenKopf.tsx`
- Create: `src/app/m/aufgaben/_ui/SeitenKopf.test.tsx`

**Interfaces:**
- Consumes: `ChipTon`, `PrioritaetForm`, `STATUS_TEXT`, `STATUS_TON`, `PRIORITAET_TEXT`, `PRIORITAET_FORM` aus `_lib/anzeige.ts`; `SCHRIFT` aus `@/core/theme/schrift`
- Produces:
  - `_ui/ikonen.tsx`: `type IkonName`, `const ZEICHEN: Record<IkonName, IconType>`, `function Ikone({ name, groesse }: { name: IkonName; groesse?: number })`. **Kein `"use client"`** — die Datei exportiert den Typ `IkonName`, der als Datenfeld in Anzeigezeilen wandert.
  - `_ui/Chip.tsx`: `function Chip({ ton, zeichen, children })`, `function StatusChip({ status })`, `function PrioritaetChip({ prioritaet })`
  - `_ui/Kachel.tsx`: `function Kachel({ zahl, beschriftung, kante, href })` mit `kante?: "achtung" | "ocker" | "ok"`
  - `_ui/SeitenKopf.tsx`: `function SeitenKopf({ titel, kontext, aktionen, zurueck })` — `zurueck?: { href: string; text: string }`

- [ ] **Step 1: Zeichenquelle anlegen**

Create `src/app/m/aufgaben/_ui/ikonen.tsx`:

```tsx
import type { IconType } from "react-icons/lib";
import {
  PiArrowLeft,
  PiArrowUUpLeft,
  PiCalendarBlank,
  PiCaretDown,
  PiCaretRight,
  PiCaretUp,
  PiCheck,
  PiClock,
  PiImage,
  PiNoteBlank,
  PiPaperPlaneTilt,
  PiPlus,
  PiUser,
  PiWarning,
  PiX,
} from "react-icons/pi";

/*
 * DIE EINE ZEICHENQUELLE DES MODULS. Die Union ist die Autoritaet, die
 * Aufloesung liegt bei Phosphor (`react-icons/pi`).
 *
 * WARUM NICHT @ant-design/icons — und warum das kein Geschmack ist: der nackte
 * Spezifizierer loest in der RSC-Ebene ueber `exports["."].node.import` in den
 * CJS-Zweig auf, der `createContext` auf MODULEBENE ruft. Ergebnis:
 * `TypeError: (0, _react.createContext) is not a function`, HTTP 500 SCHON BEIM
 * IMPORT, nicht beim Rendern. `typecheck` und `build` bleiben gruen, und Vitest
 * kann es strukturell nicht sehen (dort laedt `react` ueber die
 * `default`-Bedingung und die Icons rendern klaglos). Nur ein echter Abruf
 * zeigt den 500. `src/core/shell/icons.test.ts` riegelt das repo-weit ab.
 *
 * WARUM KEIN "use client" ALS AUSWEG: das behebt es nicht, es macht es STILL —
 * HTTP 200 mit leerer Map und dem falschen Bild. Aus Falle 7 wird Falle 6.
 * Genau das ist `core/shell/icons.ts` bis 2026-08-01 passiert.
 *
 * WARUM DIESE DATEI TROTZDEM OHNE "use client" AUSKOMMT: `react-icons` ist
 * gemessen unbedenklich in der RSC-Ebene — dieselbe Grundlage, auf der
 * `src/app/m/lagerbuch/_ui/ikonen.tsx` steht. Und sie MUSS ohne auskommen,
 * weil sie den TYP `IkonName` exportiert, der als Datenfeld in
 * serialisierbaren Anzeigezeilen wandert.
 *
 * `data-zeichen` traegt den Namen ins DOM, damit Tests „hier steht das
 * Warnzeichen" pruefen koennen, ohne an SVG-Pfaddaten zu kleben. Ein
 * Paket-Update aendert Pfade; es aendert keine Namen.
 */
export type IkonName =
  | "pfeil-links"
  | "chevron-rechts"
  | "auf"
  | "ab"
  | "haken"
  | "kreuz"
  | "plus"
  | "warnung"
  | "uhr"
  | "kalender"
  | "person"
  | "verteilen"
  | "zurueckweisen"
  | "nachweis-text"
  | "nachweis-bild";

export const ZEICHEN: Record<IkonName, IconType> = {
  "pfeil-links": PiArrowLeft,
  "chevron-rechts": PiCaretRight,
  auf: PiCaretUp,
  ab: PiCaretDown,
  haken: PiCheck,
  kreuz: PiX,
  plus: PiPlus,
  warnung: PiWarning,
  uhr: PiClock,
  kalender: PiCalendarBlank,
  person: PiUser,
  verteilen: PiPaperPlaneTilt,
  zurueckweisen: PiArrowUUpLeft,
  "nachweis-text": PiNoteBlank,
  "nachweis-bild": PiImage,
};

/**
 * `aria-hidden` ohne Ausnahme: jedes Zeichen im Modul ist Zugabe zu einem Text,
 * nie sein Ersatz. Ein Zeichen, das etwas allein sagt, waere ein
 * Barrierefreiheitsfehler und kein Gestaltungsmittel.
 */
export function Ikone({ name, groesse = 16 }: { name: IkonName; groesse?: number }) {
  const Z = ZEICHEN[name];
  return <Z aria-hidden size={groesse} data-zeichen={name} />;
}
```

- [ ] **Step 2: Test für die Zeichenquelle schreiben**

Create `src/app/m/aufgaben/_ui/ikonen.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { Ikone, ZEICHEN, type IkonName } from "./ikonen";

const NAMEN = Object.keys(ZEICHEN) as IkonName[];

describe("ikonen", () => {
  it("loest jeden Namen der Union in eine Komponente auf", () => {
    // Ein fehlender Eintrag waere `undefined` als Komponente — React wirft
    // dann zur Laufzeit, aber erst auf der Seite, die ihn benutzt.
    for (const n of NAMEN) expect(ZEICHEN[n], n).toBeTypeOf("function");
  });

  it("rendert jedes Zeichen mit data-zeichen und aria-hidden", async () => {
    for (const n of NAMEN) {
      await mount(<Ikone name={n} />);
      const el = query(`[data-zeichen="${n}"]`);
      expect(el.getAttribute("aria-hidden")).toBe("true");
      await unmount();
    }
  });

  /*
   * DER RIEGEL, DER DIESE DATEI UEBERHAUPT RECHTFERTIGT: sobald irgendwo im
   * Modul `@ant-design/icons` auftaucht, antwortet jede betroffene Server
   * Component mit HTTP 500 — und weder `build` noch Vitest sehen es. Der
   * repo-weite Riegel ist `src/core/shell/icons.test.ts`; dieser hier ist der
   * modulnahe, der beim Bruch sofort auf die richtige Datei zeigt.
   */
  it("nennt @ant-design/icons nirgends im Modul", () => {
    const quelle = readFileSync(join(process.cwd(), "src/app/m/aufgaben/_ui/ikonen.tsx"), "utf8");
    const ohneKommentare = quelle.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(ohneKommentare).not.toMatch(/@ant-design\/icons/);
  });

  /*
   * KEIN "use client" — die Datei exportiert den TYP `IkonName`, der als
   * Datenfeld durch Server Components wandert. Traegt sie die Direktive, wird
   * aus dem lauten Fehler ein stiller: HTTP 200 mit leerer Map und falschem
   * Bild.
   */
  it("traegt keine Client-Direktive", () => {
    const quelle = readFileSync(join(process.cwd(), "src/app/m/aufgaben/_ui/ikonen.tsx"), "utf8");
    expect(quelle).not.toMatch(/^\s*["']use client["']/m);
  });
});
```

- [ ] **Step 3: Tests laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/ikonen.test.tsx`
Expected: PASS.

- [ ] **Step 4: Chip-Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_ui/Chip.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { PRIORITAETEN, STATUS_WERTE } from "../_lib/typen";
import { PRIORITAET_TEXT, STATUS_TEXT } from "../_lib/anzeige";
import { Chip, PrioritaetChip, StatusChip } from "./Chip";

describe("Chip", () => {
  /*
   * DIE NAMENSFALLE, die im Lagerbuch dokumentiert ist: `s["gruen"]` waere
   * `undefined` und ergaebe `className="chip undefined"` — mit Polster und
   * Rundung, aber OHNE FARBE. Der Riegel dagegen ist der TYP `ChipTon`, nicht
   * die Wachsamkeit; dieser Test ist die Gegenprobe, dass die Abbildung
   * vollstaendig ist.
   */
  it("setzt fuer jeden Status eine Tonklasse, nie undefined", async () => {
    for (const s of STATUS_WERTE) {
      await mount(<StatusChip status={s} />);
      const el = query("[data-chip]");
      expect(el.className, s).not.toMatch(/undefined/);
      expect(el.className, s).toMatch(/ton/);
      await unmount();
    }
  });

  /*
   * BEDEUTUNG NIE ALLEIN UEBER FARBE: jeder Chip traegt den Text seines
   * Zustands. Faellt die Farbe aus (Graustufendruck, Rot-Gruen-Blindheit), ist
   * die Aussage noch da.
   */
  it("schreibt bei jedem Status den Zustandstext aus", async () => {
    for (const s of STATUS_WERTE) {
      await mount(<StatusChip status={s} />);
      expect(query("[data-chip]").textContent, s).toContain(STATUS_TEXT[s]);
      await unmount();
    }
  });

  it("schreibt bei jeder Prioritaet das Wort aus", async () => {
    for (const p of PRIORITAETEN) {
      await mount(<PrioritaetChip prioritaet={p} />);
      expect(query("[data-chip]").textContent, p).toContain(PRIORITAET_TEXT[p]);
      await unmount();
    }
  });

  it("gibt der Prioritaet eine Formklasse, nie undefined", async () => {
    for (const p of PRIORITAETEN) {
      await mount(<PrioritaetChip prioritaet={p} />);
      const el = query("[data-chip]");
      expect(el.className, p).not.toMatch(/undefined/);
      expect(el.className, p).toMatch(/prio/);
      await unmount();
    }
  });

  it("traegt das Zeichen als Zugabe, nicht als Ersatz", async () => {
    await mount(<Chip ton="achtung" zeichen="warnung">Zurückgewiesen</Chip>);
    expect(query('[data-zeichen="warnung"]').getAttribute("aria-hidden")).toBe("true");
    expect(query("[data-chip]").textContent).toContain("Zurückgewiesen");
  });
});
```

- [ ] **Step 5: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/Chip.test.tsx`
Expected: FAIL — `Failed to resolve import "./Chip"`.

- [ ] **Step 6: Chip schreiben**

Create `src/app/m/aufgaben/_ui/Chip.tsx`:

```tsx
import type { ReactNode } from "react";
import type { Prioritaet, Status } from "../_lib/typen";
import {
  PRIORITAET_FORM,
  PRIORITAET_TEXT,
  STATUS_TEXT,
  STATUS_TON,
  type ChipTon,
  type PrioritaetForm,
} from "../_lib/anzeige";
import { Ikone, type IkonName } from "./ikonen";
import s from "./aufgaben.module.css";

/*
 * EIGENES MARKUP, KEIN antd-`Tag`. Drei Gruende, alle aus der Erfahrung des
 * Lagerbuchs:
 *  1. `Tag color="error"` greift auf `colorError` zu — also auf Suite-Rot, also
 *     auf Falle 3. Eine eigene Palette laesst sich `Tag` nur unterschieben,
 *     indem man ihm eine Farbe als Prop gibt; dann ist es nur noch eine Huelle
 *     mit Rundung.
 *  2. Der Fehler waere nicht sichtbar kaputt, sondern nur FALSCH. `Tag
 *     color="error"` ist gueltiges antd, im jsdom-DOM steht dieselbe Klasse,
 *     und am Bildschirm sieht es nicht defekt aus. Kein Gate faengt das.
 *  3. `Tag.CheckableTag` ist ein Compound-Zugriff (Falle 1) — wer `Tag` als
 *     Baustein etabliert, macht den Griff dorthin wahrscheinlicher.
 *
 * KEIN "use client": der Chip steht auf RSC-Seiten UND in Client-Inseln. Er
 * ruft nichts auf Modulebene auf und gibt nur JSX zurueck, also laeuft er in
 * beiden Ebenen.
 *
 * DIE FARBE KOMMT UEBER DIE KLASSE, NICHT ALS PROP. Nur so traegt der Chip
 * beide Modi, ohne dass der Server den Modus kennen muss — der Moduswechsel ist
 * reines CSS (`:root[data-theme="dark"]`), und eine Server Component weiss gar
 * nicht, welcher gilt.
 *
 * DIE ABBILDUNGEN SIND `Record<…, string>` UND KEIN INDEXZUGRIFF AUF `s`:
 * `s[ton]` waere `undefined` bei einem Tippfehler und ergaebe
 * `className="chip undefined"` — Polster und Rundung, aber keine Farbe. Als
 * `Record` ueber der geschlossenen Union ist ein fehlender Ton ein Typfehler.
 */
const TON_KLASSE: Record<ChipTon, string> = {
  grau: s.tonGrau,
  stahl: s.tonStahl,
  ocker: s.tonOcker,
  ok: s.tonOk,
  achtung: s.tonAchtung,
};

const FORM_KLASSE: Record<PrioritaetForm, string> = {
  gefuellt: s.prioGefuellt,
  kontur: s.prioKontur,
  text: s.prioText,
};

export function Chip({
  ton,
  zeichen,
  children,
}: {
  ton: ChipTon;
  zeichen?: IkonName;
  children: ReactNode;
}) {
  return (
    <span data-chip data-ton={ton} className={`${s.chip} ${TON_KLASSE[ton]}`}>
      {zeichen ? <Ikone name={zeichen} groesse={12} /> : null}
      {children}
    </span>
  );
}

/** Genau ein Zeichen im Modul: die Zurückweisung. Alles andere traegt nur Text. */
const STATUS_ZEICHEN: Partial<Record<Status, IkonName>> = {
  zurueckgewiesen: "warnung",
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <Chip ton={STATUS_TON[status]} zeichen={STATUS_ZEICHEN[status]}>
      {STATUS_TEXT[status]}
    </Chip>
  );
}

export function PrioritaetChip({ prioritaet }: { prioritaet: Prioritaet }) {
  return (
    <span
      data-chip
      data-prioritaet={prioritaet}
      className={`${s.chip} ${FORM_KLASSE[PRIORITAET_FORM[prioritaet]]}`}
    >
      {PRIORITAET_TEXT[prioritaet]}
    </span>
  );
}
```

- [ ] **Step 7: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/Chip.test.tsx`
Expected: PASS.

- [ ] **Step 8: Kachel schreiben**

Create `src/app/m/aufgaben/_ui/Kachel.tsx`:

```tsx
import { Card } from "antd";
import Link from "next/link";
import type { ReactNode } from "react";
import { SCHRIFT } from "@/core/theme/schrift";
import { Ikone } from "./ikonen";
import s from "./aufgaben.module.css";

/*
 * `Card` plus eigene Kante, KEIN `Statistic`.
 *
 * `Statistic` waere in RSC sicher, aber eine farbige ZAHL ist genau „Rot auf
 * einer Datenflaeche": eine rote 7 ist von einer 7 in Suite-Rot nicht zu
 * unterscheiden, und ein Zahlenwert ist die Datenflaeche schlechthin. DIE KANTE
 * TRAEGT DIE FARBE, DIE ZAHL TRAEGT TINTE — genau die Form „Text plus Kante",
 * die docs/design/README.md als Ersatz fuer ein rotes `Alert` vorschlaegt.
 *
 * EINE KACHEL MIT `0` BLEIBT STEHEN UND WIRD NICHT VERLINKT. Sie zu verbergen
 * waere schlechter: „keine offene Freigabe" ist eine Information, und eine
 * Kachelreihe, die ihre Laenge aendert, laesst sich nicht wiedererkennen. Der
 * Aufrufer entscheidet das, indem er `href` weglaesst.
 *
 * `kante` ist ABSICHTLICH ohne „grau"-Wert: eine graue Kante neben einer
 * ockerfarbenen und einer gruenen liesse sich als vierte Stufe lesen, und die
 * gibt es nicht. Keine Kante heisst „neutral".
 */
const KANTE = {
  achtung: s.kpiKanteAchtung,
  ocker: s.kpiKanteOcker,
  ok: s.kpiKanteOk,
} as const;

export function Kachel({
  zahl,
  beschriftung,
  kante,
  href,
}: {
  zahl: ReactNode;
  beschriftung: ReactNode;
  kante?: keyof typeof KANTE;
  href?: string;
}) {
  const inhalt = (
    <div className={[s.kpi, kante ? KANTE[kante] : undefined].filter(Boolean).join(" ")}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span data-rolle="kachelzahl" style={SCHRIFT.zahl}>
          {zahl}
        </span>
        {href ? <Ikone name="chevron-rechts" /> : null}
      </div>
      <div style={{ ...SCHRIFT.neben, marginBlockStart: 4 }}>{beschriftung}</div>
    </div>
  );

  return (
    <Card styles={{ body: { padding: 12 } }} style={{ height: "100%" }}>
      {href ? (
        <Link className={s.kpiLink} href={href}>
          {inhalt}
        </Link>
      ) : (
        inhalt
      )}
    </Card>
  );
}
```

- [ ] **Step 9: SeitenKopf-Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_ui/SeitenKopf.test.tsx`:

```tsx
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { SeitenKopf } from "./SeitenKopf";

describe("SeitenKopf", () => {
  it("rendert ein natives h1 mit dem Titel", async () => {
    await mount(<SeitenKopf titel="Meine Woche" />);
    expect(query("h1").textContent).toBe("Meine Woche");
    await unmount();
  });

  it("zeigt die Kontextzeile, wenn eine da ist", async () => {
    await mount(<SeitenKopf titel="T" kontext="5 Aufgaben, 12,5 von 39 Std. verplant" />);
    expect(query("[data-rolle='kontext']").textContent).toContain("12,5 von 39 Std.");
    await unmount();
  });

  it("laesst die Kontextzeile weg, statt eine leere zu rendern", async () => {
    await mount(<SeitenKopf titel="T" />);
    expect(exists("[data-rolle='kontext']")).toBe(false);
    await unmount();
  });

  /*
   * JEDE SEITE MUSS ZURUECKFUEHREN, sonst ist sie eine Sackgasse
   * (docs/design/README.md). Die Brotkrume ist die Form davon.
   */
  it("rendert einen benannten Rueckweg als Navigation", async () => {
    await mount(<SeitenKopf titel="T" zurueck={{ href: "/", text: "Übersicht" }} />);
    const nav = query("nav[aria-label='Brotkrume']");
    expect(nav.querySelector("a")?.getAttribute("href")).toBe("/");
    expect(nav.textContent).toContain("Übersicht");
    await unmount();
  });
});

/**
 * DER REPO-WEITE RIEGEL DES MODULS. Er steht hier und nicht in einer eigenen
 * Datei, weil der Seitenkopf die Stelle ist, an der der Griff nach
 * `Typography.Title` am naechsten liegt — wer ihn hier nicht findet, sucht ihn
 * nirgends.
 */
describe("Modulweite Verbote", () => {
  const dateien: string[] = [];
  (function sammle(pfad: string) {
    for (const eintrag of readdirSync(pfad)) {
      const voll = join(pfad, eintrag);
      if (statSync(voll).isDirectory()) sammle(voll);
      else if (/\.tsx?$/.test(eintrag) && !/\.test\.tsx?$/.test(eintrag)) dateien.push(voll);
    }
  })(join(process.cwd(), "src/app/m/aufgaben"));

  const ohneKommentare = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("findet ueberhaupt Moduldateien", () => {
    expect(dateien.length).toBeGreaterThan(5);
  });

  /*
   * `Typography` kommt im ganzen Modul nicht vor, auch nicht in
   * Client-Komponenten. Das ist eine Regel, die man nicht pro Datei pruefen
   * muss — und sie schliesst Falle 1 (`Typography.Title` in RSC ergibt HTTP
   * 500) strukturell aus, statt sie zu umgehen.
   */
  it("nennt Typography in keiner Moduldatei", () => {
    const treffer = dateien.filter((d) => /\bTypography\b/.test(ohneKommentare(readFileSync(d, "utf8"))));
    expect(treffer.map((d) => d.replace(process.cwd(), ""))).toEqual([]);
  });

  it("importiert @ant-design/icons in keiner Moduldatei", () => {
    const treffer = dateien.filter((d) => /@ant-design\/icons/.test(ohneKommentare(readFileSync(d, "utf8"))));
    expect(treffer.map((d) => d.replace(process.cwd(), ""))).toEqual([]);
  });

  /*
   * `size="large"` ist 72px, nicht 56. `controlHeight: 56` ist die
   * Suite-Vorgabe und schon das richtige Touchmass — `size` gehoert auf
   * Bedienelementen also gar nicht gesetzt.
   */
  it("setzt nirgends size=\"large\"", () => {
    const treffer = dateien.filter((d) => /size=["']large["']/.test(ohneKommentare(readFileSync(d, "utf8"))));
    expect(treffer.map((d) => d.replace(process.cwd(), ""))).toEqual([]);
  });

  /*
   * `Grid.useBreakpoint` ist ein Compound-Zugriff UND ein JS-Breakpoint: in RSC
   * verboten, und selbst in einer Client-Insel zeigt es beim ersten Render die
   * falsche Variante. Die Umschaltung ist CSS.
   */
  it("nutzt nirgends Grid.useBreakpoint", () => {
    const treffer = dateien.filter((d) => /useBreakpoint/.test(ohneKommentare(readFileSync(d, "utf8"))));
    expect(treffer.map((d) => d.replace(process.cwd(), ""))).toEqual([]);
  });
});
```

- [ ] **Step 10: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/SeitenKopf.test.tsx`
Expected: FAIL — `Failed to resolve import "./SeitenKopf"`.

- [ ] **Step 11: SeitenKopf schreiben**

Create `src/app/m/aufgaben/_ui/SeitenKopf.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { Ikone } from "./ikonen";
import s from "./aufgaben.module.css";

/*
 * DER KOPF JEDER SEITE DES MODULS — uebernommen aus `feedback` (§4.2 in
 * docs/design/feedback-admin.md), nicht neu erfunden. Flach, keine Karte, drei
 * Zeilen: Brotkrume · <h1> mit den Aktionen rechts in derselben Zeile ·
 * Kontextzeile.
 *
 * KEINE CLIENT-DIREKTIVE, und das ist der Punkt: die Ueberschrift ist NACKTES
 * `<h1>` mit einer Rolle aus `SCHRIFT`, nicht `Typography.Title`. Ein
 * Compound-Zugriff auf antd ergibt in einer Server Component HTTP 500, und die
 * Alternative „macht die Ueberschrift halt zu einer Client-Insel" kostete eine
 * Client-Grenze pro Seite fuer eine Zeile Text.
 *
 * DIE ROLLE KOMMT ALS INLINE-STIL, nicht als CSS-Klasse: `core/theme/schrift.ts`
 * ist die eine Quelle, und eine zweite Abschrift in `aufgaben.module.css` waere
 * genau die Doppelung, gegen die die Rollen-Datei gebaut ist.
 *
 * Auf 390px bleibt `<h1>` bei 24 mit `text-wrap: balance`, die Aktionen
 * rutschen darunter (`flex-wrap`), die Kontextzeile bleibt.
 */
export function SeitenKopf({
  titel,
  kontext,
  aktionen,
  zurueck,
}: {
  titel: string;
  /** Eine Zeile Lage in 12/gedaempft. Fehlt sie, wird KEINE leere Zeile gerendert. */
  kontext?: ReactNode;
  aktionen?: ReactNode;
  /** Der benannte Rueckweg. Jede Seite ausser dem Einstieg traegt einen. */
  zurueck?: { href: string; text: string };
}) {
  return (
    <div style={{ marginBlockEnd: SPACE.xl }}>
      {zurueck ? (
        <nav aria-label="Brotkrume" style={{ marginBlockEnd: SPACE.xs }}>
          <Link className={s.backlink} href={zurueck.href}>
            <Ikone name="pfeil-links" groesse={15} />
            {zurueck.text}
          </Link>
        </nav>
      ) : null}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: SPACE.md,
        }}
      >
        <h1 style={{ ...SCHRIFT.titel, margin: 0, textWrap: "balance" }}>{titel}</h1>
        {aktionen ? <div className={s.knopfzeile}>{aktionen}</div> : null}
      </div>

      {kontext ? (
        <p
          data-rolle="kontext"
          style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)", margin: `${SPACE.xs}px 0 0`, maxWidth: "72ch" }}
        >
          {kontext}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 12: Alle Tests der Aufgabe laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben`
Expected: PASS — auch die vier modulweiten Verbote in `SeitenKopf.test.tsx`.

- [ ] **Step 13: Gates und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build && \
rtk git add src/app/m/aufgaben/_ui && \
rtk git commit -m "feat(aufgaben): Zeichenquelle, Chip, Kachel, Seitenkopf

Zeichen kommen aus react-icons/pi (gemessen unbedenklich in RSC, Vorbild
lagerbuch), NICHT aus @ant-design/icons: der nackte Spezifizierer ergibt
HTTP 500 schon beim Import, und \"use client\" behebt das nicht, sondern
macht es still.

Der Seitenkopf ist das Muster aus feedback §4.2, nicht ein neues: natives
h1 mit einer Rolle aus core/theme/schrift, und Typography kommt im ganzen
Modul nicht vor. Das schliesst Falle 1 strukturell aus statt sie zu
umgehen — SeitenKopf.test.tsx haelt es modulweit fest, zusammen mit den
Verboten fuer @ant-design/icons, size=\"large\" und Grid.useBreakpoint.

Ton- und Formklassen sind Records ueber geschlossenen Unions statt
Indexzugriffen auf das CSS-Modul: ein Tippfehler waere sonst \`undefined\`
als Klasse — Polster und Rundung, aber keine Farbe."
```

---

## Task 7: Demo-Rollenwechsler und Modulnavigation

Der Rollenwechsler ist ein **Streichposten** und muss als solcher erkennbar sein. Er löst zugleich das Problem, das Bauabschnitt 1 sonst hätte: ohne Tabelle `person` gibt es keine Rolle, und ohne Rolle ist keiner der drei Einstiege prüfbar.

**Files:**
- Create: `src/app/m/aufgaben/_lib/demoRolle.ts`
- Create: `src/app/m/aufgaben/_lib/demoRolle.test.ts`
- Create: `src/app/m/aufgaben/_lib/demoRolleAktion.ts`
- Create: `src/app/m/aufgaben/_lib/nav.ts`
- Create: `src/app/m/aufgaben/_lib/nav.test.ts`
- Create: `src/app/m/aufgaben/_ui/DemoRollenWechsler.tsx`
- Modify: `src/app/m/aufgaben/layout.tsx` (Nav übergeben, Wechsler einsetzen)

**Interfaces:**
- Consumes: `demoDaten` aus `_lib/demoDaten.ts`; `Person` aus `_lib/typen.ts`; `SuiteNavItem` aus `@/core/shell/types`
- Produces:
  - `_lib/demoRolle.ts`: `DEMO_PERSON_COOKIE = "aufgaben-demo-person"`, `DEMO_VORGABE = "sarah"`, `demoPersonAus(wert: string | undefined, personen: Person[]): Person`, `aktuelleDemoPerson(jetzt: Date): Promise<Person>`
  - `_lib/nav.ts`: `navFuer(person: Person): SuiteNavItem[]`
  - `_lib/demoRolleAktion.ts`: `setzeDemoPerson(formData: FormData): Promise<void>`
  - `_ui/DemoRollenWechsler.tsx`: `DemoRollenWechsler({ personen, aktuelleId, zurueck })`

- [ ] **Step 1: Test für die Rollenauflösung schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_lib/demoRolle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { demoDaten } from "./demoDaten";
import { DEMO_VORGABE, demoPersonAus } from "./demoRolle";

const PERSONEN = demoDaten(new Date("2026-08-13T10:00:00Z")).personen;

describe("demoPersonAus", () => {
  it("findet die Person zum Cookie-Wert", () => {
    expect(demoPersonAus("lea", PERSONEN).id).toBe("lea");
    expect(demoPersonAus("schulle", PERSONEN).id).toBe("schulle");
  });

  it("faellt ohne Cookie auf die Vorgabe zurueck", () => {
    expect(demoPersonAus(undefined, PERSONEN).id).toBe(DEMO_VORGABE);
  });

  /*
   * DER FALL, DER OHNE PRUEFUNG EINE WEISSE SEITE ERGIBT: ein Cookie mit einem
   * Wert, den es nicht (mehr) gibt — etwa nachdem die Demodaten umbenannt
   * wurden, waehrend im Browser noch das alte Cookie liegt. Ein
   * `personen.find(...)!` waere dort `undefined`, und der erste Zugriff auf
   * `person.rolle` wirft: HTTP 500 auf jeder Seite des Moduls, bis der Nutzer
   * von sich aus sein Cookie loescht. Deshalb der Rueckfall, nicht das
   * Ausrufezeichen.
   */
  it("faellt bei einem unbekannten Wert auf die Vorgabe zurueck", () => {
    expect(demoPersonAus("gibtesnicht", PERSONEN).id).toBe(DEMO_VORGABE);
    expect(demoPersonAus("", PERSONEN).id).toBe(DEMO_VORGABE);
  });

  it("kennt die Vorgabe als echte Person der Demodaten", () => {
    expect(PERSONEN.some((p) => p.id === DEMO_VORGABE)).toBe(true);
  });

  /*
   * Die Vorgabe ist die Koordination, weil das der Einstieg mit dem meisten
   * Ueberblick ist: wer den Klickdummy zum ersten Mal oeffnet, soll die
   * Verteilung sehen und von dort in die anderen Rollen wechseln koennen.
   */
  it("startet in der Rolle koordination", () => {
    expect(demoPersonAus(undefined, PERSONEN).rolle).toBe("koordination");
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/demoRolle.test.ts`
Expected: FAIL — `Failed to resolve import "./demoRolle"`.

- [ ] **Step 3: Rollenauflösung schreiben**

Create `src/app/m/aufgaben/_lib/demoRolle.ts`:

```ts
import { cookies } from "next/headers";
import { demoDaten } from "./demoDaten";
import type { Person } from "./typen";

/*
 * WER SCHAUT GERADE ZU — Bauabschnitt 1. STREICHPOSTEN: Bauabschnitt 2 ersetzt
 * diese Datei durch `personFuerSession()`, das die Person aus der Tabelle
 * `person` anhand des Pocket-ID-`sub` aufloest. Die Signaturen der Praedikate in
 * `zugang.ts` bleiben dabei unveraendert — nur der Aufrufer wechselt.
 *
 * WARUM EIN COOKIE UND KEIN QUERY-PARAMETER: der Klickdummy hat neun Routen,
 * und ein `?als=lea` muesste durch jeden Link, jeden Rueckweg und jede
 * Brotkrume mitgeschleift werden. Ein vergessener Link faellt still auf die
 * Vorgaberolle zurueck, und dann klickt man sich unbemerkt in einer anderen
 * Rolle weiter — der Fehler, der einen Klickdummy unbrauchbar macht, weil man
 * ihm nicht mehr glaubt.
 *
 * KEIN "use client": `aktuelleDemoPerson` liest `cookies()` und ist damit
 * server-only, und `demoPersonAus` ist eine reine Funktion, die von Server
 * Components aufgerufen wird.
 */

export const DEMO_PERSON_COOKIE = "aufgaben-demo-person";

/**
 * Die Koordination, weil das der Einstieg mit dem meisten Ueberblick ist: wer
 * den Klickdummy zum ersten Mal oeffnet, sieht die Verteilung und kann von dort
 * in die anderen Rollen wechseln.
 */
export const DEMO_VORGABE = "sarah";

/**
 * Reine Auflösung, damit sie prüfbar ist.
 *
 * DER RUECKFALL IST NICHT KOSMETIK. Ein `personen.find(...)!` waere bei einem
 * Cookie mit unbekanntem Wert `undefined` — etwa nachdem die Demodaten
 * umbenannt wurden, waehrend im Browser noch das alte Cookie liegt. Der erste
 * Zugriff auf `person.rolle` wirft dann, und zwar auf JEDER Seite des Moduls,
 * bis der Nutzer von sich aus sein Cookie loescht.
 */
export function demoPersonAus(wert: string | undefined, personen: Person[]): Person {
  const gewaehlt = wert ? personen.find((p) => p.id === wert) : undefined;
  const vorgabe = personen.find((p) => p.id === DEMO_VORGABE);
  if (!vorgabe) throw new Error(`Demodaten ohne Vorgabeperson ${DEMO_VORGABE}`);
  return gewaehlt ?? vorgabe;
}

export async function aktuelleDemoPerson(jetzt: Date): Promise<Person> {
  const laden = await cookies();
  return demoPersonAus(laden.get(DEMO_PERSON_COOKIE)?.value, demoDaten(jetzt).personen);
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/demoRolle.test.ts`
Expected: PASS.

- [ ] **Step 5: Nav-Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_lib/nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aktiverEintrag } from "@/core/shell/SuiteNav";
import { navFuer } from "./nav";
import type { Person, Rolle } from "./typen";

const person = (rolle: Rolle): Person => ({
  id: "x", name: "X", initialen: "XX", rolle, sollMinutenTag: 468, aktivBis: null,
});

describe("navFuer", () => {
  it("gibt jeder Rolle eine Navigation mit Wurzeleintrag", () => {
    for (const r of ["koordination", "auftrag", "bufdi"] as Rolle[]) {
      const nav = navFuer(person(r));
      expect(nav.length, r).toBeGreaterThan(1);
      expect(nav.filter((e) => e.href === "/").length, `Wurzel bei ${r}`).toBe(1);
    }
  });

  it("nutzt durchgehend die aeussere Pfadform", () => {
    for (const r of ["koordination", "auftrag", "bufdi"] as Rolle[]) {
      for (const e of navFuer(person(r))) {
        expect(e.href, `${r}: ${e.href}`).not.toMatch(/^\/m\//);
        expect(e.href.startsWith("/"), `${r}: ${e.href}`).toBe(true);
      }
    }
  });

  it("gibt jedem Eintrag einen eindeutigen Schluessel", () => {
    for (const r of ["koordination", "auftrag", "bufdi"] as Rolle[]) {
      const keys = navFuer(person(r)).map((e) => e.key);
      expect(new Set(keys).size, r).toBe(keys.length);
    }
  });

  /*
   * DIE ANTWORT AUF „SCHULLE PFUSCHT REIN", ZWEITE HAELFTE: der Weg zum
   * Verteilen existiert in seiner Navigation nicht. Zusammen mit
   * `darfVerteilen` in `zugang.ts` ist das dasselbe Praedikat auf denselben
   * Betrachter — zwei Quellen liefen genau hier auseinander.
   */
  it("zeigt die Verteilung nur der Koordination", () => {
    const hat = (r: Rolle) => navFuer(person(r)).some((e) => e.href === "/verteilen" || e.key === "verteilung");
    expect(hat("koordination")).toBe(true);
    expect(hat("auftrag")).toBe(false);
    expect(hat("bufdi")).toBe(false);
  });

  it("zeigt die Personenverwaltung nur der Koordination", () => {
    const hat = (r: Rolle) => navFuer(person(r)).some((e) => e.href === "/personen");
    expect(hat("koordination")).toBe(true);
    expect(hat("auftrag")).toBe(false);
    expect(hat("bufdi")).toBe(false);
  });

  it("zeigt Routinen nur BuFDis", () => {
    const hat = (r: Rolle) => navFuer(person(r)).some((e) => e.href === "/routinen");
    expect(hat("bufdi")).toBe(true);
    expect(hat("koordination")).toBe(false);
    expect(hat("auftrag")).toBe(false);
  });

  it("zeigt die Freigabe-Warteschlange Koordination und Auftraggebern, nicht BuFDis", () => {
    const hat = (r: Rolle) => navFuer(person(r)).some((e) => e.href === "/freigaben");
    expect(hat("koordination")).toBe(true);
    expect(hat("auftrag")).toBe(true);
    expect(hat("bufdi")).toBe(false);
  });
});

describe("Aktivmarkierung gegen die echte Suite-Logik", () => {
  const NAV = navFuer(person("bufdi"));

  it("markiert den Wurzeleintrag auf der Modulwurzel genau", () => {
    expect(aktiverEintrag("/", NAV)).toEqual({ schluessel: NAV[0].key, genau: true });
  });

  it("markiert einen eigenen Eintrag genau", () => {
    expect(aktiverEintrag("/routinen", NAV)?.genau).toBe(true);
  });

  /*
   * DER FALL, DEN DAS LAGERBUCH DURCH VERZICHT AUF EINEN WURZELEINTRAG LOEST
   * UND DEN WIR ANDERS ENTSCHEIDEN: eine Detailseite (`/a/12`) trifft keinen
   * Eintrag. `aktiverEintrag` faellt dann auf die Wurzel zurueck, aber mit
   * `genau: false` — die Navigation zeigt „hier bist du im Abschnitt", nicht
   * „das ist diese Seite". Das ist besser als gar keine Orientierung, und
   * `aria-current` traegt dann `"true"` statt `"page"`. Die Detailseiten tragen
   * zusaetzlich ihre eigene Brotkrume (`SeitenKopf`-Prop `zurueck`).
   */
  it("faellt auf Detailseiten auf die Wurzel zurueck, aber ungenau", () => {
    expect(aktiverEintrag("/a/12", NAV)).toEqual({ schluessel: NAV[0].key, genau: false });
  });

  /*
   * Und die Gegenprobe zum UMGESCHRIEBENEN Pfad: unter dem Host-Rewrite sieht
   * die Middleware `/m/aufgaben/routinen`. `aktiverEintrag` loest per Suffix
   * auf — genau dafuer traegt `href` die AEUSSERE Form.
   */
  it("markiert auch den umgeschriebenen Pfad", () => {
    expect(aktiverEintrag("/m/aufgaben/routinen", NAV)?.schluessel).toBe("routinen");
  });
});
```

- [ ] **Step 6: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/nav.test.ts`
Expected: FAIL — `Failed to resolve import "./nav"`.

- [ ] **Step 7: Nav schreiben**

Create `src/app/m/aufgaben/_lib/nav.ts`:

```ts
import type { SuiteNavItem } from "@/core/shell/types";
import type { Person } from "./typen";

/*
 * DIE MODULNAVIGATION, ROLLENABHAENGIG. Dieser Wert wird von einer Server
 * Component gelesen (`layout.tsx`) und liegt deshalb bewusst in `_lib/` ohne
 * "use client".
 *
 * DIE HREFS TRAGEN DIE AEUSSERE PFADFORM (`/verteilen`, nicht
 * `/m/aufgaben/verteilen`). Unter dem Host-Rewrite fuehrt die aeussere Form an
 * die richtige Stelle, die innere in einen doppelt praefixierten Pfad — und
 * `aktiverEintrag` loest beide per Suffix auf, aber nur, wenn hier die aeussere
 * steht.
 *
 * ES GIBT EINEN WURZELEINTRAG, anders als im Lagerbuch. Dort war der Verzicht
 * richtig, weil neun Detailseiten sonst eine FALSCHE Aktivmarkierung getragen
 * haetten. Hier ist die Lage anders: `aktiverEintrag` faellt auf die Wurzel mit
 * `genau: false` zurueck, `aria-current` wird `"true"` statt `"page"`, und das
 * ist eine wahre Aussage („du bist in diesem Abschnitt"). Ersatzlos zu
 * streichen waere schlechter — dann erfaehrt niemand mehr, wo er ist.
 *
 * KEIN `ikon`: `NavIkonName` in `core/shell/types.ts` ist eine geschlossene
 * Union aus fuenfzehn lagerbuch-eigenen Namen. Sie fuer dieses Modul zu
 * erweitern hiesse, `core` um ein Vokabular zu vergroessern, das genau einen
 * Nutzniesser hat — der Maszstab ist ein ZWEITER, heute belegbarer. Das Feld
 * ist optional; ohne es rendert die Navigation reine Textlinks.
 */
export function navFuer(person: Person): SuiteNavItem[] {
  if (person.rolle === "koordination") {
    return [
      { key: "verteilung", title: "Verteilung", href: "/" },
      { key: "freigaben", title: "Freigaben", href: "/freigaben" },
      { key: "personen", title: "Personen", href: "/personen" },
      { key: "archiv", title: "Archiv", href: "/archiv" },
    ];
  }
  if (person.rolle === "auftrag") {
    return [
      { key: "auftraege", title: "Meine Aufträge", href: "/" },
      { key: "neu", title: "Aufgabe einstellen", href: "/neu" },
      { key: "freigaben", title: "Freigaben", href: "/freigaben" },
      { key: "archiv", title: "Archiv", href: "/archiv" },
    ];
  }
  return [
    { key: "woche", title: "Meine Woche", href: "/" },
    { key: "routinen", title: "Routinen", href: "/routinen" },
    { key: "archiv", title: "Archiv", href: "/archiv" },
  ];
}
```

- [ ] **Step 8: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/nav.test.ts`
Expected: PASS.

- [ ] **Step 9: Server-Action und Client-Insel schreiben**

Create `src/app/m/aufgaben/_lib/demoRolleAktion.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_PERSON_COOKIE } from "./demoRolle";

/*
 * DIE EINZIGE SERVER-ACTION DES BAUABSCHNITTS — und sie aendert keine Fachdaten,
 * nur wer zusieht. STREICHPOSTEN, verschwindet mit Bauabschnitt 2.
 *
 * `httpOnly: false` ist hier ABSICHTLICH und ausnahmsweise unbedenklich: das
 * Cookie traegt keine Berechtigung, sondern eine Ansichtswahl im Klickdummy.
 * Die Berechtigung kommt in Bauabschnitt 2 aus der Datenbank, aufgeloest ueber
 * den Pocket-ID-`sub` der Sitzung — nie aus einem Cookie, das der Browser
 * setzen kann.
 *
 * `zurueck` KOMMT ALS FELD UND WIRD GEPRUEFT. Das Feld ist noetig, weil eine
 * Server-Action den aufgerufenen Pfad nicht kennt — die Middleware setzt keinen
 * Pfad-Header (gepruefte Tatsache, `src/proxy.ts` schreibt nur einen Rewrite),
 * und der aufrufende Client kennt ihn ueber `usePathname()`. Ein
 * `redirect("/")` ohne Feld waere sicher, wuerfe aber den Seitenkontext weg —
 * wer auf `/freigaben` die Rolle wechselt, will dort bleiben.
 *
 * DIE PRUEFUNG IST NICHT OPTIONAL: ohne sie ist das ein offener Redirect. Ein
 * Formular-POST mit `zurueck=https://fremde.example` fuehrte nach dem
 * Rollenwechsel dorthin, und das Feld ist Client-Eingabe, auch wenn es heute
 * nur von unserer eigenen Insel gefuellt wird.
 */
export async function setzeDemoPerson(formData: FormData): Promise<void> {
  const id = String(formData.get("personId") ?? "");
  const rohZurueck = String(formData.get("zurueck") ?? "/");
  // Nur modulinterne, absolute Pfade. `//host` und `/\host` sind protokoll-
  // relative URLs und muessen mit ausgeschlossen werden.
  const zurueck = /^\/(?![/\\])[\w/[\]-]*$/.test(rohZurueck) ? rohZurueck : "/";

  const laden = await cookies();
  laden.set(DEMO_PERSON_COOKIE, id, { path: "/", httpOnly: false, sameSite: "lax" });
  redirect(zurueck);
}
```

Create `src/app/m/aufgaben/_ui/DemoRollenWechsler.tsx`:

```tsx
"use client";

import { Button, Select } from "antd";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SCHRIFT } from "@/core/theme/schrift";
import { setzeDemoPerson } from "../_lib/demoRolleAktion";
import type { Person } from "../_lib/typen";
import s from "./aufgaben.module.css";

const ROLLENTEXT: Record<Person["rolle"], string> = {
  koordination: "Koordination",
  auftrag: "Auftraggeber & Freigabe",
  bufdi: "BuFDi",
};

/*
 * STREICHPOSTEN. Diese Datei verschwindet mit Bauabschnitt 2, zusammen mit
 * `_lib/demoRolle.ts` und `_lib/demoRolleAktion.ts`.
 *
 * SIE MUSS SICHTBAR NACH DEMO AUSSEHEN — gestrichelte Kontur, ausgeschriebener
 * Hinweis. Ein Rollenwechsler, der wie ein Produktbestandteil aussieht, ist
 * genau die Art Provisorium, die in eine Abnahme durchrutscht: er waere ein
 * Weg, jede Rolle einzunehmen, und im Klickdummy ist das der Zweck, im Betrieb
 * eine Katastrophe.
 *
 * `"use client"` ist hier RICHTIG und hat keine Nebenwirkung nach aussen: die
 * Datei exportiert nur diese Komponente, keinen Wert und keinen Typ, den eine
 * Server Component liest. Genau das ist der Unterschied zu `_lib/typen.ts` und
 * `_ui/ikonen.tsx`, die beide ohne Direktive auskommen MUESSEN.
 *
 * `Select` statt einer Knopfreihe: sechs Personen sind zu viele fuer eine
 * Reihe, und die native Tastaturbedienung kommt gratis. Und KEIN `size` — der
 * Suite-Standard ist 56px und schon das richtige Touchmass.
 *
 * DER RUECKWEG KOMMT AUS `usePathname()`, nicht als Prop aus dem Layout. Der
 * Grund ist, dass es ihn im Layout nicht gibt: eine Server Component kennt den
 * aufgerufenen Pfad nicht, und `src/proxy.ts` setzt keinen Header damit. Einen
 * dort zu ergaenzen waere Aufwand an der teuersten Datei der Suite (deren
 * heutige Naht `src/proxy.test.ts` bewacht) fuer eine Bequemlichkeit im
 * Klickdummy. Im Browser ist `usePathname()` ausserdem genau die AEUSSERE
 * Pfadform — unter dem Host-Rewrite also `/freigaben` und nicht
 * `/m/aufgaben/freigaben`, was die Pruefung in der Action erwartet.
 */
export function DemoRollenWechsler({
  personen,
  aktuelleId,
}: {
  personen: Person[];
  aktuelleId: string;
}) {
  const [gewaehlt, setGewaehlt] = useState(aktuelleId);
  const zurueck = usePathname();

  return (
    <form action={setzeDemoPerson} className={s.demoLeiste} data-rolle="demo-wechsler">
      <span style={{ ...SCHRIFT.kicker, color: "var(--auf-stahl)" }}>Demo-Ansicht</span>
      <input type="hidden" name="personId" value={gewaehlt} />
      <input type="hidden" name="zurueck" value={zurueck} />
      <label htmlFor="demo-person" style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)" }}>
        Zusehen als
      </label>
      <Select
        id="demo-person"
        value={gewaehlt}
        onChange={setGewaehlt}
        style={{ minWidth: 260 }}
        options={personen.map((p) => ({
          value: p.id,
          label: `${p.name} — ${ROLLENTEXT[p.rolle]}${p.aktivBis ? " (ausgeschieden)" : ""}`,
        }))}
      />
      <Button htmlType="submit">Wechseln</Button>
      <span style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)" }}>
        Nur im Klickdummy. Im Betrieb kommt die Rolle aus der Datenbank.
      </span>
    </form>
  );
}
```

- [ ] **Step 10: Layout auf Rolle und Navigation umstellen**

Replace `src/app/m/aufgaben/layout.tsx`:

```tsx
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { demoDaten } from "./_lib/demoDaten";
import { aktuelleDemoPerson } from "./_lib/demoRolle";
import { navFuer } from "./_lib/nav";
import { DemoRollenWechsler } from "./_ui/DemoRollenWechsler";
import s from "./_ui/aufgaben.module.css";

/*
 * `.modul` liegt AUSSERHALB der Shell, wie im Lagerbuch (`VerwaltungsRahmen`):
 * so tragen auch die Teile der Shell, die Modulinhalt umschliessen, die
 * --auf-*-Variablen. Innerhalb waere der Traeger ein Nachfahre der Kopfzeile,
 * und dort fehlten sie.
 *
 * DIE NAVIGATION HAENGT AN DER ROLLE, und dieselbe Rolle entscheidet in
 * `zugang.ts` ueber die Riegel. Eine zweite Quelle waere genau der Fehler, den
 * docs/design/README.md beschreibt: Oberflaeche und Riegel muessen DASSELBE
 * Praedikat auf DENSELBEN Betrachter anwenden.
 *
 * DAS LAYOUT UEBERGIBT KEINEN PFAD. Eine Server Component kennt den aufgerufenen
 * Pfad nicht, und `src/proxy.ts` setzt keinen Header damit (geprueft — es
 * schreibt nur `NextResponse.rewrite`). Der Rollenwechsler liest ihn selbst
 * ueber `usePathname()`; er ist ohnehin eine Client-Insel.
 */
export default async function AufgabenLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("aufgaben");
  const jetzt = new Date();
  const person = await aktuelleDemoPerson(jetzt);

  return (
    <div className={s.modul}>
      <Shell variant={mod.shell} moduleKey={mod.key} nav={navFuer(person)}>
        <DemoRollenWechsler personen={demoDaten(jetzt).personen} aktuelleId={person.id} />
        {children}
      </Shell>
    </div>
  );
}
```

- [ ] **Step 11: Gates laufen lassen**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build && \
rtk pnpm exec playwright test e2e/aufgaben.spec.ts
```
Expected: alle grün. **Ein HTTP 500 hier zeigt auf `Select` oder `Button` in einer Server Component** — beide stehen in einer Client-Insel und sind damit erlaubt; steht die Direktive nicht in `DemoRollenWechsler.tsx`, fällt genau das aus.

- [ ] **Step 12: Commit**

```bash
rtk git add src/app/m/aufgaben && \
rtk git commit -m "feat(aufgaben): Demo-Rollenwechsler und rollenabhaengige Navigation

Der Wechsler ist ein Streichposten und sieht sichtbar danach aus —
gestrichelte Kontur, ausgeschriebener Hinweis. Einer, der wie ein
Produktbestandteil aussieht, rutscht in eine Abnahme durch, und dann ist
er ein Weg, jede Rolle einzunehmen.

Cookie statt Query-Parameter: neun Routen, und ein ?als=lea muesste durch
jeden Link. Ein vergessener faellt STILL auf die Vorgaberolle zurueck, und
dann klickt man sich unbemerkt in einer anderen Rolle weiter.

Die Navigation haengt an derselben Rolle, die in zugang.ts ueber die
Riegel entscheidet — zwei Quellen liefen genau hier auseinander. Kein
\`ikon\`: NavIkonName ist eine geschlossene Union aus fuenfzehn
lagerbuch-Namen, und sie fuer einen Nutzniesser zu erweitern verfehlt den
core-Maszstab."
```

---

## Task 8: Wochenplan und Aufgabenliste

Die beiden Bausteine, die auf allen neun Seiten wiederkehren. Der Wochenplan ist der teuerste des Moduls und der einzige mit zwei Ausprägungen.

**Files:**
- Create: `src/app/m/aufgaben/_lib/tagesplan.ts`
- Create: `src/app/m/aufgaben/_lib/tagesplan.test.ts`
- Create: `src/app/m/aufgaben/_ui/Wochenplan.tsx`
- Create: `src/app/m/aufgaben/_ui/Wochenplan.test.tsx`
- Create: `src/app/m/aufgaben/_ui/AufgabenListe.tsx`
- Create: `src/app/m/aufgaben/_ui/AufgabenListe.test.tsx`

**Interfaces:**
- Consumes: `Aufgabe`, `Person`, `Routine` aus `_lib/typen.ts`; `tagesBudget`, `fmtDauer`, `fmtStunden`, `fmtTagKurz`, `wochentagVon`, `routineAmTag`, `vorschlagOffen`, `istUeberfaellig` aus `_lib/anzeige.ts`; `StatusChip`, `PrioritaetChip` aus `_ui/Chip.tsx`
- Produces:
  - `_lib/tagesplan.ts`: `TAGESBEGINN_MINUTEN = 480`, `minutenVon(uhrzeit: string): number`, `interface TagesEintrag { art: "aufgabe" | "routine"; id: string; titel: string; uhrzeit: string | null; minuten: number; dauerMinuten: number; aufgabe: Aufgabe | null }`, `tagesEintraege(aufgaben: Aufgabe[], routinen: Routine[], person: Person, datum: string): TagesEintrag[]`, `wochenTage(montag: string): string[]`
  - `_ui/Wochenplan.tsx`: `Wochenplan({ person, aufgaben, routinen, montag, heute })`
  - `_ui/AufgabenListe.tsx`: `AufgabenListe({ aufgaben, personen, heute, leerText, zeigeEmpfaenger })`

- [ ] **Step 1: Test für die Tagesordnung schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_lib/tagesplan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Aufgabe, Person, Routine } from "./typen";
import { minutenVon, tagesEintraege, wochenTage } from "./tagesplan";

const MO = "2026-08-10";
const DI = "2026-08-11";

const LEA: Person = {
  id: "lea", name: "Lea", initialen: "LE", rolle: "bufdi",
  sollMinutenTag: 468, aktivBis: null,
};

const aufgabe = (over: Partial<Aufgabe>): Aufgabe => ({
  id: "a", titel: "T", beschreibung: "", prioritaet: "mittel",
  erstellerId: "schulle", zugewiesenAn: "lea", status: "verteilt",
  faelligAm: MO, faelligUhrzeit: null, dauerMinuten: 60,
  nachweisPflicht: false, nachweisArt: "text", prueferId: "schulle",
  istSelbst: false, planDatum: MO, planUhrzeit: null, planRang: 1,
  vorschlagDatum: null, vorschlagUhrzeit: null,
  ...over,
});

const routine = (over: Partial<Routine>): Routine => ({
  id: "r", personId: "lea", titel: "R", wochentage: [0],
  uhrzeit: "08:00", dauerMinuten: 45, aktiv: true,
  ...over,
});

describe("minutenVon", () => {
  it("rechnet HH:MM in Minuten seit Mitternacht", () => {
    expect(minutenVon("00:00")).toBe(0);
    expect(minutenVon("08:00")).toBe(480);
    expect(minutenVon("11:30")).toBe(690);
    expect(minutenVon("23:59")).toBe(1439);
  });
});

describe("wochenTage", () => {
  it("gibt Montag bis Freitag als ISO-Tage", () => {
    expect(wochenTage(MO)).toEqual([
      "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14",
    ]);
  });
});

describe("tagesEintraege", () => {
  it("nimmt nur den richtigen Tag und die richtige Person", () => {
    const e = tagesEintraege(
      [
        aufgabe({ id: "hier" }),
        aufgabe({ id: "andererTag", planDatum: DI }),
        aufgabe({ id: "ungeplant", planDatum: null }),
        aufgabe({ id: "andere", zugewiesenAn: "noah" }),
      ],
      [],
      LEA,
      MO,
    );
    expect(e.map((x) => x.id)).toEqual(["hier"]);
  });

  it("nimmt nur aktive Routinen des Wochentags und der Person", () => {
    const e = tagesEintraege(
      [],
      [
        routine({ id: "hier" }),
        routine({ id: "ruht", aktiv: false }),
        routine({ id: "andererTag", wochentage: [1] }),
        routine({ id: "andere", personId: "noah" }),
      ],
      LEA,
      MO,
    );
    expect(e.map((x) => x.id)).toEqual(["hier"]);
  });

  it("ordnet Eintraege mit Uhrzeit nach der Uhrzeit", () => {
    const e = tagesEintraege(
      [
        aufgabe({ id: "spaet", planUhrzeit: "14:00", planRang: 1 }),
        aufgabe({ id: "frueh", planUhrzeit: "09:00", planRang: 2 }),
      ],
      [],
      LEA,
      MO,
    );
    expect(e.map((x) => x.id)).toEqual(["frueh", "spaet"]);
  });

  /*
   * DIE REGEL, DIE DIE ZUGESAGTE BAUFORM TRAEGT: ein Eintrag OHNE Uhrzeit erbt
   * die Uhrzeit des vorangehenden Ankers und sortiert dahinter. So sitzt eine
   * freie Aufgabe ZWISCHEN zwei festen Bloecken — genau das Bild, das der
   * Entwurf zeigt — statt am Ende des Tages zu sammeln.
   *
   * Ohne den geerbten Anker gaebe es nur zwei Moeglichkeiten, und beide sind
   * schlechter: alle freien Eintraege ans Tagesende (dann ist die Reihenfolge
   * des BuFDi nicht mehr ablesbar) oder alle an den Tagesbeginn (dann steht
   * eine Nachmittagsaufgabe vor dem Morgenblock).
   */
  it("laesst einen Eintrag ohne Uhrzeit dem vorangehenden Anker folgen", () => {
    const e = tagesEintraege(
      [
        aufgabe({ id: "anker-morgen", planUhrzeit: "08:00", planRang: 1 }),
        aufgabe({ id: "frei", planUhrzeit: null, planRang: 2 }),
        aufgabe({ id: "anker-nachmittag", planUhrzeit: "13:00", planRang: 3 }),
      ],
      [],
      LEA,
      MO,
    );
    expect(e.map((x) => x.id)).toEqual(["anker-morgen", "frei", "anker-nachmittag"]);
  });

  /*
   * Vor dem ersten Anker gilt der Tagesbeginn (08:00). Sonst haette eine freie
   * Aufgabe am Morgen keinen Bezugspunkt und `minuten` waere `NaN` oder 0 —
   * beides sortiert falsch, und 0 waere „kurz nach Mitternacht".
   */
  it("nimmt vor dem ersten Anker den Tagesbeginn", () => {
    const e = tagesEintraege(
      [
        aufgabe({ id: "frei", planUhrzeit: null, planRang: 1 }),
        aufgabe({ id: "anker", planUhrzeit: "13:00", planRang: 2 }),
      ],
      [],
      LEA,
      MO,
    );
    expect(e.map((x) => x.id)).toEqual(["frei", "anker"]);
    expect(e[0].minuten).toBe(480);
  });

  /*
   * DAS BILD DES ENTWURFS, ganz: Routine 08:00 · freie Aufgabe · Routine 13:00.
   * Bei gleichem Sortierwert steht die Routine vor der freien Aufgabe, die den
   * Wert von ihr geerbt hat — der Anker kommt zuerst, sein Gefolge danach.
   */
  it("mischt Routinen und Aufgaben zum Bild des Entwurfs", () => {
    const e = tagesEintraege(
      [aufgabe({ id: "material", planUhrzeit: null, planRang: 1, dauerMinuten: 120 })],
      [
        routine({ id: "posteingang", titel: "Posteingang", uhrzeit: "08:00", dauerMinuten: 60 }),
        routine({ id: "ablage", titel: "Ablage & Archiv", uhrzeit: "13:00", dauerMinuten: 120 }),
      ],
      LEA,
      MO,
    );
    expect(e.map((x) => x.id)).toEqual(["posteingang", "material", "ablage"]);
    expect(e.map((x) => x.art)).toEqual(["routine", "aufgabe", "routine"]);
  });

  it("haengt die Aufgabe an den Eintrag, die Routine nicht", () => {
    const e = tagesEintraege([aufgabe({ id: "a" })], [routine({ id: "r" })], LEA, MO);
    const proArt = Object.fromEntries(e.map((x) => [x.art, x]));
    expect(proArt.aufgabe.aufgabe?.id).toBe("a");
    expect(proArt.routine.aufgabe).toBeNull();
  });

  it("uebernimmt Titel und Dauer beider Sorten", () => {
    const e = tagesEintraege(
      [aufgabe({ id: "a", titel: "Lager", dauerMinuten: 120, planUhrzeit: "10:00" })],
      [routine({ id: "r", titel: "Post", dauerMinuten: 45, uhrzeit: "08:00" })],
      LEA,
      MO,
    );
    expect(e[0]).toMatchObject({ titel: "Post", dauerMinuten: 45, uhrzeit: "08:00" });
    expect(e[1]).toMatchObject({ titel: "Lager", dauerMinuten: 120, uhrzeit: "10:00" });
  });

  it("gibt am Wochenende die Aufgaben, aber keine Routinen", () => {
    const e = tagesEintraege(
      [aufgabe({ id: "a", planDatum: "2026-08-15" })],
      [routine({ id: "r", wochentage: [0, 1, 2, 3, 4] })],
      LEA,
      "2026-08-15",
    );
    expect(e.map((x) => x.id)).toEqual(["a"]);
  });

  it("gibt fuer einen leeren Tag ein leeres Feld statt eines Fehlers", () => {
    expect(tagesEintraege([], [], LEA, MO)).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/tagesplan.test.ts`
Expected: FAIL — `Failed to resolve import "./tagesplan"`.

- [ ] **Step 3: Tagesordnung schreiben**

Create `src/app/m/aufgaben/_lib/tagesplan.ts`:

```ts
import { routineAmTag, wochentagVon } from "./anzeige";
import type { Aufgabe, Person, Routine } from "./typen";

/*
 * DIE ORDNUNG EINES TAGES. Getrennt von `Wochenplan.tsx`, weil sie die einzige
 * Stelle mit Rechenlogik im teuersten Bauteil des Moduls ist — und weil sie so
 * unter Vitest pruefbar bleibt, ohne eine Komponente zu rendern.
 *
 * DIE BAUFORM, DIE HIER STECKT (getroffene Entscheidung): Tagesspalten mit
 * Reihenfolge und Dauer, und einzelne Eintraege duerfen eine FESTE Uhrzeit
 * tragen. Ein Eintrag mit Uhrzeit ist ein ANKER; ein Eintrag ohne erbt die
 * Uhrzeit des vorangehenden Ankers und sortiert dahinter. Damit sitzt eine
 * freie Aufgabe ZWISCHEN zwei festen Bloecken, statt am Tagesende zu sammeln.
 */

/**
 * 08:00. Der Bezugspunkt fuer freie Eintraege VOR dem ersten Anker.
 *
 * Ohne ihn waere `minuten` dort 0 — also „kurz nach Mitternacht" — und eine
 * freie Morgenaufgabe stuende vor allem anderen, auch vor einem Anker um 07:30,
 * falls es je einen gibt.
 */
export const TAGESBEGINN_MINUTEN = 8 * 60;

export function minutenVon(uhrzeit: string): number {
  const [h, m] = uhrzeit.split(":").map(Number);
  return h * 60 + m;
}

/** Montag bis Freitag der Woche, die mit `montag` beginnt. */
export function wochenTage(montag: string): string[] {
  const start = new Date(`${montag}T00:00:00Z`);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export interface TagesEintrag {
  art: "aufgabe" | "routine";
  id: string;
  titel: string;
  /** Die feste Uhrzeit, falls es eine gibt — sonst null (dann steht kein Anker in der Spur). */
  uhrzeit: string | null;
  /** Der Sortierwert. Bei freien Eintraegen der geerbte Ankerwert. */
  minuten: number;
  dauerMinuten: number;
  /** Nur bei `art: "aufgabe"` gesetzt — Routinen tragen keinen Zustand und keine Aktionen. */
  aufgabe: Aufgabe | null;
}

export function tagesEintraege(
  aufgaben: Aufgabe[],
  routinen: Routine[],
  person: Person,
  datum: string,
): TagesEintrag[] {
  const wochentag = wochentagVon(datum);

  const ausRoutinen: TagesEintrag[] =
    wochentag === null
      ? []
      : routinen
          .filter((r) => r.personId === person.id && routineAmTag(r, wochentag))
          .map((r) => ({
            art: "routine" as const,
            id: r.id,
            titel: r.titel,
            uhrzeit: r.uhrzeit,
            minuten: r.uhrzeit ? minutenVon(r.uhrzeit) : TAGESBEGINN_MINUTEN,
            dauerMinuten: r.dauerMinuten,
            aufgabe: null,
          }))
          .sort((a, b) => a.minuten - b.minuten);

  // Zuerst in der Reihenfolge, die der BuFDi gewaehlt hat — DANN den Anker
  // erben. Umgekehrt waere „der vorangehende Anker" nicht definiert.
  let anker = TAGESBEGINN_MINUTEN;
  const ausAufgaben: TagesEintrag[] = [...aufgaben]
    .filter((a) => a.zugewiesenAn === person.id && a.planDatum === datum)
    .sort((a, b) => a.planRang - b.planRang || a.id.localeCompare(b.id))
    .map((a) => {
      if (a.planUhrzeit) anker = minutenVon(a.planUhrzeit);
      return {
        art: "aufgabe" as const,
        id: a.id,
        titel: a.titel,
        uhrzeit: a.planUhrzeit,
        minuten: anker,
        dauerMinuten: a.dauerMinuten,
        aufgabe: a,
      };
    });

  /*
   * ROUTINEN ZUERST IM FELD, und das ist die Stelle, an der das Bild des
   * Entwurfs entsteht: `Array.prototype.sort` ist stabil, also entscheidet bei
   * GLEICHEM `minuten` die Feldreihenfolge. Eine Routine um 08:00 steht damit
   * vor der freien Aufgabe, die den Wert 480 von ihr geerbt hat — der Anker
   * kommt zuerst, sein Gefolge danach. Vertauscht man die beiden Felder,
   * rutscht die freie Aufgabe VOR ihren eigenen Anker.
   */
  return [...ausRoutinen, ...ausAufgaben].sort((a, b) => a.minuten - b.minuten);
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/tagesplan.test.ts`
Expected: PASS.

- [ ] **Step 5: Wochenplan-Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_ui/Wochenplan.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { demoDaten } from "../_lib/demoDaten";
import { Wochenplan } from "./Wochenplan";

const JETZT = new Date("2026-08-13T10:00:00Z");
const D = demoDaten(JETZT);
const LEA = D.personen.find((p) => p.id === "lea")!;
const MONTAG = "2026-08-10";

async function zeige() {
  await mount(
    <Wochenplan
      person={LEA}
      aufgaben={D.aufgaben}
      routinen={D.routinen}
      montag={MONTAG}
      heute="2026-08-13"
    />,
  );
}

describe("Wochenplan", () => {
  /*
   * DIE ZENTRALE ZUSICHERUNG: BEIDE Ausprägungen stehen im HTML, CSS blendet
   * eine aus. Das ist die einzige Form, die ohne JavaScript-Breakpoint
   * auskommt — und `Grid.useBreakpoint` ist in Server Components verboten und
   * zeigt beim ersten Render ausserdem die falsche Variante.
   *
   * WAS DIESER TEST NICHT KANN: pruefen, dass mobil tatsaechlich nur EINE
   * sichtbar ist. jsdom wertet Media Queries nicht aus, die Behauptung ginge
   * immer durch. Das gehoert Playwright (Aufgabe 13).
   */
  it("rendert Wochengitter UND Tagesliste ins HTML", async () => {
    await zeige();
    expect(query("[data-rolle='wochengitter']")).toBeTruthy();
    expect(query("[data-rolle='tagesliste']")).toBeTruthy();
    await unmount();
  });

  it("gibt dem Gitter fuenf Tagesspalten", async () => {
    await zeige();
    expect(queryAll("[data-rolle='wochengitter'] [data-tag]")).toHaveLength(5);
    await unmount();
  });

  it("beschriftet jeden Tag mit Wochentag und Datum, nie mit ISO", async () => {
    await zeige();
    const kopf = query("[data-rolle='wochengitter'] [data-tag='2026-08-10'] [data-rolle='tagkopf']");
    expect(kopf.textContent).toContain("Mo, 10.08.");
    expect(kopf.textContent).not.toContain("2026-08-10");
    await unmount();
  });

  it("zeigt je Tag ein Budget aus verplanten und Sollstunden", async () => {
    await zeige();
    /*
     * DIENSTAG bei Lea, nachgerechnet gegen die Demodaten: Routine „Post &
     * Tagesstart" (Mo–Fr, 45 Min.) + Routine „Telefon & Empfang" (Di/Do, 60
     * Min.) + „Getränkevorrat" (planDatum = Dienstag, 60 Min.) = 165 Min. =
     * 2,75 Std.
     *
     * MONTAG WAERE DER FALSCHE TAG: dort liegt keine Aufgabe von Lea, nur die
     * eine Routine — 0,75 Std. Der Test saehe dann nicht, ob Aufgaben
     * ueberhaupt mitgezaehlt werden.
     */
    const budget = query("[data-rolle='wochengitter'] [data-tag='2026-08-11'] [data-rolle='budget']");
    expect(budget.textContent).toContain("2,75");
    expect(budget.textContent).toContain("7,8");
    await unmount();
  });

  /*
   * Eine leere Spalte sieht aus wie ein Ladefehler. Der Leerzustand ist
   * deshalb ausgeschrieben, auch fuer einen einzelnen Tag.
   */
  it("schreibt fuer einen Tag ohne Eintraege einen Leerzustand", async () => {
    await mount(
      <Wochenplan person={LEA} aufgaben={[]} routinen={[]} montag={MONTAG} heute="2026-08-13" />,
    );
    const spalte = query("[data-rolle='wochengitter'] [data-tag='2026-08-11']");
    expect(spalte.textContent).toContain("Nichts geplant");
    await unmount();
  });

  it("markiert den heutigen Tag", async () => {
    await zeige();
    expect(queryAll("[data-rolle='wochengitter'] [data-heute='true']")).toHaveLength(1);
    expect(query("[data-rolle='wochengitter'] [data-heute='true']").getAttribute("data-tag"))
      .toBe("2026-08-13");
    await unmount();
  });

  it("zeigt die feste Uhrzeit als Anker und laesst die Spur bei freien Eintraegen leer", async () => {
    await zeige();
    // Mittwoch bei Lea: Aushang mit fester Uhrzeit 11:30
    const mi = query("[data-rolle='wochengitter'] [data-tag='2026-08-12']");
    expect(mi.textContent).toContain("11:30");
    await unmount();
  });

  it("unterscheidet Routinen sichtbar von Aufgaben", async () => {
    await zeige();
    // Dienstag, weil dort beide Sorten liegen — am Montag hat Lea nur Routinen.
    const di = query("[data-rolle='wochengitter'] [data-tag='2026-08-11']");
    expect(di.querySelector("[data-art='routine']")).toBeTruthy();
    expect(di.querySelector("[data-art='aufgabe']")).toBeTruthy();
    await unmount();
  });

  /*
   * Eine Routine traegt keinen Zustand und keine Aktion — sie ist ein
   * Zeitblock, keine Arbeit mit Lebenszyklus. Ein Statuschip an ihr waere die
   * naheliegende Verwechslung, und sie wuerde niemandem auffallen.
   */
  it("gibt Routinen keinen Statuschip und keinen Link", async () => {
    await zeige();
    const routine = query("[data-rolle='wochengitter'] [data-art='routine']");
    expect(routine.querySelector("[data-chip]")).toBeNull();
    expect(routine.querySelector("a")).toBeNull();
    await unmount();
  });

  it("verlinkt jede Aufgabe auf ihre Detailseite in aeusserer Pfadform", async () => {
    await zeige();
    const link = query("[data-rolle='wochengitter'] [data-art='aufgabe'] a");
    expect(link.getAttribute("href")).toMatch(/^\/a\/[a-z0-9]+$/);
    await unmount();
  });

  /*
   * Ein ueberbuchter Tag bekommt Kante PLUS Text, keinen roten Balken: Menge ist
   * keine Statusfarbe, und Bedeutung haengt nie allein an der Farbe.
   */
  it("schreibt bei Ueberbuchung das Wort aus", async () => {
    // Soll auf 60 Min. gedrueckt; Dienstag traegt 165 Min. und ist damit ueberbucht.
    const eng = { ...LEA, sollMinutenTag: 60 };
    await mount(
      <Wochenplan person={eng} aufgaben={D.aufgaben} routinen={D.routinen} montag={MONTAG} heute="2026-08-13" />,
    );
    expect(query("[data-rolle='wochengitter'] [data-tag='2026-08-11']").textContent)
      .toContain("überbucht");
    await unmount();
  });

  it("zeigt in der Tagesliste dieselben Tage wie im Gitter", async () => {
    await zeige();
    expect(queryAll("[data-rolle='tagesliste'] [data-tag]")).toHaveLength(5);
    await unmount();
  });
});
```

- [ ] **Step 6: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/Wochenplan.test.tsx`
Expected: FAIL — `Failed to resolve import "./Wochenplan"`.

- [ ] **Step 7: Wochenplan schreiben**

Create `src/app/m/aufgaben/_ui/Wochenplan.tsx`:

```tsx
import Link from "next/link";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { fmtDauer, fmtStunden, fmtTagKurz, tagesBudget } from "../_lib/anzeige";
import { tagesEintraege, wochenTage, type TagesEintrag } from "../_lib/tagesplan";
import type { Aufgabe, Person, Routine } from "../_lib/typen";
import { PrioritaetChip, StatusChip } from "./Chip";
import s from "./aufgaben.module.css";

/*
 * DER ZEITPLAN — das teuerste Bauteil des Moduls, und das einzige mit ZWEI
 * Ausprägungen.
 *
 * BEIDE STEHEN IM HTML, CSS BLENDET EINE AUS. Das ist keine Sparform, sondern
 * die einzige richtige: `Grid.useBreakpoint` ist in Server Components verboten
 * (Compound-Zugriff, Falle 1) UND zeigt beim ersten Render die falsche Variante,
 * weil der Server die Fensterbreite nicht kennt. Der Preis ist doppeltes
 * Markup; bei fuenf Spalten und einer Handvoll Eintraege je Tag ist das
 * billiger als eine Client-Grenze um den halben Bildschirm.
 *
 * KEIN "use client": der Plan zeigt nur. Verschieben und Einplanen sind
 * Bauabschnitt 3 und bekommen dann eigene Client-Inseln PRO ZEILE — nicht um
 * den ganzen Plan, sonst wandert die Wochenrechnung in den Browser.
 *
 * KEIN DRAG & DROP: Bauabschnitt 5. Die Knopfstrecke ist die Grundlage, auf der
 * es aufsetzt, und sie bleibt danach — mit der Tastatur ist Ziehen nicht
 * bedienbar und auf dem Handy nicht zuverlaessig.
 */

function Zeile({ eintrag }: { eintrag: TagesEintrag }) {
  const a = eintrag.aufgabe;
  return (
    <li
      data-art={eintrag.art}
      className={eintrag.art === "routine" ? s.routineZeile : undefined}
      style={{
        display: "flex",
        gap: SPACE.sm,
        padding: `${SPACE.sm}px 0`,
        borderBlockEnd: "1px solid var(--auf-linie)",
      }}
    >
      <span className={eintrag.uhrzeit ? s.ankerSpur : s.ohneAnker} aria-hidden={!eintrag.uhrzeit}>
        {eintrag.uhrzeit ?? "·"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {a ? (
          <Link href={`/a/${a.id}`} style={{ ...SCHRIFT.text, fontWeight: 600 }}>
            {eintrag.titel}
          </Link>
        ) : (
          <span style={{ ...SCHRIFT.text }}>{eintrag.titel}</span>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBlockStart: SPACE.xs }}>
          <span style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)" }}>
            {fmtDauer(eintrag.dauerMinuten)}
          </span>
          {a ? <StatusChip status={a.status} /> : null}
          {a ? <PrioritaetChip prioritaet={a.prioritaet} /> : null}
          {a === null ? (
            <span style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)" }}>Routine</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Tag({
  datum,
  eintraege,
  budget,
  istHeute,
}: {
  datum: string;
  eintraege: TagesEintrag[];
  budget: { verplantMinuten: number; sollMinuten: number; ueberbucht: boolean };
  istHeute: boolean;
}) {
  return (
    <div data-tag={datum} data-heute={istHeute} className={s.tagSpalte}>
      <div data-rolle="tagkopf" className={s.tagKopf}>
        <span style={SCHRIFT.kicker}>{fmtTagKurz(datum)}</span>
        <span
          data-rolle="budget"
          className={budget.ueberbucht ? `${s.budget} ${s.budgetUeberbucht}` : s.budget}
        >
          {/*
            Bei Ueberbuchung steht das WORT dabei. Eine Farbe allein waere die
            Bedeutung, und genau das ist untersagt.
          */}
          {fmtStunden(budget.verplantMinuten)} / {fmtStunden(budget.sollMinuten)} Std.
          {budget.ueberbucht ? " — überbucht" : ""}
        </span>
      </div>
      {eintraege.length === 0 ? (
        <p style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)", margin: 0 }}>Nichts geplant</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {eintraege.map((e) => (
            <Zeile key={`${e.art}-${e.id}`} eintrag={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function Wochenplan({
  person,
  aufgaben,
  routinen,
  montag,
  heute,
}: {
  person: Person;
  aufgaben: Aufgabe[];
  routinen: Routine[];
  montag: string;
  heute: string;
}) {
  // EINMAL rechnen, zweimal rendern. Die zweite Ausprägung ist eine andere
  // Darstellung derselben Daten, nicht eine zweite Abfrage — sonst laufen die
  // beiden Bilder auseinander, und zwar genau dann, wenn niemand hinsieht.
  const tage = wochenTage(montag).map((datum) => ({
    datum,
    eintraege: tagesEintraege(aufgaben, routinen, person, datum),
    budget: tagesBudget(aufgaben, routinen, person, datum),
    istHeute: datum === heute,
  }));

  return (
    <>
      <div data-rolle="wochengitter" className={s.wochenGitter}>
        {tage.map((t) => (
          <Tag key={t.datum} {...t} />
        ))}
      </div>

      <div data-rolle="tagesliste" className={s.tagesListe}>
        {tage.map((t) => (
          <div key={t.datum} style={{ marginBlockEnd: SPACE.lg }}>
            <Tag {...t} />
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 8: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/Wochenplan.test.tsx`
Expected: PASS. **Schlägt „gibt dem Gitter fuenf Tagesspalten" mit 10 statt 5 fehl**, greift der Selektor auch in die Tagesliste — dann `[data-rolle='wochengitter'] [data-tag]` prüfen, nicht `[data-tag]` allein.

- [ ] **Step 9: Aufgabenliste-Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_ui/AufgabenListe.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { demoDaten } from "../_lib/demoDaten";
import { AufgabenListe } from "./AufgabenListe";

const D = demoDaten(new Date("2026-08-13T10:00:00Z"));
const HEUTE = "2026-08-13";
const finde = (id: string) => D.aufgaben.find((a) => a.id === id)!;

describe("AufgabenListe", () => {
  it("rendert je Aufgabe eine Zeile mit Link auf die Detailseite", async () => {
    await mount(<AufgabenListe aufgaben={[finde("a3"), finde("a4")]} personen={D.personen} heute={HEUTE} />);
    expect(queryAll("[data-aufgabe]")).toHaveLength(2);
    expect(query("[data-aufgabe='a3'] a").getAttribute("href")).toBe("/a/a3");
    await unmount();
  });

  it("zeigt Zustand und Prioritaet als Text, nicht nur als Farbe", async () => {
    await mount(<AufgabenListe aufgaben={[finde("a8")]} personen={D.personen} heute={HEUTE} />);
    const zeile = query("[data-aufgabe='a8']");
    expect(zeile.textContent).toContain("Zurückgewiesen");
    expect(zeile.textContent).toContain("Mittel");
    await unmount();
  });

  /*
   * DER ABGELEITETE ZUSTAND, sichtbar gemacht: „Vorschlag: Do, 13.08. 09:00".
   * Ohne den Hinweis waere die Aufgabe von einer beliebigen verteilten nicht zu
   * unterscheiden, und der ganze Vorschlagsmechanismus unsichtbar.
   */
  it("nennt bei offenem Zeitvorschlag Tag und Uhrzeit", async () => {
    await mount(<AufgabenListe aufgaben={[finde("a3")]} personen={D.personen} heute={HEUTE} />);
    const zeile = query("[data-aufgabe='a3']");
    expect(zeile.textContent).toContain("Vorschlag");
    expect(zeile.textContent).toContain("09:00");
    await unmount();
  });

  it("nennt keinen Vorschlag, wo keiner offen ist", async () => {
    await mount(<AufgabenListe aufgaben={[finde("a4")]} personen={D.personen} heute={HEUTE} />);
    expect(query("[data-aufgabe='a4']").textContent).not.toContain("Vorschlag");
    await unmount();
  });

  it("markiert ueberfaellige Aufgaben mit Wort und Zeichen", async () => {
    await mount(<AufgabenListe aufgaben={[finde("a9")]} personen={D.personen} heute={HEUTE} />);
    const zeile = query("[data-aufgabe='a9']");
    expect(zeile.textContent).toContain("überfällig");
    expect(zeile.querySelector("[data-zeichen='warnung']")).toBeTruthy();
    await unmount();
  });

  it("zeigt den Empfaenger nur, wenn darum gebeten wird", async () => {
    await mount(<AufgabenListe aufgaben={[finde("a3")]} personen={D.personen} heute={HEUTE} />);
    expect(query("[data-aufgabe='a3']").textContent).not.toContain("Lea");
    await unmount();

    await mount(
      <AufgabenListe aufgaben={[finde("a3")]} personen={D.personen} heute={HEUTE} zeigeEmpfaenger />,
    );
    expect(query("[data-aufgabe='a3']").textContent).toContain("Lea");
    await unmount();
  });

  it("nennt bei unverteilten Aufgaben statt eines Namens den Zustand", async () => {
    await mount(
      <AufgabenListe aufgaben={[finde("a1")]} personen={D.personen} heute={HEUTE} zeigeEmpfaenger />,
    );
    expect(query("[data-aufgabe='a1']").textContent).toContain("Niemandem zugewiesen");
    await unmount();
  });

  /*
   * LEERZUSTAENDE SIND AUSGESCHRIEBEN, jeder mit einem eigenen Satz — und der
   * Aufrufer liefert ihn, weil „Posteingang leer" und „keine Freigabe offen"
   * nicht dasselbe sagen. Ein einziger Text fuer alle waere die naheliegende
   * Sparform und nimmt jeder Liste ihre Aussage.
   */
  it("zeigt den uebergebenen Leertext statt einer leeren Liste", async () => {
    await mount(
      <AufgabenListe aufgaben={[]} personen={D.personen} heute={HEUTE} leerText="Posteingang leer — alles verteilt." />,
    );
    expect(exists("[data-aufgabe]")).toBe(false);
    expect(query("[data-rolle='leer']").textContent).toBe("Posteingang leer — alles verteilt.");
    await unmount();
  });

  it("nennt Frist und Dauerschaetzung", async () => {
    await mount(<AufgabenListe aufgaben={[finde("a3")]} personen={D.personen} heute={HEUTE} />);
    const zeile = query("[data-aufgabe='a3']");
    expect(zeile.textContent).toContain("2 Std.");
    expect(zeile.textContent).toMatch(/Do, \d\d\.\d\d\./);
    await unmount();
  });

  it("nennt die Nachweispflicht samt verlangter Form", async () => {
    await mount(<AufgabenListe aufgaben={[finde("a3")]} personen={D.personen} heute={HEUTE} />);
    expect(query("[data-aufgabe='a3']").textContent).toContain("Nachweis: Bild");
    await unmount();
  });
});
```

- [ ] **Step 10: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/AufgabenListe.test.tsx`
Expected: FAIL — `Failed to resolve import "./AufgabenListe"`.

- [ ] **Step 11: Aufgabenliste schreiben**

Create `src/app/m/aufgaben/_ui/AufgabenListe.tsx`:

```tsx
import Link from "next/link";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { fmtDauer, fmtTagKurz, istUeberfaellig, vorschlagOffen } from "../_lib/anzeige";
import type { Aufgabe, Person } from "../_lib/typen";
import { Ikone } from "./ikonen";
import { PrioritaetChip, StatusChip } from "./Chip";
import s from "./aufgaben.module.css";

/*
 * DIE ZEILENLISTE, die auf sechs Seiten wiederkehrt. Eigenes Markup und keine
 * antd-`Table`: die Zeile ist zweizeilig (Titel plus Metazeile), und eine
 * Tabelle mit zwei Zeilen je Datensatz ist auf 390px unlesbar. `Table` bliebe
 * die richtige Wahl fuer den Posteingang der Koordination, wo Spalten wirklich
 * verglichen werden — die Seite entscheidet das, nicht dieser Baustein.
 *
 * WAS DIE LISTE ZEIGEN MUSS, DAMIT SIE BENUTZBAR IST (docs/design/README.md):
 * Zustand, Menge und Datum — nicht bloss einen Link. Deshalb tragen die Zeilen
 * Frist, Dauerschaetzung, Nachweispflicht und, wo er offen ist, den
 * Zeitvorschlag.
 *
 * `leerText` KOMMT VOM AUFRUFER. „Posteingang leer — alles verteilt" und „Keine
 * Freigabe offen" sagen nicht dasselbe; ein gemeinsamer Text waere die
 * naheliegende Sparform und nimmt jeder Liste ihre Aussage.
 */

const NACHWEIS_TEXT = { text: "Text", bild: "Bild" } as const;

export function AufgabenListe({
  aufgaben,
  personen,
  heute,
  leerText = "Keine Aufgaben.",
  zeigeEmpfaenger = false,
}: {
  aufgaben: Aufgabe[];
  personen: Person[];
  heute: string;
  leerText?: string;
  zeigeEmpfaenger?: boolean;
}) {
  if (aufgaben.length === 0) {
    return (
      <p data-rolle="leer" style={{ ...SCHRIFT.text, color: "var(--auf-stahl)", margin: 0 }}>
        {leerText}
      </p>
    );
  }

  const namen = new Map(personen.map((p) => [p.id, p.name]));

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {aufgaben.map((a) => {
        const ueberfaellig = istUeberfaellig(a, heute);
        return (
          <li
            key={a.id}
            data-aufgabe={a.id}
            style={{ padding: `${SPACE.md}px 0`, borderBlockEnd: "1px solid var(--auf-linie)" }}
          >
            <Link href={`/a/${a.id}`} style={{ ...SCHRIFT.text, fontWeight: 600 }}>
              {a.titel}
            </Link>

            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
                marginBlockStart: SPACE.xs,
              }}
            >
              <StatusChip status={a.status} />
              <PrioritaetChip prioritaet={a.prioritaet} />

              <span style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)" }}>
                Frist {fmtTagKurz(a.faelligAm)}
                {a.faelligUhrzeit ? ` ${a.faelligUhrzeit}` : ""} · {fmtDauer(a.dauerMinuten)}
              </span>

              {a.nachweisPflicht ? (
                <span style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)" }}>
                  <Ikone name={a.nachweisArt === "bild" ? "nachweis-bild" : "nachweis-text"} groesse={12} />{" "}
                  Nachweis: {NACHWEIS_TEXT[a.nachweisArt]}
                </span>
              ) : null}

              {/*
                Der ueberfaellige Fall traegt Zeichen UND Wort. Die Farbe ist die
                verzichtbare letzte Schicht — und sie ist die getrennte
                Ampel-Rot-Textfarbe, nicht Markenrot.
              */}
              {ueberfaellig ? (
                <span
                  style={{ ...SCHRIFT.neben, color: "var(--auf-achtung-text)", fontWeight: 600 }}
                >
                  <Ikone name="warnung" groesse={12} /> überfällig
                </span>
              ) : null}

              {vorschlagOffen(a) ? (
                <span style={{ ...SCHRIFT.neben, color: "var(--auf-ocker-text)", fontWeight: 600 }}>
                  Vorschlag: {fmtTagKurz(a.vorschlagDatum!)}
                  {a.vorschlagUhrzeit ? ` ${a.vorschlagUhrzeit}` : ""}
                </span>
              ) : null}

              {zeigeEmpfaenger ? (
                <span className={s.jts}>
                  {a.zugewiesenAn ? namen.get(a.zugewiesenAn) : "Niemandem zugewiesen"}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 12: Alle Tests und Gates**

```bash
rtk pnpm vitest run src/app/m/aufgaben && \
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
```
Expected: alle grün.

- [ ] **Step 13: Commit**

```bash
rtk git add src/app/m/aufgaben && \
rtk git commit -m "feat(aufgaben): Wochenplan und Aufgabenliste

Die Tagesordnung liegt in _lib/tagesplan.ts, getrennt von der Komponente:
sie ist die einzige Rechenlogik im teuersten Bauteil und bleibt so unter
Vitest pruefbar, ohne zu rendern.

Die zugesagte Bauform steckt in einer Regel — ein Eintrag mit Uhrzeit ist
ein ANKER, ein Eintrag ohne erbt dessen Uhrzeit und sortiert dahinter. So
sitzt eine freie Aufgabe ZWISCHEN zwei festen Bloecken statt am Tagesende
zu sammeln. Dass das Bild entsteht, haengt an der Stabilitaet von sort()
und an der Feldreihenfolge (Routinen zuerst) — beides im Kommentar
festgehalten und im Test belegt.

Wochengitter und Tagesliste stehen BEIDE im HTML, einmal gerechnet und
zweimal gerendert. Zwei Abfragen liefen auseinander, und zwar genau dann,
wenn niemand hinsieht."
```

---

## Task 9: Die BuFDi-Welt — „Meine Woche", fremde Pläne, Routinen

**Files:**
- Modify: `src/app/m/aufgaben/page.tsx` (Platzhalter aus Aufgabe 1 wird zum rollenabhängigen Verteiler)
- Create: `src/app/m/aufgaben/_ui/EinstiegBufdi.tsx`
- Create: `src/app/m/aufgaben/_ui/EinstiegBufdi.test.tsx`
- Create: `src/app/m/aufgaben/plan/[personId]/page.tsx`
- Create: `src/app/m/aufgaben/routinen/page.tsx`
- Create: `src/app/m/aufgaben/routinen/inhalt.test.tsx`

**Interfaces:**
- Consumes: alles aus Aufgaben 2–8
- Produces:
  - `_ui/EinstiegBufdi.tsx`: `EinstiegBufdi({ daten, person, jetzt })` — **reine Komponente**, `jetzt: Date` als Argument
  - `plan/[personId]/page.tsx`: exportiert zusätzlich `planInhalt(daten, betrachter, ziel, jetzt)` für Vitest
  - `routinen/page.tsx`: exportiert zusätzlich `routinenInhalt(daten: DemoDaten, person: Person, heute: string)` — **drei** Argumente; `heute` entscheidet über `istAktiv` und damit über die Anlege-Aktion

- [ ] **Step 1: Test für den BuFDi-Einstieg schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_ui/EinstiegBufdi.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { demoDaten } from "../_lib/demoDaten";
import { EinstiegBufdi } from "./EinstiegBufdi";

const JETZT = new Date("2026-08-13T10:00:00Z");
const D = demoDaten(JETZT);
const LEA = D.personen.find((p) => p.id === "lea")!;

const zeige = (person = LEA) => mount(<EinstiegBufdi daten={D} person={person} jetzt={JETZT} />);

describe("EinstiegBufdi", () => {
  it("traegt den Titel „Meine Woche" und eine Kontextzeile", async () => {
    await zeige();
    expect(query("h1").textContent).toBe("Meine Woche");
    expect(query("[data-rolle='kontext']").textContent).toMatch(/Std\./);
    await unmount();
  });

  it("zeigt vier KPI-Kacheln", async () => {
    await zeige();
    expect(queryAll("[data-rolle='kachelzahl']")).toHaveLength(4);
    await unmount();
  });

  /*
   * DIE KACHEL MIT `0` BLEIBT STEHEN UND WIRD NICHT VERLINKT. Sie zu verbergen
   * waere schlechter: „keine offene Freigabe" ist eine Information, und eine
   * Kachelreihe, die ihre Laenge aendert, laesst sich nicht wiedererkennen.
   */
  it("verlinkt keine Kachel auf die Seite, auf der sie steht", async () => {
    await zeige();
    /*
     * Die beiden vorderen Kacheln („einzuplanen", „heute offen") tragen
     * absichtlich GAR KEINEN Link: ihr Ziel waere die gefilterte Liste, und die
     * gibt es in Bauabschnitt 1 nicht. Die hinteren zwei zeigen ins Archiv, und
     * zwar nur, wenn sie einen Wert ueber null tragen.
     */
    const kacheln = queryAll("[data-rolle='kachelzahl']");
    const ziele = kacheln.map((k) => k.closest("a")?.getAttribute("href") ?? null);
    expect(ziele.slice(0, 2)).toEqual([null, null]);
    for (const [i, ziel] of ziele.entries()) {
      if (ziel !== null) expect(ziel, `Kachel ${i}`).not.toBe("/");
    }
    await unmount();
  });

  it("verlinkt die hinteren Kacheln nur mit einem Wert ueber null", async () => {
    await zeige();
    const kacheln = queryAll("[data-rolle='kachelzahl']").slice(2);
    for (const k of kacheln) {
      const inLink = k.closest("a") !== null;
      expect(inLink, `Kachel ${k.textContent}`).toBe(k.textContent !== "0");
    }
    await unmount();
  });

  /*
   * DER POSTEINGANG DES BUFDI: verteilt, aber noch in keinem Tag. Genau hier
   * wird der Zeitvorschlag angenommen — ohne diesen Streifen ist der ganze
   * Vorschlagsmechanismus unsichtbar, und die Aufgabe liegt in keiner Liste,
   * die der BuFDi ansieht.
   */
  it("fuehrt verteilte, aber ungeplante Aufgaben im Posteingang", async () => {
    await zeige();
    const eingang = query("[data-rolle='posteingang']");
    expect(eingang.querySelector("[data-aufgabe='a3']")).toBeTruthy();
    // a5 ist in Arbeit und eingeplant, gehoert also nicht in den Posteingang
    expect(eingang.querySelector("[data-aufgabe='a5']")).toBeNull();
    await unmount();
  });

  it("nennt im Posteingang den Zeitvorschlag samt Annahme-Aktion", async () => {
    await zeige();
    const zeile = query("[data-rolle='posteingang'] [data-aufgabe='a3']");
    expect(zeile.textContent).toContain("Vorschlag");
    expect(query("[data-rolle='posteingang']").textContent).toContain("Annehmen");
    await unmount();
  });

  it("rendert den Wochenplan", async () => {
    await zeige();
    expect(query("[data-rolle='wochengitter']")).toBeTruthy();
    expect(query("[data-rolle='tagesliste']")).toBeTruthy();
    await unmount();
  });

  /*
   * BUFDIS SEHEN SICH GEGENSEITIG LESEND (getroffene Entscheidung), und der Weg
   * dorthin muss in der Oberflaeche existieren: eine Berechtigung ohne
   * Einstiegspunkt ist kein Feature.
   */
  it("verlinkt die Plaene der anderen aktiven BuFDis, nicht den eigenen", async () => {
    await zeige();
    const links = queryAll("[data-rolle='fremdplaene'] a").map((a) => a.getAttribute("href"));
    expect(links).toContain("/plan/noah");
    expect(links).not.toContain("/plan/lea");
    await unmount();
  });

  /*
   * Und die Gegenprobe zur ausgeschiedenen Person: Mika ist seit letzter Woche
   * inaktiv und verschwindet aus der Plan-Navigation. Ihre Geschichte bleibt
   * ueber `/archiv` und die Detailseiten erreichbar.
   */
  it("verlinkt keine ausgeschiedene Person", async () => {
    await zeige();
    const links = queryAll("[data-rolle='fremdplaene'] a").map((a) => a.getAttribute("href"));
    expect(links).not.toContain("/plan/mika");
    await unmount();
  });

  it("verlinkt die Routinenverwaltung", async () => {
    await zeige();
    expect(queryAll("a").map((a) => a.getAttribute("href"))).toContain("/routinen");
    await unmount();
  });

  /*
   * KEIN WEG DORTHIN, WO DIE PERSON NICHT HINDARF: ein BuFDi bekommt keinen
   * Verteil- und keinen Freigabeeinstieg. Mehrere Riegel der Suite werfen
   * absichtlich 404 statt 403, und ein Knopf davor hebt genau das auf.
   */
  it("zeigt keinen Weg zur Verteilung und keinen zur Freigabe", async () => {
    await zeige();
    const links = queryAll("a").map((a) => a.getAttribute("href"));
    expect(links).not.toContain("/verteilen");
    expect(links).not.toContain("/freigaben");
    expect(links).not.toContain("/personen");
    await unmount();
  });

  it("schreibt fuer einen leeren Posteingang einen eigenen Satz", async () => {
    const ohne = { ...D, aufgaben: D.aufgaben.filter((a) => a.zugewiesenAn !== "lea") };
    await mount(<EinstiegBufdi daten={ohne} person={LEA} jetzt={JETZT} />);
    expect(query("[data-rolle='posteingang'] [data-rolle='leer']").textContent)
      .toContain("Nichts einzuplanen");
    await unmount();
  });

  /*
   * Eine ausgeschiedene Person darf lesen, aber nichts bewegen — die
   * Annahme-Aktion verschwindet, der Plan bleibt.
   */
  it("nimmt einer ausgeschiedenen Person die Aktionen, nicht die Ansicht", async () => {
    const mika = D.personen.find((p) => p.id === "mika")!;
    await mount(<EinstiegBufdi daten={D} person={mika} jetzt={JETZT} />);
    expect(query("[data-rolle='wochengitter']")).toBeTruthy();
    expect(exists("[data-rolle='posteingang'] button")).toBe(false);
    await unmount();
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/EinstiegBufdi.test.tsx`
Expected: FAIL — `Failed to resolve import "./EinstiegBufdi"`.

- [ ] **Step 3: BuFDi-Einstieg schreiben**

Create `src/app/m/aufgaben/_ui/EinstiegBufdi.tsx`:

```tsx
import { Button, Card, Col, Row } from "antd";
import Link from "next/link";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { fmtStunden, istUeberfaellig, tagesBudget, vorschlagOffen } from "../_lib/anzeige";
import { isoTag, montagDerWoche } from "../_lib/demoDaten";
import { wochenTage } from "../_lib/tagesplan";
import type { DemoDaten, Person } from "../_lib/typen";
import { istAktiv } from "../_lib/zugang";
import { AufgabenListe } from "./AufgabenListe";
import { Kachel } from "./Kachel";
import { SeitenKopf } from "./SeitenKopf";
import { Wochenplan } from "./Wochenplan";
import s from "./aufgaben.module.css";

/*
 * „MEINE WOCHE" — der Einstieg eines BuFDi. Er antwortet auf „was muss ich
 * jetzt tun?", nicht auf „was gibt es alles?".
 *
 * REINE KOMPONENTE MIT `jetzt` ALS ARGUMENT. Die Seite darueber ist duenn und
 * ruft `new Date()`; hier kommt die Zeit herein, damit der Inhalt unter Vitest
 * pruefbar ist. Dasselbe Muster wie `verwaltungInhalt(db, jetzt)` im Lagerbuch.
 *
 * KEIN WEG ZUR VERTEILUNG, KEINER ZUR FREIGABE. Nicht weil es „unuebersichtlich"
 * waere, sondern weil mehrere Riegel der Suite absichtlich 404 statt 403 werfen:
 * ein Knopf davor verraet die Existenz der Seite und ist fuer alle anderen eine
 * Sackgasse.
 */
export function EinstiegBufdi({
  daten,
  person,
  jetzt,
}: {
  daten: DemoDaten;
  person: Person;
  jetzt: Date;
}) {
  const heute = isoTag(jetzt);
  const montag = isoTag(montagDerWoche(jetzt));
  const aktiv = istAktiv(person, heute);
  const meine = daten.aufgaben.filter((a) => a.zugewiesenAn === person.id);

  const einzuplanen = meine.filter((a) => a.status === "verteilt" && a.planDatum === null);
  const heuteOffen = meine.filter(
    (a) => a.planDatum === heute && a.status !== "abgeschlossen",
  );
  const freigabeOffen = meine.filter((a) => a.status === "freigabe_offen");
  const zurueckgewiesen = meine.filter((a) => a.status === "zurueckgewiesen");
  const ueberfaellig = meine.filter((a) => istUeberfaellig(a, heute));

  const wochenMinuten = wochenTage(montag).reduce(
    (summe, tag) => summe + tagesBudget(daten.aufgaben, daten.routinen, person, tag).verplantMinuten,
    0,
  );

  const andere = daten.personen.filter(
    (p) => p.rolle === "bufdi" && p.id !== person.id && istAktiv(p, heute),
  );

  return (
    <>
      <SeitenKopf
        titel="Meine Woche"
        kontext={`${meine.length} Aufgaben · ${fmtStunden(wochenMinuten)} von ${fmtStunden(person.sollMinutenTag * 5)} Std. verplant${ueberfaellig.length > 0 ? ` · ${ueberfaellig.length} überfällig` : ""}`}
      />

      {/*
        Kacheln mit 0 bleiben stehen und werden nicht verlinkt — siehe Kachel.tsx.
        UND: „einzuplanen" und „heute offen" tragen GAR KEINEN Link. Ihr Ziel
        waere die gefilterte Liste, und die gibt es in Bauabschnitt 1 nicht; ein
        `href="/"` verwiese auf die Seite, auf der die Kachel steht — eine Kachel,
        die nirgendwohin fuehrt, liest sich als kaputt. Der Posteingang steht
        24px darunter und ist der Weg.
      */}
      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={24} md={6}>
          <Kachel zahl={einzuplanen.length} beschriftung="einzuplanen"
            kante={einzuplanen.length ? "ocker" : undefined} />
        </Col>
        <Col xs={24} md={6}>
          <Kachel zahl={heuteOffen.length} beschriftung="heute offen" />
        </Col>
        <Col xs={24} md={6}>
          <Kachel zahl={freigabeOffen.length} beschriftung="warten auf Freigabe"
            href={freigabeOffen.length ? "/archiv" : undefined} />
        </Col>
        <Col xs={24} md={6}>
          <Kachel zahl={zurueckgewiesen.length} beschriftung="zurückgewiesen"
            kante={zurueckgewiesen.length ? "achtung" : undefined}
            href={zurueckgewiesen.length ? "/archiv" : undefined} />
        </Col>
      </Row>

      <Card
        title={<span style={SCHRIFT.kicker}>Posteingang — noch nicht eingeplant</span>}
        style={{ marginBlockEnd: SPACE.xl }}
      >
        <div data-rolle="posteingang">
          <AufgabenListe
            aufgaben={einzuplanen}
            personen={daten.personen}
            heute={heute}
            leerText="Nichts einzuplanen — die Woche steht."
          />
          {aktiv && einzuplanen.length > 0 ? (
            <div className={s.knopfzeile} style={{ marginBlockStart: SPACE.md }}>
              {/*
                Knoepfe ohne Wirkung — Bauabschnitt 3 verdrahtet sie mit den
                Server-Actions. Sie stehen HIER schon, weil eine Action ohne
                Aufrufer kein Feature ist und der Klickdummy genau diese Frage
                beantworten soll: gibt es einen Weg dorthin?
              */}
              <Button type="primary" disabled>
                {einzuplanen.some(vorschlagOffen) ? "Vorschlag annehmen" : "Einplanen"}
              </Button>
              <Button disabled>Anders einplanen</Button>
            </div>
          ) : null}
        </div>
      </Card>

      <div style={{ marginBlockEnd: SPACE.xl }}>
        <Wochenplan
          person={person}
          aufgaben={daten.aufgaben}
          routinen={daten.routinen}
          montag={montag}
          heute={heute}
        />
      </div>

      <div data-rolle="fremdplaene" style={{ display: "flex", gap: SPACE.lg, flexWrap: "wrap" }}>
        <Link href="/routinen" style={SCHRIFT.text}>
          Routinen verwalten
        </Link>
        {andere.map((p) => (
          <Link key={p.id} href={`/plan/${p.id}`} style={SCHRIFT.text}>
            Zeitplan von {p.name}
          </Link>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Verteiler-Seite schreiben**

Replace `src/app/m/aufgaben/page.tsx`:

```tsx
import { demoDaten } from "./_lib/demoDaten";
import { aktuelleDemoPerson } from "./_lib/demoRolle";
import { EinstiegBufdi } from "./_ui/EinstiegBufdi";

/*
 * DER EINSTIEG IST ROLLENABHAENGIG, nicht ein Dashboard fuer alle mit
 * ausgegrauten Teilen. Drei Rollen, drei Arbeitsfragen.
 *
 * Die Fassungen fuer `koordination` und `auftrag` kommen in Aufgaben 10 und 11;
 * bis dahin sehen sie die BuFDi-Fassung. Das ist Absicht und nicht Nachlaessigkeit:
 * so ist jede Zwischenstufe des Plans abrufbar, statt 500 zu antworten.
 *
 * `dynamic = "force-dynamic"`, weil `aktuelleDemoPerson` ein Cookie liest. Ohne
 * das versucht Next, die Seite statisch zu erzeugen, und der Rollenwechsel
 * wirkte erst nach einem harten Neuladen — genau die Art stiller Fehler, die
 * einen Klickdummy unglaubwuerdig macht.
 */
export const dynamic = "force-dynamic";

export default async function AufgabenPage() {
  const jetzt = new Date();
  const person = await aktuelleDemoPerson(jetzt);
  return <EinstiegBufdi daten={demoDaten(jetzt)} person={person} jetzt={jetzt} />;
}
```

- [ ] **Step 5: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/EinstiegBufdi.test.tsx`
Expected: PASS.

- [ ] **Step 6: Fremden Zeitplan und Routinen schreiben**

Create `src/app/m/aufgaben/plan/[personId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { demoDaten, isoTag, montagDerWoche } from "../../_lib/demoDaten";
import { aktuelleDemoPerson } from "../../_lib/demoRolle";
import type { DemoDaten, Person } from "../../_lib/typen";
import { darfPlanAendern, darfPlanSehen } from "../../_lib/zugang";
import { SeitenKopf } from "../../_ui/SeitenKopf";
import { Wochenplan } from "../../_ui/Wochenplan";

export const dynamic = "force-dynamic";

/*
 * DER ZEITPLAN EINER PERSON — eigener oder fremder, dieselbe Seite.
 *
 * `notFound()` UND NICHT 403, wenn die Person nicht existiert: mehrere Riegel
 * der Suite verschweigen die Existenz absichtlich, und eine abweichende Antwort
 * hier waere ein Orakel („diese ID gibt es, du darfst nur nicht").
 *
 * DIE ZUGEHOERIGKEIT KOMMT AUS DEN DATEN, NICHT AUS DEM URL-PARAMETER. `personId`
 * wird gesucht, nicht geglaubt — sonst ist `/plan/beliebig` ein IDOR.
 */
export function planInhalt(daten: DemoDaten, betrachter: Person, ziel: Person, jetzt: Date) {
  const heute = isoTag(jetzt);
  const eigener = betrachter.id === ziel.id;
  const aenderbar = darfPlanAendern(betrachter, ziel.id, heute);

  return (
    <>
      <SeitenKopf
        titel={eigener ? "Mein Zeitplan" : `Zeitplan von ${ziel.name}`}
        kontext={
          aenderbar
            ? "Du kannst diesen Plan ändern."
            : "Nur lesbar — jeder BuFDi gestaltet seinen Plan selbst."
        }
        zurueck={{ href: "/", text: "Übersicht" }}
      />
      <Wochenplan
        person={ziel}
        aufgaben={daten.aufgaben}
        routinen={daten.routinen}
        montag={isoTag(montagDerWoche(jetzt))}
        heute={heute}
      />
    </>
  );
}

export default async function PlanSeite({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const jetzt = new Date();
  const daten = demoDaten(jetzt);
  const betrachter = await aktuelleDemoPerson(jetzt);

  const ziel = daten.personen.find((p) => p.id === personId);
  if (!ziel || !darfPlanSehen(betrachter, personId)) notFound();

  return planInhalt(daten, betrachter, ziel, jetzt);
}
```

Create `src/app/m/aufgaben/routinen/page.tsx`:

```tsx
import { Button, Card, Table } from "antd";
import { notFound } from "next/navigation";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { fmtDauer } from "../_lib/anzeige";
import { demoDaten, isoTag } from "../_lib/demoDaten";
import { aktuelleDemoPerson } from "../_lib/demoRolle";
import type { DemoDaten, Person } from "../_lib/typen";
import { istAktiv } from "../_lib/zugang";
import { SeitenKopf } from "../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

const TAGE = ["Mo", "Di", "Mi", "Do", "Fr"] as const;

/*
 * ROUTINEN — die Zeitbloecke, mit denen ein BuFDi sich Zeit fuer wiederkehrende
 * Arbeiten freihaelt. Genau das ist Anforderung 3.
 *
 * `Table` ist in Server Components sicher; `Table.Summary` waere ein
 * Compound-Zugriff und ist es nicht. Die Spaltenkoepfe bekommen ihre Typo-Rolle
 * ueber `columns[].title` — NIE ueber eine CSS-Regel gegen `.ant-table-thead th`,
 * die eine Spezifitaetserhoehung UND eine Kopplung an einen antd-internen
 * Klassennamen kostete.
 *
 * `scroll={{ x: "max-content" }}`: die Spalten tragen keine `width`, also ist
 * „max-content" die einzige ehrliche Angabe — jede Pixelzahl waere erfunden.
 * Und KEIN `ellipsis`, KEIN `fixed`, KEIN `scroll.y`: jedes davon schaltet
 * rc-table auf `table-layout: fixed` und aendert das Desktop-Bild, ohne dass
 * irgendwo etwas ueberlaeuft.
 */
export function routinenInhalt(daten: DemoDaten, person: Person, heute: string) {
  const meine = daten.routinen.filter((r) => r.personId === person.id);
  const aktiv = istAktiv(person, heute);

  return (
    <>
      <SeitenKopf
        titel="Meine Routinen"
        kontext="Wiederkehrende Zeitblöcke. Sie belegen Budget im Wochenplan, erzeugen aber keine Aufgaben und brauchen keine Freigabe."
        zurueck={{ href: "/", text: "Meine Woche" }}
        aktionen={aktiv ? <Button type="primary" disabled>Routine anlegen</Button> : null}
      />

      <Card>
        <Table
          rowKey="id"
          dataSource={meine}
          pagination={false}
          locale={{ emptyText: "Noch keine Routinen angelegt." }}
          scroll={{ x: "max-content" }}
          columns={[
            { title: <span style={SCHRIFT.kicker}>Titel</span>, dataIndex: "titel" },
            {
              title: <span style={SCHRIFT.kicker}>Tage</span>,
              dataIndex: "wochentage",
              render: (tage: number[]) => tage.map((t) => TAGE[t]).join(" · "),
            },
            {
              title: <span style={SCHRIFT.kicker}>Uhrzeit</span>,
              dataIndex: "uhrzeit",
              render: (u: string | null) => u ?? "ohne feste Zeit",
            },
            {
              title: <span style={SCHRIFT.kicker}>Dauer</span>,
              dataIndex: "dauerMinuten",
              render: (m: number) => fmtDauer(m),
            },
            {
              title: <span style={SCHRIFT.kicker}>Zustand</span>,
              dataIndex: "aktiv",
              // Text, nicht nur Farbe — und kein rotes Tag fuer „ruht".
              render: (a: boolean) => (a ? "aktiv" : "ruht"),
            },
            {
              title: <span style={SCHRIFT.kicker}>Aktion</span>,
              key: "aktion",
              // size="small" IST hier richtig: eine 56px-Zeilenaktion sprengt die Zeile.
              render: () => (aktiv ? <Button size="small" disabled>Ändern</Button> : null),
            },
          ]}
        />
      </Card>

      <p style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)", marginBlockStart: SPACE.md }}>
        Wer eine Routine dokumentieren will, legt dafür eine eigene Aufgabe an.
      </p>
    </>
  );
}

export default async function RoutinenSeite() {
  const jetzt = new Date();
  const person = await aktuelleDemoPerson(jetzt);
  // Routinen gehoeren einem BuFDi. Fuer die anderen Rollen gibt es die Seite
  // nicht — und `navFuer` zeigt sie ihnen auch nicht, dasselbe Praedikat.
  if (person.rolle !== "bufdi") notFound();
  return routinenInhalt(demoDaten(jetzt), person, isoTag(jetzt));
}
```

- [ ] **Step 7: Test für die Routinen-Seite schreiben**

Create `src/app/m/aufgaben/routinen/inhalt.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { demoDaten } from "../_lib/demoDaten";
import { routinenInhalt } from "./page";

const JETZT = new Date("2026-08-13T10:00:00Z");
const D = demoDaten(JETZT);
const HEUTE = "2026-08-13";
const NOAH = D.personen.find((p) => p.id === "noah")!;
const MIKA = D.personen.find((p) => p.id === "mika")!;

describe("routinenInhalt", () => {
  it("zeigt nur die eigenen Routinen", async () => {
    await mount(routinenInhalt(D, NOAH, HEUTE));
    const text = query("table").textContent ?? "";
    expect(text).toContain("Fahrzeug-Kurzcheck");
    expect(text).not.toContain("Post & Tagesstart"); // Leas Routine
    await unmount();
  });

  it("schreibt Wochentage als Kuerzel, nicht als Zahlen", async () => {
    await mount(routinenInhalt(D, NOAH, HEUTE));
    expect(query("table").textContent).toContain("Mo · Mi · Fr");
    await unmount();
  });

  it("nennt eine Routine ohne feste Zeit ausdruecklich so", async () => {
    await mount(routinenInhalt(D, NOAH, HEUTE));
    expect(query("table").textContent).toContain("ohne feste Zeit");
    await unmount();
  });

  it("unterscheidet aktiv und ruht als Text", async () => {
    await mount(routinenInhalt(D, NOAH, HEUTE));
    const text = query("table").textContent ?? "";
    expect(text).toContain("aktiv");
    expect(text).toContain("ruht");
    await unmount();
  });

  it("fuehrt zurueck", async () => {
    await mount(routinenInhalt(D, NOAH, HEUTE));
    expect(query("nav[aria-label='Brotkrume'] a").getAttribute("href")).toBe("/");
    await unmount();
  });

  it("schreibt einen Leerzustand mit Anlegeweg statt einer leeren Tabelle", async () => {
    const ohne = { ...D, routinen: [] };
    await mount(routinenInhalt(ohne, NOAH, HEUTE));
    expect(query("table").textContent).toContain("Noch keine Routinen angelegt.");
    await unmount();
  });

  it("nimmt einer ausgeschiedenen Person den Anlegeknopf", async () => {
    await mount(routinenInhalt(D, MIKA, HEUTE));
    expect(query("h1").textContent).toBe("Meine Routinen");
    expect(query("table")).toBeTruthy();
    expect(document.querySelector("button")).toBeNull();
    await unmount();
  });
});
```

- [ ] **Step 8: Tests und Gates**

```bash
rtk pnpm vitest run src/app/m/aufgaben && \
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm build
```
Expected: alle grün. Dann der echte Abruf der drei Routen:
```bash
rtk pnpm exec playwright test e2e/aufgaben.spec.ts
```

- [ ] **Step 9: Commit**

```bash
rtk git add src/app/m/aufgaben && \
rtk git commit -m "feat(aufgaben): BuFDi-Einstieg, fremde Zeitplaene, Routinen

Der Einstieg antwortet auf „was muss ich jetzt tun?\", nicht auf „was gibt
es alles?\" — und er zeigt KEINEN Weg zur Verteilung, Freigabe oder
Personenverwaltung. Nicht aus Uebersichtlichkeit: mehrere Riegel der Suite
werfen absichtlich 404 statt 403, und ein Knopf davor verraet die Existenz
der Seite und ist fuer alle anderen eine Sackgasse.

Die Seiten sind duenn, die Inhalte reine Funktionen mit \`jetzt\` als
Argument — dasselbe Muster wie verwaltungInhalt(db, jetzt) im Lagerbuch,
und die Bedingung dafuer, dass sie unter Vitest pruefbar sind.

/plan/[personId] sucht die Person in den Daten statt dem URL-Parameter zu
glauben, und antwortet mit notFound() statt 403 — eine abweichende Antwort
waere ein Orakel."
```

---

## Task 10: Die Koordinations-Welt — Verteilung, Auslastung, Personen

**Files:**
- Create: `src/app/m/aufgaben/_ui/EinstiegKoordination.tsx`
- Create: `src/app/m/aufgaben/_ui/EinstiegKoordination.test.tsx`
- Create: `src/app/m/aufgaben/verteilen/page.tsx`
- Create: `src/app/m/aufgaben/personen/page.tsx`
- Modify: `src/app/m/aufgaben/page.tsx` (Rolle `koordination` verteilen)

**Interfaces:**
- Produces: `EinstiegKoordination({ daten, person, jetzt })`; `verteilenInhalt(daten, person, jetzt)`; `personenInhalt(daten, heute)` — **zwei** Argumente; die Seite prüft die Befugnis selbst und der Inhalt braucht den Aufrufer nicht

- [ ] **Step 1: Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_ui/EinstiegKoordination.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { demoDaten } from "../_lib/demoDaten";
import { EinstiegKoordination } from "./EinstiegKoordination";

const JETZT = new Date("2026-08-13T10:00:00Z");
const D = demoDaten(JETZT);
const SARAH = D.personen.find((p) => p.id === "sarah")!;

const zeige = () => mount(<EinstiegKoordination daten={D} person={SARAH} jetzt={JETZT} />);

describe("EinstiegKoordination", () => {
  it("traegt den Titel „Verteilung" und vier Kacheln", async () => {
    await zeige();
    expect(query("h1").textContent).toBe("Verteilung");
    expect(queryAll("[data-rolle='kachelzahl']")).toHaveLength(4);
    await unmount();
  });

  it("fuehrt im Posteingang genau die unverteilten Aufgaben", async () => {
    await zeige();
    const eingang = query("[data-rolle='posteingang']");
    expect(eingang.querySelector("[data-aufgabe='a1']")).toBeTruthy();
    expect(eingang.querySelector("[data-aufgabe='a2']")).toBeTruthy();
    expect(eingang.querySelector("[data-aufgabe='a3']")).toBeNull(); // schon verteilt
    await unmount();
  });

  it("nennt je Posteingangszeile den Auftraggeber", async () => {
    await zeige();
    const text = query("[data-rolle='posteingang']").textContent ?? "";
    expect(text).toContain("Jönne");
    expect(text).toContain("Schulle");
    await unmount();
  });

  it("bietet je Posteingangszeile eine Verteil-Aktion", async () => {
    await zeige();
    expect(query("[data-rolle='posteingang']").textContent).toContain("Verteilen");
    await unmount();
  });

  /*
   * DER VERTEILEN-DIALOG BRAUCHT DIE AUSLASTUNG DANEBEN, sonst laeuft der
   * Zeitvorschlag ins Leere: Sarah SCHLAEGT einen Tag vor, und sie kann das nur
   * sinnvoll, wenn sie sieht, wo noch Luft ist.
   */
  it("zeigt die Wochenauslastung aller aktiven BuFDis", async () => {
    await zeige();
    const auslastung = query("[data-rolle='auslastung']");
    expect(auslastung.textContent).toContain("Lea");
    expect(auslastung.textContent).toContain("Noah");
    expect(auslastung.textContent).toMatch(/Std\./);
    await unmount();
  });

  it("laesst ausgeschiedene Personen aus der Auslastung weg", async () => {
    await zeige();
    expect(query("[data-rolle='auslastung']").textContent).not.toContain("Mika");
    await unmount();
  });

  /*
   * „MEINE" UND „IN VERTRETUNG" SICHTBAR GETRENNT. Zusammengeworfen waere die
   * Liste zwar kuerzer, aber Sarah wuesste nicht mehr, welche Freigabe ihr
   * gehoert und welche sie jemandem abnimmt — und genau das soll der Verlauf
   * spaeter belegen koennen.
   */
  it("trennt eigene Freigaben von Vertretungsfreigaben", async () => {
    await zeige();
    // a7: Pruefer ist Sarah selbst. a6: Pruefer ist Schulle.
    expect(query("[data-rolle='freigaben-eigene']").querySelector("[data-aufgabe='a7']")).toBeTruthy();
    expect(query("[data-rolle='freigaben-vertretung']").querySelector("[data-aufgabe='a6']")).toBeTruthy();
    await unmount();
  });

  it("zaehlt ueberfaellige Aufgaben in einer Kachel mit Kante", async () => {
    await zeige();
    const text = document.body.textContent ?? "";
    expect(text).toContain("überfällig");
    await unmount();
  });

  it("verlinkt Personenverwaltung und Archiv", async () => {
    await zeige();
    const links = queryAll("a").map((a) => a.getAttribute("href"));
    expect(links).toContain("/personen");
    expect(links).toContain("/archiv");
    await unmount();
  });

  it("schreibt fuer einen leeren Posteingang einen eigenen Satz", async () => {
    const ohne = { ...D, aufgaben: D.aufgaben.filter((a) => a.status !== "eingegangen") };
    await mount(<EinstiegKoordination daten={ohne} person={SARAH} jetzt={JETZT} />);
    expect(query("[data-rolle='posteingang'] [data-rolle='leer']").textContent)
      .toContain("Posteingang leer");
    await unmount();
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/EinstiegKoordination.test.tsx`
Expected: FAIL — `Failed to resolve import "./EinstiegKoordination"`.

- [ ] **Step 3: Koordinations-Einstieg schreiben**

Create `src/app/m/aufgaben/_ui/EinstiegKoordination.tsx`:

```tsx
import { Button, Card, Col, Row } from "antd";
import Link from "next/link";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { fmtStunden, istUeberfaellig, tagesBudget } from "../_lib/anzeige";
import { isoTag, montagDerWoche } from "../_lib/demoDaten";
import { wochenTage } from "../_lib/tagesplan";
import type { DemoDaten, Person } from "../_lib/typen";
import { darfFreigeben, istAktiv, istVertretungsfreigabe } from "../_lib/zugang";
import { AufgabenListe } from "./AufgabenListe";
import { Kachel } from "./Kachel";
import { SeitenKopf } from "./SeitenKopf";
import s from "./aufgaben.module.css";

/*
 * „VERTEILUNG" — der Einstieg der Koordination. Der Ort, an dem die eingehenden
 * Auftraege zusammenlaufen; genau das fehlte bisher.
 *
 * DIE AUSLASTUNG STEHT NEBEN DEM POSTEINGANG, nicht auf einer eigenen Seite:
 * der Zeitvorschlag ist nur sinnvoll, wenn beim Verteilen sichtbar ist, wo noch
 * Luft ist. Zwei Seiten hiessen zwei Blicke und einen Vorschlag ins Leere.
 */
export function EinstiegKoordination({
  daten,
  person,
  jetzt,
}: {
  daten: DemoDaten;
  person: Person;
  jetzt: Date;
}) {
  const heute = isoTag(jetzt);
  const montag = isoTag(montagDerWoche(jetzt));
  const tage = wochenTage(montag);

  const zuVerteilen = daten.aufgaben.filter((a) => a.status === "eingegangen");
  const wartenAufFreigabe = daten.aufgaben.filter(
    (a) => a.status === "freigabe_offen" && darfFreigeben(person, a, heute),
  );
  const eigene = wartenAufFreigabe.filter((a) => !istVertretungsfreigabe(person, a));
  const vertretung = wartenAufFreigabe.filter((a) => istVertretungsfreigabe(person, a));
  const ueberfaellig = daten.aufgaben.filter((a) => istUeberfaellig(a, heute));
  const zurueckgewiesen = daten.aufgaben.filter((a) => a.status === "zurueckgewiesen");

  const bufdis = daten.personen.filter((p) => p.rolle === "bufdi" && istAktiv(p, heute));

  return (
    <>
      <SeitenKopf
        titel="Verteilung"
        kontext={`${zuVerteilen.length} zu verteilen · ${wartenAufFreigabe.length} warten auf Freigabe · ${bufdis.length} BuFDis im Dienst`}
        aktionen={<Button type="primary" href="/neu">Aufgabe einstellen</Button>}
      />

      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={24} md={6}>
          <Kachel zahl={zuVerteilen.length} beschriftung="zu verteilen"
            kante={zuVerteilen.length ? "ocker" : undefined}
            href={zuVerteilen.length ? "/verteilen" : undefined} />
        </Col>
        <Col xs={24} md={6}>
          <Kachel zahl={wartenAufFreigabe.length} beschriftung="warten auf Freigabe"
            kante={wartenAufFreigabe.length ? "ocker" : undefined}
            href={wartenAufFreigabe.length ? "/freigaben" : undefined} />
        </Col>
        <Col xs={24} md={6}>
          <Kachel zahl={ueberfaellig.length} beschriftung="überfällig"
            kante={ueberfaellig.length ? "achtung" : undefined}
            href={ueberfaellig.length ? "/archiv" : undefined} />
        </Col>
        <Col xs={24} md={6}>
          <Kachel zahl={zurueckgewiesen.length} beschriftung="zurückgewiesen"
            kante={zurueckgewiesen.length ? "achtung" : undefined}
            href={zurueckgewiesen.length ? "/archiv" : undefined} />
        </Col>
      </Row>

      <Row gutter={[SPACE.xl, SPACE.xl]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={24} md={14}>
          <Card title={<span style={SCHRIFT.kicker}>Posteingang</span>}>
            <div data-rolle="posteingang">
              <AufgabenListe
                aufgaben={zuVerteilen}
                personen={daten.personen}
                heute={heute}
                zeigeEmpfaenger
                leerText="Posteingang leer — alles verteilt."
              />
              {zuVerteilen.length > 0 ? (
                <div className={s.knopfzeile} style={{ marginBlockStart: SPACE.md }}>
                  <Button type="primary" href="/verteilen">Verteilen</Button>
                </div>
              ) : null}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={10}>
          <Card title={<span style={SCHRIFT.kicker}>Auslastung dieser Woche</span>}>
            <ul data-rolle="auslastung" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {bufdis.map((p) => {
                const minuten = tage.reduce(
                  (summe, tag) =>
                    summe + tagesBudget(daten.aufgaben, daten.routinen, p, tag).verplantMinuten,
                  0,
                );
                const soll = p.sollMinutenTag * 5;
                return (
                  <li
                    key={p.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: SPACE.sm,
                      padding: `${SPACE.sm}px 0`,
                      borderBlockEnd: "1px solid var(--auf-linie)",
                    }}
                  >
                    <Link href={`/plan/${p.id}`} style={{ ...SCHRIFT.text, fontWeight: 600 }}>
                      {p.name}
                    </Link>
                    {/*
                      Neutral, nicht farbig: Menge ist keine Statusfarbe. Bei
                      Ueberbuchung traegt der Text das Wort — kein roter Balken.
                    */}
                    <span className={minuten > soll ? `${s.budget} ${s.budgetUeberbucht}` : s.budget}>
                      {fmtStunden(minuten)} / {fmtStunden(soll)} Std.
                      {minuten > soll ? " — überbucht" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Col>
      </Row>

      <Row gutter={[SPACE.xl, SPACE.xl]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={24} md={12}>
          <Card title={<span style={SCHRIFT.kicker}>Meine Freigaben</span>}>
            <div data-rolle="freigaben-eigene">
              <AufgabenListe aufgaben={eigene} personen={daten.personen} heute={heute}
                zeigeEmpfaenger leerText="Keine eigene Freigabe offen." />
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<span style={SCHRIFT.kicker}>In Vertretung</span>}>
            <div data-rolle="freigaben-vertretung">
              <AufgabenListe aufgaben={vertretung} personen={daten.personen} heute={heute}
                zeigeEmpfaenger leerText="Nichts liegen geblieben." />
            </div>
          </Card>
        </Col>
      </Row>

      <div style={{ display: "flex", gap: SPACE.lg, flexWrap: "wrap" }}>
        <Link href="/personen" style={SCHRIFT.text}>Personen verwalten</Link>
        <Link href="/archiv" style={SCHRIFT.text}>Archiv und Überfälligkeitsliste</Link>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Verteiler-Seite erweitern**

In `src/app/m/aufgaben/page.tsx` den Import und die Rückgabe ergänzen:

```tsx
import { demoDaten } from "./_lib/demoDaten";
import { aktuelleDemoPerson } from "./_lib/demoRolle";
import { EinstiegBufdi } from "./_ui/EinstiegBufdi";
import { EinstiegKoordination } from "./_ui/EinstiegKoordination";

export const dynamic = "force-dynamic";

export default async function AufgabenPage() {
  const jetzt = new Date();
  const person = await aktuelleDemoPerson(jetzt);
  const daten = demoDaten(jetzt);

  if (person.rolle === "koordination") {
    return <EinstiegKoordination daten={daten} person={person} jetzt={jetzt} />;
  }
  return <EinstiegBufdi daten={daten} person={person} jetzt={jetzt} />;
}
```

- [ ] **Step 5: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/EinstiegKoordination.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verteil- und Personenseite schreiben**

Create `src/app/m/aufgaben/verteilen/page.tsx`:

```tsx
import { Button, Card, Table } from "antd";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { fmtDauer, fmtStunden, fmtTagKurz, tagesBudget } from "../_lib/anzeige";
import { demoDaten, isoTag, montagDerWoche } from "../_lib/demoDaten";
import { aktuelleDemoPerson } from "../_lib/demoRolle";
import { wochenTage } from "../_lib/tagesplan";
import type { DemoDaten, Person } from "../_lib/typen";
import { darfVerteilen, istAktiv } from "../_lib/zugang";
import { PrioritaetChip } from "../_ui/Chip";
import { SeitenKopf } from "../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

/*
 * DER POSTEINGANG ALS TABELLE — hier ist `Table` richtig und die Zeilenliste
 * nicht: Sarah VERGLEICHT die Zeilen (Prioritaet gegen Frist gegen Dauer), und
 * genau dafuer sind Spalten da.
 *
 * DIESE SEITE IST DER ORT, DEN SCHULLE UND JOENNE NICHT SEHEN. `navFuer` zeigt
 * sie ihnen nicht, und `darfVerteilen` riegelt sie ab — dasselbe Praedikat auf
 * denselben Betrachter. `notFound()` und nicht 403, damit die Existenz nicht
 * verraten wird.
 */
export function verteilenInhalt(daten: DemoDaten, person: Person, jetzt: Date) {
  const heute = isoTag(jetzt);
  const tage = wochenTage(isoTag(montagDerWoche(jetzt)));
  const zuVerteilen = daten.aufgaben.filter((a) => a.status === "eingegangen");
  const namen = new Map(daten.personen.map((p) => [p.id, p.name]));
  const bufdis = daten.personen.filter((p) => p.rolle === "bufdi" && istAktiv(p, heute));

  return (
    <>
      <SeitenKopf
        titel="Posteingang verteilen"
        kontext="Wähle eine Person und schlage optional Tag und Uhrzeit vor. Den Zeitpunkt setzt der BuFDi selbst — der Vorschlag ist ein Hinweis, keine Zuweisung."
        zurueck={{ href: "/", text: "Verteilung" }}
      />

      <Card style={{ marginBlockEnd: SPACE.xl }}>
        <Table
          rowKey="id"
          dataSource={zuVerteilen}
          pagination={false}
          locale={{ emptyText: "Posteingang leer — alles verteilt." }}
          scroll={{ x: "max-content" }}
          columns={[
            {
              title: <span style={SCHRIFT.kicker}>Aufgabe</span>,
              dataIndex: "titel",
              render: (titel: string, a) => <Link href={`/a/${a.id}`}>{titel}</Link>,
            },
            {
              title: <span style={SCHRIFT.kicker}>Auftraggeber</span>,
              dataIndex: "erstellerId",
              render: (id: string) => namen.get(id) ?? id,
            },
            {
              title: <span style={SCHRIFT.kicker}>Priorität</span>,
              dataIndex: "prioritaet",
              render: (p) => <PrioritaetChip prioritaet={p} />,
            },
            {
              title: <span style={SCHRIFT.kicker}>Frist</span>,
              dataIndex: "faelligAm",
              render: (d: string) => fmtTagKurz(d),
            },
            {
              title: <span style={SCHRIFT.kicker}>Dauer</span>,
              dataIndex: "dauerMinuten",
              render: (m: number) => fmtDauer(m),
            },
            {
              title: <span style={SCHRIFT.kicker}>Nachweis</span>,
              key: "nachweis",
              render: (_, a) => (a.nachweisPflicht ? (a.nachweisArt === "bild" ? "Bild" : "Text") : "—"),
            },
            {
              title: <span style={SCHRIFT.kicker}>Aktion</span>,
              key: "aktion",
              render: () => <Button size="small" type="primary" disabled>Verteilen</Button>,
            },
          ]}
        />
      </Card>

      <Card title={<span style={SCHRIFT.kicker}>Auslastung dieser Woche</span>}>
        <ul data-rolle="auslastung" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {bufdis.map((p) => {
            const minuten = tage.reduce(
              (summe, tag) => summe + tagesBudget(daten.aufgaben, daten.routinen, p, tag).verplantMinuten,
              0,
            );
            return (
              <li key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: `${SPACE.sm}px 0` }}>
                <Link href={`/plan/${p.id}`} style={{ ...SCHRIFT.text, fontWeight: 600 }}>{p.name}</Link>
                <span style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)" }}>
                  {fmtStunden(minuten)} / {fmtStunden(p.sollMinutenTag * 5)} Std.
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

export default async function VerteilenSeite() {
  const jetzt = new Date();
  const person = await aktuelleDemoPerson(jetzt);
  if (!darfVerteilen(person, isoTag(jetzt))) notFound();
  return verteilenInhalt(demoDaten(jetzt), person, jetzt);
}
```

Create `src/app/m/aufgaben/personen/page.tsx`:

```tsx
import { Button, Card, Table } from "antd";
import { notFound } from "next/navigation";
import { SCHRIFT } from "@/core/theme/schrift";
import { fmtStunden, fmtTagKurz } from "../_lib/anzeige";
import { demoDaten, isoTag } from "../_lib/demoDaten";
import { aktuelleDemoPerson } from "../_lib/demoRolle";
import type { DemoDaten, Rolle } from "../_lib/typen";
import { darfPersonenVerwalten, istAktiv } from "../_lib/zugang";
import { Chip } from "../_ui/Chip";
import { SeitenKopf } from "../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

const ROLLENTEXT: Record<Rolle, string> = {
  koordination: "Koordination",
  auftrag: "Auftraggeber & Freigabe",
  bufdi: "BuFDi",
};

/*
 * DIE PERSONENVERWALTUNG — der Grund, warum die Rolle in der Datenbank liegt und
 * nicht in Pocket-ID-Gruppen: BuFDis rotieren jaehrlich, und diese Seite kann
 * Sarah selbst bedienen, ohne Pocket-ID-Zugang.
 *
 * `aktivBis` STATT LOESCHEN. Eine ausgeschiedene Person verschwindet aus
 * Verteillisten und Plan-Navigation; ihre Aufgaben, Nachweise und
 * Verlaufszeilen bleiben lesbar. Ohne das Feld waere der Jahreswechsel eine
 * Loeschaktion — und die Dokumentation des vergangenen Jahres ist genau das,
 * was das Modul herstellen soll.
 */
export function personenInhalt(daten: DemoDaten, heute: string) {
  return (
    <>
      <SeitenKopf
        titel="Personen"
        kontext="Rolle und Dienstzeit. Eine ausgeschiedene Person behält lesenden Zugang zur eigenen Geschichte, kann aber nichts mehr bewegen."
        zurueck={{ href: "/", text: "Verteilung" }}
        aktionen={<Button type="primary" disabled>Person aufnehmen</Button>}
      />

      <Card>
        <Table
          rowKey="id"
          dataSource={daten.personen}
          pagination={false}
          scroll={{ x: "max-content" }}
          columns={[
            { title: <span style={SCHRIFT.kicker}>Name</span>, dataIndex: "name" },
            {
              title: <span style={SCHRIFT.kicker}>Rolle</span>,
              dataIndex: "rolle",
              render: (r: Rolle) => ROLLENTEXT[r],
            },
            {
              title: <span style={SCHRIFT.kicker}>Soll je Tag</span>,
              dataIndex: "sollMinutenTag",
              render: (m: number) => `${fmtStunden(m)} Std.`,
            },
            {
              title: <span style={SCHRIFT.kicker}>Dienstzeit</span>,
              key: "dienstzeit",
              render: (_, p) => (p.aktivBis ? `bis ${fmtTagKurz(p.aktivBis)}` : "unbefristet"),
            },
            {
              title: <span style={SCHRIFT.kicker}>Zustand</span>,
              key: "zustand",
              // Text plus Ton, nie Farbe allein — und „ausgeschieden" ist kein
              // Fehler, also grau und nicht achtung.
              render: (_, p) =>
                istAktiv(p, heute) ? (
                  <Chip ton="ok">im Dienst</Chip>
                ) : (
                  <Chip ton="grau">ausgeschieden</Chip>
                ),
            },
            {
              title: <span style={SCHRIFT.kicker}>Aktion</span>,
              key: "aktion",
              render: () => <Button size="small" disabled>Ändern</Button>,
            },
          ]}
        />
      </Card>
    </>
  );
}

export default async function PersonenSeite() {
  const jetzt = new Date();
  const heute = isoTag(jetzt);
  const person = await aktuelleDemoPerson(jetzt);
  if (!darfPersonenVerwalten(person, heute)) notFound();
  return personenInhalt(demoDaten(jetzt), heute);
}
```

- [ ] **Step 7: Tests, Gates und echter Abruf**

```bash
rtk pnpm vitest run src/app/m/aufgaben && \
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm build && \
rtk pnpm exec playwright test e2e/aufgaben.spec.ts
```
Expected: alle grün.

- [ ] **Step 8: Commit**

```bash
rtk git add src/app/m/aufgaben && \
rtk git commit -m "feat(aufgaben): Koordinations-Einstieg, Verteilung, Personen

Die Auslastung steht NEBEN dem Posteingang, nicht auf einer eigenen Seite:
der Zeitvorschlag ist nur sinnvoll, wenn beim Verteilen sichtbar ist, wo
noch Luft ist. Zwei Seiten hiessen zwei Blicke und einen Vorschlag ins
Leere.

Eigene Freigaben und Vertretungsfreigaben sind sichtbar getrennt.
Zusammengeworfen waere die Liste kuerzer, aber niemand wuesste mehr,
welche Freigabe wem gehoert — und genau das soll der Verlauf belegen.

Der Posteingang ist hier eine Table und keine Zeilenliste, weil die Zeilen
VERGLICHEN werden. \`scroll={{ x: \"max-content\" }}\` ohne \`ellipsis\`,
\`fixed\` oder \`scroll.y\`: jedes davon schaltet rc-table auf table-layout:
fixed und aendert das Desktop-Bild, ohne dass etwas ueberlaeuft."
```

---

## Task 11: Die Auftraggeber-Welt — Aufträge, Einstellen, Freigeben

**Files:**
- Create: `src/app/m/aufgaben/_ui/EinstiegAuftrag.tsx`
- Create: `src/app/m/aufgaben/_ui/EinstiegAuftrag.test.tsx`
- Create: `src/app/m/aufgaben/_ui/AufgabeFormular.tsx` (Client-Insel)
- Create: `src/app/m/aufgaben/neu/page.tsx`
- Create: `src/app/m/aufgaben/freigaben/page.tsx`
- Create: `src/app/m/aufgaben/freigaben/inhalt.test.tsx`
- Modify: `src/app/m/aufgaben/page.tsx` (Rolle `auftrag` verteilen)

**Interfaces:**
- Produces: `EinstiegAuftrag({ daten, person, jetzt })`; `AufgabeFormular({ personen, darfZuweisen })` — **`"use client"`**, weil `Form.Item` und `Input.TextArea` Compound-Zugriffe sind; `freigabenInhalt(daten, person, jetzt)`

- [ ] **Step 1: Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_ui/EinstiegAuftrag.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { demoDaten } from "../_lib/demoDaten";
import { EinstiegAuftrag } from "./EinstiegAuftrag";

const JETZT = new Date("2026-08-13T10:00:00Z");
const D = demoDaten(JETZT);
const SCHULLE = D.personen.find((p) => p.id === "schulle")!;
const JOENNE = D.personen.find((p) => p.id === "joenne")!;

const zeige = (p = SCHULLE) => mount(<EinstiegAuftrag daten={D} person={p} jetzt={JETZT} />);

describe("EinstiegAuftrag", () => {
  it("traegt den Titel „Meine Auftraege" und den Einstell-Knopf zuoberst", async () => {
    await zeige();
    expect(query("h1").textContent).toBe("Meine Aufträge");
    const knopf = queryAll("a").find((a) => a.getAttribute("href") === "/neu");
    expect(knopf?.textContent).toContain("Aufgabe einstellen");
    await unmount();
  });

  /*
   * DIE ANTWORT AUF „JOENNE UND SCHULLE PFUSCHEN IMMER WIEDER REIN", dritte und
   * letzte Haelfte: kein Weg zur Verteilung in der Oberflaeche. Zusammen mit
   * `navFuer` (Aufgabe 7) und `darfVerteilen` (Aufgabe 4) ist das dasselbe
   * Praedikat an drei Stellen aus EINER Quelle.
   */
  it("zeigt keinen Weg zur Verteilung und keinen zur Personenverwaltung", async () => {
    await zeige();
    const links = queryAll("a").map((a) => a.getAttribute("href"));
    expect(links).not.toContain("/verteilen");
    expect(links).not.toContain("/personen");
    await unmount();
  });

  it("fuehrt nur die eigenen Auftraege", async () => {
    await zeige();
    const liste = query("[data-rolle='meine-auftraege']");
    // a3, a6, a8 sind von Schulle; a1 und a12 von Jönne
    expect(liste.querySelector("[data-aufgabe='a3']")).toBeTruthy();
    expect(liste.querySelector("[data-aufgabe='a1']")).toBeNull();
    await unmount();
  });

  it("nennt je Auftrag den Empfaenger", async () => {
    await zeige();
    expect(query("[data-rolle='meine-auftraege']").textContent).toContain("Lea");
    await unmount();
  });

  it("fuehrt nur die eigenen offenen Freigaben", async () => {
    await zeige();
    const w = query("[data-rolle='freigaben']");
    expect(w.querySelector("[data-aufgabe='a6']")).toBeTruthy(); // Pruefer Schulle
    expect(w.querySelector("[data-aufgabe='a7']")).toBeNull();   // Pruefer Sarah
    await unmount();
  });

  it("zeigt Joenne seine eigene, andere Auswahl", async () => {
    await zeige(JOENNE);
    const liste = query("[data-rolle='meine-auftraege']");
    expect(liste.querySelector("[data-aufgabe='a1']")).toBeTruthy();
    expect(liste.querySelector("[data-aufgabe='a3']")).toBeNull();
    await unmount();
  });

  it("schreibt fuer eine leere Freigabe-Warteschlange einen eigenen Satz", async () => {
    await zeige(JOENNE); // Jönne hat keine offene Freigabe in den Demodaten
    expect(query("[data-rolle='freigaben'] [data-rolle='leer']").textContent)
      .toContain("Keine Freigabe offen");
    await unmount();
  });

  it("zeigt drei KPI-Kacheln", async () => {
    await zeige();
    expect(queryAll("[data-rolle='kachelzahl']")).toHaveLength(3);
    await unmount();
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/EinstiegAuftrag.test.tsx`
Expected: FAIL — `Failed to resolve import "./EinstiegAuftrag"`.

- [ ] **Step 3: Auftraggeber-Einstieg schreiben**

Create `src/app/m/aufgaben/_ui/EinstiegAuftrag.tsx`:

```tsx
import { Button, Card, Col, Row } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { istUeberfaellig } from "../_lib/anzeige";
import { isoTag } from "../_lib/demoDaten";
import type { DemoDaten, Person } from "../_lib/typen";
import { darfFreigeben } from "../_lib/zugang";
import { AufgabenListe } from "./AufgabenListe";
import { Kachel } from "./Kachel";
import { SeitenKopf } from "./SeitenKopf";

/*
 * „MEINE AUFTRAEGE" — der Einstieg von Schulle und Joenne. Oben steht der Knopf,
 * der der Grund fuer das ganze Modul ist.
 *
 * KEIN WEG ZUR VERTEILUNG. Das ist die Antwort auf „Joenne und Schulle pfuschen
 * immer wieder rein": der Weg existiert in ihrer Oberflaeche nicht, `navFuer`
 * zeigt ihn nicht, und `/verteilen` antwortet ihnen mit 404. Drei Stellen, EINE
 * Quelle — zwei liefen auseinander.
 */
export function EinstiegAuftrag({
  daten,
  person,
  jetzt,
}: {
  daten: DemoDaten;
  person: Person;
  jetzt: Date;
}) {
  const heute = isoTag(jetzt);
  const meine = daten.aufgaben.filter((a) => a.erstellerId === person.id && !a.istSelbst);
  const offen = meine.filter((a) => a.status !== "abgeschlossen");
  const freigaben = daten.aufgaben.filter(
    (a) => a.status === "freigabe_offen" && darfFreigeben(person, a, heute),
  );
  const ueberfaellig = meine.filter((a) => istUeberfaellig(a, heute));

  return (
    <>
      <SeitenKopf
        titel="Meine Aufträge"
        kontext={`${offen.length} offen · ${freigaben.length} warten auf deine Freigabe${ueberfaellig.length ? ` · ${ueberfaellig.length} überfällig` : ""}`}
        aktionen={<Button type="primary" href="/neu">Aufgabe einstellen</Button>}
      />

      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={24} md={8}>
          <Kachel zahl={freigaben.length} beschriftung="warten auf deine Freigabe"
            kante={freigaben.length ? "ocker" : undefined}
            href={freigaben.length ? "/freigaben" : undefined} />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={offen.length} beschriftung="Aufträge in Arbeit" />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={ueberfaellig.length} beschriftung="überfällig"
            kante={ueberfaellig.length ? "achtung" : undefined} />
        </Col>
      </Row>

      <Card
        title={<span style={SCHRIFT.kicker}>Warten auf deine Freigabe</span>}
        style={{ marginBlockEnd: SPACE.xl }}
      >
        <div data-rolle="freigaben">
          <AufgabenListe aufgaben={freigaben} personen={daten.personen} heute={heute}
            zeigeEmpfaenger leerText="Keine Freigabe offen." />
        </div>
      </Card>

      <Card title={<span style={SCHRIFT.kicker}>Meine Aufträge</span>}>
        <div data-rolle="meine-auftraege">
          <AufgabenListe aufgaben={meine} personen={daten.personen} heute={heute}
            zeigeEmpfaenger
            leerText="Du hast noch keine Aufgabe eingestellt. Der Knopf oben rechts ist der Anfang." />
        </div>
      </Card>
    </>
  );
}
```

- [ ] **Step 4: Verteiler-Seite vollständig machen**

Replace `src/app/m/aufgaben/page.tsx`:

```tsx
import { demoDaten } from "./_lib/demoDaten";
import { aktuelleDemoPerson } from "./_lib/demoRolle";
import { EinstiegAuftrag } from "./_ui/EinstiegAuftrag";
import { EinstiegBufdi } from "./_ui/EinstiegBufdi";
import { EinstiegKoordination } from "./_ui/EinstiegKoordination";

/*
 * DER EINSTIEG IST ROLLENABHAENGIG, nicht ein Dashboard fuer alle mit
 * ausgegrauten Teilen. Drei Rollen, drei Arbeitsfragen — und jede Fassung
 * antwortet auf „was muss ich jetzt tun?", nicht auf „was gibt es alles?".
 *
 * `force-dynamic`, weil `aktuelleDemoPerson` ein Cookie liest. Ohne das
 * versucht Next, die Seite statisch zu erzeugen, und der Rollenwechsel wirkte
 * erst nach einem harten Neuladen — genau die Art stiller Fehler, die einen
 * Klickdummy unglaubwuerdig macht.
 */
export const dynamic = "force-dynamic";

export default async function AufgabenPage() {
  const jetzt = new Date();
  const person = await aktuelleDemoPerson(jetzt);
  const daten = demoDaten(jetzt);

  if (person.rolle === "koordination") {
    return <EinstiegKoordination daten={daten} person={person} jetzt={jetzt} />;
  }
  if (person.rolle === "auftrag") {
    return <EinstiegAuftrag daten={daten} person={person} jetzt={jetzt} />;
  }
  return <EinstiegBufdi daten={daten} person={person} jetzt={jetzt} />;
}
```

- [ ] **Step 5: Test laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_ui/EinstiegAuftrag.test.tsx`
Expected: PASS.

- [ ] **Step 6: Einstell-Formular als Client-Insel schreiben**

Create `src/app/m/aufgaben/_ui/AufgabeFormular.tsx`:

```tsx
"use client";

import { Button, Card, DatePicker, Form, Input, Radio, Select, Switch, TimePicker } from "antd";
import { useState } from "react";
import { SCHRIFT } from "@/core/theme/schrift";
import { TAP_ROW } from "@/core/theme/tokens";
import type { Person } from "../_lib/typen";
import s from "./aufgaben.module.css";

/*
 * CLIENT-INSEL, UND ZWAR ZWINGEND: `Form.Item` und `Input.TextArea` sind
 * Compound-Zugriffe auf antd und ergeben in einer Server Component HTTP 500
 * (Falle 1). Es gibt hier keine Wahl zwischen RSC und Client — nur zwischen
 * dieser Insel und einem selbstgebauten Formular ohne antd.
 *
 * `Radio.Group` mit `optionType="default"` ist eine ECHTE Radiogruppe: ein
 * Tabstop fuer die Gruppe, Pfeiltasten waehlen nativ. Eine Knopfreihe waere
 * drei Tabstops und keine Pfeilnavigation — und sie sieht fast gleich aus,
 * weshalb der Fehler nie auffaellt. `TAP_ROW` vergroessert die Trefferflaeche
 * auf die ganze ZEILE aus Marke und Beschriftung; `controlHeight` allein reicht
 * dafuer nicht, weil `Radio` seine Marke nicht daraus ableitet.
 *
 * KEIN `size` irgendwo: der Suite-Standard ist 56px und schon das richtige
 * Touchmass, `size="large"` waere 72.
 *
 * NUR DER ABSENDEKNOPF IST GESPERRT, NICHT DAS FORMULAR. `disabled` am `<Form>`
 * waere der naheliegende Griff und er ruiniert den Klickdummy: antd setzt damit
 * `DisabledContext`, und der propagiert auf JEDES Bedienelement darin — beide
 * Radiogruppen, beide Waehler, den Schalter. Damit waere der `useState` unten
 * toter Code, der bedingte Block „Form des Nachweises" koennte nie erscheinen,
 * und genau der Mechanismus, um dessentwillen das Modul existiert (Anforderung
 * 4), waere nicht vorfuehrbar. Dazu rendert die ganze Seite in antds
 * Grau-auf-Grau und liest sich als kaputt, nicht als Entwurf.
 *
 * Bauabschnitt 2 verdrahtet das Formular mit einer Server-Action und
 * `useActionState`, damit Fehler AM FELD ankommen und nicht auf einer
 * technischen Fehlerseite mit Datenverlust. Bis dahin traegt der eine Knopf die
 * Aussage „tut noch nichts" — ein Knopf, der nichts tut und das nicht sagt,
 * ist schlechter als ein sichtbar gesperrter.
 */
export function AufgabeFormular({
  personen,
  darfZuweisen,
}: {
  personen: Person[];
  darfZuweisen: boolean;
}) {
  const [nachweisPflicht, setNachweisPflicht] = useState(true);
  const bufdis = personen.filter((p) => p.rolle === "bufdi" && p.aktivBis === null);

  return (
    <Card>
      <Form layout="vertical">
        <Form.Item label={<span style={SCHRIFT.kicker}>Titel</span>} required>
          <Input placeholder="Kurz und konkret — „Materiallager inventarisieren“" />
        </Form.Item>

        <Form.Item
          label={<span style={SCHRIFT.kicker}>Erklärung</span>}
          extra="Was genau ist zu tun, und woran erkennt man, dass es fertig ist?"
          required
        >
          <Input.TextArea rows={4} />
        </Form.Item>

        <Form.Item label={<span style={SCHRIFT.kicker}>Priorität</span>} required>
          <Radio.Group>
            <Radio style={TAP_ROW} value="hoch">Hoch</Radio>
            <Radio style={TAP_ROW} value="mittel">Mittel</Radio>
            <Radio style={TAP_ROW} value="niedrig">Niedrig</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item label={<span style={SCHRIFT.kicker}>Frist</span>} required>
          <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item label={<span style={SCHRIFT.kicker}>Uhrzeit der Frist</span>} extra="Optional.">
          <TimePicker format="HH:mm" minuteStep={15} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item
          label={<span style={SCHRIFT.kicker}>Geschätzte Dauer</span>}
          extra="In Minuten. Sie belegt Budget im Zeitplan des BuFDi."
          required
        >
          <Input type="number" min={15} step={15} suffix="Min." />
        </Form.Item>

        <Form.Item label={<span style={SCHRIFT.kicker}>Nachweis verlangen</span>}>
          <Switch checked={nachweisPflicht} onChange={setNachweisPflicht} />
        </Form.Item>

        {nachweisPflicht ? (
          <Form.Item
            label={<span style={SCHRIFT.kicker}>Form des Nachweises</span>}
            extra="Untergrenze, keine Beschränkung — Text erlaubt zusätzlich ein Bild."
          >
            <Radio.Group>
              <Radio style={TAP_ROW} value="text">Schriftlich</Radio>
              <Radio style={TAP_ROW} value="bild">Bild</Radio>
            </Radio.Group>
          </Form.Item>
        ) : null}

        {darfZuweisen ? (
          <Form.Item
            label={<span style={SCHRIFT.kicker}>Direkt zuweisen</span>}
            extra="Leer lassen, dann landet die Aufgabe im Posteingang der Koordination."
          >
            <Select
              allowClear
              placeholder="Niemandem — in den Posteingang"
              options={bufdis.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
        ) : null}

        <div className={s.knopfzeile}>
          {/* Nur DIESER Knopf ist gesperrt — siehe Kopfkommentar. */}
          <Button type="primary" htmlType="submit" disabled>
            Einstellen
          </Button>
          <Button href="/">Abbrechen</Button>
        </div>
      </Form>
    </Card>
  );
}
```

Create `src/app/m/aufgaben/neu/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { demoDaten, isoTag } from "../_lib/demoDaten";
import { aktuelleDemoPerson } from "../_lib/demoRolle";
import { darfEinstellenFuerAndere, istAktiv } from "../_lib/zugang";
import { AufgabeFormular } from "../_ui/AufgabeFormular";
import { SeitenKopf } from "../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

/*
 * EINSTELLEN darf jede AKTIVE Person — Auftraggeber und Koordination fuer
 * andere, BuFDis fuer sich selbst. Der Unterschied steckt in `darfZuweisen`,
 * nicht in zwei Seiten: ein zweites Formular waere eine Abschrift, die beim
 * ersten Feldzuwachs auseinanderlaeuft.
 */
export default async function NeuSeite() {
  const jetzt = new Date();
  const heute = isoTag(jetzt);
  const person = await aktuelleDemoPerson(jetzt);
  if (!istAktiv(person, heute)) notFound();

  const fuerAndere = darfEinstellenFuerAndere(person, heute);

  return (
    <>
      <SeitenKopf
        titel={fuerAndere ? "Aufgabe einstellen" : "Eigene Aufgabe anlegen"}
        kontext={
          fuerAndere
            ? "Die Aufgabe geht in den Posteingang der Koordination, sofern du sie nicht direkt zuweist. Verlangst du einen Nachweis, muss die Erledigung von dir freigegeben werden."
            : "Eine eigene Aufgabe braucht keinen Nachweis und keine Freigabe — du hakst sie selbst ab."
        }
        zurueck={{ href: "/", text: "Übersicht" }}
      />
      <AufgabeFormular personen={demoDaten(jetzt).personen} darfZuweisen={fuerAndere} />
    </>
  );
}
```

- [ ] **Step 7: Freigabe-Warteschlange schreiben**

Create `src/app/m/aufgaben/freigaben/page.tsx`:

```tsx
import { Card, Col, Row } from "antd";
import { notFound } from "next/navigation";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { demoDaten, isoTag } from "../_lib/demoDaten";
import { aktuelleDemoPerson } from "../_lib/demoRolle";
import type { DemoDaten, Person } from "../_lib/typen";
import { darfFreigeben, istVertretungsfreigabe } from "../_lib/zugang";
import { AufgabenListe } from "../_ui/AufgabenListe";
import { SeitenKopf } from "../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

/*
 * DIE FREIGABE-WARTESCHLANGE. Eigene und Vertretungsfreigaben stehen sichtbar
 * GETRENNT: zusammengeworfen waere die Liste kuerzer, aber niemand wuesste mehr,
 * welche Freigabe ihm gehoert und welche er jemandem abnimmt — und genau das
 * soll der Verlauf spaeter belegen („Freigegeben von Sarah in Vertretung fuer
 * Schulle").
 *
 * SELBSTAUFGABEN ERSCHEINEN HIER NIE. `darfFreigeben` gibt fuer sie immer
 * `false` zurueck, auch der Koordination — sie haben keinen Pruefer.
 */
export function freigabenInhalt(daten: DemoDaten, person: Person, jetzt: Date) {
  const heute = isoTag(jetzt);
  const alle = daten.aufgaben.filter(
    (a) => a.status === "freigabe_offen" && darfFreigeben(person, a, heute),
  );
  const eigene = alle.filter((a) => !istVertretungsfreigabe(person, a));
  const vertretung = alle.filter((a) => istVertretungsfreigabe(person, a));
  const zeigeVertretung = person.rolle === "koordination";

  return (
    <>
      <SeitenKopf
        titel="Freigaben"
        kontext={`${alle.length} Erledigung${alle.length === 1 ? "" : "en"} warten auf Bestätigung. Wer zurückweist, muss eine Begründung angeben.`}
        zurueck={{ href: "/", text: "Übersicht" }}
      />

      <Row gutter={[SPACE.xl, SPACE.xl]}>
        <Col xs={24} md={zeigeVertretung ? 12 : 24}>
          <Card title={<span style={SCHRIFT.kicker}>Meine Freigaben</span>}>
            <div data-rolle="freigaben-eigene">
              <AufgabenListe aufgaben={eigene} personen={daten.personen} heute={heute}
                zeigeEmpfaenger leerText="Keine eigene Freigabe offen." />
            </div>
          </Card>
        </Col>
        {zeigeVertretung ? (
          <Col xs={24} md={12}>
            <Card title={<span style={SCHRIFT.kicker}>In Vertretung</span>}>
              <div data-rolle="freigaben-vertretung">
                <AufgabenListe aufgaben={vertretung} personen={daten.personen} heute={heute}
                  zeigeEmpfaenger leerText="Nichts liegen geblieben." />
              </div>
            </Card>
          </Col>
        ) : null}
      </Row>
    </>
  );
}

export default async function FreigabenSeite() {
  const jetzt = new Date();
  const person = await aktuelleDemoPerson(jetzt);
  // BuFDis geben nichts frei. `navFuer` zeigt ihnen die Seite nicht, und hier
  // ist der Riegel — dasselbe Praedikat, damit kein Knopf vor ein 404 zeigt.
  if (person.rolle === "bufdi") notFound();
  return freigabenInhalt(demoDaten(jetzt), person, jetzt);
}
```

Create `src/app/m/aufgaben/freigaben/inhalt.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { demoDaten } from "../_lib/demoDaten";
import { freigabenInhalt } from "./page";

const JETZT = new Date("2026-08-13T10:00:00Z");
const D = demoDaten(JETZT);
const SARAH = D.personen.find((p) => p.id === "sarah")!;
const SCHULLE = D.personen.find((p) => p.id === "schulle")!;

describe("freigabenInhalt", () => {
  it("gibt der Koordination beide Spalten", async () => {
    await mount(freigabenInhalt(D, SARAH, JETZT));
    expect(exists("[data-rolle='freigaben-eigene']")).toBe(true);
    expect(exists("[data-rolle='freigaben-vertretung']")).toBe(true);
    await unmount();
  });

  /*
   * Ein Auftraggeber hat keine Vertretung — die Spalte waere immer leer und
   * saehe aus wie ein Fehler. Sie erscheint deshalb nicht, statt einen
   * Leerzustand fuer eine Sache zu zeigen, die es fuer ihn nicht gibt.
   */
  it("gibt einem Auftraggeber nur die eigene Spalte", async () => {
    await mount(freigabenInhalt(D, SCHULLE, JETZT));
    expect(exists("[data-rolle='freigaben-eigene']")).toBe(true);
    expect(exists("[data-rolle='freigaben-vertretung']")).toBe(false);
    await unmount();
  });

  it("sortiert a7 zu Sarahs eigenen und a6 in ihre Vertretung", async () => {
    await mount(freigabenInhalt(D, SARAH, JETZT));
    expect(query("[data-rolle='freigaben-eigene']").querySelector("[data-aufgabe='a7']")).toBeTruthy();
    expect(query("[data-rolle='freigaben-vertretung']").querySelector("[data-aufgabe='a6']")).toBeTruthy();
    await unmount();
  });

  it("zeigt Schulle nur seine eigene Freigabe", async () => {
    await mount(freigabenInhalt(D, SCHULLE, JETZT));
    const eigene = query("[data-rolle='freigaben-eigene']");
    expect(eigene.querySelector("[data-aufgabe='a6']")).toBeTruthy();
    expect(eigene.querySelector("[data-aufgabe='a7']")).toBeNull();
    await unmount();
  });

  /*
   * SELBSTAUFGABEN HABEN KEINEN PRUEFER — sie duerfen hier nie erscheinen, auch
   * nicht bei der Koordination. Der naheliegende Fehler waere ein
   * Freigabeknopf fuer Leas eigene Aufgabe, und er waere technisch unauffaellig.
   */
  it("fuehrt keine Selbstaufgabe, auch nicht bei der Koordination", async () => {
    const mitSelbst = {
      ...D,
      aufgaben: D.aufgaben.map((a) => (a.id === "a10" ? { ...a, status: "freigabe_offen" as const } : a)),
    };
    await mount(freigabenInhalt(mitSelbst, SARAH, JETZT));
    expect(document.querySelector("[data-aufgabe='a10']")).toBeNull();
    await unmount();
  });

  it("nennt die Begruendungspflicht in der Kontextzeile", async () => {
    await mount(freigabenInhalt(D, SARAH, JETZT));
    expect(query("[data-rolle='kontext']").textContent).toContain("Begründung");
    await unmount();
  });

  it("fuehrt zurueck", async () => {
    await mount(freigabenInhalt(D, SARAH, JETZT));
    expect(query("nav[aria-label='Brotkrume'] a").getAttribute("href")).toBe("/");
    await unmount();
  });
});
```

- [ ] **Step 8: Tests, Gates, echter Abruf**

```bash
rtk pnpm vitest run src/app/m/aufgaben && \
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm build && \
rtk pnpm exec playwright test e2e/aufgaben.spec.ts
```
Expected: alle grün. **Ein HTTP 500 auf `/neu` zeigt auf `Form.Item` oder `Input.TextArea`** — beide sind Compound-Zugriffe und funktionieren nur, weil `AufgabeFormular.tsx` die Client-Direktive trägt.

- [ ] **Step 9: Commit**

```bash
rtk git add src/app/m/aufgaben && \
rtk git commit -m "feat(aufgaben): Auftraggeber-Einstieg, Einstell-Formular, Freigaben

Damit ist der rollenabhaengige Einstieg vollstaendig: drei Rollen, drei
Arbeitsfragen. Der Auftraggeber sieht keinen Weg zur Verteilung — dasselbe
Praedikat wie in navFuer und zugang.ts, aus EINER Quelle.

Das Formular ist eine Client-Insel, und zwar zwingend: Form.Item und
Input.TextArea sind Compound-Zugriffe und ergeben in RSC HTTP 500. Es gibt
keine Wahl zwischen RSC und Client, nur zwischen dieser Insel und einem
antd-freien Eigenbau.

Radio.Group statt Knopfreihe: ein Tabstop fuer die Gruppe, Pfeiltasten
waehlen nativ. Eine Knopfreihe waere drei Tabstops ohne Pfeilnavigation —
und sie sieht fast gleich aus, weshalb der Fehler nie auffaellt.

Selbstaufgaben erscheinen in keiner Freigabeliste, auch nicht bei der
Koordination: sie haben keinen Pruefer. Der naheliegende Fehler waere ein
Freigabeknopf fuer eine eigene Aufgabe, und er waere unauffaellig."
```

---

## Task 12: Aufgabendetail und Archiv

**Files:**
- Create: `src/app/m/aufgaben/a/[id]/page.tsx`
- Create: `src/app/m/aufgaben/a/[id]/inhalt.test.tsx`
- Create: `src/app/m/aufgaben/archiv/page.tsx`

**Interfaces:**
- Produces: `aufgabeInhalt(daten, person, aufgabe, jetzt)`; `archivInhalt(daten, person, jetzt)`

- [ ] **Step 1: Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/a/[id]/inhalt.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { demoDaten } from "../../_lib/demoDaten";
import { aufgabeInhalt } from "./page";

const JETZT = new Date("2026-08-13T10:00:00Z");
const D = demoDaten(JETZT);
const p = (id: string) => D.personen.find((x) => x.id === id)!;
const a = (id: string) => D.aufgaben.find((x) => x.id === id)!;

const zeige = (personId: string, aufgabeId: string) =>
  mount(aufgabeInhalt(D, p(personId), a(aufgabeId), JETZT));

describe("aufgabeInhalt", () => {
  it("zeigt Titel, Erklaerung, Zustand und Prioritaet", async () => {
    await zeige("lea", "a3");
    expect(query("h1").textContent).toBe("Materiallager inventarisieren");
    expect(document.body.textContent).toContain("Fehlmengen notieren");
    expect(document.body.textContent).toContain("Verteilt");
    expect(document.body.textContent).toContain("Hoch");
    await unmount();
  });

  it("nennt Auftraggeber, Empfaenger, Frist, Dauer und Pruefer", async () => {
    await zeige("lea", "a3");
    const meta = query("[data-rolle='meta']").textContent ?? "";
    expect(meta).toContain("Schulle");
    expect(meta).toContain("Lea");
    expect(meta).toContain("2 Std.");
    await unmount();
  });

  it("nennt bei einer Selbstaufgabe ausdruecklich, dass keine Freigabe noetig ist", async () => {
    await zeige("lea", "a10");
    expect(query("[data-rolle='meta']").textContent).toContain("keine Freigabe");
    await unmount();
  });

  it("rendert den Verlauf mit Zeitstempel und Akteur", async () => {
    await zeige("lea", "a3");
    const verlauf = query("[data-rolle='verlauf']").textContent ?? "";
    expect(verlauf).toContain("Aufgabe eingestellt");
    expect(verlauf).toContain("An Lea verteilt");
    expect(verlauf).toContain("Schulle");
    await unmount();
  });

  /*
   * DIE ZURUECKWEISUNG MUSS IHRE BEGRUENDUNG ZEIGEN. Ohne sie ist die
   * Zurueckweisung fuer den BuFDi wertlos, und der Verlauf haette genau die
   * Information verloren, um derentwillen es ihn gibt.
   */
  it("zeigt die Begruendung einer Zurueckweisung im Verlauf", async () => {
    await zeige("noah", "a8");
    expect(query("[data-rolle='verlauf']").textContent).toContain("fehlenden Schlüssel");
    await unmount();
  });

  it("zeigt den Nachweis dem Verfasser", async () => {
    await zeige("lea", "a6");
    expect(query("[data-rolle='nachweis']").textContent).toContain("Vorrat aufgefüllt");
    await unmount();
  });

  it("zeigt den Nachweis dem Auftraggeber und der Koordination", async () => {
    await zeige("schulle", "a6");
    expect(exists("[data-rolle='nachweis']")).toBe(true);
    await unmount();
    await zeige("sarah", "a6");
    expect(exists("[data-rolle='nachweis']")).toBe(true);
    await unmount();
  });

  /*
   * UND DIE VERWEIGERUNG, die das ganze Praedikat rechtfertigt: Noah sieht Leas
   * Zeitplan, aber nicht ihren Leistungsnachweis. Statt der Inhalte steht ein
   * Satz, der sagt, dass es einen gibt — das Verschweigen der Existenz waere
   * hier falsch, weil der Zustand „Freigabe offen" sie ohnehin verraet.
   */
  it("verweigert den Nachweis einem unbeteiligten BuFDi mit einem Satz", async () => {
    await zeige("noah", "a6");
    expect(exists("[data-rolle='nachweis']")).toBe(false);
    expect(query("[data-rolle='nachweis-gesperrt']").textContent).toContain("nicht einsehbar");
    await unmount();
  });

  it("gibt dem Pruefer Freigeben und Zurueckweisen", async () => {
    await zeige("schulle", "a6");
    const zone = query("[data-rolle='aktionen']").textContent ?? "";
    expect(zone).toContain("Freigeben");
    expect(zone).toContain("Zurückweisen");
    await unmount();
  });

  it("gibt dem ausfuehrenden BuFDi keine Freigabe", async () => {
    await zeige("lea", "a6");
    expect(query("[data-rolle='aktionen']").textContent).not.toContain("Freigeben");
    await unmount();
  });

  it("gibt dem BuFDi im Zustand verteilt „Bearbeitung starten"", async () => {
    await zeige("lea", "a3");
    expect(query("[data-rolle='aktionen']").textContent).toContain("Bearbeitung starten");
    await unmount();
  });

  it("gibt dem BuFDi im Zustand in_arbeit „Fertig melden"", async () => {
    await zeige("lea", "a5");
    expect(query("[data-rolle='aktionen']").textContent).toContain("Fertig melden");
    await unmount();
  });

  it("gibt einer abgeschlossenen Aufgabe keine Aktion", async () => {
    await zeige("lea", "a12");
    expect(query("[data-rolle='aktionen']").textContent).toContain("Keine Aktion");
    await unmount();
  });

  /*
   * Die Nachweispflicht muss VOR dem Fertigmelden sichtbar sein, nicht erst als
   * Fehlermeldung danach.
   */
  it("nennt die Nachweispflicht bei einer laufenden Aufgabe", async () => {
    await zeige("lea", "a5");
    expect(query("[data-rolle='aktionen']").textContent).toContain("Nachweis");
    await unmount();
  });

  it("fuehrt zurueck", async () => {
    await zeige("lea", "a3");
    expect(query("nav[aria-label='Brotkrume'] a").getAttribute("href")).toBe("/");
    await unmount();
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run "src/app/m/aufgaben/a/[id]/inhalt.test.tsx"`
Expected: FAIL — `Failed to resolve import "./page"`.

- [ ] **Step 3: Aufgabendetail schreiben**

Create `src/app/m/aufgaben/a/[id]/page.tsx`:

```tsx
import { Button, Card } from "antd";
import { notFound } from "next/navigation";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { fmtDauer, fmtTagKurz, istUeberfaellig, vorschlagOffen } from "../../_lib/anzeige";
import { demoDaten, isoTag } from "../../_lib/demoDaten";
import { aktuelleDemoPerson } from "../../_lib/demoRolle";
import type { Aufgabe, DemoDaten, Person } from "../../_lib/typen";
import { darfFreigeben, darfNachweisSehen, istAktiv } from "../../_lib/zugang";
import { PrioritaetChip, StatusChip } from "../../_ui/Chip";
import { Ikone } from "../../_ui/ikonen";
import { SeitenKopf } from "../../_ui/SeitenKopf";
import s from "../../_ui/aufgaben.module.css";

export const dynamic = "force-dynamic";

const NACHWEIS_TEXT = { text: "schriftlich", bild: "mit Bild" } as const;

/*
 * DIE AKTIONSZONE TRAEGT NUR, WAS DIESE PERSON MIT DIESER AUFGABE IN DIESEM
 * ZUSTAND TUN DARF. Ein Knopf, der beim Klicken abgelehnt wird, ist schlechter
 * als keiner — und ein Knopf vor einem `notFound()` verraet die Existenz einer
 * Seite, die der Riegel gerade verschweigen soll.
 */
function Aktionen({ person, aufgabe, heute }: { person: Person; aufgabe: Aufgabe; heute: string }) {
  const aktiv = istAktiv(person, heute);
  const meine = aufgabe.zugewiesenAn === person.id;
  const pruefer = darfFreigeben(person, aufgabe, heute);

  const knoepfe: React.ReactNode[] = [];

  if (aktiv && meine) {
    if (aufgabe.status === "verteilt") {
      knoepfe.push(<Button key="start" type="primary" disabled>Bearbeitung starten</Button>);
    }
    if (aufgabe.status === "in_arbeit") {
      knoepfe.push(<Button key="fertig" type="primary" disabled>Fertig melden</Button>);
      knoepfe.push(<Button key="zurueck" disabled>Zurück auf „verteilt“</Button>);
    }
    if (aufgabe.status === "zurueckgewiesen") {
      knoepfe.push(<Button key="wieder" type="primary" disabled>Bearbeitung wieder aufnehmen</Button>);
    }
  }

  if (aktiv && pruefer && aufgabe.status === "freigabe_offen") {
    knoepfe.push(<Button key="frei" type="primary" disabled>Freigeben</Button>);
    // Nicht `danger`: das faerbte den Knopf in Suite-Rot, und Rot ist hier die
    // Primaeraktion. Zurueckweisen ist ein normaler Knopf mit klarem Wort.
    knoepfe.push(<Button key="ab" disabled>Zurückweisen (mit Begründung)</Button>);
  }

  return (
    <div data-rolle="aktionen">
      {knoepfe.length === 0 ? (
        <p style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)", margin: 0 }}>
          Keine Aktion für dich in diesem Zustand.
        </p>
      ) : (
        <>
          {aufgabe.nachweisPflicht && meine && aufgabe.status === "in_arbeit" ? (
            <p style={{ ...SCHRIFT.neben, color: "var(--auf-ocker-text)", marginBlockEnd: SPACE.sm }}>
              Diese Aufgabe verlangt einen Nachweis ({NACHWEIS_TEXT[aufgabe.nachweisArt]}).
              Ohne ihn lässt sich „Fertig melden“ nicht abschließen.
            </p>
          ) : null}
          <div className={s.knopfzeile}>{knoepfe}</div>
        </>
      )}
    </div>
  );
}

export function aufgabeInhalt(daten: DemoDaten, person: Person, aufgabe: Aufgabe, jetzt: Date) {
  const heute = isoTag(jetzt);
  const namen = new Map(daten.personen.map((p) => [p.id, p.name]));
  const nachweise = daten.nachweise.filter((n) => n.aufgabeId === aufgabe.id);
  const verlauf = daten.verlauf
    .filter((v) => v.aufgabeId === aufgabe.id)
    .sort((a, b) => a.ts.localeCompare(b.ts));
  const darfNachweis = darfNachweisSehen(person, aufgabe);

  return (
    <>
      <SeitenKopf
        titel={aufgabe.titel}
        kontext={
          vorschlagOffen(aufgabe)
            ? `Zeitvorschlag der Koordination: ${fmtTagKurz(aufgabe.vorschlagDatum!)}${aufgabe.vorschlagUhrzeit ? ` ${aufgabe.vorschlagUhrzeit}` : ""}`
            : undefined
        }
        zurueck={{ href: "/", text: "Übersicht" }}
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBlockEnd: SPACE.lg }}>
        <StatusChip status={aufgabe.status} />
        <PrioritaetChip prioritaet={aufgabe.prioritaet} />
        {aufgabe.nachweisPflicht ? (
          <span style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)" }}>
            <Ikone name={aufgabe.nachweisArt === "bild" ? "nachweis-bild" : "nachweis-text"} groesse={12} />{" "}
            Nachweis {NACHWEIS_TEXT[aufgabe.nachweisArt]}
          </span>
        ) : null}
        {istUeberfaellig(aufgabe, heute) ? (
          <span style={{ ...SCHRIFT.neben, color: "var(--auf-achtung-text)", fontWeight: 600 }}>
            <Ikone name="warnung" groesse={12} /> überfällig
          </span>
        ) : null}
      </div>

      <Card title={<span style={SCHRIFT.kicker}>Auftrag</span>} style={{ marginBlockEnd: SPACE.xl }}>
        {/* Die Erklaerung des Auftraggebers steht UNGEKUERZT — sie ist der Grund,
            warum das Modul ein Erklaerungsfeld hat. */}
        <p style={{ ...SCHRIFT.text, margin: 0, maxWidth: "72ch", whiteSpace: "pre-wrap" }}>
          {aufgabe.beschreibung}
        </p>

        <dl
          data-rolle="meta"
          style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: `${SPACE.xs}px ${SPACE.md}px`, marginBlockStart: SPACE.lg, marginBlockEnd: 0 }}
        >
          <dt style={SCHRIFT.kicker}>Auftraggeber</dt>
          <dd style={{ ...SCHRIFT.text, margin: 0 }}>{namen.get(aufgabe.erstellerId)}</dd>
          <dt style={SCHRIFT.kicker}>Zugewiesen</dt>
          <dd style={{ ...SCHRIFT.text, margin: 0 }}>
            {aufgabe.zugewiesenAn ? namen.get(aufgabe.zugewiesenAn) : "niemandem"}
          </dd>
          <dt style={SCHRIFT.kicker}>Frist</dt>
          <dd style={{ ...SCHRIFT.text, margin: 0 }}>
            {fmtTagKurz(aufgabe.faelligAm)}
            {aufgabe.faelligUhrzeit ? `, ${aufgabe.faelligUhrzeit}` : ""}
          </dd>
          <dt style={SCHRIFT.kicker}>Dauer</dt>
          <dd style={{ ...SCHRIFT.text, margin: 0 }}>{fmtDauer(aufgabe.dauerMinuten)}</dd>
          <dt style={SCHRIFT.kicker}>Prüfer</dt>
          <dd style={{ ...SCHRIFT.text, margin: 0 }}>
            {aufgabe.prueferId
              ? namen.get(aufgabe.prueferId)
              : "eigene Aufgabe — keine Freigabe nötig"}
          </dd>
        </dl>
      </Card>

      <Card title={<span style={SCHRIFT.kicker}>Nachweis</span>} style={{ marginBlockEnd: SPACE.xl }}>
        {!darfNachweis ? (
          <p data-rolle="nachweis-gesperrt" style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)", margin: 0 }}>
            Der Nachweis ist für dich nicht einsehbar. Er ist eine
            Leistungsdokumentation und nur für die verfassende Person, den
            Auftraggeber und die Koordination sichtbar.
          </p>
        ) : nachweise.length === 0 ? (
          <p style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)", margin: 0 }}>
            Noch kein Nachweis abgegeben.
          </p>
        ) : (
          <ul data-rolle="nachweis" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {nachweise.map((n) => (
              <li key={n.id} style={{ padding: `${SPACE.sm}px 0` }}>
                <p style={{ ...SCHRIFT.text, margin: 0 }}>{n.text}</p>
                <span className={s.jts}>
                  {n.art === "bild" ? `Bild: ${n.dateiname}` : "Schriftlich"} ·{" "}
                  {namen.get(n.erstelltVon)} · {n.erstelltAm}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={<span style={SCHRIFT.kicker}>Verlauf</span>} style={{ marginBlockEnd: SPACE.xl }}>
        <ol data-rolle="verlauf" className={s.journal}>
          {verlauf.map((v) => (
            <li key={v.id} style={{ padding: `${SPACE.sm}px 0`, borderBlockEnd: "1px solid var(--auf-linie)" }}>
              <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap", alignItems: "baseline" }}>
                <span className={s.jts}>{v.ts}</span>
                <span style={{ ...SCHRIFT.text, fontWeight: 600 }}>{v.ereignis}</span>
                <span className={s.jts}>{namen.get(v.akteurId)}</span>
              </div>
              {v.notiz ? (
                <p style={{ ...SCHRIFT.neben, color: "var(--auf-stahl)", margin: `${SPACE.xs}px 0 0`, maxWidth: "72ch" }}>
                  {v.notiz}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>

      <Aktionen person={person} aufgabe={aufgabe} heute={heute} />
    </>
  );
}

export default async function AufgabeSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jetzt = new Date();
  const daten = demoDaten(jetzt);
  const person = await aktuelleDemoPerson(jetzt);

  // Die Aufgabe wird GESUCHT, nicht geglaubt. `/a/beliebig` waere sonst ein IDOR.
  const aufgabe = daten.aufgaben.find((a) => a.id === id);
  if (!aufgabe) notFound();

  return aufgabeInhalt(daten, person, aufgabe, jetzt);
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `rtk pnpm vitest run "src/app/m/aufgaben/a/[id]/inhalt.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Archiv schreiben**

Create `src/app/m/aufgaben/archiv/page.tsx`:

```tsx
import { Card, Col, Row } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { istUeberfaellig } from "../_lib/anzeige";
import { demoDaten, isoTag } from "../_lib/demoDaten";
import { aktuelleDemoPerson } from "../_lib/demoRolle";
import type { DemoDaten, Person } from "../_lib/typen";
import { AufgabenListe } from "../_ui/AufgabenListe";
import { Kachel } from "../_ui/Kachel";
import { SeitenKopf } from "../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

/*
 * ARCHIV UND UEBERFAELLIGKEITSLISTE auf einer Seite. Getrennt waeren es zwei
 * Seiten mit derselben Liste in anderer Filterung — und der Weg zur
 * Ueberfaelligkeitsliste fuehrt aus jeder KPI-Kachel hierher.
 *
 * DIE SICHT IST GEFILTERT, nicht die Seite gesperrt: ein BuFDi sieht seine
 * eigenen, Koordination und Auftraggeber sehen alle. Deshalb gibt es hier
 * KEINEN `notFound()`-Riegel — jede Rolle hat hier etwas zu sehen, nur
 * verschieden viel. Eine ausgeschiedene Person findet hier ihre Geschichte.
 */
export function archivInhalt(daten: DemoDaten, person: Person, jetzt: Date) {
  const heute = isoTag(jetzt);

  const sichtbar =
    person.rolle === "bufdi"
      ? daten.aufgaben.filter((a) => a.zugewiesenAn === person.id)
      : daten.aufgaben;

  const ueberfaellig = sichtbar.filter((a) => istUeberfaellig(a, heute));
  const wartend = sichtbar.filter((a) => a.status === "freigabe_offen");
  const zurueckgewiesen = sichtbar.filter((a) => a.status === "zurueckgewiesen");
  const abgeschlossen = sichtbar
    .filter((a) => a.status === "abgeschlossen")
    .sort((a, b) => b.faelligAm.localeCompare(a.faelligAm));

  return (
    <>
      <SeitenKopf
        titel="Archiv"
        kontext={
          person.rolle === "bufdi"
            ? "Deine Aufgaben, vollständig — auch die abgeschlossenen des vergangenen Dienstjahres."
            : "Alle Aufgaben, vollständig. Überfälliges zuerst."
        }
        zurueck={{ href: "/", text: "Übersicht" }}
      />

      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={24} md={8}>
          <Kachel zahl={ueberfaellig.length} beschriftung="überfällig"
            kante={ueberfaellig.length ? "achtung" : undefined} />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={wartend.length} beschriftung="warten auf Freigabe"
            kante={wartend.length ? "ocker" : undefined} />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={abgeschlossen.length} beschriftung="abgeschlossen" kante="ok" />
        </Col>
      </Row>

      <Card title={<span style={SCHRIFT.kicker}>Überfällig</span>} style={{ marginBlockEnd: SPACE.xl }}>
        <div data-rolle="ueberfaellig">
          <AufgabenListe aufgaben={ueberfaellig} personen={daten.personen} heute={heute}
            zeigeEmpfaenger leerText="Keine überfälligen Aufgaben." />
        </div>
      </Card>

      <Card title={<span style={SCHRIFT.kicker}>Zurückgewiesen</span>} style={{ marginBlockEnd: SPACE.xl }}>
        <div data-rolle="zurueckgewiesen">
          <AufgabenListe aufgaben={zurueckgewiesen} personen={daten.personen} heute={heute}
            zeigeEmpfaenger leerText="Nichts zurückgewiesen." />
        </div>
      </Card>

      <Card title={<span style={SCHRIFT.kicker}>Abgeschlossen</span>}>
        <div data-rolle="abgeschlossen">
          <AufgabenListe aufgaben={abgeschlossen} personen={daten.personen} heute={heute}
            zeigeEmpfaenger leerText="Noch nichts abgeschlossen." />
        </div>
      </Card>
    </>
  );
}

export default async function ArchivSeite() {
  const jetzt = new Date();
  const person = await aktuelleDemoPerson(jetzt);
  return archivInhalt(demoDaten(jetzt), person, jetzt);
}
```

- [ ] **Step 6: Tests, Gates, echter Abruf**

```bash
rtk pnpm vitest run src/app/m/aufgaben && \
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm build && \
rtk pnpm exec playwright test e2e/aufgaben.spec.ts
```
Expected: alle grün.

- [ ] **Step 7: Commit**

```bash
rtk git add src/app/m/aufgaben && \
rtk git commit -m "feat(aufgaben): Aufgabendetail und Archiv

Die Aktionszone traegt nur, was DIESE Person mit DIESER Aufgabe in DIESEM
Zustand tun darf. Ein Knopf, der beim Klicken abgelehnt wird, ist
schlechter als keiner — und einer vor einem notFound() verraet die
Existenz einer Seite, die der Riegel verschweigen soll.

Der Nachweis ist fuer unbeteiligte BuFDis gesperrt, aber mit einem SATZ
statt stiller Leere: der Zustand \"Freigabe offen\" verraet seine Existenz
ohnehin, und ein leerer Kasten sieht wie ein Fehler aus.

Zurueckweisen ist kein \`danger\`-Knopf: das faerbte ihn in Suite-Rot, und
Rot ist hier die Primaeraktion. Das Wort traegt die Bedeutung.

Das Archiv hat KEINEN notFound()-Riegel, sondern eine gefilterte Sicht —
jede Rolle hat dort etwas zu sehen, nur verschieden viel, und eine
ausgeschiedene Person findet dort ihre Geschichte."
```

---

## Task 13: Der echte Abruf über drei Viewports, und aufräumen

Die Aufgabe, die den Bauabschnitt trägt. **Drei Aussagen kann nur ein Browser treffen**, und alle drei sind in dieser Suite schon teuer gewesen: dass eine Seite überhaupt HTTP 200 liefert, dass die Tagesliste mobil sichtbar ist, und dass sie es auf dem Desktop *nicht* ist.

**Files:**
- Modify: `e2e/aufgaben.spec.ts` (vollständig ersetzen)
- Delete: `bufdi-koordination-klickdummy.html`

- [ ] **Step 1: e2e-Spezifikation vollständig schreiben**

Replace `e2e/aufgaben.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";

const HOST = "aufgaben.localtest.me";
const BASIS = `http://${HOST}:3100`;
const GRUPPE = "iuk-aufgaben-nutzer";

/**
 * ALLE NEUN ROUTEN. Ein Abruf je Route auf HTTP 200 ist der wichtigste Test des
 * Bauabschnitts: die vier Suite-Fallen, die ihn bedrohen (antd-Compound in RSC,
 * ein WERT aus einem "use client"-Modul, @ant-design/icons in RSC, ein
 * gestempeltes data-theme="auto"), bestehen `pnpm typecheck`, `pnpm lint`,
 * `pnpm build` UND `pnpm vitest run`. Nur ein echter Abruf zeigt den 500.
 */
const ROUTEN = [
  "/",
  "/neu",
  "/verteilen",
  "/freigaben",
  "/personen",
  "/archiv",
  "/routinen",
  "/plan/lea",
  "/a/a3",
] as const;

/** Setzt die Demo-Rolle, ohne durch die Oberflaeche zu klicken. */
async function alsPerson(page: Page, id: string) {
  await page.context().addCookies([
    { name: "aufgaben-demo-person", value: id, domain: ".localtest.me", path: "/" },
  ]);
}

test.describe("Modul aufgaben — Klickdummy", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { host: HOST, groups: GRUPPE, callbackPath: "/" });
  });

  /*
   * Die Koordination sieht alle neun Routen. Andere Rollen bekommen auf einigen
   * absichtlich 404 — das prueft der Riegel-Test weiter unten.
   */
  test("jede Route antwortet der Koordination mit 200", async ({ page }) => {
    await alsPerson(page, "sarah");
    for (const route of ROUTEN) {
      const res = await page.goto(`${BASIS}${route}`);
      expect(res?.status(), `${route} antwortete nicht mit 200`).toBe(200);
      // Suite-Chrome muss da sein, sonst hat die Shell nicht getragen.
      await expect(page.getByTestId("suite-header"), route).toBeVisible();
    }
  });

  test("der Demo-Rollenwechsler steht auf jeder Seite und ist als Demo erkennbar", async ({ page }) => {
    await alsPerson(page, "sarah");
    await page.goto(`${BASIS}/archiv`);
    const leiste = page.locator("[data-rolle='demo-wechsler']");
    await expect(leiste).toBeVisible();
    await expect(leiste).toContainText("Nur im Klickdummy");
  });

  test("der Rollenwechsel wirkt und bleibt auf derselben Seite", async ({ page }) => {
    await alsPerson(page, "sarah");
    await page.goto(`${BASIS}/archiv`);
    await page.locator("[data-rolle='demo-wechsler'] .ant-select").click();
    await page.getByTitle(/^Lea/).click();
    await page.getByRole("button", { name: "Wechseln" }).click();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/archiv");
    // Leas Archiv zeigt nur ihre eigenen Aufgaben.
    await expect(page.locator("[data-rolle='abgeschlossen']")).not.toContainText("Ablage Vorwoche");
  });

  test("die drei Rollen sehen drei verschiedene Einstiege", async ({ page }) => {
    for (const [id, titel] of [
      ["sarah", "Verteilung"],
      ["schulle", "Meine Aufträge"],
      ["lea", "Meine Woche"],
    ] as const) {
      await alsPerson(page, id);
      await page.goto(`${BASIS}/`);
      await expect(page.getByRole("heading", { level: 1 }), id).toHaveText(titel);
    }
  });

  /*
   * DIE GEGENPROBE, DIE DAS MODUL RECHTFERTIGT: Schulle kommt nicht an die
   * Verteilung, und er erfaehrt auch nicht, dass es sie gibt — 404, nicht 403.
   */
  test("ein Auftraggeber bekommt auf der Verteil- und Personenseite 404", async ({ page }) => {
    await alsPerson(page, "schulle");
    for (const route of ["/verteilen", "/personen", "/routinen"] as const) {
      const res = await page.goto(`${BASIS}${route}`);
      expect(res?.status(), route).toBe(404);
    }
  });

  test("ein BuFDi bekommt auf der Freigabeseite 404", async ({ page }) => {
    await alsPerson(page, "lea");
    const res = await page.goto(`${BASIS}/freigaben`);
    expect(res?.status()).toBe(404);
  });

  test("eine unbekannte Aufgabe und eine unbekannte Person ergeben 404", async ({ page }) => {
    await alsPerson(page, "sarah");
    expect((await page.goto(`${BASIS}/a/gibtesnicht`))?.status()).toBe(404);
    expect((await page.goto(`${BASIS}/plan/gibtesnicht`))?.status()).toBe(404);
  });

  test("der volle Durchlauf ist von Anfang bis Ende sichtbar", async ({ page }) => {
    // Schulle sieht seinen Auftrag und die offene Freigabe.
    await alsPerson(page, "schulle");
    await page.goto(`${BASIS}/`);
    await expect(page.locator("[data-rolle='meine-auftraege']")).toContainText("Materiallager");
    await expect(page.locator("[data-rolle='freigaben']")).toContainText("Getränkevorrat");

    // Sarah sieht den Posteingang und die Auslastung.
    await alsPerson(page, "sarah");
    await page.goto(`${BASIS}/verteilen`);
    await expect(page.locator("table")).toContainText("Erste-Hilfe-Material");
    await expect(page.locator("[data-rolle='auslastung']")).toContainText("Lea");

    // Lea sieht den Zeitvorschlag in ihrem Posteingang.
    await alsPerson(page, "lea");
    await page.goto(`${BASIS}/`);
    await expect(page.locator("[data-rolle='posteingang']")).toContainText("Vorschlag");

    // Der Nachweis ist auf der Detailseite da — fuer die Verfasserin.
    await page.goto(`${BASIS}/a/a6`);
    await expect(page.locator("[data-rolle='nachweis']")).toContainText("Vorrat aufgefüllt");

    // Und fuer Noah nicht.
    await alsPerson(page, "noah");
    await page.goto(`${BASIS}/a/a6`);
    await expect(page.locator("[data-rolle='nachweis-gesperrt']")).toContainText("nicht einsehbar");

    // Schulle gibt frei — der Knopf ist da (Bauabschnitt 2 verdrahtet ihn).
    await alsPerson(page, "schulle");
    await page.goto(`${BASIS}/a/a6`);
    await expect(page.locator("[data-rolle='aktionen']")).toContainText("Freigeben");
    await expect(page.locator("[data-rolle='aktionen']")).toContainText("Zurückweisen");
  });

  test("die Zurueckweisung zeigt ihre Begruendung im Verlauf", async ({ page }) => {
    await alsPerson(page, "noah");
    await page.goto(`${BASIS}/a/a8`);
    await expect(page.locator("[data-rolle='verlauf']")).toContainText("fehlenden Schlüssel");
  });
});

/*
 * DIE UMSCHALTUNG — und sie braucht ALLE DREI Breiten.
 *
 * Ein Test, der nur bei 390px misst, kann eine `display:none`-Regel gar nicht
 * WIDERLEGEN: dort sagen die richtige und die kaputte Fassung beide „sichtbar".
 * Genau so ist in dieser Suite eine Kaskadenkollision durchgekommen — die
 * Media-Query-Regel war da, der Quelltext-Scan war gruen, und der Knopf stand
 * trotzdem auf dem Desktop.
 *
 * UND DIE MITTE IST KEIN LUXUS: zwei Defekte dieser Suite waren an beiden Enden
 * unsichtbar (eine Knopfregel bei 600 statt 768 und eine Kopfzeile mit
 * Mindestbreite 904px zwischen 768 und 903). Die Mitte ist jedes Tablet im
 * Hochformat.
 */
test.describe("Wochenplan — Umschaltung bei 768px", () => {
  const GITTER = "[data-rolle='wochengitter']";
  const LISTE = "[data-rolle='tagesliste']";

  for (const [name, breite, hoehe, gitterSichtbar] of [
    ["mobil", 390, 844, false],
    ["Tablet hochkant", 820, 1180, true],
    ["Desktop", 1280, 720, true],
  ] as const) {
    test(`${name} (${breite}px): Gitter ${gitterSichtbar ? "sichtbar" : "aus"}, Liste umgekehrt`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: hoehe });
      await devLogin(page, { host: HOST, groups: GRUPPE, callbackPath: "/" });
      await page.context().addCookies([
        { name: "aufgaben-demo-person", value: "lea", domain: ".localtest.me", path: "/" },
      ]);
      await page.goto(`${BASIS}/`);

      // BEIDE stehen im HTML — das ist die Bauform, nicht ein Nebeneffekt.
      await expect(page.locator(GITTER)).toHaveCount(1);
      await expect(page.locator(LISTE)).toHaveCount(1);

      // Und genau eine ist sichtbar.
      if (gitterSichtbar) {
        await expect(page.locator(GITTER)).toBeVisible();
        await expect(page.locator(LISTE)).toBeHidden();
      } else {
        await expect(page.locator(GITTER)).toBeHidden();
        await expect(page.locator(LISTE)).toBeVisible();
      }
    });
  }

  test("mobil stehen die Handlungsknoepfe untereinander und in voller Breite", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await devLogin(page, { host: HOST, groups: GRUPPE, callbackPath: "/" });
    await page.context().addCookies([
      { name: "aufgaben-demo-person", value: "sarah", domain: ".localtest.me", path: "/" },
    ]);
    await page.goto(`${BASIS}/a/a6`);

    /*
     * DIE MESSUNG, DIE DIE SPEZIFITAETSERHOEHUNG BELEGT: `.knopfzeile > *` ist
     * genau so spezifisch wie `.ant-btn`, und antds Stylesheet kommt SPAETER.
     * Ohne `.modul .knopfzeile > *` gewinnt antd durch Dokumentreihenfolge und
     * die Knoepfe stehen weiter nebeneinander — sichtbar nur hier.
     */
    const knoepfe = page.locator("[data-rolle='aktionen'] .ant-btn");
    const anzahl = await knoepfe.count();
    expect(anzahl).toBeGreaterThan(1);

    const kaesten = await knoepfe.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    // Untereinander: kein Paar teilt eine Zeile.
    for (let i = 1; i < kaesten.length; i++) {
      expect(kaesten[i].top, `Knopf ${i} steht neben seinem Vorgaenger`).toBeGreaterThanOrEqual(
        kaesten[i - 1].bottom - 1,
      );
    }
    // Volle Breite: mindestens 90 % der Zeilenbreite.
    const zeile = await page.locator("[data-rolle='aktionen'] > div").last().boundingBox();
    for (const k of kaesten) expect(k.width).toBeGreaterThan((zeile?.width ?? 0) * 0.9);
  });

  /*
   * Der Desktop-Lauf ist keine Zugabe: `documentElement.scrollWidth` allein
   * wuerde einen Ueberlauf nicht sehen, den eine einzelne Spalte verursacht.
   */
  test("keine Seite scrollt waagerecht — mobil und auf dem Desktop", async ({ page }) => {
    for (const [breite, hoehe] of [[390, 844], [820, 1180], [1280, 720]] as const) {
      await page.setViewportSize({ width: breite, height: hoehe });
      await devLogin(page, { host: HOST, groups: GRUPPE, callbackPath: "/" });
      await page.context().addCookies([
        { name: "aufgaben-demo-person", value: "sarah", domain: ".localtest.me", path: "/" },
      ]);
      for (const route of ["/", "/verteilen", "/archiv", "/a/a6"] as const) {
        await page.goto(`${BASIS}${route}`);
        const ueberlauf = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(ueberlauf, `${route} bei ${breite}px`).toBeLessThanOrEqual(1);
      }
    }
  });
});

/*
 * DER DUNKELMODUS. Die Palette hat fuer jede helle Variable ein dunkles
 * Gegenstueck — das prueft `aufgaben-css.test.ts` strukturell. Dass sie
 * ANKOMMT, kann nur der Browser sagen: `getComputedStyle` ist die einzige
 * Instanz, die eine unaufgeloeste CSS-Variable bemerkt. Sie meldet sich sonst
 * NIE.
 */
test.describe("Dunkelmodus", () => {
  test("die Modul-Variablen loesen in beiden Modi auf und unterscheiden sich", async ({ page }) => {
    await devLogin(page, { host: HOST, groups: GRUPPE, callbackPath: "/" });
    await page.goto(`${BASIS}/`);

    const lies = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("[data-rolle='wochengitter']")?.closest("div");
        const stil = getComputedStyle(el ?? document.body);
        return {
          tinte: stil.getPropertyValue("--auf-tinte").trim(),
          achtung: stil.getPropertyValue("--auf-achtung-text").trim(),
          theme: document.documentElement.getAttribute("data-theme"),
        };
      });

    await page.evaluate(() => {
      document.cookie = "iuk-theme-pref=light; path=/";
    });
    await page.reload();
    const hell = await lies();

    await page.evaluate(() => {
      document.cookie = "iuk-theme-pref=dark; path=/";
    });
    await page.reload();
    const dunkel = await lies();

    // Aufgeloest, nicht leer — eine unaufgeloeste Variable ist ein leerer String.
    expect(hell.tinte).not.toBe("");
    expect(dunkel.tinte).not.toBe("");
    expect(hell.achtung).not.toBe("");
    expect(dunkel.achtung).not.toBe("");
    // Und wirklich umgeschaltet.
    expect(dunkel.tinte).not.toBe(hell.tinte);
    // `data-theme` traegt IMMER den aufgeloesten Wert, nie „auto".
    expect(hell.theme).toBe("light");
    expect(dunkel.theme).toBe("dark");
  });
});

test("ohne die Zugangsgruppe verweigert die Middleware den Zugang", async ({ page }) => {
  // Der Riegel liegt in der Middleware (core/routing.ts), nicht im Modul —
  // dasselbe Bild wie bei `alpha` in keystone.spec.ts, und deshalb 403 und
  // nicht 404: hier verschweigt die Suite nichts, sie verweigert.
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  const res = await page.goto(`${BASIS}/`);
  expect(res?.status()).toBe(403);
});
```

- [ ] **Step 2: e2e laufen lassen**

```bash
rtk pnpm exec playwright test e2e/aufgaben.spec.ts
```
Expected: alle Tests PASS.

**Fehlerdeutung, damit niemand an der falschen Stelle sucht:**

| Symptom | Ursache, fast immer |
|---|---|
| HTTP 500 auf einer Route | Compound-Zugriff auf antd in einer Server Component, oder `@ant-design/icons` irgendwo im Modul, oder ein Wert-Import aus einem `"use client"`-Modul |
| Gitter *und* Liste sichtbar bei 1280px | `.tagesListe { display: none }` fehlt **außerhalb** der Medienabfrage |
| Knöpfe stehen mobil nebeneinander | Die Spezifitätserhöhung `.modul .knopfzeile > *` fehlt — `.knopfzeile > *` allein verliert gegen `.ant-btn` durch Dokumentreihenfolge |
| `--auf-*` ist ein leerer String | Das `.modul`-Element trägt die Klasse nicht, oder es liegt **innerhalb** der Shell statt außen |
| `data-theme` ist `null` oder `"auto"` | Nicht das Modul — `core/theme/mode.ts` bzw. der `AntdProvider` |
| Rollenwechsel wirkt erst nach Neuladen | `export const dynamic = "force-dynamic"` fehlt auf der Seite |

- [ ] **Step 3: Alten Klickdummy löschen**

```bash
rm bufdi-koordination-klickdummy.html
```

**`rm`, nicht `git rm`** — die Datei ist nicht versioniert (sie stand am 2026-08-13 als `??` im Status). `git rm` bräche mit „did not match any files" ab und der Schritt sähe wie ein Fehler aus. Steht sie inzwischen im Index, ist `rtk git rm` das Richtige; `rtk git status --short` entscheidet das in einer Zeile.

Er war Referenz für den **Funktionsumfang**, nicht für die Gestaltung, und dieser Bauabschnitt ersetzt ihn vollständig. Ihn liegen zu lassen bedeutet zwei Klickdummys mit widersprüchlichem Aussehen — und der falsche ist der, den man in der Repository-Wurzel zuerst findet.

- [ ] **Step 4: Vollständiger Lauf aller Gates**

```bash
rtk pnpm typecheck && \
rtk pnpm lint && \
rtk pnpm vitest run && \
rtk pnpm build && \
rtk pnpm exec playwright test
```

Expected: alle grün. **Die vollständige Playwright-Suite, nicht nur `aufgaben.spec.ts`** — das neue Modul erscheint in `MODULES`, und `SuiteNav.test.tsx` sowie die Shell-e2e prüfen gegen die echte Registry.

- [ ] **Step 5: Abschluss-Commit**

```bash
rtk git add -A && \
rtk git commit -m "test(aufgaben): e2e ueber drei Viewports, alter Klickdummy entfernt

Drei Aussagen kann nur ein Browser treffen, und alle drei waren in dieser
Suite schon teuer: dass eine Seite HTTP 200 liefert (die vier Fallen
bestehen typecheck, lint, build UND vitest), dass die Tagesliste mobil
sichtbar ist, und dass sie es auf dem Desktop NICHT ist.

Drei Breiten, nicht zwei: 390, 820 und 1280. Ein Test, der nur bei 390px
misst, kann eine display:none-Regel gar nicht widerlegen — dort sagen die
richtige und die kaputte Fassung beide \"sichtbar\". Und die Mitte ist kein
Luxus: zwei Defekte dieser Suite waren an beiden Enden unsichtbar.

Der Dunkelmodus wird mit getComputedStyle gemessen. Eine unaufgeloeste
CSS-Variable meldet sich sonst nie.

bufdi-koordination-klickdummy.html ist entfernt: zwei Klickdummys mit
widersprechendem Aussehen, und der falsche ist der, den man in der
Repository-Wurzel zuerst findet."
```

---

## Fertig — was danach gilt

Nach Aufgabe 13 ist das Modul unter `aufgaben.localtest.me:3000` durchklickbar: neun Seiten, drei Rollen, echtes antd und echtes Suite-Theme, hell und dunkel, Desktop und Handy.

**Was ausdrücklich noch nicht funktioniert** — und im Klickdummy als gesperrter Knopf sichtbar ist, statt zu fehlen: Verteilen, Einplanen, Bearbeiten, Fertigmelden, Freigeben, Zurückweisen, Routinen anlegen, Personen ändern. Jede dieser Aktionen hat einen **Einstiegspunkt in der Oberfläche**, weil eine Action ohne Aufrufer kein Feature ist — Bauabschnitt 2 verdrahtet sie mit Server-Actions und `useActionState`.

**Vor Bauabschnitt 2 zu erledigen:** die Gruppe `iuk-aufgaben-nutzer` in Pocket ID anlegen (§3 des Specs). Ohne sie ist das Modul produktiv für niemanden erreichbar — lokal fällt das nicht auf, weil `AUTH_DEV_LOGIN` Gruppen als freies Feld annimmt.

**Eine bekannte Grenze, die Bauabschnitt 2 schließen muss:** `isoTag` rechnet in UTC. Zwischen 00:00 und 02:00 deutscher Sommerzeit liefert es deshalb den **Vortag**, und davon hängen die Überfälligkeits-Kachel und die `data-heute`-Markierung ab. Für einen Klickdummy ist das kosmetisch — niemand klickt um halb eins nachts durch Demodaten, und die Tests übergeben eine feste Uhrzeit, sehen es also nicht. Sobald Bauabschnitt 2 „überfällig" gegen echte Fristen rechnet, ist es ein Defekt: die Zeitzone gehört dann nach `Europe/Berlin`, an genau dieser einen Stelle.

**Streichposten, die Bauabschnitt 2 entfernt:** `_lib/demoDaten.ts`, `_lib/demoRolle.ts`, `_lib/demoRolleAktion.ts`, `_ui/DemoRollenWechsler.tsx` und die `.demoLeiste`-Regel im CSS. Der Rollenwechsler darf den Echtbetrieb nicht erreichen: mit ihm wäre jede Rolle von jedem einnehmbar.

---

## Selbstprüfung des Plans

**1. Deckung gegen das Spec.** Bauabschnitt 1 verlangt nach §12 „Registry, ICONS-Zeile, Shell, alle Bildschirme aus §8 mit fest verdrahteten Daten, Demo-Rollenwechsler, alte HTML-Datei löschen". Abgedeckt: Registry + ICONS + `.env.example` (Aufgabe 1) · alle neun Routen aus §8 (Aufgaben 9–12) · Rollenwechsler (Aufgabe 7) · Löschung (Aufgabe 13). Die Darstellungsregeln aus §9 sind über die Bausteine (Aufgaben 5–6) und den CSS-Test verteilt, die Prädikate aus §7 vollständig in Aufgabe 4, das Zustandsmodell aus §5 in den Ableitungen (Aufgabe 3) und den Demodaten (Aufgabe 2).

**Bewusst nicht abgedeckt, weil §12 sie späteren Abschnitten zuweist:** die Übergangstabelle aus §5.2 als erschöpfender Vitest (sie prüft Server-Actions, die es hier nicht gibt — die Demodaten belegen dafür jeden Zustand), `_lib/seedLokal.ts` und die Dreieck-Einträge aus §11 (kein `_db/` in dieser Stufe), und die Upload-Strecke aus §2.

**2. Platzhalter.** Kein „TBD", kein „TODO", kein „implement later", kein „similar to Task N". Jeder Schritt mit Code trägt den Code. Die gesperrten Knöpfe sind kein Platzhalter, sondern die zugesagte Lieferung: der Klickdummy soll zeigen, *dass* es einen Weg gibt.

**3. Typkonsistenz.** Ein Durchgang über die Signaturen ergab drei Dinge, die im Plan bereits berichtigt sind: der doppelte Import aus `_lib/anzeige.ts` in `EinstiegBufdi.tsx`, der doppelte aus `_lib/demoDaten.ts` in `verteilen/page.tsx`, und der Rückweg des Rollenwechslers, der als Layout-Prop gedacht war und jetzt aus `usePathname()` kommt — das Layout hat den Pfad nicht, und `src/proxy.ts` liefert ihn nicht.

**Eine Namensfalle, die beim Umsetzen zuschlägt, wenn man sie nicht kennt:** der Chip-Ton heißt `stahl`, die CSS-Klasse `.tonStahl`, die CSS-Variable aber `--auf-stahlton-text` — nicht `--auf-stahl-text`, weil `--auf-stahl` schon die neutrale Textfarbe ist. Der `Record<ChipTon, string>` in `Chip.tsx` ist die einzige Stelle, die beide verbindet.

**4. Abhängigkeitsreihenfolge.** Aufgabe 1 muss zuerst laufen (sie schafft `.modul`, auf das alles aufbaut). Aufgaben 2→3→4 sind eine Kette. Aufgabe 5 hängt an 3 (Tonnamen), Aufgabe 6 an 3 und 5. Aufgabe 7 hängt an 2, Aufgabe 8 an 3, 6 und 7. Aufgaben 9–12 hängen an allem davor und sind untereinander **unabhängig** — sie berühren sich nur in `page.tsx`, und zwar in drei getrennten Zeilen.

---

