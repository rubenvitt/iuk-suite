import { KONTAKT_REIHENFOLGE } from "../plan/kontakte";
import {
  planInhaltSchema, type Einheit, type Kontakt, type KontaktArt, type Lage, type PlanInhalt, type PlanOptionen,
  type Stelle, type Verbindung,
} from "../plan/schema";

/**
 * Ein kleiner Baukasten für Beispielpläne, Seed und Tests — lesbarer als rohe PlanInhalt-Literale.
 * Die Reihenfolge ergibt sich aus der Eingabereihenfolge unter Geschwistern derselben Lage.
 */
export type EinheitEingabe = string | readonly [typ: string, rufname: string];
export type StelleEingabe = {
  id: string; titel: string; eltern?: string | null; lage?: Lage; zeichen?: string | null; leiter?: string | null;
  hervorheben?: boolean; verbindung?: string | null; kanaele?: string[];
  kontakte?: Partial<Record<KontaktArt, string | string[]>>;
  einheiten?: EinheitEingabe[];
};

function einheitAus(stelleId: string, e: EinheitEingabe, i: number): Einheit {
  if (typeof e === "string") {
    const [typ = "", ...rest] = e.trim().split(/\s+/);
    return { id: `${stelleId}-e${i + 1}`, typ, rufname: rest.join(" "), zeichen: null };
  }
  return { id: `${stelleId}-e${i + 1}`, typ: e[0], rufname: e[1], zeichen: null };
}

export function baue(eingabe: { optionen?: Partial<PlanOptionen>; verbindungen?: Verbindung[]; stellen: StelleEingabe[] }): PlanInhalt {
  const zaehler = new Map<string, number>();
  const stellen: Stelle[] = eingabe.stellen.map((e) => {
    const eltern = e.eltern ?? null;
    const lage = e.lage ?? "unter";
    const schluessel = `${eltern ?? ""}|${lage}`;
    const reihenfolge = zaehler.get(schluessel) ?? 0;
    zaehler.set(schluessel, reihenfolge + 1);
    const kontakte: Kontakt[] = KONTAKT_REIHENFOLGE.flatMap((art) => {
      const w = e.kontakte?.[art];
      return w === undefined ? [] : (Array.isArray(w) ? w : [w]).map((wert) => ({ art, wert }));
    });
    return {
      id: e.id, eltern, lage, reihenfolge, zeichen: e.zeichen ?? null, titel: e.titel, leiter: e.leiter ?? null,
      hervorheben: e.hervorheben ?? false, verbindungId: e.verbindung ?? null, kanaele: e.kanaele ?? [], kontakte,
      einheiten: (e.einheiten ?? []).map((x, i) => einheitAus(e.id, x, i)),
    };
  });
  return planInhaltSchema.parse({
    schema: 1,
    optionen: { leerzeilen: false, vermerkVsNfD: true, qrAufDruck: false, schwarzweiss: false, ...eingabe.optionen },
    stellen,
    verbindungen: eingabe.verbindungen ?? [],
  });
}
