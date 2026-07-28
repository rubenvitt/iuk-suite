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

import { SPACE, TAP_XL } from "@/core/theme/tokens";
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
              /*
               * `whiteSpace: "normal"` schlaegt antds Button-Basisstil, der
               * `nowrap` setzt — OHNE `overflow: hidden` dazu. Bei `kind=url`
               * ist das Label die volle Nutzereingabe; gemessen nach dem
               * Erzeugen eines Codes mit einer 95 Zeichen langen URL: der Knopf
               * 358px breit, sein Inhalt 557px, das innere <span> 757px, das
               * Dokument scrollte auf 574px.
               *
               * `height: "auto"` muss mit: `size="large"` setzt eine feste
               * Hoehe, in die zwei oder drei Zeilen nicht passen. Der Nachbar
               * `PresetGrid.tsx:41` teilt zwar `whiteSpace: "normal"`, pinnt
               * dort aber bewusst `height: 128` (feste Hoehe) — fuer `height`
               * ist er also gerade KEIN Vorbild, nur fuer `whiteSpace`.
               *
               * Ungemessen war `height: "auto"` allein zu wenig: einzeilig
               * (390x844, Playwright, Beschriftung "kurz") lieferte
               * `getBoundingClientRect()` 39px — unter der 44px-Schwelle dieses
               * Branches und weit unter den 72px, die `size="large"` vorher
               * ausschliesslich stellte. `minHeight: TAP_XL` stellt den Boden
               * wieder her, ohne den mehrzeiligen Wuchs zu kappen: derselbe Lauf
               * lieferte fuer die lange Wiki-URL 81px, danach unveraendert.
               */
              style={{
                textAlign: "left",
                whiteSpace: "normal",
                height: "auto",
                minHeight: TAP_XL,
                overflowWrap: "anywhere",
                paddingBlock: SPACE.sm,
              }}
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
