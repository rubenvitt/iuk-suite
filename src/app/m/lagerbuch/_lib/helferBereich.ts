import { auditDenied } from "@/core/audit/server";
import { BEREICH_TEXT } from "./actionTypen";
import { HANDLAGER_ID } from "./konstanten";
import { zugangsAkteur } from "./zugangHerkunft";
import type { HelferZugang } from "./helferZugang";

/**
 * DIE REICHWEITE EINES HELFER-ZUGANGS — DRK-406.
 *
 * Zwei winzige Funktionen, und sie stehen in einer EIGENEN Datei statt in
 * `_lib/helferZugang.ts`, wo sie thematisch hingehörten. Der Grund ist
 * messbar, nicht ästhetisch: `helferZugang.ts` importiert `next/headers`,
 * `next/navigation` und die Auth-Kette. Jede Action, die es benutzt, ersetzt es
 * im Test durch `vi.mock(…)` mit genau den zwei, drei Exporten, die sie ruft —
 * und ein dort NICHT nachgebildeter Export ist kein Typfehler, sondern ein
 * Laufzeitabbruch mitten im Lauf („No export is defined on the mock"). Gemessen:
 * ein `nurEntnahmeAbweisung` in jener Datei riss 49 Zusicherungen in
 * `check.test.ts` und 28 in `entnahmebox.test.ts` auf einen Schlag.
 *
 * ⚠️ DER TYP-IMPORT AUS `helferZugang.ts` IST KEIN RÜCKFALL IN DIESE KETTE:
 * `import type` wird beim Übersetzen gestrichen, die erzeugte Datei importiert
 * nichts von dort. Was diese Datei zur LAUFZEIT zieht, ist `core/audit/server`
 * und `zugangHerkunft.ts` — beides ohne `next/headers`, beides in keiner
 * Attrappe ersetzt.
 *
 * ⚠️ DER AUSWEG WÄRE NICHT, DIE ATTRAPPEN NACHZUZIEHEN. Man kann in jeder
 * Attrappe ein `nurEntnahmeAbweisung: () => null` ergänzen — und hat damit den
 * Riegel in jedem dieser Tests ABGESCHALTET, ohne dass eine Zeile davon
 * spricht. Die Zusicherung „der Regal-Code kommt hier nicht durch" prüfte dann
 * eine Funktion, die im Test gar nicht läuft. Hier, ohne Next-Importe, braucht
 * niemand eine Attrappe, und jede Action misst den echten Riegel.
 *
 * KEIN "use client" (Falle 6), kein Icon-Import (Falle 7).
 */

/**
 * DARF DIESER ORTSCODE NUR ENTNEHMEN?
 *
 * `true` für den Ortscode des HANDLAGERS und sonst nie.
 *
 * ⚠️ DER VERGLEICH GEHT AUF DIE `ort_id`, NICHT AUF DIE ZIELART. Ein
 * Altbestands-Kärtchen mit der Zielart „Artikel-Liste" landet auf DEMSELBEN
 * Schirm und behält trotzdem seine volle Reichweite — die Betreiberentscheidung
 * vom 17.09.2026 lautet „Altbestand bleibt gültig", und eine Ableitung über
 * `zielTyp` hätte den Kärtchen im Umlauf still die Hälfte weggenommen.
 */
export function nurEntnahmeAus(ortId: string | null | undefined): boolean {
  return ortId === HANDLAGER_ID;
}

/**
 * DER RIEGEL GEGEN DEN REGAL-CODE.
 *
 * Gibt eine fertige Absage zurück, wenn dieser Zugang nur entnehmen darf, sonst
 * `null`. Aufrufer sind die beiden schreibenden Actions außerhalb der Entnahme:
 * `checkAbschluss` und `bucheInEntnahmebox`.
 *
 * ⚠️ ER STEHT NICHT IN `requireHelferSchreibend`, und das ist der Grund, warum
 * es ihn überhaupt als eigene Funktion gibt: jener Riegel trägt AUCH die
 * Entnahme, und die muss der Regal-Code dürfen. Ein Riegel, der dort
 * verweigerte, machte die Karte am Regal wertlos.
 *
 * ⚠️ UND ER IST DIE ZWEITE LINIE, NICHT DIE EINZIGE. Die Reiterleiste zeigt Box
 * und Check gar nicht erst an, und beide Seiten leiten um. Das reicht NICHT:
 * eine getippte Adresse ist keine Navigation, und ein selbst gebauter
 * Action-Aufruf ist nicht einmal eine Seite. Wer nur die Reiter ausblendet, hat
 * aufgeräumt und nichts verriegelt.
 *
 * ⚠️ ER PROTOKOLLIERT, UND ZWAR HIER UND NICHT AN DEN VIER AUFRUFSTELLEN. Eine
 * abgewiesene Reichweite ist ein `access_denied` wie jede andere — dieselbe
 * Form, die `requireHelferSitzung` und `requireHelferSchreibend` vor ihrer
 * Umleitung schreiben. Vier Aufrufer, die den Eintrag selbst setzen müssten,
 * sind vier Gelegenheiten, ihn zu vergessen; und die eine vergessene wäre
 * ausgerechnet die, an der jemand mit dem Regal-Code an einer fremden Fläche
 * klopft.
 *
 * ⚠️ DER AKTEUR IST DER ZUGANG, NICHT „anonym". `zugangsAkteur` macht aus einem
 * Kärtchen einen `access`-Akteur mit seiner Zeilen-Id — das ist die einzige
 * Angabe, mit der sich hinterher sagen lässt, WELCHE Karte das war. Ein
 * anonymer Eintrag wäre die Auskunft „irgendwer", und die hilft an dem Tag
 * nicht, an dem man einen Code zurücksetzen will.
 *
 * ⚠️ DESHALB NIMMT ER DEN VOLLEN `HelferZugang` UND NICHT NUR `{ nurEntnahme }`.
 * Ein schmalerer Parameter wäre die sauberere Abhängigkeit gewesen und hätte
 * den Akteur nicht gekannt — und ein Protokolleintrag ohne Akteur beantwortet
 * die einzige Frage nicht, für die man ihn liest.
 */
export function nurEntnahmeAbweisung(
  zugang: HelferZugang,
): { ok: false; grund: "bereich"; text: string } | null {
  if (!zugang.nurEntnahme) return null;
  auditDenied("lagerbuch", zugangsAkteur(zugang), "bereich");
  return { ok: false, grund: "bereich", text: BEREICH_TEXT };
}
