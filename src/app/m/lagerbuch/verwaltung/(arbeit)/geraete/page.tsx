import { getDb } from "../../../_db/client";
import type { Leser } from "../../../_lib/lesepfade/bestand";
import {
  geraeteUebersicht,
  type GeraetZeile,
} from "../../../_lib/lesepfade/geraete";
import { lagerortOptionen } from "../../../_lib/lesepfade/bz";
import { standortZeile } from "../../../_lib/konstanten";
import { Kachel } from "../../../_ui/Kachel";
import { Kennzahlen } from "@/core/kennzahl/Kennzahl";
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
    standortText: standortZeile(zeile.lagerortStandort),
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
  // EIN Abruf, wiederverwendet fuer Liste UND Kennzahlleiste — ein zweiter
  // `geraeteUebersicht`-Aufruf waere ein zweiter Datenbankdurchlauf fuer
  // dieselbe Frage.
  const geraeteZeilen = geraeteUebersicht(db, jetzt);
  const zeilen = geraeteAnzeigeZeilen(geraeteZeilen);
  const lagerorte = lagerortOptionen(db);

  const aktive = geraeteZeilen.filter((g) => g.aktiv);
  /*
   * `DatumFaelligkeit.ampel` ist laut domain/geraet.ts NUR aussagekraeftig,
   * wenn `keinDatum === false`. Ein Geraet ohne gepflegtes Datum darf keine
   * Faelligkeit melden — sonst zaehlt die Kachel Pflegeluecken als Missstand,
   * und die Zahl waechst mit jedem neu angelegten Geraet.
   */
  const mtkFaellig = aktive.filter(
    (g) => g.typ === "medizin" && !g.faelligkeit.keinDatum && g.faelligkeit.ampel !== "gruen",
  ).length;
  const mtkUeberfaellig = aktive.filter(
    (g) => g.typ === "medizin" && g.faelligkeit.ueberfaellig,
  ).length;
  const objektAblaufend = aktive.filter(
    (g) => g.typ === "objekt" && !g.faelligkeit.keinDatum && g.faelligkeit.ampel !== "gruen",
  ).length;

  return (
    <>
      <SeitenKopf
        titel="Geräte"
      />

      <Kennzahlen>
        <Kachel zahl={aktive.length} beschriftung="Aktive Geräte" />
        <Kachel
          zahl={mtkFaellig}
          beschriftung="MTK fällig/bald"
          ton={mtkFaellig ? "gelb" : "ok"}
        />
        <Kachel
          zahl={mtkUeberfaellig}
          beschriftung="MTK überfällig"
          ton={mtkUeberfaellig ? "rot" : "ok"}
        />
        <Kachel
          zahl={objektAblaufend}
          beschriftung="Objekte ablaufend"
          ton={objektAblaufend ? "gelb" : "ok"}
        />
      </Kennzahlen>

      <GeraeteListe zeilen={zeilen} lagerorte={lagerorte} />
    </>
  );
}

export default function GeraeteSeite() {
  return geraeteSeitenInhalt(getDb(), new Date());
}

export const metadata = { title: "Geräte" };
