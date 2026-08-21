/**
 * Import radio-admin (Alt-SQLite) -> Suite-Modul `radio`.
 *
 * ⚠️ WARUM DIESE DATEI EXISTIEREN MUSS: die Mapping-Funktion ist die EINZIGE Stelle, an der
 * der Faktor-1000-Fehler gefangen werden kann. Der Paritaetscheck kann es strukturell nicht —
 * scripts/import/parity.ts:43-56 vergleicht Multimengen von Zeilen-Hashes, und BEIDE Arme
 * laufen durch dieselbe Mapping-Funktion (scripts/import/portal.ts:73-76 schreibt es selbst
 * hin). Quelle ist epoch-MILLISEKUNDEN, Ziel ist Drizzle `mode: "timestamp"` =
 * Unix-SEKUNDEN. Sekunden statt Millisekunden legt jedes `returned_at` ins Jahr 1970, und
 * der naechste Boot von radio-admin loescht daraufhin die komplette abgeschlossene
 * Leihhistorie (server/src/index.ts:35 -> retentionService.ts:47, sofort).
 *
 * Aufruf: tsx scripts/import/radio.ts <radio-snapshot.db>   (DATA_DIR steuert das Ziel)
 */

import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import * as schema from "@/app/m/radio/_db/schema";
import { migrateAllModules } from "@/core/bootstrap";
import { getModuleDb } from "@/core/db";
import { checkParity, assertParity, type ParityReport, type Row } from "./parity";

/**
 * Plausibilitaetsspanne fuer epoch-MILLISEKUNDEN. 1e12 = 2001-09-09, 4e12 = 2096-10-02.
 * Jeder echte radio-admin-Wert liegt in dieser Spanne; ein Sekundenwert (~1.7e9) liegt
 * darunter und WIRFT, statt als 1970 durchzulaufen.
 */
const MS_MIN = 1_000_000_000_000;
const MS_MAX = 4_000_000_000_000;

export function msZuDatum(feld: string, ms: number): Date {
  if (!Number.isFinite(ms) || !Number.isInteger(ms)) {
    throw new Error(`${feld}: kein ganzzahliger Zeitstempel (${ms})`);
  }
  if (ms < MS_MIN || ms > MS_MAX) {
    throw new Error(
      `${feld}: ${ms} liegt ausserhalb der Millisekunden-Spanne — Sekunden statt Millisekunden?`,
    );
  }
  return new Date(ms);
}

export function msZuDatumOptional(feld: string, ms: number | null | undefined): Date | null {
  return ms === null || ms === undefined ? null : msZuDatum(feld, ms);
}

/** epoch-ms → Berliner Kalendertag `YYYY-MM-DD` (Spec 1 §2.2.3). Die Zone steht HIER, nicht in `TZ`. */
const BERLIN = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function tagInBerlin(feld: string, ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null;
  const d = msZuDatum(feld, ms);
  const t = Object.fromEntries(BERLIN.formatToParts(d).map((p) => [p.type, p.value]));
  return `${t.year}-${t.month}-${t.day}`;
}

/**
 * ⚠️ scripts/import/portal.ts:48-49 und :51 benutzen `!!row.is_public`, und das darf hier
 * NICHT uebernommen werden. Dort ist es unbedenklich, weil die Spalten `notNull` sind. Hier
 * faltet `!!null` das `null` zu `false` — aus „Alamos nicht ERFASST" wird „nicht
 * integriert", aus „Ausleihbarkeit unbekannt" wird „nicht ausleihbar". Paritaetsgruen, aus
 * demselben strukturellen Grund wie der Faktor 1000.
 *
 * ⚠️ `undefined` faellt AUSDRUECKLICH auf `null`, nicht auf `false` (NT2, entschieden am
 * 2026-08-21). Der Wert kann nur ueber den blinden Cast `.all() as AltGeraet[]` unten
 * hereinkommen — `AltGeraet.alamos_integrated` ist `0 | 1 | null` und NICHT optional, der
 * Zweig ist von `toNeuesGeraet` aus also unerreichbar. Er steht trotzdem hier, weil die
 * Alternative eine stille Faltung waere, sobald jemand das Quellinterface lockert; und weil
 * `msZuDatumOptional` zwei Bildschirme darueber `undefined` genauso ausdruecklich behandelt.
 * Asymmetrie zwischen zwei Nachbarfunktionen mit derselben Aufgabe ist selbst ein Fehler.
 */
export const zuBoolOptional = (v: 0 | 1 | null | undefined): boolean | null =>
  v === null || v === undefined ? null : v === 1;

