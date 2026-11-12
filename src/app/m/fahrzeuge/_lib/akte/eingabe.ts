/**
 * Eingabeprüfung der Fahrzeugakte (IDA-299). Ohne `"use client"`/`"use server"`-Direktive, damit die
 * Formulare (Client) und die Server Actions (`_actions/akte.ts`) dasselbe Schema lesen. Die Formen sind
 * die Eingabetypen aus `typen.ts`; `EingabenPassenZumVertrag` unten hält beide zur Übersetzungszeit beieinander.
 *
 * Hier steht nur, was sich an der Eingabe allein prüfen lässt. Was den Bestand braucht (Kilometerstand
 * nicht rückwärts, Tag nicht in der Zukunft, Kilometer-Pflicht beim Service), prüft `daten.ts`.
 */
import { z } from "zod";
import {
  FUEHRERSCHEINE, PRUEF_ARTEN, REIFEN_ARTEN,
  type ErledigtEingabe, type KilometerEingabe, type PruefungEingabe, type ReifensatzEingabe, type ReifenwechselEingabe, type TechnikEingabe,
} from "./typen";

/** `JJJJ-MM-TT` und ein Tag, den es gibt („2026-02-30“ fällt durch). */
export function istTag(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(j, mo - 1, t));
  return j >= 1900 && d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t;
}

const KEIN_TAG = "Gib das Datum als Tag an, zum Beispiel 03.11.2026.";

/** Pflichttag; `fehlt` ist der Satz für das leere Feld. */
const tag = (fehlt: string) =>
  z.string({ error: fehlt }).trim().min(1, fehlt).refine(istTag, KEIN_TAG);

/** Freiwilliger Tag: `null` oder ein leeres Feld heißt „nicht erfasst“. */
const tagOderLeer = z.union([z.null(), z.string().trim()], { error: KEIN_TAG })
  .transform((s) => (s === "" ? null : s))
  .refine((s) => s === null || istTag(s), KEIN_TAG);

const ganz = (min: number, max: number, satz: string) =>
  z.number({ error: satz }).int(satz).min(min, satz).max(max, satz);
const ganzOderLeer = (min: number, max: number, satz: string) => ganz(min, max, satz).nullable();

const textOderLeer = (max: number, satz: string) =>
  z.union([z.null(), z.string().trim().max(max, satz)], { error: satz }).transform((s) => (s === "" ? null : s));

export const KM_MAX = 9_999_999;
const kilometer = (fehlt: string) =>
  z.number({ error: fehlt }).int("Gib den Kilometerstand als ganze Zahl an.").min(0, "Der Kilometerstand kann nicht negativ sein.")
    .max(KM_MAX, "Dieser Kilometerstand ist zu hoch. Prüf die Zahl noch einmal.");

