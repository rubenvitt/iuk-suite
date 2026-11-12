"use client";

import { useRef, useState, useTransition } from "react";
import { App } from "antd";
import type { ActionAusgang, FeldFehler } from "../../_lib/actionErgebnis";

/** Die Aktion kam nicht an oder warf (Netz weg, neuer Stand ausgerollt): keine Fehlerseite, nur der Satz. */
export const NICHT_GESPEICHERT = "Ob gespeichert wurde, ist unklar. Bitte die Seite neu laden und nachsehen, bevor du es noch einmal versuchst.";

/**
 * Eine Server Action mit Sperre gegen Doppelklick, Erfolgsmeldung und Feldfehlern (eigene Fassung des
 * Hakens aus der Gerätewartung: kein modulübergreifender Import). Nach Erfolg kommt die Akte über die
 * Props neu, weil die Actions `revalidatePath` rufen.
 */
export function useAktion() {
  const { message } = App.useApp();
  const [laeuft, starte] = useTransition();
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const sperre = useRef(false);
  const fuehreAus = (aktion: () => Promise<ActionAusgang>, erfolg: string, danach?: () => void) => {
    if (sperre.current) return;
    sperre.current = true;
    starte(async () => {
      try {
        const r = await aktion();
        if (r.ok) {
          setFeldFehler({});
          message.success(erfolg);
          danach?.();
        } else {
          setFeldFehler(r.feldFehler ?? {});
          message.error(r.fehler);
        }
      } catch {
        message.error(NICHT_GESPEICHERT);
      } finally {
        sperre.current = false;
      }
    });
  };
  return { laeuft, feldFehler, setFeldFehler, fuehreAus };
}

export type Aktion = ReturnType<typeof useAktion>;

/** Der Feldfehler der Server Action als Props für `Form.Item`. */
export function feldHilfe(feldFehler: FeldFehler, feld: string): { validateStatus?: "error"; help?: string } {
  // Listenfelder meldet die Action je Stelle („staerke.0“, „besonderheiten.3“): der erste Satz steht am Feld.
  const satz = feldFehler[feld] ?? Object.entries(feldFehler).find(([k]) => k.startsWith(`${feld}.`))?.[1];
  return satz ? { validateStatus: "error", help: satz } : {};
}
