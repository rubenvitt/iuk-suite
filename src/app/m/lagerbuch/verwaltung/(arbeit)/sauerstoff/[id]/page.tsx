import { Card, Col, Row } from "antd";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb, type DB } from "../../../../_db/client";
import { ampelTon } from "../../../../_lib/format";
import { o2FlascheDetail, type O2MessungZeile } from "../../../../_lib/lesepfade/o2";
import { SCHRIFT } from "../../../../_lib/schrift";
import { fmtTs } from "../../../../_lib/zeit";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import s from "../../../../_ui/verwaltung.module.css";
import { FlascheAktivToggle } from "./FlascheAktivToggle";
import { MessungForm } from "./MessungForm";
import { ReferenzFelder } from "./ReferenzFelder";
import { VerlaufTabelle, type VerlaufAnzeigeZeile } from "./VerlaufTabelle";

export const dynamic = "force-dynamic";

export function verlaufAnzeigeZeilen(
  verlauf: O2MessungZeile[],
): VerlaufAnzeigeZeile[] {
  return verlauf.map((messung) => ({
    id: messung.id,
    zeitpunktText: fmtTs(messung.ts),
    druckBar: messung.druckBar,
    herkunft: messung.ausCheck ? "check" : "manuell",
    werText: messung.wer,
    kommentarText: messung.kommentar,
  }));
}

export function o2FlascheInhalt(db: DB, id: string): ReactNode {
  const detail = o2FlascheDetail(db, id);
  if (!detail) notFound();

  const { flasche, status, verlauf } = detail;
  const juengste = verlauf[0] ?? null;
  const zeilen = verlaufAnzeigeZeilen(verlauf);

  return (
    <>
      <Brotkrume href="/verwaltung/sauerstoff">Sauerstoffflaschen</Brotkrume>
      <SeitenKopf
        titel={flasche.name}
        beschreibung="Der aktuelle Druck ist immer die jüngste Messung. Eine Fehlmessung lässt sich durch eine neue Messung korrigieren."
        aktionen={(
          <FlascheAktivToggle
            id={flasche.id}
            name={flasche.name}
            aktiv={flasche.aktiv}
          />
        )}
      />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={juengste ? `${juengste.druckBar} bar` : "–"}
            beschriftung="Aktueller Druck"
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={status === null ? "unbekannt" : `${status.prozent} %`}
            beschriftung="Füllstand"
            ton={status === null ? "grau" : ampelTon(status.ampel)}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={`${flasche.nennfuelldruckBar} bar`}
            beschriftung="Nennfülldruck"
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={(
              <span style={{ display: "grid", gap: 2 }}>
                <span>{flasche.aktiv ? "Aktiv" : "Inaktiv"}</span>
                <span style={SCHRIFT.neben}>{detail.lagerortName}</span>
              </span>
            )}
            beschriftung="Status / Standort"
            ton={flasche.aktiv ? "ok" : "grau"}
          />
        </Col>
      </Row>

      {status?.niedrig ? (
        <div className={s.warnbox} style={{ ...SCHRIFT.text, marginBlockEnd: 24 }}>
          Niedriger Druck — die Flasche gehört getauscht.
        </div>
      ) : null}

      <Card title="Stammdaten" style={{ marginBlockEnd: 24 }}>
        <ReferenzFelder
          id={flasche.id}
          name={flasche.name}
          lagerortId={flasche.lagerortId}
          groesseLiter={flasche.groesseLiter}
          nennfuelldruckBar={flasche.nennfuelldruckBar}
        />
      </Card>

      <Card title="Neue Messung" style={{ marginBlockEnd: 24 }}>
        <MessungForm flascheId={flasche.id} />
      </Card>

      <Card title="Messungsverlauf">
        <VerlaufTabelle zeilen={zeilen} />
      </Card>
    </>
  );
}

export default async function SauerstoffFlaschePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return o2FlascheInhalt(getDb(), id);
}
