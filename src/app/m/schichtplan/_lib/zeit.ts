/**
 * Zeiten der Schichtplanung, immer in der Suite-Zone (`core/zeit`, CLAUDE.md „Zeitzone“): Anzeige über
 * `zeitFormat`, Eingabe über Wanduhr-Werte. Ein Datumsfeld liefert eine Wanduhrzeit („Sa 14.11. 08:00“),
 * die erst hier in Millisekunden der Suite-Zone wird — nicht in der Zone des Browsers.
 */
import { tagesGrenzenInZone, zeitFormat } from "@/core/zeit";
import { MINUTE, RASTER_MIN, STUNDE } from "./typen";

const UHR = zeitFormat("de-DE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const TAG = zeitFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const LANG = zeitFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const TEILE = zeitFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export interface Wanduhr { jahr: number; monat: number; tag: number; stunde: number; minute: number }

/** Millisekunden → Wanduhr in der Suite-Zone. */
export function wanduhr(ms: number): Wanduhr {
  const p = Object.fromEntries(TEILE.formatToParts(ms).map((t) => [t.type, t.value]));
  return { jahr: +p.year, monat: +p.month, tag: +p.day, stunde: +p.hour % 24, minute: +p.minute };
}

/**
 * Wanduhr in der Suite-Zone → Millisekunden, auch an einer Zeitumstellung: 08:00 bleibt 08:00. Die im
 * Frühjahr übersprungene Stunde (02:30) wird zur Zeit eine Stunde später, die im Herbst doppelte
 * Stunde nimmt ihr erstes Vorkommen (Sommerzeit).
 */
export function ausWanduhr(w: Wanduhr): number {
  const iso = `${w.jahr}-${String(w.monat).padStart(2, "0")}-${String(w.tag).padStart(2, "0")}`;
  const ziel = Date.UTC(w.jahr, w.monat - 1, w.tag, w.stunde, w.minute);
  const naeherung = tagesGrenzenInZone(iso).von + w.stunde * STUNDE + w.minute * MINUTE;
  let ms = naeherung;
  for (let i = 0; i < 2; i++) {
    const ist = wanduhr(ms);
    const abstand = ziel - Date.UTC(ist.jahr, ist.monat - 1, ist.tag, ist.stunde, ist.minute);
    if (abstand === 0) return ms;
    ms += abstand;
  }
  return wanduhr(ms).stunde === w.stunde && wanduhr(ms).minute === w.minute ? ms : naeherung;
}

/** Stunde des Tages in der Suite-Zone (für die Marken im Raster). */
export const stundeInZone = (ms: number) => wanduhr(ms).stunde;

export const uhrzeit = (ms: number) => UHR.format(ms);
export const kurzTag = (ms: number) => TAG.format(ms);
export const langDatum = (ms: number) => LANG.format(ms);

const gleicherTag = (a: number, b: number) => {
  const x = wanduhr(a);
  const y = wanduhr(b - 1);
  return x.jahr === y.jahr && x.monat === y.monat && x.tag === y.tag;
};

/** „08:00–16:00“, mit Tag „Sa., 14.11., 08:00–16:00“; über Mitternacht mit beiden Tagen. Mitternacht als Ende heißt 24:00. */
export function zeitspanne(von: number, bis: number, mitTag = false): string {
  const ende = uhrzeit(bis) === "00:00" ? "24:00" : uhrzeit(bis);
  if (gleicherTag(von, bis)) return `${mitTag ? `${kurzTag(von)}, ` : ""}${uhrzeit(von)}–${ende}`;
  return `${kurzTag(von)} ${uhrzeit(von)} – ${kurzTag(bis)} ${uhrzeit(bis)}`;
}

/**
 * `2027-06-26T14:00+02:00`: Wanduhr der Suite-Zone mit ihrem Versatz, minutengenau. Für das
 * Austauschblatt an Lifeline Hub (IDA-365) — eine Zeit mit Versatz liest es, wie sie ist, ohne
 * Rücksicht auf die Zone des Einsatzes. Die doppelte Herbststunde bleibt so eindeutig.
 */
export function isoMitVersatz(ms: number): string {
  const minute = Math.floor(ms / MINUTE) * MINUTE;
  const w = wanduhr(minute);
  const versatz = Math.round((Date.UTC(w.jahr, w.monat - 1, w.tag, w.stunde, w.minute) - minute) / MINUTE);
  const zwei = (n: number) => String(n).padStart(2, "0");
  const betrag = Math.abs(versatz);
  return `${w.jahr}-${zwei(w.monat)}-${zwei(w.tag)}T${zwei(w.stunde)}:${zwei(w.minute)}${versatz < 0 ? "-" : "+"}${zwei(Math.floor(betrag / 60))}:${zwei(betrag % 60)}`;
}

/** Rundet auf das Raster der Planung (`RASTER_MIN`). */
export function rasten(ms: number, raster = RASTER_MIN): number {
  const schritt = raster * MINUTE;
  return Math.round(ms / schritt) * schritt;
}

/** Eine Dauer, wie man sie sagt: „10 min“, „8 h“, „2 h 30 min“. */
export function stunden(ms: number): string {
  const min = Math.round(ms / MINUTE);
  const h = Math.floor(min / 60);
  const rest = min % 60;
  if (h === 0) return `${rest} min`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
