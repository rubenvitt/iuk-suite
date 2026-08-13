# Modul `aufgaben` — Implementation Plan (ganzes Modul)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine benutzbare Anwendung zur Aufgabenverteilung und Zeitplanung für drei BuFDis — Auftraggeber stellen Aufgaben mit Erklärung und Priorität ein, die Koordination verteilt sie mit optionalem Zeitvorschlag, BuFDis gestalten ihren Zeitplan selbst, nachweispflichtige Fremdaufgaben brauchen eine Freigabe.

**Architecture:** Neues Modul unter `src/app/m/aufgaben/` mit eigener SQLite. Alle Seiten sind Server Components; ihr Inhalt liegt als **reine, exportierte Funktion** vor, die Daten und `jetzt` als Argumente nimmt (Muster: `verwaltungInhalt(db, jetzt)` in `lagerbuch`) — nur so ist er unter Vitest prüfbar. Zustandsänderungen laufen ausschließlich über Server-Actions, die die Übergangstabelle aus Spec §5.2 durchsetzen. Die Rolle des Betrachters kommt aus der Sitzung: `session.user.id` ist der Pocket-ID-`sub`, und `personen.sub` ordnet ihn einer Rolle zu.

**Tech Stack:** Next.js 16 (App Router, RSC) · Ant Design 6 · Drizzle + better-sqlite3 · Auth.js v5 · `react-icons/pi` (Phosphor) · CSS Modules · Vitest + Playwright · pnpm

**Spec:** `docs/superpowers/specs/2026-08-13-modul-aufgaben-design.md` — dort steht das **Warum**. Dieser Plan ist das **Wie**.

## Global Constraints

Jede gilt für **jede** Aufgabe. Keine davon findet `pnpm build`.

- **Kein Compound-Zugriff auf antd in einer Server Component.** Verboten: `Typography.*`, `Form.Item`, `Descriptions.Item`, `List.Item`, `Card.Meta`, `Collapse.Panel`, `Breadcrumb.Item`, `Input.Group`, `Input.TextArea`, `Space.Compact`, `Statistic.Countdown`, `Table.Summary`, `Tag.CheckableTag`, `Badge.Ribbon`, `Layout.Header`, `Grid.useBreakpoint`. Sicher: `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag`, `Row`, `Col`, `Empty`, `Button`.
- **`Typography` kommt im ganzen Modul nicht vor**, auch nicht in Client-Komponenten. Überschriften sind natives `<h1>`/`<h2>`/`<h3>` mit den Rollen aus `SCHRIFT`.
- **`@ant-design/icons` kommt im Modul nicht vor.** Der nackte Spezifizierer ergibt in einer Server Component HTTP 500 **beim Import**, nicht beim Rendern, und `"use client"` behebt das nicht, sondern macht es still. Zeichen kommen aus `react-icons/pi` — gemessen unbedenklich in RSC, Beleg: `src/app/m/lagerbuch/_ui/ikonen.tsx`.
- **Werte, die eine Server Component liest, liegen in einem Modul ohne `"use client"`** — hier `_lib/`. Eine Konstante aus einem Client-Modul kommt als Client-Referenz an; TypeScript ist zufrieden, `build` findet nichts, Vitest kann es strukturell nicht sehen.
- **Eigenes Markup nutzt `--auf-*`, nie `--ant-*`.** antd deklariert seine Variablen auf seiner Scope-Klasse, nicht auf `:root`; eigenes Markup außerhalb eines antd-Baums sieht sie nicht, und der Fehler ist still.
- **Dunkelmodus selektiert `:root[data-theme="dark"] .modul`**, nie `prefers-color-scheme`. Dort steht nie `auto`.
- **`colorError === colorPrimary === #c8000f`.** Kein `Alert type="error"`, kein rotes `Tag`, kein roter `Progress`, kein `type="primary" danger` auf einer Datenfläche. „Hoch" ist nicht Suite-Rot.
- **Bedienelemente setzen kein `size`.** `controlHeight` ist 56 und schon das richtige Touchmaß. Ausnahme: `size="small"` in Tabellenzeilen.
- **Ein Breakpoint: 768px.** In `max-width`-Abfragen **767.98px**. Umschaltung ist CSS, nie JavaScript — beide Ausprägungen rendern, CSS blendet eine aus.
- **Abstände aus `SPACE`** (`@/core/theme/tokens`): 4/8/12/16/24/32, für `Row gutter`, `margin*` und `padding` von Flächen. Dokumentierte Ausnahme: der Zwischenraum *innerhalb* einer Chipzeile ist 6px (Praxis in `lagerbuch/verwaltung/(arbeit)/page.tsx`). Kein Test darauf — ein Scan, der jede Zahl außerhalb `SPACE` verbietet, wäre strenger als der bestehende Code und würde abgeschaltet statt befolgt.
- **Schrift aus `SCHRIFT`** (`@/core/theme/schrift`): `titel` 24/600 · `unterTitel` 20/600 · `kicker` 12/600 versal · `zahl` 30/700 · `text` 14/400 · `neben` 12/400 · `mono` 12/400. **Keine neue Größe, kein eigener Adapter** — die Datei ist bereits das Ergebnis einer eingetretenen Verdopplung (`feedback/_ui/typo.ts` und `lagerbuch/_lib/schrift.ts` sind Adapter darüber).
- **`href` trägt die äußere Pfadform** (`/verteilen`, nicht `/m/aufgaben/verteilen`). Unter dem Host-Rewrite führt die äußere Form an die richtige Stelle.
- **Zeitspalten in der Datenbank sind `{ mode: "timestamp" }`** (Unix-**Sekunden**), niemals `timestamp_ms`. `m/qr/_db/schema.ts` macht es anders, und ein Copy-Paste von dort ist der wahrscheinlichste Weg in den Faktor-1000-Fehler.
- **Kalendertage sind ISO-Textspalten** (`"2026-08-13"`), keine Zeitstempel — sie sind Tage, keine Zeitpunkte, und ISO-Strings sind lexikografisch vergleichbar.
- **Server-Actions geben Feldfehler ZURÜCK, sie werfen sie nicht.** `FormState` plus `useActionState`; ein `throw` landet auf der technischen Fehlerseite und nimmt die Eingaben mit. **Zugriffsverletzungen sind kein Feldfehler** — die werfen weiter bzw. rufen `notFound()`.
- **Zugehörigkeit kommt serverseitig aus der Datenbank, nie aus einem URL-Parameter** (sonst IDOR). Kein Eintrag in `personen` → `notFound()`, nicht 403.
- **Bedeutung nie allein über Farbe.** Jeder Chip trägt Text. Fokus immer sichtbar, `outline` mit `outline-offset`, nie `outline: none` ohne Ersatz.

**Gates nach jeder Aufgabe:** `rtk pnpm typecheck` · `rtk pnpm lint` · `rtk pnpm vitest run`. Nach Aufgaben mit neuen Routen zusätzlich `rtk pnpm build` und ein echter Abruf per Playwright. Vor Abschluss der vollständige Lauf inkl. `rtk pnpm exec playwright test`.

## Gliederung

| Abschnitt | Aufgaben | Ergebnis |
|---|---|---|
| A Fundament | 1–4 | Modul antwortet, hat Datenbank, kennt seine Personen |
| B Bausteine | 5–7 | Farbvokabular, Chips, Kacheln, Wochenplan |
| C Lebenszyklus | 8–10 | Alle Übergänge als Server-Actions, Verlauf, Freigabe |
| D Zeitplan | 11–12 | Routinen, Einplanen, Verschieben |
| E Seiten | 13–16 | Neun Routen, drei Einstiege, Archiv |
| F Bildnachweis | 17–19 | `core/av`, Upload, Scan, Auslieferung |
| G Ziehen | 20 | Drag & Drop ab 768px |
| Abschluss | 21 | e2e über drei Viewports, Aufräumen |

**Vorbehalt aus Spec §12, hier wiederholt, weil er die Umsetzung bindet:** F und G stehen am Ende, F fasst ein laufendes Modul an. Wer sie erreicht, prüft ihre Annahmen gegen den dann geltenden Code statt sie für gesetzt zu nehmen.

---

## File Structure

**Bestehende Dateien, die geändert werden:**

| Datei | Änderung | Aufgabe |
|---|---|---|
| `src/core/registry.ts` | `ModuleDef` für `aufgaben` | 1, 16 |
| `src/core/shell/icons.ts` | `ScheduleOutlined` in `ICONS` | 1 |
| `.env.example` | drei dokumentierte Zeilen | 1 |
| `src/core/bootstrap.ts` | Zeile in `MODULE_MIGRATIONS`, Seed-Eintrag | 2, 4 |
| `Dockerfile` | `COPY`-Zeile für die Migrationen | 2 |
| `scripts/seed-lokal.ts` | Eintrag in `SEED_MODULE` | 4 |
| `src/app/m/files/_lib/av.ts` | ruft `core/av` statt eigener Protokollhälfte | 17 |

**Neue Dateien — `_db/`:**

| Datei | Verantwortung |
|---|---|
| `_db/schema.ts` | sechs Tabellen, die Wertelisten der Enums |
| `_db/client.ts` | `getDb()` über `getModuleDb("aufgaben", schema)` |
| `_db/drizzle.config.ts` | für `drizzle-kit generate` |
| `_db/migrations/` | erzeugte SQL plus `meta/` |
| `_db/queries.ts` | alle Lesepfade und Schreibprimitive |

**Neue Dateien — `_lib/` (kein `"use client"`):**

| Datei | Verantwortung |
|---|---|
| `_lib/anzeige.ts` | Beschriftungen, Chip-Töne, `vorschlagOffen`, `istUeberfaellig`, `tagesBudget`, Formatierung |
| `_lib/datum.ts` | `heuteIso`, `montagDerWoche`, `wochenTage`, `wochentagVon` — Zeitzone `Europe/Berlin` an genau einer Stelle |
| `_lib/tagesplan.ts` | die Ordnung eines Tages (Anker-Regel) |
| `_lib/lebenszyklus.ts` | die Übergangstabelle aus Spec §5.2 als reine Funktion |
| `_lib/zugang.ts` | `personFuerSession`, `istAktiv`, alle `darf*`-Prädikate |
| `_lib/formState.ts` | `FormState`, `FORM_START`, `feldWert`, `feldFehler` |
| `_lib/nav.ts` | Modulnavigation je Rolle |
| `_lib/seedLokal.ts` | lokale Demodaten (Pflicht laut `scripts/seed-lokal.test.ts`) |
| `_lib/ablage.ts` | Pfad und Ablage der Nachweisbilder (Aufgabe 18) |
| `_lib/scan.ts` | modul-eigene Scan-Warteschlange über `core/av` (Aufgabe 18) |

