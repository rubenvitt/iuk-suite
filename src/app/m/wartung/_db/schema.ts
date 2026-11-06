/**
 * Die Datenbank des Moduls `wartung` (IDA-312, POC IDA-307): Geräte mit Prüf- und Wartungsfristen —
 * Stromerzeuger, Heizungen, Akkus, IT — aus mehreren Gruppen der Bereitschaft (Technik, I&K …).
 *
 * - Jedes Gerät gehört genau einer `gruppe`. Deren Verwalter ordnet der Admin im Modul zu (`verwalter`, je Person
 *   der OIDC-`sub`); Modul-Admins sehen alles (`_lib/zugang.ts`). Pocket ID kennt nur `wartung-nutzer` und
 *   `wartung-admin` (IDA-337).
 * - Prüfarten (`pruefart`, IDA-368) mit Wer und Intervall stehen einmal im Katalog. Eine Geräteart (`art`) schaltet
 *   ihre üblichen zu (`art_pruefart`); ein Gerät weicht davon ab (`geraet_pruefart`: abgewählt, zusätzlich oder mit
 *   eigenem Intervall). Was am Gerät gilt, rechnet `_lib/pruefplan.ts`. Die Checkliste (`checkpunkt`) steht an der Art;
 *   ein Punkt kann auf einzelne Prüfarten beschränkt sein (`checkpunkt_pruefart`, IDA-369).
 * - Was an einem Gerät geschah, steht in `eintrag` (Prüfung, Erledigung einer Prüfart, abgelesene Stunden,
 *   gemeldeter oder behobener Mangel). Der Stand einer Prüfart am Gerät ist der jüngste Eintrag mit ihrer
 *   `pruefart_id`; er wird gelesen, nicht gespeichert (`_lib/fristen.ts`).
 * - Der Zustand eines Geräts folgt aus den offenen Mängeln (`_lib/fristen.ts`, `zustandAus`), nie aus einer
 *   eigenen Spalte: ein „behoben“ ohne passenden Zustand kann es so nicht geben.
 *
 * Zeitpunkte als Millisekunden seit 1970 (`integer`); Kalendertage (erledigt am) als Text `JJJJ-MM-TT` in der
 * Suite-Zone.
 */
export { auditOutbox } from "@/core/audit/_db/schema";
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const gruppe = sqliteTable("gruppe", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  angelegtAm: integer("angelegt_am").notNull(),
  aktualisiertAm: integer("aktualisiert_am").notNull(),
});

/**
 * Wer eine Gruppe verwaltet (IDA-337). `nutzer` ist der OIDC-`sub` und entscheidet; `name` ist der Anzeigename
 * beim Zuordnen und steht nur in der Liste.
 */
export const verwalter = sqliteTable("verwalter", {
  gruppeId: text("gruppe_id").notNull().references(() => gruppe.id, { onDelete: "cascade" }),
  nutzer: text("nutzer").notNull(),
  name: text("name").notNull(),
  angelegtAm: integer("angelegt_am").notNull(),
}, (t) => [
  primaryKey({ columns: [t.gruppeId, t.nutzer] }),
  index("verwalter_nutzer_idx").on(t.nutzer),
]);

/**
 * BEKANNTE PERSONEN (Vorbild `kommplan_person`): wer das Modul geöffnet hat, mit Anzeigenamen. Quelle der
 * Personensuche, wenn das Verzeichnis fehlt. Ein Namens-Cache, keine Rechte.
 */
export const person = sqliteTable("person", {
  nutzer: text("nutzer").primaryKey(),
  name: text("name").notNull(),
});

