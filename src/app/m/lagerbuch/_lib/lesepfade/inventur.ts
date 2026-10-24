/**
 * DRK-299 — die Zeilen der Inventur. Kein "use client": `inventur/page.tsx`
 * (Server Component) liest sie und reicht nur diese serialisierbare Form an die
 * Client-Insel (Falle 6, Falle 9).
 *
 * DREI ABFRAGEN STATT 3·N — dasselbe Muster wie `artikelListe`: Artikel,
 * Bestand je Artikel, Rest je Charge (beide auf den BEREICH gescoped, DRK-337)
 * plus alle Chargen.
 *
 * Die Ampel wird HIER berechnet, damit das Formular weder Uhr noch Schwellen kennt.
 */
import { eq } from "drizzle-orm";
import { artikel, chargen } from "../../_db/schema";
import type { Lagerbereich } from "../domain/orte";
import { verfallSchwellen, verfallStatus, type Ampel } from "../domain/verfall";
import { HANDLAGER_ID } from "../konstanten";
import { vergleicheFefoCharge } from "./artikel";
import {
  bestandJeArtikelImBereich, restJeChargeAnOrt, restJeChargeImBereich, type Leser,
} from "./bestand";
import { handlagerOrte } from "./orte";

export type InventurCharge = {
  id: string; chargenNr: string; verfall: string;
  /** Rest IM GEZAEHLTEN BEREICH — kann 0 sein, wenn die Charge nur auf der Wurzel liegt. */
  rest: number;
  /**
   * IDA-276 — Rest dieser Charge auf „Nicht zugeordnet", aber NUR bei einer
   * Zaehlung vor einem Schrank; sonst 0 (dann steckt die Wurzel schon in `rest`).
   */
  ungeordnet: number;
  ampel: Ampel;
};

export type InventurZeile = {
  id: string; name: string; einheit: string; fach: string;
  kategorie: string | null; mindestbestand: number; bestand: number;
  /** IDA-276 — Summe von `chargen[].ungeordnet`: was auf „Nicht zugeordnet" auf Einsortieren wartet. */
  ungeordnet: number;
  /**
   * Rest > 0 IM BEREICH oder (IDA-276) auf „Nicht zugeordnet", FEFO-sortiert.
   * ⚠️ `chargen[0]` IST DESHALB NICHT MEHR OHNE WEITERES DAS NAECHSTE MHD AM
   * ORT — wer das braucht, filtert vorher auf `rest > 0` (`naechsteCharge`).
   */
  chargen: InventurCharge[];
};

/** Die FEFO-naechste Charge MIT Bestand am gezaehlten Ort — fuer die MHD-Anzeige. */
export function naechsteCharge(zeile: Pick<InventurZeile, "chargen">): InventurCharge | undefined {
  return zeile.chargen.find((c) => c.rest > 0);
}

/**
 * DRK-337 — `bereich` ist der Ortsbereich der Zaehlung (`zaehlBereich`), ohne
 * Angabe der ganze Handlager wie vor DRK-337. `bestand` und jeder Chargenrest
 * beziehen sich DARAUF: wer vor Schrank 3 steht, liest die Zahl, die dort
 * liegen soll, nicht die Summe ueber alle Orte.
 *
 * ⚠️ DIE ARTIKELLISTE BLEIBT VOLLSTAENDIG, auch wenn ein Artikel an diesem Ort
 * Bestand 0 hat. Eine Liste, die nur zeigt, was hier erwartet wird, koennte
 * ueberraschend Gefundenes nicht aufnehmen — und genau das ist der haeufigste
 * Grund, ueberhaupt zu zaehlen. Wer die Liste kuerzen will, filtert ueber
 * Kategorie und Fach im Spaltenkopf.
 */
export function inventurZeilen(
  db: Leser, now: Date = new Date(), bereich?: Lagerbereich,
): InventurZeile[] {
  const schwellen = verfallSchwellen();
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  const orte = bereich ?? handlagerOrte(db);
  const bestand = bestandJeArtikelImBereich(db, orte);
  const rest = restJeChargeImBereich(db, orte);
  /*
   * IDA-276 — VOR EINEM SCHRANK auch der Rest auf der Wurzel. Der Handlager
   * hatte lange keine Schraenke; was jetzt im Schrank gezaehlt wird, steht
   * buchhalterisch noch auf „Nicht zugeordnet" und soll von dort uebernommen
   * werden, statt im Schrank ein zweites Mal zu entstehen. Gehoert die Wurzel
   * zum Bereich (ganzer Handlager, „Nicht zugeordnet"), steht sie schon in `rest`.
   */
  const ungeordnet = orte.includes(HANDLAGER_ID)
    ? new Map<string, number>()
    : restJeChargeAnOrt(db, HANDLAGER_ID);
  const alleChargen = db.select().from(chargen).all();

  return arts.map((a) => {
    const liste = alleChargen
      .filter((c) => c.artikelId === a.id
        && ((rest.get(c.id) ?? 0) > 0 || (ungeordnet.get(c.id) ?? 0) > 0))
      .sort(vergleicheFefoCharge)
      .map((c) => ({
        id: c.id, chargenNr: c.chargenNr, verfall: c.verfall,
        rest: Math.max(rest.get(c.id) ?? 0, 0),
        ungeordnet: Math.max(ungeordnet.get(c.id) ?? 0, 0),
        ampel: verfallStatus(c.verfall, schwellen, now).ampel,
      }));
    return {
      id: a.id, name: a.name, einheit: a.einheit, fach: a.fach,
      kategorie: a.kategorie, mindestbestand: a.mindestbestand,
      bestand: bestand.get(a.id) ?? 0,
      ungeordnet: liste.reduce((summe, c) => summe + c.ungeordnet, 0),
      chargen: liste,
    };
  });
}
