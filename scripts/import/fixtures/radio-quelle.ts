import { readFileSync } from "node:fs";
import Database from "better-sqlite3";

/**
 * cwd-relativ, nicht relativ zu dieser Datei — Hausform: scripts/import/portal.test.ts:30
 * laedt "./src/app/m/portal/_db/migrations" genauso, und src/core/bootstrap.ts:18-19
 * begruendet es. Vitest laeuft aus dem Repo-Wurzelverzeichnis.
 */
const DDL_PFAD = "./scripts/import/fixtures/radio-quelle-ddl.sql";

/**
 * Eine LEERE Quell-Datenbank in der Form der Produktion von `radio-admin` (Freeze 265abd5).
 *
 * `foreign_keys = ON` steht hier, weil es in beiden echten Datenbanken scharf ist
 * (radio-admin/server/src/db/index.ts:28 und src/core/db/index.ts:19) und weil es eine
 * VERBINDUNGS-Eigenschaft ist, keine der Datei — dieselbe Begruendung wie in
 * src/app/m/lagerbuch/_db/migrations.test.ts:33-35. Ohne die Zeile liesse die Fixture ein
 * Waisen-Ereignis zu, und Aufgabe 8 haette keinen Fall, an dem sie den harten Abbruch zeigt.
 *
 * ⚠️ Der Aufrufer schliesst die Datenbank. `:memory:` haengt an der Verbindung: ein
 * vergessenes close() ist kein Datei-Leck, aber ein Speicher-Leck ueber die Testdatei hinweg.
 */
export function baueQuellDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(DDL_PFAD, "utf8"));
  return db;
}

// ── Rohzeilen, wie better-sqlite3 sie aus der Quelle liefert (Spec 2 §1.3.4) ────────────
//
// ⚠️ DIE REGEL, an der jede spaetere Zusicherung haengt: jedes Zeitfeld traegt einen
// ANDEREN Wert, ueber die ganze Fixture hinweg, nicht nur je Zeile. Sonst besteht der
// Test jede Vertauschung, und eine durchgaengige Division durch 1000 hasht beidseitig
// identisch (scripts/import/portal.ts:73-76). Die Zahl der Konstanten steht bewusst
// NIRGENDS im Text — sie wandert mit jeder neuen Zeile; der Riegel ist die Zusicherung
// "kein Millisekunden-Wert der Fixture steht unter zwei verschiedenen Feldern".

export const ALT_GERAET = {
  id: "g-1",
  rufname: "HRO 1/83-1",
  issi: "1234567",                     // ≠ tei
  tei: "7654321",                      // ≠ issi
  serial_number: "SN-001",             // ≠ hiorg_id, ≠ opta
  device_type: "MTP6650",
  status: "einsatzbereit",
  location: "Funkraum",
  assigned_to: "GW-San",
  software_version: "10.5.1",
  last_updated_at: 1_740_871_800_000,  // 2025-03-01T23:30:00Z → in Berlin der 2025-03-02
                                       // ⚠️ ABSICHTLICH so gewaehlt: bei 00:00:00Z liefern
                                       // UTC-Kuerzung und Berliner Kalendertag DIESELBE
                                       // Zeichenkette, und die Zusicherung waere vakuoes.
  notes: "Stammnotiz",                 // ≠ update_note
  hiorg_id: "HO-002",
  opta: "OPTA-003",
  funktion: "Fuehrung",
  hersteller: "Motorola",
  bedieneinheit: "TMR880i",
  device_modes: "TMO,DMO",
  alamos_integrated: 1,                // ≠ loanable
  loanable: 0,                         // ≠ alamos_integrated
  update_note: "ISSI abweichend",      // ≠ notes
  created_at: 1_735_689_600_000,       // 2025-01-01T00:00:00Z
  updated_at: 1_738_368_000_000,       // 2025-02-01T00:00:00Z
  created_by: "sub-anna",              // ≠ updated_by
  updated_by: "sub-bert",              // ≠ created_by
} as const;
// ⚠️ `as const` ist Pflicht, nicht Stil: ohne es leitet TypeScript fuer
// `alamos_integrated` und `loanable` den Typ `number` ab, und `toNeuesGeraet(ALT_GERAET)`
// ist in Aufgabe 5 ein TS2345 gegen `AltGeraet` (`0 | 1 | null`). Die naheliegende
// Reparatur waere ein `as` am Aufruf — und genau das schaltet die Pruefung ab, fuer die
// Aufgabe 5 existiert.

