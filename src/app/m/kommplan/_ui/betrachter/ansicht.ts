/** Zoom und Verschieben als reine Funktionen — der Betrachter hält nur den Zustand. */
export interface Ansicht { massstab: number; x: number; y: number }
export const GRENZEN = { min: 0.4, max: 16 } as const;
export const SCHRITT = 1.25;
export const PAN = 48;

const klemme = (m: number, min: number = GRENZEN.min) => Math.min(GRENZEN.max, Math.max(min, m));

/**
 * „Einpassen" zeigt immer die GANZE Zeichnung: nach unten klemmt nur `GRENZEN.max`. Eine große
 * Stab-Lage auf Telefonbreite braucht weniger als `GRENZEN.min` (1789 mm auf 343 px ≈ 0,19 px/mm).
 * Wer von dort weiter verkleinert, bekommt dieselbe Untergrenze (`untergrenze`).
 */
export function einpassen(breiteMm: number, hoeheMm: number, vb: number, vh: number, rand = 16): Ansicht {
  if (breiteMm <= 0 || hoeheMm <= 0 || vb <= 0 || vh <= 0) return { massstab: 4, x: rand, y: rand };
  const m = Math.min(GRENZEN.max, Math.max(1e-3, Math.min((vb - 2 * rand) / breiteMm, (vh - 2 * rand) / hoeheMm)));
  return { massstab: m, x: (vb - breiteMm * m) / 2, y: rand };
}

/** Kleinster erlaubter Maßstab: `GRENZEN.min`, oder weniger, wenn erst das die ganze Zeichnung zeigt. */
export function untergrenze(eingepasst: Ansicht): number {
  return Math.min(GRENZEN.min, eingepasst.massstab);
}

export function zoome(a: Ansicht, faktor: number, px: number, py: number, min: number = GRENZEN.min): Ansicht {
  const m = klemme(a.massstab * faktor, min);
  const f = m / a.massstab;
  return { massstab: m, x: px - (px - a.x) * f, y: py - (py - a.y) * f };
}

export function verschiebe(a: Ansicht, dx: number, dy: number): Ansicht {
  return { ...a, x: a.x + dx, y: a.y + dy };
}

export type Aktion = { art: "zoom"; faktor: number } | { art: "verschiebe"; dx: number; dy: number } | { art: "einpassen" };

export function tasteZuAktion(taste: string): Aktion | null {
  switch (taste) {
    case "+": case "=": return { art: "zoom", faktor: SCHRITT };
    case "-": return { art: "zoom", faktor: 1 / SCHRITT };
    case "0": return { art: "einpassen" };
    case "ArrowLeft": return { art: "verschiebe", dx: PAN, dy: 0 };
    case "ArrowRight": return { art: "verschiebe", dx: -PAN, dy: 0 };
    case "ArrowUp": return { art: "verschiebe", dx: 0, dy: PAN };
    case "ArrowDown": return { art: "verschiebe", dx: 0, dy: -PAN };
    default: return null;
  }
}
