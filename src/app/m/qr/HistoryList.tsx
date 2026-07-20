"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  clearHistory,
  getHistorySnapshot,
  getHistoryServerSnapshot,
  subscribeHistory,
} from "@/app/m/qr/_lib/history";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";

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
    <section aria-label="Verlauf" data-testid="qr-history" className="flex flex-col gap-3">
      <h2 className="font-semibold">Zuletzt erzeugt</h2>
      <ul className="flex flex-col gap-2">
        {entries.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              // Der Verlauf haelt das Payload, nicht den fertigen String —
              // deshalb entsteht die URL hier ueber denselben Weg wie beim
              // ersten Erzeugen und kann gar nicht davon abweichen.
              onClick={() => router.push(buildQrUrl(e.label, e.payload))}
              data-testid="history-entry"
              className="flex min-h-[var(--tap)] w-full items-center rounded border border-[var(--color-linie)] px-3 text-left"
            >
              <span className="truncate">{e.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => clearHistory()}
        className="min-h-[var(--tap)] self-start text-[var(--color-stahl)] underline"
      >
        Verlauf löschen
      </button>
    </section>
  );
}
