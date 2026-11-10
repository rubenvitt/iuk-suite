/**
 * BZ-Geraete (Blutzucker-Messgeraete) — Kontrollfaelligkeit, Bewertung, Akku.
 * Kein "use client", kein Datenbankzugriff.
 *
 * ⚠️ DIESE DATEI RECHNET ABSICHTLICH IN REINEN MILLISEKUNDEN und geht NICHT ueber
 * `_lib/zeit.ts` (§5.16). Ein Kontrollintervall ist eine Dauer, kein Zivildatum:
 * ueber einen Zeitumstellungstag bleiben 31 Tage 31 · 86 400 000 ms. Wer die
 * Rechnung „vereinheitlicht", macht aus dem Intervall ploetzlich 30 oder 32 Tage.
 */
import type { Ampel } from "./verfall";

/** Kontrollloesung muss spaetestens alle 31 Tage geprueft werden.
 *  ⚠️ KONSTANTE, kein Regler (§10.3): das ist die PRUEFVORGABE fuer die
 *  Kontrollloesung, nicht der Geschmack des Betriebs — ein Regler daran laedt
 *  dazu ein, eine Faelligkeit wegzukonfigurieren statt sie zu erfuellen. */
export const BZ_KONTROLL_INTERVALL_TAGE = 31;

/** Warnfenster (Tage vor Faelligkeit → gelb). */
export const BZ_WARN_TAGE = 5;

export type BzFaelligkeit = {
  /** letzte bestandene Kontrolle + 31 Tage; null wenn es keine gibt. */
  faelligAm: Date | null;
  tageBisFaellig: number | null;
  /** gruen ok · gelb bald · rot ueberfaellig ODER nie (bestanden) geprueft */
  ampel: Ampel;
  ueberfaellig: boolean;
  /** Keine Kontrolle, von der eine Frist laeuft — nie geprueft ODER nie bestanden. */
  nieGeprueft: boolean;
  /**
   * IDA-379: es GIBT gueltige Kontrollen, aber keine bestandene. Nur fuer den
   * Text — gezaehlt wird weiter ueber `nieGeprueft`, das in diesem Fall auch
   * `true` ist („noch nie geprueft" waere hier eine falsche Auskunft).
   */
  nieBestanden: boolean;
};

/**
 * Faelligkeit aus dem Datum der letzten BESTANDENEN, nicht stornierten Kontrolle.
 *
 * ⚠️ IDA-379: EINE NICHT BESTANDENE KONTROLLE ERFUELLT DIE FRIST NICHT. Vorher
 * rechnete die Frist von der letzten Kontrolle ueberhaupt — ein leer
 * abgeschicktes Formular schob „Naechste Kontrolle" um einen Monat. Welche Zeile
 * zaehlt, entscheidet `fristKontrolle`; `kontrolliert` sagt nur, ob es ueberhaupt
 * eine gueltige gab (fuer `nieBestanden`).
 *
 * ⚠️ `null` = noch nie geprueft → `ampel: "rot"`, aber `ueberfaellig: FALSE`.
 * DAS IST DIE FALLE DIESER FUNKTION (§5.11): `ueberfaellig === false` heisst hier
 * NICHT „alles gut". Jede Anzeige muss `nieGeprueft` eigenstaendig behandeln,
 * sonst steht „nicht ueberfaellig" neben einer roten Ampel — beruhigend, obwohl
 * das Geraet der schlechteste Fall im Bestand ist.
 */
export function bzFaelligkeit(
  letzteBestandene: Date | null,
  now: Date,
  kontrolliert: boolean = letzteBestandene !== null,
): BzFaelligkeit {
  if (letzteBestandene === null) {
    return {
      faelligAm: null, tageBisFaellig: null, ampel: "rot",
      ueberfaellig: false, nieGeprueft: true, nieBestanden: kontrolliert,
    };
  }
  const faelligAm = new Date(letzteBestandene.getTime() + BZ_KONTROLL_INTERVALL_TAGE * 86_400_000);
  const tageBisFaellig = Math.ceil((faelligAm.getTime() - now.getTime()) / 86_400_000);
  const ueberfaellig = faelligAm.getTime() < now.getTime();
  let ampel: Ampel;
  if (ueberfaellig) ampel = "rot";
  else if (tageBisFaellig <= BZ_WARN_TAGE) ampel = "gelb";
  else ampel = "gruen";
  return { faelligAm, tageBisFaellig, ampel, ueberfaellig, nieGeprueft: false, nieBestanden: false };
}

