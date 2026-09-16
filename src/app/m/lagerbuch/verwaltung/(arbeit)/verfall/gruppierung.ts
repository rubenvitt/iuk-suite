/**
 * Die Faltung der Verfallsmeldungen zu Fahrzeuggruppen (DRK-343).
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
 * hier an. Damit faellt antds Baum-Filtersemantik komplett weg: ein Fahrzeug,
 * dessen Meldungen alle weggefiltert sind, entsteht gar nicht erst — statt als
 * leere Elternzeile stehen zu bleiben, die behauptet, es gaebe dort etwas.
 */
import type { FahrzeugVerfallZeile } from "./FahrzeugVerfallTabelle";
import type { Einheitenart } from "../../../_lib/konstanten";

export type FahrzeugGruppe = {
  /**
   * ⚠️ MIT PRAEFIX, und das ist kein Schmuck. Eltern- und Kindschluessel landen
   * in DERSELBEN `rowKey`-Menge von rc-table; ein Kind heisst
   * `<lagerortId>:<artikelId>`, und ohne Praefix hiesse eine Elternzeile
   * genauso wie ihr erstes Kind, sobald Lagerort- und Artikel-ID
   * zusammenfielen. `[data-row-key]` — der einzige Greifer, der beide
   * Betriebsarten ueberlebt (Falle 14) — traefe dann zwei Knoten.
   */
  schluessel: string;
  fahrzeugId: string;
  fahrzeugName: string;
  fahrzeugKennung: string | null;
  /** DRK-309 — die Gruppenzeile zeigt sie, wo eine Kennung fehlt. */
  fahrzeugEinheitenart: Einheitenart | null;
  /** Meldungen, deren Monatsende ueberschritten ist. */
  abgelaufen: number;
  /** Meldungen im Warnbereich, die NOCH NICHT abgelaufen sind. */
  warnend: number;
  children: FahrzeugVerfallZeile[];
};

export const GRUPPE_PRAEFIX = "fzg:";

/**
 * Faltet die flachen Meldungen zu einer Gruppe je Fahrzeug.
 *
 * ⚠️ UEBER DIE ID, NICHT UEBER DEN NAMEN. `lagerorte.name` traegt keinen
 * Unique-Index und `createFahrzeug` prueft nichts — zwei „MTW" sind erlaubt.
 * Ueber den Namen gefaltet verschmelzen ihre Meldungen zu EINER Gruppe, und
 * die Bilanz darueber waere die Summe zweier Fahrzeuge.
 *
 * ⚠️ DIE REIHENFOLGE FOLGT DER DRINGLICHKEIT. Zugeklappt sieht man nur die
 * Elternzeilen; stuende ein Fahrzeug mit zwei abgelaufenen Artikeln unter
 * einem mit einer bald ablaufenden Packung, haette die Gruppierung ihren Zweck
 * verfehlt. Innerhalb gleicher Dringlichkeit entscheidet der Name.
 *
 * Die Reihenfolge INNERHALB einer Gruppe bleibt, wie sie ankommt — der
 * Lesepfad sortiert bereits abgelaufen zuerst, und antd sortiert Kinder
 * ohnehin selbst, sobald jemand eine Spalte anfasst.
 */
export function gruppiereNachFahrzeug(
  zeilen: readonly FahrzeugVerfallZeile[],
): FahrzeugGruppe[] {
  const gruppen = new Map<string, FahrzeugGruppe>();

  for (const zeile of zeilen) {
    let gruppe = gruppen.get(zeile.fahrzeugId);
    if (!gruppe) {
      gruppe = {
        schluessel: `${GRUPPE_PRAEFIX}${zeile.fahrzeugId}`,
        fahrzeugId: zeile.fahrzeugId,
        fahrzeugName: zeile.fahrzeugName,
        fahrzeugKennung: zeile.fahrzeugKennung,
        fahrzeugEinheitenart: zeile.fahrzeugEinheitenart,
        abgelaufen: 0,
        warnend: 0,
        children: [],
      };
      gruppen.set(zeile.fahrzeugId, gruppe);
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
      || a.fahrzeugName.localeCompare(b.fahrzeugName, "de"),
  );
}
