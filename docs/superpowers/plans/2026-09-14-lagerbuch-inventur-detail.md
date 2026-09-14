# Lagerbuch — Inventur detaillierter (DRK-299) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Handlager-Inventur zählt optional je Charge (inkl. Ergänzen fehlender Chargen), filtert nach Kategorie/Fach, zeigt MHD und Mindestbestand und speichert jeden Lauf für eine neue Verlaufsansicht.

**Architecture:** Neue append-only-Tabellen `inventuren`/`inventur_positionen` (Migration 0006, auditiert). `inventurKorrektur` behält den Artikelweg und bekommt einen Chargenweg; beide schreiben Positionen in den Lauf, dessen ID die Buchungsreferenz `inventur:<id>` ist. Ein neuer Lesepfad `inventurZeilen` versorgt die Client-Insel; zwei neue Server-Seiten zeigen den Verlauf über Client-Tabellen.

**Tech Stack:** Next.js 16 (App Router, RSC) · antd 6 · Drizzle + better-sqlite3 · zod · Vitest (jsdom-Harness `@/app/m/qr/_lib/test-dom`) · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-14-lagerbuch-inventur-detail-design.md` — **vor jeder Aufgabe lesen**; bei Widerspruch gilt die Spec, und der Widerspruch wird gemeldet.

## Global Constraints

- Nur Handlager (`HANDLAGER_ID`). Fahrzeug-Check, `korrekturAufLagerort`, `lagerort_verfall` bleiben **unverändert**.
- **Nicht angefasste Charge eines aufgeklappten Artikels wird nie gebucht und nie implizit 0.**
- Artikelposition bleibt wörtlich `{ artikelId, ist }`; Chargenposition `{ artikelId, chargen: {chargeId, ist}[], neu: {verfall, chargenNr?, ist}[] }` — unterschieden an der Form.
- `ist` 0 … 99 999 ganzzahlig; `neu[].ist` 1 … 99 999; `verfall` über `MONAT_REGEX` (`_lib/konstanten.ts`); leere `chargenNr` → `CHARGE_INVENTUR`.
- Lauf-ID === ID in `referenz: inventur:<id>`. Jede angefasste Position wird gespeichert, auch mit Differenz 0. `erwartet` = Live-Bestand in der Transaktion.
- `korrigiert` = Zahl gespeicherter Positionen mit Differenz ≠ 0. Rückgabe `{ korrigiert, inventurId }`.
- Bediendichte 44px: **kein `size`** auf Bedienelementen (CLAUDE.md Falle 4).
- Tabellen mit `render` nur in `"use client"`-Komponenten mit serialisierbaren Props (Falle 9); kein antd-Compound-Zugriff in Server Components (Falle 1); keine `@ant-design/icons` in RSC (Falle 7); Werte für RSC nie aus `"use client"`-Modulen (Falle 6).
- Migration **handgeschrieben** (drizzle-kit kennt die Audit-Trigger nicht).
- Commit-Kopfzeile Conventional Commit, **Ticketnummer im Body** (`DRK-299`), Abschluss `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Commits sind GPG-signiert: `git commit` mit Bash-Timeout 30 s; hängt es, **nicht wiederholen**, sondern Botschaft in eine Datei legen und melden.
- Tore: `pnpm typecheck` (Exit-Code prüfen), `pnpm lint`, `pnpm vitest run <pfad>`, am Ende `pnpm build` und `pnpm exec playwright test`.
- Vor jedem Playwright-Lauf `pgrep -fl "next dev"`; fremde Server (anderer Worktree/laufende Playwright-Sitzung) **nicht** beenden.

## Dateikarte

| Datei | Aufgabe | Verantwortung |
| --- | --- | --- |
| `src/app/m/lagerbuch/_db/migrations/0006_inventuren.sql` (neu) | 1 | Tabellen, Index, append-only, Audit-Trigger |
| `src/app/m/lagerbuch/_db/migrations/meta/_journal.json` | 1 | Eintrag idx 6 |
| `src/app/m/lagerbuch/_db/schema.ts` | 1 | Drizzle-Tabellen `inventuren`, `inventurPositionen` |
| `src/core/audit/catalog.ts` | 1 | zwei `audited`-Einträge |
| `src/app/m/lagerbuch/_db/inventuren.test.ts` (neu) | 1 | append-only |
| `src/app/m/lagerbuch/_lib/lesepfade/inventur.ts` (neu) | 2 | `inventurZeilen` |
| `src/app/m/lagerbuch/_lib/inventurFilter.ts` (neu) | 3 | reines Filterprädikat |
| `src/app/m/lagerbuch/_actions/inventur.ts` | 4 | Schema, Chargenweg, Laufspeicherung |
| `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/page.tsx` | 5 | Projektion über `inventurZeilen`, Link „Verlauf" |
| `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/inventurZustand.ts` (neu) | 5 | Zählzustand + `positionenAus` (rein, kein `"use client"`) |
| `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/InventurForm.tsx` | 5, 6 | Zeile, Filter, Chargen-Unterzeilen |
| `src/app/m/lagerbuch/_lib/lesepfade/inventurVerlauf.ts` (neu) | 7 | Liste + Detail |
| `src/app/m/lagerbuch/_lib/grenzen.ts` | 7 | `INVENTUR_VERLAUF_GRENZE` |
| `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/verlauf/{page.tsx,VerlaufTabelle.tsx}` (neu) | 7 | Liste |
| `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/verlauf/[id]/{page.tsx,LaufTabelle.tsx}` (neu) | 7 | Detail |
| `src/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-inventur-je-charge.ts` (neu) + `register.ts` | 8 | Notiz |
| `e2e/seed-lagerbuch.ts`, `e2e/lagerbuch-inventur.spec.ts` (neu) | 9 | E2E |

---

### Task 1: Migration 0006, Drizzle-Schema, Audit-Katalog

**Files:**
- Create: `src/app/m/lagerbuch/_db/migrations/0006_inventuren.sql`
- Modify: `src/app/m/lagerbuch/_db/migrations/meta/_journal.json`
- Modify: `src/app/m/lagerbuch/_db/schema.ts` (ans Dateiende)
- Modify: `src/core/audit/catalog.ts` (Block `lagerbuch`, alphabetisch)
- Test: `src/app/m/lagerbuch/_db/inventuren.test.ts`; bestehend `src/core/audit/catalog.test.ts`, `src/core/bootstrap.test.ts`

**Interfaces:**
- Produces: `inventuren` (`id, ts: Date, quelleTyp, quelleId, kommentar, umfang: string | null`), `inventurPositionen` (`id, inventurId, artikelId, chargeId: string | null, erwartet: number, gezaehlt: number`) aus `_db/schema.ts`.

- [ ] **Step 1: Failing test** — `src/app/m/lagerbuch/_db/inventuren.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, inventuren, inventurPositionen } from "./schema";

const JETZT = new Date("2026-09-14T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-inventuren-");
  t.db.insert(artikel).values({
    id: "art-1", name: "Mullbinde", einheit: "Stk.", fach: "A1",
    mindestbestand: 0, aktiv: true, createdAt: JETZT,
  }).run();
  t.db.insert(inventuren).values({
    id: "lauf-1", ts: JETZT, quelleTyp: "oidc", quelleId: "u-admin",
    kommentar: "Quartal", umfang: null,
  }).run();
  t.db.insert(inventurPositionen).values({
    id: "pos-1", inventurId: "lauf-1", artikelId: "art-1", chargeId: null,
    erwartet: 5, gezaehlt: 4,
  }).run();
});
afterEach(() => t.schliessen());

describe("0006 — Inventurlaeufe sind append-only", () => {
  it("verbietet UPDATE und DELETE auf beiden Tabellen", () => {
    expect(() => t.db.update(inventuren).set({ kommentar: "x" }).where(eq(inventuren.id, "lauf-1")).run())
      .toThrow(/append-only/);
    expect(() => t.db.delete(inventuren).where(eq(inventuren.id, "lauf-1")).run())
      .toThrow(/append-only/);
    expect(() => t.db.update(inventurPositionen).set({ gezaehlt: 9 }).where(eq(inventurPositionen.id, "pos-1")).run())
      .toThrow(/append-only/);
    expect(() => t.db.delete(inventurPositionen).where(eq(inventurPositionen.id, "pos-1")).run())
      .toThrow(/append-only/);
  });

  it("verlangt einen existierenden Lauf", () => {
    expect(() => t.db.insert(inventurPositionen).values({
      id: "pos-2", inventurId: "gibt-es-nicht", artikelId: "art-1", chargeId: null,
      erwartet: 0, gezaehlt: 0,
    }).run()).toThrow(/FOREIGN KEY/i);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/app/m/lagerbuch/_db/inventuren.test.ts` — Expected: FAIL (Import `inventuren` fehlt).

- [ ] **Step 3: Migration** — `0006_inventuren.sql`. Die Audit-Trigger folgen **wörtlich** dem Muster `audit_buchungen_*` aus `0004_audit_outbox.sql:36-54`; das `WHEN` zählt **jede** Spalte auf (`catalog.test.ts#assertUpdateColumnCoverage` prüft das).

```sql
-- DRK-299: Inventurlaeufe mit allen gezaehlten Positionen.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT: `drizzle-kit generate` kennt die Audit-Trigger
-- aus 0004 nicht (vgl. Kopf von 0005).
--
-- Beide Tabellen sind append-only wie `buchungen` (0001) und auditiert wie
-- `buchungen` (0004). Die Lauf-ID ist die ID in `buchungen.referenz = 'inventur:<id>'`.
CREATE TABLE `inventuren` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`quelle_typ` text NOT NULL,
	`quelle_id` text NOT NULL,
	`kommentar` text NOT NULL,
	`umfang` text
);
--> statement-breakpoint
CREATE TABLE `inventur_positionen` (
	`id` text PRIMARY KEY NOT NULL,
	`inventur_id` text NOT NULL,
	`artikel_id` text NOT NULL,
	`charge_id` text,
	`erwartet` integer NOT NULL,
	`gezaehlt` integer NOT NULL,
	FOREIGN KEY (`inventur_id`) REFERENCES `inventuren`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artikel_id`) REFERENCES `artikel`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`charge_id`) REFERENCES `chargen`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inventur_positionen_lauf` ON `inventur_positionen` (`inventur_id`);
--> statement-breakpoint
CREATE TRIGGER inventuren_no_update BEFORE UPDATE ON inventuren
BEGIN
  SELECT RAISE(ABORT, 'inventuren ist append-only');
END;
--> statement-breakpoint
CREATE TRIGGER inventuren_no_delete BEFORE DELETE ON inventuren
BEGIN
  SELECT RAISE(ABORT, 'inventuren ist append-only');
END;
--> statement-breakpoint
CREATE TRIGGER inventur_positionen_no_update BEFORE UPDATE ON inventur_positionen
BEGIN
  SELECT RAISE(ABORT, 'inventur_positionen ist append-only');
END;
--> statement-breakpoint
CREATE TRIGGER inventur_positionen_no_delete BEFORE DELETE ON inventur_positionen
BEGIN
  SELECT RAISE(ABORT, 'inventur_positionen ist append-only');
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventuren_create AFTER INSERT ON "inventuren"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'create', 'inventuren', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventuren_update AFTER UPDATE ON "inventuren"
WHEN OLD."id" IS NOT NEW."id" OR OLD."ts" IS NOT NEW."ts" OR OLD."quelle_typ" IS NOT NEW."quelle_typ" OR OLD."quelle_id" IS NOT NEW."quelle_id" OR OLD."kommentar" IS NOT NEW."kommentar" OR OLD."umfang" IS NOT NEW."umfang"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'inventuren', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventuren_delete AFTER DELETE ON "inventuren"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'delete', 'inventuren', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventur_positionen_create AFTER INSERT ON "inventur_positionen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'create', 'inventur_positionen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventur_positionen_update AFTER UPDATE ON "inventur_positionen"
WHEN OLD."id" IS NOT NEW."id" OR OLD."inventur_id" IS NOT NEW."inventur_id" OR OLD."artikel_id" IS NOT NEW."artikel_id" OR OLD."charge_id" IS NOT NEW."charge_id" OR OLD."erwartet" IS NOT NEW."erwartet" OR OLD."gezaehlt" IS NOT NEW."gezaehlt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'update', 'inventur_positionen', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_inventur_positionen_delete AFTER DELETE ON "inventur_positionen"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'lagerbuch', 'delete', 'inventur_positionen', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
```

⚠️ Prüfen, bevor die Datei als fertig gilt: Liegen die `append-only`-Trigger aus 0001 für `buchungen` **vor** den Audit-Triggern, und ist die Reihenfolge der BEFORE/AFTER-Trigger hier gleichgültig? (BEFORE bricht ab, AFTER feuert nie — ja.) Prüfen, ob `migrierteTestDb` die Audit-SQL-Funktionen (`suite_audit_id` …) registriert; wenn ein INSERT im Test mit „no such function" scheitert, das Vorgehen der bestehenden `buchungen`-Tests übernehmen, nicht die Trigger ändern.

- [ ] **Step 4: Journal** — in `meta/_journal.json` nach idx 5 anhängen (`when` **größer** als 1789401600000, sonst übergeht der Migrator die Datei auf bestehenden Datenbanken):

```json
    {
      "idx": 6,
      "version": "6",
      "when": 1789466400000,
      "tag": "0006_inventuren",
      "breakpoints": true
    }
```

- [ ] **Step 5: Drizzle-Schema** — ans Ende von `_db/schema.ts`:

