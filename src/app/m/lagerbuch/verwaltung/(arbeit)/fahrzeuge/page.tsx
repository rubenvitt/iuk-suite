import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import {
  fahrzeugUebersicht,
  type FahrzeugUebersichtZeile,
} from "../../../_lib/lesepfade/fahrzeuge";
import { fmtDatumZeit } from "../../../_lib/zeit";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { ChecklisteKnopf } from "./ChecklisteKnopf";
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
    einheitenart: zeile.einheitenart,
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
      {/*
        ⚠️ DER TITEL NENNT BEIDE ARTEN, DER PFAD BLEIBT `/fahrzeuge` (DRK-309).

        Eine Tasche ist im Modell dasselbe wie ein Fahrzeug (`typ = "fahrzeug"`,
        Begruendung an der Spalte `einheitenart` in `_db/schema.ts`), und eine
        zweite Seite daneben waere eine zweite Liste ueber derselben Tabelle —
        mit zwei Suchen, zwei Filtersaetzen und der Frage, wo die noch nicht
        zugeordneten Einheiten stehen. Umbenannt wird deshalb, was man LIEST,
        nicht, was man TIPPT: der Pfad steht in Zugangs-Codes, auf gedruckten
        Kärtchen und in älteren Anwender-Notizen.
      */}
      <SeitenKopf
        titel="Fahrzeuge und Taschen"
        beschreibung="Fahrzeuge und Taschen mit Soll-Abgleich und Verfallsmeldungen aus ihren Checks."
        aktionen={<ChecklisteKnopf beschriftung="Checklisten drucken" />}
      />
      <FahrzeugeListe zeilen={zeilen} />
    </>
  );
}

export default function FahrzeugeSeite() {
  return fahrzeugeSeitenInhalt(getDb(), new Date());
}
