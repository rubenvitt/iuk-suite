/**
 * DIE FORM EINER RELEASE NOTE — Daten, kein Markup.
 *
 * WARUM EIN TYPESCRIPT-MODUL JE NOTIZ UND KEINE MARKDOWN-DATEI. Eine `.md`-Datei
 * müsste zur Laufzeit gelesen und geparst werden, und beides kostet hier mehr,
 * als es einbringt:
 *   * Lesen heißt `fs` im Serverpfad — und damit eine vierte Ecke am Dreieck aus
 *     `CLAUDE.md` („Ein neues Modul registrieren"): der Inhalt müsste über
 *     `outputFileTracingIncludes` oder eine `COPY`-Zeile ins Image finden.
 *     Fehlt sie, läuft es lokal und ist im Container leer — ohne dass `build`,
 *     `typecheck` oder Vitest etwas davon sehen.
 *   * Parsen heißt entweder eine neue Abhängigkeit oder ein eigener Parser, und
 *     am Ende steht in beiden Fällen HTML aus einer Datei in einem `dangerously`
 *     benannten Prop.
 * Als importiertes Modul liegt eine Notiz dagegen im Bundle wie jede andere
 * Konstante: ein Tippfehler im Feldnamen ist ein roter `pnpm typecheck`, eine
 * gelöschte Datei ein roter Build, und gerendert wird ein React-Baum aus
 * Textknoten — kein HTML aus einer Zeichenkette.
 *
 * KEINE INLINE-AUSZEICHNUNG (kein Fett, kein Kursiv, keine Links im Text). Das
 * ist keine Sparmaßnahme, sondern die Stilregel in Typform: eine Notiz, die
 * Betonung braucht, um verstanden zu werden, ist noch nicht fertig geschrieben.
 * Der Nebeneffekt ist, dass es nichts zu parsen und nichts zu escapen gibt.
 *
 * KEIN TEASER-FELD. Ein `kurz` neben `inhalt` wären zwei Wahrheiten über
 * dieselbe Änderung, und die zweite altert still. Der ERSTE Absatz IST die
 * Zusammenfassung — wer die Notiz schreibt, muss sie also im ersten Satz
 * erledigen.
 */

/** Ein Baustein im Fließtext einer Notiz. Erweitern nur, wenn eine Notiz es wirklich braucht. */
export type Notizblock =
  | { art: "absatz"; text: string }
  | { art: "liste"; punkte: readonly string[] }
  /**
   * Für den einen Satz, der eine HANDLUNG verlangt („melde dich einmal ab und
   * wieder an"). Bewusst eine eigene Blockart und nicht bloß ein hervorgehobener
   * Absatz: die Oberfläche darf ihn dadurch anders setzen, und beim Schreiben
   * zwingt er zur Frage, ob überhaupt etwas zu tun ist. Meistens ist es das
   * nicht — dann steht hier nichts.
   */
  | { art: "hinweis"; text: string };

export interface Releasenotiz {
  /**
   * Der Registry-Key des Moduls (`core/registry.ts`), NICHT sein Titel: der
   * Titel steht genau einmal, nämlich dort, und wandert mit, wenn er sich
   * ändert. Ein unbekannter Key ist ein roter `register.test.ts`.
   */
  readonly modul: string;
  /**
   * Kurzname der Notiz — zugleich Sprungmarke (`/neuigkeiten#<slug>`) und
   * zweiter Teil des Dateinamens. `register.test.ts` hält beides zusammen:
   * die Datei MUSS `notizen/<modul>/<datum>-<slug>.ts` heißen.
   */
  readonly slug: string;
  /** Der Tag der Veröffentlichung, `YYYY-MM-DD`. Nicht der Tag des Commits, der Tag des Rollouts. */
  readonly datum: string;
  /**
   * Die Überschrift — eine Aussage über die Änderung, kein Etikett. „Fahrzeug-
   * Checklisten als PDF" statt „Neues Feature: PDF-Export". Ohne Versionsnummer,
   * ohne Modulnamen: beides steht daneben.
   */
  readonly titel: string;
  readonly inhalt: readonly Notizblock[];
}

/**
 * Die drei Schreibhilfen. Sie ersparen jeder Notizdatei das `art:`-Feld und
 * lassen den Inhalt lesen wie das, was er ist — eine Folge von Absätzen.
 */
export function absatz(text: string): Notizblock {
  return { art: "absatz", text };
}

export function liste(...punkte: string[]): Notizblock {
  return { art: "liste", punkte };
}

export function hinweis(text: string): Notizblock {
  return { art: "hinweis", text };
}

/**
 * `YYYY-MM-DD`, streng. Geteilt zwischen Datumsformat und Prüfung, damit die
 * Zusicherung in `register.test.ts` und die Anzeige dieselbe Vorstellung von
 * einem gültigen Datum haben.
 */
export const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