export const art = sqliteTable("art", {
  id: text("id").primaryKey(),
  /** Mehrzahl, wie sie in Listen steht („Stromerzeuger“, „Heizungen“). */
  name: text("name").notNull(),
  /** Einzahl („Heizung“). */
  einzahl: text("einzahl").notNull(),
  /** Schlüssel des Icons8-Katalogs (`core/ikonen/katalog.ts`); unbekannte fallen auf `wrench` zurück. */
  ikone: text("ikone").notNull().default("wrench"),
  /** Betriebsstunden bei jeder Prüfung als Pflichtfeld. */
  stundenPflicht: integer("stunden_pflicht", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull().default(0),
  angelegtAm: integer("angelegt_am").notNull(),
  aktualisiertAm: integer("aktualisiert_am").notNull(),
  /**
   * Materialkiste (IDA-335): jedes Gerät dieser Art hat eine eigene Inhaltsliste (`inhalt`), und die Prüfung am
   * Gerät zählt sie durch statt der Checkliste der Art.
   */
  kiste: integer("kiste", { mode: "boolean" }).notNull().default(false),
});

/**
 * Eine Prüfart des Katalogs (IDA-368), etwa „Elektroprüfung (DGUV V3)“: wer sie erledigt und in welchem Abstand —
 * nach Zeit, nach Betriebsstunden oder beidem, was zuerst kommt. `intern` erledigt man selbst am Gerät per QR mit
 * der Checkliste der Geräteart, die anderen trägt die Verwaltung ein.
 *
 * Mit `anlass` (IDA-369) ist sie statt nach Frist fällig, sobald das Gerät eingesetzt wird (`einsatz`, „vor
 * Verwendung“) bzw. zurückkommt (`rueckkehr`, „nach Benutzung“), bis jemand sie abhakt. Sie hat dann kein
 * Intervall und wird immer selbst am Gerät erledigt.
 */
export const pruefart = sqliteTable("pruefart", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  wer: text("wer", { enum: ["intern", "fachfirma", "elektrofachkraft"] }).notNull(),
  monate: integer("monate"),
  stunden: integer("stunden"),
  position: integer("position").notNull().default(0),
  anlass: text("anlass", { enum: ["einsatz", "rueckkehr"] }),
}, () => [
  check("pruefart_wer", sql`wer IN ('intern','fachfirma','elektrofachkraft')`),
  check("pruefart_anlass", sql`anlass IS NULL OR anlass IN ('einsatz','rueckkehr')`),
  check("pruefart_intervall", sql`(anlass IS NULL AND ((monate IS NOT NULL AND monate > 0) OR (stunden IS NOT NULL AND stunden > 0))) OR (anlass IS NOT NULL AND monate IS NULL AND stunden IS NULL AND wer = 'intern')`),
]);

/** Welche Prüfarten jedes Gerät einer Art von sich aus hat. */
export const artPruefart = sqliteTable("art_pruefart", {
  artId: text("art_id").notNull().references(() => art.id, { onDelete: "cascade" }),
  pruefartId: text("pruefart_id").notNull().references(() => pruefart.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.artId, t.pruefartId] }),
  index("art_pruefart_pruefart_idx").on(t.pruefartId),
]);

/**
 * Wo ein Gerät von seiner Art abweicht. `an = false`: eine Prüfart der Art gilt hier nicht. `an = true`: sie gilt
 * (zusätzlich, wenn die Art sie nicht hat). Stehen `monate` oder `stunden`, ersetzen beide zusammen das Intervall
 * des Katalogs — `null` neben einer Zahl heißt dann „nicht nach Monaten“ bzw. „nicht nach Stunden“.
 */
export const geraetPruefart = sqliteTable("geraet_pruefart", {
  geraetId: text("geraet_id").notNull().references(() => geraet.id, { onDelete: "cascade" }),
  pruefartId: text("pruefart_id").notNull().references(() => pruefart.id, { onDelete: "cascade" }),
  an: integer("an", { mode: "boolean" }).notNull(),
  monate: integer("monate"),
  stunden: integer("stunden"),
}, (t) => [
  primaryKey({ columns: [t.geraetId, t.pruefartId] }),
  index("geraet_pruefart_pruefart_idx").on(t.pruefartId),
  check("geraet_pruefart_monate", sql`monate IS NULL OR monate > 0`),
  check("geraet_pruefart_stunden", sql`stunden IS NULL OR stunden > 0`),
]);

