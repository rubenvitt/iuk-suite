# Einsatzbuch v2 — Stufe 2: Stammdatenpflege, Einstellungen und Schlüsselpaar — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Verwaltung pflegt in der Suite Fahrzeuge, Personal, Alarmstichworte und die Einstellungen des Einsatzbuch-Rechners (mit Stammdatenversion als ETag-Zähler), und die Suite hält ein KEK-verschlüsseltes Schlüsselpaar je Rechnerart, das ein Skript erzeugt, als Notfall-Sicherung ausgibt und wiederherstellt; `packeAusFuer` packt Umschläge dafür aus.

**Architecture:** Neue Tabellen in der Modul-DB `einsatzbuch` mit handgeschriebener Migration (Audit-Trigger plus eigene `stand_*`-Trigger für den Versionszähler). Fachlogik als reine Funktionen unter `_lib/` (Stammdaten, CSV, Einstellungen, Schlüssel), Server Actions unter `_actions/` hinter einem eigenen Host-plus-Gruppen-Riegel, Oberfläche als Client-Inseln mit `Kartentabelle`. Kryptografie über WebCrypto und die Byte-Helfer des Kerns.

**Tech Stack:** Next.js 16 (App Router), antd 6, Drizzle + better-sqlite3, zod 4, WebCrypto (PBKDF2, AES-256-GCM, ECDH P-256), `qrcode` über `src/core/qr`, Vitest 4, Playwright, tsx.

**Spec:** `docs/superpowers/specs/2026-09-24-einsatzbuch-v2-design.md` (§2.3, §5.1, §5.2, §5.4, §8, §9.2, §11 Stufe 2, §12)

**Ticket:** DRK-471. Ticketnummer in jeden Commit-Body. **Kein ClickUp in dieser Phase** (Hauptlauf pflegt das Ticket).

**Arbeitskopie:** `/Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-suite`, Branch `claude/einsatzbuch-v2-stufe-2-3`. Jede Shell-Zeile beginnt mit `cd /Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-suite &&`. Nie eine andere Arbeitskopie, nie `isolation: "worktree"`, nie ein Worktree unter `.claude/worktrees/`.

## Global Constraints

- Deutsche Texte mit echten Umlauten; Bezeichner, Datei- und Branchnamen ASCII.
- Tabellen (Spec §5.1): `fahrzeug` (`id`, `typ`, `kennung` eindeutig, `ruf`, `standort`, `aktiv`), `person` (`id`, `name` „Nachname, Vorname“, `quali`, `ov`, `aktiv`), `stichwort` (`id`, `gruppe`, `name`, `reihenfolge`, `aktiv`), `einstellung` (Schlüssel/Wert), `schluesselpaar` (§12: `rechnerId` NULL = echtes Paar, `art`).
- `rechner`, `anker`, `einmalcode`, `sitzung` kommen **erst in Stufe 5**. `schluesselpaar.rechner_id` hat bis dahin **keinen** Fremdschlüssel.
- Einstellungen: `fristMinuten` 1–120, Vorgabe 15; `besatzung` Vorgabe an; `bereitschaft` Vorgabe „DRK-Bereitschaft Uelzen“.
- Stammdatenversion: ein Zähler, der bei **jeder** Änderung an `fahrzeug`, `person`, `stichwort` oder `einstellung` steigt (ETag für Stufe 5).
- Deaktivieren statt Löschen. Es gibt keine Löschfunktion für Stammdaten.
- `EINSATZBUCH_SCHLUESSEL_KEK`: 32 Byte, base64. Fehlt er oder ist er ungültig: deutlicher Hinweis auf der Übersicht, `packeAusFuer` → Status 503.
- Notfall-Sicherung: PKCS#8 des privaten Schlüssels, PBKDF2-SHA-256 **600 000** Runden + AES-256-GCM, als Datei **und** als QR zum Ausdrucken.
- Freigaberegel (§12): Paar mit `art = "echt"` nur für `kopf.umgebung === "echt"`, Paar mit `art = "test"` nur für `"test"`. Mischversuch → 422.
- Seed: nie am Boot (`bootstrap.ts`), idempotent **pro Entität**, additiv.
- Server Actions: `"use server"` als **allererstes Zeichen** der Datei; jede exportierte Funktion bekommt einen Eintrag in `src/core/audit/coverage-manifest.json`. `notFound()`/`redirect()` nur in `_lib/*.ts`, nie in `page.tsx`/`layout.tsx`.
- Fallen aus `CLAUDE.md`: kein antd-Compound-Zugriff und keine `@ant-design/icons` in Server Components (1, 7); keine `size`-Props (4); `Alert type="warning"` statt `"error"` (3); Spaltentitel als Zeichenkette (17); Drawer-Breite per `flyinBreite` (13); Filterzustand merken (15); Werte aus `"use client"`-Modulen nie in Server Components (6).
- Commits signiert (`git commit -S`), Kopfzeile Conventional Commits (`feat(einsatzbuch): …`, `test`/`docs`/`chore` sonst), Body mit `DRK-471`, Schlusszeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tore (Exit-Code selbst messen): `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/einsatzbuch.spec.ts e2e/einsatzbuch-stammdaten.spec.ts`. Vor jedem Urteil über einen roten Lauf `uptime` und `pgrep -fl "playwright|next-server"`; fremde Prozesse nie beenden.
- `scripts/einsatzbuch-testvektoren.ts` **nie** mit `--neu` aufrufen.

## Entscheidungen (wo die Spec offen ist)

1. **Reiter:** Spec und Briefing verlangen Reiter. Umsetzung als antd `Tabs` mit `items` in einer Client-Insel, der gewählte Reiter steht im Suchparameter `?reiter=fahrzeuge|personal|stichworte`. Die Ablehnung von `Tabs` in `docs/design/feedback-admin.md` gilt der Informationsarchitektur jener Seite.
2. **Migrationen von Hand** (drizzle-kit kennt die Audit-Trigger nicht, Vorbild lagerbuch). Neue Zeile in `_db/migrations/meta/_journal.json`, kein neuer Snapshot.
3. **Versionszähler** als einzeilige Tabelle `stammdatenstand (id = 1, version)`, erhöht durch Trigger `stand_<tabelle>_insert|update|delete`. Die Update-Trigger tragen dasselbe `WHEN`-Prädikat wie die Audit-Trigger, damit ein No-op-Update (z. B. eine CSV-Zeile „unverändert“ oder das Speichern unveränderter Einstellungen) die Version nicht erhöht. `stammdatenstand` ist im Audit-Katalog `excluded`; `catalog.test.ts` zählt nur Trigger `audit_*`.
4. **Schlüsselpaar-Zeile:** `privat_verschluesselt = "<iv base64>:<ct base64>"`, AES-256-GCM mit dem KEK, **AAD = UTF-8 von `einsatzbuch/v1/privat/<schluesselId>`** (eine Zeile lässt sich nicht auf eine andere `schluesselId` umhängen). Klartext ist das PKCS#8. Genau ein echtes Paar: partieller Unique-Index `WHERE art = 'echt'`; CHECK hält `art` und `rechner_id` zusammen (`echt` ⇔ `rechner_id IS NULL`).
5. **`packeAusFuer`** liefert eine Ergebnis-Union statt zu werfen: `{ ok: true, cek, art, rechnerId } | { ok: false, status: 422 | 503, code, meldung }`. 503: KEK fehlt/ungültig, privater Schlüssel mit dem KEK nicht lesbar. 422: unbekannte `schluesselId`, `kopf.schluesselId` ≠ Parameter, Umgebung passt nicht zur Art, Umschlag lässt sich nicht auspacken.
6. **Server Actions geben `ActionErgebnis` zurück** (Muster `lagerbuch/_lib/actionErgebnis.ts`, eigene Kopie im Modul — kein modulübergreifender Import). Der Riegel selbst wirft `Forbidden` (Muster uav).
7. **CSV:** eigener Parser (keine CSV-Bibliothek in der Suite). Feste Kopfzeilen: Fahrzeuge `typ;kennung;ruf;standort`, Personal `name;quali;ov`, Stichworte `gruppe;name;reihenfolge`. Trennzeichen `;`, `,` oder Tab aus der Kopfzeile, Anführungszeichen nach RFC 4180, UTF-8 (mit/ohne BOM), sonst Windows-1252. Abgleich: Fahrzeug über `kennung`, Stichwort über `name` (eindeutig), Person über `name` (mehrere Treffer → Fehlerzeile „mehrdeutig“). Eine importierte Zeile ist aktiv; ein deaktivierter Treffer wird wieder aktiv (Klasse „geändert“). Der Import deaktiviert nichts. Vorschau und Übernahme parsen serverseitig (Vorschau = Probelauf ohne Schreiben).
8. **Stichwortname ist eindeutig** (der Rechner legt den Namen als Zeichenkette in den Block, zwei gleichnamige Stichworte wären dort nicht unterscheidbar).
9. **Schlüssel-Skript** läuft aus einem Checkout desselben Stands gegen `DATA_DIR` (Laufzeit-Image hat weder `scripts/` noch `tsx`; Muster `docs/runbooks/feedback-cutover.md`). Es **migriert nicht**, sondern verlangt, dass die Suite mit diesem Stand einmal gestartet ist (Tabelle vorhanden). Kennwort interaktiv (zweimal, verdeckt) oder aus `EINSATZBUCH_NOTFALL_KENNWORT` (für Tests/Automatisierung). Mindestlänge des Notfall-Kennworts: **16 Zeichen**.
10. **Entwicklungs-KEK:** `ENTWICKLUNGS_KEK = "ZWluc2F0emJ1Y2gtZW50d2lja2x1bmdzLWtlay0zMmI="` (UTF-8 „einsatzbuch-entwicklungs-kek-32b“, 32 Byte). Der Seed legt das Entwicklungs-Paar nur an, wenn kein echtes Paar existiert **und** `EINSATZBUCH_SCHLUESSEL_KEK` fehlt oder gleich dem Entwicklungs-KEK ist. Sonst meldet er, dass er das Paar überspringt.
11. **E2E seedet nicht:** Die Stammdaten-Spec legt ihre Daten selbst an (die Playwright-webServer-Kette bleibt unverändert).
12. **Anmeldeseite, Rechner-Seite, API:** nicht in dieser Stufe (Stufe 5).

## Review Focus

1. **Eine CSV aus Excel unter Windows (Windows-1252, `;`, Umlaute wie „Jürgens“, „Voß“, Felder in Anführungszeichen mit `;` darin)** → Umlaute kommen richtig an, das Feld wird nicht zerschnitten. Gepinnt in `csv.test.ts` (Task 4).
2. **Speichern ohne Änderung** (Einstellungen unverändert gespeichert, CSV mit lauter unveränderten Zeilen) → Version und Audit-Log bleiben unverändert. Gepinnt in `schema.test.ts` (Task 1) und `einstellungen.test.ts` (Task 5).
3. **Suite-Admin ohne Einsatzbuch-Gruppe, fremder Host oder abgemeldet ruft eine Server Action direkt auf** → `Forbidden`, nichts geschrieben, Audit-Zeile. Gepinnt in `zugang.test.ts` (Task 2) und `_actions/*.test.ts` (Task 6).
4. **KEK falsch gesetzt (zu kurz, kein Base64, anderer KEK als beim Erzeugen)** → Übersicht meldet es verständlich, `packeAusFuer` antwortet 503 statt 500. Gepinnt in `status.test.ts`/`freigabe.test.ts` (Task 7).
5. **Zweiter Seed-Lauf und zweites `erzeugen`** → keine zusätzliche Zeile in irgendeiner Tabelle (inklusive `audit_outbox`), Version unverändert; `erzeugen` verweigert bei vorhandenem echtem Paar. Gepinnt in `seedLokal.test.ts` (Task 9) und `verwaltung.test.ts` (Task 8).

---

## Dateistruktur

```
src/app/m/einsatzbuch/
├── _db/
│   ├── schema.ts                         + fahrzeug, person, stichwort, einstellung, schluesselpaar, stammdatenstand
│   └── migrations/0001_stammdaten_schluessel.sql  (+ Journal-Zeile)
├── _lib/
│   ├── testDb.ts                         In-Memory-DB mit echten Migrationen (Tests)
│   ├── actionErgebnis.ts                 ActionErgebnis, zodFehler
│   ├── zugang.ts                         + requireEinsatzbuchAktion, einsatzbuchZugang, einsatzbuchAbweisung
│   ├── nav.ts                            EINSATZBUCH_NAV
│   ├── einstellungen.ts                  Vorgaben, Schema, lesen/schreiben
│   ├── stammdaten/
│   │   ├── typen.ts                      Stammdatenart, DTOs
│   │   ├── schemas.ts                    zod-Eingabeschemas
│   │   ├── daten.ts                      Listen, Anlegen, Ändern, Aktiv setzen, stammdatenVersion
│   │   ├── csv.ts                        dekodiere, parseCsv, planeImport (rein, auch im Browser)
│   │   ├── import.ts                     bestandFuerImport, wendeImportAn (Server)
│   │   └── vorlage.ts                    GRUPPEN/ORTE/FZ/PERSONAL aus der Vorlage
│   ├── schluessel/
│   │   ├── kek.ts                        kekAusUmgebung, ENTWICKLUNGS_KEK
│   │   ├── paar.ts                       verschluesselePrivat, entschluesselePrivat, legePaarAn, paarZuId
│   │   ├── freigabe.ts                   packeAusFuer
│   │   ├── status.ts                     schluesselStatus (Übersicht)
│   │   ├── notfall.ts                    Notfalldatei: erzeuge, öffne, QR-Druckseite
│   │   └── verwaltung.ts                 erzeugeEchtesPaar, stelleEchtesPaarWiederHer (Skriptlogik)
│   └── seedLokal.ts                      Stammdaten aus der Vorlage + Entwicklungs-Paar
├── _actions/ stammdaten.ts · einstellungen.ts
├── _ui/
│   ├── KekHinweis.tsx                    Client-Insel mit Alert
│   ├── EinstellungenFormular.tsx
│   └── stammdaten/ Stammdaten.tsx · StammdatenTabelle.tsx · StammdatenFormular.tsx · CsvImport.tsx
└── (verwaltung)/ layout.tsx (+nav) · page.tsx (Übersicht) · stammdaten/page.tsx · einstellungen/page.tsx
scripts/einsatzbuch-schluessel.ts
docs/runbooks/einsatzbuch-schluessel.md
e2e/einsatzbuch-stammdaten.spec.ts
```

Geändert außerdem: `src/core/audit/catalog.ts`, `src/core/audit/coverage-manifest.json`, `src/core/shell/types.ts`, `src/core/shell/navIkonen.tsx`, `src/core/shell/navIkonen.test.tsx`, `package.json`, `.env.example`, `e2e/gruppen.json`.

Im Folgenden steht `M` für `src/app/m/einsatzbuch`.

---

### Task 1: Tabellen, Versionszähler und Audit-Katalog

**Files:**
- Modify: `M/_db/schema.ts`, `M/_db/migrations/meta/_journal.json`, `src/core/audit/catalog.ts`
- Create: `M/_db/migrations/0001_stammdaten_schluessel.sql`, `M/_lib/testDb.ts`
- Test: `M/_db/schema.test.ts`

**Interfaces:**
- Produces: Drizzle-Tabellen `fahrzeug`, `person`, `stichwort`, `einstellung`, `schluesselpaar`, `stammdatenstand` (Export aus `M/_db/schema.ts`); `testDb(): TestDb` aus `M/_lib/testDb.ts`.

- [ ] **Step 1: Test schreiben** — `M/_db/schema.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../_lib/testDb";
import { einstellung, fahrzeug, schluesselpaar } from "./schema";

const version = (db: ReturnType<typeof testDb>) =>
  (db.all(sql`SELECT version FROM stammdatenstand WHERE id = 1`) as { version: number }[])[0].version;
const outbox = (db: ReturnType<typeof testDb>) =>
  (db.all(sql`SELECT count(*) AS n FROM audit_outbox`) as { n: number }[])[0].n;
const FZ = { id: "11-83-1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen", aktiv: true };
const PAAR = { schluesselId: "0123456789abcdef", oeffentlich: "AAAA", privatVerschluesselt: "AAAA:AAAA", erzeugtAm: new Date(0) };

describe("Stammdatenversion", () => {
  it("startet bei 0 und steigt bei Anlegen, echter Änderung und Löschen", () => {
    const db = testDb();
    expect(version(db)).toBe(0);
    db.insert(fahrzeug).values(FZ).run();
    expect(version(db)).toBe(1);
    db.update(fahrzeug).set({ ruf: "Rotkreuz Uelzen 83/1" }).where(eq(fahrzeug.id, FZ.id)).run();
    expect(version(db)).toBe(2);
    db.delete(fahrzeug).where(eq(fahrzeug.id, FZ.id)).run();
    expect(version(db)).toBe(3);
  });
  it("ein Update ohne Änderung erhöht weder Version noch Audit-Log", () => {
    const db = testDb();
    db.insert(fahrzeug).values(FZ).run();
    const [v, n] = [version(db), outbox(db)];
    db.update(fahrzeug).set({ ruf: FZ.ruf }).where(eq(fahrzeug.id, FZ.id)).run();
    expect([version(db), outbox(db)]).toEqual([v, n]);
  });
  it("auch Einstellungen zählen", () => {
    const db = testDb();
    db.insert(einstellung).values({ schluessel: "fristMinuten", wert: "30" }).run();
    expect(version(db)).toBe(1);
  });
  it("Änderungen landen mit Tabellenname in der Audit-Outbox", () => {
    const db = testDb();
    db.insert(fahrzeug).values(FZ).run();
    const zeilen = db.all(sql`SELECT action, object_type FROM audit_outbox`) as { action: string; object_type: string }[];
    expect(zeilen).toContainEqual({ action: "create", object_type: "fahrzeug" });
  });
});

describe("schluesselpaar", () => {
  it("genau ein echtes Paar", () => {
    const db = testDb();
    db.insert(schluesselpaar).values({ id: "a", art: "echt", rechnerId: null, ...PAAR }).run();
    expect(() => db.insert(schluesselpaar).values({ id: "b", art: "echt", rechnerId: null, ...PAAR, schluesselId: "fedcba9876543210" }).run()).toThrow();
  });
  it("echt ⇔ ohne Rechner, test ⇔ mit Rechner; beliebig viele Testpaare", () => {
    const db = testDb();
    expect(() => db.insert(schluesselpaar).values({ id: "a", art: "echt", rechnerId: "r1", ...PAAR }).run()).toThrow();
    expect(() => db.insert(schluesselpaar).values({ id: "b", art: "test", rechnerId: null, ...PAAR }).run()).toThrow();
    db.insert(schluesselpaar).values({ id: "c", art: "test", rechnerId: "r1", ...PAAR }).run();
    db.insert(schluesselpaar).values({ id: "d", art: "test", rechnerId: "r2", ...PAAR, schluesselId: "1111111111111111" }).run();
  });
  it("die schluesselId ist eindeutig und 16 Zeichen Hex", () => {
    const db = testDb();
    db.insert(schluesselpaar).values({ id: "a", art: "test", rechnerId: "r1", ...PAAR }).run();
    expect(() => db.insert(schluesselpaar).values({ id: "b", art: "test", rechnerId: "r2", ...PAAR }).run()).toThrow();
    expect(() => db.insert(schluesselpaar).values({ id: "c", art: "test", rechnerId: "r3", ...PAAR, schluesselId: "XYZ" }).run()).toThrow();
  });
});
```

