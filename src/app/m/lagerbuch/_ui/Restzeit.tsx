"use client";

import { useEffect, useState } from "react";
import s from "./helfer.module.css";

/**
 * WARUM DAS EINE CLIENT-INSEL IST und nicht drei Zeilen im HelferRahmen:
 * die Schwelle aus §3.4.3 Punkt 1 („ab 30 Minuten") ist eine Aussage ueber die
 * VERGEHENDE Zeit. Ein Fahrzeug-Check ist zehn bis zwanzig Minuten ohne
 * Navigation (§7.4.4); serverseitig entschieden faellt der Hinweis genau bei
 * dem Menschen aus, fuer den er geschrieben wurde — bei dem, der mit 35 Minuten
 * Restlaufzeit anfaengt zu zaehlen.
 *
 * DIE UHRZEIT WIRD NICHT HIER GEBAUT. Sie kommt fertig vom Server (`uhrzeit()`
 * aus `_lib/zeit.ts`, §4.5): der Browser einer Helferin steht nicht zwingend
 * auf Europe/Berlin, und eine im Client formatierte Zeit waere eine ZWEITE
 * Zonenquelle neben der einen, die §4.5 festlegt. Deshalb steht in dieser Datei
 * kein `toLocaleTimeString`, kein `Intl` — und `_ui/Restzeit.test.tsx` haelt das
 * fest, weil der Quelltext-Scan aus §3.8.2 es nicht abdeckt.
 *
 * `warntInitial` kommt ebenfalls vom Server und ist der STARTWERT des Zustands
 * — NICHT eine zweite Rechnung. Wuerde die Insel beim ersten Rendern selbst
 * `Date.now()` befragen, koennte sie an der Schwelle anders entscheiden als der
 * Server und Next meldete einen Hydrations-Unterschied. Ab dem ersten
 * `useEffect` rechnet nur noch der Client, im Minutentakt.
 *
 * ⚠️ `laeuftAb.getTime() - Date.now()` ist REINE ms-ARITHMETIK und gehoert
 * damit ausdruecklich NICHT nach `_lib/zeit.ts`: §5.16 fuehrt genau diese
 * Klasse als zonenunabhaengig, und die grep-bare Regel aus §4.5 verbietet
 * `new Date(jahr, monat, …)` sowie getHours/getMinutes/getFullYear/getMonth/
 * getDate — `getTime` steht dort aus gutem Grund nicht.
 */

/** 30 Minuten in Millisekunden — §3.4.3, Punkt 1. */
const WARNSCHWELLE_MS = 30 * 60_000;

export function Restzeit({
  uhrzeit,
  laeuftAb,
  warntInitial,
}: {
  uhrzeit: string;
  laeuftAb: Date;
  warntInitial: boolean;
}) {
  const [warnt, setWarnt] = useState(warntInitial);

  useEffect(() => {
    if (warnt) return; // einmal gewarnt bleibt gewarnt — die Zeit laeuft nicht rueckwaerts
    const pruefen = () => {
      if (laeuftAb.getTime() - Date.now() <= WARNSCHWELLE_MS) setWarnt(true);
    };
    pruefen(); // die erste Pruefung sofort, nicht erst in 60 s
    const takt = setInterval(pruefen, 60_000); // Minutentakt: die Schwelle ist in Minuten benannt
    return () => clearInterval(takt); // sonst laeuft der Takt pro Navigation ein weiteres Mal
  }, [laeuftAb, warnt]);

  return (
    <span className={warnt ? `${s.restzeit} ${s.restzeitWarnt}` : s.restzeit} data-rolle="restzeit">
      {warnt ? (
        <span data-rolle="restzeit-warnung">
          Dein Zugang läuft um {uhrzeit} ab — Kärtchen bereithalten.
        </span>
      ) : (
        <>bis {uhrzeit}</>
      )}
    </span>
  );
}
