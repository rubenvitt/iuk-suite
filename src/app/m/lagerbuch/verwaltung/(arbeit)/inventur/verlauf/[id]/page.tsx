import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb, type DB } from "../../../../../_db/client";
import { quelleAufloeser } from "../../../../../_db/quelle";
import { fmtVerfall } from "../../../../../_lib/format";
import { inventurLauf, umfangText } from "../../../../../_lib/lesepfade/inventurVerlauf";
import { fmtTsJahr } from "../../../../../_lib/zeit";
import { requireLagerbuchAdmin } from "../../../../../_lib/zugang";
import { SeitenKopf } from "../../../../../_ui/SeitenKopf";
import { LaufTabelle, type LaufZeile } from "./LaufTabelle";

export const dynamic = "force-dynamic";

/**
 * DRK-299 — ein abgeschlossener Inventurlauf mit allen gezaehlten Positionen.
 *
 * Die ID aus der URL ist unbedenklich (Spec §C): Laeufe gehoeren dem Modul,
 * nicht einer Person — es gibt keine Zugehoerigkeit, die zu pruefen waere. Der
 * Zugang selbst ist der Lagerbuch-Admin, wie die Inventur.
 */
export function laufDetailInhalt(db: DB, id: string): ReactNode {
  const lauf = inventurLauf(db, id);
  if (!lauf) notFound();
  const { kopf, positionen } = lauf;
  const person = quelleAufloeser(db)(kopf.quelleTyp, kopf.quelleId);

  const zeilen: LaufZeile[] = positionen.map((p, i) => {
    // Gruppierung: ab der zweiten Chargenzeile desselben Artikels bleibt der
    // Artikel leer. Die Reihenfolge (Name, artikelId, MHD) kommt aus dem Lesepfad.
    const vorige = positionen[i - 1];
    const fortsetzung = p.chargeId !== null && vorige?.artikelId === p.artikelId;
    return {
      id: p.id,
      artikelText: fortsetzung ? "" : p.artikelName,
      chargeText: p.chargenNr !== null && p.verfall !== null
        ? `${p.chargenNr} · ${fmtVerfall(p.verfall)}`
        : "je Artikel",
      erwartetText: `${p.erwartet} ${p.einheit}`,
      gezaehltText: `${p.gezaehlt} ${p.einheit}`,
      differenz: p.gezaehlt - p.erwartet,
    };
  });

  return (
    <>
      <SeitenKopf
        titel={`Inventur vom ${fmtTsJahr(kopf.ts)}`}
        zurueck={{ titel: "Verlauf", href: "/verwaltung/inventur/verlauf" }}
        beschreibung={`${person} · ${kopf.kommentar} · Umfang: ${umfangText(kopf.umfang)}`}
      />
      <LaufTabelle zeilen={zeilen} />
    </>
  );
}

export default async function InventurLaufSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireLagerbuchAdmin();
  const { id } = await params;
  return laufDetailInhalt(getDb(), id);
}
