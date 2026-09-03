"use client";

import { composeFromCatalog, renderSvg } from "./paket";

/** Ausbaustufe 1: beweist, dass der Katalog-Code im Browser laeuft. Aufgabe 7 baut aus. */
export default function BaukastenInsel() {
  const svg = renderSvg(composeFromCatalog({ kind: "formation" }, "Trupp"), {
    size: 96,
    idPrefix: "tz-baukasten-vorschau",
  });
  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