/**
 * `device_events.source` ist in Drizzle ein Enum, in SQL aber nur `` `source` text NOT NULL ``.
 * Die Datenbank nimmt JEDEN String; ein fuenfter Wert passiert Datenbank UND Typpruefung
 * unbeanstandet und bricht erst in einem erschoepfenden `switch` der Oberflaeche — Monate
 * spaeter, in einer Detailansicht. ⚠️ Der Riegel wirft, also muss er VOR dem Fenster feuern:
 * das ist A5 (Spec 2 §2.4.5), blockierend, mit `select distinct source from device_events;`.
 */
export const EREIGNIS_QUELLEN = ["manual", "csv-import", "create", "update-note"] as const;

export function pruefeQuelle(id: string, roh: string): (typeof EREIGNIS_QUELLEN)[number] {
  if (!(EREIGNIS_QUELLEN as readonly string[]).includes(roh)) {
    throw new Error(`device_events.source: unbekannter Wert "${roh}" (Zeile ${id})`);
  }
  return roh as (typeof EREIGNIS_QUELLEN)[number];
}

// ── Die Quellzeilen, wie better-sqlite3 sie liefert ───────────────────────────────────────
//
// ⚠️ Die Feldnamen sind die SQL-Spaltennamen der Quelle, zeichengleich — nicht die
// camelCase-Namen des Ziels. Das ist Absicht: 61 zuzuordnende Spalten, und jede Umbenennung
// waere eine Verwechslungsgelegenheit (Spec 1 §2.5, docs/radio-portierung-analyse.md:743-747).
// Belegt gegen radio-admin@265abd5:server/drizzle/0000..0004.

export interface AltNutzer {
  sub: string;
  name: string;
  last_seen_at: number;
}

export interface AltVersion {
  id: string;
  value: string;
  created_at: number;
  created_by: string | null;
  sort_order: number;
  is_target: number; // in der Quelle NOT NULL (0002_numerous_mandroid.sql:2) — nie null
}

export interface AltGeraet {
  id: string;
  rufname: string | null;
  issi: string;
  tei: string | null;
  serial_number: string | null;
  device_type: string | null;
  status: string | null;
  location: string | null;
  assigned_to: string | null;
  software_version: string | null;
  last_updated_at: number | null; // epoch-ms; wird im Ziel zu TEXT `YYYY-MM-DD`
  notes: string | null;
  hiorg_id: string | null;
  opta: string | null;
  funktion: string | null;
  hersteller: string | null;
  bedieneinheit: string | null;
  device_modes: string | null;
  // ⚠️ `0 | 1 | null`, nicht `number | null`: nur so faellt eine Fixture-Zeile ohne
  // `as const` schon in der Typpruefung auf, statt spaeter am Mapper. Die Fixture-Zeilen
  // in scripts/import/fixtures/radio-quelle.ts tragen deshalb `as const` (Aufgabe 2).
  alamos_integrated: 0 | 1 | null;
  loanable: 0 | 1 | null;
  update_note: string | null;
  created_at: number;
  updated_at: number;
  created_by: string | null;
  updated_by: string | null;
}

export interface AltEreignis {
  id: string;
  device_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: number;
  source: string; // ⚠️ ABSICHTLICH `string`, nicht das Enum: die DB nimmt jeden Wert.
}

export interface AltLeihe {
  id: string;
  device_id: string;
  snapshot_call_sign: string;
  snapshot_serial_number: string | null;
  snapshot_device_type: string | null;
  borrower_name: string;
  borrowed_at: number;
  returned_at: number | null; // NULL heisst „aktive Leihe" und MUSS NULL bleiben
  return_note: string | null;
  created_at: number;
  updated_at: number;
}

/** Feldnamen gesetzt durch Spec 2 §1.5.2 (`q.users`, `q.softwareVersions`, …). */
export interface RadioQuelle {
  users: AltNutzer[];
  softwareVersions: AltVersion[];
  devices: AltGeraet[];
  deviceEvents: AltEreignis[];
  loans: AltLeihe[];
}

