import { z } from "zod";

/**
 * Das Unterschriftenfeld der Vertragsvorlage (IDA-343): eine Seite (ab 0) und ein Rechteck in PDF-Punkten, Ursprung
 * unten links wie in der PDF selbst. Ohne Datenbank- und Node-Import, damit die Verwaltung im Browser damit rechnet.
 */
export type Feld = { seite: number; x: number; y: number; b: number; h: number };
export type Seitenmass = { b: number; h: number };

/** Kleiner geht nicht sinnvoll zu unterschreiben (≈ 2 × 0,7 cm). */
export const FELD_MIN = { b: 56, h: 20 } as const;

const zahl = z.number().finite();
export const feldSchema = z.object({ seite: z.number().int().min(0).max(999), x: zahl, y: zahl, b: zahl, h: zahl }).strict();

/** Das Feld liegt ganz auf der Seite und ist groß genug — sonst `null`. */
export function pruefeFeld(roh: unknown, seiten: readonly Seitenmass[]): Feld | null {
  const p = feldSchema.safeParse(roh);
  if (!p.success) return null;
  const f = p.data;
  const s = seiten[f.seite];
  if (!s) return null;
  if (f.b < FELD_MIN.b || f.h < FELD_MIN.h) return null;
  if (f.x < 0 || f.y < 0 || f.x + f.b > s.b + 0.5 || f.y + f.h > s.h + 0.5) return null;
  return { seite: f.seite, x: rund(f.x), y: rund(f.y), b: rund(f.b), h: rund(f.h) };
}

const rund = (n: number) => Math.round(n * 10) / 10;

/** Gespeichertes JSON zurück in ein Feld; Unlesbares ist „kein Feld“. */
export function feldAusJson(roh: string | null): Feld | null {
  if (!roh) return null;
  try {
    const p = feldSchema.safeParse(JSON.parse(roh));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

/**
 * Bildschirm → PDF: ein auf der gerenderten Seite aufgezogenes Rechteck (Pixel, Ursprung oben links, `massstab` =
 * Pixel je Punkt) in PDF-Punkte. Gekappt auf die Seite, damit ein Zug über den Rand nicht verloren geht.
 */
export function feldAusPixeln(seite: number, px: { x1: number; y1: number; x2: number; y2: number }, massstab: number, mass: Seitenmass): Feld {
  const links = Math.max(0, Math.min(px.x1, px.x2) / massstab);
  const rechts = Math.min(mass.b, Math.max(px.x1, px.x2) / massstab);
  const oben = Math.max(0, Math.min(px.y1, px.y2) / massstab);
  const unten = Math.min(mass.h, Math.max(px.y1, px.y2) / massstab);
  return { seite, x: rund(links), y: rund(mass.h - unten), b: rund(rechts - links), h: rund(unten - oben) };
}

/** PDF → Bildschirm, für das Anzeigen eines gespeicherten Felds über der gerenderten Seite. */
export function feldInPixeln(f: Feld, massstab: number, mass: Seitenmass): { links: number; oben: number; breite: number; hoehe: number } {
  return { links: f.x * massstab, oben: (mass.h - f.y - f.h) * massstab, breite: f.b * massstab, hoehe: f.h * massstab };
}
