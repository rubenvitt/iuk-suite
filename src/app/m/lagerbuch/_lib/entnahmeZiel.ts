/**
 * DAS ZIEL EINER ENTNAHME AM REGAL — DRK-300.
 *
 * KEIN "use client" (Falle 6): die Werte lesen Server Components, ein Route
 * Handler und eine Server Action. Aus einem als Client markierten Modul bekäme
 * eine Server Component eine Client-Referenz statt des Wertes — HTTP 500 für
 * die ganze Seite, und Vitest sähe es strukturell nicht.
 *
 * ⚠️ DREI ZUSTÄNDE, NICHT ZWEI. „Noch nichts gewählt" (`null`) und
 * „ausdrücklich kein Fahrzeug" (`{ art: "verbrauch" }`) sind fachlich
 * verschieden, und der Unterschied ist die ganze Zusage des Tickets: der erste
 * Zustand darf NICHT buchen, der zweite bucht Verbrauch aus dem Handlager.
 * Ein Entwurf als `string | null` kann ihn nicht tragen — und sein Verlust wäre
 * still: jede Entnahme vor der ersten Wahl liefe dann als Verbrauch durch,
 * während das Material im Fahrzeug liegt.
 *
 * ⚠️ DAS PRÄFIX `fz:` IST NICHT SCHMUCK. Eine rohe `lagerorte.id` im Cookie
 * wäre von der Zeichenkette `verbrauch` nicht unterscheidbar, und IDs sind
 * beim importierten Altbestand beliebige Zeichenketten (`_db/schema.ts`: keine
 * ID wird beim Import neu vergeben).
 */

/**
 * Host-only wie `helfer_session`, aber ausdrücklich ANDERS benannt: derselbe
 * Name überschriebe die laufende Sitzung und sperrte die Helferin am Regal aus.
 */
export const ZIEL_COOKIE = "helfer_ziel";

export type EntnahmeZiel =
  | { art: "fahrzeug"; lagerortId: string }
  | { art: "verbrauch" };

/**
 * DAS ZIEL, WIE ES AUF DEM SCHIRM STEHT — mit dem Namen, den der Mensch am
 * Regal liest, neben der Kennung, die der Server braucht.
 *
 * ⚠️ ER STEHT HIER UND NICHT IN DER INSEL (Falle 6): `_ui/Entnahme.tsx` trägt
 * `"use client"`, und eine Server Component, die von dort einen WERT holte,
 * bekäme eine Client-Referenz statt des Wertes — HTTP 500 für die ganze Seite,
 * das `build` sieht es nicht und Vitest strukturell auch nicht. Für einen
 * reinen Typ ginge es heute gut; die Datei, die ihn morgen um eine Konstante
 * ergänzt, weiß davon nichts.
 */
export type ZielAnzeige =
  | { art: "fahrzeug"; lagerortId: string; name: string }
  | { art: "verbrauch" };

const VERBRAUCH = "verbrauch";
const FAHRZEUG_PRAEFIX = "fz:";

/**
 * DIESELBE KODIERUNG TRÄGT COOKIE UND FORMULAR, und das ist keine Sparsamkeit:
 * die Wahlseite schickt den Wert, den das Cookie danach führt. Zwei Formate
 * wären zwei Parser für dieselbe Frage — und der zweite ist der, den beim
 * nächsten Umbau niemand mitzieht.
 *
 * `null` heißt „noch nichts gewählt" — und zwar auch für einen unlesbaren,
 * alten oder von Hand gesetzten Wert. Ein unbekanntes Format führt zur Wahl
 * zurück; es darf unter keinen Umständen als Fahrzeug durchgehen.
 */
export function zielAusWert(wert: string | undefined | null): EntnahmeZiel | null {
  if (!wert) return null;
  if (wert === VERBRAUCH) return { art: "verbrauch" };
  if (wert.startsWith(FAHRZEUG_PRAEFIX)) {
    const lagerortId = wert.slice(FAHRZEUG_PRAEFIX.length);
    return lagerortId ? { art: "fahrzeug", lagerortId } : null;
  }
  return null;
}

export function zielWert(ziel: EntnahmeZiel): string {
  return ziel.art === "verbrauch" ? VERBRAUCH : `${FAHRZEUG_PRAEFIX}${ziel.lagerortId}`;
}

/**
 * Der Satz für ein Ziel, das es nicht (mehr) gibt — stillgelegt, gelöscht oder
 * gar kein Fahrzeug. Er steht SERVERSEITIG, weil nur der Server die Lage kennt;
 * die Insel müsste sie sonst raten.
 *
 * Er nennt den nächsten Handgriff, nicht die Ursache: am Regal hilft „wähle das
 * Ziel neu" weiter, „Lagerort ist kein aktives Fahrzeug" nicht.
 */
export const ZIEL_UNGUELTIG_TEXT =
  "Dieses Fahrzeug steht nicht mehr zur Auswahl. Bitte das Ziel neu wählen — die Buchung wurde nicht gespeichert.";
