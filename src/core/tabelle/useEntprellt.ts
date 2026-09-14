"use client";

import { useEffect, useState } from "react";

/**
 * Der verzögerte Nachlauf eines Wertes — für Freitextfelder über großen Listen.
 *
 * WAS ER LÖST: ein Suchfeld ohne Entprellung filtert, sortiert und rendert die
 * GANZE Liste bei jedem Tastendruck. Im Lagerbuch hing an einem solchen Feld
 * eine Tabelle mit rund acht antd-Komponenten je Zeile — das Tippen wurde
 * langsamer, je mehr Artikel es gab, und zwar in der Tabelle, nicht im Feld.
 *
 * ⚠️ DAS FELD BLEIBT UNENTPRELLT. Entprellt wird die ABLEITUNG, nie der Wert im
 * `<input>` selbst: ein Eingabefeld, dessen Inhalt 200 ms hinterherhinkt,
 * verschluckt Zeichen und setzt den Cursor um. Der Aufrufer hält also weiter
 * seinen eigenen Zustand für das Feld und schickt nur die FILTERUNG durch
 * diesen Haken.
 *
 * ⚠️ DER ERSTE WERT KOMMT SOFORT. Ein `useState(wert)` als Startwert heißt: beim
 * ersten Rendern gibt es keine Verzögerung. Sonst zeigte eine Tabelle mit
 * vorbelegtem Suchbegriff (aus der URL) für einen Moment ungefiltert alles —
 * ein Aufblitzen, das wie ein Ladefehler aussieht.
 */
export function useEntprellt<T>(wert: T, verzoegerungMs = 200): T {
  const [nachlauf, setNachlauf] = useState(wert);

  useEffect(() => {
    // ⚠️ KEIN `setNachlauf` IM EFFEKTRUMPF fuer den Sofortfall. Ein synchrones
    // setState im Effekt loest eine Kaskade von Renderdurchlaeufen aus, und der
    // React-Compiler lehnt es ab (`react-hooks/set-state-in-effect`). Bei
    // Verzoegerung 0 gibt es ohnehin nichts zu warten — dann wird der Wert
    // schlicht DURCHGEREICHT, siehe unten.
    if (verzoegerungMs <= 0) return;
    const uhr = setTimeout(() => setNachlauf(wert), verzoegerungMs);
    return () => clearTimeout(uhr);
  }, [wert, verzoegerungMs]);

  return verzoegerungMs <= 0 ? wert : nachlauf;
}
