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
 */
export const ZAEHLORT_ALLE = "alle";

/**
 * Die Wurzel als Zaehlort. Der Name des Lagerorts („Handlager") waere hier
 * IRREFUEHREND: er stuende fuer denselben Bereich wie „ganzer Handlager", und
 * im Verlauf liesse sich beides nicht mehr auseinanderhalten.
 */
export const ZAEHLORT_WURZEL_LABEL = "Nicht zugeordnet";

/** Ein waehlbarer Zaehlort — `id` ist `ZAEHLORT_ALLE`, `HANDLAGER_ID` oder ein Schrank. */
export type ZaehlOrt = { id: string; label: string };

/**
 * Die Beschriftung eines Zaehlorts — EINE Quelle fuer Auswahl, Seitentext und
 * den append-only Verlauf. Zwei Schreibweisen desselben Orts liessen den
 * Verlauf anders klingen als die Auswahl, aus der er entstanden ist.
 */
export function zaehlOrtLabel(ortId: string | null, name: string | undefined): string {
  if (ortId === null || ortId === ZAEHLORT_ALLE) return "Ganzer Handlager";
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
  const werte = [...new Set(
    (Array.isArray(roh) ? roh : [roh])
      .map((wert) => wert?.trim())
      .filter((wert): wert is string => Boolean(wert) && wert !== ZAEHLORT_ALLE),
  )];
  return werte.length === 1 ? werte[0]! : null;
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
export function eindeutigeLabels(orte: readonly ZaehlOrt[]): ZaehlOrt[] {
  const haeufigkeit = new Map<string, number>();
  for (const o of orte) haeufigkeit.set(o.label, (haeufigkeit.get(o.label) ?? 0) + 1);
  return orte.map((o) => (
    (haeufigkeit.get(o.label) ?? 0) > 1 ? { ...o, label: `${o.label} (${o.id})` } : { ...o }
  ));
}
