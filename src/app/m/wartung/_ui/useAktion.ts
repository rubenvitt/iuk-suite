"use client";

import { useRef, useState, useTransition } from "react";
import { App } from "antd";
import type { Ergebnis } from "../_lib/typen";

/**
 * Eine Server Action mit Sperre gegen Doppelklick, Erfolgsmeldung und Feldfehlern. Nach Erfolg lädt die
 * Seite über `revalidatePath` neu.
 */
export function useAktion() {
  const { message } = App.useApp();
  const [laeuft, starte] = useTransition();
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const sperre = useRef(false);
  const fuehreAus = (aktion: () => Promise<Ergebnis>, erfolg: string, danach?: (r: Extract<Ergebnis, { ok: true }>) => void) => {
    if (sperre.current) return;
    sperre.current = true;
    starte(async () => {
      try {
        const r = await aktion();
        if (r.ok) {
          setFeldFehler({});
          message.success(erfolg);
          danach?.(r);
        } else {
          setFeldFehler(r.feldFehler ?? {});
          message.error(r.fehler);
        }
      } finally {
        sperre.current = false;
      }
    });
  };
  return { laeuft, feldFehler, setFeldFehler, fuehreAus };
}
