import type { CSSProperties } from "react";

/**
 * DAS IDA-ZEICHEN — ein „i" als Funkmast: der Stamm ist der Mast, der Punkt
 * sendet. Nachgebaut aus der Vorlage (1254 px Kantenlänge), die Koordinaten
 * sind deren Pixel, deshalb die krumme `viewBox`.
 *
 * Kein `"use client"` und keine Hooks: das Zeichen soll auch in Server
 * Components stehen können. Die Farben kommen über `--ida-stamm` und
 * `--ida-signal` vom Aufrufer (hell: Tinte und Suite-Rot; dunkel: heller Stamm),
 * mit den hellen Werten als Rückfall. `style` statt `fill`-Attribut, weil
 * `var()` in Präsentationsattributen nicht verlässlich greift.
 */
const STAMM: CSSProperties = { fill: "var(--ida-stamm, #1a1d20)" };
const SIGNAL: CSSProperties = { fill: "var(--ida-signal, #c8000f)" };
const WELLE: CSSProperties = {
  fill: "none",
  stroke: "var(--ida-signal, #c8000f)",
  strokeWidth: 46,
  strokeLinecap: "round",
};

export function IdaLogo({ className, titel }: { className?: string; titel?: string }) {
  return (
    <svg
      className={className}
      viewBox="543 217 323 820"
      role={titel ? "img" : undefined}
      aria-label={titel}
      aria-hidden={titel ? undefined : true}
    >
      <rect x={553} y={552} width={130} height={480} rx={40} style={STAMM} />
      <circle cx={618} cy={461} r={68} style={SIGNAL} />
      {/* Beide Wellen um den Punkt, von −78° bis 7° bzw. 15°. */}
      <path d="M645.9 329.9 A134 134 0 0 1 751 477.3" style={WELLE} />
      <path d="M663.5 246.8 A219 219 0 0 1 829.5 517.7" style={WELLE} />
    </svg>
  );
}