/**
 * Die fuenf Quellabfragen. ⚠️ JEDE nennt ihre Spalten. Das ist keine Ordnungsfrage:
 *
 * `devices` hat in der Quelle 25 Spalten in der Reihenfolge, die die MIGRATIONEN erzeugt
 * haben — `update_note` an Position 24 (aus 0001), `tei` an Position 25 (aus 0004). Das
 * Ziel entsteht in einem Rutsch aus der Deklarationsreihenfolge von Spec 1 §2.5.1, dort
 * steht `tei` an Position 4 und `update_note` an 21. BEIDE Tabellen haben 25 Spalten, ein
 * positionsweiser Import scheitert also nicht an der Stelligkeit — er laeuft durch. SQLite
 * nimmt das an: die Tabellen sind nicht STRICT, Typaffinitaet konvertiert wo sie kann und
 * speichert sonst den Wert im Originaltyp. Der teuerste Einzelposten ist Zielposition 20:
 * `loanable` empfaengt `created_at`, eine 13-stellige Zahl in ein 0/1-Feld — danach ist
 * JEDES Geraet ausleihbar. Dieselbe Falle, dort gemessen als `aktiv ← created_by`, steht in
 * docs/runbooks/lagerbuch-cutover.md:33-34.
 *
 * Die Spaltenreihenfolge im `devices`-SELECT ist die des ZIELS (Spec 1 §2.5.1), nicht die
 * physische der Quelle — zulaessig und erwuenscht, weil namentlich gelesen wird und die
 * Liste so Feld fuer Feld gegen das Zielschema gegengelesen werden kann.
 *
 * ⚠️ Gegen das naechste Vorbild: scripts/import/feedback.ts:66-72 liest fuenfmal ohne
 * Spaltenliste. Diesem Vorbild wird NICHT gefolgt.
 */
export function lieseQuelle(quellDb: Database.Database): RadioQuelle {
  return {
    users: quellDb
      .prepare("SELECT sub, name, last_seen_at FROM users")
      .all() as AltNutzer[],

    softwareVersions: quellDb
      .prepare(
        "SELECT id, value, created_at, created_by, sort_order, is_target FROM software_versions",
      )
      .all() as AltVersion[],

    devices: quellDb
      .prepare(
        `SELECT id, rufname, issi, tei, serial_number, device_type, status, location, assigned_to,
                software_version, last_updated_at, notes, hiorg_id, opta, funktion, hersteller,
                bedieneinheit, device_modes, alamos_integrated, loanable, update_note,
                created_at, updated_at, created_by, updated_by
           FROM devices`,
      )
      .all() as AltGeraet[],

    deviceEvents: quellDb
      .prepare(
        `SELECT id, device_id, field, old_value, new_value, changed_by, changed_at, source
           FROM device_events`,
      )
      .all() as AltEreignis[],

    loans: quellDb
      .prepare(
        `SELECT id, device_id, snapshot_call_sign, snapshot_serial_number, snapshot_device_type,
                borrower_name, borrowed_at, returned_at, return_note, created_at, updated_at
           FROM loans`,
      )
      .all() as AltLeihe[],
  };
}

/**
 * 25 Spalten, Feld fuer Feld gegen Spec 1 §2.5.1 gegengelesen. Die Reihenfolge hier ist die
 * des ZIELSCHEMAS — nicht die physische der Quelle —, damit sie beim Gegenlesen Zeile fuer
 * Zeile mit der Schemadatei fluchtet.
 *
 * ⚠️ Jeder Zugriff geht ueber den NAMEN. Kein Destructuring nach Position, kein Spread aus
 * der Quellzeile: `{ ...zeile }` traegt `serial_number` statt `serialNumber` und `snake_case`
 * statt `camelCase` — Drizzle nimmt die unbekannten Schluessel klaglos entgegen und schreibt
 * die bekannten als `undefined`.
 */
export function toNeuesGeraet(zeile: AltGeraet): schema.NeuesGeraet {
  return {
    id: zeile.id,
    rufname: zeile.rufname ?? null,
    issi: zeile.issi, // NICHT `tei`
    tei: zeile.tei ?? null, // NICHT `issi`
    serialNumber: zeile.serial_number ?? null,
    deviceType: zeile.device_type ?? null,
    status: zeile.status ?? null,
    location: zeile.location ?? null,
    assignedTo: zeile.assigned_to ?? null,
    softwareVersion: zeile.software_version ?? null,
    // TYPWECHSEL integer(ms) -> text `YYYY-MM-DD` in Europe/Berlin (Spec 1 §2.2.3).
    lastUpdatedAt: tagInBerlin("devices.last_updated_at", zeile.last_updated_at),
    notes: zeile.notes ?? null,
    hiorgId: zeile.hiorg_id ?? null,
    opta: zeile.opta ?? null,
    funktion: zeile.funktion ?? null,
    hersteller: zeile.hersteller ?? null,
    bedieneinheit: zeile.bedieneinheit ?? null,
    // Klartext, komma-verbunden. KEINE Normalisierung, kein Trim, kein Sortieren:
    // genau eine Stelle liest und splittet ihn.
    deviceModes: zeile.device_modes ?? null,
    alamosIntegrated: zuBoolOptional(zeile.alamos_integrated),
    loanable: zuBoolOptional(zeile.loanable),
    // APPEND-ONLY in der Quelle (radio-admin/server/src/db/schema.ts:33-36) — genau die
    // Spalte, die ein Zweitimport plattwalzt (§1.6.3 Fall A).
    updateNote: zeile.update_note ?? null,
    createdAt: msZuDatum("devices.created_at", zeile.created_at),
    updatedAt: msZuDatum("devices.updated_at", zeile.updated_at),
    // OIDC-`sub`, OHNE FK auf users.sub: ein FK hier braeche jeden Kaltimport, dessen
    // `sub`-Werte in der Suite noch nie eingeloggt waren — also jeden (Spec 1 §2.3).
    createdBy: zeile.created_by ?? null,
    updatedBy: zeile.updated_by ?? null,
  };
}

