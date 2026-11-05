/**
 * Die Datenbank des Moduls `gemeinschaft` (IDA-320, IDA-315): die Helfergruppe „Gemeinschaft“ plant
 * Events und Projekte, verteilt Aufgaben an ihre Mitglieder und vermietet die Bar.
 *
 * Zeitpunkte als Millisekunden seit 1970 (`integer`, wie in `schichtplan`); Kalendertage (Fälligkeit,
 * Zieltermin eines Projekts) als Text `JJJJ-MM-TT` in der Suite-Zone, ohne Uhrzeit.
 *
 * Mitglieder haben KEIN Suite-Konto (Entscheidung 2026-11-01 an IDA-319): sie stehen nur hier, mit
 * einem persönlichen Link (`mitglied.link`), den die Leitung erneuern kann. Angemeldet ist nur die Leitung.
 */
export { auditOutbox } from "@/core/audit/_db/schema";
import { sql } from "drizzle-orm";
import { blob, check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const mitglied = sqliteTable("mitglied", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Freiwillig; sieht nur die Leitung, nie ein anderes Mitglied. */
  telefon: text("telefon").notNull().default(""),
  /** Zufallskennung des persönlichen Links (`/mein/<link>`). Neu erzeugen macht den alten Link ungültig. */
  link: text("link").notNull(),
  angelegtAm: integer("angelegt_am").notNull(),
  aktualisiertAm: integer("aktualisiert_am").notNull(),
}, (t) => [
  uniqueIndex("mitglied_link_idx").on(t.link),
]);

export const vorhaben = sqliteTable("vorhaben", {
  id: text("id").primaryKey(),
  /** Event = Termin mit Beginn und Ende; Projekt = über Wochen, ohne festen Tag, höchstens mit Zieltermin. */
  art: text("art", { enum: ["event", "projekt"] }).notNull(),
  titel: text("titel").notNull(),
  beschreibung: text("beschreibung").notNull().default(""),
  verantwortlichId: text("verantwortlich_id").references(() => mitglied.id, { onDelete: "set null" }),
  /** Nur bei Events: das Projekt, zu dem das Event gehört. */
  projektId: text("projekt_id"),
  /** Nur bei Events. */
  von: integer("von"),
  bis: integer("bis"),
  ort: text("ort").notNull().default(""),
  /** Nur bei Events: belegt die Bar; die Vermietung zeigt den Zeitraum als Sperrzeit (abgeleitet, nicht kopiert). */
  barBelegen: integer("bar_belegen", { mode: "boolean" }).notNull().default(false),
  /** Nur bei Projekten: Zieltermin als Kalendertag `JJJJ-MM-TT`. */
  ziel: text("ziel"),
  angelegtAm: integer("angelegt_am").notNull(),
  aktualisiertAm: integer("aktualisiert_am").notNull(),
}, (t) => [
  index("vorhaben_art_von_idx").on(t.art, t.von),
  index("vorhaben_projekt_idx").on(t.projektId),
  check("vorhaben_art", sql`art IN ('event','projekt')`),
  check("vorhaben_event_zeit", sql`art <> 'event' OR (von IS NOT NULL AND bis IS NOT NULL AND bis > von)`),
  check("vorhaben_projekt_ohne_zeit", sql`art <> 'projekt' OR (von IS NULL AND bis IS NULL AND projekt_id IS NULL AND bar_belegen = 0)`),
  check("vorhaben_ziel_tag", sql`ziel IS NULL OR ziel GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
]);

export const aufgabe = sqliteTable("aufgabe", {
  id: text("id").primaryKey(),
  vorhabenId: text("vorhaben_id").notNull().references(() => vorhaben.id, { onDelete: "cascade" }),
  titel: text("titel").notNull(),
  /** Kalendertag `JJJJ-MM-TT` oder leer. */
  faellig: text("faellig"),
  erledigtAm: integer("erledigt_am"),
  position: integer("position").notNull(),
  angelegtAm: integer("angelegt_am").notNull(),
}, (t) => [
  index("aufgabe_vorhaben_idx").on(t.vorhabenId, t.position),
  check("aufgabe_faellig_tag", sql`faellig IS NULL OR faellig GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
]);

export const zustaendig = sqliteTable("zustaendig", {
  aufgabeId: text("aufgabe_id").notNull().references(() => aufgabe.id, { onDelete: "cascade" }),
  mitgliedId: text("mitglied_id").notNull().references(() => mitglied.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.aufgabeId, t.mitgliedId] }),
  index("zustaendig_mitglied_idx").on(t.mitgliedId),
]);

