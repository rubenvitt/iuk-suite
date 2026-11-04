/**
 * Reine Hilfen für die Sendeversuche von `useEntwurf` — ohne "use client", damit
 * sie ohne React testbar sind (Falle 6, `CLAUDE.md`).
 */

export type SendeZustand = "ruhe" | "sendet" | "wartet";

/**
 * Abstand bis zum nächsten automatischen Versuch: 3 s, 6 s, 12 s, 24 s, dann
 * alle 30 s. Ein Rollout dauert heute unter einer Minute; nach drei Versuchen
 * ist er durch, und danach soll ein Gerät ohne Netz den Akku nicht leer fragen.
 */
export function wartezeit(versuche: number): number {
  const n = Math.max(1, versuche);
  return Math.min(30_000, 3_000 * 2 ** (n - 1));
}

/**
 * Hat der Server die Server Action nicht erkannt? Das passiert nach einem
 * Rollout: Next.js vergibt die Action-IDs je Build neu, und die offene Seite
 * trägt noch die alten (`next/dist/client/components/unrecognized-action-error.js`).
 *
 * Am Namen erkannt und nicht über `unstable_isUnrecognizedActionError` aus
 * `next/navigation`: die Funktion ist als instabil markiert, der Name der Klasse
 * ist das, was sie selbst prüft.
 */
export function istVeralteteAktion(fehler: unknown): boolean {
  return !!fehler && typeof fehler === "object"
    && (fehler as { name?: unknown }).name === "UnrecognizedActionError";
}
