/**
 * DIE FESTE CHECKLISTE EINER MÄNGELMELDUNG (IDA-298) — je Ortsart ein paar Punkte zum Anhaken, dazu
 * immer Freitext und Foto.
 *
 * Fest im Code, nicht pflegbar: die erste Fassung soll zeigen, ob die Punkte reichen. Gespeichert wird
 * der TEXT eines Punkts (`maengel.punkte`), nicht seine Stelle hier — eine geänderte Liste schreibt
 * keine alte Meldung um.
 *
 * Kein `"use client"` (Falle 6): Seite und Route lesen sie serverseitig, die Insel bekommt die Punkte
 * als Prop.
 */
import type { Einheitenart } from "../konstanten";

export type Ortsart = "fahrzeug" | "tasche" | "einheit" | "schrank";

/** Gilt für jede Ortsart und steht immer zuletzt. */
export const SONSTIGES = "Etwas anderes";

const PUNKTE: Record<Ortsart, readonly string[]> = {
  fahrzeug: [
    "Schaden an der Karosserie",
    "Licht, Blaulicht oder Signal defekt",
    "Reifen oder Fahrwerk auffällig",
    "Warnleuchte im Armaturenbrett",
    "Gerät im Fahrzeug defekt",
    "Ausrüstung fehlt",
    "Verschmutzt",
  ],
  tasche: [
    "Reißverschluss oder Verschluss defekt",
    "Tasche beschädigt",
    "Plombe fehlt oder ist offen",
    "Gerät in der Tasche defekt",
    "Ausrüstung fehlt",
    "Verschmutzt",
  ],
  einheit: [
    "Beschädigt",
    "Gerät defekt",
    "Ausrüstung fehlt",
    "Verschmutzt",
  ],
  schrank: [
    "Tür, Schloss oder Schublade defekt",
    "Fach oder Regal beschädigt",
    "Beschriftung fehlt oder ist falsch",
    "Gerät im Schrank defekt",
    "Verschmutzt",
  ],
};

export function ortsartAus(ort: { typ: "lager" | "fahrzeug"; einheitenart: Einheitenart | null }): Ortsart {
  if (ort.typ === "lager") return "schrank";
  if (ort.einheitenart === "fahrzeug") return "fahrzeug";
  if (ort.einheitenart === "tasche") return "tasche";
  return "einheit";
}

/** Die Punkte zum Anhaken, in Bildschirmreihenfolge, mit „Etwas anderes" am Ende. */
export function checklisteFuer(art: Ortsart): string[] {
  return [...PUNKTE[art], SONSTIGES];
}

/**
 * Nur Punkte aus der Liste dieser Ortsart, ohne Doppel, in Listenreihenfolge. Was der Browser schickt,
 * ist Eingabe: ein erfundener Punkt stünde sonst für immer in der Meldung.
 */
export function bereinigePunkte(eingabe: readonly unknown[], art: Ortsart): string[] {
  const gewaehlt = new Set(eingabe.filter((p): p is string => typeof p === "string"));
  return checklisteFuer(art).filter((p) => gewaehlt.has(p));
}
