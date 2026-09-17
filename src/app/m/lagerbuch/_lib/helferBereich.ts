import { auditDenied } from "@/core/audit/server";
import { bereichText } from "./actionTypen";
import { ENTNAHMEBOX_ID, HANDLAGER_ID } from "./konstanten";
import { zugangsAkteur } from "./zugangHerkunft";
import type { HelferZugang } from "./helferZugang";

/**
 * DIE REICHWEITE EINES HELFER-ZUGANGS — DRK-406, erweitert durch DRK-417.
 *
 * Diese Datei steht in einer EIGENEN Datei statt in `_lib/helferZugang.ts`, wo
 * sie thematisch hingehörte. Der Grund ist messbar, nicht ästhetisch:
 * `helferZugang.ts` importiert `next/headers`, `next/navigation` und die
 * Auth-Kette. Jede Action, die es benutzt, ersetzt es im Test durch
 * `vi.mock(…)` mit genau den zwei, drei Exporten, die sie ruft — und ein dort
 * NICHT nachgebildeter Export ist kein Typfehler, sondern ein Laufzeitabbruch
 * mitten im Lauf („No export is defined on the mock"). Gemessen: ein
 * `nurEntnahmeAbweisung` in jener Datei riss 49 Zusicherungen in
 * `check.test.ts` und 28 in `entnahmebox.test.ts` auf einen Schlag.
 *
 * ⚠️ DER TYP-IMPORT AUS `helferZugang.ts` IST KEIN RÜCKFALL IN DIESE KETTE:
 * `import type` wird beim Übersetzen gestrichen, die erzeugte Datei importiert
 * nichts von dort. Was diese Datei zur LAUFZEIT zieht, ist `core/audit/server`
 * und `zugangHerkunft.ts` — beides ohne `next/headers`, beides in keiner
 * Attrappe ersetzt.
 *
 * ⚠️ DER AUSWEG WÄRE NICHT, DIE ATTRAPPEN NACHZUZIEHEN. Man kann in jeder
 * Attrappe ein `bereichsAbweisung: () => null` ergänzen — und hat damit den
 * Riegel in jedem dieser Tests ABGESCHALTET, ohne dass eine Zeile davon
 * spricht. Die Zusicherung „der Regal-Code kommt hier nicht durch" prüfte dann
 * eine Funktion, die im Test gar nicht läuft. Hier, ohne Next-Importe, braucht
 * niemand eine Attrappe, und jede Action misst den echten Riegel.
 *
 * KEIN "use client" (Falle 6), kein Icon-Import (Falle 7).
 */

/**
 * DIE DREI BEREICHE DES HELFER-ASTS — und zugleich die drei Reiter.
 *
 * ⚠️ DIE REIHENFOLGE IST DIE DER REITERLEISTE (`_ui/HelferRahmen.tsx`), nicht
 * die der Häufigkeit. Sie ist damit auch die Reihenfolge, in der eine
 * Reichweite geschrieben wird — zwei Schreibweisen derselben Menge wären in
 * jedem Vergleich und in jedem Test eine Fehlerquelle ohne Gewinn.
 */
export const BEREICHE = ["entnahme", "box", "check"] as const;
export type Bereich = (typeof BEREICHE)[number];

/**
 * WAS EIN ZUGANG ÖFFNEN DARF. Eine Menge, geschrieben in der Reihenfolge von
 * `BEREICHE`.
 */
export type Reichweite = readonly Bereich[];

/** Alles — das angemeldete Konto und das Altbestands-Kärtchen ohne Ortsbezug. */
export const VOLLE_REICHWEITE: Reichweite = BEREICHE;

/**
 * DIE REICHWEITE EINES ORTSCODES — DRK-417, und der Kern des Tickets.
 *
 * Bis hierher war die Frage ein Ja/Nein („darf nur entnehmen"), und damit
 * bekam die Karte am Fahrzeug alles: Check, Box UND die Entnahme aus dem
 * Handlager. Wer am Fahrzeug stand, konnte mit einem Fehlgriff aus dem Regal
 * buchen, ohne je am Regal gewesen zu sein.
 *
 * DIE VIER FÄLLE, und jeder hängt an der `ort_id` der Token-Zeile:
 *
 *   Handlager   → nur Entnahme. Genau dafür hängt die Karte am Regal.
 *   Entnahmebox → nur Ablegen. Wer vor der Kiste steht, gibt etwas ab.
 *   Einheit     → Check UND Box. Die Betreiberentscheidung vom 17.09.2026:
 *                 der Überschuss fällt AM FAHRZEUG auf, und ihn erst in der
 *                 Halle buchen zu lassen hieße, ihn zu vergessen.
 *   ohne Ort    → alles. Altbestand, siehe unten.
 *
 * ⚠️ „ALLES ANDERE IST EINE EINHEIT" IST KEINE ANNAHME, SONDERN DIE MENGE AUS
 * `etikettOrte`. Nur sie erzeugt Ortscodes (`stelleOrtCodesSicher` läuft über
 * genau diese Zeilen), und sie führt den Handlager, die Entnahmebox und
 * `typ = "fahrzeug"` — sonst nichts. Ein fünfter Ort müsste also erst dort
 * hinein, und dann ist DIESE Funktion die Stelle, an der es auffällt.
 * `helferBereich.test.ts` hält beide Mengen zusammen.
 *
 * ⚠️ DER VERGLEICH GEHT AUF DIE `ort_id`, NICHT AUF DIE ZIELART. Ein
 * Altbestands-Kärtchen mit der Zielart „Artikel-Liste" landet auf DEMSELBEN
 * Schirm und behält trotzdem seine volle Reichweite — die Betreiberentscheidung
 * vom 17.09.2026 lautet „Altbestand bleibt gültig", und eine Ableitung über
 * `zielTyp` hätte den Kärtchen im Umlauf still die Hälfte weggenommen.
 * Eingeschränkt wird ausschließlich, was als Ortscode an einem Ort hängt.
 */
