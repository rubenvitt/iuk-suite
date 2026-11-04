import { getDb } from "../../_db/client";
import { gruppenAuswahl } from "../../_lib/ansicht";
import { ladeGruppen, ladeVerlauf } from "../../_lib/daten";
import { requireVerwalter } from "../../_lib/zugang";
import { PruefungenListe } from "../../_ui/PruefungenListe";

export const dynamic = "force-dynamic";

export default async function PruefungenSeite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rechte } = await requireVerwalter();
  const db = getDb();
  const auswahl = gruppenAuswahl(rechte, ladeGruppen(db), (await searchParams).gruppe);
  return (
    <PruefungenListe
      zeilen={ladeVerlauf(db, { gruppen: auswahl.gruppen, nurFristen: true, grenze: 500 })}
      gruppenWahl={auswahl.wahl}
      gewaehlt={auswahl.gewaehlt}
    />
  );
}

export const metadata = { title: "Prüfungen und Wartungen" };
