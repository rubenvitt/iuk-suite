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
 *  2. **Das Ziel liegt im HANDLAGER-BEREICH und ist AKTIV.** Ohne sie
 *     entschiede der Fremdschluessel — und der laesst ein FAHRZEUG klaglos
 *     durch, weil es eine gueltige `lagerorte.id` ist. Aus einem Wareneingang
 *     wuerde still eine Fahrzeugbuchung.
 *  3. **Ein Zugang loescht die Bestellt-Markierung** (§5.5). Eine Markierung,
 *     die die Lieferung ueberlebt, fuehrt die Position dauerhaft als
 *     „bestellt" — und die Bestelliste schlaegt sie nie wieder vor.
 *
 * ⚠️ DIE DREI WUERFE SIND DIE LETZTE BANK, NICHT DIE ERSTE. Sie rollen die
 * Transaktion zurueck und halten auch eine manipulierte Nutzlast;
 * `bucheAuffuellung` beantwortet dieselben drei Lagen VORHER noch einmal mit
 * einem eigenen, laengeren Satz, weil ihre Flaeche keinen Platz fuer ein
 * Formularfeld hat.
 *
 * ⚠️ SIE SIND SEIT DRK-193 `BuchungAbgewiesen` UND NICHT `Error`, und das ist
 * die Zusage, die ihre Texte auf den Schirm traegt: `bucheZugang` hat keine
 * Vorabpruefung, ihr `catch` reicht genau diese Klasse durch und faengt alles
 * andere — ein SQLite-Text nahm vorher denselben Weg. Wer hier einen Wurf
 * ergaenzt und die Klasse vergisst, verliert den Satz still hinter dem
 * Rueckfall „Zugang konnte nicht gebucht werden."; die Begruendung steht in
 * `_lib/buchungAbgewiesen.ts`.
 */
import { eq } from "drizzle-orm";
import { artikel, buchungen, chargen, newId } from "../../_db/schema";
import { BuchungAbgewiesen } from "../buchungAbgewiesen";
import { HANDLAGER_ID } from "../konstanten";
import { handlagerOrte, ortStamm } from "../lesepfade/orte";
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
      throw new BuchungAbgewiesen("Charge gehört nicht zu diesem Artikel");
    }
  }

  /*
   * DER BEREICH, NICHT DER DIREKTE ELTERNTEIL — Codex-Befund P2 zu PR #174.
   *
   * ⚠️ HIER STAND `ort.parentId !== HANDLAGER_ID`, UND DAS WAR MIT DER AUSWAHL
   * NICHT MEHR EINIG. `handlagerSchraenke` (und damit `zugangsZiele`, die die
   * Wahl fuellt) steigt ueber `teilbaum` BELIEBIG TIEF ab; ein Ort unterhalb
   * eines Schranks stand also zur Wahl und wurde hier unten trotzdem
   * abgewiesen — eine angebotene Buchung, die immer scheitert.
   *
   * ⚠️ HEUTE UNERREICHBAR, ABER NICHT HARMLOS: `createSchrank` verdrahtet
   * `parentId: HANDLAGER_ID`, tiefere Orte koennen also nur aus einem Import
   * kommen. Genau darauf ist `teilbaum` aber gebaut — `zaehlBereich`
   * (`_lib/lesepfade/orte.ts`) schreibt es aus: „Schraenke haben heute keine
   * Kinder, aber ein spaeter eingehaengter Ort fiele sonst still aus der
   * Zaehlung." Diese Pruefung war die einzige Stelle, die das anders sah.
   *
   * Die Bauform ist die von `bucheUmlagerung`, die dieselbe Frage schon so
   * stellt: Mengenlehre ueber `handlagerOrte`, kein Elternteil-Vergleich.
   */
  const bereich = new Set(handlagerOrte(tx));
  if (!bereich.has(lagerortId)) {
    throw new BuchungAbgewiesen("Ziel ist kein Ort im Handlager");
  }
  /*
   * ⚠️ DIE WURZEL BLEIBT VON DER AKTIV-PROBE AUSGENOMMEN, wie bisher: sie ist
   * kein Schrank, den man stilllegt, sondern das „noch nicht zugeordnet" des
   * Handlagers. Waere sie einbezogen, haenge der Altbestands-Weg an einem Feld,
   * das keine Oberflaeche setzt.
   */
  if (lagerortId !== HANDLAGER_ID && !ortStamm(tx).get(lagerortId)?.aktiv) {
    throw new BuchungAbgewiesen("Ziel ist kein gültiger, aktiver Schrank im Handlager");
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
