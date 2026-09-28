import { ZEICHEN } from "./zeichen";

/**
 * WELCHES FAVICON EIN MODUL TRÄGT — gelesen vom Root-Layout, je Anfrage nach
 * dem Host (`app/layout.tsx`, `generateMetadata`).
 *
 * Ausgeliefert wird unter `/favicon/<name>.svg` (`app/favicon/[datei]/route.ts`),
 * und dieser Pfad steht in der Durchlassliste von `core/routing.ts`. Beides ist
 * nötig: ein Pfad an der Wurzel würde auf jedem Modul-Host in DESSEN Modul
 * umgeschrieben (`/icon.svg` → `/m/qr/icon.svg`) und liefe ins 404, und die
 * Anmeldeseite braucht ihr Zeichen ohne Sitzung. Aus demselben Grund keine
 * Datei in `public/` und keine `icon.svg` nach Nexts Dateikonvention.
 *
 * `lagerbuch` behält sein eigenes Symbol, das es als PWA ohnehin ausliefert
 * (`m/lagerbuch/pwa-icon.svg`). Der Pfad ist host-relativ und nur auf dem
 * Lagerbuch-Host gültig — genau dort, und nur dort, wählt ihn diese Funktion.
 *
 * Module ohne eigenes Zeichen (Portal, Demos) tragen das IDA-Zeichen.
 */
const EIGENES_SYMBOL: Readonly<Record<string, string>> = {
  lagerbuch: "/pwa-icon.svg",
};

export type Favicon = { url: string; type: "image/svg+xml" };

export function faviconFuer(modulKey: string | null | undefined): Favicon {
  const eigenes = modulKey ? EIGENES_SYMBOL[modulKey] : undefined;
  if (eigenes) return { url: eigenes, type: "image/svg+xml" };
  const name = modulKey && modulKey in ZEICHEN ? modulKey : "ida";
  return { url: `/favicon/${name}.svg?v=${pruefsumme(ZEICHEN[name])}`, type: "image/svg+xml" };
}

/** Das Zeichen zu einem Dateinamen aus der URL, oder `null`. */
export function zeichenZuDatei(datei: string): string | null {
  const name = datei.match(/^([a-z]+)\.svg$/)?.[1];
  return name && Object.hasOwn(ZEICHEN, name) ? ZEICHEN[name] : null;
}

/**
 * Kurze Prüfsumme (FNV-1a) als Versionsanhang: ändert sich ein Zeichen, ändert
 * sich die URL, und kein Browser- oder Cloudflare-Cache hält das alte fest.
 */
function pruefsumme(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
