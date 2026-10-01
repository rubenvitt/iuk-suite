import { baueBaum, versteckteAnzahl } from "../plan/baum";
import type { PlanInhalt, Stelle, Verbindung } from "../plan/schema";
import type { Darstellung, LayoutOptionen } from "./typen";

/**
 * Was von einem Plan gerade zu sehen ist: Einklappen (Ansichtszustand, Spec §5.7), Verweiskarten
 * und Anker eines Druckblatts (Spec §5.6). Die Layout-Engine liest den Plan nur durch diese Sicht.
 */
export interface Sicht {
  wurzeln: Stelle[];
  sichtbar: Stelle[];
  kinder(id: string): Stelle[];
  seiten(id: string): { links: Stelle[]; rechts: Stelle[] };
  darstellung(id: string): Darstellung;
  versteckt(id: string): number;
  eingeklappt(id: string): boolean;
  einklappbar(id: string): boolean;
  verbindung(id: string | null): Verbindung | null;
  tiefe(id: string): number;
}

const KEINE = { links: [] as Stelle[], rechts: [] as Stelle[] };

export function baueSicht(inhalt: PlanInhalt, optionen: LayoutOptionen = {}): Sicht {
  const baum = baueBaum(inhalt);
  const verbindungen = new Map(inhalt.verbindungen.map((v) => [v.id, v]));
  const ankerId = optionen.blatt?.ankerId ?? null;
  const blattWurzel = optionen.blatt ? baum.stelle(optionen.blatt.wurzelId) : undefined;
  if (optionen.blatt && !blattWurzel) throw new Error(`Blattwurzel ${optionen.blatt.wurzelId} fehlt`);

  const darstellung = (id: string): Darstellung => (id === ankerId ? "anker" : optionen.darstellung?.get(id) ?? "normal");
  const istVerweis = (id: string) => typeof darstellung(id) === "object";
  const zu = (id: string) => optionen.eingeklappt?.has(id) === true && baum.unter(id).length > 0 && darstellung(id) === "normal";
  const kinder = (id: string): Stelle[] => {
    if (id === ankerId && blattWurzel) return [blattWurzel];
    if (istVerweis(id) || zu(id) || darstellung(id) === "anker") return [];
    return baum.unter(id);
  };
  const seiten = (id: string) => (id === ankerId || istVerweis(id) ? KEINE : baum.seiten(id));

  const wurzeln = optionen.blatt ? [baum.stelle(ankerId ?? optionen.blatt.wurzelId)!] : baum.wurzeln;
  const sichtbar: Stelle[] = [];
  const tiefen = new Map<string, number>();
  const besuche = (s: Stelle, t: number) => {
    sichtbar.push(s); tiefen.set(s.id, t);
    const sei = seiten(s.id);
    for (const x of [...sei.links, ...sei.rechts]) { sichtbar.push(x); tiefen.set(x.id, t); }
    for (const k of kinder(s.id)) besuche(k, t + 1);
  };
  wurzeln.forEach((w) => besuche(w, 0));

  return {
    wurzeln, sichtbar, kinder, seiten, darstellung,
    versteckt: (id) => (zu(id) ? versteckteAnzahl(baum, id) : 0),
    eingeklappt: zu,
    einklappbar: (id) => id !== ankerId && darstellung(id) === "normal" && baum.unter(id).length > 0,
    verbindung: (id) => (id === null ? null : verbindungen.get(id) ?? null),
    tiefe: (id) => tiefen.get(id) ?? 0,
  };
}
