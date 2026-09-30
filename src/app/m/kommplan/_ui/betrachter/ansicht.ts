/** Zoom und Verschieben als reine Funktionen — der Betrachter hält nur den Zustand. */
export interface Ansicht { massstab: number; x: number; y: number }
export const GRENZEN = { min: 0.4, max: 16 } as const;
export const SCHRITT = 1.25;
export const PAN = 48;

const klemme = (m: number, min: number = GRENZEN.min) => Math.min(GRENZEN.max, Math.max(min, m));

/**
 * „Einpassen" zeigt immer die GANZE Zeichnung: nach unten klemmt nur `GRENZEN.max`. Eine große
 * Stab-Lage auf Telefonbreite braucht weniger als `GRENZEN.min` (1789 mm auf 343 px ≈ 0,19 px/mm).
 * Wer von dort weiter verkleinert, bekommt dieselbe Untergrenze (`untergrenze`). `max` deckelt — der
 * Editor will eine einzelne Karte nicht mit Maßstab 16 sehen; `unten` hält Platz für die Griffleiste
 * der untersten Karte, `seite` für die seitlichen Griffe.
 */
export function einpassen(breiteMm: number, hoeheMm: number, vb: number, vh: number, o: { rand?: number; seite?: number; unten?: number; max?: number } = {}): Ansicht {
  const rand = o.rand ?? 16, seite = o.seite ?? rand, unten = o.unten ?? rand, max = o.max ?? GRENZEN.max;
  if (breiteMm <= 0 || hoeheMm <= 0 || vb <= 0 || vh <= 0) return { massstab: 4, x: rand, y: rand };
  const m = Math.min(max, Math.max(1e-3, Math.min((vb - 2 * seite) / breiteMm, (vh - rand - unten) / hoeheMm)));
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

/**
 * Wie weit `zeige()` die Ansicht schieben muss, damit ein Kasten (Layout-mm) samt Rand (px) in einer
 * Fläche von `w` × `h` px liegt. Unter einem Pixel ist es keine Verschiebung: eine Karte, die in der
 * eingepassten Ansicht rechnerisch GENAU am Rand liegt, darf nicht an einem Gleitkommarest aus der
 * Einpassung fallen (Umsetzungsplan Phase 2, Entscheidung 18).
 */
export function nachziehen(a: Ansicht, k: { x: number; y: number; breite: number; hoehe: number }, w: number, h: number,
  rand: { oben: number; seite: number; unten: number }): { dx: number; dy: number } {
  const m = a.massstab;
  const l = a.x + k.x * m, o = a.y + k.y * m, r = l + k.breite * m, u = o + k.hoehe * m;
  const dx = l < rand.seite ? rand.seite - l : r > w - rand.seite ? w - rand.seite - r : 0;
  const dy = o < rand.oben ? rand.oben - o : u > h - rand.unten ? h - rand.unten - u : 0;
  return { dx: Math.abs(dx) < 1 ? 0 : dx, dy: Math.abs(dy) < 1 ? 0 : dy };
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
