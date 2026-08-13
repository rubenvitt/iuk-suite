import type { ReactNode } from "react";
import { Col, Row } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { getDb, type DB } from "../../../_db/client";
import {
  bzAkkuKennzahlGesamt,
  bzGeraeteUebersicht,
  lagerortOptionen,
} from "../../../_lib/lesepfade/bz";
import { Kachel } from "../../../_ui/Kachel";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { BzListe } from "./BzListe";
import { bzAnzeigeZeilen } from "./bzAnzeige";

export const dynamic = "force-dynamic";

export function bzSeitenInhalt(db: DB, jetzt: Date): ReactNode {
  const geraete = bzGeraeteUebersicht(db, jetzt);
  const zeilen = bzAnzeigeZeilen(geraete);
  const lagerorte = lagerortOptionen(db);

  const aktive = geraete.filter((g) => g.aktiv);
  const faellig = aktive.filter((g) => g.faelligkeit.ampel !== "gruen").length;
  /*
   * ⚠️ `nieGeprueft` MUSS mitgezaehlt werden. `domain/bz.ts#bzFaelligkeit`
   * liefert fuer ein nie geprueftes Geraet `ampel: "rot"` bei
   * `ueberfaellig: false` — wer nur `ueberfaellig` zaehlt, meldet den
   * schlechtesten Fall im Bestand als unauffaellig. Das Original zaehlt
   * genauso (lagerbuch/src/app/verwaltung/(admin)/bz/page.tsx:17).
   */
  const ueberfaellig = aktive.filter(
    (g) => g.faelligkeit.ueberfaellig || g.faelligkeit.nieGeprueft,
  ).length;

  const akku = bzAkkuKennzahlGesamt(db);
  /* `null` = weniger als zwei Wechsel, also kein Intervall messbar. Das ist
   * kein Missstand und bekommt deshalb keinen Warnton. */
  const akkuText = akku.tageDurchschnitt === null
    ? "–"
    : `${Math.round(akku.tageDurchschnitt)} T`;

  return (
    <>
      <SeitenKopf
        titel="BZ-Kontrolle"
        beschreibung="Blutzuckermessgeräte mit Kontrollfrist, Referenzbereichen und Logbuch."
      />

      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={aktive.length} beschriftung="Aktive Geräte" />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={faellig}
            beschriftung="Kontrolle fällig/bald"
            ton={faellig ? "gelb" : "ok"}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={ueberfaellig}
            beschriftung="Überfällig / nie geprüft"
            ton={ueberfaellig ? "rot" : "ok"}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={akkuText} beschriftung="Ø Akku-Lebensdauer" />
        </Col>
      </Row>

      <BzListe zeilen={zeilen} lagerorte={lagerorte} />
    </>
  );
}

export default function BzSeite() {
  return bzSeitenInhalt(getDb(), new Date());
}
