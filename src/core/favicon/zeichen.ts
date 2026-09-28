/**
 * DIE FAVICONS DER SUITE — das IDA-Zeichen der Anmeldeseite und je Modul eine
 * Abwandlung davon.
 *
 * DIE GRAMMATIK, damit ein weiteres Zeichen dazu passt: ein Gegenstand in Tinte
 * (volle Flächen, runde Ecken, Aussparungen statt Linien) und darüber, oben
 * rechts, das SIGNAL des IDA-Zeichens — der rote Punkt mit seinen zwei Wellen,
 * in derselben Größe und Lage in jedem Zeichen. Der Gegenstand wechselt, das
 * Signal bleibt. Rot trägt nur das Signal.
 *
 * Das Raster ist 64×64 im Maßstab des IDA-Zeichens (`components/ida-logo.tsx`):
 * dessen 820 px Höhe sind hier 64 Einheiten, das Signal ist also genau so groß
 * wie im Suite-Favicon.
 *
 * HELL/DUNKEL ÜBER `prefers-color-scheme`, NICHT über `data-theme`: ein Favicon
 * ist eine eigene Datei ohne Elternbaum (Falle 2), und es steht in der
 * Tab-Leiste des BROWSERS, deren Farbe dem Betriebssystem folgt und nicht dem
 * Umschalter der Suite. Ohne die Umschaltung verschwände die Tinte in einer
 * dunklen Tab-Leiste.
 *
 * Feste Hexwerte, keine CSS-Variablen; die Werte sind die der Anmeldeseite
 * (`components/login-form.module.css`, `--ida-stamm`, `--ida-signal`,
 * `--an-marke`).
 */

const TINTE = "#1a1d20";
const TINTE_DUNKEL = "#eceef0";
const SIGNAL = "#c8000f";
const SIGNAL_DUNKEL = "#e45a66";

/** Maßstab von den Pixeln der IDA-Vorlage (820 px hoch) auf das 64er-Raster. */
const MASSSTAB = 64 / 820;

const STIL =
  `<style>.t{fill:${TINTE}}.l{fill:none;stroke:${TINTE};stroke-linecap:round}.s{fill:${SIGNAL}}.w{fill:none;stroke:${SIGNAL};stroke-width:46;stroke-linecap:round}` +
  `@media (prefers-color-scheme:dark){.t{fill:${TINTE_DUNKEL}}.l{stroke:${TINTE_DUNKEL}}.s{fill:${SIGNAL_DUNKEL}}.w{stroke:${SIGNAL_DUNKEL}}}</style>`;

/**
 * Punkt und Wellen des IDA-Zeichens, in dessen Pixeln und um den Punkt als
 * Ursprung — die Wellen laufen von −78° bis 7° bzw. 15° (`ida-logo.tsx`).
 */
const SIGNAL_FORM =
  `<circle class="s" r="68"/>` +
  `<path class="w" d="M27.9 -131.1 A134 134 0 0 1 133 16.3"/>` +
  `<path class="w" d="M45.5 -214.2 A219 219 0 0 1 211.5 56.7"/>`;

/** Das Signal im 64er-Raster, Punkt bei (44|19) — in jedem Modulzeichen gleich. */
const SIGNAL_OBEN_RECHTS = `<g transform="translate(44 19) scale(${MASSSTAB})">${SIGNAL_FORM}</g>`;

function svg(titel: string, viewBox: string, inhalt: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${titel}">` +
    `<title>${titel}</title>${STIL}${inhalt}</svg>`
  );
}

function modulZeichen(titel: string, gegenstand: string): string {
  return svg(titel, "0 0 64 64", gegenstand + SIGNAL_OBEN_RECHTS);
}

/**
 * Das IDA-Zeichen selbst, in seinen Originalkoordinaten. Die `viewBox` ist das
 * Quadrat um die Vorlage (323 × 820 px), waagerecht mittig.
 */
const IDA = svg(
  "IDA",
  "294.5 217 820 820",
  `<rect class="t" x="553" y="552" width="130" height="480" rx="40"/>` +
    `<g transform="translate(618 461)">${SIGNAL_FORM}</g>`,
);

