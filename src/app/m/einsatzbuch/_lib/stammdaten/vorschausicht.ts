/**
 * Welche Zeilen die Vorschau eines Abgleichs zeigt (IDA-283). Beim Helferverzeichnis stehen
 * schnell hundert Helfer in der Liste, und fast alle sind „Unverändert“ — die drei, um die es
 * geht, gingen darin unter. Die Vorschau startet deshalb auf den Änderungen; „Alle“ ist einen
 * Klick entfernt, und eine Suche nach dem Namen findet jede Zeile.
 *
 * Rein und ohne React, damit Helfer- und Fahrzeugabgleich dieselbe Regel haben und Vitest sie
 * ohne DOM prüft. Die Klassen sind Zeichenketten, weil beide Abgleiche eigene haben; was „nicht
 * übernommen“ heißt, sagt der Aufrufer.
 */

export type Sicht = "aenderungen" | "nicht" | "alle";

/** Was „Übernehmen“ schreibt — bei beiden Abgleichen dieselben drei Klassen. */
const AENDERUNG: readonly string[] = ["neu", "geaendert", "deaktivieren"];

export type Sichtzahlen = Record<Sicht, number>;

export function zaehleSichten(zeilen: readonly { klasse: string }[], nicht: readonly string[]): Sichtzahlen {
  return {
    aenderungen: zeilen.filter((z) => AENDERUNG.includes(z.klasse)).length,
    nicht: zeilen.filter((z) => nicht.includes(z.klasse)).length,
    alle: zeilen.length,
  };
}

/** Die Sicht beim Öffnen: die erste, in der etwas steht — ohne Änderungen sonst eine leere Liste. */
export function startSicht(zahlen: Sichtzahlen): Sicht {
  if (zahlen.aenderungen > 0) return "aenderungen";
  if (zahlen.nicht > 0) return "nicht";
  return "alle";
}

/** Ohne Groß-/Kleinschreibung und ohne Akzente: „jurgens“ findet „Jürgens“. */
function normal(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("de");
}

export function sichtbareZeilen<T extends { klasse: string }>(
  zeilen: readonly T[],
  sicht: Sicht,
  nicht: readonly string[],
  suche: string,
  text: (z: T) => string,
): T[] {
  const begriff = normal(suche.trim());
  return zeilen.filter(
    (z) =>
      (sicht === "alle" || (sicht === "aenderungen" ? AENDERUNG : nicht).includes(z.klasse)) &&
      (begriff === "" || normal(text(z)).includes(begriff)),
  );
}