export function reichweiteAus(ortId: string | null | undefined): Reichweite {
  if (ortId === HANDLAGER_ID) return ["entnahme"];
  if (ortId === ENTNAHMEBOX_ID) return ["box"];
  if (ortId) return ["box", "check"];
  return VOLLE_REICHWEITE;
}

/** Die Frage, die Reiterleiste, Seiten und Actions alle gleich beantworten. */
export function darf(reichweite: Reichweite, bereich: Bereich): boolean {
  return reichweite.includes(bereich);
}

/**
 * WOHIN DIESER ZUGANG GEHÖRT — sein Startschirm.
 *
 * Zwei Leser, und beide brauchen dieselbe Antwort: die Landung nach dem Scan
 * (`_lib/ortZiel.ts#ortcodeZielPfad`) und der Rückweg, wenn jemand eine Fläche
 * öffnet, für die sein Code nicht gilt. Zwei Rechnungen dafür liefen
 * auseinander, sobald eine Reichweite dazukommt — und zwar still: der Redirect
 * funktionierte weiter, er führte nur woandershin als die Landung.
 *
 * ⚠️ DIE REIHENFOLGE DER ABFRAGEN IST NICHT DIE VON `BEREICHE`. Die volle
 * Reichweite enthält `check`, gehört aber auf die Artikelliste — wer angemeldet
 * ist, fängt nicht in einem Fahrzeug-Check an. Deshalb steht `entnahme` vorn.
 *
 * @param fahrzeugId  Die Einheit des Kärtchens, sonst `null`. Ohne sie führt der
 *   Weg auf die Fahrzeugwahl statt in einen bestimmten Check.
 */
export function startPfad(reichweite: Reichweite, fahrzeugId: string | null): string {
  if (darf(reichweite, "entnahme")) return "/helfer";
  if (darf(reichweite, "check")) {
    return fahrzeugId ? `/helfer/check?fz=${fahrzeugId}` : "/helfer/check";
  }
  return "/helfer/box";
}

/**
 * DER RIEGEL GEGEN DEN FALSCHEN CODE.
 *
 * Gibt eine fertige Absage zurück, wenn dieser Zugang den Bereich nicht öffnen
 * darf, sonst `null`. Aufrufer sind die vier schreibenden Helfer-Actions:
 * `bucheEntnahmeHelfer` und `waehleEntnahmeZiel` (`entnahme`), `checkAbschluss`
 * (`check`) und `bucheInEntnahmebox` (`box`).
 *
 * ⚠️ ER STEHT NICHT IN `requireHelferSchreibend`, und das ist der Grund, warum
 * es ihn überhaupt als eigene Funktion gibt: jener Riegel weiß nicht, welche
 * Fläche gerade schreibt. Er beantwortet „ist dieser Zugang gültig?", diese
 * Funktion „gilt er HIER?".
 *
 * ⚠️ UND ER IST DIE ZWEITE LINIE, NICHT DIE EINZIGE. Die Reiterleiste zeigt
 * fremde Bereiche gar nicht erst an, und die Seiten leiten um. Das reicht
 * NICHT: eine getippte Adresse ist keine Navigation, und ein selbst gebauter
 * Action-Aufruf ist nicht einmal eine Seite. Wer nur die Reiter ausblendet, hat
 * aufgeräumt und nichts verriegelt.
 *
 * ⚠️ ER PROTOKOLLIERT, UND ZWAR HIER UND NICHT AN DEN AUFRUFSTELLEN. Eine
 * abgewiesene Reichweite ist ein `access_denied` wie jede andere — dieselbe
 * Form, die `requireHelferSitzung` und `requireHelferSchreibend` vor ihrer
 * Umleitung schreiben. Vier Aufrufer, die den Eintrag selbst setzen müssten,
 * sind vier Gelegenheiten, ihn zu vergessen; und die eine vergessene wäre
 * ausgerechnet die, an der jemand mit dem falschen Code an einer fremden
 * Fläche klopft.
 *
 * ⚠️ DER AKTEUR IST DER ZUGANG, NICHT „anonym". `zugangsAkteur` macht aus einem
 * Kärtchen einen `access`-Akteur mit seiner Zeilen-Id — das ist die einzige
 * Angabe, mit der sich hinterher sagen lässt, WELCHE Karte das war. Ein
 * anonymer Eintrag wäre die Auskunft „irgendwer", und die hilft an dem Tag
 * nicht, an dem man einen Code zurücksetzen will.
 *
 * ⚠️ DESHALB NIMMT ER DEN VOLLEN `HelferZugang` UND NICHT NUR DIE REICHWEITE.
 * Ein schmalerer Parameter wäre die sauberere Abhängigkeit gewesen und hätte
 * den Akteur nicht gekannt — und ein Protokolleintrag ohne Akteur beantwortet
 * die einzige Frage nicht, für die man ihn liest.
 */
export function bereichsAbweisung(
  zugang: HelferZugang,
  bereich: Bereich,
): { ok: false; grund: "bereich"; text: string } | null {
  if (darf(zugang.reichweite, bereich)) return null;
  auditDenied("lagerbuch", zugangsAkteur(zugang), "bereich");
  return { ok: false, grund: "bereich", text: bereichText(zugang.reichweite) };
}
