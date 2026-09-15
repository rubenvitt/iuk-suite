# Lagerbuch — Schränke als Lagerorte (DRK-297) · Umsetzungsplan

> **Für agentische Ausführung:** ERFORDERLICHER SUB-SKILL: `superpowers:subagent-driven-development`
> (empfohlen) oder `superpowers:executing-plans`, Aufgabe für Aufgabe. Die Schritte tragen
> Kästchen (`- [ ]`).

**Ziel:** Schränke im Handlager werden echte Lagerorte mit Zugangshinweis; jede Charge zeigt, wo
wie viel von ihr liegt.

**Architektur:** `lagerorte` bekommt einen Elternort — der Handlager wird zur Wurzel, Schränke
werden seine Kinder. Alle Handlager-Abfragen rechnen ab dann mit einer **Menge von Orten** statt
mit einer ID; dadurch bleiben Mindestbestand, Kacheln, Bestellvorschlag und Inventur unverändert
richtig. Der FEFO-Abbuchungskern lernt, über mehrere Orte zu buchen, weil er sonst still „0
gebucht" meldete, sobald Bestand außerhalb der Wurzel liegt.

**Technik:** Next.js 16 (App Router, RSC) · Ant Design 6 · Drizzle + better-sqlite3 · Vitest ·
Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-lagerbuch-schraenke-design.md`

## Globale Randbedingungen

* **Modul-Datenbank:** `src/app/m/lagerbuch/_db/`. Migrationen sind **handgeschrieben**, nie
  `drizzle-kit generate` — der Generator kennt die Audit-Trigger aus `0004` nicht und ließe sie
  still stehen (`0005_artikel_kategorie.sql`, Kopfkommentar).
* **Zeit ist Unix-Sekunden:** jede Zeitspalte `{ mode: "timestamp" }`, niemals `timestamp_ms`.
* **Kein `"use client"` und kein `@ant-design/icons`** in `_lib/`, `_db/` und Server Components
  (Fallen 6 und 7 aus `CLAUDE.md`).
* **Keine Funktion über die RSC-Grenze** — `columns[].render` gehört in eine `"use client"`-Insel
  (Falle 9).
* **Bediendichte 44 px** (`ARBEITSDICHTE`) in allen `FullShell`-Inhalten; `size` auf
  Bedienelementen gar nicht setzen (Falle 4).
* **Tabellen** laufen über `core/tabelle` (`Datentabelle`); Zeilengreifer in Tests ist
  `[data-row-key]`, nie `tbody tr` (Falle 14).
* **Vorzeichen:** Zugang +, Entnahme − (`schema.ts`).
* **Sentinel „kein Verfall"** ist `PSEUDO_VERFALL = "2099-12"`.
* **Der Handlager heißt `HANDLAGER_ID = "handlager"`** und bleibt die Wurzel.
* **Tore:** `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
  `pnpm exec playwright test`. `typecheck` wird am **Exit-Code** geprüft, nie an der Meldung.
* **Commits:** Conventional Commits, Ticketnummer im **Body**, nicht in der Kopfzeile. Der Typ ist
  die Versionsnummer — `feat` springt Minor.
* **Ticketstand:** ClickUp wird vom Hauptlauf nachgezogen, nicht von Subagenten.

---

## Dateiübersicht

**Neu:**

| Datei | Verantwortung |
| --- | --- |
| `_db/migrations/0007_lagerorte_hierarchie.sql` | Drei Spalten, ein Index, der neu gesetzte Audit-Trigger |
| `_lib/domain/orte.ts` | `teilbaum()` — rein, ohne Datenbank |
| `_lib/domain/orte.test.ts` | dessen Test |
| `_lib/lesepfade/orte.ts` | `handlagerOrte()`, `ortStamm()` |
| `_actions/lagerorte.ts` | Schrank anlegen, ändern, stilllegen |
| `verwaltung/(arbeit)/lagerorte/page.tsx` | Server Component der neuen Seite |
| `verwaltung/(arbeit)/lagerorte/LagerorteListe.tsx` | Client-Insel: Tabelle und Formular |
| `verwaltung/(arbeit)/lagerorte/LagerorteListe.test.tsx` | deren DOM-Test |
| `_ui/OrtVerteilung.tsx` | Client-Insel: „Schrank 1: 5 · GF: 2 ⓘ · RTW 1: 7" |
| `e2e/lagerbuch-schraenke.spec.ts` | echter Abruf |
| `app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-schraenke.ts` | Anwendernotiz |

**Geändert:**

| Datei | Änderung |
| --- | --- |
| `_db/schema.ts` | drei Spalten an `lagerorte` |
| `_db/migrations.test.ts` | Spaltenliste und Indexliste für `lagerorte` |
| `_lib/domain/bestand.ts` | zwei neue reine Funktionen über Ortsmengen |
| `_lib/lesepfade/bestand.ts` | Aggregate nehmen `orte: string[]`; neues `restJeChargeUndOrt` |
| `_db/aggregate.test.ts` | Differenztests über Ortsmengen |
| `_lib/domain/fefo.ts` | `ChargeRest`/`FefoTeil` mit Ort, vierter Sortierrang |
| `_lib/schreibpfade/abbuchung.ts` | `fefoAbbuchung` über einen Bereich |
| `_lib/schreibpfade/umlagerung.ts` | Ziel-Leg nimmt den Zielort, nie den Quellort |
| `_lib/lesepfade/artikel.ts`, `inventur.ts`, `verfall.ts`, `bestellung.ts` | `handlagerOrte(db)` |
| `_actions/inventur.ts`, `check.ts`, `csv.ts`, `aussondern.ts` | dito |
| `_actions/buchung.ts` | Zugang mit Zielort |
| `_actions/detail.ts` | Verteilung je Charge, Filter auf die Gesamtsumme |
| `_ui/ArtikelDrawer.tsx` | Spalte „Liegt in", Zielort im Zugang-Formular |
| `_ui/Entnahme.tsx` | Verteilung und Zugangshinweis in der Helferansicht |
| `_lib/nav.ts`, `core/shell/types.ts`, `core/shell/navIkonen.tsx` | Navigationseintrag |
| `_lib/seedLokal.ts` | zwei Helferschränke und ein GF-Schrank |
| `portal/_lib/neuigkeiten/register.ts` | die eine Registerzeile |

---

### Aufgabe 1: Migration und Schema

**Dateien:**
- Neu: `src/app/m/lagerbuch/_db/migrations/0007_lagerorte_hierarchie.sql`
- Ändern: `src/app/m/lagerbuch/_db/migrations/meta/_journal.json`
- Ändern: `src/app/m/lagerbuch/_db/schema.ts` (Block `lagerorte`)
- Test: `src/app/m/lagerbuch/_db/migrations.test.ts:76` (Spaltenliste), `:284` (Indexliste)

**Schnittstellen:**
- Liefert: `lagerorte.parentId: string | null`, `lagerorte.zugangshinweis: string | null`,
  `lagerorte.sortierung: number` (NOT NULL, Vorgabe 0). Jede folgende Aufgabe liest sie.

- [ ] **Schritt 1: Die Erwartung in `migrations.test.ts` voranstellen**

In `TABELLEN.lagerorte` (ab Zeile 76) die drei Zeilen **hinten** anhängen — die Reihenfolge ist
die von `PRAGMA table_info`, und `ALTER TABLE ADD` hängt hinten an:

```ts
  lagerorte: [
    { name: "id", typ: "text", notnull: 1, dflt: null, pk: 1 },
    { name: "name", typ: "text", notnull: 1, dflt: null, pk: 0 },
    { name: "typ", typ: "text", notnull: 1, dflt: null, pk: 0 },
    { name: "kennung", typ: "text", notnull: 0, dflt: null, pk: 0 },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true", pk: 0 },
    { name: "template_id", typ: "text", notnull: 0, dflt: null, pk: 0 },
    { name: "parent_id", typ: "text", notnull: 0, dflt: null, pk: 0 },
    { name: "zugangshinweis", typ: "text", notnull: 0, dflt: null, pk: 0 },
    { name: "sortierung", typ: "integer", notnull: 1, dflt: "0", pk: 0 },
  ],
```

In `INDIZES` (Zeile 284) aus `lagerorte: []` machen:

```ts
  lagerorte: ["idx_lagerorte_parent"],
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/migrations.test.ts
```

Erwartet: FAIL — die Ist-Spaltenliste hat sechs Einträge, die Erwartung neun.

- [ ] **Schritt 3: Die Migration schreiben**

`src/app/m/lagerbuch/_db/migrations/0007_lagerorte_hierarchie.sql`:

```sql
-- DRK-297: Schraenke im Handlager als eigene Lagerorte.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die Audit-Trigger
-- aus 0004 nicht und liesse sie beim naechsten Lauf still stehen
-- (0005_artikel_kategorie.sql, Kopfkommentar).
--
-- KEIN BACKFILL. Jede bestehende Zeile bekommt `parent_id = NULL` und
-- `sortierung = 0`; die Bedeutung jeder bestehenden Buchung bleibt gleich. Eine
-- Buchung auf 'handlager' heisst ab jetzt „im Handlager, Schrank noch nicht
-- zugeordnet" — das ist der ehrliche Auffangort, kein Mangel.
ALTER TABLE `lagerorte` ADD `parent_id` text REFERENCES lagerorte(id);
--> statement-breakpoint
ALTER TABLE `lagerorte` ADD `zugangshinweis` text;
--> statement-breakpoint
ALTER TABLE `lagerorte` ADD `sortierung` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_lagerorte_parent` ON `lagerorte` (`parent_id`);
--> statement-breakpoint
-- DER UPDATE-TRIGGER WIRD NEU GESETZT, nicht nur die Spalten angehaengt: sein
-- WHEN zaehlt jede Spalte einzeln auf. Eine Spalte, die dort fehlt, ist eine
-- Aenderung, die NIE protokolliert wird — still. `core/audit/catalog.test.ts`
-- haelt das fest und wird ohne diese drei Zeilen rot.
DROP TRIGGER audit_lagerorte_update;
--> statement-breakpoint
CREATE TRIGGER audit_lagerorte_update AFTER UPDATE ON "lagerorte"
WHEN OLD."id" IS NOT NEW."id" OR OLD."name" IS NOT NEW."name" OR OLD."typ" IS NOT NEW."typ" OR OLD."kennung" IS NOT NEW."kennung" OR OLD."aktiv" IS NOT NEW."aktiv" OR OLD."template_id" IS NOT NEW."template_id" OR OLD."parent_id" IS NOT NEW."parent_id" OR OLD."zugangshinweis" IS NOT NEW."zugangshinweis" OR OLD."sortierung" IS NOT NEW."sortierung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'lagerorte', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
```

- [ ] **Schritt 4: Den Journaleintrag anhängen**

In `src/app/m/lagerbuch/_db/migrations/meta/_journal.json` hinter den Eintrag `0006_inventuren`:

```json
    {
      "idx": 7,
      "version": "6",
      "when": 1789552800000,
      "tag": "0007_lagerorte_hierarchie",
      "breakpoints": true
    }
```

(Das Komma hinter dem `0006`-Objekt nicht vergessen.)

- [ ] **Schritt 5: Das Schema nachziehen**

In `src/app/m/lagerbuch/_db/schema.ts` den Import erweitern und den `lagerorte`-Block ersetzen:

```ts
import {
  sqliteTable, text, integer, index, primaryKey, uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
```

```ts
export const lagerorte = sqliteTable(
  "lagerorte",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    typ: text("typ", { enum: ["lager", "fahrzeug"] }).notNull(),
    kennung: text("kennung"),
    aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
    // Optionale Vorlage, an der ein Fahrzeug haengt. null = individuell gepackt.
    // DER FREMDSCHLUESSEL ZEIGT „RUECKWAERTS" — lagerorte ist die aeltere und
    // zentralere Tabelle. Kein Fehler, aber er bestimmt die Einfuegereihenfolge des
    // Imports (§4.14): fahrzeug_templates VOR lagerorte.
    templateId: text("template_id").references(() => fahrzeugTemplates.id),
    /**
     * DRK-297 — der Elternort. `null` heisst „eigenstaendig": der Handlager und
     * jedes Fahrzeug. Gesetzt heisst „Schrank innerhalb dieses Orts".
     *
     * ⚠️ DIE RUECKGABEANNOTATION `: AnySQLiteColumn` IST PFLICHT, nicht Zierde:
     * ohne sie laeuft TypeScript bei der Selbstreferenz in eine zirkulaere
     * Inferenz und bricht mit „implicitly has type 'any'" ab.
     *
     * ⚠️ EIN IMPORT MUSS ELTERN VOR KINDERN SCHREIBEN. `lagerorte` trug bisher
     * nur den Rueckwaerts-FK auf `fahrzeug_templates`; jetzt auch einen auf sich
     * selbst.
     */
    parentId: text("parent_id").references((): AnySQLiteColumn => lagerorte.id),
    /** Freitext am ORT, nicht an Charge oder Artikel („Zugang ueber LvD — anrufen").
     *  `null` heisst „kein Hinweis" — nie ein Leerstring. */
    zugangshinweis: text("zugangshinweis"),
    /**
     * Reihenfolge innerhalb des Elternorts. SIE IST FACHLICH, NICHT KOSMETISCH:
     * bei gleichem Verfall entscheidet sie, welchen Ort eine Entnahme zuerst
     * anfasst (`_lib/domain/fefo.ts`, vierter Sortierrang). Der GF-Schrank steht
     * hinten, damit niemand ohne Not anrufen muss.
     */
    sortierung: integer("sortierung").notNull().default(0),
  },
  (t) => [index("idx_lagerorte_parent").on(t.parentId)],
);
```

- [ ] **Schritt 6: Tests laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/ src/core/audit/
```

Erwartet: PASS, insbesondere `migrations.test.ts` und `core/audit/catalog.test.ts`.

