import { eq, asc, sql } from "drizzle-orm";
import { getDb } from "@/app/m/qr/_db/client";
import { presets, type PresetRow } from "@/app/m/qr/_db/schema";
import { slugify, uniqueSlug } from "./slug";
import type { Preset } from "./types";

type PresetInput = Omit<Preset, "id"> & { id?: string };

// Laengstes Suffix, das uniqueSlug anhaengen kann (Abbruch bei 1000).
const MAX_SUFFIX = "-1000".length;
// Obergrenze von ID_RE im Validator.
const MAX_ID_LENGTH = 60;

/** slugify deckelt auf 60 Zeichen, uniqueSlug haengt sein `-<n>` danach ohne
 *  Laengenpruefung an — eine kollidierende Maximal-Basis ergaebe also eine ID,
 *  die validatePresetInput ablehnt: anlegbar, aber nie wieder bearbeitbar.
 *  Deshalb wird nur im Kollisionsfall gekuerzt, und zwar die Basis vor der
 *  Eindeutigkeitssuche — ein nachtraegliches Abschneiden der fertigen ID
 *  koennte erneut mit einer bestehenden kollidieren. */
function idFromLabel(taken: (id: string) => boolean, label: string): string {
  const base = slugify(label);
  if (!taken(base)) return base;
  const trimmed = base.slice(0, MAX_ID_LENGTH - MAX_SUFFIX).replace(/-+$/, "");
  return uniqueSlug(taken, trimmed);
}

/** DB-Zeile -> Domänentyp. `value` ist in der Spalte JSON-kodiert, auch bei
 *  kind='url' — dieses Encoding stammt aus easy-qr und bleibt erhalten. */
function toPreset(row: PresetRow): Preset {
  return {
    id: row.id,
    label: row.label,
    icon: row.icon ?? undefined,
    kind: row.kind,
    value: JSON.parse(row.value),
  } as Preset;
}

export async function listPresets(): Promise<Preset[]> {
  const rows = getDb()
    .select()
    .from(presets)
    .orderBy(asc(presets.sortOrder), asc(presets.label))
    .all();
  return rows.map(toPreset);
}

export async function createPreset(input: PresetInput, userId: string): Promise<Preset> {
  const db = getDb();
  const taken = (id: string) =>
    db.select({ one: sql`1` }).from(presets).where(eq(presets.id, id)).get() !== undefined;
  const id = input.id ?? idFromLabel(taken, input.label);

  const max = db.select({ m: sql<number>`coalesce(max(sort_order), -1)` }).from(presets).get();
  const now = new Date();

  db.insert(presets)
    .values({
      id,
      label: input.label,
      icon: input.icon ?? null,
      kind: input.kind,
      value: JSON.stringify(input.value),
      sortOrder: (max?.m ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    })
    .run();

  return { ...input, id } as Preset;
}

export async function updatePreset(
  id: string,
  input: Omit<Preset, "id">,
  userId: string,
): Promise<Preset | null> {
  const db = getDb();
  const existing = db.select().from(presets).where(eq(presets.id, id)).get();
  if (!existing) return null;

  db.update(presets)
    .set({
      label: input.label,
      icon: input.icon ?? null,
      kind: input.kind,
      value: JSON.stringify(input.value),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(presets.id, id))
    .run();

  return { ...input, id } as Preset;
}

export async function deletePreset(id: string): Promise<boolean> {
  const res = getDb().delete(presets).where(eq(presets.id, id)).run();
  return res.changes > 0;
}

/** Die Position im Array wird zum sort_order-Index — wie in easy-qr, und in
 *  einer Transaktion, damit keine Zwischenzustände sichtbar werden. */
export async function reorderPresets(ids: string[]): Promise<void> {
  const db = getDb();
  db.transaction((tx) => {
    ids.forEach((id, index) => {
      tx.update(presets).set({ sortOrder: index }).where(eq(presets.id, id)).run();
    });
  });
}
