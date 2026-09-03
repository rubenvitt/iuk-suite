"use client";

/*
 * DER EINZIGE ORT im Repo (neben scripts/zeichen-generat.ts), der Katalog-CODE
 * importiert. Er wird ausschliesslich ueber BaukastenLader.tsx mit
 * dynamic(..., { ssr: false }) geladen und deshalb NIE serverseitig ausgewertet —
 * das ist die gemessene Bedingung dafuer, dass next.config.ts unangetastet bleibt.
 * Ein Import aus einer Server Component oder aus einer SSR-gerenderten Client-
 * Komponente bricht `pnpm build` (siehe _lib/naht.test.ts).
 *
 * WARUM HIER ZWOELF NAMEN MEHR STEHEN ALS NACH AUFGABE 2: der Baukasten braucht
 * die WERTELISTEN seiner neun Achsen und die deutschen Bezeichnungen dazu. Beides
 * fuehrt das Paket bereits — eine handgeschriebene zweite Liste im Modul liefe mit
 * dem naechsten Upgrade auseinander, ohne dass irgendetwas rot wuerde. Die einzige
 * Ausnahme bleibt `bodyVariant`: dafuer exportiert das Paket gemessen NICHTS, und
 * die Namen stehen deshalb in `_lib/bezeichnungen.ts`.
 */
export {
  composeFromCatalog,
  RECIPES,
  BASE_SYMBOLS,
  describeSymbolSpec,
  symbolKindLabel,
  ORGANIZATION_LABELS,
  STRENGTH_LABELS,
  ADMIN_LEVEL_LABELS,
  TECHNICAL_HEAD_MARK_LABELS,
  VEHICLE_CATEGORY_LABELS,
  TECHNICAL_BODY_MARK_LABELS,
  FUNCTION_ROLE_DEFINITIONS,
  functionRole,
  pictogram,
  ALL_PICTOGRAMS,
  BODY_MARK_IDS,
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
/*
 * Die Wertelisten der Achsen stehen im Schema-Paket: `SYMBOL_KINDS` und
 * `BODY_VARIANT_IDS` entstehen dort als Schluessel eines `Record<X, true>` — eine
 * fehlende Union-Variante ist ein Compilerfehler, die Vollstaendigkeit haengt also
 * nicht an einem Test. `PALETTE` traegt die dreizehn Farbtoken der technischen
 * Fuellung.
 *
 * ⛔ DER WERTIMPORT AUS `schema` STEHT AUSSCHLIESSLICH HIER. `naht.test.ts` prueft
 * auf das Praefix `@einsatzzeichen/`, nicht auf einzelne Pakete: ein Wertimport aus
 * `schema` in einer dritten Datei ist derselbe rote Test wie einer aus `catalog`.
 * Das ist richtig so — `schema` ist im Server-Graph zwar harmlos, aber die
 * Ausnahmenliste soll nicht durch eine Nebentuer wachsen.
 */
export { SYMBOL_KINDS, BODY_VARIANT_IDS, PALETTE } from "@einsatzzeichen/schema";
