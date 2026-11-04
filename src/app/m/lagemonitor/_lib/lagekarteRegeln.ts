/**
 * Die Regeln der Lagekarte ohne Datenbank (IDA-348): feste Objekte, die alle Lagemonitore zeigen — Punkte mit
 * taktischem Zeichen (etwa eine Wache) und Flächen mit Palettenfarbe (etwa ein Bereitstellungsraum). Eigene Datei,
 * weil auch die Verwaltung im Browser sie braucht (Eingabe, Schwerpunkt, Ausschnitt); `lagekarte.ts` zieht Drizzle mit.
 *
 * Koordinaten stehen hier wie im Drahtformat als `[Länge, Breite]` (GeoJSON-Reihenfolge). Eine Fläche wird OFFEN
 * gespeichert (jede Ecke einmal); geschlossen wird sie erst fürs Drahtformat (`geschlosseneRing`).
 */
import { z } from "zod";
import { FARB_WERTE, type Farbe } from "./kategorieRegeln";

/** Ein Objekt im Drahtformat: `id` mit eigenem Präfix, damit sie nie mit einer Fahrzeug- oder Ort-ID zusammenfällt. */
export const LAGEKARTE_PRAEFIX = "lk-";
/** Höchstens so viele Objekte; der Monitor nimmt auch nicht mehr. */
export const LAGEKARTE_MAX = 200;
export const LAGEKARTE_NAME_MAX = 60;
/** Ecken einer Fläche, ohne den Schlusspunkt: geschlossen sind es 4 bis 201 Punkte. */
export const ECKEN_MIN = 3;
export const ECKEN_MAX = 200;

export type Art = "punkt" | "flaeche";
export type Lage = [laenge: number, breite: number];

/** Sechs Nachkommastellen sind etwa 10 cm; mehr ist Rauschen aus dem Klick und bläht nur den Körper auf. */
export function runde(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Was die Verwaltung je Objekt sieht. */
export interface LagekarteObjektDTO {
  id: string;
  art: Art;
  name: string;
  aufKarte: boolean;
  /** Nur Punkt: Schlüssel aus kommplan. */
  zeichen: string | null;
  zeichenTitel: string | null;
  /** Vorschau des Zeichens; `null`, wenn kommplan es nicht (mehr) kennt. */
  svg: string | null;
  /** Nur Fläche. */
  farbe: Farbe | null;
  breite: number | null;
  laenge: number | null;
  /** Nur Fläche: die Ecken, offen. */
  ring: Lage[] | null;
  geaendertAm: string;
  geaendertVon: string;
}

const breite = z.number({ error: "Bitte eine Zahl angeben." }).min(-90, "Zwischen -90 und 90.").max(90, "Zwischen -90 und 90.");
const laenge = z.number({ error: "Bitte eine Zahl angeben." }).min(-180, "Zwischen -180 und 180.").max(180, "Zwischen -180 und 180.");
const name = z.string().trim().min(1, "Bitte einen Namen angeben.").max(LAGEKARTE_NAME_MAX, `Höchstens ${LAGEKARTE_NAME_MAX} Zeichen.`);

/** Ein geschlossen übergebener Ring (erster == letzter) verliert den Schlusspunkt; danach zählen die Ecken. */
const ring = z
  .array(z.tuple([laenge, breite]))
  .transform((r) => (r.length > 1 && r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1] ? r.slice(0, -1) : r))
  .pipe(
    z.array(z.tuple([z.number(), z.number()]))
      .min(ECKEN_MIN, `Eine Fläche braucht mindestens ${ECKEN_MIN} Eckpunkte.`)
      .max(ECKEN_MAX, `Höchstens ${ECKEN_MAX} Eckpunkte.`),
  )
  .transform((r) => r.map(([x, y]): Lage => [runde(x), runde(y)]));

export const lagekarteEingabe = z.discriminatedUnion("art", [
  z.object({
    art: z.literal("punkt"),
    name,
    zeichen: z.string({ error: "Bitte ein Zeichen wählen." }).min(1, "Bitte ein Zeichen wählen.").max(80),
    breite: breite.transform(runde),
    laenge: laenge.transform(runde),
    aufKarte: z.boolean().default(true),
  }).strict(),
  z.object({
    art: z.literal("flaeche"),
    name,
    farbe: z.enum(FARB_WERTE, { message: "Bitte eine Farbe wählen." }),
    ring,
    aufKarte: z.boolean().default(true),
  }).strict(),
]);
export type LagekarteEingabe = z.input<typeof lagekarteEingabe>;
export type LagekarteDaten = z.output<typeof lagekarteEingabe>;

