"use client";

import dynamic from "next/dynamic";

/*
 * `ssr: false` IST DIE GEMESSENE BEDINGUNG, nicht Geschmack. Gemessen gegen Next
 * 16.3.3: eine Client-Komponente mit Katalogimport bricht `pnpm build`, sobald sie
 * SSR/Prerender durchlaeuft („Error occurred prerendering page", ERR_INVALID_ARG_TYPE).
 * Nur dieser Lader baut gruen — und zwar OHNE Aenderung an der suiteweiten
 * next.config.ts. Wer hier `ssr: true` setzt oder den Lader entfernt, bricht den Build
 * an einer Stelle, die nichts mit dem Baukasten zu tun hat.
 */
const BaukastenInsel = dynamic(() => import("./BaukastenInsel"), { ssr: false });

export function BaukastenLader() {
  return <BaukastenInsel />;
}
