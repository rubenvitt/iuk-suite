import { sql } from "drizzle-orm";
import { blob, check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Datenbank des Moduls kommplan (Spec §4.1). 0000 legt Plan, Bibliothek und Freigaben an; 0001 `plan_bearbeitung` und
 * baut den Trigger `audit_plan_update` um (gebündeltes Audit, Phase 2); 0002 `briefkopf` (Phase 4); 0003 `eigenes_zeichen`;
 * 0004 `plan.erstellt_am`; 0005 Eigentum und Sichtbarkeit (`plan.eigentuemer`, `plan.sichtbarkeit`, `plan_mitglied`,
 * `kommplan_person`). Neues braucht eine Migration.
 * `plan_freigabe` statt `freigabe`: die Audit-Oberfläche benennt Objekte nur über den
 * Tabellennamen, und `freigabe` gehört dort dem Einsatzbuch.
 */
export { auditOutbox } from "@/core/audit/_db/schema";

export const plan = sqliteTable("plan", {
  id: text("id").primaryKey(),
  titel: text("titel").notNull(),
  typ: text("typ", { enum: ["kommunikationsplan", "fernmeldeskizze"] }).notNull(),
  anlass: text("anlass"),
  /** Kalendertag als Mitternacht UTC. */
  datum: integer("datum", { mode: "timestamp_ms" }),
  istVorlage: integer("ist_vorlage", { mode: "boolean" }).notNull().default(false),
  archiviertAm: integer("archiviert_am", { mode: "timestamp_ms" }),
  /**
   * Anlagezeitpunkt: entscheidet, ob ein Plan ohne Archiv gelöscht werden darf (`_lib/planverwaltung.ts`,
   * `loescheOhneArchiv`). NULL bei allem, was vor der Spalte angelegt wurde — „unbekannt" ist nie frisch.
   */
  erstelltAm: integer("erstellt_am", { mode: "timestamp_ms" }),
  /** Optimistisches Sperren: jedes Speichern zählt hoch (`_lib/speichern.ts`). */
  version: integer("version").notNull().default(1),
  /** Der gedruckte „Stand". */
  aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp_ms" }).notNull(),
  aktualisiertVon: text("aktualisiert_von").notNull(),
  /** PlanInhalt als JSON (`_lib/plan/schema.ts`). */
  inhalt: text("inhalt").notNull(),
  /**
   * Kennung (`sub`) der Person, die den Plan angelegt hat (`_lib/rechte.ts`). Leer nur beim Altbestand vor
   * Migration 0003 — der ist geteilt, und ihn verwalten die Modul-Admins.
   */
  eigentuemer: text("eigentuemer"),
  /** `privat`: nur der Eigentümer sieht ihn (Vorgabe beim Anlegen); `organisation`: alle mit Zugang. */
  sichtbarkeit: text("sichtbarkeit", { enum: ["privat", "organisation"] }).notNull().default("organisation"),
}, (t) => [
  check("plan_typ_check", sql`${t.typ} IN ('kommunikationsplan','fernmeldeskizze')`),
  check("plan_sichtbarkeit_check", sql`${t.sichtbarkeit} IN ('privat','organisation')`),
  check("plan_privat_hat_eigentuemer", sql`${t.sichtbarkeit} <> 'privat' OR ${t.eigentuemer} IS NOT NULL`),
  check("plan_inhalt_json", sql`json_valid(${t.inhalt})`),
  check("plan_version_positiv", sql`${t.version} >= 1`),
  index("plan_liste_idx").on(t.archiviertAm, t.aktualisiertAm),
  index("plan_eigentuemer_idx").on(t.eigentuemer),
]);

/**
 * GEBÜNDELTES AUDIT DER INHALTSÄNDERUNGEN (Umsetzungsplan Phase 2, Entscheidung 1). `plan.inhalt`,
 * `version` und `aktualisiert_*` stehen im Audit-Katalog als `unauditedColumns` — sonst schriebe
 * jedes Autosave eine Zeile. Stattdessen hält diese Tabelle je Plan und Person den Beginn des
 * laufenden 15-Minuten-Fensters: Anlegen und jedes Weiterspringen von `seit` sind je EINE
 * Audit-Zeile, alles dazwischen keine (`_lib/speichern.ts`, `merkeBearbeitung`).
 */
export const planBearbeitung = sqliteTable("plan_bearbeitung", {
  planId: text("plan_id").notNull().references(() => plan.id),
  /** Kennung der Person (`auditActor(viewer).id`), nicht der Anzeigename. */
  nutzer: text("nutzer").notNull(),
  seit: integer("seit", { mode: "timestamp_ms" }).notNull(),
}, (t) => [primaryKey({ columns: [t.planId, t.nutzer] })]);

/**
 * EINGELADENE BEARBEITENDE eines geteilten Plans (`_lib/mitglieder.ts`): je Zeile darf diese Person den Plan
 * bearbeiten, zusätzlich zu Eigentümer und Modul-Admins. Ansehen dürfen ihn ohnehin alle mit Zugang. `name` ist
 * der Anzeigename beim Einladen — die Kennung entscheidet, der Name steht nur in der Liste.
 */
export const planMitglied = sqliteTable("plan_mitglied", {
  planId: text("plan_id").notNull().references(() => plan.id),
  nutzer: text("nutzer").notNull(),
  name: text("name").notNull(),
  eingeladenAm: integer("eingeladen_am", { mode: "timestamp_ms" }).notNull(),
  eingeladenVon: text("eingeladen_von").notNull(),
}, (t) => [primaryKey({ columns: [t.planId, t.nutzer] }), index("plan_mitglied_nutzer_idx").on(t.nutzer)]);

/**
 * BEKANNTE PERSONEN (Vorbild `feedback.known_users`): wer das Modul mit Zugang geöffnet hat, mit Anzeigenamen —
 * die Quelle der Einladungs-Suche, wenn das Personenverzeichnis fehlt, und der Beleg, dass jemand das Modul
 * überhaupt öffnen kann. Ein Namens-Cache, keine Rechte; im Audit-Katalog ausgenommen.
 */
export const kommplanPerson = sqliteTable("kommplan_person", {
  nutzer: text("nutzer").primaryKey(),
  name: text("name").notNull(),
});

export const bibStelle = sqliteTable("bib_stelle", {
  id: text("id").primaryKey(),
  titel: text("titel").notNull(),
  zeichen: text("zeichen"),
  leiter: text("leiter"),
  kontakte: text("kontakte").notNull().default("[]"),
  notiz: text("notiz"),
}, (t) => [check("bib_stelle_kontakte_json", sql`json_valid(${t.kontakte})`)]);

export const bibEinheit = sqliteTable("bib_einheit", {
  id: text("id").primaryKey(),
  typ: text("typ").notNull(),
  rufname: text("rufname").notNull(),
  zeichen: text("zeichen"),
  notiz: text("notiz"),
});

export const bibVerbindung = sqliteTable("bib_verbindung", {
  id: text("id").primaryKey(),
  art: text("art").notNull(),
  bezeichnung: text("bezeichnung").notNull(),
  notiz: text("notiz"),
}, (t) => [check("bib_verbindung_art_check", sql`${t.art} IN ('tmo','dmo','analogfunk','draht','telefon','mobil','fax','daten')`)]);

/**
 * EIGENE ZEICHEN aus dem Baukasten (Bibliothek, Reiter „Zeichen"). Gespeichert wird NUR die Zusammenstellung
 * (`spec`, kanonisch aus `parseSpec`), nie ein Bild: gezeichnet wird bei jedem Abruf auf dem Server
 * (`_lib/zeichen/eigen/zeichne.ts`). Pläne verweisen per `eigen:<id>` — eine Änderung hier ändert jeden Plan.
 */
export const eigenesZeichen = sqliteTable("eigenes_zeichen", {
  id: text("id").primaryKey(),
  titel: text("titel").notNull(),
  spec: text("spec").notNull(),
  aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp_ms" }).notNull(),
  aktualisiertVon: text("aktualisiert_von").notNull(),
}, (t) => [
  check("eigenes_zeichen_spec_json", sql`json_valid(${t.spec}) AND length(${t.spec}) <= 4000`),
]);
export type EigenesZeichenZeile = typeof eigenesZeichen.$inferSelect;

export const planFreigabe = sqliteTable("plan_freigabe", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => plan.id),
  /** Klartext (Spec §8.2): der Link muss sich jederzeit wieder kopieren lassen. */
  token: text("token").notNull(),
  notiz: text("notiz"),
  /** null = unbegrenzt. */
  ablauf: integer("ablauf", { mode: "timestamp_ms" }),
  widerrufenAm: integer("widerrufen_am", { mode: "timestamp_ms" }),
  erstelltAm: integer("erstellt_am", { mode: "timestamp_ms" }).notNull(),
  erstelltVon: text("erstellt_von").notNull(),
  zuletztAbgerufen: integer("zuletzt_abgerufen", { mode: "timestamp_ms" }),
  abrufe: integer("abrufe").notNull().default(0),
}, (t) => [uniqueIndex("plan_freigabe_token_idx").on(t.token), index("plan_freigabe_plan_idx").on(t.planId)]);

