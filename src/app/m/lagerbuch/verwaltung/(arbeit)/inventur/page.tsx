import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import { artikelListe } from "../../../_lib/lesepfade/artikel";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { InventurForm } from "./InventurForm";

export const dynamic = "force-dynamic";

export function inventurSeitenInhalt(db: DB): ReactNode {
  const zeilen = artikelListe(db).map((artikel) => ({
    id: artikel.id,
    name: artikel.name,
    einheit: artikel.einheit,
    fach: artikel.fach,
    bestand: artikel.bestand,
  }));

  return (
    <>
      <SeitenKopf
        titel="Inventur"
        beschreibung="Gezählt wird der Handlager-Bestand. Nur angefasste Zeilen werden gebucht — der Server rechnet gegen den Live-Bestand, nicht gegen den Stand dieser Seite."
      />
      <InventurForm zeilen={zeilen} />
    </>
  );
}

export default function InventurSeite() {
  return inventurSeitenInhalt(getDb());
}
