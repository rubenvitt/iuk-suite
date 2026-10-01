import "./druck.css";
import type { Blatt, Papierformat } from "../../_lib/layout/typen";
import type { Rahmen } from "../zeichnung/Blatt";
import { Druckblaetter } from "../zeichnung/Druckblaetter";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { Drucken } from "./Drucken";

/** Was eine Druckroute braucht — gebaut von `_lib/druckdaten.ts`, gleich für intern und Token. */
export interface DruckseiteDaten { format: Papierformat; blaetter: Blatt[] | null; rahmen: Rahmen; symbole: Symbolsatz }

/**
 * DIE DRUCKSEITE für vier Routen (intern/Token × A4/A3; Umsetzungsplan Phase 5, Entscheidung 13): jedes Blatt als
 * Vektor-SVG in Originalgröße, „Als PDF sichern" im Druckdialog liefert das PDF (Spec §8.1). KEIN Riegel hier — die
 * Routen riegeln (`riegel.test.ts`). Keine Hülle (sie druckte mit, Phase-1-Abweichung 6), kein antd außer in der
 * Client-Insel `Drucken`. Die Schrift kommt als Prop: `next/font` gehört in die Route, nicht in eine testbare Komponente.
 */
export function Druckseite({ daten, schrift }: { daten: DruckseiteDaten; schrift: { familie: string; klasse: string } }) {
  if (!daten.blaetter) {
    return <main className="kp-druck" data-format={daten.format}><p>Dieser Plan lässt sich nicht lesen.</p></main>;
  }
  return (
    <main className={`kp-druck ${schrift.klasse}`} data-format={daten.format}>
      <Drucken />
      <Druckblaetter format={daten.format} blaetter={daten.blaetter} rahmen={daten.rahmen} symbole={daten.symbole} schrift={schrift.familie} />
    </main>
  );
}
