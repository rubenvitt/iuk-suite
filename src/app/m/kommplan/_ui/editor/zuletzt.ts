/**
 * „ZULETZT GENUTZT" (Spec §6.4) je Browser — eine Bequemlichkeit, kein Planinhalt. Jeder Zugriff in
 * `try/catch`: privates Fenster und gesperrte Seitendaten werfen, dann gilt die Liste nur für diese
 * Sitzung (bzw. ist leer).
 */
const SCHLUESSEL = "kommplan:zeichen:zuletzt";
export const ZULETZT_MAX = 8;

export function leseZuletzt(): string[] {
  try {
    const roh = window.localStorage.getItem(SCHLUESSEL);
    const wert: unknown = roh ? JSON.parse(roh) : [];
    return Array.isArray(wert) ? wert.filter((x): x is string => typeof x === "string").slice(0, ZULETZT_MAX) : [];
  } catch {
    return [];
  }
}

export function merkeZuletzt(schluessel: string): string[] {
  const neu = [schluessel, ...leseZuletzt().filter((k) => k !== schluessel)].slice(0, ZULETZT_MAX);
  try { window.localStorage.setItem(SCHLUESSEL, JSON.stringify(neu)); } catch { /* nur für diese Sitzung */ }
  return neu;
}
