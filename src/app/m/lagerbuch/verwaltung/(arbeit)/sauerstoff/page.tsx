import type { ReactNode } from "react";
import { Col, Row } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { getDb } from "../../../_db/client";
import type { Leser } from "../../../_lib/lesepfade/bestand";
import {
  lagerorteFuerFlaschen,
  o2FlaschenUebersicht,
  type O2FlascheZeile,
} from "../../../_lib/lesepfade/o2";
import { fmtTs } from "../../../_lib/zeit";
import { Kachel } from "../../../_ui/Kachel";
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
   * Eine ungemessene Flasche zaehlt nicht als niedriger Druck. */
  const niedrig = aktive.filter((f) => f.status?.niedrig).length;

  return (
    <>
      <SeitenKopf
        titel="Sauerstoff"
        beschreibung="Flaschen mit Füllstand, Herkunft der jüngsten Messung und Standort."
      />

      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={aktive.length} beschriftung="Aktive Flaschen" />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={niedrig}
            beschriftung="Niedriger Druck"
            ton={niedrig ? "rot" : "ok"}
          />
        </Col>
      </Row>

      <SauerstoffListe zeilen={zeilen} lagerorte={lagerorte} />
    </>
  );
}

export default function SauerstoffSeite() {
  return sauerstoffSeitenInhalt(getDb());
}
