import { notFound } from "next/navigation";
import { desc, eq, isNull } from "drizzle-orm";
import { zeitFormat } from "@/core/zeit";
import type { KommplanDb } from "../_db/client";
import { plan, type PlanZeile } from "../_db/schema";
import { leseInhalt, type PlanInhalt } from "./plan/schema";
import { kalendertag } from "./rahmen";

const STAND = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const TYP = { kommunikationsplan: "Kommunikationsplan", fernmeldeskizze: "Fernmeldeskizze" } as const;

export interface Listenzeile { id: string; titel: string; typ: string; datum: string | null; stand: string; vorlage: boolean; lesbar: boolean }
export interface GeladenerPlan {
  id: string; titel: string; typ: PlanZeile["typ"]; anlass: string | null; datum: number | null;
  aktualisiertAm: number; aktualisiertVon: string; inhalt: PlanInhalt | null; fehler: string | null;
}

function lies(zeile: PlanZeile): { inhalt: PlanInhalt | null; fehler: string | null } {
  let roh: unknown;
  try { roh = JSON.parse(zeile.inhalt); } catch { return { inhalt: null, fehler: "Der gespeicherte Inhalt ist kein JSON." }; }
  const r = leseInhalt(roh);
  return r.ok ? { inhalt: r.inhalt, fehler: null } : { inhalt: null, fehler: r.fehler };
}

export function listePlaene(db: KommplanDb): Listenzeile[] {
  return db.select().from(plan).where(isNull(plan.archiviertAm)).orderBy(desc(plan.aktualisiertAm), plan.id).all().map((z) => ({
    id: z.id, titel: z.titel, typ: TYP[z.typ],
    datum: kalendertag(z.datum?.getTime() ?? null), stand: STAND.format(z.aktualisiertAm),
    vorlage: z.istVorlage, lesbar: lies(z).inhalt !== null,
  }));
}

export function ladePlan(db: KommplanDb, id: string): GeladenerPlan | null {
  const z = db.select().from(plan).where(eq(plan.id, id)).get();
  if (!z || z.archiviertAm !== null) return null;
  return {
    id: z.id, titel: z.titel, typ: z.typ, anlass: z.anlass, datum: z.datum?.getTime() ?? null,
    aktualisiertAm: z.aktualisiertAm.getTime(), aktualisiertVon: z.aktualisiertVon, ...lies(z),
  };
}

/** Plan-ID aus der URL, aufgelöst gegen die Datenbank; unbekannt oder archiviert → 404 (notFound bleibt in _lib). */
export function ladePlanOder404(db: KommplanDb, id: string): GeladenerPlan {
  const p = ladePlan(db, id);
  if (!p) notFound();
  return p;
}

export function beschreibungFuer(p: GeladenerPlan): string {
  return [TYP[p.typ], p.anlass, kalendertag(p.datum), `Stand ${STAND.format(p.aktualisiertAm)}`].filter(Boolean).join(" · ");
}
