import type { ReactNode } from "react";
import { Kennzahl } from "@/core/kennzahl/Kennzahl";
import type { AmpelTon } from "../_lib/format";
import { TON } from "./Chip";

/**
 * DIE KENNZAHL DER VERWALTUNG — seit der Haarlinie (IDA-347, Etappe 3) ein
 * Adapter auf `core/kennzahl`: keine `Card` mehr, keine farbige 4px-Kante,
 * sondern eine freistehende Zahl mit Haarlinie zum Nachbarn. Die Reihe legt
 * der Aufrufer mit `Kennzahlen` an (statt `Row`/`Col`); sie bricht selbst um.
 *
 * DIE ZAHL TRAEGT TINTE, nie die Ampel (Falle 3: kein Rot auf einer
 * Datenflaeche). Den Befund traegt ein Punkt vor der Beschriftung, in der
 * Ampel des Statuschips (`TON` aus `Chip.tsx`, eine Abbildung fuer beide).
 *
 * `grau` ZEICHNET KEINEN PUNKT. Er ist kein Ampelwert (§6.6.2) — ein grauer
 * Punkt neben einem roten und einem gruenen laese sich als vierte Stufe, und
 * die gibt es nicht.
 *
 * VERLINKT (IDA-239): eine Kennzahl mit Ziel traegt ein Chevron, das beim
 * Zeigen nachrueckt; die nicht verlinkten tragen keinen Hover.
 *
 * TEXTWERTE (Standort, Klasse, „MTK in 5 T") stehen kleiner als Zahlen und
 * duerfen umbrechen: eine Zeichenkette, die nicht mit einer Ziffer oder dem
 * Platzhalter „–" beginnt, ist ein Textwert. „12 bar" und „85 %" bleiben Zahl.
 */
export function istTextwert(zahl: ReactNode): boolean {
  return typeof zahl === "string" && !/^[\d–-]/.test(zahl);
}

export function Kachel({
  zahl,
  beschriftung,
  ton,
  href,
}: {
  zahl: ReactNode;
  beschriftung: ReactNode;
  ton?: AmpelTon;
  href?: string;
}) {
  return (
    <Kennzahl
      wert={zahl}
      label={beschriftung}
      ton={ton ? TON[ton] : undefined}
      href={href}
      text={istTextwert(zahl)}
    />
  );
}
