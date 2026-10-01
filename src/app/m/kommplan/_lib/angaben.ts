import { z } from "zod";
import type { FeldFehler } from "./ergebnis";
import { LAENGE } from "./plan/schema";

/**
 * PLANANGABEN (Spec §4.1): Spalten der Tabelle `plan`, nicht Teil des Dokuments. Geprüft auf dem
 * Server (`speichern.ts`) und am Formular (`NeuerPlan`, `PlanFlyin`) mit demselben Schema. Kein
 * `next/*`, kein `"use client"` — beide Seiten lesen diese Datei (Falle 6).
 *
 * `datum` ist ein KALENDERTAG „YYYY-MM-DD", gespeichert als Mitternacht UTC. Umgerechnet wird
 * deshalb in UTC, nie in der Suite-Zone (Ausnahme in `CLAUDE.md`, „Zeitzone").
 */
export const PLAN_TYPEN = ["kommunikationsplan", "fernmeldeskizze"] as const;
export type PlanTyp = (typeof PLAN_TYPEN)[number];
export const TYP_NAME: Record<PlanTyp, string> = { kommunikationsplan: "Kommunikationsplan", fernmeldeskizze: "Fernmeldeskizze" };
export const LAENGE_ANLASS = 120;
/** Organisationsname im Briefkopf (Spec §4.4). */ export const LAENGE_ORGANISATION = 120;
export interface Planangaben { titel: string; typ: PlanTyp; anlass: string | null; datum: string | null }

export function tagZuMs(tag: string): number {
  return Date.UTC(Number(tag.slice(0, 4)), Number(tag.slice(5, 7)) - 1, Number(tag.slice(8, 10)));
}
export function msZuTag(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString().slice(0, 10);
}
const leerZuNull = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v);

export const angabenSchema = z.object({
  titel: z.string().trim().min(1, "Bitte einen Titel eintragen.").max(LAENGE.titel, `Höchstens ${LAENGE.titel} Zeichen.`),
  typ: z.enum(PLAN_TYPEN, { error: "Bitte eine Art wählen." }),
  anlass: z.preprocess(leerZuNull, z.string().max(LAENGE_ANLASS, `Höchstens ${LAENGE_ANLASS} Zeichen.`).nullable()),
  datum: z.preprocess(leerZuNull, z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum wählen.")
    // Nur wohlgeformte Tage prüfen: zod 4 läuft nach einem gescheiterten `regex` weiter, und
    // `new Date(NaN).toISOString()` würfe — die Formatmeldung oben gewinnt (erste je Feld).
    .refine((t) => !/^\d{4}-\d{2}-\d{2}$/.test(t) || msZuTag(tagZuMs(t)) === t, "Diesen Tag gibt es nicht.")
    .nullable()),
}).strict();

/** Erster Fehler je Feld (Vorbild `einsatzbuch/_lib/actionErgebnis.ts`, `zodFehler`). */
export function feldFehlerAus(e: z.ZodError): FeldFehler {
  const karte: FeldFehler = {};
  for (const p of e.issues) {
    const feld = p.path.join(".") || "_";
    if (!(feld in karte)) karte[feld] = p.message;
  }
  return karte;
}
