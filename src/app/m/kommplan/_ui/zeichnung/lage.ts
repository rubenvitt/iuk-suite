import type { CSSProperties } from "react";

/**
 * LAGE EINES ELEMENTS IN DER ZEICHNUNG. Im Druck und im Betrachter ein SVG-Attribut (bleibt auch im
 * SVG-Export der Phase 5 gültig). Im Editor ein CSS-Transform mit Klasse `kp-gleitet`: nur eine
 * CSS-Eigenschaft kann per `transition` gleiten, das Attribut `transform` nicht. In SVG ist ein
 * CSS-`px` eine Nutzereinheit, hier also ein Layout-Millimeter.
 */
export function lage(x: number, y: number, gleitend: boolean): { transform?: string; style?: CSSProperties; className?: string } {
  return gleitend ? { style: { transform: `translate(${x}px, ${y}px)` }, className: "kp-gleitet" } : { transform: `translate(${x} ${y})` };
}