```ts
/**
 * DRK-299 — ein Inventurlauf. APPEND-ONLY (0006). Die `id` steht als
 * `inventur:<id>` in `buchungen.referenz`; das Praefix bleibt Vertrag
 * (1:1-Pflicht 12), nur hat die ID jetzt einen Datensatz.
 *
 * `umfang` ist der Filter ZUM ZEITPUNKT DES ABSCHLUSSES, als JSON
 * `{ kategorien: string[]; faecher: string[] }`, `null` = vollstaendig. Er ist
 * BESCHREIBEND: gebucht werden alle angefassten Positionen, auch ausgeblendete.
 */
export const inventuren = sqliteTable("inventuren", {
  id: text("id").primaryKey(),
  ts: integer("ts", { mode: "timestamp" }).notNull(),
  quelleTyp: text("quelle_typ", { enum: ["token", "oidc", "system"] }).notNull(),
  quelleId: text("quelle_id").notNull(),
  kommentar: text("kommentar").notNull(),
  umfang: text("umfang"),
});

/**
 * DRK-299 — jede ANGEFASSTE Position eines Laufs, auch ohne Abweichung.
 * `chargeId === null` heisst „je Artikel gezaehlt". `erwartet` ist der
 * LIVE-Bestand in der Transaktion (Artikel: Handlager-Bestand; Charge: deren
 * Handlager-Rest), nicht der Seitenstand. Die Differenz wird abgeleitet.
 */
export const inventurPositionen = sqliteTable(
  "inventur_positionen",
  {
    id: text("id").primaryKey(),
    inventurId: text("inventur_id").notNull().references(() => inventuren.id),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    chargeId: text("charge_id").references(() => chargen.id),
    erwartet: integer("erwartet").notNull(),
    gezaehlt: integer("gezaehlt").notNull(),
  },
  (t) => [index("idx_inventur_positionen_lauf").on(t.inventurId)],
);
```

- [ ] **Step 6: Audit-Katalog** — in `src/core/audit/catalog.ts`, Block `lagerbuch`, alphabetisch einsortiert:

```ts
    "inventur_positionen": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
    "inventuren": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ]
    },
```

- [ ] **Step 7: Run** `pnpm vitest run src/app/m/lagerbuch/_db/inventuren.test.ts src/core/audit/catalog.test.ts src/core/bootstrap.test.ts src/app/m/lagerbuch/_db` — Expected: PASS. Prüfen, ob ein Test die Migrationsanzahl oder einen Drizzle-Snapshot festhält (`rg -n "0005|_journal" src --glob '*.test.*'`); wenn ja, dort nachziehen.

- [ ] **Step 8: Commit**

```bash
git add src/app/m/lagerbuch/_db src/core/audit/catalog.ts
git commit -m "feat(lagerbuch): Inventurlaeufe mit Positionen speichern" -m "DRK-299. Migration 0006: append-only und auditiert wie buchungen." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Lesepfad `inventurZeilen`

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/inventur.ts`
- Modify: `src/app/m/lagerbuch/_lib/lesepfade/artikel.ts:32` — `vergleicheFefoCharge` (und ihren Parametertyp `FefoSortierbareCharge`) **exportieren**, nicht kopieren
- Test: `src/app/m/lagerbuch/_lib/lesepfade/inventur.test.ts`

**Interfaces:**
- Produces:
```ts
export type InventurCharge = { id: string; chargenNr: string; verfall: string; rest: number; ampel: Ampel };
export type InventurZeile = {
  id: string; name: string; einheit: string; fach: string;
  kategorie: string | null; mindestbestand: number; bestand: number;
  /** Nur Rest > 0 AM HANDLAGER, FEFO-sortiert — `chargen[0]` ist das naechste MHD. */
  chargen: InventurCharge[];
};
export function inventurZeilen(db: Leser, now?: Date): InventurZeile[];
```
(`Ampel` aus `_lib/domain/verfall.ts`; kein separates `naechstesMhd`-Feld — es ist `chargen[0]`, eine zweite Quelle liefe auseinander.)

- [ ] **Step 1: Failing test** — `inventur.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { inventurZeilen } from "./inventur";

const JETZT = new Date("2026-09-14T10:00:00Z");
let t: TestDb;
let nr = 0;

function art(id: string, extra: Partial<typeof artikel.$inferInsert> = {}) {
  t.db.insert(artikel).values({
    id, name: id, einheit: "Stk.", fach: "A1", mindestbestand: 2, aktiv: true,
    createdAt: JETZT, kategorie: null, ...extra,
  }).run();
}
function charge(id: string, artikelId: string, verfall: string) {
  t.db.insert(chargen).values({ id, artikelId, chargenNr: `Nr-${id}`, verfall, createdAt: JETZT }).run();
}
function buche(artikelId: string, chargeId: string, menge: number, lagerortId = HANDLAGER_ID) {
  t.db.insert(buchungen).values({
    id: `b-${++nr}`, ts: JETZT, typ: "zugang", artikelId, chargeId, lagerortId, menge,
    quelleTyp: "system", quelleId: "test", referenz: null, kommentar: null,
  }).run();
}

beforeEach(() => {
  nr = 0;
  t = migrierteTestDb("lagerbuch-lesepfad-inventur-");
  t.db.insert(lagerorte).values({ id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true, templateId: null }).run();
});
afterEach(() => t.schliessen());

describe("inventurZeilen", () => {
  it("liefert nur aktive Artikel mit Kategorie, Mindestbestand und Handlager-Bestand", () => {
    art("aktiv", { kategorie: "Hygiene", mindestbestand: 5 });
    art("inaktiv", { aktiv: false });
    expect(inventurZeilen(t.db, JETZT)).toEqual([{
      id: "aktiv", name: "aktiv", einheit: "Stk.", fach: "A1",
      kategorie: "Hygiene", mindestbestand: 5, bestand: 0, chargen: [],
    }]);
  });

  it("zeigt nur Chargen mit Handlager-Rest > 0, FEFO-sortiert, ohne Fahrzeugbestand", () => {
    art("a");
    charge("spaet", "a", "2029-01");
    charge("frueh", "a", "2026-10");
    charge("leer", "a", "2026-09");
    charge("nur-rtw", "a", "2027-01");
    buche("a", "spaet", 3);
    buche("a", "frueh", 2);
    buche("a", "leer", 1); buche("a", "leer", -1);
    buche("a", "nur-rtw", 4, "rtw-1");

    const [zeile] = inventurZeilen(t.db, JETZT);
    expect(zeile!.bestand).toBe(5);
    expect(zeile!.chargen.map((c) => [c.id, c.rest])).toEqual([["frueh", 2], ["spaet", 3]]);
    expect(zeile!.chargen[0]).toMatchObject({ chargenNr: "Nr-frueh", verfall: "2026-10", ampel: "gelb" });
    expect(zeile!.chargen[1]!.ampel).toBe("gruen");
  });
});
```

Die Ampel-Erwartung `"gelb"` für `2026-10` bei `JETZT = 2026-09-14` gilt mit den Vorgaben ROT 31 / GELB 56 Tage (Monatsende 31.10. → 47 Tage). Setzt die Testumgebung `LAGERBUCH_VERFALL_*`, die Erwartung aus `verfallStatus` ableiten statt die Umgebung zu ändern.

- [ ] **Step 2: Run** `pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/inventur.test.ts` — Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung** — `inventur.ts`

```ts
/**
 * DRK-299 — die Zeilen der Inventur. Kein "use client": `inventur/page.tsx`
 * (Server Component) liest sie und reicht nur diese serialisierbare Form an die
 * Client-Insel (Falle 6, Falle 9).
 *
 * DREI ABFRAGEN STATT 3·N — dasselbe Muster wie `artikelListe`: Artikel,
 * Bestand je Artikel, Rest je Charge (beide HANDLAGER-gescoped) plus alle Chargen.
 *
 * Die Ampel wird HIER berechnet, damit das Formular weder Uhr noch Schwellen kennt.
 */
import { eq } from "drizzle-orm";
import { artikel, chargen } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { verfallSchwellen, verfallStatus, type Ampel } from "../domain/verfall";
import { vergleicheFefoCharge } from "./artikel";
import { bestandJeArtikel, restJeCharge, type Leser } from "./bestand";

export type InventurCharge = { id: string; chargenNr: string; verfall: string; rest: number; ampel: Ampel };

export type InventurZeile = {
  id: string; name: string; einheit: string; fach: string;
  kategorie: string | null; mindestbestand: number; bestand: number;
  /** Nur Rest > 0 AM HANDLAGER, FEFO-sortiert — `chargen[0]` ist das naechste MHD. */
  chargen: InventurCharge[];
};

export function inventurZeilen(db: Leser, now: Date = new Date()): InventurZeile[] {
  const schwellen = verfallSchwellen();
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  const bestand = bestandJeArtikel(db, HANDLAGER_ID);
  const rest = restJeCharge(db, HANDLAGER_ID);
  const alleChargen = db.select().from(chargen).all();

  return arts.map((a) => ({
    id: a.id, name: a.name, einheit: a.einheit, fach: a.fach,
    kategorie: a.kategorie, mindestbestand: a.mindestbestand,
    bestand: bestand.get(a.id) ?? 0,
    chargen: alleChargen
      .filter((c) => c.artikelId === a.id && (rest.get(c.id) ?? 0) > 0)
      .sort(vergleicheFefoCharge)
      .map((c) => ({
        id: c.id, chargenNr: c.chargenNr, verfall: c.verfall,
        rest: rest.get(c.id) ?? 0,
        ampel: verfallStatus(c.verfall, schwellen, now).ampel,
      })),
  }));
}
```

Reihenfolge der Artikel: dieselbe wie `artikelListe` (keine `orderBy`) — die Inventurseite behält damit ihre heutige Reihenfolge.

- [ ] **Step 4: Run** `pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade` — Expected: PASS (auch die bestehenden `artikel`-Tests).

- [ ] **Step 5: Commit** — `feat(lagerbuch): Lesepfad fuer Inventurzeilen mit Chargen` (Body: DRK-299, Co-Authored-By).

---

### Task 3: Filterprädikat `inventurFilter`

**Files:**
- Create: `src/app/m/lagerbuch/_lib/inventurFilter.ts`
- Test: `src/app/m/lagerbuch/_lib/inventurFilter.test.ts`

**Interfaces:**
- Consumes: `kategorieNormalisieren`, `kategorieSchluessel` aus `_lib/kategorie.ts`.
- Produces:
```ts
export type InventurFilter = { kategorien: readonly string[]; faecher: readonly string[] }; // kategorien = GEFALTETE Schluessel
export const LEERER_INVENTUR_FILTER: InventurFilter;
export function inventurTrifft(z: { fach: string; kategorie: string | null }, f: InventurFilter): boolean;
export function filterIstLeer(f: InventurFilter): boolean;
export function fachOptionen(zeilen: readonly { fach: string }[]): string[]; // eindeutig, sortiert (localeCompare "de")
```

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { fachOptionen, filterIstLeer, inventurTrifft, LEERER_INVENTUR_FILTER } from "./inventurFilter";
import { kategorieSchluessel } from "./kategorie";

const HYG = kategorieSchluessel("Hygiene");

describe("inventurTrifft", () => {
  it("laesst mit leerem Filter alles durch, auch Artikel ohne Kategorie", () => {
    expect(inventurTrifft({ fach: "A1", kategorie: null }, LEERER_INVENTUR_FILTER)).toBe(true);
    expect(filterIstLeer(LEERER_INVENTUR_FILTER)).toBe(true);
  });

  it("vergleicht Kategorien gefaltet und schliesst Artikel ohne Kategorie aus, sobald gefiltert wird", () => {
    const f = { kategorien: [HYG], faecher: [] };
    expect(inventurTrifft({ fach: "A1", kategorie: "hygiene" }, f)).toBe(true);
    expect(inventurTrifft({ fach: "A1", kategorie: "Technik" }, f)).toBe(false);
    expect(inventurTrifft({ fach: "A1", kategorie: null }, f)).toBe(false);
  });

  it("vergleicht Faecher exakt und verknuepft beide Filter mit UND", () => {
    const f = { kategorien: [HYG], faecher: ["A1"] };
    expect(inventurTrifft({ fach: "A1", kategorie: "Hygiene" }, f)).toBe(true);
    expect(inventurTrifft({ fach: "a1", kategorie: "Hygiene" }, f)).toBe(false);
    expect(inventurTrifft({ fach: "B2", kategorie: "Hygiene" }, f)).toBe(false);
  });
});

