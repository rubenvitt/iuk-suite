# Einsatzbuch v2 — Stufe 3: geteilte Ansichten und Reader — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Verwaltung öffnet eine `.einsatzbuch`-Exportdatei im Browser, sieht Kettenprüfung, Einsatzliste, Detail und Berichtsblatt (Druck A4) — alles nur im Client, mit Audit-Meldung ohne Inhalt; die Ansichten liegen im geteilten Kern, damit die Desktop-App sie in Stufe 6 wiederverwendet.

**Architecture:** `kern/ansichten/` enthält reine React-Client-Komponenten ohne antd mit eigenem CSS-Modul und eigenen CSS-Variablen (Hell/Dunkel über `:root[data-theme="dark"]`). Ein Leseablauf unter `_lib/reader/` prüft Hülle → Kennwort → zod-Form → Kette → jeden Block und liefert ein serialisierbares Anzeigemodell. Die Reader-Seite ist eine dünne Server-Seite mit Riegel plus Client-Insel; der Druck läuft über ein Portal an `body` mit benannter `@page`.

**Tech Stack:** React 19, Next.js 16, CSS-Module, zod 4, WebCrypto, antd 6 (nur in der Reader-Insel, nie im Kern), Vitest (jsdom über `src/app/m/qr/_lib/test-dom.tsx`), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-24-einsatzbuch-v2-design.md` (§2.1, §3.3, §6, §7, §8, §9.2, §10, §11 Stufe 3, §12 „Reader“). Vorlagen: `docs/design/einsatzbuch-v2/vorlage/Einsatzbuch Reader.dc.html`, `Einsatzbericht.dc.html`, Verwaltungsansicht in `Einsatzbuch v2.dc.html`.

**Ticket:** DRK-471 (Commit-Body). Kein ClickUp.

**Arbeitskopie:** `/Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-suite`. Stufe 3 läuft auf `claude/einsatzbuch-v2-stufe-2-3`, gestapelt auf `claude/einsatzbuch-v2-stufe-2` (Stand `ac2e6a63`, Stufe 2 fertig und reviewt). Jede Shell-Zeile beginnt mit `cd /Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-suite &&`.

## Global Constraints

- Kern-Grenze (`kern/grenze.test.ts`): Dateien unter `kern/` importieren nur Relatives innerhalb von `kern/`, `react` und `@/core/theme/tokens`. **Kein antd, kein zod, kein `next/*`, kein `@/core/*` sonst** im Kern.
- Kern-Ansichten: nur serialisierbare **Daten**-Props (reines JSON, keine `Date`, keine Klasseninstanzen). Rückruf-Props (`onWaehle`) und `ReactNode`-Slots sind erlaubt, weil die Ansichten nur aus Client-Komponenten aufgerufen werden — nie direkt aus einer Server Component. Zeitzone kommt als Prop.
- Eigene CSS-Variablen im CSS-Modul (Falle 2: `--ant-*` sieht eigenes Markup nicht). Hellwerte an der Wurzelklasse, Dunkelzweig `:root[data-theme="dark"] .wurzel`. Die Desktop-App setzt in Stufe 4/6 `data-theme` selbst.
- Berichtsblatt: A4 als **benannte** Seite `@page einsatzbericht { size: 210mm 297mm; margin: 14mm 16mm }` (Falle 18: keine Formatnamen, gemischte Größen verwirft Chromium). Fußzeile „Vertraulich — nur für den Dienstgebrauch“. Papier ist immer hell.
- Reader: nur Client, keine Server Action, kein Upload, kein Speichern. Datei per Auswahl oder Drag & Drop, `File.text()`.
- Nach dem Entschlüsseln `Exportinhalt` und jeden `Einsatz` mit zod prüfen, **bevor** etwas gerendert wird; eine selbst gebaute Datei mit gültigem Kennwort darf den Reader nicht abstürzen lassen. `kopf.versiegelt` und `anker.gemeldetAm` streng: ISO mit Offset **und** echter Kalendertag.
- Texte der Vorlage wörtlich, wo die Funktion gleich bleibt; „Beispieldatei öffnen“ entfällt (§6, §10).
- Testband „Testdaten — kein echter Einsatz“, nicht wegklickbar, sobald ein Block `umgebung: "test"` trägt; das Berichtsblatt trägt dann „TESTDATEN“ im Kopf.
- Ein Anker aus der Datei ist nur **selbst gemeldet**: Anzeige ausdrücklich „laut Datei“, nie als Bestätigung. Der Abgleich mit der Suite kommt in Stufe 5.
- Registry: `showInSwitcher: true`, `switcherGroupSources: ["access"]`; die anonyme Umschalterliste bleibt `["qr","radio"]`. Umschalter und Release-Notiz im **selben** Commit.
- Fallen: 1, 3, 4, 6, 7, 17, 18 aus `CLAUDE.md`. Commits signiert, Conventional Commits, `DRK-471`, Co-Authored-By-Zeile.
- Tore: `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/einsatzbuch.spec.ts e2e/einsatzbuch-stammdaten.spec.ts e2e/einsatzbuch-reader.spec.ts`.
- `scripts/einsatzbuch-testvektoren.ts` nie mit `--neu`; **keine neuen Vektordateien** — der Test-Vektor mit `umgebung: "test"` entsteht im Test per `versiegele`.

## Entscheidungen (wo die Spec offen ist)

1. **zod außerhalb des Kerns** (`_lib/reader/pruefung.ts`). Der Kern prüft die Form bereits (`istExportinhalt` in `entschluesseleExport`, `istEinsatz` in `oeffneBlock`); zod ergänzt, woran die Anzeige abstürzen könnte: Datums-, Uhrzeit- und Zeitpunktformate (echter Kalendertag), Hex-Längen, Längengrenzen, CEK = gültiges Base64 mit genau 32 Byte, jeder Schlüssel in `schluessel` gehört zu einem Block der Datei. Ein Block ohne CEK ist kein Formfehler der Datei, sondern „Block n lässt sich nicht öffnen“.
2. **Anker in der Datei darf auf einen Block außerhalb der Datei zeigen** (Einzelexport) — die Anzeige setzt nichts voraus.
3. **Browser-Audit:** `BrowserExport` bekommt die Variante `{ module: "einsatzbuch"; format: "reader_oeffnen" | "reader_druck"; von: number; bis: number; anzahl: number }`. Die Route schreibt `objectType = einsatzbuch_reader_oeffnen|einsatzbuch_reader_druck`, Aktion `export` (die einzige Browser-Aktion), `objectRef = "bloecke:<von>-<bis>:<anzahl>"`. **Abweichung:** `storage.ts` speichert `objectRef` nur als SHA-256 — der Bereich ist suchbar, nicht lesbar; `storage.ts` bleibt unverändert.
4. **Gruppenprüfung in der Browser-Route:** `canAccess` ist für `requiresAuth: false`-Module für jeden wahr. Die Route verlangt deshalb zusätzlich `hasAnyGroup(groups, requiredGroupsFor(mod))`, sobald `requiredGroupsFor(mod)` nicht leer ist (für `qr` leer → unverändert).
5. **Druck:** „PDF erzeugen“ öffnet ein Overlay (Portal an `document.body`) mit Steuerleiste und Berichtsblatt; „Als PDF speichern“ ruft `window.print()` und meldet danach `reader_druck`. Die Druckregeln hängen am Overlay: `body > :not(.druckOverlay) { display: none }`, Steuerleiste aus, Blatt ohne Schatten.
6. **Reader in der Suite-Hülle** (`(verwaltung)`-Gruppe, `FullShell`, Navigationseintrag „Reader“) statt der eigenen Kopfleiste der Vorlage; der Hinweis „Läuft nur in deinem Browser · kein Server“ steht im Seitenkopf.
7. **Zeitzone** im Reader aus `zeitzone()` (`core/zeit`, liest `<html data-zeitzone>`), als Prop an die Kern-Ansichten.
8. **Kopfzeile des Berichtsblatts** („DRK-Bereitschaft Uelzen“ in der Vorlage) = Einstellung `bereitschaft` aus Stufe 2, von der Server-Seite als Prop übergeben.

## Review Focus

1. **Selbst gebaute Datei mit gültigem Kennwort** (unmögliches Datum wie `2026-02-31`, `versiegelt` ohne Offset, CEK mit 31 Byte, fehlender CEK, 10 000 Zeichen Notizen, Block-Nummer als Bruch) → Meldung statt weißer Seite. Gepinnt in `oeffnen.test.ts` (Task 2) und durch die Error Boundary (Task 4).
2. **Datei aus der Vorlage (`version: 1`), beliebiges JSON, leere Datei, PNG** → „… ist keine Einsatzbuch-Datei …“ vor der Kennwortfrage. Gepinnt in `oeffnen.test.ts` (Task 2).
3. **Einzelexport mitten aus der Kette** (Block 2 allein, Vorgänger fehlt) → „Ausschnitt intakt“, Fuß „Vorgänger #… · nicht in der Datei“, kein Fehler. Gepinnt in `oeffnen.test.ts` und `Kettenliste.test.tsx` (Tasks 1, 2).
4. **Drucken im Dunkelmodus und mit geöffneter Seitenleiste** → Blatt hell, ohne Suite-Kopf, genau eine A4-Seite. Gepinnt in `e2e/einsatzbuch-reader.spec.ts` (Task 6).
5. **Anonymer oder Suite-Admin ohne Gruppe schickt ein Einsatzbuch-Browser-Ereignis** → 403 mit Audit-Verweigerung, nichts gespeichert. Gepinnt in `route.test.ts` (Task 3).

---

## Dateistruktur

```
src/app/m/einsatzbuch/_lib/kern/ansichten/
├── ansichten.module.css        Variablen (hell/dunkel), Liste, Detail, Prüfung, Band
├── bericht.module.css          Berichtsblatt + @page einsatzbericht
├── modell.ts                   Anzeigetypen (Kettenzustand, Listeneintrag, Detailmodell) + Hilfen
├── Kettenpruefung.tsx
├── Kettenliste.tsx
├── Einsatzdetail.tsx
├── Berichtsblatt.tsx
├── Testband.tsx
└── *.test.tsx                  (jsdom, Harness test-dom)
src/app/m/einsatzbuch/_lib/reader/
├── pruefung.ts                 zod-Schemas (Exportkopf, Exportinhalt, Einsatz) + Typassertion
├── oeffnen.ts                  leseDatei, oeffneExport → Anzeigemodell
└── oeffnen.test.ts
src/app/m/einsatzbuch/_ui/reader/
├── Reader.tsx                  Client-Insel: leer → kennwort → offen
├── DruckOverlay.tsx            Portal, Steuerleiste, Berichtsblatt
├── Fehlergrenze.tsx            Error Boundary
└── reader.module.css
src/app/m/einsatzbuch/(verwaltung)/reader/page.tsx
src/app/m/portal/_lib/neuigkeiten/notizen/einsatzbuch/2026-09-24-einsatzdateien-im-reader.ts
e2e/einsatzbuch-reader.spec.ts
```

Geändert: `src/core/audit/browser-schema.ts`, `src/app/api/audit/browser/route.ts` (+ Test), `src/app/m/portal/admin/audit/labels.ts`, `src/core/audit/browser.test.ts`, `src/core/registry.ts`, `M/registry.test.ts`, `M/_lib/nav.ts` (+ Test), `src/core/shell/types.ts`, `src/core/shell/navIkonen.tsx`, `M/(verwaltung)/page.tsx` (Link zum Reader), `src/app/m/portal/_lib/neuigkeiten/register.ts`, `e2e/gruppen.json`.

`M` = `src/app/m/einsatzbuch`, `K` = `M/_lib/kern`.

---

### Task 1: Geteilte Ansichten im Kern

**Files:**
- Create: `K/ansichten/modell.ts`, `K/ansichten/ansichten.module.css`, `K/ansichten/bericht.module.css`, `K/ansichten/Kettenpruefung.tsx`, `K/ansichten/Kettenliste.tsx`, `K/ansichten/Einsatzdetail.tsx`, `K/ansichten/Berichtsblatt.tsx`, `K/ansichten/Testband.tsx`
- Test: `K/ansichten/modell.test.ts`, `K/ansichten/Kettenpruefung.test.tsx`, `K/ansichten/Kettenliste.test.tsx`, `K/ansichten/Einsatzdetail.test.tsx`, `K/ansichten/Berichtsblatt.test.tsx`

**Interfaces:**
- Consumes: `Block`, `Einsatz`, `Kettenergebnis` (Kern), `bericht()`/`Berichtsdaten`, `datumText`, `zeitpunktText`, `dauerMinuten`, `dauerText`.
- Produces (`modell.ts`, reine Funktionen und Typen):
  ```ts
  export type Kettenzustand =
    | { art: "ungeprueft" }
    | { art: "laeuft"; i: number; n: number }
    | { art: "intakt"; vollstaendig: true; zeit?: string }
    | { art: "intakt"; vollstaendig: false; abBlock: number; prev: string }
    | { art: "gebrochen"; block: number; grund: string };
  export function kettenzustandAus(e: Kettenergebnis, bloecke: readonly Block[]): Kettenzustand;
  export function chipText(z: Kettenzustand): string;   // „Kette intakt“ | „Ausschnitt intakt“ | „Gebrochen bei Block n“ | „Noch nicht geprüft“ | „Prüfe Block i von n …“
  export function pruefSatz(z: Kettenzustand): string;  // Sätze der Vorlage (siehe unten)
  export interface Listeneintrag {
    block: number; nummer: string | null; stichwort: string | null; ort: string | null;
    versiegelt: string;      // bereits formatiert („22.8.2026, 04:43 Uhr“)
    hash: string; prev: string;
    knoten: "geprueft" | "gebrochen" | "neutral";
    meta?: string;           // v2-Verwaltung: „2 Fahrzeuge · 3 Kräfte · 4 Patienten“
    gesperrt?: boolean;      // v2-Verwaltung: Chiffretext statt Inhalt
    fehler?: string;         // „Block n lässt sich nicht öffnen“
  }
  export function knotenFuer(block: number, z: Kettenzustand): Listeneintrag["knoten"]; // ≤ Bruchstelle-1 geprüft, = Bruch gebrochen, danach neutral
  export const kurz = (hash: string) => hash.slice(0, 8);
  ```
- Produces (Komponenten, alle `"use client"`):
  - `Kettenpruefung({ zustand, mitSatz?: boolean, anker?: { block: number; hash: string; gemeldetAm: string } | null })` — Chip (ton ok/rot/grau) plus optional Satz; Anker als Zeile „Anker laut Datei: Block n, gemeldet am … (#hash8) — nicht von der Suite bestätigt“.
  - `Kettenliste({ eintraege: Listeneintrag[] /* neueste zuerst */, gewaehlt: number | null, onWaehle(block: number): void, kopfRechts?: string, fuss: { text: string } })`.
  - `Einsatzdetail({ block: { nummer: number; hash: string; prev: string; versiegelt: string }, einsatz: Einsatz, zeitzone: string, dritteKennzahl: "gesamt" | "dauer", mitDauerzeile: boolean, objektImmer: boolean, kopfRechts?: ReactNode, aktionen?: ReactNode })`.
  - `Berichtsblatt({ daten: Berichtsdaten, bereitschaft: string })`.
  - `Testband({ text: string })` — `role="status"`, gestreift, nicht schließbar.

Sätze und Texte (wörtlich aus `Einsatzbuch Reader.dc.html`):
- intakt, vollständig: Chip „Kette intakt“, Satz „Alle Blöcke passen zu ihrem Fingerabdruck und bauen lückenlos auf dem Anfang der Kette auf.“
- intakt, Ausschnitt: Chip „Ausschnitt intakt“, Satz `Ausschnitt ab Block ${abBlock}: Die enthaltenen Blöcke passen zusammen. Der Vorgänger #${kurz(prev)} ist nicht in der Datei.`
- gebrochen: Chip `Gebrochen bei Block ${block}`, Satz `Block ${block}: ${grund}. Die Datei wurde nach dem Export verändert oder ist beschädigt.`
- ungeprüft: „Noch nicht geprüft“; läuft: `Prüfe Block ${i} von ${n} …`; intakt mit Zeit (Verwaltung v2): `Kette intakt · geprüft ${zeit} Uhr`.
- Liste: Kicker „Einsatzkette“, rechts `kopfRechts` (Reader: „neueste oben“); Zeile: `Block ${n}` (Kicker), Nummer (mono), rechts `versiegelt ${versiegelt}`; Stichwort (Display 20 px) + Ort; `#${kurz(hash)} ⛓ #${kurz(prev)}` (mono). Gewählte Zeile `aria-pressed="true"`/`aria-current`, Knopf mit `aria-label="Block n, <nummer>, <stichwort>"`.
- Detail (Reihenfolge der Vorlage): `Block ${n} · ${nummer}` (Kicker) + `kopfRechts`; H2 Stichwort; Ort (`strasse, ort` oder „—“); Objekt (bei `objektImmer` mit „—“); Kennzahlen „Vor Ort“ | „Transport“ | „Gesamt“ bzw. „Dauer“; Raster „Beginn“, „Ende“ (ohne Ende „nicht angegeben“), bei `mitDauerzeile` „Dauer“ (`X h MM min`, bei negativer oder fehlender Dauer „—“); `Fahrzeuge · n` (Typ + Funkrufname); `Personal · n` (Name + Quali); „Notizen“ nur wenn vorhanden (`white-space: pre-wrap`); Hash-Box „Fingerabdruck“, „Vorgänger“, „Versiegelt“.
- Berichtsblatt (Aufbau `Einsatzbericht.dc.html`): Kopf mit rotem Balken, „EINSATZ**BUCH**“, `bereitschaft`, rechts Kicker „Einsatzbericht“ und Nummer; bei `daten.test` zusätzlich deutlich „TESTDATEN“ im Kopf; H1 Stichwort, Ort; Raster „Beginn“, „Ende“, „Dauer“, „Objekt, Lage vor Ort“; Kasten „Vor Ort behandelt“ | „Mit Transport“ | „Patienten gesamt“; `Fahrzeuge · n` (Tabelle „Typ“, „Funkrufname“, „Besatzung“, leer „Keine Fahrzeuge angegeben.“); `Eingesetztes Personal · n` (Name, Quali, Fahrzeug; leer „Kein Personal angegeben.“); „Notizen“; Siegelkasten „Unverändert seit der Versiegelung“ mit „Block“ (`${block} · versiegelt ${versiegelt}`), „Fingerabdruck“, „Vorgänger“, „Kettenprüfung“; Fuß `Erzeugt ${erzeugt} · ${quelle}` und „Vertraulich — nur für den Dienstgebrauch“. Farben fest (Papier): `#c8000f`, `#5b6570`, `#d9dde1`, `#1a1d20`; Schriften `var(--font-display, "Barlow Condensed", "Arial Narrow", sans-serif)`, `var(--font-body, "Geist", system-ui, sans-serif)`, `var(--font-mono, "Geist Mono", ui-monospace, monospace)`.

