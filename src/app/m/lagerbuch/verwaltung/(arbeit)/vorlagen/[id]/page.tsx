import { Card } from "antd";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb, type DB } from "../../../../_db/client";
import { artikelListe } from "../../../../_lib/lesepfade/artikel";
import { templateDetail } from "../../../../_lib/lesepfade/fahrzeuge";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Chip } from "../../../../_ui/Chip";
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

  return (
    <>
      <Brotkrume href="/verwaltung/vorlagen">Alle Vorlagen</Brotkrume>
      <SeitenKopf
        titel={detail.name}
        beschreibung={(
          <>
            {positionen.length} Position(en) · {verknuepfteFahrzeuge.length} verknüpfte(s){" "}
            Fahrzeug(e) {detail.aktiv ? null : <Chip ton="grau">inaktiv</Chip>}
          </>
        )}
      />

      <Card title="Positionen" style={{ marginBlockEnd: 16 }}>
        <TemplatePosEditor
          templateId={detail.id}
          positionen={positionen}
          artikel={auswaehlbareArtikel}
        />
      </Card>

      <Card title="Verknüpfte Fahrzeuge" style={{ marginBlockEnd: 16 }}>
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