// Zweites Geraet: die NULL-Variante der zwei 0/1-Integer (§1.3.5).
// ⚠️ `created_at`/`updated_at` sind hier bewusst dieselben wie in ALT_GERAET — es ist
// DASSELBE Feld, und die Regel oben verbietet nur die Wiederverwendung ueber
// verschiedene FELDER hinweg.
export const ALT_GERAET_OHNE_ANGABE = {
  ...ALT_GERAET,
  id: "g-2",
  issi: "1234568",
  alamos_integrated: null,
  loanable: null,
  last_updated_at: null,
  update_note: null,
} as const;

export const ALT_BENUTZER = {
  sub: "sub-anna",                      // dieselbe Kennung wie devices.created_by
  name: "Anna Reiter",
  last_seen_at: 1_739_000_000_000,      // eigener Wert, sonst faengt kein Test die Vertauschung
} as const;

export const ALT_VERSION = {
  id: "v-1",
  value: "10.5.1",
  created_at: 1_736_000_000_000,        // eigener Wert
  created_by: "sub-anna",
  sort_order: 10,
  is_target: 1,                         // ⚠️ genau EINE Zeile — A2 (§2.4.2)
} as const;

/**
 * ⛛ ERGAENZUNG dieses Plans, nicht aus Spec 2 §1.3.4. Sie ist die Vorbedingung von
 * Idempotenz-Fall D (Aufgabe 9): „die Marke im ZIEL auf eine ANDERE Zeile umhaengen"
 * braucht eine andere Zeile. Mit nur ALT_VERSION gaebe es keine.
 * `value` MUSS abweichen (`software_versions_value_unique`), `created_at` ebenso
 * (die Regel oben), `is_target` ist 0 — genau eine Marke, sonst kippt A2.
 */
export const ALT_VERSION_ZWEIT = {
  id: "v-2",
  value: "10.6.0",
  created_at: 1_736_500_000_000,        // eigener Wert
  created_by: "sub-bert",
  sort_order: 20,
  is_target: 0,
} as const;

export const ALT_EREIGNIS = {
  id: "e-1",
  device_id: "g-1",
  field: "status",
  old_value: "wartung",                 // ≠ new_value
  new_value: "einsatzbereit",           // ≠ old_value
  changed_by: "sub-bert",
  changed_at: 1_737_000_000_000,        // eigener Wert
  source: "manual",
} as const;

/**
 * Der fuenfte Enum-Wert, den Datenbank UND Typpruefung unbeanstandet passieren lassen
 * (§1.4.4) — die Zeile fuer `toNeuesGeraeteEreignis wirft bei source="importiert"`.
 *
 * ⚠️ SIE WIRD NICHT EINGESPIELT. `spieleQuellFixtureEin` laesst sie aus, und das ist
 * keine Nachlaessigkeit: die Quell-DDL fuehrt `source` als `text NOT NULL` ohne CHECK,
 * die Zeile ginge also glatt hinein — und danach wuerfe JEDER Integrationstest, weil
 * `pruefeQuelle` sie ablehnt. Sie ist eine Giftzeile fuer den direkten Mapper-Aufruf,
 * kein Bestandteil der gesunden Fixture.
 */
export const ALT_EREIGNIS_UNBEKANNT = {
  ...ALT_EREIGNIS,
  id: "e-2",
  source: "importiert",
} as const;

export const ALT_LEIHE = {
  id: "l-1",
  device_id: "g-1",
  snapshot_call_sign: "HRO 1/83-1",    // ≠ borrower_name
  snapshot_serial_number: "SN-001",
  snapshot_device_type: "MTP6650",
  borrower_name: "Marek Sowa",         // ≠ snapshot_call_sign
  borrowed_at: 1_741_000_000_000,
  returned_at: 1_741_100_000_000,      // ≠ borrowed_at, ≠ created_at, ≠ updated_at
  return_note: "Akku leer",
  created_at: 1_740_999_999_000,
  updated_at: 1_741_100_001_000,
} as const;

