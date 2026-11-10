/**
 * DIE FRISTRECHNUNG DER GERÄTEWARTUNG (IDA-312) — rein, ohne Datenbank und ohne Uhr: `heute` kommt als
 * Kalendertag `JJJJ-MM-TT` in der Suite-Zone herein (`_lib/heute.ts`).
 *
 * Eine Frist ist fällig nach Zeit (`monate` ab der letzten Erledigung), nach Betriebsstunden (`stunden` ab dem
 * Stand bei der letzten Erledigung) oder nach beidem — was zuerst kommt. Nie erledigt heißt überfällig. Eine
 * Prüfart auf Anlass (IDA-369) ist fällig, sobald das Gerät nach ihrer letzten Erledigung eingesetzt wurde bzw.
 * zurückkam, und bleibt es, bis jemand sie abhakt.
 *
 * Verwaltung, Telefon, „Was steht an“ und der Push lesen ALLE diese Rechnung; eine zweite liefe auseinander.
 * Kein `"use client"` (Falle 6).
 */

export type Wer = "intern" | "fachfirma" | "elektrofachkraft";
export type Zustand = "ok" | "mangel" | "defekt";
export type Stufe = "ueberfaellig" | "bald" | "ok";
/** Wann eine Prüfart auf Anlass fällig wird (IDA-369): wenn das Gerät eingesetzt wird bzw. zurückkommt. */
export type Anlass = "einsatz" | "rueckkehr";

export interface FristVorlage {
  id: string;
  name: string;
  wer: Wer;
  monate: number | null;
  stunden: number | null;
  /** Statt nach Frist fällig bei diesem Anlass; dann ohne `monate` und `stunden`. */
  anlass: Anlass | null;
}

export interface LetzteErledigung {
  am: string;
  stunden: number | null;
  /** Wann zuletzt eine Erledigung eingetragen wurde (ms) — verglichen mit dem Anlass. */
  zeit: number;
}

/** Wann das Gerät zuletzt eingesetzt wurde bzw. zurückkam (ein `eintrag` vom Typ des Anlasses). */
export interface Ereignis {
  am: string;
  zeit: number;
}

export interface FristStand {
  vorlage: FristVorlage;
  letzte: LetzteErledigung | null;
  faelligAm: string | null;
  faelligBeiStunden: number | null;
  /** Stunden bis zur Grenze, negativ = darüber. `null` ohne Stundenintervall oder ohne Stand. */
  reststunden: number | null;
  stufe: Stufe;
  text: string;
}

/** Vorwarnung: so viele Tage vor der Frist steht sie auf „bald“. */
export const BALD_TAGE = 30;
/** Vorwarnung nach Betriebsstunden. */
export const BALD_STUNDEN = 20;

export const RANG: Record<Stufe, number> = { ueberfaellig: 0, bald: 1, ok: 2 };

/** Kalendertag plus Monate; ein 31. wird im kürzeren Monat dessen Letzter. */
export function plusMonate(isoTag: string, monate: number): string {
  const [j, m, t] = isoTag.split("-").map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(t, letzter));
  return ziel.toISOString().slice(0, 10);
}

/** Tage von `heute` bis `isoTag` (negativ = vorbei). Kalendertage, keine Uhrzeit. */
export function tageBis(isoTag: string, heute: string): number {
  return Math.round((Date.parse(`${isoTag}T00:00:00Z`) - Date.parse(`${heute}T00:00:00Z`)) / 86_400_000);
}

/** `TT.MM.JJJJ`. */
export function datum(isoTag: string): string {
  const [j, m, t] = isoTag.split("-");
  return `${t}.${m}.${j}`;
}

const tage = (n: number) => (n === 1 ? "1 Tag" : `${n} Tagen`);