**Neue Dateien — `_ui/`:** `aufgaben.module.css` · `ikonen.tsx` · `Chip.tsx` · `Kachel.tsx` · `SeitenKopf.tsx` · `AufgabenListe.tsx` · `Wochenplan.tsx` · `EinstiegBufdi.tsx` · `EinstiegKoordination.tsx` · `EinstiegAuftrag.tsx` · `AufgabeFormular.tsx` (Client) · `EinplanenFormular.tsx` (Client) · `RangKnoepfe.tsx` (Client) · `FreigabeZone.tsx` (Client) · `NachweisFormular.tsx` (Client) · `RoutineFormular.tsx` (Client) · `ZiehBereich.tsx` (Client, Aufgabe 20)

**Neue Dateien — Routen:** `layout.tsx` · `page.tsx` · `actions.ts` · `neu/page.tsx` · `verteilen/page.tsx` · `freigaben/page.tsx` · `plan/[personId]/page.tsx` · `routinen/page.tsx` · `personen/page.tsx` · `archiv/page.tsx` · `a/[id]/page.tsx` · `a/[id]/nachweis/[nachweisId]/route.ts` (Aufgabe 19)

**Neue Dateien — `src/core/av/`:** `scanner.ts` plus `scanner.test.ts` (Aufgabe 17)

---

## Task 1: Registrierung und erreichbare Modulroute

Zuerst das Riskanteste: dass das Modul überhaupt antwortet. Drei der vier Suite-Fallen schlagen hier zu oder nie.

**Files:**
- Modify: `src/core/registry.ts`, `src/core/shell/icons.ts`, `.env.example`
- Create: `src/app/m/aufgaben/layout.tsx`, `src/app/m/aufgaben/page.tsx`, `src/app/m/aufgaben/_ui/aufgaben.module.css`, `src/app/m/aufgaben/registry.test.ts`, `e2e/aufgaben.spec.ts`

**Interfaces:**
- Produces: die CSS-Klasse `.modul` als Träger aller `--auf-*`-Variablen, im `layout.tsx` **außerhalb** der Shell. Jede spätere Aufgabe verlässt sich darauf, dass genau ein Element sie trägt und aller Modulinhalt darin liegt.

- [ ] **Step 1: Registry-Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canAccess, findModule, requiredGroupsFor } from "@/core/registry";
import { ICONS } from "@/core/shell/icons";

/**
 * `SuiteNav.test.tsx` prueft schon, dass KEIN Modul-Icon fehlt. Dieser Test
 * prueft, dass DIESES Modul so registriert ist, wie das Spec §3 es sagt — der
 * erste wird gruen, sobald irgendein Icon eingetragen ist.
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
   * Ein halbfertiges Modul gehoert nicht in die Navigation aller Nutzer.
   * Aufgabe 16 dreht den Wert und aendert DIESE Zeile mit — der Test ist die
   * Erinnerung daran, nicht ein Verbot.
   */
  it("ist bis Aufgabe 16 nicht im App-Switcher", () => {
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
Expected: FAIL — `expected null not to be null`.

- [ ] **Step 3: Registry-Eintrag ergänzen**

In `src/core/registry.ts`, in `MODULES` **vor** dem `alpha`-Eintrag:

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
  // eingeschlossen. Lokal unkritisch: AUTH_DEV_LOGIN nimmt Gruppen als freies
  // Feld an.
  //
  // adminGroups gatet die PERSONENVERWALTUNG. Die Rolle einer Person steht
  // dagegen in der Modultabelle `personen`, NICHT in einer Pocket-ID-Gruppe —
  // Begruendung in Spec §4 (BuFDis rotieren jaehrlich, und am JWT haengt ein
  // Verzugsfenster von einer Stunde).
  //
  // showInSwitcher: false, bis die Seiten stehen (Aufgabe 16 dreht den Wert);
  // `src/app/m/aufgaben/registry.test.ts` haelt beide Stufen fest.
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

In `src/core/shell/icons.ts` den Import-Block um `ScheduleOutlined` erweitern (alphabetisch nach `QrcodeOutlined`) und die Map um `ScheduleOutlined,` ergänzen.

- [ ] **Step 5: Tests laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/registry.test.ts src/core/shell`
Expected: PASS — auch `SuiteNav.test.tsx` bleibt grün.

- [ ] **Step 6: `.env.example` dokumentieren**

Am Ende von `.env.example`:

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
#
# SUITE_ADMIN_GROUP_AUFGABEN gatet die PERSONENVERWALTUNG. Welche Rolle eine
# Person im Modul hat, steht in der Modultabelle `personen` — nicht hier.
# SUITE_HOST_AUFGABEN=aufgaben.iuk-ue.de
# SUITE_ACCESS_GROUP_AUFGABEN=iuk-aufgaben-nutzer
# SUITE_ADMIN_GROUP_AUFGABEN=iuk-aufgaben-koordination
```

- [ ] **Step 7: CSS-Modul mit dem `.modul`-Träger anlegen**

Create `src/app/m/aufgaben/_ui/aufgaben.module.css`:

```css
/*
 * Modul-CSS von `aufgaben`. `.modul` ist der Traeger aller --auf-*-Variablen.
 * Aufgabe 5 baut die Datei vollstaendig aus; hier steht nur, was der erste
 * Abruf braucht.
 *
 * WARUM EIGENE VARIABLEN UND NICHT --ant-*: antd deklariert seine Variablen auf
 * SEINER Scope-Klasse, nicht an `:root`. Eigenes Markup ausserhalb eines
 * antd-Komponentenbaums sieht sie NICHT, und der Fehler ist still.
 *
 * WARUM :root[data-theme="dark"] UND NICHT prefers-color-scheme: der Umschalter
 * der Suite hat drei Zustaende. Auf die Medienabfrage zu selektieren bricht den
 * Fall „System dunkel, Umschalter hell".
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

- [ ] **Step 8: Layout und Platzhalter-Seite**

Create `src/app/m/aufgaben/layout.tsx`:

```tsx
import { getModule } from "@/core/registry";
import { Shell } from "@/core/shell/Shell";
import s from "./_ui/aufgaben.module.css";

/**
 * `.modul` liegt AUSSERHALB der Shell, wie `VerwaltungsRahmen` im Lagerbuch: so
 * tragen auch die Teile der Shell, die Modulinhalt umschliessen, die
 * --auf-*-Variablen. Innerhalb waere der Traeger ein Nachfahre der Kopfzeile,
 * und dort fehlten sie.
 *
 * Die rollenabhaengige Modulnavigation kommt in Aufgabe 13 dazu; bis dahin
 * traegt die Shell keine.
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
/** Platzhalter. Aufgabe 13 ersetzt ihn durch den rollenabhaengigen Einstieg. */
export default function AufgabenPage() {
  return <div data-testid="aufgaben-content">Aufgaben</div>;
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
 * WARUM DIESER ABRUF DER WICHTIGSTE TEST DES MODULS IST: die vier Suite-Fallen,
 * die diesen Plan bedrohen (antd-Compound in RSC, ein WERT aus einem
 * "use client"-Modul, @ant-design/icons in RSC, ein gestempeltes
 * data-theme="auto") bestehen `pnpm typecheck`, `pnpm lint`, `pnpm build` UND
 * `pnpm vitest run`. Nur ein echter Abruf zeigt den 500.
 *
 * Aufgabe 21 baut diese Datei zum vollen Durchlauf aus.
 */
test("Modulwurzel antwortet mit 200 und traegt die Suite-Kopfzeile", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: GRUPPE, callbackPath: "/" });
  await expect(page.getByTestId("aufgaben-content")).toBeVisible();
  await expect(page.getByTestId("suite-header")).toBeVisible();
});

test("ohne die Zugangsgruppe verweigert die Middleware den Zugang", async ({ page }) => {
  // Der Riegel liegt in der Middleware (core/routing.ts), nicht im Modul —
  // dasselbe Bild wie bei `alpha` in keystone.spec.ts. Deshalb 403 und nicht
  // 404: hier verschweigt die Suite nichts, sie verweigert.
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  const res = await page.goto(`http://${HOST}:3100/`);
  expect(res?.status()).toBe(403);
});
```

- [ ] **Step 10: Gates und echter Abruf**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
```
Dann:
```bash
rtk pnpm exec playwright test e2e/aufgaben.spec.ts
```
Expected: beide PASS. **Ein HTTP 500 hier hat seine Ursache in einer der vier Fallen aus den Global Constraints — nicht in der Registry.**

- [ ] **Step 11: Commit**

```bash
rtk git add src/core/registry.ts src/core/shell/icons.ts .env.example \
  src/app/m/aufgaben e2e/aufgaben.spec.ts && \
rtk git commit -m "feat(aufgaben): Modul registrieren und Route erreichbar machen

Registry-Eintrag, ICONS-Zeile (ohne sie traegt das Modul still das
Portal-Icon), .env.example-Dokumentation mit dem Hinweis auf die
unsymmetrische Semantik von SUITE_HOST_* gegen SUITE_ACCESS_GROUP_*,
Layout mit dem .modul-Traeger.

Der e2e-Abruf ist hier der eigentliche Test: die vier Suite-Fallen, die
dieses Modul bedrohen, bestehen typecheck, lint, build und Vitest."
```

---

## Task 2: Datenbank — Schema, Migration, das Dreieck

**Files:**
- Create: `src/app/m/aufgaben/_db/schema.ts`, `_db/client.ts`, `_db/drizzle.config.ts`, `_db/migrations/` (erzeugt), `_db/migrations.test.ts`
- Modify: `src/core/bootstrap.ts` (`MODULE_MIGRATIONS`), `Dockerfile`, `package.json` (Skript `db:generate:aufgaben`)

