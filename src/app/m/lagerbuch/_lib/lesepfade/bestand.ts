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
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { artikel, buchungen, chargen } from "../../_db/schema";
import { verfallStatus, verfallSchwellen } from "../domain/verfall";
import { braucht } from "../domain/vorschlag";
import type { Einheitenart } from "../konstanten";
import { handlagerOrte, ortStamm } from "./orte";

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
 * Bestand je Artikel über einen BEREICH von Orten (DRK-297: Handlager plus
 * Schränke, oder ein einzelnes Fahrzeug als einelementige Liste).
 * Index: `idx_buchungen_lagerort_artikel`.
 *
 * ⚠️ EINE LEERE LISTE ERGIBT `WHERE false` und damit überall 0 — still.
 * `handlagerOrte` liefert deshalb immer mindestens die Wurzel
 * (`_lib/lesepfade/orte.ts`).
 */
export function bestandJeArtikel(db: Leser, orte: readonly string[]): Map<string, number> {
  const rows = db
    .select({ artikelId: buchungen.artikelId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(inArray(buchungen.lagerortId, [...orte]))
    .groupBy(buchungen.artikelId)
    .all();
  return new Map(rows.map((r) => [r.artikelId, r.summe]));
}

/**
 * Rest je Charge über einen BEREICH von Orten. Ersetzt
 * `bestandProLagerortUndCharge` ueber die Vollladung.
 * Index: `idx_buchungen_lagerort_artikel`.
 */
export function restJeCharge(db: Leser, orte: readonly string[]): Map<string, number> {
  const rows = db
    .select({ chargeId: buchungen.chargeId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(inArray(buchungen.lagerortId, [...orte]))
    .groupBy(buchungen.chargeId)
    .all();
  return new Map(rows.map((r) => [r.chargeId, r.summe]));
}

/**
 * DRK-339 — Rest je (Charge, Ort) ueber einen BEREICH von Orten. Dieselbe
 * Abfrage wie `restJeCharge` mit demselben Praedikat, nur ein `lagerort_id`
 * mehr im `GROUP BY`.
 *
 * ⚠️ SIE ERSETZT `restJeCharge` NICHT, UND DAS IST KEINE DOPPELUNG: drei
 * Lesepfade (`artikel.ts`, `inventur.ts`) brauchen die Summe je Charge, nicht
 * die Aufschluesselung.
 *
 * ⚠️ DIE KPIs LESEN TROTZDEM DIESE HIER, und zwar nicht aus Bequemlichkeit:
 * sie fragen „liegt die Charge irgendwo positiv?", und das ist genau die
 * Frage, die `verfallListe` fuer die Liste unter der Kachel beantwortet.
 * Ueber die vorzeichenbehaftete Summe gezaehlt, liefen Kachel und Liste bei
 * einem Ort im Minus auseinander (Codex-Befund zu PR #173). Aufsummiert wird
 * dort nichts — ein `has()` reicht.
 *
 * ⚠️ EIN ORT MIT SALDO <= 0 FAELLT RAUS — dieselbe Regel wie in
 * `restJeChargeUndOrt` und dieselbe wie in der Aussonderungsaktion, die ueber
 * einen solchen Ort keine Buchung schreibt. Die Summe ueber diese Map ist
 * damit genau das, was das Aussondern buchen wuerde; eine Summe, die einen
 * negativen Ortssaldo mitzaehlte, waere eine andere Zahl als die Wirkung des
 * Knopfes daneben.
 */
export function restJeChargeJeOrt(
  db: Leser, orte: readonly string[],
): Map<string, Map<string, number>> {
  const rows = db
    .select({
      chargeId: buchungen.chargeId,
      lagerortId: buchungen.lagerortId,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .where(inArray(buchungen.lagerortId, [...orte]))
    .groupBy(buchungen.chargeId, buchungen.lagerortId)
    .all();
  const m = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.summe <= 0) continue;
    let innen = m.get(r.chargeId);
    if (!innen) { innen = new Map(); m.set(r.chargeId, innen); }
    innen.set(r.lagerortId, r.summe);
  }
  return m;
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
  db: Leser, artikelId: string, orte: readonly string[],
): Map<string, number> {
  const rows = db
    .select({ chargeId: buchungen.chargeId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(and(eq(buchungen.artikelId, artikelId), inArray(buchungen.lagerortId, [...orte])))
    .groupBy(buchungen.chargeId)
    .all();
  return new Map(rows.map((r) => [r.chargeId, r.summe]));
}

/**
 * DRK-297 — Rest je (Charge, Ort) für EINEN Artikel, über ALLE Orte. Eine
 * Abfrage, `GROUP BY charge_id, lagerort_id`.
 *
 * ⚠️ KEIN ORTS-PRÄDIKAT, und das ist der Punkt: die Anzeige soll „Schrank 1: 5
 * · RTW 1: 7" zeigen können. Genau dieser fehlende Filter behebt den Befund,
 * dass eine Charge, die vollständig im Fahrzeug liegt, aus dem Artikeldetail
 * verschwindet.
 *
 * ⚠️ DIE SCHACHTELUNG IST VERTRAG: AUSSEN die Charge, INNEN der Ort. Die
 * Anzeige iteriert Chargen und schlägt darin die Orte nach.
 */
export function restJeChargeUndOrt(
  db: Leser, artikelId: string,
): Map<string, Map<string, number>> {
  const rows = db
    .select({
      chargeId: buchungen.chargeId,
      lagerortId: buchungen.lagerortId,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .where(eq(buchungen.artikelId, artikelId))
    .groupBy(buchungen.chargeId, buchungen.lagerortId)
    .all();
  const m = new Map<string, Map<string, number>>();
  for (const r of rows) {
    // Ein Ort mit Rest 0 (alles wieder herausgebucht) ist kein Liegeplatz.
    if (r.summe <= 0) continue;
    let innen = m.get(r.chargeId);
    if (!innen) { innen = new Map(); m.set(r.chargeId, innen); }
    innen.set(r.lagerortId, r.summe);
  }
  return m;
}

export type OrtVerteilungEintrag = {
  id: string; name: string; menge: number; zugangshinweis: string | null;
  /**
   * ⚠️ DRK-309, Reviewrunde 14: die Spalte „Liegt in" BENENNT den Ort. Ohne
   * diese beiden Felder stand dort der blosse Name — und ein Fahrzeug und
   * eine gleichnamige Tasche ergaben zwei ununterscheidbare Chips
   * nebeneinander, in derselben Schublade, deren Zielwahl eine Zeile hoeher
   * bereits „Name · Art" fuehrt.
   */
  typ: "lager" | "fahrzeug";
  kennung: string | null;
  einheitenart: Einheitenart | null;
};

/**
 * DRK-297, Fixrunde 1 zu Aufgabe 12 — GEMEINSAMER KERN der Ortsverteilung fuer
 * `_actions/detail.ts` (Verwaltung, Aufgabe 11) UND `_lib/lesepfade/artikel.ts`
 * (`artikelDetailHelfer`, Aufgabe 12). Beide Seiten brauchten bislang eine
 * WORTGLEICHE Kopie dieser rund dreissig Zeilen samt der `rang`-Sonderregel —
 * genau die Kopie, vor der der eigene Auftrag warnt ("zwei Ansichten laufen
 * sonst garantiert auseinander"), und die Regel ist nicht trivial genug, um sie
 * zweimal richtig zu halten.
 *
 * Liefert je Charge die Verteilung UND ihre Summe, sortiert Handlager-Bereich
 * ZUERST, Fahrzeuge DAHINTER, dann `sortierung`, dann Name.
 *
 * ⚠️ `sortierung` ALLEIN REICHT NICHT: ein Fahrzeug traegt den Default 0 und
 * stuende damit VOR „Schrank 1" (10) — der Rang (Handlager-Bereich vor
 * Fahrzeugen) entscheidet ZUERST.
 */
export function verteilungJeCharge(
  db: Leser, artikelId: string,
): Map<string, { orte: OrtVerteilungEintrag[]; restGesamt: number }> {
  const verteilung = restJeChargeUndOrt(db, artikelId);
  const stamm = ortStamm(db);
  const imHandlager = new Set(handlagerOrte(db));

  const ergebnis = new Map<string, { orte: OrtVerteilungEintrag[]; restGesamt: number }>();
  for (const [chargeId, proOrt] of verteilung) {
    const orte = [...proOrt.entries()]
      .map(([ortId, menge]) => {
        const o = stamm.get(ortId);
        return {
          id: ortId,
          name: o?.name ?? ortId,
          menge,
          zugangshinweis: o?.zugangshinweis ?? null,
          // Ein unbekannter Ort ist kein Ort OHNE Art, sondern gar keine
          // Einheit — `typ: "lager"` laesst `standortMeta` „Lager" sagen
          // statt „nicht zugeordnet".
          typ: o?.typ ?? "lager",
          kennung: o?.kennung ?? null,
          einheitenart: o?.einheitenart ?? null,
          sortierung: o?.sortierung ?? 0,
          rang: imHandlager.has(ortId) ? 0 : 1,
        };
      })
      .sort((a, b) =>
        a.rang - b.rang || a.sortierung - b.sortierung || a.name.localeCompare(b.name))
      .map(({ sortierung: _s, rang: _r, ...rest }) => rest);
    ergebnis.set(chargeId, { orte, restGesamt: orte.reduce((sum, o) => sum + o.menge, 0) });
  }
  return ergebnis;
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
  const orte = handlagerOrte(db);
  const bestand = bestandJeArtikel(db, orte);
  /**
   * ⚠️ DIE LIEGEPLAETZE, NICHT DER NETTO-SALDO (Codex-Befund zu PR #173).
   *
   * Die Kachel und die Verfallsliste, auf die sie verlinkt, MUESSEN dieselben
   * Chargen zaehlen. `verfallListe` fuehrt seit DRK-339 eine Charge, sobald
   * IRGENDEIN Ort des Bereichs positiv ist; ein Ort darf dabei im Minus stehen
   * (append-only Journal, die Zeilen der Fassung vor DRK-297). Ueber die
   * vorzeichenbehaftete Summe gezaehlt, stuende hier eine gruene 0, waehrend
   * einen Klick weiter eine Zeile mit einem Aussondern-Knopf steht.
   *
   * ⚠️ HIER WIRD NICHTS NEU AUFSUMMIERT: gefragt ist nur, OB die Charge
   * irgendwo positiv liegt — `has()` genuegt. `restJeChargeJeOrt` traegt einen
   * Schluessel ausschliesslich dann, wenn mindestens ein Ort positiv ist.
   */
  const liegeplaetze = restJeChargeJeOrt(db, orte);

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
    if (!liegeplaetze.has(c.id)) continue;               // aufgebraucht → kein Risiko
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