`bericht.module.css` (Kern):

```css
.blatt {
  page: einsatzbericht;
  box-sizing: border-box; width: 210mm; min-height: 297mm; padding: 14mm 16mm;
  background: #fff; color: #1a1d20; font: 12pt/1.45 var(--font-body, "Geist", system-ui, sans-serif);
  display: flex; flex-direction: column; gap: 7mm;
}
@page einsatzbericht { size: 210mm 297mm; margin: 14mm 16mm; }
@media print {
  .blatt { width: auto; min-height: 0; padding: 0; box-shadow: none; }
}
```

`ansichten.module.css` beginnt mit der Variablenwurzel (Werte aus der Vorlage, `_ds/…/tokens/colors.css`):

```css
.wurzel {
  --eb-text: rgba(0, 0, 0, .88); --eb-text-2: rgba(0, 0, 0, .65); --eb-rand: #d9d9d9; --eb-rand-2: #f0f0f0;
  --eb-karte: #fff; --eb-flaeche: #eef0f1; --eb-marke: #c8000f; --eb-gedaempft: #5b6570;
  --eb-aktiv: rgb(0 0 0 / .06); --eb-ok-text: #1e7a3c; --eb-ok-flaeche: #e4f2e9; --eb-rot-text: #8c0d16; --eb-rot-flaeche: #f6e3e0;
  color: var(--eb-text); font-family: var(--font-body, "Geist", system-ui, sans-serif);
}
:root[data-theme="dark"] .wurzel {
  --eb-text: rgba(255, 255, 255, .85); --eb-text-2: rgba(255, 255, 255, .65); --eb-rand: #424242; --eb-rand-2: #303030;
  --eb-karte: #141414; --eb-flaeche: #000; --eb-marke: #e45a66; --eb-gedaempft: #9aa4ad;
  --eb-aktiv: rgb(255 255 255 / .1); --eb-ok-text: #7ee0a0; --eb-ok-flaeche: #10261a; --eb-rot-text: #e8837c; --eb-rot-flaeche: #2a1113;
}
.testband {
  background: repeating-linear-gradient(-45deg, #f6d04d 0 12px, #1a1d20 12px 24px);
  color: #1a1d20; padding: 8px 16px; font-weight: 700;
}
.testband > span { background: #f6d04d; padding: 2px 8px; }
```

