"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionAusgang } from "../../../../../_lib/actionErgebnis";

/**
 * SOFORT WIRKENDE EINRICHTUNG der Zählseite (Spec 6.5–6.7): Plombe anlegen,
 * Gerät oder Flasche verknüpfen oder umsetzen. Das sind Stammdaten, kein
 * Zählergebnis — sie gehen nicht in den Entwurf, sondern gleich an die Action,
 * und danach lädt `router.refresh()` die Daten der Insel neu (der Zählstand
 * bleibt, er liegt im Entwurf).
 *
 * Die Absage der Action steht als Text in `fehler`; der Aufrufer zeigt ihn im
 * Dialog, der dann offen bleibt.
 */
export function useSofort(allgemein: string) {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  /** Ein Doppeltipp vor dem nächsten Rendern sähe `laeuft` noch auf `false`. */
  const schreibtGerade = useRef(false);

  async function ausfuehren(aufruf: () => Promise<ActionAusgang>, danach?: () => void): Promise<boolean> {
    if (schreibtGerade.current) return false;
    schreibtGerade.current = true;
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await aufruf();
      if (!r.ok) {
        setFehler(r.fehler);
        return false;
      }
      danach?.();
      router.refresh();
      return true;
    } catch {
      setFehler(allgemein);
      return false;
    } finally {
      schreibtGerade.current = false;
      setLaeuft(false);
    }
  }

  return { laeuft, fehler, setFehler, ausfuehren };
}
