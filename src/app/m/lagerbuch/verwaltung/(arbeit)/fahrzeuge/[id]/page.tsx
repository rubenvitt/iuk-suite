import { Card, Col, Row } from "antd";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb, type DB } from "../../../../_db/client";
import { lagerorte } from "../../../../_db/schema";
import { artikelListe } from "../../../../_lib/lesepfade/artikel";
import {
  sollFuerFahrzeug,
  templateDetail,
  templateListeAktiv,
} from "../../../../_lib/lesepfade/fahrzeuge";
import { verfallFuerLagerort } from "../../../../_lib/lesepfade/verfall";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { FahrzeugAktivToggle } from "./FahrzeugAktivToggle";
import { SollEditor } from "./SollEditor";
import { TemplateVerknuepfung } from "./TemplateVerknuepfung";
import { VerfallEditor, type VerfallAnzeigeZeile } from "./VerfallEditor";

export const dynamic = "force-dynamic";

function verfallZeilen(
  soll: ReturnType<typeof sollFuerFahrzeug>,
  verfall: ReturnType<typeof verfallFuerLagerort>,
): VerfallAnzeigeZeile[] {
  const jeArtikel = new Map<string, {
    artikelId: string;
    artikelName: string;
    faecher: string[];
  }>();

  for (const position of soll) {
    if (position.entfernt) continue;
    const vorhanden = jeArtikel.get(position.artikelId);
    if (vorhanden) {
      if (!vorhanden.faecher.includes(position.fachLabel)) {
        vorhanden.faecher.push(position.fachLabel);
      }
      continue;
    }
    jeArtikel.set(position.artikelId, {
      artikelId: position.artikelId,
      artikelName: position.artikelName,
      faecher: [position.fachLabel],
    });
  }

  return Array.from(jeArtikel.values()).map((artikel) => {
    const eintrag = verfall.get(artikel.artikelId) ?? null;
    return {
      artikelId: artikel.artikelId,
      artikelName: artikel.artikelName,
      fachText: artikel.faecher.join(" · "),
      verfall: eintrag?.verfall ?? null,
      ampel: eintrag?.ampel ?? null,
      statusText: eintrag?.text ?? null,
    };
  });
}

/**
 * Zweite Zugriffslinie neben dem Verwaltungs-Layout: Eine bekannte Lager-ID
 * ist noch kein Fahrzeugblatt. Alle Client-Inseln erhalten nur serielle DTOs.
 */
export function fahrzeugInhalt(db: DB, id: string, jetzt: Date): ReactNode {
  const fahrzeug = db.select().from(lagerorte).where(eq(lagerorte.id, id)).get();
  if (!fahrzeug || fahrzeug.typ !== "fahrzeug") notFound();

  const soll = sollFuerFahrzeug(db, id);
  const aktivePositionen = soll.filter((position) => !position.entfernt);
  const verfall = verfallZeilen(soll, verfallFuerLagerort(db, id, jetzt));
  const artikel = artikelListe(db).map((eintrag) => ({
    id: eintrag.id,
    name: eintrag.name,
    fach: eintrag.fach,
  }));
  const aktuelleVorlageDetail = fahrzeug.templateId
    ? templateDetail(db, fahrzeug.templateId)
    : null;
  const aktuelleVorlage = aktuelleVorlageDetail
    ? { id: aktuelleVorlageDetail.id, name: aktuelleVorlageDetail.name }
    : null;
  const vorlagen = templateListeAktiv(db)
    .filter((vorlage) => vorlage.id !== aktuelleVorlage?.id);
  const faecher = new Set(aktivePositionen.map((position) => position.fachLabel)).size;
  const verfallAuffaellig = verfall.filter(
    (eintrag) => eintrag.ampel !== null && eintrag.ampel !== "gruen",
  );

  return (
    <>
      <Brotkrume href="/verwaltung/fahrzeuge">Fahrzeuge</Brotkrume>
      <SeitenKopf
        titel={fahrzeug.name}
        beschreibung={fahrzeug.kennung ? (
          <span style={SCHRIFT.mono}>{fahrzeug.kennung}</span>
        ) : undefined}
        aktionen={(
          <FahrzeugAktivToggle
            id={fahrzeug.id}
            name={fahrzeug.name}
            aktiv={fahrzeug.aktiv}
          />
        )}
      />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={8}>
          <Kachel zahl={aktivePositionen.length} beschriftung="Soll-Positionen" />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={faecher} beschriftung="Fächer" />
        </Col>
        <Col xs={24} md={8}>
          <Kachel
            zahl={verfallAuffaellig.length}
            beschriftung="auffällige Verfallsmeldungen"
            ton={verfallAuffaellig.some((eintrag) => eintrag.ampel === "rot") ? "rot" : "ok"}
          />
        </Col>
      </Row>

      <h2 style={{ ...SCHRIFT.abschnitt, margin: "0 0 8px" }}>Vorlage</h2>
      <Card>
        <TemplateVerknuepfung
          fahrzeugId={fahrzeug.id}
          aktuelleVorlage={aktuelleVorlage}
          vorlagen={vorlagen}
          hatPositionen={aktivePositionen.length > 0}
        />
      </Card>

      <h2 style={{ ...SCHRIFT.abschnitt, margin: "24px 0 8px" }}>Soll-Bestückung</h2>
      <SollEditor fahrzeugId={fahrzeug.id} positionen={soll} artikel={artikel} />

      <h2 style={{ ...SCHRIFT.abschnitt, margin: "24px 0 8px" }}>Verfall im Fahrzeug</h2>
      <Card>
        <VerfallEditor lagerortId={fahrzeug.id} eintraege={verfall} />
      </Card>
    </>
  );
}

export default async function FahrzeugBlatt({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return fahrzeugInhalt(getDb(), id, new Date());
}
