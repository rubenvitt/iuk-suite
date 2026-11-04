"use client";

import { useEffect, useRef } from "react";

import type { Figur } from "./figuren";
import { LADER } from "./laden";
import { untergrund } from "./untergrund";
import s from "./ruhe.module.css";

/**
 * DIE BEWEGTE FIGUR — die einzige Client-Insel eines Ruhezustands.
 *
 * Bekommt nur einen Namen (Zeichenkette) über die RSC-Grenze (Falle 6). Die Fläche steht schon im
 * Server-HTML in ihrer endgültigen Größe (`aspect-ratio` im CSS-Modul), die Zeichnung kommt
 * nachgeladen hinein: nichts verschiebt sich.
 *
 * Die Figur ist Schmuck, die Zeile darunter sagt dasselbe — deshalb `aria-hidden`.
 *
 * DIE PLATTEN DER FIGUR SIND GEFÜLLT (sie verdecken, was dahinter liegt), und zwar in der Farbe des
 * Untergrunds. Der ist mal der Seitengrund, mal eine Karte, mal eine Spalte mit eigener Fläche —
 * deshalb liest die Insel ihn ab (`untergrund`), statt dass jeder Aufrufer ihn nennen muss, und
 * liest neu, wenn `<html data-theme>` umschaltet.
 *
 * REDUZIERTE BEWEGUNG: das Paket lässt eine spielende Figur dann ruhen, antwortet aber weiter auf den
 * Zeiger. Die Suite will sie STILL — `pointer-events: none` im CSS-Modul nimmt ihr den Zeiger, und
 * hier wird gar nicht erst gespielt.
 */
export function FigurInsel({
  figur,
  groesse,
  className,
}: {
  figur: Figur;
  groesse: "gross" | "klein";
  /** Nur für eine eigene Breite; die Höhe folgt dem Seitenverhältnis 5:4. */
  className?: string;
}) {
  const ziel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ziel.current;
    if (!el) return;
    let weg = false;
    let abbau: (() => void) | undefined;

    const faerbe = () => {
      const farbe = untergrund(el.parentElement);
      if (farbe) el.style.setProperty("--ruhe-flaeche", farbe);
      else el.style.removeProperty("--ruhe-flaeche");
    };
    faerbe();
    // Nach dem Umschalten stehen die neuen Token erst im nächsten Bild fest.
    const beobachter = new MutationObserver(() => requestAnimationFrame(faerbe));
    beobachter.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const ruhig = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    // Das Paket braucht `IntersectionObserver` (nur sichtbare Figuren rechnen); ohne ihn (jsdom,
    // sehr alte Browser) bleibt die reservierte Fläche leer — nie ein Fehler im Ruhezustand.
    const kann = typeof IntersectionObserver !== "undefined";
    if (kann) LADER[figur]().then(
      ({ default: montiere }) => {
        if (weg) return;
        try {
          const f = montiere(el, { intensity: 0.55, play: !ruhig });
          abbau = () => f.destroy();
        } catch {
          // wie oben: die Fläche bleibt leer, der Titel trägt die Auskunft
        }
      },
      () => undefined, // ohne Figur bleibt die leere Fläche — der Titel trägt die Auskunft
    );
    return () => {
      weg = true;
      beobachter.disconnect();
      abbau?.();
    };
  }, [figur]);

  return (
    <div
      ref={ziel}
      aria-hidden="true"
      data-figur={figur}
      className={[s.figur, groesse === "klein" && s.klein, className].filter(Boolean).join(" ")}
    />
  );
}
