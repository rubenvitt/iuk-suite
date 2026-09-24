/**
 * Datenbank des Moduls einsatzbuch. Stufe 1 trug nur die Audit-Outbox; mit Stufe 2 kommen
 * die Stammdaten (`fahrzeug`, `person`, `stichwort`), `einstellung` und das Schlüsselpaar
 * dazu. Rechner, Anker, Einmalcodes und Sitzungen folgen erst mit Stufe 5 (Spec §5.1).
 * Die Einsätze selbst liegen NIE hier, sondern auf dem Einsatzbuch-Rechner.
 */
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
/** `name` folgt der Form „Nachname, Vorname“ (Spec §5.1). */
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
