import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import {
  bzGeraeteUebersicht,
  lagerortOptionen,
} from "../../../_lib/lesepfade/bz";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { BzListe } from "./BzListe";
import { bzAnzeigeZeilen } from "./bzAnzeige";

export const dynamic = "force-dynamic";

export function bzSeitenInhalt(db: DB, jetzt: Date): ReactNode {
  const zeilen = bzAnzeigeZeilen(bzGeraeteUebersicht(db, jetzt));
  const lagerorte = lagerortOptionen(db);

  return (
    <>
      <SeitenKopf
        titel="BZ-Kontrolle"
        beschreibung="Blutzuckermessgeräte mit Kontrollfrist, Referenzbereichen und Logbuch."
      />
      <BzListe zeilen={zeilen} lagerorte={lagerorte} />
    </>
  );
}

export default function BzSeite() {
  return bzSeitenInhalt(getDb(), new Date());
}
