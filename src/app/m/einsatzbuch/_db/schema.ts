/**
 * Datenbank des Moduls einsatzbuch. Stufe 1 trug nur die Audit-Outbox; mit Stufe 2 kamen
 * die Stammdaten (`fahrzeug`, `person`, `stichwort`), `einstellung` und das Schlüsselpaar
 * dazu. Mit Stufe 5 kommen Rechner, Anker, Einmalcodes, Sitzungen und Freigaben dazu (Spec §5.1, §12).
 * Die Einsätze selbst liegen NIE hier, sondern auf dem Einsatzbuch-Rechner.
 */
export { auditOutbox } from "@/core/audit/_db/schema";
import { sql } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
 * Der Fremdschlüssel auf `rechner` ist eine Konsistenzregel per Trigger (Stufe 5, kein FK:
 * Neuaufbau der Tabelle müsste sonst alle Audit-Trigger neu anlegen). `privatVerschluesselt` ist
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
/**
 * Der Einsatzbuch-Rechner der App (Spec §5.1, §12): höchstens ein aktiver echter Rechner
 * (`rechner_echt_aktiv`, Teilindex ohne `widerrufen_am`), daneben beliebig viele Test-Rechner.
 * `letzterKontakt`/`letzteSicherung` sind reine Kontaktzeiten; ein Update, das nur sie ändert,
 * bleibt unauditiert (`AUDIT_TABLES.einsatzbuch.rechner.unauditedColumns`).
 */
export const rechner = sqliteTable("rechner", {
  id: text("id").primaryKey(),
  art: text("art", { enum: ["echt", "test"] }).notNull(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  eingerichtetAm: integer("eingerichtet_am", { mode: "timestamp" }).notNull(),
  eingerichtetVon: text("eingerichtet_von").notNull(),
  eingerichtetVonSub: text("eingerichtet_von_sub").notNull(),
  letzterKontakt: integer("letzter_kontakt", { mode: "timestamp" }),
  letzteSicherung: text("letzte_sicherung"),
  widerrufenAm: integer("widerrufen_am", { mode: "timestamp" }),
}, (t) => [
  uniqueIndex("rechner_echt_aktiv").on(t.art).where(sql`art = 'echt' AND widerrufen_am IS NULL`),
  check("rechner_art", sql`art IN ('echt','test')`),
]);
/** Bestätigte Blockhashes je Rechner (Spec §12); PK (rechnerId, block). Kein Audit: reine Meldungen. */
export const anker = sqliteTable("anker", {
  rechnerId: text("rechner_id").notNull().references(() => rechner.id, { onDelete: "cascade" }),
  block: integer("block").notNull(),
  hash: text("hash").notNull(),
  gemeldetAm: integer("gemeldet_am", { mode: "timestamp" }).notNull(),
}, (t) => [primaryKey({ columns: [t.rechnerId, t.block] })]);
/** Erkannte Anker-Abweichungen je Rechner (Spec §12); auditiert. */
export const ankerAbweichung = sqliteTable("anker_abweichung", {
  id: text("id").primaryKey(),
  rechnerId: text("rechner_id").notNull().references(() => rechner.id, { onDelete: "cascade" }),
  block: integer("block").notNull(),
  erwartet: text("erwartet").notNull(),
  gemeldet: text("gemeldet").notNull(),
  zeitpunkt: integer("zeitpunkt", { mode: "timestamp" }).notNull(),
});
/** Einmalcode der Anmeldung (Spec §5.1); kurzlebig, kein Audit — die Sitzung ist nachvollziehbar. */
export const einmalcode = sqliteTable("einmalcode", {
  codeHash: text("code_hash").primaryKey(),
  challenge: text("challenge").notNull(),
  sub: text("sub").notNull(),
  name: text("name").notNull(),
  ablauf: integer("ablauf", { mode: "timestamp" }).notNull(),
  eingeloestAm: integer("eingeloest_am", { mode: "timestamp" }),
  einrichtungArt: text("einrichtung_art", { enum: ["echt", "test"] }),
  rechnerName: text("rechner_name"),
  ersetzen: integer("ersetzen", { mode: "boolean" }).notNull().default(false),
}, () => [
  check("einmalcode_einrichtung_art", sql`einrichtung_art IS NULL OR einrichtung_art IN ('echt','test')`),
]);
/** Verwaltungssitzung der App (Spec §5.1, §12); technisch (30 min), kein Audit — jede Freigabe steht in `freigabe`. */
export const sitzung = sqliteTable("sitzung", {
  tokenHash: text("token_hash").primaryKey(),
  sub: text("sub").notNull(),
  name: text("name").notNull(),
  ablauf: integer("ablauf", { mode: "timestamp" }).notNull(),
  rechnerId: text("rechner_id").references(() => rechner.id, { onDelete: "cascade" }),
  einrichtungArt: text("einrichtung_art", { enum: ["echt", "test"] }),
  rechnerName: text("rechner_name"),
  ersetzen: integer("ersetzen", { mode: "boolean" }).notNull().default(false),
  eingerichtet: integer("eingerichtet", { mode: "boolean" }).notNull().default(false),
}, () => [
  check("sitzung_einrichtung_art", sql`einrichtung_art IS NULL OR einrichtung_art IN ('echt','test')`),
]);
/** Protokoll jeder Schlüsselfreigabe (Spec §12, Entscheidung 4); auditiert, ohne FK — überlebt das Löschen des Rechners. */
export const freigabe = sqliteTable("freigabe", {
  id: text("id").primaryKey(),
  zeitpunkt: integer("zeitpunkt", { mode: "timestamp" }).notNull(),
  sub: text("sub").notNull(),
  name: text("name").notNull(),
  art: text("art", { enum: ["echt", "test"] }).notNull(),
  rechnerId: text("rechner_id").notNull(),
  rechnerName: text("rechner_name").notNull(),
  bloecke: text("bloecke").notNull(),
  anzahl: integer("anzahl").notNull(),
}, () => [
  check("freigabe_art", sql`art IN ('echt','test')`),
]);
