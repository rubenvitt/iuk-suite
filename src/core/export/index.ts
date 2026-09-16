/**
 * Der Excel-Baustein der Suite an EINER Importstelle (DRK-186).
 *
 * ⚠️ KEIN "use client" HIER, und auch KEIN Re-Export von `./client` — anders
 * als `core/tabelle/index.ts`, das beide Seiten führen darf, weil `Datentabelle`
 * eine KOMPONENTE ist. Hier wäre der Re-Export doppelt schädlich: `client.ts`
 * reichte seine Funktion als Client-Referenz in jede Server Component (Falle 6),
 * und `server.ts` zöge `node:stream` in jedes Client-Bundle. Beide Hälften
 * werden deshalb direkt importiert:
 *
 *   Route Handler   `import { xlsxAntwort } from "@/core/export/server"`
 *   Client-Insel    `import { xlsxHerunterladen } from "@/core/export/client"`
 */
export {
  blatt,
  blattname,
  freiesBlatt,
  mappe,
  type ExportSpalte,
  type ExportZelle,
  type FertigesBlatt,
  type MappenZeile,
  type MappenZelle,
} from "./spalten";
export {
  XLSX_MIME,
  ZEITZONE_DATEINAME,
  dateinameSlug,
  datierterDateiname,
  exportTag,
} from "./dateiname";
