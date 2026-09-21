/**
 * Sauerstoff — Fuellstand, Wechselhinweis und Ampel. Kein "use client", kein
 * Datenbankzugriff.
 */
import type { Ampel } from "./verfall";

/**
 * DER WECHSELHINWEIS IST KONFIGURIERBAR, DIE VORWARNUNG NICHT (DRK-308).
 *
 * Je Flasche steht der Wert in `o2_flaschen.wechsel_ab_prozent`; diese Zahl ist
 * nur seine VORBELEGUNG. Sie ist bewusst 25 — der Wert, den die Ampel bis
 * DRK-308 fest verdrahtet trug. Damit ist die Umstellung additiv: eine Flasche,
 * an der niemand etwas einstellt, wird genau so bewertet wie vorher.
 *
 * ⚠️ DIE GANZZAHL IST EINE BEWUSSTE GRENZE, UND SIE KOSTET GENAUIGKEIT. Ein
 * gewuenschter bar-Wert ist nur darstellbar, wenn er ein ganzes Prozent des
 * Nennfuelldrucks trifft: an einer 300-bar-Flasche liegen 16 % bei 48 bar und
 * 17 % bei 51 bar — 50 bar liegen dazwischen und sind nicht einstellbar. Das
 * ist hingenommen, solange die Vorgabe RELATIV gemeint ist (dort ist „25 %" die
 * Zahl, die jemand nennt, und die bar-Zahl die Ableitung). Faellt die noch
 * offene Abstimmung aus DRK-308 auf die ABSOLUTE Lesart, ist die Antwort nicht
 * eine Nachkommastelle, sondern ein Wechselwert in BAR — dann traegt die
 * Prozentzahl die Ableitung und nicht umgekehrt.
 *
 * ⚠️ „25 % / 50 bar" AUS DER GESPRAECHSNOTIZ IST EIN GRENZWERT IN ZWEI
 * EINHEITEN, NICHT ZWEI GRENZWERTE. 25 % von 200 bar SIND 50 bar — die beiden
 * Zahlen fallen nur bei Nennfuelldruck 200 zusammen. Bei einer 300-bar-Flasche
 * sind 25 % = 75 bar, waehrend 50 bar dort 17 % waeren; die Prozentregel warnt
 * also frueher. Deshalb steht der Grenzwert in PROZENT und skaliert ueber den
 * Nennfuelldruck der jeweiligen Flasche mit. Wer fuer eine einzelne Flasche die
 * absolute Lesart will, rechnet sie einmal in Prozent um und traegt sie dort ein
 * — die Verwaltungsmaske zeigt die zugehoerige bar-Zahl mit an.
 */
export const O2_WECHSEL_VORGABE_PROZENT = 25;

/** Der zulaessige Bereich der Konfiguration. 0 waere eine Ampel, die nie warnt;
 *  100 eine, die immer warnt — beide sind keine Einstellung, sondern ein Aus. */
export const O2_WECHSEL_MIN_PROZENT = 1;
export const O2_WECHSEL_MAX_PROZENT = 99;

/** Die Vorwarnstufe in % vom Nennfuelldruck. FEST: konfigurierbar ist der
 *  Wechselhinweis (§ DRK-308), nicht die Ampel als ganze. Liegt der Wechselwert
 *  auf oder ueber dieser Zahl, entfaellt der gelbe Bereich — dann hat die Ampel
 *  zwei Stufen statt drei, und das ist die Folge der Einstellung, kein Fehler. */
export const O2_AMPEL_GELB_PROZENT = 50;

export type O2Status = {
  prozent: number;
  ampel: Ampel;
  niedrig: boolean;
  /** `true` heisst: WECHSELN. Heute deckungsgleich mit `niedrig`; der eigene
   *  Name traegt die fachliche Aussage, die die Oberflaeche ausschreibt. */
  wechseln: boolean;
  /** Der Grenzwert, gegen den GENAU DIESE Bewertung entstanden ist — in Prozent
   *  und in bar. Die Oberflaeche nennt ihn, damit ein roter Punkt erklaerbar
   *  ist, ohne die Stammdaten aufzuschlagen. */
  wechselAbProzent: number;
  wechselAbBar: number;
};

/**
 * Fuellstand in Prozent, gerundet.
 *
 * NICHT auf 100 geklemmt (§5.12, Eigenschaft 1): Ueberfuellung bleibt sichtbar.
 * `nenn <= 0` liefert 0 % — kein Fehler und keine Division durch null.
 *
 * ⚠️ ES GIBT HIER KEINEN `?? 200`-RUECKFALL, und in diesem Modul gibt es ihn
 * nirgends (§5.12). Fuer eine 300-bar-Flasche skalierte er den Fuellstand STILL
 * FALSCH: 150 bar erschienen als 75 % statt der wahren 50 %, und die Ampel
 * spraenge von „gelb" auf „gruen". Fehlt der Nennfuelldruck in allen verfuegbaren
 * Quellen, liefert die ZEILE `null` und die Anzeige „Nennfuelldruck unbekannt";
 * die Funktion hier wird dann gar nicht erst gerufen. Der Riegel liegt in
 * `_lib/lesepfade/checks.ts` und `_lib/lesepfade/o2.ts`.
 *
 * ⚠️ DIESE ZAHL IST ANZEIGE, NICHT ENTSCHEIDUNG. `o2Status` vergleicht
 * ganzzahlig gegen den Rohdruck und NICHT gegen dieses Ergebnis — siehe dort.
 */
