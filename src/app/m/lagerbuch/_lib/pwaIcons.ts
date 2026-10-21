import { appIconSvg } from "@/core/favicon/app-icon";
import { pngZuDatei } from "@/core/favicon";

/**
 * DIE PWA-SYMBOLE DES LAGERBUCHS — §7.10.2, seit dem 21.10.2026 das App-Icon
 * der Suite mit dem Lagerbuch-Zeichen (`core/favicon/zeichen.ts`, `LAGERBUCH`).
 *
 * Bis dahin standen hier byte-exakt die Symbole der Alt-Anwendung (`lagerbuch`
 * @ ca04eb1: dunkle Kachel, rote und zwei weisse Regalmarken). Neben den hellen
 * Kacheln der übrigen Module fiel das auf (Rückmeldung vom 20.10.2026); Ruben
 * hat entschieden, alle Symbole umzustellen. Eine schon installierte PWA behält
 * ihr eingebranntes Symbol, bis sie neu installiert wird.
 *
 * Die PNGs kommen aus `app-icon.generiert.json` (`scripts/app-icon-generat.ts`),
 * dieselben wie für jedes andere Modul. Die Pfade bleiben die alten
 * (`/icon-192.png` …), weil installierte Manifeste genau diese nennen.
 *
 * WARUM ROUTE HANDLER UND NICHT `public/`: `src/proxy.ts` schliesst vom Matcher
 * nur `_next/static|_next/image|favicon.ico` aus. `/icon-192.png` wird auf dem
 * lagerbuch-Host also nach `/m/lagerbuch/icon-192.png` umgeschrieben und liefe
 * ins 404 — waehrend dieselbe Datei auf JEDEM ANDEREN Host an der Wurzel
 * ausgeliefert wuerde (Falle 56). Route Handler unter dem Modul loesen beides.
 *
 * KEIN "use client" (Falle 6): die vier Route Handler sind Server-Dateien; ein
 * WERT aus einem Client-Modul kaeme dort als Client-Referenz an.
 */

function png(datei: string): Buffer {
  const puffer = pngZuDatei(datei);
  if (!puffer) throw new Error(`${datei} fehlt in app-icon.generiert.json`);
  return puffer;
}

export const ICON_192 = png("lagerbuch-app-192.png");
export const ICON_512 = png("lagerbuch-app-512.png");
export const ICON_MASKABLE_512 = png("lagerbuch-maskierbar-512.png");

export const PWA_ICON_SVG = appIconSvg("lagerbuch");

/**
 * Die EINE Antwortform der drei PNG-Handler (§7.10.2).
 *
 * `immutable` fuer eine Woche: die Bytes sind Konstanten im Bundle. Aendert
 * sich das Symbol, sieht ein Browser mit dem alten im Cache es bis zu eine
 * Woche spaeter — eine installierte PWA hat es ohnehin eingebrannt.
 */
export function pngAntwort(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