Jede Kern-Komponente setzt `className={s.wurzel}` an ihr äußerstes Element (außer `Berichtsblatt`, das Papier bleibt hell). Rot erscheint nur als Chip-/Knotentext auf `--eb-rot-flaeche`, nie als Fläche einer Datenzeile (Falle 3).

- [ ] **Step 1: Tests** — `modell.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import erwartetJson from "../testvektoren/erwartet.json";
import type { Block } from "../format";
import { chipText, kettenzustandAus, knotenFuer, pruefSatz } from "./modell";

const bloecke = (erwartetJson as unknown as { bloecke: Block[] }).bloecke;

describe("Kettenzustand", () => {
  it("vollständig", () => {
    const z = kettenzustandAus({ ok: true, vollstaendig: true }, bloecke);
    expect(chipText(z)).toBe("Kette intakt");
    expect(pruefSatz(z)).toBe("Alle Blöcke passen zu ihrem Fingerabdruck und bauen lückenlos auf dem Anfang der Kette auf.");
  });
  it("Ausschnitt ab Block 2 nennt den fehlenden Vorgänger", () => {
    const z = kettenzustandAus({ ok: true, vollstaendig: false }, bloecke.slice(1));
    expect(chipText(z)).toBe("Ausschnitt intakt");
    expect(pruefSatz(z)).toBe(`Ausschnitt ab Block 2: Die enthaltenen Blöcke passen zusammen. Der Vorgänger #${bloecke[0].hash.slice(0, 8)} ist nicht in der Datei.`);
  });
  it("gebrochen: Chip, Satz und Knoten", () => {
    const z = kettenzustandAus({ ok: false, block: 2, grund: "Inhalt passt nicht zum Fingerabdruck" }, bloecke);
    expect(chipText(z)).toBe("Gebrochen bei Block 2");
    expect(pruefSatz(z)).toBe("Block 2: Inhalt passt nicht zum Fingerabdruck. Die Datei wurde nach dem Export verändert oder ist beschädigt.");
    expect([1, 2, 3].map((b) => knotenFuer(b, z))).toEqual(["geprueft", "gebrochen", "neutral"]);
  });
});
```

DOM-Tests (Kopf `// @vitest-environment jsdom`, Harness `mount`/`query`/`click` aus `@/app/m/qr/_lib/test-dom`):
- `Kettenpruefung.test.tsx`: zeigt Chip und Satz; mit `anker` erscheint „laut Datei“ und „nicht von der Suite bestätigt“; ohne `mitSatz` kein Satz.
- `Kettenliste.test.tsx`: rendert Einträge in gegebener Reihenfolge, `onWaehle` bekommt die Blocknummer, gewählte Zeile trägt `aria-pressed="true"`, gebrochener Knoten hat `data-knoten="gebrochen"`, Fuß-Text steht da; Eintrag mit `fehler` zeigt den Fehlertext statt Stichwort.
- `Einsatzdetail.test.tsx` mit `TESTEINSAETZE[1]` (offenes Ende): „nicht angegeben“ bei Ende, Dauer „—“; mit `TESTEINSAETZE[2]` erscheinen Notizen mit Zeilenumbruch, `Fahrzeuge · 2`, `Personal · 2`, dritte Kennzahl „Gesamt“ = 10 bzw. bei `dritteKennzahl="dauer"` „Dauer“.
- `Berichtsblatt.test.tsx`: mit `bericht(block, einsatz, …)` aus einem `test`-Block steht „TESTDATEN“ im Kopf, sonst nicht; „Vertraulich — nur für den Dienstgebrauch“ und `bereitschaft` stehen immer da; leere Listen zeigen „Keine Fahrzeuge angegeben.“ / „Kein Personal angegeben.“.
- Nach dem Anlegen `pnpm vitest run src/app/m/einsatzbuch/_lib/kern/grenze.test.ts` — die neuen `.tsx`-Dateien stehen in der Liste und bestehen (nur `react`, relative Importe; CSS-Module sind relativ).

- [ ] **Step 2: Tests scheitern.**
- [ ] **Step 3: Implementierung** nach den Interfaces oben. `modell.ts`:

```ts
import type { Block } from "../format";
import type { Kettenergebnis } from "../kette";

export type Kettenzustand =
  | { art: "ungeprueft" }
  | { art: "laeuft"; i: number; n: number }
  | { art: "intakt"; vollstaendig: true; zeit?: string }
  | { art: "intakt"; vollstaendig: false; abBlock: number; prev: string }
  | { art: "gebrochen"; block: number; grund: string };

export const kurz = (hash: string) => hash.slice(0, 8);

export function kettenzustandAus(e: Kettenergebnis, bloecke: readonly Block[]): Kettenzustand {
  if (!e.ok) return { art: "gebrochen", block: e.block, grund: e.grund };
  if (e.vollstaendig || bloecke.length === 0) return { art: "intakt", vollstaendig: true };
  return { art: "intakt", vollstaendig: false, abBlock: bloecke[0].kopf.block, prev: bloecke[0].kopf.prev };
}

export function chipText(z: Kettenzustand): string {
  switch (z.art) {
    case "ungeprueft": return "Noch nicht geprüft";
    case "laeuft": return `Prüfe Block ${z.i} von ${z.n} …`;
    case "gebrochen": return `Gebrochen bei Block ${z.block}`;
    case "intakt": return z.vollstaendig ? (z.zeit ? `Kette intakt · geprüft ${z.zeit} Uhr` : "Kette intakt") : "Ausschnitt intakt";
  }
}

export function pruefSatz(z: Kettenzustand): string {
  if (z.art === "gebrochen") return `Block ${z.block}: ${z.grund}. Die Datei wurde nach dem Export verändert oder ist beschädigt.`;
  if (z.art === "intakt" && z.vollstaendig) return "Alle Blöcke passen zu ihrem Fingerabdruck und bauen lückenlos auf dem Anfang der Kette auf.";
  if (z.art === "intakt") return `Ausschnitt ab Block ${z.abBlock}: Die enthaltenen Blöcke passen zusammen. Der Vorgänger #${kurz(z.prev)} ist nicht in der Datei.`;
  return "";
}

