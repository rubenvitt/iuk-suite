import type { ExportSpalte } from "@/core/export";

/**
 * DER VERTRAG `bestellvorschlag.xlsx` — kein "use client" (Falle 6).
 *
 * ⚠️ DIESE DATEI HIESS `csvBestellung.ts` UND LIEFERTE EINE CSV. Die Umstellung
 * ist DRK-186 („Excel als einheitliches Reportformat über alle Suite-Module",
 * Entscheidung D8 der Portierung): die Suite gibt Reports als Mappe aus, und die
 * Bestellliste ist ein Report — sie wird gelesen, nicht zurückgelesen.
 *
 * ⛔ WARUM DAS NICHT SCHON BEIM PORT PASSIERT IST, und warum es jetzt darf. Die
 * Datei war 1:1-Pflicht 28: „ein Port reproduziert", und eine Formatänderung im
 * selben Zug hätte „umgezogen" mit „geändert" vermischt — nach dem Cutover wäre
 * keine Abweichung mehr zuordenbar gewesen. Der Cutover ist durch; die Pflicht
 * hat ihren Zweck erfüllt. Die SPALTEN bleiben deshalb Zeichen für Zeichen die
 * sechs alten, in derselben Reihenfolge, mit denselben Status-Literalen — nur
 * der Behälter ist ein anderer. Wer hier Spalten ergänzt, tut das als eigene
 * Entscheidung und nicht als Nebenwirkung des Formatwechsels.
 *
 * ⛔ WAS MIT DER FORMEL-NEUTRALISIERUNG GESCHIEHT (die dritte Frage des Tickets).
 * `csvZelle.ts` trug zwei Funktionen und eine ausführlich begründete Trennung
 * zwischen ihnen: `csvTextZelle` setzte einem führenden `=`/`+`/`-`/`@` einen
 * Apostroph voran, `csvZelle` durfte das NICHT, weil `-` zugleich das Vorzeichen
 * jeder negativen Zahl ist und `'-3` in einer Kalkulation als Text ankommt.
 * Beides ist entfallen — nicht abgeschaltet, sondern gegenstandslos: der
 * Baustein legt jede Textzelle mit `type: String` an, und eine Textzelle kann
 * keine Formel sein; eine Zahl bleibt eine Zahl. Das ist die Ausbeute, die das
 * Ticket als „echtes Argument für die Vereinheitlichung" benennt.
 *
 * ⚠️ DER KONSTANTE DATEINAME BLEIBT, obwohl wiederholte Downloads im
 * Ablageordner kollidieren. Ein datierter Name wäre eine Verbesserung — und
 * eine ZWEITE Änderung in derselben Datei. `core/export/dateiname.ts` hält
 * `datierterDateiname` bereit, falls das jemand entscheidet.
 */

export type BestellExportZeile = {
  name: string; bestand: number; mindestbestand: number;
  vorschlag: number; einheit: string; bestellt: boolean;
};

/** Die sechs Köpfe, diese Reihenfolge, deutsche Beschriftung — unverändert aus
 *  dem CSV-Vertrag übernommen. Exportiert, damit der Test gegen die Konstante
 *  prüft und nicht gegen eine zweite Abschrift derselben Liste. */
export const BESTELL_SPALTEN: readonly ExportSpalte<BestellExportZeile>[] = [
  { kopf: "Artikel", breite: 34, wert: (z) => z.name },
  { kopf: "Bestand", breite: 10, wert: (z) => z.bestand },
  { kopf: "Mindestbestand", breite: 16, wert: (z) => z.mindestbestand },
  { kopf: "Vorschlag", breite: 12, wert: (z) => z.vorschlag },
  { kopf: "Einheit", breite: 10, wert: (z) => z.einheit },
  { kopf: "Status", breite: 12, wert: (z) => (z.bestellt ? "bestellt" : "offen") },
];

export const BESTELL_BLATTNAME = "Bestellvorschlag";
export const BESTELL_DATEINAME = "bestellvorschlag.xlsx";

/** Fester Satz statt `e.message` — der wäre in Produktion der englische Satz
 *  über eine „server-side exception" (Falle 66). Halbgeviertstrich U+2013 wie
 *  am Bestands-Export. */
export const BESTELL_FEHLERTEXT =
  "Excel-Datei konnte nicht erzeugt werden – bitte erneut versuchen.";