- [ ] **Step 2: Test laufen lassen, er scheitert** (`cd … && pnpm vitest run src/app/m/einsatzbuch/_db/schema.test.ts`, erwartet: Import von `../_lib/testDb` bzw. `fahrzeug` fehlt).

- [ ] **Step 3: `M/_lib/testDb.ts`** (Muster `uav/_lib/testDb.ts`)

```ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../_db/schema";

/** Frische In-Memory-DB mit den echten Migrationen (inklusive Audit- und Versions-Trigger). */
export function testDb() {
  const db = drizzle(openModuleDatabase(":memory:"), { schema });
  migrate(db, { migrationsFolder: "src/app/m/einsatzbuch/_db/migrations" });
  return db;
}
export type TestDb = ReturnType<typeof testDb>;
```

- [ ] **Step 4: Schema** — `M/_db/schema.ts` ersetzt den Stufe-1-Kommentar (Einsätze liegen weiterhin nie hier) und ergänzt:

```ts
export { auditOutbox } from "@/core/audit/_db/schema";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const fahrzeug = sqliteTable("fahrzeug", {
  id: text("id").primaryKey(),
  typ: text("typ").notNull(),
  kennung: text("kennung").notNull().unique(),
  ruf: text("ruf").notNull(),
  standort: text("standort").notNull(),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
});
export const person = sqliteTable("person", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  quali: text("quali").notNull(),
  ov: text("ov").notNull(),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
});
export const stichwort = sqliteTable("stichwort", {
  id: text("id").primaryKey(),
  gruppe: text("gruppe").notNull(),
  name: text("name").notNull().unique(),
  reihenfolge: integer("reihenfolge").notNull(),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
});
/** Schlüssel/Wert; `wert` ist JSON (Zahl, Wahrheitswert, Zeichenkette). */
export const einstellung = sqliteTable("einstellung", {
  schluessel: text("schluessel").primaryKey(),
  wert: text("wert").notNull(),
});
/**
 * Spec §5.1 + §12: `rechnerId` NULL = das echte Paar (genau eines), sonst ein Test-Paar.
 * Der Fremdschlüssel auf `rechner` kommt mit Stufe 5. `privatVerschluesselt` ist
 * "<iv base64>:<ct base64>", AES-256-GCM mit dem KEK, AAD = `einsatzbuch/v1/privat/<schluesselId>`.
 */
export const schluesselpaar = sqliteTable("schluesselpaar", {
  id: text("id").primaryKey(),
  rechnerId: text("rechner_id"),
  art: text("art", { enum: ["echt", "test"] }).notNull(),
  schluesselId: text("schluessel_id").notNull().unique(),
  oeffentlich: text("oeffentlich").notNull(),
  privatVerschluesselt: text("privat_verschluesselt").notNull(),
  erzeugtAm: integer("erzeugt_am", { mode: "timestamp" }).notNull(),
}, (t) => [
  uniqueIndex("schluesselpaar_echt_einzig").on(t.art).where(sql`art = 'echt'`),
  check("schluesselpaar_art_rechner", sql`(art = 'echt' AND rechner_id IS NULL) OR (art = 'test' AND rechner_id IS NOT NULL)`),
]);
/** Genau eine Zeile (id = 1). Trigger `stand_*` zählen jede Änderung an den vier Stammdatentabellen. */
export const stammdatenstand = sqliteTable("stammdatenstand", {
  id: integer("id").primaryKey(),
  version: integer("version").notNull(),
});
```

- [ ] **Step 5: Migration** — `M/_db/migrations/0001_stammdaten_schluessel.sql`. Alle Anweisungen durch `--> statement-breakpoint` getrennt. Tabellen:

```sql
CREATE TABLE `fahrzeug` (
	`id` text PRIMARY KEY NOT NULL,
	`typ` text NOT NULL,
	`kennung` text NOT NULL,
	`ruf` text NOT NULL,
	`standort` text NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fahrzeug_kennung_unique` ON `fahrzeug` (`kennung`);
--> statement-breakpoint
CREATE TABLE `person` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`quali` text NOT NULL,
	`ov` text NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stichwort` (
	`id` text PRIMARY KEY NOT NULL,
	`gruppe` text NOT NULL,
	`name` text NOT NULL,
	`reihenfolge` integer NOT NULL,
	`aktiv` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stichwort_name_unique` ON `stichwort` (`name`);
