/**
 * Der transaktionsFREIE FEFO-Abbuchungskern.
 *
 * Kein "use client". ⚠️ ER LAEUFT INNERHALB EINER BESTEHENDEN TRANSAKTION und
 * oeffnet keine eigene (Festlegung H3) — die zusammensetzenden Actions
 * (`checkAbschluss`, `inventurKorrektur`, `bucheZugang`, `aussondern`) gehoeren
 * Teil 4 und Teil 5.
 *
 * DIE EINE AENDERUNG GEGENUEBER `lagerbuch/src/db/abbuchung.ts`: das
 * Lagerort-Praedikat wandert IN DIE ABFRAGE. `:38` laedt heute ALLE Buchungen des
 * Artikels ohne Praedikat und filtert erst in JS; ein Fahrzeug-Check mit 60
 * Artikeln laedt damit die vollstaendige Historie von 60 Artikeln zwei- bis
 * dreimal (§5.2.3 b). Ab jetzt: `restJeChargeFuerArtikel`, Index
 * `idx_buchungen_artikel_lagerort_charge`. Das ERGEBNIS ist zeichengleich — der
 * Differenztest in `_db/aggregate.test.ts` haelt das fest.
 *
 * ⚠️ KRITISCH, UND DER GRUND FUER DAS SCOPING: ohne Lagerort-Praedikat wuerde nach
 * der ersten Fahrzeug-Buchung derselben Charge der Fahrzeugbestand als
 * Handlager-Rest MITGEZAEHLT → Phantombestand und falsche FEFO-Verteilung. Die
 * Abbuchung buchte mehr ab, als am Ort liegt, und der Bestand wuerde negativ (I2).
 */
import { eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { buchungen, chargen, newId } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { fefoVerteilung, type ChargeRest } from "../domain/fefo";
import { restJeChargeFuerArtikel } from "../lesepfade/bestand";

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

export type Teil = { chargeId: string; menge: number };

/**
 * Verteilt `menge` FEFO ueber die Chargen des Artikels AN EINEM LAGERORT
 * (Rest > 0, aufsteigender Verfall), kappt am dortigen Bestand und schreibt je
 * Charge EINE Abgangsbuchung.
 *
 * Gibt die TATSAECHLICH gebuchte Menge UND die Chargen-Aufteilung zurueck —
 * letztere braucht `umlagerung()`, um denselben Bestand 1:1 (gleiche Charge) am
 * Ziel-Lagerort gutzuschreiben (I3).
 *
 * ⚠️ `createdAt` WANDERT IN `ChargeRest` (§5.3.1). Die Chargen-Zeilen kommen
 * ohnehin aus der Datenbank; ein „gespartes" Feld nimmt den FEFO-Determinismus
 * wieder heraus, und der Verlust ist STILL: die Verteilung bleibt korrekt, nur
 * die Reihenfolge ist wieder eine Laune der Datenbank.
 */
export function fefoAbbuchung(
  tx: Tx,
  args: {
    artikelId: string;
    menge: number;
    lagerortId?: string;
    quelle: Quelle;
    kommentar: string | null;
    referenz: string | null;
    typ?: "entnahme" | "korrektur" | "umlagerung";
  },
): { gebucht: number; teile: Teil[] } {
  const {
    artikelId, menge, lagerortId = HANDLAGER_ID, quelle, kommentar, referenz,
    typ = "entnahme",
  } = args;

  const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  // EINE aggregierende Abfrage MIT Lagerort-Praedikat — statt der Vollladung.
  const rest = restJeChargeFuerArtikel(tx, artikelId, lagerortId);
  const chargenRest: ChargeRest[] = chs.map((c) => ({
    chargeId: c.id, verfall: c.verfall, rest: rest.get(c.id) ?? 0, createdAt: c.createdAt,
  }));

  const teile = fefoVerteilung(chargenRest, menge);
  let gebucht = 0;
  for (const teil of teile) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ, artikelId, chargeId: teil.chargeId,
      lagerortId,
      // VORZEICHENBEHAFTET: ein Abgang ist negativ (`schema.ts:98`).
      menge: -teil.menge,
      quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId, referenz, kommentar,
    }).run();
    gebucht += teil.menge;
  }
  return { gebucht, teile };
}
