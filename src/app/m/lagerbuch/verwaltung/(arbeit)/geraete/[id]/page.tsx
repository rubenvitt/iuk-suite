import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Col, Row } from "antd";
import { getDb, type DB } from "../../../../_db/client";
import { lagerortOptionen } from "../../../../_lib/lesepfade/bz";
import { geraetById } from "../../../../_lib/lesepfade/geraete";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { GeraetAktivToggle } from "./GeraetAktivToggle";
import { GeraetForm } from "./GeraetForm";

export const dynamic = "force-dynamic";

/** Form und Form.Item bleiben ausschließlich in der Client-Insel. */
export function geraetSeitenInhalt(db: DB, id: string, jetzt: Date): ReactNode {
  const detail = geraetById(db, id, jetzt);
  if (!detail) notFound();

  const geraet = detail.geraet;
  const chip = detail.chip;
  /* `ton: "grau"` faerbt die Kante nicht (Kachel.tsx): grau ist kein
   * Ampelwert, und eine graue Kante neben rot und gruen liesse sich als
   * vierte Stufe lesen. */
  const faelligTon = chip ? chip.ton : "ok";

  return (
    <>
      <Brotkrume href="/verwaltung/geraete">Geräte</Brotkrume>
      <SeitenKopf
        titel={geraet.name}
        beschreibung={chip ? undefined : "Für diese Klasse ist kein Datum gepflegt."}
        aktionen={(
          <GeraetAktivToggle
            id={geraet.id}
            name={geraet.name}
            aktiv={geraet.aktiv}
          />
        )}
      />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={geraet.typ === "medizin" ? "Medizin" : "Objekt"}
            beschriftung="Gerätetyp"
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={chip ? chip.text : "–"}
            beschriftung={geraet.typ === "medizin" ? "MTK-Fälligkeit" : "Ablauf"}
            ton={faelligTon}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={detail.lagerortName} beschriftung="Standort" />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={geraet.aktiv ? "aktiv" : "inaktiv"}
            beschriftung="Status"
            ton={geraet.aktiv ? "ok" : "gelb"}
          />
        </Col>
      </Row>

      <GeraetForm
        initial={{
          id: geraet.id,
          typ: geraet.typ,
          name: geraet.name,
          barcode: geraet.barcode,
          lagerortId: geraet.lagerortId,
          anmerkung: geraet.anmerkung,
          mtkFaellig: geraet.mtkFaellig,
          beschreibung: geraet.beschreibung,
          ablaufdatum: geraet.ablaufdatum,
        }}
        lagerorte={lagerortOptionen(db)}
      />
    </>
  );
}

export default async function GeraetblattSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return geraetSeitenInhalt(getDb(), id, new Date());
}
