import { druckTag, druckTitel } from "@/core/druck/titel";

/**
 * Name des Mietvertrags einer Anfrage, als Dateiname beim Herunterladen und als Titel in der PDF: Mietsache und
 * erster Miettag, bei der unterschriebenen Fassung mit Zusatz. Nie der Name der hochgeladenen Datei: der kam
 * als „IDA.pdf“ aus einem Browserdruck, und eine fotografierte Fassung hieße „IMG_1234“.
 */
export function vertragTitel(von: number, unterschrieben: boolean): string {
  return druckTitel([`Mietvertrag Bar ${druckTag(von)}`, unterschrieben && "unterschrieben"]);
}

export function vertragDateiname(von: number, unterschrieben: boolean): string {
  return `${vertragTitel(von, unterschrieben)}.pdf`;
}
