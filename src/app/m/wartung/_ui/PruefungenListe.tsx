"use client";

import Link from "next/link";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachText } from "@/core/tabelle";
import { ERGEBNIS_TEXT } from "../_lib/fristen";
import type { EintragDTO } from "../_lib/typen";
import { GruppenFilter } from "./GruppenFilter";
import { Chip, datum, stundenText, ZUSTAND_FARBE } from "./teile";
import s from "./wartung.module.css";

export function PruefungenListe({ zeilen, gruppenWahl, gewaehlt }: {
  zeilen: EintragDTO[];
  gruppenWahl: { id: string; name: string }[];
  gewaehlt: string | null;
}) {
  return (
    <>
      <Seitenkopf titel="Prüfungen und Wartungen" aktionen={<GruppenFilter wahl={gruppenWahl} gewaehlt={gewaehlt} />} />
      <Kartentabelle<EintragDTO>
        rowKey="id"
        aria-label="Prüfungen und Wartungen"
        dataSource={zeilen}
        leer={{ nichts: "Noch nichts erledigt", figur: "wartung" }}
        karte={{ titel: "geraet", kennzeichen: ["ergebnis"] }}
        columns={[
          { title: "Datum", key: "am", sorter: nachText<EintragDTO>((e) => e.am), render: (_: unknown, e: EintragDTO) => <span className={s.ziffern}>{datum(e.am)}</span> },
          { title: "Gerät", key: "geraet", render: (_: unknown, e: EintragDTO) => <Link href={`/geraete/${e.geraetId}`}>{e.geraetName}</Link> },
          { title: "Was", key: "titel", render: (_: unknown, e: EintragDTO) => e.titel },
          { title: "Ergebnis", key: "ergebnis", render: (_: unknown, e: EintragDTO) => (e.ergebnis ? <Chip farbe={ZUSTAND_FARBE[e.ergebnis]}>{ERGEBNIS_TEXT[e.ergebnis]}</Chip> : "—") },
          { title: "Stunden", key: "stunden", align: "right", render: (_: unknown, e: EintragDTO) => <span className={s.ziffern}>{stundenText(e.stunden)}</span> },
          { title: "Wer", key: "wer", render: (_: unknown, e: EintragDTO) => e.wer || "—" },
          { title: "Bemerkung", key: "notiz", render: (_: unknown, e: EintragDTO) => e.notiz || "—" },
        ]}
      />
    </>
  );
}
