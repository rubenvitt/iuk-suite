/**
 * Die vier Bestandsaggregate — Entscheidung 7, Variante (b) (§5.2.4).
 *
 * Kein "use client". Sie werden von Server Components und von Server Actions
 * gelesen.
 *
 * WAS SIE ERSETZEN. Vier Lesepfade laden `buchungen` heute KOMPLETT in den Prozess
 * und filtern danach JE ARTIKEL erneut ueber die ganze Liste:
 * O(N_Artikel · N_Buchungen) (§5.2.3 b). Bei 100 000 Buchungszeilen sind das 0,4
 * bis 1 Sekunde — und `better-sqlite3` ist SYNCHRON: die Uebersichtsseite
 * blockiert fuer diese Zeit die GESAMTE Suite. Portal, qr, feedback und files
 * antworten in dieser Zeit nicht. Die Grenze ist damit suiteweit, nicht
 * modulintern.
 *
 * ⚠️ DER BESTAND BLEIBT REKONSTRUKTIV. Es gibt keinen zweiten Wahrheitsspeicher;
 * eine materialisierte Bestandstabelle (Variante c) widerspricht der Leitplanke
 * und ist verworfen (§13).
 *
 * ⚠️ `lagerort_id` MUSS IM PRAEDIKAT BLEIBEN. Ohne den Lagerortbezug zaehlt nach
 * der ersten Fahrzeugbuchung derselben Charge der Fahrzeugbestand als
 * Handlager-Rest mit → PHANTOMBESTAND und falsche FEFO-Verteilung
 * (`_lib/domain/bestand.ts:22-24`). In einer frisch migrierten Test-DB ist das
 * UNSICHTBAR, weil dort beide Bestaende identisch sind — `_db/aggregate.test.ts`
 * faehrt deshalb ausdruecklich dieselbe chargeId an drei Lagerorten.
 *
 * ⚠️ `sum()` LIEFERT BEI LEERER GRUPPE KEINE ZEILE, NICHT 0 (§5.2.4, Punkt 3).
 * Jede Map-Abfrage geht ueber `?? 0`. Heute liefert `bestandProLagerort` fuer
 * einen Artikel ohne Buchungen 0, morgen fehlt der Schluessel.
 *
 * ⚠️ DIE REINEN FUNKTIONEN IN `_lib/domain/bestand.ts` BLEIBEN DIE SPEZIFIKATION.
 * Jedes Aggregat hier schuldet einen Differenztest gegen sie (§5.2.4, Punkt 2).
 */
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { artikel, buchungen, chargen } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { verfallStatus, verfallSchwellen } from "../domain/verfall";
import { braucht } from "../domain/vorschlag";

/**
 * Alles, was `select()` kann — die echte Verbindung ODER eine offene Transaktion.
 *
 * ⚠️ `_lib/schreibpfade/abbuchung.ts` definiert denselben Ausdruck ein zweites
 * Mal unter dem Namen `Tx` (1:1 aus `lagerbuch/src/db/abbuchung.ts:9`). Beide
 * leiten sich aus DERSELBEN `DB["transaction"]`-Signatur ab und sind strukturell
 * identisch; ein Import von `Tx` aus einem Schreibpfad in einen Lesepfad waere die
 * falsche Richtung.
 */
export type Leser = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Bestand je Artikel AN EINEM Lagerort. Ersetzt jede `allBu.filter()`-Schleife.
 * Index: `idx_buchungen_lagerort_artikel` (§4.14).
 */