export function knotenFuer(block: number, z: Kettenzustand): "geprueft" | "gebrochen" | "neutral" {
  if (z.art === "gebrochen") return block < z.block ? "geprueft" : block === z.block ? "gebrochen" : "neutral";
  return z.art === "intakt" ? "geprueft" : "neutral";
}
```

Hinweis zu `Kettenergebnis`: in `K/kette.ts` ist der Typ exportiert — wenn nicht, dort nur **additiv** `export` ergänzen (kein Formatvertrag betroffen).

Die Komponenten schreibt der Implementierer nach den Texten oben; Markup semantisch (`<section aria-label="Einsatzkette">`, `<ol>` für die Liste, `<button type="button">` je Zeile, `<dl>` für Beginn/Ende/Dauer und die Hash-Box, `<table>` im Berichtsblatt).

- [ ] **Step 4: Tests grün** (`pnpm vitest run src/app/m/einsatzbuch/_lib/kern`).
- [ ] **Step 5: Commit** — `feat(einsatzbuch): geteilte Ansichten Kettenliste, Einsatzdetail, Berichtsblatt und Kettenprüfung`

---

### Task 2: Leseablauf mit zod-Prüfung

**Files:**
- Create: `M/_lib/reader/pruefung.ts`, `M/_lib/reader/oeffnen.ts`
- Test: `M/_lib/reader/oeffnen.test.ts`

**Interfaces:**
- Consumes: Kern `istExportdatei`, `entschluesseleExport`, `KennwortFalsch`, `pruefeKette`, `oeffneBlock`, `ausBase64`, `bericht`; Ansichtsmodell aus Task 1.
- Produces:
  ```ts
  // pruefung.ts
  export const exportkopfSchema, exportinhaltSchema, einsatzSchema;   // zod
  export function istEchterZeitpunkt(s: string): boolean;             // ISO + Offset + echter Kalendertag + gültige Uhrzeit
  // oeffnen.ts
  export const KEINE_DATEI = (name: string) => `„${name}“ ist keine Einsatzbuch-Datei. Erwartet wird eine .einsatzbuch-Datei aus der Verwaltung.`;
  export const KENNWORT_FALSCH = "Das Kennwort passt nicht. Die Datei bleibt verschlüsselt.";
  export const INHALT_BESCHAEDIGT = "Der Inhalt der Datei ist beschädigt oder hat nicht die erwartete Form.";
  export type Gelesen = { ok: true; datei: Exportdatei; kopfText: string } | { ok: false; fehler: string };
  export function leseDatei(name: string, text: string, zeitzone: string): Gelesen;
  export interface Eintrag { block: Block; einsatz: Einsatz | null; fehler: string | null }
  export interface Geoeffnet {
    eintraege: Eintrag[];            // Reihenfolge der Datei (aufsteigend)
    kette: Kettenzustand;
    test: boolean;                   // irgendein Block mit umgebung "test"
    exportiertVon: string; quelle: string;
    anker: { block: number; hash: string; gemeldetAm: string } | null;
    von: number; bis: number; anzahl: number;   // tatsächlich enthaltene Blöcke (für das Audit)
  }
  export type Oeffnung = { ok: true; wert: Geoeffnet } | { ok: false; fehler: string; kennwort: boolean };
  export async function oeffneExport(datei: Exportdatei, kennwort: string): Promise<Oeffnung>;
  ```
  `kopfText` nach der Vorlage: `Exportiert ${zeitpunktText(kopf.erstellt, zone)} · ${kopf.quelle} · Block ${von}` bzw. `Block ${von}–${bis}` · `${anzahl} Einsatz|Einsätze`.

- [ ] **Step 1: Tests** — alle Dateien mit gültigem Kennwort werden im Test mit dem Kern gebaut:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { verschluesseleExport, entschluesseleExport } from "../kern/export";
import { versiegele } from "../kern/block";
import { erzeugeSchluesselpaar, schluesselIdVon } from "../kern/umschlag";
import { zuBase64, zufall } from "../kern/bytes";
import { beispielEinsatz, kopf } from "../kern/testhilfe";
import type { Exportdatei, Exportinhalt } from "../kern/format";
import { INHALT_BESCHAEDIGT, KENNWORT_FALSCH, leseDatei, oeffneExport } from "./oeffnen";

const erwartet = JSON.parse(readFileSync(path.join(__dirname, "../kern/testvektoren/erwartet.json"), "utf8")) as { export: Exportdatei };
const KW = "testvektor-kennwort";
const ZONE = "Europe/Berlin";
const KOPF = { erstellt: "2026-09-24T10:00:00+02:00", umfang: "einzeln" as const, von: 1, bis: 1, anzahl: 1, quelle: "Test" };

/** Ein Block mit bekanntem CEK; `umgebung` wählbar; `aendere` verbiegt den Einsatz VOR dem Versiegeln (gültige Krypto, kaputte Form). */
async function datei(o: { umgebung?: "echt" | "test"; einsatz?: Record<string, unknown>; inhalt?: (i: Exportinhalt) => unknown; versiegelt?: string } = {}) {
  const paar = await erzeugeSchluesselpaar();
  const id = await schluesselIdVon(paar.publicKey);
  const cek = zufall(32);
  const k = { ...kopf(1, "0".repeat(64), id, o.umgebung ?? "echt"), ...(o.versiegelt ? { versiegelt: o.versiegelt } : {}) };
  const b = await versiegele({ ...beispielEinsatz(), ...(o.einsatz ?? {}) } as never, k, paar.publicKey,
    { cek, iv: zufall(12), umschlag: { ephemer: await erzeugeSchluesselpaar(), iv: zufall(12) } });
  const inhalt: Exportinhalt = { bloecke: [b], schluessel: { "1": zuBase64(cek) }, exportiertVon: "Test", quelle: "Test", anker: null };
  return verschluesseleExport((o.inhalt ? o.inhalt(inhalt) : inhalt) as Exportinhalt, KW, KOPF);
}

describe("leseDatei", () => {
  it("nimmt die Vektordatei an und beschreibt den Kopf", () => {
    const g = leseDatei("probe.einsatzbuch", JSON.stringify(erwartet.export), ZONE);
    expect(g.ok && g.kopfText).toBe("Exportiert 24.9.2026, 10:00 Uhr · DRK-Bereitschaft Uelzen · Block 1–3 · 3 Einsätze");
  });
  it.each([["kaputt", "{"], ["fremd", '{"a":1}'], ["leer", ""], ["Vorlage v1", JSON.stringify({ ...erwartet.export, version: 1 })],
    ["Zeitpunkt ohne Offset im Kopf", JSON.stringify({ ...erwartet.export, kopf: { ...erwartet.export.kopf, erstellt: "2026-09-24T10:00" } })]])(
    "%s → keine Einsatzbuch-Datei", (_n, text) => {
      expect(leseDatei("x.einsatzbuch", text, ZONE)).toEqual({ ok: false, fehler: "„x.einsatzbuch“ ist keine Einsatzbuch-Datei. Erwartet wird eine .einsatzbuch-Datei aus der Verwaltung." });
    });
});

describe("oeffneExport", () => {
  it("Vektordatei: drei Einsätze, Kette intakt, Anker laut Datei", async () => {
    const r = await oeffneExport(erwartet.export, KW);
    expect(r.ok && r.wert.eintraege.map((e) => e.einsatz?.nummer)).toEqual(["2026-041", "2026-042", "2026-043"]);
    expect(r.ok && r.wert.kette).toEqual({ art: "intakt", vollstaendig: true });
    expect(r.ok && r.wert.anker?.block).toBe(3);
    expect(r.ok && [r.wert.von, r.wert.bis, r.wert.anzahl, r.wert.test]).toEqual([1, 3, 3, false]);
  });
  it("falsches Kennwort", async () => {
    expect(await oeffneExport(erwartet.export, "falsch-falsch")).toEqual({ ok: false, fehler: KENNWORT_FALSCH, kennwort: true });
  });
  it("manipulierter Block → Gebrochen bei Block 2 und Block 2 lässt sich nicht öffnen", async () => {
    const inhalt = await entschluesseleExport(erwartet.export, KW);
    inhalt.bloecke[1] = { ...inhalt.bloecke[1], kopf: { ...inhalt.bloecke[1].kopf, versiegelt: "2026-08-29T19:34:00+02:00" } };
    const r = await oeffneExport(await verschluesseleExport(inhalt, KW, erwartet.export.kopf), KW);
    expect(r.ok && r.wert.kette).toMatchObject({ art: "gebrochen", block: 2 });
    expect(r.ok && r.wert.eintraege[1].fehler).toBe("Block 2 lässt sich nicht öffnen");
    expect(r.ok && r.wert.eintraege[0].einsatz).not.toBeNull();
  });
  it("Einzelexport aus der Mitte → Ausschnitt intakt", async () => {
    const inhalt = await entschluesseleExport(erwartet.export, KW);
    const einzeln = { ...inhalt, bloecke: [inhalt.bloecke[1]], schluessel: { "2": inhalt.schluessel["2"] }, anker: inhalt.anker };
    const r = await oeffneExport(await verschluesseleExport(einzeln, KW, { ...erwartet.export.kopf, umfang: "einzeln", von: 2, bis: 2, anzahl: 1 }), KW);
    expect(r.ok && r.wert.kette).toMatchObject({ art: "intakt", vollstaendig: false, abBlock: 2 });
  });
  it("umgebung test wird erkannt", async () => {
    const r = await oeffneExport(await datei({ umgebung: "test" }), KW);
    expect(r.ok && r.wert.test).toBe(true);
  });
  it.each([
    ["unmögliches Datum im Einsatz", { einsatz: { beginnDatum: "2026-02-31" } }],
    ["Uhrzeit 24:00", { einsatz: { endeZeit: "24:00" } }],
    ["riesige Notizen", { einsatz: { notizen: "x".repeat(20_001) } }],
  ])("%s → Block lässt sich nicht öffnen, kein Wurf", async (_n, o) => {
    const r = await oeffneExport(await datei(o), KW);
    expect(r.ok && r.wert.eintraege[0]).toMatchObject({ einsatz: null, fehler: "Block 1 lässt sich nicht öffnen" });
  });
  it.each([
    ["versiegelt am 31. Februar", { versiegelt: "2026-02-31T10:00:00+01:00" }],
    ["versiegelt ohne Offset", { versiegelt: "2026-09-23T21:08:00" }],
    ["CEK mit 31 Byte", { inhalt: (i: Exportinhalt) => ({ ...i, schluessel: { "1": zuBase64(zufall(31)) } }) }],
    ["Schlüssel für einen Block, den es nicht gibt", { inhalt: (i: Exportinhalt) => ({ ...i, schluessel: { ...i.schluessel, "7": zuBase64(zufall(32)) } }) }],
    ["Anker am 30. Februar", { inhalt: (i: Exportinhalt) => ({ ...i, anker: { block: 1, hash: i.bloecke[0].hash, gemeldetAm: "2026-02-30T10:00:00Z" } }) }],
  ])("%s → Inhalt beschädigt, kein Wurf", async (_n, o) => {
    expect(await oeffneExport(await datei(o as never), KW)).toEqual({ ok: false, fehler: INHALT_BESCHAEDIGT, kennwort: false });
  });
  it("fehlender CEK betrifft nur den Block", async () => {
    const r = await oeffneExport(await datei({ inhalt: (i) => ({ ...i, schluessel: {} }) }), KW);
    expect(r.ok && r.wert.eintraege[0].fehler).toBe("Block 1 lässt sich nicht öffnen");
  });
});
```

