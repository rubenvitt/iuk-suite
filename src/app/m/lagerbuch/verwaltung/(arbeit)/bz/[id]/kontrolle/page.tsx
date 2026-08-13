import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb, type DB } from "../../../../../_db/client";
import { bzGeraetDetail } from "../../../../../_lib/lesepfade/bz";
import { SeitenKopf } from "../../../../../_ui/SeitenKopf";
import { KontrolleForm, type KontrolleLevelDto } from "./KontrolleForm";

export const dynamic = "force-dynamic";

type KontrolleFormDto = {
  geraetId: string;
  level1: KontrolleLevelDto;
  level2: KontrolleLevelDto;
};

function formDto(
  geraet: NonNullable<ReturnType<typeof bzGeraetDetail>>["geraet"],
): KontrolleFormDto {
  return {
    geraetId: geraet.id,
    level1: {
      label: geraet.level1Label,
      min: geraet.level1Min,
      max: geraet.level1Max,
    },
    level2: {
      label: geraet.level2Label,
      min: geraet.level2Min,
      max: geraet.level2Max,
    },
  };
}

export function kontrolleSeiteInhalt(db: DB, id: string): ReactNode {
  // Das Gerät und seine aktuellen Grenzen werden ausschließlich im RSC gelesen.
  // Die Client-Insel erhält ein Date- und funktionsfreies Anzeige-/Action-DTO.
  const detail = bzGeraetDetail(db, id);
  if (!detail) notFound();

  return (
    <>
      <SeitenKopf
        titel="Kontrolle erfassen"
        beschreibung="Die Messwerte werden gegen die heute am Gerät hinterlegten Referenzbereiche bewertet; dieser Stand wird mit der Kontrolle eingefroren."
        zurueck={{ titel: detail.geraet.name, href: `/verwaltung/bz/${detail.geraet.id}` }}
      />
      <KontrolleForm {...formDto(detail.geraet)} />
    </>
  );
}

export default async function KontrolleSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return kontrolleSeiteInhalt(getDb(), id);
}