--> statement-breakpoint
CREATE TABLE `einstellung` (
	`schluessel` text PRIMARY KEY NOT NULL,
	`wert` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schluesselpaar` (
	`id` text PRIMARY KEY NOT NULL,
	`rechner_id` text,
	`art` text NOT NULL,
	`schluessel_id` text NOT NULL,
	`oeffentlich` text NOT NULL,
	`privat_verschluesselt` text NOT NULL,
	`erzeugt_am` integer NOT NULL,
	CONSTRAINT "schluesselpaar_art_rechner" CHECK((art = 'echt' AND rechner_id IS NULL) OR (art = 'test' AND rechner_id IS NOT NULL)),
	CONSTRAINT "schluesselpaar_id_hex" CHECK(length(schluessel_id) = 16 AND schluessel_id NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schluesselpaar_schluessel_id_unique` ON `schluesselpaar` (`schluessel_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `schluesselpaar_echt_einzig` ON `schluesselpaar` (`art`) WHERE art = 'echt';
--> statement-breakpoint
CREATE TABLE `stammdatenstand` (
	`id` integer PRIMARY KEY NOT NULL CHECK(id = 1),
	`version` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `stammdatenstand` (`id`, `version`) VALUES (1, 0);
```

Danach je auditierter Tabelle (`fahrzeug`, `person`, `stichwort`, `schluesselpaar` mit PK `id`; `einstellung` mit PK `schluessel`) die drei Audit-Trigger nach `src/app/m/uav/_db/migrations/0001_audit_outbox.sql`, Modul `'einsatzbuch'`, `object_type` = Tabellenname. Beispiel `fahrzeug`:

```sql
CREATE TRIGGER audit_fahrzeug_create AFTER INSERT ON "fahrzeug"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'create', 'fahrzeug', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_fahrzeug_update AFTER UPDATE ON "fahrzeug"
WHEN OLD."id" IS NOT NEW."id" OR OLD."typ" IS NOT NEW."typ" OR OLD."kennung" IS NOT NEW."kennung" OR OLD."ruf" IS NOT NEW."ruf" OR OLD."standort" IS NOT NEW."standort" OR OLD."aktiv" IS NOT NEW."aktiv"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'update', 'fahrzeug', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_fahrzeug_delete AFTER DELETE ON "fahrzeug"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'einsatzbuch', 'delete', 'fahrzeug', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
```

Und je Stammdatentabelle (`fahrzeug`, `person`, `stichwort`, `einstellung`) die drei Versions-Trigger, der Update-Trigger mit **demselben** `WHEN` wie der Audit-Update-Trigger:

```sql
CREATE TRIGGER stand_fahrzeug_insert AFTER INSERT ON "fahrzeug"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER stand_fahrzeug_update AFTER UPDATE ON "fahrzeug"
WHEN OLD."id" IS NOT NEW."id" OR OLD."typ" IS NOT NEW."typ" OR OLD."kennung" IS NOT NEW."kennung" OR OLD."ruf" IS NOT NEW."ruf" OR OLD."standort" IS NOT NEW."standort" OR OLD."aktiv" IS NOT NEW."aktiv"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
--> statement-breakpoint
CREATE TRIGGER stand_fahrzeug_delete AFTER DELETE ON "fahrzeug"
BEGIN UPDATE stammdatenstand SET version = version + 1 WHERE id = 1; END;
```

Journal: in `meta/_journal.json` einen Eintrag `{ "idx": 1, "version": "6", "when": <Date.now() beim Schreiben>, "tag": "0001_stammdaten_schluessel", "breakpoints": true }` anhängen (Format des vorhandenen Eintrags übernehmen).

- [ ] **Step 6: Audit-Katalog** — in `src/core/audit/catalog.ts` den leeren Eintrag `"einsatzbuch": {}` ersetzen:

```ts
  "einsatzbuch": {
    "fahrzeug": { "mode": "audited", "primaryKey": ["id"] },
    "person": { "mode": "audited", "primaryKey": ["id"] },
    "stichwort": { "mode": "audited", "primaryKey": ["id"] },
    "einstellung": { "mode": "audited", "primaryKey": ["schluessel"] },
    "schluesselpaar": { "mode": "audited", "primaryKey": ["id"] },
    "stammdatenstand": { "mode": "excluded", "reason": "Technischer Versionszähler (ETag); jede Änderung, die ihn erhöht, steht bereits als Audit-Zeile der Stammdatentabelle im Log." },
  },
```

- [ ] **Step 7: Tests laufen lassen** — `pnpm vitest run src/app/m/einsatzbuch/_db/schema.test.ts src/core/audit/catalog.test.ts src/core/bootstrap.test.ts` → PASS.

- [ ] **Step 8: Commit** — `feat(einsatzbuch): Tabellen für Stammdaten, Einstellungen und Schlüsselpaar mit Versionszähler`

---

### Task 2: Riegel für Server Actions und Route Handler

**Files:**
- Modify: `M/_lib/zugang.ts`
- Test: `M/_lib/zugang.test.ts` (erweitern)

**Interfaces:**
- Consumes: `istEinsatzbuchHost(headers)` aus `M/_lib/host.ts`, `hatEinsatzbuchZugang`.
- Produces:
  - `requireEinsatzbuchAktion(): Promise<Viewer>` — für Server Actions; Reihenfolge Host → Sitzung → Gruppe; wirft `new Error("Forbidden")`, jeweils mit Audit (`auditDenied` bzw. `auditLoginRequired`).
  - `einsatzbuchZugang(): Promise<{ ok: true; viewer: Viewer } | { ok: false; response: Response }>` — für Route Handler **nach** `hostAbweisung`: ohne Sitzung 401, ohne Gruppe 403, jeweils mit Audit.
  - `einsatzbuchAbweisung(): Promise<Response | null>`.
  - `type Viewer = NonNullable<Awaited<ReturnType<typeof auth>>>["user"]`.

- [ ] **Step 1: Tests ergänzen** — in `M/_lib/zugang.test.ts` einen zweiten `describe`-Block mit Mocks:

```ts
import { beforeEach, vi } from "vitest";
const zustand: { host: string; user: { sub: string; name: string; groups: string[] } | null } = { host: "einsatzbuch.localtest.me", user: null };
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: zustand.host }) }));
vi.mock("@/core/auth", () => ({ auth: async () => (zustand.user ? { user: zustand.user } : null) }));
const audit = vi.hoisted(() => ({ denied: vi.fn(), login: vi.fn() }));
vi.mock("@/core/audit/server", async (orig) => ({
  ...(await orig<typeof import("@/core/audit/server")>()),
  auditDenied: audit.denied, auditLoginRequired: audit.login,
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (z: string) => { throw new Error(`NEXT_REDIRECT ${z}`); },
}));

describe("Riegel mit Audit-Zweigen", () => {
  beforeEach(() => { zustand.host = "einsatzbuch.localtest.me"; zustand.user = null; audit.denied.mockClear(); audit.login.mockClear(); });
  const mitGruppe = { sub: "s1", name: "Jana", groups: ["einsatzbuch-verwaltung"] };
  const admin = { sub: "s2", name: "Chef", groups: ["dashboard-admins"] };

  it("requireEinsatzbuchZugang: ohne Sitzung → Login mit Audit, ohne Gruppe → 404 mit Audit", async () => {
    const { requireEinsatzbuchZugang } = await import("./zugang");
    await expect(requireEinsatzbuchZugang()).rejects.toThrow("NEXT_REDIRECT");
    expect(audit.login).toHaveBeenCalledWith("einsatzbuch");
    zustand.user = admin;
    await expect(requireEinsatzbuchZugang()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(audit.denied).toHaveBeenCalledTimes(1);
    zustand.user = mitGruppe;
    await expect(requireEinsatzbuchZugang()).resolves.toMatchObject({ sub: "s1" });
  });
  it("requireEinsatzbuchAktion: fremder Host, ohne Sitzung, ohne Gruppe → Forbidden mit Audit", async () => {
    const { requireEinsatzbuchAktion } = await import("./zugang");
    zustand.user = mitGruppe; zustand.host = "feedback.localtest.me";
    await expect(requireEinsatzbuchAktion()).rejects.toThrow("Forbidden");
    expect(audit.denied).toHaveBeenCalledTimes(1);
    zustand.host = "einsatzbuch.localtest.me"; zustand.user = null;
    await expect(requireEinsatzbuchAktion()).rejects.toThrow("Forbidden");
    expect(audit.login).toHaveBeenCalledTimes(1);
    zustand.user = admin;
    await expect(requireEinsatzbuchAktion()).rejects.toThrow("Forbidden");
    expect(audit.denied).toHaveBeenCalledTimes(2);
    zustand.user = mitGruppe;
    await expect(requireEinsatzbuchAktion()).resolves.toMatchObject({ sub: "s1" });
  });
  it("einsatzbuchZugang: 401 ohne Sitzung, 403 ohne Gruppe, ok mit Gruppe", async () => {
    const { einsatzbuchZugang } = await import("./zugang");
    const ohne = await einsatzbuchZugang();
    expect(ohne.ok ? 0 : ohne.response.status).toBe(401);
    zustand.user = admin;
    const fremd = await einsatzbuchZugang();
    expect(fremd.ok ? 0 : fremd.response.status).toBe(403);
    zustand.user = mitGruppe;
    expect((await einsatzbuchZugang()).ok).toBe(true);
  });
});
```

Hinweis: Prüfe vor dem Test, welchen Header `resolveHost` (`src/core/routing.ts`) liest; der Mock liefert `host`.

- [ ] **Step 2: Test scheitert** (Funktionen fehlen).

- [ ] **Step 3: Implementierung** in `M/_lib/zugang.ts` ergänzen:

```ts
import { headers } from "next/headers";
import { istEinsatzbuchHost } from "./host";

export type Viewer = NonNullable<NonNullable<Awaited<ReturnType<typeof auth>>>["user"]>;

/**
 * Riegel für Server Actions. Actions laufen ohne Layout, deshalb prüft er den Host selbst
 * (erst Host, dann Sitzung, dann Gruppe) und wirft statt umzuleiten.
 */
export async function requireEinsatzbuchAktion(): Promise<Viewer> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istEinsatzbuchHost(kopf)) { auditDenied("einsatzbuch", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { auditLoginRequired("einsatzbuch"); throw new Error("Forbidden"); }
  if (!hatEinsatzbuchZugang(viewer.groups)) { auditDenied("einsatzbuch", auditActor(viewer)); throw new Error("Forbidden"); }
  return viewer;
}

/** Für Route Handler: NACH `hostAbweisung` rufen. Antwortform statt Wurf (Vorbild `uav/_lib/requireUavAdmin.ts`). */
export async function einsatzbuchZugang(): Promise<{ ok: true; viewer: Viewer } | { ok: false; response: Response }> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("einsatzbuch");
    return { ok: false, response: Response.json({ error: { code: "unauthenticated", message: "Anmeldung erforderlich" } }, { status: 401 }) };
  }
  if (!hatEinsatzbuchZugang(viewer.groups)) {
    auditDenied("einsatzbuch", auditActor(viewer));
    return { ok: false, response: Response.json({ error: { code: "forbidden", message: "Kein Zugang zum Einsatzbuch" } }, { status: 403 }) };
  }
  return { ok: true, viewer };
}

export async function einsatzbuchAbweisung(): Promise<Response | null> {
  const z = await einsatzbuchZugang();
  return z.ok ? null : z.response;
}
```

- [ ] **Step 4: Tests grün** (`pnpm vitest run src/app/m/einsatzbuch/_lib/zugang.test.ts`).
- [ ] **Step 5: Commit** — `feat(einsatzbuch): Riegel für Server Actions und Route Handler mit Audit`

---

### Task 3: Stammdaten — Typen, Schemas, Datenzugriff

**Files:**
- Create: `M/_lib/stammdaten/typen.ts`, `M/_lib/stammdaten/schemas.ts`, `M/_lib/stammdaten/daten.ts`
- Test: `M/_lib/stammdaten/daten.test.ts`

**Interfaces:**
- Consumes: Tabellen aus Task 1, `testDb()`.
- Produces:
  - `type Stammdatenart = "fahrzeuge" | "personal" | "stichworte"`; `STAMMDATENARTEN: readonly Stammdatenart[]`.
  - `FahrzeugDTO { id; typ; kennung; ruf; standort; aktiv: boolean }`, `PersonDTO { id; name; quali; ov; aktiv }`, `StichwortDTO { id; gruppe; name; reihenfolge: number; aktiv }`.
  - zod: `fahrzeugEingabe`, `personEingabe`, `stichwortEingabe` (Typen `FahrzeugEingabe` usw. = DTO ohne `id`, mit `aktiv`).
  - `listeFahrzeuge(db)`, `listePersonal(db)`, `listeStichworte(db)`.
  - `speichereFahrzeug(db, id: string | null, e: FahrzeugEingabe): FahrzeugDTO`, `speicherePerson(…)`, `speichereStichwort(…)` — `id === null` legt an (`nanoid()`).
  - `setzeAktiv(db, art: Stammdatenart, id: string, aktiv: boolean): void`.
  - Fehlerklassen `NichtGefunden`, `SchonVergeben` (mit `feld: "kennung" | "name"`).
  - `stammdatenVersion(db): number`.

- [ ] **Step 1: Test** — `M/_lib/stammdaten/daten.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { testDb } from "../testDb";
import { fahrzeugEingabe, personEingabe, stichwortEingabe } from "./schemas";
import {
  NichtGefunden, SchonVergeben, listeFahrzeuge, listePersonal, listeStichworte, setzeAktiv,
  speichereFahrzeug, speicherePerson, speichereStichwort, stammdatenVersion,
} from "./daten";

const FZ = { typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen", aktiv: true };

describe("Stammdaten", () => {
  it("legt an, ändert, deaktiviert und zählt die Version hoch", () => {
    const db = testDb();
    const f = speichereFahrzeug(db, null, FZ);
    expect(stammdatenVersion(db)).toBe(1);
    speichereFahrzeug(db, f.id, { ...FZ, ruf: "Rotkreuz Uelzen 83-1" });
    setzeAktiv(db, "fahrzeuge", f.id, false);
    expect(listeFahrzeuge(db)).toEqual([{ ...FZ, id: f.id, ruf: "Rotkreuz Uelzen 83-1", aktiv: false }]);
    expect(stammdatenVersion(db)).toBe(3);
  });
  it("doppelte Kennung bzw. doppelter Stichwortname → SchonVergeben", () => {
    const db = testDb();
    speichereFahrzeug(db, null, FZ);
    expect(() => speichereFahrzeug(db, null, FZ)).toThrow(SchonVergeben);
    speichereStichwort(db, null, { gruppe: "MANV", name: "MANV 10", reihenfolge: 2, aktiv: true });
    expect(() => speichereStichwort(db, null, { gruppe: "Sonstiges", name: "MANV 10", reihenfolge: 1, aktiv: true })).toThrow(SchonVergeben);
  });
  it("unbekannte ID → NichtGefunden", () => {
    const db = testDb();
    expect(() => speichereFahrzeug(db, "gibt-es-nicht", FZ)).toThrow(NichtGefunden);
    expect(() => setzeAktiv(db, "personal", "gibt-es-nicht", false)).toThrow(NichtGefunden);
  });
  it("sortiert: Fahrzeuge nach Standort/Kennung, Personal nach Name (de), Stichworte nach Gruppe/Reihenfolge", () => {
    const db = testDb();
    speicherePerson(db, null, { name: "Voß, Anke", quali: "SanH", ov: "Uelzen", aktiv: true });
    speicherePerson(db, null, { name: "Albers, Jana", quali: "ZF", ov: "Uelzen", aktiv: true });
    expect(listePersonal(db).map((p) => p.name)).toEqual(["Albers, Jana", "Voß, Anke"]);
    speichereStichwort(db, null, { gruppe: "MANV", name: "MANV 25", reihenfolge: 3, aktiv: true });
    speichereStichwort(db, null, { gruppe: "MANV", name: "MANV 5", reihenfolge: 1, aktiv: true });
    expect(listeStichworte(db).map((s) => s.name)).toEqual(["MANV 5", "MANV 25"]);
  });
});

describe("Eingabeschemas", () => {
  it("trimmt und verlangt Pflichtfelder", () => {
    expect(fahrzeugEingabe.parse({ ...FZ, typ: "  RTW " }).typ).toBe("RTW");
    expect(fahrzeugEingabe.safeParse({ ...FZ, kennung: "" }).success).toBe(false);
  });
  it("Name nur als „Nachname, Vorname“", () => {
    expect(personEingabe.safeParse({ name: "Jana Albers", quali: "ZF", ov: "Uelzen", aktiv: true }).success).toBe(false);
    expect(personEingabe.safeParse({ name: "Albers, Jana", quali: "ZF", ov: "Uelzen", aktiv: true }).success).toBe(true);
  });
  it("Reihenfolge ist eine ganze Zahl von 0 bis 9999", () => {
    expect(stichwortEingabe.safeParse({ gruppe: "RD", name: "RD 1", reihenfolge: 1.5, aktiv: true }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Test scheitert.**

- [ ] **Step 3: `typen.ts`**

```ts
export type Stammdatenart = "fahrzeuge" | "personal" | "stichworte";
export const STAMMDATENARTEN: readonly Stammdatenart[] = ["fahrzeuge", "personal", "stichworte"];
export interface FahrzeugDTO { id: string; typ: string; kennung: string; ruf: string; standort: string; aktiv: boolean }
export interface PersonDTO { id: string; name: string; quali: string; ov: string; aktiv: boolean }
export interface StichwortDTO { id: string; gruppe: string; name: string; reihenfolge: number; aktiv: boolean }
```

- [ ] **Step 4: `schemas.ts`** (keine Direktive; wird in Client und Server gelesen)

```ts
import { z } from "zod";

const text = (max: number, feld: string) =>
  z.string().trim().min(1, `${feld} fehlt`).max(max, `${feld} ist länger als ${max} Zeichen`);

export const fahrzeugEingabe = z.object({
  typ: text(20, "Typ"), kennung: text(20, "Kennung"), ruf: text(80, "Funkrufname"), standort: text(60, "Standort"),
  aktiv: z.boolean(),
});
export const personEingabe = z.object({
  name: text(80, "Name").regex(/^[^,]+, [^,]+$/, "Name bitte als „Nachname, Vorname“"),
  quali: text(20, "Qualifikation"), ov: text(60, "Ortsverein"), aktiv: z.boolean(),
});
export const stichwortEingabe = z.object({
  gruppe: text(40, "Gruppe"), name: text(40, "Stichwort"),
  reihenfolge: z.number().int("Reihenfolge ist eine ganze Zahl").min(0).max(9999), aktiv: z.boolean(),
});
export type FahrzeugEingabe = z.infer<typeof fahrzeugEingabe>;
export type PersonEingabe = z.infer<typeof personEingabe>;
export type StichwortEingabe = z.infer<typeof stichwortEingabe>;
```

- [ ] **Step 5: `daten.ts`**

```ts
import { asc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";
import * as schema from "../../_db/schema";
import { fahrzeug, person, stichwort } from "../../_db/schema";
import type { FahrzeugEingabe, PersonEingabe, StichwortEingabe } from "./schemas";
import type { FahrzeugDTO, PersonDTO, Stammdatenart, StichwortDTO } from "./typen";

export type Db = BetterSQLite3Database<typeof schema>;

export class NichtGefunden extends Error { constructor() { super("Eintrag nicht gefunden"); } }
export class SchonVergeben extends Error {
  constructor(readonly feld: "kennung" | "name") { super(feld === "kennung" ? "Diese Kennung gibt es schon." : "Dieses Stichwort gibt es schon."); }
}

function eindeutig<T>(feld: "kennung" | "name", schreiben: () => T): T {
  try { return schreiben(); } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed/.test(e.message)) throw new SchonVergeben(feld);
    throw e;
  }
}

export function listeFahrzeuge(db: Db): FahrzeugDTO[] {
  return db.select().from(fahrzeug).orderBy(asc(fahrzeug.standort), asc(fahrzeug.kennung)).all();
}
export function listePersonal(db: Db): PersonDTO[] {
  return db.select().from(person).all().sort((a, b) => a.name.localeCompare(b.name, "de"));
}
export function listeStichworte(db: Db): StichwortDTO[] {
  return db.select().from(stichwort).orderBy(asc(stichwort.gruppe), asc(stichwort.reihenfolge), asc(stichwort.name)).all();
}

export function speichereFahrzeug(db: Db, id: string | null, e: FahrzeugEingabe): FahrzeugDTO {
  return eindeutig("kennung", () => {
    if (id === null) return db.insert(fahrzeug).values({ id: nanoid(), ...e }).returning().get();
    const z = db.update(fahrzeug).set(e).where(eq(fahrzeug.id, id)).returning().get();
    if (!z) throw new NichtGefunden();
    return z;
  });
}
export function speicherePerson(db: Db, id: string | null, e: PersonEingabe): PersonDTO {
  if (id === null) return db.insert(person).values({ id: nanoid(), ...e }).returning().get();
  const z = db.update(person).set(e).where(eq(person.id, id)).returning().get();
  if (!z) throw new NichtGefunden();
  return z;
}
export function speichereStichwort(db: Db, id: string | null, e: StichwortEingabe): StichwortDTO {
  return eindeutig("name", () => {
    if (id === null) return db.insert(stichwort).values({ id: nanoid(), ...e }).returning().get();
    const z = db.update(stichwort).set(e).where(eq(stichwort.id, id)).returning().get();
    if (!z) throw new NichtGefunden();
    return z;
  });
}

const TABELLE = { fahrzeuge: fahrzeug, personal: person, stichworte: stichwort } as const;

export function setzeAktiv(db: Db, art: Stammdatenart, id: string, aktiv: boolean): void {
  const t = TABELLE[art];
  const z = db.update(t).set({ aktiv }).where(eq(t.id, id)).run();
  if (z.changes === 0 && !db.select({ id: t.id }).from(t).where(eq(t.id, id)).get()) throw new NichtGefunden();
}

/** Der ETag-Zähler (Spec §5.1). Erhöht nur durch die Trigger `stand_*` der Migration 0001. */
export function stammdatenVersion(db: Db): number {
  return (db.all(sql`SELECT version FROM stammdatenstand WHERE id = 1`) as { version: number }[])[0]?.version ?? 0;
}
```

Hinweis: `better-sqlite3` meldet bei einem Update mit gleichen Werten `changes = 1`; `setzeAktiv` prüft die Existenz deshalb nur bei `changes === 0`.

- [ ] **Step 6: Tests grün.**
- [ ] **Step 7: Commit** — `feat(einsatzbuch): Datenzugriff und Eingabeprüfung für Stammdaten`

---

### Task 4: CSV-Import (Parser, Plan, Anwenden)

**Files:**
- Create: `M/_lib/stammdaten/csv.ts` (rein, ohne Node-API, auch im Browser), `M/_lib/stammdaten/import.ts` (Server)
- Test: `M/_lib/stammdaten/csv.test.ts`, `M/_lib/stammdaten/import.test.ts`

**Interfaces:**
- Consumes: Schemas und DTOs aus Task 3.
- Produces:
  - `KOPFZEILEN: Record<Stammdatenart, readonly string[]>` = `{ fahrzeuge: ["typ","kennung","ruf","standort"], personal: ["name","quali","ov"], stichworte: ["gruppe","name","reihenfolge"] }`.
  - `dekodiere(bytes: Uint8Array): string` (BOM weg; UTF-8 streng, sonst Windows-1252).
  - `parseCsv(text: string): string[][]` (RFC 4180, Trennzeichen aus der ersten Zeile: `;` vor Tab vor `,`).
  - `type Importklasse = "neu" | "geaendert" | "unveraendert" | "fehler"`.
  - `interface Vorschauzeile { zeile: number; klasse: Importklasse; werte: Record<string, string>; fehler?: string; id?: string }`.
  - `type Importplan = { ok: true; art: Stammdatenart; zeilen: Vorschauzeile[] } | { ok: false; fehler: string }`.
  - `interface Importbestand { fahrzeuge: FahrzeugDTO[]; personal: PersonDTO[]; stichworte: StichwortDTO[] }`.
  - `planeImport(art, text, bestand: Importbestand): Importplan`.
  - `MAX_CSV_ZEICHEN = 512 * 1024`, `MAX_CSV_ZEILEN = 2000`.
  - `import.ts`: `bestandFuerImport(db): Importbestand`; `wendeImportAn(db, plan: Extract<Importplan,{ok:true}>): { neu: number; geaendert: number; unveraendert: number; fehler: number }` (eine Transaktion).

- [ ] **Step 1: Tests** — `csv.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { dekodiere, parseCsv, planeImport, type Importbestand } from "./csv";

const LEER: Importbestand = { fahrzeuge: [], personal: [], stichworte: [] };
const win1252 = (s: string) => Uint8Array.from([...s].map((c) => ({ ü: 0xfc, ß: 0xdf, ä: 0xe4 } as Record<string, number>)[c] ?? c.charCodeAt(0)));

describe("dekodiere", () => {
  it("UTF-8 mit BOM, UTF-8 ohne BOM, Windows-1252", () => {
    expect(dekodiere(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Jürgens")]))).toBe("Jürgens");
    expect(dekodiere(new TextEncoder().encode("Voß"))).toBe("Voß");
    expect(dekodiere(win1252("Jürgens;Voß"))).toBe("Jürgens;Voß");
  });
});

describe("parseCsv", () => {
  it("Semikolon, Anführungszeichen mit Trennzeichen und Zeilenumbruch darin, CRLF", () => {
    expect(parseCsv('name;quali;ov\r\n"Voß, Anke";SanH;"Bad; Bevensen"\r\n"Otte, ""Ole""";RS;Uelzen\r\n')).toEqual([
      ["name", "quali", "ov"], ["Voß, Anke", "SanH", "Bad; Bevensen"], ['Otte, "Ole"', "RS", "Uelzen"],
    ]);
  });
  it("Komma und Tab als Trennzeichen, Leerzeilen fallen weg", () => {
    expect(parseCsv("gruppe,name,reihenfolge\n\nMANV,MANV 5,1\n")).toEqual([["gruppe", "name", "reihenfolge"], ["MANV", "MANV 5", "1"]]);
    expect(parseCsv("typ\tkennung\n RTW \t11-83-1")).toEqual([["typ", "kennung"], [" RTW ", "11-83-1"]]);
  });
});

describe("planeImport", () => {
  const bestand: Importbestand = {
    ...LEER,
    fahrzeuge: [
      { id: "f1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen", aktiv: true },
      { id: "f2", typ: "KTW-B", kennung: "11-85-1", ruf: "Rotkreuz Uelzen 11-85-1", standort: "Uelzen", aktiv: false },
    ],
    personal: [
      { id: "p1", name: "Albers, Jana", quali: "ZF", ov: "Uelzen", aktiv: true },
      { id: "p2", name: "Meyer, Hanna", quali: "BtH", ov: "Rosche", aktiv: true },
      { id: "p3", name: "Meyer, Hanna", quali: "SanH", ov: "Uelzen", aktiv: true },
    ],
  };
  it("klassifiziert neu, geändert (auch reaktiviert), unverändert und Fehler", () => {
    const plan = planeImport("fahrzeuge", [
      "typ;kennung;ruf;standort",
      "RTW;11-83-1;Rotkreuz Uelzen 11-83-1;Uelzen",
      "KTW-B;11-85-1;Rotkreuz Uelzen 11-85-1;Uelzen",
      "MTF;11-19-1;Rotkreuz Uelzen 11-19-1;Uelzen",
      "MTF;;ohne Kennung;Uelzen",
      "MTF;11-19-1;doppelt;Uelzen",
    ].join("\n"), bestand);
    expect(plan.ok && plan.zeilen.map((z) => [z.zeile, z.klasse])).toEqual([[2, "unveraendert"], [3, "geaendert"], [4, "neu"], [5, "fehler"], [6, "fehler"]]);
    expect(plan.ok && plan.zeilen[3].fehler).toBe("Kennung fehlt");
    expect(plan.ok && plan.zeilen[4].fehler).toBe("Kennung steht schon in Zeile 4");
    expect(plan.ok && plan.zeilen[1].id).toBe("f2");
  });
  it("Person: mehrdeutiger Name ist eine Fehlerzeile", () => {
    const plan = planeImport("personal", "name;quali;ov\nMeyer, Hanna;SanH;Uelzen\nAlbers, Jana;GF;Uelzen", bestand);
    expect(plan.ok && plan.zeilen.map((z) => z.klasse)).toEqual(["fehler", "geaendert"]);
    expect(plan.ok && plan.zeilen[0].fehler).toBe("mehrdeutig: 2 Personen heißen so");
  });
  it("falsche Kopfzeile, falsche Spaltenzahl, leere Datei, zu viele Zeilen", () => {
    expect(planeImport("personal", "name;ov;quali\nA, B;SanH;Uelzen", LEER)).toEqual({ ok: false, fehler: "Die Kopfzeile muss genau „name;quali;ov“ lauten." });
    const zu = planeImport("personal", "name;quali;ov\nA, B;SanH", LEER);
    expect(zu.ok && zu.zeilen[0].fehler).toBe("3 Spalten erwartet, 2 gefunden");
    expect(planeImport("personal", "", LEER)).toEqual({ ok: false, fehler: "Die Datei ist leer." });
    const viele = "name;quali;ov\n" + Array.from({ length: 2001 }, (_, i) => `N${i}, V;SanH;Uelzen`).join("\n");
    expect(planeImport("personal", viele, LEER)).toEqual({ ok: false, fehler: "Höchstens 2000 Zeilen je Import." });
  });
  it("Stichwort: Reihenfolge muss eine Zahl sein", () => {
    const plan = planeImport("stichworte", "gruppe;name;reihenfolge\nMANV;MANV 5;erste", LEER);
    expect(plan.ok && plan.zeilen[0].klasse).toBe("fehler");
  });
});
```

`import.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { testDb } from "../testDb";
import { listeFahrzeuge, speichereFahrzeug, stammdatenVersion } from "./daten";
import { planeImport } from "./csv";
import { bestandFuerImport, wendeImportAn } from "./import";

describe("wendeImportAn", () => {
  it("schreibt neu und geändert, lässt unverändert und Fehler liegen; ein zweiter Lauf ändert nichts", () => {
    const db = testDb();
    speichereFahrzeug(db, null, { typ: "RTW", kennung: "11-83-1", ruf: "alt", standort: "Uelzen", aktiv: false });
    const text = "typ;kennung;ruf;standort\nRTW;11-83-1;Rotkreuz Uelzen 11-83-1;Uelzen\nMTF;11-19-1;Rotkreuz Uelzen 11-19-1;Uelzen\nMTF;;x;Uelzen";
    const plan = planeImport("fahrzeuge", text, bestandFuerImport(db));
    if (!plan.ok) throw new Error(plan.fehler);
    expect(wendeImportAn(db, plan)).toEqual({ neu: 1, geaendert: 1, unveraendert: 0, fehler: 1 });
    expect(listeFahrzeuge(db).every((f) => f.aktiv)).toBe(true);
    const v = stammdatenVersion(db);
    const zweiter = planeImport("fahrzeuge", text, bestandFuerImport(db));
    if (!zweiter.ok) throw new Error(zweiter.fehler);
    expect(wendeImportAn(db, zweiter)).toEqual({ neu: 0, geaendert: 0, unveraendert: 2, fehler: 1 });
    expect(stammdatenVersion(db)).toBe(v);
  });
});
```

- [ ] **Step 2: Tests scheitern.**

- [ ] **Step 3: `csv.ts`**

```ts
import { fahrzeugEingabe, personEingabe, stichwortEingabe } from "./schemas";
import type { FahrzeugDTO, PersonDTO, Stammdatenart, StichwortDTO } from "./typen";

export const KOPFZEILEN: Record<Stammdatenart, readonly string[]> = {
  fahrzeuge: ["typ", "kennung", "ruf", "standort"],
  personal: ["name", "quali", "ov"],
  stichworte: ["gruppe", "name", "reihenfolge"],
};
export const MAX_CSV_ZEICHEN = 512 * 1024;
export const MAX_CSV_ZEILEN = 2000;

export type Importklasse = "neu" | "geaendert" | "unveraendert" | "fehler";
export interface Vorschauzeile { zeile: number; klasse: Importklasse; werte: Record<string, string>; fehler?: string; id?: string }
export type Importplan = { ok: true; art: Stammdatenart; zeilen: Vorschauzeile[] } | { ok: false; fehler: string };
export interface Importbestand { fahrzeuge: FahrzeugDTO[]; personal: PersonDTO[]; stichworte: StichwortDTO[] }

/** Excel unter Windows speichert CSV als Windows-1252; ohne Rückfall würden aus „Jürgens“ Ersatzzeichen. */
export function dekodiere(bytes: Uint8Array): string {
  const ohneBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(ohneBom); }
  catch { return new TextDecoder("windows-1252").decode(ohneBom); }
}

/** RFC 4180: Felder in Anführungszeichen dürfen Trennzeichen, Zeilenumbrüche und verdoppelte Anführungszeichen enthalten. */
export function parseCsv(text: string): string[][] {
  const ohneBom = text.startsWith("﻿") ? text.slice(1) : text;
  const ersteZeile = ohneBom.split(/\r?\n/, 1)[0] ?? "";
  const trenner = ersteZeile.includes(";") ? ";" : ersteZeile.includes("\t") ? "\t" : ",";
  const zeilen: string[][] = [];
  let feld = ""; let zeile: string[] = []; let inAnf = false;
  for (let i = 0; i < ohneBom.length; i++) {
    const c = ohneBom[i];
    if (inAnf) {
      if (c === '"' && ohneBom[i + 1] === '"') { feld += '"'; i++; }
      else if (c === '"') inAnf = false;
      else feld += c;
    } else if (c === '"' && feld === "") inAnf = true;
    else if (c === trenner) { zeile.push(feld); feld = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && ohneBom[i + 1] === "\n") i++;
      zeile.push(feld); feld = "";
      if (zeile.some((f) => f.trim() !== "")) zeilen.push(zeile);
      zeile = [];
    } else feld += c;
  }
  zeile.push(feld);
  if (zeile.some((f) => f.trim() !== "")) zeilen.push(zeile);
  return zeilen;
}

const SCHEMA = { fahrzeuge: fahrzeugEingabe, personal: personEingabe, stichworte: stichwortEingabe } as const;
const SCHLUESSEL: Record<Stammdatenart, "kennung" | "name"> = { fahrzeuge: "kennung", personal: "name", stichworte: "name" };
const SCHLUESSEL_TEXT: Record<Stammdatenart, string> = { fahrzeuge: "Kennung", personal: "Name", stichworte: "Stichwort" };

export function planeImport(art: Stammdatenart, text: string, bestand: Importbestand): Importplan {
  if (text.length > MAX_CSV_ZEICHEN) return { ok: false, fehler: "Die Datei ist größer als 512 KB." };
  const roh = parseCsv(text);
  if (roh.length === 0) return { ok: false, fehler: "Die Datei ist leer." };
  const kopf = KOPFZEILEN[art];
  if (roh[0].map((s) => s.trim().toLowerCase()).join(";") !== kopf.join(";")) {
    return { ok: false, fehler: `Die Kopfzeile muss genau „${kopf.join(";")}“ lauten.` };
  }
  if (roh.length - 1 > MAX_CSV_ZEILEN) return { ok: false, fehler: `Höchstens ${MAX_CSV_ZEILEN} Zeilen je Import.` };

  const vorhanden = bestand[art] as (FahrzeugDTO | PersonDTO | StichwortDTO)[];
  const gesehen = new Map<string, number>();
  const zeilen = roh.slice(1).map((felder, i): Vorschauzeile => {
    const zeile = i + 2;
    const werte = Object.fromEntries(kopf.map((k, j) => [k, (felder[j] ?? "").trim()]));
    if (felder.length !== kopf.length) return { zeile, klasse: "fehler", werte, fehler: `${kopf.length} Spalten erwartet, ${felder.length} gefunden` };
    const eingabe = { ...werte, ...(art === "stichworte" ? { reihenfolge: /^\d+$/.test(werte.reihenfolge) ? Number(werte.reihenfolge) : NaN } : {}), aktiv: true };
    const geprueft = SCHEMA[art].safeParse(eingabe);
    if (!geprueft.success) return { zeile, klasse: "fehler", werte, fehler: geprueft.error.issues[0]?.message ?? "ungültig" };
    const schluessel = String((geprueft.data as Record<string, unknown>)[SCHLUESSEL[art]]);
    const frueher = gesehen.get(schluessel);
    if (frueher !== undefined) return { zeile, klasse: "fehler", werte, fehler: `${SCHLUESSEL_TEXT[art]} steht schon in Zeile ${frueher}` };
    gesehen.set(schluessel, zeile);
    const treffer = vorhanden.filter((v) => (v as unknown as Record<string, unknown>)[SCHLUESSEL[art]] === schluessel);
    if (treffer.length > 1) return { zeile, klasse: "fehler", werte, fehler: `mehrdeutig: ${treffer.length} Personen heißen so` };
    if (treffer.length === 0) return { zeile, klasse: "neu", werte };
    const alt = treffer[0] as unknown as Record<string, unknown>;
    const gleich = Object.entries(geprueft.data).every(([k, v]) => alt[k] === v);
    return { zeile, klasse: gleich ? "unveraendert" : "geaendert", werte, id: String(alt.id) };
  });
  return { ok: true, art, zeilen };
}
```

Hinweis: Die Fehlertexte in `schemas.ts` (Task 3) müssen zu den Erwartungen passen („Kennung fehlt“). Die Zahl in `werte.reihenfolge` wird für den Vergleich in `geprueft.data` bereits als Zahl verglichen.

- [ ] **Step 4: `import.ts`**

```ts
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { fahrzeug, person, stichwort } from "../../_db/schema";
import { listeFahrzeuge, listePersonal, listeStichworte, type Db } from "./daten";
import type { Importbestand, Importplan } from "./csv";

export function bestandFuerImport(db: Db): Importbestand {
  return { fahrzeuge: listeFahrzeuge(db), personal: listePersonal(db), stichworte: listeStichworte(db) };
}

const TABELLE = { fahrzeuge: fahrzeug, personal: person, stichworte: stichwort } as const;

/** Schreibt einen geprüften Plan in EINER Transaktion. Nur `neu` und `geaendert` schreiben. */
export function wendeImportAn(db: Db, plan: Extract<Importplan, { ok: true }>) {
  const zaehler = { neu: 0, geaendert: 0, unveraendert: 0, fehler: 0 };
  const t = TABELLE[plan.art];
  db.transaction((tx) => {
    for (const z of plan.zeilen) {
      zaehler[z.klasse]++;
      const werte = { ...z.werte, ...(plan.art === "stichworte" ? { reihenfolge: Number(z.werte.reihenfolge) } : {}), aktiv: true };
      if (z.klasse === "neu") tx.insert(t).values({ id: nanoid(), ...werte } as never).run();
      if (z.klasse === "geaendert" && z.id) tx.update(t).set(werte as never).where(eq(t.id, z.id)).run();
    }
  });
  return zaehler;
}
```

Hinweis: Die `as never`-Casts sind der Preis der gemeinsamen Tabellenweiche; wer sie vermeiden will, schreibt drei `switch`-Zweige. Die Werte sind durch `planeImport` bereits geprüft und getrimmt.

- [ ] **Step 5: Tests grün.**
- [ ] **Step 6: Commit** — `feat(einsatzbuch): CSV-Import der Stammdaten mit Vorschau und Fehlerzeilen`

---

### Task 5: Einstellungen

**Files:**
- Create: `M/_lib/einstellungen.ts`
- Test: `M/_lib/einstellungen.test.ts`

**Interfaces:**
- Produces: `EINSTELLUNG_VORGABEN: Einstellungen`; `einstellungenSchema` (zod); `type Einstellungen = { fristMinuten: number; besatzung: boolean; bereitschaft: string }`; `leseEinstellungen(db): Einstellungen`; `schreibeEinstellungen(db, e: Einstellungen): void`.

- [ ] **Step 1: Test**

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./testDb";
import { einstellung } from "../_db/schema";
import { EINSTELLUNG_VORGABEN, einstellungenSchema, leseEinstellungen, schreibeEinstellungen } from "./einstellungen";
import { stammdatenVersion } from "./stammdaten/daten";

describe("Einstellungen", () => {
  it("ohne Zeilen gelten die Vorgaben der Spec", () => {
    expect(leseEinstellungen(testDb())).toEqual({ fristMinuten: 15, besatzung: true, bereitschaft: "DRK-Bereitschaft Uelzen" });
  });
  it("schreibt, liest zurück, und unverändertes Speichern erhöht weder Version noch Audit-Log", () => {
    const db = testDb();
    schreibeEinstellungen(db, { fristMinuten: 30, besatzung: false, bereitschaft: "DRK-Bereitschaft Ebstorf" });
    expect(leseEinstellungen(db)).toEqual({ fristMinuten: 30, besatzung: false, bereitschaft: "DRK-Bereitschaft Ebstorf" });
    const v = stammdatenVersion(db);
    const n = (db.all(sql`SELECT count(*) AS n FROM audit_outbox`) as { n: number }[])[0].n;
    schreibeEinstellungen(db, leseEinstellungen(db));
    expect(stammdatenVersion(db)).toBe(v);
    expect((db.all(sql`SELECT count(*) AS n FROM audit_outbox`) as { n: number }[])[0].n).toBe(n);
  });
  it("ein unlesbarer gespeicherter Wert fällt auf die Vorgabe zurück", () => {
    const db = testDb();
    db.insert(einstellung).values({ schluessel: "fristMinuten", wert: '"viel"' }).run();
    expect(leseEinstellungen(db).fristMinuten).toBe(EINSTELLUNG_VORGABEN.fristMinuten);
  });
  it("Frist nur 1–120 ganze Minuten, Name nicht leer", () => {
    expect(einstellungenSchema.safeParse({ ...EINSTELLUNG_VORGABEN, fristMinuten: 0 }).success).toBe(false);
    expect(einstellungenSchema.safeParse({ ...EINSTELLUNG_VORGABEN, fristMinuten: 121 }).success).toBe(false);
    expect(einstellungenSchema.safeParse({ ...EINSTELLUNG_VORGABEN, fristMinuten: 1.5 }).success).toBe(false);
    expect(einstellungenSchema.safeParse({ ...EINSTELLUNG_VORGABEN, bereitschaft: "  " }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Test scheitert.**

- [ ] **Step 3: Implementierung**

```ts
import { z } from "zod";
import { einstellung } from "../_db/schema";
import type { Db } from "./stammdaten/daten";

export const einstellungenSchema = z.object({
  fristMinuten: z.number().int("Die Frist ist eine ganze Zahl von Minuten").min(1, "Mindestens 1 Minute").max(120, "Höchstens 120 Minuten"),
  besatzung: z.boolean(),
  bereitschaft: z.string().trim().min(1, "Name der Bereitschaft fehlt").max(80, "Höchstens 80 Zeichen"),
});
export type Einstellungen = z.infer<typeof einstellungenSchema>;
export const EINSTELLUNG_VORGABEN: Einstellungen = { fristMinuten: 15, besatzung: true, bereitschaft: "DRK-Bereitschaft Uelzen" };

export function leseEinstellungen(db: Db): Einstellungen {
  const roh = Object.fromEntries(db.select().from(einstellung).all().map((z) => [z.schluessel, z.wert]));
  const ergebnis = { ...EINSTELLUNG_VORGABEN };
  for (const k of Object.keys(EINSTELLUNG_VORGABEN) as (keyof Einstellungen)[]) {
    if (roh[k] === undefined) continue;
    try {
      const teil = einstellungenSchema.shape[k].safeParse(JSON.parse(roh[k]));
      if (teil.success) (ergebnis as Record<string, unknown>)[k] = teil.data;
    } catch { /* unlesbar → Vorgabe */ }
  }
  return ergebnis;
}

/** Upsert je Schlüssel. Ein unveränderter Wert trifft die `WHEN`-Klauseln der Trigger nicht. */
export function schreibeEinstellungen(db: Db, e: Einstellungen): void {
  db.transaction((tx) => {
    for (const [schluessel, wert] of Object.entries(einstellungenSchema.parse(e))) {
      tx.insert(einstellung).values({ schluessel, wert: JSON.stringify(wert) })
        .onConflictDoUpdate({ target: einstellung.schluessel, set: { wert: JSON.stringify(wert) } }).run();
    }
  });
}
```

- [ ] **Step 4: Tests grün.**
- [ ] **Step 5: Commit** — `feat(einsatzbuch): Einstellungen des Rechners mit Vorgaben`

---

### Task 6: Server Actions

**Files:**
- Create: `M/_lib/actionErgebnis.ts`, `M/_actions/stammdaten.ts`, `M/_actions/einstellungen.ts`
- Modify: `src/core/audit/coverage-manifest.json`
- Test: `M/_actions/stammdaten.test.ts`, `M/_actions/einstellungen.test.ts`

**Interfaces:**
- Consumes: `requireEinsatzbuchAktion` (Task 2), Datenfunktionen (Tasks 3–5), `getDb` aus `M/_db/client.ts`.
- Produces (alle in `"use server"`-Dateien):
  - `fahrzeugSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<FahrzeugDTO>>`
  - `personSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<PersonDTO>>`
  - `stichwortSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<StichwortDTO>>`
  - `aktivSetzenAction(art: Stammdatenart, id: string, aktiv: boolean): Promise<ActionAusgang>`
  - `csvVorschauAction(art: Stammdatenart, text: string): Promise<ActionErgebnis<Vorschauzeile[]>>`
  - `csvUebernehmenAction(art: Stammdatenart, text: string): Promise<ActionErgebnis<{ neu: number; geaendert: number; unveraendert: number; fehler: number }>>`
  - `einstellungenSpeichernAction(eingabe: unknown): Promise<ActionErgebnis<Einstellungen>>`
  - `ActionErgebnis<T>`, `ActionAusgang`, `FeldFehler`, `zodFehler(e)` aus `M/_lib/actionErgebnis.ts` (wörtliche Kopie der lagerbuch-Datei ohne deren Paragraphenverweise).

- [ ] **Step 1: Tests** — Muster `src/app/m/uav/_actions/katalog.test.ts` (eigenes `DATA_DIR`, `migrateAllModules()`, Mocks für `@/core/auth`, `next/cache`, **zusätzlich** `next/headers` mit `host`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/einsatzbuch-actions-stammdaten-test";
let gruppen: string[] | null = null;
let host = "einsatzbuch.localtest.me";
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { sub: "s1", name: "Jana", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null; host = "einsatzbuch.localtest.me";
});

const FZ = { typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen", aktiv: true };

describe("Stammdaten-Actions", () => {
  it("ohne Gruppe, als Suite-Admin oder über fremden Host: Forbidden, nichts geschrieben", async () => {
    const { fahrzeugSpeichernAction } = await import("./stammdaten");
    const { getDb } = await import("../_db/client");
    const { listeFahrzeuge } = await import("../_lib/stammdaten/daten");
    await expect(fahrzeugSpeichernAction(null, FZ)).rejects.toThrow("Forbidden");
    gruppen = ["dashboard-admins"];
    await expect(fahrzeugSpeichernAction(null, FZ)).rejects.toThrow("Forbidden");
    gruppen = ["einsatzbuch-verwaltung"]; host = "feedback.localtest.me";
    await expect(fahrzeugSpeichernAction(null, FZ)).rejects.toThrow("Forbidden");
    expect(listeFahrzeuge(getDb())).toEqual([]);
  });
  it("mit Gruppe: anlegen, doppelte Kennung als Feldfehler, ungültige Eingabe als Feldfehler", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { fahrzeugSpeichernAction } = await import("./stammdaten");
    const erst = await fahrzeugSpeichernAction(null, FZ);
    expect(erst.ok).toBe(true);
    expect(await fahrzeugSpeichernAction(null, FZ)).toEqual({ ok: false, fehler: "Diese Kennung gibt es schon.", feldFehler: { kennung: "Diese Kennung gibt es schon." } });
    const leer = await fahrzeugSpeichernAction(null, { ...FZ, kennung: "" });
    expect(leer.ok ? null : leer.feldFehler?.kennung).toBe("Kennung fehlt");
  });
  it("die Audit-Zeile trägt die handelnde Person", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { fahrzeugSpeichernAction } = await import("./stammdaten");
    const { getDb } = await import("../_db/client");
    const { sql } = await import("drizzle-orm");
    await fahrzeugSpeichernAction(null, FZ);
    const [zeile] = getDb().all(sql`SELECT actor FROM audit_outbox WHERE object_type = 'fahrzeug'`) as { actor: string }[];
    expect(JSON.parse(zeile.actor)).toMatchObject({ kind: "user", id: "s1" });
  });
  it("CSV: Vorschau schreibt nichts, Übernehmen schreibt", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { csvVorschauAction, csvUebernehmenAction } = await import("./stammdaten");
    const { getDb } = await import("../_db/client");
    const { listeStichworte } = await import("../_lib/stammdaten/daten");
    const text = "gruppe;name;reihenfolge\nMANV;MANV 5;1\nMANV;MANV 10;2";
    const vorschau = await csvVorschauAction("stichworte", text);
    expect(vorschau.ok && vorschau.wert.map((z) => z.klasse)).toEqual(["neu", "neu"]);
    expect(listeStichworte(getDb())).toEqual([]);
    expect(await csvUebernehmenAction("stichworte", text)).toEqual({ ok: true, wert: { neu: 2, geaendert: 0, unveraendert: 0, fehler: 0 } });
    expect(await csvVorschauAction("stichworte", "falsch")).toEqual({ ok: false, fehler: "Die Kopfzeile muss genau „gruppe;name;reihenfolge“ lauten." });
  });
  it("aktivSetzenAction mit unbekannter Art oder ID", async () => {
    gruppen = ["einsatzbuch-verwaltung"];
    const { aktivSetzenAction } = await import("./stammdaten");
    expect(await aktivSetzenAction("fahrzeuge", "nix", false)).toEqual({ ok: false, fehler: "Eintrag nicht gefunden" });
    expect(await aktivSetzenAction("unsinn" as never, "nix", false)).toEqual({ ok: false, fehler: "Unbekannte Art" });
  });
});
```

`einstellungen.test.ts` analog: ohne Gruppe `Forbidden`; mit Gruppe speichert `{ fristMinuten: 30, besatzung: false, bereitschaft: "X" }` und liefert `ok: true`; `fristMinuten: 121` → `ok: false` mit `feldFehler.fristMinuten = "Höchstens 120 Minuten"`.

- [ ] **Step 2: Tests scheitern.**

- [ ] **Step 3: `M/_actions/stammdaten.ts`** — erstes Zeichen der Datei ist `"`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { requireEinsatzbuchAktion } from "../_lib/zugang";
import { type ActionAusgang, type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { fahrzeugEingabe, personEingabe, stichwortEingabe } from "../_lib/stammdaten/schemas";
import {
  NichtGefunden, SchonVergeben, setzeAktiv, speichereFahrzeug, speicherePerson, speichereStichwort,
} from "../_lib/stammdaten/daten";
import { planeImport, type Vorschauzeile } from "../_lib/stammdaten/csv";
import { bestandFuerImport, wendeImportAn } from "../_lib/stammdaten/import";
import { STAMMDATENARTEN, type FahrzeugDTO, type PersonDTO, type Stammdatenart, type StichwortDTO } from "../_lib/stammdaten/typen";

function neuLaden() { revalidatePath("/m/einsatzbuch/stammdaten"); revalidatePath("/m/einsatzbuch"); }

function alsErgebnis<T>(tun: () => T): ActionErgebnis<T> {
  try { const wert = tun(); neuLaden(); return { ok: true, wert } as ActionErgebnis<T>; }
  catch (e) {
    const feldFehler = zodFehler(e);
    if (feldFehler) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler };
    if (e instanceof SchonVergeben) return { ok: false, fehler: e.message, feldFehler: { [e.feld]: e.message } };
    if (e instanceof NichtGefunden) return { ok: false, fehler: e.message };
    throw e;
  }
}

export async function fahrzeugSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<FahrzeugDTO>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () =>
    alsErgebnis(() => speichereFahrzeug(getDb(), id, fahrzeugEingabe.parse(eingabe))));
}
export async function personSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<PersonDTO>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () =>
    alsErgebnis(() => speicherePerson(getDb(), id, personEingabe.parse(eingabe))));
}
export async function stichwortSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<StichwortDTO>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () =>
    alsErgebnis(() => speichereStichwort(getDb(), id, stichwortEingabe.parse(eingabe))));
}
export async function aktivSetzenAction(art: Stammdatenart, id: string, aktiv: boolean): Promise<ActionAusgang> {
  const viewer = await requireEinsatzbuchAktion();
  if (!STAMMDATENARTEN.includes(art) || typeof id !== "string" || typeof aktiv !== "boolean") return { ok: false, fehler: "Unbekannte Art" };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const e = alsErgebnis(() => setzeAktiv(getDb(), art, id, aktiv));
    return e.ok ? { ok: true } : e;
  });
}
/** Probelauf: plant gegen den aktuellen Bestand und schreibt nichts. */
export async function csvVorschauAction(art: Stammdatenart, text: string): Promise<ActionErgebnis<Vorschauzeile[]>> {
  await requireEinsatzbuchAktion();
  if (!STAMMDATENARTEN.includes(art) || typeof text !== "string") return { ok: false, fehler: "Unbekannte Art" };
  const plan = planeImport(art, text, bestandFuerImport(getDb()));
  return plan.ok ? { ok: true, wert: plan.zeilen } : { ok: false, fehler: plan.fehler };
}
/** Plant serverseitig neu (der Bestand kann sich seit der Vorschau geändert haben) und schreibt. */
export async function csvUebernehmenAction(art: Stammdatenart, text: string): Promise<ActionErgebnis<{ neu: number; geaendert: number; unveraendert: number; fehler: number }>> {
  const viewer = await requireEinsatzbuchAktion();
  if (!STAMMDATENARTEN.includes(art) || typeof text !== "string") return { ok: false, fehler: "Unbekannte Art" };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const db = getDb();
    const plan = planeImport(art, text, bestandFuerImport(db));
    if (!plan.ok) return { ok: false, fehler: plan.fehler };
    return alsErgebnis(() => wendeImportAn(db, plan));
  });
}
```

`M/_actions/einstellungen.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { requireEinsatzbuchAktion } from "../_lib/zugang";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { einstellungenSchema, leseEinstellungen, schreibeEinstellungen, type Einstellungen } from "../_lib/einstellungen";

