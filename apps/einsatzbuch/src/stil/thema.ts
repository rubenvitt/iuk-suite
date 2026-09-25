/**
 * Hell/Dunkel der App. Wie in der Suite (`docs/design/README.md`, „Hell- und Dunkelmodus“) trägt
 * `<html data-theme>` immer den aufgelösten Wert `light` oder `dark`, nie `auto`: `app.css`
 * selektiert auf `:root[data-theme="dark"]`, und ein gestempeltes `auto` kippte still alles auf
 * hell. Die Wahl `auto` folgt `prefers-color-scheme` samt Listener, damit ein Wechsel des
 * Betriebssystems während der Sitzung ankommt.
 *
 * Anders als die Suite gibt es hier keinen Server, der den Wert vorab kennen müsste, deshalb
 * `localStorage` statt Cookie. Jeder Zugriff ist abgefangen: Fehlt der Speicher, gilt `auto`.
 */
import { useEffect, useState } from "react";

export type ThemaWahl = "auto" | "light" | "dark";

const SCHLUESSEL = "einsatzbuch-thema";
const ABFRAGE = "(prefers-color-scheme: dark)";

/** Reihenfolge des Umschalters wie in der Vorlage (`themaWechseln`): auto → hell → dunkel → auto. */
const NAECHSTE: Record<ThemaWahl, ThemaWahl> = { auto: "light", light: "dark", dark: "auto" };

export function liesThemaWahl(): ThemaWahl {
  try {
    const w = localStorage.getItem(SCHLUESSEL);
    if (w === "auto" || w === "light" || w === "dark") return w;
  } catch {
    // Kein Speicher (gesperrt oder nicht vorhanden): Vorgabe.
  }
  return "auto";
}

function speichereThemaWahl(w: ThemaWahl): void {
  try {
    localStorage.setItem(SCHLUESSEL, w);
  } catch {
    // Die Wahl gilt dann nur bis zum Neustart.
  }
}

function systemAbfrage(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === "function" ? window.matchMedia(ABFRAGE) : null;
  } catch {
    return null;
  }
}

/** Stempelt den aufgelösten Modus auf `<html>`, dazu `color-scheme` für native Felder und Bildlaufleisten. */
export function wendeThemaAn(wahl: ThemaWahl, systemDunkel: boolean): void {
  const modus = wahl === "auto" ? (systemDunkel ? "dark" : "light") : wahl;
  const html = document.documentElement;
  html.dataset.theme = modus;
  html.style.colorScheme = modus;
}

/** Einmal vor dem ersten Rendern, damit die Oberfläche nicht erst hell aufblitzt. */
export function wendeGespeichertesThemaAn(): void {
  wendeThemaAn(liesThemaWahl(), systemAbfrage()?.matches ?? false);
}

export function useThema(): { wahl: ThemaWahl; wechsle: () => void } {
  const [wahl, setWahl] = useState<ThemaWahl>(liesThemaWahl);

  useEffect(() => {
    const abfrage = systemAbfrage();
    const anwenden = () => wendeThemaAn(wahl, abfrage?.matches ?? false);
    anwenden();
    if (wahl !== "auto" || !abfrage) return;
    abfrage.addEventListener("change", anwenden);
    return () => abfrage.removeEventListener("change", anwenden);
  }, [wahl]);

  const wechsle = () => {
    const neu = NAECHSTE[wahl];
    speichereThemaWahl(neu);
    setWahl(neu);
  };
  return { wahl, wechsle };
}
