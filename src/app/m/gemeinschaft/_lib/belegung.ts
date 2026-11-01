import { tagesGrenzenInZone } from "@/core/zeit";
import { plusTage, uhrInZone, wochentag } from "./zeit";

/**
 * Die Belegung der Bar als reine Funktionen (IDA-315): keine Datenbank, kein Request. Die Seiten und Actions
 * holen ihre Einträge (`_lib/vermietung.ts`) und rechnen hier.
 *
 * Was „belegt“ heißt (Entscheidung 2026-11-01): nur Zusagen, Sperrzeiten und Events mit „Bar belegen“. Eine
 * offene Anfrage belegt NICHT — sie ist für andere frei, bis jemand zusagt. Zeitpunkte sind Millisekunden,
 * Kalendertage `JJJJ-MM-TT` in der Suite-Zone; Zeiträume sind halboffen `[von, bis)`, ein Ende um 22:00 und ein
 * Beginn um 22:00 überschneiden sich also nicht.
 */

export type Zustand = "angefragt" | "zugesagt" | "gesperrt" | "abgelehnt" | "zurueckgezogen";

/** Ein Eintrag der Belegung, wie die Leitung ihn sieht: Anfrage, Sperrzeit oder aus einem Event abgeleitete Sperrzeit. */
export type Eintrag = {
  id: string;
  art: "anfrage" | "sperre";
  von: number;
  bis: number;
  /** Anlass einer Anfrage, Grund einer Sperrzeit, „Event: <Titel>“ bei einer abgeleiteten. */
  titel: string;
  zustand: Zustand;
  /** Nur bei einer Sperrzeit aus einem Event: dessen Kennung. Solche Einträge ändert man nur am Event. */
  eventId: string | null;
};

export type Zeitraum = { von: number; bis: number };

/** Was ein Event dafür mitbringt (`vorhaben` mit `art = 'event'` und `bar_belegen = 1`). */
export type BarEvent = { id: string; titel: string; von: number; bis: number };

/** Öffentliche Sicht: nur Zeiträume, ohne Kennung, Titel oder Zustand. */
export type Belegt = Zeitraum;

export const ueberlappt = (a: Zeitraum, b: Zeitraum): boolean => a.von < b.bis && b.von < a.bis;

/** Belegt die Bar: Sperrzeit (auch aus einem Event) oder Zusage. */
export const belegend = (e: Pick<Eintrag, "zustand">): boolean => e.zustand === "gesperrt" || e.zustand === "zugesagt";

/** Steht in der Belegung der Leitung: alles außer Absagen und zurückgezogenen Anfragen. */
export const sichtbar = (e: Pick<Eintrag, "zustand">): boolean => e.zustand === "gesperrt" || e.zustand === "zugesagt" || e.zustand === "angefragt";

/** Präfix der Kennung einer abgeleiteten Sperrzeit; eine echte Sperrzeit hat eine UUID und kann so nie heißen. */
export const EVENT_PRAEFIX = "ev-";

/** Events mit „Bar belegen“ als Sperrzeiten — abgeleitet bei jedem Laden, nie in `sperrzeit` kopiert. */
export function sperrenAusEvents(events: readonly BarEvent[]): Eintrag[] {
  return events.map((v) => ({
    id: EVENT_PRAEFIX + v.id, art: "sperre", von: v.von, bis: v.bis, titel: `Event: ${v.titel}`, zustand: "gesperrt", eventId: v.id,
  }));
}

const nachBeginn = <T extends Zeitraum>(a: T, b: T): number => a.von - b.von || a.bis - b.bis;

/** Was einen Zeitraum hart blockiert: belegende Einträge, die sich mit ihm überschneiden (ohne `ohneId` selbst). */
export function harteKonflikte(z: Zeitraum, eintraege: readonly Eintrag[], ohneId?: string): Eintrag[] {
  return eintraege.filter((x) => x.id !== ohneId && belegend(x) && ueberlappt(x, z)).sort(nachBeginn);
}

