/**
 * Datenbank des Moduls lagemonitor: wie der Lagemonitor im FüKw aussieht (eine Zeile) und wer seine
 * Einstellungen abholen darf. Der Lagemonitor holt sie über `api/konfiguration` ab und hält den
 * letzten Stand selbst (Repo `lagemonitor`, Spec 4.4) — diese Datenbank ist die Verwaltung, nicht
 * die Laufzeit.
 */
export { auditOutbox } from "@/core/audit/_db/schema";
import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Die Anzeige — genau eine Zeile (`id = 'anzeige'`). Spaltennamen deutsch, das Drahtformat zum
 * Lagemonitor englisch (`_lib/konfiguration.ts`, `alsVertrag`).
 */
export const anzeige = sqliteTable("lagemonitor_anzeige", {
  id: text("id").primaryKey(),
  /** Zoomstufe der Karte ohne Einsatz, um den eigenen Standort (maplibre; 9 zeigt etwa einen Landkreis). */
  kartenZoom: real("karten_zoom").notNull().default(9),
  /** Amtlicher Regionalschlüssel (12 Ziffern) für die NINA-Warnungen. */
  regionArs: text("region_ars").notNull(),
  regionName: text("region_name").notNull(),
  /** Ab dieser Schwere bekommt eine Warnung das Band: `Minor`, `Moderate`, `Severe`, `Extreme`. */
  warnschwelle: text("warnschwelle").notNull(),
  wetter: integer("wetter", { mode: "boolean" }).notNull(),
  radar: integer("radar", { mode: "boolean" }).notNull(),
  warngebiete: integer("warngebiete", { mode: "boolean" }).notNull(),
  warnliste: integer("warnliste", { mode: "boolean" }).notNull(),
  suchlage: integer("suchlage", { mode: "boolean" }).notNull(),
  /** Ursprung der Suchlage-Instanz, z. B. `https://suchlage.iuk-ue.de`. */
  suchlageAdresse: text("suchlage_adresse"),
  /** Großbild-Token aus Suchlage. Geht nur an den Lagemonitor, nie an den Browser. */
  suchlageToken: text("suchlage_token"),
  suchlageFlugspuren: integer("suchlage_flugspuren", { mode: "boolean" }).notNull(),
  suchlageGebiete: integer("suchlage_gebiete", { mode: "boolean" }).notNull(),
  suchlageDrohnenbild: integer("suchlage_drohnenbild", { mode: "boolean" }).notNull(),
  /** QR-Code fürs Ehrenamt (Werbung für die Bereitschaft); Vorgabe aus. */
  mitmachen: integer("mitmachen", { mode: "boolean" }).notNull().default(false),
  /** Wohin der QR-Code führt, etwa die Mitmach-Seite des Ortsvereins. */
  mitmachenAdresse: text("mitmachen_adresse"),
  mitmachenText: text("mitmachen_text"),
  /** API-Schlüssel von TomTom. Geht nur an den Lagemonitor, nie an den Browser (wie `suchlageToken`). */
  tomtomSchluessel: text("tomtom_schluessel"),
  /** Verkehrsfluss (Auslastung der Straßen) von TomTom; braucht den Schlüssel. */
  verkehrFluss: integer("verkehr_fluss", { mode: "boolean" }).notNull().default(false),
  /** Baustellen und Sperrungen von TomTom; braucht den Schlüssel. */
  verkehrBaustellen: integer("verkehr_baustellen", { mode: "boolean" }).notNull().default(false),
  /** Feste Blitzer aus OpenStreetMap; zeigt nur der Online-Monitor, nie der im FüKw. */
  verkehrBlitzer: integer("verkehr_blitzer", { mode: "boolean" }).notNull().default(false),
  aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp" }).notNull(),
  aktualisiertVon: text("aktualisiert_von").notNull(),
}, () => [
  check("lagemonitor_anzeige_einzeln", sql`id = 'anzeige'`),
  check("lagemonitor_anzeige_warnschwelle", sql`warnschwelle IN ('Minor','Moderate','Severe','Extreme')`),
]);