export const checkpunkt = sqliteTable("checkpunkt", {
  id: text("id").primaryKey(),
  artId: text("art_id").notNull().references(() => art.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  /** „So geht’s“ am Telefon. */
  hinweis: text("hinweis").notNull().default(""),
  position: integer("position").notNull().default(0),
}, (t) => [
  index("checkpunkt_art_idx").on(t.artId, t.position),
]);

/**
 * Zu welchen Prüfarten ein Checklistenpunkt gehört (IDA-369), etwa „Konfiguration sichern“ nur zur jährlichen
 * Durchsicht. Ohne Zeile gehört er zu allen.
 */
export const checkpunktPruefart = sqliteTable("checkpunkt_pruefart", {
  checkpunktId: text("checkpunkt_id").notNull().references(() => checkpunkt.id, { onDelete: "cascade" }),
  pruefartId: text("pruefart_id").notNull().references(() => pruefart.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.checkpunktId, t.pruefartId] }),
  index("checkpunkt_pruefart_pruefart_idx").on(t.pruefartId),
]);

export const geraet = sqliteTable("geraet", {
  id: text("id").primaryKey(),
  gruppeId: text("gruppe_id").notNull().references(() => gruppe.id),
  artId: text("art_id").notNull().references(() => art.id),
  name: text("name").notNull(),
  hersteller: text("hersteller").notNull().default(""),
  typ: text("typ").notNull().default(""),
  seriennr: text("seriennr").notNull().default(""),
  ortArt: text("ort_art", { enum: ["lager", "fahrzeug"] }).notNull(),
  ort: text("ort").notNull(),
  /**
   * Das Stammfahrzeug (Modul fahrzeuge, IDA-342), wenn das Gerät auf einem Fahrzeug der Fahrzeugverwaltung
   * steht; `ort` trägt dann dessen Namen. `null` im Lager und bei einem Fahrzeug, das es dort nicht gibt.
   */
  fahrzeugId: text("fahrzeug_id"),
  /** Zuletzt abgelesener Stand; `null`, solange nichts erfasst ist. */
  stunden: integer("stunden"),
  /** Was jeder am Gerät wissen muss, bevor er es benutzt (IDA-300); steht auf dem Steckbrief. */
  hinweise: text("hinweise").notNull().default(""),
  /** Ausgemustert: fällt aus Listen und Fristen, der Verlauf bleibt. */
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  angelegtAm: integer("angelegt_am").notNull(),
  aktualisiertAm: integer("aktualisiert_am").notNull(),
}, (t) => [
  index("geraet_gruppe_idx").on(t.gruppeId),
  index("geraet_art_idx").on(t.artId),
  check("geraet_ort_art", sql`ort_art IN ('lager','fahrzeug')`),
  check("geraet_stunden", sql`stunden IS NULL OR stunden >= 0`),
]);

/**
 * Die Inhaltsliste einer Materialkiste (IDA-335): je Position die Soll-Menge. Beim Durchzählen wird jede Position
 * „vollständig“ oder „fehlt“; was fehlt, wird ein Mangel mit `fehlt`.
 */
