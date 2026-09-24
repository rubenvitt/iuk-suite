import type { Einsatz } from "./format";

/**
 * Zeitrechnung ohne `core/zeit` (der Kern läuft auch in der Desktop-App). Die Zone kommt
 * als Parameter, jedes `Intl.DateTimeFormat` entsteht im Aufruf — nie auf Modulebene,
 * sonst friert die Zone beim Import ein (`CLAUDE.md`, „Zeitzone").
 */

const DATUM_MUSTER = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT_MUSTER = /^\d{2}:\d{2}$/;
/** ISO 8601 mit Pflicht-Offset: `Z` oder `±HH:MM`, Sekunden/Bruchteile optional (Spec §3). */
const ZEITPUNKT_MUSTER = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Wirft, wenn `wert` nicht auf `muster` passt — gemeinsame Formatprüfung für Datum und Uhrzeit. */
function pruefeFormat(wert: string, muster: RegExp, fehlermeldung: string): void {
  if (!muster.test(wert)) throw new Error(fehlermeldung);
}

/**
 * Rundlauf-Prüfung eines Kalendertags: `Date.UTC` rollt einen ungültigen Tag (z. B. den
 * 31. Februar) still in den nächsten Monat statt zu werfen. Der Vergleich mit
 * `getUTCDate()`/`getUTCMonth()` deckt das auf.
 */
function pruefeKalendertag(j: number, mo: number, t: number, fehlermeldung: string): void {
  const d = new Date(Date.UTC(j, mo - 1, t));
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) throw new Error(fehlermeldung);
}

/** Wirft, wenn `h:mi` außerhalb von 00:00–23:59 liegt (z. B. `24:00`, das `Date.UTC` sonst in den nächsten Tag rollt). */
function pruefeUhrzeit(h: number, mi: number, fehlermeldung: string): void {
  if (h < 0 || h > 23 || mi < 0 || mi > 59) throw new Error(fehlermeldung);
}

function versatzMinuten(instant: number, zeitzone: string): number {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: zeitzone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const t = Object.fromEntries(teile.map((p) => [p.type, p.value]));
  const alsUtc = Date.UTC(+t.year, +t.month - 1, +t.day, +t.hour, +t.minute, +t.second);
  return Math.round((alsUtc - instant) / 60000);
}

/**
 * Wanduhrzeit („2026-10-25", „02:30") in `zeitzone` → Millisekunden seit 1970. Zwei Durchgänge
 * fangen die Umstellungsnacht: Eine Wanduhrzeit, die es nicht gibt (Frühjahr, z. B. 29.3. 02:30),
 * wird um die Umstellung nach vorn geschoben (ergibt 03:30 Sommerzeit); eine doppelte Wanduhrzeit
 * (Herbst, 25.10. 02:30) ergibt die zweite, spätere Instanz (Winterzeit). Gepinnt in `zeit.test.ts`.
 */
export function wandzeitZuInstant(datum: string, zeit: string, zeitzone: string): number {
  pruefeFormat(datum, DATUM_MUSTER, `Kein Datum im Format JJJJ-MM-TT: ${datum}`);
  pruefeFormat(zeit, ZEIT_MUSTER, `Keine Uhrzeit im Format HH:MM: ${zeit}`);
  const [j, mo, t] = datum.split("-").map(Number);
  const [h, mi] = zeit.split(":").map(Number);
  pruefeKalendertag(j, mo, t, `Kein gültiger Kalendertag: ${datum}`);
  pruefeUhrzeit(h, mi, `Keine gültige Uhrzeit: ${zeit}`);
  const naiv = Date.UTC(j, mo - 1, t, h, mi);
  const erster = naiv - versatzMinuten(naiv, zeitzone) * 60000;
  return naiv - versatzMinuten(erster, zeitzone) * 60000;
}

/** Minuten zwischen Beginn und Ende, `null` solange das Ende fehlt. Negativ, wenn das Ende vor dem Beginn liegt. */
export function dauerMinuten(
  e: Pick<Einsatz, "beginnDatum" | "beginnZeit" | "endeDatum" | "endeZeit">,
  zeitzone: string,
): number | null {
  if (!e.beginnDatum || !e.beginnZeit || !e.endeDatum || !e.endeZeit) return null;
  const ms = wandzeitZuInstant(e.endeDatum, e.endeZeit, zeitzone) - wandzeitZuInstant(e.beginnDatum, e.beginnZeit, zeitzone);
  return Math.round(ms / 60000);
}

/** „2026-08-22" → „22.8.2026" (Schreibweise der Vorlage). */
export function datumText(iso: string): string {
  pruefeFormat(iso, DATUM_MUSTER, `Kein Datum im Format JJJJ-MM-TT: ${iso}`);
  const [j, m, t] = iso.split("-");
  pruefeKalendertag(+j, +m, +t, `Kein gültiger Kalendertag: ${iso}`);
  return `${+t}.${+m}.${j}`;
}

/**
 * Zeitpunkt mit Offset → „22.8.2026, 04:43 Uhr" in `zeitzone`. Verlangt einen Offset
 * (`Z` oder `±HH:MM`, Spec §3): Ohne ihn hinge der Wert still von der Zeitzone der
 * Laufzeit ab statt von der übergebenen `zeitzone`.
 */
export function zeitpunktText(isoMitOffset: string, zeitzone: string): string {
  pruefeFormat(isoMitOffset, ZEITPUNKT_MUSTER, `Kein gültiger Zeitpunkt: ${isoMitOffset}`);
  if (Number.isNaN(new Date(isoMitOffset).getTime())) {
    throw new Error(`Kein gültiger Zeitpunkt: ${isoMitOffset}`);
  }
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: zeitzone, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(isoMitOffset));
  const t = Object.fromEntries(teile.map((p) => [p.type, p.value]));
  return `${t.day}.${t.month}.${t.year}, ${t.hour}:${t.minute} Uhr`;
}

/** 143 → „2 h 23 min". */
export function dauerText(minuten: number): string {
  if (minuten < 0 || !Number.isInteger(minuten)) {
    throw new Error("Dauer muss eine ganze Zahl ab 0 sein");
  }
  return `${Math.floor(minuten / 60)} h ${String(minuten % 60).padStart(2, "0")} min`;
}
