import type { AufgabeRow, RoutineRow } from "../_db/schema";
import { routineAmTag } from "./anzeige";
import { minutenVon, wochentagVon } from "./datum";

/*
 * DIE ORDNUNG EINES TAGES — DIE ANKER-REGEL (Spec §8.1: "Feste Uhrzeiten
 * stehen in einer eigenen Spur links am Eintrag und verankern ihn; freie
 * Eintraege ordnen sich davor und dahinter ein"). KEIN "use client".
 *
 * DIE REGEL: ein Eintrag MIT Uhrzeit ist ein ANKER und zeigt sie. Ein Eintrag
 * OHNE Uhrzeit ERBT die Uhrzeit des vorangehenden Ankers und sortiert
 * DAHINTER — zeigt aber KEINE Uhrzeit, weil er keine hat. Damit sitzt eine
 * freie Aufgabe ZWISCHEN zwei festen Bloecken, statt am Tagesende zu
 * sammeln — der Unterschied zwischen einem benutzbaren Tag und einer Liste,
 * in der alles Ungeplante hinten liegt.
 */

/** Die Uhrzeit, bevor irgendein Anker gesetzt wurde — 08:00. */
export const TAGESBEGINN_MINUTEN = 480;

export interface TagesEintrag {
  art: "aufgabe" | "routine";
  id: string;
  titel: string;
  /** Die Uhrzeit, an der der Eintrag einsortiert ist — geerbt, wenn `zeigtUhrzeit` falsch ist. */
  minuten: number;
  /** Nur echte Anker zeigen ihre Uhrzeit an. */
  zeigtUhrzeit: boolean;
  dauerMinuten: number;
  /** Nur bei `art === "aufgabe"` gesetzt. */
  aufgabe?: AufgabeRow;
}

/**
 * Die Ordnung eines Tages fuer eine Person: Aufgaben und Routinen zusammen,
 * in der Reihenfolge, in der sie am Tag stehen.
 *
 * DIE DREI SCHRITTE, UND IHRE REIHENFOLGE IST TRAGEND:
 *
 * 1. Aufgaben nach `planRang` sortieren und dabei die geerbte Uhrzeit
 *    (`minuten`) MITFUEHREN — ein einziger Vorwaertslauf ueber die bereits
 *    nach `planRang` sortierte Liste. Jeder Eintrag mit `planUhrzeit` setzt
 *    den Anker (`ankerMinuten`) NEU, jeder ohne uebernimmt den zuletzt
 *    gesetzten. GENAU DAS ist es, was die Ergebnisliste hier schon in der
 *    RICHTIGEN Relativordnung entstehen laesst — ein Anker steht in diesem
 *    Zwischenergebnis immer VOR jedem Eintrag, der von ihm erbt, weil beide
 *    aus demselben Vorwaertslauf ueber dieselbe sortierte Liste stammen.
 * 2. Routinen des Wochentags unabhaengig davon nach ihrer EIGENEN Uhrzeit
 *    sortieren (eine Routine ohne Uhrzeit faellt auf `TAGESBEGINN_MINUTEN`
 *    zurueck, wie ein freier Eintrag vor dem ersten Anker — Routinen haben
 *    keinen `planRang`, also nichts, von dem sie erben koennten).
 * 3. Routinen ZUERST ins Ergebnisfeld, dann die Aufgaben, dann STABIL nach
 *    `minuten` sortieren.
 *
 * SCHRITT 3 IST DIE STELLE, AN DER ES KIPPT — ABER NICHT GENAU SO, WIE DER
 * BRIEF DEN FEHLER BESCHREIBT. Der Brief sagt: "vertauscht [Routinen/Aufgaben
 * im Feld] rutscht eine freie Aufgabe vor ihren eigenen Anker." Das allein
 * ist NICHT erreichbar: `Array.prototype.sort` ist laut ES2019-Spezifikation
 * stabil, und ein Anker samt seinem freien Nachfolger liegen BEIDE im selben
 * `aufgabenEintraege`-Block — Konkatenation verschraenkt die beiden Bloecke
 * nie miteinander, also aendert die Frage "Routinen oder Aufgaben zuerst"
 * an der Relativordnung INNERHALB eines Blocks nichts. Der tatsaechlich
 * erreichbare Fehler liegt in Schritt 1, nicht in der Blockreihenfolge von
 * Schritt 3 — er WIRD an einem Gleichstand in Schritt 3 nur SICHTBAR (siehe
 * unten). Der Test unten deckt trotzdem beides ab: einen echten Gleichstand
 * zwischen einer Routine und einem Anker UND die Anker-vor-Nachfolger-Zusage
 * — vertauschte Blockreihenfolge aendert bei diesem Test sichtbar, wo die
 * Routine landet, auch wenn sie den Anker nicht ueberholt.
 *
 * Der Fehler entsteht,
 * wenn Schritt 1 NICHT als Vorwaertslauf ueber die planRang-sortierte Liste
 * gebaut wird, sondern die Aufgaben in ihrer urspruenglichen (unsortierten)
 * Feldreihenfolge in die Ergebnisliste wandern und man sich darauf verlaesst,
 * dass der abschliessende Sortierschritt das schon richtet: bei
 * UNTERSCHIEDLICHEN Minutenwerten stimmt das, bei GLEICHEN nicht — der stabile
 * Sortierschritt aendert an gleichen Werten nichts und schreibt die falsche
 * Ausgangsreihenfolge einfach fest. Ein Anker und sein eigener freier
 * Nachfolger TEILEN sich immer denselben `minuten`-Wert (der Nachfolger ERBT
 * ihn) — genau deshalb faengt kein anderer Test diesen Fehler, nur der
 * Gleichstandsfall selbst kann es (siehe `tagesplan.test.ts`, "der
 * Gleichstandsfall").
 */
