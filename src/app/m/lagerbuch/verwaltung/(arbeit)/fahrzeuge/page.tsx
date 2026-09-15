import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import {
  fahrzeugUebersicht,
  type FahrzeugUebersichtZeile,
} from "../../../_lib/lesepfade/fahrzeuge";
import { fmtDatumZeit } from "../../../_lib/zeit";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { ChecklisteKnopf } from "./ChecklisteKnopf";
import { CheckDurchfuehrenKnopf } from "./CheckDurchfuehrenKnopf";
import {
  FahrzeugeListe,
  type FahrzeugAnzeigeZeile,
} from "./FahrzeugeListe";

export const dynamic = "force-dynamic";

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
    verfallAbgelaufen: zeile.verfallAbgelaufen,
    verfallWarnend: zeile.verfallWarnend,
    verfallErfasst: zeile.verfallErfasst,
    verfallSollArtikel: zeile.verfallSollArtikel,
    letzterCheckText: zeile.letzterCheck === null
      ? null
      : fmtDatumZeit(zeile.letzterCheck),
    /**
     * ⚠️ DER ROHWERT REIST MIT, WEIL DIE SPALTE DANACH SORTIERT.
     * `letzterCheckText` ist „14.09.2026, 08:12" und ordnete als Zeichenkette
     * den 2. Oktober vor den 14. September. `null` heisst „noch nie geprueft"
     * und landet aufsteigend hinten.
     */
    letzterCheckIso: zeile.letzterCheck === null
      ? null
      : zeile.letzterCheck.toISOString(),
  };
}

export function fahrzeugeSeitenInhalt(db: DB, jetzt: Date): ReactNode {
  const zeilen = fahrzeugUebersicht(db, jetzt).map(fahrzeugAnzeigeZeile);

  return (
    <>
      {/*
        Der Knopf traegt KEINE `fahrzeugId` und meint damit alle AKTIVEN
        Fahrzeuge — bewusst nicht die gerade gefilterte Tabelle: Suche und
        Filter leben als Zustand in der Client-Insel darunter und stehen nicht
        in der URL, koennten also gar nicht mitwandern. Ein Knopf, der „drucke,
        was ich sehe" verspricht und „drucke alle" tut, ist schlimmer als
        einer, der von vornherein „alle" sagt.
      */}
      <SeitenKopf
        titel="Fahrzeuge"
        beschreibung="Flotte mit Soll-Abgleich und Verfallsmeldungen aus den Fahrzeug-Checks."
        aktionen={(
          <>
            {/*
              DER ÜBERGREIFENDE EINSTIEG — DRK-305. OHNE `fahrzeugId`: von hier
              führt der Weg auf die Fahrzeugwahl, nicht auf ein einzelnes
              Fahrzeug. Genau dafür ist das Ticket geschrieben — wer angemeldet
              prüft, ist nicht auf das gescannte Fahrzeug beschränkt.
            */}
            <CheckDurchfuehrenKnopf beschriftung="Check durchführen" />
            <ChecklisteKnopf beschriftung="Checklisten drucken" />
          </>
        )}
      />
      <FahrzeugeListe zeilen={zeilen} />
    </>
  );
}

export default function FahrzeugeSeite() {
  return fahrzeugeSeitenInhalt(getDb(), new Date());
}
