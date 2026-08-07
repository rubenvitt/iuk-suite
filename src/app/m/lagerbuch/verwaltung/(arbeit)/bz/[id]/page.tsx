import { Card, Col, Row, Table, type TableProps } from "antd";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb, type DB } from "../../../../_db/client";
import { ampelTon } from "../../../../_lib/format";
import { BZ_LOGBUCH_GRENZE } from "../../../../_lib/grenzen";
import {
  bzGeraetDetail,
  lagerortOptionen,
  type BzGeraetDetail,
  type BzKontrolleZeile,
} from "../../../../_lib/lesepfade/bz";
import { SCHRIFT } from "../../../../_lib/schrift";
import { fmtTs } from "../../../../_lib/zeit";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Chip } from "../../../../_ui/Chip";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import s from "../../../../_ui/verwaltung.module.css";
import { BzAktivToggle } from "./BzAktivToggle";
import { ReferenzEditor, type BzEditorWerte } from "./ReferenzEditor";

export const dynamic = "force-dynamic";

type LogbuchAnzeigeZeile = {
  id: string;
  zeitpunkt: ReactNode;
  ergebnis: ReactNode;
  level1: ReactNode;
  level2: ReactNode;
  verbrauch: ReactNode;
  akku: ReactNode;
  wer: ReactNode;
  kommentar: ReactNode;
};

const LOGBUCH_SPALTEN = [
  { title: "Zeitpunkt", dataIndex: "zeitpunkt", key: "zeitpunkt" },
  { title: "Ergebnis", dataIndex: "ergebnis", key: "ergebnis" },
  { title: "Level 1", dataIndex: "level1", key: "level1" },
  { title: "Level 2", dataIndex: "level2", key: "level2" },
  { title: "Verbrauch", dataIndex: "verbrauch", key: "verbrauch" },
  { title: "Akku", dataIndex: "akku", key: "akku" },
  { title: "Wer", dataIndex: "wer", key: "wer" },
  { title: "Kommentar", dataIndex: "kommentar", key: "kommentar" },
] satisfies TableProps<LogbuchAnzeigeZeile>["columns"];

function snapshotZahl(wert: unknown): number | "?" {
  return typeof wert === "number" && Number.isFinite(wert) ? wert : "?";
}

function levelZelle({
  bezeichnung,
  wert,
  imBereich,
  min,
  max,
}: {
  bezeichnung: "L1" | "L2";
  wert: number | null;
  imBereich: boolean | null;
  min: unknown;
  max: unknown;
}): ReactNode {
  if (wert === null) return <span style={SCHRIFT.neben}>—</span>;
  const ton = imBereich === true ? "ok" : imBereich === false ? "rot" : "gelb";
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <Chip ton={ton}>{bezeichnung} {wert}</Chip>
      <span style={{ ...SCHRIFT.neben, marginInlineStart: 6 }}>
        (damals {snapshotZahl(min)}–{snapshotZahl(max)})
      </span>
    </span>
  );
}

function logbuchAnzeigeZeilen(logbuch: BzKontrolleZeile[]): LogbuchAnzeigeZeile[] {
  return logbuch.map((kontrolle) => ({
    id: kontrolle.id,
    zeitpunkt: <span className={s.jts}>{fmtTs(kontrolle.ts)}</span>,
    ergebnis: (
      <Chip ton={kontrolle.bestanden ? "ok" : "rot"}>
        {kontrolle.bestanden ? "bestanden" : "nicht bestanden"}
      </Chip>
    ),
    level1: levelZelle({
      bezeichnung: "L1",
      wert: kontrolle.level1Wert,
      imBereich: kontrolle.level1ImBereich,
      min: kontrolle.refDamals?.level1Min,
      max: kontrolle.refDamals?.level1Max,
    }),
    level2: levelZelle({
      bezeichnung: "L2",
      wert: kontrolle.level2Wert,
      imBereich: kontrolle.level2ImBereich,
      min: kontrolle.refDamals?.level2Min,
      max: kontrolle.refDamals?.level2Max,
    }),
    verbrauch: (
      <span style={SCHRIFT.neben}>
        {kontrolle.sticks} Sticks / {kontrolle.lanzetten} Lanzetten
        {kontrolle.kompresseVerfall
          ? ` · Kompresse ${kontrolle.kompresseVerfall}`
          : ""}
      </span>
    ),
    akku: kontrolle.batterieGewechselt ? (
      <Chip ton="gelb" zeichen="akku">gewechselt</Chip>
    ) : <span style={SCHRIFT.neben}>—</span>,
    wer: <Chip ton="grau">{kontrolle.wer}</Chip>,
    kommentar: kontrolle.kommentar ?? <span style={SCHRIFT.neben}>—</span>,
  }));
}

