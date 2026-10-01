import { zeitFormat } from "@/core/zeit";
import { LAENGE } from "./plan/schema";

/**
 * TAGESFASSUNGEN (Spec §2 „Tagesfassungen sind Fast-Kopien", §6.7; Umsetzungsplan Phase 4, Entscheidung 9).
 * Rein und ohne Uhr: „jetzt" kommt als Argument. `zeitFormat` löst die Suite-Zone erst beim Formatieren auf
 * (auf Modulebene erlaubt, CLAUDE.md „Zeitzone"); `en-CA` liefert `YYYY-MM-DD`.
 */
const TAG = zeitFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });

export function heuteIso(jetzt: number): string {
  return TAG.format(jetzt);
}

/** `T.M.JJJJ`, `TT.MM.JJJJ`, `TT.MM.JJ` oder `JJJJ-MM-TT` — nicht mitten in einer längeren Zahlenfolge. */
const DATUM = /(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?![\d])|(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d])/g;
const plausibel = (tag: number, monat: number) => monat >= 1 && monat <= 12 && tag >= 1 && tag <= 31;

/** Das ERSTE plausible Datum in derselben Schreibweise durch `heute` ersetzt; `null`, wenn keines da ist. */
export function ersetzeDatumImTitel(titel: string, heute: string): string | null {
  const [j, m, t] = heute.split("-");
  for (const r of titel.matchAll(DATUM)) {
    let neu: string;
    if (r[1] !== undefined) {
      if (!plausibel(Number(r[1]), Number(r[2]))) continue;
      const fuehrend = r[1].length === 2 || r[2].length === 2;
      const tt = fuehrend ? t : String(Number(t));
      const mm = fuehrend ? m : String(Number(m));
      neu = `${tt}.${mm}.${r[3].length === 2 ? j.slice(2) : j}`;
    } else {
      if (!plausibel(Number(r[6]), Number(r[5]))) continue;
      neu = heute;
    }
    return titel.slice(0, r.index) + neu + titel.slice(r.index! + r[0].length);
  }
  return null;
}

/** Titel der Kopie: Datum ersetzt, sonst „ (Kopie)"; würde er länger als erlaubt, bleibt er, wie er war (nie gekürzt). */
export function titelFuerKopie(titel: string, heute: string): string {
  const neu = ersetzeDatumImTitel(titel, heute) ?? `${titel} (Kopie)`;
  return neu.length <= LAENGE.titel ? neu : titel;
}