describe("fachOptionen", () => {
  it("liefert jedes Fach einmal, sortiert", () => {
    expect(fachOptionen([{ fach: "B2" }, { fach: "A1" }, { fach: "B2" }])).toEqual(["A1", "B2"]);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/app/m/lagerbuch/_lib/inventurFilter.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementierung**

```ts
/**
 * DRK-299 — welche Inventurzeilen SICHTBAR sind. Reine Funktion, kein
 * "use client". Der Filter blendet nur aus: gezaehlte Werte ausgeblendeter
 * Zeilen bleiben im Zaehlzustand und werden mitgebucht (Spec §A).
 *
 * Kategorien kommen als GEFALTETE Schluessel — dieselbe Faltung wie DRK-294,
 * nicht nachgebaut. Ein Artikel ohne Kategorie erscheint nur ohne
 * Kategorienfilter: wer „Hygiene" zaehlt, zaehlt keine unkategorisierten Teile.
 */
import { kategorieNormalisieren, kategorieSchluessel } from "./kategorie";

export type InventurFilter = { kategorien: readonly string[]; faecher: readonly string[] };

export const LEERER_INVENTUR_FILTER: InventurFilter = { kategorien: [], faecher: [] };

export function inventurTrifft(z: { fach: string; kategorie: string | null }, f: InventurFilter): boolean {
  if (f.kategorien.length > 0) {
    const k = kategorieNormalisieren(z.kategorie);
    if (k === null || !f.kategorien.includes(kategorieSchluessel(k))) return false;
  }
  if (f.faecher.length > 0 && !f.faecher.includes(z.fach)) return false;
  return true;
}

export function filterIstLeer(f: InventurFilter): boolean {
  return f.kategorien.length === 0 && f.faecher.length === 0;
}

export function fachOptionen(zeilen: readonly { fach: string }[]): string[] {
  return [...new Set(zeilen.map((z) => z.fach))].sort((a, b) => a.localeCompare(b, "de"));
}
```

- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(lagerbuch): Filter fuer die Inventur nach Kategorie und Fach` (Body: DRK-299, Co-Authored-By).

---

### Task 4: `inventurKorrektur` — Chargenweg und Laufspeicherung

**Files:**
- Create: `src/app/m/lagerbuch/_lib/inventurTexte.ts` (Abweisungstexte; eine `"use server"`-Datei darf nur async Funktionen exportieren)
- Modify: `src/app/m/lagerbuch/_actions/inventur.ts`
- Test: `src/app/m/lagerbuch/_actions/inventur.test.ts`

**Interfaces:**
- Consumes: `inventuren`, `inventurPositionen` (Task 1); `restJeChargeFuerArtikel` (`_lib/lesepfade/bestand.ts`); `MONAT_REGEX`, `CHARGE_INVENTUR`, `HANDLAGER_ID`, `PSEUDO_VERFALL` (`_lib/konstanten.ts`); `KATEGORIE_MAX_LAENGE`, `KATEGORIEN_AUSWAHL_MAX` (`_lib/kategorie.ts`).
- Produces:
```ts
// _lib/inventurTexte.ts
export const INVENTUR_TEXTE = {
  buchungsFehler: "Inventur konnte nicht gebucht werden.",
  chargeUnpassend: "Eine Charge passt nicht mehr zum Artikel. Bitte lade die Seite neu.",
  chargeDoppelt: "Eine Charge ist doppelt gezählt. Prüfe die ergänzten Chargen.",
} as const;
export const INVENTUR_ABWEISUNGEN: ReadonlySet<string>; // chargeUnpassend, chargeDoppelt

// _actions/inventur.ts
export type InventurNutzlast = {
  kommentar: string;
  umfang?: { kategorien: string[]; faecher: string[] } | null; // LABELS, nicht Schluessel
  positionen: Array<
    | { artikelId: string; ist: number }
    | { artikelId: string; chargen: { chargeId: string; ist: number }[]; neu: { verfall: string; chargenNr?: string; ist: number }[] }
  >;
};
export async function inventurKorrektur(eingabe: unknown, db?: DB): Promise<ActionErgebnis<{ korrigiert: number; inventurId: string }>>;
```
`InventurNutzlast` ist ein **Typ** — Typ-Exporte aus `"use server"` sind zur Laufzeit gelöscht und erlaubt; wenn `pnpm build` widerspricht, den Typ nach `_lib/inventurTexte.ts` verschieben.

- [ ] **Step 1: Bestehende Tests an die neue Rückgabe anpassen** — in `inventur.test.ts` jede Zusicherung `toEqual({ ok: true, wert: { korrigiert: N } })` (heute 4 Stellen: Tests „schreibt nach einer parallelen Entnahme…", „zaehlt Fahrzeugbestand…", „legt ohne vorhandene Charge…", „teilt eine Referenz…") ersetzen durch:

```ts
expect(erg).toEqual({ ok: true, wert: { korrigiert: N, inventurId: expect.any(String) } });
```

und `ERFOLGS_PFADE` um `"/m/lagerbuch/verwaltung/inventur/verlauf"` ergänzen (an zweiter Stelle, direkt nach `/inventur`). **Sonst nichts an den bestehenden Tests ändern** — sie tragen die 1:1-Pflichten des Artikelwegs.

- [ ] **Step 2: Neue Tests** — Import ergänzen `import { artikel, buchungen, chargen, inventuren, inventurPositionen, lagerorte } from "../_db/schema";` und `import { INVENTUR_TEXTE } from "../_lib/inventurTexte";`, dann ans Dateiende:

```ts
function laeufe() { return t.db.select().from(inventuren).all(); }
function positionen() { return t.db.select().from(inventurPositionen).all(); }
function chargenBestand(chargeId: string): number {
  return t.db.select().from(buchungen).all()
    .filter((b) => b.chargeId === chargeId && b.lagerortId === HANDLAGER_ID)
    .reduce((s, b) => s + b.menge, 0);
}

describe("inventurKorrektur — der Lauf wird gespeichert", () => {
  it("speichert Kopf und JEDE angefasste Artikelposition, auch ohne Abweichung", async () => {
    legeArtikelAn("art-gleich"); legeChargeAn({ id: "c-gleich", artikelId: "art-gleich", verfall: "2028-01" });
    legeArtikelAn("art-minus"); legeChargeAn({ id: "c-minus", artikelId: "art-minus", verfall: "2028-01" });
    buche({ artikelId: "art-gleich", chargeId: "c-gleich", menge: 5 });
    buche({ artikelId: "art-minus", chargeId: "c-minus", menge: 5 });

    const erg = await inventurKorrektur({
      kommentar: " Quartal ",
      umfang: { kategorien: ["Hygiene"], faecher: ["A1"] },
      positionen: [{ artikelId: "art-gleich", ist: 5 }, { artikelId: "art-minus", ist: 3 }],
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { korrigiert: 1, inventurId: expect.any(String) } });
    const inventurId = (erg as { ok: true; wert: { inventurId: string } }).wert.inventurId;
    expect(laeufe()).toEqual([expect.objectContaining({
      id: inventurId, quelleTyp: "oidc", quelleId: "u-admin", kommentar: "Quartal",
      umfang: JSON.stringify({ kategorien: ["Hygiene"], faecher: ["A1"] }),
    })]);
    expect(positionen().map((p) => [p.artikelId, p.chargeId, p.erwartet, p.gezaehlt]).sort())
      .toEqual([["art-gleich", null, 5, 5], ["art-minus", null, 5, 3]]);
    expect(inventurBuchungen().every((b) => b.referenz === `inventur:${inventurId}`)).toBe(true);
  });

  it("speichert umfang null, wenn kein Filter mitkommt", async () => {
    legeArtikelAn("art-a");
    await inventurKorrektur({ kommentar: "Voll", positionen: [{ artikelId: "art-a", ist: 0 }] }, t.db);
    expect(laeufe()[0]!.umfang).toBeNull();
  });
});

describe("inventurKorrektur — Zaehlung je Charge", () => {
  beforeEach(() => {
    legeArtikelAn("art-c");
    legeChargeAn({ id: "c-frueh", artikelId: "art-c", verfall: "2026-10" });
    legeChargeAn({ id: "c-spaet", artikelId: "art-c", verfall: "2029-01" });
    buche({ artikelId: "art-c", chargeId: "c-frueh", menge: 4 });
    buche({ artikelId: "art-c", chargeId: "c-spaet", menge: 6 });
  });

  it("laesst eine NICHT angefasste Charge unveraendert — nie implizit 0", async () => {
    const erg = await inventurKorrektur({
      kommentar: "Charge",
      positionen: [{ artikelId: "art-c", chargen: [{ chargeId: "c-spaet", ist: 6 }], neu: [] }],
    }, t.db);
    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 0 } });
    expect(chargenBestand("c-frueh")).toBe(4);
    expect(inventurBuchungen()).toEqual([]);
    expect(positionen().map((p) => [p.chargeId, p.erwartet, p.gezaehlt])).toEqual([["c-spaet", 6, 6]]);
  });

  it("bucht Minus und Plus auf GENAU die gezaehlte Charge, nicht per FEFO", async () => {
    const erg = await inventurKorrektur({
      kommentar: "Charge",
      positionen: [{ artikelId: "art-c", chargen: [
        { chargeId: "c-spaet", ist: 1 },
        { chargeId: "c-frueh", ist: 7 },
      ], neu: [] }],
    }, t.db);
    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 2 } });
    expect(chargenBestand("c-spaet")).toBe(1);
    expect(chargenBestand("c-frueh")).toBe(7);
    expect(inventurBuchungen().map((b) => [b.chargeId, b.menge, b.typ]).sort())
      .toEqual([["c-frueh", 3, "korrektur"], ["c-spaet", -5, "korrektur"]]);
  });

  it("rechnet erwartet gegen den LIVE-Rest der Charge", async () => {
    buche({ artikelId: "art-c", chargeId: "c-frueh", menge: -3, typ: "entnahme" });
    await inventurKorrektur({
      kommentar: "Live",
      positionen: [{ artikelId: "art-c", chargen: [{ chargeId: "c-frueh", ist: 1 }], neu: [] }],
    }, t.db);
    expect(positionen()[0]).toMatchObject({ chargeId: "c-frueh", erwartet: 1, gezaehlt: 1 });
    expect(inventurBuchungen()).toEqual([]);
  });

  it.each([
    ["eine fremde Charge", "c-fremd"],
    ["eine unbekannte Charge", "gibt-es-nicht"],
  ])("weist %s ab und schreibt NICHTS, auch keinen Lauf", async (_fall, chargeId) => {
    legeArtikelAn("art-fremd");
    legeChargeAn({ id: "c-fremd", artikelId: "art-fremd", verfall: "2028-01" });
    const vorher = t.db.select().from(buchungen).all().length;

    const erg = await inventurKorrektur({
      kommentar: "Fremd",
      positionen: [
        { artikelId: "art-c", chargen: [{ chargeId: "c-spaet", ist: 0 }], neu: [] },
        { artikelId: "art-c-zwei", chargen: [{ chargeId, ist: 1 }], neu: [] },
      ],
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: INVENTUR_TEXTE.chargeUnpassend });
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
    expect(laeufe()).toEqual([]);
    expect(positionen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("legt eine ergaenzte Charge mit ECHTEM MHD an; leere Nummer wird Inventur", async () => {
    const erg = await inventurKorrektur({
      kommentar: "Fund",
      positionen: [{ artikelId: "art-c", chargen: [], neu: [{ verfall: "2027-03", chargenNr: "  ", ist: 2 }] }],
    }, t.db);
    expect(erg).toMatchObject({ ok: true, wert: { korrigiert: 1 } });
    const neu = t.db.select().from(chargen).all().filter((c) => c.verfall === "2027-03");
    expect(neu).toHaveLength(1);
    expect(neu[0]).toMatchObject({ artikelId: "art-c", chargenNr: CHARGE_INVENTUR });
    expect(neu[0]!.verfall).not.toBe(PSEUDO_VERFALL);
    expect(chargenBestand(neu[0]!.id)).toBe(2);
    expect(positionen()[0]).toMatchObject({ chargeId: neu[0]!.id, erwartet: 0, gezaehlt: 2 });
  });

  it("verwendet bei gleichem Schluessel die juengste vorhandene Charge wieder", async () => {
    legeChargeAn({ id: "c-alt-leer", artikelId: "art-c", verfall: "2027-05", chargenNr: "L-1", createdAt: new Date("2025-01-01T00:00:00Z") });
    legeChargeAn({ id: "c-neu-leer", artikelId: "art-c", verfall: "2027-05", chargenNr: "L-1", createdAt: new Date("2026-01-01T00:00:00Z") });
    const vorher = t.db.select().from(chargen).all().length;

    await inventurKorrektur({
      kommentar: "Fund",
      positionen: [{ artikelId: "art-c", chargen: [], neu: [{ verfall: "2027-05", chargenNr: "L-1", ist: 3 }] }],
    }, t.db);

    expect(t.db.select().from(chargen).all()).toHaveLength(vorher);
    expect(chargenBestand("c-neu-leer")).toBe(3);
    expect(chargenBestand("c-alt-leer")).toBe(0);
  });

  it("weist eine Ergaenzung ab, die eine gleichzeitig gezaehlte Charge trifft", async () => {
    legeChargeAn({ id: "c-nr", artikelId: "art-c", verfall: "2027-07", chargenNr: "X-9" });
    const erg = await inventurKorrektur({
      kommentar: "Doppelt",
      positionen: [{ artikelId: "art-c",
        chargen: [{ chargeId: "c-nr", ist: 1 }],
        neu: [{ verfall: "2027-07", chargenNr: "X-9", ist: 1 }] }],
    }, t.db);
    expect(erg).toEqual({ ok: false, fehler: INVENTUR_TEXTE.chargeDoppelt });
    expect(laeufe()).toEqual([]);
  });
});

describe("inventurKorrektur — Schema der Chargenposition", () => {
  it.each([
    ["ohne Charge und ohne Ergaenzung", { artikelId: "a", chargen: [], neu: [] }],
    ["mit ist UND chargen", { artikelId: "a", ist: 1, chargen: [{ chargeId: "c", ist: 1 }], neu: [] }],
    ["mit doppelter chargeId", { artikelId: "a", chargen: [{ chargeId: "c", ist: 1 }, { chargeId: "c", ist: 2 }], neu: [] }],
    ["mit Ergaenzung ist 0", { artikelId: "a", chargen: [], neu: [{ verfall: "2027-01", ist: 0 }] }],
    ["mit ungueltigem Monat", { artikelId: "a", chargen: [], neu: [{ verfall: "2027-13", ist: 1 }] }],
    ["mit zwei gleichen Ergaenzungen", { artikelId: "a", chargen: [], neu: [{ verfall: "2027-01", ist: 1 }, { verfall: "2027-01", chargenNr: "", ist: 2 }] }],
  ])("weist eine Position %s ab", async (_fall, position) => {
    const erg = await inventurKorrektur({ kommentar: "Schema", positionen: [position] }, t.db);
    expect(erg).toMatchObject({ ok: false, fehler: "Bitte die markierten Felder prüfen." });
    expect(laeufe()).toEqual([]);
  });

  it("weist denselben Artikel in zwei Positionen ab", async () => {
    const erg = await inventurKorrektur({
      kommentar: "Schema",
      positionen: [{ artikelId: "a", ist: 1 }, { artikelId: "a", chargen: [{ chargeId: "c", ist: 1 }], neu: [] }],
    }, t.db);
    expect(erg).toMatchObject({ ok: false, fehler: "Bitte die markierten Felder prüfen." });
  });
});
```

- [ ] **Step 3: Run** `pnpm vitest run src/app/m/lagerbuch/_actions/inventur.test.ts` — Expected: FAIL (neue Tests; angepasste Rückgabe).

- [ ] **Step 4: `_lib/inventurTexte.ts`**

```ts
/**
 * DRK-299 — die Texte, mit denen `inventurKorrektur` einen Lauf fachlich
 * abweist. Kein "use server" (dort duerfte nur eine async Funktion stehen) und
 * kein "use client" (die Action liest sie). Das Formular zeigt NUR diese Texte
 * im Wortlaut; jeder andere Fehlertext bleibt hinter `buchungsFehler` verborgen.
 */
export const INVENTUR_TEXTE = {
  buchungsFehler: "Inventur konnte nicht gebucht werden.",
  chargeUnpassend: "Eine Charge passt nicht mehr zum Artikel. Bitte lade die Seite neu.",
  chargeDoppelt: "Eine Charge ist doppelt gezählt. Prüfe die ergänzten Chargen.",
} as const;

export const INVENTUR_ABWEISUNGEN: ReadonlySet<string> = new Set([
  INVENTUR_TEXTE.chargeUnpassend,
  INVENTUR_TEXTE.chargeDoppelt,
]);
```

- [ ] **Step 5: Action umbauen** — `_actions/inventur.ts`. Die zod-Hauptversion vorher prüfen (`rg '"zod"' package.json`); `.strict()` gibt es in v3 und v4. Ersetze Schema und Transaktionskörper; Guard, Audit-Kontext, Artikelweg (FEFO-Abgang, jüngste Charge, `CHARGE_INVENTUR`/`PSEUDO_VERFALL`) bleiben inhaltlich **gleich** und wandern in `artikelPosition`.

```ts
"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { buchungen, chargen, inventuren, inventurPositionen, newId } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { bestandProLagerort } from "../_lib/domain/bestand";
import { KATEGORIE_MAX_LAENGE, KATEGORIEN_AUSWAHL_MAX } from "../_lib/kategorie";
import { CHARGE_INVENTUR, HANDLAGER_ID, MONAT_REGEX, PSEUDO_VERFALL } from "../_lib/konstanten";
import { INVENTUR_TEXTE } from "../_lib/inventurTexte";
import { restJeChargeFuerArtikel } from "../_lib/lesepfade/bestand";
import { fefoAbbuchung, type Quelle, type Tx } from "../_lib/schreibpfade/abbuchung";
import { requireLagerbuchAdmin } from "../_lib/zugang";

// Echter Ueberbestand muss zaehlbar bleiben. Eine enge Obergrenze wuerde
// vorhandene Teile am Eingang abweisen und den Abgleich unbrauchbar machen.
const IST = z.coerce.number().int().min(0).max(99_999);

/** Leer oder nur Leerzeichen → `CHARGE_INVENTUR`: der Herkunftshinweis bleibt. */
function chargenNrAus(roh: string | undefined): string {
  return roh?.trim() || CHARGE_INVENTUR;
}

const ArtikelPosition = z.object({ artikelId: z.string().min(1), ist: IST }).strict();

const ChargenPosition = z.object({
  artikelId: z.string().min(1),
  // NUR ANGEFASSTE Chargen. Eine hier fehlende Charge wird nicht gebucht —
  // nie implizit 0 (1:1-Pflicht 21, Spec §B).
  chargen: z.array(z.object({ chargeId: z.string().min(1), ist: IST }).strict()),
  neu: z.array(z.object({
    verfall: z.string().regex(MONAT_REGEX, "Verfall muss YYYY-MM sein"),
    chargenNr: z.string().optional(),
    ist: z.coerce.number().int().min(1, "Menge muss größer als 0 sein").max(99_999),
  }).strict()),
}).strict()
  .refine((p) => p.chargen.length + p.neu.length > 0, { message: "Keine Charge gezählt", path: ["chargen"] })
  .refine((p) => new Set(p.chargen.map((c) => c.chargeId)).size === p.chargen.length,
    { message: "Charge doppelt gezählt", path: ["chargen"] })
  .refine((p) => new Set(p.neu.map((n) => `${chargenNrAus(n.chargenNr)}|${n.verfall}`)).size === p.neu.length,
    { message: "Charge doppelt ergänzt", path: ["neu"] });

const InventurSchema = z.object({
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
  // BESCHREIBEND: der Filter beim Abschluss, als LABELS fuer den Verlauf.
  umfang: z.object({
    kategorien: z.array(z.string().max(KATEGORIE_MAX_LAENGE)).max(KATEGORIEN_AUSWAHL_MAX),
    faecher: z.array(z.string().max(200)).max(500),
  }).strict().nullable().optional(),
  positionen: z.array(z.union([ArtikelPosition, ChargenPosition]))
    .min(1, "Keine Zählung erfasst")
    .refine((ps) => new Set(ps.map((p) => p.artikelId)).size === ps.length,
      { message: "Artikel doppelt gezählt" }),
});

type ArtikelPositionT = z.infer<typeof ArtikelPosition>;
type ChargenPositionT = z.infer<typeof ChargenPosition>;
type Lauf = { inventurId: string; referenz: string; quelle: Quelle; kommentar: string };

/** Fachliche Abweisung INNERHALB der Transaktion — sie rollt alles zurueck. */
class InventurAbgewiesen extends Error {}

function positionSpeichern(
  tx: Tx, lauf: Lauf, artikelId: string, chargeId: string | null, erwartet: number, gezaehlt: number,
): void {
  tx.insert(inventurPositionen).values({
    id: newId(), inventurId: lauf.inventurId, artikelId, chargeId, erwartet, gezaehlt,
  }).run();
}

/**
 * Der ARTIKELWEG — unveraendert gegenueber vor DRK-299, plus die gespeicherte
 * Position. Liefert, ob die Position abwich.
 */
function artikelPosition(tx: Tx, lauf: Lauf, position: ArtikelPositionT): boolean {
  // Der Bestand wird innerhalb derselben Transaktion frisch gelesen. Das
  // Lagerortfeld bleibt erhalten, damit Fahrzeugbestand nicht einfliesst.
  const zeilen = tx.select({ lagerortId: buchungen.lagerortId, menge: buchungen.menge })
    .from(buchungen).where(eq(buchungen.artikelId, position.artikelId)).all();
  const liveBestand = bestandProLagerort(zeilen, HANDLAGER_ID);
  const diff = position.ist - liveBestand;
  positionSpeichern(tx, lauf, position.artikelId, null, liveBestand, position.ist);
  if (diff === 0) return false;

  if (diff < 0) {
    fefoAbbuchung(tx, {
      artikelId: position.artikelId, menge: -diff, lagerortId: HANDLAGER_ID,
      quelle: lauf.quelle, kommentar: lauf.kommentar, referenz: lauf.referenz, typ: "korrektur",
    });
    return true;
  }

  // ⚠️ DIE GERATENE CHARGE (korrektur.ts:15-27) — nur im Artikelweg.
  const vorhandeneChargen = tx.select().from(chargen).where(eq(chargen.artikelId, position.artikelId)).all();
  let chargeId: string;
  if (vorhandeneChargen.length > 0) {
    chargeId = juengsteZuerst(vorhandeneChargen)[0]!.id;
  } else {
    chargeId = newId();
    tx.insert(chargen).values({
      id: chargeId, artikelId: position.artikelId, chargenNr: CHARGE_INVENTUR,
      verfall: PSEUDO_VERFALL, createdAt: new Date(),
    }).run();
  }
  bucheKorrektur(tx, lauf, position.artikelId, chargeId, diff);
  return true;
}

/**
 * Der CHARGENWEG (DRK-299). Liefert die Zahl abweichender Positionen.
 * Keine geratene Charge, kein FEFO: gebucht wird auf GENAU die gezaehlte Charge.
 */
function chargenPosition(tx: Tx, lauf: Lauf, position: ChargenPositionT): number {
  // Vor dem Anlegen neuer Chargen gelesen — eine neue Charge hat Rest 0.
  const rest = restJeChargeFuerArtikel(tx, position.artikelId, HANDLAGER_ID);
  const zuZaehlen: { chargeId: string; ist: number }[] = [];

  for (const c of position.chargen) {
    const zeile = tx.select().from(chargen).where(eq(chargen.id, c.chargeId)).get();
    if (!zeile || zeile.artikelId !== position.artikelId) {
      throw new InventurAbgewiesen(INVENTUR_TEXTE.chargeUnpassend);
    }
    zuZaehlen.push(c);
  }

  for (const n of position.neu) {
    const chargenNr = chargenNrAus(n.chargenNr);
    const treffer = juengsteZuerst(tx.select().from(chargen).where(and(
      eq(chargen.artikelId, position.artikelId),
      eq(chargen.chargenNr, chargenNr),
      eq(chargen.verfall, n.verfall),
    )).all())[0];
    let chargeId = treffer?.id;
    if (!chargeId) {
      chargeId = newId();
      // ECHTES MHD, kein PSEUDO_VERFALL — die Charge ist gezaehlt, nicht geraten.
      tx.insert(chargen).values({
        id: chargeId, artikelId: position.artikelId, chargenNr, verfall: n.verfall, createdAt: new Date(),
      }).run();
    }
    if (zuZaehlen.some((z) => z.chargeId === chargeId)) {
      throw new InventurAbgewiesen(INVENTUR_TEXTE.chargeDoppelt);
    }
    zuZaehlen.push({ chargeId, ist: n.ist });
  }

  let abweichend = 0;
  for (const z of zuZaehlen) {
    const erwartet = rest.get(z.chargeId) ?? 0;
    const diff = z.ist - erwartet;
    positionSpeichern(tx, lauf, position.artikelId, z.chargeId, erwartet, z.ist);
    if (diff === 0) continue;
    // Kein Kappen noetig: `ist >= 0`, der Rest dieser Charge danach ist `ist` (I2).
    bucheKorrektur(tx, lauf, position.artikelId, z.chargeId, diff);
    abweichend++;
  }
  return abweichend;
}

/** `verfall` ↓, `createdAt` ↓, `id` ↓ — derselbe Tiebreak wie `korrektur.ts`. */
function juengsteZuerst<T extends { id: string; verfall: string; createdAt: Date }>(zeilen: T[]): T[] {
  return zeilen.slice().sort((a, b) =>
    b.verfall.localeCompare(a.verfall)
    || b.createdAt.getTime() - a.createdAt.getTime()
    || b.id.localeCompare(a.id));
}

function bucheKorrektur(tx: Tx, lauf: Lauf, artikelId: string, chargeId: string, menge: number): void {
  tx.insert(buchungen).values({
    id: newId(), ts: new Date(), typ: "korrektur", artikelId, chargeId, lagerortId: HANDLAGER_ID, menge,
    quelleTyp: lauf.quelle.quelleTyp, quelleId: lauf.quelle.quelleId,
    referenz: lauf.referenz, kommentar: lauf.kommentar,
  }).run();
}

/**
 * Gleicht ausschliesslich die tatsaechlich gezaehlten Positionen gegen den
 * LIVE-Bestand im Handlager ab und speichert den Lauf mit JEDER angefassten
 * Position (DRK-299). Lauf, Positionen und Buchungen entstehen atomar; die
 * Lauf-ID ist die ID in `inventur:<id>`.
 *
 * Dieser Pfad ist bewusst von `korrekturAufLagerort` getrennt: Inventurzugang
 * ohne vorhandene Charge braucht den Herkunftshinweis `Inventur`, waehrend der
 * allgemeine Korrekturpfad `Korrektur` anlegt.
 */
export async function inventurKorrektur(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ korrigiert: number; inventurId: string }>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis<{ korrigiert: number; inventurId: string }>> => {
    const geparst = InventurSchema.safeParse(eingabe);
    if (!geparst.success) {
      const feldFehler = zodFehler(geparst.error);
      return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
    }
    const v = geparst.data;
    const inventurId = newId();
    const lauf: Lauf = {
      inventurId,
      referenz: `inventur:${inventurId}`,
      quelle: { quelleTyp: "oidc", quelleId: viewer.sub },
      kommentar: v.kommentar,
    };
    let korrigiert = 0;

    try {
      db.transaction((tx) => {
        // ZUERST der Kopf: die Positionen tragen einen Fremdschluessel auf ihn.
        tx.insert(inventuren).values({
          id: inventurId, ts: new Date(), quelleTyp: lauf.quelle.quelleTyp, quelleId: lauf.quelle.quelleId,
          kommentar: v.kommentar, umfang: v.umfang ? JSON.stringify(v.umfang) : null,
        }).run();
        for (const position of v.positionen) {
          korrigiert += "ist" in position
            ? (artikelPosition(tx, lauf, position) ? 1 : 0)
            : chargenPosition(tx, lauf, position);
        }
      });
    } catch (e) {
      if (e instanceof InventurAbgewiesen) return { ok: false, fehler: e.message };
      // SQLite- und Infrastrukturtexte gehoeren weder ins Formular noch an den
      // Client. Erwartbare Eingabefehler wurden bereits oberhalb abgebildet.
      return { ok: false, fehler: INVENTUR_TEXTE.buchungsFehler };
    }

    revalidatePath("/m/lagerbuch/verwaltung/inventur");
    revalidatePath("/m/lagerbuch/verwaltung/inventur/verlauf");
    revalidatePath("/m/lagerbuch/verwaltung/artikel");
    revalidatePath("/m/lagerbuch/verwaltung");
    return { ok: true, wert: { korrigiert, inventurId } };
  });
}
```

⚠️ Zu prüfen, nicht anzunehmen: `Tx`/`Quelle` sind aus `_lib/schreibpfade/abbuchung.ts` exportiert (ja, dort Zeilen 37/39). `db.transaction` von better-sqlite3 rollt bei einem Wurf zurück — der Rollback-Test aus dem Bestand hält das weiter fest. `z.union` mit zwei `.strict()`-Objekten: meldet zod bei einer Chargenposition mit `ist` einen Fehler und keinen Erfolg? Der Schema-Test „mit ist UND chargen" beweist es.

- [ ] **Step 6: Run** `pnpm vitest run src/app/m/lagerbuch/_actions` — Expected: PASS (inkl. `guards.test.ts` — die Zahl der Actions ist unverändert). Dann `pnpm typecheck`.

- [ ] **Step 7: Commit** — `feat(lagerbuch): Inventur zaehlt auf Wunsch je Charge und speichert den Lauf` (Body: DRK-299 · nicht angefasste Chargen bleiben unveraendert · Co-Authored-By).

---

### Task 5: Zählzustand, Zählzeile mit MHD/Mindestbestand, Filter

**Files:**
- Create: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/inventurZustand.ts` (rein, **kein** `"use client"`)
- Create: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/inventurZustand.test.ts`
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/page.tsx`
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/InventurForm.tsx`
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/InventurForm.test.tsx`

