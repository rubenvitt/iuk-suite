/**
 * Die Schulnoten-Ampel des Feedback-Moduls — eine Definition, zwei
 * Verwendungen (`/f/**` und `(admin)`).
 *
 * WARUM HIER UND NICHT IN `core/theme/tokens.ts`: die Palette traegt die
 * Bedeutung eines FACHBEREICHS (deutsche Schulnote, invertiert), nicht den
 * Farbeindruck der Suite, und beide Nutznießer sind Routen desselben Moduls.
 * Der Anspruch von `tokens.ts`, "die einzige Datei mit Hex-Codes" zu sein, ist
 * dort ausdruecklich um diese Ausnahme praezisiert — nicht stillschweigend
 * verletzt.
 *
 * DIE SKALA IST INVERTIERT: 1 = sehr gut, 6 = ungenuegend. Wer hier eine
 * "mehr ist besser"-Ampel einbaut (hohe Werte gruen), begeht einen
 * Sachfehler, nicht einen Geschmacksfehler.
 *
 * DIE WERTE SIND AUF KONTRAST GEPRUEFT und stammen wortgenau aus
 * `docs/design/feedback-oeffentliche-ansicht.md` §3.4 (identisch in
 * `docs/design/feedback-admin.md` §4.11). Jede Chipfuellung erreicht AA gegen
 * ihre Ziffernfarbe, und die Luminanz faellt streng monoton von Note 1 zu
 * Note 6 (hell .165 → .052) bzw. steigt (dunkel .620 → .254): DAS ist der
 * Kanal, der Rot-Gruen-Blindheit und Graustufen uebersteht. Eigene Werte
 * brechen beide Zusicherungen — `noten.test.ts` rechnet sie nach.
 *
 * KEIN `#c8000f`: Suite-Rot ist auf diesen Routen Marke (3px-Fahne, Wortzeichen
 * "IDA"), niemals Note 6. Note 6 `#811221` ist deutlich dunkler und kuehler.
 *
 * BENENNUNG: die deutschen Namen hier sind die verbindliche Schnittstelle
 * (Plan Task 10). Der TS-Ausschnitt in `feedback-admin.md` §4.11 zeigt
 * englische Bezeichner (`NOTE_LIGHT`, `NOTE_DARK`, …) — er illustriert die
 * WERTE, nicht die API. Die Werte sind identisch; nichts umzubenennen.
 */

/** Chipfuellung im Hellmodus, Ziffer `#FFFFFF`. Index 0 = Note 1. */
export const NOTEN_HELL: readonly string[] = [
  "#2F7F59",
  "#54782A",
  "#7E6103",
  "#904708",
  "#912E10",
  "#811221",
] as const;

/** Chipfuellung im Dunkelmodus, Ziffer `#101214`. Index 0 = Note 1. */
export const NOTEN_DUNKEL: readonly string[] = [
  "#A1DBC0",
  "#AACF7F",
  "#DAB22F",
  "#EB9549",
  "#EA7A58",
  "#E55C6E",
] as const;

/**
 * Der dritte Kanal neben Ziffer und Farbe. Index 0 = Note 1.
 * Damit haengt keine Information allein an der Farbe.
 */
export const NOTEN_WORT: readonly string[] = [
  "sehr gut",
  "gut",
  "befriedigend",
  "ausreichend",
  "mangelhaft",
  "ungenügend",
] as const;

/**
 * Welche der sechs Stufen faerbt einen Mittelwert? Schwellen aus §4.11:
 * 1,00–1,49 → 1 · 1,50–2,49 → 2 · … · 5,50–6,00 → 6.
 *
 * Gerundet wird fuer die FARBE, angezeigt wird der EXAKTE Wert mit einer
 * Dezimale ("2,4"). Damit ist der Farbsprung von 2,4 auf 2,5 erklaerbar statt
 * willkuerlich. Geklemmt wird, damit ein Mittelwert aus fehlerhaften Daten
 * keine Stufe ausserhalb 1..6 erzeugt.
 */
