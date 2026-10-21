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

export const TINTE = "#1a1d20";
export const TINTE_DUNKEL = "#eceef0";
export const SIGNAL = "#c8000f";
export const SIGNAL_DUNKEL = "#e45a66";
/** Grund des App-Icons (`app-icon.ts`) — auch die Portal-Kachel zeichnet ihn nach. */
export const KACHEL_GRUND = "#ffffff";

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

/**
 * Ein Zeichen ohne Farben: die Formen tragen nur die Klassen `t`/`l` (Tinte) und
 * `s`/`w` (Signal). Gefärbt wird erst beim Einbetten — als Favicon mit
 * Hell/Dunkel-Umschaltung (`ZEICHEN` unten), als App-Icon fest auf der Kachel
 * (`app-icon.ts`).
 */
export type Form = { titel: string; viewBox: string; inhalt: string };

function svg({ titel, viewBox, inhalt }: Form): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${titel}">` +
    `<title>${titel}</title>${STIL}${inhalt}</svg>`
  );
}

function modulZeichen(titel: string, gegenstand: string): Form {
  return { titel, viewBox: "0 0 64 64", inhalt: gegenstand + SIGNAL_OBEN_RECHTS };
}

/**
 * Das IDA-Zeichen selbst, in seinen Originalkoordinaten. Die `viewBox` ist das
 * Quadrat um die Vorlage (323 × 820 px), waagerecht mittig.
 */
const IDA: Form = {
  titel: "IDA",
  viewBox: "294.5 217 820 820",
  inhalt:
    `<rect class="t" x="553" y="552" width="130" height="480" rx="40"/>` +
    `<g transform="translate(618 461)">${SIGNAL_FORM}</g>`,
};

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
 * Lagerkiste: Deckel und Kasten, ausgespart Griffloch und Etikettfeld. Löst das
 * Alt-Symbol der Lagerbuch-Anwendung ab — Kachel, Favicon und PWA
 * (Rückmeldung vom 20.10.2026: dunkle Kachel mit Balken neben lauter hellen).
 */
const LAGERBUCH = modulZeichen(
  "Lagerbuch",
  `<path class="t" fill-rule="evenodd" d="M9 27h34a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Zm12 3.5v3h10v-3Z"/>` +
    `<path class="t" fill-rule="evenodd" d="M9 40h34v18a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4Zm8 6v6h18v-6Z"/>`,
);

/** Organigramm: eine Leitstelle oben, drei Teilnehmer darunter, verbunden. */
const KOMMPLAN = modulZeichen(
  "Kommunikationspläne",
  `<rect class="t" x="16" y="24" width="16" height="11" rx="3"/>` +
    `<path class="l" stroke-width="3" stroke-linejoin="round" d="M24 35v6M9.5 48v-7h29v7M24 41v7"/>` +
    [4, 18.5, 33].map((x) => `<rect class="t" x="${x}" y="48" width="11" height="12" rx="3"/>`).join(""),
);

/**
 * Rettungswagen von der Seite: Kofferaufbau mit ausgespartem Kreuz, Fahrerhaus
 * mit Scheibe, zwei Räder mit Luft zum Aufbau.
 */
const FAHRZEUGE = modulZeichen(
  "Fahrzeuge",
  `<mask id="f"><rect width="64" height="64" fill="#fff"/>` +
    `<path d="M16.5 32h4v5.5H26v4h-5.5V47h-4v-5.5H11v-4h5.5Z"/>` +
    `<rect x="35" y="38" width="7" height="5" rx="1.5"/>` +
    `<circle cx="15" cy="54" r="8.5"/><circle cx="38" cy="54" r="8.5"/></mask>` +
    `<path class="t" mask="url(#f)" d="M8 28h22a3 3 0 0 1 3 3v3h7.5a3 3 0 0 1 2.6 1.5l3.5 6.1a3 3 0 0 1 .4 1.5V51a3 3 0 0 1-3 3H8a4 4 0 0 1-4-4V32a4 4 0 0 1 4-4Z"/>` +
    `<circle class="t" cx="15" cy="54" r="6"/><circle class="t" cx="38" cy="54" r="6"/>`,
);

/** Zwei Helfer, Kopf und Schultern; der vordere steht frei vor dem hinteren. */
const HELFER_VORNE = `<circle cx="18" cy="35" r="6.5"/><path d="M5 62v-5a10 10 0 0 1 10-10h6a10 10 0 0 1 10 10v5Z"/>`;
const HELFER = modulZeichen(
  "Helfer",
  `<mask id="p"><rect width="64" height="64" fill="#fff"/>` +
    `<g stroke="#000" stroke-width="5" stroke-linejoin="round">${HELFER_VORNE}</g></mask>` +
    `<g class="t" mask="url(#p)"><circle cx="34" cy="31" r="6"/><path d="M23 56v-5a9 9 0 0 1 9-9h5a9 9 0 0 1 9 9v5Z"/></g>` +
    `<g class="t">${HELFER_VORNE}</g>`,
);

/**
 * Die Zeichen nach Dateiname (`/favicon/<name>.svg`). Die Namen sind die
 * Modulschlüssel der Registry, `ida` ist das Suite-Zeichen.
 */
export const FORMEN: Readonly<Record<string, Form>> = {
  ida: IDA,
  qr: QR,
  feedback: FEEDBACK,
  files: DATEIEN,
  aufgaben: AUFGABEN,
  radio: FUNKGERAET,
  uav: DROHNE,
  einsatzbuch: EINSATZBUCH,
  lagerbuch: LAGERBUCH,
  kommplan: KOMMPLAN,
  fahrzeuge: FAHRZEUGE,
  helfer: HELFER,
};

/** Die Favicons als fertige SVG-Dateien, gefärbt mit Hell/Dunkel-Umschaltung. */
export const ZEICHEN: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FORMEN).map(([name, form]) => [name, svg(form)]),
);
