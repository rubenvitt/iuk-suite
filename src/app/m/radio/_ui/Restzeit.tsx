"use client";

import { useEffect, useState } from "react";
import s from "./ausleihe.module.css";

/**
 * DIE RESTZEIT DER AUSLEIH-SITZUNG — §4.2 (Spec:3385-3386), Vorbild
 * `src/app/m/lagerbuch/_ui/Restzeit.tsx`.
 *
 * ⛔ DIE EINZIGE CLIENT-INSEL DES RAHMENS. Spec:3380 sagt „alles Server, keine Ausnahme
 * ausser der Restzeit", und die Dateitabelle in Kapitel 1 (Spec:3986) nennt sie „nur die
 * Uhr". Sie ist deshalb genau das: eine Anzeige, die zum Ablaufzeitpunkt ihren Satz
 * wechselt — ⛔ KEIN Riegel. Der Riegel ist `requireAusleihSchreibend` in der Action
 * (`_lib/ausleihZugang.ts`), und ein zweiter „Riegel" im Browser waere einer, den man
 * abschalten kann.
 *
 * ⛔ DIE ERSTE DARSTELLUNG NIMMT DEN SERVERWERT UNVERAENDERT. `abgelaufenInitial` ist der
 * STARTWERT des Zustands, keine zweite Rechnung. Wuerde diese Insel beim Rendern selbst
 * `Date.now()` befragen, entschiede sie an der Grenze anders als der Server und Next
 * meldete eine Hydrations-Fehlanpassung. ⚠️ Kein Tor dieses Planteils findet das:
 * `pnpm build` rechnet nicht, und `mount()` in jsdom hat ueberhaupt keinen
 * Hydrationsschritt (`briefs/A16.md:17-22`). Was `_ui/Restzeit.test.tsx` schliesst, ist die
 * Haelfte, die messbar ist — die RENDER-REINHEIT, gegen das SERVER-HTML gemessen; ⬜ die
 * Hydrations-Gleichheit im Next-Betrieb bleibt dem echten Abruf vor dem Merge.
 *
 * ⛔ DIE UHRZEIT WIRD NICHT HIER GEBAUT. Sie kommt fertig vom Server (`uhrzeit()` aus
 * `_lib/anzeige.ts`, dort steht die Zone an genau einer Stelle). Der Browser einer
 * ausleihenden Person steht nicht zwingend auf Europe/Berlin; eine hier formatierte Zeit
 * waere eine ZWEITE Zonenquelle. Deshalb steht in dieser Datei kein Formatierer.
 *
 * ⚠️ `laeuftAb.getTime() - Date.now()` ist reine ms-Arithmetik und damit zonenunabhaengig —
 * `getTime` steht aus diesem Grund NICHT in der Verbotsliste von `Restzeit.test.tsx`.
 */
export function Restzeit({
  uhrzeit,
  laeuftAb,
  abgelaufenInitial,
}: {
  uhrzeit: string;
  laeuftAb: Date;
  abgelaufenInitial: boolean;
}) {
  const [abgelaufen, setAbgelaufen] = useState(abgelaufenInitial);

  useEffect(() => {
    if (abgelaufen) return; // einmal abgelaufen bleibt abgelaufen — die Zeit laeuft nicht rueckwaerts
    /*
     * EIN Zeitgeber auf den GENAUEN Zeitpunkt statt eines Minutentakts: die Schwelle ist
     * hier ein Zeitpunkt und keine Spanne, und ein Takt traefe sie um bis zu eine Minute
     * zu spaet.
     *
     * ⛔ `Math.max(…, 0)` UND KEIN SYNCHRONES `setAbgelaufen(true)` FUER DEN SCHON
     * ABGELAUFENEN FALL — das ist ein LINT-FEHLER in diesem Projekt, gemessen am
     * 2026-08-23: `react-hooks/set-state-in-effect`, „Calling setState synchronously
     * within an effect can trigger cascading renders". Ein Zeitgeber mit Verzoegerung 0
     * schiebt denselben Wechsel auf den naechsten Durchlauf und haelt die Regel ein.
     * ⚠️ Genau diesen Fall braucht die Insel: `abgelaufenInitial` ist der SERVERWERT, und
     * zwischen Serverlauf und Hydration kann die Grenze ueberschritten worden sein.
     *
     * ⚠️ Die Sitzungsdauer hat eine Vorbelegung von 12 Stunden (`_lib/grenzen.ts`,
     * ⬜ A-L1) = 43.2e6 ms und bleibt damit weit unter der 32-bit-Grenze von
     * `setTimeout` (2.147e9 ms ≈ 24.8 Tage), ab der ein Zeitgeber sofort feuerte.
     */
    const rest = laeuftAb.getTime() - Date.now();
    const zeitgeber = setTimeout(() => setAbgelaufen(true), Math.max(rest, 0));
    return () => clearTimeout(zeitgeber); // sonst laeuft je Navigation ein weiterer weiter
  }, [laeuftAb, abgelaufen]);

  return (
    <span
      className={abgelaufen ? `${s.restzeit} ${s.restzeitAbgelaufen}` : s.restzeit}
      data-rolle="radio-restzeit"
    >
      {abgelaufen ? (
        <span data-rolle="radio-restzeit-abgelaufen">
          Dein Zugang ist abgelaufen — scanne den QR-Code erneut.
        </span>
      ) : (
        <>bis {uhrzeit}</>
      )}
    </span>
  );
}
