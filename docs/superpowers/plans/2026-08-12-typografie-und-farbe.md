# Typografie und Farbe — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Suite bekommt eine Display-Schriftfamilie, eine gemeinsame Typo-Rollenleiter und
Markenfarbe in der Chrome — und der stille Schriftausfall im Helfer-Weg des Lagerbuchs wird behoben.

**Architecture:** Vier Schichten, strikt aufeinander aufbauend. **A** macht die drei
Schrift-Rollenvariablen real, die der Bestand schon voraussetzt, und nimmt dem Test die Augenbinde.
**B** hebt die zwei unabhängig erfundenen Rollen-Dateien aus `feedback` und `lagerbuch` zu einer
Leiter in `core/theme` — die beiden Module werden zu Adaptern darüber und bekommen den
Display-Schnitt, ohne dass eine Seite angefasst wird. **C** legt die drei Suite-Farbvariablen an,
die eigenes Markup braucht (antds `--ant-*` sind für eigenes Markup unsichtbar). **D** macht es in
Shell und Portal sichtbar.

**Tech Stack:** Next.js 16 (App Router, RSC) · Ant Design 6 · CSS Modules · `next/font/google` ·
Vitest (Quelltext-Scans) · Playwright (Wirkung, zwei Viewports, zwei Modi)

**Spec:** `docs/superpowers/specs/2026-08-12-typografie-und-farbe-design.md`

---

## Global Constraints

Diese gelten für **jede** Aufgabe und werden nicht wiederholt.

- **Keine neue Schriftgrößen-Skala.** Admin-Ansichten nutzen antds Leiter: **12/14/16/20/24/30**.
  Eine dritte Skala wäre der Fehler, nicht die Lösung (`docs/design/README.md`).
- **Nie `--ant-*` in eigenem Markup.** antd deklariert sie auf seiner Scope-Klasse, nicht auf
  `:root`. Eigenes Markup sieht sie nicht, und der Ausfall ist still (Falle 2).
- **`data-theme`, nie `prefers-color-scheme`.** Die Suite hat einen Umschalter (Cookie `iuk-theme`).
  Dunkelzweig-Selektor: `:root[data-theme="dark"]`.
- **Kein `"use client"`** in Dateien, aus denen Server Components **Werte** lesen (Falle 6). Betrifft
  `core/theme/schrift.ts` und beide Adapter.
- **Kein Compound-Zugriff auf antd in Server Components** (Falle 1): kein `Typography.Title`, kein
  `Card.Meta`. Überschriften sind schlichtes HTML.
- **Kein `@ant-design/icons` in Server Components** (Falle 7).
- **`size` auf Bedienelementen nicht setzen.** `controlHeight` ist 56 und schon das richtige Maß.
- **Gegen antd nie `!important`.** Erst prüfen, ob antd einen **Token** anbietet (dann
  `core/theme/theme.ts`), sonst eine Klasse mehr voranstellen — und die Erhöhung kommentieren.
- **768px ist der einzige Breakpoint.** In `max-width`-Abfragen heißt er **767.98px**.
- **Bedeutung nie allein über Farbe.** Jede farbige Markierung trägt zusätzlich Text, Ziffer oder
  Gewicht.
- **Bestehende Kommentare, die falsch werden, werden umgeschrieben — nicht gelöscht.** Sie halten
  fest, was entschieden wurde und warum.
- **Tore:** `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
  `pnpm exec playwright test`. **Kein offener `pnpm dev` während des E2E-Laufs** — er belegt Port
  3100 und legt die Suite lahm.
- **Deutsche Kommentare**, im Ton des umgebenden Codes (Begründung, nicht Beschreibung).

---

## Drei Abweichungen von der Spec — begründet

Beim Ausformulieren zeigte sich, dass drei Festlegungen der Spec sich an anderen Regeln derselben
Spec stoßen. Der Plan entscheidet anders; die Spec wird nachgezogen.

**1. Die Rollen in `core/theme/schrift.ts` tragen KEINE Farbe** (Spec §5.2 sah eine gedämpfte Farbe
auf `kicker` und `neben` vor). Grund: die beiden Adapter haben verschiedene Träger —
`feedback` färbt über `--fb-muted`, `lagerbuch` rendert unter `.modul` mit `--lb-stahl`. Eine Farbe
in `core` müsste einer der beiden aufgezwungen werden und änderte 23 Seiten optisch, obwohl der
Auftrag nur die Familie betrifft. Farbe bleibt beim Träger; die Rollen tragen Familie, Größe,
Gewicht, Laufweite, Versalien und Ziffernstellung.

**Folge: die Reihenfolge ist wieder A → B → C → D.** Die Umkehr in Spec §9 war allein durch die
Farbe auf `kicker` begründet, und die fällt weg.

**2. Teil C liefert drei Variablen, keine Klassenbibliothek** (Spec §6.3 listete KPI-Kante, Chip,
Abschnittsstreifen, Journal-Delta, Gefahrenzone als Bausteine). Grund: der Maßstab für `core` ist
**ein zweiter, heute belegbarer Nutznießer** — dieselbe Regel, die den Umzug der Typo-Leiter
rechtfertigt. Diese Bausteine haben heute genau einen Anwender (`lagerbuch/_ui/verwaltung.module.css`).
Sie nach `core` zu heben, ohne dass ein zweites Modul sie ruft, wäre ein Framework für einen Nutzer.
Sie bleiben, wo sie sind; **das Vokabular wird stattdessen in `docs/design/README.md` beschrieben**,
damit das nächste Modul es nachbaut statt neu erfindet. Nach `core` kommen nur die drei Variablen mit
einem Anwender in Teil D.

**3. Die Portal-Kacheln bekommen einen Akzent, keine Farbe je Modul** (Spec §7.2 sagte „eine farbige
Innenkante je Modul"). Grund: eine Palette je Modul existiert nicht und müsste erfunden werden — und
die einzige Markenfarbe der Suite ist Rot, das laut §6.4 nicht beliebig auf Flächen darf. Die Kachel
trägt eine ruhige Kante in Linienfarbe, die bei Hover und Fokus auf Markenrot wechselt. Ein Zustand,
eine Farbe, keine Erfindung.

---

## Dateien im Überblick

| Datei | Verantwortung | Aufgabe |
|---|---|---|
| `src/app/layout.tsx` | lädt `Barlow_Condensed`, hängt die Variable an `<html>` | 1 |
| `src/app/globals.css` | deklariert `--font-display/-body/-mono` und `--iuk-*` auf `:root` | 1, 6 |
| `src/app/layout.test.tsx`, `src/app/layout.test.ts` | Font-Mock kennt die dritte Familie | 1 |
| `src/core/theme/schriftstapel.test.ts` | **neu** — Scan: Deklaration UND Registrierung | 1 |
| `src/app/m/lagerbuch/_lib/bauform.test.ts` | Whitelist fällt, Kommentar berichtigt | 1 |
| `src/app/m/lagerbuch/_ui/helfer.module.css` | nur Kommentar (Zeile 28-29) | 1 |
| `e2e/lagerbuch-helfer.spec.ts` | belegt: die Familie kommt wirklich an | 2 |
| `src/core/theme/schrift.ts` | **neu** — die sieben Rollen der Suite | 3 |
| `src/core/theme/schrift.test.ts` | **neu** — Leiter, Familien, Ziffern | 3 |
| `src/app/m/feedback/_ui/typo.ts` | Adapter über `core`, behält Namen und Farben | 4 |
| `src/app/m/lagerbuch/_lib/schrift.ts` | Adapter über `core`, trägt A-S1 aus | 5 |
| `src/core/shell/shell.module.css` | Markenstreifen, Titelschnitt, Aktivzustand, Kicker | 7, 8 |
| `src/core/shell/SuiteHeader.tsx` | rendert den Streifen als eigenes Geschwister | 7 |
| `src/core/shell/shell-css.test.ts` | Scans für die neuen Regeln | 7, 8 |
| `src/app/m/portal/page.tsx` | Kacheln mit Rollen statt Inline-Werten | 9 |
| `e2e/shell-mobil.spec.ts` | Wirkung in zwei Viewports und zwei Modi | 10 |
| `docs/design/README.md` | Schriftvariablen, Rot-Regel, Farbvokabular | 6 |

---

# Teil A — die drei Rollenvariablen werden real

### Task 1: Display-Familie laden, Variablen deklarieren, Augenbinde abnehmen

**Files:**
- Create: `src/core/theme/schriftstapel.test.ts`
- Modify: `src/app/layout.tsx:3` (Import), `:11-19` (Font-Definitionen), `:63` (className)
- Modify: `src/app/globals.css` (neuer `:root`-Block nach dem `box-sizing`-Block)
- Modify: `src/app/layout.test.tsx:17-20`, `src/app/layout.test.ts:3-6` (Mocks)
- Modify: `src/app/m/lagerbuch/_lib/bauform.test.ts:497-546` (Whitelist)
- Modify: `src/app/m/lagerbuch/_ui/helfer.module.css:26-30` (Kommentar)

**Interfaces:**
- Consumes: nichts
- Produces: die CSS-Variablen `--font-display`, `--font-body`, `--font-mono` auf `:root`. Alle
  späteren Aufgaben verlassen sich darauf, insbesondere `core/theme/schrift.ts` (Task 3).

- [ ] **Step 1: Den Scan schreiben, der beide Hälften prüft**

Neue Datei `src/core/theme/schriftstapel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DIE DREI SCHRIFT-ROLLENVARIABLEN DER SUITE.
 *
 * Sie waren einmal ein toter Vertrag: `app/m/lagerbuch/_ui/helfer.module.css`
 * loeste `--lb-display` gegen `var(--font-display)` auf, und die Variable stand
 * NIRGENDS. Der Helfer-Weg rendete in "Arial Narrow" — dem Fallback. Der
 * Ausfall war still: eine unaufgeloeste Variable protokolliert nichts, und
 * `pnpm build` sieht sie nicht.
 *
 * DIESER SCAN PRUEFT BEIDE HAELFTEN, UND DAS IST DER PUNKT. Eine Pruefung auf
 * `globals.css` allein ginge durch, wenn jemand die Schrift aus `layout.tsx`
 * entfernt: dann stuende `var(--font-barlow-condensed)` ins Leere und der
 * Fallback waere zurueck — derselbe stille Ausfall, eine Ebene tiefer.
 *
 * WAS ER NICHT KANN: belegen, dass die Schrift wirklich GERENDERT wird. Ein
 * fehlgeschlagener Font-Fallback ist im Quelltext von einer erfolgreichen
 * Zuweisung nicht zu unterscheiden. Diese Aussage besitzt
 * `e2e/lagerbuch-helfer.spec.ts` (`getComputedStyle(...).fontFamily`).
 */