export function fuellstandProzent(druckBar: number, nennfuelldruckBar: number): number {
  if (nennfuelldruckBar <= 0) return 0;
  return Math.round((druckBar / nennfuelldruckBar) * 100);
}

/**
 * Der Wechselwert einer Flasche in bar — die Zahl, die jede Maske ausschreibt
 * („Wechsel fällig – ab N bar").
 *
 * ⚠️ ABGERUNDET, UND DAS FOLGT AUS `o2Status`, NICHT AUS GESCHMACK. Der Hinweis
 * gilt bei `druck <= nenn * prozent / 100`; die GROESSTE ganze Zahl, die das
 * erfuellt, ist also die abgerundete. Bei 25 % von 210 bar sind das 52 — und
 * `o2Status(52, 210)` loest aus, `o2Status(53, 210)` nicht.
 *
 * ⚠️ AUFGERUNDET WAERE DIE ANZEIGE EINE LUEGE, und sie war es bis zur ersten
 * Reviewrunde zu DRK-308: sie nannte 53 bar, waehrend bei 53 bar nichts
 * geschieht. Auf Papier steht diese Zahl neben dem Feld, in das der gemessene
 * Druck eingetragen wird — wer 53 abliest, schluesse daraus auf „tauschen",
 * obwohl die Anwendung die Flasche fuer in Ordnung haelt. Kein Tor sieht das:
 * die Funktion ist fuer sich genommen widerspruchsfrei, der Widerspruch
 * entsteht erst IM VERHAELTNIS zu `o2Status`. Der Test unten haelt genau dieses
 * Verhaeltnis fest, nicht die Rundung fuer sich.
 */
export function wechselGrenzeBar(nennfuelldruckBar: number, wechselAbProzent: number): number {
  if (nennfuelldruckBar <= 0) return 0;
  return Math.floor((nennfuelldruckBar * wechselAbProzent) / 100);
}

/**
 * Prozent + Ampel + Wechselhinweis.
 *
 * ⚠️ BEIDE KANTEN VERGLEICHEN GANZZAHLIG ÜBER KREUZ, NICHT ÜBER `prozent`
 * (rot seit DRK-308, gelb seit DRK-356). `fuellstandProzent` RUNDET, und an der
 * Kante entschiede damit die Rundung statt des Messwerts: 52,5 bar von 210 bar
 * runden auf 25 % und sähen aus wie genau der Grenzwert; 104 bar von 210 sind
 * 49,52 %, runden auf 50 und waren bis DRK-356 grün statt gelb. `druck * 100`
 * gegen `grenze * nenn` ist dieselbe Ungleichung ohne Division, ohne
 * Fließkomma und ohne Rundung. Die Anzeige darf deshalb an einer Kante eine
 * Zahl nennen, die nach der anderen Stufe aussieht („50 %" in Gelb) — sie ist
 * Anzeige, die Ampel ist Entscheidung.
 *
 * ⚠️ „BEI ERREICHEN" HEISST `<=`, UND DAS IST EINE AENDERUNG (DRK-308). Bis
 * dahin galt `prozent < 25`: genau 25 % waren GELB. Das Akzeptanzkriterium sagt
 * „bei Erreichen des vereinbarten Grenzwerts wird der Wechselbedarf sichtbar" —
 * die Kante gehoert also zum Hinweis. Bei 200 bar Nennfuelldruck wandern damit
 * genau die 50,0 bar von gelb nach rot.
 */
export function o2Status(
  druckBar: number,
  nennfuelldruckBar: number,
  wechselAbProzent: number = O2_WECHSEL_VORGABE_PROZENT,
): O2Status {
  const wechselAbBar = wechselGrenzeBar(nennfuelldruckBar, wechselAbProzent);
  const prozent = fuellstandProzent(druckBar, nennfuelldruckBar);

  // Fehlkonfiguriert (Nennfuelldruck <= 0): 0 %, rot, wechseln. Die
  // Kreuzmultiplikation unten liefe hier ins Leere — `druck * 100 <= grenze * 0`
  // waere nur bei Druck 0 wahr, und eine Flasche ohne Bezugsdruck erschiene
  // still GRUEN. Zu unterscheiden vom Fall „Nennfuelldruck UNBEKANNT" (§5.12),
  // der gar nicht erst hier ankommt.
  if (nennfuelldruckBar <= 0) {
    return {
      prozent: 0, ampel: "rot", niedrig: true, wechseln: true,
      wechselAbProzent, wechselAbBar,
    };
  }

  // Rot schließt die Kante ein („bei Erreichen", `<=`), gelb nicht („unter
  // 50 %", `<`): genau 50,0 % sind grün.
  let ampel: Ampel;
  if (druckBar * 100 <= wechselAbProzent * nennfuelldruckBar) ampel = "rot";
  else if (druckBar * 100 < O2_AMPEL_GELB_PROZENT * nennfuelldruckBar) ampel = "gelb";
  else ampel = "gruen";

  const rot = ampel === "rot";
  return {
    prozent, ampel, niedrig: rot, wechseln: rot, wechselAbProzent, wechselAbBar,
  };
}
