/**
 * Datenbank des Moduls helfer (IDA-249): die aus HiOrg-Server übernommenen Helferinnen und Helfer.
 *
 * DATENSPARSAMKEIT IST HIER DAS SCHEMA, NICHT EINE ZUSAGE DANEBEN. HiOrg liefert je Person auch
 * Bankverbindung, Geburtsdatum, Anschrift, Allergien, Führerschein und Angehörige
 * (`GET /core/v1/personal`, eine Feldauswahl ist nicht dokumentiert). Gespeichert wird nur, was für
 * die Auswahl im Einsatzbuch nötig ist: Name, Kontostatus, Gruppen, Qualifikationen. Für alles
 * andere gibt es keine Spalte, und `_lib/hiorg/person.ts` verwirft es schon beim Lesen.
 */
export { auditOutbox } from "@/core/audit/_db/schema";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Eine übernommene Person. `quellId` ist die Kennung in der Quelle (HiOrg: 32 Hex-Zeichen), `id`
 * die eigene — nur sie verlässt das Modul (`_lib/bereitstellung.ts`), damit keine HiOrg-Kennung in
 * versiegelte Einsätze wandert. `qualifikationen` ist JSON `{ liste, name, kurz }[]`, `gruppen`
 * JSON `string[]`. `aktualisiertAm` ändert sich nur, wenn sich ein Wert geändert hat.
 */
export const helfer = sqliteTable("helfer", {
  id: text("id").primaryKey(),
  herkunft: text("herkunft", { enum: ["hiorg", "demo", "datei"] }).notNull(),
  quellId: text("quell_id").notNull(),
  vorname: text("vorname").notNull(),
  nachname: text("nachname").notNull(),
  status: text("status").notNull(),
  gruppen: text("gruppen").notNull().default("[]"),
  qualifikationen: text("qualifikationen").notNull().default("[]"),
  fuerEinsatzbuch: integer("fuer_einsatzbuch", { mode: "boolean" }).notNull().default(true),
  importiertAm: integer("importiert_am", { mode: "timestamp" }).notNull(),
  aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp" }).notNull(),
}, (t) => [
  uniqueIndex("helfer_quelle_idx").on(t.herkunft, t.quellId),
  check("helfer_herkunft", sql`herkunft IN ('hiorg','demo','datei')`),
  check("helfer_gruppen_json", sql`json_valid(gruppen)`),
  check("helfer_qualifikationen_json", sql`json_valid(qualifikationen)`),
]);

/** Schlüssel/Wert; `wert` ist JSON. Schlüssel: `quelle`, `filter`, `neueFreigeben` (`_lib/einstellungen.ts`). */
export const einstellung = sqliteTable("einstellung", {
  schluessel: text("schluessel").primaryKey(),
  wert: text("wert").notNull(),
}, () => [check("einstellung_wert_json", sql`json_valid(wert)`)]);

/**
 * Die Verbindung zu HiOrg-Server, höchstens eine (id = 1). `refreshToken` ist AES-256-GCM mit
 * `HELFER_SCHLUESSEL` verschlüsselt (`_lib/hiorg/tresor.ts`); ein Access-Token wird nie gespeichert.
 * HiOrg kennt nur `authorization_code` + `refresh_token`: ohne diese Zeile gibt es keinen Import.
 */
export const hiorgVerbindung = sqliteTable("hiorg_verbindung", {
  id: integer("id").primaryKey(),
  kontoName: text("konto_name").notNull(),
  verbundenVon: text("verbunden_von").notNull(),
  verbundenVonSub: text("verbunden_von_sub").notNull(),
  verbundenAm: integer("verbunden_am", { mode: "timestamp" }).notNull(),
  refreshToken: text("refresh_token").notNull(),
  erneuertAm: integer("erneuert_am", { mode: "timestamp" }).notNull(),
}, () => [check("hiorg_verbindung_einzig", sql`id = 1`)]);

/**
 * Ein angefangenes Verbinden (OAuth-`state` + PKCE-`verifier`), zehn Minuten gültig und an die
 * Person gebunden, die es begonnen hat. Technisch und kurzlebig, kein Audit.
 */
export const anmeldevorgang = sqliteTable("anmeldevorgang", {
  state: text("state").primaryKey(),
  verifier: text("verifier").notNull(),
  sub: text("sub").notNull(),
  ablauf: integer("ablauf", { mode: "timestamp" }).notNull(),
});

/**
 * Das Protokoll jedes Abgleichs. Personenbezogen ist hier nur, WER abgeglichen hat — keine Namen
 * der Helfer, nur Zählungen (`ausgefiltert` ist JSON `{ <grund>: <anzahl> }`).
 */
export const importlauf = sqliteTable("importlauf", {
  id: text("id").primaryKey(),
  zeitpunkt: integer("zeitpunkt", { mode: "timestamp" }).notNull(),
  quelle: text("quelle", { enum: ["hiorg", "demo", "datei"] }).notNull(),
  vonName: text("von_name").notNull(),
  vonSub: text("von_sub").notNull(),
  gelesen: integer("gelesen").notNull(),
  neu: integer("neu").notNull(),
  geaendert: integer("geaendert").notNull(),
  entfernt: integer("entfernt").notNull(),
  ausgefiltert: text("ausgefiltert").notNull().default("{}"),
}, () => [
  check("importlauf_quelle", sql`quelle IN ('hiorg','demo','datei')`),
  check("importlauf_ausgefiltert_json", sql`json_valid(ausgefiltert)`),
]);
