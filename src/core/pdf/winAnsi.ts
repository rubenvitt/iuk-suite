/**
 * Text für die 14 Standardschriften von `pdf-lib` (Helvetica & Co.): sie kodieren nur WinAnsi und werfen bei jedem
 * anderen Zeichen erst beim Zeichnen. Aus `lagerbuch/_lib/checklistePdf.ts` hierher, seit `gemeinschaft` Namen aus
 * Eingabefeldern in den unterschriebenen Mietvertrag setzt (IDA-343).
 */

/**
 * Die WinAnsi-Zeichen oberhalb von Latin-1 — der Block, den Windows-1252 auf
 * die Bytes 0x80–0x9F legt. Ohne diese Menge fielen Gedankenstrich und
 * deutsche Anfuehrungszeichen aus, die in Artikelnamen durchaus vorkommen.
 */
const WINANSI_EXTRA = new Set([
  "€", "‚", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š", "‹", "Œ", "Ž",
  "‘", "’", "“", "”", "•", "–", "—", "˜", "™", "š", "›", "œ", "ž", "Ÿ",
]);

/** Was sich sinnvoll ersetzen laesst, wird ersetzt statt verworfen. */
const ERSATZ: Record<string, string> = {
  "✓": "x", "✔": "x",            // ✓ ✔ — Haken
  "→": "->", "←": "<-",          // → ←
  "≤": "<=", "≥": ">=", "≠": "!=",
  "‑": "-", "−": "-",            // geschuetzter Bindestrich, Minus
  "′": "'", "″": '"',            // Fuss-/Zollzeichen
  " ": " ", " ": " ",  // schmales und halbes Leerzeichen
  // Tief- und hochgestellte Ziffern — „O₂" ist in einer Flaschenbezeichnung
  // der Regelfall, nicht die Ausnahme. (¹ ² ³ liegen in Latin-1 und brauchen
  // hier nichts.)
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "⁰": "0", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
};

/**
 * ⚠️ DIE STELLE, AN DER EIN ARTIKELNAME DEN GANZEN EXPORT KIPPEN KOENNTE.
 *
 * `pdf-lib` kodiert die Standardschriften nach WinAnsi und WIRFT bei jedem
 * Zeichen, das dort nicht vorkommt — `WinAnsi cannot encode "✓" (0x2713)`. Der
 * Wurf entstuende beim ZEICHNEN, also erst zur Laufzeit und nur fuer den
 * Bestand, der so ein Zeichen enthaelt: `typecheck`, `lint` und `build` sind
 * dagegen blind, und ein Test mit sauberen Beispieldaten ebenso. Artikelnamen,
 * Fachbezeichnungen und Fahrzeugnamen kommen aber aus Eingabefeldern, und ein
 * „Handschuhe ✓ geprüft" oder ein aus einer Tabellenkalkulation kopiertes
 * Aufzaehlungszeichen ist dort keine Absonderlichkeit. Deshalb laeuft JEDER
 * Text durch diese Funktion, und zwar in `zeichne()` — der einzigen Stelle,
 * die `drawText` ruft, damit es keinen zweiten Weg an ihr vorbei gibt.
 *
 * Unbekannte Zeichen werden zu `?` und nicht stillschweigend verworfen: eine
 * sichtbare Luecke laedt zum Nachsehen ein, ein spurlos verschwundenes Zeichen
 * nicht.
 */
export function winAnsi(text: string): string {
  let raus = "";
  for (const zeichen of text.replace(/[\r\n\t]+/g, " ")) {
    const cp = zeichen.codePointAt(0)!;
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) raus += zeichen;
    else if (WINANSI_EXTRA.has(zeichen)) raus += zeichen;
    else raus += ERSATZ[zeichen] ?? "?";
  }
  return raus;
}
