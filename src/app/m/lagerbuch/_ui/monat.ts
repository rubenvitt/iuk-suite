import type { Dayjs } from "dayjs";

/** Hält den Dayjs-Wert des antd-Pickers an einer directive-freien Grenze. */
export function monatAusPicker(wert: Dayjs | null | undefined): string | undefined {
  return wert?.format("YYYY-MM");
}

/**
 * IDA-378 — DIE SCHREIBWEISEN, DIE DAS MONATSFELD ANNIMMT. Die erste ist die
 * Anzeige. Vorher stand hier allein „YYYY-MM", und ein getipptes „01/2020"
 * verwarf der Picker beim Verlassen still.
 *
 * ⚠️ DIESELBE LISTE WIE `monatAusText`: der Picker parst mit diesen Formaten
 * (dayjs, strikt), die Feldmeldung entscheidet mit `monatAusText`. Laufen beide
 * auseinander, nimmt das eine an, was das andere als ungueltig meldet.
 */
export const MONAT_FORMATE = ["MM/YYYY", "M/YYYY", "MM.YYYY", "M.YYYY", "YYYY-MM"];

/**
 * Getippter Monat → „YYYY-MM", oder `undefined`, wenn der Text keiner der
 * `MONAT_FORMATE` ist. Leerer Text ist ebenfalls `undefined`.
 */
export function monatAusText(text: string): string | undefined {
  const t = text.trim();
  const vorn = /^(\d{1,2})[/.](\d{4})$/.exec(t);
  const hinten = /^(\d{4})-(\d{2})$/.exec(t);
  const [jahr, monat] = vorn ? [vorn[2]!, vorn[1]!] : hinten ? [hinten[1]!, hinten[2]!] : [];
  if (!jahr || !monat) return undefined;
  const m = Number(monat);
  if (m < 1 || m > 12) return undefined;
  return `${jahr}-${String(m).padStart(2, "0")}`;
}

/** IDA-403 — die Feldmeldung fuer einen getippten Nicht-Monat, in jedem Monatsfeld gleich. */
export function keinMonat(text: string): string {
  return `„${text}“ ist kein Monat. Bitte als MM/JJJJ eingeben.`;
}
