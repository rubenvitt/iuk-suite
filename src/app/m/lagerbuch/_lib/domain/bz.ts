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
  /** letzteKontrolle + 31 Tage; null wenn noch nie geprueft. */
  faelligAm: Date | null;
  tageBisFaellig: number | null;
  /** gruen ok · gelb bald · rot ueberfaellig ODER nie geprueft */
  ampel: Ampel;
  ueberfaellig: boolean;
  nieGeprueft: boolean;
};

/**
 * Faelligkeit aus dem Datum der letzten Kontrolle.
 *
 * ⚠️ `null` = noch nie geprueft → `ampel: "rot"`, aber `ueberfaellig: FALSE`.
 * DAS IST DIE FALLE DIESER FUNKTION (§5.11): `ueberfaellig === false` heisst hier
 * NICHT „alles gut". Jede Anzeige muss `nieGeprueft` eigenstaendig behandeln,
 * sonst steht „nicht ueberfaellig" neben einer roten Ampel — beruhigend, obwohl
 * das Geraet der schlechteste Fall im Bestand ist.
 */
export function bzFaelligkeit(letzteKontrolle: Date | null, now: Date): BzFaelligkeit {
  if (letzteKontrolle === null) {
    return {
      faelligAm: null, tageBisFaellig: null, ampel: "rot",
      ueberfaellig: false, nieGeprueft: true,
    };
  }
  const faelligAm = new Date(letzteKontrolle.getTime() + BZ_KONTROLL_INTERVALL_TAGE * 86_400_000);
  const tageBisFaellig = Math.ceil((faelligAm.getTime() - now.getTime()) / 86_400_000);
  const ueberfaellig = faelligAm.getTime() < now.getTime();
  let ampel: Ampel;
  if (ueberfaellig) ampel = "rot";
  else if (tageBisFaellig <= BZ_WARN_TAGE) ampel = "gelb";
  else ampel = "gruen";
  return { faelligAm, tageBisFaellig, ampel, ueberfaellig, nieGeprueft: false };
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
