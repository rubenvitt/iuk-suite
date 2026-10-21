import GENERAT from "./app-icon.generiert.json";
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

export type Favicon = { url: string; type: "image/svg+xml" | "image/png" };

export function faviconFuer(modulKey: string | null | undefined): Favicon {
  const eigenes = modulKey ? EIGENES_SYMBOL[modulKey] : undefined;
  if (eigenes) return { url: eigenes, type: "image/svg+xml" };
  const name = zeichenName(modulKey);
  return { url: `/favicon/${name}.svg?v=${pruefsumme(ZEICHEN[name])}`, type: "image/svg+xml" };
}

/** Das Zeichen zu einem Dateinamen aus der URL, oder `null`. */
export function zeichenZuDatei(datei: string): string | null {
  const name = datei.match(/^([a-z]+)\.svg$/)?.[1];
  return name && Object.hasOwn(ZEICHEN, name) ? ZEICHEN[name] : null;
}

/** Eine PNG-Fassung des App-Icons (`<zeichen>-<raster>.png`, `app-icon.ts`), oder `null`. */
export function pngZuDatei(datei: string): Buffer | null {
  const eintrag = Object.hasOwn(GENERAT, datei) ? (GENERAT as Record<string, { png: string }>)[datei] : undefined;
  return eintrag ? Buffer.from(eintrag.png, "base64") : null;
}

/** Name des Zeichens, das ein Modul trägt — `ida`, wenn es keines hat. */
function zeichenName(modulKey: string | null | undefined): string {
  return modulKey && modulKey in ZEICHEN ? modulKey : "ida";
}

/**
 * DAS APPLE-TOUCH-ICON EINES HOSTS — was iOS bei „Zum Home-Bildschirm" auf den
 * Startbildschirm legt, für jede Seite der Suite, auch ohne Manifest. Dasselbe
 * Zeichen wie das Favicon, als App-Icon (`app-icon.ts`).
 *
 * `lagerbuch` bekommt keines von hier: es trägt sein eigenes Symbol, und ein
 * IDA-Zeichen daneben wäre ein zweites Gesicht derselben App.
 */
export function appleIconFuer(modulKey: string | null | undefined): Favicon | undefined {
  if (modulKey && EIGENES_SYMBOL[modulKey]) return undefined;
  const datei = `${zeichenName(modulKey)}-apple-180.png`;
  return { url: `/favicon/${datei}?v=${versionVon(datei)}`, type: "image/png" };
}

/**
 * DAS APP-ICON FÜR DIE PORTAL-KACHEL eines Moduls, oder `undefined`.
 *
 * Absolut zum Portal-Host gedacht: `/favicon/` liegt in der Durchlassliste und
 * gilt auf jedem Host. Das Portal trägt das IDA-Zeichen. Module ohne Zeichen
 * (Kommunikationspläne, Demos) bekommen keines und behalten ihr Icons8-Zeichen.
 *
 * ⚠️ AUCH `lagerbuch` NIMMT HIER DAS SUITE-ZEICHEN, nicht sein eigenes Symbol:
 * dessen dunkle Kachel stand als einzige zwischen lauter hellen (Rückmeldung
 * vom 20.10.2026). Favicon und installierte PWA behalten das eigene Symbol
 * (`EIGENES_SYMBOL`) — das ist auf den Geräten eingebrannt.
 */
export function appIconFuerKachel(modulKey: string): string | undefined {
  const name = modulKey === "portal" ? "ida" : modulKey;
  if (!Object.hasOwn(ZEICHEN, name)) return undefined;
  const datei = `${name}-app-192.png`;
  return `/favicon/${datei}?v=${versionVon(datei)}`;
}

export type ManifestIcon = { src: string; sizes: string; type: string; purpose: "any" | "maskable" };

/**
 * Die PNG-Einträge für `icons` im PWA-Manifest eines Moduls. Das SVG nennt das
 * Manifest selbst (`/pwa-icon.svg` des Moduls, aus `appIconSvg` in
 * `app-icon.ts`), weil der
 * Service Worker genau diesen Pfad zwischenspeichert.
 */
export function appIconsFuerManifest(modulKey: string | null | undefined): ManifestIcon[] {
  const name = zeichenName(modulKey);
  const eintrag = (raster: string, sizes: string, purpose: ManifestIcon["purpose"]): ManifestIcon => {
    const datei = `${name}-${raster}.png`;
    return { src: `/favicon/${datei}?v=${versionVon(datei)}`, sizes, type: "image/png", purpose };
  };
  return [
    eintrag("app-192", "192x192", "any"),
    eintrag("app-512", "512x512", "any"),
    eintrag("maskierbar-512", "512x512", "maskable"),
  ];
}

function versionVon(datei: string): string {
  return (GENERAT as Record<string, { quelle: string }>)[datei].quelle;
}

/**
 * Kurze Prüfsumme (FNV-1a) als Versionsanhang: ändert sich ein Zeichen, ändert
 * sich die URL, und kein Browser- oder Cloudflare-Cache hält das alte fest.
 */
export function pruefsumme(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