/**
 * Ein Zugang, mit dem ein Lagemonitor die Einstellungen abholt. Gespeichert ist nur der SHA-256 des
 * Schlüssels; den Schlüssel selbst zeigt die Verwaltung genau einmal.
 */
export const zugang = sqliteTable("lagemonitor_zugang", {
  id: text("id").primaryKey(),
  bezeichnung: text("bezeichnung").notNull(),
  schluesselHash: text("schluessel_hash").notNull(),
  angelegtAm: integer("angelegt_am", { mode: "timestamp" }).notNull(),
  angelegtVon: text("angelegt_von").notNull(),
  /** Letzte erfolgreiche Abholung; technischer Kontakt, nicht im Audit (`AUDIT_TABLES.lagemonitor`). */
  zuletztAbgeholtAm: integer("zuletzt_abgeholt_am", { mode: "timestamp" }),
  /**
   * Der Standort dieses Monitors (`_lib/standort.ts`). Meldet über den Zugang ein Fahrzeug (`fahrzeug.zugangId`),
   * gilt dessen GPS, und der Ort hier ist nur der Name und der Ort bis zum ersten Fix. Sonst ist er ein fester Ort
   * und steht mit `ortZeichen` auf allen Monitoren. `null`: noch nicht eingestellt.
   */
  ortName: text("ort_name"),
  ortBreite: real("ort_breite"),
  ortLaenge: real("ort_laenge"),
  /** Taktisches Zeichen eines festen Orts (Schlüssel aus kommplan, wie `fahrzeug.zeichen`). */
  ortZeichen: text("ort_zeichen"),
}, (t) => [uniqueIndex("lagemonitor_zugang_schluessel_idx").on(t.schluesselHash)]);

/**
 * Ein Link, mit dem ein Rechner den Online-Lagemonitor ohne Anmeldung sieht, etwa „Rechner Wache“.
 * Wie beim Zugang steht nur der SHA-256 des Schlüssels hier; der Lagemonitor bekommt ihn mit der
 * Konfiguration (`publicLinks`) und lässt Rechner mit diesem Link ein, bis er widerrufen ist.
 */
export const link = sqliteTable("lagemonitor_link", {
  id: text("id").primaryKey(),
  bezeichnung: text("bezeichnung").notNull(),
  schluesselHash: text("schluessel_hash").notNull(),
  angelegtAm: integer("angelegt_am", { mode: "timestamp" }).notNull(),
  angelegtVon: text("angelegt_von").notNull(),
}, (t) => [uniqueIndex("lagemonitor_link_schluessel_idx").on(t.schluesselHash)]);

/**
 * Eine Meldung, die der Lagemonitor als Band zeigt, etwa „Nächste Lagebesprechung“. Jede Meldung hat
 * ein Ablaufdatum (Vorgabe 24 Stunden): ohne Ablauf stünde ein vergessener Hinweis für immer am
 * Bildschirm. „Beenden“ setzt `ablaufAm` auf jetzt; die Zeile bleibt für das Audit stehen.
 */
export const meldung = sqliteTable("lagemonitor_meldung", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  /** Die Kategorie (`kategorie`); `null` bei Meldungen von vor den Kategorien oder nach dem Löschen der Kategorie. */
  kategorieId: text("kategorie_id").references(() => kategorie.id, { onDelete: "set null" }),
  /** Optional: ein Zeitpunkt, bis zu dem der Monitor herunterzählt („in 12 min“). */
  zeitpunkt: integer("zeitpunkt", { mode: "timestamp" }),
  /** Optional: ab wann der Monitor sie zeigt (geplante Meldung); `null` ab dem Anlegen. Die Laufzeit zählt ab hier. */
  anzeigenAb: integer("anzeigen_ab", { mode: "timestamp" }),
  ablaufAm: integer("ablauf_am", { mode: "timestamp" }).notNull(),
  angelegtAm: integer("angelegt_am", { mode: "timestamp" }).notNull(),
  angelegtVon: text("angelegt_von").notNull(),
});

