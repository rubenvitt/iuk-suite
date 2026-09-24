import type { Db } from "../stammdaten/daten";
import { kekAusUmgebung } from "./kek";
import { echtesPaar, entschluesselePrivat } from "./paar";

export interface Schluesselstatus {
  kek: "ok" | "fehlt" | "ungueltig";
  paar: "fehlt" | "ok" | "kek_passt_nicht" | "unbekannt";
  schluesselId: string | null;
}

/**
 * Status für die Übersichtsseite (Plan Stufe 2, Entscheidungen 5 und 10): `paar: "unbekannt"`
 * heißt, der KEK ist nicht `"ok"`, es existiert aber ein Paar — ob der KEK zu ihm passen würde,
 * lässt sich ohne gültigen KEK nicht prüfen.
 */
export async function schluesselStatus(db: Db, env: Record<string, string | undefined> = process.env): Promise<Schluesselstatus> {
  const k = kekAusUmgebung(env);
  const p = echtesPaar(db);
  if (!p) return { kek: k.status, paar: "fehlt", schluesselId: null };
  if (k.status !== "ok") return { kek: k.status, paar: "unbekannt", schluesselId: p.schluesselId };
  try {
    await entschluesselePrivat(p.privatVerschluesselt, p.schluesselId, k.kek);
    return { kek: "ok", paar: "ok", schluesselId: p.schluesselId };
  } catch {
    return { kek: "ok", paar: "kek_passt_nicht", schluesselId: p.schluesselId };
  }
}