// Die AKTIVE Leihe — §1.6.3 Fall B nennt sie namentlich und braucht sie.
// ⚠️ Nebenbedingung aus der zeichengleich kopierten Quell-DDL: `loans_device_active_uidx`
// laesst je `device_id` HOECHSTENS EINE Zeile mit `returned_at IS NULL` zu. ALT_LEIHE
// (zurueckgegeben) und ALT_LEIHE_AKTIV duerfen deshalb beide auf `g-1` zeigen — sonst
// weist schon das Einspielen der Fixture sie ab, und der Test ist aus dem falschen
// Grund rot.
export const ALT_LEIHE_AKTIV = {
  id: "l-aktiv",
  device_id: "g-1",
  snapshot_call_sign: "HRO 1/83-1",
  snapshot_serial_number: "SN-001",
  snapshot_device_type: "MTP6650",
  borrower_name: "Ines Falk",
  borrowed_at: 1_742_000_000_000,       // ≠ jede andere Zeitkonstante der Fixture
  returned_at: null,                    // DAS ist die Eigenschaft, an der Fall B haengt
  return_note: null,
  created_at: 1_742_000_001_000,
  updated_at: 1_742_000_002_000,
} as const;

/**
 * ⛛ ERGAENZUNG dieses Plans. Die Liste traegt die TABELLE je Zeile, weil die
 * Vertauschungsregel ueber `tabelle.feld` laeuft und nicht ueber den Feldnamen allein:
 * `created_at` gibt es in vier Tabellen, und dass sie dort verschiedene Werte tragen,
 * ist der eigentliche Schutz.
 *
 * ⚠️ ALT_EREIGNIS_UNBEKANNT steht MIT drin: seine Zeitwerte unterliegen derselben Regel.
 * Eingespielt wird es trotzdem nicht (siehe seinen Kommentar oben).
 */
export const ALLE_QUELLZEILEN: ReadonlyArray<{
  tabelle: string;
  name: string;
  zeile: Record<string, unknown>;
}> = [
  { tabelle: "users", name: "ALT_BENUTZER", zeile: ALT_BENUTZER },
  { tabelle: "software_versions", name: "ALT_VERSION", zeile: ALT_VERSION },
  { tabelle: "software_versions", name: "ALT_VERSION_ZWEIT", zeile: ALT_VERSION_ZWEIT },
  { tabelle: "devices", name: "ALT_GERAET", zeile: ALT_GERAET },
  { tabelle: "devices", name: "ALT_GERAET_OHNE_ANGABE", zeile: ALT_GERAET_OHNE_ANGABE },
  { tabelle: "device_events", name: "ALT_EREIGNIS", zeile: ALT_EREIGNIS },
  { tabelle: "device_events", name: "ALT_EREIGNIS_UNBEKANNT", zeile: ALT_EREIGNIS_UNBEKANNT },
  { tabelle: "loans", name: "ALT_LEIHE", zeile: ALT_LEIHE },
  { tabelle: "loans", name: "ALT_LEIHE_AKTIV", zeile: ALT_LEIHE_AKTIV },
];

/**
 * Spielt die GESUNDE Fixture ein. Reihenfolge ist Pflicht, nicht Stil: `foreign_keys = ON`
 * ist gesetzt, und `device_events.device_id → devices.id` bricht hart ab, wenn ein
 * Ereignis vor seinem Geraet eingefuegt wird (§1.5.1).
 *
 * ⚠️ Die INSERTs nennen ihre Spalten. Das ist dieselbe Regel wie fuer `lieseQuelle`
 * (§1.2) und aus demselben Grund: `devices` hat 25 Spalten, ihre physische Reihenfolge
 * ist NICHT die des Schemas, und ein positionsweiser INSERT laeuft durch — SQLite nimmt
 * das alles an, die Tabellen sind nicht STRICT.
 */
export function spieleQuellFixtureEin(db: Database.Database): void {
  const einfuegen = (tabelle: string, zeile: Record<string, unknown>) => {
    const spalten = Object.keys(zeile);
    const platzhalter = spalten.map(() => "?").join(", ");
    db.prepare(
      `insert into ${tabelle} (${spalten.join(", ")}) values (${platzhalter})`,
    ).run(...spalten.map((s) => zeile[s] as null | number | string));
  };

  einfuegen("users", ALT_BENUTZER);
  einfuegen("software_versions", ALT_VERSION);
  einfuegen("software_versions", ALT_VERSION_ZWEIT);
  einfuegen("devices", ALT_GERAET);
  einfuegen("devices", ALT_GERAET_OHNE_ANGABE);
  einfuegen("device_events", ALT_EREIGNIS);
  einfuegen("loans", ALT_LEIHE);
  einfuegen("loans", ALT_LEIHE_AKTIV);
}

/** Die uebliche Testquelle: DDL zuerst, Zeilen danach, nie verschachtelt. */
export function baueBespielteQuellDb(): Database.Database {
  const db = baueQuellDb();
  spieleQuellFixtureEin(db);
  return db;
}
