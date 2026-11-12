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

/**
 * Die Fahrzeugakte (IDA-299): Technik, Kilometerstand und der aufgezogene Reifensatz, 1:1 zum
 * Stammfahrzeug. Eine fehlende Zeile heißt „leere Akte“ (alles nicht erfasst) — deshalb gab es beim
 * Einführen keinen Backfill, und `_lib/akte/daten.ts` (`ladeAkten`) liest mit LEFT JOIN. `null` heißt
 * überall „nicht erfasst“. Längen in Zentimetern, Gewichte in Kilogramm, Tage als `JJJJ-MM-TT` in der
 * Suite-Zone (`_lib/akte/typen.ts`).
 */
export const fahrzeugakte = sqliteTable("fahrzeugakte", {
  stammId: text("stamm_id").primaryKey().references(() => stammfahrzeug.id),
  modell: text("modell"),
  baujahr: integer("baujahr"),
  laengeCm: integer("laenge_cm"),
  breiteCm: integer("breite_cm"),
  hoeheCm: integer("hoehe_cm"),
  zggKg: integer("zgg_kg"),
  leerKg: integer("leer_kg"),
  /** Führer / Unterführer / Mannschaft — alle drei gesetzt oder alle drei `null`. */
  staerkeF: integer("staerke_f"),
  staerkeU: integer("staerke_u"),
  staerkeM: integer("staerke_m"),
  sitze: integer("sitze"),
  tragen: integer("tragen"),
  fuehrerschein: text("fuehrerschein"),
  /** JSON-Array aus Zeichenketten; „Tempo 100“ ändert die Reifenregel (`_lib/akte/typen.ts`, `TEMPO_100`). */
  besonderheiten: text("besonderheiten", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  km: integer("km"),
  kmAm: text("km_am"),
  /** Art des Satzes, der drauf ist; `null`, solange kein Satz erfasst ist. */
  reifenAufgezogen: text("reifen_aufgezogen", { enum: ["Winter", "Sommer", "Ganzjahres"] }),
}, () => [
  check("fahrzeugakte_reifen_aufgezogen", sql`reifen_aufgezogen IS NULL OR reifen_aufgezogen IN ('Winter','Sommer','Ganzjahres')`),
]);

/** Eine wiederkehrende Prüfung eines Fahrzeugs: HU, UVV, Service oder etwas Eigenes („Feuerlöscher“). */
export const pruefung = sqliteTable("pruefung", {
  id: text("id").primaryKey(),
  stammId: text("stamm_id").notNull().references(() => stammfahrzeug.id),
  art: text("art", { enum: ["HU", "UVV", "Service", "Weitere"] }).notNull(),
  name: text("name").notNull(),
  /** Abstand in Monaten. */
  monate: integer("monate").notNull(),
  /** Zusätzlich nach Kilometern: fällig, was zuerst erreicht ist. */
  kmAbstand: integer("km_abstand"),
  zuletzt: text("zuletzt"),
  /** Kilometerstand bei der letzten Erledigung; nur mit `kmAbstand` gesetzt. */
  zuletztKm: integer("zuletzt_km"),
  /** Von Hand gesetzter nächster Termin; schlägt „zuletzt + Abstand“. */
  vonHand: text("von_hand"),
  bemerkung: text("bemerkung").notNull().default(""),
  angelegtAm: integer("angelegt_am", { mode: "timestamp" }).notNull(),
}, (t) => [
  index("pruefung_stamm_idx").on(t.stammId),
  check("pruefung_art", sql`art IN ('HU','UVV','Service','Weitere')`),
]);

/** Ein Reifensatz eines Fahrzeugs — je Art höchstens einer. `dot` ist `WWJJ` (Herstellwoche und -jahr). */
export const reifensatz = sqliteTable("reifensatz", {
  id: text("id").primaryKey(),
  stammId: text("stamm_id").notNull().references(() => stammfahrzeug.id),
  art: text("art", { enum: ["Winter", "Sommer", "Ganzjahres"] }).notNull(),
  dot: text("dot").notNull(),
  /** Wo der Satz liegt, solange er nicht aufgezogen ist. Leer = nicht erfasst. */
  lager: text("lager").notNull().default(""),
}, (t) => [
  uniqueIndex("reifensatz_stamm_art_idx").on(t.stammId, t.art),
  check("reifensatz_art", sql`art IN ('Winter','Sommer','Ganzjahres')`),
  check("reifensatz_dot", sql`dot GLOB '[0-9][0-9][0-9][0-9]'`),
]);
