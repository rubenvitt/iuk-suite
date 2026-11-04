import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import {
  bzAkkuKennzahlGesamt,
  bzGeraeteUebersicht,
  lagerortOptionen,
} from "../../../_lib/lesepfade/bz";
import { Kachel } from "../../../_ui/Kachel";
import { Kennzahlen } from "@/core/kennzahl/Kennzahl";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { BzListe } from "./BzListe";
import { bzAnzeigeZeilen } from "./bzAnzeige";

export const dynamic = "force-dynamic";

export function bzSeitenInhalt(db: DB, jetzt: Date): ReactNode {
  const geraete = bzGeraeteUebersicht(db, jetzt);
  const zeilen = bzAnzeigeZeilen(geraete);
  const lagerorte = lagerortOptionen(db);

  const aktive = geraete.filter((g) => g.aktiv);
  const faellig = aktive.filter((g) => g.faelligkeit.ampel !== "gruen").length;
  /*
   * ⚠️ `nieGeprueft` MUSS mitgezaehlt werden. `domain/bz.ts#bzFaelligkeit`
   * liefert fuer ein nie geprueftes Geraet `ampel: "rot"` bei
   * `ueberfaellig: false` — wer nur `ueberfaellig` zaehlt, meldet den
   * schlechtesten Fall im Bestand als unauffaellig. Das Original zaehlt
   * genauso (lagerbuch/src/app/verwaltung/(admin)/bz/page.tsx:17).
   */
  const ueberfaellig = aktive.filter(
    (g) => g.faelligkeit.ueberfaellig || g.faelligkeit.nieGeprueft,
  ).length;

  const akku = bzAkkuKennzahlGesamt(db);
  /* `null` = weniger als zwei Wechsel, also kein Intervall messbar. Das ist
   * kein Missstand und bekommt deshalb keinen Warnton. */
  const akkuText = akku.tageDurchschnitt === null
    ? "–"
    : `${Math.round(akku.tageDurchschnitt)} T`;

  return (
    <>
      <SeitenKopf
        titel="BZ-Kontrolle"
      />

      <Kennzahlen>
        <Kachel zahl={aktive.length} beschriftung="Aktive Geräte" />
        <Kachel
          zahl={faellig}
          beschriftung="Kontrolle fällig/bald"
          ton={faellig ? "gelb" : "ok"}
        />
        <Kachel
          zahl={ueberfaellig}
          beschriftung="Überfällig / nie geprüft"
          ton={ueberfaellig ? "rot" : "ok"}
        />
        <Kachel zahl={akkuText} beschriftung="Ø Akku-Lebensdauer" />
      </Kennzahlen>

      <BzListe zeilen={zeilen} lagerorte={lagerorte} />
    </>
  );
}

export default function BzSeite() {
  return bzSeitenInhalt(getDb(), new Date());
}

export const metadata = { title: "BZ-Kontrolle" };
