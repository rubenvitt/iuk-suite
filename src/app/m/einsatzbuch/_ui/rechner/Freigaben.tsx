"use client";

import { Card } from "antd";
import { Kartentabelle } from "@/core/tabelle";
import type { FreigabeZeile } from "../../_lib/anbindung/status";

/**
 * Die letzten 20 Schlüsselfreigaben (Brief §5.2, Entscheidung 4). Rein lesend — keine Aktion,
 * kein Formular —, aber als eigene Client-Insel wie `EchterRechner`/`TestRechnerListe`, damit
 * die Seite konsistent aus RSC + Client-Karten besteht statt zwei Bauarten zu mischen.
 */
export function Freigaben({ liste }: { liste: FreigabeZeile[] }) {
  return (
    <Card title="Letzte Schlüsselfreigaben">
      <Kartentabelle<FreigabeZeile>
        // Ohne eigene ID (die Zeile trägt keine, Entscheidung 4): der Schlüssel setzt sich aus
        // allen Feldern zusammen, nie aus dem Index — antd warnt vor `index` als Schlüssel, weil
        // er bei Sortierung/Filterung nicht stabil bleibt.
        rowKey={(z) => `${z.zeitpunkt}-${z.name}-${z.art}-${z.rechnerName}-${z.bloecke}-${z.anzahl}`}
        aria-label="Schlüsselfreigaben"
        dataSource={liste}
        leer={{ nichts: "Noch keine Schlüsselfreigaben." }}
        columns={[
          { title: "Zeitpunkt", key: "zeitpunkt", render: (_: unknown, z) => z.zeitpunkt },
          { title: "Person", key: "name", render: (_: unknown, z) => z.name },
          { title: "Art", key: "art", render: (_: unknown, z) => (z.art === "echt" ? "echt" : "Test") },
          { title: "Rechner", key: "rechnerName", render: (_: unknown, z) => z.rechnerName },
          { title: "Blöcke", key: "bloecke", render: (_: unknown, z) => z.bloecke },
          { title: "Anzahl", key: "anzahl", render: (_: unknown, z) => z.anzahl },
        ]}
      />
    </Card>
  );
}
