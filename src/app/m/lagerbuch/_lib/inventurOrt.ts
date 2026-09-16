/**
 * DRK-337 — DER ORT EINER ZAEHLUNG, als reine Werte und Funktionen.
 *
 * Kein "use client" (Falle 6): die Seite ist eine Server Component und liest
 * `ZAEHLORT_ALLE` sowie `zaehlOrtLabel`; das Formular und die Action lesen
 * dieselben Werte. Kein Icon-Import (Falle 7).
 *
 * WARUM EIN LAUF GENAU EINEN ORT ZAEHLT (Betreiberentscheidung, ClickUp
 * DRK-337): die Erwartungszahl jeder Position bezieht sich auf den gewaehlten
 * Ort. Zaehlte ein Lauf mehrere Orte, waere „erwartet 12" wieder eine Summe
 * ueber Orte — genau das Problem des Tickets, nur eine Ebene tiefer. Wer drei
 * Schraenke zaehlt, macht drei Laeufe; der Verlauf liest sich dann als
 * „Schrank 1", „Schrank 2", „GF-Schrank".
 */
import { HANDLAGER_ID } from "./konstanten";

/**
 * Der Wert der Auswahl und des URL-Parameters fuer „ganzer Handlager" — das
 * Verhalten vor DRK-337 und weiterhin die Vorgabe.
 *
 * ⚠️ NICHT `HANDLAGER_ID`, UND DAS IST DER GANZE UNTERSCHIED: die Wurzel ist
 * selbst ein waehlbarer Ort („noch keinem Schrank zugeordnet"). Beide auf
 * denselben Wert zu legen hiesse, dass eine Zaehlung der Wurzel still den
 * Bestand aller Schraenke miterwartet.
 *
 * ⚠️ ER STEHT SEIT DRK-371 IN EINEM ANDEREN WERTEBEREICH ALS EIN ORT, und die
 * Richtung ist nicht beliebig: ein Ort traegt das Praefix, der Waechter nicht.
 * Die Begruendung steht bei `ORT_PRAEFIX`.
 */
export const ZAEHLORT_ALLE = "alle";

/**
 * DRK-371 — EIN ORT HEISST IN AUSWAHL UND URL `ort:<kennung>`.
 *
 * ⚠️ DAS PRAEFIX IST NICHT SCHMUCK, und es steht in diesem Modul schon zum
 * dritten Mal in der Suite: `_lib/entnahmeZiel.ts` fuehrt `fz:`,
 * `verfall/AussondernRow.tsx` `ort:` — beide aus genau diesem Grund. Kennungen
 * des importierten Altbestands sind BELIEBIGE Zeichenketten; keine wird beim
 * Import neu vergeben (`_db/schema.ts`). Hiesse ein Schrank `alle`, waere er
 * ohne Praefix von „ganzer Handlager" nicht zu unterscheiden — `?ort=alle`
 * zaehlte den ganzen Handlager statt diesen einen Schrank, samt der
 * Korrekturbuchungen, die aus der Zaehlung folgen, und DIE SEITE SAEHE DABEI
 * RICHTIG AUS.
 *
 * ⚠️ DAS PRAEFIX GEHOERT AN DIE KENNUNG UND NICHT AN DEN WAECHTER, und das ist
 * die ganze Entscheidung. Ein Waechter `alle:ganz` waere nur ein zweiter Name
 * fuer dasselbe Problem: auch ihn koennte ein importierter Schrank woertlich
 * tragen. Erst wenn JEDE Kennung in ihren eigenen Namensraum wandert, ist der
 * Waechter nachweislich ausserhalb — nicht nur unwahrscheinlicherweise.
 *
 * ⚠️ KEIN TOR SIEHT DEN RUECKFALL: `typecheck` prueft eine gueltige
 * Zeichenkette, `build` serialisiert sie klaglos, und ein Test bliebe gruen,
 * solange kein Ort so heisst. Nur ein Import mit genau dieser Kennung zeigt es
 * — und dann als falsch gezaehlten Bestand, nicht als Fehlermeldung.
 */
const ORT_PRAEFIX = "ort:";

/**
 * Die Ortskennung → der Wert, der in Auswahl und URL steht. `null` ist der
 * ganze Handlager.
 *
 * ⚠️ JEDE STELLE, DIE EINEN ORT ALS WERT SCHREIBT, GEHT HIER DURCH — auch der
 * `key` der Insel in `inventur/page.tsx`. Er ist kein Formkram, sondern der
 * Riegel gegen eine falsche Buchung (Begruendung dort); baute er seinen Wert
 * selbst, traege der Schrank `alle` denselben Schluessel wie „ganzer
 * Handlager", und React behielte beim Wechsel den Zaehlstand.
 */