/**
 * BRIEFKOPF (Spec §4.4; Umsetzungsplan Phase 4, Entscheidung 2): Organisationsname und Logo stehen nicht im
 * Code (A10), sondern genau hier — eine Zeile, erzwungen über `id = 1`. Ohne Zeile oder mit leeren Feldern
 * bleibt die Stelle im Kopf der Zeichnung leer. Das Logo ist schon geprüft, gescannt und (SVG) bereinigt,
 * wenn es hier ankommt (`_lib/briefkopf.ts`, `speichereLogo`). Alle Spalten sind auditiert, auch der Blob.
 */
export const briefkopf = sqliteTable("briefkopf", {
  id: integer("id").primaryKey(),
  organisation: text("organisation"),
  logo: blob("logo", { mode: "buffer" }),
  logoMime: text("logo_mime"),
  logoSha256: text("logo_sha256"),
  aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp_ms" }).notNull(),
  aktualisiertVon: text("aktualisiert_von").notNull(),
}, (t) => [
  check("briefkopf_eine_zeile", sql`${t.id} = 1`),
  check("briefkopf_logo_vollstaendig", sql`(${t.logo} IS NULL AND ${t.logoMime} IS NULL AND ${t.logoSha256} IS NULL) OR (${t.logo} IS NOT NULL AND ${t.logoMime} IN ('image/png','image/jpeg','image/webp','image/svg+xml') AND ${t.logoSha256} IS NOT NULL)`),
  check("briefkopf_logo_groesse", sql`${t.logo} IS NULL OR length(${t.logo}) <= 1048576`),
]);
export type BriefkopfZeile = typeof briefkopf.$inferSelect;

export type PlanZeile = typeof plan.$inferSelect;
export type PlanMitgliedZeile = typeof planMitglied.$inferSelect;
export type NeuePlanZeile = typeof plan.$inferInsert;
