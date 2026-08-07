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
        return ergebnis.ok ? ergebnis.wert : null;
      }}
      zielPfad={(id) => `/verwaltung/bz/${id}`}
    />
  );
}
