import { Alert, Card, Col, Row, Table, type TableProps } from "antd";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "../../../../_db/client";
import { ampelTon } from "../../../../_lib/format";
import { checkDetail, type CheckDetail } from "../../../../_lib/lesepfade/checks";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Chip } from "../../../../_ui/Chip";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

type AbgleichZeile = {
  id: string;
  artikel: string;
  soll: ReactNode;
  ist: ReactNode;
  korrektur: ReactNode;
  nachgefuellt: ReactNode;
  offen: ReactNode;
};

type NachfuellZeile = {
  id: string;
  fach: ReactNode;
  artikel: ReactNode;
  soll: ReactNode;
  ist: ReactNode;
  luecke: ReactNode;
};

type GeraetZeile = {
  id: string;
  name: string;
  vorhanden: ReactNode;
  zustand: ReactNode;
  bemerkung: ReactNode;
};

type FlascheZeile = {
  id: string;
  name: string;
  druck: ReactNode;
  fuellstand: ReactNode;
};

type VerfallZeile = {
  id: string;
  artikel: string;
  verfall: ReactNode;
  status: ReactNode;
};

const ABGLEICH_SPALTEN = [
  { title: "Artikel", dataIndex: "artikel", key: "artikel" },
  { title: "Soll", dataIndex: "soll", key: "soll", align: "right" as const },
  { title: "Gezählt", dataIndex: "ist", key: "ist", align: "right" as const },
  { title: "Korrigiert", dataIndex: "korrektur", key: "korrektur", align: "right" as const },
  { title: "Nachgefüllt", dataIndex: "nachgefuellt", key: "nachgefuellt", align: "right" as const },
  { title: "Offen", dataIndex: "offen", key: "offen" },
] satisfies TableProps<AbgleichZeile>["columns"];

const NACHFUELL_SPALTEN = [
  { title: "Fach", dataIndex: "fach", key: "fach" },
  { title: "Artikel", dataIndex: "artikel", key: "artikel" },
  { title: "Soll", dataIndex: "soll", key: "soll", align: "right" as const },
  { title: "Gezählt", dataIndex: "ist", key: "ist", align: "right" as const },
  { title: "Lücke im Fach", dataIndex: "luecke", key: "luecke" },
] satisfies TableProps<NachfuellZeile>["columns"];

const GERAETE_SPALTEN = [
  { title: "Gerät", dataIndex: "name", key: "name" },
  { title: "Vorhanden", dataIndex: "vorhanden", key: "vorhanden" },
  { title: "Zustand", dataIndex: "zustand", key: "zustand" },
  { title: "Bemerkung", dataIndex: "bemerkung", key: "bemerkung" },
] satisfies TableProps<GeraetZeile>["columns"];

const FLASCHEN_SPALTEN = [
  { title: "Flasche", dataIndex: "name", key: "name" },
  { title: "Druck", dataIndex: "druck", key: "druck", align: "right" as const },
  { title: "Füllstand", dataIndex: "fuellstand", key: "fuellstand" },
] satisfies TableProps<FlascheZeile>["columns"];

const VERFALL_SPALTEN = [
  { title: "Artikel", dataIndex: "artikel", key: "artikel" },
  { title: "Verfall", dataIndex: "verfall", key: "verfall" },
  { title: "Status", dataIndex: "status", key: "status" },
] satisfies TableProps<VerfallZeile>["columns"];

function zahl(wert: number): ReactNode {
  return <span style={SCHRIFT.mono}>{wert}</span>;
}

