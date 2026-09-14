import type { ReactNode } from "react";
import { getDb, type DB } from "../../../../_db/client";
import { quelleAufloeser } from "../../../../_db/quelle";
import { INVENTUR_VERLAUF_GRENZE } from "../../../../_lib/grenzen";
import { inventurLaeufe, umfangText } from "../../../../_lib/lesepfade/inventurVerlauf";
import { fmtTs } from "../../../../_lib/zeit";
import { requireLagerbuchAdmin } from "../../../../_lib/zugang";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { VerlaufTabelle, type VerlaufZeile } from "./VerlaufTabelle";

export const dynamic = "force-dynamic";

/**
 * DRK-299 — Verlauf abgeschlossener Inventuren. Server Component: kein
 * Compound-Zugriff auf antd (Falle 1), kein Icon-Paket (Falle 7), die Tabelle
 * mit ihren `render`-Funktionen lebt in der Client-Insel (Falle 9) und bekommt
 * nur Primitive.
 */
export function verlaufSeitenInhalt(db: DB): ReactNode {
  const { laeufe, begrenzt } = inventurLaeufe(db);
  // EINMAL bauen — der Resolver laedt beide Lookup-Tabellen (`_db/quelle.ts`).
  const person = quelleAufloeser(db);
  const zeilen: VerlaufZeile[] = laeufe.map((l) => ({
    id: l.id,
    zeitText: fmtTs(l.ts),
    person: person(l.quelleTyp, l.quelleId),
    kommentar: l.kommentar,
    umfangText: umfangText(l.umfang),
    positionen: l.positionen,
    abweichungen: l.abweichungen,
    detailHref: `/verwaltung/inventur/verlauf/${l.id}`,
  }));

  const beschreibung = "Abgeschlossene Inventuren mit allen gezählten Positionen. Inventuren vor dieser Änderung stehen nur im Journal."
    + (begrenzt ? ` Gezeigt werden die neuesten ${INVENTUR_VERLAUF_GRENZE}.` : "");

  return (
    <>
      <SeitenKopf
        titel="Inventur-Verlauf"
        beschreibung={beschreibung}
        zurueck={{ titel: "Inventur", href: "/verwaltung/inventur" }}
      />
      <VerlaufTabelle zeilen={zeilen} />
    </>
  );
}

export default async function InventurVerlaufSeite() {
  await requireLagerbuchAdmin();
  return verlaufSeitenInhalt(getDb());
}
