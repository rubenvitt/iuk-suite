import localFont from "next/font/local";

/**
 * Arimo aus `@einsatzzeichen/core/fonts` (seit core 4.1.0) — keine Kopie im Repo. Nur die zwei Stufen, die eine
 * Zeichnung anfordert: 400 (Katalogzeichen, Plantext, eigene Zeichen ohne `font-weight`) und 700 (Piktogramme
 * TMO/DMO/HRT/Fax/C, fette Titel). 500 und 500 kursiv setzt core nur, wo `zerlege` das Gewicht wieder abnimmt
 * bzw. der Baukasten nicht hinkommt (`generat.test.ts` hält beides fest). Vorschübe gleich `ARIMO_TEXT_METRICS`.
 * `display: "block"`: die Karten sind mit Arimo-Metriken gesetzt, ein kurz eingeblendeter Ersatzschnitt liefe aus
 * ihnen heraus. Die Zeichnung erbt die Familie vom <svg> (`style.fontFamily`), die Symbole tragen keine.
 */
export const ARIMO = localFont({
  src: [
    { path: "../../../../../node_modules/@einsatzzeichen/core/fonts/text-regular.woff2", weight: "400", style: "normal" },
    { path: "../../../../../node_modules/@einsatzzeichen/core/fonts/text-bold.woff2", weight: "700", style: "normal" },
  ],
  display: "block",
  fallback: ["Arial", "sans-serif"],
});
