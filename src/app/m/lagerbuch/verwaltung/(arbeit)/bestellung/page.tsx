import { getDb } from "../../../_db/client";
import {
  bestellvorschlag,
  type BestellZeile,
} from "../../../_lib/lesepfade/bestellung";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import {
  BestellListe,
  type BestellAnzeigeZeile,
} from "./BestellListe";

export const dynamic = "force-dynamic";

const DATUM = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Formatiert den Zeitstempel vor der RSC-/Client-Grenze. */
export function bestellAnzeigeZeile(z: BestellZeile): BestellAnzeigeZeile {
  const { bestelltSeit, ...serialisierbar } = z;
  return {
    ...serialisierbar,
    bestelltSeitText: bestelltSeit ? DATUM.format(bestelltSeit) : null,
  };
}

export default function BestellungSeite() {
  const zeilen = bestellvorschlag(getDb()).map(bestellAnzeigeZeile);
  return (
    <>
      <SeitenKopf
        titel="Bestellvorschlag"
        beschreibung="Unterbestände zuerst. Bleibt eine Bestellmarkierung trotz wieder gedecktem Bestand stehen, kann sie hier nachvollziehbar zurückgenommen werden."
      />
      <BestellListe zeilen={zeilen} />
    </>
  );
}