**Interfaces:**
- Consumes: `InventurZeile`, `InventurCharge` (Task 2); `InventurFilter`, `inventurTrifft`, `filterIstLeer`, `fachOptionen`, `LEERER_INVENTUR_FILTER` (Task 3); `kategorieOptionen` (`_lib/kategorie.ts`); `InventurNutzlast`, `inventurKorrektur` (Task 4); `INVENTUR_TEXTE`, `INVENTUR_ABWEISUNGEN` (Task 4); `ampelTon`, `fmtVerfall` (`_lib/format.ts`).
- Produces (von Task 6 benutzt):
```ts
export type NeueCharge = { schluessel: string; verfall: string; chargenNr: string; ist: number };
export type Zaehlung =
  | { art: "artikel"; ist: number }
  | { art: "chargen"; chargen: Readonly<Record<string, number>>; neu: readonly NeueCharge[] };
export type ZaehlStand = Readonly<Record<string, Zaehlung>>;

export function artikelSetzen(stand: ZaehlStand, artikelId: string, ist: number): ZaehlStand;
export function chargeSetzen(stand: ZaehlStand, artikelId: string, chargeId: string, ist: number): ZaehlStand;
export function neueChargeHinzufuegen(stand: ZaehlStand, artikelId: string, neu: NeueCharge): ZaehlStand;
export function neueChargeEntfernen(stand: ZaehlStand, artikelId: string, schluessel: string): ZaehlStand;
export function chargenzaehlungVerwerfen(stand: ZaehlStand, artikelId: string): ZaehlStand;
export function summeFuer(zeile: InventurZeile, z: Zaehlung | undefined): number;
export function abweichungenIn(zeilen: readonly InventurZeile[], stand: ZaehlStand): number;
export function ausgeblendetGezaehlt(zeilen: readonly InventurZeile[], stand: ZaehlStand, filter: InventurFilter): number;
export function positionenAus(stand: ZaehlStand): InventurNutzlast["positionen"];
export function neuSchluessel(verfall: string, chargenNr: string): string; // `${chargenNr.trim() || "Inventur"}|${verfall}` — "Inventur" über CHARGE_INVENTUR
```

