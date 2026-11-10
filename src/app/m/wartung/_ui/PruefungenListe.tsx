"use client";

import Link from "next/link";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachText, Zellentext } from "@/core/tabelle";
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
          {
            // IDA-393: wer es erledigt hat, als leise zweite Zeile unter dem Datum.
            title: "Datum", key: "am", sorter: nachText<EintragDTO>((e) => e.am),
            render: (_: unknown, e: EintragDTO) => (
              <div>
                <span className={s.ziffern}>{datum(e.am)}</span>
                {e.wer ? <div className={s.neben}>{e.wer}</div> : null}
              </div>
            ),
          },
          { title: "Gerät", key: "geraet", render: (_: unknown, e: EintragDTO) => <Link href={`/geraete/${e.geraetId}`}>{e.geraetName}</Link> },
          { title: "Ergebnis", key: "ergebnis", render: (_: unknown, e: EintragDTO) => (e.ergebnis ? <Chip farbe={ZUSTAND_FARBE[e.ergebnis]}>{ERGEBNIS_TEXT[e.ergebnis]}</Chip> : "—") },
          {
            // IDA-393: der Zählerstand als zweite Zeile unter dem, was erledigt wurde.
            title: "Was", key: "titel",
            render: (_: unknown, e: EintragDTO) => (
              <div>
                {e.titel}
                {e.stunden != null ? <div className={`${s.neben} ${s.ziffern}`}>bei {stundenText(e.stunden)}</div> : null}
              </div>
            ),
          },
          { title: "Bemerkung", key: "notiz", render: (_: unknown, e: EintragDTO) => (e.notiz ? <Zellentext text={e.notiz} style={{ maxWidth: "24ch" }} /> : "—") },
        ]}
      />
    </>
  );
}
