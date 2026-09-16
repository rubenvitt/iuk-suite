/**
 * Die Faltung der Verfallsmeldungen zu Ortsgruppen (DRK-343).
 *
 * ⚠️ „ORT" UND NICHT „FAHRZEUG", SEIT DRK-377. Bis dahin konnte
 * `lagerort_verfall` nur an einer Einheit haengen (die Tabelle galt als
 * soll-gebunden); seither traegt auch die Entnahmebox gemeldete Verfaelle, und
 * sie ist ein LAGER. Die Rechnung hier ist davon unberuehrt — sie faltet ueber
 * eine Id —, die NAMEN waren es nicht.
 *
 * ⚠️ REINE FUNKTION, KEIN "use client", KEIN JSX. Sie ist die Rechnung hinter
 * der Baumtabelle, und eine falsche Rechnung sieht hier plausibel aus: eine
 * Bilanz, die abgelaufene Meldungen doppelt zaehlt, ist eine gueltige Zahl.
 * Deshalb gehoert sie in eine Datei, die `gruppierung.test.ts` ohne zu rendern
 * pruefen kann — jsdom rechnet keine Einrueckung und die Virtualisierung
 * sowieso nicht (Fallen 13/14).
 *
 * ⚠️ GEFALTET WIRD NACH DEM FILTERN, NICHT INNERHALB DER GRUPPEN. Suche und
 * Spaltenfilter laufen ueber die FLACHEN Zeilen, und erst ihr Ergebnis kommt
 * hier an. Damit faellt antds Baum-Filtersemantik komplett weg: ein Ort,
 * dessen Meldungen alle weggefiltert sind, entsteht gar nicht erst — statt als
 * leere Elternzeile stehen zu bleiben, die behauptet, es gaebe dort etwas.
 */
import type { OrtVerfallZeile } from "./OrtVerfallTabelle";
import type { Einheitenart } from "../../../_lib/konstanten";

export type OrtGruppe = {
  /**
   * ⚠️ MIT PRAEFIX, und das ist kein Schmuck. Eltern- und Kindschluessel landen
   * in DERSELBEN `rowKey`-Menge von rc-table; ein Kind heisst
   * `<lagerortId>:<artikelId>`, und ohne Praefix hiesse eine Elternzeile
   * genauso wie ihr erstes Kind, sobald Lagerort- und Artikel-ID
   * zusammenfielen. `[data-row-key]` — der einzige Greifer, der beide
   * Betriebsarten ueberlebt (Falle 14) — traefe dann zwei Knoten.
   */
  schluessel: string;
  ortId: string;
  ortName: string;
  ortKennung: string | null;
  /** DRK-377 — die Gruppenzeile entscheidet ihre Beizeile daran (`ortArt`). */
  ortTyp: "lager" | "fahrzeug";
  /** DRK-309 — die Gruppenzeile zeigt sie, wo eine Kennung fehlt. */
  ortEinheitenart: Einheitenart | null;
  /** Meldungen, deren Monatsende ueberschritten ist. */
  abgelaufen: number;
  /** Meldungen im Warnbereich, die NOCH NICHT abgelaufen sind. */
  warnend: number;
  children: OrtVerfallZeile[];
};

/**
 * ⚠️ EIN KOLLISIONSPRAEFIX, KEINE AUSSAGE UEBER DEN INHALT. Die Schreibweise
 * stammt aus DRK-343 und steht seither woertlich in `OrtVerfallTabelle.test.tsx`
 * und in `e2e/lagerbuch-verfall-fahrzeug.spec.ts` als `[data-row-key]`-Greifer;
 * sie umzubenennen kostet zwei Testdateien und bringt nichts — gebraucht wird
 * allein, dass eine Elternzeile nie so heisst wie eines ihrer Kinder.
 */
export const GRUPPE_PRAEFIX = "fzg:";

/**
 * Faltet die flachen Meldungen zu einer Gruppe je Ort.
 *
 * ⚠️ UEBER DIE ID, NICHT UEBER DEN NAMEN. `lagerorte.name` traegt keinen
 * Unique-Index und `createFahrzeug` prueft nichts — zwei „MTW" sind erlaubt.
 * Ueber den Namen gefaltet verschmelzen ihre Meldungen zu EINER Gruppe, und
 * die Bilanz darueber waere die Summe zweier Orte.
 *
 * ⚠️ DIE REIHENFOLGE FOLGT DER DRINGLICHKEIT. Zugeklappt sieht man nur die
 * Elternzeilen; stuende ein Ort mit zwei abgelaufenen Artikeln unter
 * einem mit einer bald ablaufenden Packung, haette die Gruppierung ihren Zweck
 * verfehlt. Innerhalb gleicher Dringlichkeit entscheidet der Name.
 *
 * Die Reihenfolge INNERHALB einer Gruppe bleibt, wie sie ankommt — der
 * Lesepfad sortiert bereits abgelaufen zuerst, und antd sortiert Kinder
 * ohnehin selbst, sobald jemand eine Spalte anfasst.
 */
export function gruppiereNachOrt(
  zeilen: readonly OrtVerfallZeile[],
): OrtGruppe[] {
  const gruppen = new Map<string, OrtGruppe>();

  for (const zeile of zeilen) {
    let gruppe = gruppen.get(zeile.ortId);
    if (!gruppe) {
      gruppe = {
        schluessel: `${GRUPPE_PRAEFIX}${zeile.ortId}`,
        ortId: zeile.ortId,
        ortName: zeile.ortName,
        ortKennung: zeile.ortKennung,
        ortTyp: zeile.ortTyp,
        ortEinheitenart: zeile.ortEinheitenart,
        abgelaufen: 0,
        warnend: 0,
        children: [],
      };
      gruppen.set(zeile.ortId, gruppe);
    }
    gruppe.children.push(zeile);
    // SICH AUSSCHLIESSEND: `abgelaufen` und „rot" sind nicht dasselbe
    // (`domain/verfall.ts`). Wer `warnend` als „Ton ist nicht ok" rechnet,
    // zaehlt jede abgelaufene Meldung in BEIDEN Zahlen.
    if (zeile.abgelaufen) gruppe.abgelaufen += 1;
    else gruppe.warnend += 1;
  }

  return [...gruppen.values()].sort(
    (a, b) =>
      Number(b.abgelaufen > 0) - Number(a.abgelaufen > 0)
      || b.abgelaufen - a.abgelaufen
      || a.ortName.localeCompare(b.ortName, "de"),
  );
}
