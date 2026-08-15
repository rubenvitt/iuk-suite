import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * DIE WIDERRUFS-EPOCHE — eine Zeile je Person, und sie entsteht erst beim
 * ersten Widerruf. Keine Zeile heisst „nichts widerrufen", nicht „unbekannt".
 *
 * Die Tabelle liegt in `core` und nicht im Portal, weil die Frage suiteweit
 * ist: `core/auth` muss sie beantworten koennen, ohne in die Interna eines
 * Moduls zu greifen (dieselbe Begruendung wie bei `core/directory`).
 */
export const sitzungWiderruf = sqliteTable("sitzung_widerruf", {
  // Der OIDC-`sub` aus dem ID-Token; beim Dev-Login `dev:<email>`.
  sub: text("sub").primaryKey(),
  // Unix-SEKUNDEN, nicht Millisekunden: verglichen wird gegen
  // `token.angemeldetSeit`, und JWT-Zeitangaben sind Sekunden. Eine
  // Millisekunden-Zahl hier wuerde jede Sitzung widerrufen, ohne dass ein Typ
  // etwas merkt.
  widerrufenAb: integer("widerrufen_ab").notNull(),
  // Epoch MILLISEKUNDEN, wie `created_at`/`updated_at` in den Modulen. Rein
  // fuer die Nachschau — nie fuer den Vergleich.
  aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp_ms" }).notNull(),
});

export type SitzungWiderrufRow = typeof sitzungWiderruf.$inferSelect;
