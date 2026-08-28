import type { ReactElement } from "react";

/*
 * DIE EINE ZEICHENQUELLE DER AUSLEIHFLAECHE — Entscheidung E5 (`briefs/KOPF.md:581-586`),
 * Spec 1 §4.6.4 (`docs/superpowers/specs/2026-08-17-radio-modul-design.md:3728-3752`).
 *
 * ⛔ KEIN "use client". Diese Datei exportiert mit `IKON_NAMEN` einen WERT und mit
 * `IkonName` einen TYP, und beide werden von SERVER Components gelesen
 * (`_ui/AusleihRahmen.tsx`, und ab A18 von den Geraetezeilen). Ein "use client" hier
 * machte aus Falle 7 die Falle 6: die Server Component bekaeme eine Client-Referenz statt
 * des Wertes, HTTP 500 fuer die ganze Seite — und Vitest kann das strukturell nicht sehen
 * (`CLAUDE.md`, Falle 6 und Falle 7; die zwei Ursachen sind GEGENLAEUFIG und werden
 * ausdruecklich nicht zusammengelegt).
 *
 * ⛔ UND DESHALB KEIN FREMDES ZEICHENPAKET. Der nackte Spezifizierer des antd-Zeichensatzes
 * loest in der RSC-Ebene ueber `exports["."].node.import` auf CJS auf und ruft dort
 * `createContext` auf MODULEBENE — HTTP 500 schon beim IMPORT, nicht beim Rendern, und
 * `"use client"` behebt es NICHT, es macht es still. Gemessen und ausgeschrieben in
 * `src/core/shell/icons.test.ts:1-42`; jener Scan riegelt es repo-weit ab,
 * `_ui/ikonen.test.tsx` meldet es modul-eigen.
 *
 * ⚠️ ZUR BAUFORM-ANGABE DES PLANS, DAMIT SIE NIEMAND FALSCH LIEST: Spec:3735-3737 nennt
 * `lagerbuch/_ui/ikonen.tsx` als Vorbild. Jene Datei zeichnet seit dem 2026-08-12 NICHT
 * mehr selbst, sondern loest ueber `react-icons/pi` auf (Betreiberentscheidung E1 jenes
 * Laufs, `src/app/m/lagerbuch/_ui/ikonen.tsx:1-30`). Uebernommen ist deshalb die FORM —
 * die Namensliste als Autoritaet, ein Eintrag je Name, eine `Ikone`-Komponente, die
 * `aria-hidden`, `focusable` und `flex:none` an EINER Stelle setzt statt an jeder
 * Aufrufstelle — und ausdruecklich NICHT die Aufloesung: Spec:3735 schreibt „Inline-SVG"
 * woertlich, und Kapitel 4 der Spec bindet ueber jede Planzeile, die ihm widerspricht.
 *
 * ⛔ DIE GEOMETRIE IST EIGENE ZEICHNUNG. Aus dem Alt-Kiosk stammt die AUSWAHL der zwoelf
 * Zeichen (Spec:3728-3745 zaehlt die achtzehn lucide-Namen und benennt die sechs, die
 * wegfallen) — nicht ihre Pfaddaten. `lucide-react` ist in diesem Repo nicht installiert
 * und im Alt-Repo nicht ausgepackt (gemessen 2026-08-23:
 * `find /Users/rubeen/dev/personal/drk/radio-inventar -type d -name lucide-react` liefert
 * nichts). Eine Pfadangabe „1:1 aus lucide" waere damit eine Behauptung ohne Beleg.
 *
 * DIE LISTE IST DIE AUTORITAET. `IKON_NAMEN` ist der Wert, `IkonName` faellt daraus ab —
 * ein Name ohne Eintrag in `ZEICHEN` ist ein Typfehler, kein stilles `undefined`.
 */

/**
 * Die zwoelf Zeichen, die von den achtzehn des Alt-Kiosk uebrig bleiben (Spec:3743-3752).
 *
 * Weg sind sechs, jeder mit Grund: das Druckerzeichen, das Schlosszeichen und das
 * QR-Zeichen fallen mit ihren Flaechen (§4.9); der Ladekreisel wird von antds
 * `loading`-Zustand ersetzt; das Warnzeichen von antds `Result`; und der Kreispfeil des
 * Aktualisieren-Knopfes faellt, obwohl der Knopf bleibt — er traegt seitdem die
 * Beschriftung „Aktualisieren" statt eines dreizehnten Zeichens (Spec:3747-3752).
 *
 * Die deutschen Namen sind Hausform (`lagerbuch/_ui/ikonen.tsx:45-53`) und umlautfrei, wie
 * jeder Bezeichner dieses Moduls. In Klammern steht der Alt-Name aus Spec:3730-3733, damit
 * die Zuordnung nachschlagbar bleibt.
 */
export const IKON_NAMEN = [
  "kacheln", // LayoutGrid — Fussnavigation „Uebersicht"
  "funk", // Radio — Fussnavigation „Ausleihen"
  "zuruecksetzen", // RotateCcw — Fussnavigation „Zurueckgeben"
  "kreuz", // X — Beenden, Dialoge schliessen
  "haken", // Check — „frei"
  "haken-kreis", // CheckCircle2 — die Bestaetigung eines Vorgangs
  "person", // User — der Entleiher
  "schraubenschluessel", // Wrench — „Wartung"
  "lupe", // Search — das Suchfeld der Geraeteliste
  "chevron-unten", // ChevronDown — der auf-/zuklappbare Standortkopf
  "ortsnadel", // MapPin — der Standort einer Gruppe
  "paket-offen", // PackageOpen — der Leerzustand der Geraeteliste
] as const;