export async function einstellungenSpeichernAction(eingabe: unknown): Promise<ActionErgebnis<Einstellungen>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const geprueft = einstellungenSchema.safeParse(eingabe);
    if (!geprueft.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(geprueft.error) ?? {} };
    const db = getDb();
    schreibeEinstellungen(db, geprueft.data);
    revalidatePath("/m/einsatzbuch/einstellungen");
    return { ok: true, wert: leseEinstellungen(db) };
  });
}
```

- [ ] **Step 4: Manifest** — in `src/core/audit/coverage-manifest.json` (alphabetische Einordnung wie im Bestand):

```json
"src/app/m/einsatzbuch/_actions/einstellungen.ts#einstellungenSpeichernAction": { "kind": "context", "via": "einstellungenSpeichernAction" },
"src/app/m/einsatzbuch/_actions/stammdaten.ts#aktivSetzenAction": { "kind": "context", "via": "aktivSetzenAction" },
"src/app/m/einsatzbuch/_actions/stammdaten.ts#csvUebernehmenAction": { "kind": "context", "via": "csvUebernehmenAction" },
"src/app/m/einsatzbuch/_actions/stammdaten.ts#csvVorschauAction": { "kind": "excluded", "reason": "Probelauf des CSV-Imports: liest den Bestand und schreibt nichts; die Übernahme läuft über csvUebernehmenAction." },
"src/app/m/einsatzbuch/_actions/stammdaten.ts#fahrzeugSpeichernAction": { "kind": "context", "via": "fahrzeugSpeichernAction" },
"src/app/m/einsatzbuch/_actions/stammdaten.ts#personSpeichernAction": { "kind": "context", "via": "personSpeichernAction" },
"src/app/m/einsatzbuch/_actions/stammdaten.ts#stichwortSpeichernAction": { "kind": "context", "via": "stichwortSpeichernAction" }
```

Prüfe, ob `coverage.test.ts` Funktionen als `export async function` erkennt (Vorbild uav) — die Actions oben sind so geschrieben.

- [ ] **Step 5: Tests grün** — `pnpm vitest run src/app/m/einsatzbuch/_actions src/core/audit/coverage.test.ts`.
- [ ] **Step 6: Commit** — `feat(einsatzbuch): Server Actions für Stammdaten, CSV-Import und Einstellungen`

---

### Task 7: Schlüssel — KEK, Paar, Freigabe, Status

**Files:**
- Create: `M/_lib/schluessel/kek.ts`, `M/_lib/schluessel/paar.ts`, `M/_lib/schluessel/freigabe.ts`, `M/_lib/schluessel/status.ts`
- Test: `M/_lib/schluessel/paar.test.ts`, `M/_lib/schluessel/freigabe.test.ts`, `M/_lib/schluessel/status.test.ts`

**Interfaces:**
- Consumes: Kern `bytes.ts` (`ausBase64`, `zuBase64`, `utf8`, `zufall`, `mitLaenge`, `Bytes`), `umschlag.ts` (`packeAus`, `importierePrivat`, `schluesselIdVon`, `erzeugeSchluesselpaar`), Tabelle `schluesselpaar`.
- Produces:
  - `kek.ts`: `KEK_VARIABLE = "EINSATZBUCH_SCHLUESSEL_KEK"`; `ENTWICKLUNGS_KEK = "ZWluc2F0emJ1Y2gtZW50d2lja2x1bmdzLWtlay0zMmI="`; `type KekErgebnis = { status: "ok"; kek: Bytes } | { status: "fehlt" } | { status: "ungueltig" }`; `kekAusUmgebung(env = process.env): KekErgebnis`.
  - `paar.ts`: `verschluesselePrivat(pkcs8: Bytes, schluesselId: string, kek: Bytes): Promise<string>`; `entschluesselePrivat(gespeichert: string, schluesselId: string, kek: Bytes): Promise<Bytes>` (wirft `PrivatUnlesbar`); `legePaarAn(db, { art, rechnerId, kek, jetzt, paar? }): Promise<{ id: string; schluesselId: string; oeffentlich: string; pkcs8: Bytes }>` (erzeugt ohne `paar` ein frisches Paar); `paarZuId(db, schluesselId)`; `echtesPaar(db)`.
  - `freigabe.ts`: `packeAusFuer(schluesselId: string, umschlag: Umschlag, kopf: Blockkopf, o?: { db?: Db; env?: EnvLike }): Promise<Freigabe>` mit `type Freigabe = { ok: true; cek: Bytes; art: "echt" | "test"; rechnerId: string | null } | { ok: false; status: 422 | 503; code: FreigabeCode; meldung: string }` und `type FreigabeCode = "kek_fehlt" | "kek_ungueltig" | "privat_unlesbar" | "schluessel_unbekannt" | "schluessel_passt_nicht" | "umgebung_passt_nicht" | "umschlag_ungueltig"`.
  - `status.ts`: `schluesselStatus(db, env?): Promise<{ kek: "ok" | "fehlt" | "ungueltig"; paar: "fehlt" | "ok" | "kek_passt_nicht" | "unbekannt"; schluesselId: string | null }>` (`unbekannt`, wenn der KEK nicht `ok` ist und ein Paar existiert).

- [ ] **Step 1: Tests**

`freigabe.test.ts` — der stärkste Test nutzt die Testvektoren:

```ts
import { describe, expect, it } from "vitest";
import { testDb } from "../testDb";
import { zuBase64 } from "../kern/bytes";
import { versiegele } from "../kern/block";
import { beispielEinsatz, kopf } from "../kern/testhilfe";
import { importiereOeffentlich } from "../kern/umschlag";
import eingabenJson from "../kern/testvektoren/eingaben.json";
import erwartetJson from "../kern/testvektoren/erwartet.json";
import type { Block } from "../kern/format";
import { legePaarAn } from "./paar";
import { packeAusFuer } from "./freigabe";

