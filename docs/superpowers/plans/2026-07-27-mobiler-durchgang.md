# Mobiler Durchgang der Admin-Arbeitsseiten — Implementation Plan (Teilprojekt C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Admin-Arbeitsseiten der drei echten Module (`feedback`, `portal`, `qr`) sind auf 390×844 vollständig benutzbar: keine Seite scrollt seitwärts, kein Bedienelement liegt außerhalb des Sichtfelds oder unter 44px, kein Text verschwindet — und das Modul `feedback` schaltet auf denselben Breakpoint um wie die Suite.

**Architecture:** Keine neuen Komponenten und kein neues Muster. Sechs Klassen von Eingriffen an bestehendem Code: (1) eine RSC-Grenzverletzung, die eine ganze Seite mit HTTP 500 beantwortet, (2) `scroll={{ x: "max-content" }}` an zwei antd-`Table`s, (3) `wordBreak`/`whiteSpace`/`minWidth: 0` an vier Stellen mit unumbrechbaren Zeichenketten, (4) die Medienabfragen in `feedback.css` von 600px auf den Suite-Breakpoint, (5) `flex`/`min-width` an `.modulnav` in der Shell, (6) das Entfernen von `size`-Props, die es nach Projektregel nicht geben darf. Die Umschaltung mobil/desktop bleibt ausschließlich CSS — kein `Grid.useBreakpoint`, kein JS-Breakpoint, keine zweite Darstellung, die JavaScript wählt.

**Tech Stack:** Next.js 16 (App Router, RSC), Ant Design 6, Auth.js v5, Vitest (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-27-mobiler-durchgang-design.md`. Jeder Befund dort trägt eine gemessene Zahl; dieser Plan wiederholt die Zahlen dort, wo sie ein Abnahmekriterium sind.

## Global Constraints

Diese gelten für **jede** Aufgabe. Sie stammen aus `CLAUDE.md` und `docs/design/README.md`.

- **Deutsche Bezeichner, Kommentare und Testbeschreibungen.** Auch neue `data-testid` sind deutsch, wo das Umfeld deutsch ist.
- **Befehle mit `rtk` präfigieren** (`rtk pnpm vitest run`). Die Shell ist **fish** — keine `for … do … done`-Schleifen, keine `$()`-Verschachtelung ohne Not; wo ein Skript nötig wäre, lieber zwei Befehle.
- **`pnpm lint` muss Exit 0 liefern.** Zwei Warnungen sind vorbestehend und bleiben; Fehler blockieren.
- **Kein Compound-Zugriff auf antd in einer Server Component.** Verboten: `Typography.*`, `Form.Item`, `Descriptions.Item`, `List.Item`, `Card.Meta`, `Collapse.Panel`, `Breadcrumb.Item`, `Input.Group`, `Input.TextArea`, `Space.Compact`, `Statistic.Countdown`, `Table.Summary`, `Tag.CheckableTag`, `Badge.Ribbon`, `Layout.Header`, `Grid.useBreakpoint`. Ergibt HTTP 500, den **kein Build findet**. `Layout.Header`/`Content` nur als Deep-Import aus `antd/es/layout/layout`.
- **`Grid.useBreakpoint` ist auch in Client Components hier verboten** — die Umschaltung läuft über CSS.
- **`size` auf Bedienelementen nicht setzen.** `controlHeight` ist 56 (`controlHeightSM` leitet antd daraus als 42 ab, `controlHeightLG` als 72). Einzige Ausnahme im Bestand: `_ui/Aktualisierer.tsx:80`, dort im Quelltext begründet — die bleibt.
- **`--ant-*`-CSS-Variablen nur in Props von antd-Komponenten.** Eigenes Markup sieht sie nicht, und der Fehler ist still. Im Modul `feedback` heißen die eigenen `--fb-*`.
- **Rot nie auf einer Datenfläche** (`colorError === colorPrimary === #c8000f`). Rot im `okButton` eines Gefahrendialogs ist erlaubt und bereits so umgesetzt.
- **Eine eigene Klasse auf einer antd-Komponente verliert bei Spezifitäts-Gleichstand** (Falle 5). Wo eigenes CSS eine antd-Komponente treffen muss, eine Klasse mehr voranstellen — und **die Erhöhung kommentieren**, sonst entfernt sie die nächste Aufräumrunde.
- **`src/core` nur bei zweitem, heute belegbarem Nutznießer.** Task 5 fasst `src/core` an; die Begründung steht dort und ist eine Fehlerbehebung, keine Erweiterung.
- **Abstände aus `SPACE`** (`@/core/theme/tokens`), keine Zahlenliterale in neuem Code.
- **DOM-Tests** nutzen `src/app/m/qr/_lib/test-dom.tsx` (`mount`/`fill`/`click`/`query`/`queryAll`/`exists`/`unmount`). Kein zweites Harness erfinden.
- **Kein Vitest darf eine viewport-abhängige Sichtbarkeit behaupten.** jsdom wertet Media Queries nicht aus; ein solcher Test ist **immer** grün. Quelltext-Scan besitzt die Regel, Playwright das Ergebnis — und zwar in **beiden** Viewports.

## Bestehende Zusagen, die nicht brechen dürfen

| Zusage | Wo geprüft |
|---|---|
| `data-testid="service-table"` sitzt am umschließenden `<div>`, nicht an `<Table>` | `portal/admin/service-table.tsx:20-24` (Kommentar nennt den Grund), `e2e/portal.spec.ts` |
| `data-testid="service-row"` je Zeile | `e2e/portal.spec.ts:18` |
| `data-testid="vergleich-row"` je Zeile | `feedback/(admin)/vergleich/page.test.tsx` |
| `data-testid="preset-row"`, `data-testid="preset-edit"` | `e2e/qr.spec.ts` |
| `data-testid="history-entry"` | `qr/HistoryList.test.tsx` |
| `HistoryList` rendert den Löschknopf als **direktes Kind** von `<section>` | `qr/HistoryList.tsx:65-66` (Kommentar), `HistoryList.test.tsx` sucht `section > button` |
| `QrView` rendert ein natives `<h1>`, keine `Typography.Title` | `qr/QrView.tsx:85-88` (Kommentar), `QrView.test.tsx` sucht `el.type === "h1"` |
| `data-testid="modulnav"`, `data-testid="modulzeile"`, `data-testid="suite-header"` | `e2e/shell-mobil.spec.ts` |
| Modul-Links sind auf dem Desktop ohne Öffnen sichtbar | `e2e/keystone.spec.ts:35` (läuft auf 1280×720) |
| `src/core/shell/**` bleibt **unangetastet** | kein Task dieses Plans ändert dort etwas — der einzige Shell-Befund (Spec §5.4) geht als Nacharbeit an Teilprojekt A |
| `Aktualisierer.tsx:80` behält `size="small"` | Quelltext-Kommentar `Aktualisierer.tsx:66-67` |

**Bewusst geändert wird:** `feedback.css` wechselt in Task 4 sechsmal `600px` gegen `767.98px` — ein etwaiger Test, der auf `600` prüft, wandert mit (Task 4, Schritt 1 sucht danach).

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/app/m/feedback/_lib/trendfenster.ts` | **neu** — `MONATS_FENSTER` außerhalb eines `"use client"`-Moduls (Task 1) |
| `src/app/m/feedback/_lib/trendfenster.test.ts` | **neu** — Regressionstest für die RSC-Grenze (Task 1) |
| `src/app/m/feedback/_ui/Segment.tsx` | **ändern** — importiert die Konstante statt sie zu exportieren (Task 1) |
| `src/app/m/feedback/(admin)/groups/[groupId]/trend/page.tsx` | **ändern** — Import aus `_lib`, Knopfzeile (Task 1, 4) |
| `src/app/m/portal/admin/service-table.tsx` | **ändern** — `scroll`, `size` (Task 2, 5) |
| `src/app/m/feedback/_ui/VergleichTabelle.tsx` | **ändern** — `scroll` (Task 2) |
| `src/app/m/feedback/_ui/tabellen.test.ts` | **neu** — Quelltext-Scan über die `scroll`-Props (Task 2) |
| `src/app/m/qr/QrView.tsx` | **ändern** — `overflowWrap` an der Überschrift (Task 3) |
| `src/app/m/qr/HistoryList.tsx` | **ändern** — `whiteSpace: "normal"`, `wordBreak` (Task 3) |
| `src/app/m/qr/admin/page.tsx` | **ändern** — `flexWrap`, `minWidth: 0`, `wordBreak` (Task 3) |
| `src/app/m/feedback/_ui/feedback.css` | **ändern** — 600px → 767.98px, sechs Blöcke (Task 4) |
| `src/app/m/feedback/_ui/feedback-css.test.ts` | **neu** — Quelltext-Scan über die Breakpoint-Menge (Task 4) |
| `src/app/m/feedback/_ui/Teilnahme.tsx` | **ändern** — `fb-block-mobil` am dritten Knopf (Task 4) |
| `src/app/m/feedback/_ui/Verlauf.tsx` | **ändern** — Knopfzeile, `size`, Trefferfläche des „…" (Task 4, 5) |
| `src/app/m/feedback/_ui/EinstellungenPanel.tsx` | **ändern** — `fb-block-mobil` an den beiden Gefahrenknöpfen (Task 4) |
| `src/app/m/portal/admin/service-form.tsx` | **ändern** — Absendeknopf volle Breite unter 768 (Task 4) |
| `src/app/m/portal/portal.css` | **neu** — die eine Medienabfrage des Moduls (Task 4) |
| `src/app/m/feedback/_ui/Zuordnung.tsx` | **ändern** — `size` weg (Task 5) |
| `src/app/m/feedback/_ui/TrendDiagramm.tsx` | **ändern** — `size` weg (Task 5) |
| `src/app/m/feedback/_ui/groessen.test.ts` | **neu** — Quelltext-Scan über `size`-Props (Task 5) |
| `src/app/m/feedback/_ui/Lagekarte.tsx` | **ändern** — Kartenkopf bricht statt zu kürzen (Task 6) |
| `src/app/m/feedback/_ui/StartFormular.tsx` | **ändern** — Teilnehmerfeld volle Breite (Task 6) |
| `src/app/m/feedback/(admin)/groups/[groupId]/page.tsx` | **ändern** — `fb-block-mobil` am Auswertungsknopf (Task 4) |
| `src/app/m/portal/layout.tsx` | **ändern** — `nav`-Slot befüllen (Task 6) |
| `src/app/m/portal/layout.test.tsx` | **neu** — die Ableitung des `nav` (Task 6) |
| `e2e/mobil-admin.spec.ts` | **neu** — drei Viewports (Task 7) |
| `docs/design/README.md` | **ändern** — Falle 6 (Task 1), Mobil-Abschnitt fortschreiben (Task 7) |

---

### Task 1: Die Trendseite lädt wieder — `MONATS_FENSTER` aus dem Client-Modul lösen

**Files:**
- Create: `src/app/m/feedback/_lib/trendfenster.ts`
- Create: `src/app/m/feedback/_lib/trendfenster.test.ts`
- Modify: `src/app/m/feedback/_ui/Segment.tsx:27` (Export entfällt, Import kommt)
- Modify: `src/app/m/feedback/(admin)/groups/[groupId]/trend/page.tsx:11`
- Modify: `docs/design/README.md` (Falle 6)

**Interfaces:**
- Consumes: nichts
- Produces: `export const MONATS_FENSTER` in `_lib/trendfenster.ts`; `Segment.tsx` exportiert die Konstante **nicht mehr**

**Warum:** `/groups/[groupId]/trend` antwortet mit HTTP 500 — `MONATS_FENSTER.includes is not a function` an `trend/page.tsx:169`. `_ui/Segment.tsx` trägt in Zeile 1 `"use client"`; eine Server Component, die daraus einen **Wert** importiert, bekommt eine Client-Referenz statt des Arrays. Weder `pnpm build` noch `pnpm typecheck` noch ein Vitest sehen das (unter Vitest sind beide Module normale ES-Module). Drei der 18 `_ui`-Bausteine (`TrendDiagramm`, `NotenVerlauf`, `Segment`) hängen an dieser Seite und sind ohne sie nicht abnehmbar — deshalb steht diese Aufgabe vorn.

- [ ] **Step 1: Test schreiben**

Neue Datei `src/app/m/feedback/_lib/trendfenster.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MONATS_FENSTER, fensterAus } from "./trendfenster";

/**
 * DIE RSC-GRENZE, AN DER DIE TRENDSEITE MIT HTTP 500 GESTORBEN IST.
 *
 * `MONATS_FENSTER` stand in `_ui/Segment.tsx`, und diese Datei traegt in Zeile 1
 * `"use client"`. Eine Server Component, die daraus einen WERT importiert (keine
 * Komponente, keine Funktion), bekommt keinen Array, sondern eine
 * Client-Referenz — `.includes` gibt es darauf nicht. Ergebnis:
 *
 *   TypeError: MONATS_FENSTER.includes is not a function
 *     at fensterAus (trend/page.tsx:169)
 *
 * WAS DIESER TEST KANN UND WAS NICHT. Er kann NICHT das Verhalten pruefen: unter
 * Vitest sind Client- und Server-Module beide normale ES-Module, `"use client"`
 * ist dort ein wirkungsloser String. Ein Test, der die Konstante importiert und
 * `.includes` aufruft, waere auch VOR der Behebung gruen gewesen — er misst
 * nichts. Was er kann, ist die GEGENMASZNAHME festhalten: die Datei, in der die
 * Konstante liegt, traegt kein `"use client"`. Das sichtbare Ergebnis besitzt
 * der Playwright-Lauf (`e2e/mobil-admin.spec.ts`, „Trendseite antwortet mit
 * 200") — nur ein echter Next-Server hat eine RSC-Grenze.
 */