export function toNeuenBenutzer(zeile: AltNutzer): schema.NeuerBenutzer {
  return {
    // 1:1 und ROH. Keine Zuordnungstabelle alt_sub → neu_sub: die Pocket-ID-Instanz fuehrt
    // `subject_types_supported: ["public"]`, der `sub` ist ueber beide OIDC-Clients identisch
    // (Spec 1 §2.5.3).
    sub: zeile.sub,
    name: zeile.name,
    lastSeenAt: msZuDatum("users.last_seen_at", zeile.last_seen_at),
  };
}

export function toNeueSoftwareVersion(zeile: AltVersion): schema.NeueSoftwareVersion {
  return {
    id: zeile.id,
    // KEINE Normalisierung: `software_versions_value_unique` besteht in beiden Datenbanken,
    // ein Trimmen erzeugte einen Konflikt, den es in der Quelle nicht gab.
    value: zeile.value,
    createdAt: msZuDatum("software_versions.created_at", zeile.created_at),
    // TOTE SPALTE, WANDERT TROTZDEM. Geschrieben (softwareVersionRepo.ts:39, :53), in keiner
    // Projektion gelesen. Kriterium ist „wird sie GESCHRIEBEN?", nicht „wird sie gelesen?"
    // (§1.7 Punkt 2): ein Leser laesst sich nachbauen, ein verlorener Wert nicht.
    createdBy: zeile.created_by ?? null,
    sortOrder: zeile.sort_order ?? 0,
    // In der Quelle NOT NULL (0002_numerous_mandroid.sql:2) — also KEIN zuBoolOptional.
    // ⚠️ Genau eine Zeile darf `is_target = 1` tragen, und keine Datenbank erzwingt das:
    // getTargetVersion (softwareVersionRepo.ts:63-70) hat kein ORDER BY, bei zwei Marken
    // entscheidet der Zufall ueber den Update-Stand JEDES Geraets. Der Importer wandert 1:1
    // und kann das nicht retten — die Abwehr ist A2 (§2.4.2), blockierend, genau `1`.
    isTarget: zeile.is_target === 1,
  };
}

export function toNeuesGeraeteEreignis(zeile: AltEreignis): schema.NeuesGeraeteEreignis {
  return {
    id: zeile.id,
    deviceId: zeile.device_id,
    field: zeile.field,
    oldValue: zeile.old_value ?? null,
    newValue: zeile.new_value ?? null,
    changedBy: zeile.changed_by ?? null,
    changedAt: msZuDatum("device_events.changed_at", zeile.changed_at),
    source: pruefeQuelle(zeile.id, zeile.source),
  };
}

export function toNeueLeihe(zeile: AltLeihe): schema.NeueLeihe {
  return {
    id: zeile.id,
    // ABSICHTLICH kein FK auf devices.id, und er wird auch nicht „der Ordnung wegen"
    // nachgezogen: radio-admin/server/src/db/schema.ts:106-110 begruendet es im Quelltext —
    // Cascade loescht Historie, Restrict blockiert das Ausmustern. Die historische
    // Richtigkeit traegt der unveraenderliche snapshot_*-Dreisatz, nicht ein lebender Join.
    deviceId: zeile.device_id,
    snapshotCallSign: zeile.snapshot_call_sign, // NICHT `borrower_name`
    snapshotSerialNumber: zeile.snapshot_serial_number ?? null,
    snapshotDeviceType: zeile.snapshot_device_type ?? null,
    // Personenbezogen — der DSGVO-Grund der Zwei-Monats-Retention (Spec 1 §2.7).
    borrowerName: zeile.borrower_name,
    borrowedAt: msZuDatum("loans.borrowed_at", zeile.borrowed_at),
    // ⚠️ NULL heisst „aktive Leihe" und MUSS NULL bleiben.
    returnedAt: msZuDatumOptional("loans.returned_at", zeile.returned_at),
    returnNote: zeile.return_note ?? null,
    // Die Spalte hat KEINE Quelle: sie traegt die HERKUNFT des Zugangs („diese Leihe
    // entstand ueber den Aufsteller im Funkraum"), nicht die Identitaet der Person
    // (Spec 1 §2.11 Zusage 7, B6). Sie steht EXPLIZIT hier und nicht implizit durch
    // Auslassen — nur so ist sie in der Paritaetssicht auf beiden Armen vorhanden.
    zugangscodeId: null,
    createdAt: msZuDatum("loans.created_at", zeile.created_at),
    updatedAt: msZuDatum("loans.updated_at", zeile.updated_at),
  };
}

