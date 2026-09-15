"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Die Höhe, die einer Tabelle bis zum unteren Fensterrand bleibt — für
 * `virtuell`, das eine ZAHL verlangt.
 *
 * ⚠️ EINE EINMAL GEMESSENE ZAHL WÄRE BEIM ÖFFNEN RICHTIG UND DANACH STILL
 * FALSCH. Genau daran scheitert die naive Fassung (`useEffect` ohne
 * Beobachter): dreht jemand das Tablet oder zieht das Fenster kleiner, steht
 * die Tabelle weiter auf der alten Höhe — sie ragt unter den Rand oder lässt
 * die Hälfte des Schirms leer, und niemand meldet das als Fehler. Dieselbe
 * Klasse wie Falle 13, wo eine feste Schubladenbreite auf einem niedrigen
 * Schirm nicht zu schmal für das Fenster ist, sondern für den Inhalt.
 *
 * Deshalb hängt hier ein `resize`-Beobachter dran, und die Messung läuft bei
 * JEDER Größenänderung neu.
 *
 * ⚠️ DER STARTWERT IST EINE ZAHL, KEIN `false`. Käme vor der ersten Messung
 * `false` zurück, rendert die Tabelle einen Atemzug lang gewöhnlich und springt
 * dann in den virtuellen Modus — dabei wechselt rc-table auf
 * `table-layout: fixed` und alle Spaltenbreiten verschieben sich sichtbar. Ein
 * plausibler Startwert kostet dagegen nur eine leicht falsche erste Höhe, die
 * die erste Messung sofort korrigiert.
 */
export function useVerfuegbareHoehe(
  ref: RefObject<HTMLElement | null>,
  opts: { mindestens?: number; rand?: number; startwert?: number } = {},
): number {
  const { mindestens = 320, rand = 24, startwert = 560 } = opts;
  const [hoehe, setHoehe] = useState(startwert);

  useEffect(() => {
    const messen = () => {
      const knoten = ref.current;
      if (!knoten) return;
      const oben = knoten.getBoundingClientRect().top;
      const platz = window.innerHeight - oben - rand;
      setHoehe(Math.max(mindestens, Math.round(platz)));
    };

    messen();
    window.addEventListener("resize", messen);
    // Die Tabelle rutscht auch ohne Größenänderung des Fensters: eine
    // eingeblendete Sammelleiste oder ein Hinweis über ihr verschiebt ihren
    // oberen Rand. `ResizeObserver` am Knoten selbst fängt das mit.
    const beobachter = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(messen)
      : null;
    if (beobachter && ref.current?.parentElement) {
      beobachter.observe(ref.current.parentElement);
    }
    return () => {
      window.removeEventListener("resize", messen);
      beobachter?.disconnect();
    };
  }, [ref, mindestens, rand]);

  return hoehe;
}
