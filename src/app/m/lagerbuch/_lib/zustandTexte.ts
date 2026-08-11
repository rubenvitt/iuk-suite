/**
 * DIE ZUSTANDSTEXTE, DIE EINE CLIENT-GRENZE KREUZEN — kein "use client".
 *
 * Drei Zustaende aus §11.5 werden von diesem Plan gebaut, und sie werden von
 * BEIDEN Seiten gelesen:
 *   22/23  Modul-Fehlergrenze  → error.tsx        ("use client", Pflicht)
 *   15     Barcode unbekannt   → g/[code]/page.tsx (Server Component)
 *   38     Domain fehlt        → (druck)/etiketten/page.tsx (Server Component)
 *
 * Ein Text, den error.tsx selbst hielte, waere fuer jede Server Component, die
 * ihn mitliest, Falle 6: sie bekaeme eine Client-Referenz statt des Wertes,
 * HTTP 500 fuer die ganze Seite, waehrend typecheck und build gruen bleiben und
 * Vitest es strukturell nicht sehen kann (§11.6, CLAUDE.md:24-27).
 *
 * WAS HIER NICHT STEHT: die Gate-Texte (_lib/gateTexte.ts, §3.9) und die
 * Helfer-Texte (bei ihren Bauteilen, §7.3). Diese Datei sammelt nicht „alle
 * Texte des Moduls", sondern die drei, die diese eine Grenze kreuzen.
 */

// ——— §11.5, Zustaende 22 und 23: die Modul-Fehlergrenze ———————————————
//
// EIN SATZ OHNE TECHNIK. Der Produktions-Deserialisierer im Browser-Buendel hat
// fuer eine Fehlerzeile genau einen Zweig und baut einen Error mit dem festen
// englischen Text ueber eine „server-side exception" (Falle 66). Die Person vor
// dem Bildschirm bekommt deshalb DIESEN Satz, nie den geworfenen.
export const FEHLER_TITEL = "Diese Ansicht konnte nicht geladen werden.";
export const FEHLER_ERNEUT = "Erneut versuchen";

/** §11.7: jeder gestaltete Zustand traegt einen benannten Weg zurueck. `/`
 *  fuehrt unter dem Host-Rewrite an den Modulanfang — und der ist das Gate
 *  (Entscheidung 15, §3.6.6). */
export const FEHLER_ZURUECK = "Zurück zum Anfang";

// ——— §11.5, Zustand 15 / Entscheidung 8-C2: der gescannte Barcode ————————
//
// `/g/<code>` erreicht ohnehin nur eine angemeldete verwaltende Person — die
// Rollen-Weiche schickt jede Nicht-Admin-Anfrage vorher weg. Die braucht keine
// Auskunft ueber die Suite, sondern ueber den BARCODE, samt dem gescannten Code
// zum Abgleich mit dem Typenschild (§11.3).
export const BARCODE_TITEL = "Kein Gerät zu diesem Barcode";
export const BARCODE_TEXT =
  "Zu diesem Barcode gibt es weder ein Gerät noch eine Sauerstoff-Flasche.";
export const BARCODE_NOCHMAL = "Noch einmal scannen";
export const BARCODE_LISTE = "Geräteliste";

// ——— §11.5, Zustand 38 / Entscheidung 8-B: keine Domain konfiguriert ————
//
// Ein Zustand, den es HEUTE nicht geben kann (config.ts:33 traegt einen
// zod-Default) und der nach dem Port der wahrscheinlichste Fehlstart ist.
// Verboten ist beides, was ohne diese Meldung passiert: ein QR mit dem Text
// `null/a/<id>`, und ein stiller Rueckfall auf einen relativen Pfad — ein
// relativer QR ist auf Papier bedeutungslos und sieht auf dem Bildschirm
// richtig aus.
export function etikettenDomainFehlt(): string {
  return (
    "Etiketten können nicht gedruckt werden: für lagerbuch ist keine öffentliche " +
    "Domain konfiguriert (SUITE_HOST_LAGERBUCH). Ohne sie trägt jeder QR-Code " +
    "einen toten Link."
  );
}