export type RadioDb = BetterSQLite3Database<typeof schema>;

/**
 * ⚠️ Innerhalb von db.transaction() ist der Empfaenger NICHT die Datenbank, sondern der
 * Transaktionskontext. Die Union ist planverbindlich (§1.5.3) und wird deshalb geschrieben —
 * sie ist aber NICHT uebersetzungserzwungen: `SQLiteTransaction` ist an `BetterSQLite3Database`
 * zuweisbar, weil beide dasselbe `private resultKind` aus `BaseSQLiteDatabase` erben
 * (node_modules/drizzle-orm/sqlite-core/db.d.ts:16-17 — die Deklaration existiert genau
 * einmal). Nur `db.query.*` waere schema-empfindlich
 * (node_modules/drizzle-orm/sqlite-core/db.d.ts:24-26); `insert`/`select`/`run` sind es nicht.
 * Gemessen gegen drizzle-orm 0.45.2: die Union traegt insert/onConflictDoUpdate/
 * onConflictDoNothing/select.
 */
export type RadioTx = SQLiteTransaction<
  "sync",
  Database.RunResult,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Einfuegereihenfolge — PFLICHT, nicht Stil. `foreign_keys = ON` ist in BEIDEN Datenbanken
 * scharf (radio-admin/server/src/db/index.ts:28, src/core/db/index.ts:19), und die eine
 * Kante `device_events.device_id → devices.id` bricht HART ab, wenn ein Ereignis vor seinem
 * Geraet eingefuegt wird.
 *
 * Kein `PRAGMA defer_foreign_keys`: die Kantenmenge ist azyklisch und mit dieser Reihenfolge
 * erfuellbar. `lagerbuch` brauchte es wegen `lagerorte.templateId`, hier gibt es kein
 * Gegenstueck.
 *
 * `zugangscodes` fehlt in der Liste (§1.4.6) und braucht trotz FK-Elternschaft keine
 * Position: `loans.zugangscode_id` ist fuer JEDE importierte Zeile NULL, und SQLite prueft
 * eine Fremdschluesselkante bei einem NULL-Kindwert nicht. `api_tokens` fehlt ebenfalls —
 * die Tabelle existiert im Ziel NICHT (B16, Entscheidung 13, ausgeschrieben in W4).
 */
export function importiereRadio(quelle: RadioQuelle, db: RadioDb | RadioTx): void {
  // 1) users — frei
  for (const zeile of quelle.users) {
    const v = toNeuenBenutzer(zeile);
    db.insert(schema.users).values(v).onConflictDoUpdate({ target: schema.users.sub, set: v }).run();
  }

  // 2) software_versions — frei
  for (const zeile of quelle.softwareVersions) {
    const v = toNeueSoftwareVersion(zeile);
    db.insert(schema.softwareVersions).values(v)
      .onConflictDoUpdate({ target: schema.softwareVersions.id, set: v }).run();
  }

  // 3) devices
  for (const zeile of quelle.devices) {
    const v = toNeuesGeraet(zeile);
    db.insert(schema.devices).values(v)
      .onConflictDoUpdate({ target: schema.devices.id, set: v }).run();
  }

  // 4) device_events — NACH devices, erzwungen durch die FK-Kante.
  //    ⚠️ onConflictDoNothing, NICHT onConflictDoUpdate: die Tabelle ist ein JOURNAL, und
  //    ein Upsert ist dort fachlich falsch (docs/runbooks/lagerbuch-cutover.md:409
  //    unterscheidet genau das). Fall C in Aufgabe 9 verteidigt diese Zeile gegen ein
  //    spaeteres „der Einheitlichkeit wegen".
  for (const zeile of quelle.deviceEvents) {
    db.insert(schema.deviceEvents).values(toNeuesGeraeteEreignis(zeile)).onConflictDoNothing().run();
  }

  // 5) loans — formal frei (kein FK auf devices), fachlich nach devices.
  //    ⚠️ `onConflictDoUpdate({ target: loans.id })` — der PARTIELLE Index
  //    `loans_device_active_uidx` kann NICHT Konfliktziel sein: SQLite verlangt dafuer
  //    dieselbe WHERE-Klausel im Ziel (Spec 1 §2.6 (b)). Historie im Bulk ist gefahrlos,
  //    zwei AKTIVE Leihen auf einem Geraet schlagen hart fehl — dagegen steht A4 (§2.4.4).
  for (const zeile of quelle.loans) {
    const v = toNeueLeihe(zeile);
    db.insert(schema.loans).values(v)
      .onConflictDoUpdate({ target: schema.loans.id, set: v }).run();
  }
}

