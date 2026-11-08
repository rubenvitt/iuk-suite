/**
 * Was gerade aus einer Materialkiste unterwegs ist (IDA-372). Nur Lesen; die Schreibpfade stehen in `ausleihe.ts`.
 * Eigene Datei, damit `schreiben.ts` den Stand prüfen kann, ohne dass sich die Importe im Kreis drehen.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { WartungDb } from "../_db/client";
import { entnahme, entnahmePosition } from "../_db/schema";

export interface OffeneEntnahme {
  id: string;
  wer: string;
  nutzer: string;
  zweck: string;
  ganz: boolean;
  seit: number;
  /** `offen`: was noch zurückkommt; 0 bei einer Position, deren Rest als fehlend gemeldet ist. */
  positionen: { id: string; inhaltId: string | null; text: string; menge: number; zurueck: number; offen: number }[];
}

export interface Unterwegs {
  /** Die offene ganze Entnahme, sonst null. */
  ganz: OffeneEntnahme | null;
  /** inhaltId → unterwegs (bei ganz: jeweils die entnommene Menge). */
  jePosition: Map<string, number>;
  /** Alle offenen, älteste zuerst. */
  entnahmen: OffeneEntnahme[];
}

export function unterwegsStand(db: Pick<WartungDb, "select">, geraetId: string): Unterwegs {
  const kopf = db.select().from(entnahme).where(and(eq(entnahme.geraetId, geraetId), isNull(entnahme.zurueckAm))).orderBy(asc(entnahme.entnommenAm), asc(entnahme.id)).all();
  const pos = kopf.length ? db.select().from(entnahmePosition).where(inArray(entnahmePosition.entnahmeId, kopf.map((e) => e.id))).all() : [];
  const entnahmen: OffeneEntnahme[] = kopf.map((e) => ({
    id: e.id, wer: e.wer, nutzer: e.nutzer, zweck: e.zweck, ganz: e.ganz, seit: e.entnommenAm,
    positionen: pos.filter((p) => p.entnahmeId === e.id).map((p) => ({
      id: p.id, inhaltId: p.inhaltId, text: p.text, menge: p.menge, zurueck: p.zurueck, offen: p.fehlt ? 0 : p.menge - p.zurueck,
    })),
  }));
  const jePosition = new Map<string, number>();
  for (const e of entnahmen) {
    for (const p of e.positionen) {
      if (p.inhaltId && p.offen > 0) jePosition.set(p.inhaltId, (jePosition.get(p.inhaltId) ?? 0) + p.offen);
    }
  }
  return { ganz: entnahmen.find((e) => e.ganz) ?? null, jePosition, entnahmen };
}

export function hatOffeneEntnahme(db: Pick<WartungDb, "select">, geraetId: string): boolean {
  return db.select({ id: entnahme.id }).from(entnahme).where(and(eq(entnahme.geraetId, geraetId), isNull(entnahme.zurueckAm))).limit(1).get() !== undefined;
}

export type PruefungModus =
  | { art: "frei" }
  | { art: "rueckgabe"; id: string }
  | { art: "unterwegs"; seit: number; id: string };

/** Was die Prüfseite zeigt: nur eine Kiste wird gegen `rueckgabe` durchgezählt; ein ganz entnommenes Gerät wird zurückgelegt. */
export function pruefungModus(kiste: boolean, u: Unterwegs, rueckgabe: string | undefined): PruefungModus {
  if (!u.ganz) return { art: "frei" };
  if (kiste && rueckgabe === u.ganz.id) return { art: "rueckgabe", id: u.ganz.id };
  return { art: "unterwegs", seit: u.ganz.seit, id: u.ganz.id };
}
