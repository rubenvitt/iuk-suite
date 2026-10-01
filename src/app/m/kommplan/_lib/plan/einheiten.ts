import { gueltig, PlanFehler, stelleOder } from "./operationen";
import { GRENZE, type Einheit, type PlanInhalt, type Stelle } from "./schema";

function mitEinheiten(inhalt: PlanInhalt, stelleId: string, f: (e: Einheit[]) => Einheit[]): PlanInhalt {
  stelleOder(inhalt, stelleId);
  return gueltig({ ...inhalt, stellen: inhalt.stellen.map((s): Stelle => (s.id === stelleId ? { ...s, einheiten: f(s.einheiten) } : s)) });
}

function einheitOder(liste: Einheit[], id: string): Einheit {
  const e = liste.find((x) => x.id === id);
  if (!e) throw new PlanFehler(`Einheit ${id} gibt es an dieser Stelle nicht`);
  return e;
}

export function fuegeEinheitenEin(inhalt: PlanInhalt, stelleId: string, neu: Einheit[]): PlanInhalt {
  const zahl = stelleOder(inhalt, stelleId).einheiten.length + neu.length;
  if (zahl > GRENZE.einheiten) throw new PlanFehler(`Höchstens ${GRENZE.einheiten} Einheiten je Stelle — hier wären es ${zahl}.`);
  return mitEinheiten(inhalt, stelleId, (alt) => [...alt, ...neu]);
}

export function aendereEinheit(inhalt: PlanInhalt, stelleId: string, einheitId: string, aenderung: Partial<Pick<Einheit, "typ" | "rufname" | "zeichen">>): PlanInhalt {
  return mitEinheiten(inhalt, stelleId, (alt) => {
    einheitOder(alt, einheitId);
    return alt.map((e) => (e.id === einheitId ? { ...e, ...aenderung } : e));
  });
}

export function loescheEinheit(inhalt: PlanInhalt, stelleId: string, einheitId: string): PlanInhalt {
  return mitEinheiten(inhalt, stelleId, (alt) => {
    einheitOder(alt, einheitId);
    return alt.filter((e) => e.id !== einheitId);
  });
}
