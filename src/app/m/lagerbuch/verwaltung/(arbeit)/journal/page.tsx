import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import { JOURNAL_GRENZE } from "../../../_lib/grenzen";
import {
  journalEintraege,
  type JournalErgebnis,
} from "../../../_lib/lesepfade/journal";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { JournalFilter } from "./JournalFilter";
import { journalZeileDTO } from "../../../_lib/journalDTO";
import { JournalTable, type JournalAbrufFilter } from "./JournalTable";
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
 *
 * ⚠️ DER DECKEL IST SEIT DRK-331 EINE PORTIONSGROESSE, KEINE GRENZE. Diese
 * Funktion liefert weiter genau eine Portion; die weiteren holt die Client-Insel
 * ueber `naechsteJournalSeite` mit der Schluesselposition nach. Die Begruendung
 * fuer den Deckel selbst bleibt unveraendert (`_lib/grenzen.ts`):
 * `better-sqlite3` ist SYNCHRON, ein Vollladen blockiert die GANZE Suite.
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

/**
 * Der Filter, mit dem die Client-Insel ihre Nachschlaege fahren muss.
 *
 * ⚠️ ER WIRD AUS DEN NORMALISIERTEN WERTEN GEBAUT, nicht aus den rohen
 * URL-Parametern: sonst faehrt der erste Abruf gegen einen geprueften Filter und
 * jeder weitere gegen einen ungeprueften — und ein ungueltiger Tag in der URL
 * lieferte ab Seite zwei andere Zeilen als auf Seite eins.
 */
function abrufFilterAus(daten: JournalSeitenDaten): JournalAbrufFilter {
  // ⚠️ NICHT GESETZTE SCHLUESSEL FEHLEN, sie stehen nicht auf `undefined`.
  // `page.test.tsx` prueft diese Grenze strenger als JSON: erlaubt sind nur
  // Zeichenkette, Zahl, Wahrheitswert, `null`, Feld und schlichtes Objekt — ein
  // `undefined` faellt durch. Das ist keine Schikane: `JSON.stringify` wirft
  // solche Schluessel ohnehin weg, ein Vertrag, der sie nennt, behauptet also
  // etwas, das auf der anderen Seite nicht ankommt.
  const filter: JournalAbrufFilter = {};
  if (daten.filter.q) filter.q = daten.filter.q;
  if (daten.filter.typ) filter.typ = daten.filter.typ;
  if (daten.filter.von) filter.von = daten.filter.von.toISOString();
  if (daten.filter.bis) filter.bis = daten.filter.bis.toISOString();
  return filter;
}

export function journalInhalt(daten: JournalSeitenDaten): ReactNode {
  const beschreibung = deckelText(daten.zeilen.length, daten.mehrVorhanden);

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
        ersteZeilen={daten.zeilen.map(journalZeileDTO)}
        ersterCursor={daten.naechsterCursor
          ? { ts: daten.naechsterCursor.ts.toISOString(), id: daten.naechsterCursor.id }
          : null}
        abrufFilter={abrufFilterAus(daten)}
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
