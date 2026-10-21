/**
 * Datenbank des Moduls fahrzeuge (IDA-255): die Fahrzeuge der Bereitschaft als Stammdaten der Suite.
 *
 * DÜNN MIT ABSICHT. Hier steht, WER ein Fahrzeug ist — nicht, was darauf liegt (Lagerbuch), welche
 * Funkgeräte darin stecken (Funkgeräte) oder in welchem Einsatz es fuhr (Einsatzbuch). Jede dieser
 * Apps behält ihre eigene Zeile mit ihren Fachdaten und bekommt nur einen Verweis auf `stammfahrzeug.id`
 * plus einen Abgleich (Plan: Epic IDA-254). Herausgegeben wird nur über `_lib/bereitstellung.ts`.
 *
 * Die Längen folgen dem Einsatzbuch (`einsatzbuch/_lib/stammdaten/schemas.ts`, `fahrzeugEingabe`):
 * was hier gültig ist, muss dort ohne Kürzen ankommen.
 */
export { auditOutbox } from "@/core/audit/_db/schema";
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Ein Fahrzeug oder ein Anhänger. Die Tabelle heißt `stammfahrzeug` und nicht `fahrzeug`, weil das
 * Einsatzbuch eine Tabelle `fahrzeug` hat und das Audit-Protokoll Objekttypen nur nach Namen beschriftet
 * (`portal/admin/audit/labels.ts`). `id` ist die eigene, stabile Kennung — Funkkenner und Kennzeichen
 * sind Felder, weil sich beide ändern können (Umstrukturierung, Ummeldung). `null` heißt bei beiden
 * „nicht vergeben“, nie ein Leerstring (`_lib/eingabe.ts` macht aus einem leeren Feld `null`), damit
 * der eindeutige Index zwei Fahrzeuge ohne Kennzeichen zulässt.
 */
export const stammfahrzeug = sqliteTable("stammfahrzeug", {
  id: text("id").primaryKey(),
  art: text("art", { enum: ["fahrzeug", "anhaenger"] }).notNull().default("fahrzeug"),
  /** „RTW“, „KTW-B“, „ELW 1“ — Freitext, wie im Einsatzbuch. */
  typ: text("typ").notNull(),
  /** „Rotkreuz Uelzen 11-83-1“. */
  funkrufname: text("funkrufname").notNull(),
  /** „11-83-1“ — im Einsatzbuch die Spalte `kennung`. */
  funkkenner: text("funkkenner"),
  /** Amtliches Kennzeichen — im Lagerbuch die Spalte `kennung`. */
  kennzeichen: text("kennzeichen"),
  standort: text("standort").notNull(),
  bemerkung: text("bemerkung"),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  angelegtAm: integer("angelegt_am", { mode: "timestamp" }).notNull(),
  aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp" }).notNull(),
}, (t) => [
  uniqueIndex("stammfahrzeug_funkkenner_idx").on(t.funkkenner),
  uniqueIndex("stammfahrzeug_kennzeichen_idx").on(t.kennzeichen),
  check("stammfahrzeug_art", sql`art IN ('fahrzeug','anhaenger')`),
]);

/**
 * Welche Zeile einer anderen App welches Stammfahrzeug ist (IDA-256). Geschrieben vom Erstimport, gelesen
 * von den Kopplungen der Apps (IDA-257 bis IDA-259) über `_lib/bereitstellung.ts`.
 *
 * `quellId` ist die Kennung in der Quelle: im Einsatzbuch `fahrzeug.id`, im Lagerbuch `lagerorte.id`, bei
 * den Funkgeräten der getrimmte Ort (sie kennen keine Fahrzeugzeile). `stammId = null` heißt „entschieden:
 * kein Fahrzeug“ („Fahrzeughalle“) — so fragt die Vorschau nicht bei jedem Lauf wieder.
 */
export const quellzuordnung = sqliteTable("quellzuordnung", {
  quelle: text("quelle", { enum: ["einsatzbuch", "lagerbuch", "funkgeraete"] }).notNull(),
  quellId: text("quell_id").notNull(),
  stammId: text("stamm_id").references(() => stammfahrzeug.id),
  entschiedenAm: integer("entschieden_am", { mode: "timestamp" }).notNull(),
  entschiedenVon: text("entschieden_von").notNull(),
}, (t) => [
  primaryKey({ columns: [t.quelle, t.quellId] }),
  index("quellzuordnung_stamm_idx").on(t.stammId),
  check("quellzuordnung_quelle", sql`quelle IN ('einsatzbuch','lagerbuch','funkgeraete')`),
]);
