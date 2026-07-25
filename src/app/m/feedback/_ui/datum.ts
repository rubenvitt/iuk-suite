import { TIME_ZONE } from "../_lib/lifecycle";

/**
 * ZEITANGABEN DES MODULS AN EINER STELLE (Entwurf §2.3, §4.5).
 *
 * Drei Gründe, warum das nicht am Ort der Verwendung passieren darf:
 *
 * 1. `evenings.date` ist MITTERNACHT UTC. In `Europe/Berlin` ist das 01:00 bzw.
 *    02:00 desselben Kalendertags — richtig. Wer stattdessen `toISOString()`
 *    oder `toLocaleDateString()` ohne `timeZone` nimmt, bekommt je nach
 *    Serverzone den Vortag, und der Fehler ist still.
 * 2. Die Vorbelegung „heute" darf NIE aus `toISOString()` kommen: zwischen 00:00
 *    und 02:00 Ortszeit kippt sie auf den Vortag, und der Abend von gestern wird
 *    ein zweites Mal angelegt. Deshalb `sv-SE` — das ist das einzige gängige
 *    Gebietsschema, dessen Kurzformat `YYYY-MM-DD` ist, also genau das, was
 *    `<input type="date">` als `value` verlangt.
 * 3. Fristen werden GERECHNET (`computeClosesAt`) und hier nur noch formatiert.
 *    Ein „läuft 48 Stunden"-Satz wäre eine zweite, ungeprüfte Wahrheit.
 *
 * Diese Datei ist bewusst frei von React und von Datenbankcode: sie wird sowohl
 * in Server Components als auch in Client-Inseln benutzt (das Startformular
 * rechnet die Frist beim Tippen neu), und ein Import aus `_lib/cockpit.ts` würde
 * Drizzle in das Client-Bündel ziehen.
 */

const TAG_KURZ = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const UHRZEIT = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const ZEITPUNKT = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const WOCHENTAG_ZEIT = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const TAG_LANG = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const WOCHENTAG = new Intl.DateTimeFormat("de-DE", { timeZone: TIME_ZONE, weekday: "long" });

const ISO_TAG = new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE });

/** „Mi., 22.07." — Abenddatum in Karten, Zeilen und Überschriften. */
export function formatDatumKurz(datum: Date): string {
  return TAG_KURZ.format(datum);
}

/**
 * „22.07.2026" — die erste Zeile der Datumsspalte im Verlauf (§2.5). MIT Jahr,
 * anders als `formatDatumKurz`: der Verlauf reicht über Jahresgrenzen, und „22.07."
 * allein wäre in einer Tabelle mit zwei Jahren zweideutig.
 */
export function formatDatumLang(datum: Date): string {
  return TAG_LANG.format(datum);
}

/**
 * „Mittwoch" — die zweite, gedämpfte Zeile der Datumsspalte (§2.5). Der
 * Wochentag ist die Angabe, an der ein Gruppenleiter den Abend wiedererkennt;
 * ausgeschrieben, weil er unter dem Datum steht und dort Platz hat.
 */
export function formatWochentag(datum: Date): string {
  return WOCHENTAG.format(datum);
}

/** „19:32" — Startzeit einer Umfrage, Stand der Anzeige. */
export function formatUhrzeit(datum: Date): string {
  return UHRZEIT.format(datum);
}

/** „Mi., 19:32" — der Kicker der laufenden Karte („LÄUFT SEIT …", §2.3). */
export function formatWochentagZeit(datum: Date): string {
  return WOCHENTAG_ZEIT.format(datum);
}

/** „Sa., 26.07., 00:00" — die gerechnete Frist, nie „48 Stunden ab jetzt". */
export function formatZeitpunkt(datum: Date): string {
  return ZEITPUNKT.format(datum);
}

/** Heute in `Europe/Berlin` als `YYYY-MM-DD` — die Vorbelegung des Datumsfelds. */
export function heuteInZone(jetzt: Date = new Date()): string {
  return ISO_TAG.format(jetzt);
}

/**
 * `YYYY-MM-DD` → Mitternacht UTC, genau wie `evenings.date` es speichert.
 * `null`, wenn die Eingabe kein Datum ist — der Aufrufer entscheidet, ob daraus
 * ein Feldfehler oder eine ausgelassene Vorschau wird.
 */
export function tagAusEingabe(wert: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return null;
  const datum = new Date(`${wert}T00:00:00Z`);
  return Number.isNaN(datum.getTime()) ? null : datum;
}
