"use client";

import { useEffect, useState } from "react";
import { entwurfMeldung, type EntwurfMeldung } from "./meldung";
import type { Entwurf } from "./useEntwurf";

/** `entwurfMeldung` mit Sekundentakt, solange ein Versuch wartet. */
export function useEntwurfMeldung(e: Pick<Entwurf<unknown>, "zustand" | "naechsterVersuch" | "wiederhergestellt">): EntwurfMeldung | null {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    if (e.zustand !== "wartet") return;
    const tick = () => setJetzt(Date.now());
    const sofort = setTimeout(tick, 0);
    const t = setInterval(tick, 500);
    return () => {
      clearTimeout(sofort);
      clearInterval(t);
    };
  }, [e.zustand, e.naechsterVersuch]);
  // `jetzt` kann beim Umschalten auf „wartet" einen Takt alt sein; `entwurfMeldung`
  // kappt die Sekunden deshalb auf die längste Wartezeit.
  return entwurfMeldung(e, jetzt);
}
