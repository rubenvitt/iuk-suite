/**
 * Sperre der Verwaltungssitzung (Spec §4.4): nach 10 min ohne Eingabe und mit Ablauf des Tokens.
 * `App.tsx` ruft den Hook app-weit, solange Rust eine Sitzung hält — nicht nur in der
 * Verwaltung, denn die Sitzung überdauert auch einen Ausflug in die Erfassung.
 *
 * Zwei getrennte Effekte, damit kein Status-Poll die Uhr zurücksetzt:
 * - Die Ruhe-Uhr hängt nur an `aktiv`. Eingaben schreiben ihren Zeitpunkt in eine Ref; der Timer
 *   prüft beim Auslösen, wie lange die letzte her ist, und stellt sich sonst auf den Rest.
 * - Der Ablauf hängt an `ablaufMs` und `jetztVersatz` (Uhr von Rust minus Uhr hier). Ein Poll
 *   ändert den Versatz um wenige Millisekunden; das verschiebt nur den Ablauf-Timer, nie die Ruhe.
 * `sperre` läuft über `useEffectEvent`: Eine neue Rückruf-Identität je Render stellt keinen Timer neu.
 */
import { useEffect, useEffectEvent, useRef } from "react";

export const SPERRE_NACH_MS = 10 * 60_000;

const LAENGSTER_TIMER_MS = 2 ** 31 - 1;

const EINGABEN =["keydown", "pointerdown", "pointermove", "wheel"] as const;

export function useSperre(o: { aktiv: boolean; ablaufMs: number | null; jetztVersatz: number; sperre: () => void }): void {
  const { aktiv, ablaufMs, jetztVersatz } = o;
  const letzteEingabeRef = useRef(0);
  const sperre = useEffectEvent(() => o.sperre());

  useEffect(() => {
    if (!aktiv) return;
    letzteEingabeRef.current = Date.now();
    const merke = () => {
      letzteEingabeRef.current = Date.now();
    };
    let timer: ReturnType<typeof setTimeout>;
    const stelle = (ms: number) => {
      timer = setTimeout(() => {
        const rest = letzteEingabeRef.current + SPERRE_NACH_MS - Date.now();
        if (rest > 0) {
          stelle(rest);
          return;
        }
        sperre();
        // Bleibt die Sitzung trotzdem aktiv (etwa weil `abmelden` scheiterte), sperrt die
        // nächste Ruhephase erneut, statt die Uhr stillzulegen.
        letzteEingabeRef.current = Date.now();
        stelle(SPERRE_NACH_MS);
      }, ms);
    };
    stelle(SPERRE_NACH_MS);
    for (const e of EINGABEN) window.addEventListener(e, merke, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of EINGABEN) window.removeEventListener(e, merke);
    };
  }, [aktiv]);

  useEffect(() => {
    if (!aktiv || ablaufMs === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const stelle = () => {
      const rest = ablaufMs - (Date.now() + jetztVersatz);
      // `setTimeout` löst über 2^31−1 ms sofort aus; ein so fernes Ende wird in Etappen erreicht.
      timer = setTimeout(() => (rest > LAENGSTER_TIMER_MS ? stelle() : sperre()), Math.min(Math.max(0, rest), LAENGSTER_TIMER_MS));
    };
    stelle();
    return () => clearTimeout(timer);
  }, [aktiv, ablaufMs, jetztVersatz]);
}
