import type { AufgabeRow, PersonRow, Prioritaet, RoutineRow, Status } from "../_db/schema";
import { wochentagVon } from "./datum";

/*
 * BESCHRIFTUNGEN UND ABLEITUNGEN — die eine Quelle. KEIN "use client": jede
 * Server Component liest diese Konstanten, und aus einem Client-Modul kaeme eine
 * Client-Referenz statt des Objekts.
 *
 * WARUM DIE ABLEITUNGEN HIER LIEGEN UND NICHT IN DEN SEITEN: „ueberfaellig" und
 * „Zeitvorschlag offen" erscheinen je auf mehreren Seiten UND in einer
 * KPI-Kachel. Zwei Fassungen derselben Bedingung laufen auseinander, und der
 * Fehler ist nicht sichtbar kaputt, sondern nur falsch: die Kachel zaehlt drei,
 * die Liste zeigt zwei, und beide Zahlen sehen richtig aus.
 */

/** Die fuenf Toene der Zustands-Chips. Jeder loest sich in ein Paar `--auf-<ton>-text/-flaeche` auf. */
export type ChipTon = "grau" | "stahl" | "ocker" | "ok" | "achtung";

/** Die drei Gewichtsstufen der Prioritaet — die Rangfolge traegt die Form, nicht die Farbe. */
export type PrioritaetForm = "gefuellt" | "kontur" | "text";

export const STATUS_TEXT: Record<Status, string> = {
  eingegangen: "Zu verteilen",
  verteilt: "Verteilt",
  in_arbeit: "In Bearbeitung",
  freigabe_offen: "Freigabe offen",
  abgeschlossen: "Abgeschlossen",
  zurueckgewiesen: "Zurückgewiesen",
};

/**
 * `achtung` ist absichtlich nur EINMAL vergeben und loest sich in die getrennte
 * Ampel-Rot-Textfarbe auf, nicht in Markenrot.
 */
export const STATUS_TON: Record<Status, ChipTon> = {
  eingegangen: "grau",
  verteilt: "grau",
  in_arbeit: "stahl",
  freigabe_offen: "ocker",
  abgeschlossen: "ok",
  zurueckgewiesen: "achtung",
};

export const PRIORITAET_TEXT: Record<Prioritaet, string> = {
  hoch: "Hoch",
  mittel: "Mittel",
  niedrig: "Niedrig",
};

export const PRIORITAET_FORM: Record<Prioritaet, PrioritaetForm> = {
  hoch: "gefuellt",
  mittel: "kontur",
  niedrig: "text",
};

/**
 * „Zeitvorschlag offen" (Spec §5.1) — ein ABGELEITETER Zustand, kein siebter
 * gespeicherter. Die MITTLERE Bedingung ist die, die man vergisst: die
 * Vorschlagsfelder bleiben nach dem Einplanen stehen, damit der Verlauf belegen
 * kann, ob angenommen oder abgewichen wurde.
 */
export function vorschlagOffen(a: AufgabeRow): boolean {
  return a.status === "verteilt" && a.planDatum === null && a.vorschlagDatum !== null;
}

/**
 * Ueberfaellig heisst: die FRIST ist verstrichen und die Aufgabe ist nicht
 * abgeschlossen. Der Zeitplan spielt keine Rolle. ISO-Tagesstrings sind
 * lexikografisch vergleichbar, deshalb `<` und kein Datums-Parsen.
 */
export function istUeberfaellig(a: AufgabeRow, heute: string): boolean {
  return a.status !== "abgeschlossen" && a.faelligAm < heute;
}

/** Bit je Wochentag: Index 0 = Montag. Die Maske liegt in `routinen.wochentage`. */
export const WOCHENTAG_BIT = [1, 2, 4, 8, 16] as const;

export function routineAmTag(r: RoutineRow, wochentag: number): boolean {
  const bit = WOCHENTAG_BIT[wochentag];
  // Die Undefined-Pruefung ist nicht Zierde: ohne sie waere `wochentage & undefined`
  // eine NaN-Rechnung, die hier zufaellig 0 ergibt — kein Verhalten, auf das man baut.
  return r.aktiv && bit !== undefined && (r.wochentage & bit) !== 0;
}

export interface Budget {
  verplantMinuten: number;
  sollMinuten: number;
  ueberbucht: boolean;
}

/**
 * Das Tagesbudget einer Person: eingeplante Aufgaben plus aktive Routinen des
 * Wochentags, gegen `sollMinutenTag`.
 *
 * ALLE ZUSTAENDE ZAEHLEN, auch `abgeschlossen`: „verplant" ist eine Aussage
 * ueber den Tag, nicht ueber den Arbeitsvorrat. Ein Rueckblick auf eine
 * vergangene Woche zeigte sonst leere Tage.
 *
 * `ueberbucht` ist ECHT groesser: ein exakt gefuellter Tag ist voll, nicht
 * ueberbucht.
 */
export function tagesBudget(
  aufgaben: AufgabeRow[],
  routinen: RoutineRow[],
  person: PersonRow,
  datum: string,
): Budget {
  const wochentag = wochentagVon(datum);
  const ausAufgaben = aufgaben
    .filter((a) => a.zugewiesenAn === person.id && a.planDatum === datum)
    .reduce((summe, a) => summe + a.dauerMinuten, 0);
  const ausRoutinen =
    wochentag === null
      ? 0
      : routinen
          .filter((r) => r.personId === person.id && routineAmTag(r, wochentag))
          .reduce((summe, r) => summe + r.dauerMinuten, 0);
  const verplantMinuten = ausAufgaben + ausRoutinen;
  return {
    verplantMinuten,
    sollMinuten: person.sollMinutenTag,
    ueberbucht: verplantMinuten > person.sollMinutenTag,
  };
}

/** „45 Min." · „1 Std." · „1,5 Std." */
export function fmtDauer(minuten: number): string {
  if (minuten < 60) return `${minuten} Min.`;
  return `${fmtStunden(minuten)} Std.`;
}

/**
 * „7,8" · „2" · „2,75". `toFixed(2)` statt `toLocaleString`, damit die Rundung
 * nicht von der ICU-Fassung des Laufzeitsystems abhaengt.
 */
export function fmtStunden(minuten: number): string {
  return (minuten / 60)
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}
