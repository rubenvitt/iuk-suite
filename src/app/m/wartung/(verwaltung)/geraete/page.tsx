import { getDb } from "../../_db/client";
import { gruppenAuswahl } from "../../_lib/ansicht";
import { bekannteOrte, ladeArten, ladeGeraete, ladeGruppen } from "../../_lib/daten";
import { heute } from "../../_lib/heute";
import { istVerwalter, requireAngemeldet } from "../../_lib/zugang";
import { GeraeteListe } from "../../_ui/GeraeteListe";

export const dynamic = "force-dynamic";

/**
 * Verwalter sehen die Geräte ihrer Gruppen und öffnen die Akte; alle anderen sehen den ganzen Bestand und
 * kommen zur Telefonansicht, wo sie prüfen und melden.
 */
export default async function GeraeteSeite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rechte } = await requireAngemeldet();
  const db = getDb();
  const verwalter = istVerwalter(rechte);
  const alleGruppen = ladeGruppen(db);
  const auswahl = gruppenAuswahl(rechte, alleGruppen, (await searchParams).gruppe);
  const zeilen = ladeGeraete(db, { gruppen: verwalter ? auswahl.gruppen : null, heute: heute() });
  return (
    <GeraeteListe
      zeilen={zeilen}
      arten={ladeArten(db).map((a) => ({ id: a.id, name: a.name, einzahl: a.einzahl }))}
      gruppen={alleGruppen.filter((g) => rechte.gruppen.includes(g.id)).map((g) => ({ id: g.id, name: g.name }))}
      orte={verwalter ? bekannteOrte(db) : []}
      verwalter={verwalter}
      gruppenWahl={auswahl.wahl}
      gewaehlt={auswahl.gewaehlt}
    />
  );
}
