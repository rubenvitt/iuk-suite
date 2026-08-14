import { Card, Col, Row } from "antd";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SPACE } from "@/core/theme/tokens";
import { getDb, type DB } from "../../../../_db/client";
import { artikelListe } from "../../../../_lib/lesepfade/artikel";
import { templateDetail } from "../../../../_lib/lesepfade/fahrzeuge";
import { Chip } from "../../../../_ui/Chip";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { TemplateAktionen } from "./TemplateAktionen";
import { TemplatePosEditor } from "./TemplatePosEditor";
import { VerknuepfteFahrzeugeTable } from "./VerknuepfteFahrzeugeTable";

export const dynamic = "force-dynamic";

function vorlageInhalt(db: DB, id: string): ReactNode {
  const detail = templateDetail(db, id);
  if (!detail) notFound();

  const positionen = detail.positionen.map((position) => ({
    id: position.id,
    fachLabel: position.fachLabel,
    sort: position.sort,
    artikelId: position.artikelId,
    artikelName: position.artikelName,
    einheit: position.einheit,
    handlagerFach: position.handlagerFach,
    soll: position.soll,
  }));
  const auswaehlbareArtikel = artikelListe(db).map((eintrag) => ({
    id: eintrag.id,
    name: eintrag.name,
    fach: eintrag.fach,
  }));
  const verknuepfteFahrzeuge = detail.fahrzeuge.map((fahrzeug) => ({
    id: fahrzeug.id,
    name: fahrzeug.name,
    kennung: fahrzeug.kennung,
    aktiv: fahrzeug.aktiv,
  }));
  const faecher = new Set(positionen.map((p) => p.fachLabel)).size;

  return (
    <>
      <SeitenKopf
        titel={detail.name}
        beschreibung={detail.aktiv ? undefined : <Chip ton="grau">inaktiv</Chip>}
        zurueck={{ titel: "Alle Vorlagen", href: "/verwaltung/vorlagen" }}
      />

      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={24} md={8}>
          <Kachel zahl={positionen.length} beschriftung="Positionen" />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={faecher} beschriftung="Fächer" />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={verknuepfteFahrzeuge.length} beschriftung="Fahrzeuge" />
        </Col>
      </Row>

      <Card title="Positionen" style={{ marginBlockEnd: SPACE.lg }}>
        <TemplatePosEditor
          templateId={detail.id}
          positionen={positionen}
          artikel={auswaehlbareArtikel}
        />
      </Card>

      <Card title="Verknüpfte Fahrzeuge" style={{ marginBlockEnd: SPACE.lg }}>
        <VerknuepfteFahrzeugeTable zeilen={verknuepfteFahrzeuge} />
      </Card>

      <Card title="Aktionen">
        <TemplateAktionen
          id={detail.id}
          name={detail.name}
          aktiv={detail.aktiv}
          fahrzeuge={verknuepfteFahrzeuge.length}
        />
      </Card>
    </>
  );
}

export default async function VorlageDetailSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return vorlageInhalt(getDb(), id);
}
