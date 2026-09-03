"use client";

import dynamic from "next/dynamic";

/*
 * `ssr: false` IST DIE GEMESSENE BEDINGUNG, nicht Geschmack — und was ohne sie
 * passiert, ist am 03.09.2026 gegen Next 16.3.3 nachgemessen worden, mit einer
 * Wegwerf-Route: eine SSR-gerenderte Client-Komponente mit Katalogimport stirbt
 * beim Modulladen an `TypeError: The "path" argument must be of type string or an
 * instance of URL. Received an instance of URL` (ERR_INVALID_ARG_TYPE) und
 * antwortet mit HTTP 500.
 *
 * ⚠️ `pnpm build` FAENGT DAS NICHT — jedenfalls nicht hier. Die Seiten dieses
 * Moduls sind dynamisch (`ƒ`), werden also nie vorgerendert; gemessen bleibt der
 * Build gruen, und der Ausfall faellt erst beim Abruf. Auf einer statischen Route
 * braeche er („Error occurred prerendering page"). Wer hier `ssr: true` setzt oder
 * den Lader entfernt, bekommt also keine rote Pipeline, sondern eine kaputte
 * Seite — deshalb steht der Riegel in `_lib/naht.test.ts` und nicht im Build.
 *
 * Der Lader baut ohne Aenderung an der suiteweiten `next.config.ts`. Dass die
 * Insel im BROWSER ueberhaupt laedt, haengt zusaetzlich an
 * `patches/@einsatzzeichen__catalog@1.1.0.patch` (Begruendung dort und in `paket.ts`).
 */
const BaukastenInsel = dynamic(() => import("./BaukastenInsel"), { ssr: false });

export function BaukastenLader() {
  return <BaukastenInsel />;
}
