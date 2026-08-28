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
 * ⛔ DER ABGLEICH MIT `laeuftAb` STEHT DESHALB IM EFFEKT, NIE IM RENDER — der Effekt laeuft
 * nach dem ersten Anstrich, das Server-HTML bleibt unberuehrt.
 *
 * ⛔ SIE NIMMT EIN ERNEUERTES `laeuftAb` AN, UND ZWAR IN BEIDE RICHTUNGEN. Entscheidung E12
 * (`briefs/KOPF.md:675-703`, Zusage §3.10 Nr. 8) baut die Inline-Erneuerung als zweite Insel
 * `_ui/SitzungErneuern.tsx` in DEMSELBEN Formular — „ohne Navigation und ohne die
 * eingetragenen Werte zu verlieren". Der Rahmen bleibt dabei gemountet, und diese Insel
 * bekommt eine neue Grenze als Prop. Ein `useState`, das nur beim Mounten liest, und ein
 * Effekt, der bei `abgelaufen === true` sofort zurueckkehrte, liessen den Ablaufsatz
 * DAUERHAFT stehen — und er fordert zum erneuten Scannen auf, obwohl gerade erneuert wurde.
 * Deshalb haengt der Zustand am Prop und nicht an seiner eigenen Vergangenheit.
 * ⬜ WAS DAS NICHT SAGT: dass A19/A20 der noch gemounteten Flaeche tatsaechlich ein neues
 * `laeuftAb` reichen. Diese Insel KANN es ab jetzt annehmen; dass der Weg dorthin
 * durchgaengig ist, gehoert der Aufgabe, die `SitzungErneuern.tsx` baut (A19).
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
    /*
     * ⛔ DIE GRENZE IST DAS PROP, NICHT DER BISHERIGE ZUSTAND. Deshalb steht `abgelaufen`
     * NICHT in der Abhaengigkeitsliste und es gibt kein `if (abgelaufen) return`: eine
     * Erneuerung (E12) schiebt `laeuftAb` in die Zukunft, waehrend die Insel gemountet
     * bleibt, und der Effekt muss dann ZURUECKschalten koennen.
     *
     * EIN Zeitgeber je Durchlauf, auf den GENAUEN Zeitpunkt statt eines Minutentakts: die
     * Schwelle ist hier ein Zeitpunkt und keine Spanne, und ein Takt traefe sie um bis zu
     * eine Minute zu spaet. Liegt die Grenze schon hinter uns, ist die Verzoegerung 0 und
     * derselbe Zeitgeber schaltet vorwaerts.
     *
     * ⛔ KEIN SYNCHRONES `setAbgelaufen(…)` IM EFFEKT, IN KEINER RICHTUNG — das ist ein
     * LINT-FEHLER in diesem Projekt, gemessen am 2026-08-23:
     * `react-hooks/set-state-in-effect`, „Calling setState synchronously within an effect
     * can trigger cascading renders". Ein Zeitgeber mit Verzoegerung 0 schiebt denselben
     * Wechsel auf den naechsten Durchlauf und haelt die Regel ein.
     * ⚠️ Genau diesen Fall braucht die Insel zweimal: `abgelaufenInitial` ist der
     * SERVERWERT, und zwischen Serverlauf und Hydration kann die Grenze ueberschritten
     * worden sein — nach einer Erneuerung gilt dasselbe in der Gegenrichtung.
     *
     * ⚠️ Die Sitzungsdauer hat eine Vorbelegung von 12 Stunden (`_lib/grenzen.ts`,
     * ⬜ A-L1) = 43.2e6 ms und bleibt damit weit unter der 32-bit-Grenze von
     * `setTimeout` (2.147e9 ms ≈ 24.8 Tage), ab der ein Zeitgeber sofort feuerte.
     */
    const rest = laeuftAb.getTime() - Date.now();
    if (rest <= 0) {
      const vorwaerts = setTimeout(() => setAbgelaufen(true), 0);
      return () => clearTimeout(vorwaerts);
    }
    /*
     * ⚠️ WAS DIESE ZEILE NEBENBEI TUT: `zurueck` laeuft bei JEDEM Durchlauf mit
     * `rest > 0`, also auch beim ersten Mounten, und ueberstimmt damit ein
     * `abgelaufenInitial={true}`, sobald der Client `laeuftAb` in der Zukunft sieht.
     * Bei richtig gehenden Uhren ist das nicht erreichbar: der Server rechnet BEIDE Werte
     * aus DERSELBEN Uhr (`AusleihRahmen.tsx:147`), `true` heisst dort `laeuftAb <= jetzt`,
     * und ein spaeterer Client faellt in den `vorwaerts`-Zweig oben (`:85-88`). Erreichbar
     * ist es allein bei NACHGEHENDER Client-Uhr; dann verschwindet der Ablaufsatz
     * voruebergehend und kehrt nach `rest` zurueck. Rein anzeigend und selbstheilend — der
     * Riegel ist `requireAusleihSchreibend` in der Action (`_lib/ausleihZugang.ts:262`),
     * nicht diese Insel.
     */
    const zurueck = setTimeout(() => setAbgelaufen(false), 0);
    const zeitgeber = setTimeout(() => setAbgelaufen(true), rest);
    // sonst laeuft je Navigation und je Erneuerung ein weiterer Zeitgeber weiter
    return () => {
      clearTimeout(zurueck);
      clearTimeout(zeitgeber);
    };
  }, [laeuftAb]);

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
