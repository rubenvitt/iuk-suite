/**
 * Was die Auswahl im Erstimport bewirkt, in Zahlen — für den Knopf und die Rückfrage (IDA-384). Gezählt
 * wird je Vorschlag, nicht je Zeile der Apps: ein neues Fahrzeug ist ein Vorschlag, auch wenn drei Apps es
 * führen.
 *
 * KEIN "use client" (Falle 6): reine Funktionen, in Vitest ohne DOM prüfbar.
 */
import type { Entscheidungen, Wahl } from "./anwenden";
import type { Vorschlag } from "./plan";

export interface Auswahlsumme {
  /** Neue Stammfahrzeuge, die entstehen. */
  anlegen: number;
  /** Vorschläge, die einem Fahrzeug zugeordnet werden (vorhandenem oder neu angelegtem). */
  zuordnen: number;
  /** Offene Vorschläge, die als „kein Fahrzeug“ vermerkt werden. */
  ohne: number;
}

/**
 * Die Entscheidungen, wie sie an den Server gehen. Eine Wahl auf ein inzwischen abgewähltes neues
 * Fahrzeug fällt weg, statt still ins Leere zu zeigen.
 */
export function entscheidungen(uebernehmen: ReadonlySet<string>, offen: Readonly<Record<string, Wahl>>): Entscheidungen {
  const gueltig = Object.fromEntries(Object.entries(offen).filter(([, w]) => w.art !== "vorschlag" || uebernehmen.has(w.schluessel)));
  return { uebernehmen: [...uebernehmen], offen: gueltig };
}

export function auswahlsumme(vorschlaege: readonly Vorschlag[], e: Entscheidungen): Auswahlsumme {
  const haken = new Set(e.uebernehmen);
  const summe: Auswahlsumme = { anlegen: 0, zuordnen: 0, ohne: 0 };
  for (const v of vorschlaege) {
    if (v.ziel.art === "offen") {
      const wahl = e.offen[v.schluessel];
      if (wahl?.art === "kein") summe.ohne += 1;
      else if (wahl) summe.zuordnen += 1;
    } else if (haken.has(v.schluessel)) {
      if (v.ziel.art === "neu") summe.anlegen += 1;
      else summe.zuordnen += 1;
    }
  }
  return summe;
}

export const nichtsGewaehlt = (s: Auswahlsumme): boolean => s.anlegen + s.zuordnen + s.ohne === 0;

/** „51 anlegen, 8 zuordnen, 2 ohne Fahrzeug“ — nur, was vorkommt. */
export function knopfText(s: Auswahlsumme): string {
  const teile = [
    s.anlegen > 0 ? `${s.anlegen} anlegen` : null,
    s.zuordnen > 0 ? `${s.zuordnen} zuordnen` : null,
    s.ohne > 0 ? `${s.ohne} ohne Fahrzeug` : null,
  ].filter(Boolean);
  return teile.length > 0 ? `Übernehmen: ${teile.join(", ")}` : "Übernehmen";
}

const fahrzeuge = (n: number) => (n === 1 ? "1 Fahrzeug" : `${n} Fahrzeuge`);
const vorschlaegeText = (n: number) => (n === 1 ? "1 Vorschlag" : `${n} Vorschläge`);

/** Titel und Satz der Rückfrage vor dem Anwenden. */
export function rueckfrage(s: Auswahlsumme): { titel: string; text: string } {
  const titel = s.anlegen > 0 ? `${fahrzeuge(s.anlegen)} neu anlegen?` : "Zuordnungen übernehmen?";
  const saetze = [
    s.anlegen > 0 ? `In der Fahrzeugverwaltung entstehen ${fahrzeuge(s.anlegen)}.` : "Es entsteht kein neues Fahrzeug.",
    s.zuordnen > 0 ? `${vorschlaegeText(s.zuordnen)} ${s.zuordnen === 1 ? "wird" : "werden"} einem Fahrzeug zugeordnet.` : null,
    s.ohne > 0 ? `${vorschlaegeText(s.ohne)} ${s.ohne === 1 ? "wird" : "werden"} als „kein Fahrzeug“ vermerkt.` : null,
  ].filter(Boolean);
  return { titel, text: saetze.join(" ") };
}