- [ ] **Schritt 7: Committen**

```bash
git add src/app/m/lagerbuch/_db/
git commit -m "feat(lagerbuch): Lagerorte bekommen Elternort, Zugangshinweis und Reihenfolge

DRK-297. Rein additiv, kein Backfill: bestehende Zeilen bleiben Wurzeln, und
eine Buchung auf 'handlager' heisst ab jetzt „Schrank noch nicht zugeordnet".
Der Audit-Trigger wird neu gesetzt, weil sein WHEN jede Spalte einzeln nennt.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 2: `teilbaum()` — der Begriff „Handlager" als reine Funktion

**Dateien:**
- Neu: `src/app/m/lagerbuch/_lib/domain/orte.ts`
- Test: `src/app/m/lagerbuch/_lib/domain/orte.test.ts`

**Schnittstellen:**
- Liefert: `type OrtZeile = { id: string; parentId: string | null; sortierung: number }` und
  `teilbaum(orte: OrtZeile[], wurzelId: string): string[]`. Aufgabe 3 baut darauf.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect } from "vitest";
import { teilbaum, type OrtZeile } from "./orte";

const ORTE: OrtZeile[] = [
  { id: "handlager", parentId: null, sortierung: 0 },
  { id: "schrank-gf", parentId: "handlager", sortierung: 90 },
  { id: "schrank-1", parentId: "handlager", sortierung: 10 },
  { id: "schrank-2", parentId: "handlager", sortierung: 20 },
  { id: "rtw-1", parentId: null, sortierung: 0 },
];

describe("teilbaum", () => {
  it("liefert die Wurzel zuerst, dann die Kinder nach Reihenfolge", () => {
    expect(teilbaum(ORTE, "handlager"))
      .toEqual(["handlager", "schrank-1", "schrank-2", "schrank-gf"]);
  });

  it("ein Ort ohne Kinder ist sein eigener Teilbaum", () => {
    expect(teilbaum(ORTE, "rtw-1")).toEqual(["rtw-1"]);
  });

  /** Die Wurzel MUSS immer dabei sein: eine leere Liste wuerde in `inArray`
   *  zu `WHERE false` und liesse jeden Bestand still auf 0 fallen. */
  it("eine unbekannte Wurzel liefert trotzdem sich selbst", () => {
    expect(teilbaum(ORTE, "gibt-es-nicht")).toEqual(["gibt-es-nicht"]);
  });

  it("bei gleicher Reihenfolge entscheidet die ID, nicht die Eingabereihenfolge", () => {
    const gleich: OrtZeile[] = [
      { id: "wurzel", parentId: null, sortierung: 0 },
      { id: "b", parentId: "wurzel", sortierung: 5 },
      { id: "a", parentId: "wurzel", sortierung: 5 },
    ];
    expect(teilbaum(gleich, "wurzel")).toEqual(["wurzel", "a", "b"]);
  });

  /** Ein Schrank ist heute nie Elternteil — wenn es doch einmal so kommt,
   *  soll die Funktion nicht in eine Endlosschleife laufen. */
  it("ein Zyklus laeuft nicht endlos", () => {
    const zyklus: OrtZeile[] = [
      { id: "a", parentId: "b", sortierung: 0 },
      { id: "b", parentId: "a", sortierung: 0 },
    ];
    expect(teilbaum(zyklus, "a")).toEqual(["a", "b"]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/orte.test.ts
```

Erwartet: FAIL — `Failed to resolve import "./orte"`.

- [ ] **Schritt 3: Die Funktion schreiben**

```ts
/**
 * DRK-297 — der Begriff „Handlager" an genau EINER Stelle.
 *
 * Kein "use client", kein Icon-Import, kein Datenbankzugriff. Reine Funktion
 * ueber bereits geladene Zeilen — dieselbe Bauart wie `_lib/domain/bestand.ts`.
 *
 * ⚠️ DIE WURZEL IST IMMER TEIL DES ERGEBNISSES, auch wenn es sie gar nicht
 * gibt. Der Grund ist nicht Hoeflichkeit: das Ergebnis geht in `inArray`, und
 * drizzle macht aus einer leeren Liste `WHERE false` — jeder Bestand fiele
 * still auf 0, ohne dass irgendwo etwas wirft.
 */
export type OrtZeile = { id: string; parentId: string | null; sortierung: number };

/**
 * Die Wurzel und ihre direkten Kinder, Wurzel zuerst, Kinder nach
 * `sortierung`, dann `id`.
 *
 * ⚠️ EINE EBENE TIEF, UND DAS IST EINE ENTSCHEIDUNG: Schraenke haben heute
 * keine Kinder, die Faecher darin sind `artikel.fach`. Die Schleife unten
 * steigt trotzdem beliebig tief — nicht aus Vorrat, sondern damit ein spaeter
 * eingehaengter Ort nicht still aus dem Bestand faellt.
 *
 * ⚠️ DIE REIHENFOLGE IST FACHLICH: sie ist der vierte Sortierrang von FEFO
 * (`domain/fefo.ts`). Eine „egale" Reihenfolge schickte jemanden ohne Not zum
 * GF-Schrank.
 */
export function teilbaum(orte: OrtZeile[], wurzelId: string): string[] {
  const kinder = new Map<string, OrtZeile[]>();
  for (const o of orte) {
    if (o.parentId === null) continue;
    const gruppe = kinder.get(o.parentId);
    if (gruppe) gruppe.push(o);
    else kinder.set(o.parentId, [o]);
  }

  const ergebnis: string[] = [];
  const gesehen = new Set<string>();
  const absteigen = (id: string): void => {
    // Der Riegel gegen den Zyklus. Ein Schrank ist heute nie Elternteil; wenn
    // es doch einmal so kommt, ist eine Endlosschleife der teuerste Ausgang.
    if (gesehen.has(id)) return;
    gesehen.add(id);
    ergebnis.push(id);
    const gruppe = kinder.get(id) ?? [];
    for (const kind of [...gruppe].sort((a, b) => a.sortierung - b.sortierung || a.id.localeCompare(b.id))) {
      absteigen(kind.id);
    }
  };
  absteigen(wurzelId);
  return ergebnis;
}
```

- [ ] **Schritt 4: Test laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/orte.test.ts
```

Erwartet: PASS, fünf Tests.

- [ ] **Schritt 5: Committen**

```bash
git add src/app/m/lagerbuch/_lib/domain/orte.ts src/app/m/lagerbuch/_lib/domain/orte.test.ts
git commit -m "feat(lagerbuch): teilbaum() definiert „Handlager\" an einer Stelle

DRK-297. Rein, ohne Datenbank — die Wurzel ist immer im Ergebnis, weil eine
leere Liste in inArray zu WHERE false wuerde und jeden Bestand still auf 0
fallen liesse.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 3: Der Lesepfad zu den Orten

**Dateien:**
- Neu: `src/app/m/lagerbuch/_lib/lesepfade/orte.ts`
- Test: `src/app/m/lagerbuch/_db/orte.test.ts` (gegen eine migrierte Testdatenbank)

**Schnittstellen:**
- Verbraucht: `teilbaum`, `OrtZeile` aus Aufgabe 2; `Leser` aus `_lib/lesepfade/bestand.ts`.
- Liefert:
  - `handlagerOrte(db: Leser): string[]`
  - `type OrtStammZeile = { id: string; name: string; kennung: string | null; zugangshinweis: string | null; sortierung: number; parentId: string | null; typ: "lager" | "fahrzeug"; aktiv: boolean }`
  - `ortStamm(db: Leser): Map<string, OrtStammZeile>`
  - `handlagerSchraenke(db: Leser, nurAktive?: boolean): OrtStammZeile[]`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_db/orte.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { lagerorte } from "./schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { handlagerOrte, ortStamm, handlagerSchraenke } from "../_lib/lesepfade/orte";

let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-orte-");
  // Die Wurzel 'handlager' legt Migration 0003 bereits an — nicht erneut einfuegen.
  t.db.insert(lagerorte).values([
    { id: "schrank-gf", name: "GF-Schrank", typ: "lager", aktiv: true,
      parentId: HANDLAGER_ID, sortierung: 90, zugangshinweis: "Zugang über LvD — anrufen" },
    { id: "schrank-1", name: "Schrank 1", typ: "lager", aktiv: true,
      parentId: HANDLAGER_ID, sortierung: 10 },
    { id: "schrank-alt", name: "Altschrank", typ: "lager", aktiv: false,
      parentId: HANDLAGER_ID, sortierung: 50 },
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", aktiv: true },
  ]).run();
});

afterEach(() => t.schliessen());

describe("handlagerOrte", () => {
  it("liefert Wurzel und Schraenke nach Reihenfolge, ohne Fahrzeuge", () => {
    expect(handlagerOrte(t.db)).toEqual([HANDLAGER_ID, "schrank-1", "schrank-alt", "schrank-gf"]);
  });

  /** Ein stillgelegter Schrank bleibt im BESTAND — alles andere liesse
   *  Material verschwinden. Inaktiv heisst nur: nicht mehr waehlbar. */
  it("nimmt auch stillgelegte Schraenke mit", () => {
    expect(handlagerOrte(t.db)).toContain("schrank-alt");
  });
});

describe("handlagerSchraenke", () => {
  it("liefert ohne die Wurzel und ohne Fahrzeuge", () => {
    expect(handlagerSchraenke(t.db).map((o) => o.id))
      .toEqual(["schrank-1", "schrank-alt", "schrank-gf"]);
  });

  it("filtert auf Wunsch die stillgelegten weg", () => {
    expect(handlagerSchraenke(t.db, true).map((o) => o.id))
      .toEqual(["schrank-1", "schrank-gf"]);
  });
});

