"use client";

import { useEffect } from "react";
import { Button } from "antd";

/**
 * DER DRUCKANSTOSS (Entwurf §3.5).
 *
 * Zwei Wege zum selben Ziel, und beide werden gebraucht:
 *
 * 1. Beim Mount `window.print()` — wer „Aushang drucken" im Cockpit tippt, will
 *    drucken und nicht eine Seite lesen. Der neue Tab öffnet direkt den Dialog.
 * 2. Ein Knopf, weil Schritt 1 abgebrochen werden kann (Papier nachlegen,
 *    falscher Drucker) und der Tab dann ohne Ausweg dastünde.
 *
 * `className="noprint"`: der Knopf darf nicht auf dem Blatt landen. Er ist damit
 * das einzige Element der Seite, das die Druckregeln ausblenden.
 *
 * GEWARTET WIRD AUF DAS BILD, nicht auf eine geratene Zahl. Der 1024px-Code
 * kommt aus einem Route Handler, der ihn erst kodieren muss; ein `print()` davor
 * druckt ein leeres Kästchen — also genau das Gegenteil dessen, wofür diese
 * Seite existiert. `img.complete` deckt den Fall ab, dass das Bild beim Mount
 * schon im Cache liegt (dann feuert `load` nie mehr), und `error` löst den
 * Dialog trotzdem aus, damit ein kaputter Endpunkt nicht in einem Tab ohne
 * Dialog endet — der Knopf bleibt daneben stehen.
 */
export function Drucken() {
  useEffect(() => {
    const bild = document.querySelector<HTMLImageElement>(".fb-aushang-qr img");
    if (!bild || bild.complete) {
      window.print();
      return;
    }
    const drucke = () => window.print();
    bild.addEventListener("load", drucke, { once: true });
    bild.addEventListener("error", drucke, { once: true });
    return () => {
      bild.removeEventListener("load", drucke);
      bild.removeEventListener("error", drucke);
    };
  }, []);

  return (
    <div className="noprint fb-aushang-drucken">
      <Button onClick={() => window.print()}>Drucken</Button>
    </div>
  );
}
