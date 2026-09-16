/**
 * DER ZUGANG — transaktionsFREI (Festlegung H3), wie `abbuchung` und
 * `umlagerung` daneben. Kein "use client", kein Icon-Import.
 *
 * ⚠️ WARUM ES DIESE DATEI SEIT DRK-313 GIBT: den Zugang buchen jetzt ZWEI
 * Flaechen — der Artikel-Drawer der Verwaltung (`bucheZugang`) und die
 * Auffuellansicht der GF (`bucheAuffuellung`). Vorher stand der Vorgang
 * ausgeschrieben in `_actions/buchung.ts`, und das war richtig, solange es
 * einen Aufrufer gab. Bei zwei Aufrufern haengen drei Invarianten daran, und
 * jede einzelne faellt STILL aus, wenn die zweite Fassung sie vergisst:
 *
 *  1. **I5 — die Charge gehoert zu diesem Artikel.** Ohne die Pruefung steigt
 *     der Bestand des FALSCHEN Artikels, und FEFO findet die Charge nie wieder
 *     („phantom, un-withdrawable Bestand"). Das Journal ist append-only.
 *  2. **Das Ziel ist ein gueltiger, AKTIVER Ort des Handlagers.** Ohne sie
 *     entschiede der Fremdschluessel — und der laesst ein FAHRZEUG klaglos
 *     durch, weil es eine gueltige `lagerorte.id` ist. Aus einem Wareneingang
 *     wuerde still eine Fahrzeugbuchung.
 *  3. **Ein Zugang loescht die Bestellt-Markierung** (§5.5). Eine Markierung,
 *     die die Lieferung ueberlebt, fuehrt die Position dauerhaft als
 *     „bestellt" — und die Bestelliste schlaegt sie nie wieder vor.
 *
 * ⚠️ DIE DREI WUERFE SIND KEINE FEHLERTEXTE FUER DEN SCHIRM. Sie rollen die
 * Transaktion zurueck; wie die Lage der Person erklaert wird, entscheidet die
 * aufrufende Action — und beide pruefen dieselben Lagen VORHER noch einmal, mit
 * einem Satz statt eines Wurfs. Diese Pruefungen hier sind die letzte Bank, die
 * auch eine manipulierte Nutzlast haelt, nicht die erste.
 */
import { eq } from "drizzle-orm";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import type { Quelle, Tx } from "./abbuchung";

/**
 * DIE CHARGE EINES ZUGANGS — entweder eine bestehende oder eine neue.
 *
 * ⚠️ EINE UNION UND NICHT ZWEI OPTIONALE FELDER. `{ chargeId?, neueCharge? }`
 * hat vier Zustaende, von denen zwei Unsinn sind (beide gesetzt, keins
 * gesetzt); beide Actions mussten sie bisher mit einem `refine` wegschneiden.
 * Die Union hat zwei Zustaende, und der Compiler haelt sie.
 */
export type ZugangCharge =
  | { art: "vorhanden"; chargeId: string }
  | { art: "neu"; chargenNr: string; verfall: string };

/**
 * Bucht `menge` als Wareneingang an `lagerortId` und gibt die Charge zurueck,
 * auf die gebucht wurde — bei `art: "neu"` die frisch angelegte.
 */
export function zugangBuchen(
  tx: Tx,
  args: {
    artikelId: string;
    menge: number;
    /** `HANDLAGER_ID` heisst „im Handlager, Schrank noch nicht zugeordnet". */
    lagerortId: string;
    charge: ZugangCharge;
    quelle: Quelle;
    kommentar: string | null;
    referenz: string | null;
  },
): { chargeId: string } {
  const { artikelId, menge, lagerortId, charge, quelle, kommentar, referenz } = args;

  let chargeId: string;
  if (charge.art === "neu") {
    chargeId = newId();
    tx.insert(chargen)
      .values({
        id: chargeId,
        artikelId,
        chargenNr: charge.chargenNr,
        verfall: charge.verfall,
        createdAt: new Date(),
      })
      .run();
  } else {
    // I5 — siehe Punkt 1 im Kopf dieser Datei.
    chargeId = charge.chargeId;
    const zeile = tx.select().from(chargen).where(eq(chargen.id, chargeId)).get();
    if (!zeile || zeile.artikelId !== artikelId) {
      throw new Error("Charge gehört nicht zu diesem Artikel");
    }
  }

  if (lagerortId !== HANDLAGER_ID) {
    // DREI BEDINGUNGEN, EIN SATZ: existiert der Ort, haengt er am Handlager,
    // ist er aktiv? Ohne diese Pruefung entschiede der Fremdschluessel — und
    // der meldet „FOREIGN KEY constraint failed".
    const ort = tx.select().from(lagerorte).where(eq(lagerorte.id, lagerortId)).get();
    if (!ort || ort.parentId !== HANDLAGER_ID || !ort.aktiv) {
      throw new Error("Ziel ist kein gültiger, aktiver Schrank im Handlager");
    }
  }

  tx.insert(buchungen)
    .values({
      id: newId(),
      ts: new Date(),
      typ: "zugang",
      artikelId,
      chargeId,
      lagerortId,
      menge,
      quelleTyp: quelle.quelleTyp,
      quelleId: quelle.quelleId,
      referenz,
      kommentar,
    })
    .run();

  // §5.5 — siehe Punkt 3 im Kopf dieser Datei.
  tx.update(artikel).set({ bestelltAt: null }).where(eq(artikel.id, artikelId)).run();

  return { chargeId };
}
