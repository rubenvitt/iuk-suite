/**
 * Der Kalender der Gemeinschaft ohne Datenbank: Eintragstypen, das Monatsfenster und die Zuordnung zu
 * Kalendertagen der Suite-Zone. Rein, damit Seite (Server) und Kalender (Client) gleich rechnen.
 */
import { tagesGrenzenInZone } from "@/core/zeit";
import { plusTage, tagInZone } from "./zeit";

/** `event` = Event der Gemeinschaft; die übrigen sind die Bar: vermietet, angefragt, gesperrt. */
export type KalenderArt = "event" | "zugesagt" | "angefragt" | "gesperrt";

export type KalenderEintrag = { id: string; art: KalenderArt; von: number; bis: number; titel: string; href: string };

export const KALENDER_LEGENDE: { art: KalenderArt; text: string }[] = [
  { art: "event", text: "Event" },
  { art: "zugesagt", text: "Bar vermietet" },
  { art: "angefragt", text: "Bar angefragt" },
  { art: "gesperrt", text: "Bar gesperrt" },
];

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Der gewählte Tag aus `?tag=`, sonst heute. Unsinn fällt still auf heute zurück. */
export function kalenderTag(param: string | string[] | undefined, heute: string): string {
  const t = Array.isArray(param) ? param[0] : param;
  if (!t || !ISO_TAG.test(t)) return heute;
  const [j, m, d] = t.split("-").map(Number);
  const x = new Date(Date.UTC(j, m - 1, d));
  if (x.getUTCFullYear() !== j || x.getUTCMonth() !== m - 1 || x.getUTCDate() !== d || j < 2000 || j > 2100) return heute;
  return t;
}

/**
 * Das Zeitfenster, das die Monatsansicht von `tag` braucht: vom Ersten des Monats eine Woche zurück bis zwei
 * Wochen nach dem Monatsende — das Raster zeigt Tage der Nachbarmonate mit.
 */
export function kalenderFenster(tag: string): { von: number; bis: number } {
  const erster = `${tag.slice(0, 7)}-01`;
  const [j, m] = erster.split("-").map(Number);
  const naechster = new Date(Date.UTC(j, m, 1)).toISOString().slice(0, 10);
  return { von: tagesGrenzenInZone(plusTage(erster, -7)).von, bis: tagesGrenzenInZone(plusTage(naechster, 14)).von };
}

/** Die Einträge, die den Kalendertag `tag` (Suite-Zone) berühren, nach Beginn. */
export function eintraegeAmTag(eintraege: readonly KalenderEintrag[], tag: string): KalenderEintrag[] {
  const { von, bis } = tagesGrenzenInZone(tag);
  return eintraege.filter((e) => e.von <= bis && e.bis > von).sort((a, b) => a.von - b.von);
}

/** Beginnt der Eintrag an diesem Tag? Sonst läuft er vom Vortag herüber. */
export function beginntAm(e: KalenderEintrag, tag: string): boolean {
  return tagInZone(e.von) === tag;
}