- [ ] **Step 1: Failing test** — `inventurZustand.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import {
  abweichungenIn, artikelSetzen, ausgeblendetGezaehlt, chargeSetzen, chargenzaehlungVerwerfen,
  neueChargeEntfernen, neueChargeHinzufuegen, neuSchluessel, positionenAus, summeFuer, type ZaehlStand,
} from "./inventurZustand";

const ZEILE: InventurZeile = {
  id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1", kategorie: "Hygiene",
  mindestbestand: 5, bestand: 10,
  chargen: [
    { id: "c1", chargenNr: "L1", verfall: "2026-10", rest: 4, ampel: "gelb" },
    { id: "c2", chargenNr: "L2", verfall: "2029-01", rest: 6, ampel: "gruen" },
  ],
};
const LEER: ZaehlStand = {};
const NEU = { schluessel: neuSchluessel("2027-03", ""), verfall: "2027-03", chargenNr: "", ist: 2 };

describe("positionenAus — nur Angefasstes", () => {
  it("sendet eine Artikelposition wörtlich als { artikelId, ist }, auch unverändert und 0", () => {
    expect(positionenAus(artikelSetzen(artikelSetzen(LEER, "a1", 10), "a2", 0)))
      .toEqual([{ artikelId: "a1", ist: 10 }, { artikelId: "a2", ist: 0 }]);
    expect(positionenAus(LEER)).toEqual([]);
  });

  it("sendet im Chargenmodus nur angefasste Chargen und die Ergänzungen", () => {
    const stand = neueChargeHinzufuegen(chargeSetzen(LEER, "a1", "c2", 5), "a1", NEU);
    expect(positionenAus(stand)).toEqual([{
      artikelId: "a1",
      chargen: [{ chargeId: "c2", ist: 5 }],
      neu: [{ verfall: "2027-03", chargenNr: "", ist: 2 }],
    }]);
  });

  it("verwirft den Artikelwert, sobald eine Charge angefasst wird", () => {
    const stand = chargeSetzen(artikelSetzen(LEER, "a1", 3), "a1", "c1", 4);
    expect(positionenAus(stand)).toEqual([{ artikelId: "a1", chargen: [{ chargeId: "c1", ist: 4 }], neu: [] }]);
  });

  it("setzt nach dem Verwerfen und nach dem Entfernen der letzten Ergänzung auf unberührt zurück", () => {
    expect(positionenAus(chargenzaehlungVerwerfen(chargeSetzen(LEER, "a1", "c1", 1), "a1"))).toEqual([]);
    expect(positionenAus(neueChargeEntfernen(neueChargeHinzufuegen(LEER, "a1", NEU), "a1", NEU.schluessel)))
      .toEqual([]);
  });

  it("ignoriert artikelSetzen im Chargenmodus — das Feld ist dort nur Summe", () => {
    const stand = artikelSetzen(chargeSetzen(LEER, "a1", "c1", 1), "a1", 99);
    expect(stand.a1).toMatchObject({ art: "chargen" });
  });
});

describe("summeFuer und Abweichungen", () => {
  it("summiert gezählte, NICHT angefasste (mit Rest) und ergänzte Chargen", () => {
    const stand = neueChargeHinzufuegen(chargeSetzen(LEER, "a1", "c1", 1), "a1", NEU);
    expect(summeFuer(ZEILE, stand.a1)).toBe(1 + 6 + 2);
    expect(summeFuer(ZEILE, undefined)).toBe(10);
    expect(summeFuer(ZEILE, { art: "artikel", ist: 7 })).toBe(7);
  });

  it("zählt Abweichungen je Position wie der Server", () => {
    const stand = neueChargeHinzufuegen(chargeSetzen(chargeSetzen(LEER, "a1", "c1", 4), "a1", "c2", 5), "a1", NEU);
    // c1 = Rest → keine; c2 weicht ab; die Ergänzung weicht immer ab (erwartet 0, ist ≥ 1)
    expect(abweichungenIn([ZEILE], stand)).toBe(2);
  });

  it("zählt gezählte Zeilen, die der Filter ausblendet", () => {
    const stand = artikelSetzen(LEER, "a1", 3);
    expect(ausgeblendetGezaehlt([ZEILE], stand, { kategorien: [], faecher: ["B9"] })).toBe(1);
    expect(ausgeblendetGezaehlt([ZEILE], stand, { kategorien: [], faecher: [] })).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/inventurZustand.test.ts"` — Expected: FAIL.

- [ ] **Step 3: `inventurZustand.ts`**

```ts
/**
 * DRK-299 — der Zaehlzustand der Inventur als REINE Funktionen. Kein
 * "use client": Tests und die Client-Insel lesen ihn, und keine Server
 * Component braucht einen Wert daraus (Falle 6 bleibt damit ausgeschlossen).
 *
 * DIE REGEL, DIE HIER NICHT KAPUTTGEHEN DARF: nur Angefasstes wird gesendet. Eine
 * nicht angefasste Charge fehlt in `chargen` und wird serverseitig nicht gebucht
 * — nie implizit 0 (1:1-Pflicht 21). Eine beruehrte Artikelzeile bleibt auch dann
 * eingereicht, wenn ihr Wert dem Seitenstand entspricht: der Server vergleicht
 * gegen den LIVE-Bestand und verhindert damit Lost Updates.
 */
import type { InventurNutzlast } from "../../../_actions/inventur";
import type { InventurFilter } from "../../../_lib/inventurFilter";
import { inventurTrifft } from "../../../_lib/inventurFilter";
import { CHARGE_INVENTUR } from "../../../_lib/konstanten";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";

export type NeueCharge = { schluessel: string; verfall: string; chargenNr: string; ist: number };
export type Zaehlung =
  | { art: "artikel"; ist: number }
  | { art: "chargen"; chargen: Readonly<Record<string, number>>; neu: readonly NeueCharge[] };
export type ZaehlStand = Readonly<Record<string, Zaehlung>>;

export function neuSchluessel(verfall: string, chargenNr: string): string {
  return `${chargenNr.trim() || CHARGE_INVENTUR}|${verfall}`;
}

function ohne(stand: ZaehlStand, artikelId: string): ZaehlStand {
  const { [artikelId]: _weg, ...rest } = stand;
  return rest;
}

function chargenTeil(stand: ZaehlStand, artikelId: string): { chargen: Record<string, number>; neu: NeueCharge[] } {
  const z = stand[artikelId];
  return z?.art === "chargen" ? { chargen: { ...z.chargen }, neu: [...z.neu] } : { chargen: {}, neu: [] };
}

export function artikelSetzen(stand: ZaehlStand, artikelId: string, ist: number): ZaehlStand {
  if (stand[artikelId]?.art === "chargen") return stand;
  return { ...stand, [artikelId]: { art: "artikel", ist } };
}

export function chargeSetzen(stand: ZaehlStand, artikelId: string, chargeId: string, ist: number): ZaehlStand {
  const teil = chargenTeil(stand, artikelId);
  teil.chargen[chargeId] = ist;
  return { ...stand, [artikelId]: { art: "chargen", ...teil } };
}

export function neueChargeHinzufuegen(stand: ZaehlStand, artikelId: string, neu: NeueCharge): ZaehlStand {
  const teil = chargenTeil(stand, artikelId);
  if (teil.neu.some((n) => n.schluessel === neu.schluessel)) return stand;
  teil.neu.push(neu);
  return { ...stand, [artikelId]: { art: "chargen", ...teil } };
}

export function neueChargeEntfernen(stand: ZaehlStand, artikelId: string, schluessel: string): ZaehlStand {
  const teil = chargenTeil(stand, artikelId);
  teil.neu = teil.neu.filter((n) => n.schluessel !== schluessel);
  if (Object.keys(teil.chargen).length === 0 && teil.neu.length === 0) return ohne(stand, artikelId);
  return { ...stand, [artikelId]: { art: "chargen", ...teil } };
}

export function chargenzaehlungVerwerfen(stand: ZaehlStand, artikelId: string): ZaehlStand {
  return ohne(stand, artikelId);
}

export function summeFuer(zeile: InventurZeile, z: Zaehlung | undefined): number {
  if (!z) return zeile.bestand;
  if (z.art === "artikel") return z.ist;
  const vorhanden = zeile.chargen.reduce((s, c) => s + (z.chargen[c.id] ?? c.rest), 0);
  return vorhanden + z.neu.reduce((s, n) => s + n.ist, 0);
}

export function abweichungenIn(zeilen: readonly InventurZeile[], stand: ZaehlStand): number {
  let n = 0;
  for (const zeile of zeilen) {
    const z = stand[zeile.id];
    if (!z) continue;
    if (z.art === "artikel") { if (z.ist !== zeile.bestand) n++; continue; }
    for (const c of zeile.chargen) if (c.id in z.chargen && z.chargen[c.id] !== c.rest) n++;
    n += z.neu.length;
  }
  return n;
}

export function ausgeblendetGezaehlt(
  zeilen: readonly InventurZeile[], stand: ZaehlStand, filter: InventurFilter,
): number {
  return zeilen.filter((z) => z.id in stand && !inventurTrifft(z, filter)).length;
}

export function positionenAus(stand: ZaehlStand): InventurNutzlast["positionen"] {
  return Object.entries(stand).map(([artikelId, z]) => z.art === "artikel"
    ? { artikelId, ist: z.ist }
    : {
        artikelId,
        chargen: Object.entries(z.chargen).map(([chargeId, ist]) => ({ chargeId, ist })),
        neu: z.neu.map(({ verfall, chargenNr, ist }) => ({ verfall, chargenNr, ist })),
      });
}
```

⚠️ `import type { InventurNutzlast } from "_actions/inventur"` ist ein reiner Typ-Import und erzeugt keine Laufzeitkante zur `"use server"`-Datei. Meldet `pnpm build`/lint etwas anderes, `InventurNutzlast` nach `_lib/inventurTexte.ts` verschieben (siehe Task 4) und beide Importe umstellen.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Seite** — `page.tsx`

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import { inventurZeilen } from "../../../_lib/lesepfade/inventur";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { InventurForm } from "./InventurForm";

export const dynamic = "force-dynamic";

export function inventurSeitenInhalt(db: DB, now: Date = new Date()): ReactNode {
  return (
    <>
      <SeitenKopf
        titel="Inventur"
        beschreibung="Gezählt wird der Handlager-Bestand. Nur angefasste Zeilen und Chargen werden gebucht — der Server rechnet gegen den Live-Bestand, nicht gegen den Stand dieser Seite."
        aktionen={<Link href="/verwaltung/inventur/verlauf">Verlauf</Link>}
      />
      <InventurForm zeilen={inventurZeilen(db, now)} />
    </>
  );
}