export function zaehlOrtWert(ortId: string | null): string {
  return ortId === null ? ZAEHLORT_ALLE : `${ORT_PRAEFIX}${ortId}`;
}

/**
 * Die Wurzel als Zaehlort. Der Name des Lagerorts („Handlager") waere hier
 * IRREFUEHREND: er stuende fuer denselben Bereich wie „ganzer Handlager", und
 * im Verlauf liesse sich beides nicht mehr auseinanderhalten.
 */
export const ZAEHLORT_WURZEL_LABEL = "Nicht zugeordnet";

/**
 * Ein waehlbarer Zaehlort — `id` ist `null` („ganzer Handlager"), `HANDLAGER_ID`
 * oder ein Schrank; `schluessel` ist derselbe Ort als Wert der Auswahl.
 *
 * ⚠️ `null` UND NICHT `ZAEHLORT_ALLE` (DRK-371). `id` ist der ROHE
 * Datenbankwert; stuende der Waechter mit darin, traege der Schrank mit der
 * Kennung `alle` denselben Eintrag wie „ganzer Handlager" — und die Auswahl
 * haette zwei Zeilen, die auf denselben Wert zeigen.
 *
 * ⚠️ `schluessel` STEHT DANEBEN UND WIRD NICHT AN DER ANZEIGE NACHGERECHNET.
 * Er ist der Wert des Auswahlfeldes UND der Unterscheider, mit dem
 * `eindeutigeLabels` doppelte Beschriftungen auseinanderhaelt — zwei Stellen,
 * die dasselbe meinen und deshalb dasselbe Feld lesen.
 */
export type ZaehlOrt = { id: string | null; label: string; schluessel: string };

/**
 * Die Beschriftung eines Zaehlorts — EINE Quelle fuer Auswahl, Seitentext und
 * den append-only Verlauf. Zwei Schreibweisen desselben Orts liessen den
 * Verlauf anders klingen als die Auswahl, aus der er entstanden ist.
 */
export function zaehlOrtLabel(ortId: string | null, name: string | undefined): string {
  /*
   * ⚠️ HIER STAND BIS DRK-371 EIN ZWEITER ZWEIG `ortId === ZAEHLORT_ALLE`, und
   * er war Teil derselben Ueberschneidung: ein Schrank mit der Kennung `alle`
   * hiess dadurch „Ganzer Handlager" — in der Auswahl, im Seitentext UND im
   * append-only Verlauf, wo es niemand mehr geraderuecken kann. „Ganzer
   * Handlager" ist jetzt `null` und sonst nichts.
   */
  if (ortId === null) return "Ganzer Handlager";
  if (ortId === HANDLAGER_ID) return ZAEHLORT_WURZEL_LABEL;
  return name ?? ortId;
}

/**
 * Der URL-Parameter → die Ortskennung der Datenbank. `null` heisst „ganzer
 * Handlager"; ein unbekannter Wert wird NICHT hier abgewiesen, sondern von
 * `zaehlBereich` (`lesepfade/orte.ts`), das als einziges weiss, welche Orte es
 * gibt.
 *
 * ⚠️ DER PARAMETER KANN EIN ARRAY SEIN, UND ZWAR UNABHAENGIG DAVON, WAS DIE
 * SEITE ALS TYP HINSCHREIBT. Nexts `SearchParams` ist
 * `string | string[] | undefined` (`next/dist/server/request/search-params`):
 * bei `?ort=a&ort=b` kommt ein Array an, und ein `.trim()` darauf wirft — HTTP
 * 500 fuer die ganze Inventurseite. Eine engere Signatur an der Seite aendert
 * den Laufzeitwert nicht, `typecheck` und `build` bleiben gruen, und nur ein
 * echter Abruf mit doppeltem Parameter zeigt es. Deshalb nimmt DIESE Funktion
 * die ganze Form entgegen — sie ist die einzige Stelle, die den Rohwert liest.
 *
 * ⚠️ ZWEI VERSCHIEDENE ORTE SIND KEINE WAHL, SONDERN EIN WIDERSPRUCH. Ein Lauf
 * zaehlt genau einen Ort; den ersten zu nehmen hiesse, sich still fuer eine von
 * zwei Anweisungen zu entscheiden, und die Erwartungszahlen daneben gaeben
 * keinen Hinweis darauf, welche. Deshalb faellt der Widerspruch auf die
 * Vorgabe zurueck — wie ein unbekannter Ort. Derselbe Ort mehrfach ist dagegen
 * eine Wahl und wird genommen.
 */
