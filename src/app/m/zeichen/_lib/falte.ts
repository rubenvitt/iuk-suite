/**
 * DIE EINE Faltung des Moduls — der Generator UND die Katalog-Insel benutzen sie,
 * nie zwei aequivalente. Sie faltet MEHR als lagerbuchs `falte()` (das ist
 * buchstaeblich `s.toLowerCase()`).
 *
 * GEMESSEN gegen die 232 Hauptrezepte: mit reiner Kleinschreibung findet
 * "loeschgruppe" 0 von 232 und "sanitaet" 0 von 22. Wer auf einem Tablet mit
 * Handschuhen tippt, schreibt keine Umlaute.
 *
 * Reihenfolge ist wichtig: erst die deutschen Ersetzungen (ä -> ae), DANN die
 * NFD-Zerlegung. Umgekehrt zerlegte NFD das ä zu a + Diakritikum, und aus
 * "Löschgruppe" wuerde "loschgruppe" statt "loeschgruppe".
 */
export const falte = (s: string): string =>
  s
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
