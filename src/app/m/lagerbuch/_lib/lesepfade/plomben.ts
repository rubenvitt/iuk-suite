/**
 * Plomben einer Einheit (IDA-222) — Stammdaten fuer Verwaltung und Check.
 */
import { and, asc, eq } from "drizzle-orm";
import { plomben } from "../../_db/schema";
import type { Leser } from "./bestand";

export type PlombeZeile = {
  id: string;
  bezeichnung: string;
  fachLabel: string | null;
  nummer: string | null;
  gesetztAt: Date | null;
  aktiv: boolean;
  sortierung: number;
};

/** Die Plomben einer Einheit, in der Reihenfolge der Verwaltung. */
export function plombenFuerLagerort(
  db: Leser, lagerortId: string, opt: { nurAktive?: boolean } = {},
): PlombeZeile[] {
  const nurAktive = opt.nurAktive ?? true;
  return db.select().from(plomben)
    .where(nurAktive
      ? and(eq(plomben.lagerortId, lagerortId), eq(plomben.aktiv, true))
      : eq(plomben.lagerortId, lagerortId))
    .orderBy(asc(plomben.sortierung), asc(plomben.bezeichnung), asc(plomben.id))
    .all()
    .map((p) => ({
      id: p.id, bezeichnung: p.bezeichnung, fachLabel: p.fachLabel, nummer: p.nummer,
      gesetztAt: p.gesetztAt, aktiv: p.aktiv, sortierung: p.sortierung,
    }));
}

export { plombeDecktAb, plombenNummerNorm } from "../plombe";