/** Der Name eines Zeichens. ⛔ Faellt aus `IKON_NAMEN` ab — keine zweite Liste. */
export type IkonName = (typeof IKON_NAMEN)[number];

/**
 * Ein Zeichen je Name, gezeichnet im 24er-Raster, als STRICHzeichnung.
 *
 * ⚠️ DIE DARSTELLUNGSART IST TEIL DES VERTRAGS: `stroke="currentColor"` und
 * `fill="none"` stehen unten an der Huelle, nicht an den einzelnen Pfaden. Wer hier ein
 * gefuelltes Zeichen ergaenzt, bekommt eine unsichtbare Flaeche mit sichtbarer Kontur —
 * und kein Tor sagt etwas dazu. (Die verwandte Lehre aus dem `lagerbuch`-Umbau: als dort
 * Strich- gegen Flaechenzeichen getauscht wurden, verschluckte das still einen Regler,
 * `~/.claude/…/lagerbuch-ux-entscheidungen.md`.)
 */
const ZEICHEN: Record<IkonName, ReactElement> = {
  kacheln: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  funk: (
    <>
      {/* Punkt in der Mitte, zwei Wellenpaare nach aussen — je Seite spiegelbildlich. */}
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 15.5a5 5 0 0 1 0-7" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M6 18a9 9 0 0 1 0-12" />
      <path d="M18 6a9 9 0 0 1 0 12" />
    </>
  ),
  zuruecksetzen: (
    <>
      {/*
        Ein fast geschlossener Kreis gegen den Uhrzeigersinn (Mittelpunkt 12/12, r=9):
        von 180° ueber unten und rechts nach oben (270° Bogen), dann 45° weiter bis 225°,
        von dort der kurze Schaft auf die Ecke der Spitze bei 3/8.
      */}
      <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  kreuz: <path d="M18 6 6 18M6 6l12 12" />,
  haken: <path d="m20 6-11 11-5-5" />,
  "haken-kreis": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.2 12.2 2.6 2.6 5-5.6" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="7.5" r="4" />
      <path d="M4.5 20.5v-1a5.5 5.5 0 0 1 5.5-5.5h4a5.5 5.5 0 0 1 5.5 5.5v1" />
    </>
  ),
  schraubenschluessel: (
    /*
      Ein geschlossener Umriss: Kopf als 5.5er-Bogen von 17.4/3.1 nach 10.3/10.2, Griff
      diagonal auf 3.6/17, runde Kappe (r=2) auf 6.4/19.8, zurueck auf 13.2/13.1, zweiter
      5.5er-Bogen auf 20.3/6 — und dann die V-Kerbe, die aus dem Kopf das offene Maul
      macht: 20.3/6 -> 17.1/9.2 -> 14.2/6.3 -> zurueck zum Anfang.
    */
    <path d="M17.4 3.1a5.5 5.5 0 0 0-7.1 7.1L3.6 17a2 2 0 0 0 2.8 2.8l6.8-6.7a5.5 5.5 0 0 0 7.1-7.1l-3.2 3.2-2.9-2.9z" />
  ),
  lupe: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.7-3.7" />
    </>
  ),
  "chevron-unten": <path d="m6 9 6 6 6-6" />,
  ortsnadel: (
    <>
      <path d="M12 21.5s7-6 7-11.5a7 7 0 1 0-14 0c0 5.5 7 11.5 7 11.5z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  "paket-offen": (
    <>
      {/* Zwei aufgeschlagene Deckelklappen, der Karton darunter, Naht und Mittelkante. */}
      <path d="M4 8.5 7 3l5 2.5L17 3l3 5.5" />
      <path d="M4 8.5V17l8 4 8-4V8.5" />
      <path d="m4 8.5 8 3.5 8-3.5" />
      <path d="M12 12v9" />
    </>
  ),
};

/**
 * Ein Zeichen. `groesse` wirkt auf Breite UND Hoehe — ein Zeichen ist quadratisch.
 *
 * `aria-hidden`, `focusable="false"` und `flex: none` stehen HIER und nicht an den
 * Aufrufstellen (Bauform `lagerbuch/_ui/ikonen.tsx:116-118`): jedes Zeichen dieser Flaeche
 * steht neben sichtbarem Text, und eine Regel, die an jeder Aufrufstelle wiederholt werden
 * muss, wird an der naechsten vergessen.
 *
 * ⛔ `strokeWidth` bleibt fest. Der Alt-Kiosk kannte keinen Staerkeregler auf dieser
 * Flaeche, und ein Regler ohne Aufrufer ist ein zweites Aussehen ohne Grund.
 */
export function Ikone({ name, groesse = 18 }: { name: IkonName; groesse?: number }) {
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
      data-zeichen={name}
      style={{ flex: "none" }}
    >
      {ZEICHEN[name]}
    </svg>
  );
}
