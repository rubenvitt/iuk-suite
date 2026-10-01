import type { ReactNode } from "react";
import "../kommplan.css";
import "./token.css";

/**
 * DER RAHMEN DER TOKEN-ANSICHT (Entscheidung 8; Muster docs/design/feedback-oeffentliche-ansicht.md und
 * `files/_ui/OeffentlicherRahmen.tsx`): 3-px-Fahne und Wortzeichen „IDA" — die einzigen zwei Stellen mit
 * Suite-Rot im eigenen Markup —, Kicker mit dem Modulnamen (typneutral), darunter der Inhalt. KEINE Shell, kein
 * App-Umschalter, kein Request-Zustand; der Rahmen SELBST ohne antd (antd kommt nur über die Inseln Betrachter und
 * DruckMenue, dort Dichte 56/72 ohne Hülle). Breiter als die Feedback-Ansicht: der Betrachter braucht Fläche.
 */
export function TokenRahmen({ children }: { children: ReactNode }) {
  return (
    <div className="kp-token-seite">
      <div className="kp-token-fahne" aria-hidden="true" />
      <main className="kp-token-blatt">
        <p className="kp-token-kicker">KOMMUNIKATIONSPLÄNE<span className="kp-token-wortzeichen">IDA</span></p>
        {children}
      </main>
    </div>
  );
}
