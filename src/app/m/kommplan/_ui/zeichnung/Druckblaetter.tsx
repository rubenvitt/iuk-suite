import type { Blatt } from "../../_lib/layout/typen";
import { Blattansicht, LogoDefs, type Rahmen } from "./Blatt";
import { SymbolDefs, type Symbolsatz } from "./Symbole";

/**
 * Alle Blätter einer Druckseite: Symbole und Logo EINMAL in einem unsichtbaren SVG, jedes Blatt verweist
 * per `<use>` darauf (Befund M11; Umsetzungsplan Phase 4, Entscheidung 6 — ein 1-MB-Logo je Blatt wäre
 * ein Vielfaches davon). Die DOM-Form ist die bisherige der Druckseite (`druck.css`, `.kp-symbole`).
 */
export function Druckblaetter({ blaetter, rahmen, symbole, schrift }: { blaetter: Blatt[]; rahmen: Rahmen; symbole: Symbolsatz; schrift?: string }) {
  return (
    <>
      <svg className="kp-symbole" width="0" height="0" aria-hidden="true" focusable="false">
        <SymbolDefs symbole={symbole} />
        {rahmen.logo ? <defs><LogoDefs logo={rahmen.logo} /></defs> : null}
      </svg>
      {blaetter.map((b) => <Blattansicht key={b.nummer} blatt={b} rahmen={rahmen} symbole={symbole} schrift={schrift} mitDefs={false} />)}
    </>
  );
}
