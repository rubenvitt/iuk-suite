import type { SperrGrund } from "./helferZugang";

/**
 * Die EINE Form, in der eine Helfer-Action antwortet — §7.3.
 *
 * KEIN `use client` (Falle 6): die Datei exportiert WERTE (`RIEGEL_TEXTE`,
 * `NETZ_TEXT_*`), und `_actions/check.ts` ist eine Server-Datei. Aus einem
 * `use client`-Modul bekaeme sie eine Client-Referenz statt des Wertes — HTTP
 * 500 fuer die ganze Seite, und Vitest sieht es strukturell nicht.
 *
 * SIE LIEGT BEWUSST NICHT UNTER `_actions/`: der Guard-Scan aus §3.8.2 liest
 * JEDE Datei dort und erwartet exportierte Actions. Eine Typ- und Textdatei
 * braeuchte dort eine Ausnahme — und eine Ausnahme in einem Scan, dessen ganze
 * Zusage die VOLLSTAENDIGKEIT ist, ist die teuerste Zeile, die man ihm geben
 * kann.
 */

/**
 * FESTLEGUNG G7 (Teil 2): die geteilte Haelfte wird ABGELEITET, nicht
 * abgeschrieben. `SperrGrund` ist "sitzung" | "gesperrt" und gehoert
 * `_lib/helferZugang.ts`; zwei getrennte Literal-Unions fuer dieselben zwei
 * Woerter waeren genau die Typinkonsistenz, gegen die die Produces-Bloecke
 * geschrieben sind — und der Bruch waere still.
 */
export type HelferGrund = SperrGrund | "leer" | "netz";

export type HelferErgebnis<T> =
  | { ok: true; wert: T }
  | { ok: false; grund: HelferGrund; text: string };

/**
 * ⚠️ `"netz"` ENTSTEHT NIE SERVERSEITIG. Es ist der Grund, den der Client im
 * `catch` selbst setzt, damit die Anzeigelogik genau EINE Form kennt. Ohne
 * diesen Satz sucht der naechste Leser die Erzeugerstelle im Server und findet
 * sie nie.
 */

/** Die zwei Saetze, die der Server schreibt — wortgleich mit §7.3. */
export const RIEGEL_TEXTE: Readonly<Record<SperrGrund, string>> = {
  sitzung: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
  gesperrt: "Dieses Kärtchen wurde gesperrt. Die Buchung wurde nicht gespeichert.",
} as const;

/**
 * `gebucht === 0` ist ausdruecklich ein FEHLER, kein Erfolg (§7.3). Heute gibt
 * `fefoAbbuchung` bei leerem Handlager `{gebucht: 0}` zurueck
 * (`db/abbuchung.ts:24-54` wirft nie), und `HelferEntnahme.tsx:26-27` macht
 * daraus „Entnahme gebucht: 0 × X" — GRUEN, MIT HAEKCHEN (`:55`,
 * `chip chip-ok`). Ein 200, das luegt, ist der teuerste Zustand der Tabelle.
 */
export function leerText(artikelName: string): string {
  return `Im Handlager liegt nichts mehr von ${artikelName}. Bitte der Verwaltung melden.`.replace(
    / {2,}/g,
    " ",
  );
}

/** Entnahme: ein Handgriff, ein Satz. */
export const NETZ_TEXT_BUCHUNG = "Keine Verbindung. Die Buchung wurde nicht gespeichert.";

/**
 * Check: der Nachsatz ist tragend. Ein Fahrzeug-Check ist zehn bis zwanzig
 * Minuten Arbeit, und der gesamte Zustand liegt im Client
 * (`CheckFlow.tsx:62-71`: sechs `useState`). „Nicht gespeichert" ohne den
 * Nachsatz liest sich wie „alles weg" — und genau dann laedt jemand neu.
 */
export const NETZ_TEXT_CHECK =
  "Keine Verbindung. Der Check wurde nicht gespeichert — nichts ist verloren, " +
  "bitte erneut auf Abschließen tippen.";

/**
 * §7.4.4: Bei `"sitzung"` zeigt der Abschlussbereich AN ORT UND STELLE ein
 * Zahlenfeld — die einzige Antwort auf „Sitzung weg nach 15 Minuten Zaehlen",
 * die die Arbeit nicht verwirft.
 *
 * Bei `"gesperrt"` erscheint es NICHT: ein erneutes Einloesen desselben Codes
 * scheitert genauso, und ein Feld anzubieten, das nicht helfen kann, ist
 * schlimmer als keins.
 */
export function darfErneuern(grund: HelferGrund): boolean {
  return grund === "sitzung";
}
