import localFont from "next/font/local";

/**
 * „Einsatzzeichen Sans" aus `@einsatzzeichen/core/fonts` (seit core 6.0.0, vorher Arimo) — keine Kopie im Repo. Die drei
 * Stufen, die eine Zeichnung anfordert: 400 (Plantext), 500 (jedes Kürzel in Katalog- und eigenen Zeichen, core setzt es
 * als `CATALOG_TEXT_FONT_WEIGHT`) und 700 (fette Titel). 500 kursiv setzt core nur, wo der Baukasten nicht hinkommt
 * (`generat.test.ts` hält beides fest). Vorschübe gleich `TEXT_FONT_METRICS`.
 * `display: "block"`: die Karten sind mit diesen Metriken gesetzt, ein kurz eingeblendeter Ersatzschnitt liefe aus
 * ihnen heraus. Die Zeichnung erbt die Familie vom <svg> (`style.fontFamily`), die Symbole tragen keine.
 */
export const ZEICHENSCHRIFT = localFont({
  src: [
    { path: "../../../../../node_modules/@einsatzzeichen/core/fonts/text-regular.woff2", weight: "400", style: "normal" },
    { path: "../../../../../node_modules/@einsatzzeichen/core/fonts/text-medium.woff2", weight: "500", style: "normal" },
    { path: "../../../../../node_modules/@einsatzzeichen/core/fonts/text-bold.woff2", weight: "700", style: "normal" },
  ],
  display: "block",
  fallback: ["Arial", "sans-serif"],
});
