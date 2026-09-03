"use client";

/*
 * DER EINZIGE ORT im Repo (neben scripts/zeichen-generat.ts), der Katalog-CODE
 * importiert. Er wird ausschliesslich ueber BaukastenLader.tsx mit
 * dynamic(..., { ssr: false }) geladen und deshalb NIE serverseitig ausgewertet —
 * das ist die gemessene Bedingung dafuer, dass next.config.ts unangetastet bleibt.
 * Ein Import aus einer Server Component oder aus einer SSR-gerenderten Client-
 * Komponente bricht `pnpm build` (siehe _lib/naht.test.ts).
 */
export {
  composeFromCatalog,
  RECIPES,
  BASE_SYMBOLS,
  describeSymbolSpec,
  symbolKindLabel,
  ORGANIZATION_LABELS,
} from "@einsatzzeichen/catalog";
export {
  renderSvg,
  renderCanvas,
  rasterDimensionsForWidth,
  CompositionError,
  NotMeasuredError,
  BodyNotMeasuredError,
  VALIDATION_RULE_IDS,
} from "@einsatzzeichen/core";
