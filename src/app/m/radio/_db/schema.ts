// src/app/m/radio/_db/schema.ts
// KEIN "use client" (Falle 6): diese Datei wird ausschliesslich serverseitig gelesen.
//
// DIE SQL-SPALTENNAMEN SIND ZEICHENGLEICH ZUR QUELLE, und die TypeScript-Bezeichner
// bleiben ebenfalls die der Quelle (`snapshotCallSign`, `issi`, `loanable`), obwohl die
// juengeren Suite-Module deutsch benennen: der Importer ordnet 61 Spalten zu, und jede
// Umbenennung ist eine Verwechslungsgelegenheit, die kein Gate sieht
// (docs/radio-portierung-analyse.md:743-747 listet die vier verwechselbaren Paare).
// Die NEUE Tabelle `zugangscodes` ist deutsch benannt — sie hat keine Quelle, die sie bindet.
//
// IDs: bestehende Primaerschluessel wandern zeichengleich (cuid2 aus
// radio-admin/server/src/db/id.ts). Fuer NEUE Zeilen erzeugt die Suite `nanoid()` —
// Praezedenz: src/app/m/portal/_db/schema.ts:2 und src/app/m/aufgaben/_db/schema.ts:2.
// Beide Kennungsraeume koexistieren als Primaerschluessel derselben Tabelle; dieselbe
// Begruendung traegt in src/app/m/lagerbuch/_db/schema.ts:428-430.
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey().$defaultFn(nanoid),
  rufname: text("rufname"),
  issi: text("issi").notNull().unique(),
  // TEI = die im Geraet gebrannte Hardware-Identitaet, im Gegensatz zur umprogrammierbaren
  // issi. Optional und AUSDRUECKLICH NICHT unique: Geraete ohne erfasste TEI sind der
  // Normalfall (radio-admin/server/src/db/schema.ts:8-11). Ein `unique()` hier bricht den
  // Import beim zweiten NULL-freien Duplikat und ist fachlich falsch.
  tei: text("tei"),
  serialNumber: text("serial_number"),
  deviceType: text("device_type"),
  status: text("status"),
  location: text("location"),
  assignedTo: text("assigned_to"),
  softwareVersion: text("software_version"),
  // KALENDERDATUM `YYYY-MM-DD`, kein Zeitstempel (§2.2.3). Die Quelle fuehrt hier
  // epoch-ms mit DREI widerspruechlichen Zeitzonen-Semantiken (CSV-Import: UTC-Mitternacht ·
  // Formular: lokale Mitternacht · Update-Karte: echte Uhrzeit); der Import kuerzt in
  // Europe/Berlin, weil das fuer alle drei richtig ist und eine UTC-Kuerzung nur fuer einen.
  // Wer einen DatePicker an einen `number` bindet, hat den Zeitzonenkonflikt zurueckgeholt.
  lastUpdatedAt: text("last_updated_at"),
  notes: text("notes"),
  // Kundenstammdaten, alle nullable.
  hiorgId: text("hiorg_id"),
  opta: text("opta"),
  funktion: text("funktion"),
  hersteller: text("hersteller"),
  bedieneinheit: text("bedieneinheit"),
  // Klartext, komma-verbundene Teilmenge von DEVICE_MODES, z. B. "TMO,DMO". KEINE
  // Normalisierung beim Import — der Wert wird an einer Stelle gelesen und gesplittet.
  deviceModes: text("device_modes"),
  alamosIntegrated: integer("alamos_integrated", { mode: "boolean" }),
  // STAMMDATUM. Entscheidet, ob das Geraet ausleihbar ist, und war in radio-admin nie in
  // UPDATER_EDITABLE_FIELDS (radio-admin/server/src/db/schema.ts:30-32).
  // ⚠️ `alamos_integrated` und `loanable` sind zwei 0/1-Integer, die sich verwechseln
  // lassen, ohne dass es auffaellt. Der Mapper liest sie namentlich, nie positionell.
  loanable: integer("loanable", { mode: "boolean" }),
  // APPEND-ONLY Update-Anmerkung, getrennt von `notes`: der Update-Weg haengt an, er
  // ueberschreibt nie (radio-admin/server/src/db/schema.ts:33-36). ⚠️ Genau diese Spalte
  // walzt ein `onConflictDoUpdate` beim Zweitimport platt (§2.8.4).
  updateNote: text("update_note"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  // OIDC-`sub`, OHNE FK auf users.sub (§2.3).
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const softwareVersions = sqliteTable("software_versions", {
  id: text("id").primaryKey().$defaultFn(nanoid),
  value: text("value").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  /**
   * TOTE SPALTE, WANDERT TROTZDEM. Geschrieben an zwei Stellen
   * (radio-admin/server/src/repos/softwareVersionRepo.ts:39, :53), in KEINER Projektion
   * selektiert (`listSoftwareVersions` :141-148, `getTargetVersion` :65). Es gibt also
   * Werte, und eine weggelassene Spalte macht einen vorhandenen Wert unwiederbringlich —
   * der Import hat keinen zweiten Versuch (dieselbe Begruendung wie
   * src/app/m/lagerbuch/_db/schema.ts:386-395). Es wird KEIN Leser gebaut.
   */
  createdBy: text("created_by"),
  // Reine Anzeigereihenfolge. Leitet den Ziel-Stand AUSDRUECKLICH NICHT ab: eine neu
  // erfasste Version, die oben landet, wird nie automatisch Ziel
  // (radio-admin/server/src/db/schema.ts:48-51).
  sortOrder: integer("sort_order").notNull().default(0),
  // Der Update-Stand eines Geraets ist BERECHNET, nicht gespeichert, und haengt allein an
  // dieser Marke. Genau EINE Zeile darf sie tragen — und es gibt KEINEN DB-Constraint dafuer
  // (§2.6, bewusst: ein partieller Index verwandelte das Setzen der Marke von einer
  // Zweischritt-Transaktion in einen Konflikt und braeche den bestehenden Schreibweg).
  // Der Leser `getTargetVersion` hat kein ORDER BY
  // (radio-admin/server/src/repos/softwareVersionRepo.ts:63-70): bei zwei Marken entscheidet
  // die Reihenfolge, in der SQLite zufaellig liefert, ueber den angezeigten Stand JEDES
  // Geraets. Ersatz ist Abfrage 2 aus §2.8.3, und sie ist BLOCKIEREND.
  isTarget: integer("is_target", { mode: "boolean" }).notNull().default(false),
});

/**
 * Reine Nachschlagetabelle fuer die ANZEIGE: sechs Auditspalten speichern die stabile
 * OIDC-Identitaet `sub` (devices.created_by/updated_by, device_events.changed_by,
 * software_versions.created_by), und ohne diese Tabelle rendert jede Auditzeile und jedes
 * Geraeteereignis eine nackte UUID.
 *
 * `sub` IST der Primaerschluessel und wird ROH gefuehrt — radio-admin schreibt ihn schon
 * roh (radio-admin/server/src/db/schema.ts:79). Der Praefix `pocketid:` ist ein Artefakt des
 * KIOSK (radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134) und
 * kommt hier nie an.
 *
 * KEINE Zuordnungstabelle alt_sub → neu_sub: die Pocket-ID-Instanz fuehrt
 * `subject_types_supported: ["public"]` (gemessen, src/app/m/lagerbuch/_db/schema.ts:431-432),
 * der `sub` ist also ueber beide OIDC-Clients identisch.
 *
 * ⚠️ `select count(*) from users` ist KEINE Personenzahl und gehoert in keine Oberflaeche,
 * die eine Personenzahl anzeigen will.
 */
export const users = sqliteTable("users", {
  sub: text("sub").primaryKey(),
  name: text("name").notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
});

export const deviceEvents = sqliteTable(
  "device_events",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    // DER EINZIGE FK AUF EINE AUSMUSTERBARE TABELLE, und er MUSS ein Cascade-FK bleiben
    // (radio-admin/server/src/db/schema.ts:88-90). `foreign_keys = ON` ist gesetzt
    // (src/core/db/index.ts:19) — ein Ereignis-Insert vor dem passenden Geraet bricht hart
    // ab, und damit ist die Einfuegereihenfolge des Importers (§2.8.2) Pflicht, nicht Stil.
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedBy: text("changed_by"),
    changedAt: integer("changed_at", { mode: "timestamp" }).notNull(),
    // Drizzle-Enum OHNE DB-CHECK — in SQL steht nur `text NOT NULL`. Die Datenbank
    // akzeptiert JEDEN String; ein fuenfter Wert passiert Datenbank und Typpruefung
    // unbeanstandet und bricht erst in einem erschoepfenden Switch der Oberflaeche.
    // Der Importer prueft (§2.2.4), die DB tut es nicht.
    source: text("source", {
      enum: ["manual", "csv-import", "create", "update-note"],
    }).notNull(),
  },
  (t) => [index("device_events_device_id_idx").on(t.deviceId)],
);

