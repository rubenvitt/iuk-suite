import type { ReactNode } from "react";
import "./gemeinschaft-offen.css";

/**
 * Das Gerüst der öffentlichen Ansichten (Vorbild `files/_ui/OeffentlicherRahmen.tsx`): Fahne, Blatt, Kopfzeile.
 * Keine Shell, kein antd, kein App-Umschalter — die Seiten sind ohne Anmeldung und laufen oft auf einem
 * fremden Handy. Kein Request-Zustand hier; die Riegel stehen in Layout und Seite. Das Stylesheet hängt an
 * dieser Datei, damit keine öffentliche Seite unformatiert ausgeliefert wird.
 */
export function OffenerRahmen({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <div className="go-seite">
      <div className="go-fahne" aria-hidden="true" />
      <div className="go-blatt">
        <header className="go-kopf">
          <p className="go-kicker">
            {kicker}
            <span className="go-wortzeichen">IDA</span>
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}
