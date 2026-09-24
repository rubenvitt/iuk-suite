/**
 * Die Frist-Uhr der Oberfläche. Sie zählt nur lokal herunter, entschieden wird mit der Uhr in
 * Rust: Solange `aktiv`, läuft ein Takt alle 250 ms für Restzeit und Balken, und alle 5 s kommt
 * `frage` (der Status). Steht die Restzeit auf 0, ruft die Uhr sofort `pruefe` (`frist_pruefen`)
 * und danach jede Sekunde wieder, bis die App nicht mehr aktiv ist.
 *
 * Hängt ein Aufruf, startet kein zweiter daneben: `frage` und `pruefe` haben je eine Sperre.
 */
import { useEffect, useRef, useState } from "react";

import { restSekunden } from "../logik/ablauf";

export const TAKT_MS = 250;
export const ABFRAGE_MS = 5000;
export const NACHFRAGE_MS = 1000;

/** Ende der Frist in Rust-Zeit, dazu die Abweichung Rust − lokal und wann sie gemessen wurde (lokal). */
export interface FristStand {
  fristBisMs: number;
  versatz: number;
  gemessenAm: number;
}

interface Optionen {
  stand: FristStand | null;
  aktiv: boolean;
  frage: () => Promise<void>;
  pruefe: () => Promise<void>;
}

/** Liefert die Restzeit in ganzen Sekunden (0 ohne Stand). */
export function useFristUhr({ stand, aktiv, frage, pruefe }: Optionen): number {
  const [takt, setTakt] = useState(0);
  const rueckrufe = useRef({ frage, pruefe });
  const frageLaeuft = useRef(false);
  const pruefungLaeuft = useRef(false);

  useEffect(() => {
    rueckrufe.current = { frage, pruefe };
  });

  const rest = stand ? restSekunden(stand.fristBisMs, Math.max(takt, stand.gemessenAm) + stand.versatz) : 0;
  const abgelaufen = aktiv && stand !== null && rest === 0;

  useEffect(() => {
    if (!aktiv) return;
    const taktgeber = setInterval(() => setTakt(Date.now()), TAKT_MS);
    const abfrage = setInterval(() => {
      if (frageLaeuft.current) return;
      frageLaeuft.current = true;
      void rueckrufe.current.frage().finally(() => {
        frageLaeuft.current = false;
      });
    }, ABFRAGE_MS);
    return () => {
      clearInterval(taktgeber);
      clearInterval(abfrage);
    };
  }, [aktiv]);

  useEffect(() => {
    if (!abgelaufen) return;
    const nachfragen = () => {
      if (pruefungLaeuft.current) return;
      pruefungLaeuft.current = true;
      void rueckrufe.current.pruefe().finally(() => {
        pruefungLaeuft.current = false;
      });
    };
    nachfragen();
    const wieder = setInterval(nachfragen, NACHFRAGE_MS);
    return () => clearInterval(wieder);
  }, [abgelaufen]);

  return rest;
}