/** Alle sichtbaren Überschneidungen eines Eintrags — auch mit offenen Anfragen (weich). */
export function konflikte(e: Eintrag, eintraege: readonly Eintrag[]): Eintrag[] {
  if (!sichtbar(e)) return [];
  return eintraege.filter((x) => x.id !== e.id && sichtbar(x) && ueberlappt(x, e)).sort(nachBeginn);
}

/**
 * Die öffentliche Belegung: nur belegende Zeiträume, sortiert und zusammengelegt, wo sie sich überschneiden
 * oder lückenlos aneinanderstoßen. Damit verrät der Kalender weder, wie viele Einträge dahinterstehen, noch
 * welcher Art sie sind — auch nicht über die Grenzen.
 */
export function oeffentlicheBelegung(eintraege: readonly Eintrag[]): Belegt[] {
  const roh = eintraege.filter(belegend).map(({ von, bis }) => ({ von, bis })).sort(nachBeginn);
  const aus: Belegt[] = [];
  for (const z of roh) {
    const letzter = aus[aus.length - 1];
    if (letzter && z.von <= letzter.bis) letzter.bis = Math.max(letzter.bis, z.bis);
    else aus.push({ ...z });
  }
  return aus;
}

/** Berührt der Zeitraum den Kalendertag (Suite-Zone)? Ein Ende genau um Mitternacht zählt nicht zum Folgetag. */
export function liegtAmTag(z: Zeitraum, isoTag: string): boolean {
  const g = tagesGrenzenInZone(isoTag);
  return z.von <= g.bis && z.bis > g.von;
}

/** Die Einträge eines Tages, nach Beginn sortiert. */
export function amTag<T extends Zeitraum>(eintraege: readonly T[], isoTag: string): T[] {
  return eintraege.filter((e) => liegtAmTag(e, isoTag)).sort(nachBeginn);
}

/** Ein Stück eines Zeitraums innerhalb eines Tages: `ab`/`bis` als `HH:MM`, `null` = schon vom Vortag / bis in den Folgetag. */
export type Tagesstueck = { ab: string | null; bis: string | null };

/** Die belegten Stücke eines Tages, für „belegt 19:00–22:00 Uhr“ auf der öffentlichen Seite. */
export function tagesstuecke(belegt: readonly Zeitraum[], isoTag: string): Tagesstueck[] {
  const g = tagesGrenzenInZone(isoTag);
  return amTag(belegt, isoTag).map((z) => ({
    ab: z.von >= g.von ? uhrInZone(z.von) : null,
    // Ende genau um Mitternacht: „24:00“, nicht „bis Folgetag“ — am Folgetag liegt davon nichts mehr.
    bis: z.bis <= g.bis ? uhrInZone(z.bis) : z.bis === g.bis + 1 ? "24:00" : null,
  }));
}

/* ---------------- Monatsraster ---------------- */

/** Monat `JJJJ-MM` eines Kalendertags. */
export const monatVon = (isoTag: string): string => isoTag.slice(0, 7);

/** Monat plus `n` Monate. */
export function monatPlus(monat: string, n: number): string {
  const [j, m] = monat.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Zahl der Tage eines Monats. */
function tageImMonat(monat: string): number {
  const [j, m] = monat.split("-").map(Number);
  return new Date(Date.UTC(j, m, 0)).getUTCDate();
}

/**
 * Die Zellen eines Monatskalenders, Montag zuerst: `null` für die Lücken vor dem Ersten, dann jeder Tag als
 * `JJJJ-MM-TT`. Die Zeilenzahl ergibt sich, das Raster füllt nichts auf.
 */
export function monatsRaster(monat: string): (string | null)[] {
  const erster = `${monat}-01`;
  const luecke = (wochentag(erster) + 6) % 7;
  const zellen: (string | null)[] = Array.from({ length: luecke }, () => null);
  for (let i = 0; i < tageImMonat(monat); i++) zellen.push(plusTage(erster, i));
  return zellen;
}

/** Der Zeitraum eines Monats in der Suite-Zone, um die Einträge dafür zu laden. */
export function monatsZeitraum(monat: string): Zeitraum {
  const letzter = plusTage(`${monatPlus(monat, 1)}-01`, -1);
  return { von: tagesGrenzenInZone(`${monat}-01`).von, bis: tagesGrenzenInZone(letzter).bis + 1 };
}