describe("Trendfenster", () => {
  it("liegt in einem Modul OHNE `use client`", () => {
    const quelle = readFileSync("src/app/m/feedback/_lib/trendfenster.ts", "utf8");
    expect(quelle).not.toMatch(/["']use client["']/);
  });

  it("wird von `_ui/Segment.tsx` nicht mehr exportiert", () => {
    // Der Rueckweg: exportierte Segment.tsx die Konstante erneut, koennte eine
    // Server Component sie wieder von dort holen und der 500er waere zurueck.
    const quelle = readFileSync("src/app/m/feedback/_ui/Segment.tsx", "utf8");
    expect(quelle).not.toMatch(/export\s+const\s+MONATS_FENSTER/);
  });

  it("kennt genau die drei Fenster aus dem Entwurf (§3.3)", () => {
    expect([...MONATS_FENSTER]).toEqual([6, 12, 24]);
  });

  it("klemmt alles Unbekannte auf 12 — ohne Fehlermeldung", () => {
    expect(fensterAus("6")).toBe(6);
    expect(fensterAus("24")).toBe(24);
    expect(fensterAus("7")).toBe(12);
    expect(fensterAus(undefined)).toBe(12);
    expect(fensterAus("nonsens")).toBe(12);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/feedback/_lib/trendfenster.test.ts`
Expected: FAIL — `src/app/m/feedback/_lib/trendfenster.ts` existiert nicht.

- [ ] **Step 3: Die Konstante umziehen**

Neue Datei `src/app/m/feedback/_lib/trendfenster.ts`:

```ts
/**
 * DAS ZEITFENSTER DES TRENDS (Entwurf §3.3) — und warum es HIER liegt.
 *
 * Es lag bis 2026-07-27 in `_ui/Segment.tsx`, zusammen mit der Komponente, die
 * es anzeigt. Das war naheliegend und falsch: `Segment.tsx` traegt `"use
 * client"`, und `trend/page.tsx` ist eine Server Component, die den WERT
 * braucht, um `?monate=` zu klemmen. Ueber eine RSC-Grenze kommen aus einem
 * Client-Modul nur Referenzen, keine Werte — `MONATS_FENSTER.includes` war
 * `undefined` und die ganze Seite antwortete mit HTTP 500.
 *
 * `_lib/` traegt kein `"use client"` und wird von beiden Seiten gelesen. Wer
 * die Konstante zurueck in die Komponente holt, holt den 500er mit; deshalb
 * haelt `trendfenster.test.ts` beide Enden fest.
 */
export const MONATS_FENSTER = [6, 12, 24] as const;

/** Nur 6, 12 oder 24 (§3.3) — alles andere ist 12, ohne Fehlermeldung. */
export function fensterAus(roh: string | undefined): number {
  const n = Number(roh);
  return (MONATS_FENSTER as readonly number[]).includes(n) ? n : 12;
}
```

- [ ] **Step 4: `Segment.tsx` umstellen**

In `src/app/m/feedback/_ui/Segment.tsx` den Block in Zeile 26-27

```ts
/** Die drei Fenster aus §3.3. Mehr Auswahl wäre eine Entscheidung ohne Anlass. */
export const MONATS_FENSTER = [6, 12, 24] as const;
```

ersatzlos entfernen und stattdessen unter den bestehenden Import in Zeile 4 (`import { Segmented } from "antd";`) setzen:

```ts
import { MONATS_FENSTER } from "@/app/m/feedback/_lib/trendfenster";
```

Der Rest der Datei bleibt: `MonatsSegment` nutzt `MONATS_FENSTER.map(...)` in Zeile 37 unverändert weiter.

- [ ] **Step 5: `trend/page.tsx` umstellen**

Zeile 11 lautet heute:

```ts
import { MONATS_FENSTER, MonatsSegment } from "@/app/m/feedback/_ui/Segment";
```

Daraus werden zwei Importe — die Komponente aus dem Client-Modul, der Wert aus `_lib`:

```ts
import { MonatsSegment } from "@/app/m/feedback/_ui/Segment";
import { fensterAus } from "@/app/m/feedback/_lib/trendfenster";
```

Und die lokale Funktion in Zeile 166-170 entfällt ersatzlos, weil sie mit umgezogen ist:

```ts
/** Nur 6, 12 oder 24 (§3.3) — alles andere ist 12, ohne Fehlermeldung. */
function fensterAus(roh: string | undefined): number {
  const n = Number(roh);
  return (MONATS_FENSTER as readonly number[]).includes(n) ? n : 12;
}
```

Der Aufruf in Zeile 55 bleibt wortgleich stehen und trifft jetzt den Import.

- [ ] **Step 6: Tests und Typecheck**

```bash
rtk pnpm vitest run src/app/m/feedback
rtk pnpm typecheck
```
Expected: PASS. Falls ein bestehender Test `MONATS_FENSTER` aus `_ui/Segment` importiert, zeigt der Typecheck es hier — der Import wandert dann auf `_lib/trendfenster`, der Test selbst bleibt unverändert.

- [ ] **Step 7: Im Browser belegen, dass die Seite lädt**

```bash
rtk pnpm dev
```
Dann `http://feedback.localtest.me:3000/groups/1/trend` aufrufen (angemeldet mit `da-feedback-admin`).
Expected: HTTP 200, die Seite zeigt Überschrift, Monatsschalter und Diagramm — statt „A server error occurred."

**Und im selben Zug die eine Messung nachholen, die während der Bestandsaufnahme nicht möglich war:** bei 390×844 in der Konsole

```js
({ vw: innerWidth, doc: document.documentElement.scrollWidth })
```

Expected: `doc === vw === 390`. **Wenn nicht**, ist der Verursacher zu notieren (`[...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1)`) — der wahrscheinlichste Kandidat ist die Endbeschriftung der Kurven mit dem vollen Fragetext (`_ui/NotenVerlauf.tsx:195`). Das ist dann ein **Befund für eine Nacharbeit**, kein Anlass, diesen Task zu erweitern; er wird im Abschlussbericht genannt.

- [ ] **Step 8: Falle 6 in `docs/design/README.md`**

Nach Falle 5 (nach Zeile 76, vor „## Hell- und Dunkelmodus") einfügen:

```markdown
**6. Ein WERT aus einem `"use client"`-Modul kommt in einer Server Component nicht an.**
Falle 1 verbietet den Compound-Zugriff. Das hier ist ihre Schwester und sieht harmloser aus: eine
Server Component importiert aus einem Client-Modul keine Komponente, sondern eine **Konstante** —
und bekommt eine Client-Referenz statt des Wertes. `MONATS_FENSTER.includes is not a function`,
HTTP 500 für die ganze Seite. **TypeScript ist zufrieden** (es sieht `readonly [6, 12, 24]`),
`pnpm build` findet nichts, und ein Vitest kann es strukturell nicht finden: unter Vitest sind beide
Module normale ES-Module, `"use client"` ist dort ein wirkungsloser String.

**Regel:** Werte, die eine Server Component liest, liegen in einem Modul ohne `"use client"` —
im Modul `feedback` heißt das `_lib/`. Die Komponente importiert von dort, nicht umgekehrt.

**So sucht man danach:** alle Module mit `"use client"` auflisten, darin die Exporte suchen, die
keine Komponente sind (`export const GROSSBUCHSTABEN`, `export function kleinbuchstabe`), und für
jeden prüfen, ob ihn eine Datei ohne `"use client"` importiert. Am 2026-07-27 ergab das vier
Kandidaten und genau einen Treffer (`MONATS_FENSTER`, behoben). Die drei anderen —
`MAX_SERIEN`, `AKTUALISIERUNGS_TAKT_MS`, `SPERRE_MS` — haben keinen Importeur jenseits ihrer eigenen
Client-Insel.
```

- [ ] **Step 9: Volle Prüfung und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
rtk git add src/app/m/feedback/_lib/trendfenster.ts src/app/m/feedback/_lib/trendfenster.test.ts src/app/m/feedback/_ui/Segment.tsx "src/app/m/feedback/(admin)/groups/[groupId]/trend/page.tsx" docs/design/README.md
rtk git commit -m "fix(feedback): Trendseite laedt wieder — Konstante ueber die RSC-Grenze geholt"
```

---

### Task 2: Die zwei Tabellen scrollen in sich, statt die Seite mitzunehmen

**Files:**
- Modify: `src/app/m/portal/admin/service-table.tsx:25-30`
- Modify: `src/app/m/feedback/_ui/VergleichTabelle.tsx:48-54`
- Test: `src/app/m/feedback/_ui/tabellen.test.ts` (neu)

**Interfaces:**
- Consumes: nichts
- Produces: `scroll={{ x: "max-content" }}` an beiden `<Table>`

**Warum `"max-content"` und keine Zahl:** **keine** der zehn Spalten der beiden Tabellen trägt ein `width` (`VergleichTabelle.tsx:55-104`, `service-table.tsx:31-52`). Eine Pixelsumme gibt es nicht zu bilden; jede Zahl wäre erfunden.

**Warum das den Desktop nicht verändert:** `@rc-component/table@1.10.4`, `lib/Table.js:426-442` schaltet nur dann auf `table-layout: fixed`, wenn eine Spalte `fixed` trägt, `scroll.y` gesetzt ist, `sticky` an ist oder **eine Spalte `ellipsis` hat**. Keines davon trifft hier zu — beide Tabellen bleiben auf `auto`. `Table.js:260-274` setzt zusätzlich `overflowX: auto` am Container und `{ width: "max-content", minWidth: "100%" }` an der `<table>`: bei 1280px gewinnt `min-width: 100%` und die Spalten verteilen sich wie heute, bei 390px gewinnt `max-content` und die Tabelle scrollt in ihrem eigenen Kasten.

**Warum keine Schmalvariante wie in `Verlauf.tsx`:** das wäre eine neue Listenkomponente samt Entwurfsentscheidung, welche Spalten mobil überhaupt tragen. `Verlauf`s Doppelfassung existiert, weil `docs/design/feedback-admin.md` §2.5 sie vorgibt; für den Gruppenvergleich gibt es keine solche Vorgabe. Siehe Spec §5.3.

- [ ] **Step 1: Test schreiben**

Neue Datei `src/app/m/feedback/_ui/tabellen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ANTD-TABELLEN SCROLLEN AUF SCHMALEN GERAETEN, SIE BRECHEN NICHT UM
 * (docs/design/README.md, Abschnitt „Mobil").
 *
 * Warum Quelltext-Scan und nicht jsdom: die Regel IST eine Prop. Ein DOM-Test
 * saehe sie zwar auch, aber er koennte die Wirkung nicht pruefen — jsdom
 * berechnet kein Layout und wertet keine Media Queries aus. Das sichtbare
 * Ergebnis besitzt `e2e/mobil-admin.spec.ts` bei 390x844 (die Seite scrollt
 * nicht seitwaerts) und bei 1280x800 (die Spaltenbreiten sind unveraendert).
 *
 * `max-content` und nicht eine Zahl: KEINE der zehn Spalten dieser beiden
 * Tabellen traegt ein `width`. Eine Pixelsumme waere erfunden. `Verlauf.tsx`
 * waere der Gegenfall (fuenf von sechs Spalten mit `width`, Summe 680) — die
 * Tabelle braucht die Prop aber gar nicht, weil `.fb-verlauf-breit` unter 768px
 * `display: none` ist und dort die Schmalliste steht.
 */
const TABELLEN = [
  { datei: "src/app/m/feedback/_ui/VergleichTabelle.tsx", name: "Gruppenvergleich" },
  { datei: "src/app/m/portal/admin/service-table.tsx", name: "portal-Dienste" },
];

describe("Tabellen mit Scroll-Zusage", () => {
  for (const { datei, name } of TABELLEN) {
    it(`${name} traegt scroll mit x`, () => {
      const quelle = readFileSync(datei, "utf8");
      expect(quelle, `${datei}: scroll-Prop fehlt`).toMatch(
        /scroll=\{\{\s*x:\s*["']max-content["']\s*\}\}/,
      );
    });

    it(`${name} hat weiterhin keine Spalte mit ellipsis`, () => {
      /*
       * DIE BEDINGUNG, UNTER DER `max-content` RICHTIG IST.
       * rc-table (lib/Table.js:426-442) schaltet auf `table-layout: fixed`,
       * sobald eine Spalte `ellipsis` traegt — dann verteilt es die Spalten
       * gleichmaeszig und das Desktop-Bild aendert sich. Solange keine Spalte
       * `ellipsis` hat, bleibt es auf `auto` und `min-width: 100%` haelt die
       * Tabelle bei 1280px so breit wie heute. Wer spaeter ein `ellipsis`
       * ergaenzt, muss diesen Test lesen, nicht loeschen.
       */
      const quelle = readFileSync(datei, "utf8");
      expect(quelle, `${datei}: ellipsis gesetzt — max-content neu bewerten`).not.toMatch(
        /ellipsis:\s*true/,
      );
    });
  }

  it("Verlauf.tsx bekommt bewusst KEIN scroll", () => {
    /*
     * Gegenprobe zum haeufigsten Missverstaendnis: die Tabelle in Verlauf.tsx
     * hat kein `scroll` und braucht keins. Sie liegt in `.fb-verlauf-breit`,
     * das unterhalb des Suite-Breakpoints `display: none` ist; bei 768px stehen
     * ihr 736px zur Verfuegung und sie belegt gemessen 736. Ein `scroll` hier
     * waere nicht falsch, aber es waere eine Prop ohne Anlass — und sie traegt
     * ein `ellipsis` (Spalte „Thema"), was `table-layout: fixed` ausloesen und
     * das Desktop-Bild veraendern wuerde.
     */
    const quelle = readFileSync("src/app/m/feedback/_ui/Verlauf.tsx", "utf8");
    expect(quelle).not.toMatch(/scroll=\{\{/);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/feedback/_ui/tabellen.test.ts`
Expected: FAIL — beide `scroll`-Erwartungen schlagen fehl, die beiden `ellipsis`-Gegenproben und die `Verlauf`-Gegenprobe gehen durch.

- [ ] **Step 3: `service-table.tsx` ändern**

`src/app/m/portal/admin/service-table.tsx`, Zeilen 25-30 lauten heute:

```tsx
    <Table<ServiceRow>
      rowKey="id"
      dataSource={services}
      pagination={false}
      size="small"
      onRow={() => ({ "data-testid": "service-row" }) as React.HTMLAttributes<HTMLElement>}
```

Daraus wird (das `size="small"` bleibt in diesem Task noch stehen — es fällt in Task 5, damit jeder Task für sich beurteilbar bleibt):

```tsx
    <Table<ServiceRow>
      rowKey="id"
      dataSource={services}
      pagination={false}
      size="small"
      /*
       * SCROLLEN STATT DIE SEITE MITNEHMEN (docs/design/README.md, „Mobil").
       * Ohne diese Prop setzt rc-table keinen Overflow-Container; die Tabelle
       * lief bei 390px mit 483px Breite in einem 358px-Kasten ueber und das
       * ganze Dokument scrollte seitwaerts (gemessen: scrollWidth 499). Beide
       * „Loeschen"-Knoepfe standen auszerhalb des Sichtfelds, und wegen der
       * suiteweiten Zoom-Sperre konnte man sie auch nicht heranholen.
       *
       * `max-content` und keine Zahl, weil KEINE Spalte ein `width` traegt.
       * Auf dem Desktop aendert sich dadurch nichts: rc-table bleibt auf
       * `table-layout: auto` (keine Spalte mit `fixed`, kein `scroll.y`, kein
       * `ellipsis`), und `min-width: 100%` haelt die Tabelle so breit wie ihren
       * Container. Belegt in `e2e/mobil-admin.spec.ts` bei 1280x800.
       */
      scroll={{ x: "max-content" }}
      onRow={() => ({ "data-testid": "service-row" }) as React.HTMLAttributes<HTMLElement>}
```

- [ ] **Step 4: `VergleichTabelle.tsx` ändern**

`src/app/m/feedback/_ui/VergleichTabelle.tsx`, Zeilen 48-53 lauten heute:

```tsx
    <Table<VergleichZeile>
      rowKey="groupId"
      dataSource={zeilen}
      pagination={false}
      size="small"
      locale={{ emptyText: "Keine Gruppen" }}
```

Daraus wird:

```tsx
    <Table<VergleichZeile>
      rowKey="groupId"
      dataSource={zeilen}
      pagination={false}
      size="small"
      /*
       * SCROLLEN STATT DIE SEITE MITNEHMEN (docs/design/README.md, „Mobil").
       * Gemessen bei 390px: die Tabelle war 545px breit in einem 358px-Kasten,
       * das Dokument scrollte auf 561px, und die Spalte VERLAUF war vollstaendig
       * unerreichbar. Sie ist die einzige Tabelle des Moduls ohne
       * Schmalvariante — `Verlauf.tsx` hat eine (§2.5 des Entwurfs), der
       * Gruppenvergleich hat dafuer keine Vorgabe, und eine zu erfinden waere
       * eine Entwurfsentscheidung, kein mobiler Durchgang.
       *
       * `max-content` und keine Zahl, weil KEINE Spalte ein `width` traegt.
       * Die Spalte VERLAUF hat mit `Notenfunke` einen harten Boden von 132px
       * (Noten.tsx:412) — genau der Fall, fuer den `max-content` gebaut ist.
       */
      scroll={{ x: "max-content" }}
      locale={{ emptyText: "Keine Gruppen" }}
```

- [ ] **Step 5: Tests laufen lassen**

```bash
rtk pnpm vitest run src/app/m/feedback/_ui/tabellen.test.ts
rtk pnpm vitest run src/app/m/feedback src/app/m/portal
```
Expected: PASS. Die bestehenden Tests zu `vergleich-row` und `service-row` bleiben grün — `scroll` ändert am `onRow` nichts.

- [ ] **Step 6: Im Browser messen, beide Viewports**

Dev-Server läuft. Bei **390×844** auf `http://feedback.localtest.me:3000/vergleich` und `http://portal.localtest.me:3000/admin` in der Konsole:

```js
({
  vw: innerWidth,
  doc: document.documentElement.scrollWidth,
  box: document.querySelector(".ant-table-content").clientWidth,
  tabelle: document.querySelector(".ant-table table").scrollWidth,
})
```

Expected: `doc === vw === 390`; `tabelle` (545 bzw. 483) **größer** als `box` (358) — genau das ist der Beweis, dass der Überlauf jetzt im Kasten sitzt statt im Dokument.

Bei **1280×800** auf denselben zwei Seiten:

```js
[...document.querySelectorAll(".ant-table thead th")].map((th) => Math.round(th.getBoundingClientRect().width))
```

Expected — die vor der Änderung gemessenen Werte, unverändert:
- `/vergleich`: `[343, 118, 172, 247, 239]`
- `portal/admin`: `[233, 229, 380, 200, 207]`

Weicht eine Zahl ab, ist `table-layout` doch auf `fixed` gesprungen; dann trägt eine Spalte ein `ellipsis`, das der Test in Schritt 1 hätte finden müssen — dann **nicht** den Test aufweichen, sondern die Spalte suchen.

- [ ] **Step 7: Volle Prüfung und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
rtk git add src/app/m/portal/admin/service-table.tsx src/app/m/feedback/_ui/VergleichTabelle.tsx src/app/m/feedback/_ui/tabellen.test.ts
rtk git commit -m "fix(feedback/portal): Tabellen scrollen auf schmalen Geraeten statt die Seite mitzunehmen"
```

---

### Task 3: Lange Zeichenketten brechen, statt die Seite aufzuspannen

**Files:**
- Modify: `src/app/m/qr/QrView.tsx:89`
- Modify: `src/app/m/qr/HistoryList.tsx:50-61`
- Modify: `src/app/m/qr/admin/page.tsx:42-58`

**Interfaces:**
- Consumes: nichts
- Produces: nichts — drei Stil-Ergänzungen

**Warum:** drei der fünf gemessenen Seitwärts-Scrolls kommen aus dem qr-Modul, und alle drei aus derselben Ursache — Nutzereingaben ohne Leerzeichen (URLs, Slugs) in einem Container, der nicht umbrechen darf. Das Modul löst das an drei anderen Stellen bereits richtig (`QrView.tsx:106`, `PresetGrid.tsx:41`, `Teilnahme.tsx:147`); die Asymmetrie ist selbst das Argument, dass es Versehen sind.

- [ ] **Step 1: Die Überschrift der QR-Ansicht**

`src/app/m/qr/QrView.tsx:89` lautet heute:

```tsx
      {label ? <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{label}</h1> : null}
```

Daraus wird:

```tsx
      {/*
       * `overflowWrap: "anywhere"` und `minWidth: 0`: das Label ist bei
       * `kind=url` die volle Nutzereingabe. Gemessen mit einer 95 Zeichen langen
       * Wiki-URL bei 390px: die Ueberschrift war 449px breit, das Dokument
       * scrollte auf 420px, und weil die Ueberschrift mittig sitzt, fehlte
       * links UND rechts etwas — sichtbar war „ps://wiki.iuk-".
       *
       * `anywhere` und nicht `break-word`: beide brechen ein zu langes Wort,
       * aber nur `anywhere` senkt auch die min-content-Breite, und genau die
       * spannte hier den Flex-Container auf. Zehn Zeilen tiefer traegt derselbe
       * Text als `qr-raw` bereits `wordBreak: "break-all"` (Zeile 106) — dass
       * die Ueberschrift es nicht tat, war die Asymmetrie, nicht die Absicht.
       */}
      {label ? (
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>
          {label}
        </h1>
      ) : null}
```

Das native `<h1>` bleibt ein `<h1>` — `QrView.test.tsx` durchsucht den ungerenderten Elementbaum nach `el.type === "h1"` (Kommentar `QrView.tsx:85-88`).

- [ ] **Step 2: Der Verlaufseintrag**

`src/app/m/qr/HistoryList.tsx:50-61` lautet heute:

```tsx
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
```

Daraus wird — `size="large"` bleibt vorerst stehen (Spec §6: der `size`-Bestand des qr-Moduls ist ein eigenes Vorhaben), geändert wird nur der Umbruch:

```tsx
            <Button
              block
              size="large"
              // Der Verlauf haelt das Payload, nicht den fertigen String —
              // deshalb entsteht die URL hier ueber denselben Weg wie beim
              // ersten Erzeugen und kann gar nicht davon abweichen.
              onClick={() => router.push(buildQrUrl(e.label, e.payload))}
              data-testid="history-entry"
              /*
               * `whiteSpace: "normal"` schlaegt antds Button-Basisstil, der
               * `nowrap` setzt — OHNE `overflow: hidden` dazu. Bei `kind=url`
               * ist das Label die volle Nutzereingabe; gemessen nach dem
               * Erzeugen eines Codes mit einer 95 Zeichen langen URL: der Knopf
               * 358px breit, sein Inhalt 557px, das innere <span> 757px, das
               * Dokument scrollte auf 574px.
               *
               * `height: "auto"` muss mit: `size="large"` setzt eine feste
               * Hoehe, in die zwei oder drei Zeilen nicht passen.
               *
               * Der Nachbar `PresetGrid.tsx:41` macht dasselbe an derselben
               * Konstruktion — hier fehlte es schlicht.
               */
              style={{
                textAlign: "left",
                whiteSpace: "normal",
                height: "auto",
                overflowWrap: "anywhere",
                paddingBlock: SPACE.sm,
              }}
            >
              {e.label}
            </Button>
```

`SPACE` ist in dieser Datei bereits importiert (`gap: SPACE.sm` in Zeile 42). Der Löschknopf in Zeile 67 bleibt **direktes Kind von `<section>`** — `HistoryList.test.tsx` greift über `section > button` darauf zu.

- [ ] **Step 3: Die Zeile der Preset-Verwaltung**

`src/app/m/qr/admin/page.tsx:42-58` lautet heute:

```tsx
            <li
              key={p.id}
              data-testid="preset-row"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: SPACE.md,
                border: RAHMEN,
                borderRadius: 8,
                padding: SPACE.sm,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
                <span aria-hidden="true">{p.icon}</span>
                {p.label} <code style={{ opacity: 0.65 }}>{p.id}</code>
              </span>
```

Daraus wird:

```tsx
            <li
              key={p.id}
              data-testid="preset-row"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: SPACE.md,
                border: RAHMEN,
                borderRadius: 8,
                padding: SPACE.sm,
                /*
                 * `flexWrap` ist der eigentliche Fix. Die Zeile hat rechts einen
                 * festen Block („Bearbeiten" 96px + „Loeschen" 86px = 182px);
                 * links steht Label plus Slug, und ein Flex-Kind hat per Vorgabe
                 * `min-width: auto` — es kann also weder schrumpfen noch
                 * umbrechen. Mit dem kurzen Seed-Preset faellt das nicht auf
                 * (356px Inhalt in 356px Kasten); mit einem realistischen Namen
                 * plus Slug sprang die Zeile auf 427px und das Dokument auf
                 * 444px, der „Loeschen"-Knopf stand auszerhalb.
                 */
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: SPACE.sm,
                  /* Ohne `minWidth: 0` schrumpft der Block nicht unter seine
                     Inhaltsbreite — `flexWrap` allein reichte dann nicht. */
                  minWidth: 0,
                  flexWrap: "wrap",
                }}
              >
                <span aria-hidden="true">{p.icon}</span>
                {p.label}{" "}
                {/* Der Slug ist eine Nutzereingabe ohne Leerzeichen; ohne
                    `anywhere` ist er ein einziges, unteilbares Wort. */}
                <code style={{ opacity: 0.65, overflowWrap: "anywhere", minWidth: 0 }}>{p.id}</code>
              </span>
```

- [ ] **Step 4: Tests laufen lassen**

```bash
rtk pnpm vitest run src/app/m/qr
rtk pnpm typecheck
```
Expected: PASS.

- [ ] **Step 5: Im Browser messen**

Bei 390×844:

1. `http://qr.localtest.me:3000/` — eine lange URL eingeben (`https://wiki.iuk-ue.de/books/einsatzhandbuch/chapter/funk-und-fernmeldedienst/page/kanaltrennung`) und „QR-Code erzeugen" drücken. Auf der Folgeseite `({vw: innerWidth, doc: document.documentElement.scrollWidth})` — Expected `390 / 390` (vorher 390 / **420**).
2. Zurück auf `/` — der Verlaufseintrag steht jetzt mehrzeilig. `document.documentElement.scrollWidth` — Expected `390` (vorher **574**).
3. `http://qr.localtest.me:3000/admin` — ein Preset mit langem Namen anlegen („Einsatzleitung Rettungsdienst Ortsverein"), dann `document.documentElement.scrollWidth` — Expected `390`. **Das angelegte Preset danach wieder löschen**, damit die Dev-Datenbank so bleibt, wie sie war.

- [ ] **Step 6: Commit**

```bash
rtk pnpm lint
rtk git add src/app/m/qr/QrView.tsx src/app/m/qr/HistoryList.tsx src/app/m/qr/admin/page.tsx
rtk git commit -m "fix(qr): lange Adressen brechen um, statt die Seite seitwaerts zu ziehen"
```

---

### Task 4: Ein Breakpoint statt zweier — und die Knopfreihen, die keinen Mechanismus haben

**Files:**
- Modify: `src/app/m/feedback/_ui/feedback.css` (sechs Blöcke: Zeilen 133, 155, 300, 326, 370 und der Kommentar in 183-185)
- Modify: `src/app/m/feedback/_ui/Teilnahme.tsx:165`
- Modify: `src/app/m/feedback/_ui/Verlauf.tsx:149-165`
- Modify: `src/app/m/feedback/_ui/EinstellungenPanel.tsx:292, 303`
- Modify: `src/app/m/feedback/(admin)/groups/[groupId]/page.tsx:437`
- Modify: `src/app/m/feedback/(admin)/groups/[groupId]/trend/page.tsx:99-104`
- Create: `src/app/m/portal/portal.css`
- Modify: `src/app/m/portal/admin/service-form.tsx:35`, `src/app/m/portal/layout.tsx` (CSS-Import)
- Test: `src/app/m/feedback/_ui/feedback-css.test.ts` (neu)

**Interfaces:**
- Consumes: `.fb-knopfzeile`, `.fb-block-mobil` aus `feedback.css`
- Produces: `.portal-block-mobil` in `src/app/m/portal/portal.css`

**Warum:** `feedback.css` schaltet die Knopfzeilen bei **600px**, die Suite-Regel gilt bei **768px**. Bei 390px ist das folgenlos — deshalb wäre es beinahe durchgerutscht. Gemessen bei **700×900** auf `feedback/groups/2`: der Menü-Knopf der Shell ist sichtbar und der Verlauf zeigt die Schmalliste (beides sagt „mobil"), aber „Feedback starten" ist 144px, „QR-Code groß zeigen" 170px, „Kopieren" 88px, „PNG" 61px breit. Jedes Tablet im Hochformat sieht eine halb umgeschaltete Oberfläche.

**Warum `767.98px` und nicht `768px`:** bei exakt 768px gälten sonst `max-width: 768px` **und** `min-width: 768px` gleichzeitig, und welche Regel gewinnt, hinge an der Reihenfolge im Stylesheet.

- [ ] **Step 1: Prüfen, ob ein bestehender Test auf `600` zeigt**

```bash
rtk grep -rn "600px" src/app/m/feedback
```
Erwartet werden nur Treffer in `feedback.css` selbst und in `f/[slugSecret]/zettel.module.css` (**die öffentliche Ansicht — nicht anfassen**, Spec §6). Findet sich ein Test, der `600` festhält, wandert er in Schritt 2 mit.

- [ ] **Step 2: Test schreiben**

Neue Datei `src/app/m/feedback/_ui/feedback-css.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DAS MODUL SCHALTET AUF DEM SUITE-BREAKPOINT UM, NICHT AUF EINEM EIGENEN.
 *
 * Bis 2026-07-27 standen hier drei Zahlen: 600 (Kartenpolster, Legende,
 * Knopfzeile, fb-block-mobil, Spurzeilen), 768 (Verlauf-Umschaltung) und 992
 * (fb-sticky). Bei 390px war das folgenlos, und genau deshalb ist es lange
 * niemandem aufgefallen. Gemessen bei 700x900: der Menue-Knopf der Shell war
 * sichtbar und der Verlauf zeigte die Schmalliste — beides sagt „mobil" — und
 * die Knoepfe standen trotzdem nebeneinander und inhaltsbreit („Kopieren" 88px,
 * „PNG" 61px). Jedes Tablet im Hochformat sah eine halb umgeschaltete
 * Oberflaeche.
 *
 * WARUM DREI ZAHLEN TROTZDEM RICHTIG SIND — und warum dieser Test sie einzeln
 * nennt statt „genau einen Breakpoint" zu behaupten:
 *
 *   767.98 = der Suite-Breakpoint von unten. Nicht 768, sonst gaelten bei exakt
 *            768px beide Regeln und die Reihenfolge im Stylesheet entschiede.
 *   768    = der Suite-Breakpoint von oben (= antds `md`).
 *   992    = antds `lg`, und KEINE Mobil-/Desktop-Umschaltung: es ist die
 *            Schwelle, ab der `groups/[groupId]/page.tsx:225,254` ueberhaupt
 *            zwei Spalten hat (`<Col xs={24} lg={…}>`). Eine mitfahrende rechte
 *            Karte in einer einspaltigen Seite klebte ueber der Lagekarte. Der
 *            Wert folgt einer Rasterentscheidung, nicht einer zweiten
 *            Vorstellung davon, was „mobil" heiszt.
 *
 * Warum Quelltext-Scan: jsdom wertet Media Queries nicht aus. Das Ergebnis
 * besitzt `e2e/mobil-admin.spec.ts` bei 700x900.
 */
const CSS = readFileSync("src/app/m/feedback/_ui/feedback.css", "utf8");
const OHNE_KOMMENTARE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("feedback.css — Breakpoints", () => {
  it("kennt genau die begruendete Menge {767.98, 768, 992}", () => {
    const werte = [...OHNE_KOMMENTARE.matchAll(/\((?:min|max)-width:\s*([\d.]+)px\)/g)].map(
      (m) => m[1],
    );
    expect(werte.length).toBeGreaterThan(0);
    expect(new Set(werte)).toEqual(new Set(["767.98", "768", "992"]));
  });

  it("hat keine 600px-Medienabfrage mehr", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/\((?:min|max)-width:\s*600px\)/);
  });

  it("stapelt die Knopfzeile unterhalb des Suite-Breakpoints", () => {
    const block = /@media \(max-width: 767\.98px\)[\s\S]*?\.fb-knopfzeile\s*\{([^}]*)\}/.exec(
      OHNE_KOMMENTARE,
    );
    expect(block, ".fb-knopfzeile fehlt in der 767.98px-Abfrage").not.toBeNull();
    expect(block![1]).toMatch(/flex-direction:\s*column/);
  });

  it("gibt `fb-block-mobil` unterhalb des Suite-Breakpoints volle Breite", () => {
    const block = /@media \(max-width: 767\.98px\)[\s\S]*?\.fb-block-mobil\s*\{([^}]*)\}/.exec(
      OHNE_KOMMENTARE,
    );
    expect(block, ".fb-block-mobil fehlt in der 767.98px-Abfrage").not.toBeNull();
    expect(block![1]).toMatch(/width:\s*100%/);
  });
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/feedback/_ui/feedback-css.test.ts`
Expected: FAIL — die Menge enthält `600`, und die drei Blockprüfungen finden nichts.

- [ ] **Step 4: `feedback.css` umstellen**

Alle **sechs** Vorkommen von `@media (max-width: 600px)` werden zu `@media (max-width: 767.98px)`. Die Zeilen sind 133, 155, 300, 326, 370 und — falls beim Zählen abgewichen — jedes weitere Vorkommen; `rtk grep -n "max-width: 600px" src/app/m/feedback/_ui/feedback.css` zeigt sie alle.

Zusätzlich der Kommentar in Zeile 183-185, der heute lautet:

```
 * 768px ist der Umbruch des Entwurfs (§2.5) und bewusst NICHT die 600px der
 * uebrigen Regeln dieser Datei: die sechsspaltige Tabelle braucht mehr Breite
 * als eine Knopfzeile oder eine Legende.
```

wird zu:

```
 * 768px ist der Umbruch des Entwurfs (§2.5) UND der Breakpoint der ganzen
 * Suite. Bis 2026-07-27 schalteten die uebrigen Regeln dieser Datei bei 600px,
 * mit der Begruendung, die sechsspaltige Tabelle brauche mehr Breite als eine
 * Knopfzeile. Das erklaerte, warum die TABELLE spaeter umschaltet — es
 * erklaerte nicht, warum die Knopfzeile frueher umschalten muesste. Gemessen
 * bei 700x900: Menue-Knopf sichtbar, Schmalliste sichtbar, Knoepfe trotzdem
 * nebeneinander und inhaltsbreit. Seither steht ueberall 767.98/768.
 *
 * 767.98 und nicht 768 in den `max-width`-Abfragen: bei exakt 768px gaelten
 * sonst beide Seiten gleichzeitig, und die Reihenfolge im Stylesheet entschiede.
```

Ebenso der Kommentar in Zeile 328-330 („Auf 390px ist jeder Handlungsknopf volle Breite …") — er bleibt inhaltlich richtig und braucht keine Änderung.

- [ ] **Step 5: Die vier Knopfreihen ohne Mechanismus**

**a) `Teilnahme.tsx:165`** — der dritte Knopf einer Reihe, deren zwei andere `fb-block-mobil` tragen. Gemessen: 144px neben zweimal 324px.

```tsx
        <Button
          type="text"
          href={`/m/feedback/aushang/${groupId}`}
          target="_blank"
          rel="noreferrer"
          /* Die beiden Geschwister oben tragen `fb-block-mobil`, dieser eine
             nicht — gemessen 144px neben zweimal 324px. Kein Entwurf, ein
             vergessenes Attribut. */
          className="fb-block-mobil"
        >
          Aushang drucken
        </Button>
```

**b) `Verlauf.tsx:149-165`** — die einzige Reihe des Moduls ganz ohne Mechanismus, gemessen 68 / 146 / 251px. Der umschließende `<div>` bekommt die Klasse, jeder Knopf `fb-block-mobil`:

```tsx
        {/*
         * Drei LEISE Textknoepfe (§2.5): der Primaerknopf der Seite ist immer die
         * Zustandsaktion der Lagekarte, hier gibt es keinen zweiten. „Trend" und
         * „CSV" sind echte `href` — ein Tabstop, ein Fokusring, und beide
         * funktionieren ohne JavaScript.
         *
         * `fb-knopfzeile` ergaenzt 2026-07-27: unterhalb von 768px stehen sie
         * gestapelt und in voller Breite. Gemessen vorher bei 390px: 68 / 146 /
         * 251px nebeneinander, alle ohne Rahmen — die Trefferflaechen waren
         * weder erkennbar noch gleich breit.
         */}
        <div className="fb-knopfzeile">
          <Button
            type="text"
            href={`/m/feedback/groups/${groupId}/trend`}
            className="fb-block-mobil"
          >
            Trend
          </Button>
          <Button
            type="text"
            href={`/m/feedback/groups/${groupId}/export.csv`}
            className="fb-block-mobil"
          >
            CSV (alle Abende)
          </Button>
          {/*
           * Der Fall, den der Ein-Klick-Start sonst wegnimmt: einen Dienstabend
           * DOKUMENTIEREN, ohne Feedback zu erheben. Bewusst ein leiser
           * Textknopf und kein zweites Formular auf der Seite — die Felder
           * erscheinen erst auf Verlangen.
           */}
          <Button type="text" onClick={() => setNachtragen(true)} className="fb-block-mobil">
            Abend ohne Feedback nachtragen
          </Button>
        </div>
```

Das bisherige `style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: SPACE.xs }}` entfällt — `.fb-knopfzeile` bringt `display: flex`, `flex-wrap: wrap`, `align-items: center` und `gap: 12px` mit (`feedback.css:293-298`).

**c) `EinstellungenPanel.tsx:292` und `:303`** — die beiden folgenschwersten Aktionen des Moduls, gemessen 181px und 133px:

```tsx
          <Button danger loading={secretLaeuft} className="fb-block-mobil">
            Neues Secret erzeugen
          </Button>
```

```tsx
          <Button danger onClick={() => setOffen(true)} className="fb-block-mobil">
            Gruppe löschen
          </Button>
```

`Zeile` (Zeilen 354-380) selbst bleibt unverändert: sie hat bereits `flexWrap: "wrap"` und `flex: "1 1 240px"` am Textblock, der Knopf bricht also darunter — er füllte die Zeile nur nicht aus.

**d) `groups/[groupId]/page.tsx:437`** — „Auswertung ansehen", gemessen 167px in einer `flexWrap`-Reihe neben `Statistic` und `Notenpille`:

```tsx
        <Button
          href={`/m/feedback/groups/${groupId}/evenings/${lage.evening.id}/auswertung`}
          /* `fb-block-mobil` setzt `width: 100%`; in einer `flexWrap`-Reihe ist
             das zugleich die Flex-Basis, der Knopf bricht also unterhalb von
             768px in eine eigene Zeile und fuellt sie. Zahl und Notenpille
             bleiben darueber nebeneinander — sie sind Anzeige, kein Ziel. */
          className="fb-block-mobil"
        >
          Auswertung ansehen
        </Button>
```

**e) `trend/page.tsx:99-104`** — Monatsschalter und CSV-Knopf in einer Zeile. `Segmented` bricht nicht um und soll es auch nicht; nur der Knopf bekommt den Mechanismus:

```tsx
          <span className="fb-knopfzeile">
            <MonatsSegment monate={monate} />
            <Button
              type="text"
              href={`/m/feedback/groups/${group.id}/export.csv`}
              className="fb-block-mobil"
            >
              CSV
            </Button>
          </span>
```

- [ ] **Step 6: Das Portal bekommt dieselbe Regel — modul-eigen, nicht in `core`**

Neue Datei `src/app/m/portal/portal.css`:

```css
/*
 * Die eine Medienabfrage des Moduls `portal`.
 *
 * Warum HIER und nicht in `core`: der Maszstab aus docs/design/README.md ist
 * ein zweiter, heute belegbarer Nutznieszer. Den gibt es fuer diese Regel nicht
 * — `feedback` hat seine eigene Fassung (`.fb-block-mobil`), und die beiden
 * gleichzeitig nach `core` zu heben hiesze, ein Framework fuer zwei Anwender zu
 * bauen, von denen der eine seine Fassung schon hat. Wenn ein drittes Modul
 * dieselbe Regel braucht, ist DAS der Moment fuer den Umzug.
 *
 * 767.98px ist der Suite-Breakpoint von unten. Nicht 768, sonst gaelten bei
 * exakt 768px beide Seiten und die Reihenfolge im Stylesheet entschiede.
 */
@media (max-width: 767.98px) {
  /*
   * KEINE erhoehte Spezifitaet, und das ist geprueft, nicht geraten.
   *
   * Falle 5 (docs/design/README.md) trifft zu, wenn antd fuer DIESELBE
   * Eigenschaft eine eigene Regel mitbringt: `.nurMobil { display: none }`
   * verlor gegen `.ant-btn { display: inline-flex }`, weil beide (0,1,0) sind
   * und antds Stylesheet spaeter kommt. Fuer `width` gibt es diese Regel nicht
   * — antds `.ant-btn` deklariert keine Breite. Der Beleg steht im
   * Nachbarmodul: `feedback.css:332` ist ein blankes
   * `.fb-block-mobil { width: 100% }` ohne Praefix, und es wirkt (gemessen:
   * 324px breite Knoepfe bei 390px).
   *
   * Ein `:root`-Praefix ohne Kollision waere schlimmer als keiner: der naechste
   * Leser sucht die Kollision, findet keine, haelt den Praefix fuer Ballast und
   * entfernt ihn — genau die Bewegung, vor der Falle 5 warnt, nur umgekehrt.
   * Wer hier spaeter doch eine Erhoehung braucht, schreibt DANN dazu, wogegen.
   */
  .portal-block-mobil {
    width: 100%;
  }
}
```

`src/app/m/portal/layout.tsx` importiert sie (die Datei wird in Schritt 8 ohnehin für Task 6 angefasst; hier nur der Import in Zeile 1):

```tsx
import "./portal.css";
```

`src/app/m/portal/admin/service-form.tsx:35` lautet heute:

```tsx
      <Button htmlType="submit" type="primary" style={{ alignSelf: "flex-start" }}>
```

Daraus wird:

```tsx
      {/*
       * `alignSelf: "flex-start"` haelt den Knopf am Laptop so breit wie seine
       * Beschriftung — ein 480px breiter Absendeknopf laese sich als Flaeche,
       * nicht als Ziel. Unterhalb von 768px gilt die Suite-Regel „volle Breite,
       * untereinander"; gemessen bei 390px war er 84px breit.
       */}
      <Button
        htmlType="submit"
        type="primary"
        style={{ alignSelf: "flex-start" }}
        className="portal-block-mobil"
      >
```

**Ein Hinweis zu `alignSelf`:** es steht **inline** und schlägt damit jede Klasse — aber es steht auf einer *anderen* Eigenschaft als die Klasse. `width: 100%` und `align-self: flex-start` widersprechen sich nicht: sobald das Element die volle Zeile füllt, ist die Ausrichtung wirkungslos. Kein Konflikt, zwei Regeln, die einander unterhalb von 768px aufheben. Schritt 8 misst es nach.

- [ ] **Step 7: Tests laufen lassen**

```bash
rtk pnpm vitest run src/app/m/feedback/_ui/feedback-css.test.ts
rtk pnpm vitest run src/app/m/feedback src/app/m/portal
rtk pnpm typecheck
```
Expected: PASS.

- [ ] **Step 8: Im Browser messen — bei 700×900, dort sitzt der Riss**

Auf `http://feedback.localtest.me:3000/groups/2`:

```js
[...document.querySelectorAll(".ant-btn")]
  .filter((el) => el.getBoundingClientRect().width > 0)
  .map((el) => ({ w: Math.round(el.getBoundingClientRect().width), t: el.textContent.trim().slice(0, 26) }))
```

Expected: „Feedback starten", „QR-Code groß zeigen", „Kopieren", „PNG", „Aushang drucken", „Trend", „CSV (alle Abende)", „Abend ohne Feedback nachtragen", „Neues Secret erzeugen", „Gruppe löschen", „Auswertung ansehen" stehen **alle** auf derselben, vollen Kartenbreite. Vorher gemessen: 144 / 170 / 88 / 61 / 144 / 68 / 146 / 251 / 181 / 133 / 167.

Dann bei **1280×800** dieselbe Abfrage — Expected: die Knöpfe sind wieder inhaltsbreit (also **nicht** alle gleich). Das ist die Hälfte, die nur der Desktop-Lauf beweisen kann: wäre die Medienabfrage falsch herum oder ohne Wirkung, sähen beide Viewports gleich aus.

Auf `http://portal.localtest.me:3000/admin` bei 700×900: „Anlegen" füllt die Formularbreite; bei 1280×800 ist er wieder 84px breit.

- [ ] **Step 9: Volle Prüfung und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
rtk git add src/app/m/feedback/_ui/feedback.css src/app/m/feedback/_ui/feedback-css.test.ts src/app/m/feedback/_ui/Teilnahme.tsx src/app/m/feedback/_ui/Verlauf.tsx src/app/m/feedback/_ui/EinstellungenPanel.tsx "src/app/m/feedback/(admin)/groups/[groupId]/page.tsx" "src/app/m/feedback/(admin)/groups/[groupId]/trend/page.tsx" src/app/m/portal/portal.css src/app/m/portal/layout.tsx src/app/m/portal/admin/service-form.tsx
rtk git commit -m "fix(feedback/portal): ein Breakpoint statt zweier, Handlungsknoepfe mobil volle Breite"
```

---

### Task 5: Trefferflächen — kein Bedienelement unter 44px

**Files:**
- Modify: `src/app/m/feedback/_ui/Zuordnung.tsx:199-207`
- Modify: `src/app/m/feedback/_ui/Verlauf.tsx:6, 570, 618`
- Modify: `src/app/m/feedback/_ui/TrendDiagramm.tsx:88`
- Modify: `src/app/m/portal/admin/service-table.tsx:46`
- Test: `src/app/m/feedback/_ui/groessen.test.ts` (neu)

**Interfaces:**
- Consumes: `TAP` aus `@/core/theme/tokens`
- Produces: nichts

**`src/core` wird in diesem Plan nirgends angefasst.** Der einzige Befund, der dort läge — die Kopfzeile mit ihrer Mindestbreite von 904px zwischen 768 und 903px, samt dem dort auf 0px geschrumpften Modultitel — geht als Nacharbeit an Teilprojekt A. Die Begründung samt beider durchgespielter Behebungsversuche steht in der Spec §5.4; die Kurzfassung: die billige Fassung (`.modulnav { min-width: 0; overflow-x: auto }`) macht die Navigation 32px breit und damit unbrauchbar, die richtige verlangt, `Layout.headerHeight` von fest 64 auf `min-height` umzustellen — eine Entscheidung über jede Kopfzeile der Suite. **Deshalb gibt es dazu auch keinen Test in Task 7:** er wäre von Anfang an rot.

- [ ] **Step 1: Test schreiben (Größen)**

Neue Datei `src/app/m/feedback/_ui/groessen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * `size` STEHT AUF KEINEM BEDIENELEMENT — `controlHeight` IST 56.
 *
 * Die Regel steht in docs/design/README.md (Falle 4) und wird im Modul selbst
 * zitiert (`Zuordnung.tsx`, Kommentar an der AutoComplete-Zeile). Sie war
 * trotzdem viermal verletzt. Die Zahlen dahinter, gemessen im Browser:
 * `controlHeightSM` leitet antd aus `controlHeight` ab und ergibt hier **42px**
 * — nicht die 24 aus antds Vorgabe, aber auch nicht die 44, die eine
 * Trefferflaeche braucht. Der schwerste Fall war das „…"-Menue der
 * Verlaufszeile: 24px BREIT, und es ist das einzige Bedienelement der Zeile.
 *
 * DIE AUSNAHME IST BENANNT, NICHT UEBERSEHEN: `Aktualisierer.tsx` traegt
 * `size="small"` mit einer Begruendung im Quelltext („die Regel richtet sich
 * gegen `size=\"large\"`"). Sie steht unten in AUSNAHMEN und faellt auf, wenn
 * jemand eine zweite hinzufuegt, ohne sie hier einzutragen.
 *
 * `size` am `<Table>` selbst ist KEIN Bedienelement, sondern Zellpolster — der
 * Scan sucht deshalb nach `size=` an `<Button`, nicht an jeder Komponente.
 */
const AUSNAHMEN = new Set(["Aktualisierer.tsx"]);

function tsxDateien(verzeichnis: string): string[] {
  return readdirSync(verzeichnis)
    .filter((n) => n.endsWith(".tsx") && !n.endsWith(".test.tsx"))
    .map((n) => join(verzeichnis, n));
}

/**
 * Das JSX-Element, zu dem eine Prop gehoert: das zuletzt geoeffnete Tag vor der
 * Fundstelle.
 *
 * WARUM NICHT `\/<Button\b[^>]*>\/`, was naeher laege: eine Button-Prop kann eine
 * Pfeilfunktion enthalten (`onClick={() => entfernen(id)}`), und deren `>`
 * beendet die Zeichenklasse `[^>]` mitten im Starttag. Steht `size` dahinter,
 * findet der naive Ausdruck es nicht — der Scan waere still unvollstaendig,
 * und genau davon hat dieses Projekt schon genug.
 *
 * Die Grenze der Heuristik, damit sie niemand ueberschaetzt: sie sieht
 * Verschachtelung nur ueber die Reihenfolge im Text. Ein `size` an einem
 * Element INNERHALB eines Buttons wird korrekt diesem inneren Element
 * zugeordnet — das ist gewollt. Ein `size` in einem Kommentar zwischen zwei
 * Tags wuerde falsch zugeordnet; deshalb prueft der Scan die kommentarfreie
 * Quelle.
 */
function elementVor(quelle: string, index: number): string {
  const treffer = [...quelle.slice(0, index).matchAll(/<([A-Z][A-Za-z]*)/g)];
  return treffer.length > 0 ? treffer[treffer.length - 1][1] : "";
}

describe("Bedienelemente ohne `size`", () => {
  const dateien = [
    ...tsxDateien("src/app/m/feedback/_ui"),
    ...tsxDateien("src/app/m/portal/admin"),
  ];

  it("findet ueberhaupt Dateien (sonst prueft der Scan nichts)", () => {
    expect(dateien.length).toBeGreaterThan(10);
  });

  for (const datei of dateien) {
    const name = datei.split("/").pop()!;
    it(`${name}: kein size an einem Button`, () => {
      const quelle = readFileSync(datei, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      // `size=` mit Gleichheitszeichen: `size: "small"` in einem
      // `pagination`-Objekt ist eine Objekteigenschaft, kein JSX-Attribut, und
      // betrifft die Blaetterleiste, kein Bedienelement.
      const treffer = [...quelle.matchAll(/\bsize=/g)]
        .map((m) => ({ element: elementVor(quelle, m.index!), stelle: m.index! }))
        .filter((t) => t.element === "Button");

      if (AUSNAHMEN.has(name)) {
        expect(treffer.length, `${name} ist als Ausnahme gefuehrt — steht sie noch da?`).toBe(1);
      } else {
        const zeilen = treffer.map((t) => quelle.slice(0, t.stelle).split("\n").length);
        expect(treffer, `${datei}: size an einem Button in Zeile ${zeilen.join(", ")}`).toEqual([]);
      }
    });
  }
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/feedback/_ui/groessen.test.ts`
Expected: FAIL für `Zuordnung.tsx`, `Verlauf.tsx`, `TrendDiagramm.tsx`, `service-table.tsx`; PASS für `Aktualisierer.tsx`.

- [ ] **Step 3: Die fünf `size`-Props entfernen**

**a) `Zuordnung.tsx:199-207`** — `size="small"` entfällt:

```tsx
              <Button
                type="text"
                data-testid={`entfernen-${p.userId}`}
                loading={laeuft}
                onClick={() => entfernen(p.userId)}
              >
                Entfernen
              </Button>
```

**b) `Verlauf.tsx:570`**:

```tsx
      <Button type="text" loading={laeuft}>
        Jetzt starten
      </Button>
```

**c) `Verlauf.tsx:618`** — hier reicht das Entfernen von `size` **nicht**: gemessen war der Knopf 24px **breit**, und die Höhe war nie das eigentliche Problem. Er bekommt zusätzlich eine Mindestbreite:

```tsx
        <Button
          type="text"
          /*
           * `minWidth: TAP` ist der Punkt dieser Zeile, nicht das entfernte
           * `size`. Gemessen bei 390px: 24px breit, 42px hoch — und das ist das
           * EINZIGE Bedienelement der Verlaufszeile („Bearbeiten", „Loeschen").
           * Ein Auslassungszeichen ist schmal; die Trefferflaeche darf es nicht
           * sein. Der umgebende Container in Zeile 475 ist bereits 44px breit —
           * der Knopf darin fuellte ihn nur nicht aus.
           */
          style={{ minWidth: TAP }}
          aria-label={`Aktionen für den ${formatDatumLang(zeile.datum)}`}
        >
          …
        </Button>
```

**`TAP` fehlt in dieser Datei noch.** `Verlauf.tsx:6` lautet heute `import { SPACE } from "@/core/theme/tokens";` — daraus wird:

```ts
import { SPACE, TAP } from "@/core/theme/tokens";
```

(`TAP = 56` steht in `src/core/theme/tokens.ts:33`.)

**d) `TrendDiagramm.tsx:88`**:

```tsx
              <Button
                key={f.id}
                type={an ? "default" : "text"}
                aria-pressed={an}
                disabled={!an && voll}
                onClick={() => umschalten(f.id)}
              >
                {f.text}
              </Button>
```

**e) `service-table.tsx:46`** — der Löschknopf, gemessen 70×42px, zerstörende Aktion ohne Rückfrage:

```tsx
              <Button htmlType="submit" danger>
                Löschen
              </Button>
```

Das `size="small"` am `<Table>` selbst (Zeile 29) **bleibt** — es ist Zellpolster, kein Bedienelement, und die Regel meint Bedienelemente.

- [ ] **Step 4: Tests und Typecheck**

```bash
rtk pnpm vitest run src/app/m/feedback/_ui/groessen.test.ts
rtk pnpm vitest run src/app/m/feedback src/app/m/portal
rtk pnpm typecheck
```
Expected: PASS.

- [ ] **Step 5: Im Browser messen**

Bei **390×844** auf `http://feedback.localtest.me:3000/groups/2`, den Einstellungen-Block ausklappen (sonst ist die Zuordnungstabelle mit ihrem „Entfernen"-Knopf gar nicht im DOM):

```js
[...document.querySelectorAll(".ant-btn")]
  .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.width < 44 || b.height < 44); })
  .map((el) => ({ w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height), t: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24) }))
```

Expected: leeres Array. Vorher gemessen: `{w: 24, h: 42, t: "…"}` und `{w: 78, h: 42, t: "Entfernen"}`.

Dasselbe auf `http://portal.localtest.me:3000/admin` — vorher `{w: 70, h: 42, t: "Löschen"}`.

Und auf `http://feedback.localtest.me:3000/groups/1/trend` (lädt seit Task 1) — dort sitzen die Frage-Schalter aus `TrendDiagramm.tsx`.

**Eine Gegenprobe, die dazugehört:** die Verlaufszeile darf durch die breitere „…"-Fläche nicht höher werden, sonst kippt das Zeilenraster.

```js
[...document.querySelectorAll(".fb-verlauf-schmal [class*=fb-fokus], .fb-verlauf-schmal > *")]
  .map((el) => Math.round(el.getBoundingClientRect().height))
```

Expected: unverändert gegenüber dem Stand vor dieser Aufgabe (die Zeile trägt `minHeight: 68`, `Verlauf.tsx:426`).

- [ ] **Step 6: Volle Prüfung und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
rtk git add src/app/m/feedback/_ui/Zuordnung.tsx src/app/m/feedback/_ui/Verlauf.tsx src/app/m/feedback/_ui/TrendDiagramm.tsx src/app/m/portal/admin/service-table.tsx src/app/m/feedback/_ui/groessen.test.ts
rtk git commit -m "fix(feedback/portal): Trefferflaechen ab 44px, `size` von Bedienelementen entfernt"
```

---

### Task 6: Der gekürzte Kartentitel, das halbe Teilnehmerfeld, der fehlende Weg zur Portal-Verwaltung

**Files:**
- Modify: `src/app/m/feedback/_ui/Lagekarte.tsx:204-210`
- Modify: `src/app/m/feedback/_ui/StartFormular.tsx:103`
- Modify: `src/app/m/portal/layout.tsx`
- Test: `src/app/m/portal/layout.test.tsx` (neu)

**Interfaces:**
- Consumes: `canAdminModule` aus `@/core/auth/guards`, `SuiteNavItem` aus `@/core/shell/types`
- Produces: `navFuerPortal(darfVerwalten: boolean): SuiteNavItem[]` als benannter Export aus `src/app/m/portal/layout.tsx`

- [ ] **Step 1: Der Kartentitel, der bei 390px verschwindet**

Gemessen: `.ant-card-head-title` braucht **140px**, bekommt **94px**, und antds `white-space: nowrap; text-overflow: ellipsis` macht daraus „NÄCHSTER …". Der einzige Fall im ganzen Durchgang, in dem bei 390px Text *verschwindet*. Ursache: `title` und `extra` teilen sich eine Zeile im Kartenkopf.

`src/app/m/feedback/_ui/Lagekarte.tsx:204-210` lautet heute:

```tsx
    <Card
      variant="outlined"
      styles={KARTE}
      title={erststart ? "ERSTER SCHRITT" : "NÄCHSTER SCHRITT"}
      extra={<span style={T.meta}>Gerade läuft kein Feedback.</span>}
    >
```

Daraus wird:

```tsx
    <Card
      variant="outlined"
      styles={KARTE}
      /*
       * DER TITEL DARF NICHT GEKUERZT WERDEN. Gemessen bei 390px: antds
       * `.ant-card-head-title` traegt `white-space: nowrap; text-overflow:
       * ellipsis`, brauchte 140px und bekam 94 — aus „NÄCHSTER SCHRITT" wurde
       * „NÄCHSTER …". Der Kartenkopf legt `title` und `extra` in EINE Zeile,
       * und das `extra` nahm den Rest.
       *
       * `whiteSpace: "normal"` ueber `styles.title` statt ueber eine eigene
       * Klasse: antds `.ant-card-head-title` ist (0,1,0), eine eigene Klasse
       * waere es auch, und antds Stylesheet kommt spaeter (Falle 5). Ein
       * `styles`-Eintrag landet als Inline-Stil am selben Knoten und gewinnt
       * ohne Spezifitaets-Wettlauf.
       */
      styles={{ ...KARTE, title: { whiteSpace: "normal" } }}
      title={erststart ? "ERSTER SCHRITT" : "NÄCHSTER SCHRITT"}
      extra={<span style={T.meta}>Gerade läuft kein Feedback.</span>}
    >
```

**Drei Dinge, die dabei stimmen müssen — alle nachgesehen, nicht angenommen:**

1. **`styles` darf nur einmal stehen.** Die alte Zeile `styles={KARTE}` entfällt, die neue ersetzt sie. Zwei `styles`-Props sind in JSX kein Fehler, sondern stille Überschreibung — der zweite gewinnt, und `KARTE` wäre weg.
2. **Kein `...KARTE.title`.** `KARTE` (`Lagekarte.tsx:50-53`) hat genau zwei Schlüssel, `header` und `body`, und ist mit `satisfies Record<string, CSSProperties>` typisiert — `KARTE.title` gäbe einen Typfehler, nicht `undefined`. Der neue Eintrag steht deshalb für sich.
3. **`title` ist ein gültiger `styles`-Schlüssel von antds `Card`** (semantische Struktur in antd 6: `root`, `header`, `title`, `extra`, `cover`, `body`, `actions`) und landet an genau dem Knoten, der `text-overflow: ellipsis` trägt. Er ist **nicht** dasselbe wie `header` — das ist die umgebende Zeile, und `whiteSpace` dort ließe die Kürzung im Kind bestehen.

- [ ] **Step 2: Das halbe Teilnehmerfeld**

`src/app/m/feedback/_ui/StartFormular.tsx:103` lautet heute:

```tsx
        <Col xs={12} sm={6}>
```

Daraus wird:

```tsx
        {/*
         * `xs={24}` statt `xs={12}`: alle Nachbarn in dieser Row sind `xs={24}`
         * (Datum Zeile 71, Thema Zeile 92). Ein halbes Zahlenfeld allein unter
         * zwei vollbreiten Feldern liest sich abgeschnitten, nicht bewusst
         * schmal. Ab `sm` bleibt es bei einem Sechstel — dort steht es neben
         * seinen Nachbarn und die Breite ist eine Aussage ueber den Inhalt.
         */}
        <Col xs={24} sm={6}>
```

- [ ] **Step 3: Test für die Portal-Navigation schreiben**

Neue Datei `src/app/m/portal/layout.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { navFuerPortal } from "./layout";

/**
 * DER WEG ZUR VERWALTUNG.
 *
 * `portal/layout.tsx` rief `<Shell>` ohne `nav` — es gab damit weder in der
 * Kopfzeile noch im Drawer einen Weg nach `/admin`, die Seite war nur ueber die
 * Adresszeile erreichbar. Das ist bei 1280px derselbe Mangel wie bei 390px, aber
 * auf einem Telefon ist die Adresszeile das schlechteste Eingabegeraet, das es
 * gibt: was am Laptop laestig ist, ist dort eine Sperre. Es ist genau die
 * Pruefrage „Hat jede Action einen Weg in der Oberflaeche?" aus
 * docs/design/README.md.
 *
 * WARUM DER NICHT-ADMIN GAR KEINE NAVIGATION BEKOMMT: sie haette genau einen
 * Eintrag („Uebersicht"), der auf die Seite zeigt, auf der man steht. Das ist
 * keine Navigation, das ist eine Beschriftung — und seit dem Kopfzeilen-Befund
 * (Spec §5.4) kostet jeder Eintrag zusaetzlich Breite in einem Band, in dem
 * sie ohnehin nicht reicht. Der Slot ist optional; wer nichts
 * uebergibt, bekommt exakt das bisherige Bild.
 *
 * Reine Ableitungslogik, deshalb ein Unit-Test und kein DOM-Test: es gibt hier
 * nichts zu rendern, was jsdom ehrlich pruefen koennte.
 */
describe("Portal — Navigationseintraege", () => {
  it("gibt Modul-Admins Uebersicht und Verwaltung", () => {
    expect(navFuerPortal(true)).toEqual([
      { key: "start", title: "Übersicht", href: "/" },
      { key: "admin", title: "Verwaltung", href: "/admin" },
    ]);
  });

  it("gibt allen anderen gar keine Navigation statt einer Ein-Punkt-Zeile", () => {
    expect(navFuerPortal(false)).toEqual([]);
  });
});
```

- [ ] **Step 4: Test laufen lassen, Fehlschlag prüfen**

Run: `rtk pnpm vitest run src/app/m/portal/layout.test.tsx`
Expected: FAIL — `navFuerPortal` wird nicht exportiert.

- [ ] **Step 5: `portal/layout.tsx` umbauen**

`src/app/m/portal/layout.tsx` lautet vollständig (der `portal.css`-Import aus Task 4 ist mit aufgenommen):

```tsx
import "./portal.css";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { canAdminModule } from "@/core/auth/guards";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Navigationseintraege des Moduls — als benannte Funktion, damit die
 * Ableitung ohne Rendering pruefbar ist (`layout.test.tsx`).
 *
 * OHNE VERWALTUNGSRECHT GAR KEINE NAVIGATION, statt einer Zeile mit dem einen
 * Eintrag „Uebersicht", der auf die Seite zeigt, auf der man steht. Der Slot
 * ist optional (siehe 2026-07-27-suite-chrome-design.md §5); wer nichts
 * uebergibt, bekommt exakt das bisherige Bild.
 */
export function navFuerPortal(darfVerwalten: boolean): SuiteNavItem[] {
  if (!darfVerwalten) return [];
  return [
    { key: "start", title: "Übersicht", href: "/" },
    { key: "admin", title: "Verwaltung", href: "/admin" },
  ];
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("portal");
  // Die Verwaltung steht nur Modul-Admins offen (`core/auth/guards`, hier die
  // Suite-Admin-Gruppe, weil `portal` keine eigene fuehrt) — also steht sie
  // auch nur ihnen in der Navigation. Ein Eintrag, der auf 404 fuehrt, ist
  // schlimmer als kein Eintrag. Dieselbe Bauform wie in `qr/layout.tsx`.
  const darfVerwalten = await canAdminModule("portal");

  return (
    <Shell variant={mod.shell} moduleKey={mod.key} nav={navFuerPortal(darfVerwalten)}>
      {children}
    </Shell>
  );
}
```

Das Layout wird dadurch `async`. Das ist unbedenklich: `SuiteHeader` ruft ohnehin `await auth()`, und `pnpm build` weist jede Route der Suite als `ƒ (Dynamic)` aus.

- [ ] **Step 6: Tests laufen lassen**

```bash
rtk pnpm vitest run src/app/m/portal src/app/m/feedback
rtk pnpm typecheck
```
Expected: PASS.

- [ ] **Step 7: Im Browser messen**

Bei **390×844** auf `http://feedback.localtest.me:3000/groups/2`:

```js
(() => { const t = document.querySelector(".ant-card-head-title"); return { scrollW: t.scrollWidth, clientW: t.clientWidth, txt: t.textContent }; })()
```
Expected: `scrollWidth <= clientWidth`, Text vollständig „NÄCHSTER SCHRITT" (vorher 140 gegen 94 und „NÄCHSTER …").

Ebenda: das Feld „Teilnehmer" füllt die Zeile. Bei 1280×800 steht es wieder neben Datum und Thema.

Auf `http://portal.localtest.me:3000/` bei 390×844: Menü-Knopf öffnen — der Drawer enthält „Übersicht" und „Verwaltung". Bei 1280×800 stehen beide in der Kopfzeile. Anschließend **abgemeldet oder mit einer Sitzung ohne `dashboard-admins`** prüfen: `document.querySelector('[data-testid="modulnav"]')` ist `null`.

- [ ] **Step 8: Volle Prüfung und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
rtk git add src/app/m/feedback/_ui/Lagekarte.tsx src/app/m/feedback/_ui/StartFormular.tsx src/app/m/portal/layout.tsx src/app/m/portal/layout.test.tsx
rtk git commit -m "fix(feedback/portal): Kartentitel bleibt lesbar, Teilnehmerfeld volle Breite, Weg zur Portal-Verwaltung"
```

---

### Task 7: Der Playwright-Lauf über drei Viewports und die Querschnittsregeln

**Files:**
- Create: `e2e/mobil-admin.spec.ts`
- Modify: `docs/design/README.md` (Abschnitt „Mobil")

**Interfaces:**
- Consumes: `devLogin` aus `e2e/fixtures.ts`
- Produces: nichts

**Warum ein eigener Lauf und nicht Ergänzungen in `shell-mobil.spec.ts`:** dieser Lauf besitzt eine andere Aussage (die Seiten, nicht die Shell) und braucht drei Viewports statt zwei.

**Zeitbudget.** `playwright.config.ts` fährt mit `workers: 1` und 90 s je Test; ein kalter `devLogin` ist dort mit 13,7 s gemessen und begründet. Deshalb: **ein `describe` je Viewport, darin eine einzige Anmeldung**, und aus dieser Sitzung heraus über die Modul-Hosts navigieren. Das trägt, weil `AUTH_COOKIE_DOMAIN=.localtest.me` die Sitzung über alle Modul-Subdomains hält.

- [ ] **Step 1: E2E schreiben**

Neue Datei `e2e/mobil-admin.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * DER MOBILE DURCHGANG DURCH DIE ADMIN-ARBEITSSEITEN (Teilprojekt C).
 *
 * Der einzige Ort, der Media Queries und Kaskade wirklich auswertet. Was die
 * Quelltext-Scans festhalten (`tabellen.test.ts`, `feedback-css.test.ts`,
 * `groessen.test.ts`), ist die REGEL; hier steht das ERGEBNIS.
 *
 * DREI VIEWPORTS, UND JEDER BESITZT ETWAS, DAS DIE ANDEREN NICHT SEHEN:
 *
 *   390x844  — das Telefon. Hier sitzen die fuenf gemessenen Seitwaerts-Scrolls.
 *   700x900  — das Tablet zwischen den alten 600px des Moduls und den 768px der
 *              Suite. Bei 390px sind Vorher und Nachher identisch; nur dieser
 *              Lauf kann die Vereinheitlichung ueberhaupt beweisen.
 *   1280x800 — „man sieht es auf dem Desktop NICHT". Keine Zugabe: ein Test,
 *              der nur bei 390px misst, kann eine display-Regel gar nicht
 *              widerlegen, und ein `scroll.x` koennte auf dem Desktop die
 *              Spaltenverteilung aendern, ohne dass irgendwo etwas ueberlaeuft.
 *
 * KEIN LAUF BEI 768 ODER 900, und das ist eine Entscheidung, kein Versehen:
 * dort ist die Kopfzeile defekt (Modultitel 0px breit, Modulnavigation
 * auszerhalb des Sichtfelds, Mindestbreite 904px). Der Befund liegt in
 * `src/core/shell` und geht als Nacharbeit an Teilprojekt A — siehe
 * docs/superpowers/specs/2026-07-27-mobiler-durchgang-design.md §5.4, dort
 * stehen beide durchgespielten Behebungsversuche mit ihren Messwerten. Ein Test
 * hier waere von Anfang an rot und wuerde die Suite dauerhaft blockieren.
 *
 * EINE ANMELDUNG JE BLOCK, nicht je Test: `workers: 1`, und ein kalter
 * `devLogin` kostet gemessen 13,7 s. `AUTH_COOKIE_DOMAIN=.localtest.me` traegt
 * die Sitzung ueber alle Modul-Hosts — im Durchgang, aus dem dieser Plan stammt,
 * reichte eine Anmeldung fuer 17 Seitenaufrufe ueber drei Hosts.
 */

/*
 * KOMMAGETRENNT, NICHT MIT LEERZEICHEN. `parseDevGroups` (core/auth) trennt an
 * Kommas; mit Leerzeichen entsteht EINE Gruppe namens
 * „da-feedback-admin dashboard-admins drk-qr-admin", `isAdmin` bleibt false,
 * und `moduleAdminPageOrNotFound("portal")` antwortet mit 404 — die
 * portal- und qr-Verwaltungsseiten faenden sich dann nicht.
 *
 * Nachgemessen ueber /api/auth/session: mit Leerzeichen
 * `groups: ["da-feedback-admin dashboard-admins drk-qr-admin"], isAdmin: false`;
 * mit Kommas drei Eintraege und `isAdmin: true`. Kein bestehender Lauf in `e2e/`
 * konnte das zeigen, weil dort jeder `devLogin` genau EINE Gruppe uebergibt.
 */
const GRUPPEN = "da-feedback-admin,dashboard-admins,drk-qr-admin";

/** Alles, was rechts aus dem Sichtfeld ragt — mit Namen, damit ein Fehlschlag den Verursacher nennt. */
async function ueberlauf(page: Page) {
  return page.evaluate(() => ({
    vw: window.innerWidth,
    doc: document.documentElement.scrollWidth,
    schuldige: [...document.querySelectorAll("body *")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.right > window.innerWidth + 1 && b.width > 1 && b.height > 1;
      })
      .map((el) => {
        const b = el.getBoundingClientRect();
        const klasse = typeof el.className === "string" ? el.className : "";
        return `${el.tagName}.${klasse.slice(0, 40)} rechts=${Math.round(b.right)}`;
      })
      .slice(0, 5),
  }));
}

/** Die Seiten des Durchgangs. Host und Pfad getrennt, weil die Sitzung ueber alle Hosts traegt. */
const SEITEN = [
  { name: "feedback — Gruppenliste", host: "feedback.localtest.me", pfad: "/" },
  { name: "feedback — Gruppenvergleich", host: "feedback.localtest.me", pfad: "/vergleich" },
  { name: "feedback — Gruppe", host: "feedback.localtest.me", pfad: "/groups/1" },
  { name: "feedback — Trend", host: "feedback.localtest.me", pfad: "/groups/1/trend" },
  {
    name: "feedback — Auswertung",
    host: "feedback.localtest.me",
    pfad: "/groups/1/evenings/1/auswertung",
  },
  { name: "portal — Dienste verwalten", host: "portal.localtest.me", pfad: "/admin" },
  { name: "qr — Presets verwalten", host: "qr.localtest.me", pfad: "/admin" },
];

test.describe("390x844 — das Telefon", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keine Admin-Seite scrollt seitwaerts", async ({ page }) => {
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    for (const seite of SEITEN) {
      await page.goto(`http://${seite.host}:3100${seite.pfad}`);
      await page.waitForLoadState("networkidle");
      const mass = await ueberlauf(page);
      expect(mass.doc, `${seite.name}: ${mass.schuldige.join(" | ")}`).toBe(mass.vw);
    }
  });

  test("die Trendseite antwortet mit 200", async ({ page }) => {
    // DER EINZIGE TEST, DER DIE RSC-GRENZE PRUEFEN KANN. `MONATS_FENSTER` kam
    // aus einem "use client"-Modul und war serverseitig kein Array — die Seite
    // antwortete mit 500. Unter Vitest sind beide Module normale ES-Module,
    // dort ist der Fehler unsichtbar.
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    const antwort = await page.goto("http://feedback.localtest.me:3100/groups/1/trend");
    expect(antwort?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Trend");
  });

  test("die ueberlaufenden Tabellen scrollen in ihrem eigenen Kasten", async ({ page }) => {
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    for (const ziel of [
      "http://feedback.localtest.me:3100/vergleich",
      "http://portal.localtest.me:3100/admin",
    ]) {
      await page.goto(ziel);
      const mass = await page.evaluate(() => {
        const kasten = document.querySelector(".ant-table-content") as HTMLElement;
        const tabelle = document.querySelector(".ant-table table") as HTMLElement;
        return { kasten: kasten.clientWidth, tabelle: tabelle.scrollWidth };
      });
      // Die Tabelle ist BREITER als ihr Kasten — genau das ist der Beweis, dass
      // der Ueberlauf im Kasten sitzt und nicht mehr im Dokument.
      expect(mass.tabelle, ziel).toBeGreaterThan(mass.kasten);
    }
  });

  test("kein Bedienelement ist schmaler oder niedriger als 44px", async ({ page }) => {
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    await page.goto("http://feedback.localtest.me:3100/groups/2");
    // Der Einstellungen-Block ist eingeklappt; die Zuordnungstabelle mit ihrem
    // „Entfernen"-Knopf wird erst dadurch sichtbar.
    await page.getByText("Einstellungen", { exact: false }).first().click();
    const zuKlein = await page.evaluate(() =>
      [...document.querySelectorAll(".ant-btn")]
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && (b.width < 44 || b.height < 44);
        })
        .map((el) => {
          const b = el.getBoundingClientRect();
          const t = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24);
          return `${t} ${Math.round(b.width)}x${Math.round(b.height)}`;
        }),
    );
    expect(zuKlein).toEqual([]);
  });

  test("der Kartentitel wird nicht gekuerzt", async ({ page }) => {
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    await page.goto("http://feedback.localtest.me:3100/groups/1");
    const mass = await page.evaluate(() => {
      const t = document.querySelector(".ant-card-head-title") as HTMLElement;
      return { scrollW: t.scrollWidth, clientW: t.clientWidth, text: t.textContent ?? "" };
    });
    expect(mass.scrollW, `gekuerzt: „${mass.text}"`).toBeLessThanOrEqual(mass.clientW);
  });

  test("eine lange Adresse spannt weder Verlauf noch QR-Ansicht auf", async ({ page }) => {
    const lang =
      "https://wiki.iuk-ue.de/books/einsatzhandbuch/chapter/funk-und-fernmeldedienst/page/kanaltrennung";
    await page.goto("http://qr.localtest.me:3100/");
    await page.getByLabel("Link oder Text").fill(lang);
    await page.getByRole("button", { name: "QR-Code erzeugen" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("wiki.iuk-ue.de");
    let mass = await ueberlauf(page);
    expect(mass.doc, `QR-Ansicht: ${mass.schuldige.join(" | ")}`).toBe(mass.vw);

    // Zurueck auf den Generator — der Verlaufseintrag traegt jetzt dieselbe URL
    // als Beschriftung. Das war der zweite Seitwaerts-Scroll des Moduls.
    await page.goto("http://qr.localtest.me:3100/");
    await expect(page.getByTestId("history-entry").first()).toBeVisible();
    mass = await ueberlauf(page);
    expect(mass.doc, `Verlauf: ${mass.schuldige.join(" | ")}`).toBe(mass.vw);
  });
});

test.describe("700x900 — das Tablet zwischen den alten 600 und den 768 der Suite", () => {
  test.use({ viewport: { width: 700, height: 900 } });

  test("Handlungsknoepfe stehen untereinander und in voller Breite", async ({ page }) => {
    /*
     * DER EINZIGE LAUF, DER DIE VEREINHEITLICHUNG BEWEISEN KANN. Bei 390px
     * sehen Vorher und Nachher identisch aus (600 und 768 greifen dort beide),
     * bei 1280px ebenso (keins von beiden greift). Nur hier lag der Riss:
     * gemessen vorher „Kopieren" 88px und „PNG" 61px, waehrend der Menue-Knopf
     * der Shell sichtbar war und der Verlauf die Schmalliste zeigte.
     */
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    await page.goto("http://feedback.localtest.me:3100/groups/2");
    /*
     * NICHT gegen die Elternbreite messen, auch wenn das naeher laege:
     * `width: 100%` loest gegen die INHALTSBOX des Elternteils auf,
     * `getBoundingClientRect()` liefert die Rahmenbox samt Polsterung. Bei einem
     * gepolsterten Elternteil waere die Erwartung „gleich breit" falsch, ohne
     * dass irgendetwas kaputt ist — heute geht sie nur zufaellig durch, weil
     * keiner dieser Container polstert.
     *
     * Die tragfaehige Formulierung ist relativ: Knoepfe, die sich einen
     * Elternteil teilen, sind unterhalb von 768px GLEICH breit. Das ist genau
     * die Zusage („untereinander, volle Breite"), es ist polsterungsunabhaengig,
     * und die Gegenprobe bei 1280px (ungleich breit) macht daraus ein Paar.
     */
    const gruppen = await page.evaluate(() => {
      const nachEltern = new Map<Element, number[]>();
      for (const el of document.querySelectorAll(".fb-block-mobil")) {
        const eltern = el.parentElement!;
        const liste = nachEltern.get(eltern) ?? [];
        liste.push(Math.round(el.getBoundingClientRect().width));
        nachEltern.set(eltern, liste);
      }
      return [...nachEltern.values()].filter((l) => l.length > 1);
    });
    expect(gruppen.length, "keine Knopfgruppe mit `fb-block-mobil` gefunden").toBeGreaterThan(1);
    for (const breiten of gruppen) {
      expect(
        Math.max(...breiten) - Math.min(...breiten),
        `ungleich breit: ${breiten.join(", ")}`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("1280x800 — man sieht es auf dem Desktop NICHT", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("die Tabellen bleiben auf `table-layout: auto` und verteilen ungleich", async ({ page }) => {
    /*
     * `scroll.x` KANN das Desktop-Bild aendern: rc-table schaltet auf
     * `table-layout: fixed`, sobald eine Spalte `fixed` oder `ellipsis` traegt
     * oder `scroll.y` gesetzt ist (lib/Table.js:426-442) — und verteilt die
     * Spalten dann GLEICHMAESZIG. `documentElement.scrollWidth` waere hier die
     * falsche Behauptung: eine veraenderte Spaltenverteilung laesst nichts
     * ueberlaufen.
     *
     * WARUM NICHT DIE ABSOLUTEN PIXELWERTE (343/118/172/247/239 bzw.
     * 233/229/380/200/207, so gemessen am 2026-07-27): sie haengen an der
     * Scrollbalkenbreite. Auf macOS sind Scrollbalken Overlays und 0px breit,
     * auf einem Linux-CI-Runner sind sie ~15px — `innerWidth` faellt dort auf
     * ~1265 und JEDE Zahl verschiebt sich. Der Test wuerde in der CI rot,
     * obwohl nichts kaputt ist. Die Zahlen stehen als Protokoll in der Spec
     * §5.3; hier steht der MECHANISMUS, und der ist breitenunabhaengig.
     */
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });

    for (const ziel of [
      "http://feedback.localtest.me:3100/vergleich",
      "http://portal.localtest.me:3100/admin",
    ]) {
      await page.goto(ziel);
      const layout = await page.evaluate(
        () => getComputedStyle(document.querySelector(".ant-table table")!).tableLayout,
      );
      expect(layout, `${ziel}: table-layout`).toBe("auto");

      // Verhaltens-Gegenprobe: `fixed` verteilte gleichmaeszig, `auto` nicht.
      // Bei beiden Tabellen liegen ueber 50px zwischen breitester und
      // schmalster Spalte (gemessen: 343 gegen 118 bzw. 380 gegen 200).
      const breiten = await page.evaluate(() =>
        [...document.querySelectorAll(".ant-table thead th")].map((th) =>
          Math.round(th.getBoundingClientRect().width),
        ),
      );
      expect(breiten.length).toBe(5);
      expect(
        Math.max(...breiten) - Math.min(...breiten),
        `${ziel}: gleichmaeszig verteilt (${breiten.join(", ")}) — table-layout gekippt?`,
      ).toBeGreaterThan(50);
    }
  });

  test("Handlungsknoepfe sind wieder inhaltsbreit, nicht alle gleich", async ({ page }) => {
    // Die andere Haelfte von „volle Breite unter 768px". Ohne sie kann der Test
    // eine wirkungslose Medienabfrage nicht widerlegen — dort saehen richtige
    // und kaputte Fassung beide „volle Breite".
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    await page.goto("http://feedback.localtest.me:3100/groups/2");
    const breiten = await page.evaluate(() =>
      [...document.querySelectorAll(".fb-block-mobil")].map((el) =>
        Math.round(el.getBoundingClientRect().width),
      ),
    );
    expect(breiten.length).toBeGreaterThan(4);
    expect(new Set(breiten).size, `alle gleich breit: ${breiten.join(", ")}`).toBeGreaterThan(1);
  });

  test("keine Admin-Seite scrollt seitwaerts", async ({ page }) => {
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    for (const seite of SEITEN) {
      await page.goto(`http://${seite.host}:3100${seite.pfad}`);
      await page.waitForLoadState("networkidle");
      const mass = await ueberlauf(page);
      expect(mass.doc, `${seite.name}: ${mass.schuldige.join(" | ")}`).toBe(mass.vw);
    }
  });
});
```

- [ ] **Step 2: E2E laufen lassen**

```bash
rtk pnpm exec playwright test e2e/mobil-admin.spec.ts
```
Expected: PASS.

**Falls „die Spaltenbreiten sind unveraendert" fehlschlägt:** dann ist `table-layout` doch auf `fixed` gesprungen. Nicht die Sollwerte an das Ergebnis anpassen — erst prüfen, ob eine Spalte inzwischen `ellipsis` trägt (`tabellen.test.ts` hat dafür eine Gegenprobe). Ist das der Fall, ist `scroll={{ x: "max-content" }}` für diese Tabelle die falsche Wahl und braucht eine Zahl plus Spaltenbreiten.

**Falls ein 390px-Test mit einem `schuldige`-Eintrag fehlschlägt, den dieser Plan nicht kennt:** das ist ein neuer Befund. Er wird notiert und gemeldet, nicht durch Aufweichen der Erwartung erledigt.

- [ ] **Step 3: Die ganze Suite laufen lassen**

```bash
rtk pnpm exec playwright test
```
Expected: PASS. Besonders zu beobachten: `e2e/keystone.spec.ts:35` (Modul-Links auf 1280×720 ohne Öffnen sichtbar) und `e2e/shell-mobil.spec.ts` — beide berühren die in Task 5 geänderte `.modulnav`-Regel.

- [ ] **Step 4: `docs/design/README.md` fortschreiben**

Im Abschnitt „Mobil — ein Breakpoint, vier Regeln" nach dem Absatz über `antd-Table` (nach Zeile 147) einfügen:

```markdown
**`scroll={{ x: … }}` braucht den richtigen Wert, und der hängt an den Spaltenbreiten.** Tragen die
Spalten `width`, ist die Summe die Zahl. Tragen sie keine, ist `"max-content"` die einzige ehrliche
Angabe — jede Pixelzahl wäre erfunden. **Eine Bedingung dazu:** rc-table schaltet auf
`table-layout: fixed`, sobald eine Spalte `fixed` oder `ellipsis` trägt oder `scroll.y` gesetzt ist
(`lib/Table.js:426-442`); dann verteilt es die Spalten gleichmäßig und **das Desktop-Bild ändert sich**,
ohne dass irgendwo etwas überläuft. Wer `scroll` ergänzt, misst die Spaltenbreiten bei 1280px vorher
und nachher — `documentElement.scrollWidth` allein würde den Unterschied nicht sehen.

**Eine Tabelle, die auf schmalen Geräten gar nicht sichtbar ist, braucht kein `scroll`.**
`feedback/_ui/Verlauf.tsx` rendert beide Darstellungen ins HTML und blendet per CSS eine aus; die
breite Tabelle steht unter 768px auf `display: none`. Sie ist das Vorbild, nicht der Mangel — und der
Grund, warum „keine `scroll`-Prop" allein noch kein Befund ist.
```

Und im Absatz über Handlungsknöpfe (nach Zeile 150) ergänzen:

```markdown
**Ein Modul, das seine Knopfregel bei einer anderen Breite schaltet als die Suite, ist bei 390px nicht
zu unterscheiden — und dazwischen kaputt.** `feedback.css` schaltete bis 2026-07-27 bei 600px. Bei
700px war der Menü-Knopf der Shell sichtbar und der Verlauf zeigte die Schmalliste (beides „mobil"),
während „Kopieren" 88px und „PNG" 61px breit nebeneinander standen. In `max-width`-Abfragen heißt der
Suite-Breakpoint **767.98px**, nicht 768 — sonst gelten bei exakt 768px beide Seiten und die
Reihenfolge im Stylesheet entscheidet.
```

Im Abschnitt „Tests für Responsives" die Aufteilung um den dritten Viewport ergänzen (nach Zeile 160):

```markdown
- **Playwright dazwischen** besitzt, was an keinem der beiden Enden sichtbar ist. Zwei Defekte auf
  Teilprojekt C waren von dieser Art: die Knopfregel bei 600 statt 768 (unsichtbar bei 390 **und** bei
  1280) und die Kopfzeile, die zwischen 768 und 903px eine Mindestbreite von 904px hatte (unsichtbar
  bei 390, weil die Modulnavigation dort ausgeblendet ist, und bei 1280, weil dort Platz ist). **Wer
  nur die Enden misst, prüft die Mitte nicht** — und die Mitte ist jedes Tablet im Hochformat.
```

- [ ] **Step 5: Volle Prüfung und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
rtk pnpm exec playwright test
rtk git add e2e/mobil-admin.spec.ts docs/design/README.md
rtk git commit -m "test(mobil): Durchgang ueber drei Viewports, Querschnittsregeln fortgeschrieben"
```

---

## Self-Review

**Spec-Abdeckung:**

| Spec-Abschnitt | Task |
|---|---|
| §3 Widerlegte Rohbefunde (`Verlauf.tsx:294`, `qr/page.tsx:43`, `Zuordnung.tsx:286`) | keine Änderung — als Gegenprobe in `tabellen.test.ts` (Task 2) festgehalten |
| §4.1 Seitwärts scrollende Seiten — `service-table`, `VergleichTabelle` | 2 |
| §4.1 Seitwärts scrollende Seiten — `QrView`, `HistoryList`, `qr/admin` | 3 |
| §4.2 Knöpfe ohne volle Breite (5 Stellen) | 4 |
| §4.3 Trefferflächen unter 44px (5 Stellen) | 5 |
| §4.4 Abgeschnittener Text (Kartentitel, Teilnehmerfeld) | 6 |
| §5.1 Der Blocker + Falle 6 | 1 |
| §5.2 600px → 767.98px, Begründung der 992 | 4 (Umstellung), 4 Schritt 2 (Test nennt alle drei Werte) |
| §5.3 `max-content` an beiden Tabellen | 2 |
| §5.4 Kopfzeile im Band 768–903 | **kein Task** — gemessener Shell-Befund, geht als Nacharbeit an A; Begründung samt beider durchgespielter Behebungsversuche in der Spec |
| §6 Was nicht gemacht wird | nirgends umgesetzt — `size="large"` im qr-Modul, öffentliche Ansicht, Druckbogen, Kopfzeile bleiben unangetastet; `HistoryList.tsx` behält in Task 3 ausdrücklich sein `size="large"`, `service-table.tsx` behält sein `size` am `<Table>` |
| §7 Portal-Navigation | 6 |
| §8 Tests — wer welche Aussage besitzt | Quelltext-Scans in 1, 2, 4, 5; Playwright (390 / 700 / 1280) in 7; ausdrücklich **kein** Lauf bei 768 oder 900, weil dort ein ungelöster A-Befund sitzt |
| §9 Reihenfolge | Tasks 1–7 in dieser Reihenfolge |

**Typkonsistenz:** `MONATS_FENSTER: readonly [6, 12, 24]` und `fensterAus(roh: string | undefined): number` werden in Task 1 in `_lib/trendfenster.ts` definiert und in Task 1 von `Segment.tsx` bzw. `trend/page.tsx` unverändert verwendet. `navFuerPortal(darfVerwalten: boolean): SuiteNavItem[]` (Task 6) liefert denselben Typ, den `Shell`/`SuiteHeader` seit Teilprojekt A entgegennehmen (`core/shell/types.ts`); die Bauform ist wortgleich zu `qr/layout.tsx:25-28`.

**Wo die Tasks einander berühren — und warum das trägt:**
- `Verlauf.tsx` wird in Task 4 (Knopfzeile, Zeilen 149-165) und Task 5 (`size`, Zeilen 570 und 618) angefasst. Verschiedene Stellen, keine Überschneidung.
- `service-table.tsx` bekommt in Task 2 die `scroll`-Prop und verliert in Task 5 das `size` am Knopf. Task 2 lässt das `size` ausdrücklich stehen, damit beide Tasks einzeln abnehmbar bleiben.
- `portal/layout.tsx` bekommt in Task 4 den CSS-Import und in Task 6 den `nav`-Slot. Task 6 zeigt die Datei vollständig, inklusive des Imports aus Task 4 — wird Task 6 vor Task 4 ausgeführt, fehlt `portal.css` und der Import muss weg.
- `trend/page.tsx` wird in Task 1 (Importe) und Task 4 (Knopfzeile) angefasst. Verschiedene Stellen.
- `feedback.css` (Task 4) wird auch vom Druckbogen gelesen. Geändert werden nur `max-width`-Medienabfragen; im Druck greifen sie nicht.

**Bekannte Risiken beim Ausführen:**
1. **Task 4, `.fb-knopfzeile` an einem `<span>`** (`trend/page.tsx`): die Klasse setzt `display: flex`. Ein `<span>` mit `display: flex` ist gültig, aber falls die Zeile dadurch anders umbricht als heute, ist der Desktop-Lauf in Task 7 der Ort, an dem es auffällt — nicht der 390px-Lauf.
2. **Task 4, `portal.css` ohne Spezifitäts-Präfix**: dass eine blanke Klasse für `width` gegen antd reicht, ist am Nachbarmodul belegt (`feedback.css:332`, gemessen wirksam) — belegen kann es aber nur der Browser. Schritt 8 misst bei 700×900 **und** bei 1280×800; nur das Paar kann eine wirkungslose Regel widerlegen.
3. **`src/core` wird nirgends angefasst.** Wer beim Ausführen versucht ist, den Kopfzeilendefekt aus Spec §5.4 nebenbei mitzunehmen: beide naheliegenden Fassungen sind dort durchgemessen, und die billige macht die Modulnavigation 32px breit. Der Befund geht an A.
4. **Task 6, `Lagekarte.tsx`**: `styles` darf nur einmal am `<Card>` stehen. Zwei `styles`-Props sind in JSX kein Fehler, sondern stille Überschreibung — der zweite gewinnt und `KARTE` wäre weg.
5. **Task 7, die Sollwerte der Spaltenbreiten**: sie stammen aus einer Messung am 2026-07-27 mit dem damaligen Seed (zwei Gruppen, zwei Dienste). Ändert jemand den Seed, ändern sich die Zahlen. Der Test soll dann **neu gemessen**, nicht gelockert werden — er behauptet „unverändert gegenüber vorher", nicht „diese Zahlen sind richtig".
6. **Task 7, Portnummer**: die Spec-Messungen liefen auf `:3000` (`pnpm dev`), Playwright fährt auf `:3100` (`playwright.config.ts`). Die Pfade im Spec sind ohne Port notiert; im E2E steht überall `:3100`.
