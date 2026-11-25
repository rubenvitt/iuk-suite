/**
 * Die Datenbank des Moduls `veranstaltungen` (IDA-415): geplante Dienste wie Sanitätsdienste,
 * Betreuungen oder Übungen, mit Ort, Zeitraum und Veranstalter. Eine Veranstaltung steht auch ohne
 * Personalplanung; die Schichtplanung verweist auf sie (`schichtplan.planung.veranstaltung_id`) und
 * liest sie über `_lib/bereitstellung.ts`, nie über diese Datenbank.
 *
 * Zeiten als Millisekunden seit 1970 (`integer`), wie in der Schichtplanung: so übernimmt eine Planung
 * Beginn und Ende ohne Umrechnung.
 */
export { auditOutbox } from "@/core/audit/_db/schema";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const veranstaltung = sqliteTable("veranstaltung", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  art: text("art", { enum: ["sanitaetsdienst", "betreuung", "uebung", "sonstiges"] }).notNull(),
  status: text("status", { enum: ["angefragt", "zugesagt", "abgesagt"] }).notNull(),
  ort: text("ort").notNull().default(""),
  veranstalter: text("veranstalter").notNull().default(""),
  von: integer("von").notNull(),
  bis: integer("bis").notNull(),
  bemerkung: text("bemerkung").notNull().default(""),
  angelegtAm: integer("angelegt_am").notNull(),
  aktualisiertAm: integer("aktualisiert_am").notNull(),
}, (t) => [
  index("veranstaltung_von_idx").on(t.von),
  check("veranstaltung_art", sql`art IN ('sanitaetsdienst','betreuung','uebung','sonstiges')`),
  check("veranstaltung_status", sql`status IN ('angefragt','zugesagt','abgesagt')`),
  check("veranstaltung_zeitraum", sql`bis > von`),
]);

/**
 * Abruf-Zugänge (LLH-2097): Mit einem solchen Schlüssel holt Lifeline Hub die Veranstaltungen über
 * `api/abruf` ab (Vertrag „Veranstaltungen-Abruf v1“). Gespeichert ist nur der SHA-256 des Schlüssels.
 */
export const abrufZugang = sqliteTable("veranstaltung_zugang", {
  id: text("id").primaryKey(),
  bezeichnung: text("bezeichnung").notNull(),
  schluesselHash: text("schluessel_hash").notNull(),
  angelegtAm: integer("angelegt_am", { mode: "timestamp" }).notNull(),
  angelegtVon: text("angelegt_von").notNull(),
  /** Letzte erfolgreiche Abholung; technischer Kontakt, nicht im Audit (`AUDIT_TABLES.veranstaltungen`). */
  zuletztAbgeholtAm: integer("zuletzt_abgeholt_am", { mode: "timestamp" }),
}, (t) => [uniqueIndex("veranstaltung_zugang_schluessel_idx").on(t.schluesselHash)]);
