import type { PlanInhalt, Stelle } from "./schema";

/** Gleiche Daten → gleiches Bild: sortiert wird nie nach Array-Position, sondern nach reihenfolge, dann id. */
export function ordne<T extends { reihenfolge: number; id: string }>(liste: readonly T[]): T[] {
  return [...liste].sort((a, b) => a.reihenfolge - b.reihenfolge || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface Baum {
  stelle(id: string): Stelle | undefined;
  wurzeln: Stelle[];
  unter(id: string): Stelle[];
  seiten(id: string): { links: Stelle[]; rechts: Stelle[] };
}

export function baueBaum(inhalt: PlanInhalt): Baum {
  const nachId = new Map(inhalt.stellen.map((s) => [s.id, s]));
  const unter = new Map<string, Stelle[]>();
  const links = new Map<string, Stelle[]>();
  const rechts = new Map<string, Stelle[]>();
  const wurzeln: Stelle[] = [];
  for (const s of inhalt.stellen) {
    if (s.eltern === null) { wurzeln.push(s); continue; }
    const ziel = s.lage === "unter" ? unter : s.lage === "links" ? links : rechts;
    ziel.set(s.eltern, [...(ziel.get(s.eltern) ?? []), s]);
  }
  const geordnet = (m: Map<string, Stelle[]>) => new Map([...m].map(([k, v]) => [k, ordne(v)]));
  const u = geordnet(unter), l = geordnet(links), r = geordnet(rechts);
  return {
    stelle: (id) => nachId.get(id),
    wurzeln: ordne(wurzeln),
    unter: (id) => u.get(id) ?? [],
    seiten: (id) => ({ links: l.get(id) ?? [], rechts: r.get(id) ?? [] }),
  };
}

export function nachkommen(baum: Baum, id: string): Stelle[] {
  const seiten = baum.seiten(id);
  return [...seiten.links, ...seiten.rechts, ...baum.unter(id).flatMap((k) => [k, ...nachkommen(baum, k.id)])];
}

export function versteckteAnzahl(baum: Baum, id: string): number {
  return baum.unter(id).reduce((n, k) => n + 1 + nachkommen(baum, k.id).length, 0);
}

export function teilbaumGroesse(baum: Baum, id: string): number {
  return 1 + nachkommen(baum, id).length;
}

export function tiefensuche(baum: Baum): Stelle[] {
  const aus: Stelle[] = [];
  const besuche = (s: Stelle) => {
    aus.push(s);
    const seiten = baum.seiten(s.id);
    aus.push(...seiten.links, ...seiten.rechts);
    baum.unter(s.id).forEach(besuche);
  };
  baum.wurzeln.forEach(besuche);
  return aus;
}
