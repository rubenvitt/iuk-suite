/**
 * IST DAS RÜCKMELDE-FLYIN OFFEN? (IDA-214)
 *
 * Ein Flyin, drei Einstiege: das Nutzermenü (`SuiteNav`), der schwebende Knopf
 * (`RueckmeldungKnopf`, in `FullShell`) und die Portal-Kachel. Montiert ist das
 * Flyin genau einmal, in `SuiteNav`; die anderen beiden liegen in fremden
 * Teilbäumen und erreichen es nur über diesen kleinen Speicher. Dieselbe
 * Bauform wie `zustand.ts` nebenan, nur ohne `localStorage` — ein offenes Flyin
 * überlebt kein Neuladen, und das soll es auch nicht.
 *
 * KEIN `"use client"`: nur Funktionen, keine Komponente (Falle 6).
 */

export const ZU = "zu";
export const OFFEN = "offen";
export type FlyinStand = typeof ZU | typeof OFFEN;

let stand: FlyinStand = ZU;
const hoerer = new Set<() => void>();

function setze(neu: FlyinStand): void {
  if (stand === neu) return;
  stand = neu;
  for (const rueckruf of [...hoerer]) rueckruf();
}

export const oeffneRueckmeldung = (): void => setze(OFFEN);
export const schliesseRueckmeldung = (): void => setze(ZU);
export const liesFlyinStand = (): FlyinStand => stand;
/** Der Server rendert das Flyin nie offen. */
export const SERVER_FLYIN_STAND: FlyinStand = ZU;

/** Modulebene, damit `useSyncExternalStore` eine stabile Referenz bekommt. */
export function abonniereFlyin(rueckruf: () => void): () => void {
  hoerer.add(rueckruf);
  return () => {
    hoerer.delete(rueckruf);
  };
}
