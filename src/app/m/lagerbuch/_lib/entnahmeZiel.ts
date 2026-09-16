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
import type { Einheitenart } from "./konstanten";

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
  | {
      art: "fahrzeug";
      lagerortId: string;
      name: string;
      /**
       * ⚠️ KENNUNG UND ART GEHOEREN SEIT DRK-309 DAZU. Frueher stand hier der
       * Name allein, mit der Begruendung „die Kennung sagt am Regal niemandem
       * etwas" — die stimmte, solange jede Einheit ein Fahrzeug war und der
       * Name sie damit ausreichend beschrieb. Beides gilt nicht mehr:
       * `lagerorte.name` traegt keinen Eindeutigkeitsschluessel, und eine
       * Tasche heisst nicht zwangslaeufig wie eine.
       *
       * ⚠️ UND DIESE ZEILE IST DIE LETZTE VOR DER BUCHUNG. Die Wahl gilt fuer
       * ALLE weiteren Entnahmen mit diesem Kaertchen; wer sie hier nicht
       * nachpruefen kann, raeumt so lange in die falsche Einheit, bis es
       * jemandem auffaellt. Die Wahl EINEN Schirm vorher zeigt „Art ·
       * Kennung" — weniger zu zeigen als die Auswahl, aus der sie stammt,
       * waere genau an der Bestaetigung die falsche Sparsamkeit.
       */
      kennung: string | null;
      einheitenart: Einheitenart | null;
    }
  | { art: "verbrauch" };

const VERBRAUCH = "verbrauch";
const FAHRZEUG_PRAEFIX = "fz:";

/**
 * Der Trenner zwischen Kärtchen-Kennung und Wahl.
 *
 * ⚠️ ER IST NICHT VERZIERUNG, SONDERN DIE BINDUNG SELBST: ohne ihn wäre `tk1`
 * ein Präfix von `tk12`, und die Wahl der einen Schicht gälte in der anderen
 * weiter. `|` kommt in einer nanoid nicht vor (`_db/schema.ts`: 64er-Alphabet
 * aus Buchstaben, Ziffern, `-` und `_`).
 */
const TRENNER = "|";

/**
 * DIE WAHL, WIE SIE DAS FORMULAR SCHICKT — ohne Kärtchen-Bindung.
 *
 * Cookie und Formular teilen sich die Kodierung der WAHL (`verbrauch`,
 * `fz:<id>`) und damit einen Parser; zwei Formate wären zwei Parser für
 * dieselbe Frage, und der zweite ist der, den beim nächsten Umbau niemand
 * mitzieht.
 *
 * ⚠️ DIE BINDUNG ANS KÄRTCHEN TRÄGT NUR DAS COOKIE (`zielAusWert`). Das
 * Formular kommt aus einer Seite, die der Riegel gerade erst geprüft hat — dort
 * wäre die Kennung eine Angabe des Clients über sich selbst und damit wertlos.
 * Im Cookie ist sie das, was sie sein soll: die Erinnerung des Servers daran,
 * WESSEN Wahl das war.
 */
export function wahlAusWert(wert: string | undefined | null): EntnahmeZiel | null {
  if (!wert) return null;
  if (wert === VERBRAUCH) return { art: "verbrauch" };
  if (wert.startsWith(FAHRZEUG_PRAEFIX)) {
    const lagerortId = wert.slice(FAHRZEUG_PRAEFIX.length);
    return lagerortId ? { art: "fahrzeug", lagerortId } : null;
  }
  return null;
}

/** Die Wahl in Formularform — ohne Bindung, für die Knöpfe der Wahlseite. */
export function wahlWert(ziel: EntnahmeZiel): string {
  return ziel.art === "verbrauch" ? VERBRAUCH : `${FAHRZEUG_PRAEFIX}${ziel.lagerortId}`;
}

/**
 * `null` heißt „noch nichts gewählt" — und zwar auch für einen unlesbaren,
 * alten oder von Hand gesetzten Wert. Ein unbekanntes Format führt zur Wahl
 * zurück; es darf unter keinen Umständen als Fahrzeug durchgehen.
 *
 * ⚠️ DIE WAHL GEHÖRT IHREM KÄRTCHEN (Review-Befund P1 zu PR #140). Das Cookie
 * lief anfangs so lange wie eine Sitzung, trug aber keine Sitzungsidentität —
 * auf einem geteilten Telefon buchte die nächste Schicht damit sofort auf das
 * Fahrzeug der vorigen, ohne je gewählt zu haben. Die Bindung steht deshalb IM
 * WERT und wird bei jedem Lesen geprüft: ein fremdes Kärtchen liest `null`.
 *
 * Sie steht hier und NICHT als Aufräumzeile in `beenden`, `/abmelden` und dem
 * Einlöseweg — eine solche Liste vergisst den nächsten Weg, und der Ausfall
 * wäre still. So ist die Zusage durch KONSTRUKTION wahr.
 */
export function zielAusWert(
  wert: string | undefined | null,
  tokenId: string,
): EntnahmeZiel | null {
  if (!wert) return null;
  const trenner = wert.indexOf(TRENNER);
  if (trenner === -1 || wert.slice(0, trenner) !== tokenId) return null;
  return wahlAusWert(wert.slice(trenner + TRENNER.length));
}

export function zielWert(ziel: EntnahmeZiel, tokenId: string): string {
  return `${tokenId}${TRENNER}${wahlWert(ziel)}`;
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
  "Diese Einheit steht nicht mehr zur Auswahl. Bitte das Ziel neu wählen — die Buchung wurde nicht gespeichert.";

/**
 * Der Satz für ein Ziel, das nicht (mehr) zu dieser Sitzung gehört — eine
 * Artikelseite, die noch offen war, als das Kärtchen gewechselt wurde.
 *
 * Er nennt den nächsten Handgriff, nicht die Ursache: „lade die Seite neu und
 * wähle das Ziel" hilft am Regal weiter, „Sitzungsbindung verletzt" nicht.
 */
export const ZIEL_VERALTET_TEXT =
  "Dieses Fenster ist nicht mehr aktuell. Bitte die Seite neu laden und das Ziel erneut wählen — die Buchung wurde nicht gespeichert.";
