import { ampelTon, type AmpelTon } from "../../../_lib/format";
import { standortZeile } from "../../../_lib/konstanten";
import type { BzGeraetZeile } from "../../../_lib/lesepfade/bz";
import { fmtTs } from "../../../_lib/zeit";

type FaelligkeitTextWerte = Pick<
  BzGeraetZeile["faelligkeit"],
  "nieGeprueft" | "ueberfaellig" | "tageBisFaellig"
>;

export type BzAnzeigeZeile = {
  id: string;
  name: string;
  barcode: string | null;
  /** Volle Standortzeile — Begruendung an `GeraetAnzeigeZeile`. */
  standortText: string;
  aktiv: boolean;
  faelligkeitTon: AmpelTon;
  faelligkeitText: string;
  letzteKontrolleText: string | null;
  /**
   * ⚠️ ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt.
   * `letzteKontrolleText` ist „TT.MM. HH:MM" und ordnete als Zeichenkette den
   * 2. Oktober vor den 14. September.
   */
  letzteKontrolleIso: string | null;
  faellig: boolean;
  /**
   * DRK-311 — der Kommentar der LETZTEN Kontrolle, `null` wenn es keinen gab.
   * Die Herkunft (und warum es nicht „die letzte nicht-leere Bemerkung" ist)
   * steht an `BzGeraetZeile.letzteBemerkung`.
   */
  letzteBemerkungText: string | null;
  /**
   * DRK-311 — der Aufmerksamkeitshinweis, `null` wenn keine Beachtung noetig
   * ist. ⚠️ ZWEI FELDER, NICHT EINS: eine Bemerkung ist keine Warnung, und der
   * gelbe Status entsteht ausschliesslich daraus, dass ein Mensch ihn gesetzt
   * hat (`domain/bz.ts#bzBeachtung`).
   */
  beachtungHinweis: string | null;
  /** „seit 12.08. 09:15", sonst `null`. Die Standzeit ist die Zahl, an der
   *  auffaellt, dass sich um einen Hinweis niemand kuemmert. */
  beachtungSeitText: string | null;
};

export function faelligText(faelligkeit: FaelligkeitTextWerte): string {
  if (faelligkeit.nieGeprueft) return "noch nie geprüft";
  if (faelligkeit.ueberfaellig) {
    return `überfällig (seit ${Math.abs(faelligkeit.tageBisFaellig ?? 0)} Tagen)`;
  }
  if (faelligkeit.tageBisFaellig === 0) return "heute fällig";
  return `fällig in ${faelligkeit.tageBisFaellig ?? 0} Tagen`;
}

export function bzAnzeigeZeilen(zeilen: BzGeraetZeile[]): BzAnzeigeZeile[] {
  return zeilen.map((zeile) => ({
    id: zeile.id,
    name: zeile.name,
    barcode: zeile.barcode,
    standortText: standortZeile(zeile.lagerortStandort),
    aktiv: zeile.aktiv,
    faelligkeitTon: ampelTon(zeile.faelligkeit.ampel),
    faelligkeitText: faelligText(zeile.faelligkeit),
    letzteKontrolleText: zeile.letzteKontrolle === null
      ? null
      : fmtTs(zeile.letzteKontrolle),
    letzteKontrolleIso: zeile.letzteKontrolle === null
      ? null
      : zeile.letzteKontrolle.toISOString(),
    faellig: zeile.faelligkeit.ampel !== "gruen",
    letzteBemerkungText: zeile.letzteBemerkung,
    beachtungHinweis: zeile.beachtung.hinweis,
    beachtungSeitText: zeile.beachtung.seit === null
      ? null
      : `seit ${fmtTs(zeile.beachtung.seit)}`,
  }));
}
