import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb, type DB } from "../../../../_db/client";
import { lagerortOptionen } from "../../../../_lib/lesepfade/bz";
import { geraetById } from "../../../../_lib/lesepfade/geraete";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Chip } from "../../../../_ui/Chip";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { GeraetAktivToggle } from "./GeraetAktivToggle";
import { GeraetForm } from "./GeraetForm";

export const dynamic = "force-dynamic";

/** Form und Form.Item bleiben ausschließlich in der Client-Insel. */
export function geraetSeitenInhalt(db: DB, id: string, jetzt: Date): ReactNode {
  const detail = geraetById(db, id, jetzt);
  if (!detail) notFound();

  const geraet = detail.geraet;
  return (
    <>
      <Brotkrume href="/verwaltung/geraete">Geräte</Brotkrume>
      <SeitenKopf
        titel={geraet.name}
        beschreibung={detail.chip ? undefined : "Für diese Klasse ist kein Datum gepflegt."}
        aktionen={(
          <GeraetAktivToggle
            id={geraet.id}
            name={geraet.name}
            aktiv={geraet.aktiv}
          />
        )}
      />
      {detail.chip ? (
        <Chip
          ton={detail.chip.ton}
          zeichen={detail.chip.ton === "rot" ? "warnung" : undefined}
        >
          {detail.chip.text}
        </Chip>
      ) : null}
      <GeraetForm
        initial={{
          id: geraet.id,
          typ: geraet.typ,
          name: geraet.name,
          barcode: geraet.barcode,
          lagerortId: geraet.lagerortId,
          anmerkung: geraet.anmerkung,
          mtkFaellig: geraet.mtkFaellig,
          beschreibung: geraet.beschreibung,
          ablaufdatum: geraet.ablaufdatum,
        }}
        lagerorte={lagerortOptionen(db)}
      />
    </>
  );
}

export default async function GeraetblattSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return geraetSeitenInhalt(getDb(), id, new Date());
}