export function zaehlOrtAus(roh: string | string[] | undefined): string | null {
  /*
   * ⚠️ ENTDOPPELT WIRD NACH DEM AUFLOESEN, NICHT DAVOR (DRK-371). Heute faellt
   * beides zusammen — `ort:x` ist die einzige Schreibweise —, aber die
   * Reihenfolge ist die richtige: verglichen wird, was GEMEINT ist, nicht, wie
   * es geschrieben steht. Andersherum waere jede kuenftige zweite Schreibweise
   * ein „Widerspruch" zwischen einem Ort und sich selbst.
   */
  const werte = [...new Set(
    (Array.isArray(roh) ? roh : [roh])
      .map((wert) => ortAusWert(wert))
      .filter((id): id is string => id !== null),
  )];
  return werte.length === 1 ? werte[0]! : null;
}

/**
 * Ein einzelner Rohwert → die Ortskennung, oder `null` fuer „ganzer Handlager".
 * NUR `ort:<kennung>` waehlt einen Ort; alles andere ist die Vorgabe.
 *
 * ⚠️ EIN HARTER SCHNITT, UND DIE ERSTE FASSUNG DIESES TICKETS WAR WEICHER —
 * das war ein Fehler (P1-Befund von Codex zum PR, nachgerechnet und bestaetigt).
 * Sie las einen Wert OHNE Praefix weiter als rohe Kennung, damit alte
 * Lesezeichen gelten, und nannte das verlustfrei. Das war es nicht: fuer eine
 * Kennung, die selbst mit `ort:` beginnt, laufen beide Deutungen auseinander.
 * `?ort=ort:alle` meinte bis dahin den Schrank mit der Kennung `ort:alle` und
 * haette danach den Schrank `alle` gezaehlt — falls es den gibt, gegen den
 * falschen Bestand, und sonst gegen den ganzen Handlager.
 *
 * ⚠️ DAS IST DERSELBE FEHLER, GEGEN DEN DIESES TICKET ANGETRETEN IST, nur eine
 * Ebene hoeher: nicht mehr Waechter gegen Kennung, sondern Altform gegen neue
 * Form. Wer ihn mit „welche Kennung faengt schon mit `ort:` an?" wegwiegt, hat
 * dieselbe Begruendung benutzt, die den urspruenglichen Fehler jahrelang hat
 * stehen lassen. ZWEI DEUTUNGEN EINER ZEICHENKETTE SIND DER FEHLER, nicht die
 * unwahrscheinliche Kennung.
 *
 * ⚠️ WAS DER SCHNITT KOSTET, UND WARUM ES TRAGBAR IST: ein Lesezeichen mit
 * roher Kennung zaehlt jetzt den ganzen Handlager. Das ist nicht still — es ist
 * GENAU der Zustand, den die Seite fuer einen unbekannten Ort ohnehin einnimmt
 * (Begruendung in `inventur/page.tsx`): die Auswahl zeigt „Ganzer Handlager",
 * der Seitentext sagt es, und die Erwartungszahlen daneben sind die des ganzen
 * Handlagers. Die Ortswahl selbst ist erst mit DRK-337 entstanden.
 * Die Vorgabe `alle` gilt unveraendert weiter; ein Lesezeichen darauf bricht
 * nicht.
 */
function ortAusWert(roh: string | undefined): string | null {
  const wert = roh?.trim();
  if (!wert || !wert.startsWith(ORT_PRAEFIX)) return null;
  return wert.slice(ORT_PRAEFIX.length) || null;
}

/** Der Ortsteil des Zaehlhinweises auf der Seite — „Gezählt wird …". */
export function zaehlOrtBeschreibung(ortId: string | null, name: string | undefined): string {
  if (ortId === null) return "Gezählt wird der Bestand im gesamten Handlager, über alle Schränke hinweg.";
  if (ortId === HANDLAGER_ID) {
    return "Gezählt wird, was im Handlager noch keinem Schrank zugeordnet ist — Schrankbestand bleibt außen vor.";
  }
  return `Gezählt wird der Bestand in ${name ?? ortId}. Erwartungszahlen und Korrekturen gelten nur für diesen Schrank.`;
}

