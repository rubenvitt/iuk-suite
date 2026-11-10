/**
 * Kürzt eine lange Kennung auf ihre ersten `zeichen` Zeichen plus „…" (IDA-393, `Kurzkennung`).
 * Ein Wert, der nur ein Zeichen länger wäre, bleibt ganz — „…" spart dann nichts.
 *
 * KEIN "use client" (Falle 6).
 */
export function kuerze(text: string, zeichen: number): string {
  return text.length > zeichen + 1 ? `${text.slice(0, zeichen)}…` : text;
}