function editorWerte(
  geraet: BzGeraetDetail["geraet"],
): BzEditorWerte {
  return {
    id: geraet.id,
    name: geraet.name,
    barcode: geraet.barcode,
    lagerortId: geraet.lagerortId,
    streifenLot: geraet.streifenLot,
    level1Label: geraet.level1Label,
    level1Min: geraet.level1Min,
    level1Max: geraet.level1Max,
    level2Label: geraet.level2Label,
    level2Min: geraet.level2Min,
    level2Max: geraet.level2Max,
  };
}

export function bzGeraetInhalt(db: DB, id: string, jetzt: Date): ReactNode {
  const detail = bzGeraetDetail(db, id, jetzt);
  if (!detail) notFound();

  const { geraet, faelligkeit, akku, logbuch } = detail;
  const letzte = logbuch[0] ?? null;
  const logbuchZeilen = logbuchAnzeigeZeilen(logbuch);
  const faelligText = faelligkeit.nieGeprueft
    ? "nie geprüft"
    : faelligkeit.faelligAm
      ? fmtTs(faelligkeit.faelligAm)
      : "–";
  const akkuText = akku.tageDurchschnitt === null
    ? "–"
    : `${Math.round(akku.tageDurchschnitt)} Tage`;
  const editor = editorWerte(geraet);

  return (
    <>
      <Brotkrume href="/verwaltung/bz">BZ-Geräte</Brotkrume>
      <SeitenKopf
        titel={geraet.name}
        beschreibung={geraet.barcode ? `Barcode ${geraet.barcode}` : "Kein Barcode hinterlegt"}
        aktionen={<BzAktivToggle id={geraet.id} name={geraet.name} aktiv={geraet.aktiv} />}
      />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={faelligText}
            beschriftung="Nächste Kontrolle"
            ton={ampelTon(faelligkeit.ampel)}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={letzte ? fmtTs(letzte.ts) : "–"}
            beschriftung="Letzte Kontrolle"
            ton={letzte ? (letzte.bestanden ? "ok" : "rot") : "grau"}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={akkuText}
            beschriftung="Ø Akkulaufzeit"
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={(
              <span style={{ display: "grid", gap: 2 }}>
                <span>{geraet.aktiv ? "Aktiv" : "Inaktiv"}</span>
                <span style={SCHRIFT.neben}>{detail.lagerortName}</span>
              </span>
            )}
            beschriftung="Status / Standort"
            ton={geraet.aktiv ? "ok" : "grau"}
          />
        </Col>
      </Row>

      <ReferenzEditor
        key={JSON.stringify(editor)}
        geraet={editor}
        lagerorte={lagerortOptionen(db)}
      />

      <div style={{ marginBlockEnd: 16 }}>
        <Link
          href={`/verwaltung/bz/${geraet.id}/kontrolle`}
          role="button"
          style={{
            ...SCHRIFT.text,
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
            borderRadius: 6,
            paddingInline: 16,
            color: "white",
            background: "var(--lb-rot)",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Kontrolle erfassen
        </Link>
      </div>

      <Card title="Logbuch der Kontrollen">
        <p style={SCHRIFT.neben}>
          {detail.logbuchMehrVorhanden
            ? `Neueste ${BZ_LOGBUCH_GRENZE} von mehr Einträgen`
            : `${logbuch.length} Einträge`}
        </p>
        <Table<LogbuchAnzeigeZeile>
          rowKey="id"
          pagination={false}
          scroll={{ x: "max-content" }}
          aria-label="Logbuch der Kontrollen"
          locale={{ emptyText: "Für dieses Gerät wurde noch keine Kontrolle erfasst." }}
          dataSource={logbuchZeilen}
          columns={LOGBUCH_SPALTEN}
        />
      </Card>
    </>
  );
}

export default async function BzGeraetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return bzGeraetInhalt(getDb(), id, new Date());
}
