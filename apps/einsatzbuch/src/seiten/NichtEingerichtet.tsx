/**
 * Seite für einen Rechner ohne Einrichtung. Die echte Einrichtung übernimmt später die Verwaltung
 * über die Anmeldung; bis dahin gibt es nur in Debug-Builds (`status.entwicklung`) den
 * Entwicklerweg, und beide Knöpfe dort richten einen Testbetrieb ein. Den Dateidialog öffnet die
 * App, damit Fehler an derselben Stelle landen wie alle anderen.
 */
import { useState } from "react";

import { Feld } from "../bausteine/Feld";
import { Karte } from "../bausteine/Karte";
import { Knopf } from "../bausteine/Knopf";

interface NichtEingerichtetProps {
  entwicklung: boolean;
  beiEinrichten: (quelle: "vektor" | "datei", fristMinuten: number | null) => void;
}

/** Leeres oder unlesbares Feld → `null`: Dann gilt die Vorgabe in Rust (15, geklemmt auf 1 bis 120). */
function alsMinuten(text: string): number | null {
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function NichtEingerichtet({ entwicklung, beiEinrichten }: NichtEingerichtetProps) {
  const [frist, setFrist] = useState("15");
  return (
    <main className="seite seite-schmal" data-screen-label="Nicht eingerichtet">
      <div className="stapel stapel-8">
        <h1 className="titel">Rechner ist noch nicht eingerichtet</h1>
        <div className="absatz">Die Einrichtung übernimmt die Verwaltung über die Anmeldung an der Suite.</div>
      </div>
      {entwicklung ? (
        <Karte titel="Entwickler-Einrichtung (nur Debug-Build)">
          <div className="stapel stapel-16">
            <div className="feld-schmal">
              <Feld label="Frist in Minuten" type="number" min={1} max={120} step={1} inputMode="numeric" wert={frist} beiAenderung={setFrist} />
            </div>
            <div className="reihe-umbruch reihe-12">
              <Knopf variante="primaer" onClick={() => beiEinrichten("vektor", alsMinuten(frist))}>
                Mit Testvektor-Schlüssel einrichten
              </Knopf>
              <Knopf onClick={() => beiEinrichten("datei", alsMinuten(frist))}>Schlüssel aus Datei …</Knopf>
            </div>
          </div>
        </Karte>
      ) : null}
    </main>
  );
}
