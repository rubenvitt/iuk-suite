import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import { JOURNAL_GRENZE } from "../../../_lib/grenzen";
import { journalZeile } from "../../../_lib/journalZeile";
import {
  journalEintraege,
  type JournalErgebnis,
  type JournalZeileRoh,
} from "../../../_lib/lesepfade/journal";
import { fmtTs } from "../../../_lib/zeit";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { JournalFilter } from "./JournalFilter";
import {
  JournalTable,
  type JournalAnzeigeZeile,
} from "./JournalTable";
import {
  deckelText,
  journalParameterAus,
  type JournalParameterErgebnis,
  type JournalRohParameter,
} from "./journalFilterLogik";

export const dynamic = "force-dynamic";

export type JournalSeitenDaten = JournalParameterErgebnis & JournalErgebnis;

/**
 * Regime B: Die URL wird vor dem Reader normalisiert, dann greifen alle
 * WHERE-Bedingungen auf die gesamte Historie und erst danach der 100er-Deckel.
 */
export function journalDaten(
  db: DB,
  parameter: JournalRohParameter,
): JournalSeitenDaten {
  const normalisiert = journalParameterAus(parameter);
  const ergebnis = journalEintraege(db, {
    ...normalisiert.filter,
    grenze: JOURNAL_GRENZE,
  });
  return { ...normalisiert, ...ergebnis };
}

function journalAnzeigeZeilen(
  zeilen: JournalZeileRoh[],
): JournalAnzeigeZeile[] {
  return zeilen.map((zeile) => {
    const darstellung = journalZeile(zeile);

    return {
      id: zeile.id,
      zeitText: fmtTs(zeile.ts),
      artikelName: zeile.artikelName,
      vorgangText: darstellung.typText
        + (zeile.kommentar ? ` · ${zeile.kommentar}` : ""),
      deltaText: darstellung.mengeText,
      deltaTon: darstellung.zustand === "negativ" ? "negativ" : "positiv",
      quelleName: zeile.quelleName,
    };
  });
}

export function journalInhalt(daten: JournalSeitenDaten): ReactNode {
  const zeilen = journalAnzeigeZeilen(daten.zeilen);
  const beschreibung = deckelText(zeilen.length, daten.mehrVorhanden);

  return (
    <>
      <SeitenKopf
        titel="Journal"
        beschreibung={
          "Append-only Buchungsjournal — der Bestand ist immer die Summe "
          + `der Buchungen. ${beschreibung}.`
        }
      />
      <JournalFilter
        q={daten.werte.q}
        typ={daten.werte.typ}
        von={daten.werte.von}
        bis={daten.werte.bis}
        hinweise={daten.hinweise}
      />
      <JournalTable
        zeilen={zeilen}
        leertext={daten.hatFilter
          ? "Keine Buchung passt zu Suche, Vorgang und Zeitraum."
          : "Noch keine Buchung."}
      />
    </>
  );
}

export default async function JournalSeite({
  searchParams,
}: {
  searchParams: Promise<JournalRohParameter>;
}) {
  return journalInhalt(journalDaten(getDb(), await searchParams));
}
