/**
 * Verzögertes Speichern des Entwurfs: Jede Änderung plant ein `entwurfSpeichern` nach 500 ms,
 * eine weitere Änderung verschiebt es. Bis ein Speichern ohne neuere Änderung durchkam, gilt der
 * Stand als ungespeichert; das braucht die App für `verfallen`, wenn die Frist mitten in einer
 * Bearbeitung abläuft.
 *
 * Unmittelbar vor dem Speichern fragt der Speicher `darfSpeichern`. So fällt ein Speichern weg,
 * das nach einem Seitenwechsel oder nach Fristende fällig würde, statt verspätet in Rust zu landen.
 */
import { useEffect, useRef } from "react";

import { befehle } from "../befehle";
import type { Entwurf } from "../typen";

export const SPEICHER_VERZOEGERUNG_MS = 500;

interface Optionen {
  /** Gilt der geplante Stand noch? `false` verwirft ihn, es wird nichts gespeichert. */
  darfSpeichern: (bearbeitung: boolean) => boolean;
  beiFehler: (fehler: unknown, bearbeitung: boolean) => void;
}

export interface EntwurfSpeicher {
  /** Merkt `e` zum Speichern vor, `bearbeitung` wie bei `befehle.entwurfSpeichern`. */
  plane: (e: Entwurf, bearbeitung: boolean) => void;
  /** Kein geplantes Speichern mehr, ein laufendes wird abgewartet. */
  stoppe: () => Promise<void>;
  ungespeichert: () => boolean;
  setzeUngespeichert: (ungespeichert: boolean) => void;
}

export function useEntwurfSpeicher(optionen: Optionen): EntwurfSpeicher {
  const optionenRef = useRef(optionen);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const laufendRef = useRef<Promise<void> | null>(null);
  const ungespeichertRef = useRef(false);
  const standRef = useRef(0);

  useEffect(() => {
    optionenRef.current = optionen;
  });

  useEffect(() => {
    const timer = timerRef;
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  function stoppeTimer() {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  async function speichere(e: Entwurf, bearbeitung: boolean, stand: number) {
    timerRef.current = null;
    if (!optionenRef.current.darfSpeichern(bearbeitung)) return;
    const laufend = befehle.entwurfSpeichern(e, bearbeitung).then(
      () => {
        if (standRef.current === stand) ungespeichertRef.current = false;
      },
      (fehler: unknown) => optionenRef.current.beiFehler(fehler, bearbeitung),
    );
    laufendRef.current = laufend;
    await laufend;
    if (laufendRef.current === laufend) laufendRef.current = null;
  }

  return {
    plane(e, bearbeitung) {
      ungespeichertRef.current = true;
      standRef.current += 1;
      const stand = standRef.current;
      stoppeTimer();
      timerRef.current = setTimeout(() => void speichere(e, bearbeitung, stand), SPEICHER_VERZOEGERUNG_MS);
    },
    async stoppe() {
      stoppeTimer();
      const laufend = laufendRef.current;
      if (laufend) await laufend;
    },
    ungespeichert: () => ungespeichertRef.current,
    setzeUngespeichert(ungespeichert) {
      ungespeichertRef.current = ungespeichert;
    },
  };
}