export function bestandJeArtikel(db: Leser, lagerortId: string): Map<string, number> {
  const rows = db
    .select({ artikelId: buchungen.artikelId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(eq(buchungen.lagerortId, lagerortId))
    .groupBy(buchungen.artikelId)
    .all();
  return new Map(rows.map((r) => [r.artikelId, r.summe]));
}

/**
 * Rest je Charge AN EINEM Lagerort. Ersetzt `bestandProLagerortUndCharge` ueber
 * die Vollladung. Index: `idx_buchungen_lagerort_artikel`.
 */
export function restJeCharge(db: Leser, lagerortId: string): Map<string, number> {
  const rows = db
    .select({ chargeId: buchungen.chargeId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(eq(buchungen.lagerortId, lagerortId))
    .groupBy(buchungen.chargeId)
    .all();
  return new Map(rows.map((r) => [r.chargeId, r.summe]));
}

/**
 * Bestand je (Lagerort, Artikel) fuer ALLE Lagerorte — EINE Abfrage fuer die
 * Fahrzeuguebersicht (heute O(N_Fahrzeug · N_ArtikelImSoll · N_Buchungen)).
 *
 * ⚠️ DIE SCHACHTELUNG IST VERTRAG: AUSSEN der Lagerort, INNEN der Artikel. Die
 * Fahrzeugliste iteriert Fahrzeuge und schlaegt darin Artikel nach; umgedreht
 * braeuchte sie je Fahrzeug eine Schleife ueber alle Artikel.
 */
export function bestandJeArtikelUndLagerort(db: Leser): Map<string, Map<string, number>> {
  const rows = db
    .select({
      lagerortId: buchungen.lagerortId,
      artikelId: buchungen.artikelId,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .groupBy(buchungen.lagerortId, buchungen.artikelId)
    .all();
  const m = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let innen = m.get(r.lagerortId);
    if (!innen) { innen = new Map(); m.set(r.lagerortId, innen); }
    innen.set(r.artikelId, r.summe);
  }
  return m;
}

/**
 * Rest je Charge EINES Artikels AN EINEM Lagerort — der Lesepfad des Schreibwegs.
 * Index: `idx_buchungen_artikel_lagerort_charge` (§4.14).
 *
 * ⚠️ `abbuchung.ts` laedt heute ALLE Buchungen des Artikels OHNE Lagerort-
 * Praedikat und filtert erst in JS; `korrektur.ts` tut dasselbe. Ein
 * Fahrzeug-Check mit 60 Artikeln laedt damit die vollstaendige Historie von
 * 60 Artikeln zwei- bis dreimal. Mit dieser Funktion wandert das Praedikat
 * erstmals in die Abfrage.
 *
 * ⚠️ Der Index ist NICHT redundant zu `idx_buchungen_lagerort_artikel`: er fuehrt
 * `artikel_id` VORAN, und genau daran entscheidet SQLite, ob ein Index fuer eine
 * WHERE-Klausel taugt.
 */
export function restJeChargeFuerArtikel(
  db: Leser, artikelId: string, lagerortId: string,
): Map<string, number> {
  const rows = db
    .select({ chargeId: buchungen.chargeId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(and(eq(buchungen.artikelId, artikelId), eq(buchungen.lagerortId, lagerortId)))
    .groupBy(buchungen.chargeId)
    .all();
  return new Map(rows.map((r) => [r.chargeId, r.summe]));
}

export type Kennzahlen = {
  /** Aktive Artikel, deren HANDLAGER-Bestand unter dem Mindestbestand liegt. */
  unterMindest: number;
  /**
   * Davon die NOCH NICHT bestellten.
   *
   * ⚠️ HIESS FRUEHER `offeneBestellungen` UND WAR FALSCH HERUM BENANNT (§5.5).
   * `queries.ts:139-141` zaehlt genau dann hoch, wenn ein Artikel unter
   * Mindestbestand liegt UND `bestelltAt` NICHT gesetzt ist — die Oberflaeche
   * beschriftet das mit „offene Bestellpositionen", was jeder Leser als
   * „bestellt, noch nicht geliefert" versteht. Die ZAHL bleibt dieselbe; nur der
   * Name wird wahr. Beschriftung ab Teil 5: „unter Mindestbestand, noch nicht
   * bestellt".
   */
  nichtBestellt: number;
  /** Chargen mit HANDLAGER-Rest > 0, deren Ampel gelb oder rot ist (aber nicht abgelaufen). */
  chargenKritisch: number;
  /** Chargen mit HANDLAGER-Rest > 0, die bereits abgelaufen sind. */
  chargenAbgelaufen: number;
  buchungenGesamt: number;
};

/**
 * Die KPI-Kacheln der Uebersicht — heute der teuerste JS-Term des Moduls
 * (`queries.ts:128` Vollladung, `:136-138` Filter je Artikel in der Schleife).
 *
 * ⚠️ ALLE VIER ZAEHLER BEZIEHEN SICH AUF DEN HANDLAGER (§5.2.1, normativ). Der
 * Mindestbestand ist eine Handlager-Nachschubschwelle; die Verfall-KPIs zaehlen
 * Handlager-Reste, konsistent mit `verfallListe()` und der Aussondern-Aktion
 * (beide handlager-gebunden). Fahrzeug-Chargen laufen ggf. dort ab und werden
 * ueber den naechsten Fahrzeug-Check bereinigt, nicht ueber die
 * Handlager-Verfallsliste.
 */
export function kennzahlen(db: Leser, now: Date = new Date()): Kennzahlen {
  const schwellen = verfallSchwellen();
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  const bestand = bestandJeArtikel(db, HANDLAGER_ID);
  const restProCharge = restJeCharge(db, HANDLAGER_ID);

  let unterMindest = 0;
  let nichtBestellt = 0;
  for (const a of arts) {
    if (!braucht(bestand.get(a.id) ?? 0, a.mindestbestand)) continue;
    unterMindest += 1;
    if (!a.bestelltAt) nichtBestellt += 1;
  }

  let chargenKritisch = 0;
  let chargenAbgelaufen = 0;
  for (const c of db.select().from(chargen).all()) {
    if ((restProCharge.get(c.id) ?? 0) <= 0) continue;   // aufgebraucht → kein Risiko
    const s = verfallStatus(c.verfall, schwellen, now);
    if (s.abgelaufen) chargenAbgelaufen += 1;
    else if (s.ampel !== "gruen") chargenKritisch += 1;
  }

  const gesamt = db
    .select({ n: sql<number>`count(*)` })
    .from(buchungen)
    .get();

  return {
    unterMindest, nichtBestellt, chargenKritisch, chargenAbgelaufen,
    buchungenGesamt: gesamt?.n ?? 0,
  };
}
