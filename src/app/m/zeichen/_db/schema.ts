import { sql } from "drizzle-orm";
import {
  check, index, integer, primaryKey, sqliteTable, text, uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

/*
 * Das Schema des Moduls `zeichen` — fuenf Tabellen (Spec §4).
 *
 * KEIN "use client", KEIN Icon-Import (Fallen 6 und 7).
 *
 * ZEITPUNKTE SIND UNIX-SEKUNDEN: `{ mode: "timestamp" }`, NIEMALS `timestamp_ms`.
 * KALENDERTAGE SIND TEXT (`YYYY-MM-DD`): als Zeitstempel haengt „heute faellig" an
 * der Zeitzone des Lesers, und lexikografisch ist `faellig_am <= :heute` ohne
 * Datumsrechnen vergleichbar.
 *
 * ⛔ KEIN FREMDSCHLUESSEL AUF KATALOG-IDs. Die Wahrheit ueber den Katalog liegt im
 * eingecheckten Generat (`_lib/katalog.generiert.json`), nicht in der Datenbank. Wer
 * hier eine `zeichen`-Tabelle mit FK anlegt, muss sie ab dann pflegen und bei jedem
 * Paketupgrade migrieren. Stattdessen traegt jede Zeile, die auf eine Katalog-ID
 * zeigt, einen `titel_schnappschuss`: die Antwort auf „was war das?", die auch dann
 * noch traegt, wenn die ID nicht mehr aufloest (Spec §4.6 Stufe 2).
 */

export const newId = () => nanoid();

/**
 * Ein Lernstand je (Person, Zeichen) — NICHT je Fragetyp. Ein Zeichen kennt man oder
 * nicht. Getrennte Staende verdoppelten die Faelligkeitsliste und erzeugten die absurde
 * Karteikarte „erkannt, aber nicht benannt"; die Richtung wird bei der Ausspielung
 * gewuerfelt (`_lib/lernen/fragen.ts`).
 */
export const lernstand = sqliteTable("lernstand", {
  sub: text("sub").notNull(),
  zeichenId: text("zeichen_id").notNull(),
  stufe: integer("stufe").notNull().default(0),
  /** Kalendertag `YYYY-MM-DD`. */
  faelligAm: text("faellig_am").notNull(),
  richtig: integer("richtig").notNull().default(0),
  falsch: integer("falsch").notNull().default(0),
  letzteAntwortAm: integer("letzte_antwort_am", { mode: "timestamp" }),
  erstelltAm: integer("erstellt_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  primaryKey({ columns: [t.sub, t.zeichenId] }),
  index("lernstand_faellig_idx").on(t.sub, t.faelligAm),
  // `check()` ZUSAETZLICH zum Typ: ein Drizzle-`enum` erzeugt in SQL nur `text NOT NULL`,
  // und eine Integer-Spalte nimmt jede Zahl. Die fuenf Leitner-Stufen sind eine
  // Datenzusage, keine Konvention.
  check("lernstand_stufe_check", sql`${t.stufe} BETWEEN 0 AND 4`),
]);

export const merkliste = sqliteTable("merkliste", {
  sub: text("sub").notNull(),
  zeichenId: text("zeichen_id").notNull(),
  /** Rueckfall fuer den Fall, dass die ID nicht mehr aufloest. Anzeigequelle bleibt das Generat. */
  titelSchnappschuss: text("titel_schnappschuss").notNull(),
  erstelltAm: integer("erstellt_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [primaryKey({ columns: [t.sub, t.zeichenId] })]);

/**
 * Eigene Zusammenstellungen.
 *
 * ⛔ `spec_kanon` traegt einen GEWOEHNLICHEN Index, KEINEN uniqueIndex. Ein
 * uniqueIndex dort zusammen mit `onConflictDoUpdate` benennt ein bereits gespeichertes
 * Zeichen STILL UM statt ein zweites anzulegen — Datenverlust im Normalbetrieb, ohne
 * jedes Upgrade. „Schon gespeichert?" ist eine Lesefrage; die Eindeutigkeit liegt auf
 * dem NAMEN, den der Nutzer versteht. Die Action fragt bei einem Treffer zurueck,
 * statt zu entscheiden (Spec §6.6).
 *
 * `svg_zwischenspeicher` ist vom Client geliefertes Markup: `/meine` ist eine Server
 * Component, und Rendern aus der Spec braeuchte `composeFromCatalog` — das zoege den
 * Katalog in den Server-Graph und braeche den Build. Deshalb wird es dort als
 * `<img src="data:image/svg+xml;base64,…">` gerendert, NIE mit dangerouslySetInnerHTML.
 *
 * Die zwei Versionsspalten kommen aus `KATALOG_STAND`, nie als Literal: es gibt keine
 * dokumentierte ID-Stabilitaetszusage des Pakets, und als Literale loegen sie ab dem
 * ersten Upgrade.
 */
export const eigeneZeichen = sqliteTable("eigene_zeichen", {
  id: text("id").primaryKey().$defaultFn(newId),
  sub: text("sub").notNull(),
  name: text("name").notNull(),
  specJson: text("spec_json").notNull(),
  specKanon: text("spec_kanon").notNull(),
  svgZwischenspeicher: text("svg_zwischenspeicher").notNull(),
  paketVersion: text("paket_version").notNull(),
  datenVersion: text("daten_version").notNull(),
  erstelltAm: integer("erstellt_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  geaendertAm: integer("geaendert_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex("eigene_zeichen_sub_name_idx").on(t.sub, t.name),
  index("eigene_zeichen_sub_kanon_idx").on(t.sub, t.specKanon),
]);

/**
 * Kuratierte Lernsets. `aktiv` beginnt auf `false`: ein Set entsteht ueber mehrere
 * Sitzungen, ohne Entwurfszustand saehe jeder Lernende jede Halbfertigkeit.
 *
 * `erstellt_von` wird gespeichert, aber NICHT angezeigt — deshalb braucht das Modul
 * keine Personen-/Namenstabelle. Ein kuratiertes Set traegt die Autoritaet der
 * Ausbildung, nicht die einer Person.
 */
export const lernsets = sqliteTable("lernsets", {
  id: text("id").primaryKey().$defaultFn(newId),
  slug: text("slug").notNull(),
  titel: text("titel").notNull(),
  beschreibung: text("beschreibung"),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(false),
  sortierung: integer("sortierung").notNull().default(0),
  erstelltVon: text("erstellt_von").notNull(),
  erstelltAm: integer("erstellt_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  geaendertAm: integer("geaendert_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [uniqueIndex("lernsets_slug_idx").on(t.slug)]);

export const lernsetZeichen = sqliteTable("lernset_zeichen", {
  lernsetId: text("lernset_id").notNull().references(() => lernsets.id, { onDelete: "cascade" }),
  zeichenId: text("zeichen_id").notNull(),
  titelSchnappschuss: text("titel_schnappschuss").notNull(),
  position: integer("position").notNull(),
}, (t) => [
  primaryKey({ columns: [t.lernsetId, t.zeichenId] }),
  index("lernset_zeichen_pos_idx").on(t.lernsetId, t.position),
]);
