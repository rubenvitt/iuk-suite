"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * EIN SUCHPARAMETER ALS ZUSTAND — gelesen aus der Adresse, geschrieben ohne
 * Server-Rundlauf (IDA-232: Reiter und Statusfilter des Einheitenblatts).
 *
 * ⚠️ GESCHRIEBEN WIRD ÜBER `window.history`, NICHT ÜBER `router.replace`. Das
 * Blatt ist `force-dynamic`; ein Routerwechsel holte für jeden Reiterklick die
 * ganze Seite samt 200 Soll-Zeilen neu vom Server. `pushState`/`replaceState`
 * sind in Next mit `useSearchParams` verdrahtet
 * (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`,
 * „Native History API") — Zurück und Vor folgen trotzdem.
 *
 * ⚠️ DER ZUSTAND FOLGT DER ADRESSE, WENN SIE SICH VON AUSSEN ÄNDERT. Ein Klick
 * auf eine Kachel ist eine Navigation auf DIESELBE Seite mit anderem
 * `?status=`; die Insel bleibt dabei eingehängt, und ein nur einmal gelesener
 * Startwert bliebe stehen. Der Abgleich läuft im Rendern (Reacts Muster
 * „Zustand bei geänderter Prop anpassen"), nicht in einem Effekt — sonst stünde
 * einen Frame lang der alte Reiter da.
 *
 * Ohne Router (Vitest) liefert `useSearchParams` `null`; dann liest der Haken
 * die Adresse des Fensters selbst und schreibt sie wie sonst fort.
 */
export function useAdressParameter(
  name: string,
  verlauf: "neuer-eintrag" | "ersetzen",
): [string | null, (wert: string | null) => void] {
  const parameter = useSearchParams() as URLSearchParams | null;
  const ausAdresse = parameter
    ? parameter.get(name)
    : typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get(name);
  const [wert, setWert] = useState<string | null>(ausAdresse);
  const [gesehen, setGesehen] = useState<string | null>(ausAdresse);
  if (ausAdresse !== gesehen) {
    setGesehen(ausAdresse);
    setWert(ausAdresse);
  }

  const setzen = useCallback((neu: string | null) => {
    setWert(neu);
    const suche = new URLSearchParams(window.location.search);
    if (neu === null) suche.delete(name);
    else suche.set(name, neu);
    const abfrage = suche.toString();
    const ziel = `${window.location.pathname}${abfrage ? `?${abfrage}` : ""}${window.location.hash}`;
    if (verlauf === "neuer-eintrag") window.history.pushState(null, "", ziel);
    else window.history.replaceState(null, "", ziel);
  }, [name, verlauf]);

  return [wert, setzen];
}
