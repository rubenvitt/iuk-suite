import { alleZeichen, type Zeichen, type ZeichenId } from "../katalog";
import { mische, zufallsfolge } from "./zufall";

/**
 * ZWEI Fragetypen. Die Bauaufgabe ist KEIN Fragetyp, sondern eine freie Uebung im
 * Baukasten (Spec §5.2, §6.5): als Fragetyp braeuchte sie den Katalog-Code auf
 * /lernen/runde — eine dritte, dynamisch geladene Insel mit gemessenen 133 KB gzip auf
 * dem Lernpfad. Und ueber die Leitner-Stufen waere sie fruehestens am 27. Tag erreichbar
 * gewesen: der teuerste Fragetyp vier Wochen lang toter Code.
 */
export const FRAGETYPEN = ["zeichen_bedeutung", "bedeutung_zeichen"] as const;
export type Fragetyp = (typeof FRAGETYPEN)[number];

export interface Frage {
  readonly zeichenId: ZeichenId;
  readonly typ: Fragetyp;
  /** Bedeutungstext bei `bedeutung_zeichen`, sonst "" (dann traegt das SVG die Frage). */
  readonly stamm: string;
  readonly optionen: readonly { id: ZeichenId; antwort: string; svg: string | null }[];
}

const OPTIONEN = 4;

/**
 * Der fragbare Bestand: die 232 Hauptrezepte.
 *
 * Ausgeschlossen sind die 14 Grundzeichen (ihre `bedeutung` ist die Titelwiederholung)
 * und — schon im Generat — die 10 `#alternative` (identischer Titel, also zwei richtige
 * Antworten) sowie die 269 Piktogramme.
 *
 * `nur` schraenkt auf ein Lernset ein.
 */
export function fragbareZeichen(nur?: readonly ZeichenId[]): readonly Zeichen[] {
  const menge = nur ? new Set(nur) : null;
  return alleZeichen().filter(
    (z) => !z.id.startsWith("grund:") && (menge === null || menge.has(z.id)),
  );
}

/**
 * Baut eine Frage mit drei Distraktoren.
 *
 * DIE DISTRAKTOREN KOMMEN IMMER AUS `bestand` — also aus dem ganzen fragbaren Katalog,
 * auch wenn die Runde auf ein Lernset eingeschraenkt ist. Kaemen sie aus dem Set,
 * verriete ein Set mit 15 Zeichen bei der vierten Frage die Loesung.
 *
 * Drei Stufen (Spec §5.3, gemessen an der Kapitelverteilung: 212 von 232 Zeichen haben
 * im eigenen Kapitel mindestens drei Kandidaten; die zwoelf kleinsten Kapitel umfassen
 * zusammen nur 20 Zeichen):
 *   1. gleiches Kapitel — die fachliche Nachbarschaft (Loeschstaffel gegen Loeschgruppe)
 *   2. gleiche Grundform als Rueckfall
 *   3. ganzer Bestand
 */
export function baueFrage(
  ziel: Zeichen,
  typ: Fragetyp,
  bestand: readonly Zeichen[],
  seed: number,
): Frage {
  if (typ === "bedeutung_zeichen" && ziel.mehrdeutigerTitel) {
    // Bei dieser Richtung ist das ZEICHEN die Antwort, und zwei Zeichen mit demselben
    // Titel waeren beide richtig. Der Aufrufer waehlt fuer diese sechs IDs die andere
    // Richtung (`naechsteFrage` unten tut das).
    throw new Error(`bedeutung_zeichen ist fuer ${ziel.id} mehrdeutig`);
  }

  const taugt = (k: Zeichen) =>
    k.id !== ziel.id &&
    k.antwort !== ziel.antwort &&
    k.id !== ziel.zweiteDarstellung?.id;

  const stufen = [
    bestand.filter((k) => k.kapitel === ziel.kapitel && taugt(k)),
    bestand.filter((k) => k.grundform === ziel.grundform && taugt(k)),
    bestand.filter(taugt),
  ];

  const gewaehlt: Zeichen[] = [];
  const gesehen = new Set<string>();
  for (const stufe of stufen) {
    for (const k of mische(stufe, seed)) {
      if (gewaehlt.length >= OPTIONEN - 1) break;
      if (gesehen.has(k.id)) continue;
      gesehen.add(k.id);
      gewaehlt.push(k);
    }
    if (gewaehlt.length >= OPTIONEN - 1) break;
  }

  const alle = mische([ziel, ...gewaehlt], seed + 1);
  return {
    zeichenId: ziel.id,
    typ,
    stamm: typ === "bedeutung_zeichen" ? ziel.bedeutung : "",
    optionen: alle.map((z) => ({
      id: z.id,
      antwort: z.antwort,
      svg: typ === "bedeutung_zeichen" ? z.svg : null,
    })),
  };
}

/**
 * Waehlt die Richtung. Erkennen kommt vor Benennen: bis Stufe 1 immer
 * `zeichen_bedeutung`, ab Stufe 2 gewuerfelt.
 *
 * Die sechs Zeichen mit mehrdeutigem Titel bekommen IMMER `zeichen_bedeutung` — dort ist
 * `antwort` die Antwort, und die traegt die Organisation.
 */
export function richtungFuer(ziel: Zeichen, stufe: number, seed: number): Fragetyp {
  if (ziel.mehrdeutigerTitel) return "zeichen_bedeutung";
  if (stufe <= 1) return "zeichen_bedeutung";
  return zufallsfolge(seed)() < 0.5 ? "zeichen_bedeutung" : "bedeutung_zeichen";
}
