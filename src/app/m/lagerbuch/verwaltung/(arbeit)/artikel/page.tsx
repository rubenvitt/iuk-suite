import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import { verfallStatus, verfallSchwellen } from "../../../_lib/domain/verfall";
import { chargeText } from "../../../_lib/format";
import { artikelListe } from "../../../_lib/lesepfade/artikel";
import { fahrzeugListe } from "../../../_lib/lesepfade/fahrzeuge";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { ArtikelTable, type ArtikelAnzeigeZeile } from "./ArtikelTable";

export const dynamic = "force-dynamic";

function artikelAnzeigeZeilen(db: DB, jetzt: Date): ArtikelAnzeigeZeile[] {
  const schwellen = verfallSchwellen();
  return artikelListe(db, { inklInaktiv: true }, jetzt).map((zeile) => {
    const status = zeile.naechsteCharge
      ? verfallStatus(zeile.naechsteCharge.verfall, schwellen, jetzt)
      : null;
    return {
      ...zeile,
      naechsteAmpel: status?.ampel ?? null,
      naechsteAblaufText: status && zeile.naechsteCharge
        ? chargeText(status, zeile.naechsteCharge.verfall)
        : null,
    };
  });
}

export function artikelSeitenInhalt(db: DB, jetzt: Date): ReactNode {
  const fahrzeuge = fahrzeugListe(db)
    .filter((fahrzeug) => fahrzeug.aktiv)
    .map((fahrzeug) => ({
      id: fahrzeug.id,
      name: fahrzeug.name,
      kennung: fahrzeug.kennung,
    }));

  return (
    <>
      <SeitenKopf
        titel="Artikel & Bestand"
        beschreibung="Handlager · Klick auf eine Zeile öffnet Chargen, Buchung und Stammdaten."
      />
      <ArtikelTable zeilen={artikelAnzeigeZeilen(db, jetzt)} fahrzeuge={fahrzeuge} />
    </>
  );
}

export default function ArtikelSeite() {
  return artikelSeitenInhalt(getDb(), new Date());
}