describe("ortStamm", () => {
  it("kennt jeden Ort mit Name und Hinweis", () => {
    const stamm = ortStamm(t.db);
    expect(stamm.get("schrank-gf")?.name).toBe("GF-Schrank");
    expect(stamm.get("schrank-gf")?.zugangshinweis).toBe("Zugang über LvD — anrufen");
    expect(stamm.get("schrank-1")?.zugangshinweis).toBeNull();
    expect(stamm.get("rtw-1")?.typ).toBe("fahrzeug");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/orte.test.ts
```

Erwartet: FAIL — `Failed to resolve import "../_lib/lesepfade/orte"`.

- [ ] **Schritt 3: Den Lesepfad schreiben**

`src/app/m/lagerbuch/_lib/lesepfade/orte.ts`:

```ts
/**
 * DRK-297 — die Orte als Stammdaten. Kein "use client", kein Icon-Import.
 *
 * ⚠️ `lagerorte` IST WINZIG (heute eine Handvoll Zeilen). Diese Datei laedt sie
 * absichtlich vollstaendig und rechnet in JS weiter, statt je Frage eine
 * Abfrage zu fahren — dasselbe Muster wie `ortStamm` es fuer die Anzeige
 * braucht. Wer hier spaeter optimiert, optimiert das Falsche.
 */
import { lagerorte } from "../../_db/schema";
import { teilbaum, type OrtZeile } from "../domain/orte";
import { HANDLAGER_ID } from "../konstanten";
import type { Leser } from "./bestand";

export type OrtStammZeile = {
  id: string;
  name: string;
  kennung: string | null;
  zugangshinweis: string | null;
  sortierung: number;
  parentId: string | null;
  typ: "lager" | "fahrzeug";
  aktiv: boolean;
};

function alleOrte(db: Leser): OrtStammZeile[] {
  return db.select().from(lagerorte).all().map((o) => ({
    id: o.id, name: o.name, kennung: o.kennung, zugangshinweis: o.zugangshinweis,
    sortierung: o.sortierung, parentId: o.parentId, typ: o.typ, aktiv: o.aktiv,
  }));
}

/**
 * Der Handlager und seine Schraenke — der Bereich, den JEDE bisher
 * handlager-gescopte Abfrage meint.
 *
 * ⚠️ STILLGELEGTE SCHRAENKE SIND DABEI. Bestand an einem inaktiven Ort zaehlt
 * weiter und wird weiter entnommen; alles andere liesse Material beim Umraeumen
 * verschwinden. „Inaktiv" heisst allein: taucht in der Zugangsauswahl nicht
 * mehr auf.
 */
export function handlagerOrte(db: Leser): string[] {
  const zeilen: OrtZeile[] = alleOrte(db).map((o) => ({
    id: o.id, parentId: o.parentId, sortierung: o.sortierung,
  }));
  return teilbaum(zeilen, HANDLAGER_ID);
}

/** Die Schraenke OHNE die Wurzel — fuer Auswahllisten und die Verwaltung. */
export function handlagerSchraenke(db: Leser, nurAktive = false): OrtStammZeile[] {
  const stamm = ortStamm(db);
  return handlagerOrte(db)
    .filter((id) => id !== HANDLAGER_ID)
    .map((id) => stamm.get(id))
    .filter((o): o is OrtStammZeile => o !== undefined && (!nurAktive || o.aktiv));
}

/** Jeder Ort nach `id` — Name, Hinweis und Reihenfolge fuer die Anzeige. */
export function ortStamm(db: Leser): Map<string, OrtStammZeile> {
  return new Map(alleOrte(db).map((o) => [o.id, o]));
}
```

- [ ] **Schritt 4: Test laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/orte.test.ts
```

Erwartet: PASS, fünf Tests.

- [ ] **Schritt 5: Committen**

```bash
git add src/app/m/lagerbuch/_lib/lesepfade/orte.ts src/app/m/lagerbuch/_db/orte.test.ts
git commit -m "feat(lagerbuch): handlagerOrte() liefert Wurzel und Schraenke

DRK-297. Stillgelegte Schraenke bleiben im Bestand — alles andere liesse
Material beim Umraeumen verschwinden.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 4: Die Bestandsaggregate rechnen mit einer Ortsmenge

**Dateien:**
- Ändern: `src/app/m/lagerbuch/_lib/domain/bestand.ts` (zwei neue reine Funktionen)
- Ändern: `src/app/m/lagerbuch/_lib/lesepfade/bestand.ts` (drei Signaturen, ein neues Aggregat)
- Test: `src/app/m/lagerbuch/_db/aggregate.test.ts`

**Schnittstellen:**
- Verbraucht: nichts aus Aufgabe 2/3 — diese Datei bleibt datenbankfrei bzw. nimmt die Ortsmenge
  als Argument entgegen.
- Liefert:
  - `bestandProOrte(rows: { lagerortId: string; menge: number }[], orte: readonly string[]): number`
  - `restProOrtenUndCharge(rows: { lagerortId: string; chargeId: string; menge: number }[], orte: readonly string[]): Map<string, number>`
  - `bestandJeArtikel(db: Leser, orte: readonly string[]): Map<string, number>`
  - `restJeCharge(db: Leser, orte: readonly string[]): Map<string, number>`
  - `restJeChargeFuerArtikel(db: Leser, artikelId: string, orte: readonly string[]): Map<string, number>`
  - `restJeChargeUndOrt(db: Leser, artikelId: string): Map<string, Map<string, number>>`

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

An `src/app/m/lagerbuch/_db/aggregate.test.ts` anhängen. Die Datei fährt bereits dieselbe
`chargeId` an drei Lagerorten; die neue Konstellation ist **zwei Schränke plus ein Fahrzeug**:

```ts
describe("DRK-297 — Bestand ueber einen Bereich", () => {
  /** Der Differenztest: SQL gegen die reine Funktion, identischer Zeilenbestand. */
  it("bestandJeArtikel ueber zwei Schraenke stimmt mit bestandProOrte ueberein", () => {
    const orte = [HANDLAGER_ID, "schrank-1", "schrank-2"];
    const perSql = bestandJeArtikel(t.db, orte).get(ARTIKEL_A) ?? 0;
    const alle = t.db
      .select({ lagerortId: buchungen.lagerortId, menge: buchungen.menge, artikelId: buchungen.artikelId })
      .from(buchungen).all()
      .filter((r) => r.artikelId === ARTIKEL_A);
    expect(perSql).toBe(bestandProOrte(alle, orte));
  });

  /** ⚠️ OHNE DIESEN TEST BLIEBE EIN ZU WEITER BEREICH GRUEN: das Fahrzeug
   *  darf nicht in den Handlager-Bereich rutschen. */
  it("der Bereich schliesst das Fahrzeug NICHT ein", () => {
    const mitFahrzeug = bestandJeArtikel(t.db, [HANDLAGER_ID, "schrank-1", RTW1]).get(ARTIKEL_A) ?? 0;
    const ohneFahrzeug = bestandJeArtikel(t.db, [HANDLAGER_ID, "schrank-1"]).get(ARTIKEL_A) ?? 0;
    expect(mitFahrzeug).toBeGreaterThan(ohneFahrzeug);
  });

  it("restJeChargeUndOrt zeigt dieselbe Charge an zwei Orten mit je eigener Menge", () => {
    const verteilung = restJeChargeUndOrt(t.db, ARTIKEL_A).get(CHARGE_GETEILT);
    expect(verteilung?.get("schrank-1")).toBe(5);
    expect(verteilung?.get(RTW1)).toBe(7);
  });

  /** Leere Gruppen liefern KEINE Zeile — `?? 0` auf beiden Seiten. */
  it("ein Ort ohne Buchung der Charge fehlt in der Verteilung ganz", () => {
    expect(restJeChargeUndOrt(t.db, ARTIKEL_A).get(CHARGE_GETEILT)?.get("schrank-2")).toBeUndefined();
  });
});
```

Im `beforeEach` der Datei die neuen Orte und die geteilte Charge ergänzen (die bestehenden Zeilen
bleiben unangetastet — sie sind die Absicherung gegen ein weggelassenes Lagerort-Prädikat):

```ts
  t.db.insert(lagerorte).values([
    { id: "schrank-1", name: "Schrank 1", typ: "lager", aktiv: true, parentId: HANDLAGER_ID, sortierung: 10 },
    { id: "schrank-2", name: "Schrank 2", typ: "lager", aktiv: true, parentId: HANDLAGER_ID, sortierung: 20 },
  ]).run();
  t.db.insert(chargen).values({
    id: CHARGE_GETEILT, artikelId: ARTIKEL_A, chargenNr: "GETEILT",
    verfall: "2027-03", createdAt: jetzt,
  }).run();
  t.db.insert(buchungen).values([
    { id: newId(), ts: jetzt, typ: "zugang", artikelId: ARTIKEL_A, chargeId: CHARGE_GETEILT,
      lagerortId: "schrank-1", menge: 5, quelleTyp: "system", quelleId: "seed" },
    { id: newId(), ts: jetzt, typ: "zugang", artikelId: ARTIKEL_A, chargeId: CHARGE_GETEILT,
      lagerortId: RTW1, menge: 7, quelleTyp: "system", quelleId: "seed" },
  ]).run();
```

Dazu oben `const CHARGE_GETEILT = "charge-geteilt";` und die Importe
`bestandProOrte`, `restJeChargeUndOrt` ergänzen. `ARTIKEL_A` ist die im Test bereits vorhandene
Artikel-ID — den dortigen Namen übernehmen, nicht neu erfinden.

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/aggregate.test.ts
```

Erwartet: FAIL — `bestandProOrte` und `restJeChargeUndOrt` existieren nicht.

- [ ] **Schritt 3: Die reinen Funktionen ergänzen**

An `src/app/m/lagerbuch/_lib/domain/bestand.ts` anhängen. **Die vier bestehenden Funktionen
bleiben unverändert stehen** — sie sind weiterhin die Spezifikation für einen einzelnen Ort
(Fahrzeuge) und werden von den Tests der Fahrzeugpfade gebraucht:

```ts
/**
 * DRK-297 — Bestand über EINEN BEREICH von Orten (Handlager plus Schränke).
 *
 * Das Gegenstück zu `bestandProLagerort` für den Fall, dass „ein Ort" aus
 * mehreren besteht. ⚠️ SIE ERSETZT JENE NICHT: ein Fahrzeug ist ein einzelner
 * Ort, und wer den Handlager-Bereich versehentlich auf ein Fahrzeug anwendet,
 * baut genau den Phantombestand, gegen den das Scoping geschrieben ist.
 */
export function bestandProOrte(
  rows: { lagerortId: string; menge: number }[],
  orte: readonly string[],
): number {
  const menge = new Set(orte);
  return rows.reduce((sum, r) => (menge.has(r.lagerortId) ? sum + r.menge : sum), 0);
}

/**
 * Rest je Charge über einen BEREICH — das Gegenstück zu
 * `bestandProLagerortUndCharge`.
 *
 * ⚠️ Chargen ohne Buchung im Bereich fehlen in der Map GANZ; es gibt keinen
 * 0-Eintrag. Das SQL-Aggregat verhält sich genauso, und beide Seiten gehen
 * deshalb über `?? 0`.
 */
export function restProOrtenUndCharge(
  rows: { lagerortId: string; chargeId: string; menge: number }[],
  orte: readonly string[],
): Map<string, number> {
  const menge = new Set(orte);
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!menge.has(r.lagerortId)) continue;
    m.set(r.chargeId, (m.get(r.chargeId) ?? 0) + r.menge);
  }
  return m;
}
```

- [ ] **Schritt 4: Die Aggregate umstellen**

In `src/app/m/lagerbuch/_lib/lesepfade/bestand.ts`: `eq` durch `inArray` ersetzen (Import
erweitern) und die drei Signaturen ändern. `bestandJeArtikelUndLagerort` bleibt, wie es ist.

```ts
import { and, eq, inArray, sql } from "drizzle-orm";
```

```ts
/**
 * Bestand je Artikel über einen BEREICH von Orten (DRK-297: Handlager plus
 * Schränke, oder ein einzelnes Fahrzeug als einelementige Liste).
 * Index: `idx_buchungen_lagerort_artikel`.
 *
 * ⚠️ EINE LEERE LISTE ERGIBT `WHERE false` und damit überall 0 — still.
 * `handlagerOrte` liefert deshalb immer mindestens die Wurzel
 * (`_lib/domain/orte.ts`).
 */
export function bestandJeArtikel(db: Leser, orte: readonly string[]): Map<string, number> {
  const rows = db
    .select({ artikelId: buchungen.artikelId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(inArray(buchungen.lagerortId, [...orte]))
    .groupBy(buchungen.artikelId)
    .all();
  return new Map(rows.map((r) => [r.artikelId, r.summe]));
}

export function restJeCharge(db: Leser, orte: readonly string[]): Map<string, number> {
  const rows = db
    .select({ chargeId: buchungen.chargeId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(inArray(buchungen.lagerortId, [...orte]))
    .groupBy(buchungen.chargeId)
    .all();
  return new Map(rows.map((r) => [r.chargeId, r.summe]));
}

export function restJeChargeFuerArtikel(
  db: Leser, artikelId: string, orte: readonly string[],
): Map<string, number> {
  const rows = db
    .select({ chargeId: buchungen.chargeId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(and(eq(buchungen.artikelId, artikelId), inArray(buchungen.lagerortId, [...orte])))
    .groupBy(buchungen.chargeId)
    .all();
  return new Map(rows.map((r) => [r.chargeId, r.summe]));
}

/**
 * DRK-297 — Rest je (Charge, Ort) für EINEN Artikel, über ALLE Orte. Eine
 * Abfrage, `GROUP BY charge_id, lagerort_id`.
 *
 * ⚠️ KEIN ORTS-PRÄDIKAT, und das ist der Punkt: die Anzeige soll „Schrank 1: 5
 * · RTW 1: 7" zeigen können. Genau dieser fehlende Filter behebt den Befund,
 * dass eine Charge, die vollständig im Fahrzeug liegt, aus dem Artikeldetail
 * verschwindet.
 *
 * ⚠️ DIE SCHACHTELUNG IST VERTRAG: AUSSEN die Charge, INNEN der Ort. Die
 * Anzeige iteriert Chargen und schlägt darin die Orte nach.
 */
export function restJeChargeUndOrt(
  db: Leser, artikelId: string,
): Map<string, Map<string, number>> {
  const rows = db
    .select({
      chargeId: buchungen.chargeId,
      lagerortId: buchungen.lagerortId,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .where(eq(buchungen.artikelId, artikelId))
    .groupBy(buchungen.chargeId, buchungen.lagerortId)
    .all();
  const m = new Map<string, Map<string, number>>();
  for (const r of rows) {
    // Ein Ort mit Rest 0 (alles wieder herausgebucht) ist kein Liegeplatz.
    if (r.summe <= 0) continue;
    let innen = m.get(r.chargeId);
    if (!innen) { innen = new Map(); m.set(r.chargeId, innen); }
    innen.set(r.lagerortId, r.summe);
  }
  return m;
}
```

Im selben Schritt `kennzahlen()` in derselben Datei anpassen — sie ruft beide Aggregate:

```ts
import { handlagerOrte } from "./orte";
```

```ts
  const orte = handlagerOrte(db);
  const bestand = bestandJeArtikel(db, orte);
  const restProCharge = restJeCharge(db, orte);
```

⚠️ `HANDLAGER_ID` wird in dieser Datei danach nicht mehr gebraucht — den Import entfernen, sonst
meldet `lint` eine unbenutzte Bindung.

- [ ] **Schritt 5: Alle Aufrufer nachziehen**

Jede Fundstelle, die heute `HANDLAGER_ID` an eines der drei Aggregate reicht, bekommt
`handlagerOrte(db)`. Der Compiler zeigt sie vollständig an:

```bash
pnpm typecheck; echo "exit=$status"
```

Betroffen sind: `_lib/lesepfade/artikel.ts` (`chargenMitRest`, `artikelListe`, `artikelDetail`),
`_lib/lesepfade/inventur.ts`, `_lib/lesepfade/verfall.ts`, `_lib/lesepfade/bestellung.ts`,
`_actions/inventur.ts`, `_lib/schreibpfade/korrektur.ts` **und
`_lib/schreibpfade/abbuchung.ts:70`**.

⚠️ **`abbuchung.ts` bekommt hier nur eine Brücke, keine Fachänderung:** aus
`restJeChargeFuerArtikel(tx, artikelId, lagerortId)` wird
`restJeChargeFuerArtikel(tx, artikelId, [lagerortId])` — verhaltensgleich, eine Zeile. Aufgabe 6
ersetzt den Aufruf ohnehin durch die gruppierte Abfrage. Ohne diese Zeile kann Schritt 6 dieser
Aufgabe (`typecheck exit=0`) gar nicht grün werden.

In `chargenMitRest` wird aus dem Vorgabewert eine Ortsmenge:

```ts
export function chargenMitRest(
  db: Leser, artikelId: string, orte: readonly string[] = handlagerOrte(db),
): ChargeZeile[] {
```

⚠️ **`bestandProLagerort` in `_actions/inventur.ts:103` wird zu `bestandProOrte`** mit
`handlagerOrte(tx)` — sonst zählt die Inventur den Schrankbestand nicht mit und bucht bei jedem
Lauf eine Korrektur über die gesamte Schrankmenge.

⚠️ **Fahrzeugpfade bleiben einzeln.** `_lib/lesepfade/fahrzeuge.ts` und `_actions/check.ts`
reichen eine Fahrzeug-ID; daraus wird `[fahrzeugId]`, **nicht** `handlagerOrte`.

- [ ] **Schritt 6: Alle Tests des Moduls laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/ && pnpm typecheck; echo "exit=$status"
```

Erwartet: PASS und `exit=0`.

- [ ] **Schritt 7: Committen**

```bash
git add src/app/m/lagerbuch/
git commit -m "feat(lagerbuch): der Bestand rechnet ueber einen Bereich statt ueber einen Ort

DRK-297. Handlager heisst ab jetzt „Wurzel plus Schraenke\"; Mindestbestand,
Kacheln, Bestellvorschlag und Inventur zeigen dieselben Zahlen wie vorher.
restJeChargeUndOrt kommt hinzu und traegt bewusst kein Orts-Praedikat.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 5: FEFO kennt den Ort

**Dateien:**
- Ändern: `src/app/m/lagerbuch/_lib/domain/fefo.ts`
- Test: `src/app/m/lagerbuch/_db/fefo.test.ts`

**Schnittstellen:**
- Liefert:
  - `type ChargeRest = { chargeId: string; verfall: string; rest: number; createdAt: Date; lagerortId: string; ortSortierung: number }`
  - `type FefoTeil = { chargeId: string; menge: number; vonLagerortId: string }`
  - `fefoVerteilung(chargen: ChargeRest[], menge: number): FefoTeil[]`

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

An `src/app/m/lagerbuch/_db/fefo.test.ts` anhängen:

```ts
describe("DRK-297 — der vierte Sortierrang", () => {
  const basis = { chargeId: "c1", verfall: "2027-01", createdAt: new Date("2026-01-01T00:00:00Z") };

  it("bei gleichem Verfall greift der Ort mit kleinerer Reihenfolge zuerst", () => {
    const teile = fefoVerteilung([
      { ...basis, rest: 5, lagerortId: "schrank-gf", ortSortierung: 90 },
      { ...basis, rest: 5, lagerortId: "schrank-1", ortSortierung: 10 },
    ], 3);
    expect(teile).toEqual([{ chargeId: "c1", menge: 3, vonLagerortId: "schrank-1" }]);
  });

  it("reicht der bequeme Ort nicht, wird der naechste angebrochen", () => {
    const teile = fefoVerteilung([
      { ...basis, rest: 2, lagerortId: "schrank-1", ortSortierung: 10 },
      { ...basis, rest: 5, lagerortId: "schrank-gf", ortSortierung: 90 },
    ], 6);
    expect(teile).toEqual([
      { chargeId: "c1", menge: 2, vonLagerortId: "schrank-1" },
      { chargeId: "c1", menge: 4, vonLagerortId: "schrank-gf" },
    ]);
  });

  /** ⚠️ DAS VERFALLSDATUM BLEIBT DAS ERSTE KRITERIUM. Ein Ort, der bequemer
   *  liegt, darf eine frueher ablaufende Charge NICHT ueberholen. */
  it("der Ort ueberholt den Verfall nicht", () => {
    const teile = fefoVerteilung([
      { chargeId: "spaet", verfall: "2028-01", rest: 9, createdAt: new Date("2026-01-01T00:00:00Z"),
        lagerortId: "schrank-1", ortSortierung: 10 },
      { chargeId: "frueh", verfall: "2026-10", rest: 9, createdAt: new Date("2026-01-01T00:00:00Z"),
        lagerortId: "schrank-gf", ortSortierung: 90 },
    ], 4);
    expect(teile).toEqual([{ chargeId: "frueh", menge: 4, vonLagerortId: "schrank-gf" }]);
  });

  it("bei gleicher Reihenfolge entscheidet die Ort-ID, nicht die Eingabereihenfolge", () => {
    const teile = fefoVerteilung([
      { ...basis, rest: 1, lagerortId: "b", ortSortierung: 0 },
      { ...basis, rest: 1, lagerortId: "a", ortSortierung: 0 },
    ], 1);
    expect(teile[0]?.vonLagerortId).toBe("a");
  });
});
```

Die bereits vorhandenen Tests dieser Datei bekommen `lagerortId: HANDLAGER_ID, ortSortierung: 0`
in ihren Objektliteralen und `vonLagerortId: HANDLAGER_ID` in ihren Erwartungen.

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/fefo.test.ts
```

Erwartet: FAIL — die Typen kennen `lagerortId` nicht, die Erwartungen kein `vonLagerortId`.

- [ ] **Schritt 3: `fefo.ts` erweitern**

```ts
export type ChargeRest = {
  chargeId: string;
  /** "YYYY-MM" */
  verfall: string;
  /** Rest AN DIESEM EINEN Ort, nie über einen Bereich summiert. */
  rest: number;
  createdAt: Date;
  /**
   * DRK-297 — der Ort, an dem dieser Rest liegt. Dieselbe Charge kommt für
   * zwei Orte ZWEIMAL in der Liste vor, mit je eigenem Rest.
   */
  lagerortId: string;
  /** `lagerorte.sortierung` des Orts — der vierte Sortierrang. */
  ortSortierung: number;
};

/**
 * ⚠️ DAS FELD HEISST `vonLagerortId` UND NICHT `lagerortId`, und der Name ist
 * der Riegel: `umlagerung()` bucht das Ziel-Leg strikt aus `teile[]` und
 * müsste bei einem neutral benannten Feld raten, ob es Quelle oder Ziel meint.
 * Ein Ziel-Leg, das den Quellort nimmt, ist netto null, wirft nicht — und das
 * Fahrzeug bleibt leer.
 */
export type FefoTeil = { chargeId: string; menge: number; vonLagerortId: string };
```

```ts
/**
 * Verteilt `menge` über die Chargenreste mit Rest > 0, früheste Fälligkeit
 * zuerst.
 *
 * VIERSTUFIGE SORTIERUNG:
 *   1. `verfall`        — FEFO selbst, und es BLEIBT das erste Kriterium.
 *   2. `createdAt`      — gleicher Verfall ⇒ ÄLTERE Charge zuerst.
 *   3. `chargeId`       — `createdAt` sind UNIX-SEKUNDEN.
 *   4. `ortSortierung`, dann `lagerortId` (DRK-297) — dieselbe Charge an zwei
 *      Orten: der bequemer erreichbare zuerst. Der GF-Schrank steht hinten,
 *      damit niemand ohne Not zum Telefon greift.
 */
export function fefoVerteilung(chargen: ChargeRest[], menge: number): FefoTeil[] {
  let rest = Math.max(0, menge);
  const sortiert = [...chargen]
    .filter((c) => c.rest > 0)
    .sort(
      (a, b) =>
        a.verfall.localeCompare(b.verfall) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.chargeId.localeCompare(b.chargeId) ||
        a.ortSortierung - b.ortSortierung ||
        a.lagerortId.localeCompare(b.lagerortId),
    );
  const teile: FefoTeil[] = [];
  for (const c of sortiert) {
    if (rest <= 0) break;
    const nimm = Math.min(c.rest, rest);
    rest -= nimm;
    teile.push({ chargeId: c.chargeId, menge: nimm, vonLagerortId: c.lagerortId });
  }
  return teile;
}
```

- [ ] **Schritt 4: Die Brücke in `abbuchung.ts` setzen**

`fefoAbbuchung` baut die `ChargeRest`-Objekte und kennt die zwei neuen Felder noch nicht — der
Baum übersetzt sonst nach dieser Aufgabe nicht. Eine verhaltensgleiche Zeile, die Aufgabe 6
wieder ersetzt:

```ts
  const chargenRest: ChargeRest[] = chs.map((c) => ({
    chargeId: c.id, verfall: c.verfall, rest: rest.get(c.id) ?? 0, createdAt: c.createdAt,
    // BRÜCKE (DRK-297, Aufgabe 5→6): heute bucht der Kern gegen genau einen Ort,
    // also ist der Ort jedes Teils dieser eine. Aufgabe 6 macht daraus den Bereich.
    lagerortId, ortSortierung: 0,
  }));
```

Die `teile`-Verwendung in `umlagerung.ts` bleibt in dieser Aufgabe unangetastet: sie liest nur
`chargeId` und `menge`.

- [ ] **Schritt 5: Tests und Tore laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/ && pnpm typecheck; echo "exit=$status"
```

Erwartet: PASS und `exit=0`. **Das Verhalten ist nach dieser Aufgabe unverändert** — der vierte
Sortierrang ist vorhanden und greift noch nirgends, weil alle Teile denselben Ort tragen. Genau
das macht die Aufgabe für sich abnehmbar.

- [ ] **Schritt 6: Committen**

```bash
git add src/app/m/lagerbuch/_lib/domain/fefo.ts src/app/m/lagerbuch/_db/fefo.test.ts
git commit -m "feat(lagerbuch): FEFO kennt den Ort, an dem die Charge liegt

DRK-297. Vierter Sortierrang hinter Verfall, Alter und Charge: liegt dieselbe
Charge in zwei Schraenken, greift die Entnahme zuerst in den bequemeren. Das
Verfallsdatum bleibt das erste Kriterium.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 6: Der Abbuchungskern bucht über einen Bereich

Das ist die Aufgabe gegen die gemessene stille Null-Entnahme.

**Dateien:**
- Ändern: `src/app/m/lagerbuch/_lib/schreibpfade/abbuchung.ts`
- Ändern: `src/app/m/lagerbuch/_lib/schreibpfade/umlagerung.ts`
- Test: `src/app/m/lagerbuch/_db/abbuchung.test.ts` (Datei anlegen, falls nicht vorhanden —
  vorher `ls src/app/m/lagerbuch/_db/` prüfen und die vorhandene nutzen)

**Schnittstellen:**
- Verbraucht: `fefoVerteilung`, `ChargeRest`, `FefoTeil` (Aufgabe 5); `restJeChargeUndOrt` und
  `handlagerOrte` (Aufgaben 3, 4); `ortStamm` für `ortSortierung`.
- Liefert: `fefoAbbuchung(tx, { artikelId, menge, orte?, quelle, kommentar, referenz, typ? }):
  { gebucht: number; teile: FefoTeil[] }`.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

```ts
describe("DRK-297 — Abbuchung ueber den Handlager-Bereich", () => {
  /** DER BEFUND AUS DEM TICKET: 12 Stueck im Schrank, Entnahme ueber den
   *  Handlager. Vor dieser Aenderung: `gebucht: 0`, ohne Fehler. */
  it("nimmt Bestand aus einem Schrank, nicht nur von der Wurzel", () => {
    const ergebnis = t.db.transaction((tx) => fefoAbbuchung(tx, {
      artikelId: ARTIKEL_A, menge: 3, orte: handlagerOrte(tx),
      quelle: { quelleTyp: "system", quelleId: "test" }, kommentar: null, referenz: null,
    }));
    expect(ergebnis.gebucht).toBe(3);
    expect(ergebnis.teile[0]?.vonLagerortId).toBe("schrank-1");
  });

  it("die Buchung traegt den Schrank, nicht die Wurzel", () => {
    t.db.transaction((tx) => fefoAbbuchung(tx, {
      artikelId: ARTIKEL_A, menge: 3, orte: handlagerOrte(tx),
      quelle: { quelleTyp: "system", quelleId: "test" }, kommentar: null, referenz: null,
    }));
    const abgang = t.db.select().from(buchungen)
      .where(and(eq(buchungen.artikelId, ARTIKEL_A), lt(buchungen.menge, 0))).all();
    expect(abgang.map((b) => b.lagerortId)).toEqual(["schrank-1"]);
  });

  /** ⚠️ DIE GEFAEHRLICHSTE ZEILE DES UMBAUS: das Ziel-Leg darf NIE den
   *  Quellort nehmen. Sonst ist die Umlagerung netto null, wirft nicht — und
   *  das Fahrzeug bleibt leer. */
  it("die Umlagerung schreibt die Gutschrift ans Ziel, nicht in den Quellschrank", () => {
    const ergebnis = t.db.transaction((tx) => umlagerung(tx, {
      artikelId: ARTIKEL_A, menge: 4, vonOrten: handlagerOrte(tx), nachLagerortId: RTW1,
      quelle: { quelleTyp: "system", quelleId: "test" }, kommentar: null, referenz: null,
    }));
    expect(ergebnis.umgelagert).toBe(4);
    const amZiel = t.db.select().from(buchungen)
      .where(and(eq(buchungen.lagerortId, RTW1), gt(buchungen.menge, 0))).all();
    expect(amZiel.reduce((s, b) => s + b.menge, 0)).toBe(4);
    const imSchrank = t.db.select().from(buchungen)
      .where(eq(buchungen.lagerortId, "schrank-1")).all()
      .reduce((s, b) => s + b.menge, 0);
    expect(imSchrank).toBe(8); // 12 − 4
  });
});
```

⚠️ `umlagerung` heißt sein Quellfeld ab Schritt 4 `vonOrten` (Liste) statt `vonLagerortId`
(eine ID). Der Test oben steht bereits auf der neuen Signatur und ist deshalb vor Schritt 4 **auch
ein Typfehler**, nicht nur ein roter Test — das ist beabsichtigt.

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/abbuchung.test.ts
```

Erwartet: FAIL.

- [ ] **Schritt 3: `fefoAbbuchung` umstellen**

```ts
import { and, eq, inArray } from "drizzle-orm";
import { buchungen, chargen, newId } from "../../_db/schema";
import { fefoVerteilung, type ChargeRest, type FefoTeil } from "../domain/fefo";
import { handlagerOrte, ortStamm } from "../lesepfade/orte";
```

```ts
export type Teil = FefoTeil;

/**
 * Verteilt `menge` FEFO über die Chargen des Artikels IN EINEM BEREICH von
 * Orten (Rest > 0, aufsteigender Verfall), kappt am dortigen Bestand und
 * schreibt je (Charge, Ort) EINE Abgangsbuchung — auf den Ort, an dem der
 * Bestand wirklich liegt.
 *
 * ⚠️ DER BEREICH IST DER GRUND DIESER ÄNDERUNG (DRK-297). Vorher scopte die
 * Funktion auf EINE `lagerortId`; lag der Bestand in einem Schrank, lieferte
 * sie `gebucht: 0` und `teile: []` — ohne Fehler, ohne Log. Gemessen an einem
 * Artikel mit 12 Stück im Schrank und einer Anforderung über 3.
 *
 * ⚠️ FÜR EIN FAHRZEUG IST DER BEREICH EINELEMENTIG (`[fahrzeugId]`). Wer dort
 * `handlagerOrte` einsetzt, bucht Handlagerbestand vom Fahrzeug ab.
 */
export function fefoAbbuchung(
  tx: Tx,
  args: {
    artikelId: string;
    menge: number;
    orte?: readonly string[];
    quelle: Quelle;
    kommentar: string | null;
    referenz: string | null;
    typ?: "entnahme" | "korrektur" | "umlagerung";
  },
): { gebucht: number; teile: Teil[] } {
  const {
    artikelId, menge, orte = handlagerOrte(tx), quelle, kommentar, referenz,
    typ = "entnahme",
  } = args;

  const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  const stamm = ortStamm(tx);
  // EINE aggregierende Abfrage je (Charge, Ort) MIT Bereichs-Prädikat.
  const rows = tx
    .select({
      chargeId: buchungen.chargeId,
      lagerortId: buchungen.lagerortId,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .where(and(eq(buchungen.artikelId, artikelId), inArray(buchungen.lagerortId, [...orte])))
    .groupBy(buchungen.chargeId, buchungen.lagerortId)
    .all();

  const chargeNach = new Map(chs.map((c) => [c.id, c]));
  const chargenRest: ChargeRest[] = [];
  for (const r of rows) {
    const c = chargeNach.get(r.chargeId);
    if (!c || r.summe <= 0) continue;
    chargenRest.push({
      chargeId: c.id, verfall: c.verfall, rest: r.summe, createdAt: c.createdAt,
      lagerortId: r.lagerortId, ortSortierung: stamm.get(r.lagerortId)?.sortierung ?? 0,
    });
  }

  const teile = fefoVerteilung(chargenRest, menge);
  let gebucht = 0;
  for (const teil of teile) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ, artikelId, chargeId: teil.chargeId,
      // DER ORT DES TEILS, nicht die Wurzel des Bereichs.
      lagerortId: teil.vonLagerortId,
      // VORZEICHENBEHAFTET: ein Abgang ist negativ.
      menge: -teil.menge,
      quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId, referenz, kommentar,
    }).run();
    gebucht += teil.menge;
  }
  return { gebucht, teile };
}
```

`sql` aus `drizzle-orm` mit importieren.

- [ ] **Schritt 4: `umlagerung` anpassen**

`vonLagerortId: string` wird zu `vonOrten: readonly string[]`; das Ziel-Leg bleibt `nachLagerortId`:

```ts
export function umlagerung(
  tx: Tx,
  args: {
    artikelId: string;
    menge: number;
    /** DRK-297 — die QUELLE ist ein Bereich (Handlager plus Schränke) oder ein
     *  einzelnes Fahrzeug als einelementige Liste. */
    vonOrten: readonly string[];
    nachLagerortId: string;
    quelle: Quelle;
    kommentar: string | null;
    referenz: string | null;
  },
): { umgelagert: number; teile: Teil[] } {
  const { artikelId, menge, vonOrten, nachLagerortId, quelle, kommentar, referenz } = args;

  const { gebucht, teile } = fefoAbbuchung(tx, {
    artikelId, menge, orte: vonOrten, quelle, kommentar, referenz, typ: "umlagerung",
  });

  // ⚠️ STRIKT AUS `teile[]` — nie aus `menge`. Sonst Netto != 0.
  // ⚠️ UND STRIKT AUF `nachLagerortId` — NIE auf `teil.vonLagerortId`. Das
  // Ziel-Leg mit dem Quellort schriebe die Gutschrift in den Schrank zurück,
  // aus dem sie kam: netto null, kein Fehler, Fahrzeug leer.
  for (const teil of teile) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ: "umlagerung", artikelId,
      chargeId: teil.chargeId, lagerortId: nachLagerortId, menge: teil.menge,
      quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId, referenz, kommentar,
    }).run();
  }
  return { umgelagert: gebucht, teile };
}
```

- [ ] **Schritt 5: Aufrufer nachziehen**

```bash
pnpm typecheck; echo "exit=$status"
```

`_actions/buchung.ts` (`vonLagerortId: HANDLAGER_ID` → `vonOrten: handlagerOrte(tx)`),
`_actions/check.ts` (`vonLagerortId: HANDLAGER_ID` → `vonOrten: handlagerOrte(tx)`),
`_actions/inventur.ts` (`lagerortId: HANDLAGER_ID` → `orte: handlagerOrte(tx)`),
`_lib/seedLokal.ts`. **Fahrzeug-Rückläufe** behalten ihr Fahrzeug als einelementige Liste.

- [ ] **Schritt 6: Alle Tests laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/ && pnpm typecheck; echo "exit=$status"
```

- [ ] **Schritt 7: Committen**

```bash
git add src/app/m/lagerbuch/
git commit -m "fix(lagerbuch): die Entnahme findet Bestand auch im Schrank

DRK-297. Vorher meldete fefoAbbuchung „0 gebucht\" ohne Fehler, sobald der
Bestand nicht auf der Handlager-Wurzel lag — gemessen an 12 Stueck im Schrank
gegen eine Anforderung ueber 3. Das Ziel-Leg der Umlagerung nimmt weiterhin den
Zielort, nie den Quellort.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 7: Aussondern bucht dort, wo der Bestand liegt

**Dateien:**
- Ändern: `src/app/m/lagerbuch/_actions/aussondern.ts:55-85`
- Test: `src/app/m/lagerbuch/_actions/aussondern.test.ts` (vorhandene Datei erweitern; sonst neu)

**Schnittstellen:** keine neuen Exporte.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
it("sondert eine Charge aus zwei Schraenken mit je einer Buchung aus", async () => {
  // 4 Stueck in schrank-1, 6 in schrank-gf, beide abgelaufen.
  const ergebnis = await aussondern({ chargeId: CHARGE_ABGELAUFEN, kommentar: "MHD" }, t.db);
  expect(ergebnis.ok).toBe(true);
  const korrekturen = t.db.select().from(buchungen)
    .where(and(eq(buchungen.chargeId, CHARGE_ABGELAUFEN), eq(buchungen.typ, "korrektur"))).all();
  expect(korrekturen.map((b) => [b.lagerortId, b.menge]).sort())
    .toEqual([["schrank-1", -4], ["schrank-gf", -6]].sort());
});

/** ⚠️ EINE EINZIGE BUCHUNG AUF DIE WURZEL waere plausibel und still falsch:
 *  die Wurzel selbst traegt gar keinen Bestand, ihr Saldo liefe ins Minus,
 *  waehrend die Schraenke voll bleiben. */
it("bucht nichts auf die Wurzel, wenn dort nichts liegt", async () => {
  await aussondern({ chargeId: CHARGE_ABGELAUFEN, kommentar: "MHD" }, t.db);
  const anDerWurzel = t.db.select().from(buchungen)
    .where(and(eq(buchungen.chargeId, CHARGE_ABGELAUFEN), eq(buchungen.lagerortId, HANDLAGER_ID))).all();
  expect(anDerWurzel).toEqual([]);
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/aussondern.test.ts
```

Erwartet: FAIL — heute entsteht **eine** Buchung auf `handlager` mit `-10`.

- [ ] **Schritt 3: Die Aktion umstellen**

Den Block ab `const chargeBuchungen = …` ersetzen:

```ts
        // DRK-297 — der Rest je ORT, nicht als eine Summe über den Bereich.
        // EINE Abfrage, `GROUP BY lagerort_id`, mit Bereichs-Prädikat.
        const orte = handlagerOrte(tx);
        const jeOrt = tx
          .select({
            lagerortId: buchungen.lagerortId,
            summe: sql<number>`sum(${buchungen.menge})`,
          })
          .from(buchungen)
          .where(and(
            eq(buchungen.chargeId, charge.id),
            inArray(buchungen.lagerortId, [...orte]),
          ))
          .groupBy(buchungen.lagerortId)
          .all();

        const gesamt = jeOrt.reduce((s, z) => s + z.summe, 0);
        if (gesamt <= 0) return "Charge hat keinen Restbestand im Handlager.";

        for (const zeile of jeOrt) {
          // ⚠️ EIN ORT MIT REST 0 ODER WENIGER BEKOMMT KEINE ZEILE. Eine
          // Buchung über 0 stünde im Journal und sagte nichts; eine über eine
          // negative Zahl drehte das Vorzeichen um und schriebe Bestand ZU.
          if (zeile.summe <= 0) continue;
          tx.insert(buchungen).values({
            id: newId(), ts: jetzt, typ: "korrektur", artikelId: charge.artikelId,
            chargeId: charge.id, lagerortId: zeile.lagerortId, menge: -zeile.summe,
            quelleTyp: "oidc", quelleId: viewer.sub, referenz: null, kommentar: v.kommentar,
          }).run();
        }
        return null;
```

Importe ergänzen: `handlagerOrte` aus `../_lib/lesepfade/orte`, dazu `inArray` und `sql` aus
`drizzle-orm`. `bestandProLagerortUndCharge` und `HANDLAGER_ID` entfallen hier, falls sie danach
unbenutzt sind — `lint` meldet die unbenutzte Bindung.

- [ ] **Schritt 4: Tests laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/
```

- [ ] **Schritt 5: Committen**

```bash
git add src/app/m/lagerbuch/_actions/aussondern.ts src/app/m/lagerbuch/_actions/aussondern.test.ts
git commit -m "fix(lagerbuch): Aussondern bucht je Schrank statt einmal auf die Wurzel

DRK-297. Eine einzige Buchung auf den Handlager waere plausibel und still
falsch: die Wurzel traegt keinen Bestand, ihr Saldo liefe ins Minus, waehrend
die Schraenke voll blieben.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 8: Server Actions für Schränke

**Dateien:**
- Neu: `src/app/m/lagerbuch/_actions/lagerorte.ts`
- Test: `src/app/m/lagerbuch/_actions/lagerorte.test.ts`

**Schnittstellen:**
- Liefert:
  - `createSchrank(eingabe, db?): Promise<ActionErgebnis<{ id: string }>>`
  - `updateSchrank(eingabe, db?): Promise<ActionErgebnis>`
  - `setSchrankAktiv(eingabe, db?): Promise<ActionErgebnis>`
- Eingabeform: `{ name: string; zugangshinweis?: string; sortierung?: number }` bzw. mit `id`.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

```ts
describe("createSchrank", () => {
  it("legt einen Schrank unter dem Handlager an", async () => {
    const e = await createSchrank({ name: "Schrank 1", sortierung: 10 }, t.db);
    expect(e.ok).toBe(true);
    const zeile = t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, (e as { wert: { id: string } }).wert.id)).get();
    expect(zeile?.parentId).toBe(HANDLAGER_ID);
    expect(zeile?.typ).toBe("lager");
    expect(zeile?.aktiv).toBe(true);
  });

  /** `null` heisst „kein Hinweis" — nie ein Leerstring. Ein Leerstring
   *  renderte spaeter ein leeres Hinweis-Abzeichen. */
  it("macht aus einem leeren Hinweis null", async () => {
    const e = await createSchrank({ name: "Schrank 2", zugangshinweis: "   " }, t.db);
    const zeile = t.db.select().from(lagerorte)
      .where(eq(lagerorte.id, (e as { wert: { id: string } }).wert.id)).get();
    expect(zeile?.zugangshinweis).toBeNull();
  });

  it("weist einen leeren Namen ab", async () => {
    expect(await createSchrank({ name: "  " }, t.db)).toMatchObject({ ok: false });
  });
});

describe("setSchrankAktiv", () => {
  it("legt einen Schrank still, ohne seinen Bestand anzufassen", async () => {
    await setSchrankAktiv({ id: "schrank-1", aktiv: false }, t.db);
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, "schrank-1")).get()?.aktiv)
      .toBe(false);
    expect(bestandJeArtikel(t.db, handlagerOrte(t.db)).get(ARTIKEL_A)).toBe(12);
  });

  /** Die Wurzel ist der feste Bezugspunkt jeder Buchung. */
  it("legt den Handlager selbst nicht still", async () => {
    expect(await setSchrankAktiv({ id: HANDLAGER_ID, aktiv: false }, t.db))
      .toMatchObject({ ok: false });
  });

  it("fasst ein Fahrzeug nicht an", async () => {
    expect(await setSchrankAktiv({ id: RTW1, aktiv: false }, t.db))
      .toMatchObject({ ok: false });
  });
});
```

Die Tests brauchen einen gemockten Admin-Zugang. **Das Muster aus
`src/app/m/lagerbuch/_actions/fahrzeuge.test.ts` übernehmen** (dieselbe `vi.mock`-Form für
`requireLagerbuchAdmin`), keine zweite Vorrichtung erfinden.

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/lagerorte.test.ts
```

- [ ] **Schritt 3: Die Aktionen schreiben**

```ts
"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { lagerorte, newId } from "../_db/schema";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const LAGERORTE_PFAD = "/m/lagerbuch/verwaltung/lagerorte";
const ARTIKEL_PFAD = "/m/lagerbuch/verwaltung/artikel";

function validierungsFehler(e: unknown): Extract<ActionErgebnis, { ok: false }> {
  const feldFehler = zodFehler(e);
  return {
    ok: false,
    fehler: "Bitte die markierten Felder prüfen.",
    ...(feldFehler ? { feldFehler } : {}),
  };
}

const SchrankSchema = z.object({
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  zugangshinweis: z.string().trim().optional(),
  sortierung: z.coerce.number().int().default(0),
});

export async function createSchrank(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis<{ id: string }>> => {
    let v: z.output<typeof SchrankSchema>;
    try {
      v = SchrankSchema.parse(eingabe);
    } catch (e) {
      return validierungsFehler(e);
    }

    const id = newId();
    try {
      db.insert(lagerorte).values({
        id,
        name: v.name,
        typ: "lager",
        kennung: null,
        aktiv: true,
        // Ein Schrank haengt IMMER am Handlager. Eine freie Elternwahl gaebe es
        // erst mit einem zweiten Lager — das gibt es heute nicht, und ein Feld
        // ohne zweite Wahl ist eine Frage ohne Antwortmoeglichkeit.
        parentId: HANDLAGER_ID,
        // Leerstring heisst „kein Hinweis" und wird zu null: ein leerer String
        // renderte spaeter ein leeres Hinweis-Abzeichen.
        zugangshinweis: v.zugangshinweis || null,
        sortierung: v.sortierung,
      }).run();
    } catch {
      return { ok: false, fehler: "Schrank konnte nicht angelegt werden." };
    }

    revalidatePath(LAGERORTE_PFAD);
    revalidatePath(ARTIKEL_PFAD);
    return { ok: true, wert: { id } };
  });
}

/**
 * Findet einen Schrank — also einen Ort, der AM HANDLAGER HAENGT. Die Wurzel
 * selbst und jedes Fahrzeug fallen durch: beide haben `parent_id IS NULL`.
 */
function findeSchrank(db: DB, id: string) {
  return db.select().from(lagerorte)
    .where(and(eq(lagerorte.id, id), eq(lagerorte.parentId, HANDLAGER_ID)))
    .get();
}

const UpdateSchema = SchrankSchema.extend({ id: z.string().min(1) });

export async function updateSchrank(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis> => {
    let v: z.output<typeof UpdateSchema>;
    try {
      v = UpdateSchema.parse(eingabe);
    } catch (e) {
      return validierungsFehler(e);
    }

    if (!findeSchrank(db, v.id)) return { ok: false, fehler: "Schrank nicht gefunden." };

    try {
      db.update(lagerorte)
        .set({ name: v.name, zugangshinweis: v.zugangshinweis || null, sortierung: v.sortierung })
        .where(eq(lagerorte.id, v.id))
        .run();
    } catch {
      return { ok: false, fehler: "Schrank konnte nicht gespeichert werden." };
    }

    revalidatePath(LAGERORTE_PFAD);
    revalidatePath(ARTIKEL_PFAD);
    return { ok: true };
  });
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });

/**
 * ⚠️ STILLLEGEN NIMMT KEINEN BESTAND WEG. Ein inaktiver Schrank bleibt im
 * Handlager-Bereich; sein Bestand zaehlt weiter und wird weiter entnommen.
 * Alles andere liesse beim Umraeumen Material verschwinden. „Inaktiv" heisst
 * allein: taucht in der Zugangsauswahl nicht mehr auf.
 */
export async function setSchrankAktiv(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis> => {
    let v: z.output<typeof AktivSchema>;
    try {
      v = AktivSchema.parse(eingabe);
    } catch {
      return { ok: false, fehler: "Ungültige Eingabe." };
    }

    // Der Riegel deckt Wurzel UND Fahrzeug ab, weil beide `parent_id IS NULL`
    // tragen — eine ausdrueckliche Meldung ist trotzdem besser als „nicht
    // gefunden", weil der Handlager der haeufigere Fehlgriff ist.
    if (v.id === HANDLAGER_ID) {
      return { ok: false, fehler: "Das Handlager ist der feste Bezugspunkt jeder Buchung und kann nicht stillgelegt werden." };
    }
    if (!findeSchrank(db, v.id)) return { ok: false, fehler: "Schrank nicht gefunden." };

    try {
      db.update(lagerorte).set({ aktiv: v.aktiv }).where(eq(lagerorte.id, v.id)).run();
    } catch {
      return { ok: false, fehler: "Schrankstatus konnte nicht geändert werden." };
    }

    revalidatePath(LAGERORTE_PFAD);
    revalidatePath(ARTIKEL_PFAD);
    return { ok: true };
  });
}
```

- [ ] **Schritt 4: Tests laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/lagerorte.test.ts
```

- [ ] **Schritt 5: Committen**

```bash
git add src/app/m/lagerbuch/_actions/lagerorte.ts src/app/m/lagerbuch/_actions/lagerorte.test.ts
git commit -m "feat(lagerbuch): Schraenke anlegen, aendern und stilllegen

DRK-297. Stilllegen nimmt keinen Bestand weg — der Schrank bleibt im
Handlager-Bereich und taucht nur in der Zugangsauswahl nicht mehr auf.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 9: Die Seite „Verwaltung → Lagerorte"

**Dateien:**
- Neu: `src/app/m/lagerbuch/verwaltung/(arbeit)/lagerorte/page.tsx`
- Neu: `src/app/m/lagerbuch/verwaltung/(arbeit)/lagerorte/LagerorteListe.tsx`
- Test: `src/app/m/lagerbuch/verwaltung/(arbeit)/lagerorte/LagerorteListe.test.tsx`
- Ändern: `src/core/shell/types.ts` (Union `NavIkonName`), `src/core/shell/navIkonen.tsx`,
  `src/app/m/lagerbuch/_lib/nav.ts`

**Schnittstellen:**
- Verbraucht: `handlagerSchraenke` (Aufgabe 3), die drei Aktionen (Aufgabe 8).
- Liefert: `type LagerortZeile = { id: string; name: string; zugangshinweis: string | null;
  sortierung: number; aktiv: boolean; bestandsposten: number }`.

- [ ] **Schritt 1: Den Navigationseintrag setzen**

In `src/core/shell/types.ts` die Union erweitern:

```ts
  | "tokens" | "etiketten" | "import" | "ausleihen" | "update" | "versionen"
  // DRK-297: die Schraenke des Handlagers. KEIN geliehener Name — `artikel`
  // (PiPackage) meint das Material, nicht den Ort, an dem es liegt, und
  // `fahrzeuge` ist der andere Lagerorttyp. Dieselbe Begruendung wie bei den
  // Zeichen, die `radio`, `uav` und `zeichen` mitgebracht haben.
  | "lagerorte"
```

In `src/core/shell/navIkonen.tsx` den Import und den Eintrag ergänzen (`PiLockers` ist ein
Schrank mit Fächern und existiert in `react-icons/pi`):

```ts
  PiUsersThree, PiListChecks, PiDrone, PiLockers,
```

```ts
  lagerorte: PiLockers,
```

In `src/app/m/lagerbuch/_lib/nav.ts` hinter „Bestellung", also im Abschnitt „Bestand":

```ts
  { key: "lagerorte", title: "Lagerorte", href: "/verwaltung/lagerorte", ikon: "lagerorte", abschnitt: "Bestand" },
```

- [ ] **Schritt 2: Den fehlschlagenden DOM-Test schreiben**

Das Harness ist `src/app/m/qr/_lib/test-dom.tsx` (`mount`/`fill`/`click`/`query`/`submitForm`) —
**kein zweites erfinden**. Als Vorlage dient `FahrzeugeListe.test.tsx`.

```ts
import { describe, it, expect, vi } from "vitest";
import { mount, click, query } from "@/app/m/qr/_lib/test-dom";
import { LagerorteListe, type LagerortZeile } from "./LagerorteListe";

const ZEILEN: LagerortZeile[] = [
  { id: "schrank-1", name: "Schrank 1", zugangshinweis: null, sortierung: 10, aktiv: true, bestandsposten: 4 },
  { id: "schrank-gf", name: "GF-Schrank", zugangshinweis: "Zugang über LvD — anrufen", sortierung: 90, aktiv: true, bestandsposten: 2 },
  { id: "schrank-alt", name: "Altschrank", zugangshinweis: null, sortierung: 50, aktiv: false, bestandsposten: 0 },
];

describe("LagerorteListe", () => {
  it("zeigt jeden Schrank in der gepflegten Reihenfolge", () => {
    const { container } = mount(<LagerorteListe zeilen={ZEILEN} />);
    const namen = [...container.querySelectorAll("[data-row-key]")]
      .map((tr) => tr.getAttribute("data-row-key"));
    expect(namen).toEqual(["schrank-1", "schrank-alt", "schrank-gf"]);
  });

  it("zeigt den Zugangshinweis im Klartext, nicht nur als Zeichen", () => {
    const { container } = mount(<LagerorteListe zeilen={ZEILEN} />);
    expect(container.textContent).toContain("Zugang über LvD — anrufen");
  });

  /** Ein stillgelegter Schrank mit Bestand ist der Normalfall beim Umraeumen —
   *  die Seite muss sagen, dass dort noch etwas liegt. */
  it("kennzeichnet stillgelegte Schraenke", () => {
    const { container } = mount(<LagerorteListe zeilen={ZEILEN} />);
    const zeile = container.querySelector('[data-row-key="schrank-alt"]');
    expect(zeile?.textContent).toContain("Stillgelegt");
  });
});
```

- [ ] **Schritt 3: Test laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/lagerorte/LagerorteListe.test.tsx"
```

- [ ] **Schritt 4: Die Client-Insel schreiben**

`LagerorteListe.tsx` beginnt mit `"use client"`. Sie enthält die Tabelle (über `Datentabelle` aus
`core/tabelle`, `rowKey="id"`), ein Formular zum Anlegen und je Zeile „Bearbeiten" und
„Stilllegen"/„Wieder aufnehmen". Die `render`-Funktionen der Spalten leben **hier** und nicht in
der Server Component (Falle 9). Die Spalten:

| Spalte | Inhalt |
| --- | --- |
| Name | `name`, bei `aktiv: false` zusätzlich ein Chip „Stillgelegt" |
| Zugangshinweis | `zugangshinweis` im Klartext, bei `null` ein gedämpftes „—" |
| Reihenfolge | `sortierung`, rechtsbündig; Hilfetext „kleiner heißt: wird zuerst gegriffen" |
| Posten | `bestandsposten` — wie viele Chargen dort Bestand haben |
| Aktionen | Bearbeiten · Stilllegen / Wieder aufnehmen |

⚠️ **`size` auf keinem Bedienelement setzen** (Falle 4). ⚠️ Kein `Typography.Title`,
`Form.Item`-Compound o. ä. in der Server Component — hier ist es erlaubt, weil die Datei Client ist.

- [ ] **Schritt 5: Die Server Component schreiben**

`page.tsx` nach dem Vorbild von `fahrzeuge/page.tsx`:

```tsx
import { getDb, type DB } from "../../../_db/client";
import { handlagerSchraenke } from "../../../_lib/lesepfade/orte";
import { sql } from "drizzle-orm";
import { buchungen } from "../../../_db/schema";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { LagerorteListe, type LagerortZeile } from "./LagerorteListe";

export const dynamic = "force-dynamic";

export function lagerorteSeitenInhalt(db: DB) {
  const schraenke = handlagerSchraenke(db);
  /*
   * Ein Posten = eine Charge mit Rest > 0 an diesem Ort. Die Zahl beantwortet
   * die einzige Frage, die beim Stilllegen zaehlt: „liegt da noch etwas?"
   *
   * ⚠️ EINE ABFRAGE, NICHT EINE JE CHARGE. `better-sqlite3` ist SYNCHRON — eine
   * Schleife mit einer Abfrage je Charge blockierte bei ein paar tausend Chargen
   * die GANZE Suite, nicht nur dieses Modul. Dieselbe Form wie
   * `bestandJeArtikelUndLagerort`.
   */
  const posten = new Map<string, number>();
  const salden = db
    .select({
      lagerortId: buchungen.lagerortId,
      chargeId: buchungen.chargeId,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .groupBy(buchungen.lagerortId, buchungen.chargeId)
    .all();
  for (const zeile of salden) {
    if (zeile.summe <= 0) continue;
    posten.set(zeile.lagerortId, (posten.get(zeile.lagerortId) ?? 0) + 1);
  }

  const zeilen: LagerortZeile[] = schraenke.map((o) => ({
    id: o.id, name: o.name, zugangshinweis: o.zugangshinweis,
    sortierung: o.sortierung, aktiv: o.aktiv, bestandsposten: posten.get(o.id) ?? 0,
  }));

  return (
    <>
      <SeitenKopf
        titel="Lagerorte"
        beschreibung="Die Schränke im Handlager, ihre Reihenfolge und ihre Zugangshinweise."
      />
      <LagerorteListe zeilen={zeilen} />
    </>
  );
}

export default function LagerorteSeite() {
  return lagerorteSeitenInhalt(getDb());
}
```

- [ ] **Schritt 6: Tests und Tore laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/ src/core/shell/ && pnpm typecheck; echo "exit=$status"
```

⚠️ `src/core/shell/icons.test.ts` und der Navigationstest laufen mit — ein Union-Mitglied ohne
Eintrag in `NAV_IKONEN` ist ein `typecheck`-Fehler, kein roter Test.

- [ ] **Schritt 7: Committen**

```bash
git add src/app/m/lagerbuch/ src/core/shell/
git commit -m "feat(lagerbuch): Verwaltungsseite fuer die Schraenke des Handlagers

DRK-297. Name, Zugangshinweis und Reihenfolge je Schrank; die Reihenfolge ist
fachlich und entscheidet bei gleichem Verfall, welcher Ort zuerst gegriffen
wird.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 10: Der Zugang bekommt einen Zielort

**Dateien:**
- Ändern: `src/app/m/lagerbuch/_actions/buchung.ts` (Zugang-Schema und -Aktion)
- Ändern: `src/app/m/lagerbuch/_ui/ArtikelDrawer.tsx` (Zugang-Formular, ca. Zeile 520-560)
- Ändern: `src/app/m/lagerbuch/_actions/detail.ts` (die Auswahlliste mitliefern)
- Test: `src/app/m/lagerbuch/_actions/buchung.test.ts`

**Schnittstellen:**
- `ZugangSchema` bekommt `zielLagerortId: z.string().min(1).optional()`.
- `ArtikelDetailResult` bekommt
  `zielOrte: { id: string; name: string; zugangshinweis: string | null }[]` — die aktiven
  Handlager-Orte, Wurzel zuerst.

⚠️ **Das Feld heißt `zielOrte`, nicht `orte`.** Aufgabe 11 legt an derselben Antwort ein Feld
`orte` an — die VERTEILUNG einer Charge. Zwei Felder namens `orte` mit verschiedener Bedeutung in
einem Objektbaum sind der zuverlässigste Weg, dass jemand ins falsche greift.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

```ts
describe("bucheZugang mit Zielort (DRK-297)", () => {
  it("bucht in den gewaehlten Schrank", async () => {
    await bucheZugang({ artikelId: ARTIKEL_A, menge: 5, chargeId: CHARGE_A, zielLagerortId: "schrank-1" }, t.db);
    const zeile = t.db.select().from(buchungen)
      .where(and(eq(buchungen.chargeId, CHARGE_A), eq(buchungen.typ, "zugang"))).all().at(-1);
    expect(zeile?.lagerortId).toBe("schrank-1");
  });

  it("ohne Zielort landet der Zugang auf der Wurzel", async () => {
    await bucheZugang({ artikelId: ARTIKEL_A, menge: 5, chargeId: CHARGE_A }, t.db);
    const zeile = t.db.select().from(buchungen)
      .where(and(eq(buchungen.chargeId, CHARGE_A), eq(buchungen.typ, "zugang"))).all().at(-1);
    expect(zeile?.lagerortId).toBe(HANDLAGER_ID);
  });

  /** DREI BEDINGUNGEN, EIN SATZ — dieselbe Form wie bei `bucheEntnahme`:
   *  ohne die Pruefung entschiede der Fremdschluessel und meldete
   *  „FOREIGN KEY constraint failed", was der Verwaltenden nichts sagt. */
  it("weist ein Fahrzeug als Zugangsziel ab", async () => {
    expect(await bucheZugang({ artikelId: ARTIKEL_A, menge: 5, chargeId: CHARGE_A, zielLagerortId: RTW1 }, t.db))
      .toMatchObject({ ok: false });
  });

  it("weist einen stillgelegten Schrank ab", async () => {
    expect(await bucheZugang({ artikelId: ARTIKEL_A, menge: 5, chargeId: CHARGE_A, zielLagerortId: "schrank-alt" }, t.db))
      .toMatchObject({ ok: false });
  });
});
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/buchung.test.ts
```

- [ ] **Schritt 3: Die Aktion umstellen**

Im Zugang-Schema ergänzen:

```ts
  /**
   * DRK-297 — der Schrank, in den die Ware kommt. Fehlt er, landet der Zugang
   * auf der Handlager-Wurzel; das heisst „Schrank noch nicht zugeordnet" und
   * ist genau das, was jede Altbuchung bedeutet.
   */
  zielLagerortId: z.string().min(1).optional(),
```

Im Transaktionsblock vor dem `insert`:

```ts
        const ziel = v.zielLagerortId ?? HANDLAGER_ID;
        if (ziel !== HANDLAGER_ID) {
          // DREI BEDINGUNGEN, EIN SATZ: existiert der Ort, haengt er am
          // Handlager, ist er aktiv? Ohne diese Pruefung entschiede der
          // Fremdschluessel — und der meldet „FOREIGN KEY constraint failed".
          const ort = tx.select().from(lagerorte).where(eq(lagerorte.id, ziel)).get();
          if (!ort || ort.parentId !== HANDLAGER_ID || !ort.aktiv) {
            throw new Error("Ziel ist kein gültiger, aktiver Schrank im Handlager");
          }
        }
```

und im `values`-Objekt `lagerortId: HANDLAGER_ID` durch `lagerortId: ziel` ersetzen.

- [ ] **Schritt 4: Die Auswahlliste durchreichen**

In `_actions/detail.ts` dem Rückgabewert ein Feld hinzufügen:

```ts
      // Nur AKTIVE Orte — ein stillgelegter Schrank bleibt im Bestand, ist aber
      // kein Ziel mehr. Die Wurzel steht ausdrücklich darin.
      zielOrte: [
        { id: HANDLAGER_ID, name: "Handlager (ohne Schrank)", zugangshinweis: null },
        ...handlagerSchraenke(db, true).map((o) => ({
          id: o.id, name: o.name, zugangshinweis: o.zugangshinweis,
        })),
      ],
```

- [ ] **Schritt 5: Das Formular ergänzen**

In `_ui/ArtikelDrawer.tsx` im Zugang-Formular hinter dem Chargenfeld:

```tsx
                <Form.Item
                  name="zielLagerortId"
                  label="Wohin"
                  rules={[{ required: true, message: "Bitte einen Ort wählen" }]}
                  extra="„Handlager (ohne Schrank)" heißt: noch nicht einsortiert."
                >
                  <Select
                    aria-label="Wohin"
                    showSearch
                    optionFilterProp="label"
                    options={detail.zielOrte.map((o) => ({ value: o.id, label: o.name }))}
                  />
                </Form.Item>
```

⚠️ **Keine Vorbelegung, sobald es Schränke gibt** — ein geratener Ort ist schlechter als eine
Frage. Solange `detail.zielOrte.length === 1` (nur die Wurzel), das Feld mit der Wurzel
vorbelegen, damit niemand ein Feld ohne Wahl ausfüllen muss:

```ts
initialValues={{ menge: 1, chargeId: NEUE_CHARGE,
  ...(detail && detail.zielOrte.length === 1 ? { zielLagerortId: detail.zielOrte[0]!.id } : {}) }}
```

- [ ] **Schritt 6: Tests und Tore laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/ && pnpm typecheck; echo "exit=$status"
```

- [ ] **Schritt 7: Committen**

```bash
git add src/app/m/lagerbuch/
git commit -m "feat(lagerbuch): der Zugang waehlt den Schrank

DRK-297. Ohne Zielort landet die Ware wie bisher auf der Handlager-Wurzel —
das heisst „noch nicht einsortiert\" und ist, was jede Altbuchung bedeutet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 11: Die Chargentabelle zeigt, wo was liegt

Das ist die Aufgabe gegen die verschwundene Fahrzeug-Charge.

**Dateien:**
- Ändern: `src/app/m/lagerbuch/_actions/detail.ts`
- Neu: `src/app/m/lagerbuch/_ui/OrtVerteilung.tsx`
- Ändern: `src/app/m/lagerbuch/_ui/ArtikelDrawer.tsx:744-799` (`ChargenTabelle`)
- Test: `src/app/m/lagerbuch/_ui/ArtikelDrawer.test.tsx` (vorhandene Datei erweitern)

**Schnittstellen:**
- `ArtikelDetailCharge` bekommt:
  - `restGesamt: number` — Summe über alle Orte
  - `orte: { id: string; name: string; menge: number; zugangshinweis: string | null }[]`
  - `rest` bleibt und heißt weiterhin „Rest im Handlager-Bereich"

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

```ts
/** DER BEFUND AUS DEM TICKET: 5 im Handlager, 7 im RTW — angezeigt wurden
 *  Bestand 5 und EINE Charge. */
it("zeigt eine Charge, die vollstaendig im Fahrzeug liegt", async () => {
  const e = await getDetail(ARTIKEL_A, t.db);
  const chargen = (e as { wert: { chargen: ArtikelDetailCharge[] } }).wert.chargen;
  expect(chargen.map((c) => c.chargenNr)).toContain("R-9");
});

it("nennt je Charge Ort und Menge", async () => {
  const e = await getDetail(ARTIKEL_A, t.db);
  const charge = (e as { wert: { chargen: ArtikelDetailCharge[] } }).wert.chargen
    .find((c) => c.chargenNr === "R-9");
  expect(charge?.orte).toEqual([{ id: RTW1, name: "RTW 1", menge: 7, zugangshinweis: null }]);
  expect(charge?.restGesamt).toBe(7);
});

it("reicht den Zugangshinweis des Orts mit", async () => {
  const e = await getDetail(ARTIKEL_A, t.db);
  const charge = (e as { wert: { chargen: ArtikelDetailCharge[] } }).wert.chargen
    .find((c) => c.chargenNr === "GF-1");
  expect(charge?.orte[0]?.zugangshinweis).toBe("Zugang über LvD — anrufen");
});

/** Eine leergebuchte Charge bleibt draussen — sonst fuellte jede je gebuchte
 *  Charge die Tabelle. */
it("laesst eine Charge ohne Rest an irgendeinem Ort weg", async () => {
  const e = await getDetail(ARTIKEL_A, t.db);
  expect((e as { wert: { chargen: ArtikelDetailCharge[] } }).wert.chargen
    .map((c) => c.chargenNr)).not.toContain("LEER");
});
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/detail.test.ts
```

- [ ] **Schritt 3: `detail.ts` umstellen**

```ts
  const verteilung = restJeChargeUndOrt(db, id);
  const stamm = ortStamm(db);

  const chargenErgebnis = detail.chargen
    .map((charge): ArtikelDetailCharge => {
      const proOrt = verteilung.get(charge.id) ?? new Map<string, number>();
      const orte = [...proOrt.entries()]
        .map(([ortId, menge]) => {
          const o = stamm.get(ortId);
          return {
            id: ortId,
            name: o?.name ?? ortId,
            menge,
            zugangshinweis: o?.zugangshinweis ?? null,
            sortierung: o?.sortierung ?? 0,
          };
        })
        // Wurzel und Schränke in gepflegter Reihenfolge, Fahrzeuge dahinter.
        .sort((a, b) => a.sortierung - b.sortierung || a.name.localeCompare(b.name))
        .map(({ sortierung: _weg, ...rest }) => rest);
      const status = verfallStatus(charge.verfall, schwellen, jetzt);
      return {
        ...charge,
        restGesamt: orte.reduce((s, o) => s + o.menge, 0),
        orte,
        ampel: status.ampel,
        text: chargeText(status, charge.verfall),
      };
    })
    /**
     * ⚠️ DER FILTER GEHT AUF DIE SUMME ÜBER ALLE ORTE, nicht auf den
     * Handlager-Rest. Genau hier verschwand bisher jede Charge, die
     * vollständig im Fahrzeug lag: gemessen 7 Pkg., die in der Oberfläche
     * nicht vorkamen, während der Artikel „Bestand 5" zeigte.
     */
    .filter((charge) => charge.restGesamt > 0);
```

- [ ] **Schritt 4: Die Anzeige-Insel schreiben**

`_ui/OrtVerteilung.tsx` (`"use client"`): eine Reihe von Chips, je Ort „Name: Menge"; trägt ein
Ort einen Zugangshinweis, bekommt sein Chip ein Hinweiszeichen und einen `Tooltip` mit dem
Hinweistext. Der Hinweistext steht **zusätzlich** als `title`, damit er ohne Zeigegerät erreichbar
ist.

- [ ] **Schritt 5: Die Spalte einhängen**

In `ChargenTabelle` die Spalte „Rest" umbenennen und eine Spalte davor einsetzen:

```tsx
          {
            title: "Liegt in",
            key: "orte",
            render: (_, charge) => <OrtVerteilung orte={charge.orte} einheit={einheit} />,
          },
          {
            // Hieß „Rest" und zeigte den Handlager — das las sich als
            // Gesamtbestand. Der Name sagt jetzt, was die Zahl ist.
            title: "Rest gesamt",
            dataIndex: "restGesamt",
            key: "restGesamt",
            align: "right",
            sorter: nachZahl<ArtikelDetailCharge>((charge) => charge.restGesamt),
            render: (rest: number) => `${rest} ${einheit}`,
          },
```

⚠️ **Eine Zeile je Charge, nicht je (Charge, Ort)** — `rowKey="id"` kollidierte sonst und antd
verhielte sich still falsch.

- [ ] **Schritt 6: Die zwei Stellen entscheiden, die sonst still mitkippen**

Beide hängen daran, dass `detail.chargen` ab jetzt auch Chargen enthält, die **nur im Fahrzeug**
liegen.

**`ArtikelDrawer.tsx:721`, die Ablauf-Plakette am Artikel.**

```ts
const faelligeCharge = detail.chargen.find((charge) => charge.ampel !== "gruen");
```

Unverändert übernommen würde der Chip „Charge läuft ab" erstmals für **Fahrzeugbestand** feuern.
Das ist nicht gewollt: der Mindestbestand, die Verfallsliste und die Kacheln beziehen sich auf den
Handlager-Bereich, und Fahrzeug-Chargen werden über den nächsten Fahrzeug-Check bereinigt
(§5.2.1). Der Chip bleibt deshalb auf den Handlager-Bereich gescopet:

```ts
// ⚠️ `rest` ist der Handlager-Bereich, `restGesamt` schliesst Fahrzeuge ein. Der
// Chip meint die Nachschub-Sicht des Handlagers und darf NICHT auf Fahrzeug-
// bestand anspringen — dafuer ist der Fahrzeug-Check zustaendig (§5.2.1).
const faelligeCharge = detail.chargen.find((charge) => charge.ampel !== "gruen" && charge.rest > 0);
```

Dazu ein Test:

```ts
it("die Ablauf-Plakette springt nicht auf reinen Fahrzeugbestand an", async () => {
  // CHARGE_NUR_RTW ist abgelaufen und liegt ausschliesslich im RTW.
  const { container } = mount(<ArtikelDrawer … />);
  expect(container.textContent).not.toContain("Charge abgelaufen");
});
```

**`ArtikelDrawer.tsx:383`, die Beschriftung der Chargenauswahl.**

```ts
label: `${charge.chargenNr} · ${fmtVerfall(charge.verfall)} · Rest ${charge.rest}`,
```

Sie zeigt den Handlager-Rest, während die Tabelle zwei Zentimeter darunter „Rest gesamt" nennt —
zwei Zahlen unter einem Wort. Die Auswahl bekommt dieselbe Zahl wie die Tabelle:

```ts
label: `${charge.chargenNr} · ${fmtVerfall(charge.verfall)} · Rest gesamt ${charge.restGesamt}`,
```

- [ ] **Schritt 7: Tests und Tore laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/ && pnpm typecheck; echo "exit=$status"
```

- [ ] **Schritt 8: Committen**

```bash
git add src/app/m/lagerbuch/
git commit -m "feat(lagerbuch): jede Charge zeigt, wo wie viel von ihr liegt

DRK-297. Der Filter geht jetzt auf die Summe ueber alle Orte: eine Charge, die
vollstaendig im Fahrzeug liegt, verschwand bisher ganz aus dem Artikeldetail —
gemessen 7 Pkg. unsichtbar bei angezeigtem Bestand 5.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 12: Die Helferansicht

**Dateien:**
- Ändern: `src/app/m/lagerbuch/_lib/lesepfade/artikel.ts` (`artikelDetailHelfer`)
- Ändern: `src/app/m/lagerbuch/_ui/Entnahme.tsx`
- Test: `src/app/m/lagerbuch/a/[artikelId]/page.test.tsx` und der Test zu `Entnahme`

**Schnittstellen:**
- `artikelDetailHelfer` liefert je Charge zusätzlich `orte` und `restGesamt` in derselben Form
  wie `ArtikelDetailCharge` (Aufgabe 11) — **derselbe Feldname, dieselbe Bedeutung**, damit die
  beiden Ansichten nicht auseinanderlaufen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
it("nennt der Helferin den Schrank und den Zugangshinweis", () => {
  const d = artikelDetailHelfer(t.db, ARTIKEL_A)!;
  const charge = d.chargen.find((c) => c.chargenNr === "GF-1")!;
  expect(charge.orte[0]?.name).toBe("GF-Schrank");
  expect(charge.orte[0]?.zugangshinweis).toBe("Zugang über LvD — anrufen");
});

/** Wer vor dem Regal steht, soll auch sehen, was im Fahrzeug liegt. */
it("zeigt auch Chargen, die nur im Fahrzeug liegen", () => {
  const d = artikelDetailHelfer(t.db, ARTIKEL_A)!;
  expect(d.chargen.map((c) => c.chargenNr)).toContain("R-9");
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/
```

- [ ] **Schritt 3: `artikelDetailHelfer` erweitern**

Dieselbe Projektion wie in `detail.ts` — `restJeChargeUndOrt` plus `ortStamm`, Filter auf
`restGesamt > 0`. **Die Sortierung bleibt FEFO** (`vergleicheFefoCharge`), der Ort ändert daran
nichts.

- [ ] **Schritt 4: `Entnahme.tsx` ergänzen**

In der Chargenkarte unter „Nächste Charge zuerst (FEFO)" je Charge die Orte anzeigen. ⚠️ **Der
Zugangshinweis steht hier VORN, nicht in einem Tooltip** — das ist die Ansicht für jemanden mit
dem Telefon in der Hand, der das Material nicht findet. ⚠️ Bediendichte 44 px.

- [ ] **Schritt 5: Tests und Tore laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/ && pnpm typecheck; echo "exit=$status"
```

- [ ] **Schritt 6: Committen**

```bash
git add src/app/m/lagerbuch/
git commit -m "feat(lagerbuch): die Helferansicht nennt Schrank und Zugangshinweis

DRK-297. Der Hinweis steht vorn und nicht in einem Tooltip: das ist die
Ansicht fuer jemanden, der vor dem Regal steht und nichts findet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 13: Demodaten

**Dateien:**
- Ändern: `src/app/m/lagerbuch/_lib/seedLokal.ts:294` (Ortsliste) und die Buchungsblöcke

**Schnittstellen:** keine.

- [ ] **Schritt 1: Die Orte ergänzen**

```ts
  const SCHRANK_1 = "schrank-1";
  const SCHRANK_2 = "schrank-2";
  const SCHRANK_GF = "schrank-gf";
```

und in `orteListe`:

```ts
    { id: SCHRANK_1, name: "Schrank 1 (Helfer)", typ: "lager" as const,
      parentId: HANDLAGER_ID, sortierung: 10, zugangshinweis: null },
    { id: SCHRANK_2, name: "Schrank 2 (Helfer)", typ: "lager" as const,
      parentId: HANDLAGER_ID, sortierung: 20, zugangshinweis: null },
    // Der Fall, um den es in DRK-297 geht: ein Ort, an den man nicht einfach
    // herangeht.
    { id: SCHRANK_GF, name: "GF-Schrank", typ: "lager" as const,
      parentId: HANDLAGER_ID, sortierung: 90,
      zugangshinweis: "Zugang nur über die GF — LvD anrufen" },
```

⚠️ **Elternzeilen vor Kindzeilen einfügen.** Die Wurzel `handlager` legt Migration `0003` an, die
Schränke verweisen darauf — die Reihenfolge innerhalb dieses `insert` ist unkritisch, solange die
Wurzel schon steht.

- [ ] **Schritt 2: Bestand auf die Schränke verteilen**

Mindestens **eine Charge, die an zwei Orten liegt** (ein Schrank und ein Fahrzeug) und **eine
Charge ausschließlich im GF-Schrank** — sonst zeigt der Seed genau die Fälle nicht, für die die
Änderung gebaut ist.

- [ ] **Schritt 3: Seed laufen lassen und ansehen**

```bash
pnpm seed:lokal lagerbuch
```

Erwartet: läuft durch, das Protokoll nennt die erzeugten Links.

- [ ] **Schritt 4: Den Seed-Test laufen lassen**

```bash
pnpm vitest run scripts/seed-lokal.test.ts
```

- [ ] **Schritt 5: Committen**

```bash
git add src/app/m/lagerbuch/_lib/seedLokal.ts
git commit -m "test(lagerbuch): Demodaten bekommen zwei Helferschraenke und den GF-Schrank

DRK-297. Eine Charge liegt bewusst an zwei Orten und eine ausschliesslich im
GF-Schrank — sonst zeigt der Seed genau die Faelle nicht, fuer die der Umbau
gebaut ist.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 14: Echter Abruf (e2e)

**Dateien:**
- Neu: `e2e/lagerbuch-schraenke.spec.ts`

**Schnittstellen:** keine.

- [ ] **Schritt 1: Den Test schreiben**

Ablauf: Verwaltung → Lagerorte öffnen · Schrank anlegen · Artikel öffnen · Zugang mit Zielort
buchen · prüfen, dass die Chargentabelle „Schrank … : N" zeigt · Helferansicht öffnen · prüfen,
dass der Zugangshinweis im Klartext steht.

⚠️ **Zwingend zu beachten:**
- Zeilengreifer ist `[data-row-key]`, **nie** `tbody tr` oder `getByRole("row")` (Falle 14).
- Klicks auf Anker über `klickeWennRuhig` aus `e2e/fixtures.ts` (Falle 12).
- Wer eine Anfrage auslöst, **prüft ihre Antwort** über `page.waitForResponse` (Falle 10) — sonst
  läuft eine abgelehnte Antwort still ins Zeitbudget und meldet sich als etwas anderes.
- Vor dem ersten POST auf eine Route ein Warmlauf-GET auf dieselbe Route (Falle 10).

- [ ] **Schritt 2: Sicherstellen, dass kein `pnpm dev` läuft**

```bash
pgrep -fl "next dev" || echo "kein dev-Server"
```

Erwartet: „kein dev-Server". Ein offener Entwicklungsserver legt die E2E-Suite lahm.

- [ ] **Schritt 3: Den Test laufen lassen**

```bash
pnpm exec playwright test e2e/lagerbuch-schraenke.spec.ts
```

- [ ] **Schritt 4: Committen**

```bash
git add e2e/lagerbuch-schraenke.spec.ts
git commit -m "test(lagerbuch): e2e fuer Schraenke, Zugangsziel und Zugangshinweis

DRK-297. Nur ein echter Abruf sieht die RSC-Grenze und den Zugangshinweis im
Klartext; Vitest sieht beides strukturell nicht.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Aufgabe 15: Anwendernotiz und Gesamtabnahme

**Dateien:**
- Neu: `src/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-schraenke.ts`
- Ändern: `src/app/m/portal/_lib/neuigkeiten/register.ts`

**Schnittstellen:** das Dreieck Dateiname ↔ Felder (`modul`, `datum`, `slug`) ↔ Registerzeile.

- [ ] **Schritt 1: Die Notiz schreiben**

Ein Absatz, zwei bis drei Sätze, Du-Form, Präsens. Kein Dateiname, kein Ticket, kein Framework,
kein Werbewort, kein Ausrufezeichen, kein Markdown im Text. Der erste Satz sagt, was jetzt anders
ist. Der Weg wird mit den Wörtern benannt, die auf dem Bildschirm stehen („Verwaltung →
Lagerorte"). **Der App-Name wird nicht wiederholt**, der Titel ist eine Aussage. Höchstens ein
`hinweis`, und nur wenn der Leser wirklich etwas tun muss — hier ist das der Fall: ohne angelegte
Schränke ändert sich für niemanden etwas.

Ein Vorbild aus demselben Verzeichnis lesen, bevor die Datei entsteht. `datum` ist der Tag des
**Rollouts**.

- [ ] **Schritt 2: Die Registerzeile setzen**

Eine Zeile in `register.ts`. Ohne sie ist der Test rot — das ist der Zweck der Prüfung.

- [ ] **Schritt 3: Den Notiztest laufen lassen**

```bash
pnpm vitest run src/app/m/portal/_lib/neuigkeiten/register.test.ts
```

Erwartet: PASS. Er prüft die Grenzen (3 Blöcke, 320 Zeichen je Block, 640 gesamt, 60 im Titel),
die Werbewörter und das Verbot von Markdown im Text.

- [ ] **Schritt 4: Alle Tore fahren**

```bash
pnpm typecheck; echo "typecheck exit=$status"
```
```bash
pnpm lint
```
```bash
pnpm vitest run
```
```bash
pnpm build
```
```bash
pnpm exec playwright test
```

Erwartet: `typecheck exit=0`, `lint` ohne Fehler (Warnungen blockieren nicht), alle Tests grün.

⚠️ **`zip-Route-Test schlägt lokal auf macOS/Node 24 reproduzierbar fehl und ist in der CI grün.**
Das ist kein Befund dieses Umbaus — nicht danach suchen.

- [ ] **Schritt 5: Committen**

```bash
git add src/app/m/portal/_lib/neuigkeiten/
git commit -m "docs(portal): Notiz zu den Schraenken im Lagerbuch

DRK-297.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Schritt 6: PR öffnen und das Ticket nachziehen**

Der **Hauptlauf** (nicht ein Subagent) setzt DRK-297 auf `review` und kommentiert den PR-Link.
`Closed` erst nach dem Merge — der Stand auf `main` ist der Beweis, ein grüner Branch eine
Behauptung.

---

## Selbstprüfung des Plans

**Abdeckung gegen die Spec:**

| Spec-Abschnitt | Aufgabe |
| --- | --- |
| Modell, Migration | 1 |
| `teilbaum`, `handlagerOrte`, `ortStamm` | 2, 3 |
| A — Aggregate auf Ortsmengen, `restJeChargeUndOrt` | 4 |
| A — sichtbare Nebenwirkung Verfallsliste | 4 (Umstellung), 7 (Buchung je Ort) |
| B — FEFO-Kern, vierter Rang, Umlagerungsfalle | 5, 6 |
| C — Verwaltung → Lagerorte | 8, 9 |
| C — Riegel im Löschpfad, stillgelegter Schrank mit Bestand | 8 |
| D — Zugang mit Schrankauswahl | 10 |
| E — Chargentabelle, „Rest gesamt", Filter auf die Gesamtsumme | 11 |
| E — Helferansicht, Hinweis vorn | 12 |
| Tests (Differenz, M2, Umlagerung, e2e) | 4, 5, 6, 7, 14 |
| Release-Notiz | 15 |

**Nicht abgedeckt, absichtlich:** Inventur je Schrank (DRK-337), Umlagerung Schrank → Schrank
(DRK-338), Aussondern gezielt je Schrank (DRK-339).

**Namensgleichheit über die Aufgaben:** `teilbaum`, `OrtZeile`, `handlagerOrte`, `ortStamm`,
`OrtStammZeile`, `handlagerSchraenke`, `bestandProOrte`, `restProOrtenUndCharge`,
`restJeChargeUndOrt`, `ChargeRest.lagerortId`, `ChargeRest.ortSortierung`,
`FefoTeil.vonLagerortId`, `umlagerung.vonOrten`, `ArtikelDetailResult.zielOrte` (die wählbaren
Ziele), `ArtikelDetailCharge.orte` (die Verteilung), `ArtikelDetailCharge.restGesamt` — in jeder
Aufgabe gleich geschrieben. ⚠️ `zielOrte` und `orte` sind mit Absicht verschieden benannt: zwei
Felder namens `orte` mit verschiedener Bedeutung in einem Objektbaum sind der zuverlässigste Weg,
dass jemand ins falsche greift.

**Zwei Verhaltensänderungen an bestehenden Flächen**, beide ausdrücklich entschieden statt
durchlaufen gelassen: die Verfallsliste zeigt ab jetzt auch abgelaufene Chargen aus dem GF-Schrank
(Aufgabe 4, gewollt), und die Ablauf-Plakette im Artikeldetail bleibt auf den Handlager-Bereich
gescopet, springt also **nicht** auf reinen Fahrzeugbestand an (Aufgabe 11, ausdrücklich so
belassen).
