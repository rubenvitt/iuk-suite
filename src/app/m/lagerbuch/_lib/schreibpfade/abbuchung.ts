/**
 * Der transaktionsFREIE FEFO-Abbuchungskern.
 *
 * Kein "use client". ⚠️ ER LAEUFT INNERHALB EINER BESTEHENDEN TRANSAKTION und
 * oeffnet keine eigene (Festlegung H3) — die zusammensetzenden Actions
 * (`checkAbschluss`, `inventurKorrektur`, `bucheZugang`, `aussondern`) gehoeren
 * Teil 4 und Teil 5.
 *
 * DRK-297 — DER KERN BUCHT UEBER EINEN BEREICH VON ORTEN, NICHT MEHR GEGEN
 * EINEN EINZELNEN. Vorher scopte die Funktion auf GENAU EINE `lagerortId`
 * (Vorgaenger dieser Datei: eine Vollladung ohne Lagerort-Praedikat, davor ein
 * einzelner Ort mit `restJeChargeFuerArtikel`). Lag der Bestand in einem
 * Schrank unterhalb der Handlager-Wurzel, fand die Abbuchung an der Wurzel
 * NICHTS und lieferte `gebucht: 0`, `teile: []` — OHNE FEHLER, OHNE LOG.
 * Gemessen an einem Artikel mit 12 Stueck im Schrank gegen eine Anforderung
 * ueber 3.
 *
 * Das Lagerort-Praedikat bleibt DAFUER in der Abfrage (statt der Vollladung):
 * `idx_buchungen_artikel_lagerort_charge`. Ein Fahrzeug-Check mit 60 Artikeln
 * laedt damit weiterhin nicht die vollstaendige Historie von 60 Artikeln
 * zwei- bis dreimal (§5.2.3 b) — nur ist das Praedikat jetzt eine MENGE von
 * Orten (`inArray`) statt einer einzelnen Gleichheit, und die Abfrage
 * gruppiert zusaetzlich NACH ORT (`GROUP BY charge_id, lagerort_id`), damit
 * jedes Teil den Ort traegt, an dem sein Rest wirklich liegt.
 *
 * ⚠️ KRITISCH, UND DER GRUND FUER DAS SCOPING UEBERHAUPT: ohne Lagerort-Praedikat
 * wuerde nach der ersten Fahrzeug-Buchung derselben Charge der Fahrzeugbestand
 * als Handlager-Rest MITGEZAEHLT → Phantombestand und falsche FEFO-Verteilung.
 * Die Abbuchung buchte mehr ab, als am Ort liegt, und der Bestand wuerde
 * negativ (I2).
 *
 * ⚠️ FUER EIN FAHRZEUG IST DER BEREICH EINELEMENTIG (`[fahrzeugId]`). Wer dort
 * `handlagerOrte` einsetzt, bucht Handlagerbestand vom Fahrzeug ab — und in
 * einer frisch migrierten Testdatenbank ist das unsichtbar, weil dort beide
 * Bestaende identisch sind.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { buchungen, chargen, newId } from "../../_db/schema";
import { fefoVerteilung, type ChargeRest, type FefoTeil } from "../domain/fefo";
import { handlagerOrte, ortStamm } from "../lesepfade/orte";

/**
 * Der tx-Typ der Drizzle-Transaktion — 1:1 aus `lagerbuch/src/db/abbuchung.ts:9`.
 *
 * ⚠️ Strukturell identisch mit dem Transaktionszweig von `Leser`
 * (`_lib/lesepfade/bestand.ts`). Beide leiten sich aus DERSELBEN
 * `DB["transaction"]`-Signatur ab; ein Import ueber die Schichtgrenze
 * (Schreibpfad → Lesepfad) waere die falsche Richtung.
 */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type Quelle = { quelleTyp: "oidc" | "token" | "system"; quelleId: string };

/** 1:1 `FefoTeil` (`_lib/domain/fefo.ts`) — der Name bleibt aus Schreibpfad-Sicht
 *  erhalten, `umlagerung.ts` und die Aufrufer kennen ihn unter diesem Namen. */
export type Teil = FefoTeil;