const KEK = zuBase64(new Uint8Array(32).fill(7));
const env = { EINSATZBUCH_SCHLUESSEL_KEK: KEK };
const eingaben = eingabenJson as unknown as { suite: { privat: JsonWebKey; oeffentlichSpki: string }; bloecke: { cek: string }[] };
const bloecke = (erwartetJson as unknown as { bloecke: Block[] }).bloecke;

async function vektorPaar() {
  const privat = await crypto.subtle.importKey("jwk", eingaben.suite.privat, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privat));
  return { pkcs8, oeffentlich: eingaben.suite.oeffentlichSpki };
}

describe("packeAusFuer", () => {
  it("packt jeden Vektorblock mit dem echten Paar zum festen CEK aus", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: new Uint8Array(32).fill(7), jetzt: new Date(0), paar: await vektorPaar() });
    for (const [i, b] of bloecke.entries()) {
      const f = await packeAusFuer(b.kopf.schluesselId, b.umschlag, b.kopf, { db, env });
      expect(f.ok && zuBase64(f.cek)).toBe(eingaben.bloecke[i].cek);
      expect(f.ok && f.art).toBe("echt");
    }
  });
  it("ohne KEK 503 kek_fehlt, mit kaputtem KEK 503 kek_ungueltig, mit anderem KEK 503 privat_unlesbar", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: new Uint8Array(32).fill(7), jetzt: new Date(0), paar: await vektorPaar() });
    const b = bloecke[0];
    expect(await packeAusFuer(b.kopf.schluesselId, b.umschlag, b.kopf, { db, env: {} })).toMatchObject({ ok: false, status: 503, code: "kek_fehlt" });
    expect(await packeAusFuer(b.kopf.schluesselId, b.umschlag, b.kopf, { db, env: { EINSATZBUCH_SCHLUESSEL_KEK: "kurz" } })).toMatchObject({ ok: false, status: 503, code: "kek_ungueltig" });
    expect(await packeAusFuer(b.kopf.schluesselId, b.umschlag, b.kopf, { db, env: { EINSATZBUCH_SCHLUESSEL_KEK: zuBase64(new Uint8Array(32).fill(8)) } })).toMatchObject({ ok: false, status: 503, code: "privat_unlesbar" });
  });
  it("422: unbekannte ID, Kopf mit anderer ID, vertauschter Umschlag", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: new Uint8Array(32).fill(7), jetzt: new Date(0), paar: await vektorPaar() });
    const [b1, b2] = bloecke;
    expect(await packeAusFuer("0000000000000000", b1.umschlag, b1.kopf, { db, env })).toMatchObject({ status: 422, code: "schluessel_unbekannt" });
    expect(await packeAusFuer(b1.kopf.schluesselId, b1.umschlag, { ...b1.kopf, schluesselId: "0000000000000000" }, { db, env })).toMatchObject({ status: 422, code: "schluessel_passt_nicht" });
    expect(await packeAusFuer(b1.kopf.schluesselId, b2.umschlag, b1.kopf, { db, env })).toMatchObject({ status: 422, code: "umschlag_ungueltig" });
  });
  it("Freigaberegel §12: echtes Paar nie für test, Test-Paar nie für echt", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: new Uint8Array(32).fill(7), jetzt: new Date(0), paar: await vektorPaar() });
    const b = bloecke[0];
    const alsTest = { ...b.kopf, umgebung: "test" as const };
    expect(await packeAusFuer(b.kopf.schluesselId, b.umschlag, alsTest, { db, env })).toMatchObject({ status: 422, code: "umgebung_passt_nicht" });

    const test = await legePaarAn(db, { art: "test", rechnerId: "r1", kek: new Uint8Array(32).fill(7), jetzt: new Date(0) });
    const oeff = await importiereOeffentlich(test.oeffentlich);
    const tb = await versiegele(beispielEinsatz("T-2026-001"), kopf(1, "0".repeat(64), test.schluesselId, "test"), oeff);
    const ok = await packeAusFuer(test.schluesselId, tb.umschlag, tb.kopf, { db, env });
    expect(ok).toMatchObject({ ok: true, art: "test", rechnerId: "r1" });
    expect(await packeAusFuer(test.schluesselId, tb.umschlag, { ...tb.kopf, umgebung: "echt" }, { db, env })).toMatchObject({ status: 422, code: "umgebung_passt_nicht" });
  });
});
```

`paar.test.ts`: (a) `verschluesselePrivat` → `entschluesselePrivat` Rundlauf; (b) andere `schluesselId` als AAD → `PrivatUnlesbar`; (c) anderer KEK → `PrivatUnlesbar`; (d) Format `^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$`; (e) `legePaarAn` ohne `paar` erzeugt ein Paar, dessen `schluesselId` gleich `schluesselIdVon(importiereOeffentlich(oeffentlich))` ist; (f) ein zweites `art: "echt"` wirft.

`status.test.ts`: `kek: "fehlt"` ohne Variable; `"ungueltig"` bei `"abc"`, bei 31 Byte und bei 33 Byte; `paar: "fehlt"` ohne Paar; `"ok"` mit passendem KEK; `"kek_passt_nicht"` mit anderem gültigem KEK; `"unbekannt"` bei fehlendem KEK und vorhandenem Paar.

- [ ] **Step 2: Tests scheitern.**

- [ ] **Step 3: `kek.ts`**

```ts
import { ausBase64, type Bytes } from "../kern/bytes";

export const KEK_VARIABLE = "EINSATZBUCH_SCHLUESSEL_KEK";
/** NUR für lokale Entwicklung und Tests (Seed). UTF-8 von „einsatzbuch-entwicklungs-kek-32b“. */
export const ENTWICKLUNGS_KEK = "ZWluc2F0emJ1Y2gtZW50d2lja2x1bmdzLWtlay0zMmI=";

export type KekErgebnis = { status: "ok"; kek: Bytes } | { status: "fehlt" } | { status: "ungueltig" };

/** Liest den KEK frisch aus der Umgebung (nie auf Modulebene zwischenspeichern: Tests setzen ihn um). */
export function kekAusUmgebung(env: Record<string, string | undefined> = process.env): KekErgebnis {
  const roh = env[KEK_VARIABLE]?.trim();
  if (!roh) return { status: "fehlt" };
  try {
    const kek = ausBase64(roh);
    return kek.length === 32 ? { status: "ok", kek } : { status: "ungueltig" };
  } catch { return { status: "ungueltig" }; }
}
```

- [ ] **Step 4: `paar.ts`**

```ts
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ausBase64, mitLaenge, utf8, zuBase64, zufall, type Bytes } from "../kern/bytes";
import { erzeugeSchluesselpaar, schluesselIdVon, importiereOeffentlich } from "../kern/umschlag";
import { schluesselpaar } from "../../_db/schema";
import type { Db } from "../stammdaten/daten";

export class PrivatUnlesbar extends Error { constructor() { super("Privater Schlüssel lässt sich mit diesem KEK nicht lesen"); } }

const aad = (schluesselId: string) => utf8(`einsatzbuch/v1/privat/${schluesselId}`);
const kekSchluessel = (kek: Bytes) => crypto.subtle.importKey("raw", mitLaenge(kek, 32, "KEK"), "AES-GCM", false, ["encrypt", "decrypt"]);

export async function verschluesselePrivat(pkcs8: Bytes, schluesselId: string, kek: Bytes): Promise<string> {
  const iv = zufall(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(schluesselId) }, await kekSchluessel(kek), pkcs8));
  return `${zuBase64(iv)}:${zuBase64(ct)}`;
}

export async function entschluesselePrivat(gespeichert: string, schluesselId: string, kek: Bytes): Promise<Bytes> {
  try {
    const [iv, ct] = gespeichert.split(":");
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: mitLaenge(ausBase64(iv), 12, "iv"), additionalData: aad(schluesselId) },
      await kekSchluessel(kek), ausBase64(ct),
    ));
  } catch { throw new PrivatUnlesbar(); }
}

export interface NeuesPaar { id: string; schluesselId: string; oeffentlich: string; pkcs8: Bytes }

export async function legePaarAn(db: Db, o: {
  art: "echt" | "test"; rechnerId: string | null; kek: Bytes; jetzt: Date; paar?: { pkcs8: Bytes; oeffentlich: string };
}): Promise<NeuesPaar> {
  let pkcs8: Bytes; let oeffentlich: string;
  if (o.paar) ({ pkcs8, oeffentlich } = o.paar);
  else {
    const p = await erzeugeSchluesselpaar();
    pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", p.privateKey));
    oeffentlich = zuBase64(new Uint8Array(await crypto.subtle.exportKey("spki", p.publicKey)));
  }
  const schluesselId = await schluesselIdVon(await importiereOeffentlich(oeffentlich));
  const id = nanoid();
  db.insert(schluesselpaar).values({
    id, art: o.art, rechnerId: o.rechnerId, schluesselId, oeffentlich,
    privatVerschluesselt: await verschluesselePrivat(pkcs8, schluesselId, o.kek), erzeugtAm: o.jetzt,
  }).run();
  return { id, schluesselId, oeffentlich, pkcs8 };
}

export const paarZuId = (db: Db, schluesselId: string) =>
  db.select().from(schluesselpaar).where(eq(schluesselpaar.schluesselId, schluesselId)).get();
export const echtesPaar = (db: Db) =>
  db.select().from(schluesselpaar).where(eq(schluesselpaar.art, "echt")).get();
```

- [ ] **Step 5: `freigabe.ts`**

```ts
import type { Bytes } from "../kern/bytes";
import type { Blockkopf, Umschlag } from "../kern/format";
import { importierePrivat, packeAus } from "../kern/umschlag";
import { zuBase64 } from "../kern/bytes";
import { getDb } from "../../_db/client";
import type { Db } from "../stammdaten/daten";
import { kekAusUmgebung } from "./kek";
import { entschluesselePrivat, paarZuId } from "./paar";

export type FreigabeCode = "kek_fehlt" | "kek_ungueltig" | "privat_unlesbar" | "schluessel_unbekannt"
  | "schluessel_passt_nicht" | "umgebung_passt_nicht" | "umschlag_ungueltig";
export type Freigabe =
  | { ok: true; cek: Bytes; art: "echt" | "test"; rechnerId: string | null }
  | { ok: false; status: 422 | 503; code: FreigabeCode; meldung: string };

const fehler = (status: 422 | 503, code: FreigabeCode, meldung: string): Freigabe => ({ ok: false, status, code, meldung });

/**
 * Packt einen Umschlag für Stufe 5 (`schluessel/freigeben`) aus. Wirft nicht: jede Ablehnung
 * kommt als Status 422 (Anfrage passt nicht) oder 503 (Suite nicht betriebsbereit) zurück.
 * Die Freigaberegel „Umgebung ↔ Art des Paars“ (Spec §12) steht VOR dem Auspacken.
 */
export async function packeAusFuer(
  schluesselId: string, umschlag: Umschlag, kopf: Blockkopf,
  o: { db?: Db; env?: Record<string, string | undefined> } = {},
): Promise<Freigabe> {
  const k = kekAusUmgebung(o.env ?? process.env);
  if (k.status === "fehlt") return fehler(503, "kek_fehlt", "EINSATZBUCH_SCHLUESSEL_KEK ist nicht gesetzt");
  if (k.status === "ungueltig") return fehler(503, "kek_ungueltig", "EINSATZBUCH_SCHLUESSEL_KEK ist kein 32-Byte-Wert in Base64");
  if (kopf.schluesselId !== schluesselId) return fehler(422, "schluessel_passt_nicht", `Block trägt ${kopf.schluesselId}, angefragt ist ${schluesselId}`);
  const paar = paarZuId(o.db ?? getDb(), schluesselId);
  if (!paar) return fehler(422, "schluessel_unbekannt", `Schlüssel ${schluesselId} ist der Suite nicht bekannt`);
  if (kopf.umgebung !== paar.art) return fehler(422, "umgebung_passt_nicht", `Ein ${paar.art === "echt" ? "echter" : "Test-"}Schlüssel öffnet keinen Block mit Umgebung „${kopf.umgebung}“`);
  let privat: CryptoKey;
  try { privat = await importierePrivat(zuBase64(await entschluesselePrivat(paar.privatVerschluesselt, paar.schluesselId, k.kek))); }
  catch { return fehler(503, "privat_unlesbar", "Der private Schlüssel lässt sich mit diesem KEK nicht lesen"); }
  try { return { ok: true, cek: await packeAus(umschlag, kopf, privat), art: paar.art, rechnerId: paar.rechnerId }; }
  catch { return fehler(422, "umschlag_ungueltig", `Block ${kopf.block} lässt sich nicht auspacken`); }
}
```

Hinweis: Die Reihenfolge „ID-Abgleich vor DB-Suche“ ist Absicht (billigster Check zuerst). Der Test „Kopf mit anderer ID“ erwartet deshalb `schluessel_passt_nicht`.

- [ ] **Step 6: `status.ts`**

```ts
import type { Db } from "../stammdaten/daten";
import { kekAusUmgebung } from "./kek";
import { echtesPaar, entschluesselePrivat } from "./paar";

export interface Schluesselstatus { kek: "ok" | "fehlt" | "ungueltig"; paar: "fehlt" | "ok" | "kek_passt_nicht" | "unbekannt"; schluesselId: string | null }

