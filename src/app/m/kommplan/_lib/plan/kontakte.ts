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

/** Anzeigenamen im Flyin (Spec §6.4 „Kontakte: Zeilen Art + Wert"). */
export const KONTAKT_NAME: Record<KontaktArt, string> = {
  funkrufname: "Funkrufname", digitalfunk: "Digitalfunk", telefon: "Telefon", mobil: "Mobil",
  fax: "Fax", email: "E-Mail", sonstiges: "Sonstiges",
};

/**
 * FESTE ZEILEN JE ART im Flyin (Umsetzungsplan Phase 2, Entscheidung 16) — wie die Excel-Karte eine
 * Zeile je Art hat. Ein Feld ist (Art, n): das n-te Vorkommen dieser Art im Array. Jede Art hat
 * mindestens ein Feld; ohne Eintrag ist es leer (`vorhanden: false`). Das Datenmodell (§4.2) bleibt:
 * ein leeres Feld IST „kein Kontakt dieser Art", die Karte lässt leere Werte ohnehin weg.
 */
export interface KontaktFeld { art: KontaktArt; n: number; wert: string; vorhanden: boolean }

const stellenDerArt = (kontakte: readonly Kontakt[], art: KontaktArt) =>
  kontakte.flatMap((k, i) => (k.art === art ? [i] : []));

export function kontaktFelder(kontakte: readonly Kontakt[]): KontaktFeld[] {
  return KONTAKT_REIHENFOLGE.flatMap((art): KontaktFeld[] => {
    const eigene = kontakte.filter((k) => k.art === art);
    return eigene.length === 0
      ? [{ art, n: 0, wert: "", vorhanden: false }]
      : eigene.map((k, n) => ({ art, n, wert: k.wert, vorhanden: true }));
  });
}

/**
 * Tippen in ein leeres Feld legt an; Leeren des EINZIGEN Eintrags einer Art entfernt ihn (das Feld
 * bleibt als leeres stehen, der Fokus also auch). Bei Doppelten bleibt ein geleerter Eintrag als
 * leerer stehen — sonst rutschte der nächste in dieses Feld, mitten beim Tippen.
 */
export function setzeKontakt(kontakte: readonly Kontakt[], art: KontaktArt, n: number, wert: string): Kontakt[] {
  const idx = stellenDerArt(kontakte, art);
  if (n >= idx.length) return wert === "" ? (kontakte as Kontakt[]) : [...kontakte, { art, wert }];
  if (wert === "" && idx.length === 1) return kontakte.filter((_, i) => i !== idx[0]);
  return kontakte.map((k, i) => (i === idx[n] ? { ...k, wert } : k));
}

/** „Weiterer Kontakt": nur wenn es von der Art schon einen gibt — sonst ist das leere Feld schon da. */
export function weitererKontakt(kontakte: readonly Kontakt[], art: KontaktArt): Kontakt[] {
  return stellenDerArt(kontakte, art).length === 0 ? (kontakte as Kontakt[]) : [...kontakte, { art, wert: "" }];
}

export function entferneKontakt(kontakte: readonly Kontakt[], art: KontaktArt, n: number): Kontakt[] {
  const i = stellenDerArt(kontakte, art)[n];
  return i === undefined ? (kontakte as Kontakt[]) : kontakte.filter((_, j) => j !== i);
}
