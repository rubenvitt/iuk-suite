import { Button } from "antd";
import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import { inventurZeilen } from "../../../_lib/lesepfade/inventur";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { InventurForm } from "./InventurForm";

export const dynamic = "force-dynamic";

export function inventurSeitenInhalt(db: DB, now: Date = new Date()): ReactNode {
  return (
    <>
      <SeitenKopf
        titel="Inventur"
        beschreibung="Gezählt wird der Handlager-Bestand. Nur angefasste Zeilen und Chargen werden gebucht — der Server rechnet gegen den Live-Bestand, nicht gegen den Stand dieser Seite."
        // Wie `BzListe` und `ChecklisteKnopf`: ein antd-`Button` mit `href`, kein
        // `size` (Falle 4). Aeussere Pfadform wie in der Navigation.
        aktionen={<Button href="/verwaltung/inventur/verlauf">Verlauf</Button>}
      />
      <InventurForm zeilen={inventurZeilen(db, now)} />
    </>
  );
}

export default function InventurSeite() {
  return inventurSeitenInhalt(getDb());
}
