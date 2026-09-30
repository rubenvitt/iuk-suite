import { anzeigereihenfolge } from "../layout/gruppen";
import { baueBaum, nachkommen, tiefensuche } from "./baum";
import { planInhaltSchema, type Lage, type PlanInhalt, type PlanOptionen, type Stelle, type Verbindung } from "./schema";

/**
 * Reine Planoperationen (Spec §6.6): Eingabe bleibt unverändert, Ausgabe ist gültig oder die
 * Operation wirft `PlanFehler`. Phase 2 ergänzt Einfügen, Ändern, Löschen und Umhängen für den
 * Editor; das Gliederungs-Einfügen folgt in Phase 3 in `einfuegen.ts`.
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

export function gueltig(roh: PlanInhalt): PlanInhalt {
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

export function stelleOder(inhalt: PlanInhalt, id: string): Stelle {
  const s = inhalt.stellen.find((x) => x.id === id);
  if (!s) throw new PlanFehler(`Stelle ${id} gibt es nicht`);
  return s;
}

/** Eine neue, leere Stelle — der Titel kommt danach im Flyin (Spec §6.3: „sofort gesetzt"). */
function leer(id: string, eltern: string | null, lage: Lage, reihenfolge: number, verbindungId: string | null): Stelle {
  return {
    id, eltern, lage, reihenfolge, zeichen: null, titel: "", leiter: null, hervorheben: false,
    verbindungId, kanaele: [], kontakte: [], einheiten: [],
  };
}

export function fuegeWurzelEin(inhalt: PlanInhalt, id: string): PlanInhalt {
  return gueltig({ ...inhalt, stellen: [...inhalt.stellen, leer(id, null, "unter", naechsteReihenfolge(inhalt, null, "unter"), null)] });
}

/**
 * Entscheidung 7 (Phase 2): die neue Unterstelle tritt dem Bus der in ANZEIGEREIHENFOLGE letzten
 * Unterstelle bei — so steht sie rechts außen an einem vorhandenen Bus statt eine neue Gruppe zu
 * öffnen. `anzeigereihenfolge` ist dieselbe Funktion, nach der das Layout die Gruppen setzt.
 */
export function fuegeUnterstelleEin(inhalt: PlanInhalt, elternId: string, id: string): PlanInhalt {
  const eltern = stelleOder(inhalt, elternId);
  if (eltern.lage !== "unter") throw new PlanFehler("Eine Seitenstelle trägt keine Unterstellen.");
  const letzte = anzeigereihenfolge(baueBaum(inhalt).unter(elternId)).at(-1);
  const neu = leer(id, elternId, "unter", naechsteReihenfolge(inhalt, elternId, "unter"), letzte?.verbindungId ?? null);
  return gueltig({ ...inhalt, stellen: [...inhalt.stellen, neu] });
}

export function fuegeSeitenstelleEin(inhalt: PlanInhalt, elternId: string, seite: "links" | "rechts", id: string): PlanInhalt {
  const eltern = stelleOder(inhalt, elternId);
  if (eltern.lage !== "unter") throw new PlanFehler("Eine Seitenstelle trägt keine Seitenstellen.");
  return gueltig({ ...inhalt, stellen: [...inhalt.stellen, leer(id, elternId, seite, naechsteReihenfolge(inhalt, elternId, seite), null)] });
}

export type StellenAenderung = Partial<Pick<Stelle, "titel" | "leiter" | "hervorheben" | "zeichen" | "kontakte" | "kanaele" | "verbindungId">>;

export function aendereStelle(inhalt: PlanInhalt, id: string, aenderung: StellenAenderung): PlanInhalt {
  stelleOder(inhalt, id);
  return gueltig({ ...inhalt, stellen: inhalt.stellen.map((s) => (s.id === id ? { ...s, ...aenderung } : s)) });
}

/** Entscheidung 8: der ganze Teilbaum samt Seitenstellen; Verbindungen bleiben (unbenutzt = Reserve). */
export function loescheStelle(inhalt: PlanInhalt, id: string): { inhalt: PlanInhalt; entfernt: number } {
  stelleOder(inhalt, id);
  const weg = new Set([id, ...nachkommen(baueBaum(inhalt), id).map((s) => s.id)]);
  return { inhalt: gueltig({ ...inhalt, stellen: inhalt.stellen.filter((s) => !weg.has(s.id)) }), entfernt: weg.size };
}

export function setzeOptionen(inhalt: PlanInhalt, aenderung: Partial<Pick<PlanOptionen, "leerzeilen" | "vermerkVsNfD">>): PlanInhalt {
  return gueltig({ ...inhalt, optionen: { ...inhalt.optionen, ...aenderung } });
}

/** Ziele für „Untersteht": keine Seitenstelle (trägt nichts), nicht die Stelle selbst, keiner ihrer Nachkommen. */
export function moeglicheEltern(inhalt: PlanInhalt, id: string): Stelle[] {
  const baum = baueBaum(inhalt);
  const aus = new Set([id, ...nachkommen(baum, id).map((s) => s.id)]);
  return tiefensuche(baum).filter((s) => s.lage === "unter" && !aus.has(s.id));
}

export function haengeUm(inhalt: PlanInhalt, id: string, ziel: { eltern: string | null; lage: Lage }): PlanInhalt {
  const s = stelleOder(inhalt, id);
  if (s.eltern === ziel.eltern && s.lage === ziel.lage) return inhalt;
  if (ziel.eltern === null && ziel.lage !== "unter") throw new PlanFehler("Eine Seitenstelle braucht eine Elternstelle.");
  const baum = baueBaum(inhalt);
  if (ziel.eltern !== null) {
    const eltern = stelleOder(inhalt, ziel.eltern);
    if (ziel.eltern === id || nachkommen(baum, id).some((n) => n.id === ziel.eltern)) {
      throw new PlanFehler("Eine Stelle kann nicht unter sich selbst oder einer eigenen Unterstelle stehen.");
    }
    if (eltern.lage !== "unter") throw new PlanFehler("Eine Seitenstelle trägt keine Unterstellen.");
  }
  if (ziel.lage !== "unter" && nachkommen(baum, id).length > 0) {
    throw new PlanFehler("Eine Stelle mit Unter- oder Seitenstellen kann nicht seitlich stehen.");
  }
  const reihenfolge = naechsteReihenfolge(inhalt, ziel.eltern, ziel.lage);
  // Oberste Ebene: kein Weg nach oben — eine stehengebliebene verbindungId zählte sonst als Nutzung (Review Focus 4).
  const verbindungId = ziel.eltern === null ? null : s.verbindungId;
  return gueltig({ ...inhalt, stellen: inhalt.stellen.map((x) => (x.id === id ? { ...x, eltern: ziel.eltern, lage: ziel.lage, reihenfolge, verbindungId } : x)) });
}
