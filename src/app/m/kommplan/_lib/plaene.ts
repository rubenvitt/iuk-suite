import { notFound } from "next/navigation";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { zeitFormat } from "@/core/zeit";
import type { KommplanDb } from "../_db/client";
import { plan, type PlanZeile } from "../_db/schema";
import { msZuTag, TYP_NAME, type Planangaben } from "./angaben";
import { leseInhalt, type PlanInhalt } from "./plan/schema";
import { kalendertag } from "./rahmen";

const STAND = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export interface Listenzeile { id: string; titel: string; typ: string; datum: string | null; stand: string; vorlage: boolean; lesbar: boolean; archiviert: string | null }
export interface GeladenerPlan {
  id: string; titel: string; typ: PlanZeile["typ"]; anlass: string | null; datum: number | null;
  aktualisiertAm: number; aktualisiertVon: string; inhalt: PlanInhalt | null; fehler: string | null;
  version: number; angaben: Planangaben;
}

export function lies(zeile: PlanZeile): { inhalt: PlanInhalt | null; fehler: string | null } {
  let roh: unknown;
  try { roh = JSON.parse(zeile.inhalt); } catch { return { inhalt: null, fehler: "Der gespeicherte Inhalt ist kein JSON." }; }
  const r = leseInhalt(roh);
  return r.ok ? { inhalt: r.inhalt, fehler: null } : { inhalt: null, fehler: r.fehler };
}

export type Liste = "plaene" | "vorlagen" | "archiv";
const TAG = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Drei Listen (Entscheidungen 7, 10): Pläne und Vorlagen getrennt, das Archiv für sich — neueste Archivierung zuerst. */
export function listePlaene(db: KommplanDb, liste: Liste = "plaene"): Listenzeile[] {
  const wo = liste === "archiv" ? isNotNull(plan.archiviertAm)
    : and(isNull(plan.archiviertAm), eq(plan.istVorlage, liste === "vorlagen"));
  const reihe = liste === "archiv" ? [desc(plan.archiviertAm), plan.id] : [desc(plan.aktualisiertAm), plan.id];
  return db.select().from(plan).where(wo).orderBy(...reihe).all().map((z) => ({
    id: z.id, titel: z.titel, typ: TYP_NAME[z.typ],
    datum: kalendertag(z.datum?.getTime() ?? null), stand: STAND.format(z.aktualisiertAm),
    vorlage: z.istVorlage, lesbar: lies(z).inhalt !== null,
    archiviert: z.archiviertAm ? archivTag(z.archiviertAm.getTime()) : null,
  }));
}

/** Tag der Archivierung in der Suite-Zone — Archivspalte und Hinweis am archivierten Plan (Task 13). */
export function archivTag(ms: number): string {
  return TAG.format(ms);
}

export function ladePlan(db: KommplanDb, id: string): GeladenerPlan | null {
  const z = db.select().from(plan).where(eq(plan.id, id)).get();
  if (!z || z.archiviertAm !== null) return null;
  return {
    id: z.id, titel: z.titel, typ: z.typ, anlass: z.anlass, datum: z.datum?.getTime() ?? null,
    aktualisiertAm: z.aktualisiertAm.getTime(), aktualisiertVon: z.aktualisiertVon, ...lies(z),
    version: z.version,
    angaben: { titel: z.titel, typ: z.typ, anlass: z.anlass, datum: msZuTag(z.datum?.getTime() ?? null) },
  };
}

/** Plan-ID aus der URL, aufgelöst gegen die Datenbank; unbekannt oder archiviert → 404 (notFound bleibt in _lib). */
export function ladePlanOder404(db: KommplanDb, id: string): GeladenerPlan {
  const p = ladePlan(db, id);
  if (!p) notFound();
  return p;
}

export interface LesbarerPlan extends GeladenerPlan { archiviertAm: number | null; istVorlage: boolean }

/**
 * NUR LESEN, auch archiviert (Entscheidung 10): für das objektbezogene 404 im Layout, die Planseite (Betrachter
 * mit Archivhinweis) und den Druck. Editor, Speichern und später Token-Links bleiben bei `ladePlan` (nur aktive).
 */
export function ladePlanLesend(db: KommplanDb, id: string): LesbarerPlan | null {
  const z = db.select().from(plan).where(eq(plan.id, id)).get();
  if (!z) return null;
  return {
    id: z.id, titel: z.titel, typ: z.typ, anlass: z.anlass, datum: z.datum?.getTime() ?? null,
    aktualisiertAm: z.aktualisiertAm.getTime(), aktualisiertVon: z.aktualisiertVon, ...lies(z),
    version: z.version,
    angaben: { titel: z.titel, typ: z.typ, anlass: z.anlass, datum: msZuTag(z.datum?.getTime() ?? null) },
    archiviertAm: z.archiviertAm?.getTime() ?? null, istVorlage: z.istVorlage,
  };
}

export function ladePlanLesendOder404(db: KommplanDb, id: string): LesbarerPlan {
  const p = ladePlanLesend(db, id);
  if (!p) notFound();
  return p;
}

export function beschreibungFuer(p: GeladenerPlan): string {
  return [TYP_NAME[p.typ], p.anlass, kalendertag(p.datum), `Stand ${STAND.format(p.aktualisiertAm)}`].filter(Boolean).join(" · ");
}
