import { Card, Col, Row } from "antd";
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
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { BzAktivToggle } from "./BzAktivToggle";
import {
  BzLogbuchTabelle,
  type BzLogbuchAnzeigeZeile,
} from "./BzLogbuchTabelle";
import { ReferenzEditor, type BzEditorWerte } from "./ReferenzEditor";

export const dynamic = "force-dynamic";

function snapshotZahl(wert: unknown): number | "?" {
  return typeof wert === "number" && Number.isFinite(wert) ? wert : "?";
}

function levelTon({
  wert,
  imBereich,
}: {
  wert: number | null;
  imBereich: boolean | null;
}): "ok" | "rot" | "gelb" | null {
  if (wert === null) return null;
  return imBereich === true ? "ok" : imBereich === false ? "rot" : "gelb";
}

export function bzLogbuchAnzeigeZeilen(
  logbuch: BzKontrolleZeile[],
): BzLogbuchAnzeigeZeile[] {
  return logbuch.map((kontrolle) => ({
    id: kontrolle.id,
    zeitpunktText: fmtTs(kontrolle.ts),
    ergebnisText: kontrolle.bestanden ? "bestanden" : "nicht bestanden",
    ergebnisTon: kontrolle.bestanden ? "ok" : "rot",
    level1Wert: kontrolle.level1Wert,
    level1Ton: levelTon({
      wert: kontrolle.level1Wert,
      imBereich: kontrolle.level1ImBereich,
    }),
    level1MinDamals: snapshotZahl(kontrolle.refDamals?.level1Min),
    level1MaxDamals: snapshotZahl(kontrolle.refDamals?.level1Max),
    level2Wert: kontrolle.level2Wert,
    level2Ton: levelTon({
      wert: kontrolle.level2Wert,
      imBereich: kontrolle.level2ImBereich,
    }),
    level2MinDamals: snapshotZahl(kontrolle.refDamals?.level2Min),
    level2MaxDamals: snapshotZahl(kontrolle.refDamals?.level2Max),
    verbrauchText: `${kontrolle.sticks} Sticks / ${kontrolle.lanzetten} Lanzetten${
      kontrolle.kompresseVerfall ? ` · Kompresse ${kontrolle.kompresseVerfall}` : ""
    }`,
    akkuText: kontrolle.batterieGewechselt ? "gewechselt" : "—",
    akkuTon: kontrolle.batterieGewechselt ? "gelb" : null,
    werText: kontrolle.wer,
    kommentarText: kontrolle.kommentar,
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
  const logbuchZeilen = bzLogbuchAnzeigeZeilen(logbuch);
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

      {/*
        KEIN wertabhaengiger `key` hier: `ReferenzEditor` setzt seinen
        Schluessel selbst aus der Geraete-`id`. Ein zweiter Remount-Ausloeser
        auf dieser Ebene haette denselben Fokusverlust wieder eingebaut.
      */}
      <ReferenzEditor geraet={editor} lagerorte={lagerortOptionen(db)} />

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
        <BzLogbuchTabelle zeilen={logbuchZeilen} />
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