export async function schluesselStatus(db: Db, env: Record<string, string | undefined> = process.env): Promise<Schluesselstatus> {
  const k = kekAusUmgebung(env);
  const p = echtesPaar(db);
  if (!p) return { kek: k.status, paar: "fehlt", schluesselId: null };
  if (k.status !== "ok") return { kek: k.status, paar: "unbekannt", schluesselId: p.schluesselId };
  try { await entschluesselePrivat(p.privatVerschluesselt, p.schluesselId, k.kek); return { kek: "ok", paar: "ok", schluesselId: p.schluesselId }; }
  catch { return { kek: "ok", paar: "kek_passt_nicht", schluesselId: p.schluesselId }; }
}
```

- [ ] **Step 7: Tests grün.**
- [ ] **Step 8: Commit** — `feat(einsatzbuch): Schlüsselpaar mit KEK und Freigaberegel für die Schlüsselfreigabe`

---

### Task 8: Notfall-Sicherung und Schlüssel-Skript

**Files:**
- Create: `M/_lib/schluessel/notfall.ts`, `M/_lib/schluessel/verwaltung.ts`, `scripts/einsatzbuch-schluessel.ts`
- Modify: `package.json` (Skript `"einsatzbuch:schluessel": "tsx scripts/einsatzbuch-schluessel.ts"`)
- Test: `M/_lib/schluessel/notfall.test.ts`, `M/_lib/schluessel/verwaltung.test.ts`

**Interfaces:**
- Consumes: `legePaarAn`, `echtesPaar`, `verschluesselePrivat` (Task 7), `kanonisch`/`ausKanonischemJson` aus dem Kern, `qrSvg` aus `@/core/qr`.
- Produces:
  - `notfall.ts`: `NOTFALL_KENNWORT_MINDESTLAENGE = 16`; `interface Notfalldatei { format: "einsatzbuch-notfall"; version: 1; kopf: { schluesselId: string; oeffentlich: string; erstellt: string }; kdf: { name: "PBKDF2"; hash: "SHA-256"; iterationen: 600000; salt: string }; chiffre: { name: "AES-GCM"; laenge: 256; iv: string }; daten: string }`; `erzeugeNotfalldatei(pkcs8, kopf, kennwort): Promise<Notfalldatei>`; `istNotfalldatei(x): x is Notfalldatei`; `oeffneNotfalldatei(d, kennwort): Promise<Bytes>` (wirft `KennwortFalsch` aus dem Kern bei falschem Kennwort; prüft, dass der private Schlüssel zu `kopf.oeffentlich` und `kopf.schluesselId` passt); `notfallText(d): string` (= `kanonisch(d)`, QR-Nutzlast); `notfallDruckseite(d): Promise<string>` (HTML mit QR-SVG, `schluesselId`, `erstellt`, Anleitung).
  - `verwaltung.ts`: `erzeugeEchtesPaar(db, { kek, kennwort, jetzt }): Promise<{ schluesselId: string; notfall: Notfalldatei }>` (wirft `EchtesPaarVorhanden`); `stelleEchtesPaarWiederHer(db, { kek, notfall, kennwort }): Promise<{ schluesselId: string; ersetzt: boolean }>` (legt an, wenn kein echtes Paar existiert; verschlüsselt neu, wenn das vorhandene dieselbe `schluesselId` hat; wirft `AnderesPaarVorhanden` sonst).

- [ ] **Step 1: Tests**

`notfall.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { utf8 } from "../kern/bytes";
import { KennwortFalsch } from "../kern/export";
import { erzeugeSchluesselpaar } from "../kern/umschlag";
import { erzeugeNotfalldatei, istNotfalldatei, notfallDruckseite, notfallText, oeffneNotfalldatei } from "./notfall";

async function paar() {
  const p = await erzeugeSchluesselpaar();
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", p.privateKey));
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", p.publicKey));
  return { pkcs8, spki };
}
const KW = "ein-langes-notfallkennwort";

describe("Notfall-Sicherung", () => {
  it("Rundlauf, und die Datei nennt 600 000 Runden", async () => {
    const { pkcs8, spki } = await paar();
    const { zuBase64, sha256Hex } = await import("../kern/bytes");
    const kopf = { schluesselId: (await sha256Hex(spki)).slice(0, 16), oeffentlich: zuBase64(spki), erstellt: "2026-09-24T10:00:00+02:00" };
    const d = await erzeugeNotfalldatei(pkcs8, kopf, KW);
    expect(d.kdf.iterationen).toBe(600000);
    expect(istNotfalldatei(JSON.parse(JSON.stringify(d)))).toBe(true);
    expect(await oeffneNotfalldatei(d, KW)).toEqual(pkcs8);
  });
  it("falsches Kennwort → KennwortFalsch; kurzes Kennwort wird beim Erzeugen abgelehnt", async () => {
    const { pkcs8, spki } = await paar();
    const { zuBase64, sha256Hex } = await import("../kern/bytes");
    const kopf = { schluesselId: (await sha256Hex(spki)).slice(0, 16), oeffentlich: zuBase64(spki), erstellt: "2026-09-24T10:00:00+02:00" };
    const d = await erzeugeNotfalldatei(pkcs8, kopf, KW);
    await expect(oeffneNotfalldatei(d, "falsches-kennwort-123")).rejects.toBeInstanceOf(KennwortFalsch);
    await expect(erzeugeNotfalldatei(pkcs8, kopf, "zu-kurz")).rejects.toThrow("mindestens 16 Zeichen");
  });
  it("ein fremder öffentlicher Schlüssel im Kopf fällt beim Öffnen auf", async () => {
    const a = await paar(); const b = await paar();
    const { zuBase64, sha256Hex } = await import("../kern/bytes");
    const kopf = { schluesselId: (await sha256Hex(b.spki)).slice(0, 16), oeffentlich: zuBase64(b.spki), erstellt: "2026-09-24T10:00:00+02:00" };
    const d = await erzeugeNotfalldatei(a.pkcs8, kopf, KW);
    await expect(oeffneNotfalldatei(d, KW)).rejects.toThrow("passt nicht zum öffentlichen Schlüssel");
  });
  it("QR-Nutzlast bleibt unter 1273 Byte (QR Level H), die Druckseite trägt QR und Kennung", async () => {
    const { pkcs8, spki } = await paar();
    const { zuBase64, sha256Hex } = await import("../kern/bytes");
    const kopf = { schluesselId: (await sha256Hex(spki)).slice(0, 16), oeffentlich: zuBase64(spki), erstellt: "2026-09-24T10:00:00+02:00" };
    const d = await erzeugeNotfalldatei(pkcs8, kopf, KW);
    expect(utf8(notfallText(d)).length).toBeLessThan(1273);
    const html = await notfallDruckseite(d);
    expect(html).toContain("<svg");
    expect(html).toContain(kopf.schluesselId);
  });
});
```

`verwaltung.test.ts`: (a) `erzeugeEchtesPaar` legt genau eine Zeile an, deren `schluesselId` der Notfalldatei entspricht, und ein zweiter Aufruf wirft `EchtesPaarVorhanden` ohne neue Zeile (`count(*)` von `schluesselpaar` und `audit_outbox` unverändert); (b) Wiederherstellen in eine leere DB legt das Paar mit neuem KEK an, und `packeAusFuer` packt danach einen mit `versiegele` gebauten `echt`-Block zum selben CEK aus (CEK über `Blockzufall` fest vorgeben); (c) Wiederherstellen bei gleicher `schluesselId` ersetzt `privatVerschluesselt` (`ersetzt: true`); (d) bei anderer `schluesselId` → `AnderesPaarVorhanden`.

- [ ] **Step 2: Tests scheitern.**

- [ ] **Step 3: `notfall.ts`**

```ts
import { qrSvg } from "@/core/qr";
import { ausBase64, mitLaenge, sha256Hex, utf8, zuBase64, zufall, type Bytes } from "../kern/bytes";
import { KennwortFalsch } from "../kern/export";
import { hatGenauSchluessel, istObjekt } from "../kern/format";
import { kanonisch } from "../kern/kanonisch";

export const NOTFALL_KENNWORT_MINDESTLAENGE = 16;
const ITERATIONEN = 600_000;

export interface Notfallkopf { schluesselId: string; oeffentlich: string; erstellt: string }
export interface Notfalldatei {
  format: "einsatzbuch-notfall"; version: 1; kopf: Notfallkopf;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterationen: 600000; salt: string };
  chiffre: { name: "AES-GCM"; laenge: 256; iv: string };
  daten: string;
}

async function schluessel(kennwort: string, salt: Bytes) {
  const basis = await crypto.subtle.importKey("raw", utf8(kennwort), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONEN }, basis, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Wie der Export des Kerns (`kern/export.ts`), nur für den privaten Schlüssel; der Kopf ist AAD. */
export async function erzeugeNotfalldatei(pkcs8: Bytes, kopf: Notfallkopf, kennwort: string): Promise<Notfalldatei> {
  if (kennwort.length < NOTFALL_KENNWORT_MINDESTLAENGE) throw new Error(`Das Notfall-Kennwort braucht mindestens ${NOTFALL_KENNWORT_MINDESTLAENGE} Zeichen`);
  const salt = zufall(16); const iv = zufall(12);
  const daten = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(kanonisch(kopf)) }, await schluessel(kennwort, salt), pkcs8));
  return {
    format: "einsatzbuch-notfall", version: 1, kopf,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterationen: ITERATIONEN, salt: zuBase64(salt) },
    chiffre: { name: "AES-GCM", laenge: 256, iv: zuBase64(iv) }, daten: zuBase64(daten),
  };
}

export function istNotfalldatei(x: unknown): x is Notfalldatei {
  if (!istObjekt(x) || !hatGenauSchluessel(x, ["format", "version", "kopf", "kdf", "chiffre", "daten"])) return false;
  const { kopf, kdf, chiffre } = x;
  return x.format === "einsatzbuch-notfall" && x.version === 1 && typeof x.daten === "string"
    && istObjekt(kopf) && hatGenauSchluessel(kopf, ["schluesselId", "oeffentlich", "erstellt"])
    && typeof kopf.schluesselId === "string" && typeof kopf.oeffentlich === "string" && typeof kopf.erstellt === "string"
    && istObjekt(kdf) && hatGenauSchluessel(kdf, ["name", "hash", "iterationen", "salt"]) && kdf.name === "PBKDF2" && kdf.hash === "SHA-256" && kdf.iterationen === ITERATIONEN && typeof kdf.salt === "string"
    && istObjekt(chiffre) && hatGenauSchluessel(chiffre, ["name", "laenge", "iv"]) && chiffre.name === "AES-GCM" && chiffre.laenge === 256 && typeof chiffre.iv === "string";
}

export async function oeffneNotfalldatei(d: Notfalldatei, kennwort: string): Promise<Bytes> {
  if (!istNotfalldatei(d)) throw new Error("Keine Notfall-Sicherung des Einsatzbuchs");
  const salt = mitLaenge(ausBase64(d.kdf.salt), 16, "salt"); const iv = mitLaenge(ausBase64(d.chiffre.iv), 12, "iv");
  let pkcs8: Bytes;
  try {
    pkcs8 = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: utf8(kanonisch(d.kopf)) }, await schluessel(kennwort, salt), ausBase64(d.daten)));
  } catch { throw new KennwortFalsch(); }
  // Passt der private Schlüssel zum öffentlichen im Kopf? Die JWK des privaten Schlüssels trägt x und y.
  const privat = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const jwk = await crypto.subtle.exportKey("jwk", privat);
  const oeff = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", oeff));
  if (zuBase64(spki) !== d.kopf.oeffentlich || (await sha256Hex(spki)).slice(0, 16) !== d.kopf.schluesselId) {
    throw new Error("Der private Schlüssel passt nicht zum öffentlichen Schlüssel der Sicherung");
  }
  return pkcs8;
}

export const notfallText = (d: Notfalldatei): string => kanonisch(d);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Eine Seite zum Ausdrucken: QR mit der vollständigen Sicherung, Kennung, Datum, Anleitung. Kein Kennwort. */
export async function notfallDruckseite(d: Notfalldatei): Promise<string> {
  const svg = await qrSvg(notfallText(d));
  return `<!doctype html><html lang="de"><meta charset="utf-8"><title>Einsatzbuch — Notfall-Sicherung ${esc(d.kopf.schluesselId)}</title>
<style>@page{size:210mm 297mm;margin:16mm}body{font-family:system-ui,sans-serif;color:#1a1d20}svg{width:120mm;height:120mm}pre{white-space:pre-wrap;word-break:break-all;font-size:8pt}</style>
<h1>Einsatzbuch — Notfall-Sicherung des Schlüssels</h1>
<p>Schlüssel-Kennung <strong>${esc(d.kopf.schluesselId)}</strong>, erstellt ${esc(d.kopf.erstellt)}.</p>
<p>Der QR-Code enthält die vollständige, mit dem Notfall-Kennwort verschlüsselte Sicherung. Das Kennwort steht NICHT auf diesem Blatt. Wiederherstellen: QR-Inhalt als Datei speichern und <code>pnpm einsatzbuch:schluessel wiederherstellen &lt;datei&gt;</code> (Runbook „einsatzbuch-schluessel“).</p>
${svg}
<pre>${esc(notfallText(d))}</pre>
</html>`;
}
```

- [ ] **Step 4: `verwaltung.ts`**

```ts
import { eq } from "drizzle-orm";
import { schluesselpaar } from "../../_db/schema";
import type { Bytes } from "../kern/bytes";
import type { Db } from "../stammdaten/daten";
import { erzeugeNotfalldatei, oeffneNotfalldatei, type Notfalldatei } from "./notfall";
import { echtesPaar, legePaarAn, verschluesselePrivat } from "./paar";

export class EchtesPaarVorhanden extends Error { constructor(id: string) { super(`Es gibt schon ein echtes Schlüsselpaar (${id}). Schlüsselwechsel gehört nicht zu v2.0.`); } }
export class AnderesPaarVorhanden extends Error { constructor(vorhanden: string, sicherung: string) { super(`In der Suite liegt das Paar ${vorhanden}, die Sicherung gehört zu ${sicherung}.`); } }