/** Was eine Kontrollzeile fuer die Auswahl unten mitbringen muss. */
export type BzKontrollStand = {
  id: string; ts: Date; bestanden: boolean; storniertAt: Date | null;
};

/** IDA-379: eine stornierte Kontrolle zaehlt nirgends — sie bleibt nur lesbar. */
export function zaehltKontrolle(k: { storniertAt: Date | null }): boolean {
  return k.storniertAt === null;
}

function spaeter(a: BzKontrollStand, b: BzKontrollStand | null): boolean {
  // id-Tiebreaker bei GLEICHEM `ts` (§5.14.4) — dieselbe Ordnung wie das
  // Logbuch (`orderBy(desc(ts), desc(id))`).
  return b === null
    || a.ts.getTime() > b.ts.getTime()
    || (a.ts.getTime() === b.ts.getTime() && a.id > b.id);
}

/**
 * Die juengste gueltige Kontrolle (`letzte`) und die juengste gueltige
 * BESTANDENE (`frist`) — von der zweiten laeuft die Faelligkeit.
 */
export function fristKontrolle<T extends BzKontrollStand>(
  kontrollen: readonly T[],
): { letzte: T | null; frist: T | null } {
  let letzte: T | null = null;
  let frist: T | null = null;
  for (const k of kontrollen) {
    if (!zaehltKontrolle(k)) continue;
    if (spaeter(k, letzte)) letzte = k;
    if (k.bestanden && spaeter(k, frist)) frist = k;
  }
  return { letzte, frist };
}

/** Ob ein Messwert im Referenzbereich liegt. Fehlt IRGENDEIN Wert → null
 *  („nicht bewertbar"), nicht `false`. Beide Raender sind inklusiv. */
export function imBereich(
  wert: number | null, min: number | null, max: number | null,
): boolean | null {
  if (wert === null || min === null || max === null) return null;
  return wert >= min && wert <= max;
}

export type BzKontrolleBewertung = {
  level1ImBereich: boolean | null;
  level2ImBereich: boolean | null;
  bestanden: boolean;
};

/**
 * Bewertet eine Kontrolle gegen die (optional) am Geraet konfigurierten
 * Level-Referenzbereiche.
 *
 * `bestanden` nach DREI Regeln (`lagerbuch/src/lib/domain/bz.ts:70-77`):
 *  1. Komplett LEERE Kontrolle (kein einziger Wert erfasst) → false. Verhindert
 *     „vacuously true": eine leere Kontrolle ist keine bestandene.
 *  2. Mindestens ein konfiguriertes Level (min UND max gesetzt) → ALLE
 *     konfigurierten Level muessen GEMESSEN und im Bereich sein. ⚠️ Ein
 *     konfiguriertes, aber nicht gemessenes Level laesst `bestanden` fallen — das
 *     verliert ein Port, der nur ueber die gemessenen Level iteriert.
 *  3. Kein Level konfiguriert, aber mind. ein Wert erfasst → true (kein
 *     Referenzbereich zum Verletzen).
 *
 * ⚠️ Kompresse-Verfall, Sticks, Lanzetten und Batteriewechsel fliessen NICHT in
 * `bestanden` ein. Die Ausschlussliste steht hier, weil sie sonst wie eine Luecke
 * aussieht.
 */
export function bewerteKontrolle(g: {
  level1Wert: number | null; level1Min: number | null; level1Max: number | null;
  level2Wert: number | null; level2Min: number | null; level2Max: number | null;
}): BzKontrolleBewertung {
  const level1ImBereich = imBereich(g.level1Wert, g.level1Min, g.level1Max);
  const level2ImBereich = imBereich(g.level2Wert, g.level2Min, g.level2Max);
  const levels = [
    { wert: g.level1Wert, min: g.level1Min, max: g.level1Max, imB: level1ImBereich },
    { wert: g.level2Wert, min: g.level2Min, max: g.level2Max, imB: level2ImBereich },
  ];
  const hatWert = levels.some((l) => l.wert !== null);
  const konfiguriert = levels.filter((l) => l.min !== null && l.max !== null);
  let bestanden: boolean;
  if (!hatWert) bestanden = false;
  else if (konfiguriert.length > 0) bestanden = konfiguriert.every((l) => l.wert !== null && l.imB === true);
  else bestanden = true;
  return { level1ImBereich, level2ImBereich, bestanden };
}

