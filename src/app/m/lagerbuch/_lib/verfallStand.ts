/**
 * DER EINE STAND DES FAHRZEUG-VERFALLS (DRK-345).
 *
 * ⚠️ DIE ENTSCHEIDUNG, DIE DIESE DATEI TRAEGT — sie steht hier und nicht nur im
 * Ticket, weil genau ihr Fehlen die Fehlerklasse erzeugt hat:
 *
 *   **Massgeblich ist der Wert, den die Datenbank nach dem Schreiben fuehrt —
 *   gemeldet als Rueckgabewert der Aktion. Der Spiegel im Browser ist die
 *   VORWEGNAHME dieses Werts, nie seine Alternative.**
 *
 * Daraus folgen drei Regeln, und jede einzelne hat im Review von DRK-303 einen
 * Fehler gekostet, bevor sie aufgeschrieben war:
 *
 * 1. Ein Artikel, zu dem diese Sitzung nichts geschrieben hat, traegt den
 *    SERVERSTAND — nicht einen beim Einhaengen kopierten Abzug davon. Deshalb
 *    startet der Stand LEER (`LEERER_STAND`) und nicht als Kopie der Zeilen.
 * 2. Jede Antwort mit `ok: true` traegt ihren Wert in den Stand, und zwar den
 *    aus der ANTWORT — nie den, den die Oberflaeche gesendet hat. Die beiden
 *    koennen auseinandergehen: die Aussonderung entscheidet in ihrer eigenen
 *    Transaktion ueber „alles raus" und schreibt dann `null`, obwohl im Feld
 *    ein Datum stand.
 * 3. Eine Vorwegnahme (`standVorweg`) ist vorlaeufig und ueberlebt nur bis zur
 *    Antwort. Sie existiert allein wegen der Wartezeit im Monatswaehler; ohne
 *    sie spraenge das Feld beim Tippen zurueck.
 *
 * ⚠️ WAS DIESE DATEI NICHT LOESEN KANN: schreibt eine ANDERE Sitzung den Wert,
 * erfaehrt diese hier davon erst beim naechsten Laden — wie jede andere Zahl
 * auf der Seite auch. Der Stand ist die Vorwegnahme des Serverstands, nicht
 * ein zweiter Stand daneben.
 *
 * KEIN "use client": die Aktionen lesen `VerfallWert` (Falle 6, `CLAUDE.md`).
 * Der Haken, der den Stand haelt, liegt in
 * `verwaltung/(arbeit)/fahrzeuge/[id]/useVerfallStand.ts`.
 */
import type { ActionErgebnis } from "./actionErgebnis";

/**
 * Der Nutzwert BEIDER Schreibwege auf `lagerort_verfall`.
 *
 * ⚠️ EIN TYP FUER BEIDE, UND ZWAR ABSICHTLICH. Solange `verfallSetzen` nur
 * `{ gesetzt: boolean }` meldete, gab es fuer den Monatswaehler gar nichts zu
 * uebernehmen — er musste seine eigene Eingabe spiegeln, und damit war Regel 2
 * oben fuer diesen Weg nicht einhaltbar. Wer hier einen zweiten Nutzwert
 * einzieht, macht denselben Weg wieder auf.
 */
export type VerfallWert = { verfall: string | null };

/**
 * Was diese Sitzung selbst geschrieben (oder vorweggenommen) hat, je Artikel.
 * Ein FEHLENDER Schluessel heisst „dazu weiss der Server mehr als ich" — nicht
 * „kein Verfall". Deshalb `hasOwnProperty` statt `??` in `verfallVon`: `null`
 * ist ein gueltiger, bewusst gesetzter Wert.
 */
export type VerfallStand = Readonly<Record<string, string | null>>;

export const LEERER_STAND: VerfallStand = {};

/** Die Zeile, so viel davon der Stand braucht. */
export type VerfallZeile = { artikelId: string; verfall: string | null };

/**
 * Der Monat, der fuer diese Zeile gilt — der einzige Lesezugriff, den es geben
 * darf. Monatswaehler, Aussondern-Dialog und alles Weitere fragen DIESE
 * Funktion; zwei Aufrufstellen mit unterschiedlichem Rueckfall waren der zweite
 * Fehler der Reihe (der Dialog las die Prop, der Waehler den Spiegel).
 */
export function verfallVon(stand: VerfallStand, zeile: VerfallZeile): string | null {
  return Object.prototype.hasOwnProperty.call(stand, zeile.artikelId)
    ? stand[zeile.artikelId]
    : zeile.verfall;
}

/**
 * Die Vorwegnahme: was der Waehler zeigt, bis die Antwort da ist.
 *
 * ⚠️ NUR DER MONATSWAEHLER NIMMT VORWEG. Die Aussonderung tut es nicht — sie
 * KENNT ihr Ergebnis nicht: ob die Angabe entfaellt, entscheidet die
 * Transaktion am verbleibenden Bestand. Eine Vorwegnahme waere dort eine
 * Behauptung, und genau die war der dritte Fehler der Reihe.
 */
export function standVorweg(
  stand: VerfallStand,
  artikelId: string,
  vermutung: string | null,
): VerfallStand {
  return { ...stand, [artikelId]: vermutung };
}

/**
 * Der einzige Weg, auf dem ein Wert endgueltig in den Stand faellt.
 *
 * ⚠️ NUR `ok: true` SCHREIBT. Bei `ok: false` bleibt die Vorwegnahme stehen —
 * absichtlich, und `VerfallEditor.test.tsx` haelt es fest: die Eingabe einer
 * Person zu verwerfen, weil das Speichern scheiterte, ist schlimmer als eine
 * Statusspalte, die bis zum naechsten Laden den alten Stand nennt. Den
 * Widerspruch loest der Fehlersatz auf, nicht das Zuruecksetzen.
 */
export function standNachAntwort(
  stand: VerfallStand,
  artikelId: string,
  antwort: ActionErgebnis<VerfallWert>,
): VerfallStand {
  if (!antwort.ok) return stand;
  return { ...stand, [artikelId]: antwort.wert.verfall };
}
