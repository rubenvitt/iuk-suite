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

import type Database from "better-sqlite3";
import * as schema from "@/app/m/radio/_db/schema";

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
 */
export const zuBoolOptional = (v: 0 | 1 | null): boolean | null => (v === null ? null : v === 1);

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
