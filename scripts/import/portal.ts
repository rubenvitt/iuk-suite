import { readFileSync } from "node:fs";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getModuleDb } from "@/core/db";
import { migrateAllModules } from "@/core/bootstrap";
import * as schema from "@/app/m/portal/_db/schema";
import { checkParity, assertParity, type ParityReport } from "./parity";

export interface PgServiceRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  url: string;
  icon_url: string | null;
  category: string | null;
  tags: string[] | null;
  required_groups: string[] | null;
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
  open_in_new_tab: boolean;
  created_at: string; // ISO from row_to_json
  updated_at: string;
}

type PortalDb = BetterSQLite3Database<typeof schema>;

export function parseNdjson(text: string): PgServiceRow[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as PgServiceRow);
}

// Postgres → SQLite (Drizzle-Typen). ID wird 1:1 erhalten (uuid als text).
export function toNewService(row: PgServiceRow): schema.NewService {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    url: row.url,
    iconUrl: row.icon_url ?? null,
    category: row.category ?? null,
    tags: row.tags ?? [],
    requiredGroups: row.required_groups ?? [],
    isPublic: !!row.is_public,
    isActive: !!row.is_active,
    sortOrder: row.sort_order ?? 0,
    openInNewTab: !!row.open_in_new_tab,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Idempotent: Upsert per Primärschlüssel (id 1:1).
export function importPortalServices(rows: PgServiceRow[], db: PortalDb): { imported: number } {
  for (const row of rows) {
    const v = toNewService(row);
    db.insert(schema.services).values(v).onConflictDoUpdate({ target: schema.services.id, set: v }).run();
  }
  return { imported: rows.length };
}

// drizzle integer(mode:"timestamp") stores Unix SECONDS, so sub-second precision
// is lost on write. Normalize source (ms from NDJSON) and target (already truncated)
// both to seconds — otherwise faithful imports fail parity purely on precision.
function tsSeconds(d: Date | null | undefined): number | null {
  return d ? Math.floor(d.getTime() / 1000) : null;
}

// Full-row view: EVERY migrated field enters parity, so "parity green" certifies the
// whole row, not a hand-picked subset. Optional insert-defaults are normalized
// (runtime-inert: toNewService and the stored Service always carry concrete values).
export function parityView(r: schema.NewService | schema.Service) {
  return {
    id: r.id ?? "",
    slug: r.slug,
    name: r.name,
    description: r.description ?? "",
    url: r.url,
    iconUrl: r.iconUrl ?? null,
    category: r.category ?? null,
    tags: r.tags ?? [],
    requiredGroups: r.requiredGroups ?? [],
    isPublic: r.isPublic ?? true,
    isActive: r.isActive ?? true,
    sortOrder: r.sortOrder ?? 0,
    openInNewTab: r.openInNewTab ?? true,
    createdAt: tsSeconds(r.createdAt),
    updatedAt: tsSeconds(r.updatedAt),
  };
}

export function runPortalImport(sourcePath: string): ParityReport {
  migrateAllModules();
  const rows = parseNdjson(readFileSync(sourcePath, "utf8"));
  const db = getModuleDb("portal", schema);
  // NB: parity runs AFTER this (idempotent) write. A thrown parity error means the
  // target was already mutated with the imported rows — not "nothing happened".
  importPortalServices(rows, db);
  const stored = db.select().from(schema.services).all();
  const report = checkParity(
    rows.map((r) => parityView(toNewService(r))),
    stored.map(parityView),
  );
  assertParity(report);
  return report;
}

// CLI: tsx scripts/import/portal.ts <services.ndjson>   (DATA_DIR steuert das Ziel)
if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: tsx scripts/import/portal.ts <services.ndjson>");
    process.exit(1);
  }
  const report = runPortalImport(src);
  console.log(`Portal import OK — ${report.sourceCount} services, parity green.`);
}
