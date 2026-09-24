import type { Einsatz } from "./format";

/**
 * Zeitrechnung ohne `core/zeit` (der Kern läuft auch in der Desktop-App). Die Zone kommt
 * als Parameter, jedes `Intl.DateTimeFormat` entsteht im Aufruf — nie auf Modulebene,
 * sonst friert die Zone beim Import ein (`CLAUDE.md`, „Zeitzone").
 */
function versatzMinuten(instant: number, zeitzone: string): number {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: zeitzone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const t = Object.fromEntries(teile.map((p) => [p.type, p.value]));
  const alsUtc = Date.UTC(+t.year, +t.month - 1, +t.day, +t.hour, +t.minute, +t.second);
  return Math.round((alsUtc - instant) / 60000);
}

/** Wanduhrzeit („2026-10-25", „02:30") in `zeitzone` → Millisekunden seit 1970. Zwei Durchgänge fangen die Umstellungsnacht. */
export function wandzeitZuInstant(datum: string, zeit: string, zeitzone: string): number {
  const [j, mo, t] = datum.split("-").map(Number);
  const [h, mi] = zeit.split(":").map(Number);
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
  const [j, m, t] = iso.split("-");
  return `${+t}.${+m}.${j}`;
}

/** Zeitpunkt mit Offset → „22.8.2026, 04:43 Uhr" in `zeitzone`. */
export function zeitpunktText(isoMitOffset: string, zeitzone: string): string {
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: zeitzone, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(isoMitOffset));
  const t = Object.fromEntries(teile.map((p) => [p.type, p.value]));
  return `${t.day}.${t.month}.${t.year}, ${t.hour}:${t.minute} Uhr`;
}

/** 143 → „2 h 23 min". */
export function dauerText(minuten: number): string {
  return `${Math.floor(minuten / 60)} h ${String(minuten % 60).padStart(2, "0")} min`;
}
