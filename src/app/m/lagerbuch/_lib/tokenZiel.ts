/**
 * Landeziel eines eingelösten Zugangs-Codes. Ein Code führt entweder direkt zu einem Fahrzeug
 * (Fahrzeug-Check, vorausgewählt) oder zu einem Material im Handlager (Artikel-Detail). Ohne Ziel
 * landet der Helfer auf der allgemeinen Artikel-Liste.
 *
 * Rückgabe ist ein lokaler Pfad (startet mit "/") und ist damit kompatibel mit sanitizeReturnTo.
 *
 * ZEICHENGLEICH aus `lagerbuch/src/lib/auth/tokenZiel.ts` — nur der Ablageort
 * wechselt (§3.1). Der erste Aufrufer entsteht in Teil 4 (`t/[code]/route.ts`,
 * §7.2.3); bis dahin ist die Datei bewusst ohne Konsument.
 *
 * ⚠️ DIE PFADE TRAGEN DIE AEUSSERE FORM (`/helfer`, `/a/<id>`), nicht die innere
 * (`/m/lagerbuch/helfer`). Sie landen in einem `Location`-Kopf bzw. in einem
 * `redirect()`, also beim Browser — und der kennt nur den Modul-Host.
 */
export function tokenZielPfad(zielTyp: string | null | undefined, zielId: string | null | undefined): string {
  if (zielTyp === "artikel" && zielId) return `/a/${zielId}`;
  if (zielTyp === "fahrzeug" && zielId) return `/helfer/check?fz=${zielId}`;
  return "/helfer";
}