**Interfaces:**
- Produces:
  - `_db/schema.ts` exportiert `newId`, die Wertelisten `ROLLEN`, `STATUS_WERTE`, `PRIORITAETEN`, `NACHWEIS_ARTEN`, `SCAN_STATUS`, die Tabellen `personen`, `aufgaben`, `routinen`, `nachweise`, `dateien`, `verlauf`, und die Zeilentypen `PersonRow`, `AufgabeRow`, `RoutineRow`, `NachweisRow`, `DateiRow`, `VerlaufRow` (jeweils `typeof x.$inferSelect`).
  - `_db/client.ts` exportiert `getDb()` und `type DB = ReturnType<typeof getDb>`.
  - **Alle Kalendertage sind `text` im Format `YYYY-MM-DD`; alle Zeitpunkte sind `integer` mit `{ mode: "timestamp" }` (Sekunden).**

- [ ] **Step 1: Schema schreiben**

Create `src/app/m/aufgaben/_db/schema.ts`:

```ts
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

/*
 * Das Schema des Moduls `aufgaben` — sechs Tabellen (Spec §6).
 *
 * KEIN "use client", KEIN Icon-Import (Fallen 6 und 7).
 *
 * ZEITPUNKTE SIND UNIX-SEKUNDEN: jede Zeitspalte traegt `{ mode: "timestamp" }`,
 * NIEMALS `timestamp_ms`. `m/qr/_db/schema.ts` macht es anders, und ein
 * Copy-Paste von dort ist der wahrscheinlichste Weg in den Faktor-1000-Fehler.
 *
 * KALENDERTAGE SIND TEXT (`YYYY-MM-DD`), keine Zeitstempel. Eine Frist, ein
 * Plantag und eine Dienstzeit sind TAGE, keine Zeitpunkte: als Zeitstempel
 * haengt ihre Bedeutung an der Zeitzone des Lesers, und „faellig am 13." wuerde
 * fuer manche am 12. abends beginnen. ISO-Strings sind ausserdem lexikografisch
 * vergleichbar, weshalb `faellig_am < heute` ohne Datums-Parsen funktioniert.
 *
 * UHRZEITEN SIND TEXT (`HH:MM`). Sie gehoeren zu einem Tag, der schon in einer
 * eigenen Spalte steht; als Zeitstempel waere die Information doppelt und
 * koennte auseinanderlaufen.
 */

export const newId = () => nanoid();

/** Die drei Rollen (Spec §4). Werte ohne Umlaute — sie stehen in der Datenbank. */
export const ROLLEN = ["koordination", "auftrag", "bufdi"] as const;

/**
 * Die sechs Zustaende (Spec §5). Der siebte („Zeitvorschlag offen") wird
 * ABGELEITET und steht bewusst nicht hier — er wuerde jeden Filter und jede
 * Zaehlung um einen Fall erweitern, ohne mehr auszusagen.
 */
export const STATUS_WERTE = [
  "eingegangen",
  "verteilt",
  "in_arbeit",
  "freigabe_offen",
  "abgeschlossen",
  "zurueckgewiesen",
] as const;

export const PRIORITAETEN = ["hoch", "mittel", "niedrig"] as const;
export const NACHWEIS_ARTEN = ["text", "bild"] as const;

/**
 * Der Scan-Zustand einer Nachweisdatei. `sauber` ist der EINZIGE Wert, der
 * ausliefert — dieselbe Linie wie `istFreigegeben` im Modul `files`, und
 * `offen` gibt ausdruecklich nicht frei.
 */
export const SCAN_STATUS = ["offen", "sauber", "befund", "fehler"] as const;

export const personen = sqliteTable(
  "personen",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    /**
     * Der Pocket-ID-`sub` — also `session.user.id` (`core/auth/config.ts`
     * setzt `session.user.id = token.sub`). Unter dem Dev-Login ist das
     * `dev:<email>`, und genau darueber wechselt man lokal die Rolle: eine
     * andere Anmeldeadresse ist eine andere Person. Ein Demo-Umschalter waere
     * eine zweite Strecke neben dieser und haette den Echtbetrieb erreichen
     * koennen.
     */
    sub: text("sub").notNull(),
    name: text("name").notNull(),
    initialen: text("initialen").notNull(),
    rolle: text("rolle", { enum: ROLLEN }).notNull(),
    /** 468 = 7,8 Std. — die Vorgabe fuer einen BuFDi mit 39-Stunden-Woche. */
    sollMinutenTag: integer("soll_minuten_tag").notNull().default(468),
    aktivVon: text("aktiv_von").notNull(),
    /**
     * EINSCHLIESSENDES Ende, oder null fuer „unbefristet". Am Enddatum selbst
     * ist die Person noch aktiv — sonst kann jemand an seinem letzten
     * Diensttag nichts mehr abgeben.
     *
     * DIESE SPALTE IST DER GRUND, WARUM DER JAHRESWECHSEL KEINE LOESCHAKTION
     * IST: eine ausgeschiedene Person verschwindet aus Verteillisten und
     * Plan-Navigation, ihre Aufgaben, Nachweise und Verlaufszeilen bleiben
     * lesbar. Und die Dokumentation des vergangenen Jahres ist genau das, was
     * das Modul herstellen soll.
     */
    aktivBis: text("aktiv_bis"),
    erstelltAm: integer("erstellt_am", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("personen_sub_idx").on(t.sub)],
);

export const aufgaben = sqliteTable(
  "aufgaben",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    titel: text("titel").notNull(),
    beschreibung: text("beschreibung").notNull(),
    prioritaet: text("prioritaet", { enum: PRIORITAETEN }).notNull(),
    erstellerId: text("ersteller_id")
      .notNull()
      .references(() => personen.id),
    zugewiesenAn: text("zugewiesen_an").references(() => personen.id),
    status: text("status", { enum: STATUS_WERTE }).notNull(),
    faelligAm: text("faellig_am").notNull(),
    faelligUhrzeit: text("faellig_uhrzeit"),
    dauerMinuten: integer("dauer_minuten").notNull(),
    nachweisPflicht: integer("nachweis_pflicht", { mode: "boolean" }).notNull().default(false),
    nachweisArt: text("nachweis_art", { enum: NACHWEIS_ARTEN }).notNull().default("text"),
    /** Null genau dann, wenn `istSelbst` — eine Selbstaufgabe hat keinen Pruefer. */
    prueferId: text("pruefer_id").references(() => personen.id),
    /**
     * Fachlich folgt das aus `ersteller_id = zugewiesen_an`, wird aber
     * GESPEICHERT: eine spaetere Umverteilung wuerde den Charakter der Aufgabe
     * sonst still aendern — aus einer freigabefreien Selbstaufgabe wuerde
     * rueckwirkend eine freigabepflichtige Fremdaufgabe.
     */
    istSelbst: integer("ist_selbst", { mode: "boolean" }).notNull().default(false),
    /** Gesetzt = der BuFDi hat sie in einen Tag gelegt. */
    planDatum: text("plan_datum"),
    planUhrzeit: text("plan_uhrzeit"),
    /** Reihenfolge innerhalb des Tages. Ohne `plan_datum` bedeutungslos. */
    planRang: integer("plan_rang").notNull().default(0),
    /**
     * Der Zeitvorschlag der Koordination (Spec §5.1). Er BLEIBT stehen, wenn der
     * BuFDi einplant — der Verlauf soll belegen koennen, ob angenommen oder
     * abgewichen wurde. Deshalb ist „Vorschlag offen" eine Ableitung ueber
     * `plan_datum IS NULL` und kein Status.
     */
    vorschlagDatum: text("vorschlag_datum"),
    vorschlagUhrzeit: text("vorschlag_uhrzeit"),
    erstelltAm: integer("erstellt_am", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // Die Zeitplan-Abfrage: „was liegt bei dieser Person an diesem Tag".
    index("aufgaben_plan_idx").on(t.zugewiesenAn, t.planDatum),
    // Die Arbeitsvorratslisten (Posteingang, Freigabe-Warteschlange).
    index("aufgaben_status_idx").on(t.status),
    // Die Ueberfaelligkeitsliste.
    index("aufgaben_faellig_idx").on(t.faelligAm),
  ],
);

/**
 * EINE ROUTINE IST KEIN AUFGABENDATENSATZ. Sie ist ein wiederkehrender
 * Zeitblock, der beim Lesen in den Tag eingerechnet wird und Budget belegt —
 * ohne Status, ohne Nachweis, ohne Freigabe. Wer eine Routine dokumentieren
 * will, legt dafuer eine eigene Aufgabe an.
 *
 * Andernfalls entstehen bei fuenf Routinen × drei Personen ueber ein Dienstjahr
 * rund 3.000 Datensaetze, die niemand liest, und jede Liste im Modul braucht
 * einen Filter dagegen.
 */
export const routinen = sqliteTable(
  "routinen",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    personId: text("person_id")
      .notNull()
      .references(() => personen.id),
    titel: text("titel").notNull(),
    /**
     * Bitmaske ueber Mo–Fr: Bit 0 = Montag … Bit 4 = Freitag. Eine Maske statt
     * fuenf Spalten oder einer Nebentabelle, weil die Frage immer „gilt sie an
     * Tag n" lautet und nie „welche Routinen gelten am Montag" — und weil eine
     * Zeichenliste („0,2,4") in SQL nicht pruefbar ist.
     */
    wochentage: integer("wochentage").notNull(),
    uhrzeit: text("uhrzeit"),
    dauerMinuten: integer("dauer_minuten").notNull(),
    aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
    erstelltAm: integer("erstellt_am", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("routinen_person_idx").on(t.personId)],
);

export const nachweise = sqliteTable(
  "nachweise",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    aufgabeId: text("aufgabe_id")
      .notNull()
      .references(() => aufgaben.id, { onDelete: "cascade" }),
    art: text("art", { enum: NACHWEIS_ARTEN }).notNull(),
    text: text("text"),
    dateiId: text("datei_id").references(() => dateien.id),
    erstelltVon: text("erstellt_von")
      .notNull()
      .references(() => personen.id),
    erstelltAm: integer("erstellt_am", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("nachweise_aufgabe_idx").on(t.aufgabeId)],
);

export const dateien = sqliteTable("dateien", {
  id: text("id").primaryKey().$defaultFn(newId),
  aufgabeId: text("aufgabe_id")
    .notNull()
    .references(() => aufgaben.id, { onDelete: "cascade" }),
  dateiname: text("dateiname").notNull(),
  mime: text("mime").notNull(),
  groesse: integer("groesse").notNull(),
  /**
   * `offen` ist die Vorbelegung und gibt NICHT frei. Fail-closed: eine Datei,
   * die noch nicht geprueft ist, wird nicht ausgeliefert. Das ist dieselbe
   * Linie wie `istFreigegeben` im Modul `files`, wo `unscanned` ebenfalls
   * gesperrt bleibt — gerade weil es der Fall ist, den noch niemand geprueft hat.
   */
  scanStatus: text("scan_status", { enum: SCAN_STATUS }).notNull().default("offen"),
  scanGeprueftAm: integer("scan_geprueft_am", { mode: "timestamp" }),
  erstelltAm: integer("erstellt_am", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * DER VERLAUF IST EINE TABELLE, KEIN TEXTFELD. Jeder Uebergang schreibt eine
 * Zeile mit Akteur, Zeitstempel und Ereignis; eine Vertretungsfreigabe schreibt
 * sie als solche. Das IST die Leistungsdokumentation, die der gesamte
 * Freigabemechanismus herstellen soll — ohne sie hat man am Ende des
 * Dienstjahres sechs Haekchen und keine Geschichte.
 */
export const verlauf = sqliteTable(
  "verlauf",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    aufgabeId: text("aufgabe_id")
      .notNull()
      .references(() => aufgaben.id, { onDelete: "cascade" }),
    ereignis: text("ereignis").notNull(),
    akteurId: text("akteur_id")
      .notNull()
      .references(() => personen.id),
    notiz: text("notiz"),
    ts: integer("ts", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("verlauf_aufgabe_idx").on(t.aufgabeId, t.ts)],
);

export type PersonRow = typeof personen.$inferSelect;
export type AufgabeRow = typeof aufgaben.$inferSelect;
export type RoutineRow = typeof routinen.$inferSelect;
export type NachweisRow = typeof nachweise.$inferSelect;
export type DateiRow = typeof dateien.$inferSelect;
export type VerlaufRow = typeof verlauf.$inferSelect;

export type Rolle = (typeof ROLLEN)[number];
export type Status = (typeof STATUS_WERTE)[number];
export type Prioritaet = (typeof PRIORITAETEN)[number];
export type NachweisArt = (typeof NACHWEIS_ARTEN)[number];
export type ScanStatus = (typeof SCAN_STATUS)[number];
```