export function tagesOrdnung(
  aufgaben: AufgabeRow[],
  routinen: RoutineRow[],
  personId: string,
  datum: string,
): TagesEintrag[] {
  // Schritt 1. GEFILTERT WIRD NUR NACH PERSON UND TAG, BEWUSST NICHT NACH
  // `status` — dieselbe Zusage wie `tagesBudget` ("ALLE ZUSTAENDE ZAEHLEN,
  // auch abgeschlossen"). `Wochenplan.tsx` rendert Ordnung UND Budget aus
  // demselben Tag; ein Statusfilter hier, den `tagesBudget` nicht hat, zeigte
  // eine Spalte mit z. B. zwei sichtbaren Eintraegen unter einem Budget fuer
  // drei — sichtbar konsistent, in Wahrheit falsch.
  const aufgabenDesTags = aufgaben
    .filter((a) => a.zugewiesenAn === personId && a.planDatum === datum)
    .slice()
    .sort((a, b) => a.planRang - b.planRang);

  let ankerMinuten = TAGESBEGINN_MINUTEN;
  const aufgabenEintraege: TagesEintrag[] = aufgabenDesTags.map((a) => {
    const istAnker = a.planUhrzeit !== null;
    if (istAnker) ankerMinuten = minutenVon(a.planUhrzeit as string);
    return {
      art: "aufgabe",
      id: a.id,
      titel: a.titel,
      minuten: ankerMinuten,
      zeigtUhrzeit: istAnker,
      dauerMinuten: a.dauerMinuten,
      aufgabe: a,
    };
  });

  // Schritt 2.
  const wochentag = wochentagVon(datum);
  const routinenDesTags =
    wochentag === null ? [] : routinen.filter((r) => r.personId === personId && routineAmTag(r, wochentag));

  const routinenEintraege: TagesEintrag[] = routinenDesTags
    .map((r): TagesEintrag => {
      const zeigtUhrzeit = r.uhrzeit !== null;
      return {
        art: "routine",
        id: r.id,
        titel: r.titel,
        minuten: zeigtUhrzeit ? minutenVon(r.uhrzeit as string) : TAGESBEGINN_MINUTEN,
        zeigtUhrzeit,
        dauerMinuten: r.dauerMinuten,
      };
    })
    .sort((a, b) => a.minuten - b.minuten);

  // Schritt 3 — Reihenfolge im Feld MATTERS nur, weil `sort` stabil ist.
  return [...routinenEintraege, ...aufgabenEintraege].sort((a, b) => a.minuten - b.minuten);
}
