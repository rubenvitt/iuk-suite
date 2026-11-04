import type { ReactNode } from "react";
import { getDb } from "../../../_db/client";
import type { Leser } from "../../../_lib/lesepfade/bestand";
import {
  lagerorteFuerFlaschen,
  o2FlaschenUebersicht,
  type O2FlascheZeile,
} from "../../../_lib/lesepfade/o2";
import { fmtTs } from "../../../_lib/zeit";
import { Kachel } from "../../../_ui/Kachel";
import { Kennzahlen } from "@/core/kennzahl/Kennzahl";
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

export function sauerstoffSeitenInhalt(db: Leser): ReactNode {
  // EIN Abruf, wiederverwendet fuer Liste UND Kennzahlleiste — ein zweiter
  // `o2FlaschenUebersicht`-Aufruf waere ein zweiter Datenbankdurchlauf fuer
  // dieselbe Frage.
  const flaschen = o2FlaschenUebersicht(db);
  const zeilen = sauerstoffAnzeigeZeilen(flaschen);
  const lagerorte = lagerorteFuerFlaschen(db);

  const aktive = flaschen.filter((f) => f.aktiv);
  /* `?.` ist hier tragend: status === null heisst KEINE Messung, nicht 0 %.
   * Eine ungemessene Flasche zaehlt nicht als wechselbeduerftig. */
  const zuWechseln = aktive.filter((f) => f.status?.wechseln).length;

  return (
    <>
      <SeitenKopf
        titel="Sauerstoff"
      />

      <Kennzahlen>
        <Kachel zahl={aktive.length} beschriftung="Aktive Flaschen" />
        <Kachel
          zahl={zuWechseln}
          beschriftung="Wechsel fällig"
          ton={zuWechseln ? "rot" : "ok"}
        />
      </Kennzahlen>

      <SauerstoffListe zeilen={zeilen} lagerorte={lagerorte} />
    </>
  );
}

export default function SauerstoffSeite() {
  return sauerstoffSeitenInhalt(getDb());
}

export const metadata = { title: "Sauerstoff" };
