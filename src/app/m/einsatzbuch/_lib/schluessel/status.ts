import type { Db } from "../stammdaten/daten";
import { istEntwicklungsKek, kekAusUmgebung } from "./kek";
import { echtesPaar, entschluesselePrivat } from "./paar";

export interface Schluesselstatus {
  kek: "ok" | "fehlt" | "ungueltig";
  paar: "fehlt" | "ok" | "kek_passt_nicht" | "unbekannt";
  schluesselId: string | null;
  /**
   * `true`, wenn der gesetzte KEK der Entwicklungs-KEK ist UND die Suite mit
   * `NODE_ENV=production` läuft (Container-Image). Lokal ist er gewollt (Seed) und bleibt `false`.
   */
  entwicklungsKekInProduktion: boolean;
}

/**
 * Status für die Übersichtsseite (Plan Stufe 2, Entscheidungen 5 und 10): `paar: "unbekannt"`
 * heißt, der KEK ist nicht `"ok"`, es existiert aber ein Paar — ob der KEK zu ihm passen würde,
 * lässt sich ohne gültigen KEK nicht prüfen.
 */
export async function schluesselStatus(db: Db, env: Record<string, string | undefined> = process.env): Promise<Schluesselstatus> {
  const k = kekAusUmgebung(env);
  const entwicklungsKekInProduktion = k.status === "ok" && istEntwicklungsKek(k.kek) && env.NODE_ENV === "production";
  const p = echtesPaar(db);
  if (!p) return { kek: k.status, paar: "fehlt", schluesselId: null, entwicklungsKekInProduktion };
  if (k.status !== "ok") return { kek: k.status, paar: "unbekannt", schluesselId: p.schluesselId, entwicklungsKekInProduktion };
  try {
    await entschluesselePrivat(p.privatVerschluesselt, p.schluesselId, k.kek);
    return { kek: "ok", paar: "ok", schluesselId: p.schluesselId, entwicklungsKekInProduktion };
  } catch {
    return { kek: "ok", paar: "kek_passt_nicht", schluesselId: p.schluesselId, entwicklungsKekInProduktion };
  }
}