/* ---------------- Vermietung (heute nur die Bar; `raum` hält die Tür für weitere Räume offen) ---------------- */

export const sperrzeit = sqliteTable("sperrzeit", {
  id: text("id").primaryKey(),
  raum: text("raum").notNull().default("bar"),
  von: integer("von").notNull(),
  bis: integer("bis").notNull(),
  /** Sieht nur die Leitung; öffentlich steht „belegt“. */
  grund: text("grund").notNull(),
  angelegtAm: integer("angelegt_am").notNull(),
}, (t) => [
  index("sperrzeit_raum_von_idx").on(t.raum, t.von),
  check("sperrzeit_zeitraum", sql`bis > von`),
]);

export const anfrage = sqliteTable("anfrage", {
  id: text("id").primaryKey(),
  raum: text("raum").notNull().default("bar"),
  status: text("status", { enum: ["angefragt", "zugesagt", "abgelehnt", "zurueckgezogen"] }).notNull().default("angefragt"),
  /** Zufallskennung der Statusseite (`/status/<code>`), die die anfragende Person bekommt. Keine E-Mail. */
  code: text("code").notNull(),
  von: integer("von").notNull(),
  bis: integer("bis").notNull(),
  anlass: text("anlass").notNull(),
  personen: integer("personen").notNull(),
  person: text("person").notNull(),
  kontakt: text("kontakt").notNull(),
  hinweis: text("hinweis").notNull().default(""),
  /** War beim Absenden über die Suite angemeldet (Bereitschaft); sonst extern. */
  mitglied: integer("mitglied", { mode: "boolean" }).notNull().default(false),
  /** Pflicht bei einer Absage oder zurückgenommenen Zusage; sieht die anfragende Person. */
  begruendung: text("begruendung").notNull().default(""),
  vertrag: text("vertrag", { enum: ["offen", "verschickt", "unterschrieben"] }).notNull().default("offen"),
  eingegangenAm: integer("eingegangen_am").notNull(),
  entschiedenAm: integer("entschieden_am"),
}, (t) => [
  uniqueIndex("anfrage_code_idx").on(t.code),
  index("anfrage_raum_von_idx").on(t.raum, t.von),
  check("anfrage_status", sql`status IN ('angefragt','zugesagt','abgelehnt','zurueckgezogen')`),
  check("anfrage_vertrag", sql`vertrag IN ('offen','verschickt','unterschrieben')`),
  check("anfrage_zeitraum", sql`bis > von`),
  check("anfrage_personen", sql`personen > 0`),
]);

/** Die drei Dokumente einer Vermietung (IDA-354); `mietvertrag` ist der aus IDA-343. */
export const DOKUMENTARTEN = ["mietvertrag", "uebergabe", "rueckgabe"] as const;
const artCheck = sql`art IN ('mietvertrag','uebergabe','rueckgabe')`;

/**
 * Die unterschriebene Fassung eines Dokuments als PDF, höchstens eine je Anfrage und Art. `herkunft`: von der Leitung
 * abgelegt, digital gezeichnet (dann `unterschriebenVon` = Name der mietenden Person) oder auf der Statusseite als
 * Datei/Foto hochgeladen (IDA-343, IDA-354).
 */
