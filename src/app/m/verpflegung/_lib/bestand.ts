/**
 * IDA-382 — DER BESTAND JE ARTIKEL. Eine Zeile je Artikel, darunter seine Chargen; die frühere MHD-Kontrolle ist
 * eine Stufe dieser Liste (`?stufe=`), damit jede Kennzahl der Übersicht genau ihre Chargen zeigt. Rein, ohne
 * `"use client"` (Falle 6): die Übersicht (Server) und die Liste (Client) rechnen gleich.
 */
import { fefo, runde, type MhdStatus } from "./mhd";
import type { ArtikelDTO, ChargeSicht } from "./typen";

export type Stufe = "alle" | "abgelaufen" | "kritisch" | "bald" | "mindest";
export const STUFEN: readonly Stufe[] = ["alle", "abgelaufen", "kritisch", "bald", "mindest"];
export const STUFE_TEXT: Record<Stufe, string> = {
  alle: "Alle", abgelaufen: "Abgelaufen", kritisch: "Kritisch", bald: "Bald", mindest: "Unter Mindestbestand",
};

export function stufeAus(roh: unknown): Stufe {
  return typeof roh === "string" && (STUFEN as readonly string[]).includes(roh) ? (roh as Stufe) : "alle";
}

/** Die Ampelstufen der Übersicht; dieselbe Abgrenzung wie ihre Kennzahlen. */
export function chargeInStufe(c: { status: MhdStatus }, stufe: Stufe): boolean {
  if (stufe === "abgelaufen") return c.status.abgelaufen;
  if (stufe === "kritisch") return !c.status.abgelaufen && c.status.ampel === "rot";
  if (stufe === "bald") return c.status.ampel === "gelb";
  return true;
}

/** Die Ampelstufe, in der eine Charge steht; Gegenstück zu `chargeInStufe`, damit Kennzahl und Link nicht auseinanderlaufen. */
export function stufeVon(c: { status: MhdStatus }): Exclude<Stufe, "alle" | "mindest"> {
  if (chargeInStufe(c, "abgelaufen")) return "abgelaufen";
  if (chargeInStufe(c, "kritisch")) return "kritisch";
  return "bald";
}

/** Wie viel eines Bestands gesperrt (Verbrauchsdatum über) und wie viel nur abgelaufen (MHD über) ist. */
export type Zustand = { gesperrt: number; abgelaufen: number };

export function zustandAus(chargen: readonly { menge: number; status: MhdStatus }[]): Zustand {
  let gesperrt = 0;
  let abgelaufen = 0;
  for (const c of chargen) {
    if (c.status.gesperrt) gesperrt += c.menge;
    else if (c.status.abgelaufen) abgelaufen += c.menge;
  }
  return { gesperrt: runde(gesperrt), abgelaufen: runde(abgelaufen) };
}

export interface ArtikelZeile {
  id: string;
  name: string;
  kategorie: string;
  einheit: string;
  vorlaeufig: boolean;
  mindest: number | null;
  /** Alles, was daliegt, auch Abgelaufenes. */
  gesamt: number;
  /** Was für den Mindestbestand zählt: ohne Abgelaufenes (`daten.ts`, `bestandJeArtikel`). */
  gueltig: number;
  zustand: Zustand;
  /** Die Chargen dieser Stufe, nach Ablauf zuerst. */
  chargen: ChargeSicht[];
  /** MHD der ersten gezeigten Charge, für die Sortierung; ohne Charge leer. */
  erstesMhd: string;
}

/**
 * Die Zeilen der Bestandsliste. Bei „Alle“ jeder aktive Artikel (auch ohne Bestand, damit man ihn am Schreibtisch
 * einbuchen kann); in einer Ampelstufe nur Artikel mit einer Charge darin, und nur diese Chargen; bei
 * „Unter Mindestbestand“ die Artikel, deren gültiger Bestand unter dem Mindestbestand liegt.
 */
export function artikelZeilen(artikel: readonly ArtikelDTO[], chargen: readonly ChargeSicht[], stufe: Stufe): ArtikelZeile[] {
  const je = new Map<string, ChargeSicht[]>();
  for (const c of chargen) je.set(c.artikelId, [...(je.get(c.artikelId) ?? []), c]);
  return artikel.flatMap((a) => {
    const alle = fefo(je.get(a.id) ?? []);
    if (!a.aktiv && alle.length === 0) return [];
    const gesamt = runde(alle.reduce((n, c) => n + c.menge, 0));
    const gueltig = runde(alle.filter((c) => !c.status.abgelaufen).reduce((n, c) => n + c.menge, 0));
    const gezeigt = alle.filter((c) => chargeInStufe(c, stufe));
    if ((stufe === "abgelaufen" || stufe === "kritisch" || stufe === "bald") && gezeigt.length === 0) return [];
    if (stufe === "mindest" && !(a.aktiv && a.mindest !== null && gueltig < a.mindest)) return [];
    return [{
      id: a.id, name: a.name, kategorie: a.kategorie, einheit: a.einheit, vorlaeufig: a.vorlaeufig, mindest: a.mindest,
      gesamt, gueltig, zustand: zustandAus(alle), chargen: gezeigt, erstesMhd: gezeigt[0]?.mhd ?? "",
    }];
  });
}