/** Handfunkgerät: Gehäuse mit Anzeige und Tasten, die Antenne trägt das Signal. */
const FUNKGERAET = modulZeichen(
  "Funkgeräte",
  `<rect class="t" x="39" y="26" width="7" height="12" rx="3.5"/>` +
    `<path class="t" fill-rule="evenodd" d="M20 32h22a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V36a4 4 0 0 1 4-4Zm1.5 5.5v9h19v-9Zm0 13v3.5h19V50.5Z"/>`,
);

/** QR-Code: drei Suchmuster und Datenpunkte; die vierte Ecke ist das Signal. */
const SUCHMUSTER = (x: number, y: number) =>
  `<path class="t" fill-rule="evenodd" d="M${x + 4} ${y}h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H${x + 4}a4 4 0 0 1-4-4V${y + 4}a4 4 0 0 1 4-4Zm0 4.5v9h9v-9Z"/>` +
  `<rect class="t" x="${x + 6.5}" y="${y + 6.5}" width="5" height="5" rx="1"/>`;
const QR = modulZeichen(
  "QR-Codes",
  SUCHMUSTER(3, 3) + SUCHMUSTER(3, 43) + SUCHMUSTER(43, 43) +
    `<rect class="t" x="27" y="27" width="6" height="6" rx="1.5"/>` +
    `<rect class="t" x="35" y="33" width="6" height="6" rx="1.5"/>` +
    `<rect class="t" x="27" y="43" width="6" height="6" rx="1.5"/>`,

);

/** Sprechblase mit zwei Zeilen. */
const FEEDBACK = modulZeichen(
  "Feedback",
  `<path class="t" fill-rule="evenodd" d="M10 26h28a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H22l-10 8v-8h-2a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6Zm2 9v4h24v-4Zm0 8v4h16v-4Z"/>`,
);

/** Ordner mit Reiter. */
const DATEIEN = modulZeichen(
  "Dateien",
  `<path class="t" d="M8 24h11a4 4 0 0 1 3.2 1.6L25 29h19a4 4 0 0 1 4 4v23a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V28a4 4 0 0 1 4-4Z"/>`,
);

/** Kästchen mit Haken. */
const AUFGABEN = modulZeichen(
  "Aufgaben",
  `<mask id="h"><rect width="64" height="64" fill="#fff"/><path d="M14 44l7 7 13-14" fill="none" stroke="#000" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></mask>` +
    `<rect class="t" x="6" y="26" width="36" height="34" rx="7" mask="url(#h)"/>`,
);

/** Quadrokopter von oben: Rumpf, Arme, vier Rotorkreise. */
const DROHNE = modulZeichen(
  "Drohnentraining",
  `<path class="l" stroke-width="4.5" d="M11 29l26 26M37 29L11 55"/>` +
    [
      [11, 29],
      [37, 29],
      [11, 55],
      [37, 55],
    ]
      .map(([x, y]) => `<circle class="t" cx="${x}" cy="${y}" r="6.5"/>`)
      .join("") +
    `<rect class="t" x="17" y="35" width="14" height="14" rx="4"/>`,
);

/** Buch mit Rücken und Titelschild. */
const EINSATZBUCH = modulZeichen(
  "Einsatzbuch",
  `<path class="t" fill-rule="evenodd" d="M12 26h28a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V30a4 4 0 0 1 4-4Zm4 0v36h2.5V26Zm7 8v6h15v-6Z"/>`,
);

/**
 * Die Zeichen nach Dateiname (`/favicon/<name>.svg`). Die Namen sind die
 * Modulschlüssel der Registry, `ida` ist das Suite-Zeichen.
 */
export const ZEICHEN: Readonly<Record<string, string>> = {
  ida: IDA,
  qr: QR,
  feedback: FEEDBACK,
  files: DATEIEN,
  aufgaben: AUFGABEN,
  radio: FUNKGERAET,
  uav: DROHNE,
  einsatzbuch: EINSATZBUCH,
};
