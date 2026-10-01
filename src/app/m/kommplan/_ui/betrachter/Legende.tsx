import type { LegendenEintrag } from "../../_lib/layout/typen";
import { LEGENDEN_SYMBOL, LegendenSymbol } from "../zeichnung/LegendenSymbol";

/**
 * Legende unter der Fläche (Spec §5.6, A3) — verwendete Arten und Reservekanäle, wie auf dem Blatt.
 * Aus `Betrachter.tsx` herausgelöst; Betrachter und Editor rendern sie. `null` ohne Einträge.
 */
export function Legende({ eintraege }: { eintraege: LegendenEintrag[] }) {
  if (eintraege.length === 0) return null;
  return (
    <ul className="kp-legende" aria-label="Legende">
      {eintraege.map((e, i) => (
        <li key={i} data-legende={e.reserve ? "reserve" : e.art}>
          <svg viewBox={`0 0 ${LEGENDEN_SYMBOL.breite} ${LEGENDEN_SYMBOL.hoehe}`} width={LEGENDEN_SYMBOL.breite * 4} height={LEGENDEN_SYMBOL.hoehe * 4} aria-hidden="true">
            <LegendenSymbol art={e.art} />
          </svg>
          <span>{e.text}</span>
        </li>
      ))}
    </ul>
  );
}
