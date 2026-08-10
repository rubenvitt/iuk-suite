/*
 * DIE EINE ZEICHENQUELLE DES MODULS — KEIN "use client", KEIN FREMDES PAKET.
 *
 * Zwei Fallen, gegenlaeufig, und diese Datei loest beide:
 *
 *  * Falle 6 — eine Server Component, die aus einem "use client"-Modul einen
 *    WERT importiert, bekommt eine Client-Referenz statt des Wertes. Diese
 *    Datei exportiert neben der Komponente die Tabelle PFADE, und Seiten lesen
 *    sie. Also: kein "use client".
 *  * Falle 7 — die Gegenrichtung: ein Modul, das Client sein MUESSTE und in
 *    der RSC-Ebene ausgewertet wird. Trifft hier nicht zu: die Datei ruft
 *    NICHTS auf Modulebene auf und gibt nur JSX zurueck, laeuft also in beiden
 *    Ebenen.
 *
 * WER "use client" AN DEN ANFANG SCHREIBT, VERWANDELT 7 IN 6: HTTP 200 mit
 * LEERER Map und still falschem Bild. Genau das ist `core/shell/icons.ts` bis
 * 2026-08-01 passiert und hat einen halben Tag gekostet (`:29-33`).
 * `ikonen.test.ts` riegelt es ab.
 *
 * DIE UNION IST DIE AUTORITAET. 36 Namen; `ikonen.test.ts` prueft gegen sie,
 * nicht gegen eine Aufzaehlung in der Spec. Wer ein Zeichen ergaenzt, ergaenzt
 * HIER — auch der Helfer-Weg (Teil 4) und der Etikettenbogen (Teil 6). Es gibt
 * im Modul genau eine Zeichenquelle statt zweier, damit die acht Fachzeichen
 * auf beiden Wegen gleich aussehen.
 *
 * WAS DIE REGEL NICHT BETRIFFT: die Suite-Kopfzeile. `SuiteHeader`/`SuiteNav`
 * benutzen `core/shell/icons.ts` fuer den Modulwechsler — das ist core-Code in
 * einer Client-Komponente und funktioniert. Ebenso die Zeichen, die antd
 * SELBST rendert (der Pfeil eines `Select`, das Kreuz eines `Modal`, der
 * Sortierpfeil einer `Table`): die kommen aus antds eigenem Buendel innerhalb
 * seiner Client-Komponenten und sind kein Import des Moduls.
 */

/** 28 reine UI-Zeichen und 8 Fachzeichen. Reihenfolge wie Spec 6.5.2. */
export type IkonName =
  // ── 28 reine UI-Zeichen ──────────────────────────────────────────────────
  | "pfeil-links" | "pfeil-rechts" | "chevron-rechts" | "chevron-links"
  | "plus" | "minus" | "kreuz" | "haken" | "stift" | "papierkorb" | "archiv"
  | "kopieren" | "herunterladen" | "hochladen" | "drucken" | "lupe" | "info"
  | "erneut" | "zuruecksetzen" | "verketten" | "entketten" | "tabelle" | "liste"
  | "scannen" | "qr" | "schluessel" | "taschenlampe" | "auf-ab"
  // ── 8 Fachzeichen (Spec 6.5.4) ───────────────────────────────────────────
  | "warnung" | "medizin" | "objekt" | "sauerstoff" | "akku" | "verfall"
  | "handlager-griff" | "fahrzeug";

/**
 * Ein `d`-Attribut je Name. Mehrteilige Zeichen setzen die Teilpfade mit `M`
 * hintereinander — ein `<path>` genuegt, weil alle Teile dieselbe
 * Strichfuehrung tragen.
 */
export const PFADE: Record<IkonName, string> = {
  // ── UI ───────────────────────────────────────────────────────────────────
  "pfeil-links": "M19 12H5 M12 19l-7-7 7-7",
  "pfeil-rechts": "M5 12h14 M12 5l7 7-7 7",
  "chevron-rechts": "M9 18l6-6-6-6",
  "chevron-links": "M15 18l-6-6 6-6",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  kreuz: "M18 6L6 18 M6 6l12 12",
  haken: "M20 6L9 17l-5-5",
  stift: "M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z",
  papierkorb: "M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6",
  archiv: "M21 8v13H3V8 M1 3h22v5H1z M10 12h4",
  kopieren: "M9 9h11v11H9z M5 15H4V4h11v1",
  herunterladen: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  hochladen: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
  drucken: "M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z",
  lupe: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z M21 21l-4.35-4.35",
  info: "M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z M12 16v-4 M12 8h.01",
  erneut: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  zuruecksetzen: "M1 4v6h6 M3.51 15a9 9 0 1 0 2.13-9.36L1 10",
  verketten: "M15 7h3a5 5 0 0 1 0 10h-3 M9 17H6A5 5 0 0 1 6 7h3 M8 12h8",
  entketten: "M18.36 6.64A9 9 0 0 1 20.77 15 M6.16 6.16a9 9 0 1 0 12.68 12.68 M2 2l20 20",
  tabelle: "M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18",
  liste: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  scannen: "M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M7 8v8 M11 8v8 M15 8v8",
  qr: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M18 18h3v3h-3z",
  schluessel: "M21 2l-9.6 9.6 M15.5 7.5l3 3 M8.5 21a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11Z",
  taschenlampe: "M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z M6 6h12 M12 12v3",
  "auf-ab": "M7 15l5 5 5-5 M7 9l5-5 5 5",
  // ── Fachzeichen (Spec 6.5.4) ─────────────────────────────────────────────
  warnung: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z M12 9v4 M12 17h.01",
  medizin: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21l8.84-8.61a5.5 5.5 0 0 0 0-7.78Z M3.22 12H9.5l.5-1 2 4 .5-2h5.79",
  objekt: "M16.5 9.4L7.5 4.21 M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12",
  sauerstoff: "M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2 M9.6 4.6A2 2 0 1 1 11 8H2 M12.6 19.4A2 2 0 1 0 14 16H2",
  akku: "M15 7h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2 M6 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4 M23 11v2 M11 7l-4 5h5l-4 5",
  verfall: "M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5 M16 2v4 M8 2v4 M3 10h18 M18 22a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z M18 16.5V18l1 1",
  "handlager-griff": "M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14 M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12 M18.5 19a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z M22 22l-1.5-1.5",
  fahrzeug: "M1 3h15v13H1z M16 8h4l3 3v5h-7V8Z M5.5 21a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z M18.5 21a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z",
};

/**
 * Alle Zeichen sind dekorativ. Ein Zeichen ohne sichtbaren Nachbartext wird
 * am Bedienelement benannt; der Scanner-Taschenlampenschalter traegt dort
 * zusaetzlich `aria-pressed`.
 */
export function Ikone({
  name,
  groesse = 18,
}: {
  name: IkonName;
  groesse?: number;
}) {
  return (
    <svg
      width={groesse}
      height={groesse}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ flex: "none" }}
    >
      <path d={PFADE[name]} />
    </svg>
  );
}
