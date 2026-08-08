"use client";

import { geraetZuBarcode } from "../../../../_actions/bz";
import { BarcodeScanner } from "../../../../_ui/BarcodeScanner";

/**
 * Reicht ausschließlich die BZ-Suche in Teil 4s Scanner und baut den äußeren
 * Zielpfad. Normalisierung, Kamera und harte Navigation bleiben im Scanner.
 */
export function BzScanner() {
  return (
    <BarcodeScanner
      zuBarcode={async (rohwert) => {
        const ergebnis = await geraetZuBarcode(rohwert);
        // `null` heisst im Scanner „Code ist unbekannt" und wird der Person auch
        // so gemeldet. Ein gescheiterter Lesevorgang ist etwas anderes und
        // gehoert in den catch-Zweig, sonst steht am Regal die falsche Auskunft.
        if (!ergebnis.ok) throw new Error(ergebnis.fehler);
        return ergebnis.wert;
      }}
      zielPfad={(id) => `/verwaltung/bz/${id}`}
    />
  );
}
