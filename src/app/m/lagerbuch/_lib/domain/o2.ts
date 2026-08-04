/**
 * Sauerstoff — Fuellstand und Ampel. Kein "use client", kein Datenbankzugriff.
 */
import type { Ampel } from "./verfall";

/** Ampel-Schwellen fuer den Fuellstand in % vom Nennfuelldruck. Die Einheit steht
 *  im Namen (§10.1). Konstanten, keine Env — sie waren es nie. */
export const O2_AMPEL_ROT_PROZENT = 25; // < 25 % → rot (niedrig, Warnung)
export const O2_AMPEL_GELB_PROZENT = 50; // < 50 % → gelb (mittel)

export type O2Status = { prozent: number; ampel: Ampel; niedrig: boolean };

/**
 * Fuellstand in Prozent, gerundet.
 *
 * NICHT auf 100 geklemmt (§5.12, Eigenschaft 1): Ueberfuellung bleibt sichtbar.
 * `nenn <= 0` liefert 0 % — kein Fehler und keine Division durch null.
 *
 * ⚠️ ES GIBT HIER KEINEN `?? 200`-RUECKFALL, und in diesem Modul gibt es ihn
 * nirgends (§5.12). Fuer eine 300-bar-Flasche skalierte er den Fuellstand STILL
 * FALSCH: 150 bar erschienen als 75 % statt der wahren 50 %, und die Ampel
 * spraenge von „gelb" auf „gruen". Fehlt der Nennfuelldruck in allen verfuegbaren
 * Quellen, liefert die ZEILE `null` und die Anzeige „Nennfuelldruck unbekannt";
 * die Funktion hier wird dann gar nicht erst gerufen. Der Riegel liegt in
 * `_lib/lesepfade/checks.ts` und `_lib/lesepfade/o2.ts`.
 */
export function fuellstandProzent(druckBar: number, nennfuelldruckBar: number): number {
  if (nennfuelldruckBar <= 0) return 0;
  return Math.round((druckBar / nennfuelldruckBar) * 100);
}

/** Prozent + Ampel + Warnkennzeichen. `niedrig` ist genau `ampel === "rot"`. */
export function o2Status(druckBar: number, nennfuelldruckBar: number): O2Status {
  const prozent = fuellstandProzent(druckBar, nennfuelldruckBar);
  let ampel: Ampel;
  if (prozent < O2_AMPEL_ROT_PROZENT) ampel = "rot";
  else if (prozent < O2_AMPEL_GELB_PROZENT) ampel = "gelb";
  else ampel = "gruen";
  return { prozent, ampel, niedrig: ampel === "rot" };
}