/** Zeitpunkt mit Offset in der Zone des Prozesses, z. B. 2026-09-24T10:00:00+02:00. */
function mitOffset(d: Date): string {
  const m = -d.getTimezoneOffset(); const v = m >= 0 ? "+" : "-"; const a = Math.abs(m);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${v}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

export async function erzeugeEchtesPaar(db: Db, o: { kek: Bytes; kennwort: string; jetzt: Date }): Promise<{ schluesselId: string; notfall: Notfalldatei }> {
  const vorhanden = echtesPaar(db);
  if (vorhanden) throw new EchtesPaarVorhanden(vorhanden.schluesselId);
  // Erst die Sicherung (prüft die Kennwortlänge), dann die Zeile: ohne Sicherung kein Paar.
  const { erzeugeSchluesselpaar } = await import("../kern/umschlag");
  const { zuBase64, sha256Hex } = await import("../kern/bytes");
  const p = await erzeugeSchluesselpaar();
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", p.privateKey));
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", p.publicKey));
  const kopf = { schluesselId: (await sha256Hex(spki)).slice(0, 16), oeffentlich: zuBase64(spki), erstellt: mitOffset(o.jetzt) };
  const notfall = await erzeugeNotfalldatei(pkcs8, kopf, o.kennwort);
  const neu = await legePaarAn(db, { art: "echt", rechnerId: null, kek: o.kek, jetzt: o.jetzt, paar: { pkcs8, oeffentlich: kopf.oeffentlich } });
  return { schluesselId: neu.schluesselId, notfall };
}

export async function stelleEchtesPaarWiederHer(db: Db, o: { kek: Bytes; notfall: Notfalldatei; kennwort: string }): Promise<{ schluesselId: string; ersetzt: boolean }> {
  const pkcs8 = await oeffneNotfalldatei(o.notfall, o.kennwort);
  const id = o.notfall.kopf.schluesselId;
  const vorhanden = echtesPaar(db);
  if (vorhanden && vorhanden.schluesselId !== id) throw new AnderesPaarVorhanden(vorhanden.schluesselId, id);
  if (vorhanden) {
    db.update(schluesselpaar).set({ privatVerschluesselt: await verschluesselePrivat(pkcs8, id, o.kek) }).where(eq(schluesselpaar.id, vorhanden.id)).run();
    return { schluesselId: id, ersetzt: true };
  }
  await legePaarAn(db, { art: "echt", rechnerId: null, kek: o.kek, jetzt: new Date(), paar: { pkcs8, oeffentlich: o.notfall.kopf.oeffentlich } });
  return { schluesselId: id, ersetzt: false };
}
```

(Die dynamischen Importe darf der Implementierer zu statischen machen; sie stehen nur hier, um die Datei kurz zu halten.)

- [ ] **Step 5: `scripts/einsatzbuch-schluessel.ts`** — dünne Hülle, alle Logik in `verwaltung.ts`:

```ts
/**
 * pnpm einsatzbuch:schluessel erzeugen [--ausgabe <ordner>]
 * pnpm einsatzbuch:schluessel wiederherstellen <notfalldatei.json>
 *
 * Läuft aus einem Checkout DESSELBEN Stands wie die laufende Suite, gegen DATA_DIR
 * (Runbook docs/runbooks/einsatzbuch-schluessel.md). Migriert NICHT: die Suite muss mit
 * diesem Stand einmal gestartet sein. Kennwort interaktiv oder aus EINSATZBUCH_NOTFALL_KENNWORT.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { sql } from "drizzle-orm";
import { getModuleDb } from "@/core/db";
import * as schema from "@/app/m/einsatzbuch/_db/schema";
import { kekAusUmgebung, KEK_VARIABLE } from "@/app/m/einsatzbuch/_lib/schluessel/kek";
import { istNotfalldatei, notfallDruckseite } from "@/app/m/einsatzbuch/_lib/schluessel/notfall";
import { erzeugeEchtesPaar, stelleEchtesPaarWiederHer } from "@/app/m/einsatzbuch/_lib/schluessel/verwaltung";

function verdeckt(frage: string): Promise<string> {
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => { if (s.includes(frage)) process.stdout.write(s); };
    rl.question(frage, (a) => { rl.close(); process.stdout.write("\n"); ok(a); });
  });
}

async function kennwort(zweimal: boolean): Promise<string> {
  const aus = process.env.EINSATZBUCH_NOTFALL_KENNWORT;
  if (aus) return aus;
  const a = await verdeckt("Notfall-Kennwort: ");
  if (zweimal && a !== (await verdeckt("Notfall-Kennwort wiederholen: "))) throw new Error("Die Kennwörter stimmen nicht überein.");
  return a;
}

export async function main(argv: string[]): Promise<number> {
  const [befehl, ...rest] = argv;
  const k = kekAusUmgebung();
  if (k.status !== "ok") { console.error(`${KEK_VARIABLE} ${k.status === "fehlt" ? "fehlt" : "ist kein 32-Byte-Wert in Base64"}. Erzeugen: openssl rand -base64 32`); return 2; }
  const db = getModuleDb("einsatzbuch", schema);
  const tabelle = db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='schluesselpaar'`);
  if (tabelle.length === 0) { console.error("Die Tabelle schluesselpaar fehlt. Starte die Suite mit diesem Stand einmal (sie migriert beim Start)."); return 2; }

  if (befehl === "erzeugen") {
    const i = rest.indexOf("--ausgabe"); const ordner = i >= 0 ? rest[i + 1] : process.cwd();
    const { schluesselId, notfall } = await erzeugeEchtesPaar(db, { kek: k.kek, kennwort: await kennwort(true), jetzt: new Date() });
    const json = path.join(ordner, `einsatzbuch-notfall-${schluesselId}.json`);
    const html = path.join(ordner, `einsatzbuch-notfall-${schluesselId}.html`);
    writeFileSync(json, JSON.stringify(notfall, null, 2) + "\n", { mode: 0o600 });
    writeFileSync(html, await notfallDruckseite(notfall), { mode: 0o600 });
    console.log(`Schlüsselpaar ${schluesselId} angelegt.\nNotfall-Sicherung: ${json}\nZum Ausdrucken:    ${html}\nBeide Dateien in den Tresor, danach von diesem Rechner löschen.`);
    return 0;
  }
  if (befehl === "wiederherstellen") {
    const datei = rest[0];
    if (!datei || !existsSync(datei)) { console.error("Aufruf: pnpm einsatzbuch:schluessel wiederherstellen <notfalldatei.json>"); return 2; }
    const notfall: unknown = JSON.parse(readFileSync(datei, "utf8"));
    if (!istNotfalldatei(notfall)) { console.error("Das ist keine Notfall-Sicherung des Einsatzbuchs."); return 2; }
    const r = await stelleEchtesPaarWiederHer(db, { kek: k.kek, notfall, kennwort: await kennwort(false) });
    console.log(r.ersetzt ? `Schlüsselpaar ${r.schluesselId}: privater Schlüssel mit dem aktuellen KEK neu abgelegt.` : `Schlüsselpaar ${r.schluesselId} wiederhergestellt.`);
    return 0;
  }
  console.error("Aufruf: pnpm einsatzbuch:schluessel erzeugen [--ausgabe <ordner>] | wiederherstellen <datei>");
  return 2;
}

if (process.argv[1]?.endsWith("einsatzbuch-schluessel.ts")) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
```

- [ ] **Step 6: Tests grün**, dazu ein echter Rauchlauf gegen ein Wegwerf-Verzeichnis:

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-suite && export DATA_DIR=./.data/schluessel-probe && rm -rf $DATA_DIR && pnpm seed:lokal einsatzbuch >/dev/null \
  && EINSATZBUCH_SCHLUESSEL_KEK=$(openssl rand -base64 32) EINSATZBUCH_NOTFALL_KENNWORT=probe-kennwort-1234 pnpm einsatzbuch:schluessel erzeugen --ausgabe $DATA_DIR; echo "exit $?"
```

Erwartet: Ohne vorherigen Seed-Paar-Ausschluss meldet das Skript `Es gibt schon ein echtes Schlüsselpaar` (der Seed hat das Entwicklungs-Paar angelegt) → Exit 1. Mit frischem `DATA_DIR`, in dem die Suite migriert, aber kein Seed lief (`pnpm exec tsx -e "import('@/core/bootstrap').then(m=>m.migrateAllModules())"` o. ä.), entstehen `.json` und `.html`. Danach `rm -rf ./.data/schluessel-probe`. (Task 9 liefert den Seed; führe den Rauchlauf also nach Task 9 aus oder mit dem Migrationsaufruf.)

- [ ] **Step 7: Commit** — `feat(einsatzbuch): Schlüssel-Skript mit kennwortgeschützter Notfall-Sicherung und QR`

---

### Task 9: Seed, Übersicht mit KEK-Hinweis, `.env.example`, Runbook

**Files:**
- Create: `M/_lib/stammdaten/vorlage.ts`, `M/_ui/KekHinweis.tsx`, `docs/runbooks/einsatzbuch-schluessel.md`
- Modify: `M/_lib/seedLokal.ts`, `M/(verwaltung)/page.tsx`, `.env.example`
- Test: `M/_lib/stammdaten/vorlage.test.ts`, `M/_lib/seedLokal.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 7.
- Produces:
  - `vorlage.ts`: `ORTE: readonly (readonly [string, number])[]`, `GRUPPEN: readonly { name: string; items: readonly string[] }[]`, `QUALIS`, `VORLAGE_FAHRZEUGE: FahrzeugDTO[]` (56, `id = kennung`), `VORLAGE_PERSONAL: PersonDTO[]` (112, `id = "p1"…"p112"`), `VORLAGE_STICHWORTE: StichwortDTO[]` (12, `id = "sw-" + slug`, `reihenfolge` = Position in der Gruppe ab 1).
  - `seedLokalEinsatzbuch(db, env = process.env): Promise<string[]>`.

- [ ] **Step 1: Tests**

`vorlage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VORLAGE_FAHRZEUGE, VORLAGE_PERSONAL, VORLAGE_STICHWORTE } from "./vorlage";

describe("Stammdaten der Vorlage", () => {
  it("56 Fahrzeuge, Kennung = ID, Funkrufname nach Muster", () => {
    expect(VORLAGE_FAHRZEUGE).toHaveLength(56);
    expect(new Set(VORLAGE_FAHRZEUGE.map((f) => f.kennung)).size).toBe(56);
    expect(VORLAGE_FAHRZEUGE.find((f) => f.kennung === "11-11-1")).toEqual({ id: "11-11-1", typ: "ELW 1", kennung: "11-11-1", ruf: "Rotkreuz Uelzen 11-11-1", standort: "Uelzen", aktiv: true });
    expect(VORLAGE_FAHRZEUGE.filter((f) => f.standort === "Bad Bodenteich").map((f) => f.kennung)).toEqual(["18-83-1", "18-85-1", "18-64-1", "18-19-1", "18-19-2", "18-10-1"]);
  });
  it("112 Personen mit festen IDs aus dem Generator der Vorlage", () => {
    expect(VORLAGE_PERSONAL).toHaveLength(112);
    expect(VORLAGE_PERSONAL.find((p) => p.id === "p1")).toMatchObject({ name: "Albers, Jana", quali: "SanH", ov: "Uelzen" });
    expect(VORLAGE_PERSONAL.find((p) => p.id === "p4")).toMatchObject({ name: "Dierks, Paul", quali: "SanH", ov: "Bad Bodenteich" });
    expect(VORLAGE_PERSONAL.find((p) => p.id === "p8")).toMatchObject({ name: "Hansen, Finn", quali: "NotSan", ov: "Suderburg" });
    expect(new Set(VORLAGE_PERSONAL.map((p) => p.name)).size).toBe(112);
  });
  it("12 Stichworte in 5 Gruppen, eindeutige Namen", () => {
    expect(VORLAGE_STICHWORTE).toHaveLength(12);
    expect(VORLAGE_STICHWORTE.find((s) => s.name === "Unterstützung RD")).toEqual({ id: "sw-unterstuetzung-rd", gruppe: "Rettungsdienst", name: "Unterstützung RD", reihenfolge: 3, aktiv: true });
  });
});
```

(Die Erwartungen für p4/p8 stammen aus der Auswertung des Generators; stimmt eine nach sauberer Portierung nicht, gilt der portierte Generator und der Test wird mit Begründung im Commit-Body angepasst — **nicht** der Generator.)

`seedLokal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./testDb";
import { seedLokalEinsatzbuch } from "./seedLokal";
import { echtesPaar } from "./schluessel/paar";
import { ENTWICKLUNGS_KEK } from "./schluessel/kek";
import { schluesselStatus } from "./schluessel/status";

const TABELLEN = ["fahrzeug", "person", "stichwort", "einstellung", "schluesselpaar", "audit_outbox"];
const zaehle = (db: ReturnType<typeof testDb>) => Object.fromEntries(TABELLEN.map((t) => [t, (db.all(sql.raw(`SELECT count(*) AS n FROM ${t}`)) as { n: number }[])[0].n]));
const version = (db: ReturnType<typeof testDb>) => (db.all(sql`SELECT version FROM stammdatenstand`) as { version: number }[])[0].version;

describe("seedLokalEinsatzbuch", () => {
  it("füllt Stammdaten und Entwicklungs-Paar; der zweite Lauf ändert nichts (alle Tabellen, Outbox, Version)", async () => {
    const db = testDb();
    await seedLokalEinsatzbuch(db, {});
    const erst = zaehle(db); const v = version(db);
    expect(erst).toMatchObject({ fahrzeug: 56, person: 112, stichwort: 12, schluesselpaar: 1 });
    const zeilen = await seedLokalEinsatzbuch(db, {});
    expect(zaehle(db)).toEqual(erst);
    expect(version(db)).toBe(v);
    expect(zeilen.join("\n")).toContain("0 Fahrzeuge angelegt");
    expect(await schluesselStatus(db, { EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK })).toMatchObject({ kek: "ok", paar: "ok" });
  });
  it("mit fremdem KEK in der Umgebung legt er kein Paar an", async () => {
    const db = testDb();
    const zeilen = await seedLokalEinsatzbuch(db, { EINSATZBUCH_SCHLUESSEL_KEK: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=" });
    expect(echtesPaar(db)).toBeUndefined();
    expect(zeilen.join("\n")).toContain("Schlüsselpaar übersprungen");
  });
  it("ändert keine vorhandene Zeile (additiv)", async () => {
    const db = testDb();
    await seedLokalEinsatzbuch(db, {});
    db.run(sql`UPDATE fahrzeug SET ruf = 'umbenannt' WHERE id = '11-83-1'`);
    await seedLokalEinsatzbuch(db, {});
    expect((db.all(sql`SELECT ruf FROM fahrzeug WHERE id = '11-83-1'`) as { ruf: string }[])[0].ruf).toBe("umbenannt");
  });
});
```

- [ ] **Step 2: Tests scheitern.**

- [ ] **Step 3: `vorlage.ts`** — die Generatoren aus `docs/design/einsatzbuch-v2/vorlage/Einsatzbuch v2.dc.html` (Zeilen 533–570, Konstanten `GRUPPEN`, `ORTE`, `FZ`, `PERSONAL`, `QUALIS`) **wörtlich** portieren:

```ts
import type { FahrzeugDTO, PersonDTO, StichwortDTO } from "./typen";

/** Wörtlich aus der Vorlage (`Einsatzbuch v2.dc.html`, `ORTE`): Standort bzw. Ortsverein → Kennungspräfix. */
export const ORTE = [["Uelzen", 11], ["Bad Bevensen", 12], ["Ebstorf", 13], ["Suderburg", 14], ["Bienenbüttel", 15], ["Rosche", 16], ["Wrestedt", 17], ["Bad Bodenteich", 18]] as const;
export const GRUPPEN = [
  { name: "Rettungsdienst", items: ["RD 1", "RD 2", "Unterstützung RD"] },
  { name: "MANV", items: ["MANV 5", "MANV 10", "MANV 25"] },
  { name: "Sanitätsdienst", items: ["SanD"] },
  { name: "Betreuung", items: ["Betreuung 25", "Betreuung 50", "Evakuierung"] },
  { name: "Sonstiges", items: ["Personensuche", "Sonstiges"] },
] as const;
export const QUALIS = ["NotSan", "RS", "SanH", "BtH", "GF", "ZF", "SprF"] as const;

export const VORLAGE_FAHRZEUGE: FahrzeugDTO[] = (() => {
  const T: Record<string, number> = { "ELW 1": 11, RTW: 83, "KTW-B": 85, "GW-San": 64, "GW-Bt": 68, MTF: 19, PKW: 10 };
  const U: Record<string, number> = { "ELW 1": 1, RTW: 2, "KTW-B": 3, "GW-San": 2, "GW-Bt": 1, MTF: 3, PKW: 2 };
  const A: Record<string, number> = { RTW: 1, "KTW-B": 1, "GW-San": 1, MTF: 2, PKW: 1 };
  const out: FahrzeugDTO[] = [];
  ORTE.forEach(([ort, k], i) => {
    Object.entries(i === 0 ? U : A).forEach(([typ, n]) => {
      for (let j = 1; j <= n; j++) { const kennung = `${k}-${T[typ]}-${j}`; out.push({ id: kennung, typ, kennung, ruf: `Rotkreuz ${ort} ${kennung}`, standort: ort, aktiv: true }); }
    });
  });
  return out;
})();

export const VORLAGE_PERSONAL: PersonDTO[] = (() => {
  const nn = ["Albers", "Behrens", "Cordes", "Dierks", "Ehlers", "Fricke", "Garbers", "Hansen", "Isermann", "Jürgens", "Kruse", "Lüders", "Meyer", "Niemann", "Otte", "Peters", "Quast", "Rademacher", "Schulz", "Thies", "Ulrich", "Voß", "Wiebe", "Zander", "Brandt", "Heuer", "Möller", "Schröder"];
  const vn = ["Jana", "Tim", "Lea", "Malte", "Sophie", "Jonas", "Nele", "Ole", "Paula", "Finn", "Marie", "Ben", "Hanna", "Lukas", "Clara", "Henrik", "Emma", "Mats", "Lina", "Jan", "Mia", "Paul", "Ida", "Tom", "Frieda", "Nils", "Greta", "Lars", "Merle", "Hauke", "Svenja", "Arne", "Kira", "Timo", "Wiebke", "Sönke", "Anke", "Jens", "Maren", "Bjarne"];
  const q = ["SanH", "SanH", "RS", "SanH", "BtH", "RS", "SanH", "NotSan", "BtH", "SanH", "GF", "RS", "SanH", "BtH", "ZF", "SprF", "RS", "SanH"];
  const out: PersonDTO[] = [];
  for (let i = 0; i < 112; i++) out.push({ id: "p" + (i + 1), name: `${nn[i % 28]}, ${vn[(i * 7 + Math.floor(i / 28) * 3) % 40]}`, quali: q[i % q.length], ov: ORTE[(i * 5) % 8][0], aktiv: true });
  return out.sort((a, b) => a.name.localeCompare(b.name, "de"));
})();

const slug = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const VORLAGE_STICHWORTE: StichwortDTO[] = GRUPPEN.flatMap((g) =>
  g.items.map((name, i) => ({ id: `sw-${slug(name)}`, gruppe: g.name, name, reihenfolge: i + 1, aktiv: true })));
```

Vor dem Schreiben den Generator in der Vorlage selbst gegenlesen (Zeilen 533–570) und die Konstanten Zeichen für Zeichen vergleichen.

- [ ] **Step 4: `seedLokal.ts`**

```ts
import type { EinsatzbuchDb } from "../_db/client";
import { fahrzeug, person, stichwort } from "../_db/schema";
import { ausBase64 } from "./kern/bytes";
import { ENTWICKLUNGS_KEK, KEK_VARIABLE } from "./schluessel/kek";
import { echtesPaar, legePaarAn } from "./schluessel/paar";
import { VORLAGE_FAHRZEUGE, VORLAGE_PERSONAL, VORLAGE_STICHWORTE } from "./stammdaten/vorlage";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag einsatzbuch): ein Seed in einer
 * Generalprobe (SUITE_SEED=1) legte ein bekanntes Schlüsselpaar an. Idempotent PRO ENTITÄT über feste
 * IDs und `onConflictDoNothing`, additiv (ändert nichts Vorhandenes).
 */
export async function seedLokalEinsatzbuch(db: EinsatzbuchDb, env: Record<string, string | undefined> = process.env): Promise<string[]> {
  const zaehle = (werte: { changes: number }[]) => werte.reduce((n, r) => n + r.changes, 0);
  const fz = zaehle(VORLAGE_FAHRZEUGE.map((f) => db.insert(fahrzeug).values(f).onConflictDoNothing().run()));
  const pe = zaehle(VORLAGE_PERSONAL.map((p) => db.insert(person).values(p).onConflictDoNothing().run()));
  const sw = zaehle(VORLAGE_STICHWORTE.map((s) => db.insert(stichwort).values(s).onConflictDoNothing().run()));
  const zeilen = [`einsatzbuch: ${fz} Fahrzeuge angelegt, ${pe} Personen angelegt, ${sw} Stichworte angelegt`];

  const kekUmgebung = env[KEK_VARIABLE]?.trim();
  if (echtesPaar(db)) zeilen.push("einsatzbuch: Schlüsselpaar vorhanden");
  else if (kekUmgebung && kekUmgebung !== ENTWICKLUNGS_KEK) zeilen.push(`einsatzbuch: Schlüsselpaar übersprungen (${KEK_VARIABLE} ist gesetzt und nicht der Entwicklungs-KEK; erzeugen mit pnpm einsatzbuch:schluessel erzeugen)`);
  else {
    const neu = await legePaarAn(db, { art: "echt", rechnerId: null, kek: ausBase64(ENTWICKLUNGS_KEK), jetzt: new Date() });
    zeilen.push(`einsatzbuch: Entwicklungs-Schlüsselpaar ${neu.schluesselId} angelegt — ${KEK_VARIABLE}=${ENTWICKLUNGS_KEK} in .env.local setzen`);
  }
  return zeilen;
}
```

Hinweis: Der Konflikt-Test für `stichwort` braucht Konfliktfreiheit auch auf `name`: `onConflictDoNothing()` ohne `target` deckt jeden Unique-Konflikt ab (SQLite `ON CONFLICT DO NOTHING`).

- [ ] **Step 5: Übersicht** — `M/_ui/KekHinweis.tsx`:

```tsx
"use client";
import { Alert } from "antd";
import type { Schluesselstatus } from "../_lib/schluessel/status";

const TEXT: Record<string, { title: string; description: string } | undefined> = {
  fehlt: { title: "Der Schlüssel-KEK fehlt", description: "EINSATZBUCH_SCHLUESSEL_KEK ist in der Umgebung der Suite nicht gesetzt. Ohne ihn kann die Suite keine Einsätze freigeben; Stammdaten und Reader funktionieren weiter." },
  ungueltig: { title: "Der Schlüssel-KEK ist ungültig", description: "EINSATZBUCH_SCHLUESSEL_KEK muss 32 Byte in Base64 sein (erzeugen mit openssl rand -base64 32)." },
  kek_passt_nicht: { title: "Der Schlüssel-KEK passt nicht zum Schlüsselpaar", description: "Mit dem gesetzten KEK lässt sich der private Schlüssel nicht lesen. Stell den richtigen KEK ein oder lege den Schlüssel aus der Notfall-Sicherung neu ab." },
  paar_fehlt: { title: "Noch kein Schlüsselpaar", description: "Erzeuge es einmalig mit pnpm einsatzbuch:schluessel erzeugen (Runbook „Einsatzbuch-Schlüssel“)." },
};

export function KekHinweis({ status }: { status: Schluesselstatus }) {
  const schluessel = status.kek !== "ok" ? status.kek : status.paar === "fehlt" ? "paar_fehlt" : status.paar === "kek_passt_nicht" ? "kek_passt_nicht" : null;
  const t = schluessel ? TEXT[schluessel] : undefined;
  if (!t) return null;
  return <Alert type="warning" showIcon title={t.title} description={t.description} data-testid="kek-hinweis" />;
}
```

(Prüfe in antd 6, ob `Alert` `title` oder `message` heißt — Vorbild `lagerbuch/verwaltung/(arbeit)/import/ImportForm.tsx` nutzt `title`.)

`M/(verwaltung)/page.tsx`:

```tsx
import { headers } from "next/headers";
import { Card, Statistic } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../_db/client";
import { requireEinsatzbuchHost } from "../_lib/host";
import { requireEinsatzbuchZugang } from "../_lib/zugang";
import { listeFahrzeuge, listePersonal, listeStichworte, stammdatenVersion } from "../_lib/stammdaten/daten";
import { schluesselStatus } from "../_lib/schluessel/status";
import { KekHinweis } from "../_ui/KekHinweis";

export const dynamic = "force-dynamic";

