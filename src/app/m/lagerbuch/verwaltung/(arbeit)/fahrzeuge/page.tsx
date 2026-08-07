import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import {
  fahrzeugUebersicht,
  type FahrzeugUebersichtZeile,
} from "../../../_lib/lesepfade/fahrzeuge";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import {
  FahrzeugeListe,
  type FahrzeugAnzeigeZeile,
} from "./FahrzeugeListe";

export const dynamic = "force-dynamic";

const CHECK_FORMAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function fahrzeugAnzeigeZeile(
  zeile: FahrzeugUebersichtZeile,
): FahrzeugAnzeigeZeile {
  return {
    id: zeile.id,
    name: zeile.name,
    kennung: zeile.kennung,
    aktiv: zeile.aktiv,
    templateName: zeile.templateName,
    positionen: zeile.positionen,
    faecher: zeile.faecher,
    artikelUnterSoll: zeile.artikelUnterSoll,
    verfallAuffaellig: zeile.verfallAuffaellig,
    letzterCheckText: zeile.letzterCheck === null
      ? null
      : CHECK_FORMAT.format(zeile.letzterCheck),
  };
}

export function fahrzeugeSeitenInhalt(db: DB, jetzt: Date): ReactNode {
  const zeilen = fahrzeugUebersicht(db, jetzt).map(fahrzeugAnzeigeZeile);

  return (
    <>
      <SeitenKopf
        titel="Fahrzeuge"
        beschreibung="Flotte mit Soll-Abgleich und Verfallsmeldungen aus den Fahrzeug-Checks."
      />
      <FahrzeugeListe zeilen={zeilen} />
    </>
  );
}

export default function FahrzeugeSeite() {
  return fahrzeugeSeitenInhalt(getDb(), new Date());
}
