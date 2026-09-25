/**
 * Karte wie `Card` der Vorlage (`components/verwaltung/daten/Card.jsx`): Fläche `--verw-karte`,
 * 1 px `--verw-rand-2`, Radius 10, Kopf 56 px mit Titel und optionalem Zusatz rechts.
 */
import type { ReactNode } from "react";

export function Karte({ titel, extra, children }: { titel?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="karte">
      {titel ? (
        <div className="karte-kopf">
          <h2 className="karte-titel">{titel}</h2>
          {extra ? <span className="karte-extra">{extra}</span> : null}
        </div>
      ) : null}
      <div className="karte-inhalt">{children}</div>
    </section>
  );
}
