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
 * KEIN `#c8000f`: DRK-Rot ist auf diesen Routen Marke (3px-Fahne, Wortzeichen
 * "DRK"), niemals Note 6. Note 6 `#811221` ist deutlich dunkler und kuehler.
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
  const gerundet = Math.round(durchschnitt);
  return Math.min(6, Math.max(1, gerundet)) as 1 | 2 | 3 | 4 | 5 | 6;
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