export function fristStand(
  vorlage: FristVorlage,
  letzte: LetzteErledigung | null,
  stundenJetzt: number | null,
  heute: string,
  ereignis: Ereignis | null = null,
): FristStand {
  if (vorlage.anlass) {
    // Nachgetragen mit einem Tag vor dem Ereignis zählt nicht, auch wenn es danach erfasst wurde.
    const faellig = !!ereignis && (!letzte || letzte.am < ereignis.am || letzte.zeit < ereignis.zeit);
    return {
      vorlage, letzte, faelligAm: faellig ? ereignis.am : null, faelligBeiStunden: null, reststunden: null,
      stufe: faellig ? "ueberfaellig" : "ok",
      text: faellig ? `${vorlage.anlass === "einsatz" ? "eingesetzt" : "zurück"} am ${datum(ereignis.am)}` : ANLASS_TEXT[vorlage.anlass],
    };
  }
  const faelligAm = letzte && vorlage.monate ? plusMonate(letzte.am, vorlage.monate) : null;
  const faelligBeiStunden = vorlage.stunden && letzte && letzte.stunden != null ? letzte.stunden + vorlage.stunden : null;
  const restTage = faelligAm ? tageBis(faelligAm, heute) : null;
  const reststunden = faelligBeiStunden != null && stundenJetzt != null ? faelligBeiStunden - stundenJetzt : null;

  let stufe: Stufe = "ok";
  if (!letzte || (restTage != null && restTage < 0) || (reststunden != null && reststunden <= 0)) stufe = "ueberfaellig";
  else if ((restTage != null && restTage <= BALD_TAGE) || (reststunden != null && reststunden <= BALD_STUNDEN)) stufe = "bald";

  let text: string;
  if (!letzte) text = "noch nie erledigt";
  else if (reststunden != null && reststunden <= 0) text = reststunden === 0 ? "Stundenintervall erreicht" : `${-reststunden} h über dem Intervall`;
  else if (restTage != null && restTage < 0) text = `seit ${tage(-restTage)} überfällig`;
  else if (reststunden != null && reststunden <= BALD_STUNDEN) text = `noch ${reststunden} Betriebsstunden`;
  else if (restTage != null && restTage <= BALD_TAGE) text = restTage === 0 ? "heute fällig" : `fällig in ${tage(restTage)}`;
  else if (faelligAm && reststunden != null) text = `fällig ${datum(faelligAm)} oder in ${reststunden} h`;
  else if (faelligAm) text = `fällig ${datum(faelligAm)}`;
  else if (reststunden != null) text = `fällig in ${reststunden} h`;
  else text = "ohne Frist";

  return { vorlage, letzte, faelligAm, faelligBeiStunden, reststunden, stufe, text };
}

/** Überfällig vor bald vor im Plan, innerhalb dessen das frühere Datum zuerst. */
export function vergleicheStaende(a: FristStand, b: FristStand): number {
  return RANG[a.stufe] - RANG[b.stufe] || (a.faelligAm ?? "9").localeCompare(b.faelligAm ?? "9");
}

export function naechsteFrist(staende: readonly FristStand[]): FristStand | null {
  return [...staende].sort(vergleicheStaende)[0] ?? null;
}

/** Der Zustand folgt aus den offenen Mängeln: einer „nicht einsatzbereit“ genügt. */
export function zustandAus(offene: readonly { einsatzbereit: boolean }[]): Zustand {
  if (offene.some((m) => !m.einsatzbereit)) return "defekt";
  return offene.length > 0 ? "mangel" : "ok";
}

export const ANLASS_TEXT: Record<Anlass, string> = { einsatz: "vor jeder Verwendung", rueckkehr: "nach jeder Benutzung" };
/** Wie der Anlass in der Verwaltung heißt. */
export const ANLASS_NAME: Record<Anlass, string> = { einsatz: "Vor Verwendung", rueckkehr: "Nach Benutzung" };

export function intervallText(v: Pick<FristVorlage, "monate" | "stunden"> & { anlass?: Anlass | null }): string {
  if (v.anlass) return ANLASS_TEXT[v.anlass];
  const teile: string[] = [];
  if (v.monate) teile.push(v.monate === 12 ? "jährlich" : v.monate === 1 ? "monatlich" : `alle ${v.monate} Monate`);
  if (v.stunden) teile.push(`alle ${v.stunden} Betriebsstunden`);
  return teile.join(" oder ") + (teile.length > 1 ? ", was zuerst kommt" : "");
}

export const WER_TEXT: Record<Wer, string> = {
  intern: "selbst, per QR am Gerät",
  fachfirma: "Fachfirma",
  elektrofachkraft: "Elektrofachkraft",
};

/**
 * EIN WORT JE ZUSTAND, überall gleich (IDA-381), aus der suiteweiten Wortliste (Abschnitt „Zustände eines Geräts
 * oder Fahrzeugs“): Liste, Akte, Übersicht, Telefon und das Etikett am Mangel.
 * Die Farbe dazu steht in `_ui/teile.tsx` (`ZUSTAND_FARBE`). Ein offener Mangel trägt den Zustand, den er
 * dem Gerät gibt (`mangelZustand`) — „einsatzbereit“ allein hieße am Gerät grün und am Mangel gelb.
 */
export const ZUSTAND_TEXT: Record<Zustand, string> = {
  ok: "Einsatzbereit",
  mangel: "Einsatzbereit mit Mangel",
  defekt: "Nicht einsatzbereit",
};

/** Welchen Zustand ein offener Mangel dem Gerät gibt. */
export const mangelZustand = (einsatzbereit: boolean): Zustand => zustandAus([{ einsatzbereit }]);

/** Das Prüfergebnis: „In Ordnung“ statt „Einsatzbereit“, sonst die Wörter des Zustands. */
export const ERGEBNIS_TEXT: Record<Zustand, string> = { ...ZUSTAND_TEXT, ok: "In Ordnung" };

export const STUFE_TEXT: Record<Stufe, string> = { ueberfaellig: "Überfällig", bald: "Bald", ok: "Im Plan" };
