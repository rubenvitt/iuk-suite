import { druckTag, druckTitel } from "@/core/druck/titel";
import { DOKUMENT_TITEL, type Dokumentart } from "./vermietungTypen";
import { uhrInZone } from "./zeit";

/**
 * Name eines Vermietungsdokuments einer Anfrage, als Dateiname beim Herunterladen und als Titel in der PDF: Art,
 * Mietsache, erster Miettag und Beginn (zwei Vermietungen am selben Tag sind möglich, ein Doppelpunkt geht in keinen
 * Dateinamen), bei der unterschriebenen Fassung mit Zusatz. Nie der Name der hochgeladenen Datei: der kam
 * als „IDA.pdf“ aus einem Browserdruck, und eine fotografierte Fassung hieße „IMG_1234“.
 */
export function dokumentTitel(art: Dokumentart, von: number, unterschrieben: boolean): string {
  return druckTitel([`${DOKUMENT_TITEL[art]} Bar ${druckTag(von)} ${uhrInZone(von).replace(":", ".")} Uhr`, unterschrieben && "unterschrieben"]);
}

export function dokumentDateiname(art: Dokumentart, von: number, unterschrieben: boolean): string {
  return `${dokumentTitel(art, von, unterschrieben)}.pdf`;
}

export const vertragTitel = (von: number, unterschrieben: boolean) => dokumentTitel("mietvertrag", von, unterschrieben);
export const vertragDateiname = (von: number, unterschrieben: boolean) => dokumentDateiname("mietvertrag", von, unterschrieben);
