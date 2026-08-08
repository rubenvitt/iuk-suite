import { zeitraumAus } from "../../../_lib/format";
import { JOURNAL_GRENZE } from "../../../_lib/grenzen";
import type {
  BuchungTyp,
  JournalFilter as JournalLeseFilter,
} from "../../../_lib/lesepfade/journal";

export const TYPEN = [
  "zugang",
  "entnahme",
  "korrektur",
  "umlagerung",
] as const;

export type JournalFilterWerte = {
  q: string;
  typ: string;
  von: string;
  bis: string;
};

export type JournalRohParameter = Partial<JournalFilterWerte>;

export type JournalParameterErgebnis = {
  werte: JournalFilterWerte;
  filter: Pick<JournalLeseFilter, "q" | "typ" | "von" | "bis">;
  hinweise: string[];
  hatFilter: boolean;
};

function istBuchungTyp(wert: string | undefined): wert is BuchungTyp {
  return (TYPEN as readonly string[]).includes(wert ?? "");
}

/** Nur ein echter Kalendertag darf spaeter an dayjs/DatePicker gelangen. */
export function normalisiereJournalTag(roh: string | undefined): string {
  const getrimmt = roh?.trim() ?? "";
  return getrimmt && zeitraumAus(getrimmt).von ? getrimmt : "";
}

/**
 * Trennt rohe URL-Werte in skalare Client-Werte und den validierten SQL-Filter.
 * Ungueltige Typen oder Tage werden angezeigt als leer und erreichen den Reader
 * nicht. Zwei gueltige, umgekehrte Grenzen bleiben dagegen sichtbar: SQL liefert
 * dann ehrlich einen leeren Zeitraum und der Hinweis erklaert warum.
 */
export function journalParameterAus(
  parameter: JournalRohParameter,
): JournalParameterErgebnis {
  const q = parameter.q?.trim() ?? "";
  const typ = istBuchungTyp(parameter.typ) ? parameter.typ : undefined;
  const zeitraum = zeitraumAus(parameter.von, parameter.bis);
  const von = zeitraum.von ? parameter.von?.trim() ?? "" : "";
  const bis = zeitraum.bis ? parameter.bis?.trim() ?? "" : "";
  const werte = { q, typ: typ ?? "", von, bis };

  return {
    werte,
    filter: {
      q: q || undefined,
      typ,
      von: zeitraum.von,
      bis: zeitraum.bis,
    },
    hinweise: zeitraum.hinweise,
    hatFilter: Object.values(werte).some((wert) => wert !== ""),
  };
}

/** Bereits Getipptes geht bei einem Typ- oder Datumsklick nicht verloren. */
export function mitGetipptem(
  basis: JournalFilterWerte,
  getipptes: string,
  teil: Partial<JournalFilterWerte>,
): JournalFilterWerte {
  return { ...basis, q: getipptes.trim(), ...teil };
}

/** Der Deckeltext behauptet nur dann Unvollstaendigkeit, wenn +1 sie belegt. */
export function deckelText(gezeigt: number, mehrVorhanden: boolean): string {
  return mehrVorhanden
    ? `Neueste ${JOURNAL_GRENZE} von mehr Treffern — Zeitraum eingrenzen`
    : `${gezeigt} Treffer`;
}
