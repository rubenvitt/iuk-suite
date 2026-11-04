"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { FormState } from "../_lib/formState";
import type { Entwurf } from "@/core/entwurf/useEntwurf";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { useFeldEntwurf } from "@/core/entwurf/useFeldEntwurf";

/*
 * ENTWURF FUER DIE UNGESTEUERTEN FORMULARE DIESES MODULS — IDA-358.
 *
 * Die Textfelder, Radios und Kaestchen sind native `<input name>` und gehen ueber
 * `useFeldEntwurf`. Die Auswahlfelder aus `Felder.tsx` (Datum, Uhrzeit, Liste) tragen ihren Wert
 * aber in einem VERSTECKTEN Feld, das `useFeldEntwurf` bewusst auslaesst (dort traegt sonst der
 * Server einen Wert). Sie melden sich darum ueber `WahlEntwurfKontext` und liegen unter einem
 * zweiten Schluessel (`…:wahl`). `start` aendert sich nur beim Wiederherstellen und Verwerfen —
 * die Felder montieren daran neu; eine laufende Wahl (`setze`) laesst sie in Ruhe, sonst schloesse
 * jeder Klick das Panel.
 */
export type WahlEntwurf = {
  start: Readonly<Record<string, string>>;
  setze: (name: string, wert: string) => void;
};

export const WahlEntwurfKontext = createContext<WahlEntwurf | null>(null);

type Wahl = Record<string, string>;

export function useFormularEntwurf(
  form: RefObject<HTMLFormElement | null>,
  schluessel: string,
): Omit<Entwurf<never>, "sende"> & { wahl: WahlEntwurf; abgesendet: () => void } {
  const feld = useFeldEntwurf(form, schluessel);
  const [werte, setWerte] = useState<Wahl | null>(null);
  const [start, setStart] = useState<Wahl>({});
  const wahlEntwurf = useEntwurf<Wahl | null>({
    schluessel: `${schluessel}:wahl`,
    stand: werte,
    wiederherstellen: (w) => {
      setWerte(w);
      setStart(w ?? {});
    },
  });
  const setze = useCallback((name: string, wert: string) => {
    setWerte((alt) => ({ ...alt, [name]: wert }));
  }, []);
  const wahl = useMemo(() => ({ start, setze }), [start, setze]);
  const { verwerfen: feldVerwerfen } = feld;
  const { verwerfen: wahlVerwerfen } = wahlEntwurf;
  const verwerfen = useCallback(() => {
    feldVerwerfen();
    wahlVerwerfen();
  }, [feldVerwerfen, wahlVerwerfen]);
  // Nach dem Absenden traegt `state.values` die Wahl zurueck; ein wiederhergestellter Start
  // verdeckte sie sonst.
  const abgesendet = useCallback(() => setStart({}), []);
  return {
    abgesendet,
    wiederhergestellt: feld.wiederhergestellt || wahlEntwurf.wiederhergestellt,
    zustand: "ruhe",
    naechsterVersuch: null,
    jetztSenden: feld.jetztSenden,
    verwerfen,
    wahl,
  };
}

/**
 * Ein neuer `ok`-Zustand der Action = angenommen: Entwurf weg. Der Startzustand (`FORM_START`,
 * auch `ok`) zaehlt nicht.
 */
export function useVerwerfenBeiErfolg(state: FormState, verwerfen: () => void): void {
  const ersterStand = useRef(state);
  useEffect(() => {
    if (state !== ersterStand.current && state.ok) verwerfen();
  }, [state, verwerfen]);
}
