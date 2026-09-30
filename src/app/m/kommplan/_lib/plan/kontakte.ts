import { KONTAKT_ARTEN, type Kontakt, type KontaktArt } from "./schema";

/** Die Zeilenfolge der Excel-Vorlage: ◇, Digitalfunk, Telefon, Handy, Fax, PC — Sonstiges zuletzt. */
export const KONTAKT_REIHENFOLGE: readonly KontaktArt[] = KONTAKT_ARTEN;

/**
 * Die Kontaktzeilen einer Karte in fester Reihenfolge (Spec §4.2). Mit `leerzeilen` bekommt jede
 * Art außer „Sonstiges" eine Zeile, auch ohne Wert — dort wird im Einsatz von Hand eingetragen.
 */
export function kontaktZeilen(kontakte: readonly Kontakt[], leerzeilen: boolean): { art: KontaktArt; wert: string }[] {
  const zeilen: { art: KontaktArt; wert: string }[] = [];
  for (const art of KONTAKT_REIHENFOLGE) {
    const werte = kontakte.filter((k) => k.art === art).map((k) => k.wert.trim()).filter((w) => w !== "");
    if (werte.length > 0) for (const wert of werte) zeilen.push({ art, wert });
    else if (leerzeilen && art !== "sonstiges") zeilen.push({ art, wert: "" });
  }
  return zeilen;
}
