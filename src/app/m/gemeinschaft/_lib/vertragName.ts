import { druckTag, druckTitel } from "@/core/druck/titel";
import { uhrInZone } from "./zeit";

/**
 * Name des Mietvertrags einer Anfrage, als Dateiname beim Herunterladen und als Titel in der PDF: Mietsache,
 * erster Miettag und Beginn (zwei Vermietungen am selben Tag sind möglich, ein Doppelpunkt geht in keinen
 * Dateinamen), bei der unterschriebenen Fassung mit Zusatz. Nie der Name der hochgeladenen Datei: der kam
 * als „IDA.pdf“ aus einem Browserdruck, und eine fotografierte Fassung hieße „IMG_1234“.
 */
export function vertragTitel(von: number, unterschrieben: boolean): string {
  return druckTitel([`Mietvertrag Bar ${druckTag(von)} ${uhrInZone(von).replace(":", ".")} Uhr`, unterschrieben && "unterschrieben"]);
}

export function vertragDateiname(von: number, unterschrieben: boolean): string {
  return `${vertragTitel(von, unterschrieben)}.pdf`;
}