/** Getrimmt, Leeres raus, Dubletten raus (ohne Blick auf Groß und Klein; die erste Schreibweise bleibt). */
function ohneDubletten(liste: string[]): string[] {
  const gesehen = new Set<string>();
  return liste.filter((s) => {
    const k = s.toLocaleLowerCase("de");
    if (s === "" || gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
}

export const technikEingabe = z.object({
  modell: textOderLeer(80, "Kürz das Modell auf höchstens 80 Zeichen."),
  baujahr: ganzOderLeer(1950, 2100, "Gib das Baujahr als Jahreszahl an, zum Beispiel 2019."),
  laengeCm: ganzOderLeer(1, 3000, "Gib die Länge zwischen 0,01 und 30 Metern an."),
  breiteCm: ganzOderLeer(1, 400, "Gib die Breite zwischen 0,01 und 4 Metern an."),
  hoeheCm: ganzOderLeer(1, 500, "Gib die Höhe zwischen 0,01 und 5 Metern an."),
  zggKg: ganzOderLeer(1, 60_000, "Gib das zulässige Gesamtgewicht in Kilogramm an, höchstens 60.000."),
  leerKg: ganzOderLeer(1, 60_000, "Gib das Leergewicht in Kilogramm an, höchstens 60.000."),
  staerke: z.tuple([
    ganz(0, 9, "Gib für Führer eine Zahl von 0 bis 9 an."),
    ganz(0, 9, "Gib für Unterführer eine Zahl von 0 bis 9 an."),
    ganz(0, 20, "Gib für die Mannschaft eine Zahl von 0 bis 20 an."),
  ], { error: "Gib die Stärke als Führer, Unterführer und Mannschaft an." }).nullable(),
  sitze: ganzOderLeer(0, 99, "Gib die Sitzplätze als Zahl von 0 bis 99 an."),
  tragen: ganzOderLeer(0, 20, "Gib die Tragen als Zahl von 0 bis 20 an."),
  fuehrerschein: z.enum(FUEHRERSCHEINE, { error: "Wähl eine Führerscheinklasse aus der Liste." }).nullable(),
  besonderheiten: z.array(
    z.string({ error: "Gib jede Besonderheit als Text an." }).trim().max(40, "Kürz die Besonderheit auf höchstens 40 Zeichen."),
    { error: "Gib die Besonderheiten als Liste an." },
  ).transform(ohneDubletten).refine((l) => l.length <= 20, "Trag höchstens 20 Besonderheiten ein."),
}).superRefine((t, ctx) => {
  if (t.leerKg !== null && t.zggKg !== null && t.leerKg >= t.zggKg) {
    ctx.addIssue({ code: "custom", path: ["leerKg"], message: "Das Leergewicht muss unter dem zulässigen Gesamtgewicht liegen." });
  }
});

export const kilometerEingabe = z.object({
  km: kilometer("Gib den Kilometerstand an."),
  am: tag("Gib den Tag an, an dem du abgelesen hast.").optional(),
});

export const pruefungEingabe = z.object({
  art: z.enum(PRUEF_ARTEN, { error: "Wähl die Art der Prüfung aus der Liste." }),
  name: z.string({ error: "Gib der Prüfung einen Namen." }).trim().min(1, "Gib der Prüfung einen Namen.").max(60, "Kürz den Namen auf höchstens 60 Zeichen."),
  monate: ganz(1, 120, "Gib den Abstand in Monaten an, von 1 bis 120."),
  kmAbstand: ganzOderLeer(1000, 500_000, "Gib den Abstand nach Kilometern mit mindestens 1.000 km an oder lass das Feld leer."),
  zuletzt: tagOderLeer,
  vonHand: tagOderLeer,
});

export const erledigtEingabe = z.object({
  am: tag("Gib das Datum der Prüfung an."),
  km: kilometer("Gib den Kilometerstand an.").nullable(),
  vonHand: tagOderLeer,
  bemerkung: z.string({ error: "Gib die Bemerkung als Text an." }).trim().max(500, "Kürz die Bemerkung auf höchstens 500 Zeichen."),
});

/** `WWJJ` mit Woche 01 bis 53. */
export function istDot(s: string): boolean {
  if (!/^\d{4}$/.test(s)) return false;
  const woche = Number(s.slice(0, 2));
  return woche >= 1 && woche <= 53;
}

export const reifensatzEingabe = z.object({
  art: z.enum(REIFEN_ARTEN, { error: "Wähl die Art des Reifensatzes aus der Liste." }),
  dot: z.string({ error: "Gib die DOT-Nummer an." }).trim().min(1, "Gib die DOT-Nummer an.")
    .refine(istDot, "Gib die DOT-Nummer mit vier Ziffern an: Woche und Jahr, zum Beispiel 3822."),
  lager: z.string({ error: "Gib den Lagerort als Text an." }).trim().max(80, "Kürz den Lagerort auf höchstens 80 Zeichen."),
});

export const reifenwechselEingabe = z.object({
  aufgezogen: z.enum(REIFEN_ARTEN, { error: "Wähl den Satz, der jetzt aufgezogen ist." }),
});

/** Bricht die Übersetzung, sobald ein Schema etwas anderes herausgibt als der Vertrag in `typen.ts`. */
type Passt<A extends B, B> = A;
export type EingabenPassenZumVertrag = [
  Passt<z.output<typeof technikEingabe>, TechnikEingabe>,
  Passt<z.output<typeof kilometerEingabe>, KilometerEingabe>,
  Passt<z.output<typeof pruefungEingabe>, PruefungEingabe>,
  Passt<z.output<typeof erledigtEingabe>, ErledigtEingabe>,
  Passt<z.output<typeof reifensatzEingabe>, ReifensatzEingabe>,
  Passt<z.output<typeof reifenwechselEingabe>, ReifenwechselEingabe>,
];
