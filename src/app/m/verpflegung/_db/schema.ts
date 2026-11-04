/**
 * Die Datenbank des Moduls `verpflegung` (Verpflegungslager, IDA-316, POC IDA-311): Lebensmittel und Getränke
 * der Verpflegungsgruppe mit TAGESGENAUEM Mindesthaltbarkeits- bzw. Verbrauchsdatum. Getrennt vom Lagerbuch,
 * das den Verfall nur monatsgenau führt.
 *
 * - `artikel` ist die Ware, wie sie auf der Packung steht, mit ihrer EAN (die Packung wird gescannt, nicht
 *   etikettiert). `mhd_art` sagt, ob das Datum „mindestens haltbar bis“ (danach mit Sichtprüfung ausgebbar) oder
 *   „zu verbrauchen bis“ (danach gesperrt) ist. Die Ampel rechnet je Artikel (`rot_tage`, `gelb_tage`).
 * - `charge` ist der Bestand einer Ware mit einem MHD an einem `lagerort`: gleiche Ware, gleicher Ort, gleiches
 *   MHD ist dieselbe Charge. Eine leere Charge wird gelöscht, die Buchungen bleiben.
 * - `buchung` ist das Journal (Eingang, Ausgabe, Aussonderung). Es hält Name, Ort und MHD zum Zeitpunkt fest
 *   und wird nie geändert.
 * - `helfer_link` ist ein Zugang am Telefon ohne Anmeldung (wie die Kärtchen im Lagerbuch): ein Code im Link,
 *   gültig bis zu einem Zeitpunkt, jederzeit sperrbar. Jede Buchung darüber trägt seinen Namen.
 * - `vermerk` hält fest, welche Tagesmeldung schon hinausging (`_lib/faelligkeiten.ts`).
 *
 * Zeitpunkte als Millisekunden seit 1970 (`integer`); Kalendertage (MHD, Eingang) als Text `JJJJ-MM-TT` in der
 * Suite-Zone. Mengen als Zahl mit Nachkommastellen (kg und l lassen Teilentnahmen zu).
 */
export { auditOutbox } from "@/core/audit/_db/schema";
import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const lagerort = sqliteTable("lagerort", {
  id: text("id").primaryKey(),
  /** Voller Name, wie er auf dem Ortsetikett steht („Lagerraum Wache · Regal A“). */
  name: text("name").notNull(),
  /** Kurzname für Listen („Regal A“). */
  kurz: text("kurz").notNull(),
  gekuehlt: integer("gekuehlt", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull().default(0),
  /** Stillgelegt: nicht mehr wählbar; Bestand und Buchungen bleiben. */
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  angelegtAm: integer("angelegt_am").notNull(),
  aktualisiertAm: integer("aktualisiert_am").notNull(),
});

export const artikel = sqliteTable("artikel", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** EAN der Packung; `null`, wenn die Ware keinen Strichcode trägt. */
  ean: text("ean"),
  kategorie: text("kategorie").notNull(),
  einheit: text("einheit").notNull(),
  mhdArt: text("mhd_art", { enum: ["mhd", "verbrauch"] }).notNull().default("mhd"),
  rotTage: integer("rot_tage").notNull().default(7),
  gelbTage: integer("gelb_tage").notNull().default(30),
  /** Mindestbestand in der Einheit des Artikels; `null` = keiner. */
  mindest: real("mindest"),
  /** Am Telefon angelegt; die Verwaltung prüft und bestätigt (Entscheidung 2026-11-04 an IDA-316). */
  vorlaeufig: integer("vorlaeufig", { mode: "boolean" }).notNull().default(false),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  angelegtAm: integer("angelegt_am").notNull(),
  aktualisiertAm: integer("aktualisiert_am").notNull(),
}, (t) => [
  uniqueIndex("artikel_ean_idx").on(t.ean),
  check("artikel_mhd_art", sql`mhd_art IN ('mhd','verbrauch')`),
  check("artikel_schwellen", sql`rot_tage >= 0 AND gelb_tage >= rot_tage`),
  check("artikel_mindest", sql`mindest IS NULL OR mindest > 0`),
]);

export const charge = sqliteTable("charge", {
  id: text("id").primaryKey(),
  artikelId: text("artikel_id").notNull().references(() => artikel.id),
  ortId: text("ort_id").notNull().references(() => lagerort.id),
  /** Kalendertag `JJJJ-MM-TT`. */
  mhd: text("mhd").notNull(),
  menge: real("menge").notNull(),
  /** Erster Eingang dieser Charge, Kalendertag. */
  eingang: text("eingang").notNull(),
  angelegtAm: integer("angelegt_am").notNull(),
  aktualisiertAm: integer("aktualisiert_am").notNull(),
}, (t) => [
  uniqueIndex("charge_ware_ort_mhd_idx").on(t.artikelId, t.ortId, t.mhd),
  index("charge_mhd_idx").on(t.mhd),
  check("charge_mhd", sql`mhd GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  check("charge_eingang", sql`eingang GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  check("charge_menge", sql`menge > 0`),
]);

export const helferLink = sqliteTable("helfer_link", {
  id: text("id").primaryKey(),
  /** Lange Form (`core/helferlink/code.ts`), mit Bindestrichen gespeichert. */
  code: text("code").notNull(),
  /** Steht an jeder Buchung („Dienstabend“, „Übung 31.10.“). */
  name: text("name").notNull(),
  gueltigBis: integer("gueltig_bis").notNull(),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  angelegtAm: integer("angelegt_am").notNull(),
  angelegtVon: text("angelegt_von").notNull().default(""),
  /** Zuletzt eingelöst; reine Anzeige. */
  zuletztAm: integer("zuletzt_am"),
}, (t) => [
  uniqueIndex("helfer_link_code_idx").on(t.code),
]);

export const buchung = sqliteTable("buchung", {
  id: text("id").primaryKey(),
  zeit: integer("zeit").notNull(),
  art: text("art", { enum: ["eingang", "ausgabe", "aussonderung"] }).notNull(),
  artikelId: text("artikel_id").notNull().references(() => artikel.id),
  ortId: text("ort_id").notNull().references(() => lagerort.id),
  mhd: text("mhd").notNull(),
  menge: real("menge").notNull(),
  /** Anzeigename der Person oder Name des Helfer-Links. */
  wer: text("wer").notNull(),
  linkId: text("link_id").references(() => helferLink.id),
  /** Aussonderung: abgelaufen, beschädigt, Rückruf, verdorben, „Sonstiges: …“. */
  grund: text("grund"),
  /** Ausgabe: wofür (Einsatz, Übung …). */
  ziel: text("ziel"),
}, (t) => [
  index("buchung_zeit_idx").on(t.zeit),
  index("buchung_artikel_idx").on(t.artikelId, t.zeit),
  check("buchung_art", sql`art IN ('eingang','ausgabe','aussonderung')`),
  check("buchung_menge", sql`menge > 0`),
]);

export const vermerk = sqliteTable("vermerk", {
  id: text("id").primaryKey(),
  am: integer("am").notNull(),
});
