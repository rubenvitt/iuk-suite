import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getModuleDb } from "@/core/db";
import { migrateAllModules } from "@/core/bootstrap";
import * as schema from "@/app/m/qr/_db/schema";
import { checkParity, assertParity, type ParityReport, type Row } from "./parity";

/**
 * Import easy-qr → Modul `qr`.
 *
 * Einfacher als der Portal-Import: dort war Postgres → SQLite zu übersetzen,
 * hier sind Quell- und Zielschema spaltengleich (easy-qr `migrations/0001_init.sql`
 * gegen `src/app/m/qr/_db/schema.ts`). Übernommen wird ausschließlich `presets` —
 * `users` und `sessions` wandern nicht mit, weil die Suite ihr eigenes SSO hat.
 *
 * Drei Eigenheiten der Altdaten, die erhalten bleiben müssen:
 * - `value` ist **doppelt JSON-kodiert**, auch bei `kind='url'` (dort steht
 *   `"\"https://…\""` mit Anführungszeichen). Der Wert wird als String
 *   durchgereicht, nicht geparst und neu serialisiert.
 * - Zeitstempel sind epoch-**Millisekunden** (`Date.now()`), nicht Sekunden.
 * - IDs sind Slugs und zugleich URL-Segment — 1:1 zu erhalten.
 */

export interface SourcePresetRow {
  id: string;
  label: string;
  icon: string | null;
  kind: string;
  value: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
  created_by: string;
  updated_by: string;
}

type QrDb = BetterSQLite3Database<typeof schema>;

export function readSourcePresets(sqlitePath: string): SourcePresetRow[] {
  const src = new Database(sqlitePath, { readonly: true });
  try {
    const table = src
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='presets'")
      .get();
    if (!table) {
      // Häufigster Bedienfehler: die falsche .db erwischt. Lieber hier abbrechen
      // als eine leere Quelle als „nichts zu importieren" durchgehen zu lassen.
      throw new Error(`Quelldatei ${sqlitePath} enthält keine Tabelle 'presets'.`);
    }
    return src.prepare("SELECT * FROM presets").all() as SourcePresetRow[];
  } finally {
    src.close();
  }
}

export function toNewPreset(row: SourcePresetRow): schema.NewPresetRow {
  return {
    id: row.id,
    label: row.label,
    icon: row.icon,
    kind: row.kind,
    value: row.value,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

/** Idempotenter Upsert auf die ID — ein zweiter Lauf darf nichts verändern. */
export function importQrPresets(rows: SourcePresetRow[], db: QrDb): { imported: number } {
  for (const row of rows) {
    const values = toNewPreset(row);
    db.insert(schema.presets)
      .values(values)
      .onConflictDoUpdate({ target: schema.presets.id, set: values })
      .run();
  }
  return { imported: rows.length };
}

/**
 * Projiziert Quell- und Zielzeile auf dieselbe Form. `Date` wird zu einer Zahl
 * normalisiert, weil die Quelle rohe Millisekunden liefert und Drizzle beim
 * Zurücklesen `Date`-Objekte — sonst verglichen sich zwei Darstellungen
 * desselben Zeitpunkts als ungleich.
 */
export function parityView(r: schema.NewPresetRow | schema.PresetRow): Row {
  const ms = (v: Date | number) => (v instanceof Date ? v.getTime() : v);
  return {
    id: r.id,
    label: r.label,
    icon: r.icon ?? null,
    kind: r.kind,
    value: r.value,
    sortOrder: r.sortOrder ?? 0,
    createdAt: ms(r.createdAt),
    updatedAt: ms(r.updatedAt),
    createdBy: r.createdBy,
    updatedBy: r.updatedBy,
  };
}

export function runQrImport(sourcePath: string): ParityReport {
  migrateAllModules();
  const rows = readSourcePresets(sourcePath);
  const db = getModuleDb("qr", schema);
  // Achtung: die Paritätsprüfung läuft NACH diesem (idempotenten) Schreiben.
  // Ein Paritätsfehler heißt also „das Ziel wurde bereits verändert", nicht
  // „es ist nichts passiert".
  importQrPresets(rows, db);
  const stored = db.select().from(schema.presets).all();
  const report = checkParity(rows.map((r) => parityView(toNewPreset(r))), stored.map(parityView));
  assertParity(report);
  return report;
}

// CLI: tsx scripts/import/qr.ts <easy-qr.db>   (DATA_DIR steuert das Ziel)
if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: tsx scripts/import/qr.ts <easy-qr.db>");
    process.exit(1);
  }
  const report = runQrImport(src);
  console.log(`QR-Import OK — ${report.sourceCount} Presets, parity green.`);
}
