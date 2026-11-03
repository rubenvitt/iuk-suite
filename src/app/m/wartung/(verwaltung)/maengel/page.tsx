import { getDb } from "../../_db/client";
import { gruppenAuswahl } from "../../_lib/ansicht";
import { ladeGruppen, ladeMaengel } from "../../_lib/daten";
import { requireVerwalter } from "../../_lib/zugang";
import { MaengelListe } from "../../_ui/MaengelListe";

export const dynamic = "force-dynamic";

export default async function MaengelSeite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rechte } = await requireVerwalter();
  const db = getDb();
  const auswahl = gruppenAuswahl(rechte, ladeGruppen(db), (await searchParams).gruppe);
  return (
    <MaengelListe
      offen={ladeMaengel(db, { gruppen: auswahl.gruppen, offen: true })}
      behoben={ladeMaengel(db, { gruppen: auswahl.gruppen, offen: false, grenze: 30 })}
      gruppenWahl={auswahl.wahl}
      gewaehlt={auswahl.gewaehlt}
    />
  );
}
