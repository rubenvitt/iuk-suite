import { Table, type TableProps } from "antd";
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
import { Chip } from "../../../_ui/Chip";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import s from "../../../_ui/verwaltung.module.css";
import { JournalFilter } from "./JournalFilter";
import {
  deckelText,
  journalParameterAus,
  type JournalParameterErgebnis,
  type JournalRohParameter,
} from "./journalFilterLogik";

export const dynamic = "force-dynamic";

export type JournalSeitenDaten = JournalParameterErgebnis & JournalErgebnis;

type JournalAnzeigeZeile = {
  id: string;
  zeit: ReactNode;
  artikel: ReactNode;
  vorgang: string;
  delta: ReactNode;
  quelle: ReactNode;
};

const SPALTEN: TableProps<JournalAnzeigeZeile>["columns"] = [
  { title: "Zeit", dataIndex: "zeit", key: "zeit" },
  { title: "Artikel", dataIndex: "artikel", key: "artikel" },
  { title: "Vorgang", dataIndex: "vorgang", key: "vorgang" },
  { title: "Δ", dataIndex: "delta", key: "delta", align: "right" },
  { title: "Quelle", dataIndex: "quelle", key: "quelle" },
];

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
    const deltaKlasse = darstellung.zustand === "negativ"
      ? s.jminus
      : s.jplus;

    return {
      id: zeile.id,
      zeit: <span className={s.jts}>{fmtTs(zeile.ts)}</span>,
      artikel: <span style={{ fontWeight: 600 }}>{zeile.artikelName}</span>,
      vorgang: darstellung.typText
        + (zeile.kommentar ? ` · ${zeile.kommentar}` : ""),
      delta: (
        <span className={`${s.jdelta} ${deltaKlasse}`}>
          {darstellung.mengeText}
        </span>
      ),
      quelle: <Chip ton="grau">{zeile.quelleName}</Chip>,
    };
  });
}

/**
 * Alle Zellen werden vor der Client-Grenze aufgebaut. Deshalb brauchen weder
 * die Spalten `render`-Funktionen noch `rowKey` eine Callback-Funktion.
 */
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
      <Table<JournalAnzeigeZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Buchungsjournal"
        dataSource={zeilen}
        locale={{
          emptyText: daten.hatFilter
            ? "Keine Buchung passt zu Suche, Vorgang und Zeitraum."
            : "Noch keine Buchung.",
        }}
        columns={SPALTEN}
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
