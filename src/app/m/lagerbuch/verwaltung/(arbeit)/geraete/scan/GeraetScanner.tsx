"use client";

import { geraetZuBarcode } from "../../../../_actions/geraete";
import { BarcodeScanner } from "../../../../_ui/BarcodeScanner";

/**
 * Der gleichnamige Export in `_actions/bz` liest eine andere Tabelle. Diese
 * Hülle reicht deshalb ausschließlich die allgemeine Geräte-Suche hinein.
 */
export function GeraetScanner() {
  return (
    <BarcodeScanner
      zuBarcode={async (rohwert) => {
        const ergebnis = await geraetZuBarcode(rohwert);
        return ergebnis.ok ? ergebnis.wert : null;
      }}
      zielPfad={(id) => `/verwaltung/geraete/${id}`}
    />
  );
}
