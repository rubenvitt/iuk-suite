import { LAENGE } from "./schema";

/**
 * EINFÜGE-PARSER (Spec §6.4, §10). Phase 2: „Liste einfügen" der Einheiten — je Zeile erstes Wort
 * = Typ, Rest = Rufname. Phase 3 ergänzt hier die mehrzeilige Gliederung.
 *
 * NICHTS WIRD STILL GEKÜRZT: eine zu lange Angabe ist ein Fehler mit Zeilennummer, und die Oberfläche
 * übernimmt eine Liste nur ohne Fehler (Review Focus Phase 2, Punkt 2).
 */
export interface ListenEinheit { typ: string; rufname: string }

export function leseEinheitenliste(text: string): { einheiten: ListenEinheit[]; fehler: string[] } {
  const einheiten: ListenEinheit[] = [];
  const fehler: string[] = [];
  text.split(/\r?\n/).forEach((roh, i) => {
    const zeile = roh.replace(/\s+/g, " ").trim();
    if (zeile === "") return;
    const [typ, ...rest] = zeile.split(" ");
    const rufname = rest.join(" ");
    if (typ.length > LAENGE.typ) fehler.push(`Zeile ${i + 1}: Der Typ ist länger als ${LAENGE.typ} Zeichen.`);
    else if (rufname.length > LAENGE.rufname) fehler.push(`Zeile ${i + 1}: Der Rufname ist länger als ${LAENGE.rufname} Zeichen.`);
    else einheiten.push({ typ, rufname });
  });
  return { einheiten, fehler };
}
