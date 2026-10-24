"use client";

import { Kartentabelle } from "@/core/tabelle";
import { zeitFormat } from "@/core/zeit";
import type { LaufDTO } from "../_lib/daten";
import { AUSSCHLUSSGRUENDE, GRUND_TEXT } from "../_lib/filter";
import { QUELLE_TEXT } from "../_lib/quellen";

const ZEIT = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Das Abgleichprotokoll: wer wann abgeglichen hat und mit welchem Ergebnis — ohne Helfernamen. */
export function LaufListe({ laeufe }: { laeufe: LaufDTO[] }) {
  return (
    <Kartentabelle<LaufDTO>
      rowKey="id"
      aria-label="Letzte Abgleiche"
      dataSource={laeufe}
      leer={{ nichts: "Noch kein Abgleich." }}
      columns={[
        { title: "Zeitpunkt", key: "zeitpunkt", render: (_: unknown, l: LaufDTO) => ZEIT.format(new Date(l.zeitpunkt)) },
        { title: "Quelle", key: "quelle", render: (_: unknown, l: LaufDTO) => QUELLE_TEXT[l.quelle] },
        { title: "Von", key: "von", render: (_: unknown, l: LaufDTO) => l.vonName },
        {
          title: "Ergebnis",
          key: "ergebnis",
          render: (_: unknown, l: LaufDTO) => `${l.gelesen} gelesen · ${l.neu} neu · ${l.geaendert} geändert · ${l.entfernt} gelöscht`,
        },
        {
          title: "Ausgefiltert",
          key: "ausgefiltert",
          render: (_: unknown, l: LaufDTO) =>
            AUSSCHLUSSGRUENDE.filter((g) => (l.ausgefiltert[g] ?? 0) > 0).map((g) => `${l.ausgefiltert[g]} ${GRUND_TEXT[g]}`).join(", ") || "—",
        },
      ]}
    />
  );
}