/**
 * Der dauerhafte, sperrbare Ausleih-Zugang (Entscheidung 6). Vorbild in Bauform und
 * Begruendung: src/app/m/lagerbuch/_db/schema.ts:376-415.
 *
 * NICHT LOESCHBAR — und der Grund ist kein Ordnungsargument: ein geloeschter Code kann an
 * ein spaeter ausgestelltes Kaertchen zurueckfallen, und danach erscheinen HISTORISCHE
 * Zeilen unter dem neuen Label. Durchgesetzt durch Abwesenheit jedes Loeschwegs plus den
 * Quelltext-Scan in _db/append.test.ts (§2.4).
 *
 * ⚠️ STEHT VOR `loans`, abweichend von der Reihenfolge in §2.5: `loans.zugangscodeId`
 * verweist auf `zugangscodes.id`. Der Verweis ist ein Thunk und funktionierte auch
 * umgekehrt — die Deklaration vor der Benutzung liest sich richtig und haelt
 * `no-use-before-define` fern. Am Schema aendert die Reihenfolge nichts.
 */
export const zugangscodes = sqliteTable("zugangscodes", {
  // Steckt im Sitzungs-Cookie JEDER laufenden Ausleih-Sitzung — nicht neu vergeben.
  // Der Riegel schlaegt bei jedem Aufruf hierueber nach, nicht ueber `code`; nur so muss
  // das Klartext-Geheimnis nicht im Cookie stehen
  // (src/app/m/lagerbuch/_lib/helferZugang.ts:29-31 ist die Bauform).
  id: text("id").primaryKey().$defaultFn(nanoid),
  // ZUGLEICH QR-Nutzlast UND Gate-Eingabe. Zeichengleich gespeichert, nie normalisiert,
  // nie umkodiert — gedruckte Kaertchen sind sonst ungueltig. KEIN `COLLATE NOCASE`:
  // eine unempfindliche Eingabe normalisiert die EINGABE, nicht die Spalte.
  // Laenge und Alphabet entscheidet Kapitel 3 (§3.2.1: 28 Zeichen Crockford-Base32 in
  // sieben Vierergruppen, Bindestrich TEIL des Werts); das Schema schreibt kein Format vor.
  code: text("code").notNull().unique(),
  // Der Anzeigename in der Verwaltung — der Code allein sagt niemandem etwas
  // ("Aufsteller Fahrzeughalle", nicht "418-207").
  // ⚠️ HEISST `bezeichnung`, NICHT `label` (B6): der Name traegt in Kapitel 3 Schema,
  // Action-Signatur `erstelleCode(bezeichnung)`, Laufzeittyp `AusleihZugang` und die Zusage
  // an Kapitel 5. `label` stand in §2.4 an EINER Stelle und ist ueberholt.
  bezeichnung: text("bezeichnung").notNull(),
  // DER EINZIGE WIDERRUF, DEN ES GIBT. Ein Import oder ein Seed, der alles als aktiv
  // anlegt, reaktiviert still jeden gesperrten Code — und zwar genau die, die gesperrt
  // wurden, weil ein Kaertchen verschwunden ist.
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  // Nur von der Sperr-Action geschrieben. Sie existieren, WEIL die Zeile dauerhaft in der
  // Liste steht und erklaeren muss, warum sie tot ist; `aktiv = false` allein verlangte vom
  // Betreiber, sich das zu merken.
  gesperrtAm: integer("gesperrt_am", { mode: "timestamp" }),
  gesperrtVon: text("gesperrt_von"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // OIDC-`sub` des ausstellenden radio-admins (Entscheidung 7). Reines Auditfeld.
  createdBy: text("created_by").notNull(),
  // NULL = "nie eingeloest". REINE ANZEIGE, ohne Einfluss auf Gueltigkeit
  // (src/app/m/lagerbuch/_db/schema.ts:412-414).
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});
// KEIN Index auf `aktiv`. Die Verwaltungsliste ist die einzige Abfrage ueber diese Spalte,
// und die Tabelle liegt in der Groessenordnung "Zahl der Aufsteller" — ein Index kostet
// hier mehr Schreibarbeit als er an Lesezeit einspart. Der Riegel liest ueber den PK.

/**
 * Ausleihen. `returned_at IS NULL` heisst "aktive Leihe".
 *
 * `device_id` ist ABSICHTLICH KEIN Fremdschluessel (§2.3, Wortlaut der Quelle in
 * radio-admin/server/src/db/schema.ts:106-110). Die historische Richtigkeit traegt der
 * unveraenderliche Anzeige-Schnappschuss, der beim Ausleihen kopiert wird, nicht ein
 * lebender Join. Ein zusaetzlicher FK waere gueltiges Drizzle, gueltiges SQL und
 * PARITAETSGRUEN; der Schaden entstuende Monate spaeter, bei der ersten Geraeteausmusterung.
 *
 * `borrower_name` ist personenbezogen und der DSGVO-Grund der Retention (§2.7).
 */
export const loans = sqliteTable(
  "loans",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    deviceId: text("device_id").notNull(),
    snapshotCallSign: text("snapshot_call_sign").notNull(),
    snapshotSerialNumber: text("snapshot_serial_number"),
    snapshotDeviceType: text("snapshot_device_type"),
    borrowerName: text("borrower_name").notNull(),
    borrowedAt: integer("borrowed_at", { mode: "timestamp" }).notNull(),
    returnedAt: integer("returned_at", { mode: "timestamp" }),
    returnNote: text("return_note"),
    // Die HERKUNFT des Zugangs, nicht die Identitaet der Person (der Vorgang bleibt anonym,
    // §3.5.4): "diese Leihe entstand ueber den Aufsteller im Funkraum". NULL fuer jede
    // importierte Alt-Leihe und fuer jede Leihe ueber den Suite-Weg.
    // ⚠️ Der EINZIGE Fremdschluessel dieser Tabelle, und er ist KEIN Gegenbeispiel zu
    // `device_id`: dort zeigte er auf eine Tabelle, aus der AUSGEMUSTERT wird; aus
    // `zugangscodes` wird NIE geloescht (§3.2.4), der Zeiger kann konstruktiv nicht ins
    // Leere fallen. Ohne ihn ist das Loeschverbot eine Regel ohne Schaden — "beides oder
    // nichts" (§3.2.4 Punkt 3). Nachgetragen in B6; §2.4 verneint die Spalte noch und ist
    // damit ueberholt.
    zugangscodeId: text("zugangscode_id").references(() => zugangscodes.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("loans_device_id_idx").on(t.deviceId),
    index("loans_borrowed_at_idx").on(t.borrowedAt),
    index("loans_returned_at_idx").on(t.returnedAt),
    // Der PARTIELLE Unique-Index `loans_device_active_uidx` steht hier NICHT und kann hier
    // nicht stehen: drizzle-kit emittiert keine partiellen Indizes (§2.6). Er liegt von
    // Hand in migrations/0001_loans_aktiv_uidx.sql und ist dem Drizzle-Schema UNSICHTBAR.
  ],
);

/*
 * DIE ZEHN TYPALIASE. Sie sind ⬜ L1 des Import-Wegs: ohne sie kompiliert keine
 * Mapper-Signatur von scripts/import/radio.ts (Aufgaben B5, B6, B7, B9, B14, B15, B16 in
 * docs/superpowers/plans/2026-08-18-plan1-radio-import.md).
 *
 * Hausform: `typeof <tabelle>.$inferInsert` / `$inferSelect`
 * (src/app/m/qr/_db/schema.ts:32-33, src/app/m/aufgaben/_db/schema.ts:334-339).
 *
 * `zugangscodes` bekommt seine Aliase mit Kapitel 3, seinem ersten Verbraucher — hier
 * waeren sie toter Code.
 */
export type NeuesGeraet = typeof devices.$inferInsert;
export type Geraet = typeof devices.$inferSelect;
export type NeueSoftwareVersion = typeof softwareVersions.$inferInsert;
export type SoftwareVersion = typeof softwareVersions.$inferSelect;
export type NeuerBenutzer = typeof users.$inferInsert;
export type Benutzer = typeof users.$inferSelect;
export type NeuesGeraeteEreignis = typeof deviceEvents.$inferInsert;
export type GeraeteEreignis = typeof deviceEvents.$inferSelect;
export type NeueLeihe = typeof loans.$inferInsert;
export type Leihe = typeof loans.$inferSelect;
