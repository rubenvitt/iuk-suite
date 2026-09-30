import { LAENGE } from "./schema";

/**
 * EINFÜGE-PARSER (Spec §6.4, §10). Phase 2: „Liste einfügen" der Einheiten — je Zeile erstes Wort
 * = Typ, Rest = Rufname. Phase 3: `leseGliederung`, der Parser für mehrzeilig eingefügte Gliederungen.
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

/**
 * GLIEDERUNG EINFÜGEN (Spec §6.5; Umsetzungsplan Phase 3, Entscheidung 9). Die Ebene folgt einem
 * Einrückungsstapel, nicht einer festen Spaltenzahl: so tragen Tabs, zwei oder vier Leerzeichen und
 * Mischungen daraus, und ein Sprung über mehrere Stufen ist genau eine Ebene tiefer.
 *
 * NICHTS WIRD GERATEN: auch „RTW RK UE 40-83-5" wird eine Stelle — Einheiten entstehen nur über
 * „Liste einfügen". Aufzählungszeichen und Nummern fallen nur mit folgendem Leerraum weg, damit
 * „112 Leitstelle" und „1.2 Abschnitt" ihre Zahl behalten.
 */
export interface GliederungsEintrag { ebene: number; titel: string }
export const TAB_BREITE = 2;
const EINZUG = /^[\t  ]*/;
const AUFZAEHLUNG = /^(?:[-*•‣◦▪–]|\d+(?:\.\d+)*[.)])[\t  ]+/u;

export function leseGliederung(text: string): { eintraege: GliederungsEintrag[]; fehler: string[] } {
  const eintraege: GliederungsEintrag[] = [];
  const fehler: string[] = [];
  const stufen: number[] = [];
  text.split(/\r\n|\r|\n/).forEach((roh, i) => {
    const einzug = EINZUG.exec(roh)![0];
    const titel = roh.slice(einzug.length).replace(AUFZAEHLUNG, "").replace(/\s+/g, " ").trim();
    if (titel === "") return;
    // erst prüfen, dann stapeln: eine fehlerhafte Zeile verschiebt die Einrückung der übrigen nicht
    if (titel.length > LAENGE.titel) { fehler.push(`Zeile ${i + 1}: Der Titel ist länger als ${LAENGE.titel} Zeichen.`); return; }
    const breite = [...einzug].reduce((n, z) => n + (z === "\t" ? TAB_BREITE : 1), 0);
    while (stufen.length > 0 && stufen[stufen.length - 1] > breite) stufen.pop();
    if (stufen.length === 0 || stufen[stufen.length - 1] < breite) stufen.push(breite);
    eintraege.push({ ebene: stufen.length - 1, titel });
  });
  return { eintraege, fehler };
}
