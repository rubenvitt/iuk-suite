import { METRIK, type Schnitt } from "../zeichen/grundlagen";
import { PT_IN_MM } from "./masse";

/**
 * Textmessung ohne DOM: Server und Browser rechnen dieselben Breiten (Spec §5.1). Gerendert
 * wird in Arimo — dieselbe Schrift, aus der die Vorschübe stammen.
 */
const AUSLASSUNG = "…";
const BRUCHSTELLEN = new Set(["-", "/", "@", ".", "_"]);

function vorschub(s: Schnitt, cp: number): number {
  return s.vorschub[String(cp)] ?? METRIK.ersatz;
}

export function textBreite(text: string, pt: number, fett = false): number {
  const s = fett ? METRIK.fett : METRIK.normal;
  let summe = 0;
  let vorher: number | null = null;
  for (const zeichen of text) {
    const cp = zeichen.codePointAt(0)!;
    summe += vorschub(s, cp);
    if (vorher !== null) summe += s.unterschneidung[String(vorher)]?.[String(cp)] ?? 0;
    vorher = cp;
  }
  return (summe / METRIK.einheitenProEm) * pt * PT_IN_MM;
}

/** y der Grundlinie, wenn eine Zeile der Höhe `hoehe` bei `oben` beginnt (senkrecht zentriert). */
export function grundlinie(oben: number, hoehe: number, pt: number): number {
  const groesse = pt * PT_IN_MM;
  const auf = METRIK.aufstieg / METRIK.einheitenProEm;
  const ab = METRIK.abstieg / METRIK.einheitenProEm;
  return oben + (hoehe - (auf + ab) * groesse) / 2 + auf * groesse;
}

export function kuerze(text: string, maxBreite: number, pt: number, fett: boolean): { text: string; gekuerzt: boolean } {
  if (textBreite(text, pt, fett) <= maxBreite) return { text, gekuerzt: false };
  const zeichen = [...text];
  while (zeichen.length > 0 && textBreite(zeichen.join("").trimEnd() + AUSLASSUNG, pt, fett) > maxBreite) zeichen.pop();
  return { text: zeichen.join("").trimEnd() + AUSLASSUNG, gekuerzt: true };
}

/** Längstes Präfix von `wort`, das passt — bevorzugt bis einschließlich der letzten Bruchstelle. */
function teileWort(wort: string, maxBreite: number, pt: number, fett: boolean): [string, string] {
  const zeichen = [...wort];
  let passt = 0;
  while (passt < zeichen.length && textBreite(zeichen.slice(0, passt + 1).join(""), pt, fett) <= maxBreite) passt++;
  if (passt === 0) passt = 1; // ein einzelnes Zeichen passt immer „irgendwie" — nie endlos schleifen
  let schnitt = passt;
  for (let i = passt - 1; i > 0; i--) {
    if (BRUCHSTELLEN.has(zeichen[i - 1])) { schnitt = i; break; }
  }
  return [zeichen.slice(0, schnitt).join(""), zeichen.slice(schnitt).join("")];
}

export function umbrechen(
  text: string, maxBreite: number, pt: number, fett: boolean, maxZeilen: number,
): { zeilen: string[]; gekuerzt: boolean } {
  const woerter = text.split(/\s+/).filter((w) => w.length > 0);
  if (woerter.length === 0) return { zeilen: [""], gekuerzt: false };
  const zeilen: string[] = [];
  let aktuell = "";
  const warteschlange = [...woerter];
  while (warteschlange.length > 0) {
    const wort = warteschlange.shift()!;
    const versuch = aktuell === "" ? wort : `${aktuell} ${wort}`;
    if (textBreite(versuch, pt, fett) <= maxBreite) { aktuell = versuch; continue; }
    if (aktuell !== "") { zeilen.push(aktuell); aktuell = ""; warteschlange.unshift(wort); continue; }
    const [kopf, rest] = teileWort(wort, maxBreite, pt, fett);
    zeilen.push(kopf);
    if (rest) warteschlange.unshift(rest);
  }
  if (aktuell !== "") zeilen.push(aktuell);
  if (zeilen.length <= maxZeilen) return { zeilen, gekuerzt: false };
  const behalten = zeilen.slice(0, maxZeilen);
  const letzte = `${behalten[maxZeilen - 1]} ${zeilen.slice(maxZeilen).join(" ")}`;
  behalten[maxZeilen - 1] = kuerze(letzte, maxBreite, pt, fett).text;
  return { zeilen: behalten, gekuerzt: true };
}
