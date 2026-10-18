/**
 * DIE REITER DES EINHEITENBLATTS UND DIE STATUSFILTER DER BESTANDSLISTE
 * (IDA-232) — Werte, die Server UND Client lesen.
 *
 * ⚠️ KEIN "use client" (Falle 6). Die Server Component baut aus `blattAdresse`
 * die Ziele der Kacheln; stünde diese Datei als Client-Modul da, käme die
 * Funktion dort als Client-Referenz an — HTTP 500 für das ganze Blatt, das
 * weder `build` noch Vitest sieht.
 *
 * ⚠️ DER REITER STEHT IN DER ADRESSE (`?reiter=…`), nicht nur im Zustand: so
 * führen Zurück, ein Lesezeichen und der Link aus einer Kachel auf denselben
 * Reiter. Der Startreiter steht NICHT in der Adresse — die bisherigen Links auf
 * das Blatt (Liste, Verfallsseite, Zugangs-Codes) landen damit unverändert dort,
 * wo das Tagesgeschäft liegt.
 */
import { verwaltungDetailPfad } from "../../../../_lib/verwaltungPfad";

export const REITER = ["bestand", "soll", "plomben", "einstellungen"] as const;
export type ReiterSchluessel = (typeof REITER)[number];

/** Tagesgeschäft vor Einrichtung: das Blatt öffnet auf Bestand und Verfall. */
export const START_REITER: ReiterSchluessel = "bestand";

export function reiterAus(wert: string | null | undefined): ReiterSchluessel {
  return (REITER as readonly string[]).includes(wert ?? "")
    ? (wert as ReiterSchluessel)
    : START_REITER;
}

/**
 * Die Statusfilter der Bestandsliste. „auffaellig" fasst die drei Zustände
 * zusammen, die die Liste ohnehin nach oben sortiert.
 *
 * ⚠️ DIE WÖRTER IM SCHIRM SIND DIE CHIPTEXTE DER FAHRZEUGLISTE („abgelaufen",
 * „läuft ab", „unter Soll") — dieselbe Festlegung wie an den Kacheln: zwei
 * Namen für einen Zustand lassen den Leser einen dritten vermuten.
 */
export const STATUS_FILTER = [
  "auffaellig",
  "abgelaufen",
  "laeuft-ab",
  "unter-soll",
  "nicht-erfasst",
] as const;
export type StatusFilter = (typeof STATUS_FILTER)[number];

export const STATUS_TEXT: Record<StatusFilter, string> = {
  auffaellig: "auffällig",
  abgelaufen: "abgelaufen",
  "laeuft-ab": "läuft ab",
  "unter-soll": "unter Soll",
  "nicht-erfasst": "nicht erfasst",
};

export function statusAus(wert: string | null | undefined): StatusFilter | null {
  return (STATUS_FILTER as readonly string[]).includes(wert ?? "")
    ? (wert as StatusFilter)
    : null;
}

/**
 * Die Adresse eines Reiters, optional mit gesetztem Statusfilter.
 *
 * ⚠️ ÜBER `verwaltungDetailPfad`, nie handgeschrieben: der Pfad im Browser ist
 * `/verwaltung/…`, nicht der interne `/m/lagerbuch/…` (Begründung dort).
 */
export function blattAdresse(
  id: string,
  reiter: ReiterSchluessel,
  status?: StatusFilter,
): string {
  const parameter = new URLSearchParams();
  if (reiter !== START_REITER) parameter.set("reiter", reiter);
  if (status) parameter.set("status", status);
  const abfrage = parameter.toString();
  const pfad = verwaltungDetailPfad("fahrzeuge", id);
  return abfrage ? `${pfad}?${abfrage}` : pfad;
}
