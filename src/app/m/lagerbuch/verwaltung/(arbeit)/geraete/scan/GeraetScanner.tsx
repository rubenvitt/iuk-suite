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
        // `null` heisst im Scanner „Code ist unbekannt" und wird der Person auch
        // so gemeldet. Ein gescheiterter Lesevorgang ist etwas anderes und
        // gehoert in den catch-Zweig, sonst steht am Regal die falsche Auskunft.
        if (!ergebnis.ok) throw new Error(ergebnis.fehler);
        return ergebnis.wert;
      }}
      zielPfad={(id) => `/verwaltung/geraete/${id}`}
    />
  );
}
