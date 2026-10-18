import { Card, Col, Row } from "antd";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SPACE } from "@/core/theme/tokens";
import { getDb, type DB } from "../../../../_db/client";
import { ampelTon } from "../../../../_lib/format";
import { standortZeile } from "../../../../_lib/konstanten";
import { BZ_LOGBUCH_GRENZE } from "../../../../_lib/grenzen";
import {
  bzGeraetDetail,
  lagerortOptionen,
  type BzGeraetDetail,
  type BzKontrolleZeile,
} from "../../../../_lib/lesepfade/bz";
import { SCHRIFT } from "../../../../_lib/schrift";
import { fmtTs } from "../../../../_lib/zeit";
import { Kachel } from "../../../../_ui/Kachel";
import { Ikone } from "../../../../_ui/ikonen";
import { LinkKnopf } from "../../../../_ui/LinkKnopf";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { BeachtungEditor } from "./BeachtungEditor";
import { BzAktivToggle } from "./BzAktivToggle";
import {
  BzLogbuchTabelle,
  type BzLogbuchAnzeigeZeile,
} from "./BzLogbuchTabelle";
import { ReferenzEditor, type BzEditorWerte } from "./ReferenzEditor";
import { verwaltungDetailPfad } from "../../../../_lib/verwaltungPfad";

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
    // ⚠️ `zeitpunktText` ist „TT.MM. HH:MM" und ordnete als Zeichenkette den
    // 2. Oktober vor den 14. September. Die Spalte sortiert deshalb ueber den
    // ISO-Stempel; angezeigt wird weiterhin nur der kurze Text.
    zeitpunktIso: kontrolle.ts.toISOString(),
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
  const beachtung = (
    <BeachtungEditor
      geraetId={geraet.id}
      hinweis={detail.beachtung.hinweis}
      seitText={detail.beachtung.seit === null
        ? null
        : `seit ${fmtTs(detail.beachtung.seit)}`}
    />
  );

  return (
    <>
      <SeitenKopf
        titel={geraet.name}
        beschreibung={geraet.barcode ? `Barcode ${geraet.barcode}` : "Kein Barcode hinterlegt"}
        zurueck={{ titel: "BZ-Geräte", href: "/verwaltung/bz" }}
        aktionen={(
          /*
            IDA-239 — DIE HAUPTAKTION STEHT IM KOPF. Vorher lag „Kontrolle
            erfassen" als eigener roter Link UNTER Beachtung und zehn offenen
            Referenzfeldern (gemessen 818 px bei 1440×900, 1 077 px bei
            1024×768). Jetzt ist es die eine Primäraktion der Seite; Status und
            Löschen sind in die Stammdaten gewandert — eine unumkehrbare Aktion
            gehört nicht neben die tägliche.

            `LinkKnopf`: ein echter Anker, der im Verwaltungsrahmen clientseitig
            navigiert (Begründung dort).
          */
          <LinkKnopf
            primaer
            href={verwaltungDetailPfad("bz", geraet.id, "kontrolle")}
            icon={<Ikone name="haken" groesse={16} />}
          >
            Kontrolle erfassen
          </LinkKnopf>
        )}
      />

      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.lg }}>
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
            /* Das Original nennt die Zahl der Wechsel mit
             * (lagerbuch/src/app/verwaltung/(admin)/bz/[id]/page.tsx:45): ein
             * Mittelwert aus zwei Intervallen und einer aus zwanzig sehen
             * ohne sie gleich verlaesslich aus. */
            beschriftung={`Ø Akku (${akku.anzahlWechsel} Wechsel)`}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={(
              // 2 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) -- enger
              // Zweizeiler aus Status und Standort, keine Geschwisterzeile in
              // dieser Kachel, die einen Skalenwert nahelegen wuerde.
              <span style={{ display: "grid", gap: 2 }}>
                <span>{geraet.aktiv ? "Aktiv" : "Inaktiv"}</span>
                <span style={SCHRIFT.neben}>{standortZeile(detail.lagerortStandort)}</span>
              </span>
            )}
            beschriftung="Status / Standort"
            ton={geraet.aktiv ? "ok" : "grau"}
          />
        </Col>
      </Row>

      {/*
        DRK-311: EINE LAUFENDE BEACHTUNG STEHT VOR ALLEM ANDEREN — sie ist das,
        was jemand wissen muss, BEVOR er an diesem Gerät arbeitet. Ist keine
        gesetzt, gibt es oben nichts zu lesen, und das Setzen wandert zu den
        Stammdaten (IDA-239): sonst stünde zwischen Kacheln und Logbuch eine
        Karte, die nur sagt, dass nichts zu beachten ist.
      */}
      {detail.beachtung.hinweis !== null ? beachtung : null}

      {/* IDA-239 — das Logbuch direkt unter den Kacheln: es ist das, was man
          an einem Gerät nachliest. */}
      <Card title="Logbuch der Kontrollen" style={{ marginBlockEnd: SPACE.lg }}>
        <p style={SCHRIFT.neben}>
          {detail.logbuchMehrVorhanden
            ? `Neueste ${BZ_LOGBUCH_GRENZE} von mehr Einträgen`
            : `${logbuch.length} Einträge`}
        </p>
        <BzLogbuchTabelle zeilen={logbuchZeilen} />
      </Card>

      {detail.beachtung.hinweis === null ? beachtung : null}

      {/* `key` an der Identität: beim Wechsel auf ein anderes Gerät darf kein
          offener Entwurf des vorigen stehen bleiben. */}
      <ReferenzEditor
        key={geraet.id}
        geraet={editor}
        lagerorte={lagerortOptionen(db)}
        zusatz={<BzAktivToggle id={geraet.id} name={geraet.name} aktiv={geraet.aktiv} />}
      />
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
