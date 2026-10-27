/**
 * Die Regeln einer Meldung ohne Datenbank: Eingabe, Laufzeiten und die Uhrzeit des Countdowns. Eigene
 * Datei, weil auch die Verwaltung im Browser sie braucht (Vorschau des Entwurfs); `meldungen.ts` zieht
 * Drizzle mit.
 */
import { z } from "zod";
import { tagesGrenzenInZone, zeitFormat } from "@/core/zeit";

export const MELDUNG_MAX_ZEICHEN = 80;
/** Mehr passt nicht übereinander, ohne die Karte zu verdrängen. */
export const MELDUNGEN_MAX_AKTIV = 3;

export const STUNDE = 3_600_000;

/** Die wählbaren Laufzeiten; ohne Ablauf geht es nicht. */
export const LAUFZEITEN = [
  { stunden: 1, text: "1 Stunde" },
  { stunden: 4, text: "4 Stunden" },
  { stunden: 12, text: "12 Stunden" },
  { stunden: 24, text: "24 Stunden" },
  { stunden: 72, text: "3 Tage" },
  { stunden: 168, text: "7 Tage" },
] as const;
export const LAUFZEIT_VORGABE = 24;
const LAUFZEIT_WERTE = LAUFZEITEN.map((l) => l.stunden) as number[];

export interface MeldungDTO {
  id: string;
  text: string;
  zeitpunkt: string | null;
  ablaufAm: string;
  angelegtAm: string;
  angelegtVon: string;
}

export const meldungEingabe = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Bitte einen Text angeben, etwa „Nächste Lagebesprechung“.")
    .max(MELDUNG_MAX_ZEICHEN, `Höchstens ${MELDUNG_MAX_ZEICHEN} Zeichen, sonst passt es nicht in eine Zeile.`),
  /** Leer: kein Countdown. Sonst `HH:MM` in der Suite-Zone, die nächste solche Uhrzeit. */
  uhrzeit: z
    .string()
    .trim()
    .regex(/^(|([01]\d|2[0-3]):[0-5]\d)$/, "Bitte als Uhrzeit angeben, etwa 14:30.")
    .default(""),
  laufzeitStunden: z.number().refine((n) => LAUFZEIT_WERTE.includes(n), "Bitte eine Laufzeit wählen.").default(LAUFZEIT_VORGABE),
});
export type MeldungEingabe = z.input<typeof meldungEingabe>;

const TAG = zeitFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
const UHR = zeitFormat("de-DE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function minutenAus(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** `HH:MM` an diesem Kalendertag der Suite-Zone; eine Zeitumstellung am selben Tag ist berücksichtigt. */
function anTag(tag: string, hhmm: string): number {
  const soll = minutenAus(hhmm);
  const naeherung = tagesGrenzenInZone(tag).von + soll * 60_000;
  const ist = minutenAus(UHR.format(naeherung));
  return naeherung + (soll - ist) * 60_000;
}

/** Die nächste Uhrzeit `HH:MM` in der Suite-Zone ab `jetzt`: heute, oder morgen, wenn sie schon vorbei ist. */
export function naechsteUhrzeit(hhmm: string, jetzt: Date): Date {
  const heute = TAG.format(jetzt);
  const t = anTag(heute, hhmm);
  if (t > jetzt.getTime()) return new Date(t);
  const morgen = TAG.format(tagesGrenzenInZone(heute).bis + 1);
  return new Date(anTag(morgen, hhmm));
}
