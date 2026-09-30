import { planInhaltSchema, type Lage, type PlanInhalt, type Stelle, type Verbindung } from "./schema";

/**
 * Reine Planoperationen (Spec §6.6): Eingabe bleibt unverändert, Ausgabe ist gültig oder die
 * Operation wirft `PlanFehler`. Phase 1 braucht nur Einfügen (Seed, Beispiele, Tests); Umhängen,
 * Löschen und das Gliederungs-Einfügen folgen in Phase 2 und 3 in dieser Datei.
 */
export class PlanFehler extends Error {
  constructor(nachricht: string) { super(nachricht); this.name = "PlanFehler"; }
}

export function leererPlan(): PlanInhalt {
  return {
    schema: 1,
    optionen: { leerzeilen: false, vermerkVsNfD: true, qrAufDruck: false, schwarzweiss: false },
    stellen: [],
    verbindungen: [],
  };
}

function gueltig(roh: PlanInhalt): PlanInhalt {
  const r = planInhaltSchema.safeParse(roh);
  if (!r.success) throw new PlanFehler(r.error.issues.map((i) => i.message).join("; "));
  return r.data;
}

export function naechsteReihenfolge(inhalt: PlanInhalt, eltern: string | null, lage: Lage): number {
  const geschwister = inhalt.stellen.filter((s) => s.eltern === eltern && s.lage === lage);
  return geschwister.length === 0 ? 0 : Math.max(...geschwister.map((s) => s.reihenfolge)) + 1;
}

export type NeueStelle = Partial<Omit<Stelle, "id" | "titel">> & { id: string; titel: string };

export function fuegeStelleEin(inhalt: PlanInhalt, neu: NeueStelle): PlanInhalt {
  const eltern = neu.eltern ?? null;
  const lage = neu.lage ?? "unter";
  const stelle: Stelle = {
    id: neu.id, eltern, lage,
    reihenfolge: neu.reihenfolge ?? naechsteReihenfolge(inhalt, eltern, lage),
    zeichen: neu.zeichen ?? null, titel: neu.titel, leiter: neu.leiter ?? null,
    hervorheben: neu.hervorheben ?? false, verbindungId: neu.verbindungId ?? null,
    kanaele: neu.kanaele ?? [], kontakte: neu.kontakte ?? [], einheiten: neu.einheiten ?? [],
  };
  return gueltig({ ...inhalt, stellen: [...inhalt.stellen, stelle] });
}

export function fuegeVerbindungEin(inhalt: PlanInhalt, v: Verbindung): PlanInhalt {
  return gueltig({ ...inhalt, verbindungen: [...inhalt.verbindungen, v] });
}