/**
 * DRK-337 — MACHT DIE BESCHRIFTUNGEN EINDEUTIG (P1-Befund von Codex zum PR).
 *
 * ⚠️ ZWEI SCHRAENKE DUERFEN HEUTE GLEICH HEISSEN: weder `createSchrank` noch
 * die Datenbank verlangen einen eindeutigen Namen (nachgesehen, nicht
 * vermutet — in `_db/migrations/` gibt es keinen Index darauf). In der Auswahl
 * stuenden dann ZWEI OPTISCH IDENTISCHE Zeilen mit verschiedenen Kennungen,
 * und die Erwartungszahlen daneben verraten nicht, welche gewaehlt ist. Wer
 * danebengreift, zaehlt den falschen Schrank — und bucht die Korrektur dorthin.
 * Das ist der teuerste stille Ausgang dieses Tickets.
 *
 * ⚠️ DIE KENNUNG IST HAESSLICH, UND SIE IST ES ABSICHTLICH. Sie erscheint NUR,
 * wo ein Name doppelt vorkommt — also nur in genau der Lage, die selbst schon
 * ein Fehler ist, und dort ist Unterscheidbarkeit mehr wert als Schoenheit.
 * Sobald Schranknamen eindeutig sind (DRK-367 ist dafuer unterwegs), greift
 * diese Funktion nie mehr und faellt nicht weiter auf.
 *
 * ⚠️ GEPRUEFT WIRD DIE GANZE LISTE, NICHT NUR DIE SCHRAENKE: ein Schrank, den
 * jemand „Nicht zugeordnet" nennt, kollidiert mit der Wurzel — dieselbe
 * Verwechslung aus einer Richtung, an die der Befund nicht gedacht hat.
 */
export function eindeutigeLabels<T extends { schluessel: string; label: string }>(
  orte: readonly T[],
): T[] {
  const einDurchgang = orte.map((o) => (
    zaehle(orte, o.label) > 1 ? { ...o, label: mitKennung(o) } : { ...o }
  ));
  /*
   * ⚠️ EIN DURCHGANG REICHT NACHWEISLICH NICHT (zweiter Codex-Befund, nachgerechnet).
   * Heissen zwei Schraenke `X` und ein dritter bereits woertlich `X (a)`, wobei
   * `a` die Kennung des ersten ist, dann erzeugt der Durchgang oben fuer den
   * ersten genau `X (a)` — und der dritte traegt das schon, wurde aber nicht
   * angefasst, weil SEIN Ausgangsname nur einmal vorkam. Gezaehlt werden die
   * ALTEN Beschriftungen; die neuen sieht dieser Durchgang nicht.
   *
   * Statt nachzubessern, bis es passt, wird die Eindeutigkeit hier BEWIESEN:
   * kollidiert danach noch etwas, bekommt JEDE Zeile ihre Kennung angehaengt.
   * Weil jede Zeichenkette dann auf ` (<eigene Kennung>)` endet und Kennungen
   * eindeutig sind, koennen zwei Ergebnisse nicht mehr gleich sein — das gilt
   * fuer jede denkbare Eingabe, nicht nur fuer die, an die wir gerade denken.
   */
  const alleVerschieden = new Set(einDurchgang.map((o) => o.label)).size === einDurchgang.length;
  return alleVerschieden ? einDurchgang : orte.map((o) => ({ ...o, label: mitKennung(o) }));
}

/**
 * ⚠️ DER UNTERSCHEIDER KOMMT VOM AUFRUFER, UND DAS IST DER GANZE FEHLER, DEN
 * DIESE ZEILE EINMAL HATTE (zweiter P1-Befund von Codex zum PR). Kurzzeitig
 * stand hier `ort.id ?? ZAEHLORT_ALLE` — womit der Waechter und ein Schrank mit
 * der Kennung `alle` WIEDER denselben Text ergaben: heisst dieser Schrank auch
 * noch „Ganzer Handlager", stuenden zwei Zeilen „Ganzer Handlager (alle)"
 * nebeneinander, und wer danebengreift, bucht die Korrektur in den falschen
 * Umfang. Also derselbe Fehler wie der des Tickets, nur in der Beschriftung.
 *
 * ⚠️ EIN FESTER TEXT FUER DEN WAECHTER HAETTE ES NICHT GEHEILT: `(Vorgabe)`
 * koennte eine importierte Kennung woertlich tragen, und ein leerer Zusatz
 * verschoebe die Kollision nur auf den naechsten Namen. Der Unterscheider muss
 * aus einem Wertebereich kommen, in dem keine zwei Eintraege gleich sind — und
 * welcher das ist, weiss nur der Aufrufer.
 *
 * ⚠️ DESHALB NICHT EINFACH DER AUSWAHLWERT FUER ALLE: `lesepfade/verfall.ts`
 * und `lesepfade/orte.ts` benutzen dieselbe Funktion, und dort waere ein
 * `ort:`-Praefix sinnlos — ihre Beschriftungen stehen neben dem Verlauf, der
 * die ROHE Kennung zeigt (`lesepfade/inventurVerlauf.ts`). Zwei Schreibweisen
 * derselben Sache sind genau das, was `zaehlOrtLabel` oben verhindert.
 */
function mitKennung(ort: { schluessel: string; label: string }): string {
  return `${ort.label} (${ort.schluessel})`;
}

function zaehle(orte: readonly { label: string }[], label: string): number {
  return orte.reduce((n, o) => (o.label === label ? n + 1 : n), 0);
}