const GLOBALS = readFileSync("src/app/globals.css", "utf8");
const LAYOUT = readFileSync("src/app/layout.tsx", "utf8");

/** Kommentare raus — eine Erwaehnung im Fliesstext ist keine Deklaration. */
const css = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("Schriftstapel — die drei Rollenvariablen", () => {
  it("deklariert --font-display, --font-body und --font-mono auf :root", () => {
    for (const name of ["--font-display", "--font-body", "--font-mono"]) {
      expect(css, `${name} wird in globals.css nicht deklariert`)
        .toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it("zieht --font-display aus einer Familie, die layout.tsx auch registriert", () => {
    // Der Name aus der Deklaration wird HERAUSGELESEN, nicht als Literal
    // wiederholt: ein Test, der "--font-barlow-condensed" fest verdrahtet,
    // muesste beim Schriftwechsel mitgeaendert werden und wuerde dabei leicht
    // auf die alte Familie stehen bleiben.
    const treffer = css.match(/--font-display\s*:\s*var\(\s*(--[\w-]+)/);
    expect(treffer, "--font-display zieht nicht aus einer var()").not.toBeNull();
    const quelle = treffer![1]!;
    expect(LAYOUT, `layout.tsx registriert ${quelle} nicht`)
      .toMatch(new RegExp(`variable:\\s*"${quelle}"`));
  });

  it("haengt jede in layout.tsx registrierte Schriftvariable an <html>", () => {
    // Eine registrierte Familie, deren `.variable` nicht in der className des
    // <html> landet, ist geladen und unerreichbar — wieder still.
    const registriert = [...LAYOUT.matchAll(/const\s+(\w+)\s*=\s*\w+\(\{[^}]*variable:/g)]
      .map((t) => t[1]!);
    expect(registriert.length, "keine einzige Schrift registriert — der Scan waere leer-gruen")
      .toBeGreaterThanOrEqual(3);
    for (const bezeichner of registriert) {
      expect(LAYOUT, `${bezeichner}.variable fehlt in der className von <html>`)
        .toMatch(new RegExp(`\\$\\{${bezeichner}\\.variable\\}`));
    }
  });
});
```

- [ ] **Step 2: Den Scan laufen lassen und das Scheitern sehen**

```bash
pnpm vitest run src/core/theme/schriftstapel.test.ts
```

Erwartet: **FAIL** im ersten Test — `--font-display wird in globals.css nicht deklariert`.

- [ ] **Step 3: Barlow Condensed in `app/layout.tsx` laden**

Import in Zeile 3 erweitern:

```ts
import { Geist, Geist_Mono, Barlow_Condensed } from "next/font/google";
```

Nach dem `geistMono`-Block (Zeile 19) einfügen:

```ts
/*
 * DIE DISPLAY-FAMILIE DER SUITE — und die EINZIGE zusaetzliche.
 *
 * Sie traegt Marke, Kicker, Ueberschriften und grosze Zahlen; Fliesztext und
 * Formulare bleiben Geist. Das Trio des alten Lagerbuchs (Barlow / Barlow
 * Condensed / IBM Plex Mono) zu uebernehmen haette Geist abgeloest und damit
 * das Bild JEDER Flaeche der Suite geaendert — auch der Module, die niemand
 * angefasst haben wollte.
 *
 * NUR 600 UND 700: die Rollenleiter (`core/theme/schrift.ts`) fragt keine
 * anderen Schnitte an. Jedes weitere Gewicht waere ein Ladevorgang ohne
 * Anwender.
 */
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});
```

Die `className` des `<html>` (Zeile 63) erweitern:

```tsx
className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable}`}
```

- [ ] **Step 4: Die drei Rollenvariablen in `app/globals.css` deklarieren**

Direkt nach dem `box-sizing`-Block einfügen:

```css
/*
 * DIE DREI SCHRIFT-ROLLEN DER SUITE — Rollennamen, keine Schriftnamen.
 *
 * DAS HIER WAR EIN TOTER VERTRAG. `app/m/lagerbuch/_ui/helfer.module.css:64-66`
 * loeste `--lb-display|body|mono` gegen genau diese drei Namen auf, und der
 * Kommentar daneben behauptete, sie laegen auf `:root`. Sie lagen dort nicht —
 * das Wurzel-Layout registrierte nur Geist. Der Helfer-Weg rendete in
 * "Arial Narrow" / system-ui / ui-monospace, still, ueber Monate.
 *
 * WARUM ROLLENNAMEN UND NICHT `--font-geist-sans` DIREKT: der Bestand benutzt
 * diese drei Namen bereits, und sie bezeichnen eine ROLLE (Display, Fliesztext,
 * Daten), nicht eine Schrift. Ein spaeterer Schriftwechsel ist damit eine Zeile
 * hier statt einer Suche ueber alle Module.
 *
 * `core/theme/schriftstapel.test.ts` haelt beide Haelften fest: dass diese
 * Deklarationen stehen UND dass `layout.tsx` die Familie registriert, aus der
 * `--font-display` seinen Wert zieht. Ohne die zweite Haelfte waere derselbe
 * stille Ausfall eine Ebene tiefer wieder moeglich.
 */
:root {
  --font-display: var(--font-barlow-condensed), "Arial Narrow", sans-serif;
  --font-body: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;
}
```

- [ ] **Step 5: Die zwei Font-Mocks um die dritte Familie erweitern**

In `src/app/layout.test.tsx:17-20` **und** `src/app/layout.test.ts:3-6` jeweils:

```ts
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
  Barlow_Condensed: () => ({ variable: "--font-barlow-condensed" }),
}));
```

- [ ] **Step 6: Scan und Layout-Tests laufen lassen**

```bash
pnpm vitest run src/core/theme/schriftstapel.test.ts src/app/layout.test.tsx src/app/layout.test.ts
```

Erwartet: **PASS**, alle drei Dateien.

- [ ] **Step 7: Die Augenbinde in `bauform.test.ts` durch eine hergeleitete Ausnahme ersetzen**

> **⚠️ KORRIGIERT WÄHREND DER UMSETZUNG (2026-08-12).** Hier stand, `VOM_LAYOUT` sei **ersatzlos** zu
> löschen. Das ist unerfüllbar, und der Implementer hat es zu Recht als Blocker gemeldet: `deklariert`
> wird ausschließlich aus den `.rahmen`-Körpern **dieser Datei** gebaut, `genutzt` scannt die ganze
> Datei einschließlich der rechten Seite von `--lb-display: var(--font-display), …`. Eine Variable aus
> `globals.css` kann strukturell nie in `deklariert` landen und beginnt nie mit `--lb-`. Beide Filter
> schlügen an, für immer.
>
> **Der Mangel war nie die Ausnahme, sondern dass sie eine Behauptung war, die niemand nachprüfte.**
> Ein fest verdrahtetes `/^--font-(display|body|mono)$/` sagt „die kommen vom Layout" und glaubt sich
> selbst. Eine aus `globals.css` gelesene Menge sagt dasselbe und **weiß** es — und wird rot, wenn
> jemand die Deklaration dort entfernt.

In `src/app/m/lagerbuch/_lib/bauform.test.ts` die Konstante `VOM_LAYOUT` (Zeile 519) durch eine
abgeleitete Menge bei den anderen Modulkonstanten ersetzen:

```ts
/**
 * DIE VARIABLEN, DIE VOM WURZEL-LAYOUT KOMMEN — HERGELEITET, NICHT BEHAUPTET.
 *
 * Hier stand `VOM_LAYOUT = /^--font-(display|body|mono)$/`, ein fest
 * verdrahtetes Muster mit der Begruendung, diese drei laegen auf `:root`. Das
 * war eine BEHAUPTUNG, und sie war falsch: das Layout registrierte nur Geist,
 * die drei Namen standen nirgends, und `helfer.module.css` rendete im Fallback
 * "Arial Narrow" — still, ueber Monate. Der Riegel war die Augenbinde.
 *
 * Der Mangel war nicht die Ausnahme, sondern dass niemand sie nachprueft. Die
 * Menge hier wird deshalb AUS `globals.css` GELESEN. Wer die Deklaration dort
 * entfernt, schrumpft diese Menge — und dieser Test wird rot, statt weiter zu
 * schweigen.
 */
const GLOBALS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const VOM_LAYOUT = new Set(
  [...GLOBALS.matchAll(/(--font-[\w-]+)\s*:/g)].map((t) => t[1]!),
);
```

Beide Filter benutzen die Menge statt des Musters:

```ts
    const fremde = [...genutzt]
      .filter((n) => !n.startsWith("--lb-") && !VOM_LAYOUT.has(n));
    expect([...new Set(fremde)], "nur --lb-* und die --font-* aus globals.css sind erlaubt")
      .toEqual([]);

    const unaufloesbar = [...genutzt]
      .filter((n) => !deklariert.has(n) && !VOM_LAYOUT.has(n));
    expect(unaufloesbar,
      "benutzt, aber weder unter `.rahmen`/Dunkelzweig deklariert noch eine `--font-*` aus globals.css")
      .toEqual([]);
```

**Der Vakuum-Riegel gehört dazu.** Eine leere `VOM_LAYOUT` wäre still die ersatzlose Streichung:

```ts
expect(VOM_LAYOUT.size, "keine --font-*-Deklaration in globals.css gefunden — der Scan liefe ins Leere")
  .toBeGreaterThanOrEqual(3);
```

Den irreführenden Kommentar direkt darüber (Zeile 498-506, „`--font-display|body|mono` sind die
Ausnahme — sie kommen vom Wurzel-Layout und liegen auf `:root`") auf den tatsächlichen Stand
umschreiben: die Ausnahme besteht fort, sie ist nur nicht länger blind. Der Satz über den
Ursprungsfehler bleibt — er ist die Warnung, die trägt.

Den irreführenden Kommentar direkt darüber (Zeile 498-506, „`--font-display|body|mono` sind die
Ausnahme — sie kommen vom Wurzel-Layout und liegen auf `:root`") ersetzen durch:

```ts
    // ⚠️ HIER STAND EINE AUSNAHMELISTE, UND SIE WAR DIE AUGENBINDE.
    //
    // `VOM_LAYOUT = /^--font-(display|body|mono)$/` nahm genau die drei Namen
    // aus BEIDEN Pruefungen heraus, mit der Begruendung, sie kaemen vom
    // Wurzel-Layout. Das stimmte nicht: das Layout registrierte nur Geist, die
    // drei Namen waren NIRGENDS deklariert, und der Helfer-Weg rendete im
    // Fallback "Arial Narrow". Der Test war an dieser Stelle nicht der Riegel,
    // sondern der Grund, warum es niemand sah.
    //
    // Seit 2026-08-12 deklariert `app/globals.css` die drei auf `:root`
    // (`core/theme/schriftstapel.test.ts` haelt das fest), und `helfer.module.css`
    // deklariert daraus seine `--lb-*` unter `.rahmen`. Damit braucht es hier
    // keine Ausnahme mehr — jede benutzte Variable ist eine deklarierte.
```

- [ ] **Step 8: Den Kommentar in `helfer.module.css` berichtigen**

`src/app/m/lagerbuch/_ui/helfer.module.css`, Zeile 26-30 — die Behauptung „die liegen auf `:root`
(Wurzel-Layout)" ist jetzt wahr, war es aber nicht. Der Kommentar hält beides fest:

```css
 * (Falle 2). Einzige zugelassene Fremdvariablen sind `--font-display`,
 * `--font-body` und `--font-mono`: die liegen auf `:root` und werden von
 * `app/globals.css` deklariert.
 *
 * ⚠️ DAS WAR BIS 2026-08-12 EINE BEHAUPTUNG UND KEINE TATSACHE. Das
 * Wurzel-Layout registrierte nur Geist; die drei Namen standen nirgends, und
 * diese Datei rendete im Fallback ("Arial Narrow" / system-ui). Wer die
 * Deklaration in `globals.css` entfernt, stellt genau diesen Zustand wieder
 * her — still, ohne roten Test aus dieser Datei. Der Riegel dafuer sitzt in
 * `core/theme/schriftstapel.test.ts`, die Wirkung belegt
 * `e2e/lagerbuch-helfer.spec.ts`.
```

- [ ] **Step 9: Die vollen Tore fahren**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

Erwartet: alles grün. `bauform.test.ts` muss **ohne** Whitelist bestehen — falls nicht, sagt die
Fehlermeldung, welche Variable unaufgelöst ist; das ist ein echter Fund, kein Grund zur Rückkehr.

- [ ] **Step 10: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css src/app/layout.test.tsx src/app/layout.test.ts src/core/theme/schriftstapel.test.ts src/app/m/lagerbuch/_lib/bauform.test.ts src/app/m/lagerbuch/_ui/helfer.module.css
git commit -m "fix(theme): die drei Schrift-Rollenvariablen werden real, Whitelist faellt"
```

---

### Task 2: Playwright belegt, dass die Familie wirklich ankommt

**Files:**
- Modify: `e2e/lagerbuch-helfer.spec.ts` (ein Test am Ende ergänzen)

**Interfaces:**
- Consumes: `--font-display` auf `:root` aus Task 1
- Produces: nichts für spätere Aufgaben — dies ist die Wirkungszusicherung für Teil A

- [ ] **Step 1: Den Test schreiben**

Ans Ende von `e2e/lagerbuch-helfer.spec.ts` anfügen. **Vorher lesen**, wie die Datei ihren Zustand
herstellt (Gate-Code, Einstieg) — der Test muss seinen Zustand selbst herstellen und darf ihn nicht
vom Seed oder von einer früheren Datei erben.

```ts
test("der Helfer-Weg rendert die Display-Familie, nicht den Arial-Narrow-Fallback", async ({ page }) => {
  // DIE EINZIGE PRUEFUNG, DIE DEN URSPRUNGSFEHLER FAENGT.
  //
  // `--lb-display` loeste jahrelang gegen ein nicht existierendes
  // `--font-display` auf und fiel auf "Arial Narrow" zurueck. Im Quelltext ist
  // ein fehlgeschlagener Font-Fallback von einer erfolgreichen Zuweisung NICHT
  // zu unterscheiden — beide sehen aus wie `font-family: var(--lb-display)`.
  // Nur ein echter Browser weiss, was am Ende dasteht.
  //
  // Gemessen wird die aufgeloeste Variable und nicht `document.fonts`: ob die
  // Schriftdatei geladen wurde, ist eine andere (und flackernde) Frage — hier
  // geht es darum, dass die Kette der Variablen ueberhaupt traegt.
  await gehZumHelferEinstieg(page); // <- Namen aus der Datei uebernehmen

  const stapel = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim(),
  );
  expect(stapel, "--font-display ist auf :root nicht aufgeloest").not.toBe("");
  expect(stapel).toContain("Barlow");

  // Und die Rolle kommt auch an der Marke an, nicht nur an der Wurzel.
  const marke = page.getByTestId("helfer-marke"); // <- vorhandenes testid nutzen
  await expect(marke).toBeVisible();
  // ⚠️ NICHT `.not.toContain("Arial Narrow")` — das war der erste Entwurf und
  // er ist strukturell unerfuellbar. `getComputedStyle().fontFamily` liefert
  // den VOLLEN deklarierten Stapel, und "Arial Narrow" steht darin zweimal
  // voellig zu Recht: einmal als Fallback von `--font-display` (globals.css),
  // einmal als Fallback von `--lb-display` (helfer.module.css). Die Zusage
  // lautet nicht „Arial Narrow kommt nicht vor", sondern „Barlow kommt
  // ZUERST" — genau das unterscheidet den reparierten vom kaputten Zustand.
  const gerendert = await marke.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(gerendert.split(",")[0], `Marke rendert in: ${gerendert}`).toContain("Barlow");
});
```

**Falls `helfer-marke` nicht existiert:** das passende `data-testid` aus der Datei übernehmen oder
ein Element über `page.locator(...)` an seiner Klasse greifen — **kein neues `data-testid` erfinden**,
ohne es im Markup zu ergänzen.

- [ ] **Step 2: Sicherstellen, dass kein `pnpm dev` läuft**

```bash
lsof -ti:3100 || echo "Port 3100 frei"
```

Erwartet: `Port 3100 frei`. Falls belegt: den Prozess beenden, sonst startet Playwright nicht.

- [ ] **Step 3: Nur diesen Test laufen lassen**

```bash
pnpm exec playwright test e2e/lagerbuch-helfer.spec.ts -g "Display-Familie"
```

Erwartet: **PASS**. Bei `FAIL` mit `Arial Narrow` in der Meldung ist Task 1 unvollständig.

- [ ] **Step 4: Die ganze Datei laufen lassen**

```bash
pnpm exec playwright test e2e/lagerbuch-helfer.spec.ts
```

Erwartet: alle Tests grün — der neue Test darf keinen früheren stören.

- [ ] **Step 5: Commit**

```bash
git add e2e/lagerbuch-helfer.spec.ts
git commit -m "test(lagerbuch): Playwright belegt die Display-Familie im Helfer-Weg"
```

---

# Teil B — eine Rollen-Leiter der Suite

### Task 3: `core/theme/schrift.ts`

**Files:**
- Create: `src/core/theme/schrift.ts`
- Create: `src/core/theme/schrift.test.ts`

**Interfaces:**
- Consumes: `--font-display`, `--font-mono` aus Task 1
- Produces: `export const SCHRIFT` mit den Schlüsseln `titel`, `unterTitel`, `kicker`, `zahl`,
  `text`, `neben`, `mono` — jeweils `CSSProperties`. Und `export const ZIFFERN: CSSProperties`.
  Task 4 und 5 bauen ihre Adapter darauf; Task 7 und 9 setzen die Rollen direkt.

- [ ] **Step 1: Den Test schreiben**

Neue Datei `src/core/theme/schrift.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SCHRIFT, ZIFFERN } from "./schrift";

/**
 * DIE LEITER IST DIE ZUSICHERUNG, NICHT DER GESCHMACK.
 *
 * Was hier geprueft wird, sind die drei Regeln aus `docs/design/README.md`, die
 * ein spaeterer „schoenerer" Wert still brechen wuerde: keine dritte Skala,
 * Ziffern vergleichbar, und die Display-Rolle traegt wirklich die
 * Display-Familie (sonst ist der Umbau von 2026-08-12 wirkungslos und niemand
 * merkt es).
 */
const ANTD_LEITER = [12, 14, 16, 20, 24, 30];

describe("SCHRIFT — die Rollenleiter der Suite", () => {
  it("benutzt ausschliesslich antds Groeszenleiter", () => {
    for (const [rolle, wert] of Object.entries(SCHRIFT)) {
      expect(ANTD_LEITER, `${rolle} hat eine Groesze auszerhalb der Leiter`)
        .toContain(wert.fontSize);
    }
  });

  it("gibt den vier tragenden Rollen die Display-Familie", () => {
    for (const rolle of ["titel", "unterTitel", "kicker", "zahl"] as const) {
      expect(SCHRIFT[rolle].fontFamily, `${rolle} traegt nicht die Display-Familie`)
        .toContain("--font-display");
    }
  });

  it("laesst Fliesztext und Nebentext bei der Textfamilie", () => {
    for (const rolle of ["text", "neben"] as const) {
      expect(SCHRIFT[rolle].fontFamily ?? "", `${rolle} soll die Display-Familie NICHT tragen`)
        .not.toContain("--font-display");
    }
    expect(SCHRIFT.mono.fontFamily).toContain("--font-mono");
  });

  it("stellt Ziffern tabellarisch, wo sie verglichen werden", () => {
    for (const rolle of ["zahl", "text", "mono", "kicker"] as const) {
      expect(SCHRIFT[rolle].fontVariantNumeric, `${rolle} ohne tabular-nums`)
        .toContain("tabular-nums");
    }
    expect(ZIFFERN.fontVariantNumeric).toContain("tabular-nums");
  });

  it("traegt KEINE Farbe — die gehoert dem Traeger", () => {
    // Die zwei Adapter haben verschiedene Traeger: `feedback` faerbt ueber
    // `--fb-muted`, `lagerbuch` rendert unter `.modul` mit `--lb-stahl`. Eine
    // Farbe hier muesste einem der beiden aufgezwungen werden und aenderte 23
    // Seiten optisch, obwohl nur die Familie gemeint war.
    for (const [rolle, wert] of Object.entries(SCHRIFT)) {
      expect(wert.color, `${rolle} traegt eine Farbe`).toBeUndefined();
    }
  });

  it("versalisiert genau eine Rolle", () => {
    // Versalien sind der lauteste Griff der Leiter. Zwei Rollen mit Versalien
    // waeren zwei Kicker, und dann entscheidet der Zufall am Verwendungsort.
    const versal = Object.entries(SCHRIFT)
      .filter(([, w]) => w.textTransform === "uppercase")
      .map(([r]) => r);
    expect(versal).toEqual(["kicker"]);
  });
});
```

- [ ] **Step 2: Test laufen lassen und das Scheitern sehen**

```bash
pnpm vitest run src/core/theme/schrift.test.ts
```

Erwartet: **FAIL** — `Failed to resolve import "./schrift"`.

- [ ] **Step 3: Die Rollendatei schreiben**

Neue Datei `src/core/theme/schrift.ts`:

```ts
import type { CSSProperties } from "react";

/**
 * DIE TYPO-ROLLEN DER SUITE — Rollen statt Werte (`docs/design/README.md`).
 *
 * WARUM SIE NACH `core` DURFTE: der Maszstab ist ein zweiter, heute
 * belegbarer Nutznieszer, und er lag zweifach im Repo. `feedback/_ui/typo.ts`
 * (`T`) und `lagerbuch/_lib/schrift.ts` (`SCHRIFT`) waren zwei unabhaengig
 * entstandene Fassungen derselben Sache — beide auf antds Leiter, beide mit
 * tabellarischen Ziffern, verschieden nur in den Namen. Keine Vermutung ueber
 * kuenftigen Bedarf, sondern eine bereits eingetretene Verdopplung. Beide sind
 * jetzt Adapter ueber dieser Datei und behalten ihre Namen.
 *
 * KEIN "use client" (Falle 6): Server Components lesen diese Konstante — die 23
 * Verwaltungsseiten des Lagerbuchs setzen ihre Ueberschrift damit. Aus einem
 * Client-Modul kaeme eine Client-Referenz statt des Objekts, HTTP 500 fuer die
 * ganze Seite, und Vitest koennte es strukturell nicht finden.
 *
 * KEINE NEUEN GROESZEN. Alle Werte liegen auf antds Leiter (12/14/16/20/24/30).
 * Der Charakter kommt aus den ANDEREN vier Achsen — Familie, Versalien und
 * Laufweite, Gewicht, Ziffernstellung. Genau so hat es das alte Lagerbuch
 * gemacht, dessen Anmutung hier zurueckkommt: es benutzte keine exotischen
 * Groeszen, sondern Barlow Condensed und ein durchgehendes Kicker-Muster.
 *
 * KEINE FARBE. Sie gehoert dem Traeger, nicht der Rolle: `feedback` faerbt
 * ueber `--fb-muted`, `lagerbuch` unter `.modul` ueber `--lb-stahl`, Shell und
 * Portal ueber `--iuk-gedaempft`. Eine Farbe hier muesste einem der drei
 * aufgezwungen werden. Wer Nebentext gedaempft braucht, setzt die Farbe am
 * Verwendungsort dazu.
 *
 * `lineHeight` steht nur dort, wo es eine Aussage traegt. Sonst gilt antds
 * Vorgabe — es wird kein Wert erfunden, den ein spaeterer Leser fuer geprueft
 * haelt.
 */

/**
 * Ziffern durchgehend tabellarisch: Zaehler, Mittelwerte und Datumsangaben
 * stehen in Tabellen und Karten untereinander — mit proportionalen Ziffern
 * wandert die Spalte bei jedem Wert.
 *
 * Exportiert fuer Stellen mit einer Groesze auszerhalb der Leiter (die
 * Notenplakette im Modul `feedback`, 40/700): sie brauchen die Ziffernstellung,
 * nicht die Groesze einer Rolle.
 */
export const ZIFFERN: CSSProperties = { fontVariantNumeric: "tabular-nums lining-nums" };

const DISPLAY = "var(--font-display)";
const MONO = "var(--font-mono)";

export const SCHRIFT: {
  titel: CSSProperties;
  unterTitel: CSSProperties;
  kicker: CSSProperties;
  zahl: CSSProperties;
  text: CSSProperties;
  neben: CSSProperties;
  mono: CSSProperties;
} = {
  /** 24/600 — Seitentitel, `<h1>`. */
  titel: {
    ...ZIFFERN,
    fontFamily: DISPLAY,
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: "0.02em",
    lineHeight: 1.2,
  },
  /** 20/600 — Abschnitt zweiter Ordnung; auch Wortmarke und Modultitel der Shell. */
  unterTitel: {
    ...ZIFFERN,
    fontFamily: DISPLAY,
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: "0.02em",
  },
  /** 12/600 versal — Kartentitel, Spaltenkoepfe, Feldbeschriftungen, Achsenlabel. */
  kicker: {
    ...ZIFFERN,
    fontFamily: DISPLAY,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
  },
  /** 30/700 — Zaehler und KPI-Werte. `lineHeight: 1`, damit die Zahl nicht schwebt. */
  zahl: {
    ...ZIFFERN,
    fontFamily: DISPLAY,
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1,
  },
  /** 14/400 — Fliesztext, Tabellenzellen. */
  text: { ...ZIFFERN, fontSize: 14, fontWeight: 400 },
  /** 12/400 — Metazeilen, Hilfetexte, Fristen. */
  neben: { ...ZIFFERN, fontSize: 12, fontWeight: 400 },
  /** 12/400 Mono — Journalzeilen, Zugangscodes, IDs, Fachnummern. */
  mono: { ...ZIFFERN, fontFamily: MONO, fontSize: 12, fontWeight: 400 },
};

export type SchriftRolle = keyof typeof SCHRIFT;
```

- [ ] **Step 4: Test laufen lassen**

```bash
pnpm vitest run src/core/theme/schrift.test.ts
```

Erwartet: **PASS**, sechs Tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/theme/schrift.ts src/core/theme/schrift.test.ts
git commit -m "feat(theme): Typo-Rollenleiter der Suite, belegt durch zwei vorhandene Fassungen"
```

---

### Task 4: `feedback` wird Adapter

**Files:**
- Modify: `src/app/m/feedback/_ui/typo.ts` (vollständig ersetzt, Exportnamen bleiben)
- Test: bestehende Tests des Moduls; `pnpm vitest run src/app/m/feedback`

**Interfaces:**
- Consumes: `SCHRIFT`, `ZIFFERN` aus `@/core/theme/schrift` (Task 3)
- Produces: `export const T` mit **unveränderten** Schlüsseln `kicker`, `meta`, `body`, `lead`,
  `h2`, `h1`, `zahl` und `export const ZIFFERN`, `export type TypoRolle`. Keine aufrufende Datei
  ändert sich.

- [ ] **Step 1: Prüfen, welche Schlüssel das Modul wirklich benutzt**

```bash
grep -rn "T\.\(kicker\|meta\|body\|lead\|h2\|h1\|zahl\)\|TypoRolle\|ZIFFERN" src/app/m/feedback/ | wc -l
grep -rhn -o "T\.[a-z0-9]*" src/app/m/feedback/ | sort -u
```

Notieren: jeder gefundene Schlüssel **muss** im Adapter erhalten bleiben.

- [ ] **Step 2: Den Adapter schreiben**

`src/app/m/feedback/_ui/typo.ts` — der Kopfkommentar wird ergänzt, nicht ersetzt:

```ts
import type { CSSProperties } from "react";
import { SCHRIFT, ZIFFERN as ZIFFERN_SUITE } from "@/core/theme/schrift";

/**
 * DIE TYPO-LEITER DES MODULS — SEIT 2026-08-12 EIN ADAPTER.
 *
 * Die Werte kommen aus `core/theme/schrift.ts`. Der Grund fuer den Umzug: die
 * Leiter dieses Moduls und die von `lagerbuch` waren zwei unabhaengig
 * entstandene Fassungen derselben Sache — beide auf antds Leiter, beide mit
 * tabellarischen Ziffern, verschieden nur in den Namen. Das ist der zweite,
 * heute belegbare Nutznieszer, den `docs/design/README.md` fuer `core` verlangt.
 *
 * DIE NAMEN DIESES MODULS BLEIBEN. `T.kicker`, `T.meta`, `T.body` … stehen an
 * ueber hundert Stellen; sie umzubenennen waere Arbeit ohne Ertrag und ein
 * Risiko ohne Gegenwert. Der Adapter ist die billigere Haelfte.
 *
 * DIE FARBE BLEIBT EBENFALLS HIER. `core` traegt bewusst keine — sonst muesste
 * sie einem der beiden Module aufgezwungen werden. `--fb-muted` ist die Farbe
 * DIESES Entwurfs (§4.7), und sie ist nicht `--ant-*`: antd deklariert seine
 * Variablen auf der Scope-Klasse SEINER Komponenten, eigenes Markup sieht sie
 * nie, und der Ausfall waere still. Die eigenen Variablen stehen in
 * `feedback.css`.
 *
 * WAS SICH SICHTBAR AENDERT: `kicker`, `h1`, `h2` und `zahl` tragen jetzt die
 * Display-Familie der Suite (Barlow Condensed). Groeszen, Gewichte und
 * Laufweiten sind unveraendert — der Entwurf §4.7 gilt weiter.
 *
 * WAS HIER BLEIBT UND NICHT NACH `core` DARF: `lead` (16/600). Die Rolle hat in
 * `lagerbuch` kein Gegenstueck; eine Rolle mit einem Anwender ist eine
 * Konvention, keine Komponente — dieselbe Regel, die den Umzug rechtfertigt.
 */

export const ZIFFERN: CSSProperties = ZIFFERN_SUITE;

export const T = {
  /** 12/600, uppercase — Kartentitel, Spaltenkoepfe, Achsenlabel, Feld-Labels. */
  kicker: { ...SCHRIFT.kicker, color: "var(--fb-muted)" },
  /** 12/400 — Metazeilen, Fristen, Hilfetexte, Feldfehler, Zeichenzaehler. */
  meta: { ...SCHRIFT.neben, color: "var(--fb-muted)" },
  /** 14/400 — Fliesztext, Tabellenzellen, Fragetexte. */
  body: SCHRIFT.text,
  /**
   * 16/600 — Gruppenname auf Einstiegskarten, Kartenueberschrift 2. Ordnung.
   * MODULEIGEN: 16 liegt auf antds Leiter, aber die Rolle hat auszerhalb dieses
   * Moduls keinen Anwender (siehe Kopf).
   */
  lead: { ...ZIFFERN_SUITE, fontSize: 16, fontWeight: 600 },
  /** 20/600 — Ueberschrift der Lagekarte, `Statistic` „Letzter Abend". */
  h2: SCHRIFT.unterTitel,
  /** 24/600 — `<h1>`. */
  h1: SCHRIFT.titel,
  /** 30/600 — NUR der laufende Ruecklaufzaehler. Sonst nirgends. */
  zahl: { ...SCHRIFT.zahl, fontWeight: 600 },
} satisfies Record<string, CSSProperties>;

export type TypoRolle = keyof typeof T;
```

**Beachte `zahl`:** der Entwurf des Moduls sagt 30/**600**, die Suite-Rolle ist 30/**700**. Das
Gewicht wird hier zurückgesetzt, damit der Entwurf gilt — und es ist kommentiert, damit es niemand
als Versehen glattzieht.

- [ ] **Step 3: Modultests laufen lassen**

```bash
pnpm typecheck && pnpm vitest run src/app/m/feedback
```

Erwartet: **PASS**. Bei Typfehlern über fehlende Schlüssel: Step 1 hat einen übersehen — ergänzen,
nicht die aufrufende Datei ändern.

- [ ] **Step 4: Commit**

```bash
git add src/app/m/feedback/_ui/typo.ts
git commit -m "refactor(feedback): Typo-Leiter wird Adapter ueber core/theme/schrift"
```

---

### Task 5: `lagerbuch` wird Adapter, Annahme A-S1 wird ausgetragen

**Files:**
- Modify: `src/app/m/lagerbuch/_lib/schrift.ts` (vollständig ersetzt, Exportname bleibt)
- Test: `src/app/m/lagerbuch/_lib/schrift.test.ts` (bestehend — prüfen, was er festhält)

**Interfaces:**
- Consumes: `SCHRIFT` aus `@/core/theme/schrift` (Task 3)
- Produces: `export const SCHRIFT` mit **unveränderten** Schlüsseln `titel`, `abschnitt`,
  `feldname`, `text`, `neben`, `zahl`, `mono`. Alle 23 Verwaltungsseiten bleiben unangetastet.

- [ ] **Step 1: Lesen, was der bestehende Test festhält**

```bash
cat src/app/m/lagerbuch/_lib/schrift.test.ts
```

Er prüft heute unter anderem `fontFamily: "var(--font-geist-mono)"` an `mono` (Zeile 40). Das wird
`var(--font-mono)` — der Test **muss** mitgeändert werden, und zwar bewusst: er ist die Stelle, an
der der Familienwechsel dokumentiert ist.

- [ ] **Step 2: Den Test auf die neue Zusage stellen**

In `src/app/m/lagerbuch/_lib/schrift.test.ts` die Mono-Erwartung ändern und eine Zusage für die
Display-Familie ergänzen:

```ts
  it("bezieht die Mono-Rolle ueber die Suite-Rolle, nicht ueber Geist direkt", () => {
    // `--font-mono` statt `--font-geist-mono`: ein Schriftwechsel ist damit eine
    // Zeile in `globals.css` statt einer Suche ueber alle Module.
    expect(SCHRIFT.mono.fontFamily).toBe("var(--font-mono)");
  });

  it("gibt Titel, Abschnitt, Feldname und Zahl die Display-Familie", () => {
    // DIE RUECKNAHME VON A-S1, festgehalten statt stillschweigend: bis
    // 2026-08-12 bekam die Verwaltung bewusst Geist, weil die Display-Rolle
    // hier Struktur trug und nicht Marke. Der Auftrag hat das umgedreht.
    for (const rolle of ["titel", "abschnitt", "feldname", "zahl"] as const) {
      expect(SCHRIFT[rolle].fontFamily, `${rolle} ohne Display-Familie`)
        .toBe("var(--font-display)");
    }
  });
```

- [ ] **Step 3: Test laufen lassen und das Scheitern sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/schrift.test.ts
```

Erwartet: **FAIL** in beiden neuen Tests.

- [ ] **Step 4: Den Adapter schreiben**

`src/app/m/lagerbuch/_lib/schrift.ts` vollständig ersetzen:

```ts
import type { CSSProperties } from "react";
import { SCHRIFT as SUITE } from "@/core/theme/schrift";

/**
 * ROLLEN STATT WERTE — SEIT 2026-08-12 EIN ADAPTER ueber `core/theme/schrift.ts`.
 *
 * KEIN "use client" (Falle 6): Server Components lesen diese Konstante — jede
 * der 23 Seiten setzt ihre Ueberschrift damit. Aus einem Client-Modul kaeme eine
 * Client-Referenz statt des Objekts, HTTP 500 fuer die ganze Seite.
 *
 * ⚠️ ANNAHME A-S1 IST ZURUECKGENOMMEN, UND ZWAR AUSDRUECKLICH.
 *
 * Hier stand: „DIE VERWALTUNG BEKOMMT GEIST — den Suite-Standard, ohne die drei
 * Google-Schriften des Bestands. Die Display-Rolle trug in der Verwaltung
 * Struktur, nicht Marke — und Struktur laesst sich mit Groesze, Gewicht,
 * Laufweite und Versalien ebenso ausdruecken."
 *
 * Das war richtig gedacht und ist ueberholt. Der Auftrag vom 2026-08-12 lautete,
 * die Anmutung des alten Lagerbuchs zurueckzuholen; die Suite laedt seither
 * Barlow Condensed als `--font-display`. Die Rueckname steht HIER und nicht nur
 * im Entwurf, weil eine stillschweigende Umkehr fuer den naechsten Leser nicht
 * von einem Versehen zu unterscheiden waere.
 *
 * A-S1 SELBST BLEIBT OFFEN und unberuehrt: sie sagt „die drei Schriften sind
 * KEINE CD-Vorgabe" (Betreiberfrage 29, unbeantwortet). Daraus folgte die
 * FREIHEIT, Geist zu waehlen — nie die Pflicht. Dieselbe Freiheit traegt jetzt
 * die andere Wahl. Und weil das hier Rollen sind und keine Schriftnamen, aendert
 * eine Antwort auf Frage 29 nur `app/globals.css`, nicht diese Datei.
 *
 * DIE NAMEN BLEIBEN. `SCHRIFT.titel`, `.abschnitt`, `.feldname` … stehen auf 23
 * Seiten; der Adapter ist die billigere Haelfte. Farbe traegt `core` bewusst
 * nicht — die Verwaltung rendert unter `.modul` und faerbt ueber `--lb-stahl`
 * am Verwendungsort.
 */
export const SCHRIFT: {
  titel: CSSProperties;
  abschnitt: CSSProperties;
  feldname: CSSProperties;
  text: CSSProperties;
  neben: CSSProperties;
  zahl: CSSProperties;
  mono: CSSProperties;
} = {
  /** Seitentitel. */
  titel: SUITE.titel,
  /** Abschnittsueberschrift — ersetzte `.secthead` und `.cardtitle`. */
  abschnitt: SUITE.kicker,
  /** Feldbeschriftung — ersetzte `.label`. Optisch gleich dem Abschnitt, und
   *  das ist Absicht: zwei Namen fuer eine Gestalt, weil sie an verschiedenen
   *  Orten verschieden gelesen werden und getrennt wandern duerfen. */
  feldname: SUITE.kicker,
  /** Fliesztext und Tabelleninhalt. */
  text: SUITE.text,
  /** Nebentext — ersetzte `.rowmeta small`, `.cardnote`, `.mainhead p`. */
  neben: SUITE.neben,
  /**
   * Grosze Zahl — ersetzte `.bignum`, `.kpi b`, `.tbl .num`.
   * 24, NICHT die 30 der Suite-Rolle: die Verwaltung setzt sie in KPI-Kacheln
   * nebeneinander, und 30 sprengt dort die Zeile. 24 liegt auf antds Leiter.
   */
  zahl: { ...SUITE.zahl, fontSize: 24 },
  /** Fachinformation in Mono — Fachnummern, Journalzeilen, Zugangs-Codes. */
  mono: SUITE.mono,
};
```

- [ ] **Step 5: Tests laufen lassen**

```bash
pnpm typecheck && pnpm vitest run src/app/m/lagerbuch
```

Erwartet: **PASS**. Achte auf `CheckDetailTabellen.test.tsx:147`, das `style.fontFamily` prüft —
falls es `--font-geist-mono` erwartet, mit ändern und im Test begründen.

- [ ] **Step 6: Commit**

```bash
git add src/app/m/lagerbuch/_lib/schrift.ts src/app/m/lagerbuch/_lib/schrift.test.ts
git commit -m "refactor(lagerbuch): Rollen werden Adapter, Annahme A-S1 ausgetragen"
```

---

# Teil C — Farbvariablen und die geschriebene Regel

### Task 6: Die drei `--iuk-*`-Variablen und der README-Nachtrag

**Files:**
- Modify: `src/app/globals.css` (nach dem Schrift-`:root`-Block)
- Modify: `src/core/theme/schriftstapel.test.ts` (ein Block für den Dunkelzweig)
- Modify: `docs/design/README.md` (zwei Abschnitte)

**Interfaces:**
- Consumes: nichts
- Produces: `--iuk-marke`, `--iuk-gedaempft`, `--iuk-linie` auf `:root` und unter
  `:root[data-theme="dark"]`. Task 7, 8 und 9 benutzen sie.

- [ ] **Step 1: Den Test für den Dunkelzweig schreiben**

An `src/core/theme/schriftstapel.test.ts` anhängen (die Datei ist der Ort für Scans auf
`globals.css`; eine zweite Scan-Datei für dieselbe Datei wäre Streuung):

```ts
describe("Suite-Farbvariablen fuer eigenes Markup", () => {
  const IUK = ["--iuk-marke", "--iuk-gedaempft", "--iuk-linie"];

  it("deklariert jede --iuk-* auf :root", () => {
    for (const name of IUK) {
      expect(css, `${name} fehlt auf :root`).toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it("gibt jeder --iuk-* einen Dunkelzweig", () => {
    // Das alte Lagerbuch, dessen Palette hier einzieht, HATTE keinen
    // Dunkelmodus. Jede portierte Farbe braucht ein Gegenstueck, sonst steht
    // sie im Dunkelmodus auf einem Wert, den niemand geprueft hat.
    const dunkel = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
    expect(dunkel, "kein Dunkelzweig in globals.css").not.toBeNull();
    for (const name of IUK) {
      expect(dunkel![1]!, `${name} fehlt im Dunkelzweig`)
        .toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it("schaltet ueber data-theme, nicht ueber prefers-color-scheme", () => {
    // `prefers-color-scheme` braeche den Fall „System dunkel, Umschalter hell".
    expect(css).not.toMatch(/prefers-color-scheme/);
  });
});
```

- [ ] **Step 2: Test laufen lassen und das Scheitern sehen**

```bash
pnpm vitest run src/core/theme/schriftstapel.test.ts
```

Erwartet: **FAIL** — `--iuk-marke fehlt auf :root`.

- [ ] **Step 3: Die Variablen in `globals.css` deklarieren**

Direkt nach dem Schrift-`:root`-Block einfügen:

```css
/*
 * DIE FARBEN, DIE EIGENES MARKUP BRAUCHT — und nur die.
 *
 * `core/theme/tokens.ts` bleibt die Datei mit den Suite-Hex-Codes; von dort
 * stammen diese Werte. Sie stehen hier ZUSAETZLICH als CSS-Variablen, weil
 * eigenes Markup (Shell, Portal, Modul-CSS) keinen Zugriff auf TypeScript hat
 * und `--ant-*` nicht sehen kann: antd deklariert die auf der Scope-Klasse
 * SEINER Komponenten, nicht auf `:root`. Der Ausfall waere still — die Farbe
 * verschwindet einfach (Falle 2).
 *
 * NUR DREI, UND DAS IST DER MASZSTAB, KEIN ANFANG. Nach `core` kommt, was einen
 * heute belegbaren Anwender hat. Das Farbvokabular des alten Lagerbuchs
 * (KPI-Kante, getoente Chips, Abschnittsstreifen, Journal-Deltas) hat genau
 * EINEN Anwender — `app/m/lagerbuch/_ui/verwaltung.module.css`, wo es steht und
 * bleibt. Es hierher zu heben waere ein Framework fuer einen Nutzer. Was das
 * naechste Modul davon nachbauen soll, steht in `docs/design/README.md`.
 *
 * DER DUNKELZWEIG IST KEINE ZUGABE. Das Vorbild hatte gar keinen Dunkelmodus;
 * seine Palette ist durchgehend hell. Jede portierte Farbe braucht deshalb ein
 * geprueftes Gegenstueck. Die Werte hier stammen aus dem Dunkelzweig von
 * `verwaltung.module.css`, wo die Frage schon einmal beantwortet wurde.
 *
 * `--iuk-marke` ist im Dunkeln NICHT `#c8000f`: auf nahezu Schwarz reicht der
 * Kontrast fuer 14px-Text nicht. antds Dunkel-Algorithmus rechnet sich seine
 * eigene Primaerfarbe aus; eigenes Markup muss das selbst tun.
 */
:root {
  --iuk-marke: #c8000f;
  --iuk-gedaempft: #5b6570;
  --iuk-linie: #d9dde1;
}

:root[data-theme="dark"] {
  --iuk-marke: #e04452;
  --iuk-gedaempft: #9aa4ad;
  --iuk-linie: #2a2f34;
}
```

- [ ] **Step 4: Test laufen lassen**

```bash
pnpm vitest run src/core/theme/schriftstapel.test.ts
```

Erwartet: **PASS**, alle Blöcke.

- [ ] **Step 5: `docs/design/README.md` — Abschnitt „Typografie" ergänzen**

Am Ende des bestehenden Abschnitts „Typografie" anfügen:

```markdown
### Die drei Schrift-Rollen der Suite

`app/globals.css` deklariert auf `:root`:

| Variable | Rolle | heute |
|---|---|---|
| `--font-display` | Marke, Kicker, Überschriften, große Zahlen | Barlow Condensed |
| `--font-body` | Fließtext, Formulare, Tabelleninhalt | Geist |
| `--font-mono` | Journal, Codes, IDs, Fachnummern | Geist Mono |

Es sind **Rollennamen, keine Schriftnamen** — ein Wechsel ist eine Zeile in `globals.css`.
Modul-CSS zieht daraus seine eigenen Variablen (`--lb-display` im Lagerbuch); TypeScript-Rollen
stehen in `core/theme/schrift.ts`, die beiden Module sind Adapter darüber.

**Das war einmal ein toter Vertrag**, und das ist die Warnung, die bleibt: `helfer.module.css`
benutzte diese drei Namen, das Wurzel-Layout registrierte sie nicht, und der Helfer-Weg rendete
über Monate im Fallback „Arial Narrow". Ein Test nahm die drei Namen per Whitelist von seiner
Prüfung aus. **Eine unaufgelöste CSS-Variable meldet sich nie** — der Riegel ist
`core/theme/schriftstapel.test.ts` (prüft Deklaration *und* Registrierung), die Wirkung belegt
allein Playwright über `getComputedStyle(...).fontFamily`.
```

- [ ] **Step 6: `docs/design/README.md` — Abschnitt „Farben" ergänzen**

Im Abschnitt „Farben und fachsemantische Paletten" nach der Liste der drei Farbrollen anfügen:

```markdown
### Rot: Chrome ja, Datenfläche nein

`colorError === colorPrimary === #c8000f` (Falle 3) zwingt zu einer Linie, die anderswo nicht nötig
wäre:

- **Rot auf Chrome** — Markenstreifen, aktiver Navigationseintrag, Wortmarke, Gefahrenzone: ja.
- **Rot auf einer Datenfläche** in einem Modul, wo Rot fachlich etwas bedeutet: **nie**. Dort gilt
  eine eigene, getrennte Ampelfarbe.

`lagerbuch` trennt `--lb-ampel-rot-text` (`#8c0d16`) von `--lb-rot` (`#c8000f`); `feedback` hält Rot
ganz von der Notenskala fern. Die Trennung ist gelebte Praxis, hier nur aufgeschrieben.

### Eigenes Markup: `--iuk-*`, nie `--ant-*`

`app/globals.css` führt drei Suite-Variablen mit Dunkelzweig: `--iuk-marke`, `--iuk-gedaempft`,
`--iuk-linie`. Mehr steht dort bewusst nicht — der Maßstab für `core` ist ein zweiter, heute
belegbarer Nutznießer.

### Das Farbvokabular für Arbeitsflächen

Vorlage ist `app/m/lagerbuch/_ui/verwaltung.module.css`; es steht dort, weil es heute genau einen
Anwender hat. Wer als zweites Modul dasselbe braucht, baut es **so** nach — und dann darf es
umziehen:

| Baustein | Griff |
|---|---|
| KPI-Kachel | `border-inline-start: 4px` in der Ampelfarbe, sonst neutral |
| Chip | Fläche **und** Text als Paar (`…-flaeche` + `…-text`), nie antds `Tag`-Vorgabe |
| Abschnittsstreifen in Karten | eigene Fläche, hell `#f6f8f9`, dunkel `#1c2024` |
| Journal-Delta | grün/rot **plus Vorzeichen** — Bedeutung nie allein über Farbe |
| Gefahrenzone | 1px Kontur in Markenrot, versaler Titel |

Jede dieser Farben braucht ein geprüftes Gegenstück für den Dunkelmodus. **Das Vorbild, aus dem sie
stammen, hatte keinen** — seine Palette ist durchgehend hell, und das ist der größte versteckte
Posten bei jeder Portierung daraus.
```

- [ ] **Step 7: Volle Tore**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css src/core/theme/schriftstapel.test.ts docs/design/README.md
git commit -m "feat(theme): drei Suite-Farbvariablen mit Dunkelzweig, Regeln im Design-README"
```

---

# Teil D — sichtbar in Shell und Portal

### Task 7: Markenstreifen und Kopfzeilentypografie

**Files:**
- Modify: `src/core/shell/SuiteHeader.tsx:63-66` (Streifen als Geschwister vor `<Header>`)
- Modify: `src/core/shell/shell.module.css` (`.streifen`, `.titel`, `.drawerTitel`)
- Modify: `src/core/shell/shell-css.test.ts` (Scans)

**Interfaces:**
- Consumes: `--iuk-marke`, `--iuk-gedaempft` (Task 6); `SCHRIFT.unterTitel`, `SCHRIFT.kicker` (Task 3)
- Produces: die CSS-Klasse `.streifen` in `shell.module.css`; Task 8 fasst dieselbe Datei an.

- [ ] **Step 1: Die Scans schreiben**

An `src/core/shell/shell-css.test.ts` anhängen:

```ts
describe("Markenstreifen und Kopfzeilentypografie", () => {
  it("legt den Streifen als eigene Klasse an, nicht als Kante an .kopf", () => {
    // EIN EIGENES ELEMENT STATT EINER KANTE AN DER ANTD-FLAECHE, und das ist
    // kein Stil: `.kopf` und `.ant-layout-header` sind beide (0,1,0), antds
    // Stylesheet kommt spaeter. Eine `border-block-start` an `.kopf` waere
    // derselbe Streit, den `padding-inline` an dieser Stelle schon einmal
    // verloren hat (gemessen, siehe Kopf dieser Datei). Ein eigenes Element ist
    // keiner.
    expect(css).toMatch(/\.streifen\s*\{[^}]*background:\s*var\(--iuk-marke\)/);
    expect(css).toMatch(/\.streifen\s*\{[^}]*height:\s*5px/);
    expect(css).not.toMatch(/\.kopf\s*\{[^}]*border-block-start/);
  });

  it("faerbt den Drawer-Gruppentitel ueber die Suite-Variable statt ueber opacity", () => {
    // `opacity: 0.6` dimmt auch den Kontrast des Hintergrunds mit und ist als
    // Farbaussage nicht pruefbar. Eine Variable ist es.
    const regel = css.match(/\.drawerTitel\s*\{([^}]*)\}/);
    expect(regel, ".drawerTitel fehlt").not.toBeNull();
    expect(regel![1]!).toMatch(/color:\s*var\(--iuk-gedaempft\)/);
    expect(regel![1]!, "opacity als Farbersatz ist raus").not.toMatch(/opacity/);
  });
});
```

**Vorher lesen:** wie `shell-css.test.ts` die Datei einliest (Variablenname `css` oder eine
`lies()`-Funktion) und die Schreibweise übernehmen.

- [ ] **Step 2: Scans laufen lassen und das Scheitern sehen**

```bash
pnpm vitest run src/core/shell/shell-css.test.ts
```

Erwartet: **FAIL** in beiden neuen Tests.

- [ ] **Step 3: CSS ergänzen**

In `src/core/shell/shell.module.css`, vor `.kopf`:

```css
/*
 * DER MARKENSTREIFEN — 5px, der billigste Griff mit der groeszten Wirkung.
 * Uebernommen aus dem alten Lagerbuch (`.stripe`), das ihn ueber jeder Ansicht
 * trug.
 *
 * EIGENES ELEMENT, KEINE KANTE AN `.kopf`. `.kopf` und `.ant-layout-header`
 * sind beide (0,1,0), und antds Stylesheet kommt spaeter — eine
 * `border-block-start` dort waere derselbe Spezifitaetsstreit, den
 * `padding-inline` an genau dieser Stelle schon einmal verloren hat. Ein
 * eigenes Element steht auszerhalb des Streits.
 *
 * `flex: none`, damit es in keinem Flex-Kontext zusammengedrueckt wird, und
 * `--iuk-marke` statt `--ant-color-primary`: eigenes Markup sieht antds
 * Variablen nicht (Falle 2), der Streifen waere still unsichtbar.
 */
.streifen {
  height: 5px;
  flex: none;
  background: var(--iuk-marke);
}
```

`.drawerTitel` ändern (die Regel steht heute bei Zeile ~250):

```css
.drawerTitel {
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  /* `--iuk-gedaempft` statt `opacity: 0.6`: Deckkraft dimmt den Kontrast
     unpruefbar mit und traegt in beiden Modi verschieden. Eine Variable hat
     einen Dunkelzweig, eine Deckkraft nicht. */
  color: var(--iuk-gedaempft);
  padding-inline: 16px;
  padding-block: 8px;
}
```

- [ ] **Step 4: Den Streifen rendern und den Titel setzen**

In `src/core/shell/SuiteHeader.tsx` das Fragment erweitern — der Streifen steht **vor**
`<Header>`, als erstes Geschwister:

```tsx
  return (
    <>
      {/* Vor der Kopfzeile, nicht darin: eine Kante an der antd-Flaeche waere ein
          Spezifitaetsstreit, ein eigenes Element ist keiner. `aria-hidden`, weil
          der Streifen reine Marke ist und nichts vorliest. */}
      <div className={s.streifen} aria-hidden="true" />
      <Header data-testid="suite-header" className={s.kopf}>
```

Und den Modultitel auf die Rolle stellen (Import `SCHRIFT` aus `@/core/theme/schrift` ergänzen):

```tsx
        <Link href={moduleUrl(moduleKey) ?? "/"} className={s.titel}>
          {/* `data-testid` bleibt auf dem `<strong>` — der Keystone-E2E fragt es
              dort ab. Die Rolle `unterTitel` (20/600) statt `titel` (24): die
              Kopfzeile ist 64px hoch, 24px waeren darin zu laut. Die Sperrung
              des Vorbilds kommt hier dazu, statt eine achte Rolle mit einem
              einzigen Anwender anzulegen. */}
          <strong data-testid="module-title" style={{ ...SCHRIFT.unterTitel, letterSpacing: "0.07em" }}>
            {mod.title}
          </strong>
        </Link>
```

- [ ] **Step 5: Scans und Shell-Tests laufen lassen**

```bash
pnpm typecheck && pnpm vitest run src/core/shell
```

Erwartet: **PASS**. `SuiteHeader.test.tsx` prüft heute die Struktur — falls es die Kinderzahl des
Fragments festhält, mit anpassen und den Streifen dort benennen.

- [ ] **Step 6: Commit**

```bash
git add src/core/shell/shell.module.css src/core/shell/SuiteHeader.tsx src/core/shell/shell-css.test.ts
git commit -m "feat(shell): Markenstreifen und Display-Schnitt in der Kopfzeile"
```

---

### Task 8: Der Aktivzustand der Modulnavigation wird rot

**Files:**
- Modify: `src/core/shell/shell.module.css` (`.navLink[aria-current]`)
- Modify: `src/core/shell/shell-css.test.ts` (Scan)

**Interfaces:**
- Consumes: `--iuk-marke` (Task 6)
- Produces: nichts für spätere Aufgaben

- [ ] **Step 1: Den Scan schreiben**

An `src/core/shell/shell-css.test.ts` anhängen:

```ts
it("markiert den aktiven Navigationseintrag in Markenrot UND mit Gewicht", () => {
  // BEDEUTUNG NIE ALLEIN UEBER FARBE. `font-weight: 600` stand hier schon und
  // BLEIBT — wer die Farbe fuer ausreichend haelt und das Gewicht entfernt,
  // nimmt rot-gruen-blinden Nutzern und Graustufendruck die Markierung ganz.
  const regel = css.match(/\.navLink\[aria-current\]\s*\{([^}]*)\}/);
  expect(regel, ".navLink[aria-current] fehlt").not.toBeNull();
  expect(regel![1]!).toMatch(/border-block-end-color:\s*var\(--iuk-marke\)/);
  expect(regel![1]!).toMatch(/color:\s*var\(--iuk-marke\)/);
  expect(regel![1]!, "das Gewicht ist die farbfreie Haelfte der Markierung")
    .toMatch(/font-weight:\s*600/);
});
```

- [ ] **Step 2: Scan laufen lassen und das Scheitern sehen**

```bash
pnpm vitest run src/core/shell/shell-css.test.ts -t "Markenrot"
```

Erwartet: **FAIL** — die Regel trägt heute `currentColor`.

- [ ] **Step 3: Die Regel ändern**

In `src/core/shell/shell.module.css` — der bestehende Kommentar über `[aria-current]` (zur
Wertlosigkeit von `="page"`) **bleibt stehen** und wird ergänzt:

```css
/*
 * ROT STATT `currentColor`, seit 2026-08-12: die Aktivmarkierung ist der eine
 * Ort in der Chrome, an dem Markenfarbe eine Aussage traegt statt Dekoration zu
 * sein. `--iuk-marke` und nicht `--ant-color-primary` — eigenes Markup sieht
 * antds Variablen nicht (Falle 2), die Markierung fiele still auf `inherit`
 * zurueck und saehe wie „nicht aktiv" aus.
 *
 * `font-weight: 600` BLEIBT und ist nicht redundant: Bedeutung nie allein ueber
 * Farbe. Ohne das Gewicht verliert die Markierung bei Rot-Gruen-Blindheit und
 * in Graustufen ihre einzige Spur.
 */
.navLink[aria-current] {
  border-block-end-color: var(--iuk-marke);
  color: var(--iuk-marke);
  font-weight: 600;
}
```

- [ ] **Step 4: Scan laufen lassen**

```bash
pnpm vitest run src/core/shell
```

Erwartet: **PASS**.

- [ ] **Step 5: Commit**

```bash
git add src/core/shell/shell.module.css src/core/shell/shell-css.test.ts
git commit -m "feat(shell): aktiver Navigationseintrag in Markenrot, Gewicht bleibt"
```

---

### Task 9: Portal-Kacheln

**Files:**
- Modify: `src/app/m/portal/page.tsx`
- Modify: `src/app/m/portal/portal.css` (Kachelkante)

**Interfaces:**
- Consumes: `SCHRIFT` (Task 3), `--iuk-marke`/`--iuk-gedaempft`/`--iuk-linie` (Task 6)
- Produces: nichts für spätere Aufgaben

- [ ] **Step 1: `portal.css` lesen und die Kantenregel ergänzen**

```bash
cat src/app/m/portal/portal.css
```

Ergänzen (Klassennamen an die Konventionen der Datei anpassen — `.module.css` oder global prüfen):

```css
/*
 * DIE KACHELKANTE — ein Akzent, keine Palette je Modul.
 *
 * Der Entwurf sprach von „einer farbigen Innenkante je Modul". Eine Palette je
 * Modul existiert nicht und muesste erfunden werden; die einzige Markenfarbe
 * der Suite ist Rot, und Rot darf laut Design-README nicht beliebig auf
 * Flaechen. Also: eine ruhige Kante, die bei Hover und Fokus auf Markenrot
 * wechselt. Ein Zustand, eine Farbe.
 *
 * `:focus-within` neben `:hover`, weil die Kachel per Tastatur erreichbar ist
 * und der Fokus sichtbar bleiben muss. Der Fokusring der Suite bleibt
 * unberuehrt — das hier ist zusaetzlich, kein Ersatz.
 */
.kachel {
  border-inline-start: 4px solid var(--iuk-linie);
  transition: border-color 120ms ease;
}

.kachel:hover,
.kachel:focus-within {
  border-inline-start-color: var(--iuk-marke);
}

@media (prefers-reduced-motion: reduce) {
  .kachel {
    transition: none;
  }
}
```

- [ ] **Step 2: `page.tsx` auf die Rollen stellen**

`src/app/m/portal/page.tsx` — die Inline-Werte `fontWeight: 600` und `fontSize: 14, opacity: 0.65`
ersetzen. Import ergänzen: `import { SCHRIFT } from "@/core/theme/schrift";`

```tsx
            <Card hoverable size="small" style={{ height: "100%" }} className={s.kachel}>
              {/* Kicker ueber dem Namen: der Griff des alten Lagerbuchs, das
                  jede Karte mit einer versalen Zeile in Stahl aufmachte. Er
                  traegt hier den Zweck der Kachel, nicht ihren Namen. */}
              <div style={{ ...SCHRIFT.kicker, color: "var(--iuk-gedaempft)" }}>Dienst</div>
              <div style={SCHRIFT.unterTitel}>{s.name}</div>
              {s.description ? (
                /* `--iuk-gedaempft` statt `opacity: 0.65`: Deckkraft dimmt den
                   Kontrast unpruefbar mit und hat keinen Dunkelzweig. */
                <div style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)" }}>
                  {s.description}
                </div>
              ) : null}
            </Card>
```

**Achtung, Namenskollision:** die Seite benutzt `s` bereits als Laufvariable der `map`
(`services.map((s) => …)`). Das CSS-Modul **anders** importieren, z. B.
`import stil from "./portal.css";` — oder, falls `portal.css` global ist, schlicht
`className="kachel"`. Erst prüfen, wie die Datei heute eingebunden ist.

- [ ] **Step 3: Tests und Build**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

Erwartet: alles grün. `pnpm build` läuft hier mit, weil das Portal eine Server Component ist und
ein Compound-Zugriff (Falle 1) sich sonst erst im Browser zeigt.

- [ ] **Step 4: Commit**

```bash
git add src/app/m/portal/page.tsx src/app/m/portal/portal.css
git commit -m "feat(portal): Kacheln mit Rollen und Akzentkante statt Inline-Werten"
```

---

### Task 10: Wirkung belegen — zwei Viewports, zwei Modi

**Files:**
- Modify: `e2e/shell-mobil.spec.ts` (Tests ergänzen)

**Interfaces:**
- Consumes: alles aus Task 6 bis 9
- Produces: die abschließende Wirkungszusicherung

- [ ] **Step 1: Die Tests schreiben**

An `e2e/shell-mobil.spec.ts` anhängen. **Vorher lesen**, wie die Datei ihre Viewports setzt und
sich anmeldet — dieselben Helfer benutzen.

```ts
test("Markenstreifen und Aktivzustand tragen auf dem Desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await devLogin(page, { host: "portal.localtest.me", groups: "" });

  // DER STREIFEN IST DA UND HAT HOEHE. Eine Regel, die im Quelltext steht und
  // deren Element nie gerendert wird, ist von einer wirksamen nicht zu
  // unterscheiden — das kann nur der Browser sagen.
  const streifen = page.locator('[aria-hidden="true"]').first();
  await expect(streifen).toHaveCSS("height", "5px");
  await expect(streifen).toHaveCSS("background-color", "rgb(200, 0, 15)");

  // DIE AKTIVMARKIERUNG TRAEGT BEIDES — Farbe UND Gewicht.
  const aktiv = page.getByTestId("modulzeile").locator("[aria-current]").first();
  await expect(aktiv).toHaveCSS("color", "rgb(200, 0, 15)");
  await expect(aktiv).toHaveCSS("font-weight", "600");
});

test("die Display-Familie kommt in der Kopfzeile an", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await devLogin(page, { host: "portal.localtest.me", groups: "" });

  const titel = page.getByTestId("module-title");
  const familie = await titel.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(familie, `Modultitel rendert in: ${familie}`).toContain("Barlow");
});

test("mobil bleibt die Kopfzeile 64px hoch, der Streifen dehnt sie nicht", async ({ page }) => {
  // DER 390er LAUF IST NICHT DIE ZUGABE. Der Streifen ist ein neues Element
  // ueber der Kopfzeile; haenge er versehentlich DARIN, waere `suite-header`
  // 69px hoch statt 64 — und auf dem Desktop faellt das niemandem auf.
  await page.setViewportSize({ width: 390, height: 844 });
  await devLogin(page, { host: "portal.localtest.me", groups: "" });

  const kopf = page.getByTestId("suite-header");
  const box = await kopf.boundingBox();
  expect(box?.height).toBe(64);
});

test("im Dunkelmodus traegt die Marke ihren eigenen Wert", async ({ page }) => {
  // DAS VORBILD HATTE KEINEN DUNKELMODUS, und `#c8000f` reicht auf nahezu
  // Schwarz nicht. Ohne diese Zusicherung faellt der Dunkelzweig still auf den
  // hellen Wert zurueck, sobald jemand ihn beim Aufraeumen entfernt.
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));

  const marke = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--iuk-marke").trim(),
  );
  expect(marke).toBe("#e04452");
});
```

- [ ] **Step 2: Port prüfen und laufen lassen**

```bash
lsof -ti:3100 || pnpm exec playwright test e2e/shell-mobil.spec.ts
```

Erwartet: alle Tests **PASS**. Bei belegtem Port erst den `pnpm dev` beenden.

- [ ] **Step 3: Den Kontrast der Dunkelmarke messen, nicht schätzen**

Im laufenden Browser (oder mit einem Kontrastrechner) prüfen: `#e04452` auf `#141414`
(`Layout.headerBg` im Dunkelmodus). **Erwartet: ≥ 4.5:1** für 14px-Text.

Fällt es darunter, wird der Dunkelwert aufgehellt (nicht die Regel entschärft) und
`globals.css` plus der Test in Step 1 mitgeändert. **Das Ergebnis wird in `globals.css`
notiert**, damit die nächste Runde es nicht neu misst.

- [ ] **Step 4: Die volle E2E-Suite fahren**

```bash
pnpm exec playwright test
```

Erwartet: grün. Ein Ausfall in `lagerbuch-*` oder `mobil-admin` deutet auf eine Kaskadenkollision —
den Fund verfolgen, nicht den Test entschärfen.

- [ ] **Step 5: Commit**

```bash
git add e2e/shell-mobil.spec.ts
git commit -m "test(shell): Streifen, Aktivfarbe und Display-Familie in beiden Viewports und Modi"
```

---

### Task 11: Das offene Urteil fällen — Tabellenköpfe und Gesamteindruck

**Files:**
- Möglicherweise: `src/core/theme/theme.ts`, `docs/superpowers/specs/2026-08-12-typografie-und-farbe-design.md`

**Interfaces:**
- Consumes: alles
- Produces: die Antwort auf Spec §10, Punkte 1 und 2

- [ ] **Step 1: Die Suite ansehen, beide Modi**

```bash
pnpm dev
```

Aufrufen und beurteilen: `portal.localtest.me:3000`, eine Lagerbuch-Verwaltungsseite, die
Feedback-Lagekarte, den Helfer-Weg. Umschalter hell/dunkel jeweils betätigen.

**Die Frage aus Spec §10.1:** trägt Barlow Condensed neben Geist, oder wirkt es billig? Fällt das
Urteil negativ aus, wird **die Familie getauscht, nicht die Rollenstruktur** — sie ist absichtlich
eine Rollen- und keine Schriftliste, der Tausch ist eine Zeile in `globals.css` und eine in
`layout.tsx`.

- [ ] **Step 2: Die Tabellenköpfe messen**

Auf einer Seite mit antd-`Table` (z. B. Lagerbuch → Artikel) in der Konsole:

```js
getComputedStyle(document.querySelector(".ant-table-thead th")).fontFamily
```

**Die Frage aus Spec §10.2:** antd bietet für `Table` keinen Schrift-Token (nur `headerBg`,
`headerColor`, `headerSplitColor`). Versale Kicker-Spaltenköpfe bräuchten CSS gegen
`.ant-table-thead th` — eine Spezifitätserhöhung **und** eine Kopplung an einen antd-internen
Klassennamen, die ein Major still brechen kann.

**Entscheidung, und beide Ausgänge sind vertretbar:**
- *Dafür:* eine Regel in einer Modul-CSS-Datei, mit vorangestellter Modulklasse, kommentiert.
- *Dagegen:* der Punkt entfällt. Er ist keine Voraussetzung für irgendetwas.

Im Zweifel **dagegen** — eine stille Kopplung für Versalien auf Spaltenköpfen ist ein schlechter
Tausch.

- [ ] **Step 3: Das Ergebnis in der Spec festhalten**

In `docs/superpowers/specs/2026-08-12-typografie-und-farbe-design.md`, §10, die Punkte 1 und 2 von
„offen" auf das Ergebnis stellen — mit Datum und Begründung. Ein offener Punkt, der still
verschwindet, ist für den nächsten Leser nicht von einem vergessenen zu unterscheiden.

- [ ] **Step 4: `pnpm dev` beenden und die vollen Tore fahren**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(design): offene Punkte zu Tabellenkoepfen und Schriftwahl entschieden"
```

---

## Selbstdurchsicht

**Spec-Abdeckung.** §4 (A.1-A.4) → Task 1, 2. §5 (B.1-B.4) → Task 3, 4, 5. §6 (C.1-C.4) → Task 6.
§7 (D.1-D.3) → Task 7, 8, 9, 11. §8 (Prüfplan) → Task 1 Step 1, Task 2, Task 6 Step 1, Task 7
Step 1, Task 8 Step 1, Task 10. §10 (offene Punkte) → Task 11. **Keine Lücke.**

**Drei Spec-Aussagen wurden bewusst ersetzt** und sind oben unter „Drei Abweichungen" begründet:
Farbe in `core` (§5.2), Klassenbibliothek (§6.3), Kante je Modul (§7.2). Die Spec wird
entsprechend nachgezogen.

**Typkonsistenz.** `SCHRIFT` heißt in `core/theme/schrift.ts` und in
`lagerbuch/_lib/schrift.ts` gleich — das ist Absicht (der Adapter behält den Namen des Moduls) und
in Task 5 durch den Import-Alias `SUITE` aufgelöst. `ZIFFERN` wird in `core` definiert und in
`feedback/_ui/typo.ts` als `ZIFFERN_SUITE` importiert und unter altem Namen re-exportiert.
`--iuk-marke`/`--iuk-gedaempft`/`--iuk-linie` heißen in Task 6, 7, 8, 9 und 10 identisch.
`--font-display`/`--font-body`/`--font-mono` durchgehend. `.streifen` in Task 7 und 10.