(Hinweis: `versiegele` versiegelt auch einen Kopf mit unmöglichem `versiegelt`, weil `kanonisch` Zeichenketten nicht prüft — genau so baut ein Angreifer die Datei. Wirft `versiegele` doch, baut der Test den Block von Hand mit `blockHash`.)

- [ ] **Step 2: Tests scheitern.**

- [ ] **Step 3: `pruefung.ts`**

```ts
import { z } from "zod";
import { ausBase64 } from "../kern/bytes";
import type { Einsatz, Exportinhalt } from "../kern/format";

const ZEITPUNKT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/;
function echterTag(j: number, m: number, t: number) { const d = new Date(Date.UTC(j, m - 1, t)); return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t; }

export function istEchterZeitpunkt(s: string): boolean {
  const m = ZEITPUNKT.exec(s);
  if (!m) return false;
  const [, j, mo, t, h, mi, se, , oh, om] = m;
  if (!echterTag(+j, +mo, +t) || +h > 23 || +mi > 59 || (se !== undefined && +se > 59)) return false;
  return oh === undefined || (+oh <= 14 && +om <= 59);
}
const zeitpunkt = z.string().refine(istEchterZeitpunkt, "kein Zeitpunkt mit Offset");
const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => { const [j, m, t] = s.split("-").map(Number); return echterTag(j, m, t); });
const uhrzeit = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const hex = (n: number) => z.string().regex(new RegExp(`^[0-9a-f]{${n}}$`));
const kurzText = (max: number) => z.string().max(max);
const zahl = z.number().int().min(0).max(999);

export const einsatzSchema = z.object({
  v: z.literal(1), nummer: kurzText(40), stichwort: kurzText(80),
  beginnDatum: datum, beginnZeit: uhrzeit,
  endeDatum: datum.nullable(), endeZeit: uhrzeit.nullable(),
  strasse: kurzText(200), ort: kurzText(200), objekt: kurzText(500),
  fahrzeuge: z.array(z.object({ id: kurzText(80), typ: kurzText(40), kennung: kurzText(40), ruf: kurzText(120), standort: kurzText(80) }).strict()).max(200),
  personal: z.array(z.object({ id: kurzText(80), name: kurzText(120), quali: kurzText(40), ov: kurzText(80), fahrzeugId: kurzText(80).nullable() }).strict()).max(1000),
  vorOrt: zahl, transport: zahl, notizen: kurzText(20_000),
}).strict().refine((e) => (e.endeDatum === null) === (e.endeZeit === null), "Ende nur vollständig");

const cek = z.string().refine((s) => { try { return ausBase64(s).length === 32; } catch { return false; } });
const block = z.object({
  kopf: z.object({ v: z.literal(1), block: z.number().int().min(1), prev: hex(64), versiegelt: zeitpunkt, schluesselId: hex(16), umgebung: z.enum(["echt", "test"]) }).strict(),
  iv: z.string(), daten: z.string(), hash: hex(64),
  umschlag: z.object({ epk: z.string(), iv: z.string(), ct: z.string() }).strict(),
}).strict();

export const exportinhaltSchema = z.object({
  bloecke: z.array(block).min(1).max(10_000),
  schluessel: z.record(z.string().regex(/^[1-9]\d*$/), cek),
  exportiertVon: kurzText(200), quelle: kurzText(200),
  anker: z.object({ block: z.number().int().min(1), hash: hex(64), gemeldetAm: zeitpunkt }).strict().nullable(),
}).strict().refine((i) => Object.keys(i.schluessel).every((k) => i.bloecke.some((b) => String(b.kopf.block) === k)), "Schlüssel ohne Block");

export const exportkopfSchema = z.object({
  erstellt: zeitpunkt, umfang: z.enum(["alle", "einzeln"]), von: z.number().int().min(1), bis: z.number().int().min(1),
  anzahl: z.number().int().min(1), quelle: kurzText(200),
}).strict().refine((k) => k.von <= k.bis);

// Typassertion: zod-Ergebnis und Kern-Typen dürfen nicht auseinanderlaufen.
type Gleich<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _einsatzPasst: Gleich<z.infer<typeof einsatzSchema>, Einsatz> = true;
const _inhaltPasst: Gleich<z.infer<typeof exportinhaltSchema>["anker"], Exportinhalt["anker"]> = true;
void _einsatzPasst; void _inhaltPasst;
```

(Passt `Gleich` wegen `readonly`/`v: 1` nicht exakt, genügt die Richtung `z.infer<…>` → Kern-Typ; das Ziel ist, dass ein neues Formatfeld hier auffällt.)

- [ ] **Step 4: `oeffnen.ts`**

