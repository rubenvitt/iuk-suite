import { ampelTon, type AmpelTon } from "../../../_lib/format";
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
  lagerortName: string;
  aktiv: boolean;
  faelligkeitTon: AmpelTon;
  faelligkeitText: string;
  letzteKontrolleText: string | null;
  faellig: boolean;
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
    lagerortName: zeile.lagerortName,
    aktiv: zeile.aktiv,
    faelligkeitTon: ampelTon(zeile.faelligkeit.ampel),
    faelligkeitText: faelligText(zeile.faelligkeit),
    letzteKontrolleText: zeile.letzteKontrolle === null
      ? null
      : fmtTs(zeile.letzteKontrolle),
    faellig: zeile.faelligkeit.ampel !== "gruen",
  }));
}
