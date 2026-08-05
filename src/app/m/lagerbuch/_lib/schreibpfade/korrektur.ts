/**
 * Gleicht den recorded Bestand EINES Lagerorts auf den gezaehlten Ist ab.
 * Transaktionsfrei (Festlegung H3).
 *
 *   diff = ist − recorded
 *   diff < 0  → FEFO-Korrektur ueber die Chargen DIESES Lagerorts (nur dessen Rest)
 *   diff > 0  → +diff auf die JUENGSTE existierende Charge des Artikels,
 *               sonst eine Pseudo-Charge ("Korrektur" / PSEUDO_VERFALL)
 *   diff == 0 → No-Op, es wird NICHTS geschrieben
 *
 * DIE ZUSAGE IST I4: danach gilt `bestandProLagerort(…, lagerortId) === istMenge`.
 * So wird es benutzt — der Fahrzeug-Check setzt den Fahrzeugbestand je Artikel auf
 * die Summe der gezaehlten Ist (`check.ts:107-110`).
 *
 * ⚠️ HIER WIRD DIE CHARGE GERATEN — eine von genau ZWEI Stellen im Modul (§5.3.3;
 * die zweite ist `inventurKorrektur`, Teil 5). Bei `diff > 0` waehlt die Funktion
 * die JUENGSTE Charge des Artikels OHNE JEDEN LAGERORTBEZUG. Der Fahrzeug-Check
 * kann Fahrzeugbestand damit auf eine Charge buchen, DIE NIE IM FAHRZEUG LAG.
 *
 * DAS IST KEIN DEFEKT, DEN MAN BEIM PORT „BEHEBT", sondern ein bewusster
 * Kompromiss MIT EINER KOMPENSATION: weil die Charge geraten ist, ist die Frage
 * „wann laeuft das Zeug im Fahrzeug ab?" ueber Chargen NICHT beantwortbar — und
 * genau dafuer gibt es `lagerort_verfall` (§4.11). ⚠️ WER BEIM NEUBAU DAS
 * VERFALL-FELD IM ZAEHLSCHRITT ALS REDUNDANT STREICHT („die Charge hat doch einen
 * Verfall"), ZERSTOERT DIESE KOMPENSATION LAUTLOS. Die Fahrzeug-Verfallsampel
 * haengt danach an einer geratenen Charge, und typecheck, lint und Vitest bleiben
 * gruen (Falle 9).
 */
import { eq } from "drizzle-orm";
import { buchungen, chargen, newId } from "../../_db/schema";
import { CHARGE_KORREKTUR, PSEUDO_VERFALL } from "../konstanten";
import { restJeChargeFuerArtikel } from "../lesepfade/bestand";
import { fefoAbbuchung, type Quelle, type Tx } from "./abbuchung";

export function korrekturAufLagerort(
  tx: Tx,
  args: {
    artikelId: string;
    lagerortId: string;
    istMenge: number;
    quelle: Quelle;
    kommentar: string | null;
    referenz: string;
  },
): { diff: number; chargeId: string | null } {
  const { artikelId, lagerortId, istMenge, quelle, kommentar, referenz } = args;

  /**
   * LAGERORT-GESCOPED. `korrektur.ts:18-19` laedt heute alle Buchungen des
   * Artikels und filtert in JS; ohne das Scoping saehe der Abgleich den
   * Handlager-Bestand mit und buchte eine viel zu grosse Korrektur.
   *
   * ⚠️ HIER STEHT `restJeChargeFuerArtikel` UND NICHT `bestandJeArtikel`, und das
   * ist eine Entscheidung: `bestandJeArtikel(tx, lagerortId)` aggregierte JEDEN
   * Artikel am Lagerort, um EINEN zu lesen — der Fahrzeug-Check ruft diese
   * Funktion je Artikel, bei 60 Artikeln also 60-mal. Die
   * Zwei-Praedikat-Form laeuft auf `idx_buchungen_artikel_lagerort_charge`, genau
   * dem Index, der fuer die Schreibseite angelegt wurde (§4.14) — und sie ist
   * DIESELBE Abfrage, die `fefoAbbuchung` nebenan schon fuehrt.
   *
   * Die Summe ueber die Chargen-Reste EINES Artikels an EINEM Lagerort ist
   * definitionsgemaess sein Bestand dort; `_db/aggregate.test.ts` haelt beide
   * Wege gegen `bestandProLagerort` (T44).
   */
  let recorded = 0;
  for (const rest of restJeChargeFuerArtikel(tx, artikelId, lagerortId).values()) {
    recorded += rest;
  }
  const diff = istMenge - recorded;
  if (diff === 0) return { diff: 0, chargeId: null };

  if (diff < 0) {
    const { teile } = fefoAbbuchung(tx, {
      artikelId, menge: -diff, lagerortId, quelle, kommentar, referenz, typ: "korrektur",
    });
    return { diff, chargeId: teile[0]?.chargeId ?? null };
  }

  // diff > 0 — DIE GERATENE CHARGE. Juengste zuerst: `verfall` ABSTEIGEND,
  // Tiebreak `createdAt` ABSTEIGEND, zweiter Tiebreak `id` ABSTEIGEND.
  // (Gegenlaeufig zu FEFO, und das ist richtig: beim Nachbuchen soll die Ware mit
  // der laengsten Restlaufzeit gewaehlt werden.)
  //
  // ⚠️ DER DRITTE SCHLUESSEL (`id`) IST KEINE KOPIE AUS DEM BRIEF, SONDERN EINE
  // EIGENE ERGAENZUNG (§5.14.4): ohne ihn entscheidet bei gleichem `verfall` UND
  // gleicher `createdAt` (Sekundenaufloesung!) die Ruecklieferreihenfolge der DB
  // (kein `ORDER BY` auf `chargen`) — `Array.prototype.sort` ist stabil
  // (ES2019+), der „Gewinner" waere dann schlicht Zufall der Einfuegereihenfolge.
  // `korrektur.test.ts` haelt das mit zwei Chargen fest, die in verfall UND
  // createdAt gleichauf liegen.
  const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  let chargeId: string;
  if (chs.length > 0) {
    chargeId = chs
      .slice()
      .sort((a, b) =>
        b.verfall.localeCompare(a.verfall)
        || (b.createdAt.getTime() - a.createdAt.getTime())
        || b.id.localeCompare(a.id))[0]
      .id;
  } else {
    chargeId = newId();
    tx.insert(chargen).values({
      id: chargeId, artikelId,
      // ⚠️ Die BEDEUTUNG haengt am VERFALLSWERT, nie an der Nummer (§5.3.2). Die
      // Nummer bleibt als Herkunftshinweis — sie ist das einzige Fundstueck, das
      // spaeter noch sagt, woher die Zeile kam.
      chargenNr: CHARGE_KORREKTUR, verfall: PSEUDO_VERFALL, createdAt: new Date(),
    }).run();
  }

  tx.insert(buchungen).values({
    id: newId(), ts: new Date(), typ: "korrektur", artikelId, chargeId,
    lagerortId, menge: diff,
    quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId, referenz, kommentar,
  }).run();

  return { diff, chargeId };
}
