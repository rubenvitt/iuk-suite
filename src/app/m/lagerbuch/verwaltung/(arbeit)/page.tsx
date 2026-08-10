import { Card, Col, Empty, Row } from "antd";
import Link from "next/link";
import { getDb, type DB } from "../../_db/client";
import { verfallSchwellen, verfallStatus } from "../../_lib/domain/verfall";
import { ampelTon, chargeText, type AmpelTon } from "../../_lib/format";
import { journalZeile } from "../../_lib/journalZeile";
import { artikelListe } from "../../_lib/lesepfade/artikel";
import { kennzahlen } from "../../_lib/lesepfade/bestand";
import {
  journalEintraege,
  type JournalZeileRoh,
} from "../../_lib/lesepfade/journal";
import { SCHRIFT } from "../../_lib/schrift";
import { fmtTs } from "../../_lib/zeit";
import { Chip } from "../../_ui/Chip";
import { Kachel } from "../../_ui/Kachel";
import { SeitenKopf } from "../../_ui/SeitenKopf";
import s from "../../_ui/verwaltung.module.css";
import {
  LetzteBuchungenTable,
  type UebersichtJournalZeile,
} from "./LetzteBuchungenTable";

export const dynamic = "force-dynamic";

export type KritischeZeile = {
  id: string;
  name: string;
  fach: string;
  bestand: number;
  mindestbestand: number;
  unterMindest: boolean;
  chargeText: string | null;
  chargeTon: AmpelTon | null;
};

export function kritischeArtikel(db: DB, jetzt: Date): KritischeZeile[] {
  const schwellen = verfallSchwellen();
  return artikelListe(db, {}, jetzt)
    .filter((zeile) => zeile.unterMindest || zeile.chargeKritisch)
    .map((zeile) => {
      const status = zeile.chargeKritisch && zeile.naechsteCharge
        ? verfallStatus(zeile.naechsteCharge.verfall, schwellen, jetzt)
        : null;
      return {
        id: zeile.id,
        name: zeile.name,
        fach: zeile.fach,
        bestand: zeile.bestand,
        mindestbestand: zeile.mindestbestand,
        unterMindest: zeile.unterMindest,
        chargeText: status && zeile.naechsteCharge
          ? chargeText(status, zeile.naechsteCharge.verfall)
          : null,
        chargeTon: status ? ampelTon(status.ampel) : null,
      };
    });
}

function journalAnzeigeZeilen(
  zeilen: JournalZeileRoh[],
): UebersichtJournalZeile[] {
  return zeilen.map((zeile) => {
    const darstellung = journalZeile(zeile);
    return {
      id: zeile.id,
      zeitText: fmtTs(zeile.ts),
      artikelName: zeile.artikelName,
      vorgangText: darstellung.typText
        + (zeile.kommentar ? ` · ${zeile.kommentar}` : ""),
      deltaText: darstellung.mengeText,
      deltaTon: darstellung.zustand,
    };
  });
}

export function verwaltungInhalt(db: DB, jetzt: Date) {
  const k = kennzahlen(db, jetzt);
  const kritisch = kritischeArtikel(db, jetzt);
  const journal = journalEintraege(db, { grenze: 5 });
  const journalZeilen = journalAnzeigeZeilen(journal.zeilen);

  return (
    <>
      <SeitenKopf
        titel="Übersicht"
        beschreibung={`Stand ${jetzt.toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
        })} Uhr`}
      />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={8}>
          <Kachel
            zahl={k.unterMindest}
            beschriftung="Artikel unter Mindestbestand"
            ton={k.unterMindest ? "rot" : "ok"}
          />
        </Col>
        <Col xs={24} md={8}>
          <Kachel
            zahl={k.chargenKritisch}
            beschriftung="Chargen bald fällig / kritisch"
            ton={k.chargenKritisch ? "gelb" : "ok"}
            href="/verwaltung/verfall"
          />
        </Col>
        <Col xs={24} md={8}>
          <Kachel
            zahl={k.chargenAbgelaufen}
            beschriftung="abgelaufen — aussondern nötig"
            ton={k.chargenAbgelaufen ? "rot" : "ok"}
            href="/verwaltung/verfall"
          />
        </Col>
        <Col xs={24} md={8}>
          <Kachel
            zahl={k.nichtBestellt}
            beschriftung="unter Mindestbestand, noch nicht bestellt"
          />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={k.buchungenGesamt} beschriftung="Buchungen im Journal" />
        </Col>
      </Row>

      <Card title="Kritische Artikel" style={{ marginBlockEnd: 24 }}>
        {kritisch.length === 0 ? (
          <Empty description="Alles im grünen Bereich." />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {kritisch.map((zeile) => (
              <li
                key={zeile.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 0",
                  borderBlockEnd: "1px solid var(--lb-linie)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href="/verwaltung/artikel"
                    style={{ ...SCHRIFT.text, fontWeight: 600 }}
                  >
                    {zeile.name}
                  </Link>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      marginBlockStart: 4,
                    }}
                  >
                    <span className={s.fach}>{zeile.fach}</span>
                    {zeile.unterMindest ? (
                      <Chip ton="rot" zeichen="warnung">
                        unter Mindestbestand
                      </Chip>
                    ) : null}
                    {zeile.chargeText && zeile.chargeTon ? (
                      <Chip ton={zeile.chargeTon}>Charge {zeile.chargeText}</Chip>
                    ) : null}
                  </div>
                </div>
                <span style={SCHRIFT.zahl}>{zeile.bestand}</span>
                <span style={SCHRIFT.neben}>/ min. {zeile.mindestbestand}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Letzte Buchungen">
        <LetzteBuchungenTable zeilen={journalZeilen} />
      </Card>
    </>
  );
}

export default function VerwaltungUebersicht() {
  return verwaltungInhalt(getDb(), new Date());
}