/**
 * Verteilt `menge` FEFO über die Chargen des Artikels IN EINEM BEREICH von
 * Orten (Rest > 0, aufsteigender Verfall), kappt am dortigen Bestand und
 * schreibt je (Charge, Ort) EINE Abgangsbuchung — auf den Ort, an dem der
 * Bestand wirklich liegt.
 *
 * ⚠️ DER BEREICH IST DER GRUND DIESER ÄNDERUNG (DRK-297). Vorher scopte die
 * Funktion auf EINE `lagerortId`; lag der Bestand in einem Schrank, lieferte
 * sie `gebucht: 0` und `teile: []` — ohne Fehler, ohne Log. Gemessen an einem
 * Artikel mit 12 Stück im Schrank und einer Anforderung über 3.
 *
 * ⚠️ FÜR EIN FAHRZEUG IST DER BEREICH EINELEMENTIG (`[fahrzeugId]`). Wer dort
 * `handlagerOrte` einsetzt, bucht Handlagerbestand vom Fahrzeug ab.
 *
 * `chargeId` (DRK-297, Nachtrag Aufgabe 6) schraenkt die Verteilung auf GENAU
 * diese eine Charge ein — fuer `inventurKorrektur`s Chargenweg: die Person hat
 * eine bestimmte Charge gezaehlt, und die Korrektur darf keine ANDERE Charge
 * desselben Artikels anfassen, sonst weicht das Journal von der gespeicherten
 * Inventur-Position (die genau diese `chargeId` traegt) ab. Ohne `chargeId`
 * bleibt das Verhalten unveraendert: FEFO ueber ALLE Chargen des Artikels.
 */
export function fefoAbbuchung(
  tx: Tx,
  args: {
    artikelId: string;
    menge: number;
    orte?: readonly string[];
    chargeId?: string;
    quelle: Quelle;
    kommentar: string | null;
    referenz: string | null;
    typ?: "entnahme" | "korrektur" | "umlagerung";
  },
): { gebucht: number; teile: Teil[] } {
  const {
    artikelId, menge, orte = handlagerOrte(tx), chargeId, quelle, kommentar, referenz,
    typ = "entnahme",
  } = args;

  const chargenPraedikat = chargeId
    ? and(eq(chargen.artikelId, artikelId), eq(chargen.id, chargeId))
    : eq(chargen.artikelId, artikelId);
  const chs = tx.select().from(chargen).where(chargenPraedikat).all();
  const stamm = ortStamm(tx);
  // EINE aggregierende Abfrage je (Charge, Ort) MIT Bereichs-Praedikat.
  const buchungenPraedikat = chargeId
    ? and(
        eq(buchungen.artikelId, artikelId),
        inArray(buchungen.lagerortId, [...orte]),
        eq(buchungen.chargeId, chargeId),
      )
    : and(eq(buchungen.artikelId, artikelId), inArray(buchungen.lagerortId, [...orte]));
  const rows = tx
    .select({
      chargeId: buchungen.chargeId,
      lagerortId: buchungen.lagerortId,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .where(buchungenPraedikat)
    .groupBy(buchungen.chargeId, buchungen.lagerortId)
    .all();

  const chargeNach = new Map(chs.map((c) => [c.id, c]));
  const chargenRest: ChargeRest[] = [];
  for (const r of rows) {
    const c = chargeNach.get(r.chargeId);
    if (!c || r.summe <= 0) continue;
    chargenRest.push({
      chargeId: c.id, verfall: c.verfall, rest: r.summe, createdAt: c.createdAt,
      // DER ORT DES TEILS, nicht die Wurzel des Bereichs.
      lagerortId: r.lagerortId, ortSortierung: stamm.get(r.lagerortId)?.sortierung ?? 0,
    });
  }

  const teile = fefoVerteilung(chargenRest, menge);
  let gebucht = 0;
  for (const teil of teile) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ, artikelId, chargeId: teil.chargeId,
      // DER ORT DES TEILS, nicht die Wurzel des Bereichs.
      lagerortId: teil.vonLagerortId,
      // VORZEICHENBEHAFTET: ein Abgang ist negativ (`schema.ts:98`).
      menge: -teil.menge,
      quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId, referenz, kommentar,
    }).run();
    gebucht += teil.menge;
  }
  return { gebucht, teile };
}