export function checkDetailInhalt(check: CheckDetail) {
  const abgleichZeilen: AbgleichZeile[] = check.artikel.map((artikel) => ({
    id: artikel.artikelId,
    artikel: artikel.artikelName,
    soll: zahl(artikel.sollSumme),
    ist: zahl(artikel.istSumme),
    korrektur: zahl(artikel.korrektur),
    nachgefuellt: zahl(artikel.nachfuellGebucht),
    offen: artikel.offen > 0
      ? <Chip ton="rot" zeichen="warnung">fehlt {artikel.offen}</Chip>
      : <Chip ton="ok">vollständig</Chip>,
  }));
  const nachfuellZeilen: NachfuellZeile[] = check.positionen.map((position) => {
    const luecke = position.soll - position.ist;
    return {
      id: position.id,
      fach: <span style={SCHRIFT.mono}>{position.fachLabel}</span>,
      artikel: (
        <>
          {position.artikelName}{" "}
          <span style={SCHRIFT.neben}>{position.einheit}</span>
        </>
      ),
      soll: zahl(position.soll),
      ist: zahl(position.ist),
      luecke: luecke > 0
        ? <Chip ton="rot" zeichen="warnung">{luecke} fehlten</Chip>
        : <Chip ton="ok">vollständig</Chip>,
    };
  });
  const geraeteZeilen: GeraetZeile[] = check.geraete.map((geraet) => {
    const zustandTon = geraet.zustand === null
      ? "grau"
      : geraet.zustand === "Defekt"
        ? "rot"
        : geraet.zustand === "Gebrauchsspuren"
          ? "gelb"
          : geraet.zustand === "In Ordnung"
            ? "ok"
            : "grau";
    return {
      id: geraet.geraetId,
      name: geraet.name,
      vorhanden: geraet.vorhanden
        ? <Chip ton="ok">vorhanden</Chip>
        : <Chip ton="rot" zeichen="warnung">fehlt</Chip>,
      zustand: <Chip ton={zustandTon}>{geraet.zustand ?? "nicht erfasst"}</Chip>,
      bemerkung: <span style={SCHRIFT.neben}>{geraet.bemerkung ?? "—"}</span>,
    };
  });
  const flaschenZeilen: FlascheZeile[] = check.flaschen.map((flasche) => {
    const nichtGemessen = flasche.druckBar === null;
    const fuellstand = nichtGemessen
      ? <Chip ton="grau">nicht gemessen</Chip>
      : flasche.nennfuelldruckBar === null
          || flasche.prozent === null
          || flasche.ampel === null
        ? <Chip ton="grau">Nennfülldruck unbekannt</Chip>
        : <Chip ton={ampelTon(flasche.ampel)}>{flasche.prozent} %</Chip>;
    return {
      id: flasche.flascheId,
      name: flasche.name,
      druck: nichtGemessen
        ? <Chip ton="grau">nicht gemessen</Chip>
        : <span style={SCHRIFT.mono}>{flasche.druckBar} bar</span>,
      fuellstand,
    };
  });
  const verfallZeilen: VerfallZeile[] = check.verfall.map((eintrag) => ({
    id: eintrag.artikelId,
    artikel: eintrag.artikelName,
    verfall: <span style={SCHRIFT.mono}>{eintrag.verfall}</span>,
    status: <Chip ton={ampelTon(eintrag.ampel)}>{eintrag.text}</Chip>,
  }));

  return (
    <>
      <Brotkrume href="/verwaltung/checks">Fahrzeug-Checks</Brotkrume>
      <SeitenKopf
        titel={check.fahrzeugName}
        beschreibung={(
          <>
            Abgeschlossen{" "}
            {check.completedAt?.toLocaleString("de-DE", {
              timeZone: "Europe/Berlin",
            }) ?? "—"}{" · "}
            <strong>
              Die Verfall-Ampel unten ist gegen heute gerechnet, nicht gegen den Zeitpunkt des
              Checks.
            </strong>
          </>
        )}
      />

      {check.altFormat ? (
        <Alert
          type="warning"
          showIcon={false}
          style={{ marginBlockEnd: 16 }}
          title="Dieser Check stammt aus dem alten Format. Die Einzelpositionen sind darin nicht enthalten; die Summen unten sind vollständig."
        />
      ) : null}

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={6}>
          <Kachel
            zahl={check.summe.positionen}
            beschriftung="geprüfte Positionen"
          />
        </Col>
        <Col xs={24} md={6}>
          <Kachel
            zahl={check.summe.nachgefuellt}
            beschriftung="nachgefüllt"
            ton={check.summe.nachgefuellt ? "rot" : "ok"}
          />
        </Col>
        <Col xs={24} md={6}>
          <Kachel
            zahl={check.summe.korrigiert}
            beschriftung="korrigiert"
            ton={check.summe.korrigiert ? "gelb" : "ok"}
          />
        </Col>
        <Col xs={24} md={6}>
          <Kachel
            zahl={check.summe.offen}
            beschriftung="fehlt weiterhin"
            ton={check.summe.offen ? "rot" : "ok"}
          />
        </Col>
      </Row>

      <Card title="Abgleich" style={{ marginBlockEnd: 16 }}>
        <Table<AbgleichZeile>
          rowKey="id"
          pagination={false}
          scroll={{ x: "max-content" }}
          aria-label="Abgleich"
          locale={{ emptyText: "Keine Positionen erfasst." }}
          dataSource={abgleichZeilen}
          columns={ABGLEICH_SPALTEN}
        />
      </Card>
      <Card title="Nachfüllung (je Fach)" style={{ marginBlockEnd: 16 }}>
        <Table<NachfuellZeile>
          rowKey="id"
          pagination={false}
          scroll={{ x: "max-content" }}
          aria-label="Nachfüllung je Fach"
          locale={{
            emptyText: check.altFormat
              ? "Dieser Check stammt aus dem alten Format — Einzelpositionen sind darin nicht enthalten."
              : "Keine Einzelposition erfasst.",
          }}
          dataSource={nachfuellZeilen}
          columns={NACHFUELL_SPALTEN}
        />
      </Card>
      <Card title="Geräte" style={{ marginBlockEnd: 16 }}>
        <Table<GeraetZeile>
          rowKey="id"
          pagination={false}
          scroll={{ x: "max-content" }}
          aria-label="Geräte im Check"
          locale={{ emptyText: "Keine Geräte in diesem Check." }}
          dataSource={geraeteZeilen}
          columns={GERAETE_SPALTEN}
        />
      </Card>
      <Card title="Sauerstoff" style={{ marginBlockEnd: 16 }}>
        <Table<FlascheZeile>
          rowKey="id"
          pagination={false}
          scroll={{ x: "max-content" }}
          aria-label="Sauerstoff im Check"
          locale={{ emptyText: "Keine Flaschen in diesem Check." }}
          dataSource={flaschenZeilen}
          columns={FLASCHEN_SPALTEN}
        />
      </Card>
      <Card title="Verfall (gegen heute gerechnet)">
        <Table<VerfallZeile>
          rowKey="id"
          pagination={false}
          scroll={{ x: "max-content" }}
          aria-label="Verfallsmeldungen des Checks"
          locale={{ emptyText: "Keine Verfallsangabe in diesem Check." }}
          dataSource={verfallZeilen}
          columns={VERFALL_SPALTEN}
        />
      </Card>
    </>
  );
}

export default async function CheckDetailSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const check = checkDetail(getDb(), id, new Date());
  if (!check) notFound();
  return checkDetailInhalt(check);
}
