import { getDb } from "../../../_db/client";
import {
  lagerorteFuerFlaschen,
  o2FlaschenUebersicht,
  type O2FlascheZeile,
} from "../../../_lib/lesepfade/o2";
import { fmtTs } from "../../../_lib/zeit";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import {
  SauerstoffListe,
  type SauerstoffAnzeigeZeile,
} from "./SauerstoffListe";

export const dynamic = "force-dynamic";

/**
 * Die einzige RSC→Client-Grenze dieses Pfads: Date wird hier in fertigen
 * Anzeigetext verwandelt und kann nicht versehentlich serialisiert werden.
 */
export function sauerstoffAnzeigeZeilen(
  zeilen: O2FlascheZeile[],
): SauerstoffAnzeigeZeile[] {
  return zeilen.map(({ letzteMessung, ...zeile }) => ({
    ...zeile,
    letzteMessungText: letzteMessung === null ? null : fmtTs(letzteMessung),
  }));
}

export default function SauerstoffSeite() {
  const db = getDb();
  const zeilen = sauerstoffAnzeigeZeilen(o2FlaschenUebersicht(db));
  const lagerorte = lagerorteFuerFlaschen(db);

  return (
    <>
      <SeitenKopf
        titel="Sauerstoff"
        beschreibung="Flaschen mit Füllstand, Herkunft der jüngsten Messung und Standort."
      />
      <SauerstoffListe zeilen={zeilen} lagerorte={lagerorte} />
    </>
  );
}

