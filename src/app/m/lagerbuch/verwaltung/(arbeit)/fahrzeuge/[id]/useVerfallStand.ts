"use client";

import { useCallback, useState, useTransition } from "react";
import type { ActionErgebnis } from "../../../../_lib/actionErgebnis";
import {
  LEERER_STAND,
  standNachAntwort,
  standVorweg,
  verfallVon,
  type VerfallStand,
  type VerfallWert,
  type VerfallZeile,
} from "../../../../_lib/verfallStand";

/**
 * DER TRICHTER (DRK-345). Die Entscheidung, die er durchsetzt, steht in
 * `_lib/verfallStand.ts`; hier steht, WIE.
 *
 * ⚠️ DER SETZER VERLAESST DIESE DATEI NICHT. `useVerfallStand` gibt einen Leser
 * und EINEN Schreiber heraus, sonst nichts — kein Aufrufer kann den Stand also
 * mit einem Wert belegen, der nicht aus einer Antwort stammt. Das ist der
 * eigentliche Umbau: die drei Fehler aus dem Review von DRK-303 waren allesamt
 * „ein zweiter Ort setzt den Spiegel, und zwar falsch". Ein Kommentar haette
 * den vierten nicht verhindert, ein fehlender Setzer schon.
 *
 * ⚠️ EINE EINZIGE `useTransition` FUER BEIDE WEGE — und das ist kein Nebeneffekt,
 * sondern die Verriegelung: `laeuft` ist wahr, solange IRGENDEIN Schreibweg auf
 * `lagerort_verfall` unterwegs ist. Der Monatswaehler war schon gesperrt,
 * solange er selbst schrieb; jetzt ist er es auch, waehrend der Dialog
 * schreibt, und umgekehrt. Die beiden schliessen einander damit wirklich aus
 * statt nur in eine Richtung.
 */
export type VerfallStandHaken = {
  /** Der Monat, der fuer diese Zeile gilt — Spiegel vor Prop. */
  verfallVon: (zeile: VerfallZeile) => string | null;
  /**
   * Fuehrt einen Schreibweg aus und uebernimmt den GESCHRIEBENEN Wert.
   *
   * `vermutung` ist die Vorwegnahme bis zur Antwort; `null` ist ein gueltiger
   * Wert („Angabe entfaellt"), `undefined` heisst „nichts vorwegnehmen" — der
   * Fall der Aussonderung, die ihr Ergebnis nicht kennt.
   *
   * Gibt die Antwort unveraendert zurueck, damit die Aufrufstelle ihren
   * Fehlersatz zeigen kann. Ein Wurf der Aktion kommt als Wurf heraus.
   */
  schreibe: (
    artikelId: string,
    vermutung: string | null | undefined,
    aktion: () => Promise<ActionErgebnis<VerfallWert>>,
  ) => Promise<ActionErgebnis<VerfallWert>>;
  /** Wahr, solange ein Schreibweg laeuft — die gemeinsame Sperre. */
  laeuft: boolean;
};

export function useVerfallStand(): VerfallStandHaken {
  const [stand, setStand] = useState<VerfallStand>(LEERER_STAND);
  const [laeuft, start] = useTransition();

  const schreibe = useCallback((
    artikelId: string,
    vermutung: string | null | undefined,
    aktion: () => Promise<ActionErgebnis<VerfallWert>>,
  ) => {
    if (vermutung !== undefined) {
      setStand((vorher) => standVorweg(vorher, artikelId, vermutung));
    }
    /*
     * ⚠️ DAS VERSPRECHEN UM DIE TRANSITION HERUM, NICHT UMGEKEHRT.
     * `startTransition` gibt nichts zurueck — ohne diese Huelle koennte der
     * Trichter die Antwort nicht herausreichen, und die Aufrufstelle muesste
     * die Aktion selbst abwarten. Genau das soll sie nicht koennen: wer
     * abwartet, kann auch spiegeln.
     */
    return new Promise<ActionErgebnis<VerfallWert>>((aufloesen, ablehnen) => {
      start(async () => {
        try {
          const antwort = await aktion();
          setStand((vorher) => standNachAntwort(vorher, artikelId, antwort));
          aufloesen(antwort);
        } catch (grund) {
          // Kein Stand-Schreibvorgang: geworfen heisst, wir wissen nichts.
          ablehnen(grund);
        }
      });
    });
  }, []);

  return {
    verfallVon: useCallback((zeile: VerfallZeile) => verfallVon(stand, zeile), [stand]),
    schreibe,
    laeuft,
  };
}
