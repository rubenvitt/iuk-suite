"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button, Typography } from "antd";
import {
  clearHistory,
  getHistorySnapshot,
  getHistoryServerSnapshot,
  subscribeHistory,
} from "@/app/m/qr/_lib/history";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";

import { SPACE } from "@/core/theme/tokens";
export function HistoryList() {
  // Der Verlauf liegt im localStorage, den es auf dem Server nicht gibt.
  // useSyncExternalStore rendert deshalb serverseitig die leere Liste und
  // schaltet nach dem Hydrieren auf den echten Stand um — ohne Mismatch und
  // ohne den Umweg über einen useEffect, der nur State spiegelt.
  const entries = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot,
  );
  const router = useRouter();

  if (entries.length === 0) return null;

  return (
    <section
      aria-label="Verlauf"
      data-testid="qr-history"
      style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}
    >
      <Typography.Title level={5} style={{ margin: 0 }}>
        Zuletzt erzeugt
      </Typography.Title>
      <ul
        style={{
          display: "flex",
          flexDirection: "column",
          gap: SPACE.sm,
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {entries.map((e) => (
          <li key={e.id}>
            <Button
              block
              size="large"
              // Der Verlauf haelt das Payload, nicht den fertigen String —
              // deshalb entsteht die URL hier ueber denselben Weg wie beim
              // ersten Erzeugen und kann gar nicht davon abweichen.
              onClick={() => router.push(buildQrUrl(e.label, e.payload))}
              data-testid="history-entry"
              style={{ textAlign: "left" }}
            >
              {e.label}
            </Button>
          </li>
        ))}
      </ul>
      {/* Direktes Kind von <section>: HistoryList.test.tsx klickt über den
          Selektor `section > button`. Nicht in einen Wrapper packen. */}
      <Button
        type="link"
        onClick={() => clearHistory()}
        style={{ alignSelf: "flex-start", padding: 0 }}
      >
        Verlauf löschen
      </Button>
    </section>
  );
}
