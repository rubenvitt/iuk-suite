"use client";

import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachZahl, trifftWert, werteAlsFilter } from "@/core/tabelle";
import { zeitText } from "../_lib/heute";
import { datumLang, mengeText } from "../_lib/mhd";
import { BUCHUNGS_TEXT, type BuchungDTO } from "../_lib/typen";
import { Chip, type Farbe } from "./teile";
import s from "./verpflegung.module.css";

const FARBE: Record<BuchungDTO["art"], Farbe> = { eingang: "ok", ausgabe: "grau", aussonderung: "rot" };

export function BuchungenListe({ zeilen }: { zeilen: BuchungDTO[] }) {
  return (
    <>
      <Seitenkopf titel="Buchungen" />
      <Kartentabelle<BuchungDTO>
        rowKey="id"
        aria-label="Buchungen"
        dataSource={zeilen}
        leer={{ nichts: "Noch keine Buchungen.", gefiltert: "Keine Buchung passt zum Filter." }}
        karte={{ titel: "artikel", kennzeichen: ["art", "menge"] }}
        columns={[
          {
            title: "Zeit", key: "zeit", defaultSortOrder: "descend", sorter: nachZahl<BuchungDTO>((b) => b.zeit),
            render: (_: unknown, b: BuchungDTO) => <span className={s.ziffern}>{zeitText(b.zeit)}</span>,
          },
          {
            title: "Art", key: "art", filters: (Object.keys(BUCHUNGS_TEXT) as BuchungDTO["art"][]).map((a) => ({ text: BUCHUNGS_TEXT[a], value: a })),
            onFilter: trifftWert<BuchungDTO>((b) => b.art),
            render: (_: unknown, b: BuchungDTO) => <Chip farbe={FARBE[b.art]}>{BUCHUNGS_TEXT[b.art]}</Chip>,
          },
          {
            title: "Artikel", key: "artikel", filters: werteAlsFilter(zeilen, (b) => b.artikelName), filterSearch: true,
            onFilter: trifftWert<BuchungDTO>((b) => b.artikelName), render: (_: unknown, b: BuchungDTO) => <strong>{b.artikelName}</strong>,
          },
          { title: "Menge", key: "menge", align: "right", render: (_: unknown, b: BuchungDTO) => <span className={s.ziffern}>{mengeText(b.menge, b.einheit)}</span> },
          { title: "MHD", key: "mhd", render: (_: unknown, b: BuchungDTO) => <span className={s.mhd}>{datumLang(b.mhd)}</span> },
          { title: "Ort", key: "ort", filters: werteAlsFilter(zeilen, (b) => b.ortKurz), onFilter: trifftWert<BuchungDTO>((b) => b.ortKurz), render: (_: unknown, b: BuchungDTO) => b.ortKurz },
          { title: "Wofür / Grund", key: "grund", render: (_: unknown, b: BuchungDTO) => b.grund ?? b.ziel ?? "—" },
          { title: "Wer", key: "wer", filters: werteAlsFilter(zeilen, (b) => b.wer), filterSearch: true, onFilter: trifftWert<BuchungDTO>((b) => b.wer), render: (_: unknown, b: BuchungDTO) => b.wer },
        ]}
      />
    </>
  );
}
