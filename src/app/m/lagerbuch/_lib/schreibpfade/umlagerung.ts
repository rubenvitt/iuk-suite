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
    /** DRK-297 — die QUELLE ist ein Bereich (Handlager plus Schränke) oder ein
     *  einzelnes Fahrzeug als einelementige Liste. */
    vonOrten: readonly string[];
    nachLagerortId: string;
    /**
     * DRK-338 — GENAU DIESE Charge umlagern, statt FEFO ueber alle Chargen des
     * Artikels laufen zu lassen.
     *
     * ⚠️ DER UNTERSCHIED IST FACHLICH, NICHT KOSMETISCH. FEFO ist eine
     * ENTNAHME-Regel („nimm die aelteste zuerst") — beim UMRAEUMEN gilt sie
     * nicht: wer eine Charge aus Schrank 1 in den GF-Schrank traegt, traegt
     * DIESE, nicht die aelteste. Ohne die Einschraenkung buchte das Journal
     * eine andere Charge um als die, die physisch gewandert ist; der Fehler
     * waere STILL (Netto bleibt null, der Handlager-Bestand stimmt) und wegen
     * append-only nicht mehr zu heilen.
     *
     * Fehlt das Feld, bleibt das Verhalten unveraendert: FEFO ueber alle
     * Chargen — das ist der Weg von `check:` und `entnahme-ziel:`, wo eine
     * Nachfuellung tatsaechlich die aelteste Charge nehmen soll.
     */
    chargeId?: string;
    quelle: Quelle;
    kommentar: string | null;
    /** Pflicht, nicht optional: eine Umlagerung ist IMMER Teil eines Vorgangs
     *  (`check:<id>`, `entnahme-ziel:<lagerortId>`), und die Referenz ist die
     *  einzige Klammer zwischen den beiden Legs (§5.14.4). */
    referenz: string;
  },
): { umgelagert: number; teile: Teil[] } {
  const {
    artikelId, menge, vonOrten, nachLagerortId, chargeId, quelle, kommentar, referenz,
  } = args;

  const { gebucht, teile } = fefoAbbuchung(tx, {
    artikelId, menge, orte: vonOrten, quelle, kommentar, referenz,
    typ: "umlagerung",
    ...(chargeId ? { chargeId } : {}),
  });

  /*
   * ⚠️ EIN ZEITSTEMPEL FUER ALLE LEGS, NICHT EINER JE LEG (Codex-Review zu
   * PR #175). `new Date()` IN der Schleife liest die Uhr je Charge neu: eine
   * FEFO-Umlagerung ueber drei Chargen, die eine Sekundengrenze ueberquert,
   * bekommt zwei verschiedene `ts` — und weil `ts` auf Sekunden genau
   * gespeichert wird (`_db/schema.ts`), ist der Unterschied sichtbar.
   *
   * Wer die Legs eines Vorgangs anhand von Referenz UND Zeitpunkt
   * zusammenfasst, sieht dann ZWEI Vorgaenge, wo einer war
   * (`lesepfade/entnahmebox.ts`). Der Fehler ist still und selten, also genau
   * der, den niemand reproduziert: er haengt daran, wo die Uhr steht.
   */
  const ts = new Date();

  // ⚠️ STRIKT AUS `teile[]` — nie aus `menge`. Sonst Netto != 0.
  for (const teil of teile) {
    tx.insert(buchungen).values({
      id: newId(), ts, typ: "umlagerung", artikelId,
      chargeId: teil.chargeId, lagerortId: nachLagerortId, menge: teil.menge,
      quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId, referenz, kommentar,
    }).run();
  }

  return { umgelagert: gebucht, teile };
}