/**
 * IDA-379 — WELCHE WERTE EINE KONTROLLE MITBRINGEN MUSS.
 *
 * ⚠️ GENAU DAS, WAS `bewerteKontrolle` FUER „bestanden" ZAEHLT, plus der
 * Kompressen-Verfall. Jedes konfigurierte Level (min UND max) ist Pflicht —
 * ein fehlendes laesst `bestanden` fallen (Regel 2). Ist keines konfiguriert,
 * genuegt nach Regel 3 irgendein Wert, also ist MINDESTENS EINER Pflicht
 * (`eines`); sonst waere die Kontrolle leer (Regel 1). Ein nur halb
 * konfiguriertes Level zaehlt nicht und ist deshalb auch nicht Pflicht.
 *
 * Der Kompressen-Verfall zaehlt nicht fuer `bestanden`, ist aber Teil des
 * Nachweises — ohne ihn ist die Kontrolle unvollstaendig.
 *
 * Sticks und Lanzetten sind hier NICHT dabei: 0 ist ein echter Bestand
 * („nachbestellen"), das Formular belegt sie mit 0 vor, und keiner der beiden
 * Werte fliesst in eine Bewertung ein.
 */
export type BzKontrollPflicht = { level1: boolean; level2: boolean; eines: boolean };

export function bzKontrollPflicht(g: {
  level1Min: number | null; level1Max: number | null;
  level2Min: number | null; level2Max: number | null;
}): BzKontrollPflicht {
  const level1 = g.level1Min !== null && g.level1Max !== null;
  const level2 = g.level2Min !== null && g.level2Max !== null;
  return { level1, level2, eines: !level1 && !level2 };
}

export const KONTROLLWERT_FEHLT = "Bitte den Messwert eingeben.";
export const KONTROLLWERT_EINER_FEHLT = "Bitte mindestens einen Messwert eingeben.";
export const KOMPRESSE_FEHLT = "Bitte Verfallsmonat auswählen.";

/** Die Feldfehler fuer fehlende Pflichtwerte — leer, wenn alles da ist. */
export function fehlendeKontrollwerte(
  pflicht: BzKontrollPflicht,
  w: { level1Wert: number | null; level2Wert: number | null; kompresseVerfall: string | null },
): Partial<Record<"level1Wert" | "level2Wert" | "kompresseVerfall", string>> {
  const fehler: Partial<Record<"level1Wert" | "level2Wert" | "kompresseVerfall", string>> = {};
  if (pflicht.level1 && w.level1Wert === null) fehler.level1Wert = KONTROLLWERT_FEHLT;
  if (pflicht.level2 && w.level2Wert === null) fehler.level2Wert = KONTROLLWERT_FEHLT;
  if (pflicht.eines && w.level1Wert === null && w.level2Wert === null) {
    fehler.level1Wert = KONTROLLWERT_EINER_FEHLT;
  }
  if (w.kompresseVerfall === null) fehler.kompresseVerfall = KOMPRESSE_FEHLT;
  return fehler;
}

export type BzAkkuKennzahl = {
  tageDurchschnitt: number | null;
  anzahlWechsel: number;
  anzahlIntervalle: number;
};

/**
 * Ø Batterie-/Akku-Lebensdauer: Mittel der Abstaende zwischen aufeinanderfolgenden
 * Batteriewechsel-Ereignissen.
 *
 * `< 2` Wechsel → `tageDurchschnitt: null` (kein Intervall messbar). Sortiert
 * selbst und veraendert die Eingabe nicht.
 *
 * ⚠️ Die GESAMTkennzahl ueber alle Geraete mittelt nur GERAETEINTERNE Intervalle
 * (`lagerbuch/src/db/bz.ts:137-161`) — sie klebt nicht die Zeitreihen
 * verschiedener Geraete aneinander. Die Funktion dafuer liegt in
 * `_lib/lesepfade/bz.ts` (T51) und ruft diese hier NICHT ueber alle Zeitstempel
 * auf einmal.
 */