- [ ] **Step 2: Client und drizzle-Konfiguration**

Create `src/app/m/aufgaben/_db/client.ts`:

```ts
import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("aufgaben", schema);
export type DB = ReturnType<typeof getDb>;
```

Create `src/app/m/aufgaben/_db/drizzle.config.ts`:

```ts
import type { Config } from "drizzle-kit";

// Pfade repo-root-relativ (drizzle-kit loest gegen cwd auf), nicht relativ zu dieser Datei.
export default {
  schema: "./src/app/m/aufgaben/_db/schema.ts",
  out: "./src/app/m/aufgaben/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/aufgaben.db" },
} satisfies Config;
```

- [ ] **Step 3: Migration erzeugen**

Zuerst prüfen, wie die bestehenden Module ihre Migrationen erzeugen:
```bash
rtk grep -n "drizzle-kit" package.json
```
Dann mit derselben Form für `aufgaben` erzeugen — ein Skript in `package.json` ergänzen, falls die anderen eines haben, sonst direkt:
```bash
rtk pnpm exec drizzle-kit generate --config src/app/m/aufgaben/_db/drizzle.config.ts
```
Expected: eine Datei `_db/migrations/0000_*.sql` plus `meta/_journal.json` und `meta/0000_snapshot.json`.

**Die erzeugte SQL-Datei anschließend lesen** und gegen das Schema prüfen: alle sechs Tabellen, `personen_sub_idx` als `UNIQUE`, die vier weiteren Indizes, und die Fremdschlüssel mit `ON DELETE cascade` genau bei `nachweise`, `dateien` und `verlauf`.

- [ ] **Step 4: Das Dreieck vervollständigen**

**Alle drei Einträge, sonst läuft es lokal und bricht im Container.**

In `src/core/bootstrap.ts`, in `MODULE_MIGRATIONS` nach der `lagerbuch`-Zeile:

```ts
  { key: "aufgaben", migrationsFolder: "src/app/m/aufgaben/_db/migrations" },
```

In `Dockerfile`, nach der `lagerbuch`-`COPY`-Zeile (heute Zeile 55):

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/aufgaben/_db/migrations ./src/app/m/aufgaben/_db/migrations
```

- [ ] **Step 5: Migrationstest schreiben**

Create `src/app/m/aufgaben/_db/migrations.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

import { MODULE_MIGRATIONS } from "@/core/bootstrap";

const ORDNER = "src/app/m/aufgaben/_db/migrations";

/** Eine frische Datenbank im Speicher, migriert wie beim Boot. */
function frisch() {
  const sqlite = new Database(":memory:");
  migrate(drizzle(sqlite), { migrationsFolder: ORDNER });
  return sqlite;
}

describe("Das Dreieck", () => {
  /*
   * Ein Modul mit eigener Datenbank braucht DREI zusammenpassende Eintraege:
   * das Migrationsverzeichnis, die Zeile in MODULE_MIGRATIONS und die
   * COPY-Zeile im Dockerfile. Fehlt die dritte, laeuft es lokal und bricht im
   * Container — und zwar erst beim Deployment, wenn niemand mehr hinsieht.
   */
  it("nennt aufgaben in MODULE_MIGRATIONS", () => {
    expect(MODULE_MIGRATIONS.some((m) => m.key === "aufgaben" && m.migrationsFolder === ORDNER)).toBe(true);
  });

  it("kopiert die Migrationen im Dockerfile", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    expect(dockerfile).toContain("src/app/m/aufgaben/_db/migrations");
  });

  /*
   * Die Gegenprobe zum Dockerfile-Test: er prueft nur, dass der Pfad VORKOMMT.
   * Diese Zeile stellt sicher, dass er in einer COPY-Zeile vorkommt und nicht
   * bloss in einem Kommentar.
   */
  it("kopiert sie in einer COPY-Zeile, nicht in einem Kommentar", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    const zeile = dockerfile
      .split("\n")
      .find((z) => z.includes("src/app/m/aufgaben/_db/migrations"));
    expect(zeile?.trimStart().startsWith("COPY")).toBe(true);
  });
});

describe("Migration 0000", () => {
  it("legt alle sechs Tabellen an", () => {
    const sqlite = frisch();
    const tabellen = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((z) => (z as { name: string }).name);
    for (const t of ["personen", "aufgaben", "routinen", "nachweise", "dateien", "verlauf"]) {
      expect(tabellen, t).toContain(t);
    }
    sqlite.close();
  });

  it("macht personen.sub eindeutig", () => {
    const sqlite = frisch();
    const einfuegen = sqlite.prepare(
      `INSERT INTO personen (id, sub, name, initialen, rolle, soll_minuten_tag, aktiv_von, erstellt_am)
       VALUES (?, ?, 'X', 'XX', 'bufdi', 468, '2026-08-01', 1)`,
    );
    einfuegen.run("p1", "dev:a@b");
    expect(() => einfuegen.run("p2", "dev:a@b")).toThrow(/UNIQUE/i);
    sqlite.close();
  });

  /*
   * ZEITPUNKTE SIND SEKUNDEN, NICHT MILLISEKUNDEN. Der Fehler waere ueber die
   * Drizzle-Schicht unsichtbar (beide Richtungen rechnen dieselbe Umrechnung),
   * waehrend jeder Zeitstempel um Jahrtausende falsch steht. Deshalb prueft
   * dieser Test den ROHEN Spaltenwert auf seine Stellenzahl — genau wie
   * `lagerbuch/_db/migrations.test.ts`.
   */
  it("speichert Zeitpunkte als Sekunden (zehn Stellen), nicht als Millisekunden", async () => {
    const sqlite = frisch();
    const db = drizzle(sqlite);
    const { personen } = await import("./schema");
    db.insert(personen)
      .values({
        id: "p1", sub: "dev:a@b", name: "X", initialen: "XX",
        rolle: "bufdi", aktivVon: "2026-08-01",
      })
      .run();
    const roh = sqlite.prepare("SELECT erstellt_am FROM personen WHERE id='p1'").get() as {
      erstellt_am: number;
    };
    expect(String(roh.erstellt_am)).toMatch(/^\d{10}$/);
    sqlite.close();
  });

  it("loescht Verlauf, Nachweise und Dateien mit der Aufgabe", () => {
    const sqlite = frisch();
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite
      .prepare(
        `INSERT INTO personen (id, sub, name, initialen, rolle, soll_minuten_tag, aktiv_von, erstellt_am)
         VALUES ('p1','dev:a@b','X','XX','bufdi',468,'2026-08-01',1)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO aufgaben (id, titel, beschreibung, prioritaet, ersteller_id, status,
           faellig_am, dauer_minuten, nachweis_pflicht, nachweis_art, ist_selbst, plan_rang,
           erstellt_am, aktualisiert_am)
         VALUES ('a1','T','B','mittel','p1','eingegangen','2026-08-20',60,0,'text',0,0,1,1)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO verlauf (id, aufgabe_id, ereignis, akteur_id, ts)
         VALUES ('v1','a1','eingestellt','p1',1)`,
      )
      .run();
    sqlite.prepare("DELETE FROM aufgaben WHERE id='a1'").run();
    const rest = sqlite.prepare("SELECT COUNT(*) AS n FROM verlauf").get() as { n: number };
    expect(rest.n).toBe(0);
    sqlite.close();
  });

  /*
   * Fremdschluessel auf `personen` haben ABSICHTLICH kein `ON DELETE cascade`:
   * eine Person wird nicht geloescht, sondern ueber `aktiv_bis` beendet. Ein
   * Cascade hier hiesse, dass ein versehentliches DELETE die Geschichte eines
   * ganzen Dienstjahres mitnimmt.
   */
  it("kaskadiert NICHT von personen aus", () => {
    const sql = readFileSync(join(process.cwd(), ORDNER, "0000_" + naechsteDatei()), "utf8");
    const personenVerweise = sql
      .split("\n")
      .filter((z) => /REFERENCES\s+`?personen`?/i.test(z));
    expect(personenVerweise.length).toBeGreaterThan(0);
    for (const z of personenVerweise) expect(z).not.toMatch(/ON DELETE cascade/i);
  });
});