export const vertragsdatei = sqliteTable("vertragsdatei", {
  anfrageId: text("anfrage_id").notNull().references(() => anfrage.id, { onDelete: "cascade" }),
  art: text("art", { enum: DOKUMENTARTEN }).notNull().default("mietvertrag"),
  name: text("name").notNull(),
  groesse: integer("groesse").notNull(),
  inhalt: blob("inhalt", { mode: "buffer" }).notNull(),
  abgelegtAm: integer("abgelegt_am").notNull(),
  herkunft: text("herkunft", { enum: ["leitung", "gezeichnet", "hochgeladen"] }).notNull().default("leitung"),
  unterschriebenVon: text("unterschrieben_von"),
}, (t) => [
  primaryKey({ columns: [t.anfrageId, t.art] }),
  check("vertragsdatei_art", artCheck),
]);

/**
 * Die Vorlage je Raum und Art (IDA-343, IDA-354). `felder` ist die Feldliste als JSON (`_lib/vertragFeld.ts`), in
 * PDF-Punkten: beim Hochladen erkannte Formularfelder der PDF und selbst aufgezogene. `zeichnen` aus = auf der
 * Statusseite nur der Upload des unterschriebenen Ausdrucks.
 */
export const vertragsvorlage = sqliteTable("vertragsvorlage", {
  raum: text("raum").notNull(),
  art: text("art", { enum: DOKUMENTARTEN }).notNull().default("mietvertrag"),
  name: text("name").notNull(),
  groesse: integer("groesse").notNull(),
  inhalt: blob("inhalt", { mode: "buffer" }).notNull(),
  sha256: text("sha256").notNull(),
  felder: text("felder").notNull().default("[]"),
  zeichnen: integer("zeichnen", { mode: "boolean" }).notNull().default(true),
  abgelegtAm: integer("abgelegt_am").notNull(),
}, (t) => [
  primaryKey({ columns: [t.raum, t.art] }),
  check("vertragsvorlage_art", artCheck),
]);

/**
 * Ein Dokument einer Anfrage, aus der Vorlage erstellt (IDA-354): Vorlage und Felder als Kopie, damit ein späteres
 * Ersetzen der Vorlage es nicht ändert. `werte` sind die Einträge der Leitung (JSON, Feld-ID → Text oder Haken).
 * `freigegebenAm` gesetzt = steht auf der Statusseite, Werte gesperrt. `version` zählt jede Änderung; wer
 * unterschreibt, schickt die gesehene Version mit.
 */
export const vertragsdokument = sqliteTable("vertragsdokument", {
  anfrageId: text("anfrage_id").notNull().references(() => anfrage.id, { onDelete: "cascade" }),
  art: text("art", { enum: DOKUMENTARTEN }).notNull(),
  name: text("name").notNull(),
  inhalt: blob("inhalt", { mode: "buffer" }).notNull(),
  felder: text("felder").notNull().default("[]"),
  werte: text("werte").notNull().default("{}"),
  version: integer("version").notNull().default(1),
  erstelltAm: integer("erstellt_am").notNull(),
  freigegebenAm: integer("freigegeben_am"),
}, (t) => [
  primaryKey({ columns: [t.anfrageId, t.art] }),
  check("vertragsdokument_art", artCheck),
]);

/** Eine Unterschrift in einem Feld eines Dokuments (IDA-354); `bild` ist das gezeichnete PNG. */
export const vertragsunterschrift = sqliteTable("vertragsunterschrift", {
  anfrageId: text("anfrage_id").notNull(),
  art: text("art", { enum: DOKUMENTARTEN }).notNull(),
  feldId: text("feld_id").notNull(),
  rolle: text("rolle", { enum: ["leitung", "mieter"] }).notNull(),
  name: text("name").notNull(),
  am: integer("am").notNull(),
  bild: blob("bild", { mode: "buffer" }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.anfrageId, t.art, t.feldId] }),
  foreignKey({ columns: [t.anfrageId, t.art], foreignColumns: [vertragsdokument.anfrageId, vertragsdokument.art] }).onDelete("cascade"),
  check("vertragsunterschrift_rolle", sql`rolle IN ('leitung','mieter')`),
]);
