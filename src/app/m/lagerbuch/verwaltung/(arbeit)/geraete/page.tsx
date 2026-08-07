import { getDb } from "../../../_db/client";
import type { Leser } from "../../../_lib/lesepfade/bestand";
import {
  geraeteUebersicht,
  type GeraetZeile,
} from "../../../_lib/lesepfade/geraete";
import { lagerortOptionen } from "../../../_lib/lesepfade/bz";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import {
  GeraeteListe,
  type GeraetAnzeigeZeile,
} from "./GeraeteListe";

export const dynamic = "force-dynamic";

/**
 * Explizite Projektion statt Object-Spread: kein rohes Datum und kein
 * DatumFaelligkeit-Domänenobjekt kann unbemerkt in die Client-Insel gelangen.
 */
export function geraeteAnzeigeZeilen(zeilen: GeraetZeile[]): GeraetAnzeigeZeile[] {
  return zeilen.map((zeile) => ({
    id: zeile.id,
    typ: zeile.typ,
    name: zeile.name,
    barcode: zeile.barcode,
    lagerortName: zeile.lagerortName,
    aktiv: zeile.aktiv,
    faelligkeitAmpel: zeile.faelligkeit.ampel,
    keinDatum: zeile.faelligkeit.keinDatum,
    chip: zeile.chip === null ? null : {
      ton: zeile.chip.ton,
      text: zeile.chip.text,
    },
  }));
}

export function geraeteSeitenInhalt(db: Leser, jetzt: Date = new Date()) {
  const zeilen = geraeteAnzeigeZeilen(geraeteUebersicht(db, jetzt));
  const lagerorte = lagerortOptionen(db);

  return (
    <>
      <SeitenKopf
        titel="Geräte"
        beschreibung="Medizintechnik mit MTK-Frist und Objekte mit Ablaufdatum — zwei Klassen, eine Liste."
      />
      <GeraeteListe zeilen={zeilen} lagerorte={lagerorte} />
    </>
  );
}

export default function GeraeteSeite() {
  return geraeteSeitenInhalt(getDb(), new Date());
}