export default function InventurSeite() {
  return inventurSeitenInhalt(getDb());
}
```

Wie andere Lagerbuch-Seiten einen Link im `aktionen`-Slot darstellen (`rg -n "aktionen=" src/app/m/lagerbuch`), übernehmen — ist dort ein antd-`Button` mit `href` üblich, dieses Muster nehmen (kein `size`).

- [ ] **Step 6: Formular — Zeile und Filter.** `InventurForm.tsx` umbauen:
  - Prop `zeilen: InventurZeile[]` (Typ aus `_lib/lesepfade/inventur`; der lokale Typ `InventurZeile` und die lokale `positionenAus` entfallen).
  - Zustand: `const [stand, setStand] = useState<ZaehlStand>({})`, `const [filter, setFilter] = useState<InventurFilter>(LEERER_INVENTUR_FILTER)`; `wertSetzen(id, wert)` ruft `setStand((s) => artikelSetzen(s, id, wert ?? 0))`.
  - Über der Tabelle eine `Flex gap={SPACE.sm} wrap` mit zwei `Select mode="multiple" allowClear`:
    `aria-label="Nach Kategorie filtern"`, `placeholder="Alle Kategorien"`, `options={kategorieOptionen(zeilen.map((z) => z.kategorie)).map((o) => ({ value: o.schluessel, label: o.label }))}`;
    `aria-label="Nach Fach filtern"`, `placeholder="Alle Fächer"`, `options={fachOptionen(zeilen).map((f) => ({ value: f, label: f }))}`. Kein `size`; Mindestbreite über `style={{ minWidth: 220 }}`.
  - `dataSource={zeilen.filter((z) => inventurTrifft(z, filter))}`. Der Leertext unterscheidet: ohne Artikel wie heute; mit Artikeln, aber ohne Treffer: „Kein Artikel passt zum Filter.".
  - Spalten in dieser Reihenfolge: **Artikel · Fach · MHD · Min. · Bestand · Abweichung · Ist**.
    - MHD: `zeile.chargen[0]` → `<Chip ton={ampelTon(c.ampel)}>{fmtVerfall(c.verfall)}</Chip>`, sonst `—`. Für `PSEUDO_VERFALL` („kein Verfall") dieselbe Anzeige wie die Artikelliste — dort nachsehen, wie sie `2099-12` darstellt, und genauso verfahren.
    - Min.: `<span style={SCHRIFT.mono}>{zeile.mindestbestand}</span>`.
    - Abweichung: `summeFuer(zeile, stand[zeile.id]) - zeile.bestand`, nur wenn `zeile.id in stand` und ≠ 0 (Chip wie heute).
    - Ist: wie heute; `aktuell = summeFuer(zeile, stand[zeile.id])`. Ist `stand[zeile.id]?.art === "chargen"`, sind die drei Bedienelemente `disabled` und das Feld zeigt die Summe (Task 6 ergänzt die Kennzeichnung).
  - Über dem Abschlussknopf: ist `ausgeblendetGezaehlt(zeilen, stand, filter) > 0`, ein `<Alert type="info" showIcon={false} data-rolle="ausgeblendet-hinweis" title={`${n} gezählte ${n === 1 ? "Position ist" : "Positionen sind"} ausgeblendet und wird mitgebucht.`} />` — Pluralform korrekt halten („wird"/„werden").
  - Abschlussknopf: `Inventur abschließen (${abweichungenIn(zeilen, stand)} Abweichung…)`, gesperrt ohne Kommentar oder ohne `positionenAus(stand).length`.
  - Nutzlast: `{ kommentar, umfang, positionen: positionenAus(stand) }` mit
    `umfang = filterIstLeer(filter) ? null : { kategorien: <Labels der gewählten Schlüssel>, faecher: [...filter.faecher] }`.
  - Erfolg: `setStand({})`, Kommentar leeren, Meldung „Inventur gebucht — N Position(en) korrigiert." **plus** Link „Im Verlauf ansehen" auf `/verwaltung/inventur/verlauf/${ergebnis.wert.inventurId}` (in `title` des Alerts als ReactNode). Der Filter bleibt stehen.
  - Fehler: `setFehler(!ergebnis.ok && INVENTUR_ABWEISUNGEN.has(ergebnis.fehler) ? ergebnis.fehler : INVENTUR_TEXTE.buchungsFehler)`; im `catch` immer `buchungsFehler`.
  - Die Kommentare zu Falle 4 (kein `size="small"`) und zur Kicker-Rolle der Spaltenköpfe bleiben stehen.

- [ ] **Step 7: Formular-Tests anpassen** — in `InventurForm.test.tsx`:
  - Imports: `positionenAus` aus `./inventurZustand`; `type InventurZeile` aus `../../../_lib/lesepfade/inventur`. Der `describe("positionenAus — Lost-Update-Riegel")` wandert **inhaltlich** nach `inventurZustand.test.ts` (dort schon abgedeckt) und entfällt hier.
  - `ZEILEN` bekommen `kategorie`, `mindestbestand`, `chargen: []`:
    ```ts
    const ZEILEN: InventurZeile[] = [
      { id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1", kategorie: "Hygiene", mindestbestand: 5, bestand: 12,
        chargen: [{ id: "c1", chargenNr: "L1", verfall: "2026-10", rest: 12, ampel: "gelb" }] },
      { id: "a2", name: "Pflaster", einheit: "Pkg", fach: "B2", kategorie: null, mindestbestand: 0, bestand: 4, chargen: [] },
    ];
    ```
  - Spaltentest: `["Artikel", "Fach", "MHD", "Min.", "Bestand", "Abweichung", "Ist"]`. Bei antd-`expandable` (Task 6) kommt eine Aufklappspalte ohne Text dazu — der Test filtert dann leere Köpfe (`.filter((t) => t)`), statt die Zahl zu ändern.
  - `toHaveBeenCalledWith` erwartet zusätzlich `umfang: null`.
  - Die Erfolgs-Mocks liefern `wert: { korrigiert: 1, inventurId: "lauf-1" }`.
  - Der RSC-Test („liefert force-dynamic und nur primitive Zeilenprops") erwartet jetzt:
    ```ts
    expect(form.props).toEqual({ zeilen: [{
      id: "inventur-rsc", name: "RSC Mullbinde", einheit: "Stk", fach: "R1",
      kategorie: null, mindestbestand: 3, bestand: 0, chargen: [],
    }] });
    ```
  - Neue Tests:
    ```ts
    describe("InventurForm — Zeile und Filter", () => {
      it("zeigt das nächste MHD und den Mindestbestand", async () => {
        await mount(<InventurForm zeilen={ZEILEN} />);
        const zeile = query("tr[data-row-key='a1']");
        expect(zeile.textContent).toContain("10/26");
        expect(zeile.textContent).toContain("5");
      });

      it("behält einen gezählten Wert, wenn der Filter die Zeile ausblendet, und bucht ihn mit", async () => {
        await mount(<InventurForm zeilen={ZEILEN} />);
        await fill("input[aria-label='Ist-Bestand Pflaster']", "3");
        // Filter per Zustand: antds Select ist in jsdom schwer bedienbar — wenn
        // die Auswahl über das Harness nicht zuverlässig klickbar ist, diesen Teil
        // im E2E (Task 9) prüfen und hier nur die reine Funktion testen.
        // …Filter "Fach = A1" setzen…
        expect(queryAll("tr[data-row-key='a2']")).toHaveLength(0);
        expect(query("[data-rolle='ausgeblendet-hinweis']").textContent).toContain("1 gezählte Position ist ausgeblendet");
        await fill("input[aria-label='Kommentar']", "Teil");
        await click("button[data-rolle='abschluss']");
        await warteAuf(() => mocks.inventurKorrektur.mock.calls.length === 1, "Inventur-Action");
        expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
          kommentar: "Teil",
          umfang: { kategorien: [], faecher: ["A1"] },
          positionen: [{ artikelId: "a2", ist: 3 }],
        });
      });

      it("zeigt eine fachliche Abweisung im Wortlaut, alles andere nicht", async () => {
        mocks.inventurKorrektur.mockResolvedValueOnce({ ok: false, fehler: INVENTUR_TEXTE.chargeUnpassend });
        await mount(<InventurForm zeilen={ZEILEN} />);
        await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
        await fill("input[aria-label='Kommentar']", "X");
        await click("button[data-rolle='abschluss']");
        await warteAuf(() => queryAll(".ant-alert-warning").length === 1, "Warnung");
        expect(query(".ant-alert-warning").textContent).toContain(INVENTUR_TEXTE.chargeUnpassend);
      });

      it("verlinkt nach dem Abschluss den gespeicherten Lauf", async () => {
        await mount(<InventurForm zeilen={ZEILEN} />);
        await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
        await fill("input[aria-label='Kommentar']", "X");
        await click("button[data-rolle='abschluss']");
        await warteAuf(() => queryAll(".ant-alert-success").length === 1, "Erfolg");
        expect(query(".ant-alert-success a").getAttribute("href")).toBe("/verwaltung/inventur/verlauf/lauf-1");
      });
    });
    ```
    Den Kommentar im zweiten Test **durch echte Bedienung ersetzen**: den Select öffnen (`click` auf `[aria-label='Nach Fach filtern']` bzw. dessen `.ant-select-selector`) und die Option `A1` wählen. Gelingt das in jsdom nach zwei Versuchen nicht, den Filter über eine kleine exportierte Hilfe nicht vortäuschen, sondern den Test auf „reine Funktion + E2E" reduzieren und das im Bericht nennen.

- [ ] **Step 8: Run** `pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/inventur"` und `pnpm typecheck` — Expected: PASS.

- [ ] **Step 9: Commit** — `feat(lagerbuch): Inventur zeigt MHD und Mindestbestand und filtert nach Kategorie und Fach` (Body: DRK-299 · Co-Authored-By).

---

### Task 6: Zählung je Charge — aufklappbare Zeile

**Files:**
- Create: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/ChargenZaehlung.tsx` (`"use client"`)
- Create: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/ChargenZaehlung.test.tsx`
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/InventurForm.tsx`
- Modify: `src/app/m/lagerbuch/_ui/ikonen.tsx` — zwei Zeichen `aufklappen: PiCaretDown`, `zuklappen: PiCaretUp` (Typ `IkonName` und `ZEICHEN` ergänzen; `ikonen.test.tsx`/Zähltests in `_ui` nachziehen, falls vorhanden)

**Interfaces:**
- Consumes: `InventurZeile` (Task 2); `ZaehlStand`, `Zaehlung`, `NeueCharge`, `chargeSetzen`, `neueChargeHinzufuegen`, `neueChargeEntfernen`, `chargenzaehlungVerwerfen`, `neuSchluessel` (Task 5); `MONAT_REGEX` (`_lib/konstanten.ts`); `ampelTon`, `fmtVerfall`.
- Produces:
```ts
export function ChargenZaehlung(props: {
  zeile: InventurZeile;
  zaehlung: Zaehlung | undefined;
  gesperrt: boolean;
  onAendern: (umbau: (stand: ZaehlStand) => ZaehlStand) => void;
}): JSX.Element;
```

**Bedienung (verbindlich):**
- Aufklappen über eine eigene Spalte (`expandable.expandIcon`) mit einem `Button` **ohne `size`** und `aria-label={offen ? `Chargen ${name} ausblenden` : `Chargen ${name} anzeigen`}`, Zeichen `aufklappen`/`zuklappen`. antds Standard-Aufklappknopf ist ~17px und unterschreitet die Arbeitsdichte (Falle 4).
- Aufgeklappter Bereich (`expandedRowRender`) = `<ChargenZaehlung …/>`, eine Liste (kein zweites `Table`):
  - je `zeile.chargen` eine Zeile `data-rolle="charge"` `data-charge-id={c.id}`: Chargennummer, `<Chip ton={ampelTon(c.ampel)}>{fmtVerfall(c.verfall)}</Chip>`, „erwartet {c.rest} {einheit}", Ist mit −/Feld/+ (`aria-label` `Ist Charge ${c.chargenNr}`, `… verringern`, `… erhöhen`), Wert = `zaehlung?.chargen[c.id] ?? c.rest`. Jede Änderung ruft `onAendern((s) => chargeSetzen(s, zeile.id, c.id, wert))`.
  - je ergänzter Charge eine Zeile `data-rolle="neue-charge"`: „neu", Nummer (leer → „Inventur"), MHD, Ist, Knopf `aria-label="Ergänzte Charge entfernen"` (Zeichen `papierkorb`).
  - Ergänzen-Zeile: `<input type="month" inputMode="numeric" pattern="\d{4}-\d{2}" aria-label="MHD der neuen Charge">` (natives Feld wie `CheckFlow.tsx:534`), `Input aria-label="Chargennummer der neuen Charge"` mit `placeholder="optional"`, `InputNumber min={1} max={99999} aria-label="Menge der neuen Charge"` (Vorgabe 1), `Button aria-label="Charge ergänzen"` mit Text „Charge ergänzen".
    - Gesperrt, solange `!MONAT_REGEX.test(verfall)`.
    - Trifft `neuSchluessel(verfall, nr)` eine Charge aus `zeile.chargen` (`neuSchluessel(c.verfall, c.chargenNr)`) oder eine bereits ergänzte, ist der Knopf gesperrt und darunter steht „Diese Charge steht schon in der Liste — zähle sie dort." Der Server weist denselben Fall ohnehin ab (`chargeDoppelt`); die Oberfläche soll ihn gar nicht erst entstehen lassen.
    - Nach dem Ergänzen werden die drei Felder geleert.
  - Ist `zaehlung?.art === "chargen"`: Knopf „Chargenzählung verwerfen" (`onAendern((s) => chargenzaehlungVerwerfen(s, zeile.id))`).
  - Leerer Artikel ohne Chargen: statt der Liste „Keine Charge mit Bestand im Handlager." — die Ergänzen-Zeile bleibt.
- In der Artikelzeile bei `art === "chargen"`: neben dem Ist-Feld `<Chip ton="grau">je Charge</Chip>`, die drei Bedienelemente `disabled`.
- Bediendichte: kein `size` an irgendeinem Element; das `<input type="month">` bekommt `minHeight: 44` über eine Klasse in `verwaltung.module.css` (Vorbild: wie `CheckFlow` sein Monatsfeld auf Tapgröße bringt — `rg -n "verfallZeile" src/app/m/lagerbuch/_ui`).
- Kicker/Farben: keine rote Datenfläche (Falle 3); die Abweichungs-Chips wie in der Hauptzeile.

- [ ] **Step 1: Failing test** — `ChargenZaehlung.test.tsx`

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, fill, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { ChargenZaehlung } from "./ChargenZaehlung";
import { positionenAus, type ZaehlStand } from "./inventurZustand";

const ZEILE: InventurZeile = {
  id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1", kategorie: null, mindestbestand: 0, bestand: 10,
  chargen: [
    { id: "c1", chargenNr: "L1", verfall: "2026-10", rest: 4, ampel: "gelb" },
    { id: "c2", chargenNr: "L2", verfall: "2029-01", rest: 6, ampel: "gruen" },
  ],
};

/** Wendet die Umbauten auf einen echten Stand an — so prueft der Test die Nutzlast, nicht Aufrufe. */
function harness() {
  let stand: ZaehlStand = {};
  const onAendern = vi.fn((umbau: (s: ZaehlStand) => ZaehlStand) => { stand = umbau(stand); });
  return { onAendern, stand: () => stand };
}

afterEach(async () => { await unmount(); });

describe("ChargenZaehlung", () => {
  it("zeigt je Charge Nummer, MHD und erwartete Menge", async () => {
    const h = harness();
    await mount(<ChargenZaehlung zeile={ZEILE} zaehlung={undefined} gesperrt={false} onAendern={h.onAendern} />);
    expect(queryAll("[data-rolle='charge']")).toHaveLength(2);
    expect(query("[data-charge-id='c1']").textContent).toContain("L1");
    expect(query("[data-charge-id='c1']").textContent).toContain("10/26");
    expect(query("[data-charge-id='c1']").textContent).toContain("erwartet 4");
  });

  it("sendet nur die angefasste Charge", async () => {
    const h = harness();
    await mount(<ChargenZaehlung zeile={ZEILE} zaehlung={undefined} gesperrt={false} onAendern={h.onAendern} />);
    await fill("input[aria-label='Ist Charge L2']", "5");
    expect(positionenAus(h.stand())).toEqual([{ artikelId: "a1", chargen: [{ chargeId: "c2", ist: 5 }], neu: [] }]);
  });

  it("ergänzt eine Charge erst mit gültigem MHD und leert danach die Felder", async () => {
    const h = harness();
    await mount(<ChargenZaehlung zeile={ZEILE} zaehlung={undefined} gesperrt={false} onAendern={h.onAendern} />);
    const knopf = query<HTMLButtonElement>("button[aria-label='Charge ergänzen']");
    expect(knopf.disabled).toBe(true);
    await fill("input[aria-label='MHD der neuen Charge']", "2027-03");
    await fill("input[aria-label='Menge der neuen Charge']", "2");
    expect(knopf.disabled).toBe(false);
    await click("button[aria-label='Charge ergänzen']");
    expect(positionenAus(h.stand())).toEqual([{
      artikelId: "a1", chargen: [], neu: [{ verfall: "2027-03", chargenNr: "", ist: 2 }],
    }]);
    expect(query<HTMLInputElement>("input[aria-label='MHD der neuen Charge']").value).toBe("");
  });

  it("sperrt das Ergänzen einer Charge, die schon in der Liste steht", async () => {
    const h = harness();
    await mount(<ChargenZaehlung zeile={ZEILE} zaehlung={undefined} gesperrt={false} onAendern={h.onAendern} />);
    await fill("input[aria-label='MHD der neuen Charge']", "2026-10");
    await fill("input[aria-label='Chargennummer der neuen Charge']", "L1");
    expect(query<HTMLButtonElement>("button[aria-label='Charge ergänzen']").disabled).toBe(true);
    expect(document.body.textContent).toContain("Diese Charge steht schon in der Liste");
  });

  it("verwirft die Chargenzählung", async () => {
    const h = harness();
    h.onAendern((s) => ({ ...s, a1: { art: "chargen", chargen: { c1: 1 }, neu: [] } }));
    await mount(<ChargenZaehlung zeile={ZEILE} zaehlung={h.stand().a1} gesperrt={false} onAendern={h.onAendern} />);
    await click("button:not([aria-label])"); // Text-Knopf „Chargenzählung verwerfen" — per Text finden, s. u.
    expect(positionenAus(h.stand())).toEqual([]);
  });
});
```

