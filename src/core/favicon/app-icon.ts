import { FORMEN, SIGNAL, TINTE, type Form } from "./zeichen";

/**
 * DAS APP-ICON DER SUITE — dasselbe Zeichen wie das Favicon, auf einer weißen
 * Kachel: Startbildschirm, iOS „Zum Home-Bildschirm" und die PWA-Manifeste.
 *
 * Fest hell, ohne `prefers-color-scheme`: ein Startbildschirm-Symbol wird beim
 * Installieren eingebrannt und schaltet nicht um. Die Farben sind die hellen
 * des Favicons, Rot trägt weiter nur das Signal.
 *
 * Jeder Host trägt das Zeichen seines Moduls (wie beim Favicon), sonst das
 * IDA-Zeichen — so bleiben mehrere installierte Suite-Apps auf einem
 * Startbildschirm unterscheidbar.
 *
 * DREI ZUSCHNITTE, weil die Plattformen verschieden beschneiden:
 *   - `rund`: abgerundete Kachel mit durchsichtigen Ecken (`purpose: "any"`).
 *   - `maskierbar`: randlos, das Zeichen in der Schutzzone (Kreis mit 40 %
 *     Radius), damit Android es in jede Maskenform schneiden kann.
 *   - `apple`: randlos ohne Transparenz — iOS rundet selbst und füllt
 *     Durchsichtiges schwarz.
 *
 * Die PNGs sind eingecheckt (`app-icon.generiert.json`, erzeugt von
 * `scripts/app-icon-generat.ts`), weil die Suite zur Laufzeit kein
 * Rasterwerkzeug hat; `app-icon.test.ts` fängt eine vergessene Neuerzeugung.
 */

export type Zuschnitt = "rund" | "maskierbar" | "apple";

const GRUND = "#ffffff";
const KANTE = 512;

/** Kantenlänge des Zeichens auf der 512er-Kachel je Zuschnitt. */
const ZEICHENGROESSE: Record<Zuschnitt, number> = {
  rund: 320,
  // Ein Quadrat mit Kante 280 hat eine Diagonale von 396 — innerhalb des
  // Schutzkreises (Durchmesser 0,8 × 512 = 410).
  maskierbar: 280,
  apple: 320,
};

const STIL =
  `<style>.t{fill:${TINTE}}.l{fill:none;stroke:${TINTE};stroke-linecap:round}` +
  `.s{fill:${SIGNAL}}.w{fill:none;stroke:${SIGNAL};stroke-width:46;stroke-linecap:round}</style>`;

function kachel(zuschnitt: Zuschnitt): string {
  return zuschnitt === "rund"
    ? `<rect width="${KANTE}" height="${KANTE}" rx="112" fill="${GRUND}"/>`
    : `<rect width="${KANTE}" height="${KANTE}" fill="${GRUND}"/>`;
}

function appIconAusForm(form: Form, zuschnitt: Zuschnitt): string {
  const g = ZEICHENGROESSE[zuschnitt];
  const o = (KANTE - g) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${KANTE} ${KANTE}" role="img" aria-label="${form.titel}">` +
    `<title>${form.titel}</title>${STIL}${kachel(zuschnitt)}` +
    `<svg x="${o}" y="${o}" width="${g}" height="${g}" viewBox="${form.viewBox}">${form.inhalt}</svg></svg>`
  );
}

/** Das App-Icon eines Zeichens als SVG; `name` ist ein Schlüssel aus `FORMEN`. */
export function appIconSvg(name: string, zuschnitt: Zuschnitt = "rund"): string {
  const form = Object.hasOwn(FORMEN, name) ? FORMEN[name] : FORMEN.ida;
  return appIconAusForm(form, zuschnitt);
}

/**
 * Die gerasterten Fassungen: Dateiname unter `/favicon/` → Zuschnitt und Kante.
 * 180 ist die Größe, die iOS für `apple-touch-icon` anfragt; 192 und 512 sind
 * die beiden, die Chrome zum Installieren verlangt.
 */
export const RASTER: Readonly<Record<string, { zuschnitt: Zuschnitt; kante: number }>> = {
  "app-192": { zuschnitt: "rund", kante: 192 },
  "app-512": { zuschnitt: "rund", kante: 512 },
  "maskierbar-512": { zuschnitt: "maskierbar", kante: 512 },
  "apple-180": { zuschnitt: "apple", kante: 180 },
};

/** Alle PNG-Dateinamen, die es geben muss: `<zeichen>-<raster>.png`. */
export function rasterDateien(): { datei: string; name: string; zuschnitt: Zuschnitt; kante: number }[] {
  return Object.keys(FORMEN).flatMap((name) =>
    Object.entries(RASTER).map(([raster, r]) => ({ datei: `${name}-${raster}.png`, name, ...r })),
  );
}
