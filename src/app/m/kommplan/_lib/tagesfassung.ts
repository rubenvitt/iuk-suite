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

/**
 * `T.M.JJJJ`, `TT.MM.JJJJ`, `TT.MM.JJ` oder `JJJJ-MM-TT` — nicht mitten in einer längeren Zahlenfolge. Ein
 * Bindestrich davor ist erlaubt („OpenR-2022-07-01"), nur nicht nach einer Ziffer („1-2022-07-01"). Das
 * zweistellige Jahr nur mit zweistelligem Tag und Monat: `1.2.10` ist eine Versions- oder Abschnittsnummer.
 */
const DATUM = /(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?![\d])|(?<!\d)(?<!\d-)(\d{4})-(\d{2})-(\d{2})(?![\d])/g;
const plausibel = (tag: number, monat: number) => monat >= 1 && monat <= 12 && tag >= 1 && tag <= 31;

/** Das ERSTE plausible Datum in derselben Schreibweise durch `heute` ersetzt; `null`, wenn keines da ist. */
export function ersetzeDatumImTitel(titel: string, heute: string): string | null {
  const [j, m, t] = heute.split("-");
  for (const r of titel.matchAll(DATUM)) {
    let neu: string;
    if (r[1] !== undefined) {
      if (!plausibel(Number(r[1]), Number(r[2]))) continue;
      if (r[3].length === 2 && (r[1].length !== 2 || r[2].length !== 2)) continue;
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

/**
 * Was mit dem Titel der Kopie geschah — der Editor sagt es im Kopie-Hinweis weiter (Entscheidung 9: wer die
 * Fassung für morgen vorbereitet, soll sich auf den Hinweis verlassen können). `datum`: ein älteres Datum ist
 * durch heute ersetzt; `zusatz`: kein Datum zu ersetzen (keins im Titel oder schon das heutige), „ (Kopie)"
 * angehängt; `unveraendert`: das Ergebnis wäre länger als erlaubt — nie gekürzt.
 */
export type KopieTitelArt = "datum" | "zusatz" | "unveraendert";

export function titelFuerKopie(titel: string, heute: string): { titel: string; art: KopieTitelArt } {
  const ersetzt = ersetzeDatumImTitel(titel, heute);
  const [neu, art]: [string, KopieTitelArt] = ersetzt !== null && ersetzt !== titel ? [ersetzt, "datum"] : [`${titel} (Kopie)`, "zusatz"];
  return neu.length <= LAENGE.titel ? { titel: neu, art } : { titel, art: "unveraendert" };
}

/**
 * Der Kopie-Hinweis im Editor (`?kopie=<art>`): bestätigt nur, was wirklich geschah. Nur `datum` ist eine
 * Bestätigung; bei `zusatz` und `unveraendert` trägt der Titel kein heutiges Datum — das ist eine Warnung.
 */
export function kopieHinweis(art: string | undefined, tag: string): { text: string; bestaetigt: boolean } | undefined {
  if (art === undefined) return undefined;
  if (art === "datum") return { text: `Kopie angelegt — Titel und Datum stehen auf ${tag}.`, bestaetigt: true };
  if (art === "zusatz") return { text: `Kopie angelegt — das Datum steht auf ${tag}. Im Titel war kein älteres Datum zu ersetzen; er endet jetzt auf „(Kopie)“.`, bestaetigt: false };
  if (art === "unveraendert") return { text: `Kopie angelegt — das Datum steht auf ${tag}. Der Titel ist unverändert (mit „(Kopie)“ wäre er zu lang); passe ihn an.`, bestaetigt: false };
  return { text: `Kopie angelegt — das Datum steht auf ${tag}. Prüfe den Titel.`, bestaetigt: false };
}
