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