```ts
import { oeffneBlock } from "../kern/block";
import { ausBase64 } from "../kern/bytes";
import { entschluesseleExport, istExportdatei, KennwortFalsch } from "../kern/export";
import type { Block, Einsatz, Exportdatei } from "../kern/format";
import { pruefeKette } from "../kern/kette";
import { zeitpunktText } from "../kern/zeit";
import { kettenzustandAus, type Kettenzustand } from "../kern/ansichten/modell";
import { einsatzSchema, exportinhaltSchema, exportkopfSchema } from "./pruefung";

export const KEINE_DATEI = (name: string) => `„${name}“ ist keine Einsatzbuch-Datei. Erwartet wird eine .einsatzbuch-Datei aus der Verwaltung.`;
export const KENNWORT_FALSCH = "Das Kennwort passt nicht. Die Datei bleibt verschlüsselt.";
export const INHALT_BESCHAEDIGT = "Der Inhalt der Datei ist beschädigt oder hat nicht die erwartete Form.";

export type Gelesen = { ok: true; datei: Exportdatei; kopfText: string } | { ok: false; fehler: string };

export function leseDatei(name: string, text: string, zeitzone: string): Gelesen {
  let roh: unknown;
  try { roh = JSON.parse(text); } catch { return { ok: false, fehler: KEINE_DATEI(name) }; }
  if (!istExportdatei(roh) || !exportkopfSchema.safeParse(roh.kopf).success) return { ok: false, fehler: KEINE_DATEI(name) };
  const k = roh.kopf;
  const bereich = k.von === k.bis ? `Block ${k.von}` : `Block ${k.von}–${k.bis}`;
  return { ok: true, datei: roh, kopfText: `Exportiert ${zeitpunktText(k.erstellt, zeitzone)} · ${k.quelle} · ${bereich} · ${k.anzahl} ${k.anzahl === 1 ? "Einsatz" : "Einsätze"}` };
}

export interface Eintrag { block: Block; einsatz: Einsatz | null; fehler: string | null }
export interface Geoeffnet {
  eintraege: Eintrag[]; kette: Kettenzustand; test: boolean; exportiertVon: string; quelle: string;
  anker: { block: number; hash: string; gemeldetAm: string } | null; von: number; bis: number; anzahl: number;
}
export type Oeffnung = { ok: true; wert: Geoeffnet } | { ok: false; fehler: string; kennwort: boolean };

export async function oeffneExport(datei: Exportdatei, kennwort: string): Promise<Oeffnung> {
  let roh: unknown;
  try { roh = await entschluesseleExport(datei, kennwort); }
  catch (e) { return e instanceof KennwortFalsch ? { ok: false, fehler: KENNWORT_FALSCH, kennwort: true } : { ok: false, fehler: INHALT_BESCHAEDIGT, kennwort: false }; }
  const inhalt = exportinhaltSchema.safeParse(roh);
  if (!inhalt.success) return { ok: false, fehler: INHALT_BESCHAEDIGT, kennwort: false };
  const bloecke = inhalt.data.bloecke as Block[];
  const kette = kettenzustandAus(await pruefeKette(bloecke), bloecke);
  const eintraege: Eintrag[] = [];
  for (const b of bloecke) {
    const cek = inhalt.data.schluessel[String(b.kopf.block)];
    let einsatz: Einsatz | null = null;
    if (cek) {
      try { const e = einsatzSchema.safeParse(await oeffneBlock(b, ausBase64(cek))); einsatz = e.success ? (e.data as Einsatz) : null; }
      catch { einsatz = null; }
    }
    eintraege.push({ block: b, einsatz, fehler: einsatz ? null : `Block ${b.kopf.block} lässt sich nicht öffnen` });
  }
  const nummern = bloecke.map((b) => b.kopf.block);
  return { ok: true, wert: {
    eintraege, kette, test: bloecke.some((b) => b.kopf.umgebung === "test"),
    exportiertVon: inhalt.data.exportiertVon, quelle: inhalt.data.quelle, anker: inhalt.data.anker,
    von: Math.min(...nummern), bis: Math.max(...nummern), anzahl: bloecke.length,
  } };
}
```

- [ ] **Step 5: Tests grün.**
- [ ] **Step 6: Commit** — `feat(einsatzbuch): Leseablauf des Readers mit strenger Prüfung nach dem Entschlüsseln`

---

### Task 3: Browser-Audit für den Reader

**Files:**
- Modify: `src/core/audit/browser-schema.ts`, `src/app/api/audit/browser/route.ts`
- Test: `src/core/audit/browser.test.ts` (Schema-Fälle), `src/app/api/audit/browser/route.test.ts`

**Interfaces:**
- Produces: `type BrowserExport = { module: "qr"; format: "png" } | { module: "einsatzbuch"; format: "reader_oeffnen" | "reader_druck"; von: number; bis: number; anzahl: number }`; `parseBrowserExport` streng (genau diese Schlüssel; ganze Zahlen; `1 ≤ von ≤ bis ≤ 10_000_000`; `1 ≤ anzahl ≤ bis − von + 1`).

- [ ] **Step 1: Tests** — Schema: gültiges Einsatzbuch-Ereignis wird angenommen; Zusatzfeld (`inhalt`), Bruchzahl, `von > bis`, `anzahl > bis-von+1`, `format: "png"` bei einsatzbuch → `null`; `qr/png` unverändert. Route (vorhandene Test-Muster der Datei weiterverwenden):
  - anonym mit Einsatzbuch-Ereignis → 403, `auditDenied("einsatzbuch", …, "browser_export")`, nichts gespeichert;
  - Suite-Admin ohne Gruppe (`dashboard-admins`) → 403;
  - mit `einsatzbuch-verwaltung` → 204, gespeicherte Zeile `objectType = "einsatzbuch_reader_oeffnen"`, `origin = "browser"`, `objectRef` = `safeAuditReference("bloecke:1-3:3")`;
  - `qr/png` anonym → weiterhin 204.

- [ ] **Step 2: Tests scheitern.**

- [ ] **Step 3: Implementierung** — `browser-schema.ts`:

```ts
/** No identifiers, filenames, contents, actors or arbitrary metadata cross this boundary. */
export type BrowserExport =
  | { module: "qr"; format: "png" }
  | { module: "einsatzbuch"; format: "reader_oeffnen" | "reader_druck"; von: number; bis: number; anzahl: number };

const ganz = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x);

export function parseBrowserExport(value: unknown): BrowserExport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const e = value as Record<string, unknown>;
  const keys = Object.keys(e).sort().join(",");
  if (keys === "format,module" && e.module === "qr" && e.format === "png") return { module: "qr", format: "png" };
  if (keys === "anzahl,bis,format,module,von" && e.module === "einsatzbuch" && (e.format === "reader_oeffnen" || e.format === "reader_druck")
    && ganz(e.von) && ganz(e.bis) && ganz(e.anzahl) && e.von >= 1 && e.von <= e.bis && e.bis <= 10_000_000 && e.anzahl >= 1 && e.anzahl <= e.bis - e.von + 1) {
    return { module: "einsatzbuch", format: e.format, von: e.von, bis: e.bis, anzahl: e.anzahl };
  }
  return null;
}
```

`route.ts`: nach der `canAccess`-Prüfung

```ts
  const mod = getModule(event.module);
  const zugang = requiredGroupsFor(mod);
  // canAccess ist für requiresAuth:false-Module für jeden wahr; ein Modul mit Zugangsgruppe
  // (einsatzbuch) verlangt sie auch hier.
  if (!canAccess(mod, groups) || (zugang.length > 0 && !hasAnyGroup(groups, zugang))) { auditDenied(event.module, actor, "browser_export"); return new Response(null, { status: 403 }); }
```

und beim Speichern `objectRef: event.module === "einsatzbuch" ? \`bloecke:${event.von}-${event.bis}:${event.anzahl}\` : undefined`. In `src/app/m/portal/admin/audit/labels.ts` (`OBJECT_LABELS`) Anzeigenamen für `einsatzbuch_reader_oeffnen` („Einsatzdatei im Reader geöffnet“) und `einsatzbuch_reader_druck` („Einsatzbericht aus dem Reader gedruckt“) ergänzen, neben `qr_png`. (`requiredGroupsFor` aus `@/core/registry`, `hasAnyGroup` aus `@/core/groups`.) Prüfe mit `grep -n "reportBrowserExport\|parseBrowserExport" -r src e2e`, dass keine weitere Stelle den alten Typ voraussetzt; `e2e/suite-audit.spec.ts` bleibt grün.

- [ ] **Step 4: Tests grün** (`pnpm vitest run src/core/audit src/app/api/audit`).
- [ ] **Step 5: Commit** — `feat(audit): Browser-Ereignisse des Einsatzbuch-Readers mit Blockbereich und Gruppenprüfung`

---

### Task 4: Reader-Seite

**Files:**
- Create: `M/(verwaltung)/reader/page.tsx`, `M/_ui/reader/Reader.tsx`, `M/_ui/reader/DruckOverlay.tsx`, `M/_ui/reader/Fehlergrenze.tsx`, `M/_ui/reader/reader.module.css`
- Modify: `M/_lib/nav.ts`, `M/_lib/nav.test.ts`, `src/core/shell/types.ts`, `src/core/shell/navIkonen.tsx`, `M/(verwaltung)/page.tsx`
- Test: `M/_ui/reader/Reader.test.tsx`

**Interfaces:**
- Consumes: Task 1 (Ansichten), Task 2 (`leseDatei`, `oeffneExport`, Texte), Task 3 (`reportBrowserExport` aus `@/core/audit/browser`), `bericht()` aus dem Kern, `zeitzone()` aus `@/core/zeit`, `leseEinstellungen` (Stufe 2).
- Produces: Route `/m/einsatzbuch/reader`; `EINSATZBUCH_NAV` mit viertem Eintrag `{ key: "reader", title: "Reader", href: "/reader", ikon: "reader" }`; `NavIkonName` um `"reader"` (Zeichen `PiBookOpenText`).