Im letzten Test den Knopf **über seinen Text** finden (`queryAll("button").find((b) => b.textContent?.includes("Chargenzählung verwerfen"))!.click()` in `act`), nicht über den Platzhalter-Selektor. `fill` auf ein natives `type="month"`-Feld: funktioniert das Harness in jsdom nicht (jsdom validiert `month`-Werte), im Harness nachsehen und notfalls den Wert über den nativen Setter + `input`-Event setzen — wie `fill` es für Antd-Felder schon tut.

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: `ChargenZaehlung.tsx` implementieren** nach „Bedienung (verbindlich)". Lokaler Zustand nur für die drei Ergänzen-Felder; alles andere über `onAendern`.
- [ ] **Step 4: In `InventurForm.tsx` einhängen:**
  ```tsx
  expandable={{
    expandedRowRender: (zeile) => (
      <ChargenZaehlung
        zeile={zeile}
        zaehlung={stand[zeile.id]}
        gesperrt={laeuft}
        onAendern={(umbau) => { setStand(umbau); setFehler(null); setMeldung(null); }}
      />
    ),
    expandIcon: ({ expanded, onExpand, record }) => (
      <Button
        aria-label={expanded ? `Chargen ${record.name} ausblenden` : `Chargen ${record.name} anzeigen`}
        aria-expanded={expanded}
        onClick={(e) => onExpand(record, e)}
        icon={<Ikone name={expanded ? "zuklappen" : "aufklappen"} groesse={14} />}
      />
    ),
  }}
  ```
  und die Chargenmodus-Kennzeichnung in der Ist-Spalte (Chip „je Charge", Bedienelemente `disabled`).
- [ ] **Step 5: Formular-Integrationstest** in `InventurForm.test.tsx`:
  ```tsx
  it("zählt aufgeklappt je Charge und schickt die Chargenposition", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    await click("button[aria-label='Chargen Mullbinde anzeigen']");
    await fill("input[aria-label='Ist Charge L1']", "9");
    expect(query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']").disabled).toBe(true);
    expect(query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']").value).toBe("9");
    await fill("input[aria-label='Kommentar']", "Charge");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => mocks.inventurKorrektur.mock.calls.length === 1, "Inventur-Action");
    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Charge", umfang: null,
      positionen: [{ artikelId: "a1", chargen: [{ chargeId: "c1", ist: 9 }], neu: [] }],
    });
  });
  ```
- [ ] **Step 6: Run** `pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/inventur" src/app/m/lagerbuch/_ui` und `pnpm typecheck` — Expected: PASS.
- [ ] **Step 7: Commit** — `feat(lagerbuch): Chargen in der Inventur aufklappen, zaehlen und ergaenzen` (Body: DRK-299 · Co-Authored-By).

---

### Task 7: Verlauf — Lesepfad, Liste, Detail

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/inventurVerlauf.ts` + `inventurVerlauf.test.ts`
- Modify: `src/app/m/lagerbuch/_lib/grenzen.ts` — im Abschnitt „DIE DREI REINEN DECKEL" `export const INVENTUR_VERLAUF_GRENZE = 100;` mit einem Satz Begründung (synchrones better-sqlite3, wie `JOURNAL_GRENZE`)
- Create: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/verlauf/page.tsx`, `VerlaufTabelle.tsx` (`"use client"`), `page.test.tsx`
- Create: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/verlauf/[id]/page.tsx`, `LaufTabelle.tsx` (`"use client"`), `page.test.tsx`

**Interfaces:**
- Consumes: `inventuren`, `inventurPositionen`, `artikel`, `chargen` (Task 1); `quelleAufloeser` (`_db/quelle.ts`, braucht `DB`); `fmtTs` (`_lib/zeit.ts`); `fmtVerfall`, `AmpelTon` (`_lib/format.ts`).
- Produces:
```ts
export type Umfang = { kategorien: string[]; faecher: string[] } | null;
export type LaufKurz = {
  id: string; ts: Date; quelleTyp: string; quelleId: string; kommentar: string;
  umfang: Umfang; positionen: number; abweichungen: number;
};
export type LaufPosition = {
  id: string; artikelId: string; artikelName: string; einheit: string;
  chargeId: string | null; chargenNr: string | null; verfall: string | null;
  erwartet: number; gezaehlt: number;
};
export function umfangAus(roh: string | null): Umfang;              // kaputtes JSON → null
export function inventurLaeufe(db: Leser, grenze?: number): { laeufe: LaufKurz[]; begrenzt: boolean };
export function inventurLauf(db: Leser, id: string): { kopf: LaufKurz; positionen: LaufPosition[] } | null;
```

- [ ] **Step 1: Failing test** — `inventurVerlauf.test.ts`. Fixture über die **echte Action** statt Handinserts, damit Lesepfad und Schreibpfad dieselbe Form haben: `vi.mock("next/cache")`, `vi.mock("../zugang")`, `vi.mock("../../_db/client")` wie in `_actions/inventur.test.ts:25-45`, dann `inventurKorrektur({...}, t.db)`.

```ts
describe("inventurLaeufe", () => {
  it("liefert neueste zuerst mit Zahl der Positionen und Abweichungen", async () => {
    // art-1 (Bestand 5), art-2 (Bestand 2) anlegen und buchen
    await inventurKorrektur({ kommentar: "Erster", positionen: [{ artikelId: "art-1", ist: 5 }] }, t.db);
    await inventurKorrektur({
      kommentar: "Zweiter", umfang: { kategorien: ["Hygiene"], faecher: [] },
      positionen: [{ artikelId: "art-1", ist: 5 }, { artikelId: "art-2", ist: 1 }],
    }, t.db);

    const { laeufe, begrenzt } = inventurLaeufe(t.db);
    expect(begrenzt).toBe(false);
    expect(laeufe.map((l) => [l.kommentar, l.positionen, l.abweichungen])).toEqual([
      ["Zweiter", 2, 1],
      ["Erster", 1, 0],
    ]);
    expect(laeufe[0]!.umfang).toEqual({ kategorien: ["Hygiene"], faecher: [] });
  });

  it("zeigt einen Lauf ohne Abweichung — genau das konnte das Journal nicht", async () => {
    await inventurKorrektur({ kommentar: "Stimmt", positionen: [{ artikelId: "art-1", ist: 5 }] }, t.db);
    expect(inventurLaeufe(t.db).laeufe).toHaveLength(1);
  });

  it("begrenzt und meldet das", async () => {
    for (const k of ["a", "b", "c"]) {
      await inventurKorrektur({ kommentar: k, positionen: [{ artikelId: "art-1", ist: 5 }] }, t.db);
    }
    const { laeufe, begrenzt } = inventurLaeufe(t.db, 2);
    expect(laeufe).toHaveLength(2);
    expect(begrenzt).toBe(true);
  });
});

describe("inventurLauf", () => {
  it("liefert Positionen mit Artikelname und Charge, Artikelpositionen ohne Charge", async () => {
    // art-1 mit Charge c-1 ("L1", "2027-01", Rest 5)
    const erg = await inventurKorrektur({
      kommentar: "Detail",
      positionen: [
        { artikelId: "art-1", chargen: [{ chargeId: "c-1", ist: 4 }], neu: [] },
        { artikelId: "art-2", ist: 2 },
      ],
    }, t.db);
    const id = (erg as { ok: true; wert: { inventurId: string } }).wert.inventurId;
    const lauf = inventurLauf(t.db, id)!;
    expect(lauf.kopf.kommentar).toBe("Detail");
    expect(lauf.positionen.map((p) => [p.artikelName, p.chargenNr, p.verfall, p.erwartet, p.gezaehlt])).toEqual([
      ["art-1", "L1", "2027-01", 5, 4],
      ["art-2", null, null, 2, 2],
    ]);
  });

  it("liefert null für eine unbekannte ID", () => {
    expect(inventurLauf(t.db, "gibt-es-nicht")).toBeNull();
  });

  it("macht aus kaputtem umfang null statt eines Wurfs", () => {
    expect(umfangAus("{kaputt")).toBeNull();
    expect(umfangAus(null)).toBeNull();
  });
});
```

(Die Fixture-Helfer `legeArtikelAn`/`legeChargeAn`/`buche` aus `_actions/inventur.test.ts` hier als lokale Funktionen wiederholen — Testdateien teilen keine Helfer in diesem Modul.)

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implementierung** `inventurVerlauf.ts`

```ts
/**
 * DRK-299 — der Verlauf abgeschlossener Inventuren. Kein "use client".
 * ZWEI Abfragen fuer die Liste (Koepfe + Zaehlung je Lauf), keine je Lauf.
 * Laeufe vor DRK-299 gibt es hier nicht — sie stehen nur im Journal.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { artikel, chargen, inventuren, inventurPositionen } from "../../_db/schema";
import { INVENTUR_VERLAUF_GRENZE } from "../grenzen";
import type { Leser } from "./bestand";

export type Umfang = { kategorien: string[]; faecher: string[] } | null;
export type LaufKurz = {
  id: string; ts: Date; quelleTyp: string; quelleId: string; kommentar: string;
  umfang: Umfang; positionen: number; abweichungen: number;
};
export type LaufPosition = {
  id: string; artikelId: string; artikelName: string; einheit: string;
  chargeId: string | null; chargenNr: string | null; verfall: string | null;
  erwartet: number; gezaehlt: number;
};

export function umfangAus(roh: string | null): Umfang {
  if (!roh) return null;
  try {
    const wert = JSON.parse(roh) as { kategorien?: unknown; faecher?: unknown };
    const liste = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
    return { kategorien: liste(wert.kategorien), faecher: liste(wert.faecher) };
  } catch {
    return null;
  }
}

function zaehlungen(db: Leser, ids: string[]): Map<string, { positionen: number; abweichungen: number }> {
  if (ids.length === 0) return new Map();
  const rows = db.select({
    inventurId: inventurPositionen.inventurId,
    positionen: sql<number>`count(*)`,
    abweichungen: sql<number>`sum(case when ${inventurPositionen.gezaehlt} <> ${inventurPositionen.erwartet} then 1 else 0 end)`,
  }).from(inventurPositionen).where(inArray(inventurPositionen.inventurId, ids))
    .groupBy(inventurPositionen.inventurId).all();
  return new Map(rows.map((r) => [r.inventurId, { positionen: r.positionen, abweichungen: r.abweichungen ?? 0 }]));
}

function kurz(k: typeof inventuren.$inferSelect, z: { positionen: number; abweichungen: number } | undefined): LaufKurz {
  return {
    id: k.id, ts: k.ts, quelleTyp: k.quelleTyp, quelleId: k.quelleId, kommentar: k.kommentar,
    umfang: umfangAus(k.umfang), positionen: z?.positionen ?? 0, abweichungen: z?.abweichungen ?? 0,
  };
}

export function inventurLaeufe(db: Leser, grenze: number = INVENTUR_VERLAUF_GRENZE): { laeufe: LaufKurz[]; begrenzt: boolean } {
  // Zweitsortierung nach `id`: `ts` sind UNIX-SEKUNDEN (§5.14.4).
  const koepfe = db.select().from(inventuren).orderBy(desc(inventuren.ts), desc(inventuren.id)).limit(grenze + 1).all();
  const begrenzt = koepfe.length > grenze;
  const sichtbar = koepfe.slice(0, grenze);
  const z = zaehlungen(db, sichtbar.map((k) => k.id));
  return { laeufe: sichtbar.map((k) => kurz(k, z.get(k.id))), begrenzt };
}

export function inventurLauf(db: Leser, id: string): { kopf: LaufKurz; positionen: LaufPosition[] } | null {
  const k = db.select().from(inventuren).where(eq(inventuren.id, id)).get();
  if (!k) return null;
  const positionen = db.select({
    id: inventurPositionen.id, artikelId: inventurPositionen.artikelId,
    artikelName: artikel.name, einheit: artikel.einheit,
    chargeId: inventurPositionen.chargeId, chargenNr: chargen.chargenNr, verfall: chargen.verfall,
    erwartet: inventurPositionen.erwartet, gezaehlt: inventurPositionen.gezaehlt,
  }).from(inventurPositionen)
    .innerJoin(artikel, eq(artikel.id, inventurPositionen.artikelId))
    .leftJoin(chargen, and(eq(chargen.id, inventurPositionen.chargeId)))
    .where(eq(inventurPositionen.inventurId, id))
    .orderBy(asc(artikel.name), asc(chargen.verfall), asc(inventurPositionen.id))
    .all();
  return { kopf: kurz(k, zaehlungen(db, [id]).get(id)), positionen };
}
```

(`and(...)` mit nur einem Argument ist überflüssig — beim Implementieren `eq(...)` direkt verwenden; lint meldet es sonst nicht, ein Reviewer schon.)

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Listenseite.** Vorbild `checks/page.tsx` (Grenze im Text, `ChecksTabelle` mit `detailHref`).
  - `page.tsx` (Server Component, `export const dynamic = "force-dynamic"`), exportiert `verlaufSeitenInhalt(db: DB): ReactNode` für den Test.
  - `SeitenKopf titel="Inventur-Verlauf" zurueck={{ titel: "Inventur", href: "/verwaltung/inventur" }}`; `beschreibung`: „Abgeschlossene Inventuren mit allen gezählten Positionen. Inventuren vor dieser Änderung stehen nur im Journal." — und **nur wenn** `begrenzt`: „Gezeigt werden die neuesten {INVENTUR_VERLAUF_GRENZE}."
  - Projektion (nur Primitive):
    ```ts
    export type VerlaufZeile = {
      id: string; zeitText: string; person: string; kommentar: string;
      umfangText: string; positionen: number; abweichungen: number; detailHref: string;
    };
    ```
    `person = quelleAufloeser(db)(l.quelleTyp, l.quelleId)` (Resolver **einmal** bauen); `umfangText = l.umfang ? [...l.umfang.kategorien, ...l.umfang.faecher.map((f) => `Fach ${f}`)].join(", ") : "vollständig"`; `detailHref = `/verwaltung/inventur/verlauf/${l.id}``.
  - `VerlaufTabelle.tsx`: antd `Table` mit `rowKey="id"`, `pagination={false}`, `scroll={{ x: "max-content" }}`, `aria-label="Inventur-Verlauf"`; Spalten Zeit (Link auf `detailHref`) · Person · Kommentar · Umfang · Positionen · Abweichungen (Chip `gelb`, wenn > 0, sonst `ok` „keine"). Leertext: „Noch keine Inventur abgeschlossen. Starte eine unter Inventur.". Spaltenköpfe über `title` mit `SCHRIFT.feldname`.

- [ ] **Step 6: Detailseite** `[id]/page.tsx` — Signatur und `params`-Form **wörtlich** von `checks/[id]/page.tsx` übernehmen (Next 16: `params` ist ein Promise). Exportiert `laufDetailInhalt(db: DB, id: string): ReactNode`; unbekannte ID → `notFound()`.
  - Kopf: `SeitenKopf titel={`Inventur vom ${fmtTs(kopf.ts)}`} zurueck={{ titel: "Verlauf", href: "/verwaltung/inventur/verlauf" }} beschreibung={`${person} · ${kopf.kommentar} · Umfang: ${umfangText}`}`.
  - `LaufTabelle.tsx` mit Zeilen `{ id, artikelText, chargeText, erwartetText, gezaehltText, differenz: number }` — `chargeText = p.chargenNr ? `${p.chargenNr} · ${fmtVerfall(p.verfall!)}` : "je Artikel"`, Zahlen mit Einheit. Spalten Artikel · Charge · Erwartet · Gezählt · Differenz (Chip: `ok` „stimmt" bei 0, sonst `gelb` mit Vorzeichen `+n`/`-n` — **nie rot**, Falle 3). Für Chargenpositionen desselben Artikels wird `artikelText` ab der zweiten Zeile leer gelassen (Gruppierung ohne zweites Tabellenkonstrukt).
  - Kein Compound-Zugriff auf antd in den beiden `page.tsx` (Falle 1).

- [ ] **Step 7: Seitentests** — je `page.test.tsx` nach dem Muster „Inventurseite als RSC" (`InventurForm.test.tsx:299-330`): Inhalt über die exportierte Funktion mit `migrierteTestDb` erzeugen, die Client-Tabelle per `elementeVomTyp` finden, Props mit `toEqual` prüfen und `istRekursivJsonSicher(props) === true`. Für `[id]`: `notFound` mocken (`vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }))`) und für eine unbekannte ID `toThrow("NOT_FOUND")` erwarten — Vorbild `checks/[id]/page.test.tsx`.

- [ ] **Step 8: Run** `pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade "src/app/m/lagerbuch/verwaltung/(arbeit)/inventur"` und `pnpm typecheck` — Expected: PASS. Zusätzlich prüfen: Deckt `page.auth.test.tsx` (`verwaltung/(arbeit)`) neue Seiten automatisch ab oder zählt es Seiten? Wenn es zählt, nachziehen.

- [ ] **Step 9: Commit** — `feat(lagerbuch): Verlauf abgeschlossener Inventuren` (Body: DRK-299 · Co-Authored-By).

Die Modulnavigation markiert auf `/verwaltung/inventur/verlauf…` **keinen** Eintrag (Suffixvergleich in `aktiverEintrag`); das ist dasselbe Verhalten wie auf `checks/[id]` und bewusst so (`_lib/nav.ts:9-10`). Nicht ändern.

---

### Task 8: Release Note

**Files:**
- Create: `src/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/<datum>-inventur-je-charge.ts`
- Modify: `src/app/m/portal/_lib/neuigkeiten/register.ts` (Import + Eintrag nach `kategorienAusblenden`)

`<datum>` = der Tag, an dem der Stand ausgerollt wird. Bis zum Merge steht dort der **heutige** Tag; lehnt `register.test.ts`/`datum.test.ts` ein zukünftiges Datum ab, gilt ohnehin nur heute. Dateiname, `datum` und `slug` müssen zusammenpassen (Dreieck).

- [ ] **Step 1:**

```ts
// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "inventur-je-charge",
  datum: "<datum>",
  titel: "Inventur je Charge und mit Verlauf",
  inhalt: [
    absatz(
      "In der Inventur klappst du einen Artikel auf und zählst je Charge. Eine Charge, die im Regal liegt, " +
        "aber fehlt, ergänzt du dort mit ihrem MHD. Über Kategorie und Fach begrenzt du die Liste.",
    ),
    absatz("Unter Verwaltung → Inventur → Verlauf findest du jede abgeschlossene Inventur mit allen gezählten Positionen."),
  ],
};

export default notiz;
```

- [ ] **Step 2: Run** `pnpm vitest run src/app/m/portal/_lib/neuigkeiten` — Expected: PASS (Grenzen, Werbewörter, Markdown, Dreieck).
- [ ] **Step 3: Commit** — `docs(portal): Notiz zur Inventur je Charge` (Body: DRK-299 · Co-Authored-By).

---

### Task 9: E2E — die Klasse, die Vitest nicht sieht

**Files:**
- Modify: `e2e/seed-lagerbuch.ts` — `inventurFixtures()` + Aufruf vor dem `console.log`
- Create: `e2e/lagerbuch-inventur.spec.ts`

- [ ] **Step 1: Seed prüfen, bevor geseedet wird.** Ein **aktiver** Artikel erscheint in Etiketten, Kennzahlen, Helfer-Ansicht und Inventur. Vorher lesen: `rg -n "toHaveCount|tbody tr|Artikel\b.*\d" e2e/lagerbuch-*.spec.ts` und `e2e/seed-lagerbuch.ts:110-128` (Lehre I-14). Zählt ein Spec aktive Artikel, dort die Erwartung **nicht** anpassen, sondern den Fixture-Artikel so wählen, dass er nicht mitzählt, oder melden.

```ts
/**
 * DRK-299 — ein EIGENER aktiver Artikel mit zwei Chargen fuer
 * `lagerbuch-inventur.spec.ts`. Eigene Chargen, weil der Spec BUCHT: ein
 * geteilter Artikel veraenderte den Bestand, den andere Specs zusichern (I-14).
 * Verfall weit in der Zukunft (nicht in der Verfallsliste), Mindestbestand 0
 * (nicht in der Bestellliste).
 */
function inventurFixtures(): void {
  const db = getDb();
  db.insert(artikel).values({
    id: "e2e-inventur-artikel", name: "E2E Inventur Kompressen", einheit: "Stk.", fach: "INV-1",
    mindestbestand: 0, aktiv: true, kategorie: "E2E Inventur", createdAt: JETZT,
  }).onConflictDoNothing().run();
  for (const [id, chargenNr, verfall, menge] of [
    ["e2e-inventur-charge-a", "E2E-INV-A", "2031-01", 5],
    ["e2e-inventur-charge-b", "E2E-INV-B", "2032-06", 3],
  ] as const) {
    db.insert(chargen).values({ id, artikelId: "e2e-inventur-artikel", chargenNr, verfall, createdAt: JETZT })
      .onConflictDoNothing().run();
    if (!db.select().from(buchungen).where(eq(buchungen.chargeId, id)).get()) {
      db.insert(buchungen).values({
        id: newId(), ts: JETZT, typ: "zugang", artikelId: "e2e-inventur-artikel", chargeId: id,
        lagerortId: HANDLAGER_ID, menge, quelleTyp: "system", quelleId: "e2e", referenz: null, kommentar: null,
      }).run();
    }
  }
}
```

- [ ] **Step 2: Spec** — `e2e/lagerbuch-inventur.spec.ts`. Login-/Host-Muster aus `e2e/lagerbuch-ux.spec.ts:1-46`; `klickeWennRuhig` aus `e2e/fixtures.ts` (Falle 12); jede auslösende Aktion **prüft ihre Antwort** (Falle 10, zweite Testregel).

```ts
import { expect, test } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

const ARTIKEL = "E2E Inventur Kompressen";

test.describe("Lagerbuch Inventur je Charge (DRK-299)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE, callbackPath: "/verwaltung" });
  });

  test("filtert, zählt je Charge, ergänzt eine Charge und zeigt den Lauf im Verlauf", async ({ page }) => {
    const seite = await page.goto(lagerbuchUrl("/verwaltung/inventur"));
    expect(seite?.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    // Filter „Fach INV-1" — antd-Select: öffnen, tippen, bestätigen.
    await klickeWennRuhig(page.getByLabel("Nach Fach filtern"));
    await page.keyboard.type("INV-1");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    const zeilen = page.locator("tbody tr[data-row-key]");
    await expect(zeilen).toHaveCount(1);

    const aufklappen = page.getByRole("button", { name: `Chargen ${ARTIKEL} anzeigen` });
    const kasten = await aufklappen.boundingBox();
    expect(kasten!.height).toBeGreaterThanOrEqual(44);
    await klickeWennRuhig(aufklappen);

    await page.getByLabel("Ist Charge E2E-INV-A", { exact: true }).fill("4");
    await page.getByLabel("MHD der neuen Charge").fill("2033-02");
    await page.getByLabel("Menge der neuen Charge").fill("2");
    await klickeWennRuhig(page.getByRole("button", { name: "Charge ergänzen" }));
    await expect(page.getByLabel(`Ist-Bestand ${ARTIKEL}`, { exact: true })).toHaveValue("9");

    await page.getByLabel("Kommentar").fill("E2E Chargeninventur");
    const antwort = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
    await klickeWennRuhig(page.locator("button[data-rolle='abschluss']"));
    expect((await antwort).ok()).toBe(true);
    await expect(page.locator(".ant-alert-success")).toContainText("Inventur gebucht");

    await klickeWennRuhig(page.getByRole("link", { name: "Im Verlauf ansehen" }));
    await expect(page).toHaveURL(/\/verwaltung\/inventur\/verlauf\/[A-Za-z0-9_-]+$/);
    const tabelle = page.locator("table");
    await expect(tabelle).toContainText("E2E-INV-A");
    await expect(tabelle).toContainText("Inventur · 02/33");
    await expect(tabelle).not.toContainText("E2E-INV-B"); // nicht angefasst → keine Position

    const liste = await page.goto(lagerbuchUrl("/verwaltung/inventur/verlauf"));
    expect(liste?.status()).toBe(200);
    await expect(page.locator("table")).toContainText("E2E Chargeninventur");
  });
});
```

Die Zeichenketten der Selektoren müssen zu den `aria-label`s aus Task 5/6 passen — bei Abweichung **den Spec** anpassen und die Abweichung im Bericht nennen, nicht die Oberfläche nach dem Test biegen. Heißt der Fixture-Wert für eine leere Nummer nicht „Inventur" (`CHARGE_INVENTUR`), die Erwartung `Inventur · 02/33` daraus ableiten.

- [ ] **Step 3: Run** — `pgrep -fl "next dev"` (Memory: fremde Server nicht töten), dann `pnpm exec playwright test e2e/lagerbuch-inventur.spec.ts e2e/lagerbuch-ux.spec.ts` — Expected: PASS. Danach die **ganze** Lagerbuch-Gruppe `pnpm exec playwright test e2e/lagerbuch-` — der neue aktive Artikel darf keinen anderen Spec rot machen.
- [ ] **Step 4: Commit** — `test(lagerbuch): E2E fuer Inventur je Charge und Verlauf` (Body: DRK-299 · Co-Authored-By).

---

### Task 10: Gesamtprüfung und Bericht

- [ ] **Step 1:** `pnpm typecheck` (Exit-Code 0), `pnpm lint` (keine Fehler), `pnpm vitest run` (ganz; der bekannte lokale Ausreißer `zip`-Route-Test auf macOS/Node 24 ist kein Befund).
- [ ] **Step 2:** `pnpm build` — Exit-Code 0.
- [ ] **Step 3:** `pnpm exec playwright test` — ganz, nach `pgrep`-Prüfung.
- [ ] **Step 4:** Spec-Abgleich: jede Zeile der Spec-Abschnitte A, B, C und „Tests" gegen den Diff (`git diff origin/main --stat`) — Lücken als Befund, nicht still nachbauen, wenn sie den Umfang verändern.
- [ ] **Step 5: Kein Push, kein PR.** Bericht an den Hauptlauf: Commits, Torergebnisse mit Zahlen (Tests gesamt/grün, Playwright-Laufzeit), jede Abweichung vom Plan mit Grund, offene Funde außerhalb des Auftrags (für neue Tickets).