/** Der erzeugte Dateiname traegt einen Zufallsnamen — er wird gesucht, nicht geraten. */
function naechsteDatei(): string {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const datei = readdirSync(join(process.cwd(), ORDNER)).find((d) => d.startsWith("0000_"));
  if (!datei) throw new Error("Migration 0000 nicht gefunden");
  return datei.slice("0000_".length);
}
```

- [ ] **Step 6: Tests laufen lassen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_db/migrations.test.ts`
Expected: PASS. **Schlägt „kaskadiert NICHT von personen aus" fehl**, hat drizzle-kit die Verweise anders erzeugt als erwartet — dann die SQL lesen und entweder das Schema anpassen oder den Test auf die tatsächliche Form richten, aber nicht die Zusicherung streichen.

- [ ] **Step 7: Gates und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build && \
rtk git add src/app/m/aufgaben src/core/bootstrap.ts Dockerfile package.json && \
rtk git commit -m "feat(aufgaben): Datenbank, Migration und das Dreieck

Sechs Tabellen. Zeitpunkte sind Unix-SEKUNDEN — der Test prueft den ROHEN
Spaltenwert auf zehn Stellen, weil der Faktor-1000-Fehler ueber die
Drizzle-Schicht unsichtbar waere (beide Richtungen rechnen dieselbe
Umrechnung) und dabei jeder Zeitstempel um Jahrtausende falsch steht.

Kalendertage sind ISO-Text und keine Zeitstempel: eine Frist ist ein TAG,
und als Zeitstempel haengt ihre Bedeutung an der Zeitzone des Lesers.

Das Dreieck ist vollstaendig und getestet — Migrationsverzeichnis, Zeile in
MODULE_MIGRATIONS, COPY im Dockerfile. Fehlt die dritte, laeuft es lokal
und bricht im Container, und zwar erst beim Deployment.

Fremdschluessel auf \`personen\` kaskadieren ABSICHTLICH nicht: eine Person
wird ueber \`aktiv_bis\` beendet, nicht geloescht."
```

---

## Task 3: Datum, Ableitungen, Anzeigetexte

Die Rechenkerne. Der einzige Ort, an dem „Zeitvorschlag offen", „überfällig", das Tagesbudget und die Zeitzone definiert werden.

**Files:** Create `_lib/datum.ts`, `_lib/datum.test.ts`, `_lib/anzeige.ts`, `_lib/anzeige.test.ts` (alle unter `src/app/m/aufgaben/`)

**Interfaces:**
- Consumes: die Typen aus `_db/schema.ts`
- Produces:
  - `_lib/datum.ts`: `ZONE = "Europe/Berlin"` · `isoTag(zeitpunkt: Date): string` · `wochentagVon(iso: string): number | null` · `montagDerWoche(iso: string): string` · `wochenTage(montagIso: string): string[]` · `fmtTagKurz(iso: string): string` · `minutenVon(uhrzeit: string): number`
  - `_lib/anzeige.ts`: `type ChipTon = "grau" | "stahl" | "ocker" | "ok" | "achtung"` · `type PrioritaetForm = "gefuellt" | "kontur" | "text"` · `STATUS_TEXT` · `STATUS_TON` · `PRIORITAET_TEXT` · `PRIORITAET_FORM` · `WOCHENTAG_BIT` · `vorschlagOffen(a)` · `istUeberfaellig(a, heute)` · `routineAmTag(r, wochentag)` · `interface Budget` · `tagesBudget(aufgaben, routinen, person, datum)` · `fmtDauer(min)` · `fmtStunden(min)`

- [ ] **Step 1: Datums-Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_lib/datum.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fmtTagKurz, isoTag, minutenVon, montagDerWoche, wochenTage, wochentagVon } from "./datum";

describe("isoTag", () => {
  /*
   * DIE ZONE IST `Europe/Berlin`, UND ZWAR HIER UND NUR HIER. In UTC gerechnet
   * liefert `isoTag` zwischen 00:00 und 02:00 deutscher Sommerzeit den VORTAG —
   * und davon haengen die Ueberfaelligkeits-Kachel und die „heute"-Markierung
   * ab. Der Fehler ist still: er trifft nur nachts, tagsueber stimmt alles.
   */
  it("rechnet in Europe/Berlin, nicht in UTC", () => {
    // 2026-08-13 00:30 Berliner Sommerzeit = 2026-08-12 22:30 UTC
    expect(isoTag(new Date("2026-08-12T22:30:00Z"))).toBe("2026-08-13");
  });

  it("liefert das ISO-Tagesformat", () => {
    expect(isoTag(new Date("2026-08-13T10:00:00Z"))).toBe("2026-08-13");
    expect(isoTag(new Date("2026-01-05T10:00:00Z"))).toBe("2026-01-05");
  });

  it("rechnet auch in der Winterzeit richtig", () => {
    // 2026-01-05 00:30 MEZ = 2026-01-04 23:30 UTC
    expect(isoTag(new Date("2026-01-04T23:30:00Z"))).toBe("2026-01-05");
  });
});

describe("wochentagVon", () => {
  it("bildet Montag auf 0 und Freitag auf 4 ab", () => {
    expect(wochentagVon("2026-08-10")).toBe(0);
    expect(wochentagVon("2026-08-14")).toBe(4);
  });

  /*
   * Samstag und Sonntag ergeben null, nicht 5 und 6. Das Modul kennt eine
   * Fuenftagewoche; eine 5 waere ein Index neben das Wochengitter, und ein
   * Zugriff darauf `undefined` — still leer statt laut falsch.
   */
  it("gibt am Wochenende null", () => {
    expect(wochentagVon("2026-08-15")).toBeNull();
    expect(wochentagVon("2026-08-16")).toBeNull();
  });
});

describe("montagDerWoche", () => {
  it("findet den Montag derselben Woche", () => {
    expect(montagDerWoche("2026-08-13")).toBe("2026-08-10");
    expect(montagDerWoche("2026-08-10")).toBe("2026-08-10");
  });

  /*
   * DER FALL, DER EINE NAIVE FASSUNG KIPPT: `getUTCDay()` gibt am Sonntag 0, und
   * `tag - 0 + 1` landet auf dem Montag der FOLGENDEN Woche. Fachlich gehoert
   * der Sonntag zur Woche, die am Montag davor begann.
   */
  it("rechnet am Sonntag rueckwaerts, nicht vorwaerts", () => {
    expect(montagDerWoche("2026-08-16")).toBe("2026-08-10");
  });

  it("laeuft ueber einen Monatswechsel", () => {
    expect(montagDerWoche("2026-09-02")).toBe("2026-08-31");
  });
});

describe("wochenTage", () => {
  it("gibt Montag bis Freitag", () => {
    expect(wochenTage("2026-08-10")).toEqual([
      "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14",
    ]);
  });

  it("laeuft ueber einen Monatswechsel", () => {
    expect(wochenTage("2026-08-31")).toEqual([
      "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
    ]);
  });
});

describe("fmtTagKurz", () => {
  it("schreibt Wochentag plus Datum, nie ISO", () => {
    expect(fmtTagKurz("2026-08-13")).toBe("Do, 13.08.");
    expect(fmtTagKurz("2026-08-10")).toBe("Mo, 10.08.");
  });
});