/**
 * Eine Kategorie fürs Meldungsband, etwa „Lagemeldung“ oder „Besprechung“: Name, Zeichen aus dem
 * Icons8-Katalog der Suite, Farbe aus einer festen Palette (`_lib/kategorieRegeln.ts`, damit Tag- und
 * Nachtmodus am Monitor lesbar bleiben) und wie viele Minuten vor der Countdown-Uhrzeit die Meldung
 * blinkt. Die Vorgaben legt `0006_kategorien.sql` an.
 */
export const kategorie = sqliteTable("lagemonitor_kategorie", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  zeichen: text("zeichen").notNull(),
  farbe: text("farbe").notNull(),
  /** Minuten vor der Countdown-Uhrzeit, ab denen die Meldung blinkt; `null` blinkt nie. */
  vorlaufMinuten: integer("vorlauf_minuten"),
  /** Minuten nach der Countdown-Uhrzeit, nach denen die Meldung verschwindet; `null` bleibt bis zum Ablauf. */
  verschwindenMinuten: integer("verschwinden_minuten"),
  reihenfolge: integer("reihenfolge").notNull(),
  angelegtAm: integer("angelegt_am", { mode: "timestamp" }).notNull(),
});

/**
 * Ein Fahrzeug auf der Karte aller Lagemonitore (LGM-10). Name und Funkrufname kommen aus der Fahrzeugverwaltung
 * (`stammId`, `fahrzeuge/_lib/bereitstellung.ts`), das Zeichen aus kommplan (`zeichen`, `kommplan/_lib/bereitstellung.ts`).
 * Meldet ein Monitor mit `zugangId`, ist das die Position dieses Fahrzeugs. Je Fahrzeug steht nur die letzte Position:
 * kein Verlauf, und die drei Positionsspalten stehen nicht im Audit (sonst wäre das Audit das Bewegungsprofil).
 */
export const fahrzeug = sqliteTable("lagemonitor_fahrzeug", {
  id: text("id").primaryKey(),
  stammId: text("stamm_id").notNull(),
  zeichen: text("zeichen").notNull(),
  zugangId: text("zugang_id").references(() => zugang.id, { onDelete: "set null" }),
  breite: real("breite"),
  laenge: real("laenge"),
  /** Wann der Fix entstand (Abholzeit minus gemeldetes Alter), nicht wann er ankam. */
  gemeldetAm: integer("gemeldet_am", { mode: "timestamp" }),
  angelegtAm: integer("angelegt_am", { mode: "timestamp" }).notNull(),
  angelegtVon: text("angelegt_von").notNull(),
}, (t) => [
  uniqueIndex("lagemonitor_fahrzeug_stamm_idx").on(t.stammId),
  uniqueIndex("lagemonitor_fahrzeug_zugang_idx").on(t.zugangId),
]);

/**
 * Ein festes Objekt auf der Karte aller Lagemonitore (IDA-348, `_lib/lagekarte.ts`): ein Punkt mit taktischem Zeichen
 * aus kommplan (`zeichen`, `breite`, `laenge`) oder eine Fläche mit Palettenfarbe (`farbe`, `ring`: die Ecken als
 * JSON `[[Länge, Breite], …]`, offen). Nur Objekte mit `aufKarte` gehen an die Monitore (`mapObjects`).
 */
export const kartenobjekt = sqliteTable("lagemonitor_kartenobjekt", {
  id: text("id").primaryKey(),
  art: text("art").notNull(),
  name: text("name").notNull(),
  zeichen: text("zeichen"),
  farbe: text("farbe"),
  breite: real("breite"),
  laenge: real("laenge"),
  ring: text("ring"),
  aufKarte: integer("auf_karte", { mode: "boolean" }).notNull().default(true),
  angelegtAm: integer("angelegt_am", { mode: "timestamp" }).notNull(),
  angelegtVon: text("angelegt_von").notNull(),
  geaendertAm: integer("geaendert_am", { mode: "timestamp" }).notNull(),
  geaendertVon: text("geaendert_von").notNull(),
}, () => [check("lagemonitor_kartenobjekt_art", sql`art IN ('punkt','flaeche')`)]);