export function akkuLebensdauer(wechselTs: Date[]): BzAkkuKennzahl {
  const sorted = [...wechselTs].sort((a, b) => a.getTime() - b.getTime());
  const anzahlWechsel = sorted.length;
  const anzahlIntervalle = Math.max(0, anzahlWechsel - 1);
  if (anzahlIntervalle < 1) return { tageDurchschnitt: null, anzahlWechsel, anzahlIntervalle };
  let summe = 0;
  for (let i = 1; i < sorted.length; i++) {
    summe += (sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000;
  }
  return { tageDurchschnitt: summe / anzahlIntervalle, anzahlWechsel, anzahlIntervalle };
}

/**
 * DER AUFMERKSAMKEITSHINWEIS — DRK-311.
 *
 * ⚠️ DER TEXT IST DER ZUSTAND, und diese Funktion ist die EINZIGE Stelle, die
 * daraus „Beachtung ja/nein" macht. Ohne sie stuende die Bedingung an jeder
 * Anzeigestelle noch einmal — Liste, Detailkachel, Formular, Filter —, und eine
 * davon prueft frueher oder spaeter `!== null` statt auf den GETRIMMTEN Text.
 * Der Unterschied ist genau ein Geraet, das gelb leuchtet und als Begruendung
 * ein Leerzeichen zeigt.
 *
 * Ein Text aus Leerzeichen ist kein Hinweis — dieselbe Regel wie in
 * `_lib/konto.ts` und `_db/quelle.ts`.
 *
 * ⚠️ NICHTS AN DIESER FUNKTION LIEST EINE BEMERKUNG. Die Gespraechsnotiz zu
 * DRK-311 sagt ausdruecklich „Nicht jede Bemerkung automatisch als Warnung
 * interpretieren": eine Kontrolle mit Kommentar „Streifen nachbestellt" ist
 * kein Missstand. Beachtung entsteht nur, wenn ein Mensch sie setzt.
 */
export type BzBeachtung = {
  erforderlich: boolean;
  /** Der Satz, der neben dem gelben Chip steht. `null`, wenn keine Beachtung. */
  hinweis: string | null;
  /** Seit wann. `null`, wenn keine Beachtung — oder wenn es eine Altzeile ohne
   *  Zeitstempel gibt; die Anzeige muss beide Faelle vertragen. */
  seit: Date | null;
};

export function bzBeachtung(
  geraet: { beachtungHinweis: string | null; beachtungSeit: Date | null },
): BzBeachtung {
  const hinweis = geraet.beachtungHinweis?.trim() || null;
  if (hinweis === null) return { erforderlich: false, hinweis: null, seit: null };
  return { erforderlich: true, hinweis, seit: geraet.beachtungSeit };
}

/**
 * Die beiden Spaltenwerte, mit denen eine Beachtung gesetzt, umformuliert oder
 * aufgehoben wird.
 *
 * ⚠️ `seit` BLEIBT STEHEN, WENN SCHON EINE BEACHTUNG LIEF. Wer den Satz nur
 * praeziser fasst („Display flackert" → „Display flackert beim Einschalten"),
 * hat die Aufmerksamkeit nicht neu begonnen — ein `seit = jetzt` bei jedem
 * Speichern machte aus einem drei Wochen alten Missstand still einen frischen,
 * und genau die Standzeit ist die Zahl, an der jemand merkt, dass sich niemand
 * kuemmert.
 *
 * ⚠️ `hinweis === null` HEBT AUF und setzt BEIDE Spalten zurueck. Ein
 * stehengebliebenes `seit` ohne Text waere ein Datum, zu dem es nichts gibt.
 */
export function beachtungsFelder(
  vorher: { beachtungHinweis: string | null; beachtungSeit: Date | null },
  hinweis: string | null,
  jetzt: Date,
): { beachtungHinweis: string | null; beachtungSeit: Date | null } {
  if (hinweis === null) return { beachtungHinweis: null, beachtungSeit: null };
  const lief = bzBeachtung(vorher);
  return {
    beachtungHinweis: hinweis,
    // `?? jetzt` faengt die Altzeile, die einen Hinweis ohne Zeitstempel traegt.
    beachtungSeit: lief.erforderlich ? lief.seit ?? jetzt : jetzt,
  };
}
