import { zeitraumAus } from "../../../_lib/format";
import { JOURNAL_SUCHE_MAX } from "../../../_lib/grenzen";
import type { JournalFilter as JournalLeseFilter } from "../../../_lib/lesepfade/journal";
import { VORGANG_ARTEN, type Vorgangsart } from "../../../_lib/vorgang";

export { VORGANG_ARTEN };

export type JournalFilterWerte = {
  q: string;
  /**
   * ⚠️ DER SCHLUESSEL HEISST WEITER `typ`, DER WERT IST ABER EINE VORGANGSART
   * (DRK-344). Das ist kein Versehen: dieser Name steht in der ADRESSZEILE, und
   * das Journal wird ausdruecklich als gespeicherter Zeitraumbericht verlinkt
   * (`zeitraumAus`). Eine Umbenennung liesse jeden bestehenden Link still
   * ungefiltert auflaufen — die Adresszeile zeigte einen Filter, die Tabelle
   * die ganze Historie. Der neue Name gilt ab dem Lesepfad (`filter.vorgang`);
   * uebersetzt wird genau hier, an der einen Naht.
   */
  typ: string;
  von: string;
  bis: string;
};

export type JournalRohParameter = Partial<JournalFilterWerte>;

export type JournalParameterErgebnis = {
  werte: JournalFilterWerte;
  filter: Pick<JournalLeseFilter, "q" | "vorgang" | "von" | "bis">;
  hinweise: string[];
  hatFilter: boolean;
};

function istVorgangsart(wert: string | undefined): wert is Vorgangsart {
  return (VORGANG_ARTEN as readonly string[]).includes(wert ?? "");
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
  // ⚠️ GEKAPPT, NICHT NUR GETRIMMT — dieselbe Grenze, die `_actions/journal.ts`
  // prueft. Ohne das Kappen nimmt der erste Aufschlag einen laengeren Begriff an
  // und jeder Nachschlag weist ihn ab; die Tabelle stuende dann auf den ersten
  // hundert Treffern und meldete beim Weiterblaettern dauerhaft einen Fehler.
  const q = (parameter.q?.trim() ?? "").slice(0, JOURNAL_SUCHE_MAX);
  const vorgang = istVorgangsart(parameter.typ) ? parameter.typ : undefined;
  const zeitraum = zeitraumAus(parameter.von, parameter.bis);
  const von = zeitraum.von ? parameter.von?.trim() ?? "" : "";
  const bis = zeitraum.bis ? parameter.bis?.trim() ?? "" : "";
  const werte = { q, typ: vorgang ?? "", von, bis };

  return {
    werte,
    filter: {
      q: q || undefined,
      vorgang,
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
/**
 * Der Zaehltext unter der Ueberschrift.
 *
 * ⚠️ SEIT DRK-331 IST DER DECKEL KEINE GRENZE MEHR, SONDERN EINE PORTIONSGROESSE.
 * Frueher stand hier „Neueste 100 von mehr Treffern — Zeitraum eingrenzen": eine
 * Aufforderung, weil der Rest unerreichbar war. Er ist jetzt erreichbar, man
 * scrollt einfach weiter — die Aufforderung waere schlicht falsch geworden, und
 * eine falsche Aufforderung ist schlimmer als gar keine.
 *
 * `JOURNAL_GRENZE` kommt deshalb im Text nicht mehr vor. Die Zahl war nie eine
 * Aussage ueber die Daten, sondern ueber die Abfrage; sie gehoert nicht auf den
 * Schirm.
 */
export function deckelText(gezeigt: number, mehrVorhanden: boolean): string {
  const treffer = gezeigt === 1 ? "1 Treffer" : `${gezeigt} Treffer`;
  return mehrVorhanden ? `${treffer} geladen — weitere beim Scrollen` : treffer;
}
