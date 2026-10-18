import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import { artikel as artikelTabelle } from "../../../_db/schema";
import { ortZeile } from "../../../_lib/konstanten";
import { ortStamm } from "../../../_lib/lesepfade/orte";
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
  journalParameterAus,
  type JournalParameterErgebnis,
  type JournalRohParameter,
} from "./journalFilterLogik";

export const dynamic = "force-dynamic";

export type JournalAuswahl = { value: string; label: string };

export type JournalSeitenDaten = JournalParameterErgebnis & JournalErgebnis & {
  /** IDA-239 — was die Wahlen „Ort" und „Artikel" anbieten. */
  optionen: { orte: JournalAuswahl[]; artikel: JournalAuswahl[] };
};

const NACH_LABEL = (a: JournalAuswahl, b: JournalAuswahl) => a.label.localeCompare(b.label, "de");

/**
 * IDA-239 — DIE WAHLEN FÜR ORT UND ARTIKEL, mit stillgelegten: das Journal ist
 * append-only, und wer die Buchungen einer ausgemusterten Einheit sucht, muss
 * sie wählen können. Lager vor Einheiten, je nach Name.
 */
function journalOptionen(db: DB): JournalSeitenDaten["optionen"] {
  const orte = [...ortStamm(db).values()]
    .map((ort) => ({ value: ort.id, label: ortZeile(ort), lager: ort.typ === "lager" }))
    .sort((a, b) => Number(b.lager) - Number(a.lager) || NACH_LABEL(a, b));
  return {
    orte: orte.map(({ value, label }) => ({ value, label })),
    artikel: db.select({ id: artikelTabelle.id, name: artikelTabelle.name })
      .from(artikelTabelle).all()
      .map((zeile) => ({ value: zeile.id, label: zeile.name }))
      .sort(NACH_LABEL),
  };
}

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
  const optionen = journalOptionen(db);
  const normalisiert = journalParameterAus(parameter, {
    orte: new Set(optionen.orte.map((ort) => ort.value)),
    artikel: new Set(optionen.artikel.map((eintrag) => eintrag.value)),
  });
  const ergebnis = journalEintraege(db, {
    ...normalisiert.filter,
    grenze: JOURNAL_GRENZE,
  });
  return { ...normalisiert, ...ergebnis, optionen };
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
  if (daten.filter.vorgang) filter.vorgang = daten.filter.vorgang;
  if (daten.filter.von) filter.von = daten.filter.von.toISOString();
  if (daten.filter.bis) filter.bis = daten.filter.bis.toISOString();
  if (daten.filter.artikelId) filter.artikelId = daten.filter.artikelId;
  if (daten.filter.lagerortId) filter.lagerortId = daten.filter.lagerortId;
  return filter;
}

export function journalInhalt(daten: JournalSeitenDaten): ReactNode {
  return (
    <>
      {/*
        ⚠️ HIER STEHT KEINE ZAHL MEHR, und das ist der Punkt (DRK-331, vierte
        Reviewrunde). Die Beschreibung entsteht SERVERSEITIG, EINMAL, aus der
        ersten Seite — `JournalTable` laedt danach beim Scrollen nach. Der Satz
        „100 Treffer geladen — weitere beim Scrollen" stand also weiter da,
        waehrend 300 Zeilen auf dem Schirm waren, und auch noch, wenn es gar
        keine weiteren mehr gab. Eine Zahl neben einer Tabelle ist eine Aussage
        UEBER DIESE TABELLE; wer nachlaedt, muss sie dort fuehren, wo der Stand
        liegt. `deckelText` wird deshalb jetzt in der Insel gerufen.
      */}
      <SeitenKopf
        titel="Journal"
        beschreibung={
          "Append-only Buchungsjournal — der Bestand ist immer die Summe "
          + "der Buchungen."
        }
      />
      <JournalFilter
        q={daten.werte.q}
        typ={daten.werte.typ}
        von={daten.werte.von}
        bis={daten.werte.bis}
        ort={daten.werte.ort}
        artikel={daten.werte.artikel}
        orte={daten.optionen.orte}
        artikelOptionen={daten.optionen.artikel}
        hinweise={daten.hinweise}
      />
      <JournalTable
        ersteZeilen={daten.zeilen.map(journalZeileDTO)}
        ersterCursor={daten.naechsterCursor
          ? { ts: daten.naechsterCursor.ts.toISOString(), id: daten.naechsterCursor.id }
          : null}
        abrufFilter={abrufFilterAus(daten)}
        leertext={daten.hatFilter
          ? "Keine Buchung passt zu Suche, Ort, Artikel, Vorgang und Zeitraum."
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
