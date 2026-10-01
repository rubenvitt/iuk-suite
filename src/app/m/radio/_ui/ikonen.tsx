import { Icons8Ikone, type Icons8Name } from "@/core/ikonen/Icons8Ikone";

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
 * ⛔ KEIN ZEICHENPAKET. Die Suite loest alle Zeichen ueber `core/ikonen` (Icons8) auf,
 * reine Pfaddaten ohne Context und ohne Direktive — RSC-sicher. Falle 7 (der nackte
 * antd-Zeichensatz wirft in RSC schon beim IMPORT) ist mit dem Paket gegangen;
 * `core/ikonen/ikonen.test.ts` verbietet jeden Icon-Paket-Import repo-weit,
 *
 * `_ui/ikonen.test.tsx` meldet es modul-eigen.
 *
 * ⚠️ ZUR BAUFORM-ANGABE DES PLANS, DAMIT SIE NIEMAND FALSCH LIEST: Spec:3735-3737 nennt
 * `lagerbuch/_ui/ikonen.tsx` als Vorbild. Jene Datei zeichnet seit dem 2026-08-12 NICHT
 * mehr selbst, sondern loest ueber ein Zeichenset auf (heute Icons8, `core/ikonen`;
 * `src/app/m/lagerbuch/_ui/ikonen.tsx:1-30`). Uebernommen ist deshalb die FORM —
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
 * Ein Icons8-Zeichen je Name (`core/ikonen`, Satz „Windows 11 Outline").
 *
 * Bis 2026-09-30 stand hier eine eigene Strichzeichnung im 24er-Raster. Die Suite hat
 * seitdem EINE Zeichenquelle; die Form der Datei bleibt (Liste als Autoritaet, ein Eintrag
 * je Name, eine `Ikone` an einer Stelle). „Inline-SVG" (Spec:3735) gilt weiter woertlich:
 * `Icons8Ikone` rendert ein `<svg>` aus Pfaddaten, ohne Paket und ohne Context.
 */
const ZEICHEN: Record<IkonName, Icons8Name> = {
  kacheln: "apps",
  funk: "walkie-talkie",
  zuruecksetzen: "undo",
  kreuz: "close",
  haken: "checkmark",
  "haken-kreis": "ok",
  person: "user",
  schraubenschluessel: "wrench",
  lupe: "search",
  "chevron-unten": "chevron-down",
  ortsnadel: "marker",
  "paket-offen": "open-box",
};

/**
 * Ein Zeichen. `groesse` wirkt auf Breite UND Hoehe — ein Zeichen ist quadratisch.
 *
 * `aria-hidden`, `focusable="false"` und `flex: none` stehen HIER und nicht an den
 * Aufrufstellen (Bauform `lagerbuch/_ui/ikonen.tsx:116-118`): jedes Zeichen dieser Flaeche
 * steht neben sichtbarem Text, und eine Regel, die an jeder Aufrufstelle wiederholt werden
 * muss, wird an der naechsten vergessen.
 *
 * ⛔ Kein Staerkeregler. Der Alt-Kiosk kannte keinen auf dieser Flaeche, und ein Regler
 * ohne Aufrufer ist ein zweites Aussehen ohne Grund.
 */
export function Ikone({ name, groesse = 18 }: { name: IkonName; groesse?: number }) {
  return <Icons8Ikone name={ZEICHEN[name]} groesse={groesse} data-zeichen={name} />;
}