- [ ] **Step 1: Seite** — `M/(verwaltung)/reader/page.tsx`:

```tsx
import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { requireEinsatzbuchHost } from "../../_lib/host";
import { requireEinsatzbuchZugang } from "../../_lib/zugang";
import { leseEinstellungen } from "../../_lib/einstellungen";
import { Reader } from "../../_ui/reader/Reader";

export const dynamic = "force-dynamic";

export default async function ReaderSeite() {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  return (
    <>
      <Seitenkopf titel="Einsatzbuch-Datei öffnen" beschreibung="Öffne eine Datei, die du in der Verwaltung heruntergeladen hast. Du brauchst das Kennwort, mit dem sie gespeichert wurde. Läuft nur in deinem Browser · kein Server." />
      <Reader bereitschaft={leseEinstellungen(getDb()).bereitschaft} />
    </>
  );
}
```

- [ ] **Step 2: Client-Insel** `Reader.tsx` (`"use client"`), Zustände nach der Vorlage:
  - **leer:** Drop-Zone (`onDragOver`/`onDragLeave`/`onDrop`, Hervorhebung beim Ziehen) mit „.einsatzbuch-Datei hierher ziehen“, „oder“, Primärknopf „Datei auswählen“ (öffnet ein verstecktes `<input type="file" accept=".einsatzbuch,application/json" aria-label="Einsatzbuch-Datei">`). Datei → `await datei.text()` → `leseDatei(name, text, zeitzone())`; Fehler als `Alert type="warning"` mit dem Text aus `KEINE_DATEI`. Darunter die drei Hinweiszeilen der Vorlage („Nichts wird hochgeladen“ – „Die Datei wird nur in diesem Tab gelesen. Schließen oder Neuladen verwirft alles.“; „Entschlüsselung mit Kennwort“ – „AES-256-GCM. Ohne das richtige Kennwort bleibt der Inhalt unlesbar.“; „Kette wird geprüft“ – „Jeder Einsatz wird mit seinem Fingerabdruck und seinem Vorgänger abgeglichen.“). **Keine** „Beispieldatei“.
  - **kennwort:** Karte mit Dateiname (mono), `kopfText`, `Input.Password` mit sichtbarem Label „Kennwort“ und Autofokus, Enter entschlüsselt; Knöpfe „Andere Datei“ und Primär „Entschlüsseln“ (während der Arbeit „Entschlüssele …“, gesperrt bei leerem Feld). Fehler aus `oeffneExport` unter dem Feld (`KENNWORT_FALSCH`) bzw. als `Alert type="warning"` (`INHALT_BESCHAEDIGT`, dann zurück zu „leer“ möglich).
  - **offen:** bei `test` zuerst `<Testband text="Testdaten — kein echter Einsatz" />` (Kern). Dateiname (mono), H2 `1 Einsatz · Block n` bzw. `n Einsätze · Block a–b`, Knopf „Datei schließen“. Info-Karte mit drei Spalten (`auto-fit, minmax(260px, 1fr)`): „Nur in diesem Tab entschlüsselt“ – „Nichts wurde hochgeladen oder gespeichert. Schließen verwirft den Inhalt.“; „Aus der Verwaltung“ – `${quelle} · exportiert ${zeitpunktText(kopf.erstellt, zone)}${exportiertVon ? ` von ${exportiertVon}` : ""}`; „Kettenprüfung“ – `<Kettenpruefung zustand mitSatz anker={anker} />`. Darunter Flex-Wrap: links `Kettenliste` (Einträge **neueste oben**, `kopfRechts="neueste oben"`, Fuß „Block 0 · Anfang der Kette“ bzw. `Vorgänger #${kurz(prev)} · nicht in der Datei`, Vorauswahl der neueste Block), rechts `Einsatzdetail` (`dritteKennzahl="gesamt"`, `mitDauerzeile`, `objektImmer`, `kopfRechts` = Knopf „PDF erzeugen“) bzw. für einen nicht zu öffnenden Block eine Karte mit dessen Fehlertext und den Hashes.
  - Nach erfolgreichem Öffnen einmal `reportBrowserExport({ module: "einsatzbuch", format: "reader_oeffnen", von, bis, anzahl })`.
  - „Datei schließen“ / „Andere Datei“ verwerfen alles (State zurück, Kennwort-Feld leer).
  - Alles unterhalb von „offen“ steckt in `<Fehlergrenze>` (Klassenkomponente mit `getDerivedStateFromError`), die bei einem Renderfehler `INHALT_BESCHAEDIGT` und „Datei schließen“ zeigt statt einer weißen Seite.

`DruckOverlay.tsx` (`"use client"`): `createPortal(…, document.body)` mit Wurzelklasse `druckOverlay`; Steuerleiste (`data-druck-steuer`) mit Titel `Einsatzbericht · ${nummer}`, Hinweis „Im Druckdialog „Als PDF speichern“ wählen.“, Knöpfe „Schließen“ und Primär „Als PDF speichern“ (`window.print()`, danach `reportBrowserExport({ module: "einsatzbuch", format: "reader_druck", von: block, bis: block, anzahl: 1 })`); darunter `<Berichtsblatt daten={bericht(block, einsatz, { pruefung, quelle: \`Einsatzbuch Reader, aus ${dateiname}\`, erzeugt: zeitpunktText(new Date().toISOString(), zone), zeitzone: zone })} bereitschaft={bereitschaft} />` mit `pruefung` = `${chipText(zustand)} (geprüft im Reader)`. Escape schließt. `reader.module.css`:

```css
.druckOverlay { position: fixed; inset: 0; z-index: 2000; overflow: auto; background: rgb(0 0 0 / .55); padding: 24px 16px; }
.steuer { max-width: 210mm; margin: 0 auto 16px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: #fff; color: #1a1d20; padding: 12px 16px; border-radius: 8px; }
.blattRahmen { width: max-content; max-width: 100%; margin: 0 auto; box-shadow: 0 8px 24px rgb(0 0 0 / .25); }
@media print {
  :global(body) > :not(.druckOverlay) { display: none !important; }
  .druckOverlay { position: static; background: none; padding: 0; overflow: visible; }
  .steuer { display: none; }
  .blattRahmen { box-shadow: none; width: auto; }
}
```

(`:global(body) > :not(.druckOverlay)` ist rein, weil es eine lokale Klasse enthält. Die Regel steht bewusst nicht unter einem Suite-Rahmen: das Overlay hängt als Portal an `body`, Falle 18.)

- [ ] **Step 3: Navigation und Übersicht** — vierter Eintrag in `EINSATZBUCH_NAV`, `nav.test.ts` auf vier Einträge und die Route `"/reader"` → `M/(verwaltung)/reader/page.tsx`; `NavIkonName` `"reader"` mit Kommentar, `NAV_IKONEN.reader = PiBookOpenText`. Übersicht: im `Seitenkopf` `aktionen={<Link href="/reader">Einsatzdatei im Reader öffnen</Link>}` (`next/link`, in einer Server Component unbedenklich).

- [ ] **Step 4: DOM-Test** `Reader.test.tsx` (jsdom): Datei per `input.files` (über `Object.defineProperty` und ein `change`-Ereignis) mit dem Text der Vektordatei → Kennwortkarte zeigt `kopfText`; eine Datei `{}` → Hinweis „ist keine Einsatzbuch-Datei“; `reportBrowserExport` gemockt (`vi.mock("@/core/audit/browser")`), nach dem Öffnen mit `testvektor-kennwort` einmal mit `{ module: "einsatzbuch", format: "reader_oeffnen", von: 1, bis: 3, anzahl: 3 }` aufgerufen (PBKDF2 mit 600 000 Runden dauert in Node ≈ 0,5 s; Test-Timeout 20 s).

- [ ] **Step 5: Tests grün** (`pnpm vitest run src/app/m/einsatzbuch src/core/shell`).
- [ ] **Step 6: Commit** — `feat(einsatzbuch): Reader öffnet Exportdateien im Browser mit Kettenprüfung und Berichtsblatt`

---

### Task 5: Umschalter und Release-Notiz

**Files:**
- Modify: `src/core/registry.ts`, `M/registry.test.ts`, `src/app/m/portal/_lib/neuigkeiten/register.ts`
- Create: `src/app/m/portal/_lib/neuigkeiten/notizen/einsatzbuch/2026-09-24-einsatzdateien-im-reader.ts`

- [ ] **Step 1: Test** — `M/registry.test.ts`: `showInSwitcher: true` im `toMatchObject`, Testname „ist anonym routbar, trägt die Zugangsgruppe und steht im Umschalter“; neuer Fall:

```ts
it("im Umschalter nur mit der Zugangsgruppe — nicht anonym, nicht für den Suite-Admin", () => {
  expect(visibleSwitcherModules(["einsatzbuch-verwaltung"], {}).map((m) => m.key)).toContain("einsatzbuch");
  expect(visibleSwitcherModules(["dashboard-admins"], {}).map((m) => m.key)).not.toContain("einsatzbuch");
  expect(visibleSwitcherModules(null, {}).map((m) => m.key)).toEqual(["qr", "radio"]);
});
```

- [ ] **Step 2: Registry** — Eintrag `einsatzbuch`: `showInSwitcher: true`; Kommentar „showInSwitcher bleibt aus, bis der Reader steht (Stufe 3)“ ersetzen durch „Im Umschalter nur für die Zugangsgruppe (`switcherGroupSources: ["access"]`).“

- [ ] **Step 3: Notiz** (Regeln `CLAUDE.md` „Release Notes“, `register.test.ts`: ein Absatz, ≤ 320 Zeichen, Titel ≤ 60, Du-Form, keine Werbewörter, kein Markdown):

```ts
// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "einsatzdateien-im-reader",
  datum: "2026-09-24",
  titel: "Einsatzdateien im Browser öffnen",
  inhalt: [
    absatz(
      "Im Einsatzbuch öffnest du unter „Reader“ eine heruntergeladene .einsatzbuch-Datei mit ihrem Kennwort. " +
        "Du siehst, ob die Kette intakt ist, jeden Einsatz im Detail und den Einsatzbericht zum Drucken. " +
        "Die Datei wird nur in deinem Browser gelesen.",
    ),
  ],
};

export default notiz;
```

Zeile in `register.ts` (Default-Import + Eintrag in `NOTIZEN`).

- [ ] **Step 4: Tests grün** — `pnpm vitest run src/core/registry.test.ts src/core/shell src/app/m/einsatzbuch/registry.test.ts src/app/m/portal/_lib/neuigkeiten`.
- [ ] **Step 5: Commit** (Umschalter und Notiz zusammen) — `feat(einsatzbuch): Einsatzbuch im Umschalter für die Verwaltung, Notiz zum Reader`

---

### Task 6: E2E des Readers

**Files:**
- Create: `e2e/einsatzbuch-reader.spec.ts`
- Modify: `e2e/gruppen.json`

- [ ] **Step 1: Spec**

```ts
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { devLogin, E2E_PORT } from "./fixtures";
import { entschluesseleExport, verschluesseleExport } from "../src/app/m/einsatzbuch/_lib/kern/export";
import { versiegele } from "../src/app/m/einsatzbuch/_lib/kern/block";
import { erzeugeSchluesselpaar, schluesselIdVon } from "../src/app/m/einsatzbuch/_lib/kern/umschlag";
import { zuBase64, zufall } from "../src/app/m/einsatzbuch/_lib/kern/bytes";
import { beispielEinsatz, kopf } from "../src/app/m/einsatzbuch/_lib/kern/testhilfe";
import type { Exportdatei } from "../src/app/m/einsatzbuch/_lib/kern/format";

const HOST = "einsatzbuch.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;
const KW = "testvektor-kennwort";
const vektor = (JSON.parse(readFileSync("src/app/m/einsatzbuch/_lib/kern/testvektoren/erwartet.json", "utf8")) as { export: Exportdatei }).export;

async function oeffne(page: Page, datei: Exportdatei, kennwort = KW) {
  await page.getByLabel("Einsatzbuch-Datei").setInputFiles({ name: "probe.einsatzbuch", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(datei)) });
  await page.getByLabel("Kennwort").fill(kennwort);
  await page.getByRole("button", { name: "Entschlüsseln" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __drucke: number }).__drucke = 0; window.print = () => { (window as unknown as { __drucke: number }).__drucke++; }; });
  await devLogin(page, { host: HOST, groups: "einsatzbuch-verwaltung", callbackPath: "/" });
  // Falle 10: Route Handler vor dem ersten POST aufwärmen.
  await page.request.get(url("/api/audit/browser"));
  expect((await page.goto(url("/reader")))?.status()).toBe(200);
});

test("Vektordatei: Kette intakt, Detail, Bericht, Audit beim Öffnen und Drucken", async ({ page }) => {
  const geoeffnet = page.waitForRequest((r) => r.url().endsWith("/api/audit/browser") && r.method() === "POST" && r.postData()?.includes("reader_oeffnen") === true);
  await oeffne(page, vektor);
  await expect(page.getByText("Kette intakt")).toBeVisible();
  expect(JSON.parse((await geoeffnet).postData()!)).toEqual({ module: "einsatzbuch", format: "reader_oeffnen", von: 1, bis: 3, anzahl: 3 });
  await expect(page.getByRole("heading", { name: "MANV 10" })).toBeVisible();
  await expect(page.getByText(/laut Datei/)).toBeVisible();
  await expect(page.getByText("Testdaten — kein echter Einsatz")).toHaveCount(0);

  await page.getByRole("button", { name: "PDF erzeugen" }).click();
  await expect(page.getByText("Vertraulich — nur für den Dienstgebrauch")).toBeVisible();
  const gedruckt = page.waitForRequest((r) => r.url().endsWith("/api/audit/browser") && r.postData()?.includes("reader_druck") === true);
  await page.getByRole("button", { name: "Als PDF speichern" }).click();
  await gedruckt;
  expect(await page.evaluate(() => (window as unknown as { __drucke: number }).__drucke)).toBe(1);

  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("suite-header")).toBeHidden();
  await expect(page.getByText("Vertraulich — nur für den Dienstgebrauch")).toBeVisible();
  const pdf = await page.pdf({ preferCSSPageSize: true });
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(pdf);
  expect(doc.getPageCount()).toBe(1);
  const { width, height } = doc.getPage(0).getSize();
  expect([Math.round(width / 72 * 25.4), Math.round(height / 72 * 25.4)]).toEqual([210, 297]);
});

test("manipulierte Datei → Gebrochen bei Block 2", async ({ page }) => {
  const inhalt = await entschluesseleExport(vektor, KW);
  inhalt.bloecke[1] = { ...inhalt.bloecke[1], kopf: { ...inhalt.bloecke[1].kopf, versiegelt: "2026-08-29T19:34:00+02:00" } };
  await oeffne(page, await verschluesseleExport(inhalt, KW, vektor.kopf));
  await expect(page.getByText("Gebrochen bei Block 2")).toBeVisible();
});

test("falsches Kennwort → Meldung der Vorlage", async ({ page }) => {
  await oeffne(page, vektor, "falsch-falsch");
  await expect(page.getByText("Das Kennwort passt nicht. Die Datei bleibt verschlüsselt.")).toBeVisible();
});

test("Testdatei → Band, und der Bericht trägt TESTDATEN", async ({ page }) => {
  const paar = await erzeugeSchluesselpaar();
  const cek = zufall(32);
  const b = await versiegele(beispielEinsatz("T-2026-001"), kopf(1, "0".repeat(64), await schluesselIdVon(paar.publicKey), "test"), paar.publicKey,
    { cek, iv: zufall(12), umschlag: { ephemer: await erzeugeSchluesselpaar(), iv: zufall(12) } });
  const datei = await verschluesseleExport({ bloecke: [b], schluessel: { "1": zuBase64(cek) }, exportiertVon: "E2E", quelle: "Testrechner", anker: null }, KW,
    { erstellt: "2026-09-24T10:00:00+02:00", umfang: "einzeln", von: 1, bis: 1, anzahl: 1, quelle: "Testrechner" });
  await oeffne(page, datei);
  await expect(page.getByText("Testdaten — kein echter Einsatz")).toBeVisible();
  await page.getByRole("button", { name: "PDF erzeugen" }).click();
  await expect(page.getByText("TESTDATEN", { exact: true })).toBeVisible();
});
```

(Prüfe vorab, ob Playwrights TS-Loader die Kern-Importe ohne Pfad-Aliase lädt — der Kern importiert nur relativ, also ja. Scheitert `page.pdf` in der Umgebung, bleibt der Rest der Aussage und der Grund steht im Bericht; die Seitenzahl-Zusicherung wird nicht still entfernt.)

- [ ] **Step 2: `e2e/gruppen.json`** — `e2e/einsatzbuch-reader.spec.ts` in die Gruppe `suite-verwaltung`.
- [ ] **Step 3: Tore** — `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/einsatzbuch.spec.ts e2e/einsatzbuch-stammdaten.spec.ts e2e/einsatzbuch-reader.spec.ts e2e/suite-audit.spec.ts e2e/launcher.spec.ts e2e/portal-neuigkeiten.spec.ts`.
- [ ] **Step 4: Commit** — `test(einsatzbuch): E2E für den Reader mit Vektordatei, Bruch, Kennwort und Testband`

---

## Abschluss der Stufe

- Review über den gesamten Diff der Stufe.
- Abnahme: Reader öffnet die Vektordatei im echten Browser ohne HTTP 500 (E2E-Spec, Status 200 der Seite).
- Kein Merge, kein Auto-Merge.
