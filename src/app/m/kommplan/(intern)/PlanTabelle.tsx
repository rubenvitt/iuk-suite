"use client";

import Link from "next/link";
import type { TableProps } from "antd";
import { Kartentabelle, nachText } from "@/core/tabelle";
import type { Listenzeile } from "../_lib/plaene";

/**
 * Client-Insel, weil die Spalten render-Funktionen tragen (Falle 9); Titel als Zeichenketten (Falle 17).
 * `Kartentabelle` statt nackter `Datentabelle`: unter 768px dieselben Spalten als Karten, samt Leiste
 * für Sortierung (docs/design/README.md, „Mobil", DRK-451). Sie steht auf dem Telefon nicht breit
 * da, braucht also kein `scroll`. Links auf `/p/<id>` (Abweichung 11).
 */
export function PlanTabelle({ zeilen }: { zeilen: Listenzeile[] }) {
  const spalten: NonNullable<TableProps<Listenzeile>["columns"]> = [
    { key: "titel", title: "Titel", dataIndex: "titel", sorter: nachText<Listenzeile>((z) => z.titel),
      render: (_: unknown, z: Listenzeile) => <Link href={`/p/${z.id}`}>{z.titel}</Link> },
    { key: "kennzeichen", title: "Kennzeichen", render: (_: unknown, z: Listenzeile) => (
      <span className="kp-chips">
        {z.vorlage ? <span className="kp-chip">Vorlage</span> : null}
        {z.lesbar ? null : <span className="kp-chip kp-chip-hinweis">nicht lesbar</span>}
      </span>
    ) },
    { key: "typ", title: "Art", dataIndex: "typ" },
    { key: "datum", title: "Datum", dataIndex: "datum", render: (d: string | null) => d ?? "—" },
    { key: "stand", title: "Stand", dataIndex: "stand" },
  ];
  return (
    <Kartentabelle<Listenzeile>
      aria-label="Pläne"
      rowKey="id"
      dataSource={zeilen}
      columns={spalten}
      leer={{ nichts: "Noch keine Pläne." }}
      karte={{ titel: "titel", kennzeichen: ["kennzeichen"] }}
    />
  );
}
