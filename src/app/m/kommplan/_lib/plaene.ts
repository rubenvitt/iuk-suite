import { notFound } from "next/navigation";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { zeitFormat } from "@/core/zeit";
import type { KommplanDb } from "../_db/client";
import { plan, type PlanZeile } from "../_db/schema";
import { msZuTag, TYP_NAME, type Planangaben } from "./angaben";
import { leseInhalt, type PlanInhalt } from "./plan/schema";
import { kalendertag, planAngabenZeile, STAND_ZEIT } from "./rahmen";
import { mitgliedIn, rechteFuer, sichtbarFuer, type Person, type PlanRechte, type Sichtbarkeit } from "./rechte";

export interface Listenzeile {
  id: string; titel: string; typ: string; datum: string | null; stand: string; vorlage: boolean; lesbar: boolean; archiviert: string | null;
  privat: boolean; darf: Pick<PlanRechte, "bearbeiten" | "verwalten">;
}
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

/**
 * Drei Listen (Entscheidungen 7, 10): Pläne und Vorlagen getrennt, das Archiv für sich — neueste Archivierung zuerst.
 * Nur, was `wer` sehen darf (`_lib/rechte.ts`): die geteilten und die eigenen privaten; schon in der Abfrage, damit
 * kein fremder privater Titel je die Datenbank verlässt.
 */
export function listePlaene(db: KommplanDb, liste: Liste, wer: Person): Listenzeile[] {
  const wo = and(sichtbarFuer(wer), liste === "archiv" ? isNotNull(plan.archiviertAm)
    : and(isNull(plan.archiviertAm), eq(plan.istVorlage, liste === "vorlagen")));
  const reihe = liste === "archiv" ? [desc(plan.archiviertAm), plan.id] : [desc(plan.aktualisiertAm), plan.id];
  const zeilen = db.select().from(plan).where(wo).orderBy(...reihe).all();
  const mitglied = mitgliedIn(db, wer.nutzer);
  return zeilen.map((z) => {
    const r = rechteFuer({ sichtbarkeit: z.sichtbarkeit, eigentuemer: z.eigentuemer, mitglied: mitglied.has(z.id) }, wer);
    return {
      id: z.id, titel: z.titel, typ: TYP_NAME[z.typ],
      datum: kalendertag(z.datum?.getTime() ?? null), stand: STAND_ZEIT.format(z.aktualisiertAm),
      vorlage: z.istVorlage, lesbar: lies(z).inhalt !== null,
      archiviert: z.archiviertAm ? archivTag(z.archiviertAm.getTime()) : null,
      privat: z.sichtbarkeit === "privat", darf: { bearbeiten: r.bearbeiten, verwalten: r.verwalten },
    };
  });
}

/** Tag der Archivierung in der Suite-Zone — Archivspalte und Hinweis am archivierten Plan (Task 13). */
export function archivTag(ms: number): string {
  return TAG.format(ms);
}

export interface LesbarerPlan extends GeladenerPlan { archiviertAm: number | null; istVorlage: boolean; sichtbarkeit: Sichtbarkeit; eigentuemer: string | null }

/**
 * DER EINZIGE LESEWEG EINES PLANS, auch archiviert (Entscheidung 10): objektbezogenes 404 im Layout, Planseite
 * (Betrachter mit Archivhinweis), Druck, Token-Links. „Nur aktive" sichert JEDER Aufrufer selbst, nie diese Funktion:
 * Speichern über `ladeStand` und das bedingte UPDATE (`isNull(plan.archiviertAm)`), Token-Links in `loeseToken`
 * (Join und erneute Prüfung), der interne QR in `qrZielIntern`. Das frühere `ladePlan` (nur aktive) benutzte seit
 * Phase 4 kein Produktionspfad mehr und ist entfernt (Abnahme).
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
    sichtbarkeit: z.sichtbarkeit, eigentuemer: z.eigentuemer,
  };
}

export interface PlanMitRechten { plan: LesbarerPlan; rechte: PlanRechte }

/**
 * DER LESEWEG DER ANGEMELDETEN FLÄCHEN: `ladePlanLesend` plus die Rechte von `wer`. Was `wer` nicht sehen darf,
 * ist `null` — derselbe Ausgang wie ein Plan, den es nicht gibt (ein fremder privater Plan verrät sich nicht).
 * Die Token-Ansicht liest weiter über `ladePlanLesend`: dort ist der Link das Recht.
 */
export function ladePlanFuer(db: KommplanDb, id: string, wer: Person): PlanMitRechten | null {
  const p = ladePlanLesend(db, id);
  if (!p) return null;
  const rechte = rechteFuer({ sichtbarkeit: p.sichtbarkeit, eigentuemer: p.eigentuemer, mitglied: mitgliedIn(db, wer.nutzer, [id]).has(id) }, wer);
  return rechte.sehen ? { plan: p, rechte } : null;
}

export function ladePlanFuerOder404(db: KommplanDb, id: string, wer: Person): PlanMitRechten {
  const p = ladePlanFuer(db, id, wer);
  if (!p) notFound();
  return p;
}

export function beschreibungFuer(p: GeladenerPlan): string {
  return planAngabenZeile(p, p.aktualisiertAm);
}
