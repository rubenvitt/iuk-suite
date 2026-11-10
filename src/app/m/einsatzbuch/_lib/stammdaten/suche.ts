/**
 * Die Freitextsuche über den Stammdatenlisten (IDA-390). KEIN "use client": reine Werte (Falle 6).
 *
 * Gefaltet wird Groß/Klein, Akzente und ß: „mueller“ findet „Müller“ nicht, „muller“ und „Muller“
 * schon; „strasse“ findet „Straße“. Mehrere Wörter müssen alle vorkommen, in beliebiger Reihenfolge —
 * Namen stehen als „Nachname, Vorname“, gesucht wird oft „Vorname Nachname“.
 */
export function falte(text: string): string {
  return text.toLocaleLowerCase("de-DE").replace(/ß/g, "ss").normalize("NFD").replace(/\p{M}/gu, "");
}

export function trifftSuche(felder: readonly string[], begriff: string): boolean {
  const woerter = falte(begriff).split(/[\s,]+/).filter(Boolean);
  if (woerter.length === 0) return true;
  const heu = falte(felder.join(" "));
  return woerter.every((wort) => heu.includes(wort));
}
