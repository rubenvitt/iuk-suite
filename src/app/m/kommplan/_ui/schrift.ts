import localFont from "next/font/local";

/**
 * Arimo — dieselbe Datei wie im Katalog (`generat.test.ts` prüft die SHA). `display: "block"`:
 * die Karten sind mit Arimo-Metriken gesetzt, ein kurz eingeblendeter Ersatzschnitt liefe aus ihnen
 * heraus. Die Zeichnung erbt die Familie vom <svg> (`style.fontFamily`), die Symbole tragen keine.
 */
export const ARIMO = localFont({
  src: [{ path: "../_fonts/Arimo-Variable.ttf", weight: "400 700", style: "normal" }],
  display: "block",
  fallback: ["Arial", "sans-serif"],
});
