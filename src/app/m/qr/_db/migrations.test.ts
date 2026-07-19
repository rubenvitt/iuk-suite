import { it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";
import { getDb } from "@/app/m/qr/_db/client";
import { presets } from "@/app/m/qr/_db/schema";

const TEST_DATA_DIR = "./.data/qr-migrations-test";
const DB_PATH = `${TEST_DATA_DIR}/qr.db`;

// Die Migration ist reines SQL, das kein Produktionscode-Pfad liest. Nur ein
// echter Migrationslauf gegen SQLite belegt, dass CHECK-Constraint, Index und
// NOT-NULL-Zusagen tatsaechlich in der Datei landen — ohne diesen Test bleibt
// jede Aenderung an der .sql folgenlos gruen.
//
// Aufraeumen und Migrieren gehoert in beforeAll, nicht beforeEach: getDb()
// cacht die Verbindung global, ein Loeschen zwischen den Tests wuerde sie auf
// eine geloeschte Datei zeigen lassen. Deshalb je Test eigene IDs.
beforeAll(() => {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  process.env.DATA_DIR = TEST_DATA_DIR;
  migrateAllModules();
});

afterAll(() => {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

const openRaw = () => new Database(DB_PATH);

type RawPreset = {
  id: string;
  label?: string;
  icon?: string | null;
  kind?: string;
  value?: string | null;
};

// Fuehrt die Spalten explizit auf: faellt eine davon aus der Migration, wirft
// bereits das prepare().
function insertRaw(db: Database.Database, preset: RawPreset): void {
  db.prepare(
    `INSERT INTO presets
       (id, label, icon, kind, value, sort_order, created_at, updated_at, created_by, updated_by)
     VALUES
       (@id, @label, @icon, @kind, @value, 0, 1750000000123, 1750000000123, 'system', 'system')`,
  ).run({
    label: "Beschriftung",
    icon: null,
    kind: "url",
    value: '"https://example.org"',
    ...preset,
  });
}

function captureError(fn: () => void): { code?: string } {
  try {
    fn();
  } catch (error) {
    return error as { code?: string };
  }
  throw new Error("Erwarteter SQLite-Fehler blieb aus");
}

it("legt die Tabelle presets mit allen Spalten und NOT-NULL-Zusagen an", () => {
  const db = openRaw();
  const columns = db.pragma("table_info(presets)") as {
    name: string;
    notnull: number;
    pk: number;
  }[];
  db.close();

  const byName = new Map(columns.map((c) => [c.name, c]));
  // icon ist als einzige Spalte nullable — Presets ohne Symbol sind erlaubt.
  const expected: Record<string, number> = {
    id: 1,
    label: 1,
    icon: 0,
    kind: 1,
    value: 1,
    sort_order: 1,
    created_at: 1,
    updated_at: 1,
    created_by: 1,
    updated_by: 1,
  };
  for (const [name, notnull] of Object.entries(expected)) {
    expect(byName.get(name), `Spalte ${name} fehlt`).toBeDefined();
    expect(byName.get(name)?.notnull, `Spalte ${name}: NOT NULL`).toBe(notnull);
  }
  expect(byName.get("id")?.pk).toBe(1);
});

it("legt den Index idx_presets_sort auf (sort_order, label) an", () => {
  const db = openRaw();
  const indexed = db.pragma("index_info(idx_presets_sort)") as { name: string }[];
  db.close();

  // Reihenfolge zaehlt: die Preset-Liste sortiert nach sort_order, dann label.
  expect(indexed.map((c) => c.name)).toEqual(["sort_order", "label"]);
});

it("weist ein unbekanntes kind per CHECK-Constraint ab", () => {
  const db = openRaw();
  // Ein durchgerutschtes kind braeche spaeter das Payload-Encoding, das per
  // switch ueber genau die fuenf bekannten Varianten geht.
  const error = captureError(() => insertRaw(db, { id: "check-youtube", kind: "youtube" }));
  db.close();

  expect(error.code).toBe("SQLITE_CONSTRAINT_CHECK");
});

it("akzeptiert alle fuenf gueltigen kinds", () => {
  const kinds = ["url", "wifi", "tel", "vcard", "text"];
  const db = openRaw();
  for (const kind of kinds) insertRaw(db, { id: `kind-${kind}`, kind });
  const count = db
    .prepare("SELECT count(*) AS c FROM presets WHERE id LIKE 'kind-%'")
    .get() as { c: number };
  db.close();

  expect(count.c).toBe(kinds.length);
});

it("weist ein Preset ohne value ab", () => {
  const db = openRaw();
  const error = captureError(() => insertRaw(db, { id: "ohne-value", value: null }));
  db.close();

  expect(error.code).toBe("SQLITE_CONSTRAINT_NOTNULL");
});

it("speichert Zeitstempel als epoch-Millisekunden", async () => {
  // Bewusst keine glatte Sekunde: bei einem runden Wert liefe der Round-Trip
  // auch im Modus `timestamp` (Sekunden) durch, weil das Abschneiden nichts
  // verlaenge. Die Nachkommastellen entlarven den falschen Modus.
  const MS = 1750000000123;
  const db = getDb();
  await db.insert(presets).values({
    id: "zeitstempel",
    label: "Zeitstempel",
    kind: "text",
    value: '"x"',
    createdAt: new Date(MS),
    updatedAt: new Date(MS),
    createdBy: "system",
    updatedBy: "system",
  });

  const [row] = await db.select().from(presets).where(eq(presets.id, "zeitstempel"));
  expect(row.createdAt.getTime()).toBe(MS);

  // Entscheidend ist der Rohwert: im Modus `timestamp` stuende hier
  // 1750000000, und Drizzle rechnete das beim Lesen wieder auf Millisekunden
  // hoch — die importierten easy-qr-Altdaten verschoeben sich um Faktor 1000.
  const raw = openRaw();
  const stored = raw.prepare("SELECT created_at, updated_at FROM presets WHERE id = ?").get(
    "zeitstempel",
  ) as { created_at: number; updated_at: number };
  raw.close();

  expect(stored.created_at).toBe(MS);
  expect(stored.updated_at).toBe(MS);
});