export const inhalt = sqliteTable("inhalt", {
  id: text("id").primaryKey(),
  geraetId: text("geraet_id").notNull().references(() => geraet.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  soll: integer("soll").notNull(),
  bemerkung: text("bemerkung").notNull().default(""),
  position: integer("position").notNull().default(0),
}, (t) => [
  index("inhalt_geraet_idx").on(t.geraetId, t.position),
  check("inhalt_soll", sql`soll >= 1`),
]);

/**
 * Der Verlauf eines Geräts. `pruefung` und `erledigt` tragen eine `pruefart_id` und setzen deren Stand; `titel`
 * hält den Namen der Prüfart zum Zeitpunkt fest (sie kann später umbenannt oder entfernt werden). `einsatz` und
 * `rueckkehr` (IDA-369) machen die Prüfarten mit diesem Anlass fällig; verglichen wird `angelegt_am`.
 * `antworten` (JSON) ist der Nachweis der Checkliste: `[{ text, ok }]`.
 */
export const eintrag = sqliteTable("eintrag", {
  id: text("id").primaryKey(),
  geraetId: text("geraet_id").notNull().references(() => geraet.id, { onDelete: "cascade" }),
  typ: text("typ", { enum: ["pruefung", "erledigt", "stunden", "mangel", "behoben", "einsatz", "rueckkehr"] }).notNull(),
  pruefartId: text("pruefart_id").references(() => pruefart.id, { onDelete: "set null" }),
  titel: text("titel").notNull(),
  /** Kalendertag `JJJJ-MM-TT` in der Suite-Zone. */
  am: text("am").notNull(),
  stunden: integer("stunden"),
  /** Wer: angemeldete Person, Fachfirma oder Prüfer. */
  wer: text("wer").notNull().default(""),
  notiz: text("notiz").notNull().default(""),
  ergebnis: text("ergebnis", { enum: ["ok", "mangel", "defekt"] }),
  antworten: text("antworten"),
  maengel: integer("maengel").notNull().default(0),
  angelegtAm: integer("angelegt_am").notNull(),
}, (t) => [
  index("eintrag_geraet_idx").on(t.geraetId, t.am),
  index("eintrag_pruefart_idx").on(t.geraetId, t.pruefartId, t.am),
  check("eintrag_typ", sql`typ IN ('pruefung','erledigt','stunden','mangel','behoben','einsatz','rueckkehr')`),
  check("eintrag_am", sql`am GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  check("eintrag_ergebnis", sql`ergebnis IS NULL OR ergebnis IN ('ok','mangel','defekt')`),
]);

/**
 * Ein gemeldeter Mangel — bei der Prüfung oder direkt am Gerät. Das Foto liegt unter
 * `DATA_DIR/wartung/maengel/<id>.jpg` (`_lib/fotos.ts`). `gepushtAm` hält den Sofort-Push fest
 * (nur „nicht einsatzbereit“, `_lib/faelligkeiten.ts`).
 */
export const mangel = sqliteTable("mangel", {
  id: text("id").primaryKey(),
  geraetId: text("geraet_id").notNull().references(() => geraet.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  foto: integer("foto", { mode: "boolean" }).notNull().default(false),
  einsatzbereit: integer("einsatzbereit", { mode: "boolean" }).notNull(),
  gemeldetAm: integer("gemeldet_am").notNull(),
  gemeldetVon: text("gemeldet_von").notNull().default(""),
  behobenAm: integer("behoben_am"),
  behobenVon: text("behoben_von"),
  gepushtAm: integer("gepusht_am"),
  /** Beim Durchzählen einer Materialkiste als fehlend gemeldet (IDA-335). */
  fehlt: integer("fehlt", { mode: "boolean" }).notNull().default(false),
  /**
   * Welche Position fehlt: je Position steht höchstens ein offener Fehlt-Mangel, und wer sie wieder vollständig
   * zählt, behebt ihn (`_lib/schreiben.ts`). `null`, wenn die Position inzwischen von der Liste ist.
   */
  inhaltId: text("inhalt_id").references(() => inhalt.id, { onDelete: "set null" }),
  /**
   * Seit wann ein zunächst einsatzbereit gemeldeter Mangel nicht mehr einsatzbereit ist (eine Kiste, deren
   * Position weiter fehlt, wird als nicht einsatzbereit durchgezählt). Der Sofort-Push rechnet ab hier, nicht ab
   * `gemeldetAm`, das der Meldezeitpunkt bleibt.
   */
  herabgestuftAm: integer("herabgestuft_am"),
}, (t) => [
  index("mangel_geraet_idx").on(t.geraetId, t.behobenAm),
  index("mangel_offen_idx").on(t.behobenAm, t.gemeldetAm),
]);

/**
 * Eine Unterlage am Gerät (IDA-300): Kurzanleitung, Handbuch, Schaltplan. Die Datei liegt unter
 * `DATA_DIR/wartung/unterlagen/<id>.<pdf|jpg>` (`_lib/unterlagen.ts`); hier stehen nur Titel und Art. Sie liegen im
 * Modul selbst und nicht im Modul Dateien, weil dessen Freigaben ablaufen (Entscheidung an IDA-300).
 */
export const unterlage = sqliteTable("unterlage", {
  id: text("id").primaryKey(),
  geraetId: text("geraet_id").notNull().references(() => geraet.id, { onDelete: "cascade" }),
  titel: text("titel").notNull(),
  typ: text("typ", { enum: ["pdf", "bild"] }).notNull(),
  bytes: integer("bytes").notNull(),
  position: integer("position").notNull().default(0),
  angelegtAm: integer("angelegt_am").notNull(),
  angelegtVon: text("angelegt_von").notNull().default(""),
}, (t) => [
  index("unterlage_geraet_idx").on(t.geraetId, t.position),
  check("unterlage_typ", sql`typ IN ('pdf','bild')`),
]);
