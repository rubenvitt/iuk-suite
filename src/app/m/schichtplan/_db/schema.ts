/**
 * Die Datenbank des Moduls `schichtplan` (IDA-313): Planungen im Voraus für Veranstaltungen und große
 * Lagen. Zeiten als Millisekunden seit 1970 (`integer`, kein `timestamp`-Modus): das Raster rechnet in
 * Millisekunden, und eine Schicht bewegt sich in Minutenschritten — ein `Date` je Wert wäre nur Umweg.
 *
 * Helfer aus dem Modul `helfer` stehen hier NUR mit ihrer Kennung (`zuordnung.helfer_id`, Quelle
 * `stamm`), nie mit Namen: Name und Qualifikation liest die Seite frisch aus `helfer/_lib/bereitstellung`.
 * Temporäre Helfer (ohne Stammdatensatz) gehören zur Planung und stehen in `temp_helfer`.
 */
export { auditOutbox } from "@/core/audit/_db/schema";
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const planung = sqliteTable("planung", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  art: text("art", { enum: ["veranstaltung", "lage"] }).notNull(),
  ort: text("ort").notNull().default(""),
  von: integer("von").notNull(),
  bis: integer("bis").notNull(),
  /** Höchstens so viele Minuten im Dienst ohne Ruhe (Konfliktregel). */
  maxDienstMin: integer("max_dienst_min").notNull().default(720),
  /** Mindestens so viele Minuten Ruhe, damit zwei Schichten als getrennte Dienste zählen. */
  minRuheMin: integer("min_ruhe_min").notNull().default(480),
  angelegtAm: integer("angelegt_am").notNull(),
  aktualisiertAm: integer("aktualisiert_am").notNull(),
}, () => [
  check("planung_art", sql`art IN ('veranstaltung','lage')`),
  check("planung_zeitraum", sql`bis > von`),
]);

export const einheit = sqliteTable("einheit", {
  id: text("id").primaryKey(),
  planungId: text("planung_id").notNull().references(() => planung.id, { onDelete: "cascade" }),
  art: text("art", { enum: ["abschnitt", "fahrzeug"] }).notNull(),
  name: text("name").notNull(),
  /** Kennung aus `fahrzeuge` (nur bei Fahrzeugen); der Name ist zum Zeitpunkt der Planung festgehalten. */
  fahrzeugId: text("fahrzeug_id"),
  kenner: text("kenner"),
  schichtMin: integer("schicht_min").notNull(),
  soll: integer("soll").notNull(),
  /** JSON `[{ quali, anzahl }]` — Mindestqualifikationen je Schicht. */
  anforderungen: text("anforderungen").notNull().default("[]"),
  position: integer("position").notNull(),
}, (t) => [
  index("einheit_planung_idx").on(t.planungId, t.position),
  check("einheit_art", sql`art IN ('abschnitt','fahrzeug')`),
  check("einheit_anforderungen_json", sql`json_valid(anforderungen)`),
]);

export const schicht = sqliteTable("schicht", {
  id: text("id").primaryKey(),
  einheitId: text("einheit_id").notNull().references(() => einheit.id, { onDelete: "cascade" }),
  von: integer("von").notNull(),
  bis: integer("bis").notNull(),
}, (t) => [
  index("schicht_einheit_idx").on(t.einheitId, t.von),
  check("schicht_dauer", sql`bis > von`),
]);

export const tempHelfer = sqliteTable("temp_helfer", {
  id: text("id").primaryKey(),
  planungId: text("planung_id").notNull().references(() => planung.id, { onDelete: "cascade" }),
  vorname: text("vorname").notNull(),
  nachname: text("nachname").notNull(),
  telefon: text("telefon").notNull().default(""),
  organisation: text("organisation").notNull().default(""),
  /** JSON `[{ kurz, name }]` — dieselbe Form wie die Qualifikationen aus dem Helfer-Modul. */
  qualifikationen: text("qualifikationen").notNull().default("[]"),
}, (t) => [
  index("temp_helfer_planung_idx").on(t.planungId),
  check("temp_helfer_qualifikationen_json", sql`json_valid(qualifikationen)`),
]);

export const zuordnung = sqliteTable("zuordnung", {
  schichtId: text("schicht_id").notNull().references(() => schicht.id, { onDelete: "cascade" }),
  quelle: text("quelle", { enum: ["stamm", "temp"] }).notNull(),
  helferId: text("helfer_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.schichtId, t.quelle, t.helferId] }),
  index("zuordnung_helfer_idx").on(t.quelle, t.helferId),
  check("zuordnung_quelle", sql`quelle IN ('stamm','temp')`),
]);