export default async function EinsatzbuchUebersicht() {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  const db = getDb();
  const status = await schluesselStatus(db);
  const aktiv = <T extends { aktiv: boolean }>(l: T[]) => l.filter((x) => x.aktiv).length;
  return (
    <>
      <Seitenkopf titel="Einsatzbuch" beschreibung="Hier pflegst du Fahrzeuge, Personal, Alarmstichworte und die Einstellungen für den Einsatzbuch-Rechner." />
      <KekHinweis status={status} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 16 }}>
        <Card><Statistic title="Fahrzeuge aktiv" value={aktiv(listeFahrzeuge(db))} /></Card>
        <Card><Statistic title="Personal aktiv" value={aktiv(listePersonal(db))} /></Card>
        <Card><Statistic title="Stichworte aktiv" value={aktiv(listeStichworte(db))} /></Card>
        <Card><Statistic title="Stammdatenstand" value={stammdatenVersion(db)} prefix="Version" /></Card>
      </div>
      {status.schluesselId && <p>Schlüssel-Kennung: <code>{status.schluesselId}</code></p>}
    </>
  );
}
```

- [ ] **Step 6: `.env.example`** — im Einsatzbuch-Abschnitt (nach `SUITE_ACCESS_GROUP_EINSATZBUCH`):

```
# einsatzbuch: Schlüssel-KEK. Verschlüsselt den privaten Schlüssel des Einsatzbuchs in der
# Modul-DB (AES-256-GCM). 32 Byte, base64. Hier steht bewusst KEIN Wert: ein Wert aus dieser
# Vorlage wäre im Repo nachlesbar. Erzeugen: openssl rand -base64 32
# Fehlt er, zeigt die Übersicht einen Hinweis und die Schlüsselfreigabe antwortet 503.
# Lokal legt `pnpm seed:lokal einsatzbuch` ein Entwicklungs-Paar mit dem Entwicklungs-KEK an und
# nennt den Wert in seiner Ausgabe. Runbook: docs/runbooks/einsatzbuch-schluessel.md
# EINSATZBUCH_SCHLUESSEL_KEK=<openssl rand -base64 32, nie aus dieser Vorlage>
```

- [ ] **Step 7: Runbook** `docs/runbooks/einsatzbuch-schluessel.md` — Titel `# Runbook — Einsatzbuch-Schlüssel`, „Ziel:“-Absatz, dann: `## Vorbedingungen` (Suite mit Stufe-2-Stand einmal gestartet; Checkout desselben Stands; Zugriff auf das Datenvolume; `openssl`); `## KEK erzeugen und setzen` (`openssl rand -base64 32`, in die Umgebung der Suite, getrennt vom Tresor ablegen); `## Schlüsselpaar erzeugen` (Aufruf aus einem Einmal-Container **als uid 1001** gegen das Volume, Muster aus `docs/runbooks/feedback-cutover.md:143`, mit `-it` für die verdeckte Eingabe; alternativ vom Host mit `DATA_DIR=<volume-pfad>`; erwartete Ausgabe; Übersicht zeigt keinen Hinweis mehr); `## Notfall-Sicherung ablegen` (JSON und Druckseite in den Tresor, Kennwort getrennt verwahren, Dateien vom Rechner löschen); `## Wiederherstellen` (QR scannen → Inhalt als Datei → `wiederherstellen`; Fall „DB verloren“ und Fall „KEK verloren“ — beide Male mit neuem KEK); `## Was bei Verlust verloren ist` (ohne privaten Schlüssel und ohne Sicherung: alle Einsätze außer bereits exportierten `.einsatzbuch`-Dateien, die ihre CEKs selbst tragen); `## Was in diesem Runbook NICHT vorkommt` (Schlüsselwechsel, Test-Paare — die legt Stufe 5 bei der Einrichtung eines Test-Rechners an).

- [ ] **Step 8: Tests grün**, dazu die Abnahme real messen (Zahlen notieren, sie gehen in den Abschlussbericht):

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-suite && export DATA_DIR=./.data/seed-probe && rm -rf $DATA_DIR \
 && pnpm seed:lokal einsatzbuch && sqlite3 $DATA_DIR/einsatzbuch.db "select (select count(*) from fahrzeug),(select count(*) from person),(select count(*) from stichwort),(select count(*) from schluesselpaar),(select count(*) from audit_outbox),(select version from stammdatenstand)" \
 && pnpm seed:lokal einsatzbuch && sqlite3 $DATA_DIR/einsatzbuch.db "select (select count(*) from fahrzeug),(select count(*) from person),(select count(*) from stichwort),(select count(*) from schluesselpaar),(select count(*) from audit_outbox),(select version from stammdatenstand)"; rm -rf ./.data/seed-probe
```

Erwartet: beide Zeilen identisch (`56|112|12|1|<n>|180`). Danach den Rauchlauf aus Task 8, Step 6 nachholen.

- [ ] **Step 9: Commit** — `feat(einsatzbuch): Seed aus der Vorlage, KEK-Hinweis auf der Übersicht und Schlüssel-Runbook`

---

### Task 10: Navigation, Seiten Stammdaten und Einstellungen, E2E

**Files:**
- Create: `M/_lib/nav.ts`, `M/_lib/nav.test.ts`, `M/(verwaltung)/stammdaten/page.tsx`, `M/(verwaltung)/einstellungen/page.tsx`, `M/_ui/stammdaten/Stammdaten.tsx`, `M/_ui/stammdaten/StammdatenTabelle.tsx`, `M/_ui/stammdaten/StammdatenFormular.tsx`, `M/_ui/stammdaten/CsvImport.tsx`, `M/_ui/EinstellungenFormular.tsx`, `e2e/einsatzbuch-stammdaten.spec.ts`
- Modify: `M/(verwaltung)/layout.tsx`, `src/core/shell/types.ts`, `src/core/shell/navIkonen.tsx`, `src/core/shell/navIkonen.test.tsx`, `e2e/gruppen.json`

**Interfaces:**
- Consumes: Actions aus Task 6 (direkt importiert, nie als Prop — Falle 9), DTOs, `KOPFZEILEN`, `dekodiere` (Task 4), `Einstellungen` (Task 5).
- Produces: `EINSATZBUCH_NAV: SuiteNavItem[]` (Stufe 3 hängt „Reader“ an); `NavIkonName` um `"stammdaten" | "einstellungen"` erweitert.

- [ ] **Step 1: Navigation** — `M/_lib/nav.ts` (kein `"use client"`):

```ts
import type { SuiteNavItem } from "@/core/shell/types";

/** Alle Einträge hängen an `(verwaltung)/layout.tsx` (Host + Gruppe): wer die Leiste sieht, darf jedes Ziel sehen. */
export const EINSATZBUCH_NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/", ikon: "uebersicht" },
  { key: "stammdaten", title: "Stammdaten", href: "/stammdaten", ikon: "stammdaten" },
  { key: "einstellungen", title: "Einstellungen", href: "/einstellungen", ikon: "einstellungen" },
];
```

In `src/core/shell/types.ts` die Union um `| "stammdaten" | "einstellungen"` erweitern, mit Kommentar im Stil der vorhandenen Blöcke (kein geliehener Name: `fahrzeuge` meint im lagerbuch einen Lagerort, `update` in radio etwas anderes). In `navIkonen.tsx`: `stammdaten: PiAddressBook`, `einstellungen: PiGearSix` (Importe ergänzen). In `navIkonen.test.tsx` `EINSATZBUCH_NAV` in `GESETZTE_NAVS` aufnehmen. `M/_lib/nav.test.ts` nach `uav/_lib/nav.test.ts`: genau drei Einträge; jedes `href` zeigt auf eine vorhandene Datei (`"/"` → `M/(verwaltung)/page.tsx`, `"/stammdaten"` → `M/(verwaltung)/stammdaten/page.tsx`, `"/einstellungen"` → `M/(verwaltung)/einstellungen/page.tsx`).

`M/(verwaltung)/layout.tsx`: `<Shell variant="full" moduleKey="einsatzbuch" nav={EINSATZBUCH_NAV}>`, Kommentar „Die Navigation kommt mit Stufe 2“ entfernen.

- [ ] **Step 2: Seite Stammdaten** — `M/(verwaltung)/stammdaten/page.tsx`:

```tsx
import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { requireEinsatzbuchHost } from "../../_lib/host";
import { requireEinsatzbuchZugang } from "../../_lib/zugang";
import { listeFahrzeuge, listePersonal, listeStichworte } from "../../_lib/stammdaten/daten";
import { STAMMDATENARTEN, type Stammdatenart } from "../../_lib/stammdaten/typen";
import { Stammdaten } from "../../_ui/stammdaten/Stammdaten";

export const dynamic = "force-dynamic";

export default async function StammdatenSeite({ searchParams }: { searchParams: Promise<{ reiter?: string }> }) {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  const { reiter } = await searchParams;
  const db = getDb();
  const start: Stammdatenart = STAMMDATENARTEN.includes(reiter as Stammdatenart) ? (reiter as Stammdatenart) : "fahrzeuge";
  return <Stammdaten reiter={start} fahrzeuge={listeFahrzeuge(db)} personal={listePersonal(db)} stichworte={listeStichworte(db)} />;
}
```

- [ ] **Step 3: Client-Insel** `M/_ui/stammdaten/Stammdaten.tsx` (`"use client"`):
  - `Seitenkopf` mit `titel="Stammdaten"`, `beschreibung="Fahrzeuge, Personal und Alarmstichworte, aus denen der Einsatzbuch-Rechner auswählt. Deaktivierte Einträge verschwinden dort aus der Auswahl; versiegelte Einsätze behalten ihren Stand."`, `aktionen` = Knopf `"<Art> anlegen"` (Primär; „Fahrzeug anlegen“ / „Person anlegen“ / „Stichwort anlegen“) und Knopf „CSV importieren“.
  - antd `Tabs` mit `activeKey={reiter}`, `items` = `[{ key: "fahrzeuge", label: \`Fahrzeuge · ${n}\` }, { key: "personal", label: \`Personal · ${n}\` }, { key: "stichworte", label: \`Stichworte · ${n}\` }]`, `onChange` setzt den Zustand und `router.replace(\`${pathname}?reiter=${key}\`, { scroll: false })` (`useRouter`, `usePathname` aus `next/navigation`).
  - Darunter `StammdatenTabelle` für den aktiven Reiter, `Drawer` (`size={flyinBreite(480)}`, `destroyOnHidden`, Titel „Fahrzeug anlegen“ / „Fahrzeug bearbeiten“ usw.) mit `StammdatenFormular`, und `CsvImport` im zweiten `Drawer` (`flyinBreite(720)`).
  - Nach erfolgreichem Speichern schließt der Drawer; die Listen kommen über die Props neu (die Actions rufen `revalidatePath`). Ein lokales Kopieren der Listen in State entfällt.
  - Äußerer Container `display: grid; gridTemplateColumns: "minmax(0, 1fr)"` (Begründung in `uav/_ui/admin/KatalogTabelle.tsx`).

`StammdatenTabelle.tsx` (`"use client"`): `Kartentabelle` mit `rowKey="id"`, `aria-label` („Fahrzeuge“ / „Personal“ / „Stichworte“), Filterzustand als State (Falle 15), `leer={{ nichts: "Noch keine Fahrzeuge angelegt.", gefiltert: "Kein Fahrzeug passt zum Filter.", aktiv: liste.length > 0 && filterAktiv(filter) }}` (entsprechend je Art). Spalten (Titel als Zeichenkette):
  - Fahrzeuge: „Kennung“ (`nachText`), „Typ“ (`werteAlsFilter` + `trifftWert`), „Funkrufname“, „Standort“ (Filter), „Status“ (`zustandsFilter` aktiv/inaktiv, `Tag` „aktiv“/„inaktiv“), „Aktionen“ (Knöpfe „Bearbeiten“ und „Deaktivieren“/„Aktivieren“; Letzterer ruft `aktivSetzenAction` und zeigt einen Fehler per `message.warning`).
  - Personal: „Name“, „Qualifikation“ (Filter), „Ortsverein“ (Filter), „Status“, „Aktionen“.
  - Stichworte: „Gruppe“ (Filter), „Stichwort“, „Reihenfolge“ (`nachZahl`), „Status“, „Aktionen“.

`StammdatenFormular.tsx` (`"use client"`, eigenes `<form onSubmit>` mit `useState`, kein antd-`Form`, Vorbild `uav/_ui/admin/AufgabeFormular.tsx`): Felder je Art mit sichtbarem `<label>`; Personal: „Name (Nachname, Vorname)“, „Qualifikation“ als `AutoComplete` mit `QUALIS`-Optionen aus `vorlage.ts` (nur Konstanten — `vorlage.ts` hat keine Direktive), „Ortsverein“ als `AutoComplete` mit den Orten; Fahrzeug: „Typ“, „Kennung“, „Funkrufname“, „Standort“; Stichwort: „Gruppe“, „Stichwort“, „Reihenfolge“ (`InputNumber` min 0, max 9999); immer `Switch` „Aktiv“. Speichern ruft die passende Action; `feldFehler` erscheinen unter dem Feld (`status="error"` am Eingabefeld, Text darunter), `fehler` als `<Alert type="warning" showIcon={false} title={fehler} />`. Knopf „Speichern“ (Primär) und „Abbrechen“.

`CsvImport.tsx` (`"use client"`):
  - Text: `Die Datei braucht die Kopfzeile „${KOPFZEILEN[art].join(";")}“. Trennzeichen Semikolon oder Komma, Excel-CSV geht direkt.`
  - `<input type="file" accept=".csv,text/csv" aria-label="CSV-Datei">` (sichtbar über ein Label „CSV-Datei wählen“). Beim Wählen: `dekodiere(new Uint8Array(await datei.arrayBuffer()))`, dann `csvVorschauAction(art, text)`; Ergebnis im State.
  - Vorschau: Zusammenfassung „n neu · n geändert · n unverändert · n mit Fehler“, darunter `Kartentabelle<Vorschauzeile>` (`rowKey="zeile"`, `aria-label="Vorschau des Imports"`) mit Spalten „Zeile“, die Werte der Kopfzeile, „Ergebnis“ (`Tag`: „Neu“ / „Geändert“ / „Unverändert“ / „Fehler“ — Fehler-Tag ohne Rot auf der Fläche, Falle 3: Farbe `warning`) und „Hinweis“ (Fehlertext).
  - Knopf „Übernehmen“ (Primär), deaktiviert, wenn weder neu noch geändert; ruft `csvUebernehmenAction(art, text)`; danach Meldung `n angelegt, n geändert.` (`message.success`) und Drawer zu.
  - Ganzdatei-Fehler (`ok: false`) als `Alert type="warning"`.

- [ ] **Step 4: Seite Einstellungen** — `M/(verwaltung)/einstellungen/page.tsx` (Riegel wie oben, `force-dynamic`, `Seitenkopf titel="Einstellungen" beschreibung="Diese Werte bekommt der Einsatzbuch-Rechner zusammen mit den Stammdaten."`, dann `<EinstellungenFormular start={leseEinstellungen(getDb())} />`).
  `EinstellungenFormular.tsx` (`"use client"`): Felder „Änderungsfrist nach dem Absenden“ (`InputNumber` 1–120, Einheit „Minuten“ als Text daneben), „Personal Fahrzeugen zuordnen“ (`Switch`), „Name der Bereitschaft“ (`Input`); Knopf „Speichern“ ruft `einstellungenSpeichernAction`; Erfolg „Gespeichert.“ (`message.success`), Feldfehler am Feld.

- [ ] **Step 5: E2E** — `e2e/einsatzbuch-stammdaten.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig } from "./fixtures";

const HOST = "einsatzbuch.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

test.beforeEach(async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "einsatzbuch-verwaltung", callbackPath: "/" });
});

test("Übersicht, Stammdaten und Einstellungen antworten mit 200; ohne KEK steht der Hinweis da", async ({ page }) => {
  for (const pfad of ["/", "/stammdaten", "/stammdaten?reiter=personal", "/einstellungen"]) {
    expect((await page.goto(url(pfad)))?.status(), pfad).toBe(200);
  }
  await page.goto(url("/"));
  await expect(page.getByTestId("kek-hinweis")).toBeVisible();
});

test("Stammdaten-Durchlauf: Fahrzeug anlegen, bearbeiten, deaktivieren; Personal per CSV", async ({ page }) => {
  const kennung = `99-83-${Date.now() % 100000}`;
  await page.goto(url("/stammdaten"));
  await klickeWennRuhig(page.getByRole("button", { name: "Fahrzeug anlegen" }));
  await page.getByLabel("Typ").fill("RTW");
  await page.getByLabel("Kennung").fill(kennung);
  await page.getByLabel("Funkrufname").fill(`Rotkreuz Probe ${kennung}`);
  await page.getByLabel("Standort").fill("Probe");
  await page.getByRole("button", { name: "Speichern" }).click();
  const zeile = page.locator("[data-row-key]", { hasText: kennung });
  await expect(zeile).toBeVisible();

  await zeile.getByRole("button", { name: "Bearbeiten" }).click();
  await page.getByLabel("Funkrufname").fill(`Rotkreuz Probe ${kennung} neu`);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(zeile).toContainText("neu");
  await zeile.getByRole("button", { name: "Deaktivieren" }).click();
  await expect(zeile).toContainText("inaktiv");

  await page.getByRole("tab", { name: /Personal/ }).click();
  await expect(page).toHaveURL(/reiter=personal/);
  await klickeWennRuhig(page.getByRole("button", { name: "CSV importieren" }));
  const name = `Probe${Date.now() % 100000}, Jürgen`;
  await page.getByLabel("CSV-Datei").setInputFiles({
    name: "personal.csv", mimeType: "text/csv",
    buffer: Buffer.from(`name;quali;ov\n${name};SanH;Uelzen\nOhne Komma;SanH;Uelzen\n`, "utf8"),
  });
  await expect(page.getByText("1 neu")).toBeVisible();
  await expect(page.getByText("Name bitte als „Nachname, Vorname“")).toBeVisible();
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.locator("[data-row-key]", { hasText: name })).toBeVisible();
});

test("Einstellungen: speichern, neu laden, ungültige Frist wird abgelehnt", async ({ page }) => {
  await page.goto(url("/einstellungen"));
  const frist = page.getByLabel("Änderungsfrist nach dem Absenden");
  await frist.fill("30");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  await page.reload();
  await expect(frist).toHaveValue("30");
  await frist.fill("121");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Höchstens 120 Minuten")).toBeVisible();
  await frist.fill("15");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
});
```

(`InputNumber` begrenzt eventuell selbst auf 120; dann stellt der Test das Clamping fest oder prüft den Feldfehler über `max` — maßgeblich ist, dass 121 nicht gespeichert wird. Gleiche Anpassung an die tatsächliche Oberfläche ohne Aufweichen der Aussage.)

In `e2e/gruppen.json` die neue Spec in die Gruppe `suite-verwaltung` aufnehmen (neben `e2e/einsatzbuch.spec.ts`).

- [ ] **Step 6: Tore** — `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/einsatzbuch.spec.ts e2e/einsatzbuch-stammdaten.spec.ts` (kein offener `pnpm dev`; Exit-Codes selbst prüfen).
- [ ] **Step 7: Commit** — `feat(einsatzbuch): Seiten für Stammdaten und Einstellungen mit Navigation`

---

## Abschluss der Stufe

- Review über den gesamten Diff der Stufe (`git diff 49b581bc..HEAD`).
- Abnahmezahlen festhalten: Seed zweimal (Task 9, Step 8), Tore mit Exit-Codes, E2E-Ergebnis.
- Kein Merge, kein Auto-Merge.
