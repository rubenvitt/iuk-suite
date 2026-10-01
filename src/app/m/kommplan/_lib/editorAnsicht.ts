/**
 * DIE ANSICHT DES EDITORS (Umsetzungsplan Phase 3, Entscheidung 1). Kein "use client": die Seite
 * (Server Component) liest den Adressparameter hiermit (Falle 6). `null` heißt „nicht gewählt" — dann
 * entscheidet CSS am Suite-Breakpoint (docs/design/README.md, „Mobil"), nie JavaScript im Rendern.
 */
export const EDITOR_ANSICHTEN = ["diagramm", "gliederung"] as const;
export type EditorAnsicht = (typeof EDITOR_ANSICHTEN)[number];
/** Derselbe Wert wie in `kommplan.css`; nur zur EREIGNISZEIT gefragt (wohin der Fokus zurückkehrt). */
export const SCHMAL = "(max-width: 767.98px)";

export function leseEditorAnsicht(wert: string | string[] | undefined): EditorAnsicht | null {
  const w = Array.isArray(wert) ? wert[0] : wert;
  return (EDITOR_ANSICHTEN as readonly string[]).includes(w ?? "") ? (w as EditorAnsicht) : null;
}

export function adresseMitAnsicht(href: string, ansicht: EditorAnsicht): string {
  const u = new URL(href);
  u.searchParams.set("ansicht", ansicht);
  return `${u.pathname}${u.search}${u.hash}`;
}

export function sichtbareAnsicht(gewaehlt: EditorAnsicht | null, schmal: boolean): EditorAnsicht {
  return gewaehlt ?? (schmal ? "gliederung" : "diagramm");
}
