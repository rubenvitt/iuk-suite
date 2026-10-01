import { gueltig, PlanFehler } from "./operationen";
import type { PlanInhalt, Verbindung, VerbindungsArt } from "./schema";

/**
 * Die Verbindungen EINES Plans (Spec §4.2, §6.4). „Reserve" ist in der Legende, was weder Weg zur
 * Elternstelle (`verbindungId` einer Stelle MIT Elternstelle) noch Kanal einer Stelle (`kanaele`,
 * Phase-1-Abweichung 12) ist — dieselbe Regel wie `legende()` in `_lib/layout/zeichne.ts`, die die
 * `verbindungId` einer Wurzel ausdrücklich nicht als Weg zählt.
 */
export interface Nutzung { eltern: number; kanal: number }

export function verbindungsNutzung(inhalt: PlanInhalt): Map<string, Nutzung> {
  const n = new Map(inhalt.verbindungen.map((v) => [v.id, { eltern: 0, kanal: 0 }]));
  for (const s of inhalt.stellen) {
    if (s.eltern !== null && s.verbindungId !== null) n.get(s.verbindungId)!.eltern += 1;
    for (const k of s.kanaele) n.get(k)!.kanal += 1;
  }
  return n;
}

export function istReserve(inhalt: PlanInhalt, id: string): boolean {
  const n = verbindungsNutzung(inhalt).get(id);
  return n !== undefined && n.eltern === 0 && n.kanal === 0;
}

function verbindungOder(inhalt: PlanInhalt, id: string): Verbindung {
  const v = inhalt.verbindungen.find((x) => x.id === id);
  if (!v) throw new PlanFehler(`Verbindung ${id} gibt es nicht`);
  return v;
}

function bezeichnung(roh: string): string {
  const b = roh.trim();
  if (b === "") throw new PlanFehler("Die Verbindung braucht eine Bezeichnung.");
  return b;
}

export function legeVerbindungAn(inhalt: PlanInhalt, v: Verbindung): PlanInhalt {
  return gueltig({ ...inhalt, verbindungen: [...inhalt.verbindungen, { ...v, bezeichnung: bezeichnung(v.bezeichnung) }] });
}

export function aendereVerbindung(inhalt: PlanInhalt, id: string, aenderung: Partial<Pick<Verbindung, "art" | "bezeichnung">>): PlanInhalt {
  verbindungOder(inhalt, id);
  const neu = aenderung.bezeichnung === undefined ? aenderung : { ...aenderung, bezeichnung: bezeichnung(aenderung.bezeichnung) };
  return gueltig({ ...inhalt, verbindungen: inhalt.verbindungen.map((v) => (v.id === id ? { ...v, ...neu } : v)) });
}

export function loescheVerbindung(inhalt: PlanInhalt, id: string): PlanInhalt {
  const v = verbindungOder(inhalt, id);
  if (!istReserve(inhalt, id)) throw new PlanFehler(`„${v.bezeichnung}“ wird noch benutzt und lässt sich nicht löschen.`);
  // Eine Wurzel darf die Verbindung noch tragen (kein Weg, s. oben) — dort wird sie mit gelöscht.
  return gueltig({
    ...inhalt,
    verbindungen: inhalt.verbindungen.filter((x) => x.id !== id),
    stellen: inhalt.stellen.map((s) => (s.verbindungId === id ? { ...s, verbindungId: null } : s)),
  });
}

export function findeVerbindung(inhalt: PlanInhalt, bez: string, art: VerbindungsArt): Verbindung | undefined {
  const b = bez.trim().toLocaleLowerCase("de");
  return inhalt.verbindungen.find((v) => v.art === art && v.bezeichnung.trim().toLocaleLowerCase("de") === b);
}