/** Der Ring fürs Drahtformat: geschlossen, der erste Punkt steht am Ende noch einmal. */
export function geschlosseneRing(ecken: readonly Lage[]): Lage[] {
  if (ecken.length === 0) return [];
  return [...ecken.map(([x, y]): Lage => [x, y]), [ecken[0][0], ecken[0][1]]];
}

/**
 * Der Beschriftungspunkt einer Fläche: der Flächenschwerpunkt (Gaußsche Trapezformel in Grad — für Flächen von
 * einigen Kilometern ist die Verzerrung der Projektion vernachlässigbar). Hat das Vieleck keine Fläche (alle Ecken
 * auf einer Linie), der Mittelwert der Ecken. Gerechnet relativ zur ersten Ecke, damit große Gradzahlen nicht die
 * Nachkommastellen fressen.
 */
export function schwerpunkt(ecken: readonly Lage[]): Lage {
  const offen = ecken.length > 1 && ecken[0][0] === ecken.at(-1)![0] && ecken[0][1] === ecken.at(-1)![1] ? ecken.slice(0, -1) : ecken;
  if (offen.length === 0) return [0, 0];
  const [x0, y0] = offen[0];
  let flaeche2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < offen.length; i++) {
    const [xa, ya] = [offen[i][0] - x0, offen[i][1] - y0];
    const [xb, yb] = [offen[(i + 1) % offen.length][0] - x0, offen[(i + 1) % offen.length][1] - y0];
    const kreuz = xa * yb - xb * ya;
    flaeche2 += kreuz;
    cx += (xa + xb) * kreuz;
    cy += (ya + yb) * kreuz;
  }
  if (Math.abs(flaeche2) < 1e-12) {
    const n = offen.length;
    return [runde(offen.reduce((s, p) => s + p[0], 0) / n), runde(offen.reduce((s, p) => s + p[1], 0) / n)];
  }
  return [runde(x0 + cx / (3 * flaeche2)), runde(y0 + cy / (3 * flaeche2))];
}

/** Die Lagen eines Objekts, etwa für den Startausschnitt der Karte. */
export function lagenVon(o: Pick<LagekarteObjektDTO, "art" | "breite" | "laenge" | "ring">): Lage[] {
  if (o.art === "flaeche") return o.ring ?? [];
  return o.breite !== null && o.laenge !== null ? [[o.laenge, o.breite]] : [];
}

/** Umschließendes Rechteck `[[West, Süd], [Ost, Nord]]`; `null` ohne Lagen. */
export function umriss(lagen: readonly Lage[]): [Lage, Lage] | null {
  if (lagen.length === 0) return null;
  let [w, s, o, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of lagen) {
    w = Math.min(w, x);
    o = Math.max(o, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return [[w, s], [o, n]];
}

/** Web-Mercator in Weltpixeln bei Zoom `z` (Kachel 512 wie maplibre). */
function welt([x, y]: Lage, z: number): [number, number] {
  const k = 512 * 2 ** z;
  const phi = (Math.max(-85, Math.min(85, y)) * Math.PI) / 180;
  return [((x + 180) / 360) * k, ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * k];
}

/**
 * Für die Vorschau (`MonitorVorschau`): eine Lage in Koordinaten der Vorschaukarte, deren Punkt (`mitteX`, `mitteY`)
 * die Lage `mitte` zeigt. `massstab` ist, wie viele Monitorpixel ein Vorschaupunkt ist (die Vorschau ist verkleinert).
 */
export function inVorschau(lage: Lage, mitte: Lage, zoom: number, flaeche: { mitteX: number; mitteY: number; massstab: number }): [number, number] {
  const [px, py] = welt(lage, zoom);
  const [mx, my] = welt(mitte, zoom);
  return [flaeche.mitteX + (px - mx) / flaeche.massstab, flaeche.mitteY + (py - my) / flaeche.massstab];
}
