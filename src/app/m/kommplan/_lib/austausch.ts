import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { KommplanDb } from "../_db/client";
import { plan } from "../_db/schema";
import { angabenSchema, msZuTag, tagZuMs, type Planangaben } from "./angaben";
import { AUSTAUSCH_ENDUNG } from "./austauschGrenzen";
import { asciiTeil } from "./dateiname";
import type { LesbarerPlan } from "./plaene";
import { leseInhalt, type PlanInhalt } from "./plan/schema";
import type { Bearbeiter } from "./speichern";
import { heuteIso } from "./tagesfassung";

/**
 * DAS AUSTAUSCHFORMAT EINES PLANS (`.kommplan.json`) — Export und Import, nur Server.
 *
 * Eine Datei trägt genau einen Plan: Formatkennung, Formatversion, Angaben, ob er eine Vorlage ist, und den Inhalt
 * in derselben Form wie `plan.inhalt` (`_lib/plan/schema.ts`, mit eigener `schema`-Nummer). NICHT in der Datei:
 * Eigentümer, Sichtbarkeit, Eingeladene, Links, Version und „Stand" — das gehört der Ablage, nicht dem Plan, und ein
 * Link oder eine Kennung in einer weitergegebenen Datei wäre ein Zugang bzw. ein personenbezogenes Datum.
 *
 * Ein Import legt IMMER einen neuen, privaten Plan an (`_lib/rechte.ts`), nie ein Überschreiben: die Datei kann aus
 * einer anderen Installation stammen, und ihre ID bedeutet hier nichts. Geprüft wird mit denselben Schemata wie beim
 * Speichern — eine Datei, die der Editor nicht speichern könnte, kommt nicht hinein.
 *
 * VERSIONEN: `version` zählt hoch, wenn sich die Hülle ändert. Eine neuere als `AUSTAUSCH_VERSION` wird abgewiesen
 * (sie könnte Felder tragen, die hier still verloren gingen), ältere werden gelesen, solange es sie gibt.
 */
export const AUSTAUSCH_FORMAT = "iuk-kommplan-plan";
export const AUSTAUSCH_VERSION = 1;

export interface PlanDatei {
  format: typeof AUSTAUSCH_FORMAT; version: number; exportiertAm: string;
  plan: Planangaben & { vorlage: boolean; inhalt: PlanInhalt };
}
export type ExportErgebnis = { ok: true; datei: PlanDatei; dateiname: string } | { ok: false; fehler: string };
export type PlanImportErgebnis = { ok: true; id: string; vorlage: boolean } | { ok: false; fehler: string };
export type ImportLesung = { ok: true; angaben: Planangaben; vorlage: boolean; inhalt: PlanInhalt } | { ok: false; fehler: string };

export function planDatei(p: LesbarerPlan & { inhalt: PlanInhalt }, jetzt: number): PlanDatei {
  return {
    format: AUSTAUSCH_FORMAT, version: AUSTAUSCH_VERSION, exportiertAm: new Date(jetzt).toISOString(),
    plan: { titel: p.titel, typ: p.typ, anlass: p.anlass, datum: msZuTag(p.datum), vorlage: p.istVorlage, inhalt: p.inhalt },
  };
}

export function austauschDateiname(p: { titel: string; datum: number | null; aktualisiertAm: number }): string {
  const tag = p.datum !== null ? msZuTag(p.datum)! : heuteIso(p.aktualisiertAm);
  return `${asciiTeil(p.titel) || "kommunikationsplan"}_${tag}${AUSTAUSCH_ENDUNG}`;
}

const huelle = z.object({
  format: z.literal(AUSTAUSCH_FORMAT),
  version: z.number().int().min(1),
  exportiertAm: z.string().max(40).optional(),
  plan: z.object({ titel: z.unknown(), typ: z.unknown(), anlass: z.unknown(), datum: z.unknown(), vorlage: z.boolean().optional(), inhalt: z.unknown() }),
});

export function lesePlanDatei(roh: unknown): ImportLesung {
  const h = huelle.safeParse(roh);
  if (!h.success) {
    const format = typeof roh === "object" && roh !== null ? (roh as Record<string, unknown>).format : undefined;
    return { ok: false, fehler: format === AUSTAUSCH_FORMAT ? "Die Datei ist unvollständig." : "Das ist keine Plandatei der Kommunikationspläne." };
  }
  if (h.data.version > AUSTAUSCH_VERSION) return { ok: false, fehler: "Die Datei stammt aus einer neueren Fassung der Kommunikationspläne und lässt sich hier noch nicht lesen." };
  const { inhalt, vorlage, ...angaben } = h.data.plan;
  const a = angabenSchema.safeParse(angaben);
  if (!a.success) return { ok: false, fehler: `Die Planangaben in der Datei sind ungültig: ${a.error.issues[0]?.message ?? "unbekannter Fehler"}` };
  const i = leseInhalt(inhalt);
  if (!i.ok) return { ok: false, fehler: `Der Planinhalt in der Datei ist ungültig: ${i.fehler}` };
  return { ok: true, angaben: a.data, vorlage: vorlage ?? false, inhalt: i.inhalt };
}

/** Ein neuer privater Plan aus der Datei; eine Vorlage bleibt eine (privat, bis sie geteilt wird). */
export function importierePlan(db: KommplanDb, roh: unknown, wer: Bearbeiter, jetzt: number): PlanImportErgebnis {
  const r = lesePlanDatei(roh);
  if (!r.ok) return r;
  const id = randomUUID();
  db.insert(plan).values({
    id, titel: r.angaben.titel, typ: r.angaben.typ, anlass: r.angaben.anlass,
    datum: r.angaben.datum === null ? null : new Date(tagZuMs(r.angaben.datum)), istVorlage: r.vorlage,
    aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name, inhalt: JSON.stringify(r.inhalt),
    eigentuemer: wer.nutzer, sichtbarkeit: "privat",
  }).run();
  return { ok: true, id, vorlage: r.vorlage };
}
