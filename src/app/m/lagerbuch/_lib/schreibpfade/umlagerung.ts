/**
 * Umlagerung zwischen zwei Lagerorten — transaktionsfrei (Festlegung H3).
 *
 * INVARIANTE I3 — NETTO NULL. Das Ziel-Leg wird STRIKT aus `teile[]` gebucht,
 * also aus der TATSAECHLICH gebuchten Verteilung, NIE aus `menge`. Ist die Quelle
 * knapp, kappt `fefoAbbuchung`; ein Ziel-Leg aus `menge` erzeugte dann Bestand AUS
 * DEM NICHTS, und die Summe aller Buchungen des Artikels waere nicht mehr gleich.
 * `umlagerung.ts:26` warnt woertlich vor genau dieser Zeile.
 *
 * BEIDE LEGS TRAGEN `typ = "umlagerung"` (`:8-9`), nicht zugang/entnahme — damit
 * Reporting und Bestellvorschlag eine INTERNE Verschiebung nicht als Wareneingang
 * oder Verbrauch missverstehen.
 * ⚠️ Genau deshalb loescht eine Umlagerung die Bestellt-Markierung NICHT (§5.5,
 * Punkt 2): nur ein `zugang` tut das, und das bleibt 1:1.
 *
 * DIE `chargeId` BLEIBT ERHALTEN — die Verfall-Provenienz wandert mit.
 */
import { buchungen, newId } from "../../_db/schema";
import { fefoAbbuchung, type Quelle, type Teil, type Tx } from "./abbuchung";

export function umlagerung(
  tx: Tx,
  args: {
    artikelId: string;
    menge: number;
    vonLagerortId: string;
    nachLagerortId: string;
    quelle: Quelle;
    kommentar: string | null;
    /** Pflicht, nicht optional: eine Umlagerung ist IMMER Teil eines Vorgangs
     *  (`check:<id>`, `entnahme-ziel:<lagerortId>`), und die Referenz ist die
     *  einzige Klammer zwischen den beiden Legs (§5.14.4). */
    referenz: string;
  },
): { umgelagert: number; teile: Teil[] } {
  const { artikelId, menge, vonLagerortId, nachLagerortId, quelle, kommentar, referenz } = args;

  const { gebucht, teile } = fefoAbbuchung(tx, {
    artikelId, menge, lagerortId: vonLagerortId, quelle, kommentar, referenz,
    typ: "umlagerung",
  });

  // ⚠️ STRIKT AUS `teile[]` — nie aus `menge`. Sonst Netto != 0.
  for (const teil of teile) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ: "umlagerung", artikelId,
      chargeId: teil.chargeId, lagerortId: nachLagerortId, menge: teil.menge,
      quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId, referenz, kommentar,
    }).run();
  }

  return { umgelagert: gebucht, teile };
}
