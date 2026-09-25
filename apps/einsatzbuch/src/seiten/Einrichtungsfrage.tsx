/**
 * Einrichtungsfrage (Stufe 5, kein Pendant in der Vorlage): Echt oder Test als Radio-Karten, Name
 * des Rechners, Suite-Adresse (bei Test änderbar, bei Echt gesperrt auf `suiteVorgabe`), dann
 * „Mit Pocket ID anmelden und einrichten“ — der Browser öffnet die Anmeldung, und die App wartet
 * auf den Rückruf (`App.tsx` setzt dafür `wartetAuf` und zeigt `Wartebildschirm` aus `./Anmelden`).
 *
 * Der frühere Entwicklerweg (`seiten/NichtEingerichtet.tsx`, gelöscht) zieht hierher: nur in
 * Debug-Builds (`status.entwicklung`) eine eigene Testdatenbank ohne Suite, mit Testvektor-
 * Schlüssel oder einer Datei. Den Dateidialog öffnet weiterhin die App, damit ein Fehler an
 * derselben Stelle landet wie jeder andere (`App.tsx`, `entwicklungEinrichtenJetzt`).
 */
import { useState } from "react";

import { Feld } from "../bausteine/Feld";
import { Karte } from "../bausteine/Karte";
import { Knopf } from "../bausteine/Knopf";

type Art = "echt" | "test";

interface EinrichtungsfrageProps {
  suiteVorgabe: string;
  entwicklung: boolean;
  beiEinrichten: (art: Art, name: string, suiteUrl: string) => void;
  beiEntwicklungEinrichten: (quelle: "vektor" | "datei", fristMinuten: number | null) => void;
}

/** Leeres oder unlesbares Feld → `null`: Dann gilt die Vorgabe in Rust (15, geklemmt auf 1 bis 120). */
function alsMinuten(text: string): number | null {
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function Einrichtungsfrage({ suiteVorgabe, entwicklung, beiEinrichten, beiEntwicklungEinrichten }: EinrichtungsfrageProps) {
  const [art, setArt] = useState<Art>("echt");
  const [name, setName] = useState("");
  const [suiteUrl, setSuiteUrl] = useState(suiteVorgabe);
  const [frist, setFrist] = useState("15");

  function waehleArt(neu: Art) {
    setArt(neu);
    // Ein echter Rechner verbindet sich nur mit der Vorgabe; ein Wechsel zurück nach „echt“
    // verwirft deshalb eine zwischenzeitlich für „test“ eingetragene Adresse.
    if (neu === "echt") setSuiteUrl(suiteVorgabe);
  }

  const nameGetrimmt = name.trim();
  const suiteGetrimmt = suiteUrl.trim();
  const gueltig = nameGetrimmt.length >= 1 && nameGetrimmt.length <= 60 && suiteGetrimmt.length > 0;

  return (
    <main className="seite seite-schmal" data-screen-label="Einrichtung">
      <div className="stapel stapel-8">
        <h1 className="titel">Diesen Rechner einrichten</h1>
      </div>
      <Karte>
        <div className="stapel stapel-20">
          <div className="reihe-umbruch reihe-12" role="radiogroup" aria-label="Art der Einrichtung">
            <label className="radiokarte">
              <input type="radio" name="art" value="echt" checked={art === "echt"} onChange={() => waehleArt("echt")} />
              <span className="radiokarte-text">
                <span className="radiokarte-titel">Echter Einsatzbuch-Rechner</span>
                <span className="radiokarte-hilfe">
                  Genau ein Rechner führt die echte Einsatzkette. Eine neue Einrichtung ersetzt den bisherigen.
                </span>
              </span>
            </label>
            <label className="radiokarte">
              <input type="radio" name="art" value="test" checked={art === "test"} onChange={() => waehleArt("test")} />
              <span className="radiokarte-text">
                <span className="radiokarte-titel">Testrechner</span>
                <span className="radiokarte-hilfe">
                  Zum Ausprobieren. Eigene Testdatenbank, eigener Schlüssel, nichts hiervon ist ein echter Einsatz.
                </span>
              </span>
            </label>
          </div>
          <Feld label="Name des Rechners" wert={name} beiAenderung={setName} maxLength={60} placeholder="z. B. Einsatzleitwagen 1" />
          <Feld label="Suite-Adresse" wert={suiteUrl} beiAenderung={setSuiteUrl} readOnly={art === "echt"} />
          <Knopf variante="primaer" className="volle-breite" disabled={!gueltig} onClick={() => beiEinrichten(art, nameGetrimmt, suiteGetrimmt)}>
            Mit Pocket ID anmelden und einrichten
          </Knopf>
        </div>
      </Karte>
      {entwicklung ? (
        <Karte titel="Entwickler-Einrichtung (nur Debug-Build)">
          <div className="stapel stapel-16">
            <div className="feld-schmal">
              <Feld label="Frist in Minuten" type="number" min={1} max={120} step={1} inputMode="numeric" wert={frist} beiAenderung={setFrist} />
            </div>
            <div className="reihe-umbruch reihe-12">
              <Knopf variante="primaer" onClick={() => beiEntwicklungEinrichten("vektor", alsMinuten(frist))}>
                Mit Testvektor-Schlüssel einrichten
              </Knopf>
              <Knopf onClick={() => beiEntwicklungEinrichten("datei", alsMinuten(frist))}>Schlüssel aus Datei …</Knopf>
            </div>
          </div>
        </Karte>
      ) : null}
    </main>
  );
}