export function ampelStufe(durchschnitt: number): 1 | 2 | 3 | 4 | 5 | 6 {
  // `NaN` muss ZUERST abgefangen werden: `Math.round(NaN)` ist `NaN`, und
  // `Math.min`/`Math.max` reichen es unveraendert durch — die Signatur waere
  // eine Luege und `notenFarbe` gaebe `undefined` zurueck. Der Fall ist real
  // erreichbar: `avgSchulnote` (§4.12/2) mittelt nur `schulnote`-Fragen, und
  // `summe / 0` ergibt bei einem Abend ohne solche Fragen `NaN`, was jede
  // `!== null`-Pruefung passiert.
  //
  // 6 ist hier KEINE Aussage ueber die Daten, sondern der lauteste verfuegbare
  // Fehlalarm. Wer einen unbekannten Wert anzeigt, hat den Riegel des Entwurfs
  // uebersprungen: bei `null` steht laut §4.11 ein „—" und KEINE Pille. Ein
  // stilles Ausweichen auf 1 waere die gefaehrlichere Wahl — eine kaputte
  // Auswertung saehe dann wie „sehr gut" aus und niemand meldete sie.
  // Nur `NaN` braucht den Riegel: `±Infinity` klemmt die Zeile darunter
  // korrekt auf 6 bzw. 1.
  if (Number.isNaN(durchschnitt)) return 6;
  const gerundet = Math.round(durchschnitt);
  return Math.min(6, Math.max(1, gerundet)) as 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * Der ANGEZEIGTE Wert: eine Dezimale, Komma statt Punkt („2,4"). Gerundet wird
 * fuer die Farbe (`ampelStufe`), formatiert wird fuer das Auge — und beides
 * steht hier, damit nicht die eine Anzeige „2,4" und die naechste „2.40"
 * schreibt.
 *
 * Der Entwurf fuehrt diese Funktion in §4.11 als Teil desselben Moduls
 * (`formatNote`); die deutschen Namen hier sind die verbindliche Schnittstelle.
 */
export function formatiereNote(durchschnitt: number): string {
  return durchschnitt.toFixed(1).replace(".", ",");
}

/**
 * Die Farbe einer Note im jeweiligen Modus. Nimmt auch einen Mittelwert an
 * (2,4 → Farbe der Note 2), weil `ampelStufe` die einzige Rundungsregel des
 * Moduls ist und hier nicht ein zweites Mal entstehen soll.
 */
export function notenFarbe(note: number, mode: "light" | "dark"): string {
  const palette = mode === "dark" ? NOTEN_DUNKEL : NOTEN_HELL;
  return palette[ampelStufe(note) - 1];
}

/**
 * DAS FENSTER DES „Ø DER LETZTEN SECHS" (Entwurf §4.2 Zeile 3, §2.5 Kopfzeile).
 *
 * Sechs Dienstabende sind etwa ein Halbjahr — lang genug, dass ein einzelner
 * schlechter Abend die Zeile nicht kippt, kurz genug, dass sie noch von HEUTE
 * spricht.
 */
export const NOTEN_FENSTER = 6;

/**
 * Der Mittelwert der jüngsten (höchstens `NOTEN_FENSTER`) Noten samt der Zahl
 * der Werte, die tatsächlich eingeflossen sind — `null`, wenn keiner übrig
 * bleibt.
 *
 * Er steht hier und nicht am Ort der Verwendung, weil ihn ZWEI Stellen brauchen:
 * die Kontextzeile der Kopfzone (§4.2) und die Kopfzeile des Verlaufs (§2.5).
 * Zwei Rechnungen wären zwei Fenster, und niemand würde merken, dass die eine
 * Zeile fünf und die andere sechs Abende mittelt.
 *
 * DREI ENTSCHEIDUNGEN, DIE HIER LIEGEN:
 *
 * 1. GESCHNITTEN WIRD VOR DEM FILTERN. Sonst wären es „die letzten sechs MIT
 *    Note" und damit ein anderes Fenster als das versprochene.
 * 2. AUS `null` WIRD NIE EINE 0. Ein Abend ohne beantwortete Schulnoten-Frage hat
 *    `avgSchulnote === null` (§4.12); als 0 gemittelt sähe der Durchschnitt mit
 *    jedem Freitext-Abend besser aus.
 * 3. `anzahl` KOMMT MIT ZURÜCK, damit der Aufrufer „der letzten sechs" nicht
 *    behauptet, wenn es zwei waren.
 */
export function fensterMittel(
  notenJuengsteZuerst: readonly (number | null)[],
): { mittel: number; anzahl: number } | null {
  const noten = notenJuengsteZuerst
    .slice(0, NOTEN_FENSTER)
    .filter((n): n is number => n !== null && Number.isFinite(n));
  if (noten.length === 0) return null;
  return {
    mittel: noten.reduce((summe, n) => summe + n, 0) / noten.length,
    anzahl: noten.length,
  };
}

/**
 * „2,1 gut" — Ziffer UND Wort, die beiden Kanäle, die auch in Graustufen und bei
 * Deuteranopie tragen (§4.14). Beide kommen aus derselben Rundungsregel; eine
 * handgeschriebene Fassung wäre eine zweite Schwellentabelle.
 */
export function notenSatz(durchschnitt: number): string {
  return `${formatiereNote(durchschnitt)} ${NOTEN_WORT[ampelStufe(durchschnitt) - 1]}`;
}