describe("minutenVon", () => {
  it("rechnet HH:MM in Minuten seit Mitternacht", () => {
    expect(minutenVon("00:00")).toBe(0);
    expect(minutenVon("08:00")).toBe(480);
    expect(minutenVon("11:30")).toBe(690);
    expect(minutenVon("23:59")).toBe(1439);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/datum.test.ts`
Expected: FAIL — `Failed to resolve import "./datum"`.

- [ ] **Step 3: `datum.ts` schreiben**

Create `src/app/m/aufgaben/_lib/datum.ts`:

```ts
/*
 * ZEIT UND KALENDER — die eine Stelle. KEIN "use client".
 *
 * DIE ZONE STEHT GENAU HIER. In UTC gerechnet liefert `isoTag` zwischen 00:00
 * und 02:00 deutscher Sommerzeit den VORTAG, und davon haengen die
 * Ueberfaelligkeitsrechnung und die „heute"-Markierung im Wochenplan ab.
 *
 * DIE TAGESARITHMETIK RECHNET DAGEGEN IN UTC UM 12:00 — bewusst.
 * `montagDerWoche` und `wochenTage` verschieben KALENDERTAGE, und ein
 * Tageswechsel um Mittag kreuzt keine Sommerzeitgrenze. In Ortszeit muesste jede
 * Verschiebung die Umstellungsnacht behandeln, in der ein Tag 23 oder 25 Stunden
 * hat.
 */

export const ZONE = "Europe/Berlin";

/** `en-CA` ist das Gebietsschema mit dem Format `YYYY-MM-DD` — kein eigener Zusammenbau. */
const ISO_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Der Kalendertag, an dem dieser Zeitpunkt in Deutschland liegt. */
export function isoTag(zeitpunkt: Date): string {
  return ISO_FORMAT.format(zeitpunkt);
}

/** 12:00 UTC des genannten Tages — der sommerzeitfeste Anker fuer Tagesarithmetik. */
function anker(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function ausAnker(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 0 = Montag … 4 = Freitag; Samstag und Sonntag ergeben `null` — das Modul kennt
 * eine Fuenftagewoche, und eine 5 waere ein Index neben das Wochengitter.
 */
export function wochentagVon(iso: string): number | null {
  const tag = anker(iso).getUTCDay();
  return tag >= 1 && tag <= 5 ? tag - 1 : null;
}

/**
 * Der Montag der Woche, in der dieser Tag liegt.
 *
 * `getUTCDay()` gibt am Sonntag 0. Ein naives `tag - wochentag + 1` landet dann
 * auf dem Montag der FOLGENDEN Woche — fachlich gehoert der Sonntag zur Woche,
 * die am Montag davor begann.
 */
export function montagDerWoche(iso: string): string {
  const d = anker(iso);
  const wochentag = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (wochentag === 0 ? -6 : 1 - wochentag));
  return ausAnker(d);
}

/** Montag bis Freitag der Woche, die mit `montagIso` beginnt. */
export function wochenTage(montagIso: string): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = anker(montagIso);
    d.setUTCDate(d.getUTCDate() + i);
    return ausAnker(d);
  });
}

const WOCHENTAGE_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

/**
 * „Do, 13.08." — nie ISO. Der Wochentag ist bei einer Wochenplanung die
 * eigentliche Information.
 *
 * Eigene Tabelle statt `Intl`: dessen Kurzform traegt einen Punkt („Do.") und
 * die Abkuerzungen sind zwischen ICU-Fassungen nicht stabil — auf einem
 * Linux-Runner also moeglicherweise andere als auf der Entwicklermaschine.
 */
export function fmtTagKurz(iso: string): string {
  const d = anker(iso);
  const tag = String(d.getUTCDate()).padStart(2, "0");
  const monat = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${WOCHENTAGE_KURZ[d.getUTCDay()]}, ${tag}.${monat}.`;
}

export function minutenVon(uhrzeit: string): number {
  const [h, m] = uhrzeit.split(":").map(Number);
  return h * 60 + m;
}
```

- [ ] **Step 4: Test laufen lassen** — `rtk pnpm vitest run src/app/m/aufgaben/_lib/datum.test.ts` → PASS

- [ ] **Step 5: Anzeige-Test schreiben (schlägt fehl)**

Create `src/app/m/aufgaben/_lib/anzeige.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PRIORITAETEN,
  STATUS_WERTE,
  type AufgabeRow,
  type PersonRow,
  type RoutineRow,
} from "../_db/schema";
import {
  PRIORITAET_FORM,
  PRIORITAET_TEXT,
  STATUS_TEXT,
  STATUS_TON,
  WOCHENTAG_BIT,
  fmtDauer,
  fmtStunden,
  istUeberfaellig,
  routineAmTag,
  tagesBudget,
  vorschlagOffen,
} from "./anzeige";

const AUFGABE: AufgabeRow = {
  id: "x", titel: "T", beschreibung: "B", prioritaet: "mittel",
  erstellerId: "schulle", zugewiesenAn: "lea", status: "verteilt",
  faelligAm: "2026-08-14", faelligUhrzeit: null, dauerMinuten: 60,
  nachweisPflicht: false, nachweisArt: "text", prueferId: "schulle",
  istSelbst: false, planDatum: null, planUhrzeit: null, planRang: 0,
  vorschlagDatum: null, vorschlagUhrzeit: null,
  erstelltAm: new Date(0), aktualisiertAm: new Date(0),
};

const LEA: PersonRow = {
  id: "lea", sub: "dev:lea@localtest.me", name: "Lea", initialen: "LE",
  rolle: "bufdi", sollMinutenTag: 468, aktivVon: "2026-08-01", aktivBis: null,
  erstelltAm: new Date(0),
};

const routine = (over: Partial<RoutineRow>): RoutineRow => ({
  id: "r", personId: "lea", titel: "R", wochentage: 0b11111,
  uhrzeit: "08:00", dauerMinuten: 45, aktiv: true, erstelltAm: new Date(0),
  ...over,
});

describe("Beschriftungen sind vollstaendig", () => {
  /*
   * ERSCHOEPFEND, NICHT STICHPROBENWEISE: ein fehlender Eintrag ergaebe
   * `undefined` als Beschriftung (im Browser eine leere Stelle) und `undefined`
   * als CSS-Klasse — der Chip bekaeme Polster und Rundung, aber KEINE FARBE.
   */
  it("hat fuer jeden Status Text und Ton", () => {
    for (const s of STATUS_WERTE) {
      expect(STATUS_TEXT[s], `Text ${s}`).toBeTruthy();
      expect(STATUS_TON[s], `Ton ${s}`).toBeTruthy();
    }
  });

  it("hat fuer jede Prioritaet Text und Form", () => {
    for (const p of PRIORITAETEN) {
      expect(PRIORITAET_TEXT[p], `Text ${p}`).toBeTruthy();
      expect(PRIORITAET_FORM[p], `Form ${p}`).toBeTruthy();
    }
  });

  /*
   * `achtung` loest sich in die GETRENNTE Ampel-Rot-Textfarbe auf, nicht in
   * Markenrot — `colorError === colorPrimary === #c8000f`, und ein rotes Chip
   * auf einer Datenflaeche liest sich als Primaeraktion.
   */
  it("gibt genau „zurueckgewiesen“ den Ton achtung", () => {
    expect(STATUS_WERTE.filter((s) => STATUS_TON[s] === "achtung")).toEqual(["zurueckgewiesen"]);
  });

  it("gibt genau „abgeschlossen“ den Ton ok", () => {
    expect(STATUS_WERTE.filter((s) => STATUS_TON[s] === "ok")).toEqual(["abgeschlossen"]);
  });

  /*
   * Die Prioritaetsskala traegt ihre Rangfolge in der FORM, absteigend gefuellt →
   * Kontur → nur Text. Waere „hoch" nicht die einzige gefuellte Stufe, verschwaende
   * die Rangfolge in Graustufen.
   */
  it("gibt genau „hoch“ die gefuellte Form", () => {
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
   * DER FALL, DER DIE ABLEITUNG RECHTFERTIGT: die Vorschlagsfelder BLEIBEN nach
   * dem Einplanen stehen (der Verlauf soll belegen koennen, ob angenommen oder
   * abgewichen wurde). Ohne `planDatum === null` stuende „Vorschlag offen" fuer
   * immer an jeder Aufgabe, die je einen hatte.
   */
  it("ist falsch, sobald die Aufgabe eingeplant ist", () => {
    expect(
      vorschlagOffen({ ...AUFGABE, vorschlagDatum: "2026-08-13", planDatum: "2026-08-14" }),
    ).toBe(false);
  });

  it("ist in jedem anderen Zustand als verteilt falsch", () => {
    for (const s of STATUS_WERTE.filter((x) => x !== "verteilt")) {
      expect(vorschlagOffen({ ...AUFGABE, status: s, vorschlagDatum: "2026-08-13" }), s).toBe(false);
    }
  });
});

describe("istUeberfaellig", () => {
  it("zaehlt die Frist, nicht den Zeitplan", () => {
    expect(
      istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-12", planDatum: "2026-08-14" }, "2026-08-13"),
    ).toBe(true);
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

describe("routineAmTag", () => {
  it("liest die Bitmaske", () => {
    // Mo, Mi, Fr = Bits 0, 2, 4
    const r = routine({ wochentage: 0b10101 });
    expect(routineAmTag(r, 0)).toBe(true);
    expect(routineAmTag(r, 1)).toBe(false);
    expect(routineAmTag(r, 2)).toBe(true);
    expect(routineAmTag(r, 4)).toBe(true);
  });

  it("gilt nie, wenn die Routine ruht", () => {
    expect(routineAmTag(routine({ wochentage: 0b11111, aktiv: false }), 0)).toBe(false);
  });

  it("bildet die fuenf Wochentage auf Bits ab", () => {
    expect([...WOCHENTAG_BIT]).toEqual([1, 2, 4, 8, 16]);
  });

  /*
   * Ein Index ausserhalb Mo–Fr darf nicht still `true` ergeben. Ohne die
   * Undefined-Pruefung waere `r.wochentage & undefined` = 0 — hier zufaellig
   * richtig, aber `NaN`-Arithmetik ist keine Zusicherung.
   */
  it("gilt an einem Index ausserhalb der Woche nicht", () => {
    expect(routineAmTag(routine({ wochentage: 0b11111 }), 5)).toBe(false);
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
      [], LEA, MO,
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
      [], LEA, MO,
    );
    expect(b.verplantMinuten).toBe(120);
  });

  /*
   * ROUTINEN BELEGEN BUDGET, ERZEUGEN ABER KEINE AUFGABEN. Genau deshalb muessen
   * sie HIER mitgerechnet werden — sonst zeigte der Tag Luft, die es nicht gibt,
   * und der Zeitvorschlag der Koordination liefe genau dorthin.
   */
  it("rechnet aktive Routinen des Wochentags mit ein", () => {
    const b = tagesBudget(
      [{ ...AUFGABE, planDatum: MO, dauerMinuten: 60 }],
      [
        routine({ id: "r1", wochentage: 0b00001, dauerMinuten: 45 }),
        routine({ id: "r2", wochentage: 0b00001, dauerMinuten: 300, aktiv: false }),
        routine({ id: "r3", wochentage: 0b00010, dauerMinuten: 300 }),
        routine({ id: "r4", wochentage: 0b00001, dauerMinuten: 300, personId: "noah" }),
      ],
      LEA, MO,
    );
    expect(b.verplantMinuten).toBe(105);
  });

  it("meldet Ueberbuchung erst oberhalb des Solls", () => {
    expect(tagesBudget([{ ...AUFGABE, planDatum: MO, dauerMinuten: 468 }], [], LEA, MO).ueberbucht).toBe(false);
    expect(tagesBudget([{ ...AUFGABE, planDatum: MO, dauerMinuten: 469 }], [], LEA, MO).ueberbucht).toBe(true);
  });

  it("nimmt am Wochenende die Aufgaben, aber keine Routinen", () => {
    const b = tagesBudget(
      [{ ...AUFGABE, planDatum: "2026-08-15", dauerMinuten: 60 }],
      [routine({ wochentage: 0b11111, dauerMinuten: 60 })],
      LEA, "2026-08-15",
    );
    expect(b.verplantMinuten).toBe(60);
  });
});

describe("Formatierung", () => {
  it("schreibt Dauern unter einer Stunde in Minuten", () => {
    expect(fmtDauer(45)).toBe("45 Min.");
  });

  it("schreibt ganze Stunden ohne Komma", () => {
    expect(fmtDauer(60)).toBe("1 Std.");
    expect(fmtDauer(120)).toBe("2 Std.");
  });

  it("schreibt Bruchteile mit deutschem Komma", () => {
    expect(fmtDauer(90)).toBe("1,5 Std.");
    expect(fmtDauer(105)).toBe("1,75 Std.");
  });

  it("schreibt Stundenzahlen ohne Nullen am Ende", () => {
    expect(fmtStunden(468)).toBe("7,8");
    expect(fmtStunden(120)).toBe("2");
    expect(fmtStunden(165)).toBe("2,75");
    expect(fmtStunden(0)).toBe("0");
  });
});
```

- [ ] **Step 6: Test laufen lassen und Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/aufgaben/_lib/anzeige.test.ts`
Expected: FAIL — `Failed to resolve import "./anzeige"`.

- [ ] **Step 7: `anzeige.ts` schreiben**

Create `src/app/m/aufgaben/_lib/anzeige.ts`:

```ts
import type { AufgabeRow, PersonRow, Prioritaet, RoutineRow, Status } from "../_db/schema";
import { wochentagVon } from "./datum";

/*
 * BESCHRIFTUNGEN UND ABLEITUNGEN — die eine Quelle. KEIN "use client": jede
 * Server Component liest diese Konstanten, und aus einem Client-Modul kaeme eine
 * Client-Referenz statt des Objekts.
 *
 * WARUM DIE ABLEITUNGEN HIER LIEGEN UND NICHT IN DEN SEITEN: „ueberfaellig" und
 * „Zeitvorschlag offen" erscheinen je auf mehreren Seiten UND in einer
 * KPI-Kachel. Zwei Fassungen derselben Bedingung laufen auseinander, und der
 * Fehler ist nicht sichtbar kaputt, sondern nur falsch: die Kachel zaehlt drei,
 * die Liste zeigt zwei, und beide Zahlen sehen richtig aus.
 */

/** Die fuenf Toene der Zustands-Chips. Jeder loest sich in ein Paar `--auf-<ton>-text/-flaeche` auf. */
export type ChipTon = "grau" | "stahl" | "ocker" | "ok" | "achtung";

/** Die drei Gewichtsstufen der Prioritaet — die Rangfolge traegt die Form, nicht die Farbe. */
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
 * `achtung` ist absichtlich nur EINMAL vergeben und loest sich in die getrennte
 * Ampel-Rot-Textfarbe auf, nicht in Markenrot.
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
 * gespeicherter. Die MITTLERE Bedingung ist die, die man vergisst: die
 * Vorschlagsfelder bleiben nach dem Einplanen stehen, damit der Verlauf belegen
 * kann, ob angenommen oder abgewichen wurde.
 */
export function vorschlagOffen(a: AufgabeRow): boolean {
  return a.status === "verteilt" && a.planDatum === null && a.vorschlagDatum !== null;
}

/**
 * Ueberfaellig heisst: die FRIST ist verstrichen und die Aufgabe ist nicht
 * abgeschlossen. Der Zeitplan spielt keine Rolle. ISO-Tagesstrings sind
 * lexikografisch vergleichbar, deshalb `<` und kein Datums-Parsen.
 */
export function istUeberfaellig(a: AufgabeRow, heute: string): boolean {
  return a.status !== "abgeschlossen" && a.faelligAm < heute;
}

/** Bit je Wochentag: Index 0 = Montag. Die Maske liegt in `routinen.wochentage`. */
export const WOCHENTAG_BIT = [1, 2, 4, 8, 16] as const;

export function routineAmTag(r: RoutineRow, wochentag: number): boolean {
  const bit = WOCHENTAG_BIT[wochentag];
  // Die Undefined-Pruefung ist nicht Zierde: ohne sie waere `wochentage & undefined`
  // eine NaN-Rechnung, die hier zufaellig 0 ergibt — kein Verhalten, auf das man baut.
  return r.aktiv && bit !== undefined && (r.wochentage & bit) !== 0;
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
 * ALLE ZUSTAENDE ZAEHLEN, auch `abgeschlossen`: „verplant" ist eine Aussage
 * ueber den Tag, nicht ueber den Arbeitsvorrat. Ein Rueckblick auf eine
 * vergangene Woche zeigte sonst leere Tage.
 *
 * `ueberbucht` ist ECHT groesser: ein exakt gefuellter Tag ist voll, nicht
 * ueberbucht.
 */
export function tagesBudget(
  aufgaben: AufgabeRow[],
  routinen: RoutineRow[],
  person: PersonRow,
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

/** „45 Min." · „1 Std." · „1,5 Std." */
export function fmtDauer(minuten: number): string {
  if (minuten < 60) return `${minuten} Min.`;
  return `${fmtStunden(minuten)} Std.`;
}

/**
 * „7,8" · „2" · „2,75". `toFixed(2)` statt `toLocaleString`, damit die Rundung
 * nicht von der ICU-Fassung des Laufzeitsystems abhaengt.
 */
export function fmtStunden(minuten: number): string {
  return (minuten / 60)
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}
```

- [ ] **Step 8: Test, Gates, Commit**

```bash
rtk pnpm vitest run src/app/m/aufgaben && rtk pnpm typecheck && rtk pnpm lint && \
rtk git add src/app/m/aufgaben/_lib && \
rtk git commit -m "feat(aufgaben): Datum, Ableitungen, Anzeigetexte

Die Zeitzone steht an genau einer Stelle. In UTC gerechnet liefert isoTag
zwischen 00:00 und 02:00 deutscher Sommerzeit den VORTAG — und davon
haengen Ueberfaelligkeitsrechnung und heute-Markierung ab. Der Fehler ist
still: er trifft nur nachts, tagsueber stimmt alles wieder.

Die Tagesarithmetik rechnet dagegen bewusst in UTC um 12:00: sie verschiebt
KALENDERTAGE, und ein Wechsel um Mittag kreuzt keine Sommerzeitgrenze.

vorschlagOffen, istUeberfaellig und tagesBudget liegen an einer Stelle.
Beide Bedingungen erscheinen auf mehreren Seiten UND in einer KPI-Kachel;
zwei Fassungen laufen auseinander, und der Fehler ist nicht sichtbar
kaputt, sondern nur falsch."
```

---

## VERBLEIBENDE AUFGABEN — Struktur festgelegt, Code noch zu schreiben

**Stand 2026-08-13: die Aufgaben 1–3 sind vollständig ausgeschrieben, 4–21 noch nicht.**

Das ist keine Nachlässigkeit, sondern die ehrliche Grenze dieser Sitzung: ein Plan mit vollständigem
Code für 21 Aufgaben ist etwa fünfmal so lang wie das hier Vorliegende, und ein Plan mit Platzhaltern
ist laut `superpowers:writing-plans` ein Planfehler — er verlagert die Entscheidungen nur in die
Ausführung, wo ein frischer Subagent sie ohne Kontext trifft.

**Wer hier weiterarbeitet, schreibt die Aufgaben 4–21 nach dem Muster der ersten drei aus.** Die
Gliederung, die Schnittstellen und die tragenden Entscheidungen stehen fest — sie sind im Spec
begründet und unten je Aufgabe benannt. Was fehlt, ist die Übersetzung in Testcode und
Implementierung.

### Aufgabe 4 — Zugang, Lesepfade, lokale Demodaten

**Files:** `_lib/zugang.ts` (+Test) · `_db/queries.ts` (+Test) · `_lib/seedLokal.ts` (+Test) · Modify `src/core/bootstrap.ts` (Seed-Eintrag), `scripts/seed-lokal.ts` (`SEED_MODULE`)

**Interfaces:**
- `personFuerSession(db: DB): Promise<PersonRow>` — ruft `auth()`, liest `session.user.id` als `sub`, sucht in `personen`. **Kein Treffer → `notFound()`**, nicht 403.
- `istAktiv(p, heute)` · `darfVerteilen(p, heute)` · `darfFreigeben(p, a, heute)` · `istVertretungsfreigabe(p, a)` · `darfEinstellenFuerAndere(p, heute)` · `darfPlanAendern(p, zielId, heute)` · `darfPlanSehen(p, zielId)` · `darfNachweisSehen(p, a)` · `darfPersonenVerwalten(p, heute)` — Signaturen und Semantik wie in Spec §7.
- `queries.ts`: `personen()`, `personNachSub()`, `aufgabe(id)`, `aufgabenFuerPerson()`, `posteingang()`, `freigabenFuer()`, `routinenFuer()`, `verlaufFuer()`, `nachweiseFuer()`, plus die Schreibprimitive, die Aufgabe 9/10 braucht.

**Tragende Entscheidungen, die im Test stehen müssen:**
- Handlungsprädikate prüfen `istAktiv` **selbst**, Sichtprädikate nicht — eine ausgeschiedene Person liest ihre Geschichte, bewegt aber nichts. Die Prüfung liegt in JEDEM Handlungsprädikat statt in einem vorgeschalteten Gate, weil ein Gate genau einmal vergessen wird.
- `darfFreigeben` gibt für Selbstaufgaben **immer** `false` zurück, auch der Koordination: sie haben keinen Prüfer. Ohne die erste Zeile stimmten `prueferId === null` und `rolle === "koordination"` je für sich, und Sarah bekäme einen Freigabeknopf für Leas eigene Aufgabe.
- `darfPlanAendern` erlaubt **auch der Koordination** keine fremden Pläne — Sarah *schlägt vor*, sie setzt nicht.
- `aktivBis` ist ein **einschließendes** Ende: am Enddatum selbst ist die Person aktiv.
- `seedLokal` legt für jede Demo-Person `sub: "dev:<name>@localtest.me"` an — **das ist der lokale Rollenwechsel** (Spec §13). Additiv und idempotent.
- `bootstrap.ts` bekommt den Seed-Eintrag ohne Ausnahme (anders als `files` und `lagerbuch`): dieses Modul hat keinen anonymen Schreibzugang und keine registrierte SQLite-Funktion.

### Aufgabe 5 — Farbvokabular und Mobilumschaltung

**Files:** `_ui/aufgaben.module.css` (vollständiger Ausbau) · `_ui/aufgaben-css.test.ts`

Palette **hier** festlegen, nicht später. Klassen: `.chip` + `.tonGrau/.tonStahl/.tonOcker/.tonOk/.tonAchtung` · `.prioGefuellt/.prioKontur/.prioText` · `.kpi` + `.kpiKanteAchtung/-Ocker/-Ok` + `.kpiLink` · `.wochenGitter`/`.tagesListe`/`.tagSpalte`/`.tagKopf`/`.budget`/`.budgetUeberbucht` · `.ankerSpur`/`.ohneAnker` · `.routineZeile` · `.knopfzeile` · `.journal`/`.jts` · `.backlink`.

Der Test ist ein **Quelltext-Scan** und besitzt vier Aussagen: genau eine Medienabfrage (`767.98px`) · jede helle `--auf-*`-Variable hat ein dunkles Gegenstück (und umgekehrt) · kein `prefers-color-scheme`, kein `data-theme="auto"`, kein `#c8000f`, kein `var(--ant-`, kein `!important`, kein `outline: none` · `.wochenGitter { display:none }` **im** Mobilblock und `.tagesListe { display:none }` **außerhalb**. Dazu die Spezifitätserhöhung `.modul .knopfzeile > *` mit Kommentar — `.knopfzeile > *` allein verliert gegen `.ant-btn` durch Dokumentreihenfolge.

**jsdom wertet Media Queries nicht aus.** Ein Verhaltenstest darauf ginge immer durch; die Wirkung besitzt Playwright (Aufgabe 21).

### Aufgabe 6 — Zeichenquelle, Chip, Kachel, Seitenkopf

**Files:** `_ui/ikonen.tsx` (+Test) · `_ui/Chip.tsx` (+Test) · `_ui/Kachel.tsx` · `_ui/SeitenKopf.tsx` (+Test mit den **modulweiten Verboten**)

- `ikonen.tsx`: Union als Autorität, Auflösung über `react-icons/pi`. **Kein `"use client"`** — die Datei exportiert den Typ `IkonName`, der als Datenfeld durch Server Components wandert. Jedes Zeichen `aria-hidden`, `data-zeichen` fürs Testen.
- `Chip.tsx`: eigenes Markup, **kein antd-`Tag`** (drei Gründe: `color="error"` greift Suite-Rot; der Fehler wäre nicht kaputt, nur falsch; `Tag.CheckableTag` ist ein Compound-Zugriff). Ton- und Formklassen als `Record` über geschlossener Union, nie Indexzugriff auf das CSS-Modul.
- `Kachel.tsx`: `Card` plus eigene Kante, **kein `Statistic`** — eine farbige Zahl ist Rot auf einer Datenfläche. Kante trägt die Farbe, Zahl trägt Tinte. `kante` hat absichtlich keinen Grauwert.
- `SeitenKopf.tsx`: das Muster aus `feedback` §4.2 — Brotkrume, natives `<h1>` mit `SCHRIFT.titel`, Aktionen rechts in derselben Zeile, Kontextzeile in 12/gedämpft. **Kein `Typography`.**
- Der Test in `SeitenKopf.test.tsx` trägt die vier **modulweiten** Quelltext-Verbote: kein `Typography`, kein `@ant-design/icons`, kein `size="large"`, kein `Grid.useBreakpoint` — jeweils über alle `.ts`/`.tsx` des Moduls.

### Aufgabe 7 — Tagesordnung, Aufgabenliste, Wochenplan

**Files:** `_lib/tagesplan.ts` (+Test) · `_ui/AufgabenListe.tsx` (+Test) · `_ui/Wochenplan.tsx` (+Test)

`tagesplan.ts` trägt die **Anker-Regel**, die die zugesagte Bauform ausmacht: `TAGESBEGINN_MINUTEN = 480`; ein Eintrag **mit** Uhrzeit ist ein Anker, ein Eintrag **ohne** erbt die Uhrzeit des vorangehenden Ankers und sortiert dahinter. Damit sitzt eine freie Aufgabe *zwischen* zwei festen Blöcken statt am Tagesende zu sammeln. Umsetzung: Aufgaben nach `planRang` sortieren, dabei `anker` mitführen; Routinen nach Uhrzeit sortieren; **Routinen zuerst** ins Feld, dann stabil nach `minuten` sortieren — die Feldreihenfolge entscheidet bei Gleichstand.

**Wo es kippt — hier stand bis zum 2026-08-13 eine falsche Ursache**, gemeldet vom Implementierer der Aufgabe und nachgeprüft. Der Satz lautete: „vertauscht rutscht die freie Aufgabe vor ihren eigenen Anker." Das ist **nicht erreichbar**: `Array.prototype.sort` ist seit ES2019 stabil, und ein Anker samt seinem freien Nachfolger liegen **beide** im Aufgabenblock — eine Konkatenation verschränkt zwei Blöcke nie miteinander, die Blockreihenfolge ändert an der Relativordnung *innerhalb* eines Blocks also nichts. Vertauscht ändert sich allein, wo die **Routine** landet.

Der tatsächlich erreichbare Fehler liegt in **Schritt 1**: die geerbte Uhrzeit muss in **einem Vorwärtslauf über die bereits nach `planRang` sortierte Liste** entstehen. Wird sie in ursprünglicher Feldreihenfolge gerechnet, bekommt ein freier Eintrag die Uhrzeit eines Ankers, der im Ergebnis hinter ihm steht — und *dann* überholt er ihn. Sichtbar wird das erst an einem Gleichstand in Schritt 3, weshalb der Test beides braucht: einen echten Gleichstand zwischen Routine und Anker **und** die Anker-vor-Nachfolger-Zusage.

`Wochenplan.tsx` rendert **beide** Ausprägungen (`data-rolle="wochengitter"` und `="tagesliste"`), einmal gerechnet und zweimal gerendert — zwei Abfragen liefen auseinander, und zwar genau dann, wenn niemand hinsieht.

### Aufgabe 8 — Die Übergangstabelle als reine Funktion

**Files:** `_lib/lebenszyklus.ts` (+Test)

Spec §5.2 wird eine Datenstruktur, nicht verstreute `if`s. Vorschlag:

```
type Aktion = "verteilen" | "umverteilen" | "einplanen" | "starten" | "zuruecksetzen"
            | "fertig" | "freigeben" | "zurueckweisen" | "wiederaufnehmen" | "zurueckziehen";
uebergang(a: AufgabeRow, aktion: Aktion, p: PersonRow, heute: string): { erlaubt: true; nach: Status } | { erlaubt: false; grund: string }
```

**Der Test ist erschöpfend**: für jedes Paar (Status × Aktion) steht das erwartete Ergebnis in einer Tabelle im Test; jeder Übergang, der nicht in Spec §5.2 steht, muss abgelehnt werden. Dazu die drei Sonderregeln: Selbstaufgaben springen von `in_arbeit` direkt auf `abgeschlossen` · Zurückziehen geht **nur** aus `eingegangen` · Umverteilen **löscht** `planDatum`/`planUhrzeit`/`planRang`.

### Aufgabe 9 — Server-Actions: einstellen, verteilen, umverteilen, zurückziehen

**Files:** `actions.ts` · `actions.test.ts` · `_lib/formState.ts`

`FormState` nach dem Muster `feedback/_lib/formState.ts`. Jede Action: `personFuerSession` → Prädikat → `uebergang()` → Schreiben → **Verlaufszeile** → `revalidatePath`. Feldfehler kommen **zurück**, Zugriffsverletzungen werfen.

### Aufgabe 10 — Server-Actions: starten, einplanen, fertig melden, freigeben, zurückweisen

Wie 9. Zwei Punkte, die im Test stehen müssen: `fertig` ohne Nachweis wird **von der Action** abgelehnt, wenn `nachweisPflicht` steht (nicht nur vom Formular) · Zurückweisen verlangt Text, und die Vertretungsfreigabe schreibt „Freigegeben von X in Vertretung für Y" in den Verlauf.

### Aufgabe 11 — Routinen

**Files:** `routinen/page.tsx` · `_ui/RoutineFormular.tsx` (Client) · Actions für Anlegen/Ändern/Ruhen

Wochentage als Checkbox-Gruppe auf die Bitmaske. `Table` mit `scroll={{ x: "max-content" }}`, Spaltenköpfe über `columns[].title`, `size="small"` nur für Zeilenaktionen.

### Aufgabe 12 — Einplanen und Verschieben

**Files:** `_ui/EinplanenFormular.tsx` · `_ui/RangKnoepfe.tsx` (beide Client)

Tag, optional Uhrzeit, Dauer. Auf/Ab auf `planRang`. Tastaturbedienbar — das ist die Grundlage, auf der Aufgabe 20 aufsetzt, und sie bleibt danach.

### Aufgaben 13–16 — Die neun Seiten

13: `page.tsx` (Verteiler) + `EinstiegBufdi` + `plan/[personId]` · 14: `EinstiegKoordination` + `verteilen` + `personen` · 15: `EinstiegAuftrag` + `neu` + `freigaben` · 16: `a/[id]` + `archiv` + `showInSwitcher: true` + `_lib/nav.ts`.

Jede Seite dünn, der Inhalt eine **reine exportierte Funktion** mit `jetzt` als Argument. Jede Action braucht einen Weg in der Oberfläche; und umgekehrt darf kein Weg dorthin führen, wo die Person nicht hindarf — dasselbe Prädikat in Navigation und Riegel.

### Aufgaben 17–19 — Bildnachweis

17: `src/core/av/scanner.ts` — die Zeilen 35–262 aus `files/_lib/av.ts` heben, `scanne(pfad, konfig)` statt `scanne(ziel)`, Konfiguration als Argument. `files` ruft es an einer Stelle. **Die vier Bauregeln und ihr Test wandern mit** (`av.test.ts` scannt den Quelltext daraufhin, dass ab dem ersten Ereignis-Zuhörer nichts mehr wirft).
18: `_lib/ablage.ts` + `_lib/scan.ts` — Ablagepfad, MIME- und Größenprüfung, modul-eigene Warteschlange über die **eine** Tabelle `dateien`.
19: `_ui/NachweisFormular.tsx` + `a/[id]/nachweis/[nachweisId]/route.ts` — Auslieferung **nur** bei `scanStatus === "sauber"` und `darfNachweisSehen`.

### Aufgabe 20 — Drag & Drop

Ziehen zwischen Tagen und innerhalb eines Tages, ab 768px, auf denselben Actions wie Aufgabe 12. Die Knopfstrecke bleibt.

### Aufgabe 21 — e2e und Aufräumen

`e2e/aufgaben.spec.ts` vollständig: Abruf **jeder** Route auf 200 · die drei Rollen sehen drei Einstiege · Schulle bekommt auf `/verteilen` **404** · der volle Durchlauf einstellen → verteilen → annehmen → arbeiten → fertig mit Nachweis → freigeben · Umschaltung bei **390, 820 und 1280px** · kein waagerechtes Scrollen · Dunkelmodus über `getComputedStyle` (eine unaufgelöste CSS-Variable meldet sich sonst nie). Dann `rm bufdi-koordination-klickdummy.html` (**`rm`, nicht `git rm`** — die Datei ist nicht versioniert) und der vollständige Gate-Lauf.

