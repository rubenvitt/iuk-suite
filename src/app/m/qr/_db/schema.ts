import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, check } from "drizzle-orm/sqlite-core";

export const presets = sqliteTable(
  "presets",
  {
    // Slug, extern erzeugt — kein Autoincrement. Die ID ist zugleich
    // URL-Segment und muss beim Import 1:1 erhalten bleiben.
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    icon: text("icon"),
    kind: text("kind").notNull(),
    // JSON-serialisiert, auch für kind='url' (dort steht dann "\"https://…\"").
    // Das Doppel-Encoding stammt aus easy-qr und muss beim Import erhalten
    // bleiben, sonst entsteht ein Mix aus roh und JSON.
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    // epoch MILLISEKUNDEN (Date.now()), nicht Sekunden.
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    // Reine Audit-Felder ohne FK: der Seed-Datensatz trägt 'system', wofür es
    // keine User-Zeile gibt — ein FK würde daran scheitern.
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (t) => [
    index("idx_presets_sort").on(t.sortOrder, t.label),
    check("presets_kind_check", sql`${t.kind} IN ('url','wifi','tel','vcard','text')`),
  ],
);

export type PresetRow = typeof presets.$inferSelect;
export type NewPresetRow = typeof presets.$inferInsert;