/**
 * Zeichengleich `tsSeconds` aus scripts/import/portal.ts:66-71 bzw. feedback.ts:174-176,
 * mit deutschem Namen (Spec 1 §2.2.4). Drizzle schreibt SEKUNDEN; ohne diese Normalisierung
 * auf BEIDEN Armen scheitert ein zeichengleicher Import allein an Praezision.
 */
const sekunden = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);

export function paritaetsSichtGeraet(r: schema.NeuesGeraet | schema.Geraet) {
  return {
    id: r.id,
    rufname: r.rufname ?? null,
    issi: r.issi,
    tei: r.tei ?? null,
    serialNumber: r.serialNumber ?? null,
    deviceType: r.deviceType ?? null,
    status: r.status ?? null,
    location: r.location ?? null,
    assignedTo: r.assignedTo ?? null,
    softwareVersion: r.softwareVersion ?? null,
    // Regel 3: TEXT `YYYY-MM-DD`, NICHT durch sekunden().
    lastUpdatedAt: r.lastUpdatedAt ?? null,
    notes: r.notes ?? null,
    hiorgId: r.hiorgId ?? null,
    opta: r.opta ?? null,
    funktion: r.funktion ?? null,
    hersteller: r.hersteller ?? null,
    bedieneinheit: r.bedieneinheit ?? null,
    deviceModes: r.deviceModes ?? null,
    alamosIntegrated: r.alamosIntegrated ?? null,
    loanable: r.loanable ?? null,
    updateNote: r.updateNote ?? null,
    createdAt: sekunden(r.createdAt),
    updatedAt: sekunden(r.updatedAt),
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

/**
 * Paritaetssicht `users` — ALLE DREI Spalten namentlich, keine Auswahl.
 * `portal.ts:78-81` ist das Vorbild: eine Sicht, die nur eine Teilmenge fuehrt,
 * zertifiziert auch nur diese Teilmenge — und der Rest der Zeile ist paritaetsblind.
 *
 * `lastSeenAt` ist im Ziel `{ mode: "timestamp" }` (Spec 1 §2.5.3) und laeuft deshalb
 * durch `sekunden()`; ohne diese Normalisierung scheitert ein zeichengleicher Import
 * allein an Sub-Sekunden (portal.ts:66-71).
 */
export function paritaetsSichtBenutzer(r: schema.NeuerBenutzer | schema.Benutzer) {
  return {
    sub: r.sub,
    name: r.name,
    lastSeenAt: sekunden(r.lastSeenAt),
  };
}

/**
 * Paritaetssicht `software_versions` — alle SECHS Spalten.
 *
 * INSERT-DEFAULTS WERDEN NORMALISIERT, NICHT WEGGELASSEN. Auf dem Quellarm kommt die
 * Zeile aus `toNeueSoftwareVersion(...)` und traegt fuer `sortOrder`/`isTarget`
 * moeglicherweise `undefined`; auf dem Zielarm hat SQLite den DEFAULT eingesetzt und
 * liefert `0` bzw. `false`. Ohne `??` haetten die zwei Arme verschiedene Hashes und
 * die Paritaet waere ROT OHNE FEHLER. `portal.ts:79-80` macht es genauso.
 *
 * ⚠️ `canon()` in parity.ts:16-28 unterscheidet ein explizites `undefined`
 * ({__undefined:true}) von einem fehlenden Feld — ein weggelassenes `?? 0` ist also
 * kein harmloser Zufall, sondern ein garantierter Hash-Unterschied.
 */
export function paritaetsSichtSoftwareVersion(
  r: schema.NeueSoftwareVersion | schema.SoftwareVersion,
) {
  return {
    id: r.id,
    value: r.value,
    createdAt: sekunden(r.createdAt),
    createdBy: r.createdBy ?? null,
    sortOrder: r.sortOrder ?? 0,
    isTarget: r.isTarget ?? false,
  };
}

/**
 * Paritaetssicht `device_events` — alle ACHT Spalten.
 *
 * `source` wird DURCHGEREICHT, nicht validiert: die Spalte ist in SQL
 * `text NOT NULL` und die DB akzeptiert jeden String (radio-admin@265abd5
 * server/src/db/schema.ts:96, das Enum steht nur im TS-Typ). Das Tor gegen einen
 * fuenften Wert ist `toNeuesGeraeteEreignis` (es WIRFT) und die Vorabfrage A5,
 * nicht diese Sicht.
 *
 * `device_events` ist ein JOURNAL. Der Importer schreibt sie mit
 * `onConflictDoNothing` (Spec 1 §2.8.4, Beleg docs/runbooks/lagerbuch-cutover.md:409),
 * nicht mit einem Upsert — die Sicht aendert daran nichts, aber wer sie liest,
 * soll es wissen.
 */
export function paritaetsSichtGeraeteEreignis(
  r: schema.NeuesGeraeteEreignis | schema.GeraeteEreignis,
) {
  return {
    id: r.id,
    deviceId: r.deviceId,
    field: r.field,
    oldValue: r.oldValue ?? null,
    newValue: r.newValue ?? null,
    changedBy: r.changedBy ?? null,
    changedAt: sekunden(r.changedAt),
    source: r.source,
  };
}

/**
 * Paritaetssicht `loans` — ZWOELF Felder: die elf Quellspalten plus `zugangscodeId`.
 *
 * `zugangscodeId` hat in der Quelle KEIN Gegenstueck (B6). Sie steht trotzdem in der
 * Sicht, weil die Sicht die ZIELTABELLE zertifiziert, nicht die Quelle: auf dem
 * Quellarm liefert der Mapper `null`, auf dem Zielarm steht `null`, solange niemand
 * ueber die Suite ausgeliehen hat. Ein Wert != null zwischen Import und Pruefung ist
 * im Fenster ein ALARM, kein Datenbefund (Spec 2 §2.2.3) — die dazugehoerige
 * Gegenzaehlung steht in §Z.
 *
 * `returnedAt` ist die einzige nullable Zeitspalte dieser Tabelle. Sie ist zugleich
 * die Spalte, die der Faktor-1000-Fehler zerstoert: Sekunden statt Millisekunden legt
 * jedes `returned_at` ins Jahr 1970, und der Retention-Purge loescht die komplette
 * abgeschlossene Leihhistorie (Spec 2, Randbedingung 3). Aktive Leihen
 * (`returned_at IS NULL`) ueberleben — deshalb sieht der Kiosk danach "richtig" aus.
 */
export function paritaetsSichtLeihe(r: schema.NeueLeihe | schema.Leihe) {
  return {
    id: r.id,
    deviceId: r.deviceId,
    snapshotCallSign: r.snapshotCallSign,
    snapshotSerialNumber: r.snapshotSerialNumber ?? null,
    snapshotDeviceType: r.snapshotDeviceType ?? null,
    borrowerName: r.borrowerName,
    borrowedAt: sekunden(r.borrowedAt),
    returnedAt: sekunden(r.returnedAt ?? null),
    returnNote: r.returnNote ?? null,
    zugangscodeId: r.zugangscodeId ?? null,
    createdAt: sekunden(r.createdAt),
    updatedAt: sekunden(r.updatedAt),
  };
}

export function getaggteQuellzeilen(q: RadioQuelle): Row[] {
  return [
    ...q.users.map((r) => ({ __table: "users", ...paritaetsSichtBenutzer(toNeuenBenutzer(r)) })),
    ...q.softwareVersions.map((r) => ({ __table: "software_versions", ...paritaetsSichtSoftwareVersion(toNeueSoftwareVersion(r)) })),
    ...q.devices.map((r) => ({ __table: "devices", ...paritaetsSichtGeraet(toNeuesGeraet(r)) })),
    ...q.deviceEvents.map((r) => ({ __table: "device_events", ...paritaetsSichtGeraeteEreignis(toNeuesGeraeteEreignis(r)) })),
    ...q.loans.map((r) => ({ __table: "loans", ...paritaetsSichtLeihe(toNeueLeihe(r)) })),
  ];
}

export function getaggteZielzeilen(db: RadioDb): Row[] {
  return [
    ...db.select().from(schema.users).all().map((r) => ({ __table: "users", ...paritaetsSichtBenutzer(r) })),
    ...db.select().from(schema.softwareVersions).all().map((r) => ({ __table: "software_versions", ...paritaetsSichtSoftwareVersion(r) })),
    ...db.select().from(schema.devices).all().map((r) => ({ __table: "devices", ...paritaetsSichtGeraet(r) })),
    ...db.select().from(schema.deviceEvents).all().map((r) => ({ __table: "device_events", ...paritaetsSichtGeraeteEreignis(r) })),
    ...db.select().from(schema.loans).all().map((r) => ({ __table: "loans", ...paritaetsSichtLeihe(r) })),
  ];
}

/**
 * ⚠️ Der Zielarm liest OHNE `WHERE` (feedback.ts:248-256). Laeuft der Import gegen eine
 * Ziel-DB, in der schon Zeilen stehen, ist Paritaet ROT mit `missingInSource` — und das ist
 * erwuenscht: der Paritaetscheck ist zugleich der Nachweis, dass die Ziel-DB leer war.
 */
export function checkRadioParitaet(q: RadioQuelle, db: RadioDb): ParityReport {
  return checkParity(getaggteQuellzeilen(q), getaggteZielzeilen(db));
}

/**
 * Fix-Runde 1 (B16): die einzigen drei Zeilen der Klammer, die NICHT an `getModuleDb()` oder
 * `migrateAllModules()` haengen — sie brauchen nur IRGENDEIN `RadioDb`-Handle, nicht das
 * gecachte. Deshalb aus `runRadioImport` herausgezogen und `db` als Parameter genommen: testbar
 * mit `frischeZielDb()` (radio.test.ts:56-63), ohne den Global Constraint gegen `getModuleDb()`
 * in Tests zu verletzen.
 *
 * ⚠️ `assertParity` war bis Fix-Runde 1 die teuerste ungedeckte Zeile der ganzen Aufgabe: die
 * Abschlusszeile unten ist konstanter Text, an KEINER Stelle aus `report.ok` abgeleitet.
 * Zwischen einem roten Paritaetsbericht und einem still geloggten "Parität grün" mit Exit 0
 * steht ausschliesslich dieser Wurf. Verliert die Zeile sich spaeter durch Umbau oder ein
 * missgluecktes Merge, sieht der Betreiber am Cutover-Abend eine falsche Erfolgsmeldung und
 * schwenkt den Router auf Grundlage eines rot gewesenen Datenbestands.
 */
export function schreibeUndPruefe(quelle: RadioQuelle, db: RadioDb): ParityReport {
  // EINE Transaktion ueber alle fuenf Tabellen: ein FK-Abbruch bei device_events laesst
  // sonst devices halb drin. Das macht einen ROTEN PARITAETSCHECK NICHT rueckgaengig — der
  // laeuft danach (siehe unten). ⚠️ portal.ts und feedback.ts haben KEINE Transaktion; das
  // ist die eine bewusste Abweichung vom Vorbild (§1.5.3).
  db.transaction((tx) => importiereRadio(quelle, tx));

  // NB (portal.ts:105-107, feedback.ts:274-276): Paritaet laeuft NACH diesem Schreiben.
  // Ein geworfener Paritaetsfehler heisst, das Ziel wurde bereits beschrieben — nicht
  // "nichts ist passiert". Der Rueckweg ist die GELOESCHTE, leere Ziel-DB und ein neuer
  // Lauf, nicht ein zweiter Versuch auf denselben Bestand (§1.6.4).
  const report = checkRadioParitaet(quelle, db);
  assertParity(report); // parity.ts:58-65
  return report;
}

/**
 * Die Klammer ueber den vier bereits getesteten Teilen plus `schreibeUndPruefe`: migrieren,
 * lesen, schreiben-und-pruefen, melden. Der verbleibende Rest — `migrateAllModules()` und
 * `getModuleDb()` selbst — ist ungetestet per Vitest (Schritt 1, B16): `getModuleDb()`s Cache
 * ist per Modulschluessel gekeyt, nicht per `DATA_DIR`, ein Test faehrt also ein stale Handle.
 * Die Abnahme dieses Rests laeuft von Hand als Trockenlauf (Aufgabe 11).
 */
export function runRadioImport(quellPfad: string): void {
  migrateAllModules(); // wie portal.ts:102, feedback.ts:265

  const quellDb = new Database(quellPfad, { readonly: true });
  let quelle: RadioQuelle;
  try {
    quelle = lieseQuelle(quellDb); // die fuenf SELECTs aus §1.4
  } finally {
    quellDb.close();
  }

  // Erste Ausgabezeile: die fuenf gelesenen Zaehlungen — damit das Runbook sie gegen die
  // Vorabzaehlung stellen kann, OHNE eine zweite Abfrage zu fahren. Sie macht den
  // `cp`-statt-`.backup`-Fehler aus §1.1 an genau EINER Stelle sichtbar.
  console.log(
    `Quelle: users=${quelle.users.length} software_versions=${quelle.softwareVersions.length} ` +
      `devices=${quelle.devices.length} device_events=${quelle.deviceEvents.length} ` +
      `loans=${quelle.loans.length}`,
  );

  const db = getModuleDb("radio", schema); // src/core/db/index.ts:27-36
  const report = schreibeUndPruefe(quelle, db);
  console.log(`Radio-Import OK — ${report.sourceCount} Zeilen, Parität grün.`);
}

// CLI: tsx scripts/import/radio.ts <radio-snapshot.db>   (DATA_DIR steuert das Ziel)
if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: tsx scripts/import/radio.ts <radio-snapshot.db>");
    process.exit(1);
  }
  try {
    runRadioImport(src);
  } catch (err: unknown) {
    console.error(err);
    process.exit(1);
  }
}
