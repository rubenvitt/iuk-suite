"use client";

import { useEffect, useRef, useState } from "react";

/** 2 s: lang genug zum Lesen, kurz genug, dass der Knopf nicht „Kopiert" heißt. */
const RUECKMELDUNG_MS = 2000;

/**
 * „Link kopieren" an EINER Stelle (IDA-388): Detailseite, Zeilenaktion der
 * Freigabenliste und die Ausgabe nach dem Anlegen kopieren dieselbe Adresse auf
 * dieselbe Weise. Drei Abschriften der Zeitgeberlogik liefen sonst auseinander.
 *
 * Ohne Berechtigung (oder ohne sicheren Kontext) gibt es keine Bestätigung und
 * keinen Alarm: die Adresse steht an jeder dieser Stellen auch als Text da oder
 * ist über die Detailseite erreichbar.
 */
export function useKopieren(): { kopiert: boolean; kopieren: (text: string) => Promise<void> } {
  const [kopiert, setKopiert] = useState(false);
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ein `setState` nach dem Ausbauen ist eine Warnung ohne Nutzen, und der
  // Zeitgeber hielte sonst eine Referenz auf die Komponente.
  useEffect(
    () => () => {
      if (uhr.current) clearTimeout(uhr.current);
    },
    [],
  );

  const kopieren = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setKopiert(true);
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = setTimeout(() => setKopiert(false), RUECKMELDUNG_MS);
  };

  return { kopiert, kopieren };
}
